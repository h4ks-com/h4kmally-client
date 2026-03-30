/**
 * Border effects for player cells.
 * Each effect draws around a cell using Canvas2D after the cell body is rendered.
 * Effects are called with the canvas context translated to the cell center.
 *
 * Performance rules:
 * - NEVER use ctx.shadowBlur (software-rendered Gaussian blur, kills Firefox)
 * - Use wider/thicker strokes at lower alpha for "glow" simulation instead
 * - LOD: skip or simplify when screenRadius (px on screen) is small
 * - Use swap-with-last compaction for particle arrays (avoid Array.splice)
 * - Use Float32Array for persistent per-cell state where possible
 */

const PI2 = Math.PI * 2;

// ── Effect registry ────────────────────────────────────────

export type EffectRenderer = (
  ctx: CanvasRenderingContext2D,
  radius: number,
  r: number,
  g: number,
  b: number,
  time: number,          // monotonic seconds (performance.now / 1000)
  screenRadius: number,  // radius in screen pixels (for LOD)
) => void;

const effectMap = new Map<string, EffectRenderer>();

export function getEffect(name: string): EffectRenderer | undefined {
  return effectMap.get(name);
}

/** Get the human-readable label and category for an effect ID. */
export function getEffectInfo(id: string): { label: string; category: "free" | "premium" } | undefined {
  const entry = EFFECT_LIST.find(e => e.id === id);
  return entry ? { label: entry.label, category: entry.category } : undefined;
}

export const EFFECT_LIST: { id: string; label: string; description: string; category: "free" | "premium" }[] = [];

function registerEffect(
  id: string, label: string, description: string,
  render: EffectRenderer, category: "free" | "premium" = "free",
) {
  effectMap.set(id, render);
  EFFECT_LIST.push({ id, label, description, category });
}

// ── Neon Pulse ─────────────────────────────────────────────
// Pulsing colored rings — simulated glow via wide semi-transparent strokes.

registerEffect("neon", "Neon Pulse", "Pulsing neon glow around your cell", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.0);

  ctx.save();

  // Wide soft outer "glow"
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.08 + pulse * 0.07})`;
  ctx.lineWidth = Math.max(8, radius * 0.15);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.06, 0, PI2);
  ctx.stroke();

  // Main colored ring
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.6 + pulse * 0.4})`;
  ctx.lineWidth = Math.max(3, radius * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.03, 0, PI2);
  ctx.stroke();

  if (sr > 25) {
    // Inner white highlight
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
    ctx.lineWidth = Math.max(1.5, radius * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.01, 0, PI2);
    ctx.stroke();
  }

  if (sr > 40) {
    // Subtle color band
    ctx.fillStyle = `rgba(${r},${g},${b},${0.06 + pulse * 0.09})`;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.08, 0, PI2);
    ctx.arc(0, 0, radius * 1.0, 0, PI2, true);
    ctx.fill();
  }

  ctx.restore();
});

// ── Prismatic ──────────────────────────────────────────────
// Rainbow refraction tinted by cell colour — shifts around the player's hue.

registerEffect("prismatic", "Prismatic", "Shifting rainbow border", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  const segments = sr < 30 ? 12 : sr < 60 ? 18 : 24;
  const lineW = Math.max(2.5, radius * 0.035);

  // Derive base hue from cell colour
  const cmax = Math.max(r, g, b), cmin = Math.min(r, g, b);
  let baseHue = 0;
  if (cmax !== cmin) {
    const d = cmax - cmin;
    if (cmax === r) baseHue = ((g - b) / d + 6) % 6 * 60;
    else if (cmax === g) baseHue = ((b - r) / d + 2) * 60;
    else baseHue = ((r - g) / d + 4) * 60;
  }
  const baseLum = Math.max(40, Math.min(70, (cmax / 255) * 60 + 20));

  ctx.save();
  ctx.lineWidth = lineW;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * PI2;
    const a1 = ((i + 1) / segments) * PI2;
    // Spread ±60° around the cell's own hue, shifting over time
    const hue = (baseHue + (i / segments) * 120 - 60 + time * 120) % 360;

    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.02, a0, a1);
    ctx.strokeStyle = `hsl(${hue}, 90%, ${baseLum}%)`;
    ctx.stroke();
  }

  ctx.restore();
});

// ── Starfield ──────────────────────────────────────────────
// Tiny orbiting stars — Float32Array state, no shadow.

const STAR_MAX = 16;
const starStates = new Map<string, { angles: Float32Array; sizes: Float32Array; speeds: Float32Array; twinkle: Float32Array }>();

function getStarState(cellKey: string) {
  let s = starStates.get(cellKey);
  if (!s) {
    const angles = new Float32Array(STAR_MAX);
    const sizes = new Float32Array(STAR_MAX);
    const speeds = new Float32Array(STAR_MAX);
    const twinkle = new Float32Array(STAR_MAX);
    for (let i = 0; i < STAR_MAX; i++) {
      angles[i] = Math.random() * PI2;
      sizes[i] = 1 + Math.random() * 2;
      speeds[i] = 0.2 + Math.random() * 0.6;
      twinkle[i] = Math.random() * PI2;
    }
    s = { angles, sizes, speeds, twinkle };
    starStates.set(cellKey, s);
  }
  return s;
}

registerEffect("starfield", "Starfield", "Orbiting stars around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 6 : Math.max(6, Math.min(STAR_MAX, Math.floor(radius / 12)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getStarState(cellKey);

  ctx.save();

  for (let i = 0; i < count; i++) {
    s.angles[i] += s.speeds[i] * 0.016;
    const angle = s.angles[i];
    const twinkleAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + s.twinkle[i]));
    const dist = radius * 1.08 + Math.sin(time * 1.5 + i) * radius * 0.03;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const sz = s.sizes[i] * Math.max(1, radius * 0.015);

    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.fillStyle = `rgba(255,255,230,${twinkleAlpha})`;
    ctx.fill();
  }

  ctx.restore();
});

// ── Lightning ──────────────────────────────────────────────
// Electric arcs — swap-with-last compaction, no shadow.

interface Bolt { startAngle: number; seed: number; life: number; maxLife: number }
const boltStates = new Map<string, { bolts: Bolt[]; count: number }>();

registerEffect("lightning", "Lightning", "Crackling electric arcs", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";

  let state = boltStates.get(cellKey);
  if (!state) {
    state = { bolts: [], count: 0 };
    boltStates.set(cellKey, state);
  }

  // Spawn new bolts
  if (Math.random() < 0.15 && state.count < 5) {
    if (state.count < state.bolts.length) {
      const b = state.bolts[state.count];
      b.startAngle = Math.random() * PI2;
      b.seed = Math.random() * 1000;
      b.life = 0;
      b.maxLife = 8 + Math.random() * 12;
    } else {
      state.bolts.push({
        startAngle: Math.random() * PI2,
        seed: Math.random() * 1000,
        life: 0,
        maxLife: 8 + Math.random() * 12,
      });
    }
    state.count++;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const lightR = Math.min(255, r + 100);
  const lightG = Math.min(255, g + 100);
  const lightB = Math.min(255, b + 150);

  // Update + draw + compact in one pass
  let writeIdx = 0;
  for (let i = 0; i < state.count; i++) {
    const bolt = state.bolts[i];
    bolt.life++;
    if (bolt.life > bolt.maxLife) continue; // dead — skip

    if (writeIdx !== i) state.bolts[writeIdx] = state.bolts[i];
    writeIdx++;

    const progress = bolt.life / bolt.maxLife;
    const alpha = 1.0 - progress;
    const arcLength = 0.3 + Math.random() * 0.4;
    const segments = sr < 40 ? 4 : 6 + Math.floor(Math.random() * 3);

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${lightR},${lightG},${lightB},${alpha * 0.9})`;
    ctx.lineWidth = Math.max(1.5, radius * 0.02) * (1 - progress * 0.5);

    for (let si = 0; si <= segments; si++) {
      const t = si / segments;
      const angle = bolt.startAngle + t * arcLength;
      const jitter = (Math.sin(bolt.seed + si * 73.7 + time * 20) * 0.5 +
                      Math.cos(bolt.seed + si * 37.3 + time * 15) * 0.5) * radius * 0.06;
      const dist = radius * 1.02 + jitter;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      if (si === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Bright core (re-stroke the same path, thinner)
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.5})`;
    ctx.lineWidth = Math.max(0.5, radius * 0.008);
    ctx.stroke();
  }
  state.count = writeIdx;

  ctx.restore();
});

// ══════════════════════════════════════════════════════════════
// ═══  PREMIUM EFFECTS  ═══════════════════════════════════════
// ══════════════════════════════════════════════════════════════

// ── Sakura ─────────────────────────────────────────────────
// Cherry blossom petal trail — petals detach in world space and fall behind.

interface SakuraPetal {
  wx: number; wy: number;     // world-space position
  vx: number; vy: number;     // world-space velocity
  rot: number;                // rotation
  rotSpeed: number;           // spin speed
  size: number;               // petal size
  age: number;                // 0→1 lifetime progress
  maxAge: number;             // lifetime in seconds
  variant: number;            // 0-2 color variant
}

interface SakuraState {
  petals: SakuraPetal[];
  prevX: number; prevY: number; prevTime: number;
  velX: number; velY: number;  // smoothed cell velocity
  spawnAccum: number;
}

const petalStates = new Map<string, SakuraState>();

/** Draw a 5-petal cherry blossom flower. */
function drawCherryBlossom(ctx: CanvasRenderingContext2D, sz: number, alpha: number, variant: number) {
  const colors = [
    [`rgba(255,183,197,${alpha})`, `rgba(255,140,165,${alpha * 0.7})`],   // pink
    [`rgba(255,200,210,${alpha})`, `rgba(255,160,180,${alpha * 0.7})`],   // light pink
    [`rgba(248,170,190,${alpha})`, `rgba(240,130,155,${alpha * 0.7})`],   // deeper pink
  ];
  const [petalCol, innerCol] = colors[variant % colors.length];

  const petalCount = 5;
  const angleStep = PI2 / petalCount;

  for (let i = 0; i < petalCount; i++) {
    const a = angleStep * i - Math.PI / 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sz * 0.35, -sz * 0.25, sz * 0.8, -sz * 0.15, sz * 0.7, sz * 0.05);
    ctx.bezierCurveTo(sz * 0.55, sz * 0.3, sz * 0.15, sz * 0.25, 0, 0);
    ctx.fillStyle = petalCol;
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, sz * 0.12, 0, PI2);
  ctx.fillStyle = innerCol;
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    const sa = (PI2 / 3) * i + 0.3;
    ctx.beginPath();
    ctx.arc(Math.cos(sa) * sz * 0.18, Math.sin(sa) * sz * 0.18, sz * 0.04, 0, PI2);
    ctx.fillStyle = `rgba(255,220,100,${alpha * 0.8})`;
    ctx.fill();
  }
}

