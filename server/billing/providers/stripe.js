import crypto from 'node:crypto';
import { keyFor } from '../payment-settings.js';

/* Stripe: recruiter subscription checkout for a France-registered merchant
 * entity (Stripe does not support Vietnam-registered merchants, which is why
 * VNPay exists as the other card-payment path — see providers/vnpay.js).
 * Hand-rolled against Stripe's HTTP API with fetch + node:crypto rather than
 * the `stripe` SDK, matching this codebase's existing pattern (see VNPay).
 *
 * Checkout Sessions do the card collection on Stripe's own hosted page, so
 * card numbers never touch our server. The webhook is the only thing that
 * ever confirms a payment — see server/billing/confirm.js — the client
 * returning from Stripe's checkout page is UX only. */

// Keys entered in Admin → Billing → Payment methods win; the env file is the fallback (payment-settings.js).
function secretKey() { return keyFor('stripe', 'secretKey'); }
function webhookSecret() { return keyFor('stripe', 'webhookSecret'); }
function priceId() { return process.env.STRIPE_PRICE_ID || ''; }

/** Ready when the secret key is set: prices come from the plan catalogue (price_data), so no Stripe price IDs are
 *  needed any more (STRIPE_PRICE_ID is only the legacy fallback). */
export function isStripeConfigured() {
  return Boolean(secretKey());
}

/** "Test connection" in Admin: read the account balance with the key (no charge). Never throws. */
export async function testStripeConnection() {
  if (!secretKey()) return { ok: false, message: 'Secret key is not set' };
  try {
    const r = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${secretKey()}` } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, message: body?.error?.message || `Stripe answered ${r.status}` };
    return { ok: true, message: `Connected to Stripe (${body.livemode ? 'live' : 'test'} mode)${webhookSecret() ? '' : '. Add the webhook signing secret so payments can be confirmed.'}` };
  } catch { return { ok: false, message: 'Stripe could not be reached' }; }
}

function formBody(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.append(key, String(value));
  }
  return search.toString();
}

/** Creates a Stripe-hosted Checkout Session for one recruiter-monthly
 * subscription. `clientReferenceId` should be the local Payment record's id
 * so the webhook can map the resulting Stripe objects back to it. */
/** Stripe payment-method types per JobsMatchNow method (Apple Pay / Google Pay come with "card"). SEPA, Bancontact
 *  and iDEAL only work in EUR. */
export const STRIPE_TYPES = { stripe_card: ['card'], stripe_sepa: ['sepa_debit'], stripe_bancontact_ideal: ['bancontact', 'ideal'] };

/** The Stripe payment methods to offer, from the JobsMatchNow methods allowed for this customer and the currency. */
export function stripePaymentTypes(allowedMethodIds, currency) {
  const types = new Set();
  for (const id of allowedMethodIds) {
    if (!STRIPE_TYPES[id]) continue;
    if (id !== 'stripe_card' && currency !== 'EUR') continue;
    for (const t of STRIPE_TYPES[id]) types.add(t);
  }
  return [...types];
}

export async function createCheckoutSession({ clientReferenceId, customerEmail, successUrl, cancelUrl, amount, currency = 'USD', interval = 'monthly', productName = 'JobsMatchNow plan', paymentMethodTypes = [] }) {
  if (!isStripeConfigured()) { const error = new Error('Stripe is not configured'); error.status = 503; throw error; }
  // Price from the live catalogue (price_data); the legacy fixed STRIPE_PRICE_ID only when no amount is given.
  const line = Number.isFinite(amount) && amount > 0
    ? {
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': Math.round(amount * 100),
      'line_items[0][price_data][recurring][interval]': interval === 'annual' ? 'year' : 'month',
      'line_items[0][price_data][product_data][name]': productName,
    }
    : { 'line_items[0][price]': priceId() };
  if (!line['line_items[0][price]'] && !line['line_items[0][price_data][currency]']) { const error = new Error('Stripe price is missing'); error.status = 503; throw error; }
  const types = Object.fromEntries(paymentMethodTypes.map((t, i) => [`payment_method_types[${i}]`, t]));
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      mode: 'subscription',
      ...line,
      'line_items[0][quantity]': 1,
      ...types,
      client_reference_id: clientReferenceId,
      customer_email: customerEmail,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });
  const body = await response.json();
  if (!response.ok) { const error = new Error(body?.error?.message || 'Stripe checkout session creation failed'); error.status = 502; throw error; }
  return body; // { id, url, ... }
}

/** Verifies Stripe's webhook signature: header is `t=<timestamp>,v1=<hex hmac>`,
 * signed payload is `${timestamp}.${rawBody}` with HMAC-SHA256. Rejects
 * signatures older than 5 minutes to block replay of a captured payload. */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!isStripeConfigured() || !webhookSecret() || !signatureHeader) return false;
  const parts = Object.fromEntries(String(signatureHeader).split(',').map((part) => part.split('=')));
  const timestamp = parts.t;
  const providedSignature = parts.v1;
  if (!timestamp || !providedSignature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', webhookSecret()).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
