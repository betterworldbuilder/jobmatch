/**
 * Outreach dashboard + recruiter contact book for the JobFinder account (founder, 2026-11-26).
 * Per role: applicants → cold emails sent → follow-up → viewed / opened → claimed → recruiter answered (matches).
 * Per recruiter (one email = one recruiter): their roles, applicants, emails, opens, claims, unsubscribed.
 * "Hot" = the recruiter opened (claim page or a candidate profile) but has not claimed yet: the people to call.
 * Real candidates only (no demo / sample). Read-only.
 */
import { hashEmail, isJobFinderUser } from './jobfinder.js';

export function outreachReport(db, { contactOf }) {
  const users = new Map((db.users || []).map((u) => [u.id, u]));
  const real = (id) => { const u = users.get(id); return Boolean(u) && u.role === 'candidate' && !u.demo && !u.sample && !u.tester; };
  const jf = new Set((db.users || []).filter((u) => isJobFinderUser(u)).map((u) => u.id));
  const suppressed = new Set((db.jfSuppress || []).map((s) => s.hash));
  const mails = db.roleInterestMails || []; const follows = db.roleFollowups || []; const claims = db.claimEvents || [];
  const roles = [];
  for (const job of db.jobs || []) {
    const ours = jf.has(job.employerId) || jf.has(job.claimedFromId);
    if (!ours || job.demo || job.sample) continue;
    const email = contactOf(db, job.id)?.email || '';
    const m = mails.filter((x) => x.jobId === job.id);
    const applicants = new Set((db.swipes || []).filter((s) => s.targetType === 'job' && s.targetId === job.id && s.direction === 'like' && real(s.actorId)).map((s) => s.actorId)).size;
    if (!applicants && !email && !m.length) continue;
    const sent = m.filter((x) => x.status === 'sent');
    const opens = claims.filter((c) => c.jobId === job.id && c.type === 'view').length;
    const viewed = sent.filter((x) => x.viewedAt).length;
    const claimed = Boolean(job.claimedAt) || claims.some((c) => c.jobId === job.id && c.type === 'claim');
    const answered = (db.matches || []).filter((x) => x.jobId === job.id && real(x.candidateId)).length;
    const followup = follows.find((f) => f.jobId === job.id && f.status === 'sent');
    roles.push({
      id: job.id, title: job.title, company: job.company, location: job.location, live: String(job.status) === 'active',
      recruiterName: job.recruiterName || '', recruiterEmail: email, unsubscribed: email ? suppressed.has(hashEmail(email)) : false,
      applicants, coldSent: sent.length, lastSentAt: Math.max(0, ...sent.map((x) => x.sentAt || 0)) || null,
      followupSentAt: followup?.sentAt || null, opens, viewed, claimed, answered,
      hot: (opens > 0 || viewed > 0) && !claimed,
      notSent: m.filter((x) => ['capped', 'suppressed', 'not_sent', 'failed', 'no_consent'].includes(x.status)).length,
    });
  }
  roles.sort((a, b) => Number(b.hot) - Number(a.hot) || b.applicants - a.applicants || (b.lastSentAt || 0) - (a.lastSentAt || 0));
  const book = new Map();
  for (const r of roles) {
    if (!r.recruiterEmail) continue;
    const k = r.recruiterEmail.trim().toLowerCase();
    if (!book.has(k)) book.set(k, { email: r.recruiterEmail, names: new Set(), companies: new Set(), roles: [], applicants: 0, coldSent: 0, followups: 0, opens: 0, viewed: 0, claimed: 0, answered: 0, lastSentAt: null, unsubscribed: r.unsubscribed });
    const b = book.get(k);
    if (r.recruiterName) b.names.add(r.recruiterName);
    if (r.company) b.companies.add(r.company);
    b.roles.push({ id: r.id, title: r.title, claimed: r.claimed });
    b.applicants += r.applicants; b.coldSent += r.coldSent; b.followups += r.followupSentAt ? 1 : 0; b.opens += r.opens; b.viewed += r.viewed;
    b.claimed += r.claimed ? 1 : 0; b.answered += r.answered; b.lastSentAt = Math.max(b.lastSentAt || 0, r.lastSentAt || 0) || null;
  }
  const recruiters = [...book.values()].map((b) => ({ ...b, names: [...b.names], companies: [...b.companies], hot: (b.opens > 0 || b.viewed > 0) && b.claimed < b.roles.length }))
    .sort((a, b) => Number(b.hot) - Number(a.hot) || b.applicants - a.applicants);
  const sum = (k) => roles.reduce((a, r) => a + (typeof r[k] === 'boolean' ? Number(r[k]) : r[k] || 0), 0);
  return {
    totals: { roles: roles.length, withEmail: roles.filter((r) => r.recruiterEmail).length, applicants: sum('applicants'), coldSent: sum('coldSent'),
      followups: roles.filter((r) => r.followupSentAt).length, opened: roles.filter((r) => r.opens || r.viewed).length, claimed: sum('claimed'), answered: sum('answered'), hot: sum('hot'), recruiters: recruiters.length },
    roles, recruiters,
  };
}
