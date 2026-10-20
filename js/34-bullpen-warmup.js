/* 34-bullpen-warmup.js — 牛棚熱身（原 script.js 第 7435-7600 行） */
'use strict';
/* ===================== 牛棚熱身：熱身準備值、教練陪練動畫 ===================== */
// 熱身值 0～100：每遊戲秒 +1.25（約 180 秒滿）。滿了之後再繼續熱身＝「過熱」：超過 20 秒登板體力開始被扣；超過 60 秒起每秒有機率受傷
const WARM = { rate: 100 / 180, over0: 20, hurt0: 60, fatSpan: 60, fatMax: .8, maxWarm: 2 };
const BP = { seq: 0, on: false, cut: false, side: 0, p: null, g: null, pen: null, lanes: [], L: null, layoutSide: -9, th: null, lt: 2, cst: '', ct: 0, k: 0, N: 8, shotCur: null, hudT: 0, startW: 0 };
const BPI = [{ dur: 1.2, fly: .3, arc: .8, gain: 2, v: .72 }, { dur: 1.05, fly: .26, arc: .4, gain: 2.5, v: .88 }, { dur: .9, fly: .2, arc: .14, gain: 3.5, v: 1 }];
const BP_SHOTS = [0, 2, 1, 0, 3, 2, 1, 0];
const _bv = new V3(), _bv2 = new V3();
function warmTxt(p) { const o = p.warmOver || 0, w = p.warm || 0; return o > WARM.hurt0 ? '疲勞・受傷風險高' : o > WARM.over0 ? '過度熱身' : w >= 99.5 ? '已就緒' : w >= 70 ? '手感良好' : w >= 35 ? '熱身中' : w > 0 ? '剛開始' : '未熱身'; }
function warmFatEst(p) { const o = p.warmOver || 0; if (o <= WARM.over0) return 0; const ph = clamp((o - WARM.over0) / WARM.fatSpan, 0, 1), ex = (p.role || 'SP') === 'SP' ? 1.15 : p.role === 'CL' ? 1.55 : 1.3; return Math.round(80 * Math.pow(ph * WARM.fatMax, ex)); }
function warmingList(side) { const t = G.teams && G.teams[side], L = []; if (!t) return L; for (let i = 0; i < t.pitchers.length; i++) { const p = t.pitchers[i]; if (p.warming && i !== t.cur && !p.out) L.push({ p, i }); } return L.sort((a, b) => (a.p.warmAt || 0) - (b.p.warmAt || 0)); }
const BP_LX = (L, i) => (i === 0 ? 1 : -1) * L.sx * 3;      // 兩條練投道的側向位置：第一條靠球場內側（鏡頭這邊）
function bpLayout(side) {      // 牛棚放在自家休息區那一側的界外區，練投道與邊線平行
  const sx = side === 1 ? 1 : -1, a = new V3(.7071 * sx, 0, -.7071), n = new V3(.7071 * sx, 0, .7071);
  const O = a.clone().multiplyScalar(30).addScaledVector(n, 9.5), M = O.clone().addScaledVector(a, 15);
  return { sx, a, n, O, M };
}
function bpBuildProps(side) {      // 兩條並排的練投道（每條有自己的投手丘、本壘板、教練與球）
  if (BP.g) scene.remove(BP.g);
  const L = bpLayout(side); BP.L = L; BP.layoutSide = side;
  const g = new THREE.Group(); BP.g = g; const pen = new THREE.Group(); const mid = L.O.clone().add(L.M).multiplyScalar(.5);
  pen.position.set(mid.x, 0, mid.z); pen.rotation.y = Math.atan2(L.a.x, L.a.z); g.add(pen); BP.pen = pen;
  const wx = -L.sx, dirt = new THREE.MeshLambertMaterial({ color: 0xc98b57 }), dirt2 = new THREE.MeshLambertMaterial({ color: 0xb87a48 }), white = new THREE.MeshLambertMaterial({ color: 0xffffff }), moundM = new THREE.MeshLambertMaterial({ color: 0xd49a66 });
  const flat = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); pen.add(o); return o; };
  BP.lanes = [];
  for (let i = 0; i < 2; i++) {
    const lx = BP_LX(L, i);
    flat(new THREE.PlaneGeometry(4.2, 19), dirt2, lx, .036, .1); flat(new THREE.CircleGeometry(2.9, 28), dirt, lx, .04, -7.5); flat(new THREE.CircleGeometry(3.5, 28), dirt, lx, .04, 7.5);
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, .4, 24), moundM); mound.position.set(lx, .18, 7.5); pen.add(mound);
    const rub = new THREE.Mesh(new THREE.BoxGeometry(1.2, .06, .3), white); rub.position.set(lx, .4, 7.35); pen.add(rub);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .05, 5), white); plate.rotation.y = Math.PI; plate.position.set(lx, .07, -7.5); pen.add(plate);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.1, 12, 8), new THREE.MeshPhongMaterial({ color: 0xffffff, map: seamTex, shininess: 60 })); ball.visible = false; g.add(ball);
    BP.lanes.push({ i, lx, p: null, rigP: null, rigC: null, th: null, lt: 1 + i * 1.8, ball });
  }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.6), new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: .32, side: THREE.DoubleSide })); net.position.set(0, 2.3, -10.6); pen.add(net);
  const pm = new THREE.MeshLambertMaterial({ color: 0x3a3f50 }); for (const s of [-1, 0, 1]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 4.8, 6), pm); pl.position.set(s * 6.5, 2.4, -10.6); pen.add(pl); }
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.1), new THREE.MeshBasicMaterial({ map: canvasTex(512, 108, (c, w, h) => { c.fillStyle = '#12306a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffb23a'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = '#fff'; c.font = "900 54px 'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BULLPEN 牛棚', w / 2, h / 2 + 3); }) })); ban.position.set(0, 5.35, -10.55); pen.add(ban);
  const fence = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.25, 20), new THREE.MeshLambertMaterial({ color: 0x1b3d7a })); fence.position.set(wx * 8.2, .62, 0); pen.add(fence);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(.8, .45, 3.4), new THREE.MeshLambertMaterial({ color: 0x6b4a2a })); bench.position.set(wx * 7, .3, 1.2); pen.add(bench);
  const cool = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .8, 12), new THREE.MeshLambertMaterial({ color: 0xff8a2a })); cool.position.set(wx * 7, .4, 3.6); pen.add(cool);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(.7, .5, .7), new THREE.MeshLambertMaterial({ color: 0xe6e6ea })); bag.position.set(wx * 7, .25, -3.2); pen.add(bag);
  g.visible = false; scene.add(g); BP.p = null;
}
function bpLaneOff(ln) { ln.p = null; ln.th = null; ln.ball.visible = false; if (ln.rigP) { ln.rigP.root.parent && ln.rigP.root.parent.remove(ln.rigP.root); ln.rigP = null; } if (ln.rigC) ln.rigC.root.visible = false; }
function bpLaneSet(ln, side, p) {
  const st = teamStyle(side), pen = BP.pen;
  if (ln.rigP) pen.remove(ln.rigP.root);
  const rp = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, glove: true, pl: p }); pen.add(rp.root); rp.root.position.set(ln.lx, .38, 7.5); rp.root.rotation.y = Math.PI; rp.stride = 0; ln.rigP = rp; ln.p = p;
  if (!ln.rigC) { const rc = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, glove: true, catcher: true }); pen.add(rc.root); rc.root.position.set(ln.lx, 0, -8.8); ln.rigC = rc; }
  ln.rigC.root.visible = true; rigPlay(ln.rigC, 'crouch', 1e9, { hold: true }); ln.th = null; ln.ball.visible = true;
}
function bpAssign(side, first) {      // 把正在熱身的投手（最多兩名）分到兩條練投道；first 一定排在靠近鏡頭的第一條
  const want = warmingList(side).map(o => o.p); let order = [];
  if (first && want.includes(first)) order = [first, ...want.filter(p => p !== first)];
  else { BP.lanes.forEach((ln, i) => { if (ln.p && want.includes(ln.p)) order[i] = ln.p; }); for (const p of want) if (!order.includes(p)) { let k = 0; while (order[k]) k++; order[k] = p; } }
  BP.lanes.forEach((ln, i) => { const p = order[i]; if (!p) bpLaneOff(ln); else if (ln.p !== p) bpLaneSet(ln, side, p); });
  BP.on = want.length > 0; BP.g.visible = BP.on; BP.g.updateMatrixWorld(true);
}
function bpStage(side, p) { if (!BP.g || BP.layoutSide !== side) bpBuildProps(side); bpAssign(side, p); }
function bpClear() { BP.on = false; if (BP.g) { BP.g.visible = false; for (const ln of BP.lanes) { ln.th = null; } } }
function bpReset() { bpClear(); BP.cut = false; BP.p = null; if (BP.lanes) for (const ln of BP.lanes) bpLaneOff(ln); const u = $('penUI'); if (u) u.classList.add('hide'); const w = $('warmBox'); if (w) w.classList.add('hide'); }
function bpSync() { const L = (G.human === 0 || G.human === 1) ? warmingList(G.human) : []; if (!L.length) { bpClear(); if (BP.lanes) for (const ln of BP.lanes) bpLaneOff(ln); } else { if (!BP.g || BP.layoutSide !== G.human) bpBuildProps(G.human); bpAssign(G.human); } bpHud(0, true); }
function bpShot(i, snap) {
  const pen = BP.pen, fx = BP.L.sx, lx = fx * 3; pen.updateMatrixWorld(true);      // fx＝球場內側方向、lx＝第一條練投道位置
  const S = [{ p: [fx * 18, 4.4, -9], l: [0, 1.2, 1], f: 46 }, { p: [lx + fx * .8, 2.3, -14], l: [lx, 1.5, 7.5], f: 26 }, { p: [lx + fx * 7, 2.2, 1.5], l: [lx, 1.3, 6.2], f: 36 }, { p: [lx + fx * 6, 1.8, -2.5], l: [lx, 1.0, -7.8], f: 36 }][i];
  const pos = pen.localToWorld(new V3(S.p[0], S.p[1], S.p[2])), look = pen.localToWorld(new V3(S.l[0], S.l[1], S.l[2])), k = clamp(1.7 / (VW() / VH()), 1, 2.2);      // 直式（窄螢幕）時把鏡頭拉遠，才拍得到完整練投道
  pos.sub(look).multiplyScalar(k).add(look); BP.shotCur = { pos, look, fov: S.f };
  if (snap) { CAMC.tpos.copy(BP.shotCur.pos); CAMC.tlook.copy(BP.shotCur.look); CAMC.tfov = BP.shotCur.fov * (VP.fk || 1); camSnap(); }
}
function bpStart(side, idx) {
  const t = G.teams[side], p = t.pitchers[idx]; if (!p || p.out || p.used || idx === t.cur) return;
  if (G.phase !== 'pre') { say('投球前才能安排熱身'); return; }
  { const cur = warmingList(side).filter(o => o.p !== p); while (cur.length >= WARM.maxWarm) cur.shift().p.warming = false; }      // 最多同時熱身兩名，超過就停掉最早熱身的那位
  p.warming = true; p.warmAt = ++BP.seq; p.warm = p.warm || 0; p.warmOver = p.warmOver || 0; BP.startW = p.warm;
  $('sub').classList.add('hide'); $('acts').classList.remove('open'); $('pitchPanel').classList.add('hide');
  bpStage(side, p); BP.p = p; BP.cut = true; BP.prevPhase = G.phase; G.phase = 'bullpen'; BP.cst = 'intro'; BP.ct = 0; BP.k = 0; BP.n = 0; BP.i1 = false; BP.gun = 0; BP.lanes[0].th = null; BP.t0 = performance.now();
  const hand = p.hand === 'R' ? 1 : -1; rigPlay(BP.lanes[0].rigP, 'armshake', .8, { hand });
  CAMC.mode = 'pen'; bpShot(0, true); $('penUI').classList.remove('hide'); bpOverlay();
  say(`${sideName(side)}請 <em>${p.name}</em> 到牛棚熱身，教練蹲下來陪練`); flowSfx('whistle', .6); bpHud(0, true);
}
function bpEnd() {
  if (!BP.cut) return; BP.cut = false; $('penUI').classList.add('hide'); G.phase = BP.prevPhase || 'pre'; BP.cst = '';
  const ln = BP.lanes[0]; ln.th = null; if (ln.rigP) { ln.rigP.anim = null; ln.rigP.stride = 0; } if (ln.rigC) rigPlay(ln.rigC, 'crouch', 1e9, { hold: true });
  setCamBat(true); updatePlayerBoxes(); updateActs(); buildPitchPanel(); bpHud(0, true);
  const p = BP.p; if (p) say(`<em>${p.name}</em>的熱身準備值 ${Math.round(p.warm || 0)}%，繼續在牛棚保持手感（別熱身太久，體力會下降、也容易受傷）`);
}
function bpSkip() { if (!BP.cut) return; const p = BP.p; if (p && BP.cst !== 'finish') { for (let k = BP.n; k < BP.N; k++) p.warm = Math.min(100, (p.warm || 0) + BPI[k < 3 ? 0 : k < 6 ? 1 : 2].gain); } bpEnd(); }
function bpOverlay() {
  const p = BP.p; if (!p) return; $('penName').textContent = `#${p.num || ''} ${p.name}（${p.hand === 'R' ? '右' : '左'}投）`;
  const w = Math.round(p.warm || 0); $('penBar').style.width = w + '%'; $('penVal').textContent = w + '%';
  $('penCnt').textContent = `練投 ${Math.min(BP.n, BP.N)}/${BP.N}`; $('penGun').textContent = BP.gun ? `🎯 ${BP.gun} km/h` : '— km/h';
  $('penMsg').textContent = BP.cst === 'intro' ? '活動肩膀、踩投手板…' : BP.cst === 'finish' ? '熱身完成！' : BP.n < 3 ? '輕鬆傳接' : BP.n < 6 ? '加快節奏' : '全力投球';
}
function bpThrow(ln, k) {
  const lv = BPI[k], hand = ln.p.hand === 'R' ? 1 : -1;
  rigPlay(ln.rigP, 'pitch', lv.dur, { hand, hold: false }); ln.th = { ph: 'wind', t: 0, lv, k, rel: lv.dur * .62, p0: new V3(), p1: new V3() };
}
function bpFrame(dt) {
  if (!BP.on || !BP.g || !BP.g.visible) return;
  if (BP.cut && performance.now() - BP.t0 >= 10000) { bpSkip(); return; }      // 練投畫面最多 10 秒，時間到自動跳過（剩餘球數照樣補上熱身值）
  for (const ln of BP.lanes) {
    if (!ln.p || !ln.rigP) continue; const rp = ln.rigP, rc = ln.rigC;
    if (rp.stride && (!rp.anim || rp.anim.name !== 'pitch')) rp.stride = Math.max(0, rp.stride - dt * 2.2);
    rp.root.position.set(ln.lx, .38 - Math.min(.3, (rp.stride || 0) * .28), 7.5 - (rp.stride || 0));
    rigStep(rp, dt); rigStep(rc, dt); if (!rc.anim) rigPlay(rc, 'crouch', 1e9, { hold: true });
  }
  BP.g.updateMatrixWorld(true);
  const l0 = BP.lanes[0];
  if (BP.cut && l0.p && l0.rigP) {      // 第一條練投道：熱身動畫流程（暖身 → 輕鬆傳接 → 加快 → 全力投球 → 完成）
    const rp = l0.rigP, rc = l0.rigC, p = l0.p; BP.ct += dt;
    if (BP.cst === 'intro') { if (BP.ct > .8 && !BP.i1) { BP.i1 = true; rigPlay(rp, 'legkick', .7, { leg: 1 }); } if (BP.ct > 1.5) { BP.cst = 'throw'; BP.k = 0; bpThrow(l0, 0); bpShot(BP_SHOTS[0], true); bpOverlay(); } }
    else if (BP.cst === 'throw' && !l0.th) { BP.k++; if (BP.k >= BP.N) { BP.cst = 'finish'; BP.ct = 0; rigPlay(rc, 'cheer', 1.2, {}); rigPlay(rp, 'fistpump', 1.1, { hand: p.hand === 'R' ? 1 : -1 }); bpShot(0, true); bpOverlay(); } else { bpThrow(l0, BP.k < 3 ? 0 : BP.k < 6 ? 1 : 2); bpShot(BP_SHOTS[BP.k], true); bpOverlay(); } }
    else if (BP.cst === 'finish') { if (BP.ct > .9 && rc.anim && rc.anim.name === 'cheer') rc.anim = null; if (BP.ct > 1.1) bpEnd(); }
  }
  for (const ln of BP.lanes) {
    if (!ln.p || !ln.rigP) continue; const rp = ln.rigP, rc = ln.rigC, p = ln.p, cut = BP.cut && ln === l0;
    if (!cut && !ln.th) { ln.lt -= dt; if (ln.lt <= 0) { ln.lt = 3.5 + Math.random() * 3; bpThrow(ln, 1); } }      // 其餘練投道（或比賽進行中）：隔一陣子傳一顆球
    const th = ln.th; if (!th) continue; th.t += dt; const ball = ln.ball;
    if (th.ph === 'wind') { const arm = p.hand === 'R' ? rp.armR : rp.armL; arm.localToWorld(_bv.set(0, -.58, .1)); ball.position.copy(_bv); if (th.t >= th.rel) { th.p0.copy(_bv); rc.glove.getWorldPosition(th.p1); th.ph = 'fly'; th.t = 0; flowSfx('throw', .5); } }
    else if (th.ph === 'fly') {
      const u = clamp(th.t / th.lv.fly, 0, 1); ball.position.lerpVectors(th.p0, th.p1, u); ball.position.y += th.lv.arc * Math.sin(Math.PI * u);
      if (u >= 1) { th.ph = 'ret'; th.t = 0; rigPlay(rc, 'pcatch', .4, {}); flowSfx('mitt', .45 + th.k * .06); if (cut) { spawnBurst(th.p1.x, th.p1.y, th.p1.z, .7); BP.n++; BP.gun = Math.round(p.kmh * (th.lv.v * .86 + .14 * Math.random())); p.warm = Math.min(100, (p.warm || 0) + th.lv.gain); bpOverlay(); } }
    } else if (th.ph === 'ret') {
      const u = clamp((th.t - .1) / .3, 0, 1); rp.armL.localToWorld(_bv2.set(0, -.58, .1)); ball.position.lerpVectors(th.p1, _bv2, u); ball.position.y += 1.1 * Math.sin(Math.PI * u);
      if (u >= 1) { th.ph = 'wait'; th.t = 0; rigPlay(rp, 'catch', .3, {}); flowSfx('mitt', .3); }
    } else if (th.ph === 'wait') { if (th.t > .12) ln.th = null; }
  }
}
function warmApply(np, side) {      // 登板：依熱身值給手感／心情加成；過熱則體力先掉
  const w = clamp(np.warm || 0, 0, 100), o = np.warmOver || 0; np._wn = '';
  if (w > 3) {
    adjustMood(np, w / 100 * 16); np._wn = `（場下熱身 ${Math.round(w)}%，手感與心情變好）`;
    if (o > WARM.over0) { const ph = clamp((o - WARM.over0) / WARM.fatSpan, 0, 1); np.pkLoad = (np.pkLoad || 0) + ph * WARM.fatMax * fatCap(np); np.fatigue = calcFatigue(np); np._wn = `（熱身過度，登板體力已先掉 ${Math.round(np.fatigue)}%）`; }
  }
  np.warming = false; np.warm = 0; np.warmOver = 0; if (side === G.human) bpSync();
}
function warmHurt(side, i) {
  const p = G.teams[side].pitchers[i]; p.out = true; p.warming = false; p.warm = 0; p.warmOver = 0; bpSync();
  toast('熱身受傷！', '#fff', '#e33'); say(`<em>${p.name}</em>在牛棚熱身過度，拉傷退下，無法登板！`); flowSfx('whistle', .6);
}
function warmTick(dt) {
  if (G.over || G.forfeit >= 0 || !G.teams) return;
  for (const side of [0, 1]) {
    const t = G.teams[side]; if (!t || !t.pitchers) continue;
    for (let i = 0; i < t.pitchers.length; i++) {
      const p = t.pitchers[i]; if (!p.warm && !p.warming) continue;
      if (p.warming && i !== t.cur && !p.out) {
        if (p.warm < 100) p.warm = Math.min(100, p.warm + WARM.rate * dt);
        else { p.warmOver = (p.warmOver || 0) + dt; const o = p.warmOver; if (o > WARM.hurt0 && !BP.cut) { const hz = clamp((o - WARM.hurt0) / 90, 0, 1.5) * .006; if (Math.random() < hz * dt) { warmHurt(side, i); return; } } }
      } else if (!p.warming && p.warm > 0) { p.warm = Math.max(0, p.warm - .6 * dt); p.warmOver = Math.max(0, (p.warmOver || 0) - 2 * dt); }
    }
  }
  bpHud(dt);
}
function bpHud(dt, force) {      // 天氣面板下方的熱身準備值（簡易，最多兩名）
  BP.hudT -= dt || 0; if (BP.hudT > 0 && !force) return; BP.hudT = .25;
  const e = $('warmBox'); if (!e) return; const L = (G.mode === 'play' && (G.human === 0 || G.human === 1)) ? warmingList(G.human) : [];
  if (!L.length) { e.classList.add('hide'); return; }
  let worst = 0;
  e.innerHTML = L.map(({ p }) => {
    const v = Math.round(p.warm || 0), o = p.warmOver || 0, fe = warmFatEst(p), lv = o > WARM.hurt0 ? 3 : o > WARM.over0 ? 2 : v >= 99 ? 1 : 0; worst = Math.max(worst, lv);
    return `<div class="wrw ${['', 'rdy', 'hot', 'bad'][lv]}"><div class="wr1"><span>🔥 ${p.name}</span><b>${v}%</b></div><i class="wbar"><u style="width:${v}%"></u></i><div class="wr1 sm"><span>${warmTxt(p)}</span><span>${fe ? '登板體力 -' + fe : ''}</span></div></div>`;
  }).join('');
  e.className = ['', 'rdy', 'hot', 'bad'][worst];
}
$('penSkip').onclick = bpSkip;