registerEffect("sakura", "Sakura", "Beautiful cherry blossom petal trail", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const worldX = (ctx as unknown as { _effectCellX?: number })._effectCellX ?? 0;
  const worldY = (ctx as unknown as { _effectCellY?: number })._effectCellY ?? 0;

  let state = petalStates.get(cellKey);
  if (!state) {
    state = {
      petals: [],
      prevX: worldX, prevY: worldY, prevTime: time,
      velX: 0, velY: 0,
      spawnAccum: 0,
    };
    petalStates.set(cellKey, state);
  }

  const dt = time - state.prevTime;
  if (dt > 0.001 && dt < 0.5) {
    const rawVx = (worldX - state.prevX) / dt;
    const rawVy = (worldY - state.prevY) / dt;
    const smooth = 1 - Math.exp(-5.0 * dt);
    state.velX += (rawVx - state.velX) * smooth;
    state.velY += (rawVy - state.velY) * smooth;
  }
  state.prevX = worldX;
  state.prevY = worldY;
  state.prevTime = time;

  const speed = Math.sqrt(state.velX * state.velX + state.velY * state.velY);
  const maxPetals = sr < 30 ? 15 : Math.min(40, Math.floor(radius / 6));

  // Spawn rate: lots when moving, some when idle
  const spawnRate = Math.min(30, 4 + speed / 30);
  if (dt > 0 && dt < 0.5) {
    state.spawnAccum += spawnRate * dt;
  }
  while (state.spawnAccum >= 1 && state.petals.length < maxPetals) {
    state.spawnAccum -= 1;
    // Spawn at cell edge with random spread
    const spawnAngle = Math.random() * PI2;
    const spawnDist = radius * (0.7 + Math.random() * 0.5);
    const spawnWx = worldX + Math.cos(spawnAngle) * spawnDist;
    const spawnWy = worldY + Math.sin(spawnAngle) * spawnDist;
    // Inherit half the cell's velocity + small random scatter
    state.petals.push({
      wx: spawnWx,
      wy: spawnWy,
      vx: state.velX * 0.5 + (Math.random() - 0.5) * 40,
      vy: state.velY * 0.5 + (Math.random() - 0.5) * 40,
      rot: Math.random() * PI2,
      rotSpeed: (Math.random() - 0.5) * 5,
      size: (0.8 + Math.random() * 0.7) * Math.max(6, radius * 0.12),
      age: 0,
      maxAge: 0.8 + Math.random() * 1.2,
      variant: Math.floor(Math.random() * 3),
    });
  }

  // Soft pink glow around cell
  ctx.save();
  const glowPulse = 0.10 + 0.05 * Math.sin(time * 2.0);
  ctx.strokeStyle = `rgba(255,180,200,${glowPulse})`;
  ctx.lineWidth = Math.max(4, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.08, 0, PI2);
  ctx.stroke();

  // Update and draw petals (world-space positions, drawn relative to cell)
  const alivePetals: SakuraPetal[] = [];
  const safeDt = Math.min(dt, 0.1);

  for (const p of state.petals) {
    p.age += safeDt / p.maxAge;
    if (p.age >= 1) continue;

    // Move in world space (independent of cell movement)
    p.wx += p.vx * safeDt;
    p.wy += p.vy * safeDt;
    // Gentle flutter
    p.wx += Math.sin(time * 2.5 + p.rot) * 10 * safeDt;
    p.wy += Math.cos(time * 1.8 + p.rot * 0.7) * 8 * safeDt;
    // Gentle drag (air resistance)
    p.vx *= (1 - 2.0 * safeDt);
    p.vy *= (1 - 2.0 * safeDt);
    // Slight downward drift (gravity)
    p.vy += 15 * safeDt;
    p.rot += p.rotSpeed * safeDt;

    // Fade in fast, fade out
    const fadeIn = Math.min(1, p.age * 8);
    const fadeOut = 1 - Math.pow(p.age, 1.5);
    const alpha = fadeIn * fadeOut * 0.85;

    if (alpha > 0.01) {
      // Convert world position to cell-local for drawing
      const localX = p.wx - worldX;
      const localY = p.wy - worldY;
      ctx.save();
      ctx.translate(localX, localY);
      ctx.rotate(p.rot);
      const tilt = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + p.rot));
      ctx.scale(1, tilt);
      drawCherryBlossom(ctx, p.size, alpha, p.variant);
      ctx.restore();
    }

    alivePetals.push(p);
  }

  state.petals = alivePetals;
  ctx.restore();
}, "premium");

// ── Frost ──────────────────────────────────────────────────
// Ice crystals — Float32Array state, batched branches, no shadow.

const FROST_MAX = 14;
const frostStates = new Map<string, { angles: Float32Array; lengths: Float32Array; branches: Uint8Array }>();

function getFrostState(cellKey: string) {
  let s = frostStates.get(cellKey);
  if (!s) {
    const angles = new Float32Array(FROST_MAX);
    const lengths = new Float32Array(FROST_MAX);
    const branches = new Uint8Array(FROST_MAX);
    for (let i = 0; i < FROST_MAX; i++) {
      angles[i] = Math.random() * PI2;
      lengths[i] = 0.5 + Math.random() * 1.0;
      branches[i] = 2 + Math.floor(Math.random() * 3);
    }
    s = { angles, lengths, branches };
    frostStates.set(cellKey, s);
  }
  return s;
}

registerEffect("frost", "Frost", "Ice crystals and frosty mist surrounding your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 5 : Math.max(6, Math.min(FROST_MAX, Math.floor(radius / 14)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getFrostState(cellKey);

  ctx.save();

  // Frosty mist — wide soft ring (no shadow)
  const mistPulse = 0.5 + 0.5 * Math.sin(time * 1.5);
  ctx.strokeStyle = `rgba(170,225,255,${0.12 + mistPulse * 0.12})`;
  ctx.lineWidth = Math.max(8, radius * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.08, 0, PI2);
  ctx.stroke();

  // Ice crystals
  ctx.lineCap = "round";

  for (let i = 0; i < count; i++) {
    const baseAngle = s.angles[i] + Math.sin(time * 0.3 + i) * 0.05;
    const len = s.lengths[i] * Math.max(10, radius * 0.25);
    const startDist = radius * 1.01;
    const sx = Math.cos(baseAngle) * startDist;
    const sy = Math.sin(baseAngle) * startDist;
    const ex = Math.cos(baseAngle) * (startDist + len);
    const ey = Math.sin(baseAngle) * (startDist + len);

    const alpha = 0.55 + 0.35 * Math.sin(time * 2 + i * 1.3);
    ctx.strokeStyle = `rgba(200,240,255,${alpha})`;

    // Main crystal spike
    ctx.lineWidth = Math.max(2, radius * 0.018);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Branches — batched into one path
    if (sr > 30) {
      const branchCount = s.branches[i];
      ctx.lineWidth = Math.max(1.5, radius * 0.012);
      ctx.beginPath();
      for (let b = 0; b < branchCount; b++) {
        const t = (b + 1) / (branchCount + 1);
        const mx = sx + (ex - sx) * t;
        const my = sy + (ey - sy) * t;
        const branchLen = len * 0.4;
        const branchAngle = baseAngle + (b % 2 === 0 ? 1 : -1) * (0.35 + 0.15 * Math.sin(time + i + b));
        const bex = mx + Math.cos(branchAngle) * branchLen;
        const bey = my + Math.sin(branchAngle) * branchLen;
        ctx.moveTo(mx, my);
        ctx.lineTo(bex, bey);
      }
      ctx.stroke();
    }
  }

  // Sparkle particles — fewer, no shadow
  if (sr > 25) {
    const sparkCount = sr < 50 ? 4 : 8;
    for (let i = 0; i < sparkCount; i++) {
      const sparkAngle = time * 0.6 + i * (PI2 / sparkCount);
      const sparkDist = radius * (1.05 + 0.3 * Math.sin(time * 1.5 + i * 1.9));
      const sx2 = Math.cos(sparkAngle) * sparkDist;
      const sy2 = Math.sin(sparkAngle) * sparkDist;
      const sparkAlpha = 0.3 + 0.7 * Math.abs(Math.sin(time * 3 + i * 1.7));
      const sparkSz = Math.max(1.5, radius * 0.014);

      ctx.beginPath();
      ctx.arc(sx2, sy2, sparkSz, 0, PI2);
      ctx.fillStyle = `rgba(220,240,255,${sparkAlpha})`;
      ctx.fill();
    }
  }

  ctx.restore();
}, "premium");

// ── Shadow Aura ────────────────────────────────────────────
// Dark smoke tendrils — radial gradient (GPU-fast), no shadow.

const SMOKE_MAX = 16;
const smokeStates = new Map<string, { angles: Float32Array; speeds: Float32Array; offsets: Float32Array }>();

function getSmokeState(cellKey: string) {
  let s = smokeStates.get(cellKey);
  if (!s) {
    const angles = new Float32Array(SMOKE_MAX);
    const speeds = new Float32Array(SMOKE_MAX);
    const offsets = new Float32Array(SMOKE_MAX);
    for (let i = 0; i < SMOKE_MAX; i++) {
      angles[i] = Math.random() * PI2;
      speeds[i] = 0.1 + Math.random() * 0.3;
      offsets[i] = Math.random() * PI2;
    }
    s = { angles, speeds, offsets };
    smokeStates.set(cellKey, s);
  }
  return s;
}

