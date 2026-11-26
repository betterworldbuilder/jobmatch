// Recruiter "Find My Match": the mirror of the candidate's phone deck — candidates instead of roles.
// Same deck rules and API calls (useDiscoverDeck('employer')), same buttons (Rewind · Pass · Forward ·
// Like · Message), the in-phone "It's a Match!", and a "Recommended Candidates" carousel of mini phones.
// Pre-match privacy holds: last name initial only, no contact details, no exact salary.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import type { PanInfo } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Forward, Heart, Lock, MapPin, RotateCcw, Send, User, X } from 'lucide-react';
import { pageKey, SwipePager } from '../swipe/SwipePager';
import { api, apiBase } from '../../api';
import type { Bootstrap, JobMatch, Person, View } from '../../types';
import { EmptyDeck } from '../discover/DeckParts';
import { DeckActionBar } from './DeckActionBar';
import { likesWaiting } from '../../lib/today';
import { featureOn } from '../../lib/flags';
import { considerList, swipeFromDrag, swipeFromKey } from '../discover/deckLogic';
import { useDiscoverDeck } from '../discover/useDiscoverDeck';
import { CandidateCards } from '../profile/CandidateCards';
import { jobStatusText } from '../JobStatusPicker';
import { DirectMessageSheet, ForwardSheet, PhoneBrand, PhoneMatch } from './NewMatchesSection';

const asset = (v: string) => (/^(https?:|data:|blob:)/i.test(v) ? v : `${apiBase}${v.startsWith('/') ? '' : '/'}${v}`);
/** "Sofia O." until a mutual match. */
export const maskedName = (name = '') => { const p = name.trim().split(/\s+/); return p.length < 2 ? name : `${p[0]} ${p[p.length - 1][0]}.`; };
const fitLine = (c: Person) => {
  const s = c.match?.matchedSkills?.slice(0, 3) || [];
  const score = typeof c.match?.score === 'number' ? `${c.match.score}%` : '';
  return s.length ? `Matches your role: ${s.join(', ')}${score ? ` · ${score}` : ''}` : score ? `${score} fit` : '';
};
const where = (c: Person) => [c.city, c.country].filter(Boolean).join(', ') || c.location || '';
// Every accepted mode (several since 2026-11-25): "Remote / Hybrid".
const MODE_NAMES: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
const workPref = (c: Person) => { const w = c.preferences?.workMode; return (w?.modes?.length ? w.modes : w?.mode ? [w.mode] : []).map((m) => MODE_NAMES[m] || '').filter(Boolean).join(' / '); };

// Pages inside the candidate swipe card (founder, 2026-11-22), same order as the profile; the last page is the resume.
export const CANDIDATE_PAGES = ['Who I am', 'My Dream Job', 'My Human Stack', 'My Skill Set', 'What I Have Built', 'Certifications', 'Recommendations', 'My Super Power', 'Resume'];
/** Action bar under the deck + "Recommended Candidates": off for now (founder, 2026-11-26). */
const SHOW_DECK_EXTRAS = false;
const SWIPE_CARD_ORDER =[4, 1, 2, 3, 6, 5, 7]; // CandidateCards card numbers for pages 2–8

function ResumePage({ person: c, unlocked }: { person: Person; unlocked: boolean }) {
  const r = c.documents?.resume;
  return <div className="rp-panel rp-resume">
    <h4><FileText size={15} /> Resume</h4>
    {!r ? <p className="rp-empty">No resume uploaded yet.</p>
      : unlocked ? <a className="primary-button" href={`${apiBase}/api/users/${encodeURIComponent(c.id)}/resume/original`} download={r.originalName}><Download size={16} /> Download resume</a>
        : <p className="rp-locked-line"><Lock size={14} /> A resume is on file. Download unlocks after a mutual match.</p>}
  </div>;
}

