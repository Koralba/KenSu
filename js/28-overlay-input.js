/* 28-overlay-input.js — 2D 覆蓋層／輸入（原 script.js 第 6690-6816 行） */
'use strict';
/* =====================================================================
   Part 7: overlay, input, menu, main loop, boot
   ===================================================================== */
const ov = $('ov'), octx = ov.getContext('2d');
const PAD = { v: null };
const aim = { need: true, x: 0, y: ZC, cx: 0, cy: 0, has: false, shift: false };
const _v = new V3(), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function w2s(x, y, z) { camera.updateMatrixWorld(); _v.set(x, y, z).project(camera); return { x: (_v.x * .5 + .5) * ov.width, y: (-_v.y * .5 + .5) * ov.height }; }
function pointerToZone(cx, cy) {
  camera.updateMatrixWorld(); _ndc.set(cx / VW() * 2 - 1, -(cy / VH() * 2 - 1)); _ray.setFromCamera(_ndc, camera);
  const o = _ray.ray.origin, d = _ray.ray.direction; if (Math.abs(d.z) < 1e-5) return null; const t = -o.z / d.z; if (t < 0) return null;
  return { x: o.x + d.x * t, y: o.y + d.y * t };
}
const AIM_MARGIN = .42;
function updateAim() {
  if (!aim.has) return; const p = pointerToZone(aim.cx, aim.cy); if (!p) return;
  const mx = ZW + AIM_MARGIN, my = ZH + AIM_MARGIN;      // 球棒最多只能移到好球帶外一小段（壞球邊緣）：打者實際能揮到的範圍
  aim.x = clamp(p.x, -mx, mx); aim.y = clamp(p.y, ZC - my, ZC + my);
  if (p.x !== aim.x || p.y !== aim.y) { const q = w2s(aim.x, aim.y, 0), dp = ov.width / VW(); if (isFinite(q.x) && isFinite(q.y) && dp > 0) { aim.cx = q.x / dp; aim.cy = q.y / dp; } }      // 準心也一起拉回邊界，避免手指拖過頭後要拖很久才回得來
}
let POW_PREF = false;      // 強打開關：只由玩家手動切換，不會因換局／換打者而重置
const powOn = () => !G.easy && !!(aim.shift || POW_PREF);
function syncPowUI() { const v = POW_PREF, b = $('btnPow'), b2 = $('btnPowPc'); aim.lock = v; if (b) { b.classList.toggle('on', v); b.textContent = '強打'; } if (b2) { b2.classList.toggle('on', v); b2.innerHTML = '強打 ' + (v ? 'ON' : 'OFF') + '<i class="k"> S</i>'; } }
function setPow(v) { POW_PREF = !!v; aim.lock = POW_PREF; const b = $('btnPow'), b2 = $('btnPowPc'); if (b) { b.classList.toggle('on', v); b.textContent = '強打'; } if (b2) { b2.classList.toggle('on', v); b2.innerHTML = '強打 ' + (v ? 'ON' : 'OFF') + '<i class="k"> S</i>'; } }
function cursorR() {
  const b = curBatter(); if (BATV.ok && BATV.b === b) return BATV.R;      // 與畫面上顯示的緩動尺寸一致
  return batTarget(b, aim.x, aim.y).R;      // 手機／平板：與電腦版比例相近，只略放大一點
}
function cursorK() { const b = curBatter(); return (BATV.ok && BATV.b === b) ? BATV.k : batTarget(b, aim.x, aim.y).k; }
function drawRing(x, y, r, col, lw, dash) {
  const a = w2s(x, y, 0), b = w2s(x + r, y, 0), u2 = w2s(x, y + r, 0), rad = Math.abs(b.x - a.x), ry = Math.abs(u2.y - a.y);     // 圈是本壘板平面上的圓：投影成橢圓才與判定範圍完全一致
  octx.beginPath(); octx.ellipse(a.x, a.y, rad, ry, 0, 0, TAU); octx.strokeStyle = col; octx.lineWidth = lw; if (dash) octx.setLineDash(dash); octx.stroke(); octx.setLineDash([]); return { a, rad };
}
function drawOverlay() {
  octx.clearRect(0, 0, ov.width, ov.height);
  if (G.mode === 'play') { drawSky(octx, ov.width, ov.height); try { drawTwFx(octx, ov.width, ov.height); } catch (e) { } drawRain(octx, ov.width, ov.height); try { drawLightning(octx, ov.width, ov.height); } catch (e) { } }
  if (G.mode === 'play' && PT && !PT.done && G.phase === 'flight' && ballMesh.visible) {      // 速度感：球後方拉出速度線，球越快線越長越亮、慢球幾乎沒有
    const dp0 = ov.width / VW(), q = w2s(ballMesh.position.x, ballMesh.position.y, ballMesh.position.z), pq = PT._sq;
    if (pq && PT.kmh > 120) { const dx = q.x - pq.x, dy = q.y - pq.y, L = Math.hypot(dx, dy), k = clamp((PT.kmh - 120) / 40, 0, 1.1); if (L > 1 && L < 200 * dp0) { octx.globalAlpha = .18 + .4 * k; octx.strokeStyle = PT.spec.col; octx.lineWidth = (3 + 3 * k) * dp0; octx.lineCap = 'round'; octx.beginPath(); octx.moveTo(q.x, q.y); octx.lineTo(q.x - dx / L * Math.min(L * (2 + 4 * k), 90 * dp0), q.y - dy / L * Math.min(L * (2 + 4 * k), 90 * dp0)); octx.stroke(); octx.globalAlpha = 1; octx.lineCap = 'butt'; } }
    PT._sq = { x: q.x, y: q.y };
  }
  if (G.mode === 'play' && PT && !PT.hinted && (PT.t >= PT.T || PT.done || PT.resolved)) pitchHint(PT);      // 球飛行期間不顯示球種；落點結束後才提示
  if (G.mode === 'play') {      // 壘上跑者：頭上顯示半透明跑速值，供判斷盜壘
    const dp1 = ov.width / VW(); octx.font = `900 ${13 * dp1}px sans-serif`; octx.textAlign = 'center'; octx.lineWidth = 3 * dp1;
    for (const r of E.runners) {
      if (!r || !r.pl || !r.rig || !r.rig.root.visible || (r.state !== 'on' && r.state !== 'run') || r.bat) continue;
      const rp = r.rig.root.position, hh = (r.rig.vis && r.rig.vis.h) || 1, q = w2s(rp.x, 2.45 * hh, rp.z), sp = Math.round(r.pl.spd);
      octx.globalAlpha = .6; octx.strokeStyle = 'rgba(0,0,0,.8)'; octx.fillStyle = sp >= 75 ? '#7dffa0' : sp >= 60 ? '#ffe14a' : '#ff8a7a';
      const tx = String(sp), tw = octx.measureText(tx).width, k = 1.25 * dp1, sx = q.x - (tw + 18 * k) / 2;      // 跑鞋圖示＋跑速值
      octx.textAlign = 'left'; octx.strokeText(tx, sx + 17 * k, q.y); octx.fillText(tx, sx + 17 * k, q.y); octx.textAlign = 'center';
      octx.save(); octx.translate(sx, q.y - 10 * k); octx.scale(k, k); octx.lineJoin = 'round'; octx.lineWidth = 2.2; octx.strokeStyle = 'rgba(0,0,0,.8)';
      octx.beginPath(); octx.moveTo(1, 1.5); octx.lineTo(5, 1.5); octx.lineTo(6.2, 4); octx.lineTo(10, 5.6); octx.quadraticCurveTo(14.5, 6.4, 14.5, 9); octx.lineTo(14.5, 10.5); octx.lineTo(.6, 10.5); octx.closePath(); octx.stroke(); octx.fill();
      octx.fillStyle = 'rgba(255,255,255,.9)'; octx.fillRect(.6, 9, 13.9, 1.5); octx.fillRect(6.8, 4.6, 1.2, 1.2); octx.fillRect(8.6, 5.4, 1.2, 1.2);      // 鞋底與鞋帶
      octx.strokeStyle = octx.fillStyle = 'rgba(255,255,255,.8)'; octx.lineWidth = 1; octx.beginPath(); octx.moveTo(-3.2, 4); octx.lineTo(-.6, 4); octx.moveTo(-4.5, 6.4); octx.lineTo(-.6, 6.4); octx.stroke(); octx.restore(); octx.globalAlpha = 1;
    }
  }
  if (G.mode !== 'play' || !(G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight' || G.phase === 'result' || G.phase === 'abs')) return;
  const hb = humanBats(), hp = humanPitches(); const trk = G.lastLoc && G.lastLoc.t < 3; if (G.human < 0 && !trk) return;
  const dpr = ov.width / VW(), c = octx;
  const tl = w2s(-ZW, ZC + ZH, 0), tr = w2s(ZW, ZC + ZH, 0), bl = w2s(-ZW, ZC - ZH, 0), br = w2s(ZW, ZC - ZH, 0);
  const b = curBatter();
  // heat cells
  const cw = (tr.x - tl.x) / 3, ch = (bl.y - tl.y) / 3;
  for (let i = 0; i < 9; i++) { const r = b.zone[i], x = tl.x + (i % 3) * cw, y = tl.y + Math.floor(i / 3) * ch; if (r) { c.fillStyle = r > 0 ? `rgba(255,70,50,${.14 * r})` : `rgba(60,140,255,${.14 * -r})`; c.fillRect(x, y, cw, ch); } }
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2.2 * dpr; c.strokeRect(tl.x, tl.y, tr.x - tl.x, bl.y - tl.y);
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1 * dpr;
  for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(tl.x + cw * i, tl.y); c.lineTo(tl.x + cw * i, bl.y); c.moveTo(tl.x, tl.y + ch * i); c.lineTo(tr.x, tl.y + ch * i); c.stroke(); }
  const o1 = w2s(-ZW - .7, ZC + ZH + .7, 0), o2 = w2s(ZW + .7, ZC - ZH - .7, 0);
  if (trk) { const q = G.lastLoc, a = w2s(q.x, q.y, 0), al = clamp(1 - (q.t - 1.8) / 1.2, 0, 1); c.globalAlpha = al; c.beginPath(); c.arc(a.x, a.y, 4.5 * dpr, 0, TAU); c.fillStyle = q.strike ? '#ffd21a' : '#5f5'; c.fill(); c.lineWidth = 1.5 * dpr; c.strokeStyle = '#000'; c.stroke(); c.globalAlpha = 1; }
  if (HINT.on && HINT.pt && HINT.pt === PT && hb && G.phase === 'flight' && !PT.sw && !PT.done && performance.now() - HINT.t < 380) {      // 只在出手瞬間閃一下（約 0.38 秒）就消失      // 投球落點提示：半透明點＋淡淡脈動外圈
    const a = w2s(HINT.x, HINT.y, 0), rad = Math.max(5 * dpr, Math.abs(w2s(HINT.x, HINT.y + BALL_R * 1.25, 0).y - a.y)), now = performance.now(), fi = Math.floor((now - HINT.t) / 95) % 2 ? .35 : 1, pu = 0;
    c.save(); c.globalAlpha = fi;
    c.beginPath(); c.arc(a.x, a.y, rad * (1.5 + .25 * pu), 0, TAU); c.strokeStyle = 'rgba(120,235,255,' + (.35 - .15 * pu) + ')'; c.lineWidth = 1.6 * dpr; c.stroke();
    c.beginPath(); c.arc(a.x, a.y, rad, 0, TAU); c.fillStyle = 'rgba(90,220,255,.30)'; c.fill(); c.lineWidth = 1.8 * dpr; c.strokeStyle = 'rgba(255,255,255,.6)'; c.stroke();
    c.beginPath(); c.arc(a.x, a.y, Math.max(1.6 * dpr, rad * .14), 0, TAU); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill();
    c.restore();
  }
  if (G.human < 0 || !aim.has) return;
  if (hp && G.phase === 'pre' && !G.intWalk) {
    const p = curPitcher(), spec = PITCHES[G.selPitch = G.pm ? G.pm.id : G.selPitch], lv = pitchLv(p, G.selPitch) || 4, sg = ctlSigma(p, G.selPitch, lv);
    const pax = G.pm ? G.pm.x : aim.x, pay = G.pm ? G.pm.y : aim.y;
    const r = drawRing(pax, pay, sg * .9, spec.col, 2.5 * dpr);
    c.beginPath(); c.arc(r.a.x, r.a.y, 2.2 * dpr, 0, TAU); c.fillStyle = spec.col; c.fill();
    const hs = p.hand === 'R' ? 1 : -1, br2 = Math.pow(lv / 7, .85) * brkVis(lv), e = w2s(pax + spec.bx * br2 * hs * .55, pay + spec.by * br2 * .55, 0);
    c.beginPath(); c.moveTo(r.a.x, r.a.y); c.lineTo(e.x, e.y); c.strokeStyle = spec.col; c.lineWidth = 3 * dpr; c.stroke(); c.beginPath(); c.arc(e.x, e.y, 5 * dpr, 0, TAU); c.fillStyle = spec.col; c.fill();
    c.font = `900 ${14 * dpr}px sans-serif`; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(spec.jp, r.a.x, r.a.y - r.rad - 8 * dpr);
  } else if (hb && !G.easy && (G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight')) {
    const swung = PT && PT.sw; const ax = swung ? PT.sw.cx : aim.x, ay = swung ? PT.sw.cy : aim.y;      // 揮棒後圈圈固定在實際判定的位置
    if (!swung) batEase(b, ax, ay);      // 每幀緩動一次
    const R = swung ? (PT.sw.R || cursorR()) : cursorR(), KK = swung ? (PT.sw.k || cursorK()) : cursorK();      // 揮棒後直接用當下鎖定的尺寸，不再重算（避免揮完球棒變大變小）
    const col = swung ? 'rgba(255,255,255,.4)' : (powOn() ? '#ff6a3a' : G.callBunt ? '#7aff9a' : '#ffe14a');
                       // 外圈：能碰到球的範圍（打不好）
    const bm = swung ? (PT.sw.bunt ? 'bunt' : PT.sw.power ? 'power' : 'normal') : (G.callBunt ? 'bunt' : powOn() ? 'power' : 'normal');
    const r = drawBat(ax, ay, R, col, (MOB ? 2.2 : 3) * dpr, KK, bm);                                                                        // 球棒形擊球框：白帶＝甜蜜點，圓點＝握把端
    c.font = `900 ${(MOB ? 11 : 13) * dpr}px sans-serif`; c.fillStyle = col; c.textAlign = 'center'; c.fillText(G.callBunt ? '短打' : powOn() ? '強打' : '擊球', r.a.x, r.a.y + r.rad + 18 * dpr);
  }
}
/* ---------------- input ---------------- */
function applyBatStance() { const b = E.bat; if (!b || !humanBats() || G.human < 0 || (b.rig.anim && b.rig.anim.name === 'swing')) return; if (G.phase === 'pre' || G.phase === 'windup' || (G.phase === 'flight' && PT && !PT.sw)) { if (G.callBunt) b.rig.anim = { name: 'bunt', t: 0, dur: 1e9, opt: { hold: true } }; else batterStance(); } }
function practiceSwing() {
  const b = E.bat; if (!b || batBusy()) return;
  if (G.callBunt) { applyBatStance(); flowSfx('swing', .4); return; }
  b.rig.anim = { name: 'swing', t: 0, dur: .26, opt: { practice: true } }; flowSfx('swing', .8); SWLOCK = performance.now() + 900;
}
let _evT = 0;
let _evTouch = false;
document.addEventListener('pointerdown', e => { _evT = e.timeStamp; _evTouch = e.pointerType !== 'mouse'; }, true);
document.addEventListener('pointerup', e => { _evT = e.timeStamp; _evTouch = e.pointerType !== 'mouse'; }, true);      // 觸控是「放開」才揮棒：以放開瞬間的時間戳記為準
document.addEventListener('keydown', e => { _evT = e.timeStamp; }, true);
let FRAME_AVG = 1 / 60;      // 近期平均幀時間（60Hz≈16.7ms、120Hz≈8.3ms）：顯示延遲補償依螢幕更新率自動調整
function dispLat() { return clamp(FRAME_AVG * .7, .005, .024); }      // 滑鼠／鍵盤：畫面顯示延遲補償（看到球到位時，實際球已多飛了這段時間）；60Hz≈12ms，120Hz以上更短
function touchLat() { return dispLat() + .008; }      // 觸控螢幕顯示／觸控延遲補償      // 觸控螢幕顯示／觸控延遲補償：畫面上看到的球比實際晚約 2~3 幀，出棒時間往後修正
function inputNow() { const n = performance.now(); return (_evT > 0 && n - _evT >= 0 && n - _evT < 120) ? _evT : n; }      // 按下的真正時刻（比處理器跑到的時間更準）
function humanAction() {
  if (G.mode !== 'play' || G.freeze) return;
  if (PL && !PL.done && humanBats() && G.human >= 0 && doPush()) return;
  if (humanBats() && G.human >= 0 && !G.callBunt && (G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight') && batBusy()) return;      // 上一次揮棒（含收棒）還沒完整做完，不能再揮
  if (humanBats() && G.human >= 0 && G.phase === 'windup') return;      // 投手出手前的動作：不觸發試揮（避免鎖住真正的揮棒）
  if (humanBats() && G.human >= 0 && (G.phase === 'pre' || G.phase === 'windup') && E.bat && !G.intWalk) { practiceSwing(); return; }      // 球出手前按揮棒＝試揮（不會鎖住之後真正的揮棒）
  if (humanPitches() && G.phase === 'pre' && !G.intWalk) { if (G.rosinBusy || G.batFetch) return; if (G.pm) { if (!G.pm.ret) pmStop(false); } else if ((G.preT || 0) > .3) { updateAim(); pmStart(); } }
  else if (humanBats() && G.phase === 'flight' && PT && !PT.sw && !PT.done && !G.callBunt && PT.t < PT.T + Math.min(.08, (PT.tm || .1) * .7)) {      // 短打狀態下不需（也不能）按揮擊：球碰到棒子自動短打
    updateAim(); const pTc = Math.max(PT.t + .002, PT.t + clamp((inputNow() - lastT) / 1000, 0, .05) * G.ts - (_evTouch ? touchLat() : dispLat())); let R = cursorR(), cx = aim.x, cy = aim.y;      // 補償顯示延遲：視覺上球進點的瞬間按下＝擊球瞬間
    if (G.easy) { const eb = curBatter(), n = (.05 + (100 - eb.con) * .0016) * moodVol(eb); const bq0 = swingBallPos(PT, { tc: pTc }); projPlane(bq0.x, bq0.y, bq0.z); cx = _pj.x + gauss() * n * .35; cy = _pj.y + gauss() * n * .35; R = batterR(eb, PT, false) * 1.1; }      // 簡易模式：自動對準來球，結果只看時機與選手能力
    const kLock = G.easy ? undefined : cursorK();      // 揮棒瞬間鎖定畫面上看到的球棒粗細
    startSwing(PT, { human: true, tc: pTc, cx, cy, power: powOn() && !G.callBunt, bunt: !!G.callBunt, R, k: kLock });
  }
}
