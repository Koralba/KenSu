'use strict';
/* 13x-steal-buttons.js ｜ 盜壘按鈕改到「每個壘包旁」（跟 13u 的牽制按鈕同一套做法）
   - 玩家進攻時，壘上每個有跑者的壘包旁邊各出現一顆「盜X壘」按鈕（把壘包的 3D 位置投影到螢幕上，跟著鏡頭走；壘包在畫面外就貼在螢幕邊緣並加箭頭）。
   - 點哪顆，那個壘包的跑者就立刻做準備動作（大步離壘）然後起跑盜壘。前方壘包有「還沒動」的跑者時＝雙盜壘（連續相鄰的跑者一起跑，按鈕改顯示「雙盜壘」／「全員盜壘」）。
   - 隨時都能按：投球前（pre）、投手出手動作中（windup，含抬腿之後）、球已經投出（flight，含打者揮棒的時機）。
       · 投手還沒抬腿前：呼叫 07 的 launchEarlySteal（準備動作約 0.42 秒，這時電腦投手仍有機會牽制）。
       · 抬腿之後／球已出手：投手已經不能傳壘，準備動作縮短（0.25／0.12 秒）後直接起跑；球投完時只要有人在跑，11 的 startBatteryPlay 會讓捕手傳球。
   - 區網對戰（vsOn()）一律不啟用，沿用舊的盜壘鍵（避免兩機不同步）；#btnSteal 邏輯不動；鍵盤 Q 在「投手已抬腿／球已投出」時改成直接起跑（見檔尾），其餘時間仍是舊的盜壘選擇面板。
   - 啟用時用 body.stOv 把舊的 #btnSteal 藏起來。
   依賴：04 的 G／E／vsOn／PL、09 的 canSteal 條件、07 的 launchEarlySteal／startSteal／coverSteal／stealWindowOpen、05 的 baseSpot、03 的 camera。 */
