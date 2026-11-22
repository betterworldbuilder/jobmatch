// "Find My Match" page for both sides, with a role dropdown on top for people looking for several roles:
// - candidates pick one of their target roles → the deck shows only the jobs for that role;
// - recruiters pick one of their open roles → the deck shows every candidate scored for that role,
//   and their likes are tied to it (the match lands on that job).
// "All my roles" keeps the full deck.
import { useMemo, useState } from 'react';
import { BriefcaseBusiness, ChevronDown, Sparkles } from 'lucide-react';
import type { Bootstrap, Job, Person, View } from '../../types';
import { roleFor } from '../../lib/report';
import { NewMatchesSection } from './NewMatchesSection';
import { RecruiterMatchSection } from './RecruiterMatchSection';
import { DashboardTitle } from './MatchHome';

type Props = { data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void; onOpenMessages?: (matchId: string) => void };

export function FindMyMatchPage({ data, setData, navigate, onOpenMessages }: Props) {
  const candidate = data.viewer.role === 'candidate';
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

  const header = <DashboardTitle icon={Sparkles} title="Find My Match"
    subtitle={candidate ? 'Swipe right to show interest. A chat opens only if they like you back.' : 'Swipe right on candidates you want to meet. A chat opens only if they like you back.'}
    action="Open Discover" onAction={() => navigate('discover')} />;

  return <>
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
    </div>}
    {candidate
      ? <NewMatchesSection key={`c-${roleKey}`} data={data} setData={setData} navigate={navigate} onOpenMessages={onOpenMessages} header={header} items={candidateItems} roleKey={roleKey} />
      : <RecruiterMatchSection key={`r-${roleKey}`} data={data} setData={setData} navigate={navigate} onOpenMessages={onOpenMessages} header={header} items={recruiterItems} jobId={selected?.key} />}
  </>;
}
