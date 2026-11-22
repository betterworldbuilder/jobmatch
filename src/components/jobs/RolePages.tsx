// A role as 3 pages (founder, 2026-11-22), used in the job seeker's swipe card and in the recruiter's
// "How candidates see this role" page. No role photos: the card shows the recruiter's photo.
//   1 Summary — role, company, recruiter (+ profile link), location, contract type + duration, start date,
//     salary (exact range only after a mutual match), work mode, nationality / citizenship rule, languages, fit
//   2 Job description — the full JD, role details, must-have, nice-to-have, then the fit details
//   3 Company — the recruiter's public company profile and the benefits ("Not added yet" when empty)
import { useState } from 'react';
import { Briefcase, Building2, CalendarClock, Check, ChevronRight, Globe, Languages, MapPin, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';
import { apiBase } from '../../api';
import type { CompanyProfile, Job } from '../../types';
import { RoleDetailsText } from './JobCards';
import { SalaryBadge } from '../discover/DeckParts';
import { showsCommute } from '../discover/deckLogic';

export const ROLE_PAGES = ['Summary', 'Job description', 'Company'];

const asset = (v: string) => (/^(https?:|data:|blob:)/i.test(v) ? v : `${apiBase}${v.startsWith('/') ? '' : '/'}${v}`);
const NAT = { any: 'any nationality', us: 'US nationals', europe: 'European nationals', custom: '' } as const;

/** The card photo for a role: the recruiter's photo only (role cover images are not used). */
export const rolePhoto = (j: Job) => j.recruiter?.photo || '';

export function workModeText(j: Job) {
  if (j.workMode === 'Remote') return j.remoteScope === 'country' && j.country ? `Remote · ${j.country} only` : 'Remote';
  if (j.workMode === 'Hybrid') return `Hybrid${j.hybridDays ? ` · ${j.hybridDays} office days/week` : ''}`;
  return j.workMode || '';
}
export function visaText(j: Job) {
  if (j.workVisaRequired === undefined) return j.visaSponsorship ? 'Visa sponsorship available' : '';
  if (j.workVisaRequired) return 'Valid work visa / right to work required';
  const a = j.authorizedNationalities;
  const who = a?.mode === 'custom' ? (a.custom || []).join(', ') || 'selected countries' : NAT[a?.mode || 'any'];
  return `No visa required · open to ${who}`;
}
export function fitText(j: Job) {
  const s = j.match?.matchedSkills?.slice(0, 3) || [];
  const score = typeof j.match?.score === 'number' ? `${j.match.score}%` : '';
  return s.length ? `Matches your ${s.join(', ')}${score ? ` · ${score}` : ''}` : score ? `${score} fit` : '';
}
export function salaryText(j: Job) {
  if (j.salaryHidden) return '';
  if (j.salaryRange) return `${j.salaryRange.currency} ${j.salaryRange.min.toLocaleString('en-US')}–${j.salaryRange.max.toLocaleString('en-US')}`;
  return j.salary || '';
}

/** Page 1 — branded background (no role photo) with the recruiter's photo as a small ID-style stamp in the
 *  top-right corner (founder, 2026-11-22), and the role summary. */
export function RoleSummaryPage({ job: j, photo = rolePhoto(j), onRecruiter }: { job: Job; photo?: string; onRecruiter?: () => void }) {
  const fit = fitText(j);
  const contract = [j.type, j.contractDuration].filter(Boolean).join(' · ');
  const salary = salaryText(j);
  return <>
    {/* Every role's front uses IBM blue (#0f62fe), founder 2026-11-22. */}
    <div className="nm-photo rp-brand" />
    {/* Scrollable like the job description page (founder, 2026-11-22); mark + ID stamp sit in the top row, never over text. */}
    <div className="nm-card-info rp-summary"><div className="rp-summary-inner">
      <div className="rp-top-row">
        <span className="rp-brand-mark" aria-hidden="true">{(j.company || '?').slice(0, 1).toUpperCase()}</span>
        {photo && <figure className="rp-stamp" title={j.recruiter?.name ? `Recruiter: ${j.recruiter.name}` : 'Recruiter'}>
          <img src={asset(photo)} alt={j.recruiter?.name ? `Recruiter ${j.recruiter.name}` : 'Recruiter'} />
          {j.recruiter?.name && <figcaption>{j.recruiter.name.split(' ')[0]}</figcaption>}
        </figure>}
      </div>
      <h3>{j.title}</h3>
      <p className="nm-company">{j.company}{j.experienceLevel ? ` · ${j.experienceLevel}` : ''}</p>
      {j.recruiter?.name && (onRecruiter
        ? <button type="button" className="rp-recruiter" onPointerDownCapture={(e) => e.stopPropagation()} onClick={onRecruiter}>Hiring: <b>{j.recruiter.name}</b>{j.recruiter.title ? ` · ${j.recruiter.title}` : ''} <span>See recruiter profile <ChevronRight size={12} /></span></button>
        : <p className="nm-hiring">Hiring: {j.recruiter.name}{j.recruiter.title ? ` · ${j.recruiter.title}` : ''}</p>)}
      <div className="nm-chips">
        {j.location && <span className="nm-chip"><MapPin size={11} /> {j.location}{showsCommute(j) ? ` · ${j.distanceKm} km away` : ''}</span>}
        {contract && <span className="nm-chip"><Briefcase size={11} /> {contract}</span>}
        {j.startDate && <span className="nm-chip"><CalendarClock size={11} /> Start: {j.startDate}</span>}
        {salary ? <span className="nm-chip nm-salary-chip"><Wallet size={11} /> {salary}</span>
          : j.salaryHidden ? <span className="nm-chip"><Wallet size={11} /> Salary after a match <SalaryBadge status={j.match?.salaryStatus} /></span> : null}
        {workModeText(j) && <span className="nm-chip">{workModeText(j)}</span>}
        {visaText(j) && <span className="nm-chip"><ShieldCheck size={11} /> {visaText(j)}</span>}
        {j.requiredLanguages?.length ? <span className="nm-chip"><Languages size={11} /> {j.requiredLanguages.join(', ')}</span> : null}
        {fit && <span className="nm-chip">{fit}</span>}
      </div>
    </div></div>
  </>;
}

function Chips({ items, tone }: { items: string[]; tone?: 'have' | 'gap' }) {
  return <div className="rp-chips">{items.map((s) => <span key={s} className={tone ? `rp-chip ${tone}` : 'rp-chip'}>{tone === 'have' && <Check size={11} />}{s}</span>)}</div>;
}

/** Pages 2–3 as a scrollable white panel. */
export function RoleDetailPage({ job: j, page, company }: { job: Job; page: number; company?: CompanyProfile & { name?: string; logo?: string } }) {
  if (page === 1) {
    const must = j.requiredSkillsDetail?.map((s) => s.name) || j.requiredSkills || [];
    const have = new Set((j.match?.matchedSkills || []).map((s) => s.toLowerCase()));
    const details: [string, string | number | undefined][] = [
      ['Seniority', j.seniority || j.experienceLevel], ['Department', j.department], ['Openings', j.openings],
      ['Start date', j.startDate], ['Contract', [j.type, j.contractDuration].filter(Boolean).join(' · ')], ['Work mode', workModeText(j)],
    ];
    return <div className="rp-panel">
      <h4><Briefcase size={15} /> Job description</h4>
      {j.fullDescription || j.description ? <RoleDetailsText text={j.fullDescription || j.description} /> : <p className="rp-empty">No description added yet.</p>}
      <h5>Role details</h5>
      {details.filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => <p className="rp-line" key={k}><b>{k}</b> {v}</p>)}
      {j.responsibilities?.length ? <ul className="rp-list">{j.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul> : null}
      <h5>Skills required</h5>{must.length ? <Chips items={must} /> : <p className="rp-empty">Not listed.</p>}
      <h5>Nice to have</h5>{j.niceToHaves?.length ? <Chips items={j.niceToHaves} /> : <p className="rp-empty">Not listed.</p>}
      {j.match && (j.match.matchedSkills?.length || j.match.missingSkills?.length) ? <div className="rp-fit">
        <h5><Sparkles size={13} /> Your fit{typeof j.match.score === 'number' ? ` · ${j.match.score}%` : ''}</h5>
        {j.match.matchedSkills?.length ? <><small>You have</small><Chips items={j.match.matchedSkills} tone="have" /></> : null}
        {j.match.missingSkills?.length ? <><small>To learn</small><Chips items={j.match.missingSkills.filter((s) => !have.has(s.toLowerCase()))} tone="gap" /></> : null}
      </div> : null}
    </div>;
  }
  const c = { ...(j.companyProfile || {}), ...(company || {}) };
  const logo = company?.logo || j.companyLogo;
  const benefits = j.benefits?.length ? j.benefits : c.benefits || [];
  const row = (label: string, value?: string | number) => <p className="rp-line"><b>{label}</b> {value ? value : <span className="rp-empty">Not added yet</span>}</p>;
  return <div className="rp-panel">
    <h4><Building2 size={15} /> Company</h4>
    <div className="rp-company">
      <CompanyLogo src={logo && /^(https?:|data:|\/)/.test(logo) ? asset(logo) : ''} name={company?.name || j.company || '?'} />
      <div><strong>{company?.name || j.company}</strong>{c.website ? <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer"><Globe size={12} /> {c.website.replace(/^https?:\/\//, '')}</a> : null}</div>
    </div>
    <h5>About</h5>{c.about ? <p className="rp-text">{c.about}</p> : <p className="rp-empty">Not added yet.</p>}
    {row('Industry', c.industry)}
    {row('Company size', c.companySize)}
    {row('Headquarters', c.headquarters)}
    {row('Founded', c.foundedYear)}
    {c.officeLocations?.length ? <><h5>Offices</h5><Chips items={c.officeLocations} /></> : null}
    {c.techStack?.length ? <><h5>Tech stack</h5><Chips items={c.techStack} /></> : null}
    <h5>Benefits</h5>{benefits.length ? <Chips items={benefits} /> : <p className="rp-empty">Not added yet.</p>}
    {(j.bonus || j.equity || j.relocationSupport || j.salaryNegotiable) && <div className="rp-extras">
      {j.bonus && <p className="rp-line"><b>Bonus</b> {j.bonus}</p>}
      {j.equity && <p className="rp-line"><b>Equity</b> {j.equity}</p>}
      {j.salaryNegotiable && <p className="rp-line"><Check size={13} /> Salary negotiable</p>}
      {j.relocationSupport && <p className="rp-line"><Check size={13} /> Relocation support</p>}
    </div>}
  </div>;
}

/** Logo, or the company initial when there is none or it fails to load. */
function CompanyLogo({ src, name }: { src: string; name: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <span className="rp-logo">{name.slice(0, 1).toUpperCase()}</span>;
}

/** Just for tests / previews: the icon used for a missing skill. */
export const GapIcon = X;
