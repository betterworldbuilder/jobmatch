// Home "Look for new Matches": the Discover deck inside a big dark phone (full
// screen on mobile), an in-phone "It's a Match!" screen, and the "Recommended Roles"
// list. Same deck rules and API calls as Discover via useDiscoverDeck; only real
// values are shown.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import type { PanInfo } from 'motion/react';
import { ArrowRight, ChevronsRight, Heart, MapPin, MessageCircle, RotateCcw, Star, X } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { Bootstrap, Job, JobMatch, Person, View } from '../../types';
import { JobDetailModal, ScreeningModal } from '../coach/CoachModals';
import { CompanyLogoMark } from '../jobs/JobHeaderBadge';
import { EmptyDeck, SalaryBadge } from '../discover/DeckParts';
import { considerList, needsScreening, showsCommute, swipeFromDrag, swipeFromKey } from '../discover/deckLogic';
import { useDiscoverDeck } from '../discover/useDiscoverDeck';

type Props = {
  data: Bootstrap;
  setData: (data: Bootstrap) => void;
  navigate: (view: View) => void;
  /** "Let's Talk" opens this match's conversation; falls back to the Conversations page. */
  onOpenMessages?: (matchId: string) => void;
  /** Section title row, rendered by the home page (keeps DashboardTitle in one place). */
  header?: React.ReactNode;
};

