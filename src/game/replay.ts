/**
 * Client-side replay recorder.
 *
 * Captures snapshots of the visible game world into a fixed-size ring buffer
 * at ~30 fps, keeping the last 60 seconds. On death the buffer is frozen and
 * handed to the DeathCard for playback.
 *
 * Each frame stores lightweight cell data: position, size, color, skin,
 * effect, name, flags — everything needed to re-render the scene.
 */

import type { GameState } from "./state";

// ── Types ──────────────────────────────────────────────────

/** Lightweight snapshot of one cell for replay. */
export interface ReplayCell {
  id: number;
  x: number;
  y: number;
  size: number;
  r: number;
  g: number;
  b: number;
  skin: string;
  effect: string;
  name: string;
  isPlayer: boolean;
  isVirus: boolean;
  clan: string;
}

/** One frame of game state. */
export interface ReplayFrame {
  /** High-res timestamp (performance.now()) when frame was captured */
  time: number;
  /** Camera position at capture time */
  camX: number;
  camY: number;
  camZoom: number;
  /** All visible cells */
  cells: ReplayCell[];
  /** The player's own cell IDs at this moment */
  myCellIds: number[];
}

// ── Constants ──────────────────────────────────────────────

const FPS = 30;
const INTERVAL_MS = 1000 / FPS; // ~33.3 ms
const DURATION_SEC = 60;
const MAX_FRAMES = FPS * DURATION_SEC; // 1800

/** Replay capture FPS — also used for playback timing. */
export const REPLAY_FPS = FPS;

// ── Recorder ───────────────────────────────────────────────

export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private head = 0;        // next write position (circular)
  private count = 0;       // frames currently stored
  private lastCapture = 0; // timestamp of last capture
  private frozen = false;  // true after death → no more writes

  /** Call every render frame. Captures a snapshot at ~30 fps. */
  record(state: GameState) {
    if (this.frozen) return;
    // Only record while the player is alive — skip lobby/spectator frames
    if (state.myCellIds.size === 0) return;

    const now = performance.now();
    if (now - this.lastCapture < INTERVAL_MS) return;
    this.lastCapture = now;

    // Snapshot all cells (skip tiny food to keep frames lean)
    const cells: ReplayCell[] = [];
    for (const cell of state.cells.values()) {
      // Skip very small food/eject mass (size < 15) to keep replay compact
      if (!cell.isPlayer && !cell.isVirus && cell.size < 15) continue;

      cells.push({
        id: cell.id,
        x: cell.x,
        y: cell.y,
        size: cell.size,
        r: cell.color.r,
        g: cell.color.g,
        b: cell.color.b,
        skin: cell.skin,
        effect: cell.effect,
        name: cell.name,
        isPlayer: cell.isPlayer,
        isVirus: cell.isVirus,
        clan: cell.clan,
      });
    }

    const frame: ReplayFrame = {
      time: now,
      // Use the player's center of mass as camera position instead of the
      // game's smoothed camera, which lags behind after respawn.  The replay
      // smoother in DeathCard applies its own exponential smoothing anyway.
      camX: state.camera.x,
      camY: state.camera.y,
      camZoom: state.cameraZoom,
      cells,
      myCellIds: [...state.myCellIds],
    };

    // If the player is alive, override camera to track their cells directly.
    if (state.myCellIds.size > 0) {
      let px = 0, py = 0, totalSize = 0;
      for (const id of state.myCellIds) {
        const cell = state.cells.get(id);
        if (cell) {
          px += cell.x * cell.size;
          py += cell.y * cell.size;
          totalSize += cell.size;
        }
      }
      if (totalSize > 0) {
        frame.camX = px / totalSize;
        frame.camY = py / totalSize;
      }
    }

    // Write into ring buffer
    if (this.count < MAX_FRAMES) {
      this.frames.push(frame);
      this.count++;
    } else {
      this.frames[this.head] = frame;
    }
    this.head = (this.head + 1) % MAX_FRAMES;
  }

  /** Freeze the buffer (call on death). Returns the ordered frames. */
  freeze(): ReplayFrame[] {
    this.frozen = true;
    if (this.count === 0) return [];

    // Linearize ring buffer into chronological order
    const ordered: ReplayFrame[] = [];
    if (this.count < MAX_FRAMES) {
      // Haven't wrapped yet — frames are already in order
      for (let i = 0; i < this.count; i++) {
        ordered.push(this.frames[i]);
      }
    } else {
      // Wrapped — oldest is at head, newest is at head-1
      for (let i = 0; i < MAX_FRAMES; i++) {
        ordered.push(this.frames[(this.head + i) % MAX_FRAMES]);
      }
    }
    return ordered;
  }

  /** Reset the recorder for a new life. */
  reset() {
    this.frames = [];
    this.head = 0;
    this.count = 0;
    this.lastCapture = 0;
    this.frozen = false;
  }

  /** Whether the recorder is frozen (post-death). */
  get isFrozen() {
    return this.frozen;
  }

  /** Number of frames currently stored. */
  get frameCount() {
    return this.count;
  }
}
