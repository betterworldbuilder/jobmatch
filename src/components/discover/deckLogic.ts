// Pure deck rules shared by the Discover page and the home "Look for new matches"
// section. No React here so the rules can be tested with `node --test`.
import type { Job, Person, Role } from '../../types';

export type DeckFilters = { radius: number; query: string; filterMode: string; filterType: string; minScore: number };
export type DeckItem = Job | Person;

export function filtersActive(filters: DeckFilters) {
  return Boolean(filters.query.trim() || filters.filterMode || filters.filterType || filters.minScore > 0);
}

/** The sorted list Discover shows, and the deck (candidates get a curated Top 3 unless filtering). */
export function buildDeck(role: Role, items: DeckItem[], filters: DeckFilters) {
  // Remote roles are never gated by the distance slider — only place-based ones.
  const inRadius = items.filter((item) => ('workMode' in item && (item as Job).workMode === 'Remote') || item.distanceKm === undefined || item.distanceKm <= filters.radius);
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
    return true;
  };
  const filtered = inRadius.filter(matchesSearch).filter(passesFilters).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
  const deck = role === 'candidate' && !filtersActive(filters) ? filtered.slice(0, 3) : filtered;
  return { filtered, deck };
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

/** "Jobs you should consider": the same sorted list minus the current card, max 5. */
export function considerList(filtered: DeckItem[], current: DeckItem | undefined, max = 5) {
  return filtered.filter((item) => item.id !== current?.id).slice(0, max);
}
