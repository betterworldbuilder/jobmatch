// "Find your Matches": the full swipe studio for job seekers (roles) and hiring teams /
// headhunters (candidates). Desktop: sidebar (matches, messages, find by goal, safety) +
// one big card with photo slides, action row and keyboard bar. Mobile: full-screen card,
// the sidebar becomes a sheet. Same deck rules and API calls as Discover (useDiscoverDeck).
// Shipped behind the `findMatches` flag (preview with ?fm=1). Real values only.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import type { PanInfo } from 'motion/react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BadgeCheck, BriefcaseBusiness, Building2, Camera, Check, Compass, CornerDownLeft,
  Flag, Globe, Heart, Loader2, MapPin, MessageCircle, RotateCcw, ScrollText, Send, Shield, ShieldCheck, Sparkles, Star, Target,
  Users, Wallet, X, Zap,
} from 'lucide-react';
import { api, apiBase } from '../../api';
import type { Bootstrap, Job, Person, Role, View } from '../../types';
import { JobDetailModal, ScreeningModal } from '../coach/CoachModals';
import { CandidateProfileModal } from '../home/MatchHome';
import { EmptyDeck, MatchModal } from '../discover/DeckParts';
import { considerList, needsScreening, swipeFromDrag } from '../discover/deckLogic';
import { useDiscoverDeck } from '../discover/useDiscoverDeck';
import { ReportModal } from '../ReportModal';
import { CameraCaptureModal } from '../CameraCaptureModal';
import {
  NOTE_MAX, goalTiles, safetyTips, sidebarLists, slideCount, studioKey, toCard, verificationState,
} from './fmLogic';
import type { CardFact, GoalTile, StudioCard } from './fmLogic';

type Props = {
  role: Role;
  data: Bootstrap;
  setData: (data: Bootstrap) => void;
  navigate: (view: View) => void;
  onOpenMessages?: (matchId: string) => void;
  header?: React.ReactNode;
};
type Panel = 'matches' | 'explore' | 'safety';

function assetUrl(value: string) {
  return /^(https?:|data:|blob:)/i.test(value) ? value : `${apiBase}${value.startsWith('/') ? '' : '/'}${value}`;
}

const FACT_ICON: Record<CardFact['kind'], typeof MapPin> = {
  remote: Globe, place: MapPin, salary: Wallet, fit: Target, level: BriefcaseBusiness, company: Building2,
};
const GOAL_ICON: Record<string, typeof MapPin> = {
  remote: Globe, hybrid: Building2, onsite: MapPin, fulltime: BriefcaseBusiness, contract: ScrollText, topfit: Target,
  verify: BadgeCheck, all: Users, fit80: Sparkles, fit90: Target,
};

function readHintsHidden() { try { return localStorage.getItem('jmn-fm-hints') === 'hidden'; } catch { return false; } }
function writeHintsHidden(hidden: boolean) { try { localStorage.setItem('jmn-fm-hints', hidden ? 'hidden' : 'shown'); } catch { /* ignore */ } }

