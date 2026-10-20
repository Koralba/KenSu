/* 90-boot-title-menu.js — boot／全螢幕／主畫面選單／離開遊戲／開場特效（須最後載入）（原 script.js 第 7656-7830 行） */
'use strict';
/* ---------------- boot ---------------- */
function boot() {
  buildCards(); srand(20261012); window.__dbg = new URLSearchParams(location.search).get('dbg') === '1';
  G.teams = [buildTeam(TEAMS[0]), buildTeam(TEAMS[1])]; G.half = 0; G.human = -1; G.lv = 1; G.mode = 'title';
  rebuildField(); resetFormation(true); CAMC.mode = 'title'; updateCamera(.1, null); camSnap();
  const q = new URLSearchParams(location.search);
  if (q.get('auto')) {
    window.__ts = +(q.get('ts') || 1); const cfg = { away: +(q.get('away') || 0), home: +(q.get('home') || 1), side: q.get('side') !== null ? +q.get('side') : 2, inn: +(q.get('inn') || 3), lv: +(q.get('lv') || 1), evt: q.get('evt') !== null ? +q.get('evt') : undefined, pn: +(q.get('pn') || 0) };
    G.mode = 'menu'; newGame(cfg);
  }
  requestAnimationFrame(frame);
}
window.YW = { simulateBall, classifyBatted, wallRadius, G, E, CAMC, get PL() { return PL; }, get PT() { return PT; }, newGame, TEAMS };
/* ---------------- 全螢幕：放在「更多」選單；加入主畫面後以全螢幕 PWA 開啟 ---------------- */
(function(){
  const de=document.documentElement,btn=$('btnFs');
  const rq=de.requestFullscreen||de.webkitRequestFullscreen,ex=document.exitFullscreen||document.webkitExitFullscreen;
  const isFs=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
  const standalone=()=>(window.matchMedia&&(matchMedia('(display-mode:fullscreen)').matches||matchMedia('(display-mode:standalone)').matches))||navigator.standalone;
  if(!rq||standalone()){btn.remove();return;}      // iPhone Safari 不支援網頁全螢幕、或已是全螢幕App：不顯示此項
  const sync=()=>{btn.textContent=isFs()?'✕ 離開全螢幕':'⛶ 全螢幕';};
  btn.addEventListener('click',()=>{try{if(isFs()){ex.call(document);}else{const r=rq.call(de);if(r&&r.then)r.then(()=>{try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{});}catch(e){}}).catch(()=>{});}}catch(e){}});
  document.addEventListener('fullscreenchange',sync);document.addEventListener('webkitfullscreenchange',sync);sync();
})();
/* ---------------- 主畫面：一般模式／生涯模式／離開遊戲 ---------------- */
$('tmNormal').onclick = () => { toGame(); };
$('tmCareer').onclick = () => { sndInit(); $('careerDlg').classList.remove('hide'); };
$('careerOk').onclick = () => $('careerDlg').classList.add('hide');
$('menuBack').onclick = () => { if (G.mode !== 'menu') return; G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
/* ---------------- 離開遊戲 ----------------
   網頁無法強制關閉整個瀏覽器或回到桌面，這是瀏覽器的安全限制。
   依序嘗試：App 外殼橋接 → 結束全螢幕 → window.close()（已安裝的 PWA／腳本開啟的視窗有效），
   都不行時停在道別畫面並提示使用者手動離開，而不是留下空白頁。 */
const XD = $('exitDlg'), BYE = $('bye');
function openExitDlg() { XD.classList.remove('hide'); setTimeout(() => { try { $('exitNo').focus(); } catch (e) { } }, 30); }
function closeExitDlg() { XD.classList.add('hide'); try { $('tmExit').focus(); } catch (e) { } }
function exitGame() {
  XD.classList.add('hide');
  try { if (SND.ctx && SND.ctx.state === 'running') SND.ctx.suspend(); } catch (e) { }
  try { const ex = document.exitFullscreen || document.webkitExitFullscreen; if ((document.fullscreenElement || document.webkitFullscreenElement) && ex) ex.call(document); } catch (e) { }
  BYE.classList.remove('hide'); $('byeHint').classList.add('hide'); $('byeBack').classList.add('hide');
  // 原生外殼（Capacitor／Cordova／Android WebView／iOS WKWebView）
  try { const C = window.Capacitor; if (C && C.Plugins && C.Plugins.App && C.Plugins.App.exitApp) { C.Plugins.App.exitApp(); return; } } catch (e) { }
  try { if (navigator.app && navigator.app.exitApp) { navigator.app.exitApp(); return; } } catch (e) { }
  try { if (window.Android && window.Android.exitApp) { window.Android.exitApp(); return; } } catch (e) { }
  try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.exitApp) { window.webkit.messageHandlers.exitApp.postMessage('exit'); return; } } catch (e) { }
  setTimeout(() => { try { window.close(); } catch (e) { } }, 450);
  setTimeout(() => { try { if (!window.closed) { window.open('', '_self'); window.close(); } } catch (e) { } }, 800);
  setTimeout(() => { $('byeHint').classList.remove('hide'); $('byeBack').classList.remove('hide'); }, 1300);   // 視窗仍在 → 關不掉，改請使用者手動離開
}
$('byeBack').onclick = () => { BYE.classList.add('hide'); try { if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); } catch (e) { } };
$('tmExit').onclick = openExitDlg;
$('exitNo').onclick = closeExitDlg;
$('exitYes').onclick = exitGame;
document.addEventListener('keydown', e => {
  if (!XD.classList.contains('hide')) { if (e.key === 'Escape') { closeExitDlg(); e.preventDefault(); } return; }
  if (G.mode !== 'title' || $('title').classList.contains('hide') || !$('careerDlg').classList.contains('hide')) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const b = [...document.querySelectorAll('#title .tmb')], i = b.indexOf(document.activeElement);
    b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length].focus(); e.preventDefault();
  }
});

