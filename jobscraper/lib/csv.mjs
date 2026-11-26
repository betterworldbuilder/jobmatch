// CSV export: one row per job role, every field of the job file as a column. Opens in Excel / Google Sheets.
import { GROUP_NAMES } from './batch.mjs';

export const COLUMNS = [
  ['list_group', 'List group'], ['status', 'Status'], ['source_url', 'Source URL'], ['source_name', 'Source'], ['method', 'How it was read'],
  ['title', 'Job title'], ['company', 'Company'], ['department', 'Department'], ['location', 'Location'], ['country', 'Country'],
  ['workMode', 'Work mode'], ['type', 'Employment type'], ['seniority', 'Seniority'], ['openings', 'Openings'], ['urgency', 'Urgency'],
  ['deadline', 'Application deadline'], ['contractDuration', 'Contract duration'], ['startDate', 'Start date'], ['hiringRadiusKm', 'Max distance (km)'],
  ['workVisaRequired', 'Work visa required'], ['salary_min', 'Salary min'], ['salary_max', 'Salary max'], ['salary_currency', 'Currency'],
  ['salaryPeriod', 'Salary period'], ['salaryNegotiable', 'Negotiable'], ['bonus', 'Bonus'], ['equity', 'Equity'],
  ['must_have', 'Must have (weight)'], ['niceToHaves', 'Nice to have'], ['requiredLanguages', 'Languages'], ['responsibilities', 'Responsibilities'],
  ['benefits', 'Benefits'], ['workingHours', 'Working hours'], ['flexibleHours', 'Flexibility'], ['probation', 'Probation'], ['travel', 'Travel'],
  ['hybridDays', 'Office days per week'], ['visaSponsorship', 'Visa sponsorship'], ['relocationSupport', 'Relocation support'], ['onCall', 'On-call'],
  ['job_groups', 'Job groups'], ['description', 'Summary'], ['fullDescription', 'Full job description'],
  ['to_check', 'Fields to check'], ['not_provided', 'Not provided'], ['read_at', 'Read at'],
];

const yesNo = (v) => (v === true ? 'Yes' : v === false ? 'No' : '');
const list = (v) => (Array.isArray(v) ? v.join('; ') : '');

/** One job (and optionally its list item) → a flat row. Unknown values stay empty. */
export function rowOf(job = {}, item = null) {
  const s = job.salaryRange || {};
  return {
    list_group: item ? item.groups.map((g) => g.label).join('; ') : '',
    status: item ? item.status : 'saved',
    source_url: job.source?.url || job.externalUrl || item?.url || '',
    source_name: job.source?.name || item?.site || '',
    method: job.source?.method || '',
    title: job.title, company: job.company, department: job.department, location: job.location, country: job.country,
    workMode: job.workMode, type: job.type, seniority: job.seniority, openings: job.openings, urgency: job.urgency, deadline: job.deadline,
    contractDuration: job.contractDuration, startDate: job.startDate, hiringRadiusKm: job.hiringRadiusKm, workVisaRequired: yesNo(job.workVisaRequired),
    salary_min: s.min, salary_max: s.max, salary_currency: s.currency, salaryPeriod: job.salaryPeriod, salaryNegotiable: yesNo(job.salaryNegotiable),
    bonus: job.bonus, equity: job.equity,
    must_have: (job.requiredSkillsDetail || []).map((x) => `${x.name} (${x.weight})`).join('; '),
    niceToHaves: list(job.niceToHaves), requiredLanguages: list(job.requiredLanguages), responsibilities: list(job.responsibilities), benefits: list(job.benefits),
    workingHours: job.workingHours, flexibleHours: job.flexibleHours, probation: job.probation, travel: job.travel, hybridDays: job.hybridDays,
    visaSponsorship: yesNo(job.visaSponsorship), relocationSupport: yesNo(job.relocationSupport), onCall: job.onCall,
    job_groups: (job.jobGroups?.length ? job.jobGroups : (item?.groups || []).map((g) => g.id).filter(Boolean)).map((id) => GROUP_NAMES[id] || id).join('; '),
    description: job.description, fullDescription: job.fullDescription,
    to_check: list(job.review?.check), not_provided: list(job.review?.notProvided), read_at: job.source?.retrievedAt || '',
  };
}

