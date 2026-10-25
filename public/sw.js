// App-shell service worker. Base-path agnostic: every URL is relative to this
// script, so it works at / (dev, EC2 root) and /app/ (CloudFront/nginx).
//
// Safety rules:
// - Never touch /api/ (auth, sessions, messages, uploads, payments) or any
//   non-GET request — those always go straight to the network, uncached.
// - Never cache cross-origin responses (photos, fonts, SSO pages).
// - Only cache successful same-origin responses.
// - Navigations (the HTML shell) are network-first so a deploy is picked up
//   immediately; the cached shell is only an offline fallback.
const CACHE = 'jobsmatchnow-shell-v6';
const SHELL = new URL('./', self.location.href).href;
const PRECACHE = [SHELL, new URL('manifest.webmanifest', SHELL).href, new URL('logo.png', SHELL).href, new URL('brand-heart.svg', SHELL).href];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

const cacheable = (response) => response && response.ok && response.type === 'basic';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // /api/ and any base-prefixed /app/api/

  if (request.mode === 'navigate') {
    // Revalidate the HTML every time -- a stale document would point at
    // already-deleted hashed bundles after a deploy.
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(SHELL)));
    return;
  }

  // Hashed build assets never change under the same name: cache-first.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (cacheable(response)) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
      return response;
    })));
    return;
  }

  // Other same-origin static files (icons, manifest): network-first, cache fallback.
  event.respondWith(fetch(request).then((response) => {
    if (cacheable(response)) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match(request)));
});
