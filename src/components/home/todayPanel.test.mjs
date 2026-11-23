// Home "Today": real-data summary, urgent actions, next interview, settings; profile section first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const DAY = 86400000;
// Today at 10:00 (was a fixed 2026-11-21: the panel uses the real clock, so the "next interview" fell into the past
// two days later and the test failed for no code reason).
const now = (() => { const d = new Date(); d.setHours(10, 0, 0, 0); return d.getTime(); })();
const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const job = { id: 'j', employerId: 'e', title: 'Backend Engineer', company: 'Stripe' };
const base = (extra = {}) => ({
  viewer: { id: 'me', role: 'candidate', name: 'Lan Tran', completeness: 60, preferences: { desiredRoles: ['Backend Engineer'], workMode: { mode: 'remote' } } },
  jobs: [{ id: 'j2', likedYou: true }, { id: 'j', likedYou: true }], candidates: [], calls: [], notes: [], bookmarkedIds: [], likesRemaining: 5,
  matches: [{ id: 'm', candidateId: 'me', employerId: 'e', jobId: 'j', stage: 'Interview', createdAt: now - 5 * DAY, job, employer: { id: 'e', name: 'Priya Nair' },
    pipeline: [{ id: 'match', name: 'Mutual match', owner: '', kind: 'match' }, { id: 'r1', name: 'Technical interview', owner: 'Minh Tran, Staff Engineer', kind: 'technical', date: iso(now + DAY) }, { id: 'offer', name: 'Offer', owner: '', kind: 'offer' }, { id: 'hire', name: 'Hired', owner: '', kind: 'hired' }], currentStepId: 'r1' }],
  messages: [{ id: 'x', matchId: 'm', senderId: 'e', text: 'Hi!', createdAt: now - DAY }],
  ...extra,
});

test('summary numbers, urgent order, next interview and labels come from real records', async () => {
  const { mod: t } = await loadTsx(new URL('../../lib/today.ts', import.meta.url));
  const data = base();
  assert.equal(t.likesWaiting(data), 1, 'liked jobs not matched yet');
  assert.equal(t.repliesWaiting(data).length, 1);
  const next = t.nextInterview(data, now);
  assert.equal(next.title, 'Round 1: Technical interview · Backend Engineer');
  assert.equal(next.who, 'Minh Tran, Staff Engineer');
  const urgent = t.urgentItems(data, now);
  assert.deepEqual(urgent.map((u) => u.kind), ['interview', 'reply', 'likes'], 'max 3, most urgent first');
  assert.equal(t.interviewsThisWeek(data, now), 1);
  assert.equal(t.workModeLabel({ mode: 'hybrid', hybridDays: 2 }), 'Hybrid · 2 days in office');
  assert.equal(t.salaryLabel({ min: 70000, max: 100000, currency: 'USD' }), '$70k – $100k / year');
  assert.equal(t.salaryLabel(undefined), '');
  const calm = t.urgentItems(base({ matches: [], messages: [], jobs: [], viewer: { ...data.viewer, completeness: 95, preferences: { salary: { min: 1 } } } }), now);
  assert.deepEqual(calm, []);
});

test('recruiter: likes come from role lists; pipeline columns follow the current step', async () => {
  const { mod: t } = await loadTsx(new URL('../../lib/today.ts', import.meta.url));
  const data = { viewer: { id: 'e', role: 'employer', name: 'Priya' }, jobs: [], candidates: [{ id: 'c1' }, { id: 'c2' }], matches: [{ id: 'm', candidateId: 'c1', employerId: 'e', jobId: 'j' }],
    roleMatches: [{ job: { id: 'j' }, candidates: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], interestedCount: 3, newCount: 0 }] };
  assert.equal(t.likesWaiting(data), 2, 'c2 and c3 like a role; c1 is already matched');
  const { mod: rs } = await loadTsx(new URL('./RecruiterSections.tsx', import.meta.url));
  const steps = [{ id: 'match', name: 'Mutual match', owner: '', kind: 'match' }, { id: 'r1', name: 'Tech', owner: '', kind: 'technical' }, { id: 'offer', name: 'Offer', owner: '', kind: 'offer' }, { id: 'hire', name: 'Hired', owner: '', kind: 'hired' }];
  assert.equal(rs.columnOf({ pipeline: steps, currentStepId: 'match' }), 'matched');
  assert.equal(rs.columnOf({ pipeline: steps, currentStepId: 'r1' }), 'interviewing');
  assert.equal(rs.columnOf({ pipeline: steps, currentStepId: 'offer' }), 'offer');
  assert.equal(rs.columnOf({ pipeline: steps, currentStepId: 'hire' }), 'hired');
});

test('contact bar: booking, WhatsApp, Zalo and email links from the member\'s own channels', async () => {
  const { mod: t } = await loadTsx(new URL('../../lib/today.ts', import.meta.url));
  const links = t.contactLinks({ calendarLink: 'https://cal.com/me', email: 'me@x.com', contactChannels: [{ type: 'whatsapp', value: '+84 908 000 111' }, { type: 'zalo', value: '0908 000 111' }] });
  assert.deepEqual(links.map((l) => l.kind), ['book', 'whatsapp', 'zalo', 'email']);
  assert.equal(links[1].href, 'https://wa.me/84908000111');
  assert.equal(links[2].href, 'https://zalo.me/0908000111');
  assert.equal(links[3].href, 'mailto:me@x.com');
  assert.deepEqual(t.contactLinks({ calendarLink: 'javascript:alert(1)' }).map((l) => l.kind), [], 'only https booking links');
});

test('Today panel: no profile card (founder 2026-11-22); summary, urgent, next interview with calendar links, settings', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./TodayPanel.tsx', import.meta.url));
  const html = renderToStaticMarkup(React.createElement(mod.TodayPanel, { data: base(), setData: () => undefined, navigate: () => undefined, onEditProfile: () => undefined, onPreview: () => undefined }));
  assert.doesNotMatch(html, /class="tp-profile"/, 'profile card removed from Things to do');
  for (const text of ['Add to my calendar', 'calendar.google.com', 'Urgent', 'Next interview', 'My search settings', 'Replies waiting', 'Interviews this week', 'Not set'])
    assert.ok(html.includes(text), `shows ${text}`);
  assert.doesNotMatch(html, /profile views/, 'no invented view counts');
});
