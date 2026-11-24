// Cookie-free visitor tracker (ported from the portfolio site). Sends page views,
// time on page and — on the public landing page only — clicks for the admin heatmap,
// to /api/track in small batches. Off inside iframes (the heatmap preview) and for bots.
import { apiBase } from '../api';

const ENDPOINT = `${apiBase}/api/track`;
const IDLE_MS = 60_000;
type Page = { path: string; dur: number; depth: number; dirty: boolean };
type State = { sid: string; src: string; queue: object[]; page: Page | null; lastActive: number };
let state: State | null = null;

const get = (s: Storage | null, k: string) => { try { return s?.getItem(k) || ''; } catch { return ''; } };
const set = (s: Storage | null, k: string, v: string) => { try { s?.setItem(k, v); } catch { /* blocked storage */ } };
const ss = () => { try { return window.sessionStorage; } catch { return null; } };

/** A CSS path from the nearest element with an id, so a click maps back to the same element. */
export function selectorFor(start: Element): string {
  const parts: string[] = [];
  let node: Element | null = start;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) { parts.unshift(`#${node.id}`); return parts.join('>'); }
    const parent: Element | null = node.parentElement;
    if (!parent || parts.length >= 25) return '';
    const tag = node.tagName.toLowerCase();
    const same = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    node = parent;
  }
  parts.unshift('body');
  return parts.join('>');
}

function send(payload: string) {
  try { if (navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: 'text/plain' }))) return; } catch { /* fall back */ }
  fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => undefined);
}

function snapshot() {
  const p = state?.page;
  if (!state || !p || !p.dirty) return;
  p.dirty = false;
  state.queue.push({ t: 'stat', path: p.path, dur: p.dur, depth: p.depth });
}
function flush() {
  if (!state || !state.queue.length) return;
  if (deviceNotCounted()) { state.queue.length = 0; return; } // switched off mid-visit: send nothing
  const events = state.queue.splice(0, 100);
  send(JSON.stringify({ sid: state.sid, src: state.src, w: window.innerWidth, events }));
}

