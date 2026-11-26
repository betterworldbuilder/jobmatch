/**
 * Job groups (founder, 2026-11-25): admin-managed, shareable lists of jobs at https://jobsmatchnow.com/app/{slug}.
 *
 * - Groups live in `db.jobGroups` (admins create, rename, turn off). Jobs keep group IDS in `job.jobGroups`, so a
 *   renamed link never loses its jobs; an old slug is kept in `oldSlugs` and redirects to the new one.
 * - A job appears on a public group page only when it is live, real (no demo / sample / suspended owner) and an
 *   authorized person ticked the group (recruiter: own job; JobFinder: its listings; admin: any job). Ticking a group
 *   is the recruiter's choice to list the job publicly; ungrouped jobs stay members-only.
 * - Public responses carry CARD FIELDS ONLY (title, company, place, work mode, level, date, groups, JobFinder status,
 *   and a salary only where candidates would see it anyway). Full details need a session: /api/jobs/:id/details.
 * - LinkedIn: links carry ?src=linkedin; visits, sign-ups and applications from LinkedIn are counted (demo excluded).
 */
import crypto from 'node:crypto';
import { ValidationError } from './matching.js';
import { involvesDemo } from './analytics.js';

export const RESERVED_SLUGS = ['app', 'api', 'assets', 'admin', 'jobs', 'job', 'ref', 'downloads', 'legal', 'index', 'sw', 'manifest',
  'static', 'login', 'register', 'signup', 'settings', 'home', 'privacy', 'terms', 'help', 'groups', 'group', 'search', 'public', 'icons', 'images'];
export const DEFAULT_GROUPS = [
  { id: 'g-ai-ml', slug: 'ai-machine-learning', name: 'AI & Machine Learning', description: 'AI, LLM, machine learning and MLOps roles.', examples: ['AI Engineer', 'LLM Engineer', 'Machine Learning Engineer', 'MLOps Engineer'] },
  { id: 'g-data', slug: 'data', name: 'Data', description: 'Data engineering, data science and analytics roles.', examples: ['Data Engineer', 'Data Scientist', 'Analytics Engineer', 'Data Architect'] },
  { id: 'g-cloud-devops', slug: 'cloud-devops', name: 'Cloud & DevOps', description: 'Cloud, DevOps, SRE and platform roles.', examples: ['Cloud Architect', 'DevOps Engineer', 'SRE', 'Platform Engineer'] },
  { id: 'g-software', slug: 'software-engineering', name: 'Software Engineering', description: 'Backend, frontend, full-stack and mobile engineering roles.', examples: ['Backend Engineer', 'Frontend Engineer', 'Full-Stack Engineer', 'Mobile Engineer'] },
  // Added by the founder, 2026-11-26.
  { id: 'g-security', slug: 'cybersecurity', name: 'Cybersecurity', description: 'Security engineering, SOC, cloud security and governance roles.', examples: ['Security Engineer', 'SOC Analyst', 'Cloud Security Engineer', 'Penetration Tester'] },
  { id: 'g-marketing', slug: 'marketing', name: 'Marketing', description: 'Marketing, growth, content and brand roles.', examples: ['Growth Marketer', 'Digital Marketing Manager', 'Content Marketer', 'Brand Manager'] },
];
const DAY = 86400000;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const str = (v, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const LINK_SOURCES = ['linkedin'];
export const cleanSrc = (v) => (LINK_SOURCES.includes(v) ? v : undefined);

export function ensureGroups(db) {
  if (!Array.isArray(db.jobGroups)) db.jobGroups = [];
  if (!db.jobGroups.length) DEFAULT_GROUPS.forEach((g, i) => db.jobGroups.push({ ...g, oldSlugs: [], order: i + 1, active: true, createdAt: Date.now() }));
  // Default groups added later (Cybersecurity, Marketing) join existing databases once; an admin can still hide them.
  for (const [i, g] of DEFAULT_GROUPS.entries()) {
    if (!db.jobGroups.some((x) => x.id === g.id) && !db.jobGroups.some((x) => x.slug === g.slug)) db.jobGroups.push({ ...g, oldSlugs: [], order: i + 1, active: true, createdAt: Date.now() });
  }
  // Founder, 2026-11-26: "Cloud, DevOps & SRE" (was "Cloud & DevOps"); the link /app/cloud-devops stays.
  const cloud = db.jobGroups.find((x) => x.id === 'g-cloud-devops');
  if (cloud && cloud.name === 'Cloud & DevOps') cloud.name = 'Cloud, DevOps & SRE';
}
const sorted = (db) => (db.jobGroups || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));