registerEffect("shadow_aura", "Shadow Aura", "Dark smoke tendrils — menacing dark energy", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 6 : Math.max(8, Math.min(SMOKE_MAX, Math.floor(radius / 8)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getSmokeState(cellKey);

  ctx.save();

  const pulse = 0.5 + 0.5 * Math.sin(time * 2);

  // Dark aura — radial gradient (GPU-accelerated, cheap)
  if (sr > 25) {
    const auraGrad = ctx.createRadialGradient(0, 0, radius * 0.95, 0, 0, radius * 1.5);
    auraGrad.addColorStop(0, `rgba(20,0,40,${0.3 + pulse * 0.15})`);
    auraGrad.addColorStop(0.5, `rgba(30,0,50,${0.15 + pulse * 0.1})`);
    auraGrad.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.5, 0, PI2);
    ctx.fill();
  }

  // Dark inner ring
  ctx.strokeStyle = `rgba(50,0,80,${0.35 + pulse * 0.25})`;
  ctx.lineWidth = Math.max(4, radius * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.03, 0, PI2);
  ctx.stroke();

  // Smoke tendrils (no shadow)
  for (let i = 0; i < count; i++) {
    s.angles[i] += s.speeds[i] * 0.01;
    const angle = s.angles[i];
    const tendrilLen = Math.max(15, radius * 0.45) * (0.5 + 0.5 * Math.sin(time * 1.5 + s.offsets[i]));
    const startDist = radius * 1.01;
    const alpha = 0.35 + 0.45 * Math.sin(time * 1.8 + s.offsets[i]);

    ctx.beginPath();
    const sx = Math.cos(angle) * startDist;
    const sy = Math.sin(angle) * startDist;
    ctx.moveTo(sx, sy);

    const segments = sr < 40 ? 3 : 5;
    for (let seg = 1; seg <= segments; seg++) {
      const t = seg / segments;
      const dist = startDist + tendrilLen * t;
      const wobble = Math.sin(time * 3 + i * 2 + seg * 1.2) * radius * 0.06;
      const a = angle + wobble / dist;
      const px = Math.cos(a) * dist;
      const py = Math.sin(a) * dist;

      if (seg < segments) {
        const cpDist = startDist + tendrilLen * (t - 0.4 / segments);
        const cpWobble = Math.sin(time * 4 + i * 3 + seg) * radius * 0.1;
        const cpA = angle + cpWobble / cpDist;
        ctx.quadraticCurveTo(Math.cos(cpA) * cpDist, Math.sin(cpA) * cpDist, px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.strokeStyle = `rgba(40,0,60,${alpha})`;
    ctx.lineWidth = Math.max(3, radius * 0.035) * (1.0 - 0.3 * Math.sin(time + i));
    ctx.stroke();
  }

  // Floating dark motes (no shadow, fewer)
  if (sr > 30) {
    for (let i = 0; i < 6; i++) {
      const moteAngle = time * 0.4 + i * 1.047;
      const moteDist = radius * (1.15 + 0.25 * Math.sin(time * 1.2 + i * 2.3));
      const mx = Math.cos(moteAngle) * moteDist;
      const my = Math.sin(moteAngle) * moteDist;
      const moteAlpha = 0.2 + 0.3 * Math.abs(Math.sin(time * 2 + i));
      const moteSz = Math.max(2, radius * 0.025);

      ctx.beginPath();
      ctx.arc(mx, my, moteSz, 0, PI2);
      ctx.fillStyle = `rgba(30,0,50,${moteAlpha})`;
      ctx.fill();
    }
  }

  ctx.restore();
}, "premium");

// ── Flame ──────────────────────────────────────────────────
// Trail-style ribbon flame — uses the same tapered-ribbon + quadratic Bézier
// technique as the cell trail, but simulates a virtual path brushing upward
// with a wiggling base. Produces the same naturally flickering organic look.
//
// Structure:
//   • Single unified shape — cone with convex semicircle base (no separate circle)
//   • Outer ribbon (orange→yellow→red) from cell center upward, 125% cell width
//   • Inner ribbon (blue core) narrower, same path

const FLAME_POINTS = 20;      // resolution of the virtual trail
const FLAME_HEIGHT = 1.6;     // flame tip height in radii above cell center

interface FlameRibbonState {
  // Phase offsets for desync between cells
  p1: number; p2: number; p3: number; p4: number; p5: number;
  // Velocity tracking for wind effect
  prevX: number; prevY: number; prevTime: number;
  windX: number; windY: number; // smoothed velocity (world units/sec)
}
const flameStates = new Map<string, FlameRibbonState>();

registerEffect("flame", "Flame", "Blazing trail-style fire engulfing your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const worldX = (ctx as unknown as { _effectCellX?: number })._effectCellX ?? 0;
  const worldY = (ctx as unknown as { _effectCellY?: number })._effectCellY ?? 0;

  let state = flameStates.get(cellKey);
  if (!state) {
    state = {
      p1: Math.random() * PI2,
      p2: Math.random() * PI2,
      p3: Math.random() * PI2,
      p4: Math.random() * PI2,
      p5: Math.random() * PI2,
      prevX: worldX, prevY: worldY, prevTime: time,
      windX: 0, windY: 0,
    };
    flameStates.set(cellKey, state);
  }

  // Compute smoothed velocity for wind effect
  const dt = time - state.prevTime;
  if (dt > 0.001 && dt < 0.5) {
    const rawVx = (worldX - state.prevX) / dt;
    const rawVy = (worldY - state.prevY) / dt;
    // Exponential smoothing — lower = smoother (0.08 ≈ gentle lag)
    const smooth = 1 - Math.exp(-4.0 * dt);
    state.windX += (rawVx - state.windX) * smooth;
    state.windY += (rawVy - state.windY) * smooth;
  }
  state.prevX = worldX;
  state.prevY = worldY;
  state.prevTime = time;

  // Wind offset: opposite of movement direction, clamped, scaled to radius
  // Negative sign = flame blows opposite to travel direction
  const windSpeed = Math.sqrt(state.windX * state.windX + state.windY * state.windY);
  const windScale = Math.min(windSpeed / 300, 1.0); // normalize: 300 units/sec = full effect
  const windOffX = windSpeed > 1 ? (-state.windX / windSpeed) * windScale * radius * 0.35 : 0;

  const n = FLAME_POINTS;
  const baseHalfW = radius * 1.05; // slightly wider than cell
  const tipY = -radius * FLAME_HEIGHT;

  ctx.save();

  // ── Build virtual trail points going upward from cell center ──
  const trail: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 = base (cell center), 1 = tip

    const y = t * tipY; // tipY is negative (upward)

    // Wobble accumulates toward the tip — base is stable, tip dances wildly
    // Irrational frequency ratios so the pattern never visibly repeats
    const wobbleAmt = t * t * radius * 0.18;
    const w1 = Math.sin(time * 14.62 + state.p1 + t * 2.73) * wobbleAmt;
    const w2 = Math.sin(time * 23.94 + state.p2 + t * 4.19) * wobbleAmt * 0.5;
    const w3 = Math.sin(time * 9.34  + state.p3 + t * 1.83) * wobbleAmt * 0.3;
    const w4 = Math.sin(time * 35.06 + state.p5 + t * 6.41) * wobbleAmt * 0.15;
    // Base sway — the whole flame leans left/right (irrational freq)
    const baseSway = Math.sin(time * 3.82 + state.p4) * radius * 0.04 * t;

    const x = w1 + w2 + w3 + w4 + baseSway + windOffX * t;
    trail.push({ x, y });
  }

  // ── Build tapered ribbon edges (same technique as cell trails) ──
  function buildRibbon(pts: { x: number; y: number }[], headWidth: number) {
    const leftEdge: { x: number; y: number }[] = [];
    const rightEdge: { x: number; y: number }[] = [];
    const count = pts.length;

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const width = headWidth * Math.sqrt(1 - t);

      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(count - 1, i + 1)];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const len = Math.sqrt(tx * tx + ty * ty);
      if (len < 0.001) { tx = 0; ty = -1; } else { tx /= len; ty /= len; }

      const nx = -ty;
      const ny = tx;

      const pt = pts[i];
      leftEdge.push({ x: pt.x + nx * width, y: pt.y + ny * width });
      rightEdge.push({ x: pt.x - nx * width, y: pt.y - ny * width });
    }
    return { leftEdge, rightEdge };
  }

  // Draw ribbon with a convex semicircle base that hugs the cell's bottom.
  // Uses ctx.arc() for a mathematically perfect semi-circle.
  // Note: due to normals, leftEdge[0] is on the +x side, rightEdge[0] on -x.
  function drawRibbonWithArcBase(
    leftEdge: { x: number; y: number }[],
    rightEdge: { x: number; y: number }[],
    fill: CanvasGradient | string,
    arcRadius: number,
  ) {
    const lBase = leftEdge[0];  // +x side (right on screen)
    // rBase = rightEdge[0] is the -x side; not referenced directly since
    // the arc connects back from rightEdge[0] to lBase automatically.

    ctx.beginPath();

    // Start at lBase (+x side)
    ctx.moveTo(lBase.x, lBase.y);

    // Left edge upward (base → tip) — "left" array but actually right side
    for (let i = 1; i < leftEdge.length; i++) {
      if (i < leftEdge.length - 1) {
        const mx = (leftEdge[i].x + leftEdge[i + 1].x) / 2;
        const my = (leftEdge[i].y + leftEdge[i + 1].y) / 2;
        ctx.quadraticCurveTo(leftEdge[i].x, leftEdge[i].y, mx, my);
      } else {
        ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
      }
    }

    // Right edge downward (tip → base) — ends at rBase (-x side)
    for (let i = rightEdge.length - 1; i >= 0; i--) {
      if (i > 0) {
        const mx = (rightEdge[i].x + rightEdge[i - 1].x) / 2;
        const my = (rightEdge[i].y + rightEdge[i - 1].y) / 2;
        ctx.quadraticCurveTo(rightEdge[i].x, rightEdge[i].y, mx, my);
      } else {
        ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
      }
    }

    // Semicircle arc from rBase (-x) through bottom (+y) to lBase (+x)
    // counterclockwise=true: goes from π → π/2 → 0 (left → bottom → right)
    ctx.arc(0, 0, arcRadius, Math.PI, 0, true);

    ctx.fillStyle = fill;
    ctx.fill();
  }

  // ── Outer flame ribbon (orange → yellow → red) ──
  {
    const { leftEdge, rightEdge } = buildRibbon(trail, baseHalfW);
    const flickerA = 0.5 + 0.5 * Math.sin(time * 11.66 + state.p5);
    const outerAlpha = 0.6 + flickerA * 0.15;
    const grad = ctx.createLinearGradient(0, trail[0].y, trail[n - 1].x, tipY);
    grad.addColorStop(0, `rgba(255,200,50,${outerAlpha})`);
    grad.addColorStop(0.15, `rgba(255,150,20,${outerAlpha})`);
    grad.addColorStop(0.4, `rgba(255,80,10,${outerAlpha * 0.85})`);
    grad.addColorStop(0.7, `rgba(200,40,0,${outerAlpha * 0.5})`);
    grad.addColorStop(1, `rgba(150,20,0,0)`);
    drawRibbonWithArcBase(leftEdge, rightEdge, grad, baseHalfW);
  }

  // ── Inner flame ribbon (blue core) — narrower, shorter ──
  {
    const innerTrail: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      innerTrail.push({ x: trail[i].x * 0.7, y: trail[i].y * 0.6 });
      if (t > 0.65) break;
    }
    const innerN = innerTrail.length;
    if (innerN >= 3) {
      const innerHalfW = baseHalfW * 0.5;
      const { leftEdge, rightEdge } = buildRibbon(innerTrail, innerHalfW);
      const flickerB = 0.5 + 0.5 * Math.sin(time * 16.74 + state.p3);
      const innerAlpha = 0.75 + flickerB * 0.2;
      const tipPt = innerTrail[innerN - 1];
      const grad = ctx.createLinearGradient(0, innerTrail[0].y, tipPt.x, tipPt.y);
      grad.addColorStop(0, `rgba(80,140,255,${innerAlpha})`);
      grad.addColorStop(0.2, `rgba(40,100,255,${innerAlpha * 0.95})`);
      grad.addColorStop(0.55, `rgba(20,60,220,${innerAlpha * 0.7})`);
      grad.addColorStop(1, `rgba(10,30,180,0)`);
      drawRibbonWithArcBase(leftEdge, rightEdge, grad, innerHalfW);
    }
  }

  // ── Hot core spot at the very base ──
  if (sr >= 20) {
    const corePulse = 0.5 + 0.5 * Math.sin(time * 10.0 + state.p2);
    const coreR = radius * 0.18;
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    coreGrad.addColorStop(0, `rgba(140,180,255,${0.5 + corePulse * 0.15})`);
    coreGrad.addColorStop(0.5, `rgba(60,100,255,${0.25 + corePulse * 0.1})`);
    coreGrad.addColorStop(1, "rgba(40,80,220,0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, PI2);
    ctx.fill();
  }

  ctx.restore();
}, "premium");

// ── Glitch ─────────────────────────────────────────────────
// RGB channel shift — LOD-scaled segments, no shadow (already had none).

