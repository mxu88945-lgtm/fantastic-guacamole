// Network-first service worker: always try to fetch the latest from the network,
// fall back to cache only when offline. This keeps the app auto-updating so code
// changes show up on next launch instead of getting stuck behind an old cache.
const CACHE = "jyc-chat-cache";

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    try {
      const net = await fetch(e.request);
      try { const cache = await caches.open(CACHE); cache.put(e.request, net.clone()); } catch (_) {}
      return net;
    } catch (_) {
      const cached = await caches.match(e.request);
      return cached || Response.error();
    }
  })());
});
