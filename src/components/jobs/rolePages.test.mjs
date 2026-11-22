// Role template (founder, 2026-11-22): 3 pages — 1 summary (recruiter ID stamp + profile link, location, contract +
// duration, start date, salary, work mode, nationality rule, languages, fit), 2 full JD + role details + skills,
// 3 company + benefits. No role photos. Paging keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const job = (over = {}) => ({ id: 'j', employerId: 'e', title: 'Lead AI Engineer', company: 'Acme', logo: 'A', accent: '#000', location: 'Hanoi', workMode: 'Hybrid', hybridDays: 2, salary: '', type: 'Contract', contractDuration: '6 months', startDate: 'As soon as possible', experienceLevel: 'Senior', requiredSkills: ['Python', 'LLM'], requiredLanguages: ['English', 'Vietnamese'], niceToHaves: ['RAG'], description: 'Short', fullDescription: 'About the job\nBuild agents.', mission: '', culture: [], responseTime: '', applicants: 0, status: 'active', openings: 2, coverImage: '/cover.jpg', workVisaRequired: false, authorizedNationalities: { mode: 'custom', custom: ['Vietnam', 'Singapore'] }, salaryRange: { min: 4000, max: 6000, currency: 'USD' }, recruiter: { name: 'Sarah Thompson', title: 'HR Partner', photo: '/sarah.jpg' }, match: { score: 88, matchedSkills: ['Python'], missingSkills: ['LLM'], matchedLanguages: [], experienceFit: true }, ...over });

test('page 1: summary fields, recruiter ID stamp + profile link, no role photo', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./RolePages.tsx', import.meta.url));
  assert.equal(mod.ROLE_PAGES.join(' | '), 'Summary | Job description | Company');
  const html = renderToStaticMarkup(React.createElement(mod.RoleSummaryPage, { job: job(), onRecruiter: () => undefined }));
  for (const t of ['Lead AI Engineer', 'Acme', 'Sarah Thompson', 'See recruiter profile', 'Hanoi', 'Contract · 6 months', 'Start: As soon as possible', 'USD 4,000–6,000', 'Hybrid · 2 office days/week', 'No visa required · open to Vietnam, Singapore', 'English, Vietnamese', 'Matches your Python · 88%']) assert.ok(html.includes(t), `shows ${t}`);
  assert.match(html, /class="rp-stamp"/); assert.match(html, /sarah\.jpg/);
  assert.ok(!html.includes('cover.jpg'), 'role cover photos are not used');
  const hidden = renderToStaticMarkup(React.createElement(mod.RoleSummaryPage, { job: job({ salaryHidden: true, salaryRange: undefined }) }));
  assert.match(hidden, /Salary after a match/);
  assert.equal(mod.visaText(job({ workVisaRequired: true })), 'Valid work visa / right to work required');
});

test('page 2: full JD, role details, skills required, nice to have, then the fit', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./RolePages.tsx', import.meta.url));
  const p2 = renderToStaticMarkup(React.createElement(mod.RoleDetailPage, { job: job({ responsibilities: ['Ship agents'] }), page: 1 }));
  for (const t of ['Build agents.', 'Role details', 'Openings', 'Start date', 'Ship agents', 'Skills required', 'Python', 'Nice to have', 'RAG', 'Your fit']) assert.ok(p2.includes(t), `JD page shows ${t}`);
});

test('page 3: company from the recruiter profile + benefits; missing fields say "Not added yet"', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./RolePages.tsx', import.meta.url));
  const html = renderToStaticMarkup(React.createElement(mod.RoleDetailPage, { job: job({ companyProfile: { about: 'We build AI.', industry: 'Software', benefits: ['Remote work', 'Learning budget'] } }), page: 2 }));
  for (const t of ['We build AI.', 'Software', 'Benefits', 'Remote work', 'Learning budget', 'Not added yet']) assert.ok(html.includes(t), `company page shows ${t}`);
});

test('paging keys: ↓ / PageDown next, PageUp previous, arrows ← → ↑ untouched', async () => {
  const { mod } = await loadTsx(new URL('../swipe/SwipePager.tsx', import.meta.url));
  assert.equal(mod.pageKey('ArrowDown'), 1); assert.equal(mod.pageKey('PageDown'), 1); assert.equal(mod.pageKey('PageUp'), -1);
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) assert.equal(mod.pageKey(k), 0);
});
