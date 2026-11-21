// AI analyst (MOCKUP): a chat that explains the member's own search or hiring data.
// Members connect their own ChatGPT (OpenAI) or Claude (Anthropic) account in
// Home → "Use personal AI agent". In this mockup no key is stored or sent: answers are
// built in the browser from the member's own records (today.ts / report.ts).
import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import type { Bootstrap } from '../../types';
import { likesWaiting, nextInterview, repliesWaiting, urgentItems } from '../../lib/today';
import { recruiterFeedback, roleKpis, skillGaps } from '../../lib/report';
import { columnOf } from './RecruiterSections';

export type AgentProvider = 'chatgpt' | 'claude';
export const PROVIDERS: Record<AgentProvider, { label: string; account: string }> = {
  chatgpt: { label: 'ChatGPT', account: 'OpenAI account' },
  claude: { label: 'Claude', account: 'Anthropic account' },
};
type AgentSetting = { provider: AgentProvider; connectedAt: number } | null;
const KEY = 'jmn-ai-agent';

export function readAgent(): AgentSetting {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && PROVIDERS[v.provider as AgentProvider] ? v : null; } catch { return null; }
}
function writeAgent(v: AgentSetting) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* blocked storage */ } }

export function AgentSettingsModal({ onClose, onChange }: { onClose: () => void; onChange?: (v: AgentSetting) => void }) {
  const [current, setCurrent] = useState<AgentSetting>(readAgent);
  const [provider, setProvider] = useState<AgentProvider>(current?.provider || 'chatgpt');
  const [key, setKey] = useState('');
  const connect = () => { const v = { provider, connectedAt: Date.now() }; writeAgent(v); setCurrent(v); setKey(''); onChange?.(v); };
  const disconnect = () => { writeAgent(null); setCurrent(null); onChange?.(null); };
  return <div className="modal-scrim" onClick={onClose}>
    <div className="ai-setup" role="dialog" aria-modal="true" aria-label="Use personal AI agent" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      <span className="ai-badge">Preview · mockup</span>
      <h2><Bot size={22} /> Use personal AI agent</h2>
      <p>Connect your own ChatGPT or Claude account. Your AI analyst then answers questions about your search: matches, hiring stages, skill gaps and what to do next.</p>
      {current ? <div className="ai-connected"><strong>Connected: {PROVIDERS[current.provider].label}</strong><small>since {new Date(current.connectedAt).toLocaleDateString()}</small>
        <button type="button" className="secondary-button small" onClick={disconnect}>Disconnect</button></div> : <>
        <div className="ai-providers" role="radiogroup" aria-label="Provider">
          {(Object.keys(PROVIDERS) as AgentProvider[]).map((p) => <button key={p} type="button" role="radio" aria-checked={provider === p} className={provider === p ? 'on' : ''} onClick={() => setProvider(p)}>
            <strong>{PROVIDERS[p].label}</strong><small>Use my {PROVIDERS[p].account}</small></button>)}
        </div>
        <label className="int-field"><span>API key from your {PROVIDERS[provider].account} (optional in this preview)</span>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider === 'chatgpt' ? 'sk-…' : 'sk-ant-…'} /></label>
        <button type="button" className="fm-black" onClick={connect}>Connect {PROVIDERS[provider].label}</button>
      </>}
      <p className="ai-privacy">Preview: the key is not saved or sent anywhere, and answers are built on this device from your own JobsMatchNow data. When this goes live, your key will stay yours and you can disconnect at any time.</p>
    </div>
  </div>;
}

type Msg = { from: 'you' | 'ai'; text: string };

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

/** Turns plain URLs in an answer into links. */
function Linked({ text }: { text: string }) {
  return <>{text.split(/(https:\/\/\S+?)(?=[\s·]|$)/).map((part, i) => /^https:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part.replace('https://www.', '')}</a> : part)}</>;
}

/** Inline AI analyst for the Reports page, with ready-made questions. */
export function AiAnalystInline({ data }: { data: Bootstrap }) {
  const [agent, setAgent] = useState<AgentSetting>(readAgent);
  const [setup, setSetup] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const cand = data.viewer.role === 'candidate';
  const questions = cand ? CANDIDATE_QUESTIONS : ['How is hiring going?', 'When is my next interview?', 'What should I do today?'];
  const ask = (text: string) => { if (!text.trim()) return; setMsgs((m) => [...m, { from: 'you', text }, { from: 'ai', text: answer(text, data) }]); setQ(''); };
  return <section className="ai-inline" aria-label="AI analyst">
    <header><Bot size={20} /><div><strong>AI analyst</strong><small>{agent ? `Using your ${PROVIDERS[agent.provider].label} · preview` : 'Preview · answers from your own data'}</small></div>
      <button type="button" className="secondary-button small" onClick={() => setSetup(true)}>{agent ? 'Manage AI agent' : 'Use personal AI agent'}</button></header>
    <div className="ai-suggest wrap">{questions.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}</div>
    {msgs.length > 0 && <div className="ai-msgs inline">{msgs.map((m, i) => <p key={i} className={`ai-msg ${m.from}`}>{m.from === 'ai' ? <Linked text={m.text} /> : m.text}</p>)}</div>}
    <form className="ai-input" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your skills, roles or next steps…" aria-label="Ask the AI analyst" />
      <button type="submit" aria-label="Send" disabled={!q.trim()}><Send size={16} /></button>
    </form>
    {setup && <AgentSettingsModal onClose={() => setSetup(false)} onChange={setAgent} />}
  </section>;
}

export function AiAnalyst({ data }: { data: Bootstrap }) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<AgentSetting>(readAgent);
  const [setup, setSetup] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  useEffect(() => { const sync = () => setAgent(readAgent()); window.addEventListener('focus', sync); return () => window.removeEventListener('focus', sync); }, []);
  const cand = data.viewer.role === 'candidate';
  const suggestions = cand ? ['How is my search going?', ...CANDIDATE_QUESTIONS] : ['How is hiring going?', 'When is my next interview?', 'What should I do today?'];
  const ask = (text: string) => { if (!text.trim()) return; setMsgs((m) => [...m, { from: 'you', text }, { from: 'ai', text: answer(text, data) }]); setQ(''); };
  return <>
    <button type="button" className="ai-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="AI analyst"><Sparkles size={20} /><span>AI analyst</span></button>
    {open && <div className="ai-panel" role="dialog" aria-label="AI analyst">
      <header><Bot size={18} /><div><strong>AI analyst</strong><small>{agent ? `Using your ${PROVIDERS[agent.provider].label} · preview` : 'Preview · not connected'}</small></div>
        <button type="button" className="fm-x" style={{ position: 'static' }} aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <div className="ai-msgs">
        {msgs.length === 0 && <p className="ai-hello">Ask me about your {cand ? 'job search' : 'hiring'}. I read your matches, stages and skill gaps.{!agent && <> <button type="button" className="tp-link" onClick={() => setSetup(true)}>Connect ChatGPT or Claude</button></>}</p>}
        {msgs.map((m, i) => <p key={i} className={`ai-msg ${m.from}`}>{m.text}</p>)}
        <div ref={end} />
      </div>
      <div className="ai-suggest">{suggestions.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}</div>
      <form className="ai-input" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question…" aria-label="Ask the AI analyst" />
        <button type="submit" aria-label="Send" disabled={!q.trim()}><Send size={16} /></button>
      </form>
    </div>}
    {setup && <AgentSettingsModal onClose={() => setSetup(false)} onChange={setAgent} />}
  </>;
}
