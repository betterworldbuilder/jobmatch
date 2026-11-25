// "Applications (likes)" for recruiters and "Jobs Applied (liked)" for candidates (founder, 2026-11-25), on phone
// and desktop, with "All roles" or one role chosen at the top. Recruiters: candidates who applied to each of their
// roles (Like back / Message). Candidates: every job they applied to, grouped by their target roles, with its state.
import { useMemo, useState } from 'react';
import { Briefcase, Check, Heart, Inbox, Linkedin, MapPin, MessageCircle, Send, Star } from 'lucide-react';
import { api, JOBFINDER_OPEN_EVENT } from '../../api';
import type { Bootstrap, Person, View } from '../../types';
import { roleFor } from '../../lib/report';
import { outreachText } from '../jobfinder/JobFinder';
import { DashboardTitle } from './MatchHome';

export const OPEN_JOB_EVENT = 'jmn:open-job';
type Props = { data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void; onOpenMessages?: (matchId: string) => void; compact?: boolean };
const fmt = (t?: number) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

function RolePicker({ options, value, onChange, label }: { options: { key: string; label: string; n: number }[]; value: string; onChange: (v: string) => void; label: string }) {
  const total = options.reduce((s, o) => s + o.n, 0);
  return <label className="ap-picker"><span>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">All roles ({total})</option>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label} ({o.n})</option>)}
    </select>
  </label>;
}

