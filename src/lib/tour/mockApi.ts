// Scripted answers for the full tours. Everything lives in memory for this tab and is thrown away when the tour
// ends: no request ever reaches the server, so a tour can't create accounts, swipes, messages or meetings.
// Data: demo seed only (scripts/build-tour-fixtures.mjs → fixtures.json), dates moved to "now".
import fixtures from './fixtures.json';
import type { Bootstrap, Job, JobMatch, Message, Person, ScheduledCall, SessionUser } from '../../types';
import type { TourRole } from './runtime';

const DATE_KEYS = new Set(['createdAt', 'startAt', 'date', 'closedAt', 'updatedAt', 'hiredAt', 'endAt', 'expiresAt', 'lastActiveAt']);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Moves every timestamp by `shift` ms so "2 days ago" stays 2 days ago whenever the tour is played. */
function rebase(value: unknown, shift: number): void {
  if (Array.isArray(value)) { value.forEach((v) => rebase(v, shift)); return; }
  if (!value || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (DATE_KEYS.has(k) && typeof v === 'number' && v > 1.5e12) obj[k] = v + shift;
    else if (k === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const days = Math.round(shift / 86400000);
      obj[k] = new Date(Date.parse(`${v}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    }
    else if (v && typeof v === 'object') rebase(v, shift);
  }
}

export type TourMock = ReturnType<typeof createMockApi>;

export function createMockApi(role: TourRole) {
  const source = (role === 'candidate' ? fixtures.candidate : fixtures.employer) as unknown as Bootstrap;
  const state = clone(source);
  rebase(state, Date.now() - fixtures.builtAt);
  const viewer = state.viewer;
  const user: SessionUser = { id: viewer.id, role: viewer.role, name: viewer.name, email: viewer.email || `${viewer.id}@tour.jobsmatchnow.app`, photo: viewer.photo, title: viewer.title, company: viewer.company, demo: true, emailVerified: true };
  let matchNextLike = false;
  let lastMatchId = '';
  let seq = 0;
  const id = (p: string) => `tour-${p}-${Date.now().toString(36)}-${++seq}`;
  /** Every request the tour answered, for the tests ("nothing reached the server"). */
  const log: { method: string; url: string }[] = [];

  const newMatch = (target: Job | Person, jobId?: string): JobMatch => {
    const template = state.matches[0];
    if (role === 'candidate') {
      const job = target as Job;
      const known = state.matches.find((m) => m.employerId === job.employerId)?.employer;
      const employer = known || ({ id: job.employerId, role: 'employer', name: job.recruiter?.name || job.company, title: job.recruiter?.title, photo: job.recruiter?.photo, company: job.company } as unknown as Person);
      return { ...clone(template), id: id('m'), candidateId: viewer.id, employerId: job.employerId, jobId: job.id, job, employer, candidate: viewer, stage: 'Matched', createdAt: Date.now(), currentStepId: 'match', pipeline: (template.pipeline || []).map((s) => ({ ...s, date: undefined })), closedReason: undefined, closedAt: undefined, closedCategory: undefined } as JobMatch;
    }
    const candidate = target as Person;
    const group = (state.roleMatches || []).find((g) => g.job.id === jobId) || (state.roleMatches || []).find((g) => g.job.id === 'j-sarah-cloud') || state.roleMatches?.[0];
    const job = group?.job || state.jobs[0];
    return { ...clone(template), id: id('m'), candidateId: candidate.id, employerId: viewer.id, jobId: job.id, job, candidate, employer: viewer, stage: 'Matched', createdAt: Date.now(), currentStepId: 'match', pipeline: (template.pipeline || []).map((s) => ({ ...s, date: undefined })), closedReason: undefined, closedAt: undefined, closedCategory: undefined } as JobMatch;
  };

  const autoMessage = (matchId: string, senderId: string, text: string) => {
    const msg: Message = { id: id('msg'), matchId, senderId, text, createdAt: Date.now(), auto: true };
    state.messages.push(msg);
  };

  async function route(method: string, path: string, body: Record<string, unknown>): Promise<unknown> {
    if (path === '/api/bootstrap') return clone(state);
    if (path === '/api/auth/me') return { authenticated: true, user };
    if (path === '/api/auth/register' || path === '/api/auth/login' || path === '/api/auth/sso') return { user: { ...user, isNew: path === '/api/auth/register' } };
    if (path === '/api/auth/config') return { demoAuth: true, mockSso: false, passwordMinLength: 8, sso: { google: false, linkedin: false } };
    if (path === '/api/auth/profiles') return { profiles: [] };
    if (path === '/api/auth/logout') return { ok: true };
    if (path === '/api/swipes' && method === 'POST') {
      const targetId = String(body.targetId || '');
      const like = body.direction === 'like';
      if (like) state.likesRemaining = Math.max(0, state.likesRemaining - 1);
      if (like && matchNextLike) {
        const target = role === 'candidate' ? state.jobs.find((j) => j.id === targetId) : state.candidates.find((c) => c.id === targetId);
        if (target) {
          matchNextLike = false;
          const match = newMatch(target, body.jobId as string | undefined);
          state.matches.unshift(match);
          lastMatchId = match.id;
          return { match, likesRemaining: state.likesRemaining, duplicate: false };
        }
      }
      return { match: null, likesRemaining: state.likesRemaining, duplicate: false };
    }
    if (path === '/api/swipes/undo') return { undone: null, likesRemaining: state.likesRemaining };
    if (path === '/api/messages' && method === 'POST') {
      const msg: Message = { id: id('msg'), matchId: String(body.matchId), senderId: String(body.senderId || viewer.id), text: String(body.text || ''), createdAt: Date.now() };
      state.messages.push(msg);
      return msg;
    }
    if (path === '/api/calls' && method === 'POST') {
      const call: ScheduledCall = { id: id('call'), matchId: String(body.matchId), createdBy: viewer.id, title: String(body.title || 'Interview'), startAt: Number(body.startAt) || Date.now() + 2 * 86400000, durationMinutes: Number(body.durationMinutes) || 30, notes: body.notes ? String(body.notes) : undefined, createdAt: Date.now() };
      state.calls.push(call);
      return call;
    }
    const pipelineMatch = path.match(/^\/api\/matches\/([^/]+)\/pipeline$/);
    if (pipelineMatch && method === 'PATCH') {
      const m = state.matches.find((x) => x.id === decodeURIComponent(pipelineMatch[1]));
      if (m) { m.pipeline = body.pipeline as JobMatch['pipeline']; m.currentStepId = String(body.currentStepId || m.currentStepId); }
      return m || {};
    }
    const matchPatch = path.match(/^\/api\/matches\/([^/]+)$/);
    if (matchPatch && method === 'PATCH') {
      const m = state.matches.find((x) => x.id === decodeURIComponent(matchPatch[1]));
      if (!m) throw new Error('Match not found');
      const effects = { closed: 0, meetingsCancelled: 0, messages: 0 };
      if (body.stage === 'Archived') {
        Object.assign(m, { stage: 'Archived', closedReason: 'stopped_by_recruiter', closedCategory: String(body.closeCategory || ''), closedAt: Date.now(), closedBy: viewer.id });
        autoMessage(m.id, viewer.id, String(body.closeFeedback || ''));
        effects.messages = 1;
      } else if (body.stage === 'Hired') {
        Object.assign(m, { stage: 'Hired', currentStepId: 'hire', closedAt: Date.now(), closedBy: viewer.id });
        for (const other of state.matches) {
          if (other.id === m.id || other.jobId !== m.jobId || other.stage === 'Hired' || other.stage === 'Archived') continue;
          Object.assign(other, { stage: 'Archived', closedReason: 'role_filled', closedAt: Date.now(), closedBy: viewer.id });
          autoMessage(other.id, viewer.id, `Thank you for your time, ${(other.candidate?.name || 'there').split(' ')[0]}. The ${m.job?.title || ''} role is now filled. We would be glad to recommend you to other teams.`);
          effects.closed += 1; effects.messages += 1;
          const cancelled = state.calls.filter((c) => c.matchId === other.id && c.startAt > Date.now() && !c.cancelledAt);
          cancelled.forEach((c) => { c.cancelledAt = Date.now(); c.cancelReason = 'Role filled'; });
          effects.meetingsCancelled += cancelled.length;
        }
      } else Object.assign(m, body);
      return { ...m, effects };
    }
    if (path === '/api/jobs' && method === 'POST') {
      const base = clone(state.jobs.find((j) => j.employerId === viewer.id) || state.jobs[0]);
      const range = body.salaryRange as { min: number; max: number; currency: string } | undefined;
      const skills = ((body.requiredSkillsDetail as { name: string }[]) || []).map((s) => s.name);
      const job: Job = { ...base, id: id('job'), title: String(body.title || 'New role'), location: String(body.location || base.location), workMode: (body.workMode as Job['workMode']) || base.workMode, status: 'active', createdAt: Date.now(), applicants: 0,
        salary: range ? `${range.currency} ${Math.round(range.min / 1000)}k–${Math.round(range.max / 1000)}k` : base.salary,
        requiredSkills: skills.length ? skills : base.requiredSkills, description: String(body.description || body.fullDescription || base.description || '').slice(0, 600), fullDescription: body.fullDescription ? String(body.fullDescription) : undefined } as Job;
      state.jobs.unshift(job);
      return { job };
    }
    if (path === '/api/jobs/parse') return { parser: 'heuristic', parsed: { title: 'Senior Cloud Engineer' } };
    const userPatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userPatch && method === 'PATCH') { Object.assign(viewer, body); return { user: viewer }; }
    if (path === '/api/bookmarks/toggle') {
      const t = String(body.targetId);
      const on = !state.bookmarkedIds.includes(t);
      state.bookmarkedIds = on ? [...state.bookmarkedIds, t] : state.bookmarkedIds.filter((x) => x !== t);
      return { bookmarked: on };
    }
    if (path === '/api/notes' && method === 'POST') return { id: id('note'), userId: viewer.id, targetId: body.targetId, targetType: body.targetType, text: body.text, createdAt: Date.now() };
    if (path === '/api/blocks') return method === 'GET' ? { blocked: [] } : { ok: true };
    if (path === '/api/premium') return { active: false, source: null, trialUsed: false, trialDays: 7, trialEndsAt: null, paidUntil: null, daysLeft: null };
    if (path === '/api/feedback') return method === 'GET' ? { reviews: [] } : { ok: true };
    if (path === '/api/showcase') return { jobs: [], candidates: [], hires: [] };
    if (path === '/api/plans') return { plans: [], headline: [] };
    if (path.startsWith('/api/ai/')) return { enabled: false, reason: 'Not available in the tour', ownKey: null, canSaveKey: false, premium: { active: false, source: null, trialUsed: false, trialDays: 7, trialEndsAt: null, paidUntil: null, daysLeft: null } };
    // Anything else: a harmless empty answer (reads) or "ok" (writes). Nothing is stored.
    return method === 'GET' ? {} : { ok: true };
  }

  return {
    user,
    log,
    get lastMatchId() { return lastMatchId; },
    /** The next like creates a match (the "It's a Match" step). */
    matchNextLike() { matchNextLike = true; },
    async handle(url: string, init?: RequestInit) {
      const method = (init?.method || 'GET').toUpperCase();
      const path = url.split('?')[0];
      log.push({ method, url });
      let body: Record<string, unknown> = {};
      try { if (typeof init?.body === 'string') body = JSON.parse(init.body); } catch { /* not JSON */ }
      await new Promise((resolve) => setTimeout(resolve, 120)); // feels like a real answer
      return route(method, path, body);
    },
  };
}
