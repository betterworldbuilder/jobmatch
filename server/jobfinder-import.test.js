import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { findImportDuplicate, importKeyOk, importScrapedJobs, scrapedToBody, sourceKey } from './jobfinder.js';

/* Batch import of Scrapy's jobsmatchnow-job/v1 files (2026-11-26). Synthetic accounts and jobs only. */
const KEY = 'k'.repeat(40);
const scraped = (id, extra = {}) => ({
  format: 'jobsmatchnow-job/v1', title: 'Senior Engineer - DevOps', company: 'Buymed', department: null, type: 'Full-time', workMode: null,
  location: 'Ho Chi Minh City, Vietnam', status: 'draft', seniority: 'senior', fullDescription: 'About the Role\nRun our cloud.', description: 'Run our cloud.',
  requiredSkillsDetail: [{ name: 'Docker', weight: 3 }, { name: 'GCP', weight: 2 }], niceToHaves: [], requiredLanguages: [], responsibilities: ['Manage GKE'],
  salaryRange: null, benefits: [], externalUrl: `https://www.linkedin.com/jobs/view/${id}/`, suggestedJobGroups: ['g-none'],
  source: { url: `https://www.linkedin.com/jobs/view/${id}/`, name: 'LinkedIn', method: 'public LinkedIn job page (signed out)' }, review: { check: [] }, ...extra,
});

test('source key: the same LinkedIn job written two ways is one job', () => {
  assert.equal(sourceKey('https://www.linkedin.com/jobs/view/4493082127/?trk=abc'), 'linkedin:4493082127');
  assert.equal(sourceKey('https://linkedin.com/jobs/view/senior-devops-at-buymed-4493082127'), 'linkedin:4493082127');
  assert.equal(sourceKey('https://acme.example/careers/42/'), 'acme.example/careers/42');
});

test('scraped job → form body: nulls and empty lists dropped, source + apply link kept', () => {
  const b = scrapedToBody(scraped('111111'));
  assert.equal(b.workMode, undefined); assert.equal(b.salaryRange, undefined); assert.equal(b.niceToHaves, undefined);
  assert.equal(b.sourceUrl, 'https://www.linkedin.com/jobs/view/111111/'); assert.equal(b.sourceName, 'LinkedIn');
  assert.equal(b.applyUrl, 'https://www.linkedin.com/jobs/view/111111/'); assert.deepEqual(b.jobGroups, ['g-none']);
  assert.equal(b.status, undefined, 'the file status never decides the listing status');
});

test('import: drafts only, duplicates skipped, bad values dropped not fatal, missing title fails alone', () => {
  const db = { users: [{ id: 'jf1', role: 'employer', jobFinder: true, name: 'JobFinder' }], jobs: [], swipes: [], matches: [] };
  const r = importScrapedJobs(db, [
    scraped('222222'),
    { format: 'jobsmatchnow-job/v1', jobs: [scraped('222222', { title: 'Same link again' })] },
    scraped('333333', { title: 'Cloud Engineer', type: 'Gig of the year', seniority: 'galactic' }),
    scraped('343434'), // other link, same title + company + location as the first: guardrail
    scraped('444444', { title: null }),
    scraped('555555', { source: null, externalUrl: null }),
  ], { ownerId: 'jf1' });
  assert.deepEqual(r.map((x) => x.status), ['created', 'duplicate', 'created', 'duplicate', 'failed', 'failed']);
  assert.equal(r[3].id, r[0].id);
  assert.equal(r[1].id, r[0].id);
  assert.deepEqual(r[2].dropped.sort(), ['seniority', 'type']);
  const job = db.jobs.find((j) => j.id === r[0].id);
  assert.equal(job.jobFinder.listingStatus, 'draft'); assert.equal(job.status, 'draft');
  assert.equal(job.employerId, 'jf1'); assert.equal(job.jobFinder.import.sourceJobId, '222222');
  assert.deepEqual(job.requiredSkills, ['Docker', 'GCP']); assert.equal(job.fullDescription, 'About the Role\nRun our cloud.');
  assert.deepEqual(job.jobGroups || [], [], 'unknown group ids are dropped');
  assert.equal(db.jobs.length, 2);
  assert.equal(db.jobs.find((j) => j.id === r[2].id).title, 'Cloud Engineer');
});

test('duplicate guardrail: same link in any form, or same title + company + location', () => {
  const db = { users: [{ id: 'e1', role: 'employer' }], jobs: [
    { id: 'a', employerId: 'e1', status: 'active', title: 'Data Engineer', company: 'Acme', location: 'Hanoi', externalUrl: 'https://www.linkedin.com/jobs/view/777777/?trk=x' },
    { id: 'b', employerId: 'e1', status: 'removed', title: 'Old Role', company: 'Acme', location: 'Hanoi' },
    { id: 'c', employerId: 'e2', status: 'active', title: 'Data Engineer', company: 'Acme', location: 'Hanoi' },
  ] };
  assert.equal(findImportDuplicate(db, 'e1', { urls: ['https://linkedin.com/jobs/view/777777'] })?.id, 'a');
  assert.equal(findImportDuplicate(db, 'e1', { title: 'data engineer', company: 'ACME', location: 'Hanoi ' })?.id, 'a');
  assert.equal(findImportDuplicate(db, 'e1', { title: 'Data Engineer', company: 'Acme', location: 'HCMC' }), null, 'other city = other role');
  assert.equal(findImportDuplicate(db, 'e1', { title: 'Old Role', company: 'Acme', location: 'Hanoi' }), null, 'removed roles do not block');
  assert.equal(findImportDuplicate(db, 'e2', { urls: ['https://linkedin.com/jobs/view/777777'] }), null, 'only the same account');
});

