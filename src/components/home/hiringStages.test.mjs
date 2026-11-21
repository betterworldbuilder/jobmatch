// Hiring Stages: timeline rules + page render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const lib = () => loadTsx(new URL('../../lib/hiringStages.ts', import.meta.url)).then((r) => r.mod);

test('default steps follow the job process: match → rounds → offer → hired', async () => {
  const { defaultSteps } = await lib();
  const steps = defaultSteps({ interviewProcess: ['Recruiter screen', 'Coding interview', 'Meet the CTO'] });
  assert.deepEqual(steps.map((s) => s.kind), ['match', 'hr', 'technical', 'manager', 'offer', 'hired']);
  assert.equal(defaultSteps({}).length, 6, '3 standard rounds when the job has none');
});

test('timeline: round numbers, states, finish line and summary', async () => {
  const { timeline, summary, formatDay } = await lib();
  const pipeline = [
    { id: 'match', name: 'Mutual match', owner: '', kind: 'match' },
    { id: 'r1', name: 'HR screening call', owner: 'Kim', kind: 'hr', date: '2026-11-24' },
    { id: 'r2', name: 'Technical interview', owner: 'Minh', kind: 'technical' },
    { id: 'offer', name: 'Offer', owner: '', kind: 'offer' },
    { id: 'hire', name: 'Hired', owner: '', kind: 'hired' },
  ];
  const t = timeline({ pipeline, currentStepId: 'r2' });
  assert.equal(t.rounds, 2);
  assert.deepEqual(t.steps.map((s) => s.state), ['done', 'done', 'current', 'upcoming', 'upcoming']);
  assert.equal(t.steps[4].finish, true);
  assert.equal(summary({ pipeline, currentStepId: 'r2' }), 'Round 2 of 2 · Technical interview');
  assert.equal(summary({ pipeline, currentStepId: 'hire' }), 'Hired — finish line reached');
  assert.equal(formatDay('2026-11-24'), 'Tue, Nov 24');
  assert.equal(formatDay('bad'), '');
});

test('page: recruiter sees each candidate timeline with rounds, people and dates', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./HiringStages.tsx', import.meta.url));
  const job = { id: 'j', employerId: 'me', title: 'Backend Engineer', company: 'Stripe', logo: '', accent: '#000', location: '', workMode: 'Remote', salary: '', type: 'Full-time', experienceLevel: '', requiredSkills: [], requiredLanguages: [], description: '', mission: '', culture: [], responseTime: '', applicants: 0, status: 'active', match: { score: 1, matchedSkills: [], matchedLanguages: [], experienceFit: true } };
  const match = { id: 'm', candidateId: 'c', employerId: 'me', jobId: 'j', stage: 'Interview', createdAt: 1, job, candidate: { id: 'c', name: 'Lan Tran', title: 'Engineer', photo: '' },
    pipeline: [{ id: 'match', name: 'Mutual match', owner: '', kind: 'match' }, { id: 'r1', name: 'HR screening call', owner: 'Priya Nair, Talent Partner', kind: 'hr', date: '2026-11-24', format: 'Video, 30 min' }, { id: 'offer', name: 'Offer', owner: '', kind: 'offer' }, { id: 'hire', name: 'Hired', owner: '', kind: 'hired' }], currentStepId: 'r1' };
  const data = { viewer: { id: 'me', role: 'employer', name: 'Priya' }, jobs: [], candidates: [], matches: [match], messages: [], calls: [], notes: [], bookmarks: [], bookmarkedIds: [], likesRemaining: 5 };
  const html = renderToStaticMarkup(React.createElement(mod.HiringStages, { data, setData: () => undefined, onOpenMessages: () => undefined }));
  for (const text of ['Hiring Stages', 'Lan Tran', 'Round 1', 'HR screening call', 'Priya Nair, Talent Partner', 'Tue, Nov 24', 'Video, 30 min', 'Finish line', 'Round 1 of 1 · HR screening call'])
    assert.ok(html.includes(text), `shows ${text}`);
  assert.match(html, /aria-label="Edit rounds"/);
  const asCandidate = renderToStaticMarkup(React.createElement(mod.HiringStages, { data: { ...data, viewer: { id: 'c', role: 'candidate', name: 'Lan' } }, setData: () => undefined, onOpenMessages: () => undefined }));
  assert.doesNotMatch(asCandidate, /Edit rounds/, 'candidates read only');
});
