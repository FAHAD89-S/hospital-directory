/* Service Worker — دليل التحويلات الداخلية | مستشفى عبري المرجعي (IRH)
 *
 * الاستراتيجية:
 *  - الصفحة الرئيسية: الشبكة أولاً (لتظهر أحدث التعديلات عند وجود إنترنت) مع مهلة 3 ثوانٍ،
 *    ثم النسخة المخزنة عند ضعف الاتصال أو انقطاعه.
 *  - باقي الملفات (أيقونات، manifest): من الكاش أولاً مع تحديثها في الخلفية.
 *  - الطلبات الخارجية (واتساب وغيره) لا يتدخل فيها السيرفيس وركر.
 *
 * عند تغيير الأيقونات أو إضافة ملفات جديدة: ارفع رقم CACHE_VERSION.
 */

const CACHE_VERSION = 'v4';
const CACHE_PREFIX = 'ih-ext-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const NETWORK_TIMEOUT_MS = 3000;

// كل المسارات نسبية لموقع sw.js، فتعمل على الجذر أو داخل مجلد فرعي (مثل GitHub Pages)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

const INDEX_URL = new URL('./index.html', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (fresh && fresh.ok) {
      cache.put(INDEX_URL, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(INDEX_URL, { ignoreSearch: true });
    if (cached) return cached;
    return new Response(
      '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>غير متصل</title>' +
      '<body style="font-family:Tahoma,Arial,sans-serif;text-align:center;padding:48px 20px;color:#1f2a2a">' +
      '<h2>الدليل غير متاح حالياً بدون إنترنت</h2>' +
      '<p>افتح التطبيق مرة واحدة أثناء الاتصال بالإنترنت ليتم حفظه على جهازك.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
