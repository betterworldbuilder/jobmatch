// Lists of job links: parse a pasted list (group headings + URLs) and keep each list's progress (data/batches.json).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { blockedSite, validateUrl } from './fetch.mjs';

// Heading words → JobsMatchNow job group ids. A heading that matches none is kept as a label with no group.
export const GROUP_ALIASES = [
  ['g-ai-ml', /^(ai|a\.i\.|ml|ai\s*(&|and|\/)\s*ml|ai\s*(&|and)\s*machine learning|machine learning|genai|llm|mlops)$/i],
  ['g-software', /^(sw|swe|sw\s*eng(ineering)?|software(\s*eng(ineering|ineer)?)?|dev|developers?|backend|frontend|full[- ]?stack|mobile)$/i],
  ['g-cloud-devops', /^(cloud|devops|cloud\s*(&|and|\/)\s*devops|sre|platform|infra(structure)?)$/i],
  ['g-data', /^(data|data\s*eng(ineering)?|data\s*science|analytics|bi)$/i],
];
export const GROUP_NAMES = { 'g-ai-ml': 'AI & Machine Learning', 'g-software': 'Software Engineering', 'g-cloud-devops': 'Cloud & DevOps', 'g-data': 'Data' };
export const groupIdFor = (label) => GROUP_ALIASES.find(([, re]) => re.test(String(label).trim().replace(/[:\-–#*]+$/, '').trim()))?.[0] || null;

/** One key per job: a LinkedIn job id, otherwise the URL without hash and tracking parameters. */
export function jobKey(url) {
  const li = url.hostname.toLowerCase().endsWith('linkedin.com') ? (url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{5,})/)?.[1] || url.searchParams.get('currentJobId')) : null;
  if (li) return `linkedin:${li}`;
  const u = new URL(url.href); u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|refid$|trk|tracking|src$|source$|gh_src$|lever-source)/i.test(k)) u.searchParams.delete(k);
  // A job page whose path already carries its id (ITviec …-3148, TopCV …/2354887.html): any query is a display or
  // tracking option (e.g. ?lab_feature=preview_jd_page), never another job.
  if (/\d{4,}/.test(u.pathname)) u.search = '';
  return u.href.replace(/\/$/, '');
}

/**
 * Parse a pasted list. Non-URL lines are group headings for the URLs below them.
 * Returns { items: [{url, key, groups:[{label, id}], site}], duplicates: [{url, label, firstLine}], invalid: [{text, reason}] }.
 */
export function parseLinkList(text) {
  const items = []; const duplicates = []; const invalid = [];
  let label = null;
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const urls = line.match(/\bhttps?:\/\/[^\s<>"']+/gi);
    if (!urls) {
      if (line.length <= 60) label = line.replace(/[:\-–#*]+$/, '').trim();
      else invalid.push({ line: i + 1, text: line.slice(0, 80), reason: 'Not a link or a short group heading' });
      return;
    }
    for (const raw2 of urls) {
      let url;
      try { url = validateUrl(raw2.replace(/[),.;]+$/, '')); } catch (e) { invalid.push({ line: i + 1, text: raw2.slice(0, 120), reason: e.message }); continue; }
      const key = jobKey(url);
      const group = label ? { label, id: groupIdFor(label) } : null;
      const existing = items.find((it) => it.key === key);
      if (existing) {
        if (group && !existing.groups.some((g) => g.label === group.label)) existing.groups.push(group); // same job, another group
        else duplicates.push({ line: i + 1, url: url.href, label: group?.label || null });
        continue;
      }
      items.push({ url: url.href, key, groups: group ? [group] : [], site: blockedSite(url) });
    }
  });
  return { items, duplicates, invalid };
}

// ---------- storage ----------
const FILE = () => process.env.JOBSCRAPER_BATCHES || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'batches.json');
function readAll() { try { return JSON.parse(readFileSync(FILE(), 'utf8')).batches || []; } catch { return []; } }
function writeAll(batches) {
  mkdirSync(dirname(FILE()), { recursive: true });
  writeFileSync(`${FILE()}.tmp`, JSON.stringify({ batches }, null, 2));
  renameSync(`${FILE()}.tmp`, FILE());
}
export const listBatches = () => readAll().map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, total: b.items.length, saved: b.items.filter((i) => i.status === 'saved').length }));
export const getBatch = (id) => readAll().find((b) => b.id === id) || null;

