// Pure deck rules shared by the Discover page and the home "Look for new matches"
// section. No React here so the rules can be tested with `node --test`.
import type { Job, Person, Role } from '../../types';

/** Basic filters (every deck) + the "Search & Filters" sheet's extra filters (founder, 2026-11-24; all optional). */
export type DeckFilters = {
  radius: number; query: string; filterMode: string; filterType: string; minScore: number;
  /** false hides remote roles (candidates). Default true: remote roles are shown whatever the distance. */
  includeRemote?: boolean;
  /** Country or city, matched against location / city / country. */
  place?: string;
  /** Candidates: roles needing any of these skills. Recruiters: candidates who have ALL of them (must-have). */
  skills?: string[];
  /** Candidates: roles whose required languages are all in this list. Recruiters: candidates speaking all of them. */
  languages?: string[];
  /** Recruiters: minimum level for the chosen languages ('basic' | 'intermediate' | 'fluent' | 'native'). */
  minLanguageLevel?: string;
  /** Candidates: 'sponsorship' = role offers visa sponsorship; 'open' = role is open to the viewer's nationality. */
  visa?: '' | 'sponsorship' | 'open';
  /** Candidates: only roles whose salary is within or above the expected range. */
  salaryFit?: boolean;
  /** Recruiters: right to work in this country (citizenship, visa countries, nationality or home country). Never nationality as such. */
  rightToWork?: string;
  /** Recruiters: only candidates who need visa sponsorship. */
  needsSponsorship?: boolean;
  /** Recruiters: 'junior' | 'mid' | 'senior' | 'lead' | 'exec'. */
  experience?: string;
  /** Recruiters: 'now' | 'month' (available now, or within about a month). */
  availability?: string;
  /** Recruiters: only candidates whose job status is "Open to work". */
  openToWork?: boolean;
};
export type DeckItem = Job | Person;
/** What the rules need to know about the person filtering (for "open to my nationality"). */
export type DeckViewer = { nationality?: string; citizenship?: string[]; country?: string };

export const DEFAULT_FILTERS: DeckFilters = { radius: 100, query: '', filterMode: '', filterType: '', minScore: 0, includeRemote: true, place: '', skills: [], languages: [], minLanguageLevel: '', visa: '', salaryFit: false, rightToWork: '', needsSponsorship: false, experience: '', availability: '', openToWork: false };

/** How many filters are set (badge on the Filter button). Distance counts as one when limited. */
export function activeFilterCount(f: DeckFilters) {
  return [f.query.trim(), f.filterMode, f.filterType, f.minScore > 0, f.radius < ANY_DISTANCE_KM, f.includeRemote === false, f.place?.trim(),
    f.skills?.length, f.languages?.length, f.minLanguageLevel, f.visa, f.salaryFit, f.rightToWork?.trim(), f.needsSponsorship, f.experience,
    f.availability, f.openToWork].filter(Boolean).length;
}

export function filtersActive(filters: DeckFilters) {
  return activeFilterCount({ ...filters, radius: ANY_DISTANCE_KM, includeRemote: true }) > 0;
}

/** Distance slider at its maximum means "any distance" (the default): nothing is hidden by distance. */
export const ANY_DISTANCE_KM = 100;

