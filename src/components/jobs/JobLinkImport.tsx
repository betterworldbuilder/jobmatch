// Import job from link (founder spec, 2026-11-25).
// Paste a URL → Analyze link → editable review → Save draft or Publish job. The original link is always kept as the
// source. LinkedIn (and any site without a permitted method) is never read: the user pastes the text or types it.
// Nothing is invented: unknown fields stay empty ("Not provided"), guesses from pasted text are marked "Check".
import { useState } from 'react';
import { AlertTriangle, Check, ClipboardPaste, Link2, Loader2, PencilLine, Sparkles, X } from 'lucide-react';
import { api, jf, jobLink, type LinkAnalysis, type LinkDuplicate } from '../../api';
import { JobGroupsField } from '../groups/Groups';

type Mode = 'jobfinder' | 'recruiter';
type Input = 'link' | 'paste' | 'manual';
type Mark = { from: string | null; review: boolean };
const FIELDS = ['title', 'company', 'location', 'workMode', 'type', 'salaryRange', 'description', 'skills', 'experienceLevel', 'deadline', 'applyUrl'] as const;
const EMPTY = { title: '', company: '', location: '', workMode: '', type: '', salaryMin: '', salaryMax: '', currency: '', description: '', skills: '', experienceLevel: '', deadline: '', applyUrl: '',
  sourceUrl: '', sourceName: '', jobGroups: [] as string[], contactName: '', contactEmail: '', verifiedHow: '', verifiedAt: '', approved: false };
type Form = typeof EMPTY;
const METHOD_TEXT = { imported: 'Imported from the link', pasted: 'Pasted by you', manual: 'Entered manually' } as const;
const LABELS: Record<string, string> = { title: 'Job title', company: 'Company', location: 'Location', workMode: 'Remote / hybrid / on-site', type: 'Employment type', salaryRange: 'Salary range', description: 'Job description', skills: 'Skills and qualifications', experienceLevel: 'Experience level', deadline: 'Application deadline', applyUrl: 'Apply link' };

