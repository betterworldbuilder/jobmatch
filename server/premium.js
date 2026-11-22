// Premium add-on (candidates and hiring teams), with a one-time free trial (default 7 days).
//
// - Separate from the recruiter base subscription (billing/), which keeps its own trial and plans.
// - What Premium unlocks today (enforced on the server):
//     everyone:   "Ask AI" with the member's own Claude/ChatGPT key (and the server key, if configured)
//     recruiters: up to PREMIUM_ACTIVE_JOB_LIMIT live roles (default 5) — see billing/entitlements.js
// - Stored on the user record: user.premium = { trialStartedAt, trialEndsAt, paidUntil }.
//   No card is taken for the trial; nothing renews automatically.
// - Demo accounts count as Premium so visitors can try the features.

const intFromEnv = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const PREMIUM_TRIAL_DAYS = intFromEnv('PREMIUM_TRIAL_DAYS', 7);
export const PREMIUM_ACTIVE_JOB_LIMIT = intFromEnv('PREMIUM_ACTIVE_JOB_LIMIT', 5);
const DAY = 86400000;

/** Is Premium on for this user right now, and why. */
export function premiumState(user, now = Date.now()) {
  const p = user?.premium || {};
  const trialUsed = Boolean(p.trialStartedAt);
  const trialActive = trialUsed && Number(p.trialEndsAt) > now;
  const paidActive = Number(p.paidUntil) > now;
  const demo = user?.demo === true;
  const source = paidActive ? 'paid' : trialActive ? 'trial' : demo ? 'demo' : null;
  const endsAt = paidActive ? p.paidUntil : trialActive ? p.trialEndsAt : null;
  return {
    active: Boolean(source), source, trialUsed, trialDays: PREMIUM_TRIAL_DAYS,
    trialEndsAt: p.trialEndsAt || null, paidUntil: p.paidUntil || null,
    daysLeft: endsAt ? Math.max(0, Math.ceil((endsAt - now) / DAY)) : null,
    roleLimit: user?.role === 'employer' ? PREMIUM_ACTIVE_JOB_LIMIT : undefined,
  };
}

export const premiumActive = (user, now = Date.now()) => premiumState(user, now).active;

/** Start the one-time trial on the user record (call inside a store transaction). Throws {status} on refusal. */
export function startPremiumTrial(user, now = Date.now()) {
  if (user.demo === true) throw Object.assign(new Error('Demo accounts already include Premium.'), { status: 409 });
  if (user.premium?.trialStartedAt) throw Object.assign(new Error('Your free trial was already used.'), { status: 409 });
  user.premium = { ...(user.premium || {}), trialStartedAt: now, trialEndsAt: now + PREMIUM_TRIAL_DAYS * DAY };
  return premiumState(user, now);
}
