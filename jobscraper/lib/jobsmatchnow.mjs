/**
 * Optional connector: send saved jobs to a JobsMatchNow account as JobFinder listing DRAFTS.
 *
 * - Uses JobsMatchNow's own public API (POST /api/auth/login, GET/POST /api/jobfinder/jobs) like the web app does.
 * - The password is sent once to JobsMatchNow and never stored. The session cookie lives only in this process's
 *   memory (gone on restart or "Sign out") and is never written to disk or logs.
 * - Only the JobFinder account (or an admin) can create listings; JobsMatchNow enforces that.
 * - Every job goes in as a draft: the owner reviews and publishes in JobsMatchNow. Jobs whose source link is already
 *   listed are skipped, so sending twice never creates duplicates.
 */
const DEFAULT_BASE = process.env.JOBSMATCHNOW_URL || 'https://jobsmatchnow.com';
let session = null; // { base, cookie, user: { id, name, email }, at }

// Test hook: replace fetch.
let fetchImpl = (...a) => fetch(...a);
export function __setJmnFetch(fn) { fetchImpl = fn || ((...a) => fetch(...a)); }

export function cleanBase(raw) {
  let u;
  try { u = new URL(String(raw || DEFAULT_BASE).trim()); } catch { const e = new Error('Enter the JobsMatchNow address, e.g. https://jobsmatchnow.com'); e.status = 400; throw e; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) { const e = new Error('Use https:// (http:// only for a local copy)'); e.status = 400; throw e; }
  if (u.username || u.password) { const e = new Error('No user name or password in the address'); e.status = 400; throw e; }
  return u.origin; // the API lives at <origin>/api/…
}

async function call(path, { method = 'GET', body, base = session?.base, cookie = session?.cookie } = {}) {
  const res = await fetchImpl(`${base}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {}; try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data, res };
}

export const status = () => (session ? { signedIn: true, base: session.base, user: session.user, at: session.at } : { signedIn: false, base: cleanBase(DEFAULT_BASE) });
export function signOut() { session = null; return status(); }

export async function signIn({ base, email, password }) {
  const b = cleanBase(base);
  if (!email || !password) { const e = new Error('Enter your JobsMatchNow email and password'); e.status = 400; throw e; }
  const r = await call('/api/auth/login', { method: 'POST', body: { email: String(email).trim(), password: String(password) }, base: b, cookie: null });
  if (r.status !== 200) { const e = new Error(r.data.error || `JobsMatchNow answered ${r.status}`); e.status = r.status === 429 ? 429 : 401; throw e; }
  const set = typeof r.res.headers.getSetCookie === 'function' ? r.res.headers.getSetCookie() : [r.res.headers.get('set-cookie') || ''];
  const cookie = set.map((c) => c.split(';')[0]).find((c) => c.startsWith('jm_auth='));
  if (!cookie) { const e = new Error('JobsMatchNow did not open a session'); e.status = 502; throw e; }
  // Only the JobFinder account (or an admin) can list external jobs: check before anything is sent.
  const check = await call('/api/jobfinder/jobs', { base: b, cookie });
  if (check.status !== 200) { const e = new Error(check.data.error || 'This account cannot manage JobFinder listings'); e.status = 403; throw e; }
  const u = r.data.user || {};
  session = { base: b, cookie, user: { id: u.id, name: u.name, email: u.email }, at: new Date().toISOString() };
  return status();
}

const WORK_MODES = ['Remote', 'Hybrid', 'On-site', 'Flexible'];
const TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
const LEVELS = ['junior', 'mid', 'senior', 'lead', 'exec'];
const has = (v) => !(v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length));

/** A saved job → the body of POST /api/jobfinder/jobs (a draft). Only fields the job states are sent. */
export function toListing(job) {
  const src = job.source || {};
  const body = {
    title: job.title, company: job.company, location: job.location, country: job.country,
    workMode: WORK_MODES.includes(job.workMode) ? job.workMode : undefined, type: TYPES.includes(job.type) ? job.type : undefined,
    seniority: LEVELS.includes(job.seniority) ? job.seniority : undefined,
    department: job.department, openings: job.openings, urgency: job.urgency, contractDuration: job.contractDuration, startDate: job.startDate,
    hiringRadiusKm: job.hiringRadiusKm, workVisaRequired: job.workVisaRequired,
    description: job.description, fullDescription: job.fullDescription,
    requiredSkillsDetail: (job.requiredSkillsDetail || []).filter((s) => s?.name).map((s) => ({ name: String(s.name).slice(0, 60), weight: [1, 2, 3].includes(s.weight) ? s.weight : 2 })),
    niceToHaves: job.niceToHaves, requiredLanguages: job.requiredLanguages, responsibilities: job.responsibilities, benefits: job.benefits,
    salaryRange: job.salaryRange && job.salaryRange.min > 0 && job.salaryRange.max >= job.salaryRange.min && job.salaryRange.currency ? { min: job.salaryRange.min, max: job.salaryRange.max, currency: job.salaryRange.currency } : undefined,
    salaryNegotiable: job.salaryNegotiable, bonus: job.bonus, equity: job.equity, workingHours: job.workingHours, flexibleHours: job.flexibleHours,
    probation: job.probation, travel: job.travel, hybridDays: job.hybridDays, visaSponsorship: job.visaSponsorship, relocationSupport: job.relocationSupport, onCall: job.onCall,
    sourceName: src.name || undefined, sourceUrl: src.url || job.externalUrl || undefined, applyUrl: src.url || job.externalUrl || undefined,
    closingDate: job.deadline || undefined, jobGroups: job.jobGroups || [], listingStatus: 'draft',
  };
  return Object.fromEntries(Object.entries(body).filter(([, v]) => has(v) || v === false));
}

/** Send jobs one by one. Returns one result per job: created / skipped / failed (with the reason). */
export async function sendJobs(jobs) {
  if (!session) { const e = new Error('Sign in to JobsMatchNow first'); e.status = 401; throw e; }
  const list = await call('/api/jobfinder/jobs');
  if (list.status === 401 || list.status === 403) { session = null; const e = new Error('Your JobsMatchNow session ended: sign in again'); e.status = 401; throw e; }
  const known = new Map((list.data.jobs || []).filter((j) => j.jobFinder?.sourceUrl).map((j) => [j.jobFinder.sourceUrl, j]));
  const results = [];
  for (const job of jobs) {
    const body = toListing(job);
    if (!body.title || !body.company) { results.push({ id: job.id, title: job.title, status: 'failed', reason: !body.title ? 'No job title' : 'No company: add it, then send again' }); continue; }
    const dup = body.sourceUrl && known.get(body.sourceUrl);
    if (dup) { results.push({ id: job.id, title: job.title, status: 'skipped', reason: `Already in JobsMatchNow (${dup.jobFinder.listingStatus})`, remoteId: dup.id }); continue; }
    const r = await call('/api/jobfinder/jobs', { method: 'POST', body });
    if (r.status === 201) {
      results.push({ id: job.id, title: job.title, status: 'created', remoteId: r.data.job?.id, duplicates: (r.data.duplicates || []).length });
      if (body.sourceUrl) known.set(body.sourceUrl, { id: r.data.job?.id, jobFinder: { listingStatus: 'draft' } });
    } else {
      results.push({ id: job.id, title: job.title, status: 'failed', reason: r.data.error || `JobsMatchNow answered ${r.status}` });
      if (r.status === 401 || r.status === 403) { session = null; break; }
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  return { base: session?.base || null, results };
}
