/* 15-cpu-steal-pickoff-bench.js — CPU 腦：盜壘／牽制／板凳調度（原 script.js 第 3433-3689 行） */
'use strict';
/* -------- offensive calls : steals / hit&run -------- */
function aiOffenseCall() {
  G.callBunt = false; G.hitAndRun = false; G.runnerGo = []; G.squeeze = null; const L = lvl(); const off = G.half;
  const b = curBatter(), r = G.on, out = G.outs, diff = runDiff(off);
  if (aiSqueezeCall()) return;
  if (aiBuntCall()) { G.callBunt = true; G.sneak = false; return; }
  if (aiSneakBunt()) { G.callBunt = true; G.sneak = true; return; }
  const p = curPitcher(), c = E.F.C.pl;
  const tPitch = flightT(p.kmh * .9) + .85 * .7 * 1.02;                // 起跑（抬腿）後：剩餘投球動作＋球飛行時間
  const tCatch = tPitch + .22 + (c.fld < 55 ? .05 : 0);
  let sendIdx = -1;
  // evaluate steal of 2B / 3B only (home steal : rare)
  for (const i of [1, 0]) {
    const run = r[i]; if (!run || run.state !== 'on') continue; if (r[i + 1]) continue;
    if (i === 1 && r[2]) continue; const to = baseSpot(i + 2);
    const from = baseSpot(i + 1);
    const lead = Math.max(.9, (run.leadMax || 2.2) * (1 - (run.wary || 0) * .3)); const runT = (BASE_LEN - lead) / run.spd + .25 * stealRamp(run) + .2;
    const dist = dist2(0, 1.6, to.x, to.z), throwT = tCatch + dist / armSpeed(c);
    const margin = throwT - runT - stealThreat(run) * .0 - (defenseThreat().r === run ? .0 : 0) + (defenseThreat().t > 1.2 ? -.06 : 0);
    const agg = run.pl.agg || 50; let need = L.steal * 0 + (L.steal - .68) * 1.2 + .15 - (agg - 50) * .0035 - (G.lv >= 2 ? .03 : 0) + (run.wary || 0) * .22 + .1;      // 被牽制過：跑者更保守（立即起跑有被牽制的風險，再加一點保守）
    if (out === 2) need -= .02; if (diff >= 3 || diff <= -4) need += .3; if (out === 0 && i === 0) need += .05;
    if (G.strikes === 2 && out === 2) need -= .02;
    if (strengthOf(b) > 78 && i === 0 && out < 2) need += .12;
    if (lateGame() && Math.abs(diff) <= 1) need -= .03;
    if (margin > need && run.pl.spd >= 52 && L.learn > 0 && G.lv >= 1) {
      if (Math.random() < clamp((.28 + (margin - need) * 1.3) * (.7 + agg / 100 * .6), 0, .9) * (1 - clamp((run.wary || 0) * .6, 0, .75))) { sendIdx = i; }
    }
  }
  if (sendIdx < 0 && L.hnr > 0 && r[0] && r[0].state === 'on' && !r[1] && out < 2 && G.strikes < 2 && b.con >= 58 && r[0].pl.spd >= 45) {      // 打帶跑：一壘有人、打者擅長擊球時，電腦也會喊出打帶跑（難度愈高愈常用）
    let ph = L.hnr * (.06 + (b.con - 58) * .004 + (G.balls > G.strikes ? .06 : 0)) * (strengthOf(b) > 80 ? .45 : 1) * ((diff >= 3 || diff <= -3) ? .5 : 1) * (r[2] ? .5 : 1);
    if (humanDefTac('in')) ph *= .8; if (Math.random() < ph) { G.runnerGo = [0]; G.hitAndRun = true; return; }
  }
  if (sendIdx >= 0) {
    G.runnerGo = (sendIdx === 1 && G.on[0] && G.on[0].state === 'on' && !G.on[2] && G.on[0].pl.spd >= 55 && G.lv >= 2 && Math.random() < .3) ? [1, 0] : [sendIdx];      // 偶爾雙盜壘
    if (G.on[sendIdx + 1 - 1] && b.con > 66 && !G.on[sendIdx + 1] && G.strikes < 2 && Math.random() < .25) G.hitAndRun = true;
  }
}
/* -------- 盜壘：威脅判斷（捕手/投手預判）＋跑者加速曲線 -------- */
function readRunners() {                   // 電腦守備方每球讀取跑者：離壘明顯拉大（或有意盜壘）→ 提高警戒
  let any = false; const readP = clamp(.55 + G.lv * .12, .5, .95);
  for (const i of [0, 1, 2]) { const r = G.on[i]; if (!r) continue; r.tellRead = false; if (i === 2 || r.state !== 'on' || G.on[i + 1]) continue;
    const base = Math.max(.9, (r.leadMax || 2.2) * (1 - (r.wary || 0) * .3));
    if (((r.lead || 0) > base * 1.1 + .2 || stealIntent(r)) && Math.random() < readP) { r.tellRead = true; any = true; } }
  G.stealAlert = any; return any;
}
function stealThreat(r) {                  // 0~2.2：跑速快、盜壘企圖心高、大幅離壘、本場已嘗試盜壘 → 威脅高
  const pl = r.pl, lead = (r.leadMax || 2.2) * (1 - (r.wary || 0) * .3);
  return clamp((r.tellRead ? .8 : 0) + (pl.spd - 50) * .028 + ((pl.agg || 50) - 50) * .011 + (lead - 2.2) * .25 + (r.stealTry || 0) * .3 - .25 - (r.wary || 0) * .25, 0, 2.2);
}
function defenseThreat() {                 // 目前防守方最該提防的跑者
  let m = 0, who = null; for (const i of [0, 1]) { const r = G.on[i]; if (!r || r.state !== 'on' || G.on[i + 1]) continue; const t = stealThreat(r); if (t > m) { m = t; who = r; } } return { t: m, r: who };
}
function stealIdxs() {      // 目前「盜壘指示」會跑的壘上跑者（0＝一壘、1＝二壘、2＝三壘盜本壘）；前方有人沒動的會跑到壘前等
  if (!G.stealReq) return [];
  const ok = i => !!G.on[i] && G.on[i].state === 'on'; let want;
  if (G.stealSet && G.stealSet.length) want = G.stealSet; else if (G.stealSel != null) want = [G.stealSel]; else { const f = [2, 1, 0].find(ok); want = f == null ? [] : [f]; }
  return [2, 1, 0].filter(i => want.includes(i) && ok(i));
}
function stealBlocked(r) {      // 盜壘中：下一個壘包被「沒有推進」的跑者佔著（或是正在折返回該壘的跑者）→ 前面過不去
  const b = r.to; if (b < 1 || b > 3) return false;
  const o = G.on[b - 1]; if (o && o !== r && o.state === 'on') return true;
  return E.runners.some(q => q !== r && q.state === 'run' && q.dir < 0 && q.from === b);
}
const stealRamp = r => clamp(1.6 - (r.pl.spd - 50) * .013, .9, 2.0);        // 起跑到全速所需時間（跑速越快越短）
function startSteal(idxs, pre0) {
  for (const i of idxs) {
    const r = G.on[i]; if (!r || r.state !== 'on') continue; const nb = r.from + 1;
    if (nb < 4 && G.on[nb - 1] && !r.earlyGo) continue;
    r.state = 'run'; r.goal = nb; r.to = nb; r.dir = 1; r.s = (r.lead || 0) / BASE_LEN; r.pre = pre0 != null ? pre0 : clamp(.3 - (r.pl.spd - 50) * .0008 - ((r.pl.agg || 50) - 50) * .0004 + Math.abs(gauss()) * .04, .16, .5); r.accT = 0; r.stealTry = (r.stealTry || 0) + 1; r.stealer = true; r.stealRun = true; r.squeeze = (G.squeeze === 'suicide' && i === 2); G.on[i] = null; r.isForce = false;
  }
}

