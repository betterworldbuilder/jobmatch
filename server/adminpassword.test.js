import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* Admin password login: promote (secret) → one-time setup link (secret) → set password → sign in. */
const DB_PATH = `/tmp/jobmatch-adminpw-test-${process.pid}.json`;
const SECRET = 'test-promote-secret';
let server; let base;
async function call(method, path, body, headers = {}) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH; process.env.ADMIN_PROMOTE_SECRET = SECRET;
    process.env.ANALYTICS_DIR = `/tmp/jobmatch-adminpw-analytics-${process.pid}`;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

test('admin password: needs the secret, one-time link, 12+ chars, then password sign-in works and reaches admin routes', async () => {
  const email = `admin-${process.pid}@example.com`;
  assert.equal((await call('POST', '/api/admin/bootstrap-admin', { email }, { 'x-admin-promote-secret': SECRET })).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { email, password: 'whatever-password' })).status, 403, 'no password yet');
  assert.equal((await call('POST', '/api/admin/password-link', { email })).status, 403, 'link needs the secret');
  const link = await call('POST', '/api/admin/password-link', { email }, { 'x-admin-promote-secret': SECRET });
  assert.equal(link.status, 200);
  const token = new URL(link.body.link).searchParams.get('admin-reset');
  assert.ok(token);
  assert.equal((await call('POST', '/api/admin/password-reset', { token, password: 'short' })).status, 400, '12+ characters');
  assert.equal((await call('POST', '/api/admin/password-reset', { token, password: 'a-strong-admin-pass' })).status, 200);
  assert.equal((await call('POST', '/api/admin/password-reset', { token, password: 'another-strong-pass' })).status, 400, 'link works once');
  assert.equal((await call('POST', '/api/auth/login', { email, password: 'wrong-password-xx' })).status, 401);
  const ok = await call('POST', '/api/auth/login', { email, password: 'a-strong-admin-pass' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'admin');
  assert.equal((await call('GET', '/api/admin/kpis', undefined, { Cookie: ok.session })).status, 200, 'admin routes open');
  adminCookie = ok.session;
});

let adminCookie = '';
test('traffic: visits from a signed-in admin are never counted; other visits are (founder, 2026-11-24)', async () => {
  assert.ok(adminCookie, 'admin signed in by the previous test');
  const visit = (sid, headers = {}) => fetch(`${base}/api/track`, { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Mobile', ...headers }, body: JSON.stringify({ sid, src: '', w: 390, events: [{ t: 'view', path: '/' }] }) });
  const report = async () => (await call('GET', '/api/admin/web-analytics?days=1', undefined, { Cookie: adminCookie })).body;
  const before = (await report()).totals;
  assert.equal((await visit('adminvisit01', { Cookie: adminCookie })).status, 204);
  const afterAdmin = (await report()).totals;
  assert.deepEqual(afterAdmin, before, 'the admin visit left no trace');
  assert.equal((await visit('realvisit001')).status, 204);
  const afterReal = (await report()).totals;
  assert.ok(afterReal.visits > before.visits, `a real visit is counted (${before.visits} → ${afterReal.visits})`);
});
