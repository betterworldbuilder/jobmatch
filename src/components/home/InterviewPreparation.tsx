// "Interview preparation" (candidates, AI feature). For every role the candidate is in a hiring process for:
// the skills the role asks for (must have / nice to have / languages) marked "you have it" or "refresh",
// a Coursera course search per skill to refresh, likely interview questions (existing /prep coach),
// and — PREMIUM, part of the $10 pack — a skills refresh plan written with the member's own AI chatbot
// (ChatGPT or Claude). Payments aren't open: the plan runs as a preview built from the member's own data.
import { useState } from 'react';
import { Bot, BookOpen, Check, Crown, ExternalLink, GraduationCap, Loader2, Lock, MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../../api';
import type { Bootstrap, InterviewPrep, JobMatch, View } from '../../types';
import { AgentSettingsModal, PROVIDERS, readAgent } from './AiAnalyst';
import { usePremiumInterest } from './CandidateSubscription';

import { coursera, refreshPlan, skillPlan } from '../../lib/interviewPrep';

function RoleCard({ match, data, premium, onPremium }: { match: JobMatch; data: Bootstrap; premium: boolean; onPremium: () => void }) {
  const mySkills = data.viewer.skillsDetail?.map((s) => s.name) ?? data.viewer.skills ?? [];
  const p = skillPlan(match, mySkills);
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [loadingPrep, setLoadingPrep] = useState(false);
  const [plan, setPlan] = useState<ReturnType<typeof refreshPlan> | null>(null);
  const [planning, setPlanning] = useState(false);
  const agent = readAgent();
  const loadPrep = async () => { setLoadingPrep(true); try { setPrep(await api.jobPrep(match.jobId)); } catch { setPrep(null); } finally { setLoadingPrep(false); } };
  const makePlan = async () => { setPlanning(true); await new Promise((r) => setTimeout(r, 700)); setPlan(refreshPlan(match, mySkills)); setPlanning(false); };
  const toRefresh = [...p.must, ...p.nice].filter((s) => !s.have);
  return <article className="ip-card">
    <header><div><strong>{match.job?.title}</strong><small>{match.job?.company} · {match.stage}</small></div>
      <span className="ip-score">{p.must.filter((s) => s.have).length}/{p.must.length} must-haves</span></header>
    <div className="ip-skills">
      <div><span className="ip-sub">Must have</span><div className="skill-list">{p.must.map((s) => <span key={s.skill} className={s.have ? 'ip-have' : 'ip-gap'}>{s.have ? <Check size={11} /> : <RefreshCw size={11} />}{s.skill}</span>)}</div></div>
      {p.nice.length > 0 && <div><span className="ip-sub">Nice to have</span><div className="skill-list">{p.nice.map((s) => <span key={s.skill} className={s.have ? 'ip-have' : 'ip-soft'}>{s.have && <Check size={11} />}{s.skill}</span>)}</div></div>}
      {p.languages.length > 0 && <div><span className="ip-sub">Languages</span><div className="skill-list">{p.languages.map((l) => <span key={l} className="ip-soft">{l}</span>)}</div></div>}
    </div>
    {toRefresh.length > 0 && <div className="ip-courses"><span className="ip-sub"><GraduationCap size={13} /> Refresh with Coursera</span>
      <div className="ip-course-row">{toRefresh.slice(0, 6).map((s) => <a key={s.skill} href={coursera(s.skill)} target="_blank" rel="noopener noreferrer">{s.skill} <ExternalLink size={11} /></a>)}</div></div>}
    <div className="ip-actions">
      <button type="button" className="secondary-button small" onClick={() => void loadPrep()} disabled={loadingPrep}>{loadingPrep ? <Loader2 size={14} className="spin" /> : <><BookOpen size={14} /> Likely interview questions</>}</button>
      <button type="button" className="primary-button small ip-ai" onClick={() => (premium ? void makePlan() : onPremium())} disabled={planning}>
        {planning ? <Loader2 size={14} className="spin" /> : <><Bot size={14} /> {agent ? `Ask ${PROVIDERS[agent.provider].label} for a refresh plan` : 'AI refresh plan with your chatbot'} <Crown size={12} /></>}
      </button>
    </div>
    {prep && <div className="ip-prep">
      <span className="ip-sub">Topics to review</span><ul>{prep.topics.map((t) => <li key={t}>{t}</li>)}</ul>
      {prep.skillQuestions.slice(0, 3).map((q) => <div key={q.skill}><span className="ip-sub">Likely questions · {q.skill}</span><ul>{q.questions.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></div>)}
      <p className="ip-ask"><Sparkles size={13} /> Ask them: {prep.askThem}</p>
    </div>}
    {plan && <div className="ip-plan">
      <span className="ip-sub"><Bot size={13} /> Skills refresh plan {agent ? `· with ${PROVIDERS[agent.provider].label}` : ''} <em>preview</em></span>
      <ol>{plan.map((w) => <li key={w.week}><b>Week {w.week}: {w.skill}{w.must ? ' (must have)' : ''}</b>
        <ul>{w.tasks.map((t) => <li key={t}>{t}</li>)}</ul>
        {w.skill !== 'Interview rehearsal' && <a href={coursera(w.skill)} target="_blank" rel="noopener noreferrer">Courses on Coursera <ExternalLink size={11} /></a>}</li>)}</ol>
      <small className="ip-note">Preview: built on this device from the role and your profile. When Premium opens, your own chatbot writes it with your account.</small>
    </div>}
  </article>;
}

export function InterviewPreparation({ data, navigate }: { data: Bootstrap; navigate: (v: View) => void }) {
  const roles = data.matches.filter((m) => m.candidateId === data.viewer.id && m.stage !== 'Archived');
  const [agentOpen, setAgentOpen] = useState(false);
  const [premiumAsk, setPremiumAsk] = useState(false);
  const [, setAgentTick] = useState(0);
  const agent = readAgent();
  const { state, ask } = usePremiumInterest(data.viewer.id);
  // Premium preview: the plan runs in preview for everyone today (payments not open) — the button is marked Premium.
  const premium = true;
  return <div className="page ip-page">
    <div className="page-title"><div><span className="overline">AI feature</span><h1>Interview AI coach</h1>
      <p>For every role you are in a process for: the skills it asks for, what to refresh, Coursera courses, likely questions, and a refresh plan written with your own AI chatbot.</p></div></div>
    <section className="ip-agent">
      <span className="ip-agent-icon"><Bot size={18} /></span>
      <div><strong>{agent ? `Your chatbot: ${PROVIDERS[agent.provider].label}` : 'Use your own chatbot (ChatGPT or Claude)'}</strong>
        <small>The refresh plan is a <b><Crown size={11} /> Premium</b> feature, included in the $10/month pack. Preview it today: nothing is charged.</small></div>
      <button type="button" className="secondary-button small" onClick={() => setAgentOpen(true)}>{agent ? 'Change' : 'Connect'}</button>
      <button type="button" className="text-button" onClick={() => navigate('billing')}>See Premium <Lock size={12} /></button>
    </section>
    {premiumAsk && <p className="hs-notice">{state === 'done' ? <><Check size={14} /> Saved: we will tell you when Premium opens. Nothing was charged.</> : <>Premium is not open yet. <button type="button" className="text-button" onClick={() => void ask()}>Notify me</button></>}</p>}
    {roles.length ? <div className="ip-grid">{roles.map((m) => <RoleCard key={m.id} match={m} data={data} premium={premium} onPremium={() => setPremiumAsk(true)} />)}</div>
      : <div className="sc-empty"><MessageCircle size={26} /><strong>No roles to prepare yet</strong><p>When a team likes you back, the role appears here with its skills and a preparation plan.</p></div>}
    {agentOpen && <AgentSettingsModal onClose={() => setAgentOpen(false)} onChange={() => setAgentTick((n) => n + 1)} />}
  </div>;
}
