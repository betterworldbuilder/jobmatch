// A larger demo crowd for testing: tops the hand-written demo cast up to
// DEMO_CANDIDATE_TARGET candidates and DEMO_RECRUITER_TARGET recruiters, every
// field filled. Generated deterministically (same ids and values on every start),
// so the seed merge in index.js updates them in place instead of adding copies.
//
// Everything here is a mock entry: made-up people and made-up US startups
// (no real companies), emails on the .demo / demo.jobsmatchnow.app domains,
// and every record is `demo: true`, so analytics never counts it.

export const DEMO_CANDIDATE_TARGET = 50;
export const DEMO_RECRUITER_TARGET = 25;
export const DEMO_JOB_TARGET = 50;

const portrait = (gender, n) => `https://randomuser.me/api/portraits/${gender === 'f' ? 'women' : 'men'}/${n}.jpg`;

// Vietnam / Southeast Asia software engineers (our Phase B candidate pool).
const CANDIDATE_NAMES = [
  // First five renamed to English names that fit their photos (founder, 2026-11-23; shown on "New Matches Hired").
  ['Emily Carter', 'f'], ['Tyler Bennett', 'm'], ['Hannah Brooks', 'f'], ['Robert Hayes', 'm'], ['Laura Mitchell', 'f'],
  ['Hoang Gia Khang', 'm'], ['Dang Mai Phuong', 'f'], ['Bui Thanh Tung', 'm'], ['Do Khanh Linh', 'f'], ['Ngo Hai Nam', 'm'],
  ['Camille Santos', 'f'], ['Joshua Reyes', 'm'], ['Angelica Cruz', 'f'], ['Mark Villanueva', 'm'], ['Bea Mendoza', 'f'],
  ['Putri Lestari', 'f'], ['Rizky Pratama', 'm'], ['Dewi Anggraini', 'f'], ['Budi Santoso', 'm'], ['Ayu Wulandari', 'f'],
  ['Nattaya Srisuk', 'f'], ['Kittipong Chaiyaporn', 'm'], ['Siriporn Wongsa', 'f'], ['Thanawat Boonmee', 'm'],
  ['Nurul Aisyah', 'f'], ['Hafiz Rahman', 'm'], ['Mei Ling Tan', 'f'], ['Wei Jie Lim', 'm'], ['Kavya Menon', 'f'], ['Arjun Pillai', 'm'],
  ['Truong Bich Ngoc', 'f'], ['Ly Van Phuc', 'm'], ['Phan Thao Vy', 'f'], ['Huynh Tan Loc', 'm'], ['Mai Quynh Chi', 'f'],
  ['Carlo Bautista', 'm'], ['Kristine Navarro', 'f'], ['Agus Setiawan', 'm'], ['Somchai Rattana', 'm'], ['Farah Iskandar', 'f'],
  ['Dinh Hoang Long', 'm'], ['Vu Thi Hoa', 'f'],
];

const PLACES = [
  { city: 'Ho Chi Minh City', country: 'Vietnam', lang: 'Vietnamese', school: 'Ho Chi Minh City University of Technology', local: ['FPT Software', 'Tiki', 'MoMo'] },
  { city: 'Hanoi', country: 'Vietnam', lang: 'Vietnamese', school: 'Hanoi University of Science and Technology', local: ['VNG', 'Viettel Digital', 'Got It'] },
  { city: 'Da Nang', country: 'Vietnam', lang: 'Vietnamese', school: 'University of Danang', local: ['Axon Active', 'Enclave', 'Rikkeisoft'] },
  { city: 'Manila', country: 'Philippines', lang: 'Filipino', school: 'University of the Philippines Diliman', local: ['Thinking Machines', 'Kalibrr', 'PayMongo'] },
  { city: 'Cebu', country: 'Philippines', lang: 'Filipino', school: 'University of San Carlos', local: ['Accenture Cebu', 'Lexmark Cebu', 'Sprout Solutions'] },
  { city: 'Jakarta', country: 'Indonesia', lang: 'Indonesian', school: 'Universitas Indonesia', local: ['Tokopedia', 'Traveloka', 'Xendit'] },
  { city: 'Bandung', country: 'Indonesia', lang: 'Indonesian', school: 'Bandung Institute of Technology', local: ['eFishery', 'Bukalapak', 'Mekari'] },
  { city: 'Bangkok', country: 'Thailand', lang: 'Thai', school: 'Chulalongkorn University', local: ['LINE MAN Wongnai', 'Agoda', 'Omise'] },
  { city: 'Kuala Lumpur', country: 'Malaysia', lang: 'Malay', school: 'University of Malaya', local: ['Grab', 'Carsome', 'iPay88'] },
  { city: 'Singapore', country: 'Singapore', lang: 'Mandarin', school: 'National University of Singapore', local: ['Shopee', 'Ninja Van', 'Carousell'] },
];

