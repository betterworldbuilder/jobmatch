// Long profile texts are capped at 500 characters (founder, 2026-11-25): About Me, cover letter, recommendation text.
// Same rule as server/profile.js clipText: shorten at a word end with "…".
export const TEXT_MAX = 500;
export function clipText(value: string | undefined, max = TEXT_MAX): string {
  const t = (value || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}
/** Fit text into `max` characters, cutting at the end of a sentence when possible (for generated templates). */
export function fitSentences(value: string, max = TEXT_MAX): string {
  const t = value.trim();
  if (t.length <= max) return t;
  const parts = t.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of parts) { const next = out ? `${out} ${s}` : s; if (next.length > max) break; out = next; }
  return out || clipText(t, max);
}
