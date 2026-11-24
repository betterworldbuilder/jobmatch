// "My AI chatbot": members connect their OWN Claude (Anthropic) or ChatGPT (OpenAI) API key.
// The key is checked with the provider and stored encrypted on the server (PUT /api/ai/key); the browser
// only ever sees provider, model and the last 4 characters. "Ask AI" (AskAi.tsx) then answers with it.
// The old browser-only mock answers (answer()) stay exported for the report tests.
import { useEffect, useState } from 'react';
import { AlertCircle, Bot, Check, Crown, ExternalLink, KeyRound, Loader2, Lock, Plug, Sparkles, X } from 'lucide-react';
import { api, type AiKeyInfo } from '../../api';
import type { Bootstrap } from '../../types';
import { featureOn } from '../../lib/flags';
import { TOUR_VIEW_EVENT } from '../../lib/tour/runtime';

/** AI settings → "Connect an AI agent" (founder, 2026-11-25, flag `agents`): opens the chatbot page at the agent setup. */
export function openAgentSetup() {
  window.dispatchEvent(new CustomEvent(TOUR_VIEW_EVENT, { detail: { view: 'assistant' } }));
  setTimeout(() => document.getElementById('connect-agent')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
}
import { likesWaiting, nextInterview, repliesWaiting, urgentItems } from '../../lib/today';
import { recruiterFeedback, roleKpis, skillGaps } from '../../lib/report';
import { columnOf } from './RecruiterSections';

export type AgentProvider = 'chatgpt' | 'claude';
export const PROVIDERS: Record<AgentProvider, { label: string; account: string; api: 'openai' | 'anthropic'; company: string; keyUrl: string; billingUrl: string; prefix: string }> = {
  claude: { label: 'Claude', account: 'Anthropic account', api: 'anthropic', company: 'Anthropic', keyUrl: 'https://console.anthropic.com/settings/keys', billingUrl: 'https://console.anthropic.com/settings/billing', prefix: 'sk-ant-' },
  chatgpt: { label: 'ChatGPT', account: 'OpenAI account', api: 'openai', company: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', billingUrl: 'https://platform.openai.com/settings/organization/billing/overview', prefix: 'sk-' },
};
const TIERS: Record<AgentProvider, { best: string; fast: string }> = {
  claude: { best: 'Best answers (Claude Opus)', fast: 'Faster and cheaper (Claude Haiku)' },
  chatgpt: { best: 'Best answers (GPT-4o)', fast: 'Faster and cheaper (GPT-4o mini)' },
};
type AgentSetting = { provider: AgentProvider; connectedAt: number; model?: string; last4?: string } | null;
const KEY = 'jmn-ai-agent';
export const AI_KEY_EVENT = 'jmn:ai-key-changed';
export const ASK_AI_EVENT = 'jmn:ask-ai';

/** Cached, non-secret marker of the member's connected chatbot (the server is the source of truth). */
export function readAgent(): AgentSetting {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && PROVIDERS[v.provider as AgentProvider] ? v : null; } catch { return null; }
}
/** Mirror the server's answer into the cache and tell open screens. */
export function rememberAgent(info: AiKeyInfo | null) {
  const v: AgentSetting = info ? { provider: info.provider === 'anthropic' ? 'claude' : 'chatgpt', connectedAt: info.savedAt, model: info.model, last4: info.last4 } : null;
  try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* blocked storage */ }
  try { window.dispatchEvent(new CustomEvent(AI_KEY_EVENT, { detail: v })); } catch { /* old browsers */ }
  return v;
}
/** Open "Ask AI" (optionally with a question) from anywhere in the app. */
export function openAskAi(question?: string) { window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: { question } })); }
/** Re-render when the member connects or removes their chatbot. */
export function useAgent(): AgentSetting {
  const [agent, setAgent] = useState<AgentSetting>(readAgent);
  useEffect(() => { const on = () => setAgent(readAgent()); window.addEventListener(AI_KEY_EVENT, on); return () => window.removeEventListener(AI_KEY_EVENT, on); }, []);
  return agent;
}
export const modelName = (model?: string) => (model || '').replace(/^claude-/, 'Claude ').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/-(\d)$/, ' $1').replace(/\b(opus|sonnet|haiku)\b/g, (m) => m[0].toUpperCase() + m.slice(1)).replace(/^gpt/, 'GPT');