// Engineering tracks: candidate title + skills, and the matching job a recruiter posts.
const TRACKS = [
  { title: 'Frontend Engineer', job: 'Senior Frontend Engineer', skills: ['React', 'TypeScript', 'Next.js', 'CSS', 'Testing Library'], industry: 'SaaS' },
  { title: 'Backend Engineer', job: 'Senior Backend Engineer (Node.js)', skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'AWS', 'Redis'], industry: 'Fintech' },
  { title: 'Full-Stack Engineer', job: 'Full-Stack Engineer', skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'GraphQL'], industry: 'SaaS' },
  { title: 'Mobile Engineer', job: 'React Native Engineer', skills: ['React Native', 'TypeScript', 'iOS', 'Android', 'Expo'], industry: 'Consumer apps' },
  { title: 'Go Backend Engineer', job: 'Backend Engineer (Go)', skills: ['Go', 'gRPC', 'Kubernetes', 'PostgreSQL', 'Kafka'], industry: 'Infrastructure' },
  { title: 'Data Engineer', job: 'Data Engineer', skills: ['Python', 'SQL', 'Spark', 'Airflow', 'dbt'], industry: 'Data / analytics' },
  { title: 'Machine Learning Engineer', job: 'Machine Learning Engineer', skills: ['Python', 'PyTorch', 'MLOps', 'AWS', 'LLMs'], industry: 'AI / Machine learning' },
  { title: 'DevOps Engineer', job: 'DevOps / Platform Engineer', skills: ['Kubernetes', 'Terraform', 'AWS', 'CI/CD', 'Prometheus'], industry: 'Infrastructure' },
  { title: 'QA Automation Engineer', job: 'QA Automation Engineer', skills: ['Playwright', 'Cypress', 'TypeScript', 'API testing', 'CI/CD'], industry: 'SaaS' },
  { title: 'Python Backend Engineer', job: 'Senior Python Engineer', skills: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'Celery'], industry: 'Healthtech' },
];

const LEVELS = [
  { level: 'mid', prefix: '', years: 4, min: 36000, max: 54000 },
  { level: 'senior', prefix: 'Senior ', years: 7, min: 54000, max: 84000 },
  { level: 'senior', prefix: 'Lead ', years: 10, min: 72000, max: 108000 },
];

const RECOMMENDERS = ['Alex Morgan', 'Jordan Lee', 'Sam Patel', 'Taylor Brooks', 'Chris Nguyen', 'Jamie Rivera', 'Morgan Ellis', 'Casey Wong'];
const RECO_ROLES = ['Engineering Manager', 'Staff Engineer', 'CTO', 'Tech Lead', 'Head of Engineering'];
const RECO_TEXT = [
  (n, s) => `${n} owned our ${s} work end to end and shipped on time, every sprint. Clear written updates, which mattered a lot with our US team.`,
  (n, s) => `${n} is the person the team asks when ${s} gets hard. Calm under pressure and great at explaining trade-offs.`,
  (n, s) => `${n} cut our ${s} incidents by half in one quarter and mentored two junior engineers along the way.`,
];

