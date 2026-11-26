// My Resume (founder, 2026-11-26): one card per target role, in the order of the target roles. Role 1 holds the main
// resume (free plan: 1 resume, used for every role, replace it any time). Premium (multi-role): one resume per role.
// Each role: our own resume vs role gap analysis (free, no AI) + a chat box with the member's own AI chatbot
// (Premium + "Use My ChatBot"); without them the chat box shows "Activate", opening the Premium options.
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Crown, Download, FileText, Loader2, Lock, Send, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { Bootstrap, ResumeMeta, View } from '../../types';

const MAX_KB = 500;
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
const when = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
type Gap = Awaited<ReturnType<typeof api.resumeGapBasic>>;
type Msg = { role: 'user' | 'assistant'; content: string };

export function ResumePage({ data, setData, navigate }: { data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void }) {
  const v = data.viewer;
  const roles = (v.preferences?.desiredRoles || []).filter(Boolean);
  const list = roles.length ? roles : [''];
  const main = v.documents?.resume;
  const perRole = v.documents?.roleResumes || {};
  const [status, setStatus] = useState<{ premium: boolean; ai: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [gaps, setGaps] = useState<Record<string, Gap | 'loading'>>({});
  const [chats, setChats] = useState<Record<string, Msg[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState('');
  const [premiumInfo, setPremiumInfo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<string>('');
  const fileKey = `${main?.id || ''}|${Object.values(perRole).map((r) => r.id).join(',')}`;

  useEffect(() => { api.aiChatStatus().then((s) => setStatus({ premium: Boolean(s.premium?.active), ai: Boolean(s.enabled) })).catch(() => setStatus({ premium: false, ai: false })); }, []);
  // Our own gap analysis runs by itself for every role (free, instant), again after an upload.
  useEffect(() => {
    for (const role of roles) {
      setGaps((g) => ({ ...g, [role]: 'loading' }));
      api.resumeGapBasic(v.id, role).then((r) => setGaps((g) => ({ ...g, [role]: r }))).catch(() => setGaps((g) => { const n = { ...g }; delete n[role]; return n; }));
    }
  }, [fileKey, roles.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const premium = Boolean(status?.premium);
  const chatReady = Boolean(status?.premium && status.ai);

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
  const ask = async (role: string) => {
    const q = (drafts[role] || '').trim(); if (!q) return;
    const history = chats[role] || [];
    setChats((c) => ({ ...c, [role]: [...history, { role: 'user', content: q }] })); setDrafts((d) => ({ ...d, [role]: '' })); setAsking(role);
    try { const r = await api.resumeGap(v.id, role, q, history); setChats((c) => ({ ...c, [role]: [...(c[role] || []), { role: 'assistant', content: r.answer }] })); }
    catch (e) { setChats((c) => ({ ...c, [role]: [...(c[role] || []), { role: 'assistant', content: e instanceof Error ? e.message : 'The AI did not answer' }] })); }
    finally { setAsking(''); }
  };

  const fileRow = (r: ResumeMeta | undefined, href: string | undefined, note: string) => r
    ? <div className="rs-file"><FileText size={18} /><span><b>{r.originalName}</b><small>{kb(r.size)} · uploaded {when(r.uploadedAt)}{note ? ` · ${note}` : ''}</small></span>
      {href && <a className="secondary-button small" href={href} target="_blank" rel="noopener noreferrer"><Download size={13} /> Download</a>}</div>
    : <div className="rs-file empty"><FileText size={18} /><span><b>No resume yet</b><small>PDF or DOCX, up to {MAX_KB} KB</small></span></div>;

  const gapBlock = (role: string) => {
    const g = gaps[role];
    return <div className="rs-gap">
      <div className="rs-gap-head"><Sparkles size={15} /> <b>Resume vs role gap analysis</b>{g && g !== 'loading' && typeof g.score === 'number' && <span className={`rs-score ${g.score >= 70 ? 'hi' : g.score >= 40 ? 'mid' : 'lo'}`}>{g.score}% match</span>}</div>
      {g === 'loading' ? <small className="rs-muted"><Loader2 size={12} className="spin" /> Comparing your resume with this role…</small>
        : !g ? <small className="rs-muted">The analysis is not available right now.</small>
          : g.noResume ? <small className="rs-muted">Upload a resume to see how it fits this role.</small>
            : g.noText ? <small className="rs-muted">We could not read the text of this resume: upload a text-based PDF or a DOCX file.</small>
              : <>
                <small className="rs-muted">{g.jobs ? `Based on the skills ${g.jobs} open ${g.broad ? 'similar' : `"${role}"`} roles on JobsMatchNow ask for.` : 'No open role like this on JobsMatchNow yet: tips only.'}</small>
                {!!g.matched?.length && <div className="rs-chips"><span className="rs-chip-label">In your resume</span>{g.matched.map((s) => <i key={s} className="ok"><Check size={11} /> {s}</i>)}</div>}
                {!!g.missing?.length && <div className="rs-chips"><span className="rs-chip-label">Missing</span>{g.missing.slice(0, 10).map((s) => <i key={s} className="no"><X size={11} /> {s}</i>)}</div>}
                {!!g.tips?.length && <ul className="rs-tips">{g.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
              </>}
    </div>;
  };

  // Ready-to-use chat box: works with Premium + the member's own AI chatbot; otherwise "Activate".
  const chatBox = (role: string) => <div className={chatReady ? 'rs-chat' : 'rs-chat locked'}>
    <div className="rs-chat-head"><Bot size={15} /> <b>Ask your AI about this resume</b><small>{chatReady ? 'Your own chatbot, reading this resume and the role' : 'Premium · your own Claude or ChatGPT'}</small></div>
    <div className="rs-chat-log">{(chats[role] || []).length
      ? (chats[role] || []).map((m, i) => <p key={i} className={m.role}>{m.content}</p>)
      : <p className="hint">{['Rewrite my summary for this role', 'Which projects should I put first?', 'What keywords am I missing?'].map((s) => <button key={s} type="button" disabled={!chatReady} onClick={() => setDrafts((d) => ({ ...d, [role]: s }))}>{s}</button>)}</p>}
      {asking === role && <p className="assistant"><Loader2 size={12} className="spin" /> Thinking…</p>}
    </div>
    <form className="rs-chat-input" onSubmit={(e) => { e.preventDefault(); if (chatReady) void ask(role); }}>
      <input value={drafts[role] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [role]: e.target.value }))} placeholder={chatReady ? 'Ask about this resume and role…' : premium ? 'Connect your own chatbot to chat about this resume' : 'Activate Premium to chat with your AI about this resume'} disabled={!chatReady || asking === role} maxLength={600} aria-label="Ask your AI about this resume" />
      {chatReady
        ? <button type="submit" className="primary-button small" disabled={asking === role || !(drafts[role] || '').trim()}><Send size={13} /> Send</button>
        : <button type="button" className="primary-button small" onClick={() => (premium ? navigate('assistant') : setPremiumInfo(true))}>{premium ? <><Bot size={13} /> Connect my chatbot</> : <><Crown size={13} /> Activate</>}</button>}
    </form>
  </div>;

  return <div className="page rs-page">
    <div className="page-title"><div><span className="overline">Documents</span><h1>My Resume</h1>
      <p>The resume recruiters get for each role you target. PDF or DOCX, up to {MAX_KB} KB.</p></div></div>
    {error && <p className="auth-error">{error}</p>}
    <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />

    {list.map((role, i) => {
      const own = role ? perRole[role] : undefined;
      const first = i === 0;
      return <section className="rs-card" key={role || 'main'}>
        <header><div><span className="overline">{role ? `Target role ${i + 1}${first ? ' · main resume' : ''}` : 'Your resume'}</span><h2>{role || 'Used for every role'}</h2></div>
          <span className="rs-actions">
            {first
              ? <button type="button" className="primary-button small" disabled={busy === 'main'} onClick={() => pick('')}>{busy === 'main' ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {main ? 'Replace' : 'Upload'}</button>
              : premium
                ? <><button type="button" className="secondary-button small" disabled={busy === role} onClick={() => pick(role)}>{busy === role ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {own ? 'Replace for this role' : 'Own resume for this role'}</button>
                  {own && <button type="button" className="text-button" disabled={busy === role} onClick={() => void removeRole(role)}><Trash2 size={13} /> Use main resume</button>}</>
                : <button type="button" className="secondary-button small rs-locked" onClick={() => setPremiumInfo(true)}><Lock size={13} /> Own resume for this role · Premium</button>}
          </span></header>
        {own ? fileRow(own, api.roleResumeUrl(v.id, role), 'for this role') : fileRow(main, main ? `${apiBase}${main.url}` : undefined, first ? '' : main ? 'main resume' : '')}
        {role && gapBlock(role)}
        {role && chatBox(role)}
      </section>;
    })}
    {roles.length === 0 && <p className="rs-muted">Add your target roles in <button type="button" className="text-button" onClick={() => navigate('home')}>My search settings</button> to see the gap analysis for each role.</p>}

    {/* Premium option details (the "Activate" buttons). */}
    {premiumInfo && <div className="modal-scrim" onClick={() => setPremiumInfo(false)}>
      <div className="ai-setup rs-premium" role="dialog" aria-modal="true" aria-label="Premium options" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fm-x" aria-label="Close" onClick={() => setPremiumInfo(false)}><X size={18} /></button>
        <h2><Crown size={22} /> Premium options</h2>
        <ul className="rs-premium-list">
          <li><Check size={14} /> <b>Multi-role:</b> up to 3 target roles, each with its own resume and matches</li>
          <li><Check size={14} /> <b>AI resume chat:</b> ask your own Claude or ChatGPT about each resume and role</li>
          <li><Check size={14} /> <b>AI gap analysis</b> with a fit score and the 5 most useful edits per role</li>
          <li><Check size={14} /> 10 direct messages a month to recruiters</li>
        </ul>
        <p className="rs-muted">Free 7-day trial. The resume gap analysis above stays free.</p>
        <button type="button" className="fm-black" onClick={() => { setPremiumInfo(false); navigate('billing'); }}>See Premium options and start the trial</button>
      </div>
    </div>}
  </div>;
}
