// Job groups (founder, 2026-11-25): public, shareable job lists at /app/{group} for LinkedIn posts and promotions.
// Hierarchy: type of role (group) › country › city › citizenship / visa. Visitors browse cards without an account;
// "View job" asks them to register free or sign in, then brings them back to that job (never applies by itself).
// Also here: one public job page (/app/job/{id}, LinkedIn's "external website" link), the full-details sheet for
// signed-in members, LinkedIn tools for recruiters, the editor's "Job groups" field and the admin group manager.
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Briefcase, Check, Copy, ExternalLink, Linkedin, MapPin, Plus, Share2, ShieldCheck, Wallet, X } from 'lucide-react';
import { api, groupsApi, JOBFINDER_LIKED_EVENT } from '../../api';
import type { Eligibility, GroupCard, GroupPageData, Job, JobGroup, Person } from '../../types';
import { savePendingJob } from '../../lib/pendingJob';
import { RoleDetailsText } from '../jobs/JobCards';
import { visaText, workModeText } from '../jobs/RolePages';
import { salaryRangeText } from '../../lib/salary';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'https://jobsmatchnow.com';
const fmtDate = (t?: number | null) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const LEVELS: Record<string, string> = { junior: 'Junior', mid: 'Mid-level', senior: 'Senior', lead: 'Lead', exec: 'Executive' };

export function eligibilityText(e: Eligibility) {
  switch (e.kind) {
    case 'any': return 'Open to any nationality';
    case 'us': return 'US nationals';
    case 'europe': return 'European nationals';
    case 'custom': return `Open to: ${(e.countries || []).join(', ')}`;
    case 'right-to-work': return 'Right to work required';
    default: return 'Nationality / visa not stated';
  }
}

async function copyText(text: string) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
const linkedInShare = (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

function PublicShell({ children }: { children: React.ReactNode }) {
  return <main className="jf-public grp-public">
    <header className="jf-public-head"><a href="/" className="jf-public-brand"><span className="brand-heart-mark" aria-hidden="true" /> JobsMatchNow</a><a className="grp-home" href="/">Home <ArrowRight size={13} /></a></header>
    {children}
    <footer className="jf-public-foot">© 2026 JobsMatchNow SARL · <a href="/legal.html">Legal notice</a></footer>
  </main>;
}

/** "See the full job details": register free or sign in, then come back to this job. */
export function SignInGate({ jobId, title, from, src, onClose }: { jobId: string; title: string; from?: string; src?: string; onClose: () => void }) {
  useEffect(() => { void groupsApi.event('grp_gate_shown', src); }, [src]);
  const go = (auth: 'register' | 'login') => {
    savePendingJob({ id: jobId, from, src });
    if (auth === 'register') void groupsApi.event('grp_register_started', src);
    const q = new URLSearchParams({ job: jobId, auth, ...(from ? { from } : {}), ...(src ? { src } : {}) });
    window.location.href = `/?${q}`;
  };
  return <div className="modal-scrim" onClick={onClose}>
    <div className="ai-setup grp-gate" role="dialog" aria-modal="true" aria-label="See the full job details" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      <h2>See the full job details</h2>
      <p>Create your free JobsMatchNow account or sign in to view <b>{title}</b>. We bring you straight back to this job; nothing is sent or applied without you.</p>
      <div className="grp-gate-actions">
        <button type="button" className="primary-button" onClick={() => go('register')}>Register free</button>
        <button type="button" className="secondary-button" onClick={() => go('login')}>Sign in</button>
      </div>
    </div>
  </div>;
}

function useSignedIn() {
  const [me, setMe] = useState<boolean | null>(null);
  useEffect(() => { api.me().then(() => setMe(true)).catch(() => setMe(false)); }, []);
  return me;
}
function openJob(id: string, from?: string, src?: string) {
  const q = new URLSearchParams({ job: id, ...(from ? { from } : {}), ...(src ? { src } : {}) });
  window.location.href = `/?${q}`;
}

function Card({ c, onView }: { c: GroupCard; onView: () => void }) {
  return <article className="grp-card">
    <div className="grp-card-top">
      <div><h3>{c.title}</h3><p className="grp-co">{c.company}</p></div>
      {c.jobFinder && <span className="grp-jf">Added by JobFinder</span>}
    </div>
    <div className="grp-chips">
      {(c.city || c.country || c.location) && <span><MapPin size={12} /> {[c.city, c.country].filter(Boolean).join(', ') || c.location}</span>}
      {c.workMode && <span>{c.workMode}</span>}
      {c.type && <span><Briefcase size={12} /> {c.type}</span>}
      {c.level && <span>{LEVELS[c.level] || c.level}</span>}
      {c.salary ? <span className="grp-salary"><Wallet size={12} /> {c.salary}</span> : c.salaryAfterMatch ? <span className="grp-muted"><Wallet size={12} /> Salary after a match</span> : <span className="grp-muted"><Wallet size={12} /> Salary not stated</span>}
      <span className={`grp-elig ${c.eligibility.kind}`}><ShieldCheck size={12} /> {eligibilityText(c.eligibility)}</span>
      {c.visaSponsorship && <span>Visa sponsorship</span>}
    </div>
    {c.jobFinder && <p className="grp-note">Employer status: {c.jobFinder.employerStatus === 'member' ? 'JobsMatchNow member' : 'Pending JobsMatchNow membership'}</p>}
    {c.preview && <p className="grp-preview">{c.preview}</p>}
    <div className="grp-card-foot">
      <small>{c.postedAt ? `Added ${fmtDate(c.postedAt)}` : ''}{c.groups.length ? ` · ${c.groups.map((g) => g.name).join(' · ')}` : ''}</small>
      <button type="button" className="primary-button small" onClick={onView}>View job <ArrowRight size={13} /></button>
    </div>
  </article>;
}

function ShareBar({ url, shareUrl }: { url: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="grp-share">
    <button type="button" className="secondary-button small" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600); } }}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy link</>}</button>
    <a className="secondary-button small" href={linkedInShare(shareUrl)} target="_blank" rel="noopener noreferrer"><Linkedin size={13} /> Share on LinkedIn</a>
    {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && <button type="button" className="secondary-button small" onClick={() => void navigator.share({ url }).catch(() => undefined)}><Share2 size={13} /> Share</button>}
  </div>;
}

