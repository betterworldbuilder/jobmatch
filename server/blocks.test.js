import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* Block user (founder, 2026-11-23): a block hides both people from each other and stops messages; demo accounts
 * (shared by every visitor) cannot block; unblock restores. */
const DB_PATH = `/tmp/jobmatch-blocks-test-${process.pid}.json`;
let server; let base;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', DB_PATH });
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

async function call(method, path, body, cookie) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
async function register(role, name) {
  const email = `${name.toLowerCase()}-${process.pid}@example.com`;
  const r = await call('POST', '/api/auth/register', { role, name, email, password: 'a-strong-pass-123', conductAccepted: true, ...(role === 'employer' ? { kind: 'company' } : {}) });
  assert.ok(r.body.user, JSON.stringify(r.body));
  return { ck: r.session, id: r.body.user.id };
}

test('block hides both people from each other, lists the block, unblock restores; demo accounts cannot block', async () => {
  const cand = await register('candidate', 'Blockcand');
  const emp = await register('employer', 'Blockemp');
  const seesCand = async () => (await call('GET', `/api/bootstrap?userId=${emp.id}`, undefined, emp.ck)).body.candidates?.some((c) => c.id === cand.id);
  const before = await seesCand();
  assert.equal(before, true, 'the employer sees the new real candidate before any block');

  assert.equal((await call('POST', '/api/blocks', { userId: emp.id }, cand.ck)).status, 201);
  assert.equal(await seesCand(), false, 'the blocked side no longer sees the blocker');
  const list = await call('GET', '/api/blocks', undefined, cand.ck);
  assert.deepEqual(list.body.blocked.map((b) => b.userId), [emp.id]);
  assert.equal((await call('POST', '/api/blocks', { userId: cand.id }, cand.ck)).status, 400, 'no self-block');

  assert.equal((await call('DELETE', `/api/blocks/${emp.id}`, undefined, cand.ck)).status, 200);
  assert.equal(await seesCand(), before, 'unblock restores what was visible before');
  assert.equal((await call('GET', '/api/blocks', undefined, cand.ck)).body.blocked.length, 0);

  const demo = await call('POST', '/api/auth/login', { userId: 'candidate-demo' });
  const r = await call('POST', '/api/blocks', { userId: 'employer-demo' }, demo.session);
  assert.equal(r.status, 403, 'demo accounts are shared, so they cannot block');
  assert.equal((await call('POST', '/api/blocks', { userId: emp.id })).status, 401, 'sign-in required');
});
