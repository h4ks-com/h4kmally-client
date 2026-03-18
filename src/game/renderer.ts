import { GameState } from "./state";
import type { GameCell } from "./state";
import type { Settings } from "./settings";
import { getSkinFile } from "../skinFileMap";

const GRID_SPACING = 50;
const BORDER_WIDTH = 6;
const VIRUS_STROKE = "#33ff33";
const TEXT_STROKE = "#000";
const TEXT_FILL = "#fff";

// Jelly physics constants
const JELLY_POINTS_MIN = 5;
const JELLY_POINTS_MAX = 120;
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

  // Server base URL for skin images (set after connect)
  serverBaseUrl = "";

  // Skin image cache: skin name → CanvasImageSource (static image or animated frames)
  private skinCache = new Map<string, HTMLImageElement>();
  private skinFailed = new Set<string>(); // skins that failed to load

  // Animated skin support: GIF frames decoded into ImageBitmaps
  private animSkins = new Map<string, { frames: ImageBitmap[]; delays: number[]; totalDuration: number }>();
  private animStart = performance.now(); // reference time for animation

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

  private render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const theme = this.settings.darkMode ? THEMES.dark : THEMES.light;

    // Clear
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    // Translate to camera center
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    if (this.settings.showGrid) this.drawGrid(ctx);
    if (this.settings.showBorder) this.drawBorder(ctx);
    this.drawCells(ctx);

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D) {
    const { left, top, right, bottom } = this.state.border;
    const theme = this.settings.darkMode ? THEMES.dark : THEMES.light;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1 / this.camZoom;

    ctx.beginPath();
    const startX = Math.floor(left / GRID_SPACING) * GRID_SPACING;
    const startY = Math.floor(top / GRID_SPACING) * GRID_SPACING;
    for (let x = startX; x <= right; x += GRID_SPACING) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y <= bottom; y += GRID_SPACING) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
  }

  private drawBorder(ctx: CanvasRenderingContext2D) {
    const { left, top, right, bottom } = this.state.border;
    const theme = this.settings.darkMode ? THEMES.dark : THEMES.light;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = BORDER_WIDTH / this.camZoom;
    ctx.strokeRect(left, top, right - left, bottom - top);
  }

  private drawCells(ctx: CanvasRenderingContext2D) {
    // Sort cells by size (smallest first → drawn first → below larger cells)
    const sorted: GameCell[] = [];
    for (const cell of this.state.cells.values()) {
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
    const size = Math.max(cell.size, 1);

    // No spawn animation — cells appear at full size immediately
    const drawSize = size;

    ctx.save();
    ctx.translate(cell.x, cell.y);

    if (cell.isVirus) {
      // ── Virus: spikey circle with cute rounded spikes ──
      this.drawVirus(ctx, drawSize);
    } else if (cell.isPlayer) {
      // ── Player: jelly wobble + visual padding ──
      this.drawPlayerCell(ctx, cell, drawSize, r, g, b, isMine);
    } else {
      // ── Food / eject: small jelly wobble ──
      this.drawFoodCell(ctx, cell, drawSize, r, g, b);
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

      const textY = cell.isPlayer && this.state.myCellIds.has(cell.id) && drawSize > 40 ? -fontSize * 0.3 : 0;
      ctx.strokeText(cell.name, 0, textY);
      ctx.fillText(cell.name, 0, textY);

      // Draw mass for own cells
      if (this.settings.showMass && isMine && drawSize > 40) {
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
      const oldVel = vel.slice();

      // Smooth velocities with neighbors + random perturbation
      for (let i = 0; i < n; i++) {
        const prev = oldVel[(i - 1 + n) % n];
        const next = oldVel[(i + 1) % n];
        let v = 0.7 * (vel[i] + Math.random() - 0.5);
        v = Math.max(Math.min(v, 10), -10);
        vel[i] = (prev + next + 8 * v) / 10;
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
    cell: GameCell,
    drawSize: number,
    r: number, g: number, b: number,
  ) {
    // Same spring-mass jelly as player cells
    let targetPts = Math.round(drawSize * this.camZoom);
    targetPts = Math.max(JELLY_POINTS_MIN, Math.min(JELLY_POINTS_MAX, targetPts));

    const pts = cell.jellyPoints;
    const vel = cell.jellyVel;

    while (pts.length > targetPts) {
      const idx = (Math.random() * pts.length) | 0;
      pts.splice(idx, 1);
      vel.splice(idx, 1);
    }
    if (pts.length === 0 && targetPts > 0) {
      pts.push(drawSize);
      vel.push(Math.random() - 0.5);
    }
    while (pts.length < targetPts) {
      const idx = (Math.random() * pts.length) | 0;
      pts.splice(idx, 0, pts[idx]);
      vel.splice(idx, 0, vel[idx]);
    }

    const n = pts.length;
    if (n > 0) {
      const oldVel = vel.slice();
      for (let i = 0; i < n; i++) {
        const prev = oldVel[(i - 1 + n) % n];
        const next = oldVel[(i + 1) % n];
        let v = 0.7 * (vel[i] + Math.random() - 0.5);
        v = Math.max(Math.min(v, 10), -10);
        vel[i] = (prev + next + 8 * v) / 10;
      }
      for (let i = 0; i < n; i++) {
        let rl = pts[i];
        rl += vel[i];
        rl = Math.max(rl, 0);
        rl = (9 * rl + drawSize) / 10;
        const left = pts[(i - 1 + n) % n];
        const right = pts[(i + 1) % n];
        pts[i] = (left + right + 8 * rl) / 10;
      }
    }

    ctx.beginPath();
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        const angle = PI2 * i / n;
        const px = Math.cos(angle) * pts[i];
        const py = Math.sin(angle) * pts[i];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    } else {
      ctx.arc(0, 0, drawSize, 0, PI2);
    }
    ctx.closePath();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
  }
}
