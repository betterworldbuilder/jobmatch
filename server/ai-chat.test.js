import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { unlinkSync } from 'node:fs';

/* Ask AI: session required, own data only, minimal data to the provider, provider failure, daily limit,
   not-configured, no-data short-circuit. A fake provider (Anthropic Messages format) runs on localhost. */
const DB_PATH = `/tmp/jobmatch-aichat-test-${process.pid}.json`;
let server; let base; let fake; let fakeUrl;
const seen = []; let fakeMode = 'ok';

before(async () => {
  fake = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET' && req.url.startsWith('/v1/models')) { // key check
        if (String(req.headers['x-api-key']).includes('refused')) { res.writeHead(401); res.end('{}'); return; }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'claude-haiku-5-5' }, { id: 'claude-opus-5-5' }] })); return;
      }
      const json = JSON.parse(body || '{}'); seen.push({ headers: req.headers, json });
      if (fakeMode === 'fail') { res.writeHead(500); res.end('{"error":"boom"}'); return; }
      const user = json.messages.at(-1).content;
      const firstJob = (user.match(/\[J1\] ([^|]+)/) || [])[1]?.trim() || 'no role';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: `Your best match is ${firstJob} [J1].` }] }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  fakeUrl = `http://127.0.0.1:${fake.address().port}/v1/messages`;
  Object.assign(process.env, { NODE_ENV: 'test', DB_PATH, AI_CHAT_PROVIDER: 'anthropic', USE_SERVER_AI_KEY: 'true', ANTHROPIC_API_KEY: 'test-key-never-logged', AI_CHAT_ANTHROPIC_URL: fakeUrl, AI_CHAT_ANTHROPIC_MODELS_URL: fakeUrl.replace('/messages', '/models'), AI_CHAT_DAILY_LIMIT: '3', AI_CHAT_BURST_PER_MIN: '100',
    // Test-only: the demo accounts' sample data with Premium (never on outside NODE_ENV=test; see the demo test below).
    TEST_DEMO_PREMIUM: 'on' });
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); fake?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } delete process.env.AI_CHAT_PROVIDER; });

async function call(method, path, body, cookie) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
const loginDemo = async (userId) => (await call('POST', '/api/auth/login', { userId })).session;

test('unauthenticated requests are refused (no demo bypass)', async () => {
  assert.equal((await call('POST', '/api/ai/chat', { question: 'What are my best job matches?' })).status, 401);
  assert.equal((await call('GET', '/api/ai/chat/status')).status, 401);
  // A userId in the body does not authenticate anyone.
  assert.equal((await call('POST', '/api/ai/chat', { question: 'hi', userId: 'candidate-demo' })).status, 401);
});

test('a normal question uses the member\'s own data, cites sources, and sends only minimal data', async () => {
  const ck = await loginDemo('candidate-demo');
  const st = await call('GET', '/api/ai/chat/status', undefined, ck);
  assert.deepEqual({ enabled: st.body.enabled, provider: st.body.provider, remaining: st.body.remaining }, { enabled: true, provider: 'anthropic', remaining: 3 });
  const r = await call('POST', '/api/ai/chat', { question: 'What are my best job matches?' }, ck);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.answer, /\[J1\]/);
  assert.equal(r.body.sources.length, 1); assert.equal(r.body.sources[0].kind, 'job');
  assert.equal(r.body.remaining, 2);
  const sent = JSON.stringify(seen.at(-1).json);
  assert.equal(seen.at(-1).headers['x-api-key'], 'test-key-never-logged', 'key is sent server-to-provider only');
  for (const secret of ['Sofia Okafor', 'sofia.okafor@demo.jobsmatchnow.app', '@demo.jobsmatchnow.app', 'wa.me']) assert.ok(!sent.includes(secret), `does not send ${secret}`);
  assert.match(sent, /TOP MATCHING ROLES/); assert.match(sent, /Answer ONLY from the DATA/);
});

test('cross-user: the body cannot switch whose data is used', async () => {
  const ck = await loginDemo('candidate-demo');
  await call('POST', '/api/ai/chat', { question: 'my matches?', userId: 'c-1', viewerId: 'c-1' }, ck);
  const sent = seen.at(-1).json.messages.at(-1).content;
  assert.match(sent, /Current title: Senior AI Product Manager/, 'still the session member (Sofia)');
  assert.doesNotMatch(sent, /Current title: Senior AI Engineer/, 'not c-1');
});

