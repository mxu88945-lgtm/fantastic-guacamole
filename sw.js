// Network-first service worker that BYPASSES the HTTP cache (cache: "no-store"),
// so the very latest files always load when online; falls back to the cache only
// when offline. This stops code changes from getting stuck behind a stale cache.
const CACHE = "role-chat-cache-v443";

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
  // Force-refresh uses a timestamp query. Caching each timestamp as a different
  // 1MB document gradually bloats iOS storage; keep one canonical fallback entry.
  const cacheRequest = new Request(url.origin + url.pathname, { method: "GET" });
  e.respondWith((async () => {
    try {
      const net = await fetch(e.request, { cache: "no-store" });
      try { (await caches.open(CACHE)).put(cacheRequest, net.clone()); } catch (_) {}
      return net;
    } catch (_) {
      return (await caches.match(cacheRequest)) || Response.error();
    }
  })());
});

// v402 后台推送：到点由推送服务器叫醒，显示通知；点通知回到顾祁砚。
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || "顾祁砚", { body: data.body || "", tag: data.tag || undefined, data: { url: data.url || "./" }, icon: "apple-touch-icon.png", badge: "apple-touch-icon.png" }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
