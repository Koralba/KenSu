/* 21-abs-injury-subs.js — 特殊事件：ABS鷹眼／教練抗議／傷退換人／投手管理（原 script.js 第 4511-4755 行） */
'use strict';
/* =====================================================================
   Part 6c: 特殊事件 — ABS 鷹眼挑戰 / 觸身球衝突 / 傷退換人 / 沒投手沒收
   ===================================================================== */
const FIELD_CAT = { C: 'C', '1B': '1B', '2B': 'MI', SS: 'MI', '3B': '3B', LF: 'OF', CF: 'OF', RF: 'OF', DH: 'DH', P: 'P' };
function fitPenalty(nat, cur) { if (!nat || nat === cur) return 0; if (cur === 'DH') return 0; if (cur === 'C') return nat === 'C' ? 0 : .38; if (nat === 'C') return .12; const a = FIELD_CAT[nat], b = FIELD_CAT[cur]; if (a === b) return .04; if ((a === 'MI' && b === '3B') || (a === '3B' && b === 'MI')) return .07; if (a === 'DH') return .22; return .13; }
const EV = { abs: null, brawl: null, inj: null, hawk: null };
function evInit() {
  try { E.rage = null; clearMedic(); clearBlood(); if (E.argC) { scene.remove(E.argC.rig.root); E.argC = null; } } catch (e) { }
  G.abs = [3, 3]; G.coachOut = [false, false]; G.freeze = false; G.clk = 0; G.judgeTok = (G.judgeTok || 0) + 1; rpHide(); G.tilt = [0, 0]; G.day = (() => { const r = Math.random(); return r < .28 ? .6 + Math.random() * .25 : r < .76 ? .9 + Math.random() * .25 : 1.3 + Math.random() * .45; })(); G.umpSkill = .85 + Math.random() * .3; G.injQ = []; G.absStat = [{ ch: 0, ok: 0 }, { ch: 0, ok: 0 }];
  G.errPl = {}; G.visits = [3, 3]; G.hbpN = [0, 0]; G.brawlN = 0; G.forfeit = -1; G.lastLoc = null; G.log = []; G.coach = []; EV.abs = EV.brawl = EV.inj = EV.hawk = null;
  updateAbsHud();
}
const sideName = s => G.teams[s].short;
function updateAbsHud() {      // 兩隊剩餘挑戰次數：整合在右上角 ABS 挑戰面板內（●＝剩餘、淡色＝已用、逐＝教練被驅逐）
  const e = $('absCnt'); if (!e) return;
  const pip = t => G.coachOut[t] ? '<s class="ko">逐</s>' : '<b>' + '●'.repeat(Math.max(0, G.abs[t])) + '</b><u>' + '●'.repeat(Math.max(0, 3 - G.abs[t])) + '</u>';
  const chip = t => '<span class="ac' + (G.human === t ? ' me' : '') + '"><i>' + G.teams[t].short + '</i>' + pip(t) + '</span>';
  e.className = G.human >= 0 ? 'solo' : ''; e.innerHTML = G.absOn ? (G.human >= 0 ? chip(G.human) : chip(0) + chip(1)) : '';
}
/* ---------------- 主審判決（有誤判機率，越貼邊越容易誤判） ---------------- */
function umpireCall(pt) {
  const sdf = zoneSDF(pt.fx, pt.fy), truth = sdf <= 0;
  const Cp = E.F.C && E.F.C.pl, fr = (((Cp && Cp.fld) || 60) - 60) * .0016;      // 捕手接球技術（守備值）：邊角球更容易被判好球
  const blownP = clamp((.30 - Math.abs(sdf) * 1.2) * (G.umpSkill || 1) + (truth ? (-fr * .6) : (sdf < .14 ? fr : 0)), 0, .34);
  const blown = Math.random() < blownP;
  return { strike: blown ? !truth : truth, truth, sdf, blown, px: pt.fx, py: pt.fy };
}
function absEndMark(on, call) {       // 決勝球（三好球／第四壞球）：面板轉紅＋燈號閃爍，讓玩家一眼看出「已經三好球了」
  const p = $('absPanel'); if (p) { p.classList.toggle('abs-end', !!on); }
  const sel = on && call ? (call.strike ? '.lamp.s' : '.lamp.b') : null;
  document.querySelectorAll('.lamp.s,.lamp.b').forEach(e => e.classList.remove('pend'));
  if (sel) document.querySelectorAll(sel).forEach(e => { e.classList.add('on'); e.classList.add('pend'); });
  else if (typeof updateLamps === 'function') updateLamps();
}
function absFlow(pt, call, done) {
  const kindOf = st => st ? 'strikeLook' : 'ball';
  const wronged = call.strike ? G.half : 1 - G.half;               // 這個判決對誰不利
  const ending = call.strike ? G.strikes >= 2 : G.balls >= 3;
  const base = G.absOn && !pt.ibb && !G.over, hum = G.human;
  const busy = E.runners.some(r => r.state === 'run') || pt.wild;
  const humanCan = base && hum >= 0 && G.abs[hum] > 0 && !G.coachOut[hum];
  const aiCan = base && hum !== wronged && G.abs[wronged] > 0 && !G.coachOut[wronged] && !busy;      // 盜壘進行中不等 ABS，捕手要立刻傳球
  const finish = st => { G.phase = 'result'; done(kindOf(st)); };
  if (aiCan && aiWantsChallenge(wronged, call, ending)) { G.phase = 'abs'; say(`${sideName(wronged)}提出挑戰`); after(.3, () => runChallenge(wronged, call, finish)); return; }
  if (busy) { if (humanCan && wronged === hum && !ending && !pt.wild) G.absPend = { pt, call, team: hum, b0: G.balls, s0: G.strikes }; G.phase = 'result'; done(kindOf(call.strike)); return; }      // 跑者起跑／暴投：捕手立刻傳球，不等 ABS（非決勝球可事後挑戰）
  if (humanCan && wronged === hum && ending) {           // 決勝球／跑者起跑：立即決定
    G.phase = 'abs'; absEndMark(true, call);
    say(call.strike ? `主審判好球，<em>三振</em>。要挑戰嗎？<em>(C)</em>` : `主審判壞球，<em>保送</em>。要挑戰嗎？<em>(C)</em>`);
    EV.abs = { t: 3.6, max: 3.6, team: hum, onGo: () => runChallenge(hum, call, finish), onSkip: () => finish(call.strike) };
    $('absTitle').textContent = call.strike ? '🦅 三好球！' : '🦅 四壞球！'; $('absGo').textContent = 'ABS 挑戰 [C]'; $('absPanel').classList.remove('hide'); $('absRem').textContent = (call.strike ? '三振' : '保送') + `・剩${G.abs[hum]}`; $('absBarI').style.width = '100%'; return;
  }
  if (humanCan && !ending && !busy) { G.absPend = { pt, call, team: hum, b0: G.balls, s0: G.strikes }; done(kindOf(call.strike)); return; }   // 非決勝球：下一球投出前都能挑戰
  after(.05, () => finish(call.strike));
}
function absShowPend() {
  const d = G.absPend; if (!d || EV.abs) return;
  $('absTitle').textContent = '🦅 ABS'; $('absGo').textContent = 'ABS 挑戰 [C]'; $('absRem').textContent = `${d.call.strike ? '好球' : '壞球'}・剩${G.abs[d.team]}`; $('absBarI').style.width = '100%'; $('absPanel').classList.remove('hide');
}
function coachBack() { if (E.argC && E.argC.st !== 'out') argCoachOut(false); }
function absClearPend() { G.absPend = null; if (!EV.abs) $('absPanel').classList.add('hide'); }
function runPend() {
  const d = G.absPend; if (!d || G.phase !== 'pre' || G.over || EV.abs) return;
  G.absPend = null; $('absPanel').classList.add('hide'); G.phase = 'abs'; argCoachIn(d.team); G.absStat[d.team].ch++; flowSfx('whistle'); toast('ABS 挑戰！', '#aef', '#07c');
  showHawk(d.call, () => {
    if (d.call.strike !== d.call.truth) {
      G.absStat[d.team].ok++; updateAbsHud(); toast('改判！', '#9fffb0', '#0a8'); flowSfx('cheer', 1); G.log.push('ABS改判');
      say(`<em>改判！</em>${d.call.truth ? '好球' : '壞球'}，挑戰成功`);
      after(.75, () => { hideHawk(); coachBack(); G.balls = d.b0; G.strikes = d.s0; G.phase = 'result'; pitchResult(d.call.truth ? 'strikeLook' : 'ball'); });
    } else {
      G.abs[d.team]--; updateAbsHud(); toast('維持原判', '#ffe08a', '#c60'); flowSfx('out'); say(`維持原判，剩 ${G.abs[d.team]} 次`);
      after(.9, () => maybeProtest(d.team, d.call, st => { if (st !== d.call.strike) { G.balls = d.b0; G.strikes = d.s0; G.phase = 'result'; pitchResult(st ? 'strikeLook' : 'ball'); } else { G.phase = 'pre'; G.preT = 0; } }));
    }
  });
}
function absResolveInput(go) {
  if (!EV.abs) return; const a = EV.abs; EV.abs = null; absEndMark(false); $('absPanel').classList.add('hide'); $('absGo').textContent = 'ABS 挑戰'; $('absTitle').textContent = '🦅 ABS 挑戰'; go ? a.onGo() : a.onSkip();
}
function aiWantsChallenge(team, call, ending) {
  const L = lvl(); const noise = .13 / (1 + L.learn * .45);
  const seen = call.sdf + gauss() * noise;                           // 教練「看到」的位置也有誤差
  const believeWrong = call.strike ? seen > 0 : seen <= 0;
  const lev = 1 + (ending ? .55 : 0) + ((G.on[1] || G.on[2]) ? .2 : 0) + (lateGame() ? .2 : 0) + (G.balls === 3 && G.strikes === 2 ? .2 : 0);
  const budget = G.abs[team] <= 1 ? (ending ? .8 : .45) : 1;
  const base = believeWrong ? (.30 + clamp(Math.abs(seen) * 1.5, 0, .3)) : .025;
  return Math.random() < clamp(base * lev * budget * (L.learn > 0 ? 1 : .6), 0, .92);
}
function runChallenge(team, call, finish) {
  argCoachIn(team); G.absStat[team].ch++; flowSfx('whistle'); toast('ABS 挑戰！', '#aef', '#07c');
  showHawk(call, () => {
    const overturn = call.strike !== call.truth;
    if (overturn) {
      G.absStat[team].ok++; updateAbsHud();
      toast('改判！', '#9fffb0', '#0a8'); flowSfx('cheer', 1);
      say(`<em>ABS 鷹眼確認：原判誤判！</em>改判為${call.truth ? '好球' : '壞球'}，${sideName(team)}挑戰成功，次數保留！`);
      G.log.push('ABS改判');
      after(.75, () => { hideHawk(); coachBack(); finish(call.truth); });
    } else {
      G.abs[team]--; updateAbsHud(); toast('維持原判', '#ffe08a', '#c60'); flowSfx('out');
      say(`ABS 確認原判正確，維持${call.strike ? '好球' : '壞球'}。${sideName(team)}剩 ${G.abs[team]} 次挑戰`);
      after(.9, () => maybeProtest(team, call, finish));
    }
  });
}
/* ---------------- 鷹眼回放畫面 ---------------- */
function showHawk(call, cb) {
  const h = $('hawk'); h.classList.remove('hide');
  const W = 190, Hh = 230, sc = 78, cx = W / 2, zy = 108, zw = ZW * sc, zh = ZH * sc, br = ZPAD * sc;      // 球畫成「判定用的半徑」：球緣碰到黃框＝好球，畫面與判定一致
  const px = cx + call.px * sc, py = zy - (call.py - ZC) * sc;
  const cm = Math.abs(call.sdf) * ZCM, dx = Math.abs(call.px) - ZW, dy = Math.abs(call.py - ZC) - ZH;
  const dir = dx >= dy ? (call.px > 0 ? '右側' : '左側') : (call.py > ZC ? '上方' : '下方');
  const edge = call.truth ? (cm < .05 ? '球緣剛好壓在好球帶邊緣' : `球緣在好球帶內 <b>${cm.toFixed(1)} cm</b>`) : `球緣在好球帶外 <b>${cm.toFixed(1)} cm</b>（${dir}）`;
  const was = `主審原判：${call.strike ? '好球' : '壞球'}${call.strike !== call.truth ? ' → <b>誤判</b>' : '（正確）'}`;
  h.innerHTML = `<div class="hk-t">🦅 ABS 鷹眼回放</div><div class="hk-box" style="width:${W}px;height:${Hh}px"><div class="hk-z" style="left:${cx - zw}px;top:${zy - zh}px;width:${zw * 2}px;height:${zh * 2}px"></div>
    <div class="hk-g" style="left:${cx - zw}px;top:${zy - zh}px;width:${zw * 2}px;height:${zh * 2}px"></div>
    <div class="hk-b" id="hkB" style="width:${br * 2}px;height:${br * 2}px;left:${cx - br}px;top:-30px"></div><div class="hk-l" id="hkL" style="left:${clamp(px, 48, W - 48)}px;top:${py + br + 4}px;opacity:0">${call.truth ? '帶內 ' : '帶外 '}${cm.toFixed(1)} cm</div></div>
    <div class="hk-r" id="hkR"></div><div class="hk-d" id="hkD" style="opacity:0">${edge}<br>${was}</div>`;
  const b = $('hkB'); b.style.transition = 'left .9s cubic-bezier(.4,0,.6,1),top .9s cubic-bezier(.3,0,.7,1)';
  setTimeout(() => { b.style.left = (px - br) + 'px'; b.style.top = (py - br) + 'px'; }, 30);
  setTimeout(() => { $('hkL').style.opacity = 1; $('hkD').style.opacity = 1; const r = $('hkR'); r.textContent = call.truth ? '好球 STRIKE' : '壞球 BALL'; r.style.color = call.truth ? '#ffd21a' : '#6f6'; }, 1000);
  EV.hawk = after(1.6, cb);
}
function hideHawk() { $('hawk').classList.add('hide'); }
/* ---------------- 教練抗議（ABS 確認原判後） ---------------- */
function maybeProtest(team, call, finish) {
  const close = clamp(1 - Math.abs(call.sdf) * 3.2, 0, 1);
  const ai = G.human !== team;
  if (ai) {
    const p = clamp(.02 + close * .10 + (G.coachOut[1 - team] ? 0 : 0), 0, .2) * (lateGame() ? 1.3 : 1);
    if (Math.random() < p && G.evt > 0) { say(`${sideName(team)}總教練不服氣，衝出來向主審抗議！`); argCoachIn(team); after(.5, () => runProtest(team, call, finish, .25 + Math.random() * .6)); return; }
    hideHawk(); coachBack(); finish(call.strike); return;
  }
  hideHawk(); say(`維持原判。要抗議嗎？(<em>R</em>)`);
  EV.abs = { t: 4.5, max: 4.5, team, protest: true, onGo: () => startProtestMash(team, call, finish), onSkip: () => { coachBack(); finish(call.strike); } };
  const bt = $('absGo'); bt.textContent = '😡 抗議 [R]'; $('absTitle').textContent = '👨‍🏫 教練出面抗議？'; $('absRem').textContent = '抗議？'; $('absPanel').classList.remove('hide'); $('absBarI').style.width = '100%';
}
function startProtestMash(team, call, finish) {
  argCoachIn(team);
  EV.brawl = { kind: 'protest', mash: 0, t: 0, dur: 3, team, call, finish }; $('mashUi').classList.remove('hide'); $('mashTx').textContent = '連點 / 連按空白鍵 來向主審抗議！'; $('mashBar').style.width = '0%';
}
function argCoachIn(team) {
  if (E.argC) { if (E.argC.st !== 'out') return; scene.remove(E.argC.rig.root); E.argC = null; } const st = teamStyle(team), rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt }); scene.add(rig.root);
  const sx = team === 1 ? 24 : -24, d = team === 1 ? 1 : -1; rig.root.position.set(sx, 0, -6); rig.run = 1.6;
  E.argC = { rig, x: sx, z: -6, tx: d * 1.9, tz: 1.5, st: 'in', t: 0, sx, team }; flowSfx('whistle', .6);
}
function argCoachOut(ej) { const c = E.argC; if (!c) return; c.st = 'out'; c.t = 0; c.tx = c.sx; c.tz = -6; c.sp = ej ? 4.2 : 6.2; c.rig.anim = null; if (ej) c.rig.anim = { name: 'point', t: 0, dur: 1e9, opt: {} }; }
function updateArgCoach(dt) {
  const c = E.argC; if (!c) return; c.t += dt; const r = c.rig;
  const go = (tx, tz, sp) => { const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz); if (d > .15) { const k = Math.min(d, sp * dt); c.x += dx / d * k; c.z += dz / d * k; faceRig(r, tx, tz); r.run = 1.5; r.root.position.x = c.x; r.root.position.z = c.z; return false; } r.run = 0; return true; };
  if (c.st === 'in') { if (go(c.tx, c.tz, 6.4)) { c.st = 'argue'; c.t = 0; faceRig(r, 0, 3); r.anim = { name: 'cheer', t: 0, dur: 1e9, opt: {} }; flowSfx('cheer', .8); crowdCheer(1); } }
  else if (c.st === 'argue') { if (c.t > 1.3 && c.cb) { const f = c.cb; c.cb = null; f(); } }
  else if (c.st === 'out') { if (go(c.tx, c.tz, c.sp || 6)) { scene.remove(r.root); E.argC = null; } }
}
function runProtest(team, call, finish, power) {
  const c = E.argC; if (c && c.st === 'in') { c.cb = () => runProtest0(team, call, finish, power); return; } runProtest0(team, call, finish, power);
}
function runProtest0(team, call, finish, power) {
  const close = clamp(1 - Math.abs(call.sdf) * 3.2, 0, 1);
  const ejP = clamp(.004 + Math.pow(power, 3.4) * .26 * (1 - close * .5), 0, .3), ovP = clamp((.10 + power * .38) * (.6 + close * .4), 0, .5);      // 驅逐：只有「吵到快滿檔」才有明顯風險（上限 30%）；改判機率拉高      // 抗議越激烈：改判機率上升；但過火（power 接近滿檔）驅逐機率會陡升
  const r = Math.random();
  if (r < ejP) {
    G.coachOut[team] = true; argCoachOut(true); updateAbsHud(); ejectScene({ role: '總教練', name: sideName(team), why: power > .8 ? '抗議過於激烈' : '抗議無效且失控' });
    say(`<em>${sideName(team)}總教練${power > .8 ? '抗議太過激烈，' : ''}被主審驅逐出場！</em>本場比賽不能再使用 ABS 挑戰了！`); G.log.push('教練驅逐');
    after(1.6, () => { hideHawk(); finish(call.strike); });
  } else if (r < ejP + ovP) {
    argCoachOut(false); toast('抗議成功！改判！', '#9fffb0', '#0a8'); flowSfx('cheer', 1.2); crowdCheer(1); say(power > .5 ? '<em>主審被這番激烈的抗議說服了…</em>居然改判了！' : '主審被說服了…居然改判了！'); G.log.push('抗議改判'); after(1.2, () => { hideHawk(); finish(!call.strike); });
  } else { argCoachOut(false); toast('維持原判', '#ffe08a', '#c60'); say('主審不為所動，維持原判。'); after(1.0, () => { hideHawk(); finish(call.strike); }); }
}
/* ---------------- 球員替換 / 傷退 ---------------- */
function pickSub(side, pos, forRunner) {
  const t = G.teams[side]; const c = t.bench.filter(b => !b.out); if (!c.length) return null;
  const sc = b => { const pen = fitPenalty(b.nat, pos); return (b.con * .45 + b.pow * .25 + b.spd * (forRunner ? .6 : .1) + b.eye * .1) * (1 - pen * 1.3); };
  c.sort((a, b) => sc(b) - sc(a)); return c[0];
}
function subInto(side, old, sub, why) {
  const t = G.teams[side], i = t.lineup.indexOf(old); if (i < 0) return null;
  if (!sub) {                                                       // 板凳空了：臨時找人頂
    sub = genBatter(.7, old.pos, 99, old.slot || 5); sub.name = '臨時替補'; sub.nat = old.pos; sub.con = 52; sub.pow = 40; sub.spd = 55; sub.eye = 50; sub.fld = 50; sub.arm = 55; sub.out = false;
  } else t.bench.splice(t.bench.indexOf(sub), 1);
  setPos(sub, old.pos);
  old.out = true; (t.retired || (t.retired = [])).push(old); t.lineup[i] = sub; sub.slot = old.slot;
  if (side === 1 - G.half && old.pos !== 'DH' && E.F[old.pos]) swapFielderRig(old.pos, sub);
  return sub;
}
function swapFielderRig(pos, pl) {
  const f = E.F[pos]; if (!f) return; const st = teamStyle(1 - G.half); disposeRig(f.rig);
  const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, glove: true, pl, catcher: pos === 'C' }); scene.add(rig.root); rig.root.position.set(f.x, 0, f.z); f.rig = rig; f.pl = pl; rig.ready = pos !== 'C'; faceRig(rig, 0, 0);
  if (pos === 'C') { rig.anim = { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } }; ghostRig(rig, .28); }
}
const FIELD_INJ = ['奮力飛撲接球，手腕著地扭傷', '追球衝撞外野全壘打牆，肩膀受傷', '急停轉身瞬間腳踝扭到', '接球瞬間手指遭球直接撞擊挫傷', '與隊友相撞，膝蓋疼痛站不起來'];
function maybeInjureFielder(f) {
  if (!G.evt || !f || f.pos === 'P' || f.pl.out || !PL) return;
  const wall = (PL.sim && PL.sim.wallHit && Math.hypot(f.x, f.z) > 55) || (PL.plan && PL.plan.robHR);
  const dv = PL.plan && PL.plan.dive, dd = DEFAULT_POS[f.pos], far = dd && dist2(f.x, f.z, dd.x, dd.z) > 26;
  if (!dv && !wall && !far) return;
  const base = wall ? (PL.plan && PL.plan.robHR ? .075 : .045) : dv ? .03 : .0028;
  const p = base * (1 + (80 - (f.pl.fld || 60)) * .01) * durMul(f.pl) * (G.evt === 2 ? 1.9 : 1) * stormMul();
  if (Math.random() < p) {
    f.pl.out = true; G.injQ.push({ type: 'field', side: 1 - G.half, pl: f.pl, pos: f.pos, why: pick(far && !dv && !wall ? ['長距離追球急停，腳踝扭傷', '全力衝刺時大腿後側拉傷'] : FIELD_INJ) });
    f.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${f.pl.name}倒地了！</em>看起來是${pick(['手','腳','肩膀'])}受傷，趴著沒有起來…`); crowdCheer(0); flowSfx('whistle');
  }
}
function maybeInjurePitcher(p) {
  if (!G.evt || p.out) return; const side = 1 - G.half;
  const pr = (.00026 + Math.max(0, p.fatigue - 50) * .00007 + Math.max(0, p.pc - 95) * .0001) * durMul(p) * (G.evt === 2 ? 2.2 : 1) * stormMul();
  if (Math.random() < pr) { p.out = true; G.injQ.push({ type: 'pitch', side, pl: p, why: pick(['手肘突然傳來劇痛，抱著手臂蹲下', '投球瞬間肩膀拉傷，臉色發白', '大腿後側拉傷，一跛一跛']) }); }
}
function processInjuries(next) {
  if (G.over || G.forfeit >= 0) return;
  const e = G.injQ.shift(); if (!e) { next(); return; }
  const ttl = { pitch: '投手受傷退場！', run: '跑者受傷退場！', bat: '打者受傷退場！' }[e.type] || '野手受傷退場！';
  injCutscene(ttl, `${sideName(e.side)}　${e.pl.name}　${e.why}，需要換人！`, 2.8, () => {
    if (e.type === 'pitch') { if (G.teams[e.side].pitchers[G.teams[e.side].cur] === e.pl) removePitcher(e.side, 'injury'); }
    else if (e.type === 'run' || e.type === 'bat') { const sub = pickSub(e.side, e.pl.pos, e.type === 'run'), s2 = subInto(e.side, e.pl, sub); if (s2) { if (e.r) { e.r.pl = s2; e.r.spd = (5.6 + s2.spd * .036) * MOVEK; e.r.rig.limp = 0; e.r.rig.anim = null; } say(`${sideName(e.side)}換人：${s2.name} ${e.type === 'run' ? '代跑' : '上場'}`); } }
    else { const sub = pickSub(e.side, e.pos), s2 = subInto(e.side, e.pl, sub); if (s2) { say(`${sideName(e.side)}換人：${e.pos} ${s2.name} 上場補位`); } }
    updatePlayerBoxes(); if (!G.over) after(.6, () => processInjuries(next));
  });
}
function injCutscene(title, detail, sec, cb) {
  const o = $('injOv'); $('injT').textContent = title; $('injD').textContent = detail; o.classList.remove('hide'); flowSfx('whistle'); toast('傷退', '#fff', '#e44');
  say(`<em>${title}</em> ${detail}`);
  after(sec, () => { o.classList.add('hide'); cb(); });
}
/* ---------------- 投手管理（被驅逐/受傷的投手不可再上；沒人可用 → 沒收比賽） ---------------- */
function availPitchers(side) { const t = G.teams[side]; return t.pitchers.map((p, i) => ({ p, i })).filter(o => !o.p.out && !o.p.used && o.i !== t.cur); }
function chooseReliever(side, nextBatter) {
  const c = availPitchers(side); if (!c.length) return -1;
  const diff = G.score[side] - G.score[1 - side], late = G.inning >= G.innings - 1;
  const sc = o => { const p = o.p; let s = p.ctl * .35 + p.kmh * .4 + p.pitches.length * 2 + (100 - p.fatigue) * .1;
    if (p.role === 'SP') s -= 28; if (p.role === 'CL') s += (late && diff > 0 && diff <= 3) ? 40 : -26;
    if (nextBatter && p.hand !== nextBatter.hand && nextBatter.hand !== 'S') s += 5 * (nextBatter.hand === 'L' && p.hand === 'L' ? 2 : 1); return s + Math.random() * 3; };
  c.sort((a, b) => sc(b) - sc(a)); return c[0].i;
}
function removePitcher(side, why) {
  const t = G.teams[side]; const p = t.pitchers[t.cur]; p.out = true; p.used = true;
  const ni = chooseReliever(side, side === 1 - G.half ? curBatter() : null);
  if (ni < 0) { doForfeit(side, why, p); return false; }
  changePitcher(side, ni, true); say(`${sideName(side)}由 <em>${t.pitchers[ni].name}</em> 緊急接替登板`); return true;
}
function doForfeit(side, why, p) {
  if (G.over || G.forfeit >= 0) return; G.forfeit = side; G.phase = 'forfeit'; PT = null; clearPlay(); tweens.length = 0; setBall({ x: 0, y: 0, z: 0 }, false);
  const wh = why === 'eject' ? '被驅逐出場' : why === 'injury' ? '受傷退場' : '無法再投球';
  say(`<em>${sideName(side)}已經沒有任何投手可以上場！</em>最後一位投手 ${p.name} ${wh}，依規則判定沒收比賽！`);
  toast('沒投手了！沒收比賽', '#fff', '#e22'); flowSfx('whistle'); flashScreen(.4); EV.abs = null; absEndMark(false); $('absPanel').classList.add('hide'); hideHawk();
  after(3.6, () => endGame());
}
