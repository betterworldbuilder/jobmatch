import { Check } from 'lucide-react';
import { PLAN_INCLUDES, POPULAR_PLAN, TRIAL, TRIAL_CARD_PERKS, type PlanCard } from '../../lib/plans';

/** "Starter · Free for 4 weeks" — the free trial, shown before the paid plans. */
export function TrialCardView({ onStart, cta = 'Start free trial' }: { onStart: () => void; cta?: string }) {
  return <article className="plan-card plan-card-trial">
    <span className="plan-name">Starter</span>
    <p className="plan-price">Free<small> for {Math.round(TRIAL.days / 7)} weeks</small></p>
    <ul className="plan-perks">{TRIAL_CARD_PERKS.map((perk) => <li key={perk}><Check size={14} /> {perk}</li>)}</ul>
    <button type="button" className="secondary-button" onClick={onStart}>{cta}</button>
  </article>;
}

/** One recruiter tier on the pricing page (design 2026-11-22). Every CTA registers rather than
 *  charging: the 4-week trial starts first and the plan is chosen at the end of it,
 *  so no card is ever asked for on this page. */
export function PlanCardView({ plan, onRegister, cta }: { plan: PlanCard; onRegister: () => void; cta?: string }) {
  const free = plan.usd === 0;
  const popular = plan.key === POPULAR_PLAN;
  return <article className={`plan-card${popular ? ' popular' : ''}`}>
    {popular && <span className="plan-badge">Most popular</span>}
    <span className="plan-name">{plan.display}</span>
    <p className="plan-price">{free ? 'Free' : `$${plan.usd}`}{!free && <small> / month</small>}</p>
    <ul className="plan-perks">
      {plan.perks.map((perk) => <li key={perk}><Check size={14} /> {perk}</li>)}
    </ul>
    <div className="plan-includes"><span>Includes</span><p>{PLAN_INCLUDES}</p></div>
    <button type="button" className={popular ? 'primary-button' : 'secondary-button'} onClick={onRegister}>
      {cta || (free ? 'Start free' : `Choose ${plan.display}`)}
    </button>
  </article>;
}
