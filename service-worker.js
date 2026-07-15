/* ==========================================================================
   service-worker.js — Cache offline (App Shell + tablas de refrigerantes)
   ========================================================================== */
const CACHE = 'diagclima-v3';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/pt.js',
  './js/validation.js',
  './js/calculator.js',
  './js/diagnosis.js',
  './js/charge.js',
  './js/settings.js',
  './js/report.js',
  './js/storage.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './refrigerants/R32.json',
  './refrigerants/R410A.json',
  './refrigerants/R134a.json',
  './refrigerants/R407C.json',
  './refrigerants/R290.json',
  './refrigerants/R404A.json',
  './refrigerants/R448A.json',
  './refrigerants/R449A.json',
  './refrigerants/R452A.json',
  './refrigerants/R454B.json',
  './refrigerants/R513A.json',
  './refrigerants/R1234yf.json',
  './refrigerants/R1234ze.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first para assets propios; red con respaldo a cache para el resto.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      // Guardar copias de las tablas JSON descargadas
      if (req.url.includes('/refrigerants/')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
