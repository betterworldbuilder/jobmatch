import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.JOBSCRAPER_DATA = `/tmp/jobscraper-test-${process.pid}.json`;
process.env.JOBSCRAPER_SETTINGS = `/tmp/jobscraper-test-settings-${process.pid}.json`; // never the owner's settings
delete process.env.JOBSCRAPER_ALLOW_LINKEDIN;
const { parseJob, salaryFromText, skillsFromBullet, FORMAT } = await import('../lib/parse.mjs');
const { __setTransport, robotsAllows, scrapeUrl, validateUrl, findJobPosting, htmlToText } = await import('../lib/fetch.mjs');
const { exportFile } = await import('../lib/store.mjs');
const { createServer } = await import('../server.mjs');
after(() => { rmSync(process.env.JOBSCRAPER_DATA, { force: true }); __setTransport(null); });

const AWS = readFileSync(join(here, 'fixtures', 'aws-lead-ai.txt'), 'utf8');

test('parses the AWS sample into the JobsMatchNow job format, inventing nothing', () => {
  const j = parseJob({ text: AWS });
  assert.equal(j.format, FORMAT);
  assert.equal(j.title, 'Lead AI Engineer');
  assert.equal(j.company, 'AWS');
  assert.equal(j.seniority, 'lead');
  assert.equal(j.description, 'Lead the design and delivery of production AI services on AWS.');
  assert.deepEqual(j.requiredSkillsDetail.map((s) => s.name), ['Python', 'TensorFlow', 'AWS', 'MLOps']);
  assert.ok(j.requiredSkillsDetail.every((s) => s.weight === 3), '"Solid, recent experience" = weight 3');
  assert.deepEqual(j.niceToHaves, ['Kubernetes', 'CI/CD', 'Remote collaboration']);
  assert.deepEqual(j.requiredLanguages, ['English', 'Vietnamese']);
  assert.equal(j.responsibilities.length, 3);
  assert.match(j.fullDescription, /^About the job/);
  // Not stated in the text → empty (the app editor shows them as "Not provided").
  for (const k of ['workMode', 'type', 'location', 'salaryRange', 'deadline', 'openings', 'visaSponsorship', 'contractDuration']) assert.equal(j[k], null, k);
  assert.deepEqual(j.jobGroups, [], 'groups are suggested, never ticked');
  assert.ok(j.suggestedJobGroups.includes('g-ai-ml'));
  assert.ok(j.review.check.includes('company') && j.review.notProvided.includes('salaryRange'));
});

test('reads stated details: salary, mode, type, deadline, sponsorship, office days', () => {
  const t = `Title: Data Engineer\nCompany: Synthetic Co\nLocation: Ho Chi Minh City, Vietnam\nWork mode: Hybrid\nFull-time, permanent.\nSalary: USD 3,000 - 4,500 per month\n2 days a week in the office.\nNo visa sponsorship.\nApply by 2026-12-31\nBonus: up to 10% annual`;
  const j = parseJob({ text: t });
  assert.equal(j.title, 'Data Engineer'); assert.equal(j.company, 'Synthetic Co'); assert.equal(j.location, 'Ho Chi Minh City, Vietnam');
  assert.equal(j.workMode, 'Hybrid'); assert.equal(j.type, 'Full-time'); assert.equal(j.contractDuration, 'Permanent');
  assert.deepEqual(j.salaryRange, { min: 3000, max: 4500, currency: 'USD' }); assert.equal(j.salaryPeriod, 'month');
  assert.equal(j.hybridDays, 2); assert.equal(j.visaSponsorship, false); assert.equal(j.deadline, '2026-12-31'); assert.equal(j.bonus, 'up to 10% annual');
  assert.equal(salaryFromText('Competitive salary'), null, 'no numbers, no salary');
  assert.deepEqual(skillsFromBullet('- Strong knowledge of Python, SQL and Spark'), ['Python', 'SQL', 'Spark']);
});

test('schema.org JobPosting is used as the source of truth', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization' }, { '@type': 'JobPosting', title: 'Platform Engineer', hiringOrganization: { name: 'Synthetic Cloud' }, employmentType: 'FULL_TIME', jobLocationType: 'TELECOMMUTE', validThrough: '2027-01-15T00:00:00Z', baseSalary: { currency: 'USD', value: { minValue: 90000, maxValue: 120000, unitText: 'YEAR' } }, description: '<p>Run Kubernetes.</p><ul><li>Experience with Terraform</li></ul>' }] })}</script></head></html>`;
  const p = findJobPosting(html);
  const j = parseJob({ text: htmlToText(p.description), posting: p });
  assert.equal(j.title, 'Platform Engineer'); assert.equal(j.company, 'Synthetic Cloud'); assert.equal(j.workMode, 'Remote'); assert.equal(j.type, 'Full-time');
  assert.deepEqual(j.salaryRange, { min: 90000, max: 120000, currency: 'USD' }); assert.equal(j.salaryPeriod, 'year'); assert.equal(j.deadline, '2027-01-15');
  assert.ok(!j.review.check.includes('title'), 'source fields need no extra check');
});

