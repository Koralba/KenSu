/* ===== 13-ui-input-menu.js ｜ 畫面 overlay／輸入／投球準度條／返回主選單／代打代跑／比賽設定選單／賽前編成／戰術面板／音樂面板 =====
   載入順序 13/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
'use strict';
/* =====================================================================
   Part 7: overlay, input, menu, main loop, boot
   ===================================================================== */
const ov = $('ov'), octx = ov.getContext('2d');
const PAD = { v: null, f: null };      // v：舊欄位（目前沒有任何程式設定它）；f：手動守備方向盤 {vx,vy}（-1～1，螢幕座標，往上＝vy 負），由下方觸控拖曳設定、js/13g-manual-fielding.js 讀取
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
    const r = drawRing(pax, pay, .26, spec.col, 2.5 * dpr);      // 球圈固定大小（控球差只影響實際落點偏差，不放大圈）
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
    if (G.easy) { const eb = curBatter(), n = (.05 + (100 - eb.con) * .0016) * moodVol(eb); const bq0 = swingBallPos(PT, { tc: pTc }); projPlane(bq0.x, bq0.y, bq0.z); cx = _pj.x + gauss() * n * .35; cy = _pj.y + gauss() * n * .35; R = batFrameR(false) * 1.1; }      // 簡易模式：自動對準來球，結果只看時機與選手能力
    const kLock = G.easy ? undefined : cursorK();      // 揮棒瞬間鎖定畫面上看到的球棒粗細
    startSwing(PT, { human: true, tc: pTc, cx, cy, power: powOn() && !G.callBunt, bunt: !!G.callBunt, R, k: kLock });
  }
}
/* ---------------- 投球準度條（類 MLB MVP 2005）：第一下鎖定落點並啟動，第二下按停；愈靠近綠區愈準 ---------------- */
function pmCancel() { if (G.pm) _tsKey = ''; G.pm = null; const e = $('pmeter'); if (e) e.classList.add('hide'); }
function pmStart() {
  const p = curPitcher(), id = G.selPitch, spec = PITCHES[id], lv = pitchLv(p, id) || 4, brk = Math.hypot(spec.bx, spec.by) * lv / 7;
  let zw = clamp(.05 + (p.ctl - 40) * .0011 + lv * .006 - (p.fatigue || 0) * .0003 + (moodOf(p) - 55) * .0004, .045, .17);
  zw *= clamp(1.22 - brk * .35 - (spec.knuckle ? .15 : 0), .72, 1.2) * 1.2 * (p.rosin > 0 ? 1.05 : 1); if (G.easy) zw *= 1.4;      // 控球好、球種單純（直球）→ 綠區寬；變化球／疲勞／心情差 → 窄
  const dur = clamp(.66 - brk * .15 - (p.fatigue || 0) * .0013, .42, .72) * 1.55, c = .78;      // 準度條掃描速度放慢（比先前慢約 35%）
  G.pm = { id, x: aim.x, y: aim.y, t: 0, dur, c, zw };
  const pc = v => clamp(v * 100, 0, 100).toFixed(1);
  const st = [[0, '#d33'], [c - zw * 1.75, '#d33'], [c - zw * 1.75, '#f80'], [c - zw * .88, '#f80'], [c - zw * .88, '#ec3'], [c - zw * .12, '#ec3'], [c - zw * .12, '#3d6'], [c + zw * .12, '#3d6'], [c + zw * .12, '#ec3'], [c + zw * .88, '#ec3'], [c + zw * .88, '#f80'], [c + zw * 1.75, '#f80'], [c + zw * 1.75, '#d33'], [1, '#d33']];      // 綠＝完美、黃＝正常、橘＝稍微失控、紅＝失準
  $('pmBar').style.background = 'linear-gradient(90deg,' + st.map(a => a[1] + ' ' + pc(a[0]) + '%').join(',') + ')';
  $('pmName').textContent = spec.jp + ' 準度'; $('pmHint').textContent = MOB ? '再按一次「投球」鈕，在綠區按停' : '再按一次投出（對準綠區最準）'; _tsKey = ''; $('pmCur').style.left = '0%'; $('pmeter').classList.remove('hide');
}
function pmStop(auto) {
  const m = G.pm; if (!m) return; const u = clamp(m.t / m.dur, 0, 1), err = Math.abs(u - m.c);
  const e = err / m.zw; let acc, tier;
  if (auto) { acc = 0; tier = 3; }
  else if (e <= .12) { acc = 1; tier = 0; }                                         // 完美出手
  else if (e <= .88) { acc = 1 - (e - .12) / .76 * .3; tier = 1; }                // 正常出手
  else if (e <= 1.75) { acc = .7 - (e - .88) / .87 * .35; tier = 2; }               // 稍微失控
  else { acc = Math.max(0, .35 - (e - 1.75) / .75 * .35); tier = 3; }              // 失準出手
  pmCancel(); doPitch({ id: m.id, x: m.x, y: m.y, acc, tier });
}
function pmTick(dt) {
  const m = G.pm; if (!m) return;
  if (G.mode !== 'play' || G.phase !== 'pre' || !humanPitches() || G.intWalk || G.over) { pmCancel(); return; }
  if (m.ret) { m.rt += dt / (G.ts || 1); const k = clamp(m.rt / m.rdur, 0, 1); $('pmCur').style.left = (1 - k * k * (3 - 2 * k)) * 100 + '%'; if (k >= 1) pmStop(true); return; }
  m.t += dt / (G.ts || 1); $('pmCur').style.left = clamp(m.t / m.dur, 0, 1) * 100 + '%';
  if (m.t >= m.dur) { m.ret = true; m.rt = 0; m.rdur = .3; toast('逾時！失準出手', '#fff', '#a33'); }      // 沒按停＝取消（不再自動投出）
}
$('pmeter').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (G.pm && !G.pm.ret) pmStop(false); });      // 觸控：直接點準度條也能按停
function toGame() {
  sndInit(); if (G.mode === 'title') { G.mode = 'menu'; $('title').classList.add('hide'); $('menu').classList.remove('hide'); CAMC.mode = 'title'; flowSfx('whistle'); }
}
const wrap = $('wrap'); let touchId = null;
let tpt = null;                                              // touch drag state (relative aiming)
const fmPadOn = () => { try { return typeof FM !== 'undefined' && FM.padNeeded(); } catch (_) { return false; } };      // 手動守備需要方向盤（球在場內、已有操控中的野手）
wrap.addEventListener('pointerdown', e => {
  if (G.mode === 'title') return;
  if (EV.brawl && !(e.target.closest && e.target.closest('#absPanel'))) { registerMash(); return; }
  if (e.target.closest && e.target.closest('#menu,#movePad,#rosinTag,.pkTag,.pbtn,.abtn,#sub,#result,#quitDlg,#throwPanel,#touchBtns,#rot,#sb,#pinfo,#topbar,#audioPanel,#absPanel,#actMore,#fmLayer,#fmAssist') && !(e.target.closest('#movePad') && fmPadOn())) return;      // 守備走位時，手指直接放在方向盤上也能拖
  if (e.pointerType === 'mouse') { aim.lm = null; aim.has = true; aim.cx = e.clientX; aim.cy = e.clientY; aim.shift = e.shiftKey || keyShift; updateAim(); humanAction(); return; }
  if (!aim.has) { aim.has = true; aim.cx = e.clientX; aim.cy = e.clientY; updateAim(); }
  tpt = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, ox: 0, oy: 0 }; PAD.f = null; padHint(0, 0, true);
  try { wrap.setPointerCapture(e.pointerId); } catch (_) { }
});
wrap.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { aim.mx = e.clientX; aim.my = e.clientY; if (aim.lm) { if (Math.hypot(e.clientX - aim.lm.x, e.clientY - aim.lm.y) < 10) return; aim.lm = null; } aim.has = true; aim.cx = e.clientX; aim.cy = e.clientY; aim.shift = e.shiftKey || keyShift; return; }
  if (!tpt || e.pointerId !== tpt.id) return;
  const dx = e.clientX - tpt.x, dy = e.clientY - tpt.y; tpt.x = e.clientX; tpt.y = e.clientY; tpt.moved += Math.abs(dx) + Math.abs(dy); tpt.ox = clamp(tpt.ox + dx * .5, -40, 40); tpt.oy = clamp(tpt.oy + dy * .5, -40, 40); padHint(tpt.ox, tpt.oy, true); PAD.f = fmPadOn() ? { vx: tpt.ox / 40, vy: tpt.oy / 40 } : null;      // 手動守備：拖曳量換成方向（≥約 5px 才算，13g 有死區）
  aim.cx = clamp(aim.cx + dx * 1.25, 0, VW()); aim.cy = clamp(aim.cy + dy * 1.25, 0, VH()); aim.has = true;
});
const endTouch = e => { if (!tpt || e.pointerId !== tpt.id) return; const tap = tpt.moved < 12 && performance.now() - tpt.t0 < 280; tpt = null; PAD.f = null; padHint(0, 0, false); /* 觸控拖曳瞄準後放開，不再當成點擊揮棒；只有「揮棒」鈕才會揮棒 */ };      // 觸控投球只能用「投球」鈕，避免誤觸自動開始投球
wrap.addEventListener('pointerup', endTouch); wrap.addEventListener('pointercancel', endTouch);
['contextmenu', 'dblclick', 'gesturestart', 'gesturechange', 'selectstart', 'dragstart'].forEach(n => document.addEventListener(n, e => e.preventDefault()));
['touchstart', 'touchmove'].forEach(n => wrap.addEventListener(n, e => { const t = e.target; if ((t === wrap || (t.tagName === 'CANVAS')) && e.cancelable) e.preventDefault(); }, { passive: false }));      // 球場區域：擋掉長按放大鏡／縮放／捲動
if (IS_TOUCH) document.body.classList.add('touch');
function padHint(x, y, act) { const pad = $('movePad'), th = $('movePadT'); if (!pad) return; pad.classList.toggle('act', !!act); th.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`; }
function recenterAim() {            // 換打者：準心回到好球帶正中央
  const w = VW(), h = VH(), tc = new THREE.PerspectiveCamera(CAMC.tfov, w / h, camera.near, camera.far);
  tc.position.copy(CAMC.tpos); tc.lookAt(CAMC.tlook); tc.updateMatrixWorld(); tc.updateProjectionMatrix();
  const v = new THREE.Vector3(0, ZC, 0).project(tc);
  aim.cx = (v.x * .5 + .5) * w; aim.cy = (-v.y * .5 + .5) * h; aim.x = 0; aim.y = ZC; aim.has = true;
  aim.lm = { x: aim.mx || 0, y: aim.my || 0 };   // 滑鼠：移動超過 10px 才接手
}
$('btnAct').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sndInit(); const b = $('btnAct'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 260); humanAction(); });
$('btnPush').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); doPush(); });
$('btnBack').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); doRetreat(); });
$('btnPow').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setPow(!POW_PREF); });
let _tsKey = '';
/* ---- 右下角主按鈕圖示：投球＝縫線棒球、揮棒＝球棒 ---- */
const BALL_SVG = (() => {
  const q = (t, a, b, c) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c; let tk = '', sm = '';
  for (const m of [0, 1]) {
    const X = v => m ? 64 - v : v; sm += `<path d="M${X(17)} 12 Q${X(31)} 32 ${X(17)} 52" fill="none" stroke="#d8262b" stroke-width="2.4" stroke-linecap="round"/>`;
    for (const t of [.1, .24, .38, .5, .62, .76, .9]) {
      const x = q(t, 17, 31, 17), y = q(t, 12, 32, 52), tx = 2 * (1 - t) * 14 + 2 * t * -14, ty = 2 * (1 - t) * 20 + 2 * t * 20, l = Math.hypot(tx, ty), nx = -ty / l * 3.6, ny = tx / l * 3.6;
      tk += `<line x1="${X(x - nx).toFixed(1)}" y1="${(y - ny).toFixed(1)}" x2="${X(x + nx).toFixed(1)}" y2="${(y + ny).toFixed(1)}" stroke="#d8262b" stroke-width="1.7" stroke-linecap="round"/>`;
    }
  }
  return `<svg viewBox="0 0 64 64"><defs><radialGradient id="gBall" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#fff"/><stop offset=".62" stop-color="#eef0f5"/><stop offset="1" stop-color="#aab3c2"/></radialGradient></defs><circle cx="32" cy="32" r="24" fill="url(#gBall)" stroke="#26344c" stroke-opacity=".5" stroke-width="1.4"/><g transform="translate(0 0)" opacity=".85">${sm}${tk}</g></svg>`;
})();
const BAT_SVG = `<svg viewBox="0 0 64 64"><defs><linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a8"/><stop offset=".5" stop-color="#e2a652"/><stop offset="1" stop-color="#a4651d"/></linearGradient></defs><g transform="rotate(-40 32 32)"><path d="M11 29.8 L30 30.4 C37 29 41 26.8 45 26.4 L53.5 26.4 Q60 26.4 60 32 Q60 37.6 53.5 37.6 L45 37.6 C41 37.2 37 35 30 33.6 L11 34.2 Z" fill="url(#gWood)" stroke="#5a3510" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="8.6" cy="32" rx="3.4" ry="3.6" fill="#7a4a18" stroke="#4a2a08" stroke-width="1.3"/><rect x="11" y="29.9" width="14" height="4.2" fill="#2b2e38"/><path d="M14 29.9 V34.1 M18 29.9 V34.1 M22 29.9 V34.1" stroke="#8d93a6" stroke-width="1"/><path d="M46.5 26.8 V37.2 M50.5 26.6 V37.4" stroke="#8a5a22" stroke-width="1.3" opacity=".7"/><path d="M33 29.6 C39 28 43 26.8 53 27.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round"/></g></svg>`;
let _actK = '';
function setActBtn(k) {
  if (k === _actK) return; _actK = k; const b = $('btnAct'); if (!b) return; b.dataset.k = k;
  const ai = b.querySelector('.ai'), al = b.querySelector('.al'); if (ai) ai.innerHTML = k === 'swing' ? BAT_SVG : BALL_SVG; if (al) al.textContent = k === 'swing' ? '揮棒' : k === 'stop' ? '按停' : '投球';
}
function syncTouch() {
  if (!IS_TOUCH) return;
  const hb = humanBats() && G.human >= 0, hp = humanPitches() && G.human >= 0, ph = G.phase;
  const on = G.mode === 'play' && (hb || hp) && (ph === 'pre' || ph === 'windup' || ph === 'flight');
  const padOn = G.mode === 'play' && (hb || hp || (typeof FM !== 'undefined' && FM.padNeeded())); $('movePad').classList.toggle('on', padOn && !(hb && G.easy));
  const key = [on, hb, hp, G.mode, G.easy, !!G.pm].join(); if (key === _tsKey) return; _tsKey = key;
  $('touchBtns').classList.toggle('on', on); setActBtn(hp ? (G.pm ? 'stop' : 'pitch') : 'swing'); $('btnPow').style.display = hb && !G.easy ? '' : 'none';
  document.body.classList.toggle('playing', G.mode === 'play');
}
let keyShift = false;
window.addEventListener('keydown', e => {
  if (QUIT_OPEN) { if (e.key === 'Escape') closeQuitDlg(); e.preventDefault(); return; }
  if (uiHold()) {      // 面板／選單開著：遊戲暫停，不接受比賽按鍵（Esc 可關閉）
    if (e.key === 'Escape') { _hSub.classList.add('hide'); _hActs.classList.remove('open'); if (!_hAud.classList.contains('hide')) { const c = $('audioClose'); if (c) c.click(); } e.preventDefault(); }
    else if (!/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test((e.target && e.target.tagName) || '')) e.preventDefault();
    return;
  }
  if (G.mode === 'title') { if (!$('careerDlg').classList.contains('hide') && (e.key === 'Escape' || e.key === 'Enter')) { $('careerDlg').classList.add('hide'); e.preventDefault(); } return; }
  if (e.key === 'Shift') { keyShift = true; aim.shift = true; }
  if (G.mode !== 'play') return;
  if (EV.brawl) { if (e.code === 'Space') { registerMash(); e.preventDefault(); } return; }
  if (EV.abs) { const k = e.key.toLowerCase(); if (EV.abs.protest ? k === 'r' : k === 'c') { absResolveInput(true); e.preventDefault(); return; } if (e.code === 'Space' || k === 'escape') { absResolveInput(false); e.preventDefault(); return; } }
  if (!EV.abs && G.absPend && e.key.toLowerCase() === 'c') { runPend(); e.preventDefault(); return; }
  if (G.freeze) { e.preventDefault(); return; }
  if (PL && PL.ask && /^[tT]$/.test(e.key)) { humanThrow('chase'); e.preventDefault(); return; }
  if (PL && PL.ask && /^[rR]$/.test(e.key)) { humanThrow('relay'); e.preventDefault(); return; }
  if (PL && PL.ask && /^[cC]$/.test(e.key)) { humanThrow('chase'); e.preventDefault(); return; }
  if (PL && PL.ask && /^[0-4]$|^[hH]$/.test(e.key)) { humanThrow(/^[hH0]$/.test(e.key) ? 0 : +e.key === 4 ? 0 : +e.key); e.preventDefault(); return; }
  if (e.repeat && (e.code === 'Space' || /^[bBqQeEsSmMfFrRdD]$/.test(e.key))) { e.preventDefault(); return; }
  if (e.code === 'Space') { humanAction(); e.preventDefault(); }
  else if (/^[1-8]$/.test(e.key) && humanPitches() && G.phase === 'pre' && !G.pm) { const p = curPitcher().pitches[+e.key - 1]; if (p) { G.selPitch = p.id; G.pitchOpen = false; buildPitchPanel(); } }
  else if (e.key === 'b' || e.key === 'B') { if (humanBats()) { toggleBunt(); updateActs(); applyBatStance(); } }
  else if (e.key === 'q' || e.key === 'Q') { if (humanBats()) toggleStealPanel(); }
  else if (e.key === 'e' || e.key === 'E') { humanPickoff(); }
  else if (e.key === 'r' || e.key === 'R') { humanRosin(); }
  else if (e.key === 'f' || e.key === 'F') { doPush(); }
  else if (e.key === 'd' || e.key === 'D') { doRetreat(); }
  else if (e.key === 's' || e.key === 'S') { if (humanBats()) setPow(!POW_PREF); }
  else if (e.key === 'm' || e.key === 'M') { if (humanPitches()) { moundVisit(G.human); } }
});
window.addEventListener('keyup', e => { if (e.key === 'Shift') { keyShift = false; aim.shift = false; } });
function humanRosin() { if (humanPitches() && G.phase === 'pre' && !G.pm && !G.intWalk && !G.rosinBusy && G.mode === 'play') { doRosin(); say('投手摸了摸止滑粉，下一球手感更穩'); } }
/* 止滑粉：投球前摸一下，只有「下一球」控球更穩（用掉就沒了，要再摸一次）、不易手滑；出手時手上會飛出一陣白粉 */
function doRosin(done) {
  const P = E.F.P, p = curPitcher(); if (!P || !P.rig || G.rosinBusy) return false;
  G.rosinBusy = true; G.rosinAge = 0; const h = p.hand === 'R' ? 1 : -1, dur = 2.0; P.rig.anim = { name: 'rosin', t: 0, dur, opt: { hand: h } }; faceRig(P.rig, 0, 3);
  // 彎腰 → 手碰粉袋三下（粉袋留在原位、只被壓扁一下）→ 起身雙手搓粉、握好球
  for (const t of [.52, .74, .96]) after(t, () => { if (!G.rosinBusy) return; const b = rosinBag.position; powderPuff(b.x, b.y + .08, b.z, 16, .22, h * .1, .7, 0, .16, { op: .7, life: 1.2, grow: 3.6, sw: .6 }); for (let q = 0; q < 14; q++) fwSpawn(b.x + gauss() * .05, b.y + .1, b.z + gauss() * .05, gauss() * 1.2, 1 + Math.random() * 1.8, gauss() * 1.2, '#ffffff', .5 + Math.random() * .4, .05 + Math.random() * .04, 3, 2); rosinBag.scale.set(1.2, .6, 1.2); flowSfx('mitt', .18); });
  for (const t of [1.3, 1.5]) after(t, () => { if (!G.rosinBusy) return; pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 16, .2, h * .1, .4, .3, .12, { op: .6, life: 1.4, grow: 3.8, sw: .6 }); });
  after(1.75, () => { if (!G.rosinBusy) return; pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 20, .2, 0, .25, 1.4, .12, { op: .6, life: 1.6, grow: 4.4, sw: .8 }); flowSfx('mitt', .12); });
  after(dur, () => { G.rosinBusy = false; p.rosin = 1; if (P.rig.anim && P.rig.anim.name === 'rosin') P.rig.anim = null; if (done) done(); });
  return true;
}
const _rb = new V3(), RB_HOME = { y: .47 };
function updateRosinTag(dt) {      // 粉袋：平時放在投手丘旁（依投手慣用手換邊）；摸粉時被投手拿到手上；「止滑粉」按鈕貼在粉袋旁
  const tag = $('rosinTag'), p = G.mode === 'play' ? curPitcher() : null, h = p && p.hand === 'L' ? -1 : 1, hx = MOUND.x - .4 * h, hz = MOUND.z + .65;
  rosinBag.position.set(hx, RB_HOME.y, hz);
  if (G.rosinBusy) {
    G.rosinAge = (G.rosinAge || 0) + dt;      // 粉袋留在丘上，只在被手碰到時壓扁
    rosinBag.scale.x += (1 - rosinBag.scale.x) * Math.min(1, dt * 12); rosinBag.scale.y += (.75 - rosinBag.scale.y) * Math.min(1, dt * 12); rosinBag.scale.z = rosinBag.scale.x;
  }
  if (!tag) return;
  const hp = humanPitches() && G.human >= 0 && G.mode === 'play' && G.phase === 'pre' && !G.intWalk && !G.rosinBusy && !G.pm;
  tag.classList.remove('on');      // 場上的「粉」標籤不再使用：止滑粉按鈕已移到左下「盜壘」旁的動作列
  const bt = $('btnRosin');
  if (bt) { const mine = humanPitches() && G.human >= 0 && G.mode === 'play'; bt.style.display = mine ? '' : 'none'; bt.disabled = !hp; bt.style.opacity = !mine ? '' : !hp ? '.4' : (p && p.rosin > 0) ? '.6' : ''; }
}
const STT = [];
function updateStealTags() {      // 玩家進攻：每個壘上跑者旁都有「盜壘」字樣，點哪個就哪個跑者盜壘（可連點多位一起盜）
  const rt = $('rosinTag'); if (!rt || !rt.parentNode) return;
  if (!STT.length) for (let i = 0; i < 3; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pkTag'; b.textContent = '盜壘'; b.style.cssText = 'background:rgba(217,150,28,.45);border-color:rgba(255,232,150,.85);color:#fff6d0'; b.setAttribute('aria-label', ['一壘', '二壘', '三壘'][i] + '盜壘'); b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); humanSteal(i); }; rt.parentNode.appendChild(b); STT.push(b); }
  const ok = G.mode === 'play' && humanBats() && G.human >= 0 && stealWindowOpen() && !G.over;
  for (let i = 0; i < 3; i++) {
    const b = STT[i], r = ok ? G.on[i] : null; let show = false;
    if (r && r.state === 'on' && !r.stepGo) { runnerXZ(r, _rp); const sc = w2s(_rp.x, 1.6, _rp.z), pr = ov.width / Math.max(1, ov.clientWidth || ov.width), X = clamp(sc.x / pr + (i === 0 ? 40 : i === 2 ? 46 : 0), 36, ov.clientWidth - 36), Y = sc.y / pr - (i === 1 ? 26 : 8); _rv.set(_rp.x, 1.6, _rp.z).project(camera);
      if (_rv.z < 1 && sc.x / pr > -20 && sc.x / pr < ov.clientWidth + 20 && Y > 20 && Y < ov.clientHeight - 20) { show = true; b.style.left = X + 'px'; b.style.top = Y + 'px'; } }
    b.classList.toggle('on', show);
  }
}
const PKT = [];
function updatePickTags() {      // 「牽制」半透明字樣：貼在有跑者的壘包旁，玩家可自由選擇要牽制哪一壘
  const rt = $('rosinTag'); if (!rt || !rt.parentNode) return;
  if (!PKT.length) for (let i = 0; i < 3; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pkTag'; b.textContent = '牽制'; b.setAttribute('aria-label', ['一壘', '二壘', '三壘'][i] + '牽制'); b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); humanPickoff(i); }; rt.parentNode.appendChild(b); PKT.push(b); }
  const ok = G.mode === 'play' && humanPitches() && G.human >= 0 && G.phase === 'pre' && !G.intWalk && !G.rosinBusy && !G.over; let any = false;
  for (let i = 0; i < 3; i++) {
    const b = PKT[i], r = ok ? G.on[i] : null; let show = false;
    if (r && r.state === 'on') { runnerXZ(r, _rp); const sc = w2s(_rp.x, 1.6, _rp.z), pr = ov.width / Math.max(1, ov.clientWidth || ov.width), X0 = sc.x / pr + (i === 0 ? 40 : i === 2 ? 46 : 0), X = clamp(X0, 36, ov.clientWidth - 36), Y = sc.y / pr - (i === 1 ? 26 : 8); _rv.set(_rp.x, 1.6, _rp.z).project(camera);
      if (_rv.z < 1 && sc.x / pr > -20 && sc.x / pr < ov.clientWidth + 20 && Y > 20 && Y < ov.clientHeight - 20) { show = true; b.style.left = X + 'px'; b.style.top = Y + 'px'; } }
    b.classList.toggle('on', show); if (show) any = true;
  }
  const bp = $('btnPick'); if (bp) bp.style.display = (humanPitches() && G.human >= 0 && !any && ok && (G.on.some(r => r && r.state === 'on') || E.runners.some(q => q.earlyGo && q.state === 'run'))) ? '' : 'none';      // 跑者不在畫面內才退回原本按鈕
}
const _rv = new V3();
function humanPickoff(sel) {
  if (humanPitches() && G.human >= 0 && !G.rosinBusy && stealWindowOpen()) { const rr = E.runners.find(q => q.earlyGo && q.state === 'run' && q.dir > 0 && q.s < .8); if (rr) { stealPickoff(rr); return; } }
  if (typeof sel === 'number') { if (humanPitches() && G.phase === 'pre' && !G.rosinBusy && G.on[sel] && G.on[sel].state === 'on') doPickoff(sel); return; } if (humanPitches() && G.phase === 'pre' && !G.rosinBusy) { for (const i of [2, 1, 0]) if (G.on[i] && G.on[i].state === 'on') { doPickoff(i); return; } } }
$('absGo').onclick = () => EV.abs ? absResolveInput(true) : runPend(); $('absSkip').onclick = () => EV.abs ? absResolveInput(false) : absClearPend();
$('btnPowPc').onclick = () => setPow(!POW_PREF);
$('btnBunt').onclick = $('btnBuntT').onclick = () => { toggleBunt(); updateActs(); applyBatStance(); };
$('btnSteal').onclick = () => toggleStealPanel();
$('btnPick').onclick = () => humanPickoff();
{ const br1 = $('btnRosin'); if (br1) br1.onclick = humanRosin; const rt = $('rosinTag'); if (rt) { rt.onpointerdown = e => { e.stopPropagation(); }; rt.onclick = e => { e.stopPropagation(); humanRosin(); }; } }
$('btnMound').onclick = () => { if (humanPitches()) moundVisit(G.human); };

/* ---------------- 返回主選單（遊戲中途離開：確認後直接中斷比賽） ---------------- */
let QUIT_OPEN = false;
function openQuitDlg() { if (G.mode !== 'play') return; QUIT_OPEN = true; $('quitDlg').classList.remove('hide'); }
function closeQuitDlg() { QUIT_OPEN = false; $('quitDlg').classList.add('hide'); }
/* 比賽中開著「更多」選單／戰術／守備／換投／代打／音樂設定面板時，遊戲暫停（關閉後才繼續），避免邊設定邊偷跑 */
const _hSub = $('sub'), _hAud = $('audioPanel'), _hActs = $('acts');
function uiHold() { return G.mode === 'play' && (!_hSub.classList.contains('hide') || !_hAud.classList.contains('hide') || _hActs.classList.contains('open') || BP.cut); }
function quitToMenu() {
  closeQuitDlg(); try { bpReset(); } catch (e) { }
  TIMERS = []; tweens.length = 0; INTRO.q.length = 0; INTRO.busy = false; INTRO.gen = (INTRO.gen || 0) + 1; HS = 0;
  try { clearPlay(); } catch (e) { }
  G.freeze = false; G.judgeTok = (G.judgeTok || 0) + 1; rpHide(); pmCancel(); PT = null; G.over = true; try { resetRainDelay(); } catch (e) { } G.mode = 'menu'; G.phase = 'over'; G.pending = null; G.walking = false; G.absPend = null; G.cpuBusy = false; G.ts = 1;
  try { evInit(); } catch (e) { }
  if (E.coach) { try { scene.remove(E.coach.rig.root); } catch (e) { } E.coach = null; }
  if (E.argC) { try { scene.remove(E.argC.rig.root); } catch (e) { } E.argC = null; }
  E.rage = null; try { clearMedic(); } catch (e) { }
  setBall({ x: 0, y: 0, z: 0 }, false); rainbow.visible = false; G.night = false; try { applyLighting(); updateNight(0); } catch (e) { }
  for (const id of ['hud', 'intro', 'sub', 'result', 'throwPanel', 'pitchPanel', 'outBanner', 'ejectBanner', 'absPanel', 'hitInfo', 'visitBox', 'brawlBanner']) { const e = $(id); if (e) e.classList.add('hide'); }
  $('acts').classList.remove('open'); $('btnSpeed').textContent = '⏩ 遊戲速度 x1';
  $('menu').classList.remove('hide'); CAMC.mode = 'title';
}
$('btnQuit').onclick = () => openQuitDlg();
$('quitNo').onclick = closeQuitDlg;
$('quitYes').onclick = backToTitle;
try { HINT.on = localStorage.getItem('cpbl_hint') === '1'; } catch (e) { }
const syncHintBtn = () => { $('btnHint').textContent = '🎯 投球落點提示 ' + (HINT.on ? 'ON' : 'OFF'); };
$('btnHint').onclick = () => { HINT.on = !HINT.on; if (!HINT.on) HINT.pt = null; try { localStorage.setItem('cpbl_hint', HINT.on ? '1' : '0'); } catch (e) { } syncHintBtn(); };
syncHintBtn();
$('btnSpeed').onclick = () => { G.ts = G.ts === 1 ? 2 : G.ts === 2 ? 4 : 1; $('btnSpeed').textContent = '⏩ 遊戲速度 x' + G.ts; };
function openSubP(refresh) {
  const sub = $('sub'); if (!refresh && !sub.classList.contains('hide')) { sub.classList.add('hide'); return; }
  if (G.phase !== 'pre') { say('投球前才能換投／熱身'); return; }
  if (G.human < 0 || G.human > 1) { say('只有自己守備（投球）時才能換投'); return; }
  const side = G.human, t = G.teams[side], canSwap = humanPitches(); sub.classList.remove('hide'); sub.dataset.k = 'p';
  sub.innerHTML = '<h3>' + (canSwap ? '換投／場下熱身' : '場下熱身（進攻中只能熱身）') + '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b></h3>';
  const tip = document.createElement('div'); tip.style.cssText = 'font-size:11.5px;opacity:.88;margin:-2px 0 6px;line-height:1.5;color:#ffd9a8'; tip.innerHTML = '🔥 讓預備投手提早在牛棚熱身：手感與心情會變好；熱身太久（過熱）登板時體力會大幅下降，還可能受傷。最多可同時熱身兩名。'; sub.appendChild(tip);
  t.pitchers.forEach((p, i) => {
    if (i !== t.cur && (p.out || p.used)) return; const d = document.createElement('div'); d.className = 'pbtn' + (i === t.cur ? ' sel' : '');
    d.innerHTML = `${p.num} ${p.name} (${p.hand === 'R' ? '右' : '左'}) ${p.kmh}km/h・控球${gr(p.ctl)}<span>${p.role === 'SP' ? '先發' : p.role === 'CL' ? '終結者' : p.lr ? '長中繼' : '中繼'}${i === t.cur ? '・目前投手' : ''}</span>`;
    d.onclick = () => { if (!canSwap) { say('目前是進攻局，無法換投；可以先按「場下熱身」讓投手提早準備'); return; } if (G.human !== side || !humanPitches() || G.phase !== 'pre') { sub.classList.add('hide'); return; } if (i !== t.cur) { changePitcher(side, i, false, '玩家指示'); } sub.classList.add('hide'); buildPitchPanel(); };
    if (i !== t.cur) {
      const w = document.createElement('div'); w.className = 'wu'; const wv = Math.round(p.warm || 0), fe = warmFatEst(p);
      w.innerHTML = `<i class="wb"><u style="width:${wv}%"></u></i><em>${p.warming || wv > 0 ? '熱身 ' + wv + '%・' + warmTxt(p) + (fe ? '・體力-' + fe : '') : '尚未熱身'}</em>`;
      const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'wubtn' + (p.warming ? ' on' : ''); bt.textContent = p.warming ? '■ 停止熱身' : '🔥 場下熱身';
      bt.onclick = e => { e.stopPropagation(); if (p.warming) { p.warming = false; bpSync(); openSubP(true); } else { bpStart(side, i); } };
      w.appendChild(bt); d.appendChild(w); d.style.flexWrap = 'wrap';
    }
    sub.appendChild(d);
  });
  const c = document.createElement('div'); c.className = 'pbtn'; c.textContent = '關閉'; c.onclick = () => sub.classList.add('hide'); sub.appendChild(c);
}
$('btnSub').onclick = () => openSubP(false);
/* ---------------- 代打／代跑 ---------------- */
$('btnBench').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide')) { sub.classList.add('hide'); return; }
  if (G.phase !== 'pre' || !humanBats()) { say('投球前才能代打／代跑'); return; }
  const side = G.human, t = G.teams[side], b = curBatter(); const avail = t.bench.filter(x => !x.out);
  sub.classList.remove('hide'); sub.dataset.k = 'b'; sub.innerHTML = '<h3>代打／代跑<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b></h3>';
  const mk = (txt, cls, fn) => { const d = document.createElement('div'); d.className = 'pbtn' + (cls ? ' ' + cls : ''); d.innerHTML = txt; d.onclick = fn; sub.appendChild(d); return d; };
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const fitTx = (x, pos) => { const p = fitPenalty(x.nat, pos); return p === 0 ? '守位適合' : '守備 -' + Math.round(p * 100) + '%'; };
  const done = () => { sub.classList.add('hide'); updatePlayerBoxes(); updateActs(); };
  if (!avail.length) { head('板凳已經沒有人了'); }
  else {
    head(b.isPitcherBat ? '代打：投手打席無法代打（請先換投）' : `代打：換下第${G.bi[side] + 1}棒 ${b.name}`);
    if (!b.isPitcherBat) avail.forEach(x => mk(`${x.name} (${x.nat}・${x.hand === 'R' ? '右' : x.hand === 'L' ? '左' : '兩'}打)<span>巧${gr(x.con)} 力${gr(x.pow)} 速${gr(x.spd)}・${fitTx(x, b.pos)}</span>`, '', () => {
      const s2 = subInto(side, b, x); if (!s2) return; if (E.bat) E.bat.pl = s2; setupBatter(); say(`代打！${sideName(side)}換上 <em>${s2.name}</em> 代替 ${b.name}`); toast('代打', '#fff', '#39f'); G.log.push('代打'); done(); }));
    const runners = E.runners.filter(r => r.state === 'on' && r.from >= 1 && !r.pl.isPitcherBat);
    runners.forEach(r => { head(`代跑：${r.from}壘跑者 ${r.pl.name}（速度${grLetter(r.pl.spd)}）`); avail.forEach(x => mk(`${x.name} (${x.nat})<span>速${gr(x.spd)}・${fitTx(x, r.pl.pos)}</span>`, '', () => {
      const old = r.pl, s2 = subInto(side, old, x); if (!s2) return; r.pl = s2; r.spd = (5.6 + s2.spd * .036) * MOVEK; r.rig.limp = 0; say(`代跑！${s2.name}代替 ${old.name} 站上${r.from}壘`); toast('代跑', '#fff', '#39f'); G.log.push('代跑'); done(); })); });
  }
  { const ret = t.retired || []; head('規則：退場球員本場不得再上場；代打／代跑者承接被替換者的棒次與守位');
    if (ret.length) { head('已退場名單'); ret.forEach(x => { const d = document.createElement('div'); d.className = 'pbtn'; d.style.opacity = '.5'; d.innerHTML = x.name + '<span>' + (x.nat || '') + '</span>'; sub.appendChild(d); }); } }
  mk('關閉', '', () => sub.classList.add('hide'));
};
/* ---------------- menu ---------------- */
/* CFG.H / CFG.A = 真正的主隊／客隊；CFG.ctl = 我操控(0主 1客 2觀戰)；CFG.ord = 我方先後攻(0先攻 1後攻)
   CFG.away / CFG.home / CFG.side 為遊戲內部使用：away＝先攻球隊、home＝後攻球隊、side＝我方所在的攻擊順序 */
const CFG = { park: '', easy: 0, assist: 0, H: 1, A: 0, ctl: 0, ord: 0, homeFirst: true, away: 1, home: 0, side: 0, inn: 9, lv: 1, abs: 1, pn: 0, evt: 1, ace: 0, wx: 1, night: -1 };
function syncCfg() {
  const ctlHome = CFG.ctl !== 1, myFirst = CFG.ord === 0;
  const homeFirst = ctlHome ? myFirst : !myFirst;
  CFG.homeFirst = homeFirst;
  CFG.away = homeFirst ? CFG.H : CFG.A; CFG.home = homeFirst ? CFG.A : CFG.H;
  CFG.side = CFG.ctl === 2 ? 2 : (ctlHome ? (homeFirst ? 0 : 1) : (homeFirst ? 1 : 0));
  const a = $('homeOrd'), b = $('awayOrd'); if (a) a.textContent = homeFirst ? '先攻' : '後攻'; if (b) b.textContent = homeFirst ? '後攻' : '先攻';
}
function buildCards() {
  syncCfg();
  for (const [id, key] of [['homeCards', 'H'], ['awayCards', 'A']]) {
    const box = $(id); box.innerHTML = '';
    TEAMS.forEach((t, i) => {
      if (t.hidden) return;      // 生涯模式的臨時球隊不出現在一般選單
      const d = document.createElement('div'); d.className = 'card' + (CFG[key] === i ? ' sel' : ''); d.innerHTML = t.icon ? `<i class="bdg ico">${t.icon}</i><span>${t.card || t.short}</span>` : `<i class="bdg" style="background:linear-gradient(135deg,${t.c1} 50%,${t.c2} 50%)"></i><span>${t.short}</span>`; d.setAttribute('role', 'button');
      d.onclick = () => { const ok = key === 'A' ? 'H' : 'A'; if (CFG[ok] === i) CFG[ok] = CFG[key]; CFG[key] = i; buildCards(); }; box.appendChild(d);   // 選到對方隊伍時自動互換，避免同隊對戰
    });
  }
}
const LV_DESC = ['<b>弱</b>　電腦多投好打的直球、變化小、球速較慢且控球穩定（少壞球），打者容易揮空，適合新手練習', '<b>普通</b>　標準難度，電腦配球與控球均衡、偶有變化球，打者表現中等，推薦首次遊玩', '<b>強</b>　電腦會讀球、針對你的弱點配球，球種等級與球威更高，打者更會選球，守備與跑壘更積極', '<b>宗師・最高難度</b>　電腦極度聰明強悍：選球與配球近乎精準、記住並攻擊你的弱點、守備反應更快，專為高手設計'];
function setLvDesc(v) { const e = $('lvDesc'); if (e) { e.innerHTML = (LV_DESC[v] || '') + (CFG.easy ? '<br><b>簡易模式</b>　打擊只要抓時機按「揮棒」、不用瞄準；守備由電腦自動傳球補位' : ''); e.dataset.lv = v; } }
setLvDesc(CFG.lv);
document.querySelectorAll('.pill').forEach(p => p.onclick = () => { const k = p.dataset.k; CFG[k] = +p.dataset.v; if (k === 'lv' || k === 'easy') setLvDesc(CFG.lv); if (k === 'ctl' || k === 'ord') syncCfg(); document.querySelectorAll(`.pill[data-k="${k}"]`).forEach(x => x.classList.toggle('sel', x === p)); });
{ const sp = $('selPark'); if (sp) { sp.innerHTML = '<option value="">自動（依主場／賽程）</option>' + STADIUMS.map(n => `<option value="${n}">${n}${PARKS[n].dome ? '（室內）' : ''}</option>`).join(''); sp.title = '選擇比賽球場；不同球場的外野尺寸、牆高與天氣特性都不同'; sp.onchange = () => { CFG.park = sp.value; }; } }
function launchGame() { sndInit(); const c = Object.assign({}, CFG); if (c.ace) c.spIdx = 0; c.edit = [0, 1].map(i => { const e = ED[i], id = TEAMS[i ? CFG.home : CFG.away].id; return CFG.side === i && e && e.teamId === id ? e : null; }); $('lineup').classList.add('hide'); newGame(c); }
$('startBtn').onclick = () => { sndInit(); openLineup(); };
$('quickBtn').onclick = () => { sndInit(); ED[0] = ED[1] = null; launchGame(); };          // 直接開賽：雙方使用預設陣容
$('swapTeams').onclick = () => { const t = CFG.A; CFG.A = CFG.H; CFG.H = t; buildCards(); };
/* =====================================================================
   賽前編成：守備位置／打擊順序／先發投手（中職真實名單）＋ 比賽中守備調整
   ===================================================================== */
const ED = [null, null];
const ED_TAB = { v: 0 };
const POS_LABEL = { C: '捕手', '1B': '一壘', '2B': '二壘', '3B': '三壘', SS: '游擊', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊' };
const _edPoolCache = {};
function edPool(teamId) {          // 該隊 12 名野手（9 先發＋3 板凳）的能力值（與比賽中完全相同的換算結果）
  if (_edPoolCache[teamId]) return _edPoolCache[teamId]; const D = CPBL[teamId], m = {};
  D.bat.concat(D.bench).forEach(r => { m[r.n] = mkBatter(r, 0); }); return _edPoolCache[teamId] = m;
}
function edDefault(ti) {
  const def = TEAMS[ti ? CFG.home : CFG.away], t = buildTeam(def, { spIdx: 0 }, undefined);
  const pos = {}; t.lineup.forEach(p => { pos[p.name] = p.pos; });
  return { teamId: def.id, order: t.lineup.map(p => p.name), pos, spIdx: 0 };
}
function edEnsure(ti) { const id = TEAMS[ti ? CFG.home : CFG.away].id; if (!ED[ti] || ED[ti].teamId !== id) ED[ti] = edDefault(ti); return ED[ti]; }
const edChips = (p, pos) => { const pen = fitPenalty(p.nat, pos), fl = Math.round(p.fld0 * (1 - pen)), c = v => v >= 80 ? 'hi' : v >= 65 ? 'mid' : v >= 50 ? '' : 'lo';
  return `<span class="chip">巧${gr(p.con)}</span><span class="chip">力${gr(p.pow)}</span><span class="chip">速${gr(p.spd)}</span><span class="chip">守${gr(fl)}</span><span class="chip">${p.hand === 'S' ? '兩' : p.hand === 'L' ? '左' : '右'}打</span>${pen ? `<span class="chip warn">非本位 −${Math.round(pen * 100)}%</span>` : ''}`; };
function spCardHtml(r, i, on, clickable) {
  const p = mkPitcher(r);
  return `<div class="spc${on ? ' on' : ''}${isSJH(r) ? ' sjh' : ''}"${clickable ? ` data-sp="${i}"` : ' style="cursor:default"'}><div><b>${isSJH(r) ? (SJH.ok ? '⭐ ' : '🔒 ') : ''}${r.n}</b><em>${r.h === 'L' ? '左' : '右'}投</em></div><small>${Math.round(p.kmh)}km/h・球威${gr(stuffOf(p))}・控球${gr(p.ctl)}・ERA ${r.era.toFixed(2)}${r.est ? '（估）' : ''}</small><small>${p.pitches.map(q => PITCHES[q.id].short + lvGr(q.lv)).join(' ')}</small></div>`;
}
function askSJH(onOk, onCancel) {      // 傳說球員密碼視窗
  const old = document.getElementById('sjhDlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'sjhDlg';
  d.innerHTML = '<div class="sjh-box"><div class="sjh-t">🔒 傳說球員・蘇家禾</div><div class="sjh-s">請輸入密碼才能選擇這位球員</div><input id="sjhIn" type="text" inputmode="numeric" maxlength="8" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="****"><div class="sjh-e" id="sjhE"></div><div class="sjh-b"><button type="button" id="sjhNo">取消</button><button type="button" id="sjhYes">確認</button></div></div>';
  document.body.appendChild(d);
  const inp = d.querySelector('#sjhIn'), err = d.querySelector('#sjhE'), close = () => d.remove();
  let real = ''; inp.addEventListener('input', () => { let r = ''; for (let i = 0; i < inp.value.length; i++) { const c = inp.value[i]; r += c === '*' ? (real[i] || '') : c; } real = r.replace(/\D/g, '').slice(0, 8); inp.value = '*'.repeat(real.length); });
  const no = () => { close(); if (onCancel) onCancel(); };
  const go = () => { if (real === SJH.pw) { SJH.ok = true; close(); if (onOk) onOk(); } else { err.textContent = '密碼錯誤，請再試一次'; inp.value = ''; real = ''; inp.focus(); } };
  d.querySelector('#sjhYes').onclick = go; d.querySelector('#sjhNo').onclick = no;
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); else if (e.key === 'Escape') no(); });
  d.addEventListener('pointerdown', e => e.stopPropagation());
  setTimeout(() => inp.focus(), 60);
}
function renderLineup() {
  const el = $('lineup'), ti = ED_TAB.v, ed = edEnsure(ti), def = TEAMS[ti ? CFG.home : CFG.away], D = CPBL[def.id], pool = edPool(def.id);
  const mine = CFG.side === ti, names = Object.keys(pool).filter(n => mine || n !== SJH.name), bench = names.filter(n => ed.order.indexOf(n) < 0);
  let h = `<div class="lu-card"><div class="lu-h"><b>🧢 賽前編排</b><button type="button" id="luX" class="lu-x" title="返回比賽設定">✕</button></div>
  <div class="lu-tabs">${[0, 1].map(i => { const d = TEAMS[i ? CFG.home : CFG.away]; return `<button type="button" class="lu-tab${i === ti ? ' on' : ''}" data-t="${i}" style="border-bottom-color:${d.c1}">${(i === (CFG.homeFirst ? 0 : 1)) ? '主隊' : '客隊'}(${i ? '後攻' : '先攻'})・${d.short}${CFG.side === i ? ' ★' : ''}</button>`; }).join('')}</div>
  <div class="lu-tip">${mine ? '點「名字」或「守位」直接更換，選到重複的會自動互換。' : '🤖 電腦隊伍會在開賽時自動決定先發與棒次。' + (CFG.side === 2 ? '（觀戰模式：兩隊皆由電腦編排）' : '')}</div>`;
  if (!mine) {
    h += `<div class="lu-sec">球隊野手</div><div class="lu-roster">`;
    names.forEach(n => { const p = pool[n]; h += `<div class="rc"><b>${n}<small style="opacity:.7;font-weight:500">（${p.nat}）</small></b><span class="lc">${edChips(p, p.nat)}</span></div>`; });
    h += `</div><div class="lu-sec">投手群</div><div class="lu-sp">${D.sp.map((r, i) => isSJH(r) ? '' : spCardHtml(r, i, false, false)).join('')}</div>
    <div class="lu-btns"><button type="button" id="luBack" class="pillb">← 返回</button><button type="button" id="luDone" class="pillb" style="background:linear-gradient(#5fd98f,#1f9150)">開始比賽 ▶</button></div></div>`;
    el.innerHTML = h; return;
  }
  h += `<div class="lu-quick"><button type="button" id="luAuto" class="pillb">🤖 智慧編排</button><button type="button" id="luReset" class="pillb">↺ 還原預設</button></div>
  <div class="lu-sec">先發投手</div><div class="lu-sp">${D.sp.map((r, i) => spCardHtml(r, i, ed.spIdx === i, true)).join('')}</div>
  <div class="lu-sec">打擊順序・守備位置</div>`;
  ed.order.forEach((n, i) => {
    const p = pool[n], pos = ed.pos[n];
    h += `<div class="lr"><span class="ln">${i + 1}</span>
    <select class="lp" data-i="${i}">${names.map(x => `<option value="${x}"${x === n ? ' selected' : ''}>${x === SJH.name ? (SJH.ok ? '⭐ ' : '🔒 ') : ''}${x}（${pool[x].nat}${bench.indexOf(x) >= 0 ? '・板凳' : ''}）</option>`).join('')}</select>
    <select class="ls" data-i="${i}">${POS9.map(q => `<option value="${q}"${q === pos ? ' selected' : ''}>${POS_LABEL[q]}</option>`).join('')}</select>
    <span class="mv"><button type="button" data-up="${i}"${i ? '' : ' disabled'}>▲</button><button type="button" data-dn="${i}"${i < 8 ? '' : ' disabled'}>▼</button></span>
    <span class="lc">${edChips(p, pos)}</span></div>`;
  });
  h += `<div class="lu-sec">板凳（可代打／代跑／代守）</div>`;
  bench.forEach(n => { const p = pool[n]; h += `<div class="lr bn"><span class="ln">板</span><span class="bnm">${n === SJH.name ? (SJH.ok ? '⭐ ' : '🔒 ') : ''}${n}（${p.nat}）</span><span class="lc">${edChips(p, p.nat)}</span></div>`; });
  h += `<details class="lu-doc"><summary>📖 能力值如何影響比賽</summary><div>
  <b>打者</b>：巧打＝揮棒圈大小／碰到壞球的極限；力量＝擊球初速與全壘打；速度＝跑壘、盜壘與內野安打；選球＝辨識變化球；得點圈＝壘上有人時的打擊技術；對左投＝面對左投手的打擊；捕球＝野手接球失誤率（與守備範圍合計）。異手對決打者較有利。<br>
  <b>投手</b>：球速與球種等級（Lv）決定位移幅度；控球決定落點與暴投率；球數增加會疲勞。<br>
  <b>守備</b>：守＝反應、跑速、飛撲與失誤率；肩＝傳球速度；非本位球員依適性折減。<br>
  <b>天氣</b>：大雨與暴雨會縮小揮棒圈、削弱擊球力道，並讓球路與滾地球更難掌握。暴雨時失誤與突發狀況更常發生、場上會積水（球碰到水窪會直接停住）；暴雨持續太久主審會暫停比賽，暫停時可用「教練抗議」連點把抗議值衝滿、激烈抗議讓比賽繼續，但過一陣子雨勢沒變小仍會再度暫停。<br><b>台灣特色天氣</b>：梅雨（綿密細雨、濕冷）、午後雷陣雨（雷雨來得快去得快，雨後可能出現彩虹）、颱風外圍環流（強風與一陣一陣的風雨，失誤變多）、悶熱高溫（氣溫可達 37°C 以上，球飛得較遠、投手體力消耗更快）、空氣霾害（視線不佳、高飛球更難判斷）、東北季風（穩定強風、濕冷）。各球場的區域天氣傾向不同。<br><b>夜間比賽</b>：選好球場後有 30% 機率改為夜場；燈塔全開、場地明亮，氣溫較涼、風較小，高飛球易受燈光眩光影響。</div></details>
  <div class="lu-btns"><button type="button" id="luBack" class="pillb">← 返回</button><button type="button" id="luDone" class="pillb" style="background:linear-gradient(#5fd98f,#1f9150)">開始比賽 ▶</button></div></div>`;
  el.innerHTML = h;
}
(function () {
  const el = $('lineup'); let st = 0;
  const open = () => { SJH.ok = false; for (let k = 0; k < 2; k++) { const e0 = ED[k]; if (e0 && ((e0.order || []).indexOf(SJH.name) >= 0 || (e0.spIdx != null && isSJH(((CPBL[e0.teamId] || {}).sp || [])[e0.spIdx])))) ED[k] = null; } ED_TAB.v = CFG.side === 1 ? 1 : 0; edEnsure(0); edEnsure(1); renderLineup(); el.classList.remove('hide'); el.scrollTop = 0; };
  window.openLineup = open;
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('click', e => {
    const t = e.target, ed = ED[ED_TAB.v]; if (!ed) return;
    if (t.id === 'luX' || t.id === 'luBack') { el.classList.add('hide'); return; }
    if (t.id === 'luDone') { launchGame(); return; }
    if (t.id === 'luAuto') { if (CFG.side !== ED_TAB.v) return; const na = aiAutoEdit(TEAMS[ED_TAB.v ? CFG.home : CFG.away], { ace: 1 }); na.spIdx = ed.spIdx || 0; ED[ED_TAB.v] = na; renderLineup(); return; }
    if (t.id === 'luReset') { if (CFG.side !== ED_TAB.v) return; ED[ED_TAB.v] = edDefault(ED_TAB.v); renderLineup(); return; }
    if (t.dataset.t !== undefined && t.classList.contains('lu-tab')) { ED_TAB.v = +t.dataset.t; renderLineup(); return; }
    if (CFG.side !== ED_TAB.v) return; const sp = t.closest('[data-sp]'); if (sp) { const si = +sp.dataset.sp, rr = CPBL[TEAMS[ED_TAB.v ? CFG.home : CFG.away].id].sp[si]; if (isSJH(rr)) { askSJH(() => { ed.spIdx = si; renderLineup(); }); return; } ed.spIdx = si; renderLineup(); return; }
    if (t.dataset.up !== undefined || t.dataset.dn !== undefined) { const i = +(t.dataset.up !== undefined ? t.dataset.up : t.dataset.dn), j = t.dataset.up !== undefined ? i - 1 : i + 1; if (j < 0 || j > 8) return; [ed.order[i], ed.order[j]] = [ed.order[j], ed.order[i]]; renderLineup(); }
  });
  el.addEventListener('change', e => {
    const t = e.target, ed = ED[ED_TAB.v]; if (!ed || t.dataset.i === undefined || CFG.side !== ED_TAB.v) return; const i = +t.dataset.i;
    if (t.classList.contains('lp') && t.value === SJH.name && !SJH.pass) { const nv = t.value; renderLineup(); askSJH(() => { const s2 = el.querySelector('.lp[data-i="' + i + '"]'); if (s2) { s2.value = nv; SJH.pass = true; s2.dispatchEvent(new Event('change', { bubbles: true })); SJH.pass = false; } }); return; }
    if (t.classList.contains('lp')) {              // 換人：選到先發者＝兩人互換打序；選到板凳者＝替換並承接守位
      const n = t.value, j = ed.order.indexOf(n), old = ed.order[i];
      if (j >= 0) { if (j !== i) [ed.order[i], ed.order[j]] = [ed.order[j], ed.order[i]]; }
      else { ed.order[i] = n; ed.pos[n] = ed.pos[old]; delete ed.pos[old]; }
    } else if (t.classList.contains('ls')) {       // 換守位：與持有該守位者互換
      const q = t.value, me = ed.order[i], j = ed.order.findIndex(n => ed.pos[n] === q);
      if (j >= 0 && ed.order[j] !== me) ed.pos[ed.order[j]] = ed.pos[me]; ed.pos[me] = q;
    }
    renderLineup();
  });
})();
/* ---------------- 比賽中：戰術（敬遠／野手站位） ---------------- */
function humanIBB() {
  if (!(humanPitches() && G.human >= 0 && G.mode === 'play' && G.phase === 'pre') || G.pm || G.rosinBusy || G.intWalk || G.over) { say('投球前、尚未開始投球時才能下達敬遠'); return false; }
  G.intWalk = true; G.preT = 0; G.pitchDelay = .8; G.prepT = .1; const b = curBatter();
  say(castA(`戰術：<em>敬遠</em>！直接保送 ${b.name}`)); toast('敬遠', '#9fff9f', '#2a9a3a'); try { updateActs(); updatePlayerBoxes(); } catch (e) { } return true;
}
function setTac(group, val) {
  if (!(humanPitches() && G.human >= 0 && G.mode === 'play' && G.phase === 'pre') || G.pm || G.intWalk) { say('投球前才能調整戰術站位'); return; }
  G.tac = G.tac || {}; G.tac[group] = (val && G.tac[group] !== val) ? val : null;
  computeShift(); resetFormation(false); const t = (group === 'inf' ? TAC_INF : TAC_OF)[val];
  say(G.tac[group] ? `戰術：<em>${t.name}</em>` : `戰術：${t.name}解除，回到標準站位`); toast(G.tac[group] ? t.name : '標準站位', '#cfe', '#07a');
}
function openTacPanel() {
  const sub = $('sub'); sub.classList.remove('hide'); sub.dataset.k = 't';
  const close = '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b>'; sub.innerHTML = '<h3>🧭 戰術' + close + '</h3>';
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const mk = (txt, fn, on) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (on) d.style.outline = '2px solid #ffd84a'; d.onclick = () => { fn(); sub.classList.add('hide'); }; sub.appendChild(d); };
  mk(`${!(G.tac && (G.tac.inf || G.tac.of)) ? '✔ ' : ''}不使用任何戰術<span>取消內野、外野站位戰術，回到完全沒有使用戰術的預設站位</span>`, () => { G.tac = {}; computeShift(); resetFormation(false); say('戰術：不使用任何戰術，回到預設站位'); toast('預設站位', '#cfe', '#07a'); }, !(G.tac && (G.tac.inf || G.tac.of)));
  head('投手');
  mk(`敬遠　<span>強制讓目前打者直接保送上壘${G.on[0] && G.on[1] && G.on[2] ? '（滿壘會押回一分！）' : ''}</span>`, humanIBB, G.intWalk);
  head('內野站位（再按一次＝解除）');
  for (const k in TAC_INF) mk(`${G.tac && G.tac.inf === k ? '✔ ' : ''}${TAC_INF[k].name}<span>${TAC_INF[k].desc}</span>`, () => setTac('inf', k), G.tac && G.tac.inf === k);
  head('外野站位（再按一次＝解除）');
  for (const k in TAC_OF) mk(`${G.tac && G.tac.of === k ? '✔ ' : ''}${TAC_OF[k].name}<span>${TAC_OF[k].desc}</span>`, () => setTac('of', k), G.tac && G.tac.of === k);
  mk('關閉', () => { });
}
/* ---------------- 比賽中：進攻戰術（擠壓短打／打帶跑／盜壘選人／離壘距離） ---------------- */
function openOffPanel() {
  const sub = $('sub'); sub.classList.remove('hide'); sub.dataset.k = 'o'; sub.dataset.s = '';
  const close = '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b>'; sub.innerHTML = '<h3>🏃 進攻戰術' + close + '</h3>';
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const mk = (txt, fn, on) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (on) d.style.outline = '2px solid #ffd84a'; d.onclick = () => { fn(); try { updateActs(); } catch (e) { } sub.classList.add('hide'); }; sub.appendChild(d); };
  const stopBunt = () => { if (G.callBunt) { cancelBunt(true); applyBatStance(); } };
  const none = !(G.offCall || G.leadMode || G.stealReq || G.callBunt);
  mk(`${none ? '✔ ' : ''}不使用任何戰術<span>取消短打、犧牲打、盜壘、擠壓、打帶跑，離壘回到標準，全部恢復預設進攻</span>`, () => { stopBunt(); G.offCall = null; G.squeeze = null; G.stealReq = false; G.stealSel = null; G.stealSet = null; G.leadMode = 0; G.hitAndRun = false; say('進攻：不使用任何戰術，回到預設進攻'); toast('預設進攻', '#cfe', '#07a'); }, none);
  const o2 = G.outs < 2, on3 = !!(G.on[2] && G.on[2].state === 'on'), on12 = !!((G.on[0] && G.on[0].state === 'on') || (G.on[1] && G.on[1].state === 'on'));
  const dis = (txt, why) => { const d = document.createElement('div'); d.className = 'pbtn'; d.style.opacity = '.5'; d.innerHTML = txt + '<span style="color:#ffb0a0">⛔ 目前無法執行：' + why + '</span>'; d.onclick = () => { toast('無法執行：' + why, '#fff', '#c33'); say('進攻戰術<em>無法執行</em>：' + why); }; sub.appendChild(d); };
  head('強迫取分・擠壓短打（再按一次＝取消）');
  if (on3 && o2) {
    mk(`${G.offCall === 'safety' ? '✔ ' : ''}安全式擠壓<span>打者短打，三壘跑者看球再決定要不要衝回本壘</span>`, () => { if (G.offCall === 'safety') { G.offCall = null; stopBunt(); return; } G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'safety'; _buntTs = 0; if (!G.callBunt) toggleBunt(true); applyBatStance(); say('進攻戰術：<em>安全式擠壓短打</em>'); toast('安全式擠壓', '#ffe9a0', '#c60'); }, G.offCall === 'safety');
    mk(`${G.offCall === 'suicide' ? '✔ ' : ''}自殺式擠壓<span>投手一出手三壘跑者就起跑，打者一定要把球短打在地上</span>`, () => { if (G.offCall === 'suicide') { G.offCall = null; stopBunt(); return; } G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'suicide'; _buntTs = 0; if (!G.callBunt) toggleBunt(true); applyBatStance(); say('進攻戰術：<em>自殺式擠壓短打</em>！下一球三壘跑者起跑'); toast('自殺式擠壓', '#ffe9a0', '#c60'); }, G.offCall === 'suicide');
  } else { const why = !on3 ? '三壘沒有跑者' : '已經兩出局（擠壓需未滿兩出局）'; dis('安全式擠壓（強迫取分）', why); dis('自殺式擠壓（強迫取分）', why); }
  head('犧牲短打・犧牲高飛（再按一次＝取消）');
  if (on12 && o2) {
    mk(`${G.offCall === 'sac' ? '✔ ' : ''}犧牲短打<span>打者以出局數換取一、二壘跑者推進一個壘包，打者多半被刺殺</span>`, () => { if (G.offCall === 'sac') { G.offCall = null; stopBunt(); return; } G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'sac'; _buntTs = 0; if (!G.callBunt) toggleBunt(true); applyBatStance(); say('進攻戰術：<em>犧牲短打</em>，把跑者送上去！'); toast('犧牲短打', '#ffe9a0', '#c60'); }, G.offCall === 'sac');
  } else dis('犧牲短打', !on12 ? '一、二壘都沒有跑者（三壘有人請用擠壓或犧牲高飛）' : '已經兩出局（犧牲短打需未滿兩出局）');
  if (on3 && o2) {
    mk(`${G.offCall === 'sacfly' ? '✔ ' : ''}犧牲高飛<span>打者刻意把球打高，外野接殺後三壘跑者觸壘跑回本壘得分；打成滾地球就沒效果</span>`, () => { if (G.offCall === 'sacfly') { G.offCall = null; return; } stopBunt(); G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'sacfly'; say('進攻戰術：<em>犧牲高飛</em>，打者要把球打高！'); toast('犧牲高飛', '#ffe9a0', '#c60'); }, G.offCall === 'sacfly');
  } else dis('犧牲高飛', !on3 ? '三壘沒有跑者' : '已經兩出局（犧牲高飛需未滿兩出局）');
  const runs = []; if (G.on[1] && !G.on[2]) runs.push([1, '二壘跑者', '三壘']); if (G.on[0] && !G.on[1]) runs.push([0, '一壘跑者', '二壘']);
  if (runs.length) {
    head('盜壘（再按一次＝取消）');
    runs.forEach(([i, nm, to]) => { const r = G.on[i], on = G.stealReq && G.offCall !== 'hitrun' && (G.stealSel === i || (G.stealSel == null && i === runs[0][0]));
      mk(`${on ? '✔ ' : ''}${nm}盜${to}<span>${r.pl.name}　速${gr(r.pl.spd)}</span>`, () => { if (on) { G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = null; return; } if (G.offCall === 'suicide' || G.offCall === 'safety' || G.offCall === 'sac') { G.offCall = null; stopBunt(); } G.offCall = null; G.stealSel = i; G.stealSet = null; G.stealReq = true; say(`進攻戰術：<em>${nm}盜${to}</em>，跑者立即起跑`); }, on); });
    head('打帶跑（跑者提前起跑、打者務必揮棒；再按一次＝取消）');
    runs.forEach(([i, nm, to]) => { const r = G.on[i], on = G.stealReq && G.offCall === 'hitrun' && (G.stealSel === i || (G.stealSel == null && i === runs[0][0]));
      mk(`${on ? '✔ ' : ''}${nm}打帶跑（跑${to}）<span>${r.pl.name}比盜壘更早起跑，打者要揮棒；滾地安打可多推進一壘，揮空或飛球有被刺殺／雙殺風險</span>`, () => { if (on) { G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = null; return; } stopBunt(); G.stealSel = i; G.stealSet = null; G.stealReq = true; G.offCall = 'hitrun'; say(`進攻戰術：<em>打帶跑</em>！${nm}提前起跑，打者務必揮棒`); toast('打帶跑', '#ffe9a0', '#c60'); }, on); });
  }
  if (!runs.length) { head('盜壘・打帶跑'); const why = '沒有可前進的跑者（需一壘有人且二壘空，或二壘有人且三壘空）'; dis('盜壘', why); dis('打帶跑', why); }
  if (!G.on.some(r => r && r.state === 'on')) { head('壘上跑者離壘距離'); dis('大幅／標準／保守離壘', '壘上沒有跑者'); }
  if (G.on.some(r => r && r.state === 'on')) {
    head('壘上跑者離壘距離');
    mk(`${G.leadMode > 0 ? '✔ ' : ''}大幅離壘<span>離壘更遠、更容易推進，但也更容易被牽制、被電腦看穿</span>`, () => { G.leadMode = G.leadMode > 0 ? 0 : 1; say(G.leadMode ? '跑者：<em>大幅離壘</em>' : '跑者：標準離壘'); }, G.leadMode > 0);
    mk(`${!G.leadMode ? '✔ ' : ''}標準離壘<span>預設，依跑者腳程與企圖心自動決定</span>`, () => { G.leadMode = 0; say('跑者：標準離壘'); }, !G.leadMode);
    mk(`${G.leadMode < 0 ? '✔ ' : ''}保守離壘<span>靠近壘包、不易被牽制，但推進較吃虧</span>`, () => { G.leadMode = G.leadMode < 0 ? 0 : -1; say(G.leadMode ? '跑者：<em>保守離壘</em>' : '跑者：標準離壘'); }, G.leadMode < 0);
  }
  mk('關閉', () => { });
}
function toggleStealPanel() {
  const sub = $('sub'); if (!sub.classList.contains('hide') && sub.dataset.k === 'o' && sub.dataset.s === '1') { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanBats()) return;
  if (!canSteal()) { G.stealReq = false; G.stealSet = null; updateActs(); say('壘上沒有可以盜壘的跑者（前方壘包有人）'); return; }
  openStealPanel();
}
function openStealPanel() {      // 盜壘選擇：全員盜壘，或自己勾選壘上哪幾位跑者要跑（可複選）
  const sub = $('sub'); sub.classList.remove('hide'); sub.dataset.k = 'o'; sub.dataset.s = '1';
  const names = ['一壘跑者', '二壘跑者', '三壘跑者'], tos = ['二壘', '三壘', '本壘'];
  const render = () => {
    sub.innerHTML = '<h3>🏃 盜壘選擇<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b></h3>';
    const cur = stealIdxs(), cand = [2, 1, 0].filter(i => G.on[i] && G.on[i].state === 'on');
    const item = (txt, fn, on) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (on) d.style.outline = '2px solid #ffd84a'; d.onclick = () => { fn(); try { updateActs(); } catch (e) { } render(); }; sub.appendChild(d); };
    const apply = set => { set = [...new Set(set)]; if (!set.length) { G.stealReq = false; G.stealSet = null; G.stealSel = null; say('取消盜壘指示'); return; } if (G.offCall === 'hitrun') G.offCall = null; G.stealSel = null; G.stealSet = set; G.stealReq = true; const ix = stealIdxs(); say(ix.length ? `盜壘：<em>${ix.map(i => names[i]).join('、')}</em>立即起跑` : '目前沒有可以盜壘的跑者'); };
    const all = cand;
    item(`${G.stealReq && all.length && all.every(i => cur.includes(i)) && cur.length === all.length ? '✔ ' : ''}全員盜壘<span>所有能跑的跑者一起起跑（${all.map(i => names[i]).join('、')}）</span>`, () => apply(all), G.stealReq && all.length > 0 && all.every(i => cur.includes(i)));
    cand.forEach(i => { const r = G.on[i], on = cur.includes(i), need = G.on[i + 1] && i < 2 ? '（前方有人，跑到壘前等）' : '';
      item(`${on ? '✔ ' : '☐ '}${names[i]}盜${tos[i]}${need}<span>${r.pl.name}　速${gr(r.pl.spd)}</span>`, () => { let set = cur.slice(); if (on) set = set.filter(x => x !== i); else set.push(i); apply(set); }, on); });
    if (G.stealReq) item('取消盜壘', () => apply([]), false);
    item('完成', () => sub.classList.add('hide'), false);
  };
  render();
}
$('btnOff').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide') && sub.dataset.k === 'o') { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanBats()) { say('進攻戰術只能在自己打擊時使用（守備時請用「戰術（敬遠／站位）」）'); return; }
  if (G.phase !== 'pre') { say('投手已經開始投球動作，請在下一球投球前下達進攻戰術'); return; }
  openOffPanel();
};
$('btnTac').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide') && sub.dataset.k === 't') { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanPitches() || G.phase !== 'pre') { say('自己守備、投球前才能下達戰術'); return; }
  openTacPanel();
};
/* ---------------- 比賽中：守備調整（代守／互換守位） ---------------- */
function openDefPanel(a) {
  const sub = $('sub'), side = G.human, t = G.teams[side]; sub.classList.remove('hide'); sub.dataset.k = 'd';
  const close = '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b>';
  const mk = (txt, fn, op) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (op) d.style.opacity = op; d.onclick = fn; sub.appendChild(d); };
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const fin = msg => { sub.classList.add('hide'); say(msg); updatePlayerBoxes(); updateActs(); };
  const pct = (nat, pos) => { const p = fitPenalty(nat, pos); return p ? '守備 −' + Math.round(p * 100) + '%' : '守位適合'; };
  if (!a) {
    sub.innerHTML = '<h3>守備調整' + close + '</h3>'; head('點選要調整的野手（投球前、球進入死球狀態才能換）');
    t.lineup.forEach(p => { if (p.out) return; mk(`${POS_LABEL[p.pos] || p.pos}　${p.name}<span>守${gr(p.fld)} 肩${gr(p.arm)}${p.penalty ? '・非本位' : ''}</span>`, () => openDefPanel(p)); });
    mk('關閉', () => sub.classList.add('hide')); return;
  }
  sub.innerHTML = `<h3>${POS_LABEL[a.pos] || a.pos}　${a.name}${close}</h3>`;
  head('代守：換上板凳球員（原球員退場、本場不得再上）');
  const bn = t.bench.filter(x => !x.out); if (!bn.length) head('（板凳沒有人了）');
  bn.forEach(x => mk(`${x.name}（${x.nat}）<span>${pct(x.nat, a.pos)}・巧${gr(x.con)} 守${gr(x.fld0)} 肩${gr(x.arm0)}</span>`, () => { const old = a, s2 = subInto(side, old, x); if (s2) { toast('代守', '#fff', '#39f'); fin(`代守！${sideName(side)}換上 <em>${s2.name}</em> 守${POS_LABEL[a.pos] || a.pos}，${old.name}退場`); } }));
  if (a.pos === 'DH') head('指定打擊不能與野手互換守位（規則：DH 一旦守備即失去指定打擊資格）');
  else { head('互換守位（兩人都留在場上）'); t.lineup.forEach(b => { if (b === a || b.out || b.pos === 'DH') return; mk(`與 ${POS_LABEL[b.pos]} ${b.name} 互換<span>你守${POS_LABEL[b.pos]}：${pct(a.nat, b.pos)}　他守${POS_LABEL[a.pos]}：${pct(b.nat, a.pos)}</span>`, () => { const pa = a.pos, pb = b.pos; setPos(a, pb); setPos(b, pa); swapFielderRig(pa, b); swapFielderRig(pb, a); toast('換守位', '#fff', '#39f'); fin(`守備調整：${a.name}改守${POS_LABEL[pb]}，${b.name}改守${POS_LABEL[pa]}`); }); }); }
  mk('← 返回', () => openDefPanel()); 
}
$('btnDef').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide')) { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanPitches() || G.phase !== 'pre') { say('自己守備、投球前才能調整守備'); return; }
  openDefPanel();
};

