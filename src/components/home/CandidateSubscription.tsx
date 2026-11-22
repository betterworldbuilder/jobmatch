// Candidate subscription: Free forever (the core) + optional Premium ($10/month:
// 3 target roles + 10 direct messages without a match + AI interview preparation with your own chatbot). Candidate payments are not
// open yet, so "Get Premium" records interest only — nothing is charged.
import { useState } from 'react';
import { ArrowRight, Check, Crown, Send, Target } from 'lucide-react';
import { api } from '../../api';
import type { Bootstrap, View } from '../../types';

export const PREMIUM = { price: 10, currency: 'USD', roles: 3, directMessages: 10 } as const;
const FREE_FEATURES = ['Full profile and resume', 'Mutual-likes job matching', 'Messaging with recruiters after a match', 'Interview scheduling and Hiring Stages', 'Salary shown up front', 'You control what employers see', '1 target role', 'AI analyst preview and Reports'];
const PREMIUM_FEATURES = [`${PREMIUM.roles} target roles at once, each with its own matches and report`, `${PREMIUM.directMessages} direct messages a month — reach a team before any match`, 'Interview AI coach with your own chatbot (ChatGPT or Claude): a skills refresh plan for every role', 'Everything in Free'];

export function usePremiumInterest(userId: string) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const ask = async () => {
    setState('busy');
    try { await api.registerInterest(userId, 'candidate-premium'); setState('done'); } catch { setState('idle'); }
  };
  return { state, ask };
}

export function CandidateSubscription({ data, navigate }: { data: Bootstrap; navigate: (v: View) => void }) {
  const { state, ask } = usePremiumInterest(data.viewer.id);
  return <div className="page cs-page">
    <div className="page-title"><div><span className="overline">Premium options</span><h1>Premium options</h1><p>The core of JobsMatchNow is free forever. Premium is optional, for people who want to search wider and reach teams first.</p></div></div>
    <div className="cs-grid">
      <article className="cs-card free">
        <header><span>For candidates</span></header>
        <div className="cs-body">
          <h2>Free forever <em className="cs-current">Your plan</em></h2>
          <p>We are paid by the companies doing the hiring. Everything here stays free.</p>
          <ul>{FREE_FEATURES.map((f) => <li key={f}><Check size={15} />{f}</li>)}</ul>
          <button type="button" className="secondary-button" onClick={() => navigate('home')}>Back to Home <ArrowRight size={14} /></button>
        </div>
      </article>
      <article className="cs-card premium">
        <header><span><Crown size={16} /> Premium</span><em>Coming soon</em></header>
        <div className="cs-body">
          <h2>${PREMIUM.price}<small> / month</small></h2>
          <p>Search more roles and message teams directly. Cancel any time.</p>
          <div className="cs-highlights">
            <div><Target size={18} /><strong>{PREMIUM.roles} target roles</strong><small>instead of 1</small></div>
            <div><Send size={18} /><strong>{PREMIUM.directMessages} direct messages</strong><small>per month, no match needed</small></div>
          </div>
          <ul>{PREMIUM_FEATURES.map((f) => <li key={f}><Check size={15} />{f}</li>)}</ul>
          {state === 'done' ? <p className="tp-thanks"><Check size={16} /> Saved — we'll tell you as soon as Premium opens. Nothing was charged.</p>
            : <button type="button" className="fm-black" disabled={state === 'busy'} onClick={() => void ask()}>{state === 'busy' ? 'Saving…' : 'Get Premium — notify me'}</button>}
          <p className="ai-privacy">Payments for candidates are not open yet: this records your interest only.</p>
        </div>
      </article>
    </div>
  </div>;
}
