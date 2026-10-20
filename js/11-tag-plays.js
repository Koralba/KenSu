/* 11-tag-plays.js — 野手持球觸殺跑者（原 script.js 第 2338-2497 行） */
'use strict';
/* ---------------- 野手持球直接用身體觸殺跑者 ---------------- */
function runnerTaggable(r) {
  if (!r || r.state !== 'run' || r.sliding || r.ruledSafe) return false;
  if (r.bat && r.from === 0) return r.pre <= 0 && r.s < .985;
  if (r.pre > 0) return false;
  return r.dir > 0 ? (r.s > .03 && r.s < .985) : (r.s > .015 && r.s < .985);
}
function runnerFuture(r, t) { const s1 = clamp(r.s + r.dir * r.spd * t / BASE_LEN, 0, 1), a = baseSpot(r.from), b = baseSpot(r.to); return { x: lerp(a.x, b.x, s1), z: lerp(a.z, b.z, s1) }; }
function bestTagChase(f, loose) {          // 持球者能否在跑者到壘前追上並觸殺？回傳最有把握的那位
  if (!PL || !f) return null; const sp = fspeed(f) * 1.05, lag = (f.hold > 0 ? f.hold : 0) + .12; let best = null, near = null;
  for (const r of E.runners) {
    if (!runnerTaggable(r)) continue; runnerXZ(r, _rp);
    const dNow = dist2(f.x, f.z, _rp.x, _rp.z), tArr = (r.dir > 0 ? 1 - r.s : r.s) * BASE_LEN / r.spd;
    if (!near || dNow < near.dist) near = { r, tI: tArr, margin: 0, dist: dNow };
    if (tArr < .25) continue;
    for (let t = .12; t <= tArr - .08; t += .08) { const q = runnerFuture(r, t); if (dist2(f.x, f.z, q.x, q.z) / sp + lag <= t) { const m = tArr - t; if (!best || m > best.margin) best = { r, tI: t, margin: m, dist: dNow }; break; } }
  }
  return best || (loose ? near : null);
}
function rundownTarget(f) {      // 夾殺：離壘的跑者（含「推進」又被球堵到的）既沒比球早回原壘、也沒比球早到下一壘，且就在持球者附近 → 回傳最近的那位
  if (!PL || PL.done || G.outs >= 3 || PL.tagChase || PL.state !== 'held' || PL.holder !== f) return null;
  let pick = null;
  for (const r of E.runners) {
    if (!runnerTaggable(r) || r.from < 1 || r.isForce || r.bat && r.from < 1) continue;
    runnerXZ(r, _rp); const d = dist2(f.x, f.z, _rp.x, _rp.z); if (d > 15) continue;
    const aF = baseSpot(r.from), aT = baseSpot(r.to), ar = armSpeed(f.pl);
    const tBallBack = .3 + dist2(f.x, f.z, aF.x, aF.z) / ar, tBallFwd = .3 + dist2(f.x, f.z, aT.x, aT.z) / ar;
    const tBack = (r.dir < 0 ? r.s : r.s + .0) * BASE_LEN / r.spd, tFwd = (1 - r.s) * BASE_LEN / r.spd;
    const safeBack = tBack < tBallBack - .12, safeFwd = tFwd < tBallFwd - .12;      // 任何一個方向能比球早到壘＝安全，不用夾殺
    if (safeBack || safeFwd) continue;
    if (!pick || d < pick.d) pick = { r, d };
  }
  return pick ? pick.r : null;
}
function rundownToss(f, pin) {      // 夾殺時，追人的野手把球短傳給從另一端逼近的隊友
  const pl = PL; if (!pl || pl.state !== 'held' || pl.holder !== f) return;
  endTagChase(false); pl.rdPass = (pl.rdPass || 0) + 1; pin.tx = pin.x; pin.tz = pin.z; pin.hold = 0; pin.wait = 0;
  const dd = dist2(f.x, f.z, pin.x, pin.z); pl.state = 'thrown'; f.hasBall = false; f.rig.anim = { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } }; faceRig(f.rig, pin.x, pin.z);
  pl.thr = { from: f, to: pin, b: -1, t: 0, dur: dd / (armSpeed(f.pl) * .9) + .04, x0: f.x, z0: f.z, x1: pin.x, z1: pin.z, wild: false, relay: false, ret: true, delay: .02, info: null, rd: true };
  pl.holder = null; pl.retCb = () => { pl.retCb = null; if (PL === pl && pl.state === 'held' && pl.holder === pin && G.outs < 3) holderThink(pin); };
  say(`${POS_FULL[f.pos]}${f.pl.name}把球傳給${POS_FULL[pin.pos]}${pin.pl.name}，繼續夾殺！`, 1800);
}
function aiPrefersTag(f, best, tg) {       // 電腦自行判斷：直接追人觸殺，還是傳球給壘包上的守備員
  const N = lvl().noise, thr = best.margin;
  if (best.tb === 4 && best.r !== tg.r && best.margin > -.4) return false;
  if (best.r === tg.r && thr > .35 && tg.dist > 3.5) return false;
  const score = tg.margin + (tg.dist < 6 ? (6 - tg.dist) * .04 : 0) + gauss() * .07 * N;
  return score > .1 && (thr < .25 || tg.dist < 5.5 || tg.margin > thr);
}
function startTagChase(f, r) {
  PL.tagChase = { f, r, t: 0 }; f.hold = 0; f.wait = 0; f.sp = fspeed(f) * 1.08; f.chaser = false; f.hasBall = true; f.selfTag = null; PL.selfTag = null;
  say(`${POS_FULL[f.pos]}${f.pl.name}拿著球直接追向 <em>${r.pl.name}</em>，要用身體觸殺！`);
}
function endTagChase(think) {
  const tc = PL && PL.tagChase; if (!tc) return; PL.tagChase = null; const f = tc.f; f.tx = f.x; f.tz = f.z;
  if (think) after(.12, () => { if (PL && PL.state === 'held' && PL.holder === f && G.outs < 3) holderThink(f); });
}
function updateTagChase(dt) {
  const tc = PL.tagChase; if (!tc) return; const f = tc.f; let r = tc.r; tc.t += dt;
  if (PL.holder !== f || !runnerTaggable(r) || G.outs >= 3 || tc.t > (tc.rd ? 12 : 7)) { endTagChase(true); return; }
  runnerXZ(r, _rp); let d = dist2(f.x, f.z, _rp.x, _rp.z);
  if (tc.rd) {      // 夾殺：隨時改追「離持球者最近」的跑者
    tc.rt = (tc.rt || 0) - dt;
    if (tc.rt <= 0) { tc.rt = .2; for (const o of E.runners) { if (o === r || !runnerTaggable(o) || o.from < 1 || o.isForce) continue; const p = runnerXZ(o, { x: 0, z: 0 }), dd = dist2(f.x, f.z, p.x, p.z); if (dd < d - 1.2) { tc.r = r = o; d = dd; runnerXZ(r, _rp); } } }
  }
  const tl = clamp(d / (fspeed(f) * 1.08), 0, 1.2), q = runnerFuture(r, tl * .9);
  f.tx = q.x; f.tz = q.z; f.sp = fspeed(f) * 1.08; f.hold = 0; f.wait = 0;
  if (tc.rd) {      // 另一端的補位野手往跑者逼近，形成夾擊；距離拉開時由他接球
    const a = baseSpot(r.from), b2 = baseSpot(r.to), far = dist2(f.x, f.z, a.x, a.z) > dist2(f.x, f.z, b2.x, b2.z) ? r.from : r.to, sp = baseSpot(far);
    if (!tc.pin || tc.pinBase !== far || tc.pin === f) { let pin = (PL.cover && PL.cover[far % 4]) || nearestCover(sp.x, sp.z, f); if (pin === f) pin = nearestCover(sp.x, sp.z, f); tc.pin = pin; tc.pinBase = far; }
    const pin = tc.pin;
    if (pin && pin !== f) {
      pin.tx = lerp(sp.x, _rp.x, .4); pin.tz = lerp(sp.z, _rp.z, .4); pin.sp = fspeed(pin) * 1.05; pin.hold = 0; pin.wait = 0; pin.chaser = false;
      tc.pt -= dt; const dP = dist2(pin.x, pin.z, _rp.x, _rp.z);
      if (tc.pt <= 0 && (PL.rdPass || 0) < 5 && d > 4.6 && dP < d - 2.2 && dist2(f.x, f.z, pin.x, pin.z) < 22) rundownToss(f, pin);
    }
  }
}
function tagCheck() {                      // 持球野手身體碰到跑者（跑者不在壘包上）＝觸殺出局
  const f = PL.holder; if (!f || PL.pick || PL.foul || G.outs >= 3) return;
  for (const r of E.runners) {
    if (!runnerTaggable(r)) continue; runnerXZ(r, _rp);
    if (dist2(f.x, f.z, _rp.x, _rp.z) < .85) {
      if (!r.bat) r.isForce = false; tagAnim(f); putOut(r, 'tag');
      say(`${POS_FULL[f.pos]}${f.pl.name}直接用手套觸殺！<em>${r.pl.name}</em>出局！`); toast('觸殺！', '#fff', '#e22');
      if (PL.tagChase && PL.tagChase.r === r) endTagChase(true); break;
    }
  }
}
function nearestCover(x, z, except) {      // 補位人選：排除正在追球的野手
  let b = null, bd = 1e9; for (const f of Object.values(E.F)) { if (f === except || f.chaser || (PL && PL.looseF === f)) continue; const d = dist2(f.x, f.z, x, z); if (d < bd) { bd = d; b = f; } }
  return b || nearestFielderTo(x, z, except);
}
function nearestFielderTo(x, z, except) { let b = null, bd = 1e9; for (const f of Object.values(E.F)) { if (f === except) continue; const d = dist2(f.x, f.z, x, z); if (d < bd) { bd = d; b = f; } } return b; }
function throwTo(f, recv, b, info, forceRelay) {
  const spot = b >= 0 ? baseSpot(b) : { x: recv.x, z: recv.z }, d = dist2(f.x, f.z, spot.x, spot.z);
  let to = recv, relay = !!forceRelay;
  if (!relay && d > 50 && PL.cover && PL.cover.relay && b !== 0 && PL.cover.relay !== f && !PL.directThrow) { to = PL.cover.relay; relay = true; }
  const target = relay ? { x: to.x, z: to.z } : spot;
  // 遠距離傳球：外野手（或超遠距離）通常要落地彈跳一次才到接球者手上；肩力強的野手在合理距離內有機會像雷射一樣直接傳到位
  const tdist = dist2(f.x, f.z, target.x, target.z), arm0 = f.pl.arm || 60, isOF0 = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF', hopD = isOF0 ? 30 : 50;
  let hop = false, laser = false, roll = false;
  if (tdist > hopD && f.pos !== 'C' && f.pos !== 'P') {
    const laserMax = hopD + clamp((arm0 - 62) * 1.0, 0, 38);
    const pL = laserMax > hopD && tdist <= laserMax ? clamp((arm0 - 62) / 34, 0, 1) * clamp(1 - (tdist - hopD) / (laserMax - hopD), .15, 1) * .4 : 0;      // 雷射肩要夠強、距離不能太遠，而且機率不高
    if (Math.random() < pL) laser = true;
    else {
      hop = true;      // 遠距離回傳：多半要彈地才到；太遠或肩力弱的野手會彈兩下、再貼地滾一小段才到接球者手上
      const rollP = clamp((tdist - hopD - 10) / 40, 0, .85) * (1 + clamp((70 - arm0) / 60, -.3, .5));
      if (Math.random() < rollP) { roll = true; hop = false; }
    }
  }
  const wm = laser ? .5 : roll ? .95 : hop ? .8 : 1;
  const dpTry = !!PL && PL.outsMade === 1 && b === 1 && (f.pos === '2B' || f.pos === 'SS' || f.pos === '3B'), rushK = (dpTry ? 1.55 : 1) * (PL.plan && PL.plan.dive && PL.plan.f === f && !PL.plan.robHR && PL.outsMade === 0 ? 1.6 : 1);      // 轉傳雙殺很倉促、撲接後來不及站穩就傳：暴傳機率提高
  const wild = clamp(0.018 * (1 + (70 - (f.pl.arm || 60)) / 60) * (d > 45 ? 1.5 : 1) + (f.pl.fld < 50 ? .01 : 0), .007, .08) * (1 + rainK() * 1.6) * moodVol(f.pl) * wm * rushK * chaosK(1 - G.half) > Math.random() && !PL.cleanThrow;      // 傳歪機率：傳球者肩力／守備、當下心情與低潮、當天運氣與場面氣氛(chaosK)、雨天暴雨，不是人人固定加成
  PL.state = 'thrown'; f.hasBall = false; f.rig.anim = { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } }; faceRig(f.rig, target.x, target.z);
  const dur = (dist2(f.x, f.z, target.x, target.z) / armSpeed(f.pl) + .05) * (laser ? .94 : roll ? 1.45 + clamp((tdist - hopD) / 60, 0, .3) : hop ? 1.12 + clamp((tdist - hopD) / 45, 0, .28) : 1);      // 彈地／滾地的球比較慢，跑者多出更多時間
  if (roll && tdist > 45) say(`<em>${POS_FULL[f.pos]}${f.pl.name}距離太遠，球彈了兩下才滾向壘包…</em>`, 2500);
  if (laser && tdist > 40) { toast('雷射肩！', '#fff', '#0a9'); say(`<em>${POS_FULL[f.pos]}${f.pl.name}的雷射肩！</em>一傳到位！`, 2500); }
  PL.thr = { dp: dpTry, rushed: rushK > 1.5 && !dpTry, hop, roll, laser, wkind: (() => { const q = Math.random(); return q < .4 ? 'wide' : q < .75 ? 'over' : 'short'; })(), from: f, to, b, t: 0, dur, x0: f.x, z0: f.z, x1: target.x, z1: target.z, wild, relay, delay: f.pos === 'C' ? clamp(.2 - (f.pl.arm || 60) * .0016 - (f.pl.fld || 60) * .0006 - (G.stealWatch || 0) * .05 - (G.stealAlert ? .03 : 0) - (G.lastPitchout ? .07 : 0), .03, .14) : .06, info };
  if (!relay && to !== f) { const dR = dist2(to.x, to.z, spot.x, spot.z); if (dR > 1.8) { to.tx = spot.x; to.tz = spot.z; to.sp = fspeed(to) * 1.1; PL.thr.delay += clamp(dR / (fspeed(to) * 1.1) + .1 - dur, 0, 1.4); } }   // 壘上沒人：先等補位的野手跑到壘包再傳
  PL.holder = null; flowOnThrow(PL.thr);
}
function onThrowArrive(th) {
  const to = th.to, f = to;
  if (th.wild) { // errant throw : rolls loose
    PL.err = true; G.errs[1 - G.half]++;
    { const ux0 = th.x1 - th.x0, uz0 = th.z1 - th.z0, ul = Math.hypot(ux0, uz0) || 1, ux = ux0 / ul, uz = uz0 / ul, sd = Math.random() < .5 ? -1 : 1;      // 傳歪：傳偏一旁／傳過頭／彈在壘前，球滾到壘包附近的別處，守備員還要跑去撿
      let lx, lz; const k = th.wkind || 'wide';
      if (k === 'over') { const o = 5 + Math.random() * 8; lx = th.x1 + ux * o + -uz * sd * Math.random() * 3; lz = th.z1 + uz * o + ux * sd * Math.random() * 3; }
      else if (k === 'short') { const o = 1.5 + Math.random() * 3; lx = th.x1 - ux * o + -uz * sd * Math.random() * 2.5; lz = th.z1 - uz * o + ux * sd * Math.random() * 2.5; }
      else { const o = 3 + Math.random() * 6; lx = th.x1 + -uz * sd * o + ux * Math.random() * 2; lz = th.z1 + ux * sd * o + uz * Math.random() * 2; }
      const rad = Math.hypot(lx, lz), wr = wallRadius(Math.atan2(lx, -lz) * 180 / Math.PI) - 1.5; if (rad > wr) { lx *= wr / rad; lz *= wr / rad; }
      th._lx = lx; th._lz = lz; if (!th.dp && !th.rushed) say(`<em>${POS_FULL[th.from.pos]}${th.from.pl.name}傳球${k === 'over' ? '傳過頭了' : k === 'short' ? '傳得太低、彈在壘前' : '傳偏了'}！</em>球滾向一旁，守備員得再去撿。`); }
    PL.loose = { x: th._lx, z: th._lz, t: 0 }; PL.state = 'loose'; flowOnError(th.from, 'throw');
    if (th.dp) say(`<em>想轉成雙殺，但${POS_FULL[th.from.pos]}${th.from.pl.name}的轉傳偏離目標！</em>雙殺泡湯了！`); else if (th.rushed) say(`<em>${POS_FULL[th.from.pos]}${th.from.pl.name}撲接後來不及站穩，倉促傳球偏掉了！</em>`);
    const nb = nearestFielderTo(PL.loose.x, PL.loose.z, null); PL.looseF = nb; nb.tx = PL.loose.x; nb.tz = PL.loose.z; nb.sp = fspeed(nb) * 1.05; PL.thr = null; return;
  }
  if (!th.relay && !th.ret && dist2(to.x, to.z, th.x1, th.z1) > 2.6) {      // 接球的人不在壘包上＝空壘，球落地滾動，沒有任何人出局
    PL.thr = null; PL.loose = { x: th.x1, z: th.z1, t: 0 }; PL.state = 'loose'; const nb = nearestFielderTo(th.x1, th.z1, null); PL.looseF = nb; nb.tx = th.x1; nb.tz = th.z1; nb.sp = fspeed(nb) * 1.05; say('壘包上沒有人補位，球傳進空壘！'); return;
  }
  if (!th.relay && !th.ret && !PL.cleanThrow && E.runners.some(r => r.state === 'run')) {      // 接傳球偶爾會漏接／掉球（守備差、雨天、彈地球更容易）
    const rc = (f.pl.cat == null ? (f.pl.fld || 55) : f.pl.cat) * .6 + (f.pl.fld || 55) * .4;
    if (Math.random() < clamp((.009 + (65 - rc) * .0004 + rainK() * .03 + (th.hop ? .012 : 0) + (th.roll ? .012 : 0)) * chaosK(1 - G.half), .006, .08) * moodVol(f.pl) * (th.laser ? 1.3 : 1) * (th.dp ? 1.5 : 1)) { PL.thr = null; dropBall(f, false); if (!th.dp) say(`<em>${POS_FULL[f.pos]}${f.pl.name}沒接好，球掉到身旁！</em>`); if (th.dp) say(`<em>${POS_FULL[f.pos]}${f.pl.name}接傳球時掉了球！</em>雙殺落空！`); return; }
  }
  PL.thr = null; PL.state = 'held'; PL.holder = f; f.hasBall = true; f.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} };
  if (th.ret) { flowSfx('mitt', .7); after(.2, () => { if (PL && PL.retCb) PL.retCb(); }); return; }
  if (!th.relay) {
    // tag check at base th.b
    const b4 = th.b === 0 ? 4 : th.b;
    for (const r of E.runners.slice()) {
      if (r.state !== 'run' || r.ruledSafe) continue;
      if (r.dir > 0 && r.to === b4) { if (r.s < (r.sliding ? 1 - (r.slideReach || 0) - .004 : .985)) { tagAnim(f); tagCall(f, r, th.b === 0 ? 'tag' : (r.isForce ? 'force' : 'tag')); } }
      else if (r.dir < 0 && r.from === b4 % 4) { tagAnim(f); tagCall(f, r, 'tag'); }
    }
    safeCheck(f, b4);
    f.waitT = .0;
  }
  after(.05, () => { if (PL && !PL.done && PL.state === 'held' && PL.holder === f) { if (G.outs >= 3) return; holderThink(f); } });
}