function assetUrl(value: string) {
  return /^(https?:|data:|blob:)/i.test(value) ? value : `${apiBase}${value.startsWith('/') ? '' : '/'}${value}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || '?';
}

/** Only logos a team uploaded to us; third-party logo URLs (e.g. logo services) fall back to initials. */
export function ownLogo(job: Job): Job {
  return job.companyLogo && /^https?:/i.test(job.companyLogo) ? { ...job, companyLogo: undefined } : job;
}

/** Full-bleed card photo: the role's cover image, else the hiring contact's photo, else none. */
export function cardPhoto(job: Job) {
  return job.coverImage || job.recruiter?.photo || '';
}

/** "Matches your React, Node, SQL · 92%". Score only when it really exists. */
export function fitReason(job: Job) {
  const skills = job.match?.matchedSkills?.slice(0, 3) || [];
  const score = typeof job.match?.score === 'number' ? `${job.match.score}%` : '';
  if (!skills.length) return score ? `${score} fit` : '';
  return `Matches your ${skills.join(', ')}${score ? ` · ${score}` : ''}`;
}

function SalaryLine({ job }: { job: Job }) {
  return <span className="nm-salary">
    {!job.salaryHidden && job.salary && <b className="nm-salary-pill">{job.salary}</b>}
    {(job.salaryHidden || job.match?.salaryStatus) && <SalaryBadge status={job.match?.salaryStatus} />}
  </span>;
}

function PhoneBrand() {
  return <span className="nm-brand"><span className="brand-heart-mark nm-logo" aria-hidden="true" /><span className="brand-wordmark"><b>Jobs</b><b>Match</b><b>Now</b></span></span>;
}

function PhoneJobCard({ job, reducedMotion, canLike, onSwipe, onOpen }: {
  job: Job; reducedMotion: boolean; canLike: boolean; onSwipe: (action: 'like' | 'pass' | 'super') => void; onOpen: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], reducedMotion ? [0, 0] : [-12, 12]);
  const likeOpacity = useTransform(x, [20, 110], [0, 1]);
  const nopeOpacity = useTransform(x, [-110, -20], [1, 0]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const action = swipeFromDrag(info.offset, info.velocity);
    if (!action || ((action === 'like' || action === 'super') && !canLike)) return;
    onSwipe(action);
  };
  const reason = fitReason(job);
  const photo = cardPhoto(job);
  const recruiterShown = !job.coverImage && job.recruiter?.photo && job.recruiter.name;
  return <motion.article
    className="nm-card"
    style={{ x, y, rotate }}
    drag
    dragSnapToOrigin
    dragElastic={0.6}
    onDragEnd={onDragEnd}
    initial={reducedMotion ? { opacity: 0 } : { scale: .95, y: 8, opacity: 0 }}
    animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: .9 }}
    transition={{ duration: reducedMotion ? .15 : .25 }}
  >
    <div className="nm-photo" style={photo ? { backgroundImage: `url(${assetUrl(photo)})` } : undefined}>
      {!photo && <span className="nm-initials" aria-hidden="true">{initials(job.company)}</span>}
    </div>
    <motion.span className="nm-stamp like" style={{ opacity: likeOpacity }} aria-hidden="true">LIKE</motion.span>
    <motion.span className="nm-stamp nope" style={{ opacity: nopeOpacity }} aria-hidden="true">NOPE</motion.span>
    <div className="nm-card-info">
      {recruiterShown && <p className="nm-hiring">Hiring: {job.recruiter!.name}{job.recruiter!.title ? ` · ${job.recruiter!.title}` : ''}</p>}
      <h3>{job.title}</h3>
      <p className="nm-company">{job.company}{job.experienceLevel ? ` · ${job.experienceLevel}` : ''}</p>
      <div className="nm-chips">
        <SalaryLine job={job} />
        {job.workMode === 'Remote'
          ? <span className="nm-chip">Remote</span>
          : showsCommute(job) && <span className="nm-chip"><MapPin size={11} /> {job.distanceKm} km away</span>}
        {reason && <span className="nm-chip">{reason}</span>}
      </div>
      <button type="button" className="nm-full-role" onPointerDownCapture={(event) => event.stopPropagation()} onClick={onOpen}>Full role ›</button>
    </div>
  </motion.article>;
}

function Face({ photo, name, fallback }: { photo?: string; name: string; fallback?: React.ReactNode }) {
  return <span className="nm-face">{photo ? <img src={assetUrl(photo)} alt="" /> : fallback || <b>{initials(name)}</b>}</span>;
}

/** "It's a Match!" inside the phone (full screen on mobile). Real names and photos only. */
export function PhoneMatch({ match, viewer, onTalk, onKeepSwiping }: { match: JobMatch; viewer: Person; onTalk: () => void; onKeepSwiping: () => void }) {
  const talkRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { talkRef.current?.focus(); }, []);
  const other = match.employer;
  const otherName = other?.name || match.job?.company || 'the team';
  const otherLine = other ? (other.title || (match.job ? `Recruiter at ${match.job.company}` : '')) : match.job?.title || '';
  const me = match.candidate || viewer;
  return <motion.div
    className="nm-match" role="dialog" aria-modal="false" aria-labelledby="nm-match-title"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    onKeyDown={(event) => { if (event.key === 'Escape') onKeepSwiping(); }}
  >
    <PhoneBrand />
    <h3 id="nm-match-title" className="nm-match-script">It&rsquo;s a Match!</h3>
    <p className="nm-match-sub">You and {otherName.split(' ')[0]} have mutually matched.</p>
    <div className="nm-match-faces">
      <div><Face photo={me.photo || viewer.photo} name={me.name || viewer.name} /><strong>{me.name || viewer.name}</strong>{(me.title || viewer.title) && <small>{me.title || viewer.title}</small>}</div>
      <span className="nm-match-heart" aria-hidden="true"><Heart size={20} fill="currentColor" /></span>
      <div><Face photo={other?.photo} name={otherName} fallback={match.job ? <CompanyLogoMark job={ownLogo(match.job)} /> : undefined} /><strong>{otherName}</strong>{otherLine && <small>{otherLine}</small>}</div>
    </div>
    <button ref={talkRef} type="button" className="nm-talk" onClick={onTalk}><MessageCircle size={18} /> Let&rsquo;s Talk</button>
    <button type="button" className="nm-keep" onClick={onKeepSwiping}><ChevronsRight size={18} /> Keep swiping</button>
  </motion.div>;
}

export function NewMatchesSection({ data, setData, navigate, onOpenMessages, header }: Props) {
  const reducedMotion = Boolean(useReducedMotion());
  const [likedFromList, setLikedFromList] = useState<string[]>([]);
  // After a swipe that creates a match, refresh so "Job Matches" below updates.
  const deckState = useDiscoverDeck('candidate', data, setData, {
    onSwiped: (result) => { if (result.match) api.bootstrap(data.viewer.id).then(setData).catch(() => undefined); },
    skipIds: likedFromList,
  });
  const { deck, filtered, index, setIndex, current, next, busy, match, setMatch, screeningFor, setScreeningFor, commitSwipe, act, undo } = deckState;
  const [detail, setDetail] = useState<Job | null>(null);
  const canLike = data.likesRemaining > 0;
  const job = current as Job | undefined;
  const list = considerList(filtered, deck, index).filter((item) => !likedFromList.includes(item.id)) as Job[];

  const run = (action: 'like' | 'pass' | 'super' | 'undo') => {
    if (action === 'undo') { void undo(); return; }
    if (action !== 'pass' && !canLike) return;
    if (action === 'super') act('like', true);
    else act(action);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const action = swipeFromKey(event.key);
    if (!action || (action !== 'undo' && !current)) return;
    event.preventDefault();
    run(action);
  };
  const likeFromList = (item: Job) => {
    if (!canLike) return;
    if (needsScreening('candidate', item, 'like', false)) { setScreeningFor(item); return; }
    setLikedFromList((ids) => [...ids, item.id]);
    void commitSwipe('like', item);
  };
  const talk = (matched: JobMatch) => { setMatch(null); if (onOpenMessages) onOpenMessages(matched.id); else navigate('messages'); };
  const counter = deck.length ? `${Math.min(index + 1, deck.length)} / ${deck.length}` : '0 / 0';

  return <section className="td-section td-new-matches" id="td-new-matches">
    {header}
    <div className="nm-layout">
      <div className="nm-phone-col">
        <div className="nm-glow" aria-hidden="true" />
        <div className="nm-phone">
          <span className="nm-island" aria-hidden="true" />
          <div className="nm-screen">
            <div className="nm-deck" role="region" aria-label="New matches deck" tabIndex={0} onKeyDown={onKeyDown}>
              <header className="nm-head">
                <button type="button" className="nm-undo-top" onClick={() => void undo()} disabled={busy || index === 0} aria-label="Undo last swipe"><RotateCcw size={15} /></button>
                <PhoneBrand />
                <span className="nm-count" aria-live="polite">{counter}</span>
              </header>
              <div className="nm-stack">
                {next && job && <div className="nm-card nm-peek" aria-hidden="true" />}
                <AnimatePresence mode="popLayout">
                  {job
                    ? <PhoneJobCard key={job.id} job={job} reducedMotion={reducedMotion} canLike={canLike} onSwipe={run} onOpen={() => setDetail(job)} />
                    : <EmptyDeck key="empty" role="candidate" title="You've seen today's top picks" text="A chat opens only when a team likes you back." resetLabel="Start over" onReset={() => setIndex(0)}>
                      <button type="button" className="secondary-button" onClick={() => navigate('discover')}>Open Discover</button>
                    </EmptyDeck>}
                </AnimatePresence>
              </div>
              {job && <div className="nm-actions">
                <button type="button" className="nm-btn pass" onClick={() => run('pass')} disabled={busy} aria-label="Pass"><X size={28} strokeWidth={3} /></button>
                <button type="button" className="nm-btn super" onClick={() => run('super')} disabled={busy || !canLike} aria-label="Super Like"><Star size={22} fill="currentColor" /></button>
                <button type="button" className="nm-btn like" onClick={() => run('like')} disabled={busy || !canLike} aria-label="Like"><Heart size={26} fill="currentColor" /></button>
              </div>}
              {job && !canLike && <p className="nm-no-likes">No likes left today</p>}
            </div>
            <span className="nm-home-bar" aria-hidden="true" />
            <AnimatePresence>{match && <PhoneMatch key={match.id} match={match} viewer={data.viewer} onTalk={() => talk(match)} onKeepSwiping={() => setMatch(null)} />}</AnimatePresence>
          </div>
        </div>
        <div className="keyboard-hint nm-hint"><span><kbd>←</kbd> Pass</span><span><kbd>↑</kbd> Super Like</span><span><kbd>→</kbd> Like</span><span>Click the deck first</span></div>
      </div>
      <aside className="nm-list" id="td-recommended" aria-label="Recommended Roles">
        <h3>Recommended Roles</h3>
        {list.length
          ? <ul>{list.map((item) => <li key={item.id}>
            <button type="button" className="nm-row" onClick={() => setDetail(item)}>
              <CompanyLogoMark job={ownLogo(item)} small />
              <span className="nm-row-main"><strong>{item.title}</strong><small>{item.company}</small></span>
              <span className="nm-row-facts">
                {!item.salaryHidden && item.salary ? <small>{item.salary}</small> : <SalaryBadge status={item.match?.salaryStatus} />}
                {typeof item.match?.score === 'number' && <b className="nm-fit">{item.match.score}%</b>}
                {showsCommute(item) && <small><MapPin size={10} /> {item.distanceKm} km</small>}
              </span>
            </button>
            <button type="button" className="nm-row-like" onClick={() => likeFromList(item)} disabled={busy || !canLike} aria-label={`Like ${item.title}`}><Heart size={15} /></button>
          </li>)}</ul>
          : <p className="nm-list-empty">No more roles right now. Your profile stays visible to matching teams.</p>}
        <button type="button" className="nm-see-all" onClick={() => navigate('discover')}>See all in Discover <ArrowRight size={13} /></button>
      </aside>
    </div>

    <AnimatePresence>{screeningFor && <ScreeningModal job={screeningFor} onCancel={() => setScreeningFor(null)} onSubmit={(answers) => { const target = screeningFor; setScreeningFor(null); if (target.id !== current?.id) setLikedFromList((ids) => [...ids, target.id]); void commitSwipe('like', target, { answers }); }} />}</AnimatePresence>
    {detail && <JobDetailModal job={detail} onClose={() => setDetail(null)} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />}
  </section>;
}
