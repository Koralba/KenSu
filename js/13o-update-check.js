/* ===== 13o-update-check.js ｜ 自動檢查更新（不必再刪掉主頁重加）=====
   做法：
   ① 只在剛進主畫面（載入完成後）檢查一次，之後不再背景檢查（標題畫面的「檢查更新」鈕可手動再查）：重新向伺服器檢查 sw.js 的 VERSION（繞過所有快取）；有新版就讓 Service Worker 重新下載全部檔案。
   ② 新版就緒後，在主畫面／選單頂部顯示小跑馬燈「遊戲已更新至最新版本 vXX」；人在標題或選單時自動重新載入，比賽中不打斷，改成點跑馬燈再套用。
   ③ 卡住時（新版本一直沒換上）自動清除「快取（Cache Storage）」＋登出舊 Service Worker 後重新載入。
   ★ 不會動 localStorage／IndexedDB／檔案備份：存檔、生涯進度都放在那裡，清掉就不見了。本遊戲沒有使用 cookie。
   公開介面：window.UPD = { check(), force(), version }。 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const KEY = 'cpbl.updMsg';
  const U = window.UPD = { version: null, remote: null, pending: false, check: check, force: force };
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
      + '#updBtn{position:absolute;right:2.5vw;bottom:5vh;z-index:3;padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.5);background:rgba(10,30,50,.55);color:#fff;font-size:12px;font-weight:700;cursor:pointer}';
    document.head.appendChild(st);
  }
  function say(text, reloadable) {
    css(); if (!bar) { bar = document.createElement('div'); bar.id = 'updBar'; document.body.appendChild(bar); bar.onclick = () => { if (U.pending) location.reload(); else bar.classList.remove('on'); }; }
    const t = '🔄 ' + text + '　　　' + (reloadable ? '點這裡立即重新載入　　　' : '');
    bar.innerHTML = '<span class="tk">' + t + t + '</span>'; bar.classList.add('on');
  }
  function hideSoon(ms) { setTimeout(() => { if (bar && !U.pending) bar.classList.remove('on'); }, ms); }
  /* ---------- 版本 ---------- */
  function askVersion() {
    return new Promise(res => {
      const c = navigator.serviceWorker.controller; if (!c) return res(null);
      const mc = new MessageChannel(); const to = setTimeout(() => res(null), 1500);
      mc.port1.onmessage = e => { clearTimeout(to); res(e.data && e.data.v || null); };
      try { c.postMessage({ type: 'VER' }, [mc.port2]); } catch (e) { clearTimeout(to); res(null); }
    });
  }
  async function fetchRemoteVersion() {
    try { const r = await fetch('sw.js?_=' + Date.now(), { cache: 'no-store' }); return r.ok ? parseVer(await r.text()) : null; } catch (e) { return null; }
  }
  let busy = false, stuckT = 0;
  async function check() {
    if (busy) return; busy = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return;
      const [mine, remote] = await Promise.all([askVersion(), fetchRemoteVersion()]);
      U.version = mine || U.version; U.remote = remote;
      try { await reg.update(); } catch (e) { }
      if (mine && remote && mine !== remote) {
        say('發現新版本 ' + remote + '，正在下載最新內容…', false);
        clearTimeout(stuckT); stuckT = setTimeout(async () => {      // 20 秒後仍是舊版 → 強制清快取重來
          const m2 = await askVersion(); if (m2 && m2 !== remote) force(true);
        }, 20000);
      }
    } finally { busy = false; }
  }
  /* ---------- 新版就緒 ---------- */
  function updated(v) {
    U.pending = true; ls.set(KEY, v || U.remote || '');
    say('遊戲已更新至最新版本' + (v || U.remote ? ' ' + (v || U.remote) : '') + '！', true);
    if (!inGame()) setTimeout(() => { if (!inGame()) location.reload(); }, 3500);      // 標題／選單：自動套用
    else { const t = setInterval(() => { if (!inGame()) { clearInterval(t); setTimeout(() => location.reload(), 2500); } }, 4000); }      // 比賽中：等回到選單再套用
  }
  let first = !navigator.serviceWorker.controller, reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (first) { first = false; return; }      // 第一次安裝取得控制權不算更新
    if (reloading) return; askVersion().then(v => updated(v || U.remote));
  });
  /* ---------- 強制更新：只清 Cache Storage 與 Service Worker，不碰存檔 ---------- */
  async function force(auto) {
    if (reloading) return; reloading = true;
    try { say('正在清除舊快取並下載最新版本…', false); } catch (e) { }
    try { for (const k of await caches.keys()) if (k.indexOf('cpbl2027-') === 0) await caches.delete(k); } catch (e) { }
    try { const regs = await navigator.serviceWorker.getRegistrations(); for (const r of regs) await r.unregister(); } catch (e) { }
    ls.set(KEY, U.remote || 'latest');
    location.reload();
  }
  /* ---------- 重新載入後顯示「已更新」 ---------- */
  function afterReload() {
    const v = ls.get(KEY); if (!v) return; ls.del(KEY);
    askVersion().then(mine => { say('遊戲已更新至最新版本 ' + (mine || v) + '，內容已同步！', false); hideSoon(14000); });
  }
  /* ---------- 標題畫面的手動按鈕 ---------- */
  function addBtn() {
    const t = document.getElementById('title'); if (!t || document.getElementById('updBtn')) return; css();
    const b = document.createElement('button'); b.id = 'updBtn'; b.type = 'button'; b.textContent = '🔄 檢查更新';
    b.onclick = ev => { ev.stopPropagation(); b.textContent = '檢查中…'; check().then(() => setTimeout(() => { b.textContent = U.pending ? '已是最新' : (U.remote && U.version && U.remote !== U.version ? '下載中…' : '✔ 已是最新版'); setTimeout(() => b.textContent = '🔄 檢查更新', 3000); }, 1500)); };
    b.ondblclick = ev => { ev.stopPropagation(); force(); };
    t.appendChild(b);
  }
  function start() {
    addBtn(); afterReload(); setTimeout(check, 1500);
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', () => setTimeout(start, 300));
})();
