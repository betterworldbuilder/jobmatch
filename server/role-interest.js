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
import { isTester, isTestRoleFor } from './test-roles.js';

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
    if (!job || !candidate || candidate.role !== 'candidate' || candidate.demo || candidate.sample || job.demo) return null;
    // A tester account only ever emails about its own test roles (never a real recruiter).
    if (isTester(candidate) && !isTestRoleFor(job, candidate.id)) return null;
    // THE RULE (founder, 2026-11-26): every role managed by the JobFinder account sends this cold email to its
    // recruiter; roles of any other recruiter account never do.
    const owner = db.users.find((u) => u.id === job.employerId);
    if (!isJobFinderUser(owner)) return null;
    // Not twice: skipped if JobFinder's consent-based email already went for this candidate and role.
    if ((db.jfOutreach || []).some((o) => o.jobId === jobId && o.candidateId === candidateId && ['sent', 'submitted'].includes(o.status))) return { skip: 'already_sent_by_jobfinder' };
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
    // ?v=<row id>: when the recruiter opens the profile from this email, the candidate sees "Application viewed".
    const msg = interestEmail({ job, candidate, origin, unsubscribeUrl: ctx.unsubscribeUrl(origin, email), profileUrl: `${origin}/${slug}?v=${row.id}`, roleUrl: `${origin}${rolePath(job)}`, claimLink: ctx.claimLink?.(job.id, email) || null });
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

// ---------- Follow-up 24 h after a cold email with no claim (founder, 2026-11-26) ----------
export const FOLLOWUP_AFTER_MS = Number(process.env.ROLE_FOLLOWUP_AFTER_H || 24) * 3600 * 1000;

/** The follow-up: founder's template style. `newCount` = candidates who applied after the first email. */
export function followupEmail({ job, newCount, waiting, origin, unsubscribeUrl, roleUrl, claimLink }) {
  const first = String(job.recruiterName || '').trim().split(/\s+/)[0];
  const posting = job.externalUrl || job.sourceUrl || job.jobFinder?.sourceUrl || roleUrl;
  const headline = newCount > 0
    ? `${newCount} more candidate${newCount === 1 ? '' : 's'} applied to your ${job.title} role${job.company ? ` at ${job.company}` : ''} since our last email.`
    : `${waiting > 1 ? `${waiting} candidates are` : 'A candidate is'} still waiting for your answer on your ${job.title} role${job.company ? ` at ${job.company}` : ''}.`;
  const text = [
    `Hello ${first || 'Hiring Team'},`, '', headline, '',
    `Your job posting: ${posting}`,
    ...(claimLink ? [`See all candidates for this role and reply (free): ${claimLink}`] : [`See the role: ${roleUrl}`]),
    '', 'Candidates on JobsMatchNow expect an answer within 48 hours: a quick yes or no helps them a lot.', '',
    `Not a member yet? Join us at ${origin}/app/`, '', 'Best regards,', 'JobMatcher', 'JobsMatchNow', '',
    'Sent because candidates applied to your role through JobsMatchNow.', `Don’t want these emails? ${unsubscribeUrl}`,
  ].join('\n');
  const subject = newCount > 0 ? `${newCount} more candidate${newCount === 1 ? '' : 's'} applied to your ${job.title} role` : `Candidates are waiting for your answer: ${job.title}`;
  return { subject, text };
}

/**
 * One follow-up per role and recipient, 24 h after the first cold email that sent, when the role is still not claimed
 * (still owned by the JobFinder account). Same limits as the cold email: suppression list, weekly cap per recipient.
 */
