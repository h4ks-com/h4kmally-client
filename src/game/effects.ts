/**
 * Border effects for player cells.
 * Each effect draws around a cell using Canvas2D after the cell body is rendered.
 * Effects are called with the canvas context translated to the cell center.
 */

const PI2 = Math.PI * 2;

// ── Effect registry ────────────────────────────────────────

export type EffectRenderer = (
  ctx: CanvasRenderingContext2D,
  radius: number,
  r: number,
  g: number,
  b: number,
  time: number,  // monotonic time in seconds (performance.now / 1000)
) => void;

const effectMap = new Map<string, EffectRenderer>();

export function getEffect(name: string): EffectRenderer | undefined {
  return effectMap.get(name);
}

export const EFFECT_LIST: { id: string; label: string; description: string; category: "free" | "premium" }[] = [];

function registerEffect(id: string, label: string, description: string, render: EffectRenderer, category: "free" | "premium" = "free") {
  effectMap.set(id, render);
  EFFECT_LIST.push({ id, label, description, category });
}

// ── Neon Pulse ─────────────────────────────────────────────
// Glowing neon outline that pulses in intensity — multiple bright rings with large glow.

registerEffect("neon", "Neon Pulse", "Pulsing neon glow around your cell", (ctx, radius, r, g, b, time) => {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.0); // 0..1 oscillation
  const glow = Math.max(20, radius * 0.15) + pulse * Math.max(30, radius * 0.2);

  ctx.save();

  // Outer glow ring — wide, semi-transparent, big shadowBlur
  ctx.shadowColor = `rgba(${r},${g},${b},1)`;
  ctx.shadowBlur = glow;
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.6 + pulse * 0.4})`;
  ctx.lineWidth = Math.max(4, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.04, 0, PI2);
  ctx.stroke();

  // Middle glow ring — tighter, brighter
  ctx.shadowBlur = glow * 0.6;
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.7 + pulse * 0.3})`;
  ctx.lineWidth = Math.max(3, radius * 0.04);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.02, 0, PI2);
  ctx.stroke();

  // Inner bright core — white highlight
  ctx.shadowColor = `rgba(255,255,255,${0.5 + pulse * 0.5})`;
  ctx.shadowBlur = glow * 0.3;
  ctx.strokeStyle = `rgba(255,255,255,${0.3 + pulse * 0.4})`;
  ctx.lineWidth = Math.max(2, radius * 0.02);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.01, 0, PI2);
  ctx.stroke();

  // Pulsing fill band (subtle colored band just outside cell)
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(${r},${g},${b},${0.08 + pulse * 0.12})`;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.08, 0, PI2);
  ctx.arc(0, 0, radius * 1.0, 0, PI2, true); // cut out inner
  ctx.fill();

  ctx.restore();
});

// ── Prismatic ──────────────────────────────────────────────
// Rainbow refraction that shifts hue as the cell is alive.

registerEffect("prismatic", "Prismatic", "Shifting rainbow border", (ctx, radius, _r, _g, _b, time) => {
  const segments = 36;
  const lineW = Math.max(2.5, radius * 0.035);

  ctx.save();
  ctx.lineWidth = lineW;
  ctx.shadowBlur = 8;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * PI2;
    const a1 = ((i + 1) / segments) * PI2;
    const hue = ((i / segments) * 360 + time * 120) % 360;

    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.02, a0, a1);
    ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
    ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
    ctx.stroke();
  }

  ctx.restore();
});

// ── Starfield ──────────────────────────────────────────────
// Tiny stars orbiting just outside the border with occasional twinkle.

// Persistent star state per cell (lazily initialized)
const starStates = new Map<string, { angles: number[]; sizes: number[]; speeds: number[]; twinkle: number[] }>();

function getStarState(cellKey: string, count: number) {
  let s = starStates.get(cellKey);
  if (!s || s.angles.length !== count) {
    const angles: number[] = [];
    const sizes: number[] = [];
    const speeds: number[] = [];
    const twinkle: number[] = [];
    for (let i = 0; i < count; i++) {
      angles.push(Math.random() * PI2);
      sizes.push(1 + Math.random() * 2);
      speeds.push(0.2 + Math.random() * 0.6);
      twinkle.push(Math.random() * PI2);
    }
    s = { angles, sizes, speeds, twinkle };
    starStates.set(cellKey, s);
  }
  return s;
}

registerEffect("starfield", "Starfield", "Orbiting stars around your cell", (ctx, radius, _r, _g, _b, time) => {
  const count = Math.max(8, Math.min(24, Math.floor(radius / 8)));
  // Use a stable key — we'll pass cell ID via a hack on the context
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getStarState(cellKey, count);

  ctx.save();

  for (let i = 0; i < count; i++) {
    s.angles[i] += s.speeds[i] * 0.016; // ~60fps step
    const angle = s.angles[i];
    const twinkleAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + s.twinkle[i]));
    const dist = radius * 1.08 + Math.sin(time * 1.5 + i) * radius * 0.03;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const sz = s.sizes[i] * Math.max(1, radius * 0.015);

    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.fillStyle = `rgba(255,255,230,${twinkleAlpha})`;
    ctx.shadowColor = `rgba(255,255,200,${twinkleAlpha * 0.8})`;
    ctx.shadowBlur = sz * 3;
    ctx.fill();
  }

  ctx.restore();
});

// ── Lightning ──────────────────────────────────────────────
// Electric arcs crackling around the perimeter with random bolts.

// Persistent bolt state
const boltStates = new Map<string, { bolts: { startAngle: number; seed: number; life: number; maxLife: number }[] }>();

registerEffect("lightning", "Lightning", "Crackling electric arcs", (ctx, radius, r, g, b, time) => {
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";

  let state = boltStates.get(cellKey);
  if (!state) {
    state = { bolts: [] };
    boltStates.set(cellKey, state);
  }

  // Spawn new bolts periodically
  if (Math.random() < 0.15) { // ~9 new bolts per second at 60fps
    state.bolts.push({
      startAngle: Math.random() * PI2,
      seed: Math.random() * 1000,
      life: 0,
      maxLife: 8 + Math.random() * 12, // frames
    });
  }

  // Limit bolt count
  if (state.bolts.length > 6) {
    state.bolts = state.bolts.slice(-6);
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const lightR = Math.min(255, r + 100);
  const lightG = Math.min(255, g + 100);
  const lightB = Math.min(255, b + 150);

  for (let bi = state.bolts.length - 1; bi >= 0; bi--) {
    const bolt = state.bolts[bi];
    bolt.life++;

    if (bolt.life > bolt.maxLife) {
      state.bolts.splice(bi, 1);
      continue;
    }

    const progress = bolt.life / bolt.maxLife;
    const alpha = 1.0 - progress;
    const arcLength = 0.3 + Math.random() * 0.4; // radians
    const segments = 6 + Math.floor(Math.random() * 4);

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${lightR},${lightG},${lightB},${alpha * 0.9})`;
    ctx.lineWidth = Math.max(1.5, radius * 0.02) * (1 - progress * 0.5);
    ctx.shadowColor = `rgba(${lightR},${lightG},${lightB},${alpha * 0.6})`;
    ctx.shadowBlur = 10 + radius * 0.05;

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

    // Bright core
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.5})`;
    ctx.lineWidth = Math.max(0.5, radius * 0.008);
    ctx.shadowBlur = 0;
    ctx.stroke();
  }

  ctx.restore();
});

// ══════════════════════════════════════════════════════════════
// ═══  PREMIUM EFFECTS  ═══════════════════════════════════════
// ══════════════════════════════════════════════════════════════

// ── Sakura ─────────────────────────────────────────────────
// Cherry blossom petals drifting around the cell border.

const petalStates = new Map<string, { x: number; y: number; angle: number; size: number; speed: number; drift: number; rot: number }[]>();

function getPetalState(cellKey: string, count: number) {
  let p = petalStates.get(cellKey);
  if (!p || p.length !== count) {
    p = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * PI2;
      p.push({
        x: a,
        y: 0.85 + Math.random() * 0.7,  // 0.85..1.55 — extends way past border
        angle: Math.random() * PI2,
        size: 0.8 + Math.random() * 1.2,  // bigger petals
        speed: 0.12 + Math.random() * 0.35,
        drift: Math.random() * PI2,
        rot: Math.random() * PI2,
      });
    }
    petalStates.set(cellKey, p);
  }
  return p;
}

registerEffect("sakura", "Sakura", "Cherry blossom petals drifting around your cell", (ctx, radius, _r, _g, _b, time) => {
  const count = Math.max(10, Math.min(28, Math.floor(radius / 7)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const petals = getPetalState(cellKey, count);

  ctx.save();

  // Soft pink aura glow behind all petals
  ctx.shadowColor = `rgba(255,150,180,0.4)`;
  ctx.shadowBlur = Math.max(20, radius * 0.15);
  ctx.strokeStyle = `rgba(255,180,200,0.12)`;
  ctx.lineWidth = Math.max(4, radius * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.15, 0, PI2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const p of petals) {
    // Orbit + gentle drift
    p.x += p.speed * 0.012;
    const orbAngle = p.x;
    const driftOff = Math.sin(time * 0.8 + p.drift) * 0.1;
    const dist = radius * (p.y + driftOff);
    const px = Math.cos(orbAngle) * dist;
    const py = Math.sin(orbAngle) * dist;
    const sz = p.size * Math.max(3, radius * 0.04);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.rot + time * 0.5);

    // Draw petal shape — five-petal blossom feel with multiple ellipses
    const alpha = 0.55 + 0.35 * Math.sin(time * 1.5 + p.drift);

    // Main petal
    ctx.beginPath();
    ctx.ellipse(0, 0, sz, sz * 0.5, 0, 0, PI2);
    ctx.fillStyle = `rgba(255,175,193,${alpha})`;
    ctx.shadowColor = `rgba(255,120,160,${alpha * 0.7})`;
    ctx.shadowBlur = sz * 3;
    ctx.fill();

    // Second petal rotated
    ctx.beginPath();
    ctx.ellipse(0, 0, sz * 0.45, sz * 0.85, 0, 0, PI2);
    ctx.fillStyle = `rgba(255,195,210,${alpha * 0.7})`;
    ctx.shadowBlur = 0;
    ctx.fill();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(0, 0, sz * 0.2, 0, PI2);
    ctx.fillStyle = `rgba(255,240,245,${alpha * 0.6})`;
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}, "premium");

// ── Frost ──────────────────────────────────────────────────
// Ice crystals and blue misty aura around the cell.

const frostStates = new Map<string, { angles: number[]; lengths: number[]; branches: number[] }>();

function getFrostState(cellKey: string, count: number) {
  let s = frostStates.get(cellKey);
  if (!s || s.angles.length !== count) {
    const angles: number[] = [];
    const lengths: number[] = [];
    const branches: number[] = [];
    for (let i = 0; i < count; i++) {
      angles.push(Math.random() * PI2);
      lengths.push(0.5 + Math.random() * 1.0);
      branches.push(2 + Math.floor(Math.random() * 3));
    }
    s = { angles, lengths, branches };
    frostStates.set(cellKey, s);
  }
  return s;
}

registerEffect("frost", "Frost", "Ice crystals and frosty mist surrounding your cell", (ctx, radius, _r, _g, _b, time) => {
  const count = Math.max(8, Math.min(20, Math.floor(radius / 10)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getFrostState(cellKey, count);

  ctx.save();

  // Wide frosty mist aura — double ring
  const mistPulse = 0.5 + 0.5 * Math.sin(time * 1.5);
  ctx.shadowColor = `rgba(140,215,255,${0.5 + mistPulse * 0.35})`;
  ctx.shadowBlur = Math.max(25, radius * 0.2);
  ctx.strokeStyle = `rgba(170,225,255,${0.18 + mistPulse * 0.18})`;
  ctx.lineWidth = Math.max(5, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.06, 0, PI2);
  ctx.stroke();

  // Outer mist halo
  ctx.shadowBlur = Math.max(15, radius * 0.12);
  ctx.strokeStyle = `rgba(190,235,255,${0.08 + mistPulse * 0.08})`;
  ctx.lineWidth = Math.max(3, radius * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.25, 0, PI2);
  ctx.stroke();

  // Ice crystals — long branching spikes radiating far outward
  ctx.shadowBlur = Math.max(6, radius * 0.05);
  ctx.shadowColor = `rgba(150,220,255,0.6)`;
  ctx.lineCap = "round";

  for (let i = 0; i < count; i++) {
    const baseAngle = s.angles[i] + Math.sin(time * 0.3 + i) * 0.05;
    const len = s.lengths[i] * Math.max(10, radius * 0.25);  // 3x longer crystals
    const startDist = radius * 1.01;
    const sx = Math.cos(baseAngle) * startDist;
    const sy = Math.sin(baseAngle) * startDist;
    const ex = Math.cos(baseAngle) * (startDist + len);
    const ey = Math.sin(baseAngle) * (startDist + len);

    const alpha = 0.55 + 0.35 * Math.sin(time * 2 + i * 1.3);
    ctx.strokeStyle = `rgba(200,240,255,${alpha})`;
    ctx.lineWidth = Math.max(2, radius * 0.018);

    // Main crystal spike
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Branches — longer, more visible
    const branchCount = s.branches[i];
    for (let b = 0; b < branchCount; b++) {
      const t = (b + 1) / (branchCount + 1);
      const mx = sx + (ex - sx) * t;
      const my = sy + (ey - sy) * t;
      const branchLen = len * 0.45;
      const branchAngle = baseAngle + (b % 2 === 0 ? 1 : -1) * (0.35 + 0.15 * Math.sin(time + i + b));
      const bex = mx + Math.cos(branchAngle) * branchLen;
      const bey = my + Math.sin(branchAngle) * branchLen;

      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(bex, bey);
      ctx.lineWidth = Math.max(1.5, radius * 0.012);
      ctx.stroke();

      // Sub-branches for larger cells
      if (radius > 60) {
        const subLen = branchLen * 0.4;
        for (let sb = 0; sb < 2; sb++) {
          const st = 0.5 + sb * 0.3;
          const smx = mx + (bex - mx) * st;
          const smy = my + (bey - my) * st;
          const subAngle = branchAngle + (sb % 2 === 0 ? 0.5 : -0.5);
          ctx.beginPath();
          ctx.moveTo(smx, smy);
          ctx.lineTo(smx + Math.cos(subAngle) * subLen, smy + Math.sin(subAngle) * subLen);
          ctx.lineWidth = Math.max(1, radius * 0.007);
          ctx.stroke();
        }
      }
    }
  }

  // Sparkle particles — more numerous, further out
  for (let i = 0; i < 10; i++) {
    const sparkAngle = time * 0.6 + i * 0.628;
    const sparkDist = radius * (1.05 + 0.3 * Math.sin(time * 1.5 + i * 1.9));
    const sx2 = Math.cos(sparkAngle) * sparkDist;
    const sy2 = Math.sin(sparkAngle) * sparkDist;
    const sparkAlpha = 0.3 + 0.7 * Math.abs(Math.sin(time * 3 + i * 1.7));
    const sparkSz = Math.max(1.5, radius * 0.014);

    ctx.beginPath();
    ctx.arc(sx2, sy2, sparkSz, 0, PI2);
    ctx.fillStyle = `rgba(220,240,255,${sparkAlpha})`;
    ctx.shadowColor = `rgba(180,230,255,${sparkAlpha})`;
    ctx.shadowBlur = sparkSz * 5;
    ctx.fill();
  }

  ctx.restore();
}, "premium");

// ── Shadow Aura ────────────────────────────────────────────
// Dark smoke tendrils emanating outward — menacing dark energy.

const smokeStates = new Map<string, { angles: number[]; speeds: number[]; offsets: number[] }>();

function getSmokeState(cellKey: string, count: number) {
  let s = smokeStates.get(cellKey);
  if (!s || s.angles.length !== count) {
    const angles: number[] = [];
    const speeds: number[] = [];
    const offsets: number[] = [];
    for (let i = 0; i < count; i++) {
      angles.push(Math.random() * PI2);
      speeds.push(0.1 + Math.random() * 0.3);
      offsets.push(Math.random() * PI2);
    }
    s = { angles, speeds, offsets };
    smokeStates.set(cellKey, s);
  }
  return s;
}

registerEffect("shadow_aura", "Shadow Aura", "Dark smoke tendrils — menacing dark energy", (ctx, radius, _r, _g, _b, time) => {
  const count = Math.max(10, Math.min(22, Math.floor(radius / 6)));
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";
  const s = getSmokeState(cellKey, count);

  ctx.save();

  // Wide dark aura — gradient halo
  const pulse = 0.5 + 0.5 * Math.sin(time * 2);
  const auraGrad = ctx.createRadialGradient(0, 0, radius * 0.95, 0, 0, radius * 1.5);
  auraGrad.addColorStop(0, `rgba(20,0,40,${0.3 + pulse * 0.15})`);
  auraGrad.addColorStop(0.5, `rgba(30,0,50,${0.15 + pulse * 0.1})`);
  auraGrad.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, PI2);
  ctx.fill();

  // Dark inner ring — thick and bold
  ctx.shadowColor = `rgba(30,0,50,${0.7 + pulse * 0.3})`;
  ctx.shadowBlur = Math.max(20, radius * 0.15);
  ctx.strokeStyle = `rgba(50,0,80,${0.35 + pulse * 0.25})`;
  ctx.lineWidth = Math.max(4, radius * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.03, 0, PI2);
  ctx.stroke();

  // Long smoke tendrils — extend well past border
  for (let i = 0; i < count; i++) {
    s.angles[i] += s.speeds[i] * 0.01;
    const angle = s.angles[i];
    const tendrilLen = Math.max(15, radius * 0.45) * (0.5 + 0.5 * Math.sin(time * 1.5 + s.offsets[i]));
    const startDist = radius * 1.01;

    const alpha = 0.35 + 0.45 * Math.sin(time * 1.8 + s.offsets[i]);

    // Draw wavy tendril with more segments for drama
    ctx.beginPath();
    const sx = Math.cos(angle) * startDist;
    const sy = Math.sin(angle) * startDist;
    ctx.moveTo(sx, sy);

    const segments = 5;
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

    // Thicker, wider tendrils with tapered alpha
    ctx.strokeStyle = `rgba(40,0,60,${alpha})`;
    ctx.lineWidth = Math.max(3, radius * 0.035) * (1.0 - 0.3 * Math.sin(time + i));
    ctx.shadowColor = `rgba(80,0,120,${alpha * 0.6})`;
    ctx.shadowBlur = Math.max(10, radius * 0.07);
    ctx.stroke();
  }

  // Wispy outer particles — floating dark motes
  for (let i = 0; i < 8; i++) {
    const moteAngle = time * 0.4 + i * 0.785;
    const moteDist = radius * (1.15 + 0.25 * Math.sin(time * 1.2 + i * 2.3));
    const mx = Math.cos(moteAngle) * moteDist;
    const my = Math.sin(moteAngle) * moteDist;
    const moteAlpha = 0.2 + 0.3 * Math.abs(Math.sin(time * 2 + i));
    const moteSz = Math.max(2, radius * 0.025);

    ctx.beginPath();
    ctx.arc(mx, my, moteSz, 0, PI2);
    ctx.fillStyle = `rgba(30,0,50,${moteAlpha})`;
    ctx.shadowColor = `rgba(60,0,100,${moteAlpha})`;
    ctx.shadowBlur = moteSz * 3;
    ctx.fill();
  }

  ctx.restore();
}, "premium");

// ── Flame ──────────────────────────────────────────────────
// Fire particles rising from the border — aggressive and dynamic.

const flameStates = new Map<string, { particles: { angle: number; life: number; maxLife: number; speed: number; size: number }[] }>();

registerEffect("flame", "Flame", "Rising fire particles around your cell", (ctx, radius, _r, _g, _b, time) => {
  const cellKey = (ctx as unknown as { _effectCellId?: number })._effectCellId?.toString() ?? "default";

  let state = flameStates.get(cellKey);
  if (!state) {
    state = { particles: [] };
    flameStates.set(cellKey, state);
  }

  // Spawn particles
  const spawnRate = Math.max(2, Math.floor(radius / 20));
  for (let i = 0; i < spawnRate; i++) {
    if (Math.random() < 0.4) {
      state.particles.push({
        angle: Math.random() * PI2,
        life: 0,
        maxLife: 15 + Math.random() * 25,
        speed: 0.3 + Math.random() * 0.6,
        size: 0.5 + Math.random() * 1.0,
      });
    }
  }

  // Limit particles
  if (state.particles.length > 60) {
    state.particles = state.particles.slice(-60);
  }

  ctx.save();

  // Warm glow ring
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  ctx.shadowColor = `rgba(255,100,0,${0.5 + pulse * 0.3})`;
  ctx.shadowBlur = Math.max(10, radius * 0.08);
  ctx.strokeStyle = `rgba(255,80,0,${0.2 + pulse * 0.15})`;
  ctx.lineWidth = Math.max(2, radius * 0.025);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.01, 0, PI2);
  ctx.stroke();

  // Draw particles
  ctx.shadowBlur = 0;
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life++;
    if (p.life > p.maxLife) {
      state.particles.splice(i, 1);
      continue;
    }

    const progress = p.life / p.maxLife;
    const dist = radius * 1.02 + p.speed * p.life * Math.max(1, radius * 0.01);
    const wobble = Math.sin(time * 6 + p.angle * 5 + p.life * 0.3) * radius * 0.02;
    const px = Math.cos(p.angle) * dist + wobble;
    const py = Math.sin(p.angle) * dist;
    const sz = p.size * Math.max(1.5, radius * 0.018) * (1 - progress * 0.5);

    // Color: yellow → orange → red as particles age
    let pr: number, pg: number, pb: number;
    if (progress < 0.3) {
      pr = 255; pg = 255 - progress * 300; pb = 50;
    } else if (progress < 0.6) {
      pr = 255; pg = Math.max(0, 165 - (progress - 0.3) * 500); pb = 0;
    } else {
      pr = 255 - (progress - 0.6) * 300; pg = 0; pb = 0;
    }

    const alpha = (1 - progress) * 0.8;
    ctx.beginPath();
    ctx.arc(px, py, sz, 0, PI2);
    ctx.fillStyle = `rgba(${Math.round(pr)},${Math.round(pg)},${Math.round(pb)},${alpha})`;
    ctx.shadowColor = `rgba(255,100,0,${alpha * 0.5})`;
    ctx.shadowBlur = sz * 3;
    ctx.fill();
  }

  ctx.restore();
}, "premium");

// ── Glitch ─────────────────────────────────────────────────
// RGB channel-shifted segments and digital distortion around the cell.

registerEffect("glitch", "Glitch", "Digital distortion and RGB shift effect", (ctx, radius, r, g, b, time) => {
  ctx.save();

  const segments = 24;
  const segAngle = PI2 / segments;
  const lineW = Math.max(3, radius * 0.04);
  const glitchSpeed = 8;

  // Determine which segments are "glitched" this frame
  const glitchSeed = Math.floor(time * glitchSpeed);

  for (let i = 0; i < segments; i++) {
    const a0 = i * segAngle;
    const a1 = (i + 1) * segAngle;

    // Pseudo-random based on segment + time
    const hash = ((glitchSeed * 31 + i * 127) & 0xFFFF) / 0xFFFF;
    const isGlitched = hash < 0.35; // 35% of segments glitch

    if (isGlitched) {
      // RGB channel separation: draw R, G, B separately with offsets
      const offset = Math.max(2, radius * 0.03) * (0.5 + hash);
      const rOffset = offset;
      const gOffset = -offset;

      // Red channel (shifted outward)
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02 + rOffset, a0, a1);
      ctx.strokeStyle = `rgba(255,0,0,0.7)`;
      ctx.lineWidth = lineW;
      ctx.stroke();

      // Green channel (shifted inward)
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02 + gOffset, a0, a1);
      ctx.strokeStyle = `rgba(0,255,0,0.7)`;
      ctx.lineWidth = lineW;
      ctx.stroke();

      // Blue channel (base position)
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02, a0, a1);
      ctx.strokeStyle = `rgba(0,0,255,0.7)`;
      ctx.lineWidth = lineW;
      ctx.stroke();
    } else {
      // Normal segment — white/cyan thin line
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02, a0, a1);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`;
      ctx.lineWidth = Math.max(1.5, radius * 0.015);
      ctx.stroke();
    }
  }

  // Random scanlines — horizontal bars that flicker
  const scanCount = 3;
  for (let i = 0; i < scanCount; i++) {
    const scanHash = ((glitchSeed * 17 + i * 89) & 0xFFFF) / 0xFFFF;
    if (scanHash < 0.5) continue;
    const y = (scanHash - 0.5) * 2 * radius * 1.1 - radius * 0.55;
    const barHeight = Math.max(1.5, radius * 0.015);
    const barAlpha = 0.15 + scanHash * 0.25;

    ctx.fillStyle = `rgba(255,255,255,${barAlpha})`;
    ctx.fillRect(-radius * 1.1, y, radius * 2.2, barHeight);
  }

  ctx.restore();
}, "premium");

