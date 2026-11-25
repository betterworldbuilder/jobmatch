/**
 * Job posting model: sanitize/validate create+update payloads, and parse
 * pasted job-board text into structured fields (Claude API when
 * ANTHROPIC_API_KEY is set, heuristic parser otherwise).
 */
import { ValidationError } from './matching.js';
import { serverAnthropicKey } from './server-ai.js';

export const JOB_STATUSES = ['draft', 'active', 'paused', 'filled'];
const SENIORITIES = ['junior', 'mid', 'senior', 'lead', 'exec'];
const WORK_MODES = ['Remote', 'Hybrid', 'On-site', 'Flexible'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];

const str = (value, max = 500) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined);
const num = (value, min, max) => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined);
const strArray = (value, maxItems = 30, maxLen = 200) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim() && item.length <= maxLen).map((item) => item.trim()).slice(0, maxItems) : undefined);

/** "$40k–$60k", or "From $40k" when only a minimum is given (salary optional, founder 2026-11-25). */
export function formatSalary({ min, max, currency }) {
  const compact = (value) => (value >= 1000 && value % 1000 === 0 ? `${value / 1000}k` : value.toLocaleString());
  const symbol = { USD: '$', EUR: '€', GBP: '£', AUD: 'A$', SGD: 'S$', VND: '₫' }[currency];
  const prefix = symbol || `${currency} `;
  if (max === undefined || max === null) return `From ${prefix}${compact(min)}`;
  return `${prefix}${compact(min)}–${prefix}${compact(max)}`;
}

