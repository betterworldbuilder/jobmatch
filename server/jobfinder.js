/**
 * JobFinder (founder spec, 2026-11-25): a JobsMatchNow-managed identity that lists external jobs before their
 * employers join. Candidates can like them; when JobFinder holds an approved, verified recruiter email, JobsMatchNow
 * emails the candidate's interest ON THE CANDIDATE'S REQUEST, without ever showing the recruiter's contact details.
 *
 * Privacy design:
 * - Recruiter contacts live in `db.jfContacts`, a collection that is never sent to a browser except to JobFinder
 *   managers. Job records only carry the public `job.jobFinder` block (source, freshness, membership, reachability).
 * - Internal notes, history and counters live in `db.jfInternal` (manager-only).
 * - Outreach rows (`db.jfOutreach`) keep statuses and what was shared, not the message once it is sent.
 * - Suppressions (`db.jfSuppress`) store only a hash of the email address.
 *
 * Matching: the JobFinder account never likes candidates (blocked in /api/swipes), so a like on a JobFinder job can
 * never become a match. After an approved claim the job belongs to the real recruiter and the usual rules apply.
 */
import crypto from 'node:crypto';
import { applyJob, heuristicParse } from './jobs.js';
import { ValidationError } from './matching.js';
import { involvesDemo } from './analytics.js';
import { assignGroups, assignGroupsFromTitles, createGroup, groupsForTitle } from './groups.js';
import { validateJobUrl } from './url-safety.js';
import { cleanForWho, FOR_WHO_CODES, forWhoOf, inferForWho } from './for-who.js';
import { hiddenFrom } from './test-roles.js';

/** How a listing's content arrived (job-link import, 2026-11-25). */
export const IMPORT_METHODS = ['imported', 'pasted', 'manual'];

// The founder's "JobFinder" recruiter account is the JobFinder identity (decision 2026-11-25). Override with
// JOBFINDER_ACCOUNT_IDS (comma-separated) without a code change.
export const DEFAULT_JOBFINDER_IDS = 'u-2c36b9f4';
export const jobFinderIds = () => (process.env.JOBFINDER_ACCOUNT_IDS || DEFAULT_JOBFINDER_IDS).split(',').map((s) => s.trim()).filter(Boolean);
export const isJobFinderUser = (user) => Boolean(user) && !user.demo && (user.jobFinder === true || jobFinderIds().includes(user.id));
export const isJobFinderJob = (job) => Boolean(job?.jobFinder);
export function jobFinderAccount(db) { return db.users.find((u) => u.role === 'employer' && isJobFinderUser(u)); }

export const LISTING_STATUSES = ['draft', 'published', 'expired', 'removed', 'claimed'];
const JOB_STATUS_FOR = { draft: 'draft', published: 'active', expired: 'expired', removed: 'removed', claimed: 'active' };
export const STALE_DAYS = Number(process.env.JF_STALE_DAYS || 14);
const DAY = 86400000;
export const CONSENT_VERSION = '2026-11-25';

const str = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const url = (v) => { const s = str(v, 600); if (!s) return undefined; if (!/^https?:\/\/[^\s]+$/i.test(s)) throw new ValidationError('url', 'Links must start with http:// or https://'); return s; };
const isoDate = (v) => { const s = str(v, 40); if (!s) return undefined; const t = Date.parse(s); if (Number.isNaN(t)) throw new ValidationError('date', `Not a date: ${s}`); return new Date(t).toISOString().slice(0, 10); };
const emailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
export const hashEmail = (e) => crypto.createHash('sha256').update(String(e || '').trim().toLowerCase()).digest('hex');
const nowIso = () => new Date().toISOString().slice(0, 10);

export function ensureCollections(db) {
  for (const c of ['jfContacts', 'jfInternal', 'jfOutreach', 'jfClaims', 'jfSuppress']) if (!Array.isArray(db[c])) db[c] = [];
}
const internalOf = (db, jobId) => {
  let row = db.jfInternal.find((r) => r.jobId === jobId);
  if (!row) { row = { id: `jfi-${jobId}`, jobId, history: [], stats: { views: 0, applyClicks: 0, closedReports: 0 }, review: [] }; db.jfInternal.push(row); }
  return row;
};
const contactOf = (db, jobId) => db.jfContacts.find((c) => c.jobId === jobId);
const suppressed = (db, email) => db.jfSuppress.some((s) => s.hash === hashEmail(email));

/** Who may manage JobFinder listings: admins and the JobFinder account(s). */
export function isManager(db, session) {
  if (!session) return false;
  if (session.role === 'admin') return true;
  return isJobFinderUser(db.users.find((u) => u.id === session.sub));
}
function requireManager(db, session) {
  if (!isManager(db, session)) { const e = new Error('Only JobFinder can manage these listings'); e.status = 403; throw e; }
}

/** Reachability shown to candidates: email only with an approved, verified, not-suppressed contact. */
export function reachabilityOf(db, job) {
  const c = contactOf(db, job.id);
  if (c?.approved && c.email && c.verifiedHow && c.verifiedAt && !suppressed(db, c.email)) return 'email';
  if (job.jobFinder?.applyUrl) return 'apply';
  return 'none';
}
/** The jobFinder block as members see it: no internal import/publish audit fields. */
export function memberJobFinder(jf) {
  const { import: _imp, publishedBy: _by, publishedAt: _at, ...rest } = jf || {};
  return rest;
}
export function refreshPublic(db, job) {
  if (!job.jobFinder) return;
  job.jobFinder.reachability = reachabilityOf(db, job);
  job.status = JOB_STATUS_FOR[job.jobFinder.listingStatus] || job.status;
}

function history(db, jobId, actorId, action, meta = {}, audit) {
  const row = internalOf(db, jobId);
  row.history.push({ at: Date.now(), actorId, action, ...meta });
  if (row.history.length > 60) row.history.splice(0, row.history.length - 60);
  audit?.(db, actorId, `jobfinder_${action}`, 'job', jobId, meta);
}

/** Possible duplicates: same source URL, or same company + title + location (case-insensitive). */
export function findDuplicates(db, job) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return db.jobs.filter((other) => other.id !== job.id && isJobFinderJob(other) && other.jobFinder.listingStatus !== 'removed'
    && ((job.jobFinder?.sourceUrl && other.jobFinder.sourceUrl === job.jobFinder.sourceUrl)
      || (norm(other.company) === norm(job.company) && norm(other.title) === norm(job.title) && norm(other.location) === norm(job.location))))
    .map((o) => ({ id: o.id, title: o.title, company: o.company, location: o.location, listingStatus: o.jobFinder.listingStatus }));
}

/** Review flags a manager should look at: stale "last checked", passed closing date, candidate reports. */
export function reviewFlags(db, job, now = Date.now()) {
  const flags = [];
  const jf = job.jobFinder || {};
  const checked = Date.parse(jf.lastCheckedAt || jf.discoveredAt || '');
  if (!Number.isNaN(checked) && now - checked > STALE_DAYS * DAY && jf.listingStatus === 'published') flags.push(`Not checked for over ${STALE_DAYS} days: may have expired`);
  if (jf.closingDate && Date.parse(jf.closingDate) < now && jf.listingStatus === 'published') flags.push('Closing date has passed');
  const reports = internalOf(db, job.id).stats.closedReports;
  if (reports > 0 && jf.listingStatus === 'published') flags.push(`${reports} candidate report(s): job closed`);
  if (internalOf(db, job.id).sourceUnavailable) flags.push('Source marked unavailable');
  return flags;
}

