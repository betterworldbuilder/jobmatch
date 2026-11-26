/**
 * Import a job from a link (founder spec, 2026-11-25).
 *
 * An authorized recruiter or the JobFinder account pastes a job URL, reviews what could be found, corrects it and
 * chooses Save draft or Publish job. Nothing is published, and no employer is called a member, by importing a link.
 *
 * What is retrieved, and how:
 * - The pasted URL itself is NEVER fetched. It is validated and kept as the job's source link.
 * - LinkedIn: recognised, never fetched (JobsMatchNow has no authorized LinkedIn job-read integration; its LinkedIn
 *   app is sign-in only). The user pastes the description or types the details instead.
 * - Optional public job-board APIs (Greenhouse Job Board API, Lever Postings API) are OFF by default. They are used
 *   only when the operator lists them in JOB_LINK_PROVIDERS (e.g. "greenhouse,lever") after checking those providers'
 *   terms. They call a fixed API host, check DNS, refuse redirects, time out and cap the response size.
 * - Pasted text goes through the existing parser (parseJobText), then an evidence filter keeps only values the text
 *   actually states: no default employment type or level, no salary unless a range is written, no email capture.
 */
import crypto from 'node:crypto';
import { ValidationError } from './matching.js';
import { applyJob, heuristicParse, parseJobText } from './jobs.js';
import { findDuplicates, isManager, isJobFinderJob, IMPORT_METHODS } from './jobfinder.js';
import { assignGroups } from './groups.js';
import { assertPublicHost, validateJobUrl } from './url-safety.js';

export { assertPublicHost, isRestrictedIp, validateJobUrl } from './url-safety.js';
export { IMPORT_METHODS } from './jobfinder.js';
export const FALLBACK_MESSAGE = 'We couldn’t import the job details from this link. Paste the job description below or enter the details manually. We’ll keep the original link as the source.';
const FETCH_TIMEOUT_MS = Number(process.env.JOB_LINK_TIMEOUT_MS || 8000);
const MAX_BYTES = 1024 * 1024;

const str = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const enabledProviders = () => String(process.env.JOB_LINK_PROVIDERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

/** What a link is, and whether a permitted method exists to read it. Never fetches anything. */
export function classifySource(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const id = url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{5,})/)?.[1] || url.searchParams.get('currentJobId') || undefined;
    return { sourceName: 'LinkedIn', provider: 'linkedin', sourceJobId: id, retrievable: false, reason: 'JobsMatchNow has no authorized LinkedIn job-data integration, so LinkedIn pages are not read.' };
  }
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(host) && parts.length >= 3 && parts[1] === 'jobs' && SLUG.test(parts[0]) && /^\d{1,20}$/.test(parts[2])) {
    const on = enabledProviders().includes('greenhouse');
    return { sourceName: 'Greenhouse job board', provider: 'greenhouse', board: parts[0], sourceJobId: parts[2], retrievable: on, reason: on ? undefined : 'The Greenhouse Job Board API is supported but not switched on (JOB_LINK_PROVIDERS).' };
  }
  if (host === 'jobs.lever.co' && parts.length >= 2 && SLUG.test(parts[0]) && /^[0-9a-f-]{36}$/i.test(parts[1])) {
    const on = enabledProviders().includes('lever');
    return { sourceName: 'Lever job board', provider: 'lever', site: parts[0], sourceJobId: parts[1], retrievable: on, reason: on ? undefined : 'The Lever Postings API is supported but not switched on (JOB_LINK_PROVIDERS).' };
  }
  return { sourceName: host, provider: 'other', retrievable: false, reason: 'No supported, permitted method to read this site.' };
}

// Test hook: replace the network call (tests never touch a real job board).
let fetcher = null;
export function __setLinkFetcher(fn) { fetcher = fn; }

