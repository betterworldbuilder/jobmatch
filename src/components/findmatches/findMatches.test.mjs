// "Find your Matches" studio: pure rules + server-side render checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const job = (id, score, extra = {}) => ({
  id, employerId: `e-${id}`, title: `Role ${id}`, company: `Company ${id}`, logo: '', accent: '#123456', location: 'Da Nang',
  workMode: 'Hybrid', salary: `$${score}00/mo`, type: 'Full-time', experienceLevel: 'Senior', requiredSkills: ['React', 'Node'], requiredLanguages: [],
  description: 'Build the app.', mission: '', culture: ['Async'], responseTime: '', applicants: 0, status: 'active',
  match: { score, matchedSkills: ['React'], matchedLanguages: [], experienceFit: true }, ...extra,
});
const person = (id, score, extra = {}) => ({
  id, role: 'candidate', name: `Lan ${id}`, title: 'Frontend Engineer', photo: `https://x/${id}.jpg`, skills: ['React', 'Go'], languages: ['English'],
  experienceLevel: 'Senior', match: { score, matchedSkills: ['React'], matchedLanguages: [], experienceFit: true }, ...extra,
});
const viewer = (role = 'candidate', extra = {}) => ({ id: 'me', name: 'Minh', role, title: '', photo: '', skills: [], languages: [], experienceLevel: '', ...extra });
const data = (extra = {}) => ({ viewer: viewer(), jobs: [], candidates: [], matches: [], messages: [], calls: [], notes: [], bookmarkedIds: [], likesRemaining: 5, ...extra });

const logic = () => loadTsx(new URL('./fmLogic.ts', import.meta.url)).then((r) => r.mod);

test('job card: real facts only, salary-hidden wording, skills slide with matched highlight', async () => {
  const { jobCard, slideCount } = await logic();
  const card = jobCard(job('a', 91, { distanceKm: 6, verified: true, likedYou: true }));
  assert.equal(card.name, 'Role a');
  assert.equal(card.verified, true);
  assert.equal(card.signal, 'liked');
  assert.deepEqual(card.facts.map((f) => f.text), ['Company a · Senior', 'Da Nang · 6 km away', '$9100/mo', '91% fit']);
  assert.equal(card.slides[0].title, 'Skills');
  assert.deepEqual(card.slides[0].highlight, ['React']);
  assert.equal(slideCount(card), 1 + card.slides.length);
  const hidden = jobCard(job('b', undefined, { salaryHidden: true, workMode: 'Remote', match: { matchedSkills: [], matchedLanguages: [], experienceFit: true } }));
  assert.ok(hidden.facts.some((f) => f.text === 'Salary shown when you match'));
  assert.ok(hidden.facts.some((f) => f.text === 'Remote'));
  assert.ok(!hidden.facts.some((f) => /undefined|NaN|fit/.test(f.text)));
});

test('person card: age only when public, interests slide, no invented values', async () => {
  const { personCard } = await logic();
  const now = new Date('2026-11-21').getTime();
  const pub = personCard(person('p', 88, { birthdate: '1996-01-01', agePrivacy: 'public', interests: ['Hiking'], city: 'Hue' }), now);
  assert.equal(pub.age, 30);
  assert.ok(pub.slides.some((s) => s.title === 'Interests'));
  assert.ok(pub.facts.some((f) => f.text === 'Hue'));
  const priv = personCard(person('q', 70, { birthdate: '1996-01-01', agePrivacy: 'after-match' }), now);
  assert.equal(priv.age, undefined);
});

test('keyboard map matches the hint bar', async () => {
  const { studioKey } = await logic();
  assert.equal(studioKey('ArrowLeft'), 'pass');
  assert.equal(studioKey('ArrowRight'), 'like');
  assert.equal(studioKey('ArrowUp'), 'open');
  assert.equal(studioKey('ArrowDown'), 'close');
  assert.equal(studioKey('Enter'), 'super');
  assert.equal(studioKey(' '), 'next');
  assert.equal(studioKey('Backspace'), 'undo');
  assert.equal(studioKey('a'), null);
});

