import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { createSeed } from './seed.js';
import { DEMO_CANDIDATE_TARGET, DEMO_RECRUITER_TARGET } from './demo-crowd.js';

/* (1) The demo crowd: at least 50 candidates and 25 recruiters, every profile filled.
   (2) The full sign-up journeys, start to first conversation, for a candidate and a recruiter. */
const DB_PATH = `/tmp/jobmatch-signup-test-${process.pid}.json`;
let server; let base;
async function call(method, path, body, cookie) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

test('demo crowd: 50+ candidates and 25+ recruiters, all demo, every key field filled, ids unique', () => {
  const seed = createSeed();
  const candidates = seed.users.filter((u) => u.role === 'candidate' && u.demo);
  const recruiters = seed.users.filter((u) => u.role === 'employer' && u.demo);
  assert.ok(candidates.length >= DEMO_CANDIDATE_TARGET, `candidates: ${candidates.length}`);
  assert.ok(recruiters.length >= DEMO_RECRUITER_TARGET, `recruiters: ${recruiters.length}`);
  for (const col of ['users', 'jobs', 'matches', 'swipes', 'messages']) {
    const ids = seed[col].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `${col} ids are unique`);
  }
  assert.ok(seed.users.every((u) => u.demo === true && u.demoTemplate === true), 'every seeded user is a demo template');
  const CAND = ['name', 'email', 'title', 'headline', 'city', 'country', 'photo', 'skills', 'languageDetail', 'preferences', 'workExperience', 'education', 'presentation', 'humanSkills', 'interests', 'recommendations', 'contactChannels', 'links'];
  for (const c of candidates) {
    const missing = CAND.filter((k) => empty(c[k]));
    assert.deepEqual(missing, [], `${c.id} missing ${missing}`);
    assert.ok(c.preferences.salary?.min && c.preferences.desiredRoles?.length && c.preferences.workMode, `${c.id} preferences`);
    assert.match(c.email, /\.demo$|demo\.jobsmatchnow\.app$/, `${c.id} uses a demo email domain`);
  }
  const REC = ['name', 'email', 'title', 'company', 'photo', 'about', 'industry', 'companySize', 'headquarters', 'benefits', 'techStack', 'contactEmail', 'calendarLink', 'regions'];
  for (const r of recruiters) {
    const missing = REC.filter((k) => empty(r[k]));
    assert.deepEqual(missing, [], `${r.id} missing ${missing}`);
    assert.ok(seed.jobs.some((j) => j.employerId === r.id), `${r.id} has at least one open role`);
  }
  // Every demo candidate shows up somewhere: a match, or a recruiter who likes them.
  const touched = new Set([...seed.matches.map((m) => m.candidateId), ...seed.swipes.filter((s) => s.targetType === 'candidate').map((s) => s.targetId)]);
  const lonely = candidates.filter((c) => !touched.has(c.id)).map((c) => c.id);
  assert.deepEqual(lonely, [], 'every demo candidate has a match or a like');
  // Every match has a hiring-stage timeline and points at real records.
  const userIds = new Set(seed.users.map((u) => u.id)); const jobIds = new Set(seed.jobs.map((j) => j.id));
  for (const m of seed.matches) {
    assert.ok(userIds.has(m.candidateId) && userIds.has(m.employerId) && jobIds.has(m.jobId), `${m.id} references exist`);
    assert.ok(m.pipeline?.length >= 4, `${m.id} has hiring stages`);
  }
});

test('demo login lists the crowd (candidates and recruiters) and each profile opens', async () => {
  const { body } = await call('GET', '/api/auth/profiles');
  const list = body.profiles || [];
  assert.ok(list.filter((p) => p.role === 'candidate').length >= DEMO_CANDIDATE_TARGET, 'candidates in the demo login list');
  assert.ok(list.filter((p) => p.role === 'employer').length >= DEMO_RECRUITER_TARGET, 'recruiters in the demo login list');
  for (const id of ['candidate-demo-30', 'employer-demo-20']) {
    const boot = await call('GET', `/api/bootstrap?userId=${id}`);
    assert.equal(boot.status, 200, `${id}: ${JSON.stringify(boot.body).slice(0, 200)}`);
    assert.ok(boot.body.matches.length > 0, `${id} has matches`);
  }
});

