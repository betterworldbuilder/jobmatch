#!/usr/bin/env bash
# Hourly-safe run: read new "linkjobs" Gmail alerts (read-only), scrape only the new links, then import the
# scraped jobs into JobsMatchNow as JobFinder DRAFTS (review + publish in the JobFinder manager).
#   scripts/linkjobs_run.sh        (LINKJOBS_MAX=30 links per run by default, 10 s apart)
# Not scheduled by Scrapy; the founder decides when to schedule it.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/linkjobs_fetch.py
/home/dzoan/jobmatch3/jobscraper/start.sh start
# Exit 3 = LinkedIn refused / asked to sign in: still import what was scraped before it stopped.
python3 scripts/linkjobs_scrape.py || [ $? -eq 3 ]
# Career sites saved in the Job Scraper (Michael Page, ITviec, TopCV, careers pages, job boards, RSS feeds).
python3 scripts/careerjobs_scrape.py || true
python3 scripts/linkjobs_import.py
