// The concise landing story (founder, 2026-11-22): what it is (hero) → the problem → for who → how it works →
// so what (vs classic hiring) → what now. Only features the product really has; no outcome numbers.
import { ArrowRight, BriefcaseBusiness, Check, Clock3, EyeOff, Heart, MessageCircle, Search, ShieldCheck, Sparkles, Target, Timer, UserRound, X } from 'lucide-react';
import { TRIAL } from '../../lib/plans';
import { featureOn } from '../../lib/flags';
import './story.css';

type Cta = { onRegister: () => void; onLogin: () => void };

// "What is it?" (founder, 2026-11-23): one-screen summary of JobsMatchNow and how it makes hiring and job hunting
// faster, easier and better. Only what the product really does; no outcome numbers.
export function WhatItIsSection() {
  return <section className="story story-what" id="what-is-it">
    <div className="story-head"><span className="story-kicker">What is it?</span><h2>JobsMatchNow in one minute</h2>
      <p>A hiring app where job seekers and hiring teams swipe on each other. A conversation opens only when <b>both sides choose</b>: “It’s a Match”. No cold applications, no unwanted messages.</p></div>
    <div className="what-grid">
      <article><span className="what-icon"><Clock3 size={20} /></span><h3>Faster</h3><ul>
        <li>Search, apply, screen and first contact become one step: a mutual match.</li>
        <li>The best fits come first, with a fit score from 0 to 100.</li>
        <li>Chat and book the interview in the app right after the match.</li>
      </ul></article>
      <article><span className="what-icon"><Heart size={20} /></span><h3>Easier</h3><ul>
        <li>Swipe on your phone: like or pass in seconds.</li>
        <li>Try it with a demo account, no sign-up needed.</li>
        <li>Optional AI help fills your profile from a CV or a job description.</li>
      </ul></article>
      <article><span className="what-icon"><ShieldCheck size={20} /></span><h3>Better</h3><ul>
        <li>Salary up front and the reasons behind every fit.</li>
        <li>Both sides choose, so every conversation starts with real interest.</li>
        <li>When a process stops, the candidate gets a reason and feedback, not silence.</li>
      </ul></article>
    </div>
  </section>;
}

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

// Features (founder, 2026-11-23): only what the app really does today, plus the optional AI help. AI never scores,
// ranks or decides; its suggestions are marked and need a person's review (see the privacy policy, section 5).
const APP_FEATURES: { icon: typeof Heart; title: string; text: string }[] = [
  { icon: Heart, title: 'Swipe and mutual match', text: 'Like or pass in seconds. A chat opens only when both sides choose: “It’s a Match”.' },
  { icon: Target, title: 'Fit score with reasons', text: 'A 0–100 score from skills, salary, location and work mode, with the reasons shown.' },
  { icon: ShieldCheck, title: 'Salary up front', text: 'Pay ranges are visible before you talk, so nobody wastes a conversation.' },
  { icon: Search, title: 'See who already likes you', text: 'Hiring teams see the candidates who like their roles first; candidates see the teams that like them.' },
  { icon: MessageCircle, title: 'Chat and meetings', text: 'Message after a match, book a call, add it to Google Calendar or your phone.' },
  { icon: Clock3, title: 'Hiring stages and results', text: 'Follow each match round by round; export your hires to Excel or PDF.' },
  { icon: EyeOff, title: 'Privacy you control', text: 'Private distance range, contact details only after a match, delete your account anytime.' },
  { icon: Check, title: 'Verified and safe', text: 'Verified selfie badge, report button and safety tips in the app.' },
];
const AI_FEATURES: { title: string; text: string }[] = [
  { title: 'CV scan', text: 'Upload your CV and get your profile filled in. You check everything before saving.' },
  { title: 'Job-ad import', text: 'Paste or upload a job description and the role’s fields are suggested for you.' },
  { title: 'Interview prep', text: 'Topics and practice questions for each role you are interviewing for.' },
  { title: 'Conversation starters', text: 'Friendly first messages after a match, which you edit before sending.' },
  { title: 'Your own AI chatbot', text: 'Connect your own Claude or ChatGPT account and ask questions about your matches. Read-only.' },
];

// Key feature (founder, 2026-11-25), shown first and highlighted once the 48-hour answer timer is live (flag answer48).
export const ANSWER_48 = { icon: Timer, title: 'An answer within 48 hours', text: 'No more silence: pilot hiring teams answer every like within 48 working hours, yes or no. JobsMatch Assistant reminds them and keeps you posted.' };

export function AppFeaturesSection() {
  const items = featureOn('answer48') ? [ANSWER_48, ...APP_FEATURES] : APP_FEATURES;
  return <section className="story story-features" id="app-features">
    <div className="story-head"><span className="story-kicker">How it works better</span><h2>Features Designed for a Faster Hiring Process</h2></div>
    <div className="feat-grid">{items.map(({ icon: Icon, title, text }) => <article key={title} className={title === ANSWER_48.title ? 'feat-key' : undefined}>{title === ANSWER_48.title && <em className="feat-key-tag">Key feature</em>}<span className="feat-icon"><Icon size={18} /></span><strong>{title}</strong><p>{text}</p></article>)}</div>
    <div className="feat-ai">
      <h3><Sparkles size={17} /> Optional AI help</h3>
      <p className="feat-ai-note">AI only saves you time. It never scores, ranks or rejects anyone: people decide. Every AI suggestion is marked so you can review it.</p>
      <ul>{AI_FEATURES.map((f) => <li key={f.title}><b>{f.title}</b><span>{f.text}</span></li>)}</ul>
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
