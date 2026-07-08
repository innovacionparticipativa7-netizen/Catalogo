const CACHE_NAME = "catalogo-ip-v2"; // sube este número cada vez que publiques cambios importantes
const FILES_TO_CACHE = [
  "./",
  "./login.html",
  "./index.html",
  "./Favicon.png",
  "./logo.png"
];

// Instala y guarda archivos base
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting(); // activa la nueva versión sin esperar a que cierren pestañas
});

// Borra cachés viejas y toma control inmediato
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(nombres =>
      Promise.all(
        nombres
          .filter(nombre => nombre !== CACHE_NAME)
          .map(nombre => caches.delete(nombre))
      )
    ).then(() => self.clients.claim())
  );
});

// Estrategia: red primero, caché solo como respaldo sin internet
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(respuestaRed => {
        // Guarda copia fresca en caché para uso offline futuro
        const clon = respuestaRed.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clon));
        return respuestaRed;
      })
      .catch(() => caches.match(event.request)) // sin internet, usa caché
  );
});
