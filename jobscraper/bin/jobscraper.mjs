#!/usr/bin/env node
// CLI: turn job links or job text into job roles (JSON or CSV).
//   node bin/jobscraper.mjs <https://…|job.txt> [-o out.json|out.csv]
//   node bin/jobscraper.mjs --list links.txt -o roles.csv     (a list: group headings + links, one role per row)
// Links go through the same safety rules as the web UI (robots.txt, blocked sites, no private networks).
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePosted } from '../lib/parse.mjs';
import { scrapeUrl } from '../lib/fetch.mjs';
import { exportFile } from '../lib/store.mjs';
import { parseLinkList } from '../lib/batch.mjs';
import { rowOf, toCsv, toImportCsv } from '../lib/csv.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('-o');
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const isList = args.includes('--list');
// --allow-linkedin: read LinkedIn's public job pages (signed out, slow; against LinkedIn's terms: owner's choice).
const allowLinkedIn = args.includes('--allow-linkedin') || process.env.JOBSCRAPER_ALLOW_LINKEDIN === '1';
const target = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-o');
if (!target) { console.error('Usage: node bin/jobscraper.mjs <url|job.txt> [-o out.json|out.csv]\n       node bin/jobscraper.mjs --list links.txt -o roles.csv'); process.exit(2); }
const csv = Boolean(outFile && /\.csv$/i.test(outFile));
// --jobsmatchnow: the CSV JobsMatchNow's importer reads (id,title,location,employment_type,work_mode,salary,url,
// description), ≤ 50 roles per file: out.csv, out-part2.csv, …
const forImport = args.includes('--jobsmatchnow');
function writeImport(jobs) {
  const { parts, included, skipped } = toImportCsv(jobs);
  if (!parts.length) { console.error('Nothing to import: no role has a job description yet.'); return; }
  if (!outFile) { process.stdout.write(parts.join('')); return; }
  parts.forEach((text, i) => { const f = i === 0 ? outFile : outFile.replace(/(\.csv)?$/i, `-part${i + 1}.csv`); writeFileSync(f, text); console.error(`Saved ${f}`); });
  console.error(`${included} role(s) in the import file${skipped.length ? ` · ${skipped.length} left out (no job description)` : ''}`);
}
const write = (text) => { if (outFile) { writeFileSync(outFile, text); console.error(`Saved ${outFile}`); } else process.stdout.write(text); };

if (isList) {
  const { items, duplicates, invalid } = parseLinkList(readFileSync(target, 'utf8'));
  const rows = []; const jobs = [];
  for (const [n, it] of items.entries()) {
    const item = { url: it.url, groups: it.groups, site: it.site, status: 'needs-text' };
    if (!it.site || (it.site === 'LinkedIn' && allowLinkedIn)) {
      let r = await scrapeUrl(it.url, { allowLinkedIn });
      // A refusal is often momentary (LinkedIn's 999 / rate limit): one retry after a pause, never more.
      if (!r.ok && ['restricted', 'fetch'].includes(r.code)) { await new Promise((res) => setTimeout(res, 10000)); r = await scrapeUrl(it.url, { allowLinkedIn }); }
      if (r.ok) { r.job.jobGroups = [...new Set(it.groups.map((g) => g.id).filter(Boolean))]; jobs.push(r.job); rows.push(rowOf(r.job, { ...item, status: 'ready' })); }
      else rows.push(rowOf({}, { ...item, status: 'needs-text' }));
      if (n < items.length - 1) await new Promise((res) => setTimeout(res, 1500)); // one page at a time
    } else rows.push(rowOf({}, item));
    console.error(`${n + 1}/${items.length} ${rows.at(-1).status.padEnd(10)} ${it.url}`);
  }
  if (forImport) {
    writeImport(jobs);
    // Same pass, no second request: every role with all fields (including links not read) next to the import file.
    if (outFile) { const all = outFile.replace(/(\.csv)?$/i, '-all-fields.csv'); writeFileSync(all, toCsv(rows)); console.error(`Saved ${all}`); }
  } else write(csv ? toCsv(rows) : JSON.stringify(exportFile(jobs), null, 2));
  const needText = rows.filter((r) => r.status === 'needs-text').length;
  console.error(`${items.length} roles · ${items.length - needText} read · ${needText} need pasted text${allowLinkedIn ? '' : ' (LinkedIn is read only with --allow-linkedin)'}${duplicates.length ? ` · ${duplicates.length} duplicate link(s) removed` : ''}${invalid.length ? ` · ${invalid.length} line(s) ignored` : ''}`);
  process.exit(0);
}

let jobs;
if (/^https?:\/\//i.test(target)) {
  const r = await scrapeUrl(target, { allowLinkedIn });
  if (!r.ok) { console.error(`Not imported: ${r.message}\nTip: save the job text to a file and run: node bin/jobscraper.mjs job.txt`); process.exit(1); }
  jobs = [r.job];
} else {
  jobs = parsePosted({ text: readFileSync(target, 'utf8'), method: 'text file' }); // a post with several roles → one job each
}
if (forImport) writeImport(jobs);
else write(csv ? toCsv(jobs.map((j) => rowOf(j))) : JSON.stringify(exportFile(jobs), null, 2));
if (jobs.length > 1) console.error(`${jobs.length} roles in this text: ${jobs.map((j) => j.title).join(' · ')}`);
else {
  if (jobs[0].review.check.length) console.error(`Check: ${jobs[0].review.check.join(', ')}`);
  if (jobs[0].review.notProvided.length) console.error(`Not provided: ${jobs[0].review.notProvided.join(', ')}`);
}
