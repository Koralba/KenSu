/* ===== 13zv-out-walk-coast.js ｜ v1.5.4：出局後走下場＋轉場前不凍結 =====
   純外觀，不改任何模擬狀態（出局判定、跑者、球的結果都不動）。亂數只用 Math.random 選「失落／默默」兩種心情與速度，不影響模擬。
   A. 出局的球員不再瞬間消失：
      ・跑者／打者被判出局（putOut）→ 立刻原地轉身，往最近的休息區方向「垂頭喪氣」走開（失落：頭低低、手垂著、偶爾搖頭；
        默默：頭微低、安靜走），走到界外後才消失；三出局攻守交換時也繼續走（endHalf 不再把他們一起藏起來），下一個半局開始才清掉。
      ・三振／界外飛球接殺的打者（原本換下一棒時直接被丟掉）→ 換打者時把他接手：放下球棒（輕輕丟下）後走開。
      ・實作方式：包住 putOut／cleanupRunners／disposeRig／setupBatter／finishAB／endHalf／rebuildField／updateRunners／rigStep，
        不改原函式；快轉（window.__ff）時完全略過，維持原本行為。
   B. 黑幕轉場前不再「時間停止」（給 06 的 skipDeadBall／updatePlay、11 的 flowOnPlayEnd 呼叫）：
      ・死球逾時轉場（skipDeadBall）：球若在手上，跟著持球野手一起走；球若在空中，繼續飛完傳球（落在接球者手上）。
      ・界外球撿太久轉場（slowFetch）：球繼續沿原本的滾動軌跡滾動，追球的野手繼續追、追到就撿起來，一直到黑幕全黑（snapToReady）才收掉。
   開關：`WK.on=false` 關 A；`COAST.on=false` 關 B。載入位置：13zu 之後、14 之前。 */
'use strict';
const WK = { on: true, list: [], sideX: 26, sideZ: 7 };      // sideX／sideZ：休息區方向的目標點（左右各一，x 取正負）
const COAST = { on: true, co: null };
const _vsNow = () => { try { return typeof vsOn === 'function' && vsOn(); } catch (e) { return false; } };      // 區網對戰：兩台要逐步一致，這個純外觀層直接略過（維持原本行為）
const _wkOK = () => WK.on && !window.__ff && !_vsNow() && G && G.mode === 'play';

