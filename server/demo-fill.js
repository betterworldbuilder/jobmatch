// Demo profiles get a full, realistic mock dataset so every section of the app
// shows something when you explore with a demo account: complete profile fields,
// matches with conversations, a coffee chat, recruiters/candidates who like you.
//
// Only records marked `demo: true` / `demoTemplate: true` are touched. Fields a
// demo profile already has are kept. Everything here is a mock entry for
// demonstrations, never a real person, and never counted in analytics (no track()).
import { candidateCompleteness, recruiterCompleteness } from './profile.js';

const DAY = 86400000;
const HOUR = 3600000;

/** Recruiter jobs that get a full relationship set (Sarah's own roles are already full). */
const DEMO_JOBS = ['j-2', 'j-6', 'j-google-frontend', 'j-stripe-backend', 'j-netflix-data', 'j-spotify-design', 'j-shopify-eng-manager'];
/** Candidates that get matches + likes (Sofia, candidate-demo, is already full). */
const DEMO_CANDIDATES = ['c-1', 'c-2', 'c-3', 'c-4', 'candidate-demo-2', 'candidate-demo-3', 'candidate-demo-4'];

const first = (name = '') => name.split(/\s+/)[0] || name;

/** Demo "My super power" lines (mock, one per demo candidate in rotation). */
export const SUPER_POWERS = [
  'I turn a messy problem into a one-page plan the whole team understands.',
  'I can debug a production issue at 2 a.m. and still explain it calmly the next morning.',
  'I am very creative: I find the simple design nobody else saw.',
  'I learn a new framework over a weekend and ship with it on Monday.',
  'I make stakeholders who disagree leave the meeting agreeing.',
  'I write code that the next person can read without asking me.',
];

function juniorTitle(title = '') {
  return title.replace(/^(Senior|Lead|Staff|Principal|Head of)\s+/i, '') || 'Engineer';
}

/** Mock profile fields for a demo candidate (only the ones still empty are applied). */
function candidateFill(u, i) {
  const skills = u.skills || [];
  const s0 = skills[0] || 'product', s1 = skills[1] || 'delivery', s2 = skills[2] || 'teamwork';
  const remoteFirst = i % 2 === 0;
  return {
    headline: `${u.title}${u.company ? ` at ${u.company}` : ''} · ${s0}, ${s1}, ${s2}`,
    yearsExperience: 6 + (i % 5),
    nationality: u.country || 'Vietnam',
    languageDetail: [{ name: 'English', level: 'Fluent' }, ...(u.country === 'Vietnam' ? [{ name: 'Vietnamese', level: 'Native' }] : [])],
    industries: ['Software', i % 2 ? 'Fintech' : 'AI / Machine learning'],
    workExperience: [
      { title: u.title, company: u.company || 'Current company', from: `${2020 + (i % 3)}`, to: 'Present', description: `Leads ${s0} and ${s1} work for a product used by millions; mentors two engineers.` },
      { title: juniorTitle(u.title), company: i % 2 ? 'Tiki' : 'FPT Software', from: `${2016 + (i % 3)}`, to: `${2020 + (i % 3)}`, description: `Built and shipped ${s2} features end to end with a remote US team.` },
    ],
    education: [{ school: u.country === 'Singapore' ? 'National University of Singapore' : 'Ho Chi Minh City University of Technology', degree: 'B.Sc. Computer Science', from: '2012', to: '2016' }],
    certifications: skills.includes('AWS') ? ['AWS Certified Solutions Architect – Associate'] : ['Google UX Design Certificate'],
    links: { github: `https://github.com/demo-${u.id}`, portfolio: `https://demo.jobsmatchnow.app/portfolio/${u.id}` },
    interests: [['Running', 'Coffee', 'Open source'], ['Photography', 'Travel', 'Board games'], ['Cycling', 'Cooking', 'Podcasts']][i % 3],
    presentation: `I build ${s0} products that people actually use. I like small teams, clear goals and shipping every week. Looking for a remote role with at least 4 hours of overlap with US time zones.`,
    mindset: ['Ownership', 'Clear writing', 'Bias for action'],
    humanSkills: ['Communication', 'Mentoring', 'Problem solving'],
    workingPrefer: ['Async updates', 'Small teams', 'Clear goals'],
    workingAvoid: ['Endless meetings'],
    motto: 'Ship small, learn fast.',
    superPower: SUPER_POWERS[i % SUPER_POWERS.length],
    favoriteSong: ['Viva la Vida — Coldplay', 'Blinding Lights — The Weeknd', 'Dynamite — BTS'][i % 3],
    contactChannels: [{ type: 'email', value: u.email }],
    privacy: { visibility: 'all', openToWork: true },
    preferences: {
      ...(u.preferences || {}),
      employmentTypes: u.preferences?.employmentTypes || ['Full-time'],
      workMode: remoteFirst ? { mode: 'remote' } : (u.preferences?.workMode || { mode: 'hybrid', hybridDays: 2 }),
      relocate: { open: false },
      companySize: '50–200',
      workStyle: ['Remote-friendly', 'Async'],
      industries: ['Software', 'SaaS'],
    },
  };
}

