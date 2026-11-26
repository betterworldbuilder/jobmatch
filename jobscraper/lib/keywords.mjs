// Job-type filter (founder, 2026-11-26): only scrape jobs whose TITLE matches the chosen job types.
// Defined types below + the owner's own words. Used by career-site checks and by the LinkedIn-alert run, so pages of
// unwanted jobs are never read. Matching: whole words, case-insensitive; Vietnamese words included where common.
import { keywordFilter } from './discover.mjs';

export const JOB_TYPES = {
  ai: { label: 'AI / ML', words: ['ai', 'a.i.', 'artificial intelligence', 'machine learning', 'ml', 'mlops', 'llm', 'llms', 'genai', 'generative ai', 'deep learning', 'nlp', 'computer vision', 'data scientist', 'ai engineer', 'trí tuệ nhân tạo'] },
  data: { label: 'Data', words: ['data', 'analytics', 'analyst', 'bi', 'business intelligence', 'etl', 'data engineer', 'data scientist', 'big data', 'dữ liệu', 'phân tích dữ liệu'] },
  fde: { label: 'FDE (forward deployed)', words: ['fde', 'forward deployed', 'forward-deployed', 'deployment engineer', 'solutions engineer', 'solution engineer', 'customer engineer'] },
  sap: { label: 'SAP', words: ['sap', 'abap', 's/4hana', 's4hana', 'hana', 'fico', 'sap basis', 'sap mm', 'sap sd', 'successfactors', 'ariba'] },
  software: { label: 'Software engineer', words: ['software engineer', 'software developer', 'developer', 'engineer', 'backend', 'back-end', 'frontend', 'front-end', 'full stack', 'fullstack', 'full-stack', 'mobile', 'ios', 'android', 'java', 'python', '.net', 'golang', 'node', 'react', 'lập trình viên', 'kỹ sư phần mềm'] },
  cloud: { label: 'Cloud / DevOps', words: ['cloud', 'devops', 'sre', 'site reliability', 'platform engineer', 'infrastructure', 'aws', 'azure', 'gcp', 'kubernetes'] },
  security: { label: 'Security', words: ['security', 'cyber', 'cybersecurity', 'soc', 'pentest', 'penetration', 'an toàn thông tin', 'bảo mật'] },
  qa: { label: 'QA / Test', words: ['qa', 'qc', 'tester', 'test automation', 'quality assurance', 'kiểm thử'] },
  product: { label: 'Product / PM', words: ['product manager', 'product owner', 'project manager', 'scrum master', 'delivery manager'] },
  leadership: { label: 'Tech leadership', words: ['cto', 'cio', 'head of engineering', 'engineering manager', 'tech lead', 'technical lead', 'it director', 'it manager', 'architect'] },
};

/** Words for the chosen types + custom words ("rust, quant"). Empty = no filter (every job). */
export function filterWords({ types = [], custom = '' } = {}) {
  // "Any job" (founder, 2026-11-26) overrides every other type and word: no filter, every job is read.
  if (types.includes('any')) return [];
  const words = types.flatMap((t) => JOB_TYPES[t]?.words || []);
  return [...words, ...String(custom || '').split(/[,;\n]/).map((w) => w.trim()).filter(Boolean)];
}
/** A title test for the chosen types + custom words. */
export const titleFilter = (opts) => keywordFilter(filterWords(opts).join(','));
