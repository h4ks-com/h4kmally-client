/**
 * Custom cursor definitions.
 * Each cursor is drawn on a small offscreen canvas and converted to a data URL
 * so we can render it as a CSS cursor or as an overlay element.
 *
 * All cursors are free — no tokens required.
 */

const PI2 = Math.PI * 2;

export interface CursorDef {
  id: string;
  label: string;
  description: string;
  /** Draw the cursor centered at (size/2, size/2) on a canvas of the given size. */
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

export const CURSOR_LIST: CursorDef[] = [];

function registerCursor(
  id: string,
  label: string,
  description: string,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
) {
  CURSOR_LIST.push({ id, label, description, draw });
}

// ── Crosshair ──────────────────────────────────────────────
registerCursor("crosshair", "Crosshair", "Simple precision crosshair", (ctx, size) => {
  const c = size / 2;
  const gap = size * 0.1;
  const arm = size * 0.38;
  const lw = Math.max(2, size * 0.06);

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = lw;
  ctx.lineCap = "round";

  // Outline (dark behind white)
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = lw + 2;
  ctx.beginPath();
  ctx.moveTo(c - arm, c); ctx.lineTo(c - gap, c);
  ctx.moveTo(c + gap, c); ctx.lineTo(c + arm, c);
  ctx.moveTo(c, c - arm); ctx.lineTo(c, c - gap);
  ctx.moveTo(c, c + gap); ctx.lineTo(c, c + arm);
  ctx.stroke();
  ctx.restore();

  // White lines
  ctx.beginPath();
  ctx.moveTo(c - arm, c); ctx.lineTo(c - gap, c);
  ctx.moveTo(c + gap, c); ctx.lineTo(c + arm, c);
  ctx.moveTo(c, c - arm); ctx.lineTo(c, c - gap);
  ctx.moveTo(c, c + gap); ctx.lineTo(c, c + arm);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = "#ff3333";
  ctx.beginPath();
  ctx.arc(c, c, lw * 0.6, 0, PI2);
  ctx.fill();
});

// ── Sniper ─────────────────────────────────────────────────
registerCursor("sniper", "Sniper", "Sniper scope with crosshairs", (ctx, size) => {
  const c = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.15;
  const lw = Math.max(1.5, size * 0.045);

  // Outline
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = lw + 2;
  ctx.beginPath();
  ctx.arc(c, c, outerR, 0, PI2);
  ctx.stroke();

  // Scope ring
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(c, c, outerR, 0, PI2);
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = "rgba(200,200,200,0.4)";
  ctx.lineWidth = lw * 0.5;
  ctx.beginPath();
  ctx.arc(c, c, innerR, 0, PI2);
  ctx.stroke();

  // Cross lines — from ring edge to opposite ring edge with gap around center
  const gap = size * 0.05;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = lw + 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(c - outerR, c); ctx.lineTo(c - gap, c);
  ctx.moveTo(c + gap, c); ctx.lineTo(c + outerR, c);
  ctx.moveTo(c, c - outerR); ctx.lineTo(c, c - gap);
  ctx.moveTo(c, c + gap); ctx.lineTo(c, c + outerR);
  ctx.stroke();

  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = lw * 0.8;
  ctx.beginPath();
  ctx.moveTo(c - outerR, c); ctx.lineTo(c - gap, c);
  ctx.moveTo(c + gap, c); ctx.lineTo(c + outerR, c);
  ctx.moveTo(c, c - outerR); ctx.lineTo(c, c - gap);
  ctx.moveTo(c, c + gap); ctx.lineTo(c, c + outerR);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = "#ff2222";
  ctx.beginPath();
  ctx.arc(c, c, lw * 0.7, 0, PI2);
  ctx.fill();

  // Mil-dots on the crosshairs
  const dots = [0.25, 0.35];
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (const d of dots) {
    const dist = outerR * d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.beginPath();
      ctx.arc(c + dx * dist, c + dy * dist, lw * 0.35, 0, PI2);
      ctx.fill();
    }
  }
});

// ── Target ─────────────────────────────────────────────────
registerCursor("target", "Target", "Concentric ring target", (ctx, size) => {
  const c = size / 2;
  const lw = Math.max(1.5, size * 0.04);

  // Outer ring
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = lw + 2;
  ctx.beginPath(); ctx.arc(c, c, size * 0.4, 0, PI2); ctx.stroke();
  ctx.strokeStyle = "#ff4444";
  ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(c, c, size * 0.4, 0, PI2); ctx.stroke();

  // Middle ring
  ctx.strokeStyle = "#ff8844";
  ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.arc(c, c, size * 0.26, 0, PI2); ctx.stroke();

  // Inner ring
  ctx.strokeStyle = "#ffcc44";
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.arc(c, c, size * 0.13, 0, PI2); ctx.stroke();

  // Bullseye
  ctx.fillStyle = "#ff2222";
  ctx.beginPath(); ctx.arc(c, c, lw, 0, PI2); ctx.fill();
});

