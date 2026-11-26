// My Resume (founder, 2026-11-26): the resume used for each target role, sorted like the target roles. Free plan: one
// resume (500 KB max) used for every role, replaceable any time. Premium (multi-role): one resume per target role.
// "Resume vs role" gap analysis through the member's own AI chatbot (Premium + "Use My ChatBot" connected).
import { useEffect, useRef, useState } from 'react';
import { Bot, Crown, Download, FileText, Loader2, Lock, Sparkles, Trash2, Upload } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { Bootstrap, ResumeMeta, View } from '../../types';

const MAX_KB = 500;
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
const when = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function ResumePage({ data, setData, navigate }: { data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void }) {
  const v = data.viewer;
  const roles = (v.preferences?.desiredRoles || []).filter(Boolean);
  const main = v.documents?.resume;
  const perRole = v.documents?.roleResumes || {};
  const [status, setStatus] = useState<{ premium: boolean; ai: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [gap, setGap] = useState<Record<string, { text?: string; error?: string; busy?: boolean }>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<string>('');

  useEffect(() => { api.aiChatStatus().then((s) => setStatus({ premium: Boolean(s.premium?.active), ai: Boolean(s.enabled) })).catch(() => setStatus({ premium: false, ai: false })); }, []);
  const premium = Boolean(status?.premium);

  const pick = (role: string) => { target.current = role; setError(''); fileRef.current?.click(); };
  const upload = async (file: File) => {
    const role = target.current;
    if (file.size > MAX_KB * 1024) { setError(`${file.name} is ${kb(file.size)}: the limit is ${MAX_KB} KB. Save it as a smaller PDF and try again.`); return; }
    if (!/\.(pdf|docx)$/i.test(file.name)) { setError('Use a PDF or DOCX file.'); return; }
    setBusy(role || 'main');
    try {
      if (role) {
        const r = await api.uploadRoleResume(v.id, role, file);
        setData({ ...data, viewer: { ...v, documents: { ...(v.documents || {}), roleResumes: { ...perRole, [role]: r.resume } } } });
      } else {
        const r = await api.uploadResume(v.id, file);
        setData({ ...data, viewer: { ...v, completeness: r.completeness, documents: { ...(v.documents || {}), resume: r.resume } } });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removeRole = async (role: string) => {
    setBusy(role);
    try { await api.deleteRoleResume(v.id, role); const next = { ...perRole }; delete next[role]; setData({ ...data, viewer: { ...v, documents: { ...(v.documents || {}), roleResumes: next } } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove it'); } finally { setBusy(''); }
  };
  const runGap = async (role: string) => {
    setGap((g) => ({ ...g, [role]: { busy: true } }));
    try { const r = await api.resumeGap(v.id, role); setGap((g) => ({ ...g, [role]: { text: r.answer } })); }
    catch (e) { setGap((g) => ({ ...g, [role]: { error: e instanceof Error ? e.message : 'The analysis did not run' } })); }
  };

  const fileRow = (r: ResumeMeta | undefined, href: string | undefined, note: string) => r
    ? <div className="rs-file"><FileText size={18} /><span><b>{r.originalName}</b><small>{kb(r.size)} · uploaded {when(r.uploadedAt)}{note ? ` · ${note}` : ''}</small></span>
      {href && <a className="secondary-button small" href={href} target="_blank" rel="noopener noreferrer"><Download size={13} /> Download</a>}</div>
    : <div className="rs-file empty"><FileText size={18} /><span><b>No resume yet</b><small>PDF or DOCX, up to {MAX_KB} KB</small></span></div>;

  const gapBlock = (role: string) => {
    const g = gap[role];
    return <div className="rs-gap">
      <div className="rs-gap-head"><Sparkles size={15} /> <b>Resume vs role gap analysis</b>
        {status && (!premium || !status.ai)
          ? <button type="button" className="secondary-button small" onClick={() => navigate(premium ? 'assistant' : 'billing')}>{premium ? <><Bot size={13} /> Connect my AI chatbot</> : <><Crown size={13} /> Unlock in Premium options</>}</button>
          : <button type="button" className="primary-button small" disabled={!status || g?.busy || !(perRole[role] || main)} onClick={() => void runGap(role)}>{g?.busy ? <><Loader2 size={13} className="spin" /> Analysing…</> : g?.text ? 'Run again' : 'Analyse with my AI chatbot'}</button>}
      </div>
      {status && !premium && <small className="rs-muted">Uses your own AI chatbot (Claude or ChatGPT), part of Premium: free 7-day trial.</small>}
      {status && premium && !status.ai && <small className="rs-muted">Connect your own Claude or ChatGPT key in "Use My ChatBot" to run it.</small>}
      {g?.error && <p className="auth-error">{g.error}</p>}
      {g?.text && <div className="rs-gap-out">{g.text}</div>}
    </div>;
  };

  const list = roles.length ? roles : [''];
  return <div className="page rs-page">
    <div className="page-title"><div><span className="overline">Documents</span><h1>My Resume</h1>
      <p>The resume recruiters get for each role you target. PDF or DOCX, up to {MAX_KB} KB.</p></div></div>
    <div className="rs-plan">
      {premium ? <span><Crown size={14} /> <b>Premium multi-role:</b> one resume per target role (your main resume is used where you don’t add one).</span>
        : <span><Lock size={14} /> <b>Free plan: 1 resume</b>, used for every target role. Replace it any time. Want one resume per role? <button type="button" className="text-button" onClick={() => navigate('billing')}>Activate multi-role in Premium options</button></span>}
    </div>
    {error && <p className="auth-error">{error}</p>}
    <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />

    {/* Main resume: the one every role uses unless a role has its own (Premium). */}
    <section className="rs-card rs-main">
      <header><div><span className="overline">Main resume</span><h2>{roles.length ? 'Used for all your target roles' : 'Your resume'}</h2></div>
        <button type="button" className="primary-button small" disabled={busy === 'main'} onClick={() => pick('')}>{busy === 'main' ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {main ? 'Replace' : 'Upload'}</button></header>
      {fileRow(main, main ? `${apiBase}${main.url}` : undefined, '')}
    </section>

    {/* One card per target role, in the order of your target roles. */}
    {list.filter(Boolean).map((role, i) => {
      const own = perRole[role];
      return <section className="rs-card" key={role}>
        <header><div><span className="overline">Target role {i + 1}{i === 0 ? ' · main' : ''}</span><h2>{role}</h2></div>
          <span className="rs-actions">
            {premium
              ? <><button type="button" className="secondary-button small" disabled={busy === role} onClick={() => pick(role)}>{busy === role ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {own ? 'Replace for this role' : 'Upload for this role'}</button>
                {own && <button type="button" className="text-button" disabled={busy === role} onClick={() => void removeRole(role)}><Trash2 size={13} /> Use main resume</button>}</>
              : <button type="button" className="secondary-button small rs-locked" onClick={() => navigate('billing')}><Lock size={13} /> Own resume for this role · Premium</button>}
          </span></header>
        {own ? fileRow(own, api.roleResumeUrl(v.id, role), 'for this role') : fileRow(main, main ? `${apiBase}${main.url}` : undefined, main ? 'main resume' : '')}
        {gapBlock(role)}
      </section>;
    })}
    {roles.length === 0 && <p className="rs-muted">Add your target roles in <button type="button" className="text-button" onClick={() => navigate('home')}>My search settings</button> to see which resume each role uses and run the gap analysis.</p>}
  </div>;
}
