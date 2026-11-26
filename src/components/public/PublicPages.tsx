// Public addresses (founder, 2026-11-25), no sign-in needed:
//  - jobsmatchnow.com/firstname.lastname: a candidate's public profile (only what they chose to make public);
//  - jobsmatchnow.com/role/<category>/<code>-<id>: a role, shown with the existing public role card.
import { useEffect, useState } from 'react';
import { ArrowRight, Briefcase, Languages, Linkedin, MapPin } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { ClaimView } from '../../types';
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

/** /claim/<jobId>/<sig> (Stage 1, 2026-11-26): the recruiter of an imported role sees who applied and claims it free. */
export function ClaimPage({ jobId, sig }: { jobId: string; sig: string }) {
  const [v, setV] = useState<ClaimView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  useEffect(() => {
    api.getClaim(jobId, sig).then((r) => { setV(r); document.title = `Candidates for ${r.job.title} · JobsMatchNow`; })
      .catch((e) => setError(e instanceof Error ? e.message : 'This link is not valid'));
  }, [jobId, sig]);
  const goSignUp = (auth: 'register' | 'login') => { window.location.href = `/app/?claim=${encodeURIComponent(`${jobId}.${sig}`)}&auth=${auth}`; };
  const claim = async () => {
    setBusy(true);
    try { const r = await api.postClaim(jobId, sig); setDone(r.already ? 'This role is already in your account.' : 'Done: the role and its candidates are now in your account.'); }
    catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/sign in/i.test(msg)) goSignUp('register'); else setError(msg || 'Could not claim this role');
    } finally { setBusy(false); }
  };
  return <PublicShell>
    {!v ? <section className="jf-public-card"><h1>{error ? 'Link not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/app/">Open JobsMatchNow</a></p>}</section>
      : <section className="cl-card">
        {v.preview && <p className="cl-preview">Preview: this is what the recruiter sees from their email link. Your visits are not counted.</p>}
        <span className="overline">Your role on JobsMatchNow</span>
        <h1>{v.job.title}</h1>
        <p className="cl-sub">{[v.job.company, v.job.location, v.job.workMode, v.job.type].filter(Boolean).join(' · ')} · <a href={v.job.path}>See the role page</a></p>
        <h2>{v.candidates.length + v.hidden} {v.candidates.length + v.hidden === 1 ? 'candidate has' : 'candidates have'} applied</h2>
        {v.candidates.length ? <ul className="cl-list">{v.candidates.map((c) => <li key={c.slug}>
          <a href={`/${c.slug}`} target="_blank" rel="noopener noreferrer">
            {c.photo ? <img src={asset(c.photo)} alt="" /> : <span className="cl-initials">{c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>}
            <span><strong>{c.name}</strong><small>{[c.title, c.yearsExperience ? `${c.yearsExperience} yrs` : '', [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</small>
              {c.skills.length > 0 && <em>{c.skills.join(' · ')}</em>}</span>
          </a></li>)}</ul>
          : <p className="cl-empty">No public profiles yet. New applicants appear here.</p>}
        {v.hidden > 0 && <p className="cl-note">+ {v.hidden} with a private profile: claim the role to see them in your account.</p>}
        {done ? <p className="cl-done">{done} <a href="/app/">Open My Jobs list</a></p>
          : v.claimed && !v.claimedByYou ? <p className="cl-note">This role has already been claimed by a recruiter.</p>
            : <div className="pp-actions">
              <button type="button" className="primary-button" onClick={() => void claim()} disabled={busy || v.preview}>Claim this role and reply to candidates (free)</button>
              <button type="button" className="secondary-button" onClick={() => goSignUp('login')} disabled={v.preview}>I already have an account</button>
            </div>}
        <p className="pp-note">Claiming moves this role into your own free JobsMatchNow recruiter account: you see every applicant, like back to open a chat, and edit the role.</p>
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
