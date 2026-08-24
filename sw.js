const CACHE_NAME = 'stox-v435';
const urlsToCache = [
  './',
  './index.html',
  './app-core.js',
  './indicators.js',
  './data-fetcher.js',
  './backtest-engine.js',
  './pattern-store.js',
  './batch-backtest.js',
  './pattern-scoring.js',
  './ml-trainer.js',
  './ml-optimizer.js',
  './pattern-dashboard.js',
  './live-ml.js',
  './pattern-integration.js',
  './technical-panel.js',
  './reports.js',
  './backup.js',
  './sync.js',
  './notepad.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.29.7/babel.min.js'
];

self.addEventListener('install', event => {
  /* If precaching fails (offline / CDN hiccup) still activate —
     network-first fetch ensures fresh code arrives on the next load anyway. */
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  var url = new URL(event.request.url);
  var sameOrigin = url.origin === self.location.origin;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(r => {
        if (r && r.status === 200) {
          var clone = r.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return r;
        }
        return caches.match(event.request).then(cached => cached || r);
      }).catch(() => caches.match(event.request))
    );
  } else if (sameOrigin) {
    /* App scripts/data: network-first so code updates actually arrive.
       Falls back to the cached copy when offline. */
    event.respondWith(
      fetch(event.request).then(r => {
        if (r && r.status === 200) {
          var clone = r.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return r;
        }
        return caches.match(event.request).then(cached => cached || r);
      }).catch(() => caches.match(event.request))
    );
  } else {
    /* CDN assets: cache-first. */
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) return response;
        return fetch(event.request).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
      })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
