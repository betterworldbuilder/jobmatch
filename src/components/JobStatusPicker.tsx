// The member's job status: Open to work · Waiting for offer · Pending contract signing ·
// I just got hired! · Under contract till <date>. Signing / hired / contract name the role
// and the recruiter, picked from the member's matches (linked to that conversation) or typed.
// Private: the server never sends jobStatus to other members.
import { useState } from 'react';
import { Briefcase, Loader2, Lock, User } from 'lucide-react';
import { api } from '../api';
import type { JobMatch, JobStatus, JobStatusKind, Person } from '../types';

type Kind = JobStatusKind;
export const JOB_STATUS_LABEL: Record<Kind, string> = { open: 'Open to work', waiting: 'Waiting for offer', signing: 'Pending contract signing', hired: 'I just got hired!', contract: 'Under contract' };
const COLOR: Record<Kind, string> = { open: '#22c55e', waiting: '#f59e0b', signing: '#fb7185', hired: '#3ea6ff', contract: '#a78bfa' };
const WITH_JOB = (k: Kind) => k === 'signing' || k === 'hired' || k === 'contract';
const OTHER = '__other';

function niceDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Under contract till Mar 31, 2027" / "I just got hired!" (label only, no role). */
export function jobStatusText(s?: JobStatus) {
  if (!s) return JOB_STATUS_LABEL.open;
  if (s.kind === 'contract' && s.until) return `Under contract till ${niceDate(s.until)}`;
  return JOB_STATUS_LABEL[s.kind] || JOB_STATUS_LABEL.open;
}

const recruiterOf = (m: JobMatch) => m.employer?.name || m.job?.recruiter?.name || '';
const roleOf = (m: JobMatch) => m.job?.title || '';

/** Status + role + recruiter; role and recruiter open the conversation when the match is known. */
export function JobStatusLine({ s, matches = [], onOpen }: { s?: JobStatus; matches?: JobMatch[]; onOpen?: (matchId: string) => void }) {
  const kind = s?.kind || 'open';
  const linked = s?.matchId && onOpen && matches.some((m) => m.id === s.matchId) ? s.matchId : undefined;
  const role = s?.role ? `${s.role}${s.company ? ` at ${s.company}` : ''}` : '';
  const piece = (text: string, icon: React.ReactNode, label: string) => linked
    ? <button type="button" className="jsl-link" onClick={() => onOpen!(linked)} title={`Open the conversation about ${label}`}>{icon}{text}</button>
    : <span className="jsl-text">{icon}{text}</span>;
  return <span className={`jsl st-${kind}`} style={{ ['--st' as string]: COLOR[kind] }}>
    <b className="jsl-kind"><i aria-hidden="true" />{jobStatusText(s)}</b>
    {WITH_JOB(kind) && role && piece(role, <Briefcase size={12} />, role)}
    {WITH_JOB(kind) && s?.recruiter && piece(s.recruiter, <User size={12} />, s.recruiter)}
  </span>;
}

export function JobStatusPicker({ viewer, matches = [], onSaved, variant = 'sidebar', onOpen }: {
  viewer: Person; matches?: JobMatch[]; onSaved: (viewer: Person) => void; variant?: 'sidebar' | 'card'; onOpen?: (matchId: string) => void;
}) {
  const current: JobStatus = viewer.jobStatus || { kind: viewer.privacy?.openToWork === false ? 'waiting' : 'open' };
  const [st, setSt] = useState<JobStatus>(current);
  const [pick, setPick] = useState(current.matchId && matches.some((m) => m.id === current.matchId) ? current.matchId : current.role ? OTHER : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async (next: JobStatus) => {
    setSt(next); setSaved(false);
    if (next.kind === 'contract' && !next.until) return; // wait for the date
    setBusy(true); setError('');
    const jobStatus: JobStatus = WITH_JOB(next.kind)
      ? { kind: next.kind, ...(next.kind === 'contract' ? { until: next.until } : {}), ...(next.role ? { role: next.role } : {}), ...(next.company ? { company: next.company } : {}), ...(next.recruiter ? { recruiter: next.recruiter } : {}), ...(next.matchId ? { matchId: next.matchId } : {}) }
      : { kind: next.kind };
    try {
      await api.updateProfile(viewer.id, { jobStatus });
      onSaved({ ...viewer, jobStatus, privacy: { ...(viewer.privacy || {}), openToWork: next.kind === 'open' } });
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };

  const choose = (value: string) => {
    setPick(value);
    if (value === OTHER || value === '') { void save({ ...st, matchId: undefined, ...(value === '' ? { role: undefined, company: undefined, recruiter: undefined } : {}) }); return; }
    const m = matches.find((x) => x.id === value); if (!m) return;
    void save({ ...st, matchId: m.id, role: roleOf(m), company: m.job?.company, recruiter: recruiterOf(m) });
  };

  const showJob = WITH_JOB(st.kind);
  return <div className={`job-status js-${variant}`} style={{ ['--st' as string]: COLOR[st.kind] }}>
    {variant === 'card' && <header className="js-card-head"><span className="overline">My job status</span><small><Lock size={11} /> Only you see this</small></header>}
    <label><span className="js-label">Status</span>
      <span className="js-row"><i className="js-dot" aria-hidden="true" />
        <select value={st.kind} disabled={busy} aria-label="My job status" onChange={(e) => void save({ ...st, kind: e.target.value as Kind })}>
          {(Object.keys(JOB_STATUS_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{JOB_STATUS_LABEL[k]}</option>)}
        </select>
        {busy && <Loader2 size={13} className="spin" />}
      </span>
    </label>
    {st.kind === 'contract' && <label className="js-until"><span>till</span>
      <input type="date" value={st.until || ''} onChange={(e) => void save({ ...st, until: e.target.value })} aria-label="Contract end date" /></label>}
    {showJob && <label className="js-field"><span className="js-label">Role</span>
      <select value={pick} aria-label="Role" onChange={(e) => choose(e.target.value)}>
        <option value="">{matches.length ? 'Pick the role from your matches' : 'No matches yet'}</option>
        {matches.map((m) => <option key={m.id} value={m.id}>{roleOf(m)}{m.job?.company ? ` · ${m.job.company}` : ''}{recruiterOf(m) ? ` (${recruiterOf(m)})` : ''}</option>)}
        <option value={OTHER}>Not listed: type it</option>
      </select></label>}
    {showJob && pick === OTHER && <div className="js-typed">
      <input value={st.role || ''} placeholder="Role, e.g. Lead AI Engineer" aria-label="Role title" maxLength={80} onChange={(e) => setSt({ ...st, role: e.target.value })} onBlur={() => void save(st)} />
      <input value={st.recruiter || ''} placeholder="Recruiter name" aria-label="Recruiter name" maxLength={80} onChange={(e) => setSt({ ...st, recruiter: e.target.value })} onBlur={() => void save(st)} />
    </div>}
    {variant === 'card' && <p className="js-preview"><JobStatusLine s={st} matches={matches} onOpen={onOpen} /></p>}
    {variant === 'card' && saved && !error && <small className="js-ok">Saved</small>}
    {error && <small className="js-err">{error}</small>}
  </div>;
}
