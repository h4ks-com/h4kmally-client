import { ShuffleTable } from "./shuffle";
import { Reader, Writer } from "./buffer";
import {
  PROTOCOL_VERSION,
  CLIENT_SPAWN,
  CLIENT_MOUSE,
  CLIENT_SPLIT,
  CLIENT_EJECT,
  CLIENT_MULTIBOX_TOGGLE,
  CLIENT_MULTIBOX_SWITCH,
  CLIENT_DIRECTION_LOCK,
  CLIENT_FREEZE_POSITION,
  CLIENT_USE_POWERUP,
  CLIENT_CHAT,
  CLIENT_SPECTATE,
  CLIENT_SPECTATOR_CMD,
  CLIENT_PING,
  SERVER_WORLD_UPDATE,
  SERVER_CAMERA,
  SERVER_CLEAR_ALL,
  SERVER_CLEAR_MINE,
  SERVER_MULTIBOX_STATE,
  SERVER_ADD_MY_CELL,
  SERVER_ADD_MULTI_CELL,
  SERVER_LEADERBOARD_FFA,
  SERVER_BORDER,
  SERVER_CHAT,
  SERVER_CLAN_CHAT,
  SERVER_CLAN_POSITIONS,
  SERVER_BATTLE_ROYALE,
  SERVER_POWERUP_STATE,
  SERVER_SPAWN_RESULT,
  SERVER_PING_REPLY,
} from "./opcodes";

// ── Event types ──────────────────────────────────────────────

export interface CellUpdate {
  id: number;
  x: number;
  y: number;
  size: number;
  isVirus: boolean;
  isPlayer: boolean;
  isSubscriber: boolean;
  clan: string;
  color?: { r: number; g: number; b: number };
  skin?: string;
  name?: string;
  effect?: string;
}

export interface EatEvent {
  eaterId: number;
  eatenId: number;
}

export interface WorldUpdateEvent {
  eats: EatEvent[];
  cells: CellUpdate[];
  removedIds: number[];
}

export interface LeaderboardEntry {
  name: string;
  rank: number;
  isMe: boolean;
  isSub: boolean;
}

export interface Border {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ChatMessage {
  name: string;
  text: string;
  color: { r: number; g: number; b: number };
}

export interface ClanMemberPosition {
  x: number;
  y: number;
  size: number;
  skin: string;
  name: string;
}

export interface BattleRoyaleState {
  state: number; // 0=inactive, 1=countdown, 2=active, 3=finished
  playersAlive: number;
  countdown: number;
  timeRemaining: number;
  zoneCX: number;
  zoneCY: number;
  zoneRadius: number;
  winnerName: string;
}

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface MultiboxState {
  enabled: boolean;
  activeSlot: number; // 0 = primary, 1 = multi
  multiAlive: boolean;
}

// ── Callbacks ────────────────────────────────────────────────

export interface ConnectionCallbacks {
  onState?: (state: ConnectionState) => void;
  onWorldUpdate?: (ev: WorldUpdateEvent) => void;
  onCamera?: (cam: Camera) => void;
  onBorder?: (b: Border) => void;
  onAddMyCell?: (id: number) => void;
  onAddMultiCell?: (id: number) => void;
  onClearAll?: () => void;
  onClearMine?: () => void;
  onLeaderboard?: (entries: LeaderboardEntry[]) => void;
  onSpawnResult?: (accepted: boolean) => void;
  onChat?: (msg: ChatMessage) => void;
  onPingReply?: (latency: number) => void;
  onMultiboxState?: (state: MultiboxState) => void;
  onClanChat?: (msg: ChatMessage) => void;
  onClanPositions?: (members: ClanMemberPosition[]) => void;
  onBattleRoyale?: (br: BattleRoyaleState) => void;
  onPowerupState?: (inventory: Record<string, number>) => void;
}

// ── Connection ───────────────────────────────────────────────

export class Connection {
  private ws: WebSocket | null = null;
  private shuffle: ShuffleTable | null = null;
  private cb: ConnectionCallbacks;
  private state: ConnectionState = "disconnected";
  private pingTimestamp = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private handshakePhase: "version" | "ready" = "version";

