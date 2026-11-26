import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { __setJmnFetch, cleanBase, sendJobs, signIn, signOut, status, toListing } = await import('../lib/jobsmatchnow.mjs');
const { parseJob } = await import('../lib/parse.mjs');
after(() => __setJmnFetch(null));
const AWS = readFileSync(join(here, 'fixtures', 'aws-lead-ai.txt'), 'utf8');

/** A fake JobsMatchNow: one JobFinder account, one recruiter, listings in memory. */
function fakeJmn() {
  const listings = []; const calls = [];
  const users = { 'jf@example.com': { pass: 'right-pass', id: 'u-jf', jf: true }, 'rec@example.com': { pass: 'right-pass', id: 'u-rec', jf: false } };
  const json = (status, data, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
  __setJmnFetch(async (url, init) => {
    const u = new URL(url); const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, method: init.method, cookie: init.headers.Cookie, body });
    const who = (init.headers.Cookie || '').replace('jm_auth=', '');
    if (u.pathname === '/api/auth/login') {
      const acc = users[body.email];
      if (!acc || acc.pass !== body.password) return json(401, { error: 'Email or password is incorrect' });
      return json(200, { user: { id: acc.id, name: acc.jf ? 'JobFinder' : 'Rec', email: body.email } }, { 'set-cookie': `jm_auth=${acc.id}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (u.pathname === '/api/jobfinder/jobs') {
      if (who !== 'u-jf') return json(403, { error: 'Only JobFinder can manage these listings' });
      if (init.method === 'GET') return json(200, { jobs: listings });
      const job = { id: `jf-${listings.length + 1}`, ...body, jobFinder: { listingStatus: body.listingStatus, sourceUrl: body.sourceUrl } };
      listings.push(job);
      return json(201, { job, duplicates: [] });
    }
    return json(404, { error: 'Not found' });
  });
  return { listings, calls };
}

test('address rules', () => {
  assert.equal(cleanBase('https://jobsmatchnow.com/app/'), 'https://jobsmatchnow.com');
  assert.equal(cleanBase('http://127.0.0.1:8931'), 'http://127.0.0.1:8931');
  assert.throws(() => cleanBase('http://jobsmatchnow.com'), /https/);
  assert.throws(() => cleanBase('https://u:p@jobsmatchnow.com'), /password/);
});

test('a saved job becomes a JobFinder DRAFT with only stated fields', () => {
  const j = parseJob({ text: AWS, url: 'https://www.linkedin.com/jobs/view/4488121470/', sourceName: 'LinkedIn', method: 'pasted text' });
  j.jobGroups = ['g-ai-ml'];
  const b = toListing(j);
  assert.equal(b.listingStatus, 'draft');
  assert.equal(b.title, 'Lead AI Engineer'); assert.equal(b.company, 'AWS'); assert.equal(b.seniority, 'lead');
  assert.deepEqual(b.requiredSkillsDetail.map((s) => [s.name, s.weight]), [['Python', 3], ['TensorFlow', 3], ['AWS', 3], ['MLOps', 3]]);
  assert.deepEqual(b.requiredLanguages, ['English', 'Vietnamese']); assert.deepEqual(b.jobGroups, ['g-ai-ml']);
  assert.equal(b.sourceUrl, 'https://www.linkedin.com/jobs/view/4488121470/'); assert.equal(b.sourceName, 'LinkedIn');
  for (const k of ['salaryRange', 'location', 'workMode', 'type', 'closingDate']) assert.ok(!(k in b), `${k} not sent: not stated`);
  assert.ok(!Object.values(b).some((v) => v === null), 'no nulls');
  assert.equal(toListing({ ...j, salaryRange: { min: 0, max: 0, currency: '' } }).salaryRange, undefined, 'incomplete salary never sent');
});

test('sign in, permission check, send drafts, skip duplicates, report missing company, password never kept', async () => {
  const { listings, calls } = fakeJmn();
  signOut();
  await assert.rejects(sendJobs([]), /Sign in/);
  await assert.rejects(signIn({ base: 'https://jobsmatchnow.com', email: 'jf@example.com', password: 'wrong' }), /incorrect/);
  await assert.rejects(signIn({ base: 'https://jobsmatchnow.com', email: 'rec@example.com', password: 'right-pass' }), /Only JobFinder/);
  assert.equal(status().signedIn, false);
  const s = await signIn({ base: 'https://jobsmatchnow.com', email: 'jf@example.com', password: 'right-pass' });
  assert.equal(s.signedIn, true); assert.equal(s.user.name, 'JobFinder');
  assert.ok(!JSON.stringify(s).includes('right-pass') && !JSON.stringify(s).includes('jm_auth'), 'status exposes neither password nor cookie');

  const a = { ...parseJob({ text: AWS, url: 'https://www.linkedin.com/jobs/view/1/' }), id: 'job-a', jobGroups: ['g-ai-ml'] };
  const b = { ...a, id: 'job-b', company: null, source: { url: 'https://www.linkedin.com/jobs/view/2/' } };
  const out = await sendJobs([a, b]);
  assert.deepEqual(out.results.map((r) => r.status), ['created', 'failed']);
  assert.match(out.results[1].reason, /No company/);
  assert.equal(listings.length, 1); assert.equal(listings[0].listingStatus, 'draft');
  const again = await sendJobs([a]);
  assert.equal(again.results[0].status, 'skipped', 'same source link → not sent twice');
  assert.equal(listings.length, 1);
  assert.ok(calls.filter((c) => c.path === '/api/jobfinder/jobs' && c.method === 'POST').every((c) => c.cookie === 'jm_auth=u-jf'), 'listings are created with the JobFinder session');
  assert.ok(!calls.some((c) => c.path !== '/api/auth/login' && JSON.stringify(c.body || {}).includes('right-pass')));
  signOut();
  assert.equal(status().signedIn, false);
});
