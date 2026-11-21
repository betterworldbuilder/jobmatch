// Reports (per-role KPIs, skill gaps, feedback) + AI analyst mock answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const job = (id, title, score, missing, extra = {}) => ({ id, employerId: 'e', title, company: 'Co', requiredSkills: ['React', ...missing], match: { score, matchedSkills: ['React'], missingSkills: missing, matchedLanguages: [], experienceFit: true }, ...extra });
const data = () => ({
  viewer: { id: 'me', role: 'candidate', name: 'Lan', title: 'Backend Engineer', skills: ['React'], preferences: { desiredRoles: ['Backend Engineer', 'Data Engineer'] } },
  jobs: [job('a', 'Senior Backend Engineer', 80, ['Go', 'Kubernetes'], { likedYou: true }), job('b', 'Backend Engineer, Payments', 70, ['Go']), job('c', 'Data Engineer', 60, ['Spark'])],
  candidates: [], calls: [], notes: [], bookmarkedIds: [], likesRemaining: 5,
  matches: [{ id: 'm', candidateId: 'me', employerId: 'e', jobId: 'a', stage: 'Interview', createdAt: 1, job: { id: 'a', title: 'Senior Backend Engineer', company: 'Co' }, employer: { name: 'Kim' }, feedback: [{ text: 'Great system design round.', at: 5, from: 'e' }] }],
  messages: [{ id: 'x', matchId: 'm', senderId: 'e', text: 'hi', createdAt: 2 }],
});

test('per-role KPIs, fit score from the job list, skill gaps with Coursera links, feedback', async () => {
  const { mod: r } = await loadTsx(new URL('../../lib/report.ts', import.meta.url));
  const d = data();
  assert.equal(r.scoreOf(d.matches[0], d), 80, 'score found on the job list');
  const rows = r.roleKpis(d);
  const be = rows.find((x) => x.role === 'Backend Engineer');
  assert.deepEqual([be.roles, be.likedYou, be.matches, be.inConversation, be.interviewing, be.avgFit, be.topGap], [2, 1, 1, 1, 1, 75, 'Go']);
  assert.equal(rows.find((x) => x.role === 'Data Engineer').roles, 1);
  const gaps = r.skillGaps(d);
  assert.equal(gaps[0].skill, 'Go');
  assert.equal(gaps[0].roles, 2);
  assert.equal(gaps[0].course, 'https://www.coursera.org/search?query=Go');
  assert.equal(r.recruiterFeedback(d)[0].text, 'Great system design round.');
});

test('AI analyst mock answers come from the member\'s own data', async () => {
  const { mod } = await loadTsx(new URL('./AiAnalyst.tsx', import.meta.url));
  const d = data();
  assert.match(mod.answer('What are my skill gaps?', d), /Go \(asked in 2 roles\)/);
  assert.match(mod.answer('Any feedback?', d), /Great system design round/);
  assert.match(mod.answer('How is my search going?', d), /1 matches/);
  assert.match(mod.answer('Where can I learn them?', d), /coursera\.org\/search\?query=Go/);
  d.matches[0].job.requiredSkills = ['Go'];
  d.matches[0].pipeline = [{ id: 'r', name: 'Tech', owner: 'Minh Tran, Staff Engineer', kind: 'technical' }];
  d.viewer.recommendations = [{ recruiterName: 'Anh Pham', role: 'Director', company: 'Northstar', text: 'x' }];
  const teach = mod.answer('Who can teach me here?', d);
  assert.match(teach, /Minh Tran, Staff Engineer \(Co\)/);
  assert.match(teach, /Anh Pham, Director at Northstar \(recommended you\)/);
  d.jobs.push({ id: 'z', employerId: 'e', title: 'Frontend Developer', company: 'Zed', requiredSkills: ['React'], match: { score: 90, matchedSkills: ['React'], missingSkills: [], matchedLanguages: [], experienceFit: true } });
  assert.match(mod.answer('Which other roles are the easiest wins?', d), /Frontend Developer at Zed — 90% fit, no missing skills/);
});
