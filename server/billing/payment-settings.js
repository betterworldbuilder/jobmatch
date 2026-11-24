// Payment methods, provider keys and "where each method is shown" (founder, 2026-11-24).
//
// - Every method has an on/off switch and a region/country grid. A country column beats its region.
// - Provider keys (payOS, Stripe, PayPal) can be entered in Admin instead of the server env file. They are stored
//   encrypted (AES-256-GCM, same scheme as members' AI keys) and only decrypted in memory; the browser only ever
//   sees the last 4 characters. Env variables still work and act as the fallback.
// - USDT can never be shown for Vietnam (crypto is not a lawful means of payment there): locked in code.
// Data: db.paymentSettings = { keys: { provider: { field: encrypted } }, enabled: { methodId: bool }, grid: { methodId: { zone: bool } } }
import { decryptKey, encryptKey } from '../ai-keys.js';

export const REGIONS = ['EU', 'NA', 'ASIA', 'ROW'];
export const COUNTRIES = ['VN', 'US', 'GB', 'FR', 'SG', 'AU'];
export const ZONE_LABEL = { EU: 'EU', NA: 'US / North America', ASIA: 'Asia', ROW: 'Rest of world', VN: 'Vietnam', US: 'USA', GB: 'UK', FR: 'France', SG: 'Singapore', AU: 'Australia' };

/** Provider credentials: field names, labels, and the env variable each falls back to. */
export const PROVIDER_FIELDS = {
  payos: [['clientId', 'Client ID', 'PAYOS_CLIENT_ID'], ['apiKey', 'API key', 'PAYOS_API_KEY'], ['checksumKey', 'Checksum key', 'PAYOS_CHECKSUM_KEY']],
  stripe: [['secretKey', 'Secret key (sk_live_…)', 'STRIPE_SECRET_KEY'], ['webhookSecret', 'Webhook signing secret (whsec_…)', 'STRIPE_WEBHOOK_SECRET']],
  paypal: [['clientId', 'Client ID', 'PAYPAL_CLIENT_ID'], ['clientSecret', 'Secret', 'PAYPAL_CLIENT_SECRET'], ['webhookId', 'Webhook ID', 'PAYPAL_WEBHOOK_ID']],
};

/** The methods, in the order recruiters see them. `provider` = needs keys; `manual` = needs details in the
 *  bank-instructions form (`needs` lists which). `webhook` is where the provider must send its notifications. */
export const METHODS = [
  // Google Play (founder, 2026-11-24: default in every region): only inside the Android app installed from Google
  // Play; Google shows each buyer their local methods (cards, PayPal, ZaloPay, MoMo, ShopeePay…) and handles VAT.
  { id: 'google_play', label: 'Google Play (Android app from the Play Store)', provider: 'googleplay', currency: 'Local currency (Google converts)', webhook: '/api/billing/google-play/rtdn?token=…', automatic: true, androidOnly: true },
  { id: 'payos', label: 'VietQR (payOS): Vietnamese banks, ZaloPay, MoMo', provider: 'payos', currency: 'VND', webhook: '/api/billing/payos/webhook', automatic: true },
  { id: 'bank_vn', label: 'Bank transfer in Vietnam (HSBC)', manual: true, needs: ['bankAccountNumber'], currency: 'USD/VND' },
  { id: 'stripe_card', label: 'Card, Apple Pay, Google Pay (Stripe)', provider: 'stripe', currency: 'USD or EUR', webhook: '/api/billing/stripe/webhook', automatic: true },
  { id: 'stripe_sepa', label: 'SEPA Direct Debit (Stripe, EUR)', provider: 'stripe', currency: 'EUR', webhook: '/api/billing/stripe/webhook', automatic: true, needsEur: true },
  { id: 'stripe_bancontact_ideal', label: 'Bancontact / iDEAL (Stripe, EUR)', provider: 'stripe', currency: 'EUR', webhook: '/api/billing/stripe/webhook', automatic: true, needsEur: true },
  { id: 'sepa_transfer', label: 'SEPA bank transfer to JobsMatchNow SARL', manual: true, needs: ['sarlIban'], currency: 'EUR/USD' },
  { id: 'international_wire', label: 'International wire to JobsMatchNow SARL', manual: true, needs: ['sarlIban|bankSwift'], currency: 'USD' },
  { id: 'paypal', label: 'PayPal', provider: 'paypal', currency: 'USD', webhook: '/api/billing/paypal/webhook', automatic: true },
  { id: 'usdt', label: 'USDT (TRC-20) to the SARL wallet', manual: true, needs: ['usdtTrc20Address'], currency: 'USDT' },
];
export const METHOD_IDS = METHODS.map((m) => m.id);

const on = (zones) => Object.fromEntries(zones.map((z) => [z, true]));
/** Starting grid, as agreed with the founder (every box can be changed in Admin). */
export const DEFAULT_GRID = {
  google_play: on(['EU', 'NA', 'ASIA', 'ROW', 'VN', 'US', 'GB', 'FR', 'SG', 'AU']),
  payos: on(['VN']),
  bank_vn: on(['VN']),
  stripe_card: on(['EU', 'NA', 'ASIA', 'ROW', 'US', 'GB', 'FR', 'SG', 'AU']),
  stripe_sepa: on(['EU', 'FR']),
  stripe_bancontact_ideal: on(['EU']),
  sepa_transfer: on(['EU', 'FR']),
  international_wire: on(['NA', 'ASIA', 'ROW', 'US', 'GB', 'SG', 'AU']),
  paypal: on(['EU', 'NA', 'ASIA', 'ROW', 'VN', 'US', 'GB', 'FR', 'SG', 'AU']),
  usdt: {},
};