/** Group ids an editor may set: only existing, active groups; at most 6. Unknown ids are dropped, never guessed. */
export function cleanGroupIds(db, value) {
  if (!Array.isArray(value)) throw new ValidationError('jobGroups', 'jobGroups must be a list');
  const active = new Set((db.jobGroups || []).filter((g) => g.active).map((g) => g.id));
  return [...new Set(value.filter((id) => typeof id === 'string' && active.has(id)))].slice(0, 6);
}
/** Called by every job create / edit route after its own permission check. */
export function assignGroups(db, job, body) {
  if (body && body.jobGroups !== undefined) job.jobGroups = cleanGroupIds(db, body.jobGroups);
}

/** Live, real job that may be listed publicly (group pages need a group as well). */
export function isPublicJob(db, job) {
  if (!job || String(job.status).toLowerCase() !== 'active') return false;
  if (job.demo || job.sample || job.demoTemplate) return false;
  if (job.jobFinder && !['published', 'claimed'].includes(job.jobFinder.listingStatus)) return false;
  const owner = db.users.find((u) => u.id === job.employerId);
  return Boolean(owner) && !owner.demo && !owner.sample && !owner.suspendedAt;
}

// Who may apply, exactly as the recruiter stated it (job editor: "Required valid work visa and nationality").
export const EUROPE = ['Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Monaco', 'Montenegro', 'Netherlands', 'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom', 'UK'];
const US_NAMES = ['united states', 'usa', 'us', 'united states of america', 'american'];
export function eligibilityOf(job) {
  if (job.workVisaRequired === true) return { kind: 'right-to-work' };
  if (job.workVisaRequired === false) {
    const a = job.authorizedNationalities || { mode: 'any' };
    if (a.mode === 'custom') return { kind: 'custom', countries: (a.custom || []).slice(0, 30) };
    return { kind: ['us', 'europe'].includes(a.mode) ? a.mode : 'any' };
  }
  return { kind: 'unknown' };
}
/** Does the job explicitly say a citizen of `nationality` may apply? (Unknown / right-to-work → no claim.) */
export function openTo(elig, nationality) {
  const n = String(nationality || '').trim().toLowerCase();
  if (!n) return true;
  if (elig.kind === 'any') return true;
  if (elig.kind === 'us') return US_NAMES.includes(n);
  if (elig.kind === 'europe') return EUROPE.some((c) => c.toLowerCase() === n);
  if (elig.kind === 'custom') return elig.countries.some((c) => c.toLowerCase() === n);
  return false;
}
// Country › city, read only from what the job states: its country field, or "City, …, Country" in its location.
const COUNTRIES = new Set([...EUROPE, 'Vietnam', 'Viet Nam', 'United States', 'USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines', 'Cambodia', 'Laos', 'Myanmar', 'Japan', 'South Korea', 'Korea', 'China', 'Hong Kong', 'Taiwan', 'India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Australia', 'New Zealand', 'United Arab Emirates', 'UAE', 'Saudi Arabia', 'Qatar', 'Israel', 'Turkey', 'Egypt', 'Nigeria', 'Kenya', 'South Africa', 'Morocco'].map((c) => c.toLowerCase()));
const CANON = { usa: 'United States', us: 'United States', 'united states of america': 'United States', 'viet nam': 'Vietnam', uk: 'United Kingdom', uae: 'United Arab Emirates', korea: 'South Korea', czechia: 'Czech Republic' };
const canonCountry = (c) => { const k = c.trim().toLowerCase(); return CANON[k] || c.trim(); };
export function placeOf(job) {
  const parts = String(job.location || '').split(',').map((s) => s.trim()).filter(Boolean).filter((p) => !/^remote\b/i.test(p));
  const last = parts[parts.length - 1];
  let country = job.country ? canonCountry(job.country) : undefined;
  if (!country && last && (parts.length > 1 || COUNTRIES.has(last.toLowerCase()))) country = canonCountry(last);
  const cityPart = parts.length > 1 ? parts[0] : parts[0] && canonCountry(parts[0]) !== country ? parts[0] : undefined;
  return { country: country || null, city: cityPart || null };
}
const ELIG_ORDER = { any: 0, custom: 1, us: 1, europe: 1, 'right-to-work': 2, unknown: 3 };
const levelOf = (job) => job.seniority || job.experienceLevel || undefined;
const postedAt = (job) => job.createdAt || Date.parse(job.jobFinder?.discoveredAt || '') || undefined;
/** Salary as candidates see it before a match: JobFinder listings show the published salary; members' roles reveal it after a match. */
function publicSalary(job) {
  if (job.jobFinder && job.jobFinder.listingStatus !== 'claimed') {
    if (job.salaryRange) return job.salaryRange.max != null
      ? `${job.salaryRange.currency} ${job.salaryRange.min.toLocaleString('en-US')}–${job.salaryRange.max.toLocaleString('en-US')}`
      : `From ${job.salaryRange.currency} ${job.salaryRange.min.toLocaleString('en-US')}`;
    return job.salary || null;
  }
  return null;
}
const previewOf = (job) => { const t = String(job.description || job.fullDescription || '').replace(/\s+/g, ' ').trim(); return t.length > 300 ? `${t.slice(0, 297).replace(/\s+\S*$/, '')}…` : t; };

