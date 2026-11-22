// Reports: KPIs per target role (candidates) or per job (recruiters), skill gaps with a
// Coursera search per skill, and recruiter feedback. Real records only.
import { ExternalLink, GraduationCap, MessageSquareQuote, Target } from 'lucide-react';
import type { Bootstrap } from '../../types';
import { isInterviewing, recruiterFeedback, roleKpis, scoreOf, skillGaps } from '../../lib/report';
import { columnOf } from './RecruiterSections';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export function CandidateReport({ data }: { data: Bootstrap }) {
  const rows = roleKpis(data);
  const gaps = skillGaps(data);
  const feedback = recruiterFeedback(data);
  return <>
    <section className="rp-card">
      <header><Target size={18} /><div><strong>KPIs per target role</strong><small>How each role you search for is going.</small></div></header>
      <div className="rp-table-wrap"><table className="rp-table">
        <thead><tr><th>Target role</th><th>Open roles</th><th>Recruiters like you</th><th>Matches</th><th>In conversation</th><th>Interviewing</th><th>Avg. fit</th><th>Top skill gap</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.role}>
          <td><strong>{r.role}</strong></td><td>{r.roles}</td><td>{r.likedYou}</td><td>{r.matches}</td>
          <td>{r.inConversation} <small>{pct(r.inConversation, r.matches)}</small></td><td>{r.interviewing}</td>
          <td>{r.avgFit !== undefined ? `${r.avgFit}%` : '—'}</td><td>{r.topGap || '—'}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="rp-card">
      <header><GraduationCap size={18} /><div><strong>Skill gaps</strong><small>Skills the roles ask for that your profile doesn't list yet, most requested first.</small></div></header>
      {gaps.length ? <ul className="rp-gaps">{gaps.map((g) => <li key={g.skill}>
        <div><strong>{g.skill}</strong><small>Asked in {g.roles} {g.roles === 1 ? 'role' : 'roles'}{g.examples.length ? ` · e.g. ${g.examples.join(', ')}` : ''}</small></div>
        <a href={g.course} target="_blank" rel="noopener noreferrer" className="rp-course">Courses on Coursera <ExternalLink size={13} /></a>
      </li>)}</ul> : <p className="tp-muted">No skill gaps found in the roles you see right now.</p>}
      <p className="rp-note">Links open a Coursera search for the skill. Already know it? Add it to your profile so the fit score counts it.</p>
    </section>
    <section className="rp-card">
      <header><MessageSquareQuote size={18} /><div><strong>Recruiter feedback</strong><small>What hiring teams told you after a match.</small></div></header>
      {feedback.length ? <ul className="rp-feedback">{feedback.map((f, i) => <li key={i}><blockquote>“{f.text}”</blockquote><small>{f.from}{f.company ? `, ${f.company}` : ''}{f.role ? ` · ${f.role}` : ''} · {new Date(f.at).toLocaleDateString()}</small></li>)}</ul>
        : <p className="tp-muted">No feedback yet. Teams can send it from the conversation after a call.</p>}
    </section>
  </>;
}

/** Per-role KPIs for a recruiter (shared by the Reports table and the downloadable report). */
export function recruiterRoleRows(data: Bootstrap) {
  const mine = data.matches.filter((m) => m.employerId === data.viewer.id);
  const likersByJob = new Map((data.roleMatches || []).map((g) => [g.job.id, g.candidates.length]));
  return data.jobs.filter((j) => j.employerId === data.viewer.id).map((j) => {
    const ms = mine.filter((m) => m.jobId === j.id);
    const fits = ms.map((m) => scoreOf(m, data)).filter((s): s is number => typeof s === 'number');
    return {
      id: j.id, role: j.title, likers: likersByJob.get(j.id) ?? 0, matches: ms.length,
      inConversation: ms.filter((m) => data.messages.some((msg) => msg.matchId === m.id)).length,
      interviewing: ms.filter((m) => isInterviewing(m) && columnOf(m) === 'interviewing').length,
      offer: ms.filter((m) => columnOf(m) === 'offer').length, hired: ms.filter((m) => columnOf(m) === 'hired').length,
      avgFit: fits.length ? Math.round(fits.reduce((a, b) => a + b, 0) / fits.length) : undefined,
    };
  });
}

export function RecruiterReport({ data }: { data: Bootstrap }) {
  return <section className="rp-card">
    <header><Target size={18} /><div><strong>KPIs per role</strong><small>How each of your roles is converting.</small></div></header>
    <div className="rp-table-wrap"><table className="rp-table">
      <thead><tr><th>Role</th><th>Candidates like it</th><th>Matches</th><th>In conversation</th><th>Interviewing</th><th>Offer</th><th>Hired</th><th>Avg. fit</th></tr></thead>
      <tbody>{recruiterRoleRows(data).map((r) => <tr key={r.id}>
        <td><strong>{r.role}</strong></td><td>{r.likers}</td><td>{r.matches}</td><td>{r.inConversation}</td>
        <td>{r.interviewing}</td><td>{r.offer}</td><td>{r.hired}</td><td>{r.avgFit !== undefined ? `${r.avgFit}%` : '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

const csvCell = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** The Reports page as a CSV file: summary, per-role KPIs, and (candidates) skill gaps + recruiter feedback. */
export function reportCsv(role: 'candidate' | 'employer', data: Bootstrap, summary: [string, string | number][]) {
  const lines: unknown[][] = [];
  lines.push(['JobsMatchNow report', role === 'candidate' ? 'Job search insights' : 'Hiring insights']);
  lines.push(['Member', data.viewer.name]);
  lines.push(['Generated', new Date().toISOString().slice(0, 16).replace('T', ' ')]);
  lines.push([]); lines.push(['Summary']); summary.forEach((row) => lines.push(row));
  lines.push([]);
  if (role === 'candidate') {
    lines.push(['KPIs per target role']);
    lines.push(['Target role', 'Open roles', 'Recruiters like you', 'Matches', 'In conversation', 'Interviewing', 'Avg. fit', 'Top skill gap']);
    roleKpis(data).forEach((r) => lines.push([r.role, r.roles, r.likedYou, r.matches, r.inConversation, r.interviewing, r.avgFit !== undefined ? `${r.avgFit}%` : '', r.topGap || '']));
    lines.push([]); lines.push(['Skill gaps']); lines.push(['Skill', 'Asked in roles', 'Examples', 'Coursera search']);
    skillGaps(data).forEach((g) => lines.push([g.skill, g.roles, g.examples.join('; '), g.course]));
    lines.push([]); lines.push(['Recruiter feedback']); lines.push(['Date', 'From', 'Company', 'Role', 'Feedback']);
    recruiterFeedback(data).forEach((f) => lines.push([new Date(f.at).toISOString().slice(0, 10), f.from, f.company || '', f.role || '', f.text]));
  } else {
    lines.push(['KPIs per role']);
    lines.push(['Role', 'Candidates like it', 'Matches', 'In conversation', 'Interviewing', 'Offer', 'Hired', 'Avg. fit']);
    recruiterRoleRows(data).forEach((r) => lines.push([r.role, r.likers, r.matches, r.inConversation, r.interviewing, r.offer, r.hired, r.avgFit !== undefined ? `${r.avgFit}%` : '']));
  }
  return lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