// ── Diamond ────────────────────────────────────────────────
registerCursor("diamond", "Diamond", "Rotating diamond reticle", (ctx, size) => {
  const c = size / 2;
  const s = size * 0.3;
  const lw = Math.max(1.5, size * 0.05);

  ctx.save();
  ctx.translate(c, c);

  // Shadow
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = lw + 2;
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath();
  ctx.stroke();

  // Diamond
  ctx.strokeStyle = "#00ddff";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath();
  ctx.stroke();

  // Center dot
  ctx.fillStyle = "#00ffff";
  ctx.beginPath(); ctx.arc(0, 0, lw * 0.5, 0, PI2); ctx.fill();

  // Corner ticks
  const tick = size * 0.08;
  ctx.strokeStyle = "rgba(0,220,255,0.6)";
  ctx.lineWidth = lw * 0.5;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const px = dx * s, py = dy * s;
    ctx.beginPath();
    ctx.moveTo(px + dy * tick, py + dx * tick);
    ctx.lineTo(px - dy * tick, py - dx * tick);
    ctx.stroke();
  }

  ctx.restore();
});

// ── Dot ────────────────────────────────────────────────────
registerCursor("dot", "Dot", "Glowing center dot", (ctx, size) => {
  const c = size / 2;
  const r = size * 0.12;

  // Glow
  const glow = ctx.createRadialGradient(c, c, 0, c, c, size * 0.35);
  glow.addColorStop(0, "rgba(100,200,255,0.35)");
  glow.addColorStop(1, "rgba(100,200,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(c, c, size * 0.35, 0, PI2); ctx.fill();

  // Outer ring
  ctx.strokeStyle = "rgba(150,220,255,0.6)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath(); ctx.arc(c, c, r * 2, 0, PI2); ctx.stroke();

  // Core
  ctx.fillStyle = "#aaddff";
  ctx.beginPath(); ctx.arc(c, c, r, 0, PI2); ctx.fill();

  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath(); ctx.arc(c - r * 0.25, c - r * 0.25, r * 0.4, 0, PI2); ctx.fill();
});

// ── Triangle ───────────────────────────────────────────────
registerCursor("triangle", "Triangle", "Triangular pointer cursor", (ctx, size) => {
  const lw = Math.max(1.5, size * 0.04);

  ctx.save();
  ctx.translate(size * 0.2, size * 0.12);

  const h = size * 0.7;
  const w = h * 0.55;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.moveTo(2, 2); ctx.lineTo(w + 2, h * 0.7 + 2); ctx.lineTo(0 + 2, h + 2); ctx.closePath();
  ctx.fill();

  // Pointer body
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w, h * 0.7); ctx.lineTo(0, h); ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
});

// ── Star ───────────────────────────────────────────────────
registerCursor("star", "Star", "Four-pointed star cursor", (ctx, size) => {
  const c = size / 2;
  const outerR = size * 0.4;
  const innerR = size * 0.12;
  const points = 4;
  const lw = Math.max(1.5, size * 0.04);

  ctx.save();
  ctx.translate(c, c);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * PI2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(Math.cos(angle) * r + 1, Math.sin(angle) * r + 1);
    else ctx.lineTo(Math.cos(angle) * r + 1, Math.sin(angle) * r + 1);
  }
  ctx.closePath();
  ctx.fill();

  // Star
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR);
  grad.addColorStop(0, "#ffee88");
  grad.addColorStop(1, "#ffaa22");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#cc8800";
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * PI2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
});

// ── Skull ──────────────────────────────────────────────────
registerCursor("skull", "Skull", "Menacing skull icon", (ctx, size) => {
  const c = size / 2;
  const r = size * 0.32;
  const lw = Math.max(1.5, size * 0.04);

  ctx.save();
  ctx.translate(c, c);

  // Head (slightly taller oval)
  ctx.fillStyle = "#eee";
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.1, r, r * 1.1, 0, 0, PI2);
  ctx.fill();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.15, r * 0.2, r * 0.25, 0, 0, PI2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.35, -r * 0.15, r * 0.2, r * 0.25, 0, 0, PI2);
  ctx.fill();

  // Red eye glow
  ctx.fillStyle = "#ff2222";
  ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.15, r * 0.08, 0, PI2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.15, r * 0.08, 0, PI2); ctx.fill();

  // Nose
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, r * 0.15);
  ctx.lineTo(r * 0.08, r * 0.15);
  ctx.lineTo(0, r * 0.28);
  ctx.closePath();
  ctx.fill();

  // Jaw / teeth
  ctx.strokeStyle = "#444";
  ctx.lineWidth = lw * 0.6;
  ctx.lineCap = "round";
  const teethY = r * 0.55;
  for (let i = -2; i <= 2; i++) {
    const tx = i * r * 0.18;
    ctx.beginPath();
    ctx.moveTo(tx, teethY - r * 0.1);
    ctx.lineTo(tx, teethY + r * 0.1);
    ctx.stroke();
  }

  ctx.restore();
});

