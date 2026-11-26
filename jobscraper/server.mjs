// Job Scraper web server (zero dependencies). Serves the UI in public/ and a small JSON API:
//   POST /api/scrape {url}        → read one public job page (safely) → { ok, job } or { ok:false, message, url }
//   POST /api/parse  {text, url?} → pasted job text → { job }
//   GET/POST /api/jobs, DELETE /api/jobs/:id → local library (data/jobs.json)
//   GET /api/export[?id=|?ids=a,b] → jobsmatchnow-job/v1 file to import into JobsMatchNow
//   POST /api/batches {text}      → list of links (group headings + URLs) → queue; GET/DELETE /api/batches/:id
//   POST /api/batches/:id/items/:item/read → read one link of the list; PATCH …/items/:item {status, jobId}
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePosted } from './lib/parse.mjs';
import { scrapeUrl, validateUrl } from './lib/fetch.mjs';
import { deleteJob, exportFile, listJobs, saveJob } from './lib/store.mjs';
import { addItem, createBatch, deleteBatch, getBatch, jobKey, listBatches, setLinkedInReadable, updateItem } from './lib/batch.mjs';
import { getSettings, saveSettings } from './lib/settings.mjs';
import { discoverJobs } from './lib/discover.mjs';
import { JOB_TYPES, filterWords, titleFilter } from './lib/keywords.mjs';
import { importReady, importToJobFinder, jmnBase } from './lib/jmn-import.mjs';
import { mailboxStatus, startRun } from './lib/mailbox.mjs';
import { addDefaultSources, addSource, deleteSource, getSource, listSources, recordCheck, setEnabled, updateSource } from './lib/sources.mjs';
import { listRows, rowOf, toCsv, toImportCsv } from './lib/csv.mjs';
import { sendJobs as jmnSend, signIn as jmnSignIn, signOut as jmnSignOut, status as jmnStatus } from './lib/jobsmatchnow.mjs';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
async function readBody(req, max = 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
const hits = [];
const limited = () => { const now = Date.now(); while (hits.length && now - hits[0] > 60000) hits.shift(); if (hits.length >= 30) return true; hits.push(now); return false; };

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      const p = url.pathname;
      // Only this page may change things (2026-11-26): a write sent by another website (its Origin is not this
      // server's own address) is refused. JobsMatchNow only shows this page in a frame; it never calls the API.
      if (p.startsWith('/api/') && req.method !== 'GET' && req.headers.origin) {
        let same = false; try { same = new URL(req.headers.origin).host === req.headers.host; } catch { /* bad origin */ }
        if (!same) return send(res, 403, { error: 'Requests from other websites are not accepted' });
      }
      if (p === '/api/scrape' && req.method === 'POST') {
        if (limited()) return send(res, 429, { error: 'Too many requests: wait a minute.' });
        const { url: link } = await readBody(req);
        return send(res, 200, await scrapeUrl(link));
      }
      if (p === '/api/parse' && req.method === 'POST') {
        const { text, url: link } = await readBody(req);
        if (typeof text !== 'string' || text.trim().length < 40) return send(res, 400, { error: 'Paste the full job description (at least a few lines).' });
        let source = null;
        if (link) { try { source = validateUrl(link).href; } catch (e) { return send(res, 400, { error: e.message }); } }
        // A post listing several roles gives one job per role (`jobs`); `job` stays the first for older clients.
        const jobs = parsePosted({ text: text.slice(0, 50000), url: source, sourceName: source ? new URL(source).hostname.replace(/^www\./, '').replace(/^linkedin\.com$/, 'LinkedIn') : null, method: 'pasted text' });
        return send(res, 200, { job: jobs[0], jobs });
      }
      if (p === '/api/jobs' && req.method === 'GET') return send(res, 200, { jobs: listJobs() });
      if (p === '/api/jobs' && req.method === 'POST') {
        const { job } = await readBody(req, 2 * 1024 * 1024);
        if (!job || typeof job !== 'object' || !String(job.title || '').trim()) return send(res, 400, { error: 'A job needs a title before it is saved.' });
        return send(res, 201, { job: saveJob(job) });
      }
      const del = p.match(/^\/api\/jobs\/([\w-]{1,40})$/);
      if (del && req.method === 'DELETE') { deleteJob(del[1]); return send(res, 200, { ok: true }); }
      // Owner settings: "Read public LinkedIn job pages" (off by default).
      if (p === '/api/settings' && req.method === 'GET') return send(res, 200, getSettings());
      if (p === '/api/settings' && req.method === 'POST') {
        const b = await readBody(req);
        const s = saveSettings({ ...(b.allowLinkedIn !== undefined ? { allowLinkedIn: b.allowLinkedIn === true } : {}), ...(b.jobTypes !== undefined ? { jobTypes: b.jobTypes } : {}) });
        if (b.allowLinkedIn !== undefined) setLinkedInReadable(s.allowLinkedIn);
        return send(res, 200, s);
      }
      // Job-type filter: the defined types, and a test of titles (used by the LinkedIn-alert run before scraping).
      if (p === '/api/job-types' && req.method === 'GET') return send(res, 200, { types: Object.entries(JOB_TYPES).map(([id, t]) => ({ id, label: t.label, words: t.words })), current: getSettings().jobTypes });
      if (p === '/api/filter' && req.method === 'POST') {
        const { titles } = await readBody(req);
        if (!Array.isArray(titles) || titles.length > 5000) return send(res, 400, { error: 'Send { titles: [...] } (at most 5000)' });
        const test = titleFilter(getSettings().jobTypes);
        return send(res, 200, { keep: titles.map((t) => test(String(t || ''))) });
      }
      // Career sites (2026-11-26): saved careers websites; a check finds the jobs listed there (new ones flagged).
      //   GET/POST /api/sources, PATCH/DELETE /api/sources/:id, POST /api/sources/:id/check {list?: true}
      //   POST /api/discover {url, keywords?, maxPages?} → preview without saving.
      if (p === '/api/sources' && req.method === 'GET') return send(res, 200, { sources: listSources() });
      if (p === '/api/sources' && req.method === 'POST') return send(res, 201, { source: addSource(await readBody(req)) });
      if (p === '/api/sources/defaults' && req.method === 'POST') return send(res, 200, { added: addDefaultSources(), sources: listSources() });
      if (p === '/api/sources/enabled' && req.method === 'POST') { const b = await readBody(req); return send(res, 200, { sources: setEnabled({ ids: Array.isArray(b.ids) ? b.ids : [], all: b.all === true, enabled: b.enabled === true }) }); }
      const sm = p.match(/^\/api\/sources\/(src-[\w-]{1,20})(\/check)?$/);
      if (sm && !sm[2] && req.method === 'PATCH') return send(res, 200, { source: updateSource(sm[1], await readBody(req)) });
      if (sm && !sm[2] && req.method === 'DELETE') { deleteSource(sm[1]); return send(res, 200, { ok: true }); }
      if (sm && sm[2] && req.method === 'POST') {
        const s = getSource(sm[1]);
        if (!s) return send(res, 404, { error: 'Website not found' });
        if (limited()) return send(res, 429, { error: 'Too many requests: wait a minute.' });
        const b = await readBody(req);
        // The site's own keywords win; otherwise the global job-type filter (Settings → job types).
        const words = s.keywords || filterWords(getSettings().jobTypes).join(',');
        const out = recordCheck(s.id, await discoverJobs(s.url, { keywords: words, maxPages: s.maxPages }));
        for (const j of out.jobs) if (j.job && s.groupId) j.job.jobGroups = [s.groupId];
        // list: true → the NEW jobs become a "List of links" (under the site's group), ready for "Read all links".
        if (b.list && out.ok) {
          const fresh = out.jobs.filter((j) => j.isNew);
          if (fresh.length) out.batch = createBatch(`${s.group || 'jobs'}\n${fresh.map((j) => j.url).join('\n')}`, `${s.name} · ${new Date().toLocaleDateString('en-GB')}`, { allowLinkedIn: false, region: s.region || '' });
        }
        return send(res, 200, out);
      }
      if (p === '/api/discover' && req.method === 'POST') {
        if (limited()) return send(res, 429, { error: 'Too many requests: wait a minute.' });
        const b = await readBody(req);
        return send(res, 200, await discoverJobs(b.url, { keywords: b.keywords ?? filterWords(getSettings().jobTypes).join(','), maxPages: Math.min(5, Number(b.maxPages) || 2) }));
      }
      // Lists of links (group headings + URLs).
      if (p === '/api/batches' && req.method === 'GET') return send(res, 200, { batches: listBatches() });
      if (p === '/api/batches' && req.method === 'POST') {
        const { text, name, region } = await readBody(req);
        if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'Paste a list of job links' });
        return send(res, 201, { batch: createBatch(text.slice(0, 100000), name, { allowLinkedIn: getSettings().allowLinkedIn, region: typeof region === 'string' ? region : '' }) });
      }
      const bm = p.match(/^\/api\/batches\/(list-[\w-]{1,20})$/);
      if (bm && req.method === 'GET') { const b = getBatch(bm[1]); return b ? send(res, 200, { batch: b }) : send(res, 404, { error: 'List not found' }); }
      if (bm && req.method === 'DELETE') { deleteBatch(bm[1]); return send(res, 200, { ok: true }); }
      const im = p.match(/^\/api\/batches\/(list-[\w-]{1,20})\/items\/(i\d{1,4})(\/read)?$/);
      if (im && req.method === 'POST' && im[3]) {
        // Read one link of the list (same rules as a single link; LinkedIn & co. are never fetched).
        const b = getBatch(im[1]); const it = b?.items.find((x) => x.id === im[2]);
        if (!it) return send(res, 404, { error: 'List item not found' });
        if (it.site && !(it.site === 'LinkedIn' && getSettings().allowLinkedIn)) return send(res, 200, { ok: false, item: it, message: it.message });
        if (limited()) return send(res, 429, { error: 'Too many requests: wait a minute.' });
        let r = await scrapeUrl(it.url);
        // A refusal is often momentary (LinkedIn's 999 / rate limit): one retry after a pause, never more.
        if (!r.ok && ['restricted', 'fetch'].includes(r.code)) { await new Promise((ok) => setTimeout(ok, Number(process.env.JOBSCRAPER_RETRY_MS ?? 10000))); r = await scrapeUrl(it.url); }
        if (r.ok) {
          const ids = it.groups.map((g) => g.id).filter(Boolean);
          r.job.jobGroups = [...new Set(ids)];
          const item = updateItem(b.id, it.id, { status: 'ready', message: null });
          return send(res, 200, { ok: true, job: r.job, item });
        }
        const item = updateItem(b.id, it.id, { status: ['blocked', 'robots', 'restricted', 'empty', 'type'].includes(r.code) ? 'needs-text' : 'failed', message: r.message });
        return send(res, 200, { ok: false, item, message: r.message });
      }
      // Add a saved job (e.g. pasted text) to a list, so the list's CSV includes it.
      const add = p.match(/^\/api\/batches\/(list-[\w-]{1,20})\/items$/);
      if (add && req.method === 'POST') {
        const { jobId } = await readBody(req);
        const job = listJobs().find((j) => j.id === jobId);
        if (!job) return send(res, 404, { error: 'Save the job first' });
        return send(res, 201, { item: addItem(add[1], job) });
      }
      if (im && req.method === 'PATCH' && !im[3]) return send(res, 200, { item: updateItem(im[1], im[2], await readBody(req)) });
      // JobsMatchNow import CSV: GET /api/import.csv[?list=<id>|?ids=a,b][&part=N] (≤ 50 roles per file) and
      // GET /api/import.json[?list=…] → { parts, included, skipped } so the UI can show one link per part.
      if ((p === '/api/import.csv' || p === '/api/import.json') && req.method === 'GET') {
        const listId = url.searchParams.get('list');
        const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
        const all = listJobs();
        let jobs; let base = 'jobsmatchnow-import';
        if (listId) {
          const b = getBatch(listId);
          if (!b) return send(res, 404, { error: 'List not found' });
          jobs = b.items.map((it) => all.find((j) => j.id === it.jobId)).filter(Boolean);
          base = `jobsmatchnow-import-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          const missing = b.items.filter((it) => !it.jobId).map((it) => ({ title: '', url: it.url, reason: 'not read or saved yet' }));
          const out = toImportCsv(jobs); out.skipped.unshift(...missing);
          if (p === '/api/import.json') return send(res, 200, { parts: out.parts.length, included: out.included, skipped: out.skipped, base });
          const n = Math.max(1, Number(url.searchParams.get('part') || 1));
          if (!out.parts[n - 1]) return send(res, 404, { error: 'Nothing to import yet: read or paste at least one job of this list' });
          return send(res, 200, out.parts[n - 1], 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${base}${out.parts.length > 1 ? `-part${n}` : ''}.csv"` });
        }
        jobs = all.filter((j) => !ids.length || ids.includes(j.id));
        const out = toImportCsv(jobs);
        if (p === '/api/import.json') return send(res, 200, { parts: out.parts.length, included: out.included, skipped: out.skipped, base });
        const n = Math.max(1, Number(url.searchParams.get('part') || 1));
        if (!out.parts[n - 1]) return send(res, 404, { error: 'No saved roles with a job description yet' });
        return send(res, 200, out.parts[n - 1], 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${base}${out.parts.length > 1 ? `-part${n}` : ''}.csv"` });
      }
      // CSV: GET /api/export.csv[?list=<id>|?ids=a,b]  → one row per job role (a list gives every link, read or not).
      if (p === '/api/export.csv' && req.method === 'GET') {
        const listId = url.searchParams.get('list');
        const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
        const jobs = listJobs();
        let rows; let name;
        if (listId) {
          const b = getBatch(listId);
          if (!b) return send(res, 404, { error: 'List not found' });
          rows = listRows(b, jobs); name = `${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'list'}.csv`;
        } else {
          rows = jobs.filter((j) => !ids.length || ids.includes(j.id)).map((j) => rowOf(j)); name = 'job-roles.csv';
        }
        return send(res, 200, toCsv(rows), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${name}"` });
      }
      if (p === '/api/export' && req.method === 'GET') {
        const id = url.searchParams.get('id');
        const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
        const jobs = listJobs().filter((j) => (!id || j.id === id) && (!ids.length || ids.includes(j.id)));
        const name = id && jobs[0] ? `${String(jobs[0].title || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.jobsmatchnow.json` : 'jobs.jobsmatchnow.json';
        return send(res, 200, JSON.stringify(exportFile(jobs), null, 2), 'application/json; charset=utf-8', url.searchParams.get('download') ? { 'Content-Disposition': `attachment; filename="${name}"` } : {});
      }
      // Mailbox import (2026-11-26): the team's Gmail "linkjobs" pipeline (read-only), run from this page.
      if (p === '/api/mailbox' && req.method === 'GET') return send(res, 200, mailboxStatus());
      if (p === '/api/mailbox/run' && req.method === 'POST') { const { step } = await readBody(req); return send(res, 202, { run: startRun(String(step || '')) }); }
      // "Import to JobFinder account" (2026-11-26): one list item → read it if needed → save → JobFinder draft.
      if (p === '/api/jmn/import-status' && req.method === 'GET') return send(res, 200, { ready: importReady(), base: jmnBase() });
      // Library "Send all to JobFinder" (2026-11-26): one saved job → JobFinder account (import key), remembered as sent.
      if (p === '/api/jmn/import-job' && req.method === 'POST') {
        const { id } = await readBody(req);
        const saved = listJobs().find((j) => j.id === id);
        if (!saved) return send(res, 404, { error: 'Job not found in the library' });
        if (saved.sentTo?.remoteId) return send(res, 200, { status: 'duplicate', remoteId: saved.sentTo.remoteId, title: saved.title });
        const out = await importToJobFinder(saved, { workersFrom: saved.workersFrom || '' });
        if (out.status !== 'failed') saveJob({ ...saved, sentTo: { base: jmnBase(), remoteId: out.remoteId, at: new Date().toISOString(), status: out.status } });
        return send(res, 200, { ...out, title: saved.title });
      }
      if (p === '/api/jmn/import-item' && req.method === 'POST') {
        const { list, item } = await readBody(req);
        const b = getBatch(String(list || '')); const it = b?.items.find((x) => x.id === item);
        if (!it) return send(res, 404, { error: 'List item not found' });
        let saved = it.jobId ? listJobs().find((j) => j.id === it.jobId) : null;
        // Same job already in the library (same link, any list): reuse it, so a job sent before is never re-read.
        if (!saved) {
          let key = null; try { key = jobKey(new URL(it.url)); } catch { /* bad link */ }
          saved = key ? listJobs().find((j) => { try { return j.source?.url && jobKey(new URL(j.source.url)) === key; } catch { return false; } }) || null : null;
          if (saved) updateItem(b.id, it.id, { status: 'ready', jobId: saved.id });
        }
        if (!saved) {
          if (it.site && !(it.site === 'LinkedIn' && getSettings().allowLinkedIn)) return send(res, 200, { status: 'failed', message: 'Paste the job text first (this site is not read automatically)' });
          if (limited()) return send(res, 429, { error: 'Too many requests: wait a minute.' });
          let r = await scrapeUrl(it.url);
          if (!r.ok && ['restricted', 'fetch'].includes(r.code)) { await new Promise((ok) => setTimeout(ok, Number(process.env.JOBSCRAPER_RETRY_MS ?? 10000))); r = await scrapeUrl(it.url); }
          if (!r.ok) { updateItem(b.id, it.id, { status: ['blocked', 'robots', 'restricted', 'empty', 'type'].includes(r.code) ? 'needs-text' : 'failed', message: r.message }); return send(res, 200, { status: 'failed', message: r.message }); }
          const ids = it.groups.map((g) => g.id).filter(Boolean);
          if (ids.length) r.job.jobGroups = [...new Set(ids)];
          saved = saveJob(r.job);
          updateItem(b.id, it.id, { status: 'ready', jobId: saved.id });
        }
        if (saved.sentTo?.remoteId) return send(res, 200, { status: 'duplicate', remoteId: saved.sentTo.remoteId, title: saved.title });
        const out = await importToJobFinder(saved, { workersFrom: b.region || '' });
        if (out.status !== 'failed') {
          saveJob({ ...saved, sentTo: { base: jmnBase(), remoteId: out.remoteId, at: new Date().toISOString(), status: out.status } });
          updateItem(b.id, it.id, { status: 'saved', message: null });
        }
        return send(res, 200, { ...out, title: saved.title });
      }
      // Optional: send saved jobs to a JobsMatchNow account as JobFinder listing drafts (password never stored).
      if (p === '/api/jmn/status' && req.method === 'GET') return send(res, 200, jmnStatus());
      if (p === '/api/jmn/login' && req.method === 'POST') { const b = await readBody(req); return send(res, 200, await jmnSignIn(b)); }
      if (p === '/api/jmn/logout' && req.method === 'POST') return send(res, 200, jmnSignOut());
      if (p === '/api/jmn/send' && req.method === 'POST') {
        const { ids } = await readBody(req);
        if (!Array.isArray(ids) || !ids.length || ids.length > 200) return send(res, 400, { error: 'Choose between 1 and 200 saved jobs' });
        const all = listJobs();
        const jobs = ids.map((id) => all.find((j) => j.id === id)).filter(Boolean); // in the order chosen
        const out = await jmnSend(jobs);
        for (const r of out.results) if (r.remoteId && (r.status === 'created' || r.status === 'skipped')) {
          const j = jobs.find((x) => x.id === r.id);
          if (j) saveJob({ ...j, sentTo: { base: out.base, remoteId: r.remoteId, at: new Date().toISOString(), status: r.status } });
        }
        return send(res, 200, out);
      }
      if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      // Static files (no path traversal: resolved path must stay inside public/).
      const file = normalize(join(PUBLIC, p === '/' ? 'index.html' : decodeURIComponent(p)));
      if (!file.startsWith(PUBLIC)) return send(res, 404, 'Not found', 'text/plain');
      // Pages may be framed only by this tool itself and by JobsMatchNow (the "Job Scraper" button, 2026-11-26).
      const frame = extname(file) === '.html' ? { 'Content-Security-Policy': "frame-ancestors 'self' https://jobsmatchnow.com http://localhost:* http://127.0.0.1:*" } : {};
      try { return send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache', ...frame }); }
      catch { return send(res, 404, 'Not found', 'text/plain'); }
    } catch (e) {
      send(res, e.status || 500, { error: e.status ? e.message : 'Unexpected error' });
      if (!e.status) console.error(e);
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT || 8920);
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`Job Scraper running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
