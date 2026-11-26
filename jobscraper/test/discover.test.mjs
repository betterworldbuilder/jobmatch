// Career sites (2026-11-26): job-link detection, keyword filter, RSS feeds, PageGroup reader. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isJobLink, jobLinkScore, jobLinksOnPage, jobsFromFeed, keywordFilter } from '../lib/discover.mjs';
import { readPageGroup } from '../lib/sites.mjs';
import { filterWords, titleFilter } from '../lib/keywords.mjs';

const MP = 'https://www.michaelpage.com.vn/jobs/information-technology';

test('job links: real job pages yes, listing / location / search / login pages no', () => {
  assert.equal(jobLinkScore('/job-detail/senior-data-engineer-fintech/ref/jn-112026-7147149', MP), 2);
  assert.equal(jobLinkScore('https://www.michaelpage.co.uk/jobs/technology/england', 'https://www.michaelpage.co.uk/jobs/technology'), 1, 'weak: location facet');
  for (const bad of ['/jobs/information-technology', '/job-search', '/jobs/it?contract=temp', '/mypage/saved-jobs', 'https://other.example/job-detail/x/ref/1234', '/assets/jobs/logo.png']) assert.equal(isJobLink(bad, MP), false, bad);
  assert.equal(jobLinkScore('https://www.topcv.vn/viec-lam/senior-2d-animation/2354887.html', 'https://www.topcv.vn/viec-lam-it'), 2, 'Vietnamese path word');
  assert.equal(jobLinkScore('https://www.vietnamworks.com/data-engineer-2131687-jd', 'https://www.navigossearch.com/en/jobs'), 2, 'sister site');
});

test('a page with clear job links drops the vague ones; the title is the shortest meaningful link text', () => {
  const html = `<a href="/job-detail/a-role/ref/jn-1-1000001">Save job</a><a href="/job-detail/a-role/ref/jn-1-1000001">Senior Data Engineer</a>
    <a href="/job-detail/b/ref/jn-1-1000002">AI Lead</a><a href="/job-detail/c/ref/jn-1-1000003">Data Scientist</a><a href="/jobs/it/hanoi">Hanoi 12</a>`;
  const links = jobLinksOnPage(html, MP);
  assert.equal(links.length, 3);
  assert.equal(links[0].title, 'Senior Data Engineer');
});

test('keyword filter: whole words, any of them; empty = everything', () => {
  const f = keywordFilter('ai, data, sap');
  assert.equal(f('Senior AI/ML Engineer'), true);
  assert.equal(f('SAP FICO Consultant'), true);
  assert.equal(f('Maintenance Technician'), false, '"ai" inside a word does not count');
  assert.equal(keywordFilter('')('Anything'), true);
});

test('job types: defined words + custom words', () => {
  assert.ok(filterWords({ types: ['fde'] }).includes('forward deployed'));
  const t = titleFilter({ types: ['sap'], custom: 'quant' });
  assert.equal(t('SAP ABAP Developer'), true); assert.equal(t('Quant Researcher'), true); assert.equal(t('Data Engineer'), false);
  assert.equal(titleFilter({ types: [], custom: '' })('Anything'), true);
});

test('same job, other display option in the link = one job; Any job overrides the filter', async () => {
  const { jobKey } = await import('../lib/batch.mjs');
  assert.equal(jobKey(new URL('https://itviec.com/it-jobs/data-engineer-fpt-software-3148?lab_feature=preview_jd_page')), jobKey(new URL('https://itviec.com/it-jobs/data-engineer-fpt-software-3148')));
  assert.notEqual(jobKey(new URL('https://jobs.example.com/view?id=1')), jobKey(new URL('https://jobs.example.com/view?id=2')), 'an id in the query is kept');
  assert.equal(titleFilter({ types: ['any', 'sap'], custom: 'quant' })('Accountant'), true);
});

test('import to JobFinder: drafts via the import key; refused key and missing company reported', async () => {
  const { importToJobFinder, __setPoster } = await import('../lib/jmn-import.mjs');
  process.env.JOBFINDER_IMPORT_KEY = 'k'.repeat(40);
  let sent = null;
  __setPoster(async (url, body) => { sent = { url, body: JSON.parse(body) }; return { status: 200, body: { results: [{ status: 'created', id: 'jf-1' }] } }; });
  const r = await importToJobFinder({ title: 'Data Engineer', company: 'FPT', source: { url: 'https://itviec.com/it-jobs/x-3148' } }, { workersFrom: 'Vietnam' });
  assert.deepEqual(r, { status: 'created', remoteId: 'jf-1' });
  assert.match(sent.url, /\/api\/jobfinder\/import-batch$/); assert.equal(sent.body.jobs[0].workersFrom, 'Vietnam');
  assert.equal((await importToJobFinder({ title: 'X', company: '' })).status, 'failed');
  __setPoster(async () => ({ status: 401, body: {} }));
  assert.match((await importToJobFinder({ title: 'X', company: 'Y' })).message, /refused/);
  __setPoster(null); delete process.env.JOBFINDER_IMPORT_KEY;
});

test('RSS feed: each item is a job with its text', () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>JobServe</title><item><title>Data Engineer - London</title><link>https://www.jobserve.com/gb/en/search-jobs-in-London/DATA-ENGINEER-123ABC/</link><description><![CDATA[<p>Build pipelines</p>]]></description></item></channel></rss>`;
  const items = jobsFromFeed(xml, 'https://www.jobserve.com/MySearch/X.rss');
  assert.equal(items.length, 1); assert.equal(items[0].title, 'Data Engineer - London'); assert.match(items[0].descriptionHtml, /Build pipelines/);
});

test('PageGroup reader: title, facts, confidential client, description block', () => {
  const html = `<h1 class="job-apply-job-title"><span>Senior Data Engineer | Fintech</span></h1>
    <div id="job-description"><p>About Our Client</p><p>Build data pipelines for millions of users.</p></div>
    <dl><dt class="field--label summary-detail-field-label">Location</dt><dd class="summary-detail-field-value">Ho Chi Minh City</dd></dl>
    <dl><dt class="field--label summary-detail-field-label">Contract Type</dt><dd class="summary-detail-field-value"><a>Permanent</a></dd></dl>
    <dl><dt class="field--label summary-detail-field-label">Consultant name</dt><dd class="summary-detail-field-value">Tram Nguyen</dd></dl>
    <dl><dt class="field--label summary-detail-field-label">Job Reference</dt><dd class="summary-detail-field-value">JN-112026-7147149</dd></dl>`;
  const r = readPageGroup(html, 'https://www.michaelpage.com.vn/job-detail/x/ref/jn-112026-7147149');
  assert.equal(r.posting.title, 'Senior Data Engineer | Fintech');
  assert.equal(r.posting.hiringOrganization.name, 'Confidential client (via Michael Page)');
  assert.equal(r.posting.jobLocation[0].address, 'Ho Chi Minh City');
  assert.equal(r.posting.employmentType, 'FULL_TIME');
  assert.equal(r.extra.recruiterName, 'Tram Nguyen'); assert.equal(r.extra.sourceJobId, 'JN-112026-7147149');
  assert.match(r.descriptionHtml, /Build data pipelines/); assert.doesNotMatch(r.descriptionHtml, /Consultant name/);
});