registerEffect("glitch", "Glitch", "Digital distortion and RGB shift effect", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  ctx.save();

  const segments = sr < 40 ? 12 : 20;
  const segAngle = PI2 / segments;
  const lineW = Math.max(3, radius * 0.04);
  const glitchSpeed = 8;
  const glitchSeed = Math.floor(time * glitchSpeed);

  for (let i = 0; i < segments; i++) {
    const a0 = i * segAngle;
    const a1 = (i + 1) * segAngle;
    const hash = ((glitchSeed * 31 + i * 127) & 0xFFFF) / 0xFFFF;
    const isGlitched = hash < 0.35;

    if (isGlitched) {
      const offset = Math.max(2, radius * 0.03) * (0.5 + hash);

      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02 + offset, a0, a1);
      ctx.strokeStyle = `rgba(255,0,0,0.7)`;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02 - offset, a0, a1);
      ctx.strokeStyle = `rgba(0,255,0,0.7)`;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02, a0, a1);
      ctx.strokeStyle = `rgba(0,0,255,0.7)`;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02, a0, a1);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`;
      ctx.lineWidth = Math.max(1.5, radius * 0.015);
      ctx.stroke();
    }
  }

  // Scanlines (skip at low LOD)
  if (sr > 25) {
    for (let i = 0; i < 3; i++) {
      const scanHash = ((glitchSeed * 17 + i * 89) & 0xFFFF) / 0xFFFF;
      if (scanHash < 0.5) continue;
      const y = (scanHash - 0.5) * 2 * radius * 1.1 - radius * 0.55;
      const barHeight = Math.max(1.5, radius * 0.015);
      const barAlpha = 0.15 + scanHash * 0.25;

      ctx.fillStyle = `rgba(255,255,255,${barAlpha})`;
      ctx.fillRect(-radius * 1.1, y, radius * 2.2, barHeight);
    }
  }

  ctx.restore();
}, "premium");

// ── Black Hole ─────────────────────────────────────────────
// Gravitational lensing — radial gradient (GPU), ring strokes (no shadow).

registerEffect("blackhole", "Black Hole", "Warps space around your cell like a gravity well", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();

  const warpRadius = radius * 2.2;

  // Dark void gradient (GPU-accelerated)
  const voidGrad = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, warpRadius);
  voidGrad.addColorStop(0, `rgba(0,0,0,0.45)`);
  voidGrad.addColorStop(0.3, `rgba(5,0,15,0.25)`);
  voidGrad.addColorStop(0.6, `rgba(10,0,20,0.1)`);
  voidGrad.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = voidGrad;
  ctx.beginPath();
  ctx.arc(0, 0, warpRadius, 0, PI2);
  ctx.fill();

  // Photon sphere — wide soft ring simulates glow
  const photonPulse = 0.5 + 0.5 * Math.sin(time * 2.5);

  ctx.strokeStyle = `rgba(180,120,255,${0.1 + photonPulse * 0.08})`;
  ctx.lineWidth = Math.max(6, radius * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.08, 0, PI2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(200,150,255,${0.4 + photonPulse * 0.3})`;
  ctx.lineWidth = Math.max(2.5, radius * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.08, 0, PI2);
  ctx.stroke();

  if (sr > 20) {
    // Inner photon ring
    ctx.strokeStyle = `rgba(240,200,255,${0.3 + photonPulse * 0.25})`;
    ctx.lineWidth = Math.max(1.5, radius * 0.015);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.04, 0, PI2);
    ctx.stroke();
  }

  // Accretion disk + debris
  if (sr > 25) {
    const diskRot = time * 0.5;
    ctx.save();
    ctx.rotate(diskRot);
    const diskDist = radius * 1.25;
    const hue1 = (time * 35) % 360;

    ctx.beginPath();
    ctx.ellipse(0, 0, diskDist, diskDist * 0.25, 0, 0, PI2);
    ctx.strokeStyle = `hsla(${hue1}, 85%, 65%, 0.45)`;
    ctx.lineWidth = Math.max(3, radius * 0.035);
    ctx.stroke();

    const hue2 = (hue1 + 120) % 360;
    ctx.beginPath();
    ctx.ellipse(0, 0, diskDist * 1.1, diskDist * 0.18, Math.PI * 0.3, 0, PI2);
    ctx.strokeStyle = `hsla(${hue2}, 80%, 60%, 0.3)`;
    ctx.lineWidth = Math.max(2, radius * 0.025);
    ctx.stroke();
    ctx.restore();

    // Debris particles (no shadow)
    const debrisCount = sr < 50 ? 5 : 8;
    for (let i = 0; i < debrisCount; i++) {
      const spiralSpeed = 1.2 + i * 0.15;
      const spiralAngle = time * spiralSpeed + i * 0.628;
      const spiralPhase = (time * 0.3 + i * 0.37) % 1;
      const spiralDist = radius * (1.1 + 0.9 * spiralPhase);
      const flatness = 0.3 + 0.4 * Math.sin(i * 1.3);
      const px = Math.cos(spiralAngle) * spiralDist;
      const py = Math.sin(spiralAngle) * spiralDist * flatness;
      const dotSz = Math.max(1.5, radius * 0.015) * (1 - spiralPhase * 0.5);
      const dotAlpha = 0.5 * (1 - spiralPhase);
      const dotHue = (hue1 + i * 36) % 360;

      ctx.beginPath();
      ctx.arc(px, py, dotSz, 0, PI2);
      ctx.fillStyle = `hsla(${dotHue}, 70%, 70%, ${dotAlpha})`;
      ctx.fill();
    }
  }

  ctx.restore();
}, "premium");

// ── Trail ───────────────────────────────────────────────────
// Motion trail ribbon — rendered by the main renderer's trail system, not here.
// This registration just makes it appear in the effect picker.

registerEffect("trail", "Trail", "Smooth ribbon trail following your cell", () => {
  // No-op: trail rendering is handled by the renderer's drawTrails() system
}, "premium");

// ── Plasma ─────────────────────────────────────────────────
// Swirling plasma orbs with energy arcs between them.

const PLASMA_MAX = 8;
const plasmaStates = new Map<string, { angles: Float32Array; speeds: Float32Array; radii: Float32Array }>();

registerEffect("plasma", "Plasma", "Swirling plasma orbs linked by energy arcs", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 4 : Math.min(PLASMA_MAX, Math.floor(radius / 15));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let s = plasmaStates.get(cellKey);
  if (!s) {
    const angles = new Float32Array(PLASMA_MAX);
    const speeds = new Float32Array(PLASMA_MAX);
    const radii = new Float32Array(PLASMA_MAX);
    for (let i = 0; i < PLASMA_MAX; i++) {
      angles[i] = (i / PLASMA_MAX) * PI2;
      speeds[i] = 0.4 + Math.random() * 0.4;
      radii[i] = 0.8 + Math.random() * 0.3;
    }
    s = { angles, speeds, radii };
    plasmaStates.set(cellKey, s);
  }

  ctx.save();
  const orbSize = Math.max(3, radius * 0.06);

  // Draw energy arcs between adjacent orbs
  if (sr > 25) {
    ctx.lineWidth = Math.max(2, radius * 0.015);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ai = s.angles[i] + time * s.speeds[i];
      const aj = s.angles[j] + time * s.speeds[j];
      const di = radius * 1.08 * s.radii[i];
      const dj = radius * 1.08 * s.radii[j];
      const x1 = Math.cos(ai) * di, y1 = Math.sin(ai) * di;
      const x2 = Math.cos(aj) * dj, y2 = Math.sin(aj) * dj;
      const hue = (time * 60 + i * 45) % 360;
      ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${0.15 + 0.1 * Math.sin(time * 3 + i)})`;
      ctx.beginPath();
      const mx = (x1 + x2) / 2 + Math.sin(time * 4 + i) * radius * 0.1;
      const my = (y1 + y2) / 2 + Math.cos(time * 4 + i) * radius * 0.1;
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
    }
  }

  // Draw plasma orbs
  for (let i = 0; i < count; i++) {
    const angle = s.angles[i] + time * s.speeds[i];
    const dist = radius * 1.08 * s.radii[i];
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const hue = (time * 60 + i * 45) % 360;

    // Outer glow
    ctx.beginPath();
    ctx.arc(px, py, orbSize * 2.5, 0, PI2);
    ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.1)`;
    ctx.fill();

    // Core orb
    ctx.beginPath();
    ctx.arc(px, py, orbSize, 0, PI2);
    ctx.fillStyle = `hsla(${hue}, 100%, 75%, 0.8)`;
    ctx.fill();
  }
  ctx.restore();
}, "premium");

// ── Fairy Dust ─────────────────────────────────────────────
// Sparkly golden particles with trailing shimmer.

const FAIRY_MAX = 20;
interface FairyParticle { angle: number; dist: number; speed: number; size: number; phase: number; hue: number }
const fairyStates = new Map<string, FairyParticle[]>();

