/* sw.js ｜ 離線遊玩用 Service Worker（放在與 baseball.html 同一層）
   - 安裝時把遊戲檔案全部存進手機／電腦；之後沒有網路也能開啟、遊玩
   - 本站檔案：先用快取（秒開），同時背景更新；有改版時，下次開啟就會用到新版
   - 外部檔案（three.js、Google 字型）：第一次連網時存起來，之後離線直接使用
   改了遊戲檔案、想讓所有人立刻換新版：把下面的 VERSION 數字加 1 */
const VERSION = 'v48';
const CACHE = 'cpbl2027-' + VERSION;
const LOCAL = [
  './', 'baseball.html', 'yw_manifest.json',
  'css/01-base-title-menu-hud.css', 'css/02-mobile-layout.css', 'css/03-menu-lineup-result.css', 'css/04-game-buttons-patches.css', 'css/05-save-system.css', 'css/06-transition.css', 'css/07-career.css',
  'js/01-core-data.js', 'js/02-stadium-scene.js', 'js/03-players-ball-camera.js', 'js/04-pitch-swing-physics.js', 'js/05-play-fielding-runners.js',
  'js/06-play-abs-update.js', 'js/07-cpu-ai.js', 'js/08-audio.js', 'js/09-hud-commentary.js', 'js/10-events.js', 'js/11-game-flow.js',
  'js/12-systems.js', 'js/13-ui-input-menu.js', 'js/13b-save-system.js', 'js/13c-career-create.js', 'js/13d-career-season.js', 'js/13e-career-pro.js', 'js/13f-career-autosim.js', 'js/13g-manual-fielding.js', 'js/13h-career-story.js', 'js/13i-career-economy.js', 'js/13j-catcher-call.js', 'js/13k-story-scenes.js', 'js/13l-abs-camreplay.js', 'js/13m-career-hub.js', 'js/13n-storage-guard.js', 'js/14-bullpen-loop-boot.js',
  'images/su.ico', 'images/su-180.png', 'images/su-192.png', 'images/su-512.png',
  'js/three.min.js'                       // 選用：把 three.js r128 下載放在這裡，第一次安裝就能完全離線（沒有這個檔案也不會出錯）
];
const REMOTE = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(LOCAL.concat(REMOTE).map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { })));   // 個別存放：缺檔不會讓整個安裝失敗
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cpbl2027-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(r, { ignoreSearch: true });
      const net = fetch(r).then(res => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = await net;
      if (res) return res;
      if (r.mode === 'navigate') { const f = await c.match('baseball.html'); if (f) return f; }
      return new Response('離線中，且這個檔案還沒被存下來。請連網開啟一次遊戲。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
  } else if (/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u.host)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(r);
      if (hit) return hit;
      try { const res = await fetch(r); if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; }
      catch (err) { return new Response('', { status: 504 }); }
    })());
  }
});