/** Whitelist-merge a job payload; `strict` enforces the required-field contract. */
export function applyJob(job, body, { strict = false } = {}) {
  const set = (field, value) => { if (value !== undefined) job[field] = value; };
  set('title', str(body.title, 140));
  set('department', str(body.department, 80));
  if (body.seniority !== undefined) {
    if (!SENIORITIES.includes(body.seniority)) throw new ValidationError('seniority', `seniority must be one of ${SENIORITIES.join(', ')}`);
    job.seniority = body.seniority;
    job.experienceLevel = body.seniority; // fit score input
  }
  if (body.requiredSkillsDetail !== undefined) {
    if (!Array.isArray(body.requiredSkillsDetail)) throw new ValidationError('requiredSkillsDetail', 'must be an array');
    job.requiredSkillsDetail = body.requiredSkillsDetail
      .map((item) => ({ name: str(item?.name, 60), weight: num(item?.weight, 1, 3) ?? 2 }))
      .filter((item) => item.name).slice(0, 25);
    job.requiredSkills = job.requiredSkillsDetail.map((item) => item.name);
  }
  set('niceToHaves', strArray(body.niceToHaves, 15, 60));
  if (body.type !== undefined) {
    if (!EMPLOYMENT_TYPES.includes(body.type)) throw new ValidationError('type', `type must be one of ${EMPLOYMENT_TYPES.join(', ')}`);
    job.type = body.type;
  }
  if (body.workMode !== undefined) {
    if (!WORK_MODES.includes(body.workMode)) throw new ValidationError('workMode', `workMode must be one of ${WORK_MODES.join(', ')}`);
    job.workMode = body.workMode;
  }
  if (body.remoteScope !== undefined) {
    if (!['country', 'worldwide'].includes(body.remoteScope)) throw new ValidationError('remoteScope', 'remoteScope must be country or worldwide');
    job.remoteScope = body.remoteScope;
  }
  set('country', str(body.country, 80));
  set('location', str(body.location, 120));
  if (body.geo && typeof body.geo === 'object') {
    const lat = num(body.geo.lat, -90, 90); const lng = num(body.geo.lng, -180, 180);
    if (lat !== undefined && lng !== undefined) job.geo = { lat, lng };
  }
  set('hiringRadiusKm', num(body.hiringRadiusKm, 5, 500));
  // Salary is optional; a minimum alone is allowed ("From $40k"). null clears it.
  if (body.salaryRange === null) { delete job.salaryRange; delete job.salary; }
  else if (body.salaryRange !== undefined) {
    const rawMax = body.salaryRange?.max;
    const hasMax = rawMax !== undefined && rawMax !== null && rawMax !== '';
    const min = num(body.salaryRange?.min, 0, 100000000);
    const max = hasMax ? num(rawMax, 0, 100000000) : undefined;
    const currency = str(body.salaryRange?.currency, 8);
    if (min === undefined || !currency || (hasMax && max === undefined)) throw new ValidationError('salaryRange', 'salaryRange needs a minimum and a currency (the maximum is optional)');
    if (max !== undefined && min > max) throw new ValidationError('salaryRange', 'salary min cannot exceed max');
    job.salaryRange = max === undefined ? { min, currency } : { min, max, currency };
    job.salary = formatSalary(job.salaryRange);
  }
  set('description', str(body.description, 5000));
  // "Role details": the whole job description as the recruiter pasted it (shown as-is in the Role Details card).
  if (body.fullDescription !== undefined) {
    const full = typeof body.fullDescription === 'string' ? body.fullDescription.replace(/\r\n/g, '\n').trim().slice(0, 20000) : '';
    if (full) job.fullDescription = full; else delete job.fullDescription;
  }
  // No short summary given: use the first real paragraph of the full description (swipe card + previews).
  if (!job.description && job.fullDescription) {
    const para = job.fullDescription.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 60) || job.fullDescription;
    job.description = para.length > 400 ? `${para.slice(0, 397).replace(/\s+\S*$/, '')}…` : para;
  }
  set('responsibilities', strArray(body.responsibilities, 15, 300));
  set('interviewProcess', strArray(body.interviewProcess, 10, 120));
  set('startDate', str(body.startDate, 40));
  set('externalUrl', str(body.externalUrl, 400));
  set('screeningQuestions', strArray(body.screeningQuestions, 5, 300));
  if (body.status !== undefined) {
    if (!JOB_STATUSES.includes(body.status)) throw new ValidationError('status', `status must be one of ${JOB_STATUSES.join(', ')}`);
    job.status = body.status;
  }
  set('requiredLanguages', strArray(body.requiredLanguages, 8, 40));

  // Card-mirroring fields (job profile = 5 cards, like the candidate deck).
  set('openings', num(body.openings, 1, 999)); // card 1
  set('urgency', str(body.urgency, 40));
  set('deadline', str(body.deadline, 40));
  set('successMeasures', strArray(body.successMeasures, 8, 200)); // card 2
  set('benefits', strArray(body.benefits, 20, 80)); // card 3
  set('workingHours', str(body.workingHours, 60));
  set('flexibleHours', str(body.flexibleHours, 80));
  set('probation', str(body.probation, 40));
  set('bonus', str(body.bonus, 60));
  set('equity', str(body.equity, 60));
  if (body.salaryNegotiable !== undefined) job.salaryNegotiable = Boolean(body.salaryNegotiable);
  set('hybridDays', num(body.hybridDays, 0, 5));
  if (body.visaSponsorship !== undefined) job.visaSponsorship = Boolean(body.visaSponsorship);
  // "Required valid work visa and nationality" (founder, 2026-11-22): yes/no, and when no, who may apply.
  if (body.workVisaRequired !== undefined) job.workVisaRequired = body.workVisaRequired === null ? undefined : Boolean(body.workVisaRequired);
  if (body.authorizedNationalities !== undefined) {
    const a = body.authorizedNationalities || {};
    const mode = ['any', 'us', 'europe', 'custom'].includes(a.mode) ? a.mode : 'any';
    job.authorizedNationalities = { mode, ...(mode === 'custom' ? { custom: strArray(a.custom, 30, 60) || [] } : {}) };
  }
  if (body.relocationSupport !== undefined) job.relocationSupport = Boolean(body.relocationSupport);
  set('contractDuration', str(body.contractDuration, 40)); // e.g. "6 months" (founder, 2026-11-22)
  set('travel', str(body.travel, 60));
  set('onCall', str(body.onCall, 60));
  set('teamSize', str(body.teamSize, 40)); // card 4
  set('teamComposition', strArray(body.teamComposition, 12, 60));
  set('teamLocations', str(body.teamLocations, 120));
  set('managerName', str(body.managerName, 120));
  set('managerTitle', str(body.managerTitle, 120));
  set('managerStyle', str(body.managerStyle, 200));
  set('managementStyleTags', strArray(body.managementStyleTags, 8, 40));
  set('teamStyle', strArray(body.teamStyle, 8, 40));
  set('values', strArray(body.values, 10, 60));
  set('teamSong', str(body.teamSong, 400));
  set('mission', str(body.mission, 300));
  set('culture', strArray(body.culture, 10, 60));
  set('hiringTimeline', str(body.hiringTimeline, 80)); // card 5
  if (body.backgroundCheck !== undefined) job.backgroundCheck = Boolean(body.backgroundCheck);
  if (body.referenceCheck !== undefined) job.referenceCheck = Boolean(body.referenceCheck);

  if (strict) {
    if (job.workMode === 'Remote' && !job.remoteScope) job.remoteScope = 'worldwide';
    assertPublishable(job);
    if (!job.status) job.status = 'draft';
  }
  return job;
}

