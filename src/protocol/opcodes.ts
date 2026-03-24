// SIG 0.0.2 Protocol — Logical Opcodes

// Client → Server
export const CLIENT_SPAWN = 0;
export const CLIENT_MOUSE = 16;
export const CLIENT_SPLIT = 17;
export const CLIENT_EJECT = 21;
export const CLIENT_MULTIBOX_TOGGLE = 22;
export const CLIENT_MULTIBOX_SWITCH = 23;
export const CLIENT_DIRECTION_LOCK = 24;
export const CLIENT_FREEZE_POSITION = 25;
export const CLIENT_USE_POWERUP = 26;
export const CLIENT_CHAT = 99;
export const CLIENT_STAT_UPDATE = 191;
export const CLIENT_SPECTATE = 205;
export const CLIENT_SPECTATOR_CMD = 190; // spectator: 0x01=follow, 0x02=godmode
export const CLIENT_CAPTCHA = 220;
export const CLIENT_PING = 254;

// Server → Client
export const SERVER_WORLD_UPDATE = 16;
export const SERVER_CAMERA = 17;
export const SERVER_CLEAR_ALL = 18;
export const SERVER_CLEAR_MINE = 20;
export const SERVER_MULTIBOX_STATE = 22;
export const SERVER_ADD_MY_CELL = 32;
export const SERVER_ADD_MULTI_CELL = 33;
export const SERVER_LEADERBOARD_FFA = 49;
export const SERVER_BORDER = 64;
export const SERVER_CHAT = 99;
export const SERVER_CLAN_CHAT = 100;
export const SERVER_CLAN_POSITIONS = 101;
export const SERVER_BATTLE_ROYALE = 102;
export const SERVER_POWERUP_STATE = 103;
export const SERVER_SPAWN_RESULT = 221;
export const SERVER_PING_REPLY = 254;

/** The version string sent during handshake. */
export const PROTOCOL_VERSION = "SIG 0.0.2";