test('import key: off when unset or short, exact match only', () => {
  assert.equal(importKeyOk(`Bearer ${KEY}`, undefined), false);
  assert.equal(importKeyOk('Bearer short', 'short'), false);
  assert.equal(importKeyOk(`Bearer ${KEY}`, KEY), true);
  assert.equal(importKeyOk(`Bearer ${KEY}x`, KEY), false);
});

const DB_PATH = `/tmp/jobmatch-jf-import-test-${process.pid}.json`;
let server; let base;
async function call(path, body, headers = {}) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

test('route: 404 when switched off, 401 without the right key, drafts with the key', async () => {
  delete process.env.JOBFINDER_IMPORT_KEY;
  assert.equal((await call('/api/jobfinder/import-batch', { jobs: [scraped('666666')] }, { Authorization: `Bearer ${KEY}` })).status, 404);
  process.env.JOBFINDER_IMPORT_KEY = KEY;
  const reg = await call('/api/auth/register', { role: 'employer', kind: 'company', name: 'Job Finder', email: `jf-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  process.env.JOBFINDER_ACCOUNT_IDS = reg.body.user.id;
  assert.equal((await call('/api/jobfinder/import-batch', { jobs: [scraped('666666')] })).status, 401);
  assert.equal((await call('/api/jobfinder/import-batch', { jobs: [scraped('666666')] }, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await call('/api/jobfinder/import-batch', { jobs: [scraped('666666')] }, { Cookie: reg.session })).status, 401, 'a session is not enough');
  const ok = await call('/api/jobfinder/import-batch', { jobs: [scraped('666666')] }, { Authorization: `Bearer ${KEY}` });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.created, 1);
  const again = await call('/api/jobfinder/import-batch', { jobs: [scraped('666666')], emailDate: '2026-11-20' }, { Authorization: `Bearer ${KEY}` });
  assert.equal(again.body.duplicate, 1);

  // "Update roles" button: signed-in JobFinder manager only; remembers the newest email date; lists known links.
  const other = await call('/api/auth/register', { role: 'employer', kind: 'company', name: 'Other Team', email: `ot-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal((await call('/api/jobfinder/import-files', { jobs: [scraped('888888')] }, { Cookie: other.session })).status, 403);
  assert.equal((await call('/api/jobfinder/import-files', { jobs: [scraped('888888')] })).status, 403, 'anonymous');
  const btn = await call('/api/jobfinder/import-files', { jobs: [scraped('888888', { title: 'Platform Engineer' })], emailDate: '2026-11-25' }, { Cookie: reg.session });
  assert.equal(btn.status, 200, JSON.stringify(btn.body)); assert.equal(btn.body.created, 1);
  // Same title + company + location under another link = duplicate (guardrail), not a second role.
  const twin = await call('/api/jobfinder/import-files', { jobs: [scraped('999999', { title: 'Platform Engineer' })], emailDate: '2026-11-24' }, { Cookie: reg.session });
  assert.equal(twin.body.duplicate, 1);
  const res = await fetch(`${base}/api/jobfinder/import-state`, { headers: { Cookie: reg.session } });
  const state = await res.json();
  assert.equal(state.lastEmailDate, '2026-11-25', 'newest date wins, an older one never moves it back');
  assert.ok(state.knownKeys.includes('linkedin:666666') && state.knownKeys.includes('linkedin:888888'));
  assert.equal((await fetch(`${base}/api/jobfinder/import-state`, { headers: { Cookie: other.session } })).status, 403);

  // Imported drafts are listed in the account's own role list (My Jobs list), after the live roles (2026-11-26 fix).
  const boot = await (await fetch(`${base}/api/bootstrap?userId=${reg.body.user.id}`, { headers: { Cookie: reg.session } })).json();
  const roleIds = (boot.roleMatches || []).map((g) => g.job.id);
  assert.ok(roleIds.includes(ok.body.results[0].id), 'the imported draft is in My Jobs list');
  assert.equal(boot.roleMatches.find((g) => g.job.id === ok.body.results[0].id).job.status, 'draft');
});

test('recruiter file import: the same role twice in one file, or already listed, is skipped and named', async () => {
  const rec = await call('/api/auth/register', { role: 'employer', kind: 'company', name: 'Dup Team', company: 'Dup Co', email: `dup-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(rec.status, 201, JSON.stringify(rec.body));
  const csv = 'title,location,description,url\n'
    + 'Data Engineer,Hanoi,"Build pipelines with Python and Spark for our analytics team, every day.",https://jobs.example/1\n'
    + 'Data Engineer,Hanoi,"Build pipelines with Python and Spark for our analytics team, again and again.",https://jobs.example/2\n';
  const up = async (name) => {
    const r = await fetch(`${base}/api/jobs/import-file?employerId=${rec.body.user.id}&sourceSystem=file`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': name, Cookie: rec.session }, body: csv });
    return { status: r.status, body: await r.json() };
  };
  const first = await up('a.csv');
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.jobs.length, 1, 'second row = same title + company + location');
  assert.equal(first.body.duplicates.length, 1);
  const second = await up('b.csv');
  assert.equal(second.body.jobs.length, 0, 'a re-import under another file name creates nothing');
});
