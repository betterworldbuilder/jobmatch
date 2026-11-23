import crypto from 'node:crypto';

/* payOS (by Casso, Vietnam): VietQR checkout that confirms bank transfers automatically. Opens for individuals and
 * household businesses verified with a CCCD (no tax code needed), so it works before a Vietnamese company exists.
 * The customer scans the VietQR in any Vietnamese banking app, ZaloPay or MoMo; money lands directly in the bank
 * account linked to payOS. Founder, 2026-11-24.
 *
 * Same safety rule as every provider here: the browser redirect is UX only; only the webhook, whose signature we
 * verify with the checksum key, ever confirms a payment (server/billing/confirm.js).
 *
 * Env (secrets live only in /etc/jobsmatchnow-api.env): PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY.
 * PAYOS_API_URL overrides the endpoint (tests). Unconfigured = safe no-op (create route answers 503). */

function clientId() { return process.env.PAYOS_CLIENT_ID || ''; }
function apiKey() { return process.env.PAYOS_API_KEY || ''; }
function checksumKey() { return process.env.PAYOS_CHECKSUM_KEY || ''; }
function apiBase() { return process.env.PAYOS_API_URL || 'https://api-merchant.payos.vn'; }

export function isPayosConfigured() {
  return Boolean(clientId() && apiKey() && checksumKey());
}

/** payOS order codes are positive integers, unique per merchant (we keep them under 2^53). */
export function newOrderCode(existing = new Set()) {
  let code;
  do { code = Number(`${Date.now() % 1e10}${crypto.randomInt(100, 999)}`); } while (existing.has(code));
  return code;
}

/** Bank transfer memos are short: payOS limits the description to 25 characters. */
export function payosDescription(invoiceNumber) {
  return `JMN ${String(invoiceNumber || '').replace(/^INV-/, '')}`.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 25);
}

function hmac(data) {
  return crypto.createHmac('sha256', checksumKey()).update(data).digest('hex');
}

/** Signature of a payment request: these 5 fields, alphabetical, `key=value` joined by `&`. */
export function signPaymentRequest({ amount, cancelUrl, description, orderCode, returnUrl }) {
  return hmac(`amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`);
}

/** Signature of webhook `data`: every field, keys sorted, null/undefined as empty, `key=value` joined by `&`. */
export function signWebhookData(data) {
  return hmac(Object.keys(data || {}).sort().map((k) => {
    const v = data[k];
    return `${k}=${v === null || v === undefined || v === 'null' || v === 'undefined' ? '' : typeof v === 'object' ? JSON.stringify(v) : v}`;
  }).join('&'));
}

/** Never throws: false on any mismatch or when payOS is not configured. */
export function verifyWebhook(body) {
  if (!isPayosConfigured() || !body?.data || typeof body.signature !== 'string') return false;
  const a = Buffer.from(signWebhookData(body.data));
  const b = Buffer.from(body.signature.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** payOS's success sentinel: both the envelope and the data say "00". */
export function isPayosPaid(body) {
  return body?.code === '00' && (body?.data?.code === undefined || body.data.code === '00');
}

/** Creates a hosted payment link. Returns { checkoutUrl, qrCode, paymentLinkId }. */
export async function createPaymentLink({ orderCode, amount, description, returnUrl, cancelUrl, buyerEmail, items }) {
  if (!isPayosConfigured()) { const error = new Error('payOS is not configured'); error.status = 503; throw error; }
  const payload = {
    orderCode, amount: Math.round(amount), description, returnUrl, cancelUrl,
    ...(buyerEmail ? { buyerEmail } : {}),
    ...(items?.length ? { items } : {}),
    signature: signPaymentRequest({ amount: Math.round(amount), cancelUrl, description, orderCode, returnUrl }),
  };
  const response = await fetch(`${apiBase()}/v2/payment-requests`, {
    method: 'POST',
    headers: { 'x-client-id': clientId(), 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code !== '00' || !body.data?.checkoutUrl) {
    const error = new Error(`payOS could not create the payment (${body.desc || response.status})`); error.status = 502; throw error;
  }
  return { checkoutUrl: body.data.checkoutUrl, qrCode: body.data.qrCode, paymentLinkId: body.data.paymentLinkId };
}
