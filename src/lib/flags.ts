// Feature flags. New features ship OFF; the founder previews them on the live
// site with a URL switch (e.g. ?fm=1), remembered in this browser until ?fm=0.
// To enable a feature for everyone, flip its `defaultOn` to true.
const FLAGS = {
  /** "Find your Matches": the full swipe studio (sidebar + card + safety + verification). */
  findMatches: { param: 'fm', defaultOn: false },
  /** "Try the demo" button on a real account's empty deck. Enabled for everyone by the founder, 2026-11-23 (?trydemo=0 hides it). */
  tryDemo: { param: 'trydemo', defaultOn: true },
  /** Phone bar Surf · Filter · Likes · Chat · Interviews · Menu + the shared "Search & Filters" (founder, 2026-11-24). Preview: ?filters=1 */
  filters: { param: 'filters', defaultOn: false },
} as const;

export type FlagName = keyof typeof FLAGS;

function storageKey(name: FlagName) { return `jmn-flag-${name}`; }

export function featureOn(name: FlagName, search = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  const flag = FLAGS[name];
  const value = new URLSearchParams(search).get(flag.param);
  try {
    if (value === '1') localStorage.setItem(storageKey(name), '1');
    if (value === '0') localStorage.removeItem(storageKey(name));
    if (value === '1' || value === '0') return value === '1';
    if (localStorage.getItem(storageKey(name)) === '1') return true;
  } catch { /* storage blocked: fall back to the URL / default */ }
  return value === '1' || flag.defaultOn;
}
