import { useEffect, useRef, useState } from 'react';
import { Award, BadgeCheck, CalendarClock, CheckCircle2, Clock3, Coffee, FileText, Home, ListChecks, MapPin, Music2, Pencil, Plane, PlusCircle, Quote, ShieldCheck, Sparkles, Star, Target, Users, Wallet, XCircle } from 'lucide-react';
import type { Job } from '../../types';
import { JobHeaderBadge } from './JobHeaderBadge';

function Card({ label, icon: Icon, step, onEdit, children, tone }: { label: string; icon: typeof Star; step?: number; onEdit?: (step: number) => void; children: React.ReactNode; tone?: string }) {
  return <div className={tone ? `tcard tcard-${tone}` : 'tcard'}>
    <header className="tcard-head"><span className="tcard-label"><Icon size={15} /> {label}</span>
      {onEdit && step !== undefined && <button className="tcard-edit" onClick={() => onEdit(step)} aria-label={`Edit ${label}`}><Pencil size={13} /></button>}
    </header>
    <div className="tcard-scroll">{children}</div>
  </div>;
}

/** Spotify/YouTube link kept as an external link (no autoplay), mirrors the candidate card. */
function songLabel(url?: string): string | null {
  if (!url) return null;
  try { const u = new URL(url); if (u.hostname.includes('spotify')) return 'Open in Spotify'; if (u.hostname.includes('youtu')) return 'Open on YouTube'; return 'Open link'; }
  catch { return null; }
}

// Card order: Role details (full JD) · Skills requirements · Compensation · Team & culture · Reviews · Fit analysis (last, only with a match).
const NAV_ALL = [
  { icon: FileText, label: 'Role details', color: '#fd267a' },
  { icon: ListChecks, label: 'Skills', color: '#007AFF' },
  { icon: Wallet, label: 'Compensation', color: '#34C759' },
  { icon: Users, label: 'Team & culture', color: '#FF9500' },
  { icon: Star, label: 'Reviews', color: '#AF52DE' },
  { icon: Target, label: 'Fit analysis', color: '#00C7BE' },
];

const BULLET = /^\s*(?:[-•*·▪●]|\d{1,2}[.)])\s+/;
/** A short line with no closing punctuation reads as a section heading ("About the job", "How to apply"). */
const isHeading = (line: string) => line.length <= 60 && !/[.,;:!?)]$/.test(line) && !BULLET.test(line) && /^[A-Z0-9]/.test(line) && line.split(/\s+/).length <= 8;

/** The pasted job description, kept as written: headings, bullet lists (after "…:" or "- "), paragraphs. */
export function RoleDetailsText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const blocks: React.ReactNode[] = [];
  let list: string[] = []; let listMode = false;
  const flush = () => { if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="rd-list">{list.map((li, i) => <li key={i}>{li}</li>)}</ul>); list = []; };
  lines.forEach((line, i) => {
    if (!line) { flush(); listMode = false; return; }
    if (BULLET.test(line)) { list.push(line.replace(BULLET, '')); return; }
    if (isHeading(line)) { flush(); listMode = false; blocks.push(<h4 key={`h${i}`} className="rd-h">{line}</h4>); return; }
    if (listMode && line.length <= 240) { list.push(line); return; }
    flush();
    blocks.push(<p key={`p${i}`} className="rd-p">{line}</p>);
    listMode = /:$/.test(line); // "The role includes:" → the following lines are bullets
  });
  flush();
  return <div className="rd-text">{blocks}</div>;
}

/**
 * The job as a horizontal deck of Tinder-style cards with a navigator — the
 * job-side mirror of CandidateCards. Used for the employer's own job posting
 * (onEdit set) and for a candidate viewing a job in detail ("Job Details";
 * match set → Fit analysis card; salary stays masked pre-match when salaryHidden).
 */
