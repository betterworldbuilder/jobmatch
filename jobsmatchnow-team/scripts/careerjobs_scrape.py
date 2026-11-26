#!/usr/bin/env python3
"""Check every careers website saved in the Job Scraper ("Career sites" tab) and scrape the new matching jobs.

Why: jobs from company careers pages, Michael Page, ITviec, TopCV, CareerViet, TopDev, Glints, Greenhouse / Lever /
     Ashby boards and RSS feeds (JobServe), not only LinkedIn alerts.
How: for each site, POST /api/sources/<id>/check (the site's job links, already filtered by the job-type filter),
     then for each job not yet in careerjobs.csv: use the job the site's API already gave, or read its page
     (POST /api/scrape), save it in the library and write the job file. One page every 4 s, CAREER_MAX per run.
Where: data/career-pages/careerjobs.csv + data/career-pages/jobs/cp-<id>.jobsmatchnow.json
       (linkjobs_import.py then imports them into JobsMatchNow as JobFinder drafts).
"""
import csv
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "career-pages")
CSV_PATH = os.path.join(OUT_DIR, "careerjobs.csv")
JOBS_DIR = os.path.join(OUT_DIR, "jobs")
API = os.environ.get("JOBSCRAPER_URL", "http://localhost:8920")
PAUSE = 4
MAX = int(os.environ.get("CAREER_MAX", "80"))
FIELDS = ["found_date", "source", "region", "job_id", "url", "title", "company", "location", "scrape_status", "job_file", "import_status", "app_job_id"]


def call(method, path, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except urllib.error.URLError as e:
        return 0, {"error": str(e.reason)}


def clean(text, n=120):
    return " ".join(str(text or "").replace(",", ";").split())[:n]


def load():
    if not os.path.exists(CSV_PATH):
        return []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save(rows):
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = CSV_PATH + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, CSV_PATH)


def main():
    status, res = call("GET", "/api/sources")
    if status != 200:
        print(f"Job Scraper not reachable at {API} ({status}): start it with ~/jobscraper/start.sh start")
        return 1
    # Only the websites ticked in the Job Scraper's Career sites tab.
    sources = [s for s in res.get("sources", []) if s.get("enabled", True)]
    rows = load()
    known = {r["job_id"] for r in rows}
    os.makedirs(JOBS_DIR, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    reads = ok = failed = 0
    per_site = []
    # Share the daily budget: every site gets its turn (at least 3 new jobs each), the rest comes next run.
    site_cap = max(3, MAX // max(1, len(sources)))
    for i, src in enumerate(sources):
        site_new = 0
        if i:
            time.sleep(2.5)
        status, out = call("POST", f"/api/sources/{src['id']}/check", {"list": False})
        if status == 429:
            time.sleep(60)
            status, out = call("POST", f"/api/sources/{src['id']}/check", {"list": False})
        if status != 200 or not out.get("ok"):
            per_site.append(f"{src['name']}: {clean(out.get('message') or out.get('error') or status, 80)}")
            continue
        new = 0
        for j in out.get("jobs", []):
            jid = hashlib.sha1(j["key"].encode()).hexdigest()[:16]
            if jid in known:
                continue
            if reads >= MAX or site_new >= site_cap:
                break
            site_new += 1
            row = {"found_date": today, "source": clean(src["name"], 80), "region": src.get("region", ""), "job_id": jid, "url": j["url"],
                   "title": clean(j.get("title"), 160), "company": "", "location": "", "scrape_status": "", "job_file": "", "import_status": "", "app_job_id": ""}
            job = j.get("job")
            if not job:
                if reads:
                    time.sleep(PAUSE)
                reads += 1
                status, r = call("POST", "/api/scrape", {"url": j["url"]})
                if status == 429:
                    time.sleep(60)
                    status, r = call("POST", "/api/scrape", {"url": j["url"]})
                if status != 200 or not r.get("ok"):
                    row["scrape_status"] = f"failed:{r.get('code') or status}"
                    rows.append(row); known.add(jid); failed += 1; save(rows)
                    continue
                job = r["job"]
            if src.get("region"):
                job["workersFrom"] = src["region"]  # the site's region, a hint for "For who" in JobsMatchNow
            status, saved = call("POST", "/api/jobs", {"job": job})
            if status != 201:
                row["scrape_status"] = f"failed:save: {clean(saved.get('error'), 80)}"
                rows.append(row); known.add(jid); failed += 1; save(rows)
                continue
            status, export = call("GET", f"/api/export?id={saved['job']['id']}")
            path = os.path.join(JOBS_DIR, f"cp-{jid}.jobsmatchnow.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(export, f, ensure_ascii=False, indent=2)
            row.update({"title": clean(job.get("title"), 160), "company": clean(job.get("company"), 120), "location": clean(job.get("location"), 120),
                        "scrape_status": "ok", "job_file": os.path.relpath(path, ROOT)})
            rows.append(row); known.add(jid); ok += 1; new += 1
            save(rows)
        per_site.append(f"{src['name']}: {len(out.get('jobs', []))} matching, {new} new")
        if reads >= MAX:
            per_site.append(f"(stopped at CAREER_MAX={MAX} page reads; the rest next run)")
            break
    print(f"Career sites: {len(sources)} checked; new jobs saved: {ok}; failed: {failed}")
    for line in per_site:
        print("  " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
