// Service worker for offline play. Bump CACHE_VERSION on each deploy so clients
// pick up new assets (the activate handler purges older caches).
const CACHE_VERSION = "entrelinhas-v1";

// App shell + game logic + word lists. Paths are relative to the SW scope.
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/styles.css",
  "./assets/logo-without-bg.png",
  "./src/app.js",
  "./src/game.js",
  "./src/crossword.js",
  "./src/toast.js",
  "./src/share-helpers.js",
  "./src/dictionary.js",
  "./src/daily.js",
  "./src/storage.js",
  "./src/hint.js",
  "./src/trivia.js",
  "./src/data/answers.js",
  "./src/data/valid.js",
  "./src/data/trivia-curated.js",
  "./src/data/trivia-stats.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so a fresh deploy is picked up online, with the
  // cached shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  // Static assets: cache-first, populating the cache on first network hit.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
