/* Service Worker — مفروشات العصار
 * - الصفحات (navigations): شبكة أولاً مع رجوع للكاش ثم صفحة /offline
 * - الملفات الثابتة والصور: كاش أولاً مع تحديث بالخلفية (يخفف الاعتماد على إنترنت ضعيف)
 * - لا يُخزَّن شيء من /api أو /dashboard أو /account أو طلبات غير GET */
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ['/', '/products', '/offers', '/branches', '/offline'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const PRIVATE = /^\/(api|dashboard|account|mfa|login)/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    if (url.origin === location.origin && PRIVATE.test(url.pathname)) return;
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(PAGES).then((c) => c.put(req, copy)); }
        return res;
      }).catch(async () => (await caches.match(req)) || (await caches.match('/offline'))),
    );
    return;
  }

  const isStatic = url.pathname.startsWith('/_next/static/') || /\.(png|jpg|jpeg|webp|svg|woff2?)$/.test(url.pathname) ||
    url.pathname.includes('/storage/v1/object/public/');
  if (isStatic) {
    e.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }),
    );
  }
});