function applyJobFinderFields(job, body) {
  const jf = job.jobFinder;
  if (body.sourceName !== undefined) jf.source = str(body.sourceName, 120);
  if (body.sourceUrl !== undefined) jf.sourceUrl = url(body.sourceUrl);
  if (body.applyUrl !== undefined) jf.applyUrl = url(body.applyUrl);
  if (body.discoveredAt !== undefined) jf.discoveredAt = isoDate(body.discoveredAt) || jf.discoveredAt;
  if (body.lastCheckedAt !== undefined) jf.lastCheckedAt = isoDate(body.lastCheckedAt) || jf.lastCheckedAt;
  if (body.closingDate !== undefined) jf.closingDate = isoDate(body.closingDate);
  if (body.company !== undefined) { const c = str(body.company, 120); if (!c) throw new ValidationError('company', 'The employer / company is required'); job.company = c; }
  // The JobFinder form sends plain values: a skills list, the salary as published, and "" for "not stated".
  if (Array.isArray(body.requiredSkills)) {
    job.requiredSkillsDetail = body.requiredSkills.filter((s) => typeof s === 'string' && s.trim()).slice(0, 25).map((s) => ({ name: s.trim().slice(0, 60), weight: 2 }));
    job.requiredSkills = job.requiredSkillsDetail.map((s) => s.name);
  }
  if (body.salary !== undefined) { const s = str(body.salary, 120); if (s) job.salary = s; else delete job.salary; }
  // Standard job fields go through the normal job sanitizer (no status: JobFinder sets it from listingStatus).
  const { status, employerId, id, jobFinder, requiredSkills, salary, jobGroups, ...rest } = body;
  for (const k of ['workMode', 'type', 'seniority']) if (rest[k] === '' || rest[k] === null) { delete rest[k]; if (body[k] === '') delete job[k]; }
  applyJob(job, rest);
}

// ---------- Batch import from the Job Scraper (founder, 2026-11-26) ----------
// Scrapy turns the founder's "linkjobs" Gmail alerts into jobsmatchnow-job/v1 files; scripts/linkjobs_import.py posts
// them here with the import key. Every job lands as a JobFinder DRAFT (the founder reviews and publishes in the
// JobFinder manager); a link already listed is skipped, never overwritten.
export const IMPORT_BATCH_MAX = 50;
const JOB_FIELDS = ['title', 'company', 'department', 'location', 'country', 'type', 'workMode', 'seniority', 'fullDescription', 'description',
  'requiredSkillsDetail', 'niceToHaves', 'requiredLanguages', 'responsibilities', 'salaryRange', 'salaryPeriod', 'benefits', 'contractDuration',
  'startDate', 'workVisaRequired', 'visaSponsorship', 'relocationSupport', 'recruiterName', 'recruiterTitle'];
/** The same link written two ways (LinkedIn tracking params, trailing slash) counts as one. */
export function sourceKey(u) {
  const s = String(u || '').trim();
  const li = s.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i);
  if (li) return `linkedin:${li[1]}`;
  try { const x = new URL(s); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase(); } catch { return s.toLowerCase(); }
}
const normText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/**
 * Duplicate guardrail for every role import (founder, 2026-11-26): an employer's existing role (not removed) is the
 * same job when it has the same link (source / external / JobFinder source URL, LinkedIn job id) or the same
 * title + company + location. Returns that role or null.
 */
export function findImportDuplicate(db, employerId, { urls = [], title, company, location } = {}) {
  const keys = new Set(urls.filter(Boolean).map(sourceKey));
  const t = normText(title); const c = normText(company); const l = normText(location);
  // A filled, expired or removed role may be posted again: only roles still on offer count.
  return db.jobs.find((j) => j.employerId === employerId && !['removed', 'filled', 'expired', 'suspended'].includes(String(j.status)) && j.jobFinder?.listingStatus !== 'removed' && !j.deletedAt && (
    // The job's own posting link only: an apply link is often one generic page shared by every role of a company.
    (keys.size && [j.sourceUrl, j.externalUrl, j.jobFinder?.sourceUrl].some((u) => u && keys.has(sourceKey(u))))
    || (t && c && normText(j.title) === t && normText(j.company) === c && normText(j.location) === l))) || null;
}
/**
 * Remove duplicate roles of one account (founder, 2026-11-26). Roles are the same when they share a link (any form)
 * or title + company + location. Per group one role is kept: the one with applications / matches, else the oldest.
 * The others are taken off the site, never deleted (JobFinder listing → "removed"; other role → "paused"), and a role
 * that has applications or matches of its own is always kept. `dryRun` only reports.
 */
export function dedupeRoles(db, employerId, { dryRun = false, actorId = employerId, audit, now = Date.now() } = {}) {
  const live = db.jobs.filter((j) => j.employerId === employerId && !j.deletedAt && !['removed', 'filled', 'expired', 'suspended', 'paused'].includes(String(j.status))
    && !['removed', 'claimed'].includes(j.jobFinder?.listingStatus));
  const parent = new Map(live.map((j) => [j.id, j.id]));
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const byKey = new Map();
  for (const j of live) {
    const keys = [j.jobFinder?.sourceUrl, j.sourceUrl, j.externalUrl].filter(Boolean).map((u) => `u:${sourceKey(u)}`);
    const t = normText(j.title); const c = normText(j.company);
    if (t && c) keys.push(`t:${t}|${c}|${normText(j.location)}`);
    for (const k of keys) { if (byKey.has(k)) union(byKey.get(k), j.id); else byKey.set(k, j.id); }
  }
  const groups = new Map();
  for (const j of live) { const r = find(j.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(j); }
  const activity = (j) => (db.swipes || []).filter((s) => s.targetType === 'job' && s.targetId === j.id && s.direction === 'like').length
    + (db.matches || []).filter((m) => m.jobId === j.id).length;
  const out = []; let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const ranked = list.map((j) => ({ j, a: activity(j) })).sort((x, y) => y.a - x.a || (x.j.createdAt || 0) - (y.j.createdAt || 0));
    const keep = ranked[0].j;
    const g = { keep: { id: keep.id, title: keep.title, company: keep.company, location: keep.location }, removed: [], kept: [] };
    for (const { j, a } of ranked.slice(1)) {
      if (a > 0) { g.kept.push({ id: j.id, title: j.title, why: 'has applications or matches' }); continue; }
      g.removed.push({ id: j.id, title: j.title, company: j.company, location: j.location });
      removed += 1;
      if (dryRun) continue;
      if (j.jobFinder) {
        j.jobFinder.listingStatus = 'removed';
        ensureCollections(db); internalOf(db, j.id).removedReason = `duplicate of ${keep.id}`;
        refreshPublic(db, j);
        history(db, j.id, actorId, 'remove', { reason: 'duplicate', of: keep.id }, audit);
      } else {
        j.status = 'paused';
        audit?.(db, actorId, 'job_duplicate_paused', 'job', j.id, { of: keep.id });
      }
      Object.assign(j, { duplicateOf: keep.id, duplicateRemovedAt: now });
    }
    out.push(g);
  }
  return { groups: out, removed, dryRun };
}
/** One scraped job → the body the JobFinder form would send (nulls dropped). */
export function scrapedToBody(j) {
  const body = {};
  for (const k of JOB_FIELDS) if (j[k] !== null && j[k] !== undefined && !(Array.isArray(j[k]) && !j[k].length) && j[k] !== '') body[k] = j[k];
  const src = j.source?.url || j.externalUrl || j.url;
  if (src) body.sourceUrl = src;
  body.sourceName = j.source?.name || 'Job Scraper';
  if (j.externalUrl || src) body.applyUrl = j.externalUrl || src;
  if (j.deadline) body.closingDate = j.deadline;
  const groups = (j.jobGroups?.length ? j.jobGroups : j.suggestedJobGroups) || [];
  if (groups.length) body.jobGroups = groups;
  return body;
}
/** Apply fields one validation error at a time: a value the app does not accept is dropped, the rest is kept. */
function applyLenient(job, body, dropped) {
  const b = { ...body };
  for (let i = 0; i < 12; i += 1) {
    try { applyJobFinderFields(job, b); return; } catch (error) {
      // Shared validators name the field 'url' / 'date': map them back to the optional fields that use them.
      const f = error?.field === 'url' && 'applyUrl' in b ? 'applyUrl' : error?.field === 'date' && 'closingDate' in b ? 'closingDate' : error?.field;
      if (!(error instanceof ValidationError) || !f || !(f in b) || ['title', 'company', 'sourceUrl'].includes(f)) throw error;
      dropped.push(f); delete b[f]; delete job[f];
    }
  }
}
/** Recruiter email / phone written in a scraped job (the file's own fields first, else the job text). */
export function contactFromScraped(j) {
  const email = typeof j?.contactEmail === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(j.contactEmail.trim()) ? j.contactEmail.trim() : undefined;
  const phone = typeof j?.contactPhone === 'string' && j.contactPhone.trim() ? j.contactPhone.trim().slice(0, 30) : undefined;
  if (email || phone) return { email, phone };
  const text = [j?.fullDescription, j?.description].filter((x) => typeof x === 'string').join('\n').slice(0, 30000);
  if (!text) return {};
  const p = heuristicParse(text, null);
  return { email: p.contactEmail, phone: p.contactPhone };
}
/** Publish an imported listing (founder, 2026-11-26: imports go live at once). Salary stays honest when not stated. */
function publishImported(db, job, actorId, audit, now = Date.now()) {
  Object.assign(job.jobFinder, { listingStatus: 'published', publishedBy: actorId, publishedAt: now });
  if (!job.salaryRange && !job.salary) job.salary = 'Salary not disclosed';
  refreshPublic(db, job);
  history(db, job.id, actorId, 'publish', { via: 'import' }, audit);
}