// Made-up US startups (seed to Series B, 10–200 people) hiring remote engineers in Vietnam / SEA.
const STARTUPS = [
  ['Lumenpay', 'Fintech', 'Series A', '51–200', 'San Francisco, CA', 'Payments infrastructure for online marketplaces.'],
  ['Northwind Health', 'Healthtech', 'Seed', '11–50', 'Boston, MA', 'Care coordination software for small clinics.'],
  ['Brightloop', 'SaaS', 'Series A', '51–200', 'Austin, TX', 'Workflow automation for operations teams.'],
  ['Cobalt Labs', 'AI / Machine learning', 'Seed', '11–50', 'New York, NY', 'AI copilots for customer support teams.'],
  ['Fieldnote', 'SaaS', 'Series B', '51–200', 'Seattle, WA', 'Field service scheduling for trades businesses.'],
  ['Harborline', 'Logistics', 'Series A', '51–200', 'Chicago, IL', 'Freight visibility for mid-size shippers.'],
  ['Quillstack', 'Developer tools', 'Seed', '11–50', 'San Francisco, CA', 'Docs-as-code tooling for API teams.'],
  ['Mosaic Grid', 'Climate tech', 'Series A', '51–200', 'Denver, CO', 'Energy data platform for solar installers.'],
  ['Tandem Learn', 'Edtech', 'Seed', '11–50', 'Los Angeles, CA', 'Live cohort courses for software teams.'],
  ['Parcelbird', 'E-commerce', 'Series A', '51–200', 'Miami, FL', 'Returns and exchanges for online stores.'],
  ['Signalcraft', 'Data / analytics', 'Series B', '51–200', 'New York, NY', 'Product analytics for B2B apps.'],
  ['Kitewire', 'Infrastructure', 'Seed', '11–50', 'Portland, OR', 'Managed Kafka for growing startups.'],
  ['Evergreen Rx', 'Healthtech', 'Series A', '51–200', 'Nashville, TN', 'Pharmacy inventory software.'],
  ['Opal Ledger', 'Fintech', 'Seed', '11–50', 'Salt Lake City, UT', 'Bookkeeping automation for freelancers.'],
  ['Relay Robotics', 'Robotics', 'Series A', '51–200', 'Pittsburgh, PA', 'Fleet software for warehouse robots.'],
];
// Specialist recruiting agencies (headhunters) placing SEA engineers with US startups.
const AGENCIES = [
  ['Bridgeway Talent', 'Recruiting', 'Bootstrapped', '11–50', 'San Jose, CA', 'Places senior Southeast Asian engineers with US startups.'],
  ['Meridian Search', 'Recruiting', 'Bootstrapped', '1–10', 'Remote (US)', 'Technical headhunting for remote-first engineering teams.'],
];
const RECRUITER_PEOPLE = [
  ['Rachel Moore', 'f', 'Head of Talent'], ['Kevin Murphy', 'm', 'CTO & Co-founder'], ['Olivia Grant', 'f', 'Technical Recruiter'],
  ['Ethan Park', 'm', 'Engineering Manager'], ['Sophia Diaz', 'f', 'Founder & CEO'], ['Noah Sullivan', 'm', 'VP Engineering'],
  ['Ava Collins', 'f', 'Talent Partner'], ['Lucas Ward', 'm', 'Head of Engineering'], ['Mia Foster', 'f', 'People Operations Lead'],
  ['Henry Cole', 'm', 'CTO'], ['Chloe Adams', 'f', 'Technical Recruiter'], ['Owen Price', 'm', 'Founder'],
  ['Ella Turner', 'f', 'Head of People'], ['Jack Rivera', 'm', 'Engineering Director'], ['Lily Zhang', 'f', 'Recruiting Lead'],
  ['Samuel Ross', 'm', 'Senior Headhunter'], ['Natalie Reed', 'f', 'Managing Partner'],
];
const ACCENTS = ['#007AFF', '#AF52DE', '#FF9500', '#34C759', '#FF2D55', '#5856D6', '#00C7BE', '#FF3B30'];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const monthly = (yearly) => `$${Math.round(yearly / 12 / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function makeCandidate(i, now) {
  const [name, gender] = CANDIDATE_NAMES[i % CANDIDATE_NAMES.length];
  const place = PLACES[i % PLACES.length];
  const track = TRACKS[i % TRACKS.length];
  const lv = LEVELS[i % LEVELS.length];
  const title = `${lv.prefix}${track.title}`.replace('Senior Go', 'Senior Go').trim();
  const first = name.split(' ').slice(-1)[0];
  const id = `candidate-demo-${i + 5}`;
  const remote = i % 3 !== 2;
  const availability = ['Now', '2 weeks', '1 month'][i % 3];
  const s = track.skills;
  const recoBy = RECOMMENDERS[i % RECOMMENDERS.length];
  const [cur, prev] = [place.local[i % 3], place.local[(i + 1) % 3]];
  return {
    id, demoTemplate: true, role: 'candidate', demo: true,
    name, email: `${slug(name)}@demo.jobsmatchnow.app`,
    title, company: cur, headline: `${title} · ${s.slice(0, 3).join(', ')}`,
    location: `${place.city}, ${place.country}`, city: place.city, country: place.country, nationality: place.country,
    distanceKm: 3 + (i % 25), distanceRangeKm: 20 + (i % 4) * 10,
    photo: portrait(gender, 10 + i), photoVerified: i % 4 !== 3,
    skills: s, skillsDetail: s.map((n, k) => ({ name: n, level: Math.max(3, 5 - (k % 3)), years: Math.max(1, lv.years - k) })),
    languages: ['English', place.lang], languageDetail: [{ name: 'English', level: i % 4 === 0 ? 'Native-like' : 'Fluent' }, { name: place.lang, level: 'Native' }],
    experienceLevel: lv.level, seniority: lv.level, yearsExperience: lv.years, availability,
    preferences: {
      employmentTypes: i % 5 === 4 ? ['Full-time', 'Contract'] : ['Full-time'],
      workMode: remote ? { mode: 'remote' } : { mode: 'hybrid', hybridDays: 2 },
      desiredRoles: [track.job, `${lv.prefix}${track.title}`.trim()].filter((v, k, a) => a.indexOf(v) === k),
      salary: { min: lv.min, max: lv.max, currency: 'USD', period: 'year', negotiable: i % 2 === 0 },
      availability, noticePeriod: availability === 'Now' ? 'none' : availability,
      relocate: { open: i % 6 === 0, locations: i % 6 === 0 ? ['Singapore', 'United States'] : [] },
      companySize: ['11–50', '51–200', '10–200'][i % 3], workStyle: ['Remote-friendly', 'Async', 'Small teams'].slice(0, 2 + (i % 2)),
      industries: ['Software', track.industry], travel: 'Rarely',
    },
    industries: ['Software', track.industry],
    workExperience: [
      { title, company: cur, from: `${now.getFullYear() - 3 + (i % 2)}`, to: 'Present', description: `Owns ${s[0]} and ${s[1]} work for a product with a remote US team; mentors junior engineers.` },
      { title: track.title.replace(/^Senior |^Lead /, ''), company: prev, from: `${now.getFullYear() - lv.years}`, to: `${now.getFullYear() - 3 + (i % 2)}`, description: `Built and shipped ${s[2]} features end to end, from design to on-call.` },
    ],
    education: [{ school: place.school, degree: i % 4 === 1 ? 'B.Eng. Software Engineering' : 'B.Sc. Computer Science', from: `${now.getFullYear() - lv.years - 4}`, to: `${now.getFullYear() - lv.years}` }],
    certifications: s.includes('AWS') ? ['AWS Certified Developer – Associate'] : s.includes('Kubernetes') ? ['Certified Kubernetes Administrator (CKA)'] : ['Meta Front-End Developer Certificate'],
    links: { github: `https://github.com/demo-${id}`, portfolio: `https://demo.jobsmatchnow.app/portfolio/${id}`, website: `https://demo.jobsmatchnow.app/blog/${id}` },
    publications: i % 5 === 0 ? [`https://demo.jobsmatchnow.app/posts/${id}-lessons-from-${slug(s[0])}`] : [],
    documents: { coverLetter: `Hi! I'm ${first}, a ${title.toLowerCase()} in ${place.city}. I've spent ${lv.years} years shipping ${s[0]} products and I work best with US teams that write things down. I can overlap 4+ hours with US time zones.` },
    presentation: `I build ${s[0]} products people actually use. I like small teams, clear goals and shipping every week. Looking for a ${remote ? 'remote' : 'hybrid'} role with a US startup and at least 4 hours of overlap with US time zones.`,
    motto: ['Ship small, learn fast.', 'Write it down.', 'Make it work, then make it better.'][i % 3],
    superPower: [`I can read a ${s[0]} codebase I have never seen and fix the bug in an hour.`, 'I explain hard technical ideas so anyone gets them on the first try.', 'I am the calm one when production is on fire.', `I automate the boring parts: if I do it twice, I script it.`][i % 4],
    mindset: ['Ownership', 'Clear writing', 'Bias for action', 'Curiosity'].slice(i % 2, (i % 2) + 3),
    humanSkills: ['Communication', 'Mentoring', 'Problem solving', 'Async collaboration'].slice(0, 3 + (i % 2)),
    workingPrefer: ['Async updates', 'Small teams', 'Clear goals', 'Code review culture'].slice(0, 3),
    workingAvoid: ['Endless meetings', 'Unclear ownership'].slice(0, 1 + (i % 2)),
    interests: [['Running', 'Coffee', 'Open source'], ['Photography', 'Travel', 'Board games'], ['Cycling', 'Cooking', 'Podcasts'], ['Football', 'Guitar', 'Hiking']][i % 4],
    favoriteSong: ['https://open.spotify.com/track/1mea3bSkSGXuIRvnydlB5b', 'https://www.youtube.com/watch?v=4NRXx6U8ABQ'][i % 2],
    contactChannels: [{ type: 'email', value: `${slug(name)}@demo.jobsmatchnow.app` }],
    privacy: { visibility: 'all', openToWork: true },
    jobStatus: i % 10 === 3 ? { kind: 'waiting' } : { kind: 'open' },
    agePrivacy: 'private',
    recommendations: [{
      recruiterName: recoBy, recommenderEmail: `${slug(recoBy)}@demo.jobsmatchnow.app`, company: prev, role: RECO_ROLES[i % RECO_ROLES.length],
      relationship: 'Managed directly', text: RECO_TEXT[i % RECO_TEXT.length](first, s[0]), date: ['Jan 2026', 'Mar 2026', 'Jun 2026'][i % 3],
      verified: true, wouldWorkAgain: true, ratings: { technical: 5, communication: 4 + (i % 2), reliability: 5, collaboration: 4 + ((i + 1) % 2) },
    }],
  };
}

