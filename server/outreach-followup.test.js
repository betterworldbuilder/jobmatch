import test from 'node:test';
import assert from 'node:assert/strict';
import { followupEmail, markViewedByRow, markViewedForJob, runFollowups, trackerFor } from './role-interest.js';
import { outreachReport } from './outreach.js';
import { matchingPool } from './matching-pool.js';
import { hiddenFrom } from './test-roles.js';

const H = 3600 * 1000;
const mk = () => ({
  users: [{ id: 'jf1', role: 'employer', jobFinder: true }, { id: 'c1', role: 'candidate', name: 'A' }, { id: 'c2', role: 'candidate', name: 'B' }],
  jobs: [{ id: 'j1', employerId: 'jf1', title: 'Data Engineer', company: 'Acme', recruiterName: 'Tram Nguyen', status: 'active', jobFinder: { listingStatus: 'published', sourceUrl: 'https://acme.example/jobs/1' } }],
  jobContacts: [{ jobId: 'j1', email: 'tram@acme.example' }], jfSuppress: [], jfOutreach: [], claimEvents: [], matches: [],
  roleInterestMails: [], roleFollowups: [], swipes: [],
});
const ctxOf = (db, sent) => ({
  store: { transaction: async (fn) => fn(db) }, origin: 'https://x.test', contactOf: (d, id) => (d.jobContacts || []).find((c) => c.jobId === id) || null,
  unsubscribeUrl: () => 'https://x.test/u', claimLink: () => 'https://x.test/claim/j1/abc', send: async (m) => { sent.push(m); return { delivered: true }; },
  mailerConfigured: () => true,
});

test('follow-up: one, 24 h after the cold email, "N more candidates applied", same unsubscribe', async () => {
  const db = mk(); const now = Date.now();
  db.roleInterestMails.push({ id: 'm1', jobId: 'j1', candidateId: 'c1', recipientHash: 'h', status: 'sent', sentAt: now - 25 * H });
  // recipientHash must equal the hash of the contact: compute through the module's hash
  const { hashEmail } = await import('./jobfinder.js'); db.roleInterestMails[0].recipientHash = hashEmail('tram@acme.example');
  db.swipes.push({ actorId: 'c1', targetType: 'job', targetId: 'j1', direction: 'like', createdAt: now - 26 * H }, { actorId: 'c2', targetType: 'job', targetId: 'j1', direction: 'like', createdAt: now - 2 * H });
  const sent = [];
  const r = await runFollowups(ctxOf(db, sent), { now });
  assert.equal(r.sent, 1); assert.match(sent[0].subject, /^1 more candidate applied to your Data Engineer role/);
  assert.match(sent[0].text, /claim\/j1/); assert.match(sent[0].text, /Don’t want these emails\? https:\/\/x\.test\/u/);
  assert.equal((await runFollowups(ctxOf(db, sent), { now: now + H })).due, 0, 'never a second follow-up');
});

test('no follow-up before 24 h, after a claim, or when unsubscribed', async () => {
  const { hashEmail } = await import('./jobfinder.js'); const h = hashEmail('tram@acme.example'); const now = Date.now();
  const early = mk(); early.roleInterestMails.push({ id: 'm', jobId: 'j1', candidateId: 'c1', recipientHash: h, status: 'sent', sentAt: now - 2 * H });
  assert.equal((await runFollowups(ctxOf(early, []), { now })).due, 0);
  const claimed = mk(); claimed.users.push({ id: 'r9', role: 'employer' }); claimed.jobs[0].employerId = 'r9';
  claimed.roleInterestMails.push({ id: 'm', jobId: 'j1', candidateId: 'c1', recipientHash: h, status: 'sent', sentAt: now - 30 * H });
  assert.equal((await runFollowups(ctxOf(claimed, []), { now })).sent, 0);
  const unsub = mk(); unsub.jfSuppress.push({ hash: h }); unsub.roleInterestMails.push({ id: 'm', jobId: 'j1', candidateId: 'c1', recipientHash: h, status: 'sent', sentAt: now - 30 * H });
  assert.equal((await runFollowups(ctxOf(unsub, []), { now })).sent, 0);
});

