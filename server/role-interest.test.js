import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { __setTestSender } from './mailer.js';
import { heuristicParse } from './jobs.js';
import { interestEmail } from './role-interest.js';

/* Recruiter details + interest emails for the JobFinder account's roles (founder, 2026-11-25). Synthetic users; a fake
   mailer records the emails, so no real recruiter is ever emailed. */
const DB_PATH = `/tmp/jobmatch-role-interest-test-${process.pid}.json`;
const pid = process.pid;
let server; let base;
const sent = [];
__setTestSender(async (mail) => { if (/^A candidate is interested in your .+ role$/.test(mail.subject || '')) sent.push(mail); return { messageId: `<t-${sent.length}@jobsmatchnow>` }; });
async function boot() {
  if (base) return;
  process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
async function call(method, path, body, cookie) {
  await boot();
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, body: json, text, session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
async function register(role, name) {
  const r = await call('POST', '/api/auth/register', { role, ...(role === 'employer' ? { kind: 'company' } : {}), name, email: `${name.toLowerCase().replace(/\s+/g, '.')}-${pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.user.id, cookie: r.session };
}

const JD = `Company: Acme Data

ABOUT THE ROLE:
You will build reliable data pipelines with Python, SQL and Airflow for our analytics teams across Asia.

REQUIREMENTS:
- 3+ years of data engineering with Python and SQL.
- Good English.

HOW TO APPLY:
Contact: Jane Doe
Send your CV to jane.doe@acme-data.io or call +84 90 123 4567.`;

test('parser finds the recruiter email, phone and name in the job text', () => {
  const p = heuristicParse(`Data Engineer\n${JD}`);
  assert.equal(p.contactEmail, 'jane.doe@acme-data.io');
  assert.equal(p.contactPhone, '+84 90 123 4567');
  assert.equal(p.recruiterName, 'Jane Doe');
  assert.equal(p.company, 'Acme Data');
});

test('the interest email follows the founder template: role link on JobsMatchNow and "Connect with candidate"', () => {
  const base = { job: { title: 'Data Engineer', company: 'Acme Data', recruiterName: 'Jane Doe', externalUrl: 'https://www.linkedin.com/jobs/view/123/' },
    candidate: { name: 'Linh Tran', email: 'secret@example.com' }, origin: 'https://jobsmatchnow.com', unsubscribeUrl: 'https://jobsmatchnow.com/u',
    profileUrl: 'https://jobsmatchnow.com/linh.tran', roleUrl: 'https://jobsmatchnow.com/role/data/dataeng-1' };
  const m = interestEmail(base);
  assert.equal(m.subject, 'A candidate is interested in your Data Engineer role');
  // Founder's mail template (2026-11-26).
  assert.match(m.text, /^Hello Jane,\n\nIt’s your lucky day! 🎉/);
  assert.match(m.text, /Our team at JobsMatchNow has decided to help you hire better and faster/);
  assert.match(m.text, /great fit for your Data Engineer position at Acme Data\./);
  // The posting link is always the role on JobsMatchNow, never the outside site.
  assert.match(m.text, /Your job posting:\nhttps:\/\/jobsmatchnow\.com\/role\/data\/dataeng-1\n/);
  assert.ok(!m.text.includes('linkedin.com'), 'no outside posting link');
  assert.match(m.text, /Candidate profile:\nhttps:\/\/jobsmatchnow\.com\/linh\.tran/);
  assert.match(m.text, /The candidate is interested in connecting with you\./);
  assert.match(m.text, /Who are we\?\n.*\n\nWhat problem do we solve\?\n.*\n\nHow much does it cost\?\nYour first trial month is free/);
  // With a claim link, the posting link carries the claim token (recruiter view + quick sign-up).
  const withClaim = interestEmail({ ...base, claimLink: 'https://jobsmatchnow.com/claim/j-1/0123456789abcdef0123456789abcdef' });
  assert.match(withClaim.text, /Your job posting:\nhttps:\/\/jobsmatchnow\.com\/role\/data\/dataeng-1\?claim=j-1\.0123456789abcdef0123456789abcdef/);
  assert.match(withClaim.text, /See all candidates for this role and reply for free:\nhttps:\/\/jobsmatchnow\.com\/claim\/j-1\//);
  assert.match(m.text, /Not a member yet\? Join us at https:\/\/jobsmatchnow\.com\/app\//);
  assert.match(m.text, /Have an awesome day,\nJobMatcher\nThe JobsMatchNow team/);
  // HTML version: small logo on top, same links, escaped values.
  assert.match(m.html, /<img src="https:\/\/jobsmatchnow\.com\/logo\.png" width="36" height="36"/);
  assert.match(m.html, /<img src="https:\/\/jobsmatchnow\.com\/email-hero\.jpg" width="560"[^>]*>[\s\S]*Sent at the candidate/, 'small hero image at the bottom');
  assert.ok(m.html.includes('href="https://jobsmatchnow.com/linh.tran"') && m.html.includes('<b>Data Engineer</b>'));
  assert.ok(!interestEmail({ ...base, job: { ...base.job, title: '<script>x' } }).html.includes('<script>'), 'title escaped');
  assert.match(m.text, /Sent at the candidate’s request through JobsMatchNow\./);
  assert.ok(!m.text.includes('secret@example.com'), 'no candidate email');
  // No LinkedIn URL: the role's JobsMatchNow page is used.
  assert.match(interestEmail({ ...base, job: { ...base.job, externalUrl: undefined } }).text, /Your job posting:\nhttps:\/\/jobsmatchnow\.com\/role\/data\/dataeng-1/);
});

test('JobFinder role: import keeps the private contact; a real candidate apply emails the recruiter once', async () => {
  const jf = await register('employer', 'Job Finder Interest');
  process.env.JOBFINDER_ACCOUNT_IDS = jf.id;
  const csv = `id,title,location,description\nri-1,Data Engineer,Hanoi,"${JD.replace(/"/g, '""')}"\n`;
  const up = await fetch(`${base}/api/jobs/import-file?employerId=${jf.id}&sourceSystem=ats_export`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': 'jobs.csv', Cookie: jf.cookie }, body: csv });
  const imported = await up.json();
  assert.equal(up.status, 201, JSON.stringify(imported));
  const job = imported.jobs[0];
  assert.equal(job.recruiterName, 'Jane Doe'); assert.equal(job.company, 'Acme Data');
  const own = (await call('GET', `/api/bootstrap?userId=${jf.id}`, undefined, jf.cookie)).body.jobs.find((j) => j.id === job.id);
  assert.equal(own.contactEmail, 'jane.doe@acme-data.io'); assert.equal(own.contactPhone, '+84 90 123 4567');

  const cand = await register('candidate', 'Interest Candidate');
  const seen = (await call('GET', `/api/bootstrap?userId=${cand.id}`, undefined, cand.cookie)).body;
  const card = seen.jobs.find((j) => j.id === job.id);
  assert.ok(card, 'role in the candidate deck');
  // External role (founder, 2026-11-26): company and recruiter stay hidden until the recruiter joins.
  assert.equal(card.company, 'Confidential company'); assert.equal(card.recruiter, undefined);
  const leaks = Object.entries(card).filter(([, v]) => /Acme Data|Jane Doe/.test(JSON.stringify(v ?? ''))).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 160)}`);
  assert.deepEqual(leaks, [], 'company and recruiter never reach candidates');
  assert.ok(!JSON.stringify(seen).includes('acme-data.io') && !JSON.stringify(seen).includes('123 4567'), 'email and phone never reach candidates');

  const like = await call('POST', '/api/swipes', { actorId: cand.id, targetId: job.id, targetType: 'job', direction: 'like' }, cand.cookie);
  assert.equal(like.status, 201, JSON.stringify(like.body));
  assert.equal(like.body.recruiterNotified, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'jane.doe@acme-data.io'); assert.equal(sent[0].replyTo, 'Greatcandidates@jobsmatchnow.com');
  assert.equal(sent[0].fromName, 'JobMatcher at JobsMatchNow');
  // The candidate's public profile address, and (no LinkedIn URL in this file) the role's JobsMatchNow page.
  const me = (await call('GET', `/api/bootstrap?userId=${cand.id}`, undefined, cand.cookie)).body.viewer;
  assert.match(me.profileSlug, /^interest\.candidate\d*$/);
  assert.ok(sent[0].text.includes(`/${me.profileSlug}`), 'profile link in the email');
  const roleLink = sent[0].text.match(/Your job posting:\n(\S+)/)[1];
  assert.match(sent[0].html, /logo\.png/, 'HTML version with the logo is sent');
  assert.match(roleLink, /\/role\/data\/dataeng-[a-z0-9]+$/);
  // Both public addresses resolve.
  // Anonymous visitors get the blurred teaser (founder, 2026-11-26): no name, photo or about until they register.
  const prof = await call('GET', `/api/public/profile/${me.profileSlug}`);
  assert.equal(prof.status, 200); assert.equal(prof.body.profile.locked, true); assert.equal(prof.body.profile.name, ''); assert.equal(prof.body.profile.email, undefined);
  assert.ok(!JSON.stringify(prof.body).includes('Interest Candidate'), 'the name never reaches a visitor');
  // A signed-in recruiter gets the full profile.
  const fullProf = await call('GET', `/api/public/profile/${me.profileSlug}`, undefined, jf.cookie);
  assert.equal(fullProf.body.profile.name, 'Interest Candidate'); assert.equal(fullProf.body.profile.locked, undefined);
  const role = await call('GET', `/api/public/role/${roleLink.split('/').pop()}`);
  assert.equal(role.status, 200); assert.equal(role.body.jobId, job.id);
  assert.equal((await call('GET', '/api/public/role/nope-zzz')).status, 404);

  // Demo candidates never trigger an email.
  const demo = await call('POST', '/api/auth/login', { userId: 'candidate-demo' });
  await call('POST', '/api/swipes', { actorId: 'candidate-demo', targetId: job.id, targetType: 'job', direction: 'like' }, demo.session);
  assert.equal(sent.length, 1, 'no email for a demo candidate');

  // A candidate who turned their public profile off is never sent (no approved link) and their page is private.
  const shy = await register('candidate', 'Shy Candidate');
  assert.equal((await call('PATCH', `/api/users/${shy.id}`, { publicProfile: false }, shy.cookie)).status, 200);
  const shyLike = await call('POST', '/api/swipes', { actorId: shy.id, targetId: job.id, targetType: 'job', direction: 'like' }, shy.cookie);
  assert.equal(shyLike.body.recruiterNotified, 'no_consent'); assert.equal(sent.length, 1);
  const shySlug = (await call('GET', `/api/bootstrap?userId=${shy.id}`, undefined, shy.cookie)).body.viewer.profileSlug;
  assert.equal((await call('GET', `/api/public/profile/${shySlug}`)).status, 404);

  // Unsubscribe link works; later applies are suppressed.
  const link = sent[0].text.match(/https?:\/\/\S+\/api\/role-interest\/unsubscribe\?\S+/)[0].replace(/^https?:\/\/[^/]+/, '');
  const un = await call('GET', link);
  assert.match(un.text, /You are unsubscribed/);
  assert.match((await call('GET', link.replace(/s=\w+/, 's=bad'))).text, /Link not valid/);
  const cand2 = await register('candidate', 'Second Candidate');
  const like2 = await call('POST', '/api/swipes', { actorId: cand2.id, targetId: job.id, targetType: 'job', direction: 'like' }, cand2.cookie);
  assert.equal(like2.body.recruiterNotified, 'suppressed'); assert.equal(sent.length, 1);
});
