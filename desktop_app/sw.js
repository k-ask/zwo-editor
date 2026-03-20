const CACHE_NAME = 'zwo-mobile-v1.3';
const ASSETS = [
    '/zwo-editor-mobile/',
    '/zwo-editor-mobile/index.html?v=1.3',
    '/zwo-editor-mobile/style.css?v=1.3',
    '/zwo-editor-mobile/editor.js?v=1.3',
    '/zwo-editor-mobile/manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force new SW to enter activate state immediately
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        Promise.all([
            self.clients.claim(), // Force new SW to control loaded pages immediately
            caches.keys().then(keys => Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            ))
        ])
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});
