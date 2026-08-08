const CACHE_NAME = 'stox-v212';
const urlsToCache = [
  './',
  './index.html',
  './app-core.js',
  './indicators.js',
  './data-fetcher.js',
  './backtest-engine.js',
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
  } else {
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