const STB = (function () {
  const CSS = `
.stb{position:fixed;z-index:45;display:none;min-width:58px;padding:7px 11px;border-radius:999px;border:2px solid rgba(255,255,255,.85);background:linear-gradient(#3fbf6a,#1f8a45);color:#fff;font:900 14px 'Noto Sans TC',sans-serif;letter-spacing:.04em;box-shadow:0 3px 10px rgba(0,0,0,.45);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transform:translate(-50%,-50%);white-space:nowrap}
.stb:active{transform:translate(-50%,-50%) scale(.92)}
body.stOv #btnSteal{display:none!important}
@media (max-width:700px){.stb{padding:6px 9px;font-size:13px;min-width:50px}}`;
  const els = []; let cssOK = false, last = '';
  function css() { if (cssOK) return; cssOK = true; const s = document.createElement('style'); s.id = 'stbCss'; s.textContent = CSS; document.head.appendChild(s); }
  function canSteal() {
    try {
      if (typeof G === 'undefined' || !G || G.mode !== 'play' || G.over || G.freeze || (typeof PL !== 'undefined' && PL)) return false;
      if (typeof vsOn === 'function' && vsOn()) return false;
      if (typeof mineBats !== 'function' || !mineBats() || !(G.human >= 0)) return false;
      if (G.intWalk || G.walking) return false;
      return G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight';
    } catch (e) { return false; }
  }
  function chainOf(i) {      // 雙盜壘：前方壘包有「還沒動」的跑者時，連他一起跑（連續相鄰的壘包都算；前方已在準備／起跑的不重複帶）
    const c = [i];
    for (let j = i + 1; j <= 2; j++) { const q = G.on[j]; if (!q || q.state !== 'on' || q.stepGo || q.earlyGo) break; c.push(j); }
    return c;
  }
  function arm(i, quiet) {      // 投手已抬腿／球已投出的單一跑者：不會被牽制，縮短準備動作後直接起跑
    const r = G.on[i]; if (!r || r.state !== 'on' || r.stepGo || r.earlyGo) return false;
    r.stepGo = true; r.stepT = G.phase === 'flight' ? .12 : .25; r.earlyGo = true; r.decided = true; r.watchT = 0; r.waiting = false;
    after(r.stepT + .02, () => { if (G.mode === 'play' && !G.over && !(typeof PL !== 'undefined' && PL) && r.state === 'on' && r.stepGo && r.earlyGo && G.on[i] === r) { r.stepGo = false; startSteal([i], .05 + Math.random() * .05); } });      // 保險：07 的 updateStealWatch 沒接手時，由這裡起跑；已起跑（state≠on）、球已打進場內或這球已結束（stepGo 被清掉）就不動作
    return true;
  }
  function go(i) {
    if (!canSteal()) return false;
    const r = G.on[i]; if (!r || r.state !== 'on' || r.stepGo || r.earlyGo) return false;
    const ch = chainOf(i);
    if (typeof stealWindowOpen === 'function' && stealWindowOpen()) {      // 投手還沒抬腿：跟舊的盜壘鍵同一套（準備動作 0.42 秒，電腦投手可能牽制）
      const ok = !!launchEarlySteal(ch);
      if (ok && ch.length > 1) try { say('<em>' + (ch.length === 2 ? '雙盜壘' : '全員盜壘') + '！</em>前面的跑者一起跑'); } catch (e) { }
      return ok;
    }
    const done = ch.filter(k => arm(k)); if (!done.length) return false;
    G.stealReq = false; G.stealSel = null; G.stealSet = null;
    try { coverSteal(done.filter(k => k < 2)); } catch (e) { }
    const tag = done.length === 1 ? '盜壘' : done.length === 2 ? '雙盜壘' : '全員盜壘';
    try { say('<em>跑者起跑，' + tag + '！</em>'); toast(tag + '！', '#ffe9a0', '#c60'); } catch (e) { }
    return true;
  }
  function mk(i) {
    const b = document.createElement('button'); b.className = 'stb'; b.type = 'button'; b.dataset.i = i;
    const fire = e => { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); try { go(i); } catch (err) { console.error(err); } };
    b.addEventListener('pointerdown', fire);
    ['mousedown', 'touchstart', 'click', 'touchend', 'pointerup'].forEach(ev => b.addEventListener(ev, e => { e.stopPropagation(); if (ev !== 'touchstart') e.preventDefault(); }));      // 不要讓點擊穿透到下面的「揮棒／瞄準」
    document.body.appendChild(b); els[i] = b; return b;
  }
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  function place(i) {
    const b = els[i] || mk(i), cv = document.getElementById('gl'); if (!cv || !_v) { b.style.display = 'none'; return; }
    const rc = cv.getBoundingClientRect(), sp = baseSpot(i + 1);
    _v.set(sp.x, .3, sp.z).project(camera);
    if (_v.z > 1) { b.style.display = 'none'; return; }      // 壘包在鏡頭後面
    let x = rc.left + (_v.x * .5 + .5) * rc.width, y = rc.top + (-_v.y * .5 + .5) * rc.height;
    const out = i === 0 ? 1 : i === 2 ? -1 : 0;      // 壘包旁：一壘按鈕在右側、三壘在左側、二壘在上方（與 13u 相同）
    x += out * 46; if (i === 1) y -= 40; else y += 6;
    const m = 46, cx = Math.max(rc.left + m, Math.min(rc.right - m, x)), cy = Math.max(rc.top + 60, Math.min(rc.bottom - 110, y));
    const clipped = cx !== x || cy !== y;
    b.style.left = cx + 'px'; b.style.top = cy + 'px'; b.style.display = 'block';
    const n = chainOf(i).length, nm = n === 1 ? ['盜二壘', '盜三壘', '盜本壘'][i] : n === 2 ? '雙盜壘' : '全員盜壘', arrow = clipped ? (i === 0 ? ' ▶' : i === 2 ? '◀ ' : ' ▲') : '';
    const txt = (i === 2 && clipped ? arrow : '') + nm + (i !== 2 && clipped ? arrow : '');
    if (b.textContent !== txt) b.textContent = txt;
  }
  function tick() {
    requestAnimationFrame(tick);
    try {
      css(); const ok = canSteal(); document.body.classList.toggle('stOv', ok);
      let key = '';
      for (let i = 0; i < 3; i++) {
        const r = ok && G.on && G.on[i]; const show = !!(r && r.state === 'on' && !r.stepGo && !r.earlyGo);
        if (!show) { if (els[i]) els[i].style.display = 'none'; continue; }
        place(i); key += i;
      }
      last = key;
    } catch (e) { }
  }
  /* 鍵盤 Q：投手還沒抬腿前沿用舊行為（開盜壘選擇面板）；抬腿後／球已投出時舊面板只會預約下一球，
     所以這裡直接讓跑者起跑——有勾選盜壘指示（stealIdxs）就跑那幾位，否則跑最前面的跑者。 */
  window.addEventListener('keydown', e => {
    try {
      if (e.key !== 'q' && e.key !== 'Q') return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return;
      if (typeof EV !== 'undefined' && EV && (EV.brawl || EV.abs)) return;
      if (!canSteal() || (typeof stealWindowOpen === 'function' && stealWindowOpen())) return;      // 空窗期才攔截，其餘交還 13 的舊邏輯
      e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
      let ix = typeof stealIdxs === 'function' ? stealIdxs() : [];
      if (!ix.length) { const f = [2, 1, 0].find(i => G.on[i] && G.on[i].state === 'on'); ix = f == null ? [] : [f]; }
      ix.forEach(i => go(i));
    } catch (err) { console.error(err); }
  }, true);
  requestAnimationFrame(tick);
  return { canSteal, go, get shown() { return last; } };
})();