/**
 * The required-field contract a job must meet to be created via POST and to
 * go live via PATCH (draft/imported/paused → active). One function so the two
 * paths can't drift. Salary is optional (founder, 2026-11-25: a minimum is advised, not required),
 * but a salary that is given must be real.
 */
export function assertPublishable(job) {
  if (!job.title) throw new ValidationError('title', 'Title is required');
  if (!job.requiredSkills || job.requiredSkills.length < 1) throw new ValidationError('requiredSkillsDetail', 'At least 1 required skill');
  if (!job.type) throw new ValidationError('type', 'Employment type is required');
  if (!job.workMode) throw new ValidationError('workMode', 'Work mode is required');
  if (!job.location) throw new ValidationError('location', 'Location is required');
  // Radius only matters for on-site/hybrid; remote roles use scope instead.
  if (job.workMode !== 'Remote' && job.hiringRadiusKm === undefined) throw new ValidationError('hiringRadiusKm', 'Hiring radius is required for on-site or hybrid roles');
  // A 0–0, zero-minimum or inverted range is not a salary.
  if (job.salaryRange) {
    const { min, max } = job.salaryRange;
    const real = max === undefined || max === null ? min > 0 : max > 0 && min <= max;
    if (!real) throw new ValidationError('salaryRange', 'Enter a real salary: a minimum above 0, and a maximum not below it');
  }
  if (!job.description) throw new ValidationError('description', 'Description is required');
}

// ---------------------------------------------------------------------------
// Paste-import parsing
// ---------------------------------------------------------------------------