export async function runFollowups(ctx, { now = Date.now() } = {}) {
  const { store, origin, contactOf } = ctx;
  const due = await store.transaction((db) => {
    ensureCollections(db);
    if (!Array.isArray(db.roleFollowups)) db.roleFollowups = [];
    const out = [];
    const firsts = new Map();
    for (const m of db.roleInterestMails || []) {
      if (m.status !== 'sent' || !m.sentAt) continue;
      const k = `${m.jobId}|${m.recipientHash}`;
      if (!firsts.has(k) || m.sentAt < firsts.get(k).sentAt) firsts.set(k, m);
    }
    for (const [k, m] of firsts) {
      if (now - m.sentAt < FOLLOWUP_AFTER_MS || db.roleFollowups.some((f) => `${f.jobId}|${f.recipientHash}` === k)) continue;
      const job = db.jobs.find((j) => j.id === m.jobId);
      const owner = job && db.users.find((u) => u.id === job.employerId);
      const email = job && contactOf(db, job.id)?.email;
      const row = { id: crypto.randomUUID(), jobId: m.jobId, recipientHash: m.recipientHash, createdAt: now };
      db.roleFollowups.push(row);
      if (!job || !isJobFinderUser(owner) || !email || hashEmail(email) !== m.recipientHash) { row.status = 'skipped'; continue; } // claimed or contact changed
      if (db.jfSuppress.some((x) => x.hash === m.recipientHash)) { row.status = 'suppressed'; continue; }
      const sentWeek = (db.roleInterestMails || []).filter((x) => x.recipientHash === m.recipientHash && x.status === 'sent' && x.sentAt > now - WEEK).length
        + db.roleFollowups.filter((x) => x.recipientHash === m.recipientHash && x.status === 'sent' && x.sentAt > now - WEEK).length;
      if (sentWeek >= maxPerRecipientWeek()) { row.status = 'capped'; continue; }
      const likes = (db.swipes || []).filter((s) => s.targetType === 'job' && s.targetId === job.id && s.direction === 'like' && db.users.some((u) => u.id === s.actorId && u.role === 'candidate' && !u.demo && !u.sample));
      const newCount = likes.filter((s) => (s.createdAt || 0) > m.sentAt).length;
      row.status = 'submitted';
      const msg = followupEmail({ job, newCount, waiting: likes.length, origin, unsubscribeUrl: ctx.unsubscribeUrl(origin, email), roleUrl: `${origin}${rolePath(job)}`, claimLink: ctx.claimLink?.(job.id, email) || null });
      out.push({ rowId: row.id, mail: { to: email, replyTo: RELAY_EMAIL, fromName: FROM_NAME, subject: msg.subject, text: msg.text } });
    }
    return out;
  }).catch(() => []);
  let sent = 0;
  for (const d of due) {
    let status = 'not_sent';
    if ((ctx.mailerConfigured || mailerConfigured)()) { try { const info = await ctx.send(d.mail); status = info?.delivered ? 'sent' : 'not_sent'; } catch { status = 'failed'; } }
    if (status === 'sent') sent += 1;
    await store.transaction((db) => { const r = (db.roleFollowups || []).find((x) => x.id === d.rowId); if (r) Object.assign(r, { status, sentAt: status === 'sent' ? Date.now() : undefined }); }).catch(() => {});
  }
  return { due: due.length, sent };
}

/** The recruiter opened the candidate's profile from the email (?v=<row id>) → the candidate sees "Application viewed". */
export function markViewedByRow(db, rowId, candidateId) {
  const row = (db.roleInterestMails || []).find((m) => m.id === rowId && m.candidateId === candidateId);
  if (row && !row.viewedAt) { row.viewedAt = Date.now(); return true; }
  return false;
}
/** The recruiter opened the claim page (it lists the applicants) → every applicant of that role was viewed. */
export function markViewedForJob(db, jobId) {
  let n = 0;
  for (const m of db.roleInterestMails || []) if (m.jobId === jobId && m.status === 'sent' && !m.viewedAt) { m.viewedAt = Date.now(); n += 1; }
  return n;
}

/** What a candidate sees for one application (Jobs Applied): contacted → viewed → answer expected in 48 h. */
export function trackerFor(db, jobId, candidateId) {
  const m = (db.roleInterestMails || []).find((x) => x.jobId === jobId && x.candidateId === candidateId);
  if (!m) return null;
  if (m.status === 'no_consent') return { state: 'no_consent' };
  if (m.status !== 'sent') return { state: 'pending' };
  return { state: m.viewedAt ? 'viewed' : 'contacted', contactedAt: m.sentAt, viewedAt: m.viewedAt || undefined, answerBy: m.viewedAt ? m.viewedAt + 48 * 3600 * 1000 : undefined };
}
