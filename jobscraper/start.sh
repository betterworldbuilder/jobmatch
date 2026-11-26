#!/usr/bin/env bash
# Job Scraper: job link → JobsMatchNow job file.
#   ./start.sh          start (background) and print the URL
#   ./start.sh stop     stop it          ./start.sh status   is it running?
#   ./start.sh test     run the tests     ./start.sh fg       run in the foreground
# Env: PORT (default 8920), HOST (default 127.0.0.1; use 0.0.0.0 to open it on your network).
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8920}"
HOST="${HOST:-127.0.0.1}"
PIDFILE=".jobscraper.pid"
LOG="logs/server.log"

need_node() {
  command -v node >/dev/null || { echo "Node.js 18+ is required (https://nodejs.org)"; exit 1; }
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 18 ] || { echo "Node.js 18+ is required (found $(node -v))"; exit 1; }
}
running_pid() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null && cat "$PIDFILE" || true; }
# Is something answering on the port? (Node probe with a timeout; bash /dev/tcp can hang under WSL.)
port_busy() { node -e "const s=require('net').connect($PORT,'127.0.0.1');s.setTimeout(800);s.on('connect',()=>process.exit(0)).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))"; }

case "${1:-start}" in
  start)
    need_node
    pid="$(running_pid)"
    if [ -n "$pid" ]; then echo "Already running (pid $pid): http://localhost:$PORT"; exit 0; fi
    if port_busy; then echo "Port $PORT is in use. Try: PORT=8921 ./start.sh"; exit 1; fi
    mkdir -p logs data
    PORT="$PORT" HOST="$HOST" setsid nohup node server.mjs >>"$LOG" 2>&1 < /dev/null &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 30); do port_busy && break; sleep 0.2; done
    if port_busy; then echo "Job Scraper is running: http://localhost:$PORT  (log: $LOG, stop: ./start.sh stop)"
    else echo "It did not start. Last log lines:"; tail -n 20 "$LOG"; exit 1; fi
    ;;
  fg) need_node; mkdir -p data; PORT="$PORT" HOST="$HOST" exec node server.mjs ;;
  stop)
    pid="$(running_pid)"
    if [ -n "$pid" ]; then kill "$pid" && rm -f "$PIDFILE" && echo "Stopped (pid $pid)"; else rm -f "$PIDFILE"; echo "Not running"; fi
    ;;
  status) pid="$(running_pid)"; if [ -n "$pid" ]; then echo "Running (pid $pid): http://localhost:$PORT"; else echo "Not running"; fi ;;
  test) need_node; node --test test/*.test.mjs ;;
  *) echo "Usage: ./start.sh [start|stop|status|test|fg]"; exit 2 ;;
esac
