import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* CSV import → Role details (founder, 2026-11-25): the file's description lands in fullDescription with its line
   breaks, the short summary is one paragraph, JobFinder imports go live, and re-importing fills older drafts. */
const DB_PATH = `/tmp/jobmatch-import-fulljd-test-${process.pid}.json`;
let server; let base;
async function boot() {
  if (base) return;
  process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function call(method, path, body, cookie) {
  await boot();
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
async function upload(employerId, csv, cookie) {
  await boot();
  const res = await fetch(`${base}/api/jobs/import-file?employerId=${encodeURIComponent(employerId)}&sourceSystem=ats_export`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': 'jobs.csv', Cookie: cookie }, body: csv,
  });
  return { status: res.status, body: await res.json() };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
const pid = process.pid;
async function register(name) {
  const r = await call('POST', '/api/auth/register', { role: 'employer', kind: 'company', name, email: `${name.toLowerCase().replace(/\s+/g, '.')}-${pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.user.id, cookie: r.session };
}

const JD = 'Company: MTI Technology\n\nABOUT THE ROLE:\nYou will design, build and ship GenAI applications (LLM, RAG, AI agents) for our clients, from requirement to production.\n\nREQUIREMENTS:\n\n- 2+ years of hands-on AI/ML engineering experience.\n\n- Strong Python.';
const CSV = `id,title,location,employment_type,work_mode,salary,url,description\nli-1,AI Engineer,"Ho Chi Minh City, Vietnam",Full-time,,,https://www.linkedin.com/jobs/view/1/,"${JD}"\nli-2,DevOps Engineer,"Ho Chi Minh City, Vietnam",Full-time,Hybrid,,,"About the role\nKeep startups fast, up, and cheap to run: Kubernetes, Terraform, GitOps and AI infrastructure."\n`;

test('CSV import fills Role details; JobFinder imports go live; recruiters keep drafts', async () => {
  const jf = await register('Job Finder');
  process.env.JOBFINDER_ACCOUNT_IDS = jf.id;
  const rec = await register('Real Recruiter');

  const a = await upload(jf.id, CSV, jf.cookie);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.jobs.length, 2);
  assert.equal(a.body.live, true);
  const [ai] = a.body.jobs;
  assert.equal(ai.fullDescription, JD, 'full JD kept as written, with line breaks');
  assert.ok(ai.description.length <= 400 && !ai.description.includes('\n'), 'short summary is one paragraph');
  assert.match(ai.description, /^You will design/);
  assert.equal(ai.status, 'active');
  assert.equal(ai.salary, 'Salary not disclosed');
  assert.match(ai.location, /Ho Chi Minh/);

  const b = await upload(rec.id, CSV, rec.cookie);
  assert.equal(b.status, 201);
  assert.equal(b.body.live, false);
  assert.ok(b.body.jobs.every((j) => j.status === 'draft' && j.fullDescription), 'recruiter imports: drafts with Role details');

  // Re-import: nothing duplicated; complete roles are skipped.
  const c = await upload(jf.id, CSV, jf.cookie);
  assert.equal(c.body.jobs.length, 0); assert.equal(c.body.skipped, 2); assert.equal(c.body.updated, 0);
});

test('re-importing fills Role details of older imports without touching recruiter edits', async () => {
  const jf = await register('Job Finder Two');
  process.env.JOBFINDER_ACCOUNT_IDS = jf.id;
  const first = await upload(jf.id, CSV, jf.cookie);
  const [old, edited] = first.body.jobs;
  // Like an import made before the fix: no Role details, the whole text flattened into the summary.
  const flat = `AI Engineer Location: Ho Chi Minh City ${JD.replace(/\s+/g, ' ')}`.repeat(3);
  let p = await call('PATCH', `/api/jobs/${old.id}`, { fullDescription: '', description: flat }, jf.cookie);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  // A role the recruiter wrote their own Role details for must be left alone.
  p = await call('PATCH', `/api/jobs/${edited.id}`, { fullDescription: 'My own text', description: 'My own summary' }, jf.cookie);
  assert.equal(p.status, 200, JSON.stringify(p.body));

  const again = await upload(jf.id, CSV, jf.cookie);
  assert.equal(again.body.updated, 1); assert.equal(again.body.skipped, 1); assert.equal(again.body.jobs.length, 0);
  const read = async (id) => { const r = await call('PATCH', `/api/jobs/${id}`, {}, jf.cookie); return r.body.job || r.body; };
  const o = await read(old.id); const e = await read(edited.id);
  assert.equal(o.fullDescription, JD); assert.match(o.description, /^You will design/);
  assert.equal(e.fullDescription, 'My own text'); assert.equal(e.description, 'My own summary');
});

