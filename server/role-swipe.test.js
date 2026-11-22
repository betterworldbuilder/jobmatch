import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMutualMatch } from './matching.js';

/* Recruiters can swipe candidates for one specific role: a like tagged with jobId matches on that role
   when the candidate liked it; otherwise the most recent role the candidate liked is used (old behaviour). */
const jobs = [{ id: 'j1', employerId: 'e1' }, { id: 'j2', employerId: 'e1' }];
const swipes = [
  { actorId: 'c1', targetType: 'job', targetId: 'j1', direction: 'like', createdAt: 1 },
  { actorId: 'c1', targetType: 'job', targetId: 'j2', direction: 'like', createdAt: 2 },
];

test('a recruiter like from the j1 deck matches on j1 even if j2 was liked more recently', () => {
  const m = detectMutualMatch({ actorId: 'e1', targetType: 'candidate', targetId: 'c1', direction: 'like', jobId: 'j1' }, { swipes, jobs });
  assert.deepEqual(m, { candidateId: 'c1', jobId: 'j1', employerId: 'e1' });
});

test('without a role, the most recent liked role is used; a role the candidate did not like falls back too', () => {
  assert.equal(detectMutualMatch({ actorId: 'e1', targetType: 'candidate', targetId: 'c1', direction: 'like' }, { swipes, jobs }).jobId, 'j2');
  assert.equal(detectMutualMatch({ actorId: 'e1', targetType: 'candidate', targetId: 'c1', direction: 'like', jobId: 'j9' }, { swipes, jobs }).jobId, 'j2');
});
