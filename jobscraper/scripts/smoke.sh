#!/usr/bin/env bash
# Smoke test against a running Job Scraper (./start.sh first). Uses no real job site except example.com
# (a reserved demo domain) to check the real network path: robots.txt, HTTPS and the address check.
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:${PORT:-8920}}"
pass=0; fail=0
ok() { echo "PASS  $1"; pass=$((pass+1)); }
ko() { echo "FAIL  $1"; echo "      $2"; fail=$((fail+1)); }
post() { curl -s -X POST -H 'content-type: application/json' --data-binary "$2" "$BASE$1"; }

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/"); [ "$code" = 200 ] && ok "UI answers 200" || ko "UI answers 200" "got $code"

r=$(post /api/scrape '{"url":"https://www.linkedin.com/jobs/view/4460964488/"}')
echo "$r" | grep -q '"code":"blocked"' && echo "$r" | grep -q 'linkedin.com/jobs/view/4460964488' && ok "LinkedIn link: not fetched, paste fallback, link kept" || ko "LinkedIn fallback" "$r"

r=$(post /api/scrape '{"url":"http://169.254.169.254/latest/meta-data/"}')
echo "$r" | grep -q '"code":"unsafe"' && ok "Cloud metadata address refused" || ko "unsafe URL refused" "$r"

r=$(post /api/scrape '{"url":"https://example.com/"}')
echo "$r" | grep -q '"ok":false' && echo "$r" | grep -Eq '"code":"(empty|fetch)"' && ok "Real HTTPS fetch path works (example.com has no job → paste fallback)" || ko "real fetch path" "$r"

body=$(node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({text:fs.readFileSync("test/fixtures/aws-lead-ai.txt","utf8"),url:"https://www.linkedin.com/jobs/view/4460964488/"}))')
r=$(post /api/parse "$body")
echo "$r" | grep -q '"title":"Lead AI Engineer"' && echo "$r" | grep -q '"company":"AWS"' && echo "$r" | grep -q '"requiredLanguages":\["English","Vietnamese"\]' && ok "Pasted AWS sample parsed into the job format" || ko "parse" "$r"

job=$(echo "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify({job:JSON.parse(s).job})))')
r=$(post /api/jobs "$job"); id=$(echo "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).job?.id||""))')
[ -n "$id" ] && ok "Saved to the library ($id)" || ko "save" "$r"
curl -s "$BASE/api/export?id=$id" | grep -q '"format": "jobsmatchnow-job/v1"' && ok "Export file is jobsmatchnow-job/v1" || ko "export" "bad export"
curl -s -X DELETE "$BASE/api/jobs/$id" >/dev/null && ok "Deleted the smoke-test job"

echo "---- $pass passed, $fail failed"
[ "$fail" = 0 ]