/* ---------------- 手機版：中間面板依左右兩塊的實際寬度排版，避免重疊 ---------------- */
let _lt = 0;
function layoutTop() {
  const bso = $('bso'), tb = $('topbar'), lc = $('leftCol'), hudEl = $('hud'); if (!bso || !tb) return;
  { const bb0 = bso.getBoundingClientRect(); if (bb0.height) { document.documentElement.style.setProperty('--abstop', Math.ceil(bb0.bottom + 4) + 'px'); } }      // ABS 提示緊貼壘包／出局數資訊板正下方
  if (MOB && !hudEl.classList.contains('hide')) {
    const bb = bso.getBoundingClientRect();
    if (bb.width) { const st = document.documentElement.style; st.setProperty('--bsow', Math.ceil(bb.width) + 'px'); st.setProperty('--bsoh', Math.ceil(bb.height) + 'px'); }
    const hr = hudEl.getBoundingClientRect(), t = tb.getBoundingClientRect();
    if (t.height) lc.style.top = Math.round(t.bottom - hr.top + 4) + 'px';
  } else lc.style.top = '';
}
setInterval(layoutTop, 400);
window.addEventListener('resize', layoutTop); window.addEventListener('orientationchange', () => setTimeout(layoutTop, 200));
/* ---------------- 手機版：可展開的小面板 ---------------- */
$('btnMore').onclick = () => $('acts').classList.toggle('open');
$('actMore').addEventListener('click', () => setTimeout(() => $('acts').classList.remove('open'), 0));
/* 「更多」選單：依實際位置限制高度（不再被畫面邊緣截掉）、顯示可捲動提示、開啟時隱藏會遮擋的提示 */
(function () {
  const acts = $('acts'), more = $('actMore'), hud = $('hud');
  function fitMore() {
    const open = acts.classList.contains('open');
    document.body.classList.toggle('moreOpen', open);
    if (!open) { more.style.maxHeight = ''; more.classList.remove('sc-up', 'sc-dn'); return; }
    const hr = hud.getBoundingClientRect(), ar = acts.getBoundingClientRect();
    const room = Math.floor(ar.top - Math.max(hr.top, 0) - 12);            // 「更多」按鈕上方可用的高度
    more.style.maxHeight = Math.max(120, room) + 'px';
    more.classList.toggle('sc-up', more.scrollTop > 2);
    more.classList.toggle('sc-dn', more.scrollTop + more.clientHeight < more.scrollHeight - 2);
  }
  new MutationObserver(fitMore).observe(acts, { attributes: true, attributeFilter: ['class'] });
  more.addEventListener('scroll', fitMore, { passive: true });
  window.addEventListener('resize', fitMore);
  window.addEventListener('orientationchange', () => setTimeout(fitMore, 200));
  setInterval(fitMore, 300);                                                // 按鈕數量會隨打擊／投球切換，定時重算
})();
$('sb').addEventListener('click', () => { if (MOB) { $('sb').classList.toggle('open'); layoutTop(); } });
let _piT = 0;
$('pinfo').addEventListener('click', () => { if (!MOB) return; const el = $('pinfo'); el.classList.toggle('open'); clearTimeout(_piT); if (el.classList.contains('open')) _piT = setTimeout(() => el.classList.remove('open'), 7000); });
document.addEventListener('pointerdown', e => {
  const wasOpen = G.mode === 'play' && ($('acts').classList.contains('open') || !$('sub').classList.contains('hide'));
  for (const [id, sel] of [['sb', '#sb'], ['pinfo', '#pinfo'], ['acts', '#acts']]) { if (!MOB && id !== 'acts') continue; if (!e.target.closest(sel)) $(id).classList.remove('open'); }
  if (wasOpen && !e.target.closest('#acts,#sub,#audioPanel,#quitDlg,#absPanel,#sb,#pinfo,#topbar,#result,#menu,.abtn,.pbtn')) { e.stopPropagation(); e.preventDefault(); }      // 選單／面板開著時，點場上只是關選單，不會順便揮棒或投球
}, true);

