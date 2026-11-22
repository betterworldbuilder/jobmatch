import test from 'node:test';
import assert from 'node:assert/strict';
import { coursera, refreshPlan, skillPlan } from '../../lib/interviewPrep.ts';

const match = { job: { title: 'Data Engineer', company: 'Acme', requiredSkillsDetail: [{ name: 'Python', weight: 3 }, { name: 'Spark', weight: 3 }, { name: 'SQL', weight: 2 }], niceToHaves: ['dbt'], requiredLanguages: ['English'] } };

test('interview preparation: skills split into have / refresh, case-insensitive', () => {
  const p = skillPlan(match, ['python', 'SQL']);
  assert.deepEqual(p.must, [{ skill: 'Python', have: true }, { skill: 'Spark', have: false }, { skill: 'SQL', have: true }]);
  assert.deepEqual(p.nice, [{ skill: 'dbt', have: false }]);
  assert.deepEqual(p.languages, ['English']);
});

test('refresh plan: must-have gaps first, then nice-to-haves, then a rehearsal week; Coursera links encode the skill', () => {
  const plan = refreshPlan(match, ['Python', 'SQL']);
  assert.deepEqual(plan.map((w) => w.skill), ['Spark', 'dbt', 'Interview rehearsal']);
  assert.equal(plan[0].must, true); assert.equal(plan[1].must, false);
  assert.match(plan[2].tasks[0], /Python, SQL/);
  assert.equal(coursera('CI/CD'), 'https://www.coursera.org/search?query=CI%2FCD');
});
