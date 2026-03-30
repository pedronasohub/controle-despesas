const CACHE_NAME = 'hub-custos-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  // Adicione aqui outros arquivos estáticos se quiser (CSS, imagens, etc.)
];

// Instalação - Cache dos arquivos essenciais
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Ativação - Limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch - Estratégia Cache First, depois Network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna do cache se existir
        if (response) return response;
        
        // Senão busca na rede
        return fetch(event.request);
      })
  );
});