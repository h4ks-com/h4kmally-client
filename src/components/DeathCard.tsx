import { useEffect, useRef, useState, useCallback } from "react";
import { Muxer, ArrayBufferTarget } from "webm-muxer";
import type { ReplayFrame, ReplayCell } from "../game/replay";
import { getSkinFile } from "../skinFileMap";
import { getEffect } from "../game/effects";
import "./DeathCard.css";

interface DeathCardProps {
  peakMass: number;
  cellsEaten: number;
  timeAlive: number; // seconds
  killerName?: string;
  replayFrames: ReplayFrame[];
  serverBaseUrl: string;
  onPlayAgain: () => void;
  onSpectate: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const PI2 = Math.PI * 2;

// Skin image cache shared across DeathCard renders
const skinCache = new Map<string, HTMLImageElement>();
const skinFailed = new Set<string>();

function getSkin(name: string, serverBaseUrl: string): HTMLImageElement | null {
  if (!name || !serverBaseUrl || skinFailed.has(name)) return null;
  const cached = skinCache.get(name);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const fileName = getSkinFile(name);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = `${serverBaseUrl}/skins/${fileName}`;
  img.onerror = () => { skinFailed.add(name); skinCache.delete(name); };
  skinCache.set(name, img);
  return null;
}

// ── Shared frame renderer (used by both playback & download) ──

/**
 * Persistent visual smoother — mirrors the game's state.interpolate() approach.
 * Maintains a "visual" position per cell that exponentially slides toward
 * the target position each render frame, producing the same silky movement
 * as the live game renderer.
 */
class ReplaySmoother {
  // cell id → smoothed visual state
  private cells = new Map<number, { x: number; y: number; size: number }>();
  private camX = 0;
  private camY = 0;
  private camZoom = 1;
  private initialized = false;

  /** Reset state (call on seek / restart). */
  reset() {
    this.cells.clear();
    this.initialized = false;
  }

  /**
   * Advance the smoother toward the given frame.
   * `dt` is seconds since last call.
   * Returns a smoothed frame ready for rendering.
   */
  smooth(frame: ReplayFrame, dt: number): ReplayFrame {
    // Same lerp factor as the game: dt * 12, clamped to [0, 1]
    const f = this.initialized ? Math.min(1, dt * 12) : 1;

    // Smooth camera
    this.camX += (frame.camX - this.camX) * f;
    this.camY += (frame.camY - this.camY) * f;
    this.camZoom += (frame.camZoom - this.camZoom) * f;

    // Build smoothed cell list
    const smoothedCells: ReplayCell[] = [];
    const seen = new Set<number>();

    for (const cell of frame.cells) {
      seen.add(cell.id);
      const prev = this.cells.get(cell.id);
      if (prev) {
        prev.x += (cell.x - prev.x) * f;
        prev.y += (cell.y - prev.y) * f;
        prev.size += (cell.size - prev.size) * f;
        smoothedCells.push({ ...cell, x: prev.x, y: prev.y, size: prev.size });
      } else {
        // New cell — snap to position
        this.cells.set(cell.id, { x: cell.x, y: cell.y, size: cell.size });
        smoothedCells.push(cell);
      }
    }

    // Remove cells no longer in the frame
    for (const id of this.cells.keys()) {
      if (!seen.has(id)) this.cells.delete(id);
    }

    this.initialized = true;

    return {
      ...frame,
      camX: this.camX,
      camY: this.camY,
      camZoom: this.camZoom,
      cells: smoothedCells,
    };
  }
}

/**
 * Find the raw (unsmoothed) replay frame for a given playback time.
 * Uses binary search to find the frame at or just before the time.
 */
function getFrameAtTime(
  frames: ReplayFrame[],
  firstFrameTime: number,
  timeMs: number,
): ReplayFrame | null {
  const n = frames.length;
  if (n === 0) return null;
  const absTime = firstFrameTime + timeMs;

  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].time <= absTime) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

