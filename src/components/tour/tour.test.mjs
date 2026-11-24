// Full tours: the steps are valid data, every target exists in the app code, the scripted data behaves like the
// server, and nothing reaches the server while a tour plays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const src = fileURLToPath(new URL('../../', import.meta.url));
const VIEWS = ['home', 'discover', 'matches', 'companies', 'messages', 'pipeline', 'jobs', 'analytics', 'profile', 'meetings', 'saved', 'selected', 'coffee', 'billing', 'admin-billing', 'stages', 'assistant', 'feedback', 'match', 'hired', 'prep'];
const KINDS = new Set(['tap', 'point', 'type', 'paste', 'select', 'set', 'view', 'event', 'matchNextLike', 'advance', 'wait']);

function allTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) allTsx(p, out);
    else if (/\.tsx?$/.test(name) && !p.includes(`${path.sep}tour${path.sep}`) && !p.includes(`${path.sep}lib${path.sep}tour`)) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}
const appCode = allTsx(src).join('\n');

const steps = async () => (await loadTsx(new URL('../../lib/tour/steps.ts', import.meta.url))).mod.TOURS;

test('both tours exist with the founder’s names and start with sign-up', async () => {
  const TOURS = await steps();
  assert.equal(TOURS.candidate.name, 'Candidate full tour');
  assert.equal(TOURS.employer.name, 'Recruiter full tour');
  for (const tour of Object.values(TOURS)) {
    assert.equal(tour.steps[0].phase, 'register');
    assert.ok(tour.steps.slice(1).every((s) => s.phase === 'app'));
    assert.equal(new Set(tour.steps.map((s) => s.id)).size, tour.steps.length, 'step ids are unique');
    for (const s of tour.steps) {
      assert.ok(s.title && s.caption, `${s.id} has a caption`);
      for (const a of s.actions) {
        assert.ok(KINDS.has(a.do), `${s.id}: ${a.do}`);
        if (a.do === 'view') assert.ok(VIEWS.includes(a.view), `${s.id}: view ${a.view}`);
      }
    }
  }
});

test('the plan’s steps are covered, in order', async () => {
  const TOURS = await steps();
  assert.deepEqual(TOURS.candidate.steps.map((s) => s.id), ['register', 'profile', 'target-roles', 'choose-role', 'filter', 'swipe', 'match', 'chat', 'interview', 'rounds', 'offer', 'hired']);
  assert.deepEqual(TOURS.employer.steps.map((s) => s.id), ['register', 'company', 'post-role', 'swipe', 'filter', 'likes', 'match', 'chat', 'stages', 'stop', 'hire']);
});

test('each tour lasts about 90 seconds', async () => {
  const TOURS = await steps();
  for (const tour of Object.values(TOURS)) {
    let ms = 0;
    for (const s of tour.steps) {
      ms += s.hold ?? 1100;
      for (const a of s.actions) {
        if (a.do === 'wait') ms += a.ms;
        else if (a.do === 'view') ms += 700;
        else if (a.do === 'event') ms += 500;
        else if (a.do === 'tap') ms += 1500;
        else if (a.do === 'point') ms += 900 + (a.ms ?? 900);
        else if (a.do === 'type') ms += 1100 + a.value.length * 38;
        else if (a.do !== 'matchNextLike' && a.do !== 'advance') ms += 1400;
      }
    }
    assert.ok(ms > 60000 && ms < 130000, `${tour.name}: ~${Math.round(ms / 1000)} s`);
  }
});