test('goal tiles map to real filters; both roles get Get Verified', async () => {
  const { goalTiles } = await logic();
  const cand = goalTiles('candidate');
  assert.deepEqual(cand.find((t) => t.id === 'remote').filter, { filterMode: 'Remote' });
  assert.deepEqual(cand.find((t) => t.id === 'topfit').filter, { minScore: 90 });
  for (const role of ['candidate', 'employer']) assert.ok(goalTiles(role).some((t) => t.verify && t.label === 'Get Verified'));
});

test('sidebar lists: matches newest first, conversations only with messages', async () => {
  const { sidebarLists } = await logic();
  const m1 = { id: 'm1', candidateId: 'me', employerId: 'e1', jobId: 'a', stage: 'Matched', createdAt: 10, candidate: viewer(), employer: { id: 'e1', name: 'Kim Le', photo: 'https://x/k.jpg' }, job: job('a', 80) };
  const m2 = { ...m1, id: 'm2', createdAt: 20, employer: undefined, job: job('b', 70) };
  const lists = sidebarLists({ viewer: viewer(), matches: [m1, m2], messages: [{ id: 'x', matchId: 'm1', senderId: 'e1', text: 'Hi', createdAt: 30 }] });
  assert.deepEqual(lists.matches.map((r) => r.matchId), ['m1', 'm2']);
  assert.deepEqual(lists.conversations.map((r) => r.name), ['Kim Le']);
  assert.equal(lists.matches[1].name, 'Company b');
});

test('verification state', async () => {
  const { verificationState } = await logic();
  assert.equal(verificationState(viewer()), 'none');
  assert.equal(verificationState(viewer('candidate', { verification: { status: 'pending', submittedAt: 1 } })), 'pending');
  assert.equal(verificationState(viewer('candidate', { photoVerified: true })), 'verified');
});

async function render(props) {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./FindMatches.tsx', import.meta.url));
  return renderToStaticMarkup(React.createElement(mod.FindMatches, { setData: () => undefined, navigate: () => undefined, ...props }));
}

test('desktop studio: sidebar icons, empty Start Matching, card, 5 actions, key bar', async () => {
  const html = await render({ role: 'candidate', data: data({ jobs: [job('a', 70), job('b', 91, { verified: true }), job('c', 80)] }) });
  assert.match(html, /id="td-new-matches"/);
  assert.match(html, /Find your Matches/);
  for (const label of ['Matches and messages', 'Find by goal', 'Safety center', 'Rewind', 'Nope', 'Super Like', 'Like', 'Safety Toolkit', 'Open profile'])
    assert.match(html, new RegExp(`aria-label="${label}`));
  assert.match(html, /First impression: Super Like with a note/);
  assert.match(html, /Start Matching/);
  assert.match(html, /Role b/);
  assert.match(html, /aria-label="Verified"/);
  for (const key of ['Nope', 'Like', 'Open Profile', 'Close Profile', 'Super Like', 'Next Photo']) assert.match(html, new RegExp(`</kbd>${key}<`));
  assert.match(html, /1 \/ 3/);
});

test('headhunter studio shows candidates and their names', async () => {
  const html = await render({ role: 'employer', data: data({ viewer: viewer('employer'), candidates: [person('a', 92), person('b', 85)] }) });
  assert.match(html, /Lan a/);
  assert.match(html, /92% fit/);
});

test('no likes left: like, super like and first impression are disabled; nope is not', async () => {
  const html = await render({ role: 'candidate', data: data({ jobs: [job('a', 70)], likesRemaining: 0 }) });
  assert.match(html, /disabled="" aria-label="Like"/);
  assert.match(html, /disabled="" aria-label="Super Like"/);
  assert.match(html, /disabled="" aria-label="First impression/);
  assert.doesNotMatch(html, /disabled="" aria-label="Nope"/);
  assert.match(html, /No likes left today/);
});

test('empty deck', async () => {
  const html = await render({ role: 'candidate', data: data() });
  assert.match(html, /You’ve seen today’s top picks/);
  assert.match(html, /0 \/ 0/);
});

test('feature flag: off by default, ?fm=1 turns it on', async () => {
  const { mod } = await loadTsx(new URL('../../lib/flags.ts', import.meta.url));
  assert.equal(mod.featureOn('findMatches', ''), false);
  assert.equal(mod.featureOn('findMatches', '?fm=1'), true);
  assert.equal(mod.featureOn('findMatches', '?fm=0'), false);
});
