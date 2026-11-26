/**
 * Interest emails for the imported external roles owned by the JobFinder account (founder, 2026-11-25): when a real
 * candidate likes / applies to such a role and it has a private recruiter email, JobsMatchNow ("JobMatcher") emails
 * the recruiter with the founder's template: the job posting URL (LinkedIn, else the role's JobsMatchNow page) and the
 * candidate's public profile link (jobsmatchnow.com/firstname.lastname).
 *
 * Consent: only when the candidate's public profile is on (default on, they can turn it off; the role page tells them
 * that applying sends their link). No email, phone or files are shared. Replies go to the relay address. One email per
 * candidate per role; a weekly cap per recipient; demo/sample accounts never send; signed one-click unsubscribe shared
 * with the JobFinder opt-out list (jfSuppress).
 */
import crypto from 'node:crypto';
import { ensureCollections, hashEmail, isJobFinderJob, isJobFinderUser } from './jobfinder.js';
import { mailerConfigured, sendMail } from './mailer.js';
import { assignProfileSlug, rolePath } from './public-urls.js';

export const RELAY_EMAIL = process.env.CANDIDATE_RELAY_EMAIL || 'Greatcandidates@jobsmatchnow.com';
const maxPerRecipientWeek = () => Number(process.env.ROLE_INTEREST_MAX_PER_WEEK || 20);
const WEEK = 7 * 24 * 3600 * 1000;

export const FROM_NAME = 'JobMatcher at JobsMatchNow';

/**
 * The email sent to the recruiter: the founder's template (2026-11-25), word for word, plus the legally needed
 * unsubscribe line. Job link: the LinkedIn/original posting URL, else the role's JobsMatchNow page.
 */
export function interestEmail({ job, candidate, origin, unsubscribeUrl, profileUrl, roleUrl, claimLink }) {
  const first = String(job.recruiterName || '').trim().split(/\s+/)[0];
  const posting = job.externalUrl || job.sourceUrl || job.jobFinder?.sourceUrl || roleUrl;
  const text = [
    `Hello ${first || 'Hiring Team'},`,
    '',
    `We’ve found a candidate who believes their skills and experience are a great fit for your ${job.title} role${job.company ? ` at ${job.company}` : ''}.`,
    '',
    `Your job posting: ${posting}`,
    `Candidate profile: ${profileUrl}`,
    // Stage 1 (2026-11-26, behind ROLE_CLAIM_LINKS): one click to every applicant and to claiming the role.
    ...(claimLink ? [`See all candidates for this role and reply (free): ${claimLink}`] : []),
    '',
    'The candidate is interested in connecting with you. Feel free to review their profile and connect with them on JobsMatchNow.',
    '',
    `Not a member yet? Join us at ${origin}/app/`,
    '',
    'Best regards,',
    'JobMatcher',
    'JobsMatchNow',
    '',
    'Sent at the candidate’s request through JobsMatchNow.',
    `Don’t want these emails? ${unsubscribeUrl}`,
  ].join('\n');
  return { subject: `A candidate is interested in your ${job.title} role`, text, candidateFirst: String(candidate?.name || '').split(' ')[0] };
}

export function mountRoleInterest(app, { store, secret }) {
  const sign = (h) => crypto.createHmac('sha256', secret()).update(`role-interest:${h}`).digest('hex').slice(0, 32);
  const ctx = {
    unsubscribeUrl: (origin, email) => { const h = hashEmail(email); return `${origin}/api/role-interest/unsubscribe?e=${h}&s=${sign(h)}`; },
  };
  app.get('/api/role-interest/unsubscribe', async (req, res, next) => {
    try {
      const h = String(req.query.e || ''); const sig = String(req.query.s || '');
      const ok = /^[0-9a-f]{64}$/.test(h) && sig === sign(h);
      if (ok) await store.transaction((db) => { ensureCollections(db); if (!db.jfSuppress.some((x) => x.hash === h)) db.jfSuppress.push({ id: h, hash: h, at: Date.now(), reason: 'recipient request' }); });
      res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>JobsMatchNow</title><body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.5"><h1>${ok ? 'You are unsubscribed' : 'Link not valid'}</h1><p>${ok ? 'JobsMatchNow will not send you more candidate emails.' : `This link is not valid. Write to ${RELAY_EMAIL} and we will remove you by hand.`}</p></body>`);
    } catch (error) { next(error); }
  });
  return ctx;
}