/* ---------------- 背景音設定面板（「更多」→「背景音設定」開啟） ---------------- */
(function () {
  const panel = $('audioPanel'), mute = $('audioMute'), vol = $('audioVol'), num = $('audioNum'), list = $('audioTracks'), now = $('audioNow');
  const save = () => { try { localStorage.setItem('cpbl_bgm_vol', BGM.vol); localStorage.setItem('cpbl_bgm_mute', BGM.mute ? '1' : '0'); localStorage.setItem('cpbl_bgm_track', BGM.track); } catch (e) { } };
  const tagCls = { '熱血': 'hot', '休閒': 'chill', '輕鬆': 'chill', '趣味': 'fun' };
  BGM_TRACKS.forEach((T, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'trk'; b.dataset.i = i;
    b.innerHTML = `<span class="ti">${T.icon}</span><span class="tn"><b>${T.name}</b><i>${T.sub}</i></span><em class="${tagCls[T.tag] || ''}">${T.tag}</em>`;
    b.addEventListener('click', () => { sndInit(); if (BGM.mute || BGM.vol === 0) { BGM.mute = false; if (BGM.vol === 0) BGM.vol = 50; bgmApplyVol(); } bgmSelect(i); save(); sync(); b.blur(); });
    list.appendChild(b);
  });
  const sfxM = $('sfxMute'), sfxV = $('sfxVol'), sfxN = $('sfxNum');
  const sfxSave = () => { try { localStorage.setItem('cpbl_sfx_vol', SND.vol); localStorage.setItem('cpbl_sfx_mute', SND.mute ? '1' : '0'); } catch (e) { } };
  const sfxSync = () => { const off = SND.mute || SND.vol === 0; sfxM.textContent = off ? '🔇 遊戲音效　關' : '🔊 遊戲音效　開'; sfxM.classList.toggle('on', !off); sfxV.value = SND.vol; sfxN.textContent = SND.vol; };
  let sfxTestT = 0; const sfxTest = () => { const n = performance.now(); if (n - sfxTestT < 350) return; sfxTestT = n; try { flowSfx('mitt', 1); } catch (e) { } };
  sfxM.addEventListener('click', () => { sndInit(); if (SND.mute || SND.vol === 0) { SND.mute = false; if (SND.vol === 0) SND.vol = 70; } else SND.mute = true; sfxApplyVol(); sfxSave(); sfxSync(); sfxM.blur(); if (!SND.mute) sfxTest(); });
  sfxV.addEventListener('input', () => { sndInit(); SND.vol = +sfxV.value; if (SND.vol > 0) SND.mute = false; sfxApplyVol(); sfxSave(); sfxSync(); });
  sfxV.addEventListener('change', () => { sfxTest(); sfxV.blur(); });
  const vibB = $('vibToggle'), vibN = $('vibNote');
  const vibSync = () => { vibB.disabled = !VIB.can; vibB.classList.toggle('on', VIB.on && VIB.can); vibB.textContent = !VIB.can ? '📳 此裝置不支援震動' : VIB.on ? '📳 打擊震動　開' : '📳 打擊震動　關'; vibN.textContent = VIB.can ? '開啟後，打到球手機／平板會震動：打得越扎實震得越有力，擦棒或時機不好只有輕微一下。' : '（電腦與 iPhone 的瀏覽器不支援網頁震動，Android 手機／平板可使用）'; };
  vibB.addEventListener('click', () => { if (!VIB.can) return; VIB.on = !VIB.on; try { localStorage.setItem('cpbl_vib', VIB.on ? '1' : '0'); } catch (e) { } vibSync(); if (VIB.on) { try { navigator.vibrate([30, 20, 60]); } catch (e) { } } vibB.blur(); });
  const sync = () => {
    vibSync(); sfxSync(); const off = BGM.mute || BGM.vol === 0; mute.textContent = off ? '🔇 背景音樂　關' : '🔊 背景音樂　開'; mute.classList.toggle('on', !off); vol.value = BGM.vol; num.textContent = BGM.vol;
    [...list.children].forEach((b, i) => b.classList.toggle('on', i === BGM.track)); const T = BGM_TRACKS[BGM.track]; now.textContent = `♪ 目前播放：${T.name}（${T.sub}）`;
  };
  const open = () => { sndInit(); sync(); panel.classList.remove('hide'); };
  const close = () => { panel.classList.add('hide'); if (document.activeElement) document.activeElement.blur(); };
  $('btnBgm').addEventListener('click', e => { e.stopPropagation(); open(); });
  $('menuBgm').addEventListener('click', e => { e.stopPropagation(); open(); });
  $('titleBgm').addEventListener('click', e => { e.stopPropagation(); open(); });
  $('titleBgm').addEventListener('pointerdown', e => e.stopPropagation());
  $('audioClose').addEventListener('click', close);
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  document.addEventListener('pointerdown', e => {            // 面板開著時，點外面＝關閉（並吃掉這次點擊，避免誤觸揮棒）
    if (panel.classList.contains('hide')) return;
    if (e.target.closest('#audioPanel,#btnBgm,#menuBgm,#titleBgm')) return;
    close(); e.stopPropagation(); e.preventDefault();
  }, true);
  mute.addEventListener('click', () => { sndInit(); if (BGM.mute || BGM.vol === 0) { BGM.mute = false; if (BGM.vol === 0) BGM.vol = 50; } else BGM.mute = true; bgmApplyVol(); save(); sync(); mute.blur(); });
  vol.addEventListener('input', () => { sndInit(); BGM.vol = +vol.value; if (BGM.vol > 0) BGM.mute = false; bgmApplyVol(); save(); sync(); });
  vol.addEventListener('change', () => vol.blur());
  sync();
  /* 主畫面（標題）就有音樂：載入時先建立音訊；瀏覽器要求「使用者操作後」才能出聲，所以第一次點擊／觸控／按鍵立刻啟動 */
  try { sndInit(); } catch (e) { }
  const wake = () => { try { if (!SND.ctx) sndInit(); else if (SND.ctx.state !== 'running') SND.ctx.resume(); } catch (e) { } };
  ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, wake, { capture: true, passive: true }));
})();
