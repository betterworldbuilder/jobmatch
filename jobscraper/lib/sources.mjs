// Careers websites the scraper checks for jobs (data/sources.json), added in the "Career sites" tab (2026-11-26).
// Each source remembers the job keys it has already found, so a check reports only NEW jobs.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { blockedSite, validateUrl } from './fetch.mjs';
import { groupIdFor } from './batch.mjs';

const FILE = () => process.env.JOBSCRAPER_SOURCES || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sources.json');
const MAX_SEEN = 3000;
function readAll() { try { return JSON.parse(readFileSync(FILE(), 'utf8')).sources || []; } catch { return []; } }
function writeAll(sources) {
  mkdirSync(dirname(FILE()), { recursive: true });
  writeFileSync(`${FILE()}.tmp`, JSON.stringify({ sources }, null, 2));
  renameSync(`${FILE()}.tmp`, FILE());
}
const pub = (s) => { const { seen, ...rest } = s; return { ...rest, enabled: s.enabled !== false, known: (seen || []).length }; };
/** Tick or untick many sites at once: { ids: [...], enabled } or { all: true, enabled }. */
export function setEnabled({ ids = [], all: every = false, enabled }) {
  const list = readAll();
  for (const s of list) if (every || ids.includes(s.id)) s.enabled = enabled === true;
  writeAll(list);
  return list.map(pub);
}

/**
 * The main job boards and recruiters (founder, 2026-11-26), each tested that day: the listing gives job links AND the
 * job pages can be read (schema.org JobPosting, or the Michael Page reader). Not included, and why:
 *  - VietnamWorks and Navigos Search: their job pages are built in the browser (no job text in the page).
 *  - JobServe: search results are built in the browser; add your JobServe saved-search RSS link instead.
 *  - LinkedIn, Indeed, Glassdoor: never read as listings.
 */
export const DEFAULT_SOURCES = [
  { name: 'Michael Page Vietnam · IT', url: 'https://www.michaelpage.com.vn/jobs/information-technology', region: 'Vietnam' },
  { name: 'Michael Page Singapore · Technology', url: 'https://www.michaelpage.com.sg/jobs/technology', region: 'Singapore' },
  { name: 'Michael Page UK · Technology', url: 'https://www.michaelpage.co.uk/jobs/technology', region: 'EU / UK' },
  { name: 'Michael Page France · Informatique', url: 'https://www.michaelpage.fr/jobs/informatique', region: 'EU / UK' },
  { name: 'Michael Page Germany · IT', url: 'https://www.michaelpage.de/jobs/it', region: 'EU / UK' },
  { name: 'Michael Page Netherlands · IT', url: 'https://www.michaelpage.nl/jobs/it', region: 'EU / UK' },
  { name: 'Michael Page US · Technology', url: 'https://www.michaelpage.com/jobs/technology', region: 'US' },
  { name: 'Michael Page Australia · Technology', url: 'https://www.michaelpage.com.au/jobs/technology', region: 'Australia' },
  { name: 'ITviec · IT jobs', url: 'https://itviec.com/it-jobs', region: 'Vietnam' },
  { name: 'TopCV · IT', url: 'https://www.topcv.vn/viec-lam-it', region: 'Vietnam' },
  { name: 'CareerViet · IT software', url: 'https://careerviet.vn/viec-lam/cntt-phan-mem-c1-vi.html', region: 'Vietnam' },
  { name: 'TopDev · IT jobs', url: 'https://topdev.vn/viec-lam-it', region: 'Vietnam' },
  { name: 'Glints Vietnam', url: 'https://glints.com/vn/opportunities/jobs/explore', region: 'Vietnam' },
];
/** Add the default sites that are missing (first start, or the "Add the main job boards" button). */
export function addDefaultSources() {
  const all = readAll(); const have = new Set(all.map((s) => s.url));
  const added = [];
  for (const d of DEFAULT_SOURCES) {
    if (have.has(d.url)) continue;
    const src = { id: `src-${randomUUID().slice(0, 8)}`, url: d.url, name: d.name, region: d.region, keywords: '', group: '', groupId: null, maxPages: 2,
      addedAt: new Date().toISOString(), lastCheckedAt: null, lastResult: null, seen: [], preset: true };
    all.push(src); added.push(pub(src));
  }
  if (added.length) writeAll(all);
  return added;
}
let seeded = false;
export const listSources = () => {
  if (!seeded) { seeded = true; if (!existsSync(FILE())) addDefaultSources(); }
  return readAll().map(pub);
};
export const getSource = (id) => readAll().find((s) => s.id === id) || null;

