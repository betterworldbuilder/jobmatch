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
  const open = await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'open', role: 'ignored' } }, h);
  assert.equal(open.body.user.privacy.openToWork, true);
  assert.equal(open.body.user.jobStatus.role, undefined, 'open to work carries no role');
});

test('"pending signing" and "hired" name the role and recruiter, and only the member sees them', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Real Hired', email: `hi-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const id = reg.body.user.id; const h = { Cookie: reg.session };
  const signing = await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'signing', role: 'Lead AI Engineer', company: 'Acme', recruiter: 'David Chen', matchId: 'm-123' } }, h);
  assert.equal(signing.status, 200, JSON.stringify(signing.body));
  assert.deepEqual({ ...signing.body.user.jobStatus, updatedAt: 0 }, { kind: 'signing', role: 'Lead AI Engineer', company: 'Acme', recruiter: 'David Chen', matchId: 'm-123', updatedAt: 0 });
  const bad = await call('PATCH', `/api/users/${id}`, { jobStatus: { kind: 'hired', role: 'x'.repeat(200), matchId: '../../etc' } }, h);
  assert.equal(bad.body.user.jobStatus.role, undefined, 'over-long text dropped');
  assert.equal(bad.body.user.jobStatus.matchId, undefined, 'odd match ids dropped');
  const deck = await call('GET', '/api/bootstrap?userId=employer-demo');
  for (const candidate of deck.body.candidates) {
    for (const k of ['role', 'company', 'recruiter', 'matchId', 'updatedAt']) assert.equal(candidate.jobStatus?.[k], undefined, `recruiters never see the status ${k}`);
  }
  // Recruiters do see the status itself (demo Sofia: "I just got hired!").
  const sofia = deck.body.candidates.find((c) => c.id === 'candidate-demo');
  assert.deepEqual(sofia?.jobStatus, { kind: 'hired' }, 'status kind is visible to a recruiter she already matched');
});

test('"I just got hired!" takes a candidate out of recruiter search; matched teams keep her', async () => {
  // employer-demo-10 (generated crowd) never matched Sofia, who is hired in the demo seed.
  const other = await call('GET', '/api/bootstrap?userId=employer-demo-10');
  assert.equal(other.status, 200);
  assert.ok(!other.body.candidates.some((c) => c.id === 'candidate-demo'), 'hired candidate is not in an unmatched recruiter\'s search');
  assert.ok(other.body.candidates.length > 10, 'other candidates still there');
  const like = await call('POST', '/api/swipes', { actorId: 'employer-demo-10', targetType: 'candidate', targetId: 'candidate-demo', direction: 'like' });
  assert.equal(like.status, 409, 'cannot like a hired candidate');
  // Sarah matched Sofia: still sees her (and the conversation).
  const sarah = await call('GET', '/api/bootstrap?userId=employer-demo');
  assert.ok(sarah.body.candidates.some((c) => c.id === 'candidate-demo'));
  assert.ok(sarah.body.matches.some((m) => m.candidateId === 'candidate-demo'));
});
