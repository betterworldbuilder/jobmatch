import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.JOBSCRAPER_DATA = `/tmp/jobscraper-multi-jobs-${process.pid}.json`;
process.env.JOBSCRAPER_BATCHES = `/tmp/jobscraper-multi-lists-${process.pid}.json`;
process.env.JOBSCRAPER_SETTINGS = `/tmp/jobscraper-multi-settings-${process.pid}.json`;
delete process.env.JOBSCRAPER_ALLOW_LINKEDIN;
const { parsePosted, plainText, splitRoles } = await import('../lib/parse.mjs');
const { toImportCsv } = await import('../lib/csv.mjs');
const { createServer } = await import('../server.mjs');
after(() => { for (const f of [process.env.JOBSCRAPER_DATA, process.env.JOBSCRAPER_BATCHES, process.env.JOBSCRAPER_SETTINGS]) rmSync(f, { force: true }); });
const POST = readFileSync(join(here, 'fixtures', 'multi-role-post.txt'), 'utf8');
const AWS = readFileSync(join(here, 'fixtures', 'aws-lead-ai.txt'), 'utf8');

test('styled Unicode from social posts becomes plain text', () => {
  assert.equal(plainText('𝐇𝐈𝐑𝐈𝐍𝐆 𝑳𝒐𝒄𝒂𝒕𝒊𝒐𝒏'), 'HIRING Location');
});

test('a post listing 10 roles → 10 jobs with their own and the shared details', () => {
  assert.equal(splitRoles(AWS), null, 'a normal JD (bullets are skills, not roles) is one job');
  const jobs = parsePosted({ text: POST, url: 'https://www.linkedin.com/posts/example-123' });
  assert.equal(jobs.length, 10);
  assert.deepEqual(jobs.map((j) => j.title), ['Principal QA Engineer Automation', 'Principal QA Engineer Manual', 'QA Manager', 'Senior TechOps Analysr', 'Cyber Security Manager',
    'Incident & Problem Management Lead', 'QA Engineer', 'Business Analyst', 'Backend Engineer Java', 'DevOps Engineer']);
  assert.ok(jobs.every((j) => j.salaryNegotiable === true && !j.salaryRange), 'Negotiable, no invented salary');
  assert.ok(jobs.every((j) => j.requiredLanguages.includes('English')), 'English from the shared header');
  assert.ok(jobs.every((j) => j.workMode === 'Remote'), '"REMOTE POSITIONS"');
  assert.equal(jobs[0].location, 'Vietnam'); assert.equal(jobs[6].location, 'Ho Chi Minh City, Vietnam (must be based in HCMC)');
  assert.equal(jobs[0].seniority, 'lead', 'Principal → lead'); assert.equal(jobs[6].seniority, 'mid', '4+ yoe → mid (Check)');
  assert.ok(jobs[6].review.check.includes('seniority'));
  assert.deepEqual(jobs[8].requiredSkillsDetail.map((s) => s.name), ['Java', 'Spring Boot']);
  assert.ok(!jobs[7].requiredSkillsDetail.some((s) => /insurance|exp/i.test(s.name)), 'domain experience is not a skill');
  assert.ok(jobs.every((j, i) => j.source.part === `${i + 1}/10`));
  assert.match(jobs[2].fullDescription, /QA Manager \(8\+ yoe\) - Negotiable/); assert.match(jobs[2].fullDescription, /Ready to make an impact/);
  assert.ok(!jobs[2].fullDescription.includes('Principal QA Engineer Manual'), 'other roles are not in this role\'s description');
  const csv = toImportCsv(jobs);
  assert.equal(csv.included, 10, 'ten distinct ids in the import file');
});

test('UI flow: pasted roles saved while a list is open are added to it, and its import CSV includes them; saving twice does not duplicate', async () => {
  const server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    const { body: { batch } } = await post('/api/batches', { text: 'ai\nhttps://careers.example.com/jobs/1' });
    const parsed = await post('/api/parse', { text: POST });
    assert.equal(parsed.body.jobs.length, 10); assert.equal(parsed.body.job.title, 'Principal QA Engineer Automation');
    for (const j of parsed.body.jobs) {
      const s = await post('/api/jobs', { job: j });
      await post(`/api/batches/${batch.id}/items`, { jobId: s.body.job.id });
    }
    // Saving the same roles again (e.g. "Save all" twice) updates them: still 10 jobs, still 11 list items.
    for (const j of parsed.body.jobs) { const s = await post('/api/jobs', { job: j }); await post(`/api/batches/${batch.id}/items`, { jobId: s.body.job.id }); }
    assert.equal((await (await fetch(`${base}/api/jobs`)).json()).jobs.length, 10);
    const b = (await (await fetch(`${base}/api/batches/${batch.id}`)).json()).batch;
    assert.equal(b.items.length, 11); assert.ok(b.items.slice(1).every((i) => i.status === 'saved' && i.added));
    const info = await (await fetch(`${base}/api/import.json?list=${batch.id}`)).json();
    assert.equal(info.included, 10, 'the list CSV now has the 10 pasted roles (the unread link is not included)');
    const csv = await (await fetch(`${base}/api/import.csv?list=${batch.id}`)).text();
    assert.equal(csv.trim().split('\r\n').length, 11, 'header + 10');
    assert.equal((await post('/api/batches/list-nope/items', { jobId: 'job-x' })).status, 404);
  } finally { server.close(); }
});
