import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Ban, BriefcaseBusiness, Check, Download, Linkedin, Loader2, LogIn, Mail, Play, Search, ShieldCheck, Trash2, User, X } from 'lucide-react';
import { api, apiBase } from '../api';
import { featureOn } from '../lib/flags';
import { startTour } from '../lib/tour/runtime';
import { authProviders } from '../lib/auth';
import { COUNTRY_OPTIONS, guessCountryName } from '../lib/countries';
import { ConductModal } from './ConductModal';
import type { AuthConfig, Role, SessionUser } from '../types';

function GoogleMark() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.6 2.8c2.2-2 3.8-5 3.8-8.5z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.6-2.8c-1 .7-2.4 1.2-4.3 1.2-3.3 0-6.1-2.2-7.1-5.2L1.2 17C3.1 21.1 7.2 24 12 24z"/><path fill="#FBBC05" d="M4.9 14.3c-.3-.8-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.2 6.9C.4 8.5 0 10.2 0 12s.4 3.5 1.2 5.1l3.7-2.8z"/><path fill="#EA4335" d="M12 4.6c2.3 0 3.9 1 4.8 1.9l3.2-3.2C18 1.3 15.2 0 12 0 7.2 0 3.1 2.9 1.2 6.9l3.7 2.8c1-3 3.8-5.1 7.1-5.1z"/></svg>;
}

type SsoBusy = 'linkedin' | 'google' | null;

/** "Watch Candidate full tour" · "Watch Recruiter full tour" (founder, 2026-11-24): sign-in window and home page.
 *  Shown only while the `tour` flag is on (preview ?tour=1). */
export function TourButtons({ className = '' }: { className?: string }) {
  if (!featureOn('tour')) return null;
  return <div className={`tour-pick ${className}`} role="group" aria-label="Watch a full tour">
    <button type="button" className="tour-pick-btn cand" onClick={() => startTour('candidate')}>
      <span className="tour-pick-play" aria-hidden="true"><Play size={15} fill="currentColor" /></span>
      <span className="tour-pick-txt"><small>Watch</small><b>Candidate full tour</b></span>
      <em>3 min</em>
    </button>
    <button type="button" className="tour-pick-btn rec" onClick={() => startTour('employer')}>
      <span className="tour-pick-play" aria-hidden="true"><Play size={15} fill="currentColor" /></span>
      <span className="tour-pick-txt"><small>Watch</small><b>Recruiter full tour</b></span>
      <em>3 min</em>
    </button>
  </div>;
}

/** Demo account picker: Candidates / Recruiters tabs, search, a compact scrolling list (phone friendly). */
function DemoPicker({ profiles, selected, onSelect }: { profiles: SessionUser[]; selected: string; onSelect: (id: string) => void }) {
  const [tab, setTab] = useState<'candidate' | 'employer'>('candidate');
  const [q, setQ] = useState('');
  const counts = { candidate: profiles.filter((p) => p.role === 'candidate').length, employer: profiles.filter((p) => p.role !== 'candidate').length };
  const term = q.trim().toLowerCase();
  const list = profiles.filter((p) => (tab === 'candidate' ? p.role === 'candidate' : p.role !== 'candidate'))
    .filter((p) => !term || [p.name, p.title, p.company].filter(Boolean).join(' ').toLowerCase().includes(term));
  const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return <div className="demo-picker">
    <div className="demo-tabs" role="tablist" aria-label="Demo account type">
      {(['candidate', 'employer'] as const).map((r) => <button key={r} type="button" role="tab" aria-selected={tab === r} className={tab === r ? 'on' : ''}
        onClick={() => { setTab(r); const first = profiles.find((p) => (r === 'candidate' ? p.role === 'candidate' : p.role !== 'candidate')); if (first) onSelect(first.id); }}>
        {r === 'candidate' ? <User size={13} /> : <BriefcaseBusiness size={13} />} {r === 'candidate' ? 'Candidates' : 'Recruiters'} <em>{counts[r]}</em>
      </button>)}
    </div>
    <label className="demo-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'candidate' ? 'Search name, role…' : 'Search name, company…'} aria-label="Search demo accounts" /></label>
    <ul className="demo-list" role="listbox" aria-label="Demo profile">
      {list.map((p) => <li key={p.id}>
        <button type="button" role="option" aria-selected={selected === p.id} className={selected === p.id ? 'on' : ''} onClick={() => onSelect(p.id)}>
          <span className="demo-ava">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : initials(p.name)}</span>
          <span className="demo-txt"><b>{p.name}</b><small>{[p.title, p.company].filter(Boolean).join(' · ')}</small></span>
          {selected === p.id && <Check size={15} className="demo-check" />}
        </button>
      </li>)}
      {!list.length && <li className="demo-empty">No demo account matches “{q}”.</li>}
    </ul>
  </div>;
}