// Skills the parser recognises: [shown name, pattern]. Tech first; a few soft skills last.
const SKILLS = [
  ['Python', /\bpython\b/i], ['Java', /\bjava\b(?!\s*script)/i], ['Go', /\b[Gg]olang\b|\bGo\b(?=\s*[/),])|(?<=[(/]\s*)Go\b/], ['TypeScript', /\btypescript\b/i],
  ['JavaScript', /\bjavascript\b/i], ['Node.js', /\bnode\.?js\b/i], ['React', /\breact(\.?js)?\b/i], ['Next.js', /\bnext\.?js\b/i], ['Vue.js', /\bvue(\.?js)?\b/i],
  ['Angular', /\bangular\b/i], ['HTML/CSS', /\bhtml\b|\bcss\b/i], ['PHP', /\bphp\b/i], ['Kotlin', /\bkotlin\b/i], ['Swift', /\bswift\b/i], ['C#', /\bc#|\.net\b/i],
  ['C++', /\bc\+\+/i], ['Rust', /\brust\b/i], ['SQL', /\bsql\b/i], ['PostgreSQL', /\bpostgre(s|sql)\b/i], ['MySQL', /\bmysql\b/i], ['NoSQL', /\bnosql\b/i],
  ['MongoDB', /\bmongo(db)?\b/i], ['Redis', /\bredis\b/i], ['Kafka', /\bkafka\b/i], ['RabbitMQ', /\brabbitmq\b/i], ['Spark', /\bspark\b/i], ['Airflow', /\bairflow\b/i],
  ['dbt', /\bdbt\b/i], ['Databricks', /\bdatabricks\b/i], ['Snowflake', /\bsnowflake\b/i], ['BigQuery', /\bbigquery\b/i], ['Redshift', /\bredshift\b/i],
  ['Tableau', /\btableau\b/i], ['Power BI', /\bpower ?bi\b/i], ['Looker', /\blooker\b/i], ['Excel', /(?<!\bto )\b(?:MS |Microsoft )?Excel\b(?! (in|at|across)\b)/], ['Salesforce', /\bsalesforce\b/i],
  ['AWS', /\baws\b|amazon web services/i], ['Azure', /\bazure\b/i], ['GCP', /\bgcp\b|google cloud/i], ['Docker', /\bdocker\b/i], ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['Terraform', /\bterraform\b/i], ['Helm', /\bhelm\b/i], ['Ansible', /\bansible\b/i], ['ArgoCD', /\bargo ?cd\b/i], ['GitHub Actions', /github actions/i], ['Jenkins', /\bjenkins\b/i],
  ['CI/CD', /\bci\s*\/\s*cd\b/i], ['Linux', /\blinux\b/i], ['Serverless', /\bserverless\b|\blambda\b/i], ['Prometheus', /\bprometheus\b/i], ['Grafana', /\bgrafana\b/i],
  ['Datadog', /\bdatadog\b/i], ['OpenTelemetry', /\bopentelemetry\b/i], ['FastAPI', /\bfastapi\b/i], ['Django', /\bdjango\b/i], ['Flask', /\bflask\b/i],
  ['Spring Boot', /\bspring( boot)?\b/i], ['GraphQL', /\bgraphql\b/i], ['REST APIs', /\brest(ful)?\b(\s+api)?/i], ['Microservices', /\bmicro-?services?\b/i],
  ['OAuth/SSO', /\boauth|openid connect|\bsso\b/i], ['PyTorch', /\bpytorch\b/i], ['TensorFlow', /\btensorflow\b/i], ['scikit-learn', /\bscikit-learn\b|\bsklearn\b/i],
  ['XGBoost', /\bxgboost\b/i], ['Pandas', /\bpandas\b/i], ['NumPy', /\bnumpy\b/i], ['Hugging Face', /hugging ?face/i], ['LangChain', /\blangchain\b/i],
  ['LangGraph', /\blanggraph\b/i], ['LlamaIndex', /\bllama ?index\b/i], ['LLM', /\bllms?\b|large language models?|\bgen ?ai\b/i], ['RAG', /\brag\b|retrieval[- ]augmented/i],
  ['AI agents', /\bagentic\b|\bai agents?\b|multi-agent/i], ['MCP', /\bmcp\b/i], ['Prompt engineering', /prompt (engineering|design)/i], ['Fine-tuning', /fine-?tun|\blora\b/i],
  ['Vector databases', /vector (databases?|search|db)|\bqdrant\b|\bmilvus\b|\bpgvector\b/i], ['MLOps', /\bmlops\b/i], ['LLMOps', /\bllmops\b/i], ['MLflow', /\bmlflow\b/i],
  ['Kubeflow', /\bkubeflow\b/i], ['vLLM', /\bvllm\b/i], ['Computer vision', /computer vision|object detection|\bocr\b/i], ['NLP', /\bnlp\b|natural language processing/i],
  ['Speech AI', /\basr\b|\btts\b|speech|voice ai/i], ['Machine learning', /machine learning|\bml\b/i], ['Deep learning', /deep learning/i], ['Statistics', /statistic/i],
  ['Data engineering', /data engineering|data pipelines?|\betl\b|\belt\b/i], ['Data analysis', /data analy(sis|tics)/i], ['Figma', /\bfigma\b/i], ['Git', /\bgit\b/i],
  ['Testing', /unit tests?|integration tests?|e2e|end-to-end test|playwright|cypress|pytest/i], ['Security', /\bsecurity\b/i], ['Shopify', /\bshopify\b/i],
  ['Agile', /\bagile\b/i], ['Scrum', /\bscrum\b/i], ['Design systems', /design systems?/i], ['Accessibility', /accessibility/i], ['Product strategy', /product strategy/i],
  ['Stakeholder management', /stakeholder/i], ['Leadership', /\bleadership\b|\bmentor/i], ['Communication', /communication skills|\bcommunicat/i],
];
const LANGUAGES = [['English', /\benglish\b/i], ['Vietnamese', /\bvietnamese\b/i], ['Japanese', /\bjapanese\b/i], ['Korean', /\bkorean\b/i], ['Chinese', /\bchinese\b|\bmandarin\b/i],
  ['French', /\bfrench\b/i], ['German', /\bgerman\b/i], ['Spanish', /\bspanish\b/i], ['Thai', /\bthai\b/i]];
// Section headings → kind. A heading is a short line (optionally "- " bulleted) that names one of these.
const SECTION_KINDS = [
  ['nice', /nice[- ]to[- ]have|preferred|strong plus|good to have|bonus points|\bplus\b|optional|would be a plus|advantage/i],
  ['benefits', /benefit|perks|what we offer|we offer|why (join|amaris|us|\w+\s*\?)|icing|you will love|compensation|what you get|our offer/i],
  ['requirements', /requirement|qualification|must[- ]have|about you|what you bring|who (we are|you are|we're) looking|what we.?re looking for|we are looking for|your profile|you have|skills|experience:|technical skills|who thrives|you.?ll thrive/i],
  ['responsibilities', /responsibilit|what you.?ll do|what you will do|your role|the role|about the role|role description|job description|key duties|duties|you will:|what you.?ll build|your impact|your mission/i],
];
const HEADING_MAX = 70;

function sectionsOf(lines) {
  const out = []; let cur = { kind: 'intro', lines: [] };
  for (const raw of lines) {
    const line = raw.replace(/^[-•*·]\s*/, '');
    const short = line.length <= HEADING_MAX && !/[.!?]$/.test(line) && (line.endsWith(':') || /^[A-Z0-9][^a-z]*$/.test(line) || line.split(/\s+/).length <= 6);
    const kind = short ? SECTION_KINDS.find(([, re]) => re.test(line))?.[0] : undefined;
    if (kind) { out.push(cur); cur = { kind, lines: [] }; continue; }
    cur.lines.push(raw);
  }
  out.push(cur);
  return out;
}
const bulletsIn = (lines) => lines.filter((l) => /^[-•*·o]\s/.test(l) || /^\d+[.)]\s/.test(l)).map((l) => l.replace(/^([-•*·o]|\d+[.)])\s*/, '').trim()).filter(Boolean);
const skillsIn = (text) => SKILLS.filter(([, re]) => re.test(text)).map(([name]) => name);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);

