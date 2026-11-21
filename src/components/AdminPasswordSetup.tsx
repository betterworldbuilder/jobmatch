// One-time admin password setup, opened from a link created on the server (?admin-reset=<token>).
import { useState } from 'react';
import { Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';

export function AdminPasswordSetup({ token, onClose, onSignIn }: { token: string; onClose: () => void; onSignIn: (email: string) => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneEmail, setDoneEmail] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 12) { setError('Use at least 12 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords are not the same.'); return; }
    setBusy(true); setError('');
    try { const r = await api.adminPasswordReset(token, pw); setDoneEmail(r.email); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not set the password'); }
    finally { setBusy(false); }
  };
  return <div className="modal-scrim">
    <div className="ai-setup" role="dialog" aria-modal="true" aria-label="Set admin password">
      <button type="button" className="fm-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      <h2><ShieldCheck size={22} /> Set your admin password</h2>
      {doneEmail ? <>
        <p className="tp-thanks"><Check size={16} /> Password set for {doneEmail}.</p>
        <button type="button" className="fm-black" onClick={() => onSignIn(doneEmail)}>Sign in now</button>
      </> : <form onSubmit={(e) => void submit(e)} className="aps-form">
        <p>This link works once and expires 30 minutes after it was created. Choose a strong password (12+ characters).</p>
        <label className="int-field"><span>New password</span><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label className="int-field"><span>Repeat password</span><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="fm-black" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : 'Save password'}</button>
      </form>}
    </div>
  </div>;
}