function PhoneCandidateCard({ person: c, reducedMotion, canLike, onSwipe, page, onPage }: { person: Person; reducedMotion: boolean; canLike: boolean; onSwipe: (a: 'like' | 'pass' | 'super') => void; page: number; onPage: (p: number) => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], reducedMotion ? [0, 0] : [-12, 12]);
  const likeOpacity = useTransform(x, [20, 110], [0, 1]);
  const nopeOpacity = useTransform(x, [-110, -20], [1, 0]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const action = swipeFromDrag(info.offset, info.velocity);
    if (!action || ((action === 'like' || action === 'super') && !canLike)) return;
    onSwipe(action);
  };
  const fit = fitLine(c);
  const unlocked = false; // the deck only holds people you have not matched with yet
  return <motion.article className={page > 0 ? 'nm-card sp-card on-detail' : 'nm-card sp-card'} style={{ x, rotate }} drag="x" dragSnapToOrigin dragElastic={0.6} onDragEnd={onDragEnd}
    initial={reducedMotion ? { opacity: 0 } : { scale: .95, y: 8, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: .9 }} transition={{ duration: reducedMotion ? .15 : .25 }}>
    {page > 0 && <div className="sp-page">{page === CANDIDATE_PAGES.length - 1
      ? <ResumePage person={c} unlocked={unlocked} />
      : <CandidateCards person={c} match={c.match} variant="swipe" order={SWIPE_CARD_ORDER} page={page - 1} />}</div>}
    {page === 0 && <div className="nm-photo" style={c.photo ? { backgroundImage: `url(${asset(c.photo)})` } : undefined}>
      {!c.photo && <span className="nm-initials" aria-hidden="true">{(c.name || '?').slice(0, 1)}</span>}
    </div>}
    <motion.span className="nm-stamp like" style={{ opacity: likeOpacity }} aria-hidden="true">LIKE</motion.span>
    <motion.span className="nm-stamp nope" style={{ opacity: nopeOpacity }} aria-hidden="true">NOPE</motion.span>
    <SwipePager pages={CANDIDATE_PAGES} page={page} onPage={onPage} tapZones={page === 0} demo={Boolean(c.demo || c.sample)} />
    {page === 0 && <div className="nm-card-info">
      {/* Status pill removed with the profile status (founder, 2026-11-22: "noise"). */}
      {false && c.jobStatus?.kind && <p className={`nm-hiring rm-status st-${c.jobStatus!.kind}`}>{jobStatusText(c.jobStatus)}</p>}
      <h3>{maskedName(c.name)}</h3>
      <p className="nm-company">{c.title || c.headline}{c.yearsExperience ? ` · ${c.yearsExperience} yrs` : ''}</p>
      <div className="nm-chips">
        {where(c) && <span className="nm-chip"><MapPin size={11} /> {where(c)}</span>}
        {workPref(c) && <span className="nm-chip">{workPref(c)}</span>}
        {c.availability && <span className="nm-chip">Available {c.availability === 'Now' ? 'now' : c.availability}</span>}
        {fit && <span className="nm-chip">{fit}</span>}
      </div>
    </div>}
  </motion.article>;
}

function ProfileModal({ person, onClose }: { person: Person; onClose: () => void }) {
  return <div className="modal-scrim" onClick={onClose}>
    <div className="coach-modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Candidate profile">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
      <div className="jd-title"><span className="overline">Candidate profile</span></div>
      <CandidateCards person={person} match={person.match} />
    </div>
  </div>;
}

