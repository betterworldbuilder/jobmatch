import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';

/* In-app Feedback form: suggestions stored privately with area/importance/sender; admin-only list. */
const DB_PATH = `/tmp/jobmatch-suggest-test-${process.pid}.json`;
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

test('a signed-in member sends a suggestion; it is stored unpublished with area, importance and consent; list is admin-only', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Real Feedback', email: `fb-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const sent = await call('POST', '/api/feedback', { type: 'suggestion', message: 'Please add reminders before interviews.', area: 'Hiring Stages', importance: 'important', contactOk: true }, { Cookie: reg.session });
  assert.equal(sent.status, 201);
  const entry = JSON.parse(readFileSync(DB_PATH, 'utf8')).feedback.find((f) => f.message === 'Please add reminders before interviews.');
  assert.deepEqual([entry.type, entry.area, entry.importance, entry.contactOk, entry.approved, entry.fromUserId], ['suggestion', 'Hiring Stages', 'important', true, false, reg.body.user.id]);
  const pub = await call('GET', '/api/feedback');
  assert.ok(!JSON.stringify(pub.body).includes('reminders before interviews'), 'suggestions are never public');
  const list = await call('GET', '/api/admin/suggestions', undefined, { Cookie: reg.session });
  assert.ok(list.status === 401 || list.status === 403, 'admin only');
});
