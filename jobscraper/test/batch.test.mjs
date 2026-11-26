import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.JOBSCRAPER_DATA = `/tmp/jobscraper-batch-jobs-${process.pid}.json`;
process.env.JOBSCRAPER_BATCHES = `/tmp/jobscraper-batch-lists-${process.pid}.json`;
process.env.JOBSCRAPER_SETTINGS = `/tmp/jobscraper-batch-settings-${process.pid}.json`; // never the owner's settings
delete process.env.JOBSCRAPER_ALLOW_LINKEDIN;
const { parseLinkList, groupIdFor } = await import('../lib/batch.mjs');
const { __setTransport } = await import('../lib/fetch.mjs');
const { createServer } = await import('../server.mjs');
after(() => { for (const f of [process.env.JOBSCRAPER_DATA, process.env.JOBSCRAPER_BATCHES]) rmSync(f, { force: true }); __setTransport(null); });

const LIST = readFileSync(join(here, 'fixtures', 'link-list.txt'), 'utf8');
const AWS = readFileSync(join(here, 'fixtures', 'aws-lead-ai.txt'), 'utf8');

test('the founder\'s list: headings become groups, duplicates removed', () => {
  const { items, duplicates, invalid } = parseLinkList(LIST);
  assert.equal(items.length, 15, '16 links, one repeated');
  assert.equal(duplicates.length, 1); assert.match(duplicates[0].url, /4488121470/);
  assert.equal(invalid.length, 0);
  const by = (id) => items.filter((i) => i.groups[0].id === id).length;
  assert.equal(by('g-ai-ml'), 5); assert.equal(by('g-software'), 4); assert.equal(by('g-cloud-devops'), 3); assert.equal(by('g-data'), 3);
  assert.ok(items.every((i) => i.site === 'LinkedIn'), 'all LinkedIn → paste fallback, never fetched');
  assert.equal(items[0].groups[0].label, 'ai');
});

test('heading aliases, a job in two groups, tracking params, bad lines', () => {
  for (const [h, id] of [['AI', 'g-ai-ml'], ['ML:', 'g-ai-ml'], ['SW Eng', 'g-software'], ['Software Engineering', 'g-software'], ['Cloud & DevOps', 'g-cloud-devops'], ['DATA', 'g-data'], ['marketing', null]]) assert.equal(groupIdFor(h), id, h);
  const r = parseLinkList('ai\nhttps://jobs.example.com/1?utm_source=x\ndata\nhttps://jobs.example.com/1\nhttp://localhost/admin\nThis is a long sentence that is clearly not a heading because it goes on and on and on.\nmarketing\nhttps://www.linkedin.com/jobs/search/?currentJobId=4499999999&keywords=ai');
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items[0].groups.map((g) => g.id), ['g-ai-ml', 'g-data'], 'same job under two headings → two groups');
  assert.equal(r.items[1].key, 'linkedin:4499999999'); assert.equal(r.items[1].groups[0].id, null, 'unknown heading kept as a label, no group');
  assert.equal(r.invalid.length, 2, 'unsafe link + long sentence reported, not silently dropped');
});

test('list API: create, LinkedIn needs text (no request), public page read, save, export only this list', async () => {
  const calls = [];
  const html = `<html><head><meta property="og:site_name" content="Example Careers"></head><body><main>${AWS.split('\n').map((l) => (l.startsWith('- ') ? `<li>${l.slice(2)}</li>` : `<p>${l}</p>`)).join('')}</main></body></html>`;
  __setTransport(async (u) => { calls.push(u); if (u.endsWith('/robots.txt')) return { status: 404, headers: {}, body: '' }; return { status: 200, headers: { 'content-type': 'text/html' }, body: html }; });
  const server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (m, p, b) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    assert.equal((await req('POST', '/api/batches', { text: 'just words' })).status, 400);
    const made = await req('POST', '/api/batches', { text: `${LIST}\ncloud\nhttps://careers.example.com/jobs/platform-1` });
    assert.equal(made.status, 201);
    const b = made.body.batch;
    assert.equal(b.items.length, 16); assert.equal(b.duplicates.length, 1);
    const li = b.items[0];
    assert.equal(li.status, 'needs-text'); assert.match(li.message, /LinkedIn/);
    const liRead = await req('POST', `/api/batches/${b.id}/items/${li.id}/read`);
    assert.equal(liRead.body.ok, false);
    assert.ok(!calls.some((u) => u.includes('linkedin')), 'LinkedIn never requested');
    const pub = b.items.at(-1);
    assert.equal(pub.status, 'pending');
    const read = await req('POST', `/api/batches/${b.id}/items/${pub.id}/read`);
    assert.equal(read.body.ok, true); assert.deepEqual(read.body.job.jobGroups, ['g-cloud-devops'], 'group from the list is ticked');
    assert.equal(read.body.item.status, 'ready');
    // Paste flow for the LinkedIn item, then save and mark it.
    const parsed = await req('POST', '/api/parse', { text: AWS, url: li.url });
    const saved = await req('POST', '/api/jobs', { job: { ...parsed.body.job, jobGroups: ['g-ai-ml'] } });
    const upd = await req('PATCH', `/api/batches/${b.id}/items/${li.id}`, { status: 'saved', jobId: saved.body.job.id });
    assert.equal(upd.body.item.status, 'saved');
    assert.equal((await req('PATCH', `/api/batches/${b.id}/items/${li.id}`, { status: 'bogus' })).status, 400);
    const other = await req('POST', '/api/jobs', { job: { ...parsed.body.job, title: 'Not in the list' } });
    const exp = await (await fetch(`${base}/api/export?ids=${saved.body.job.id}`)).json();
    assert.equal(exp.jobs.length, 1); assert.equal(exp.jobs[0].source.url, li.url); assert.deepEqual(exp.jobs[0].jobGroups, ['g-ai-ml']);
    assert.ok(other.body.job.id);
    const lists = await req('GET', '/api/batches');
    assert.equal(lists.body.batches[0].saved, 1);
    assert.equal((await req('DELETE', `/api/batches/${b.id}`)).status, 200);
  } finally { server.close(); }
});
