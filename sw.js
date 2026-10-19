/* 天龙人 Service Worker
 * 缓存策略：Cache First（离线优先，后台静默更新）
 * 版本：tlr-v19
 * v19：日历改三行式排版（日期 / 补剂徽章独立行 / 部位），徽章改 chip 永不被裁，今天=实心 pill
 * v18：抽屉手势——最左页（总览）右滑拉出侧边菜单（跟手+松手吸附），
 *      菜单打开后遮罩上左右横扫均可收回（右滑右出淡出，左滑左出）。
 * v17：底部导航改 6 项（总览/体重/喝水/餐食/打卡/财务）+ 左右滑切页 +
 *      日历单元格重排（日期与徽章同行，修复标记肌酸/鱼油后日期被遮），
 *      删除喝水页「喝口水」CTA。
 * v12：代码请求改用 cache:'no-store' 绕开浏览器 HTTP 缓存（Pages 的 max-age=600 会让
 *      「网络优先」失效，导致部署后用户仍拿到旧代码）；注册时加 updateViaCache:'none'。
 */

const CACHE_NAME = 'tlr-v19';

// 核心资源：小、必需。用 addAll 一次性预缓存。
// v7 变更：体重识别已从「截图 OCR」改为「粘贴文本解析」，16MB 的 PP-OCRv4 模型
// 和 Tesseract / onnxruntime / opencv 等 CDN 依赖全部下线，不再预缓存也不再运行时缓存。
// v8 变更：修正注册路径（原为绝对路径 '/sw.js'，子目录下 404 导致 PWA 从未生效），
// 并把 HTML/JS/CSS 改为「网络优先」，避免「部署了但用户拿到的还是旧代码」。
// 换版本号是为了让老客户端 activate 时把旧缓存清掉。
const CORE_ASSETS = [
  '/tianlongren/',
  '/tianlongren/index.html',
  '/tianlongren/styles.css',
  '/tianlongren/app.js',
  '/tianlongren/seed.js',
  '/tianlongren/manifest.json',
  '/tianlongren/icon-192-v2.png',
  '/tianlongren/icon-512-v2.png',
];

// 安装：预缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] 缓存核心资源');
      await cache.addAll(CORE_ASSETS);
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

  // 只处理同源资源：跨域 CDN 一律放行（OCR 下线后已无跨域依赖）
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 代码类资源（HTML/JS/CSS）走「网络优先」：
  // 若沿用 Cache First，用户第一次打开拿到的仍是旧版 app.js，
  // 必须刷新第二次才生效——表现就是「明明部署了却没变化」。
  // 网络失败（离线）时才回退缓存，保证离线仍可用。
  const isCode = request.mode === 'navigate'
    || /\.(?:html|js|css)(?:\?|$)/i.test(url.pathname);
  if (isCode) {
    /* ⚠️ v12 关键修复（根因）：GitHub Pages 对 HTML/JS/CSS 返回 Cache-Control: max-age=600。
       SW 里的 fetch(request) 会被浏览器「HTTP 缓存」直接拦下，返回 10 分钟内的旧副本，
       于是上面的「网络优先」名存实亡 —— 表现就是「明明部署了却没变化」。
       解法：代码请求带 cache:'no-store'，强制绕开 HTTP 缓存走真实网络；
       离线仍由 SW 自己的 Cache Storage 兜底，不受影响。 */
    let netReq = request;
    try { netReq = new Request(request, { cache: "no-store" }); } catch (e) {}
    event.respondWith(
      fetch(netReq).then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return resp;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('/tianlongren/')))
    );
    return;
  }

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
