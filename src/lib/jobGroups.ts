// Job groups of a role (founder, 2026-11-26): the role's own groups, else the ones its title matches.
// Same rules as server/groups.js (SUGGEST + custom group keywords).
import type { Job, JobGroup } from '../types';

const SUGGEST: Record<string, RegExp> = {
  'g-ai-ml': /\b(ai|a\.i\.|llm|llms|machine learning|ml|mlops|deep learning|nlp|computer vision|genai|generative)\b/i,
  'g-data': /\b(data|analytics|bi|etl|warehouse|database|dba|databricks|snowflake)\b/i,
  'g-cloud-devops': /\b(cloud|devops|devsecops|sre|site reliability|platform|infrastructure|kubernetes|aws|azure|gcp|mlops|cloudops)\b/i,
  'g-software': /\b(software|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|developer|programmer|java|python|golang|\.net|react|qa|(?<!penetration )tester)\b/i,
  'g-security': /\b(security|cyber|cybersecurity|soc|pentest|penetration|iam|infosec|devsecops|grc)\b/i,
  'g-marketing': /\b(marketing|marketer|growth|seo|sem|content|brand|social media|communications|pr)\b/i,
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Group ids for a title, in group order. */
export function groupsForTitle(groups: JobGroup[], title: string): string[] {
  return groups.filter((g) => SUGGEST[g.id]?.test(title) || (g.keywords || []).some((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(k)}([^\\p{L}\\p{N}]|$)`, 'iu').test(title))).map((g) => g.id);
}
/** The group a role is listed under: its first group in group order (saved, else from the title); '' = Other. */
export function primaryGroup(groups: JobGroup[], job: Pick<Job, 'title' | 'jobGroups'>): string {
  const own = (job.jobGroups || []).filter((id) => groups.some((g) => g.id === id));
  const ids = own.length ? own : groupsForTitle(groups, job.title || '');
  return groups.find((g) => ids.includes(g.id))?.id || '';
}