registerEffect("fairy_dust", "Fairy Dust", "Sparkling golden particles with magical shimmer", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 8 : Math.min(FAIRY_MAX, Math.floor(radius / 6));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let particles = fairyStates.get(cellKey);
  if (!particles) {
    particles = [];
    for (let i = 0; i < FAIRY_MAX; i++) {
      particles.push({
        angle: Math.random() * PI2,
        dist: 0.95 + Math.random() * 0.4,
        speed: 0.15 + Math.random() * 0.35,
        size: 0.5 + Math.random() * 1.5,
        phase: Math.random() * PI2,
        hue: 35 + Math.random() * 30, // gold-amber range
      });
    }
    fairyStates.set(cellKey, particles);
  }

  ctx.save();
  for (let fi = 0; fi < count; fi++) {
    const p = particles[fi];
    const angle = p.angle + time * p.speed;
    const wobble = Math.sin(time * 2.5 + p.phase) * radius * 0.04;
    const dist = radius * p.dist + wobble;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(time * 4 + p.phase));
    const sz = p.size * Math.max(1.5, radius * 0.012);

    // Glow
    ctx.beginPath();
    ctx.arc(px, py, sz * 3, 0, PI2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${twinkle * 0.12})`;
    ctx.fill();

    // Sparkle core
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 85%, ${twinkle * 0.9})`;
    ctx.fill();

    // Star cross highlight
    if (sr > 30 && twinkle > 0.7) {
      ctx.strokeStyle = `hsla(${p.hue}, 100%, 95%, ${(twinkle - 0.7) * 2})`;
      ctx.lineWidth = Math.max(0.5, sz * 0.4);
      ctx.beginPath();
      ctx.moveTo(px - sz * 2, py); ctx.lineTo(px + sz * 2, py);
      ctx.moveTo(px, py - sz * 2); ctx.lineTo(px, py + sz * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}, "premium");

// ── Vortex ─────────────────────────────────────────────────
// Spinning spiral arms with trailing particles.

registerEffect("vortex", "Vortex", "Spinning spiral arms pulling particles inward", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  const armCount = 3;
  const dotsPerArm = sr < 30 ? 6 : Math.min(12, Math.floor(radius / 10));

  ctx.save();
  const spin = time * 1.5;

  for (let a = 0; a < armCount; a++) {
    const armBase = (a / armCount) * PI2 + spin;
    for (let d = 0; d < dotsPerArm; d++) {
      const t = d / dotsPerArm;
      const spiralAngle = armBase + t * 2.5;
      const dist = radius * (0.85 + t * 0.45);
      const px = Math.cos(spiralAngle) * dist;
      const py = Math.sin(spiralAngle) * dist;
      const alpha = (1 - t) * 0.7 + 0.1;
      const sz = Math.max(1.5, radius * 0.02 * (1 - t * 0.5));

      ctx.beginPath();
      ctx.arc(px, py, sz, 0, PI2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    }
  }

  // Outer ring glow
  const pulse = 0.5 + 0.5 * Math.sin(time * 2);
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.08 + pulse * 0.06})`;
  ctx.lineWidth = Math.max(4, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.05, 0, PI2);
  ctx.stroke();

  ctx.restore();
}, "premium");

// ── Toxic ──────────────────────────────────────────────────
// Bubbling green poison — bubbles rise from the border, wobble, and pop.

const TOXIC_MAX = 16;
const TOXIC_LIFETIME = 3.0; // seconds until a bubble pops
const TOXIC_POP_DUR = 0.35; // pop animation duration

interface ToxicBubble {
  angle: number;       // spawn angle on border
  birthTime: number;   // time when spawned
  riseSpeed: number;   // how fast it floats outward (fraction of radius/sec)
  wobblePhase: number; // phase offset for side-to-side wobble
  wobbleAmp: number;   // wobble amplitude (radians)
  size: number;        // base size multiplier
  lifetime: number;    // per-bubble lifetime (adds variety)
}

function spawnToxicBubble(time: number): ToxicBubble {
  return {
    angle: Math.random() * PI2,
    birthTime: time - Math.random() * 0.1, // tiny jitter so they don't all sync
    riseSpeed: 0.06 + Math.random() * 0.06,
    wobblePhase: Math.random() * PI2,
    wobbleAmp: 0.02 + Math.random() * 0.04,
    size: 0.4 + Math.random() * 1.0,
    lifetime: TOXIC_LIFETIME * (0.7 + Math.random() * 0.6), // 2.1–3.9 s
  };
}

const toxicStates = new Map<string, ToxicBubble[]>();

registerEffect("toxic", "Toxic", "Bubbling poison clouds and dripping acid", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 6 : Math.min(TOXIC_MAX, Math.floor(radius / 8));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let bubbles = toxicStates.get(cellKey);
  if (!bubbles) {
    bubbles = [];
    for (let i = 0; i < TOXIC_MAX; i++) {
      const b = spawnToxicBubble(time);
      // Stagger initial births so they don't all pop at once
      b.birthTime = time - Math.random() * b.lifetime;
      bubbles.push(b);
    }
    toxicStates.set(cellKey, bubbles);
  }

  ctx.save();

  // Toxic mist ring
  const pulse = 0.5 + 0.5 * Math.sin(time * 1.8);
  ctx.strokeStyle = `rgba(40,220,40,${0.1 + pulse * 0.08})`;
  ctx.lineWidth = Math.max(6, radius * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.06, 0, PI2);
  ctx.stroke();

  // Bubbles rising & popping
  for (let ti = 0; ti < count; ti++) {
    let b = bubbles[ti];
    const age = time - b.birthTime;

    // Respawn if past lifetime + pop duration
    if (age > b.lifetime + TOXIC_POP_DUR) {
      bubbles[ti] = spawnToxicBubble(time);
      b = bubbles[ti];
    }

    const life = b.lifetime;
    const popping = age > life; // in pop phase?
    const popProgress = popping ? (age - life) / TOXIC_POP_DUR : 0; // 0→1

    // Rise: bubble floats outward from the border
    const riseT = Math.min(age, life) / life; // 0→1 over lifetime
    const riseDist = riseT * b.riseSpeed * radius * 4; // total outward travel
    const baseDist = radius * 1.0 + riseDist;

    // Wobble side-to-side
    const wobble = Math.sin(time * 3 + b.wobblePhase) * b.wobbleAmp;
    const angle = b.angle + wobble;

    const px = Math.cos(angle) * baseDist;
    const py = Math.sin(angle) * baseDist;

    // Size: grows slightly as it rises, then expands on pop
    const growFactor = 1 + riseT * 0.3;
    const popScale = popping ? 1 + popProgress * 1.8 : 1;
    const sz = b.size * Math.max(2, radius * 0.025) * growFactor * popScale;

    // Alpha: fades in, fades out on pop
    const fadeIn = Math.min(1, age * 4); // quick fade-in
    const popAlpha = popping ? Math.max(0, 1 - popProgress) : 1;
    const alpha = fadeIn * popAlpha * (0.4 + 0.3 * Math.abs(Math.sin(time * 1.5 + b.wobblePhase)));

    if (alpha < 0.01) continue;

    if (popping) {
      // Pop ring effect — expanding fading ring
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, PI2);
      ctx.strokeStyle = `rgba(100,255,100,${alpha * 0.8})`;
      ctx.lineWidth = Math.max(1, sz * 0.15 * (1 - popProgress));
      ctx.stroke();
      // Inner splatter dots
      if (sr > 20) {
        for (let d = 0; d < 4; d++) {
          const da = b.wobblePhase + d * (PI2 / 4) + popProgress * 1.5;
          const dd = sz * (0.4 + popProgress * 0.8);
          ctx.beginPath();
          ctx.arc(px + Math.cos(da) * dd, py + Math.sin(da) * dd, sz * 0.12 * (1 - popProgress), 0, PI2);
          ctx.fillStyle = `rgba(60,255,60,${alpha * 0.6})`;
          ctx.fill();
        }
      }
    } else {
      // Normal bubble body
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, PI2);
      ctx.fillStyle = `rgba(60,255,60,${alpha * 0.25})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(80,255,80,${alpha * 0.65})`;
      ctx.lineWidth = Math.max(1, sz * 0.2);
      ctx.stroke();

      // Highlight spot
      if (sr > 25) {
        ctx.beginPath();
        ctx.arc(px - sz * 0.3, py - sz * 0.3, sz * 0.25, 0, PI2);
        ctx.fillStyle = `rgba(200,255,200,${alpha * 0.5})`;
        ctx.fill();
      }
    }
  }
  ctx.restore();
}, "premium");

// ── Crystal ────────────────────────────────────────────────
// Rotating gem facets reflecting prismatic light.

registerEffect("crystal", "Crystal", "Rotating gemstone facets with prismatic reflections", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const facetCount = 10; // fixed count so positions don't jump on resize

  ctx.save();
  const spin = time * 0.4;

  for (let i = 0; i < facetCount; i++) {
    const baseAngle = (i / facetCount) * PI2 + spin;
    const dist = radius * 1.05;
    const px = Math.cos(baseAngle) * dist;
    const py = Math.sin(baseAngle) * dist;
    const sz = Math.max(4, radius * 0.07);
    const hue = (i * (360 / facetCount) + time * 40) % 360;
    const shimmer = 0.4 + 0.6 * Math.abs(Math.sin(time * 3 + i * 1.5));

    // Draw diamond shape
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(baseAngle) * sz, py + Math.sin(baseAngle) * sz);
    ctx.lineTo(px + Math.cos(baseAngle + Math.PI / 2) * sz * 0.5, py + Math.sin(baseAngle + Math.PI / 2) * sz * 0.5);
    ctx.lineTo(px - Math.cos(baseAngle) * sz * 0.4, py - Math.sin(baseAngle) * sz * 0.4);
    ctx.lineTo(px + Math.cos(baseAngle - Math.PI / 2) * sz * 0.5, py + Math.sin(baseAngle - Math.PI / 2) * sz * 0.5);
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${shimmer * 0.6})`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 90%, 85%, ${shimmer * 0.8})`;
    ctx.lineWidth = Math.max(1, sz * 0.1);
    ctx.stroke();
  }

  // Inner glow ring
  const ringHue = (time * 50) % 360;
  ctx.strokeStyle = `hsla(${ringHue}, 80%, 70%, 0.12)`;
  ctx.lineWidth = Math.max(3, radius * 0.04);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.02, 0, PI2);
  ctx.stroke();

  ctx.restore();
}, "premium");

// ── Solar Flare ────────────────────────────────────────────
// Fiery solar prominences erupting from the cell surface.

const FLARE_MAX = 8;
const flareStates = new Map<string, { angles: Float32Array; heights: Float32Array; phases: Float32Array; widths: Float32Array }>();

registerEffect("solar_flare", "Solar Flare", "Erupting solar prominences and coronal arcs", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 4 : Math.min(FLARE_MAX, Math.floor(radius / 14));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let s = flareStates.get(cellKey);
  if (!s) {
    const angles = new Float32Array(FLARE_MAX);
    const heights = new Float32Array(FLARE_MAX);
    const phases = new Float32Array(FLARE_MAX);
    const widths = new Float32Array(FLARE_MAX);
    for (let i = 0; i < FLARE_MAX; i++) {
      angles[i] = (i / FLARE_MAX) * PI2 + Math.random() * 0.3;
      heights[i] = 0.15 + Math.random() * 0.25;
      phases[i] = Math.random() * PI2;
      widths[i] = 0.08 + Math.random() * 0.08;
    }
    s = { angles, heights, phases, widths };
    flareStates.set(cellKey, s);
  }

  ctx.save();

  // Corona glow
  const coronaPulse = 0.5 + 0.5 * Math.sin(time * 1.2);
  ctx.strokeStyle = `rgba(255,180,40,${0.08 + coronaPulse * 0.06})`;
  ctx.lineWidth = Math.max(6, radius * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.05, 0, PI2);
  ctx.stroke();

  // Prominences
  for (let i = 0; i < count; i++) {
    const angle = s.angles[i] + Math.sin(time * 0.3 + s.phases[i]) * 0.1;
    const height = s.heights[i] * radius * (0.7 + 0.3 * Math.sin(time * 1.5 + s.phases[i]));
    const width = s.widths[i] * radius;
    const baseX = Math.cos(angle) * radius;
    const baseY = Math.sin(angle) * radius;
    const tipX = Math.cos(angle) * (radius + height);
    const tipY = Math.sin(angle) * (radius + height);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    const alpha = 0.4 + 0.3 * Math.sin(time * 2 + s.phases[i]);

    ctx.beginPath();
    ctx.moveTo(baseX - perpX * width, baseY - perpY * width);
    ctx.quadraticCurveTo(
      tipX + perpX * width * 0.5 * Math.sin(time * 3 + i),
      tipY + perpY * width * 0.5 * Math.sin(time * 3 + i),
      tipX, tipY
    );
    ctx.quadraticCurveTo(
      tipX - perpX * width * 0.5 * Math.sin(time * 3 + i),
      tipY - perpY * width * 0.5 * Math.sin(time * 3 + i),
      baseX + perpX * width, baseY + perpY * width
    );
    ctx.closePath();
    ctx.fillStyle = `rgba(255,${140 + Math.floor(80 * Math.sin(time + i))},30,${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}, "premium");

// ── Void Rift ──────────────────────────────────────────────
// Purple interdimensional cracks/tears radiating outward.

registerEffect("void_rift", "Void Rift", "Interdimensional cracks tearing through space", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const crackCount = 8; // fixed count so cracks don't jump on resize

  ctx.save();

  // Void aura
  const auraPulse = 0.5 + 0.5 * Math.sin(time * 1.5);
  ctx.strokeStyle = `rgba(140,40,220,${0.1 + auraPulse * 0.08})`;
  ctx.lineWidth = Math.max(6, radius * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.04, 0, PI2);
  ctx.stroke();

  // Cracks
  ctx.lineCap = "round";
  for (let i = 0; i < crackCount; i++) {
    const baseAngle = (i / crackCount) * PI2 + time * 0.2;
    const segments = sr < 40 ? 3 : 5;
    const crackAlpha = 0.5 + 0.4 * Math.sin(time * 2.5 + i * 1.8);

    // Main crack line (jagged)
    ctx.strokeStyle = `rgba(180,80,255,${crackAlpha})`;
    ctx.lineWidth = Math.max(2, radius * 0.02);
    ctx.beginPath();
    let cx = Math.cos(baseAngle) * radius;
    let cy = Math.sin(baseAngle) * radius;
    ctx.moveTo(cx, cy);
    for (let s = 0; s < segments; s++) {
      const t = (s + 1) / segments;
      const len = radius * 0.35;
      const jitter = Math.sin(time * 5 + i * 3 + s * 2) * radius * 0.04;
      cx = Math.cos(baseAngle + jitter * 0.02) * (radius + len * t);
      cy = Math.sin(baseAngle + jitter * 0.02) * (radius + len * t) + jitter;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Glow around crack
    ctx.strokeStyle = `rgba(160,60,255,${crackAlpha * 0.25})`;
    ctx.lineWidth = Math.max(5, radius * 0.05);
    ctx.beginPath();
    ctx.moveTo(Math.cos(baseAngle) * radius, Math.sin(baseAngle) * radius);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    // Energy particles at crack tips
    if (sr > 30) {
      const sparkAlpha = 0.5 + 0.5 * Math.sin(time * 6 + i);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, radius * 0.02), 0, PI2);
      ctx.fillStyle = `rgba(220,160,255,${sparkAlpha})`;
      ctx.fill();
    }
  }
  ctx.restore();
}, "premium");

// ── Autumn ─────────────────────────────────────────────────
// Falling golden/red/orange leaves drifting around the cell.

const AUTUMN_MAX = 12;
interface AutumnLeaf { angle: number; dist: number; rot: number; rotSpeed: number; drift: number; size: number; variant: number }
const autumnStates = new Map<string, AutumnLeaf[]>();