  // Auto-reconnect
  private lastUrl: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private autoReconnect = true;
  private manualDisconnect = false;

  constructor(cb: ConnectionCallbacks) {
    this.cb = cb;
  }

  get connected(): boolean {
    return this.state === "connected";
  }

  connect(url: string) {
    if (this.ws) this.disconnect();
    this.manualDisconnect = false;
    this.lastUrl = url;
    this.clearReconnectTimer();
    // Clear stale state before establishing a new connection
    this.cb.onClearAll?.();
    this.cb.onClearMine?.();
    this.setState("connecting");
    this.handshakePhase = "version";
    this.shuffle = null;

    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      // Step 1: send version string
      const encoder = new TextEncoder();
      const verBytes = encoder.encode(PROTOCOL_VERSION);
      const buf = new Uint8Array(verBytes.length + 1);
      buf.set(verBytes);
      buf[verBytes.length] = 0; // null terminator
      this.ws!.send(buf.buffer);
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      if (!(ev.data instanceof ArrayBuffer)) return;
      const data = ev.data as ArrayBuffer;

      if (this.handshakePhase === "version") {
        this.handleHandshake(data);
        return;
      }
      this.handleMessage(data);
    };

    this.ws.onclose = () => this.cleanup();
    this.ws.onerror = () => this.cleanup();
  }

