// Desktop action bar under the swipe phone (founder, 2026-11-24): the same actions as the phone's bottom bar,
// Filter · Surf · Likes · Chat · Interviews · Menu. Phones keep their own bottom bar (this one is hidden there).
import { Calendar, Heart, LayoutGrid, MessageCircle, SlidersHorizontal, Waves } from 'lucide-react';
import type { View } from '../../types';
import { useSharedFilters } from '../discover/filterStore';
import { activeFilterCount } from '../discover/deckLogic';

export const OPEN_FILTERS_EVENT = 'jmn:open-filters';
export const OPEN_MENU_EVENT = 'jmn:open-menu';

type Props = { role: 'candidate' | 'employer'; userId: string; navigate: (v: View) => void; likes?: number };

export function DeckActionBar({ role, userId, navigate, likes = 0 }: Props) {
  const [filters] = useSharedFilters(userId, role);
  const filterCount = activeFilterCount(filters);
  const goLikes = () => {
    navigate('home');
    window.setTimeout(() => document.getElementById(role === 'candidate' ? 'td-chasing' : 'td-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  };
  const items = [
    { key: 'filter', label: 'Filter', icon: SlidersHorizontal, badge: filterCount, go: () => window.dispatchEvent(new Event(OPEN_FILTERS_EVENT)) },
    { key: 'surf', label: 'Surf', icon: Waves, active: true, go: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { key: 'likes', label: 'Likes', icon: Heart, badge: likes, go: goLikes },
    { key: 'chat', label: 'Chat', icon: MessageCircle, go: () => navigate('messages') },
    { key: 'interviews', label: 'Interviews', icon: Calendar, go: () => navigate('meetings') },
    { key: 'menu', label: 'Menu', icon: LayoutGrid, go: () => window.dispatchEvent(new Event(OPEN_MENU_EVENT)) },
  ];
  return <nav className="deck-actions" aria-label="Actions">
    {items.map(({ key, label, icon: Icon, badge, active, go }) => <button key={key} type="button" className={active ? 'on' : ''} onClick={go} aria-current={active ? 'page' : undefined}>
      <span className="deck-actions-ico"><Icon size={19} />{badge ? <em>{Math.min(badge, 99)}</em> : null}</span>
      <span>{label}</span>
    </button>)}
  </nav>;
}