/** Money like "$3,000–4,000", "USD 40k - 60k", "from $2,500", "min 30,000,000 VND". Returns {min[, max], currency}. */
export function parseSalaryText(text) {
  if (!text) return undefined;
  const cur = (s) => (/€|EUR/i.test(s) ? 'EUR' : /£|GBP/i.test(s) ? 'GBP' : /A\$|AUD/i.test(s) ? 'AUD' : /S\$|SGD/i.test(s) ? 'SGD' : /VND|₫|vnđ/i.test(s) ? 'VND' : /\$|USD/i.test(s) ? 'USD' : undefined);
  const n = (raw, k) => { let v = Number(String(raw).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')); if (k) v *= 1000; return Math.round(v); };
  const range = text.match(/(?:[$€£₫]|USD|EUR|GBP|AUD|SGD|VND|A\$|S\$)\s?([\d.,]+)\s?(k)?\s?(?:-|–|to)\s?(?:[$€£₫]|USD|EUR|GBP|AUD|SGD|VND|A\$|S\$)?\s?([\d.,]+)\s?(k)?(\s?(?:USD|EUR|GBP|AUD|SGD|VND|₫))?/i)
    || text.match(/([\d.,]+)\s?(k)?\s?(?:-|–|to)\s?([\d.,]+)\s?(k)?\s?(USD|EUR|GBP|AUD|SGD|VND|₫)/i);
  if (range) {
    const currency = cur(range[0]); const min = n(range[1], range[2]); const max = n(range[3], range[4] || range[2]);
    if (currency && min > 0 && max >= min) return { min, max, currency };
  }
  const from = text.match(/(?:from|min(?:imum)?|starting at|at least|>=?)\s*:?\s*((?:[$€£₫]|USD|EUR|GBP|AUD|SGD|VND|A\$|S\$)\s?[\d.,]+\s?k?|[\d.,]+\s?k?\s?(?:USD|EUR|GBP|AUD|SGD|VND|₫))/i)
    || text.match(/^\s*((?:[$€£₫]|USD|EUR|GBP|AUD|SGD|VND)\s?[\d.,]+\s?k?|[\d.,]+\s?k?\s?(?:USD|EUR|GBP|AUD|SGD|VND|₫))\s*(?:\+|and up|\/|per|$)/i);
  if (from) {
    const m = from[1].match(/([\d.,]+)\s?(k)?/i); const currency = cur(from[1]); const min = m ? n(m[1], m[2]) : 0;
    if (currency && min > 0) return { min, currency };
  }
  return undefined;
}

/** The skill names the pre-2026-11-25 parser would have picked (to tell its output from a recruiter's edits). */
const LEGACY_SKILLS = ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Go', 'Java', 'Kotlin', 'Swift', 'SQL', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes', 'Figma', 'Design systems', 'Product strategy', 'Research', 'Prototyping', 'Analytics', 'Leadership', 'Service design', 'UX writing', 'Accessibility', 'GraphQL', 'CI/CD', 'Machine learning', 'Data analysis', 'Agile', 'Scrum', 'Communication', 'Stakeholder management'];
export function legacySkills(text) {
  return LEGACY_SKILLS.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)).slice(0, 10);
}

