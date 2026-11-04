// Chics & Chips service worker.
// - Pages: network first; offline fallback page when there is no connection.
// - Build assets (/_next/static, hashed and immutable) and icons: cache first, for fast repeat visits.
// - Never cached: APIs, staff pages, receipts or checkout data (always live). Orders are not queued offline.
const VERSION = "cc-v2";
const STATIC = `${VERSION}-static`;
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  const cacheable = url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
  if (!cacheable) return;
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