/** Recruiter: candidates who applied (liked) per role. */
export function ApplicationsList({ data, setData, navigate, onOpenMessages, compact }: Props) {
  const [role, setRole] = useState('all');
  const [busy, setBusy] = useState('');
  const groups = data.roleMatches || [];
  const options = groups.map((g) => ({ key: g.job.id, label: g.job.title, n: g.candidates.length }));
  const rows = groups.filter((g) => role === 'all' || g.job.id === role)
    .flatMap((g) => g.candidates.map((c) => ({ job: g.job, c })))
    .sort((a, b) => (b.c.appliedAt || 0) - (a.c.appliedAt || 0));
  const fromLinkedIn = rows.filter((r) => r.c.appliedSrc === 'linkedin').length;
  const matchOf = (jobId: string, candidateId: string) => data.matches.find((m) => m.jobId === jobId && m.candidateId === candidateId);
  const likeBack = async (jobId: string, person: Person) => {
    setBusy(`${jobId}:${person.id}`);
    try {
      const r = await api.swipe({ actorId: data.viewer.id, targetId: person.id, targetType: 'candidate', direction: 'like', jobId });
      setData(await api.bootstrap(data.viewer.id));
      if (r.match && onOpenMessages) onOpenMessages(r.match.id);
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not like back'); } finally { setBusy(''); }
  };
  const shown = compact ? rows.slice(0, 5) : rows;
  return <section className={compact ? 'td-section ap-section compact' : 'td-section ap-section'} id="td-applications">
    <DashboardTitle icon={Inbox} title="Jobs Candidates" subtitle="Candidates who applied to your roles. Like back to match and open a chat." action={compact && rows.length > 5 ? `See all ${rows.length}` : undefined} onAction={() => navigate('applied')} />
    <div className="ap-top">
      <RolePicker label="Role" options={options} value={role} onChange={setRole} />
      {fromLinkedIn > 0 && <span className="ap-li"><Linkedin size={13} /> {fromLinkedIn} from LinkedIn</span>}
    </div>
    {rows.length === 0 ? <p className="ap-empty">{groups.length ? 'No applications yet for this role.' : 'Post a role to start receiving applications.'}</p>
      : <ul className="ap-list">{shown.map(({ job, c }) => {
        const m = matchOf(job.id, c.id);
        return <li key={`${job.id}:${c.id}`} className="ap-row">
          {c.photo ? <img className="ap-face" src={c.photo} alt="" /> : <span className="ap-face">{c.name.slice(0, 1)}</span>}
          <div className="ap-main">
            <strong>{c.name}{c.appliedSuper && <Star size={12} className="ap-star" aria-label="Super Like" />}</strong>
            <small>{[c.title, c.location].filter(Boolean).join(' · ')}</small>
            <small className="ap-meta">{role === 'all' && <><Briefcase size={11} /> {job.title} · </>}{c.appliedAt ? `Applied ${fmt(c.appliedAt)}` : 'Applied'}{c.appliedSrc === 'linkedin' && <> · <Linkedin size={11} /> LinkedIn</>}</small>
          </div>
          {typeof c.match?.score === 'number' && <b className="ap-fit">{c.match.score}%</b>}
          {m ? <button type="button" className="ap-btn msg" onClick={() => onOpenMessages?.(m.id)}><MessageCircle size={14} /> Message</button>
            : <button type="button" className="ap-btn like" disabled={busy === `${job.id}:${c.id}`} onClick={() => void likeBack(job.id, c)}><Heart size={14} /> Like back</button>}
        </li>;
      })}</ul>}
  </section>;
}

/** Candidate: jobs applied to (liked), per target role. */
export function JobsAppliedList({ data, navigate, onOpenMessages, compact }: Props) {
  const [role, setRole] = useState('all');
  const targets = useMemo(() => (data.viewer.preferences?.desiredRoles?.length ? data.viewer.preferences.desiredRoles : [data.viewer.title].filter(Boolean) as string[]), [data.viewer]);
  const applied = data.applied || [];
  const withRole = applied.map((a) => ({ ...a, role: roleFor(a.job.title, targets) }));
  const keys = [...new Set(withRole.map((a) => a.role))];
  const options = keys.map((k) => ({ key: k, label: k, n: withRole.filter((a) => a.role === k).length }));
  const rows = withRole.filter((a) => role === 'all' || a.role === role);
  const status = (a: typeof rows[number]) => {
    if (a.matchId) return { cls: 'ok', text: 'Matched' };
    if (!a.open) return { cls: 'off', text: 'Role closed' };
    const jf = a.job.jobFinder;
    if (jf) return { cls: 'wait', text: jf.myOutreach ? outreachText(jf.myOutreach) : jf.reachability === 'email' ? 'Interest not sent yet' : 'Saved · recruiter contact not yet available' };
    return { cls: 'wait', text: 'Waiting for the team' };
  };
  const shown = compact ? rows.slice(0, 5) : rows;
  return <section className={compact ? 'td-section ap-section compact' : 'td-section ap-section'} id="td-applied">
    <DashboardTitle icon={Send} title="Jobs Applied (liked)" subtitle="Every job you applied to. A chat opens when the team likes you back." action={compact && rows.length > 5 ? `See all ${rows.length}` : undefined} onAction={() => navigate('applied')} />
    <div className="ap-top"><RolePicker label="Role" options={options} value={role} onChange={setRole} /></div>
    {rows.length === 0 ? <p className="ap-empty">{applied.length ? 'No applications for this role yet.' : 'Apply to a job from Find My Match: it shows up here.'} <button type="button" className="jf-textbtn" onClick={() => navigate('match')}>Find My Match</button></p>
      : <ul className="ap-list">{shown.map((a) => {
        const s = status(a);
        return <li key={a.jobId} className="ap-row">
          <span className="ap-face logo">{(a.job.company || '?').slice(0, 1)}</span>
          <div className="ap-main">
            <strong>{a.job.title}{a.superLike && <Star size={12} className="ap-star" aria-label="Super Like" />}</strong>
            <small>{[a.job.company, a.job.location].filter(Boolean).join(' · ')}{a.job.jobFinder ? ' · Added by JobFinder' : ''}</small>
            <small className="ap-meta">{role === 'all' && targets.length > 1 && <>{a.role} · </>}Applied {fmt(a.at)}{a.src === 'linkedin' && <> · <Linkedin size={11} /> from LinkedIn</>}</small>
          </div>
          <span className={`ap-status ${s.cls}`}>{s.cls === 'ok' && <Check size={12} />}{s.text}</span>
          {a.matchId ? <button type="button" className="ap-btn msg" onClick={() => onOpenMessages?.(a.matchId!)}><MessageCircle size={14} /> Message</button>
            : a.open ? <button type="button" className="ap-btn" onClick={() => window.dispatchEvent(new CustomEvent(a.job.jobFinder ? JOBFINDER_OPEN_EVENT : OPEN_JOB_EVENT, { detail: { jobId: a.jobId } }))}><MapPin size={14} /> {a.job.jobFinder ? 'Send interest' : 'View'}</button> : null}
        </li>;
      })}</ul>}
  </section>;
}

export function AppliedPage(props: Props) {
  return <main className="td-dashboard ap-page">{props.data.viewer.role === 'candidate' ? <JobsAppliedList {...props} /> : <ApplicationsList {...props} />}</main>;
}
