#!/usr/bin/env python3
"""Import the jobs Scrapy scraped (linkjobs.csv rows with scrape_status=ok) into JobsMatchNow as JobFinder drafts.

Why: no more uploading job files by hand; every scraped LinkedIn alert job reaches the JobFinder manager.
How: for each row with scrape_status "ok", a job_file and an empty import_status, POST the job file to
     <JOBSMATCHNOW_URL>/api/jobfinder/import-batch with the import key, one job per call, 2.5 s apart.
     Writes import_status (created / duplicate / failed: <reason>) and app_job_id back into linkjobs.csv.
Where it lands: JobFinder manager (jobsmatchnow.com/app/ -> JobFinder listings) as DRAFTS. Nothing is published:
     review each draft (skills, salary, work mode) and press Publish.
Key: env JOBFINDER_IMPORT_KEY, else the file ~/.config/jobsmatchnow/import.key (chmod 600). Never commit it.
     LINKJOBS_IMPORT_DRY=1 shows what would be sent without sending.
"""
import csv
import json
import os
import stat
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "data", "inbox-linkedin", "linkjobs.csv")
BASE = os.environ.get("JOBSMATCHNOW_URL", "https://jobsmatchnow.com").rstrip("/")
KEY_FILE = os.path.expanduser("~/.config/jobsmatchnow/import.key")
PAUSE = 2.5
MAX = int(os.environ.get("LINKJOBS_IMPORT_MAX", "50"))
DRY = os.environ.get("LINKJOBS_IMPORT_DRY") == "1"
NEW_FIELDS = ["import_status", "app_job_id"]


def import_key():
    key = os.environ.get("JOBFINDER_IMPORT_KEY", "").strip()
    if key:
        return key
    if os.path.exists(KEY_FILE):
        if os.stat(KEY_FILE).st_mode & (stat.S_IRWXG | stat.S_IRWXO):
            print(f"Warning: {KEY_FILE} is readable by others; run: chmod 600 {KEY_FILE}")
        return open(KEY_FILE, encoding="utf-8").read().strip()
    return ""


def post(key, job, email_date=""):
    data = json.dumps({"jobs": [job], "emailDate": email_date}).encode()
    req = urllib.request.Request(BASE + "/api/jobfinder/import-batch", data=data, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}",
                                          "User-Agent": "jobsmatchnow-linkjobs-import"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except urllib.error.URLError as e:
        return 0, {"error": str(e.reason)}


def save(rows, fields):
    tmp = CSV_PATH + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, CSV_PATH)


def clean(text):
    return " ".join(str(text or "unknown").replace(",", ";").split())[:120]


def main():
    if not os.path.exists(CSV_PATH):
        print("No linkjobs.csv yet: run linkjobs_fetch.py and linkjobs_scrape.py first")
        return 0
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields, rows = list(reader.fieldnames or []), list(reader)
    for k in NEW_FIELDS:
        if k not in fields:
            fields.append(k)
    for r in rows:
        for k in NEW_FIELDS:
            r[k] = r.get(k) or ""
    todo = [r for r in rows if r.get("scrape_status") == "ok" and r.get("job_file") and not r["import_status"].strip()]
    if not todo:
        print("Nothing new to import.")
        return 0
    key = "" if DRY else import_key()
    if not DRY and not key:
        print(f"No import key: set JOBFINDER_IMPORT_KEY or write it to {KEY_FILE} (chmod 600).")
        return 2

    created = duplicate = failed = 0
    for i, row in enumerate(todo[:MAX]):
        path = os.path.join(ROOT, row["job_file"])
        try:
            doc = json.load(open(path, encoding="utf-8"))
            job = doc["jobs"][0] if isinstance(doc, dict) and doc.get("jobs") else doc
        except (OSError, ValueError, KeyError, IndexError) as e:
            row["import_status"] = f"failed: bad job file ({clean(e)})"
            failed += 1
            save(rows, fields)
            continue
        if DRY:
            print(f"would import: {job.get('title')} | {job.get('company')} | {row['url']}")
            continue
        if i:
            time.sleep(PAUSE)
        status, res = post(key, job, row.get("email_date", ""))
        if status in (401, 404):
            print(f"Stopped: the site answered {status} ({res.get('error') or 'import key refused or import switched off'}).")
            return 2
        if status == 429:
            print("Stopped: rate limit (429). The rest will go next run.")
            break
        result = (res.get("results") or [{}])[0] if status == 200 else {}
        s = result.get("status")
        if s in ("created", "duplicate"):
            row["import_status"] = s
            row["app_job_id"] = result.get("id", "")
            created += s == "created"
            duplicate += s == "duplicate"
        else:
            row["import_status"] = f"failed: {clean(result.get('error') or res.get('error') or f'http {status}')}"
            failed += 1
        save(rows, fields)

    if DRY:
        print(f"Dry run: {min(len(todo), MAX)} job(s) would be imported to {BASE}.")
        return 0
    left = sum(1 for r in rows if r.get("scrape_status") == "ok" and r.get("job_file") and not r["import_status"].strip())
    print(f"Imported as drafts: {created}; already listed: {duplicate}; failed: {failed}; still to do: {left}. "
          f"Review and publish in {BASE}/app/ -> JobFinder listings.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
