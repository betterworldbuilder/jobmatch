// Outreach dashboard + recruiter contact book (JobFinder account, founder 2026-11-26).
// Roles: applicants → cold email → follow-up (24 h) → opened / viewed → claimed → recruiter answered.
// Recruiters: one row per recruiter email, all their roles. "Hot" = opened but not claimed: call them first.
import { useEffect, useMemo, useState } from 'react';
import { Flame, Mail, RefreshCw, Search } from 'lucide-react';
import { jf } from '../../api';
import type { OutreachReport } from '../../types';

const day = (t: number | null) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');

export function OutreachPage() {
  const [r, setR] = useState<OutreachReport | null>(null);
  const [tab, setTab] = useState<'roles' | 'recruiters'>('roles');
  const [q, setQ] = useState('');
  const [hotOnly, setHotOnly] = useState(false);
  const [error, setError] = useState('');
  const load = () => { setError(''); jf.outreach().then(setR).catch((e) => setError(e instanceof Error ? e.message : 'Could not load')); };
  useEffect(load, []);
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const roles = useMemo(() => (r?.roles || []).filter((x) => (!hotOnly || x.hot) && (!q || match(`${x.title} ${x.company || ''} ${x.recruiterName} ${x.recruiterEmail}`))), [r, q, hotOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const recruiters = useMemo(() => (r?.recruiters || []).filter((x) => (!hotOnly || x.hot) && (!q || match(`${x.email} ${x.names.join(' ')} ${x.companies.join(' ')}`))), [r, q, hotOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <main className="page or-page"><p className="err">{error}</p></main>;
  if (!r) return <main className="page or-page"><p className="muted">Loading outreach…</p></main>;
  const t = r.totals;
  return <main className="page or-page">
    <div className="page-title"><div><span className="overline">JobFinder · Stage 1</span><h1>Outreach</h1>
      <p>Imported roles and their recruiters: who got a cold email, who opened, who claimed. Call the hot ones first.</p></div>
      <button type="button" className="secondary-button small" onClick={load}><RefreshCw size={13} /> Refresh</button></div>
    <div className="or-funnel">
      {[['Roles', t.roles], ['With recruiter email', t.withEmail], ['Applicants', t.applicants], ['Cold emails', t.coldSent], ['Follow-ups', t.followups], ['Opened', t.opened], ['Claimed', t.claimed], ['Answered', t.answered]]
        .map(([l, n]) => <span key={String(l)}><b>{n}</b>{l}</span>)}
    </div>
    {t.hot > 0 && <p className="or-hot-note"><Flame size={14} /> <b>{t.hot}</b> role(s) opened by their recruiter but not claimed yet: call or message them today.</p>}
    <div className="or-tools">
      <div className="or-tabs"><button type="button" className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Roles ({r.roles.length})</button>
        <button type="button" className={tab === 'recruiters' ? 'on' : ''} onClick={() => setTab('recruiters')}>Recruiters ({r.recruiters.length})</button></div>
      <label className="or-search"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Role, company, recruiter, email" /></label>
      <label className="or-check"><input type="checkbox" checked={hotOnly} onChange={(e) => setHotOnly(e.target.checked)} /> Hot only</label>
    </div>
    {tab === 'roles' ? <div className="or-table-wrap"><table className="or-table">
      <thead><tr><th>Role</th><th>Recruiter</th><th>Applicants</th><th>Cold email</th><th>Follow-up</th><th>Opened</th><th>Claimed</th><th>Answered</th></tr></thead>
      <tbody>{roles.map((x) => <tr key={x.id} className={x.hot ? 'hot' : ''}>
        <td><strong>{x.hot && <Flame size={12} />} {x.title}</strong><small>{[x.company, x.location].filter(Boolean).join(' · ')}{x.live ? '' : ' · not live'}</small></td>
        <td>{x.recruiterEmail ? <><a href={`mailto:${x.recruiterEmail}`}><Mail size={11} /> {x.recruiterName || x.recruiterEmail}</a>{x.recruiterName && <small>{x.recruiterEmail}</small>}{x.unsubscribed && <small className="err">unsubscribed</small>}</> : <small className="muted">no email</small>}</td>
        <td>{x.applicants}</td>
        <td>{x.coldSent ? `${x.coldSent} · ${day(x.lastSentAt)}` : x.notSent ? <small className="muted">{x.notSent} not sent</small> : '—'}</td>
        <td>{x.followupSentAt ? day(x.followupSentAt) : '—'}</td>
        <td>{x.opens || x.viewed ? `${x.opens ? `${x.opens} page view(s)` : ''}${x.opens && x.viewed ? ' · ' : ''}${x.viewed ? `${x.viewed} profile(s) viewed` : ''}` : '—'}</td>
        <td>{x.claimed ? <span className="or-yes">Claimed</span> : '—'}</td>
        <td>{x.answered || '—'}</td>
      </tr>)}</tbody></table>{!roles.length && <p className="muted">Nothing here yet.</p>}</div>
      : <div className="or-table-wrap"><table className="or-table">
        <thead><tr><th>Recruiter</th><th>Company</th><th>Roles</th><th>Applicants</th><th>Emails</th><th>Opened</th><th>Claimed</th><th>Last email</th></tr></thead>
        <tbody>{recruiters.map((x) => <tr key={x.email} className={x.hot ? 'hot' : ''}>
          <td><strong>{x.hot && <Flame size={12} />} {x.names[0] || x.email}</strong><small><a href={`mailto:${x.email}`}>{x.email}</a>{x.unsubscribed ? ' · unsubscribed' : ''}</small></td>
          <td>{x.companies.join(', ') || '—'}</td>
          <td><span title={x.roles.map((r2) => r2.title).join('\n')}>{x.roles.length}</span><small>{x.roles.slice(0, 2).map((r2) => r2.title).join(' · ')}{x.roles.length > 2 ? ' …' : ''}</small></td>
          <td>{x.applicants}</td>
          <td>{x.coldSent}{x.followups ? ` + ${x.followups} follow-up` : ''}</td>
          <td>{x.opens || x.viewed ? 'Yes' : '—'}</td>
          <td>{x.claimed ? `${x.claimed} / ${x.roles.length}` : '—'}</td>
          <td>{day(x.lastSentAt)}</td>
        </tr>)}</tbody></table>{!recruiters.length && <p className="muted">No recruiter emails yet.</p>}</div>}
  </main>;
}
