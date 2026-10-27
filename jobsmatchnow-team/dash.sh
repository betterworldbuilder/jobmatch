#!/usr/bin/env bash
# JobsMatchNow agent-team dashboard — agents, outbox drafts + review verdicts, docs, metrics, plans.
#
#   ./dash.sh                  start on http://localhost:4321 and open the browser
#   DASH_PORT=5000 ./dash.sh   use another port
# The personal job search is a separate app with its own repo and launcher: ~/jobcoach/start.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
PORT="${DASH_PORT:-4321}"

command -v node >/dev/null 2>&1 || { echo "node is required"; exit 1; }

open_browser() {
  # Works from WSL (Windows browser) and plain Linux
  if command -v wslview >/dev/null 2>&1; then wslview "$1" >/dev/null 2>&1 &
  elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$1" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  else echo "open manually: $1"; fi
}

# Stop copies left running from an earlier start, so the ports are free.
pkill -f 'node dash/server.mjs' 2>/dev/null
sleep 0.3

printf '\n\033[1;36m== JobsMatchNow agent team — http://localhost:%s (Ctrl+C stops) ==\033[0m\n' "$PORT"
(sleep 1; open_browser "http://localhost:$PORT") &

DASH_PORT="$PORT" node dash/server.mjs
