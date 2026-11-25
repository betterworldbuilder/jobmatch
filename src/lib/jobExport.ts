// Export a recruiter's roles (founder, 2026-11-25): Excel, ATS CSV (the same columns our importer reads, so a file
// round-trips), ATS JSON feed ({ jobs: [...] }) and XML feed (<jobs><job>…). Runs in the browser on the
// recruiter's own data; nothing is sent anywhere.
import type { Job } from '../types';
import { downloadXlsx, type Cell } from './xlsx';

export type ExportFormat = 'xlsx' | 'csv' | 'json' | 'xml';
const COLUMNS = ['id', 'source_job_id', 'title', 'company', 'status', 'hiring_status', 'location', 'employment_type', 'work_mode',
  'salary', 'salary_min', 'salary_max', 'salary_currency', 'seniority', 'must_have', 'nice_to_have', 'languages', 'url', 'contact_email',
  'created_at', 'summary', 'description'] as const;
type Row = Record<(typeof COLUMNS)[number], string | number>;

export function jobRow(job: Job, hiringStatus: string): Row {
  const r = job.salaryRange;
  return {
    id: job.id, source_job_id: job.sourceJobId || '', title: job.title, company: job.company || '', status: job.status || '',
    hiring_status: hiringStatus, location: job.location || '', employment_type: job.type || '', work_mode: job.workMode || '',
    salary: job.salary || '', salary_min: r?.min ?? '', salary_max: r?.max ?? '', salary_currency: r?.currency || '',
    seniority: job.seniority || job.experienceLevel || '', must_have: (job.requiredSkills || []).join('; '),
    nice_to_have: (job.niceToHaves || []).join('; '), languages: (job.requiredLanguages || []).join('; '),
    url: job.externalUrl || job.sourceUrl || '', contact_email: job.contactEmail || '', created_at: job.createdAt ? new Date(job.createdAt).toISOString().slice(0, 10) : '',
    summary: job.description || '', description: job.fullDescription || job.description || '',
  };
}

const csvCell = (v: string | number) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const xmlEsc = (v: string | number) => String(v ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export function toCsv(rows: Row[]) { return [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(','))].join('\n') + '\n'; }
export function toJson(rows: Row[]) { return JSON.stringify({ exportedAt: new Date().toISOString(), source: 'JobsMatchNow', jobs: rows }, null, 2); }
export function toXml(rows: Row[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<jobs source="JobsMatchNow" exportedAt="${new Date().toISOString()}">\n${rows.map((row) =>
    `  <job>\n${COLUMNS.map((c) => `    <${c}>${xmlEsc(row[c])}</${c}>`).join('\n')}\n  </job>`).join('\n')}\n</jobs>\n`;
}

function save(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJobs(format: ExportFormat, rows: Row[]) {
  const name = `jobsmatchnow-jobs-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'xlsx') downloadXlsx(`${name}.xlsx`, 'Jobs', [[...COLUMNS], ...rows.map((row) => COLUMNS.map((c) => row[c] as Cell))]);
  else if (format === 'csv') save(`${name}.csv`, `﻿${toCsv(rows)}`, 'text/csv;charset=utf-8'); // BOM: Excel opens UTF-8 correctly
  else if (format === 'json') save(`${name}.json`, toJson(rows), 'application/json');
  else save(`${name}.xml`, toXml(rows), 'application/xml');
}
