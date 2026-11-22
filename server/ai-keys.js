// Members' own AI keys ("Use your own chatbot": Claude or ChatGPT).
//
// - The key is checked with the provider (free "list models" call) before it is saved.
// - Stored encrypted at rest (AES-256-GCM). The encryption key comes from AI_KEY_SECRET, or else from
//   SESSION_SECRET, so a database copy alone cannot reveal members' keys.
// - The full key never goes back to the browser: only provider, model and the last 4 characters.
// - Nothing here logs a key.
import crypto from 'node:crypto';

export const KEY_LINKS = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

// Model per tier, most preferred first. On save we pick the first one the member's account can use.
export const MODEL_PREFS = {
  anthropic: { best: ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-opus-4-8'], fast: ['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-sonnet-5-5'] },
  openai: { best: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini'], fast: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'] },
};

const MODELS_URL = (provider, env = process.env) => (provider === 'anthropic'
  ? (env.AI_CHAT_ANTHROPIC_MODELS_URL || 'https://api.anthropic.com/v1/models?limit=100')
  : (env.AI_CHAT_OPENAI_MODELS_URL || 'https://api.openai.com/v1/models'));

/** Format check with a helpful message (catches keys pasted into the wrong provider). */
export function keyFormatError(provider, key) {
  const k = String(key || '').trim();
  if (!k) return 'Paste your API key';
  if (/\s/.test(k)) return 'The key should not contain spaces';
  if (provider === 'anthropic') {
    if (!k.startsWith('sk-ant-')) return k.startsWith('sk-') ? 'This looks like an OpenAI (ChatGPT) key. Choose ChatGPT, or paste a Claude key (it starts with sk-ant-).' : 'A Claude API key starts with sk-ant-';
  } else if (provider === 'openai') {
    if (k.startsWith('sk-ant-')) return 'This looks like a Claude key. Choose Claude, or paste an OpenAI key (it starts with sk-).';
    if (!k.startsWith('sk-')) return 'An OpenAI API key starts with sk-';
  } else return 'Choose Claude or ChatGPT';
  if (k.length < 24 || k.length > 300) return 'This key looks incomplete. Copy the whole key again.';
  return null;
}

/** Ask the provider for the models this key can use. Returns { ok, models } or { ok:false, status, code }. */
export async function verifyKey(provider, key, fetchImpl = fetch, env = process.env) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const headers = provider === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${key}` };
    const res = await fetchImpl(MODELS_URL(provider, env), { headers, signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) return { ok: false, status: 400, code: 'key_refused' };
    if (res.status === 429) return { ok: true, models: [] }; // valid key, just busy: keep the default model
    if (!res.ok) { console.warn(`ai-keys: ${provider} models check returned ${res.status}`); return { ok: false, status: 502, code: 'provider_error' }; }
    const body = await res.json().catch(() => ({}));
    return { ok: true, models: (body.data || []).map((m) => m.id).filter(Boolean) };
  } catch (e) {
    console.warn(`ai-keys: ${provider} unreachable (${e.name})`);
    return { ok: false, status: 502, code: 'provider_unreachable' };
  } finally { clearTimeout(timer); }
}

/** First preferred model the account has; if the list is empty or unknown, the first preference. */
export function pickModel(provider, tier, available = []) {
  const prefs = MODEL_PREFS[provider][tier === 'fast' ? 'fast' : 'best'];
  if (!available.length) return prefs[0];
  const have = new Set(available);
  return prefs.find((m) => have.has(m))
    || (provider === 'anthropic' ? available.find((m) => m.startsWith('claude-')) : available.find((m) => /^gpt-/.test(m) && !/(audio|realtime|transcribe|tts|search|image)/.test(m)))
    || prefs[0];
}

const secretKey = (secret) => crypto.createHash('sha256').update(`${secret}:jobsmatchnow-ai-keys:v1`).digest();
export function encryptKey(plain, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(secret), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
/** Returns the key, or null if it cannot be decrypted (e.g. the server secret changed). */
export function decryptKey(blob, secret) {
  try {
    const buf = Buffer.from(String(blob), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', secretKey(secret), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

/** What the browser may see about a saved key. */
export const publicKeyInfo = (rec) => (rec ? { provider: rec.provider, tier: rec.tier, model: rec.model, last4: rec.last4, savedAt: rec.savedAt } : null);
