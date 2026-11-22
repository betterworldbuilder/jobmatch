// A role as 4 pages (founder, 2026-11-22), used in the job seeker's swipe card and in the recruiter's
// "How candidates see this role" page:
//   1 Role summary — role, contract type + duration, work mode, location, work visa & nationality, fit
//   2 Job description — the full JD, must-have, nice-to-have, languages, then the fit details
//   3 Salary — range (or "revealed after a match"), bonus, equity, benefits
//   4 Company — the recruiter's public company profile (empty fields say "not added yet")
import { useState } from 'react';
import { Briefcase, Building2, Check, Clock3, Globe, Languages, MapPin, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';
import { apiBase } from '../../api';
import type { CompanyProfile, Job } from '../../types';
import { RoleDetailsText } from './JobCards';
import { SalaryBadge } from '../discover/DeckParts';
import { showsCommute } from '../discover/deckLogic';

export const ROLE_PAGES = ['Role summary', 'Job description', 'Salary', 'Company'];

const asset = (v: string) => (/^(https?:|data:|blob:)/i.test(v) ? v : `${apiBase}${v.startsWith('/') ? '' : '/'}${v}`);
const NAT = { any: 'any nationality', us: 'US nationals', europe: 'European nationals', custom: '' } as const;

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

/** Page 1 — photo background with the role summary (the swipe card's front). */
export function RoleSummaryPage({ job: j, photo, extra }: { job: Job; photo?: string; extra?: React.ReactNode }) {
  const fit = fitText(j);
  const contract = [j.type, j.contractDuration].filter(Boolean).join(' · ');
  return <>
    <div className="nm-photo" style={photo ? { backgroundImage: `url(${asset(photo)})` } : undefined}>
      {!photo && <span className="nm-initials" aria-hidden="true">{(j.company || '?').slice(0, 2).toUpperCase()}</span>}
    </div>
    <div className="nm-card-info rp-summary">
      {j.recruiter?.name && !j.coverImage && <p className="nm-hiring">Hiring: {j.recruiter.name}{j.recruiter.title ? ` · ${j.recruiter.title}` : ''}</p>}
      <h3>{j.title}</h3>
      <p className="nm-company">{j.company}{j.experienceLevel ? ` · ${j.experienceLevel}` : ''}</p>
      <div className="nm-chips">
        {contract && <span className="nm-chip"><Briefcase size={11} /> {contract}</span>}
        {workModeText(j) && <span className="nm-chip">{workModeText(j)}</span>}
        {j.location && <span className="nm-chip"><MapPin size={11} /> {j.location}{showsCommute(j) ? ` · ${j.distanceKm} km away` : ''}</span>}
        {visaText(j) && <span className="nm-chip"><ShieldCheck size={11} /> {visaText(j)}</span>}
        {extra}
        {fit && <span className="nm-chip">{fit}</span>}
      </div>
    </div>
  </>;
}

function Chips({ items, tone }: { items: string[]; tone?: 'have' | 'gap' }) {
  return <div className="rp-chips">{items.map((s) => <span key={s} className={tone ? `rp-chip ${tone}` : 'rp-chip'}>{tone === 'have' && <Check size={11} />}{s}</span>)}</div>;
}

/** Pages 2–4 as a scrollable white panel. */
export function RoleDetailPage({ job: j, page, company }: { job: Job; page: number; company?: CompanyProfile & { name?: string; logo?: string } }) {
  if (page === 1) {
    const must = j.requiredSkillsDetail?.map((s) => s.name) || j.requiredSkills || [];
    const have = new Set((j.match?.matchedSkills || []).map((s) => s.toLowerCase()));
    return <div className="rp-panel">
      <h4><Briefcase size={15} /> Job description</h4>
      {j.fullDescription || j.description ? <RoleDetailsText text={j.fullDescription || j.description} /> : <p className="rp-empty">No description added yet.</p>}
      <h5>Must have</h5>{must.length ? <Chips items={must} /> : <p className="rp-empty">Not listed.</p>}
      <h5>Nice to have</h5>{j.niceToHaves?.length ? <Chips items={j.niceToHaves} /> : <p className="rp-empty">Not listed.</p>}
      <h5><Languages size={13} /> Languages</h5>{j.requiredLanguages?.length ? <Chips items={j.requiredLanguages} /> : <p className="rp-empty">Not listed.</p>}
      {j.match && (j.match.matchedSkills?.length || j.match.missingSkills?.length) ? <div className="rp-fit">
        <h5><Sparkles size={13} /> Your fit{typeof j.match.score === 'number' ? ` · ${j.match.score}%` : ''}</h5>
        {j.match.matchedSkills?.length ? <><small>You have</small><Chips items={j.match.matchedSkills} tone="have" /></> : null}
        {j.match.missingSkills?.length ? <><small>To learn</small><Chips items={j.match.missingSkills.filter((s) => !have.has(s.toLowerCase()))} tone="gap" /></> : null}
      </div> : null}
    </div>;
  }
  if (page === 2) {
    const r = j.salaryRange;
    return <div className="rp-panel">
      <h4><Wallet size={15} /> Salary</h4>
      {j.salaryHidden
        ? <div className="rp-big rp-locked">The exact range is revealed after a mutual match. <SalaryBadge status={j.match?.salaryStatus} /></div>
        : r ? <p className="rp-big">{r.currency} {r.min.toLocaleString('en-US')}–{r.max.toLocaleString('en-US')}</p>
          : j.salary ? <p className="rp-big">{j.salary}</p> : <p className="rp-empty">Not added yet.</p>}
      {j.salaryNegotiable && <p className="rp-line"><Check size={13} /> Negotiable</p>}
      {j.bonus && <p className="rp-line"><b>Bonus</b> {j.bonus}</p>}
      {j.equity && <p className="rp-line"><b>Equity</b> {j.equity}</p>}
      {(j.workingHours || j.probation) && <p className="rp-line"><Clock3 size={13} /> {[j.workingHours, j.probation ? `Probation ${j.probation}` : ''].filter(Boolean).join(' · ')}</p>}
      <h5>Benefits</h5>{j.benefits?.length ? <Chips items={j.benefits} /> : <p className="rp-empty">Not added yet.</p>}
      {j.relocationSupport && <p className="rp-line"><Check size={13} /> Relocation support</p>}
    </div>;
  }
  const c = { ...(j.companyProfile || {}), ...(company || {}) };
  const logo = company?.logo || j.companyLogo;
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
  </div>;
}

/** Logo, or the company initial when there is none or it fails to load. */
function CompanyLogo({ src, name }: { src: string; name: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <span className="rp-logo">{name.slice(0, 1).toUpperCase()}</span>;
}

/** Just for tests / previews: the icon used for a missing skill. */
export const GapIcon = X;