// Google/LinkedIn block OAuth inside embedded webviews, so inside the native
// app wrapper we hide SSO and steer users to email/demo (which work fine).
// Detect both the Expo wrapper (UA marker) and Capacitor (runtime bridge).
function detectNativeWebview() {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return true;
  return /JobsMatchNowExpo|Median/i.test(navigator.userAgent || '');
}
const isNativeWebview = detectNativeWebview();

// One shared request for the demo accounts, started early (landing page load) and reused by the login window.
let demoProfilesPromise: Promise<SessionUser[]> | null = null;
export function prefetchDemoProfiles(): Promise<SessionUser[]> {
  if (!demoProfilesPromise) {
    demoProfilesPromise = api.authProfiles().then(({ profiles }) => profiles || []);
    demoProfilesPromise.catch(() => { demoProfilesPromise = null; }); // retry next time after a failure
  }
  return demoProfilesPromise;
}

const defaultConfig: AuthConfig ={ demoAuth: true, mockSso: false, passwordMinLength: 8, sso: { google: false, linkedin: false } };

function useAuthConfig() {
  const [config, setConfig] = useState<AuthConfig>(defaultConfig);
  useEffect(() => { api.authConfig().then(setConfig).catch(() => undefined); }, []);
  return config;
}

/**
 * SSO buttons: when a provider has real OAuth credentials configured, the
 * button starts the real OpenID Connect redirect flow; otherwise it falls back
 * to mock SSO (dev only — the server never enables it in production).
 */