/** What anyone may see about a public job. No description beyond a short preview, no contacts, no recruiter. */
export function cardView(db, job) {
  const owner = db.users.find((u) => u.id === job.employerId);
  const groups = (job.jobGroups || []).map((id) => db.jobGroups.find((g) => g.id === id && g.active)).filter(Boolean).map((g) => ({ id: g.id, slug: g.slug, name: g.name }));
  const salary = publicSalary(job);
  const jf = job.jobFinder && job.jobFinder.listingStatus !== 'claimed' ? { addedBy: 'JobFinder', employerStatus: job.jobFinder.employerStatus || 'pending', source: job.jobFinder.source } : undefined;
  return {
    id: job.id, title: job.title, company: job.company, location: job.location || null, workMode: job.workMode || null, type: job.type || null,
    level: levelOf(job) || null, postedAt: postedAt(job) || null, salary, salaryAfterMatch: !salary && !jf, groups, preview: previewOf(job),
    eligibility: eligibilityOf(job), visaSponsorship: job.visaSponsorship === true || undefined, ...placeOf(job),
    companyLogo: !jf && typeof owner?.companyLogo === 'string' && owner.companyLogo.startsWith('/api/') ? owner.companyLogo : undefined,
    ...(jf ? { jobFinder: jf } : {}),
  };
}

/** Find a group by its current or an old slug. */
export function groupBySlug(db, slug) {
  const s = String(slug || '').toLowerCase();
  const g = db.jobGroups.find((x) => x.slug === s);
  if (g) return { group: g };
  const old = db.jobGroups.find((x) => (x.oldSlugs || []).includes(s));
  return old ? { group: old, redirect: old.slug } : {};
}

