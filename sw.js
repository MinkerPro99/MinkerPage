const staticCacheName = 'site-static-v3';

const assets = [
    '/',
    '/index.html',
    '/js/app.js',
    '/css/style.css',
    '/manifest.json',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.gstatic.com/s/materialicons/v142/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2'
];



// install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(staticCacheName).then(cache => {
            console.log('saves all important files in cache');
            cache.addAll(assets);
        })
    );
});

// activate event
self.addEventListener('activate', event => {
    event.waitUntil(
    caches.keys().then(keys => {
      // Lösche alle Caches, die nicht unserem aktuellen 'staticCacheName' entsprechen
      const deletePromises = keys
        .filter(key => key !== staticCacheName)
        .map(key => caches.delete(key));
      return Promise.all(deletePromises);
    })
  );
});

// fetch event
self.addEventListener("fetch", event => {
    async function navigateOrDisplayOfflinePage() {
        try {
            const fetchRes = await fetch(event.request);
            if (fetchRes && fetchRes.status === 200) {
                return fetchRes;
            } else {
                const cacheRes = await caches.match(event.request);
                return cacheRes || caches.match('/index.html');
            }
        } catch (error) {
            const cacheRes = await caches.match(event.request);
            return cacheRes || caches.match('/index.html');
        }
    }

    // Differentiate between navigation requests and others
    if (event.request.mode === 'navigate') {
        // For page navigations, use the offline fallback strategy
        event.respondWith(navigateOrDisplayOfflinePage());
    } else {
        // For non-navigation requests (JS, CSS, images, etc.)
        event.respondWith((async () => {
            try {
                // Try network first
                return await fetch(event.request);
            } catch (error) {
                // If network fails, try cache
                const cacheRes = await caches.match(event.request);
                // If not in cache, return a minimal fallback or empty response
                // (Do not return fallback.html here)
                return cacheRes || new Response('', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            }
        })());
    }
});