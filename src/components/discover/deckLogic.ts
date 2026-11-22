// Pure deck rules shared by the Discover page and the home "Look for new matches"
// section. No React here so the rules can be tested with `node --test`.
import type { Job, Person, Role } from '../../types';

export type DeckFilters = { radius: number; query: string; filterMode: string; filterType: string; minScore: number };
export type DeckItem = Job | Person;

export function filtersActive(filters: DeckFilters) {
  return Boolean(filters.query.trim() || filters.filterMode || filters.filterType || filters.minScore > 0);
}

/** Distance slider at its maximum means "any distance" (the default): nothing is hidden by distance. */
export const ANY_DISTANCE_KM = 100;

/** The sorted list Discover shows, and the deck. Every user can swipe every available role or candidate
 *  (founder rule, 2026-11-22): no "Top 3" cut, no default fit filter, no default distance limit. */
export function buildDeck(role: Role, items: DeckItem[], filters: DeckFilters) {
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
    return true;
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
