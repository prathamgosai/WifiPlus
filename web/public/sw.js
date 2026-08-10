/**
 * WifiPlus service worker — tuned for a Next.js static export.
 *
 * Two caching strategies, chosen by what the request is:
 *   · /_next/static/*  cache-first, forever. These filenames contain a content
 *     hash, so a changed file is a *different* URL — it can never go stale.
 *   · everything else  network-first, falling back to cache. Page HTML must be
 *     fresh, or a deploy would never reach a returning visitor.
 */
const CACHE = "wifiplus-v4";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // A single missing entry rejects addAll and aborts the whole install,
      // so each is added independently.
      Promise.allSettled(SHELL.map((url) => cache.add(url))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch cross-origin traffic — the measurement endpoints in particular
  // must always hit the network, or the speed test would report cache reads.
  if (url.origin !== self.location.origin) return;

  // Immutable hashed build assets.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations and everything else: network first, cache as the safety net.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // Only substitute the shell for a navigation — handing HTML to a
          // script or image request breaks it in a much more confusing way.
          if (request.mode === "navigate") return caches.match("/");
          return Response.error();
        }),
      ),
  );
});
