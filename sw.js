// Service worker: trzyma pliki aplikacji w pamięci, żeby otwierała się bez internetu.
// Dane z Google (Drive, Sheets, logowanie) nie są tu cache'owane.
const VERSION = 'kuchnia-v1.0.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/util.js', 'js/schema.js', 'js/google.js', 'js/demo.js', 'js/store.js', 'js/ui.js',
  'js/views/sheets.js', 'js/views/recipes.js', 'js/views/form.js', 'js/views/plan.js', 'js/views/list.js', 'js/views/more.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'kuchnia-fonts').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Czcionki Google: najpierw pamięć, w tle aktualizacja.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('kuchnia-fonts').then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Pliki aplikacji: sieć z krótkim limitem, a bez sieci – pamięć.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch(e.request, { signal: ctrl.signal, cache: 'no-cache' });
      clearTimeout(t);
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) ||
        (e.request.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  })());
});
