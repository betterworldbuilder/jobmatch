// Premium add-on UI: the plan card with its free 7-day trial (candidates and hiring teams) and the
// "My AI chatbot" card for the profile. State comes from the server (GET /api/premium); the trial is one-time,
// takes no card and never renews by itself.
import { useEffect, useState } from 'react';
import { Bot, Check, Crown, KeyRound, Loader2, Sparkles } from 'lucide-react';
import { api, type PremiumState } from '../../api';
import { AgentSettingsModal, modelName, openAskAi, PROVIDERS, useAgent } from './AiAnalyst';
import { COUNTRY_OPTIONS, guessCountryName } from '../../lib/countries';

export const PREMIUM_PRICE_CANDIDATE = 10; // USD / month (founder, 2026-11)
export const PREMIUM_EVENT = 'jmn:premium-changed';

export const PREMIUM_FEATURES = {
  candidate: [
    { text: 'Ask AI: your own Claude or ChatGPT answers questions about your matches, skills and interviews', live: true },
    { text: 'Interview AI coach: a skills refresh plan for every role, written by your chatbot', live: true },
    { text: '3 target roles at once, each with its own matches and report', live: true },
    { text: '10 direct messages a month: reach a team before any match', live: false },
  ],
  employer: [
    { text: 'Up to 5 live roles at once', live: true },
    { text: 'Ask AI: your own Claude or ChatGPT answers questions about your roles, candidates and hiring', live: true },
    { text: 'Everything in your current plan', live: true },
  ],
};

export function usePremium() {
  const [state, setState] = useState<PremiumState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => api.premium().then(setState).catch(() => undefined);
  useEffect(() => { void load(); const on = () => void load(); window.addEventListener(PREMIUM_EVENT, on); return () => window.removeEventListener(PREMIUM_EVENT, on); }, []);
  // Candidates without a citizenship on their profile are asked for it first (founder, 2026-11-24).
  const [needCitizenship, setNeedCitizenship] = useState(false);
  const start = async (citizenship?: string) => {
    setBusy(true); setError('');
    try { setState(await api.startPremiumTrial(citizenship)); setNeedCitizenship(false); window.dispatchEvent(new Event(PREMIUM_EVENT)); window.dispatchEvent(new Event('jmn:ai-key-changed')); }
    catch (e) { const msg = e instanceof Error ? e.message : 'Could not start the trial'; if (/citizenship/i.test(msg)) setNeedCitizenship(true); else setError(msg); }
    finally { setBusy(false); }
  };
  return { state, busy, error, start, needCitizenship };
}

/** "Your citizenship" picker shown before Premium starts, when the profile does not have it yet. */
export function CitizenshipPicker({ busy, onContinue }: { busy: boolean; onContinue: (citizenship: string) => void }) {
  const [value, setValue] = useState(() => guessCountryName());
  return <div className="pt-citizenship">
    <label><span>Your citizenship</span>
      <select className="wz-input wz-select" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Your citizenship">
        <option value="">Choose a country</option>
        {COUNTRY_OPTIONS.map((c, i) => <option key={`${c.code}-${i}`} value={c.name}>{c.name}</option>)}
      </select>
    </label>
    <p className="ai-privacy">Used only to offer the payment methods available to you, and saved on your profile (you can change it there).</p>
    <button type="button" className="fm-black pt-start" disabled={busy || !value} onClick={() => onContinue(value)}>{busy ? <Loader2 size={16} className="spin" /> : <><Crown size={16} /> Continue</>}</button>
  </div>;
}

const endsOn = (ts: number | null) => (ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

/** Trial / status line + action, shared by every Premium surface. */
export function PremiumAction({ compact = false }: { compact?: boolean }) {
  const { state, busy, error, start, needCitizenship } = usePremium();
  if (!state) return <p className="askai-state"><Loader2 size={14} className="spin" /> Loading…</p>;
  if (state.active) return <div className={`pt-status on${compact ? ' compact' : ''}`}><Check size={15} />
    <span>{state.source === 'trial' ? <>Premium trial active: <b>{state.daysLeft} {state.daysLeft === 1 ? 'day' : 'days'} left</b> (until {endsOn(state.trialEndsAt)})</> : state.source === 'demo' ? 'Premium is included in this demo account' : <>Premium active until {endsOn(state.paidUntil)}</>}</span></div>;
  if (state.trialUsed) return <div className={`pt-status off${compact ? ' compact' : ''}`}><Crown size={15} /><span>Your free trial ended on {endsOn(state.trialEndsAt)}. Premium payments are opening soon; we will never charge without asking you first.</span></div>;
  if (needCitizenship) return <CitizenshipPicker busy={busy} onContinue={(c) => void start(c)} />;
  return <>
    <button type="button" className="fm-black pt-start" onClick={() => void start()} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <><Crown size={16} /> Start my free {state.trialDays}-day trial</>}</button>
    {!compact && <p className="ai-privacy">No card needed. After {state.trialDays} days Premium simply switches off. Nothing renews or is charged by itself.</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </>;
}

/** The Premium plan card (Premium options page for candidates, Subscription page for hiring teams). */
export function PremiumPlanCard({ role }: { role: 'candidate' | 'employer' }) {
  return <article className="cs-card premium">
    <header><span><Crown size={16} /> Premium</span><em>7-day free trial</em></header>
    <div className="cs-body">
      {role === 'candidate' ? <h2>${PREMIUM_PRICE_CANDIDATE}<small> / month after the trial</small></h2> : <h2>Premium<small> for hiring teams</small></h2>}
      <p>{role === 'candidate' ? 'Search more roles and let your own AI chatbot coach you.' : 'Hire for more roles at once and let your own AI chatbot read your pipeline.'} Try everything free for 7 days.</p>
      <ul>{PREMIUM_FEATURES[role].map((f) => <li key={f.text}><Check size={15} />{f.text}{!f.live && <em className="pt-next">coming next</em>}</li>)}</ul>
      <PremiumAction />
    </div>
  </article>;
}

/** Profile side card: connect your own chatbot (Premium). */
export function MyChatbotCard() {
  const agent = useAgent();
  const [setup, setSetup] = useState(false);
  return <section className="pt-chatbot">
    <header><span className="ai-icon"><Bot size={18} /></span><div><strong>My AI chatbot</strong><small>Your own Claude or ChatGPT, reading your JobsMatchNow data</small></div><em className="askai-premium"><Crown size={10} /> Premium</em></header>
    {agent ? <p className="pt-connected"><Check size={14} /> Connected: <b>{PROVIDERS[agent.provider].label}</b>{agent.model ? ` · ${modelName(agent.model)}` : ''}{agent.last4 ? ` · key …${agent.last4}` : ''}</p>
      : <p className="pt-muted">Ask about your matches, skills and interviews in plain words. Get a key from Anthropic or OpenAI in a minute, with step-by-step links.</p>}
    <div className="pt-actions">
      <button type="button" className="secondary-button small" onClick={() => setSetup(true)}><KeyRound size={14} /> {agent ? 'Manage' : 'Connect Claude or ChatGPT'}</button>
      {agent && <button type="button" className="secondary-button small" onClick={() => openAskAi()}><Sparkles size={14} /> Ask AI</button>}
    </div>
    <PremiumAction compact />
    {setup && <AgentSettingsModal onClose={() => setSetup(false)} />}
  </section>;
}
