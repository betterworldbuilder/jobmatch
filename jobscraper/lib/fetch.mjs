/**
 * Fetch ONE public job page, politely and safely, and read the job from it.
 *
 * - Sites whose terms forbid automated access (LinkedIn, Indeed, Glassdoor) are never fetched: the user pastes the
 *   text instead and the link is kept as the source. No login, no cookies, no CAPTCHA or paywall bypass.
 * - robots.txt is read first; a disallowed path is not fetched.
 * - Only http(s) on ports 80/443; every hop (including redirects, max 3) is re-validated, and the TCP connection is
 *   pinned to an address checked as public (no localhost, private, link-local or cloud-metadata addresses).
 * - 10 s timeout, 3 MB cap, HTML / JSON only.
 */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { parseJob } from './parse.mjs';
import { getSettings } from './settings.mjs';
import { siteReader } from './sites.mjs';

export const BLOCKED_SITES = [
  { re: /(^|\.)linkedin\.com$/i, name: 'LinkedIn' },
  { re: /(^|\.)indeed\.[a-z.]+$/i, name: 'Indeed' },
  { re: /(^|\.)glassdoor\.[a-z.]+$/i, name: 'Glassdoor' },
];
export const PASTE_MESSAGE = 'We couldn’t import the job details from this link. Paste the job description below or enter the details manually. We’ll keep the original link as the source.';
const UA = 'JobScraper/1.0 (+personal job import tool; one page per request)';
const TIMEOUT_MS = Number(process.env.JOBSCRAPER_TIMEOUT_MS || 10000);
const MAX_BYTES = 3 * 1024 * 1024;

export function isRestrictedIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isRestrictedIp(m[1]);
    if (/^::ffff:/.test(s)) return true;
    return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8');
  }
  return true;
}

export class LinkError extends Error { constructor(message, code) { super(message); this.code = code; } }

/** Validate a link. Returns a URL or throws LinkError. */
export function validateUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new LinkError('Paste a job link', 'invalid');
  if (value.length > 2048) throw new LinkError('That link is too long', 'invalid');
  let url; try { url = new URL(value); } catch { throw new LinkError('That is not a valid link', 'invalid'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new LinkError('Links must start with http:// or https://', 'invalid');
  if (url.username || url.password) throw new LinkError('Links with a user name or password are not accepted', 'unsafe');
  if (url.port && !['80', '443'].includes(url.port)) throw new LinkError('Links to unusual ports are not accepted', 'unsafe');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (net.isIP(host) ? isRestrictedIp(host) : (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|intranet|lan|home|corp|test|invalid)$/.test(host))) {
    throw new LinkError('Links to local or private network addresses are not accepted', 'unsafe');
  }
  return url;
}
export const blockedSite = (url) => BLOCKED_SITES.find((s) => s.re.test(url.hostname))?.name || null;

/** DNS lookup that refuses restricted addresses; passed to http(s).request so the socket uses the checked address. */
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    const bad = !addrs.length || addrs.some((a) => isRestrictedIp(a.address));
    if (bad) return cb(new LinkError('That link points to a private network address', 'unsafe'));
    if (options?.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

// Test hook: replace the network (tests never reach a real site).
let transport = null;
export function __setTransport(fn) { transport = fn; }

/** One GET. Returns { status, headers, body, url }. Follows up to 3 redirects, re-validating each hop. */
export async function safeGet(rawUrl, { accept = 'text/html,application/xhtml+xml,application/json;q=0.9', hops = 3, allowLinkedIn = false, maxBytes = MAX_BYTES } = {}) {
  let url = validateUrl(rawUrl);
  for (let i = 0; i <= hops; i += 1) {
    const res = transport ? await transport(url.href) : await requestOnce(url, accept, Math.min(maxBytes, 16 * 1024 * 1024));
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      url = validateUrl(new URL(res.headers.location, url).href);
      if (blockedSite(url) && !(allowLinkedIn && blockedSite(url) === 'LinkedIn')) throw new LinkError(`The link redirects to ${blockedSite(url)}, which is not read automatically`, 'blocked');
      continue;
    }
    return { ...res, url: url.href };
  }
  throw new LinkError('Too many redirects', 'fetch');
}

