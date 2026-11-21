import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from './seed.js';

/* Demo fill: every demo profile has something in every section, and nothing
 * leaks onto real users. */

test('every demo candidate has matches, conversations, a recruiter like and a full profile', () => {
  const seed = createSeed();
  const candidates = seed.users.filter((u) => u.demo && u.role === 'candidate');
  for (const c of candidates) {
    const matches = seed.matches.filter((m) => m.candidateId === c.id);
    assert.ok(matches.length >= 2, `${c.name} has matches`);
    assert.ok(seed.messages.some((msg) => matches.some((m) => m.id === msg.matchId)), `${c.name} has conversations`);
    const likers = seed.swipes.filter((s) => s.targetType === 'candidate' && s.targetId === c.id && !matches.some((m) => m.employerId === s.actorId));
    assert.ok(likers.length >= 1 || c.id === 'candidate-demo', `${c.name} has recruiters who like them`);
    assert.ok(c.headline && c.workExperience?.length && c.education?.length, `${c.name} profile filled`);
    assert.ok(c.completeness >= 80, `${c.name} completeness ${c.completeness}`);
  }
});

test('every demo recruiter job with a full set has matches and incoming likes', () => {
  const seed = createSeed();
  for (const jobId of ['j-2', 'j-6', 'j-google-frontend', 'j-stripe-backend', 'j-netflix-data', 'j-spotify-design', 'j-shopify-eng-manager']) {
    assert.ok(seed.matches.filter((m) => m.jobId === jobId).length >= 2, `${jobId} matches`);
    assert.ok(seed.swipes.some((s) => s.targetType === 'job' && s.targetId === jobId && !seed.matches.some((m) => m.jobId === jobId && m.candidateId === s.actorId)), `${jobId} candidate likes`);
  }
});

test('no half-made matches: two-way likes always have a match record', () => {
  const seed = createSeed();
  const jobs = new Map(seed.jobs.map((j) => [j.id, j]));
  for (const s of seed.swipes.filter((x) => x.targetType === 'job' && x.direction === 'like' && x.id.startsWith('ds-'))) {
    const employerId = jobs.get(s.targetId)?.employerId;
    const back = seed.swipes.some((x) => x.actorId === employerId && x.targetType === 'candidate' && x.targetId === s.actorId);
    if (back) assert.ok(seed.matches.some((m) => m.candidateId === s.actorId && m.employerId === employerId), `${s.actorId} ↔ ${employerId}`);
  }
});

test('demo matches have hiring-stage timelines with rounds, people and dates; ids are unique', () => {
  const seed = createSeed();
  for (const m of seed.matches.filter((x) => x.demoTemplate)) {
    assert.ok(m.pipeline?.length >= 4, `${m.id} has a timeline`);
    assert.equal(m.pipeline.at(-1).kind, 'hired');
    assert.ok(m.pipeline.filter((s) => s.id.startsWith('round-')).every((s) => s.owner && /^\d{4}-\d{2}-\d{2}$/.test(s.date)));
    assert.ok(m.pipeline.some((s) => s.id === m.currentStepId));
  }
  for (const key of ['swipes', 'matches', 'messages', 'calls']) {
    const ids = seed[key].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `${key} ids unique`);
  }
  assert.ok(seed.users.every((u) => u.demo), 'seed only holds demo users');
});