// ── Sword ──────────────────────────────────────────────────
registerCursor("sword", "Sword", "Blade-shaped cursor", (ctx, size) => {
  const lw = Math.max(1.5, size * 0.04);
  ctx.save();
  ctx.translate(size * 0.5, size * 0.1);
  ctx.rotate(Math.PI / 4 * 0.9);

  const bladeLen = size * 0.55;
  const bladeW = size * 0.06;
  const guardW = size * 0.18;
  const handleLen = size * 0.18;

  // Shadow
  ctx.save();
  ctx.translate(1.5, 1.5);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.moveTo(-bladeW, 0);
  ctx.lineTo(0, -bladeLen);
  ctx.lineTo(bladeW, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Blade
  const grad = ctx.createLinearGradient(-bladeW, 0, bladeW, 0);
  grad.addColorStop(0, "#aab");
  grad.addColorStop(0.5, "#eef");
  grad.addColorStop(1, "#99a");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#556";
  ctx.lineWidth = lw * 0.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-bladeW, 0);
  ctx.lineTo(0, -bladeLen);
  ctx.lineTo(bladeW, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Guard
  ctx.fillStyle = "#886622";
  ctx.strokeStyle = "#553311";
  ctx.lineWidth = lw * 0.5;
  ctx.beginPath();
  ctx.roundRect(-guardW, -lw, guardW * 2, lw * 2.5, 2);
  ctx.fill();
  ctx.stroke();

  // Handle
  ctx.fillStyle = "#553311";
  ctx.beginPath();
  ctx.roundRect(-bladeW * 0.7, lw, bladeW * 1.4, handleLen, 2);
  ctx.fill();

  // Pommel
  ctx.fillStyle = "#ffd700";
  ctx.beginPath();
  ctx.arc(0, lw + handleLen, bladeW * 0.8, 0, PI2);
  ctx.fill();

  ctx.restore();
});

// ── Laser ──────────────────────────────────────────────────
registerCursor("laser", "Laser", "Laser sight dot with beams", (ctx, size) => {
  const c = size / 2;
  const beamLen = size * 0.38;
  const lw = Math.max(1.5, size * 0.03);

  // Glow
  const glow = ctx.createRadialGradient(c, c, 0, c, c, size * 0.3);
  glow.addColorStop(0, "rgba(255,0,0,0.3)");
  glow.addColorStop(1, "rgba(255,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(c, c, size * 0.3, 0, PI2); ctx.fill();

  // Beams (4 directions)
  ctx.strokeStyle = "rgba(255,40,40,0.5)";
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  const gap = size * 0.08;
  ctx.beginPath();
  ctx.moveTo(c - beamLen, c); ctx.lineTo(c - gap, c);
  ctx.moveTo(c + gap, c); ctx.lineTo(c + beamLen, c);
  ctx.moveTo(c, c - beamLen); ctx.lineTo(c, c - gap);
  ctx.moveTo(c, c + gap); ctx.lineTo(c, c + beamLen);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = "#ff0000";
  ctx.beginPath(); ctx.arc(c, c, size * 0.05, 0, PI2); ctx.fill();

  // Bright highlight
  ctx.fillStyle = "rgba(255,180,180,0.9)";
  ctx.beginPath(); ctx.arc(c, c, size * 0.025, 0, PI2); ctx.fill();
});

// ── Hex ────────────────────────────────────────────────────
registerCursor("hex", "Hex", "Hexagonal reticle", (ctx, size) => {
  const c = size / 2;
  const r = size * 0.36;
  const lw = Math.max(1.5, size * 0.04);

  ctx.save();
  ctx.translate(c, c);

  // Shadow
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = lw + 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI2 - Math.PI / 6;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.stroke();

  // Hex
  ctx.strokeStyle = "#44ff88";
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI2 - Math.PI / 6;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.stroke();

  // Inner hex
  const ir = r * 0.45;
  ctx.strokeStyle = "rgba(68,255,136,0.4)";
  ctx.lineWidth = lw * 0.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI2 - Math.PI / 6;
    if (i === 0) ctx.moveTo(Math.cos(a) * ir, Math.sin(a) * ir);
    else ctx.lineTo(Math.cos(a) * ir, Math.sin(a) * ir);
  }
  ctx.closePath();
  ctx.stroke();

  // Center dot
  ctx.fillStyle = "#44ff88";
  ctx.beginPath(); ctx.arc(0, 0, lw * 0.6, 0, PI2); ctx.fill();

  // Lines from vertices to center gap
  const gap = size * 0.06;
  ctx.strokeStyle = "rgba(68,255,136,0.35)";
  ctx.lineWidth = lw * 0.5;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI2 - Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a) * gap, Math.sin(a) * gap);
    ctx.stroke();
  }

  ctx.restore();
});

// ── Helper: get a cursor def by id ─────────────────────────
export function getCursorDef(id: string): CursorDef | undefined {
  return CURSOR_LIST.find((c) => c.id === id);
}

/** Pre-render a cursor to a data URL at the given pixel size. */
export function renderCursorToDataURL(id: string, pixelSize: number): string | null {
  const def = getCursorDef(id);
  if (!def) return null;
  const canvas = document.createElement("canvas");
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  def.draw(ctx, pixelSize);
  return canvas.toDataURL("image/png");
}