/** Owner turned "Read public LinkedIn job pages" on/off: LinkedIn links not yet done become readable (or not). */
export function setLinkedInReadable(on) {
  const all = readAll();
  for (const b of all) for (const it of b.items) {
    if (it.site !== 'LinkedIn' || it.jobId) continue;
    if (on && it.status === 'needs-text') Object.assign(it, { status: 'pending', message: null });
    if (!on && it.status === 'pending') Object.assign(it, { status: 'needs-text', message: 'LinkedIn pages are not read automatically: paste the job text. The link is kept as the source.' });
  }
  writeAll(all);
}

export function createBatch(text, name, { allowLinkedIn = false, region = '' } = {}) {
  const parsed = parseLinkList(text);
  if (!parsed.items.length) { const e = new Error('No valid job links found in the list'); e.status = 400; throw e; }
  const batch = {
    id: `list-${randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString(),
    name: String(name || '').trim().slice(0, 80) || `${parsed.items.length} links · ${new Date().toLocaleDateString('en-GB')}`,
    items: parsed.items.map((it, n) => {
      const readable = !it.site || (it.site === 'LinkedIn' && allowLinkedIn);
      return { id: `i${n + 1}`, url: it.url, groups: it.groups, site: it.site, status: readable ? 'pending' : 'needs-text',
        message: readable ? null : `${it.site} pages are not read automatically: paste the job text. The link is kept as the source.`, jobId: null };
    }),
    duplicates: parsed.duplicates, invalid: parsed.invalid,
    // The career site's region (e.g. "Vietnam"): sent with imports as the "For who" hint.
    ...(region ? { region: String(region).slice(0, 40) } : {}),
  };
  writeAll([batch, ...readAll()].slice(0, 50));
  return batch;
}
export const ITEM_STATUSES = ['pending', 'needs-text', 'ready', 'saved', 'failed', 'skipped'];
export function updateItem(batchId, itemId, patch) {
  const all = readAll();
  const b = all.find((x) => x.id === batchId);
  const it = b?.items.find((x) => x.id === itemId);
  if (!it) { const e = new Error('List item not found'); e.status = 404; throw e; }
  if (patch.status !== undefined) { if (!ITEM_STATUSES.includes(patch.status)) { const e = new Error('Unknown status'); e.status = 400; throw e; } it.status = patch.status; }
  if (patch.message !== undefined) it.message = patch.message ? String(patch.message).slice(0, 300) : null;
  if (patch.jobId !== undefined) it.jobId = patch.jobId ? String(patch.jobId).slice(0, 40) : null;
  writeAll(all);
  return it;
}
/** Append a saved job to a list (status "saved"). Already in the list → the existing item. */
export function addItem(batchId, job) {
  const all = readAll();
  const b = all.find((x) => x.id === batchId);
  if (!b) { const e = new Error('List not found'); e.status = 404; throw e; }
  const found = b.items.find((x) => x.jobId === job.id);
  if (found) return found;
  const n = Math.max(0, ...b.items.map((x) => Number(String(x.id).slice(1)) || 0)) + 1;
  const ids = [...new Set(job.jobGroups || [])];
  const item = { id: `i${n}`, url: job.source?.url || '', title: job.title || '', added: true,
    groups: ids.length ? ids.map((id) => ({ label: 'pasted', id })) : [{ label: 'pasted', id: null }], site: null, status: 'saved', message: null, jobId: job.id };
  b.items.push(item);
  writeAll(all);
  return item;
}
export function deleteBatch(id) { writeAll(readAll().filter((b) => b.id !== id)); }
