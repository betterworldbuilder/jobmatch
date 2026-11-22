// Recruiter "Hired Results": every candidate this recruiter hired (matches in the Hired stage), with
// time to hire and fit, plus Excel (.xlsx) and PDF (print) export. Real records only.
import { BadgeCheck, Clock3, Download, FileSpreadsheet, Target, Trophy } from 'lucide-react';
import type { Bootstrap } from '../../types';
import { scoreOf } from '../../lib/report';
import { timeline } from '../../lib/hiringStages';
import { downloadXlsx } from '../../lib/xlsx';

const DAY = 86400000;
const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '');

export function hiredRows(data: Bootstrap) {
  return data.matches
    .filter((m) => m.employerId === data.viewer.id && m.stage === 'Hired')
    .map((m) => {
      const hiredAt = m.stageChangedAt || m.createdAt;
      const fit = scoreOf(m, data);
      return {
        id: m.id, candidate: m.candidate?.name || 'Candidate', title: m.candidate?.title || '', role: m.job?.title || '',
        location: [m.candidate?.city, m.candidate?.country].filter(Boolean).join(', ') || m.candidate?.location || '',
        matchedAt: m.createdAt, hiredAt, daysToHire: Math.max(0, Math.round((hiredAt - m.createdAt) / DAY)),
        rounds: timeline(m).rounds, fit, photo: m.candidate?.photo, email: m.candidate?.email,
      };
    })
    .sort((a, b) => b.hiredAt - a.hiredAt);
}

export function HiredResults({ data, onOpenMessages }: { data: Bootstrap; onOpenMessages: (matchId: string) => void }) {
  const rows = hiredRows(data);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);
  const avgDays = avg(rows.map((r) => r.daysToHire));
  const avgFit = avg(rows.map((r) => r.fit).filter((f): f is number => typeof f === 'number'));
  const exportXlsx = () => downloadXlsx(`jobsmatchnow-hired-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Hired results', [
    ['Candidate', 'Current title', 'Hired for role', 'Location', 'Matched on', 'Hired on', 'Days to hire', 'Interview rounds', 'Fit %', 'Email'],
    ...rows.map((r) => [r.candidate, r.title, r.role, r.location, day(r.matchedAt), day(r.hiredAt), r.daysToHire, r.rounds, r.fit ?? '', r.email || '']),
  ]);
  return <div className="page report-page hired-page">
    <div className="page-title"><div><span className="overline">Hiring history</span><h1>Hired Results</h1><p>Every candidate you hired on JobsMatchNow, newest first.</p></div>
      <div className="report-actions no-print">
        <button className="secondary-button small" onClick={exportXlsx} disabled={!rows.length}><FileSpreadsheet size={15} /> Export Excel</button>
        <button className="secondary-button small" onClick={() => window.print()} disabled={!rows.length}><Download size={15} /> Save as PDF</button>
      </div></div>
    <div className="analytics-grid">
      <article className="metric"><span><Trophy size={13} /> Hires</span><strong>{rows.length}</strong><small>all time</small></article>
      <article className="metric"><span><Clock3 size={13} /> Average time to hire</span><strong>{avgDays !== undefined ? `${avgDays} days` : '—'}</strong><small>from match to hired</small></article>
      <article className="metric"><span><Target size={13} /> Average fit</span><strong>{avgFit !== undefined ? `${avgFit}%` : '—'}</strong><small>of hired candidates</small></article>
    </div>
    <section className="rp-card">
      <header><BadgeCheck size={18} /><div><strong>Hired candidates</strong><small>Marked Hired on Hiring Stages. Opening a row takes you to the conversation.</small></div></header>
      {rows.length ? <div className="rp-table-wrap"><table className="rp-table">
        <thead><tr><th>Candidate</th><th>Hired for</th><th>Location</th><th>Matched</th><th>Hired</th><th>Days to hire</th><th>Rounds</th><th>Fit</th><th className="no-print" /></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}>
          <td><span className="hr-who">{r.photo ? <img src={r.photo} alt="" /> : null}<span><strong>{r.candidate}</strong><small>{r.title}</small></span></span></td>
          <td>{r.role}</td><td>{r.location}</td><td>{day(r.matchedAt)}</td><td>{day(r.hiredAt)}</td><td>{r.daysToHire}</td><td>{r.rounds}</td><td>{r.fit !== undefined ? `${r.fit}%` : '—'}</td>
          <td className="no-print"><button className="text-button" onClick={() => onOpenMessages(r.id)}>Open chat</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="tp-muted">No hires yet. Mark a candidate as Hired on Hiring Stages and they appear here.</p>}
    </section>
  </div>;
}
