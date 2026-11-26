import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { __setLinkFetcher, assertPublicHost, buildReview, classifySource, FALLBACK_MESSAGE, isRestrictedIp, suggestFromText, validateJobUrl } from './job-link-import.js';

/* Job-link import (founder spec, 2026-11-25). Synthetic users and jobs only. No real job board or LinkedIn page is ever
   requested: provider calls go through a fake fetcher, and LinkedIn is never fetched by design. */
const DB_PATH = `/tmp/jobmatch-joblink-test-${process.pid}.json`;
let server; let base;
const fetched = [];
async function call(method, path, body, cookie) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH; process.env.JOB_LINK_RATE_MAX = '500';
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, body: json, text, session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); __setLinkFetcher(null); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
const pid = process.pid;
async function register(role, name) {
  const r = await call('POST', '/api/auth/register', { role, ...(role === 'employer' ? { kind: 'company' } : {}), name, email: `${name.toLowerCase().replace(/\s+/g, '.')}-${pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.user.id, cookie: r.session };
}
const LINKEDIN = 'https://www.linkedin.com/jobs/view/4460964488/';
const PASTED = `Senior Data Engineer
Company: Synthetic Analytics Ltd
Location: Ho Chi Minh City, Vietnam
Hybrid, full-time.
We build pipelines with Python, SQL and AWS. Apply by 2026-12-31.
Contact jobs@synthetic.example for questions.`;

test('URL safety: unsafe and invalid links are rejected, public job links accepted', async () => {
  for (const ok of [LINKEDIN, 'https://boards.greenhouse.io/acme/jobs/123', 'http://careers.example.com/jobs/1']) assert.ok(validateJobUrl(ok));
  for (const bad of ['', 'not a url', 'javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x', 'http://localhost/x', 'http://127.0.0.1/x',
    'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.20.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/', 'http://0.0.0.0/', 'http://100.64.0.1/', 'https://user:pass@example.com/', 'https://example.com:8080/', 'http://intranet/', 'http://db.internal/',
    `https://example.com/${'a'.repeat(2100)}`]) {
    assert.throws(() => validateJobUrl(bad), /link|Links|Paste/, bad);
  }
  assert.equal(isRestrictedIp('8.8.8.8'), false);
  assert.equal(isRestrictedIp('10.1.2.3'), true);
  // DNS rebinding style: a public name that resolves to a private address is refused before any request.
  await assert.rejects(assertPublicHost('evil.example', async () => [{ address: '127.0.0.1', family: 4 }]), /Restricted/);
  await assert.doesNotReject(assertPublicHost('ok.example', async () => [{ address: '93.184.216.34', family: 4 }]));
});

test('Sources: LinkedIn is recognised but never retrievable; providers are off unless configured', () => {
  const li = classifySource(new URL(LINKEDIN));
  assert.equal(li.sourceName, 'LinkedIn'); assert.equal(li.retrievable, false); assert.equal(li.sourceJobId, '4460964488');
  delete process.env.JOB_LINK_PROVIDERS;
  assert.equal(classifySource(new URL('https://boards.greenhouse.io/acme/jobs/123')).retrievable, false, 'off by default');
  process.env.JOB_LINK_PROVIDERS = 'greenhouse';
  assert.equal(classifySource(new URL('https://boards.greenhouse.io/acme/jobs/123')).retrievable, true);
  assert.equal(classifySource(new URL('https://careers.example.com/x')).retrievable, false);
  delete process.env.JOB_LINK_PROVIDERS;
});