export function AgentSettingsModal({ onClose, onChange }: { onClose: () => void; onChange?: (v: AgentSetting) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState<AiKeyInfo | null>(null);
  const [canSave, setCanSave] = useState(true);
  const [provider, setProvider] = useState<AgentProvider>(readAgent()?.provider || 'claude');
  const [tier, setTier] = useState<'best' | 'fast'>('best');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    api.aiKey().then((r) => { setCurrent(r.key); setCanSave(r.canSave); if (r.key) setProvider(r.key.provider === 'anthropic' ? 'claude' : 'chatgpt'); onChange?.(rememberAgent(r.key)); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your chatbot settings')).finally(() => setLoaded(true));
  }, []);
  const p = PROVIDERS[provider];
  const connect = async () => {
    setBusy(true); setError('');
    try { const r = await api.saveAiKey(p.api, key.trim(), tier); setCurrent(r.key); setKey(''); setChanging(false); onChange?.(rememberAgent(r.key)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not connect'); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); setError('');
    try { await api.deleteAiKey(); setCurrent(null); onChange?.(rememberAgent(null)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not disconnect'); }
    finally { setBusy(false); }
  };
  const showForm = loaded && (!current || changing);
  return <div className="modal-scrim" onClick={onClose}>
    <div className="ai-setup" role="dialog" aria-modal="true" aria-label="My AI chatbot" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      <span className="ai-badge premium"><Crown size={11} /> Premium</span>
      <h2><Bot size={22} /> My AI chatbot</h2>
      <p>Use your own Claude or ChatGPT to answer questions about your JobsMatchNow data: matches, skills, hiring stages and interviews. Open “Ask AI” at the bottom right of any page.</p>
      {!loaded && <p className="askai-state"><Loader2 size={16} className="spin" /> Loading…</p>}
      {loaded && current && !changing && <div className="ai-connected">
        <span className="ai-ok"><Check size={14} /></span>
        <div><strong>Connected: {current.provider === 'anthropic' ? 'Claude' : 'ChatGPT'}</strong><small>{modelName(current.model)} · key ending …{current.last4} · since {new Date(current.savedAt).toLocaleDateString()}</small></div>
        <div className="ai-connected-actions">
          <button type="button" className="secondary-button small" onClick={() => setChanging(true)} disabled={busy}>Change</button>
          <button type="button" className="secondary-button small" onClick={() => void disconnect()} disabled={busy}>Disconnect</button>
        </div>
      </div>}
      {showForm && <>
        <div className="ai-providers" role="radiogroup" aria-label="Chatbot">
          {(['claude', 'chatgpt'] as AgentProvider[]).map((id) => <button key={id} type="button" role="radio" aria-checked={provider === id} className={provider === id ? 'on' : ''} onClick={() => { setProvider(id); setError(''); }}>
            <strong>{PROVIDERS[id].label}</strong><small>by {PROVIDERS[id].company}</small></button>)}
        </div>
        <ol className="ai-steps">
          <li><b>1</b><span>Get your key: <a className="ai-keylink" href={p.keyUrl} target="_blank" rel="noopener noreferrer"><KeyRound size={13} /> Open {p.company} API keys <ExternalLink size={12} /></a><small>Sign in, click “Create key”, then copy it. It starts with <code>{p.prefix}</code></small></span></li>
          <li><b>2</b><span>Make sure your API account has credit: <a href={p.billingUrl} target="_blank" rel="noopener noreferrer">{p.company} billing <ExternalLink size={11} /></a><small>API use is billed by {p.company} separately from a {provider === 'claude' ? 'Claude Pro' : 'ChatGPT Plus'} subscription. One question usually costs well under a cent.</small></span></li>
          <li><b>3</b><span>Paste it here and connect.</span></li>
        </ol>
        <label className="int-field"><span>Your {p.label} API key</span>
          <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); setError(''); }} placeholder={`${p.prefix}…`} disabled={!canSave || busy} /></label>
        <div className="ai-tiers" role="radiogroup" aria-label="Model">
          {(['best', 'fast'] as const).map((t) => <label key={t} className={tier === t ? 'on' : ''}><input type="radio" name="ai-tier" checked={tier === t} onChange={() => setTier(t)} /> {TIERS[provider][t]}</label>)}
        </div>
        {!canSave && <p className="auth-error"><AlertCircle size={14} /> Demo accounts are shared, so they cannot save a key. Create your own free account to connect your chatbot.</p>}
        {error && <p className="auth-error" role="alert"><AlertCircle size={14} /> {error}</p>}
        <div className="ai-form-actions">
          {changing && <button type="button" className="secondary-button" onClick={() => { setChanging(false); setError(''); }} disabled={busy}>Cancel</button>}
          <button type="button" className="fm-black" onClick={() => void connect()} disabled={!canSave || busy || key.trim().length < 20}>{busy ? <><Loader2 size={16} className="spin" /> Checking your key…</> : `Check and connect ${p.label}`}</button>
        </div>
      </>}
      {loaded && !showForm && error && <p className="auth-error" role="alert"><AlertCircle size={14} /> {error}</p>}
      {featureOn('agents') && <div className="ai-agent-connect">
        <span className="ai-agent-icon"><Plug size={18} /></span>
        <div><strong>Connect an AI agent</strong><small>Use JobsMatchNow from OpenClaw, Muse (Meta), Claude or any MCP agent, with a personal read-only key you can revoke anytime.</small></div>
        <button type="button" className="secondary-button small" onClick={() => { onClose(); openAgentSetup(); }}>Set up</button>
      </div>}
      <p className="ai-privacy"><Lock size={11} /> We check your key with {current ? (current.provider === 'anthropic' ? 'Anthropic' : 'OpenAI') : p.company}, store it encrypted, and never show it again (only the last 4 characters). Each question sends a short summary of your own data, never your name, contact details or CV. Read-only: it cannot apply, message or change anything. Disconnect at any time. Premium feature: free 7-day trial for job seekers, included in every recruiter plan.</p>
    </div>
  </div>;
}

/** Mock answers from the member's own data. */
/** People in the member's own network who know a skill: interviewers on their timelines + their recommenders. */
export function teachersFor(skill: string, data: Bootstrap): string[] {
  const out = new Set<string>();
  const sk = skill.toLowerCase();
  for (const m of data.matches) {
    const needs = (m.job?.requiredSkills || []).some((s) => s.toLowerCase() === sk);
    for (const step of m.pipeline || []) if (needs && step.owner && (step.kind === 'technical' || step.kind === 'manager')) out.add(`${step.owner} (${m.job?.company || 'hiring team'})`);
  }
  for (const r of data.viewer.recommendations || []) if (r.recruiterName) out.add(`${r.recruiterName}${r.role ? `, ${r.role}` : ''}${r.company ? ` at ${r.company}` : ''} (recommended you)`);
  return [...out].slice(0, 4);
}

/** Roles outside the target list that are closest to a match: fewest missing skills, then best fit. */
export function easiestRoles(data: Bootstrap, max = 3) {
  const targets = (data.viewer.preferences?.desiredRoles || []).map((r) => r.toLowerCase());
  const matched = new Set(data.matches.map((m) => m.jobId));
  return data.jobs.filter((j) => !matched.has(j.id) && !targets.some((t) => j.title.toLowerCase().includes(t)))
    .map((j) => ({ job: j, missing: j.match?.missingSkills || [], score: j.match?.score ?? 0 }))
    .sort((a, b) => a.missing.length - b.missing.length || b.score - a.score).slice(0, max);
}

export const CANDIDATE_QUESTIONS = ['What are my skill gaps?', 'Where can I learn them?', 'Who can teach me here?', 'Which other roles are the easiest wins?', 'What should I do today?'];

export function answer(q: string, data: Bootstrap): string {
  const s = q.toLowerCase();
  const cand = data.viewer.role === 'candidate';
  if (/fruit|easiest|other role|easy win|lowest/.test(s)) {
    const r = easiestRoles(data);
    return r.length ? `Closest roles outside your targets: ${r.map((x) => `${x.job.title} at ${x.job.company} — ${x.score}% fit${x.missing.length ? `, missing ${x.missing.slice(0, 2).join(' and ')}` : ', no missing skills'}`).join('; ')}.` : 'No roles outside your targets right now.';
  }
  if (/teach|mentor|who can|people/.test(s)) {
    const gaps = skillGaps(data, 2);
    if (!gaps.length) return 'No skill gaps found, so nobody to ask yet.';
    return gaps.map((g) => { const t = teachersFor(g.skill, data); return t.length ? `For ${g.skill}, ask someone from your network: ${t.join('; ')}.` : `For ${g.skill}, nobody in your network yet — try the Coursera link in Reports.`; }).join(' ') + ' (JobsMatchNow does not list mentors yet; these come from your own hiring timelines and recommendations.)';
  }
  if (/learn|course|where/.test(s)) {
    const gaps = skillGaps(data, 3);
    return gaps.length ? `Start here: ${gaps.map((g) => `${g.skill} → ${g.course}`).join(' · ')}` : 'No skill gaps to learn right now.';
  }
  if (/skill|gap/.test(s)) {
    const gaps = skillGaps(data, 3);
    return gaps.length ? `Your top skill gaps: ${gaps.map((g) => `${g.skill} (asked in ${g.roles} ${g.roles === 1 ? 'role' : 'roles'})`).join(', ')}. Reports → Skill gaps has a Coursera link for each.` : 'I found no skill gaps in the roles you see right now.';
  }
  if (/interview|next|when/.test(s)) {
    const n = nextInterview(data);
    return n ? `Next: ${n.title}, ${new Date(n.at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, with ${n.who}. Hiring Stages shows every round.` : 'No interview has a date yet. It shows up as soon as a round is scheduled.';
  }
  if (/feedback/.test(s)) {
    const f = recruiterFeedback(data)[0];
    return f ? `Latest feedback from ${f.from}${f.role ? ` (${f.role})` : ''}: “${f.text}”` : 'No recruiter feedback yet.';
  }
  if (/today|do|urgent|priority/.test(s)) {
    const u = urgentItems(data);
    return u.length ? `Today I would: ${u.map((x, i) => `${i + 1}) ${x.text}`).join(' ')}` : 'Nothing urgent today — a good moment to review new matches.';
  }
  if (cand) {
    const rows = roleKpis(data).filter((r) => r.roles || r.matches);
    const best = [...rows].sort((a, b) => b.matches - a.matches)[0];
    return `You have ${data.matches.length} matches, ${likesWaiting(data)} recruiters waiting for a like back and ${repliesWaiting(data).length} replies to send.${best ? ` Your strongest target role is "${best.role}" (${best.matches} matches${best.avgFit !== undefined ? `, ${best.avgFit}% average fit` : ''}).` : ''}`;
  }
  const mine = data.matches.filter((m) => m.employerId === data.viewer.id);
  return `You have ${mine.length} matched candidates: ${mine.filter((m) => columnOf(m) === 'interviewing').length} interviewing, ${mine.filter((m) => columnOf(m) === 'offer').length} at offer, ${mine.filter((m) => columnOf(m) === 'hired').length} hired. ${likesWaiting(data)} candidates like your roles and wait for a like back.`;
}

export const RECRUITER_QUESTIONS = ['Which candidates fit my roles best?', 'How is hiring going for each role?', 'Which skills are hardest to find?', 'Help me prepare my next interview.'];

/** Reports page: ready questions that open the real "Ask AI" chat, plus the chatbot connection. */
export function AiAnalystInline({ data }: { data: Bootstrap }) {
  const agent = useAgent();
  const [setup, setSetup] = useState(false);
  const cand = data.viewer.role === 'candidate';
  const questions = cand ? CANDIDATE_QUESTIONS : RECRUITER_QUESTIONS;
  return <section className="ai-inline" aria-label="AI analyst">
    <header><Bot size={20} /><div><strong>AI analyst</strong><small>{agent ? `Using your ${PROVIDERS[agent.provider].label}${agent.model ? ` · ${modelName(agent.model)}` : ''}` : 'Connect your own Claude or ChatGPT to ask questions about your data'}</small></div>
      <button type="button" className="secondary-button small" onClick={() => setSetup(true)}>{agent ? 'My AI chatbot' : 'Connect my chatbot'}</button></header>
    <div className="ai-suggest wrap">{questions.map((s) => <button key={s} type="button" onClick={() => openAskAi(s)}><Sparkles size={12} /> {s}</button>)}</div>
    {setup && <AgentSettingsModal onClose={() => setSetup(false)} />}
  </section>;
}
