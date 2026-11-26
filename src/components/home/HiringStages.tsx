// "Hiring Stages": for each job, where every candidate stands in the hiring rounds —
// a timeline from Mutual match → Round 1…N (who interviews, kind, date) → Offer → Hired.
// Recruiters edit rounds and move the current step; candidates see their own, read-only.
import { useState } from 'react';
import { BadgeCheck, Ban, Calendar, Check, Eye, EyeOff, Flag, Loader2, MessageCircle, Pencil, Plus, User } from 'lucide-react';
import { api } from '../../api';
import { JobHeaderBadge } from '../jobs/JobHeaderBadge';
import { KIND_LABEL, defaultSteps, formatDay, summary, timeline } from '../../lib/hiringStages';
import type { Bootstrap, JobMatch, PipelineStep, StepKind } from '../../types';

let seq = 0;
const newId = () => { seq += 1; return `round-${Date.now()}-${seq}`; };

export function StageTimeline({ match, canEdit, onSelect }: { match: JobMatch; canEdit: boolean; onSelect?: (stepId: string) => void }) {
  const t = timeline(match);
  const pct = t.steps.length > 1 ? Math.round((t.currentIndex / (t.steps.length - 1)) * 100) : 0;
  return <div className="hs-track" style={{ ['--hs-progress' as string]: `${pct}%` }}>
    <ol className="hs-steps">
      {t.steps.map((step) => <li key={step.id} className={`hs-step ${step.state} kind-${step.kind}${step.finish ? ' finish' : ''}`}>
        <button type="button" className="hs-dot" disabled={!canEdit} onClick={() => onSelect?.(step.id)}
          aria-label={canEdit ? `Set ${step.name} as the current step` : `${step.name}: ${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          {step.finish ? <Flag size={14} /> : step.state === 'done' ? <Check size={14} /> : step.round || (step.kind === 'offer' ? '★' : '•')}
        </button>
        <div className="hs-copy">
          <span className="hs-label">{step.round ? `Round ${step.round}` : step.finish ? 'Finish line' : KIND_LABEL[step.kind || 'other']}</span>
          <strong>{step.name}</strong>
          {step.round && <em className={`hs-kind kind-${step.kind}`}>{KIND_LABEL[step.kind || 'other']}</em>}
          {step.owner && <small><User size={11} /> {step.owner}</small>}
          {(step.date || step.format) && <small><Calendar size={11} /> {[formatDay(step.date), step.format].filter(Boolean).join(' · ')}</small>}
        </div>
      </li>)}
    </ol>
  </div>;
}

function StepsEditor({ steps, onChange, onDone }: { steps: PipelineStep[]; onChange: (s: PipelineStep[]) => void; onDone: () => void }) {
  const update = (id: string, patch: Partial<PipelineStep>) => onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addRound = () => {
    const at = Math.max(1, steps.findIndex((s) => s.kind === 'offer'));
    onChange([...steps.slice(0, at), { id: newId(), name: 'New round', owner: '', kind: 'technical' }, ...steps.slice(at)]);
  };
  return <div className="hs-editor">
    <div className="hs-editor-head"><span>Step</span><span>Kind</span><span>Who interviews</span><span>Date</span><span>Format</span><span /></div>
    {steps.map((s) => <div key={s.id} className={s.hidden ? 'hs-editor-row hidden' : 'hs-editor-row'}>
      <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} aria-label="Step name" />
      <select value={s.kind || 'other'} onChange={(e) => update(s.id, { kind: e.target.value as StepKind })} aria-label="Kind">
        {(Object.keys(KIND_LABEL) as StepKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
      <input value={s.owner} placeholder="e.g. Priya Nair, Talent Partner" onChange={(e) => update(s.id, { owner: e.target.value })} aria-label="Who interviews" />
      <input type="date" value={s.date || ''} onChange={(e) => update(s.id, { date: e.target.value || undefined })} aria-label="Date" />
      <input value={s.format || ''} placeholder="Video, 45 min" onChange={(e) => update(s.id, { format: e.target.value })} aria-label="Format" />
      <button type="button" onClick={() => update(s.id, { hidden: !s.hidden })} aria-label={s.hidden ? 'Show step' : 'Hide step'}>{s.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
    </div>)}
    <div className="hs-editor-actions">
      <button type="button" className="secondary-button small" onClick={addRound}><Plus size={14} /> Add a round</button>
      <button type="button" className="primary-button small" onClick={onDone}><Check size={14} /> Done</button>
    </div>
  </div>;
}

// Keep in sync with STOP_REASONS in server/hiring-rules.js.
export const STOP_REASONS = ['Skills gap', 'Experience level', 'Salary expectations', 'Time zone or availability', 'Role on hold or cancelled', 'Chose another candidate', 'Other'];
const MIN_FEEDBACK = 30;
const CLOSED_LABEL: Record<string, string> = { candidate_hired: 'Closed: the candidate accepted another offer', role_filled: 'Closed: the role was filled', stopped_by_recruiter: 'Closed: process stopped' };

/** Rule 3: stopping a process needs the main reason and honest feedback, sent to the candidate. */
function StopProcessForm({ match, onCancel, onDone }: { match: JobMatch; onCancel: () => void; onDone: () => void }) {
  const [category, setCategory] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = category && feedback.trim().length >= MIN_FEEDBACK;
  const send = async () => {
    setBusy(true); setError('');
    try { await api.stopMatch(match.id, category, feedback.trim()); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not stop the process'); }
    finally { setBusy(false); }
  };
  return <div className="hs-stop">
    <strong>Stop the process with {match.candidate?.name?.split(' ')[0] || 'this candidate'}</strong>
    <p>Recruitment process rule: give the main reason and honest, specific feedback. It is sent to the candidate in the conversation, and upcoming meetings are cancelled.</p>
    <label>Main reason<select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Main reason"><option value="">Pick one…</option>{STOP_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
    <label>Honest feedback for the candidate<textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} aria-label="Feedback for the candidate" placeholder="What was strong, what was missing for this role, and what would make them a fit next time." maxLength={2000} /></label>
    <small className={feedback.trim().length >= MIN_FEEDBACK ? 'hs-count ok' : 'hs-count'}>{feedback.trim().length} / {MIN_FEEDBACK} characters minimum</small>
    {error && <p className="cb-err">{error}</p>}
    <div className="hs-stop-actions"><button type="button" className="secondary-button small" onClick={onCancel}>Cancel</button>
      <button type="button" className="danger-button small" disabled={!ok || busy} onClick={() => void send()}>{busy ? <Loader2 size={14} className="spin" /> : 'Send feedback and stop'}</button></div>
  </div>;
}

/** `embedded` (founder, 2026-11-26): shown as a section of the Interviews page (candidates and recruiters). */
export function HiringStages({ data, setData, onOpenMessages, embedded }: { data: Bootstrap; setData: (d: Bootstrap) => void; onOpenMessages: (matchId: string) => void; embedded?: boolean }) {
  // Quiet refresh after a rule changed several records (other matches, messages, meetings) — keeps the notice on screen.
  const reload = () => { void api.bootstrap(data.viewer.id).then(setData).catch(() => undefined); };
  const isRecruiter = data.viewer.role === 'employer';
  const [editing, setEditing] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [hiring, setHiring] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const isOpen = (m: JobMatch) => m.stage !== 'Hired' && m.stage !== 'Archived';
  const hire = async (m: JobMatch) => {
    try {
      const r = await api.hireMatch(m.id);
      const e = r.effects;
      setNotice(`${m.candidate?.name || 'The candidate'} is hired and the role is marked filled.${e?.closed ? ` ${e.closed} other candidate${e.closed === 1 ? '' : 's'} got an automatic thank-you${e.meetingsCancelled ? `, ${e.meetingsCancelled} meeting${e.meetingsCancelled === 1 ? '' : 's'} cancelled` : ''}.` : ''}`);
      setHiring(null); reload();
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not mark as hired'); }
  };
  const mine = data.matches.filter((m) => (isRecruiter ? m.employerId === data.viewer.id : m.candidateId === data.viewer.id));
  const byJob = new Map<string, JobMatch[]>();
  for (const m of mine) byJob.set(m.jobId, [...(byJob.get(m.jobId) || []), m]);

  const persist = async (match: JobMatch, pipeline: PipelineStep[], currentStepId: string) => {
    setData({ ...data, matches: data.matches.map((m) => (m.id === match.id ? { ...m, pipeline, currentStepId } : m)) });
    try { await api.updateMatchPipeline(match.id, pipeline, currentStepId); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not save the hiring stages'); }
  };
  const stepsFor = (m: JobMatch) => (m.pipeline?.length ? m.pipeline : defaultSteps(m.job));

  const intro = isRecruiter ? 'Every role, every candidate: which round they are in, who interviews them and when — up to the finish line.' : 'Where you stand with each team: the rounds ahead, who you meet and when.';
  return <div className={embedded ? 'hs-page hs-embedded' : 'page hs-page'} id={embedded ? 'hiring-stages' : undefined}>
    {embedded
      ? <div className="hs-embedded-head"><span className="overline">Milestones</span><h2>Hiring Stages</h2><p>{intro}</p></div>
      : <div className="page-title"><div><span className="overline">Milestones</span><h1>Hiring Stages</h1><p>{intro}</p></div></div>}
    {notice && <p className="hs-notice" role="status"><Check size={14} /> {notice} <button type="button" className="text-button" onClick={() => setNotice('')}>OK</button></p>}
    {mine.length === 0 && <div className="sc-empty"><Flag size={26} /><strong>No hiring stages yet</strong><p>Stages start when you and {isRecruiter ? 'a candidate' : 'a team'} both say yes.</p></div>}
    {[...byJob.entries()].map(([jobId, matches]) => {
      const job = matches[0].job;
      const rounds = timeline(matches[0]).rounds;
      return <section className="hs-job" key={jobId}>
        <header className="hs-job-head">
          <JobHeaderBadge job={job} compact />
          <span className="hs-job-meta">{rounds} {rounds === 1 ? 'round' : 'rounds'} · {matches.length} {isRecruiter ? (matches.length === 1 ? 'candidate' : 'candidates') : 'match'}</span>
        </header>
        {matches.map((m) => {
          const person = isRecruiter ? m.candidate : m.employer;
          const name = person?.name || (isRecruiter ? 'Candidate' : m.job?.company || 'Hiring team');
          return <article className="hs-card" key={m.id}>
            <div className="hs-card-head">
              {person?.photo ? <img src={person.photo} alt="" /> : <span className="hs-avatar">{name.slice(0, 1)}</span>}
              <div className="hs-who"><strong>{name}</strong><small>{isRecruiter ? m.candidate?.title : person?.title || `Hiring for ${m.job?.title}`}</small></div>
              <span className="hs-summary">{summary(m)}</span>
              <button type="button" className="secondary-button small" onClick={() => onOpenMessages(m.id)}><MessageCircle size={14} /> Message</button>
              {isRecruiter && isOpen(m) && <button type="button" className="secondary-button small hs-hire" onClick={() => setHiring(hiring === m.id ? null : m.id)}><BadgeCheck size={14} /> Hired</button>}
              {isRecruiter && isOpen(m) && <button type="button" className="secondary-button small hs-stop-btn" onClick={() => setStopping(stopping === m.id ? null : m.id)}><Ban size={14} /> Stop process</button>}
              {isRecruiter && <button type="button" className={editing === m.id ? 'hs-edit on' : 'hs-edit'} onClick={() => setEditing(editing === m.id ? null : m.id)} aria-label="Edit rounds"><Pencil size={14} /></button>}
            </div>
            {!isOpen(m) && <p className={`hs-closed ${m.stage === 'Hired' ? 'hired' : ''}`}>{m.stage === 'Hired' ? <><BadgeCheck size={14} /> Hired</> : <><Ban size={14} /> {CLOSED_LABEL[m.closedReason || ''] || 'Closed'}{m.closedCategory ? ` · ${m.closedCategory}` : ''}</>}</p>}
            {hiring === m.id && (() => {
              const others = matches.filter((x) => x.id !== m.id && isOpen(x)).length;
              return <div className="hs-confirm"><p><b>Mark {m.candidate?.name || 'this candidate'} as hired?</b> The role is marked filled and leaves search.{others ? ` The ${others} other candidate${others === 1 ? '' : 's'} in this role get an automatic thank-you saying the role is filled (with your offer to recommend them), and their meetings are cancelled.` : ''}</p>
                <div className="hs-stop-actions"><button type="button" className="secondary-button small" onClick={() => setHiring(null)}>Cancel</button><button type="button" className="primary-button small" onClick={() => void hire(m)}><BadgeCheck size={14} /> Yes, hired</button></div></div>;
            })()}
            {stopping === m.id && <StopProcessForm match={m} onCancel={() => setStopping(null)} onDone={() => { setStopping(null); setNotice(`Feedback sent to ${m.candidate?.name || 'the candidate'} and the process is closed.`); reload(); }} />}
            {editing === m.id
              ? <StepsEditor steps={stepsFor(m)} onDone={() => setEditing(null)} onChange={(steps) => {
                  const visible = steps.filter((s) => !s.hidden);
                  const cur = visible.some((s) => s.id === m.currentStepId) ? m.currentStepId! : visible[0]?.id || '';
                  void persist(m, steps, cur);
                }} />
              : <StageTimeline match={m} canEdit={isRecruiter} onSelect={(stepId) => void persist(m, stepsFor(m), stepId)} />}
          </article>;
        })}
      </section>;
    })}
  </div>;
}