test('Suggestions from pasted text: nothing invented', async () => {
  const { fields } = await suggestFromText(PASTED);
  assert.equal(fields.title, 'Senior Data Engineer');
  assert.equal(fields.company, 'Synthetic Analytics Ltd');
  assert.equal(fields.workMode, 'Hybrid'); assert.equal(fields.type, 'Full-time'); assert.equal(fields.experienceLevel, 'senior');
  assert.equal(fields.deadline, '2026-12-31');
  assert.equal(fields.salaryRange, undefined, 'no salary in the text, so none suggested');
  assert.ok(fields.skills.includes('Python'));
  assert.ok(!JSON.stringify({ ...fields, description: '' }).includes('jobs@synthetic.example'), 'an email in the text is never captured as a contact');
  // A JD that starts with a section heading (found in the browser test): the heading is never the title.
  const sample = (await suggestFromText('About the job\nThis is a demo job description written for JobsMatchNow. AWS is hiring a Lead AI Engineer. AWS helps organizations build.\n\nThe role\nLead the design of AI services.')).fields;
  assert.equal(sample.title, 'Lead AI Engineer'); assert.equal(sample.company, 'AWS');
  const collab = (await suggestFromText('Platform Engineer\nWe build hybrid cloud tools.\nNice to have\n- Remote collaboration\n- Kubernetes')).fields;
  assert.equal(collab.workMode, undefined, '"Remote collaboration" / "hybrid cloud" are not a work mode');
  const bare = (await suggestFromText('Platform role for our team. We need someone who loves building reliable systems and tooling.')).fields;
  for (const k of ['type', 'experienceLevel', 'workMode', 'salaryRange', 'company', 'location']) assert.equal(bare[k], undefined, `${k} left empty`);
  const review = buildReview({ textFields: bare });
  assert.equal(review.salaryRange.value, null); assert.equal(review.title.review, true, 'text guesses are marked for review');
});

