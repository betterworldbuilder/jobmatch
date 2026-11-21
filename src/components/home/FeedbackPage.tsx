// "Feedback": members suggest improvements (area, what to change, how important, may we
// contact you). Saved privately for the team — never published; admins read them in
// Admin → Safety & Support.
import { useState } from 'react';
import { Check, Lightbulb, Loader2, Send } from 'lucide-react';
import { api } from '../../api';
import type { Bootstrap } from '../../types';

export const FEEDBACK_AREAS = ['Look for new Matches (swipe)', 'Home', 'Job Matches & likes', 'Conversations & meetings', 'Hiring Stages', 'Reports & AI analyst', 'Profile', 'Subscription', 'Something else'];
const IMPORTANCE = [
  { id: 'nice', label: 'Nice to have' },
  { id: 'important', label: 'Important' },
  { id: 'blocking', label: 'Blocks me' },
] as const;

export function FeedbackPage({ data }: { data: Bootstrap }) {
  const [area, setArea] = useState(FEEDBACK_AREAS[0]);
  const [message, setMessage] = useState('');
  const [importance, setImportance] = useState<'nice' | 'important' | 'blocking'>('important');
  const [contactOk, setContactOk] = useState(true);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 10) { setError('Tell us a bit more (at least 10 characters).'); return; }
    setState('busy'); setError('');
    try {
      await api.submitFeedback({ type: 'suggestion', message: message.trim(), area, importance, contactOk, name: data.viewer.name, role: data.viewer.role === 'candidate' ? 'Candidate' : 'Recruiter' });
      setState('done');
    } catch (err) { setState('idle'); setError(err instanceof Error ? err.message : 'Could not send your suggestion'); }
  };
  const reset = () => { setMessage(''); setState('idle'); };

  return <div className="page fb-page">
    <div className="page-title"><div><span className="overline">Feedback</span><h1>Help us improve JobsMatchNow</h1><p>Tell us what to make better. Every suggestion is read by the team — it stays private and is never published.</p></div></div>
    <section className="fb-card">
      {state === 'done' ? <div className="fb-done"><span><Check size={22} /></span><h2>Thank you!</h2><p>We got your suggestion about <b>{area}</b>.{contactOk ? ' We may write to you to learn more.' : ''}</p>
        <button type="button" className="secondary-button" onClick={reset}>Send another suggestion</button></div>
        : <form onSubmit={(e) => void submit(e)}>
          <h2><Lightbulb size={18} /> Suggest an improvement</h2>
          <label className="fb-field"><span>Which part of the app?</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>{FEEDBACK_AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="fb-field"><span>What should we improve? <small>What happened, and what would make it better?</small></span>
            <textarea rows={6} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Example: In Hiring Stages I'd like a reminder the day before each interview round." aria-label="Your suggestion" />
            <small className="fb-count">{message.length}/1000</small></label>
          <fieldset className="fb-field"><legend>How important is it for you?</legend>
            <div className="fb-chips">{IMPORTANCE.map((i) => <button type="button" key={i.id} className={importance === i.id ? 'on' : ''} aria-pressed={importance === i.id} onClick={() => setImportance(i.id)}>{i.label}</button>)}</div></fieldset>
          <label className="fb-check"><input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} /> You may contact me by email about this suggestion</label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="fm-black fb-submit" disabled={state === 'busy'}>{state === 'busy' ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Send suggestion</button>
        </form>}
    </section>
  </div>;
}
