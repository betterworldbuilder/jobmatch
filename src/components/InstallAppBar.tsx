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
  window.addEventListener('appinstalled', () => { pending = null; markInstalled(); listeners.forEach((fn) => fn(null)); });
}

function hiddenNow() {
  try { return Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now(); } catch { return false; }
}
// Also true inside our Android/iOS app (Expo WebView adds "JobsMatchNowExpoPreview" to its user agent): no
// "install the app" offers inside the app itself.
const standalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true || /JobsMatchNowExpo/i.test(navigator.userAgent));

// "Already installed" (founder, 2026-11-24: a 2nd tap on "Get the app" showed the install steps again). The browser
// only offers install when the app is NOT installed, so without its offer we check: installed from this browser
// (remembered on this phone), opened as the installed app before (it shares this browser's storage), or Chrome
// says so (getInstalledRelatedApps, via related_applications in the manifest).
const INSTALLED_KEY = 'jm-app-installed';
function markInstalled() { try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* private mode */ } }
if (typeof window !== 'undefined' && standalone()) markInstalled();
export async function appInstalled(): Promise<boolean> {
  try { if (localStorage.getItem(INSTALLED_KEY) === '1') return true; } catch { /* private mode */ }
  try {
    const related = await (navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps?.();
    if (related && related.length) { markInstalled(); return true; }
  } catch { /* not supported */ }
  return false;
}

function AlreadyInstalled() {
  return <div className="get-app-installed" role="status">
    <h3>You have already installed the app</h3>
    <p>Open <b>JobsMatchNow</b> from your home screen or your app list.</p>
  </div>;
}

/** "Get the app" button at the top of the phone landing (founder, 2026-11-22). Uses the browser's install when it
 *  offers one; otherwise shows how to add the app to the home screen (iPhone Safari, Android Chrome / Samsung). */
export function GetAppButton() {
  const [event, setEvent] = useState<InstallEvent | null>(pending);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => { listeners.add(setEvent); return () => { listeners.delete(setEvent); }; }, []);
  if (standalone()) return null;
  const go = async () => {
    // The browser offers install only when the app is not installed: its offer wins.
    if (!event) { setInstalled(await appInstalled()); setHelp(true); return; }
    await event.prompt();
    const { outcome } = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (outcome === 'accepted') { pending = null; setEvent(null); markInstalled(); }
  };
  return <>
    <button type="button" className="get-app-button" onClick={() => void go()}><Download size={15} /> Get the app</button>
    {help && <div className="get-app-help" role="dialog" aria-label="Add JobsMatchNow to your home screen" onClick={() => setHelp(false)}>
      <div className="get-app-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="install-bar-close get-app-x" onClick={() => setHelp(false)} aria-label="Close"><X size={16} /></button>
        <span className="brand-heart-mark install-bar-mark" aria-hidden="true" />
        {installed ? <AlreadyInstalled /> : <>
          <h3>Get the JobsMatchNow app</h3>
          <p>Free. It opens from your home screen like any app.</p>
          <InstallSteps />
          <p className="get-app-note">Already installed? Open JobsMatchNow from your home screen.</p>
        </>}
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
      if (await appInstalled()) return; // already on this phone: no popup
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
    if (outcome === 'accepted') { markInstalled(); setOpen(false); } else later();
  };
  return <div className="get-app-help install-popup" role="dialog" aria-label="Get the JobsMatchNow app" onClick={later}>
    <div className="get-app-card" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="install-bar-close get-app-x" onClick={later} aria-label="Close"><X size={16} /></button>
      <span className="brand-heart-mark install-bar-mark" aria-hidden="true" />
      <h3>Get the JobsMatchNow app</h3>
      <p>Free. Opens from your home screen like any app, full screen.</p>
      {steps && <><InstallSteps /><p className="get-app-note">Already installed? Open JobsMatchNow from your home screen.</p></>}
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
    if (outcome === 'accepted') { pending = null; setEvent(null); markInstalled(); }
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
