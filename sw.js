/* Offline support: keeps the app and the map tiles you have viewed. Bump VERSION after changing files. */
const VERSION = 'gridnav-v3.3.1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/geo.js', 'js/routes.js', 'js/store.js', 'js/print.js', 'js/app.js',
  'js/native.js', 'vendor/fonts.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
// Map library: from the app folder if it is there, else the internet copy. Saved now so the map works offline later.
const OPTIONAL = ['vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'];
const TILE_HOSTS = /arcgisonline\.com|opentopomap\.org|tile\.openstreetmap\.org/;
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => Promise.allSettled(OPTIONAL.map(u => c.add(u))))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'tiles').map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (TILE_HOSTS.test(url.host)) { // map tiles: cache as you browse, so viewed areas work offline
    e.respondWith(caches.open('tiles').then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // app files and libraries: network first (fresh), cache as fallback
  e.respondWith(fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; })
    .catch(() => caches.match(req).then(h => h || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
