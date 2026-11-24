/* PayPal: recruiter subscription checkout via PayPal's Subscriptions API.
 * Sandbox by default (PAYPAL_ENV=sandbox) until switched to live. The
 * approval redirect is UX only — the webhook (verified via PayPal's own
 * verify-webhook-signature API, not a hand-rolled signature check) is the
 * only thing that ever confirms a payment, same pattern as every other
 * provider here — see server/billing/confirm.js. */

import { keyFor } from '../payment-settings.js';
import { PLANS } from '../plans.js';

// Keys entered in Admin → Billing → Payment methods win; the env file is the fallback (payment-settings.js).
function clientId() { return keyFor('paypal', 'clientId'); }
function clientSecret() { return keyFor('paypal', 'clientSecret'); }
/** One PayPal plan per price (founder, 2026-11-24): the plan's "PayPal plan ID" set in the pricing editor, else
 *  PAYPAL_PLAN_ID_SOLO / _DUO / _TRIO (the "Team" plan), else PAYPAL_PLAN_ID. */
export function planId(planKey) {
  const fromCatalog = planKey ? PLANS[planKey]?.paypalPlanId : '';
  const own = planKey ? process.env[`PAYPAL_PLAN_ID_${String(planKey).toUpperCase()}`] : '';
  return fromCatalog || own || process.env.PAYPAL_PLAN_ID || '';
}
function webhookId() { return keyFor('paypal', 'webhookId'); }
function apiBase() { return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }

export function isPaypalConfigured(planKey) {
  const anyPlan = planKey ? planId(planKey) : (process.env.PAYPAL_PLAN_ID || ['SOLO', 'DUO', 'TRIO'].some((k) => process.env[`PAYPAL_PLAN_ID_${k}`]) || Object.values(PLANS).some((p) => p.paypalPlanId));
  return Boolean(clientId() && clientSecret() && anyPlan);
}

/** "Test connection" in Admin: can we get a PayPal access token with these keys? Never throws. */
export async function testPaypalConnection() {
  if (!clientId() || !clientSecret()) return { ok: false, message: 'Client ID and Secret are not set' };
  try { await getAccessToken(); return { ok: true, message: `Connected to PayPal (${process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox'} mode)` }; }
  catch (e) { return { ok: false, message: e.message || 'PayPal refused the keys' }; }
}

async function getAccessToken() {
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await response.json();
  if (!response.ok) { const error = new Error(body?.error_description || 'PayPal auth failed'); error.status = 502; throw error; }
  return body.access_token;
}

/** Creates a PayPal subscription against the pre-created PAYPAL_PLAN_ID.
 * `customId` should be the local Payment record's id so the webhook can map
 * the resulting PayPal subscription back to it. Returns the PayPal
 * subscription object; callers redirect the recruiter to the `approve`
 * link in its `links` array. */
export async function createSubscription({ customId, planKey, returnUrl, cancelUrl }) {
  if (!isPaypalConfigured(planKey)) { const error = new Error('PayPal is not configured for this plan'); error.status = 503; throw error; }
  const token = await getAccessToken();
  const response = await fetch(`${apiBase()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId(planKey),
      custom_id: customId,
      application_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'SUBSCRIBE_NOW' },
    }),
  });
  const body = await response.json();
  if (!response.ok) { const error = new Error(body?.message || 'PayPal subscription creation failed'); error.status = 502; throw error; }
  return body;
}

export function approveLink(subscription) {
  return subscription.links?.find((link) => link.rel === 'approve')?.href || null;
}

/** Delegates signature verification to PayPal's own API rather than
 * hand-rolling it — PayPal's webhook signing scheme (cert_url + auth_algo +
 * transmission_sig) is intentionally not meant to be re-implemented
 * client-side; this is their documented verification path. */
export async function verifyWebhookSignature(headers, rawEventBody) {
  if (!isPaypalConfigured() || !webhookId()) return false;
  try {
    const token = await getAccessToken();
    const response = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transmission_id: headers['paypal-transmission-id'],
        transmission_time: headers['paypal-transmission-time'],
        cert_url: headers['paypal-cert-url'],
        auth_algo: headers['paypal-auth-algo'],
        transmission_sig: headers['paypal-transmission-sig'],
        webhook_id: webhookId(),
        webhook_event: rawEventBody,
      }),
    });
    const body = await response.json();
    return response.ok && body.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}
