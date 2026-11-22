// Home "Look for new Matches": the Discover deck inside a big dark phone (full
// screen on mobile), an in-phone "It's a Match!" screen, and the "Recommended Roles"
// list. Same deck rules and API calls as Discover via useDiscoverDeck; only real
// values are shown.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import type { PanInfo } from 'motion/react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, ChevronsRight, Copy, Forward, Heart, Mail, MapPin, MessageCircle, RotateCcw, Send, Star, User, X } from 'lucide-react';
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

export function PhoneBrand() {
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
      <button type="button" className="nm-full-role" onPointerDownCapture={(event) => event.stopPropagation()} onClick={onOpen}>Job details ›</button>
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
  // Works for both sides: a recruiter sees the candidate as "the other", a candidate sees the team.
  const asRecruiter = viewer.role === 'employer';
  const other = asRecruiter ? match.candidate : match.employer;
  const otherName = other?.name || (asRecruiter ? 'the candidate' : match.job?.company || 'the team');
  const otherLine = asRecruiter ? (other?.title || '') : other ? (other.title || (match.job ? `Recruiter at ${match.job.company}` : '')) : match.job?.title || '';
  const me = asRecruiter ? viewer : (match.candidate || viewer);
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
      <div><Face photo={other?.photo} name={otherName} fallback={!asRecruiter && match.job ? <CompanyLogoMark job={ownLogo(match.job)} /> : undefined} /><strong>{otherName}</strong>{otherLine && <small>{otherLine}</small>}</div>
    </div>
    <button ref={talkRef} type="button" className="nm-talk" onClick={onTalk}><MessageCircle size={18} /> Let&rsquo;s Talk</button>
    <button type="button" className="nm-keep" onClick={onKeepSwiping}><ChevronsRight size={18} /> Keep swiping</button>
  </motion.div>;
}

/** Direct message (premium, $5/month for 10). Payments for candidates aren't open: the paid button
 *  records interest; the free path sends the note with a Super Like (it opens the chat only on a match). */
/** Forward text for a role (candidate side). */
export function jobForward(job: Job) {
  const pay = !job.salaryHidden && job.salary ? job.salary : 'salary shown up front';
  return { subject: `A role for you: ${job.title} at ${job.company}`, text: `Thought of you: ${job.title} at ${job.company} (${job.workMode || 'role'}, ${pay}). It's on JobsMatchNow: you both have to like each other before a chat opens.` };
}

