import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

/* Job Details: the recruiter pastes the whole job description ("Role details"); a short summary is derived
   from it when none is given; must have / nice to have / languages are saved. */
const DB_PATH = `/tmp/jobmatch-jobdetails-test-${process.pid}.json`;
let server; let base;
async function call(method, path, body, cookie) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

const JD = `About the job\nWe build tools for small clinics and we are hiring our first platform engineer to own the backend end to end.\n\nThe role\nYou will:\nBuild APIs and background jobs.\nSet up tests and monitoring.\n\nHow to apply\nLike the role on JobsMatchNow.`;

test('a pasted full job description is saved whole and gives the short summary when none is set', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'employer', name: 'JD Owner', email: `jd-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  const ck = reg.session; const me = reg.body.user.id;
  const created = await call('POST', '/api/jobs', {
    employerId: me, postSource: 'quick_post', status: 'active', type: 'Full-time', title: 'Platform Engineer', location: 'Remote', workMode: 'Remote',
    salaryRange: { min: 40000, max: 60000, currency: 'USD' }, requiredSkillsDetail: [{ name: 'Node.js', weight: 3 }],
    niceToHaves: ['Postgres'], requiredLanguages: ['English'], fullDescription: JD,
  }, ck);
  assert.equal(created.status, 201, created.text);
  const job = created.body.job;
  assert.equal(job.fullDescription, JD, 'full text kept with its line breaks');
  assert.match(job.description, /^We build tools for small clinics/, 'summary = first real paragraph');
  assert.deepEqual(job.niceToHaves, ['Postgres']); assert.deepEqual(job.requiredLanguages, ['English']);
  // Clearing the full description removes it; the summary stays.
  const cleared = await call('PATCH', `/api/jobs/${job.id}`, { fullDescription: '' }, ck);
  assert.equal(cleared.status, 200, cleared.text);
  assert.equal((cleared.body.job || cleared.body).fullDescription, undefined);
});

test('the demo Cloud Architect role carries a full job description', async () => {
  const boot = await call('GET', '/api/bootstrap?userId=candidate-demo');
  const job = boot.body.jobs.find((j) => j.id === 'j-sarah-cloud');
  assert.ok(job?.fullDescription?.includes('What we are looking for'));
  assert.ok(job.niceToHaves.length >= 1 && job.requiredLanguages.length >= 1);
});
