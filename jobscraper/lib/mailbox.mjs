/**
 * Mailbox import (founder, 2026-11-26): the team's LinkedIn job-alert pipeline, run from the Job Scraper page.
 *   1. Read mailbox  → jobsmatchnow-team/scripts/linkjobs_fetch.py  (Gmail label "linkjobs", READ-ONLY, last 30 days)
 *   2. Scrape jobs   → linkjobs_scrape.py  (job-type filter first; one LinkedIn public page every 10 s)
 *   3. Import        → linkjobs_import.py  (JobFinder account, published, duplicates skipped)
 * The Gmail app password stays in ~/.config/jobsmatchnow/gmail_app_password (never read or shown here).
 * One run at a time; its printed lines (counts only) are kept for the page.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const TEAM_DIR = () => process.env.JOBSMATCHNOW_TEAM_DIR || join(homedir(), 'jobmatch3', 'jobsmatchnow-team');
const CSV = () => join(TEAM_DIR(), 'data', 'inbox-linkedin', 'linkjobs.csv');
const STEPS = { fetch: ['scripts/linkjobs_fetch.py'], scrape: ['scripts/linkjobs_scrape.py'], import: ['scripts/linkjobs_import.py'] };
STEPS.all = [...STEPS.fetch, ...STEPS.scrape, ...STEPS.import];
const LABEL = { 'scripts/linkjobs_fetch.py': 'Read mailbox', 'scripts/linkjobs_scrape.py': 'Scrape jobs', 'scripts/linkjobs_import.py': 'Import to JobFinder' };

let run = null; // { step, startedAt, finishedAt, exit, log: [] }

export function parseCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  const [head, ...rest] = out.filter((r) => r.some((c) => c.trim()));
  return head ? rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()]))) : [];
}

/** What the page shows: set-up state, counts per status, the newest rows, and the current / last run. */
export function mailboxStatus() {
  const team = TEAM_DIR();
  const scripts = existsSync(join(team, 'scripts', 'linkjobs_fetch.py'));
  const password = existsSync(join(homedir(), '.config', 'jobsmatchnow', 'gmail_app_password'));
  let rows = [];
  try { rows = parseCsv(readFileSync(CSV(), 'utf8')); } catch { /* no CSV yet */ }
  const st = (r) => r.scrape_status || '';
  const counts = {
    emailsJobs: rows.length,
    toScrape: rows.filter((r) => !st(r)).length,
    scraped: rows.filter((r) => st(r) === 'ok').length,
    otherTypes: rows.filter((r) => st(r) === 'skipped:job-type').length,
    failed: rows.filter((r) => st(r).startsWith('failed')).length,
    imported: rows.filter((r) => ['created', 'duplicate'].includes(r.import_status || '')).length,
    toImport: rows.filter((r) => st(r) === 'ok' && !(r.import_status || '').trim()).length,
  };
  const newest = rows.slice().sort((a, b) => String(b.email_date).localeCompare(String(a.email_date))).slice(0, 60)
    .map((r) => ({ date: r.email_date, title: r.title, company: r.company, location: r.location, url: r.url, scrape: st(r), imported: r.import_status || '' }));
  return { ready: scripts && password, scripts, password, label: 'linkjobs', counts, latestEmail: newest[0]?.date || null, rows: newest, run };
}

/** Start a step ("fetch" | "scrape" | "import" | "all"). One run at a time. */
export function startRun(step) {
  if (!STEPS[step]) throw Object.assign(new Error('Unknown step'), { status: 400 });
  if (run && !run.finishedAt) throw Object.assign(new Error('A mailbox run is already going'), { status: 409 });
  const s = mailboxStatus();
  if (!s.scripts) throw Object.assign(new Error(`The team scripts were not found in ${TEAM_DIR()}`), { status: 400 });
  if (['fetch', 'all'].includes(step) && !s.password) throw Object.assign(new Error('No Gmail app password on this computer (~/.config/jobsmatchnow/gmail_app_password)'), { status: 400 });
  run = { step, startedAt: new Date().toISOString(), finishedAt: null, exit: null, log: [] };
  const queue = [...STEPS[step]];
  const next = () => {
    const script = queue.shift();
    if (!script) { run.finishedAt = new Date().toISOString(); run.exit = run.exit ?? 0; return; }
    run.log.push(`▶ ${LABEL[script]}`);
    const child = spawn('python3', [script], { cwd: TEAM_DIR(), env: { ...process.env, JOBSCRAPER_URL: `http://127.0.0.1:${process.env.PORT || 8920}` } });
    const take = (b) => { for (const line of String(b).split('\n')) if (line.trim()) run.log.push(line.slice(0, 300)); if (run.log.length > 400) run.log.splice(0, run.log.length - 400); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('close', (code) => {
      // 3 = LinkedIn refused or asked to sign in: stop scraping, but still import what was scraped.
      if (code && !(code === 3 && script.endsWith('linkjobs_scrape.py'))) { run.exit = code; run.log.push(`✖ ${LABEL[script]} stopped (code ${code})`); run.finishedAt = new Date().toISOString(); return; }
      next();
    });
  };
  next();
  return run;
}