function makeRecruiter(i) {
  const agency = i >= STARTUPS.length;
  const [company, industry, stage, size, hq, about] = agency ? AGENCIES[i - STARTUPS.length] : STARTUPS[i];
  const [name, gender, title] = RECRUITER_PEOPLE[i % RECRUITER_PEOPLE.length];
  const id = `employer-demo-${i + 7}`;
  const domain = `${slug(company)}.demo`;
  const track = TRACKS[i % TRACKS.length];
  return {
    id, demoTemplate: true, role: 'employer', demo: true, kind: agency ? 'headhunter' : 'company',
    name, email: `${slug(name)}@${domain}`, title, company,
    photo: portrait(gender, 60 + i), photoVerified: true,
    skills: ['Technical recruiting', 'Remote hiring'], languages: ['English'], experienceLevel: 'senior',
    website: `https://demo.jobsmatchnow.app/company/${slug(company)}`, industry, companySize: size, headquarters: hq,
    officeLocations: ['Remote', hq], fundingStage: stage,
    about: `${about} ${agency ? 'We match vetted engineers with funded startups.' : `${stage} startup, fully remote engineering team across US and Southeast Asia time zones.`}`,
    benefits: ['Remote work', 'Health insurance stipend', 'Learning budget', 'New laptop', agency ? 'Fast feedback' : 'Stock options'],
    techStack: track.skills, contactName: name, contactEmail: `${slug(name)}@${domain}`,
    foundedYear: 2016 + (i % 9), calendarLink: `https://demo.jobsmatchnow.app/book/${id}`,
    linkedinUrl: `https://demo.jobsmatchnow.app/linkedin/${slug(company)}`,
    specializations: agency ? ['Senior engineers', 'Remote teams', 'Southeast Asia'] : [track.title.replace(/ Engineer$/, ''), 'Remote teams'],
    regions: ['United States', 'Vietnam', 'Southeast Asia'],
  };
}

