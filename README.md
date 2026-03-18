# h4kmally Client

An open-source web client for agar.io-style games, built with React, TypeScript, and Vite. Designed to work with the [h4kmally-server](https://github.com/h4ks-com/h4kmally-server).

Inspired by the private agar.io re-implementation at [sigmally.com](https://sigmally.com).

## Features

- Canvas-based game renderer with jelly physics animation
- SIG 0.0.1 binary WebSocket protocol with opcode shuffling
- OAuth2 authentication (Logto)
- Lobby with skin selection and preview (including animated GIF skins)
- Minimap, leaderboard, chat
- Admin panel (user management, bans, skin uploads)
- Spectator mode
- Configurable via environment variables
- Docker support

## Quick Start

### With Docker

```bash
docker build -t h4kmally-client .
docker run -p 3001:3001 \
  -e VITE_LOGTO_ENDPOINT=https://auth.example.com \
  -e VITE_LOGTO_APP_ID=your-app-id \
  -e VITE_DEFAULT_WS=ws://your-server:3002/ws/ \
  h4kmally-client
```

### From Source

```bash
# Install dependencies
npm install

# Start dev server
VITE_LOGTO_ENDPOINT=https://auth.example.com \
VITE_LOGTO_APP_ID=your-app-id \
VITE_DEFAULT_WS=ws://localhost:3002/ws/ \
npm run dev

# Build for production
npm run build
```

Or use the management script:

```bash
./manage.sh start     # start Vite dev server in background
./manage.sh stop      # stop the dev server
./manage.sh restart   # stop + start
./manage.sh build     # production build to dist/
./manage.sh status    # check if running
```

## Configuration

All configuration is done via environment variables (or a `.env` file). Vite exposes variables prefixed with `VITE_` to the client.

| Variable | Required | Description |
|---|---|---|
| `VITE_LOGTO_ENDPOINT` | Yes | Logto OAuth2 endpoint URL |
| `VITE_LOGTO_APP_ID` | Yes | Logto application ID |
| `VITE_DEFAULT_WS` | Yes | WebSocket URL of the game server |
| `VITE_PORT` | No | Dev server port (default: 3001) |

## Architecture

```
h4kmally-client/
├── src/
│   ├── main.tsx                  # Entry point, Logto provider
│   ├── App.tsx                   # Main app: lobby, game canvas, controls
│   ├── App.css                   # Global styles
│   ├── skinFileMap.ts            # Skin name → filename mapping
│   ├── components/
│   │   ├── Lobby.tsx/css         # Lobby UI: name, skin, play button
│   │   ├── HUD.tsx/css           # In-game HUD: leaderboard, score
│   │   ├── Minimap.tsx/css       # Minimap overlay
│   │   ├── Chat.tsx/css          # In-game chat
│   │   ├── Options.tsx/css       # Options/settings panel
│   │   ├── AdminPanel.tsx/css    # Admin panel
│   │   ├── TokenReveal.tsx/css   # Token reward reveal
│   │   └── Callback.tsx          # OAuth2 callback handler
│   ├── game/
│   │   ├── renderer.ts           # Canvas rendering, jelly physics, skins
│   │   ├── state.ts              # Game state management, cell tracking
│   │   ├── settings.ts           # User settings (localStorage)
│   │   └── index.ts              # Game exports
│   └── protocol/
│       ├── connection.ts         # WebSocket connection management
│       ├── opcodes.ts            # SIG 0.0.1 opcode definitions
│       ├── shuffle.ts            # Opcode shuffle table
│       ├── buffer.ts             # Binary buffer utilities
│       └── index.ts              # Protocol exports
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── index.html
├── vite.config.ts
├── tsconfig.json
├── Dockerfile
└── package.json
```

## Controls

| Key | Action |
|---|---|
| Mouse | Move toward cursor |
| Space / Right-click | Split |
| W / Q / Left-click hold | Eject mass |
| A | Double split |
| S | Triple split |
| D | Quad split |
| Enter | Open chat |
| Escape | Toggle options |
| Scroll | Zoom in/out |

## License

MIT
