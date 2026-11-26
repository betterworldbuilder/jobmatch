# Job Scraper for JobsMatchNow

Turn a job link, or a pasted job description, into a **JobsMatchNow job file** (`jobsmatchnow-job/v1`) that imports
straight into the app as a draft.

## WHY

Adding an outside job to JobsMatchNow today means retyping it into a 3-step editor (about 35 fields). The usual
shortcuts are risky:
- **Generic scrapers** fetch any page, including LinkedIn, whose terms forbid it.
- **LLM "convert this job"** answers tend to fill gaps with plausible values (salary, location, employment type)
  that the posting never stated.

Same input, your AWS sample ("Lead AI Engineer"):

| Field | Manual copy into the editor | Generic scraper / LLM fill-in (typical risk) | Job Scraper (measured on the sample) |
|---|---|---|---|
| Title / company | typed by hand | "Lead AI Engineer" / "AWS" | "Lead AI Engineer" / "AWS", marked **Check** |
| Must have (weights) | typed, weights guessed | a flat skill list | Python, TensorFlow, AWS, MLOps (weight 3, from "Solid, recent experience") |
| Nice to have / languages | typed | often mixed together | Kubernetes, CI/CD, Remote collaboration / English, Vietnamese |
| Employment type, work mode, location | typed (or guessed) | often filled with a guess | **Not provided** (the text doesn't say) |
| Salary | typed (or guessed) | sometimes invented | **Not provided**, never estimated |
| LinkedIn link | copied | page fetched | not fetched; paste fallback, link kept as the source |

The Job Scraper column comes from `test/fixtures/aws-lead-ai.txt` (see the tests). The middle column describes the
typical risk, not a measurement.

## WHAT

A small local web app + CLI (no dependencies, Node 18+):
- **Read a job link.** One public page per request, only if robots.txt allows it. It uses the page's schema.org
  `JobPosting` data when present, otherwise the page text.
- **Paste a job description:** for LinkedIn, Indeed, Glassdoor, or any page that needs a sign-in.
- **Posts that list several roles** (e.g. "1. QA Manager (8+ yoe) - Negotiable - Must based in HCMC", "2. …") become
  one job per role. Each keeps its title, its own location ("Must based in HCMC" → Ho Chi Minh City, Vietnam),
  the skills in brackets, "Negotiable", and seniority from the title or the years (marked **Check**). Each also gets
  the post's shared lines: location, language and how to apply. Styled Unicode from social posts (𝐇𝐈𝐑𝐈𝐍𝐆) is
  read as plain text. **Save all N roles** saves them; with a list open, they are added to that list and its CSV.
  Saving the same role again updates it, never a copy.
- **Work through a list of links.** Paste many links at once, under group headings such as `ai`, `sw eng`,
  `cloud` and `data`. Each heading is the group for the links below it (AI & Machine Learning, Software
  Engineering, Cloud & DevOps, Data), and repeated links are removed. You get a queue with a status per link:
  - **Read all links** reads the public pages, one every 1.5 s.
  - LinkedIn and similar links show **Paste text**; the link and its group are kept.
  - After each save, **Next link →** opens the next one.
  - The list survives a reload, and **Download this list** exports only its saved jobs.
- **Review and edit** in a form laid out like the JobsMatchNow editor:
  - Basics: title, company, department, openings, urgency, deadline, employment type, work mode, contract
    duration, start date, location, max distance, work visa.
  - Role details & skills: seniority, the full JD, summary, must-haves with weights 1–3, nice to haves, languages,
    responsibilities.
  - Compensation: salary range and period, negotiable, bonus, equity, benefits, working hours, flexibility,
    probation, travel, office days, visa sponsorship, relocation, on-call, external URL.
  - Job groups: suggested, never ticked for you.
- **CSV for JobsMatchNow import:** exactly the importer's columns,
  `id,title,location,employment_type,work_mode,salary,url,description`. Details:
  - The `id` is stable (e.g. `li-4488121470`), so re-uploading adds nothing twice.
  - The description is the full job description, with the company on its first line.
  - Each file holds at most 50 roles; larger sets are split into parts.
  - There is no BOM, so the importer sees the `id` column.
  - Only roles with a description are included.
  - Upload it in JobsMatchNow under **Add New Job Offers → ATS or job feed → Another ATS**. Command line:
    `node bin/jobscraper.mjs --list links.txt --allow-linkedin --jobsmatchnow -o exports/import.csv`, which also
    writes `import-all-fields.csv`.
- **Read public LinkedIn job pages (opt-in, off by default):** a switch in the UI, or `--allow-linkedin`.
  - It reads the signed-out public job page: title, company, location, LinkedIn's criteria list and the full
    description.
  - It reads one page every 3 seconds and retries a refused page once after 10 seconds.
  - It never signs in, never gets past a sign-in wall, bot check or CAPTCHA, and doesn't disguise itself.
  - This goes against LinkedIn's User Agreement and robots.txt, and LinkedIn may block your IP. It is the
    owner's choice.
  - Tested 2026-11-25 on 15 real links: 15 read. One needed the retry.
- **CSV of all job roles:** one row per role, with every field as a column. Skills come out as
  "Python (3); TensorFlow (3)" and lists are separated by "; ". It opens in Excel and Google Sheets.
  - A list's CSV (**Download CSV (N roles)**) includes every link: read or saved roles with their fields, and
    the others with their link, group and status (e.g. `needs-text` for LinkedIn).
  - The library has **Download all (.csv)**.
  - Command line: `node bin/jobscraper.mjs --list links.txt -o roles.csv`.
- **Library + export:** save jobs locally (`data/jobs.json`), then download one file or all as
  `*.jobsmatchnow.json`.

It is **not** a crawler, and it never logs in. It never gets past CAPTCHAs or paywalls, and it never publishes
anything. It reads LinkedIn only when the owner turns that on, and then only signed-out public job pages.

Key terms:
- **Check:** a value read from free text; a person confirms it.
- **Not provided:** the source didn't say; the field stays empty.
- **Source:** the original link, always kept.

## SO WHAT

- **For:** the JobFinder role (team agent Finn) and recruiters who want their posting in JobsMatchNow fast.
  *(Target users: draft.)*
- **Value:** a filled draft in seconds instead of retyping about 35 fields, with no invented salary or location
  and with the link kept for trust. *(Time saving: not measured yet.)*
- **Safe by design:** it follows LinkedIn's terms and robots.txt, can't be pointed at private networks, and the
  human stays in control.

## HOW

```
public/ (UI)  ──►  server.mjs (API, port 8920)  ──►  lib/fetch.mjs  (safety + JSON-LD / page text)
                                                 └►  lib/parse.mjs  (text → jobsmatchnow-job/v1, evidence only)
                                                 └►  lib/store.mjs  (library + export file)
bin/jobscraper.mjs (CLI) uses the same lib/
```

- **Fetching rules (`lib/fetch.mjs`):**
  - Blocked sites: LinkedIn, Indeed, Glassdoor.
  - robots.txt is read first and cached for 10 minutes.
  - http(s) on ports 80/443 only, no credentials in links.
  - Every hop (up to 3 redirects) is re-checked, and the TCP socket is pinned to a DNS answer checked as public
    (no localhost, private, link-local or cloud-metadata addresses).
  - 10 s timeout, 3 MB cap, HTML/JSON only.
- **Parsing rules (`lib/parse.mjs`):**
  - Headings ("What you will do", "What we are looking for", "Nice to have", "Benefits"…) become sections.
  - "Experience with X and Y" becomes skills; "Solid/strong…" sets weight 3.
  - Language bullets become languages.
  - Salary is read only from a written range with a currency.
  - Work mode is read only from phrases about the job, so "Remote collaboration" doesn't count.
- **API:**
  - `POST /api/scrape {url}`, `POST /api/parse {text,url?}`
  - `GET|POST /api/jobs`, `DELETE /api/jobs/:id`
  - `GET /api/export[?id=|?ids=a,b][&download=1]`, `GET /api/export.csv[?list=<id>|?ids=a,b]`
  - Lists: `POST /api/batches {text}`, `GET /api/batches[/:id]`, `POST /api/batches/:id/items/:item/read`,
    `PATCH /api/batches/:id/items/:item {status, jobId}`, `DELETE /api/batches/:id` (stored in `data/batches.json`)
- **Standalone:** this repo needs nothing else (no dependencies, no other project, no account). Its only output is
  the `jobsmatchnow-job/v1` file: a plain JSON contract any app or agent can read.
- **Send to JobsMatchNow (optional, sidebar):** sign in with the JobFinder account. Saved jobs go to
  **JobFinder listings as drafts** through JobsMatchNow's own API (`/api/auth/login`, `/api/jobfinder/jobs`).
  - With a list open, its saved jobs are sent; otherwise, library jobs not sent yet.
  - Jobs whose source link is already listed are skipped, and jobs without a company are refused.
  - The password goes only to JobsMatchNow; the session is kept in memory only. Nothing is published: you
    review and publish in the app.
  - The address is configurable (`JOBSMATCHNOW_URL`, default https://jobsmatchnow.com), and no code is shared
    with the app.
- **Using the file (optional, outside this repo):** any app that accepts a JSON job feed can read it. It has
  `jobs[]`, each with `title`, `description`, `location` and `url`, plus the full set of editor fields. An agent
  can drive the CLI (`node bin/jobscraper.mjs …`) the same way.
- **Limitations:**
  - Pages that build the job with JavaScript only, with no JSON-LD, give little text: use paste.
  - The heuristics read English JDs best.
  - The library is a local JSON file, for one user.
- **How it was built:** a deliberately small proof of concept, with zero dependencies and node:test tests (unit,
  fetch with a fake network, API). A smoke script hits the real network only on example.com, and a puppeteer run
  covered both UIs.
- **Scale-up plan (draft):** add a job queue and a per-site rate limit for batches, and permitted provider APIs
  (Greenhouse / Lever public boards) after a terms check. A shared library in the JobsMatchNow DB could replace the
  local file.

## WHAT NOW

Requirements: Node 18+ (Linux / WSL / macOS).

```bash
cd ~/jobscraper            # or: git clone <repo> jobscraper && cd jobscraper
./start.sh                 # → http://localhost:8920   (./start.sh stop | status | test | fg)
./scripts/smoke.sh         # 8 live checks against the running server
node bin/jobscraper.mjs test/fixtures/aws-lead-ai.txt -o /tmp/aws.jobsmatchnow.json   # CLI
```

First things to try:
1. Paste `https://www.linkedin.com/jobs/view/4460964488/` and click **Read job from link**. You get the paste
   fallback with the link kept.
2. Paste the AWS sample text and click **Parse job text**. Look at the **Check** and **Not provided** tags.
3. Save it, then **Download .json**.
4. Open **List of links**, paste your list (with `ai` / `sw eng` / `cloud` / `data` headings) and click **Create
   list**. Then work through it with **Paste text** → **Parse job text** → **Save to library** → **Next link →**.

**Ask for investors:** *[PLACEHOLDER: no amount or terms given.]*

## WHAT NEXT

- **Now:** a single link, pasted text, or a grouped list of links → reviewed jobs → one export file.
- **Next:** more languages for JD headings; paste several descriptions at once and match them to the list's links.
- **Later:** permitted provider integrations (switched off until approved), and duplicate checks against
  JobsMatchNow before export.

**Build it with us:** *[PLACEHOLDER: roles needed (e.g. Node/React engineer, recruiting-ops partner) and contact
links to be added by the founder.]*
