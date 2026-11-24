import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';
import './phone-theme.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Copyright and safety warning in the browser's developer console (founder, 2026-11-25): it protects members from
// "paste this code" scams and reminds visitors the code is proprietary. Production only.
if (import.meta.env.PROD) {
  console.log('%cStop!', 'color:#fd267a;font:800 32px sans-serif');
  console.log('%cThis is a browser feature for developers. If someone told you to paste something here, it is a scam that can take over your JobsMatchNow account.', 'font-size:14px');
  console.log('%c© 2026 JobsMatchNow SARL. All rights reserved. This software is proprietary: copying, reverse engineering, scraping or reuse is prohibited. https://jobsmatchnow.com/legal.html', 'font-size:12px;color:#7a4a00');
}

// Installable PWA on the web only. Native (Capacitor) shells load the live site
// and must never pin a cached shell. BASE_URL keeps the worker and its scope
// correct under /app/ as well as /.
if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }));
}

// Pick up new deploys on phones: apps (and the phone web view) stay open for days on an old build.
// When the app comes back to the screen (or every 10 minutes), compare the live index.html's bundle with the
// one running; if it changed, reload once. Read-only GET of the HTML shell — no data is sent.
if (import.meta.env.PROD) {
  const current = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')?.match(/index-[\w-]+\.js/)?.[0];
  let checking = false;
  const checkForUpdate = async () => {
    if (checking || document.visibilityState !== 'visible') return;
    // Never reload while someone is typing (message, form, search).
    if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    checking = true;
    try {
      const html = await (await fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: 'no-store' })).text();
      const live = html.match(/index-[\w-]+\.js/)?.[0];
      const running = current();
      if (live && running && live !== running && !sessionStorage.getItem(`jm-reloaded-${live}`)) {
        sessionStorage.setItem(`jm-reloaded-${live}`, '1');
        window.location.reload();
      }
    } catch { /* offline: try again later */ } finally { checking = false; }
  };
  document.addEventListener('visibilitychange', () => { void checkForUpdate(); });
  window.setInterval(() => { void checkForUpdate(); }, 10 * 60 * 1000);
}
