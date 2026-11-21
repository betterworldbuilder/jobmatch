import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { buildIcs } from './calendar-feed.js';

/* Private calendar feed (Google Calendar "From URL", phone reminders) and the candidate booking link. */
const DB_PATH = `/tmp/jobmatch-calfeed-test-${process.pid}.json`;
let server; let base;
async function call(method, path, body, cookie) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch { /* ics */ }
  return { status: res.status, body: json, text, type: res.headers.get('content-type') || '', session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

test('ics: events carry two phone alarms and long lines are folded', () => {
  const ics = buildIcs([{ call: { id: 'c1', title: 'Intro call '.repeat(12), startAt: Date.UTC(2027, 0, 5, 9), durationMinutes: 30, createdAt: 0 }, job: { title: 'Engineer', company: 'Acme' }, other: { name: 'Sam' } }]);
  assert.match(ics, /BEGIN:VCALENDAR/); assert.match(ics, /DTSTART:20270105T090000Z/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.match(ics, /TRIGGER:-PT15M/); assert.match(ics, /TRIGGER:-PT60M/);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines folded at 75 octets');
});

test('feed: the member gets a private link, it lists their meetings, a reset kills the old link', async () => {
  const made = await call('POST', '/api/users/candidate-demo/calendar-feed', {});
  assert.equal(made.status, 200, made.text);
  assert.match(made.body.url, /^https:\/\/.+\/api\/calendar\/[A-Za-z0-9_-]{32}\.ics$/);
  assert.match(made.body.webcal, /^webcal:\/\//);
  const path = new URL(made.body.url).pathname;
  // A meeting scheduled after subscribing shows up in the same feed.
  const sched = await call('POST', '/api/calls', { matchId: 'm-sofia-aws', createdBy: 'candidate-demo', title: 'Feed test call', startAt: Date.now() + 2 * 86400000, durationMinutes: 30 });
  assert.equal(sched.status, 201, sched.text);
  const feed = await call('GET', path);
  assert.equal(feed.status, 200); assert.match(feed.type, /text\/calendar/);
  assert.match(feed.text, /SUMMARY:Feed test call/, 'the new meeting is in the feed');
  assert.match(feed.text, /BEGIN:VALARM/);
  // Same link on a second call; a reset makes a new one and the old one stops working.
  assert.equal((await call('POST', '/api/users/candidate-demo/calendar-feed', {})).body.url, made.body.url);
  const reset = await call('POST', '/api/users/candidate-demo/calendar-feed', { reset: true });
  assert.notEqual(reset.body.url, made.body.url);
  assert.equal((await call('GET', path)).status, 404, 'old link is dead');
  assert.equal((await call('GET', '/api/calendar/not-a-token.ics')).status, 404);
  // Recruiters never see the token.
  const deck = await call('GET', '/api/bootstrap?userId=employer-demo');
  assert.ok(deck.body.candidates.every((c) => c.calendarFeedToken === undefined));
});

test('feed: a real member can only make their own link', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Feed Owner', email: `feed-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal((await call('POST', '/api/users/candidate-demo/calendar-feed', {}, reg.session)).status, 403);
  assert.equal((await call('POST', `/api/users/${reg.body.user.id}/calendar-feed`, {}, reg.session)).status, 200);
});

test('booking link: https only, saved for candidates, hidden from recruiters before a match', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Booking Link', email: `book-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const id = reg.body.user.id; const ck = reg.session;
  assert.equal((await call('PATCH', `/api/users/${id}`, { calendarLink: 'javascript:alert(1)' }, ck)).status, 400);
  const ok = await call('PATCH', `/api/users/${id}`, { calendarLink: 'https://calendar.app.google/abc123', contactChannels: [{ type: 'whatsapp', value: '+84 908 000 000' }] }, ck);
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.user.calendarLink, 'https://calendar.app.google/abc123');
  // Demo recruiters' decks are demo-only; check a demo candidate with a booking link instead.
  await call('PATCH', '/api/users/candidate-demo-6', { calendarLink: 'https://calendar.app.google/demo6' });
  const deck = await call('GET', '/api/bootstrap?userId=employer-demo');
  const c6 = deck.body.candidates.find((c) => c.id === 'candidate-demo-6');
  assert.ok(c6, 'demo candidate in the deck');
  const matched = deck.body.matches.some((m) => m.candidateId === 'candidate-demo-6');
  assert.equal(c6.calendarLink, matched ? 'https://calendar.app.google/demo6' : undefined, 'booking link only after a match');
  assert.equal((await call('PATCH', `/api/users/${id}`, { calendarLink: '' }, ck)).body.user.calendarLink, undefined, 'empty clears it');
});
