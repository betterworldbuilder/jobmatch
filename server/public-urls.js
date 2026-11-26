/**
 * Public addresses (founder, 2026-11-25):
 *  - candidates: https://jobsmatchnow.com/firstname.lastname (stored as user.profileSlug, unique, LinkedIn-style);
 *  - roles:      https://jobsmatchnow.com/role/<category>/<titlecode>-<id> (derived from the role: nothing stored).
 * Both are used in the interest email to recruiters.
 */
const STATIC_EXT = /\.(css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|webmanifest|apk|html?|txt|xml|json|pdf)$/i;

const ascii = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** "Nguyễn Văn Linh" → "nguyen.linh"; single names get a short id suffix so a slug always has a dot. */
export function slugBase(user) {
  const parts = ascii(user.name).split(/[^a-z0-9]+/).filter(Boolean);
  const id = ascii(user.id).replace(/[^a-z0-9]/g, '').slice(-4) || 'jm';
  if (parts.length >= 2) return `${parts[0]}.${parts[parts.length - 1]}`.slice(0, 60);
  return `${parts[0] || 'member'}.${id}`;
}

export function assignProfileSlug(db, user) {
  if (!user || user.role !== 'candidate' || user.profileSlug) return user?.profileSlug;
  const base = slugBase(user);
  const taken = new Set(db.users.map((u) => u.profileSlug).filter(Boolean));
  let slug = base; let n = 2;
  while (taken.has(slug) || STATIC_EXT.test(slug)) slug = `${base}${n++}`;
  user.profileSlug = slug;
  return slug;
}

/** Every candidate without an address gets one (startup backfill). Returns how many were assigned. */
export function ensureProfileSlugs(db) {
  let n = 0;
  for (const user of db.users || []) if (user.role === 'candidate' && !user.profileSlug) { assignProfileSlug(db, user); n += 1; }
  return n;
}

const CATEGORIES = [
  ['ai', /\b(ai|ml|machine learning|llm|genai|gen ai|nlp|computer vision|data scien)/i],
  ['data', /\b(data|analytics|bi\b|etl)/i],
  ['devops', /\b(devops|sre|cloud ?ops|platform|infrastructure|cloud)/i],
  ['security', /\b(security|cyber|soc\b)/i],
  ['fullstack', /\b(full ?stack)/i],
  ['backend', /\b(backend|back-end|api)/i],
  ['frontend', /\b(frontend|front-end|react|ui engineer)/i],
  ['mobile', /\b(mobile|ios|android|flutter)/i],
  ['design', /\b(design|ux|ui\b)/i],
  ['product', /\b(product)/i],
  ['qa', /\b(qa|test|quality)/i],
  ['engineering', /\b(engineer|developer|architect)/i],
];
export function roleCategory(job) { return CATEGORIES.find(([, re]) => re.test(job.title || ''))?.[0] || 'jobs'; }

/** "Senior AI Engineer" → "senioraieng": first letters of a short title, readable and stable. */
function titleCode(title) {
  const words = ascii(title).replace(/\(.*?\)|\[.*?\]/g, ' ').split(/[^a-z0-9]+/).filter((w) => w && !['and', 'the', 'of', 'for', 'a', 'an', 'hcm', 'remote'].includes(w));
  return words.slice(0, 3).map((w, i) => (i === words.slice(0, 3).length - 1 ? w.slice(0, 3) : w.slice(0, 6))).join('').slice(0, 14) || 'role';
}

export function roleSlug(job) { return `${titleCode(job.title)}-${String(job.id).replace(/^j-/, '').toLowerCase().replace(/[^a-z0-9]/g, '')}`; }
export function rolePath(job) { return `/role/${roleCategory(job)}/${roleSlug(job)}`; }

/** Resolve a /role/<category>/<slug> address back to the role (the id is the part after the last "-"). */
export function findRoleBySlug(db, slug) {
  const want = String(slug || '').toLowerCase();
  const tail = want.split('-').pop();
  return (db.jobs || []).find((job) => String(job.id).replace(/^j-/, '').toLowerCase().replace(/[^a-z0-9]/g, '') === tail && roleSlug(job) === want) || null;
}

/**
 * Recruiter contact details never reach candidates (founder, 2026-11-25): emails and phone numbers written in a
 * role's text are masked for everyone but the role's owner. Candidates write through the JobsMatchNow relay instead.
 */
const MASK = '[contact via JobsMatchNow]';
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
const PHONE_IN_TEXT = /(?<![\w/.-])(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{3,4}(?![\w/-])/g;
export function maskContacts(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(EMAIL_IN_TEXT, MASK).replace(PHONE_IN_TEXT, (m) => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15 && !/^(19|20)\d{2}$/.test(m.trim()) ? MASK : m;
  });
}
export function maskJobContacts(job) {
  const out = { ...job };
  for (const k of ['fullDescription', 'description', 'mission']) if (typeof out[k] === 'string') out[k] = maskContacts(out[k]);
  for (const k of ['responsibilities', 'benefits', 'interviewProcess']) if (Array.isArray(out[k])) out[k] = out[k].map(maskContacts);
  return out;
}

/** What anyone may see on a candidate's public profile page (no contact details). */
export function publicProfileView(user, photoUrl) {
  if (!user || user.role !== 'candidate' || user.publicProfile === false) return null;
  const skills = (user.skillsDetail || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0)).map((s) => s.name)
    .concat(user.skills || []).filter((s, i, all) => s && all.indexOf(s) === i).slice(0, 15);
  const linkedin = user.links?.linkedin ? (/^https?:/i.test(user.links.linkedin) ? user.links.linkedin : `https://${user.links.linkedin}`) : undefined;
  return {
    slug: user.profileSlug, name: user.name, title: user.title, photo: photoUrl, yearsExperience: user.yearsExperience,
    city: user.city, country: user.country, about: user.about || user.summary || user.bio, skills,
    languages: (user.languageDetail || []).map((l) => l.name || l).filter(Boolean).slice(0, 8),
    workModes: user.preferences?.workMode?.modes || (user.preferences?.workMode?.mode ? [user.preferences.workMode.mode] : undefined),
    availability: user.preferences?.availability, linkedin, demo: user.demo === true || undefined,
    // A resume exists (never the file): the page offers "Download my resume" to registered recruiters (2026-11-26).
    hasResume: Boolean(user.documents?.resume) || undefined,
  };
}
