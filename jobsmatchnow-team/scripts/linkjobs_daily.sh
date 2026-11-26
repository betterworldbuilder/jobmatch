#!/usr/bin/env bash
# Daily role update (founder, 2026-11-26): every day at 06:00 UTC, started by the Windows Task Scheduler task
# "JobsMatchNow linkjobs daily" (wsl -d UbuntuD -u dzoan -- bash <this file>).
# Gmail "linkjobs" alerts (read-only) -> Scrapy scrape -> import into JobsMatchNow as JobFinder drafts.
# Log: data/inbox-linkedin/logs/YYYY-MM-DD.log (counts only, no passwords or keys). Only one run at a time.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/inbox-linkedin/logs
LOG="data/inbox-linkedin/logs/$(date -u +%Y-%m-%d).log"
exec 9>/tmp/jobsmatchnow-linkjobs.lock
flock -n 9 || { echo "$(date -u +%FT%TZ) another run is still going, skipped" >> "$LOG"; exit 0; }
{
  echo "=== $(date -u +%FT%TZ) daily role update"
  nice -n 10 bash scripts/linkjobs_run.sh
  echo "=== $(date -u +%FT%TZ) done (exit $?)"
} >> "$LOG" 2>&1
# Keep 60 days of logs.
find data/inbox-linkedin/logs -name '*.log' -mtime +60 -delete 2>/dev/null || true
