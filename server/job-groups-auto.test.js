import test from 'node:test';
import assert from 'node:assert/strict';
import { assignGroupsFromTitles, createGroup, ensureGroups, groupsForTitle } from './groups.js';
import { importScrapedJobs } from './jobfinder.js';

/* Job groups per role (founder, 2026-11-26): Cybersecurity + Marketing, title rules, custom groups with keywords. */
test('new default groups join an existing database once; Cloud is renamed, its link kept', () => {
  const db = { jobGroups: [{ id: 'g-cloud-devops', slug: 'cloud-devops', name: 'Cloud & DevOps', active: true, order: 3 }], jobs: [] };
  ensureGroups(db);
  const ids = db.jobGroups.map((g) => g.id);
  assert.ok(ids.includes('g-security') && ids.includes('g-marketing'));
  assert.equal(db.jobGroups.find((g) => g.id === 'g-cloud-devops').name, 'Cloud, DevOps & SRE');
  assert.equal(db.jobGroups.find((g) => g.id === 'g-cloud-devops').slug, 'cloud-devops');
  const n = db.jobGroups.length; ensureGroups(db); assert.equal(db.jobGroups.length, n, 'added once');
});

test('titles map to groups; custom group keywords count too', () => {
  const db = { jobGroups: [], jobs: [] }; ensureGroups(db);
  assert.deepEqual(groupsForTitle(db, 'Senior SOC Analyst'), ['g-security']);
  assert.deepEqual(groupsForTitle(db, 'Growth Marketing Manager'), ['g-marketing']);
  assert.ok(groupsForTitle(db, 'Senior Data Engineer').includes('g-data'));
  assert.ok(groupsForTitle(db, 'Site Reliability Engineer').includes('g-cloud-devops'));
  assert.deepEqual(groupsForTitle(db, 'Office Manager'), []);
  const sap = createGroup(db, { name: 'SAP', keywords: 'sap, abap, s/4hana' }, 'u1', { custom: true });
  assert.deepEqual(groupsForTitle(db, 'SAP FICO Consultant'), [sap.id]);
  assert.deepEqual(groupsForTitle(db, 'ABAP Developer').includes(sap.id), true);
  assert.equal(groupsForTitle(db, 'Sapphire Store Manager').includes(sap.id), false, 'whole words only');
  assert.equal(sap.slug, 'sap'); assert.equal(sap.custom, true);
});

test('roles without a group get one from the title; a new custom group collects its matching roles', () => {
  const db = { jobGroups: [], jobs: [
    { id: '1', employerId: 'e', title: 'Cloud Security Engineer' },
    { id: '2', employerId: 'e', title: 'Data Analyst', jobGroups: ['g-ai-ml'] },
    { id: '3', employerId: 'e', title: 'SAP Basis Consultant' },
    { id: '4', employerId: 'other', title: 'Data Engineer' },
  ] };
  ensureGroups(db);
  assert.equal(assignGroupsFromTitles(db, 'e'), 1, 'only the role with no group and a match');
  assert.deepEqual(db.jobs[0].jobGroups, ['g-cloud-devops', 'g-security']);
  assert.deepEqual(db.jobs[1].jobGroups, ['g-ai-ml'], 'a chosen group is kept');
  assert.equal(db.jobs[3].jobGroups, undefined, 'other accounts untouched');
  const sap = createGroup(db, { name: 'SAP', keywords: 'sap' }, 'u1', { custom: true });
  assert.equal(assignGroupsFromTitles(db, 'e', { onlyGroupId: sap.id }), 1);
  assert.deepEqual(db.jobs[2].jobGroups, [sap.id]);
});

test('imported roles get their groups from the title when the file names none', () => {
  const db = { users: [{ id: 'jf1', role: 'employer', jobFinder: true }], jobs: [], swipes: [], matches: [], jobGroups: [] };
  ensureGroups(db);
  const r = importScrapedJobs(db, [{ title: 'Penetration Tester', company: 'Acme', location: 'Hanoi', source: { url: 'https://a.example/jobs/77777' } }], { ownerId: 'jf1' });
  assert.deepEqual(db.jobs.find((j) => j.id === r[0].id).jobGroups, ['g-security']);
});
