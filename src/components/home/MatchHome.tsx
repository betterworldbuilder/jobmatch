import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Bell, Bookmark, BriefcaseBusiness, Building2, Calendar, Check, ChevronDown, Coffee, Download, Mail,
  Eye, Heart, MapPin, MessageCircle, Pencil, RotateCcw, Sparkles, Star, Target, Trash2, TrendingUp, User, X,
} from 'lucide-react';
import { api, groupsApi, jf } from '../../api';
import { primaryGroup } from '../../lib/jobGroups';
import { RolePreview } from '../jobs/RolePreview';
import { UpdateRolesButton } from '../jobs/UpdateRoles';
import { FOR_WHO, FOR_WHO_CODES, forWhoOf, type ForWho } from '../../lib/forWho';

type GroupBy = 'group' | 'workers' | 'company' | 'status' | 'none';
type SortBy = 'newest' | 'oldest' | 'title' | 'company' | 'apps' | 'matches';
import type { Bootstrap, HiringStatus, Job, JobGroup, MatchEvidence, Note, Person, RoleMatchGroup, View } from '../../types';

import { exportJobs, jobRow, type ExportFormat } from '../../lib/jobExport';

/** The candidate's public address jobsmatchnow.com/firstname.lastname (founder, 2026-11-25): copy it, turn it on/off.
 *  On = recruiters of imported roles get this link when the candidate applies. */
function PublicProfileLink({ data, setData }: { data: Bootstrap; setData: (d: Bootstrap) => void }) {
  const v = data.viewer;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!v.profileSlug) return null;
  const on = v.publicProfile !== false;
  const url = `https://jobsmatchnow.com/${v.profileSlug}`;
  const toggle = async () => {
    setBusy(true);
    try { await api.updateProfile(v.id, { publicProfile: !on }); setData(await api.bootstrap(v.id)); }
    catch (e) { window.alert(e instanceof Error ? e.message : 'Could not change this setting'); }
    finally { setBusy(false); }
  };
  return <div className={on ? 'td-public-link' : 'td-public-link off'}>
    <a href={on ? `/${v.profileSlug}` : undefined} target="_blank" rel="noopener noreferrer" title="Your public profile">jobsmatchnow.com/{v.profileSlug}</a>
    {on && <button type="button" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>}
    <button type="button" onClick={() => void toggle()} disabled={busy} aria-pressed={on} title={on ? 'Public: recruiters can open it, and it is sent with your applications to imported roles' : 'Private: nobody can open it and it is not sent'}>{on ? 'Public' : 'Private'}</button>
  </div>;
}

