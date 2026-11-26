// "Verified account" (optional, during sign-up / profile setup) — PREVIEW of an AI ID check.
// The member picks a document type and adds photos (or PDFs) of the FRONT and the BACK of their ID card / driving
// licence (passport: the photo page). Several photos per side are allowed; a side passes when one of them is readable
// (founder, 2026-11-26: the old single-photo, 600 × 380 px rule was too strict).
// Privacy first: the files NEVER leave the device. The preview checks real file properties in the browser
// (type, size, image resolution); the identity checks (photo on the document, name, expiry) are simulated
// and labelled as such. Only the outcome (document type + date) is saved to the profile.
import { useState } from 'react';
import { BadgeCheck, Check, IdCard, Loader2, Lock, ShieldCheck, X } from 'lucide-react';
import { api } from '../../api';
import type { Person } from '../../types';

type DocType = 'id-card' | 'passport' | 'driving-licence';
const DOC_LABEL: Record<DocType, string> = { 'id-card': 'ID card', passport: 'Passport', 'driving-licence': 'Driving licence' };
type Side = 'front' | 'back';
const SIDES: Record<DocType, { side: Side; label: string; required: boolean }[]> = {
  'id-card': [{ side: 'front', label: 'Front', required: true }, { side: 'back', label: 'Back', required: true }],
  'driving-licence': [{ side: 'front', label: 'Front', required: true }, { side: 'back', label: 'Back', required: false }],
  passport: [{ side: 'front', label: 'Photo page', required: true }],
};
type Step = { label: string; ok: boolean; simulated?: boolean };
type FileResult = { name: string; ok: boolean; why?: string };

function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/**
 * Checks done on the real file (nothing uploaded). Exported for tests. Relaxed (2026-11-26): any photo or PDF,
 * 8 KB – 20 MB, and at least 480 × 300 px when the browser can read the image (HEIC photos it can't decode pass).
 */
export function fileChecks(file: { type: string; size: number }, dims: { w: number; h: number } | null): Step[] {
  const isImage = file.type.startsWith('image/') || /\.(heic|heif)$/i.test((file as { name?: string }).name || ''); const isPdf = file.type === 'application/pdf';
  return [
    { label: 'File is a photo or PDF of a document', ok: isImage || isPdf },
    { label: 'File size looks like a photo or scan (8 KB – 20 MB)', ok: file.size >= 8 * 1024 && file.size <= 20 * 1024 * 1024 },
    { label: isImage ? 'Photo is large enough to read (at least 480 × 300 px)' : 'PDF accepted', ok: isPdf || !dims || (Math.max(dims.w, dims.h) >= 480 && Math.min(dims.w, dims.h) >= 300) },
  ];
}

