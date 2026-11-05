'use strict';
/* 13x-steal-buttons.js ｜ 盜壘按鈕改到「每個壘包旁」（跟 13u 的牽制按鈕同一套做法）
   - 玩家進攻時，壘上每個有跑者的壘包旁邊各出現一顆「盜X壘」按鈕（把壘包的 3D 位置投影到螢幕上，跟著鏡頭走；壘包在畫面外就貼在螢幕邊緣並加箭頭）。
   - 點哪顆，那個壘包的跑者就立刻做準備動作（大步離壘）然後起跑盜壘。前方壘包有「還沒動」的跑者時＝雙盜壘（連續相鄰的跑者一起跑，按鈕改顯示「雙盜壘」／「全員盜壘」）。
   - 隨時都能按：投球前（pre）、投手出手動作中（windup，含抬腿之後）、球已經投出（flight，含打者揮棒的時機）。
       · 投手還沒抬腿前：呼叫 07 的 launchEarlySteal（準備動作約 0.42 秒，這時電腦投手仍有機會牽制）。
       · 抬腿之後／球已出手：投手已經不能傳壘，準備動作縮短（0.25／0.12 秒）後直接起跑；球投完時只要有人在跑，11 的 startBatteryPlay 會讓捕手傳球。
   - 區網對戰（vsOn()）一律不啟用，沿用舊的盜壘鍵（避免兩機不同步）；#btnSteal 邏輯不動；鍵盤 Q 在「投手已抬腿／球已投出」時改成直接起跑（見檔尾），其餘時間仍是舊的盜壘選擇面板。
   - 【退回】點了盜壘之後，同一顆按鈕立刻變成橘色「退回」：大步離壘準備中按退回＝取消盜壘；已經起跑按退回＝跑者煞車轉身、跑回原壘（轉身有短暫減速）。
       只要在球（捕手／野手傳球）到原壘前踩回原壘就安全、不會出局；來不及才被刺殺。回到壘包後按鈕自動變回「盜X壘」。
       跑者被夾在兩壘之間時，電腦守備會依情況把球傳向「要盜的壘包」或「原本的壘包」（見 07 的 stealPickoff／watchRetreat 與 05 的 holderThink／rundownTarget）。
   - 啟用時用 body.stOv 把舊的 #btnSteal 藏起來。
   依賴：04 的 G／E／vsOn／PL、09 的 canSteal 條件、07 的 launchEarlySteal／startSteal／coverSteal／stealWindowOpen、05 的 baseSpot、03 的 camera。 */
