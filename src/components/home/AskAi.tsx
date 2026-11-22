// "Ask AI": a chat about the member's OWN JobsMatchNow data (job seekers and hiring teams), answered by the
// member's own Claude/ChatGPT key (or the server's provider, if configured) via POST /api/ai/chat. Read-only.
// Premium feature (free 7-day trial). Shows which items each answer used, says what data is sent, and handles
// loading / premium / not-connected / empty / error (retry) / daily-limit states. Other screens open it with
// openAskAi(question) (AiAnalyst.tsx).
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Crown, KeyRound, Loader2, Lock, RotateCcw, Send, Settings, Sparkles, X } from 'lucide-react';
import { api } from '../../api';
import { AgentSettingsModal, AI_KEY_EVENT, ASK_AI_EVENT, modelName, RECRUITER_QUESTIONS } from './AiAnalyst';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: { ref: string; kind: string; label: string }[]; error?: boolean };
export const ASK_AI_SUGGESTIONS = ['What are my best job matches?', 'Why does this job match my profile?', 'What skills am I missing?', 'Help me prepare for my next interview.'];
type Status = Awaited<ReturnType<typeof api.aiChatStatus>>;

export function AskAi({ role = 'candidate' }: { role?: 'candidate' | 'employer' }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const suggestions = role === 'employer' ? RECRUITER_QUESTIONS : ASK_AI_SUGGESTIONS;

  const loadStatus = () => { setStatusError(''); return api.aiChatStatus().then((s) => { setStatus(s); return s; }).catch((e) => { setStatusError(e instanceof Error ? e.message : 'Could not reach Ask AI'); return null; }); };
  useEffect(() => { if (open && !status) void loadStatus(); }, [open, status]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  // Other screens: open the panel (optionally with a question). Key changes: reload the status.
  useEffect(() => {
    const onAsk = (e: Event) => { const q = (e as CustomEvent<{ question?: string }>).detail?.question; setOpen(true); if (q) setPending(q); };
    const onKey = () => setStatus(null);
    window.addEventListener(ASK_AI_EVENT, onAsk); window.addEventListener(AI_KEY_EVENT, onKey);
    return () => { window.removeEventListener(ASK_AI_EVENT, onAsk); window.removeEventListener(AI_KEY_EVENT, onKey); };
  }, []);

  const enabled = Boolean(status?.enabled && status.premium?.active);
  const outOfQuestions = enabled && status?.remaining === 0;

  const ask = async (question: string, base = msgs) => {
    const q = question.trim(); if (!q || busy) return;
    const history = base.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })).slice(-6);
    const next = [...base, { role: 'user' as const, content: q }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await api.aiChat(q, history);
      setMsgs([...next, { role: 'assistant', content: r.answer, sources: r.sources }]);
      setStatus((s) => (s ? { ...s, remaining: r.remaining } : s));
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.', error: true }]);
    } finally { setBusy(false); }
  };
  // A question sent from another screen runs once the chat is ready; otherwise it waits in the box.
  useEffect(() => {
    if (!pending || !status) return;
    if (enabled && !busy) { const q = pending; setPending(null); void ask(q); }
    else if (!enabled) { setText(pending); setPending(null); }
  }, [pending, status, enabled, busy]);
  const retry = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user'); if (!lastUser) return;
    void ask(lastUser.content, msgs.slice(0, msgs.lastIndexOf(lastUser)));
  };
  const startTrial = async () => {
    setTrialBusy(true);
    try { await api.startPremiumTrial(); await loadStatus(); } catch (e) { setStatusError(e instanceof Error ? e.message : 'Could not start the trial'); } finally { setTrialBusy(false); }
  };
  const usingLabel = status?.source === 'own' ? `${status.providerLabel}${status.model ? ` · ${modelName(status.model)}` : ''}` : status?.providerLabel;

  return <>
    {!open && <button type="button" className="askai-fab" onClick={() => setOpen(true)} aria-label="Ask AI about your data"><Sparkles size={17} /> Ask AI</button>}
    {open && <section className="askai-panel" role="dialog" aria-label="Ask AI">
      <header><span className="askai-icon"><Bot size={17} /></span>
        <div><strong>Ask AI <em className="askai-premium"><Crown size={10} /> Premium</em></strong><small>{enabled ? `Using ${usingLabel}` : role === 'employer' ? 'About your roles, candidates and hiring' : 'About your profile, matches, skills and interviews'}</small></div>
        <button type="button" className="askai-x" onClick={() => setSetup(true)} aria-label="My AI chatbot settings"><Settings size={16} /></button>
        <button type="button" className="askai-x" onClick={() => setOpen(false)} aria-label="Close Ask AI"><X size={18} /></button></header>
      <div className="askai-body" ref={listRef}>
        {!status && !statusError && <p className="askai-state"><Loader2 size={16} className="spin" /> Connecting…</p>}
        {statusError && <div className="askai-state err"><AlertCircle size={16} /><span>{statusError} <button type="button" className="text-button" onClick={() => void loadStatus()}><RotateCcw size={12} /> Retry</button></span></div>}
        {status && !status.premium?.active && <div className="askai-gate">
          <Crown size={22} />
          <strong>{status.premium?.trialUsed ? 'Your Premium trial has ended' : `Try Premium free for ${status.premium?.trialDays ?? 7} days`}</strong>
          <p>{role === 'employer' ? 'Ask AI about your roles and candidates, plus up to 5 live roles.' : 'Ask AI about your matches, skills and interviews, plus the Interview AI coach.'} No card needed. Nothing renews by itself.</p>
          {!status.premium?.trialUsed ? <button type="button" className="fm-black" onClick={() => void startTrial()} disabled={trialBusy}>{trialBusy ? <Loader2 size={16} className="spin" /> : `Start my free ${status.premium?.trialDays ?? 7}-day trial`}</button>
            : <p className="askai-muted">Premium payments are opening soon. We will tell you when you can continue.</p>}
        </div>}
        {status && status.premium?.active && !status.enabled && <div className="askai-gate">
          <KeyRound size={22} />
          <strong>{status.reason === 'own_key_unreadable' ? 'Please connect your chatbot again' : 'Connect your own Claude or ChatGPT'}</strong>
          <p>It takes a minute: get an API key from Anthropic or OpenAI and paste it. You pay them directly for what you use (usually well under a cent per question). {!status.canSaveKey && 'Demo accounts are shared, so create your own free account to connect a key.'}</p>
          <button type="button" className="fm-black" onClick={() => setSetup(true)}><KeyRound size={16} /> Connect my chatbot</button>
        </div>}
        {enabled && status?.premium?.source === 'trial' && msgs.length === 0 && <p className="askai-trial"><Crown size={12} /> Premium trial: {status.premium.daysLeft} {status.premium.daysLeft === 1 ? 'day' : 'days'} left.</p>}
        {enabled && msgs.length === 0 && <div className="askai-empty">
          <p>Ask anything about your own JobsMatchNow data. Answers show which {role === 'employer' ? 'roles, candidates' : 'roles'} or matches they used.</p>
          <div className="askai-sugs">{suggestions.map((s) => <button key={s} type="button" onClick={() => void ask(s)} disabled={busy || outOfQuestions}>{s}</button>)}</div>
        </div>}
        {msgs.map((m, i) => <div key={i} className={`askai-msg ${m.role}${m.error ? ' error' : ''}`}>
          <p>{m.content}</p>
          {m.sources && m.sources.length > 0 && <div className="askai-sources"><span>Based on:</span>{m.sources.map((s) => <em key={s.ref}>{s.label}</em>)}</div>}
          {m.error && i === msgs.length - 1 && <button type="button" className="text-button" onClick={retry} disabled={busy}><RotateCcw size={13} /> Retry</button>}
        </div>)}
        {busy && <div className="askai-msg assistant"><p className="askai-typing"><i /><i /><i /></p></div>}
      </div>
      {enabled && <form className="askai-form" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={outOfQuestions ? 'Daily limit reached — back tomorrow' : role === 'employer' ? 'Ask about your roles, candidates, interviews…' : 'Ask about your matches, skills, interviews…'} disabled={busy || outOfQuestions} aria-label="Your question" />
        <button type="submit" disabled={busy || !text.trim() || outOfQuestions} aria-label="Send"><Send size={16} /></button>
      </form>}
      {enabled && <p className="askai-privacy"><Lock size={11} /> Your question and a short summary of your data ({role === 'employer' ? 'your roles, candidates by job title and fit, matches, interview dates' : 'target roles, skills, matching roles, matches, interview dates'} — never names, contact details, CVs or salaries) are sent to {status?.providerLabel}. Read-only: it can't {role === 'employer' ? 'like, message or move candidates' : 'apply, message or change your profile'}. {status?.remaining ?? 0} of {status?.dailyLimit} questions left today.</p>}
    </section>}
    {setup && <AgentSettingsModal onClose={() => setSetup(false)} />}
  </>;
}
