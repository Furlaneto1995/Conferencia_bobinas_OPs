/* Conferência de Bobinas — Service Worker
 * setor-v1: importação por coluna SETOR + network-first.
 * Assets estáticos usam cache com atualização em segundo plano.
 */
const CACHE_NAME = "conferencia-bobinas-setor-v1";

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
  try {
    return new URL(url, self.location.href).origin === self.location.origin;
  } catch (e) {
    return false;
  }
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
  return (
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".webp") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico") ||
    path.endsWith(".woff") ||
    path.endsWith(".woff2") ||
    path.endsWith(".json") ||
    path.endsWith(".map")
  );
}

async function putInCache(request, response) {
  try {
    if (!response || !response.ok) return;
    // Só cacheia GET same-origin
    if (request.method !== "GET") return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch (e) {
    // ignore quota / opaque errors
  }
}

self.addEventListener("install", (event) => {
  // Ativa imediatamente a nova versão
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const asset of PRECACHE_ASSETS) {
        try {
          const res = await fetch(asset, { cache: "no-store" });
          if (res && res.ok) {
            await cache.put(asset, res.clone());
            // Também guarda index como navegação raiz
            if (asset === "./index.html") {
              try { await cache.put("./", res.clone()); } catch (e) {}
            }
            console.log("[SW] Cacheado:", asset);
          } else {
            console.warn("[SW] Resposta inválida ao cachear:", asset, res && res.status);
          }
        } catch (err) {
          console.warn("[SW] Falhou ao cachear:", asset, err);
        }
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Removendo cache antigo:", key);
            return caches.delete(key);
          })
      );
      await self.clients.claim();
      // Avisa abas abertas que o SW novo assumiu
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "SW_ACTIVATED", cache: CACHE_NAME });
      }
    })()
  );
});

// Permite a página pedir skipWaiting se necessário
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data && data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Deixa Firebase / Supabase / CDNs irem direto na rede (sem cache do SW)
  if (!sameOrigin(url.href)) return;

  // HTML / navegação: NETWORK FIRST (atualiza o app sozinho)
  if (isHtmlRequest(request, url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: "no-store" });
          if (fresh && fresh.ok) {
            await putInCache(request, fresh);
            // Mantém cópia canônica do index
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put("./index.html", fresh.clone());
              await cache.put("./", fresh.clone());
            } catch (e) {}
          }
          return fresh;
        } catch (err) {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("./index.html")) ||
            (await caches.match("./"));
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  // Assets estáticos same-origin: stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then(async (res) => {
            if (res && res.ok) await cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);

        if (cached) {
          // Atualiza em segundo plano
          event.waitUntil(networkPromise);
          return cached;
        }

        const fresh = await networkPromise;
        if (fresh) return fresh;

        // Fallback genérico
        return caches.match(request);
      })()
    );
    return;
  }

  // Demais GETs same-origin: rede com fallback de cache
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) await putInCache(request, fresh);
        return fresh;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