export function addSource({ url, name, keywords, group, maxPages, region } = {}) {
  let u;
  try { u = validateUrl(url); } catch (e) { throw Object.assign(new Error(e.message), { status: 400 }); }
  const blocked = blockedSite(u);
  if (blocked) throw Object.assign(new Error(`${blocked} pages are not read automatically. Add the company's own careers page instead.`), { status: 400 });
  const all = readAll();
  const href = u.href.replace(/#.*$/, '');
  if (all.some((s) => s.url === href)) throw Object.assign(new Error('This website is already in the list'), { status: 409 });
  const label = String(group || '').trim().slice(0, 40);
  const src = {
    id: `src-${randomUUID().slice(0, 8)}`, url: href, name: String(name || '').trim().slice(0, 80) || u.hostname.replace(/^www\./, ''),
    keywords: String(keywords || '').trim().slice(0, 300), group: label, groupId: label ? groupIdFor(label) : null, region: String(region || '').trim().slice(0, 40),
    maxPages: Math.min(5, Math.max(1, Number(maxPages) || 2)), addedAt: new Date().toISOString(), lastCheckedAt: null, lastResult: null, seen: [],
  };
  writeAll([...all, src].slice(0, 200));
  return pub(src);
}
export function updateSource(id, patch = {}) {
  const all = readAll(); const s = all.find((x) => x.id === id);
  if (!s) throw Object.assign(new Error('Website not found'), { status: 404 });
  if (patch.name !== undefined) s.name = String(patch.name || '').trim().slice(0, 80) || s.name;
  if (patch.keywords !== undefined) s.keywords = String(patch.keywords || '').trim().slice(0, 300);
  if (patch.group !== undefined) { s.group = String(patch.group || '').trim().slice(0, 40); s.groupId = s.group ? groupIdFor(s.group) : null; }
  if (patch.maxPages !== undefined) s.maxPages = Math.min(5, Math.max(1, Number(patch.maxPages) || 2));
  // Ticked = scraped by "Find new jobs on selected" and by the daily run (founder, 2026-11-26). New sites start ticked.
  if (patch.enabled !== undefined) s.enabled = patch.enabled === true;
  writeAll(all);
  return pub(s);
}
export function deleteSource(id) { writeAll(readAll().filter((s) => s.id !== id)); }

/** After a check: mark which jobs are new, remember them, store the result line. */
export function recordCheck(id, result) {
  const all = readAll(); const s = all.find((x) => x.id === id);
  if (!s) return result;
  const seen = new Set(s.seen || []);
  const jobs = (result.jobs || []).map((j) => ({ ...j, isNew: !seen.has(j.key) }));
  for (const j of jobs) seen.add(j.key);
  s.seen = [...seen].slice(-MAX_SEEN);
  s.lastCheckedAt = new Date().toISOString();
  s.lastResult = result.ok ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} (${jobs.filter((j) => j.isNew).length} new) via ${result.via}` : `failed: ${result.message}`;
  if (result.ok && result.name && s.name === new URL(s.url).hostname.replace(/^www\./, '')) s.name = String(result.name).slice(0, 80);
  writeAll(all);
  return { ...result, jobs, source: pub(s) };
}
