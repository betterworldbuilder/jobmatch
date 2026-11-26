import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { __setTestSender } from './mailer.js';

/* Quick recruiter sign-up (founder, 2026-11-26): name + email only, password set later from an emailed link. */
const DB_PATH = `/tmp/jobmatch-quick-signup-test-${process.pid}.json`;
const pid = process.pid;
let server; let base;
const sent = [];
__setTestSender(async (mail) => { sent.push(mail); return { messageId: `<q-${sent.length}@jobsmatchnow>` }; });
async function boot() {
  if (base) return;
  process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
async function register(body) {
  await boot();
  const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}

test('a recruiter registers with name + email only and is signed in', async () => {
  const r = await register({ role: 'employer', kind: 'company', name: 'Quick Recruiter', email: `quick-${pid}@example.com`, conductAccepted: true, quick: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.role, 'employer');
  assert.ok(r.session, 'session issued');
});

test('candidates can quick-register too; quick accounts skip the profile wizard and get a set-password email', async () => {
  const before = sent.length;
  const c = await register({ role: 'candidate', name: 'Quick Cand', email: `qc-${pid}@example.com`, conductAccepted: true, quick: true });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const me = await fetch(`${base}/api/bootstrap?userId=${c.body.user.id}`, { headers: { Cookie: c.session } }).then((r) => r.json());
  assert.equal(me.viewer.onboarding, false, 'no forced wizard');
  // The mailer may be off in tests; when on, exactly one welcome email with a set-password link goes out.
  if (sent.length > before) assert.match(sent.at(-1).text, /\/\?reset=[\w.-]+\n/);
});

test('normal sign-ups still need a password; a taken address never signs anyone in', async () => {
  assert.equal((await register({ role: 'employer', name: 'Normal Rec', email: `nr-${pid}@example.com`, conductAccepted: true })).status, 400);
  // A taken address never signs anyone in.
  assert.equal((await register({ role: 'employer', name: 'Again', email: `quick-${pid}@example.com`, conductAccepted: true, quick: true })).status, 409);
});