export function JobLinkImport({ mode, onClose, onDone }: { mode: Mode; onClose: () => void; onDone: () => void }) {
  const [input, setInput] = useState<Input>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [a, setA] = useState<LinkAnalysis | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [dupes, setDupes] = useState<LinkDuplicate[]>([]);
  const [dupesOk, setDupesOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ status: string; note?: string } | null>(null);
  const set = (k: keyof Form, v: string | boolean | string[]) => setForm((p) => ({ ...p, [k]: v }));

  const load = (res: LinkAnalysis, keep?: Form) => {
    const v = res.fields;
    const pick = (k: keyof typeof v, cur: string) => (v[k].value === null ? cur : String(v[k].value));
    const base = keep || EMPTY;
    setA(res);
    setForm({
      ...base, title: pick('title', base.title), company: pick('company', base.company), location: pick('location', base.location), workMode: pick('workMode', base.workMode),
      type: pick('type', base.type), description: pick('description', base.description), experienceLevel: pick('experienceLevel', base.experienceLevel),
      deadline: pick('deadline', base.deadline), applyUrl: pick('applyUrl', base.applyUrl), skills: v.skills.value ? v.skills.value.join(', ') : base.skills,
      salaryMin: v.salaryRange.value ? String(v.salaryRange.value.min) : base.salaryMin, salaryMax: v.salaryRange.value ? String(v.salaryRange.value.max) : base.salaryMax,
      currency: v.salaryRange.value ? v.salaryRange.value.currency : base.currency,
      sourceUrl: res.sourceUrl || base.sourceUrl, sourceName: res.sourceName || base.sourceName,
    });
    setMarks(Object.fromEntries(FIELDS.map((k) => [k, { from: v[k].from, review: v[k].review }])));
    setDupes(res.duplicates); setDupesOk(false);
  };
  const analyze = async (withText?: string) => {
    setBusy(true); setError('');
    try {
      const res = await jobLink.analyze({ url: url.trim() || undefined, text: withText || undefined, mode });
      load(res, a ? form : undefined);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not analyze'); } finally { setBusy(false); }
  };
  const manual = () => {
    setA({ mode, sourceUrl: url || null, sourceName: null, sourceJobId: null, provider: 'none', retrieved: false, method: 'manual', extraction: 'Nothing extracted', notice: null, reason: null, importedAt: new Date().toISOString(),
      fields: Object.fromEntries(FIELDS.map((k) => [k, { value: null, from: null, review: false }])) as LinkAnalysis['fields'], duplicates: [] });
    setForm({ ...EMPTY, sourceUrl: url, applyUrl: url }); setMarks({});
  };

  const missing = [
    !form.title && 'title', !form.company && mode === 'jobfinder' && 'company', !form.location && 'location', !form.workMode && 'work arrangement', !form.type && 'employment type',
    !(form.salaryMin && form.salaryMax && form.currency) && 'salary', !form.skills.trim() && 'skills', !form.description.trim() && 'description', !form.deadline && 'deadline',
  ].filter(Boolean) as string[];
  const salaryRange = form.salaryMin && form.salaryMax && form.currency ? { min: Number(form.salaryMin), max: Number(form.salaryMax), currency: form.currency.toUpperCase() } : undefined;
  const skills = form.skills.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const method = a?.method || 'manual';

  const save = async (publish: boolean) => {
    if (!a) return;
    setError('');
    if (!form.title.trim()) { setError('Add a job title first.'); return; }
    if (publish && !window.confirm('Publish this job now? Candidates will be able to see it.')) return;
    setBusy(true);
    try {
      if (!dupesOk) {
        const { duplicates } = await jobLink.duplicates({ mode, sourceUrl: form.sourceUrl || undefined, title: form.title, company: form.company, location: form.location });
        if (duplicates.length) { setDupes(duplicates); setBusy(false); setError('Possible duplicate: check the job(s) below, then confirm to continue.'); return; }
      }
      if (mode === 'jobfinder') {
        const res = await jf.create({
          title: form.title, company: form.company, location: form.location, workMode: form.workMode, type: form.type, salaryRange, requiredSkills: skills,
          description: form.description, fullDescription: form.description, seniority: form.experienceLevel || undefined, closingDate: form.deadline || undefined,
          sourceName: form.sourceName, sourceUrl: form.sourceUrl || undefined, applyUrl: form.applyUrl || undefined, listingStatus: publish ? 'published' : 'draft', jobGroups: form.jobGroups,
          importInfo: { method, extraction: a.extraction, sourceJobId: a.sourceJobId || undefined },
          // The possible duplicates were shown and the user confirmed: the server's guardrail lets it through.
          ...(dupesOk ? { allowDuplicate: true } : {}),
        });
        let note: string | undefined;
        if (form.contactEmail || form.contactName) {
          try { await jf.setContact(res.job.id, { name: form.contactName || undefined, email: form.contactEmail || undefined, verifiedHow: form.verifiedHow || undefined, verifiedAt: form.verifiedAt || undefined, approved: form.approved }); }
          catch (e) { note = `The job was saved, but the contact was not: ${e instanceof Error ? e.message : 'error'}. Add it from the listing.`; }
        }
        setDone({ status: publish ? 'Published' : 'Saved as draft', note });
      } else {
        const res = await jobLink.recruiterDraft({
          title: form.title, location: form.location, workMode: form.workMode || undefined, type: form.type || undefined, salaryRange, skills, description: form.description,
          experienceLevel: form.experienceLevel || undefined, deadline: form.deadline || undefined, sourceUrl: form.sourceUrl || undefined, sourceName: form.sourceName,
          sourceJobId: a.sourceJobId || undefined, importMethod: method, extraction: a.extraction, jobGroups: form.jobGroups,
        });
        if (publish) {
          try { await api.updateJob(res.job.id, { status: 'active' } as never); setDone({ status: 'Published' }); }
          catch (e) { setDone({ status: 'Saved as draft', note: `Not published yet: ${e instanceof Error ? e.message : 'missing details'}. Open the draft in Jobs to complete it, then publish.` }); }
        } else setDone({ status: 'Saved as draft' });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };

  const tag = (k: string) => {
    const m = marks[k];
    if (m?.from === 'source') return <span className="jli-tag ok">From source</span>;
    if (m?.review) return <span className="jli-tag check">Check</span>;
    return null;
  };
  const F = (k: keyof Form, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label>{LABELS[k] || k} {tag(k)}
    <input value={String(form[k] ?? '')} placeholder="Not provided" onChange={(e) => set(k, e.target.value)} {...extra} /></label>;
  const contactReady = Boolean(form.contactEmail && form.verifiedHow && form.verifiedAt);

  return <div className="job-import-overlay" role="dialog" aria-modal="true" aria-labelledby="jli-title">
    <button className="job-import-scrim" aria-label="Close" onClick={onClose} />
    <section className="job-import-modal jli">
      <header>
        <div><span className="overline">{mode === 'jobfinder' ? 'JobFinder' : 'Recruiting'}</span><h1 id="jli-title">Import job from link</h1>
          <p>Paste a job link, review what we found, then save a draft or publish. Nothing is published until you choose to.</p></div>
        <button className="job-import-close" aria-label="Close" onClick={onClose}><X size={20} /></button>
      </header>

      {done ? <div className="job-import-success">
        <span><Check size={30} /></span><h2>{done.status}</h2>
        <p>{form.title} · {METHOD_TEXT[method]}{form.sourceUrl ? ' · source link kept' : ''}</p>
        {done.note && <p className="jf-warn">{done.note}</p>}
        <button className="primary-button" onClick={onDone}>Done</button>
      </div> : !a ? <div className="job-import-form">
        <div className="jli-tabs" role="tablist">
          {([['link', Link2, 'Job link'], ['paste', ClipboardPaste, 'Paste job description'], ['manual', PencilLine, 'Manual entry']] as const).map(([k, Icon, label]) =>
            <button key={k} type="button" role="tab" aria-selected={input === k} className={input === k ? 'on' : ''} onClick={() => { setInput(k); setError(''); }}><Icon size={14} /> {label}</button>)}
        </div>
        <label><span>Job link {input === 'link' ? '' : '(optional, kept as the source)'}</span>
          <input type="url" value={url} placeholder="https://www.linkedin.com/jobs/view/…" onChange={(e) => setUrl(e.target.value)} /></label>
        {input === 'paste' && <label><span>Job description (text you are allowed to use)</span><textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the title and full description" /></label>}
        <p className="jf-help">We never ask for your LinkedIn password and never get past sign-in pages or CAPTCHAs. LinkedIn job pages are not read automatically: paste the description instead.</p>
        <div className="job-import-actions">
          {input === 'link' && <button className="primary-button" disabled={busy || !url.trim()} onClick={() => void analyze()}>{busy ? <Loader2 className="spin" /> : <Sparkles />} Analyze link</button>}
          {input === 'paste' && <button className="primary-button" disabled={busy || text.trim().length < 40} onClick={() => void analyze(text)}>{busy ? <Loader2 className="spin" /> : <Sparkles />} Suggest fields</button>}
          {input === 'manual' && <button className="primary-button" onClick={manual}><PencilLine size={15} /> Continue</button>}
        </div>
      </div> : <div className="job-import-form">
        <div className="jli-source">
          <p><b>Source:</b> {form.sourceName || 'Not provided'} · <b>Content:</b> {METHOD_TEXT[method]} · <b>Extraction:</b> {a.extraction} · <b>Date:</b> {new Date(a.importedAt).toLocaleString()}</p>
          {form.sourceUrl && <p><b>Original link:</b> <a href={form.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{form.sourceUrl}</a></p>}
        </div>
        {a.notice && <div className="jli-fallback">
          <p className="jf-warn"><AlertTriangle size={13} /> {a.notice}</p>
          {a.reason && <p className="jf-help">{a.reason}</p>}
          <textarea rows={6} value={text} placeholder="Paste the job title and description" onChange={(e) => setText(e.target.value)} />
          <button type="button" className="secondary-button small" disabled={busy || text.trim().length < 40} onClick={() => void analyze(text)}>{busy ? <Loader2 className="spin" size={13} /> : <Sparkles size={13} />} Suggest fields from this text</button>
          <span className="jf-help"> or fill in the form below.</span>
        </div>}

        <div className="jli-labels">
          {mode === 'jobfinder' ? <><span className="ai-badge">Added by JobFinder</span><span className="jf-pill draft">Pending JobsMatchNow membership</span></>
            : <span className="jf-pill published">Posted by your JobsMatchNow account{a.company ? ` (${a.company})` : ''}</span>}
        </div>
        <div className="jf-grid">
          {F('title')}
          {mode === 'jobfinder' ? F('company') : <label>Company<input value={a.company || ''} disabled /></label>}
          {F('location')}
          <label>{LABELS.workMode} {tag('workMode')}<select value={form.workMode} onChange={(e) => set('workMode', e.target.value)}><option value="">Not provided</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select></label>
          <label>{LABELS.type} {tag('type')}<select value={form.type} onChange={(e) => set('type', e.target.value)}><option value="">Not provided</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Freelance</option><option>Internship</option></select></label>
          <label>{LABELS.experienceLevel} {tag('experienceLevel')}<select value={form.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)}><option value="">Not provided</option><option value="junior">Junior</option><option value="mid">Mid</option><option value="senior">Senior</option><option value="lead">Lead</option><option value="exec">Exec</option></select></label>
          <label>{LABELS.salaryRange} {tag('salaryRange')}<span className="jli-salary">
            <input inputMode="numeric" placeholder="Min" value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value.replace(/[^\d]/g, ''))} />
            <input inputMode="numeric" placeholder="Max" value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value.replace(/[^\d]/g, ''))} />
            <input placeholder="USD" maxLength={3} value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} /></span></label>
          {F('deadline', { type: 'date' })}
          {F('skills')}
          {F('applyUrl', { type: 'url' })}
          <label>Source name<input value={form.sourceName} placeholder="e.g. LinkedIn, company careers page" onChange={(e) => set('sourceName', e.target.value)} /></label>
          <label>Original job URL<input type="url" value={form.sourceUrl} placeholder="Not provided" onChange={(e) => set('sourceUrl', e.target.value)} /></label>
          <label className="wide">{LABELS.description} {tag('description')}<textarea rows={8} value={form.description} placeholder="Not provided" onChange={(e) => set('description', e.target.value)} /></label>
        </div>
        {missing.length > 0 && <p className="jf-help"><b>Not provided:</b> {missing.join(', ')}. Leave them empty rather than guessing.</p>}
        <JobGroupsField value={form.jobGroups} onChange={(ids) => set('jobGroups', ids)} title={form.title} />

        {mode === 'jobfinder' && <fieldset className="jf-contact">
          <h4>Recruiter or employer email <small>(private: never shown to candidates)</small></h4>
          <p className="jf-help">Only an address you obtained appropriately (e.g. the recruiter gave it to you, or it is published for recruiting enquiries). Job links don&rsquo;t contain recruiter emails, and we never guess one.</p>
          <div className="jf-grid">
            <label>Name<input value={form.contactName} placeholder="Not provided" onChange={(e) => set('contactName', e.target.value)} /></label>
            <label>Email<input type="email" value={form.contactEmail} placeholder="Not provided" onChange={(e) => set('contactEmail', e.target.value)} /></label>
            <label className="wide">How was it verified?<input value={form.verifiedHow} placeholder="e.g. the recruiter confirmed it in a LinkedIn message" onChange={(e) => set('verifiedHow', e.target.value)} /></label>
            <label>Verified on<input type="date" value={form.verifiedAt} onChange={(e) => set('verifiedAt', e.target.value)} /></label>
          </div>
          <label className="jf-check"><input type="checkbox" disabled={!contactReady} checked={form.approved && contactReady} onChange={(e) => set('approved', e.target.checked)} /> Approved for candidate emails {contactReady ? '' : '(needs email, how and when it was verified)'}</label>
          {!form.contactEmail && <p className="jf-help">No approved email: candidates see &ldquo;Recruiter contact not yet available&rdquo; and the apply link.</p>}
        </fieldset>}

        {dupes.length > 0 && <div className="jli-dupes">
          <p className="jf-warn"><AlertTriangle size={13} /> Possible duplicate{dupes.length > 1 ? 's' : ''}: inspect before continuing.</p>
          {dupes.map((d) => <details key={d.id}><summary><b>{d.title}</b> · {d.company}{d.location ? ` · ${d.location}` : ''} · {d.status}</summary>
            <p className="jf-help">{d.sourceUrl ? <>Source: <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{d.sourceUrl}</a> · </> : null}{d.createdAt ? `added ${new Date(d.createdAt).toLocaleDateString()}` : ''}</p>
            {d.description && <p className="jf-help">{d.description}</p>}</details>)}
          <label className="jf-check"><input type="checkbox" checked={dupesOk} onChange={(e) => setDupesOk(e.target.checked)} /> I checked these; this is a different job</label>
        </div>}
        <div className="job-import-actions">
          <button className="secondary-button" disabled={busy} onClick={() => { setA(null); setError(''); }}>Back</button>
          <button className="secondary-button" disabled={busy || (dupes.length > 0 && !dupesOk)} onClick={() => void save(false)}>Save draft</button>
          <button className="primary-button" disabled={busy || (dupes.length > 0 && !dupesOk)} onClick={() => void save(true)}>{busy ? <Loader2 className="spin" /> : null} Publish job</button>
        </div>
      </div>}
      {error && <p className="job-import-error">{error}</p>}
    </section>
  </div>;
}
