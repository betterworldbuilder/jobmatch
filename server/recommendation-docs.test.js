import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* Recommendation letters (PDF / Word / image) + "My super power": uploads are typed from the bytes, open only
   for the owner and matched recruiters, and can be removed. */
const DB_PATH = `/tmp/jobmatch-recdocs-test-${process.pid}.json`;
let server; let base;
async function boot() {
  if (base) return;
  process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function call(method, path, body, cookie, headers = {}) {
  await boot();
  const raw = Buffer.isBuffer(body);
  const res = await fetch(`${base}${path}`, { method, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: raw ? body : body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = {}; try { json = JSON.parse(buf.toString()); } catch { /* binary */ }
  return { status: res.status, body: json, buf, type: res.headers.get('content-type') || '', session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('letters: typed from the bytes, owner and matched recruiters only, removable; super power saves', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Letter Owner', email: `rec-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const id = reg.body.user.id; const ck = reg.session;
  // A script pretending to be a PDF is refused.
  assert.equal((await call('POST', `/api/users/${id}/recommendation-docs`, Buffer.from('<script>alert(1)</script>'), ck, { 'Content-Type': 'application/pdf' })).status, 415);
  const up = await call('POST', `/api/users/${id}/recommendation-docs`, PDF, ck, { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent('Letter from Anna.pdf') });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.doc.ext, 'pdf'); assert.equal(up.body.doc.originalName, 'Letter from Anna.pdf');
  assert.equal((await call('POST', `/api/users/${id}/recommendation-docs`, PNG, ck, { 'Content-Type': 'image/png' })).body.doc.ext, 'png');
  // Owner opens it inline as a PDF.
  const own = await call('GET', up.body.doc.url, undefined, ck);
  assert.equal(own.status, 200); assert.match(own.type, /application\/pdf/); assert.ok(own.buf.subarray(0, 4).toString() === '%PDF');
  // A stranger (another real account, no match) cannot.
  const other = await call('POST', '/api/auth/register', { role: 'employer', name: 'Stranger', email: `stranger-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal((await call('GET', up.body.doc.url, undefined, other.session)).status, 403);
  assert.equal((await call('GET', up.body.doc.url)).status, 403, 'signed out');
  // Remove it.
  assert.equal((await call('DELETE', up.body.doc.url, undefined, ck)).status, 200);
  assert.equal((await call('GET', up.body.doc.url, undefined, ck)).status, 404);
  // Super power: saved, trimmed to 300, '' clears.
  const sp = await call('PATCH', `/api/users/${id}`, { superPower: '  I can code blindfolded.  ' }, ck);
  assert.equal(sp.body.user.superPower, 'I can code blindfolded.');
  assert.equal((await call('PATCH', `/api/users/${id}`, { superPower: '' }, ck)).body.user.superPower, undefined);
});

test('demo candidates have a super power and certifications', async () => {
  const b = await call('GET', '/api/bootstrap?userId=employer-demo');
  const demo = b.body.candidates.filter((c) => c.demo);
  assert.ok(demo.length > 5);
  assert.ok(demo.every((c) => c.superPower && c.certifications?.length), 'every demo candidate filled');
});