export function IdVerification({ viewer, onSaved }: { viewer: Person; onSaved: (v: Person) => void }) {
  const [docType, setDocTypeState] = useState<DocType>('id-card');
  const [files, setFiles] = useState<Record<Side, FileResult[]>>({ front: [], back: [] });
  const [steps, setSteps] = useState<Step[]>([]);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'passed' | 'failed'>(viewer.idVerification ? 'passed' : 'idle');
  const [reading, setReading] = useState<Side | ''>('');
  const [error, setError] = useState('');
  const sides = SIDES[docType];
  const setDocType = (d: DocType) => { setDocTypeState(d); setFiles({ front: [], back: [] }); setSteps([]); setPhase('idle'); };
  const sideOk = (s: Side) => files[s].some((f) => f.ok);
  const ready = sides.every((s) => !s.required || sideOk(s.side));

  /** Add one or several photos to a side; each is checked on the device. */
  const addFiles = async (side: Side, list: FileList | null) => {
    if (!list?.length) return;
    setReading(side); setError(''); if (phase === 'failed') setPhase('idle');
    const results: FileResult[] = [];
    for (const file of Array.from(list).slice(0, 6)) {
      const checks = fileChecks(file, await imageSize(file));
      const bad = checks.find((c) => !c.ok);
      results.push({ name: file.name || 'photo', ok: !bad, why: bad?.label });
    }
    setFiles((prev) => ({ ...prev, [side]: [...prev[side], ...results].slice(-6) }));
    setReading('');
  };
  const removeFile = (side: Side, i: number) => setFiles((prev) => ({ ...prev, [side]: prev[side].filter((_, k) => k !== i) }));

  const check = async () => {
    if (!ready) return;
    setPhase('checking'); setError(''); setSteps([]);
    const real: Step[] = sides.map((s) => ({ label: `${s.label}: readable photo${files[s.side].length > 1 ? ` (${files[s.side].filter((f) => f.ok).length} of ${files[s.side].length})` : ''}`, ok: !s.required || sideOk(s.side) }));
    const simulated: Step[] = [
      { label: `Looks like a ${DOC_LABEL[docType].toLowerCase()}`, ok: true, simulated: true },
      { label: 'Face photo found on the document', ok: true, simulated: true },
      { label: `Name matches your profile (${viewer.name})`, ok: true, simulated: true },
      { label: 'Document is not expired', ok: true, simulated: true },
    ];
    const all = [...real, ...simulated];
    for (let i = 0; i < all.length; i += 1) { await new Promise((r) => setTimeout(r, 320)); setSteps(all.slice(0, i + 1)); if (!all[i].ok) break; }
    if (real.some((s) => !s.ok)) { setPhase('failed'); return; }
    try {
      const { user } = await api.updateProfile(viewer.id, { idVerification: { docType } } as Partial<Person>);
      onSaved({ ...viewer, idVerification: user.idVerification });
      setPhase('passed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); setPhase('failed'); }
  };
  const remove = async () => {
    try { await api.updateProfile(viewer.id, { idVerification: null } as unknown as Partial<Person>); onSaved({ ...viewer, idVerification: undefined }); setPhase('idle'); setSteps([]); setFiles({ front: [], back: [] }); }
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
        <div className={`idv-sides n${sides.length}`}>
          {sides.map((s) => <div key={s.side} className="idv-side">
            <span className="idv-side-label">{s.label}{s.required ? '' : ' (optional)'}{sideOk(s.side) && <Check size={13} />}</span>
            <label className={reading === s.side ? 'idv-drop busy' : 'idv-drop'}>
              <input type="file" accept="image/*,application/pdf,.heic,.heif" multiple hidden disabled={phase === 'checking'} onChange={(e) => { void addFiles(s.side, e.target.files); e.target.value = ''; }} aria-label={`Add photos of the ${s.label.toLowerCase()}`} />
              {reading === s.side ? <><Loader2 size={15} className="spin" /> Reading…</> : <><IdCard size={15} /> {files[s.side].length ? 'Add more photos' : `Add photo(s) of the ${s.label.toLowerCase()}`}</>}
            </label>
            {files[s.side].length > 0 && <ul className="idv-files">{files[s.side].map((f, i) => <li key={`${f.name}-${i}`} className={f.ok ? 'ok' : 'bad'}>
              {f.ok ? <Check size={12} /> : <X size={12} />} <span>{f.name}</span>{!f.ok && f.why && <em>{f.why}</em>}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(s.side, i)}><X size={11} /></button></li>)}</ul>}
          </div>)}
        </div>
        <button type="button" className="primary-button small idv-check" disabled={!ready || phase === 'checking'} onClick={() => void check()}>
          {phase === 'checking' ? <><Loader2 size={14} className="spin" /> Checking…</> : 'Check my document'}</button>
        {!ready && <p className="idv-hint">Add a readable photo of {sides.filter((s) => s.required && !sideOk(s.side)).map((s) => `the ${s.label.toLowerCase()}`).join(' and ')} to continue.</p>}
      </>}
    {steps.length > 0 && phase !== 'passed' && <ul className="idv-steps">{steps.map((s, i) => <li key={i} className={s.ok ? 'ok' : 'bad'}>{s.ok ? <Check size={13} /> : <X size={13} />} {s.label}{s.simulated && <em>simulated</em>}</li>)}</ul>}
    {phase === 'failed' && <p className="idv-fail">The check did not pass. Add another photo of the side marked ✗ (whole document in the frame, good light).</p>}
    {error && <p className="cb-err">{error}</p>}
    <p className="idv-privacy"><Lock size={11} /> Your photos never leave your device: only “ID checked”, the document type and the date are saved. This is a preview — the identity checks are simulated until a certified ID provider is connected.</p>
  </div>;
}
