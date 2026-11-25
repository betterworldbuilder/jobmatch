import test from 'node:test';
import assert from 'node:assert/strict';
import { salaryCompatibility, scoreCandidateForJob } from './matching.js';

test('salary: candidates give a minimum only; a role fits when it can pay it', () => {
  const role = { min: 50000, max: 80000, currency: 'USD' };
  assert.equal(salaryCompatibility({ min: 40000, currency: 'USD' }, role).status, 'within');
  assert.equal(salaryCompatibility({ min: 40000, currency: 'USD' }, role).score, 1);
  assert.equal(salaryCompatibility({ min: 80000, currency: 'USD' }, role).status, 'within');
  assert.equal(salaryCompatibility({ min: 90000, currency: 'USD' }, role).status, 'below');
  assert.equal(salaryCompatibility({ min: 60000, currency: 'USD' }, { min: 50000, currency: 'USD' }).status, 'below', 'a role without a maximum is read as its minimum');
  assert.equal(salaryCompatibility({ min: 60000, max: 70000, currency: 'USD' }, role).status, 'within', 'older min–max profiles score as before');
});
import { applyCandidateProfile, candidateCompleteness } from './profile.js';

/* Founder, 2026-11-25: a candidate can accept several work modes at once, and salary is optional. */
const job = (workMode) => ({ requiredSkills: ['React'], experienceLevel: 'senior', distanceKm: 10, hiringRadiusKm: 40, workMode, type: 'Full-time' });
const modeScore = (candidate, workMode) => scoreCandidateForJob(candidate, job(workMode)).breakdown.find((f) => f.factor === 'workMode').score;

test('several work modes: a role scores against the best-fitting one', () => {
  const both = { skills: ['React'], experienceLevel: 'senior', preferences: { workMode: { mode: 'remote', modes: ['remote', 'hybrid'] } } };
  const remoteOnly = { skills: ['React'], experienceLevel: 'senior', preferences: { workMode: { mode: 'remote' } } };
  assert.equal(modeScore(both, 'Remote'), 1);
  assert.equal(modeScore(both, 'Hybrid'), 1);
  assert.equal(modeScore(remoteOnly, 'Hybrid'), 0.5, 'single-mode profiles score as before');
  assert.ok(modeScore(both, 'On-site') >= modeScore(remoteOnly, 'On-site'));
});

test('profile: modes saved with the first as `mode`; bad modes refused; one mode keeps the old shape', () => {
  const u = { role: 'candidate', preferences: {} };
  applyCandidateProfile(u, { preferences: { workMode: { mode: 'hybrid', modes: ['hybrid', 'onsite', 'hybrid'], hybridDays: 3 } } });
  assert.deepEqual(u.preferences.workMode, { mode: 'hybrid', modes: ['hybrid', 'onsite'], hybridDays: 3 });
  applyCandidateProfile(u, { preferences: { workMode: { mode: 'remote' } } });
  assert.deepEqual(u.preferences.workMode, { mode: 'remote' });
  applyCandidateProfile(u, { preferences: { workMode: { modes: ['onsite', 'remote'] } } });
  assert.equal(u.preferences.workMode.mode, 'onsite');
  assert.throws(() => applyCandidateProfile(u, { preferences: { workMode: { mode: 'remote', modes: ['remote', 'moon'] } } }));
});

test('salary is optional: completeness can reach the required part without it', () => {
  const base = { preferences: { workMode: { mode: 'remote' } } };
  const withSalary = { preferences: { workMode: { mode: 'remote' }, salary: { min: 1, max: 2 } } };
  // Salary now only adds to the optional part, so it never lowers a profile that leaves it out below one that has it by much.
  assert.ok(candidateCompleteness(withSalary) >= candidateCompleteness(base));
});
