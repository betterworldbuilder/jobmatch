import assert from 'node:assert/strict';
import test from 'node:test';
import { matchingPool, targetIsInMatchingPool } from './matching-pool.js';

const db = {
  users: [
    { id: 'real-candidate', role: 'candidate' },
    { id: 'real-employer', role: 'employer' },
    { id: 'demo-candidate', role: 'candidate', demo: true },
    { id: 'demo-employer', role: 'employer', demo: true },
  ],
  jobs: [
    { id: 'real-job', employerId: 'real-employer' },
    { id: 'demo-job', employerId: 'demo-employer', demo: true },
  ],
  swipes: [
    { id: 'real-swipe', actorId: 'real-candidate', targetType: 'job', targetId: 'real-job' },
    { id: 'demo-swipe', actorId: 'demo-candidate', targetType: 'job', targetId: 'demo-job' },
    { id: 'cross-pool-swipe', actorId: 'real-candidate', targetType: 'job', targetId: 'demo-job' },
  ],
  matches: [
    { id: 'real-match', candidateId: 'real-candidate', employerId: 'real-employer', jobId: 'real-job' },
    { id: 'demo-match', candidateId: 'demo-candidate', employerId: 'demo-employer', jobId: 'demo-job' },
  ],
};

test('real matching excludes every demo account, job, swipe, and match', () => {
  const pool = matchingPool(db, db.users[0]);
  assert.deepEqual(pool.users.map((item) => item.id), ['real-candidate', 'real-employer']);
  assert.deepEqual(pool.jobs.map((item) => item.id), ['real-job']);
  assert.deepEqual(pool.swipes.map((item) => item.id), ['real-swipe']);
  assert.deepEqual(pool.matches.map((item) => item.id), ['real-match']);
});

test('demo matching is isolated and cross-pool swipe targets are rejected', () => {
  const pool = matchingPool(db, db.users[2]);
  assert.deepEqual(pool.users.map((item) => item.id), ['demo-candidate', 'demo-employer']);
  assert.deepEqual(pool.jobs.map((item) => item.id), ['demo-job']);
  assert.deepEqual(pool.swipes.map((item) => item.id), ['demo-swipe']);
  assert.deepEqual(pool.matches.map((item) => item.id), ['demo-match']);
  assert.equal(targetIsInMatchingPool(db, db.users[0], 'job', 'demo-job'), false);
  assert.equal(targetIsInMatchingPool(db, db.users[2], 'candidate', 'real-candidate'), false);
});

test('wall both ways: demo sees only demo, real never sees demo accounts or starter samples (founder, 2026-11-23)', () => {
  const sampleDb = {
    users: [
      ...db.users,
      { id: 'real-candidate-2', role: 'candidate' },
      { id: 'sample-candidate', role: 'candidate', sample: true, sampleFor: 'real-employer' },
    ],
    jobs: [
      { id: 'real-job', employerId: 'real-employer' },
      { id: 'demo-job', employerId: 'demo-employer', demo: true },
      { id: 'sample-job', employerId: 'demo-employer', sample: true, sampleFor: 'real-candidate' },
    ],
    swipes: [
      ...db.swipes,
      { id: 'sample-like-swipe', actorId: 'sample-candidate', targetType: 'job', targetId: 'real-job' },
      { id: 'sample-employer-like', actorId: 'demo-employer', targetType: 'candidate', targetId: 'real-candidate' },
    ],
    matches: db.matches,
  };
  const pool = (id) => matchingPool(sampleDb, sampleDb.users.find((u) => u.id === id));
  // Real candidate: no demo recruiter, no starter role made "for" them, no swipe from a demo account.
  const realPool = pool('real-candidate');
  assert.ok(!realPool.jobIds.has('sample-job'), 'starter role is hidden from the candidate it was made for');
  assert.ok(!realPool.userIds.has('demo-employer'), 'the demo recruiter behind it is not reachable');
  assert.ok(!realPool.swipes.some((s) => s.id === 'sample-employer-like'), 'the demo recruiter\'s like is hidden');
  assert.ok(realPool.users.every((u) => u.demo !== true && u.sample !== true), 'only real people');
  assert.ok(realPool.jobs.every((j) => j.demo !== true && j.sample !== true), 'only real roles');
  // Real recruiter: no invented starter candidate, no swipe from one.
  const employerPool = pool('real-employer');
  assert.ok(!employerPool.userIds.has('sample-candidate'), 'starter candidate is hidden');
  assert.ok(!employerPool.swipes.some((s) => s.id === 'sample-like-swipe'), 'its like is hidden');
  // Demo accounts: only demo people and demo roles, never real ones or samples.
  for (const id of ['demo-employer', 'demo-candidate']) {
    const demoPool = pool(id);
    assert.ok(demoPool.users.every((u) => u.demo === true), `${id} sees only demo accounts`);
    assert.ok(!demoPool.jobIds.has('sample-job') && !demoPool.jobIds.has('real-job'), `${id} sees only demo roles`);
  }
});
