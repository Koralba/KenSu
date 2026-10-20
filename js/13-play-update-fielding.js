/* 13-play-update-fielding.js — 接殺／逐幀守備更新／玩家傳球（原 script.js 第 2683-3174 行） */
'use strict';
/* ---------------- fielded ---------------- */
function onFielded(f) {
  const plan = PL.plan;
  if (plan.robHR && !PL.cleanField && Math.random() < robDropP(f, plan)) { dropBall(f, false, true); return; }      // 跳起來攔下全壘打，卻在落地／撞牆時沒抓穩
  if (!PL.foul && !PL.cleanField && !plan.robHR && plan.kind !== 'hr') { if (PL.collide || (plan.air && Math.random() < airDropP(f, plan))) { dropBall(f, !!PL.collide); return; } }      // 相撞或漏接：球沒接住
  PL.state = 'held'; PL.holder = f; f.hasBall = true; f.chaser = false; f.sp = 4;
  const ground = !plan.air; f.tx = f.x; f.tz = f.z;
  f.rig.anim = ground && !plan.dive ? { name: 'pickup', t: 0, dur: .3, opt: { hold: false } } : { name: plan.dive ? 'dive' : 'catch', t: 0, dur: plan.dive ? .6 : .35, opt: { hold: false } };
  if (ground) { const pk = PL.bunt && !plan.dive ? clamp(.22 - ((f.pl.fld || 55) - 55) * .0015, .13, .28) : .16; startPick(plan.dive ? .3 : pk); f.hold = plan.dive ? .3 : pk; } else f.hold = .08;
  const p = PL.sim.S[Math.min(PL.sim.S.length - 1, Math.floor(plan.t * 60))];
  if (plan.great) greatPlay(f, plan);
  if (plan.air && plan.kind !== 'hr') {
    flowSfx('mitt');
    if (PL.foul) { PL.foulOut = true; G.outs++; PL.outsMade++; PL.caught = true; curPitcher().outs++; flowOnCatch(f, PL); if (G.outs >= 3) { after(.9, () => endPlay()); return; } recallRunners(); after(.12, () => holderThink(f)); after(.9, () => { if (!E.runners.some(r => r.state === 'run')) endPlay(); }); return; }
    PL.caught = true; if (PL.br) { putOut(PL.br, 'fly'); }
    flowOnCatch(f, PL);
    if (G.outs >= 3) { after(1.0, () => endPlay()); return; }
    // tag ups
    for (const r of E.runners.filter(r => r.state === 'on' && r.from >= 1).sort((a, b) => b.from - a.from)) tagUpThink(r, f);
    after(.12, () => holderThink(f));
    return;
  }
  // fielded on the ground / one-hop
  flowSfx('mitt');
  const fe = clamp(0.030 - ((f.pl.fld || 55) * .6 + (f.pl.cat == null ? (f.pl.fld || 55) : f.pl.cat) * .4) * .00027, .006, .03) * (PL.kind === 'gb' ? 1.15 : 1) * (plan.dive ? 1.3 : 1) * (1 + clamp(-(PL.luck || 0) * .25, -.4, .8)) * (1 + rainK() * 1.6) * chaosK(1 - G.half);
  let bh = PL.kind === 'gb' && !plan.dive && Math.abs(PL.luck || 0) > 1.3 - rainK() * .4 && Math.random() < .4;      // 不規則彈跳（怪彈跳）
  let bhHow = 'hop';
  if (!bh && PL.sim && PL.sim.bad && PL.sim.bad.length && !plan.dive) {      // 球在接球前一刻剛好踩到坑洞／小石子／壘包：手套前突然變向、變高、變低
    let m = 0; for (const e of PL.sim.bad) { if (e.type === 'chop') continue; const dtb = PL.t - e.t; if (dtb > -.05 && dtb < .5 && dist2(f.x, f.z, e.x, e.z) < 5.5) m = Math.max(m, e.sev * (e.type === 'bump' ? .55 : 1)); }
    if (m > 0 && Math.random() < m * clamp(.78 - (f.pl.fld || 55) * .004, .3, .75)) bh = true;
  }
  if (!bh && f.pos === 'P' && PL.kind === 'gb' && PL.res && PL.res.ev > 36 && Math.random() < .12) { bh = true; bhHow = 'deflect'; }      // 投手被強襲球打到手套／身體彈開
  if ((Math.random() < fe || bh) && !PL.cleanField) {
    if (bh) PL.badHop = true; else { PL.err = true; G.errs[1 - G.half]++; if (G.errPl) G.errPl[f.pl.name] = (G.errPl[f.pl.name] || 0) + 1; }
    PL.state = 'loose'; f.hasBall = false; let a = Math.random() * TAU, dd = 4.5;
    if (bh && PL.sim) { const i0 = Math.min(PL.sim.S.length - 4, Math.max(0, Math.floor(PL.t * 60))), p1 = PL.sim.S[i0], p2 = PL.sim.S[i0 + 3]; if (p1 && p2 && Math.hypot(p2.x - p1.x, p2.z - p1.z) > .02) { a = Math.atan2(p2.z - p1.z, p2.x - p1.x) + gauss() * (bhHow === 'deflect' ? .9 : .5); dd = 3.5 + Math.random() * 5; } }      // 彈開的球順著原本方向竄出去
    PL.loose = { x: f.x + Math.cos(a) * dd, z: f.z + Math.sin(a) * dd, t: 0 }; PL.looseF = f; f.tx = PL.loose.x; f.tz = PL.loose.z; f.sp = fspeed(f); f.rig.anim = { name: 'down', t: 0, dur: .7, opt: {} };
    flowOnError(f, bh ? bhHow : 'field'); return;
  }
  if (plan.failDive) { }
  flowOnField(f, PL);
  // 接到滾地球後的整備時間（腳步調整／手套換手／站穩）：跑位越遠、球太慢或太強、守備越差越久；偶爾手套不穩
  let gx = 0;
  if (!PL.bunt) {
    const isOFg = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF', fd0 = formationPos(f.pos), mv = dist2(f.x, f.z, fd0.x, fd0.z), ev0 = (PL.res && PL.res.ev) || 25, fl0 = f.pl.fld || 55;
    gx = 0.08 + clamp((mv - 2) * .045, 0, .32) + clamp((22 - ev0) * .02, 0, .22) + clamp((ev0 - 34) * .015, 0, .12) - clamp((fl0 - 55) * .004, -.12, .12) + (Math.random() < .07 + (1 - fl0 / 100) * .10 ? .12 + Math.random() * .28 : 0) + (plan.dive ? .12 : 0);
    gx = Math.max(.05, gx) * (isOFg ? .5 : 1); f.hold = (f.hold || 0) + gx;
  }
  after((plan.dive ? .3 : (PL.bunt ? .1 : .08)) + gx, () => { if (PL && PL.state === 'held' && PL.holder === f) holderThink(f); });
}
function tagUpThink(r, f) {         // 高飛犧牲打／接殺後跑者判斷是否離壘進壘：看外野手到下一壘的傳球時間 vs 自己的跑壘時間
  if (G.outs >= 3 || r.state !== 'on') return;        // G.outs 已含打者的接殺出局：只要原本不是兩出局就能進壘
  const nb = r.from + 1; if (nb < 4 && !baseFree(nb, r)) return;
  const spot = baseSpot(nb), dist = dist2(f.x, f.z, spot.x, spot.z), relay = dist > 48;
  const tBall = .5 + dist / armSpeed(f.pl) + (relay ? .5 : 0) + (r.from === 3 ? .1 : .05);
  const tRun = BASE_LEN / r.spd + .1, margin = tBall - tRun;
  const agg = ((r.pl.agg || 50) - 50) * .006, read = gauss() * (G.lv >= 2 ? .16 : .26);
  const need = (r.from === 3 ? -.28 : .1) - agg;
  let go = margin + read > need;
  if (!go && margin + read > need - .95) {              // 距離其實不夠遠卻賭一把：之後由回傳速度決定出局或安全
    const p = clamp(.12 + ((r.pl.agg || 50) - 50) * .005 + (r.from === 3 && lateGame() && Math.abs(runDiff(G.half)) <= 1 ? .3 : 0), .02, .5);
    go = Math.random() < p;
  }
  if (go) { r.goal = nb; r.state = 'run'; r.to = nb; r.dir = 1; r.s = 0; r.lead = 0; r.tag = true; r.isForce = false; G.on[r.from - 1] = null; r.pre = .1 + Math.abs(gauss()) * .04; }
}

