// Desktop action bar under the swipe phone (founder, 2026-11-24): the same actions as the phone's bottom bar,
// Filter · Surf · Likes · Chat · Interviews · Menu. Phones keep their own bottom bar (this one is hidden there).
// Founder, 2026-11-25: bigger on desktop, plus "Add more" to pin extra shortcuts (Jobs Explorer, Saved, Reports…),
// remembered in this browser.
import { useEffect, useRef, useState } from 'react';
import { BarChart3, Bookmark, Bot, Calendar, Check, Coffee, Compass, GraduationCap, Heart, LayoutGrid, ListChecks, MessageCircle, Plus, SlidersHorizontal, Trophy, User, Users, Waves } from 'lucide-react';
import type { View } from '../../types';
import { useSharedFilters } from '../discover/filterStore';
import { activeFilterCount } from '../discover/deckLogic';

export const OPEN_FILTERS_EVENT = 'jmn:open-filters';
export const OPEN_MENU_EVENT = 'jmn:open-menu';

type Props = { role: 'candidate' | 'employer'; userId: string; navigate: (v: View) => void; likes?: number };
type Extra = { key: string; label: string; icon: typeof Heart; view: View };

const EXTRAS: Record<Props['role'], Extra[]> = {
  candidate: [
    { key: 'explorer', label: 'Jobs Explorer', icon: Compass, view: 'discover' },
    { key: 'saved', label: 'Saved', icon: Bookmark, view: 'saved' },
    { key: 'stages', label: 'Hiring Stages', icon: ListChecks, view: 'stages' },
    { key: 'reports', label: 'Reports', icon: BarChart3, view: 'analytics' },
    { key: 'coffee', label: 'Coffee', icon: Coffee, view: 'coffee' },
    { key: 'coach', label: 'AI coach', icon: GraduationCap, view: 'prep' },
    { key: 'chatbot', label: 'My ChatBot', icon: Bot, view: 'assistant' },
    { key: 'profile', label: 'My profile', icon: User, view: 'profile' },
  ],
  employer: [
    { key: 'explorer', label: 'Candidate Explorer', icon: Compass, view: 'discover' },
    { key: 'selected', label: 'Selected', icon: Users, view: 'selected' },
    { key: 'stages', label: 'Hiring Stages', icon: ListChecks, view: 'stages' },
    { key: 'hired', label: 'Hired', icon: Trophy, view: 'hired' },
    { key: 'reports', label: 'Reports', icon: BarChart3, view: 'analytics' },
    { key: 'coffee', label: 'Coffee', icon: Coffee, view: 'coffee' },
    { key: 'chatbot', label: 'My ChatBot', icon: Bot, view: 'assistant' },
    { key: 'profile', label: 'My profile', icon: User, view: 'profile' },
  ],
};
const MAX_PINNED = 4;
const storeKey = (role: string) => `jm-deck-extras-${role}`;
function readPinned(role: Props['role']): string[] {
  try { const v = JSON.parse(localStorage.getItem(storeKey(role)) || 'null'); if (Array.isArray(v)) return v.filter((k) => EXTRAS[role].some((e) => e.key === k)).slice(0, MAX_PINNED); } catch { /* blocked storage */ }
  return ['explorer']; // Jobs Explorer pinned by default (founder example)
}

export function DeckActionBar({ role, userId, navigate, likes = 0 }: Props) {
  const [filters] = useSharedFilters(userId, role);
  const filterCount = activeFilterCount(filters);
  const [pinned, setPinned] = useState<string[]>(() => readPinned(role));
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { try { localStorage.setItem(storeKey(role), JSON.stringify(pinned)); } catch { /* blocked storage */ } }, [pinned, role]);
  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !pickerRef.current?.contains(e.target as Node)) setPicker(false); };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [picker]);
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
    ...EXTRAS[role].filter((e) => pinned.includes(e.key)).map((e) => ({ key: e.key, label: e.label, icon: e.icon, go: () => navigate(e.view) })),
    { key: 'menu', label: 'Menu', icon: LayoutGrid, go: () => window.dispatchEvent(new Event(OPEN_MENU_EVENT)) },
  ] as { key: string; label: string; icon: typeof Heart; badge?: number; active?: boolean; go: () => void }[];
  const toggle = (key: string) => setPinned((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_PINNED ? [...p, key] : p));
  return <div className="deck-actions-wrap" ref={pickerRef}>
    <nav className="deck-actions" aria-label="Actions">
      {items.map(({ key, label, icon: Icon, badge, active, go }) => <button key={key} type="button" className={active ? 'on' : ''} onClick={go} aria-current={active ? 'page' : undefined}>
        <span className="deck-actions-ico"><Icon size={22} />{badge ? <em>{Math.min(badge, 99)}</em> : null}</span>
        <span>{label}</span>
      </button>)}
      <button type="button" className={picker ? 'deck-add on' : 'deck-add'} onClick={() => setPicker((v) => !v)} aria-expanded={picker} aria-haspopup="true">
        <span className="deck-actions-ico"><Plus size={22} /></span><span>Add more</span>
      </button>
    </nav>
    {picker && <div className="deck-picker" role="dialog" aria-label="Add shortcuts">
      <strong>Add shortcuts to this bar</strong><small>Pick up to {MAX_PINNED}. Remembered on this computer.</small>
      <ul>{EXTRAS[role].map((e) => { const on = pinned.includes(e.key); const full = !on && pinned.length >= MAX_PINNED; return <li key={e.key}>
        <button type="button" className={on ? 'on' : ''} aria-pressed={on} disabled={full} onClick={() => toggle(e.key)}>
          <e.icon size={17} /><span>{e.label}</span>{on ? <Check size={15} className="deck-picker-check" /> : <Plus size={15} className="deck-picker-check" />}
        </button></li>; })}</ul>
    </div>}
  </div>;
}