// ── Black Hole ─────────────────────────────────────────────
// Gravitational lensing — warps surrounding grid lines like a heavy mass on a net.

registerEffect("blackhole", "Black Hole", "Warps space around your cell like a gravity well", (ctx, radius, _r, _g, _b, time) => {
  ctx.save();

  const warpRadius = radius * 2.2; // how far out the warp extends

  // Dark void gradient — very dark center fading out
  const voidGrad = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, warpRadius);
  voidGrad.addColorStop(0, `rgba(0,0,0,0.45)`);
  voidGrad.addColorStop(0.3, `rgba(5,0,15,0.25)`);
  voidGrad.addColorStop(0.6, `rgba(10,0,20,0.1)`);
  voidGrad.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = voidGrad;
  ctx.beginPath();
  ctx.arc(0, 0, warpRadius, 0, PI2);
  ctx.fill();

  // ── Photon sphere — bright ring at the edge where light orbits ──
  const photonPulse = 0.5 + 0.5 * Math.sin(time * 2.5);
  ctx.shadowColor = `rgba(180,120,255,${0.5 + photonPulse * 0.3})`;
  ctx.shadowBlur = Math.max(15, radius * 0.12);
  ctx.strokeStyle = `rgba(200,150,255,${0.4 + photonPulse * 0.3})`;
  ctx.lineWidth = Math.max(2.5, radius * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.08, 0, PI2);
  ctx.stroke();

  // Inner photon ring — brighter, tighter
  ctx.shadowBlur = Math.max(8, radius * 0.06);
  ctx.strokeStyle = `rgba(240,200,255,${0.3 + photonPulse * 0.25})`;
  ctx.lineWidth = Math.max(1.5, radius * 0.015);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.04, 0, PI2);
  ctx.stroke();

  // ── Accretion disk — tilted glowing ring ──
  const diskRot = time * 0.5;
  ctx.save();
  ctx.rotate(diskRot);
  const diskDist = radius * 1.25;
  const hue1 = (time * 35) % 360;
  ctx.beginPath();
  ctx.ellipse(0, 0, diskDist, diskDist * 0.25, 0, 0, PI2);
  ctx.strokeStyle = `hsla(${hue1}, 85%, 65%, 0.45)`;
  ctx.lineWidth = Math.max(3, radius * 0.035);
  ctx.shadowColor = `hsla(${hue1}, 90%, 55%, 0.35)`;
  ctx.shadowBlur = Math.max(12, radius * 0.1);
  ctx.stroke();

  // Second accretion ring — opposite tilt
  const hue2 = (hue1 + 120) % 360;
  ctx.beginPath();
  ctx.ellipse(0, 0, diskDist * 1.1, diskDist * 0.18, Math.PI * 0.3, 0, PI2);
  ctx.strokeStyle = `hsla(${hue2}, 80%, 60%, 0.3)`;
  ctx.lineWidth = Math.max(2, radius * 0.025);
  ctx.shadowColor = `hsla(${hue2}, 90%, 50%, 0.25)`;
  ctx.stroke();
  ctx.restore();

  // ── Debris particles spiraling in ──
  for (let i = 0; i < 10; i++) {
    const spiralSpeed = 1.2 + i * 0.15;
    const spiralAngle = time * spiralSpeed + i * 0.628;
    const spiralPhase = (time * 0.3 + i * 0.37) % 1;
    const spiralDist = radius * (1.1 + 0.9 * spiralPhase);
    const flatness = 0.3 + 0.4 * Math.sin(i * 1.3); // some orbits more tilted
    const px = Math.cos(spiralAngle) * spiralDist;
    const py = Math.sin(spiralAngle) * spiralDist * flatness;
    const dotSz = Math.max(1.5, radius * 0.015) * (1 - spiralPhase * 0.5);
    const dotAlpha = 0.5 * (1 - spiralPhase);

    const dotHue = (hue1 + i * 36) % 360;
    ctx.beginPath();
    ctx.arc(px, py, dotSz, 0, PI2);
    ctx.fillStyle = `hsla(${dotHue}, 70%, 70%, ${dotAlpha})`;
    ctx.shadowColor = `hsla(${dotHue}, 80%, 60%, ${dotAlpha * 0.5})`;
    ctx.shadowBlur = dotSz * 3;
    ctx.fill();
  }

  ctx.restore();
}, "premium");

// ── Cleanup ────────────────────────────────────────────────
// Remove per-cell effect state for cells that no longer exist.

export function cleanupEffectState(activeCellIds: Set<number>) {
  for (const key of starStates.keys()) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && !activeCellIds.has(id)) {
      starStates.delete(key);
    }
  }
  for (const key of boltStates.keys()) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && !activeCellIds.has(id)) {
      boltStates.delete(key);
    }
  }
  for (const key of petalStates.keys()) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && !activeCellIds.has(id)) {
      petalStates.delete(key);
    }
  }
  for (const key of frostStates.keys()) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && !activeCellIds.has(id)) {
      frostStates.delete(key);
    }
  }
  for (const key of smokeStates.keys()) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && !activeCellIds.has(id)) {
      smokeStates.delete(key);
    }
  }
  for (const key of flameStates.keys()) {
    const id = parseInt(key, 10);
    if (!isNaN(id) && !activeCellIds.has(id)) {
      flameStates.delete(key);
    }
  }
}
