// Discover's deck state and actions, shared by the Discover page and the home
// "Find My Match" sections. Same filters, same API calls; every available card is swipable.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Bootstrap, Job, JobMatch, Person, Role, ScreeningAnswer } from '../../types';
import { ANY_DISTANCE_KM, buildDeck, filtersActive as hasActiveFilters, needsScreening, withoutSkipped } from './deckLogic';

type SwipeResult = { match?: JobMatch | null; likesRemaining?: number };

/** options.items: a role's own list (e.g. one recruiter job's scored candidates, or one target role's jobs);
 *  options.jobId: the recruiter role the swipes belong to; options.resetKey: restart the deck when it changes. */
export function useDiscoverDeck(role: Role, data: Bootstrap, setData: (d: Bootstrap) => void, options?: { onSwiped?: (result: SwipeResult) => void; skipIds?: readonly string[]; items?: (Job | Person)[]; jobId?: string; resetKey?: string }) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [screeningFor, setScreeningFor] = useState<Job | null>(null);
  // Defaults show everything: any distance, any fit (filters stay available in Discover).
  const [radius, setRadius] = useState(ANY_DISTANCE_KM);
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterType, setFilterType] = useState('');
  const [minScore, setMinScore] = useState(0);
  const filters = { radius, query, filterMode, filterType, minScore };
  const filtersActive = hasActiveFilters(filters);
  const rawDeck = options?.items ?? (role === 'candidate' ? data.jobs : data.candidates);
  const built = buildDeck(role, rawDeck, filters);
  const filtered = built.filtered;
  // Cards already liked from a side list are not shown again later in the deck.
  const deck = withoutSkipped(built.deck, options?.skipIds || []);
  useEffect(() => setIndex(0), [radius, role, query, filterMode, filterType, minScore, options?.resetKey]);
  const current = deck[index];
  const next = deck[index + 1];
  const commitSwipe = async (direction: 'like' | 'pass', target: Job | Person, opts?: { superLike?: boolean; answers?: ScreeningAnswer[]; note?: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.swipe({ actorId: data.viewer.id, targetId: target.id, targetType: role === 'candidate' ? 'job' : 'candidate', direction, superLike: opts?.superLike || undefined, answers: opts?.answers?.length ? opts.answers : undefined, note: opts?.note?.trim() || undefined, jobId: role === 'employer' ? options?.jobId : undefined });
      if (result.match) setMatch(result.match);
      setData({ ...data, likesRemaining: result.likesRemaining ?? data.likesRemaining - (direction === 'like' ? 1 : 0) });
      // Only the card on top moves the deck on; a like from a side list leaves it where it is.
      if (target.id === current?.id) setIndex((value) => value + 1);
      options?.onSwiped?.(result);
    } catch (e) { alert(e instanceof Error ? e.message : 'Swipe failed'); }
    finally { setBusy(false); }
  };
  const act = (direction: 'like' | 'pass', superLike = false) => {
    if (!current || busy) return;
    if (needsScreening(role, current, direction, superLike)) { setScreeningFor(current as Job); return; }
    void commitSwipe(direction, current, { superLike });
  };
  // Rewind/Undo: take back the last swipe (removes it server-side, incl. any match).
  const undo = async () => {
    if (index === 0 || busy) return;
    setBusy(true);
    try {
      await api.undoSwipe(data.viewer.id);
      const fresh = await api.bootstrap(data.viewer.id);
      setData(fresh);
      setIndex((value) => Math.max(0, value - 1));
    } catch (e) { alert(e instanceof Error ? e.message : 'Undo failed'); }
    finally { setBusy(false); }
  };
  return {
    deck, filtered, index, setIndex, current, next, busy, match, setMatch, screeningFor, setScreeningFor,
    commitSwipe, act, undo,
    radius, setRadius, query, setQuery, filterMode, setFilterMode, filterType, setFilterType, minScore, setMinScore, filtersActive,
  };
}