/* ---------------- 主畫面開場特效：火球擊中標題 → 衝擊波 → 火花餘燼與場燈 ---------------- */
(function () {
  const T = $('title'), cv = $('titleFx'), g = cv.getContext('2d'), fl = $('titleFlash'), HIT = .85;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  let W = 0, H = 0, dpr = 1, t0 = 0, last = 0, raf = 0, hitDone = false, IX = 0, IY = 0, SX = 0, SY = 0, nextStar = 0;
  let sparks = [], embers = [], rings = [], stars = [], trail = [], lines = [];
  const R = (a, b) => a + Math.random() * (b - a);
  function fit() { dpr = Math.min(window.devicePixelRatio || 1, document.body.classList.contains('mob') ? 1.5 : 2); W = T.clientWidth; H = T.clientHeight; cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function measure() { const r = T.querySelector('.logo').getBoundingClientRect(), tr = T.getBoundingClientRect(); IX = r.left - tr.left + r.width / 2; IY = r.top - tr.top + r.height / 2; SX = IX + W * .38; SY = IY - H * .34; }
  const mkEmber = init => ({ x: R(0, W), y: init ? R(H * .25, H) : H + 10, vx: R(-12, 12), vy: -R(25, 85), ph: R(0, 6.3), s: R(1, 3.2), age: init ? R(0, 3) : 0, life: R(3.5, 7), h: R(18, 42) });
  function hit() {
    hitDone = true; T.classList.remove('armed'); T.classList.add('hit');
    fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    T.classList.remove('shk'); void T.offsetWidth; T.classList.add('shk'); setTimeout(() => T.classList.remove('shk'), 520);
    for (let i = 0; i < 110; i++) { const a = R(0, 6.283), v = R(180, 980); sparks.push({ x: IX, y: IY, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: R(.5, 1.2), age: 0, s: R(1.5, 4), h: R(28, 54) }); }
    rings.push({ age: 0, life: .75, max: Math.max(W, H) * .55, w: 9 }, { age: -.08, life: .95, max: Math.max(W, H) * .85, w: 4 });
    for (let i = 0, n = Math.min(70, Math.round(W * H / 16000)); i < n; i++) embers.push(mkEmber(true));
    lines.length = 0; trail.length = 0; nextStar = 0;
    try { if (SND.ctx && SND.on && SND.ctx.state === 'running') { noiseBurst(.4, 220, .6, .9, 'lowpass'); tone(95, .32, .7, 'sine', .45); } } catch (e) { }
  }
  function beam(ox, ang, a) {
    const L = Math.hypot(W, H) * 1.1; g.save(); g.translate(ox, -8); g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(255,240,200,' + a + ')'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(-L * .11, L); g.lineTo(L * .11, L); g.closePath(); g.fill(); g.restore();
  }
  function ball(x, y, r, t) {
    const gr = g.createRadialGradient(x, y, r * .5, x, y, r * 2.4); gr.addColorStop(0, 'rgba(255,170,60,.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.4, 0, 6.283); g.fill();
    g.save(); g.translate(x, y); g.rotate(t * 16);
    const b = g.createRadialGradient(-r * .3, -r * .35, r * .1, 0, 0, r); b.addColorStop(0, '#fff'); b.addColorStop(.6, '#ece7d8'); b.addColorStop(1, '#b8ae96');
    g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fillStyle = b; g.fill(); g.clip();
    g.strokeStyle = '#d3202a'; g.lineWidth = Math.max(1, r * .09); g.setLineDash([r * .18, r * .13]);
    g.beginPath(); g.arc(-r * 1.28, 0, r * 1.05, -1, 1); g.stroke(); g.beginPath(); g.arc(r * 1.28, 0, r * 1.05, Math.PI - 1, Math.PI + 1); g.stroke(); g.restore();
  }
  function loop(now) {
    if (T.classList.contains('hide')) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    if (!t0) { t0 = now; last = now; }
    const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!hitDone && t >= HIT) hit();
    g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
    const dark = hitDone ? Math.max(0, .55 * (1 - (t - HIT) / .9)) : .55;
    if (dark > 0) { g.fillStyle = 'rgba(0,0,10,' + dark + ')'; g.fillRect(0, 0, W, H); }
    g.globalCompositeOperation = 'lighter';
    if (hitDone) {                                    // 場燈光束
      const k = Math.min(1, (t - HIT) / 1.2), w = Math.sin(t * .6);
      beam(0, -(.38 + .12 * w), .09 * k); beam(W, .38 + .12 * Math.sin(t * .6 + 1.2), .09 * k);
    }
    if (!hitDone) {                                   // 集中線 + 火球逼近
      const p = Math.min(1, t / HIT), m = Math.max(W, H);
      g.lineCap = 'round';
      for (const l of lines) { const r1 = l.d0 + p * p * m * .55, r2 = r1 + l.len * p; g.strokeStyle = 'rgba(255,236,190,' + (.42 * p) + ')'; g.lineWidth = l.w; g.beginPath(); g.moveTo(IX + Math.cos(l.a) * r1, IY + Math.sin(l.a) * r1); g.lineTo(IX + Math.cos(l.a) * r2, IY + Math.sin(l.a) * r2); g.stroke(); }
      const e = p * p, bx = SX + (IX - SX) * e, by = SY + (IY - SY) * e, br = 3 + (Math.min(W, H) * .1 - 3) * p * p * p;
      for (let i = 0; i < 4; i++) trail.push({ x: bx + R(-br, br) * .5, y: by + R(-br, br) * .5, vx: (SX - IX) * R(.05, .22) + R(-30, 30), vy: (SY - IY) * R(.05, .22) + R(-30, 30), age: 0, life: R(.3, .6), s: br * R(.5, 1.1) + 2, h: R(18, 48) });
      g._ball = [bx, by, br, t];
    } else g._ball = null;
    for (let i = trail.length - 1; i >= 0; i--) {
      const q = trail[i]; q.age += dt; if (q.age > q.life) { trail.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; const u = 1 - q.age / q.life;
      g.fillStyle = 'hsla(' + q.h + ',100%,58%,' + (.5 * u) + ')'; g.beginPath(); g.arc(q.x, q.y, q.s * u, 0, 6.283); g.fill();
    }
    for (let i = embers.length - 1; i >= 0; i--) {   // 餘燼
      const q = embers[i]; q.age += dt; q.x += (q.vx + Math.sin(q.age * 1.6 + q.ph) * 14) * dt; q.y += q.vy * dt;
      if (q.age > q.life || q.y < -10) { embers[i] = mkEmber(false); continue; }
      const a = Math.sin(Math.PI * q.age / q.life) * .85;
      g.fillStyle = 'hsla(' + q.h + ',100%,60%,' + a + ')'; g.beginPath(); g.arc(q.x, q.y, q.s, 0, 6.283); g.fill();
    }
    for (let i = rings.length - 1; i >= 0; i--) {    // 衝擊波
      const q = rings[i]; q.age += dt; if (q.age < 0) continue; if (q.age > q.life) { rings.splice(i, 1); continue; }
      const u = q.age / q.life, r = q.max * (1 - Math.pow(1 - u, 3));
      g.strokeStyle = 'rgba(255,214,120,' + (.85 * (1 - u)) + ')'; g.lineWidth = q.w * (1 - u) + .5; g.beginPath(); g.arc(IX, IY, r, 0, 6.283); g.stroke();
    }
    for (let i = sparks.length - 1; i >= 0; i--) {   // 火花
      const q = sparks[i]; q.age += dt; if (q.age > q.life) { sparks.splice(i, 1); continue; }
      q.vy += 640 * dt; q.vx *= 1 - 1.4 * dt; q.x += q.vx * dt; q.y += q.vy * dt; const u = 1 - q.age / q.life;
      g.strokeStyle = 'hsla(' + q.h + ',100%,62%,' + u + ')'; g.lineWidth = q.s * u + .4; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * .03, q.y - q.vy * .03); g.stroke();
    }
    if (hitDone && t - HIT > .5 && t > nextStar) {   // 看台相機閃光
      nextStar = t + R(.22, .65); stars.push({ x: R(W * .04, W * .96), y: R(H * .5, H * .96), age: 0, life: R(.16, .28), s: R(12, 30) });
    }
    for (let i = stars.length - 1; i >= 0; i--) {
      const q = stars[i]; q.age += dt; if (q.age > q.life) { stars.splice(i, 1); continue; }
      const u = 1 - q.age / q.life, s = q.s * (.6 + .6 * u);
      const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, s); gr.addColorStop(0, 'rgba(255,255,255,' + u + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, s, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(255,255,255,' + (.8 * u) + ')'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(q.x - s * 1.5, q.y); g.lineTo(q.x + s * 1.5, q.y); g.moveTo(q.x, q.y - s * 1.5); g.lineTo(q.x, q.y + s * 1.5); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    if (g._ball) ball(g._ball[0], g._ball[1], g._ball[2], g._ball[3]);
  }
  function start() {
    cancelAnimationFrame(raf); raf = 0;
    sparks = []; embers = []; rings = []; stars = []; trail = []; lines = []; hitDone = false; t0 = 0;
    T.classList.remove('hit', 'shk'); T.classList.add('armed');
    fit(); measure(); g.clearRect(0, 0, W, H);
    if (reduce) { hitDone = true; T.classList.remove('armed'); return; }
    const m = Math.min(W, H);
    for (let i = 0; i < 64; i++) lines.push({ a: R(0, 6.283), d0: R(.08, .2) * m, len: R(.15, .5) * Math.max(W, H), w: R(.6, 2) });
    raf = requestAnimationFrame(loop);
  }
  let wasHidden = T.classList.contains('hide');
  new MutationObserver(() => {
    const h = T.classList.contains('hide');
    if (wasHidden && !h) start(); else if (h && raf) { cancelAnimationFrame(raf); raf = 0; }
    wasHidden = h;
  }).observe(T, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => { if (T.classList.contains('hide')) return; fit(); measure(); });
  window.__titleIntro = start;
})();
boot();
if (window.__titleIntro && !$('title').classList.contains('hide')) window.__titleIntro();
