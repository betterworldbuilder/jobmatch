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

/** Record a page view: "/" for the public landing page, "/app/<view>" inside the app. */
export function trackView(path: string) {
  if (typeof window === 'undefined' || window.self !== window.top) return;
  if (/bot|crawl|spider|headless/i.test(navigator.userAgent)) return;
  if (!state) state = init();
  if (state.page?.path === path) return;
  snapshot();
  state.page = { path, dur: 0, depth: 0, dirty: false };
  state.queue.push({ t: 'view', path });
  flush();
}

/** Owner shortcut: Left Shift + A opens the admin sign-in (ignored while typing). Access is still checked on the server. */
export function installAdminHotkey(open: () => void) {
  let leftShift = false;
  const down = (e: KeyboardEvent) => {
    if (e.code === 'ShiftLeft') { leftShift = true; return; }
    if (e.key.toLowerCase() !== 'a' || !e.shiftKey || !leftShift || e.ctrlKey || e.altKey || e.metaKey) return;
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