/**
 * Section-aware heuristic parser for a pasted job description (no AI needed). Reads the headings
 * (Requirements / Nice to have / Responsibilities / Benefits…) and fills: summary, must-have and nice-to-have
 * skills, languages, seniority, company, work mode, type, location, salary, responsibilities, benefits.
 */
export function heuristicParse(text, url) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  const lower = text.toLowerCase();
  const parsed = { externalUrl: url || undefined };
  parsed.title = lines[0]?.slice(0, 140);
  const sections = sectionsOf(lines.slice(1));
  const textOf = (kind) => sections.filter((s) => s.kind === kind).map((s) => s.lines.join('\n')).join('\n');
  const reqText = textOf('requirements'); const niceText = textOf('nice'); const respText = textOf('responsibilities');

  // Seniority: the title's words first, then years of experience.
  const title = (lines[0] || '').toLowerCase();
  const byTitle = [['exec', /\b(vp|vice president|head of|director|chief|cxo)\b/], ['lead', /\b(lead|principal|staff)\b/], ['senior', /\bsenior|\bsr\.?\b/], ['junior', /\b(junior|jr\.?|entry[- ]level|graduate|intern)\b/], ['mid', /\b(mid|middle|medior|intermediate)\b/]].find(([, re]) => re.test(title))?.[0];
  const years = [...(reqText || text).matchAll(/(\d{1,2})\s*(?:\+|–|-|to)?\s*(?:\d{1,2})?\s*\+?\s*years?/gi)].map((m) => Number(m[1])).filter((y) => y > 0 && y < 30);
  const minYears = years.length ? Math.min(...years) : undefined;
  parsed.seniority = byTitle || (minYears === undefined ? 'mid' : minYears >= 8 ? 'lead' : minYears >= 5 ? 'senior' : minYears >= 2 ? 'mid' : 'junior');
  if (minYears !== undefined) parsed.yearsExperience = minYears;

  if (/\bhybrid\b|\bwfh\b.*days|days.*\bwfh\b/.test(lower)) parsed.workMode = 'Hybrid';
  else if (/\b(100% )?remote\b|work from anywhere/.test(lower)) parsed.workMode = 'Remote';
  else if (/on[- ]?site|in[- ]office/.test(lower)) parsed.workMode = 'On-site';
  parsed.type = /part[- ]time/.test(lower) ? 'Part-time' : /\bcontract\b(?! salary)|contractor/.test(lower) && !/contractual/.test(lower) ? 'Contract' : /freelance/.test(lower) ? 'Freelance' : /\binternship\b/.test(lower) ? 'Internship' : 'Full-time';

  const locationMatch = text.match(/(?:location|based in|working location|work location|office)[:\s]+([A-Za-zÀ-ỹ ,'-]{3,60})/i);
  if (locationMatch) parsed.location = locationMatch[1].trim().replace(/[.,]$/, '');
  const companyMatch = text.match(/^\s*(?:company|employer|client)\s*[:\-–]\s*(.{2,80})$/im);
  if (companyMatch) parsed.company = companyMatch[1].trim();
  const salary = parseSalaryText(text.match(/^.*(?:salary|compensation|pay|lương)[^\n]*$/im)?.[0] || '') || parseSalaryText(text);
  if (salary) parsed.salaryRange = salary;

  // Skills: must-haves from the requirements (else the whole text minus nice-to-have/benefits); nice-to-haves from their own section.
  const mustSource = reqText || sections.filter((s) => !['nice', 'benefits'].includes(s.kind)).map((s) => s.lines.join('\n')).join('\n');
  const must = skillsIn(mustSource);
  const respSkills = skillsIn(respText).filter((s) => !must.includes(s));
  const mustAll = [...must, ...(must.length < 4 ? respSkills : [])].slice(0, 12);
  parsed.requiredSkillsDetail = mustAll.map((name, index) => ({ name, weight: index < 4 ? 3 : 2 }));
  parsed.niceToHaves = skillsIn(niceText).filter((s) => !mustAll.includes(s)).slice(0, 10);
  // Languages: not from benefits, and not "Vietnamese labor law"-style mentions.
  const langLines = sections.filter((s) => s.kind !== 'benefits').flatMap((s) => s.lines).filter((l) => !/\b(laws?|labou?r|legislation|insurance|company|market)\b/i.test(l)).join('\n');
  const langs = LANGUAGES.filter(([, re]) => re.test(langLines)).map(([name]) => name);
  if (langs.length) parsed.requiredLanguages = langs;

  const respBullets = bulletsIn(sections.filter((s) => s.kind === 'responsibilities').flatMap((s) => s.lines));
  const allBullets = bulletsIn(lines);
  parsed.responsibilities = (respBullets.length ? respBullets : allBullets).slice(0, 8).map((l) => clip(l, 300));
  const benefitBullets = bulletsIn(sections.filter((s) => s.kind === 'benefits').flatMap((s) => s.lines));
  if (benefitBullets.length) parsed.benefits = benefitBullets.slice(0, 12).map((l) => clip(l.replace(/^[^\w(]+/u, ''), 80)).filter(Boolean);

  const departmentMatch = text.match(/^\s*(?:department|team)\s*[:\-–]\s*([A-Za-z &]{3,50})$/im);
  if (departmentMatch) parsed.department = departmentMatch[1].trim();

  parsed.description = summaryFromText(lines.slice(1).join('\n'));
  parsed.interviewProcess = /screen/i.test(lower) || /interview process/i.test(lower)
    ? ['Recruiter screen', 'Technical / craft interview', 'Team conversation', 'Offer']
    : undefined;
  return parsed;
}

/**
 * Short summary for the swipe card (max 400 chars): the first real paragraph near the top (not a heading, bullet,
 * "Company:/Location:" line); when the text is all bullets, the first two bullets.
 */
export function summaryFromText(full) {
  const lines = String(full || '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const top = lines.slice(0, Math.max(6, Math.ceil(lines.length * 0.4)));
  const para = top.find((l) => l.length > 60 && !/^([-•*·o]|\d+[.)])\s/.test(l) && !/^(company|location|employer|employment type|work mode|salary)\s*:/i.test(l));
  if (para) return clip(para, 400);
  const bullets = bulletsIn(lines).filter((l) => l.length > 30).slice(0, 2);
  return clip(bullets.length ? bullets.join(' ') : lines.join(' '), 400);
}

/** How much the heuristic parser found (import uses Claude only when this is weak). */
export function parseStrength(parsed) {
  const found = [parsed.requiredSkillsDetail?.length, parsed.niceToHaves?.length, parsed.requiredLanguages?.length, parsed.responsibilities?.length, parsed.benefits?.length].filter(Boolean).length;
  return { found, weak: !parsed.requiredSkillsDetail?.length || found < 3 };
}

/** Parse with the Claude API when a key is configured. Falls back to heuristics on any failure. */
export async function parseJobText(text, url) {
  const key = serverAnthropicKey(); // off unless USE_SERVER_AI_KEY=true (founder, 2026-11-24)
  if (!key) return { parser: 'heuristic', parsed: heuristicParse(text, url) };
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: `Parse this job posting into JSON with keys: title, department, seniority (junior|mid|senior|lead|exec), requiredSkillsDetail (array of {name, weight 1-3}, most important first), niceToHaves (string array), type (Full-time|Part-time|Contract|Freelance|Internship), workMode (Remote|Hybrid|On-site|Flexible), location, salaryRange ({min, max, currency} annual, numbers), description (2-3 sentence summary), responsibilities (string array), interviewProcess (string array of stage names). Omit unknown fields. Reply with ONLY the JSON object.\n\nJob posting:\n${text.slice(0, 8000)}` }],
      }),
    });
    if (!response.ok) throw new Error(`Claude API ${response.status}`);
    const body = await response.json();
    const raw = body.content?.[0]?.text || '';
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    parsed.externalUrl = url || undefined;
    return { parser: 'claude', parsed };
  } catch {
    return { parser: 'heuristic', parsed: heuristicParse(text, url) };
  }
}
