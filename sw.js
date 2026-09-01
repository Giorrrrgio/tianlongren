/* 天龙人 Service Worker
 * 缓存策略：Cache First（离线优先，后台静默更新）
 * 版本：tlr-v6
 */

const CACHE_NAME = 'tlr-v6';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/tianlongren/',
  '/tianlongren/index.html',
  '/tianlongren/styles.css',
  '/tianlongren/app.js',
  '/tianlongren/seed.js',
  '/tianlongren/manifest.json',
  '/tianlongren/icon-192-v2.png',
  '/tianlongren/icon-512-v2.png',
  // PP-OCRv4 ONNX 模型（自托管到 GitHub Pages，国内可达）
  '/tianlongren/models/ocr/det.onnx',
  '/tianlongren/models/ocr/rec.onnx',
  '/tianlongren/models/ocr/cls.onnx',
  '/tianlongren/models/ocr/ppocr_keys_v1.txt',
];

// OCR 引擎 + Tesseract CDN：跨域资源需要运行时缓存（install 时无法预缓存）
const OCR_CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'esm.sh',
  'unpkg.com',
  'fastly.jsdelivr.net',
];

// 安装：预缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 缓存静态资源');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting(); // 激活新的 SW
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] 清除旧缓存:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim(); // 立即控制所有页面
});

// 拦截请求：Cache First 策略
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只拦截 GET 请求
  if (request.method !== 'GET') return;

  // 不缓存 API 请求（如果有）
  if (request.url.includes('/api/')) return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isOCRCdn = OCR_CDN_HOSTS.includes(url.hostname);

  // 跨域 CDN 资源：仅 OCR 相关的（onnx-ocr-js / onnxruntime-web / opencv-js / tesseract）
  if (isOCRCdn) {
    // 用 stale-while-revalidate 模式：先返回缓存（秒开），后台更新
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((resp) => {
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 同源资源：Cache First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // 有缓存 → 返回缓存（后台更新）
        fetchAndCache(request); // 静默更新
        return cachedResponse;
      }

      // 无缓存 → 网络获取
      return fetchAndCache(request);
    })
  );
});

// 获取并缓存
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);

    // 只缓存成功响应
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }

    return response;
  } catch (error) {
    // 网络失败 → 返回离线页面
    if (request.destination === 'document') {
      return caches.match('/tianlongren/');
    }
    throw error;
  }
}