const FILTER_KEYS = ['country', 'city', 'nationality', 'mode', 'level', 'salary', 'days', 'sort'] as const;
type Filters = Partial<Record<typeof FILTER_KEYS[number], string>>;

/** /app/{slug}: public group page. */
export function GroupPage({ slug: initialSlug }: { slug: string }) {
  const [slug, setSlug] = useState(initialSlug);
  // Read the address bar ONCE: the page rewrites it with the filters, and the LinkedIn source must survive that.
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const src = params.get('src') === 'linkedin' ? 'linkedin' : undefined;
  const [filters, setFilters] = useState<Filters>(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']).filter(([, v]) => v)));
  const [data, setData] = useState<GroupPageData | null>(null);
  const [all, setAll] = useState<JobGroup[]>([]);
  const [error, setError] = useState('');
  const [gate, setGate] = useState<GroupCard | null>(null);
  const signedIn = useSignedIn();
  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString(), [filters]);
  const first = useMemo(() => ({ done: false }), []);
  useEffect(() => { groupsApi.list().then((r) => setAll(r.groups)).catch(() => undefined); }, []);
  useEffect(() => {
    // Count the visit once (with its source); later filter changes are counted as filter use by the server.
    const q = [query, !first.done && src ? `src=${src}` : ''].filter(Boolean).join('&');
    first.done = true;
    groupsApi.page(slug, q).then((r) => {
      if (r.redirect) { setSlug(r.redirect); window.history.replaceState({}, '', `/app/${r.redirect}${window.location.search}`); return; }
      setData(r); setError('');
      document.title = `${r.group.name} jobs · JobsMatchNow`;
    }).catch((e) => setError(e instanceof Error ? e.message : 'This job group is not available'));
    // Keep ?src=linkedin in the address bar too, so a reload or a shared copy still counts as coming from LinkedIn.
    const shown = [query, src ? `src=${src}` : ''].filter(Boolean).join('&');
    window.history.replaceState({}, '', `/app/${slug}${shown ? `?${shown}` : ''}`);
  }, [slug, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Filters, v: string) => setFilters((f) => { const n = { ...f, [k]: v }; if (k === 'country') n.city = ''; return n; });
  const view = (c: GroupCard) => { if (signedIn) openJob(c.id, slug, src); else setGate(c); };
  const url = `${ORIGIN}/app/${slug}${query ? `?${query}` : ''}`;
  const shareUrl = `${ORIGIN}/app/${slug}?${new URLSearchParams({ ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}), src: 'linkedin' })}`;
  const byPlace = !filters.sort || filters.sort === 'location';
  let lastHead = '';
  const natOptions = useMemo(() => [...new Set([...(data?.facets.nationalities || []), 'Vietnam', 'United States', 'Singapore', 'India', 'France', 'Germany', 'United Kingdom', 'Japan', 'Australia', 'Canada'])].sort(), [data]);

  return <PublicShell>
    {error && !data ? <section className="jf-public-card"><h1>Job group not available</h1><p>{error}.</p>
      {all.length > 0 && <div className="grp-types">{all.map((g) => <a key={g.id} href={`/app/${g.slug}`}>{g.name} <b>{g.count}</b></a>)}</div>}</section>
      : !data ? <section className="jf-public-card"><p>Loading…</p></section>
        : <section className="grp-wrap">
          <nav className="grp-types" aria-label="Type of role">{all.map((g) => <a key={g.id} className={g.slug === slug ? 'on' : ''} href={`/app/${g.slug}${src ? `?src=${src}` : ''}`}>{g.name} <b>{g.count}</b></a>)}</nav>
          <header className="grp-head">
            <div><h1>{data.group.name} jobs</h1><p>{data.group.description}</p><p className="grp-count">{data.total} open {data.total === 1 ? 'role' : 'roles'}{data.group.examples.length ? ` · ${data.group.examples.join(', ')}` : ''}</p></div>
            <ShareBar url={url} shareUrl={shareUrl} />
          </header>
          {data.total > 0 && <>
            <div className="grp-drill" aria-label="Country">
              <button type="button" className={!filters.country ? 'on' : ''} onClick={() => set('country', '')}>All countries</button>
              {data.facets.countries.map((c) => <button type="button" key={c.name || '-'} className={filters.country === (c.name || '-') ? 'on' : ''} onClick={() => set('country', c.name || '-')}>{c.name || 'Location not stated'} <b>{c.n}</b></button>)}
            </div>
            {filters.country && data.facets.cities.length > 0 && <div className="grp-drill sub" aria-label="City">
              <button type="button" className={!filters.city ? 'on' : ''} onClick={() => set('city', '')}>All cities</button>
              {data.facets.cities.map((c) => <button type="button" key={c.name || '-'} className={filters.city === (c.name || '-') ? 'on' : ''} onClick={() => set('city', c.name || '-')}>{c.name || 'City not stated'} <b>{c.n}</b></button>)}
            </div>}
            <div className="grp-filters">
              <label>Citizenship<input list="grp-nat" placeholder="Any nationality" value={filters.nationality || ''} onChange={(e) => set('nationality', e.target.value)} /></label>
              <datalist id="grp-nat">{natOptions.map((n) => <option key={n} value={n} />)}</datalist>
              <label>Work mode<select value={filters.mode || ''} onChange={(e) => set('mode', e.target.value)}><option value="">Any</option>{data.facets.modes.map((m) => <option key={m}>{m}</option>)}</select></label>
              {data.facets.levels.length > 0 && <label>Level<select value={filters.level || ''} onChange={(e) => set('level', e.target.value)}><option value="">Any</option>{data.facets.levels.map((l) => <option key={l} value={l}>{LEVELS[l] || l}</option>)}</select></label>}
              <label>Added<select value={filters.days || ''} onChange={(e) => set('days', e.target.value)}><option value="">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>
              {data.facets.withSalary > 0 && <label className="grp-check"><input type="checkbox" checked={filters.salary === '1'} onChange={(e) => set('salary', e.target.checked ? '1' : '')} /> Salary shown</label>}
              <label>Sort<select value={filters.sort || 'location'} onChange={(e) => set('sort', e.target.value === 'location' ? '' : e.target.value)}><option value="location">Country › city › visa</option><option value="recent">Most recent</option><option value="title">Title A–Z</option></select></label>
            </div>
            {filters.nationality && <p className="grp-note">Showing jobs that say they are open to {filters.nationality}{data.nationalityNotStated ? `. ${data.nationalityNotStated} other ${data.nationalityNotStated === 1 ? 'job does' : 'jobs do'} not state nationality or visa rules.` : '.'}</p>}
          </>}
          {data.total === 0 ? <div className="jf-public-card"><h2>No active jobs in this group right now. Check back soon.</h2></div>
            : data.jobs.length === 0 ? <div className="jf-public-card"><p>No jobs match these filters. <button type="button" className="jf-textbtn" onClick={() => setFilters({})}>Clear filters</button></p></div>
              : <div className="grp-list">{data.jobs.map((c) => {
                const head = byPlace ? [c.country || 'Location not stated', c.city].filter(Boolean).join(' › ') : '';
                const show = byPlace && head !== lastHead; lastHead = head;
                return <div key={c.id}>{show && <h2 className="grp-place">{head}</h2>}<Card c={c} onView={() => view(c)} /></div>;
              })}</div>}
          <p className="grp-cta">New to JobsMatchNow? Swipe-to-match hiring: apply in one tap, chat only when both sides say yes. <a href="/">Learn more</a></p>
        </section>}
    {gate && <SignInGate jobId={gate.id} title={gate.title} from={slug} src={src} onClose={() => setGate(null)} />}
  </PublicShell>;
}

/** /app/job/{id}: one job's public card (the link recruiters paste in LinkedIn's "external website"). */
export function PublicJobCardPage({ jobId }: { jobId: string }) {
  const [src] = useState(() => (new URLSearchParams(window.location.search).get('src') === 'linkedin' ? 'linkedin' : undefined));
  const [c, setC] = useState<GroupCard | null>(null);
  const [error, setError] = useState('');
  const [gate, setGate] = useState(false);
  const signedIn = useSignedIn();
  useEffect(() => { groupsApi.job(jobId, src ? `src=${src}` : '').then((r) => { setC(r.job); document.title = `${r.job.title} at ${r.job.company} · JobsMatchNow`; }).catch((e) => setError(e instanceof Error ? e.message : 'This job is not available')); }, [jobId, src]);
  return <PublicShell>
    {!c ? <section className="jf-public-card"><h1>{error ? 'Job not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/">See open jobs on JobsMatchNow</a></p>}</section>
      : <section className="grp-wrap"><Card c={c} onView={() => (signedIn ? openJob(c.id, undefined, src) : setGate(true))} />
        {c.groups.length > 0 && <p className="grp-note">More jobs like this: {c.groups.map((g, i) => <span key={g.id}>{i ? ' · ' : ''}<a href={`/app/${g.slug}`}>{g.name}</a></span>)}</p>}
        {c.jobFinder && c.jobFinder.employerStatus !== 'member' && <p className="grp-note"><a href={`/jobs/${c.id}`}>Is this your job? Claim it</a></p>}
      </section>}
    {gate && c && <SignInGate jobId={c.id} title={c.title} src={src} onClose={() => setGate(false)} />}
  </PublicShell>;
}

/** Full details for a signed-in member, opened after "View job" (or the return from sign-up). Apply is a choice. */
export function JobDetailsSheet({ jobId, viewer, src, from, onClose, onApplied }: { jobId: string; viewer: Person; src?: string; from?: string; onClose: () => void; onApplied?: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [liked, setLiked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  useEffect(() => { groupsApi.details(jobId).then((r) => { setJob(r.job); setLiked(r.liked); }).catch((e) => setError(e instanceof Error ? e.message : 'This job is not available any more')); }, [jobId]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const apply = async () => {
    if (!job) return; setBusy(true); setError('');
    try {
      const r = await api.swipe({ actorId: viewer.id, targetId: job.id, targetType: 'job', direction: 'like', ...(src ? { src } : {}) });
      setLiked(true); setDone(r.match ? 'It’s a match! Open Conversations to talk.' : 'Applied. A chat opens only if the team likes you back.');
      onApplied?.();
      if (r.jobFinder) window.dispatchEvent(new CustomEvent(JOBFINDER_LIKED_EVENT, { detail: r.jobFinder }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not apply'); } finally { setBusy(false); }
  };
  const salary = job?.salaryRange ? salaryRangeText(job.salaryRange) : job?.salary;
  return <div className="modal-scrim" onClick={onClose}>
    <div className="ai-setup grp-details" role="dialog" aria-modal="true" aria-label="Job details" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      {!job ? <div><h2>{error ? 'Job not available' : 'Loading…'}</h2>{error && <p>{error}. {from && <a href={`/app/${from}`}>Back to the group</a>}</p>}</div> : <>
        {job.jobFinder && <span className="ai-badge">Added by JobFinder</span>}
        <h2>{job.title}</h2>
        <p className="jf-sub">{job.company}{job.recruiter?.name ? ` · Hiring: ${job.recruiter.name}` : ''}</p>
        {job.jobFinder && job.jobFinder.employerStatus !== 'member' && <p className="jf-member">Employer status: <b>Pending JobsMatchNow membership</b>.</p>}
        <div className="grp-chips">
          {job.location && <span><MapPin size={12} /> {job.location}</span>}
          {workModeText(job) && <span>{workModeText(job)}</span>}
          {job.type && <span><Briefcase size={12} /> {job.type}</span>}
          {salary && !job.salaryHidden ? <span className="grp-salary"><Wallet size={12} /> {salary}</span> : <span className="grp-muted"><Wallet size={12} /> {job.salaryHidden ? 'Salary after a match' : 'Salary not stated'}</span>}
          {visaText(job) ? <span><ShieldCheck size={12} /> {visaText(job)}</span> : <span className="grp-muted"><ShieldCheck size={12} /> Nationality / visa not stated</span>}
        </div>
        {job.requiredSkills?.length > 0 && <p className="grp-note"><b>Skills:</b> {job.requiredSkills.join(', ')}</p>}
        <div className="grp-desc"><RoleDetailsText text={job.fullDescription || job.description || ''} /></div>
        {job.jobFinder?.sourceUrl && <a className="jf-link-dark" href={job.jobFinder.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Original listing <ExternalLink size={11} /></a>}
        <div className="grp-gate-actions">
          {viewer.role === 'candidate'
            ? (liked ? <span className="jf-status sent"><Check size={15} /> {done || 'You applied to this job.'}</span>
              : <button type="button" className="primary-button" disabled={busy} onClick={() => void apply()}>Apply</button>)
            : <span className="grp-note">You are signed in as a recruiter: candidates apply from their account.</span>}
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </div>
        {error && <p className="jf-warn">{error}</p>}
      </>}
    </div>
  </div>;
}

/** Recruiters / JobFinder: the link to paste in LinkedIn ("Manage applicants → On an external website") and a share. */
export function LinkedInTools({ jobId, compact = false }: { jobId: string; compact?: boolean }) {
  const link = `${ORIGIN}/app/job/${jobId}?src=linkedin`;
  const [copied, setCopied] = useState(false);
  return <div className={compact ? 'li-tools compact' : 'li-tools'}>
    <strong><Linkedin size={14} /> Use on LinkedIn</strong>
    {!compact && <small>LinkedIn → Post a job → Manage applicants → <b>On an external website</b> → paste this link. Applicants land here and apply on JobsMatchNow.</small>}
    <div className="li-row">
      <input readOnly value={link} aria-label="Apply link for LinkedIn" onFocus={(e) => e.target.select()} />
      <button type="button" className="secondary-button small" onClick={async () => { if (await copyText(link)) { setCopied(true); setTimeout(() => setCopied(false), 1600); } }}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy apply link</>}</button>
      <a className="secondary-button small" href={linkedInShare(link)} target="_blank" rel="noopener noreferrer"><Share2 size={13} /> Share on LinkedIn</a>
    </div>
  </div>;
}

const SUGGEST: Record<string, RegExp> = {
  'g-ai-ml': /\b(ai|llm|machine learning|ml|mlops|deep learning|nlp|computer vision|genai|generative)\b/i,
  'g-data': /\b(data|analytics|bi|etl|warehouse|database|dba)\b/i,
  'g-cloud-devops': /\b(cloud|devops|sre|site reliability|platform|infrastructure|kubernetes|aws|azure|gcp|mlops)\b/i,
  'g-software': /\b(software|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|developer)\b/i,
};
/** Editor field: "Job groups". Suggestions are shown, never ticked for the user. */
export function JobGroupsField({ value, onChange, title }: { value: string[]; onChange: (ids: string[]) => void; title: string }) {
  const [groups, setGroups] = useState<JobGroup[]>([]);
  useEffect(() => { groupsApi.list().then((r) => setGroups(r.groups)).catch(() => undefined); }, []);
  const suggested = groups.filter((g) => SUGGEST[g.id]?.test(title) && !value.includes(g.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return <div className="grp-field">
    <strong>Job groups</strong>
    <small>Select the groups where candidates can discover this opportunity. Ticking a group also lists the job on its public page (title, company, place and work mode only) at jobsmatchnow.com/app/&#123;group&#125;.</small>
    <div className="grp-field-opts">{groups.map((g) => <label key={g.id}><input type="checkbox" checked={value.includes(g.id)} onChange={() => toggle(g.id)} /> {g.name}</label>)}</div>
    {suggested.length > 0 && <p className="grp-suggest">Suggested from the title: {suggested.map((g) => <button type="button" key={g.id} onClick={() => toggle(g.id)}><Plus size={11} /> {g.name}</button>)}</p>}
  </div>;
}

/** Admin: create, rename, reorder and turn off job groups; copy each group's public link. */
export function AdminJobGroupsPage() {
  const [groups, setGroups] = useState<JobGroup[]>([]);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<(Partial<JobGroup> & { examplesText?: string }) | null>(null);
  const [copied, setCopied] = useState('');
  const load = () => groupsApi.adminList().then((r) => setGroups(r.groups)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!edit) return; setError('');
    const body = { name: edit.name, slug: edit.slug, description: edit.description, examples: edit.examplesText ?? '', order: edit.order };
    try { if (edit.id) await groupsApi.adminUpdate(edit.id, body); else await groupsApi.adminCreate(body); setEdit(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); }
  };
  const toggle = async (g: JobGroup) => { try { await groupsApi.adminUpdate(g.id, { active: !g.active }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } };
  return <main className="jf-manager">
    <header className="jf-m-head"><div><h1>Job groups</h1><p>Public, shareable job lists for LinkedIn posts and promotions. Each group has its own link; recruiters and JobFinder choose the groups of their jobs.</p></div>
      <button type="button" className="primary-button" onClick={() => setEdit({ name: '', slug: '', description: '', examplesText: '' })}><Plus size={15} /> New group</button></header>
    {error && <p className="jf-warn">{error}</p>}
    {edit && <section className="jf-form">
      <h3>{edit.id ? 'Edit group' : 'New group'}</h3>
      <div className="jf-grid">
        <label>Name *<input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        <label>Link name<input value={edit.slug || ''} placeholder="from the name" onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></label>
        <label>Order<input type="number" value={edit.order ?? ''} onChange={(e) => setEdit({ ...edit, order: Number(e.target.value) })} /></label>
        <label className="wide">Short description<input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
        <label className="wide">Example roles (comma separated)<input value={edit.examplesText || ''} onChange={(e) => setEdit({ ...edit, examplesText: e.target.value })} /></label>
      </div>
      <p className="jf-help">Link: {ORIGIN}/app/{edit.slug || '…'}. Renaming a link keeps the old one working (it redirects).</p>
      <div className="jf-row-actions"><button type="button" className="primary-button" onClick={() => void save()}>Save</button><button type="button" className="secondary-button" onClick={() => setEdit(null)}>Cancel</button></div>
    </section>}
    <ul className="jf-list">{groups.map((g) => <li key={g.id} className="jf-item">
      <div className="jf-item-head">
        <div><strong>{g.name}</strong><small>{g.description}</small></div>
        <span className={`jf-pill ${g.active ? 'published' : 'removed'}`}>{g.active ? 'on' : 'off'}</span>
        <span className="jf-nums">{g.count} public jobs</span>
      </div>
      <div className="jf-row-actions">
        <a className="secondary-button small" href={`/app/${g.slug}`} target="_blank" rel="noopener">/app/{g.slug} <ExternalLink size={11} /></a>
        <button type="button" className="secondary-button small" onClick={async () => { if (await copyText(`${ORIGIN}/app/${g.slug}`)) { setCopied(g.id); setTimeout(() => setCopied(''), 1500); } }}>{copied === g.id ? 'Copied' : 'Copy link'}</button>
        <button type="button" className="secondary-button small" onClick={() => setEdit({ ...g, examplesText: g.examples.join(', ') })}>Edit</button>
        <button type="button" className="secondary-button small" onClick={() => void toggle(g)}>{g.active ? 'Turn off' : 'Turn on'}</button>
      </div>
      {g.oldSlugs && g.oldSlugs.length > 0 && <p className="jf-help">Old links still redirect: {g.oldSlugs.map((s) => `/app/${s}`).join(', ')}</p>}
    </li>)}</ul>
  </main>;
}