function init(): State {
  let sid = get(ss(), 'jm_sid');
  if (!/^[a-z0-9]{8,32}$/.test(sid)) { sid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); set(ss(), 'jm_sid', sid); }
  let src = get(ss(), 'jm_src');
  if (!src) {
    const utm = new URL(window.location.href).searchParams.get('utm_source');
    try { const r = document.referrer ? new URL(document.referrer) : null; src = utm || (r && r.host !== window.location.host ? r.host.replace(/^www\./, '') : ''); } catch { src = utm || ''; }
    if (src) set(ss(), 'jm_src', src.slice(0, 100));
  }
  const s: State = { sid, src: src.slice(0, 100), queue: [], page: null, lastActive: Date.now() };
  const active = () => { s.lastActive = Date.now(); };
  const depth = () => {
    const p = s.page; if (!p) return;
    const d = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / Math.max(1, document.documentElement.scrollHeight)) * 100));
    if (d > p.depth) { p.depth = d; p.dirty = true; }
  };
  window.addEventListener('scroll', () => { active(); depth(); }, { passive: true });
  for (const ev of ['mousemove', 'keydown', 'touchstart', 'wheel']) window.addEventListener(ev, active, { passive: true });
  document.addEventListener('click', (e) => {
    active();
    const p = s.page;
    const target = e.target instanceof Element ? e.target : null;
    if (!p || !target || p.path !== '/') return; // heatmap = public landing page only
    const el = target.closest('svg') || target;
    const r = el.getBoundingClientRect();
    const unit = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
    const label = (target.closest('a,button')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    s.queue.push({ t: 'click', path: p.path, x: Math.round(e.pageX), y: Math.round(e.pageY), sel: selectorFor(el), ox: unit((e.clientX - r.left) / r.width), oy: unit((e.clientY - r.top) / r.height), label });
  }, { capture: true, passive: true });
  window.setInterval(() => {
    const p = s.page;
    if (!p || document.visibilityState !== 'visible' || Date.now() - s.lastActive > IDLE_MS) return;
    p.dur += 1; p.dirty = true; depth();
  }, 1000);
  window.setInterval(() => { snapshot(); flush(); }, 20_000);
  const leave = () => { snapshot(); flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  window.addEventListener('pagehide', leave);
  return s;
}

// --- "Don't count this device" (founder, 2026-11-24) ------------------------------------------------------
// The owner's own phones and computers are kept out of the traffic numbers. Saved on the device only (nothing is
// sent): ?notrack=1 / ?notrack=0 in the URL, 5 quick taps on the logo (phones), Shift + 0 or Shift + X (desktop), the
// button on the admin Traffic page, and automatically on any device where an admin signs in.
const NOTRACK_KEY = 'jm-notrack';
const ls = () => { try { return window.localStorage; } catch { return null; } };
export function deviceNotCounted() { return get(ls(), NOTRACK_KEY) === '1'; }
export function setDeviceNotCounted(on: boolean) {
  try { if (on) ls()?.setItem(NOTRACK_KEY, '1'); else ls()?.removeItem(NOTRACK_KEY); } catch { /* blocked storage */ }
  if (on && state) state.queue.length = 0; // drop anything not yet sent
}
/** Reads ?notrack=1 / ?notrack=0 once at start. */
export function applyNoTrackParam(search = typeof window !== 'undefined' ? window.location.search : '') {
  const v = new URLSearchParams(search).get('notrack');
  if (v === '1' || v === '0') { setDeviceNotCounted(v === '1'); showNoTrackToast(); }
}
/** Small confirmation note (plain DOM, works on the landing page and in the app). */
export function showNoTrackToast() {
  if (typeof document === 'undefined') return;
  document.querySelector('.notrack-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'notrack-toast'; el.setAttribute('role', 'status');
  el.textContent = deviceNotCounted() ? 'This device is not counted in traffic stats' : 'This device is counted again';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2600);
}
/** 5 quick taps on the JobsMatchNow logo (within 2 s) or Shift + 0 / Shift + X (founder's choice): switch the device on/off. */
export function installNoTrackSwitch() {
  let taps: number[] = [];
  const toggle = () => { setDeviceNotCounted(!deviceNotCounted()); showNoTrackToast(); };
  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest('.brand, .brand-heart-mark, .brand-wordmark, .nm-brand')) return;
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < 2000), now];
    if (taps.length >= 5) { taps = []; toggle(); }
  };
  // Shift + 0 or Shift + X (founder, 2026-11-24), by the physical key (e.code), so it works on QWERTY and AZERTY
  // layouts alike. Never while typing in a field.
  const KEYS = new Set(['Digit0', 'Numpad0', 'KeyX']);
  const down = (e: KeyboardEvent) => {
    if (!KEYS.has(e.code) || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
    e.preventDefault(); toggle();
  };
  document.addEventListener('click', onClick, { capture: true });
  window.addEventListener('keydown', down);
  return () => { document.removeEventListener('click', onClick, { capture: true }); window.removeEventListener('keydown', down); };
}

/** Record a page view: "/" for the public landing page, "/app/<view>" inside the app. */
export function trackView(path: string) {
  if (typeof window === 'undefined' || window.self !== window.top) return;
  if (/bot|crawl|spider|headless/i.test(navigator.userAgent)) return;
  if (deviceNotCounted()) return; // the owner's own devices (see above)
  if (!state) state = init();
  if (state.page?.path === path) return;
  snapshot();
  state.page = { path, dur: 0, depth: 0, dirty: false };
  state.queue.push({ t: 'view', path });
  flush();
}

/** Owner shortcut: Left Shift + Z opens the admin sign-in (ignored while typing). Access is still checked on the server. */
export function installAdminHotkey(open: () => void) {
  let leftShift = false;
  const down = (e: KeyboardEvent) => {
    if (e.code === 'ShiftLeft') { leftShift = true; return; }
    // Admin sign-in shortcut: Left Shift + Z (founder, 2026-11-23; was Left Shift + A).
    if (e.key.toLowerCase() !== 'z' || !e.shiftKey || !leftShift || e.ctrlKey || e.altKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
    e.preventDefault();
    open();
  };
  const up = (e: KeyboardEvent) => { if (e.code === 'ShiftLeft') leftShift = false; };
  const reset = () => { leftShift = false; };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', reset);
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset); };
}