function drawLeafShape(ctx: CanvasRenderingContext2D, sz: number, variant: number) {
  // Simple leaf silhouette using bezier curves
  const colors = [
    ["rgba(220,160,30,0.8)", "rgba(180,120,20,0.6)"],   // gold
    ["rgba(210,60,30,0.8)", "rgba(170,40,20,0.6)"],     // red
    ["rgba(230,120,20,0.8)", "rgba(190,90,15,0.6)"],    // orange
    ["rgba(180,50,50,0.8)", "rgba(140,30,30,0.6)"],     // crimson
  ];
  const [fill, stroke] = colors[variant % colors.length];

  ctx.beginPath();
  ctx.moveTo(0, -sz);
  ctx.bezierCurveTo(sz * 0.8, -sz * 0.5, sz * 0.6, sz * 0.3, 0, sz);
  ctx.bezierCurveTo(-sz * 0.6, sz * 0.3, -sz * 0.8, -sz * 0.5, 0, -sz);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = sz * 0.1;
  ctx.stroke();

  // Leaf vein
  ctx.beginPath();
  ctx.moveTo(0, -sz * 0.8);
  ctx.lineTo(0, sz * 0.8);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = sz * 0.08;
  ctx.stroke();
}

registerEffect("autumn", "Autumn", "Falling golden and crimson leaves", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 5 : Math.min(AUTUMN_MAX, Math.floor(radius / 10));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let leaves = autumnStates.get(cellKey);
  if (!leaves) {
    leaves = [];
    for (let i = 0; i < AUTUMN_MAX; i++) {
      leaves.push({
        angle: Math.random() * PI2,
        dist: 0.95 + Math.random() * 0.35,
        rot: Math.random() * PI2,
        rotSpeed: 0.5 + Math.random() * 1.5,
        drift: 0.1 + Math.random() * 0.2,
        size: 0.6 + Math.random() * 0.8,
        variant: Math.floor(Math.random() * 4),
      });
    }
    autumnStates.set(cellKey, leaves);
  }

  ctx.save();
  for (let li = 0; li < count; li++) {
    const leaf = leaves[li];
    const angle = leaf.angle + time * leaf.drift;
    const wobble = Math.sin(time * 1.5 + leaf.rot) * radius * 0.03;
    const dist = radius * leaf.dist + wobble;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const sz = leaf.size * Math.max(3, radius * 0.04);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(leaf.rot + time * leaf.rotSpeed);
    drawLeafShape(ctx, sz, leaf.variant);
    ctx.restore();
  }
  ctx.restore();
}, "premium");

// ── Bubble ─────────────────────────────────────────────────
// Floating translucent soap bubbles.

const BUBBLE_MAX = 14;
interface SoapBubble { angle: number; dist: number; size: number; speed: number; phase: number; hueShift: number }
const bubbleStates = new Map<string, SoapBubble[]>();

registerEffect("bubble", "Bubble", "Floating iridescent soap bubbles", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 5 : Math.min(BUBBLE_MAX, Math.floor(radius / 9));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let bubbles = bubbleStates.get(cellKey);
  if (!bubbles) {
    bubbles = [];
    for (let i = 0; i < BUBBLE_MAX; i++) {
      bubbles.push({
        angle: Math.random() * PI2,
        dist: 0.92 + Math.random() * 0.4,
        size: 0.5 + Math.random() * 1.3,
        speed: 0.08 + Math.random() * 0.15,
        phase: Math.random() * PI2,
        hueShift: Math.random() * 360,
      });
    }
    bubbleStates.set(cellKey, bubbles);
  }

  ctx.save();
  for (let bi = 0; bi < count; bi++) {
    const b = bubbles[bi];
    const angle = b.angle + time * b.speed;
    const float = Math.sin(time * 1.5 + b.phase) * radius * 0.03;
    const dist = radius * b.dist + float;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const sz = b.size * Math.max(3, radius * 0.035);
    const hue = (b.hueShift + time * 30) % 360;

    // Bubble body
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.fillStyle = `hsla(${hue}, 60%, 70%, 0.12)`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 70%, 80%, 0.45)`;
    ctx.lineWidth = Math.max(1, sz * 0.12);
    ctx.stroke();

    // Specular highlight
    if (sr > 25) {
      ctx.beginPath();
      ctx.arc(px - sz * 0.3, py - sz * 0.35, sz * 0.3, 0, PI2);
      ctx.fillStyle = `rgba(255,255,255,0.35)`;
      ctx.fill();
      // Small secondary highlight
      ctx.beginPath();
      ctx.arc(px + sz * 0.15, py + sz * 0.2, sz * 0.12, 0, PI2);
      ctx.fillStyle = `rgba(255,255,255,0.2)`;
      ctx.fill();
    }
  }
  ctx.restore();
}, "premium");

// ── Pulse Wave ─────────────────────────────────────────────
// Expanding concentric energy ripples radiating outward.

registerEffect("pulse_wave", "Pulse Wave", "Expanding energy ripples radiating from your cell", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  const waveCount = sr < 30 ? 2 : 4;

  ctx.save();

  for (let i = 0; i < waveCount; i++) {
    // Each wave has a different phase so they're staggered
    const phase = (time * 0.8 + i * (1 / waveCount)) % 1;
    const waveRadius = radius * (1.0 + phase * 0.5);
    const alpha = (1 - phase) * 0.4;
    const width = Math.max(2, radius * 0.02 * (1 - phase * 0.5));

    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(0, 0, waveRadius, 0, PI2);
    ctx.stroke();

    // Second ring — slightly wider and dimmer for depth
    if (sr > 30) {
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.3})`;
      ctx.lineWidth = width * 3;
      ctx.beginPath();
      ctx.arc(0, 0, waveRadius, 0, PI2);
      ctx.stroke();
    }
  }

  // Core shimmer
  const corePulse = 0.5 + 0.5 * Math.sin(time * 4);
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.06 + corePulse * 0.06})`;
  ctx.lineWidth = Math.max(4, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.01, 0, PI2);
  ctx.stroke();

  ctx.restore();
}, "premium");

// ── Aurora Borealis ─────────────────────────────────────────
// Shimmering curtains of coloured light rippling around the cell.

registerEffect("aurora", "Aurora Borealis", "Shimmering northern-light curtains around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const bands = sr < 30 ? 3 : 5;
  const bandWidth = Math.max(3, radius * 0.04);
  for (let b = 0; b < bands; b++) {
    const phase = time * 1.2 + b * 1.1;
    const hue = (b * 72 + time * 25) % 360;
    const segments = sr < 40 ? 20 : 40;
    ctx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * PI2;
      const wave = Math.sin(angle * 3 + phase) * radius * 0.04 +
                   Math.sin(angle * 7 + phase * 1.5) * radius * 0.02;
      const dist = radius * (1.04 + b * 0.035) + wave;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const alpha = (0.25 - b * 0.04) * (0.6 + 0.4 * Math.sin(phase * 0.7));
    ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
    ctx.lineWidth = bandWidth;
    ctx.stroke();
  }
  ctx.restore();
}, "premium");

// ── Meteor Shower ──────────────────────────────────────────
// Small shooting-star meteors streak past the cell with tiny trails.

registerEffect("meteor", "Meteor Shower", "Shooting-star meteors streaking around your cell", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const count = sr < 30 ? 4 : 8;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const speed = 1.5 + (i % 3) * 0.6;
    const angle = ((time * speed + i * 2.37) % PI2);
    const dist = radius * (1.05 + 0.15 * Math.sin(time * 0.8 + i * 1.3));
    const hx = Math.cos(angle) * dist;
    const hy = Math.sin(angle) * dist;
    const trailLen = radius * 0.18;
    const tx = Math.cos(angle - 0.25) * (dist + trailLen);
    const ty = Math.sin(angle - 0.25) * (dist + trailLen);
    const alpha = 0.5 + 0.4 * Math.sin(time * 3 + i);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.5})`;
    ctx.lineWidth = Math.max(2, radius * 0.02);
    ctx.stroke();
    // Bright head
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(2, radius * 0.018), 0, PI2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}, "premium");

// ── Hologram ───────────────────────────────────────────────
// Sci-fi holographic wireframe ring with scan line.

registerEffect("hologram", "Hologram", "Futuristic holographic wireframe projection", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const segments = sr < 30 ? 10 : 16;
  const spin = time * 0.8;
  // Wireframe ring
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * PI2 + spin;
    const a1 = ((i + 1) / segments) * PI2 + spin;
    const d0 = radius * (1.06 + 0.03 * Math.sin(time * 4 + i * 1.2));
    const d1 = radius * (1.06 + 0.03 * Math.sin(time * 4 + (i + 1) * 1.2));
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * d0, Math.sin(a0) * d0);
    ctx.lineTo(Math.cos(a1) * d1, Math.sin(a1) * d1);
    const flicker = 0.3 + 0.5 * Math.abs(Math.sin(time * 6 + i));
    ctx.strokeStyle = `rgba(0,220,255,${flicker})`;
    ctx.lineWidth = Math.max(1.5, radius * 0.012);
    ctx.stroke();
  }
  // Horizontal scan line
  if (sr > 20) {
    const scanY = radius * 1.1 * Math.sin(time * 2);
    ctx.beginPath();
    ctx.moveTo(-radius * 1.1, scanY);
    ctx.lineTo(radius * 1.1, scanY);
    ctx.strokeStyle = `rgba(0,255,220,0.15)`;
    ctx.lineWidth = Math.max(2, radius * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}, "premium");

// ── Sandstorm ──────────────────────────────────────────────
// Swirling sand particles in a dust storm.

registerEffect("sandstorm", "Sandstorm", "Whirling sand and dust particles around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const count = sr < 30 ? 15 : 30;
  for (let i = 0; i < count; i++) {
    const seed = i * 73.37;
    const orbit = time * (0.4 + (i % 5) * 0.15) + seed;
    const dist = radius * (0.95 + 0.3 * ((Math.sin(seed + time * 0.5) + 1) / 2));
    const px = Math.cos(orbit) * dist;
    const py = Math.sin(orbit) * dist;
    const sz = Math.max(1, radius * (0.008 + 0.01 * Math.sin(seed)));
    const alpha = 0.2 + 0.4 * Math.abs(Math.sin(time * 2 + seed));
    const shade = 180 + Math.floor(40 * Math.sin(seed));
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.fillStyle = `rgba(${shade},${shade - 30},${shade - 80},${alpha})`;
    ctx.fill();
  }
  // Dusty haze ring
  ctx.strokeStyle = `rgba(200,170,120,${0.06 + 0.03 * Math.sin(time * 1.5)})`;
  ctx.lineWidth = Math.max(6, radius * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.06, 0, PI2);
  ctx.stroke();
  ctx.restore();
}, "premium");

// ── Snowfall ───────────────────────────────────────────────
// Gentle snowflakes drifting down around the cell.

registerEffect("snowfall", "Snowfall", "Gentle snowflakes softly drifting around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const count = sr < 30 ? 10 : 20;
  for (let i = 0; i < count; i++) {
    const seed = i * 47.83;
    const x = Math.sin(seed) * radius * 1.2 + Math.sin(time * 0.7 + seed) * radius * 0.15;
    const fallCycle = ((time * 0.3 + seed * 0.01) % 1.0);
    const y = -radius * 1.3 + fallCycle * radius * 2.6;
    const alpha = Math.sin(fallCycle * Math.PI) * 0.7;
    const sz = Math.max(1.5, radius * (0.015 + 0.01 * Math.sin(seed * 3)));
    if (alpha > 0.02) {
      // 6-point snowflake
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * PI2;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * sz, y + Math.sin(ang) * sz);
      }
      ctx.strokeStyle = `rgba(230,240,255,${alpha})`;
      ctx.lineWidth = Math.max(0.8, sz * 0.3);
      ctx.stroke();
    }
  }
  // Frosty outer ring
  ctx.strokeStyle = `rgba(200,225,255,${0.08 + 0.04 * Math.sin(time * 1.2)})`;
  ctx.lineWidth = Math.max(4, radius * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.04, 0, PI2);
  ctx.stroke();
  ctx.restore();
}, "premium");

// ── Electric Storm ─────────────────────────────────────────
// Multiple forking lightning bolts arcing outward from the cell surface.

