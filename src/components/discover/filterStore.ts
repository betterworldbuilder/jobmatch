// One shared set of deck filters per person and side (founder, 2026-11-24: "Filter" button in the phone bar).
// Every deck (Surf on the phone, the home decks, desktop Discover) reads the same filters, saved on this device.
// A tiny external store (no React context) so any component can read or change it.
import { useSyncExternalStore } from 'react';
import { DEFAULT_FILTERS, type DeckFilters } from './deckLogic';

const listeners = new Set<() => void>();
const cache = new Map<string, DeckFilters>();
const keyOf = (userId: string, role: string) => `jm-filters-${role}-${userId}`;

function read(key: string): DeckFilters {
  const hit = cache.get(key);
  if (hit) return hit;
  let saved: Partial<DeckFilters> = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* storage blocked */ }
  const value = { ...DEFAULT_FILTERS, ...saved };
  cache.set(key, value);
  return value;
}

export function setSharedFilters(userId: string, role: string, next: DeckFilters | ((prev: DeckFilters) => DeckFilters)) {
  const key = keyOf(userId, role);
  const value = typeof next === 'function' ? next(read(key)) : next;
  cache.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: keep in memory */ }
  listeners.forEach((fn) => fn());
}

export function resetSharedFilters(userId: string, role: string) {
  setSharedFilters(userId, role, { ...DEFAULT_FILTERS });
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useSharedFilters(userId: string, role: string): [DeckFilters, (next: DeckFilters | ((prev: DeckFilters) => DeckFilters)) => void] {
  const key = keyOf(userId, role);
  const value = useSyncExternalStore(subscribe, () => read(key), () => DEFAULT_FILTERS);
  return [value, (next) => setSharedFilters(userId, role, next)];
}
