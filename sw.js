/* Conferência de Bobinas — Service Worker
 * v11: painel conferencia (cards Abrir) + HTML network-first.
 * SEMPRE publique este arquivo junto com index.html
 */
const CACHE_NAME = "conferencia-bobinas-v11";

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./html5-qrcode.local.js",
  "./jszip.min.js",
];

function sameOrigin(url) {
  try { return new URL(url, self.location.href).origin === self.location.origin; }
  catch (e) { return false; }
}
function isHtmlRequest(request, url) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  const path = url.pathname || "";
  return path.endsWith(".html") || path.endsWith("/") || /\/index\.html$/i.test(path);
}
function isStaticAsset(url) {
  const path = url.pathname || "";
  return /\.(js|css|png|jpe?g|webp|svg|ico|woff2?|json|map)$/i.test(path);
}
async function putInCache(request, response) {
  try {
    if (!response || !response.ok || request.method !== "GET") return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch (e) {}
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of PRECACHE_ASSETS) {
      try {
        const res = await fetch(asset, { cache: "no-store" });
        if (res && res.ok) {
          await cache.put(asset, res.clone());
          if (asset === "./index.html") {
            try { await cache.put("./", res.clone()); } catch (e) {}
          }
        }
      } catch (err) { console.warn("[SW] cache fail", asset, err); }
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "SW_ACTIVATED", cache: CACHE_NAME });
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!sameOrigin(url.href)) return;

  if (isHtmlRequest(request, url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        if (fresh && fresh.ok) {
          await putInCache(request, fresh);
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("./index.html", fresh.clone());
            await cache.put("./", fresh.clone());
          } catch (e) {}
        }
        return fresh;
      } catch (err) {
        return (await caches.match(request)) || (await caches.match("./index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const net = fetch(request).then(async (res) => {
        if (res && res.ok) await cache.put(request, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(net); return cached; }
      return (await net) || cached;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) await putInCache(request, fresh);
      return fresh;
    } catch (err) {
      return caches.match(request);
    }
  })());
});
