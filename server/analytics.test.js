import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { actorSide, track, TRACKED_EVENTS, weeklyCounts } from './analytics.js';

/* Funnel analytics: unit tests for the helper, then route tests that drive
 * real HTTP requests and read the scratch JSON store back to check exactly
 * which events were persisted. Same dynamic-import pattern as routes.test.js. */

test('track appends a well-formed event and rejects unknown names', () => {
  const db = {};
  const event = track(db, 'swipe', { userId: 'u1', props: { direction: 'like', side: 'candidate' } });
  assert.equal(db.events.length, 1);
  assert.equal(event.name, 'swipe');
  assert.equal(event.demo, false);
  assert.equal(typeof event.createdAt, 'number');
  assert.throws(() => track(db, 'made_up_event'), /Unknown analytics event/);
  assert.deepEqual(TRACKED_EVENTS, ['signup_completed', 'role_posted', 'swipe', 'match_created', 'first_message']);
});

test('actorSide maps employers to team and everyone else to candidate', () => {
  assert.equal(actorSide({ role: 'employer' }), 'team');
  assert.equal(actorSide({ role: 'candidate' }), 'candidate');
  assert.equal(actorSide(undefined), 'candidate');
});

test('weeklyCounts buckets by Monday (UTC) and excludes demo by default', () => {
  const monday = Date.UTC(2026, 9, 19, 10); // Mon 2026-10-19
  const sunday = Date.UTC(2026, 9, 25, 23); // Sun 2026-10-25, same ISO week
  const nextMonday = Date.UTC(2026, 9, 26, 0);
  const events = [
    { name: 'swipe', createdAt: monday, demo: false },
    { name: 'swipe', createdAt: sunday, demo: false },
    { name: 'swipe', createdAt: sunday, demo: true },
    { name: 'match_created', createdAt: nextMonday, demo: false },
  ];
  assert.deepEqual(weeklyCounts(events), { '2026-10-19': { swipe: 2 }, '2026-10-26': { match_created: 1 } });
  assert.equal(weeklyCounts(events, { includeDemo: true })['2026-10-19'].swipe, 3);
});

// --- Route tests ------------------------------------------------------------

const DB_PATH = `/tmp/jobmatch-analytics-test-${process.pid}.json`;
let server;
let base;

