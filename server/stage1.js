/**
 * Stage 1 · prove the connection (founder, 2026-11-26).
 *  1. "See your candidates" link for the recruiters of imported (JobFinder) roles: a signed link /claim/<jobId>/<sig>
 *     tied to the role's private recruiter email. It opens the role with the candidates who applied (public profiles
 *     only) and lets the recruiter claim the role into their own free account in one click.
 *     The link goes into the interest email only when ROLE_CLAIM_LINKS=on; the JobFinder owner can preview it before.
 *  2. The weekly Stage 1 funnel for the admin dashboard: roles live → likes → emails → link opens → claims →
 *     recruiter like-backs → matches → two-way conversations → interviews. Real accounts only.
 */
import crypto from 'node:crypto';
import { isJobFinderUser } from './jobfinder.js';
import { rolePath } from './public-urls.js';
import { markViewedForJob } from './role-interest.js';

export const claimLinksOn = (env = process.env) => String(env.ROLE_CLAIM_LINKS || '').toLowerCase() === 'on';

export function claimSig(secret, jobId, email) {
  return crypto.createHmac('sha256', secret).update(`claim:${jobId}:${String(email || '').trim().toLowerCase()}`).digest('hex').slice(0, 32);
}
export function claimUrl(origin, secret, jobId, email) { return `${origin}/claim/${encodeURIComponent(jobId)}/${claimSig(secret, jobId, email)}`; }

const real = (u) => Boolean(u) && !u.demo && !u.sample;

/** Candidates who applied (liked) to a role, public profiles only; private ones are only counted. */
export function applicantsOf(db, jobId) {
  const likes = (db.swipes || []).filter((s) => s.targetType === 'job' && s.targetId === jobId && s.direction === 'like');
  const shown = []; let hidden = 0; const seen = new Set();
  for (const s of likes.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
    if (seen.has(s.actorId)) continue; seen.add(s.actorId);
    const u = (db.users || []).find((x) => x.id === s.actorId && x.role === 'candidate');
    if (!real(u)) continue;
    if (u.publicProfile === false || !u.profileSlug) { hidden += 1; continue; }
    const skills = (u.skillsDetail || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0)).map((x) => x.name)
      .concat(u.skills || []).filter((x, i, all) => x && all.indexOf(x) === i).slice(0, 5);
    shown.push({ slug: u.profileSlug, name: u.name, title: u.title, photo: u.photo, yearsExperience: u.yearsExperience, city: u.city, country: u.country, skills, appliedAt: s.createdAt });
  }
  return { candidates: shown, hidden };
}

export function mountClaims(app, { store, authSession, secret, contactOf, track }) {
  const verified = (db, jobId, sig) => {
    const job = (db.jobs || []).find((j) => j.id === jobId);
    const email = contactOf(db, jobId)?.email;
    if (!job || !email || !/^[0-9a-f]{32}$/.test(String(sig)) || claimSig(secret(), jobId, email) !== sig) return null;
    return job;
  };
  const notValid = () => Object.assign(new Error('This link is not valid or has expired'), { status: 404 });

  app.get('/api/claim/:jobId/:sig', async (req, res, next) => {
    try {
      const session = authSession(req);
      const out = await store.transaction((db) => {
        const job = verified(db, req.params.jobId, req.params.sig);
        if (!job) throw notValid();
        const owner = db.users.find((u) => u.id === job.employerId);
        const viewer = session ? db.users.find((u) => u.id === session.sub) : null;
        // Count real opens only (not the JobFinder owner previewing the link).
        if (!isJobFinderUser(viewer)) {
          if (!Array.isArray(db.claimEvents)) db.claimEvents = [];
          db.claimEvents.push({ id: crypto.randomUUID(), jobId: job.id, type: 'view', at: Date.now() });
          track?.(db, 'role_link_opened', {});
          // The page lists the applicants: their applications now show "Application viewed" (48 h answer clock).
          markViewedForJob(db, job.id);
        }
        return {
          job: { id: job.id, title: job.title, company: job.company, location: job.location, workMode: job.workMode, type: job.type, summary: job.description, path: rolePath(job) },
          ...applicantsOf(db, job.id),
          claimed: !isJobFinderUser(owner),
          claimedByYou: Boolean(viewer && owner && viewer.id === owner.id && !isJobFinderUser(owner)),
          preview: isJobFinderUser(viewer),
        };
      });
      res.json(out);
    } catch (error) { next(error); }
  });

  app.post('/api/claim/:jobId/:sig', async (req, res, next) => {
    try {
      const session = authSession(req);
      if (!session) { const error = new Error('Sign in or create a free recruiter account to claim this role'); error.status = 401; throw error; }
      const out = await store.transaction((db) => {
        const job = verified(db, req.params.jobId, req.params.sig);
        if (!job) throw notValid();
        const user = db.users.find((u) => u.id === session.sub);
        if (!user || user.role !== 'employer') { const error = new Error('Use a recruiter account to claim this role'); error.status = 403; throw error; }
        if (!real(user) || isJobFinderUser(user)) { const error = new Error('This account cannot claim roles'); error.status = 403; throw error; }
        const owner = db.users.find((u) => u.id === job.employerId);
        if (job.employerId === user.id) return { ok: true, jobId: job.id, already: true };
        if (!isJobFinderUser(owner)) { const error = new Error('This role was already claimed by another recruiter'); error.status = 409; throw error; }
        // Move the role and its applications to the recruiter. The private contact record is no longer needed.
        const from = job.employerId;
        Object.assign(job, { employerId: user.id, claimedFromId: from, claimedAt: Date.now(), status: job.status === 'draft' ? 'active' : job.status });
        if (!job.recruiterName && user.name) job.recruiterName = user.name;
        for (const m of db.matches || []) if (m.jobId === job.id) m.employerId = user.id;
        if (Array.isArray(db.jobContacts)) db.jobContacts = db.jobContacts.filter((c) => c.jobId !== job.id);
        if (!Array.isArray(db.claimEvents)) db.claimEvents = [];
        db.claimEvents.push({ id: crypto.randomUUID(), jobId: job.id, type: 'claim', userId: user.id, at: Date.now() });
        track?.(db, 'role_claimed', {});
        return { ok: true, jobId: job.id };
      });
      res.json(out);
    } catch (error) { next(error); }
  });
}