const stormStates = new Map<string, { forks: { angle: number; seed: number; life: number; maxLife: number }[]; timer: number }>();

registerEffect("electric_storm", "Electric Storm", "Violent forking lightning arcing from your cell", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let state = stormStates.get(cellKey);
  if (!state) { state = { forks: [], timer: 0 }; stormStates.set(cellKey, state); }
  const maxForks = sr < 30 ? 3 : 6;
  // Spawn new forks
  if (time - state.timer > 0.12 && state.forks.length < maxForks) {
    state.timer = time;
    state.forks.push({ angle: Math.random() * PI2, seed: Math.random() * 999, life: 0, maxLife: 8 + Math.floor(Math.random() * 10) });
  }
  ctx.save();
  ctx.lineCap = "round";
  let w = 0;
  for (let i = 0; i < state.forks.length; i++) {
    const f = state.forks[i];
    f.life++;
    if (f.life > f.maxLife) continue;
    if (w !== i) state.forks[w] = state.forks[i];
    w++;
    const progress = f.life / f.maxLife;
    const alpha = 1 - progress;
    const segs = sr < 40 ? 5 : 8;
    const length = radius * (0.2 + 0.3 * (1 - progress));
    ctx.beginPath();
    const startX = Math.cos(f.angle) * radius * 1.01;
    const startY = Math.sin(f.angle) * radius * 1.01;
    ctx.moveTo(startX, startY);
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const jitter = Math.sin(f.seed + s * 57.3 + time * 25) * radius * 0.04;
      const d = radius * 1.01 + t * length;
      const a = f.angle + jitter / d;
      ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.strokeStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 120)},${alpha * 0.8})`;
    ctx.lineWidth = Math.max(2, radius * 0.02 * (1 - progress * 0.5));
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.4})`;
    ctx.lineWidth = Math.max(0.5, radius * 0.006);
    ctx.stroke();
  }
  state.forks.length = w;
  ctx.restore();
}, "premium");

// ── Magma ──────────────────────────────────────────────────
// Molten lava cracks glowing between segments, rising embers.

registerEffect("magma", "Magma", "Molten cracks and rising embers of lava", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  // Lava cracks
  const crackCount = sr < 30 ? 6 : 10;
  ctx.lineCap = "round";
  for (let i = 0; i < crackCount; i++) {
    const a = (i / crackCount) * PI2 + Math.sin(time * 0.5 + i) * 0.08;
    const len = radius * (0.06 + 0.1 * Math.sin(time * 1.5 + i * 2.1));
    const sx = Math.cos(a) * radius * 0.98;
    const sy = Math.sin(a) * radius * 0.98;
    const ex = Math.cos(a) * (radius * 0.98 + len);
    const ey = Math.sin(a) * (radius * 0.98 + len);
    const glow = 0.5 + 0.5 * Math.sin(time * 3 + i * 1.7);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = `rgba(255,${80 + Math.floor(glow * 80)},0,${0.5 + glow * 0.4})`;
    ctx.lineWidth = Math.max(2, radius * 0.025);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,100,${glow * 0.3})`;
    ctx.lineWidth = Math.max(0.8, radius * 0.008);
    ctx.stroke();
  }
  // Embers floating upward
  if (sr > 20) {
    const emberCount = sr < 40 ? 6 : 12;
    for (let i = 0; i < emberCount; i++) {
      const seed = i * 31.7;
      const orbit = time * 0.8 + seed;
      const rise = ((time * 0.6 + seed * 0.01) % 1.0);
      const dist = radius * (1.0 + rise * 0.35);
      const px = Math.cos(orbit) * dist;
      const py = Math.sin(orbit) * dist - rise * radius * 0.2;
      const alpha = Math.sin(rise * Math.PI) * 0.7;
      const sz = Math.max(1.2, radius * 0.012);
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, PI2);
      ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.sin(seed) * 60)},30,${alpha})`;
      ctx.fill();
    }
  }
  // Hot glow ring
  ctx.strokeStyle = `rgba(255,100,0,${0.08 + 0.05 * Math.sin(time * 2)})`;
  ctx.lineWidth = Math.max(5, radius * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.03, 0, PI2);
  ctx.stroke();
  ctx.restore();
}, "premium");

// ── Nebula ─────────────────────────────────────────────────
// Soft cosmic gas cloud layers with embedded sparkles.

registerEffect("nebula", "Nebula", "Soft cosmic gas clouds and cosmic dust", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const layers = sr < 30 ? 2 : 4;
  for (let l = 0; l < layers; l++) {
    const hue = (l * 90 + time * 15) % 360;
    const layerDist = radius * (1.05 + l * 0.06);
    const grad = ctx.createRadialGradient(0, 0, layerDist - radius * 0.1, 0, 0, layerDist + radius * 0.15);
    grad.addColorStop(0, `hsla(${hue}, 70%, 50%, 0)`);
    grad.addColorStop(0.4, `hsla(${hue}, 70%, 60%, ${0.10 + 0.05 * Math.sin(time * 1.2 + l)})`);
    grad.addColorStop(1, `hsla(${hue}, 70%, 50%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, layerDist + radius * 0.15, 0, PI2);
    ctx.fill();
  }
  // Embedded sparkles
  if (sr > 20) {
    const sparkCount = sr < 40 ? 6 : 12;
    for (let i = 0; i < sparkCount; i++) {
      const a = time * 0.3 + i * (PI2 / sparkCount);
      const d = radius * (1.02 + 0.18 * Math.sin(time * 0.8 + i * 2));
      const twinkle = Math.abs(Math.sin(time * 4 + i * 1.7));
      const sz = Math.max(1, radius * 0.01) * twinkle;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, sz, 0, PI2);
      ctx.fillStyle = `rgba(255,255,255,${twinkle * 0.6})`;
      ctx.fill();
    }
  }
  ctx.restore();
}, "premium");

// ── Firefly ────────────────────────────────────────────────
// Glowing fireflies lazily orbiting the cell, blinking on and off.

registerEffect("firefly", "Firefly", "Glowing fireflies lazily orbiting and blinking", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const count = sr < 30 ? 5 : 10;
  for (let i = 0; i < count; i++) {
    const seed = i * 53.1;
    const speed = 0.3 + (i % 4) * 0.1;
    const orbit = time * speed + seed;
    const dist = radius * (1.05 + 0.2 * Math.sin(time * 0.4 + seed));
    const wobbleX = Math.sin(time * 1.5 + seed * 2) * radius * 0.06;
    const wobbleY = Math.cos(time * 1.2 + seed * 3) * radius * 0.06;
    const px = Math.cos(orbit) * dist + wobbleX;
    const py = Math.sin(orbit) * dist + wobbleY;
    // Blink pattern
    const blink = Math.max(0, Math.sin(time * (2 + i * 0.3) + seed));
    const glowSz = Math.max(3, radius * 0.03) * (0.5 + blink * 0.5);
    const bodyAlpha = blink * 0.7 + 0.1;
    // Outer glow
    ctx.beginPath();
    ctx.arc(px, py, glowSz * 2, 0, PI2);
    ctx.fillStyle = `rgba(180,255,80,${bodyAlpha * 0.15})`;
    ctx.fill();
    // Body
    ctx.beginPath();
    ctx.arc(px, py, glowSz, 0, PI2);
    ctx.fillStyle = `rgba(200,255,100,${bodyAlpha})`;
    ctx.fill();
  }
  ctx.restore();
}, "premium");

// ── Ocean Wave ─────────────────────────────────────────────
// Flowing water wave arcs rippling around the cell.

registerEffect("ocean_wave", "Ocean Wave", "Flowing water waves rippling around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const waves = sr < 30 ? 2 : 3;
  const segments = sr < 40 ? 24 : 40;
  for (let w = 0; w < waves; w++) {
    const phase = time * (1.5 + w * 0.5) + w * 2;
    const baseDist = radius * (1.03 + w * 0.04);
    ctx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * PI2;
      const wave = Math.sin(angle * 5 + phase) * radius * 0.025 +
                   Math.sin(angle * 3 - phase * 0.7) * radius * 0.015;
      const dist = baseDist + wave;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const alpha = 0.3 - w * 0.08;
    ctx.strokeStyle = `rgba(60,180,255,${alpha})`;
    ctx.lineWidth = Math.max(2, radius * 0.025);
    ctx.stroke();
  }
  // Foam sparkles
  if (sr > 25) {
    for (let i = 0; i < 8; i++) {
      const a = time * 0.6 + i * (PI2 / 8);
      const d = radius * (1.02 + 0.04 * Math.sin(time * 3 + i * 2));
      const twinkle = Math.abs(Math.sin(time * 5 + i * 1.3));
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(1, radius * 0.008), 0, PI2);
      ctx.fillStyle = `rgba(200,240,255,${twinkle * 0.5})`;
      ctx.fill();
    }
  }
  ctx.restore();
}, "premium");

// ── Runic ──────────────────────────────────────────────────
// Magical rune circles orbiting the cell with glowing symbols.

registerEffect("runic", "Runic", "Orbiting magical rune circles and arcane symbols", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const runeCount = sr < 30 ? 4 : 8;
  const spin = time * 0.6;
  for (let i = 0; i < runeCount; i++) {
    const angle = (i / runeCount) * PI2 + spin;
    const dist = radius * 1.12;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const sz = Math.max(4, radius * 0.06);
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i * 1.5));
    // Rune circle
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${pulse * 0.6})`;
    ctx.lineWidth = Math.max(1, sz * 0.15);
    ctx.stroke();
    // Inner cross symbol
    if (sr > 25) {
      const innerSz = sz * 0.5;
      ctx.beginPath();
      ctx.moveTo(px - innerSz, py);
      ctx.lineTo(px + innerSz, py);
      ctx.moveTo(px, py - innerSz);
      ctx.lineTo(px, py + innerSz);
      ctx.strokeStyle = `rgba(${r},${g},${b},${pulse * 0.8})`;
      ctx.lineWidth = Math.max(0.8, sz * 0.1);
      ctx.stroke();
    }
  }
  // Connecting ring
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.08 + 0.04 * Math.sin(time * 1.5)})`;
  ctx.lineWidth = Math.max(1.5, radius * 0.015);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.12, 0, PI2);
  ctx.stroke();
  ctx.restore();
}, "premium");

// ── Pixel Grid ─────────────────────────────────────────────
// Retro pixelated border segments flickering in and out.

registerEffect("pixel_grid", "Pixel Grid", "Retro pixel-art border with flickering blocks", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const blockCount = sr < 30 ? 16 : 28;
  const blockSize = Math.max(3, radius * 0.06);
  const glitchSeed = Math.floor(time * 5);
  for (let i = 0; i < blockCount; i++) {
    const angle = (i / blockCount) * PI2;
    const dist = radius * 1.02;
    const px = Math.cos(angle) * dist - blockSize / 2;
    const py = Math.sin(angle) * dist - blockSize / 2;
    const hash = ((glitchSeed * 17 + i * 89) & 0xFFFF) / 0xFFFF;
    const on = hash > 0.3;
    if (on) {
      const bright = 0.3 + hash * 0.6;
      ctx.fillStyle = `rgba(${r},${g},${b},${bright})`;
      ctx.fillRect(px, py, blockSize, blockSize);
    }
  }
  // Second layer offset (if high LOD)
  if (sr > 35) {
    for (let i = 0; i < blockCount; i++) {
      const angle = (i / blockCount) * PI2 + PI2 / blockCount / 2;
      const dist = radius * 1.08;
      const px = Math.cos(angle) * dist - blockSize * 0.4;
      const py = Math.sin(angle) * dist - blockSize * 0.4;
      const hash = ((glitchSeed * 31 + i * 53) & 0xFFFF) / 0xFFFF;
      if (hash > 0.5) {
        ctx.fillStyle = `rgba(${r},${g},${b},${hash * 0.3})`;
        ctx.fillRect(px, py, blockSize * 0.8, blockSize * 0.8);
      }
    }
  }
  ctx.restore();
}, "premium");

// ── Diamond Dust ───────────────────────────────────────────
// Tiny sparkling diamond shapes drifting around the cell.

registerEffect("diamond_dust", "Diamond Dust", "Tiny brilliant diamonds sparkling around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const count = sr < 30 ? 8 : 16;
  for (let i = 0; i < count; i++) {
    const seed = i * 41.3;
    const orbit = time * (0.3 + (i % 3) * 0.15) + seed;
    const dist = radius * (1.02 + 0.15 * Math.sin(time * 0.6 + seed));
    const px = Math.cos(orbit) * dist;
    const py = Math.sin(orbit) * dist;
    const sz = Math.max(2, radius * 0.02);
    const sparkle = Math.abs(Math.sin(time * 5 + seed * 2));
    const hue = (seed * 30 + time * 60) % 360;
    // Diamond shape (4 points)
    ctx.beginPath();
    ctx.moveTo(px, py - sz);
    ctx.lineTo(px + sz * 0.5, py);
    ctx.lineTo(px, py + sz * 0.6);
    ctx.lineTo(px - sz * 0.5, py);
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 60%, 80%, ${sparkle * 0.6})`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 80%, 95%, ${sparkle * 0.8})`;
    ctx.lineWidth = Math.max(0.5, sz * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}, "premium");

// ── Inferno ────────────────────────────────────────────────
// Intense blazing fire ring — layered animated rings of flame.

registerEffect("inferno", "Inferno", "Intense blazing fire engulfing your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const rings = sr < 30 ? 2 : 3;
  const segments = sr < 40 ? 24 : 36;
  for (let ring = 0; ring < rings; ring++) {
    const baseDist = radius * (1.0 + ring * 0.04);
    const phase = time * (3 + ring) + ring * 1.5;
    ctx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * PI2;
      const flame = Math.abs(Math.sin(angle * 6 + phase)) * radius * 0.05 +
                    Math.abs(Math.sin(angle * 10 + phase * 1.3)) * radius * 0.03;
      const dist = baseDist + flame;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ring === 0 ? 80 : ring === 1 ? 40 : 20;
    const alpha = 0.4 - ring * 0.1;
    ctx.strokeStyle = `rgba(255,${g},0,${alpha})`;
    ctx.lineWidth = Math.max(3, radius * 0.04);
    ctx.stroke();
  }
  // Bright core ring
  ctx.strokeStyle = `rgba(255,200,50,${0.15 + 0.1 * Math.sin(time * 4)})`;
  ctx.lineWidth = Math.max(2, radius * 0.025);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.01, 0, PI2);
  ctx.stroke();
  ctx.restore();
}, "premium");

// ── Spectral ───────────────────────────────────────────────
// Ghost-like afterimage rings expanding and fading.

registerEffect("spectral", "Spectral", "Ghostly afterimage rings expanding from your cell", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const ringCount = sr < 30 ? 3 : 5;
  for (let i = 0; i < ringCount; i++) {
    const cycle = ((time * 0.8 + i * (1.0 / ringCount)) % 1.0);
    const expandDist = radius * (1.0 + cycle * 0.3);
    const alpha = (1 - cycle) * 0.35;
    if (alpha < 0.01) continue;
    ctx.beginPath();
    ctx.arc(0, 0, expandDist, 0, PI2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = Math.max(2, radius * 0.03 * (1 - cycle));
    ctx.stroke();
  }
  // Core glow
  ctx.strokeStyle = `rgba(${r},${g},${b},0.1)`;
  ctx.lineWidth = Math.max(4, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.02, 0, PI2);
  ctx.stroke();
  ctx.restore();
}, "premium");

// ── Gravity Well ───────────────────────────────────────────
// Space-time distortion ripple rings converging inward.

registerEffect("gravity_well", "Gravity Well", "Space-time distortion ripples converging inward", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const ringCount = sr < 30 ? 3 : 5;
  for (let i = 0; i < ringCount; i++) {
    const cycle = ((time * 0.5 + i * (1.0 / ringCount)) % 1.0);
    // Converge inward (large → small)
    const dist = radius * (1.3 - cycle * 0.28);
    const alpha = cycle * (1 - cycle) * 1.5;
    if (alpha < 0.01) continue;
    // Slight wobble
    const segments = sr < 40 ? 20 : 32;
    ctx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * PI2;
      const wobble = Math.sin(angle * 4 + time * 3 + i) * radius * 0.01 * cycle;
      const d = dist + wobble;
      const px = Math.cos(angle) * d;
      const py = Math.sin(angle) * d;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(140,100,255,${alpha * 0.3})`;
    ctx.lineWidth = Math.max(1.5, radius * 0.02);
    ctx.stroke();
  }
  ctx.restore();
}, "premium");

