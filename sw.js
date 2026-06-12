// Service worker for offline play. Bump CACHE_VERSION on each deploy so clients
// pick up new assets (the activate handler purges older caches).
const CACHE_VERSION = "entrelinhas-v1.1.0";

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
  // `cache: "reload"` bypasses the HTTP cache so a new SW always precaches the
  // freshly deployed bytes, never a stale copy the browser still has cached.
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
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
    // Fetch by URL with `cache: "reload"` to bypass the HTTP cache (a navigate
    // Request can't be reconstructed with an init, so we can't reuse it here).
    event.respondWith(
      fetch(request.url, { cache: "reload" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  // Static assets: stale-while-revalidate. Serve the cached copy at once (fast,
  // and works offline), but always refetch in the background (bypassing the HTTP
  // cache) and update the cache, so a new deploy is picked up on the next load
  // even if CACHE_VERSION wasn't bumped. Offline, the background fetch just fails
  // and the cached copy keeps serving.
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(new Request(request, { cache: "reload" }))
          .then((response) => {
            if (response.ok && response.type === "basic") cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        // Keep the SW alive until the background refresh settles.
        event.waitUntil(network.catch(() => {}));
        return cached || network;
      }),
    ),
  );
});
