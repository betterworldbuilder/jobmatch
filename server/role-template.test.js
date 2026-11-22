import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from './seed.js';
import { completeDemoRole } from './demo-crowd.js';

/* Role template (founder, 2026-11-22): every demo role carries what the 3 role pages show — full job description,
 * contract duration, start date, nationality rule, languages, must-have + nice-to-have, responsibilities. */
test('every demo role is complete for the role template', () => {
  const seed = createSeed();
  const demo = seed.jobs.filter((j) => j.demo || j.demoTemplate);
  assert.ok(demo.length >= 50, `${demo.length} demo roles`);
  for (const j of demo) {
    assert.ok(j.fullDescription && j.fullDescription.length > 120, `${j.id} full job description`);
    assert.ok(j.contractDuration, `${j.id} contract duration`);
    assert.ok(j.startDate, `${j.id} start date`);
    assert.notEqual(j.workVisaRequired, undefined, `${j.id} nationality / visa rule`);
    assert.ok(j.requiredLanguages?.length, `${j.id} languages`);
    assert.ok((j.requiredSkillsDetail || j.requiredSkills)?.length, `${j.id} skills required`);
    assert.ok(j.niceToHaves?.length, `${j.id} nice to have`);
    assert.ok(j.responsibilities?.length, `${j.id} responsibilities`);
  }
});

test('completing a role only fills empty fields and never overwrites what the recruiter wrote', () => {
  const j = completeDemoRole({ title: 'X', company: 'Y', workMode: 'Remote', type: 'Full-time', fullDescription: 'Mine', startDate: '1 Feb', requiredSkills: ['Go'] }, { benefits: ['Remote work'] });
  assert.equal(j.fullDescription, 'Mine'); assert.equal(j.startDate, '1 Feb');
  assert.equal(j.contractDuration, 'Permanent'); assert.equal(j.workVisaRequired, false);
  assert.deepEqual(j.benefits, ['Remote work']);
  assert.match(completeDemoRole({ title: 'Z', company: 'Q', workMode: 'Remote', requiredSkills: ['Go'] }, null).fullDescription, /demo job description/);
});

test('real (non-demo) roles are never auto-filled', () => {
  const seed = createSeed();
  for (const j of seed.jobs.filter((x) => !x.demo && !x.demoTemplate)) assert.equal(j.contractDuration, undefined, `${j.id} untouched`);
});
