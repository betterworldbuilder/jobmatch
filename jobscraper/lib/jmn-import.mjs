/**
 * "Import to JobFinder account" (founder, 2026-11-26): send one job of a list straight into the JobsMatchNow JobFinder
 * listings as a DRAFT, with the import key (no sign-in). Same door as the daily run (POST /api/jobfinder/import-batch):
 * drafts only, duplicates (same link, or same title + company + location) are skipped by JobsMatchNow.
 * Key: env JOBFINDER_IMPORT_KEY, else ~/.config/jobsmatchnow/import.key. Address: env JOBSMATCHNOW_URL (default live site).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { exportFile } from './store.mjs';

export const jmnBase = () => String(process.env.JOBSMATCHNOW_URL || 'https://jobsmatchnow.com').replace(/\/+$/, '');
export function importKey() {
  if (process.env.JOBFINDER_IMPORT_KEY) return process.env.JOBFINDER_IMPORT_KEY.trim();
  try { return readFileSync(join(homedir(), '.config', 'jobsmatchnow', 'import.key'), 'utf8').trim(); } catch { return ''; }
}
export const importReady = () => importKey().length >= 32;

// Test hook: replace the network.
let poster = null;
export function __setPoster(fn) { poster = fn; }

/** Send one saved job. Returns { status: 'created'|'duplicate'|'failed', remoteId?, message? }. */
export async function importToJobFinder(job, { workersFrom = '' } = {}) {
  const key = importKey();
  if (key.length < 32) return { status: 'failed', message: 'No import key on this computer (~/.config/jobsmatchnow/import.key)' };
  if (!String(job.company || '').trim()) return { status: 'failed', message: 'No company: open the job, add the company, save, then import again' };
  const file = exportFile([job]).jobs[0];
  if (workersFrom && !file.workersFrom) file.workersFrom = workersFrom;
  const url = `${jmnBase()}/api/jobfinder/import-batch`;
  const body = JSON.stringify({ jobs: [file] });
  let status; let res = {};
  try {
    if (poster) ({ status, body: res } = await poster(url, body));
    else {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'jobscraper-import' }, body, signal: AbortSignal.timeout(30000) });
      status = r.status; res = await r.json().catch(() => ({}));
    }
  } catch { return { status: 'failed', message: 'JobsMatchNow could not be reached' }; }
  if (status === 401 || status === 404) return { status: 'failed', message: `JobsMatchNow refused the import key (${status})` };
  if (status === 429) return { status: 'failed', message: 'Too many imports in a minute: wait and try again', retry: true };
  if (status !== 200) return { status: 'failed', message: res.error || `JobsMatchNow answered ${status}` };
  const r = (res.results || [])[0] || {};
  return r.status === 'created' || r.status === 'duplicate' ? { status: r.status, remoteId: r.id } : { status: 'failed', message: r.error || 'Not imported' };
}
