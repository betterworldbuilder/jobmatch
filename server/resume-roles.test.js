import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* My Resume (founder, 2026-11-26): 500 KB max; one resume on the free plan; one per target role with Premium
   (multi-role); resume vs role gap analysis only with Premium + a connected AI chatbot. */
const DB_PATH = `/tmp/jobmatch-resume-roles-test-${process.pid}.json`;
const pid = process.pid;
let server; let base;
async function boot() {
  if (base) return;
  process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.AI_PROVIDER;
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
async function call(method, path, body, cookie, headers = {}) {
  await boot();
  const raw = Buffer.isBuffer(body);
  const res = await fetch(`${base}${path}`, { method, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
// A tiny valid-looking PDF (bytes only matter for size/type checks here).
const pdf = (size) => { const b = Buffer.alloc(size, 0x20); Buffer.from('%PDF-1.4\n').copy(b); return b; };
const PDF = { 'Content-Type': 'application/pdf', 'X-Filename': 'cv.pdf' };

let me;
test('setup: a candidate with two target roles', async () => {
  const r = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Resume Tester', email: `resume-${pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(r.status, 201);
  me = { id: r.body.user.id, cookie: r.session };
  const p = await call('PATCH', `/api/users/${me.id}`, { preferences: { desiredRoles: ['Data Engineer', 'ML Engineer'] } }, me.cookie);
  assert.equal(p.status, 200, JSON.stringify(p.body));
});

test('resumes over 500 KB are refused with a clear message', async () => {
  const r = await call('POST', `/api/users/${me.id}/resume`, pdf(501 * 1024), me.cookie, PDF);
  assert.equal(r.status, 413); assert.match(r.body.error, /limit is 500 KB/);
});

test('free plan: one main resume; a resume for one role needs Premium multi-role; role must be a target role', async () => {
  const main = await call('POST', `/api/users/${me.id}/resume`, pdf(20 * 1024), me.cookie, PDF);
  assert.equal(main.status, 201, JSON.stringify(main.body));
  const role = await call('POST', `/api/users/${me.id}/resume?role=${encodeURIComponent('ML Engineer')}`, pdf(20 * 1024), me.cookie, PDF);
  assert.equal(role.status, 402); assert.equal(role.body.code, 'premium_required');
  const other = await call('POST', `/api/users/${me.id}/resume?role=${encodeURIComponent('Chef')}`, pdf(20 * 1024), me.cookie, PDF);
  assert.equal(other.status, 400);
});

test('gap analysis: Premium required, then a connected AI chatbot', async () => {
  const free = await call('POST', `/api/users/${me.id}/resume/gap`, { role: 'Data Engineer' }, me.cookie);
  assert.equal(free.status, 402); assert.equal(free.body.code, 'premium_required');
  const trial = await call('POST', '/api/premium/trial', { citizenship: 'Vietnam' }, me.cookie);
  assert.ok(trial.status < 300, JSON.stringify(trial.body));
  const noAi = await call('POST', `/api/users/${me.id}/resume/gap`, { role: 'Data Engineer' }, me.cookie);
  assert.equal(noAi.status, 503); assert.match(noAi.body.error, /Use My ChatBot/);
});

test('internal gap script (no AI): matched / missing skills, weighted score, concrete tips', async () => {
  await boot();
  const { resumeGapBasic } = await import('./index.js');
  const req = { jobs: 3, broad: false, list: [{ name: 'Python', count: 3 }, { name: 'SQL', count: 2 }, { name: 'Airflow', count: 1 }, { name: 'C++', count: 1 }] };
  const g = resumeGapBasic('Data engineer. 6 years building pipelines in Python and SQL for 2M users. linkedin.com/in/x', req);
  assert.deepEqual(g.matched, ['Python', 'SQL']); assert.deepEqual(g.missing, ['Airflow', 'C++']);
  assert.equal(g.score, 71, '5 of 7 weighted');
  assert.match(g.tips[0], /Airflow, C\+\+/);
  assert.ok(!g.tips.some((t) => /years of experience/.test(t)), 'years already stated');
  // The endpoint is free (no Premium) but owner-only; an unreadable file says so.
  const r = await call('POST', `/api/users/${me.id}/resume/gap-basic`, { role: 'Data Engineer' }, me.cookie);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.noText || typeof r.body.score !== 'undefined');
  assert.equal((await call('POST', `/api/users/${me.id}/resume/gap-basic`, { role: 'Data Engineer' })).status, 401);
});

test('Premium: one resume per target role, downloadable by its owner only, removable', async () => {
  const role = await call('POST', `/api/users/${me.id}/resume?role=${encodeURIComponent('ML Engineer')}`, pdf(30 * 1024), me.cookie, PDF);
  assert.equal(role.status, 201, JSON.stringify(role.body)); assert.equal(role.body.role, 'ML Engineer');
  const boot = await call('GET', `/api/bootstrap?userId=${me.id}`, null, me.cookie);
  assert.ok(boot.body.viewer.documents.roleResumes['ML Engineer'], 'role resume on the profile');
  const dl = await fetch(`${base}/api/users/${me.id}/resume/role?role=${encodeURIComponent('ML Engineer')}`, { headers: { Cookie: me.cookie } });
  assert.equal(dl.status, 200);
  assert.equal((await fetch(`${base}/api/users/${me.id}/resume/role?role=${encodeURIComponent('ML Engineer')}`)).status, 401, 'signed-out visitors cannot download (even in demo mode)');
  const other = await call('POST', '/api/auth/register', { role: 'employer', kind: 'company', name: 'Nosy Recruiter', email: `nosy-${pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal((await fetch(`${base}/api/users/${me.id}/resume/role?role=${encodeURIComponent('ML Engineer')}`, { headers: { Cookie: other.session } })).status, 403, 'another account cannot download');
  const del = await call('DELETE', `/api/users/${me.id}/resume/role?role=${encodeURIComponent('ML Engineer')}`, null, me.cookie);
  assert.equal(del.status, 200);
  const after2 = await call('GET', `/api/bootstrap?userId=${me.id}`, null, me.cookie);
  assert.equal(after2.body.viewer.documents.roleResumes['ML Engineer'], undefined);
});
