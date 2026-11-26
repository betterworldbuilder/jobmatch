/**
 * Job text → JobsMatchNow job format ("jobsmatchnow-job/v1").
 *
 * The output carries every field of the JobsMatchNow job editor (Basics · Role details & skills · Compensation ·
 * Job groups), named exactly as the app's job model (server/jobs.js applyJob) so it imports without mapping.
 * Rule: nothing is invented. A field is filled only when the source states it; otherwise it is null / [].
 * Values read by heuristics from free text are listed in `review.check` so a person confirms them.
 */
export const FORMAT = 'jobsmatchnow-job/v1';

export function emptyJob() {
  return {
    format: FORMAT,
    // Step 1 · Basics
    title: null, company: null, department: null, openings: null, urgency: null, deadline: null,
    type: null, workMode: null, contractDuration: null, startDate: null, location: null, country: null,
    hiringRadiusKm: null, workVisaRequired: null, status: 'draft',
    // Step 2 · Role details & skills
    seniority: null, fullDescription: null, description: null,
    requiredSkillsDetail: [], niceToHaves: [], requiredLanguages: [], responsibilities: [],
    // Step 3 · Compensation
    salaryRange: null, salaryPeriod: null, salaryNegotiable: null, bonus: null, equity: null, benefits: [],
    workingHours: null, flexibleHours: null, probation: null, travel: null, hybridDays: null,
    visaSponsorship: null, relocationSupport: null, onCall: null, externalUrl: null,
    // Job groups (JobsMatchNow ids). Suggestions only: a person ticks them in the app.
    jobGroups: [], suggestedJobGroups: [],
    source: { url: null, name: null, method: null, retrievedAt: null },
    review: { check: [], notProvided: [] },
  };
}

const LANGS = ['English', 'Vietnamese', 'French', 'German', 'Spanish', 'Portuguese', 'Italian', 'Dutch', 'Japanese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese', 'Thai', 'Indonesian', 'Malay', 'Hindi', 'Arabic', 'Russian', 'Polish', 'Tagalog'];
const SKILL_DICT = ['Python', 'TensorFlow', 'PyTorch', 'AWS', 'Azure', 'GCP', 'MLOps', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Spark', 'Airflow', 'dbt', 'Kafka',
  'Java', 'Kotlin', 'Go', 'Golang', 'Rust', 'C++', 'C#', '.NET', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'GraphQL', 'Swift', 'Flutter', 'React Native',
  'LLM', 'LLMs', 'GenAI', 'RAG', 'LangChain', 'LangGraph', 'LlamaIndex', 'MCP', 'vLLM', 'LoRA', 'Qdrant', 'pgvector', 'OpenSearch', 'Milvus', 'Elasticsearch', 'Redis', 'FastAPI', 'Django', 'Flask', 'Spring', 'NLP', 'Computer Vision', 'Machine Learning', 'Deep Learning', 'Scikit-learn', 'Pandas', 'Snowflake', 'Databricks', 'Linux', 'Figma', 'Design systems', 'Prototyping'];