// ── Cyberpunk ──────────────────────────────────────────────
// Neon circuit-board traces running around the cell.

registerEffect("cyberpunk", "Cyberpunk", "Neon circuit-board traces around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  ctx.lineCap = "round";
  const circuits = sr < 30 ? 4 : 8;
  for (let i = 0; i < circuits; i++) {
    const startAngle = (i / circuits) * PI2 + time * 0.3;
    const arcLen = 0.15 + 0.15 * Math.sin(time + i * 1.5);
    const dist = radius * (1.04 + 0.03 * Math.sin(time * 2 + i));
    const segments = 6;
    const hue = (i * 45 + time * 30) % 360;
    const alpha = 0.5 + 0.3 * Math.sin(time * 3 + i * 2);
    ctx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const a = startAngle + t * arcLen;
      // Stepped offsets for circuit look
      const step = (s % 2 === 0) ? 0 : radius * 0.03;
      const d = dist + step;
      const px = Math.cos(a) * d;
      const py = Math.sin(a) * d;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
    ctx.lineWidth = Math.max(1.5, radius * 0.015);
    ctx.stroke();
    // Node dot at start
    ctx.beginPath();
    ctx.arc(Math.cos(startAngle) * dist, Math.sin(startAngle) * dist, Math.max(2, radius * 0.015), 0, PI2);
    ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}, "premium");

// ── Dragon Breath ──────────────────────────────────────────
// Fire-breath particles erupting outward.

const dragonStates = new Map<string, { particles: { angle: number; dist: number; speed: number; size: number; life: number; maxLife: number; hue: number }[]; timer: number }>();

registerEffect("dragonbreath", "Dragon Breath", "Erupting fire-breath particles from your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  let state = dragonStates.get(cellKey);
  if (!state) { state = { particles: [], timer: 0 }; dragonStates.set(cellKey, state); }
  const maxP = sr < 30 ? 12 : 24;
  // Spawn
  if (time - state.timer > 0.06 && state.particles.length < maxP) {
    state.timer = time;
    state.particles.push({
      angle: Math.random() * PI2,
      dist: radius * 1.0,
      speed: radius * (0.3 + Math.random() * 0.4),
      size: 0.6 + Math.random() * 0.8,
      life: 0, maxLife: 0.5 + Math.random() * 0.6,
      hue: 10 + Math.random() * 30,
    });
  }
  ctx.save();
  const dt = 0.016; // approx frame
  let w = 0;
  for (let i = 0; i < state.particles.length; i++) {
    const p = state.particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) continue;
    p.dist += p.speed * dt;
    if (w !== i) state.particles[w] = state.particles[i];
    w++;
    const progress = p.life / p.maxLife;
    const alpha = (1 - progress) * 0.7;
    const sz = Math.max(2, radius * 0.025) * p.size * (1 + progress * 0.5);
    const px = Math.cos(p.angle) * p.dist;
    const py = Math.sin(p.angle) * p.dist;
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, ${50 + progress * 20}%, ${alpha})`;
    ctx.fill();
  }
  state.particles.length = w;
  // Hot ring
  ctx.strokeStyle = `rgba(255,80,0,${0.1 + 0.06 * Math.sin(time * 3)})`;
  ctx.lineWidth = Math.max(4, radius * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.02, 0, PI2);
  ctx.stroke();
  ctx.restore();
}, "premium");

// ── Cherry Rain ────────────────────────────────────────────
// Falling cherry blossoms with gentle rain-drop streaks.

registerEffect("cherry_rain", "Cherry Rain", "Cherry blossoms and soft rain falling around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const petalCount = sr < 30 ? 6 : 12;
  // Rain streaks
  if (sr > 20) {
    ctx.strokeStyle = `rgba(160,200,255,0.15)`;
    ctx.lineWidth = Math.max(0.8, radius * 0.005);
    for (let i = 0; i < 10; i++) {
      const seed = i * 67.3;
      const x = Math.sin(seed) * radius * 1.2;
      const fallY = ((time * 2 + seed * 0.01) % 1.0);
      const y1 = -radius * 1.3 + fallY * radius * 2.6;
      const y2 = y1 + radius * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
    }
  }
  // Cherry blossoms
  for (let i = 0; i < petalCount; i++) {
    const seed = i * 37.9;
    const x = Math.sin(seed) * radius * 1.1 + Math.sin(time * 0.8 + seed) * radius * 0.1;
    const fallCycle = ((time * 0.25 + seed * 0.01) % 1.0);
    const y = -radius * 1.3 + fallCycle * radius * 2.6;
    const alpha = Math.sin(fallCycle * Math.PI) * 0.65;
    const sz = Math.max(2, radius * 0.02);
    if (alpha > 0.02) {
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, PI2);
      ctx.fillStyle = `rgba(255,${160 + Math.floor(Math.sin(seed) * 30)},${180 + Math.floor(Math.sin(seed * 2) * 20)},${alpha})`;
      ctx.fill();
    }
  }
  ctx.restore();
}, "premium");

// ── Galaxy ─────────────────────────────────────────────────
// Rotating galaxy with spiral arms and embedded stars.

registerEffect("galaxy", "Galaxy", "A rotating galaxy with spiral arms around your cell", (ctx, radius, r, g, b, time, sr) => {
  if (sr < 8) return;
  ctx.save();
  const arms = 2;
  const starsPerArm = sr < 30 ? 8 : 16;
  const spin = time * 0.4;
  for (let a = 0; a < arms; a++) {
    const armBase = (a / arms) * PI2 + spin;
    for (let s = 0; s < starsPerArm; s++) {
      const t = s / starsPerArm;
      const spiralAngle = armBase + t * 3.5;
      const dist = radius * (0.9 + t * 0.4);
      const spread = radius * 0.04 * t;
      const px = Math.cos(spiralAngle) * dist + Math.sin(s * 7.3) * spread;
      const py = Math.sin(spiralAngle) * dist + Math.cos(s * 7.3) * spread;
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(time * 3 + s * 2 + a));
      const sz = Math.max(1, radius * 0.012 * (1 - t * 0.3));
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, PI2);
      ctx.fillStyle = `rgba(${r},${g},${b},${twinkle * 0.6})`;
      ctx.fill();
    }
  }
  // Central glow
  const grad = ctx.createRadialGradient(0, 0, radius * 0.85, 0, 0, radius * 1.1);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.06)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.1, 0, PI2);
  ctx.fill();
  ctx.restore();
}, "premium");

// ── Cleanup ────────────────────────────────────────────────
// Remove per-cell effect state for cells that no longer exist.

export function cleanupEffectState(activeCellIds: Set<number>) {
  const maps: Map<string, unknown>[] = [starStates, boltStates, petalStates, frostStates, smokeStates, flameStates, plasmaStates, fairyStates, toxicStates, flareStates, autumnStates, bubbleStates, stormStates, dragonStates];
  for (const m of maps) {
    for (const key of m.keys()) {
      const id = parseInt(key, 10);
      if (!isNaN(id) && !activeCellIds.has(id)) m.delete(key);
    }
  }
}
