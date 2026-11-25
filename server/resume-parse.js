/**
 * Parse a resume's extracted text into structured candidate-profile fields.
 * Claude API when ANTHROPIC_API_KEY is set; a section/keyword heuristic
 * otherwise. Returns fields the onboarding wizard pre-fills for review — never
 * persisted server-side without the user confirming.
 */
import { serverAnthropicKey } from './server-ai.js';

const SKILL_DICTIONARY = [
  // Engineering
  'React', 'React Native', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Go', 'Java', 'Kotlin', 'Swift', 'Ruby', 'Rails', 'PHP', 'Laravel', 'C++', 'C#', '.NET', 'Rust', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST', 'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Git', 'Vue', 'Angular', 'Next.js', 'Express', 'Django', 'FastAPI', 'Spring', 'Machine learning', 'Deep learning', 'TensorFlow', 'PyTorch', 'LLM', 'NLP', 'Data engineering', 'Data analysis', 'Microservices', 'Kafka',
  // Design
  'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'Design systems', 'Prototyping', 'Wireframing', 'User research', 'UX research', 'Research', 'Service design', 'Interaction design', 'Visual design', 'UX writing', 'Accessibility', 'Usability testing', 'Design tokens',
  // Product / business
  'Product strategy', 'Product management', 'Roadmapping', 'Analytics', 'A/B testing', 'Stakeholder management', 'Agile', 'Scrum', 'Kanban', 'Leadership', 'Mentorship', 'Facilitation', 'Communication', 'Go-to-market', 'SEO', 'Content strategy', 'Growth', 'SQL', 'Excel', 'Tableau', 'Power BI', 'Project management', 'Jira',
];

// More skills (founder, 2026-11-25: "do a better job parsing the resume to sort the skillset"): cloud, data, AI, DevOps.
SKILL_DICTIONARY.push(
  'Linux', 'Bash', 'PowerShell', 'Ansible', 'Helm', 'Prometheus', 'Grafana', 'Datadog', 'Jenkins', 'GitHub Actions', 'GitLab CI', 'ArgoCD', 'Serverless', 'Lambda', 'CloudFormation', 'Pulumi', 'Nginx', 'Networking', 'Security', 'IAM',
  'Snowflake', 'Databricks', 'Spark', 'PySpark', 'Hadoop', 'Airflow', 'dbt', 'BigQuery', 'Redshift', 'Synapse', 'Data Factory', 'ETL', 'ELT', 'Data warehouse', 'Data lake', 'Data modeling', 'Data governance', 'Elasticsearch', 'Cassandra', 'DynamoDB', 'Oracle', 'SQL Server', 'Pandas', 'NumPy', 'scikit-learn',
  'Generative AI', 'RAG', 'LangChain', 'LangGraph', 'LlamaIndex', 'OpenAI', 'Claude', 'Bedrock', 'SageMaker', 'Vertex AI', 'Azure OpenAI', 'Hugging Face', 'MLOps', 'Computer vision', 'Prompt engineering', 'Vector databases', 'AI agents', 'MCP',
  'Solution architecture', 'Cloud architecture', 'Pre-sales', 'Consulting', 'Salesforce', 'SAP', 'ServiceNow',
);
const CASE_SENSITIVE = new Set(['Go', 'REST', 'Rust', 'Swift', 'Spring', 'Express', 'Claude', 'Spark', 'Growth', 'Lambda', 'IAM', 'ETL', 'ELT', 'MCP', 'RAG', 'LLM', 'NLP', 'SAP', 'Research', 'Security', 'Networking', 'Analytics', 'Excel', 'Kanban', 'Oracle']);
const SOFT_SKILLS = new Set(['Leadership', 'Mentorship', 'Facilitation', 'Communication', 'Stakeholder management', 'Agile', 'Scrum', 'Kanban', 'Research', 'Consulting', 'Pre-sales', 'Growth', 'Project management']);
// Other spellings of the same skill.
const SKILL_ALIASES = {
  postgres: 'PostgreSQL', psql: 'PostgreSQL', k8s: 'Kubernetes', 'google cloud': 'GCP', 'google cloud platform': 'GCP', 'amazon web services': 'AWS',
  'microsoft azure': 'Azure', js: 'JavaScript', ts: 'TypeScript', nodejs: 'Node.js', 'node js': 'Node.js', reactjs: 'React', 'react.js': 'React',
  golang: 'Go', ml: 'Machine learning', 'machine-learning': 'Machine learning', genai: 'Generative AI', 'gen ai': 'Generative AI', llms: 'LLM',
  'large language models': 'LLM', 'retrieval augmented generation': 'RAG', 'ci cd': 'CI/CD', cicd: 'CI/CD', 'github action': 'GitHub Actions',
  'azure data factory': 'Data Factory', sklearn: 'scikit-learn', 'aws lambda': 'Lambda', 'amazon bedrock': 'Bedrock', 'aws sagemaker': 'SageMaker',
};