const GROUP_RULES = {
  'g-ai-ml': /\b(ai|llm|machine learning|ml|mlops|deep learning|nlp|computer vision|genai|generative|tensorflow|pytorch)\b/i,
  'g-data': /\b(data|analytics|bi|etl|warehouse|database|dba|spark|airflow|dbt)\b/i,
  'g-cloud-devops': /\b(cloud|devops|sre|site reliability|platform|infrastructure|kubernetes|aws|azure|gcp|mlops|terraform)\b/i,
  'g-software': /\b(software|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|developer)\b/i,
};
const HEADINGS = [
  ['about', /^about (the )?(job|company|us|team)\b/i],
  ['role', /^(the role|about the role|role overview|overview|the position|position summary|summary|job summary)\b/i],
  ['resp', /^(what you('|’)?ll do|what you will do|responsibilities|key responsibilities|your role|duties|your mission|day to day)\b/i],
  ['req', /^(what we('|’)?re looking for|what we are looking for|requirements|qualifications|must[- ]haves?|you have|who you are|skills( required)?|about you)\b/i],
  ['nice', /^(nice to have|nice-to-have|bonus points|preferred( qualifications)?|pluses|good to have)\b/i],
  ['benefits', /^(benefits?|perks|what we offer|why join( us)?|compensation (and|&) benefits|our benefits|welfare)\b/i],
  ['apply', /^(how to apply|to apply|application process)\b/i],
];

/** Text as people mean it: "𝐇𝐈𝐑𝐈𝐍𝐆" / "𝑳𝒐𝒄𝒂𝒕𝒊𝒐𝒏" (styled Unicode from social posts) → "HIRING" / "Location". */
export const plainText = (s) => String(s || '').normalize('NFKC').replace(/\r\n/g, '\n').trim();

const ROLE_WORD = /\b(engineer|developer|manager|analyst|analysr|lead|designer|scientist|architect|qa|qc|tester|devops|sre|specialist|consultant|administrator|admin|director|head|officer|intern|accountant|recruiter|programmer|technician|owner|scrum master)\b/i;
const PLACES = [[/\b(hcmc|hcm|ho chi minh|saigon|sài gòn|hồ chí minh)\b/i, 'Ho Chi Minh City, Vietnam'], [/\b(hanoi|ha noi|hà nội)\b/i, 'Hanoi, Vietnam'], [/\b(da nang|danang|đà nẵng)\b/i, 'Da Nang, Vietnam']];

/**
 * A post that lists several roles ("1. QA Manager (8+ yoe) - Negotiable", "2. …") → one text per role, each with the
 * post's shared lines (location, language, how to apply). Returns null for a normal single job description.
 */
export function splitRoles(raw) {
  const text = plainText(raw);
  const lines = text.split('\n');
  const items = [];
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:\d{1,2}[.)]|[-•▪●◦*])\s+(.{3,160})$/);
    if (!m) return;
    const title = m[1].split(/\s+[-–—|]\s+|\s*\(/)[0].replace(/[:.]$/, '').trim();
    if (title.split(/\s+/).length <= 8 && ROLE_WORD.test(title)) items.push({ i, line: m[1].trim(), title });
  });
  // At least 2 role lines, and they are the post's main list (not a few role words inside responsibilities).
  if (items.length < 2 || items.length < lines.filter((l) => /^\s*(?:\d{1,2}[.)]|[-•▪●◦*])\s+/.test(l)).length * 0.6) return null;
  const roleIdx = new Set(items.map((x) => x.i));
  const header = lines.slice(0, items[0].i).join('\n').trim();
  const footer = lines.slice(items.at(-1).i + 1).filter((_, k) => !roleIdx.has(items.at(-1).i + 1 + k)).join('\n').trim();
  return items.map((it, n) => {
    const place = PLACES.find(([re]) => re.test(it.line))?.[1];
    const based = it.line.match(/must (?:be )?based in ([^-–—,)]+)/i)?.[1]?.trim();
    const yoe = it.line.match(/(\d{1,2})\s*\+?\s*(?:yoe|years?)/i)?.[1];
    const extra = (it.line.match(/\(([^)]*)\)/)?.[1] || '').split(',').map((s) => s.trim()).filter((s) => s && !/\b(yoe|years?|exp|experience|domain)\b/i.test(s));
    const parts = [
      `Title: ${it.title}`,
      place ? `Location: ${place}${based ? ` (must be based in ${based})` : ''}` : null,
      it.line,
      extra.length ? `Requirements:\n${extra.map((s) => `- Experience with ${s}`).join('\n')}` : null,
      header, footer,
    ].filter(Boolean);
    return { index: n + 1, count: items.length, title: it.title, yoe: yoe ? Number(yoe) : null, text: parts.join('\n\n') };
  });
}

const clean = (s) => String(s ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
const isBullet = (l) => /^([-•*·▪●◦]|\d{1,2}[.)])\s+/.test(l);
const unbullet = (l) => l.replace(/^([-•*·▪●◦]|\d{1,2}[.)])\s+/, '').trim();
const headingKey = (line) => {
  const l = line.replace(/[:：]\s*$/, '').trim();
  if (l.length > 60 || isBullet(line)) return null;
  for (const [k, re] of HEADINGS) if (re.test(l)) return k;
  return null;
};

