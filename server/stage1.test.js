import test from 'node:test';
import assert from 'node:assert/strict';
import { applicantsOf, claimSig, claimUrl, claimLinksOn, stage1Funnel, weekOf } from './stage1.js';
import { interestEmail } from './role-interest.js';

test('claim signature is tied to the role and the recruiter email (case-insensitive)', () => {
  const a = claimSig('s', 'job1', 'HR@Acme.com');
  assert.equal(a, claimSig('s', 'job1', 'hr@acme.com'));
  assert.notEqual(a, claimSig('s', 'job2', 'hr@acme.com'));
  assert.notEqual(a, claimSig('s', 'job1', 'other@acme.com'));
  assert.notEqual(a, claimSig('x', 'job1', 'hr@acme.com'));
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(claimUrl('https://x.com', 's', 'job1', 'hr@acme.com'), `https://x.com/claim/job1/${a}`);
});

test('claim links stay off unless ROLE_CLAIM_LINKS=on', () => {
  assert.equal(claimLinksOn({}), false);
  assert.equal(claimLinksOn({ ROLE_CLAIM_LINKS: 'ON' }), true);
});

test('interest email carries the claim link only when given', () => {
  const base = { job: { title: 'Data Engineer', recruiterName: 'Ann Lee', company: 'Acme' }, candidate: { name: 'Linh Tran' }, origin: 'https://x.com', unsubscribeUrl: 'u', profileUrl: 'p', roleUrl: 'r' };
  assert.ok(!interestEmail(base).text.includes('See all candidates'));
  assert.ok(interestEmail({ ...base, claimLink: 'https://x.com/claim/j/abc' }).text.includes('https://x.com/claim/j/abc'));
});

test('applicants: public profiles listed, private counted, demo excluded, one per candidate', () => {
  const db = {
    users: [
      { id: 'c1', role: 'candidate', name: 'A', profileSlug: 'a.b', skills: ['SQL'] },
      { id: 'c2', role: 'candidate', name: 'B', publicProfile: false, profileSlug: 'b.c' },
      { id: 'c3', role: 'candidate', name: 'D', demo: true, profileSlug: 'd.e' },
    ],
    swipes: [
      { actorId: 'c1', targetType: 'job', targetId: 'j', direction: 'like', createdAt: 1 },
      { actorId: 'c1', targetType: 'job', targetId: 'j', direction: 'like', createdAt: 2 },
      { actorId: 'c2', targetType: 'job', targetId: 'j', direction: 'like', createdAt: 3 },
      { actorId: 'c3', targetType: 'job', targetId: 'j', direction: 'like', createdAt: 4 },
    ],
  };
  const r = applicantsOf(db, 'j');
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].slug, 'a.b');
  assert.equal(r.hidden, 1);
});

test('funnel counts real activity in the right week', () => {
  const now = Date.UTC(2026, 10, 26, 12);
  const db = {
    users: [{ id: 'c', role: 'candidate' }, { id: 'e', role: 'employer' }, { id: 'd', role: 'candidate', demo: true }],
    jobs: [{ id: 'j', employerId: 'e', status: 'active' }],
    swipes: [
      { actorId: 'c', targetType: 'job', targetId: 'j', direction: 'like', createdAt: now },
      { actorId: 'd', targetType: 'job', targetId: 'j', direction: 'like', createdAt: now },
      { actorId: 'e', targetType: 'candidate', targetId: 'c', direction: 'like', createdAt: now },
    ],
    claimEvents: [{ jobId: 'j', type: 'view', at: now }, { jobId: 'j', type: 'claim', at: now }],
    matches: [{ id: 'm', candidateId: 'c', employerId: 'e', jobId: 'j', createdAt: now }],
    messages: [{ matchId: 'm', senderId: 'c', createdAt: now }, { matchId: 'm', senderId: 'e', createdAt: now + 1 }],
    calls: [{ matchId: 'm', createdAt: now }],
  };
  const f = stage1Funnel(db, { weeks: 2, now });
  const w = f.weeks.at(-1);
  assert.equal(w.week, weekOf(now));
  assert.deepEqual({ ...w, week: undefined }, { week: undefined, likes: 1, emailsSent: 0, linkOpens: 1, claims: 1, likeBacks: 1, matches: 1, conversations: 1, interviews: 1 });
  assert.equal(f.snapshot.rolesLive, 1);
});
