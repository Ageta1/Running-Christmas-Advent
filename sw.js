// Change the release identifier whenever the offline shell changes.
const PREFIX = 'run-advent:' + self.registration.scope + ':';
const CACHE = PREFIX + '7763605cdfa05493';
const SHELL = [
  "index.html",
  "mobile.css",
  "mobile.js",
  "runner-accounts.js?v=9",
  "backend-config.js",
  "cloud-foundation.js",
  "manifest.webmanifest",
  "icons/app-180.png",
  "icons/app-192.png",
  "icons/app-512.png",
  "icons/maskable.png",
  "vendor/supabase-2.119.2.js"
];
const url = path => new URL(path, self.registration.scope).href;
const files = new Set(SHELL.map(url));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL.map(path => new Request(url(path), {cache:'reload'})));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'activate') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const requestUrl = new URL(req.url);
  const page = req.mode === 'navigate' &&
    [url('./'),url('index.html')].includes(requestUrl.origin + requestUrl.pathname);
  if (!page && !files.has(req.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(page ? url('index.html') : req)) || fetch(req);
  })());
});