test('URL safety and robots.txt', () => {
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'http://10.1.1.1/', 'http://169.254.169.254/', 'http://[::1]/', 'https://u:p@example.com/', 'https://example.com:8443/', 'http://printer/']) {
    assert.throws(() => validateUrl(bad), undefined, bad);
  }
  assert.ok(validateUrl('https://careers.example.com/jobs/1'));
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/jobs\n\nUser-agent: BadBot\nDisallow: /';
  assert.equal(robotsAllows(robots, '/jobs/1'), true);
  assert.equal(robotsAllows(robots, '/private/x'), false);
  assert.equal(robotsAllows(robots, '/private/jobs/2'), true);
  assert.equal(robotsAllows('User-agent: jobscraper\nDisallow: /', '/jobs'), false);
  assert.equal(robotsAllows('', '/anything'), true);
});

test('scraping: LinkedIn never fetched, robots respected, redirects re-checked, pages parsed', async () => {
  const calls = [];
  const pages = {
    'https://careers.example.com/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /internal' },
    'https://careers.example.com/jobs/lead-ai': { status: 200, headers: { 'content-type': 'text/html' }, body: `<html><head><meta property="og:site_name" content="Example Careers"><title>Lead AI Engineer</title></head><body><nav>menu</nav><main>${AWS.split('\n').map((l) => (l.startsWith('- ') ? `<li>${l.slice(2)}</li>` : `<p>${l}</p>`)).join('')}</main></body></html>` },
    'https://careers.example.com/jobs/moved': { status: 302, headers: { location: 'http://127.0.0.1/admin' }, body: '' },
    'https://careers.example.com/jobs/to-linkedin': { status: 301, headers: { location: 'https://www.linkedin.com/jobs/view/1/' }, body: '' },
  };
  __setTransport(async (u) => { calls.push(u); return pages[u] || { status: 404, headers: {}, body: '' }; });

  const li = await scrapeUrl('https://www.linkedin.com/jobs/view/4460964488/');
  assert.equal(li.ok, false); assert.equal(li.code, 'blocked'); assert.equal(li.url, 'https://www.linkedin.com/jobs/view/4460964488/');
  assert.match(li.message, /Paste the job description/);
  assert.ok(!calls.some((u) => u.includes('linkedin')), 'LinkedIn is never requested');

  const ok = await scrapeUrl('https://careers.example.com/jobs/lead-ai');
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.job.title, 'Lead AI Engineer'); assert.equal(ok.job.company, 'AWS'); assert.equal(ok.job.source.name, 'Example Careers');
  assert.equal(ok.job.source.url, 'https://careers.example.com/jobs/lead-ai'); assert.equal(ok.job.requiredSkillsDetail.length, 4);

  assert.equal((await scrapeUrl('https://careers.example.com/internal/x')).code, 'robots');
  const redirect = await scrapeUrl('https://careers.example.com/jobs/moved');
  assert.equal(redirect.ok, false); assert.equal(redirect.code, 'unsafe', 'a redirect to a private address is refused');
  assert.equal((await scrapeUrl('https://careers.example.com/jobs/to-linkedin')).code, 'blocked');
  assert.equal((await scrapeUrl('http://192.168.0.1/')).code, 'unsafe');
});