/** RFC 4180 cell; cells that a spreadsheet would run as a formula are prefixed with ' (CSV injection guard). */
export function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text with a header and a UTF-8 BOM (so Excel shows accents and ₫ correctly). */
export function toCsv(rows) {
  const lines = [COLUMNS.map(([, label]) => cell(label)).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(([k]) => cell(r[k])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ---------- JobsMatchNow import CSV (Add New Job Offers → ATS or job feed → "Another ATS") ----------
// Header and rules from JobsMatchNow's import help: id,title,location,employment_type,work_mode,salary,url,description;
// title + description required; ≤ 50 roles and ≤ 3 MB per upload; unique id per role (re-uploads are skipped).
export const IMPORT_COLUMNS = ['id', 'title', 'location', 'employment_type', 'work_mode', 'salary', 'url', 'description'];
export const IMPORT_MAX_ROWS = 50;
const IMPORT_MAX_BYTES = 3 * 1024 * 1024 - 64 * 1024; // keep a margin under 3 MB

/** Stable id: LinkedIn job id when there is one, otherwise a short hash of the source link (or of the title). */
export function importId(job) {
  const src = job.source?.url || job.externalUrl || '';
  const li = src.match(/linkedin\.com\/jobs\/view\/(?:[^/]*?-)?(\d{5,})/i)?.[1] || src.match(/[?&]currentJobId=(\d{5,})/)?.[1];
  const part = job.source?.part ? `-r${String(job.source.part).split('/')[0]}` : ''; // one post, several roles
  if (li) return `li-${li}${part}`;
  const key = src ? `${src}${part}` : `${job.title}|${job.company}|${job.location}`;
  let h = 2166136261; for (const ch of key) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `js-${h.toString(36)}`;
}
const fmtNum = (n) => Number(n).toLocaleString('en-US');
export function salaryText(job) {
  const s = job.salaryRange;
  if (!(s && s.min > 0 && s.max >= s.min && s.currency)) return '';
  return `${s.currency} ${fmtNum(s.min)}–${fmtNum(s.max)}${job.salaryPeriod ? ` / ${job.salaryPeriod}` : ''}`;
}
/** A role → one import row, or null when the importer would refuse it (no title or no job text). */
export function importRow(job) {
  const description = String(job.fullDescription || job.description || '').trim();
  if (!String(job.title || '').trim() || description.length < 10) return null;
  return {
    id: importId(job), title: job.title, location: job.location || '', employment_type: job.type || '', work_mode: job.workMode || '',
    salary: salaryText(job), url: job.source?.url || job.externalUrl || '',
    // Company first so the app's parser and the reviewer see it (the importer has no company column).
    description: job.company && !description.toLowerCase().includes(String(job.company).toLowerCase()) ? `Company: ${job.company}\n\n${description}` : description,
  };
}
/** Spreadsheet-safe without changing job text: only =, + and @ at the start are neutralised (not "- " bullets). */
const importCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/**
 * Roles → JobsMatchNow import CSV parts (no BOM: the importer reads the first header cell as-is).
 * Returns { parts: [csvText…], included, skipped: [{title,url,reason}] }.
 */
export function toImportCsv(jobs) {
  const header = IMPORT_COLUMNS.join(',');
  const parts = []; let cur = []; let size = header.length + 2; const skipped = []; const seen = new Set(); let included = 0;
  for (const j of jobs) {
    const r = importRow(j);
    if (!r) { skipped.push({ title: j.title || '', url: j.source?.url || '', reason: 'no job description yet' }); continue; }
    if (seen.has(r.id)) { skipped.push({ title: j.title, url: r.url, reason: 'same role twice' }); continue; }
    seen.add(r.id);
    const line = IMPORT_COLUMNS.map((k) => importCell(r[k])).join(',');
    if (cur.length >= IMPORT_MAX_ROWS || size + line.length + 2 > IMPORT_MAX_BYTES) { parts.push(cur); cur = []; size = header.length + 2; }
    cur.push(line); size += line.length + 2; included += 1;
  }
  if (cur.length) parts.push(cur);
  return { parts: parts.map((rows) => `${[header, ...rows].join('\r\n')}\r\n`), included, skipped };
}

/** Every role of a list, in list order: saved/read jobs with their fields, the other links with link + group + status. */
export function listRows(batch, jobs) {
  return batch.items.map((it) => rowOf(jobs.find((j) => j.id === it.jobId) || {}, it));
}