/** GET a JSON document from a fixed provider API host: DNS check, no redirects, timeout, size cap. */
export async function fetchJson(apiUrl) {
  const url = new URL(apiUrl);
  if (fetcher) return fetcher(url.href);
  await assertPublicHost(url.hostname);
  const res = await fetch(url.href, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json', 'User-Agent': 'JobsMatchNow-job-import/1.0' } });
  if (!res.ok) { const e = new Error(`Provider answered ${res.status}`); e.code = 'PROVIDER_STATUS'; throw e; }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) { const e = new Error('Response too large'); e.code = 'TOO_LARGE'; throw e; }
  const reader = res.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); const e = new Error('Response too large'); e.code = 'TOO_LARGE'; throw e; }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const decodeEntities = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
/** Provider HTML → readable plain text (lists kept as "- " lines). */
export function htmlToText(html) {
  return decodeEntities(decodeEntities(html))
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*li[^>]*>/gi, '\n- ').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|h[1-6]|ul|ol|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').split('\n').map((l) => l.trim()).join('\n').trim();
}
const WORKPLACE = { remote: 'Remote', hybrid: 'Hybrid', 'on-site': 'On-site', onsite: 'On-site' };
const TYPE_FROM = (s) => { const t = String(s || '').toLowerCase(); return /full[- ]?time/.test(t) ? 'Full-time' : /part[- ]?time/.test(t) ? 'Part-time' : /contract/.test(t) ? 'Contract' : /freelance/.test(t) ? 'Freelance' : /intern/.test(t) ? 'Internship' : undefined; };

/** Read a job through an enabled provider API. Returns source fields (only what the provider states). */
export async function retrieveFromProvider(info) {
  if (info.provider === 'greenhouse') {
    const d = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(info.board)}/jobs/${encodeURIComponent(info.sourceJobId)}?pay_transparency=true`);
    const pay = Array.isArray(d.pay_input_ranges) ? d.pay_input_ranges[0] : null;
    const salary = pay && Number(pay.min_cents) > 0 && Number(pay.max_cents) >= Number(pay.min_cents) && pay.currency_type
      ? { min: Math.round(pay.min_cents / 100), max: Math.round(pay.max_cents / 100), currency: String(pay.currency_type).slice(0, 8) } : undefined;
    const description = htmlToText(d.content);
    return { title: str(d.title, 140), company: str(d.company_name, 120), location: str(d.location?.name, 120), salaryRange: salary, description: description || undefined, applyUrl: str(d.absolute_url, 600) };
  }
  if (info.provider === 'lever') {
    const d = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(info.site)}/${encodeURIComponent(info.sourceJobId)}`);
    const lists = (Array.isArray(d.lists) ? d.lists : []).map((l) => `${l.text || ''}\n${htmlToText(l.content)}`).join('\n\n');
    const description = [d.descriptionPlain, lists, d.additionalPlain].filter(Boolean).join('\n\n').trim();
    const s = d.salaryRange;
    const salary = s && Number(s.min) > 0 && Number(s.max) >= Number(s.min) && s.currency ? { min: Math.round(s.min), max: Math.round(s.max), currency: String(s.currency).slice(0, 8), interval: str(s.interval, 40) } : undefined;
    return { title: str(d.text, 140), location: str(d.categories?.location, 120), workMode: WORKPLACE[String(d.workplaceType || '').toLowerCase()], type: TYPE_FROM(d.categories?.commitment), salaryRange: salary, description: description || undefined, applyUrl: str(d.applyUrl || d.hostedUrl, 600) };
  }
  throw new Error('Unsupported provider');
}

// ---------------------------------------------------------------------------
// Suggestions from pasted text (evidence only)
// ---------------------------------------------------------------------------

const has = (text, value) => Boolean(value) && text.toLowerCase().includes(String(value).toLowerCase());
const labelled = (text, re) => text.match(re)?.[1]?.trim().replace(/[.;]$/, '').slice(0, 140) || undefined;
const LEVELS = [['exec', /\b(vp|vice president|head of|director|chief)\b/i], ['lead', /\b(lead|principal|staff)\b/i], ['senior', /\b(senior|sr\.)\b/i], ['junior', /\b(junior|jr\.|entry[- ]level|graduate)\b/i]];

/** Parse a date written after "Apply by / Closing date / Deadline". Only an explicit date is accepted. */
export function deadlineFrom(text) {
  const raw = labelled(text, /\b(?:apply by|closing date|application deadline|deadline|applications close(?:s)?(?: on)?)\s*[:\-–]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2} [A-Za-z]{3,9},? [0-9]{4}|[A-Za-z]{3,9} [0-9]{1,2},? [0-9]{4})/i);
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

