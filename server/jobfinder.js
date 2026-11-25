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
import { applyJob } from './jobs.js';
import { ValidationError } from './matching.js';
import { involvesDemo } from './analytics.js';
import { assignGroups } from './groups.js';

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
  const { store, authSession, track, audit, sendMail, mailerConfigured, origin, secret, limiter } = ctx;
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
        };
      });
      const sort = String(f.sort || 'created');
      rows.sort((a, b) => (sort === 'likes' ? b.likes - a.likes || b.emails.sent - a.emails.sent : sort === 'checked' ? String(a.jobFinder.lastCheckedAt || '').localeCompare(String(b.jobFinder.lastCheckedAt || '')) : (b.createdAt || 0) - (a.createdAt || 0)));
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
        db.jobs.push(job);
        refreshPublic(db, job);
        history(db, job.id, s.sub, 'created', { listingStatus }, audit);
        return { job, duplicates: findDuplicates(db, job) };
      });
      res.status(201).json(result);
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
        if (!job || ['draft', 'removed'].includes(job.jobFinder.listingStatus)) { const e = new Error('This job is not available'); e.status = 404; throw e; }
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
