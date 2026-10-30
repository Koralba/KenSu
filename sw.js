/* sw.js ｜ 離線遊玩用 Service Worker（放在與 baseball.html 同一層）
   - 安裝時把遊戲檔案全部存進手機／電腦；之後沒有網路也能開啟、遊玩
   - 本站檔案：先用快取（秒開），同時背景更新；有改版時，下次開啟就會用到新版
   - 外部檔案（three.js、Google 字型）：第一次連網時存起來，之後離線直接使用
   安裝為「全有或全無」：任何一個遊戲檔案沒下載成功，這次安裝就整個放棄，繼續使用上一個完整版本（舊快取不會被刪）。
   改了遊戲檔案、想讓所有人立刻換新版：把下面的 VERSION 往前進一格。
   版本號格式 v主.次.修（目前 v1.0.9）：每次改版只加最後一位「修」。
   「次」「修」兩位只能是 0～9：「修」滿 9 之後下一版歸 0、讓「次」加 1；「次」滿 9 再進位時歸 0、讓「主」加 1。
   只有第一位「主」沒有上限（可以是 10、12、……）。
   例：v1.0.8 → v1.0.9 → v1.1.0 → v1.1.1 → … → v1.9.9 → v2.0.0 → … → v9.9.9 → v10.0.0 → … → v12.9.9 → v13.0.0 */
const VERSION = 'v1.1.3';
const CACHE = 'cpbl2027-' + VERSION;
const LOCAL = [
  './', 'baseball.html', 'yw_manifest.json',
  'css/01-base-title-menu-hud.css', 'css/02-mobile-layout.css', 'css/03-menu-lineup-result.css', 'css/04-game-buttons-patches.css', 'css/05-save-system.css', 'css/06-transition.css', 'css/07-career.css', 'css/08-versus.css', 'css/09-koshien.css', 'css/10-menu-glass.css',
  'js/01-core-data.js', 'js/02-stadium-scene.js', 'js/03-players-ball-camera.js', 'js/04-pitch-swing-physics.js', 'js/05-play-fielding-runners.js',
  'js/06-play-abs-update.js', 'js/07-cpu-ai.js', 'js/08-audio.js', 'js/09-hud-commentary.js', 'js/10-events.js', 'js/11-game-flow.js',
  'js/12-systems.js', 'js/13-ui-input-menu.js', 'js/13b-save-system.js', 'js/13c-career-create.js', 'js/13d-career-season.js', 'js/13e-career-pro.js', 'js/13f-career-autosim.js', 'js/13g-manual-fielding.js', 'js/13h-career-story.js', 'js/13i-career-economy.js', 'js/13j-catcher-call.js', 'js/13k-story-scenes.js', 'js/13l-abs-camreplay.js', 'js/13m-career-hub.js', 'js/13n-storage-guard.js', 'js/13o-update-check.js', 'js/13p-lan-versus.js', 'js/13q-strikeout-fx.js', 'js/13r-koshien-skin.js', 'js/13s-clay-skin.js', 'js/13t-face-expression.js', 'js/13u-pickoff-buttons.js', 'js/13v-great-replay.js', 'js/13w-hr-show.js', 'js/vendor/qrcode.min.js', 'js/vendor/jsqr.min.js', 'js/14-bullpen-loop-boot.js',
  'images/su.ico', 'images/su-180.png', 'images/su-192.png', 'images/su-512.png',
  'js/three.min.js'                       // 必要：three.js r128 本地版（離線時遊戲靠它啟動）
];
const AUDIO = [      // 音檔曲目（要與 js/08-audio.js 的 BGM_FILE_TRACKS 同步）；盡力預存：缺檔不會讓安裝失敗，遊戲會自動改播預設曲
  // 'audio/file1.mp3',
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900&family=Noto+Sans+TC:wght@500;700;900&family=Mochiy+Pop+One&family=Orbitron:wght@700;900&display=swap';   // 與 baseball.html 相同；字型盡力預存，失敗不影響安裝

async function cacheFonts(c) {      // 盡力而為：存字型 CSS 與裡面的字型檔，讓第一次離線也有字型
  try {
    const cssRes = await fetch(FONT_CSS, { mode: 'cors' }); if (!cssRes.ok) return;
    const css = await cssRes.clone().text(); await c.put(FONT_CSS, cssRes);
    const urls = Array.from(new Set((css.match(/https:\/\/fonts\.gstatic\.com[^)'"\s]+/g) || [])));
    await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => { })));
  } catch (e) { }
}
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(LOCAL.map(async u => {      // 全有或全無：任何一個必要檔案失敗就丟錯，安裝失敗，舊 SW 與舊快取原封不動
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if (!res.ok) throw new Error('precache failed: ' + u + ' ' + res.status);
      await c.put(u, res);
    }));
    await cacheFonts(c);
    await Promise.all(AUDIO.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && c.put(u, r)).catch(() => { })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cpbl2027-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
async function isReady() {      // 目前版本的必要檔案是否都在快取裡
  try { const c = await caches.open(CACHE); const hits = await Promise.all(LOCAL.map(u => c.match(u, { ignoreSearch: true }))); return hits.every(Boolean); } catch (e) { return false; }
}
self.addEventListener('message', e => {      // 頁面詢問「目前執行的是哪個版本、離線包是否完整」
  if (e.data && e.data.type === 'VER' && e.ports && e.ports[0]) { const p = e.ports[0]; e.waitUntil(isReady().then(ok => p.postMessage({ v: VERSION, ready: ok }))); }
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin && /\/sw\.js$/.test(u.pathname)) {      // 版本檢查：sw.js 一律直接問伺服器（不吃任何快取），離線才退回快取
    e.respondWith(fetch(r, { cache: 'no-store' }).catch(async () => (await caches.match(r, { ignoreSearch: true })) || new Response('', { status: 504 })));
    return;
  }
  if (u.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = (await c.match(r, { ignoreSearch: true })) || (await caches.match(r, { ignoreSearch: true }));
      const net = fetch(r, { cache: 'no-cache' }).catch(() => fetch(r)).then(res => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = await net;
      if (res) return res;
      if (r.mode === 'navigate') { const f = (await c.match('baseball.html')) || (await caches.match('baseball.html')); if (f) return f; }
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
