/* ===== 13o-update-check.js ｜ 自動檢查更新（不必再刪掉主頁重加）=====
   做法：
   ① 連網狀態下，進入遊戲主畫面（標題畫面）時自動檢查一次：直接向伺服器讀 sw.js 的 VERSION（繞過所有快取）。
   ② 有新版本 → 跳出「發現新版本」通知視窗；按「確認」後立即更新並重新啟動（Service Worker 下載新檔案；卡住時自動清快取＋登出舊 SW 再重新載入）。
      沒有按確認之前不會自己重新載入；比賽進行中不會跳出，回到主畫面才跳。
   ③ 標題畫面原本「檢查更新」按鈕的位置，改成顯示目前遊戲版本（例如「版本 v1.0.5・離線可用」），不能點。
   ★ 不會動 localStorage／IndexedDB／檔案備份：存檔、生涯進度都放在那裡，清掉就不見了。本遊戲沒有使用 cookie。
   公開介面：window.UPD = { check(), apply(), force(), version, remote, pending }。 */
(function () {
  'use strict';
  const PAGE_VER = 'v1.1.5';      // ★ 與 sw.js 的 VERSION 同步（每次改版一起改；tests/test-update-check.js 會檢查是否一致）。只作為「問不到 Service Worker」時的最後備援，確保右下角不會再出現「—」
  const noSW = !('serviceWorker' in navigator) || location.protocol === 'file:';
  const KEY = 'cpbl.updMsg', VK = 'cpbl.ver';
  const U = window.UPD = { version: null, remote: null, pending: false, ready: null, check: check, force: force };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } } };
  const parseVer = t => { const m = /const\s+VERSION\s*=\s*'([^']+)'/.exec(t || ''); return m ? m[1] : null; };
  U._parse = parseVer;
  const inGame = () => { try { return typeof G !== 'undefined' && G && G.mode === 'play'; } catch (e) { return false; } };
  /* ---------- 跑馬燈 ---------- */
  let bar = null;
  function css() {
    if (document.getElementById('updCss')) return; const st = document.createElement('style'); st.id = 'updCss';
    st.textContent = '#updBar{position:fixed;left:0;right:0;top:0;height:22px;z-index:9400;overflow:hidden;background:linear-gradient(90deg,rgba(20,90,50,.88),rgba(10,60,110,.88));border-bottom:1px solid rgba(255,255,255,.35);color:#eaffef;font-size:12px;font-weight:800;line-height:22px;cursor:pointer;display:none}'
      + '#updBar.on{display:block}#updBar .tk{display:inline-block;white-space:nowrap;padding-left:100%;animation:updRun 16s linear infinite}#updBar:hover .tk{animation-play-state:paused}'
      + '@keyframes updRun{to{transform:translateX(-100%)}}body.playing #updBar,body.resOn #updBar{display:none!important}'
      + '#updVer{position:absolute;right:2.5vw;bottom:5vh;z-index:3;padding:6px 12px;color:rgba(255,255,255,.88);font-size:12px;font-weight:700;letter-spacing:.5px;text-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none;user-select:none}'
      + '#updVer .vn{font-weight:900}#updVer .vn.old{color:#9b111e;text-shadow:0 0 3px rgba(255,255,255,.95),0 0 7px rgba(255,255,255,.7),0 1px 2px rgba(255,255,255,.6)}'
      + '#updDlg{position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.65);display:none;align-items:center;justify-content:center;font-family:\"Noto Sans TC\",sans-serif}#updDlg.on{display:flex}'
      + '#updDlg .bx{width:min(88vw,360px);background:#0f2438;border:1px solid rgba(255,255,255,.4);border-radius:14px;padding:18px 18px 14px;color:#eaf4ff;text-align:center;box-sizing:border-box}'
      + '#updDlg h3{margin:0 0 8px;font-size:18px}#updDlg p{margin:0 0 12px;font-size:14px;line-height:1.7}#updDlg b{color:#ffe08a}'
      + '#updDlg button{width:100%;padding:11px;border-radius:10px;border:1px solid #7be69a;background:#1f7a3d;color:#fff;font-size:15px;font-weight:800;cursor:pointer}#updDlg button:disabled{opacity:.6}';
    document.head.appendChild(st);
  }
  function say(text, reloadable) {
    css(); if (!bar) { bar = document.createElement('div'); bar.id = 'updBar'; document.body.appendChild(bar); bar.onclick = () => { if (U.pending) location.reload(); else bar.classList.remove('on'); }; }
    const t = '🔄 ' + text + '　　　' + (reloadable ? '點這裡立即重新載入　　　' : '');
    bar.innerHTML = '<span class="tk">' + t + '</span>'; bar.classList.add('on');
  }
  function hideSoon(ms) { setTimeout(() => { if (bar && !U.pending) bar.classList.remove('on'); }, ms); }
  /* ---------- 版本 ---------- */
  function askVersion(reg) {
    return new Promise(res => {
      const c = navigator.serviceWorker.controller || (reg && reg.active); if (!c) return res(null);      // 頁面沒被接管時（例如強制重新整理）改問 active 的 SW
      const mc = new MessageChannel(); const to = setTimeout(() => res(null), 2500);
      mc.port1.onmessage = e => { clearTimeout(to); if (e.data && typeof e.data.ready === 'boolean') U.ready = e.data.ready; res(e.data && e.data.v || null); };
      try { c.postMessage({ type: 'VER' }, [mc.port2]); } catch (e) { clearTimeout(to); res(null); }
    });
  }
  async function fetchRemoteVersion() {
    try { const r = await fetch('sw.js?_=' + Date.now(), { cache: 'no-store' }); return r.ok ? parseVer(await r.text()) : null; } catch (e) { return null; }
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitUntil = async (fn, ms) => { for (let t = 0; t < ms; t += 250) { if (fn()) return true; await sleep(250); } return fn(); };
  async function getReg() {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { await sleep(1200); reg = await navigator.serviceWorker.getRegistration(); }      // 剛開頁面時 register() 可能還沒完成
    return reg;
  }
  /* check() 回傳：latest 已是最新｜updated 已換上新版（即將重新載入）｜forced 已強制更新｜offline 連不上｜unknown 無法判斷 */
  let inflight = null;
  function check() { return inflight || (inflight = run().catch(() => 'unknown').then(r => { inflight = null; return r; })); }
  async function run() {
    const reg = await getReg(); if (!reg) return 'unknown';
    const [mine, remote] = await Promise.all([askVersion(reg), fetchRemoteVersion()]);
    U.version = mine || U.version; U.remote = remote; showVer();      // 知道伺服器版本後重畫：舊版顯示暗紅色
    if (U.pending) return 'updated';
    if (!remote) return 'offline';
    if (!mine) {      // 問不到目前版本：有新 SW 在安裝就等它，否則不強制（避免重新載入迴圈）
      if (reg.installing || reg.waiting) { await waitUntil(() => U.pending, 25000); return U.pending ? 'updated' : 'unknown'; }
      return 'unknown';
    }
    if (mine === remote && !U.pending) return 'latest';
    notice(remote);      // 有新版本：跳通知，等使用者按「確認」才更新並重新啟動
    return 'available';
  }
  /* ---------- 新版通知視窗 ---------- */
  let dlg = null, shown = false;
  function notice(remote) {
    if (shown) return; shown = true;
    const tryShow = () => {
      if (inGame() || !document.body) return setTimeout(tryShow, 3000);      // 比賽中不打斷，回到主畫面再跳
      css(); dlg = document.getElementById('updDlg');
      if (!dlg) { dlg = document.createElement('div'); dlg.id = 'updDlg'; document.body.appendChild(dlg); ['pointerdown', 'pointerup', 'click'].forEach(ev => dlg.addEventListener(ev, e => e.stopPropagation())); }
      dlg.innerHTML = '<div class="bx"><h3>🔄 發現新版本</h3><p>有新版本 <b>' + (remote || U.remote || '') + '</b> 可以更新。<br>按「確認」後會立即更新並重新啟動遊戲。<br><small>（存檔不會受影響）</small></p><button type="button" id="updOk">確認</button></div>';
      dlg.classList.add('on');
      const ok = document.getElementById('updOk'); ok.onclick = () => { ok.disabled = true; ok.textContent = '更新中…'; apply(); };
    };
    tryShow();
  }
  /* 按下確認後：立即更新並重新啟動。先讓 Service Worker 換上新版（最多等 20 秒）；沒換上就清本遊戲快取＋登出舊 SW 再重新載入 */
  async function apply() {
    if (reloading) return;
    try {
      const reg = await getReg(); if (!reg) return force(true);
      try { reg.update(); } catch (e) { }
      if (U.pending) { reloading = true; return location.reload(); }
      if (await waitUntil(() => U.pending, 20000)) { reloading = true; return location.reload(); }
      const m = await askVersion(reg); if (m && U.remote && m === U.remote) { reloading = true; return location.reload(); }
    } catch (e) { }
    force(true);
  }
  U.apply = apply;
  /* ---------- 新版就緒 ---------- */
  function updated(v) {      // 新版 Service Worker 已接手：不自己重新載入，等使用者在通知視窗按「確認」
    U.pending = true; ls.set(KEY, v || U.remote || ''); showVer(); notice(v || U.remote);
  }
  let first = noSW ? false : !navigator.serviceWorker.controller, reloading = false;
  if (!noSW) navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    askVersion().then(v => {
      v = v || U.remote; const old = ls.get(VK); if (v) ls.set(VK, v);
      if (first) { first = false; if (!old || old === v) return; }      // 第一次安裝取得控制權不算更新；但若之前記過舊版本、現在變了，就是更新
      updated(v);
    });
  });
  /* ---------- 強制更新：只清 Cache Storage 與 Service Worker，不碰存檔 ---------- */
  async function force(auto) {
    if (reloading) return;
    if (!(await fetchRemoteVersion())) { try { say('目前連不上伺服器，已保留離線版本，沒有清除任何東西。請連上網路後再更新。', false); hideSoon(12000); } catch (e) { } return; }      // 連不上就絕不清快取：否則會連離線也玩不了
    reloading = true;
    try { say('正在清除舊快取並下載最新版本…', false); } catch (e) { }
    try { for (const k of await caches.keys()) if (k.indexOf('cpbl2027-') === 0) await caches.delete(k); } catch (e) { }
    try { const regs = await navigator.serviceWorker.getRegistrations(); for (const r of regs) await r.unregister(); } catch (e) { }
    ls.set(KEY, U.remote || 'latest'); ls.del(VK);
    location.reload();
  }
  /* ---------- 重新載入後顯示「已更新」 ---------- */
  function afterReload() {
    const v = ls.get(KEY); if (!v) return; ls.del(KEY);
    askVersion().then(mine => { say('遊戲已更新至最新版本 ' + (mine || v) + '，若有相關問題請洽 Cam.Su，LINE ID:c468116', false); hideSoon(17000); });
  }
  /* ---------- 標題畫面：顯示目前遊戲版本（右下角，原本「檢查更新」按鈕的位置）---------- */
  const verNum = v => { const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
  const verCmp = (a, b) => { const x = verNum(a), y = verNum(b); if (!x || !y) return a === b ? 0 : NaN; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  U._cmp = verCmp;
  function curVer() { return U.version || PAGE_VER || ls.get(VK) || null; }
  function isOld() {      // 這台裝置的版本比伺服器上的舊 → 版本號顯示暗紅色
    const mine = curVer(), remote = U.remote; if (!mine || !remote) return false;
    const c = verCmp(mine, remote); return c < 0 || (c !== c && mine !== remote);
  }
  function showVer() {
    const t = document.getElementById('title'); if (!t) return; css();
    let b = document.getElementById('updVer'); if (!b) { b = document.createElement('div'); b.id = 'updVer'; t.appendChild(b); }
    const v = curVer();
    b.innerHTML = '目前版本 <span class="vn' + (isOld() ? ' old' : '') + '">' + esc(v || '—') + '</span>' + (U.ready === true ? '・離線可用' : U.ready === false ? '・離線包未完整，請連網開啟一次' : '');
  }
  U.show = showVer;
  async function cacheVersion() {      // 備援：從本遊戲的快取名稱（cpbl2027-<版本>）讀出這台裝置目前用的版本；舊版 Service Worker 不會回答 VER 時也能用
    try {
      const vs = (await caches.keys()).filter(k => k.indexOf('cpbl2027-') === 0).map(k => k.slice(9)).filter(v => verNum(v));
      if (!vs.length) return null; return vs.reduce((a, b) => verCmp(a, b) >= 0 ? a : b);
    } catch (e) { return null; }
  }
  async function loadVer() {      // 目前版本：問 Service Worker → 讀快取名稱 → 頁面內建版本 → 上次記下的版本
    let v = null;
    try { const reg = await navigator.serviceWorker.getRegistration().catch(() => null); v = await askVersion(reg); } catch (e) { }
    if (!v) v = await cacheVersion();
    if (v) { U.version = v; ls.set(VK, v); }
    showVer();
  }
  function start() {
    if (noSW) { showVer(); return; }      // 沒有 Service Worker（file:// 或不支援）：只顯示頁面內建版本
    showVer(); afterReload(); loadVer(); setTimeout(loadVer, 3000);
    if (navigator.onLine !== false) setTimeout(() => { loadVer().then(check); }, 1500);      // 連網：進主畫面自動檢查一次
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', () => setTimeout(start, 300));
})();
