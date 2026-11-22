import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from './seed.js';

/* Coffee invitations go both ways in the demo data: every demo recruiter with matches has invitations
   from candidates, and demo candidates have both received and sent invitations. */
test('demo coffee invitations exist on both sides', () => {
  const seed = createSeed();
  const byMatch = new Map(seed.matches.map((m) => [m.id, m]));
  const calls = seed.calls.filter((c) => byMatch.has(c.matchId));
  const fromCandidates = calls.filter((c) => byMatch.get(c.matchId).candidateId === c.createdBy);
  const fromRecruiters = calls.filter((c) => byMatch.get(c.matchId).employerId === c.createdBy);
  assert.ok(fromCandidates.length >= 40, `candidate-sent invitations: ${fromCandidates.length}`);
  assert.ok(fromRecruiters.length >= 20, `recruiter-sent invitations: ${fromRecruiters.length}`);
  const recruitersWithInvites = new Set(fromCandidates.map((c) => byMatch.get(c.matchId).employerId));
  const crowdRecruiters = seed.users.filter((u) => u.role === 'employer' && /^employer-demo-\d+$/.test(u.id) && Number(u.id.split('-').pop()) >= 7);
  assert.ok(crowdRecruiters.every((r) => recruitersWithInvites.has(r.id)), 'every generated recruiter receives a coffee invitation');
});
