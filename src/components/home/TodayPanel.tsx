// Home "Today": the first section of the home page for candidates and recruiters.
// Profile card (who teams see, completeness, visibility) + summary, urgent actions,
// next interview and search settings. Every value comes from real records.
import { useState } from 'react';
import { AlertCircle, ArrowRight, BadgeCheck, Bot, Calendar, Check, Eye, EyeOff, Heart, Mail, MessageCircle, Pencil, Phone, Plus, SlidersHorizontal, Sparkles, Target, User, X } from 'lucide-react';
import { AgentSettingsModal, PROVIDERS, readAgent } from './AiAnalyst';
import { JobStatusLine } from '../JobStatusPicker';
import { ContactBarEditor } from '../ContactBarEditor';
import { api } from '../../api';
import type { Bootstrap, View } from '../../types';
import { DemoBadge } from '../DemoBadge';
import { contactLinks, interviewsThisWeek, likesWaiting, nextInterview, repliesWaiting, salaryLabel, urgentItems, workModeLabel } from '../../lib/today';
import { googleCalendarUrl, icsDataUrl, outlookCalendarUrl } from '../../lib/calendar';

type Props = {
  data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void;
  onEditProfile: (step: number) => void; onOpenMessages?: (matchId: string) => void;
  onPreview?: () => void; onScroll?: (id: string) => void;
};

/** Contact bar (Book an interview, WhatsApp, Zalo, Telegram, phone, email) from the member's own channels. */
export function ContactBar({ person, onAdd }: { person: Bootstrap['viewer']; onAdd?: () => void }) {
  const contacts = contactLinks(person);
  const candidate = person.role === 'candidate';
  return <div className="tp-contact">
    <p className="tp-meeting-label">{candidate ? 'How teams reach you after a match' : 'How candidates reach you'}</p>
    {contacts.length ? <div className="tp-contact-bar">{contacts.map((c) => <a key={c.kind + c.href} className={`tp-c tp-c-${c.kind}`} href={c.href} target={c.kind === 'email' || c.kind === 'phone' ? undefined : '_blank'} rel="noopener noreferrer">
      {c.kind === 'book' ? <Calendar size={15} /> : c.kind === 'email' ? <Mail size={15} /> : c.kind === 'phone' ? <Phone size={15} /> : c.kind === 'zalo' ? <b className="tp-zalo">Zalo</b> : <MessageCircle size={15} />}
      {c.kind === 'zalo' ? null : c.label}
    </a>)}</div> : <small className="tp-muted-small">No contact details yet.</small>}
    {onAdd && <button type="button" className="tp-link" onClick={onAdd}>Add WhatsApp, Zalo or a booking link <ArrowRight size={13} /></button>}
    {candidate && <small className="tp-muted-small">Your contact details stay hidden until a team matches with you.</small>}
  </div>;
}

/** Kept switchable in code; off since 2026-11-22 (founder: remove the profile from Things to do). */
const SHOW_PROFILE_CARD = false;

