// "Find My Match" page for both sides, with a role dropdown on top for people looking for several roles:
// - candidates pick one of their target roles → the deck shows only the jobs for that role;
// - recruiters pick one of their open roles → the deck shows every candidate scored for that role,
//   and their likes are tied to it (the match lands on that job).
// "All my roles" keeps the full deck.
import { createContext, useContext, useMemo, useState } from 'react';
import { BriefcaseBusiness, ChevronDown, Heart, Sparkles } from 'lucide-react';
import { likesWaiting } from '../../lib/today';
import type { Bootstrap, Job, Person, View } from '../../types';
import { roleFor } from '../../lib/report';
import { NewMatchesSection } from './NewMatchesSection';
import { RecruiterMatchSection } from './RecruiterMatchSection';
import { DashboardTitle } from './MatchHome';

type Props = { data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void; onOpenMessages?: (matchId: string) => void };

/** Phones without the top bar (founder, 2026-11-24, preview ?bar=1): the notification bell sits at the right of the
 *  role picker. The workspace provides it; empty otherwise. */
export const RoleBarExtra = createContext<React.ReactNode>(null);

export function FindMyMatchPage({ data, setData, navigate, onOpenMessages }: Props) {
  const candidate = data.viewer.role === 'candidate';
  const extra = useContext(RoleBarExtra);
  const [roleKey, setRoleKey] = useState('all');

  // Candidate: target roles (desired roles, else the current title). Recruiter: open roles.
  const targets = useMemo(() => (data.viewer.preferences?.desiredRoles?.length ? data.viewer.preferences.desiredRoles : [data.viewer.title].filter(Boolean) as string[]), [data.viewer]);
  const myJobs = useMemo(() => (data.roleMatches || []).map((g) => g.job), [data.roleMatches]);
  const options = candidate
    // No counts in the dropdown (founder, 2026-11-22): just the role names.
    ? targets.map((t) => ({ key: t, label: t, sub: '' }))
    : myJobs.map((j) => ({ key: j.id, label: j.title, sub: j.company || '' }));
  const selected = options.find((o) => o.key === roleKey);

  const candidateItems: Job[] | undefined = candidate && selected ? data.jobs.filter((j) => roleFor(j.title, targets) === selected.key) : undefined;
  // Recruiter + one role: every candidate in the pool, re-scored for that role.
  const group = !candidate && selected ? (data.roleMatches || []).find((g) => g.job.id === selected.key) : undefined;
  const recruiterItems: Person[] | undefined = group ? data.candidates.map((c) => ({ ...c, match: group.scores?.[c.id] ?? c.match })) : undefined;

  // "Find JobMatches" for candidates and recruiters (founder, 2026-11-26; was "Find My Match").
  const header = <DashboardTitle icon={Sparkles} title="Find JobMatches"
    subtitle={candidate ? 'Swipe right to show interest. A chat opens only if they like you back.' : 'Swipe right on candidates you want to meet. A chat opens only if they like you back.'}
    action="Open Discover" onAction={() => navigate('discover')} />;

  // "See who liked you" (founder, 2026-11-23): Tinder-style gold entry on the swipe page, opens the likes list on Home.
  const waiting = likesWaiting(data);
  const seeWho = () => {
    navigate('home');
    window.setTimeout(() => document.getElementById(candidate ? 'td-chasing' : 'td-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  };

  return <>
    {waiting > 0 && <button type="button" className="fmm-likes" onClick={seeWho}>
      <Heart size={16} fill="currentColor" />
      <span><strong>{waiting} {candidate ? (waiting === 1 ? 'hiring team likes you' : 'hiring teams like you') : (waiting === 1 ? 'candidate likes your roles' : 'candidates like your roles')}</strong>{!candidate && <small>Included in your plan</small>}</span>
      <b>See who</b>
    </button>}
    {options.length > 0 && <div className="fmm-rolebar">
      <span className="fmm-role-icon" aria-hidden="true">{selected ? (selected.label[0] || 'R').toUpperCase() : <BriefcaseBusiness size={16} />}</span>
      <label className="fmm-role-select">
        <span className="fmm-role-label">{candidate ? 'Swipe for role' : 'Swipe candidates for'}</span>
        <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} aria-label={candidate ? 'Choose a target role' : 'Choose one of your roles'}>
          <option value="all">{candidate ? 'All my target roles' : 'All my roles'}</option>
          {options.map((o) => <option key={o.key} value={o.key}>{o.sub ? `${o.label} · ${o.sub}` : o.label}</option>)}
        </select>
        <ChevronDown size={16} className="fmm-role-chev" aria-hidden="true" />
      </label>
      {extra}
    </div>}
    {options.length === 0 && extra && <div className="fmm-rolebar fmm-bell-only">{extra}</div>}
    {candidate
      ? <NewMatchesSection key={`c-${roleKey}`} data={data} setData={setData} navigate={navigate} onOpenMessages={onOpenMessages} header={header} items={candidateItems} roleKey={roleKey} />
      : <RecruiterMatchSection key={`r-${roleKey}`} data={data} setData={setData} navigate={navigate} onOpenMessages={onOpenMessages} header={header} items={recruiterItems} jobId={selected?.key} />}
  </>;
}
