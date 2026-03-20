# h4kmally Client

A React + TypeScript web client for [h4kmally](https://github.com/h4ks-com/h4kmally-server), an open-source agar.io-style game. Connects to the server via the **SIG 0.0.2** binary WebSocket protocol.

Built with **Vite**, **React 19**, and vanilla **Canvas2D** rendering — no game framework dependencies.

## Features

- Canvas2D renderer with camera smoothing, jelly physics, and dark/light themes
- Skin system with animated GIF support (via `ImageDecoder`)
- **10 border effects** — 4 free + 6 premium visual overlays around player cells
- **Black Hole** effect with gravitational warping of grid, cells, food, viruses, and border (spaghettification)
- Effect picker modal with live preview
- **Multibox** — control two independent players with Tab-key switching
- **Token shop** — purchase skin/effect tokens with Beans Bank currency
- **Daily gift** claim UI
- Token reveal animations (skin tokens + effect tokens)
- Top Users (all-time) and live Leaderboard tabs
- In-game chat, minimap, HUD (score, ping, level-up)
- OAuth2 login via [Logto](https://logto.io)
- Admin panel (users, bans, skins management)
- Fully configurable via environment variables

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your Logto and server settings

# Start dev server (default port 3001)
npm run dev
```

### Production Build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build
```

### Docker

```bash
docker build \
  --build-arg VITE_LOGTO_ENDPOINT=https://auth.example.com \
  --build-arg VITE_LOGTO_APP_ID=your-app-id \
  --build-arg VITE_DEFAULT_WS=wss://game.example.com/ws/ \
  -t h4kmally-client .

docker run -p 3001:3001 h4kmally-client
```

Or use the management script:

```bash
./manage.sh build     # npm run build
./manage.sh start     # start Vite dev server in background
./manage.sh stop      # stop the dev server
./manage.sh restart   # stop + start
./manage.sh status    # check if running
```

## Configuration

All settings are Vite environment variables (prefixed `VITE_`). Set them in `.env` or as build arguments.

| Variable | Default | Description |
|---|---|---|
| `VITE_LOGTO_ENDPOINT` | *(required)* | Logto OAuth2 endpoint URL |
| `VITE_LOGTO_APP_ID` | *(required)* | Logto application ID |
| `VITE_PORT` | `3001` | Dev server listen port |
| `VITE_DEFAULT_WS` | `ws://localhost:3002/ws/` | Default WebSocket server URL |

## Architecture

```
sigmally-client/
├── src/
│   ├── App.tsx                  # Root component: auth, canvas, WebSocket wiring, UI panels
│   ├── main.tsx                 # Entry point: LogtoProvider + React root
│   ├── skinFileMap.ts           # Skin name → filename mapping
│   ├── vite-env.d.ts            # Vite env type declarations
│   │
│   ├── components/
│   │   ├── Lobby.tsx            # Spawn form, skin/effect selectors, Top Users + Leaderboard tabs
│   │   ├── Shop.tsx             # Token shop (3 sections: skin/effect/bundles)
│   │   ├── DailyGift.tsx        # Daily free gift claim UI
│   │   ├── Chat.tsx             # In-game chat overlay
│   │   ├── HUD.tsx              # Score, ping, leaderboard, level-up
│   │   ├── Minimap.tsx          # SVG minimap with player dots
│   │   ├── Options.tsx          # Settings modal (dark mode, mass, grid, etc.)
│   │   ├── AdminPanel.tsx       # Admin dashboard (users, bans, skins)
│   │   ├── MultiboxIndicator.tsx # Active multibox slot indicator
│   │   ├── TokenReveal.tsx      # Skin token reveal animation
│   │   ├── EffectTokenReveal.tsx # Effect token reveal animation
│   │   └── Callback.tsx         # OAuth sign-in callback
│   │
│   ├── game/
│   │   ├── renderer.ts          # Canvas2D rendering: camera, cells, grid, border, warp
│   │   ├── effects.ts           # Effect registry + renderers (10 effects)
│   │   ├── state.ts             # GameState: cells, interpolation, eat anims, camera
│   │   ├── settings.ts          # localStorage-backed settings
│   │   └── index.ts             # Barrel re-exports
│   │
│   └── protocol/
│       ├── connection.ts        # WebSocket lifecycle, SIG 0.0.2 handshake, message I/O
│       ├── opcodes.ts           # Opcode constants + protocol version
│       ├── buffer.ts            # Binary reader/writer (LE uint8–float64, UTF-8 strings)
│       ├── shuffle.ts           # 256-byte opcode obfuscation table
│       └── index.ts             # Barrel re-exports
│
├── public/                      # Static assets (favicon, icons)
├── index.html                   # SPA entry HTML
├── vite.config.ts               # Vite config (React plugin, port from env)
├── Dockerfile                   # Multi-stage: node builder → nginx SPA server
├── manage.sh                    # Dev server management script
└── package.json
```

## Controls

| Key / Input | Action |
|---|---|
| Mouse | Move toward cursor |
| Space | Split |
| W | Eject mass |
| Enter | Open/send chat |
| Escape | Close chat / toggle spectator |
| Tab | Switch multibox slot (Main ↔ Multi) |
| Q | Toggle spectator follow mode |

## Effects System

Effects are selected in the lobby via a modal picker and sent to the server at spawn time. The server broadcasts each player's active effect to all clients.

### Rendering Pipeline

1. **effects.ts** — Each effect is a `RenderFunction(ctx, cell, time)` that draws particles, glows, or distortions around a cell
2. **renderer.ts** — Calls the active effect renderer for each owned cell during the draw pass

### Black Hole Warping

The black hole effect applies gravitational warping to the entire visible scene:

- **Grid lines** are segmented and displaced toward the black hole center
- **Cells, food, and viruses** have their positions warped with **spaghettification** — anisotropic radial stretching + tangential compression
- **Border edges** are adaptively segmented (finer near the black hole) and warped
- All warping uses a **smoothstep fade** at the warp radius boundary to prevent discontinuities
- Warp strength scales with the `depth²` of gravitational pull

### Free Effects
Neon Pulse, Prismatic, Starfield, Lightning

### Premium Effects (5 effect tokens each)
Sakura, Frost, Shadow Aura, Flame, Glitch, Black Hole

## Tech Stack

- **React 19** + **TypeScript 5.9**
- **Vite 8** (dev server + build)
- **Canvas2D** (game rendering)
- **@logto/react** (OAuth2 authentication)
- **Nginx** (production Docker image)

## Protocol

The client implements the SIG 0.0.2 binary WebSocket protocol. See the server's [PROTOCOL.md](https://github.com/h4ks-com/h4kmally-server/blob/main/PROTOCOL.md) for the full specification.

## License

MIT