/** Suggest fields from pasted text. Every value must be stated in the text; unknown fields stay empty. */
export async function suggestFromText(text, url) {
  const { parser, parsed } = await parseJobText(text, url);
  // First line that is not a section heading ("About the job", "Job description", …).
  const HEADING = /^(about (the )?(job|company|us|role|team)|job description|description|overview|the role|summary)\s*:?$/i;
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l && !HEADING.test(l) && l.length <= 100 && !/[.!?]$/.test(l));
  // "Acme is hiring a Lead AI Engineer." states both the employer and the title.
  const hiring = text.match(/(?:^|[.!?]\s+|\n)([A-Z][\w&'\- ]{0,40}?) is hiring (?:an? |for an? )?([^.\n]{3,80}?)(?:\.|\n|$)/);
  const parsedTitle = has(text, parsed.title) && !HEADING.test(String(parsed.title).trim()) ? str(parsed.title, 140) : undefined;
  const out = {};
  out.title = labelled(text, /^\s*(?:job\s*)?title\s*[:\-–]\s*(.+)$/im) || (hiring ? str(hiring[2], 140) : undefined) || parsedTitle || str(firstLine, 140);
  out.company = labelled(text, /^\s*(?:company|employer|organi[sz]ation)\s*[:\-–]\s*(.+)$/im) || (hiring ? str(hiring[1], 120) : undefined);
  const loc = labelled(text, /^\s*location\s*[:\-–]\s*(.+)$/im) || parsed.location;
  if (has(text, loc)) out.location = str(loc, 120);
  const lower = text.toLowerCase();
  // Only phrases about how THIS job is done: "Remote collaboration" or "hybrid cloud" are not a work mode.
  const said = (w) => new RegExp(`(work mode|workplace|work arrangement|location|job type)\\s*[:\\-–][^\\n]*\\b${w}\\b|^\\s*${w}\\s*[.,]?\\s*$|\\(${w}\\)|\\b${w}\\s+(role|position|job|work|working|model|setup|schedule|policy|team|opportunity)\\b|\\b(fully|100%|work)\\s+${w}\\b|\\b${w}[- ]first\\b|^\\s*${w}\\s*,`, 'im').test(lower);
  const modeHits = [(said('remote') || /\bwork remotely\b/.test(lower)) && 'Remote', said('hybrid') && 'Hybrid', (said('on[- ]?site') || /\bin[- ]office\b/.test(lower)) && 'On-site'].filter(Boolean);
  if (modeHits.includes('Hybrid')) out.workMode = 'Hybrid'; else if (modeHits.length === 1) out.workMode = modeHits[0];
  out.type = TYPE_FROM(lower.match(/\b(full[- ]?time|part[- ]?time|contract(?:or)?|freelance|internship|intern)\b/)?.[0]);
  out.experienceLevel = (LEVELS.find(([, re]) => re.test(text)) || [])[0];
  // Salary: only a range written in the text (the built-in pattern), whatever the AI parser says.
  const written = heuristicParse(text, url).salaryRange;
  if (written) out.salaryRange = written;
  const skills = (parsed.requiredSkillsDetail || []).map((s) => s?.name).filter((n) => typeof n === 'string' && has(text, n));
  if (skills.length) out.skills = [...new Set(skills)].slice(0, 20);
  out.deadline = deadlineFrom(text);
  out.description = text.trim().slice(0, 20000);
  return { parser, fields: Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) };
}

// ---------------------------------------------------------------------------
// Analyze: one response the review screen can show as-is
// ---------------------------------------------------------------------------

export const FIELD_KEYS = ['title', 'company', 'location', 'workMode', 'type', 'salaryRange', 'description', 'skills', 'experienceLevel', 'deadline', 'applyUrl'];

/** Merge source fields (provider) with text fields; mark where each came from and what needs a look. */
export function buildReview({ sourceFields = {}, textFields = {} }) {
  const fields = {};
  for (const key of FIELD_KEYS) {
    const fromSource = sourceFields[key]; const fromText = textFields[key];
    if (fromSource !== undefined && fromSource !== null && fromSource !== '') fields[key] = { value: fromSource, from: 'source', review: false };
    else if (fromText !== undefined && fromText !== null && fromText !== '') fields[key] = { value: fromText, from: 'text', review: key !== 'description' };
    else fields[key] = { value: null, from: null, review: false };
  }
  return fields;
}

/** Possible duplicates the actor may see: JobFinder listings for managers, own jobs for recruiters. */
export function importDuplicates(db, { sourceUrl, company, title, location }, actor) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const same = (j) => (sourceUrl && [j.jobFinder?.sourceUrl, j.sourceUrl, j.externalUrl].includes(sourceUrl))
    || (title && norm(j.title) === norm(title) && norm(j.company) === norm(company) && norm(j.location) === norm(location));
  const view = (j) => ({ id: j.id, title: j.title, company: j.company, location: j.location || '', status: j.jobFinder?.listingStatus || j.status, sourceUrl: j.jobFinder?.sourceUrl || j.sourceUrl || j.externalUrl || '', createdAt: j.createdAt, description: String(j.description || '').slice(0, 300) });
  if (actor.kind === 'jobfinder') {
    const probe = { id: '__probe__', title, company, location, jobFinder: { sourceUrl } };
    const ids = new Set(findDuplicates(db, probe).map((d) => d.id));
    return db.jobs.filter((j) => ids.has(j.id)).map(view);
  }
  return db.jobs.filter((j) => j.employerId === actor.user.id && !isJobFinderJob(j) && !['removed'].includes(j.status) && same(j)).map(view);
}

