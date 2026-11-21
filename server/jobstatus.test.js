import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* Job status under the profile: open / waiting / hired / under contract until a date. */
const DB_PATH = `/tmp/jobmatch-jobstatus-test-${process.pid}.json`;
let server; let base;
async function call(method, path, body, headers = {}) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

test('job status saves, keeps openToWork in sync, and needs an end date for "under contract"', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Real Status', email: `st-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const id = reg.body.user.id; const h = { Cookie: reg.session };
  const hired = await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'hired' } }, h);
  assert.equal(hired.status, 200, JSON.stringify(hired.body));
  assert.equal(hired.body.user.jobStatus.kind, 'hired');
  assert.equal(hired.body.user.privacy.openToWork, false);
  assert.equal((await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'contract' } }, h)).status, 400, 'end date required');
  const contract = await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'contract', until: '2027-03-31' } }, h);
  assert.equal(contract.body.user.jobStatus.until, '2027-03-31');
  assert.equal((await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'retired' } }, h)).status, 400);
  const open = await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'open' } }, h);
  assert.equal(open.body.user.privacy.openToWork, true);
});
