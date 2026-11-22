// Deck rules + useDiscoverDeck hook (shared by Discover and the home phone deck).
// Run: npm test (node --test). The hook is bundled with esbuild and rendered with react-dom/server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, considerList, filtersActive, needsScreening, showsCommute, swipeFromDrag, swipeFromKey, withoutSkipped } from './deckLogic.ts';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const job = (id, score, extra = {}) => ({ id, title: `Role ${id}`, company: `Co ${id}`, location: 'Ho Chi Minh City', workMode: 'Hybrid', type: 'Full-time', experienceLevel: 'Mid', salary: '$3k', requiredSkills: ['React'], match: { score, matchedSkills: ['React'], matchedLanguages: [], experienceFit: true }, ...extra });
const noFilters = { radius: 100, query: '', filterMode: '', filterType: '', minScore: 0 };

test('candidate deck holds every available role, best fit first (no Top 3 cut)', () => {
  const { filtered, deck } = buildDeck('candidate', [job('a', 50), job('b', 90), job('c', 70), job('d', 80)], noFilters);
  assert.deepEqual(filtered.map((j) => j.id), ['b', 'd', 'c', 'a']);
  assert.deepEqual(deck.map((j) => j.id), ['b', 'd', 'c', 'a']);
});

test('active filters narrow the deck', () => {
  const filters = { ...noFilters, query: 'role b' };
  assert.equal(filtersActive(filters), true);
  const { deck } = buildDeck('candidate', [job('a', 50), job('b', 90), job('c', 70), job('d', 80)], filters);
  assert.deepEqual(deck.map((j) => j.id), ['b']);
});

test('default distance is "any"; a set limit gates place-based roles but never remote ones', () => {
  const items = [job('near', 60, { distanceKm: 5 }), job('far', 90, { distanceKm: 80 }), job('remote', 70, { workMode: 'Remote', distanceKm: 900 })];
  assert.equal(buildDeck('candidate', items, noFilters).filtered.length, 3, 'any distance shows all');
  const { filtered } = buildDeck('candidate', items, { ...noFilters, radius: 25 });
  assert.deepEqual(filtered.map((j) => j.id), ['remote', 'near']);
});

test('min score, work mode and type filters apply', () => {
  const items = [job('a', 90, { type: 'Contract' }), job('b', 85), job('c', 40)];
  assert.deepEqual(buildDeck('candidate', items, { ...noFilters, minScore: 50 }).filtered.map((j) => j.id), ['a', 'b']);
  assert.deepEqual(buildDeck('candidate', items, { ...noFilters, filterType: 'Contract' }).filtered.map((j) => j.id), ['a']);
  assert.deepEqual(buildDeck('candidate', items, { ...noFilters, filterMode: 'Remote' }).filtered.map((j) => j.id), []);
});

test('recruiter deck is not cut to 3', () => {
  const people = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `P${n}`, title: 'Dev', skills: [], match: { score: 90 - n } }));
  assert.equal(buildDeck('employer', people, noFilters).deck.length, 4);
});

test('a plain like on a job with screening questions needs the form; super like and pass do not', () => {
  const screened = job('s', 80, { screeningQuestions: ['Why us?'] });
  assert.equal(needsScreening('candidate', screened, 'like', false), true);
  assert.equal(needsScreening('candidate', screened, 'like', true), false);
  assert.equal(needsScreening('candidate', screened, 'pass', false), false);
  assert.equal(needsScreening('candidate', job('n', 80), 'like', false), false);
});

test('drag release: 110px or a fast flick swipes; up is super like; small drags spring back', () => {
  assert.equal(swipeFromDrag({ x: 120, y: 0 }, { x: 0, y: 0 }), 'like');
  assert.equal(swipeFromDrag({ x: -120, y: 0 }, { x: 0, y: 0 }), 'pass');
  assert.equal(swipeFromDrag({ x: 30, y: 0 }, { x: 700, y: 0 }), 'like');
  assert.equal(swipeFromDrag({ x: -30, y: 0 }, { x: -700, y: 0 }), 'pass');
  assert.equal(swipeFromDrag({ x: 10, y: -130 }, { x: 0, y: 0 }), 'super');
  assert.equal(swipeFromDrag({ x: 50, y: 20 }, { x: 100, y: 0 }), null);
});