test('candidate sign-up: register → profile wizard → deck → like → match → message', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Signup Candidate', email: `signup-c-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const me = reg.body.user; const ck = reg.session;
  assert.equal((await call('GET', '/api/auth/me', undefined, ck)).body.user.id, me.id, 'session works');
  // Wizard steps, saved one at a time like the app does.
  const steps = [
    { name: 'Signup Candidate', city: 'Ho Chi Minh City', country: 'Vietnam', nationality: 'Vietnam', workAuthorization: 'Citizen', title: 'Frontend Engineer', headline: 'Frontend Engineer · React, TypeScript' },
    { skillsDetail: [{ name: 'React', level: 4, years: 5 }, { name: 'TypeScript', level: 4, years: 4 }], languageDetail: [{ name: 'English', level: 'Fluent' }] },
    { preferences: { desiredRoles: ['Senior Frontend Engineer'], employmentTypes: ['Full-time'], workMode: { mode: 'remote' }, salary: { min: 40000, max: 60000, currency: 'USD' }, availability: '2 weeks' } },
    { presentation: 'I build React products and like small teams.', humanSkills: ['Communication'], interests: ['Running'] },
    { links: { github: 'https://github.com/example' }, onboarding: false },
  ];
  let user;
  for (const [i, s] of steps.entries()) {
    const r = await call('PATCH', `/api/users/${me.id}`, s, ck);
    assert.equal(r.status, 200, `step ${i + 1}: ${JSON.stringify(r.body)}`);
    user = r.body.user;
  }
  assert.equal(user.onboarding, false, 'wizard finished');
  assert.ok(user.completeness > 50, `completeness grew: ${user.completeness}`);
  const boot = await call('GET', `/api/bootstrap?userId=${me.id}`, undefined, ck);
  assert.equal(boot.status, 200);
  // Real accounts never see demo profiles (demo/real wall): a new candidate gets 2 starter roles instead.
  assert.ok(boot.body.jobs.length >= 2, `deck has roles: ${boot.body.jobs.length}`);
  assert.ok(boot.body.jobs.every((j) => !j.demo), 'no demo roles in a real account\'s deck');
  // Saving skills creates starter roles a demo recruiter already liked → liking one is a match.
  const starter = boot.body.jobs.find((j) => j.id === `sample-job-${me.id}-0`);
  assert.ok(starter, 'starter role in the deck');
  const like = await call('POST', '/api/swipes', { actorId: me.id, targetType: 'job', targetId: starter.id, direction: 'like' }, ck);
  assert.equal(like.status, 201, JSON.stringify(like.body));
  assert.ok(like.body.match, 'it is a match');
  const msg = await call('POST', '/api/messages', { matchId: like.body.match.id, senderId: me.id, text: 'Hi! Happy to talk this week.' }, ck);
  assert.equal(msg.status, 201, JSON.stringify(msg.body));
  // Status, then log out and back in with the password.
  assert.equal((await call('PATCH', `/api/users/${me.id}`, { jobStatus: { kind: 'waiting' } }, ck)).status, 200);
  await call('POST', '/api/auth/logout', {}, ck);
  const login = await call('POST', '/api/auth/login', { email: `signup-c-${process.pid}@example.com`, password: 'correct-horse-battery' });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal((await call('POST', '/api/auth/login', { email: `signup-c-${process.pid}@example.com`, password: 'wrong-password-123' })).status, 401);
});

test('recruiter sign-up: register → company profile → post a role → deck → like a candidate who liked the role → match', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'employer', kind: 'company', name: 'Signup Recruiter', email: `signup-r-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const me = reg.body.user; const ck = reg.session;
  const profile = await call('PATCH', `/api/users/${me.id}`, { company: 'Signup Startup', title: 'CTO', industry: 'SaaS', companySize: '11–50', headquarters: 'Austin, TX', about: 'We build workflow software.', onboarding: false }, ck);
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  const job = await call('POST', '/api/jobs', { employerId: me.id, postSource: 'quick_post', status: 'active', type: 'Full-time', title: 'Senior Frontend Engineer', location: 'Remote', workMode: 'Remote', hiringRadiusKm: 40, salaryRange: { min: 40000, max: 60000, currency: 'USD' }, requiredSkillsDetail: [{ name: 'React', weight: 3 }, { name: 'TypeScript', weight: 2 }], description: 'Own our React app.' }, ck);
  assert.equal(job.status, 201, JSON.stringify(job.body));
  const jobId = job.body.job.id;
  const boot = await call('GET', `/api/bootstrap?userId=${me.id}`, undefined, ck);
  assert.equal(boot.status, 200);
  // Real accounts never see demo profiles (demo/real wall): posting a role adds 2 starter candidates who already like it.
  assert.ok(boot.body.candidates.every((c) => !c.demo), 'no demo candidates in a real recruiter\'s deck');
  assert.ok(boot.body.candidates.every((c) => c.email === undefined && c.jobStatus === undefined), 'no contact details or private status before a match');
  const cand = boot.body.candidates.find((c) => c.id === `sample-cand-${jobId}-0`);
  assert.ok(cand, 'starter candidate is in the deck');
  const like = await call('POST', '/api/swipes', { actorId: me.id, targetType: 'candidate', targetId: cand.id, jobId, direction: 'like' }, ck);
  assert.equal(like.status, 201, JSON.stringify(like.body));
  assert.ok(like.body.match, 'it is a match');
  const msg = await call('POST', '/api/messages', { matchId: like.body.match.id, senderId: me.id, text: 'Hi! Coffee chat this week?' }, ck);
  assert.equal(msg.status, 201, JSON.stringify(msg.body));
  const later = await call('GET', `/api/bootstrap?userId=${me.id}`, undefined, ck);
  assert.ok(later.body.matches.some((m) => m.id === like.body.match.id), 'the match shows on the recruiter home');
});
