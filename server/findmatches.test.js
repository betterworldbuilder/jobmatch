import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* "Find your Matches" server parts: the first-impression note on a Super Like,
 * and photo verification (selfie upload, admin-only review). Same dynamic-import
 * pattern as analytics.test.js, with its own scratch store. */

const DB_PATH = `/tmp/jobmatch-findmatches-test-${process.pid}.json`;
let server;
let base;

async function listening() {
  if (base) return base;
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = DB_PATH;
  delete process.env.ANTHROPIC_API_KEY;
  const { app } = await import('./index.js');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

async function call(method, path, body, cookie, raw) {
  const response = await fetch(`${await listening()}${path}`, {
    method,
    headers: { 'Content-Type': raw ? 'image/png' : 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const session = (response.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0];
  return { status: response.status, body: await response.json().catch(() => ({})), session };
}

async function registerReal(tag) {
  const result = await call('POST', '/api/auth/register', { role: 'candidate', name: `Real ${tag}`, email: `${tag}-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const real = { id: result.body.user.id, cookie: result.session };
  const saved = await call('PATCH', `/api/users/${real.id}`, { skillsDetail: [{ name: 'React', level: 3 }], title: 'Frontend Engineer' }, real.cookie);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  // A real recruiter role that already likes this candidate (real accounts never see demo/starter cards).
  const rec = await call('POST', '/api/auth/register', { role: 'employer', kind: 'company', name: `Recruiter ${tag}`, email: `${tag}-rec-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(rec.status, 201, JSON.stringify(rec.body));
  const job = await call('POST', '/api/jobs', { employerId: rec.body.user.id, postSource: 'quick_post', status: 'active', type: 'Full-time', title: 'Frontend Engineer', company: 'Partner Co', location: 'Remote', workMode: 'Remote', salaryRange: { min: 40000, max: 60000, currency: 'USD' }, requiredSkillsDetail: [{ name: 'React', weight: 3 }], description: 'React role.' }, rec.session);
  assert.equal(job.status, 201, JSON.stringify(job.body));
  real.jobId = job.body.job.id;
  assert.equal((await call('POST', '/api/swipes', { actorId: rec.body.user.id, targetType: 'candidate', targetId: real.id, jobId: real.jobId, direction: 'like' }, rec.session)).status, 201);
  return real;
}

after(() => {
  server?.close();
  try { unlinkSync(DB_PATH); } catch { /* already gone */ }
});

test('a Super Like note becomes the first message only once both sides match', async () => {
  const real = await registerReal('note');
  const like = await call('POST', '/api/swipes', { actorId: real.id, targetType: 'job', targetId: real.jobId, direction: 'like', superLike: true, note: '  Shipped two React apps like yours. Happy to talk!  ' }, real.cookie);
  assert.equal(like.status, 201, JSON.stringify(like.body));
  assert.ok(like.body.match, 'mutual like makes a match');
  const boot = await call('GET', `/api/bootstrap?userId=${real.id}`, undefined, real.cookie);
  const thread = boot.body.messages.filter((m) => m.matchId === like.body.match.id);
  assert.equal(thread.length, 1);
  assert.equal(thread[0].text, 'Shipped two React apps like yours. Happy to talk!');
  assert.equal(thread[0].senderId, real.id);
  assert.equal(thread[0].firstImpression, true);

  // Undo removes the match and the note message with it.
  assert.equal((await call('POST', '/api/swipes/undo', { actorId: real.id }, real.cookie)).status, 200);
  const after = await call('GET', `/api/bootstrap?userId=${real.id}`, undefined, real.cookie);
  assert.equal(after.body.messages.some((m) => m.matchId === like.body.match.id), false);
});

test('a note without a Super Like is ignored, and long notes are refused', async () => {
  const real = await registerReal('plain');
  const like = await call('POST', '/api/swipes', { actorId: real.id, targetType: 'job', targetId: real.jobId, direction: 'like', note: 'Hello' }, real.cookie);
  assert.equal(like.status, 201);
  const boot = await call('GET', `/api/bootstrap?userId=${real.id}`, undefined, real.cookie);
  assert.equal(boot.body.messages.filter((m) => m.matchId === like.body.match?.id).length, 0);
  const real2 = await registerReal('long');
  const tooLong = await call('POST', '/api/swipes', { actorId: real2.id, targetType: 'job', targetId: real2.jobId, direction: 'like', superLike: true, note: 'x'.repeat(281) }, real2.cookie);
  assert.equal(tooLong.status, 400);
});

test('deleting an account removes its uploaded files and the private notes about it (Privacy Policy, 2026-11-24)', async () => {
  const real = await registerReal('erase');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
  const root = process.env.UPLOADS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads');
  assert.equal((await call('POST', `/api/users/${real.id}/verification-selfie`, undefined, real.cookie, png)).status, 201);
  assert.equal((await call('POST', `/api/users/${real.id}/photo`, undefined, real.cookie, png)).status, 201);
  const selfie = path.join(root, 'verification', `${real.id}.png`);
  const photo = path.join(root, 'photos', `${real.id}.png`);
  assert.ok(existsSync(selfie) && existsSync(photo), 'files are on disk before deletion');
  // Someone else's private note about this person.
  const other = await registerReal('erase-noter');
  assert.equal((await call('POST', '/api/notes', { userId: other.id, targetId: real.id, targetType: 'candidate', text: 'Strong React' }, other.cookie)).status, 200);
  const del = await call('DELETE', '/api/me', undefined, real.cookie);
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.ok(del.body.filesRemoved >= 2, `files removed: ${del.body.filesRemoved}`);
  assert.equal(existsSync(selfie), false, 'selfie deleted');
  assert.equal(existsSync(photo), false, 'photo deleted');
  const stored = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  assert.equal((stored.notes || []).some((n) => n.targetId === real.id), false, 'notes about the deleted person are gone');
  assert.equal(stored.users.some((u) => u.id === real.id), false, 'account gone');
});

test('verification: a member sends a selfie (pending, no badge yet); review is admin-only', async () => {
  const real = await registerReal('verify');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
  const anon = await call('POST', `/api/users/${real.id}/verification-selfie`, undefined, undefined, png);
  assert.ok(anon.status === 401 || anon.status === 403, `anonymous upload refused (${anon.status})`);
  const selfieFile = path.join(process.env.UPLOADS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads'), 'verification', `${real.id}.png`);
  assert.equal(existsSync(selfieFile), false, 'a refused upload writes nothing to disk');
  const sent = await call('POST', `/api/users/${real.id}/verification-selfie`, undefined, real.cookie, png);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.verification.status, 'pending');
  const boot = await call('GET', `/api/bootstrap?userId=${real.id}`, undefined, real.cookie);
  assert.equal(boot.body.viewer.verification.status, 'pending');
  assert.notEqual(boot.body.viewer.photoVerified, true, 'no badge before an admin approves');
  assert.equal(existsSync(selfieFile), true);
  // Another member never sees the review record.
  const other = await registerReal('viewer');
  const seen = await call('GET', `/api/bootstrap?userId=${other.id}`, undefined, other.cookie);
  const leaked = JSON.stringify(seen.body).includes('"verification"');
  assert.equal(leaked, false, 'verification is not in other members\' views');
  for (const [method, path] of [['GET', '/api/admin/verifications'], ['GET', `/api/admin/verifications/${real.id}/selfie`], ['POST', `/api/admin/verifications/${real.id}/approve`]]) {
    const res = await call(method, path, method === 'POST' ? {} : undefined, real.cookie);
    assert.ok(res.status === 401 || res.status === 403, `${method} ${path} is admin-only (${res.status})`);
  }
});
