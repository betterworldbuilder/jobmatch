// Role as 4 pages (founder, 2026-11-22): summary (contract + duration, work mode, location, visa), JD + skills,
// salary (hidden before a match), company (empty fields say "Not added yet"); paging keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const job = (over = {}) => ({ id: 'j', employerId: 'e', title: 'Lead AI Engineer', company: 'Acme', logo: 'A', accent: '#000', location: 'Hanoi', workMode: 'Hybrid', hybridDays: 2, salary: '', type: 'Contract', contractDuration: '6 months', experienceLevel: 'Senior', requiredSkills: ['Python', 'LLM'], requiredLanguages: ['English'], niceToHaves: ['RAG'], description: 'Short', fullDescription: 'About the job\nBuild agents.', mission: '', culture: [], responseTime: '', applicants: 0, status: 'active', workVisaRequired: false, authorizedNationalities: { mode: 'custom', custom: ['Vietnam', 'Singapore'] }, match: { score: 88, matchedSkills: ['Python'], missingSkills: ['LLM'], matchedLanguages: [], experienceFit: true }, ...over });

test('page 1: role, contract + duration, work mode, location, visa & nationality, fit', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./RolePages.tsx', import.meta.url));
  const html = renderToStaticMarkup(React.createElement(mod.RoleSummaryPage, { job: job() }));
  for (const t of ['Lead AI Engineer', 'Contract · 6 months', 'Hybrid · 2 office days/week', 'Hanoi', 'No visa required · open to Vietnam, Singapore', 'Matches your Python · 88%']) assert.ok(html.includes(t), `shows ${t}`);
  assert.equal(mod.visaText(job({ workVisaRequired: true })), 'Valid work visa / right to work required');
  assert.equal(mod.ROLE_PAGES.join(' | '), 'Role summary | Job description | Salary | Company');
});

test('page 2: full JD, must-have, nice-to-have, languages, then the fit; page 3 hides salary before a match', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./RolePages.tsx', import.meta.url));
  const p2 = renderToStaticMarkup(React.createElement(mod.RoleDetailPage, { job: job(), page: 1 }));
  for (const t of ['Build agents.', 'Must have', 'Python', 'Nice to have', 'RAG', 'Languages', 'English', 'Your fit']) assert.ok(p2.includes(t), `JD page shows ${t}`);
  const hidden = renderToStaticMarkup(React.createElement(mod.RoleDetailPage, { job: job({ salaryHidden: true }), page: 2 }));
  assert.match(hidden, /revealed after a mutual match/);
  const shown = renderToStaticMarkup(React.createElement(mod.RoleDetailPage, { job: job({ salaryRange: { min: 4000, max: 6000, currency: 'USD' }, bonus: '10%' }), page: 2 }));
  assert.match(shown, /USD 4,000–6,000/); assert.match(shown, /10%/);
});

test('page 4: company from the recruiter profile; missing fields say "Not added yet"', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./RolePages.tsx', import.meta.url));
  const html = renderToStaticMarkup(React.createElement(mod.RoleDetailPage, { job: job({ companyProfile: { about: 'We build AI.', industry: 'Software' } }), page: 3 }));
  assert.match(html, /We build AI\./); assert.match(html, /Software/); assert.match(html, /Not added yet/);
});

test('paging keys: ↓ / PageDown next, PageUp previous, arrows ← → ↑ untouched', async () => {
  const { mod } = await loadTsx(new URL('../swipe/SwipePager.tsx', import.meta.url));
  assert.equal(mod.pageKey('ArrowDown'), 1); assert.equal(mod.pageKey('PageDown'), 1); assert.equal(mod.pageKey('PageUp'), -1);
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) assert.equal(mod.pageKey(k), 0);
});
