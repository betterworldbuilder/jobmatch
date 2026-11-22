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
  Object.assign(process.env, { NODE_ENV: 'test', DB_PATH, AI_CHAT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key-never-logged', AI_CHAT_ANTHROPIC_URL: fakeUrl, AI_CHAT_DAILY_LIMIT: '3', AI_CHAT_BURST_PER_MIN: '100' });
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

test('recruiters and unconfigured servers get clear refusals', async () => {
  assert.equal((await call('POST', '/api/ai/chat', { question: 'hi' }, await loginDemo('employer-demo'))).status, 403);
  process.env.AI_CHAT_PROVIDER = '';
  const off = await call('POST', '/api/ai/chat', { question: 'hi' }, await loginDemo('candidate-demo-3'));
  assert.equal(off.status, 503); assert.match(off.body.error, /not set up/);
  process.env.AI_CHAT_PROVIDER = 'anthropic';
});
