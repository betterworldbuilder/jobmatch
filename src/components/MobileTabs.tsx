// Phone action bar + "Global Menu" (founder, 2026-11-22), for job seekers and recruiters.
// - Bar defaults: Surf · Global Menu · Likes · Chat · invitations last (see lib/tabBar.ts). Profile lives in the menu.
// - "Customize bar": drag a menu tile onto the bar (insert / replace), drag bar buttons to reorder, drag one off
//   the bar to remove it, or tap a tile to add/remove. Pointer events, so it works with touch and mouse.
// - Saved per person and role on this device (localStorage); Global Menu always stays in the bar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, GripVertical, Heart, LayoutGrid, MessageCircle, Pencil, User, Waves, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { View } from '../types';
import { defaultTabs, MAX_TABS, MENU_KEY, normalizeTabs, placeTab, removeTab, toggleTab } from '../lib/tabBar';

export type TabNavItem = { label: string; short?: string; icon: LucideIcon; view?: View; anchor?: string };
type Item = { key: string; label: string; short: string; icon: LucideIcon; color: string; badge?: number; active: boolean; go: () => void };

type Props = {
  role: 'candidate' | 'employer' | string; userId: string; nav: TabNavItem[]; navColors: Record<string, string>;
  view: View; activeAnchor: string; unread: number;
  gotoNav: (item: TabNavItem) => void; setView: (v: View) => void; openFullMenu: () => void;
};

const storeKey = (role: string, userId: string) => `jm-tabbar-${role}-${userId}`;

