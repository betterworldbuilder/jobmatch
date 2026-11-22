// "How candidates see this role" (founder, 2026-11-22): the recruiter's preview of a role exactly as job seekers
// swipe it — the same 4 pages (Role summary · Job description · Salary · Company), with page buttons below
// (only on this preview page, not in the swipe view), plus Edit and Back.
import { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Building2, FileText, Pencil, Wallet } from 'lucide-react';
import type { Job, Person } from '../../types';
import { SwipePager } from '../swipe/SwipePager';
import { RoleDetailPage, ROLE_PAGES, RoleSummaryPage } from './RolePages';

const ICONS = [Briefcase, FileText, Wallet, Building2];
const COLORS = ['#ff7a45', '#007AFF', '#34C759', '#AF52DE'];

export function RolePreview({ job, recruiter, onClose, onEdit }: { job: Job; recruiter: Person; onClose: () => void; onEdit?: () => void }) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setPage((p) => Math.min(ROLE_PAGES.length - 1, p + 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // The recruiter's own company profile fills the Company page (same data candidates get).
  const company = { name: recruiter.company || job.company, logo: recruiter.companyLogo, about: recruiter.about, industry: recruiter.industry, companySize: recruiter.companySize, headquarters: recruiter.headquarters, website: recruiter.website, foundedYear: recruiter.foundedYear, officeLocations: recruiter.officeLocations, techStack: recruiter.techStack };
  // Candidates don't see the recruiter's own fit; preview shows the role as published.
  const shown: Job = { ...job, match: undefined as unknown as Job['match'], recruiter: job.recruiter || { name: recruiter.name, title: recruiter.title, photo: recruiter.photo, company: recruiter.company } };
  const photo = job.coverImage || recruiter.photo || '';
  return <div className="rpv-page" role="dialog" aria-label="How candidates see this role">
    <header className="rpv-head">
      <div><span className="overline">Your published role</span><h1>How Candidates See This Role</h1><p>The same pages job seekers flip through when they swipe on {job.title}.</p></div>
      <div className="rpv-actions">
        <button type="button" className="secondary-button small" onClick={onClose}><ArrowLeft size={14} /> Back</button>
        {onEdit && <button type="button" className="primary-button small" onClick={onEdit}><Pencil size={14} /> Edit this role</button>}
      </div>
    </header>
    <div className="rpv-stage">
      <article className={page > 0 ? 'nm-card sp-card on-detail rpv-card' : 'nm-card sp-card rpv-card'}>
        {page === 0 ? <RoleSummaryPage job={shown} photo={photo} /> : <div className="sp-page"><RoleDetailPage job={shown} page={page} company={company} /></div>}
        <SwipePager pages={ROLE_PAGES} page={page} onPage={setPage} tapZones={page === 0} />
      </article>
      <nav className="tcards-nav rpv-nav" aria-label="Role pages">
        {ROLE_PAGES.map((label, i) => { const Icon = ICONS[i]; return <button key={label} type="button" className={i === page ? 'on' : ''} style={{ ['--nav-c' as string]: COLORS[i] }} onClick={() => setPage(i)} aria-current={i === page ? 'page' : undefined}><Icon size={16} /><span>{label}</span><i /></button>; })}
      </nav>
    </div>
  </div>;
}