async function listening() {
  if (base) return base;
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = DB_PATH;
  const { app } = await import('./index.js');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

async function call(method, path, body) {
  const response = await fetch(`${await listening()}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const events = (name) => (JSON.parse(readFileSync(DB_PATH, 'utf8')).events || []).filter((event) => event.name === name);

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

test('signup_completed fires once for a new account, not for a duplicate', async () => {
  const email = `analytics-${process.pid}@example.com`;
  const payload = { role: 'candidate', name: 'Ana Lytics', email, password: 'correct-horse-battery', conductAccepted: true };
  const first = await call('POST', '/api/auth/register', payload);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const again = await call('POST', '/api/auth/register', payload);
  assert.equal(again.status, 409);
  const mine = events('signup_completed').filter((event) => event.userId === first.body.user.id);
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].props, { side: 'candidate', method: 'email' });
});

test('post a role: server rejects missing or zero salary and other required fields', async () => {
  const before = events('role_posted').length;
  const noSalary = await call('POST', '/api/jobs', quickPost({ salaryRange: undefined }));
  assert.equal(noSalary.status, 400);
  assert.equal(noSalary.body.field, 'salaryRange');
  const zeroSalary = await call('POST', '/api/jobs', quickPost({ salaryRange: { min: 0, max: 0, currency: 'USD' } }));
  assert.equal(zeroSalary.status, 400);
  assert.equal(zeroSalary.body.field, 'salaryRange');
  const inverted = await call('POST', '/api/jobs', quickPost({ salaryRange: { min: 50000, max: 10000, currency: 'USD' } }));
  assert.equal(inverted.status, 400);
  const noCity = await call('POST', '/api/jobs', quickPost({ location: '' }));
  assert.equal(noCity.status, 400);
  assert.equal(noCity.body.field, 'location');
  const badMode = await call('POST', '/api/jobs', quickPost({ workMode: 'Moon' }));
  assert.equal(badMode.status, 400);
  const badSource = await call('POST', '/api/jobs', quickPost({ postSource: 'bot' }));
  assert.equal(badSource.status, 400);
  assert.equal(events('role_posted').length, before, 'rejected posts never emit role_posted');
});

test('full funnel: role_posted → in candidate deck → swipe → match_created → first_message', async () => {
  const posted = await call('POST', '/api/jobs', quickPost());
  assert.equal(posted.status, 201, JSON.stringify(posted.body));
  const jobId = posted.body.job.id;
  const rolePosted = events('role_posted').filter((event) => event.props.jobId === jobId);
  assert.equal(rolePosted.length, 1);
  assert.deepEqual(rolePosted[0].props, { jobId, workMode: 'Hybrid', type: 'Full-time', source: 'quick_post' });

  // Shows up in the candidate's swipe deck, salary still hidden pre-match.
  const deck = await call('GET', '/api/bootstrap?userId=candidate-demo');
  const card = deck.body.jobs.find((job) => job.id === jobId);
  assert.ok(card, 'the posted role is in the candidate deck');
  assert.equal(card.salaryHidden, true);
  assert.equal(card.geo, undefined, 'no exact coordinates in the deck');

  // A draft must NOT emit role_posted and must stay out of the deck.
  const draft = await call('POST', '/api/jobs', quickPost({ status: 'draft', title: 'Draft role' }));
  assert.equal(draft.status, 201);
  assert.equal(events('role_posted').filter((event) => event.props.jobId === draft.body.job.id).length, 0);

  const candidateSwipe = await call('POST', '/api/swipes', { actorId: 'candidate-demo', targetType: 'job', targetId: jobId, direction: 'like' });
  assert.equal(candidateSwipe.status, 201, JSON.stringify(candidateSwipe.body));
  let match = candidateSwipe.body.match;
  if (!match) {
    const teamSwipe = await call('POST', '/api/swipes', { actorId: 'employer-demo', targetType: 'candidate', targetId: 'candidate-demo', direction: 'like' });
    assert.equal(teamSwipe.status, 201, JSON.stringify(teamSwipe.body));
    match = teamSwipe.body.match || (await call('GET', '/api/bootstrap?userId=candidate-demo')).body.matches.find((m) => m.jobId === jobId);
  }
  assert.ok(match, 'mutual likes produce a match');
  assert.equal(match.candidate?.passwordHash, undefined);
  assert.equal(match.employer?.passwordHash, undefined);

  const swipe = events('swipe').find((event) => event.userId === 'candidate-demo' && event.props.targetType === 'job');
  assert.ok(swipe);
  assert.equal(swipe.props.direction, 'like');
  assert.equal(swipe.props.side, 'candidate');
  assert.equal(swipe.demo, true, 'demo personas are flagged so weekly counts can exclude them');

  // Duplicate swipe is not double-counted.
  const swipeCount = events('swipe').length;
  await call('POST', '/api/swipes', { actorId: 'candidate-demo', targetType: 'job', targetId: jobId, direction: 'like' });
  assert.equal(events('swipe').length, swipeCount);

  const created = events('match_created').filter((event) => event.props.jobId === jobId);
  assert.equal(created.length, 1);
  assert.equal(created[0].props.matchId, match.id);

  const hello = await call('POST', '/api/messages', { matchId: match.id, senderId: 'employer-demo', text: 'Hi! Coffee this week?' });
  assert.equal(hello.status, 201);
  await call('POST', '/api/messages', { matchId: match.id, senderId: 'candidate-demo', text: 'Sure!' });
  const first = events('first_message').filter((event) => event.props.matchId === match.id);
  assert.equal(first.length, 1, 'only the first message in a match counts');
  assert.equal(first[0].props.senderSide, 'team');
  assert.equal(JSON.stringify(first[0]).includes('Coffee'), false, 'message text never lands in analytics');
});

test('recruiter deck never carries candidate password hashes or coordinates', async () => {
  const { status, body } = await call('GET', '/api/bootstrap?userId=employer-demo');
  assert.equal(status, 200);
  for (const candidate of body.candidates) {
    assert.equal(candidate.passwordHash, undefined);
    assert.equal(candidate.geo, undefined);
  }
});

test('weekly events endpoint is admin-only', async () => {
  const { status } = await call('GET', '/api/admin/analytics/events');
  assert.equal(status, 403);
});