/** Mock profile fields for a demo recruiter (company or headhunter). */
function recruiterFill(u) {
  return {
    foundedYear: u.foundedYear || 2010,
    linkedinUrl: `https://www.linkedin.com/company/demo-${u.id}`,
    calendarLink: `https://demo.jobsmatchnow.app/book/${u.id}`,
    specializations: ['Software engineering', 'Remote teams'],
    regions: ['United States', 'Vietnam', 'Southeast Asia'],
  };
}

function applyMissing(target, fill) {
  for (const [key, value] of Object.entries(fill)) {
    const current = target[key];
    const empty = current === undefined || current === null || current === '' || (Array.isArray(current) && current.length === 0);
    if (empty) target[key] = value;
    else if (key === 'preferences' && typeof current === 'object') target[key] = { ...value, ...current, workMode: current.workMode || value.workMode, employmentTypes: current.employmentTypes?.length ? current.employmentTypes : value.employmentTypes };
  }
}

/**
 * Mutates and returns the seed with demo fields and demo relationships added.
 * `crowd` = the generated demo crowd (demo-crowd.js): its jobs each get `perJob`
 * matches spread across its candidates, so every generated profile has data too.
 */
export function withDemoFill(seed, now = Date.now(), crowd = { candidateIds: [], jobIds: [] }) {
  const users = new Map(seed.users.map((u) => [u.id, u]));
  const jobs = new Map(seed.jobs.map((j) => [j.id, j]));

  // 1. Profiles: every demo template user gets its empty fields filled.
  let ci = 0;
  for (const u of seed.users) {
    if (!u.demo || !u.demoTemplate) continue;
    if (u.role === 'candidate') { applyMissing(u, candidateFill(u, ci++)); u.completeness = candidateCompleteness(u); }
    else if (u.role === 'employer') { applyMissing(u, recruiterFill(u)); u.completeness = recruiterCompleteness(u); }
  }

  // 2. Relationships: for job i (employer E): matches with candidates i, i+1 (+ conversation, coffee chat),
  //    E also likes candidates i+3, i+4 ("recruiters that like you"), candidates i+2, i+5 like the job.
  const has = (collection, id) => seed[collection].some((item) => item.id === id);
  const push = (collection, item) => { if (!has(collection, item.id)) seed[collection].push({ demoTemplate: true, ...item }); };
  // One mutual match (two likes, 3 messages, feedback + coffee chat on the first) between candidate c and job i.
  const addMatch = (jobId, i, c, k) => {
      const job = jobs.get(jobId); const employer = job && users.get(job.employerId);
      if (!job || !employer || !c) return;
      const matchId = `dm-${jobId}-${c.id}`;
      const at = now - (i * 2 + k + 1) * DAY;
      push('swipes', { id: `ds-${c.id}-${jobId}`, actorId: c.id, targetType: 'job', targetId: jobId, direction: 'like', createdAt: at - 2 * HOUR });
      push('swipes', { id: `ds-${employer.id}-${c.id}-${jobId}`, actorId: employer.id, targetType: 'candidate', targetId: c.id, jobId, direction: 'like', createdAt: at - HOUR });
      push('matches', { id: matchId, candidateId: c.id, employerId: employer.id, jobId, stage: k === 0 ? 'Interview' : k === 2 ? 'Offer' : 'Matched', createdAt: at,
        ...(k === 0 ? { feedback: [{ text: `Strong first round: clear communication and solid ${(c.skills || [])[0] || 'technical'} depth. To move to the final round, show more ${(job.requiredSkills || []).find((s) => !(c.skills || []).includes(s)) || 'system design'} experience with a concrete project example.`, at: at + 2 * DAY, from: employer.id }] } : {}) });
      const skill = (job.requiredSkills || c.skills || [])[0] || 'engineering';
      push('messages', { id: `dmsg-${matchId}-1`, matchId, senderId: employer.id, text: `Hi ${first(c.name)}, your ${skill} experience fits our ${job.title} role. Open to a 20-minute call this week?`, createdAt: at + HOUR });
      push('messages', { id: `dmsg-${matchId}-2`, matchId, senderId: c.id, text: `Thanks ${first(employer.name)}! Yes, Tuesday or Wednesday afternoon works for me (US morning).`, createdAt: at + 3 * HOUR });
      push('messages', { id: `dmsg-${matchId}-3`, matchId, senderId: employer.id, text: k === 0 ? 'Great, I sent a coffee chat invite for Wednesday. Talk soon!' : 'Perfect. I will share the interview steps before we talk.', createdAt: at + 5 * HOUR });
      if (k === 0) push('calls', { id: `dcall-${matchId}`, matchId, createdBy: employer.id, title: `Coffee chat - ${c.name}`, startAt: now + (i + 1) * DAY, durationMinutes: 25, notes: `Intro call about the ${job.title} role.`, createdAt: at + 5 * HOUR });
  };
  // The recruiter behind job i likes candidate c ("Recruiters that like you").
  const recruiterLike = (jobId, i, c, k, superLike) => { const employer = users.get(jobs.get(jobId)?.employerId); if (employer && c) push('swipes', { id: `ds-${employer.id}-${c.id}-${jobId}`, actorId: employer.id, targetType: 'candidate', targetId: c.id, jobId, direction: 'like', ...(superLike ? { superLike: true } : {}), createdAt: now - (k + i) * HOUR }); };
  // Candidate c likes job i (shows on the recruiter side as an incoming like).
  const candidateLike = (jobId, i, c, k) => { if (c && jobs.has(jobId)) push('swipes', { id: `ds-${c.id}-${jobId}`, actorId: c.id, targetType: 'job', targetId: jobId, direction: 'like', createdAt: now - (k + i + 1) * HOUR }); };

  // Hand-written cast (ids unchanged): job i matches candidates i, i+1; its recruiter likes i+3 (super) and i+4; i+2 and i+5 like the job.
  DEMO_JOBS.forEach((jobId, i) => {
    const cand = (k) => users.get(DEMO_CANDIDATES[(i + k) % DEMO_CANDIDATES.length]);
    [0, 1].forEach((k) => addMatch(jobId, i, cand(k), k));
    [3, 4].forEach((k) => recruiterLike(jobId, i, cand(k), k, k === 3));
    [2, 5].forEach((k) => candidateLike(jobId, i, cand(k), k));
  });
  // Generated crowd, candidate by candidate so nobody is left out: 2 matches (two different
  // recruiters), a like from a third recruiter, and a fourth role they like.
  const J = crowd.jobIds.length;
  if (J >= 4) crowd.candidateIds.forEach((cid, ci) => {
    const c = users.get(cid); const at = (off) => (ci + off) % J;
    addMatch(crowd.jobIds[at(0)], at(0), c, 0);
    addMatch(crowd.jobIds[at(5)], at(5), c, ci % 3 === 0 ? 2 : 1);
    recruiterLike(crowd.jobIds[at(11)], at(11), c, 3, ci % 2 === 0);
    candidateLike(crowd.jobIds[at(8)], at(8), c, 2);
  });
  // 3. Hiring Stages: every demo match gets a timeline of rounds (2–4 per job) with who interviews and dates.
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const PEOPLE = ['Minh Tran, Staff Engineer', 'Anna Lee, Engineering Manager', 'Ravi Patel, Principal Engineer', 'Thu Nguyen, Design Lead', 'Carlos Diaz, VP Engineering', 'Emma Wilson, CTO'];
  const ROUND_SETS = [
    [['HR screening call', 'hr', 'Video, 30 min'], ['Technical interview', 'technical', 'Video, 60 min'], ['Hiring manager interview', 'manager', 'Video, 45 min']],
    [['HR screening call', 'hr', 'Phone, 20 min'], ['Take-home assignment review', 'assignment', 'Async, 3 days'], ['System design interview', 'technical', 'Video, 60 min'], ['Founder / CTO interview', 'manager', 'Video, 45 min']],
    [['Recruiter screen', 'hr', 'Video, 30 min'], ['Technical deep dive', 'technical', 'Video, 90 min']],
    [['HR screening call', 'hr', 'Video, 30 min'], ['Technical interview', 'technical', 'Video, 60 min'], ['Team & culture chat', 'culture', 'Video, 30 min'], ['Hiring manager interview', 'manager', 'Video, 45 min']],
  ];
  const hash = (s) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  for (const m of seed.matches) {
    if (!m.demoTemplate || m.pipeline) continue;
    const employer = users.get(m.employerId);
    const rounds = ROUND_SETS[hash(m.jobId) % ROUND_SETS.length];
    const h = hash(m.id);
    const steps = [{ id: 'match', name: 'Mutual match', owner: '', kind: 'match', date: day(m.createdAt) }];
    rounds.forEach(([name, kind, format], r) => {
      const owner = kind === 'hr' ? `${employer?.name || 'Recruiter'}, ${employer?.title || 'Talent team'}` : PEOPLE[(h + r) % PEOPLE.length];
      steps.push({ id: `round-${r + 1}`, name, owner, kind, format, date: day(m.createdAt + (2 + r * 4) * DAY) });
    });
    steps.push({ id: 'offer', name: 'Offer', owner: employer?.name || '', kind: 'offer', date: day(m.createdAt + (4 + rounds.length * 4) * DAY) });
    steps.push({ id: 'hire', name: 'Hired', owner: '', kind: 'hired', date: day(m.createdAt + (14 + rounds.length * 4) * DAY) });
    m.pipeline = steps;
    m.currentStepId = m.stage === 'Interview' ? (rounds.length > 1 ? 'round-2' : 'round-1') : m.stage === 'Offer' ? 'offer' : m.stage === 'Hired' ? 'hire' : 'round-1';
  }
  return seed;
}
