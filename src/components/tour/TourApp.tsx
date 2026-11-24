// "Candidate full tour" / "Recruiter full tour" (founder, 2026-11-24): the real app screens, driven by a script.
// A fake finger taps and types, a glowing ring shows where to look, a caption says what is happening.
// Pause · Skip · Replay · Sign up for real. Any tap on the app pauses. Reduced motion → step by step.
// Loaded only when a tour starts; while it plays every request is answered by mockApi (nothing is saved).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ArrowRight, Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react';
import { RegisterModal } from '../AuthModals';
import { createMockApi, type TourMock } from '../../lib/tour/mockApi';
import { setTourHandler, TOUR_SEEN_KEY, TOUR_VIEW_EVENT, type TourRole } from '../../lib/tour/runtime';
import { TOURS, type TourAction, type TourStep, type Where } from '../../lib/tour/steps';
import { setTrackPrefix, trackView } from '../../lib/tracker';
import type { SessionUser } from '../../types';
import './tour.css';

type Props = {
  role: TourRole;
  renderWorkspace: (user: SessionUser, onExit: () => void) => React.ReactNode;
  onEnd: (next: 'close' | 'signup') => void;
};

const CANCEL = Symbol('tour-cancel');
const raw = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
declare global { interface Window { __tour?: { step: string; done: boolean; misses: string[]; errors: string[]; requests: number; times: string[] } } }

function visible(el: Element) {
  if (el.closest('.tour-ui')) return false;
  const r = (el as HTMLElement).getBoundingClientRect?.();
  return Boolean(r && (r.width > 0 || r.height > 0));
}
const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function findNow(w: Where): HTMLElement | null {
  let roots: ParentNode[] = [document];
  if (w.within) {
    const want = norm(w.within.text);
    roots = [...document.querySelectorAll(w.within.target)].filter((c) => visible(c) && norm(c.textContent).includes(want));
    if (!roots.length) return null;
  }
  for (const root of roots) {
    const all = [...root.querySelectorAll<HTMLElement>(w.target)].filter(visible);
    if (!w.text) { if (all[0]) return all[0]; continue; }
    const want = norm(w.text);
    const hit = all.find((el) => norm(el.textContent) === want) || all.find((el) => norm(el.textContent).includes(want));
    if (hit) return hit;
  }
  return null;
}

