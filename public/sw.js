/**
 * NyAnime App Shell Service Worker
 *
 * Strategy overview:
 *  - Static assets (/assets/*): Cache-first — served from cache, updated on next install
 *  - App shell (HTML navigations): Network-first with offline fallback to /index.html
 *  - API & streaming (/api/*, /torrent-stream*): Network-only (never cached)
 *
 * Cache naming uses a version stamp so stale caches are cleanly evicted on update.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `nyanime-static-${CACHE_VERSION}`;
const SHELL_CACHE = `nyanime-shell-${CACHE_VERSION}`;

/** Resources to pre-cache on install (app shell) */
const SHELL_URLS = ['/', '/index.html'];

/** Routes that should NEVER be cached */
const NO_CACHE_PATTERNS = [
  /\/api\//,
  /\/torrent-stream/,
  /\/hls\//,
  /\.m3u8/,
  /\.ts(\?|$)/,
  /graphql\.anilist\.co/,
  /api\.jikan\.moe/,
];

function shouldSkipCache(url) {
  return NO_CACHE_PATTERNS.some((p) => p.test(url));
}

// ─── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: evict old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: routing strategy ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Never cache API/streaming/third-party requests
  if (shouldSkipCache(url)) return;

  // Static assets (/assets/ directory from Vite build) — cache-first
  if (url.includes('/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const network = await fetch(request);
        if (network.ok) cache.put(request, network.clone());
        return network;
      })
    );
    return;
  }

  // HTML navigations — network-first, fall back to /index.html for offline SPA routing
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(SHELL_CACHE).then((cache) => cache.match('/index.html'))
      )
    );
    return;
  }

  // Everything else (fonts, images, etc.) — stale-while-revalidate
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      return cached || networkFetch;
    })
  );
});