/**
 * Skills with a level from the CV's own evidence (founder, 2026-11-25), strongest first.
 * Evidence: how often a skill is mentioned, a Skills section, "N years of X", recent roles.
 * Level 5 = 5+ years stated or very frequent; 1 = listed once with nothing else.
 */
export function rankSkills(text, skillSectionText = '', recentText = '') {
  const flat = text.replace(/\s+/g, ' ');
  const count = (name, hay) => {
    // Words that are also ordinary English are matched with their exact capitals; "Go" never in "go-to"/"go-live".
    const exact = CASE_SENSITIVE.has(name);
    const tail = name === 'Go' ? '(?!\\s*-?\\s*(?:to|live)\\b)' : '';
    const re = new RegExp(`(^|[^A-Za-z0-9+#.])${escapeRe(name)}(?![A-Za-z0-9+#])${tail}`, exact ? 'g' : 'gi');
    return (hay.match(re) || []).length;
  };
  const evidence = new Map(); // canonical name -> { mentions, inSkills, recent, years }
  const add = (canon, mentions, inSkills, recent) => {
    if (!mentions && !inSkills) return;
    const e = evidence.get(canon) || { mentions: 0, inSkills: false, recent: 0, years: 0 };
    e.mentions += mentions; e.inSkills ||= inSkills; e.recent += recent;
    evidence.set(canon, e);
  };
  for (const skill of [...new Set(SKILL_DICTIONARY)]) add(skill, count(skill, flat), count(skill, skillSectionText) > 0, count(skill, recentText));
  for (const [alias, canon] of Object.entries(SKILL_ALIASES)) add(canon, count(alias, flat), count(alias, skillSectionText) > 0, count(alias, recentText));
  // Tokens of a Skills section that are not in the dictionary still count once.
  for (const token of skillSectionText.split(/[,;•|/·\n]+/).map((t) => t.replace(/^[-*\s]+/, '').trim()).filter((t) => t.length >= 2 && t.length <= 30 && !/\s{2,}/.test(t) && t.split(' ').length <= 3)) {
    const lower = token.toLowerCase();
    const known = SKILL_DICTIONARY.find((s) => s.toLowerCase() === lower) || SKILL_ALIASES[lower];
    if (!known && !evidence.has(token) && /^[A-Za-z0-9][A-Za-z0-9+#.\- ]*$/.test(token)) evidence.set(token, { mentions: 1, inSkills: true, recent: 0, years: 0 });
  }
  // "6 years of Python", "Python (5 yrs)", "5+ years with AWS".
  for (const name of evidence.keys()) {
    const n = escapeRe(name);
    const m = flat.match(new RegExp(`(\\d{1,2})\\+?\\s*(?:years?|yrs?)\\s+(?:of\\s+|with\\s+|in\\s+)?(?:hands-on\\s+)?${n}(?![A-Za-z])`, 'i'))
      || flat.match(new RegExp(`${n}\\s*[(:\\-–]\\s*(\\d{1,2})\\+?\\s*(?:years?|yrs?)`, 'i'));
    if (m) evidence.get(name).years = Math.min(Number(m[1]), 40);
  }
  const ranked = [...evidence.entries()].map(([name, e]) => {
    const raw = Math.min(e.mentions, 6) + (e.inSkills ? 1.5 : 0) + Math.min(e.recent, 3) * 0.75;
    const points = SOFT_SKILLS.has(name) ? raw * 0.5 : raw; // prose mentions of soft skills count less

    let level = points >= 6 ? 5 : points >= 4 ? 4 : points >= 2.5 ? 3 : points >= 1.5 ? 2 : 1;
    if (e.years >= 5) level = 5; else if (e.years >= 3) level = Math.max(level, 4); else if (e.years >= 1) level = Math.max(level, 3);
    return { name, level, points: points + e.years };
  });
  // A short skill name inside a longer one found too ("Go" in "Google") is not double counted: drop exact-duplicate names.
  return ranked.sort((a, b) => b.level - a.level || b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, 20).map(({ name, level }) => ({ name, level }));
}

const KNOWN_LANGUAGES = ['English', 'Vietnamese', 'French', 'Spanish', 'German', 'Mandarin', 'Chinese', 'Cantonese', 'Japanese', 'Korean', 'Hindi', 'Portuguese', 'Italian', 'Russian', 'Arabic', 'Thai', 'Indonesian', 'Malay', 'Dutch'];

const SENIORITY_RULES = [
  ['exec', /\b(chief|cxo|cto|ceo|coo|vp|vice president|head of|director)\b/i],
  ['lead', /\b(lead|principal|staff)\b/i],
  ['senior', /\b(senior|sr\.?)\b/i],
  ['junior', /\b(junior|jr\.?|intern|graduate|entry[- ]level)\b/i],
];

function escapeRe(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function findSection(lines, headingRe) {
  const start = lines.findIndex((line) => headingRe.test(line) && line.length < 40);
  if (start < 0) return [];
  const body = [];
  for (const line of lines.slice(start + 1)) {
    // Stop at the next ALL-CAPS-ish heading.
    if (/^[A-Z][A-Za-z ]{2,30}:?$/.test(line) && /^(EXPERIENCE|EMPLOYMENT|WORK|EDUCATION|SKILLS|LANGUAGES|CERTIFICATIONS|PROJECTS|SUMMARY|PROFILE|CONTACT|AWARDS|INTERESTS)/i.test(line)) break;
    body.push(line);
  }
  return body;
}

function heuristicParse(text) {
  const rawLines = text.split('\n').map((l) => l.trim());
  const lines = rawLines.filter(Boolean);
  const flat = lines.join(' ');

  // Headline / title: a clean line that looks like a role, else a role phrase
  // pulled from the flat text (pdf.js extraction often loses line breaks).
  let title = lines.find((line) => /\b(engineer|designer|manager|developer|architect|analyst|researcher|lead|consultant|scientist|director|specialist|strategist|marketer|writer|founder)\b/i.test(line) && line.length < 80);
  if (!title) {
    const m = flat.match(/\b((?:Senior|Lead|Principal|Staff|Junior|Head of|Chief)\s+)?(?:[A-Z][a-z]+\s+){0,2}(Engineer|Designer|Developer|Manager|Architect|Analyst|Researcher|Scientist|Consultant|Strategist|Marketer)\b/);
    if (m) title = m[0].trim();
  }

  const yearsMatch = flat.match(/(\d{1,2})\+?\s*years?\b/i);
  const yearsExperience = yearsMatch ? Math.min(Number(yearsMatch[1]), 50) : undefined;

  const seniority = (SENIORITY_RULES.find(([, re]) => re.test(flat)) || [])[0];

  // Skills: ranked by the CV's own evidence, strongest first (founder, 2026-11-25).
  const skillSection = findSection(lines, /^(skills|technical skills|core skills|key skills|competencies|technologies|tech stack)\b/i).join('\n');
  const recent = findSection(lines, /^(experience|employment|work experience|professional experience)/i).slice(0, 25).join(' ');
  const skills = rankSkills(text, skillSection, recent);

  // Languages
  const languages = [];
  const langSection = findSection(lines, /^languages\b/i).join(' ') || flat;
  for (const lang of KNOWN_LANGUAGES) {
    if (new RegExp(`\\b${escapeRe(lang)}\\b`, 'i').test(langSection)) {
      const near = langSection.match(new RegExp(`${escapeRe(lang)}[^A-Za-z]{0,3}(native|fluent|professional|conversational|basic|c1|c2|b1|b2|a1|a2)`, 'i'));
      const level = near ? near[1].replace(/^\w/, (c) => c.toUpperCase()) : 'Fluent';
      languages.push({ name: lang, level });
    }
  }

  // Work experience: lines with a date range in a work section.
  const workLines = findSection(lines, /^(experience|employment|work experience|professional experience)/i);
  const workExperience = [];
  for (let i = 0; i < workLines.length && workExperience.length < 6; i += 1) {
    const line = workLines[i];
    const range = line.match(/((?:19|20)\d{2}|present|current)\s*[-–—to]+\s*((?:19|20)\d{2}|present|current)/i);
    if (range) {
      const label = line.replace(range[0], '').replace(/[|,·•]/g, ' ').trim();
      const [titlePart, companyPart] = label.split(/\s+(?:at|@|,|-|–)\s+/i);
      workExperience.push({
        title: (titlePart || label).slice(0, 120),
        company: (companyPart || '').slice(0, 120),
        from: range[1], to: /present|current/i.test(range[2]) ? 'Present' : range[2],
        description: (workLines[i + 1] && !/((?:19|20)\d{2})/.test(workLines[i + 1]) ? workLines[i + 1] : '').slice(0, 400),
      });
    }
  }

  // Education
  const eduLines = findSection(lines, /^education\b/i);
  const education = [];
  for (const line of eduLines) {
    if (/\b(bachelor|master|b\.?sc|m\.?sc|b\.?a|m\.?a|phd|degree|university|college|institute)\b/i.test(line)) {
      const range = line.match(/((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present)/i);
      education.push({ degree: line.replace(range ? range[0] : '', '').slice(0, 140).trim(), school: '', from: range ? range[1] : '', to: range ? range[2] : '' });
      if (education.length >= 4) break;
    }
  }

  // Links
  const links = {};
  const github = flat.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s,;)]+/i);
  const linkedin = flat.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s,;)]+/i);
  const site = flat.match(/(?:https?:\/\/)[^\s,;)]+/i);
  if (github) links.github = github[0];
  if (linkedin) links.linkedin = linkedin[0];
  if (site && !/(github|linkedin)\.com/i.test(site[0])) links.portfolio = site[0];

  // Certifications
  const certifications = findSection(lines, /^certifications?\b/i)
    .map((l) => l.replace(/^[-•*·]\s*/, '').trim()).filter((l) => l && l.length <= 100).slice(0, 6);

  // Industries (best-effort keyword hits)
  const industries = ['SaaS', 'Fintech', 'Health', 'E-commerce', 'Education', 'Gaming', 'Logistics', 'AI'].filter((ind) => new RegExp(`\\b${escapeRe(ind)}\\b`, 'i').test(flat));

  return {
    headline: title ? title.slice(0, 120) : undefined,
    title: title ? title.slice(0, 120) : undefined,
    yearsExperience, seniority,
    skills, languages, industries,
    workExperience, education, certifications,
    links: Object.keys(links).length ? links : undefined,
  };
}

