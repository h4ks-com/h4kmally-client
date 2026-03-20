import { GameState } from "./state";
import type { GameCell } from "./state";
import type { Settings } from "./settings";
import { getSkinFile } from "../skinFileMap";
import { getEffect, cleanupEffectState } from "./effects";

const GRID_SPACING = 50;
const BORDER_WIDTH = 6;
const VIRUS_STROKE = "#33ff33";
const TEXT_STROKE = "#000";
const TEXT_FILL = "#fff";

// Jelly physics constants
const JELLY_POINTS_MIN = 5;
const JELLY_POINTS_MAX = 50;
const PI2 = Math.PI * 2;

const THEMES = {
  dark: {
    bg: "#111a22",
    grid: "rgba(255,255,255,0.06)",
    border: "#ff3333",
  },
  light: {
    bg: "#f2fbff",
    grid: "rgba(0,0,0,0.07)",
    border: "#ff0000",
  },
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private lastTime: number = 0;

  // Smoothed camera
  private camX = 0;
  private camY = 0;
  private camZoom = 1;

  // Mouse position in world coords (for sending MOUSE updates)
  mouseWorldX = 0;
  mouseWorldY = 0;

  // Mouse position in canvas pixels (for continuous world recalculation)
  private mouseScreenX = 0;
  private mouseScreenY = 0;

  // User-controlled zoom multiplier (mouse wheel)
  userZoom = 1;

  // Settings reference (updated from outside)
  settings: Settings;

  // Multibox: which slot is actively controlled (0=primary, 1=multi)
  multiboxSlot = 0;

  // Frame counter for periodic effect cleanup
  private frameCount = 0;

  // Server base URL for skin images (set after connect)
  serverBaseUrl = "";

  // Skin image cache: skin name → CanvasImageSource (static image or animated frames)
  private skinCache = new Map<string, HTMLImageElement>();
  private skinFailed = new Set<string>(); // skins that failed to load

  // Animated skin support: GIF frames decoded into ImageBitmaps
  private animSkins = new Map<string, { frames: ImageBitmap[]; delays: number[]; totalDuration: number }>();
  private animStart = performance.now(); // reference time for animation

  // Black hole warp state (computed once per frame in render())
  private blackholes: { x: number; y: number; size: number; id: number }[] = [];

  constructor(canvas: HTMLCanvasElement, state: GameState, settings: Settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.state = state;
    this.settings = settings;
  }

  /** Get current drawable for a skin (handles animated GIFs via ImageDecoder). */
  private getSkinImage(skinName: string): CanvasImageSource | null {
    if (!skinName || !this.serverBaseUrl || this.skinFailed.has(skinName)) return null;

    // Check for decoded animated frames first
    const anim = this.animSkins.get(skinName);
    if (anim && anim.frames.length > 0) {
      // Pick frame based on elapsed time
      const elapsed = (performance.now() - this.animStart) % anim.totalDuration;
      let accum = 0;
      for (let i = 0; i < anim.frames.length; i++) {
        accum += anim.delays[i];
        if (elapsed < accum) return anim.frames[i];
      }
      return anim.frames[anim.frames.length - 1];
    }

    // Static image cache
    const cached = this.skinCache.get(skinName);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;

    // Start loading
    const fileName = getSkinFile(skinName);
    const url = `${this.serverBaseUrl}/skins/${fileName}`;
    const isGif = fileName.toLowerCase().endsWith(".gif");

    if (isGif && typeof (window as any).ImageDecoder !== "undefined") {
      // Use ImageDecoder API to decode all GIF frames
      this.skinCache.set(skinName, new Image()); // placeholder to prevent re-fetch
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          const decoder = new (window as any).ImageDecoder({
            type: "image/gif",
            data: buf,
          });
          return decoder.completed.then(async () => {
            const count = decoder.tracks.selectedTrack.frameCount;
            const frames: ImageBitmap[] = [];
            const delays: number[] = [];
            for (let i = 0; i < count; i++) {
              const result = await decoder.decode({ frameIndex: i });
              const vf = result.image; // VideoFrame
              const delay = vf.duration ? vf.duration / 1000 : 100; // μs → ms
              delays.push(delay);
              // Convert VideoFrame to ImageBitmap for persistent caching
              const bmp = await createImageBitmap(vf);
              frames.push(bmp);
              vf.close();
            }
            const totalDuration = delays.reduce((a, b) => a + b, 0);
            this.animSkins.set(skinName, { frames, delays, totalDuration });
          });
        })
        .catch(() => {
          // Fallback: load as static image
          this.skinCache.delete(skinName);
          this.loadStaticSkin(skinName, url);
        });
    } else {
      this.loadStaticSkin(skinName, url);
    }

    return null; // not ready yet
  }

  /** Load a skin as a static image (non-animated). */
  private loadStaticSkin(skinName: string, url: string) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onerror = () => {
      this.skinFailed.add(skinName);
      this.skinCache.delete(skinName);
    };
    this.skinCache.set(skinName, img);
  }

  /** Collect all black hole cells for gravitational warp (call once per frame). */
  private collectBlackholes() {
    this.blackholes.length = 0;
    for (const cell of this.state.cells.values()) {
      if (cell.isPlayer && cell.effect === "blackhole") {
        this.blackholes.push({ x: cell.x, y: cell.y, size: Math.max(cell.size, 1), id: cell.id });
      }
    }
  }

  /** Warp a world-space point toward nearby black holes. */
  private warpPoint(px: number, py: number): [number, number] {
    let wx = px, wy = py;
    for (const bh of this.blackholes) {
      const dx = wx - bh.x;
      const dy = wy - bh.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const warpRadius = bh.size * 2.5;
      if (dist < 1 || dist > warpRadius) continue;
      const strength = bh.size * 0.6;
      const pull = strength / (dist * 0.8);
      // Smooth fade: 0 at edge of warp zone, 1 at center — eliminates the boundary jump
      const edgeT = 1 - dist / warpRadius; // 0 at edge, 1 at center
      const smoothFade = edgeT * edgeT * (3 - 2 * edgeT); // smoothstep for extra smoothness
      const factor = Math.min(pull, 0.7) * smoothFade;
      wx = bh.x + dx * (1 - factor);
      wy = bh.y + dy * (1 - factor);
    }
    return [wx, wy];
  }

  /** Check if a point is near any black hole's warp zone. */
  private nearBlackhole(px: number, py: number): boolean {
    for (const bh of this.blackholes) {
      const dx = px - bh.x, dy = py - bh.y;
      if (dx * dx + dy * dy < bh.size * bh.size * 6.25) return true;
    }
    return false;
  }

  /** Start the render loop. Returns a stop function. */
  start(): () => void {
    let running = true;
    const loop = (timestamp: number) => {
      if (!running) return;
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
      this.lastTime = timestamp;

      this.resize();
      this.state.interpolate(dt);
      this.state.updateSpectator(dt);
      this.updateCamera(dt);
      this.render();

      // Periodic effect state cleanup (every ~120 frames)
      this.frameCount++;
      if (this.frameCount % 120 === 0) {
        const allIds = new Set(this.state.cells.keys());
        cleanupEffectState(allIds);
      }

      requestAnimationFrame(loop);
    };
    this.lastTime = performance.now();
    requestAnimationFrame(loop);
    return () => {
      running = false;
    };
  }

  /** Convert screen coordinates to world coordinates. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const worldX = (sx - cw / 2) / this.camZoom + this.camX;
    const worldY = (sy - ch / 2) / this.camZoom + this.camY;
    return { x: worldX, y: worldY };
  }

  /** Update mouse world position from a mouse event. */
  updateMouse(ev: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreenX = (ev.clientX - rect.left) * (this.canvas.width / rect.width);
    this.mouseScreenY = (ev.clientY - rect.top) * (this.canvas.height / rect.height);
    this.refreshMouseWorld();
  }

  /** Recompute mouse world coords from stored screen position + current camera. */
  refreshMouseWorld() {
    const world = this.screenToWorld(this.mouseScreenX, this.mouseScreenY);
    this.mouseWorldX = world.x;
    this.mouseWorldY = world.y;
  }

  /** Handle mouse wheel zoom. */
  handleWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.userZoom = Math.max(0.1, Math.min(5, this.userZoom * factor));
  }

  // ── Private ──────────────────────────────────────────────

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
  }

  private updateCamera(dt: number) {
    const target = this.state.computeCamera();
    const smooth = Math.min(1, dt * 5);
    this.camX += (target.x - this.camX) * smooth;
    this.camY += (target.y - this.camY) * smooth;
    const targetZoom = target.zoom * this.userZoom;
    this.camZoom += (targetZoom - this.camZoom) * smooth;
  }

  // Viewport bounds in world coords (computed once per frame)
  private viewLeft = 0;
  private viewRight = 0;
  private viewTop = 0;
  private viewBottom = 0;

  private render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const theme = this.settings.darkMode ? THEMES.dark : THEMES.light;

    // Compute viewport bounds (world coords)
    const halfW = (cw / 2) / this.camZoom;
    const halfH = (ch / 2) / this.camZoom;
    this.viewLeft = this.camX - halfW;
    this.viewRight = this.camX + halfW;
    this.viewTop = this.camY - halfH;
    this.viewBottom = this.camY + halfH;

    // Clear
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    // Translate to camera center
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    this.collectBlackholes();

    if (this.settings.showGrid) this.drawGrid(ctx);
    if (this.settings.showBorder) this.drawBorder(ctx);
    this.drawCells(ctx);

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D) {
    const { left, top, right, bottom } = this.state.border;
    const theme = this.settings.darkMode ? THEMES.dark : THEMES.light;
    ctx.lineWidth = 1 / this.camZoom;

    const startX = Math.floor(left / GRID_SPACING) * GRID_SPACING;
    const startY = Math.floor(top / GRID_SPACING) * GRID_SPACING;

    if (this.blackholes.length === 0) {
      // Fast path: no black holes, draw straight lines
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      for (let x = startX; x <= right; x += GRID_SPACING) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      for (let y = startY; y <= bottom; y += GRID_SPACING) {
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();
    } else {
      // Slow path: draw all grid as warped curves through black hole regions.
      // Every line is segmented; segments near a black hole get pulled.
      const segLen = GRID_SPACING * 0.5;

      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1 / this.camZoom;

      // Vertical lines
      for (let x = startX; x <= right; x += GRID_SPACING) {
        // Check if this vertical line passes near any blackhole
        let lineAffected = false;
        for (const bh of this.blackholes) {
          if (Math.abs(x - bh.x) < bh.size * 2.5) { lineAffected = true; break; }
        }

        ctx.beginPath();
        if (!lineAffected) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
        } else {
          // Draw segmented — warp only the affected segments
          let first = true;
          for (let y = top; y <= bottom; y += segLen) {
            const [wx, wy] = this.nearBlackhole(x, y) ? this.warpPoint(x, y) : [x, y];
            if (first) { ctx.moveTo(wx, wy); first = false; }
            else ctx.lineTo(wx, wy);
          }
        }
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = startY; y <= bottom; y += GRID_SPACING) {
        let lineAffected = false;
        for (const bh of this.blackholes) {
          if (Math.abs(y - bh.y) < bh.size * 2.5) { lineAffected = true; break; }
        }

        ctx.beginPath();
        if (!lineAffected) {
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        } else {
          let first = true;
          for (let x = left; x <= right; x += segLen) {
            const [wx, wy] = this.nearBlackhole(x, y) ? this.warpPoint(x, y) : [x, y];
            if (first) { ctx.moveTo(wx, wy); first = false; }
            else ctx.lineTo(wx, wy);
          }
        }
        ctx.stroke();
      }
    }
  }

  private drawBorder(ctx: CanvasRenderingContext2D) {
    const { left, top, right, bottom } = this.state.border;
    const theme = this.settings.darkMode ? THEMES.dark : THEMES.light;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = BORDER_WIDTH / this.camZoom;

    if (this.blackholes.length === 0) {
      ctx.strokeRect(left, top, right - left, bottom - top);
    } else {
      // Draw border as segmented lines warped near black holes
      // Use adaptive segmentation: finer near black holes for smooth stretch
      const baseSegLen = GRID_SPACING * 0.8;
      const fineSegLen = GRID_SPACING * 0.25;

      const drawWarpedLine = (x1: number, y1: number, x2: number, y2: number) => {
        const ldx = x2 - x1, ldy = y2 - y1;
        const len = Math.sqrt(ldx * ldx + ldy * ldy);

        ctx.beginPath();
        let traveled = 0;
        let first = true;
        while (traveled <= len) {
          const t = traveled / len;
          const px = x1 + ldx * t;
          const py = y1 + ldy * t;
          // Use fine segments when near a black hole
          const near = this.nearBlackhole(px, py);
          const [wx, wy] = near ? this.warpPoint(px, py) : [px, py];
          if (first) { ctx.moveTo(wx, wy); first = false; }
          else ctx.lineTo(wx, wy);
          // Adaptive step: fine near black holes, coarse elsewhere
          traveled += near ? fineSegLen : baseSegLen;
        }
        // Ensure we hit the endpoint
        const [ex, ey] = this.nearBlackhole(x2, y2) ? this.warpPoint(x2, y2) : [x2, y2];
        ctx.lineTo(ex, ey);
        ctx.stroke();
      };

      drawWarpedLine(left, top, right, top);    // top edge
      drawWarpedLine(right, top, right, bottom); // right edge
      drawWarpedLine(right, bottom, left, bottom); // bottom edge
      drawWarpedLine(left, bottom, left, top);   // left edge
    }
  }

  private sortedCells: GameCell[] = [];

  private drawCells(ctx: CanvasRenderingContext2D) {
    // Sort cells by size (smallest first → drawn first → below larger cells)
    const sorted = this.sortedCells;
    sorted.length = 0;
    for (const cell of this.state.cells.values()) {
      // Viewport culling: skip cells entirely outside the visible area
      // Use a generous margin for effects that extend beyond the cell (3x radius)
      const margin = cell.size * 3;
      if (cell.x + margin < this.viewLeft || cell.x - margin > this.viewRight ||
          cell.y + margin < this.viewTop || cell.y - margin > this.viewBottom) continue;
      sorted.push(cell);
    }
    sorted.sort((a, b) => a.size - b.size);

    for (const cell of sorted) {
      this.drawCell(ctx, cell);
    }
  }

  private drawCell(ctx: CanvasRenderingContext2D, cell: GameCell) {
    const { r, g, b } = cell.color;
    const isMine = this.state.myCellIds.has(cell.id);
    const isMulti = this.state.multiCellIds.has(cell.id);
    const isOwned = isMine || isMulti;
    // Active = the slot currently being controlled
    const isActive = (isMine && this.multiboxSlot === 0) || (isMulti && this.multiboxSlot === 1);
    const isInactive = isOwned && !isActive;
    const size = Math.max(cell.size, 1);

    // No spawn animation — cells appear at full size immediately
    const drawSize = size;

    // Apply gravitational warp: non-blackhole cells near a blackhole get pulled
    let drawX = cell.x;
    let drawY = cell.y;
    let radialStretch = 1;   // stretch along the direction toward the black hole
    let tangentialCompress = 1; // compress perpendicular to that direction
    let warpAngle = 0;      // angle from cell toward the closest black hole
    const isBlackhole = cell.isPlayer && cell.effect === "blackhole";
    if (!isBlackhole && this.blackholes.length > 0 && this.nearBlackhole(cell.x, cell.y)) {
      const [wx, wy] = this.warpPoint(cell.x, cell.y);
      drawX = wx;
      drawY = wy;

      // Find the dominant (closest) black hole for directional spaghettification
      let closestBh = this.blackholes[0];
      let closestDist2 = Infinity;
      for (const bh of this.blackholes) {
        const ddx = cell.x - bh.x, ddy = cell.y - bh.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < closestDist2) { closestDist2 = d2; closestBh = bh; }
      }

      const dist = Math.sqrt(closestDist2);
      const warpRadius = closestBh.size * 2.5;

      if (dist > 1 && dist < warpRadius) {
        // How deep into the warp zone (0 = edge, 1 = center)
        const depth = 1 - dist / warpRadius;
        // Spaghettification: stretch radially, compress tangentially
        // Stronger effect for smaller objects (food gets noodled more)
        const sizeFactor = Math.min(1, 40 / Math.max(size, 1)); // food=1.0, big players=less
        const spaghettiStrength = depth * depth * sizeFactor;

        radialStretch = 1 + spaghettiStrength * 2.5;     // stretch up to 3.5x toward BH
        tangentialCompress = 1 - spaghettiStrength * 0.7; // compress down to 0.3x wide
        tangentialCompress = Math.max(0.15, tangentialCompress);

        // Angle from cell toward the black hole center
        warpAngle = Math.atan2(closestBh.y - cell.y, closestBh.x - cell.x);
      }
    }

    ctx.save();
    ctx.translate(drawX, drawY);
    if (radialStretch !== 1 || tangentialCompress !== 1) {
      // Rotate so x-axis points toward the black hole, apply anisotropic scale, rotate back
      ctx.rotate(warpAngle);
      ctx.scale(radialStretch, tangentialCompress);
      ctx.rotate(-warpAngle);
    }

    // Dim inactive multibox cells slightly
    if (isInactive) {
      ctx.globalAlpha = 0.6;
    }

    if (cell.isVirus) {
      // ── Virus: spikey circle with cute rounded spikes ──
      this.drawVirus(ctx, drawSize);
    } else if (cell.isPlayer) {
      // ── Player: jelly wobble + visual padding ──
      this.drawPlayerCell(ctx, cell, drawSize, r, g, b, isOwned);
    } else {
      // ── Food / eject: small jelly wobble ──
      this.drawFoodCell(ctx, cell, drawSize, r, g, b);
    }

    // Restore alpha before drawing text
    if (isInactive) {
      ctx.globalAlpha = 1.0;
    }

    // Draw active indicator ring for the controlled slot
    if (isActive && this.state.multiCellIds.size > 0) {
      const ringRadius = drawSize * 1.12;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, PI2);
      ctx.closePath();
      ctx.strokeStyle = this.multiboxSlot === 0 ? "rgba(91,187,255,0.6)" : "rgba(245,166,35,0.6)";
      ctx.lineWidth = Math.max(3, drawSize * 0.04);
      ctx.stroke();
    }

    // Draw border effect (if any)
    if (cell.isPlayer && cell.effect) {
      const effectFn = getEffect(cell.effect);
      if (effectFn) {
        // Pass cell ID to effect for per-cell state tracking
        (ctx as unknown as { _effectCellId?: number })._effectCellId = cell.id;
        effectFn(ctx, drawSize, r, g, b, performance.now() / 1000, drawSize * this.camZoom);
      }
    }

    // Draw name
    if (cell.isPlayer && cell.name && drawSize > 20) {
      const fontSize = Math.max(12, drawSize * 0.4);
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, fontSize * 0.1);
      ctx.strokeStyle = TEXT_STROKE;
      ctx.fillStyle = TEXT_FILL;

      const textY = cell.isPlayer && isOwned && drawSize > 40 ? -fontSize * 0.3 : 0;
      ctx.strokeText(cell.name, 0, textY);
      ctx.fillText(cell.name, 0, textY);

      // Draw mass for own cells (both primary and multi)
      if (this.settings.showMass && isOwned && drawSize > 40) {
        const mass = Math.round((cell.size * cell.size) / 100);
        const massFontSize = fontSize * 0.55;
        ctx.font = `bold ${massFontSize}px Arial, sans-serif`;
        ctx.lineWidth = Math.max(1.5, massFontSize * 0.08);
        ctx.strokeText(String(mass), 0, fontSize * 0.45);
        ctx.fillText(String(mass), 0, fontSize * 0.45);
      }
    }

    ctx.restore();
  }

  /** Draw a player cell using spring-mass jelly physics. */
  private drawPlayerCell(
    ctx: CanvasRenderingContext2D,
    cell: GameCell,
    drawSize: number,
    r: number, g: number, b: number,
    _isMine: boolean,
  ) {
    // Visual padding: draw 5% larger
    const visualSize = drawSize * 1.05;

    // --- Jelly physics: update point count, simulate, draw ---

    // Target number of points = screen-size of cell, clamped [5, 120]
    let targetPts = Math.round(visualSize * this.camZoom);
    targetPts = Math.max(JELLY_POINTS_MIN, Math.min(JELLY_POINTS_MAX, targetPts));

    const pts = cell.jellyPoints;
    const vel = cell.jellyVel;

    // Adjust point count (add/remove randomly)
    while (pts.length > targetPts) {
      const idx = (Math.random() * pts.length) | 0;
      pts.splice(idx, 1);
      vel.splice(idx, 1);
    }
    if (pts.length === 0 && targetPts > 0) {
      pts.push(visualSize);
      vel.push(Math.random() - 0.5);
    }
    while (pts.length < targetPts) {
      const idx = (Math.random() * pts.length) | 0;
      pts.splice(idx, 0, pts[idx]);
      vel.splice(idx, 0, vel[idx]);
    }

    // Simulate spring-mass jelly physics
    const n = pts.length;
    if (n > 0) {
      // Smooth velocities with neighbors + random perturbation
      // Use two-pass approach to avoid allocation: read prev before overwrite
      let prevVel = vel[(n - 1) % n];
      for (let i = 0; i < n; i++) {
        const nextVel = vel[(i + 1) % n];
        let v = 0.7 * (vel[i] + Math.random() - 0.5);
        v = Math.max(Math.min(v, 10), -10);
        const newV = (prevVel + nextVel + 8 * v) / 10;
        prevVel = vel[i];
        vel[i] = newV;
      }

      // Apply velocity to radius, smooth with neighbors, pull toward rest size
      for (let i = 0; i < n; i++) {
        let rl = pts[i];
        rl += vel[i];
        rl = Math.max(rl, 0);
        rl = (9 * rl + visualSize) / 10; // pull toward rest radius
        const left = pts[(i - 1 + n) % n];
        const right = pts[(i + 1) % n];
        pts[i] = (left + right + 8 * rl) / 10; // smooth with neighbors
      }
    }

    // Draw the jelly shape
    const lineW = Math.max(Math.round(visualSize / 50), 10);
    const strokeSize = visualSize - lineW / 2;

    ctx.beginPath();
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        const angle = PI2 * i / n;
        // Scale point radius relative to visualSize, apply to strokeSize
        const pointR = pts[i] - lineW / 2;
        const px = Math.cos(angle) * pointR;
        const py = Math.sin(angle) * pointR;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    } else {
      ctx.arc(0, 0, strokeSize, 0, PI2);
    }
    ctx.closePath();

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();

    // Draw skin image (circular clipped) if available
    const skinImg = cell.skin ? this.getSkinImage(cell.skin) : null;
    if (skinImg) {
      ctx.save();
      ctx.clip(); // clip to the jelly shape already defined
      const imgSize = visualSize * 2;
      ctx.drawImage(skinImg, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    // Darker outline: lineWidth = max(size/50, 10)
    ctx.strokeStyle = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
    ctx.lineWidth = lineW;
    ctx.stroke();
  }

  /** Draw a virus with cute rounded spikes. */
  private drawVirus(ctx: CanvasRenderingContext2D, drawSize: number) {
    const spikeCount = 18;
    const innerR = drawSize * 0.90;
    const outerR = drawSize * 1.05;
    const steps = spikeCount * 2;

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      // Alternate between outer (spike tip) and inner (valley)
      const rad = i % 2 === 0 ? outerR : innerR;
      const px = Math.cos(angle) * rad;
      const py = Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = "rgba(51, 255, 51, 0.35)";
    ctx.fill();
    ctx.strokeStyle = VIRUS_STROKE;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  /** Draw food/eject as a simple circle (fast — no wobble needed for tiny cells). */
  private drawFoodCell(
    ctx: CanvasRenderingContext2D,
    _cell: GameCell,
    drawSize: number,
    r: number, g: number, b: number,
  ) {
    ctx.beginPath();
    ctx.arc(0, 0, drawSize, 0, PI2);
    ctx.closePath();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
  }
}