/* ---------------- A. 出局球員走下場 ---------------- */
function wkTarget(x, z) {      // 最近的一側休息區；站在正中間（二壘附近、本壘）就依攻擊方決定（上半＝客隊走三壘側）
  const sx = Math.abs(x) > 4 ? Math.sign(x) : (G.half === 0 ? -1 : 1);
  return { x: sx * WK.sideX, z: WK.sideZ };
}
function wkAdd(rig, opt) {
  if (!rig || !rig.root || rig._wk || !_wkOK()) return null;
  const px = rig.root.position.x, pz = rig.root.position.z, tg = wkTarget(px, pz), low = Math.random() < .55;      // 55% 失落、45% 默默走開
  const w = { rig, tx: tg.x, tz: tg.z, t: 0, low, pause: low ? .9 : .45, sp: low ? 1.9 + Math.random() * .4 : 2.5 + Math.random() * .5, life: 14, bat: !!(opt && opt.bat) };
  rig._wk = w; rig._wkd = { k: 0, low, t0: 0 }; rig.anim = null; rig.run = 0; rig.ready = false; rig.sliding = false;
  rig.root.visible = true; rig.root.rotation.x = 0; rig.root.rotation.z = 0;
  if (rig.bat && rig.bat.visible) { try { if (typeof KFX !== 'undefined' && KFX.toss) KFX.toss(rig, 'drop'); } catch (e) { } rig.bat.visible = false; }      // 球棒輕輕放下（沒有特效就直接收起來）
  if (rig.root.parent !== scene) scene.add(rig.root);
  WK.list.push(w); return w;
}
function wkRemove(w) { try { scene.remove(w.rig.root); } catch (e) { } w.rig._wk = null; w.rig._wkd = null; const i = WK.list.indexOf(w); if (i >= 0) WK.list.splice(i, 1); }
function wkClear() { for (const w of WK.list.slice()) wkRemove(w); WK.list.length = 0; }
function wkStep(dt) {
  for (const w of WK.list.slice()) {
    const rig = w.rig, p = rig.root.position;
    if (!rig.root.parent) { w.rig._wk = null; w.rig._wkd = null; const i = WK.list.indexOf(w); if (i >= 0) WK.list.splice(i, 1); continue; }
    w.t += dt; const dx = w.tx - p.x, dz = w.tz - p.z, d = Math.hypot(dx, dz);
    if (d < .9 || w.t > w.life) { wkRemove(w); continue; }      // 走到界外／休息區入口：消失
    rig.anim = null; rig.ready = false;
    const dd = rig._wkd; dd.k = Math.min(1, dd.k + dt * 2.2);      // 垂頭的幅度慢慢加上去（不是瞬間低頭）
    if (w.t < w.pause) { rig.run = 0; faceRigSmooth(rig, dx, dz, dt, 3); }      // 先呆站一下（失落／發愣），再起步
    else {
      const ramp = Math.min(1, (w.t - w.pause) * 1.1 + .25), sp = w.sp * ramp, st = Math.min(d, sp * dt);
      p.x += dx / d * st; p.z += dz / d * st; p.y = (typeof moundY === 'function') ? moundY(p.x, p.z) : 0;
      rig.run = w.low ? .62 : .8; faceRigSmooth(rig, dx, dz, dt, 7);
    }
    if (!(E.runners.some(q => q.rig === rig) || (E.bat && E.bat.rig === rig))) rigStep(rig, dt);      // 已不在跑者／打者名單裡的人，主迴圈不會幫他更新動作，這裡自己更新
  }
}
function faceRigSmooth(rig, dx, dz, dt, k) {
  let dy = Math.atan2(dx, dz) - rig.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rig.root.rotation.y += dy * Math.min(1, dt * k);
}
function wkDroop(r) {      // rigStep 之後疊上去：低頭、肩膀垂下、手臂下垂；失落版還會搖頭
  const d = r._wkd, w = r._wk; if (!d || !w) return;
  const k = d.k, low = d.low, sh = low && w.t < w.pause + 1.6 ? Math.sin(w.t * 5.5) * .32 * Math.max(0, 1 - w.t / (w.pause + 1.6)) : 0;
  r.head.rotation.x += (low ? .55 : .24) * k; r.head.rotation.y += sh;
  r.body.rotation.x += (low ? .13 : .05) * k;
  if (low) { r.armL.rotation.x *= (1 - .6 * k); r.armR.rotation.x *= (1 - .6 * k); r.armL.rotation.x += .08 * k; r.armR.rotation.x += .08 * k; r.armL.rotation.z -= .12 * k; r.armR.rotation.z += .12 * k; }
  else { r.armL.rotation.x *= (1 - .3 * k); r.armR.rotation.x *= (1 - .3 * k); }
}

