// Service worker : tout en cache, cache d'abord. Incrémenter VERSION à chaque livraison.

const VERSION = 1;
const CACHE = `burnout-v${VERSION}`;
const FICHIERS = [
    './',
    'index.html',
    'manifest.webmanifest',
    'css/style.css',
    'js/app.js',
    'js/ble.js',
    'js/trame.js',
    'icones/icone.svg',
    'icones/icone-192.png',
    'icones/icone-512.png',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((noms) => Promise.all(noms.filter((nom) => nom !== CACHE).map((nom) => caches.delete(nom))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then((reponse) => reponse ?? fetch(e.request)));
});
