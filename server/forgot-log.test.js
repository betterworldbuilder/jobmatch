import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* "I never got the reset email" (founder, 2026-11-25): every reset request leaves one log line with the outcome,
   never the address or the link, and the answer to the browser stays the same whatever the outcome. */
const DB_PATH = `/tmp/jobmatch-forgot-test-${process.pid}.json`;
let server; let base;
async function call(method, path, body) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    delete process.env.SMTP_HOST; delete process.env.SMTP_USER;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

async function forgotLog(email) {
  const lines = []; const orig = console.log;
  console.log = (...a) => { lines.push(a.join(' ')); };
  try {
    const r = await call('POST', '/api/auth/forgot', { email });
    return { r, forgot: lines.filter((l) => l.startsWith('[forgot]')), all: lines };
  } finally { console.log = orig; }
}

test('reset request: one outcome line per request, no address or link in it, same answer for every case', async () => {
  const member = `forgot-member-${process.pid}@example.com`;
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Forgot Member', email: member, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));

  const a = await forgotLog(member.toUpperCase());
  assert.deepEqual(a.forgot, ['[forgot] not sent (mailer off)']);

  const b = await forgotLog(`nobody-${process.pid}@example.com`);
  assert.deepEqual(b.forgot, ['[forgot] no account with this address']);

  assert.equal(a.r.body.account, true, 'member account found');
  assert.equal(b.r.body.account, false, 'unknown address: no account');
  for (const x of [a, b]) {
    assert.equal(x.r.status, 200);
    assert.deepEqual(Object.keys(x.r.body).sort(), ['account', 'mailer', 'ok']);
    assert.ok(x.forgot.every((l) => !l.includes('@') && !l.includes('reset=')), 'no address or link in the outcome line');
  }
});
