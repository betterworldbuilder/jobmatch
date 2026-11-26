#!/usr/bin/env python3
"""Send the new linkjobs.csv links to the local Job Scraper, one at a time, and record the result.

Why: turn LinkedIn job alert links into JobsMatchNow job files without retyping.
How: for each row with an empty scrape_status, POST the link to the Job Scraper (http://localhost:8920), save the
job in its library, and write the job file to data/inbox-linkedin/jobs/li-<job_id>.jobsmatchnow.json.
One link every 10 seconds, at most LINKJOBS_MAX (default 30) per run, no LinkedIn login, no cookies.
If LinkedIn blocks or asks for a sign-in, it stops at once; the remaining rows stay empty for a later run.
"""
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "data", "inbox-linkedin", "linkjobs.csv")
JOBS_DIR = os.path.join(ROOT, "data", "inbox-linkedin", "jobs")
API = os.environ.get("JOBSCRAPER_URL", "http://localhost:8920")
PAUSE = 10
MAX = int(os.environ.get("LINKJOBS_MAX", "30"))
# The Job Scraper's codes for "LinkedIn limited us / asked to sign in / not allowed": stop, never retry around it.
STOP_CODES = {"restricted", "blocked"}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}


def save(rows, fields):
    tmp = CSV_PATH + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, CSV_PATH)


def reason(text):
    # The Job Scraper puts the real cause in brackets after its generic "paste the text" line.
    text = str(text or "")
    if "(" in text:
        text = text[text.rfind("(") + 1:].rstrip(".) ")
    return " ".join(str(text or "unknown").replace(",", ";").split())[:120]


def main():
    if not os.path.exists(CSV_PATH):
        print("No linkjobs.csv yet: run linkjobs_fetch.py first")
        return 0
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields, rows = reader.fieldnames, list(reader)
    # Job-type filter (Job Scraper → Career sites → Job types): only titles that match are scraped. Rows skipped
    # earlier are tested again, so ticking a new job type brings them back.
    todo = [r for r in rows if not r["scrape_status"].strip() or r["scrape_status"] == "skipped:job-type"]
    status, res = call("POST", "/api/filter", {"titles": [r.get("title", "") for r in todo]})
    if status == 200 and len(res.get("keep", [])) == len(todo):
        skipped = 0
        for r, keep in zip(todo, res["keep"]):
            r["scrape_status"] = "" if keep else "skipped:job-type"
            skipped += 0 if keep else 1
        todo = [r for r in todo if not r["scrape_status"]]
        save(rows, fields)
        print(f"Job-type filter: {len(todo)} to scrape, {skipped} other job types skipped")
    else:
        todo = [r for r in todo if not r["scrape_status"].strip()]
    os.makedirs(JOBS_DIR, exist_ok=True)

    ok = failed = 0
    stopped = None
    for i, row in enumerate(todo[:MAX]):
        if i:
            time.sleep(PAUSE)
        status, res = call("POST", "/api/scrape", {"url": row["url"]})
        if status == 429:
            stopped = "the Job Scraper's own limit (429)"
            break
        if status != 200 or not res.get("ok"):
            code = res.get("code") or f"http{status}"
            row["scrape_status"] = f"failed:{code}: {reason(res.get('message') or res.get('error'))}"
            failed += 1
            save(rows, fields)
            if code in STOP_CODES:
                stopped = f"LinkedIn refused or asked to sign in ({code})"
                break
            continue
        status, saved = call("POST", "/api/jobs", {"job": res["job"]})
        if status != 201:
            row["scrape_status"] = f"failed:save: {reason(saved.get('error'))}"
            failed += 1
            save(rows, fields)
            continue
        status, export = call("GET", f"/api/export?id={saved['job']['id']}")
        path = os.path.join(JOBS_DIR, f"li-{row['job_id']}.jobsmatchnow.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(export, f, ensure_ascii=False, indent=2)
        row["scrape_status"] = "ok"
        row["job_file"] = os.path.relpath(path, ROOT)
        ok += 1
        save(rows, fields)

    left = sum(1 for r in rows if not r["scrape_status"].strip())  # matching rows not scraped yet
    print(f"Scraped ok: {ok}; failed: {failed}; still to do: {left}" + (f"; stopped: {stopped}" if stopped else ""))
    return 3 if stopped else 0


if __name__ == "__main__":
    sys.exit(main())
