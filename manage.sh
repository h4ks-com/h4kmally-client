#!/usr/bin/env bash
# ── h4kmally Client (Vite/React) Management ──
set -euo pipefail
cd "$(dirname "$0")"

# Source .env for VITE_PORT etc.
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

PORT="${VITE_PORT:-${PORT:-5173}}"
NAME="h4kmally-client"
PIDFILE=".dev-server.pid"

usage() {
  echo "Usage: $0 {start|stop|restart|build|status|preview}"
  echo
  echo "  start    Start the Vite dev server in the background"
  echo "  stop     Stop the running dev server"
  echo "  restart  Stop then start"
  echo "  build    Production build (dist/)"
  echo "  status   Check if the dev server is running"
  echo "  preview  Run Vite preview of production build"
  exit 1
}

get_pid() {
  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return
    fi
    rm -f "$PIDFILE"
  fi
  # Fallback: find by port — only match LISTENING sockets (not browsers connected to it)
  lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

do_start() {
  pid=$(get_pid)
  if [[ -n "$pid" ]]; then
    echo "[$NAME] Already running (PID $pid) on port $PORT"
    return 0
  fi
  if [[ ! -d node_modules ]]; then
    echo "[$NAME] Installing dependencies..."
    npm install
  fi
  echo "[$NAME] Starting dev server on port $PORT..."
  nohup npx vite --port "$PORT" > dev-server.log 2>&1 &
  echo $! > "$PIDFILE"
  sleep 2
  pid=$(get_pid)
  if [[ -n "$pid" ]]; then
    echo "[$NAME] Running (PID $pid) → http://localhost:$PORT"
  else
    echo "[$NAME] Failed to start. Check dev-server.log"
    return 1
  fi
}

do_stop() {
  pid=$(get_pid)
  if [[ -z "$pid" ]]; then
    echo "[$NAME] Not running"
    return 0
  fi
  echo "[$NAME] Stopping PID $pid and children..."
  # Kill entire process tree (npx → node → vite)
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  sleep 1
  # Force kill if still alive
  if kill -0 "$pid" 2>/dev/null; then
    pkill -9 -P "$pid" 2>/dev/null || true
    kill -9 "$pid" 2>/dev/null || true
  fi
  # Also kill anything still LISTENING on the port (not browsers)
  local leftover
  leftover=$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)
  if [[ -n "$leftover" ]]; then
    kill -9 "$leftover" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  echo "[$NAME] Stopped"
}

do_build() {
  if [[ ! -d node_modules ]]; then
    echo "[$NAME] Installing dependencies..."
    npm install
  fi
  echo "[$NAME] Building for production..."
  npx vite build
  echo "[$NAME] Build OK → dist/"
}

do_status() {
  pid=$(get_pid)
  if [[ -n "$pid" ]]; then
    echo "[$NAME] Running (PID $pid) on port $PORT"
  else
    echo "[$NAME] Not running"
  fi
}

do_preview() {
  if [[ ! -d dist ]]; then
    echo "[$NAME] No dist/ found, building first..."
    do_build
  fi
  echo "[$NAME] Previewing production build..."
  npx vite preview --port "$PORT"
}

case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; do_start ;;
  build)   do_build ;;
  status)  do_status ;;
  preview) do_preview ;;
  *)       usage ;;
esac