function makeJob(recruiter, i) {
  const track = TRACKS[i % TRACKS.length];
  const lv = LEVELS[1 + (i % 2)];
  const remote = i % 4 !== 3;
  const accent = ACCENTS[i % ACCENTS.length];
  return {
    id: `j-demo-${i + 1}`, demoTemplate: true, demo: true, employerId: recruiter.id,
    title: track.job, company: recruiter.company, logo: recruiter.company[0], accent,
    location: remote ? 'Remote (Southeast Asia)' : 'Ho Chi Minh City', distanceKm: remote ? 0 : 6 + (i % 10),
    workMode: remote ? 'Remote' : 'Hybrid', ...(remote ? { remoteScope: 'Southeast Asia' } : { hybridDays: 2 }),
    salary: `${monthly(lv.min)}-${monthly(lv.max)} / month`, salaryRange: { min: lv.min, max: lv.max, currency: 'USD' },
    type: i % 5 === 4 ? 'Contract' : 'Full-time', experienceLevel: lv.level, seniority: lv.level,
    requiredSkills: track.skills.slice(0, 4), requiredSkillsDetail: track.skills.slice(0, 4).map((n, k) => ({ name: n, weight: k < 2 ? 3 : 2 })),
    requiredLanguages: ['English'],
    description: `Join ${recruiter.company} as a ${track.job.toLowerCase()}. You will own ${track.skills[0]} and ${track.skills[1]} work, ship weekly, and work 4 hours a day with our US team.`,
    mission: recruiter.about.split('.')[0] + '.',
    culture: ['Remote first', 'Write it down', 'Ownership'],
    responseTime: ['< 2 days', '2 days', '< 3 days'][i % 3],
    applicants: 12 + ((i * 7) % 40), status: 'Active', hiringRadiusKm: 40,
  };
}

