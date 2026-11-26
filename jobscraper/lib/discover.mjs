/**
 * Find the jobs listed on a careers website (2026-11-26): a company careers page, a recruiter's search page
 * (e.g. michaelpage.com.vn/jobs/information-technology) or an applicant-tracking job board.
 *
 * - Greenhouse, Lever and Ashby boards: their PUBLIC job-board APIs (made for this), full job content, no page reads.
 * - Any other site: the listing page itself (robots.txt checked, same safe fetch as one job page), then the links on it
 *   that look like job pages (same site, a job-like path with an id or a long title slug), plus up to `maxPages`
 *   result pages. LinkedIn, Indeed and Glassdoor listings are never read.
 * Returns { ok, via, name, jobs: [{ url, key, title, job? }], pages, message? }. `job` is set when the API already gave
 * the full job (no need to read the page).
 */
import { blockedSite, findJobPosting, htmlToText, LinkError, robotsAllowsUrl, safeGet, validateUrl } from './fetch.mjs';
import { jobKey } from './batch.mjs';
import { parseJob } from './parse.mjs';

const PAGE_GAP_MS = Number(process.env.JOBSCRAPER_PAGE_GAP_MS ?? 1500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const text = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Keyword filter: "data, ai, machine learning" → a title matches when it contains any of them (whole words). */
export function keywordFilter(keywords) {
  const words = String(keywords || '').split(/[,;|\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (!words.length) return () => true;
  const res = words.map((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i'));
  return (title) => res.some((re) => re.test(String(title || '')));
}

// Job-page path words, English and Vietnamese (viec-lam = job, tim-viec-lam = find a job, tuyen-dung = hiring).
const JOB_WORD = /\/(?:[a-z]+-)?(job-detail|job-details|jobdetail|job|jobs|career|careers|position|positions|vacanc(?:y|ies)|opening|openings|opportunit(?:y|ies)|requisitions?|postings?|roles?|o|p|viec-lam|tim-viec-lam|tuyen-dung|chi-tiet-viec-lam)\/(.+)$/i;
// VietnamWorks-style job pages: /<title>-<id>-jd (job) or -jv.
const SLUG_ID_JOB = /\/[a-z0-9-]{6,}-\d{5,}-(jd|jv)\/?$/i;
const NOT_JOB = /\/(search|job-search|tim-kiem|alerts?|job_alert|apply|login|signin|sign-in|register|saved|viec-lam-da-luu|mypage|advice|blog|news|press|events?|category|categories|departments?|locations?|teams?|faq|privacy|terms|cookie|employers?|companies|cong-ty)(\/|$|\?)|[?&](page|sort|order|ordering|contract|filter|q|keyword|region_ids)=|\{/i;
const ASSET = /\.(css|js|png|jpe?g|gif|svg|ico|pdf|docx?|xml|json|webp|woff2?)(\?|$)/i;
// Listing sites that link their jobs on a sister site (Navigos Search → VietnamWorks).
const SISTER_SITES = { 'navigossearch.com': ['vietnamworks.com'] };
const bare = (h) => h.toLowerCase().replace(/^www\./, '');
/** How strongly `href` looks like ONE job's page from `listing`: 2 = clearly (id in the path), 1 = maybe, 0 = no. */
export function jobLinkScore(href, listing) {
  let u; try { u = new URL(href, listing); } catch { return 0; }
  const l = new URL(listing);
  if (!/^https?:$/.test(u.protocol)) return 0;
  const same = bare(u.hostname) === bare(l.hostname) || (SISTER_SITES[bare(l.hostname)] || []).includes(bare(u.hostname));
  if (!same || ASSET.test(u.pathname) || NOT_JOB.test(u.pathname + u.search)) return 0;
  if (u.pathname.replace(/\/$/, '') === l.pathname.replace(/\/$/, '')) return 0;
  if (SLUG_ID_JOB.test(u.pathname)) return 2;
  const m = u.pathname.match(JOB_WORD);
  if (!m) return 0;
  const rest = m[2].replace(/\/$/, '');
  const segs = rest.split('/').filter(Boolean);
  if (/\d{4,}/.test(rest) || /^job-?detail/i.test(m[1])) return 2;
  return segs.length >= 2 || (segs[0] || '').split('-').length >= 4 ? 1 : 0;
}
export const isJobLink = (href, listing) => jobLinkScore(href, listing) > 0;

/** Result pages of the same listing: ?page=N or /page/N links. */
function pageLinks(html, listing) {
  const l = new URL(listing); const out = new Set();
  for (const m of String(html).matchAll(/href=["']([^"'#]+)["']/gi)) {
    let u; try { u = new URL(decode(m[1]), listing); } catch { continue; }
    if (u.hostname !== l.hostname) continue;
    if ((u.pathname === l.pathname && /^\d+$/.test(u.searchParams.get('page') || '')) || u.pathname.replace(/\/page\/\d+\/?$/, '') === l.pathname.replace(/\/$/, '') && /\/page\/\d+\/?$/.test(u.pathname)) out.add(u.href);
  }
  return [...out];
}

/** Job links (and their link text) on one listing page; JSON-LD JobPostings / ItemList urls first. */
export function jobLinksOnPage(html, listing) {
  const found = new Map();
  // A job card often links several times ("Save job", an image, the title): keep the most informative link text.
  const generic = (t) => !t || t.length < 4 || /^(view|apply|save|read more|more|details|learn more|see (the )?job|view job|apply now|save job|share)\b/i.test(t);
  const add = (href, title) => {
    let u; try { u = new URL(decode(href), listing); } catch { return; }
    const key = jobKey(u); const t = String(title || '').trim();
    const cur = found.get(key);
    // The title is the shortest meaningful text (8–140 chars): a card link's text also holds salary, place, dates.
    const fit = (x) => !generic(x) && x.length >= 8 && x.length <= 140;
    if (!cur) found.set(key, { url: u.href, key, title: generic(t) ? '' : t.slice(0, 160) });
    else if (fit(t) && (!fit(cur.title) || t.length < cur.title.length)) cur.title = t;
  };
  for (const m of String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d; try { d = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [d];
    while (stack.length) {
      const x = stack.pop(); if (!x || typeof x !== 'object') continue;
      if (Array.isArray(x)) { stack.push(...x); continue; }
      const t = [].concat(x['@type'] || []);
      if (t.includes('JobPosting') && x.url) add(x.url, x.title);
      if (t.includes('ListItem') && x.url && /job/i.test(JSON.stringify(x.item || x).slice(0, 400))) add(x.url, x.name || x.item?.title);
      for (const k of ['@graph', 'itemListElement', 'item']) if (x[k]) stack.push(x[k]);
    }
  }
  for (const m of String(html).matchAll(/<a\b([^>]*)href=["']([^"'#]+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!isJobLink(decode(m[2]), listing)) continue;
    const attr = `${m[1]} ${m[3]}`.match(/\btitle=["']([^"']{4,200})["']/i)?.[1];
    if (attr) add(m[2], text(attr));
    add(m[2], text(m[4]).slice(0, 300));
  }
  // Pages that build their list with JavaScript often still carry the job links in embedded data: read those too.
  if (found.size < 3) {
    for (const m of String(html).matchAll(/["'](https?:\/\/[^"'\s<>]{10,300}|\/[a-z0-9][^"'\s<>]{6,300})["']/gi)) {
      const href = decode(m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
      if (jobLinkScore(href, listing) === 2) add(href, '');
    }
  }
  // When the page has clear job links (an id in the path), drop the vaguer ones (location or category pages).
  const all = [...found.values()];
  const strong = all.filter((j) => jobLinkScore(j.url, listing) === 2);
  return strong.length >= 3 ? strong : all;
}

/** RSS / Atom feed of jobs (e.g. a JobServe saved-search feed): each item is a job, its text is the job text. */
export function jobsFromFeed(xml, feedUrl) {
  const items = [...String(xml).matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const tag = (s, t) => { const m = s.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i')); return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : ''; };
  return items.map((it) => {
    const link = tag(it, 'link') || it.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || tag(it, 'guid');
    let u; try { u = new URL(decode(link), feedUrl); } catch { return null; }
    const title = text(tag(it, 'title'));
    const body = decode(tag(it, 'description') || tag(it, 'summary') || tag(it, 'content'));
    return { url: u.href, key: jobKey(u), title, descriptionHtml: body };
  }).filter(Boolean);
}

// ---------- applicant-tracking boards (public APIs) ----------
const ATS = [
  { name: 'Greenhouse', re: /^(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io$/i, token: (u) => u.pathname.split('/').filter(Boolean)[0],
    async list(token, get) {
      const board = await get(`https://boards-api.greenhouse.io/v1/boards/${token}`).catch(() => null);
      const r = await get(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
      return (r.jobs || []).map((j) => ({ url: j.absolute_url, title: j.title, company: board?.name || token, location: j.location?.name, descriptionHtml: decode(j.content || ''), datePosted: j.updated_at }));
    } },
  { name: 'Lever', re: /^jobs(?:\.eu)?\.lever\.co$/i, token: (u) => u.pathname.split('/').filter(Boolean)[0],
    async list(token, get, host) {
      const api = /\.eu\./.test(host) ? 'https://api.eu.lever.co' : 'https://api.lever.co';
      const r = await get(`${api}/v0/postings/${token}?mode=json`);
      return (Array.isArray(r) ? r : []).map((j) => ({ url: j.hostedUrl, title: j.text, company: token, location: j.categories?.location, type: j.categories?.commitment, workMode: j.workplaceType,
        descriptionHtml: [j.description, ...(j.lists || []).map((x) => `<h3>${x.text}</h3><ul>${x.content}</ul>`), j.additional].filter(Boolean).join('\n'), datePosted: j.createdAt ? new Date(j.createdAt).toISOString() : undefined }));
    } },
  { name: 'Ashby', re: /^jobs\.ashbyhq\.com$/i, token: (u) => u.pathname.split('/').filter(Boolean)[0],
    async list(token, get) {
      const r = await get(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`);
      return (r.jobs || []).filter((j) => j.isListed !== false).map((j) => ({ url: j.jobUrl, title: j.title, company: token, location: j.location, type: j.employmentType, workMode: j.isRemote ? 'Remote' : j.workplaceType,
        descriptionHtml: j.descriptionHtml || '', datePosted: j.publishedAt }));
    } },
];
const TYPE_MAP = { fulltime: 'FULL_TIME', 'full-time': 'FULL_TIME', parttime: 'PART_TIME', 'part-time': 'PART_TIME', contract: 'CONTRACTOR', intern: 'INTERN', internship: 'INTERN' };

async function getJson(url) {
  // Job-board APIs return the whole board with full descriptions in one answer: allow up to 15 MB here only.
  const r = await safeGet(url, { accept: 'application/json', maxBytes: 15 * 1024 * 1024 });
  if (r.status !== 200) throw new LinkError(`The job board answered ${r.status}`, r.status === 404 ? 'empty' : 'fetch');
  try { return JSON.parse(r.body); } catch { throw new LinkError('The job board did not answer with jobs', 'fetch'); }
}

/** Find the jobs on a careers site. Never throws for expected problems. */
export async function discoverJobs(raw, { keywords = '', maxPages = 2, maxJobs = 200 } = {}) {
  let url;
  try { url = validateUrl(raw); } catch (e) { return { ok: false, code: e.code || 'invalid', message: e.message, jobs: [] }; }
  const blocked = blockedSite(url);
  if (blocked) return { ok: false, code: 'blocked', message: `${blocked} listings are not read automatically. Add the company's own careers page instead.`, jobs: [] };
  const keep = keywordFilter(keywords);
  try {
    const ats = ATS.find((a) => a.re.test(url.hostname));
    if (ats) {
      const token = ats.token(url);
      if (!token || !/^[\w.-]{1,80}$/.test(token)) return { ok: false, code: 'invalid', message: `Use the ${ats.name} board link, e.g. https://${url.hostname}/<company>`, jobs: [] };
      const items = await ats.list(token, getJson, url.hostname);
      const jobs = items.filter((j) => j.url && keep(j.title)).slice(0, maxJobs).map((j) => {
        const u = new URL(j.url);
        const posting = { '@type': 'JobPosting', title: j.title, hiringOrganization: { name: j.company }, jobLocation: j.location ? [{ address: j.location }] : undefined,
          employmentType: TYPE_MAP[String(j.type || '').toLowerCase().replace(/\s+/g, '')] || j.type || undefined, jobLocationType: /remote/i.test(j.workMode || '') ? 'TELECOMMUTE' : undefined };
        const job = parseJob({ text: htmlToText(j.descriptionHtml), posting, url: u.href, sourceName: `${j.company} (${ats.name})`, method: `${ats.name} job board API` });
        return { url: u.href, key: jobKey(u), title: j.title, job };
      });
      return { ok: true, via: ats.name, name: items[0]?.company || token, jobs, pages: 1, total: items.length };
    }
    // Any careers page: read it (robots.txt first), collect job links, follow result pages.
    const seen = new Map(); const queue = [url.href]; const done = new Set(); let name = url.hostname.replace(/^www\./, ''); let pages = 0;
    while (queue.length && pages < Math.max(1, maxPages)) {
      const page = queue.shift(); if (done.has(page)) continue; done.add(page);
      if (!(await robotsAllowsUrl(new URL(page)))) {
        // Filtered search links (…/explore?city=…) are often the blocked kind: the site's own location or category
        // page (e.g. glints.com/vn/en/job-location/vietnam/thanh-pho-ho-chi-minh) usually lists the same jobs.
        if (!pages) return { ok: false, code: 'robots', message: `This site's robots.txt asks tools not to read this page.${new URL(page).search ? ' Search links with filters are often blocked: use the site\'s own city or category page instead (it is usually in the site\'s sitemap).' : ''}`, jobs: [] };
        break;
      }
      if (pages) await sleep(PAGE_GAP_MS);
      // Listing pages of big job boards are heavy (CareerViet ~3.6 MB): allow up to 8 MB for a listing.
      const r = await safeGet(page, { accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9', maxBytes: 8 * 1024 * 1024 });
      pages += 1;
      if (r.status !== 200) { if (pages === 1) return { ok: false, code: r.status === 401 || r.status === 403 ? 'restricted' : 'fetch', message: `The site answered ${r.status}.`, jobs: [] }; break; }
      // An RSS / Atom feed (e.g. JobServe saved search): the feed items are the jobs, with their text.
      if (pages === 1 && /<rss\b|<feed\b[^>]*atom/i.test(r.body.slice(0, 2000))) {
        const items = jobsFromFeed(r.body, r.url);
        const feedName = text(r.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || name;
        const jobs = items.filter((j) => keep(j.title)).slice(0, maxJobs).map((j) => ({ url: j.url, key: j.key, title: j.title,
          job: j.descriptionHtml && htmlToText(j.descriptionHtml).length >= 120 ? parseJob({ text: htmlToText(j.descriptionHtml), posting: { '@type': 'JobPosting', title: j.title }, url: j.url, sourceName: feedName, method: 'RSS feed item' }) : undefined }));
        if (!items.length) return { ok: false, code: 'empty', message: 'The feed has no jobs right now.', jobs: [] };
        return { ok: true, via: 'RSS feed', name: feedName, jobs, pages, total: items.length };
      }
      // JobServe search results (…/JobSearch.aspx?shid=…): the page carries every result's id in a hidden field;
      // each job has a public page /gb/en/<id>.jsjob with full schema.org data. Titles are not on the results page,
      // so the job-type filter can't run here: the JobServe search's own keywords decide (founder, 2026-11-26).
      if (pages === 1 && /(^|\.)jobserve\.com$/i.test(new URL(r.url).hostname)) {
        const ids = (r.body.match(/id="jobIDs"[^>]*value="([^"]*)"/i)?.[1] || '').split('#').filter((x) => /^[A-F0-9]{10,30}$/i.test(x));
        if (ids.length) {
          const jobs = ids.slice(0, maxJobs).map((id) => { const u = new URL(`https://www.jobserve.com/gb/en/${id}.jsjob`); return { url: u.href, key: jobKey(u), title: '' }; });
          return { ok: true, via: 'JobServe search (its own keywords)', name: 'JobServe', jobs, pages, total: ids.length };
        }
        return { ok: false, code: 'empty', message: 'No results on this JobServe search: run it on jobserve.com, then copy the address with ?shid=… from the results page.', jobs: [] };
      }
      if (pages === 1) {
        name = decode(r.body.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] || '') || name;
        // A single job page given by mistake: it is its own (only) job.
        const one = findJobPosting(r.body);
        if (one && !jobLinksOnPage(r.body, r.url).length) return { ok: true, via: 'one job page', name, jobs: [{ url: r.url, key: jobKey(new URL(r.url)), title: one.title || '' }], pages };
        for (const p of pageLinks(r.body, r.url)) queue.push(p);
      }
      for (const j of jobLinksOnPage(r.body, r.url)) if (!seen.has(j.key)) seen.set(j.key, j);
    }
    const all = [...seen.values()];
    const titleOf = (j) => j.title || decodeURIComponent(new URL(j.url).pathname.split('/').filter(Boolean).find((s) => s.split('-').length >= 3) || '').replace(/-/g, ' ');
    const jobs = all.filter((j) => keep(titleOf(j))).slice(0, maxJobs).map((j) => ({ ...j, title: j.title || titleOf(j) }));
    if (!all.length) return { ok: false, code: 'empty', message: 'No job links found on this page. It may load its jobs with JavaScript: try the site\'s job-board link (Greenhouse, Lever, Ashby) or a search results page.', jobs: [], pages };
    return { ok: true, via: 'page links', name, jobs, pages, total: all.length };
  } catch (e) {
    return { ok: false, code: e.code || 'fetch', message: e instanceof LinkError ? e.message : 'The site could not be reached.', jobs: [] };
  }
}
