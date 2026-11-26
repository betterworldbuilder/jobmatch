// Public addresses (founder, 2026-11-25), no sign-in needed:
//  - jobsmatchnow.com/firstname.lastname: a candidate's public profile (only what they chose to make public);
//  - jobsmatchnow.com/role/<category>/<code>-<id>: a role, shown with the existing public role card.
import { useEffect, useState } from 'react';
import { ArrowRight, Briefcase, FileDown, Languages, Linkedin, MapPin } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { ClaimView } from '../../types';
import { PublicJobCardPage, PublicShell } from '../groups/Groups';

type PublicProfile = {
  slug: string; name: string; title?: string; photo?: string; yearsExperience?: number; city?: string; country?: string;
  about?: string; skills: string[]; languages: string[]; workModes?: string[]; availability?: string; linkedin?: string; demo?: boolean; hasResume?: boolean;
  /** Blurred teaser for visitors who are not signed-in recruiters (2026-11-26). */
  locked?: boolean; moreSkills?: number;
};

const asset = (p?: string) => (!p ? '' : /^(https?:|data:)/.test(p) ? p : `${apiBase}${p}`);

export function PublicProfilePage({ slug }: { slug: string }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');
  const [resumeAsk, setResumeAsk] = useState(false);
  useEffect(() => {
    // ?v= from a recruiter email: lets the candidate see "Application viewed" (2026-11-26).
    const v = new URLSearchParams(window.location.search).get('v');
    // credentials: a signed-in recruiter gets the full profile; visitors get the blurred teaser (2026-11-26).
    fetch(`${apiBase}/api/public/profile/${encodeURIComponent(slug)}${v && /^[0-9a-f-]{36}$/.test(v) ? `?v=${v}` : ''}`, { credentials: 'include' }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'This profile is not public');
      setP(body.profile); document.title = `${body.profile.name || body.profile.title || 'Candidate'} · JobsMatchNow`;
    }).catch((e) => setError(e instanceof Error ? e.message : 'This profile is not public'));
  }, [slug]);
  const where = p ? [p.city, p.country].filter(Boolean).join(', ') : '';
  return <PublicShell>
    {!p ? <section className="jf-public-card"><h1>{error ? 'Profile not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/app/">Open JobsMatchNow</a></p>}</section>
      : p.locked ? <section className="pp-card pp-locked">
        {/* Blurred until the visitor registers as a recruiter (founder, 2026-11-26). Hidden parts are never sent. */}
        <div className="pp-head">
          <span className="pp-photo pp-blur-photo" aria-hidden="true" />
          <div>
            <h1><span className="pp-blur-text" aria-label="Name hidden until you register">Candidate Name</span></h1>
            {p.title && <p className="pp-title">{p.title}{p.yearsExperience ? ` · ${p.yearsExperience} yrs` : ''}</p>}
            <p className="pp-meta">{where && <span><MapPin size={13} /> {where}</span>}{p.workModes?.length ? <span><Briefcase size={13} /> {p.workModes.join(' · ')}</span> : null}{p.availability && <span>Available {p.availability}</span>}</p>
          </div>
        </div>
        <div className="pp-locked-body">
          <div className="pp-blur-block" aria-hidden="true">
            <h2>About</h2><p>Experienced professional with a strong track record delivering products and platforms for fast-growing teams across Asia and Europe, ready for the next challenge.</p>
            <h2>Skills</h2><div className="pp-chips">{[...p.skills, ...Array.from({ length: Math.min(8, p.moreSkills || 4) }, (_, i) => `Skill ${i + 1}`)].map((s, i) => <span key={`${s}-${i}`}>{s}</span>)}</div>
            <h2>Languages</h2><div className="pp-chips"><span>English</span><span>Vietnamese</span></div>
            {p.hasResume && <><h2>Resume</h2><p>Resume.pdf · 2 pages</p></>}
          </div>
          <div className="pp-gate">
            <strong>Register free to see this candidate</strong>
            <p>Name, photo, full profile{p.hasResume ? ', resume' : ''} and skills{p.skills.length ? ` (${p.skills.join(', ')}${p.moreSkills ? ` and ${p.moreSkills} more` : ''})` : ''}. Create a free recruiter account in 1 minute, then like back to chat.</p>
            <div className="pp-actions">
              <a className="primary-button" href={`/app/?auth=register&next=${encodeURIComponent(`/${p.slug}`)}`}>Register free as a recruiter <ArrowRight size={15} /></a>
              <a className="secondary-button" href={`/app/?auth=login&next=${encodeURIComponent(`/${p.slug}`)}`}>I already have an account</a>
            </div>
          </div>
        </div>
      </section>
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
          <a className="primary-button" href="/app/?auth=register">Connect on JobsMatchNow <ArrowRight size={15} /></a>
          {p.hasResume && <button type="button" className="secondary-button" onClick={() => setResumeAsk(true)}><FileDown size={15} /> Download my resume</button>}
          {p.linkedin && <a className="secondary-button" href={p.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin size={15} /> LinkedIn</a>}
        </div>
        {/* Resume (founder, 2026-11-26): recruiters register (free) to view and download it. */}
        {resumeAsk && <div className="pp-resume-gate" role="dialog" aria-label="Download the resume">
          <p><b>Register to view {p.name.split(' ')[0]}&rsquo;s resume.</b> Create a free recruiter account on JobsMatchNow (1 minute). Like {p.name.split(' ')[0]} back: when you both say yes, the full resume and contact details unlock and you can chat right away.</p>
          <div className="pp-actions">
            <a className="primary-button" href="/app/?auth=register">Register free as a recruiter <ArrowRight size={15} /></a>
            <a className="secondary-button" href="/app/?auth=login">I already have an account</a>
          </div>
        </div>}
        <p className="pp-note">Recruiter? Join JobsMatchNow for free to see full profiles and resumes, like back and chat with candidates.</p>
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
  // Quick sign-up (founder, 2026-11-26): the recruiter's name + email we already have pre-fill the recruiter form; after
  // sign-up the role is claimed into their account and they land in Surf with these candidates.
  const goSignUp = (auth: 'register' | 'login') => {
    try { if (v?.prefill) sessionStorage.setItem('jm-prefill', JSON.stringify({ role: 'employer', name: v.prefill.name, email: v.prefill.email })); } catch { /* private mode */ }
    window.location.href = `/app/?claim=${encodeURIComponent(`${jobId}.${sig}`)}&auth=${auth}`;
  };
  const claim = async () => {
    setBusy(true);
    try { const r = await api.postClaim(jobId, sig); setDone(r.already ? 'This role is already in your account.' : 'Done: the role and its candidates are now in your account.'); }
    catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/sign in/i.test(msg)) goSignUp('login'); else setError(msg || 'Could not claim this role');
    } finally { setBusy(false); }
  };
  return <PublicShell>
    {!v ? <section className="jf-public-card"><h1>{error ? 'Link not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/app/">Open JobsMatchNow</a></p>}</section>
      : <section className="cl-card">
        {v.preview && <p className="cl-preview">Preview: this is what the recruiter sees from their email link. Your visits are not counted.</p>}
        <span className="overline">Your role on JobsMatchNow</span>
        <h1>{v.job.title}</h1>
        <p className="cl-sub">{[v.job.company, v.job.location, v.job.workMode, v.job.type].filter(Boolean).join(' · ')} · <a href={v.job.path}>See the role page</a></p>
        <h2>{v.candidates.length + v.hidden} {v.candidates.length + v.hidden === 1 ? 'candidate has' : 'candidates have'} applied · recommended candidates for your role</h2>
        {/* Carousel of recommended candidates (founder, 2026-11-26): applicants first; full profiles after sign-up. */}
        {(v.recommended?.length ?? 0) > 0 ? <div className="cl-carousel" role="list" aria-label="Recommended candidates">
          {v.recommended!.map((c) => <article key={c.id} className="cl-cand" role="listitem">
            <div className="cl-cand-photo">{c.photo ? <img src={asset(c.photo)} alt="" /> : <span>{c.firstName.slice(0, 1)}</span>}
              {c.match !== null && <em>{c.match}%</em>}{c.applied && <b>Applied</b>}</div>
            <strong>{c.firstName}</strong>
            <small>{[c.title, c.yearsExperience ? `${c.yearsExperience} yrs` : ''].filter(Boolean).join(' · ')}</small>
            {(c.city || c.country) && <small>{[c.city, c.country].filter(Boolean).join(', ')}</small>}
            {c.skills.length > 0 && <span className="cl-cand-skills">{c.skills.map((s) => <i key={s}>{s}</i>)}</span>}
          </article>)}
        </div> : <p className="cl-empty">No candidates yet. New applicants appear here.</p>}
        {done ? <p className="cl-done">{done} <a href="/app/">Open My Jobs list</a></p>
          : v.claimed && !v.claimedByYou ? <p className="cl-note">This role has already been claimed by a recruiter.</p>
            : <div className="pp-actions">
              <button type="button" className="primary-button" onClick={() => goSignUp('register')} disabled={busy || v.preview}>View profiles <ArrowRight size={15} /></button>
              <button type="button" className="secondary-button" onClick={() => void claim()} disabled={busy || v.preview}>I already have an account</button>
            </div>}
        <p className="pp-note">Free recruiter account in 1 minute (your name and email are filled in). Your role is added to it with these candidates: like back to open a chat.</p>
      </section>}
  </PublicShell>;
}

/** /role/<category>/<code>-<id>: resolve the address, then show the role with the public role card. */
export function RoleLinkPage({ slug }: { slug: string }) {
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');
  // ?claim=<jobId>.<sig> from the recruiter's email (founder, 2026-11-26): recruiter view + "View resume" → quick sign-up.
  const [claim] = useState(() => { const m = (new URLSearchParams(window.location.search).get('claim') || '').match(/^(.+)\.([0-9a-f]{16,})$/); return m ? { jobId: m[1], sig: m[2] } : null; });
  const [cv, setCv] = useState<ClaimView | null>(null);
  useEffect(() => { if (claim) api.getClaim(claim.jobId, claim.sig).then(setCv).catch(() => undefined); }, [claim]);
  useEffect(() => {
    fetch(`${apiBase}/api/public/role/${encodeURIComponent(slug)}`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'This role is not available');
      setJobId(body.jobId);
    }).catch((e) => setError(e instanceof Error ? e.message : 'This role is not available'));
  }, [slug]);
  if (jobId && claim && claim.jobId === jobId) {
    const n = cv ? cv.candidates.length + cv.hidden : 0;
    const viewResume = () => {
      try { if (cv?.prefill) sessionStorage.setItem('jm-prefill', JSON.stringify({ role: 'employer', name: cv.prefill.name, email: cv.prefill.email })); } catch { /* private mode */ }
      window.location.href = `/app/?claim=${encodeURIComponent(`${claim.jobId}.${claim.sig}`)}&auth=register`;
    };
    return <PublicJobCardPage jobId={jobId} recruiter={{ onView: viewResume, note: `${n ? `${n} ${n === 1 ? 'candidate has' : 'candidates have'} applied to your role.` : 'Candidates are applying to your role.'} Create your free recruiter account in 1 minute (your name and email are filled in) to view their resumes and connect.` }} />;
  }
  if (jobId) return <PublicJobCardPage jobId={jobId} />;
  return <PublicShell><section className="jf-public-card"><h1>{error ? 'Role not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/app/">See open roles on JobsMatchNow</a></p>}</section></PublicShell>;
}
