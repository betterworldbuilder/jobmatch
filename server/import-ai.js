/**
 * Claude fallback for job imports (founder, 2026-11-25): when the built-in parser finds too little in a row's
 * job description, ask Claude to extract the fields as strict JSON. Only for accounts whose email is listed in
 * IMPORT_AI_EMAILS, and only with that account's own saved Claude key (Use My ChatBot) - never a shared key.
 * Same raw-fetch style as the other Claude calls in this server (jobs.js, ai-chat.js); no SDK dependency.
 */

const API_URL = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-5-5';
const TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
const MODES = ['Remote', 'Hybrid', 'On-site', 'Flexible'];
const LEVELS = ['junior', 'mid', 'senior', 'lead', 'exec'];

/** Emails allowed to use the Claude fallback (comma-separated env, case-insensitive). */
export function importAiAllowed(email, env = process.env) {
  const list = String(env.IMPORT_AI_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && list.includes(String(email).trim().toLowerCase());
}

// Structured output: Claude must return exactly this shape (strings may be empty, arrays may be empty).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'mustHave', 'niceToHave', 'languages', 'seniority', 'company', 'workMode', 'employmentType', 'location', 'salaryMin', 'salaryMax', 'salaryCurrency', 'responsibilities', 'benefits'],
  properties: {
    summary: { type: 'string', description: '1-2 sentences for a swipe card: what the role is and why it matters. Max 400 characters.' },
    mustHave: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'weight'], properties: { name: { type: 'string' }, weight: { type: 'integer', enum: [1, 2, 3] } } }, description: 'Required skills/technologies, most important first, short names (e.g. "Python", "Kubernetes", "RAG"). Weight 3 = critical.' },
    niceToHave: { type: 'array', items: { type: 'string' }, description: 'Skills listed as nice to have / preferred / a plus.' },
    languages: { type: 'array', items: { type: 'string' }, description: 'Spoken languages the role requires, e.g. "English".' },
    seniority: { type: 'string', enum: ['', ...LEVELS] },
    company: { type: 'string', description: 'The hiring company name if stated, else empty.' },
    workMode: { type: 'string', enum: ['', ...MODES] },
    employmentType: { type: 'string', enum: ['', ...TYPES] },
    location: { type: 'string' },
    salaryMin: { type: 'integer', description: '0 when no salary is stated.' },
    salaryMax: { type: 'integer', description: '0 when no maximum is stated.' },
    salaryCurrency: { type: 'string', description: 'ISO code like USD or VND, empty when no salary.' },
    responsibilities: { type: 'array', items: { type: 'string' }, description: 'Up to 8 short bullet points.' },
    benefits: { type: 'array', items: { type: 'string' }, description: 'Up to 12 benefits, each under 80 characters.' },
  },
};

const SYSTEM = 'You extract structured fields from job descriptions for a hiring app. Use only what the text states; leave a field empty rather than guess. Skill names are short and standard.';

/** Map Claude's JSON to the job fields the importer understands (only non-empty values). */
export function toParsedFields(out) {
  const p = {};
  const s = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  if (s(out.summary, 400)) p.description = s(out.summary, 400);
  const must = (Array.isArray(out.mustHave) ? out.mustHave : []).map((x) => ({ name: s(x?.name, 60), weight: [1, 2, 3].includes(x?.weight) ? x.weight : 2 })).filter((x) => x.name).slice(0, 12);
  if (must.length) p.requiredSkillsDetail = must;
  const list = (v, items, n) => (Array.isArray(v) ? v.map((x) => s(x, n)).filter(Boolean).slice(0, items) : []);
  const nice = list(out.niceToHave, 10, 60).filter((n) => !must.some((m) => m.name.toLowerCase() === n.toLowerCase()));
  if (nice.length) p.niceToHaves = nice;
  if (list(out.languages, 8, 40).length) p.requiredLanguages = list(out.languages, 8, 40);
  if (LEVELS.includes(out.seniority)) p.seniority = out.seniority;
  if (s(out.company, 80)) p.company = s(out.company, 80);
  if (MODES.includes(out.workMode)) p.workMode = out.workMode;
  if (TYPES.includes(out.employmentType)) p.type = out.employmentType;
  if (s(out.location, 120)) p.location = s(out.location, 120);
  const min = Number(out.salaryMin) || 0; const max = Number(out.salaryMax) || 0; const currency = s(out.salaryCurrency, 8)?.toUpperCase();
  if (min > 0 && currency) p.salaryRange = max >= min ? { min, max, currency } : { min, currency };
  if (list(out.responsibilities, 8, 300).length) p.responsibilities = list(out.responsibilities, 8, 300);
  if (list(out.benefits, 12, 80).length) p.benefits = list(out.benefits, 12, 80);
  return p;
}

/**
 * One extraction call. Returns { ok: true, fields } or { ok: false, reason } - never throws, so a Claude problem
 * never blocks the import (the built-in parser's result is kept).
 */
export async function aiParseJob(text, { key, model = DEFAULT_MODEL, fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  if (!key) return { ok: false, reason: 'no_key' };
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const send = (withFallbacks) => {
    const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    const body = {
      model, max_tokens: 16000, system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `Job description:\n\n${String(text).slice(0, 20000)}` }],
    };
    // Refusal fallback (server-side): a declined request is retried on a fallback model in the same call.
    if (withFallbacks) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
    return fetchImpl(API_URL(), { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
  };
  try {
    let res = await send(true);
    if (res.status === 400) res = await send(false); // account or model without the fallback beta
    if (!res.ok) return { ok: false, reason: res.status === 401 || res.status === 403 ? 'key_refused' : res.status === 429 ? 'busy' : `http_${res.status}` };
    const body = await res.json();
    if (body.stop_reason === 'refusal') return { ok: false, reason: 'refused' };
    const raw = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    let out;
    try { out = JSON.parse(raw); } catch { return { ok: false, reason: 'bad_json' }; }
    return { ok: true, fields: toParsedFields(out) };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally { clearTimeout(timer); }
}
