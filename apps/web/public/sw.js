const CACHE_NAME = "sync-disc-shell-v1";
const SHELL_URL = "/";
const PRECACHE = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("sync-disc-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

const putInCache = (request, response) =>
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, response))
    .catch(() => undefined);

const cacheFirst = async (request) => {
  const cached = await caches.match(request, { ignoreVary: true });

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    await putInCache(request, response.clone());
  }

  return response;
};

const offlineShell = async () =>
  (await caches.match(SHELL_URL, { ignoreVary: true })) ?? Response.error();

const networkFirstNavigation = async (request) => {
  try {
    const response = await fetch(request);

    if (response.ok) {
      await putInCache(SHELL_URL, response.clone());
      return response;
    }

    return (await caches.match(SHELL_URL, { ignoreVary: true })) ?? response;
  } catch {
    return offlineShell();
  }
};

const isStaticAsset = (request, url) => {
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/electric/")) {
    return false;
  }

  if (request.headers.has("authorization") || request.cache === "no-store") {
    return false;
  }

  if (url.pathname.startsWith("/assets/")) {
    return true;
  }

  return ["font", "image", "style", "script", "worker", "manifest"].includes(request.destination);
};

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(request));
  }
});
