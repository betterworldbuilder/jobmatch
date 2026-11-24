// Builds the scripted data for the "Candidate full tour" and "Recruiter full tour" (src/lib/tour/fixtures.json).
// Input: two /api/bootstrap answers captured from a local server with the demo seed
//   node scripts/build-tour-fixtures.mjs /tmp/boot-candidate-demo.json /tmp/boot-employer-demo.json
// The tour never talks to the server: this file is all it shows. Real member data is never used (demo seed only).
import { readFileSync, writeFileSync } from 'node:fs';

const [candPath, empPath] = process.argv.slice(2);
if (!candPath || !empPath) { console.error('usage: build-tour-fixtures.mjs <candidate-bootstrap.json> <employer-bootstrap.json>'); process.exit(1); }
const rename = (raw, from, to) => JSON.parse(raw.split(JSON.stringify(from)).join(JSON.stringify(to)));
const cand = rename(readFileSync(candPath, 'utf8'), 'candidate-demo', 'tour-candidate');
const emp = rename(readFileSync(empPath, 'utf8'), 'employer-demo', 'tour-recruiter');

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 24, 9, 0); // rebased at run time by the mock (dates stay relative)
const pick = (list, ids) => ids.map((id) => list.find((x) => x.id === id)).filter(Boolean);
const clean = (o) => { const c = structuredClone(o); delete c.screeningQuestions; delete c.screening; return c; };
// Round dates are "YYYY-MM-DD" text, like the server's (the mock moves them to today's date).
const datedPipeline = (pipeline, startDaysAgo) => pipeline.map((s, i) => ({ ...s, date: new Date(NOW - (startDaysAgo - i * 4) * DAY).toISOString().slice(0, 10) }));

// ---------- Candidate tour (viewer: Sofia Okafor) ----------
{
  const b = cand;
  const deckIds = ['j-6', 'j-sarah-devops', 'j-demo-extra-15', 'j-netflix-data', 'j-demo-7', 'j-2', 'j-sarah-qa', 'j-sarah-backend', 'j-sarah-data', 'j-sarah-security'];
  const matchJobIds = ['j-1', 'j-sarah-cloud', 'j-sarah-product'];
  b.jobs = pick(b.jobs, [...deckIds, ...matchJobIds]).map(clean).map((j) => ({ ...j, likedYou: false, superLikedYou: false }));
  // Two teams already like her (shown as "hiring teams like you").
  for (const id of ['j-sarah-devops', 'j-netflix-data']) { const j = b.jobs.find((x) => x.id === id); if (j) j.likedYou = true; }
  const active = b.matches.find((m) => m.id === 'm-sofia-aws');
  const stopped = b.matches.find((m) => m.id === 'm-sofia-j-sarah-cloud');
  const hired = b.matches.find((m) => m.id === 'm-sofia-aws-tpm');
  active.createdAt = NOW - 3 * DAY; active.pipeline = datedPipeline(active.pipeline, 2); active.currentStepId = 'round-1';
  stopped.createdAt = NOW - 30 * DAY; stopped.pipeline = datedPipeline(stopped.pipeline, 28);
  Object.assign(stopped, { stage: 'Archived', currentStepId: 'round-3', closedReason: 'stopped_by_recruiter', closedCategory: 'Skills gap', closedAt: NOW - 6 * DAY, closedBy: stopped.employerId });
  hired.createdAt = NOW - 60 * DAY; hired.pipeline = datedPipeline(hired.pipeline, 58);
  Object.assign(hired, { stage: 'Hired', currentStepId: 'hire', closedAt: NOW - 2 * DAY });
  b.matches = [active, stopped, hired];
  const keep = new Set(b.matches.map((m) => m.id));
  b.messages = b.messages.filter((m) => keep.has(m.matchId));
  b.messages.push(
    { id: 'tour-fb-1', matchId: stopped.id, senderId: stopped.employerId, auto: true, createdAt: NOW - 6 * DAY,
      text: 'Thank you for your time on the technical round, Sofia. We are stopping here: the role needs hands-on Terraform and multi-region AWS networking every day, and the panel felt that gap is too wide for this team right now. Your product sense and system design were strong. Two pointers: the AWS Advanced Networking path, and a small multi-region project on GitHub. We would be glad to talk again for a product role.' },
    { id: 'tour-h-1', matchId: hired.id, senderId: hired.employerId, createdAt: NOW - 3 * DAY, text: 'Sofia, the whole panel said yes. The offer is in your inbox: welcome to the team!' },
    { id: 'tour-h-2', matchId: hired.id, senderId: 'tour-candidate', createdAt: NOW - 2 * DAY, text: 'Signed and sent back. Thank you all, I start on the 1st!' },
  );
  b.calls = b.calls.filter((c) => keep.has(c.matchId));
  b.candidates = b.candidates.slice(0, 4);
  b.roleMatches = [];
  b.notes = []; b.bookmarkedIds = []; b.likesRemaining = 47;
  b.viewer.jobStatus = undefined;
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
console.log(`fixtures.json: ${size(out)} KB (candidate ${size(cand)} KB: ${cand.jobs.length} jobs, ${cand.matches.length} matches; recruiter ${size(emp)} KB: ${emp.candidates.length} candidates, ${emp.matches.length} matches, ${emp.roleMatches.length} roles)`);
