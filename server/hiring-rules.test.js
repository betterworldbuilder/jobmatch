import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* Recruitment process rules: candidate hired → close others + cancel meetings + thank-yous;
   recruiter hires → role filled + thank-yous to the others; recruiter stops → reason + feedback required. */
const DB_PATH = `/tmp/jobmatch-hiring-rules-test-${process.pid}.json`;
let server; let base;
async function call(method, path, body, cookie) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
const boot = async (id) => (await call('GET', `/api/bootstrap?userId=${id}`)).body;
const DAY = 86400000;

test('rule 1: a candidate who gets hired closes the other processes, cancels meetings, thanks each recruiter', async () => {
  // c-1 (David Nguyen) has several demo matches. Give two of them an upcoming meeting.
  const before = await boot('c-1');
  const open = before.matches.filter((m) => m.stage !== 'Hired' && m.stage !== 'Archived');
  assert.ok(open.length >= 3, `c-1 has open processes: ${open.length}`);
  const [keep, ...others] = open;
  for (const m of others.slice(0, 2)) assert.equal((await call('POST', '/api/calls', { matchId: m.id, createdBy: 'c-1', title: 'Rule test call', startAt: Date.now() + 3 * DAY, durationMinutes: 30 })).status, 201);
  const res = await call('PATCH', '/api/users/c-1', { jobStatus: { kind: 'hired', matchId: keep.id, role: keep.job?.title } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.effects.closed, others.length, 'every other open process closed');
  assert.ok(res.body.effects.meetingsCancelled >= 2, 'their upcoming meetings cancelled');
  const after = await boot('c-1');
  assert.equal(after.matches.find((m) => m.id === keep.id).stage, 'Hired', 'the hiring match is marked Hired');
  for (const m of others) {
    const now = after.matches.find((x) => x.id === m.id);
    assert.equal(now.stage, 'Archived'); assert.equal(now.closedReason, 'candidate_hired');
    const thanks = after.messages.filter((x) => x.matchId === m.id && x.auto && x.senderId === 'c-1');
    assert.equal(thanks.length, 1, 'one automatic thank-you per recruiter');
    assert.match(thanks[0].text, /thank you for your time/i);
  }
  assert.ok(after.calls.filter((c) => c.title === 'Rule test call').every((c) => c.cancelledAt), 'meetings cancelled');
  // Saving "hired" again does not send the messages twice.
  const again = await call('PATCH', '/api/users/c-1', { jobStatus: { kind: 'hired', matchId: keep.id } });
  assert.equal(again.body.effects, undefined);
});

test('rule 2: a recruiter who hires fills the role and thanks every other candidate in it', async () => {
  // Pick a demo crowd job with at least 2 open matches.
  const seedJob = (await boot('employer-demo-12')).matches.reduce((acc, m) => { (acc[m.jobId] ||= []).push(m); return acc; }, {});
  const [jobId, ms] = Object.entries(seedJob).find(([, list]) => list.filter((m) => m.stage !== 'Archived' && m.stage !== 'Hired').length >= 2) || [];
  assert.ok(jobId, 'a role with 2+ open candidates');
  const [hired, ...rest] = ms.filter((m) => m.stage !== 'Archived' && m.stage !== 'Hired');
  const res = await call('PATCH', `/api/matches/${hired.id}`, { stage: 'Hired' });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.stage, 'Hired');
  assert.equal(res.body.effects.closed, rest.length);
  const after = await boot('employer-demo-12');
  assert.equal(after.jobs.find((j) => j.id === jobId)?.status ?? 'filled', 'filled', 'role marked filled');
  for (const m of rest) {
    const now = after.matches.find((x) => x.id === m.id);
    assert.equal(now.closedReason, 'role_filled');
    const msg = after.messages.find((x) => x.matchId === m.id && x.auto);
    assert.match(msg.text, /filled this role/); assert.match(msg.text, /recommend your profile/);
  }
});

test('rule 3: a recruiter cannot stop a process without a reason and honest feedback; the candidate gets it', async () => {
  const b = await boot('employer-demo-15');
  const m = b.matches.find((x) => x.stage !== 'Archived' && x.stage !== 'Hired');
  assert.ok(m, 'an open match');
  assert.equal((await call('PATCH', `/api/matches/${m.id}`, { stage: 'Archived' })).status, 400, 'no reason → refused');
  assert.equal((await call('PATCH', `/api/matches/${m.id}`, { stage: 'Archived', closeCategory: 'Skills gap', closeFeedback: 'Not a fit.' })).status, 400, 'too short → refused');
  const fb = 'Strong React work, but the role needs 3+ years of Go in production, which we did not see yet.';
  const ok = await call('PATCH', `/api/matches/${m.id}`, { stage: 'Archived', closeCategory: 'Skills gap', closeFeedback: fb });
  assert.equal(ok.status, 200, ok.text);
  const cand = await boot(m.candidateId);
  const now = cand.matches.find((x) => x.id === m.id);
  assert.equal(now.closedReason, 'stopped_by_recruiter');
  assert.ok(now.feedback.some((f) => f.text.includes(fb)), 'feedback stored on the match');
  assert.ok(cand.messages.some((x) => x.matchId === m.id && x.auto && x.text.includes(fb)), 'candidate receives it in the conversation');
});