/** Public jobs of a group with filters (only on values the job records really have). */
export function groupJobs(db, group, q = {}) {
  let jobs = db.jobs.filter((j) => (j.jobGroups || []).includes(group.id) && isPublicJob(db, j)).map((j) => cardView(db, j));
  const all = jobs;
  if (q.mode) jobs = jobs.filter((j) => j.workMode === q.mode);
  if (q.level) jobs = jobs.filter((j) => j.level === q.level);
  if (q.location) { const l = String(q.location).toLowerCase(); jobs = jobs.filter((j) => String(j.location || '').toLowerCase().includes(l)); }
  // Drill-down: country → city. Facet counts are computed before the level they describe is applied.
  const count = (list, key) => Object.entries(list.reduce((m, j) => { const k = j[key] || ''; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([name, n]) => ({ name, n })).sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || b.n - a.n || a.name.localeCompare(b.name));
  const countries = count(jobs, 'country');
  if (typeof q.country === 'string' && q.country) jobs = jobs.filter((j) => (q.country === '-' ? !j.country : j.country === q.country));
  const cities = q.country ? count(jobs, 'city') : [];
  if (typeof q.city === 'string' && q.city) jobs = jobs.filter((j) => (q.city === '-' ? !j.city : j.city === q.city));
  if (q.salary === '1') jobs = jobs.filter((j) => j.salary);
  const days = Number(q.days); if (days > 0) jobs = jobs.filter((j) => j.postedAt && Date.now() - j.postedAt <= days * DAY);
  // Nationality: only jobs that explicitly say this nationality may apply; how many don't say is reported apart.
  const nat = typeof q.nationality === 'string' ? q.nationality.trim().slice(0, 60) : '';
  let notStated = 0;
  if (nat) { notStated = jobs.filter((j) => j.eligibility.kind === 'unknown').length; jobs = jobs.filter((j) => openTo(j.eligibility, nat)); }
  const recent = (a, b) => (b.postedAt || 0) - (a.postedAt || 0);
  const known = (v) => (v ? 0 : 1);
  // Default (founder, 2026-11-25): type of role › country › city › citizenship / visa, newest first inside.
  const byPlace = (a, b) => known(a.country) - known(b.country) || String(a.country || '').localeCompare(String(b.country || ''))
    || known(a.city) - known(b.city) || String(a.city || '').localeCompare(String(b.city || ''))
    || ELIG_ORDER[a.eligibility.kind] - ELIG_ORDER[b.eligibility.kind] || recent(a, b);
  jobs.sort(q.sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : q.sort === 'recent' ? recent : byPlace);
  const facet = (k) => [...new Set(all.map((j) => j[k]).filter(Boolean))].sort();
  // Nationalities the listed jobs explicitly name (for the picker); "any" jobs fit every choice.
  const named = [...new Set(all.flatMap((j) => (j.eligibility.kind === 'custom' ? j.eligibility.countries : j.eligibility.kind === 'us' ? ['United States'] : [])))].sort();
  return { jobs, total: all.length, nationalityNotStated: notStated, facets: { countries, cities, modes: facet('workMode'), levels: facet('level'), withSalary: all.filter((j) => j.salary).length, nationalities: named, europe: all.some((j) => j.eligibility.kind === 'europe') } };
}

const groupView = (db, g) => ({ id: g.id, slug: g.slug, name: g.name, description: g.description || '', examples: g.examples || [], keywords: g.keywords || [], custom: Boolean(g.custom), count: db.jobs.filter((j) => (j.jobGroups || []).includes(g.id) && isPublicJob(db, j)).length });

/** Title-based suggestions for the editor (shown as "suggested", never ticked automatically). Same list as src/lib/jobGroups.ts. */
const SUGGEST = {
  'g-ai-ml': /\b(ai|a\.i\.|llm|llms|machine learning|ml|mlops|deep learning|nlp|computer vision|genai|generative)\b/i,
  'g-data': /\b(data|analytics|bi|etl|warehouse|database|dba|databricks|snowflake)\b/i,
  'g-cloud-devops': /\b(cloud|devops|devsecops|sre|site reliability|platform|infrastructure|kubernetes|aws|azure|gcp|mlops|cloudops)\b/i,
  'g-software': /\b(software|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|developer|programmer|java|python|golang|\.net|react|qa|(?<!penetration )tester)\b/i,
  'g-security': /\b(security|cyber|cybersecurity|soc|pentest|penetration|iam|infosec|devsecops|grc)\b/i,
  'g-marketing': /\b(marketing|marketer|growth|seo|sem|content|brand|social media|communications|pr)\b/i,
};
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Groups a title belongs to: the built-in rules plus each custom group's keywords (active groups only). */
export function groupsForTitle(db, title) {
  const t = String(title || '');
  const active = (db.jobGroups || []).filter((g) => g.active);
  return sorted({ jobGroups: active }).filter((g) => (SUGGEST[g.id]?.test(t)) || (g.keywords || []).some((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(k)}([^\\p{L}\\p{N}]|$)`, 'iu').test(t))).map((g) => g.id);
}

function htmlEscape(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function mountGroups(app, ctx) {
  const { store, authSession, track, origin, limiter, jobFullView } = ctx;
  const session = (req) => authSession(req);
  const requireAdmin = (req) => { const s = session(req); if (!s || s.role !== 'admin') { const e = new Error('Admins only'); e.status = 403; throw e; } return s; };
  const counted = (req) => req.query.notrack !== '1';

  // ---------- Public ----------
  app.get('/api/public/groups', async (_req, res, next) => {
    try { const db = await store.read(); res.json({ groups: sorted(db).filter((g) => g.active).map((g) => groupView(db, g)) }); } catch (e) { next(e); }
  });

  app.get('/api/public/groups/:slug', async (req, res, next) => {
    try {
      const out = await store.transaction((db) => {
        ensureGroups(db);
        const { group, redirect } = groupBySlug(db, req.params.slug);
        if (!group || !group.active) { const e = new Error('This job group is not available'); e.status = 404; throw e; }
        if (redirect) return { redirect };
        const src = cleanSrc(req.query.src);
        if (counted(req)) {
          track(db, 'grp_viewed', { demo: false, dim: group.slug.slice(0, 40) });
          if (['mode', 'level', 'location', 'salary', 'days', 'nationality', 'country', 'city'].some((k) => req.query[k])) track(db, 'grp_filter', { demo: false, dim: group.slug.slice(0, 40) });
          if (src) track(db, 'li_visit', { demo: false, dim: 'group' });
        }
        return { group: groupView(db, group), ...groupJobs(db, group, req.query) };
      });
      res.json(out);
    } catch (e) { next(e); }
  });

  // One public job (any live, real job: a recruiter shares this link, e.g. as LinkedIn's "external website").
  app.get('/api/public/job/:id', async (req, res, next) => {
    try {
      const out = await store.transaction((db) => {
        ensureGroups(db);
        const job = db.jobs.find((j) => j.id === req.params.id);
        if (!isPublicJob(db, job)) { const e = new Error('This job is not available any more'); e.status = 404; throw e; }
        if (counted(req)) {
          if (typeof req.query.from === 'string' && req.query.from) track(db, 'grp_job_selected', { demo: false, dim: String(req.query.from).slice(0, 40) });
          if (cleanSrc(req.query.src)) track(db, 'li_visit', { demo: false, dim: 'job' });
          if (job.jobFinder) { const row = (db.jfInternal || []).find((r) => r.jobId === job.id); if (row) row.stats.views += 1; }
        }
        return { job: cardView(db, job) };
      });
      res.json(out);
    } catch (e) { next(e); }
  });

  // Steps only the browser sees (prompt shown, register clicked, came back to the job). Counts only, no ids.
  const CLIENT_EVENTS = ['grp_gate_shown', 'grp_register_started', 'grp_returned'];
  app.post('/api/public/event', limiter, async (req, res, next) => {
    try {
      const name = req.body?.name;
      if (!CLIENT_EVENTS.includes(name)) throw new ValidationError('name', 'Unknown event');
      await store.transaction((db) => {
        const s = session(req); const user = s && db.users.find((u) => u.id === s.sub);
        track(db, name, { demo: involvesDemo(user), dim: cleanSrc(req.body?.src) || '' });
      });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // Full details: signed-in members only (the gate is enforced here, not just hidden in the page).
  app.get('/api/jobs/:id/details', async (req, res, next) => {
    try {
      const s = session(req);
      if (!s) { const e = new Error('Sign in to continue'); e.status = 401; throw e; }
      const db = await store.read();
      const viewer = db.users.find((u) => u.id === s.sub);
      if (!viewer) { const e = new Error('Sign in to continue'); e.status = 401; throw e; }
      const job = db.jobs.find((j) => j.id === req.params.id);
      if (!job || (job.employerId !== viewer.id && !isPublicJob(db, job) && !(viewer.demo && job.demo && String(job.status).toLowerCase() === 'active'))) { const e = new Error('This job is not available any more'); e.status = 404; throw e; }
      res.json({ job: jobFullView(db, job, viewer), liked: db.swipes.some((w) => w.actorId === viewer.id && w.targetType === 'job' && w.targetId === job.id && w.direction === 'like') });
    } catch (e) { next(e); }
  });

  // Link previews (LinkedIn, WhatsApp, …): nginx sends link-preview bots here; people get the normal app page.
  app.get('/api/public/share/app/*', async (req, res, next) => {
    try {
      const db = await store.read();
      const parts = String(req.params[0] || '').split('/').filter(Boolean);
      let title = 'Jobs on JobsMatchNow'; let description = 'Swipe-to-match hiring: see real roles, apply in one tap, chat only when both sides say yes.';
      let path = '/app/';
      if (parts[0] === 'job' && parts[1]) {
        const job = db.jobs.find((j) => j.id === parts[1]);
        if (isPublicJob(db, job)) { title = `${job.title} at ${job.company} · JobsMatchNow`; description = [job.location, job.workMode].filter(Boolean).join(' · ') || description; path = `/app/job/${job.id}`; }
      } else if (parts[0]) {
        const { group } = groupBySlug(db, parts[0]);
        if (group?.active) { const n = groupView(db, group).count; title = `${group.name} jobs · JobsMatchNow`; description = `${n} open ${n === 1 ? 'role' : 'roles'}. ${group.description || ''}`.trim(); path = `/app/${group.slug}`; }
      }
      const url = `${origin}${path}`;
      res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><meta name="description" content="${htmlEscape(description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="JobsMatchNow"><meta property="og:title" content="${htmlEscape(title)}"><meta property="og:description" content="${htmlEscape(description)}"><meta property="og:url" content="${htmlEscape(url)}"><meta property="og:image" content="${origin}/og.png"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${htmlEscape(url)}"></head><body><h1>${htmlEscape(title)}</h1><p>${htmlEscape(description)}</p><p><a href="${htmlEscape(url)}">Open on JobsMatchNow</a></p></body></html>`);
    } catch (e) { next(e); }
  });

  // ---------- Admin ----------
  app.get('/api/admin/job-groups', async (req, res, next) => {
    try { requireAdmin(req); const db = await store.read(); res.json({ groups: sorted(db).map((g) => ({ ...g, count: groupView(db, g).count, url: `${origin}/app/${g.slug}` })) }); } catch (e) { next(e); }
  });
  app.post('/api/admin/job-groups', async (req, res, next) => {
    try {
      const s = requireAdmin(req);
      const group = await store.transaction((db) => createGroup(db, req.body || {}, s.sub));
      res.status(201).json({ group: { ...group, url: `${origin}/app/${group.slug}` } });
    } catch (e) { next(e); }
  });
  app.patch('/api/admin/job-groups/:id', async (req, res, next) => {
    try {
      requireAdmin(req);
      const group = await store.transaction((db) => {
        const g = (db.jobGroups || []).find((x) => x.id === req.params.id);
        if (!g) { const e = new Error('Group not found'); e.status = 404; throw e; }
        applyGroup(db, g, req.body || {}, false);
        g.updatedAt = Date.now();
        return g;
      });
      res.json({ group: { ...group, url: `${origin}/app/${group.slug}` } });
    } catch (e) { next(e); }
  });
  // Admins can correct any job's groups.
  app.patch('/api/admin/jobs/:id/groups', async (req, res, next) => {
    try {
      requireAdmin(req);
      const out = await store.transaction((db) => {
        const job = db.jobs.find((j) => j.id === req.params.id);
        if (!job) { const e = new Error('Job not found'); e.status = 404; throw e; }
        job.jobGroups = cleanGroupIds(db, req.body?.jobGroups);
        return { id: job.id, jobGroups: job.jobGroups };
      });
      res.json(out);
    } catch (e) { next(e); }
  });
}

