import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';

/* Demo accounts (founder, 2026-11-22): exactly 1 match per 3 likes, for job seekers and recruiters. Passes never count;
 * the count restarts after every match; liking someone who already liked you matches at once. Real users untouched. */
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
async function login(userId) { const r = await call('POST', '/api/auth/login', { userId }); assert.ok(r.body.user, JSON.stringify(r.body)); return { ck: r.session, me: r.body.user.id }; }
const db = () => JSON.parse(readFileSync(DB_PATH, 'utf8'));

test('demo job seeker: 9 likes on roles that never liked them = exactly 3 matches, on likes 3, 6 and 9; passes do not count', async () => {
  const { ck, me } = await login('candidate-demo-3');
  const d = db();
  const likedMe = new Set(d.swipes.filter((s) => s.targetType === 'candidate' && s.targetId === me && s.direction === 'like').map((s) => s.actorId));
  const mySwiped = new Set(d.swipes.filter((s) => s.actorId === me).map((s) => s.targetId));
  const fresh = d.jobs.filter((j) => j.demo && String(j.status).toLowerCase() === 'active' && !likedMe.has(j.employerId) && !mySwiped.has(j.id));
  assert.ok(fresh.length >= 11, `${fresh.length} fresh demo roles`);
  // Likes this demo user already made since their last match (the count continues from there).
  const lastMatchAt = d.matches.reduce((t, m) => (m.candidateId === me && m.createdAt > t ? m.createdAt : t), 0);
  const k = d.swipes.filter((s) => s.actorId === me && s.direction === 'like' && (s.createdAt || 0) > lastMatchAt).length;
  // Two passes first: they must not count toward the 3.
  for (const j of fresh.slice(0, 2)) assert.equal((await call('POST', '/api/swipes', { actorId: me, targetId: j.id, targetType: 'job', direction: 'pass' }, ck)).status, 201);
  const pattern = [];
  for (const j of fresh.slice(2, 11)) { const r = (await call('POST', '/api/swipes', { actorId: me, targetId: j.id, targetType: 'job', direction: 'like' }, ck)).body; assert.ok(r.swipe, JSON.stringify(r)); pattern.push(r.match ? 'M' : '-'); }
  const at = pattern.map((p, i) => (p === 'M' ? i : -1)).filter((i) => i >= 0);
  assert.equal(at.length, 3, `pattern ${pattern.join('')}`);
  assert.deepEqual([at[1] - at[0], at[2] - at[1]], [3, 3], `every 3rd like: ${pattern.join('')}`);
  assert.equal(at[0], Math.max(0, 2 - k), `first match on the 3rd like since the last match (passes not counted; ${k} earlier likes)`);
});

test('demo recruiter: 9 likes on candidates who never liked their roles = exactly 3 matches, on likes 3, 6 and 9', async () => {
  const { ck, me } = await login('employer-demo-8');
  const d = db();
  const myJobs = new Set(d.jobs.filter((j) => j.employerId === me).map((j) => j.id));
  assert.ok([...myJobs].length, 'recruiter has roles');
  const likedMyJobs = new Set(d.swipes.filter((s) => s.targetType === 'job' && myJobs.has(s.targetId) && s.direction === 'like').map((s) => s.actorId));
  const mySwiped = new Set(d.swipes.filter((s) => s.actorId === me).map((s) => s.targetId));
  const matched = new Set(d.matches.filter((m) => m.employerId === me).map((m) => m.candidateId));
  const fresh = d.users.filter((u) => u.role === 'candidate' && u.demo === true && !u.sample && !likedMyJobs.has(u.id) && !mySwiped.has(u.id) && !matched.has(u.id) && !(u.jobStatus?.kind === 'hired'));
  assert.ok(fresh.length >= 9, `${fresh.length} fresh demo candidates`);
  const pattern = [];
  for (const c of fresh.slice(0, 9)) { const r = (await call('POST', '/api/swipes', { actorId: me, targetId: c.id, targetType: 'candidate', direction: 'like' }, ck)).body; assert.ok(r.swipe, JSON.stringify(r)); pattern.push(r.match ? 'M' : '-'); }
  // Exactly 3 matches in 9 likes, always 3 likes apart (the count continues from the likes made since the last match).
  const at = pattern.map((p, i) => (p === 'M' ? i : -1)).filter((i) => i >= 0);
  assert.equal(at.length, 3, `pattern ${pattern.join('')}`);
  assert.deepEqual([at[1] - at[0], at[2] - at[1]], [3, 3], `pattern ${pattern.join('')}`);
});