test('every step target exists in the app code', async () => {
  const TOURS = await steps();
  const missing = [];
  for (const tour of Object.values(TOURS)) for (const s of tour.steps) for (const a of s.actions) {
    for (const sel of [a.target, a.within?.target].filter(Boolean)) {
      for (const cls of sel.match(/\.[a-z][\w-]*/g) || []) if (!appCode.includes(cls.slice(1))) missing.push(`${s.id}: ${cls}`);
      for (const [, attr, value] of sel.matchAll(/\[(aria-label|placeholder|title)="([^"]+)"\]/g)) if (!appCode.includes(`${attr}="${value}"`) && !appCode.includes(value)) missing.push(`${s.id}: [${attr}="${value}"]`);
    }
    // "70%+" chips are built as `${s}%+` from SCORES = [0, 50, 70, 85].
    const generated = /^(\d+)%\+$/.exec(a.text || '');
    if (generated) { if (!/SCORES = \[[^\]]*\b/.test(appCode) || !appCode.includes(`${generated[1]},`) && !appCode.includes(`, ${generated[1]}]`)) missing.push(`${s.id}: score chip ${a.text}`); }
    else if (a.text && a.do === 'tap' && !appCode.includes(a.text)) missing.push(`${s.id}: text "${a.text}"`);
  }
  assert.deepEqual(missing, []);
});

test('scripted data: swipe, match, message, interview, stop with feedback, hire', async () => {
  const { mod } = await loadTsx(new URL('../../lib/tour/mockApi.ts', import.meta.url));
  const post = (url, body, method = 'POST') => ({ method, body: JSON.stringify(body) });
  // Candidate: Linh Tran from Vietnam, a new account (profile wizard first, no target roles, no matches yet).
  const cand = mod.createMockApi('candidate');
  const boot = await cand.handle('/api/bootstrap?userId=tour-candidate');
  assert.equal(boot.viewer.id, 'tour-candidate');
  assert.equal(boot.viewer.name, 'Linh Tran');
  assert.equal(boot.viewer.country, 'Vietnam');
  assert.equal(boot.viewer.onboarding, true);
  assert.deepEqual(boot.viewer.preferences.desiredRoles, []);
  assert.equal(boot.matches.length, 0);
  assert.equal(boot.matchTemplate, undefined, 'the match template is not part of the bootstrap');
  for (const role of ['Data Engineer', 'Machine Learning Engineer']) assert.ok(boot.jobs.filter((j) => j.title.includes(role) && j.workMode === 'Remote').length >= 2, `remote ${role} roles in the deck`);
  await cand.handle('/api/users/tour-candidate', post('', { onboarding: false, preferences: { ...boot.viewer.preferences, desiredRoles: ['Data Engineer', 'Machine Learning Engineer'] } }, 'PATCH'));
  const job = boot.jobs.find((j) => j.title.includes('Machine Learning'));
  assert.equal((await cand.handle('/api/swipes', post('', { targetId: job.id, direction: 'like' }))).match, null);
  cand.matchNextLike();
  const { match } = await cand.handle('/api/swipes', post('', { targetId: job.id, direction: 'like' }));
  assert.equal(match.jobId, job.id); assert.equal(cand.lastMatchId, match.id);
  assert.ok(match.pipeline.find((s) => s.id === 'round-2')?.kind === 'technical' && match.pipeline.some((s) => s.id === 'offer'), 'real interview rounds up to the offer');
  const msg = await cand.handle('/api/messages', post('', { matchId: match.id, senderId: 'tour-candidate', text: 'Hi' }));
  assert.ok(msg.reply && msg.reply.senderId === match.employerId, 'the recruiter answers');
  const call = await cand.handle('/api/calls', post('', { matchId: match.id, title: 'Intro', startAt: Date.now() + 1e8, durationMinutes: 30 }));
  cand.advance('round-2', 'Next: technical');
  cand.advance('offer', 'Congratulations!');
  let after = await cand.handle('/api/bootstrap');
  const m1 = after.matches.find((m) => m.id === match.id);
  assert.equal(m1.currentStepId, 'offer'); assert.equal(m1.stage, 'Interview');
  assert.ok(after.messages.some((m) => m.id === msg.id) && after.calls.some((c) => c.id === call.id) && after.messages.some((m) => m.text === 'Congratulations!'));
  assert.deepEqual(after.viewer.preferences.desiredRoles, ['Data Engineer', 'Machine Learning Engineer']);
  const hiredRes = await cand.handle('/api/users/tour-candidate', post('', { jobStatus: { kind: 'hired', matchId: match.id } }, 'PATCH'));
  assert.ok(hiredRes.effects);
  after = await cand.handle('/api/bootstrap');
  assert.equal(after.matches.find((m) => m.id === match.id).stage, 'Hired');

  const rec = mod.createMockApi('employer');
  const rb = await rec.handle('/api/bootstrap');
  assert.equal(rb.viewer.id, 'tour-recruiter');
  const david = rb.matches.find((m) => m.candidate?.name === 'David Nguyen');
  const maria = rb.matches.find((m) => m.candidate?.name === 'Maria Garcia');
  assert.equal(david.currentStepId, 'round-2'); assert.equal(maria.currentStepId, 'offer');
  const stop = await rec.handle(`/api/matches/${david.id}`, post('', { stage: 'Archived', closeCategory: 'Skills gap', closeFeedback: 'Thank you David, the role needs daily Terraform at scale.' }, 'PATCH'));
  assert.equal(stop.closedReason, 'stopped_by_recruiter');
  const hire = await rec.handle(`/api/matches/${maria.id}`, post('', { stage: 'Hired' }, 'PATCH'));
  assert.equal(hire.stage, 'Hired');
  assert.ok(hire.effects.closed >= 1, 'other candidates of the role get a thank-you');
  const rb2 = await rec.handle('/api/bootstrap');
  assert.ok(rb2.matches.filter((m) => m.jobId === maria.jobId && m.id !== maria.id).every((m) => m.stage === 'Archived'));
  assert.ok(rb2.messages.some((m) => m.matchId === david.id && m.auto), 'feedback is in David’s chat');
  // A fresh tour starts clean again (Replay).
  const again = await mod.createMockApi('employer').handle('/api/bootstrap');
  assert.equal(again.matches.find((m) => m.id === david.id).stage, 'Interview');
});

test('while a tour plays, api requests never reach the server', async () => {
  const dir = path.join(src, '..', 'node_modules', '.cache', 'jm-tests');
  mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, `tour-entry-${process.pid}.ts`);
  const abs = (p) => path.join(src, p).split(path.sep).join('/');
  writeFileSync(entry, `export { api } from '${abs('api.ts')}';\nexport { setTourHandler } from '${abs('lib/tour/runtime.ts')}';\nexport { createMockApi } from '${abs('lib/tour/mockApi.ts')}';\n`);
  const { mod } = await loadTsx(pathToFileURL(entry));
  let fetches = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetches += 1; throw new Error('network'); };
  try {
    const mock = mod.createMockApi('candidate');
    mod.setTourHandler(mock.handle);
    const boot = await mod.api.bootstrap('tour-candidate');
    await mod.api.swipe({ actorId: 'tour-candidate', targetId: boot.jobs[0].id, targetType: 'job', direction: 'like' });
    await mod.api.register({ role: 'candidate', name: 'X', email: 'x@example.com', password: 'longenough' });
    await mod.api.message({ matchId: boot.matches[0]?.id || 'no-match-yet', senderId: 'tour-candidate', text: 'Hi' });
    assert.equal(fetches, 0, 'no request left the browser');
    assert.ok(mock.log.length >= 4);
    mod.setTourHandler(null);
    await mod.api.siteSettings().catch(() => undefined);
    assert.equal(fetches, 1, 'after the tour, requests go to the server again');
  } finally { globalThis.fetch = realFetch; mod.setTourHandler?.(null); }
});
