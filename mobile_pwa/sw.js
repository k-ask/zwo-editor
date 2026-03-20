const CACHE_NAME = 'zwo-editor-v1.4-1773997987';
const ASSETS = [
    './',
    './index.html',
    './style.css?v=1.3',
    './editor.js?v=1.3',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(keys => Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            ))
        ])
    );
});

self.addEventListener('fetch', (e) => {
    // Network first for HTML (navigations) and workouts.js
    if (e.request.mode === 'navigate' || e.request.url.includes('workouts.js')) {
        e.respondWith(
            fetch(e.request)
                .then(response => {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clonedResponse));
                    return response;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache first for other static assets
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});