/** Inline recruiter email for one role (JobFinder). Saves on Enter or when leaving the field; empty clears it. */
function RoleEmailCell({ job, onSaved }: { job: Job; onSaved: () => Promise<void> | void }) {
  const [value, setValue] = useState(job.contactEmail || '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const save = async () => {
    const email = value.trim();
    if (email === (job.contactEmail || '')) return;
    setState('saving');
    try { await api.setJobContact(job.id, { email }); setState('saved'); await onSaved(); }
    catch (e) { setState('error'); window.alert(e instanceof Error ? e.message : 'Could not save the email'); }
  };
  return <span className={`td-role-email s-${state}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title="Recruiter email: visible only to you. Candidates write to Greatcandidates@jobsmatchnow.com.">
    <Mail size={11} />
    <input type="email" value={value} placeholder="Add recruiter email" aria-label={`Recruiter email for ${job.title}`}
      onChange={(e) => { setValue(e.target.value); setState('idle'); }} onBlur={() => void save()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    {job.claimUrl && <a href={job.claimUrl} target="_blank" rel="noopener noreferrer" title="Preview the recruiter's “See your candidates / claim this role” page (your visits are not counted)">Preview link</a>}
  </span>;
}

const HIRING_STATUS_OPTIONS: [HiringStatus, string][] = [['open', 'Open'], ['interviewing', 'Conducting interviews'], ['hired', 'Hired']];
import { JobDetailModal } from '../coach/CoachModals';
import { CandidateCards } from '../profile/CandidateCards';
import { CompanyLogoMark, JobHeaderBadge } from '../jobs/JobHeaderBadge';
import { NotesBox } from '../NotesBox';
import { DemoBadge } from '../DemoBadge';
import { CANDIDATE_OFFERS, LaunchOffers } from '../LaunchOffers';
import { NewMatchesSection } from './NewMatchesSection';
import { FindMatches } from '../findmatches/FindMatches';
import { featureOn } from '../../lib/flags';
import { TodayPanel } from './TodayPanel';
import { CandidatesToReview, HiringPipelineBoard } from './RecruiterSections';
import { likesWaiting } from '../../lib/today';
import { ApplicationsList } from './AppliedPage';

type HomeProps = {
  data: Bootstrap;
  setData: (data: Bootstrap) => void;
  navigate: (view: View) => void;
  onEditProfile: (step: number) => void;
  onAddJobs?: () => void;
  onOpenMessages?: (matchId: string) => void;
  onEditJob?: (jobId: string) => void;
  /** Recruiters: 'roles' = My Jobs list (roles only); 'candidates' = Jobs Candidates (everything else). */
  part?: 'roles' | 'candidates';
};

function firstName(name = 'there') {
  return name.trim().split(/\s+/)[0];
}

function factorScore(match: MatchEvidence | undefined, factor: string) {
  return match?.breakdown?.find((item) => item.factor === factor)?.score || 0;
}

function isPreciseMatch(match?: MatchEvidence) {
  return (match?.score || 0) >= 90
    && factorScore(match, 'skills') >= .9
    && factorScore(match, 'salary') >= .6
    && (factorScore(match, 'distance') >= .85 || factorScore(match, 'workMode') >= .8);
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Stars({ score = 0 }: { score?: number }) {
  const filled = score >= 95 ? 5 : score >= 90 ? 4 : score >= 80 ? 3 : 2;
  return <span className="td-stars" aria-label={`${filled} out of 5 match stars`}>
    {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={10} fill={star <= filled ? 'currentColor' : 'none'} />)}
  </span>;
}

export function DashboardTitle({ icon: Icon, title, subtitle, action, onAction, extra }: {
  icon: typeof Heart; title: string; subtitle?: string; action?: string; onAction?: () => void; extra?: React.ReactNode;
}) {
  return <header className="td-section-title">
    <div><Icon size={16} /><span><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span></div>
    {extra}
    {action && <button onClick={onAction}>{action}<ArrowRight size={13} /></button>}
  </header>;
}

function CandidateJobCard({ job, recruiter, saved, onSave, onView, onTalk }: {
  job: Job; recruiter?: Person; saved: boolean; onSave: () => void; onView: () => void; onTalk: () => void;
}) {
  const skills = job.match?.matchedSkills?.length || 0;
  return <article className="td-job-card">
    <div className="td-job-top">
      <span className="td-score">{job.match?.score || 0}% Match</span>
      <button onClick={onSave} aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /></button>
    </div>
    <div className="td-job-identity">
      <CompanyLogoMark job={job} />
      <span><strong>{job.company}</strong><small>{job.title}</small></span>
    </div>
    <Stars score={job.match?.score} />
    <div className="td-job-facts">
      <span><MapPin size={11} />{job.location || 'Location flexible'}</span>
      <span><BriefcaseBusiness size={11} />{job.workMode} · {job.type}</span>
      <span>{job.salaryHidden ? 'Salary shared after mutual match' : job.salary}</span>
      <span><Check size={11} />{skills} matching skills</span>
    </div>
    <div className="td-recruiter-line">
      {recruiter?.photo ? <img src={recruiter.photo} alt="" /> : <span className="td-avatar-fallback">{job.company.slice(0, 1)}</span>}
      <span><strong>{recruiter?.name || job.company}</strong><small>{recruiter?.title || 'Hiring team'}</small></span>
    </div>
    <div className="td-job-actions">
      <button className="secondary-button" onClick={onView}>View Match</button>
      <button className="primary-button" onClick={onTalk}>Let’s Talk</button>
    </div>
  </article>;
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="td-empty"><Sparkles size={18} /><span>{children}</span></div>;
}

/** Lightweight candidate row for the recruiter's per-job Matches / Loves-this-job lists. */
function CandidateRow({ person, matched, onView, onTalk }: { person: Person; matched?: boolean; onView: () => void; onTalk: () => void }) {
  // Photo + name open the candidate's full profile (founder, 2026-11-22).
  return <div className="td-cand-row">
    <button type="button" className="td-cand-row-open" onClick={onView} aria-label={`Open ${person.name}'s full profile`}>
      <img src={person.photo} alt="" />
      <span className="td-cand-row-info"><strong>{person.name}</strong><small>{person.title}{person.company ? ` · ${person.company}` : ''}</small></span>
    </button>
    <span className="td-cand-row-score">{person.match?.score || 0}%</span>
    <button className="td-cand-row-view" onClick={onView} aria-label={`View ${person.name}`}><Eye size={14} /></button>
    <button className={matched ? 'td-cand-row-talk matched' : 'td-cand-row-talk'} onClick={onTalk}>
      {matched ? <><MessageCircle size={13} /> Message</> : <><Heart size={13} /> Like back</>}
    </button>
  </div>;
}

export function CandidateProfileModal({ candidate, onClose, onTalk, viewerId, notes, onNoteSaved, unlocked }: {
  candidate: Person; onClose: () => void; onTalk?: () => void; viewerId?: string; notes?: Note[]; onNoteSaved?: (note: Note) => void; unlocked?: boolean;
}) {
  return <div className="mh-modal-scrim" role="presentation" onMouseDown={onClose}>
    <section className="mh-profile-modal" role="dialog" aria-modal="true" aria-label={`Recruiter view of ${candidate.name}`} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="overline">Canonical recruiter profile</span><h2>{candidate.name}</h2></div><button onClick={onClose} aria-label="Close profile"><X /></button></header>
      {(candidate.demo || candidate.sample) && <DemoBadge label={candidate.sample ? 'Starter sample candidate — auto-generated for you' : 'Demo profile — not a real candidate'} />}
      <CandidateCards person={candidate} match={candidate.match} unlocked={unlocked} />
      {viewerId && notes && onNoteSaved && <NotesBox viewerId={viewerId} targetId={candidate.id} targetType="candidate" notes={notes} onSaved={onNoteSaved} />}
      <footer><button className="secondary-button" onClick={onClose}>Back</button>{onTalk && <button className="primary-button" onClick={onTalk}><Coffee size={16} /> Let’s Talk</button>}</footer>
    </section>
  </div>;
}

/** What a recruiter actually sees pre-match: same 5-card deck, unlocked=false
 * so name/contact stay masked exactly as they would for a real recruiter. */
function ProfilePreviewModal({ viewer, onClose }: { viewer: Person; onClose: () => void }) {
  return <div className="mh-modal-scrim" role="presentation" onMouseDown={onClose}>
    <section className="mh-profile-modal" role="dialog" aria-modal="true" aria-label="How recruiters see your profile" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="overline">Recruiter preview</span><h2>{viewer.name}</h2></div><button onClick={onClose} aria-label="Close preview"><X /></button></header>
      <CandidateCards person={viewer} unlocked={false} visibilityInspector />
      <footer><button className="secondary-button" onClick={onClose}>Close preview</button></footer>
    </section>
  </div>;
}

export function CandidateHome({ data, setData, navigate, onEditProfile, onOpenMessages }: HomeProps) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const jobs = useMemo(() => [...data.jobs].sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0)), [data.jobs]);
  const matchedJobIds = new Set(data.matches.map((match) => match.jobId));
  const matchedJobs = jobs.filter((job) => matchedJobIds.has(job.id));
  // Jobs whose recruiter liked this candidate but the candidate hasn't liked back yet.
  const likesYou = jobs.filter((job) => (job.likedYou || job.superLikedYou) && !matchedJobIds.has(job.id));
  const precise = jobs.filter((job) => isPreciseMatch(job.match));
  const conversations = data.matches.slice(0, 3);
  const upcomingCalls = [...data.calls].filter((call) => call.startAt >= Date.now()).sort((a, b) => a.startAt - b.startAt);
  const completion = data.viewer.completeness || 0;

  const reload = async () => setData(await api.bootstrap(data.viewer.id));
  const [addingVariant, setAddingVariant] = useState(false);
  const [variantName, setVariantName] = useState('');
  const [variantTitle, setVariantTitle] = useState('');
  const [variantSkills, setVariantSkills] = useState('');
  const [switchingProfile, setSwitchingProfile] = useState(false);
  // Activating a variant already rewrites title/skills/desiredRoles onto the
  // live profile and reload() re-fetches the *entire* bootstrap, so every
  // section (matches, scores, everything) is already recomputed fresh from
  // the new profile — this just makes the switch feel like a real page
  // change instead of a quiet background update.
  const activateVariant = async (id: string) => {
    setSwitchingProfile(true);
    try { await api.activateProfileVariant(id, data.viewer.id); await reload(); }
    finally { setSwitchingProfile(false); }
  };
  const removeVariant = async (id: string) => { await api.deleteProfileVariant(id, data.viewer.id); await reload(); };
  // Manual refresh: re-fetches the whole bootstrap so every section below
  // (matches, jobs, invitations) reflects whichever profile is active now.
  const refreshAll = async () => {
    setSwitchingProfile(true);
    try { await reload(); } finally { setSwitchingProfile(false); }
  };
  const startAddingVariant = () => {
    setVariantName(''); setVariantTitle(data.viewer.title || ''); setVariantSkills((data.viewer.skills || []).join(', '));
    setAddingVariant(true);
  };
  const saveVariant = async () => {
    if (!variantName.trim()) return;
    await api.saveProfileVariant({
      userId: data.viewer.id, name: variantName.trim(),
      title: variantTitle.trim() || undefined,
      skills: variantSkills.trim() ? variantSkills.split(',').map((skill) => skill.trim()).filter(Boolean) : undefined,
    });
    setAddingVariant(false);
    await reload();
  };
  const toggleSave = async (job: Job) => {
    await api.toggleBookmark({ userId: data.viewer.id, targetId: job.id, targetType: 'job' });
    await reload();
  };
  const startTalk = async (job: Job) => {
    const result = await api.swipe({ actorId: data.viewer.id, targetId: job.id, targetType: 'job', direction: 'like' });
    await reload();
    navigate(result.match ? 'messages' : 'matches');
  };
  const jobCards = (items: Job[]) => items.length
    ? <div className="td-job-grid">{items.slice(0, 3).map((job) => <CandidateJobCard key={job.id} job={job} recruiter={data.matches.find((match) => match.jobId === job.id)?.employer} saved={data.bookmarkedIds.includes(job.id)} onSave={() => void toggleSave(job)} onView={() => setSelectedJob(job)} onTalk={() => void startTalk(job)} />)}</div>
    : <EmptyRow>No recruiter offers yet. Your profile remains visible to matching teams.</EmptyRow>;


  if (switchingProfile) return <div className="profile-switch-overlay">
    <div className="profile-switch-spinner" />
    <p>Loading your profile…</p>
  </div>;

  return <main className="td-dashboard td-candidate">
    {/* Profile + today: summary, urgent, next interview, search settings. */}
    <TodayPanel data={data} setData={setData} navigate={navigate} onEditProfile={onEditProfile} onOpenMessages={onOpenMessages} onPreview={() => setPreviewing(true)} onScroll={scrollTo} />
    {/* The swipe deck has its own page now: "Find My Match" (the page the app opens on). */}

    <LaunchOffers offers={CANDIDATE_OFFERS} compact />

    <section className="td-section" id="td-profile">
      <DashboardTitle icon={User} title="My Current Job Profile" subtitle="How recruiters see you." action="Edit profile" onAction={() => navigate('profile')} />
      {addingVariant && <div className="td-variant-form">
        <input value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder="Profile name, e.g. Frontend Engineer" autoFocus />
        <input value={variantTitle} onChange={(event) => setVariantTitle(event.target.value)} placeholder="Title for this persona" />
        <input value={variantSkills} onChange={(event) => setVariantSkills(event.target.value)} placeholder="Skills, comma separated" />
        <div className="td-variant-form-actions">
          <button className="secondary-button small" onClick={() => setAddingVariant(false)}>Cancel</button>
          <button className="primary-button small" onClick={() => void saveVariant()} disabled={!variantName.trim()}>Save profile</button>
        </div>
      </div>}
      <div className="td-profile-card">
        <img src={data.viewer.photo} alt="" />
        <div className="td-profile-card-info">
          <strong>{data.viewer.name}</strong>
          <span>{data.viewer.title}</span>
          <div className="td-profile-card-meta"><span>{completion}% complete</span>{data.viewer.location && <span>{data.viewer.location}</span>}</div>
          <PublicProfileLink data={data} setData={setData} />
        </div>
        <div className="td-variant-switcher td-variant-switcher-inline">
          <select
            className="td-variant-select"
            value={data.viewer.activeVariantId || 'base'}
            disabled={switchingProfile}
            onChange={(event) => { if (event.target.value !== 'base') void activateVariant(event.target.value); }}
          >
            <option value="base">{data.viewer.title || 'Default profile'} (default)</option>
            {(data.viewer.profileVariants || []).map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
          </select>
          {data.viewer.activeVariantId && <button
            type="button"
            className="td-variant-remove-btn"
            aria-label="Delete this profile"
            onClick={() => void removeVariant(data.viewer.activeVariantId!)}
          ><X size={13} /></button>}
          <button
            type="button"
            className="td-variant-refresh-btn"
            aria-label="Refresh all sections for the current profile"
            title="Refresh matches, jobs, and every section below for the current profile"
            disabled={switchingProfile}
            onClick={() => void refreshAll()}
          ><RotateCcw size={14} /></button>
          {!addingVariant && <button className="td-variant-add" onClick={startAddingVariant}>+ Create Another Profile</button>}
        </div>
        <button className="secondary-button small" onClick={() => navigate('profile')}>View profile</button>
      </div>
    </section>


    <section className="td-section" id="td-matches">
      <DashboardTitle icon={Heart} title="Job Matches" subtitle="You and these teams both said yes — start the conversation." action={`See all (${matchedJobs.length})`} onAction={() => navigate('matches')} />
      {matchedJobs.length
        ? jobCards(matchedJobs)
        : <EmptyRow>No mutual matches yet. Like a role that likes you back and it lands here.</EmptyRow>}
    </section>

    <section className="td-section" id="td-chasing">
      <DashboardTitle icon={Target} title="Recruiters that like you" subtitle="Recruiters who liked your profile — like back to match." action={`See all (${likesYou.length})`} onAction={() => navigate('discover')} />
      {jobCards(likesYou)}
    </section>

    <section className="td-bottom-grid">
      <article className="td-list-panel" id="td-conversations">
        <DashboardTitle icon={MessageCircle} title="Conversations" action="See all" onAction={() => navigate('messages')} />
        {conversations.map((match) => <button key={match.id} onClick={() => navigate('messages')}><img src={match.employer?.photo || data.viewer.photo} alt="" /><span><strong>{match.employer?.name || match.job.company}</strong><small>{data.messages.filter((message) => message.matchId === match.id).at(-1)?.text || match.job.title}</small></span></button>)}
      </article>
      <article className="td-list-panel" id="td-coffee">
        <DashboardTitle icon={Coffee} title="Coffee Invitations" action="See all" onAction={() => navigate('meetings')} />
        {upcomingCalls.length
          ? upcomingCalls.slice(0, 4).map((call) => {
            const callMatch = data.matches.find((m) => m.id === call.matchId);
            return <button key={call.id} onClick={() => navigate('meetings')}>
              <img src={callMatch?.employer?.photo || data.viewer.photo} alt="" />
              <span><strong>{callMatch?.employer?.name || callMatch?.job.company}</strong><small>{new Date(call.startAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {call.title}</small></span>
            </button>;
          })
          : <EmptyRow>No meet-ups scheduled yet.</EmptyRow>}
      </article>
      <article className="td-list-panel td-improve">
        <DashboardTitle icon={Sparkles} title="Make Your Profile Stronger" />
        {[['Add salary expectations', 'Used by the match score', 2], ['Record a 60-sec introduction', 'Lets teams hear you before a call', 3], ['Add a recommendation', 'Verified by a colleague’s email', 5]].map(([title, note, step]) => <button key={title as string} onClick={() => onEditProfile(step as number)}><span><Pencil size={13} /></span><span><strong>{title}</strong><small>{note}</small></span></button>)}
        <button className="secondary-button" onClick={() => onEditProfile(0)}>Complete My Profile</button>
      </article>
    </section>

    <div className="td-tip"><Sparkles size={13} /> Tip: Add your salary and work-mode preferences so the match score can use them.</div>

    {selectedJob && <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />}
    {previewing && <ProfilePreviewModal viewer={data.viewer} onClose={() => setPreviewing(false)} />}
  </main>;
}

export function RecruiterHome({ data, setData, navigate, onEditProfile, onAddJobs, onOpenMessages, onEditJob, part = 'roles' }: HomeProps) {
  const [selected, setSelected] = useState<Person | null>(null);
  // "How candidates see this role" preview (founder, 2026-11-22).
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  const [expandedId, setExpandedId] = useState('');
  const [bestMatchFirst, setBestMatchFirst] = useState(true);
  const groups: RoleMatchGroup[] = data.roleMatches?.length
    ? data.roleMatches
    : data.jobs.filter((job) => job.employerId === data.viewer.id).map((job) => ({
      job,
      candidates: data.candidates.filter((candidate) => candidate.likedYou),
      matchingCandidates: data.candidates.filter((candidate) => isPreciseMatch(candidate.match)),
      interestedCount: 0,
      newCount: 0,
    }));
  const roles = groups.length ? groups : data.jobs.slice(0, 1).map((job) => ({ job, candidates: [], matchingCandidates: [], interestedCount: 0, newCount: 0 }));
  const openId = expandedId === '__none__' ? '' : expandedId || roles[0]?.job.id || '';
  const allPeople = [...new Map(roles.flatMap((group) => [...group.candidates, ...(group.matchingCandidates || [])]).map((person) => [person.id, person])).values()];
  const interested = [...new Map(roles.flatMap((group) => group.candidates).map((person) => [person.id, person])).values()];
  const topRole = [...roles].sort((a, b) => ((b.matchingCandidates?.length || 0) + b.candidates.length) - ((a.matchingCandidates?.length || 0) + a.candidates.length))[0];

  const reload = async () => setData(await api.bootstrap(data.viewer.id));
  // Drafts in the role list (founder, 2026-11-26): imported JobFinder drafts were invisible here. Draft badge, Publish
  // (one or all), and a Show filter. JobFinder listings publish through the JobFinder route; others go active.
  const [show, setShow] = useState<'all' | 'live' | 'draft'>('all');
  const [publishing, setPublishing] = useState('');
  const isDraft = (job: Job) => String(job.status).toLowerCase() === 'draft';
  const drafts = roles.filter((g) => g.job.employerId === data.viewer.id && isDraft(g.job)).map((g) => g.job);
  // Workers filter (founder, 2026-11-26; was on the JobFinder listings page): roles for Vietnam-, US-, EU / UK-based… workers.
  const [workers, setWorkers] = useState('');
  const workerCodes = [...new Set(roles.flatMap((g) => forWhoOf(g.job)))];
  const shownRoles = roles.filter((g) => (show === 'all' ? true : show === 'draft' ? isDraft(g.job) : !isDraft(g.job)))
    .filter((g) => !workers || (workers === 'none' ? !forWhoOf(g.job).length : forWhoOf(g.job).includes(workers as ForWho)));
  // Group by + sort by, combined (founder, 2026-11-26). Choices remembered on this device.
  const [groupBy, setGroupByState] = useState<GroupBy>(() => { try { return (localStorage.getItem('jm-roles-group') as GroupBy) || 'group'; } catch { return 'group'; } });
  const [sortBy, setSortByState] = useState<SortBy>(() => { try { return (localStorage.getItem('jm-roles-sort') as SortBy) || 'newest'; } catch { return 'newest'; } });
  const setGroupBy = (v: GroupBy) => { setGroupByState(v); try { localStorage.setItem('jm-roles-group', v); } catch { /* private mode */ } };
  const setSortBy = (v: SortBy) => { setSortByState(v); try { localStorage.setItem('jm-roles-sort', v); } catch { /* private mode */ } };
  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  useEffect(() => { groupsApi.list().then((r) => setJobGroups(r.groups)).catch(() => undefined); }, []);
  const appsOf = (g: RoleMatchGroup) => g.candidates.length;
  const matchesOf = (g: RoleMatchGroup) => data.matches.filter((m) => m.jobId === g.job.id).length;
  const byText = (a?: string, b?: string) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
  const sortRoles = (list: RoleMatchGroup[]) => list.slice().sort((a, b) => {
    switch (sortBy) {
      case 'oldest': return (a.job.createdAt || 0) - (b.job.createdAt || 0);
      case 'title': return byText(a.job.title, b.job.title);
      case 'company': return byText(a.job.company, b.job.company) || byText(a.job.title, b.job.title);
      case 'apps': return appsOf(b) - appsOf(a) || (b.job.createdAt || 0) - (a.job.createdAt || 0);
      case 'matches': return matchesOf(b) - matchesOf(a) || (b.job.createdAt || 0) - (a.job.createdAt || 0);
      default: return (b.job.createdAt || 0) - (a.job.createdAt || 0);
    }
  });
  type Section = { key: string; label: string; items: RoleMatchGroup[] };
  const sections: Section[] = (() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All roles', items: sortRoles(shownRoles) }];
    const keyOf = (g: RoleMatchGroup): [string, string] => {
      if (groupBy === 'group') { const id = primaryGroup(jobGroups, g.job); return [id || 'zz-other', jobGroups.find((x) => x.id === id)?.name || 'Other']; }
      if (groupBy === 'workers') { const c = forWhoOf(g.job)[0]; return [c ? String(FOR_WHO_CODES.indexOf(c)).padStart(2, '0') : 'zz', c ? `For ${FOR_WHO[c]}` : 'For who not known']; }
      if (groupBy === 'company') { const c = (g.job.company || '').trim(); return [c ? c.toLowerCase() : 'zz', c || 'Company not stated']; }
      return isDraft(g.job) ? ['b', 'Drafts'] : ['a', 'Live'];
    };
    const map = new Map<string, Section>();
    for (const g of shownRoles) { const [key, label] = keyOf(g); if (!map.has(key)) map.set(key, { key, label, items: [] }); map.get(key)!.items.push(g); }
    const order = groupBy === 'group' ? (k: string) => (k === 'zz-other' ? 999 : jobGroups.findIndex((x) => x.id === k)) : null;
    return [...map.values()].sort((a, b) => (order ? order(a.key) - order(b.key) : a.key.localeCompare(b.key))).map((s) => ({ ...s, items: sortRoles(s.items) }));
  })();
  // "+ Add group" (JobFinder): a custom group with title keywords; matching roles join it at once.
  const addGroup = async () => {
    const name = window.prompt('Name of the new job group (e.g. SAP, Product Management, Sales):')?.trim();
    if (!name) return;
    const keywords = window.prompt(`Words in a role title that put it in "${name}", comma separated (e.g. sap, abap, s/4hana):`, name.toLowerCase())?.trim() || '';
    try {
      const r = await jf.addGroup({ name, keywords });
      setJobGroups((await groupsApi.list()).groups);
      await reload();
      window.alert(`Group "${r.group.name}" added: ${r.added} role(s) joined it. It also has its own public page: jobsmatchnow.com/app/${r.group.slug}`);
    } catch (e) { window.alert(e instanceof Error ? e.message : 'Could not add the group'); }
  };
  const publishOne = async (job: Job) => (job.jobFinder ? jf.update(job.id, { action: 'publish' }) : api.updateJob(job.id, { status: 'active' }));
  const publish = async (jobs: Job[]) => {
    if (!jobs.length || publishing) return;
    if (jobs.length > 1 && !window.confirm(`Publish all ${jobs.length} drafts?\n\nCandidates will see them in Surf and on the public job pages. Check skills, salary and work mode first if you haven't.`)) return;
    setPublishing(jobs.length === 1 ? jobs[0].id : 'all');
    const failed: string[] = [];
    try {
      for (const job of jobs) { try { await publishOne(job); } catch (e) { failed.push(`${job.title}: ${e instanceof Error ? e.message : 'could not publish'}`); } }
      await reload();
    } finally { setPublishing(''); }
    if (failed.length) window.alert(`${failed.length} not published:\n\n${failed.slice(0, 8).join('\n')}${failed.length > 8 ? '\n…' : ''}\n\nOpen the role with the pencil, complete it, then publish.`);
  };
  // Remove duplicates (founder, 2026-11-26), JobFinder account: preview, confirm, then the extra copies go off the site
  // (kept: the role with applications/matches, else the oldest). Imports also clean duplicates on their own.
  const [deduping, setDeduping] = useState(false);
  const removeDuplicates = async () => {
    setDeduping(true);
    try {
      const preview = await jf.dedupe({ dryRun: true });
      if (!preview.removed) { window.alert('No duplicate roles found.'); return; }
      const lines = preview.groups.filter((g) => g.removed.length).slice(0, 12).map((g) => `• ${g.keep.title}${g.keep.company ? ` · ${g.keep.company}` : ''}: ${g.removed.length} copy(ies)`);
      if (!window.confirm(`${preview.removed} duplicate role(s) found:\n\n${lines.join('\n')}${preview.groups.length > 12 ? '\n…' : ''}\n\nRemove the extra copies? One role of each stays (the one with applications, else the oldest). Copies with applications of their own are kept.`)) return;
      const done = await jf.dedupe({});
      await reload();
      window.alert(`${done.removed} duplicate role(s) removed.`);
    } catch (e) { window.alert(e instanceof Error ? e.message : 'Could not check duplicates'); }
    finally { setDeduping(false); }
  };
  // Delete one role / all roles (founder, 2026-11-25). Always confirmed: a deleted role takes its matches and chats with it.
  const [deleting, setDeleting] = useState(false);
  const deleteRoles = async (jobs: Job[]) => {
    if (!jobs.length || deleting) return;
    const one = jobs.length === 1;
    const question = one
      ? `Delete "${jobs[0].title}"?\n\nIts matches and conversations are deleted too. This cannot be undone.`
      : `Delete all ${jobs.length} job offers?\n\nTheir matches and conversations are deleted too. This cannot be undone.`;
    if (!window.confirm(question)) return;
    setDeleting(true);
    let failed = 0;
    try {
      for (const job of jobs) { try { await api.deleteJob(job.id); } catch { failed += 1; } }
      await reload();
    } finally { setDeleting(false); }
    if (failed) window.alert(`${failed} job ${failed === 1 ? 'offer' : 'offers'} could not be deleted. Try again.`);
  };
  // Status per role: the recruiter's pick, else automatic (filled → Hired, an interview booked → Conducting interviews).
  const statusOf = (job: Job): HiringStatus => {
    if (job.hiringStatus) return job.hiringStatus;
    if (job.status === 'filled') return 'hired';
    const matchIds = new Set(data.matches.filter((match) => match.jobId === job.id).map((match) => match.id));
    return data.calls.some((call) => matchIds.has(call.matchId)) ? 'interviewing' : 'open';
  };
  // Export all own roles, past and current (drafts and filled included), for the recruiter's ATS (founder, 2026-11-25).
  const ownJobs = data.jobs.filter((job) => job.employerId === data.viewer.id);
  const runExport = (format: ExportFormat) => {
    exportJobs(format, ownJobs.map((job) => jobRow(job, HIRING_STATUS_OPTIONS.find(([v]) => v === statusOf(job))?.[1] || '')));
  };
  const [statusSaving, setStatusSaving] = useState('');
  // Recruiter email column: JobFinder account only (founder, 2026-11-25); candidates never see it.
  const showEmail = Boolean(data.viewer.jobFinder);
  const setRoleStatus = async (job: Job, hiringStatus: HiringStatus) => {
    setStatusSaving(job.id);
    try { await api.updateJob(job.id, { hiringStatus }); await reload(); }
    catch (e) { window.alert(e instanceof Error ? e.message : 'Could not change the status'); }
    finally { setStatusSaving(''); }
  };
  const talk = async (person: Person) => {
    const result = await api.swipe({ actorId: data.viewer.id, targetId: person.id, targetType: 'candidate', direction: 'like' });
    await reload();
    navigate(result.match ? 'messages' : 'matches');
  };
  const sortFn = (a: Person, b: Person) => data.viewer.demo && (a.demoOrder || b.demoOrder)
    ? (a.demoOrder || 99) - (b.demoOrder || 99)
    : bestMatchFirst ? (b.match?.score || 0) - (a.match?.score || 0) : a.name.localeCompare(b.name);

  const upcomingCalls = [...data.calls].filter((call) => call.startAt >= Date.now()).sort((a, b) => a.startAt - b.startAt);

  // Founder, 2026-11-26: "My Jobs list" shows only the roles; everything else (matches, applications, today, pipeline,
  // candidates to review, recent views, coffee, conversations) is on "Jobs Candidates".
  const modals = <>
    {previewJob && <RolePreview job={previewJob} recruiter={data.viewer} onClose={() => setPreviewJob(null)} onEdit={onEditJob ? () => { const id = previewJob.id; setPreviewJob(null); onEditJob(id); } : undefined} />}
    {selected && <CandidateProfileModal candidate={selected} onClose={() => setSelected(null)} onTalk={() => { const person = selected; setSelected(null); void talk(person); }} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />}
  </>;
  if (part === 'candidates') return <main className="td-dashboard td-recruiter">
    <header className="td-recruiter-head">
      <div><h1 className="td-recruiter-title">Jobs Candidates</h1><p>Your matches, the candidates who applied, and what needs you today.</p></div>
    </header>
    {/* Every mutual match, newest first, with its role. */}
    <section className="td-section" id="td-all-matches">
      <DashboardTitle icon={Check} title={`My matches (${data.matches.length})`} subtitle="Candidates who liked your role and you liked back: open the chat." />
      <div className="td-role-sublist">
        {data.matches.length
          ? [...data.matches].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((match) => <div key={match.id} className="td-match-item">
            <small className="td-match-role"><BriefcaseBusiness size={11} /> {data.jobs.find((j) => j.id === match.jobId)?.title || match.job?.title || 'Role'}</small>
            <CandidateRow person={match.candidate} matched onView={() => setSelected(match.candidate)} onTalk={() => onOpenMessages ? onOpenMessages(match.id) : navigate('messages')} />
          </div>)
          : <EmptyRow>No matches yet. Like back the candidates who applied to open a chat.</EmptyRow>}
      </div>
    </section>
    {/* Applications (likes) per role. */}
    <ApplicationsList data={data} setData={setData} navigate={navigate} onOpenMessages={onOpenMessages} compact />
    <TodayPanel data={data} setData={setData} navigate={navigate} onEditProfile={onEditProfile} onOpenMessages={onOpenMessages} onScroll={scrollTo} />
    <HiringPipelineBoard data={data} navigate={navigate} />
    <CandidatesToReview data={data} setData={setData} onView={setSelected} onOpenMessages={onOpenMessages} />
    <section className="td-bottom-grid recruiter">
      <article className="td-list-panel" id="td-recent"><DashboardTitle icon={Eye} title="Recently Viewed Your Jobs" />{allPeople.slice(0, 4).map((person) => <button key={person.id} onClick={() => setSelected(person)}><img src={person.photo} alt="" /><span><strong>{person.name}</strong><small>Viewed a role recently</small></span><ArrowRight size={12} /></button>)}</article>
      <article className="td-list-panel" id="td-coffee">
        <DashboardTitle icon={Coffee} title="Coffee Requests" action="See all" onAction={() => navigate('meetings')} />
        {upcomingCalls.length
          ? upcomingCalls.slice(0, 4).map((call) => {
            const match = data.matches.find((m) => m.id === call.matchId);
            return <button key={call.id} onClick={() => navigate('meetings')}>
              <img src={match?.candidate.photo} alt="" />
              <span><strong>{match?.candidate.name}</strong><small>{new Date(call.startAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {call.title}</small></span>
              <ArrowRight size={12} />
            </button>;
          })
          : <EmptyRow>No calls scheduled yet — propose one from a match.</EmptyRow>}
      </article>
      <article className="td-list-panel" id="td-conversations"><DashboardTitle icon={MessageCircle} title="Active Conversations" />{data.matches.slice(0, 4).map((match) => <button key={match.id} onClick={() => navigate('messages')}><img src={match.candidate.photo} alt="" /><span><strong>{match.candidate.name}</strong><small>{data.messages.filter((message) => message.matchId === match.id).at(-1)?.text || match.job.title}</small></span><Bell size={12} /></button>)}</article>
    </section>
    {modals}
  </main>;

  return <main className="td-dashboard td-recruiter">
    <header className="td-recruiter-head">
      <div><h1 className="td-recruiter-title">Your roles today</h1><p>Here’s who loves your jobs today.</p></div>
      <button className="primary-button" onClick={onAddJobs}>+ Add New Job Offers</button>
    </header>
    <section className="td-section td-role-section" id="td-roles">
      <DashboardTitle icon={BriefcaseBusiness} title="My roles" subtitle="Each role, with its matches and the candidates who love it — not matched yet."
        extra={ownJobs.length || data.viewer.jobFinder ? <span className="td-role-tools">
          {data.viewer.jobFinder && <UpdateRolesButton onDone={() => void reload()} />}
          {data.viewer.jobFinder && <button type="button" className="td-dedupe" onClick={() => void removeDuplicates()} disabled={deduping}>{deduping ? 'Checking…' : 'Remove duplicates'}</button>}
          {data.viewer.jobFinder && <button type="button" className="td-dedupe" onClick={() => void addGroup()}>+ Add group</button>}
          {drafts.length > 0 && <button type="button" className="td-publish-all" onClick={() => void publish(drafts)} disabled={Boolean(publishing)}>{publishing === 'all' ? 'Publishing…' : `Publish all drafts (${drafts.length})`}</button>}
          {ownJobs.length > 0 && <details className="td-export">
            <summary><Download size={13} /> Export</summary>
            <div className="td-export-menu" role="menu">
              <button role="menuitem" onClick={(e) => { runExport('xlsx'); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>Excel (.xlsx)</button>
              <button role="menuitem" onClick={(e) => { runExport('csv'); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>ATS CSV (.csv)</button>
              <button role="menuitem" onClick={(e) => { runExport('json'); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>ATS JSON feed (.json)</button>
              <button role="menuitem" onClick={(e) => { runExport('xml'); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>XML job feed (.xml)</button>
              <small>All {ownJobs.length} of your roles, past and current. The CSV uses the same columns as Import.</small>
            </div>
          </details>}
          {roles.some((group) => group.job.employerId === data.viewer.id) && <button className="td-delete-all" onClick={() => void deleteRoles(roles.map((group) => group.job).filter((job) => job.employerId === data.viewer.id))} disabled={deleting}><Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete all jobs'}</button>}
        </span> : null} />
      {/* Group by + sort by (founder, 2026-11-26): combined, e.g. by job group, newest first inside each group. */}
      <div className="td-role-toolbar">
        <label>Group by<select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          <option value="group">Job group</option><option value="workers">Workers (For who)</option><option value="company">Company</option><option value="status">Live / draft</option><option value="none">No grouping</option>
        </select></label>
        <label>Sort by<select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="company">Company A–Z</option><option value="apps">Most applications</option><option value="matches">Most matches</option>
        </select></label>
        {workerCodes.length > 1 && <label>Workers<select value={workers} onChange={(e) => setWorkers(e.target.value)}>
          <option value="">All workers</option>{workerCodes.map((c) => <option key={c} value={c}>For {FOR_WHO[c]}</option>)}<option value="none">For who not known</option>
        </select></label>}
        {drafts.length > 0 && <label>Show<select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
          <option value="all">All roles ({roles.length})</option><option value="live">Live ({roles.length - drafts.length})</option><option value="draft">Drafts ({drafts.length})</option>
        </select></label>}
        <label>Candidates<select value={bestMatchFirst ? 'best' : 'name'} onChange={(e) => setBestMatchFirst(e.target.value === 'best')}>
          <option value="best">Best match first</option><option value="name">By name</option>
        </select></label>
      </div>
      <div className="td-role-list">
        {sections.map((sec) => <Fragment key={sec.key}>
        {groupBy !== 'none' && <h3 className="td-group-head">{sec.label} <span>{sec.items.length}</span></h3>}
        {sec.items.map((group) => {
          const open = group.job.id === openId;
          const matchedForJob = data.matches.filter((match) => match.jobId === group.job.id);
          const matchedIds = new Set(matchedForJob.map((match) => match.candidateId));
          const lovesNotMatched = [...group.candidates].filter((candidate) => !matchedIds.has(candidate.id)).sort(sortFn);
          const status = statusOf(group.job);
          const own = group.job.employerId === data.viewer.id;
          return <article className={open ? 'td-role open' : 'td-role'} key={group.job.id}>
            <div className={showEmail ? 'td-role-head has-email' : 'td-role-head'} role="button" tabIndex={0} onClick={() => setExpandedId(open ? '__none__' : group.job.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedId(open ? '__none__' : group.job.id); } }} aria-expanded={open}>
              <JobHeaderBadge job={group.job} compact actions={<>
                {group.job.employerId === data.viewer.id && <button className="td-role-edit td-role-delete" onClick={(event) => { event.stopPropagation(); void deleteRoles([group.job]); }} disabled={deleting} aria-label={`Delete ${group.job.title}`} title="Delete this job offer"><Trash2 size={12} /></button>}
                <button className="td-role-edit" onClick={(event) => { event.stopPropagation(); setPreviewJob(group.job); }} aria-label={`How candidates see ${group.job.title}`} title="How candidates see this role"><Eye size={12} /></button>
                <button className="td-role-edit" onClick={(event) => { event.stopPropagation(); onEditJob?.(group.job.id); }} aria-label={`Edit ${group.job.title}`}><Pencil size={12} /></button>
              </>} />
              {/* Status column (founder, 2026-11-25): Open / Conducting interviews / Hired. Automatic until the recruiter picks one. */}
              <span className={`td-role-status s-${status}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} title={group.job.hiringStatus ? 'Status set by you' : 'Automatic status: change it here'}>
                {own
                  ? <select value={status} disabled={statusSaving === group.job.id} aria-label={`Status of ${group.job.title}`} onChange={(event) => void setRoleStatus(group.job, event.target.value as HiringStatus)}>
                    {HIRING_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  : HIRING_STATUS_OPTIONS.find(([value]) => value === status)?.[1]}
              </span>
              {own && isDraft(group.job) && <span className="td-role-draft" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                <em>Draft · not visible to candidates</em>
                <button type="button" onClick={() => void publish([group.job])} disabled={Boolean(publishing)}>{publishing === group.job.id ? 'Publishing…' : 'Publish'}</button>
              </span>}
              {group.job.createdAt ? <span className="td-role-date" title="Date created"><Calendar size={12} /> Created {new Date(group.job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span> : null}
              {showEmail && <RoleEmailCell job={data.jobs.find((j) => j.id === group.job.id) || group.job} onSaved={reload} />}
              <span><Check size={12} /> {matchedForJob.length} matched</span>
              <span><Heart size={12} /> {lovesNotMatched.length} love this job</span>
              <button onClick={(event) => { event.stopPropagation(); navigate('discover'); }}>Review candidates <ArrowRight size={11} /></button>
              <ChevronDown size={16} />
            </div>
            {open && <div className="td-role-body">
              <div className="td-role-sublist">
                <span className="td-sublabel"><Check size={12} /> Matches ({matchedForJob.length})</span>
                {matchedForJob.length
                  ? matchedForJob.map((match) => <CandidateRow key={match.id} person={match.candidate} matched onView={() => setSelected(match.candidate)} onTalk={() => onOpenMessages ? onOpenMessages(match.id) : navigate('messages')} />)
                  : <EmptyRow>No mutual matches yet for this role.</EmptyRow>}
              </div>
              {/* "Loves this job · not matched yet" removed (founder, 2026-11-26): applicants are on Jobs Candidates. */}
            </div>}
          </article>;
        })}
        </Fragment>)}
      </div>
    </section>
    {modals}
  </main>;
}