const slugTaken = (db, slug, exceptId) => RESERVED_SLUGS.includes(slug) || db.jobGroups.some((g) => g.id !== exceptId && (g.slug === slug || (g.oldSlugs || []).includes(slug)));
function applyGroup(db, g, body, creating) {
  if (body.name !== undefined || creating) { const n = str(body.name, 60); if (!n) throw new ValidationError('name', 'A group needs a name'); g.name = n; }
  if (body.description !== undefined) g.description = str(body.description, 300) || '';
  if (body.examples !== undefined) g.examples = (Array.isArray(body.examples) ? body.examples : String(body.examples).split(',')).map((x) => str(String(x), 60)).filter(Boolean).slice(0, 12);
  // Title keywords that put a role in this group (custom groups, 2026-11-26), e.g. "SAP, ABAP, S/4HANA".
  if (body.keywords !== undefined) g.keywords = (Array.isArray(body.keywords) ? body.keywords : String(body.keywords).split(',')).map((x) => str(String(x), 40)).filter(Boolean).slice(0, 20);
  if (body.order !== undefined) g.order = Math.max(0, Math.min(999, Number(body.order) || 0));
  if (body.active !== undefined) g.active = body.active === true;
  if (body.slug !== undefined || creating) {
    const slug = slugify(body.slug || g.name);
    if (!SLUG_RE.test(slug)) throw new ValidationError('slug', 'Use lowercase letters, numbers and dashes');
    if (slugTaken(db, slug, g.id)) throw new ValidationError('slug', `The link name "${slug}" is already used`);
    if (!creating && g.slug && g.slug !== slug) g.oldSlugs = [...new Set([...(g.oldSlugs || []), g.slug])].filter((x) => x !== slug).slice(-10);
    g.slug = slug;
  }
}
/** Create a job group (admin page, or the JobFinder account's "Add group"). */
export function createGroup(db, body, actorId, { custom = false } = {}) {
  ensureGroups(db);
  const g = { id: `g-${crypto.randomUUID().slice(0, 8)}`, oldSlugs: [], examples: [], keywords: [], description: '', order: db.jobGroups.length + 1, active: true, createdAt: Date.now(), createdBy: actorId, ...(custom ? { custom: true } : {}) };
  applyGroup(db, g, body || {}, true);
  db.jobGroups.push(g);
  return g;
}
/** Roles of an account with no group get the groups their title matches (`onlyGroupId`: add that one group only). */
export function assignGroupsFromTitles(db, employerId, { onlyGroupId } = {}) {
  ensureGroups(db);
  let changed = 0;
  for (const j of db.jobs) {
    if (j.employerId !== employerId || j.deletedAt) continue;
    const match = groupsForTitle(db, j.title);
    if (onlyGroupId) {
      if (match.includes(onlyGroupId) && !(j.jobGroups || []).includes(onlyGroupId)) { j.jobGroups = [...(j.jobGroups || []), onlyGroupId].slice(0, 6); changed += 1; }
    } else if (!(j.jobGroups || []).length && match.length) { j.jobGroups = match.slice(0, 6); changed += 1; }
  }
  return changed;
}

export function suggestGroups(title) {
  return Object.entries(SUGGEST).filter(([, re]) => re.test(String(title || ''))).map(([id]) => id);
}