test('Import from link: permissions, LinkedIn fallback, provider import, drafts, publish, groups, privacy, duplicates, audit', async () => {
  const jf = await register('employer', 'Job Finder Link');
  process.env.JOBFINDER_ACCOUNT_IDS = jf.id;
  const recruiter = await register('employer', 'Link Recruiter');
  const cand = await register('candidate', 'Link Candidate');

  // 8. Unauthorized users cannot import.
  assert.equal((await call('POST', '/api/job-link/analyze', { url: LINKEDIN })).status, 401, 'anonymous');
  assert.equal((await call('POST', '/api/job-link/analyze', { url: LINKEDIN }, cand.cookie)).status, 403, 'candidate');
  assert.equal((await call('POST', '/api/job-link/analyze', { url: LINKEDIN, mode: 'jobfinder' }, recruiter.cookie)).status, 403, 'recruiter cannot act as JobFinder');
  assert.equal((await call('POST', '/api/job-link/recruiter-draft', { title: 'X' }, cand.cookie)).status, 403);

  // 10. Unsafe URLs are rejected safely (no request made).
  const bad = await call('POST', '/api/job-link/analyze', { url: 'http://169.254.169.254/latest/meta-data/', mode: 'jobfinder' }, jf.cookie);
  assert.equal(bad.status, 400); assert.match(bad.body.error, /private network/);

  // 1, 3. LinkedIn: URL preserved, nothing fetched, fallback offered.
  __setLinkFetcher(async (u) => { fetched.push(u); throw new Error('must not be called'); });
  const li = await call('POST', '/api/job-link/analyze', { url: LINKEDIN, mode: 'jobfinder' }, jf.cookie);
  assert.equal(li.status, 200, JSON.stringify(li.body));
  assert.equal(li.body.sourceUrl, LINKEDIN); assert.equal(li.body.sourceName, 'LinkedIn'); assert.equal(li.body.retrieved, false);
  assert.equal(li.body.method, 'manual'); assert.equal(li.body.notice, FALLBACK_MESSAGE);
  assert.equal(li.body.fields.title.value, null, 'nothing claimed as imported');
  assert.equal(fetched.length, 0, 'LinkedIn is never requested');
  // ... then the user pastes the text: the link stays, method = pasted.
  const pasted = await call('POST', '/api/job-link/analyze', { url: LINKEDIN, text: PASTED, mode: 'jobfinder' }, jf.cookie);
  assert.equal(pasted.body.sourceUrl, LINKEDIN); assert.equal(pasted.body.method, 'pasted');
  assert.equal(pasted.body.fields.title.value, 'Senior Data Engineer'); assert.equal(pasted.body.fields.title.from, 'text');
  assert.equal(pasted.body.fields.salaryRange.value, null, '5. salary not fabricated');

  // 2. A supported, permitted provider (switched on) populates only what it states.
  process.env.JOB_LINK_PROVIDERS = 'greenhouse';
  __setLinkFetcher(async (u) => { fetched.push(u); return { id: 777, title: 'ML Platform Engineer', company_name: 'Synthetic Robotics', location: { name: 'Remote, USA' }, content: '&lt;p&gt;Build &amp;amp; run ML infra with Kubernetes.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;', absolute_url: 'https://boards.greenhouse.io/synthrobo/jobs/777' }; });
  const gh = await call('POST', '/api/job-link/analyze', { url: 'https://boards.greenhouse.io/synthrobo/jobs/777', mode: 'jobfinder' }, jf.cookie);
  assert.equal(gh.body.retrieved, true); assert.equal(gh.body.method, 'imported');
  assert.equal(fetched.at(-1), 'https://boards-api.greenhouse.io/v1/boards/synthrobo/jobs/777?pay_transparency=true');
  assert.equal(gh.body.fields.title.value, 'ML Platform Engineer'); assert.equal(gh.body.fields.title.from, 'source');
  assert.equal(gh.body.fields.company.value, 'Synthetic Robotics');
  assert.match(gh.body.fields.description.value, /Build & run ML infra/); assert.match(gh.body.fields.description.value, /- Python/);
  assert.equal(gh.body.fields.salaryRange.value, null, 'provider gave no pay range');
  // A failing provider falls back without losing the link.
  __setLinkFetcher(async () => { throw new Error('timeout'); });
  const ghFail = await call('POST', '/api/job-link/analyze', { url: 'https://boards.greenhouse.io/synthrobo/jobs/778', mode: 'jobfinder' }, jf.cookie);
  assert.equal(ghFail.body.retrieved, false); assert.equal(ghFail.body.notice, FALLBACK_MESSAGE); assert.equal(ghFail.body.sourceUrl, 'https://boards.greenhouse.io/synthrobo/jobs/778');
  delete process.env.JOB_LINK_PROVIDERS;

  // 4, 6, 7. Save as draft (edited fields, two groups): not public until explicitly published.
  const draft = await call('POST', '/api/jobfinder/jobs', {
    title: 'Senior Data Engineer (edited)', company: 'Synthetic Analytics Ltd', location: 'Ho Chi Minh City, Vietnam', workMode: 'Hybrid', type: 'Full-time',
    requiredSkills: ['Python', 'SQL'], description: PASTED, fullDescription: PASTED, sourceName: 'LinkedIn', sourceUrl: LINKEDIN, applyUrl: LINKEDIN,
    closingDate: '2026-12-31', listingStatus: 'draft', jobGroups: ['g-data', 'g-ai-ml'], importInfo: { method: 'pasted', extraction: 'Suggested from your pasted text (built-in parser)', sourceJobId: '4460964488' },
  }, jf.cookie);
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  const job = draft.body.job;
  assert.equal(job.jobFinder.listingStatus, 'draft'); assert.equal(job.status, 'draft');
  assert.deepEqual(job.jobGroups.sort(), ['g-ai-ml', 'g-data']);
  assert.equal(job.jobFinder.sourceUrl, LINKEDIN); assert.equal(job.jobFinder.import.method, 'pasted'); assert.equal(job.jobFinder.import.importedBy, jf.id);
  assert.equal(job.jobFinder.employerStatus, 'pending', 'never implies membership');
  assert.equal(job.salary, undefined); assert.equal(job.salaryRange, undefined);
  assert.equal((await call('GET', `/api/public/jobs/${job.id}`)).status, 404, 'draft is not public');
  // An unsafe source link is refused on save too.
  assert.equal((await call('POST', '/api/jobfinder/jobs', { title: 'T', company: 'C', sourceUrl: 'http://127.0.0.1/x', importInfo: { method: 'manual' } }, jf.cookie)).status, 400);

  // Duplicates: same source URL is flagged before saving again.
  const dup = await call('POST', '/api/job-link/duplicates', { mode: 'jobfinder', sourceUrl: LINKEDIN, title: 'Other', company: 'Other' }, jf.cookie);
  assert.equal(dup.body.duplicates.length, 1); assert.equal(dup.body.duplicates[0].id, job.id);
  assert.equal((await call('POST', '/api/job-link/analyze', { url: LINKEDIN, mode: 'jobfinder' }, jf.cookie)).body.duplicates[0].id, job.id);

  // 9. Private contact: recorded without auto-verification, never shown to candidates or the public.
  assert.equal((await call('PUT', `/api/jobfinder/jobs/${job.id}/contact`, { email: 'hiring@synthetic.example', approved: true }, jf.cookie)).status, 400, 'not verified by syntax');
  const c = await call('PUT', `/api/jobfinder/jobs/${job.id}/contact`, { name: 'Test Recruiter', email: 'hiring@synthetic.example', approved: false }, jf.cookie);
  assert.equal(c.body.reachability, 'apply');

  // 7, 8. Publishing needs an explicit action by an authorized user.
  assert.equal((await call('PATCH', `/api/jobfinder/jobs/${job.id}`, { action: 'publish' }, recruiter.cookie)).status, 403);
  assert.equal((await call('PATCH', `/api/jobfinder/jobs/${job.id}`, { action: 'publish' }, cand.cookie)).status, 403);
  const pub = await call('PATCH', `/api/jobfinder/jobs/${job.id}`, { action: 'publish' }, jf.cookie);
  assert.equal(pub.body.job.jobFinder.listingStatus, 'published'); assert.equal(pub.body.job.jobFinder.publishedBy, jf.id);
  const pubView = await call('GET', `/api/public/jobs/${job.id}`);
  assert.equal(pubView.status, 200);
  const boot = await call('GET', `/api/bootstrap?userId=${cand.id}`, null, cand.cookie);
  for (const payload of [pubView.text, boot.text]) {
    assert.ok(!payload.includes('hiring@synthetic.example'), 'contact hidden');
    assert.ok(!payload.includes('"importedBy"') && !payload.includes('"publishedBy"'), 'audit fields hidden from candidates');
  }
  // Audit trail: imported + published, by the JobFinder account.
  const list = await call('GET', '/api/jobfinder/jobs', null, jf.cookie);
  const row = list.body.jobs.find((r) => r.id === job.id);
  assert.deepEqual(row.history.map((h) => h.action).filter((a) => ['imported', 'publish'].includes(a)), ['imported', 'publish']);
  assert.ok(row.history.every((h) => h.actorId === jf.id));

  // Recruiter path: own draft, no invented defaults; publishing follows the existing rules (salary required).
  const rd = await call('POST', '/api/job-link/recruiter-draft', { title: 'Backend Engineer', sourceUrl: LINKEDIN, sourceName: 'LinkedIn', importMethod: 'manual', jobGroups: ['g-software', 'g-cloud-devops'], skills: ['Go'] }, recruiter.cookie);
  assert.equal(rd.status, 201, JSON.stringify(rd.body));
  const rj = rd.body.job;
  assert.equal(rj.status, 'draft'); assert.equal(rj.sourceUrl, LINKEDIN); assert.equal(rj.employerId, recruiter.id);
  for (const k of ['salary', 'salaryRange', 'type', 'workMode', 'location', 'seniority']) assert.equal(rj[k], undefined, `${k} not invented`);
  assert.equal(rj.jobGroups.length, 2); assert.equal(rj.importInfo.importedBy, recruiter.id);
  assert.equal((await call('PATCH', `/api/jobs/${rj.id}`, { status: 'active' }, cand.cookie)).status, 403, 'others cannot publish it');
  const early = await call('PATCH', `/api/jobs/${rj.id}`, { status: 'active' }, recruiter.cookie);
  assert.equal(early.status, 400, 'existing publish contract still applies');
  const still = (await call('POST', '/api/job-link/duplicates', { sourceUrl: LINKEDIN }, recruiter.cookie)).body.duplicates;
  assert.equal(still.length, 1); assert.equal(still[0].status, 'draft', 'stays a draft');
  assert.ok(!still.some((d) => d.id === job.id), 'recruiters only see their own jobs as duplicates');
  __setLinkFetcher(null);

});
