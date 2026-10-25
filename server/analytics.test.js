import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { actorSide, involvesDemo, isoWeek, track, TRACKED_EVENTS, untrack, weeklyCounts } from './analytics.js';

/* Funnel analytics: unit tests for the counter helper, then route tests that
 * drive real HTTP requests and read the scratch JSON store back to check the
 * persisted weekly counters. Same dynamic-import pattern as routes.test.js. */

test('track bumps a bounded (week, name, demo, dim) counter; untrack retracts it', () => {
  const db = {};
  const at = Date.UTC(2026, 9, 21);
  const a = track(db, 'swipe', { dim: 'like/candidate', at });
  track(db, 'swipe', { dim: 'like/candidate', at });
  track(db, 'swipe', { dim: 'like/candidate', at, demo: true });
  assert.equal(db.eventCounts.length, 2, 'one row per (week, name, demo, dim), not per event');
  assert.equal(db.eventCounts.find((row) => !row.demo).count, 2);
  untrack(db, a);
  assert.equal(db.eventCounts.find((row) => !row.demo).count, 1);
  untrack(db, undefined); // records that were never counted are a no-op
  untrack(db, { name: 'swipe', demo: false, dim: 'never-seen', at });
  assert.equal(db.eventCounts.length, 2, 'retracting an unknown bucket never creates one');
  assert.throws(() => track(db, 'made_up_event'), /Unknown analytics event/);
  assert.deepEqual(TRACKED_EVENTS, ['signup_completed', 'role_posted', 'swipe', 'match_created', 'first_message']);
});

test('counter rows carry no user ids or free text', () => {
  const db = {};
  track(db, 'first_message', { dim: 'team' });
  assert.deepEqual(Object.keys(db.eventCounts[0]).sort(), ['count', 'demo', 'dim', 'name', 'week']);
});

test('involvesDemo is true if ANY party is demo or sample', () => {
  assert.equal(involvesDemo({ demo: false }, { role: 'candidate' }), false);
  assert.equal(involvesDemo({}, { sample: true }), true);
  assert.equal(involvesDemo({}, undefined, { demo: true }), true);
  assert.equal(actorSide({ role: 'employer' }), 'team');
  assert.equal(actorSide(undefined), 'candidate');
});

test('weeklyCounts buckets by Monday (UTC) and excludes demo by default', () => {
  const db = {};
  track(db, 'swipe', { at: Date.UTC(2026, 9, 19, 10) }); // Mon
  track(db, 'swipe', { at: Date.UTC(2026, 9, 25, 23) }); // Sun, same ISO week
  track(db, 'swipe', { at: Date.UTC(2026, 9, 25, 23), demo: true });
  track(db, 'match_created', { at: Date.UTC(2026, 9, 26, 0) }); // next Mon
  assert.equal(isoWeek(Date.UTC(2026, 9, 25, 23)), '2026-10-19');
  assert.deepEqual(weeklyCounts(db.eventCounts), { '2026-10-19': { swipe: 2 }, '2026-10-26': { match_created: 1 } });
  assert.equal(weeklyCounts(db.eventCounts, { includeDemo: true })['2026-10-19'].swipe, 3);
});

// --- Route tests ------------------------------------------------------------

const DB_PATH = `/tmp/jobmatch-analytics-test-${process.pid}.json`;
let server;
let base;