/* ---------- the card ---------- */
function StudioCardView({ card, slide, setSlide, reducedMotion, canLike, onSwipe, onOpen, onSafety }: {
  card: StudioCard; slide: number; setSlide: (n: number) => void; reducedMotion: boolean; canLike: boolean;
  onSwipe: (action: 'like' | 'pass' | 'super') => void; onOpen: () => void; onSafety: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], reducedMotion ? [0, 0] : [-10, 10]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);
  const dragged = useRef(false);
  const total = slideCount(card);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    window.setTimeout(() => { dragged.current = false; }, 60);
    const action = swipeFromDrag(info.offset, info.velocity);
    if (!action || ((action === 'like' || action === 'super') && !canLike)) return;
    onSwipe(action);
  };
  const tap = (dir: -1 | 1) => { if (!dragged.current) setSlide(Math.max(0, Math.min(total - 1, slide + dir))); };
  const info = slide > 0 ? card.slides[slide - 1] : null;
  return <motion.article
    className="fm-card" style={{ x, rotate }} drag dragSnapToOrigin dragElastic={0.6}
    onDragStart={() => { dragged.current = true; }} onDragEnd={onDragEnd}
    initial={reducedMotion ? { opacity: 0 } : { scale: .96, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: .92 }} transition={{ duration: reducedMotion ? .15 : .25 }}
    aria-label={`${card.name}${card.subtitle ? `, ${card.subtitle}` : ''}`}
  >
    <div className={card.photo ? 'fm-photo' : 'fm-photo fm-photo-empty'} style={card.photo ? { backgroundImage: `url(${assetUrl(card.photo)})` } : undefined}>
      {!card.photo && <span className="fm-initials" aria-hidden="true">{card.initials}</span>}
    </div>
    {total > 1 && <div className="fm-bars" aria-hidden="true">{Array.from({ length: total }, (_, i) => <i key={i} className={i === slide ? 'on' : ''} />)}</div>}
    <button type="button" className="fm-tap left" aria-label="Previous photo" onClick={() => tap(-1)} />
    <button type="button" className="fm-tap right" aria-label="Next photo" onClick={() => tap(1)} />
    <button type="button" className="fm-card-shield" aria-label="Safety Toolkit" onPointerDownCapture={(e) => e.stopPropagation()} onClick={onSafety}><Shield size={16} /></button>
    <motion.span className="fm-stamp like" style={{ opacity: likeOpacity }} aria-hidden="true">LIKE</motion.span>
    <motion.span className="fm-stamp nope" style={{ opacity: nopeOpacity }} aria-hidden="true">NOPE</motion.span>
    <div className="fm-info">
      {card.signal && slide === 0 && <p className="fm-signal"><i aria-hidden="true" />{card.signal === 'superliked' ? 'Super Liked you' : 'Likes you'}</p>}
      <div className="fm-name-row">
        <h3>{card.name}{card.age !== undefined && <span className="fm-age">{card.age}</span>}{card.verified && <BadgeCheck size={22} className="fm-verified" aria-label="Verified" />}</h3>
        <button type="button" className="fm-open" aria-label="Open profile" onPointerDownCapture={(e) => e.stopPropagation()} onClick={onOpen}><ArrowUp size={16} /></button>
      </div>
      {!info && <>
        {card.subtitle && card.kind === 'person' && <p className="fm-sub">{card.subtitle}</p>}
        <ul className="fm-facts">{card.facts.map((fact) => { const Icon = FACT_ICON[fact.kind]; return <li key={fact.kind + fact.text}><Icon size={15} />{fact.text}</li>; })}</ul>
      </>}
      {info && <div className="fm-slide">
        <p className="fm-slide-title">{info.title}</p>
        {info.chips.length > 0 && <div className="fm-chips">{info.chips.map((chip) => <span key={chip} className={info.highlight?.includes(chip) ? 'fm-chip hit' : 'fm-chip'}>{chip}</span>)}</div>}
        {info.text && <p className="fm-slide-text">{info.text}</p>}
      </div>}
    </div>
  </motion.article>;
}

