// "Update roles" (founder, 2026-11-26): the JobFinder account picks Scrapy's folder (data/inbox-linkedin) and
// JobsMatchNow imports the new job files as JobFinder drafts.
// Duplicates are stopped three times: the CSV's own import_status, the email_date newer than the last import (with
// the links already listed), and the server's duplicate guardrail (same link, or same title + company + location).
import { useRef, useState } from 'react';
import { FolderSync, Loader2 } from 'lucide-react';
import { jf } from '../../api';

type Row = Record<string, string>;
type Plan = { fresh: { row: Row; file: File }[]; older: { row: Row; file: File }[]; known: number; noFile: number; lastEmailDate: string | null };

/** Minimal RFC 4180 CSV parser (quotes, doubled quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): Row[] {
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  const [head, ...rest] = out.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, '').trim(), (r[i] || '').trim()])));
}

/** Same rule as the server (jobfinder.js sourceKey): one LinkedIn job = one key, whatever the URL form. */
export function sourceKey(u: string) {
  const s = String(u || '').trim();
  const li = s.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i);
  if (li) return `linkedin:${li[1]}`;
  try { const x = new URL(s); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase(); } catch { return s.toLowerCase(); }
}

const base = (p: string) => p.split(/[\\/]/).pop() || p;
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export function UpdateRolesButton({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; created: number; duplicate: number; failed: number } | null>(null);
  const stop = useRef(false);

  const pick = async (files: FileList | null) => {
    setMsg(''); setPlan(null); setProgress(null);
    if (!files?.length) return;
    const list = Array.from(files);
    // linkjobs.csv (LinkedIn alerts, has email dates) and/or careerjobs.csv (career sites): pick jobsmatchnow-team/data
    // for both, or one of their folders.
    const csvs = list.filter((f) => ['linkjobs.csv', 'careerjobs.csv'].includes(base(f.name)));
    if (!csvs.length) { setMsg('No linkjobs.csv or careerjobs.csv in that folder. Choose jobsmatchnow-team/data.'); return; }
    setBusy(true);
    try {
      const state = await jf.importState();
      const known = new Set(state.knownKeys);
      const byName = new Map(list.filter((f) => f.name.endsWith('.jobsmatchnow.json')).map((f) => [base(f.name), f]));
      const p: Plan = { fresh: [], older: [], known: 0, noFile: 0, lastEmailDate: state.lastEmailDate };
      for (const csv of csvs) {
        const career = base(csv.name) === 'careerjobs.csv';
        for (const row of parseCsv(await csv.text())) {
          if (row.scrape_status !== 'ok') continue;
          if (['created', 'duplicate'].includes(row.import_status || '') || known.has(sourceKey(row.url))) { p.known += 1; continue; }
          const file = row.job_file ? byName.get(base(row.job_file)) : undefined;
          if (!file) { p.noFile += 1; continue; }
          // Career-site rows have no email date: new by link only. LinkedIn rows: newer than the last imported email.
          (career || !state.lastEmailDate || (row.email_date || '') >= state.lastEmailDate ? p.fresh : p.older).push({ row, file });
        }
      }
      setPlan(p);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not read the folder'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  const run = async (items: Plan['fresh']) => {
    stop.current = false; setBusy(true);
    const pr = { done: 0, total: items.length, created: 0, duplicate: 0, failed: 0 };
    setProgress({ ...pr });
    for (const { row, file } of items) {
      if (stop.current) break;
      try {
        const doc = JSON.parse(await file.text());
        const job = Array.isArray(doc?.jobs) ? doc.jobs[0] : doc;
        const r = await jf.importFiles({ jobs: [job], emailDate: row.email_date || undefined }); // careerjobs rows: no email_date
        pr.created += r.created; pr.duplicate += r.duplicate; pr.failed += r.failed;
      } catch (e) {
        pr.failed += 1;
        if (e instanceof Error && /too many|429/i.test(e.message)) { await sleep(60000); }
      }
      pr.done += 1; setProgress({ ...pr });
      await sleep(2100); // stays under the JobFinder limit of 30 calls a minute
    }
    setBusy(false); setPlan(null); onDone();
  };

  return <>
    <button type="button" className="td-update-roles" onClick={() => input.current?.click()} disabled={busy} title="Import new jobs from Scrapy's folder (pick jobsmatchnow-team/data: LinkedIn alerts + career sites) as JobFinder drafts">
      {busy && !progress ? <Loader2 size={13} className="spin" /> : <FolderSync size={13} />} Update roles
    </button>
    {/* webkitdirectory: the browser lets the user pick a whole folder (Chrome, Edge, Firefox, Safari on desktop). */}
    <input ref={input} type="file" hidden multiple {...{ webkitdirectory: '', directory: '' }} onChange={(e) => void pick(e.target.files)} />
    {(plan || progress || msg) && <div className="ur-panel" role="status">
      {msg && <p className="ur-error">{msg}</p>}
      {plan && !progress && <>
        <p><b>{plan.fresh.length}</b> new {plan.fresh.length === 1 ? 'job' : 'jobs'}{plan.lastEmailDate ? <> from emails since <b>{plan.lastEmailDate}</b></> : ''} · {plan.known} already listed · {plan.older.length} older not imported{plan.noFile ? ` · ${plan.noFile} without a job file` : ''}</p>
        <div className="ur-actions">
          <button type="button" className="primary-button small" disabled={!plan.fresh.length} onClick={() => void run(plan.fresh)}>Import {plan.fresh.length} as drafts</button>
          {plan.older.length > 0 && <button type="button" className="secondary-button small" onClick={() => void run([...plan.fresh, ...plan.older])}>Include older ({plan.fresh.length + plan.older.length})</button>}
          <button type="button" className="text-button" onClick={() => setPlan(null)}>Cancel</button>
        </div>
      </>}
      {progress && <>
        <p>{progress.done < progress.total && busy ? <Loader2 size={13} className="spin" /> : null} {progress.done} / {progress.total} · <b>{progress.created}</b> added as drafts · {progress.duplicate} duplicates skipped · {progress.failed} failed</p>
        <div className="ur-actions">
          {busy ? <button type="button" className="text-button" onClick={() => { stop.current = true; }}>Stop</button>
            : <><span className="muted">Review and publish them in JobFinder listings.</span><button type="button" className="text-button" onClick={() => setProgress(null)}>Close</button></>}
        </div>
      </>}
    </div>}
  </>;
}