async function claudeParse(text) {
  const key = serverAnthropicKey(); // off unless USE_SERVER_AI_KEY=true (founder, 2026-11-24)
  if (!key) return null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 1800,
        messages: [{ role: 'user', content: `Extract structured profile data from this resume. Reply with ONLY JSON: {"headline": one-line professional headline, "title": current or most recent job title, "yearsExperience": integer, "seniority": "junior"|"mid"|"senior"|"lead"|"exec", "skills": [{"name": string, "level": 1-5}] (top 20, strongest first, level from the evidence in the resume: years, frequency, recent roles), "industries": [string], "workExperience": [{"title","company","from","to","description"}], "education": [{"school","degree","from","to"}], "certifications": [string], "languages": [{"name","level"}], "links": {"github","linkedin","portfolio","website"}}. Omit unknown fields.\n\nResume:\n${text.slice(0, 9000)}` }],
      }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const raw = body.content?.[0]?.text || '';
    return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch { return null; }
}

export async function parseResumeToProfile(text) {
  if (!text || text.trim().length < 30) return { generator: 'none', fields: {} };
  const viaClaude = await claudeParse(text);
  if (viaClaude) return { generator: 'claude', fields: viaClaude };
  return { generator: 'heuristic', fields: heuristicParse(text) };
}