/* -------- 立即盜壘（按下盜壘＝跑者當場盡全力起跑；投手還沒抬腿前可隨時牽制刺殺跑者） -------- */
function stealWindowOpen() { return G.mode === 'play' && !G.over && (G.phase === 'pre' || (G.phase === 'windup' && !G.legUp)); }
function launchEarlySteal(idxs) {      // 點跑者＝該跑者先大步離壘（約0.4秒，這時投手可牽制），接著馬上起跑；下一壘沒人推進就跑到壘前等
  if (!stealWindowOpen() || !idxs || !idxs.length) return false;
  const L = lvl(), go = [];
  for (const i of idxs) {
    const r = G.on[i]; if (!r || r.state !== 'on' || r.stepGo || i > 2) continue;
    r.stepGo = true; r.stepT = .42; r.earlyGo = true; r.decided = false; r.watchT = 0; r.waiting = false;
    r.reactT = L.srT * (.75 + Math.random() * .6) * (1 + (curPitcher().fatigue || 0) * .004); go.push(i);
  }
  if (!go.length) return false;
  G.stealReq = false; G.stealSel = null; G.stealSet = null; G.earlyRun = true;
  try { coverSteal(go.filter(i => i < 2)); } catch (e) { }
  if (humanPitches() && G.human >= 0) { say('<em>跑者大步離壘、準備盜壘！</em>投手還沒抬腿前，按 <em>E</em> 可以牽制刺殺'); toast('跑者要盜壘！按 E 牽制', '#fff', '#d9961c'); }
  else { say('<em>跑者大步離壘，盜壘！</em>'); toast('盜壘！', '#ffe9a0', '#c60'); }
  return true;
}
function humanSteal(i) { if (humanBats() && G.human >= 0) launchEarlySteal([i]); }
function updateStealWatch(dt) {
  if (G.mode !== 'play' || G.over) return;
  if (G.earlyAt >= 0) { if (!stealWindowOpen()) G.earlyAt = -1; else { G.earlyAt -= dt; if (G.earlyAt < 0) { G.earlyAt = -1; const ix = (G.earlyIdx || []).filter(i => G.on[i] && G.on[i].state === 'on'); launchEarlySteal(ix); } } }
  if (humanBats() && G.human >= 0 && G.stealReq && G.offCall !== 'hitrun' && !G.callBunt && stealWindowOpen()) { const ix = stealIdxs(); if (ix.length) launchEarlySteal(ix); else G.stealReq = false; }
  for (const r of G.on.slice()) if (r && r.stepGo) { r.stepT -= dt; if (r.stepT <= 0) { r.stepGo = false; const i = G.on.indexOf(r); if (r.state === 'on' && i >= 0) startSteal([i], .05 + Math.random() * .05); } }      // 大步離壘完 → 馬上盡全力起跑
  if (!G.earlyRun) return;
  if (!E.runners.some(r => r.earlyGo && (r.state === 'run' || r.stepGo))) { if (G.phase !== 'pickoff') G.earlyRun = false; return; }
  if (!stealWindowOpen() || G.cpuBusy || G.rosinBusy || (humanPitches() && !G.intWalk)) return;      // 電腦投手才自動判斷；玩家投手自己按 E
  const L = lvl();
  for (const r of E.runners) {
    if (!r.earlyGo || r.decided || r.bat || !(r.stepGo || (r.state === 'run' && r.dir > 0))) continue;
    r.watchT += dt; if (r.watchT < r.reactT) continue; r.decided = true;      // 反應時間：難度愈高、投手愈有精神，愈快發現跑者大步離壘／起跑
    const stepping = !!r.stepGo, i = stepping ? G.on.indexOf(r) : r.from - 1;
    let p = L.sr * (1 + pickAbility(Math.max(0, i)) * 1.3) * (1 - (r.wary || 0) * .3);
    if (!stepping) { p *= r.s < .3 ? 1 : .55; if (r.s >= .5) p = 0; }
    if (Math.random() < p) { if (stepping) { if (i >= 0) { r.stepGo = false; r.earlyGo = false; doPickoff(i); return; } } else { if (stealPickoff(r)) return; } }
    G.stealAlert = true; if (G.phase === 'pre') G.pitchDelay = Math.min(G.pitchDelay, G.preT + .1 + Math.random() * .2);      // 不牽制：改成快速投球，讓捕手趕快傳球
  }
}
function stealPickoff(r) {      // 投手對「已起跑的盜壘跑者」牽制：直接傳向跑者要去的壘包，跑者還沒到就被觸殺
  const P = E.F.P, tb = r.to, tgt = tb === 2 ? (E.bat && E.bat.side > 0 ? E.F.SS : E.F['2B']) : tb === 3 ? E.F['3B'] : tb === 4 ? E.F.C : null;
  if (!P || !tgt || r.state !== 'run' || r.dir < 0 || G.phase === 'pickoff' || !stealWindowOpen()) return false;
  if (G.phase === 'windup') PT = null;      // 還沒抬腿：取消這次投球
  pitcherToMound(); G.phase = 'pickoff'; G.pickCount++; G.earlyRun = true;
  const pp = curPitcher(); pp.pkLoad = (pp.pkLoad || 0) + .6; pp.fatigue = calcFatigue(pp);
  const tok = G.pkTok = (G.pkTok || 0) + 1, alive = () => tok === G.pkTok && !G.over && G.mode === 'play';
  const bs = baseSpot(tb), cv = { x: bs.x + (bs.x > 0 ? -.5 : bs.x < 0 ? .5 : 0), z: bs.z + (tb === 2 ? 1.2 : .6) }, hd = pp.hand === 'L' ? -1 : 1;
  const wild = Math.random() < clamp(.035 - pickAbility(r.from - 1) * .05, .008, .08);
  r.decided = true; faceRig(P.rig, cv.x, cv.z); faceRig(tgt.rig, P.x, P.z); P.rig.anim = { name: 'throw', t: 0, dur: .36, opt: { hand: hd } };
  tgt.tx = cv.x; tgt.tz = cv.z; tgt.sp = fspeed(tgt) * 1.15; tgt.wait = 0; tgt.hold = 0;
  say(`<em>${pp.name}</em>發現<em>${r.pl.name}</em>起跑，轉身傳向${tb === 2 ? '二' : '三'}壘！`); toast('牽制！', '#fff', '#2a7ae8');
  const finish = () => {
    if (!alive()) return;
    if (E.runners.some(q => q.state === 'run' && q.earlyGo && !q.waiting && q.dir > 0 && q.s < 1)) { after(.12, finish); return; }
    G.earlyRun = false; if (G.outs >= 3) { endHalf(); return; } cleanupRunners(); prePitch();
  };
  after(.18, () => {
    if (!alive()) return; const h = new V3(); try { pitcherHandPos(h); } catch (e) { h.set(P.x, 1.5, P.z); } flowSfx('pick', .4);
    const to = wild ? { x: cv.x + (cv.x >= 0 ? 3 : -3), y: 1.2, z: cv.z + 3.5 } : { x: cv.x, y: 1.15, z: cv.z };
    ballTween({ x: h.x, y: h.y, z: h.z }, to, clamp(throwDur(P, cv), .3, .8), .45, () => {
      if (!alive()) return; flowSfx('mitt'); tgt.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} };
      after(.14, () => {
        if (!alive()) return; tagAnim(tgt);
        if (wild) { say('牽制暴傳！球跑掉了，跑者安全！'); toast('牽制暴傳', '#fff', '#d9731a'); if (r.state === 'run' && r.to < 4 && r.goal === r.to && baseFree(r.to + 1, r)) r.goal = r.to + 1; }
        else if (r.state === 'run' && r.dir > 0 && r.s < 1 - (r.sliding ? (r.slideReach || 0) : 0) - .03) { putOut(r, 'tag'); toast('牽制刺殺！', '#fff', '#f55'); }
        else { say(SAY.steal(r, true)); toast('盜壘成功！', '#fff27a', '#2a9a3a'); }
        after(.9, finish);
      });
    });
  });
  after(10, () => { if (tok === G.pkTok && !G.over && G.mode === 'play' && G.phase === 'pickoff') { G.earlyRun = false; if (G.outs >= 3) endHalf(); else { cleanupRunners(); prePitch(); } } });      // 保險
  return true;
}

