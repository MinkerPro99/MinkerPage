const staticCacheName = 'site-static-v5';

const assets = [
  '/',
  '/index.html',
  '/main.html',
  '/css/bootstrap.min.css',
  '/css/style.css',
  '/css/main.css',
  '/js/app.js',
  '/js/index.js',
  '/js/main.js',
  '/manifest.json',
  '/img/1kIcon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(staticCacheName).then(cache => cache.addAll(assets)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const deletePromises = keys
        .filter(key => key !== staticCacheName)
        .map(key => caches.delete(key));
      return Promise.all(deletePromises);
    })
  );
});

self.addEventListener('fetch', event => {
  // Loads navigations from network first and falls back to the cached app shell.
  async function navigateOrDisplayOfflinePage() {
    try {
      const fetchRes = await fetch(event.request);
      if (fetchRes && fetchRes.status === 200) {
        return fetchRes;
      }
      const cacheRes = await caches.match(event.request);
      return cacheRes || caches.match('/index.html');
    } catch (error) {
      const cacheRes = await caches.match(event.request);
      return cacheRes || caches.match('/index.html');
    }
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(navigateOrDisplayOfflinePage());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(event.request);
    } catch (error) {
      const cacheRes = await caches.match(event.request);
      return cacheRes || new Response('', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  })());
});