/** Split a JD into known sections (by headings) → { key: lines[] }, plus `intro` for text before the first heading. */
export function sectionize(text) {
  const out = { intro: [] }; let cur = 'intro';
  for (const raw of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const line = clean(raw);
    if (!line) continue;
    const k = headingKey(line);
    if (k) { cur = k; out[cur] = out[cur] || []; continue; }
    (out[cur] = out[cur] || []).push(line);
  }
  return out;
}

const firstMatch = (text, re) => { const m = text.match(re); return m ? clean(m[1]).replace(/[.;,]$/, '') : null; };
// "Location: …", also after an emoji or symbol ("📍 Location: Vietnam").
const label = (text, names) => firstMatch(text, new RegExp(`^[^\\p{L}\\p{N}\\n]*(?:${names})\\s*[:\\-–]\\s*(.+)$`, 'imu'));

// A skill name: short, and not a phrase about fields, years, abilities or vague kinds of things.
const NOT_A_SKILL = /\b(related|field|fields|years?|experience|ability|abilities|skills?|knowledge|understanding|background|trendy|similar|etc|other|various|equivalent|plus|degree)\b/i;
const short = (s) => s && s.length <= 40 && s.split(/\s+/).length <= 4 && /[A-Za-z]/.test(s) && !NOT_A_SKILL.test(s);
const splitList = (s) => s.split(/,|\band\b|\bor\b|·/i).map((x) => x.trim().replace(/^(the|a|an)\s+/i, '').replace(/[.:;]+$/, '').trim()).filter(short);

/**
 * Skills named in one requirement line:
 * "Solid, recent experience with Python" → Python · "Strong Python; experience with frameworks such as LangChain,
 * LlamaIndex or similar" → Python, LangChain, LlamaIndex · "Cloud deployment (AWS/Azure/GCP), Docker, CI/CD" → each item.
 */
