const CACHE_NAME = "edubrief-shell-v1.2.1-theme-week-navigation";
const APP_BASE = new URL("./", self.location.href);
const CONTENT_BASE = new URL("../../outputs/edubrief/content-packages/foundation-weeks/", APP_BASE);
const PRECACHE_URLS = [
  new URL("./", APP_BASE).href,
  new URL("./index.html", APP_BASE).href,
  new URL("./styles.css", APP_BASE).href,
  new URL("./app.mjs", APP_BASE).href,
  new URL("./db.mjs", APP_BASE).href,
  new URL("./domain.mjs", APP_BASE).href,
  new URL("./content-loader.mjs", APP_BASE).href,
  new URL("./navigation.mjs", APP_BASE).href,
  new URL("manifest.json", CONTENT_BASE).href,
  new URL("edubrief-foundation-weeks.content.json", CONTENT_BASE).href,
];
const ALLOWED_PATHS = new Set(PRECACHE_URLS.map((url) => new URL(url).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("edubrief-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  const isScopedNavigation = event.request.mode === "navigate" && requestUrl.pathname.startsWith(APP_BASE.pathname);
  if (isScopedNavigation) {
    event.respondWith(caches.match(new URL("./index.html", APP_BASE).href));
    return;
  }

  if (!ALLOWED_PATHS.has(requestUrl.pathname)) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached ?? fetch(event.request)),
  );
});