function renderReplayFrame(
  ctx: CanvasRenderingContext2D,
  frame: ReplayFrame,
  W: number,
  H: number,
  serverBaseUrl: string,
  lastFrameTime: number,
) {
  const camX = frame.camX;
  const camY = frame.camY;
  const baseZoom = Math.min(W, H) / 2000;
  const zoom = baseZoom * Math.max(0.3, Math.min(frame.camZoom, 2));

  ctx.fillStyle = "#111a22";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  // Grid
  const gridSpacing = 50;
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1 / zoom;
  const left = camX - W / 2 / zoom;
  const right = camX + W / 2 / zoom;
  const top = camY - H / 2 / zoom;
  const bottom = camY + H / 2 / zoom;
  const gridLeft = Math.floor(left / gridSpacing) * gridSpacing;
  const gridTop = Math.floor(top / gridSpacing) * gridSpacing;
  ctx.beginPath();
  for (let x = gridLeft; x <= right; x += gridSpacing) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = gridTop; y <= bottom; y += gridSpacing) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  const sorted = [...frame.cells].sort((a, b) => a.size - b.size);
  for (const cell of sorted) {
    drawReplayCell(ctx, cell, frame.myCellIds, serverBaseUrl, zoom);
  }

  ctx.restore();

  // Time overlay
  const timeLeft = ((lastFrameTime - frame.time) / 1000).toFixed(1);
  const barH = Math.round(28 * H / 360);
  const fontSize = Math.max(10, Math.round(12 * H / 360));
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, H - barH, W, barH);
  ctx.fillStyle = "#ccc";
  ctx.font = `${fontSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${timeLeft}s before death`, W / 2, H - barH / 2);
}

// ── Replay Canvas Component ────────────────────────────────

