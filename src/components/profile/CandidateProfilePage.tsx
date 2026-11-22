import { useCallback, useMemo, useState } from 'react';
import { Check, Eye, Loader2, Lock, Pencil, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import type { Job, JobMatch, Person } from '../../types';
import { JobStatusPicker } from '../JobStatusPicker';
import { ContactBarEditor } from '../ContactBarEditor';
import { CandidateCards } from './CandidateCards';
import { DemoBadge } from '../DemoBadge';
import { ContactBar } from '../home/TodayPanel';

// On your own profile page "My Dream Job" comes first (founder request), then the usual cards.
// ORDER lists CandidateCards' card numbers (0 Who I am, 1 Human Stack, 2 Skills, 3 Built, 4 Dream Job,
// 5 Recommendations, 6 Certifications, 7 My Super Power).
// Second row: Certifications · Recommendations · My Super Power (founder layout, 2026-11-22).
const ORDER = [4, 0, 1, 2, 3, 6, 5, 7];
// Card number -> wizard step. Must stay in sync with the step= props on each <Card> in CandidateCards.tsx
// (6 Certifications live in step 1; 7 Super Power is edited on the card itself → Human stack step).
const CARD_STEP = [0, 3, 1, 6, 2, 5, 1, 4];
const EDIT_STEPS = ORDER.map((card) => CARD_STEP[card]);
/** Off since 2026-11-22 (founder: the status section is noise). */
const SHOW_STATUS_EDITOR = false;

export function CandidateProfilePage({ viewer, jobs, onEdit, initialCard = 0, onCardChange, onDeleteProfile, matches = [], onViewerSaved, onOpenMessages, onReload }: { viewer: Person; jobs: Job[]; onEdit: (step: number) => void; initialCard?: number; onCardChange?: (card: number) => void; onDeleteProfile?: () => Promise<void>; matches?: JobMatch[]; onViewerSaved?: (viewer: Person) => void; onOpenMessages?: (matchId: string) => void; onReload?: () => void }) {
  const [jobId, setJobId] = useState('');
  const [inspector, setInspector] = useState(false);
  const [activeCard, setActiveCard] = useState(initialCard);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const doDelete = async () => {
    if (!onDeleteProfile) return;
    setDeleting(true);
    try { await onDeleteProfile(); } finally { setDeleting(false); setConfirmingDelete(false); }
  };
  const changeCard = useCallback((card: number) => { setActiveCard(card); onCardChange?.(card); }, [onCardChange]);
  const comparisonJob = useMemo(() => jobs.find((job) => job.id === jobId), [jobId, jobs]);
  const completion = viewer.completeness || 0;
  const strengths = [
    { label: 'Profile Basics', value: Math.min(100, completion + 18), step: 0 },
    { label: 'Technical Stack', value: viewer.skillsDetail?.length ? 85 : 45, step: 1 },
    { label: 'Preferences', value: viewer.preferences?.salary?.min ? 82 : 58, step: 2 },
    { label: 'Human Stack', value: viewer.presentation ? 78 : 40, step: 3 },
    { label: 'Recommendations', value: Math.min(100, (viewer.recommendations?.length || 0) * 25), step: 5 },
  ];

  return <main className="page recruiter-preview-page">
    <header className="rp-page-head">
      <div><span className="overline">Your published candidate profile</span><h1>How Recruiters See You</h1><p>Review the same five-card profile, field visibility, and job-specific match evidence recruiters receive.</p></div>
      <div className="rp-head-actions">
        {onDeleteProfile && (confirmingDelete
          ? <span className="settings-confirm"><button className="danger-button" disabled={deleting} onClick={() => void doDelete()}>{deleting ? <Loader2 size={14} className="spin" /> : 'Confirm delete'}</button><button className="text-button" onClick={() => setConfirmingDelete(false)}><X size={14} /></button></span>
          : <button className="secondary-button danger-outline" onClick={() => setConfirmingDelete(true)}><Trash2 size={15} /> Delete This Profile</button>)}
        <button className={inspector ? 'secondary-button active' : 'secondary-button'} onClick={() => setInspector((value) => !value)}><Eye size={16} /> Visibility Inspector</button>
        <button className="primary-button" onClick={() => onEdit(EDIT_STEPS[activeCard])}><Pencil size={15} /> Edit This Card</button>
      </div>
    </header>

    <div className="rp-visibility">
      <strong>Recruiter visibility</strong><span><i className="public" /> Public before match</span><span><i className="after" /> Visible after mutual match</span><span><i className="private" /> Private</span>
      {(viewer.demo || viewer.sample) && <DemoBadge label={viewer.sample ? 'Starter sample profile — auto-generated for you' : 'Demo profile — not a real candidate'} />}
      <label>Preview against<select value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">General recruiter view</option>{jobs.slice(0, 12).map((job) => <option key={job.id} value={job.id}>{job.title} · {job.company}</option>)}</select></label>
    </div>

    <section className="rp-layout">
      <div className="rp-deck-wrap">
        <CandidateCards person={viewer} match={comparisonJob?.match} onEdit={onEdit} visibilityInspector={inspector} initialCard={initialCard} onActiveChange={changeCard} order={ORDER} />
        {/* Job status under the photo card: recruiters see the status on the card; role and recruiter stay private. */}
        {/* Job status editor removed from the profile view (founder, 2026-11-22: "noise"). Kept switchable. */}
        {SHOW_STATUS_EDITOR && onViewerSaved && <div className="rp-status-wrap"><JobStatusPicker key={viewer.id} variant="card" collapsible viewer={viewer} matches={matches} onSaved={onViewerSaved} onOpen={onOpenMessages} onReload={onReload} /></div>}
        <p className="rp-privacy-note"><Lock size={14} /> Private contact values remain hidden in owner preview exactly as they are before a mutual match.</p>
        {/* Contact bar: what teams can use once you match. */}
        <div className="rp-contact-wrap">{onViewerSaved ? <ContactBarEditor key={viewer.id} viewer={viewer} onSaved={onViewerSaved} /> : <ContactBar person={viewer} onAdd={() => onEdit(0)} />}</div>
      </div>
      <aside className="rp-context">
        <div className="rp-completion-head"><div className="mh-ring" style={{ '--value': `${completion * 3.6}deg` } as React.CSSProperties}><strong>{completion}%</strong></div><div><span className="overline">Profile strength</span><h2>Make recruiters fall in love with your profile</h2></div></div>
        <div className="rp-strength-list">{strengths.map((item) => <button key={item.label} onClick={() => onEdit(item.step)}><span><strong>{item.label}</strong><small>{item.value >= 100 ? 'Complete' : `${item.value}%`}</small></span><i><b style={{ width: `${item.value}%` }} /></i></button>)}</div>
        <div className="rp-recommendations"><h3><Sparkles size={16} /> Highest-impact improvements</h3>
          {[
            { text: 'Add or confirm a recruiter-safe contact method', done: Boolean(viewer.contactChannels?.length), step: 0 },
            { text: 'Complete salary and work-mode preferences', done: Boolean(viewer.preferences?.salary?.min && viewer.preferences?.workMode), step: 2 },
            { text: 'Add your Human Stack introduction', done: Boolean(viewer.presentation), step: 3 },
          ].map((item) => <button key={item.text} onClick={() => onEdit(item.step)}><span className={item.done ? 'done' : ''}>{item.done ? <Check size={13} /> : <ShieldCheck size={13} />}</span><b>{item.text}</b></button>)}
        </div>
        {comparisonJob ? <div className="rp-comparison"><span className="overline">Personalized view</span><strong>{comparisonJob.match.score}% match with {comparisonJob.title}</strong><p>{comparisonJob.match.matchedSkills.length} matching skills · {comparisonJob.match.missingSkills?.length || 0} development gaps · {comparisonJob.match.salaryStatus || 'salary pending'} salary fit</p></div>
          : <div className="rp-comparison neutral"><span className="overline">General recruiter view</span><strong>No fabricated match score</strong><p>Select a matched role to inspect skills, salary, work-mode, and availability compatibility.</p></div>}
        <button className="primary-button wide" onClick={() => onEdit(EDIT_STEPS[activeCard])}>Edit This Card</button>
      </aside>
    </section>
  </main>;
}
