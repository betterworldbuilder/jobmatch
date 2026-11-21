// Home "Look for new matches" section: server-side render checks (no DOM framework needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const job = (id, score, extra = {}) => ({
  id, employerId: `e-${id}`, title: `Role ${id}`, company: `Company ${id}`, logo: '', accent: '#123456', location: 'Da Nang',
  workMode: 'Hybrid', salary: `$${score}00/mo`, type: 'Full-time', experienceLevel: 'Senior', requiredSkills: ['React'], requiredLanguages: [],
  description: '', mission: '', culture: [], responseTime: '', applicants: 0, status: 'active',
  match: { score, matchedSkills: ['React', 'TypeScript', 'Node', 'SQL'], matchedLanguages: [], experienceFit: true }, ...extra,
});
const baseData = (jobs, extra = {}) => ({ viewer: { id: 'me', name: 'Lan', role: 'candidate' }, jobs, candidates: [], matches: [], messages: [], calls: [], notes: [], bookmarkedIds: [], likesRemaining: 5, ...extra });

async function render(data, header) {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./NewMatchesSection.tsx', import.meta.url));
  return renderToStaticMarkup(React.createElement(mod.NewMatchesSection, { data, setData: () => undefined, navigate: () => undefined, header }));
}

test('renders the section, the deck region with a real counter and the 4 deck buttons', async () => {
  const html = await render(baseData([job('a', 70), job('b', 91, { distanceKm: 6 }), job('c', 80, { workMode: 'Remote' }), job('d', 60)]));
  assert.match(html, /id="td-new-matches"/);
  assert.match(html, /role="region" aria-label="New matches deck"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /1 \/ 3/);
  for (const label of ['Undo', 'Pass', 'Super Like', 'Like']) assert.match(html, new RegExp(`aria-label="${label}"`));
  // Top card is the best score, with salary, fit reason from real skills + score, and distance.
  assert.match(html, /Role b/);
  assert.match(html, /\$9100\/mo/);
  assert.match(html, /Matches your React, TypeScript, Node · 91%/);
  assert.match(html, /6 km away/);
  assert.match(html, /Full role/);
});

test('"Jobs you should consider" lists the sorted list minus the current card', async () => {
  const html = await render(baseData([job('a', 70), job('b', 91), job('c', 80), job('d', 60)]));
  const list = html.slice(html.indexOf('Jobs you should consider</h3>'));
  assert.ok(!list.includes('Role b'), 'current card is not repeated in the list');
  assert.ok(list.indexOf('Role c') < list.indexOf('Role a') && list.indexOf('Role a') < list.indexOf('Role d'), 'sorted by score');
  assert.match(list, /aria-label="Like Role c"/);
  assert.match(list, /See all in Discover/);
});

test('shows no made-up numbers copied from the Discover side panel', async () => {
  const html = await render(baseData([job('a', 70)]));
  assert.ok(!/Excellent/.test(html));
  assert.ok(!/verified profile signals/.test(html));
});

test('no score is shown when the match has none', async () => {
  const html = await render(baseData([job('a', undefined, { match: { matchedSkills: ['Go'], matchedLanguages: [], experienceFit: true } })]));
  assert.match(html, /Matches your Go</);
  assert.ok(!/undefined%|NaN/.test(html));
});

test('remote roles say Remote instead of a distance', async () => {
  const html = await render(baseData([job('r', 88, { workMode: 'Remote', distanceKm: 500 })]));
  assert.match(html, />Remote</);
  assert.ok(!/500 km/.test(html));
});

test('when no likes are left, heart and star are disabled and the note shows', async () => {
  const html = await render(baseData([job('a', 70)], { likesRemaining: 0 }));
  assert.match(html, /No likes left today/);
  assert.match(html, /disabled="" aria-label="Super Like"/);
  assert.match(html, /disabled="" aria-label="Like"/);
  assert.doesNotMatch(html, /disabled="" aria-label="Pass"/);
});

test('empty deck and empty list states', async () => {
  const html = await render(baseData([]));
  assert.match(html, /You(&#x27;|')ve seen today(&#x27;|')s top picks/);
  assert.match(html, /Start over/);
  assert.match(html, /Open Discover/);
  assert.match(html, /No more roles right now. Your profile stays visible to matching teams./);
  assert.match(html, /0 \/ 0/);
});

test('renders the title row passed by the home page', async () => {
  const { React } = await loadTsx(new URL('./NewMatchesSection.tsx', import.meta.url));
  const html = await render(baseData([job('a', 70)]), React.createElement('header', null, 'Look for new matches'));
  assert.match(html, /<header>Look for new matches<\/header>/);
});
