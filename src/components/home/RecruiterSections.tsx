// Recruiter home template sections (same for every hiring team / headhunter):
// a hiring pipeline board per role and the candidates worth reviewing now.
import { useState } from 'react';
import { ArrowRight, Heart, ListChecks, Loader2, Sparkles, Users } from 'lucide-react';
import { api } from '../../api';
import type { Bootstrap, JobMatch, Person, View } from '../../types';
import { timeline } from '../../lib/hiringStages';
import { likerIds } from '../../lib/today';

type Col = 'matched' | 'interviewing' | 'offer' | 'hired';
const COLS: { id: Col; label: string }[] = [
  { id: 'matched', label: 'Matched' }, { id: 'interviewing', label: 'Interviewing' }, { id: 'offer', label: 'Offer' }, { id: 'hired', label: 'Hired' },
];

/** Which pipeline column a match is in, from its current hiring step. */
export function columnOf(match: JobMatch): Col {
  const t = timeline(match);
  const cur = t.steps[t.currentIndex];
  if (!cur || cur.kind === 'match') return 'matched';
  if (cur.finish || cur.kind === 'hired') return 'hired';
  if (cur.kind === 'offer') return 'offer';
  return 'interviewing';
}

function Faces({ people }: { people: Person[] }) {
  return <span className="rs-faces">{people.slice(0, 4).map((p) => p.photo ? <img key={p.id} src={p.photo} alt={p.name} title={p.name} /> : <b key={p.id} title={p.name}>{p.name.slice(0, 1)}</b>)}{people.length > 4 && <em>+{people.length - 4}</em>}</span>;
}

export function HiringPipelineBoard({ data, navigate }: { data: Bootstrap; navigate: (v: View) => void }) {
  const mine = data.matches.filter((m) => m.employerId === data.viewer.id);
  const byJob = new Map<string, JobMatch[]>();
  for (const m of mine) byJob.set(m.jobId, [...(byJob.get(m.jobId) || []), m]);
  return <section className="td-section rs-section" id="td-pipeline">
    <header className="td-section-title"><div><ListChecks size={16} /><span><strong>Hiring pipeline</strong><small>Where every matched candidate stands, per role.</small></span></div>
      <button onClick={() => navigate('stages')}>Open Hiring Stages<ArrowRight size={13} /></button></header>
    {byJob.size === 0 ? <p className="tp-muted">No matched candidates yet. They appear here as soon as you and a candidate both say yes.</p>
      : <div className="rs-board">
        <div className="rs-row rs-head"><span>Role</span>{COLS.map((c) => <span key={c.id}>{c.label}</span>)}</div>
        {[...byJob.entries()].map(([jobId, matches]) => {
          const cols = Object.fromEntries(COLS.map((c) => [c.id, matches.filter((m) => columnOf(m) === c.id).map((m) => m.candidate).filter(Boolean)])) as Record<Col, Person[]>;
          return <button type="button" className="rs-row" key={jobId} onClick={() => navigate('stages')}>
            <span className="rs-role"><strong>{matches[0].job?.title}</strong><small>{matches.length} {matches.length === 1 ? 'candidate' : 'candidates'}</small></span>
            {COLS.map((c) => <span key={c.id} className={`rs-cell col-${c.id}`}><b>{cols[c.id].length}</b><Faces people={cols[c.id]} /></span>)}
          </button>;
        })}
      </div>}
  </section>;
}

export function CandidatesToReview({ data, setData, onView, onOpenMessages }: { data: Bootstrap; setData: (d: Bootstrap) => void; onView: (p: Person) => void; onOpenMessages?: (matchId: string) => void }) {
  const [busy, setBusy] = useState('');
  const matched = new Set(data.matches.filter((m) => m.employerId === data.viewer.id).map((m) => m.candidateId));
  const likers = likerIds(data);
  const likes = (p: Person) => likers.has(p.id);
  const list = data.candidates.filter((c) => !matched.has(c.id))
    .sort((a, b) => Number(likes(b)) - Number(likes(a)) || (b.match?.score ?? 0) - (a.match?.score ?? 0))
    .slice(0, 6);
  const like = async (p: Person) => {
    setBusy(p.id);
    try {
      const r = await api.swipe({ actorId: data.viewer.id, targetId: p.id, targetType: 'candidate', direction: 'like' });
      const fresh = await api.bootstrap(data.viewer.id);
      setData(fresh);
      if (r.match && onOpenMessages) onOpenMessages(r.match.id);
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not like this candidate'); }
    finally { setBusy(''); }
  };
  return <section className="td-section rs-section" id="td-review">
    <header className="td-section-title"><div><Users size={16} /><span><strong>Candidates to review</strong><small>People who like your roles first, then the best fit. Like back to open a chat.</small></span></div></header>
    {list.length === 0 ? <p className="tp-muted">You have reviewed everyone for now. New candidates appear here as they join.</p>
      : <div className="rs-cands">{list.map((p) => <article className="rs-cand" key={p.id}>
        {p.photo ? <img src={p.photo} alt="" /> : <span className="rs-avatar">{p.name.slice(0, 1)}</span>}
        <div className="rs-cand-body">
          <strong>{p.name}</strong>
          <small>{p.title}{p.city || p.location ? ` · ${p.city || p.location}` : ''}</small>
          <span className="rs-tags">
            {typeof p.match?.score === 'number' && <em className="rs-fit">{p.match.score}% fit</em>}
            {likes(p) && <em className="rs-likes"><Sparkles size={11} /> {p.superLikedYou ? 'Super Liked you' : 'Likes your role'}</em>}
          </span>
        </div>
        <div className="rs-cand-actions">
          <button type="button" className="secondary-button small" onClick={() => onView(p)}>View</button>
          <button type="button" className="primary-button small" disabled={busy === p.id} onClick={() => void like(p)} aria-label={`Like ${p.name}`}>{busy === p.id ? <Loader2 size={14} className="spin" /> : <Heart size={14} />} Like</button>
        </div>
      </article>)}</div>}
  </section>;
}