function SsoButtons({ config, role, busy, onMockSso, disabled }: { config: AuthConfig; role?: Role; busy: SsoBusy; onMockSso: (provider: 'linkedin' | 'google') => void; disabled?: boolean }) {
  const start = (provider: 'linkedin' | 'google') => {
    if (config.sso[provider]) { window.location.href = `${apiBase}/api/auth/oauth/${provider}${role ? `?role=${role}` : ''}`; return; }
    onMockSso(provider);
  };
  // In the native app, real SSO can't run in a webview — show a hint instead.
  if (isNativeWebview) return <p className="sso-native-note">Signing in with Google or LinkedIn? Open <b>jobsmatchnow.com</b> in your browser. On the app, use email or a demo profile below.</p>;
  const visible = (provider: 'linkedin' | 'google') => config.sso[provider] || config.mockSso;
  if (!visible('linkedin') && !visible('google')) return null;
  return <div className="sso-stack">
    {visible('linkedin') && <button type="button" className="sso-button sso-linkedin" disabled={busy !== null || disabled} onClick={() => start('linkedin')}>
      {busy === 'linkedin' ? <Loader2 size={16} className="spin" /> : <Linkedin size={16} fill="currentColor" />}
      {busy === 'linkedin' ? 'Connecting to LinkedIn…' : `Continue with LinkedIn${config.sso.linkedin ? '' : ' (demo)'}`}
    </button>}
    {visible('google') && <button type="button" className="sso-button sso-google" disabled={busy !== null || disabled} onClick={() => start('google')}>
      {busy === 'google' ? <Loader2 size={16} className="spin" /> : <GoogleMark />}
      {busy === 'google' ? 'Connecting to Google…' : `Continue with Google${config.sso.google ? '' : ' (demo)'}`}
    </button>}
  </div>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div className="auth-modal" initial={{ y: 26, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
      <span className="brand-heart-mark auth-mark" aria-hidden="true" />
      <h2>{title}</h2>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
    </motion.div>
  </motion.div>;
}

export function LoginModal({ onClose, onComplete }: { onClose: () => void; onComplete: (user: SessionUser) => void }) {
  const config = useAuthConfig();
  const [profiles, setProfiles] = useState<SessionUser[]>([]);
  const [selected, setSelected] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<SsoBusy>(null);
  const [submitting, setSubmitting] = useState<'demo' | 'password' | 'forgot' | null>(null);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const [forgotDone, setForgotDone] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<'demo' | 'password' | 'sso' | null>(null); // where to show the error

  // Demo profiles come from a cache started when the landing page loads (prefetchDemoProfiles), so the list and the
  // "Test demo account" button are there at once instead of after two slow calls in a row.
  useEffect(() => {
    let alive = true;
    prefetchDemoProfiles().then((list) => { if (!alive) return; setProfiles(list); setSelected((s) => s || list[0]?.id || ''); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const run = async (action: () => Promise<SessionUser>) => {
    setError('');
    try { onComplete(await action()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed'); }
    finally { setBusy(null); setSubmitting(null); }
  };

  if (forgot) return <ModalShell title="Reset your password" subtitle="Enter your email and we'll send a reset link." onClose={onClose}>
    {forgotDone ? <div className="feedback-done"><div className="feedback-done-mark"><LogIn size={22} /></div><strong>Check your email</strong><p>{forgotDone}</p><button className="text-button" onClick={() => { setForgot(false); setForgotDone(null); }}>Back to log in</button></div>
      : <form className="auth-form" onSubmit={async (event) => { event.preventDefault(); if (!email.trim()) return; setSubmitting('forgot'); setError(''); try { const r = await api.forgotPassword(email.trim()); setForgotDone(r.mailer ? 'If that email has an account, a reset link is on its way.' : 'Email delivery isn’t set up yet, so no link was sent. Contact support to reset your password.'); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setSubmitting(null); } }}>
        <input className="auth-input" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-label="Email address" required />
        <button type="submit" className="primary-button auth-submit" disabled={submitting === 'forgot' || !email.trim()}>{submitting === 'forgot' ? <Loader2 size={16} className="spin" /> : 'Send reset link'}</button>
        <button type="button" className="text-button" onClick={() => setForgot(false)}>Back to log in</button>
        {error && <p className="auth-error">{error}</p>}
      </form>}
  </ModalShell>;

  return <ModalShell title="Welcome back" subtitle={config.demoAuth ? 'Sign in with your account, or explore with a demo profile.' : 'Sign in with your email and password.'} onClose={onClose}>
    <form className="auth-form" onSubmit={(event) => { event.preventDefault(); if (!email.trim() || !password) return; setSubmitting('password'); setSubmitted('password'); run(async () => (await api.loginPassword(email.trim(), password)).user); }}>
      <input className="auth-input" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-label="Email address" />
      <input className="auth-input" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-label="Password" />
      <button type="submit" className="primary-button auth-submit" disabled={submitting !== null || !email.trim() || !password}>{submitting === 'password' ? <Loader2 size={16} className="spin" /> : <><LogIn size={16} /> Log in</>}</button>
      {/* The error sits right under Log in: at the bottom of the window it was hidden below the demo list on phones. */}
      {error && submitted === 'password' && <p className="auth-error" role="alert">{error}</p>}
      <button type="button" className="text-button auth-forgot" onClick={() => { setForgot(true); setError(''); }}>Forgot password?</button>
    </form>
    <div className="auth-divider"><span>or</span></div>
    <SsoButtons config={config} busy={busy} onMockSso={(provider) => { setBusy(provider); setSubmitted('sso'); run(() => authProviders[provider].signIn()); }} />
    {/* Full tours (founder, 2026-11-24), above the demo accounts. Preview: ?tour=1 */}
    <TourButtons />
    {config.demoAuth && <>
      <div className="auth-divider"><span>test with demo accounts</span></div>
      <form className="auth-form demo-form" onSubmit={(event) => { event.preventDefault(); if (!selected) return; setSubmitting('demo'); setSubmitted('demo'); run(() => authProviders.demo.signIn({ userId: selected })); }}>
        {profiles.length ? <DemoPicker profiles={profiles} selected={selected} onSelect={setSelected} />
          : <div className="demo-picker demo-loading" aria-busy="true"><span /><span /><span /></div>}
        {error && submitted === 'demo' && <p className="auth-error" role="alert">{error}</p>}
        {/* Pinned to the bottom of the window, so it is visible right after picking an account. */}
        <button type="submit" className="primary-button auth-submit demo-submit" disabled={submitting !== null || !selected}>{submitting === 'demo' ? <Loader2 size={16} className="spin" /> : <>Test demo account <ArrowRight size={16} /></>}</button>
      </form>
    </>}
    {error && submitted === 'sso' && <p className="auth-error" role="alert">{error}</p>}
  </ModalShell>;
}

/** Settings → people you blocked, with Unblock (founder, 2026-11-23). Demo accounts are shared, so no blocking there. */
function BlockedList({ demo }: { demo: boolean }) {
  const [list, setList] = useState<{ userId: string; name: string; title: string }[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (!demo) api.blocks().then((r) => setList(r.blocked)).catch(() => setList([])); }, [demo]);
  const unblock = async (userId: string) => { setBusy(userId); try { await api.unblock(userId); setList((l) => (l || []).filter((b) => b.userId !== userId)); } finally { setBusy(''); } };
  return <div className="settings-row blocked-row">
    <div><strong><Ban size={15} /> Blocked people</strong>
      <small>{demo ? 'Blocking is off in demo accounts (every visitor shares them). Sign up to use Block.'
        : list === null ? 'Loading…' : list.length ? 'They can’t see you or message you.' : 'Nobody blocked. Use the Block button in a chat to block someone.'}</small>
      {!demo && list && list.length > 0 && <ul className="blocked-list">{list.map((b) => <li key={b.userId}><span>{b.name}{b.title ? ` · ${b.title}` : ''}</span>
        <button type="button" className="text-button" disabled={busy === b.userId} onClick={() => void unblock(b.userId)}>{busy === b.userId ? 'Unblocking…' : 'Unblock'}</button></li>)}</ul>}
    </div>
  </div>;
}

export function RegisterModal({ onClose, onComplete }: { onClose: () => void; onComplete: (user: SessionUser) => void }) {
  const config = useAuthConfig();
  const [role, setRole] = useState<Role>('candidate');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<SsoBusy>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [conductAccepted, setConductAccepted] = useState(false);
  const [conductOpen, setConductOpen] = useState(false);
  // Company country (recruiters, required; founder 2026-11-24): decides which payment methods they see.
  // Pre-selected from the phone's region; they can change it.
  const [country, setCountry] = useState(() => guessCountryName());
  // Recruiters also give their own citizenship (founder, 2026-11-24): used with the company country to offer the
  // payment methods they can use for their subscription. Candidates give it when they start Premium.
  const [citizenship, setCitizenship] = useState(() => guessCountryName());
  // Citizenship for everyone (founder, 2026-11-24); company country for recruiters.
  const countryOk = Boolean(citizenship) && (role !== 'employer' || Boolean(country));
  // Every real account has a password; demo mode only adds the demo personas on login.
  const passwordOk = password.length >= config.passwordMinLength;

  const run = async (action: () => Promise<SessionUser>) => {
    setError('');
    try { onComplete(await action()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Registration failed'); }
    finally { setBusy(null); setSubmitting(false); }
  };

  return <ModalShell title="Join JobsMatchNow" subtitle="Create your account in under a minute." onClose={onClose}>
    <div className="role-choice" role="radiogroup" aria-label="I am a">
      <button type="button" className={role === 'candidate' ? 'role-option role-cand active' : 'role-option role-cand'} onClick={() => setRole('candidate')} aria-pressed={role === 'candidate'}><User size={17} /><strong>Candidate</strong><small>Find your next role</small></button>
      <button type="button" className={role === 'employer' ? 'role-option role-rec active' : 'role-option role-rec'} onClick={() => setRole('employer')} aria-pressed={role === 'employer'}><BriefcaseBusiness size={17} /><strong>Company HR or Recruiter</strong><small>Find great people</small></button>
    </div>
    {role === 'employer' && <label className="auth-country">
      <span>Company country <small>(where your company is registered)</small></span>
      <select className="auth-input" value={country} onChange={(event) => setCountry(event.target.value)} required aria-label="Company country">
        <option value="">Choose a country</option>
        {COUNTRY_OPTIONS.map((c, i) => <option key={`${c.code}-${i}`} value={c.name}>{c.name}</option>)}
      </select>
    </label>}
    {<label className="auth-country">
      <span>Your citizenship <small>(to offer the payment methods you can use)</small></span>
      <select className="auth-input" value={citizenship} onChange={(event) => setCitizenship(event.target.value)} required aria-label="Your citizenship">
        <option value="">Choose a country</option>
        {COUNTRY_OPTIONS.map((c, i) => <option key={`cz-${c.code}-${i}`} value={c.name}>{c.name}</option>)}
      </select>
    </label>}
    <label className="conduct-checkbox">
      <input type="checkbox" checked={conductAccepted} onChange={(event) => setConductAccepted(event.target.checked)} />
      <span>I agree to the <button type="button" onClick={() => setConductOpen(true)}>Code of Conduct</button>, the <a href="/terms.html" target="_blank" rel="noopener">Terms of Service</a> and the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a></span>
    </label>
    <SsoButtons config={config} role={role} busy={busy} disabled={!conductAccepted || !countryOk} onMockSso={(provider) => { setBusy(provider); run(() => authProviders[provider].signIn({ registerRole: role, conductAccepted, registerCountry: role === 'employer' ? country : undefined, registerCitizenship: citizenship || undefined })); }} />
    <div className="auth-divider"><span>or continue with email</span></div>
    <form className="auth-form" onSubmit={(event) => { event.preventDefault(); if (!name.trim() || !email.trim() || !passwordOk || !conductAccepted || !countryOk) return; setSubmitting(true); run(() => authProviders.email.signIn({ register: { role, name: name.trim(), email: email.trim(), password, conductAccepted, citizenship, ...(role === 'employer' ? { country } : {}) } })); }}>
      <input className="auth-input" placeholder="Full name" value={name} onChange={(event) => setName(event.target.value)} required aria-label="Full name" autoComplete="name" />
      <input className="auth-input" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required aria-label="Email address" autoComplete="email" />
      <input className="auth-input" type="password" placeholder={`Password (min ${config.passwordMinLength} characters)`} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={config.passwordMinLength} aria-label="Password" autoComplete="new-password" />
      <button type="submit" className="primary-button auth-submit" disabled={submitting || !name.trim() || !email.trim() || !passwordOk || !conductAccepted || !countryOk}>{submitting ? <Loader2 size={16} className="spin" /> : <><Mail size={16} /> Create my account</>}</button>
    </form>
    {error && <p className="auth-error">{error}</p>}
    {conductOpen && <ConductModal onClose={() => setConductOpen(false)} />}
  </ModalShell>;
}

export function ResetPasswordModal({ token, onClose, onComplete }: { token: string; onClose: () => void; onComplete: (user: SessionUser) => void }) {
  const config = useAuthConfig();
  const min = config.passwordMinLength;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = password.length >= min && password === confirm;
  return <ModalShell title="Set a new password" subtitle="Choose a strong new password to finish resetting." onClose={onClose}>
    <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); if (!ok) return; setBusy(true); setError(''); try { const r = await api.resetPassword(token, password); onComplete(r.user); } catch (err) { setError(err instanceof Error ? err.message : 'Reset failed'); } finally { setBusy(false); } }}>
      <input className="auth-input" type="password" placeholder={`New password (min ${min})`} value={password} onChange={(e) => setPassword(e.target.value)} minLength={min} autoComplete="new-password" required />
      <input className="auth-input" type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      {confirm && password !== confirm && <p className="auth-error">Passwords don’t match.</p>}
      <button type="submit" className="primary-button auth-submit" disabled={busy || !ok}>{busy ? <Loader2 size={16} className="spin" /> : 'Set new password'}</button>
      {error && <p className="auth-error">{error}</p>}
    </form>
  </ModalShell>;
}

export function SettingsModal({ user, onClose, onDeleted }: { user: SessionUser; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const resend = async () => { setBusy('resend'); setNote(''); try { const r = await api.resendVerification(); setNote(r.mailer ? 'Verification email sent — check your inbox.' : 'Email delivery isn’t configured in this demo (link is in the server logs).'); } finally { setBusy(''); } };
  const exportData = () => { window.open(`${apiBase}/api/me/export`, '_blank'); };
  const del = async () => { setBusy('del'); setError(''); try { await api.deleteAccount(); onDeleted(); } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); setBusy(''); } };
  return <ModalShell title="Settings & privacy" subtitle="Manage your account, verification, and data." onClose={onClose}>
    <div className="settings-list">
      <div className="settings-row">
        <div><strong><ShieldCheck size={15} /> Email verification</strong><small>{user.emailVerified === false ? 'Your email isn’t verified yet.' : 'Your email is verified.'}</small></div>
        {user.emailVerified === false && <button className="secondary-button settings-btn" onClick={resend} disabled={busy === 'resend'}>{busy === 'resend' ? <Loader2 size={14} className="spin" /> : 'Resend'}</button>}
      </div>
      <div className="settings-row">
        <div><strong><Download size={15} /> Export my data</strong><small>Download everything we hold about you as JSON.</small></div>
        <button className="secondary-button settings-btn" onClick={exportData}>Export</button>
      </div>
      <div className="settings-row danger">
        <div><strong><Trash2 size={15} /> Delete my account</strong><small>Permanently removes your profile, jobs, matches, and messages.</small></div>
        {confirmDelete
          ? <div className="settings-confirm"><button className="danger-button settings-btn" onClick={del} disabled={busy === 'del'}>{busy === 'del' ? <Loader2 size={14} className="spin" /> : 'Confirm delete'}</button><button className="text-button" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
          : <button className="danger-button settings-btn" onClick={() => setConfirmDelete(true)} disabled={user.demo}>{user.demo ? 'Demo' : 'Delete'}</button>}
      </div>
      <BlockedList demo={Boolean(user.demo)} />
      {/* Legal pages reachable inside the app (Google Play / App Store ask for the privacy policy in-app). */}
      <div className="settings-row">
        <div><strong><ShieldCheck size={15} /> Privacy &amp; AI</strong><small>How we use your data, where AI helps, and your rights where you live.</small></div>
        <a className="secondary-button settings-btn" href="/privacy.html">Read</a>
      </div>
      <p className="settings-note"><a href="/terms.html">Terms of Service</a> · <a href="/privacy.html#ai">AI features</a> · <a href="/privacy.html#regional">Your rights by region</a> · <a href="/delete-account.html">How to delete your account</a></p>
      {note && <p className="settings-note">{note}</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  </ModalShell>;
}
