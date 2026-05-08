const CACHE_NAME = 'qilv-space-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/desktop.css',
  '/js/script.js',
  '/data/poems.json',
  '/assets/Seal1.webp'
];

// 安装阶段：预缓存核心资源，安装完立刻激活不等 tab 关闭
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活阶段：清理旧缓存，立刻接管所有 tab
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：优先从缓存读取
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
