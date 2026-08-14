const CACHE_NAME = 'wifiplus-v14';
// app.js is an ES module, so the modules it imports are part of the shell: without
// them a cold offline load would fetch app.js from cache and then fail on its very
// first import.
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js?v=4',
  '/core/run.js',
  '/core/endpoints.js',
  '/core/server-picker.js',
  '/core/servers.js',
  '/core/netinfo.js',
  '/core/scoring.js',
  '/core/history.js',
  '/core/permalink.js',
  '/core/gauge.js',
  '/boot-check.js',
  // Landing pages share one stylesheet and one runner, so precaching those two
  // makes every one of them work offline without listing each page.
  '/landing.css',
  '/landing.js',
  '/manifest.webmanifest',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Measurement traffic must never touch this worker.
  //
  // Anything not served from this origin is test traffic — payloads from
  // speed.cloudflare.com, DoH queries to cloudflare-dns.com, a self-hosted edge.
  // The generic handler below was intercepting all of it and, for every 25 MB
  // download chunk, calling response.clone() and cache.put() WHILE the transfer
  // was being timed. That is measurable work inside the measurement: cloning a
  // stream and writing it to disk competes with reading it.
  //
  // It also broke the cache guarantee the footer makes. Unique URLs stop a cache
  // ever answering a measurement request, but nothing stopped this worker from
  // storing every response — filling the cache with hundreds of megabytes of
  // random test bytes that can never be read again.
  //
  // And it silently defeated network throttling: a request re-issued by a
  // service worker is attributed to the worker, not the page, so Chrome's
  // DevTools throttle did not apply to it. A test throttled to Fast 3G measured
  // 61 Mbps, which is exactly the kind of number this project exists not to
  // print. Letting these requests go straight to the network fixes all three.
  const target = new URL(event.request.url);
  if (target.origin !== self.location.origin) return;
  if (target.pathname.startsWith('/api/speedtest/')) return;

  // Network-first for page navigations so content and SEO updates go live immediately.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Code that computes the measurements is network-first. Stale-while-revalidate
  // serves the cached copy and refreshes in the background, which means a fix to
  // the engine does not take effect until the SECOND reload — so a corrected
  // number keeps looking wrong on the visit where the user checks. For anything
  // that decides what a speed reads, being one version behind is not acceptable;
  // the cached copy stays as the offline fallback only.
  const url = new URL(event.request.url);
  const isEngine =
    url.origin === self.location.origin &&
    (url.pathname === '/app.js' ||
      url.pathname === '/landing.js' ||
      url.pathname === '/boot-check.js' ||
      url.pathname.startsWith('/core/'));

  if (isEngine) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // Everything else — styles, icons, the manifest — is stale-while-revalidate:
  // instant from cache, refreshed in the background. A stylesheet one version
  // behind is a cosmetic issue, not a wrong number.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Never fall back to index.html here — that would hand HTML to a script or image request.
      return cached || network;
    })
  );
});
