// Pure logic for "Interview preparation": skills split (have / refresh), Coursera search links, refresh plan.
import type { JobMatch } from '../types';

export const coursera = (skill: string) => `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`;
const norm = (s: string) => s.toLowerCase().trim();

/** Skills of a role split into "have" / "refresh" against the candidate's profile. */
export function skillPlan(match: Pick<JobMatch, 'job'>, mySkills: string[]) {
  const mine = new Set(mySkills.map(norm));
  const must = match.job?.requiredSkillsDetail?.map((s) => s.name) ?? match.job?.requiredSkills ?? [];
  const nice = match.job?.niceToHaves ?? [];
  const tag = (list: string[]) => list.map((s) => ({ skill: s, have: mine.has(norm(s)) }));
  return { must: tag(must), nice: tag(nice), languages: match.job?.requiredLanguages ?? [] };
}

/** Refresh plan (preview): one week per skill to refresh (must-haves first, max 5), then an interview rehearsal week. */
export function refreshPlan(match: Pick<JobMatch, 'job'>, mySkills: string[]) {
  const p = skillPlan(match, mySkills);
  const todo = [...p.must.filter((s) => !s.have), ...p.nice.filter((s) => !s.have)].slice(0, 5);
  const keep = p.must.filter((s) => s.have).slice(0, 3).map((s) => s.skill);
  const weeks = todo.map((s, i) => ({ week: i + 1, skill: s.skill, must: p.must.some((m) => m.skill === s.skill),
    tasks: [`Take a short course on ${s.skill} (Coursera) and note 3 key ideas`, `Build a small example with ${s.skill} you can show in the interview`, `Prepare a 1-minute answer: "How would you use ${s.skill} in the ${match.job?.title || 'role'}?"`] }));
  const final = { week: weeks.length + 1, skill: 'Interview rehearsal', must: false,
    tasks: [`Rehearse your strongest stories with ${keep.join(', ') || 'your main skills'}`, 'Practise the likely questions out loud, 2 minutes each', `Prepare 2 questions to ask ${match.job?.company || 'the team'}`] };
  return [...weeks, final];
}
