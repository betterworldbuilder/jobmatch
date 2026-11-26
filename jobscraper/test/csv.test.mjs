import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
process.env.JOBSCRAPER_DATA = `/tmp/jobscraper-csv-jobs-${process.pid}.json`;
process.env.JOBSCRAPER_BATCHES = `/tmp/jobscraper-csv-lists-${process.pid}.json`;
process.env.JOBSCRAPER_SETTINGS = `/tmp/jobscraper-csv-settings-${process.pid}.json`; // never the owner's settings
delete process.env.JOBSCRAPER_ALLOW_LINKEDIN;
const { cell, COLUMNS, rowOf, toCsv } = await import('../lib/csv.mjs');
const { parseJob } = await import('../lib/parse.mjs');
const { createServer } = await import('../server.mjs');
after(() => { for (const f of [process.env.JOBSCRAPER_DATA, process.env.JOBSCRAPER_BATCHES]) rmSync(f, { force: true }); });
const AWS = readFileSync(join(here, 'fixtures', 'aws-lead-ai.txt'), 'utf8');
const LIST = readFileSync(join(here, 'fixtures', 'link-list.txt'), 'utf8');

/** Minimal RFC 4180 reader for the checks. */
function readCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { f += '"'; i += 1; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += c;
  }
  return rows;
}

test('JobsMatchNow import CSV: exact header, no BOM, stable ids, full JD, only roles with text, 50 per file', async () => {
  const { toImportCsv, importId, IMPORT_COLUMNS } = await import('../lib/csv.mjs');
  assert.deepEqual(IMPORT_COLUMNS, ['id', 'title', 'location', 'employment_type', 'work_mode', 'salary', 'url', 'description']);
  const j = parseJob({ text: AWS, url: 'https://www.linkedin.com/jobs/view/4488121470/?trk=abc', sourceName: 'LinkedIn' });
  j.type = 'Full-time'; j.workMode = 'Hybrid'; j.location = 'Ho Chi Minh City'; j.salaryRange = { min: 3000, max: 4000, currency: 'USD' }; j.salaryPeriod = 'month';
  assert.equal(importId(j), 'li-4488121470');
  const out = toImportCsv([j, { title: 'No text yet', source: { url: 'https://www.linkedin.com/jobs/view/1234567/' } }, j]);
  assert.equal(out.parts.length, 1); assert.equal(out.included, 1);
  assert.deepEqual(out.skipped.map((s) => s.reason), ['no job description yet', 'same role twice']);
  const text = out.parts[0];
  assert.ok(text.startsWith('id,title,location,employment_type,work_mode,salary,url,description\r\n'), 'no BOM, exact header');
  const rows = readCsv(text);
  assert.deepEqual(rows[1].slice(0, 7), ['li-4488121470', 'Lead AI Engineer', 'Ho Chi Minh City', 'Full-time', 'Hybrid', 'USD 3,000–4,000 / month', 'https://www.linkedin.com/jobs/view/4488121470/?trk=abc']);
  assert.match(rows[1][7], /^About the job\nThis is a demo job description/); assert.match(rows[1][7], /What we are looking for\n- Solid, recent experience with Python/);
  const many = Array.from({ length: 120 }, (_, i) => ({ ...j, source: { url: `https://careers.example.com/jobs/${i}` } }));
  const big = toImportCsv(many);
  assert.deepEqual(big.parts.map((p) => readCsv(p).length - 1), [50, 50, 20], '≤ 50 roles per upload');
});

test('cells: quoting, multi-line text, formula guard', () => {
  assert.equal(cell('plain'), 'plain');
  assert.equal(cell('a, b'), '"a, b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('line1\nline2'), '"line1\nline2"');
  assert.equal(cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(cell(null), ''); assert.equal(cell(3), '3');
});

test('a job role becomes one row with every field', () => {
  const j = parseJob({ text: AWS, url: 'https://www.linkedin.com/jobs/view/4488121470/', sourceName: 'LinkedIn', method: 'pasted text' });
  j.jobGroups = ['g-ai-ml'];
  const rows = readCsv(toCsv([rowOf(j)]));
  assert.equal(rows.length, 2); assert.equal(rows[0].length, COLUMNS.length);
  const r = Object.fromEntries(rows[0].map((h, i) => [h, rows[1][i]]));
  assert.equal(r['Job title'], 'Lead AI Engineer'); assert.equal(r.Company, 'AWS'); assert.equal(r.Seniority, 'lead');
  assert.equal(r['Must have (weight)'], 'Python (3); TensorFlow (3); AWS (3); MLOps (3)');
  assert.equal(r['Nice to have'], 'Kubernetes; CI/CD; Remote collaboration'); assert.equal(r.Languages, 'English; Vietnamese');
  assert.equal(r['Job groups'], 'AI & Machine Learning'); assert.equal(r['Source URL'], 'https://www.linkedin.com/jobs/view/4488121470/');
  assert.equal(r['Salary min'], ''); assert.equal(r.Location, '', 'not stated → empty, never guessed');
  assert.match(r['Full job description'], /^About the job\nThis is a demo/);
});

test('list CSV: every link of the founder\'s list is a row (15), saved ones filled in', async () => {
  const server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    const { batch } = await post('/api/batches', { text: LIST });
    const parsed = await post('/api/parse', { text: AWS, url: batch.items[0].url });
    const saved = await post('/api/jobs', { job: { ...parsed.job, jobGroups: ['g-ai-ml'] } });
    await fetch(`${base}/api/batches/${batch.id}/items/${batch.items[0].id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'saved', jobId: saved.job.id }) });
    const res = await fetch(`${base}/api/export.csv?list=${batch.id}`);
    assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/csv/); assert.match(res.headers.get('content-disposition'), /attachment; filename=".+\.csv"/);
    const rows = readCsv(await res.text());
    assert.equal(rows.length, 16, 'header + 15 roles');
    const h = rows[0]; const col = (name) => h.indexOf(name);
    assert.equal(rows[1][col('Job title')], 'Lead AI Engineer'); assert.equal(rows[1][col('Status')], 'saved'); assert.equal(rows[1][col('List group')], 'ai');
    assert.equal(rows[2][col('Job title')], ''); assert.equal(rows[2][col('Status')], 'needs-text');
    assert.equal(rows[2][col('Source URL')], 'https://www.linkedin.com/jobs/view/4492572035/'); assert.equal(rows[2][col('Job groups')], 'AI & Machine Learning');
    assert.equal(rows[15][col('List group')], 'data');
    const all = readCsv(await (await fetch(`${base}/api/export.csv`)).text());
    assert.equal(all.length, 2, 'library CSV: the saved job');
    assert.equal((await fetch(`${base}/api/export.csv?list=list-nope`)).status, 404);
  } finally { server.close(); }
});
