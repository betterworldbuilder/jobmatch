// Feature flags. New features ship OFF; the founder previews them on the live
// site with a URL switch (e.g. ?fm=1), remembered in this browser until ?fm=0.
// To enable a feature for everyone, flip its `defaultOn` to true.
const FLAGS = {
  /** "Find your Matches": the full swipe studio (sidebar + card + safety + verification). */
  findMatches: { param: 'fm', defaultOn: false },
  /** "Try the demo" button on a real account's empty deck. Enabled for everyone by the founder, 2026-11-23 (?trydemo=0 hides it). */
  tryDemo: { param: 'trydemo', defaultOn: true },
  /** Phone bar Surf · Filter · Likes · Chat · Interviews · Menu + the shared "Search & Filters" (founder, 2026-11-24). Preview: ?filters=1 */
  filters: { param: 'filters', defaultOn: true }, // switched on for everyone by the founder, 2026-11-24 (?filters=0 hides)
  /** New payment methods: payOS VietQR (any VN banking app, ZaloPay, MoMo) and USDT for companies outside Vietnam
   *  (founder, 2026-11-24). Shown only when configured AND this is on. Preview: ?pay=1 */
  pay: { param: 'pay', defaultOn: false },
  /** Admin pricing editor (edit, add, stop selling, delete plans). Preview: ?plans=1 */
  plans: { param: 'plans', defaultOn: false },
  /** "Watch Candidate full tour" / "Watch Recruiter full tour" in the sign-in window (founder, 2026-11-24). Preview: ?tour=1 */
  tour: { param: 'tour', defaultOn: true }, // switched on for everyone by the founder, 2026-11-24 (?tour=0 hides)
  /** Phones: no top bar (menu, search and bell repeat the bottom bar); the bell moves next to "Swipe for role".
   *  Founder, 2026-11-24. Preview: ?bar=1 */
  /** Speed button in the full tours (0.5× · 0.75× · 1× · 1.5×), founder 2026-11-24. Preview: ?speed=1 */
  tourSpeed: { param: 'speed', defaultOn: true }, // switched on for everyone by the founder, 2026-11-24 (?speed=0 hides)
  bar: { param: 'bar', defaultOn: true }, // switched on for everyone by the founder, 2026-11-24 (?bar=0 brings the bar back)
  /** "Answer within 48 hours" (founder, 2026-11-25): the key feature on the home page (phone + desktop) only.
   *  Switched on for everyone by the founder, 2026-11-25 (?answer48=0 hides). The 48-hour timer itself gets its OWN
   *  switch when Bui builds it (plans/2026-11-25_48h-answer-timer-spec.md), so it does not go live with this one. */
  answer48: { param: 'answer48', defaultOn: true },
  /** "Connect your AI agent": OpenClaw, Meta Muse, Claude or any MCP agent through the read-only connector, in the
   *  chatbot page + AI settings + home page (founder, 2026-11-25). Switched on for everyone by the founder,
   *  2026-11-25 (?agents=0 hides). */
  agents: { param: 'agents', defaultOn: true },
  /** "Import job from link" in the recruiter's import window (2026-11-26). Off until the founder enables it;
   *  preview: ?joblink=1. The JobFinder manager (founder's own account) always shows it. */
  jobLink: { param: 'joblink', defaultOn: false },
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
