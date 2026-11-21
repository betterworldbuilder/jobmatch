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
  for (const label of ['Undo last swipe', 'Pass', 'Super Like', 'Like']) assert.match(html, new RegExp(`aria-label="${label}"`));
  // JobsMatchNow logo at the top of the phone.
  assert.match(html, /nm-brand.*<b>Jobs<\/b><b>Match<\/b><b>Now<\/b>/);
  // Top card is the best score, with salary, fit reason from real skills + score, and distance.
  assert.match(html, /Role b/);
  assert.match(html, /\$9100\/mo/);
  assert.match(html, /Matches your React, TypeScript, Node · 91%/);
  assert.match(html, /6 km away/);
  assert.match(html, /Full role/);
});

test('"Recommended Roles" lists the sorted list minus the current card', async () => {
  const html = await render(baseData([job('a', 70), job('b', 91), job('c', 80), job('d', 60)]));
  assert.match(html, /id="td-recommended" aria-label="Recommended Roles"/);
  assert.ok(!/should consider/i.test(html), 'old label is gone');
  const list = html.slice(html.indexOf('Recommended Roles</h3>'));
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

test('card photo: cover image first, then the hiring contact photo; third-party logos are not shown', async () => {
  const { mod } = await loadTsx(new URL('./NewMatchesSection.tsx', import.meta.url));
  assert.equal(mod.cardPhoto(job('a', 1, { coverImage: '/uploads/c.jpg', recruiter: { photo: 'https://x/p.jpg' } })), '/uploads/c.jpg');
  assert.equal(mod.cardPhoto(job('a', 1, { recruiter: { photo: 'https://x/p.jpg' } })), 'https://x/p.jpg');
  assert.equal(mod.cardPhoto(job('a', 1)), '');
  assert.equal(mod.ownLogo(job('a', 1, { companyLogo: 'https://logo.clearbit.com/aws.amazon.com' })).companyLogo, undefined);
  assert.equal(mod.ownLogo(job('a', 1, { companyLogo: '/uploads/logo.png' })).companyLogo, '/uploads/logo.png');
  const html = await render(baseData([job('a', 70, { companyLogo: 'https://logo.clearbit.com/aws.amazon.com', recruiter: { name: 'Kim Le', title: 'Talent lead', photo: 'https://x/kim.jpg' } }), job('b', 60, { companyLogo: 'https://logo.clearbit.com/aws.amazon.com' })]));
  assert.ok(!/clearbit/.test(html), 'no third-party logo image');
  assert.match(html, /kim\.jpg/);
  assert.match(html, /Hiring: Kim Le · Talent lead/);
});

test('"It\'s a Match!" in the phone: both faces, heart, Let\'s Talk and Keep swiping, real names only', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./NewMatchesSection.tsx', import.meta.url));
  const viewer = { id: 'me', name: 'Lan Tran', title: 'Frontend Engineer', photo: 'https://x/lan.jpg', role: 'candidate' };
  const match = { id: 'm1', candidateId: 'me', employerId: 'e1', jobId: 'a', stage: 'Matched', createdAt: 1, candidate: viewer,
    employer: { id: 'e1', name: 'Minh Pham', title: 'CTO', photo: 'https://x/minh.jpg' }, job: job('a', 70, { companyLogo: 'https://logo.clearbit.com/aws.amazon.com' }) };
  const html = renderToStaticMarkup(React.createElement(mod.PhoneMatch, { match, viewer, onTalk: () => undefined, onKeepSwiping: () => undefined }));
  assert.match(html, /It’s a Match!/);
  assert.match(html, /You and Minh have mutually matched/);
  assert.match(html, /lan\.jpg/);
  assert.match(html, /minh\.jpg/);
  assert.match(html, /nm-match-heart/);
  assert.match(html, /Let’s Talk/);
  assert.match(html, /Keep swiping/);
  assert.ok(!/clearbit|aws/i.test(html));
  // No employer on record: company initial and the role title, never an invented person.
  const bare = renderToStaticMarkup(React.createElement(mod.PhoneMatch, { match: { ...match, employer: undefined }, viewer, onTalk: () => undefined, onKeepSwiping: () => undefined }));
  assert.match(bare, /You and Company have mutually matched/);
  assert.match(bare, /Role a/);
  assert.ok(!/clearbit/.test(bare));
});
