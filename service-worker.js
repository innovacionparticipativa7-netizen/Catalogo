const CACHE_NAME = "catalogo-ip-v1";

const FILES_TO_CACHE = [
  "./",
  "./login.html",
  "./index.html",
  "./Favicon.png",
  "./logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});