/* -------- pickoff -------- */
/* 跑者「有意盜壘」：AI 已決定要跑、或玩家下了盜壘指示 → 會把離壘拉得更遠（也更容易被牽制） */
function stealIntent(r) {
  if (!r || r.state !== 'on') return false; const i = G.on.indexOf(r); if (i < 0) return false;
  if (r.stepGo || (G.runnerGo && G.runnerGo.includes(i))) return true;
  if (humanBats() && G.stealReq) return stealIdxs().includes(i);
  return false;
}
function effLead(r) {                       // 目前想站的離壘距離：基本離壘 × 警戒心縮減；有意盜壘則再拉遠
  const base = r.leadMax || 2.2, w = r.wary || 0, it = stealIntent(r);
  let v = Math.min(4.2, Math.max(.9, base * (1 - w * .3)) * (it ? 1.22 : 1) + (it ? .4 : 0)); if (r.stepGo) v = Math.min(5, v + 1.4);      // 盜壘前先大步離壘
  if (G.leadMode && humanBats() && G.human >= 0) return Math.min(4.8, Math.max(.5, v * (G.leadMode > 0 ? 1.3 : .65)));      // 玩家進攻：大幅離壘／保守離壘
  return v;
}
function pickAbility(i) {                   // 牽制能力：投手控球／疲勞、接牽制的壘包手守備、左投牽制一壘
  const pp = curPitcher(), tgt = i === 0 ? E.F['1B'] : i === 1 ? E.F.SS : E.F['3B'];
  return clamp(((pp.ctl || 60) - 55) * .008 + (((tgt && tgt.pl && tgt.pl.fld) || 55) - 55) * .006 + (i === 0 && pp.hand === 'L' ? .12 : 0) - (pp.fatigue || 0) * .002, -.25, .6);
}
function aiPickoffThink() {
  const L = lvl(), al = !!G.stealAlert; if (L.learn === 0 && !al) return -1;
  const pp = curPitcher(); if ((pp.fatigue || 0) > 80 && !al) return -1;              // 體力見底不再亂牽制
  for (const i of [0, 1, 2]) {
    const r = G.on[i]; if (!r || r.state !== 'on') continue;
    const lead = r.lead || 0, danger = (r.pl.spd - 50) * .01 + Math.max(0, lead - 2.0) * .16 + stealThreat(r) * .08;
    if (G.pickCount >= 2 + (danger > .3 ? 1 : 0) + (r.tellRead ? 1 : 0)) continue;
    let pr = ((i === 0 ? .1 : .05) + clamp(danger, 0, .4) * .55 + (r.stealTry || 0) * .05 + ((r.lead || 0) > 3 ? .06 : 0)) * (1 - (r.wary || 0) * .4) * (1 - (pp.fatigue || 0) * .006);
    if (r.tellRead) pr = Math.max(pr, (.22 + G.lv * .06) * (1 - (r.wary || 0) * .3));      // 看穿跑者企圖：積極牽制
    if (Math.random() < pr) return i;
  }
  return -1;
}
function pickoffSuccess(r) {
  // 以「投出牽制球當下」的離壘距離判定（跑者回壘途中不算）：離壘遠、跑速慢、牽制能力高 → 機率較高；正常離壘幾乎不會被牽制出局
  const ab = pickAbility(r.from - 1), lead = r.leadAtPick !== undefined ? r.leadAtPick : (r.lead || 0), spd = r.pl.spd || 55;
  const safe = 2.6 + (spd - 55) * .014 - (r.wary || 0) * .2;                    // 跑速快的跑者離較遠仍回得來
  let p = (lead - safe) * .15 + (lead > safe ? .02 : 0) + ab * .22 + (r.pkIntent ? .03 : 0) - (spd - 60) * .002;
  p = clamp(p, 0, .5); if (lead >= 1.8) p = Math.max(p, .008);
  return Math.random() < p;
}