export function skillsFromBullet(bullet) {
  const out = [];
  for (let part of unbullet(bullet).replace(/[.;]$/, '').split(/;/)) {
    part = part.trim(); if (!part) continue;
    const ex = part.match(/\b(?:such as|e\.g\.,?|including|like)\s+(.+)$/i);
    if (ex) { out.push(...splitList(ex[1].replace(/\(.*?\)/g, '').replace(/\b(or similar|or equivalent|etc)\b.*$/i, '').replace(/\.\.\.|…/g, ''))); continue; }
    const m = part.match(/(?:experience (?:with|in|using|of)|knowledge of|proficien\w* (?:in|with)|familiar\w* with|expertise (?:in|with)|skilled (?:in|with)|hands-on (?:with)?|background in|understanding of)\s+(.+)$/i);
    if (m) { out.push(...splitList(m[1].replace(/\(.*?\)/g, ''))); continue; }
    const lead = part.match(/^(?:strong|solid|good|excellent|deep|proven|advanced)\s+(.{2,40})$/i);
    if (lead) { out.push(...splitList(lead[1])); continue; }
    if (part.split(/\s+/).length <= 4) { out.push(...splitList(part)); continue; }
    // A comma list of tools ("Cloud deployment (AWS/Azure/GCP), Docker/Kubernetes, CI/CD"), not of outcomes or
    // qualifications ("users served, latency or cost improvements", "Bachelor's degree in CS, AI…").
    if (part.includes(',') && !/\b(degree|bachelor|master|phd|diploma|years?|results?|metrics?)\b/i.test(part)) {
      const items = splitList(part.replace(/\(.*?\)/g, ''));
      const techy = items.filter((x) => /^[A-Z]|[A-Z]{2}|[/.+#]/.test(x)).length;
      if (items.length && techy * 2 >= items.length) out.push(...items);
    }
  }
  return [...new Set(out)];
}
/** Only the bullet points of a section when it has some (skips "Please note: …" paragraphs). */
const bulletsOf = (lines = []) => (lines.some(isBullet) ? lines.filter(isBullet) : lines);
const isQualification = (b) => /\b(degree|bachelor|master'?s|phd|diploma|graduated?)\b/i.test(b);
const weightOf = (bullet) => (/\b(solid|strong|expert|deep|extensive|proven|advanced|must)\b/i.test(bullet) ? 3 : 2);
const languagesIn = (s) => LANGS.filter((l) => new RegExp(`\\b${l}\\b`, 'i').test(s));
const isLanguageBullet = (b) => languagesIn(b).length > 0 && (/\b(daily work|fluen\w*|language|speak|spoken|written|proficien\w*|native|business level)\b/i.test(b) || b.split(/\s+/).length <= 5);

const TYPE = (s) => { const t = String(s || '').toLowerCase().replace(/_/g, '-'); return /full[- ]?time/.test(t) ? 'Full-time' : /part[- ]?time/.test(t) ? 'Part-time' : /contract|temporary/.test(t) ? 'Contract' : /freelance/.test(t) ? 'Freelance' : /intern/.test(t) ? 'Internship' : null; };
const SENIORITY = (s) => { const t = String(s || ''); return /\b(vp|vice president|head of|director|chief|cto|ceo)\b/i.test(t) ? 'exec' : /\b(lead|principal|staff)\b/i.test(t) ? 'lead' : /\b(senior|sr\.?)\b/i.test(t) ? 'senior' : /\b(junior|jr\.?|entry[- ]level|graduate|intern)\b/i.test(t) ? 'junior' : /\b(mid[- ]level|intermediate)\b/i.test(t) ? 'mid' : null; };

/** Salary written in text: "USD 72,000 – 108,000", "$72k-$108k / year", "30–45 million VND per month". */
export function salaryFromText(text) {
  const cur = '(USD|EUR|GBP|VND|SGD|AUD|CAD|JPY|\\$|€|£|₫)';
  const num = '(\\d[\\d.,]*)\\s*(k|m|million)?';
  const re = new RegExp(`${cur}?\\s?${num}\\s*(?:-|–|—|to)\\s*${cur}?\\s?${num}\\s*${cur}?(?:\\s*(?:per|/|a)\\s*(year|yr|annum|month|mo|hour|hr|day))?`, 'i');
  for (const line of String(text).split('\n')) {
    if (!/salary|compensation|pay|\$|€|£|₫|usd|eur|gbp|vnd|sgd/i.test(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const currencyRaw = m[1] || m[4] || m[7];
    if (!currencyRaw) continue;
    const val = (n, suf) => { let v = Number(String(n).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')); if (/k/i.test(suf || '')) v *= 1000; if (/m/i.test(suf || '')) v *= 1e6; return Math.round(v); };
    const min = val(m[2], m[3] || m[6]); const max = val(m[5], m[6]);
    if (!(min > 0) || !(max >= min)) continue;
    const currency = { $: 'USD', '€': 'EUR', '£': 'GBP', '₫': 'VND' }[currencyRaw] || currencyRaw.toUpperCase();
    const p = (m[8] || '').toLowerCase();
    return { range: { min, max, currency }, period: p ? (/^(year|yr|annum)/.test(p) ? 'year' : /^mo/.test(p) ? 'month' : /^h/.test(p) ? 'hour' : 'day') : null };
  }
  return null;
}

export function deadlineFromText(text) {
  const raw = firstMatch(text, /\b(?:apply by|closing date|application deadline|deadline|applications close(?:s)?(?: on)?)\s*[:\-–]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2} [A-Za-z]{3,9},? \d{4}|[A-Za-z]{3,9} \d{1,2},? \d{4})/i);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * Pasted text → one or more jobs. A post listing several roles gives one job per role (same source link, numbered
 * `source.part`), otherwise a single job. Seniority from "N+ yoe" only when the title says nothing (marked Check).
 */
export function parsePosted({ text = '', url = null, sourceName = null, method = 'pasted text' } = {}) {
  const roles = splitRoles(text);
  if (!roles) return [parseJob({ text, url, sourceName, method })];
  return roles.map((r) => {
    const j = parseJob({ text: r.text, url, sourceName, method: `${method} (post with ${r.count} roles)` });
    if (!j.seniority && r.yoe !== null) {
      j.seniority = r.yoe >= 5 ? 'senior' : r.yoe >= 3 ? 'mid' : 'junior';
      j.review.check.push('seniority'); j.review.notProvided = j.review.notProvided.filter((k) => k !== 'seniority');
    }
    j.source.part = `${r.index}/${r.count}`;
    return j;
  });
}

/**
 * Parse a job. `posting` = a schema.org JobPosting object (from the page's JSON-LD) when there is one;
 * `text` = the job description as plain text. Returns the JobsMatchNow job object.
 */
export function parseJob({ text = '', posting = null, url = null, sourceName = null, method = null } = {}) {
  const job = emptyJob();
  const fromSource = new Set();
  const check = new Set();
  const set = (k, v, how) => { if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return; job[k] = v; (how === 'source' ? fromSource : check).add(k); };
  const body = plainText(text);
  const sec = sectionize(body);
  const all = body;

  // --- Structured data first (what the page states in schema.org JobPosting) ---
  if (posting) {
    set('title', clean(posting.title) || null, 'source');
    const org = posting.hiringOrganization;
    set('company', clean(typeof org === 'string' ? org : org?.name) || null, 'source');
    const locs = [].concat(posting.jobLocation || []).map((l) => l?.address || {}).map((a) => (typeof a === 'string' ? a : [a.addressLocality, a.addressRegion, a.addressCountry?.name || a.addressCountry].filter(Boolean).join(', '))).filter(Boolean);
    set('location', locs[0] || null, 'source');
    if (/telecommute/i.test(String(posting.jobLocationType || ''))) set('workMode', 'Remote', 'source');
    set('type', TYPE([].concat(posting.employmentType || []).join(' ')), 'source');
    if (posting.validThrough && !Number.isNaN(Date.parse(posting.validThrough))) set('deadline', new Date(posting.validThrough).toISOString().slice(0, 10), 'source');
    if (Number(posting.totalJobOpenings) > 0) set('openings', Number(posting.totalJobOpenings), 'source');
    const bs = posting.baseSalary; const v = bs?.value;
    const min = Number(v?.minValue ?? v?.value); const max = Number(v?.maxValue ?? v?.value);
    if (bs?.currency && min > 0 && max >= min) {
      set('salaryRange', { min: Math.round(min), max: Math.round(max), currency: String(bs.currency).toUpperCase() }, 'source');
      const unit = String(v?.unitText || '').toLowerCase();
      if (unit) set('salaryPeriod', unit.startsWith('year') ? 'year' : unit.startsWith('month') ? 'month' : unit.startsWith('hour') ? 'hour' : unit, 'source');
    }
    set('department', clean(posting.occupationalCategory?.name || '') || null, 'source');
    if (posting.directApply === undefined && posting.url) set('externalUrl', String(posting.url), 'source');
  }

  // --- Free text (every value below is checked by a person) ---
  const hiring = all.match(/(?:^|[.!?]\s+|\n)([A-Z][\w&'\- ]{0,40}?) is hiring (?:an? |for an? )?([^.\n]{3,80}?)(?:\.|\n|$)/);
  if (!job.title) set('title', label(all, '(?:job\\s*)?title|position|role') || (hiring ? clean(hiring[2]) : null) || (/^[^.!?]{3,80}$/.test((sec.intro[0] || '')) && !/^about/i.test(sec.intro[0]) ? sec.intro[0] : null));
  if (!job.company) set('company', label(all, 'company|employer|organi[sz]ation') || (hiring ? clean(hiring[1]) : null));
  set('department', job.department ? null : label(all, 'department|team'));
  if (!job.location) set('location', label(all, 'location|based in|office location'));
  if (!job.workMode) {
    // Only phrases that describe how THIS job is done ("Remote collaboration" or "hybrid cloud" are not a work mode).
    const l = all.toLowerCase();
    const said = (w) => new RegExp(`(work mode|workplace|work arrangement|location|job type)\\s*[:\\-–][^\\n]*\\b${w}\\b|^\\s*${w}\\s*$|\\(${w}\\)|\\b${w}\\s+(roles?|positions?|jobs?|work|working|model|setup|schedule|policy|team|opportunit(?:y|ies))\\b|\\b(fully|100%|work)\\s+${w}\\b|\\b${w}[- ]first\\b`, 'im').test(l);
    const modes = [said('hybrid') && 'Hybrid', (said('remote') || /\bwork remotely\b/.test(l)) && 'Remote', (said('on[- ]?site') || said('onsite') || /\bin[- ]office\b/.test(l)) && 'On-site'].filter(Boolean);
    set('workMode', modes.includes('Hybrid') ? 'Hybrid' : modes.length === 1 ? modes[0] : null);
  }
  if (!job.type) set('type', TYPE(all.match(/\b(full[- ]?time|part[- ]?time|contract(?:or)?|freelance|internship)\b/i)?.[0]));
  set('contractDuration', /\bpermanent\b/i.test(all) ? 'Permanent' : firstMatch(all, /\b(\d{1,2}[- ]months?)\s+(?:contract|fixed[- ]term)/i));
  set('startDate', firstMatch(all, /\bstart(?:ing)?(?: date)?\s*[:\-–]?\s*(asap|as soon as possible|immediately|within \d+ (?:weeks?|months?)|(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{4}|\d{4}-\d{2}-\d{2})/i));
  if (!job.deadline) set('deadline', deadlineFromText(all));
  if (!job.openings) { const o = all.match(/\b(\d{1,3}) (?:open (?:positions|roles)|openings|positions|hires)\b/i); if (o) set('openings', Number(o[1])); }
  set('urgency', /\burgent(ly)?\b/i.test(all) ? 'Urgent' : null);
  set('seniority', SENIORITY(job.title) || SENIORITY((sec.role || sec.intro || []).join(' ')));
  if (/\b(must|need to|required to) (?:have|hold) (?:the )?(?:legal )?(right to work|valid work (?:visa|permit)|work authori[sz]ation)\b/i.test(all)) set('workVisaRequired', true);

  // Sections → lists.
  const resp = (sec.resp || []).map(unbullet).filter((l) => l.length > 3).slice(0, 15);
  set('responsibilities', resp);
  const must = []; const langs = new Set();
  for (const b of bulletsOf(sec.req)) {
    if (isLanguageBullet(b)) { languagesIn(b).forEach((l) => langs.add(l)); continue; }
    if (isQualification(b)) continue;
    for (const name of skillsFromBullet(b)) if (!must.some((s) => s.name.toLowerCase() === name.toLowerCase())) must.push({ name, weight: weightOf(b) });
  }
  const nice = [];
  for (const b of bulletsOf(sec.nice)) {
    if (isLanguageBullet(b) || isQualification(b)) continue;
    const s = skillsFromBullet(b); (s.length ? s : [unbullet(b).replace(/[.;]$/, '')]).forEach((n) => { if (short(n) && !nice.includes(n)) nice.push(n); });
  }
  // Well-known tools named in the requirements (or anywhere, when there is no requirements section).
  const dictHits = (text) => SKILL_DICT.filter((s) => new RegExp(`(^|[^\\w])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w]|$)`, 'i').test(text));
  const reqText = (sec.req || []).join('\n');
  const known = new Set([...must.map((s) => s.name.toLowerCase()), ...nice.map((n) => n.toLowerCase())]);
  for (const name of dictHits(reqText || all).slice(0, 15)) if (!known.has(name.toLowerCase()) && ![...known].some((k) => k.includes(name.toLowerCase()))) { must.push({ name, weight: 2 }); known.add(name.toLowerCase()); }
  // Named tools first (they are the clearest signal), then the rest; JobsMatchNow keeps it short.
  const isTool = (n) => SKILL_DICT.some((s) => s.toLowerCase() === n.toLowerCase()) || /[A-Z]{2}|[/.+#]|^[A-Z][a-z]+[A-Z]/.test(n);
  set('requiredSkillsDetail', [...must.filter((s) => isTool(s.name)), ...must.filter((s) => !isTool(s.name))].slice(0, 15));
  set('niceToHaves', nice.slice(0, 15));
  // "Language: English", "fluent Vietnamese", or a line that starts with the language ("English: Upper Intermediate").
  if (!langs.size) for (const line of all.split('\n')) if (/\b(language|fluen\w*|spoken|written)\b/i.test(line) || new RegExp(`^\\W*(${LANGS.join('|')})\\s*[:\\-–]`, 'i').test(line)) languagesIn(line).forEach((l) => langs.add(l));
  set('requiredLanguages', [...langs]);
  set('benefits', (sec.benefits || []).filter(isBullet).map(unbullet).map((s) => s.replace(/[.;]$/, '')).filter((s) => s.length <= 80).slice(0, 20));

  // Compensation details.
  if (!job.salaryRange) { const s = salaryFromText(all); if (s) { set('salaryRange', s.range); set('salaryPeriod', s.period); } }
  if (/\b(salary )?negotiable\b/i.test(all)) set('salaryNegotiable', true);
  set('bonus', label(all, 'bonus'));
  set('equity', label(all, 'equity|stock options'));
  set('workingHours', label(all, 'working hours|hours'));
  set('flexibleHours', label(all, 'flexibility|flexible hours'));
  set('probation', label(all, 'probation(?: period)?'));
  set('travel', label(all, 'travel') || firstMatch(all, /\b(up to \d{1,2}% travel)\b/i));
  set('onCall', label(all, 'on[- ]call'));
  const hd = all.match(/\b(\d)\s*days?\s*(?:a|per|\/)\s*week\s*(?:in|at)\s*(?:the\s*)?office\b/i); if (hd) set('hybridDays', Number(hd[1]));
  if (/\b(no visa sponsorship|(unable|not able) to (offer|provide)? ?(visa )?sponsor|cannot sponsor|does not sponsor)\b/i.test(all)) set('visaSponsorship', false);
  else if (/\bvisa sponsorship (is )?(available|provided|offered)\b|\bwe (will |can )?sponsor\b/i.test(all)) set('visaSponsorship', true);
  if (/\brelocation (support|assistance|package) (is )?(available|provided|offered)\b/i.test(all)) set('relocationSupport', true);
  else if (/\bno relocation\b/i.test(all)) set('relocationSupport', false);

  // Descriptions: the whole JD as written, and a short summary from "The role" (or the first real paragraph).
  if (body) { job.fullDescription = body.replace(/\n+[-•*·]\s*$/, '').slice(0, 20000); fromSource.add('fullDescription'); }
  const summarySrc = (sec.role || []).find((l) => !isBullet(l) && l.length > 20) || (sec.about || sec.intro || []).find((l) => !isBullet(l) && l.length > 60);
  if (summarySrc) set('description', summarySrc.length > 400 ? `${summarySrc.slice(0, 397).replace(/\s+\S*$/, '')}…` : summarySrc);

  // Source and groups.
  job.externalUrl = job.externalUrl || url || null;
  job.source = { url: url || null, name: sourceName || null, method: method || (posting ? 'schema.org JobPosting' : 'text'), retrievedAt: new Date().toISOString() };
  const groupText = [job.title, ...(job.requiredSkillsDetail || []).map((s) => s.name)].filter(Boolean).join(' ');
  job.suggestedJobGroups = Object.entries(GROUP_RULES).filter(([, re]) => re.test(groupText)).map(([id]) => id);

  const reviewable = ['title', 'company', 'department', 'openings', 'urgency', 'deadline', 'type', 'workMode', 'contractDuration', 'startDate', 'location', 'workVisaRequired', 'seniority', 'description',
    'requiredSkillsDetail', 'niceToHaves', 'requiredLanguages', 'responsibilities', 'salaryRange', 'salaryNegotiable', 'bonus', 'equity', 'benefits', 'workingHours', 'flexibleHours', 'probation', 'travel', 'hybridDays',
    'visaSponsorship', 'relocationSupport', 'onCall'];
  job.review.check = reviewable.filter((k) => check.has(k) && !fromSource.has(k));
  job.review.notProvided = reviewable.filter((k) => job[k] === null || (Array.isArray(job[k]) && !job[k].length));
  return job;
}
