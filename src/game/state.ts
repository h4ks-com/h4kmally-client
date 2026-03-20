import type { WorldUpdateEvent, Border, Camera, LeaderboardEntry, ChatMessage } from "../protocol";

// ── Game Cell ──────────────────────────────────────────────

export interface GameCell {
  id: number;
  x: number;
  y: number;
  size: number;
  isVirus: boolean;
  isPlayer: boolean;
  isSubscriber: boolean;
  clan: string;
  color: { r: number; g: number; b: number };
  skin: string;
  name: string;
  effect: string;

  // Interpolation targets
  targetX: number;
  targetY: number;
  targetSize: number;

  // Animation
  spawnTime: number;
  eatAnimProgress: number; // 0 = not eaten, >0 = shrinking
  alpha: number;           // 0..1 opacity (fade-in on spawn, fade-out on remove)
  removing: boolean;       // true = fading out, will be deleted when alpha <= 0

  // Jelly physics (spring-mass points around the cell perimeter)
  jellyPoints: number[];    // radius of each point
  jellyVel: number[];       // velocity of each point
}

// ── Chat entry ─────────────────────────────────────────────

export interface ChatEntry extends ChatMessage {
  timestamp: number;
}

// ── Game State ─────────────────────────────────────────────

const CHAT_HISTORY_MAX = 50;
const CHAT_DISPLAY_DURATION = 10000; // 10s

export class GameState {
  cells: Map<number, GameCell> = new Map();
  myCellIds: Set<number> = new Set();
  multiCellIds: Set<number> = new Set();
  border: Border = { left: -7071, top: -7071, right: 7071, bottom: 7071 };
  camera: Camera = { x: 0, y: 0 };
  cameraZoom: number = 1;
  leaderboard: LeaderboardEntry[] = [];
  chatHistory: ChatEntry[] = [];
  latency: number = 0;
  score: number = 0;
  alive: boolean = false;
  spawnAccepted: boolean = false;

  get mapWidth(): number {
    return this.border.right - this.border.left;
  }

  get mapHeight(): number {
    return this.border.bottom - this.border.top;
  }

  onWorldUpdate(ev: WorldUpdateEvent) {
    const now = performance.now();

    // Process eat events — animate eater growing
    for (const eat of ev.eats) {
      const eatenCell = this.cells.get(eat.eatenId);
      if (eatenCell) {
        eatenCell.eatAnimProgress = 0.01; // mark as being eaten
      }
    }

    // Update/add cells
    for (const cu of ev.cells) {
      const existing = this.cells.get(cu.id);
      if (existing) {
        // If cell was fading out but server re-sent it (grid boundary flicker),
        // cancel the removal and snap back in.
        if (existing.removing) {
          existing.removing = false;
          existing.alpha = Math.max(existing.alpha, 0.5);
        }
        // Update existing cell — set interpolation targets
        existing.targetX = cu.x;
        existing.targetY = cu.y;
        existing.targetSize = cu.size;
        existing.isVirus = cu.isVirus;
        existing.isPlayer = cu.isPlayer;
        existing.isSubscriber = cu.isSubscriber;
        existing.clan = cu.clan;
        if (cu.color) existing.color = cu.color;
        if (cu.skin !== undefined) existing.skin = cu.skin;
        if (cu.name !== undefined) existing.name = cu.name;
        if (cu.effect !== undefined) existing.effect = cu.effect;
      } else {
        // New cell
        const cell: GameCell = {
          id: cu.id,
          x: cu.x,
          y: cu.y,
          size: cu.size,
          targetX: cu.x,
          targetY: cu.y,
          targetSize: cu.size,
          isVirus: cu.isVirus,
          isPlayer: cu.isPlayer,
          isSubscriber: cu.isSubscriber,
          clan: cu.clan,
          color: cu.color ?? { r: 128, g: 128, b: 128 },
          skin: cu.skin ?? "",
          name: cu.name ?? "",
          effect: cu.effect ?? "",
          spawnTime: now,
          eatAnimProgress: 0,
          alpha: 0, // fade in from 0
          removing: false,
          jellyPoints: [],
          jellyVel: [],
        };
        this.cells.set(cu.id, cell);
      }
    }

    // Mark cells for fade-out removal (instead of instant delete)
    for (const id of ev.removedIds) {
      const cell = this.cells.get(id);
      if (cell) {
        cell.removing = true;
      }
      this.myCellIds.delete(id);
      this.multiCellIds.delete(id);
    }

    // Eaten cells: instant remove (they visually merge into eater)
    for (const eat of ev.eats) {
      this.cells.delete(eat.eatenId);
      this.myCellIds.delete(eat.eatenId);
      this.multiCellIds.delete(eat.eatenId);
    }

    this.updateScore();
  }

