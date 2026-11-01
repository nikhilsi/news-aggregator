#!/bin/bash
# Local Worker for trying the site with real data. Run from anywhere.
#   scripts/dev.sh start   copy production's "feed" into local KV (read-only on
#                          production), then serve the site and API on :8787
#   scripts/dev.sh stop
# The cron does not run locally, so the copied feed stays as it was.
# Logs and the PID file go to worker/.wrangler/dev/ (ignored by git).
# Build the site first: cd ../web && NEXT_PUBLIC_API_URL=/api/v1 npx next build

set -euo pipefail
WORKER="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$WORKER/.wrangler/dev"
PID_FILE="$DIR/dev.pid"
PORT=8787
mkdir -p "$DIR"

stop() {
  if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if ps -p "$pid" >/dev/null 2>&1; then
      echo "Stopping PID $pid"
      kill "$pid" 2>/dev/null || true
      sleep 1
      ps -p "$pid" >/dev/null 2>&1 && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  for pid in $(lsof -ti:"$PORT" 2>/dev/null); do
    echo "Freeing port $PORT (PID $pid)"
    kill "$pid" 2>/dev/null || true
  done
}

start() {
  stop
  set -a
  # shellcheck disable=SC1090
  . "$HOME/.secrets/cloudflare/clearnews.env"
  set +a
  cd "$WORKER"
  local ns
  ns=$(sed -n 's/.*"binding": *"CACHE", *"id": *"\([0-9a-f]*\)".*/\1/p' wrangler.jsonc)
  echo "Copying production's feed into local KV"
  npx wrangler kv key get --namespace-id "$ns" feed --remote > "$DIR/feed.json"
  npx wrangler kv key put --binding CACHE feed --path "$DIR/feed.json" --local >/dev/null
  local log="$DIR/dev_$(date +%Y%m%d_%H%M%S).log"
  nohup npx wrangler dev --port "$PORT" >>"$log" 2>&1 &
  echo $! >"$PID_FILE"
  for _ in $(seq 1 30); do
    if curl -sf "http://localhost:$PORT/health" >/dev/null; then
      echo "Ready on http://localhost:$PORT (log: $log)"
      return 0
    fi
    sleep 1
  done
  echo "Not ready after 30 s; see $log"
  return 1
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: scripts/dev.sh start|stop"; exit 1 ;;
esac
