// JobFinder (founder spec, 2026-11-25): external jobs listed by the JobFinder account before their employer joins.
// - JobFinderCardInfo: the honest block on the candidate's swipe card (who added it, membership, how to reach them).
// - InterestPanel: after a like, the candidate chooses what to share and asks JobsMatchNow to email the recruiter.
//   Nothing is sent without that explicit request (or the candidate's own one-click preference).
// - PublicJobPage: /jobs/:id, shareable; "I'm interested" signs in, "Is this your job?" claims it.
// - JobFinderManager: the JobFinder account's listings, contacts (verified + approved), claims and counts.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Flag, Mail, Plus, RefreshCw, Search, Send, ShieldCheck, X } from 'lucide-react';
import { api, jf } from '../../api';
import type { JfClaim, JfConsent, JfManagerRow, JfOutreach, JfReach, Job, JobFinderInfo, JobFinderPublicJob } from '../../types';

export const REACH_TEXT: Record<JfReach, string> = {
  email: 'Recruiter reachable through JobsMatchNow',
  apply: 'Recruiter contact not yet available · apply on the original site',
  none: 'Recruiter contact not yet available',
};
const fmtDate = (s?: string | number) => { if (!s) return ''; const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function outreachText(o: JfOutreach) {
  if (!o) return '';
  if (o.status === 'sent') return `Your interest was sent${o.sentAt ? ` on ${fmtDate(o.sentAt)}` : ''}${o.viaAuto ? ' (one-click)' : ''}.`;
  if (o.status === 'submitted') return 'Sending your interest…';
  return o.reason || 'Not sent.';
}

/** Swipe card, page 1: replaces "Hiring: <recruiter>" for JobFinder jobs. */
export function JobFinderCardInfo({ info }: { info: JobFinderInfo }) {
  const member = info.employerStatus === 'member';
  return <div className="jf-card-info" onPointerDownCapture={stop}>
    <p className="jf-added"><b>Added by JobFinder</b>{info.source ? ` · from ${info.source}` : ''}{info.lastCheckedAt ? ` · checked ${fmtDate(info.lastCheckedAt)}` : ''}</p>
    {!member && <p className="jf-member">Employer status: <b>Pending JobsMatchNow membership</b>. This employer hasn&rsquo;t joined yet: JobFinder listed the job from a public source.</p>}
    {info.reachability && <p className={`jf-reach ${info.reachability}`}>{info.reachability === 'email' ? <Mail size={11} /> : <AlertTriangle size={11} />} {REACH_TEXT[info.reachability]}</p>}
    {info.myOutreach && <p className="jf-reach email"><Check size={11} /> {outreachText(info.myOutreach)}</p>}
    {info.sourceUrl && <a className="jf-link" href={info.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" onClick={stop}>Original listing <ExternalLink size={10} /></a>}
  </div>;
}

function composePreview(name: string, job: JobFinderPublicJob, skills: string[], link: string | null) {
  const origin = window.location.origin;
  return [
    `${name} discovered your ${job.title} opportunity at ${job.company} through JobsMatchNow and would love to connect.`,
    skills.length ? `Their experience includes ${skills.join(', ')}.` : null,
    '',
    `Job details: ${origin}/jobs/${job.id}`,
    link ? `Candidate profile: ${/^https?:/i.test(link) ? link : `https://${link}`}` : null,
    '',
    'Would you be open to a conversation?',
  ].filter((l) => l !== null).join('\n');
}

/** After a like on a JobFinder job (or from a notification / the public page). */
export function InterestPanel({ jobId, viewerName, onClose }: { jobId: string; viewerName: string; onClose: () => void }) {
  type Data = Awaited<ReturnType<typeof jf.interest>>;
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [replyEmail, setReplyEmail] = useState(false);
  const [body, setBody] = useState('');
  const [edited, setEdited] = useState(false);
  const [agree, setAgree] = useState(false);
  const [oneClick, setOneClick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const load = () => jf.interest(jobId).then((res) => {
    setD(res);
    const c: JfConsent = res.consent;
    setSkills(c.skills.length ? c.skills.filter((s) => res.shareOptions.skills.includes(s)) : res.shareOptions.skills.slice(0, 3));
    setLink(c.profileLink && res.shareOptions.links[c.profileLink] ? c.profileLink : null);
    setReplyEmail(c.replyEmail);
    setOneClick(c.autoSend);
  }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load this job'));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jobId]);
  useEffect(() => { if (d && !edited) setBody(composePreview(viewerName, d.job, skills, link ? d.shareOptions.links[link] : null)); }, [d, skills, link, edited, viewerName]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const share = { skills, profileLink: link, replyEmail };
  const like = async () => {
    if (!d) return; setBusy(true); setError('');
    try { const me = await api.me(); await api.swipe({ actorId: me.user.id, targetId: jobId, targetType: 'job', direction: 'like' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true); setError('');
    try {
      if (oneClick !== (d?.consent.autoSend || false)) await jf.setConsent({ autoSend: oneClick, agree: oneClick || undefined, ...share });
      const res = await jf.send(jobId, { consent: true, share, body: edited ? body : undefined });
      setD((prev) => (prev ? { ...prev, outreach: res.outreach } : prev));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send'); } finally { setBusy(false); }
  };
  const turnOffOneClick = async () => { setBusy(true); try { const r = await jf.setConsent({ autoSend: false, ...share }); setD((p) => (p ? { ...p, consent: r.consent } : p)); setOneClick(false); } finally { setBusy(false); } };
  const report = async () => { try { const r = await jf.reportClosed(jobId); setNote(r.message); } catch (e) { setError(e instanceof Error ? e.message : 'Could not report'); } };

  const o = d?.outreach;
  const done = o && ['sent', 'submitted', 'suppressed'].includes(o.status);
  return <div className="modal-scrim" onClick={onClose}>
    <div className="ai-setup jf-panel" role="dialog" aria-modal="true" aria-label="Send your interest" onClick={stop}>
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      {!d ? <p>{error || 'Loading…'}</p> : <>
        <span className="ai-badge">Added by JobFinder</span>
        <h2>{d.job.title}</h2>
        <p className="jf-sub">{d.job.company}{d.job.location ? ` · ${d.job.location}` : ''}</p>
        <p className="jf-member">This employer hasn&rsquo;t joined JobsMatchNow yet. Your application is saved; a chat opens only if the employer joins and likes you back.</p>
        {!d.liked && <button type="button" className="primary-button" disabled={busy} onClick={() => void like()}>Apply (save my interest)</button>}
        {d.liked && o && <p className={`jf-status ${o.status}`}>{o.status === 'sent' ? <Check size={15} /> : <AlertTriangle size={15} />} {outreachText(o)}</p>}
        {d.liked && d.reachability === 'email' && !done && <>
          <h3>Send your interest to the recruiter</h3>
          <p className="jf-help">JobsMatchNow emails the recruiter for you. Their address stays private, and only what you tick below is shared.</p>
          {d.shareOptions.skills.length > 0 && <fieldset className="jf-share"><legend>Skills to mention (up to 8)</legend>
            {d.shareOptions.skills.map((s) => <label key={s}><input type="checkbox" checked={skills.includes(s)} disabled={!skills.includes(s) && skills.length >= 8} onChange={(e) => setSkills((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))} /> {s}</label>)}
          </fieldset>}
          {Object.keys(d.shareOptions.links).length > 0 && <fieldset className="jf-share"><legend>Profile link</legend>
            <label><input type="radio" name="jf-link" checked={!link} onChange={() => setLink(null)} /> None</label>
            {Object.entries(d.shareOptions.links).map(([k, v]) => <label key={k}><input type="radio" name="jf-link" checked={link === k} onChange={() => setLink(k)} /> {k}: {v}</label>)}
          </fieldset>}
          <label className="jf-check"><input type="checkbox" checked={replyEmail} onChange={(e) => setReplyEmail(e.target.checked)} /> Let the recruiter reply to my email (this shares my email address with them)</label>
          <label className="jf-msg">Message <small>(you can edit it)</small>
            <textarea rows={7} maxLength={1500} value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} />
          </label>
          {!d.mailer && <p className="jf-warn">Email sending isn&rsquo;t set up yet, so the message would not be delivered.</p>}
          <label className="jf-check"><input type="checkbox" checked={oneClick} onChange={(e) => setOneClick(e.target.checked)} /> One-click: next time I apply to a JobFinder job with a reachable recruiter, send automatically with these choices (you can turn this off anytime)</label>
          <label className="jf-check strong"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I ask JobsMatchNow to send this message to the recruiter on my behalf</label>
          <button type="button" className="primary-button" disabled={busy || !agree} onClick={() => void send()}><Send size={15} /> {o?.status === 'failed' ? 'Try again' : 'Send my interest'}</button>
        </>}
        {d.liked && d.reachability !== 'email' && !done && <div className="jf-fallback">
          <p><b>Recruiter contact not yet available.</b> Your application is saved. We&rsquo;ll let you know if JobFinder confirms a way to reach the recruiter; nothing is sent without your OK.</p>
        </div>}
        {d.job.jobFinder.applyUrl && <a className="secondary-button" href={d.job.jobFinder.applyUrl} target="_blank" rel="noopener noreferrer nofollow" onClick={() => void jf.applyClick(jobId)}><ExternalLink size={14} /> Apply on the original site</a>}
        {d.consent.autoSend && <p className="jf-help">One-click sending is on. <button type="button" className="jf-textbtn" disabled={busy} onClick={() => void turnOffOneClick()}>Turn off</button></p>}
        <div className="jf-foot">
          <span>{d.job.jobFinder.source ? `Source: ${d.job.jobFinder.source}` : ''}{d.job.jobFinder.lastCheckedAt ? ` · checked ${fmtDate(d.job.jobFinder.lastCheckedAt)}` : ''}</span>
          <button type="button" className="jf-textbtn" onClick={() => void report()}><Flag size={12} /> Report job closed</button>
        </div>
        {note && <p className="jf-help">{note}</p>}
        {error && <p className="jf-warn">{error}</p>}
      </>}
    </div>
  </div>;
}

/** /jobs/:id: public page of a JobFinder listing (no contact details, no private data). */
export function PublicJobPage({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobFinderPublicJob | null>(null);
  const [error, setError] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimNote, setClaimNote] = useState('');
  const [claimMsg, setClaimMsg] = useState('');
  useEffect(() => { jf.publicJob(jobId).then((r) => { setJob(r.job); document.title = `${r.job.title} at ${r.job.company} · JobsMatchNow`; }).catch((e) => setError(e instanceof Error ? e.message : 'This job is not available')); }, [jobId]);
  const claim = async () => {
    try { const r = await jf.claim(jobId, claimNote); setClaimMsg(r.duplicate ? 'Your claim is already waiting for review.' : 'Thanks: your claim is waiting for review. You keep using JobsMatchNow as usual; we tell you once it is approved.'); }
    catch (e) { const m = e instanceof Error ? e.message : ''; setClaimMsg(/Sign in/.test(m) ? 'Sign in with your recruiter account first, then come back to this page.' : m || 'Could not send the claim'); }
  };
  const info = job?.jobFinder;
  return <main className="jf-public">
    <header className="jf-public-head"><a href="/" className="jf-public-brand"><span className="brand-heart-mark" aria-hidden="true" /> JobsMatchNow</a></header>
    {!job ? <section className="jf-public-card"><h1>{error ? 'Job not available' : 'Loading…'}</h1>{error && <p>{error}. <a href="/">Browse jobs on JobsMatchNow</a></p>}</section>
      : <section className="jf-public-card">
        <span className="ai-badge">Added by JobFinder</span>
        <h1>{job.title}</h1>
        <p className="jf-sub">{[job.company, job.location, job.workMode, job.type].filter(Boolean).join(' · ')}</p>
        {info?.employerStatus !== 'member' && <p className="jf-member">Employer status: <b>Pending JobsMatchNow membership</b>. JobFinder listed this job from a public source{info?.source ? ` (${info.source})` : ''}; the employer hasn&rsquo;t joined yet.</p>}
        {info?.listingStatus === 'expired' && <p className="jf-warn">This listing has expired.</p>}
        {info?.reachability && <p className={`jf-reach ${info.reachability}`}>{REACH_TEXT[info.reachability]}</p>}
        {(job.salary || job.salaryRange) && <p><b>Salary:</b> {job.salaryRange ? `${job.salaryRange.currency} ${job.salaryRange.min.toLocaleString('en-US')}–${job.salaryRange.max.toLocaleString('en-US')}` : job.salary}</p>}
        {job.requiredSkills.length > 0 && <p><b>Skills:</b> {job.requiredSkills.join(', ')}</p>}
        {(job.fullDescription || job.description) && <div className="jf-desc">{(job.fullDescription || job.description || '').split(/\n+/).map((line, i) => <p key={i}>{line}</p>)}</div>}
        {job.missing.length > 0 && <p className="jf-help">Not provided by the source: {job.missing.join(', ')}.</p>}
        <p className="jf-help">{info?.lastCheckedAt ? `Last checked ${fmtDate(info.lastCheckedAt)}` : ''}{info?.closingDate ? ` · closes ${fmtDate(info.closingDate)}` : ''}{job.interested ? ` · ${job.interested} candidate${job.interested === 1 ? '' : 's'} interested` : ''}</p>
        <div className="jf-public-actions">
          {info?.listingStatus !== 'expired' && <a className="primary-button" href={`/?jf=${encodeURIComponent(job.id)}`}>I&rsquo;m interested</a>}
          {info?.applyUrl && <a className="secondary-button" href={info.applyUrl} target="_blank" rel="noopener noreferrer nofollow" onClick={() => void jf.applyClick(job.id)}><ExternalLink size={14} /> Apply on the original site</a>}
          {info?.sourceUrl && <a className="secondary-button" href={info.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Original listing</a>}
        </div>
        {info?.employerStatus !== 'member' && <div className="jf-claim">
          {!claimOpen ? <button type="button" className="jf-textbtn" onClick={() => setClaimOpen(true)}><ShieldCheck size={13} /> Is this your job? Claim it</button>
            : <>
              <p>Recruiters at {job.company}: claim this listing to manage it and meet the candidates who are interested. Sign in (or join free) with your work account first; JobFinder reviews every claim.</p>
              <textarea rows={3} maxLength={600} placeholder="Your role at the company and how we can verify it (e.g. company email, LinkedIn)" value={claimNote} onChange={(e) => setClaimNote(e.target.value)} />
              <div className="jf-public-actions"><button type="button" className="primary-button" onClick={() => void claim()}>Request to claim</button><a className="secondary-button" href="/">Sign in / join free</a></div>
              {claimMsg && <p className="jf-help">{claimMsg}</p>}
            </>}
        </div>}
      </section>}
    <footer className="jf-public-foot">© 2026 JobsMatchNow SARL · <a href="/legal.html">Legal notice</a></footer>
  </main>;
}

/* ---------------- Manager (JobFinder account + admins) ---------------- */
const EMPTY_FORM = { title: '', company: '', location: '', workMode: '', type: 'Full-time', salary: '', requiredSkills: '', description: '', sourceName: '', sourceUrl: '', applyUrl: '', closingDate: '', listingStatus: 'draft' };
type Form = typeof EMPTY_FORM;

/** Best-effort fill from a pasted listing: only lines that say what they are ("Title:", "Location:", …) and URLs.
 *  Nothing is invented; the manager checks every field before saving. */
export function parsePasted(text: string): Partial<Form> {
  const out: Partial<Form> = {};
  const pick = (re: RegExp) => text.match(re)?.[1]?.trim();
  out.title = pick(/^\s*(?:job\s*)?title\s*[:\-–]\s*(.+)$/im);
  out.company = pick(/^\s*(?:company|employer)\s*[:\-–]\s*(.+)$/im);
  out.location = pick(/^\s*location\s*[:\-–]\s*(.+)$/im);
  out.salary = pick(/^\s*(?:salary|pay|compensation)\s*[:\-–]\s*(.+)$/im);
  out.requiredSkills = pick(/^\s*(?:skills|requirements|tech stack)\s*[:\-–]\s*(.+)$/im);
  const urls = text.match(/https?:\/\/[^\s)]+/g) || [];
  if (urls[0]) out.sourceUrl = urls[0];
  if (/\bremote\b/i.test(text)) out.workMode = 'Remote'; else if (/\bhybrid\b/i.test(text)) out.workMode = 'Hybrid'; else if (/\bon-?site\b/i.test(text)) out.workMode = 'On-site';
  out.description = text.trim().slice(0, 6000);
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Partial<Form>;
}

function toBody(f: Form) {
  return {
    title: f.title, company: f.company, location: f.location, workMode: f.workMode, type: f.type, salary: f.salary,
    requiredSkills: f.requiredSkills.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
    description: f.description, fullDescription: f.description, sourceName: f.sourceName, sourceUrl: f.sourceUrl, applyUrl: f.applyUrl,
    closingDate: f.closingDate || undefined, listingStatus: f.listingStatus,
  };
}

function ContactForm({ row, onSaved }: { row: JfManagerRow; onSaved: () => void }) {
  const c = row.contact;
  const [name, setName] = useState(c?.name || '');
  const [email, setEmail] = useState(c?.email || '');
  const [how, setHow] = useState(c?.verifiedHow || '');
  const [when, setWhen] = useState(c?.verifiedAt || new Date().toISOString().slice(0, 10));
  const [approved, setApproved] = useState(c?.approved || false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    try { const r = await jf.setContact(row.id, { name, email, verifiedHow: how, verifiedAt: when, approved }); setMsg(`Saved · candidates now see: ${REACH_TEXT[r.reachability]}`); onSaved(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save'); }
  };
  return <div className="jf-contact">
    <h4>Recruiter contact <small>(private: never shown to candidates)</small></h4>
    {c?.suppressed && <p className="jf-warn">This address unsubscribed: no emails will be sent to it.</p>}
    <div className="jf-grid">
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="wide">How was it verified?<input value={how} placeholder="e.g. listed as the hiring contact on the company careers page" onChange={(e) => setHow(e.target.value)} /></label>
      <label>Verified on<input type="date" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
    </div>
    <label className="jf-check"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> Approved for candidate emails (only a publicly listed or confirmed hiring contact)</label>
    <button type="button" className="secondary-button small" onClick={() => void save()}>Save contact</button>
    {msg && <p className="jf-help">{msg}</p>}
  </div>;
}

export function JobFinderManager() {
  const [rows, setRows] = useState<JfManagerRow[]>([]);
  const [claims, setClaims] = useState<JfClaim[]>([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', reachability: '', sort: 'created' });
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [dupes, setDupes] = useState<JfManagerRow['duplicates']>([]);
  const query = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);
  const load = () => {
    jf.list(query).then((r) => setRows(r.jobs)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
    jf.claims().then((r) => setClaims(r.claims)).catch(() => undefined);
  };
  useEffect(load, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = rows.reduce((t, r) => ({ jobs: t.jobs + 1, published: t.published + (r.jobFinder.listingStatus === 'published' ? 1 : 0), likes: t.likes + r.likes, sent: t.sent + r.emails.sent, failed: t.failed + r.emails.failed, matches: t.matches + r.matches }), { jobs: 0, published: 0, likes: 0, sent: 0, failed: 0, matches: 0 });
  const save = async () => {
    if (!form) return; setError('');
    try {
      const res = editing ? await jf.update(editing, toBody(form)) : await jf.create(toBody(form));
      setDupes(res.duplicates); setForm(null); setEditing(null); setPaste(''); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); }
  };
  const act = async (id: string, action: string) => {
    const reason = action === 'remove' ? window.prompt('Why remove it? (kept in the history)') || '' : undefined;
    if (action === 'remove' && !reason) return;
    try { await jf.update(id, { action, reason }); load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update'); }
  };
  const edit = (r: JfManagerRow) => {
    setEditing(r.id); setOpen(null);
    setForm({ title: r.title, company: r.company, location: r.location || '', workMode: r.workMode || '', type: r.type || '', salary: r.salary || '', requiredSkills: r.requiredSkills.join(', '), description: r.fullDescription || r.description || '', sourceName: r.jobFinder.source || '', sourceUrl: r.jobFinder.sourceUrl || '', applyUrl: r.jobFinder.applyUrl || '', closingDate: r.jobFinder.closingDate || '', listingStatus: r.jobFinder.listingStatus === 'published' ? 'published' : 'draft' });
  };
  const decide = async (id: string, decision: 'approve' | 'reject') => {
    if (decision === 'approve' && !window.confirm('Approve this claim? The job moves to this recruiter\'s account.')) return;
    try { await jf.decide(id, decision); load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not decide'); }
  };
  const pending = claims.filter((c) => c.status === 'pending');
  const F = (k: keyof Form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label>{label}<input value={form?.[k] || ''} onChange={(e) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f))} {...extra} /></label>;

  return <main className="jf-manager">
    <header className="jf-m-head">
      <div><h1>JobFinder listings</h1><p>External jobs listed before their employer joins. Candidates see who added them, how fresh they are and whether the recruiter is reachable.</p></div>
      <button type="button" className="primary-button" onClick={() => { setEditing(null); setForm({ ...EMPTY_FORM }); }}><Plus size={15} /> Add a job</button>
    </header>
    <div className="jf-stats">
      <span><b>{totals.jobs}</b> listings</span><span><b>{totals.published}</b> published</span><span><b>{totals.likes}</b> applications</span>
      <span><b>{totals.sent}</b> emails sent</span><span><b>{totals.failed}</b> not sent / failed</span><span><b>{totals.matches}</b> matches</span><span><b>{pending.length}</b> claims to review</span>
    </div>
    {error && <p className="jf-warn">{error}</p>}
    {dupes.length > 0 && <p className="jf-warn">Possible duplicate of: {dupes.map((d) => `${d.title} · ${d.company} (${d.listingStatus})`).join('; ')}</p>}

    {form && <section className="jf-form">
      <h3>{editing ? 'Edit listing' : 'Add a job'}</h3>
      {!editing && <label className="wide">Paste the listing (optional) — fields marked "Title:", "Company:", "Location:", "Salary:", "Skills:" and the first link are filled in; check everything before saving
        <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button type="button" className="secondary-button small" onClick={() => setForm((f) => (f ? { ...f, ...parsePasted(paste) } : f))}>Fill from paste</button>
      </label>}
      <div className="jf-grid">
        {F('title', 'Job title *')}{F('company', 'Employer *')}{F('location', 'Location')}
        <label>Work mode<select value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })}><option value="">Not stated</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select></label>
        {F('type', 'Contract type')}{F('salary', 'Salary (as published)')}
        {F('requiredSkills', 'Skills (comma separated)')}{F('sourceName', 'Source (e.g. company careers page)')}
        {F('sourceUrl', 'Original listing URL', { type: 'url' })}{F('applyUrl', 'Apply URL', { type: 'url' })}{F('closingDate', 'Closing date', { type: 'date' })}
        <label>Status<select value={form.listingStatus} onChange={(e) => setForm({ ...form, listingStatus: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <label className="wide">Description<textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      </div>
      <p className="jf-help">Only public listings from sources that allow it; no scraping. Leave unknown fields empty rather than guessing.</p>
      <div className="jf-row-actions"><button type="button" className="primary-button" onClick={() => void save()}>Save</button><button type="button" className="secondary-button" onClick={() => { setForm(null); setEditing(null); }}>Cancel</button></div>
    </section>}

    {pending.length > 0 && <section className="jf-claims"><h3>Claims to review</h3>
      {pending.map((c) => <div key={c.id} className="jf-claim-row">
        <div><b>{c.recruiter?.name || 'Unknown'}</b> ({c.recruiter?.company || 'no company'}{c.recruiter?.email ? ` · ${c.recruiter.email}` : ''}{c.recruiter && !c.recruiter.emailVerified ? ' · email not verified' : ''}) wants <b>{c.job?.title}</b> at {c.job?.company}
          {c.note && <p className="jf-help">“{c.note}”</p>}{c.recruiter?.website && <small> Website: {c.recruiter.website}</small>}{c.recruiter?.linkedin && <small> · LinkedIn: {c.recruiter.linkedin}</small>}</div>
        <div className="jf-row-actions"><button type="button" className="secondary-button small" onClick={() => void decide(c.id, 'approve')}><Check size={13} /> Approve</button><button type="button" className="secondary-button small" onClick={() => void decide(c.id, 'reject')}><X size={13} /> Reject</button></div>
      </div>)}
    </section>}

    <div className="jf-filters">
      <label className="jf-search"><Search size={14} /><input placeholder="Title, employer, location" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></label>
      <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status"><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="expired">Expired</option><option value="claimed">Claimed</option><option value="removed">Removed</option></select>
      <select value={filters.reachability} onChange={(e) => setFilters({ ...filters, reachability: e.target.value })} aria-label="Reachability"><option value="">Any reachability</option><option value="email">Email</option><option value="apply">Apply link only</option><option value="none">None</option></select>
      <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} aria-label="Sort"><option value="created">Newest</option><option value="likes">Most applications</option><option value="checked">Oldest check</option></select>
      <button type="button" className="secondary-button small" onClick={load}><RefreshCw size={13} /> Refresh</button>
    </div>

    {rows.length === 0 ? <p className="jf-help">No listings yet. Add the first pilot job (AI / data / software engineering, Vietnam or USA).</p>
      : <ul className="jf-list">{rows.map((r) => <li key={r.id} className="jf-item">
        <div className="jf-item-head" role="button" tabIndex={0} onClick={() => setOpen(open === r.id ? null : r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(open === r.id ? null : r.id); }}>
          <div><strong>{r.title}</strong><small>{[r.company, r.location, r.workMode].filter(Boolean).join(' · ')}</small></div>
          <span className={`jf-pill ${r.jobFinder.listingStatus}`}>{r.jobFinder.listingStatus}</span>
          <span className={`jf-pill reach-${r.jobFinder.reachability}`}>{r.jobFinder.reachability === 'email' ? 'email' : r.jobFinder.reachability === 'apply' ? 'apply link' : 'no contact'}</span>
          <span className="jf-nums">{r.likes} apps · {r.emails.sent} sent · {r.views} views · {r.matches} matches</span>
        </div>
        {r.flags.length > 0 && <p className="jf-warn">{r.flags.join(' · ')}</p>}
        {open === r.id && <div className="jf-item-body">
          <div className="jf-row-actions">
            <button type="button" className="secondary-button small" onClick={() => edit(r)}>Edit</button>
            {r.jobFinder.listingStatus !== 'published' && r.jobFinder.listingStatus !== 'claimed' && <button type="button" className="secondary-button small" onClick={() => void act(r.id, 'publish')}>Publish</button>}
            {r.jobFinder.listingStatus === 'published' && <button type="button" className="secondary-button small" onClick={() => void act(r.id, 'unpublish')}>Unpublish</button>}
            {r.jobFinder.listingStatus === 'published' && <button type="button" className="secondary-button small" onClick={() => void act(r.id, 'expire')}>Mark expired</button>}
            <button type="button" className="secondary-button small" onClick={() => void act(r.id, 'checked')}>Checked today</button>
            <button type="button" className="secondary-button small" onClick={() => void act(r.id, 'source-unavailable')}>Source unavailable</button>
            {r.jobFinder.listingStatus !== 'removed' && r.jobFinder.listingStatus !== 'claimed' && <button type="button" className="secondary-button small" onClick={() => void act(r.id, 'remove')}>Remove</button>}
            {r.jobFinder.listingStatus !== 'draft' && r.jobFinder.listingStatus !== 'removed' && <a className="secondary-button small" href={`/jobs/${r.id}`} target="_blank" rel="noopener">Public page <ExternalLink size={11} /></a>}
          </div>
          <p className="jf-help">Source: {r.jobFinder.source || '—'}{r.jobFinder.sourceUrl ? <> · <a href={r.jobFinder.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">original</a></> : null} · last checked {fmtDate(r.jobFinder.lastCheckedAt) || '—'} · apply clicks {r.applyClicks} · closed reports {r.closedReports} · claims {r.claims.pending} pending / {r.claims.approved} approved</p>
          {r.missing.length > 0 && <p className="jf-help">Missing: {r.missing.join(', ')}</p>}
          {r.jobFinder.listingStatus !== 'claimed' && <ContactForm row={r} onSaved={load} />}
          {r.history.length > 0 && <details><summary>History</summary><ul className="jf-history">{r.history.slice().reverse().map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} · {h.action}</li>)}</ul></details>}
        </div>}
      </li>)}</ul>}
  </main>;
}

/** The JobFinder bits of a job for other components. */
export const isJobFinder = (job?: Job | null) => Boolean(job?.jobFinder);