async function listening() {
  if (base) return base;
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = DB_PATH;
  delete process.env.ANTHROPIC_API_KEY; // job import uses the offline heuristic parser
  const { app } = await import('./index.js');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

async function call(method, path, body, cookie) {
  const response = await fetch(`${await listening()}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get('set-cookie') || '';
  const session = setCookie.match(/jm_auth=[^;]+/)?.[0];
  return { status: response.status, body: await response.json().catch(() => ({})), session };
}

/** Total persisted count for an event, optionally filtered by demo flag and dim. */
function count(name, { demo, dim } = {}) {
  const rows = JSON.parse(readFileSync(DB_PATH, 'utf8')).eventCounts || [];
  return rows.filter((row) => row.name === name && (demo === undefined || row.demo === demo) && (dim === undefined || row.dim === dim))
    .reduce((sum, row) => sum + row.count, 0);
}

after(() => {
  server?.close();
  try { unlinkSync(DB_PATH); } catch { /* already gone */ }
});

const quickPost = (overrides = {}) => ({
  employerId: 'employer-demo', postSource: 'quick_post', status: 'active', type: 'Full-time',
  title: 'Analytics Test Engineer', location: 'Ho Chi Minh City', workMode: 'Hybrid', hiringRadiusKm: 40,
  salaryRange: { min: 30000, max: 45000, currency: 'USD' },
  requiredSkillsDetail: [{ name: 'React', weight: 2 }], description: 'Build the matching UI.',
  ...overrides,
});

async function registerReal(role, tag) {
  const result = await call('POST', '/api/auth/register', { role, name: `Real ${tag}`, email: `${tag}-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.ok(result.session, 'register issues a session cookie');
  return { id: result.body.user.id, cookie: result.session };
}

test('signup_completed counts a new account once, not a duplicate registration', async () => {
  await listening();
  const before = count('signup_completed', { demo: false, dim: 'candidate/email' });
  const payload = { role: 'candidate', name: 'Ana Lytics', email: `analytics-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true };
  assert.equal((await call('POST', '/api/auth/register', payload)).status, 201);
  assert.equal((await call('POST', '/api/auth/register', payload)).status, 409);
  assert.equal(count('signup_completed', { demo: false, dim: 'candidate/email' }), before + 1);
});

test('post a role: server rejects missing or zero salary and other required fields', async () => {
  await listening();
  const before = count('role_posted');
  const noSalary = await call('POST', '/api/jobs', quickPost({ salaryRange: undefined }));
  assert.equal(noSalary.status, 400);
  assert.equal(noSalary.body.field, 'salaryRange');
  const zeroSalary = await call('POST', '/api/jobs', quickPost({ salaryRange: { min: 0, max: 0, currency: 'USD' } }));
  assert.equal(zeroSalary.status, 400);
  assert.equal(zeroSalary.body.field, 'salaryRange');
  assert.equal((await call('POST', '/api/jobs', quickPost({ salaryRange: { min: 50000, max: 10000, currency: 'USD' } }))).status, 400);
  const noCity = await call('POST', '/api/jobs', quickPost({ location: '' }));
  assert.equal(noCity.status, 400);
  assert.equal(noCity.body.field, 'location');
  assert.equal((await call('POST', '/api/jobs', quickPost({ workMode: 'Moon' }))).status, 400);
  assert.equal((await call('POST', '/api/jobs', quickPost({ postSource: 'bot' }))).status, 400);
  assert.equal(count('role_posted'), before, 'rejected posts never count');
});

test('an imported draft cannot be published without a real salary (PATCH draft → active)', async () => {
  const imported = await call('POST', '/api/jobs/import-linkedin', {
    employerId: 'employer-demo',
    jobs: [{ url: `https://www.linkedin.com/jobs/view/${process.pid}01/`, title: 'Imported Frontend Engineer',
      description: 'Location: Hanoi\nFully remote role. We use React and TypeScript daily to build hiring tools for teams.' }],
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  const job = imported.body.jobs[0];
  assert.ok(job, 'the import created a draft');
  assert.equal(job.salaryRange, undefined, 'fixture has no salary in its text');
  const before = count('role_posted');

  const noSalary = await call('PATCH', `/api/jobs/${job.id}`, { status: 'active' });
  assert.equal(noSalary.status, 400, JSON.stringify(noSalary.body));
  assert.equal(noSalary.body.field, 'salaryRange');
  const zero = await call('PATCH', `/api/jobs/${job.id}`, { status: 'active', salaryRange: { min: 0, max: 0, currency: 'USD' } });
  assert.equal(zero.status, 400);
  assert.equal(zero.body.field, 'salaryRange');
  assert.equal(count('role_posted'), before, 'a blocked publish never counts');

  const deck = await call('GET', '/api/bootstrap?userId=candidate-demo');
  assert.equal(deck.body.jobs.some((card) => card.id === job.id), false, 'the rejected publish was rolled back — still a draft');

  const ok = await call('PATCH', `/api/jobs/${job.id}`, { status: 'active', salaryRange: { min: 40000, max: 60000, currency: 'USD' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(count('role_posted', { demo: true, dim: 'import' }) >= 1, true);
  assert.equal(count('role_posted'), before + 1);
});

test('demo funnel: role in deck → swipe → match → first message, each counted once', async () => {
  await listening();
  const before = { role: count('role_posted', { demo: true }), match: count('match_created', { demo: true }), first: count('first_message', { demo: true }) };
  const posted = await call('POST', '/api/jobs', quickPost());
  assert.equal(posted.status, 201, JSON.stringify(posted.body));
  const jobId = posted.body.job.id;
  assert.equal(count('role_posted', { demo: true, dim: 'quick_post' }) >= 1, true);
  assert.equal(count('role_posted', { demo: true }), before.role + 1);

  const deck = await call('GET', '/api/bootstrap?userId=candidate-demo');
  const card = deck.body.jobs.find((job) => job.id === jobId);
  assert.ok(card, 'the posted role is in the candidate deck');
  assert.equal(card.salaryHidden, true);
  assert.equal(card.geo, undefined, 'no exact coordinates in the deck');

  const draft = await call('POST', '/api/jobs', quickPost({ status: 'draft', title: 'Draft role' }));
  assert.equal(draft.status, 201);
  assert.equal(count('role_posted', { demo: true }), before.role + 1, 'drafts never count');

  const swipe = await call('POST', '/api/swipes', { actorId: 'candidate-demo', targetType: 'job', targetId: jobId, direction: 'like' });
  assert.equal(swipe.status, 201, JSON.stringify(swipe.body));
  let match = swipe.body.match;
  if (!match) {
    const teamSwipe = await call('POST', '/api/swipes', { actorId: 'employer-demo', targetType: 'candidate', targetId: 'candidate-demo', direction: 'like' });
    match = teamSwipe.body.match || (await call('GET', '/api/bootstrap?userId=candidate-demo')).body.matches.find((m) => m.jobId === jobId);
  }
  assert.ok(match, 'mutual likes produce a match');
  assert.equal(match.candidate?.passwordHash, undefined);
  assert.equal(match.employer?.passwordHash, undefined);
  assert.equal(count('match_created', { demo: true }), before.match + 1);
  assert.equal(count('match_created', { demo: false }), 0, 'demo personas never count as real');

  const swipes = count('swipe');
  await call('POST', '/api/swipes', { actorId: 'candidate-demo', targetType: 'job', targetId: jobId, direction: 'like' });
  assert.equal(count('swipe'), swipes, 'a duplicate swipe is not counted');

  assert.equal((await call('POST', '/api/messages', { matchId: match.id, senderId: 'employer-demo', text: 'Hi! Coffee this week?' })).status, 201);
  await call('POST', '/api/messages', { matchId: match.id, senderId: 'candidate-demo', text: 'Sure!' });
  assert.equal(count('first_message', { demo: true }), before.first + 1, 'only the first message in a match counts');
  assert.equal(readFileSync(DB_PATH, 'utf8').includes('"dim": "Hi! Coffee'), false);
});

test('undo retracts swipe, match and first message; re-swiping does not double count', async () => {
  await listening();
  // After the previous test employer-demo has liked candidate-demo, so a
  // candidate like on any new employer-demo role completes a match at once.
  const posted = await call('POST', '/api/jobs', quickPost({ title: 'Undo Test Role' }));
  const jobId = posted.body.job.id;
  const snapshot = () => ({ swipe: count('swipe'), match: count('match_created'), first: count('first_message') });
  const before = snapshot();

  const like = await call('POST', '/api/swipes', { actorId: 'candidate-demo', targetType: 'job', targetId: jobId, direction: 'like' });
  assert.ok(like.body.match, 'reciprocal like already exists');
  await call('POST', '/api/messages', { matchId: like.body.match.id, senderId: 'candidate-demo', text: 'Hello' });
  assert.deepEqual(snapshot(), { swipe: before.swipe + 1, match: before.match + 1, first: before.first + 1 });

  const undo = await call('POST', '/api/swipes/undo', { actorId: 'candidate-demo' });
  assert.equal(undo.status, 200);
  assert.equal(undo.body.undone.targetId, jobId);
  assert.deepEqual(snapshot(), before, 'undo retracts everything the swipe produced');

  const again = await call('POST', '/api/swipes', { actorId: 'candidate-demo', targetType: 'job', targetId: jobId, direction: 'like' });
  assert.ok(again.body.match);
  await call('POST', '/api/messages', { matchId: again.body.match.id, senderId: 'candidate-demo', text: 'Hello again' });
  assert.deepEqual(snapshot(), { swipe: before.swipe + 1, match: before.match + 1, first: before.first + 1 }, 'net one of each, not two');
});

test('a real user matching a starter SAMPLE job is counted as demo, not real', async () => {
  const real = await registerReal('candidate', 'sample-check');
  // Saving skills generates two sample jobs that the demo recruiter has
  // already "liked" this candidate for (generateSampleJobsForCandidate).
  const saved = await call('PATCH', `/api/users/${real.id}`, { skillsDetail: [{ name: 'React', level: 3 }], title: 'Frontend Engineer' }, real.cookie);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const sampleJobId = `sample-job-${real.id}-0`;
  const realBefore = { swipe: count('swipe', { demo: false }), match: count('match_created', { demo: false }), first: count('first_message', { demo: false }) };

  const like = await call('POST', '/api/swipes', { actorId: real.id, targetType: 'job', targetId: sampleJobId, direction: 'like' }, real.cookie);
  assert.equal(like.status, 201, JSON.stringify(like.body));
  assert.ok(like.body.match, 'the sample recruiter pre-liked this candidate, so this is a match');
  const msg = await call('POST', '/api/messages', { matchId: like.body.match.id, senderId: real.id, text: 'Hi there' }, real.cookie);
  assert.equal(msg.status, 201, JSON.stringify(msg.body));

  assert.deepEqual({ swipe: count('swipe', { demo: false }), match: count('match_created', { demo: false }), first: count('first_message', { demo: false }) }, realBefore,
    'swipe, match and first message against a sample/demo party never inflate real counts');
});

test('password hashes never leave the server — own record or anyone else\'s', async () => {
  const recruiter = await registerReal('employer', 'hash-check');
  const own = await call('GET', `/api/bootstrap?userId=${recruiter.id}`, undefined, recruiter.cookie);
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.viewer.passwordHash, undefined, 'bootstrap viewer');
  assert.equal(own.body.viewer.id, recruiter.id);

  const saved = await call('PATCH', `/api/users/${recruiter.id}`, { company: 'Hash Check Ltd' }, recruiter.cookie);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.user.passwordHash, undefined, 'profile save response');

  const demoDeck = await call('GET', '/api/bootstrap?userId=employer-demo');
  for (const candidate of demoDeck.body.candidates) {
    assert.equal(candidate.passwordHash, undefined);
    assert.equal(candidate.geo, undefined);
  }
});

test('weekly events endpoint is admin-only', async () => {
  const { status } = await call('GET', '/api/admin/analytics/events');
  assert.equal(status, 403);
});
