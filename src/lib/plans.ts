/* Display copy for the recruiter plans.
 *
 * `server/billing/plans.js` is the ENFORCEMENT authority — nothing here is ever
 * trusted server-side. This file exists so the marketing page renders instantly
 * without an API round-trip for six static numbers. `plans.sync.test.js` fails
 * the build if the two ever disagree, so this is a mirror, not a second truth. */

export type PlanKey = 'starter' | 'solo' | 'duo' | 'trio' | 'team';

export type PlanCard = {
  key: PlanKey;
  display: string;
  seats: number;
  liveJobSlots: number;
  usd: number;
  vnd: number;
  /** Short line under the price — what you're actually buying at this step. */
  tagline: string;
  perks: string[];
};

export const PLAN_CARDS: PlanCard[] = [
  {
    key: 'starter', display: 'Starter', seats: 1, liveJobSlots: 1, usd: 0, vnd: 0,
    tagline: 'One job, live free forever.',
    perks: ['1 live job', '1 recruiter seat', 'Mutual-likes matching', 'Messaging and interview scheduling'],
  },
  // Pricing 2026-11-22 (founder, final): Solo 50, Duo 80, Team (3 recruiters, key `trio`) 120 USD — all with the AI Hiring Assistant.
  {
    key: 'solo', display: 'Solo', seats: 1, liveJobSlots: 5, usd: 50, vnd: 490000,
    tagline: 'For one recruiter hiring steadily.',
    perks: ['1 recruiter account', '5 live roles included (+$20 per extra role)', 'See who already likes your roles', 'All features + AI Hiring Assistant', 'No bundle discount'],
  },
  {
    key: 'duo', display: 'Duo', seats: 2, liveJobSlots: 10, usd: 80, vnd: 850000,
    tagline: 'Two people, one pipeline.',
    perks: ['2 recruiter accounts', '10 live roles included (+$20 per extra role)', 'See who already likes your roles', 'All features + AI Hiring Assistant', 'Save $20/month vs 2 Solo accounts'],
  },
  {
    key: 'trio', display: 'Team', seats: 3, liveJobSlots: 15, usd: 120, vnd: 1190000,
    tagline: 'A small hiring team.',
    perks: ['3 recruiter accounts', '15 live roles included (+$20 per extra role)', 'See who already likes your roles', 'All features + AI Hiring Assistant', 'Save $30/month vs 3 Solo accounts'],
  },
  {
    key: 'team', display: 'Team 5 (legacy)', seats: 5, liveJobSlots: 25, usd: 75, vnd: 1790000,
    tagline: 'No longer sold; kept for existing accounts.',
    perks: ['25 live jobs', '5 recruiter seats'],
  },
];

/** The free-trial card shown first on the pricing page ("Starter · Free for 8 weeks"). */
export const TRIAL_CARD_PERKS = ['Full feature access', 'AI Hiring Assistant', 'Candidate matching', 'Messaging & scheduling', 'Team analytics'];

/** Extra live roles on every plan: +USD 20 per role per month (mirror of server EXTRA_JOB_SLOT_PRICE). */
export const EXTRA_JOB_SLOT = { usd: 20 };

/** What every package includes (pricing card footer). */
export const PLAN_INCLUDES = 'Candidate matching, messaging, scheduling, AI candidate insights and outreach drafts.';

/* Sold plans: Solo, Duo, Team. Starter (one free job) stays as the free floor. */
export const HEADLINE_PLANS: PlanKey[] = ['solo', 'duo', 'trio'];
export const MORE_SEAT_PLANS: PlanKey[] = [];
export const POPULAR_PLAN: PlanKey = 'duo';

/** Annual bills 10 months — two free. */
export const ANNUAL_MONTHS_CHARGED = 10;

export const BOOST = { hours: 72, usd: 12, vnd: 300000 };

/** A posting runs this long and then pauses. Renewal is free and unlimited. */
export const POSTING_TERM_DAYS = 60;

/* "Hiring for one role?" USD 29 once, 1 job for 60 days, no subscription (founder, 2026-11-22). */
export const SINGLE_POSTING = { termDays: 60, usd: 29, vnd: 590000 };

export const PAY_PER_HIRE = { feePercent: 5 };

/** One trial, one length, the same for everybody. */
export const TRIAL = { days: 56, liveJobs: 5 }; // 8 weeks free (founder, 2026-11-23); mirrors server TRIAL_DAYS

export const planCard = (key: PlanKey) => PLAN_CARDS.find((plan) => plan.key === key)!;

export const usd = (amount: number) => (amount === 0 ? 'Free' : `USD ${amount}`);
export const vnd = (amount: number) => `${amount.toLocaleString('en-US')} ₫`;