test('LinkedIn public job page: only when the owner turns it on; signed out; walls and 999 respected', async () => {
  const page = readFileSync(join(here, 'fixtures', 'linkedin-public-page.html'), 'utf8');
  const calls = [];
  const answers = {
    'https://www.linkedin.com/jobs/view/111111/': { status: 200, headers: { 'content-type': 'text/html' }, body: page },
    'https://www.linkedin.com/jobs/view/222222/': { status: 302, headers: { location: 'https://www.linkedin.com/authwall?trk=x' }, body: '' },
    'https://www.linkedin.com/authwall?trk=x': { status: 200, headers: { 'content-type': 'text/html' }, body: '<html>Sign in</html>' },
    'https://www.linkedin.com/jobs/view/333333/': { status: 999, headers: {}, body: '' },
  };
  __setTransport(async (u) => { calls.push(u); return answers[u] || { status: 404, headers: {}, body: '' }; });
  process.env.JOBSCRAPER_LINKEDIN_GAP_MS = '0';
  const off = await scrapeUrl('https://www.linkedin.com/jobs/view/111111/', { allowLinkedIn: false });
  assert.equal(off.code, 'blocked'); assert.equal(calls.length, 0, 'off by default: nothing requested');

  const ok = await scrapeUrl('https://www.linkedin.com/jobs/view/senior-genai-engineer-111111?trk=feed', { allowLinkedIn: true });
  assert.equal(ok.ok, true, ok.message);
  assert.deepEqual(calls, ['https://www.linkedin.com/jobs/view/111111/'], 'canonical public job URL only; no robots.txt, no other page');
  const j = ok.job;
  assert.equal(j.title, '[HCM] GenAI Engineer (Senior)'); assert.equal(j.company, 'Synthetic Labs'); assert.equal(j.location, 'Ho Chi Minh City, Vietnam');
  assert.equal(j.type, 'Full-time'); assert.equal(j.seniority, 'senior'); assert.equal(j.source.url, 'https://www.linkedin.com/jobs/view/senior-genai-engineer-111111?trk=feed');
  assert.equal(j.source.method, 'public LinkedIn job page (signed out)');
  const must = j.requiredSkillsDetail.map((s) => s.name);
  for (const s of ['Python', 'LangChain/LangGraph', 'LlamaIndex', 'MCP', 'vector databases', 'Qdrant', 'pgvector', 'Milvus']) assert.ok(must.includes(s), `${s} in must-have: ${must}`);
  for (const junk of ['users served', 'latency', 'cost improvements', 'related field', 'frameworks']) assert.ok(!must.includes(junk), `${junk} is not a skill`);
  assert.deepEqual(j.niceToHaves, ['Fine-tuning', 'self-hosted LLMs', 'LLMOps', 'Cloud deployment', 'Docker/Kubernetes', 'CI/CD']);
  assert.deepEqual(j.requiredLanguages, ['English']);
  assert.deepEqual(j.benefits, ['13th-month salary and performance bonus', '2 days WFH/week']);
  assert.ok(!/Sign in|Apply/.test(j.fullDescription), 'only the job text, not the page buttons');
  assert.equal(j.linkedInCriteria['Job function'], 'Engineering');

  assert.equal((await scrapeUrl('https://www.linkedin.com/jobs/view/222222/', { allowLinkedIn: true })).code, 'restricted', 'sign-in wall → paste fallback');
  assert.equal((await scrapeUrl('https://www.linkedin.com/jobs/view/333333/', { allowLinkedIn: true })).code, 'restricted', '999 → paste fallback');
  assert.equal((await scrapeUrl('https://www.indeed.com/viewjob?jk=1', { allowLinkedIn: true })).code, 'blocked', 'Indeed stays blocked');
  __setTransport(null);
});

test('web server: scrape, parse, save, list, export', async () => {
  const server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    assert.equal((await fetch(`${base}/`)).status, 200);
    const li = await post('/api/scrape', { url: 'https://www.linkedin.com/jobs/view/4460964488/' });
    assert.equal(li.body.ok, false); assert.equal(li.body.url, 'https://www.linkedin.com/jobs/view/4460964488/');
    const parsed = await post('/api/parse', { text: AWS, url: 'https://www.linkedin.com/jobs/view/4460964488/' });
    assert.equal(parsed.body.job.title, 'Lead AI Engineer'); assert.equal(parsed.body.job.source.url, 'https://www.linkedin.com/jobs/view/4460964488/');
    assert.equal(parsed.body.job.source.method, 'pasted text');
    assert.equal((await post('/api/parse', { text: 'short' })).status, 400);
    const saved = await post('/api/jobs', { job: parsed.body.job });
    assert.equal(saved.status, 201);
    const list = await (await fetch(`${base}/api/jobs`)).json();
    assert.equal(list.jobs.length, 1);
    const exp = await (await fetch(`${base}/api/export`)).json();
    assert.equal(exp.format, FORMAT); assert.equal(exp.jobs[0].title, 'Lead AI Engineer'); assert.equal(exp.jobs[0].id, undefined);
    assert.deepEqual(exportFile([parsed.body.job]).jobs[0].requiredLanguages, ['English', 'Vietnamese']);
    assert.equal((await fetch(`${base}/api/jobs/${saved.body.job.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/../etc/passwd`)).status, 404);
  } finally { server.close(); }
});
