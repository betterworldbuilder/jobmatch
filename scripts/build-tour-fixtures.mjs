// Builds the scripted data for the "Candidate full tour" and "Recruiter full tour" (src/lib/tour/fixtures.json).
// Input: two /api/bootstrap answers captured from a local server with the demo seed
//   node scripts/build-tour-fixtures.mjs /tmp/boot-candidate-demo.json /tmp/boot-employer-demo.json
// The tour never talks to the server: this file is all it shows. Real member data is never used (demo seed only).
import { readFileSync, writeFileSync } from 'node:fs';

// Candidate tour (founder, 2026-11-24): a Vietnamese candidate, Linh Tran (demo id c-4), new account: she creates
// her profile and 2 target roles in the real wizard, then swipes, matches, interviews and gets hired.
const [candPath, empPath, candId = 'c-4'] = process.argv.slice(2);
if (!candPath || !empPath) { console.error('usage: build-tour-fixtures.mjs <candidate-bootstrap.json (bootstrap?userId=c-4)> <employer-bootstrap.json> [candidate id]'); process.exit(1); }
const rename = (raw, from, to) => JSON.parse(raw.split(JSON.stringify(from)).join(JSON.stringify(to)));
const cand = rename(readFileSync(candPath, 'utf8'), candId, 'tour-candidate');
const emp = rename(readFileSync(empPath, 'utf8'), 'employer-demo', 'tour-recruiter');

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 24, 9, 0); // rebased at run time by the mock (dates stay relative)
const pick = (list, ids) => ids.map((id) => list.find((x) => x.id === id)).filter(Boolean);
const clean = (o) => { const c = structuredClone(o); delete c.screeningQuestions; delete c.screening; return c; };
// Round dates are "YYYY-MM-DD" text, like the server's (the mock moves them to today's date).
const datedPipeline = (pipeline, startDaysAgo) => pipeline.map((s, i) => ({ ...s, date: new Date(NOW - (startDaysAgo - i * 4) * DAY).toISOString().slice(0, 10) }));

// ---------- Candidate tour (viewer: Linh Tran, Vietnam — a brand-new account) ----------
{
  const b = cand;
  const TARGETS = ['Data Engineer', 'Machine Learning Engineer'];
  const isTarget = (j) => TARGETS.some((t) => j.title === t || j.title.includes(t));
  // The deck: her two target roles first (best fit first), plus a few others so "All my target roles" isn't tiny.
  const jobs = b.jobs.map(clean).map((j) => ({ ...j, likedYou: false, superLikedYou: false }));
  const targetJobs = jobs.filter(isTarget).sort((a, c) => (c.match?.score || 0) - (a.match?.score || 0)).slice(0, 10);
  const others = jobs.filter((j) => !isTarget(j)).sort((a, c) => (c.match?.score || 0) - (a.match?.score || 0)).slice(0, 4);
  b.jobs = [...targetJobs, ...others];
  // Two teams already like her (shown as "hiring teams like you").
  targetJobs.slice(2, 4).forEach((j) => { j.likedYou = true; });
  // The pipeline a new match gets (rounds of a real demo match); the mock fills the dates.
  const template = structuredClone(b.matches.find((m) => (m.pipeline || []).find((s) => s.id === 'round-2')?.kind === 'technical' && (m.pipeline || []).some((s) => s.id === 'offer')) || b.matches[0]);
  b.matchTemplate = { pipeline: (template.pipeline || []).map(({ date, ...s }) => s) };
  // New account: no matches, messages or meetings yet; the profile wizard opens first with her details
  // (from the demo seed) and no target roles: she adds 2 during the tour.
  b.matches = []; b.messages = []; b.calls = [];
  b.candidates = b.candidates.slice(0, 4);
  b.roleMatches = [];
  b.notes = []; b.bookmarkedIds = []; b.likesRemaining = 50;
  b.viewer.onboarding = true;
  b.viewer.email = 'linh@example.com';
  // Required on the wizard's first page and missing in the demo seed (else "Continue" can't move on).
  b.viewer.workAuthorization = b.viewer.workAuthorization || 'Citizen';
  b.viewer.jobStatus = undefined;
  b.viewer.preferences = { ...(b.viewer.preferences || {}), desiredRoles: [] };
}

// ---------- Recruiter tour (viewer: Sarah Thompson, AWS) ----------
{
  const b = emp;
  const roleIds = ['j-1', 'j-sarah-cloud', 'j-sarah-devops'];
  b.roleMatches = (b.roleMatches || []).filter((g) => roleIds.includes(g.job.id));
  const matchIds = ['m-david-aws', 'm-maria-aws', 'm-john-aws', 'm-linh-j-sarah-cloud'];
  const matches = pick(b.matches, matchIds);
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  // David: in the technical round (the recruiter stops here, with feedback). Maria: at the offer (hired live).
  Object.assign(byId['m-david-aws'], { stage: 'Interview', currentStepId: 'round-2', createdAt: NOW - 20 * DAY });
  byId['m-david-aws'].pipeline = datedPipeline(byId['m-david-aws'].pipeline, 18);
  Object.assign(byId['m-maria-aws'], { stage: 'Interview', currentStepId: 'offer', createdAt: NOW - 25 * DAY });
  byId['m-maria-aws'].pipeline = datedPipeline(byId['m-maria-aws'].pipeline, 23);
  b.matches = matches;
  const keep = new Set(matchIds);
  const keepCand = new Set(matches.map((m) => m.candidateId));
  b.messages = b.messages.filter((m) => keep.has(m.matchId));
  b.calls = b.calls.filter((c) => keep.has(c.matchId));
  // The deck: 10 unmatched candidates (3 already like a role), plus the matched ones for their cards.
  const others = b.candidates.filter((c) => !keepCand.has(c.id)).slice(0, 10).map(clean);
  others.forEach((c, i) => { c.likedYou = i === 1 || i === 4; c.superLikedYou = i === 6; });
  b.candidates = [...others, ...b.candidates.filter((c) => keepCand.has(c.id)).map(clean)];
  const candIds = new Set(b.candidates.map((c) => c.id));
  for (const g of b.roleMatches) {
    g.candidates = (g.candidates || []).filter((c) => candIds.has(c.id)).slice(0, 2);
    if (g.scores) g.scores = Object.fromEntries(Object.entries(g.scores).filter(([id]) => candIds.has(id)));
  }
  b.jobs = b.jobs.filter((j) => roleIds.includes(j.id) || j.employerId === 'tour-recruiter').slice(0, 8).map(clean);
  b.notes = []; b.bookmarkedIds = []; b.likesRemaining = 45;
}

const out = { builtAt: NOW, candidate: cand, employer: emp };
const target = new URL('../src/lib/tour/fixtures.json', import.meta.url);
writeFileSync(target, JSON.stringify(out));
const size = (o) => Math.round(JSON.stringify(o).length / 1024);
console.log(`fixtures.json: ${size(out)} KB (candidate ${cand.viewer.name}, ${cand.viewer.city}: ${size(cand)} KB, ${cand.jobs.length} jobs [${cand.jobs.map((j) => `${j.title} ${j.workMode} ${j.match?.score}`).join('; ')}];`);
console.log(`  recruiter`, `${cand.matches.length} matches; recruiter ${size(emp)} KB: ${emp.candidates.length} candidates, ${emp.matches.length} matches, ${emp.roleMatches.length} roles)`);
