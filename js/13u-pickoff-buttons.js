'use strict';
/* 13u-pickoff-buttons.js ｜ 牽制按鈕改到「每個壘包旁」
   - 玩家投球時，壘上每個有跑者的壘包旁邊各出現一顆「牽制」按鈕（把壘包的 3D 位置投影到螢幕上，跟著鏡頭走；壘包在畫面外就貼在螢幕邊緣並加箭頭）。
   - 點哪顆就牽制哪個壘包的跑者：直接呼叫 11 的 doPickoff(i)（i＝0／1／2＝一／二／三壘）。
   - 隨時可牽制：投球前（pre）、以及投手還沒抬腿的出手動作中（windup 且 !G.legUp，含跑者已經起跑／探頭準備盜壘時）；抬腿之後不可（投手一旦開始投球動作就不能再傳壘）。
   - 離壘越遠，按鈕越紅、會脈動（r.lead ＞ 2.4 公尺），提示「這個人可以抓」。
   - 區網對戰（vsOn()）一律不啟用本檔，沿用舊的牽制鍵（避免兩機不同步）；鍵盤 E 照舊可用。
   - 啟用時用 body.pkOv 把舊的 #btnPick 藏起來。
   依賴：04 的 G／E／vsOn／engPitches／doPickoff／baseSpot、03 的 camera／CAMC。 */
const PKB = (function () {
  const CSS = `
.pkb{position:fixed;z-index:45;display:none;min-width:58px;padding:7px 11px;border-radius:999px;border:2px solid rgba(255,255,255,.85);background:linear-gradient(#3b8be8,#1d5fb8);color:#fff;font:900 14px 'Noto Sans TC',sans-serif;letter-spacing:.04em;box-shadow:0 3px 10px rgba(0,0,0,.45);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transform:translate(-50%,-50%);white-space:nowrap}
.pkb:active{transform:translate(-50%,-50%) scale(.92)}
.pkb.far{background:linear-gradient(#ff6a4a,#d6361b);animation:pkbP .7s ease-in-out infinite alternate}
@keyframes pkbP{to{box-shadow:0 0 0 6px rgba(255,90,60,.35),0 3px 10px rgba(0,0,0,.45)}}
body.pkOv #btnPick{display:none!important}
@media (max-width:700px){.pkb{padding:6px 9px;font-size:13px;min-width:50px}}`;
  const els = []; let cssOK = false, last = '';
  function css() { if (cssOK) return; cssOK = true; const s = document.createElement('style'); s.id = 'pkbCss'; s.textContent = CSS; document.head.appendChild(s); }
  function canPick() {
    try {
      if (typeof G === 'undefined' || !G || G.mode !== 'play' || G.over || G.freeze || (typeof PL !== 'undefined' && PL)) return false;
      if (typeof vsOn === 'function' && vsOn()) return false;
      if (typeof engPitches !== 'function' || !engPitches()) return false;
      if (G.intWalk || G.rosinBusy || G.batFetch) return false;
      return G.phase === 'pre' || (G.phase === 'windup' && !G.legUp);
    } catch (e) { return false; }
  }
  function mk(i) {
    const b = document.createElement('button'); b.className = 'pkb'; b.type = 'button'; b.dataset.i = i;
    const go = e => { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); if (!canPick()) return; try { doPickoff(i); } catch (err) { console.error(err); } };
    b.addEventListener('pointerdown', go);
    ['mousedown', 'touchstart', 'click', 'touchend', 'pointerup'].forEach(ev => b.addEventListener(ev, e => { e.stopPropagation(); if (ev !== 'touchstart') e.preventDefault(); }));      // 不要讓點擊穿透到下面的「投球／揮棒」
    document.body.appendChild(b); els[i] = b; return b;
  }
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  function place(i, r) {
    const b = els[i] || mk(i), cv = document.getElementById('gl'); if (!cv || !_v) { b.style.display = 'none'; return; }
    const rc = cv.getBoundingClientRect(), sp = baseSpot(i + 1);
    _v.set(sp.x, .3, sp.z).project(camera);
    if (_v.z > 1) { b.style.display = 'none'; return; }      // 壘包在鏡頭後面
    let x = rc.left + (_v.x * .5 + .5) * rc.width, y = rc.top + (-_v.y * .5 + .5) * rc.height;
    const out = i === 0 ? 1 : i === 2 ? -1 : 0;      // 壘包旁：一壘按鈕在右側、三壘在左側、二壘在上方
    x += out * 46; if (i === 1) y -= 40; else y += 6;
    const m = 46, cx = Math.max(rc.left + m, Math.min(rc.right - m, x)), cy = Math.max(rc.top + 60, Math.min(rc.bottom - 110, y));
    const clipped = cx !== x || cy !== y;
    b.style.left = cx + 'px'; b.style.top = cy + 'px'; b.style.display = 'block';
    const nm = ['一壘', '二壘', '三壘'][i], arrow = clipped ? (i === 0 ? ' ▶' : i === 2 ? '◀ ' : ' ▲') : '';
    const txt = (i === 2 && clipped ? arrow : '') + '牽制' + nm + (i !== 2 && clipped ? arrow : '');
    if (b.textContent !== txt) b.textContent = txt;
    b.classList.toggle('far', (r.lead || 0) > 2.4);
  }
  function tick() {
    requestAnimationFrame(tick);
    try {
      css(); const ok = canPick(); document.body.classList.toggle('pkOv', ok);
      let key = '';
      for (let i = 0; i < 3; i++) {
        const r = ok && G.on && G.on[i]; const show = !!(r && r.state === 'on');
        if (!show) { if (els[i]) els[i].style.display = 'none'; continue; }
        place(i, r); key += i;
      }
      last = key;
    } catch (e) { }
  }
  requestAnimationFrame(tick);
  return { canPick, get shown() { return last; } };
})();