/* -------- bench management -------- */
function aiManagePitcher(sideIdx) {
  // CPU 總教練：只在「兩個打者之間」判斷，且不會隨便換——
  //  1) 體力見底／被打爆（緊急）  2) 體力下降、表現不佳、長時間不穩（至少面對 3 名打者後）
  //  3) 關鍵局面針對特定打者（右投對強力左打 → 換左投）  4) 最後一局領先 1~3 分 → 終結者
  //  換投後同半局不再換、新投手至少面對 2 名打者；牛棚只剩 1 人時除非緊急否則保留
  const t = G.teams[sideIdx]; if (G.human === sideIdx || G.over || G.forfeit >= 0) return;
  const p = t.pitchers[t.cur]; if (!p || p.out) return;
  const pool = availPitchers(sideIdx); if (!pool.length) return;
  const nb = G.teams[1 - sideIdx].lineup[G.bi[1 - sideIdx]];
  const diff = G.score[sideIdx] - G.score[1 - sideIdx], left = G.innings - G.inning;
  const nR = G.on.filter(x => x).length, risp = !!(G.on[1] || G.on[2]), clean = G.outs === 0 && nR === 0;
  const faced = (p.outs || 0) + (p.hA || 0) + (p.bbA || 0) + (p.hbp || 0);
  const fat = p.fatigue || 0, er = p.er || 0, mood = moodOf(p), shaky = p.shaky || 0;
  const key = G.inning * 2 + G.half, justChanged = t.lastChg === key;
  const blowout = diff <= -6 || diff >= 8, reserve = pool.length <= 1 && left >= 2;
  const rel = q => q.ctl * .35 + q.kmh * .4 + (100 - (q.fatigue || 0)) * .1;
  let why = '', pickI = -1;
  const emergency = fat >= 72 || er >= 6 || (er >= 4 && mood < 22 && shaky >= 5);
  if (emergency && !(reserve && fat < 85 && er < 8) && (faced >= 2 || fat >= 85)) why = fat >= 72 ? '體力見底' : '連續失分';
  if (!why && faced >= 3 && !justChanged && !reserve) {
    if (fat >= 58 && (clean || fat >= 66)) why = '體力下降';
    else if (!blowout && er >= (p.role === 'SP' ? 4 : 3) && mood < 40 && shaky >= 3) why = '表現不佳';
    else if (!blowout && shaky >= 5 && nR > 0 && mood < 45) why = '投球不穩';
    else if (p.role === 'SP' && p.pc >= 100 && clean && !blowout) why = '投球數偏高';
  }
  if (!why && !justChanged && p.role !== 'CL' && G.inning >= G.innings && diff > 0 && diff <= 3 && clean) {
    const cl = pool.find(o => o.p.role === 'CL'); if (cl) { pickI = cl.i; why = '終結者登板'; }
  }
  if (!why && !justChanged && !reserve && faced >= 3 && p.role !== 'CL' && nb && (nb.hand === 'L' || nb.hand === 'R') && (t.mchg || 0) < Math.max(1, Math.floor(G.innings / 3))) {
    const lev = (risp ? 1 : 0) + (nR > 0 ? .4 : 0) + (G.inning >= G.innings - 1 && Math.abs(diff) <= 2 ? 1 : 0);
    const edge = nb.hand === 'L' && p.hand === 'R' ? 'L' : (nb.hand === 'R' && p.hand === 'L' && lev >= 1.4 ? 'R' : '');
    if (edge && lev >= 1 && strengthOf(nb) >= 57 && mood < 62 && Math.random() < (edge === 'L' ? .55 : .3)) {
      const cands = pool.filter(o => o.p.hand === edge && o.p.role === 'RP' && (o.p.fatigue || 0) < 30 && rel(o.p) >= rel(p) - 8).sort((a, b) => rel(b.p) - rel(a.p));
      if (cands.length) { pickI = cands[0].i; why = edge === 'L' ? '針對左打者換左投' : '針對右打者換右投'; t.mchg = (t.mchg || 0) + 1; }
    }
  }
  if (!why) return;
  const i = pickI >= 0 ? pickI : chooseReliever(sideIdx, nb);
  if (i >= 0) changePitcher(sideIdx, i, false, why);
}
function aiPinch() {
  const side = G.half; if (G.human === side || !lvl().learn || G.over) return; const t = battingTeam(); if (!t.bench || !t.bench.length) return;
  const b = curBatter(); if (b.slot === undefined || b.isPitcherBat) return;
  const lev = ((G.on[1] || G.on[2]) && G.outs < 2 ? 1 : 0) + (Math.abs(runDiff(side)) <= 2 ? .6 : 0);
  if (G.inning >= Math.max(3, G.innings - 2) && lev >= 1.2 && Math.random() < .5) {
    const c = t.bench.filter(x => !x.out && fitPenalty(x.nat, b.pos) <= .13 && b.pos !== 'C'); c.sort((a, z) => strengthOf(z) - strengthOf(a));
    if (c[0] && strengthOf(c[0]) > strengthOf(b) + 8) { const s2 = subInto(side, b, c[0]); if (s2) { say(`代打！${sideName(side)}換上 <em>${s2.name}</em> 代替 ${b.name}`); toast('代打', '#fff', '#39f'); G.log.push('代打'); } return; }
  }
  if (G.inning >= Math.max(3, G.innings - 2) && lev >= .6 && Math.random() < .35 && b.pos !== 'C') {      // 左右打對決：同手打者換上較佔優勢的板凳
    const ph = curPitcher();
    if (b.hand === ph.hand && b.hand !== 'S') { const c = t.bench.filter(x => !x.out && x.hand !== ph.hand && fitPenalty(x.nat, b.pos) <= .13 && strengthOf(x) >= strengthOf(b) - 4).sort((a, z) => strengthOf(z) - strengthOf(a))[0];
      if (c) { const s2 = subInto(side, b, c); if (s2) { say(`${sideName(side)}看準左右對決，換上 <em>${s2.name}</em> 代打 ${b.name}`); toast('代打', '#fff', '#39f'); G.log.push('代打'); return; } } }
  }
  if (G.on[0]) {
    const r = G.on[0]; if (r && r.pl.spd < 52 && G.inning >= G.innings - 1 && G.outs < 2 && Math.abs(runDiff(side)) <= 1 && Math.random() < .55) {
      const c = t.bench.filter(x => !x.out && x.spd >= 74 && fitPenalty(x.nat, r.pl.pos) <= .13).sort((a, z) => z.spd - a.spd)[0];
      if (c) { const old = r.pl, s2 = subInto(side, old, c); if (s2) { r.pl = s2; r.spd = (5.6 + s2.spd * .036) * MOVEK; r.rig.limp = 0; say(`代跑！${s2.name}代替 ${old.name} 站上一壘`); } }
    }
  }
}
function aiIntentionalWalk() {
  if (G.intWalk) return true; if (humanPitches()) return false; const L = lvl(); if (L.learn < 1) return false;
  const b = curBatter(), t = battingTeam(), nxt = t.lineup[(G.bi[G.half] + 1) % 9], out = G.outs, diff = runDiff(1 - G.half);
  if (G.on[0] || out === 2 && !G.on[1] && !G.on[2]) { if (G.on[0]) return false; }
  if (!(G.on[1] || G.on[2])) return false; if (G.on[0]) return false;
  if (!lateGame() && !(G.on[1] && G.on[2])) return false;
  if (diff < -1 || diff > 3 && !(G.on[1] && G.on[2])) return false;
  if (strengthOf(b) - strengthOf(nxt) < 14 || strengthOf(b) < 72) return false;
  if (out === 2 && G.on[2] && !G.on[1]) return Math.random() < .3;
  return out < 2 ? Math.random() < .55 : true;
}