test('demo: a recruiter who already PASSED on the job seeker does not block the 3rd-like match', async () => {
  const { ck, me } = await login('candidate-demo-4');
  const d = db();
  const likedMe = new Set(d.swipes.filter((s) => s.targetType === 'candidate' && s.targetId === me && s.direction === 'like').map((s) => s.actorId));
  const mySwiped = new Set(d.swipes.filter((s) => s.actorId === me).map((s) => s.targetId));
  const loginable = new Set(d.users.filter((u) => /^employer-demo-\d+$/.test(u.id)).map((u) => u.id));
  const fresh = d.jobs.filter((j) => j.demo && String(j.status).toLowerCase() === 'active' && loginable.has(j.employerId) && !likedMe.has(j.employerId) && !mySwiped.has(j.id));
  assert.ok(fresh.length >= 3, `${fresh.length} fresh roles`);
  const lastMatchAt = d.matches.reduce((t, m) => (m.candidateId === me && m.createdAt > t ? m.createdAt : t), 0);
  const k = d.swipes.filter((s) => s.actorId === me && s.direction === 'like' && (s.createdAt || 0) > lastMatchAt).length;
  const roles = fresh.slice(0, Math.max(1, 3 - k));
  for (const emp of new Set(roles.map((j) => j.employerId))) {
    const e = await login(emp);
    const r = await call('POST', '/api/swipes', { actorId: e.me, targetId: me, targetType: 'candidate', direction: 'pass' }, e.ck);
    assert.ok([201, 200].includes(r.status), JSON.stringify(r.body));
  }
  let last = null;
  for (const j of roles) last = (await call('POST', '/api/swipes', { actorId: me, targetId: j.id, targetType: 'job', direction: 'like' }, ck)).body;
  assert.ok(last.match, `3rd like since the last match matches even after a pass (${k} earlier likes)`);
});

test('demo: liking someone who already liked you matches at once and restarts the count', async () => {
  const { ck, me } = await login('candidate-demo-2');
  const d = db();
  const likedMeJobs = d.swipes.filter((s) => s.targetType === 'candidate' && s.targetId === me && s.direction === 'like' && s.jobId)
    .map((s) => s.jobId).filter((id) => !d.swipes.some((x) => x.actorId === me && x.targetId === id) && !d.matches.some((m) => m.candidateId === me && m.jobId === id));
  if (!likedMeJobs.length) return; // no pending like for this demo user in this dataset
  const r = (await call('POST', '/api/swipes', { actorId: me, targetId: likedMeJobs[0], targetType: 'job', direction: 'like' }, ck)).body;
  assert.ok(r.match, 'mutual like matches immediately');
});

test('real accounts never get automatic like-backs', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Real Person', email: `real-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const boot = (await call('GET', `/api/bootstrap?userId=${encodeURIComponent(reg.body.user.id)}`, undefined, reg.session)).body;
  let matches = 0;
  for (const j of boot.jobs.slice(0, 6)) { const r = (await call('POST', '/api/swipes', { actorId: boot.viewer.id, targetId: j.id, targetType: 'job', direction: 'like' }, reg.session)).body; if (r.match) matches += 1; }
  assert.equal(matches, 0, 'no auto matches for real users');
});
