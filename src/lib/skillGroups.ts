// Skills grouped by type of role (founder, 2026-11-25): AI · Data · Cloud · DevOps · Programming · Design ·
// Product & business · Soft skills · Other. Used by the wizard's skill editor and the "My Skills" card.
export const SKILL_GROUPS = ['AI', 'Data', 'Cloud', 'DevOps', 'Programming', 'Design', 'Product & business', 'Soft skills', 'Other'] as const;
export type SkillGroup = typeof SKILL_GROUPS[number];

const KNOWN: Record<Exclude<SkillGroup, 'Other'>, string[]> = {
  AI: ['machine learning', 'deep learning', 'tensorflow', 'pytorch', 'llm', 'nlp', 'generative ai', 'rag', 'langchain', 'langgraph', 'llamaindex', 'openai', 'claude', 'bedrock', 'sagemaker', 'vertex ai', 'azure openai', 'hugging face', 'mlops', 'computer vision', 'prompt engineering', 'vector databases', 'ai agents', 'mcp', 'scikit-learn', 'ai'],
  Data: ['sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'snowflake', 'databricks', 'spark', 'pyspark', 'hadoop', 'airflow', 'dbt', 'bigquery', 'redshift', 'synapse', 'data factory', 'etl', 'elt', 'data warehouse', 'data lake', 'data modeling', 'data governance', 'elasticsearch', 'cassandra', 'dynamodb', 'oracle', 'sql server', 'pandas', 'numpy', 'data engineering', 'data analysis', 'kafka', 'tableau', 'power bi', 'excel', 'analytics'],
  Cloud: ['aws', 'gcp', 'azure', 'lambda', 'cloudformation', 'serverless', 'iam', 'cloud architecture', 'solution architecture'],
  DevOps: ['docker', 'kubernetes', 'terraform', 'ci/cd', 'git', 'linux', 'bash', 'powershell', 'ansible', 'helm', 'prometheus', 'grafana', 'datadog', 'jenkins', 'github actions', 'gitlab ci', 'argocd', 'pulumi', 'nginx', 'networking', 'security', 'microservices'],
  Programming: ['react', 'react native', 'typescript', 'javascript', 'node.js', 'python', 'go', 'java', 'kotlin', 'swift', 'ruby', 'rails', 'php', 'laravel', 'c++', 'c#', '.net', 'rust', 'graphql', 'rest', 'vue', 'angular', 'next.js', 'express', 'django', 'fastapi', 'spring', 'html', 'css'],
  Design: ['figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator', 'design systems', 'prototyping', 'wireframing', 'user research', 'ux research', 'research', 'service design', 'interaction design', 'visual design', 'ux writing', 'accessibility', 'usability testing', 'design tokens'],
  'Product & business': ['product strategy', 'product management', 'roadmapping', 'a/b testing', 'go-to-market', 'seo', 'content strategy', 'growth', 'project management', 'jira', 'pre-sales', 'consulting', 'salesforce', 'sap', 'servicenow', 'stakeholder management'],
  'Soft skills': ['leadership', 'mentorship', 'facilitation', 'communication', 'agile', 'scrum', 'kanban', 'teamwork', 'problem solving'],
};
const LOOKUP = new Map<string, SkillGroup>(Object.entries(KNOWN).flatMap(([group, names]) => names.map((n) => [n, group as SkillGroup])));

/** The group of a skill: known names first, then keywords in the name, else "Other". */
export function skillGroup(name: string): SkillGroup {
  const n = name.trim().toLowerCase();
  const known = LOOKUP.get(n);
  if (known) return known;
  if (/\b(ai|ml|llm|gpt|genai|nlp|vision|neural|agent)/.test(n)) return 'AI';
  if (/\b(data|sql|db|database|warehouse|lake|bi|analytics|etl)\b/.test(n)) return 'Data';
  if (/\b(cloud|aws|azure|gcp|ec2|s3)\b/.test(n)) return 'Cloud';
  if (/\b(devops|sre|ci|cd|k8s|infra|infrastructure|observability|monitoring)\b/.test(n)) return 'DevOps';
  return 'Other';
}

/** Skill groups that matter most for a target role, most important first ("View per role", founder 2026-11-25). */
export function roleSkillGroups(role: string): SkillGroup[] {
  const r = role.toLowerCase();
  if (/mlops|ml ops/.test(r)) return ['AI', 'DevOps', 'Cloud'];
  if (/\b(ai|ml|machine learning|llm|genai|nlp|data scien|computer vision)\b|\bai\b/.test(r)) return ['AI', 'Data', 'Programming'];
  if (/\b(data|analytics|bi|etl|warehouse)\b/.test(r)) return ['Data', 'Cloud', 'Programming'];
  if (/\b(devops|sre|platform|infra|infrastructure|reliability|kubernetes)\b/.test(r)) return ['DevOps', 'Cloud', 'Programming'];
  if (/\b(cloud|architect|solutions?)\b/.test(r)) return ['Cloud', 'DevOps', 'Data'];
  if (/\b(design|ux|ui|product designer)\b/.test(r)) return ['Design', 'Product & business'];
  if (/\b(product|pm|project|program|manager|owner)\b/.test(r)) return ['Product & business', 'Soft skills'];
  if (/\b(engineer|developer|frontend|backend|full ?stack|mobile)\b/.test(r)) return ['Programming', 'DevOps', 'Cloud'];
  return [];
}

/** Skills grouped in the fixed group order (or the `focus` groups first); strongest first inside each group.
 *  Empty groups are left out. */
export function groupSkills<T extends { name: string; level?: number }>(skills: T[], focus: SkillGroup[] = []): { group: SkillGroup; skills: T[]; focus: boolean }[] {
  const order = [...focus, ...SKILL_GROUPS.filter((g) => !focus.includes(g))];
  return order.map((group) => ({
    group, focus: focus.includes(group),
    skills: skills.filter((s) => skillGroup(s.name) === group).sort((a, b) => (b.level ?? 0) - (a.level ?? 0)),
  })).filter((g) => g.skills.length > 0);
}
