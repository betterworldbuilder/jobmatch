// "Get the app" bar for phones (founder, 2026-11-22: "opening jobsmatchnow no longer downloads the app like before").
// Browsers only show their own install offer now and then (never again for a while after it was dismissed or the app
// was removed), so we keep the browser's install event and offer it ourselves. Shown only when the browser says the
// app can be installed, never inside the installed app; × hides it for 7 days (per-viewer convenience).
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const HIDE_KEY = 'jm-install-bar-hidden-until';

// The event can fire before React mounts: catch it as early as this module loads.
let pending: InstallEvent | null = null;
const listeners = new Set<(e: InstallEvent | null) => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Never preventDefault(): that would hide the browser's own install offer (founder: "restore browser install,
    // it's a must"). We only keep a reference so the "Get the app" button can open the same install dialog.
    pending = event as InstallEvent;
    listeners.forEach((fn) => fn(pending));
  });
  window.addEventListener('appinstalled', () => { pending = null; listeners.forEach((fn) => fn(null)); });
}

function hiddenNow() {
  try { return Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now(); } catch { return false; }
}
const standalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

/** "Get the app" button at the top of the phone landing (founder, 2026-11-22). Uses the browser's install when it
 *  offers one; otherwise shows how to add the app to the home screen (iPhone Safari, Android Chrome / Samsung). */
export function GetAppButton() {
  const [event, setEvent] = useState<InstallEvent | null>(pending);
  const [help, setHelp] = useState(false);
  useEffect(() => { listeners.add(setEvent); return () => { listeners.delete(setEvent); }; }, []);
  if (standalone()) return null;
  const go = async () => {
    if (!event) { setHelp(true); return; }
    await event.prompt();
    const { outcome } = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (outcome === 'accepted') { pending = null; setEvent(null); }
  };
  return <>
    <button type="button" className="get-app-button" onClick={() => void go()}><Download size={15} /> Get the app</button>
    {help && <div className="get-app-help" role="dialog" aria-label="Add JobsMatchNow to your home screen" onClick={() => setHelp(false)}>
      <div className="get-app-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="install-bar-close get-app-x" onClick={() => setHelp(false)} aria-label="Close"><X size={16} /></button>
        <span className="brand-heart-mark install-bar-mark" aria-hidden="true" />
        <h3>Get the JobsMatchNow app</h3>
        <p>Free. It opens from your home screen like any app.</p>
        <InstallSteps />
      </div>
    </div>}
  </>;
}

function InstallSteps() {
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const samsung = typeof navigator !== 'undefined' && /SamsungBrowser/i.test(navigator.userAgent);
  return <ol>
    {ios ? <><li>Tap <b>Share</b> (the square with an arrow) at the bottom of Safari.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></>
      : samsung ? <><li>Tap the menu <b>≡</b> at the bottom right.</li><li>Choose <b>Add page to</b> → <b>Home screen</b>.</li></>
        : <><li>Tap the menu <b>⋮</b> at the top right of Chrome.</li><li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li></>}
  </ol>;
}

/** Install popup on the first phone visit (founder, 2026-11-22: "still no install popup on my phone"). Browsers hide
 *  their own offer when it was dismissed or the app was installed before, and iPhones never show one, so we offer it
 *  ourselves: Install → the browser's real dialog when it has one, else the steps. Hidden inside the installed app,
 *  when Chrome says it is already installed, and for 7 days after "Not now". Never cancels the browser's own offer. */
export function InstallPopup() {
  const [event, setEvent] = useState<InstallEvent | null>(pending);
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState(false);
  useEffect(() => { listeners.add(setEvent); return () => { listeners.delete(setEvent); }; }, []);
  useEffect(() => {
    if (standalone() || hiddenNow() || /[?&]noinstall\b/.test(location.search)) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const related = await (navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps?.();
        if (related && related.length) return; // already on this phone
      } catch { /* not supported */ }
      if (alive) setOpen(true);
    }, 2500);
    return () => { alive = false; window.clearTimeout(t); };
  }, []);
  if (!open) return null;
  const later = () => {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + 7 * 24 * 3600 * 1000)); } catch { /* private mode */ }
    setOpen(false);
  };
  const install = async () => {
    if (!event) { setSteps(true); return; }
    await event.prompt();
    const { outcome } = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    pending = null; setEvent(null);
    if (outcome === 'accepted') setOpen(false); else later();
  };
  return <div className="get-app-help install-popup" role="dialog" aria-label="Get the JobsMatchNow app" onClick={later}>
    <div className="get-app-card" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="install-bar-close get-app-x" onClick={later} aria-label="Close"><X size={16} /></button>
      <span className="brand-heart-mark install-bar-mark" aria-hidden="true" />
      <h3>Get the JobsMatchNow app</h3>
      <p>Free. Opens from your home screen like any app, full screen.</p>
      {steps && <InstallSteps />}
      <div className="install-popup-actions">
        {!steps && <button type="button" className="get-app-button" onClick={() => void install()}><Download size={15} /> Install</button>}
        <button type="button" className="install-popup-later" onClick={later}>{steps ? 'Done' : 'Not now'}</button>
      </div>
    </div>
  </div>;
}

export function InstallAppBar() {
  const [event, setEvent] = useState<InstallEvent | null>(pending);
  const [hidden, setHidden] = useState(hiddenNow);
  useEffect(() => { listeners.add(setEvent); return () => { listeners.delete(setEvent); }; }, []);
  if (!event || hidden || standalone()) return null;
  const install = async () => {
    await event.prompt();
    const { outcome } = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (outcome === 'accepted') { pending = null; setEvent(null); }
  };
  const hide = () => {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + 7 * 24 * 3600 * 1000)); } catch { /* private mode */ }
    setHidden(true);
  };
  return <div className="install-bar" role="region" aria-label="Get the app">
    <span className="brand-heart-mark install-bar-mark" aria-hidden="true" />
    <span className="install-bar-text"><b>Get the JobsMatchNow app</b><small>Free · opens from your home screen</small></span>
    <button type="button" className="install-bar-go" onClick={() => void install()}><Download size={15} /> Install</button>
    <button type="button" className="install-bar-close" onClick={hide} aria-label="Hide for a week"><X size={16} /></button>
  </div>;
}
