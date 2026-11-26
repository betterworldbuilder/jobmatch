/**
 * External roles (founder, 2026-11-26): every role of the JobFinder account is an outside job whose recruiter is not
 * on JobsMatchNow yet. Until that recruiter registers / claims the role:
 *  - the hiring company is NOT revealed: name → "Confidential company", no logo, no company page, and the company name
 *    is blanked in the job text;
 *  - nothing sends candidates away: no source site, no original posting link, no "apply on the original site";
 *  - the recruiter's name and contacts stay private.
 * The JobFinder account (owner) and admins see everything. Same rule everywhere a candidate or visitor sees a role.
 */
import { isJobFinderUser } from './jobfinder.js';

export const CONFIDENTIAL = 'Confidential company';

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "Acme Solutions Ltd" → also hide "Acme Solutions" and "Acme" when long enough to be meaningful. */
function nameVariants(company) {
  const c = String(company || '').trim();
  if (c.length < 2) return [];
  const base = c.replace(/\b(ltd|limited|llc|inc|corp|corporation|co|company|gmbh|sas|sarl|pte|plc|jsc|group|holdings?|vietnam|viet nam)\b\.?/gi, '').replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  const first = base.split(' ')[0] || '';
  return [...new Set([c, base, first.length >= 5 ? first : ''].filter((x) => x && x.length >= 3))].sort((a, b) => b.length - a.length);
}
export function blankCompany(text, company) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const v of nameVariants(company)) out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${esc(v)}(?=[^\\p{L}\\p{N}]|$)`, 'giu'), '$1the company');
  return out;
}

/** Is this role external (JobFinder account) and still unclaimed? */
export function isExternal(db, job) {
  const owner = (db.users || []).find((u) => u.id === job?.employerId);
  return Boolean(job) && isJobFinderUser(owner);
}

/** The role as a candidate / visitor sees it while external. `viewerId` = owner → unchanged. */
export function hideExternalCompany(db, job, viewerId, viewerRole) {
  if (!job || !isExternal(db, job) || viewerId === job.employerId || viewerRole === 'admin') return job;
  const company = job.company;
  const recruiterName = String(job.recruiterName || job.recruiter?.name || '').trim();
  const blank = (t) => {
    let s = blankCompany(t, company);
    if (typeof s === 'string' && recruiterName.length >= 3) s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${esc(recruiterName)}(?=[^\\p{L}\\p{N}]|$)`, 'giu'), '$1the recruiter');
    return s;
  };
  const out = { ...job, company: CONFIDENTIAL, logo: '•', companyLogo: undefined, companyProfile: undefined, recruiter: undefined,
    recruiterName: undefined, recruiterTitle: undefined, externalUrl: undefined, sourceUrl: undefined, applyUrl: undefined, companyHidden: true };
  for (const k of ['description', 'fullDescription', 'mission', 'title']) if (typeof out[k] === 'string') out[k] = blank(out[k]);
  for (const k of ['responsibilities', 'benefits', 'culture', 'niceToHaves']) if (Array.isArray(out[k])) out[k] = out[k].map((x) => blank(x));
  if (Array.isArray(out.screeningQuestions)) out.screeningQuestions = out.screeningQuestions.map((q) => (q && typeof q === 'object' && typeof q.question === 'string' ? { ...q, question: blank(q.question) } : q));
  if (out.jobFinder) {
    const { source: _s, sourceUrl: _u, applyUrl: _a, ...rest } = out.jobFinder;
    // "apply" reachability meant "apply on the original site": not offered any more; the recruiter is contacted by us.
    out.jobFinder = { ...rest, reachability: rest.reachability === 'apply' ? 'none' : rest.reachability };
  }
  return out;
}