/* --- 包住既有函式（不改原檔邏輯） --- */
{
  const _putOut = putOut;
  putOut = function (r, how) {
    const was = r && r.state, res = _putOut.apply(this, arguments);
    try { if (r && r.rig && was !== 'out' && was !== 'home' && r.state === 'out' && wkAdd(r.rig, { bat: r.bat })) { r.fadeT = -1e9; r._wkRig = true; } } catch (e) { console.error(e); }      // 原本「倒地 → 1.8 秒後隱藏」改成立刻走開
    return res;
  };
  const _cleanup = cleanupRunners;
  cleanupRunners = function () {      // 打席結束時原本會把出局的跑者從場景拿掉：走路中的人留在場景上
    const keep = E.runners.filter(r => r.state === 'out' && r._wkRig && r.rig._wk);
    const res = _cleanup.apply(this, arguments);
    for (const r of keep) if (r.rig._wk && r.rig.root.parent !== scene) scene.add(r.rig.root);
    return res;
  };
  const _dispose = disposeRig;
  disposeRig = function (r) { if (r && r._wk) return; return _dispose.apply(this, arguments); };      // 走路中的人不被一般清理流程移除
  const _setupBatter = setupBatter;
  setupBatter = function () { try { if (E.bat && E.bat._out && E.bat.rig) wkAdd(E.bat.rig, { bat: true }); } catch (e) { console.error(e); } return _setupBatter.apply(this, arguments); };      // 三振／界外接殺的打者：換下一棒時接手
  const _finishAB = finishAB;
  finishAB = function (kind) { try { if ((kind === 'K' || kind === 'foulout') && E.bat) E.bat._out = true; } catch (e) { } return _finishAB.apply(this, arguments); };
  const _endHalf = endHalf;
  endHalf = function () {
    const res = _endHalf.apply(this, arguments);
    try { if (G.phase === 'endhalf') { if (E.bat && E.bat._out && E.bat.rig) { wkAdd(E.bat.rig, { bat: true }); E.bat._out = false; } for (const w of WK.list) w.rig.root.visible = true; } } catch (e) { console.error(e); }      // 三出局：不要把剛出局的人一起藏起來，讓他們走完
    return res;
  };
  const _rebuild = rebuildField;
  rebuildField = function () { try { wkClear(); } catch (e) { } return _rebuild.apply(this, arguments); };      // 新半局／新比賽開始：清掉所有走路中的人
  const _ur = updateRunners;
  updateRunners = function (dt) { const res = _ur.apply(this, arguments); if (WK.list.length) { try { wkStep(dt); } catch (e) { console.error(e); WK.list.length = 0; } } return res; };
  const _rs = rigStep;
  rigStep = function (r, dt) { _rs(r, dt); if (r._wkd) { try { wkDroop(r); } catch (e) { } } };
}