// --- Country recognition (profiles hold free text: "Vietnam", "Paris, France", "USA"…) -----------------------------
const NAMES = {
  VN: ['vietnam', 'viet nam', 'vn', 'việt nam'], US: ['united states', 'united states of america', 'usa', 'us', 'america'],
  GB: ['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland', 'gb'], FR: ['france', 'fr'],
  SG: ['singapore', 'sg'], AU: ['australia', 'au'],
};
const EU = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czechia', 'czech republic', 'denmark', 'estonia', 'finland', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'the netherlands', 'holland', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'norway', 'iceland', 'liechtenstein', 'switzerland'];
const NA = ['canada', 'mexico'];
const ASIA = ['china', 'hong kong', 'taiwan', 'japan', 'south korea', 'korea', 'india', 'indonesia', 'malaysia', 'philippines', 'thailand', 'cambodia', 'laos', 'myanmar', 'bangladesh', 'pakistan', 'sri lanka', 'nepal', 'brunei', 'mongolia', 'united arab emirates', 'uae', 'saudi arabia', 'qatar', 'israel', 'turkey', 'new zealand'];

/** From a free-text country (or "City, Country"): { country: 'FR'|…|null, region: 'EU'|'NA'|'ASIA'|'ROW' }. */
export function zoneOf(text) {
  const parts = String(text || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const name = parts.length ? parts[parts.length - 1] : '';
  if (!name) return { country: null, region: 'ROW' };
  for (const [code, names] of Object.entries(NAMES)) {
    if (names.includes(name)) return { country: code, region: { FR: 'EU', US: 'NA', VN: 'ASIA', SG: 'ASIA' }[code] || 'ROW' };
  }
  if (EU.includes(name)) return { country: null, region: 'EU' };
  if (NA.includes(name)) return { country: null, region: 'NA' };
  if (ASIA.includes(name)) return { country: null, region: 'ASIA' };
  return { country: null, region: 'ROW' };
}

/** The grid in force: defaults overlaid with the admin's saved boxes. */
export function gridOf(settings) {
  const grid = {};
  for (const id of METHOD_IDS) grid[id] = { ...(DEFAULT_GRID[id] || {}), ...(settings?.grid?.[id] || {}) };
  grid.usdt.VN = false; // locked
  return grid;
}

/** Is a method shown for this place? The country box wins when set; otherwise the region box. USDT never in Vietnam. */
export function shownIn(settings, methodId, place) {
  const { country, region } = typeof place === 'string' || !place ? zoneOf(place) : place;
  if (methodId === 'usdt' && country === 'VN') return false;
  const g = gridOf(settings)[methodId] || {};
  if (country && g[country] !== undefined) return Boolean(g[country]);
  return Boolean(g[region]);
}

// --- Keys -------------------------------------------------------------------------------------------------------
const secret = () => process.env.PAYMENT_KEY_SECRET || process.env.AI_KEY_SECRET || process.env.SESSION_SECRET || 'dev-only-secret';
/** Decrypted provider keys, in memory only (filled by applyPaymentSettings). Providers read these first, then env. */
export const runtimeKeys = { payos: {}, stripe: {}, paypal: {} };

export function applyPaymentSettings(settings) {
  for (const provider of Object.keys(PROVIDER_FIELDS)) {
    runtimeKeys[provider] = {};
    for (const [field] of PROVIDER_FIELDS[provider]) {
      const blob = settings?.keys?.[provider]?.[field];
      const plain = blob ? decryptKey(blob, secret()) : null;
      if (plain) runtimeKeys[provider][field] = plain;
    }
  }
  return runtimeKeys;
}

/** The value a provider should use: Admin-entered key first, then the env variable. */
export function keyFor(provider, field) {
  const entry = (PROVIDER_FIELDS[provider] || []).find(([f]) => f === field);
  return runtimeKeys[provider]?.[field] || (entry ? process.env[entry[2]] || '' : '');
}

/** Save keys from the admin form: a non-empty value replaces, "" keeps the saved one, null clears it. */
export function saveKeys(settings, provider, input) {
  if (!PROVIDER_FIELDS[provider]) throw Object.assign(new Error('Unknown provider'), { status: 404 });
  const next = { ...(settings || {}), keys: { ...(settings?.keys || {}) } };
  const keys = { ...(next.keys[provider] || {}) };
  for (const [field] of PROVIDER_FIELDS[provider]) {
    const v = input?.[field];
    if (v === null) delete keys[field];
    else if (typeof v === 'string' && v.trim()) {
      const s = v.trim();
      if (/\s/.test(s) || s.length > 400) throw Object.assign(new Error(`${field}: paste the value again (no spaces)`), { status: 400 });
      keys[field] = encryptKey(s, secret());
    }
  }
  next.keys[provider] = keys;
  return next;
}

/** What the admin page may see about keys: which fields are set, last 4 characters, and where they come from. */
export function publicKeys(provider) {
  return (PROVIDER_FIELDS[provider] || []).map(([field, label, env]) => {
    const fromAdmin = runtimeKeys[provider]?.[field];
    const value = fromAdmin || process.env[env] || '';
    return { field, label, set: Boolean(value), last4: value ? value.slice(-4) : '', source: fromAdmin ? 'admin' : value ? 'server file' : null };
  });
}

/** Switch: a method is on unless the admin switched it off. */
export const isEnabled = (settings, methodId) => settings?.enabled?.[methodId] !== false;
