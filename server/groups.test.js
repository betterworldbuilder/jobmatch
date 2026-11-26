import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { eligibilityOf, openTo, placeOf, slugify } from './groups.js';

/* Job groups (founder, 2026-11-25): admin-managed groups with public links /app/{slug}, card-only public views,
   full details behind sign-in, recruiter/JobFinder/admin assignment rules, filters (country › city › nationality),
   LinkedIn source counting, and the Applications data. Synthetic accounts only. */
const DB_PATH = `/tmp/jobmatch-groups-test-${process.pid}.json`;
const SECRET = 'groups-test-secret';
let server; let base;
async function call(method, path, body, cookie) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH; process.env.ADMIN_PROMOTE_SECRET = SECRET;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const headers = { 'Content-Type': 'application/json', ...(typeof cookie === 'object' ? cookie : cookie ? { Cookie: cookie } : {}) };
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
const pid = process.pid;
async function register(role, name, extra = {}) {
  const r = await call('POST', '/api/auth/register', { role, ...(role === 'employer' ? { kind: 'company' } : {}), name, email: `${name.toLowerCase().replace(/\W+/g, '.')}-${pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.user.id, cookie: r.session };
}
const ROLE = (over = {}) => ({ status: 'active', type: 'Full-time', workMode: 'Hybrid', hiringRadiusKm: 40, salaryRange: { min: 40000, max: 60000, currency: 'USD' }, requiredSkillsDetail: [{ name: 'Python', weight: 3 }], description: 'A real role with a long description. '.repeat(20), ...over });

test('helpers: slug, place, eligibility', () => {
  assert.equal(slugify('AI & Machine Learning'), 'ai-machine-learning');
  assert.deepEqual(placeOf({ location: 'Hanoi, Vietnam' }), { country: 'Vietnam', city: 'Hanoi' });
  assert.deepEqual(placeOf({ location: 'Vietnam' }), { country: 'Vietnam', city: null });
  assert.deepEqual(placeOf({ location: 'Somewhere' }), { country: null, city: 'Somewhere' }, 'unknown single word is not made a country');
  assert.deepEqual(placeOf({ location: 'Austin, TX, USA' }), { country: 'United States', city: 'Austin' });
  assert.equal(eligibilityOf({}).kind, 'unknown');
  assert.equal(eligibilityOf({ workVisaRequired: true }).kind, 'right-to-work');
  assert.ok(openTo(eligibilityOf({ workVisaRequired: false, authorizedNationalities: { mode: 'europe' } }), 'France'));
  assert.ok(!openTo(eligibilityOf({ workVisaRequired: false, authorizedNationalities: { mode: 'europe' } }), 'Vietnam'));
  assert.ok(!openTo(eligibilityOf({}), 'Vietnam'), 'not stated is never a yes');
});

test('job groups end to end', async () => {
  // Admin.
  const adminEmail = `admin-${pid}@example.com`;
  assert.equal((await call('POST', '/api/admin/bootstrap-admin', { email: adminEmail }, { 'x-admin-promote-secret': SECRET })).status, 200);
  const link = await call('POST', '/api/admin/password-link', { email: adminEmail }, { 'x-admin-promote-secret': SECRET });
  const token = new URL(link.body.link).searchParams.get('admin-reset');
  await call('POST', '/api/admin/password-reset', { token, password: 'a-strong-admin-pass' });
  const admin = (await call('POST', '/api/auth/login', { email: adminEmail, password: 'a-strong-admin-pass' })).session;

  // The 6 starting groups exist and are public (Cybersecurity + Marketing added 2026-11-26).
  const groups = (await call('GET', '/api/public/groups')).body.groups;
  assert.deepEqual(groups.map((g) => g.slug), ['ai-machine-learning', 'data', 'cloud-devops', 'software-engineering', 'cybersecurity', 'marketing']);
  const id = Object.fromEntries(groups.map((g) => [g.slug, g.id]));

  // Only admins create groups; names must be unique and not reserved.
  const rec = await register('employer', 'Real Recruiter');
  assert.equal((await call('POST', '/api/admin/job-groups', { name: 'Security' }, rec.cookie)).status, 403);
  const sec = await call('POST', '/api/admin/job-groups', { name: 'Security & Privacy', description: 'Security roles', examples: 'Security Engineer, Pentester' }, admin);
  assert.equal(sec.status, 201, JSON.stringify(sec.body)); assert.equal(sec.body.group.slug, 'security-privacy');
  assert.match(sec.body.group.url, /\/app\/security-privacy$/);
  assert.equal((await call('POST', '/api/admin/job-groups', { name: 'Data' }, admin)).status, 400, 'duplicate link name');
  assert.equal((await call('POST', '/api/admin/job-groups', { name: 'Assets' }, admin)).status, 400, 'reserved link name');

  // Recruiter assigns groups to own jobs (several groups); others cannot.
  const other = await register('employer', 'Other Recruiter');
  const mlops = await call('POST', '/api/jobs', { employerId: rec.id, ...ROLE({ title: 'MLOps Engineer', location: 'Hanoi, Vietnam', workVisaRequired: false, authorizedNationalities: { mode: 'custom', custom: ['Vietnam', 'Singapore'] } }), jobGroups: [id['ai-machine-learning'], id['cloud-devops'], 'g-made-up'] }, rec.cookie);
  assert.equal(mlops.status, 201, JSON.stringify(mlops.body));
  assert.deepEqual(mlops.body.job.jobGroups, [id['ai-machine-learning'], id['cloud-devops']], 'unknown group ids are dropped');
  const de = await call('POST', '/api/jobs', { employerId: rec.id, ...ROLE({ title: 'Data Engineer', location: 'Austin, TX, USA', workVisaRequired: true }), jobGroups: [id.data] }, rec.cookie);
  const ungrouped = await call('POST', '/api/jobs', { employerId: rec.id, ...ROLE({ title: 'Data Analyst', location: 'Paris, France' }) }, rec.cookie);
  const draft = await call('POST', '/api/jobs', { employerId: rec.id, ...ROLE({ title: 'Data Draft', status: 'draft', location: 'Berlin, Germany' }), jobGroups: [id.data] }, rec.cookie);
  assert.equal((await call('PATCH', `/api/jobs/${de.body.job.id}`, { jobGroups: [id.data, id['software-engineering']] }, other.cookie)).status, 403, 'not their job');
  assert.equal((await call('PATCH', `/api/jobs/${ungrouped.body.job.id}`, { jobGroups: [id.data] }, rec.cookie)).status, 200, 'owner can add a group later');

  // Public group page: live, real, grouped jobs only; card fields only.
  const data = await call('GET', '/api/public/groups/data?notrack=1');
  assert.equal(data.status, 200);
  const titles = data.body.jobs.map((j) => j.title).sort();
  assert.deepEqual(titles, ['Data Analyst', 'Data Engineer'], 'drafts and other groups stay out');
  const card = data.body.jobs.find((j) => j.title === 'Data Engineer');
  assert.equal(card.salary, null); assert.equal(card.salaryAfterMatch, true, 'members\' salary only after a match');
  assert.ok(card.preview.length <= 300); assert.equal(card.description, undefined); assert.equal(card.recruiter, undefined);
  assert.equal(card.country, 'United States'); assert.equal(card.city, 'Austin'); assert.equal(card.eligibility.kind, 'right-to-work');
  const ai = (await call('GET', '/api/public/groups/ai-machine-learning?notrack=1')).body.jobs;
  const cloud = (await call('GET', '/api/public/groups/cloud-devops?notrack=1')).body.jobs;
  assert.ok(ai.some((j) => j.title === 'MLOps Engineer') && cloud.some((j) => j.title === 'MLOps Engineer'), 'one job, two groups');
  assert.ok(!JSON.stringify(data.body).includes(draft.body.job.id));

  // Country › city › nationality.
  assert.deepEqual(data.body.facets.countries.map((c) => c.name), ['France', 'United States']);
  const fr = (await call('GET', '/api/public/groups/data?notrack=1&country=France')).body;
  assert.deepEqual(fr.jobs.map((j) => j.title), ['Data Analyst']); assert.deepEqual(fr.facets.cities.map((c) => c.name), ['Paris']);
  const vn = (await call('GET', '/api/public/groups/ai-machine-learning?notrack=1&nationality=Vietnam')).body;
  assert.deepEqual(vn.jobs.map((j) => j.title), ['MLOps Engineer']);
  const us = (await call('GET', '/api/public/groups/data?notrack=1&nationality=Vietnam')).body;
  assert.equal(us.jobs.length, 0, 'right-to-work and not-stated jobs are not claimed as open'); assert.equal(us.nationalityNotStated, 1);

  // Rename keeps the old link working; turning a group off hides its page.
  const renamed = await call('PATCH', `/api/admin/job-groups/${sec.body.group.id}`, { slug: 'security' }, admin);
  assert.equal(renamed.body.group.slug, 'security');
  assert.equal((await call('GET', '/api/public/groups/security-privacy?notrack=1')).body.redirect, 'security');
  await call('PATCH', `/api/admin/job-groups/${sec.body.group.id}`, { active: false }, admin);
  assert.equal((await call('GET', '/api/public/groups/security?notrack=1')).status, 404);

  // One public job: card only; full details need a sign-in (enforced by the server).
  const pub = await call('GET', `/api/public/job/${de.body.job.id}?notrack=1`);
  assert.equal(pub.status, 200); assert.equal(pub.body.job.description, undefined);
  assert.equal((await call('GET', `/api/public/job/${draft.body.job.id}`)).status, 404);
  assert.equal((await call('GET', `/api/jobs/${de.body.job.id}/details`)).status, 401, 'signed out: no details');
  const cand = await register('candidate', 'Linh Group', { source: { src: 'linkedin', group: 'data', jobId: de.body.job.id } });
  const det = await call('GET', `/api/jobs/${de.body.job.id}/details`, null, cand.cookie);
  assert.equal(det.status, 200); assert.ok(det.body.job.description.length > 300); assert.equal(det.body.liked, false, 'registering never applies');
  assert.equal(det.body.job.salaryRange, undefined, 'salary still after a match');

  // Applying from a LinkedIn link is counted and shown to the recruiter; the candidate sees it in Jobs Applied.
  assert.equal((await call('POST', '/api/swipes', { actorId: cand.id, targetId: de.body.job.id, targetType: 'job', direction: 'like' }, cand.cookie)).status, 201);
  const cb = (await call('GET', `/api/bootstrap?userId=${cand.id}`, null, cand.cookie)).body;
  assert.equal(cb.applied.length, 1); assert.equal(cb.applied[0].jobId, de.body.job.id); assert.equal(cb.applied[0].src, 'linkedin');
  const rb = (await call('GET', `/api/bootstrap?userId=${rec.id}`, null, rec.cookie)).body;
  const row = rb.roleMatches.find((g) => g.job.id === de.body.job.id).candidates.find((c) => c.id === cand.id);
  assert.equal(row.appliedSrc, 'linkedin'); assert.ok(row.appliedAt); assert.equal(row.acquisition, undefined, 'sign-up source stays private');
  const kpis = (await call('GET', '/api/admin/kpis', undefined, admin)).body;
  assert.ok(kpis, 'admin kpis still answer');

  // Admin corrects any job's groups; a recruiter cannot use that route.
  assert.equal((await call('PATCH', `/api/admin/jobs/${de.body.job.id}/groups`, { jobGroups: [id['software-engineering']] }, rec.cookie)).status, 403);
  assert.deepEqual((await call('PATCH', `/api/admin/jobs/${de.body.job.id}/groups`, { jobGroups: [id['software-engineering']] }, admin)).body.jobGroups, [id['software-engineering']]);

  // Browser-only steps are a short whitelist.
  assert.equal((await call('POST', '/api/public/event', { name: 'grp_gate_shown' })).status, 204);
  assert.equal((await call('POST', '/api/public/event', { name: 'match_created' })).status, 400);

  // Link previews describe the group, never gated details.
  const res = await fetch(`${base}/api/public/share/app/data`); const html = await res.text();
  assert.match(html, /og:title" content="Data jobs · JobsMatchNow"/); assert.ok(!html.includes('long description'));
});