function greeting(now = new Date()) { const h = now.getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

function ageOf(birthdate?: string) {
  if (!birthdate) return undefined;
  const t = new Date(birthdate).getTime();
  return Number.isNaN(t) ? undefined : Math.floor((Date.now() - t) / (365.25 * 86400000));
}

export function TodayPanel({ data, setData, navigate, onEditProfile, onOpenMessages, onPreview, onScroll }: Props) {
  const v = data.viewer;
  const candidate = v.role === 'candidate';
  const [saving, setSaving] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agent, setAgent] = useState(readAgent);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [interest, setInterest] = useState<'idle' | 'busy' | 'done'>('idle');
  const askInterest = async () => {
    setInterest('busy');
    try { await api.registerInterest(v.id, 'candidate-premium'); setInterest('done'); }
    catch (e) { setInterest('idle'); alert(e instanceof Error ? e.message : 'Could not save'); }
  };
  const completeness = v.completeness ?? 0;
  const hidden = v.privacy?.visibility === 'paused';
  const verified = Boolean(v.photoVerified || v.verified || v.provider === 'google' || v.provider === 'linkedin' || completeness >= 80);
  const age = candidate && v.agePrivacy === 'public' ? ageOf(v.birthdate) : undefined;
  const next = nextInterview(data);
  const thisWeek = next && next.at - Date.now() <= 7 * 86400000 ? next : null;
  const calEvent = thisWeek ? { title: thisWeek.title, description: `JobsMatchNow — with ${thisWeek.who}`, startAt: thisWeek.at, durationMinutes: thisWeek.durationMinutes } : null;
  const contacts = contactLinks(v);
  const urgent = urgentItems(data);
  const myJobs = data.jobs.filter((j) => j.employerId === v.id);
  const openRoles = myJobs.filter((j) => !/draft|closed|expired|paused/i.test(String(j.status))).length;

  const toggleVisibility = async () => {
    setSaving(true);
    const privacy = { ...(v.privacy || {}), visibility: hidden ? 'all' as const : 'paused' as const };
    try { await api.updateProfile(v.id, { privacy }); setData({ ...data, viewer: { ...v, privacy } }); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not change visibility'); }
    finally { setSaving(false); }
  };
  const openThread = (matchId?: string) => { if (matchId && onOpenMessages) onOpenMessages(matchId); else navigate('messages'); };
  const doUrgent = (kind: string, matchId?: string) => {
    if (kind === 'reply') openThread(matchId);
    else if (kind === 'interview') navigate('stages');
    else if (kind === 'likes') (candidate ? onScroll?.('td-chasing') : navigate('selected'));
    else if (kind === 'salary') onEditProfile(2);
    else onEditProfile(0);
  };

  const summary = [
    { icon: Heart, label: 'Matches', value: data.matches.length, onClick: () => (candidate ? onScroll?.('td-matches') : navigate('selected')) },
    { icon: Sparkles, label: candidate ? 'Recruiters like you' : 'Candidates like you', value: likesWaiting(data), onClick: () => (candidate ? onScroll?.('td-chasing') : navigate('selected')) },
    { icon: MessageCircle, label: 'Replies waiting', value: repliesWaiting(data).length, onClick: () => navigate('messages') },
    { icon: Calendar, label: 'Interviews this week', value: interviewsThisWeek(data), onClick: () => navigate('stages') },
  ];

  const lookingFor = candidate
    ? [v.preferences?.desiredRoles?.slice(0, 2).join(', '), workModeLabel(v.preferences?.workMode), salaryLabel(v.preferences?.salary)].filter(Boolean)
    : [`${openRoles} open ${openRoles === 1 ? 'role' : 'roles'}`, (v.regions || []).slice(0, 2).join(', '), (v.specializations || []).slice(0, 2).join(', ')].filter(Boolean);

  const settings: [string, string][] = candidate
    ? [
      ['Target role (1 free)', v.preferences?.desiredRoles?.[0] || ''],
      ['Work mode', workModeLabel(v.preferences?.workMode)],
      ['Salary', salaryLabel(v.preferences?.salary)],
      ['Job type', v.preferences?.employmentTypes?.join(', ') || ''],
      ['Distance (on-site roles)', v.distanceRangeKm ? `${v.distanceRangeKm} km` : ''],
      ['Available', v.preferences?.availability || v.availability || ''],
    ]
    : [
      ['Open roles', String(openRoles)],
      ['Hiring regions', (v.regions || v.officeLocations || []).join(', ')],
      ['Focus', (v.specializations || v.techStack || []).slice(0, 4).join(', ')],
      ['Candidate filter', 'All candidates (filter by fit in Discover)'],
    ];

  // The profile card left "Things to do" (founder, 2026-11-22): the profile lives in the sidebar box and on
  // "My full profile"; the recruiter contact bar moved to the recruiter profile page.
  return <section className="td-section tp-section tp-no-profile" id="td-today" aria-label="Today">
    {SHOW_PROFILE_CARD && <article className="tp-profile">
      <div className="tp-photo" style={v.photo ? { backgroundImage: `url(${v.photo})` } : undefined}>{!v.photo && <User size={42} />}</div>
      <div className="tp-profile-body">
        <p className="tp-hello">{greeting()}, {v.name.split(' ')[0]}{(v.demo || v.sample) && <DemoBadge label={v.sample ? 'Starter sample account' : 'Demo account — not a real user'} />}</p>
        <h2>{candidate ? v.name : v.company || v.name}{age !== undefined && <span className="tp-age">{age}</span>}{verified && <BadgeCheck size={22} className="tp-verified" aria-label="Verified" />}</h2>
        <p className="tp-headline">{candidate ? (v.headline || v.title) : `${v.name}${v.title ? ` · ${v.title}` : ''}`}</p>
        {candidate && <p className="tp-status-line"><JobStatusLine s={v.jobStatus} matches={data.matches} onOpen={onOpenMessages} /></p>}
        {lookingFor.length > 0 && <p className="tp-looking"><b>{candidate ? 'Looking for' : 'Hiring'}</b>{lookingFor.join(' · ')}</p>}
        <div className="tp-complete" aria-label={`Profile ${completeness}% complete`}><span style={{ width: `${completeness}%` }} /></div>
        <div className="tp-actions">
          <button type="button" className="tp-edit" onClick={() => onEditProfile(0)}><Pencil size={15} /> Edit info <small>({completeness}% complete)</small></button>
          <button type="button" className="secondary-button small" onClick={() => navigate('profile')}><User size={14} /> My full profile</button>
          {candidate && onPreview && <button type="button" className="secondary-button small" onClick={onPreview}><Eye size={14} /> Preview as recruiter</button>}
          {candidate && <button type="button" className={hidden ? 'tp-visibility off' : 'tp-visibility'} onClick={() => void toggleVisibility()} disabled={saving} aria-pressed={!hidden}>
            {hidden ? <><EyeOff size={14} /> Hidden from recruiters</> : <><Eye size={14} /> Visible to recruiters</>}
          </button>}
        </div>

        {/* My next meeting this week + add to my calendar */}
        <div className="tp-meeting">
          <p className="tp-meeting-label"><Calendar size={13} /> My next meeting this week</p>
          {thisWeek ? <>
            <strong>{thisWeek.title}</strong>
            <span>{new Date(thisWeek.at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}{thisWeek.source === 'call' ? ` · ${new Date(thisWeek.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''} · with {thisWeek.who}</span>
            <div className="tp-cal">
              <span>Add to my calendar:</span>
              <a href={googleCalendarUrl(calEvent!)} target="_blank" rel="noopener noreferrer">Google</a>
              <a href={outlookCalendarUrl(calEvent!)} target="_blank" rel="noopener noreferrer">Outlook</a>
              <a href={icsDataUrl(calEvent!)} download="jobsmatchnow-meeting.ics">Apple / .ics</a>
            </div>
          </> : <small>No meeting planned this week.</small>}
        </div>

        {/* Contact bar: candidates edit theirs on the profile page; recruiters edit "How candidates reach you" here. */}
        {candidate ? (contacts.length > 0 && <ContactBar person={v} />) : <div className="tp-contact-edit"><ContactBarEditor key={v.id} viewer={v} onSaved={(viewer) => setData({ ...data, viewer })} /></div>}
      </div>
    </article>}

    <div className="tp-side">
      {/* Summary */}
      <div className="tp-summary">{summary.map((s) => { const Icon = s.icon; return <button type="button" key={s.label} onClick={s.onClick}><Icon size={16} /><strong>{s.value}</strong><small>{s.label}</small></button>; })}</div>

      {/* Urgent */}
      <div className="tp-card">
        <h3><AlertCircle size={16} /> Urgent</h3>
        {urgent.length ? <ul className="tp-urgent">{urgent.map((u) => <li key={u.id}><span>{u.text}</span><button type="button" onClick={() => doUrgent(u.kind, u.matchId)}>{u.action}<ArrowRight size={13} /></button></li>)}</ul>
          : <p className="tp-muted">Nothing urgent. You are all caught up.</p>}
      </div>

      <div className="tp-row">
        {/* Next interview */}
        <div className="tp-card">
          <h3><Calendar size={16} /> Next interview</h3>
          {next ? <div className="tp-next">
            <strong>{next.title}</strong>
            <span>{new Date(next.at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}{next.source === 'call' ? ` · ${new Date(next.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
            <small>With {next.who}</small>
            {/* Add to my calendar (moved here with the profile card) */}
            <div className="tp-cal">
              <span>Add to my calendar:</span>
              {(() => { const ev = { title: next.title, description: `JobsMatchNow — with ${next.who}`, startAt: next.at, durationMinutes: next.durationMinutes }; return <>
                <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">Google</a>
                <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">Outlook</a>
                <a href={icsDataUrl(ev)} download="jobsmatchnow-meeting.ics">Phone alarm</a>
              </>; })()}
            </div>
            <button type="button" className="tp-link" onClick={() => navigate('stages')}>See all stages <ArrowRight size={13} /></button>
          </div> : <p className="tp-muted">No interview planned yet. It shows here once a round has a date.</p>}
        </div>

        {/* Search settings */}
        <div className="tp-card">
          <h3><SlidersHorizontal size={16} /> My search settings</h3>
          <dl className="tp-settings">{settings.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val || <em>Not set</em>}</dd></div>)}</dl>
          {candidate && (v.preferences?.desiredRoles?.length || 0) > 1 && <p className="tp-locked">{(v.preferences?.desiredRoles?.length || 1) - 1} more saved {(v.preferences?.desiredRoles?.length || 1) - 1 === 1 ? 'role' : 'roles'}: {v.preferences!.desiredRoles!.slice(1).join(', ')}</p>}
          <div className="tp-setting-actions">
            {candidate && <button type="button" className="tp-add-roles" onClick={() => setRolesOpen(true)}><Plus size={14} /> Add roles</button>}
            <button type="button" className="tp-link" onClick={() => (candidate ? onEditProfile(2) : navigate('profile'))}>Edit settings <ArrowRight size={13} /></button>
          </div>
          <div className="tp-agent">
            <span><Bot size={15} /> <b>Use personal AI agent</b><small>{agent ? `Connected: ${PROVIDERS[agent.provider].label}` : 'ChatGPT or Claude — preview'}</small></span>
            <button type="button" className="secondary-button small" onClick={() => setAgentOpen(true)}>{agent ? 'Manage' : 'Set up'}</button>
          </div>
        </div>
      </div>
    </div>
    {agentOpen && <AgentSettingsModal onClose={() => setAgentOpen(false)} onChange={setAgent} />}
    {rolesOpen && <div className="modal-scrim" onClick={() => setRolesOpen(false)}>
      <div className="ai-setup" role="dialog" aria-modal="true" aria-label="Add target roles" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fm-x" aria-label="Close" onClick={() => setRolesOpen(false)}><X size={18} /></button>
        <h2><Target size={22} /> Target more roles</h2>
        <p>Your first target role is free. <b>Premium</b> lets you search up to <b>3 roles at once</b> (for example Backend Engineer, Platform Engineer and Tech Lead), each with its own matches and report — plus <b>10 direct messages</b> a month.</p>
        <div className="tp-price"><strong>$10</strong><span>/ month · 3 target roles + 10 direct messages · cancel any time</span></div>
        {interest === 'done' ? <p className="tp-thanks"><Check size={16} /> Thanks — we saved your interest and will tell you when Premium opens. Nothing was charged.</p>
          : <button type="button" className="fm-black" disabled={interest === 'busy'} onClick={() => void askInterest()}>{interest === 'busy' ? 'Saving…' : 'Get Premium — notify me'}</button>}
        <button type="button" className="tp-link" onClick={() => { setRolesOpen(false); navigate('billing'); }}>See plans <ArrowRight size={13} /></button>
        <p className="ai-privacy">Payments for candidates are not open yet: this records your interest only.</p>
      </div>
    </div>}
  </section>;
}
