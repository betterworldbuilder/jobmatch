// "Ask AI" for signed-in job seekers: answers questions about the member's OWN JobsMatchNow data.
//
// - Read-only: it never applies, messages, or edits anything.
// - Data minimisation: the model gets a short, structured summary built from the member's bootstrap —
//   target roles, skill names, work preferences, top matching roles (title, company, fit, matched/missing
//   skills), their matches (role, company, stage, next step date) and skill gaps. Never: name, email,
//   phone, contact channels, CV text, salary, other people's details beyond role/company.
// - Provider is configurable server-side (env), keys never reach the browser:
//     AI_CHAT_PROVIDER = anthropic | openai   (unset = feature off)
//     AI_CHAT_MODEL    = model name (defaults per provider)
//     ANTHROPIC_API_KEY / OPENAI_API_KEY
//     AI_CHAT_DAILY_LIMIT = questions per member per day (default 20)
//     AI_CHAT_ANTHROPIC_URL / AI_CHAT_OPENAI_URL = endpoint override (tests / proxies)
// - Logging: no keys, no questions, no answers, no CV — only provider status codes.
import { runTool } from './mcp.js';

export const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_MODELS = { anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini' };
const LABEL = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI (ChatGPT)' };

/** Provider settings read at request time (so ops can change env without code). */
export function providerConfig(env = process.env) {
  const provider = String(env.AI_CHAT_PROVIDER || '').toLowerCase();
  if (!['anthropic', 'openai'].includes(provider)) return { enabled: false, reason: 'not_configured' };
  const key = provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (!key) return { enabled: false, reason: 'missing_key', provider };
  const limit = Math.max(1, Math.min(500, Number(env.AI_CHAT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT));
  return { enabled: true, provider, label: LABEL[provider], model: env.AI_CHAT_MODEL || DEFAULT_MODELS[provider], key, limit,
    url: provider === 'anthropic' ? (env.AI_CHAT_ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages') : (env.AI_CHAT_OPENAI_URL || 'https://api.openai.com/v1/chat/completions') };
}

/** Minimal, structured context from the member's own bootstrap. Returns { text, sources, empty }. */
export function buildContext(boot, now = Date.now()) {
  const v = boot.viewer || {};
  const skills = (v.skillsDetail?.map((s) => s.name) || v.skills || []).slice(0, 25);
  const targets = v.preferences?.desiredRoles?.length ? v.preferences.desiredRoles : [v.title].filter(Boolean);
  const mode = v.preferences?.workMode?.mode;
  const jobs = [...(boot.jobs || [])].filter((j) => typeof j.match?.score === 'number').sort((a, b) => b.match.score - a.match.score).slice(0, 8);
  const matches = (boot.matches || []).filter((m) => m.candidateId === v.id && m.stage !== 'Archived').slice(0, 10);
  const sources = [];
  const jobLines = jobs.map((j, i) => {
    const ref = `J${i + 1}`; sources.push({ ref, kind: 'job', id: j.id, label: `${j.title} · ${j.company}` });
    const req = (j.requiredSkillsDetail?.map((s) => s.name) || j.requiredSkills || []).slice(0, 8);
    return `[${ref}] ${j.title} at ${j.company} | fit ${j.match.score}% | work mode ${j.workMode || 'n/a'} | location ${j.location || 'n/a'} | must-have skills: ${req.join(', ') || 'not listed'} | nice to have: ${(j.niceToHaves || []).slice(0, 5).join(', ') || 'not listed'} | you have: ${(j.match.matchedSkills || []).join(', ') || 'none'} | missing: ${(j.match.missingSkills || []).join(', ') || 'none'}`;
  });
  const matchLines = matches.map((m, i) => {
    const ref = `M${i + 1}`; sources.push({ ref, kind: 'match', id: m.id, label: `Match: ${m.job?.title || 'role'} · ${m.job?.company || ''}` });
    const step = (m.pipeline || []).find((s) => s.id === m.currentStepId);
    return `[${ref}] ${m.job?.title || 'role'} at ${m.job?.company || 'n/a'} | stage ${m.stage}${step ? ` | current step: ${step.name}${step.date ? ` on ${step.date}` : ''}` : ''}`;
  });
  const gaps = runTool('get_skill_gaps', boot, now).slice(0, 8).map((g) => `${g.skill} (asked in ${g.askedInRoles} roles)`);
  const next = runTool('get_next_interview', boot, now);
  const nextLine = next && !next.none ? `${next.what} for ${next.role || 'a role'} on ${String(next.when).slice(0, 16).replace('T', ' ')}${next.format ? ` (${next.format})` : ''}` : 'none scheduled';
  if (next && !next.none) sources.push({ ref: 'N1', kind: 'interview', label: `Next interview: ${next.what}` });
  const empty = !jobs.length && !matches.length && !skills.length;
  const text = [
    'MEMBER PROFILE (own data, minimal):',
    `- Current title: ${v.title || 'not set'}; target roles: ${targets.join(', ') || 'not set'}`,
    `- Skills: ${skills.join(', ') || 'none listed'}`,
    `- Work mode preference: ${mode || 'not set'}; availability: ${v.preferences?.availability || v.availability || 'not set'}`,
    '',
    `TOP MATCHING ROLES (${jobLines.length}):`, ...(jobLines.length ? jobLines : ['none']),
    '',
    `MY MATCHES / APPLICATIONS (${matchLines.length}):`, ...(matchLines.length ? matchLines : ['none']),
    '',
    `SKILL GAPS: ${gaps.join('; ') || 'none found'}`,
    `[N1] NEXT INTERVIEW: ${nextLine}`,
  ].join('\n');
  return { text, sources, empty };
}

export const SYSTEM_PROMPT = [
  'You are the JobsMatchNow assistant for a job seeker. Answer ONLY from the DATA block about this member.',
  'Rules: cite the items you use with their tags like [J1], [M2], [N1]. If the data does not contain the answer, say so plainly and suggest what the member can add or do in the app.',
  'Never invent jobs, companies, requirements, dates, salaries or matches. You are read-only: you cannot apply, message recruiters or change the profile — say so if asked.',
  'Be concise (under 180 words), friendly, plain words. Use short bullet points when listing.',
].join(' ');

/** One provider call. Throws { status, code } on failure. */
export async function callProvider(cfg, { context, question, history = [] }, fetchImpl = fetch) {
  const turns = history.slice(-6).map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content || '').slice(0, 1000) }));
  const user = `DATA:\n${context}\n\nQUESTION: ${question}`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = cfg.provider === 'anthropic'
      ? await fetchImpl(cfg.url, { method: 'POST', signal: ctrl.signal, headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 600, system: SYSTEM_PROMPT, messages: [...turns, { role: 'user', content: user }] }) })
      : await fetchImpl(cfg.url, { method: 'POST', signal: ctrl.signal, headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 600, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...turns, { role: 'user', content: user }] }) });
    if (!res.ok) { console.warn(`ai-chat: provider ${cfg.provider} returned ${res.status}`); throw Object.assign(new Error('provider_error'), { status: res.status === 429 ? 503 : 502, code: res.status === 429 ? 'provider_busy' : 'provider_error' }); }
    const body = await res.json();
    const text = cfg.provider === 'anthropic' ? body.content?.map((c) => c.text || '').join('').trim() : body.choices?.[0]?.message?.content?.trim();
    if (!text) throw Object.assign(new Error('empty'), { status: 502, code: 'provider_empty' });
    return text;
  } catch (e) {
    if (e.code) throw e;
    console.warn(`ai-chat: provider ${cfg.provider} unreachable (${e.name})`);
    throw Object.assign(new Error('unreachable'), { status: 502, code: e.name === 'AbortError' ? 'provider_timeout' : 'provider_unreachable' });
  } finally { clearTimeout(timer); }
}

/** Which sources the answer actually cites (by tag). */
export function citedSources(answer, sources) {
  const tags = new Set((String(answer).match(/\[(J|M|N)\d+\]/g) || []).map((t) => t.slice(1, -1)));
  return sources.filter((s) => tags.has(s.ref));
}

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
