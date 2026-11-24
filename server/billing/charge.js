import { logBillingEvent } from './audit.js';
import {
  BILLING_INTERVALS, clampExtraJobSlots, currencyForCountry, EXTRA_JOB_SLOT_PRICE, extraJobSlotsPrice, PLANS, planPrice, SEAT_LADDER, seatPlanKey,
} from './plans.js';

/* What to actually charge a recruiter.
 *
 * Every payment in the app used to be created at a flat USD 20 — which was
 * correct while there was exactly one plan, and silently wrong the moment a
 * ladder existed. A recruiter on Agency would have been billed 20 and granted
 * 130-worth of product. This module is the one place that answers "how much,
 * in which currency", and every payment-creation path calls it.
 *
 * Currency follows the account's country, not the browser or a client-supplied
 * field: a Vietnam account is billed in dong at the stored VND price, everyone
 * else in USD. Neither is derived from the other. */

/** The plan a recruiter has chosen to pay for. Defaults to Solo — the entry
 *  paid tier — so an account that never picked one is never billed for more
 *  than the cheapest plan it could be on. */
export function selectedPlanKey(subscription) {
  const chosen = subscription?.selectedPlanKey;
  if (chosen && PLANS[chosen]) return chosen;
  // Fall back to whatever their current plan code maps to, then to Solo.
  const mapped = seatPlanKey(subscription?.planCode);
  return mapped === 'starter' ? 'solo' : mapped;
}

export function billingInterval(subscription) {
  const interval = subscription?.billingInterval;
  return BILLING_INTERVALS.includes(interval) ? interval : 'monthly';
}

/**
 * The charge for this recruiter's next payment: plan, interval, add-on seats,
 * currency and total. Returned as one object so a caller can never take the
 * amount from one plan and the currency from another.
 */
export function chargeFor(db, recruiter, subscription, overrides = {}) {
  const planKey = overrides.planKey && PLANS[overrides.planKey] ? overrides.planKey : selectedPlanKey(subscription);
  const interval = BILLING_INTERVALS.includes(overrides.interval) ? overrides.interval : billingInterval(subscription);
  const currency = overrides.currency || currencyForCountry(recruiter?.country);
  const plan = PLANS[planKey];
  // Price lock (founder, 2026-11-24): a paying customer keeps the price they bought, for the same plan and billing
  // interval, until an admin moves them to the current price. New customers pay the current catalogue price.
  const lock = subscription?.priceLock;
  const locked = lock && lock.planKey === planKey && lock.interval === interval ? lock.prices?.[currency] : undefined;
  const baseAmount = Number.isFinite(locked) ? locked : (planPrice(planKey, currency, interval) ?? 0);
  // Extra live roles on top of the plan: USD 20 each per month (see plans.js).
  const extraJobSlots = clampExtraJobSlots(overrides.extraJobSlots ?? subscription?.extraJobSlots);
  const extraAmount = extraJobSlotsPrice(extraJobSlots, currency, interval);
  const amount = baseAmount + extraAmount;

  return {
    planKey,
    planDisplay: plan.display,
    interval,
    currency,
    amount,
    baseAmount,
    priceLocked: Number.isFinite(locked),
    extraJobSlots,
    extraAmount,
    extraJobSlotPrice: EXTRA_JOB_SLOT_PRICE[currency] ?? null,
    seats: plan.seats,
    includedJobSlots: plan.liveJobSlots,
    liveJobSlots: plan.liveJobSlots + extraJobSlots,
    // Annual bills ANNUAL_MONTHS_CHARGED months, so two are free.
    monthsCovered: interval === 'annual' ? 12 : 1,
  };
}

/** Plans a recruiter may choose. Starter is free and is not something you buy. (Same array as SEAT_LADDER, which
 *  follows the admin-edited catalogue.) */
export const SELECTABLE_PLANS = SEAT_LADDER;

/** Lock the price a payment was made at (called when a payment is confirmed). One lock per plan + interval; a
 *  payment in another currency for the same plan adds that currency's price to the lock. */