/** Monday 00:00 UTC of the week containing t, as YYYY-MM-DD. */
export function weekOf(t) {
  const d = new Date(t); const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

/** The Stage 1 funnel per week (last `weeks` weeks, oldest first) plus a snapshot of live roles. Real accounts only. */
export function stage1Funnel(db, { weeks = 8, now = Date.now() } = {}) {
  const users = new Map((db.users || []).map((u) => [u.id, u]));
  const isReal = (id) => real(users.get(id));
  const keys = []; for (let i = weeks - 1; i >= 0; i -= 1) keys.push(weekOf(now - i * 7 * 24 * 3600 * 1000));
  const rows = Object.fromEntries(keys.map((k) => [k, { week: k, likes: 0, emailsSent: 0, linkOpens: 0, claims: 0, likeBacks: 0, matches: 0, conversations: 0, interviews: 0 }]));
  const add = (t, field) => { const r = t && rows[weekOf(t)]; if (r) r[field] += 1; };
  const jobs = new Map((db.jobs || []).map((j) => [j.id, j]));
  for (const s of db.swipes || []) {
    if (s.direction !== 'like' || !isReal(s.actorId)) continue;
    if (s.targetType === 'job' && jobs.has(s.targetId)) add(s.createdAt, 'likes');
    if (s.targetType === 'candidate' && users.get(s.actorId)?.role === 'employer') add(s.createdAt, 'likeBacks');
  }
  for (const m of db.roleInterestMails || []) if (m.status === 'sent') add(m.sentAt || m.createdAt, 'emailsSent');
  for (const e of db.claimEvents || []) add(e.at, e.type === 'claim' ? 'claims' : 'linkOpens');
  const realMatches = (db.matches || []).filter((m) => isReal(m.candidateId) && isReal(m.employerId));
  for (const m of realMatches) {
    add(m.createdAt, 'matches');
    const msgs = (db.messages || []).filter((x) => x.matchId === m.id && !x.firstImpression).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const firstC = msgs.find((x) => x.senderId === m.candidateId); const firstE = msgs.find((x) => x.senderId === m.employerId);
    if (firstC && firstE) add(Math.max(firstC.createdAt, firstE.createdAt), 'conversations');
  }
  const matchIds = new Set(realMatches.map((m) => m.id));
  for (const c of db.calls || []) if (matchIds.has(c.matchId)) add(c.createdAt, 'interviews');
  const live = (db.jobs || []).filter((j) => !j.demo && !j.sample && String(j.status).toLowerCase() === 'active' && isReal(j.employerId));
  const jfLive = live.filter((j) => isJobFinderUser(users.get(j.employerId)));
  const withEmail = jfLive.filter((j) => (db.jobContacts || []).some((c) => c.jobId === j.id && c.email)).length;
  return {
    weeks: keys.map((k) => rows[k]),
    snapshot: { rolesLive: live.length, importedRolesLive: jfLive.length, importedWithRecruiterEmail: withEmail, claimedRoles: (db.jobs || []).filter((j) => j.claimedAt).length },
    claimLinksOn: claimLinksOn(),
  };
}
