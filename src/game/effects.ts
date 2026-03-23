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
// Rainbow refraction — LOD-scaled segment count, no shadow.

registerEffect("prismatic", "Prismatic", "Shifting rainbow border", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const segments = sr < 30 ? 12 : sr < 60 ? 18 : 24;
  const lineW = Math.max(2.5, radius * 0.035);

  ctx.save();
  ctx.lineWidth = lineW;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * PI2;
    const a1 = ((i + 1) / segments) * PI2;
    const hue = ((i / segments) * 360 + time * 120) % 360;

    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.02, a0, a1);
    ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
    ctx.stroke();
  }

  ctx.restore();
});

// ── Starfield ──────────────────────────────────────────────
// Tiny orbiting stars — Float32Array state, no shadow.

const starStates = new Map<string, { angles: Float32Array; sizes: Float32Array; speeds: Float32Array; twinkle: Float32Array }>();

function getStarState(cellKey: string, count: number) {
  let s = starStates.get(cellKey);
  if (!s || s.angles.length !== count) {
    const angles = new Float32Array(count);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);
    const twinkle = new Float32Array(count);
    for (let i = 0; i < count; i++) {
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
  const count = sr < 30 ? 6 : Math.max(6, Math.min(16, Math.floor(radius / 12)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getStarState(cellKey, count);

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
// Cherry blossom petals — no shadow, LOD-scaled petal count.

const petalStates = new Map<string, { x: number; y: number; angle: number; size: number; speed: number; drift: number; rot: number }[]>();

function getPetalState(cellKey: string, count: number) {
  let p = petalStates.get(cellKey);
  if (!p || p.length !== count) {
    p = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * PI2;
      p.push({
        x: a,
        y: 0.85 + Math.random() * 0.7,
        angle: Math.random() * PI2,
        size: 0.8 + Math.random() * 1.2,
        speed: 0.12 + Math.random() * 0.35,
        drift: Math.random() * PI2,
        rot: Math.random() * PI2,
      });
    }
    petalStates.set(cellKey, p);
  }
  return p;
}

registerEffect("sakura", "Sakura", "Cherry blossom petals drifting around your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const count = sr < 30 ? 6 : Math.max(8, Math.min(20, Math.floor(radius / 10)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const petals = getPetalState(cellKey, count);

  ctx.save();

  // Soft pink ring (wide stroke simulates glow)
  ctx.strokeStyle = `rgba(255,180,200,0.15)`;
  ctx.lineWidth = Math.max(6, radius * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.12, 0, PI2);
  ctx.stroke();

  for (const p of petals) {
    p.x += p.speed * 0.012;
    const orbAngle = p.x;
    const driftOff = Math.sin(time * 0.8 + p.drift) * 0.1;
    const dist = radius * (p.y + driftOff);
    const px = Math.cos(orbAngle) * dist;
    const py = Math.sin(orbAngle) * dist;
    const sz = p.size * Math.max(3, radius * 0.04);
    const alpha = 0.55 + 0.35 * Math.sin(time * 1.5 + p.drift);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.rot + time * 0.5);

    // Main petal
    ctx.beginPath();
    ctx.ellipse(0, 0, sz, sz * 0.5, 0, 0, PI2);
    ctx.fillStyle = `rgba(255,175,193,${alpha})`;
    ctx.fill();

    if (sr > 30) {
      // Second petal
      ctx.beginPath();
      ctx.ellipse(0, 0, sz * 0.45, sz * 0.85, 0, 0, PI2);
      ctx.fillStyle = `rgba(255,195,210,${alpha * 0.7})`;
      ctx.fill();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(0, 0, sz * 0.2, 0, PI2);
      ctx.fillStyle = `rgba(255,240,245,${alpha * 0.6})`;
      ctx.fill();
    }

    ctx.restore();
  }

  ctx.restore();
}, "premium");

// ── Frost ──────────────────────────────────────────────────
// Ice crystals — Float32Array state, batched branches, no shadow.

const frostStates = new Map<string, { angles: Float32Array; lengths: Float32Array; branches: Uint8Array }>();

function getFrostState(cellKey: string, count: number) {
  let s = frostStates.get(cellKey);
  if (!s || s.angles.length !== count) {
    const angles = new Float32Array(count);
    const lengths = new Float32Array(count);
    const branches = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
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
  const count = sr < 30 ? 5 : Math.max(6, Math.min(14, Math.floor(radius / 14)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getFrostState(cellKey, count);

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

const smokeStates = new Map<string, { angles: Float32Array; speeds: Float32Array; offsets: Float32Array }>();

function getSmokeState(cellKey: string, count: number) {
  let s = smokeStates.get(cellKey);
  if (!s || s.angles.length !== count) {
    const angles = new Float32Array(count);
    const speeds = new Float32Array(count);
    const offsets = new Float32Array(count);
    for (let i = 0; i < count; i++) {
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
  const count = sr < 30 ? 6 : Math.max(8, Math.min(16, Math.floor(radius / 8)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getSmokeState(cellKey, count);

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
//   • Full-circle warm base (112% radius) — covers entire cell so flame base
//     never reveals gaps when wobbling; color-matched to flame palette
//   • Outer ribbon (orange→yellow→red) from cell center upward, 105% cell width
//   • Inner ribbon (blue core) narrower, same path

const FLAME_POINTS = 20;      // resolution of the virtual trail
const FLAME_HEIGHT = 1.6;     // flame tip height in radii above cell center

interface FlameRibbonState {
  // Phase offsets for desync between cells
  p1: number; p2: number; p3: number; p4: number; p5: number;
}
const flameStates = new Map<string, FlameRibbonState>();

registerEffect("flame", "Flame", "Blazing trail-style fire engulfing your cell", (ctx, radius, _r, _g, _b, time, sr) => {
  if (sr < 8) return;
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";

  let state = flameStates.get(cellKey);
  if (!state) {
    state = {
      p1: Math.random() * PI2,
      p2: Math.random() * PI2,
      p3: Math.random() * PI2,
      p4: Math.random() * PI2,
      p5: Math.random() * PI2,
    };
    flameStates.set(cellKey, state);
  }

  const n = FLAME_POINTS;
  const baseHalfW = radius * 1.25; // 25% wider than cell, half-width at base
  const tipY = -radius * FLAME_HEIGHT;

  ctx.save();

  // ── Full-circle warm base ──
  // Covers the entire cell so the flame ribbon base never reveals gaps
  // when wobbling. Color-matched to the flame's orange/yellow palette.
  {
    const baseGrad = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius * 1.35);
    const basePulse = 0.5 + 0.5 * Math.sin(time * 7.46 + state.p1);
    const bAlpha = 0.65 + basePulse * 0.1;
    baseGrad.addColorStop(0, `rgba(255,200,50,${bAlpha})`);
    baseGrad.addColorStop(0.4, `rgba(255,150,30,${bAlpha * 0.85})`);
    baseGrad.addColorStop(0.75, `rgba(255,80,10,${bAlpha * 0.55})`);
    baseGrad.addColorStop(1, `rgba(255,60,0,0)`);
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, 0, PI2);
    ctx.fill();
  }

  // ── Build virtual trail points going upward from cell center ──
  // Each point is (x, y) where y goes from 0 (base) to tipY (tip).
  // x wobbles based on multiple sine waves to simulate flickering.
  const trail: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 = base (cell center), 1 = tip

    const y = t * tipY; // tipY is negative (upward)

    // Wobble accumulates toward the tip — base is stable, tip dances wildly
    // Irrational frequency ratios (√2, √3, φ, π based) so the pattern
    // never visibly repeats — avoids the "wobble-wobble-rest" cycle
    const wobbleAmt = t * t * radius * 0.18;
    const w1 = Math.sin(time * 14.62 + state.p1 + t * 2.73) * wobbleAmt;
    const w2 = Math.sin(time * 23.94 + state.p2 + t * 4.19) * wobbleAmt * 0.5;
    const w3 = Math.sin(time * 9.34  + state.p3 + t * 1.83) * wobbleAmt * 0.3;
    const w4 = Math.sin(time * 35.06 + state.p5 + t * 6.41) * wobbleAmt * 0.15;
    // Base sway — the whole flame leans left/right (irrational freq)
    const baseSway = Math.sin(time * 3.82 + state.p4) * radius * 0.04 * t;

    const x = w1 + w2 + w3 + w4 + baseSway;
    trail.push({ x, y });
  }

  // ── Build tapered ribbon edges (same technique as cell trails) ──
  function buildRibbon(pts: { x: number; y: number }[], headWidth: number) {
    const leftEdge: { x: number; y: number }[] = [];
    const rightEdge: { x: number; y: number }[] = [];
    const count = pts.length;

    for (let i = 0; i < count; i++) {
      // t: 0 = base (wide), 1 = tip (tapers to 0)
      const t = i / (count - 1);
      // Inverted sqrt taper: widest at base, tapers to point at tip
      // Same sqrt curve as trail but reversed: width = headWidth * sqrt(1 - t)
      const width = headWidth * Math.sqrt(1 - t);

      // Tangent from neighboring points
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(count - 1, i + 1)];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const len = Math.sqrt(tx * tx + ty * ty);
      if (len < 0.001) { tx = 0; ty = -1; } else { tx /= len; ty /= len; }

      // Perpendicular
      const nx = -ty;
      const ny = tx;

      const pt = pts[i];
      leftEdge.push({ x: pt.x + nx * width, y: pt.y + ny * width });
      rightEdge.push({ x: pt.x - nx * width, y: pt.y - ny * width });
    }
    return { leftEdge, rightEdge };
  }

  function drawRibbon(
    leftEdge: { x: number; y: number }[],
    rightEdge: { x: number; y: number }[],
    fill: CanvasGradient | string,
  ) {
    ctx.beginPath();
    // Left edge (base → tip)
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let i = 1; i < leftEdge.length; i++) {
      if (i < leftEdge.length - 1) {
        const mx = (leftEdge[i].x + leftEdge[i + 1].x) / 2;
        const my = (leftEdge[i].y + leftEdge[i + 1].y) / 2;
        ctx.quadraticCurveTo(leftEdge[i].x, leftEdge[i].y, mx, my);
      } else {
        ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
      }
    }
    // Right edge (tip → base, reversed)
    for (let i = rightEdge.length - 1; i >= 0; i--) {
      if (i > 0) {
        const mx = (rightEdge[i].x + rightEdge[i - 1].x) / 2;
        const my = (rightEdge[i].y + rightEdge[i - 1].y) / 2;
        ctx.quadraticCurveTo(rightEdge[i].x, rightEdge[i].y, mx, my);
      } else {
        ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // ── Outer flame ribbon (orange → yellow → red) ──
  {
    const { leftEdge, rightEdge } = buildRibbon(trail, baseHalfW);
    const flickerA = 0.5 + 0.5 * Math.sin(time * 11.66 + state.p5);
    const outerAlpha = 0.6 + flickerA * 0.15;
    const grad = ctx.createLinearGradient(0, 0, trail[n - 1].x, tipY);
    // Base starts transparent so the wide bottom blends into the glow circle
    grad.addColorStop(0, `rgba(255,200,50,0)`);
    grad.addColorStop(0.08, `rgba(255,200,50,${outerAlpha * 0.4})`);
    grad.addColorStop(0.18, `rgba(255,150,20,${outerAlpha})`);
    grad.addColorStop(0.4, `rgba(255,80,10,${outerAlpha * 0.85})`);
    grad.addColorStop(0.7, `rgba(200,40,0,${outerAlpha * 0.5})`);
    grad.addColorStop(1, `rgba(150,20,0,0)`);
    drawRibbon(leftEdge, rightEdge, grad);
  }

  // ── Inner flame ribbon (blue core) — narrower, shorter ──
  {
    // Inner trail: same path but slightly compress the height
    const innerTrail: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // Inner flame is ~60% the height of the outer
      innerTrail.push({ x: trail[i].x * 0.7, y: trail[i].y * 0.6 });
      // Stop the inner trail at about 60% up (the rest is just outer orange)
      if (t > 0.65) break;
    }
    const innerN = innerTrail.length;
    if (innerN >= 3) {
      const { leftEdge, rightEdge } = buildRibbon(innerTrail, baseHalfW * 0.5);
      const flickerB = 0.5 + 0.5 * Math.sin(time * 16.74 + state.p3);
      const innerAlpha = 0.55 + flickerB * 0.15;
      const tipPt = innerTrail[innerN - 1];
      const grad = ctx.createLinearGradient(0, 0, tipPt.x, tipPt.y);
      // Base starts transparent to blend into the glow circle
      grad.addColorStop(0, `rgba(200,225,255,0)`);
      grad.addColorStop(0.1, `rgba(200,225,255,${innerAlpha * 0.5})`);
      grad.addColorStop(0.25, `rgba(120,170,255,${innerAlpha * 0.9})`);
      grad.addColorStop(0.55, `rgba(60,100,220,${innerAlpha * 0.6})`);
      grad.addColorStop(1, `rgba(40,60,180,0)`);
      drawRibbon(leftEdge, rightEdge, grad);
    }
  }

  // ── Hot core spot at the very base ──
  if (sr >= 20) {
    const corePulse = 0.5 + 0.5 * Math.sin(time * 10.0 + state.p2);
    const coreR = radius * 0.18;
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    coreGrad.addColorStop(0, `rgba(255,255,245,${0.4 + corePulse * 0.15})`);
    coreGrad.addColorStop(0.5, `rgba(200,220,255,${0.15 + corePulse * 0.05})`);
    coreGrad.addColorStop(1, "rgba(200,220,255,0)");
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

// ── Cleanup ────────────────────────────────────────────────
// Remove per-cell effect state for cells that no longer exist.

export function cleanupEffectState(activeCellIds: Set<number>) {
  const maps: Map<string, unknown>[] = [starStates, boltStates, petalStates, frostStates, smokeStates, flameStates];
  for (const m of maps) {
    for (const key of m.keys()) {
      const id = parseInt(key, 10);
      if (!isNaN(id) && !activeCellIds.has(id)) m.delete(key);
    }
  }
}
