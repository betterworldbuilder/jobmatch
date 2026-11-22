// "Ask AI" for job seekers: a chat about the member's OWN JobsMatchNow data, answered by the server-side
// AI provider (POST /api/ai/chat). Read-only. Shows which items each answer used, says what data is sent
// to the provider, and handles loading / empty / error (retry) / not-set-up / daily-limit states.
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Loader2, Lock, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { api } from '../../api';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: { ref: string; kind: string; label: string }[]; error?: boolean };
export const ASK_AI_SUGGESTIONS = ['What are my best job matches?', 'Why does this job match my profile?', 'What skills am I missing?', 'Help me prepare for my next interview.'];

export function AskAi() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.aiChatStatus>> | null>(null);
  const [statusError, setStatusError] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || status) return;
    api.aiChatStatus().then(setStatus).catch((e) => setStatusError(e instanceof Error ? e.message : 'Could not reach Ask AI'));
  }, [open, status]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

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
  const retry = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user'); if (!lastUser) return;
    const idx = msgs.lastIndexOf(lastUser);
    void ask(lastUser.content, msgs.slice(0, idx));
  };
  const enabled = status?.enabled;
  const outOfQuestions = enabled && status?.remaining === 0;

  return <>
    {!open && <button type="button" className="askai-fab" onClick={() => setOpen(true)} aria-label="Ask AI about your profile and matches"><Sparkles size={17} /> Ask AI</button>}
    {open && <section className="askai-panel" role="dialog" aria-label="Ask AI">
      <header><span className="askai-icon"><Bot size={17} /></span><div><strong>Ask AI</strong><small>About your profile, matches, skills and interviews</small></div>
        <button type="button" className="askai-x" onClick={() => setOpen(false)} aria-label="Close Ask AI"><X size={18} /></button></header>
      <div className="askai-body" ref={listRef}>
        {!status && !statusError && <p className="askai-state"><Loader2 size={16} className="spin" /> Connecting…</p>}
        {statusError && <p className="askai-state err"><AlertCircle size={16} /> {statusError}</p>}
        {status && !enabled && <div className="askai-state off"><AlertCircle size={16} /><span><b>Ask AI is not set up yet.</b> The team needs to connect an AI provider on the server. Your data has not been sent anywhere.</span></div>}
        {enabled && msgs.length === 0 && <div className="askai-empty">
          <p>Ask anything about your own JobsMatchNow data. Answers show which roles or matches they used.</p>
          <div className="askai-sugs">{ASK_AI_SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void ask(s)} disabled={busy || outOfQuestions}>{s}</button>)}</div>
        </div>}
        {msgs.map((m, i) => <div key={i} className={`askai-msg ${m.role}${m.error ? ' error' : ''}`}>
          <p>{m.content}</p>
          {m.sources && m.sources.length > 0 && <div className="askai-sources"><span>Based on:</span>{m.sources.map((s) => <em key={s.ref}>{s.label}</em>)}</div>}
          {m.error && i === msgs.length - 1 && <button type="button" className="text-button" onClick={retry} disabled={busy}><RotateCcw size={13} /> Retry</button>}
        </div>)}
        {busy && <div className="askai-msg assistant"><p className="askai-typing"><i /><i /><i /></p></div>}
      </div>
      {enabled && <form className="askai-form" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={outOfQuestions ? 'Daily limit reached — back tomorrow' : 'Ask about your matches, skills, interviews…'} disabled={busy || outOfQuestions} aria-label="Your question" />
        <button type="submit" disabled={busy || !text.trim() || outOfQuestions} aria-label="Send"><Send size={16} /></button>
      </form>}
      {enabled && <p className="askai-privacy"><Lock size={11} /> Your question and a short summary of your data (target roles, skills, matching roles, matches, interview dates — never your name, contact details, CV or salary) are sent to {status?.providerLabel}. Read-only: it can't apply, message or change your profile. {status?.remaining ?? 0} of {status?.dailyLimit} questions left today.</p>}
    </section>}
  </>;
}
