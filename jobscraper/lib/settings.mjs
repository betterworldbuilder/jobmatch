// Owner settings (data/settings.json). Defaults are the safe choices.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = () => process.env.JOBSCRAPER_SETTINGS || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'settings.json');
// jobTypes: the job-type filter used while scraping (types from lib/keywords.mjs + custom words); empty = every job.
// Starts on the Stage 1 focus (AI & Data roles).
const DEFAULTS = { allowLinkedIn: false, jobTypes: { types: ['ai', 'data'], custom: '' } };

export function getSettings() {
  let saved = {};
  try { saved = JSON.parse(readFileSync(FILE(), 'utf8')); } catch { /* none yet */ }
  const s = { ...DEFAULTS, ...saved };
  if (process.env.JOBSCRAPER_ALLOW_LINKEDIN === '1') s.allowLinkedIn = true;
  return s;
}
export function saveSettings(patch) {
  const next = { ...getSettings() };
  if (patch.allowLinkedIn !== undefined) {
    next.allowLinkedIn = patch.allowLinkedIn === true;
    next.allowLinkedInChangedAt = new Date().toISOString(); // when the owner chose it
  }
  if (patch.jobTypes !== undefined && patch.jobTypes && typeof patch.jobTypes === 'object') {
    next.jobTypes = {
      types: (Array.isArray(patch.jobTypes.types) ? patch.jobTypes.types : []).filter((t) => typeof t === 'string' && /^[a-z]{2,20}$/.test(t)).slice(0, 20),
      custom: String(patch.jobTypes.custom || '').slice(0, 500),
    };
  }
  mkdirSync(dirname(FILE()), { recursive: true });
  writeFileSync(`${FILE()}.tmp`, JSON.stringify(next, null, 2));
  renameSync(`${FILE()}.tmp`, FILE());
  return next;
}