/** Adds the generated crowd to the seed (users + one job per new recruiter). */
export function withDemoCrowd(seed, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const have = (role) => seed.users.filter((u) => u.role === role && u.demo).length;
  const newCandidates = [];
  for (let i = 0; have('candidate') < DEMO_CANDIDATE_TARGET; i += 1) { const c = makeCandidate(i, now); seed.users.push(c); newCandidates.push(c.id); }
  const newJobs = [];
  const recruiters = [];
  for (let i = 0; have('employer') < DEMO_RECRUITER_TARGET; i += 1) {
    const r = makeRecruiter(i); seed.users.push(r); recruiters.push(r);
    const job = makeJob(r, i); seed.jobs.push(job); newJobs.push(job.id);
  }
  // Top demo job offers up to DEMO_JOB_TARGET with a SECOND role for generated recruiters (a different track).
  // Kept out of `jobIds` on purpose: the match/like rotation stays on the first roles, so existing demo
  // matches keep their ids and nothing is duplicated in a live database (the seed merge never deletes).
  const extraJobIds = [];
  const demoJobs = () => seed.jobs.filter((j) => j.demo).length;
  for (let k = 0; recruiters.length && demoJobs() < DEMO_JOB_TARGET; k += 1) {
    const r = recruiters[k % recruiters.length];
    const job = { ...makeJob(r, k + 3), id: `j-demo-extra-${k + 1}` };
    seed.jobs.push(job); extraJobIds.push(job.id);
  }
  // Demo roles get a stable "date created" (the recruiter dashboard shows it); fixed dates so restarts never move them.
  seed.jobs.forEach((j, i) => { if (!j.createdAt) j.createdAt = Date.UTC(2026, 9, 1) + ((i * 7) % 50) * 86400000; });
  // Every demo role gets the fields the 3 role pages show (founder, 2026-11-22). Demo roles only; real roles untouched.
  seed.jobs.forEach((j) => { if (j.demo || j.demoTemplate) completeDemoRole(j, seed.users.find((u) => u.id === j.employerId)); });
  return { candidateIds: newCandidates, jobIds: newJobs, extraJobIds };
}