/* ---------- small modals ---------- */
function Sheet({ title, onClose, children, className = '' }: { title?: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <motion.div className="modal-scrim fm-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div className={`fm-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} initial={{ y: 20, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 14, scale: .97 }} onClick={(e) => e.stopPropagation()}>
      {children}
    </motion.div>
  </motion.div>;
}

function SafetyToolkit({ onReport, onTips, onClose }: { onReport: () => void; onTips: () => void; onClose: () => void }) {
  return <Sheet title="Safety Toolkit" onClose={onClose} className="fm-toolkit">
    <h2>Safety Toolkit</h2>
    <button type="button" onClick={onReport}><Flag size={18} className="fm-red" />Report</button>
    <button type="button" onClick={onTips}><ShieldCheck size={18} className="fm-blue" />Safety tips</button>
    <button type="button" className="fm-cancel" onClick={onClose}>Cancel</button>
  </Sheet>;
}

function TipsSheet({ role, onClose }: { role: Role; onClose: () => void }) {
  return <Sheet title="Safety tips" onClose={onClose} className="fm-tips">
    <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
    <span className="fm-round-icon"><ShieldCheck size={20} /></span>
    <h2>Stay safe while you {role === 'candidate' ? 'look for a job' : 'hire'}</h2>
    <ol>{safetyTips(role).map((tip) => <li key={tip}>{tip}</li>)}</ol>
  </Sheet>;
}

function VerifySheet({ viewer, onClose, onSubmitted }: { viewer: Person; onClose: () => void; onSubmitted: (verification: NonNullable<Person['verification']>) => void }) {
  const state = verificationState(viewer);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const capture = async (blob: Blob) => {
    setCamera(false); setBusy(true); setError('');
    try { const res = await api.submitVerificationSelfie(viewer.id, blob); setSent(true); onSubmitted(res.verification); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send your selfie'); }
    finally { setBusy(false); }
  };
  const audience = viewer.role === 'candidate' ? 'hiring teams' : 'candidates';
  return <>
    <Sheet title="Get verified" onClose={onClose} className="fm-verify">
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      <span className="fm-round-icon"><Camera size={20} /></span>
      {state === 'verified' ? <>
        <h2>You&rsquo;re verified</h2>
        <p>The Verified badge shows next to your name on every card {audience} see.</p>
        <button type="button" className="fm-black" onClick={onClose}><Check size={17} /> Done</button>
      </> : (sent || state === 'pending') ? <>
        <h2>Thanks, we&rsquo;re checking it</h2>
        <p>A person on our team compares your selfie with your profile photo. Your badge appears as soon as it&rsquo;s approved.</p>
        <button type="button" className="fm-black" onClick={onClose}>Got it</button>
      </> : <>
        <h2>Show {audience} it&rsquo;s really you</h2>
        <p>Verified members get more trust, and fake profiles get caught early. Here&rsquo;s how it works:</p>
        <ol className="fm-steps">
          <li><b>1</b><div><strong>Take a live selfie</strong><span>We compare it with your profile photo. It stays private: only our review team sees it.</span></div></li>
          <li><b>2</b><div><strong>Get the Verified badge</strong><span>Once approved, the badge shows next to your name on every card.</span></div></li>
        </ol>
        {state === 'rejected' && <p className="fm-warn">Your last selfie wasn&rsquo;t approved{viewer.verification?.reason ? `: ${viewer.verification.reason}` : ''}. You can try again.</p>}
        {error && <p className="auth-error">{error}</p>}
        <button type="button" className="fm-black" onClick={() => setCamera(true)} disabled={busy}>{busy ? <Loader2 size={17} className="spin" /> : 'Get Verified'}</button>
      </>}
    </Sheet>
    {camera && <CameraCaptureModal onCapture={capture} onClose={() => setCamera(false)} />}
  </>;
}

function FirstImpressionSheet({ card, canLike, busy, onSend, onClose }: { card: StudioCard; canLike: boolean; busy: boolean; onSend: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const send = () => { if (note.trim() && canLike && !busy) onSend(note.trim()); };
  return <Sheet title="First impression" onClose={onClose} className="fm-impression">
    <button type="button" className="fm-x light" aria-label="Close" onClick={onClose}><X size={18} /></button>
    <p className="fm-imp-kicker">Stand out from the first swipe</p>
    <p className="fm-imp-title">Super Like with a short note. They see your Super Like now; your note opens the chat if they like you back.</p>
    <div className="fm-imp-card" style={card.photo ? { backgroundImage: `url(${assetUrl(card.photo)})` } : undefined}>
      {!card.photo && <span className="fm-initials">{card.initials}</span>}
      <span className="fm-imp-name">{card.name}{card.verified && <BadgeCheck size={15} />}</span>
    </div>
    <div className="fm-imp-input">
      <textarea ref={ref} rows={2} maxLength={NOTE_MAX} value={note} placeholder="Your message" aria-label="Your message"
        onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <button type="button" aria-label="Send with a Super Like" onClick={send} disabled={!note.trim() || !canLike || busy}>{busy ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} />}</button>
    </div>
    <small className="fm-imp-count">{canLike ? `${note.length}/${NOTE_MAX}` : 'No likes left today'}</small>
  </Sheet>;
}

/* ---------- sidebar ---------- */
function Avatar({ photo, name }: { photo?: string; name: string }) {
  return photo ? <img className="fm-avatar" src={assetUrl(photo)} alt="" /> : <span className="fm-avatar fm-avatar-txt">{name.slice(0, 1).toUpperCase()}</span>;
}

/* ---------- main ---------- */
export function FindMatches({ role, data, setData, navigate, onOpenMessages, header }: Props) {
  const deckRole = role === 'candidate' ? 'candidate' : 'employer';
  const reducedMotion = Boolean(useReducedMotion());
  const deck = useDiscoverDeck(deckRole, data, setData, {
    onSwiped: (result) => { if (result.match) api.bootstrap(data.viewer.id).then(setData).catch(() => undefined); },
  });
  const { deck: cards, filtered, index, setIndex, current: deckCurrent, next, busy, match, setMatch, screeningFor, setScreeningFor, commitSwipe, act, undo } = deck;
  // A role picked from "Recommended Roles" (under the card) takes the card's place until it is swiped.
  const [picked, setPicked] = useState<Job | Person | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const current = picked || deckCurrent;
  const recommended = considerList(filtered, cards, index).filter((item) => !done.includes(item.id) && item.id !== picked?.id);
  const [panel, setPanel] = useState<Panel>('matches');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<'matches' | 'messages'>('matches');
  const [goal, setGoal] = useState('');
  const [slide, setSlide] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toolkit, setToolkit] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [tips, setTips] = useState(false);
  const [verify, setVerify] = useState(false);
  const [impression, setImpression] = useState(false);
  const [hintsHidden, setHintsHidden] = useState(readHintsHidden);
  const rootRef = useRef<HTMLElement>(null);
  const canLike = data.likesRemaining > 0;
  const card = current ? toCard(current) : null;
  const total = card ? slideCount(card) : 1;
  const { matches, conversations } = sidebarLists(data);
  const likesYou = (role === 'candidate' ? data.jobs : data.candidates).filter((item) => item.likedYou || item.superLikedYou).length;
  const modalOpen = profileOpen || toolkit || reporting || tips || verify || impression || Boolean(match) || Boolean(screeningFor);
  const vstate = verificationState(data.viewer);

  useEffect(() => { setSlide(0); setProfileOpen(false); }, [current?.id]);

  const run = (action: 'like' | 'pass' | 'super' | 'undo') => {
    if (picked) {
      if (action === 'undo') { setPicked(null); return; }
      if (busy || (action !== 'pass' && !canLike)) return;
      const target = picked;
      setPicked(null); setDone((ids) => [...ids, target.id]);
      if (action === 'like' && needsScreening(deckRole, target, 'like', false)) { setScreeningFor(target as Job); return; }
      void commitSwipe(action === 'pass' ? 'pass' : 'like', target, { superLike: action === 'super' });
      return;
    }
    if (action === 'undo') { void undo(); return; }
    if (!current || busy) return;
    if (action !== 'pass' && !canLike) return;
    if (action === 'super') act('like', true); else act(action);
  };

  // Keyboard: active while the studio is on screen and no dialog is open.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.35), { threshold: [0, 0.35, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const action = studioKey(event.key);
      if (!action) return;
      if (action !== 'undo' && !current) return;
      event.preventDefault();
      if (action === 'open') setProfileOpen(true);
      else if (action === 'close') setProfileOpen(false);
      else if (action === 'next') setSlide((s) => (s + 1) % total);
      else run(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickPanel = (p: Panel) => { setPanel(p); setSheetOpen(true); };
  const applyGoal = (tile: GoalTile) => {
    if (tile.verify) { setVerify(true); return; }
    const same = goal === tile.id;
    setGoal(same ? '' : tile.id);
    deck.setFilterMode(same ? '' : tile.filter?.filterMode || '');
    deck.setFilterType(same ? '' : tile.filter?.filterType || '');
    deck.setMinScore(same ? 0 : tile.filter?.minScore ?? 0);
    setSheetOpen(false);
  };
  const clearGoal = () => { setGoal(''); deck.setFilterMode(''); deck.setFilterType(''); deck.setMinScore(0); };
  const openThread = (matchId: string) => { if (onOpenMessages) onOpenMessages(matchId); else navigate('messages'); };
  const sendImpression = async (note: string) => {
    if (!current) return;
    setImpression(false);
    if (picked) { setPicked(null); setDone((ids) => [...ids, current.id]); }
    await commitSwipe('like', current, { superLike: true, note });
  };
  const toggleHints = () => { setHintsHidden((h) => { writeHintsHidden(!h); return !h; }); };
  const counter = cards.length ? `${Math.min(index + 1, cards.length)} / ${cards.length}` : '0 / 0';
  const activeGoal = goalTiles(role).find((t) => t.id === goal);
  const noun = role === 'candidate' ? 'roles' : 'candidates';

  return <section ref={rootRef} className="td-section fm-section" id="td-new-matches">
    {header}
    <div className="fm-studio">
      {/* ----- sidebar ----- */}
      <aside className={sheetOpen ? 'fm-side sheet-open' : 'fm-side'} aria-label="Matches, messages and safety">
        <header className="fm-side-head">
          <button type="button" className="fm-me" onClick={() => navigate('profile')}><Avatar photo={data.viewer.photo} name={data.viewer.name} /><span>You</span>{vstate === 'verified' && <BadgeCheck size={15} />}</button>
          <nav className="fm-icons">
            <button type="button" className={panel === 'matches' ? 'on' : ''} aria-label="Matches and messages" title="Matches and messages" onClick={() => pickPanel('matches')}><Zap size={18} /></button>
            <button type="button" className={panel === 'explore' ? 'on' : ''} aria-label="Find by goal" title="Find by goal" onClick={() => pickPanel('explore')}><Compass size={18} /></button>
            <button type="button" aria-label={role === 'candidate' ? 'All roles in Discover' : 'Your roles'} title={role === 'candidate' ? 'All roles in Discover' : 'Your roles'} onClick={() => navigate(role === 'candidate' ? 'discover' : 'jobs')}><BriefcaseBusiness size={18} /></button>
            <button type="button" className={panel === 'safety' ? 'on' : ''} aria-label="Safety center" title="Safety center" onClick={() => pickPanel('safety')}><Shield size={18} /></button>
          </nav>
        </header>
        <div className="fm-side-body">
          <button type="button" className="fm-sheet-close" aria-label="Close" onClick={() => setSheetOpen(false)}><X size={18} /></button>
          {panel === 'matches' && <>
            <div className="fm-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'matches'} className={tab === 'matches' ? 'on' : ''} onClick={() => setTab('matches')}>Matches</button>
              <button type="button" role="tab" aria-selected={tab === 'messages'} className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>Messages</button>
            </div>
            {tab === 'matches' && (matches.length || likesYou ? <div className="fm-grid">
              {likesYou > 0 && <div className="fm-likes-tile"><Heart size={22} fill="currentColor" /><strong>{likesYou}</strong><small>{likesYou === 1 ? 'likes you' : 'like you'}</small></div>}
              {matches.map((row) => <button type="button" key={row.matchId} className="fm-match-tile" onClick={() => openThread(row.matchId)} style={row.photo ? { backgroundImage: `url(${assetUrl(row.photo)})` } : undefined}>
                {!row.photo && <span className="fm-initials small">{row.name.slice(0, 1)}</span>}
                <span className="fm-tile-label"><b>{row.name.split(' ')[0]}</b>{row.tag && <small>{row.tag}</small>}</span>
              </button>)}
            </div> : <div className="fm-empty">
              <div className="fm-empty-card" aria-hidden="true"><Heart size={34} /></div>
              <h3>Start Matching</h3>
              <p>Matches show up here once you start liking {noun}. When they like you back, you can message them from here.</p>
            </div>)}
            {tab === 'messages' && (conversations.length ? <ul className="fm-threads">
              {conversations.map((row) => <li key={row.matchId}><button type="button" onClick={() => openThread(row.matchId)}>
                <Avatar photo={row.photo} name={row.name} />
                <span><strong>{row.name}{row.tag && <em> · {row.tag}</em>}</strong><small>{row.last?.senderId === data.viewer.id ? 'You: ' : ''}{row.last?.text}</small></span>
              </button></li>)}
            </ul> : <div className="fm-empty">
              <div className="fm-empty-bubble" aria-hidden="true"><MessageCircle size={34} /></div>
              <h3>Say Hello</h3>
              <p>Looking to start a conversation? When you match, you can send them a message under &ldquo;Matches&rdquo;.</p>
            </div>)}
          </>}
          {panel === 'explore' && <>
            <p className="fm-side-title">{role === 'candidate' ? 'Find roles that fit what you want' : 'Find candidates by fit'}</p>
            <div className="fm-goals">{goalTiles(role).map((tile) => { const Icon = GOAL_ICON[tile.id] || Sparkles; return <button type="button" key={tile.id} className={goal === tile.id ? 'fm-goal on' : 'fm-goal'} onClick={() => applyGoal(tile)} aria-pressed={goal === tile.id}>
              <span className="fm-goal-icon"><Icon size={40} strokeWidth={1.6} /></span>
              <strong>{tile.label}</strong><small>{tile.hint}</small>
            </button>; })}</div>
          </>}
          {panel === 'safety' && <div className="fm-safety">
            <p className="fm-side-title">Safety center</p>
            <div className={`fm-verify-card ${vstate}`}>
              <BadgeCheck size={26} />
              <div><strong>{vstate === 'verified' ? 'You are verified' : vstate === 'pending' ? 'Selfie in review' : 'Get Verified'}</strong>
                <small>{vstate === 'verified' ? 'Your badge shows on every card.' : vstate === 'pending' ? 'Your badge appears once a person approves it.' : 'Send a live selfie for a person on our team to check.'}</small></div>
              {(vstate === 'none' || vstate === 'rejected') && <button type="button" onClick={() => setVerify(true)}>Start</button>}
            </div>
            <button type="button" className="fm-safety-row" onClick={() => setTips(true)}><ShieldCheck size={18} />Safety tips</button>
            <button type="button" className="fm-safety-row" onClick={() => current ? setReporting(true) : setTips(true)} disabled={!current}><Flag size={18} />Report the card on screen</button>
            <p className="fm-safety-note"><BadgeCheck size={13} /> Verified means one of these: signed in with Google or LinkedIn, a profile at least 80% complete, or a selfie approved by our team. It is not a background check.</p>
          </div>}
        </div>
      </aside>
      {sheetOpen && <button type="button" className="fm-sheet-scrim" aria-label="Close panel" onClick={() => setSheetOpen(false)} />}

      {/* ----- stage ----- */}
      <div className="fm-stage">
        <div className="fm-stage-head">
          <h3>Find your Matches</h3>
          {activeGoal && <button type="button" className="fm-goal-pill" onClick={clearGoal}>{activeGoal.label}<X size={13} /></button>}
          {picked
            ? <button type="button" className="fm-goal-pill" onClick={() => setPicked(null)}>Back to deck<X size={13} /></button>
            : <span className="fm-count" aria-live="polite">{counter}</span>}
        </div>
        <div className="fm-stack">
          {next && card && <div className="fm-card fm-peek" aria-hidden="true" />}
          <AnimatePresence mode="popLayout">
            {card
              ? <StudioCardView key={card.id} card={card} slide={slide} setSlide={setSlide} reducedMotion={reducedMotion} canLike={canLike}
                  onSwipe={run} onOpen={() => setProfileOpen(true)} onSafety={() => setToolkit(true)} />
              : <div className="fm-card fm-card-empty" key="empty">
                  <EmptyDeck role={deckRole} title={activeGoal ? `No ${noun} for “${activeGoal.label}” yet` : role === 'candidate' ? 'You’ve seen today’s top picks' : 'You’re all caught up'}
                    text="A chat opens only when both sides like each other." resetLabel="Start over" onReset={() => setIndex(0)}>
                    {activeGoal && <button type="button" className="secondary-button" onClick={clearGoal}>Show all {noun}</button>}
                  </EmptyDeck>
                </div>}
          </AnimatePresence>
        </div>
        {card && <div className="fm-actions">
          <button type="button" className="fm-btn sm rewind" onClick={() => run('undo')} disabled={busy || (index === 0 && !picked)} aria-label="Rewind"><RotateCcw size={20} /></button>
          <button type="button" className="fm-btn lg nope" onClick={() => run('pass')} disabled={busy} aria-label="Nope"><X size={30} strokeWidth={2.4} /></button>
          <button type="button" className="fm-btn sm super" onClick={() => run('super')} disabled={busy || !canLike} aria-label="Super Like"><Star size={20} /></button>
          <button type="button" className="fm-btn lg like" onClick={() => run('like')} disabled={busy || !canLike} aria-label="Like"><Heart size={28} /></button>
          <button type="button" className="fm-btn sm impression" onClick={() => setImpression(true)} disabled={busy || !canLike} aria-label="First impression: Super Like with a note"><Send size={19} /></button>
        </div>}
        {card && !canLike && <p className="fm-no-likes">No likes left today. Nope still works.</p>}
        {recommended.length > 0 && <div className="fm-recs" id="td-recommended" aria-label={role === 'candidate' ? 'Recommended Roles' : 'Recommended Candidates'}>
          <p className="fm-recs-title">{role === 'candidate' ? 'Recommended Roles' : 'Recommended Candidates'}<small>Tap one to see it on the card</small></p>
          <div className="fm-recs-row">{recommended.map((item) => { const c = toCard(item); return <button type="button" key={item.id} className="fm-rec" onClick={() => setPicked(item)} aria-label={`Show ${c.name} on the card`}>
            <span className="fm-rec-photo" style={c.photo ? { backgroundImage: `url(${assetUrl(c.photo)})` } : undefined}>{!c.photo && c.initials}</span>
            <span className="fm-rec-text"><strong>{c.name}</strong><small>{c.subtitle}{typeof item.match?.score === 'number' ? ` · ${item.match.score}%` : ''}</small></span>
          </button>; })}</div>
        </div>}
        <div className={hintsHidden ? 'fm-keys hidden' : 'fm-keys'}>
          <button type="button" className="fm-keys-toggle" onClick={toggleHints}>{hintsHidden ? 'Show keys' : 'Hide'}</button>
          {!hintsHidden && <>
            <span><kbd><ArrowLeft size={12} /></kbd>Nope</span>
            <span><kbd><ArrowRight size={12} /></kbd>Like</span>
            <span><kbd><ArrowUp size={12} /></kbd>Open Profile</span>
            <span><kbd><ArrowDown size={12} /></kbd>Close Profile</span>
            <span><kbd><CornerDownLeft size={12} /></kbd>Super Like</span>
            <span><kbd className="space" />Next Photo</span>
          </>}
        </div>
      </div>
    </div>

    {/* ----- dialogs ----- */}
    <AnimatePresence>
      {toolkit && <SafetyToolkit key="tk" onClose={() => setToolkit(false)} onReport={() => { setToolkit(false); setReporting(true); }} onTips={() => { setToolkit(false); setTips(true); }} />}
      {tips && <TipsSheet key="tips" role={role} onClose={() => setTips(false)} />}
      {verify && <VerifySheet key="verify" viewer={data.viewer} onClose={() => setVerify(false)} onSubmitted={(verification) => setData({ ...data, viewer: { ...data.viewer, verification } })} />}
      {impression && card && <FirstImpressionSheet key="imp" card={card} canLike={canLike} busy={busy} onClose={() => setImpression(false)} onSend={(note) => void sendImpression(note)} />}
      {match && <MatchModal key={match.id} match={match} viewer={data.viewer} onClose={() => setMatch(null)} onMessage={() => { const id = match.id; setMatch(null); openThread(id); }} />}
      {screeningFor && <ScreeningModal key="screen" job={screeningFor} onCancel={() => setScreeningFor(null)} onSubmit={(answers) => { const target = screeningFor; setScreeningFor(null); void commitSwipe('like', target, { answers }); }} />}
    </AnimatePresence>
    {reporting && current && <ReportModal viewerId={data.viewer.id} targetType={'employerId' in current ? 'job' : 'user'} targetId={current.id} onClose={() => setReporting(false)} />}
    {profileOpen && current && ('employerId' in current
      ? <JobDetailModal job={current as Job} onClose={() => setProfileOpen(false)} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(n) => setData({ ...data, notes: [...data.notes.filter((x) => x.id !== n.id), n] })} />
      : <CandidateProfileModal candidate={current as Person} onClose={() => setProfileOpen(false)} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(n) => setData({ ...data, notes: [...data.notes.filter((x) => x.id !== n.id), n] })}
          onTalk={canLike ? () => { setProfileOpen(false); run('like'); } : undefined} />)}
  </section>;
}