/** After a candidate likes a role: email the recruiter when the rules allow. Never throws; returns a status or null. */
export async function afterRoleInterest(ctx, { candidateId, jobId }) {
  const { store, origin, contactOf, scoreCandidateForJob } = ctx;
  const prepared = await store.transaction((db) => {
    ensureCollections(db);
    const job = db.jobs.find((j) => j.id === jobId);
    const candidate = db.users.find((u) => u.id === candidateId);
    // Imported JobFinder listings are included too (founder, 2026-11-26, option B): their recruiter email found in the
    // job text gets the same email. Not twice: if JobFinder's consent-based email already went for this candidate and
    // role, this one is skipped.
    if (!job || !candidate || candidate.role !== 'candidate' || candidate.demo || candidate.sample || job.demo) return null;
    if (isJobFinderJob(job) && (db.jfOutreach || []).some((o) => o.jobId === jobId && o.candidateId === candidateId && ['sent', 'submitted'].includes(o.status))) return { skip: 'already_sent_by_jobfinder' };
    const owner = db.users.find((u) => u.id === job.employerId);
    if (!isJobFinderUser(owner)) return null;
    const email = contactOf(db, jobId)?.email;
    if (!email) return null;
    if (!Array.isArray(db.roleInterestMails)) db.roleInterestMails = [];
    if (db.roleInterestMails.some((m) => m.jobId === jobId && m.candidateId === candidateId)) return { skip: 'duplicate' };
    const recipientHash = hashEmail(email);
    const row = { id: crypto.randomUUID(), jobId, candidateId, recipientHash, createdAt: Date.now() };
    db.roleInterestMails.push(row);
    if (db.jfSuppress.some((x) => x.hash === recipientHash)) { row.status = 'suppressed'; return { skip: 'suppressed' }; }
    const recent = db.roleInterestMails.filter((m) => m.recipientHash === recipientHash && m.status === 'sent' && m.createdAt > Date.now() - WEEK).length;
    if (recent >= maxPerRecipientWeek()) { row.status = 'capped'; return { skip: 'capped' }; }
    // The candidate's profile link goes out only if their public profile is on (their approval).
    if (candidate.publicProfile === false) { row.status = 'no_consent'; return { skip: 'no_consent' }; }
    const slug = assignProfileSlug(db, candidate);
    row.status = 'submitted';
    const msg = interestEmail({ job, candidate, origin, unsubscribeUrl: ctx.unsubscribeUrl(origin, email), profileUrl: `${origin}/${slug}`, roleUrl: `${origin}${rolePath(job)}`, claimLink: ctx.claimLink?.(job.id, email) || null });
    return { rowId: row.id, mail: { to: email, replyTo: RELAY_EMAIL, fromName: FROM_NAME, subject: msg.subject, text: msg.text } };
  }).catch(() => null);
  if (!prepared || prepared.skip) return prepared ? { status: prepared.skip } : null;
  let status = 'not_sent';
  if (mailerConfigured()) {
    try { const info = await ctx.send(prepared.mail); status = info?.delivered ? 'sent' : 'not_sent'; } catch { status = 'failed'; }
  }
  await store.transaction((db) => { const row = (db.roleInterestMails || []).find((m) => m.id === prepared.rowId); if (row) Object.assign(row, { status, sentAt: status === 'sent' ? Date.now() : undefined }); }).catch(() => {});
  return { status };
}

export const defaultSend = (mail) => sendMail(mail);