  disconnect() {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }
    this.cleanup();
  }

  // ── Send helpers ─────────────────────────────────────────

  sendSpawn(name: string, skin: string = "", effect: string = "") {
    if (!this.shuffle || !this.ws) return;
    const json = JSON.stringify({ name, skin, effect, showClanmates: true, token: "", email: "" });
    const w = new Writer(128);
    w.writeUint8(this.shuffle.encode(CLIENT_SPAWN));
    w.writeStringUTF8(json);
    this.ws.send(w.build());
  }

  sendMouse(x: number, y: number) {
    if (!this.shuffle || !this.ws) return;
    const w = new Writer(9);
    w.writeUint8(this.shuffle.encode(CLIENT_MOUSE));
    w.writeInt32(Math.round(x));
    w.writeInt32(Math.round(y));
    this.ws.send(w.build());
  }

  sendSplit() {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(1);
    buf[0] = this.shuffle.encode(CLIENT_SPLIT);
    this.ws.send(buf.buffer);
  }

  sendEject() {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(1);
    buf[0] = this.shuffle.encode(CLIENT_EJECT);
    this.ws.send(buf.buffer);
  }

  sendChat(text: string) {
    if (!this.shuffle || !this.ws) return;
    const w = new Writer(128);
    w.writeUint8(this.shuffle.encode(CLIENT_CHAT));
    w.writeUint8(0); // flags
    w.writeStringUTF8(text);
    this.ws.send(w.build());
  }

  sendSpectate() {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(1);
    buf[0] = this.shuffle.encode(CLIENT_SPECTATE);
    this.ws.send(buf.buffer);
  }

  /** Toggle spectator follow mode (F key). */
  sendSpectatorFollow() {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(2);
    buf[0] = this.shuffle.encode(CLIENT_SPECTATOR_CMD);
    buf[1] = 0x01;
    this.ws.send(buf.buffer);
  }

  /** Toggle multibox on/off. */
  sendMultiboxToggle() {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(1);
    buf[0] = this.shuffle.encode(CLIENT_MULTIBOX_TOGGLE);
    this.ws.send(buf.buffer);
  }

  /** Switch active multibox slot (Tab). */
  sendMultiboxSwitch() {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(1);
    buf[0] = this.shuffle.encode(CLIENT_MULTIBOX_SWITCH);
    this.ws.send(buf.buffer);
  }

  /** Lock or unlock movement direction (Shift key). */
  sendDirectionLock(lock: boolean) {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(2);
    buf[0] = this.shuffle.encode(CLIENT_DIRECTION_LOCK);
    buf[1] = lock ? 1 : 0;
    this.ws.send(buf.buffer);
  }

  /** Freeze or unfreeze cell positions (X key). */
  sendFreezePosition(freeze: boolean) {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(2);
    buf[0] = this.shuffle.encode(CLIENT_FREEZE_POSITION);
    buf[1] = freeze ? 1 : 0;
    this.ws.send(buf.buffer);
  }

  /** Use a charge of a powerup by slot number (1-6). */
  sendUsePowerup(slot: number) {
    if (!this.shuffle || !this.ws) return;
    const buf = new Uint8Array(2);
    buf[0] = this.shuffle.encode(CLIENT_USE_POWERUP);
    buf[1] = slot;
    this.ws.send(buf.buffer);
  }

  private sendPing() {
    if (!this.shuffle || !this.ws) return;
    this.pingTimestamp = performance.now();
    const buf = new Uint8Array(1);
    buf[0] = this.shuffle.encode(CLIENT_PING);
    this.ws.send(buf.buffer);
  }

  // ── Handshake ────────────────────────────────────────────

  private handleHandshake(data: ArrayBuffer) {
    // Expect 266 bytes: 10 (version) + 256 (shuffle table)
    if (data.byteLength < 266) {
      console.error("Invalid handshake response, length:", data.byteLength);
      this.disconnect();
      return;
    }
    const bytes = new Uint8Array(data);
    // Verify version string
    const verBytes = bytes.slice(0, 10);
    const ver = new TextDecoder("utf-8").decode(verBytes.slice(0, 9));
    if (ver !== PROTOCOL_VERSION) {
      console.error("Version mismatch:", ver);
      this.disconnect();
      return;
    }
    // Extract shuffle table
    const tableBytes = bytes.slice(10, 266);
    this.shuffle = new ShuffleTable(tableBytes);

    this.handshakePhase = "ready";
    this.setState("connected");

    // Start ping loop
    this.pingInterval = setInterval(() => this.sendPing(), 2000);
  }

  // ── Message dispatch ─────────────────────────────────────

  private handleMessage(data: ArrayBuffer) {
    if (!this.shuffle) return;
    const r = new Reader(data);
    const wireOp = r.readUint8();
    const op = this.shuffle.decode(wireOp);

    switch (op) {
      case SERVER_WORLD_UPDATE:
        this.parseWorldUpdate(r);
        break;
      case SERVER_CAMERA:
        this.parseCamera(r);
        break;
      case SERVER_CLEAR_ALL:
        this.cb.onClearAll?.();
        break;
      case SERVER_CLEAR_MINE:
        this.cb.onClearMine?.();
        break;
      case SERVER_ADD_MY_CELL:
        this.cb.onAddMyCell?.(r.readUint32());
        break;
      case SERVER_ADD_MULTI_CELL:
        this.cb.onAddMultiCell?.(r.readUint32());
        break;
      case SERVER_MULTIBOX_STATE:
        this.cb.onMultiboxState?.({
          enabled: r.readUint8() === 1,
          activeSlot: r.readUint8(),
          multiAlive: r.readUint8() === 1,
        });
        break;
      case SERVER_LEADERBOARD_FFA:
        this.parseLeaderboard(r);
        break;
      case SERVER_BORDER:
        this.parseBorder(r, data.byteLength);
        break;
      case SERVER_CHAT:
        this.parseChatRecv(r);
        break;
      case SERVER_CLAN_CHAT:
        this.parseClanChat(r);
        break;
      case SERVER_CLAN_POSITIONS:
        this.parseClanPositions(r);
        break;
      case SERVER_BATTLE_ROYALE:
        this.parseBattleRoyale(r);
        break;
      case SERVER_POWERUP_STATE:
        this.parsePowerupState(r);
        break;
      case SERVER_SPAWN_RESULT:
        this.cb.onSpawnResult?.(r.readUint8() === 1);
        break;
      case SERVER_PING_REPLY:
        this.cb.onPingReply?.(performance.now() - this.pingTimestamp);
        break;
      default:
        // unknown opcode — ignore
        break;
    }
  }

  // ── Parsers ──────────────────────────────────────────────

  private parseWorldUpdate(r: Reader) {
    // Eat events
    const eatCount = r.readUint16();
    const eats: EatEvent[] = [];
    for (let i = 0; i < eatCount; i++) {
      eats.push({ eaterId: r.readUint32(), eatenId: r.readUint32() });
    }

    // Cell updates
    const cells: CellUpdate[] = [];
    while (true) {
      const id = r.readUint32();
      if (id === 0) break; // sentinel

      const x = r.readInt16();
      const y = r.readInt16();
      const size = r.readUint16();
      const flags = r.readUint8();
      const isVirus = r.readUint8() === 1;
      const isPlayer = r.readUint8() === 1;
      const isSubscriber = r.readUint8() === 1;
      const clan = r.readStringUTF8();

      const cell: CellUpdate = { id, x, y, size, isVirus, isPlayer, isSubscriber, clan };

      // Conditional fields based on flags
      if (flags & 0x02) {
        cell.color = { r: r.readUint8(), g: r.readUint8(), b: r.readUint8() };
      }
      if (flags & 0x04) {
        cell.skin = r.readStringUTF8();
      }
      if (flags & 0x08) {
        cell.name = r.readStringUTF8();
      }
      if (flags & 0x10) {
        cell.effect = r.readStringUTF8();
      }

      cells.push(cell);
    }

    // Removed cell IDs
    const removeCount = r.readUint16();
    const removedIds: number[] = [];
    for (let i = 0; i < removeCount; i++) {
      removedIds.push(r.readUint32());
    }

    this.cb.onWorldUpdate?.({ eats, cells, removedIds });
  }

  private parseCamera(r: Reader) {
    const x = r.readFloat32();
    const y = r.readFloat32();
    const zoom = r.readFloat32();
    this.cb.onCamera?.({ x, y, zoom });
  }

  private parseBorder(r: Reader, _totalLen: number) {
    const left = r.readFloat64();
    const top = r.readFloat64();
    const right = r.readFloat64();
    const bottom = r.readFloat64();
    this.cb.onBorder?.({ left, top, right, bottom });
    // If 34 bytes, the extra byte signals "start ping loop" — we already start it on connect
  }

  private parseLeaderboard(r: Reader) {
    const count = r.readUint32();
    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < count; i++) {
      const isMe = r.readUint32() === 1;
      const name = r.readStringUTF8();
      const rank = r.readUint32();
      const isSub = r.readUint32() === 1;
      entries.push({ name, rank, isMe, isSub });
    }
    this.cb.onLeaderboard?.(entries);
  }

  private parseChatRecv(r: Reader) {
    r.readUint8(); // flags (reserved)
    const red = r.readUint8();
    const green = r.readUint8();
    const blue = r.readUint8();
    const name = r.readStringUTF8();
    const text = r.readStringUTF8();
    this.cb.onChat?.({ name, text, color: { r: red, g: green, b: blue } });
  }

  private parseClanChat(r: Reader) {
    r.readUint8(); // flags (reserved)
    const red = r.readUint8();
    const green = r.readUint8();
    const blue = r.readUint8();
    const name = r.readStringUTF8();
    const text = r.readStringUTF8();
    this.cb.onClanChat?.({ name, text, color: { r: red, g: green, b: blue } });
  }

  private parseClanPositions(r: Reader) {
    const count = r.readUint16();
    const members: ClanMemberPosition[] = [];
    for (let i = 0; i < count; i++) {
      const x = r.readFloat32();
      const y = r.readFloat32();
      const size = r.readUint16();
      const skin = r.readStringUTF8();
      const name = r.readStringUTF8();
      members.push({ x, y, size, skin, name });
    }
    this.cb.onClanPositions?.(members);
  }

  private parseBattleRoyale(r: Reader) {
    const state = r.readUint8();
    const playersAlive = r.readUint16();
    const countdown = r.readUint8();
    const timeRemaining = r.readUint16();
    const zoneCX = r.readFloat32();
    const zoneCY = r.readFloat32();
    const zoneRadius = r.readFloat32();
    const winnerName = r.readStringUTF8();
    this.cb.onBattleRoyale?.({
      state, playersAlive, countdown, timeRemaining,
      zoneCX, zoneCY, zoneRadius, winnerName,
    });
  }

  private parsePowerupState(r: Reader) {
    const count = r.readUint8();
    const inventory: Record<string, number> = {};
    for (let i = 0; i < count; i++) {
      const typeLen = r.readUint8();
      let powerupType = "";
      if (typeLen > 0) {
        const bytes = new Uint8Array(typeLen);
        for (let j = 0; j < typeLen; j++) {
          bytes[j] = r.readUint8();
        }
        powerupType = new TextDecoder().decode(bytes);
      }
      const charges = r.readUint8();
      if (powerupType && charges > 0) {
        inventory[powerupType] = charges;
      }
    }
    this.cb.onPowerupState?.(inventory);
  }

  // ── Internal ─────────────────────────────────────────────

  private setState(s: ConnectionState) {
    this.state = s;
    this.cb.onState?.(s);
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.ws = null;
    this.shuffle = null;
    // Clear all game state so reconnecting starts fresh
    this.cb.onClearAll?.();
    this.cb.onClearMine?.();
    this.setState("disconnected");

    // Auto-reconnect if not a manual disconnect
    if (this.autoReconnect && !this.manualDisconnect && this.lastUrl) {
      this.scheduleReconnect();
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    // First attempt is immediate, subsequent ones wait 5s
    const delay = 0;
    console.log("[WS] Scheduling reconnect...");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptReconnect();
    }, delay);
  }

  private attemptReconnect() {
    if (this.manualDisconnect || !this.lastUrl) return;
    if (this.state === "connected" || this.state === "connecting") return;
    console.log("[WS] Attempting reconnect...");

    // Use connect internals but set up a failure handler for 5s retry
    this.cb.onClearAll?.();
    this.cb.onClearMine?.();
    this.setState("connecting");
    this.handshakePhase = "version";
    this.shuffle = null;

    this.ws = new WebSocket(this.lastUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      const encoder = new TextEncoder();
      const verBytes = encoder.encode(PROTOCOL_VERSION);
      const buf = new Uint8Array(verBytes.length + 1);
      buf.set(verBytes);
      buf[verBytes.length] = 0;
      this.ws!.send(buf.buffer);
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      if (!(ev.data instanceof ArrayBuffer)) return;
      if (this.handshakePhase === "version") {
        this.handleHandshake(ev.data);
        return;
      }
      this.handleMessage(ev.data);
    };

    this.ws.onclose = () => this.cleanupForReconnect();
    this.ws.onerror = () => this.cleanupForReconnect();
  }

  /** Cleanup after a failed reconnect attempt — retries in 5s. */
  private cleanupForReconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.ws = null;
    this.shuffle = null;
    this.cb.onClearAll?.();
    this.cb.onClearMine?.();
    this.setState("disconnected");

    if (!this.manualDisconnect && this.lastUrl) {
      console.log("[WS] Reconnect failed, retrying in 5s...");
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.attemptReconnect();
      }, 5000);
    }
  }
}
