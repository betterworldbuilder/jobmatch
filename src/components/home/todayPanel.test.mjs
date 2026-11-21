// Home "Today": real-data summary, urgent actions, next interview, settings; profile section first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const DAY = 86400000;
const now = new Date('2026-11-21T10:00:00').getTime();
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

test('Today panel renders the profile first with completeness, visibility and the four blocks', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./TodayPanel.tsx', import.meta.url));
  const html = renderToStaticMarkup(React.createElement(mod.TodayPanel, { data: base(), setData: () => undefined, navigate: () => undefined, onEditProfile: () => undefined, onPreview: () => undefined }));
  assert.ok(html.indexOf('tp-profile') < html.indexOf('tp-summary'), 'profile comes first');
  for (const text of ['Lan Tran', 'Looking for', 'Edit info', '60% complete', 'Visible to recruiters', 'Urgent', 'Next interview', 'My search settings', 'Replies waiting', 'Interviews this week', 'Not set'])
    assert.ok(html.includes(text), `shows ${text}`);
  assert.doesNotMatch(html, /profile views/, 'no invented view counts');
});
