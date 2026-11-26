import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { __setTestSender } from './mailer.js';

/* JobFinder acceptance tests (founder spec, 2026-11-25). Synthetic users only; a fake mailer records "sent" emails,
   so no real recruiter is ever emailed. */
const DB_PATH = `/tmp/jobmatch-jobfinder-test-${process.pid}.json`;
let server; let base;
const sent = [];
let failNext = false;
__setTestSender(async (msg) => { if (failNext) { failNext = false; const e = new Error('smtp down'); e.code = 'ECONNECTION'; throw e; } if (/candidate is interested/.test(msg.subject || '')) sent.push(msg); return { messageId: `<test-${sent.length}@jobsmatchnow>` }; });
async function call(method, path, body, cookie) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, body: json, text, session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });
const pid = process.pid;
async function register(role, name, extra = {}) {
  const r = await call('POST', '/api/auth/register', { role, ...(role === 'employer' ? { kind: 'company' } : {}), name, email: `${name.toLowerCase().replace(/\s+/g, '.')}-${pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.user.id, cookie: r.session, email: r.body.user.email };
}

test('JobFinder end to end: permissions, privacy, consent, sending, fallbacks, claims, matching', async () => {
  const jf = await register('employer', 'Job Finder');
  process.env.JOBFINDER_ACCOUNT_IDS = jf.id;
  const other = await register('employer', 'Other Team');
  const recruiter = await register('employer', 'Real Recruiter');
  const cand = await register('candidate', 'Linh Tran');
  const auto = await register('candidate', 'Minh Pham');
  await call('PATCH', `/api/users/${cand.id}`, { skillsDetail: [{ name: 'Python', level: 5 }, { name: 'Spark', level: 4 }], links: { linkedin: 'linkedin.com/in/linh-test' } }, cand.cookie);
  await call('PATCH', `/api/users/${auto.id}`, { skillsDetail: [{ name: 'SQL', level: 4 }] }, auto.cookie);

  // 1-2. Only JobFinder (or an admin) can create and modify listings.
  const listing = { title: 'Senior Data Engineer', company: 'Acme AI', location: 'Hanoi, Vietnam', workMode: 'Remote', type: 'Full-time', requiredSkillsDetail: [{ name: 'Python', weight: 3 }, { name: 'Spark', weight: 2 }], description: 'Build data pipelines.', sourceName: 'Company careers page', sourceUrl: 'https://acme.example/careers/42', applyUrl: 'https://acme.example/apply/42', listingStatus: 'published' };
  for (const who of [other, cand]) assert.equal((await call('POST', '/api/jobfinder/jobs', listing, who.cookie)).status, 403);
  assert.equal((await call('POST', '/api/jobfinder/jobs', listing)).status, 403, 'anonymous');
  const created = await call('POST', '/api/jobfinder/jobs', listing, jf.cookie);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const job = created.body.job;
  assert.equal(job.employerId, jf.id); assert.equal(job.status, 'active'); assert.equal(job.jobFinder.reachability, 'apply');
  assert.equal((await call('PATCH', `/api/jobfinder/jobs/${job.id}`, { title: 'x' }, other.cookie)).status, 403);
  // The manager form's plain values are kept (bug found 2026-11-25: skills and salary were dropped, "" refused).
  const plain = await call('POST', '/api/jobfinder/jobs', { title: 'Platform Engineer', company: 'Gamma', location: 'Da Nang, Vietnam', workMode: '', type: '', salary: 'USD 3,000–4,000 / month', requiredSkills: ['Kubernetes', 'Go'], sourceUrl: 'https://gamma.example/1' }, jf.cookie);
  assert.equal(plain.status, 201, JSON.stringify(plain.body));
  assert.deepEqual(plain.body.job.requiredSkills, ['Kubernetes', 'Go']); assert.equal(plain.body.job.salary, 'USD 3,000–4,000 / month');
  assert.equal(plain.body.job.workMode, undefined, 'not stated stays empty');
  // Duplicate guardrail (2026-11-26): refused unless confirmed; once confirmed, still flagged.
  const refused = await call('POST', '/api/jobfinder/jobs', { ...listing, sourceUrl: 'https://other.example/1', listingStatus: 'draft' }, jf.cookie);
  assert.equal(refused.status, 409); assert.match(refused.body.error || '', /^Duplicate role/);
  const dup = await call('POST', '/api/jobfinder/jobs', { ...listing, sourceUrl: 'https://other.example/1', listingStatus: 'draft', allowDuplicate: true }, jf.cookie);
  assert.equal(dup.body.duplicates.length, 1, 'same company + title + location is flagged');

  // 3-4. Public page: JobFinder attribution, pending membership, honest reachability; no private data.
  const pub = await call('GET', `/api/public/jobs/${job.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.job.jobFinder.addedBy, 'JobFinder'); assert.equal(pub.body.job.jobFinder.employerStatus, 'pending');
  assert.equal(pub.body.job.jobFinder.reachability, 'apply'); assert.equal(pub.body.job.jobFinder.source, 'Company careers page');
  assert.equal((await call('GET', `/api/public/jobs/${dup.body.job.id}`)).status, 404, 'drafts are not public');

  // Contact: approval needs a recorded verification; then the employer is reachable by email.
  assert.equal((await call('PUT', `/api/jobfinder/jobs/${job.id}/contact`, { name: 'Hana Le', email: 'hana@acme.example', approved: true }, jf.cookie)).status, 400, 'syntax alone is not verification');
  const contact = await call('PUT', `/api/jobfinder/jobs/${job.id}/contact`, { name: 'Hana Le', email: 'hana@acme.example', verifiedHow: 'Listed on the company careers page as the hiring contact', verifiedAt: '2026-11-25', approved: true }, jf.cookie);
  assert.equal(contact.body.reachability, 'email');

  // 5. Recruiter contact never reaches candidates or the public page.
  const boot = await call('GET', `/api/bootstrap?userId=${cand.id}`, null, cand.cookie);
  const card = boot.body.jobs.find((j) => j.id === job.id);
  assert.ok(card, 'published JobFinder job is in the candidate deck');
  assert.equal(card.jobFinder.reachability, 'email'); assert.equal(card.recruiter, undefined);
  for (const payload of [JSON.stringify(boot.body), JSON.stringify((await call('GET', `/api/public/jobs/${job.id}`)).body)]) assert.ok(!payload.includes('hana@acme.example'), 'contact email hidden');

  // 6, 12. A like saves interest only: no email without consent, and never a match.
  const like = await call('POST', '/api/swipes', { actorId: cand.id, targetId: job.id, targetType: 'job', direction: 'like' }, cand.cookie);
  assert.equal(like.status, 201); assert.equal(like.body.match, null);
  assert.equal(like.body.jobFinder.reachability, 'email'); assert.equal(like.body.jobFinder.outreach, null);
  assert.equal(sent.length, 0);
  assert.equal((await call('POST', `/api/jobfinder/jobs/${job.id}/send`, { share: { skills: ['Python'] } }, cand.cookie)).status, 400, 'consent required');
  // 8. Approved details only; no candidate email without permission.
  const send = await call('POST', `/api/jobfinder/jobs/${job.id}/send`, { consent: true, share: { skills: ['Python', 'Spark', 'Cobol'], profileLink: 'linkedin', replyEmail: false } }, cand.cookie);
  assert.equal(send.body.outreach.status, 'sent', JSON.stringify(send.body));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'hana@acme.example'); assert.equal(sent[0].replyTo, undefined);
  assert.match(sent[0].subject, /A candidate is interested in your Senior Data Engineer opportunity/);
  assert.match(sent[0].text, /Linh Tran discovered your Senior Data Engineer opportunity at Acme AI/);
  assert.match(sent[0].text, /Python, Spark\./); assert.ok(!sent[0].text.includes('Cobol'), 'only skills from the profile');
  assert.ok(sent[0].text.includes('linkedin.com/in/linh-test'));
  assert.ok(!sent[0].text.includes(cand.email), 'candidate email not shared');
  assert.match(sent[0].text, /Sent at the candidate’s request through JobsMatchNow/);
  // 11. Duplicate guard.
  assert.equal((await call('POST', `/api/jobfinder/jobs/${job.id}/send`, { consent: true, share: {} }, cand.cookie)).body.outreach.status, 'sent');
  assert.equal(sent.length, 1, 'no duplicate email for the same candidate and job');

  // 7. One-click preference: off by default, needs explicit agreement, then a Like sends.
  assert.equal((await call('PUT', '/api/jobfinder/consent', { autoSend: true, skills: ['SQL'] }, auto.cookie)).status, 400);
  const pref = await call('PUT', '/api/jobfinder/consent', { autoSend: true, agree: true, skills: ['SQL'], replyEmail: true }, auto.cookie);
  assert.equal(pref.body.consent.autoSend, true);
  const autoLike = await call('POST', '/api/swipes', { actorId: auto.id, targetId: job.id, targetType: 'job', direction: 'like' }, auto.cookie);
  assert.equal(autoLike.body.jobFinder.outreach.status, 'sent');
  assert.equal(sent.length, 2); assert.equal(sent[1].replyTo, auto.email, 'reply-to only because the candidate agreed');

  // 9-10. No approved email: honest fallback; a later contact never sends a saved like without consent.
  const job3 = (await call('POST', '/api/jobfinder/jobs', { ...listing, title: 'ML Engineer', company: 'Beta Labs', sourceUrl: 'https://beta.example/9' }, jf.cookie)).body.job;
  const like3 = await call('POST', '/api/swipes', { actorId: cand.id, targetId: job3.id, targetType: 'job', direction: 'like' }, cand.cookie);
  assert.equal(like3.body.jobFinder.reachability, 'apply'); assert.equal(like3.body.jobFinder.outreach, null);
  assert.equal((await call('POST', `/api/jobfinder/jobs/${job3.id}/send`, { consent: true, share: {} }, cand.cookie)).status, 409);
  const like3b = await call('POST', '/api/swipes', { actorId: auto.id, targetId: job3.id, targetType: 'job', direction: 'like' }, auto.cookie);
  assert.equal(like3b.body.jobFinder.outreach, null, 'auto-send needs a contact at the moment of the like');
  await call('PUT', `/api/jobfinder/jobs/${job3.id}/contact`, { email: 'team@beta.example', verifiedHow: 'Phone call with Beta Labs reception', verifiedAt: '2026-11-25', approved: true }, jf.cookie);
  assert.equal(sent.length, 2, 'saved likes are not sent when a contact appears later');
  const notices = (await call('GET', `/api/bootstrap?userId=${cand.id}`, null, cand.cookie)).body.billingNotifications || [];
  assert.ok(notices.some((n) => n.kind === 'jobfinder_contact' && n.jobId === job3.id), 'the candidate is asked to confirm instead');

  // 11. A provider failure is recorded honestly and can be retried without duplicates.
  failNext = true;
  const failed = await call('POST', `/api/jobfinder/jobs/${job3.id}/send`, { consent: true, share: {} }, cand.cookie);
  assert.equal(failed.body.outreach.status, 'failed');
  const retried = await call('POST', `/api/jobfinder/jobs/${job3.id}/send`, { consent: true, share: {} }, cand.cookie);
  assert.equal(retried.body.outreach.status, 'sent'); assert.equal(sent.length, 3);

  // Unsubscribe: the recruiter's one-click link suppresses further emails.
  const unsub = sent[2].text.match(/https?:\/\/\S+\/api\/jobfinder\/unsubscribe\?\S+/)[0].replace(/^https?:\/\/[^/]+/, '');
  assert.equal((await call('GET', unsub)).status, 200);
  assert.equal((await call('GET', `/api/public/jobs/${job3.id}`)).body.job.jobFinder.reachability, 'apply');

  // JobFinder never likes candidates.
  assert.equal((await call('POST', '/api/swipes', { actorId: jf.id, targetId: cand.id, targetType: 'candidate', direction: 'like' }, jf.cookie)).status, 403);

  // 13. Claims: a request never transfers ownership; only an approved claim does.
  assert.equal((await call('POST', `/api/jobfinder/jobs/${job.id}/claim`, { note: 'I am HR at Acme' }, cand.cookie)).status, 403, 'candidates cannot claim');
  const claimX = await call('POST', `/api/jobfinder/jobs/${job.id}/claim`, { note: 'please' }, other.cookie);
  assert.equal(claimX.status, 201); assert.equal(claimX.body.claim.status, 'pending');
  assert.equal((await call('GET', `/api/public/jobs/${job.id}`)).body.job.jobFinder.employerStatus, 'pending');
  assert.equal((await call('POST', `/api/jobfinder/claims/${claimX.body.claim.id}/decide`, { decision: 'approve' }, other.cookie)).status, 403, 'claimants cannot approve themselves');
  const claimR = await call('POST', `/api/jobfinder/jobs/${job.id}/claim`, { note: 'Hiring manager, Acme AI' }, recruiter.cookie);
  const approved = await call('POST', `/api/jobfinder/claims/${claimR.body.claim.id}/decide`, { decision: 'approve' }, jf.cookie);
  assert.equal(approved.body.claim.status, 'approved');
  const after = (await call('GET', `/api/public/jobs/${job.id}`)).body.job;
  assert.equal(after.jobFinder.employerStatus, 'member'); assert.equal(after.jobFinder.listingStatus, 'claimed');
  const claims = (await call('GET', '/api/jobfinder/claims', null, jf.cookie)).body.claims;
  assert.equal(claims.find((c) => c.id === claimX.body.claim.id).status, 'rejected', 'other pending claims close');

  // 14. Verified mutual interest creates a match with the existing rules.
  const back = await call('POST', '/api/swipes', { actorId: recruiter.id, targetId: cand.id, targetType: 'candidate', direction: 'like', jobId: job.id }, recruiter.cookie);
  assert.equal(back.status, 201, JSON.stringify(back.body));
  assert.ok(back.body.match, 'candidate like + verified recruiter like = match');

  // Manager dashboard: counts and private contact for JobFinder only.
  const list = await call('GET', '/api/jobfinder/jobs?sort=likes', null, jf.cookie);
  const row = list.body.jobs.find((j) => j.id === job.id);
  assert.equal(row.likes, 2); assert.equal(row.emails.sent, 2); assert.equal(row.matches, 1); assert.equal(row.contact.email, 'hana@acme.example');
  assert.equal((await call('GET', '/api/jobfinder/jobs', null, cand.cookie)).status, 403);

  // Status changes: expire hides from candidates; remove keeps it off the public page.
  await call('PATCH', `/api/jobfinder/jobs/${job3.id}`, { action: 'expire' }, jf.cookie);
  const deck = (await call('GET', `/api/bootstrap?userId=${auto.id}`, null, auto.cookie)).body.jobs;
  assert.ok(!deck.some((j) => j.id === job3.id), 'expired listing leaves the deck');
  await call('PATCH', `/api/jobfinder/jobs/${job3.id}`, { action: 'remove', reason: 'employer request' }, jf.cookie);
  assert.equal((await call('GET', `/api/public/jobs/${job3.id}`)).status, 404);
});
