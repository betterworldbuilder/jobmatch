// Public addresses (founder, 2026-11-25), no sign-in needed:
//  - jobsmatchnow.com/firstname.lastname: a candidate's public profile (only what they chose to make public);
//  - jobsmatchnow.com/role/<category>/<code>-<id>: a role, shown with the existing public role card.
import { useEffect, useState } from 'react';
import { ArrowRight, Briefcase, Languages, Linkedin, MapPin } from 'lucide-react';
import { apiBase } from '../../api';
import { PublicJobCardPage, PublicShell } from '../groups/Groups';

type PublicProfile = {
  slug: string; name: string; title?: string; photo?: string; yearsExperience?: number; city?: string; country?: string;
  about?: string; skills: string[]; languages: string[]; workModes?: string[]; availability?: string; linkedin?: string; demo?: boolean;
};

const asset = (p?: string) => (!p ? '' : /^(https?:|data:)/.test(p) ? p : `${apiBase}${p}`);

export function PublicProfilePage({ slug }: { slug: string }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`${apiBase}/api/public/profile/${encodeURIComponent(slug)}`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'This profile is not public');
      setP(body.profile); document.title = `${body.profile.name} · JobsMatchNow`;
    }).catch((e) => setError(e instanceof Error ? e.message : 'This profile is not public'));
  }, [slug]);
  const where = p ? [p.city, p.country].filter(Boolean).join(', ') : '';
  return <PublicShell>
    {!p ? <section className="jf-public-card"><h1>{error ? 'Profile not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/app/">Open JobsMatchNow</a></p>}</section>
      : <section className="pp-card">
        <div className="pp-head">
          {p.photo ? <img className="pp-photo" src={asset(p.photo)} alt="" /> : <span className="pp-photo pp-initials">{p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>}
          <div>
            <h1>{p.name}</h1>
            {p.title && <p className="pp-title">{p.title}{p.yearsExperience ? ` · ${p.yearsExperience} yrs` : ''}</p>}
            <p className="pp-meta">{where && <span><MapPin size={13} /> {where}</span>}{p.workModes?.length ? <span><Briefcase size={13} /> {p.workModes.join(' · ')}</span> : null}{p.availability && <span>Available {p.availability}</span>}</p>
            <p className="pp-url">jobsmatchnow.com/{p.slug}</p>
          </div>
        </div>
        {p.about && <><h2>About</h2><p className="pp-about">{p.about}</p></>}
        {p.skills.length > 0 && <><h2>Skills</h2><div className="pp-chips">{p.skills.map((s) => <span key={s}>{s}</span>)}</div></>}
        {p.languages.length > 0 && <><h2><Languages size={14} /> Languages</h2><div className="pp-chips">{p.languages.map((s) => <span key={s}>{s}</span>)}</div></>}
        <div className="pp-actions">
          <a className="primary-button" href="/app/">Connect on JobsMatchNow <ArrowRight size={15} /></a>
          {p.linkedin && <a className="secondary-button" href={p.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin size={15} /> LinkedIn</a>}
        </div>
        <p className="pp-note">Recruiter? Join JobsMatchNow for free to see full profiles, like back and chat with candidates.</p>
      </section>}
  </PublicShell>;
}

/** /role/<category>/<code>-<id>: resolve the address, then show the role with the public role card. */
export function RoleLinkPage({ slug }: { slug: string }) {
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`${apiBase}/api/public/role/${encodeURIComponent(slug)}`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'This role is not available');
      setJobId(body.jobId);
    }).catch((e) => setError(e instanceof Error ? e.message : 'This role is not available'));
  }, [slug]);
  if (jobId) return <PublicJobCardPage jobId={jobId} />;
  return <PublicShell><section className="jf-public-card"><h1>{error ? 'Role not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/app/">See open roles on JobsMatchNow</a></p>}</section></PublicShell>;
}
