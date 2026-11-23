// "Search & Filters" rules (founder, 2026-11-24): candidates filter roles, recruiters filter candidates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, activeFilterCount, buildDeck, openToNationality } from './deckLogic.ts';
import { loadTsx } from '../../test-utils/loadTsx.mjs';
const { mod: sheet } = await loadTsx(new URL('./SearchFilters.tsx', import.meta.url));
const { widenStep } = sheet;

const job = (id, extra = {}) => ({ id, title: `Role ${id}`, company: 'Co', location: 'Ho Chi Minh City, Vietnam', country: 'Vietnam', workMode: 'Hybrid', type: 'Full-time', experienceLevel: 'Mid', salary: '', requiredSkills: ['React'], requiredLanguages: ['English'], match: { score: 80, matchedSkills: [], matchedLanguages: [], experienceFit: true }, ...extra });
const person = (id, extra = {}) => ({ id, name: id, title: 'Dev', skills: ['React'], languages: ['English'], experienceLevel: 'Senior', city: 'Da Nang', country: 'Vietnam', match: { score: 80 }, ...extra });
const ids = (r) => r.filtered.map((x) => x.id).sort();
const F = (p) => ({ ...DEFAULT_FILTERS, ...p });

test('defaults hide nothing, and count 0 active filters', () => {
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0);
  assert.equal(buildDeck('candidate', [job('a'), job('b', { workMode: 'Remote' })], DEFAULT_FILTERS).filtered.length, 2);
});

test('candidate distance: limit applies to place-based roles; remote shown unless "include remote" is off', () => {
  const items = [job('near', { distanceKm: 4 }), job('far', { distanceKm: 40 }), job('remote', { workMode: 'Remote', distanceKm: 900 })];
  assert.deepEqual(ids(buildDeck('candidate', items, F({ radius: 10 }))), ['near', 'remote']);
  assert.deepEqual(ids(buildDeck('candidate', items, F({ radius: 10, includeRemote: false }))), ['near']);
  assert.equal(activeFilterCount(F({ radius: 10, includeRemote: false })), 2);
});

test('recruiter distance: candidates without a location are not hidden', () => {
  const items = [person('near', { distanceKm: 3 }), person('far', { distanceKm: 70 }), person('unknown')];
  assert.deepEqual(ids(buildDeck('employer', items, F({ radius: 25 }))), ['near', 'unknown']);
});

test('country or city matches location, city or country', () => {
  const items = [job('vn'), job('sg', { location: 'Singapore', country: 'Singapore' })];
  assert.deepEqual(ids(buildDeck('candidate', items, F({ place: 'singapore' }))), ['sg']);
  assert.deepEqual(ids(buildDeck('employer', [person('a'), person('b', { city: 'Paris', country: 'France' })], F({ place: 'France' }))), ['b']);
});

test('skills: candidates see roles needing ANY chosen skill; recruiters need ALL must-have skills', () => {
  assert.deepEqual(ids(buildDeck('candidate', [job('r'), job('g', { requiredSkills: ['Go'] })], F({ skills: ['go', 'Rust'] }))), ['g']);
  const people = [person('both', { skills: ['React', 'AWS'] }), person('one')];
  assert.deepEqual(ids(buildDeck('employer', people, F({ skills: ['React', 'aws'] }))), ['both']);
});

test('languages: roles must only need chosen languages; candidates must speak all, at the minimum level', () => {
  const roles = [job('en'), job('enfr', { requiredLanguages: ['English', 'French'] })];
  assert.deepEqual(ids(buildDeck('candidate', roles, F({ languages: ['English'] }))), ['en']);
  const people = [person('fluent', { languageDetail: [{ name: 'English', level: 'Fluent' }] }), person('basic', { languageDetail: [{ name: 'English', level: 'Basic' }] }), person('none', { languages: ['Vietnamese'] })];
  assert.deepEqual(ids(buildDeck('employer', people, F({ languages: ['English'] }))), ['basic', 'fluent']);
  assert.deepEqual(ids(buildDeck('employer', people, F({ languages: ['English'], minLanguageLevel: 'fluent' }))), ['fluent']);
});

test('visa: sponsorship, and "open to my nationality" follows the role rule', () => {
  const vn = { nationality: 'Vietnam' };
  assert.equal(openToNationality(job('x', { workVisaRequired: false, authorizedNationalities: { mode: 'europe' } }), vn), false);
  assert.equal(openToNationality(job('x', { workVisaRequired: false, authorizedNationalities: { mode: 'custom', custom: ['vietnam'] } }), vn), true);
  assert.equal(openToNationality(job('x', { workVisaRequired: true, country: 'Vietnam' }), vn), true);
  assert.equal(openToNationality(job('x', { workVisaRequired: true, country: 'Singapore' }), vn), false);
  assert.equal(openToNationality(job('x', { workVisaRequired: true, country: 'Singapore', visaSponsorship: true }), vn), true);
  const roles = [job('spons', { visaSponsorship: true }), job('plain')];
  assert.deepEqual(ids(buildDeck('candidate', roles, F({ visa: 'sponsorship' }))), ['spons']);
});

test('salary fit uses the within/above result only (exact salaries stay hidden)', () => {
  const roles = [job('in', { match: { score: 70, salaryStatus: 'within' } }), job('low', { match: { score: 90, salaryStatus: 'below' } })];
  assert.deepEqual(ids(buildDeck('candidate', roles, F({ salaryFit: true }))), ['in']);
});

test('recruiters: right to work (never nationality as such), sponsorship, experience, availability, open to work', () => {
  const people = [
    person('citizen', { nationality: 'Vietnam' }),
    person('visa', { nationality: 'France', country: 'France', citizenship: ['France'], visaCountries: ['Singapore'], visaSponsorship: true, experienceLevel: 'Mid', availability: '2 weeks', jobStatus: { kind: 'hired' } }),
  ];
  assert.deepEqual(ids(buildDeck('employer', people, F({ rightToWork: 'Singapore' }))), ['visa']);
  assert.deepEqual(ids(buildDeck('employer', people, F({ needsSponsorship: true }))), ['visa']);
  assert.deepEqual(ids(buildDeck('employer', people, F({ experience: 'senior' }))), ['citizen']);
  assert.deepEqual(ids(buildDeck('employer', [person('now', { availability: 'Now' }), people[1]], F({ availability: 'now' }))), ['now']);
  assert.deepEqual(ids(buildDeck('employer', [person('now', { availability: 'Now' }), people[1]], F({ availability: 'month' }))), ['now', 'visa']);
  assert.deepEqual(ids(buildDeck('employer', people, F({ openToWork: true }))), ['citizen']);
});

test('recruiters: work mode and job type now filter candidates', () => {
  const people = [person('remote', { preferences: { workMode: { mode: 'remote' }, employmentTypes: ['Contract'] } }), person('office', { preferences: { workMode: { mode: 'onsite' } } })];
  assert.deepEqual(ids(buildDeck('employer', people, F({ filterMode: 'On-site' }))), ['office']);
  assert.deepEqual(ids(buildDeck('employer', people, F({ filterType: 'Contract' }))), ['office', 'remote'], 'no stated type is not excluded');
});

test('"Widen filters": next distance first, then any fit, then keep only the search', () => {
  assert.equal(widenStep(F({ radius: 5 })).next.radius, 10);
  assert.equal(widenStep(F({ radius: 50 })).label, 'Any distance');
  assert.equal(widenStep(F({ minScore: 70 })).next.minScore, 0);
  const last = widenStep(F({ query: 'react', skills: ['Go'] })).next;
  assert.equal(last.query, 'react'); assert.deepEqual(last.skills, []);
});
