/**
 * "For who" (founder, 2026-11-26): which workers a role is open to, by where they live/work.
 * Shown on the role card above the location, set in every role form above Employment type, and used to filter the
 * JobFinder listings. A role keeps what its recruiter chose (`job.forWho`); otherwise it is worked out from the
 * location, work mode and remote scope (never stored by a view, so live data is unchanged).
 * Same list and rules as src/lib/forWho.ts.
 */
export const FOR_WHO = {
  vn: 'Vietnam-based workers',
  us: 'US-based workers',
  eu: 'EU / UK-based workers',
  sg: 'Singapore-based workers',
  au: 'Australia-based workers',
  apac: 'Asia-Pacific workers',
  remote: 'Remote workers, anywhere',
};
export const FOR_WHO_CODES = Object.keys(FOR_WHO);

const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const RULES = [
  ['vn', /viet\s?nam|việt nam|\bvn\b|ho chi minh|hồ chí minh|\bhcmc?\b|sai ?gon|ha ?noi|hà nội|da ?nang|đà nẵng|hai ?phong|hải phòng|can tho|cần thơ|binh duong|bình dương|dong nai|đồng nai|quận \d|phường/i],
  ['us', new RegExp(`united states|\\busa\\b|\\bu\\.s\\.|\\bus\\b(?!-)|new york|san francisco|seattle|austin|boston|chicago|los angeles|bay area|silicon valley|denver|atlanta|miami|washington,? d\\.?c|,\\s*(${US_STATES})\\b`, 'i')],
  ['eu', /europe|\bemea\b|\beu\b|united kingdom|\buk\b|england|scotland|wales|ireland|london|manchester|france|paris|lyon|germany|deutschland|berlin|munich|münchen|frankfurt|hamburg|netherlands|nederland|amsterdam|rotterdam|belgium|brussels|spain|madrid|barcelona|portugal|lisbon|italy|milan|rome|poland|warsaw|krak[oó]w|czech|prague|austria|vienna|switzerland|zurich|zürich|geneva|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|romania|bucharest|hungary|budapest|greece|athens|estonia|latvia|lithuania|luxembourg|croatia|bulgaria|slovakia|slovenia/i],
  ['sg', /singapore/i],
  ['au', /australia|sydney|melbourne|brisbane|perth|adelaide|canberra/i],
  ['apac', /\bapac\b|asia[- ]pacific|south[- ]?east asia|\bsea\b region|\basean\b/i],
];
const HINTS = { vietnam: 'vn', vn: 'vn', us: 'us', usa: 'us', 'united states': 'us', 'eu / uk': 'eu', eu: 'eu', uk: 'eu', europe: 'eu', singapore: 'sg', australia: 'au', apac: 'apac', remote: 'remote' };

/** Work out the worker groups from what the role states. `hint` = the source site's region (e.g. "Vietnam"). */
export function inferForWho(job, hint = '') {
  const where = [job.location, job.country, job.remoteScope === 'country' ? job.country : ''].filter(Boolean).join(' · ');
  const out = new Set();
  for (const [code, re] of RULES) if (re.test(where)) out.add(code);
  const remote = String(job.workMode || '') === 'Remote' || /\bremote\b/i.test(String(job.location || ''));
  const anywhere = /anywhere|worldwide|global|fully remote|work from anywhere/i.test(where) || (remote && job.remoteScope === 'worldwide' && !out.size);
  if (remote && anywhere) out.add('remote');
  if (!out.size && hint) { const h = HINTS[String(hint).trim().toLowerCase()]; if (h) out.add(h); }
  return FOR_WHO_CODES.filter((c) => out.has(c));
}
/** What a role shows: the recruiter's choice, else the worked-out groups. */
export function forWhoOf(job) {
  return Array.isArray(job?.forWho) && job.forWho.length ? job.forWho.filter((c) => FOR_WHO_CODES.includes(c)) : inferForWho(job || {});
}
/** Clean a submitted value: known codes only, at most all of them. */
export function cleanForWho(v) {
  return Array.isArray(v) ? [...new Set(v.filter((c) => typeof c === 'string' && FOR_WHO_CODES.includes(c)))] : undefined;
}
