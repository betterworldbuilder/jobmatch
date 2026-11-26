// Local job library (data/jobs.json) and the export file format.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FORMAT } from './parse.mjs';

const DATA = process.env.JOBSCRAPER_DATA || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'jobs.json');

/** The file JobsMatchNow imports: { format, exportedAt, jobs: [...] }. */
export function exportFile(jobs) {
  return { format: FORMAT, exportedAt: new Date().toISOString(), generator: 'jobscraper', jobs: jobs.map(({ id: _id, savedAt: _s, ...j }) => ({ ...j, format: FORMAT, url: j.source?.url || j.externalUrl || null })) };
// `url` duplicates the source link under the name generic job-feed importers look for.
}

export function listJobs() {
  try { return JSON.parse(readFileSync(DATA, 'utf8')).jobs || []; } catch { return []; }
}
function writeAll(jobs) {
  mkdirSync(dirname(DATA), { recursive: true });
  const tmp = `${DATA}.tmp`;
  writeFileSync(tmp, JSON.stringify({ jobs }, null, 2));
  renameSync(tmp, DATA);
}
/** Same role saved again (same link + role part, or same title + same text) → update it, never a second copy. */
const sameRole = (a, b) => Boolean(a.title) && a.title === b.title && (a.source?.url || b.source?.url
  ? a.source?.url === b.source?.url && (a.source?.part || '') === (b.source?.part || '')
  : (a.fullDescription || '') === (b.fullDescription || ''));
export function saveJob(job) {
  const jobs = listJobs();
  const existing = job.id && jobs.some((j) => j.id === job.id) ? job.id : jobs.find((j) => sameRole(j, job))?.id;
  const id = existing || `job-${randomUUID().slice(0, 8)}`;
  const row = { ...job, id, format: FORMAT, savedAt: new Date().toISOString() };
  writeAll([row, ...jobs.filter((j) => j.id !== id)].slice(0, 500));
  return row;
}
export function deleteJob(id) { writeAll(listJobs().filter((j) => j.id !== id)); }