/** "Forward to a friend": share by the phone's share sheet, WhatsApp, email or a copied link. */
export function ForwardSheet({ subject, text, note = 'Your friend signs up for free to see it. Nothing about you is shared.', onClose }: { subject: string; text: string; note?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://jobsmatchnow.com/app/';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => { try { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  return <div className="modal-scrim" onClick={onClose}>
    <div className="coach-modal nm-forward" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Forward to a friend">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
      <h2><span className="nm-fwd-ico big"><Forward size={22} /><User size={12} /></span> Forward to a friend</h2>
      <p className="nm-forward-text">{text}</p>
      <div className="nm-forward-actions">
        {canShare && <button type="button" className="primary-button small" onClick={() => void navigator.share({ title: subject, text, url }).catch(() => undefined)}><Forward size={14} /> Share…</button>}
        <a className="secondary-button small" href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
        <a className="secondary-button small" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`}><Mail size={14} /> Email</a>
        <button type="button" className="secondary-button small" onClick={() => void copy()}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}</button>
      </div>
      <small className="nm-forward-note">{note}</small>
    </div>
  </div>;
}

export function DirectMessageSheet({ job, toName, about, recruiter = false, viewerId, canLike, busy, onClose, onSendNote }: { job?: Job; toName?: string; about?: React.ReactNode; recruiter?: boolean; viewerId: string; canLike: boolean; busy: boolean; onClose: () => void; onSendNote: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [interest, setInterest] = useState<'idle' | 'busy' | 'done'>('idle');
  const ask = async () => {
    setInterest('busy');
    try { await api.registerInterest(viewerId, recruiter ? 'direct-messages-plus' : 'candidate-premium'); setInterest('done'); } catch { setInterest('idle'); }
  };
  return <div className="modal-scrim" onClick={onClose}>
    <div className="ai-setup nm-dm" role="dialog" aria-modal="true" aria-label="Direct message" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      <span className="ai-badge">Premium</span>
      <h2><Send size={20} /> Message {toName || job?.recruiter?.name || job?.company}</h2>
      <p>{about ?? (job ? <>About <b>{job.title}</b> at {job.company}.</> : null)}</p>
      <textarea className="nm-dm-input" rows={3} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder={recruiter ? 'A short, specific note: why this candidate and why your role.' : 'A short, specific note: why you and why this role.'} aria-label="Your message" />
      <small className="tp-muted-small">{note.length}/280</small>
      <div className="nm-dm-options">
        <div className="nm-dm-opt">
          <strong>Premium <span>$10 / month · 10 direct messages + 3 target roles</span></strong>
          <small>Your message reaches {recruiter ? 'the candidate' : 'the team'} right away, before any match.</small>
          {interest === 'done' ? <p className="tp-thanks"><Check size={15} /> Saved — we'll tell you when Premium opens. Nothing was charged.</p>
            : <button type="button" className="fm-black" disabled={interest === 'busy'} onClick={() => void ask()}>{interest === 'busy' ? 'Saving…' : 'Get Premium — notify me'}</button>}
        </div>
        <div className="nm-dm-opt free">
          <strong>Free today: send it with a Super Like</strong>
          <small>{recruiter ? 'The candidate' : 'The team'} sees your Super Like now; your note opens the chat if they like you back.</small>
          <button type="button" className="secondary-button" disabled={!note.trim() || !canLike || busy} onClick={() => onSendNote(note.trim())}><Star size={14} /> Super Like + note</button>
        </div>
      </div>
      <p className="ai-privacy">Payments for direct messages are not open yet: the premium button records your interest only.</p>
    </div>
  </div>;
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
  // A role picked from "Recommended Roles" is shown in the phone until it is swiped (or closed).
  const [picked, setPicked] = useState<Job | null>(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const phoneRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLUListElement>(null);
  const canLike = data.likesRemaining > 0;
  const job = (picked || current) as Job | undefined;
  const list = considerList(filtered, deck, index).filter((item) => !likedFromList.includes(item.id)) as Job[];

  const swipePicked = (target: Job, action: 'like' | 'pass' | 'super') => {
    if (action !== 'pass' && !canLike) return;
    setPicked(null);
    setLikedFromList((ids) => [...ids, target.id]); // done with it: not shown again in the list or deck
    if (action === 'like' && needsScreening('candidate', target, 'like', false)) { setScreeningFor(target); return; }
    void commitSwipe(action === 'pass' ? 'pass' : 'like', target, { superLike: action === 'super' });
  };
  const run = (action: 'like' | 'pass' | 'super' | 'undo') => {
    if (picked) { if (action === 'undo') setPicked(null); else swipePicked(picked, action); return; }
    if (action === 'undo') { void undo(); return; }
    if (action !== 'pass' && !canLike) return;
    if (action === 'super') act('like', true);
    else act(action);
  };
  const showInPhone = (item: Job) => {
    setPicked(item);
    // On a phone the list sits under the deck: bring the deck back into view.
    window.setTimeout(() => phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const action = swipeFromKey(event.key);
    if (!action || (action !== 'undo' && !job)) return;
    event.preventDefault();
    if (action === 'super') { setForwardOpen(true); return; } // ↑ now forwards the role to a friend
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
        <div className="nm-phone" ref={phoneRef}>
          <span className="nm-island" aria-hidden="true" />
          <div className="nm-screen">
            <div className="nm-deck" role="region" aria-label="New matches deck" tabIndex={0} onKeyDown={onKeyDown}>
              <header className="nm-head">
                {picked
                  ? <button type="button" className="nm-undo-top" onClick={() => setPicked(null)} aria-label="Back to the deck"><X size={15} /></button>
                  : <button type="button" className="nm-undo-top" onClick={() => void undo()} disabled={busy || index === 0} aria-label="Undo last swipe"><RotateCcw size={15} /></button>}
                <PhoneBrand />
                <span className="nm-count" aria-live="polite">{picked ? 'Picked' : counter}</span>
              </header>
              <div className="nm-stack">
                {(next || picked) && job && <div className="nm-card nm-peek" aria-hidden="true" />}
                <AnimatePresence mode="popLayout">
                  {job
                    ? <PhoneJobCard key={job.id} job={job} reducedMotion={reducedMotion} canLike={canLike} onSwipe={run} onOpen={() => setDetail(job)} />
                    : <EmptyDeck key="empty" role="candidate" title="You've seen today's top picks" text="A chat opens only when a team likes you back." resetLabel="Start over" onReset={() => setIndex(0)}>
                      <button type="button" className="secondary-button" onClick={() => navigate('discover')}>Open Discover</button>
                    </EmptyDeck>}
                </AnimatePresence>
              </div>
              {/* Title bar: what each button does. */}
              {job && <div className="nm-action-labels" aria-hidden="true"><span>Rewind</span><span>Pass</span><span>Forward</span><span>Like</span><span>Message</span></div>}
              {job && <div className="nm-actions">
                <button type="button" className="nm-btn sm rewind" onClick={() => run('undo')} disabled={busy || (index === 0 && !picked)} aria-label="Rewind"><RotateCcw size={18} /></button>
                <button type="button" className="nm-btn pass" onClick={() => run('pass')} disabled={busy} aria-label="Pass"><X size={28} strokeWidth={3} /></button>
                <button type="button" className="nm-btn forward" onClick={() => setForwardOpen(true)} aria-label="Forward to a friend"><span className="nm-fwd-ico"><Forward size={20} /><User size={11} /></span></button>
                <button type="button" className="nm-btn like" onClick={() => run('like')} disabled={busy || !canLike} aria-label="Like"><Heart size={26} fill="currentColor" /></button>
                <button type="button" className="nm-btn sm dm" onClick={() => setDmOpen(true)} disabled={busy} aria-label="Direct message (premium)"><Send size={18} /><i className="nm-pro" aria-hidden="true">PRO</i></button>
              </div>}
              {job && !canLike && <p className="nm-no-likes">No likes left today</p>}
            </div>
            <span className="nm-home-bar" aria-hidden="true" />
            <AnimatePresence>{match && <PhoneMatch key={match.id} match={match} viewer={data.viewer} onTalk={() => talk(match)} onKeepSwiping={() => setMatch(null)} />}</AnimatePresence>
          </div>
        </div>
        <div className="keyboard-hint nm-hint"><span><kbd>←</kbd> Pass</span><span><kbd>↑</kbd> Forward</span><span><kbd>→</kbd> Like</span><span>Click the deck first</span></div>
      </div>
      <aside className="nm-list" id="td-recommended" aria-label="Recommended Roles">
        <div className="nm-carousel-head">
          <h3>Recommended Roles</h3>
          {list.length > 2 && <span className="nm-carousel-nav">
            <button type="button" aria-label="Previous roles" onClick={() => carouselRef.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ChevronLeft size={18} /></button>
            <button type="button" aria-label="More roles" onClick={() => carouselRef.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ChevronRight size={18} /></button>
          </span>}
        </div>
        {/* Carousel of mini phone screens: tap one to load it into the big phone above. */}
        {list.length
          ? <ul className="nm-carousel" ref={carouselRef}>{list.map((item) => { const photo = cardPhoto(item); return <li key={item.id} className="nm-mini">
            <button type="button" className={picked?.id === item.id ? 'nm-mini-phone on' : 'nm-mini-phone'} onClick={() => showInPhone(item)} aria-label={`Show ${item.title} in the swipe deck`} aria-pressed={picked?.id === item.id}>
              <span className="nm-mini-island" aria-hidden="true" />
              <span className="nm-mini-screen" style={photo ? { backgroundImage: `url(${assetUrl(photo)})` } : undefined}>
                {!photo && <span className="nm-mini-logo"><CompanyLogoMark job={ownLogo(item)} /></span>}
                {typeof item.match?.score === 'number' && <b className="nm-mini-fit">{item.match.score}%</b>}
                <span className="nm-mini-info">
                  <strong>{item.title}</strong>
                  <small>{item.company}</small>
                  <span className="nm-mini-chips">
                    {!item.salaryHidden && item.salary ? <em>{item.salary}</em> : <SalaryBadge status={item.match?.salaryStatus} />}
                    {item.workMode === 'Remote' ? <em>Remote</em> : showsCommute(item) && <em><MapPin size={9} /> {item.distanceKm} km</em>}
                  </span>
                </span>
              </span>
            </button>
            <button type="button" className="nm-row-like nm-mini-like" onClick={() => { if (picked?.id === item.id) setPicked(null); likeFromList(item); }} disabled={busy || !canLike} aria-label={`Like ${item.title}`}><Heart size={15} /></button>
          </li>; })}</ul>
          : <p className="nm-list-empty">No more roles right now. Your profile stays visible to matching teams.</p>}
        <button type="button" className="nm-see-all" onClick={() => navigate('discover')}>See all in Discover <ArrowRight size={13} /></button>
      </aside>
    </div>

    {forwardOpen && job && <ForwardSheet {...jobForward(job)} onClose={() => setForwardOpen(false)} />}
    {dmOpen && job && <DirectMessageSheet job={job} viewerId={data.viewer.id} canLike={canLike} busy={busy} onClose={() => setDmOpen(false)}
      onSendNote={(note) => { const target = job; setDmOpen(false); if (picked) { setPicked(null); setLikedFromList((ids) => [...ids, target.id]); } void commitSwipe('like', target, { superLike: true, note }); }} />}
    <AnimatePresence>{screeningFor && <ScreeningModal job={screeningFor} onCancel={() => setScreeningFor(null)} onSubmit={(answers) => { const target = screeningFor; setScreeningFor(null); if (target.id !== current?.id) setLikedFromList((ids) => [...ids, target.id]); void commitSwipe('like', target, { answers }); }} />}</AnimatePresence>
    {detail && <JobDetailModal job={detail} onClose={() => setDetail(null)} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />}
  </section>;
}
