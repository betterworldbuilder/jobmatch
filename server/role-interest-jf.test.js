import test from 'node:test';
import assert from 'node:assert/strict';
import { afterRoleInterest } from './role-interest.js';

/* Option B (founder, 2026-11-26): imported JobFinder listings with a recruiter email get the interest email on apply,
   never twice (skipped when JobFinder's consent-based email already went for the same candidate and role). */
const mkCtx = (db, sent) => ({
  store: { transaction: async (fn) => fn(db) },
  origin: 'https://x.test', contactOf: (d, id) => (d.jobContacts || []).find((c) => c.jobId === id) || null,
  scoreCandidateForJob: () => null, unsubscribeUrl: () => 'https://x.test/u', send: async (m) => { sent.push(m); return { messageId: 'm' }; },
});
const base = () => ({
  users: [{ id: 'jf1', role: 'employer', jobFinder: true }, { id: 'c1', role: 'candidate', name: 'Linh Tran', profileSlug: 'linh.tran' }],
  jobs: [{ id: 'jf-1', employerId: 'jf1', title: 'Test role AI Engineer', company: 'Acme', recruiterName: 'Dzoan Nguyen', jobFinder: { listingStatus: 'published', sourceUrl: 'https://acme.example/jobs/1' } }],
  jobContacts: [{ jobId: 'jf-1', email: 'recruiter@acme.example' }], jfOutreach: [], jfSuppress: [], roleInterestMails: [],
});

test('an imported listing with a recruiter email is now included (prepared for sending, posting link = source)', async () => {
  const db = base(); const sent = [];
  await afterRoleInterest(mkCtx(db, sent), { candidateId: 'c1', jobId: 'jf-1' });
  assert.equal(db.roleInterestMails.length, 1, 'a mail row was prepared for the recruiter');
  assert.notEqual(db.roleInterestMails[0].status, 'suppressed');
});

test('not twice: skipped when the JobFinder consent email already went', async () => {
  const db = base(); db.jfOutreach.push({ jobId: 'jf-1', candidateId: 'c1', status: 'sent' });
  const r = await afterRoleInterest(mkCtx(db, []), { candidateId: 'c1', jobId: 'jf-1' });
  assert.deepEqual(r, { status: 'already_sent_by_jobfinder' });
  assert.equal(db.roleInterestMails.length, 0);
});

test('no recruiter email, or a demo candidate: nothing', async () => {
  const db = base(); db.jobContacts = [];
  assert.equal(await afterRoleInterest(mkCtx(db, []), { candidateId: 'c1', jobId: 'jf-1' }), null);
  const db2 = base(); db2.users[1].demo = true;
  assert.equal(await afterRoleInterest(mkCtx(db2, []), { candidateId: 'c1', jobId: 'jf-1' }), null);
});
