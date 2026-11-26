// My Resume (founder, 2026-11-26/27). Top: 1. the active resume, 2. a dropdown of the roles (target roles + jobs
// applied to), then 3. the resume vs role gap analysis (our own script, free) and 4. the AI gap analysis chat with the
// first question already typed ("What is the current gap between the role and my resume?"). "Ask AI" asks the
// member's own chatbot (Premium + "Use My ChatBot"); otherwise it opens the Premium options details. 500 KB max;
// free plan: 1 resume for every role; Premium (multi-role): one resume per target role.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Crown, Download, FileText, Loader2, Lock, Send, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { Bootstrap, ResumeMeta, View } from '../../types';

const MAX_KB = 500;
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FIRST_QUESTION = 'What is the current gap between the role and my resume?';
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
const when = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
type Gap = Awaited<ReturnType<typeof api.resumeGapBasic>>;
type Msg = { role: 'user' | 'assistant'; content: string };
type Opt = { key: string; label: string; role: string; jobId?: string; target: boolean };

export function ResumePage({ data, setData, navigate }: { data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void }) {
  const v = data.viewer;
  const roles = (v.preferences?.desiredRoles || []).filter(Boolean);
  const main = v.documents?.resume;
  const perRole = v.documents?.roleResumes || {};
  // The dropdown: target roles first (up to 3), then the jobs applied to.
  const options = useMemo<Opt[]>(() => [
    ...roles.map((r) => ({ key: `role:${r}`, label: r, role: r, target: true })),
    ...(data.applied || []).filter((a) => a.job).map((a) => ({ key: `job:${a.jobId}`, label: `${a.job.title}${a.job.company ? ` · ${a.job.company}` : ''}`, role: a.job.title, jobId: a.jobId, target: false })),
  ], [roles.join('|'), data.applied]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(() => options[0]?.key || '');
  const opt = options.find((o) => o.key === sel) || options[0];
  const [status, setStatus] = useState<{ premium: boolean; ai: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [gap, setGap] = useState<Gap | 'loading' | null>(null);
  const [chat, setChat] = useState<Record<string, Msg[]>>({});
  const [draft, setDraft] = useState(FIRST_QUESTION);
  const [asking, setAsking] = useState(false);
  const [premiumInfo, setPremiumInfo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<string>('');
  const own = opt?.target ? perRole[opt.role] : undefined;
  const active = own || main;
  const fileKey = `${main?.id || ''}|${own?.id || ''}`;

  useEffect(() => { api.aiChatStatus().then((s) => setStatus({ premium: Boolean(s.premium?.active), ai: Boolean(s.enabled) })).catch(() => setStatus({ premium: false, ai: false })); }, []);
  useEffect(() => {
    if (!opt) return;
    setGap('loading');
    api.resumeGapBasic(v.id, opt.role, opt.jobId).then(setGap).catch(() => setGap(null));
  }, [opt?.key, fileKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(FIRST_QUESTION); }, [opt?.key]);
  const premium = Boolean(status?.premium);
  const chatReady = Boolean(status?.premium && status.ai);
  const msgs = (opt && chat[opt.key]) || [];

  const pick = (role: string) => { target.current = role; setError(''); fileRef.current?.click(); };
  const upload = async (file: File) => {
    const role = target.current; // '' = main resume
    if (file.size > MAX_KB * 1024) { setError(`${file.name} is ${kb(file.size)}: the limit is ${MAX_KB} KB. Save it as a smaller PDF and try again.`); return; }
    if (!/\.(pdf|docx)$/i.test(file.name)) { setError('Use a PDF or DOCX file.'); return; }
    setBusy(role || 'main');
    try {
      if (role) { const r = await api.uploadRoleResume(v.id, role, file); setData({ ...data, viewer: { ...v, documents: { ...(v.documents || {}), roleResumes: { ...perRole, [role]: r.resume } } } }); }
      else { const r = await api.uploadResume(v.id, file); setData({ ...data, viewer: { ...v, completeness: r.completeness, documents: { ...(v.documents || {}), resume: r.resume } } }); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removeRole = async (role: string) => {
    setBusy(role);
    try { await api.deleteRoleResume(v.id, role); const next = { ...perRole }; delete next[role]; setData({ ...data, viewer: { ...v, documents: { ...(v.documents || {}), roleResumes: next } } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove it'); } finally { setBusy(''); }
  };
  const askAi = async () => {
    if (!chatReady) { if (premium) navigate('assistant'); else setPremiumInfo(true); return; }
    const q = draft.trim(); if (!q || !opt) return;
    const key = opt.key; const history = chat[key] || [];
    setChat((c) => ({ ...c, [key]: [...history, { role: 'user', content: q }] })); setDraft(''); setAsking(true);
    try { const r = await api.resumeGap(v.id, opt.role, q, history, opt.jobId); setChat((c) => ({ ...c, [key]: [...(c[key] || []), { role: 'assistant', content: r.answer }] })); }
    catch (e) { setChat((c) => ({ ...c, [key]: [...(c[key] || []), { role: 'assistant', content: e instanceof Error ? e.message : 'The AI did not answer' }] })); }
    finally { setAsking(false); }
  };

  const g = gap;
  return <div className="page rs-page">
    <div className="page-title"><div><span className="overline">Documents</span><h1>My Resume</h1>
      <p>The resume recruiters get, and how it fits each role. PDF or DOCX, up to {MAX_KB} KB.</p></div></div>
    {error && <p className="auth-error">{error}</p>}
    <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />

    {/* 1. The active resume + 2. the role dropdown. */}
    <section className="rs-card rs-top">
      <div className="rs-top-row">
        <div className="rs-top-file">
          <span className="overline">Active resume{own ? ' · for this role' : ''}</span>
          {active ? <div className="rs-file"><FileText size={18} /><span><b>{active.originalName}</b><small>{kb(active.size)} · uploaded {when(active.uploadedAt)}</small></span>
            <a className="secondary-button small" href={own ? api.roleResumeUrl(v.id, opt!.role) : `${apiBase}${(active as ResumeMeta).url}`} target="_blank" rel="noopener noreferrer"><Download size={13} /> Download</a></div>
            : <div className="rs-file empty"><FileText size={18} /><span><b>No resume yet</b><small>PDF or DOCX, up to {MAX_KB} KB</small></span></div>}
          <div className="rs-actions">
            <button type="button" className="primary-button small" disabled={busy === 'main'} onClick={() => pick('')}>{busy === 'main' ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {main ? 'Replace my resume' : 'Upload my resume'}</button>
            {/* Up to 3 resumes, one per role: role 1 uses the main resume; roles 2 and 3 can have their own. */}
            {opt?.target && roles.indexOf(opt.role) > 0 && (premium
              ? <><button type="button" className="secondary-button small" disabled={busy === opt.role} onClick={() => pick(opt.role)}><Upload size={13} /> {own ? 'Replace for this role' : 'Own resume for this role'}</button>
                {own && <button type="button" className="text-button" onClick={() => void removeRole(opt.role)}><Trash2 size={13} /> Use main resume</button>}</>
              : <button type="button" className="secondary-button small rs-locked" onClick={() => setPremiumInfo(true)}><Lock size={13} /> Up to 3 resumes · Premium</button>)}
          </div>
        </div>
        <label className="rs-role-pick">
          <span className="overline">Role</span>
          {options.length
            ? <select value={opt?.key} onChange={(e) => setSel(e.target.value)} aria-label="Role to compare with my resume">
              {options.some((o) => o.target) && <optgroup label="My target roles">{options.filter((o) => o.target).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>}
              {options.some((o) => !o.target) && <optgroup label="Jobs I applied to">{options.filter((o) => !o.target).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>}
            </select>
            : <small className="rs-muted">Add your target roles in <button type="button" className="text-button" onClick={() => navigate('home')}>My search settings</button>.</small>}
          <small className="rs-muted">{roles.length} target {roles.length === 1 ? 'role' : 'roles'} · {(data.applied || []).length} jobs applied to</small>
        </label>
      </div>
    </section>

    {/* 3. Resume vs role gap analysis (our own script, free). */}
    {opt && <section className="rs-card rs-gap">
      <div className="rs-gap-head"><Sparkles size={15} /> <b>Resume vs role gap analysis</b>{g && g !== 'loading' && typeof g.score === 'number' && <span className={`rs-score ${g.score >= 70 ? 'hi' : g.score >= 40 ? 'mid' : 'lo'}`}>{g.score}% match</span>}</div>
      {g === 'loading' ? <small className="rs-muted"><Loader2 size={12} className="spin" /> Comparing your resume with {opt.label}…</small>
        : !g ? <small className="rs-muted">The analysis is not available right now.</small>
          : g.noResume ? <small className="rs-muted">Upload a resume to see how it fits this role.</small>
            : g.noText ? <small className="rs-muted">We could not read the text of this resume: upload a text-based PDF or a DOCX file.</small>
              : <>
                <small className="rs-muted">{g.forJob ? 'Based on the skills this job asks for.' : g.jobs ? `Based on the skills ${g.jobs} open ${g.broad ? 'similar' : `"${opt.role}"`} roles on JobsMatchNow ask for.` : 'No open role like this on JobsMatchNow yet: tips only.'}</small>
                {!!g.matched?.length && <div className="rs-chips"><span className="rs-chip-label">In your resume</span>{g.matched.map((s) => <i key={s} className="ok"><Check size={11} /> {s}</i>)}</div>}
                {!!g.missing?.length && <div className="rs-chips"><span className="rs-chip-label">Missing</span>{g.missing.slice(0, 10).map((s) => <i key={s} className="no"><X size={11} /> {s}</i>)}</div>}
                {!!g.tips?.length && <ul className="rs-tips">{g.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
              </>}
    </section>}

    {/* 4. AI gap analysis: the first question already typed; "Ask AI" asks your chatbot or opens Premium options. */}
    {opt && <section className={chatReady ? 'rs-card rs-chat' : 'rs-card rs-chat locked'}>
      <div className="rs-chat-head"><Bot size={15} /> <b>Gap analysis by AI</b><small>{chatReady ? 'Your own chatbot reads this resume and the role' : 'Premium · your own Claude or ChatGPT'}</small></div>
      <div className="rs-chat-log">
        {msgs.map((m, i) => <p key={i} className={m.role}>{m.content}</p>)}
        {!msgs.length && !chatReady && <>
          <p className="user">{FIRST_QUESTION}</p>
          {/* Mockup of the answer (blurred) until Premium + the member's chatbot are on. */}
          <div className="rs-mock">
            <p className="assistant rs-blur">Fit score: 72/100 for {opt.role}. Strong match: your recent work covers most of what this role asks for. Main gaps: two required tools are not on your resume, and your results have no numbers. Top edits: 1) add the missing tools you have used, 2) put numbers on your last two roles, 3) rewrite your summary around this role…</p>
            <span className="rs-mock-lock"><Lock size={13} /> Ask AI to see your real answer</span>
          </div>
        </>}
        {asking && <p className="assistant"><Loader2 size={12} className="spin" /> Thinking…</p>}
      </div>
      <form className="rs-chat-input" onSubmit={(e) => { e.preventDefault(); void askAi(); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about this resume and role…" disabled={asking} maxLength={600} aria-label="Question for the AI" />
        <button type="submit" className="primary-button small" disabled={asking || (chatReady && !draft.trim())}>{chatReady ? <><Send size={13} /> Ask AI</> : <><Crown size={13} /> Ask AI</>}</button>
      </form>
    </section>}

    {/* Premium option details ("Ask AI" / "One resume per role" without Premium). */}
    {premiumInfo && <div className="modal-scrim" onClick={() => setPremiumInfo(false)}>
      <div className="ai-setup rs-premium" role="dialog" aria-modal="true" aria-label="Premium options" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fm-x" aria-label="Close" onClick={() => setPremiumInfo(false)}><X size={18} /></button>
        <h2><Crown size={22} /> Premium options</h2>
        <ul className="rs-premium-list">
          <li><Check size={14} /> <b>3 roles, 3 resumes:</b> up to 3 target roles, with one resume per role</li>
          <li><Check size={14} /> <b>AI gap analysis:</b> ask your own Claude or ChatGPT about your resume and each role</li>
          <li><Check size={14} /> A fit score and the most useful edits for every role and job you apply to</li>
          <li><Check size={14} /> 10 direct messages a month to recruiters</li>
        </ul>
        <p className="rs-muted">Free 7-day trial. The resume gap analysis above stays free.</p>
        <button type="button" className="fm-black" onClick={() => { setPremiumInfo(false); navigate('billing'); }}>See Premium options and start the trial</button>
      </div>
    </div>}
  </div>;
}
