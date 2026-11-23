// Phone action bar: which buttons it holds, in which order. Pure functions (unit-tested in tabBar.test.mjs).
// Keys: 'menu' (Global Menu — always kept), 'profile', 'surf', 'likes', 'chat', or 'nav:<menu label>'.
export const MENU_KEY = 'menu';
export const MIN_TABS = 2;
export const MAX_TABS = 6;

/** Filter button (founder, 2026-11-24): opens the "Search & Filters" sheet. */
export const FILTER_KEY = 'filter';
/** New bar (founder, 2026-11-24), both sides: Surf · Filter · Likes · Chat · Interviews · Menu. Coffee lives in the menu. */
export function defaultTabsV2(): string[] {
  return ['surf', FILTER_KEY, 'likes', 'chat', 'nav:Interviews', MENU_KEY];
}

/** Default bars (founder, 2026-11-22): invitations at the end; Profile lives in the Global Menu. */
export function defaultTabs(role: 'candidate' | 'employer' | string): string[] {
  return role === 'candidate'
    ? ['surf', MENU_KEY, 'likes', 'chat', 'nav:Recruiter Invitation', 'nav:Coffee Invitations']
    : ['surf', MENU_KEY, 'likes', 'chat', 'nav:Coffee Invitations'];
}

/** Keep only known keys, no duplicates, Global Menu present, within limits. */
export function normalizeTabs(keys: unknown, known: Set<string>, role: string): string[] {
  const list = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string' && known.has(k)) : [];
  const unique = [...new Set(list)];
  if (!unique.includes(MENU_KEY)) unique.splice(Math.min(1, unique.length), 0, MENU_KEY);
  const trimmed = unique.slice(0, MAX_TABS);
  if (!trimmed.includes(MENU_KEY)) trimmed[trimmed.length - 1] = MENU_KEY;
  return trimmed.length >= MIN_TABS ? trimmed : defaultTabs(role).filter((k) => known.has(k));
}

/** Put `key` at `index` (moving it if already in the bar). If the bar is full, the item at `index` is replaced
 *  (never the Global Menu: then the last other item makes room). */
export function placeTab(tabs: string[], key: string, index: number): string[] {
  const at = Math.max(0, Math.min(index, tabs.length));
  if (tabs.includes(key)) {
    const without = tabs.filter((k) => k !== key);
    const target = Math.min(at > tabs.indexOf(key) ? at - 1 : at, without.length);
    return [...without.slice(0, target), key, ...without.slice(target)];
  }
  if (tabs.length < MAX_TABS) return [...tabs.slice(0, at), key, ...tabs.slice(at)];
  const replaceAt = tabs[Math.min(at, tabs.length - 1)] === MENU_KEY
    ? tabs.map((k, i) => (k === MENU_KEY ? -1 : i)).filter((i) => i >= 0).pop()!
    : Math.min(at, tabs.length - 1);
  return tabs.map((k, i) => (i === replaceAt ? key : k));
}

/** Remove a button (the Global Menu stays; at least MIN_TABS remain). */
export function removeTab(tabs: string[], key: string): string[] {
  if (key === MENU_KEY || tabs.length <= MIN_TABS) return tabs;
  return tabs.filter((k) => k !== key);
}

/** Tap in edit mode: add to the end if absent, remove if present. */
export function toggleTab(tabs: string[], key: string): string[] {
  return tabs.includes(key) ? removeTab(tabs, key) : placeTab(tabs, key, tabs.length);
}
