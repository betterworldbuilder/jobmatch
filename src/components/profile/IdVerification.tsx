// "Verified account" (optional, during sign-up / profile setup) — PREVIEW of an AI ID check.
// The member picks a document type and chooses a photo or PDF of their ID card, passport or driving licence.
// Privacy first: the file NEVER leaves the device. The preview checks real file properties in the browser
// (type, size, image resolution); the identity checks (photo on the document, name, expiry) are simulated
// and labelled as such. Only the outcome (document type + date) is saved to the profile.
import { useState } from 'react';
import { BadgeCheck, Check, IdCard, Loader2, Lock, ShieldCheck, X } from 'lucide-react';
import { api } from '../../api';
import type { Person } from '../../types';

type DocType = 'id-card' | 'passport' | 'driving-licence';
const DOC_LABEL: Record<DocType, string> = { 'id-card': 'ID card', passport: 'Passport', 'driving-licence': 'Driving licence' };
type Step = { label: string; ok: boolean; simulated?: boolean };

function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Checks done on the real file (nothing uploaded). Exported for tests. */
export function fileChecks(file: { type: string; size: number }, dims: { w: number; h: number } | null): Step[] {
  const isImage = file.type.startsWith('image/'); const isPdf = file.type === 'application/pdf';
  return [
    { label: 'File is a photo or PDF of a document', ok: isImage || isPdf },
    { label: 'File size looks like a real scan (20 KB – 10 MB)', ok: file.size >= 20 * 1024 && file.size <= 10 * 1024 * 1024 },
    { label: isImage ? 'Image is sharp enough to read (at least 600 × 380 px)' : 'PDF accepted', ok: isPdf || Boolean(dims && Math.max(dims.w, dims.h) >= 600 && Math.min(dims.w, dims.h) >= 380) },
  ];
}

export function IdVerification({ viewer, onSaved }: { viewer: Person; onSaved: (v: Person) => void }) {
  const [docType, setDocType] = useState<DocType>('id-card');
  const [steps, setSteps] = useState<Step[]>([]);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'passed' | 'failed'>(viewer.idVerification ? 'passed' : 'idle');
  const [error, setError] = useState('');
  const check = async (file: File) => {
    setPhase('checking'); setError(''); setSteps([]);
    const dims = await imageSize(file);
    const real = fileChecks(file, dims);
    const simulated: Step[] = [
      { label: `Looks like a ${DOC_LABEL[docType].toLowerCase()}`, ok: true, simulated: true },
      { label: 'Face photo found on the document', ok: true, simulated: true },
      { label: `Name matches your profile (${viewer.name})`, ok: true, simulated: true },
      { label: 'Document is not expired', ok: true, simulated: true },
    ];
    const all = [...real, ...simulated];
    for (let i = 0; i < all.length; i += 1) { await new Promise((r) => setTimeout(r, 380)); setSteps(all.slice(0, i + 1)); if (!all[i].ok) break; }
    if (real.some((s) => !s.ok)) { setPhase('failed'); return; }
    try {
      const { user } = await api.updateProfile(viewer.id, { idVerification: { docType } } as Partial<Person>);
      onSaved({ ...viewer, idVerification: user.idVerification });
      setPhase('passed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); setPhase('failed'); }
  };
  const remove = async () => {
    try { await api.updateProfile(viewer.id, { idVerification: null } as unknown as Partial<Person>); onSaved({ ...viewer, idVerification: undefined }); setPhase('idle'); setSteps([]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove'); }
  };
  return <div className="idv">
    <header><span className="idv-icon"><ShieldCheck size={18} /></span><div><strong>Verified account <em>optional</em></strong>
      <small>Add an ID card, passport or driving licence. An AI check (preview) confirms it and your profile shows <b>ID checked</b>.</small></div></header>
    {phase === 'passed' && viewer.idVerification
      ? <div className="idv-done"><BadgeCheck size={18} /> <span><b>ID checked (preview)</b> with your {DOC_LABEL[viewer.idVerification.docType].toLowerCase()} on {new Date(viewer.idVerification.checkedAt).toLocaleDateString()}.</span><button type="button" className="text-button" onClick={() => void remove()}>Remove</button></div>
      : <>
        <div className="idv-types" role="radiogroup" aria-label="Document type">
          {(Object.keys(DOC_LABEL) as DocType[]).map((d) => <button key={d} type="button" className={docType === d ? 'on' : ''} aria-pressed={docType === d} onClick={() => setDocType(d)}><IdCard size={14} /> {DOC_LABEL[d]}</button>)}
        </div>
        <label className={phase === 'checking' ? 'idv-drop busy' : 'idv-drop'}>
          <input type="file" accept="image/*,application/pdf" hidden disabled={phase === 'checking'} onChange={(e) => { const f = e.target.files?.[0]; if (f) void check(f); e.target.value = ''; }} aria-label="Choose your ID document" />
          {phase === 'checking' ? <><Loader2 size={16} className="spin" /> Checking your document…</> : <><IdCard size={16} /> Choose a photo or PDF of your {DOC_LABEL[docType].toLowerCase()}</>}
        </label>
      </>}
    {steps.length > 0 && phase !== 'passed' && <ul className="idv-steps">{steps.map((s, i) => <li key={i} className={s.ok ? 'ok' : 'bad'}>{s.ok ? <Check size={13} /> : <X size={13} />} {s.label}{s.simulated && <em>simulated</em>}</li>)}</ul>}
    {phase === 'failed' && <p className="idv-fail">The check did not pass. Try a clear, well-lit photo of the whole document.</p>}
    {error && <p className="cb-err">{error}</p>}
    <p className="idv-privacy"><Lock size={11} /> Your document never leaves your device: only “ID checked”, the document type and the date are saved. This is a preview — the identity checks are simulated until a certified ID provider is connected.</p>
  </div>;
}
