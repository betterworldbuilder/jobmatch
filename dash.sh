#!/usr/bin/env bash
# JobsMatchNow local launcher — run the current branch to check new work by hand.
#
#   ./dash.sh          dev mode: API :3001 + Vite web http://localhost:3005 (hot reload)
#   ./dash.sh pwa      production build served by the API on http://localhost:3001 (test "Install app")
#   ./dash.sh test     tests + typecheck + build, no servers
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

banner() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

open_browser() {
  # Works from WSL (Windows browser) and plain Linux
  if command -v wslview >/dev/null 2>&1; then wslview "$1" >/dev/null 2>&1 &
  elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$1" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  else echo "open manually: $1"; fi
}

wait_for_api() {
  for _ in $(seq 1 30); do
    curl -s -o /dev/null -m 2 http://localhost:3001/api/health && return 0
    sleep 1
  done
  echo "  ⚠ API did not answer on :3001 within 30s"
  return 1
}

[ -d node_modules ] || { banner "installing dependencies"; npm install; }

branch=$(git branch --show-current 2>/dev/null || echo "?")
banner "branch: $branch ($(git log --oneline -1 2>/dev/null))"
if [ -n "$(git status --porcelain -- src server public 2>/dev/null)" ]; then
  echo "  note: uncommitted changes in src/ server/ public/ are included"
fi

cat <<'CHECKS'

  What to try:
    • sign in as the demo recruiter → My Job Offers → "Post a real role"
    • sign in as the demo candidate → the new role is in the deck
    • swipe / match / message → funnel events (admin: GET /api/admin/analytics/events)
CHECKS

mode="${1:-dev}"
case "$mode" in
  dev)
    # pinned ports: 3001 (API) + 3005 (web, strict) — avoids the Windows portproxy that squats on 3000
    banner "dev — API :3001 + web http://localhost:3005 (Ctrl+C stops both)"
    trap 'kill 0 2>/dev/null' INT TERM EXIT
    PORT=3001 node server/index.js &
    wait_for_api && open_browser "http://localhost:3005"
    node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3005 --strictPort
    ;;

  pwa)
    banner "building production bundle (base /)"
    npm run build || exit 1
    banner "pwa — http://localhost:3001 (DevTools → Application → Manifest / Service workers; Ctrl+C stops)"
    trap 'kill 0 2>/dev/null' INT TERM EXIT
    NODE_ENV=production PORT=3001 node server/index.js &
    wait_for_api && open_browser "http://localhost:3001"
    wait
    ;;

  test)
    banner "tests";     npm test      || exit 1
    banner "typecheck"; npm run lint  || exit 1
    banner "build";     npm run build || exit 1
    banner "all green"
    ;;

  *)
    echo "usage: $0 [dev|pwa|test]"; exit 2 ;;
esac