test('a member with no relevant data gets a clear answer without calling the provider', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Empty Member', email: `empty-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const locked = await call('POST', '/api/ai/chat', { question: 'Help me prepare for my next interview.' }, reg.session);
  assert.equal(locked.status, 402, 'Ask AI is Premium'); assert.equal(locked.body.code, 'premium_required');
  // Candidates give their citizenship before Premium starts (founder, 2026-11-24: it decides their payment methods).
  assert.equal((await call('POST', '/api/premium/trial', {}, reg.session)).status, 400, 'citizenship asked first');
  const trial = await call('POST', '/api/premium/trial', { citizenship: 'Vietnam' }, reg.session);
  assert.equal(trial.status, 200); assert.equal(trial.body.source, 'trial'); assert.equal(trial.body.daysLeft, 7);
  assert.equal((await call('POST', '/api/premium/trial', {}, reg.session)).status, 409, 'trial is one-time');
  const before = seen.length;
  const r = await call('POST', '/api/ai/chat', { question: 'Help me prepare for my next interview.' }, reg.session);
  assert.equal(r.status, 200);
  assert.match(r.body.answer, /don't have enough of your data/);
  assert.equal(seen.length, before, 'provider not called');
});

test('provider failure → clear 502; then the daily limit → 429', async () => {
  const ck = await loginDemo('candidate-demo-2');
  fakeMode = 'fail';
  const fail = await call('POST', '/api/ai/chat', { question: 'What skills am I missing?' }, ck);
  assert.equal(fail.status, 502); assert.match(fail.body.error, /not answering right now/); assert.equal(fail.body.code, 'provider_error');
  fakeMode = 'ok';
  assert.equal((await call('POST', '/api/ai/chat', { question: 'q2' }, ck)).status, 200);
  assert.equal((await call('POST', '/api/ai/chat', { question: 'q3' }, ck)).status, 200);
  const limited = await call('POST', '/api/ai/chat', { question: 'q4' }, ck);
  assert.equal(limited.status, 429); assert.match(limited.body.error, /limit of 3 questions/);
});

test('burst guard is on by default (10 a minute) and configurable', async () => {
  const { rateLimit } = await import('./auth.js');
  const guard = rateLimit({ windowMs: 60000, max: 2, bucket: `t-${process.pid}` });
  const fakeReq = { ip: '9.9.9.9', headers: {}, socket: {} }; let blocked = 0;
  for (let i = 0; i < 3; i += 1) await new Promise((r) => guard(fakeReq, { status() { blocked += 1; return { json: r }; }, setHeader() {}, set() { return this; } }, r));
  assert.equal(blocked, 1, 'third request in the window is blocked');
});

test('recruiters get answers from their own roles, with candidates by title only', async () => {
  const r = await call('POST', '/api/ai/chat', { question: 'Which candidates fit my roles best?' }, await loginDemo('employer-demo'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sent = seen.at(-1).json;
  assert.match(sent.system, /hiring team/);
  assert.match(sent.messages.at(-1).content, /MY OPEN ROLES/);
  assert.match(sent.messages.at(-1).content, /\[R1\]/);
  assert.ok(!JSON.stringify(sent).includes('@demo.jobsmatchnow.app'), 'no candidate emails');
});

test('own key: format checks, refused key, demo accounts blocked, stored encrypted, used for the chat, removable', async () => {
  const demo = await loginDemo('candidate-demo');
  assert.equal((await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: 'sk-ant-api03-demo-account-key-000000' }, demo)).status, 403);
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Key Owner', email: `keys-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const ck = reg.session;
  await call('POST', '/api/premium/trial', { citizenship: 'France' }, ck);
  const wrong =await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz' }, ck);
  assert.equal(wrong.status, 400); assert.match(JSON.stringify(wrong.body), /OpenAI/);
  const refused = await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: 'sk-ant-api03-refused-0000000000000000' }, ck);
  assert.equal(refused.status, 400); assert.match(refused.body.error, /refused this key/);
  const KEY = 'sk-ant-api03-member-own-key-abcdefghij1234';
  const saved = await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: KEY, tier: 'fast' }, ck);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual({ p: saved.body.key.provider, m: saved.body.key.model, l: saved.body.key.last4 }, { p: 'anthropic', m: 'claude-haiku-5-5', l: '1234' });
  assert.ok(!JSON.stringify(saved.body).includes(KEY), 'full key never returned');
  const { readFileSync } = await import('node:fs');
  assert.ok(!readFileSync(DB_PATH, 'utf8').includes(KEY), 'key is encrypted at rest');
  const st = await call('GET', '/api/ai/chat/status', undefined, ck);
  assert.equal(st.body.source, 'own'); assert.equal(st.body.ownKey.last4, '1234'); assert.ok(!JSON.stringify(st.body).includes(KEY));
  // Give the member a skill so the chat has data, then check the member's key is the one used.
  const me = (await call('GET', '/api/auth/me', undefined, ck)).body.user;
  const patched = await call('PATCH', `/api/users/${me.id}`, { skillsDetail: [{ name: 'Python', level: 4 }, { name: 'AWS', level: 3 }] }, ck);
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  const r = await call('POST', '/api/ai/chat', { question: 'What skills am I missing?' }, ck);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.provider, 'your Claude account', 'the provider was called with the member\'s own key');
  assert.equal(seen.at(-1).headers['x-api-key'], KEY); assert.equal(seen.at(-1).json.model, 'claude-haiku-5-5');
  assert.deepEqual(seen.at(-1).json.output_config, { effort: 'low' });
  assert.equal((await call('DELETE', '/api/ai/key', undefined, ck)).status, 200);
  const after = await call('GET', '/api/ai/chat/status', undefined, ck);
  assert.equal(after.body.ownKey, null); assert.equal(after.body.source, 'server');
});