/** Sets a React-controlled field: native setter + the event React listens to. */
function setNative(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

type Finger = { x: number; y: number; on: boolean; tap: number };

/** The glowing ring follows its element while the page scrolls or animates. Its own small component, and it
 *  re-renders only when the box moves, so the app under it is not re-rendered every frame. */
function Ring({ target }: { target: React.MutableRefObject<HTMLElement | null> }) {
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    let prev = '';
    const tick = () => {
      const el = target.current;
      const r = el && el.isConnected ? el.getBoundingClientRect() : null;
      const next = r && r.width + r.height > 0 ? { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null;
      const key = next ? `${next.l},${next.t},${next.w},${next.h}` : '';
      if (key !== prev) { prev = key; setBox(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!box) return null;
  return <div className="tour-ring" style={{ left: box.l - 6, top: box.t - 6, width: box.w + 12, height: box.h + 12 }} aria-hidden="true" />;
}

export default function TourApp({ role, renderWorkspace, onEnd }: Props) {
  const tour = TOURS[role];
  const steps = tour.steps;
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const [mock, setMock] = useState<TourMock>(() => { const m = createMockApi(role); setTourHandler(m.handle); return m; });
  const [user, setUserState] = useState<SessionUser | null>(null);
  const userRef = useRef<SessionUser | null>(null);
  const setUser = useCallback((u: SessionUser | null) => { userRef.current = u; setUserState(u); }, []);
  const [run, setRun] = useState(0); // bumps on Replay
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [waitingNext, setWaitingNext] = useState(false);
  const [finger, setFinger] = useState<Finger>({ x: -100, y: -100, on: false, tap: 0 });
  const ringEl = useRef<HTMLElement | null>(null);
  const ctl = useRef({ paused: false, gen: 0, jump: -1, next: null as null | (() => void) });

  // Tracking: tour pages are counted under /tour/<role>, never as real app visits.
  useEffect(() => {
    setTrackPrefix(`/tour/${role}`);
    trackView(`/tour/${role}/start`);
    try { sessionStorage.setItem(TOUR_SEEN_KEY, role); } catch { /* private mode */ }
    window.__tour = { step: '', done: false, misses: [], errors: [], requests: 0, times: [`mount ${Math.round(performance.now())}`] };
    const onError = (e: ErrorEvent) => window.__tour?.errors.push(`${e.message} @ ${String(e.error?.stack || '').split('\n').slice(1, 4).join(' | ')}`);
    window.addEventListener('error', onError);
    return () => { window.removeEventListener('error', onError); setTrackPrefix(''); };
  }, [role]);
  useEffect(() => { setTourHandler(mock.handle); return () => setTourHandler(null); }, [mock]);

  // Any real tap on the app pauses (scripted taps are not trusted events).
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (e.isTrusted && !(e.target as Element)?.closest?.('.tour-ui')) { ctl.current.paused = true; setPaused(true); } };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnd('close');
      if (e.key === ' ' && !(e.target as Element)?.closest?.('input, textarea, select')) { e.preventDefault(); const p = !ctl.current.paused; ctl.current.paused = p; setPaused(p); }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [onEnd]);


  const clearTourStorage = useCallback(() => {
    try { for (const k of Object.keys(localStorage)) if (/tour-(candidate|recruiter)/.test(k)) localStorage.removeItem(k); } catch { /* blocked */ }
  }, []);
  useEffect(() => clearTourStorage, [clearTourStorage]);

  // ---- the script runner ----
  useEffect(() => {
    const gen = ++ctl.current.gen;
    let alive = true;
    const sleep = async (ms: number) => {
      let left = ms;
      while (left > 0 || ctl.current.paused) {
        if (!alive || gen !== ctl.current.gen || ctl.current.jump >= 0) throw CANCEL;
        if (ctl.current.paused) { await raw(80); continue; }
        const t = Math.min(40, left); await raw(t); left -= t;
      }
      if (!alive || gen !== ctl.current.gen || ctl.current.jump >= 0) throw CANCEL;
    };
    const find = async (w: Where, optional = false) => {
      for (let i = 0; i < 50; i += 1) { const el = findNow(w); if (el) return el; await sleep(100); }
      if (!optional) window.__tour?.misses.push(`${window.__tour?.step}: ${w.target}${w.text ? ` "${w.text}"` : ''}`);
      return null;
    };
    const moveTo = async (el: HTMLElement) => {
      el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      await sleep(reduced ? 60 : 380);
      ringEl.current = el;
      const r = el.getBoundingClientRect();
      setFinger((f) => ({ ...f, x: r.left + r.width / 2, y: r.top + r.height / 2, on: true }));
      await sleep(reduced ? 60 : 520);
    };
    const tapEl = async (el: HTMLElement) => {
      await moveTo(el);
      setFinger((f) => ({ ...f, tap: f.tap + 1 }));
      await sleep(160);
      el.click();
      await sleep(reduced ? 150 : 420);
    };
    const act = async (a: TourAction) => {
      switch (a.do) {
        case 'wait': await sleep(a.ms); return;
        case 'matchNextLike': mock.matchNextLike(); return;
        case 'event': window.dispatchEvent(new Event(a.name)); await sleep(500); return;
        case 'view': {
          const matchId = a.match === 'latest' ? mock.lastMatchId : a.match;
          window.dispatchEvent(new CustomEvent(TOUR_VIEW_EVENT, { detail: { view: a.view, matchId } }));
          ringEl.current = null;
          await sleep(700); return;
        }
        default: {
          const el = await find(a, 'optional' in a && Boolean(a.optional));
          if (!el) return;
          if (a.do === 'point') { await moveTo(el); await sleep(a.ms ?? 900); return; }
          if (a.do === 'tap') { await tapEl(el); return; }
          await moveTo(el);
          if (a.do === 'select' || a.do === 'set' || a.do === 'paste') { el.focus?.(); setNative(el, a.value); await sleep(a.do === 'paste' ? 900 : 450); return; }
          if (a.do === 'type') {
            el.focus();
            const field = el as HTMLInputElement;
            let text = '';
            for (const ch of a.value) { text += ch; setNative(field, text); await sleep(reduced ? 0 : 38); }
            if (a.enter) { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await sleep(250); }
            await sleep(200);
          }
        }
      }
    };
    (async () => {
      let i = 0;
      while (i < steps.length) {
        const step: TourStep = steps[i];
        setIndex(i); setWaitingNext(false);
        if (window.__tour) { window.__tour.step = step.id; window.__tour.times.push(`${step.id} ${Math.round(performance.now())}`); }
        try {
          if (step.phase === 'app' && !userRef.current) { setUser(mock.user); await sleep(1200); }
          for (const a of step.actions) await act(a);
          if (step.phase === 'register') { for (let k = 0; k < 40 && !document.querySelector('.app-shell'); k += 1) await sleep(100); }
          await sleep(step.hold ?? 1100);
          if (reduced) { setWaitingNext(true); await new Promise<void>((resolve) => { ctl.current.next = resolve; }); ctl.current.next = null; }
          i += 1;
        } catch (e) {
          if (e !== CANCEL) { window.__tour?.errors.push(String(e)); i += 1; continue; }
          if (!alive || gen !== ctl.current.gen) return;
          const jump = ctl.current.jump; ctl.current.jump = -1;
          i = jump >= 0 ? jump : i + 1;
        }
      }
      if (!alive || gen !== ctl.current.gen) return;
      ringEl.current = null;
      setFinger((f) => ({ ...f, on: false }));
      setFinished(true);
      if (window.__tour) { window.__tour.done = true; window.__tour.requests = mock.log.length; }
      trackView(`/tour/${role}/finish`);
    })();
    return () => { alive = false; };
    // restarting is driven by `run` (Replay) and the fresh mock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, mock]);

  // The app under the overlay renders once per tour user, not on every caption or finger update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const workspace = useMemo(() => (user ? renderWorkspace(user, () => onEnd('close')) : null), [user, run]);
  const step = steps[Math.min(index, steps.length - 1)];
  const togglePause = () => { const p = !paused; ctl.current.paused = p; setPaused(p); };
  const skip = () => {
    if (ctl.current.next) { ctl.current.next(); return; }
    ctl.current.paused = false; setPaused(false);
    ctl.current.jump = Math.min(index + 1, steps.length);
    if (!userRef.current && steps[index + 1]?.phase === 'app') setUser(mock.user);
  };
  const replay = () => {
    clearTourStorage();
    ctl.current = { paused: false, gen: ctl.current.gen, jump: -1, next: null };
    ringEl.current = null;
    const m = createMockApi(role); setTourHandler(m.handle);
    setPaused(false); setFinished(false); setUser(null); setIndex(0);
    setMock(m); setRun((r) => r + 1);
  };
  const signUp = () => { trackView(`/tour/${role}/signup`); onEnd('signup'); };
  const progress = finished ? 100 : ((index + (waitingNext ? 1 : 0.5)) / steps.length) * 100;

  return <div className={`tour-root tour-${role}${paused || waitingNext ? ' tour-held' : ''}`}>
    {user ? workspace
      : <div className="tour-stage">
        <AnimatePresence><RegisterModal onClose={() => onEnd('close')} onComplete={(u) => setUser({ ...mock.user, ...u, id: mock.user.id })} /></AnimatePresence>
      </div>}
    <div className="tour-ui" aria-live="polite">
      <div className="tour-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={`${tour.name} progress`}>
        {steps.map((s, k) => <i key={s.id} className={k < index || finished ? 'done' : k === index ? 'on' : ''} />)}
      </div>
      {!finished && <Ring target={ringEl} />}
      {finger.on && !finished && <div className={`tour-finger${reduced ? ' still' : ''}`} style={{ transform: `translate(${finger.x}px, ${finger.y}px)` }} aria-hidden="true"><span key={finger.tap} className="tour-tap" /></div>}
      {finished
        ? <section className="tour-card tour-end" role="dialog" aria-label={`${tour.name} finished`}>
          <span className="tour-kicker">{tour.name} · done</span>
          <h2>{role === 'candidate' ? 'Your next job, chosen by both sides.' : 'Your next hire, chosen by both sides.'}</h2>
          <p>Everything you saw was a tour: nothing was saved. Create your real account in under a minute.</p>
          <div className="tour-end-actions">
            <button type="button" className="tour-cta" onClick={signUp}>Sign up now <ArrowRight size={17} /></button>
            <button type="button" className="tour-ghost" onClick={replay}><RotateCcw size={15} /> Replay</button>
            <button type="button" className="tour-ghost" onClick={() => onEnd('close')}>Close</button>
          </div>
        </section>
        // While playing (founder, 2026-11-24): no card over the screens, only a small chip at the top with the step,
        // Pause, Skip and Close. The caption is read to screen readers. Sign up / Replay come at the end.
        : <div className={`tour-chip${paused ? ' paused' : ''}`} role="group" aria-label={tour.name}>
          <span className="tour-chip-step">{index + 1}/{steps.length}</span>
          <span className="tour-chip-title">{paused ? 'Paused: explore, then ▶' : step.title}</span>
          <span className="tour-sr">{step.caption}</span>
          {reduced && waitingNext
            ? <button type="button" className="tour-chip-btn" onClick={skip} aria-label="Next step"><ArrowRight size={15} /></button>
            : <button type="button" className="tour-chip-btn" onClick={togglePause} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>}
          <button type="button" className="tour-chip-btn" onClick={skip} aria-label="Skip this step"><SkipForward size={14} /></button>
          <button type="button" className="tour-chip-btn" onClick={() => onEnd('close')} aria-label="Close the tour"><X size={14} /></button>
        </div>}
    </div>
  </div>;
}
