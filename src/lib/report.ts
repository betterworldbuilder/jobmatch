// Candidate "Reports": KPIs per target role, skill gaps (with a Coursera search link per
// skill) and recruiter feedback — all from the viewer's own records, nothing estimated.
import type { Bootstrap, Job, JobMatch } from '../types';
import { timeline } from './hiringStages';

/** Fit score of a match: the job list carries the score; the match copy may not. */
export function scoreOf(match: JobMatch, data: Pick<Bootstrap, 'jobs' | 'candidates' | 'viewer'>): number | undefined {
  if (data.viewer.role === 'candidate') return data.jobs.find((j) => j.id === match.jobId)?.match?.score ?? match.job?.match?.score;
  return data.candidates.find((c) => c.id === match.candidateId)?.match?.score ?? match.candidate?.match?.score;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !['senior', 'junior', 'lead', 'staff', 'principal', 'the', 'and', 'of'].includes(w));

/** Which of the viewer's target roles a job belongs to (most shared title words), else "Other roles". */
export function roleFor(title: string, targets: string[]): string {
  const t = new Set(words(title));
  let best = ''; let bestN = 0;
  for (const role of targets) { const n = words(role).filter((w) => t.has(w)).length; if (n > bestN) { best = role; bestN = n; } }
  return best || 'Other roles';
}

export function isInterviewing(m: JobMatch) {
  const t = timeline(m);
  const cur = t.steps[t.currentIndex];
  return Boolean(cur && cur.kind !== 'match') || m.stage === 'Interview' || m.stage === 'Offer' || m.stage === 'Hired';
}

export type RoleKpi = { role: string; roles: number; likedYou: number; matches: number; inConversation: number; interviewing: number; avgFit?: number; topGap?: string };

/** KPIs for each target role the candidate searches for. */
export function roleKpis(data: Bootstrap): RoleKpi[] {
  const targets = data.viewer.preferences?.desiredRoles?.length ? data.viewer.preferences.desiredRoles : [data.viewer.title].filter(Boolean) as string[];
  const rows = new Map<string, RoleKpi & { fits: number[]; gaps: Map<string, number> }>();
  const row = (role: string) => {
    if (!rows.has(role)) rows.set(role, { role, roles: 0, likedYou: 0, matches: 0, inConversation: 0, interviewing: 0, fits: [], gaps: new Map() });
    return rows.get(role)!;
  };
  for (const t of targets) row(t);
  const jobs = new Map<string, Job>(data.jobs.map((j) => [j.id, j]));
  for (const m of data.matches) if (m.job && !jobs.has(m.jobId)) jobs.set(m.jobId, m.job);
  for (const j of jobs.values()) {
    const r = row(roleFor(j.title, targets));
    r.roles += 1;
    if (j.likedYou || j.superLikedYou) r.likedYou += 1;
    if (typeof j.match?.score === 'number') r.fits.push(j.match.score);
    for (const g of j.match?.missingSkills || []) r.gaps.set(g, (r.gaps.get(g) || 0) + 1);
  }
  for (const m of data.matches) {
    const r = row(roleFor(m.job?.title || '', targets));
    r.matches += 1;
    if (data.messages.some((msg) => msg.matchId === m.id)) r.inConversation += 1;
    if (isInterviewing(m)) r.interviewing += 1;
  }
  return [...rows.values()].filter((r) => r.roles || r.matches || targets.includes(r.role)).map(({ fits, gaps, ...r }) => ({
    ...r,
    avgFit: fits.length ? Math.round(fits.reduce((a, b) => a + b, 0) / fits.length) : undefined,
    topGap: [...gaps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
  }));
}

export type SkillGap = { skill: string; roles: number; examples: string[]; course: string };

export const courseraUrl = (skill: string) => `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`;

/** Skills the roles ask for that the profile lacks, most requested first. */
export function skillGaps(data: Pick<Bootstrap, 'jobs' | 'viewer'>, max = 8): SkillGap[] {
  const have = new Set((data.viewer.skills || []).map((s) => s.toLowerCase()));
  const gaps = new Map<string, { n: number; examples: string[] }>();
  for (const j of data.jobs) {
    const missing = j.match?.missingSkills?.length ? j.match.missingSkills : (j.requiredSkills || []).filter((s) => !have.has(s.toLowerCase()));
    for (const s of missing) {
      if (have.has(s.toLowerCase())) continue;
      const g = gaps.get(s) || { n: 0, examples: [] };
      g.n += 1; if (g.examples.length < 2 && !g.examples.includes(j.title)) g.examples.push(j.title);
      gaps.set(s, g);
    }
  }
  return [...gaps.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, max).map(([skill, g]) => ({ skill, roles: g.n, examples: g.examples, course: courseraUrl(skill) }));
}

export type FeedbackItem = { text: string; at: number; from: string; role: string; company: string };

/** Feedback recruiters sent on the viewer's matches, newest first. */
export function recruiterFeedback(data: Pick<Bootstrap, 'matches'>): FeedbackItem[] {
  return data.matches.flatMap((m) => (m.feedback || []).map((f) => ({ text: f.text, at: f.at, from: m.employer?.name || m.job?.company || 'Recruiter', role: m.job?.title || '', company: m.job?.company || '' })))
    .sort((a, b) => b.at - a.at);
}
