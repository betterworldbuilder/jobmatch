import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* Demo accounts (founder, 2026-11-22): about 1 in 3 likes becomes a match — every 3rd like on a demo profile/role is
 * liked back by the demo counterpart. Real users never get automatic like-backs. */
const DB_PATH = `/tmp/jobmatch-demorate-test-${process.pid}.json`;
let server; let base;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', DB_PATH, DEMO_MATCH_EVERY: '3' });
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

async function call(method, path, body, cookie) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
const login = async (userId) => (await call('POST', '/api/auth/login', { userId })).session;

test('demo job seeker: every 3rd fresh like on a demo role becomes a match', async () => {
  const loginRes = await call('POST', '/api/auth/login', { userId: 'candidate-demo-3' });
  assert.ok(loginRes.body.user, JSON.stringify(loginRes.body));
  const ck = loginRes.session; const me = loginRes.body.user.id;
  const boot = (await call('GET', `/api/bootstrap?userId=${encodeURIComponent(me)}`, undefined, ck)).body;
  assert.equal(boot.viewer.demo, true);
  const matched = new Set(boot.matches.map((m) => m.jobId));
  // Roles nobody on the other side has liked yet, so any match comes from the 1-in-3 rule.
  const fresh = boot.jobs.filter((j) => j.demo && !matched.has(j.id) && !j.likedYou).slice(0, 6);
  assert.ok(fresh.length >= 6, `${fresh.length} fresh demo roles`);
  const before = boot.matches.length;
  const results = [];
  for (const j of fresh) results.push((await call('POST', '/api/swipes', { actorId: me, targetId: j.id, targetType: 'job', direction: 'like' }, ck)).body);
  assert.ok(results.every((r) => r.swipe), JSON.stringify(results.find((r) => !r.swipe)));
  const created = results.filter((r) => r.match).length;
  // At least every 3rd like matches (2 of 6); natural matches (a recruiter who already liked you) come on top.
  assert.ok(created >= 2, `${created} matches from 6 likes (at least 1 in 3)`);
  const afterBoot = (await call('GET', `/api/bootstrap?userId=${encodeURIComponent(me)}`, undefined, ck)).body;
  assert.equal(afterBoot.matches.length, before + created);
});

test('demo recruiter: every 3rd fresh like on a demo candidate becomes a match', async () => {
  const ck = await login('employer-demo');
  const boot = (await call('GET', '/api/bootstrap?userId=employer-demo', undefined, ck)).body;
  const matchedIds = new Set(boot.matches.map((m) => m.candidateId));
  const fresh = boot.candidates.filter((c) => c.demo && !matchedIds.has(c.id) && !c.likedYou).slice(0, 6);
  assert.ok(fresh.length >= 3, `${fresh.length} fresh demo candidates`);
  const results = [];
  for (const c of fresh) results.push((await call('POST', '/api/swipes', { actorId: 'employer-demo', targetId: c.id, targetType: 'candidate', direction: 'like' }, ck)).body);
  assert.ok(results.filter((r) => r.match).length >= 1, 'at least one match in a run of likes');
});

test('real accounts never get automatic like-backs', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Real Person', email: `real-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const boot = (await call('GET', `/api/bootstrap?userId=${encodeURIComponent(reg.body.user.id)}`, undefined, reg.session)).body;
  const me = boot.viewer.id;
  let matches = 0;
  for (const j of boot.jobs.slice(0, 6)) { const r = (await call('POST', '/api/swipes', { actorId: me, targetId: j.id, targetType: 'job', direction: 'like' }, reg.session)).body; if (r.match) matches += 1; }
  assert.equal(matches, 0, 'no auto matches for real users');
});
