// Nexus Web service worker - offline shell cache.
// Strategy: precache the app shell on install; serve hashed /assets/* cache-first;
// for navigations, try network and fall back to cached index.html.
// Bump CACHE_VERSION on every deploy to invalidate stale shells.
//
// IMPORTANT: never intercept localhost - the local Nexus service must hit the
// network directly so the SPA can detect it going up/down in real time.

const CACHE_VERSION = 'nexus-web-v136-marketing-site';
// No '/': the navigate fallback below reads /index.html, and on the bare host
// '/' is the marketing page - caching it would be dead weight there.
const SHELL_URLS = ['/index.html', '/favicon.svg', '/favicon.ico', '/icons.svg', '/manifest.webmanifest', '/panel-phone.webmanifest', '/fonts/lexend/lexend-latin.woff2'];

self.addEventListener('install', (event) => {
  // No skipWaiting(): a freshly-installed worker WAITS instead of jumping the
  // queue to activate while a tab is open. Safari/WebKit intermittently treats
  // a byte-identical sw.js as an update and re-installs it on nearly every load;
  // with skipWaiting that re-install immediately activated + claimed, firing
  // controllerchange, which the page turned into a window.location.reload() -
  // an endless reload loop (seen on Safari mac/iOS, never Chromium). Letting the
  // new worker wait means the controller never changes mid-session, so the loop
  // can't form. The update is picked up on the next cold load (all tabs closed).
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS))
  );
});

self.addEventListener('activate', (event) => {
  // Runs only once this worker actually becomes active (next cold load, since we
  // no longer skipWaiting). Drop stale caches, then claim so this load's page is
  // controlled for offline. Any controllerchange this triggers happens at most
  // once per cold load and is capped to a single reload by main.tsx - it can no
  // longer recur mid-session, so no loop.
  // Do NOT force a navigate() on existing windows: that double-fires the SPA
  // mount on URLs carrying one-shot tokens (e.g. /panel/phone?pair=...), making
  // the second claim see the consumed token and surface a bogus "expired" error.
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

  // Never intercept the local Nexus service - it must hit the network directly.
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
  // All other same-origin requests are API calls - always hit the network.
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
