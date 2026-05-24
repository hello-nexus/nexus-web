// Nexus Web service worker — offline shell cache.
// Strategy: precache the app shell on install; serve hashed /assets/* cache-first;
// for navigations, try network and fall back to cached index.html.
// Bump CACHE_VERSION on every deploy to invalidate stale shells.
//
// IMPORTANT: never intercept localhost — the local Nexus service must hit the
// network directly so the SPA can detect it going up/down in real time.

const CACHE_VERSION = 'nexus-web-v131-panel-html-theme';
const SHELL_URLS = ['/', '/index.html', '/favicon.svg', '/icons.svg', '/manifest.webmanifest', '/panel-phone.webmanifest', '/fonts/lexend/lexend-latin.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop stale caches, then take over fetches for already-open pages.
  // Do NOT force a navigate() on existing windows: that double-fires
  // the SPA mount on URLs that carry one-shot tokens (e.g. the phone
  // pair flow at /panel/phone?pair=...), making the second claim attempt
  // see the consumed token and surface a misleading "expired" error.
  // Navigations are network-first below, so users still pick up shell
  // updates on the next manual navigation without us reloading them here.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept the local Nexus service — it must hit the network directly.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost')) {
    return;
  }

  // Navigation requests: network-first, fall back to cached index.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // Hashed static assets (/assets/*): cache-first, then network, then store.
  // All other same-origin requests are API calls — always hit the network.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
  }
});