/** Import scraped jobs as JobFinder listings, published at once (founder, 2026-11-26). One result per input, in order. */
export function importScrapedJobs(db, items, { ownerId, audit, setContact, now = Date.now() } = {}) {
  ensureCollections(db);
  const owner = db.users.find((u) => u.id === ownerId);
  const known = new Map(db.jobs.filter((j) => isJobFinderJob(j) && j.jobFinder.sourceUrl).map((j) => [sourceKey(j.jobFinder.sourceUrl), j.id]));
  return items.slice(0, IMPORT_BATCH_MAX).map((raw) => {
    const j = raw && typeof raw === 'object' && Array.isArray(raw.jobs) ? raw.jobs[0] : raw;
    const ref = String(j?.source?.url || j?.externalUrl || j?.url || j?.title || '').slice(0, 300);
    try {
      if (!j || typeof j !== 'object') throw new ValidationError('job', 'Not a job');
      const body = scrapedToBody(j);
      if (!body.sourceUrl) throw new ValidationError('sourceUrl', 'The job has no source link');
      body.sourceUrl = validateJobUrl(body.sourceUrl).href;
      const key = sourceKey(body.sourceUrl);
      if (known.has(key)) return { ref, status: 'duplicate', id: known.get(key) };
      const same = findImportDuplicate(db, owner.id, { urls: [body.sourceUrl], title: body.title, company: body.company, location: body.location });
      if (same) return { ref, status: 'duplicate', id: same.id };
      const job = {
        id: `jf-${crypto.randomUUID().slice(0, 12)}`, employerId: owner.id, createdAt: now, applicants: 0, accent: '#0f62fe',
        jobFinder: { addedBy: 'JobFinder', employerStatus: 'pending', listingStatus: 'draft', discoveredAt: nowIso(), lastCheckedAt: nowIso() },
      };
      const dropped = [];
      applyLenient(job, body, dropped);
      // Job group (founder, 2026-11-26): every imported role gets the groups its title matches when the file names none.
      if (!(job.jobGroups || []).length) { const g = groupsForTitle(db, job.title).slice(0, 6); if (g.length) job.jobGroups = g; }
      // "For who": what the file says, else worked out from the location / work mode, with the site's region as a hint.
      const fw = cleanForWho(j.forWho)?.length ? cleanForWho(j.forWho) : inferForWho(job, j.workersFrom || '');
      if (fw.length) job.forWho = fw;
      assignGroups(db, job, body);
      if (!job.title) throw new ValidationError('title', 'The job title is required');
      if (!job.company) throw new ValidationError('company', 'The employer / company is required');
      const sourceJobId = key.startsWith('linkedin:') ? key.slice(9) : undefined;
      job.jobFinder.import = { method: 'imported', extraction: str(raw?.generator || 'jobscraper', 120), sourceJobId, importedBy: 'import-key', importedAt: now, ...(dropped.length ? { dropped } : {}) };
      db.jobs.push(job);
      refreshPublic(db, job);
      history(db, job.id, owner.id, 'imported', { listingStatus: 'draft', method: 'imported', via: 'linkjobs' }, audit);
      // Recruiter email / phone found in the job: the private contact (My Jobs list email column; never shown to candidates).
      const contact = contactFromScraped(j);
      if (setContact && (contact.email || contact.phone)) setContact(db, job.id, { ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { phone: contact.phone } : {}) });
      publishImported(db, job, owner.id, audit, now);
      known.set(key, job.id);
      return { ref, status: 'created', id: job.id, title: job.title, company: job.company, published: true, ...(contact.email ? { contact: 'email' } : {}), ...(dropped.length ? { dropped } : {}) };
    } catch (error) {
      return { ref, status: 'failed', error: String(error?.message || error).slice(0, 200) };
    }
  });
}
/** The import key from the server env (JOBFINDER_IMPORT_KEY, 32+ chars); off when unset. */
export function importKeyOk(header, key = process.env.JOBFINDER_IMPORT_KEY) {
  if (!key || key.length < 32) return false;
  const got = String(header || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(got).digest(); const b = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

/** What a public visitor or candidate may see about a JobFinder job (no contacts, no internal data). */
export function publicJobView(db, job) {
  const jf = job.jobFinder;
  return {
    id: job.id, title: job.title, company: job.company, location: job.location, country: job.country, workMode: job.workMode,
    type: job.type, salary: job.salary, salaryRange: job.salaryRange, experienceLevel: job.experienceLevel, description: job.description,
    fullDescription: job.fullDescription, requiredSkills: job.requiredSkills || [], niceToHaves: job.niceToHaves || [],
    responsibilities: job.responsibilities || [], requiredLanguages: job.requiredLanguages || [],
    jobFinder: { addedBy: 'JobFinder', employerStatus: jf.employerStatus, reachability: reachabilityOf(db, job), source: jf.source, sourceUrl: jf.sourceUrl, applyUrl: jf.applyUrl, lastCheckedAt: jf.lastCheckedAt, closingDate: jf.closingDate, listingStatus: jf.listingStatus },
    // Aggregate only (claim page): how many candidates liked it. Never who.
    interested: db.swipes.filter((s) => s.targetType === 'job' && s.targetId === job.id && s.direction === 'like').length,
    jobGroups: job.jobGroups || [],
    forWho: forWhoOf(job),
    missing: missingInfo(job),
  };
}
export function missingInfo(job) {
  const miss = [];
  if (!job.salaryRange && !job.salary) miss.push('salary');
  if (!job.location) miss.push('location');
  if (!job.workMode) miss.push('work arrangement');
  if (!(job.requiredSkills || []).length) miss.push('required skills');
  if (!job.description && !job.fullDescription) miss.push('description');
  return miss;
}

/** The candidate's sharing choices, with defaults that share only their name. */
export function consentOf(user) {
  const c = user.jobFinderConsent || {};
  return { autoSend: c.autoSend === true, skills: Array.isArray(c.skills) ? c.skills : [], profileLink: c.profileLink || null, replyEmail: c.replyEmail === true, agreedAt: c.agreedAt || null, version: c.version || null };
}
const LINK_KEYS = ['linkedin', 'website', 'portfolio', 'github'];
export function shareOptions(user) {
  const skills = (user.skillsDetail || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0)).map((s) => s.name);
  const all = skills.length ? skills : (user.skills || []);
  const links = Object.fromEntries(LINK_KEYS.filter((k) => user.links?.[k]).map((k) => [k, user.links[k]]));
  return { skills: all.slice(0, 15), links };
}
function cleanShare(user, share = {}) {
  const opts = shareOptions(user);
  const skills = (Array.isArray(share.skills) ? share.skills : []).filter((s) => opts.skills.includes(s)).slice(0, 8);
  const profileLink = LINK_KEYS.includes(share.profileLink) && opts.links[share.profileLink] ? share.profileLink : null;
  return { skills, profileLink, replyEmail: share.replyEmail === true };
}

/** The message, built only from what the candidate approved (spec section 8). `body` = the candidate's edited part. */
export function composeMessage({ candidate, job, contact, share, body, origin, unsubscribeUrl }) {
  const first = String(candidate.name || '').split(' ')[0] || 'The candidate';
  const greeting = `Hi ${contact?.name ? contact.name.split(' ')[0] : 'Hiring Team'},`;
  const link = share.profileLink ? candidate.links?.[share.profileLink] : null;
  const defaultBody = [
    `${candidate.name} discovered your ${job.title} opportunity at ${job.company} through JobsMatchNow and would love to connect.`,
    share.skills.length ? `Their experience includes ${share.skills.join(', ')}.` : null,
    '',
    `Job details: ${origin}/jobs/${job.id}`,
    link ? `Candidate profile: ${/^https?:/i.test(link) ? link : `https://${link}`}` : null,
    '',
    'Would you be open to a conversation?',
  ].filter((l) => l !== null).join('\n');
  const main = (typeof body === 'string' && body.trim()) ? body.trim().slice(0, 1500) : defaultBody;
  const reply = share.replyEmail
    ? `You can reply to this email to reach ${first} directly.`
    : `${first} has not shared their email address. You can respond and connect on JobsMatchNow: ${origin}/app/`;
  const text = [
    greeting, '', main, '', reply, '',
    `You’re also welcome to join JobsMatchNow to discover and connect with candidates interested in your opportunities: ${origin}/app/`,
    `Is this your listing? You can ask to claim it from the job page: ${origin}/jobs/${job.id}`,
    '', 'Best,', `The JobsMatchNow team, on behalf of ${candidate.name}`, '',
    'Sent at the candidate’s request through JobsMatchNow.',
    `Don’t want emails like this? ${unsubscribeUrl}`,
  ].join('\n');
  return { subject: `A candidate is interested in your ${job.title} opportunity`, text, defaultBody };
}

/**
 * Mount the JobFinder routes. `ctx` carries the app's own helpers (they are private to index.js).
 */
export function mountJobFinder(app, ctx) {
  const { store, authSession, track, audit, sendMail, mailerConfigured, origin, secret, limiter, setJobContact } = ctx;
  const sign = (hash) => crypto.createHmac('sha256', secret).update(`jf-unsub:${hash}`).digest('base64url').slice(0, 32);
  const unsubscribeUrl = (email) => { const h = hashEmail(email); return `${origin}/api/jobfinder/unsubscribe?e=${h}&s=${sign(h)}`; };
  const maxPerDay = () => Number(process.env.JF_MAX_SENDS_PER_DAY || 10);
  const maxPerRecipientWeek = () => Number(process.env.JF_MAX_PER_RECIPIENT_WEEK || 5);
  const session = (req) => authSession(req);
  const requireUser = (db, req, role) => {
    const s = session(req);
    const user = s && db.users.find((u) => u.id === s.sub);
    if (!user) { const e = new Error('Sign in to continue'); e.status = 401; throw e; }
    if (role && user.role !== role) { const e = new Error(role === 'candidate' ? 'Only candidates can do this' : 'Only recruiters can do this'); e.status = 403; throw e; }
    return user;
  };
  const jfJob = (db, id) => {
    const job = db.jobs.find((j) => j.id === id && isJobFinderJob(j));
    if (!job) { const e = new Error('Listing not found'); e.status = 404; throw e; }
    return job;
  };

  // ---------- Manager: list, create, edit, status, contact, claims ----------
  app.get('/api/jobfinder/jobs', async (req, res, next) => {
    try {
      const db = await store.read();
      requireManager(db, session(req));
      ensureCollections(db);
      const q = String(req.query.q || '').toLowerCase();
      let jobs = db.jobs.filter(isJobFinderJob);
      const f = req.query;
      if (f.status) jobs = jobs.filter((j) => j.jobFinder.listingStatus === f.status);
      if (f.source) jobs = jobs.filter((j) => String(j.jobFinder.source || '').toLowerCase().includes(String(f.source).toLowerCase()));
      if (f.membership) jobs = jobs.filter((j) => j.jobFinder.employerStatus === f.membership);
      if (f.reachability) jobs = jobs.filter((j) => reachabilityOf(db, j) === f.reachability);
      if (q) jobs = jobs.filter((j) => [j.title, j.company, j.location].some((x) => String(x || '').toLowerCase().includes(q)));
      // Workers filter (2026-11-26): roles for Vietnam-based, US-based, EU / UK-based, … or remote workers anywhere.
      if (f.forWho === 'none') jobs = jobs.filter((j) => !forWhoOf(j).length);
      else if (f.forWho && FOR_WHO_CODES.includes(String(f.forWho))) jobs = jobs.filter((j) => forWhoOf(j).includes(String(f.forWho)));
      const rows = jobs.map((j) => {
        const internal = db.jfInternal.find((r) => r.jobId === j.id) || { stats: {} };
        const out = db.jfOutreach.filter((o) => o.jobId === j.id);
        const c = contactOf(db, j.id);
        return {
          ...publicJobView(db, j), createdAt: j.createdAt,
          likes: db.swipes.filter((s) => s.targetType === 'job' && s.targetId === j.id && s.direction === 'like').length,
          emails: { submitted: out.filter((o) => o.status === 'submitted').length, sent: out.filter((o) => o.status === 'sent').length, failed: out.filter((o) => ['failed', 'not_sent'].includes(o.status)).length },
          views: internal.stats?.views || 0, applyClicks: internal.stats?.applyClicks || 0, closedReports: internal.stats?.closedReports || 0,
          claims: { pending: db.jfClaims.filter((x) => x.jobId === j.id && x.status === 'pending').length, approved: db.jfClaims.filter((x) => x.jobId === j.id && x.status === 'approved').length },
          matches: db.matches.filter((m) => m.jobId === j.id).length,
          contact: c ? { name: c.name, email: c.email, verifiedHow: c.verifiedHow, verifiedAt: c.verifiedAt, approved: c.approved === true, suppressed: c.email ? suppressed(db, c.email) : false } : null,
          flags: reviewFlags(db, j), duplicates: findDuplicates(db, j), history: (internal.history || []).slice(-10),
          importInfo: j.jobFinder.import || null, publishedBy: j.jobFinder.publishedBy || null, publishedAt: j.jobFinder.publishedAt || null,
        };
      });
      const sort = String(f.sort || 'created');
      // sort=workers groups the roles by worker group (Vietnam, US, EU / UK, …, Remote anywhere, then unknown), newest first.
      const groupRank = (r) => { const c = (r.forWho || [])[0]; return c ? FOR_WHO_CODES.indexOf(c) : FOR_WHO_CODES.length; };
      rows.sort((a, b) => (sort === 'likes' ? b.likes - a.likes || b.emails.sent - a.emails.sent : sort === 'checked' ? String(a.jobFinder.lastCheckedAt || '').localeCompare(String(b.jobFinder.lastCheckedAt || ''))
        : sort === 'workers' ? groupRank(a) - groupRank(b) || (b.createdAt || 0) - (a.createdAt || 0) : (b.createdAt || 0) - (a.createdAt || 0)));
      res.json({ jobs: rows, account: jobFinderAccount(db) ? { id: jobFinderAccount(db).id, name: jobFinderAccount(db).name } : null });
    } catch (error) { next(error); }
  });

  app.post('/api/jobfinder/jobs', async (req, res, next) => {
    try {
      const s = session(req);
      const result = await store.transaction((db) => {
        requireManager(db, s); ensureCollections(db);
        const owner = jobFinderAccount(db);
        if (!owner) { const e = new Error('The JobFinder account is missing'); e.status = 409; throw e; }
        const listingStatus = req.body.listingStatus === 'published' ? 'published' : 'draft';
        const job = {
          id: `jf-${crypto.randomUUID().slice(0, 12)}`, employerId: owner.id, createdAt: Date.now(), applicants: 0, accent: '#0f62fe',
          jobFinder: { addedBy: 'JobFinder', employerStatus: 'pending', listingStatus, discoveredAt: nowIso(), lastCheckedAt: nowIso() },
        };
        applyJobFinderFields(job, req.body);
        assignGroups(db, job, req.body);
        if (!job.title) throw new ValidationError('title', 'The job title is required');
        if (!job.company) throw new ValidationError('company', 'The employer / company is required');
        // Duplicate guardrail (2026-11-26): same link, or same title + company + location, is refused unless confirmed.
        const same = req.body.allowDuplicate === true ? null
          : findImportDuplicate(db, owner.id, { urls: [job.jobFinder.sourceUrl], title: job.title, company: job.company, location: job.location });
        if (same) { const e = new Error(`Duplicate role: "${same.title}" (${[same.company, same.location].filter(Boolean).join(', ')}) is already listed`); e.status = 409; e.duplicateOf = same.id; throw e; }
        // Job-link import: the source link must pass the URL safety check; who imported it comes from the session.
        const imp = req.body.importInfo;
        if (imp && typeof imp === 'object') {
          if (job.jobFinder.sourceUrl) job.jobFinder.sourceUrl = validateJobUrl(job.jobFinder.sourceUrl).href;
          job.jobFinder.import = { method: IMPORT_METHODS.includes(imp.method) ? imp.method : 'manual', extraction: str(imp.extraction, 120), sourceJobId: str(imp.sourceJobId, 80), importedBy: s.sub, importedAt: Date.now() };
        }
        if (listingStatus === 'published') Object.assign(job.jobFinder, { publishedBy: s.sub, publishedAt: Date.now() });
        db.jobs.push(job);
        refreshPublic(db, job);
        history(db, job.id, s.sub, job.jobFinder.import ? 'imported' : 'created', { listingStatus, ...(job.jobFinder.import ? { method: job.jobFinder.import.method } : {}) }, audit);
        if (listingStatus === 'published') history(db, job.id, s.sub, 'publish', {}, audit);
        return { job, duplicates: findDuplicates(db, job) };
      });
      res.status(201).json(result);
    } catch (error) { next(error); }
  });

  // Batch import of Scrapy's job files. Two doors, same rules (drafts only, duplicate guardrail):
  //  - /import-batch: scripts/linkjobs_import.py (daily), import key only (no session, no cookies);
  //  - /import-files: the "Update roles" button, signed-in JobFinder manager.
  // `emailDate` (the linkjobs.csv email_date of the rows sent) moves the remembered "last imported email date".
  const runImport = async (items, emailDate) => {
    if (!Array.isArray(items) || !items.length) throw new ValidationError('jobs', 'Send { jobs: [...] }');
    if (items.length > IMPORT_BATCH_MAX) throw new ValidationError('jobs', `At most ${IMPORT_BATCH_MAX} jobs per call`);
    const results = await store.transaction((db) => {
      const owner = jobFinderAccount(db);
      if (!owner) { const e = new Error('The JobFinder account is missing'); e.status = 409; throw e; }
      const out = importScrapedJobs(db, items, { ownerId: owner.id, audit, setContact: setJobContact });
      // Duplicates that slipped in another way (older imports, hand-made roles) are cleaned after every import.
      if (out.some((r) => r.status === 'created')) dedupeRoles(db, owner.id, { audit });
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(emailDate || '')) ? emailDate : null;
      if (d && out.some((r) => r.status !== 'failed')) {
        if (!db.jfImportState || typeof db.jfImportState !== 'object') db.jfImportState = {};
        if (!db.jfImportState.lastEmailDate || d > db.jfImportState.lastEmailDate) db.jfImportState.lastEmailDate = d;
        db.jfImportState.lastRunAt = Date.now();
      }
      return out;
    });
    const count = (s) => results.filter((r) => r.status === s).length;
    return { created: count('created'), duplicate: count('duplicate'), failed: count('failed'), results };
  };
  app.post('/api/jobfinder/import-batch', ...(limiter ? [limiter] : []), async (req, res, next) => {
    try {
      if (!process.env.JOBFINDER_IMPORT_KEY) { const e = new Error('Batch import is not switched on'); e.status = 404; throw e; }
      if (!importKeyOk(req.headers.authorization)) { const e = new Error('Missing or invalid import key'); e.status = 401; throw e; }
      res.json(await runImport(req.body?.jobs, req.body?.emailDate));
    } catch (error) { next(error); }
  });
  // Test roles (founder, 2026-11-26): create JobFinder roles visible ONLY to a tester account, or restrict existing ones.
  // Import key only. { testerEmail, jobs?: [scraped-style jobs], restrictJobIds?: [ids] }.
  app.post('/api/jobfinder/test-roles', ...(limiter ? [limiter] : []), async (req, res, next) => {
    try {
      if (!process.env.JOBFINDER_IMPORT_KEY || !importKeyOk(req.headers.authorization)) { const e = new Error('Missing or invalid import key'); e.status = 401; throw e; }
      const out = await store.transaction((db) => {
        const email = String(req.body?.testerEmail || '').trim().toLowerCase();
        const tester = db.users.find((u) => String(u.email || '').toLowerCase() === email);
        if (!tester) { const e = new Error('No account with that tester email'); e.status = 404; throw e; }
        const owner = jobFinderAccount(db);
        if (!owner) { const e = new Error('The JobFinder account is missing'); e.status = 409; throw e; }
        const restrict = (job) => { job.visibleTo = [...new Set([...(job.visibleTo || []), tester.id])]; job.testRole = true; };
        const created = Array.isArray(req.body?.jobs) && req.body.jobs.length
          ? importScrapedJobs(db, req.body.jobs.slice(0, 10), { ownerId: owner.id, audit, setContact: setJobContact }) : [];
        for (const r of created) if (r.id) { const j = db.jobs.find((x) => x.id === r.id); if (j) restrict(j); }
        const restricted = [];
        for (const id of Array.isArray(req.body?.restrictJobIds) ? req.body.restrictJobIds : []) {
          const j = db.jobs.find((x) => x.id === id && x.employerId === owner.id);
          if (j) { restrict(j); restricted.push(j.id); }
        }
        return { tester: tester.id, created, restricted };
      });
      res.json(out);
    } catch (error) { next(error); }
  });
  // Job groups for the JobFinder account (founder, 2026-11-26): add a custom group (name + title keywords; matching roles
  // join it at once), and give every role without a group the groups its title matches.
  app.post('/api/jobfinder/job-groups', ...(limiter ? [limiter] : []), async (req, res, next) => {
    try {
      const s = session(req);
      const out = await store.transaction((db) => {
        requireManager(db, s);
        const owner = jobFinderAccount(db);
        if (!owner) { const e = new Error('The JobFinder account is missing'); e.status = 409; throw e; }
        const group = createGroup(db, { name: req.body?.name, keywords: req.body?.keywords, description: req.body?.description }, s.sub, { custom: true });
        const added = assignGroupsFromTitles(db, owner.id, { onlyGroupId: group.id });
        audit?.(db, s.sub, 'job_group_created', 'group', group.id, { name: group.name, added });
        return { group: { id: group.id, name: group.name, slug: group.slug, keywords: group.keywords, custom: true }, added };
      });
      res.status(201).json(out);
    } catch (error) { next(error); }
  });
  app.post('/api/jobfinder/assign-groups', ...(limiter ? [limiter] : []), async (req, res, next) => {
    try {
      const keyOk = process.env.JOBFINDER_IMPORT_KEY && importKeyOk(req.headers.authorization);
      if (!keyOk) requireManager(await store.read(), session(req));
      const out = await store.transaction((db) => {
        const owner = jobFinderAccount(db);
        if (!owner) { const e = new Error('The JobFinder account is missing'); e.status = 409; throw e; }
        return { changed: assignGroupsFromTitles(db, owner.id) };
      });
      res.json(out);
    } catch (error) { next(error); }
  });
  // Remove duplicate roles of the JobFinder account (founder, 2026-11-26). { dryRun: true } only lists them.
  app.post('/api/jobfinder/dedupe', ...(limiter ? [limiter] : []), async (req, res, next) => {
    try {
      const keyOk = process.env.JOBFINDER_IMPORT_KEY && importKeyOk(req.headers.authorization);
      if (!keyOk) requireManager(await store.read(), session(req));
      const dryRun = req.body?.dryRun === true;
      const run = (db) => {
        const owner = jobFinderAccount(db);
        if (!owner) { const e = new Error('The JobFinder account is missing'); e.status = 409; throw e; }
        return dedupeRoles(db, owner.id, { dryRun, actorId: keyOk ? owner.id : session(req).sub, audit });
      };
      res.json(dryRun ? run(await store.read()) : await store.transaction(run));
    } catch (error) { next(error); }
  });
  // Publish every imported JobFinder draft and fill its recruiter contact from the job text when it has none
  // (founder, 2026-11-26: "automatically publish all imported jobs"). Import key or a signed-in manager.
  app.post('/api/jobfinder/publish-imported', ...(limiter ? [limiter] : []), async (req, res, next) => {
    try {
      const keyOk = process.env.JOBFINDER_IMPORT_KEY && importKeyOk(req.headers.authorization);
      if (!keyOk) requireManager(await store.read(), session(req));
      const out = await store.transaction((db) => {
        ensureCollections(db);
        const owner = jobFinderAccount(db);
        if (!owner) { const e = new Error('The JobFinder account is missing'); e.status = 409; throw e; }
        let published = 0; let contacts = 0;
        for (const job of db.jobs) {
          if (job.employerId !== owner.id || !job.jobFinder?.import || job.jobFinder.listingStatus !== 'draft') continue;
          const has = (db.jobContacts || []).some((c) => c.jobId === job.id && (c.email || c.phone));
          if (!has && setJobContact) { const c = contactFromScraped(job); if (c.email || c.phone) { setJobContact(db, job.id, { ...(c.email ? { email: c.email } : {}), ...(c.phone ? { phone: c.phone } : {}) }); contacts += 1; } }
          publishImported(db, job, keyOk ? owner.id : session(req).sub, audit);
          published += 1;
        }
        return { published, contacts };
      });
      res.json(out);
    } catch (error) { next(error); }
  });
  app.post('/api/jobfinder/import-files', ...(limiter ? [limiter] : []), async (req, res, next) => {
    try {
      requireManager(await store.read(), session(req));
      res.json(await runImport(req.body?.jobs, req.body?.emailDate));
    } catch (error) { next(error); }
  });
  // What the button needs to skip old rows before sending anything: the last imported email date + the links listed.
  app.get('/api/jobfinder/import-state', async (req, res, next) => {
    try {
      const db = await store.read();
      requireManager(db, session(req));
      const owner = jobFinderAccount(db);
      const keys = db.jobs.filter((j) => j.employerId === owner?.id && j.jobFinder?.listingStatus !== 'removed')
        .flatMap((j) => [j.jobFinder?.sourceUrl, j.sourceUrl, j.externalUrl]).filter(Boolean).map(sourceKey);
      res.json({ lastEmailDate: db.jfImportState?.lastEmailDate || null, lastRunAt: db.jfImportState?.lastRunAt || null, knownKeys: [...new Set(keys)] });
    } catch (error) { next(error); }
  });

  app.patch('/api/jobfinder/jobs/:id', async (req, res, next) => {
    try {
      const s = session(req);
      const result = await store.transaction((db) => {
        requireManager(db, s); ensureCollections(db);
        const job = jfJob(db, req.params.id);
        const action = req.body.action;
        if (action) {
          const to = { publish: 'published', unpublish: 'draft', expire: 'expired', remove: 'removed' }[action];
          if (to) {
            if (job.jobFinder.listingStatus === 'claimed') { const e = new Error('This listing was claimed by its employer; they manage it now'); e.status = 409; throw e; }
            job.jobFinder.listingStatus = to;
            if (action === 'publish') Object.assign(job.jobFinder, { publishedBy: s.sub, publishedAt: Date.now() });
            if (action === 'remove') internalOf(db, job.id).removedReason = str(req.body.reason, 300) || 'removed';
          } else if (action === 'checked') {
            job.jobFinder.lastCheckedAt = nowIso();
            const internal = internalOf(db, job.id); internal.stats.closedReports = 0; internal.sourceUnavailable = false;
          } else if (action === 'source-unavailable') {
            internalOf(db, job.id).sourceUnavailable = true;
          } else throw new ValidationError('action', 'Unknown action');
          history(db, job.id, s.sub, action, req.body.reason ? { reason: str(req.body.reason, 300) } : {}, audit);
        } else {
          applyJobFinderFields(job, req.body);
          assignGroups(db, job, req.body);
          history(db, job.id, s.sub, 'edited', { fields: Object.keys(req.body).slice(0, 20) }, audit);
        }
        refreshPublic(db, job);
        return { job, duplicates: findDuplicates(db, job) };
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  // Recruiter contact: stored privately; "approved" needs a recorded verification (how + when), never syntax alone.
  app.put('/api/jobfinder/jobs/:id/contact', async (req, res, next) => {
    try {
      const s = session(req);
      const result = await store.transaction((db) => {
        requireManager(db, s); ensureCollections(db);
        const job = jfJob(db, req.params.id);
        const before = contactOf(db, job.id);
        const email = str(req.body.email, 200);
        if (email && !emailOk(email)) throw new ValidationError('email', 'That email address does not look valid');
        const verifiedHow = str(req.body.verifiedHow, 300);
        const verifiedAt = req.body.verifiedAt ? isoDate(req.body.verifiedAt) : undefined;
        const approved = req.body.approved === true;
        if (approved && (!email || !verifiedHow || !verifiedAt)) throw new ValidationError('approved', 'To approve a contact, record its email, how it was verified and when');
        const row = before || { id: `jfc-${job.id}`, jobId: job.id };
        Object.assign(row, { name: str(req.body.name, 120), email, verifiedHow, verifiedAt, approved, updatedAt: Date.now(), updatedBy: s.sub });
        if (!before) db.jfContacts.push(row);
        const wasEmail = job.jobFinder.reachability === 'email';
        refreshPublic(db, job);
        history(db, job.id, s.sub, 'contact_updated', { approved, verifiedHow: Boolean(verifiedHow) }, audit);
        // A contact became available: never send saved likes automatically unless that candidate's one-click
        // preference covers it; tell everyone else and let them confirm (spec 7).
        if (!wasEmail && job.jobFinder.reachability === 'email') {
          const likers = db.swipes.filter((sw) => sw.targetType === 'job' && sw.targetId === job.id && sw.direction === 'like').map((sw) => sw.actorId);
          for (const uid of likers) {
            if (db.jfOutreach.some((o) => o.jobId === job.id && o.candidateId === uid && ['submitted', 'sent'].includes(o.status))) continue;
            if (!Array.isArray(db.billingNotifications)) db.billingNotifications = [];
            db.billingNotifications.push({ id: crypto.randomUUID(), userId: uid, kind: 'jobfinder_contact', jobId: job.id, text: `You can now send your interest for ${job.title} at ${job.company}: the recruiter is reachable by email through JobsMatchNow.`, createdAt: Date.now(), read: false });
          }
        }
        return { reachability: job.jobFinder.reachability };
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  app.get('/api/jobfinder/claims', async (req, res, next) => {
    try {
      const db = await store.read();
      requireManager(db, session(req)); ensureCollections(db);
      const claims = db.jfClaims.slice().reverse().map((c) => {
        const r = db.users.find((u) => u.id === c.recruiterId); const j = db.jobs.find((x) => x.id === c.jobId);
        return { ...c, recruiter: r ? { id: r.id, name: r.name, email: r.email, company: r.company, website: r.website, linkedin: r.linkedinCompanyUrl || r.links?.linkedin, emailVerified: r.emailVerified !== false } : null, job: j ? { id: j.id, title: j.title, company: j.company } : null };
      });
      res.json({ claims });
    } catch (error) { next(error); }
  });

  app.post('/api/jobfinder/claims/:id/decide', async (req, res, next) => {
    try {
      const s = session(req);
      const result = await store.transaction((db) => {
        requireManager(db, s); ensureCollections(db);
        const claim = db.jfClaims.find((c) => c.id === req.params.id);
        if (!claim) { const e = new Error('Claim not found'); e.status = 404; throw e; }
        if (claim.status !== 'pending') { const e = new Error('This claim was already decided'); e.status = 409; throw e; }
        const decision = req.body.decision;
        if (!['approve', 'reject'].includes(decision)) throw new ValidationError('decision', 'approve or reject');
        claim.status = decision === 'approve' ? 'approved' : 'rejected';
        claim.decidedAt = Date.now(); claim.decidedBy = s.sub; claim.reason = str(req.body.reason, 300);
        if (decision === 'approve') {
          const job = jfJob(db, claim.jobId);
          const recruiter = db.users.find((u) => u.id === claim.recruiterId);
          if (!recruiter || recruiter.role !== 'employer' || recruiter.demo) { const e = new Error('The claimant is not a real recruiter account'); e.status = 409; throw e; }
          job.employerId = recruiter.id;
          job.jobFinder.employerStatus = 'member';
          job.jobFinder.listingStatus = 'claimed';
          job.jobFinder.claimedAt = Date.now();
          refreshPublic(db, job);
          for (const other of db.jfClaims) if (other.jobId === job.id && other.status === 'pending' && other.id !== claim.id) { other.status = 'rejected'; other.decidedAt = Date.now(); other.reason = 'Another claim was approved'; }
          track(db, 'jf_claim_approved', { demo: false });
        }
        history(db, claim.jobId, s.sub, `claim_${claim.status}`, { recruiterId: claim.recruiterId }, audit);
        return { claim };
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  // ---------- Public job page ----------
  app.get('/api/public/jobs/:id', async (req, res, next) => {
    try {
      const view = await store.transaction((db) => {
        ensureCollections(db);
        const job = db.jobs.find((j) => j.id === req.params.id && isJobFinderJob(j));
        if (!job || ['draft', 'removed'].includes(job.jobFinder.listingStatus) || hiddenFrom(job, session(req)?.sub)) { const e = new Error('This job is not available'); e.status = 404; throw e; }
        internalOf(db, job.id).stats.views += 1;
        if (req.query.notrack !== '1') track(db, 'jf_job_viewed', { demo: false });
        const view = publicJobView(db, job);
        // Full details need a sign-in (founder, 2026-11-25): visitors get a short preview only.
        if (!session(req)) {
          const t = String(view.description || view.fullDescription || '').replace(/\s+/g, ' ').trim();
          view.description = t.length > 300 ? `${t.slice(0, 297).replace(/\s+\S*$/, '')}…` : t;
          delete view.fullDescription; view.responsibilities = []; view.niceToHaves = [];
          view.gated = true;
        }
        return view;
      });
      res.json({ job: view });
    } catch (error) { next(error); }
  });

  app.post('/api/public/jobs/:id/apply-click', async (req, res, next) => {
    try {
      await store.transaction((db) => {
        ensureCollections(db);
        const job = jfJob(db, req.params.id);
        internalOf(db, job.id).stats.applyClicks += 1;
        const s = session(req); const user = s && db.users.find((u) => u.id === s.sub);
        track(db, 'jf_apply_clicked', { demo: involvesDemo(user) });
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.post('/api/jobfinder/jobs/:id/report-closed', limiter, async (req, res, next) => {
    try {
      await store.transaction((db) => {
        ensureCollections(db);
        const user = requireUser(db, req);
        const job = jfJob(db, req.params.id);
        const internal = internalOf(db, job.id);
        internal.reporters = internal.reporters || [];
        if (!internal.reporters.includes(user.id)) { internal.reporters.push(user.id); internal.stats.closedReports += 1; track(db, 'jf_job_reported_closed', { demo: involvesDemo(user) }); }
      });
      res.json({ ok: true, message: 'Thanks: JobFinder will check this listing.' });
    } catch (error) { next(error); }
  });

  // ---------- Recruiter: request to claim (admin/JobFinder review; never automatic) ----------
  app.post('/api/jobfinder/jobs/:id/claim', limiter, async (req, res, next) => {
    try {
      const result = await store.transaction((db) => {
        ensureCollections(db);
        const user = requireUser(db, req, 'employer');
        if (user.demo || isJobFinderUser(user)) { const e = new Error('Demo and JobFinder accounts cannot claim listings'); e.status = 403; throw e; }
        const job = jfJob(db, req.params.id);
        if (job.jobFinder.listingStatus === 'claimed') { const e = new Error('This listing was already claimed'); e.status = 409; throw e; }
        const existing = db.jfClaims.find((c) => c.jobId === job.id && c.recruiterId === user.id && c.status === 'pending');
        if (existing) return { claim: existing, duplicate: true };
        const claim = { id: crypto.randomUUID(), jobId: job.id, recruiterId: user.id, note: str(req.body.note, 600), status: 'pending', createdAt: Date.now() };
        db.jfClaims.push(claim);
        track(db, 'jf_claim_requested', { demo: false });
        history(db, job.id, user.id, 'claim_requested', {}, audit);
        return { claim };
      });
      res.status(201).json(result);
    } catch (error) { next(error); }
  });

  // ---------- Candidate: interest panel, consent, sending ----------
  const outreachView = (o) => (o ? { status: o.status, viaAuto: o.viaAuto === true, submittedAt: o.submittedAt, sentAt: o.sentAt, failedAt: o.failedAt, reason: o.reason, shared: o.shared } : null);

  app.get('/api/jobfinder/jobs/:id/interest', async (req, res, next) => {
    try {
      const db = await store.read();
      ensureCollections(db);
      const user = requireUser(db, req, 'candidate');
      const job = jfJob(db, req.params.id);
      const consent = consentOf(user);
      const share = cleanShare(user, consent);
      const reach = reachabilityOf(db, job);
      const draft = reach === 'email' ? composeMessage({ candidate: user, job, contact: contactOf(db, job.id), share, origin, unsubscribeUrl: '(link)' }) : null;
      res.json({
        job: publicJobView(db, job), reachability: reach,
        liked: db.swipes.some((s) => s.actorId === user.id && s.targetType === 'job' && s.targetId === job.id && s.direction === 'like'),
        outreach: outreachView(db.jfOutreach.find((o) => o.jobId === job.id && o.candidateId === user.id)),
        consent, shareOptions: shareOptions(user), draftBody: draft?.defaultBody || null, mailer: mailerConfigured(),
      });
    } catch (error) { next(error); }
  });

  app.put('/api/jobfinder/consent', async (req, res, next) => {
    try {
      const result = await store.transaction((db) => {
        const user = requireUser(db, req, 'candidate');
        const autoSend = req.body.autoSend === true;
        if (autoSend && req.body.agree !== true) throw new ValidationError('agree', 'Please confirm that a Like will email the recruiter on your behalf');
        const before = consentOf(user);
        const share = cleanShare(user, req.body);
        user.jobFinderConsent = { autoSend, ...share, agreedAt: Date.now(), version: CONSENT_VERSION };
        user.jobFinderConsentLog = [...(user.jobFinderConsentLog || []), { at: Date.now(), autoSend, ...share, version: CONSENT_VERSION }].slice(-20);
        if (before.autoSend !== autoSend) track(db, autoSend ? 'jf_autosend_on' : 'jf_autosend_off', { demo: involvesDemo(user) });
        return { consent: consentOf(user) };
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  /** Send (or retry) the candidate's interest. Phase 1 marks it submitted (duplicate guard), phase 2 sends, phase 3 records. */
  async function performSend({ candidateId, jobId, share: rawShare, body, viaAuto }) {
    const prepared = await store.transaction((db) => {
      ensureCollections(db);
      const user = db.users.find((u) => u.id === candidateId);
      const job = jfJob(db, jobId);
      const liked = db.swipes.some((s) => s.actorId === candidateId && s.targetType === 'job' && s.targetId === jobId && s.direction === 'like');
      if (!liked) { const e = new Error('Like the job first'); e.status = 409; throw e; }
      const contact = contactOf(db, jobId);
      const reach = reachabilityOf(db, job);
      let row = db.jfOutreach.find((o) => o.jobId === jobId && o.candidateId === candidateId);
      if (row && ['submitted', 'sent'].includes(row.status)) return { row: { ...row }, duplicate: true };
      if (reach !== 'email') {
        if (contact?.email && suppressed(db, contact.email)) {
          row = row || { id: crypto.randomUUID(), jobId, candidateId, createdAt: Date.now(), attempts: 0 };
          if (!db.jfOutreach.includes(row)) db.jfOutreach.push(row);
          Object.assign(row, { status: 'suppressed', reason: 'This employer asked not to receive emails through JobsMatchNow.' });
          return { row: { ...row }, skip: true };
        }
        const e = new Error('Recruiter contact not yet available'); e.status = 409; throw e;
      }
      const dayAgo = Date.now() - DAY; const weekAgo = Date.now() - 7 * DAY;
      const sentToday = db.jfOutreach.filter((o) => o.candidateId === candidateId && (o.submittedAt || 0) > dayAgo && ['submitted', 'sent'].includes(o.status)).length;
      if (sentToday >= maxPerDay()) { const e = new Error(`You can send up to ${maxPerDay()} messages a day. Try again tomorrow.`); e.status = 429; throw e; }
      const recipientHash = hashEmail(contact.email);
      const toRecipient = db.jfOutreach.filter((o) => o.recipientHash === recipientHash && (o.submittedAt || 0) > weekAgo && ['submitted', 'sent'].includes(o.status)).length;
      if (toRecipient >= maxPerRecipientWeek()) { const e = new Error('This recruiter has received several candidate messages this week. Your Like is saved; please try again in a few days.'); e.status = 429; throw e; }
      const share = cleanShare(user, rawShare);
      const msg = composeMessage({ candidate: user, job, contact, share, body, origin, unsubscribeUrl: unsubscribeUrl(contact.email) });
      row = row || { id: crypto.randomUUID(), jobId, candidateId, createdAt: Date.now(), attempts: 0 };
      if (!db.jfOutreach.includes(row)) db.jfOutreach.push(row);
      Object.assign(row, { status: 'submitted', submittedAt: Date.now(), attempts: (row.attempts || 0) + 1, shared: { name: true, skills: share.skills, profileLink: share.profileLink, replyEmail: share.replyEmail }, viaAuto: viaAuto === true, recipientHash, reason: undefined });
      track(db, 'jf_consent_given', { demo: involvesDemo(user, job) });
      track(db, 'jf_message_submitted', { demo: involvesDemo(user, job) });
      return { row: { ...row }, mail: { to: contact.email, subject: msg.subject, text: msg.text, replyTo: share.replyEmail ? user.email : undefined }, demo: involvesDemo(user, job) };
    });
    if (prepared.duplicate || prepared.skip) return prepared.row;
    let outcome;
    if (!mailerConfigured()) outcome = { status: 'not_sent', reason: 'Email sending is not set up yet, so nothing was sent.' };
    else {
      try { const info = await sendMail(prepared.mail); outcome = info?.delivered ? { status: 'sent', providerId: info.messageId } : { status: 'not_sent', reason: 'Email sending is not set up yet, so nothing was sent.' }; }
      catch (err) { outcome = { status: 'failed', reason: 'The email could not be sent. You can try again.', error: String(err?.code || err?.responseCode || 'send_error').slice(0, 40) }; }
    }
    return store.transaction((db) => {
      const row = db.jfOutreach.find((o) => o.id === prepared.row.id);
      Object.assign(row, outcome, outcome.status === 'sent' ? { sentAt: Date.now() } : { failedAt: Date.now() });
      track(db, outcome.status === 'sent' ? 'jf_message_sent' : 'jf_message_failed', { demo: prepared.demo });
      return { ...row };
    });
  }
  ctx.performSend = performSend;

  app.post('/api/jobfinder/jobs/:id/send', limiter, async (req, res, next) => {
    try {
      const db = await store.read();
      const user = requireUser(db, req, 'candidate');
      if (req.body.consent !== true) throw new ValidationError('consent', 'Please confirm that JobsMatchNow may send this message on your behalf');
      const row = await performSend({ candidateId: user.id, jobId: req.params.id, share: req.body.share, body: req.body.body, viaAuto: false });
      res.json({ outreach: outreachView(row) });
    } catch (error) { next(error); }
  });

  // One-click unsubscribe for recruiters (signed link in every email). Stores only a hash of the address.
  app.get('/api/jobfinder/unsubscribe', async (req, res, next) => {
    try {
      const h = String(req.query.e || ''); const sig = String(req.query.s || '');
      const ok = /^[0-9a-f]{64}$/.test(h) && sig === sign(h);
      if (ok) await store.transaction((db) => {
        ensureCollections(db);
        if (!db.jfSuppress.some((x) => x.hash === h)) db.jfSuppress.push({ id: h, hash: h, at: Date.now(), reason: 'recipient request' });
        for (const job of db.jobs.filter(isJobFinderJob)) refreshPublic(db, job);
      });
      res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>JobsMatchNow</title><body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.5"><h1>${ok ? 'You are unsubscribed' : 'Link not valid'}</h1><p>${ok ? 'JobsMatchNow will not send you more candidate emails about job listings.' : 'This unsubscribe link is not valid. Reply to the email you received and we will remove you by hand.'}</p></body>`);
    } catch (error) { next(error); }
  });
}

/** After a candidate likes a JobFinder job (called from /api/swipes): count it, and auto-send only with the
 *  candidate's one-click preference and an approved contact. Returns what the client needs to show next. */
export async function afterJobFinderLike(ctx, { candidateId, jobId }) {
  const { store, track } = ctx;
  const info = await store.transaction((db) => {
    ensureCollections(db);
    const user = db.users.find((u) => u.id === candidateId); const job = db.jobs.find((j) => j.id === jobId);
    if (!user || !job || !isJobFinderJob(job)) return null;
    track(db, 'jf_job_liked', { demo: involvesDemo(user, job) });
    const consent = consentOf(user);
    return { reachability: reachabilityOf(db, job), autoSend: consent.autoSend, consent, applyUrl: job.jobFinder.applyUrl };
  });
  if (!info) return null;
  let outreach = null;
  if (info.reachability === 'email' && info.autoSend) {
    try { outreach = await ctx.performSend({ candidateId, jobId, share: info.consent, viaAuto: true }); } catch (e) { outreach = { status: 'failed', reason: e.message }; }
  }
  return { jobId, reachability: info.reachability, applyUrl: info.applyUrl || null, autoSend: info.autoSend, outreach: outreach ? { status: outreach.status, reason: outreach.reason, viaAuto: true } : null };
}