test('candidate tracker: contacted → viewed (from the email link or the claim page) → answer by +48 h', () => {
  const db = mk(); const t0 = Date.now() - H;
  db.roleInterestMails.push({ id: '11111111-1111-1111-1111-111111111111', jobId: 'j1', candidateId: 'c1', status: 'sent', sentAt: t0 }, { id: 'm2', jobId: 'j1', candidateId: 'c2', status: 'sent', sentAt: t0 });
  assert.equal(trackerFor(db, 'j1', 'c1').state, 'contacted');
  assert.equal(markViewedByRow(db, '11111111-1111-1111-1111-111111111111', 'c2'), false, 'the row must be the candidate’s own');
  assert.equal(markViewedByRow(db, '11111111-1111-1111-1111-111111111111', 'c1'), true);
  const t = trackerFor(db, 'j1', 'c1'); assert.equal(t.state, 'viewed'); assert.equal(t.answerBy - t.viewedAt, 48 * H);
  assert.equal(markViewedForJob(db, 'j1'), 1, 'the claim page marks the others');
  assert.equal(trackerFor(db, 'j1', 'nobody'), null);
});

test('outreach report: per role and per recruiter; hot = opened, not claimed', () => {
  const db = mk();
  db.swipes.push({ actorId: 'c1', targetType: 'job', targetId: 'j1', direction: 'like' });
  db.roleInterestMails.push({ id: 'm', jobId: 'j1', candidateId: 'c1', status: 'sent', sentAt: 5, viewedAt: 9 });
  const r = outreachReport(db, { contactOf: (d, id) => d.jobContacts.find((c) => c.jobId === id) });
  assert.equal(r.roles[0].applicants, 1); assert.equal(r.roles[0].coldSent, 1); assert.equal(r.roles[0].hot, true);
  assert.equal(r.recruiters[0].email, 'tram@acme.example'); assert.deepEqual(r.recruiters[0].names, ['Tram Nguyen']);
  assert.equal(r.totals.hot, 1);
});

test('a tester sees only its test roles, is hidden from real recruiters, never cold-emails a real recruiter', async () => {
  const db = mk();
  db.users.push({ id: 't1', role: 'candidate', tester: true, name: 'Tester' }, { id: 'r2', role: 'employer' });
  db.jobs.push({ id: 'jt', employerId: 'jf1', title: 'Test role', company: 'X', status: 'active', visibleTo: ['t1'], jobFinder: { listingStatus: 'published' } });
  const pool = matchingPool(db, db.users.find((u) => u.id === 't1'));
  assert.deepEqual([...pool.jobIds], ['jt'], 'only the test role');
  assert.equal(matchingPool(db, db.users.find((u) => u.id === 'r2')).userIds.has('t1'), false, 'hidden from a real recruiter');
  assert.equal(matchingPool(db, db.users.find((u) => u.id === 'jf1')).userIds.has('t1'), true, 'the JobFinder account sees it');
  const { afterRoleInterest } = await import('./role-interest.js');
  assert.equal(await afterRoleInterest(ctxOf(db, []), { candidateId: 't1', jobId: 'j1' }), null, 'real role: no cold email');
  await afterRoleInterest(ctxOf(db, []), { candidateId: 't1', jobId: 'jt' });
  db.jobContacts.push({ jobId: 'jt', email: 'founder@x.example' });
  await afterRoleInterest(ctxOf(db, []), { candidateId: 't1', jobId: 'jt' });
  assert.equal(db.roleInterestMails.filter((m) => m.jobId === 'jt').length, 1, 'its test role: cold email prepared');
});

test('test roles: only the tester and the owner see them', () => {
  const db = mk(); db.users.push({ id: 't1', role: 'candidate' }); db.jobs[0].visibleTo = ['t1'];
  assert.equal(hiddenFrom(db.jobs[0], 'c1'), true); assert.equal(hiddenFrom(db.jobs[0], 't1'), false); assert.equal(hiddenFrom(db.jobs[0], 'jf1'), false);
  assert.equal(matchingPool(db, db.users.find((u) => u.id === 'c1')).jobIds.has('j1'), false);
  assert.equal(matchingPool(db, db.users.find((u) => u.id === 't1')).jobIds.has('j1'), true);
  assert.match(followupEmail({ job: db.jobs[0], newCount: 0, waiting: 2, origin: 'o', unsubscribeUrl: 'u', roleUrl: 'r' }).subject, /waiting/);
});
