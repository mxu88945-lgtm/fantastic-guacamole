// Network-first service worker that BYPASSES the HTTP cache (cache: "no-store"),
// so the very latest files always load when online; falls back to the cache only
// when offline. This stops code changes from getting stuck behind a stale cache.
const CACHE = "jyc-chat-cache-v11";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  // drop old caches, then take control of open pages immediately
  for (const k of await caches.keys()) { if (k !== CACHE) await caches.delete(k); }
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (CDN/API) pass through
  e.respondWith((async () => {
    try {
      const net = await fetch(e.request, { cache: "no-store" });
      try { (await caches.open(CACHE)).put(e.request, net.clone()); } catch (_) {}
      return net;
    } catch (_) {
      return (await caches.match(e.request)) || Response.error();
    }
  })());
});
