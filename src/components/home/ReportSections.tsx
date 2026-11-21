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

export function RecruiterReport({ data }: { data: Bootstrap }) {
  const mine = data.matches.filter((m) => m.employerId === data.viewer.id);
  const jobs = data.jobs.filter((j) => j.employerId === data.viewer.id);
  const likersByJob = new Map((data.roleMatches || []).map((g) => [g.job.id, g.candidates.length]));
  return <section className="rp-card">
    <header><Target size={18} /><div><strong>KPIs per role</strong><small>How each of your roles is converting.</small></div></header>
    <div className="rp-table-wrap"><table className="rp-table">
      <thead><tr><th>Role</th><th>Candidates like it</th><th>Matches</th><th>In conversation</th><th>Interviewing</th><th>Offer</th><th>Hired</th><th>Avg. fit</th></tr></thead>
      <tbody>{jobs.map((j) => {
        const ms = mine.filter((m) => m.jobId === j.id);
        const fits = ms.map((m) => scoreOf(m, data)).filter((s): s is number => typeof s === 'number');
        return <tr key={j.id}>
          <td><strong>{j.title}</strong></td><td>{likersByJob.get(j.id) ?? 0}</td><td>{ms.length}</td>
          <td>{ms.filter((m) => data.messages.some((msg) => msg.matchId === m.id)).length}</td>
          <td>{ms.filter((m) => isInterviewing(m) && columnOf(m) === 'interviewing').length}</td>
          <td>{ms.filter((m) => columnOf(m) === 'offer').length}</td><td>{ms.filter((m) => columnOf(m) === 'hired').length}</td>
          <td>{fits.length ? `${Math.round(fits.reduce((a, b) => a + b, 0) / fits.length)}%` : '—'}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </section>;
}