/**
 * Mount the routes. `ctx`: { store, authSession, audit, limiter, assertRecruiterAccess }.
 */
export function mountJobLinkImport(app, ctx) {
  const { store, authSession, audit, limiter, assertRecruiterAccess } = ctx;

  /** Who may import: the JobFinder account / admins (JobFinder listings) and recruiters (their own jobs). */
  function actorFor(db, req, wanted) {
    const s = authSession(req);
    const user = s && db.users.find((u) => u.id === s.sub);
    if (!s || !user) { const e = new Error('Sign in to import jobs'); e.status = 401; throw e; }
    if (wanted === 'jobfinder') {
      if (!isManager(db, s)) { const e = new Error('Only JobFinder can import JobFinder listings'); e.status = 403; throw e; }
      return { kind: 'jobfinder', user, session: s };
    }
    if (user.role !== 'employer' || user.suspendedAt) { const e = new Error('Only recruiters can import jobs'); e.status = 403; throw e; }
    return { kind: 'recruiter', user, session: s };
  }
  const modeOf = (v) => (v === 'jobfinder' ? 'jobfinder' : 'recruiter');

  app.post('/api/job-link/analyze', limiter, async (req, res, next) => {
    try {
      const db = await store.read();
      const actor = actorFor(db, req, modeOf(req.body?.mode));
      const text = typeof req.body?.text === 'string' ? req.body.text.replace(/\r\n/g, '\n').trim().slice(0, 20000) : '';
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl && !text) throw new ValidationError('url', 'Paste a job link or a job description');
      if (text && text.length < 40) throw new ValidationError('text', 'Paste the full job description (at least a few lines)');

      let url = null; let info = { sourceName: '', provider: 'none', retrievable: false };
      if (rawUrl) { url = validateJobUrl(rawUrl); info = classifySource(url); }

      let sourceFields = {}; let retrieved = false; let notice; let extraction;
      if (url && info.retrievable) {
        try { sourceFields = await retrieveFromProvider(info); retrieved = Boolean(sourceFields.title || sourceFields.description); extraction = `${info.sourceName} public API`; }
        catch { retrieved = false; }
      }
      if (url && !retrieved) notice = FALLBACK_MESSAGE;

      let textFields = {}; let parser;
      if (text) { const r = await suggestFromText(text, url?.href); textFields = r.fields; parser = r.parser; }
      const method = retrieved ? 'imported' : text ? 'pasted' : 'manual';
      if (!extraction) extraction = text ? (parser === 'claude' ? 'Suggested from your pasted text (AI parser)' : 'Suggested from your pasted text (built-in parser)') : 'Nothing extracted';
      const fields = buildReview({ sourceFields, textFields });
      if (!fields.applyUrl.value && url) fields.applyUrl = { value: url.href, from: 'link', review: true };
      const sourceUrl = url?.href || null;
      res.json({
        mode: actor.kind, sourceUrl, sourceName: info.sourceName || null, sourceJobId: info.sourceJobId || null, provider: info.provider,
        retrieved, method, extraction, notice: notice || null, reason: info.reason || null, importedAt: new Date().toISOString(), fields,
        duplicates: importDuplicates(db, { sourceUrl, title: fields.title.value, company: fields.company.value, location: fields.location.value }, actor),
        company: actor.kind === 'recruiter' ? (actor.user.company || actor.user.name) : undefined,
      });
    } catch (error) { next(error); }
  });

  app.post('/api/job-link/duplicates', limiter, async (req, res, next) => {
    try {
      const db = await store.read();
      const actor = actorFor(db, req, modeOf(req.body?.mode));
      const sourceUrl = req.body?.sourceUrl ? validateJobUrl(req.body.sourceUrl).href : null;
      res.json({ duplicates: importDuplicates(db, { sourceUrl, title: str(req.body?.title, 140), company: actor.kind === 'recruiter' ? (actor.user.company || actor.user.name) : str(req.body?.company, 120), location: str(req.body?.location, 120) }, actor) });
    } catch (error) { next(error); }
  });

  /** Recruiter: save the reviewed import as a DRAFT of their own job (publishing uses PATCH /api/jobs/:id). */
  app.post('/api/job-link/recruiter-draft', limiter, async (req, res, next) => {
    try {
      const result = await store.transaction((db) => {
        const actor = actorFor(db, req, 'recruiter');
        const employer = actor.user;
        assertRecruiterAccess?.('publish_job', db, employer);
        const b = req.body || {};
        const sourceUrl = b.sourceUrl ? validateJobUrl(b.sourceUrl).href : undefined;
        const method = IMPORT_METHODS.includes(b.importMethod) ? b.importMethod : 'manual';
        const title = str(b.title, 140);
        if (!title) throw new ValidationError('title', 'The job title is required');
        const job = {
          id: `j-${crypto.randomUUID().slice(0, 8)}`, employerId: employer.id, company: employer.company || employer.name,
          logo: (employer.company || employer.name || '?').trim()[0].toUpperCase(), accent: '#0f62fe',
          requiredSkills: [], requiredSkillsDetail: [], requiredLanguages: [], culture: [], applicants: 0, status: 'draft', createdAt: Date.now(),
        };
        const skills = Array.isArray(b.skills) ? b.skills.filter((s) => typeof s === 'string' && s.trim()).slice(0, 25) : [];
        applyJob(job, {
          title, location: str(b.location, 120), workMode: b.workMode || undefined, type: b.type || undefined, seniority: b.experienceLevel || undefined,
          salaryRange: b.salaryRange || undefined, fullDescription: str(b.description, 20000) || undefined, deadline: str(b.deadline, 40),
          externalUrl: sourceUrl, requiredSkillsDetail: skills.map((name) => ({ name, weight: 2 })),
        });
        if (employer.geo) job.geo = employer.geo;
        assignGroups(db, job, b);
        Object.assign(job, {
          sourceSystem: 'link_import', sourceUrl, sourceJobId: str(b.sourceJobId, 80), status: 'draft',
          importInfo: { method, sourceName: str(b.sourceName, 120), extraction: str(b.extraction, 120), importedBy: employer.id, importedAt: Date.now() },
          importNeedsReview: [!job.salaryRange && 'salary', !job.workMode && 'work mode', !job.location && 'location', !job.requiredSkillsDetail?.length && 'skills', !job.type && 'employment type'].filter(Boolean),
        });
        db.jobs.push(job);
        audit?.(db, employer.id, 'job_link_imported', 'job', job.id, { method, sourceName: job.importInfo.sourceName, sourceUrl });
        return { job };
      });
      res.status(201).json(result);
    } catch (error) { next(error); }
  });
}
