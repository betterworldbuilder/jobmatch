// Deck pieces shared by the Discover page and the home "Look for new matches" section.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BriefcaseBusiness, Check, Heart, Loader2, MessageCircle, RotateCcw, Send, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { api } from '../../api';
import type { JobMatch, Person, Role } from '../../types';
import { CompanyLogoMark } from '../jobs/JobHeaderBadge';

const SALARY_BADGES: Record<string, { label: string; tone: string }> = {
  within: { label: 'Within your expected range', tone: 'good' },
  above: { label: 'Above your expected range', tone: 'info' },
  below: { label: 'Below your minimum', tone: 'bad' },
  unknown: { label: 'Salary revealed after match', tone: 'muted' },
};

export function SalaryBadge({ status }: { status?: string }) {
  const badge = SALARY_BADGES[status || 'unknown'] || SALARY_BADGES.unknown;
  return <span className={`salary-badge salary-${badge.tone}`}>{badge.label}</span>;
}

const CONFETTI_COLORS = ['#fd267a', '#ff4458', '#ff6036', '#0a66c2', '#00a0dc', '#f5c518', '#20b46a'];

/** Item 16: dependency-free confetti burst behind the "It's a Match" modal. */
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 60 }, (_, index) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.7,
    duration: 2.4 + Math.random() * 1.6,
    size: 6 + Math.random() * 7,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    spin: Math.random() > 0.5 ? 1 : -1,
  })), []);
  return <div className="confetti" aria-hidden="true">
    {pieces.map((piece, index) => <i key={index} style={{ left: `${piece.left}%`, width: piece.size, height: piece.size * 0.45, background: piece.color, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, ['--spin' as string]: piece.spin }} />)}
  </div>;
}


function formatRange(range?: { min: number; max: number; currency: string }) {
  if (!range) return null;
  const compact = (value: number) => (value >= 1000 && value % 1000 === 0 ? `${value / 1000}k` : value.toLocaleString());
  return `${compact(range.min)}–${compact(range.max)} ${range.currency}`;
}


/** Deck finished. Discover uses the default copy; the home phone deck passes its own copy and buttons. */
export function EmptyDeck({ role, onReset, title, text, resetLabel, children }: { role: Role; onReset: () => void; title?: string; text?: string; resetLabel?: string; children?: React.ReactNode }) {
  if (title) return <div className="empty-deck"><div><Heart /></div><h2>{title}</h2>{text && <p>{text}</p>}<button className="primary-button" onClick={onReset}><RotateCcw size={16} />{resetLabel || 'Start over'}</button>{children}</div>;
  if (role === 'candidate') return <div className="empty-deck"><div><Check /></div><h2>That’s your Top 3 for today</h2><p>Quality over volume: a fresh, curated batch of matches lands tomorrow.</p><button className="primary-button" onClick={onReset}><RotateCcw size={16} />Review again (demo)</button></div>;
  return <div className="empty-deck"><div><Check /></div><h2>You’re all caught up</h2><p>We’ll bring you fresh recommendations as soon as the fit is strong enough.</p><button className="primary-button" onClick={onReset}><RotateCcw size={16} />Review again</button></div>;
}

export function MatchModal({ match, viewer, onClose, onMessage }: { match: JobMatch; viewer: Person; onClose: () => void; onMessage: () => void }) {
  const counterpart = viewer.role === 'candidate' ? (match.employer?.name || match.job?.company || 'The team') : (match.candidate?.name || 'The candidate');
  const jobRange = formatRange(match.job?.salaryRange);
  const candidateRange = formatRange(viewer.role === 'candidate' ? viewer.preferences?.salary as { min: number; max: number; currency: string } | undefined : match.candidate?.preferences?.salary as { min: number; max: number; currency: string } | undefined);
  // Item 13: tailored conversation starters from the profile/job overlap.
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const [sendingIdx, setSendingIdx] = useState(-1);
  useEffect(() => { api.matchIcebreakers(match.id).then((result) => setIcebreakers(result.icebreakers)).catch(() => undefined); }, [match.id]);
  const sendIcebreaker = async (text: string, index: number) => {
    setSendingIdx(index);
    try { await api.message({ matchId: match.id, senderId: viewer.id, text }); onMessage(); }
    catch { setSendingIdx(-1); }
  };
  // Item 16: celebrate the moment — haptics on native builds.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Heavy })).catch(() => undefined);
  }, []);
  const candidateName = match.candidate?.name || viewer.name;
  return <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Confetti /><motion.div className="match-modal" initial={{ y: 30, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: .96 }}><button className="modal-close on-dark" onClick={onClose}><X /></button>
    <div className="match-hero">
      <div className="match-script">It&rsquo;s a Match!</div>
      <p className="match-sub">You and {counterpart.split(' ')[0]} have mutually matched.</p>
      <div className="match-faces">
        <div className="match-face"><img src={match.candidate?.photo || viewer.photo} alt="" /><strong>{candidateName}</strong><span>{match.candidate?.title || viewer.title}</span></div>
        <span className="match-heart-mid"><Heart size={20} fill="currentColor" /></span>
        <div className="match-face">
          {match.employer?.photo ? <img src={match.employer.photo} alt="" /> : match.job ? <CompanyLogoMark job={match.job} /> : <div className="match-face-logo"><BriefcaseBusiness /></div>}
          <strong>{match.employer?.name || match.job?.company || counterpart}</strong>
          {match.employer && match.job ? <div className="match-badge job-match-badge"><CompanyLogoMark job={match.job} small /><span>{match.employer.title || `Recruiter at ${match.job.company}`}</span></div> : match.job?.title && <span>{match.job.title}</span>}
          {match.employer && <em className="match-tag"><b>Role</b> &middot; Recruiter</em>}
        </div>
      </div>
    </div>
    <div className="match-body">
      {(jobRange || candidateRange) && <div className="salary-reveal">
        <span className="overline">Mutual salary reveal</span>
        <div className="salary-reveal-rows">
          {jobRange && <div><small>{match.job?.title || 'Role'} offers</small><strong>{jobRange}</strong></div>}
          {candidateRange && <div><small>{viewer.role === 'candidate' ? 'Your expectation' : `${match.candidate?.name?.split(' ')[0]}'s expectation`}</small><strong>{candidateRange}</strong></div>}
        </div>
        <p>Both ranges are now visible to both sides — at the same time.</p>
      </div>}
      {icebreakers.length > 0 && <div className="icebreakers">
        <span className="overline">Break the ice</span>
        {icebreakers.map((text, index) => <button key={text} className="icebreaker" disabled={sendingIdx >= 0} onClick={() => sendIcebreaker(text, index)}>{sendingIdx === index ? <Loader2 size={13} className="spin" /> : <Send size={13} />}<span>{text}</span></button>)}
      </div>}
      <button className="primary-button" onClick={onMessage}><MessageCircle size={17} />Let&rsquo;s Talk</button>
      <button className="secondary-button match-keep-swiping" onClick={onClose}>Keep Swiping</button>
    </div>
  </motion.div></motion.div>;
}
