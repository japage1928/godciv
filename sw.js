/* GodCiv service worker: cache-first app shell so the game works offline
   after the first load. Version the cache name when the shell changes. */
const CACHE = "godciv-v14";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./src/main.js",
  "./src/sim.js",
  "./src/sim/core.js",
  "./src/sim/terrain.js",
  "./src/sim/diplomacy.js",
  "./src/sim/grid.js",
  "./src/sim/world.js",
  "./src/sim/brain.js",
  "./src/sim/planning.js",
  "./src/sim/combat.js",
  "./src/sim/step.js",
  "./src/sim/actions.js",
  "./src/render.js",
  "./src/ollama.js",
  "./vendor/three.module.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // The always-on village API is never cached: /api/* is network-only,
  // so polls always read the live server world.
  if (url.pathname.startsWith("/api/")) return;
  // Only cache same-origin GETs. Ollama and any other API calls go to the network.
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  // Navigations are network-first: a cached old shell must never hide a
  // deploy (the stale-PWA lesson). Cached HTML is only the offline fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
        return res;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
