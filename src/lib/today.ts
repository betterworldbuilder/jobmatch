// Home "Today" panel: summary numbers, urgent actions, the next interview and the
// search settings, all computed from real records in the bootstrap (no estimates).
import type { Bootstrap, JobMatch } from '../types';
import { timeline } from './hiringStages';

const DAY = 86400000;

export type UrgentItem = { id: string; kind: 'reply' | 'interview' | 'likes' | 'profile' | 'salary'; text: string; action: string; matchId?: string };
export type NextInterview = { matchId: string; title: string; who: string; withName: string; at: number; source: 'call' | 'round' };

const isCandidate = (data: Pick<Bootstrap, 'viewer'>) => data.viewer.role === 'candidate';

/** The person on the other side of a match, from the viewer's side. */
export function otherName(match: JobMatch, data: Pick<Bootstrap, 'viewer'>) {
  return isCandidate(data) ? (match.employer?.name || match.job?.company || 'the team') : (match.candidate?.name || 'the candidate');
}

/** Matches whose last message came from the other side: a reply is waiting. */
export function repliesWaiting(data: Pick<Bootstrap, 'viewer' | 'matches' | 'messages'>) {
  return data.matches.filter((m) => {
    const thread = data.messages.filter((msg) => msg.matchId === m.id).sort((a, b) => a.createdAt - b.createdAt);
    const last = thread[thread.length - 1];
    return last && last.senderId !== data.viewer.id;
  });
}

/** People who liked the viewer and are not matched yet. */
export function likesWaiting(data: Pick<Bootstrap, 'viewer' | 'jobs' | 'candidates' | 'matches'>) {
  if (isCandidate(data)) {
    const matchedJobs = new Set(data.matches.map((m) => m.jobId));
    return data.jobs.filter((j) => (j.likedYou || j.superLikedYou) && !matchedJobs.has(j.id)).length;
  }
  const matched = new Set(data.matches.map((m) => m.candidateId));
  return data.candidates.filter((c) => (c.likedYou || c.superLikedYou) && !matched.has(c.id)).length;
}

function dayStart(date: string) { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, 9).getTime(); }

/** Soonest upcoming meeting: a scheduled call, or the current hiring round with a date. */
export function nextInterview(data: Pick<Bootstrap, 'viewer' | 'matches' | 'calls'>, now = Date.now()): NextInterview | null {
  const items: NextInterview[] = [];
  for (const call of data.calls) {
    if (call.startAt < now) continue;
    const m = data.matches.find((x) => x.id === call.matchId);
    // Call titles name the guest ("Coffee chat - Lan Tran"); show the kind of call + the role instead.
    if (m) items.push({ matchId: m.id, title: `${call.title.split(' - ')[0]}${m.job ? ` · ${m.job.title}` : ''}`, who: otherName(m, data), withName: otherName(m, data), at: call.startAt, source: 'call' });
  }
  for (const m of data.matches) {
    const t = timeline(m);
    const cur = t.steps[t.currentIndex];
    if (!cur?.round || !cur.date) continue;
    const at = dayStart(cur.date);
    if (at + DAY < now) continue;
    items.push({ matchId: m.id, title: `Round ${cur.round}: ${cur.name}${m.job ? ` · ${m.job.title}` : ''}`, who: cur.owner || otherName(m, data), withName: otherName(m, data), at, source: 'round' });
  }
  return items.sort((a, b) => a.at - b.at)[0] || null;
}

export function interviewsThisWeek(data: Pick<Bootstrap, 'viewer' | 'matches' | 'calls'>, now = Date.now()) {
  const end = now + 7 * DAY;
  const calls = data.calls.filter((c) => c.startAt >= now && c.startAt <= end).length;
  const rounds = data.matches.filter((m) => { const t = timeline(m); const d = t.steps[t.currentIndex]?.date; return t.steps[t.currentIndex]?.round && d && dayStart(d) >= now - DAY && dayStart(d) <= end; }).length;
  return calls + rounds;
}

/** Up to 3 things worth doing now, most urgent first. */
export function urgentItems(data: Bootstrap, now = Date.now()): UrgentItem[] {
  const out: UrgentItem[] = [];
  const next = nextInterview(data, now);
  if (next && next.at - now < 2 * DAY) out.push({ id: 'interview', kind: 'interview', text: `${next.title} with ${next.who} — ${new Date(next.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, action: 'Prepare', matchId: next.matchId });
  const replies = repliesWaiting(data);
  if (replies.length) out.push({ id: 'reply', kind: 'reply', text: replies.length === 1 ? `${otherName(replies[0], data)} is waiting for your reply` : `${replies.length} conversations are waiting for your reply`, action: 'Reply', matchId: replies[0].id });
  const likes = likesWaiting(data);
  if (likes) out.push({ id: 'likes', kind: 'likes', text: isCandidate(data) ? `${likes} ${likes === 1 ? 'recruiter likes' : 'recruiters like'} you — like back to match` : `${likes} ${likes === 1 ? 'candidate likes' : 'candidates like'} your roles — like back to match`, action: 'See who' });
  const completeness = data.viewer.completeness ?? 0;
  if (completeness < 80) out.push({ id: 'profile', kind: 'profile', text: `Your profile is ${completeness}% complete — teams see complete profiles first`, action: 'Finish it' });
  if (isCandidate(data) && data.viewer.preferences?.salary?.min === undefined) out.push({ id: 'salary', kind: 'salary', text: 'Add your salary range so the fit score can use it', action: 'Add' });
  return out.slice(0, 3);
}

/** "Remote" / "Hybrid · 2 days" / "On-site". */
export function workModeLabel(mode?: { mode?: string; hybridDays?: number }) {
  if (!mode?.mode) return '';
  if (mode.mode === 'hybrid') return `Hybrid${mode.hybridDays ? ` · ${mode.hybridDays} days in office` : ''}`;
  return mode.mode === 'onsite' ? 'On-site' : 'Remote';
}

/** "$70k – $100k / year" from the salary preference; empty when not set. */
export function salaryLabel(s?: { min?: number; max?: number; currency?: string; period?: string }) {
  if (s?.min === undefined) return '';
  const k = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
  const cur = s.currency === 'USD' || !s.currency ? '$' : `${s.currency} `;
  return `${cur}${k(s.min)}${s.max !== undefined ? ` – ${cur}${k(s.max)}` : '+'}${s.period ? ` / ${s.period}` : ' / year'}`;
}