const STB = (function () {
  const CSS = `
.stb{position:fixed;z-index:45;display:none;min-width:58px;padding:7px 11px;border-radius:999px;border:2px solid rgba(255,255,255,.85);background:linear-gradient(#3fbf6a,#1f8a45);color:#fff;font:900 14px 'Noto Sans TC',sans-serif;letter-spacing:.04em;box-shadow:0 3px 10px rgba(0,0,0,.45);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transform:translate(-50%,-50%);white-space:nowrap}
.stb:active{transform:translate(-50%,-50%) scale(.92)}
.stb.bk{background:linear-gradient(#f0903f,#c9511a)}
body.stOv #btnSteal{display:none!important}
@media (max-width:700px){.stb{padding:6px 9px;font-size:13px;min-width:50px}}`;
  const els = []; let cssOK = false, last = '';
  function css() { if (cssOK) return; cssOK = true; const s = document.createElement('style'); s.id = 'stbCss'; s.textContent = CSS; document.head.appendChild(s); }
  let pend = null;      // 預約：兩球之間（判定／換打者／牽制後）按下，等下一球可以起跑時自動執行
  function canShow() {      // 有跑者就顯示按鈕：包含兩球之間（result／pickoff），不再只有 pre／windup／flight 才出現
    try {
      if (typeof G === 'undefined' || !G || G.mode !== 'play' || G.over || (typeof PL !== 'undefined' && PL)) return false;
      if (typeof vsOn === 'function' && vsOn()) return false;
      if (typeof mineBats !== 'function' || !mineBats() || !(G.human >= 0) || G.intWalk || G.walking) return false;
      return ['pre', 'windup', 'flight', 'result', 'pickoff', 'abs'].includes(G.phase);
    } catch (e) { return false; }
  }
  function canSteal() {
    try {
      if (typeof G === 'undefined' || !G || G.mode !== 'play' || G.over || G.freeze || (typeof PL !== 'undefined' && PL)) return false;
      if (typeof vsOn === 'function' && vsOn()) return false;
      if (typeof mineBats !== 'function' || !mineBats() || !(G.human >= 0)) return false;
      if (G.intWalk || G.walking) return false;
      return G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight';
    } catch (e) { return false; }
  }
  /* ---- 退回（盜壘中途反悔）---- */
  function retOK() {      // 跑者可以退回的時機：我方進攻；沒有打擊球的守備（盜壘傳球／暴投的捕手傳球 OK），打出去的球仍由原本的「回壘」鈕處理
    try {
      if (typeof G === 'undefined' || !G || G.mode !== 'play' || G.over || G.freeze) return false;
      if (typeof vsOn === 'function' && vsOn()) return false;
      if (typeof mineBats !== 'function' || !mineBats() || !(G.human >= 0)) return false;
      if (typeof PL !== 'undefined' && PL && !(PL.kind === 'steal' || PL.kind === 'wp')) return false;
      return true;
    } catch (e) { return false; }
  }
  function backOf(i) {      // 原壘 i（0＝一壘…）上「正在準備盜壘／已經起跑盜壘」的跑者；沒有就回 null
    const q = G.on && G.on[i];
    if (q && q.state === 'on' && (q.stepGo || q.earlyGo)) return q;
    return (E.runners || []).find(r => r.state === 'run' && r.stealer && r.dir > 0 && !r.bat && r.from === i + 1 && !r.trot && r.s < .93 && !(r.sliding && r.s > .85)) || null;
  }
  function retreat(i) {
    if (!retOK()) return false;
    const r = backOf(i); if (!r) return false;
    if (r.state === 'on') {      // 還在大步離壘的準備動作：取消盜壘，原地待命
      r.stepGo = false; r.earlyGo = false; r.decided = true; r.watchT = 0; r.waiting = false; pend = null;
      try { say('<em>' + r.pl.name + '</em>取消盜壘，退回壘包'); toast('取消盜壘', '#cfe', '#07a'); } catch (e) { }
      return true;
    }
    r.dir = -1; r.goal = r.from; r.isForce = false; r.ret = true; r.tag = false; r.stealRun = false; r.earlyGo = false; r.waiting = false;
    r.pre = 0; r.pushN = 0; r.pushUntil = 0; r.hnr = false; r.squeeze = false;
    r.accT = -.12;      // 煞車＋轉身：前 0.12 秒只用起步速度，之後再加速（急轉身比一路往前跑吃虧，球一樣有機會先到）
    r.retreatAt = G.rclk || 0;
    if (r.sliding) { r.sliding = false; r.rig.anim = null; }
    try { const b = baseSpot(r.from); faceRig(r.rig, b.x, b.z); } catch (e) { }
    try { say('<em>' + r.pl.name + '</em>發現不對，急忙折返回壘！', 2200); toast('退回！', '#fff', '#c9511a'); } catch (e) { }
    if (typeof PL !== 'undefined' && PL) { PL.idleT = .28; PL.endHold = 0; }      // 守備方立刻重新判斷（傳原壘／夾殺）
    return true;
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
    const fire = e => { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); try { if (b.dataset.mode === 'back') { retreat(i); return; } if (canSteal()) go(i); else if (canShow()) { pend = i; try { toast('已預約盜壘：下一球投出前起跑', '#ffe9a0', '#c60'); } catch (e2) { } } } catch (err) { console.error(err); } };
    b.addEventListener('pointerdown', fire);
    ['mousedown', 'touchstart', 'click', 'touchend', 'pointerup'].forEach(ev => b.addEventListener(ev, e => { e.stopPropagation(); if (ev !== 'touchstart') e.preventDefault(); }));      // 不要讓點擊穿透到下面的「揮棒／瞄準」
    document.body.appendChild(b); els[i] = b; return b;
  }
  const _v = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
  /* 壘包右側定位＋避讓：預設貼在壘包「右邊」；若會壓到其他操作按鈕（下方動作鍵／揮棒鈕／球種／推進回壘／傳球／記分板）或另一顆壘包按鈕，
     依序改試：壘包右上、右下、左側，都不行才縮到最不擋的位置。回傳 {x,y}＝按鈕中心的螢幕座標。 */
  const BLK = '#acts .abtn,#actMore,#btnAct,#btnPow,#btnBuntT,#pitchPanel .pbtn,#btnPush,#btnBack,#throwPanel,#koTop,#fmAssist';
  let _bk = null, _bt = 0;
  function blockers(self) {
    const now = performance.now(); if (!_bk || now - _bt > 30) {
      _bk = []; _bt = now;
      document.querySelectorAll(BLK).forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 2 && r.height > 2) { const s = getComputedStyle(e); if (s.display !== 'none' && s.visibility !== 'hidden') _bk.push(r); } });
    }
    const o = []; document.querySelectorAll('.stb,.pkb').forEach(e => { if (e !== self && e.style.display === 'block') o.push(e.getBoundingClientRect()); });
    return _bk.concat(o);
  }
  function spotFor(b, x, y, rc) {
    const w = b.offsetWidth || 70, h = b.offsetHeight || 32, g = 12, bl = blockers(b), pad = 5;
    const cl = (cx, cy) => [Math.max(rc.left + w / 2 + 4, Math.min(rc.right - w / 2 - 4, cx)), Math.max(rc.top + h / 2 + 50, Math.min(rc.bottom - h / 2 - 8, cy))];
    const cand = [[x + g + w / 2, y], [x + g + w / 2, y - h - 6], [x + g + w / 2, y + h + 6], [x - g - w / 2, y], [x + g + w / 2, y - 2 * h - 12], [x - g - w / 2, y - h - 6]];
    let best = null, bestOv = 1e9;
    for (const c of cand) {
      const [cx, cy] = cl(c[0], c[1]); let ov = 0;
      for (const r of bl) { const ix = Math.min(cx + w / 2 + pad, r.right) - Math.max(cx - w / 2 - pad, r.left), iy = Math.min(cy + h / 2 + pad, r.bottom) - Math.max(cy - h / 2 - pad, r.top); if (ix > 0 && iy > 0) ov += ix * iy; }
      if (ov === 0) return { x: cx, y: cy };
      if (ov < bestOv) { bestOv = ov; best = { x: cx, y: cy }; }
    }
    return best;
  }
  function place(i, mode) {
    const b = els[i] || mk(i), cv = document.getElementById('gl'); if (!cv || !_v) { b.style.display = 'none'; return; }
    const rc = cv.getBoundingClientRect(), sp = baseSpot(i + 1);
    _v.set(sp.x, .3, sp.z).project(camera);
    if (_v.z > 1) { b.style.display = 'none'; return; }      // 壘包在鏡頭後面
    let x = rc.left + (_v.x * .5 + .5) * rc.width, y = rc.top + (-_v.y * .5 + .5) * rc.height;
    b.style.display = 'block';
    const sp2 = spotFor(b, x, y, rc), clipped = x > rc.right - 8 || x < rc.left + 8 || y < rc.top + 40 || y > rc.bottom - 60;      // 壘包本身在畫面外才標箭頭
    b.style.left = sp2.x + 'px'; b.style.top = sp2.y + 'px';
    const back = !!(mode === 'back');
    const n = back ? 1 : chainOf(i).length, nm = back ? '退回' : n === 1 ? ['盜二壘', '盜三壘', '盜本壘'][i] : n === 2 ? '雙盜壘' : '全員盜壘', arrow = clipped ? (i === 0 ? ' ▶' : i === 2 ? '◀ ' : ' ▲') : '';
    const txt = (i === 2 && clipped ? arrow : '') + nm + (i !== 2 && clipped ? arrow : '');
    b.dataset.mode = back ? 'back' : 'steal'; b.classList.toggle('bk', back);
    if (b.textContent !== txt) b.textContent = txt;
  }
  function tick() {
    requestAnimationFrame(tick);
    try {
      css(); const ok = canSteal(), vis = canShow(), rok = retOK();
      if (pend != null) { const rr = G.on && G.on[pend]; if (!vis || !rr || rr.state !== 'on') pend = null; else if (ok) { const k = pend; pend = null; go(k); } }
      let key = '', any = false;
      for (let i = 0; i < 3; i++) {
        const r = vis && G.on && G.on[i];
        const canGo = !!(r && r.state === 'on' && !r.stepGo && !r.earlyGo), canBack = !canGo && rok && !!backOf(i);      // 還沒動＝盜X壘；準備中／起跑中＝退回；回到壘包後自動變回盜X壘
        if (!canGo && !canBack) { if (els[i]) els[i].style.display = 'none'; continue; }
        any = true; place(i, canBack ? 'back' : 'steal'); key += i + (canBack ? 'b' : 's');
      }
      document.body.classList.toggle('stOv', vis || any);
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
      if (retOK()) { const bk = [0, 1, 2].filter(i => backOf(i)); if (bk.length && !G.on.some(r => r && r.state === 'on' && !r.stepGo && !r.earlyGo)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) bk.forEach(i => retreat(i)); return; } }      // 跑者都已在盜壘途中：Q＝全部退回
      if (!canSteal() || (typeof stealWindowOpen === 'function' && stealWindowOpen())) return;      // 空窗期才攔截，其餘交還 13 的舊邏輯
      e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
      let ix = typeof stealIdxs === 'function' ? stealIdxs() : [];
      if (!ix.length) { const f = [2, 1, 0].find(i => G.on[i] && G.on[i].state === 'on'); ix = f == null ? [] : [f]; }
      ix.forEach(i => go(i));
    } catch (err) { console.error(err); }
  }, true);
  requestAnimationFrame(tick);
  return { canSteal, go, retreat, backOf, get shown() { return last; } };
})();