/* ---------------- B. 黑幕轉場前，球與野手繼續動 ---------------- */
const _co = {};
COAST.skipStart = function (pl) {      // 06 的 skipDeadBall 呼叫（在清掉 thr／state 之前）：記下球現在的狀態
  if (!COAST.on || window.__ff || _vsNow()) return;
  pl.coast = { st: pl.state, th: pl.thr, holder: pl.holder, loose: pl.loose, nb: pl.looseF };
};
COAST.skipStep = function (pl, dt) {      // 06 的 updatePlay：PL.skipped 之後每幀呼叫（球繼續走、持球野手繼續帶球）
  const c = pl && pl.coast; if (!c || !COAST.on) return;
  if (c.st === 'thrown' && c.th) {
    const th = c.th; th.delay -= dt;
    if (th.delay > 0) { setBall({ x: th.x0, y: 1.5, z: th.z0 }, true); return; }
    th.t += dt; const u = clamp(th.t / th.dur, 0, 1), x = lerp(th.x0, th.x1, u), z = lerp(th.z0, th.z1, u), dd = dist2(th.x0, th.z0, th.x1, th.z1);
    const y = (th.roll || th.hop) ? BALL_R + Math.sin(u * Math.PI) * Math.min(1, dd * .02) + (1 - u) * .6 : lerp(1.6, 1.1, u) + Math.sin(u * Math.PI) * Math.min(3, dd * .07);
    setBall({ x, y, z }, true, '#fff');
    if (u >= 1) { if (th.to) { c.st = 'held'; c.holder = th.to; } else { c.st = 'rest'; c.rx = th.x1; c.rz = th.z1; } }
  } else if (c.st === 'held' && c.holder) { const f = c.holder; setBall({ x: f.x, y: 1.25, z: f.z + .2 }, true); }
  else if (c.st === 'loose' && c.loose) {
    const L = c.loose; setBall({ x: L.x, y: BALL_R, z: L.z }, true);
    if (c.nb && dist2(c.nb.x, c.nb.z, L.x, L.z) < 1.0) { c.st = 'held'; c.holder = c.nb; try { c.nb.rig.anim = { name: 'pickup', t: 0, dur: .2, opt: {} }; } catch (e) { } }
  } else if (c.st === 'rest') setBall({ x: c.rx, y: BALL_R, z: c.rz }, true);
};
COAST.coInit = function (pl) {      // 挑撿球的野手：原本就在追的那位；野手原本判斷「撿太久不追了」的話，就由離球最近的人小跑步過去（畫面不要全員站著不動）
  if (pl.coF !== undefined) return;
  let f = (pl.fchase && pl.ff) ? pl.ff : null;
  if (!f) { try { const last = pl.sim.S[pl.sim.S.length - 1]; f = nearestFielderTo(last.x, last.z, null) || null; } catch (e) { f = null; } }
  pl.coF = f && !(f.pl && f.pl.out) ? f : null;
};
COAST.foulStep = function (pl, dt) {      // 界外球撿太久（slowFetch）：球照原軌跡繼續滾、追球野手繼續追到撿起來。PL 還在（dead）和 clearPlay 之後都用這個
  if (!COAST.on || window.__ff || _vsNow() || !pl || !pl.sim || pl.lostBall) return;
  const sim = pl.sim; if (pl.coT == null) pl.coT = pl.t || 0;
  pl.coT += dt; const tt = Math.min(pl.coT, sim.tEnd); sampleAt(sim.S, tt, _co);
  COAST.coInit(pl);
  const f = pl.coF;
  if (!pl.coHeld) setBall(_co, true);
  if (f && !pl.coHeld) {
    const aq = sampleAt(sim.S, Math.min(tt + .6, sim.tEnd), {});
    f.wait = 0; f.hold = 0; f.chaser = true; f.tx = lerp(_co.x, aq.x, .35); f.tz = lerp(_co.z, aq.z, .35); f.sp = Math.max(f.sp || 0, fspeed(f) * 1.25);
    if (dist2(f.x, f.z, _co.x, _co.z) < 1.3 && _co.y < 1.6) {
      pl.coHeld = true; f.chaser = false; f.tx = f.x; f.tz = f.z; f.hasBall = true; f.hold = .25;
      try { f.rig.anim = { name: 'pickup', t: 0, dur: .25, opt: {} }; flowSfx('mitt', .6); } catch (e) { }
    }
  }
  if (pl.coHeld && f) setBall({ x: f.x, y: 1.25, z: f.z + .2 }, true);
};
COAST.foulStart = function (pl, v) {      // 11 的 flowOnPlayEnd：clearPlay 之後呼叫（clearPlay 會把野手的 chaser／v 歸零，這裡接回去），之後由 updatePlay 外掛每幀 step
  if (!COAST.on || window.__ff || _vsNow() || !pl || !pl.sim || pl.lostBall) return;
  COAST.co = pl; COAST.coInit(pl); if (pl.coF && !pl.coHeld) { pl.coF.chaser = true; pl.coF.v = v || 0; }
};
{
  const _snap = snapToReady;
  snapToReady = function () { COAST.co = null; return _snap.apply(this, arguments); };      // 黑幕全黑、全員就定位：收掉
  const _up = updatePlay;
  updatePlay = function (dt) {
    if (COAST.co) {      // clearPlay 之後（PL 已空）繼續滾球／撿球
      if (PL || G.over || G.mode !== 'play' || (COAST.co.coT || 0) > 14) COAST.co = null; else { try { COAST.foulStep(COAST.co, dt); } catch (e) { COAST.co = null; console.error(e); } }
    }
    if (PL && PL.foul && PL.slowFetch && PL.state === 'dead' && !PL.skipped && !PL.lostBall) { try { COAST.foulStep(PL, dt); } catch (e) { console.error(e); } }      // slowFetch 到 endPlay 之間的 0.2～0.4 秒也不凍結
    return _up.apply(this, arguments);
  };
}
