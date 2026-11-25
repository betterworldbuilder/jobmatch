// "Take me back to the job I picked" (job groups / LinkedIn links, 2026-11-25). A visitor picks a job on a public page,
// signs up or signs in, and lands on that job's details. Kept in sessionStorage (this tab only); never applies
// or likes anything by itself.
const KEY = 'jm-pending-job';
export type PendingJob = { id: string; from?: string; src?: string };

const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export function savePendingJob(p: PendingJob) { safe(() => sessionStorage.setItem(KEY, JSON.stringify(p)), undefined); }
export function readPendingJob(): PendingJob | null {
  return safe(() => { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && typeof v.id === 'string' ? v : null; }, null);
}
export function clearPendingJob() { safe(() => sessionStorage.removeItem(KEY), undefined); }

/** Read ?job=&from=&src= from the address bar into the pending job (and tidy the address bar). */
export function capturePendingFromUrl(): PendingJob | null {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('job');
  if (!id || !/^[A-Za-z0-9_-]{2,60}$/.test(id)) return null;
  const p: PendingJob = { id, from: url.searchParams.get('from') || undefined, src: url.searchParams.get('src') === 'linkedin' ? 'linkedin' : undefined };
  savePendingJob(p);
  for (const k of ['job', 'from', 'src', 'auth']) url.searchParams.delete(k);
  window.history.replaceState({}, '', url.pathname + url.search);
  return p;
}

/** Sent with a sign-up: where the visitor came from (known values only). */
export function acquisitionSource() {
  const p = readPendingJob();
  return p ? { src: p.src, group: p.from, jobId: p.id } : undefined;
}

export const APP_RESERVED = new Set(['app', 'api', 'assets', 'admin', 'jobs', 'job', 'ref', 'downloads', 'legal', 'index', 'sw', 'manifest', 'static',
  'login', 'register', 'signup', 'settings', 'home', 'privacy', 'terms', 'help', 'groups', 'group', 'search', 'public', 'icons', 'images']);