function requestOnce(url, accept, maxBytes = MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'GET', lookup: safeLookup, headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en' }, timeout: TIMEOUT_MS }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { req.destroy(new LinkError('The page is too large', 'fetch')); return; } chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new LinkError('The site took too long to answer', 'fetch')));
    req.on('error', (e) => reject(e instanceof LinkError ? e : new LinkError('The site could not be reached', 'fetch')));
    req.end();
  });
}

/** robots.txt: is `path` allowed for our user agent (or *)? Longest match wins; Allow wins ties. Missing file = allowed. */
export function robotsAllows(robotsTxt, path, agent = 'jobscraper') {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const raw of String(robotsTxt || '').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(); const val = m[2].trim();
    if (key === 'user-agent') { if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ allow: key === 'allow', path: val });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules).filter((r) => r.path);
  const toRe = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
  let best = null;
  for (const r of rules) if (toRe(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  return !best || best.allow;
}

const robotsCache = new Map();
async function allowedByRobots(url) {
  const key = url.origin;
  const hit = robotsCache.get(key);
  let txt = hit && Date.now() - hit.at < 600000 ? hit.txt : null;
  if (txt === null) {
    try { const r = await safeGet(`${url.origin}/robots.txt`, { accept: 'text/plain' }); txt = r.status === 200 ? r.body : ''; } catch { txt = ''; }
    robotsCache.set(key, { at: Date.now(), txt });
  }
  return robotsAllows(txt, url.pathname + url.search);
}
/** robots.txt check for any URL (used by careers-site discovery). */
export const robotsAllowsUrl = (url) => allowedByRobots(url);

const decode = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
/** HTML → readable text (headings and list items on their own lines). */
export function htmlToText(html) {
  return decode(String(html || '')
    .replace(/<\s*(script|style|noscript|svg|nav|header|footer|form|iframe)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*li[^>]*>/gi, '\n- ').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|h[1-6]|ul|ol|li|section|article|tr)\s*>/gi, '\n').replace(/<\s*h[1-6][^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Find a schema.org JobPosting in the page's JSON-LD blocks. */
export function findJobPosting(html) {
  for (const m of String(html).matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const x = stack.pop();
      if (!x || typeof x !== 'object') continue;
      if (Array.isArray(x)) { stack.push(...x); continue; }
      const t = [].concat(x['@type'] || []);
      if (t.includes('JobPosting')) return x;
      if (x['@graph']) stack.push(x['@graph']);
    }
  }
  return null;
}
/**
 * LinkedIn's public (signed-out) job page: title, company, location, the "criteria" list and the description block.
 * Returns { posting, descriptionHtml, criteria } shaped like a schema.org JobPosting, or null if it isn't that page.
 */
export function extractLinkedInPublic(html) {
  const b = String(html || '');
  const txt = (re) => { const m = b.match(re); return m ? decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : ''; };
  const title = txt(/<h1[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h1>/i) || txt(/<h1[^>]*topcard__title[^>]*>([\s\S]*?)<\/h1>/i);
  const company = txt(/topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/i) || txt(/topcard__flavor[^"]*"[^>]*>\s*([^<]{2,80})<\/span>/i);
  const location = txt(/topcard__flavor--bullet[^>]*>([\s\S]*?)<\/span>/i);
  const start = b.search(/class="[^"]*show-more-less-html__markup[^"]*"[^>]*>/i);
  let descriptionHtml = '';
  if (start >= 0) { const from = b.indexOf('>', start) + 1; const end = b.indexOf('</div>', from); descriptionHtml = b.slice(from, end > from ? end : from + 50000); }
  const criteria = {};
  for (const m of b.matchAll(/<h3[^>]*job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>\s*<span[^>]*job-criteria-text[^>]*>([\s\S]*?)<\/span>/gi)) {
    criteria[decode(m[1]).replace(/\s+/g, ' ').trim()] = decode(m[2]).replace(/\s+/g, ' ').trim();
  }
  const salaryText = txt(/class="[^"]*compensation__salary[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!title && !descriptionHtml) return null;
  const level = String(criteria['Seniority level'] || '');
  return {
    descriptionHtml, criteria, salaryText,
    posting: {
      '@type': 'JobPosting', title, hiringOrganization: company ? { name: company } : undefined,
      jobLocation: location ? [{ address: location }] : undefined, employmentType: criteria['Employment type'] || undefined,
      occupationalCategory: criteria['Job function'] ? { name: criteria['Job function'] } : undefined,
      // LinkedIn levels → JobsMatchNow levels only where they say the same thing ("Mid-Senior" stays to the title).
      seniorityHint: /^(internship|entry level)$/i.test(level) ? 'junior' : /^director|^executive/i.test(level) ? 'exec' : null,
    },
  };
}

const metaContent = (html, name) => decode(String(html).match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] || '');

/**
 * Scrape one job link → { ok, job, message, code }. Never throws for expected problems; `ok:false` comes with a
 * message the UI shows next to the paste box (the link is kept).
 */
/** LinkedIn job id from a job link (…/jobs/view/<id>/, …/jobs/view/title-<id>, ?currentJobId=<id>). */
export const linkedInJobId = (url) => url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{5,})/)?.[1] || url.searchParams.get('currentJobId') || null;
const isLinkedIn = (url) => /(^|\.)linkedin\.com$/i.test(url.hostname);
let lastLinkedIn = 0;
const LINKEDIN_GAP_MS = Number(process.env.JOBSCRAPER_LINKEDIN_GAP_MS ?? 3000);

export async function scrapeUrl(raw, { allowLinkedIn = getSettings().allowLinkedIn } = {}) {
  let url;
  try { url = validateUrl(raw); } catch (e) { return { ok: false, code: e.code || 'invalid', message: e.message }; }
  const original = url.href;
  const blocked = blockedSite(url);
  // Owner's opt-in (settings): read LinkedIn's PUBLIC job page, signed out, slowly. Never signs in, never gets past
  // a sign-in wall, bot check or CAPTCHA, never disguises itself. Indeed and Glassdoor stay blocked.
  const linkedIn = blocked === 'LinkedIn' && allowLinkedIn;
  if (blocked && !linkedIn) return { ok: false, code: 'blocked', url: url.href, sourceName: blocked, message: `${PASTE_MESSAGE} (${blocked} job pages are not read automatically${blocked === 'LinkedIn' ? ': turn on “Read public LinkedIn job pages” to try' : ': their terms do not allow it'}.)` };
  if (linkedIn) {
    const id = linkedInJobId(url);
    if (!id) return { ok: false, code: 'empty', url: url.href, sourceName: 'LinkedIn', message: `${PASTE_MESSAGE} (Not a LinkedIn job link.)` };
    url = new URL(`https://www.linkedin.com/jobs/view/${id}/`);
    const wait = lastLinkedIn + LINKEDIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastLinkedIn = Date.now();
  }
  const fail = (code, why) => ({ ok: false, code, url: original, sourceName: linkedIn ? 'LinkedIn' : url.hostname, message: `${PASTE_MESSAGE} (${why})` });
  try {
    if (!linkedIn && !(await allowedByRobots(url))) return fail('robots', "This site's robots.txt asks tools not to read this page.");
    const res = await safeGet(url.href, { allowLinkedIn: linkedIn });
    if (linkedIn && (res.status === 999 || res.status === 429 || /\/(authwall|login|checkpoint|uas\/)/i.test(new URL(res.url).pathname))) {
      return fail('restricted', `LinkedIn did not show the public page (${res.status === 999 || res.status === 429 ? `answer ${res.status}: it limits tools` : 'it asked to sign in'}). We don't get around that.`);
    }
    if (res.status === 401 || res.status === 403) return { ok: false, code: 'restricted', url: url.href, sourceName: url.hostname, message: `${PASTE_MESSAGE} (The page needs a sign-in or blocks tools; we don't get around that.)` };
    if (res.status !== 200) return { ok: false, code: 'fetch', url: url.href, sourceName: url.hostname, message: `${PASTE_MESSAGE} (The site answered ${res.status}.)` };
    const ctype = String(res.headers['content-type'] || '');
    if (!/html|json|text\/plain/i.test(ctype)) return { ok: false, code: 'type', url: url.href, message: `${PASTE_MESSAGE} (Not a web page: ${ctype || 'unknown type'}.)` };
    const li = linkedIn ? extractLinkedInPublic(res.body) : null;
    if (linkedIn && !li) return fail('restricted', 'LinkedIn did not show the job (no public job page).');
    // Career sites without schema.org data that have their own reader (lib/sites.mjs), e.g. Michael Page.
    const reader = !linkedIn && !/json/i.test(ctype) && !findJobPosting(res.body) ? siteReader(new URL(res.url)) : null;
    const sr = reader ? reader.read(res.body, res.url) : null;
    const posting = li ? li.posting : sr ? sr.posting : /json/i.test(ctype) ? null : findJobPosting(res.body);
    const sourceName = metaContent(res.body, 'og:site_name') || new URL(res.url).hostname.replace(/^www\./, '');
    let text = li ? htmlToText(li.descriptionHtml) : sr ? htmlToText(sr.descriptionHtml) : posting?.description ? htmlToText(posting.description) : '';
    if (li?.salaryText) text = `Salary: ${li.salaryText}\n\n${text}`; // LinkedIn's own pay line, when it shows one
    if (!text) {
      const main = res.body.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || res.body.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || res.body;
      text = /json/i.test(ctype) ? '' : htmlToText(main);
    }
    if (/captcha|are you a robot|access denied|enable javascript/i.test(text.slice(0, 600)) && !posting) return { ok: false, code: 'restricted', url: url.href, message: `${PASTE_MESSAGE} (The page shows a robot check; we don't get around that.)` };
    if (!posting && text.length < 200) return { ok: false, code: 'empty', url: url.href, sourceName, message: `${PASTE_MESSAGE} (No job text found on the page; it may load with JavaScript.)` };
    const job = parseJob({ text, posting, url: linkedIn ? original : res.url, sourceName: linkedIn ? 'LinkedIn' : sourceName, method: linkedIn ? 'public LinkedIn job page (signed out)' : sr ? `${reader.name} job page (site reader)` : posting ? 'schema.org JobPosting on the page' : 'page text' });
    if (sr) {
      // Stated on the page: the consultant handling the role and the site's own job reference.
      if (sr.extra.recruiterName) { job.recruiterName = sr.extra.recruiterName; job.recruiterTitle = sr.extra.recruiterTitle; }
      if (sr.extra.sourceJobId) job.sourceJobId = sr.extra.sourceJobId;
      job.siteFacts = sr.extra.facts;
    }
    if (li) {
      if (!job.seniority && li.posting.seniorityHint) { job.seniority = li.posting.seniorityHint; job.review.notProvided = job.review.notProvided.filter((k) => k !== 'seniority'); }
      job.linkedInCriteria = li.criteria; // as LinkedIn states them (Seniority level, Employment type, Job function, Industries)
    }
    if (!job.title) { const t = decode(res.body.match(/<title[^>]*>([^<]{3,140})<\/title>/i)?.[1] || '').trim(); if (t) { job.title = t; job.review.check.push('title'); job.review.notProvided = job.review.notProvided.filter((k) => k !== 'title'); } }
    return { ok: true, job, url: res.url };
  } catch (e) {
    return { ok: false, code: e.code || 'fetch', url: url.href, message: `${PASTE_MESSAGE} (${e instanceof LinkError ? e.message : 'The site could not be reached.'})` };
  }
}
