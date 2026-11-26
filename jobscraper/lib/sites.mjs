/**
 * Site readers for career sites whose job pages have no schema.org JobPosting (2026-11-26).
 * Each reader turns the page into { posting, descriptionHtml, extra } shaped like a JobPosting, so parseJob treats the
 * stated facts as "from the source" and the description as the job text. Add a site here; never guess a field.
 *
 *  - PageGroup (Michael Page, Page Personnel, Page Executive, any country): title from the page heading, facts from the
 *    "Summary" list (Location, Contract Type, Salary, Industry, Function, Consultant name, Job Reference). The client is
 *    confidential on these sites, so the company is "Confidential client (via Michael Page)".
 */
const decode = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const strip = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const PAGEGROUP = /(^|\.)(michaelpage|pagepersonnel|pageexecutive)\.[a-z.]+$/i;
const BRAND = (host) => (/pagepersonnel/i.test(host) ? 'Page Personnel' : /pageexecutive/i.test(host) ? 'Page Executive' : 'Michael Page');

/** The "Summary" facts of a PageGroup job page: { Location: 'Ho Chi Minh City', 'Contract Type': 'Permanent', … }. */
export function pageGroupFacts(html) {
  const facts = {};
  for (const m of String(html).matchAll(/<dt[^>]*summary-detail-field-label[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const k = strip(m[1]); const v = strip(m[2]);
    if (k && v && !(k in facts)) facts[k] = v;
  }
  return facts;
}

export function readPageGroup(html, url) {
  const b = String(html || '');
  const title = strip(b.match(/<h1[^>]*job-apply-job-title[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')
    || strip(b.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || '').replace(/\s+-\s+JN-[\w-]+\s*\|.*$/i, '');
  const facts = pageGroupFacts(b);
  const from = b.indexOf('id="job-description"');
  if (!title || from < 0) return null;
  const end = b.indexOf('summary-detail-field-label', from);
  const descriptionHtml = b.slice(b.indexOf('>', from) + 1, end > from ? b.lastIndexOf('<dl', end) : from + 60000);
  const brand = BRAND(new URL(url).hostname);
  const salary = facts.Salary || '';
  return {
    descriptionHtml: `${descriptionHtml}${salary ? `<p>Salary: ${salary}</p>` : ''}`,
    extra: {
      recruiterName: facts['Consultant name'] || null,
      recruiterTitle: facts['Consultant name'] ? `Consultant, ${brand}` : null,
      sourceJobId: facts['Job Reference'] || b.match(/\/ref\/(jn-[\w-]+)/i)?.[1]?.toUpperCase() || null,
      facts,
    },
    posting: {
      '@type': 'JobPosting', title,
      hiringOrganization: { name: `Confidential client (via ${brand})` },
      jobLocation: facts.Location ? [{ address: facts.Location }] : undefined,
      employmentType: /permanent/i.test(facts['Contract Type'] || '') ? 'FULL_TIME' : /temp|contract/i.test(facts['Contract Type'] || '') ? 'CONTRACTOR' : undefined,
      occupationalCategory: facts.Function ? { name: facts.Function } : undefined,
    },
  };
}

export const SITE_READERS = [
  { name: 'PageGroup', match: (url) => PAGEGROUP.test(url.hostname) && /\/job-detail\//i.test(url.pathname), read: readPageGroup },
];
export const siteReader = (url) => SITE_READERS.find((s) => s.match(url)) || null;