const SEA = ['Vietnam', 'Philippines', 'Indonesia', 'Thailand', 'Malaysia', 'Singapore'];
/** Fill what a demo role is missing: full job description, contract duration, visa / nationality rule, languages,
 *  nice-to-haves, responsibilities, openings, benefits. Only empty fields are filled; text says it is a demo. */
export function completeDemoRole(j, recruiter) {
  const must = j.requiredSkillsDetail?.map((s) => s.name) || j.requiredSkills || [];
  const company = j.company || recruiter?.company || 'the company';
  const remote = j.workMode === 'Remote';
  if (!j.niceToHaves?.length) j.niceToHaves = [...new Set([...(recruiter?.techStack || []).filter((s) => !must.includes(s)), 'CI/CD', 'Remote collaboration'])].slice(0, 3);
  if (!j.responsibilities?.length) j.responsibilities = [
    `Design, build and ship ${must.slice(0, 2).join(' and ') || 'product'} features end to end`,
    'Review code, write tests and keep production healthy',
    `Work 4 overlapping hours a day with the ${remote ? 'US' : 'product'} team and share progress in writing`,
  ];
  if (!j.requiredLanguages?.length) j.requiredLanguages = ['English'];
  if (!remote && /ho chi minh|hanoi|da nang|vietnam/i.test(j.location || '') && !j.requiredLanguages.includes('Vietnamese')) j.requiredLanguages = [...j.requiredLanguages, 'Vietnamese'];
  if (!j.contractDuration) j.contractDuration = /contract|freelance/i.test(j.type || '') ? '6 months, renewable' : /intern/i.test(j.type || '') ? '3 months' : 'Permanent';
  if (j.workVisaRequired === undefined) {
    if (remote) { j.workVisaRequired = false; j.authorizedNationalities = { mode: 'custom', custom: SEA }; }
    else j.workVisaRequired = true;
  }
  if (j.openings === undefined) j.openings = 1;
  if (!j.startDate) j.startDate = remote ? 'As soon as possible' : 'Within 1 month';
  if (!j.benefits?.length && recruiter?.benefits?.length) j.benefits = recruiter.benefits;
  if (!j.fullDescription) {
    j.fullDescription = [
      'About the job',
      `This is a demo job description written for JobsMatchNow. ${company} is hiring a ${j.title}.${recruiter?.about ? ` ${recruiter.about}` : ''}`,
      '',
      'The role',
      j.description || `You will join a small engineering team and own ${must[0] || 'core'} work from idea to production.`,
      '',
      'What you will do',
      ...j.responsibilities.map((r) => `- ${r}`),
      '',
      'What we are looking for',
      ...must.map((s) => `- Solid, recent experience with ${s}`),
      ...(j.requiredLanguages.length ? [`- ${j.requiredLanguages.join(' and ')} for daily work`] : []),
      '',
      'Nice to have',
      ...j.niceToHaves.map((s) => `- ${s}`),
      '',
      'How to apply',
      'Like this role on JobsMatchNow. If the team likes you back, a conversation opens and you can talk right away.',
    ].join('\n');
  }
  return j;
}