/* ---------------- per-frame play update ---------------- */
/* 野手追球的「判斷落點」：
   以前球一打出，負責接球的野手立刻知道球「最終落在哪」，筆直衝過去、早早站在那裡等球，看起來像先知。
   現在：起步反應後先朝「目前估計的落點」跑，隨球飛行逐漸修正（高飛／強勁平飛球誤差大、守備差誤差更大；滾地球誤差小）；
   時間充裕時用「剛好趕到」的步調跑，不會提早很久站著；時間吃緊（誤差修正不及）時立刻改成全力衝向真正落點，所以不影響原本的接殺／處理判定。 */
function chaosK(team) {      // 天時地利人和：當天狀態 × 該隊場面氣氛（失誤連鎖）× 單次隨機波動；數值越高，越容易發生不可控的小狀況（強者也不例外，只是基礎機率較低）
  const d = G.day || 1, t = (G.tilt && G.tilt[team == null ? 1 - G.half : team]) || 0;
  return clamp(d * (1 + t * .7) * Math.exp(gauss() * .22) * stormMul(), .45, 2.6 + stormK() * 1.6);      // 暴雨：所有失誤與突發狀況更頻繁
}
function bumpTilt(team, v) { if (!G.tilt) G.tilt = [0, 0]; G.tilt[team] = clamp(G.tilt[team] + v, 0, 1.2); }
function dropBall(f, coll, soft) {      // 接球失誤／相撞掉球：球掉在野手附近，變成界內滾動球（soft＝美技嘗試沒抓穩：記安打、不記失誤）
  if (!soft) { PL.err = true; G.errs[1 - G.half]++; if (G.errPl) G.errPl[f.pl.name] = (G.errPl[f.pl.name] || 0) + 1; }
  PL.state = 'loose'; f.hasBall = false; f.chaser = false; const a = Math.random() * TAU, dd = coll ? 2.2 : 1.5 + Math.random() * 2.5;
  PL.loose = { x: f.x + Math.cos(a) * dd, z: f.z + Math.sin(a) * dd, t: 0 }; PL.looseF = f; f.tx = PL.loose.x; f.tz = PL.loose.z; f.sp = fspeed(f);
  f.rig.anim = { name: 'down', t: 0, dur: coll ? 1.3 : .7, opt: {} }; if (coll) f.wait = Math.max(f.wait || 0, 1.0);
  if (soft) { try { errFallout(f, 'robdrop'); } catch (e) { } bumpTilt(1 - G.half, .05); toast('沒抓穩！', '#fff', '#a5f'); say(`<em>${POS_FULL[f.pos]}${f.pl.name}跳起來碰到球了，但落地時沒能抓穩，球掉了出來！</em>`, 3200); }
  else flowOnError(f, 'field');
}
function airDropP(f, plan) {      // 高飛球／平飛球漏接機率：守備差、風、雨、沖天炮（難判斷）、飛撲、球的不規則性
  const fl = (f.pl.fld || 55) * .6 + (f.pl.cat == null ? (f.pl.fld || 55) : f.pl.cat) * .4, res = PL.res || {};
  return clamp(chaosK(1 - G.half) * (.010 + (75 - fl) * .0006 + windK() * .035 + rainK() * .06 + (res.ang > 55 ? .015 : 0) + (plan.dive ? .05 : 0) + Math.abs(PL.luck || 0) * .004), .007, .2);
}
function collideCheck() {      // 兩名野手同時衝向同一顆球：多數會喊「我來」避開，太緊急或太接近會撞在一起
  const A = PL && PL.assist; if (!A || PL.colDone || PL.foul || PL.state !== 'flight') return;
  const plan = PL.plan, f = plan && plan.f; if (!f || f.hasBall || A.hasBall) return;
  const d = dist2(f.x, f.z, A.x, A.z);
  if (!PL.called && d < 3.6) {
    PL.called = true; const fl = f.pl.fld || 55, left = plan.t - PL.t, urg = (plan.dive ? .28 : 0) + (left < .9 ? .12 : 0) + (plan.t < 1.5 ? .1 : 0);
    PL.callOff = !G.evt || Math.random() < clamp(.80 + (fl - 55) * .003 - urg - rainK() * .1 - stormK() * .12, .3, .94);
    if (PL.callOff) { A.tx = A.x; A.tz = A.z; A.wait = .6; A.assist = false; PL.colDone = true; say(`${POS_FULL[f.pos]}${f.pl.name}喊「我來！」，${A.pl.name}讓開`); return; }
  }
  if (PL.called && !PL.callOff && d < 1.15) {
    PL.colDone = true; PL.collide = true;
    for (const x of [f, A]) { x.v = 0; x.tx = x.x; x.tz = x.z; x.wait = x === f ? 1.2 : 1.0; x.rig.run = 0; x.rig.anim = { name: 'down', t: 0, dur: 1.3, opt: {} }; }
    flowSfx('wall'); crowdCheer(.6); CAMC.shake = .14; say(`<em>${f.pl.name}和${A.pl.name}為了搶同一顆球撞在一起！</em>`);
    for (const x of [f, A]) { if (x.pl.out || !G.evt) continue; if (Math.random() < .09 * durMul(x.pl) * (G.evt === 2 ? 1.9 : 1)) { x.pl.out = true; G.injQ.push({ type: 'field', side: 1 - G.half, pl: x.pl, pos: x.pos, why: '與隊友相撞，膝蓋疼痛站不起來' }); x.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${x.pl.name}倒地不起，看起來撞得不輕…</em>`); crowdCheer(0); flowSfx('whistle'); }}
  }
}
const _gb = { x: 0, y: 0, z: 0 }, _gb2 = { x: 0, y: 0, z: 0 };
/* 野手「看球」：只用球目前的位置與速度（眼睛看得到的資訊）估計要往哪跑；不直接讀預先算好的落點／停球點 */
function ballGuess(f, spd, air, lf) {
  const S = PL.sim.S, t = Math.max(0, PL.t); sampleAt(S, t, _gb); sampleAt(S, t + .1, _gb2);
  const vx = (_gb2.x - _gb.x) / .1, vy = (_gb2.y - _gb.y) / .1, vz = (_gb2.z - _gb.z) / .1; let lead;
  if (air) { const rem = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * 9.8 * Math.max(0, _gb.y)))) / 9.8; lead = clamp(rem, 0, 7) * lf; }       // 飛球：依球目前高度與上升／下降速度估計還要飛多久，只往球飛行的方向走
  else lead = clamp(dist2(f.x, f.z, _gb.x, _gb.z) / Math.max(spd, 1), .2, 1.8) * .85;                                                    // 滾地球：追球的「現在位置＋前進方向」，球滾到哪就跟到哪
  return { x: _gb.x + vx * lead, z: _gb.z + vz * lead };
}
function steerChaser() {
  const plan = PL && PL.plan; if (!plan || !plan.f || (plan.kind !== 'catch' && plan.kind !== 'field' && plan.kind !== 'chase')) return;
  const f = plan.f; if (f.hasBall || PL.done || (PL.foul && plan.kind !== 'catch')) return;
  let st = plan._st;
  if (!st) st = plan._st = { T: Math.max(.4, (plan.t || 1) - PL.t), t0: PL.t };
  const air = !!(plan.air && plan.kind === 'catch');
  const spd = fspeed(f) * (air ? AIR_SPD : 1), fl2 = f.pl.fld || 55, acc = 12 + fl2 * .05, rem = plan.t - PL.t;
  const readT = clamp(st.T * (air ? .38 : .5), .35, 1.6), u = clamp((PL.t - st.t0 - (plan.react || .3)) / readT, 0, 1), conf = u * u * (3 - 2 * u);     // 看球越久、判斷越準
  const g = ballGuess(f, spd, air, air ? .72 + .28 * conf : .35 + .65 * conf);      // 飛球：出棒後依球速與仰角就能估出大致落點方向與深度（不再先往本壘方向靠、等球過了內野才反應），之後隨看球時間逐步修正
  const ex = air ? lerp(g.x, plan.x, conf * conf) : g.x, ez = air ? lerp(g.z, plan.z, conf * conf) : g.z;
  const dTrue = dist2(f.x, f.z, plan.x, plan.z), tNeed = Math.max(0, dTrue - 1.0) / spd + spd / (2 * acc) + .03;
  const off = dist2(ex, ez, plan.x, plan.z);
  const commit = rem - tNeed < off * 2 / spd + .2;                 // 剩餘時間不夠繞路 → 全力衝向球的實際位置
  if (!air) {      // 滾地球／低球：持續「盯著球目前的位置與速度」追球（每一幀重新判斷、球彈到哪、拐到哪就跟到哪），不再直接跑到預先算好的停球點站著等球
    sampleAt(PL.sim.S, Math.min(PL.t, PL.sim.tEnd), _gb); const bx = _gb.x, bz = _gb.z;
    const dB = dist2(f.x, f.z, bx, bz);
    if (dB < 1.6) {      // 貼近球了：直接跟著球走、迎前把球接在身前（球不規則彈跳歪掉也能跟上）
      sampleAt(PL.sim.S, Math.min(PL.t + .18, PL.sim.tEnd), _gb2); f.tx = lerp(bx, _gb2.x, .6); f.tz = lerp(bz, _gb2.z, .6); f.sp = spd * .95;
    } else {
      const wP = commit ? .5 : (rem < .8 ? .18 : 0);      // 只有「再不衝就來不及」時才稍微往預判截擊點偏，平常都是追球的當下位置＋前進方向
      f.tx = lerp(ex, plan.x, wP); f.tz = lerp(ez, plan.z, wP); f.sp = spd;
    }
    if (f.v > 1 && dB > 2.5) { const hx = bx - f.x, hz = bz - f.z, hl = Math.hypot(hx, hz) || 1, k = clamp((dB - 2.5) / 12, 0, .35); f.tx += hx / hl * k * 2; f.tz += hz / hl * k * 2; }      // 離球還遠：略往球的正方向多修正一點（邊跑邊看球）
  }
  else if (commit) { f.tx = plan.x; f.tz = plan.z; f.sp = spd; }
  else { f.tx = ex; f.tz = ez; f.sp = clamp(Math.max(0, dist2(f.x, f.z, ex, ez) - 1.0) / Math.max(.25, rem - .3) * 1.15, spd * .6, spd); }
  const A = PL.assist; if (A && A !== f && !A.hasBall && !A.cover) { A.tx = f.tx + (A.x - f.tx) * .1; A.tz = f.tz + (A.z - f.tz) * .1; }
}
function updatePlay(dt) {
  if (!PL) return;
  PL.tAge += dt;
  const sim = PL.sim, plan = PL.plan;
  if (PL.state === 'flight') {
    PL.t += dt; const tEnd = sim.tEnd;
    const tt = Math.min(PL.t, tEnd); sampleAt(sim.S, tt, _tmp); setBall(_tmp, true, PL.kind === 'gb' ? undefined : '#fff'); PL.ballPos = _tmp.clone(); steerChaser(); collideCheck();
    if (PL.review && !PL.review.done) { if (!PL.review.started && PL.t >= PL.review.tv) startHRReview(PL); return; }
    if (PL.foul && !plan.f) { }
    if (sim.bn) { PL.bi = PL.bi | 0; while (PL.bi < sim.bn.length && PL.t >= sim.bn[PL.bi].t) { bounceSfx(sim.bn[PL.bi]); PL.bi++; } }      // 球落地彈跳聲（內野紅土／外野草皮）
    if (sim.wallHit && !PL.wallSnd && PL.t >= sim.wallT) { PL.wallSnd = true; flowSfx('wall'); }
    // landing of foul ball / ground contact sound
    if (!PL.landed && sim.first && PL.t >= sim.first.t) { PL.landed = true; if (PL.foul && plan.kind !== 'catch') { } }
    if (PL.foul) {
      if (plan.kind === 'catch' || plan.kind === 'field') {
        if (plan.kind === 'catch' && PL.t >= plan.t) { const ff = plan.f; if (dist2(ff.x, ff.z, plan.x, plan.z) < (plan.dive ? 3.2 : 2.4)) { onFielded(ff); return; } else if (PL.t > plan.t + .15) { plan.kind = 'field'; plan.air = false; plan.dive = false; } }
      }
      if (plan.kind !== 'catch') {
        const last = sim.S[sim.S.length - 1], oob = Math.hypot(last.x, last.z) > wallRadius(Math.atan2(last.x, -last.z) * 180 / Math.PI) - 1 || Math.hypot(last.x, last.z) > 60;
        if (oob) { const bp = PL.ballPos, gone = bp && Math.hypot(bp.x, bp.z) > wallRadius(Math.atan2(bp.x, -bp.z) * 180 / Math.PI) + 1.5;
          if ((gone && PL.t > .8) || PL.t >= Math.min(tEnd, 9)) { PL.lostBall = true; PL.state = 'dead'; toast('飛進看台！', '#fff', '#a5f'); flowSfx('cheer', .7); say('<em>球飛出場外、撿不回來了！</em>', 2200); after(.9, () => endPlay()); return; } }
        if (!oob && (PL.t >= Math.min((sim.first ? sim.first.t + .12 : tEnd), tEnd, 9) || PL.t >= tEnd)) {      // 球一落地就動身，不等球完全停下
          if (PL.tAge > 14) { PL.state = 'dead'; after(.6, () => endPlay()); return; }
          if (!PL.fchase) { PL.fchase = true; const f = nearestFielderTo(last.x, last.z, null); PL.ff = f; f.chaser = true; f.wait = 0; f.hold = 0; f.sp = fspeed(f) * 1.25; }
          const f = PL.ff, bq = sampleAt(sim.S, Math.min(PL.t, tEnd), {}), aq = sampleAt(sim.S, Math.min(PL.t + .6, tEnd), {});      // 邊跑邊預判：朝球接下來滾到的位置攔截
          PL.fchaseT = (PL.fchaseT || 0) + dt; if (PL.fchaseT > 6.0 && !PL.slowFetch) { PL.slowFetch = true; f.chaser = false; PL.state = 'dead'; after(.4, () => endPlay()); return; }
          f.tx = lerp(bq.x, aq.x, .35); f.tz = lerp(bq.z, aq.z, .35); f.wait = 0;
          if (dist2(f.x, f.z, bq.x, bq.z) < 1.3 && bq.y < 1.6) { f.chaser = false; f.tx = f.x; f.tz = f.z; PL.state = 'held'; PL.holder = f; f.hasBall = true; startPick(.25); f.hold = .25; f.rig.anim = { name: 'pickup', t: 0, dur: .25, opt: {} }; flowSfx('mitt', .6); after(.3, () => endPlay()); }
        }
      } else if (PL.t >= tEnd + .3) { PL.state = 'dead'; after(.5, () => endPlay()); }
      return;
    }
    if (plan.kind === 'hr') { if (PL.t >= plan.t + 1.0) { PL.state = 'hrdone'; } }
    else if (plan.kind === 'chase') {
      const f = plan.f;
      if (PL.t >= plan.t - .05 && (dist2(f.x, f.z, plan.x, plan.z) < 1.3 || PL.t > plan.t + 6)) onFielded(f);
      else if (PL.t >= plan.t - .05 && PL.t < plan.t + 6) { sampleAt(sim.S, Math.min(PL.t, sim.tEnd), _gb); if (dist2(f.x, f.z, _gb.x, _gb.z) < 1.2 && _gb.y < 1.4) { plan.x = _gb.x; plan.z = _gb.z; onFielded(f); } }      // 追到球的當下位置就撿起來（球滾到哪、野手就追到哪）
    } else if (PL.t >= plan.t) {
      const f = plan.f; if (plan.dive && !f.divePlayed) { f.divePlayed = true; }
      const dd = dist2(f.x, f.z, plan.x, plan.z), thr = plan.dive || plan.robHR ? 3.2 : 2.0;
      let nearBall = dd < thr;
      if (!plan.air && !plan.dive && !plan.robHR) { sampleAt(sim.S, Math.min(PL.t, sim.tEnd), _gb); nearBall = dd < 1.0 || (dist2(f.x, f.z, _gb.x, _gb.z) < 1.4 && _gb.y < 1.4); }      // 滾地球：手套真的碰到球才算接到（不再球還沒到、人還在跑就判出局）
      if (nearBall) { f.x = lerp(f.x, plan.x, .9); f.z = lerp(f.z, plan.z, .9); onFielded(f); }
      else if (!plan.robHR && PL.t > plan.t + .15) rechaseBall(PL);      // 球早就過去、野手還沒趕到：沒接到！改成追球（不再瞬間移動接球）
      else if (PL.t > plan.t + 1.5) { f.x = lerp(f.x, plan.x, .9); f.z = lerp(f.z, plan.z, .9); onFielded(f); }
    }
    // dive animation trigger
    if (plan.dive && !plan.f.divePlayed2 && PL.t > plan.t - .45) { plan.f.divePlayed2 = true; plan.f.rig.anim = { name: 'dive', t: 0, dur: .6, opt: {} }; }
    if (plan.failDive && !plan.failDive.f.fdPlayed && PL.t > plan.failDive.t - .3) { plan.failDive.f.fdPlayed = true; plan.failDive.f.rig.anim = { name: 'dive', t: 0, dur: .7, opt: {} }; plan.failDive.f.x = plan.failDive.x; plan.failDive.f.z = plan.failDive.z; plan.failDive.f.tx = plan.failDive.x; plan.failDive.f.tz = plan.failDive.z; plan.failDive.f.hold = .6; diveMissNote(plan.failDive); }
  } else if (PL.state === 'held') {
    const f = PL.holder; let by = 1.25, bz = f.z + .2;
    if (PL.pick) { PL.pick.t += dt; const k = clamp(PL.pick.t / PL.pick.dur, 0, 1); by = lerp(.14, 1.25, k * k); bz = f.z + lerp(.5, .2, k); if (k >= 1) PL.pick = null; }
    setBall({ x: f.x, y: by, z: bz }, true);
    if (PL.ask) askUpdate(dt);
    if (!PL.ask && !PL.noRunAsk && humanDef() && !PL.foul && !PL.tagChase && !PL.selfTag && !PL.pick && !(f.hold > 0) && !PL.done && G.outs < 3 && !E.runners.some(r => r.state === 'run')) {      // 沒有跑者在跑：撿到球仍可按傳壘（傳球選單）
      PL.noRunAsk = true; openAsk(f, null, null); if (PL.ask) { PL.ask.noRun = true; PL.ask.T = PL.ask.t = 2.2; }
    }
    if (!PL.ask && !PL.tagChase && !PL.selfTag && !PL.pick && !(f.hold > 0) && !PL.done && G.outs < 3 && E.runners.some(r => r.state === 'run')) {      // 保險：持球野手有跑者在跑卻遲遲不動作 → 立刻重新判斷傳球／追人（玩家守備時＝重新跳出傳球選單，外野接殺後跑者才起跑也能選）
      PL.idleT = (PL.idleT || 0) + dt; if (PL.idleT > (humanDef() ? .18 : .45)) { PL.idleT = 0; holderThink(f); }
    } else PL.idleT = 0;
    if (PL.tagChase) updateTagChase(dt); tagCheck();
    if (PL.selfTag === f && dist2(f.x, f.z, f.tx, f.tz) < .4) {
      const b = f.selfTag; PL.selfTag = null; f.selfTag = null; const b4 = b === 0 ? 4 : b;
      for (const r of E.runners.slice()) { if (r.state === 'run' && !r.ruledSafe && r.dir > 0 && r.to === b4 && r.s < (r.sliding ? 1 - (r.slideReach || 0) - .004 : .985)) { tagAnim(f); tagCall(f, r, 'force'); } }
      safeCheck(f, b4);
      after(.15, () => { if (PL && PL.state === 'held' && PL.holder === f && G.outs < 3) holderThink(f); });
    }
    checkPlayEnd();
  } else if (PL.state === 'thrown') {
    const th = PL.thr; th.delay -= dt; if (th.delay > 0) { setBall({ x: th.x0, y: 1.5, z: th.z0 }, true); return; }
    th.t += dt; const u = clamp(th.t / th.dur, 0, 1);
    const x = lerp(th.x0, th.x1, u), z = lerp(th.z0, th.z1, u), dd = th.dur * armSpeed(th.from.pl);
    let y;
    if (th.hop) {      // 落地一彈：前段低弧線落地、彈起後再飛向接球者
      const u0 = .62;
      if (u < u0) { const a = u / u0; y = lerp(1.6, BALL_R, Math.pow(a, 1.5)) + Math.sin(a * Math.PI) * Math.min(1.6, dd * .035); }
      else { const a = (u - u0) / (1 - u0); y = lerp(BALL_R, 1.1, a * a) + Math.sin(a * Math.PI) * Math.min(1.0, dd * .016); }
      if (!th.hopDone && u >= u0) { th.hopDone = true; flowSfx('bounce'); spawnBurst(x, .06, z, .3, Math.hypot(x, z) > 30 ? '#6a9a50' : '#c9a06a'); }
    } else if (th.roll) {      // 太遠：落地彈起、再彈一小下，最後貼地滾到接球者腳邊
      if (u < .4) { const a = u / .4; y = lerp(1.6, BALL_R, Math.pow(a, 1.4)) + Math.sin(a * Math.PI) * Math.min(1.6, dd * .03); if (!th.hopDone && u >= .38) { th.hopDone = true; flowSfx('bounce'); spawnBurst(x, .06, z, .3, Math.hypot(x, z) > 30 ? '#6a9a50' : '#c9a06a'); } }
      else if (u < .72) { const a = (u - .4) / .32; y = BALL_R + Math.sin(a * Math.PI) * Math.min(.9, dd * .012); if (!th.hop2 && a >= .95) { th.hop2 = true; flowSfx('bounce', .6); } }
      else { const a = clamp((u - .85) / .15, 0, 1); y = BALL_R + a * a * .5; }
    } else if (th.laser) y = lerp(1.7, 1.2, u) + Math.sin(u * Math.PI) * Math.min(1.1, dd * .018);      // 雷射肩：低平直線
    else y = lerp(1.6, 1.1, u) + Math.sin(u * Math.PI) * Math.min(3, dd * .07);
    setBall({ x, y, z }, true, '#fff');
    if (u >= 1) {
      const rc = th.to, dRc = rc ? dist2(rc.x, rc.z, th.x1, th.z1) : 0;
      if (!th.wild && rc && dRc > 1.0 && dRc <= (th.relay || th.ret ? 4 : 2.6) && (th.wA = (th.wA || 0) + dt) < .6) { rc.tx = th.x1; rc.tz = th.z1; rc.sp = fspeed(rc) * 1.1; rc.wait = 0; rc.hold = 0; }      // 接球的人還沒到位：球先停在壘包上方，等他伸手接到才判定
      else onThrowArrive(th);
    }
  } else if (PL.state === 'loose') {
    const L = PL.loose; L.t += dt; const nb = PL.looseF; setBall({ x: L.x, y: BALL_R, z: L.z }, true);
    if (dist2(nb.x, nb.z, L.x, L.z) < 1.0 && L.t > .5) { PL.state = 'held'; PL.holder = nb; nb.hasBall = true; PL.cleanThrow = true; nb.tx = nb.x; nb.tz = nb.z; nb.hold = .16; startPick(.16); nb.rig.anim = { name: 'pickup', t: 0, dur: .16, opt: {} }; after(.2, () => { if (PL && PL.state === 'held' && PL.holder === nb) holderThink(nb); }); }
  } else if (PL.state === 'hrdone') { checkPlayEnd(); }
  runnersThink(dt);
}
let _rthink = 0;
function startPick(dur) { PL.pick = { t: 0, dur }; }
function runnersThink(dt) {
  _rthink -= dt; if (_rthink > 0 || !PL || PL.done) return; _rthink = .1;
  const live = PL.state === 'flight' || PL.state === 'held' || PL.state === 'thrown' || PL.state === 'loose';
  if (!live || PL.foul) return;
  if (PL.plan.kind === 'hr') return;
  if (PL.plan.air && PL.state === 'flight') return;       // wait for the catch
  const rs = E.runners.filter(r => r.state === 'run' || r.state === 'on').sort((a, b) => (b.from + b.s) - (a.from + a.s));
  for (const r of rs) {
    if (r.from < 1 && !r.bat && r.state !== 'run') continue;
    if (PL.caught && (r.tag || r.dir < 0 || r.state === 'on')) continue;
    if (PL.tagChase && PL.tagChase.r === r && r.state === 'run' && r.dir > 0 && !r.isForce && !r.bat && r.from >= 1 && r.s < .6) {      // 被追的非強迫跑者：有機會折返原壘
      PL.revd = PL.revd || new Set(); const cf = PL.tagChase.f; runnerXZ(r, _rp);
      if (!PL.revd.has(r) && dist2(cf.x, cf.z, _rp.x, _rp.z) < 7 && baseFree(r.from, r)) { PL.revd.add(r); if (Math.random() < .5 + G.lv * .1) { r.dir = -1; r.goal = r.from; continue; } }
    }
    const frac = r.state === 'run' ? r.s : 0;
    const base = r.state === 'run' ? r.to : r.from + 1;
    const dirNow = r.state === 'run' ? r.dir : 1;
    // retreat logic
    if (r.state === 'run' && r.dir > 0 && !r.isForce && !r.bat && r.from >= 1 && r.s < .55 && !(r.pushUntil > PL.tAge) && !(r.stealer && (PL.kind === 'steal' || PL.kind === 'wp')) && !(r.squeeze && PL.res && PL.res.bunt) && !(r.hnr && PL.kind === 'gb' && r.s > .25)) {
      const rem = (1 - r.s) * BASE_LEN / r.spd, eta = ballETA(r.to % 4 === 0 ? 0 : r.to);
      if (eta < rem - .15 && PL.state !== 'flight' && baseFree(r.from, r) && !E.runners.some(o => o !== r && o.state === 'run' && o.dir > 0 && o.to === r.from)) { r.dir = -1; r.goal = r.from; continue; }
    }
    // extra base evaluation
    if (r.state === 'run' && r.dir > 0 || r.state === 'on') {
      const target = base;                                     // the next base on his path
      const rem = r.state === 'run' ? (1 - r.s) * BASE_LEN : BASE_LEN - (r.lead || 0);
      const nextGoal = r.state === 'run' ? r.to + 1 : r.from + 1;
      if (r.state === 'on') {
        if (r.isForce) continue;
        // non-forced runner may take off : only on hits through
        if (PL.kind === 'gb' && !PL.res.bunt && Math.hypot(PL.plan.x, PL.plan.z) < 30 && !(r.from === 3 && G.outs < 2 && false)) continue;
        if (PL.state === 'held') continue;
        const tR = rem / r.spd + .15, eta = ballETA(r.from + 1 >= 4 ? 0 : r.from + 1);
        const need = (G.outs === 2 ? -.3 : (r.from === 3 ? .02 : .2) + (G.lv < 2 ? .3 : 0)) - ((r.pl.agg || 50) - 50) * .005;      // 跑者更積極：願意搶更多壘
        if (baseFree(r.from + 1, r) && tR + need < eta) { r.goal = r.from + 1; r.state = 'run'; r.to = r.from + 1; r.s = (r.lead || 0) / BASE_LEN; r.dir = 1; G.on[r.from - 1] = null; }
        continue;
      }
      if (r.goal >= 4) continue;
      if (r.goal > r.to) continue;
      const nb = r.to + 1; if (nb > 4) continue;
      if (nb < 4 && !baseFree(nb, r) ) continue;
      const tR = rem / r.spd + BASE_LEN / r.spd + .1 - (r.hnr ? .3 : 0);
      const eta = ballETA(nb >= 4 ? 0 : nb);
      const need = (G.outs === 2 ? -.12 : .14) + (nb === 4 ? .08 : 0) + (G.lv < 2 ? .25 : 0) - (PL.plan && PL.plan.f && PL.plan.f.pl.arm < 55 ? .15 : 0) - ((r.pl.agg || 50) - 50) * .003 - (G.lv >= 2 ? .06 : 0);
      if (tR + need < eta && (r.s > .35 || r.s === 0 || true)) { r.goal = nb; }
    }
  }
}
function pushCands() {      // 可以「推進」的跑者：已起跑者（加速、改目標），或剛站上壘包、球還沒回傳到位的跑者
  if (!PL || PL.done || PL.foul || G.outs >= 3 || !humanBats() || G.human < 0 || G.mode !== 'play') return [];
  if (PL.state === 'dead' || PL.state === 'hrdone' || !PL.plan || PL.plan.kind === 'hr') return [];
  if (PL.state === 'flight' && PL.plan.air) return [];
  const out = [];
  for (const r of E.runners) {
    if (r.state === 'run' && r.dir >= 0) { if (r.to < 4 || r.s < .97) out.push(r); }
    else if (r.state === 'on' && r.from >= 1 && r.from <= 3 && !PL.caught && baseFree(r.from + 1, r)) out.push(r);
  }
  return out;
}
function doPush() {
  if (G.freeze) return false;
  const cs = pushCands(); if (!cs.length) return false;
  cs.sort((a, b) => (b.from + (b.state === 'run' ? b.s : 0)) - (a.from + (a.state === 'run' ? a.s : 0)));
  let started = false;
  for (const r of cs) {      // 每點一下：還在壘上的跑者最多多出發一位（最前面的優先）；已在跑的全部加速、改成積極進壘
    if (r.state === 'on') {
      const nb = r.from + 1; if (nb > 4 || !baseFree(nb, r)) continue;      // 壘上所有跑者「同步」起跑（由最前面的跑者開始依序騰出壘包）
      r.goal = nb; r.state = 'run'; r.to = nb; r.s = (r.lead || 0) / BASE_LEN; r.dir = 1; r.isForce = false; r.tag = false; G.on[r.from - 1] = null; r.pre = .05; r.sliding = false; r.pushN = 1; r.pushUntil = PL.tAge + 2; const firstGo = !started; started = true;
      if (firstGo) toast('全壘包推進！', '#fff', '#e80'); say(`<em>${r.pl.name}</em>看準時機，積極往${BASE_NAME[nb % 4]}推進！`, 2500);
    } else {
      if (r.dir < 0) { r.dir = 1; r.goal = r.to; }
      if (r.goal <= r.to && r.to < 4 && baseFree(r.to + 1, r)) r.goal = r.to + 1;
      r.pushN = (r.pushN || 0) + 1; r.pushUntil = PL.tAge + 1.2; r.isForce = r.isForce && r.dir > 0;
    }
  }
  if (!started && !cs.some(r => r.state === 'run')) return false;
  PL.idleT = .28; PL.endHold = 0; return true;      // 守備方約 0.15 秒內就會重新判斷（追人／傳球）
}
function retreatCands() {      // 可以「回壘」的跑者：正在壘間跑動、已離開原壘（不含剛擊出球、還沒到一壘的打者）、不是被強迫進壘的人
  if (!PL || PL.done || G.outs >= 3 || !humanBats() || G.human < 0 || G.mode !== 'play') return [];
  if (PL.state === 'dead' || PL.state === 'hrdone' || !PL.plan || PL.plan.kind === 'hr') return [];
  return E.runners.filter(r => r.state === 'run' && r.from >= 1 && r.from <= 3 && !(r.sliding && r.s > .9) && !(r.isForce && r.dir > 0) && !r.trot);
}
function doRetreat() {      // 回壘：所有跑在壘間的跑者「同步」回到離自己最近的壘包（已過半就停在前面那一壘），同壘不會擠在一起
  if (G.freeze) return false;
  const cs = retreatCands(); if (!cs.length) return false;
  cs.sort((a, b) => (b.from + b.s) - (a.from + a.s));      // 最前面的跑者先決定
  const claimed = {}; let back = 0, hold = 0;
  for (const r of cs) {
    let tgt = r.from;      // 一律回到「最後一個已確定安全上壘的壘包」（r.from；還沒安全上壘的打者不在名單內，按了沒反應）
    const occ = b => b >= 1 && b <= 3 && G.on[b - 1] && G.on[b - 1] !== r;
    if (tgt === r.from && occ(r.from) && r.to <= 4 && !occ(r.to) && !claimed[r.to]) tgt = r.to;      // 原壘已被後面的跑者佔住：只能往前跑
    claimed[tgt] = true;
    if (tgt === r.from) {
      r.dir = -1; r.goal = r.from; r.isForce = false; r.ret = true; r.tag = false; r.pre = Math.min(r.pre || 0, .05); r.pushN = 0; r.pushUntil = 0;
      if (r.stealer) r.accT = stealRamp(r); if (r.sliding) { r.sliding = false; r.rig.anim = null; } back++;
    } else {
      r.dir = 1; r.goal = r.to; r.pushN = 0; r.pushUntil = 0; hold++;      // 離前方壘包比較近：直接跑到前一壘就停
    }
  }
  toast('回壘！', '#fff', '#2a7ae8'); say(hold ? '跑者同步折返，回到最後一個安全上壘的壘包（原壘被佔住的跑者只能往前）！' : '全部跑者同步折返，拼命回到最後一個安全上壘的壘包！', 2500);
  PL.idleT = .28; PL.endHold = 0; return true;
}
function updatePushBtn() {
  const b = $('btnPush'), c = $('btnBack');
  if (b) { const on = pushCands().length > 0; if (on === b.classList.contains('hide')) b.classList.toggle('hide', !on); }
  if (c) { const on = retreatCands().length > 0; if (on === c.classList.contains('hide')) c.classList.toggle('hide', !on); }
}
function pushWindowOpen(dt) {      // 跑者剛站上壘包但球還沒回傳到位：最多多留 2.2 秒給玩家決定要不要繼續推進
  if (!humanBats() || G.human < 0) return false;
  const on = E.runners.filter(r => r.state === 'on' && r.from >= 1 && r.from <= 3 && baseFree(r.from + 1, r));
  if (!on.length || PL.caught || PL.state === 'dead') { PL.endHold = 0; return false; }
  const r = on.sort((a, b) => b.from - a.from)[0], nb = r.from + 1, eta = ballETA(nb >= 4 ? 0 : nb), tR = BASE_LEN / r.spd;
  if (eta < tR * .8) { PL.endHold = 0; return false; }
  PL.endHold = (PL.endHold || 0) + dt; return PL.endHold < 2.2;
}
function checkPlayEnd() {
  if (!PL) return;
  { const dtp = Math.max(0, PL.tAge - (PL._cpeT == null ? PL.tAge : PL._cpeT)); PL._cpeT = PL.tAge; if (!PL.ending && G.outs < 3 && !E.runners.some(r => r.state === 'run') && PL.tAge < 20 && pushWindowOpen(dtp)) return; }
  if (G.outs >= 3 && PL.state !== 'flight') { if (!PL.ending) { PL.ending = true; after(.8, () => endPlay()); } return; }
  const moving = E.runners.some(r => r.state === 'run');
  const askWait = PL.state === 'held' && humanDef() && !PL.foul && G.outs < 3 && (PL.ask || !PL.noRunAsk);
  if ((PL.state === 'held' || PL.state === 'hrdone') && !moving && !PL.selfTag && !PL.tagChase && PL.tAge > .3 && !askWait) {
    if (!PL.ending) { PL.ending = true; after(PL.state === 'hrdone' ? 4.6 : .35, () => endPlay()); }
  }
  if (PL.tAge > (PL.plan && PL.plan.kind === 'hr' ? 70 : 40) && !PL.ending) { PL.ending = true; endPlay(); }
}
function endPlay() {
  if (!PL || PL.done) return;
  if (PL.foul && !PL.foulOut && E.runners.some(r => r.state === 'run' && !r.bat) && (PL.endWait = (PL.endWait || 0) + 1) < 60) { after(.2, endPlay); return; } if (PL.plan && PL.plan.kind === 'hr' && E.runners.some(r => r.state === 'run') && (PL.hrWait = (PL.hrWait || 0) + 1) < 200) { after(.2, endPlay); return; } PL.done = true; const pl = PL;
  // settle runners
  if (pl.plan && pl.plan.kind === 'hr' && !pl.plan.grd) { for (const r of E.runners) if (r.state === 'run') { r.state = 'home'; r.rig.run = 0; r.rig.root.visible = false; scoreRunner(r); } }   // 全壘打：還沒跑完的跑者直接得分，不留在壘上
  else for (const r of E.runners) { if (r.state === 'run') { r.state = 'on'; if (r.dir > 0) { r.from = r.s > .5 ? r.to : r.from; } r.s = 0; r.to = r.from + 1; r.lead = 0; if (r.from >= 1 && r.from <= 3) G.on[r.from - 1] = r; } }
  const fin = () => { setBall({ x: 0, y: 0, z: 0 }, false); flowOnPlayEnd(pl); };
  returnBall(pl, fin);
}
function returnBall(pl, cb) {
  const P = E.F.P; let h = pl.holder;
  if (G.outs >= 3 || (pl.plan && pl.plan.kind === 'hr') || !P || !h || pl.state === 'dead') { cb(); return; }
  const mound = formationPos('P');
  if (pl.foul && !pl.foulOut) after(5.0, () => { if (PL === pl && pl.retCb) { pl.slowFetch = true; pl.retCb(); } });      // 界外球撿回來超過一球的準備時間：直接轉場
  P.tx = mound.x; P.tz = mound.z; P.sp = 6.5; P.hold = 0;
  pl.retCb = () => { pl.retCb = null; cb(); };
  if (h === P) { const back = n => { if (PL !== pl) return; if (dist2(P.x, P.z, mound.x, mound.z) > 1.3 && n < 80) { P.tx = mound.x; P.tz = mound.z; P.sp = 6.5; P.hold = 0; P.wait = 0; after(.1, () => back(n + 1)); return; } pl.retCb && pl.retCb(); }; after(.2, () => back(0)); return; }      // 投手自己持球（例如補位一壘接到傳球）：先拿著球走回投手丘才開始下一球，不再瞬間切換
  const d = dist2(h.x, h.z, mound.x, mound.z);
  // 距離太遠（多半是外野手）：先傳給「距離他最近的壘上內野手」，再由內野手傳回投手，不再一路遠傳到投手丘
  let relayF = null;
  if (d > 38 && h.pos !== 'C') {
    let bd = 1e9; for (const pos of ['1B', '2B', 'SS', '3B']) { const f = E.F[pos]; if (!f || f === h || !f.pl || f.pl.out) continue; const dr = dist2(h.x, h.z, f.x, f.z); if (dr < bd) { bd = dr; relayF = f; } }
    if (relayF && !(bd < d - 8)) relayF = null;      // 中繼的人要明顯比投手近才有意義
  }
  if (relayF) {
    const rf = relayF, dr = dist2(h.x, h.z, rf.x, rf.z);
    rf.tx = rf.x; rf.tz = rf.z; rf.sp = 0; faceRig(rf.rig, h.x, h.z);
    pl.retCb = () => { pl.retCb = null; if (PL === pl) returnBall(pl, cb); };      // 內野手接到後，再呼叫一次 returnBall：此時距離近，直接傳給投手
    after(.04, () => {
      if (PL !== pl) return;
      pl.state = 'thrown'; h.hasBall = false; h.rig.anim = { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } }; faceRig(h.rig, rf.x, rf.z);
      pl.thr = { from: h, to: rf, b: -1, t: 0, dur: dr / (armSpeed(h.pl) * .85) + .05, x0: h.x, z0: h.z, x1: rf.x, z1: rf.z, wild: false, relay: false, ret: true, delay: .15, info: null };
      pl.holder = null;
    });
    return;
  }
  const goThrow = n => {      // 投手還沒回到投手丘（例如剛去補位／撿球）時，野手先持球等他回來，不再把球傳向空無一人的投手丘
    if (PL !== pl || pl.holder !== h) return;
    if (dist2(P.x, P.z, mound.x, mound.z) > 1.3 && n < 45) { P.tx = mound.x; P.tz = mound.z; P.sp = 6.5; P.hold = 0; after(.1, () => goThrow(n + 1)); return; }
    const tx = P.x, tz = P.z, dd = dist2(h.x, h.z, tx, tz); P.tx = tx; P.tz = tz;      // 傳向投手「實際站的位置」
    pl.state = 'thrown'; h.hasBall = false; h.rig.anim = { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } }; faceRig(h.rig, tx, tz); faceRig(P.rig, h.x, h.z);
    pl.thr = { from: h, to: P, b: -1, t: 0, dur: dd / (armSpeed(h.pl) * .85) + .05, x0: h.x, z0: h.z, x1: tx, z1: tz, wild: false, relay: false, ret: true, delay: .15, info: null };
    pl.holder = null;
  };
  after(.04, () => goThrow(0));
}
/* ---------------- human-controlled throwing ---------------- */
const humanDef = () => !G.easy && G.human >= 0 && G.human === 1 - G.half && !G.intWalk;
const BASE_NAME = { 1: '一壘', 2: '二壘', 3: '三壘', 0: '本壘' };
function openAsk(f, best, auto) {
  if (PL.directThrow === undefined) PL.directThrow = true;      // 玩家選壘包＝直接傳到該壘包（按 R 才改成經中繼員）
  PL.ask = { f, t: 3.2, T: 3.2, auto, rec: best ? best.b : -1 };
  const tp = $('throwPanel'); tp.classList.remove('hide');
  const pos = { 0: [50, 84], 1: [84, 50], 2: [50, 16], 3: [16, 50] };
  const isOF = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF';
  let h = '<svg viewBox="0 0 100 100"><polygon points="50,16 84,50 50,84 16,50" fill="none" stroke="#fff" stroke-width="2"/></svg><div class="tt"></div><div class="tbar"><i id="tAskBar"></i></div>';
  h += '<div class="tb tctr" data-b="chase" style="left:50%;top:50%"><span class="tn">追殺</span><small>T</small></div>';      // 中間：持球追最近的跑者並觸殺（沒有跑者時不能按）
  for (const b of [2, 3, 1, 0]) { const cv = PL.cover && PL.cover[b]; h += `<div class="tb" data-b="${b}" style="left:${pos[b][0]}%;top:${pos[b][1]}%"><span class="tn">${BASE_NAME[b]}</span><small>${b === 0 ? 'H' : b}</small>${cv ? '<span class="tf">' + cv.pos + '</span>' : ''}</div>`; }
  h += `<div class="tb tmode" data-b="relay" style="left:88%;top:88%"><span class="tn">中繼</span><small>R</small></div>`;      // 傳給中繼內野手（外野手傳回內野、內野手也可轉傳）
  tp.innerHTML = h;
  tp.querySelectorAll('.tb').forEach(el => { const go = e => { e.preventDefault(); e.stopPropagation(); const d = el.dataset.b; humanThrow(d === 'mode' || d === 'chase' || d === 'relay' ? d : +d); }; el.addEventListener('pointerdown', go); });
  askMark();
}
function selfRunSpeed(f) {      // 野手自己持球跑壘包：依個人跑速、守備能力調整（持球略慢於全速）
  const pl = f.pl; return fspeed(f) * clamp(.96 + ((pl.spd || 55) - 55) * .0022 + ((pl.fld || 55) - 55) * .0006, .88, 1.1);
}
function baseMan(b, f) {      // 該壘包的守備員：投手補一壘時，依「持球者」與「投手」誰離壘包近決定——持球者較近就自己站壘包，投手較近就傳給投手（兩人不會同時搶壘包）
  let cv = PL && PL.cover && PL.cover[b]; if (b < 1 || b > 3 || !PL.cover) return cv;
  if (cv && (cv.pos === 'P' || cv.pos === 'C')) {
    const nm = E.F[{ 1: '1B', 2: '2B', 3: '3B' }[b]], spot = baseSpot(b), okF = g => g && !(g.pl && g.pl.out) && (g === f || !g.chaser);
    let best = cv, bd = dist2(cv.x, cv.z, spot.x, spot.z);
    for (const g of [nm, f]) { if (!okF(g) || g === cv) continue; const d = dist2(g.x, g.z, spot.x, spot.z); if (d < bd - .01) { bd = d; best = g; } }
    cv = PL.cover[b] = best;
  }
  return cv;
}
function thrAvail(b) {      // 玩家選擇傳往哪個壘包：該壘包必須已有守備員在壘包上（或持球者自己就是該壘包的守備員），否則不能傳
  const A = PL && PL.ask; if (!A) return { ok: false };
  const cv = baseMan(b, A.f), spot = baseSpot(b);
  if (!cv || (cv.pl && cv.pl.out)) return { ok: false, why: '無人' };
  if (cv === A.f) return { ok: true, self: true, cv };
  if (cv.chaser) return { ok: false, why: '無人' };
  return { ok: true, cv };
}
function askMark() {
  if (!PL || !PL.ask) return; const rs = E.runners.filter(r => r.state === 'run'); const hot = new Set(rs.map(r => (r.dir > 0 ? r.to : r.from) % 4));
  document.querySelectorAll('#throwPanel .tb').forEach(el => { const b = +el.dataset.b; el.classList.toggle('hot', hot.has(b)); el.classList.toggle('rec', b === PL.ask.rec);
    if (el.dataset.b === 'chase') { el.classList.toggle('dis', !nearestTagRunner(PL.ask.f)); return; }
    if (el.dataset.b === 'near' || el.dataset.b === 'mode' || isNaN(b)) return;
    const av = thrAvail(b); el.classList.toggle('dis', !av.ok); let sp = el.querySelector('.tf'); if (!sp) { sp = document.createElement('span'); sp.className = 'tf'; el.appendChild(sp); }
    sp.textContent = av.ok ? (av.self ? '自己跑' : av.cv.pos) : av.why; });
}
function closeAsk() { if (PL) PL.ask = null; const tp = $('throwPanel'); if (tp) { tp.classList.add('hide'); } }
function askUpdate(dt) {
  const A = PL.ask; if (!A) return;
  if (PL.holder !== A.f || PL.done || (!A.noRun && !E.runners.some(r => r.state === 'run')) || G.outs >= 3) { closeAsk(); return; }
  A.t -= dt; const bar = $('tAskBar'); if (bar) bar.style.width = clamp(A.t / A.T, 0, 1) * 100 + '%'; askMark();
  if (A.t <= 0) { const au = A.auto; closeAsk(); if (au) execThrow(A.f, au.b, au); }
}
function execThrow(f, b, info) {
  if (!PL || PL.state !== 'held' || PL.holder !== f) return;
  const cov = baseMan(b, f), spot = baseSpot(b);
  { const P = E.F.P; if (cov === f && P && P !== f && P.cover === b) { P.cover = null; const m = formationPos('P'); P.tx = m.x; P.tz = m.z; P.sp = fspeed(P) * .9; P.wait = 0; } if (cov && cov !== f && cov.pos !== 'P' && E.F.P && E.F.P.cover === b) { const P = E.F.P; P.cover = null; const m = formationPos('P'); P.tx = m.x; P.tz = m.z; P.sp = fspeed(P) * .9; P.wait = 0; } if (cov) cov.cover = b; }      // 只留一個人守壘包：另一個回投手丘／原位
  if (cov === f) { f.tx = spot.x; f.tz = spot.z; f.sp = selfRunSpeed(f); f.selfTag = b; f.hold = 0; f.wait = clamp(.12 - ((f.pl.fld || 55) - 55) * .002, .04, .22); PL.selfTag = f; say(`${POS_FULL[f.pos]}${f.pl.name}持球跑向${BASE_NAME[b]}！`, 1800); return; }
  throwTo(f, cov || nearestFielderTo(spot.x, spot.z, f), b, info || {});
}
function nearestTeammate(f) { let b = null, bd = 1e9; for (const g of Object.values(E.F)) { if (g === f) continue; const d = dist2(g.x, g.z, f.x, f.z); if (d < bd) { bd = d; b = g; } } return b; }
function execNear(f) {      // 把球傳給離自己最近的守備員（遠距離會落地一彈，肩力強則有機會雷射直傳）
  if (!PL || PL.state !== 'held' || PL.holder !== f) return; const g = nearestTeammate(f); if (!g) return;
  g.tx = g.x; g.tz = g.z; g.sp = 0; g.chaser = false; g.wait = 0;
  throwTo(f, g, -2, {}, true); say(`${POS_FULL[f.pos]}${f.pl.name}把球傳給最近的${POS_FULL[g.pos]}${g.pl.name}`, 2200);
}
function nearestTagRunner(f) {      // 離持球者最近、可被觸殺的跑者
  let best = null, bd = 1e9; if (!f) return null;
  for (const r of E.runners) { if (!runnerTaggable(r)) continue; runnerXZ(r, _rp); const d = dist2(f.x, f.z, _rp.x, _rp.z); if (d < bd) { bd = d; best = r; } }
  return best;
}
function execRelay(f) {      // 傳給中繼內野手：優先用外野落點對應的中繼員，否則傳給最近的內野手
  if (!PL || PL.state !== 'held' || PL.holder !== f) return;
  let g = PL.cover && PL.cover.relay; if (!g || g === f || g.chaser || (g.pl && g.pl.out)) { g = null; let bd = 1e9; for (const pos of ['SS', '2B', '3B', '1B']) { const c = E.F[pos]; if (!c || c === f || c.chaser || (c.pl && c.pl.out)) continue; const d = dist2(c.x, c.z, f.x, f.z); if (d < bd) { bd = d; g = c; } } }
  if (!g) return; g.tx = g.x; g.tz = g.z; g.sp = 0; g.chaser = false; g.wait = 0;
  throwTo(f, g, -2, {}, true); say(`${POS_FULL[f.pos]}${f.pl.name}傳給中繼的${POS_FULL[g.pos]}${g.pl.name}`, 2200);
}
function humanThrow(b) { if (!PL || !PL.ask || G.freeze) return; const f = PL.ask.f; if (b === 'relay') { closeAsk(); execRelay(f); return; } if (b === 'mode') { PL.directThrow = !PL.directThrow; const el = document.querySelector('#throwPanel .tmode'); if (el && el.firstChild) el.firstChild.nodeValue = PL.directThrow ? '直傳' : '中繼'; return; } if (b === 'chase') { const tr = nearestTagRunner(f); if (!tr) { say('目前沒有可以觸殺的跑者！', 1500); return; } closeAsk(); startTagChase(f, tr); return; } if (b !== 'near' && b !== 'tag') { const av = thrAvail(b); if (!av.ok) { say(av.why === '補位中' ? `${BASE_NAME[b]}的守備員還在補位途中，等他到壘包再傳！` : `${BASE_NAME[b]}目前沒有守備員，等有人補位後才能傳球！`, 1800); return; } } closeAsk(); if (b === 'near' || b === 'tag') { execNear(f); return; } execThrow(f, b, {}); }
function clearPlay() { const tp = document.getElementById('throwPanel'); if (tp) tp.classList.add('hide'); PL = null; for (const f of Object.values(E.F)) { f.hasBall = false; f.chaser = false; f.dive = false; f.divePlayed = f.divePlayed2 = f.fdPlayed = false; f.selfTag = null; f.hold = 0; f.wait = 0; f.v = 0; } }

