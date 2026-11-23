// The concise landing story (founder, 2026-11-22): what it is (hero) → the problem → for who → how it works →
// so what (vs classic hiring) → what now. Only features the product really has; no outcome numbers.
import { ArrowRight, BriefcaseBusiness, Check, Clock3, EyeOff, Heart, MessageCircle, Search, ShieldCheck, Sparkles, Target, UserRound, X } from 'lucide-react';
import { TRIAL } from '../../lib/plans';
import './story.css';

type Cta = { onRegister: () => void; onLogin: () => void };

export function ProblemSection() {
  return <section className="story story-problem" id="problem">
    <div className="story-head"><span className="story-kicker">The problems</span><h2>The Problems We Solve in Hiring</h2></div>
    <div className="problem-grid">
      <article><h3><UserRound size={18} /> Job seekers</h3><ul>
        <li><X size={15} /> Endless scrolling and the same forms again and again</li>
        <li><X size={15} /> Applications that vanish into silence, with no feedback</li>
        <li><X size={15} /> No idea why a role fits, or why it didn’t work out</li>
      </ul></article>
      <article><h3><BriefcaseBusiness size={18} /> Hiring teams</h3><ul>
        <li><X size={15} /> Piles of applications from people who don’t fit</li>
        <li><X size={15} /> Screening by keyword guesswork</li>
        <li><X size={15} /> Email chains and calendar ping-pong</li>
      </ul></article>
    </div>
  </section>;
}

export function ForWhoSection({ onRegister }: Pick<Cta, 'onRegister'>) {
  return <section className="story story-who" id="for-who">
    <div className="story-head"><span className="story-kicker">Who it’s for</span><h2>Built for both sides of the hire.</h2></div>
    <div className="who-grid">
      <article className="who-card seeker">
        <span className="who-icon"><Search size={22} /></span>
        <h3>Job seekers</h3>
        <p>Build one profile, swipe roles that fit you, and talk only to teams that want you back.</p>
        <span className="who-tag">Free forever</span>
        <button type="button" className="who-cta" onClick={onRegister}>I’m looking for a job <ArrowRight size={16} /></button>
      </article>
      <article className="who-card hirer">
        <span className="who-icon"><BriefcaseBusiness size={22} /></span>
        <h3>Hiring teams</h3>
        <p>Recruiters, founders and hiring managers: post a role, swipe candidates ranked by fit, chat only with people who chose you too. See who already likes your roles, included in every plan.</p>
        <span className="who-tag">{Math.round(TRIAL.days / 7)} weeks free</span>
        <button type="button" className="who-cta" onClick={onRegister}>I’m hiring <ArrowRight size={16} /></button>
      </article>
    </div>
  </section>;
}

const STEPS = [
  { icon: UserRound, title: 'Create one profile', text: 'Your skills, experience, salary and location, or your role and company. Once.' },
  { icon: Target, title: 'Swipe with a reason', text: 'Every card shows a fit score from 0 to 100, based on skills, salary and location, with the reasons. Scores never reject anyone: you and the hiring team both decide.' },
  { icon: Heart, title: 'It’s a Match', text: 'A chat opens only when both sides say yes. Schedule an interview or meet for coffee nearby.' },
];

export function HowSection() {
  return <section className="story story-how" id="how">
    <div className="story-head"><span className="story-kicker">How it works</span><h2>Three steps. Both sides choose.</h2></div>
    <ol className="how-steps">{STEPS.map((s, i) => <li key={s.title}>
      <span className="how-num">{i + 1}</span>
      <span className="how-icon"><s.icon size={20} /></span>
      <h3>{s.title}</h3><p>{s.text}</p>
    </li>)}</ol>
  </section>;
}

const ROWS: [string, string, string][] = [
  ['Finding', 'Job boards and endless scrolling', 'A personal deck ranked by fit'],
  ['Applying', 'Forms, cover letters, uploads', 'One profile, one swipe'],
  ['First contact', 'Cold applications and messages', 'Chat opens only when both choose'],
  ['Fit', 'Keyword filters and guesswork', 'Fit score 0–100 with the reasons'],
  ['Privacy', 'Details copied across portals', 'Contact details hidden until a match'],
  ['Follow-up', 'Email chains, calendar ping-pong', 'Chat and scheduling in one place'],
];
const CLASSIC_STEPS = ['Send an application', 'Recruiter processes applications', 'Resume screening', 'Resume vs job description', 'Screening call and scheduling', 'Interviews and assessments', 'Reference and background checks', 'Offer negotiation', 'Offer accepted, hired'];
const JMN_STEPS = ['Mutual match: application, screening and job comparison in one step', 'Screening call or local coffee meetup', 'Interviews and assessments', 'Reference and background checks', 'Offer negotiation', 'Offer accepted, hired'];

export function SoWhatSection() {
  return <section className="story story-sowhat" id="compare">
    <div className="story-head"><span className="story-kicker">Benefits</span><h2>Benefits of Using Our New Hiring System</h2><p>Classic hiring vs JobsMatchNow: less chasing, fewer steps, and a human touch for both sides.</p></div>
    <div className="vs-frame" role="table" aria-label="Classic hiring compared with JobsMatchNow">
      <div className="vs-row vs-headrow" role="row"><span role="columnheader" /><span role="columnheader" className="vs-old">Classic</span><span role="columnheader" className="vs-new">JobsMatchNow</span></div>
      {ROWS.map(([what, old, now]) => <div className="vs-row" role="row" key={what}>
        <span role="rowheader" className="vs-what">{what}</span>
        <span role="cell" className="vs-old"><X size={13} />{old}</span>
        <span role="cell" className="vs-new"><Check size={13} />{now}</span>
      </div>)}
    </div>
    <div className="steps-card" id="trust">
      <div className="steps-head"><Clock3 size={18} /><h3>Steps to hire</h3></div>
      <div className="steps-bars">
        <div><span>Classic</span><i className="old" style={{ width: '100%' }}><b>9 steps</b></i></div>
        <div><span>JobsMatchNow</span><i className="new" style={{ width: `${(6 / 9) * 100}%` }}><b>6 steps</b></i></div>
      </div>
      <p>The first four classic steps happen in one: applying, screening, comparing the resume with the job, and confirming interest on both sides.</p>
      <details className="steps-details"><summary>See every step</summary>
        <div className="steps-lists">
          <ol className="old"><li className="steps-list-title">Classic</li>{CLASSIC_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
          <ol className="new"><li className="steps-list-title">JobsMatchNow</li>{JMN_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      </details>
    </div>
    <ul className="trust-points">
      <li><ShieldCheck size={16} /> Both sides opt in</li>
      <li><EyeOff size={16} /> Candidates control what employers see</li>
      <li><MessageCircle size={16} /> Honest feedback when a process stops</li>
    </ul>
  </section>;
}

export function WhatNowSection({ onRegister, onLogin }: Cta) {
  return <section className="story story-now" id="start">
    <span className="story-kicker light"><Sparkles size={14} /> What now?</span>
    <h2>Subscribe now and enjoy the fastest, easiest way to find your dream job and your dream candidates.</h2>
    <div className="now-actions">
      <button type="button" className="primary-button" onClick={onRegister}>Register free <ArrowRight size={18} /></button>
      <button type="button" className="now-demo" onClick={onLogin}><Sparkles size={16} /> Test demo account</button>
    </div>
    <p className="now-facts"><span><Check size={14} /> Free for job seekers</span><span><Check size={14} /> {Math.round(TRIAL.days / 7)} weeks free for hiring teams</span><span><Check size={14} /> No fee per hire</span></p>
  </section>;
}
