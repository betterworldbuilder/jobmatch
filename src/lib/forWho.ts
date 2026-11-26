// "For who" (founder, 2026-11-26): which workers a role is open to. Same list and rules as server/for-who.js.
import type { Job } from '../types';

export const FOR_WHO = {
  vn: 'Vietnam-based workers',
  us: 'US-based workers',
  eu: 'EU / UK-based workers',
  sg: 'Singapore-based workers',
  au: 'Australia-based workers',
  apac: 'Asia-Pacific workers',
  remote: 'Remote workers, anywhere',
} as const;
export type ForWho = keyof typeof FOR_WHO;
export const FOR_WHO_CODES = Object.keys(FOR_WHO) as ForWho[];
/** Short labels for chips and filters. */
export const FOR_WHO_SHORT: Record<ForWho, string> = { vn: 'Vietnam', us: 'US', eu: 'EU / UK', sg: 'Singapore', au: 'Australia', apac: 'Asia-Pacific', remote: 'Remote, anywhere' };

const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const RULES: [ForWho, RegExp][] = [
  ['vn', /viet\s?nam|việt nam|\bvn\b|ho chi minh|hồ chí minh|\bhcmc?\b|sai ?gon|ha ?noi|hà nội|da ?nang|đà nẵng|hai ?phong|hải phòng|can tho|cần thơ|binh duong|bình dương|dong nai|đồng nai|quận \d|phường/i],
  ['us', new RegExp(`united states|\\busa\\b|\\bu\\.s\\.|\\bus\\b(?!-)|new york|san francisco|seattle|austin|boston|chicago|los angeles|bay area|silicon valley|denver|atlanta|miami|washington,? d\\.?c|,\\s*(${US_STATES})\\b`, 'i')],
  ['eu', /europe|\bemea\b|\beu\b|united kingdom|\buk\b|england|scotland|wales|ireland|london|manchester|france|paris|lyon|germany|deutschland|berlin|munich|münchen|frankfurt|hamburg|netherlands|nederland|amsterdam|rotterdam|belgium|brussels|spain|madrid|barcelona|portugal|lisbon|italy|milan|rome|poland|warsaw|krak[oó]w|czech|prague|austria|vienna|switzerland|zurich|zürich|geneva|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|romania|bucharest|hungary|budapest|greece|athens|estonia|latvia|lithuania|luxembourg|croatia|bulgaria|slovakia|slovenia/i],
  ['sg', /singapore/i],
  ['au', /australia|sydney|melbourne|brisbane|perth|adelaide|canberra/i],
  ['apac', /\bapac\b|asia[- ]pacific|south[- ]?east asia|\bsea\b region|\basean\b/i],
];

export function inferForWho(job: Partial<Job>): ForWho[] {
  const where = [job.location, job.country].filter(Boolean).join(' · ');
  const out = new Set<ForWho>();
  for (const [code, re] of RULES) if (re.test(where)) out.add(code);
  const remote = job.workMode === 'Remote' || /\bremote\b/i.test(String(job.location || ''));
  const anywhere = /anywhere|worldwide|global|fully remote|work from anywhere/i.test(where) || (remote && job.remoteScope === 'worldwide' && !out.size);
  if (remote && anywhere) out.add('remote');
  return FOR_WHO_CODES.filter((c) => out.has(c));
}
/** What a role shows: the recruiter's choice, else what its location and work mode say. */
export function forWhoOf(job: Partial<Job>): ForWho[] {
  return job.forWho?.length ? job.forWho.filter((c): c is ForWho => c in FOR_WHO) : inferForWho(job);
}
export const forWhoText = (codes: ForWho[]) => codes.map((c) => FOR_WHO[c]).join(' · ');