  onCamera(cam: Camera) {
    this.camera = cam;
  }

  onBorder(b: Border) {
    this.border = b;
  }

  onAddMyCell(id: number) {
    this.myCellIds.add(id);
    this.alive = true;
    this.updateScore();
  }

  onAddMultiCell(id: number) {
    this.multiCellIds.add(id);
  }

  onClearAll() {
    this.cells.clear();
    this.myCellIds.clear();
    this.multiCellIds.clear();
  }

  onClearMine() {
    this.myCellIds.clear();
    this.alive = false;
    this.score = 0;
  }

  onLeaderboard(entries: LeaderboardEntry[]) {
    this.leaderboard = entries;
  }

  onChat(msg: ChatMessage) {
    this.chatHistory.push({ ...msg, timestamp: Date.now() });
    if (this.chatHistory.length > CHAT_HISTORY_MAX) {
      this.chatHistory.shift();
    }
  }

  onSpawnResult(accepted: boolean) {
    this.spawnAccepted = accepted;
  }

  getVisibleChat(): ChatEntry[] {
    const cutoff = Date.now() - CHAT_DISPLAY_DURATION;
    return this.chatHistory.filter((c) => c.timestamp > cutoff);
  }

  /** Interpolate cell positions toward targets. Call once per render frame. */
  interpolate(dt: number) {
    const lerpFactor = Math.min(1, dt * 12); // smooth factor
    const fadeSpeed = dt * 8; // fade-in/out speed (~125ms to fully appear/vanish)
    for (const cell of this.cells.values()) {
      cell.x += (cell.targetX - cell.x) * lerpFactor;
      cell.y += (cell.targetY - cell.y) * lerpFactor;
      cell.size += (cell.targetSize - cell.size) * lerpFactor;

      if (cell.removing) {
        // Fade out
        cell.alpha = Math.max(0, cell.alpha - fadeSpeed);
        if (cell.alpha <= 0) {
          this.cells.delete(cell.id);
        }
      } else if (cell.alpha < 1) {
        // Fade in
        cell.alpha = Math.min(1, cell.alpha + fadeSpeed);
      }
    }
  }

  private updateScore() {
    let totalMass = 0;
    for (const id of this.myCellIds) {
      const c = this.cells.get(id);
      if (c) totalMass += (c.size * c.size) / 100;
    }
    this.score = Math.round(totalMass);
  }

  /** Compute the camera center and zoom based on own cells.
   *  Zoom formula based on canvas height and total cell size: based on canvas height and total cell size.
   */
  /** Move the spectator camera by the current direction * speed * dt. */
  updateSpectator(_dt: number) {
    // Server handles spectator movement now — no-op
  }

  computeCamera(): { x: number; y: number; zoom: number } {
    if (this.myCellIds.size === 0 && this.multiCellIds.size === 0) {
      // Spectator mode: use server camera, same zoom as a starting player
      return { x: this.camera.x, y: this.camera.y, zoom: 1.0 };
    }

    // Camera center: use the server-sent camera position (tracks the active player)
    // We use myCellIds center as a fallback for smooth interpolation
    let cx = 0,
      cy = 0,
      totalSize = 0;
    for (const id of this.myCellIds) {
      const c = this.cells.get(id);
      if (c) {
        cx += c.x * c.size;
        cy += c.y * c.size;
        totalSize += c.size;
      }
    }
    if (totalSize > 0) {
      cx /= totalSize;
      cy /= totalSize;
    }

    // Use server camera (follows the active player — primary or multi)
    const camX = this.camera.x || cx;
    const camY = this.camera.y || cy;

    // Zoom: based on COMBINED mass of primary + multi cells
    let totalMass = 0;
    for (const id of this.myCellIds) {
      const c = this.cells.get(id);
      if (c) totalMass += (c.size * c.size) / 100;
    }
    for (const id of this.multiCellIds) {
      const c = this.cells.get(id);
      if (c) totalMass += (c.size * c.size) / 100;
    }
    const equivRadius = Math.sqrt(Math.max(1, totalMass)) * 10;
    const baseSize = 100;
    const targetZoom = Math.sqrt(baseSize / Math.max(baseSize, equivRadius));
    const clampedZoom = Math.max(0.08, Math.min(1.5, targetZoom));

    return { x: camX, y: camY, zoom: clampedZoom };
  }
}
