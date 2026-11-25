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
import { serverAnthropicKey, serverOpenaiKey } from './server-ai.js';

export const DEFAULT_DAILY_LIMIT = 20;
export const DEFAULT_OWN_KEY_DAILY_LIMIT = 200;
const DEFAULT_MODELS = { anthropic: 'claude-opus-5-5', openai: 'gpt-4o-mini' };
export const LABEL = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI (ChatGPT)' };
const MESSAGES_URL = (provider, env) => (provider === 'anthropic' ? (env.AI_CHAT_ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages') : (env.AI_CHAT_OPENAI_URL || 'https://api.openai.com/v1/chat/completions'));

/** Settings when the member uses their OWN key (they pay the provider; a higher, still bounded, daily limit). */
export function ownKeyConfig(rec, key, env = process.env) {
  const limit = Math.max(1, Math.min(2000, Number(env.AI_CHAT_OWN_KEY_DAILY_LIMIT) || DEFAULT_OWN_KEY_DAILY_LIMIT));
  return { enabled: true, source: 'own', provider: rec.provider, label: `your ${rec.provider === 'anthropic' ? 'Claude' : 'ChatGPT'} account`, model: rec.model, key, limit, url: MESSAGES_URL(rec.provider, env) };
}

/** Provider settings read at request time (so ops can change env without code). */
export function providerConfig(env = process.env) {
  const provider = String(env.AI_CHAT_PROVIDER || '').toLowerCase();
  if (!['anthropic', 'openai'].includes(provider)) return { enabled: false, reason: 'not_configured' };
  // Founder, 2026-11-24: the server's own key only when USE_SERVER_AI_KEY=true (server-ai.js); otherwise members use their own key.
  const key = provider === 'anthropic' ? serverAnthropicKey(env) : serverOpenaiKey(env);
  if (!key) return { enabled: false, reason: 'missing_key', provider };
  const limit = Math.max(1, Math.min(500, Number(env.AI_CHAT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT));
  return { enabled: true, source: 'server', provider, label: LABEL[provider], model: env.AI_CHAT_MODEL || DEFAULT_MODELS[provider], key, limit, url: MESSAGES_URL(provider, env) };
}

/** Minimal, structured context from the member's own bootstrap. Returns { text, sources, empty }. */
export function buildContext(boot, now = Date.now()) {
  return boot.viewer?.role === 'employer' ? buildRecruiterContext(boot, now) : buildCandidateContext(boot, now);
}

/** Recruiter view: own open roles, how candidates fit them, own matches. Candidates appear by title only (no names). */
export function buildRecruiterContext(boot, now = Date.now()) {
  const v = boot.viewer || {};
  const sources = [];
  const people = new Map((boot.candidates || []).map((c) => [c.id, c]));
  const groups = (boot.roleMatches || []).slice(0, 6);
  const missingCount = new Map();
  const roleLines = groups.map((g, i) => {
    const ref = `R${i + 1}`; sources.push({ ref, kind: 'role', id: g.job.id, label: `Role: ${g.job.title}` });
    const req = (g.job.requiredSkillsDetail?.map((s) => s.name) || g.job.requiredSkills || []).slice(0, 8);
    const ranked = Object.entries(g.scores || {}).filter(([, s]) => typeof s.score === 'number').sort((a, b) => b[1].score - a[1].score);
    for (const [, s] of ranked.slice(0, 20)) for (const m of s.missingSkills || []) missingCount.set(m, (missingCount.get(m) || 0) + 1);
    const top = ranked.slice(0, 3).map(([id, s], k) => {
      const cref = `C${i + 1}.${k + 1}`; const p = people.get(id) || {};
      sources.push({ ref: cref, kind: 'candidate', id, label: `${p.title || 'Candidate'} · ${s.score}% for ${g.job.title}` });
      return `  [${cref}] ${p.title || 'candidate'}${p.location ? `, ${p.location}` : ''} | fit ${s.score}% | has: ${(s.matchedSkills || []).slice(0, 6).join(', ') || 'n/a'} | missing: ${(s.missingSkills || []).slice(0, 4).join(', ') || 'none'}`;
    });
    return [`[${ref}] ${g.job.title} | ${g.job.workMode || 'work mode n/a'} | ${g.job.location || 'location n/a'} | must-have: ${req.join(', ') || 'not listed'} | candidates who liked it: ${g.interestedCount || 0} | strong fits: ${(g.matchingCandidates || []).length} | candidates scored: ${ranked.length}`, ...top].join('\n');
  });
  const matches = (boot.matches || []).filter((m) => m.employerId === v.id && m.stage !== 'Archived').slice(0, 10);
  const matchLines = matches.map((m, i) => {
    const ref = `M${i + 1}`; sources.push({ ref, kind: 'match', id: m.id, label: `Match: ${m.candidate?.title || 'candidate'} · ${m.job?.title || 'role'}` });
    const step = (m.pipeline || []).find((s) => s.id === m.currentStepId);
    return `[${ref}] ${m.candidate?.title || 'candidate'} for ${m.job?.title || 'role'} | stage ${m.stage}${step ? ` | current step: ${step.name}${step.date ? ` on ${step.date}` : ''}` : ''}`;
  });
  const next = runTool('get_next_interview', boot, now);
  const nextLine = next && !next.none ? `${next.what} for ${next.role || 'a role'} on ${String(next.when).slice(0, 16).replace('T', ' ')}${next.format ? ` (${next.format})` : ''}` : 'none scheduled';
  if (next && !next.none) sources.push({ ref: 'N1', kind: 'interview', label: `Next interview: ${next.what}` });
  const hard = [...missingCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, n]) => `${s} (missing in ${n} top candidates)`);
  const text = [
    'HIRING TEAM (own data, minimal):',
    `- Company: ${v.company || 'not set'}; recruiter title: ${v.title || 'not set'}`,
    '',
    `MY OPEN ROLES AND BEST-FIT CANDIDATES (${roleLines.length} roles; candidates shown by title only):`, ...(roleLines.length ? roleLines : ['none']),
    '',
    `MY MATCHES (${matchLines.length}):`, ...(matchLines.length ? matchLines : ['none']),
    '',
    `SKILLS HARDEST TO FIND: ${hard.join('; ') || 'none found'}`,
    `[N1] NEXT INTERVIEW: ${nextLine}`,
  ].join('\n');
  return { text, sources, empty: !roleLines.length && !matchLines.length };
}

export function buildCandidateContext(boot, now = Date.now()) {
  const v = boot.viewer || {};
  const skills = (v.skillsDetail?.map((s) => s.name) || v.skills || []).slice(0, 25);
  const targets = v.preferences?.desiredRoles?.length ? v.preferences.desiredRoles : [v.title].filter(Boolean);
  const wm = v.preferences?.workMode;
  const mode = (wm?.modes?.length ? wm.modes : [wm?.mode].filter(Boolean)).join(' or ');
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
    const req = (m.job?.requiredSkillsDetail?.map((s) => s.name) || m.job?.requiredSkills || []).slice(0, 8);
    return `[${ref}] ${m.job?.title || 'role'} at ${m.job?.company || 'n/a'} | stage ${m.stage}${step ? ` | current step: ${step.name}${step.date ? ` on ${step.date}` : ''}` : ''} | must-have skills: ${req.join(', ') || 'not listed'}`;
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

const RULES = [
  'Rules: cite the items you use with their tags like [J1], [M2], [R1], [C1.2], [N1]. If the data does not contain the answer, say so plainly and suggest what the member can add or do in the app.',
  'Never invent jobs, people, companies, requirements, dates, salaries or matches.',
  'Be concise (under 180 words), friendly, plain words. Use short bullet points when listing.',
];
export const SYSTEM_PROMPT = [
  'You are the JobsMatchNow assistant for a job seeker. Answer ONLY from the DATA block about this member.', ...RULES,
  'You are read-only: you cannot apply, message recruiters or change the profile — say so if asked.',
].join(' ');
export const RECRUITER_SYSTEM_PROMPT = [
  'You are the JobsMatchNow assistant for a hiring team (recruiter). Answer ONLY from the DATA block about this team\'s own roles, candidates and matches. Candidates are shown by job title only; do not guess their names.', ...RULES,
  'You are read-only: you cannot like candidates, message anyone, move hiring stages or edit roles — say so if asked.',
].join(' ');
export const systemPromptFor = (role) => (role === 'employer' ? RECRUITER_SYSTEM_PROMPT : SYSTEM_PROMPT);

const providerError = (status, code) => Object.assign(new Error(code), { status, code });
// Claude 5.x models take output_config.effort; Opus 5.5 / Sonnet 5.5 also take server-side fallbacks on refusals.
const isClaude5 = (model) => /^claude-[a-z]+-5(-|$)/.test(model);
const takesFallbacks = (model) => model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';

/** One provider call. Throws { status, code } on failure. */
export async function callProvider(cfg, { context, question, history = [], role = 'candidate' }, fetchImpl = fetch) {
  const turns = history.slice(-6).map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content || '').slice(0, 1000) }));
  const user = `DATA:\n${context}\n\nQUESTION: ${question}`;
  const system = systemPromptFor(role);
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    let res;
    if (cfg.provider === 'anthropic') {
      const send = (withFallbacks) => {
        const headers = { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
        // max_tokens leaves room for thinking (always on for Claude 5.x); effort low keeps chat replies quick and cheap.
        const body = { model: cfg.model, max_tokens: 4000, system, messages: [...turns, { role: 'user', content: user }] };
        if (isClaude5(cfg.model)) body.output_config = { effort: 'low' };
        if (withFallbacks) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
        return fetchImpl(cfg.url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
      };
      res = await send(takesFallbacks(cfg.model));
      if (res.status === 400 && takesFallbacks(cfg.model)) res = await send(false); // account without the fallback beta
    } else {
      res = await fetchImpl(cfg.url, { method: 'POST', signal: ctrl.signal, headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_completion_tokens: 800, messages: [{ role: 'system', content: system }, ...turns, { role: 'user', content: user }] }) });
    }
    if (!res.ok) {
      console.warn(`ai-chat: provider ${cfg.provider} returned ${res.status}`);
      if (res.status === 401 || res.status === 403) throw providerError(502, 'key_refused');
      if (res.status === 402) throw providerError(502, 'no_credit');
      if (res.status === 429) throw providerError(503, 'provider_busy');
      if (res.status === 404) throw providerError(502, 'model_unavailable');
      throw providerError(502, 'provider_error');
    }
    const body = await res.json();
    if (cfg.provider === 'anthropic' && body.stop_reason === 'refusal') return 'The AI declined to answer this question. Try asking it another way, about your roles, matches, skills or interviews.';
    const text = cfg.provider === 'anthropic' ? (body.content || []).filter((c) => c.type === 'text' || (c.type === undefined && c.text)).map((c) => c.text || '').join('').trim() : body.choices?.[0]?.message?.content?.trim();
    if (!text) throw providerError(502, 'provider_empty');
    return text;
  } catch (e) {
    if (e.code) throw e;
    console.warn(`ai-chat: provider ${cfg.provider} unreachable (${e.name})`);
    throw Object.assign(new Error('unreachable'), { status: 502, code: e.name === 'AbortError' ? 'provider_timeout' : 'provider_unreachable' });
  } finally { clearTimeout(timer); }
}

/** Which sources the answer actually cites (by tag). */
export function citedSources(answer, sources) {
  const tags = new Set((String(answer).match(/\[(J|M|N|R|C)\d+(\.\d+)?\]/g) || []).map((t) => t.slice(1, -1)));
  return sources.filter((s) => tags.has(s.ref));
}

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