export function MobileTabs({ role, userId, nav, navColors, view, activeAnchor, unread, gotoNav, setView, openFullMenu }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const likesAnchor = role === 'candidate' ? 'td-chasing' : 'td-review';
  const close = () => { setMenuOpen(false); setEditing(false); };

  // Every button the bar can hold, by key.
  const items = useMemo(() => {
    const map = new Map<string, Item>();
    const add = (it: Item) => map.set(it.key, it);
    add({ key: MENU_KEY, label: 'Global Menu', short: 'Menu', icon: LayoutGrid, color: '#fd267a', active: menuOpen, go: () => { setMenuOpen((o) => !o); setEditing(false); } });
    add({ key: 'profile', label: 'Profile', short: 'Profile', icon: User, color: '#7c3aed', active: !menuOpen && view === 'profile', go: () => { close(); setView('profile'); } });
    add({ key: 'surf', label: 'Find My Match', short: 'Surf', icon: Waves, color: navColors['Find My Match'] || '#ff7a45', active: !menuOpen && view === 'match', go: () => { close(); gotoNav({ label: 'Surf', icon: Waves, view: 'match' }); } });
    add({ key: 'likes', label: role === 'candidate' ? 'Recruiters that like you' : 'Candidates to review', short: 'Likes', icon: Heart, color: '#fd267a', active: !menuOpen && view === 'home' && activeAnchor === likesAnchor, go: () => { close(); gotoNav({ label: 'Likes', icon: Heart, anchor: likesAnchor }); } });
    add({ key: 'chat', label: 'Conversations', short: 'Chat', icon: MessageCircle, color: navColors.Conversations || '#3b82f6', badge: unread, active: !menuOpen && view === 'messages', go: () => { close(); setView('messages'); } });
    for (const n of nav) {
      if (n.view === 'match' || n.view === 'messages') continue; // = Surf / Chat
      add({ key: `nav:${n.label}`, label: n.label, short: n.short || n.label, icon: n.icon, color: navColors[n.label] || '#9fb3d9',
        active: !menuOpen && (n.anchor ? view === 'home' && activeAnchor === n.anchor : view === n.view && !(n.view === 'home' && activeAnchor)),
        go: () => { close(); gotoNav(n); } });
    }
    return map;
  }, [nav, navColors, view, activeAnchor, unread, menuOpen, role, likesAnchor]);

  // Menu tiles: Profile first, then every section (Find My Match / Conversations shown under their bar names).
  const tileKeys = useMemo(() => ['profile', 'surf', 'chat', 'likes', ...nav.filter((n) => n.view !== 'match' && n.view !== 'messages').map((n) => `nav:${n.label}`)], [nav]);
  const known = useMemo(() => new Set(items.keys()), [items]);

  const [tabs, setTabs] = useState<string[]>(() => defaultTabs(role));
  useEffect(() => {
    let saved: unknown = null;
    try { saved = JSON.parse(localStorage.getItem(storeKey(role, userId)) || 'null'); } catch { /* blocked storage */ }
    setTabs(normalizeTabs(saved ?? defaultTabs(role), known, role));
  }, [role, userId, known]);
  const save = (next: string[]) => { setTabs(next); try { localStorage.setItem(storeKey(role, userId), JSON.stringify(next)); } catch { /* blocked storage */ } };

  // ---- drag (pointer events) ----
  const drag = useRef<{ key: string; from: 'menu' | 'bar'; x0: number; y0: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ key: string; x: number; y: number; overSlot: number | null } | null>(null);
  const slotAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null;
    return el ? Number(el.dataset.slot) : null;
  };
  const onDown = (e: React.PointerEvent, key: string, from: 'menu' | 'bar') => {
    if (!editing) return;
    drag.current = { key, from, x0: e.clientX, y0: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
    d.moved = true;
    setGhost({ key: d.key, x: e.clientX, y: e.clientY, overSlot: slotAt(e.clientX, e.clientY) });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; setGhost(null);
    if (!d) return;
    if (!d.moved) { if (d.from === 'menu') save(toggleTab(tabs, d.key)); return; } // tap in edit mode
    const slot = slotAt(e.clientX, e.clientY);
    if (slot !== null) save(placeTab(tabs, d.key, slot));
    else if (d.from === 'bar') save(removeTab(tabs, d.key));
  };

  const ghostItem = ghost ? items.get(ghost.key) : undefined;
  return <>
    <nav className={`mobile-bottom-nav app-tabs${editing ? ' editing' : ''}`} aria-label="Primary navigation" data-slot={tabs.length}>
      {tabs.map((key, i) => {
        const it = items.get(key); if (!it) return null; const Icon = it.icon;
        return <button key={key} type="button" data-slot={i} className={`${it.active ? 'active ' : ''}tab-${key.replace(/[^a-z]/gi, '')}${ghost?.overSlot === i ? ' drop-target' : ''}`}
          aria-current={it.active ? 'page' : undefined}
          onClick={() => { if (!editing || key === MENU_KEY) it.go(); }}
          onPointerDown={(e) => key !== MENU_KEY && onDown(e, key, 'bar')} onPointerMove={onMove} onPointerUp={onUp}>
          <span className="tab-ico"><Icon size={21} />{it.badge ? <em>{Math.min(it.badge, 99)}</em> : null}
            {editing && key !== MENU_KEY && tabs.length > 2 && <i className="tab-remove" role="button" aria-label={`Remove ${it.short} from the bar`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); save(removeTab(tabs, key)); }}><X size={10} /></i>}</span>
          <span>{it.short}</span>
        </button>;
      })}
    </nav>
    {menuOpen && <section className="explore-sheet" role="dialog" aria-label="Global Menu">
      <header><h2>Global Menu</h2>
        <div className="gm-actions">
          <button type="button" className={editing ? 'gm-edit on' : 'gm-edit'} onClick={() => setEditing((v) => !v)}>{editing ? <><Check size={15} /> Done</> : <><Pencil size={14} /> Customize bar</>}</button>
          <button type="button" className="mobile-close" onClick={close} aria-label="Close Global Menu"><X /></button>
        </div></header>
      {editing && <p className="gm-help">Drag a tile onto the bar below (drop on a button to replace it), drag bar buttons to reorder, or drag one up here to remove it. Tap a tile to add or remove. Up to {MAX_TABS} buttons; Global Menu always stays.</p>}
      <div className="explore-grid">{tileKeys.map((key) => {
        const it = items.get(key); if (!it) return null; const Icon = it.icon; const inBar = tabs.includes(key);
        return <button key={key} type="button" className={`${editing ? 'gm-tile editing' : 'gm-tile'}${inBar && editing ? ' in-bar' : ''}`} style={{ ['--c' as string]: it.color }}
          onClick={() => { if (!editing) it.go(); }}
          onPointerDown={(e) => onDown(e, key, 'menu')} onPointerMove={onMove} onPointerUp={onUp}>
          <i><Icon size={20} /></i><span>{it.label}</span>{editing && <b className="gm-grip">{inBar ? <Check size={14} /> : <GripVertical size={14} />}</b>}
        </button>;
      })}</div>
      <button type="button" className="secondary-button explore-more" onClick={() => { close(); openFullMenu(); }}>Settings, help and more</button>
      {editing && <button type="button" className="text-button gm-reset" onClick={() => save(normalizeTabs(defaultTabs(role), known, role))}>Reset the bar</button>}
    </section>}
    {ghost && ghostItem && <div className="tab-ghost" style={{ left: ghost.x, top: ghost.y, ['--c' as string]: ghostItem.color }} aria-hidden="true"><i><ghostItem.icon size={18} /></i>{ghostItem.short}</div>}
  </>;
}
