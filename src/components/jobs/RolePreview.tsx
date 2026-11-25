// "Candidate view" / "How candidates see this role" (founder, 2026-11-22, 2026-11-25): the recruiter tests the role in
// the REAL candidate Surf phone - the same swipe card (drag, page flips, recruiter profile) and the same Rewind · Pass ·
// Forward · Apply · Message buttons. It is a sandbox: every action only explains what a candidate would trigger and the
// card comes back; nothing is saved. Page buttons under the phone, plus Edit and Back.
import { useEffect, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowLeft, Briefcase, Building2, FileText, Forward, Heart, Pencil, RotateCcw, Send, User, X } from 'lucide-react';
import type { Job, Person } from '../../types';
import { ROLE_PAGES } from './RolePages';
import { PhoneBrand, PhoneJobCard } from '../home/NewMatchesSection';

const ICONS = [Briefcase, FileText, Building2];
const COLORS = ['#0f62fe', '#007AFF', '#AF52DE'];
type TestAction = 'like' | 'pass' | 'super' | 'forward' | 'message' | 'undo' | 'recruiter';
const WHAT: Record<TestAction, string> = {
  like: 'Apply: the candidate applies. They appear in your Jobs Candidates list; a chat opens when you like them back.',
  pass: 'Pass: the role leaves this candidate’s deck.',
  super: 'Forward: the candidate shares this role with a friend.',
  forward: 'Forward: the candidate shares this role with a friend.',
  message: 'Message (PRO): the candidate applies with a short note to you.',
  undo: 'Rewind: the candidate brings back the last card they swiped.',
  recruiter: 'See recruiter profile: candidates see you and all your open roles here.',
};

export function RolePreview({ job, recruiter, onClose, onEdit }: { job: Job; recruiter: Person; onClose: () => void; onEdit?: () => void }) {
  const [page, setPage] = useState(0);
  const [round, setRound] = useState(0); // re-mounts the card after a test swipe, so it comes back
  const [note, setNote] = useState('Try it like a candidate: drag the card, tap › to flip pages, or use the buttons below. Nothing is saved.');
  const reducedMotion = Boolean(useReducedMotion());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') setPage((p) => Math.min(ROLE_PAGES.length - 1, p + 1));
      if (e.key === 'ArrowUp') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const test = (action: TestAction) => {
    setNote(WHAT[action]);
    if (['like', 'pass', 'super', 'undo'].includes(action)) { setRound((r) => r + 1); setPage(0); }
  };
  // Candidates don't see the recruiter's own fit; the role is shown as published, with the recruiter's ID stamp.
  const shown: Job = { ...job, match: undefined as unknown as Job['match'], recruiter: job.recruiter || { name: recruiter.name, title: recruiter.title, photo: recruiter.photo, company: recruiter.company } };
  return <div className="rpv-page" role="dialog" aria-label="Candidate view of this role">
    <header className="rpv-head">
      <div><span className="overline">Candidate view · test mode</span><h1>How Candidates See This Role</h1><p>The real Surf screen job seekers swipe, with {job.title} on it. Test it, then fix anything with Edit.</p></div>
      <div className="rpv-actions">
        <button type="button" className="secondary-button small" onClick={onClose}><ArrowLeft size={14} /> Back</button>
        {onEdit && <button type="button" className="primary-button small" onClick={onEdit}><Pencil size={14} /> Edit this role</button>}
      </div>
    </header>
    <div className="rpv-stage rpv-test">
      <div className="nm-phone-col">
        <div className="nm-glow" aria-hidden="true" />
        <div className="nm-phone">
          <span className="nm-island" aria-hidden="true" />
          <div className="nm-screen">
            <div className="nm-deck" role="region" aria-label="Candidate Surf deck (test)">
              <header className="nm-head">
                <button type="button" className="nm-undo-top" onClick={() => test('undo')} aria-label="Undo last swipe"><RotateCcw size={15} /></button>
                <PhoneBrand />
                <span className="nm-count">Test</span>
              </header>
              <div className="nm-stack">
                <AnimatePresence mode="popLayout">
                  <PhoneJobCard key={`${job.id}-${round}`} job={shown} reducedMotion={reducedMotion} canLike onSwipe={(a) => test(a)} page={page} onPage={setPage} onRecruiter={() => test('recruiter')} />
                </AnimatePresence>
              </div>
              <div className="nm-action-labels" aria-hidden="true"><span>Rewind</span><span>Pass</span><span>Forward</span><span>Apply</span><span>Message</span></div>
              <div className="nm-actions">
                <button type="button" className="nm-btn sm rewind" onClick={() => test('undo')} aria-label="Rewind"><RotateCcw size={18} /></button>
                <button type="button" className="nm-btn pass" onClick={() => test('pass')} aria-label="Pass"><X size={28} strokeWidth={3} /></button>
                <button type="button" className="nm-btn forward" onClick={() => test('forward')} aria-label="Forward to a friend"><span className="nm-fwd-ico"><Forward size={20} /><User size={11} /></span></button>
                <button type="button" className="nm-btn like" onClick={() => test('like')} aria-label="Apply"><Heart size={26} fill="currentColor" /></button>
                <button type="button" className="nm-btn sm dm" onClick={() => test('message')} aria-label="Direct message (premium)"><Send size={18} /><i className="nm-pro" aria-hidden="true">PRO</i></button>
              </div>
            </div>
            <span className="nm-home-bar" aria-hidden="true" />
          </div>
        </div>
      </div>
      <p className="rpv-test-note" role="status" aria-live="polite">{note}</p>
      <nav className="tcards-nav rpv-nav" aria-label="Role pages">
        {ROLE_PAGES.map((label, i) => { const Icon = ICONS[i]; return <button key={label} type="button" className={i === page ? 'on' : ''} style={{ ['--nav-c' as string]: COLORS[i] }} onClick={() => setPage(i)} aria-current={i === page ? 'page' : undefined}><Icon size={16} /><span>{label}</span><i /></button>; })}
      </nav>
    </div>
  </div>;
}