test('arrow keys and Backspace map to deck actions; other keys are ignored', () => {
  assert.equal(swipeFromKey('ArrowLeft'), 'pass');
  assert.equal(swipeFromKey('ArrowRight'), 'like');
  assert.equal(swipeFromKey('ArrowUp'), 'super');
  assert.equal(swipeFromKey('Backspace'), 'undo');
  assert.equal(swipeFromKey('a'), null);
});

test('consider list drops the current card and keeps at most 5', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => job(id, 90 - i));
  const deck = items.slice(0, 3);
  assert.deepEqual(considerList(items, deck, 0).map((j) => j.id), ['b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(considerList(items, [], 0, 2).map((j) => j.id), ['a', 'b']);
});

test('consider list also drops deck cards already swiped', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => job(id, 90 - i));
  assert.deepEqual(considerList(items, items.slice(0, 3), 1).map((j) => j.id), ['c', 'd', 'e']);
  // Deck finished: nothing seen comes back.
  assert.deepEqual(considerList(items, items.slice(0, 3), 3).map((j) => j.id), ['d', 'e']);
});

test('withoutSkipped removes cards liked from the list and keeps the order', () => {
  const deck = ['a', 'b', 'c'].map((id, i) => job(id, 90 - i));
  assert.deepEqual(withoutSkipped(deck, ['b']).map((j) => j.id), ['a', 'c']);
  assert.equal(withoutSkipped(deck, []), deck);
});

test('commute shows only for non-remote roles with a distance', () => {
  assert.equal(showsCommute(job('a', 1, { distanceKm: 4 })), true);
  assert.equal(showsCommute(job('a', 1, { workMode: 'Remote', distanceKm: 4 })), false);
  assert.equal(showsCommute(job('a', 1)), false);
});

test('useDiscoverDeck starts at the first card of the full deck', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./useDiscoverDeck.ts', import.meta.url));
  const data = { viewer: { id: 'me' }, jobs: [job('a', 50), job('b', 90), job('c', 70), job('d', 80)], candidates: [], likesRemaining: 5 };
  let state;
  function Probe() { state = mod.useDiscoverDeck('candidate', data, () => undefined); return null; }
  renderToStaticMarkup(React.createElement(Probe));
  assert.equal(state.index, 0);
  assert.equal(state.current.id, 'b');
  assert.equal(state.next.id, 'd');
  assert.equal(state.deck.length, 4);
  assert.equal(state.filtered.length, 4);
  assert.equal(state.busy, false);
  assert.equal(state.filtersActive, false);
});

test('useDiscoverDeck: recruiters see every candidate by default (no fit filter, any distance)', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./useDiscoverDeck.ts', import.meta.url));
  const data = { viewer: { id: 'me' }, jobs: [], candidates: [{ id: 'p1', name: 'A', skills: [], match: { score: 85 } }, { id: 'p2', name: 'B', skills: [], match: { score: 60 }, distanceKm: 900 }], likesRemaining: 5 };
  let state;
  function Probe() { state = mod.useDiscoverDeck('employer', data, () => undefined); return null; }
  renderToStaticMarkup(React.createElement(Probe));
  assert.equal(state.minScore, 0);
  assert.deepEqual(state.deck.map((p) => p.id), ['p1', 'p2']);
});

test('useDiscoverDeck: a card liked from the list is not shown again later in the deck', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./useDiscoverDeck.ts', import.meta.url));
  const data = { viewer: { id: 'me' }, jobs: [job('a', 50), job('b', 90), job('c', 70), job('d', 80)], candidates: [], likesRemaining: 5 };
  let state;
  function Probe() { state = mod.useDiscoverDeck('candidate', data, () => undefined, { skipIds: ['d'] }); return null; }
  renderToStaticMarkup(React.createElement(Probe));
  // The full deck (b, d, c, a) minus d.
  assert.deepEqual(state.deck.map((j) => j.id), ['b', 'c', 'a']);
  assert.equal(state.current.id, 'b');
  assert.equal(state.next.id, 'c');
  assert.equal(state.filtered.length, 4);
});