export function JobCards({ job: j, onEdit, unlocked = false, showHeader = true }: { job: Job; onEdit?: (step: number) => void; unlocked?: boolean; showHeader?: boolean }) {
  const m = j.match;
  const deckRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const goTo = (i: number) => {
    const deck = deckRef.current; if (!deck) return;
    const target = deck.children[i] as HTMLElement | undefined;
    if (target) deck.scrollTo({ left: target.offsetLeft, behavior: 'auto' });
  };
  useEffect(() => {
    const deck = deckRef.current; if (!deck) return;
    const onScroll = () => setActive(Math.round(deck.scrollLeft / deck.clientWidth));
    deck.addEventListener('scroll', onScroll, { passive: true });
    return () => deck.removeEventListener('scroll', onScroll);
  }, []);

  const requiredCount = m ? m.matchedSkills.length + (m.missingSkills?.length ?? 0) : 0;
  const workMode = j.workMode === 'Remote' ? (j.remoteScope === 'country' ? `Remote (within ${j.country || 'country'})` : 'Remote (worldwide)')
    : j.workMode === 'Hybrid' && j.hiringRadiusKm ? `Hybrid (within ${j.hiringRadiusKm} km)` : j.workMode;
  const showSalary = !j.salaryHidden || unlocked;

  // Card 5 aggregate rating across company reviews.
  const avgRating = j.companyRating ?? (j.companyReviews?.length
    ? j.companyReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / j.companyReviews.filter((r) => r.rating !== undefined).length
    : undefined);
  const song = songLabel(j.teamSong);
  const NAV = m ? NAV_ALL : NAV_ALL.slice(0, 5);
  const mustHave = j.requiredSkillsDetail?.map((s) => s.name) ?? j.requiredSkills ?? [];
  const have = new Set((m?.matchedSkills || []).map((s) => s.toLowerCase()));

  return <div className="tcards">
    <div className="tcards-deck" ref={deckRef}>
      {/* ---------- Card 1 — Role details (the full job description) ---------- */}
      <div className="tcard-slide"><Card label="Role details" icon={FileText} step={1} onEdit={onEdit}>
        {showHeader && <JobHeaderBadge job={{ ...j, salaryHidden: !showSalary }} compact />}
        <div className="tcard-snapshot-facts rd-facts">
          {m && <span className="rd-match"><Sparkles size={12} /> {m.score}% match{requiredCount ? ` · ${m.matchedSkills.length} of ${requiredCount} skills` : ''}</span>}
          {j.experienceLevel && <span>{j.experienceLevel} experience</span>}
          {j.openings !== undefined && <span>{j.openings} opening{j.openings === 1 ? '' : 's'}</span>}
          {j.deadline && <span><CalendarClock size={13} /> Apply by {j.deadline}</span>}
          <span>{j.applicants} applicant{j.applicants === 1 ? '' : 's'}</span>
          {j.responseTime && <span>{j.responseTime} response</span>}
        </div>
        {j.fullDescription ? <RoleDetailsText text={j.fullDescription} />
          : <div className="rd-text">
            {j.description && <p className="rd-p">{j.description}</p>}
            {j.responsibilities?.length ? <><h4 className="rd-h">What you will do</h4><ul className="rd-list">{j.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul></> : null}
            {j.mission && <><h4 className="rd-h">Why it matters</h4><p className="rd-p">{j.mission}</p></>}
            {onEdit && <p className="tcard-empty">Paste the full job description in Role details so candidates read the whole story.</p>}
          </div>}
      </Card></div>

      {/* ---------- Card 2 — Skills requirements: must have · nice to have · languages ---------- */}
      <div className="tcard-slide"><Card label="Skills requirements" icon={ListChecks} step={1} onEdit={onEdit}>
        <span className="tcard-sub must">Must have</span>
        <div className="skill-list pf-skills">{mustHave.length ? mustHave.map((s) => <span key={s} className={m ? (have.has(s.toLowerCase()) ? 'ok' : 'miss') : ''}>{m && (have.has(s.toLowerCase()) ? <CheckCircle2 size={11} /> : <XCircle size={11} />)}{s}</span>) : <em className="tcard-empty">Not listed yet</em>}</div>
        <span className="tcard-sub">Nice to have</span>
        <div className="skill-list soft">{j.niceToHaves?.length ? j.niceToHaves.map((s) => <span key={s}>{s}</span>) : <em className="tcard-empty">Not listed yet</em>}</div>
        <span className="tcard-sub">Languages</span>
        <div className="skill-list soft">{j.requiredLanguages?.length ? j.requiredLanguages.map((s) => <span key={s}>{s}</span>) : <em className="tcard-empty">Not listed yet</em>}</div>
        {j.successMeasures?.length ? <><span className="tcard-sub">What success looks like</span><ul className="coach-list">{j.successMeasures.map((s) => <li key={s}>{s}</li>)}</ul></> : null}
      </Card></div>

      {/* ---------- Card 3 — Compensation & logistics ---------- */}
      <div className="tcard-slide"><Card label="Compensation" icon={Wallet} step={2} onEdit={onEdit}>
        <dl className="tcard-dl">
          {showSalary && j.salary ? <div><dt><Wallet size={12} /> Salary</dt><dd>{j.salary}{j.salaryNegotiable ? ' · negotiable' : ''}</dd></div> : null}
          {j.bonus ? <div><dt>Bonus</dt><dd>{j.bonus}</dd></div> : null}
          {j.equity ? <div><dt>Equity</dt><dd>{j.equity}</dd></div> : null}
          {j.workingHours ? <div><dt><Clock3 size={12} /> Hours</dt><dd>{j.workingHours}</dd></div> : null}
          {j.flexibleHours ? <div><dt>Flexibility</dt><dd>{j.flexibleHours}</dd></div> : null}
          {j.hybridDays !== undefined ? <div><dt><Home size={12} /> Office days</dt><dd>max {j.hybridDays}/wk</dd></div> : null}
          {j.probation ? <div><dt>Probation</dt><dd>{j.probation}</dd></div> : null}
          {j.travel ? <div><dt><Plane size={12} /> Travel</dt><dd>{j.travel}</dd></div> : null}
          {j.onCall ? <div><dt>On-call</dt><dd>{j.onCall}</dd></div> : null}
          {j.startDate ? <div><dt><CalendarClock size={12} /> Start date</dt><dd>{j.startDate}</dd></div> : null}
          {j.visaSponsorship !== undefined ? <div><dt><ShieldCheck size={12} /> Visa</dt><dd>{j.visaSponsorship ? 'Sponsorship available' : 'No sponsorship'}</dd></div> : null}
          {j.workVisaRequired !== undefined ? <div><dt><ShieldCheck size={12} /> Work visa &amp; nationality</dt><dd>{j.workVisaRequired ? 'Valid work visa required'
            : `Open to: ${j.authorizedNationalities?.mode === 'custom' ? (j.authorizedNationalities.custom || []).join(', ') || 'selected countries' : j.authorizedNationalities?.mode === 'us' ? 'US nationals' : j.authorizedNationalities?.mode === 'europe' ? 'European nationals' : 'any nationality'}`}</dd></div> : null}
          {j.relocationSupport !== undefined ? <div><dt>Relocation</dt><dd>{j.relocationSupport ? 'Support available' : 'Not offered'}</dd></div> : null}
        </dl>
        {j.benefits?.length ? <><span className="tcard-sub">Benefits</span><div className="skill-list soft">{j.benefits.map((s) => <span key={s}>{s}</span>)}</div></> : null}
      </Card></div>

      {/* ---------- Card 4 — Team & culture ---------- */}
      <div className="tcard-slide"><Card label="Team & culture" icon={Users} step={3} onEdit={onEdit} tone="human">
        {j.recruiter?.name && <div className="tcard-recruiter">
          {j.recruiter.photo ? <img src={j.recruiter.photo} alt="" /> : <span className="tcard-recruiter-fallback">{(j.recruiter.name || j.company).charAt(0)}</span>}
          <div><strong>{j.recruiter.name}</strong><span>{j.recruiter.title || 'Hiring team'}{j.recruiter.company || j.company ? ` · ${j.recruiter.company || j.company}` : ''}</span></div>
          <em>Your recruiter</em>
        </div>}
        {j.mission ? <p className="tcard-presentation">{j.mission}</p> : onEdit ? <p className="tcard-empty">Add a mission statement — why this role matters.</p> : null}
        <dl className="tcard-dl">
          {j.teamSize ? <div><dt><Users size={12} /> Team size</dt><dd>{j.teamSize}</dd></div> : null}
          {j.teamLocations ? <div><dt><MapPin size={12} /> Team locations</dt><dd>{j.teamLocations}</dd></div> : null}
          {j.managerName ? <div><dt>Reports to</dt><dd>{j.managerName}{j.managerTitle ? ` · ${j.managerTitle}` : ''}</dd></div> : null}
        </dl>
        {j.managerStyle ? <p className="tcard-motto"><Quote size={13} /> {j.managerStyle}</p> : null}
        {j.teamComposition?.length ? <><span className="tcard-sub">Team composition</span><div className="skill-list soft">{j.teamComposition.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {j.managementStyleTags?.length ? <><span className="tcard-sub">Management style</span><div className="skill-list soft">{j.managementStyleTags.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {j.teamStyle?.length ? <><span className="tcard-sub">Team style</span><div className="skill-list soft">{j.teamStyle.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {j.values?.length ? <><span className="tcard-sub">Values</span><div className="skill-list soft">{j.values.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {j.culture?.length ? <><span className="tcard-sub">Culture</span><div className="skill-list soft">{j.culture.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {song ? <a className="tdoc-btn ghost tcard-song" href={j.teamSong} target="_blank" rel="noreferrer"><Music2 size={13} /> Team soundtrack — {song}</a> : null}
      </Card></div>

      {/* ---------- Card 5 — Reviews & process ---------- */}
      <div className="tcard-slide"><Card label="Reviews & process" icon={Star} step={4} onEdit={onEdit}>
        {avgRating !== undefined && <div className="tcard-rating"><strong>{avgRating.toFixed(1)}</strong><div className="tcard-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={n <= Math.round(avgRating) ? 'on' : ''} />)}</div>{j.reviewCount !== undefined && <small>{j.reviewCount} review{j.reviewCount === 1 ? '' : 's'}</small>}</div>}
        {j.companyReviews?.length ? <ul className="tcard-recs">{j.companyReviews.map((r, i) => <li key={i}>
          <div className="trec-head"><div><strong>{r.author || 'Anonymous'}{r.verified && <BadgeCheck size={13} className="verified-mark" />}</strong>{r.role && <small>{r.role}</small>}</div></div>
          <p>“{r.text}”</p>
          <div className="trec-foot">{r.date && <time>{r.date}</time>}</div>
        </li>)}</ul> : <p className="tcard-empty"><Coffee size={14} /> {onEdit ? 'Invite past hires to leave a review (optional).' : 'No public reviews yet.'}</p>}
        {(j.hiringTimeline || j.interviewProcess?.length) ? <><span className="tcard-sub">Hiring process</span>
          {j.hiringTimeline && <p className="tcard-motto"><Clock3 size={13} /> {j.hiringTimeline}</p>}
          {j.interviewProcess?.length ? <div className="coach-steps">{j.interviewProcess.map((step, index) => <span key={step}><b>{index + 1}</b>{step}</span>)}</div> : null}
        </> : null}
        {(j.backgroundCheck !== undefined || j.referenceCheck !== undefined) && <div className="tcard-hero-meta" style={{ marginTop: 14 }}>
          {j.backgroundCheck && <span><Award size={13} /> Background check required</span>}
          {j.referenceCheck && <span><Award size={13} /> References required</span>}
        </div>}
      </Card></div>

      {/* ---------- Card 6 — Fit analysis (last; only when there is a match to analyse) ---------- */}
      {m && <div className="tcard-slide"><Card label="Fit analysis" icon={Target}>
        <div className="tcard-counts"><span className="ok">{m.matchedSkills.length} matching</span><span className="miss">{m.missingSkills?.length ?? 0} missing</span><span className="extra">{m.extraSkills?.length ?? 0} extra</span></div>
        <div className="tcard-skillsplit">
          <div className="tskill-group ok"><span className="tskill-h"><CheckCircle2 size={13} /> Matching</span><ul className="tskill-rows">{m.matchedSkills.length ? m.matchedSkills.map((s) => <li key={s}><b>{s}</b></li>) : <li><em>None yet</em></li>}</ul></div>
          {(m.missingSkills?.length ?? 0) > 0 && <div className="tskill-group miss"><span className="tskill-h"><XCircle size={13} /> Gaps to close</span><div className="skill-list">{m.missingSkills!.map((s) => <span key={s} className="miss">{s}</span>)}</div></div>}
          {(m.extraSkills?.length ?? 0) > 0 && <div className="tskill-group extra"><span className="tskill-h"><PlusCircle size={13} /> Bonus skills you bring</span><div className="skill-list">{m.extraSkills!.map((s) => <span key={s}>{s}</span>)}</div></div>}
        </div>
        {j.requiredLanguages?.length ? <><span className="tcard-sub">Languages</span><div className="skill-list soft">{j.requiredLanguages.map((s) => <span key={s}>{s}</span>)}</div></> : null}
      </Card></div>}
    </div>

    {/* ---------- Navigator ---------- */}
    <nav className="tcards-nav" aria-label="Job cards">
      {NAV.map((item, i) => { const Icon = item.icon; return <button key={item.label} className={i === active ? 'on' : ''} style={{ ['--nav-c' as string]: item.color }} onClick={() => goTo(i)} aria-label={item.label} aria-current={i === active}><Icon size={16} /><span>{item.label}</span><i /></button>; })}
    </nav>
  </div>;
}