const low = (s?: string) => String(s || '').trim().toLowerCase();
const EUROPE = ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czechia', 'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden', 'norway', 'iceland', 'liechtenstein', 'switzerland', 'united kingdom', 'uk'];
const US = ['united states', 'usa', 'us', 'american'];
const LEVELS: Record<string, number> = { basic: 1, beginner: 1, elementary: 1, a1: 1, a2: 1, intermediate: 2, b1: 2, b2: 2, conversational: 2, professional: 3, advanced: 3, fluent: 3, c1: 3, c2: 4, native: 4, bilingual: 4 };
const levelOf = (s?: string) => LEVELS[low(s).split(/[\s(]/)[0]] ?? 0;

/** Is a role open to someone of this nationality? (Role rule: work visa required, or which nationalities may apply.) */
export function openToNationality(job: Job, viewer?: DeckViewer) {
  if (job.visaSponsorship) return true;
  if (job.workVisaRequired === undefined) return true; // no rule set on the role
  const mine = [viewer?.nationality, ...(viewer?.citizenship || [])].map(low).filter(Boolean);
  if (job.workVisaRequired) return Boolean(job.country) && mine.includes(low(job.country)); // own citizens only
  const rule = job.authorizedNationalities?.mode || 'any';
  if (rule === 'any') return true;
  if (!mine.length) return false;
  if (rule === 'us') return mine.some((n) => US.includes(n));
  if (rule === 'europe') return mine.some((n) => EUROPE.includes(n));
  const custom = (job.authorizedNationalities?.custom || []).map(low);
  return mine.some((n) => custom.includes(n));
}

function placeText(item: DeckItem) {
  const p = item as Person & Job;
  return [p.location, p.city, p.country, p.headquarters].map(low).join(' ');
}

/** Advanced filters (the Search & Filters sheet). Candidate side filters roles, recruiter side filters candidates. */
function passesAdvanced(role: Role, item: DeckItem, f: DeckFilters, viewer?: DeckViewer) {
  if (f.place?.trim() && !placeText(item).includes(low(f.place))) return false;
  if (role === 'candidate') {
    const j = item as Job;
    if (f.includeRemote === false && j.workMode === 'Remote') return false;
    const req = [...(j.requiredSkills || []), ...((j.requiredSkillsDetail || []).map((s) => s.name))].map(low);
    if (f.skills?.length && !f.skills.some((s) => req.includes(low(s)))) return false;
    if (f.languages?.length) { const mine = f.languages.map(low); if (!(j.requiredLanguages || []).every((l) => mine.includes(low(l)))) return false; }
    if (f.visa === 'sponsorship' && !j.visaSponsorship) return false;
    if (f.visa === 'open' && !openToNationality(j, viewer)) return false;
    if (f.salaryFit && !['within', 'above'].includes(String(j.match?.salaryStatus || ''))) return false;
    return true;
  }
  const p = item as Person;
  const has = new Set([...(p.skills || []), ...((p.skillsDetail || []).map((s) => s.name))].map(low));
  if (f.skills?.length && !f.skills.every((s) => has.has(low(s)))) return false;
  if (f.languages?.length) {
    const detail = new Map((p.languageDetail || []).map((l) => [low(l.name), levelOf(l.level)]));
    for (const l of p.languages || []) if (!detail.has(low(l))) detail.set(low(l), 0);
    const need = levelOf(f.minLanguageLevel);
    for (const l of f.languages) { const got = detail.get(low(l)); if (got === undefined || (need && got < need)) return false; }
  }
  if (f.rightToWork?.trim()) {
    const c = low(f.rightToWork);
    const rights = [p.nationality, p.country, ...(p.citizenship || []), ...(p.visaCountries || [])].map(low);
    if (!rights.some((r) => r && (r === c || r.includes(c)))) return false;
  }
  if (f.needsSponsorship && p.visaSponsorship !== true) return false;
  if (f.experience && !low(`${p.seniority || ''} ${p.experienceLevel || ''}`).includes(low(f.experience))) return false;
  if (f.availability) {
    const a = low(p.availability || p.preferences?.availability);
    const now = /now|immediate|asap|available/.test(a);
    if (f.availability === 'now' && !now) return false;
    if (f.availability === 'month' && !(now || /week|1 month|one month|30 days|2 weeks|4 weeks/.test(a))) return false;
  }
  if (f.openToWork && p.jobStatus?.kind && p.jobStatus.kind !== 'open') return false;
  if (f.openToWork && !p.jobStatus?.kind && p.privacy?.openToWork === false) return false;
  // Work mode / type on the recruiter side (these buttons existed but did nothing for recruiters before).
  if (f.filterMode && low(f.filterMode) !== 'flexible') { const m = p.preferences?.workMode?.mode; if (m && low(f.filterMode).replace('-', '') !== m) return false; }
  if (f.filterType) { const t = p.preferences?.employmentTypes; if (t?.length && !t.map(low).includes(low(f.filterType))) return false; }
  return true;
}

/** The sorted list Discover shows, and the deck. Every user can swipe every available role or candidate
 *  (founder rule, 2026-11-22): no "Top 3" cut, no default fit filter, no default distance limit. */
export function buildDeck(role: Role, items: DeckItem[], filters: DeckFilters, viewer?: DeckViewer) {
  // Remote roles are never gated by the distance slider — only place-based ones, and only when a limit is set.
  const inRadius = filters.radius >= ANY_DISTANCE_KM ? items : items.filter((item) => ('workMode' in item && (item as Job).workMode === 'Remote') || item.distanceKm === undefined || item.distanceKm <= filters.radius);
  const matchesSearch = (item: DeckItem) => {
    if (!filters.query.trim()) return true;
    const q = filters.query.toLowerCase();
    const hay = role === 'candidate'
      ? [(item as Job).title, (item as Job).company, (item as Job).location, ...((item as Job).requiredSkills || [])]
      : [(item as Person).name, (item as Person).title, (item as Person).location, ...((item as Person).skills || [])];
    return hay.filter(Boolean).join(' ').toLowerCase().includes(q);
  };
  const passesFilters = (item: DeckItem) => {
    if ((item.match?.score ?? 0) < filters.minScore) return false;
    if (role === 'candidate') { const j = item as Job; if (filters.filterMode && j.workMode !== filters.filterMode) return false; if (filters.filterType && j.type !== filters.filterType) return false; }
    return passesAdvanced(role, item, filters, viewer);
  };
  const filtered = inRadius.filter(matchesSearch).filter(passesFilters).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
  return { filtered, deck: filtered };
}

/** Item 11: a plain like on a job with screening questions pauses for the 30-second form. */
export function needsScreening(role: Role, item: DeckItem, direction: 'like' | 'pass', superLike: boolean) {
  return direction === 'like' && !superLike && role === 'candidate' && Boolean((item as Job).screeningQuestions?.length);
}

/** Distance/commute only makes sense when the role needs physical presence. */
export function showsCommute(job: Job) { return job.workMode !== 'Remote' && job.distanceKm !== undefined; }

/** Drag release → action. Spec: past 110px or a flick faster than 600px/s; up = super like. */
export const SWIPE_DISTANCE = 110;
export const SWIPE_VELOCITY = 600;
export function swipeFromDrag(offset: { x: number; y: number }, velocity: { x: number; y: number }): 'like' | 'pass' | 'super' | null {
  if (-offset.y > SWIPE_DISTANCE && Math.abs(offset.y) > Math.abs(offset.x)) return 'super';
  if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) return 'like';
  if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) return 'pass';
  return null;
}

/** Keyboard → action, only used while the deck region has focus. */
export function swipeFromKey(key: string): 'like' | 'pass' | 'super' | 'undo' | null {
  if (key === 'ArrowLeft') return 'pass';
  if (key === 'ArrowRight') return 'like';
  if (key === 'ArrowUp') return 'super';
  if (key === 'Backspace') return 'undo';
  return null;
}

/** "Recommended Roles": the same sorted list minus the deck cards already seen and the current one, max 5. */
export function considerList(filtered: DeckItem[], deck: DeckItem[], index: number, max = 5) {
  const seen = new Set(deck.slice(0, index + 1).map((item) => item.id));
  return filtered.filter((item) => !seen.has(item.id)).slice(0, max);
}

/** Drop cards already liked from the side list. Only upcoming cards can be in `skipIds`
 *  (the list never shows seen cards), so the current index stays on the same card. */
export function withoutSkipped<T extends DeckItem>(deck: T[], skipIds: readonly string[]) {
  return skipIds.length ? deck.filter((item) => !skipIds.includes(item.id)) : deck;
}