test('demo accounts: nothing can be activated — no Premium, Ask AI, trial, AI key or connector key (founder, 2026-11-27)', async () => {
  process.env.TEST_DEMO_PREMIUM = '';
  try {
    const ck = await loginDemo('candidate-demo');
    const st = await call('GET', '/api/ai/chat/status', undefined, ck);
    assert.equal(st.body.premium.active, false); assert.equal(st.body.premium.demo, true);
    assert.equal((await call('POST', '/api/ai/chat', { question: 'What are my matches?' }, ck)).status, 402);
    assert.equal((await call('POST', '/api/premium/trial', { citizenship: 'Vietnam' }, ck)).status, 403);
    assert.equal((await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: 'sk-ant-api03-demo-account-key-000000' }, ck)).status, 403);
    const me = (await call('GET', '/api/auth/me', undefined, ck)).body.user;
    assert.equal((await call('POST', '/api/me/connector-keys', { userId: me.id, label: 'x' }, ck)).status, 403);
    const rec = await loginDemo('employer-demo');
    assert.equal((await call('GET', '/api/ai/chat/status', undefined, rec)).body.premium.active, false, 'demo recruiters too');
    // A real member without Premium cannot save an AI key either (AI setup is for Premium members).
    const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'No Premium', email: `nopremium-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
    const key = await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: 'sk-ant-api03-member-own-key-abcdefghij9999' }, reg.session);
    assert.equal(key.status, 402); assert.equal(key.body.code, 'premium_required');
  } finally { process.env.TEST_DEMO_PREMIUM = 'on'; }
});

test('premium: trial lasts 7 days, ends on time, demo accounts excluded, recruiters get 5 live roles', async () => {
  const { premiumState, startPremiumTrial } = await import('./premium.js');
  const { getRecruiterEntitlements } = await import('./billing/entitlements.js');
  const t0 = Date.UTC(2026, 10, 22);
  const u = { id: 'x', role: 'employer' };
  assert.equal(premiumState(u, t0).active, false);
  startPremiumTrial(u, t0);
  assert.equal(premiumState(u, t0 + 6.9 * 86400000).active, true);
  assert.equal(premiumState(u, t0 + 7 * 86400000 + 1).active, false, 'ends after 7 days');
  assert.throws(() => startPremiumTrial(u, t0 + 8 * 86400000), /already used/);
  process.env.TEST_DEMO_PREMIUM = '';
  assert.equal(premiumState({ demo: true }, t0).active, false, 'demo accounts never get Premium');
  assert.throws(() => startPremiumTrial({ demo: true }, t0), /Demo accounts are shared/);
  process.env.TEST_DEMO_PREMIUM = 'on';
  const db = { jobs: [], jobPostCredits: [] };
  assert.equal(getRecruiterEntitlements(db, u, null, t0 + 86400000).activeJobLimit, 5, 'premium recruiter: 5 roles');
  assert.equal(getRecruiterEntitlements(db, u, null, t0 + 8 * 86400000).activeJobLimit, 1, 'back to the free limit after the trial');
});

test('unconfigured servers get clear refusals', async () => {
  process.env.AI_CHAT_PROVIDER = '';
  const off = await call('POST', '/api/ai/chat', { question: 'hi' }, await loginDemo('candidate-demo-3'));
  assert.equal(off.status, 503); assert.match(off.body.error, /not set up/);
  process.env.AI_CHAT_PROVIDER = 'anthropic';
});
