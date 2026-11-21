// Server-side forwarding of funnel events (signup, role posted, swipe, match,
// first message) to Mixpanel, Amplitude and Heap. Keys are set by an admin in
// Admin > Integrations and stored in the database. Nothing runs until a key is
// set and enabled. Privacy: only the event name, its category (dim), side and
// week are sent, with a random id per event: no user ids, names, emails or text.
// Demo/sample activity is never sent.
import crypto from 'node:crypto';

export const VENDORS = {
  mixpanel: { label: 'Mixpanel', field: 'token', hint: 'Project token (Mixpanel > Project settings)' },
  amplitude: { label: 'Amplitude', field: 'apiKey', hint: 'API key (Amplitude > Settings > Projects)' },
  heap: { label: 'Heap', field: 'appId', hint: 'App ID / environment ID (Heap > Account > Manage > Projects)' },
};

let config = {};
export function setIntegrationConfig(next) { config = next || {}; }

/** What the admin page may show: never the full key, only its last 4 characters. */
export function maskedConfig(cfg = config) {
  return Object.fromEntries(Object.entries(VENDORS).map(([id, v]) => {
    const key = cfg[id]?.[v.field] || '';
    return [id, { label: v.label, field: v.field, hint: v.hint, enabled: Boolean(cfg[id]?.enabled && key), hasKey: Boolean(key), keyHint: key ? `…${key.slice(-4)}` : '', lastSentAt: cfg[id]?.lastSentAt || null, lastError: cfg[id]?.lastError || null }];
  }));
}

function body(vendor, key, event, now) {
  const id = crypto.randomUUID();
  const props = { dim: event.dim || '', side: event.side || '', source: 'jobsmatchnow-server' };
  if (vendor === 'mixpanel') return { url: 'https://api.mixpanel.com/track', json: [{ event: event.name, properties: { token: key, distinct_id: id, time: Math.floor(now / 1000), $insert_id: id, ...props } }] };
  if (vendor === 'amplitude') return { url: 'https://api2.amplitude.com/2/httpapi', json: { api_key: key, events: [{ event_type: event.name, device_id: id, time: now, insert_id: id, event_properties: props }] } };
  return { url: 'https://heapanalytics.com/api/track', json: { app_id: key, identity: id, event: event.name, timestamp: new Date(now).toISOString(), properties: props } };
}

/** Send one event to one vendor. Resolves { ok, status, error }. Never throws. */
export async function sendTo(vendor, key, event, { now = Date.now(), fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const { url, json } = body(vendor, key, event, now);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(json), signal: ctrl.signal });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}

/** Called by analytics.track(): forwards real events to every enabled vendor, fire-and-forget. */
export function forwardEvent(name, { demo = false, dim = '' } = {}, onResult) {
  if (demo) return;
  for (const [vendor, v] of Object.entries(VENDORS)) {
    const c = config[vendor];
    const key = c?.[v.field];
    if (!c?.enabled || !key) continue;
    const side = dim.includes('team') ? 'team' : dim.includes('candidate') ? 'candidate' : '';
    sendTo(vendor, key, { name, dim, side }).then((r) => onResult?.(vendor, r)).catch(() => undefined);
  }
}