function ReplayCanvas({
  frames,
  serverBaseUrl,
}: {
  frames: ReplayFrame[];
  serverBaseUrl: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const playTimeRef = useRef(0);
  const [scrubberValue, setScrubberValue] = useState(0);
  const animRef = useRef<number>(0);
  const lastTickRef = useRef(0);
  const smootherRef = useRef(new ReplaySmoother());
  const [showReplay, setShowReplay] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);
  const lastBlobRef = useRef<Blob | null>(null);

  const totalFrames = frames.length;
  const lastFrameTime = totalFrames > 0 ? frames[totalFrames - 1].time : 0;
  const firstFrameTime = totalFrames > 0 ? frames[0].time : 0;
  const duration = lastFrameTime - firstFrameTime;

  // Continuous playback loop with exponential smoothing
  useEffect(() => {
    if (!playing || totalFrames === 0 || duration <= 0) return;
    lastTickRef.current = performance.now();

    const step = () => {
      const now = performance.now();
      const dtMs = now - lastTickRef.current;
      lastTickRef.current = now;
      const dtSec = dtMs / 1000;

      playTimeRef.current += dtMs;
      if (playTimeRef.current >= duration) {
        playTimeRef.current = duration;
        setPlaying(false);
      }

      // Get the raw frame for the current playback time
      const rawFrame = getFrameAtTime(frames, firstFrameTime, playTimeRef.current);
      if (!rawFrame) { animRef.current = requestAnimationFrame(step); return; }

      // Apply exponential smoothing (same dt*12 as the live game)
      const smoothed = smootherRef.current.smooth(rawFrame, dtSec);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) renderReplayFrame(ctx, smoothed, canvas.width, canvas.height, serverBaseUrl, lastFrameTime);
      }

      setScrubberValue(Math.round((playTimeRef.current / duration) * 1000));

      if (playTimeRef.current < duration) {
        animRef.current = requestAnimationFrame(step);
      }
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, totalFrames, duration, frames, firstFrameTime, serverBaseUrl, lastFrameTime]);

  // Draw when paused and scrubber changes
  useEffect(() => {
    if (playing) return;
    const canvas = canvasRef.current;
    if (!canvas || totalFrames === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rawFrame = getFrameAtTime(frames, firstFrameTime, playTimeRef.current);
    if (!rawFrame) return;
    // When paused / seeking, snap (use large dt so smoother catches up instantly)
    const smoothed = smootherRef.current.smooth(rawFrame, 1);
    renderReplayFrame(ctx, smoothed, canvas.width, canvas.height, serverBaseUrl, lastFrameTime);
  }, [scrubberValue, playing, totalFrames, frames, firstFrameTime, serverBaseUrl, lastFrameTime]);

  // ── Render WebM blob (shared by save & share) ──────────
  // Uses WebCodecs VideoEncoder + webm-muxer for frame-accurate timestamps.
  // Each frame gets an explicit timestamp in microseconds, so the video
  // duration is always exact regardless of how long rendering takes.
  const renderWebM = useCallback(async (): Promise<Blob | null> => {
    if (totalFrames === 0 || downloading || duration <= 0) return null;
    setDownloading(true);
    setPlaying(false);
    setDlProgress(0);

    try {
      const W = 1280, H = 720;
      const offscreen = document.createElement("canvas");
      offscreen.width = W;
      offscreen.height = H;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) { setDownloading(false); return null; }

      const videoFps = 30;
      const totalVideoFrames = Math.ceil((duration / 1000) * videoFps);
      const frameDt = 1 / videoFps;
      const frameDelayMs = 1000 / videoFps;
      const frameDurationUs = Math.round(1_000_000 / videoFps); // µs per frame

      // Set up WebM muxer + VideoEncoder
      const muxTarget = new ArrayBufferTarget();
      const muxer = new Muxer({
        target: muxTarget,
        video: {
          codec: "V_VP9",
          width: W,
          height: H,
        },
      });

      let encoderError: Error | null = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta ?? undefined),
        error: (e) => { encoderError = e; },
      });
      encoder.configure({
        codec: "vp09.00.10.08",
        width: W,
        height: H,
        bitrate: 8_000_000,
        framerate: videoFps,
      });

      // Render & encode each frame with explicit timestamps
      const dlSmoother = new ReplaySmoother();

      for (let i = 0; i <= totalVideoFrames; i++) {
        if (encoderError) throw encoderError;

        const timeMs = Math.min(i * frameDelayMs, duration);
        const rawFrame = getFrameAtTime(frames, firstFrameTime, timeMs);
        if (rawFrame) {
          const smoothed = dlSmoother.smooth(rawFrame, frameDt);
          renderReplayFrame(offCtx, smoothed, W, H, serverBaseUrl, lastFrameTime);
        }

        // Create VideoFrame with exact timestamp (microseconds)
        const vf = new VideoFrame(offscreen, {
          timestamp: i * frameDurationUs,
          duration: frameDurationUs,
        });
        encoder.encode(vf, { keyFrame: i % 60 === 0 });
        vf.close();

        // Drain encoder queue to prevent backpressure stalling flush().
        // Wait when more than 5 frames are queued for encoding.
        while (encoder.encodeQueueSize > 5) {
          await new Promise<void>((r) => setTimeout(r, 10));
          if (encoderError) throw encoderError;
        }

        // Yield to UI periodically for progress updates
        if (i % 10 === 0) {
          setDlProgress(Math.round((i / totalVideoFrames) * 90));
          setScrubberValue(Math.round((timeMs / duration) * 1000));
          playTimeRef.current = timeMs;
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }

      // Flush encoder and finalize muxer
      await encoder.flush();
      encoder.close();
      if (encoderError) throw encoderError;

      muxer.finalize();
      setDlProgress(100);

      const blob = new Blob([muxTarget.buffer], { type: "video/webm" });
      lastBlobRef.current = blob;
      return blob;
    } catch (err) {
      console.error("Replay render failed:", err);
      return null;
    } finally {
      setDownloading(false);
      setDlProgress(0);
    }
  }, [totalFrames, downloading, duration, frames, firstFrameTime, serverBaseUrl, lastFrameTime]);

  // ── Save (download) handler ──────────────────────────────
  const handleSave = useCallback(async () => {
    let blob = lastBlobRef.current;
    if (!blob) blob = await renderWebM();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `h4kmally-replay-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShareMenuOpen(false);
  }, [renderWebM]);

  // ── Share (upload via server proxy) handler ────────────────
  const handleShare = useCallback(async () => {
    setShareMenuOpen(false);
    setShareLink("");
    setCopied(false);

    let blob = lastBlobRef.current;
    if (!blob) blob = await renderWebM();
    if (!blob) return;

    setUploading(true);
    setUploadProgress("Uploading...");
    try {
      const formData = new FormData();
      formData.append("file", blob, `h4kmally-replay-${Date.now()}.webm`);
      const resp = await fetch(`${serverBaseUrl}/api/share/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.status === "success" && data.url) {
        setShareLink(data.url);
        setUploadProgress("");
      } else {
        setUploadProgress(data.message || "Upload failed");
      }
    } catch (err) {
      console.error("Share upload failed:", err);
      setUploadProgress("Upload failed");
    } finally {
      setUploading(false);
    }
  }, [renderWebM, serverBaseUrl]);

  // Close share menu on outside click
  const shareDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shareMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareDropdownRef.current && !shareDropdownRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareMenuOpen]);

  if (!showReplay) {
    return (
      <button
        className="replay-btn view-playback-btn"
        onClick={() => { setShowReplay(true); setPlaying(true); }}
      >
        ▶ View Playback
      </button>
    );
  }

  return (
    <div className="replay-container">
      <canvas
        ref={canvasRef}
        width={560}
        height={360}
        className="replay-canvas"
      />
      <div className="replay-controls">
        <button
          className="replay-btn"
          onClick={() => setPlaying(!playing)}
          title={playing ? "Pause" : "Play"}
          disabled={downloading}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          className="replay-btn"
          onClick={() => {
            smootherRef.current.reset();
            playTimeRef.current = 0;
            setScrubberValue(0);
            setPlaying(true);
          }}
          title="Restart"
          disabled={downloading}
        >
          ⏮
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={scrubberValue}
          onChange={(e) => {
            const v = Number(e.target.value);
            setScrubberValue(v);
            playTimeRef.current = (v / 1000) * duration;
            smootherRef.current.reset();
            setPlaying(false);
          }}
          className="replay-scrubber"
          disabled={downloading}
        />
        <div className="share-dropdown-wrapper" ref={shareDropdownRef}>
          <button
            className="replay-btn replay-download-btn"
            onClick={() => setShareMenuOpen(!shareMenuOpen)}
            disabled={downloading || uploading}
            title="Save or share replay"
          >
            {downloading ? `Rendering ${dlProgress}%` : uploading ? uploadProgress : "↗ Share"}
          </button>
          {shareMenuOpen && (
            <div className="share-dropdown">
              <button className="share-dropdown-item" onClick={handleSave}>
                ⬇ Save
              </button>
              <button className="share-dropdown-item" onClick={handleShare}>
                🔗 Share
              </button>
            </div>
          )}
        </div>
      </div>
      {shareLink && (
        <div className="share-link-row">
          <input
            className="share-link-input"
            type="text"
            value={shareLink}
            readOnly
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            className="replay-btn share-copy-btn"
            title="Copy link"
            onClick={() => {
              navigator.clipboard.writeText(shareLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "✓" : "📋"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Draw a single cell in the replay. */
function drawReplayCell(
  ctx: CanvasRenderingContext2D,
  cell: ReplayCell,
  myCellIds: number[],
  serverBaseUrl: string,
  zoom: number,
) {
  const { x, y, size, r, g, b } = cell;
  const isMine = myCellIds.includes(cell.id);

  ctx.save();
  ctx.translate(x, y);

  if (cell.isVirus) {
    ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "#33ff33";
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.stroke();
  } else if (cell.isPlayer) {
    const visualSize = size * 1.05;

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, visualSize, 0, PI2);
    ctx.closePath();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();

    // Skin
    const skinImg = cell.skin ? getSkin(cell.skin, serverBaseUrl) : null;
    if (skinImg) {
      ctx.save();
      ctx.clip();
      const imgSize = visualSize * 2;
      const sw = skinImg.naturalWidth || imgSize;
      const sh = skinImg.naturalHeight || imgSize;
      const side = Math.min(sw, sh);
      const sx = (sw - side) / 2;
      const sy = (sh - side) / 2;
      ctx.drawImage(skinImg, sx, sy, side, side, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    // Outline
    const lineW = Math.max(Math.round(visualSize / 50), 6);
    ctx.strokeStyle = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.arc(0, 0, visualSize - lineW / 2, 0, PI2);
    ctx.stroke();

    // Effect
    if (cell.effect) {
      const effectFn = getEffect(cell.effect);
      if (effectFn) {
        effectFn(ctx, visualSize, r, g, b, performance.now() / 1000, visualSize * zoom);
      }
    }

    // Highlight own cells
    if (isMine) {
      ctx.strokeStyle = "rgba(91,187,255,0.5)";
      ctx.lineWidth = Math.max(3, visualSize * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, visualSize * 1.12, 0, PI2);
      ctx.stroke();
    }

    // Name
    if (cell.name && size > 20) {
      const fontSize = Math.max(12, size * 0.4);
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, fontSize * 0.1);
      ctx.strokeStyle = "#000";
      ctx.fillStyle = "#fff";

      if (cell.clan) {
        const clanFontSize = fontSize * 0.45;
        ctx.font = `bold ${clanFontSize}px Arial, sans-serif`;
        ctx.fillStyle = "rgba(100, 200, 255, 0.9)";
        ctx.lineWidth = Math.max(1, clanFontSize * 0.08);
        ctx.strokeText(`[${cell.clan}]`, 0, -fontSize * 0.9);
        ctx.fillText(`[${cell.clan}]`, 0, -fontSize * 0.9);
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = "#fff";
        ctx.lineWidth = Math.max(2, fontSize * 0.1);
        ctx.strokeStyle = "#000";
      }

      ctx.strokeText(cell.name, 0, 0);
      ctx.fillText(cell.name, 0, 0);
    }
  } else {
    // Food / eject
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, PI2);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── Main DeathCard ─────────────────────────────────────────

export default function DeathCard({
  peakMass,
  cellsEaten,
  timeAlive,
  killerName,
  replayFrames,
  serverBaseUrl,
  onPlayAgain,
  onSpectate,
}: DeathCardProps) {
  // Auto-dismiss after 30 seconds (longer to allow watching replay)
  useEffect(() => {
    const timer = setTimeout(onSpectate, 30000);
    return () => clearTimeout(timer);
  }, [onSpectate]);

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSpectate();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSpectate]);

  const hasReplay = replayFrames.length > 10;

  return (
    <div className="death-card-overlay" onClick={onSpectate}>
      <div
        className={`death-card ${hasReplay ? "death-card-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>You Died</h2>
        {killerName && (
          <p className="death-card-killer">
            Killed by <span className="killer-name">💀 {killerName}</span>
          </p>
        )}

        {hasReplay && (
          <ReplayCanvas frames={replayFrames} serverBaseUrl={serverBaseUrl} />
        )}

        <div className="death-card-stats">
          <div className="death-stat">
            <span className="death-stat-value">{peakMass.toLocaleString()}</span>
            <span className="death-stat-label">Peak Mass</span>
          </div>
          <div className="death-stat">
            <span className="death-stat-value">{cellsEaten}</span>
            <span className="death-stat-label">Players Eaten</span>
          </div>
          <div className="death-stat">
            <span className="death-stat-value">{formatTime(timeAlive)}</span>
            <span className="death-stat-label">Time Alive</span>
          </div>
          <div className="death-stat">
            <span className="death-stat-value">
              {timeAlive > 0 ? (peakMass / (timeAlive / 60)).toFixed(0) : "0"}
            </span>
            <span className="death-stat-label">Mass / Min</span>
          </div>
        </div>
        <div className="death-card-actions">
          <button className="death-card-btn primary" onClick={onPlayAgain}>
            Play Again
          </button>
          <button className="death-card-btn secondary" onClick={onSpectate}>
            Spectate
          </button>
        </div>
      </div>
    </div>
  );
}