export function lockPriceFromPayment(subscription, payment) {
  if (!subscription || !payment?.planKey || !PLANS[payment.planKey]) return;
  const interval = payment.billingInterval || 'monthly';
  const base = Number.isFinite(payment.baseAmount) ? payment.baseAmount : planPrice(payment.planKey, payment.currency, interval);
  if (!Number.isFinite(base) || !payment.currency) return;
  const same = subscription.priceLock?.planKey === payment.planKey && subscription.priceLock?.interval === interval;
  subscription.priceLock = { planKey: payment.planKey, interval, prices: { ...(same ? subscription.priceLock.prices : {}), [payment.currency]: base }, lockedAt: subscription.priceLock && same ? subscription.priceLock.lockedAt : Date.now() };
}

/** Before a plan's price changes: give every paying customer on it a lock at the price they currently pay, so the
 *  edit only affects new customers. Returns how many subscriptions were locked. */
export function lockCurrentPricesForPlan(db, planKey) {
  let locked = 0;
  for (const subscription of db.subscriptions || []) {
    const onPlan = (subscription.paidPlanKey || subscription.selectedPlanKey) === planKey;
    const paying = Boolean(subscription.currentPeriodEndsAt) && (db.payments || []).some((p) => p.subscriptionId === subscription.id && p.status === 'confirmed');
    if (!onPlan || !paying) continue;
    const interval = billingInterval(subscription);
    const same = subscription.priceLock?.planKey === planKey && subscription.priceLock?.interval === interval;
    // Keep what is already locked (e.g. the VND price they paid) and lock every other currency at today's price.
    const prices = { ...(same ? subscription.priceLock.prices : {}) };
    let added = false;
    for (const currency of Object.keys(PLANS[planKey]?.prices || {})) {
      if (prices[currency] !== undefined) continue;
      const p = planPrice(planKey, currency, interval);
      if (Number.isFinite(p)) { prices[currency] = p; added = true; }
    }
    if (!added && same) continue;
    subscription.priceLock = { planKey, interval, prices, lockedAt: same ? subscription.priceLock.lockedAt : Date.now() };
    locked += 1;
  }
  return locked;
}

/**
 * Record the plan a recruiter intends to pay for. Changing this never changes
 * what they currently have — entitlements still follow the subscription's
 * actual state until a payment is confirmed — so selecting Agency does not
 * hand out Agency until Agency is paid for.
 */
export function selectPlan(db, subscription, planKey, interval, actorUserId, now = Date.now()) {
  if (!SELECTABLE_PLANS.includes(planKey)) return { outcome: 'invalid_plan', selectable: SELECTABLE_PLANS };
  if (interval && !BILLING_INTERVALS.includes(interval)) return { outcome: 'invalid_interval' };
  subscription.selectedPlanKey = planKey;
  if (interval) subscription.billingInterval = interval;
  subscription.updatedAt = now;
  logBillingEvent(db, actorUserId, 'plan_selected', 'subscription', subscription.id,
    { planKey, interval: subscription.billingInterval || 'monthly' });
  return { outcome: 'selected', planKey, interval: subscription.billingInterval || 'monthly' };
}

/** Record how many extra live roles the recruiter wants to pay for (0–50). Like selectPlan, nothing is
 *  granted until a payment that includes them is confirmed. */
export function setExtraJobSlots(db, subscription, count, actorUserId, now = Date.now()) {
  const extraJobSlots = clampExtraJobSlots(count);
  subscription.extraJobSlots = extraJobSlots;
  subscription.updatedAt = now;
  logBillingEvent(db, actorUserId, 'extra_job_slots_selected', 'subscription', subscription.id, { extraJobSlots });
  return { outcome: 'selected', extraJobSlots };
}

/** Monthly recurring revenue, summed per subscription rather than
 *  count × one flat price — which stopped being true when the ladder shipped. */
export function monthlyRecurringRevenue(db, subscriptions) {
  let total = 0;
  for (const subscription of subscriptions) {
    const recruiter = (db.users || []).find((user) => user.id === subscription.recruiterUserId);
    const charge = chargeFor(db, recruiter, subscription, { currency: 'USD', interval: 'monthly' });
    total += charge.amount;
  }
  return total;
}