export function RecruiterMatchSection({ data, setData, navigate, onOpenMessages, header, items, jobId }: { data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void; onOpenMessages?: (matchId: string) => void; header?: React.ReactNode; items?: Person[]; jobId?: string }) {
  const reducedMotion = Boolean(useReducedMotion());
  const [likedFromList, setLikedFromList] = useState<string[]>([]);
  const deckState = useDiscoverDeck('employer', data, setData, {
    onSwiped: (result) => { if (result.match) api.bootstrap(data.viewer.id).then(setData).catch(() => undefined); },
    skipIds: likedFromList,
    items, jobId, resetKey: jobId || 'all',
  });
  const { deck, filtered, index, setIndex, current, next, busy, match, setMatch, commitSwipe, act, undo } = deckState;
  const [picked, setPicked] = useState<Person | null>(null);
  const [recsOpen, setRecsOpen] = useState(false); // phones: Recommended badges closed until "Tap to view"
  const [detail, setDetail] = useState<Person | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const phoneRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLUListElement>(null);
  const canLike = data.likesRemaining > 0;
  const person = (picked || current) as Person | undefined;
  const list = (considerList(filtered, deck, index) as Person[]).filter((p) => !likedFromList.includes(p.id));

  const run = (action: 'like' | 'pass' | 'super' | 'undo') => {
    if (picked) {
      if (action === 'undo') { setPicked(null); return; }
      if (action !== 'pass' && !canLike) return;
      const target = picked; setPicked(null); setLikedFromList((ids) => [...ids, target.id]);
      void commitSwipe(action === 'pass' ? 'pass' : 'like', target, { superLike: action === 'super' });
      return;
    }
    if (action === 'undo') { void undo(); return; }
    if (action !== 'pass' && !canLike) return;
    act(action === 'super' ? 'like' : action, action === 'super');
  };
  // Page inside the current card; every new card opens on page 1.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [person?.id]);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea, select')) return;
    const step = pageKey(event.key);
    if (step && person) { event.preventDefault(); setPage((p) => Math.max(0, Math.min(CANDIDATE_PAGES.length - 1, p + step))); return; }
    const action = swipeFromKey(event.key);
    if (!action || (action !== 'undo' && !person)) return;
    event.preventDefault();
    if (action === 'super') { setForwardOpen(true); return; }
    run(action);
  };
  const talk = (m: JobMatch) => { setMatch(null); if (onOpenMessages) onOpenMessages(m.id); else navigate('messages'); };
  const counter = deck.length ? `${Math.min(index + 1, deck.length)} / ${deck.length}` : '0 / 0';
  const forwardText = person ? {
    subject: `A candidate you should see: ${person.title || 'engineer'}`,
    text: `Have a look at this candidate on JobsMatchNow: ${person.title || ''}${person.yearsExperience ? `, ${person.yearsExperience} years` : ''}${where(person) ? `, ${where(person)}` : ''}${person.skills?.length ? ` (${person.skills.slice(0, 4).join(', ')})` : ''}.`,
    note: 'Only what the candidate shows before a match is shared: no name, no contact details.',
  } : null;

  return <section className="td-section td-new-matches" id="td-new-matches">
    {header}
    <div className="nm-layout">
      <div className="nm-phone-col">
        <div className="nm-glow" aria-hidden="true" />
        <div className="nm-phone" ref={phoneRef}>
          <span className="nm-island" aria-hidden="true" />
          <div className="nm-screen">
            <div className="nm-deck" role="region" aria-label="Candidate deck" tabIndex={0} onKeyDown={onKeyDown}>
              <header className="nm-head">
                {picked
                  ? <button type="button" className="nm-undo-top" onClick={() => setPicked(null)} aria-label="Back to the deck"><X size={15} /></button>
                  : <button type="button" className="nm-undo-top" onClick={() => void undo()} disabled={busy || index === 0} aria-label="Undo last swipe"><RotateCcw size={15} /></button>}
                <PhoneBrand />
                <span className="nm-count" aria-live="polite">{picked ? 'Picked' : counter}</span>
              </header>
              <div className="nm-stack">
                {(next || picked) && person && <div className="nm-card nm-peek" aria-hidden="true" />}
                <AnimatePresence mode="popLayout">
                  {person
                    ? <PhoneCandidateCard key={person.id} person={person} reducedMotion={reducedMotion} canLike={canLike} onSwipe={run} page={page} onPage={setPage} />
                    : <EmptyDeck key="empty" role="employer" title="You've seen today's top candidates" text="A chat opens only when a candidate likes you back." resetLabel="Start over" onReset={() => setIndex(0)}>
                      <button type="button" className="secondary-button" onClick={() => navigate('discover')}>Open Discover</button>
                    </EmptyDeck>}
                </AnimatePresence>
              </div>
              {person && <div className="nm-action-labels" aria-hidden="true"><span>Rewind</span><span>Pass</span><span>Forward</span><span>Like</span><span>Message</span></div>}
              {person && <div className="nm-actions">
                <button type="button" className="nm-btn sm rewind" onClick={() => run('undo')} disabled={busy || (index === 0 && !picked)} aria-label="Rewind"><RotateCcw size={18} /></button>
                <button type="button" className="nm-btn pass" onClick={() => run('pass')} disabled={busy} aria-label="Pass"><X size={28} strokeWidth={3} /></button>
                <button type="button" className="nm-btn forward" onClick={() => setForwardOpen(true)} aria-label="Forward to a colleague"><span className="nm-fwd-ico"><Forward size={20} /><User size={11} /></span></button>
                <button type="button" className="nm-btn like" onClick={() => run('like')} disabled={busy || !canLike} aria-label="Like"><Heart size={26} fill="currentColor" /></button>
                <button type="button" className="nm-btn sm dm" onClick={() => setDmOpen(true)} disabled={busy} aria-label="Direct message (premium)"><Send size={18} /><i className="nm-pro" aria-hidden="true">PRO</i></button>
              </div>}
              {person && !canLike && <p className="nm-no-likes">No likes left today</p>}
            </div>
            <span className="nm-home-bar" aria-hidden="true" />
            <AnimatePresence>{match && <PhoneMatch key={match.id} match={match} viewer={data.viewer} onTalk={() => talk(match)} onKeepSwiping={() => setMatch(null)} />}</AnimatePresence>
          </div>
        </div>
        {/* Desktop: the phone bar's actions under the deck (founder, 2026-11-24); keyboard hint kept when the bar is off. */}
        {/* Removed for now (founder, 2026-11-26): the action bar under the deck and "Recommended Candidates". */}
        {SHOW_DECK_EXTRAS && (featureOn('filters') ? <DeckActionBar role="employer" userId={data.viewer.id} navigate={navigate} likes={likesWaiting(data)} />
          : <div className="keyboard-hint nm-hint"><span><kbd>←</kbd> Pass</span><span><kbd>↑</kbd> Forward</span><span><kbd>→</kbd> Like</span><span>Click the deck first</span></div>)}
      </div>
      {SHOW_DECK_EXTRAS && <aside className={recsOpen ? 'nm-list recs-open' : 'nm-list'} aria-label="Recommended Candidates">
        <div className="nm-carousel-head">
          <h3>Recommended Candidates</h3>
          {/* Phones (founder, 2026-11-25): the badges open under the deck on "Tap to view". */}
          <button type="button" className="nm-recs-toggle" aria-expanded={recsOpen} onClick={(e) => { const box = e.currentTarget.closest('.nm-list'); setRecsOpen((v) => !v); window.setTimeout(() => box?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60); }}>{recsOpen ? 'Hide' : 'Tap to view'} <ChevronDown size={13} /></button>
          {list.length > 2 && <span className="nm-carousel-nav">
            <button type="button" aria-label="Previous candidates" onClick={() => carouselRef.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ChevronLeft size={18} /></button>
            <button type="button" aria-label="More candidates" onClick={() => carouselRef.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ChevronRight size={18} /></button>
          </span>}
        </div>
        {list.length
          ? <ul className="nm-carousel" ref={carouselRef}>{list.map((p) => <li key={p.id} className="nm-mini">
            <button type="button" className={picked?.id === p.id ? 'nm-mini-phone on' : 'nm-mini-phone'} onClick={() => { setPicked(p); window.setTimeout(() => phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }} aria-label={`Show ${maskedName(p.name)} in the swipe deck`} aria-pressed={picked?.id === p.id}>
              <span className="nm-mini-island" aria-hidden="true" />
              <span className="nm-mini-screen" style={p.photo ? { backgroundImage: `url(${asset(p.photo)})` } : undefined}>
                {typeof p.match?.score === 'number' && <b className="nm-mini-fit">{p.match.score}%</b>}
                <span className="nm-mini-info"><strong>{maskedName(p.name)}</strong><small>{p.title}</small>
                  <span className="nm-mini-chips">{where(p) && <em><MapPin size={9} /> {p.city || p.country}</em>}{workPref(p) && <em>{workPref(p)}</em>}</span></span>
              </span>
            </button>
            <button type="button" className="nm-row-like nm-mini-like" onClick={() => { if (!canLike) return; setLikedFromList((ids) => [...ids, p.id]); if (picked?.id === p.id) setPicked(null); void commitSwipe('like', p); }} disabled={busy || !canLike} aria-label={`Like ${maskedName(p.name)}`}><Heart size={15} /></button>
          </li>)}</ul>
          : <p className="nm-list-empty">No more candidates right now. Your roles stay visible to matching candidates.</p>}
      </aside>}
    </div>
    {detail && <ProfileModal person={detail} onClose={() => setDetail(null)} />}
    {forwardOpen && forwardText && <ForwardSheet {...forwardText} onClose={() => setForwardOpen(false)} />}
    {dmOpen && person && <DirectMessageSheet recruiter toName={maskedName(person.name)} about={<>About <b>{person.title}</b>{where(person) ? ` · ${where(person)}` : ''}.</>} viewerId={data.viewer.id} canLike={canLike} busy={busy} onClose={() => setDmOpen(false)}
      onSendNote={(note) => { const target = person; setDmOpen(false); if (picked) { setPicked(null); setLikedFromList((ids) => [...ids, target.id]); } void commitSwipe('like', target, { superLike: true, note }); }} />}
  </section>;
}
