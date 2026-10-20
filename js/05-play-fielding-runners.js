/* ===== 05-play-fielding-runners.js ｜ 球進場內：守備計畫／傳球／跑者／觸殺／出局處理 =====
   載入順序 5/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
'use strict';
/* =====================================================================
   Part 4b: ball in play — fielding plan, throws, runners, outs
   ===================================================================== */
let PL = null;
const _tmp = new V3();
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const baseSpot = b => BASES[b % 4];
function formationPos(pos) { const d = DEFAULT_POS[pos]; const s = G.shift && G.shift[pos]; return s ? { x: d.x + s.x, z: d.z + s.z } : d; }
function resetFormation(snap) {
  for (const pos of POS_LIST) { const f = E.F[pos], p = formationPos(pos); f.tx = p.x; f.tz = p.z; f.sp = 4.2; f.cover = null; f.hasBall = false; f.dive = false; f.wait = 0; if (snap) { f.x = p.x; f.z = p.z; } }
}
function moundY(x, z) { const d = Math.hypot(x - MOUND.x, z - MOUND.z); return d <= 2.3 ? .38 : d < 2.9 ? .38 * (2.9 - d) / .6 : 0; }      // 投手丘表面高度（圓台：頂面半徑 2.3、底部半徑 2.9）
function moveFielder(f, dt) {
  const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz), rig = f.rig;
  if (f.busy > 0) { f.busy -= dt; }
  if (f.wait > 0 && f.chaser && PL && PL.state === 'flight' && PL.ballPos && dist2(f.x, f.z, PL.ballPos.x, PL.ballPos.z) < 6) f.wait = 0;      // 球已在身邊：立刻動作
  if (f.wait > 0) { f.wait -= dt; rig.run = 0; if (rig.stride && (!rig.anim || rig.anim.name !== 'pitch')) rig.stride = Math.max(0, rig.stride - dt * 2.2); rig.root.position.x = f.x; rig.root.position.z = f.z + (rig.stride || 0); if (!(rig.anim && rig.anim.name === 'dive')) rig.root.position.y = moundY(rig.root.position.x, rig.root.position.z); return; }       // 反應時間（看球／起步判斷）
  f.v = f.v || 0;
  if (d > 0.06 && !(f.hold > 0)) {
    const sp = f.sp || 4, acc = 12 + (f.pl.fld || 55) * .05;
    const vt = Math.min(sp, Math.sqrt(2 * acc * d) + .6);                                   // 接近目標時自然減速
    f.v += clamp(vt - f.v, -acc * 1.5 * dt, acc * dt);                                      // 加速度 → 起跑／煞車更流暢
    const st = Math.min(d, f.v * dt); f.x += dx / d * st; f.z += dz / d * st;
    const ty = (f.pos === 'C' && !PL) ? Math.atan2(-f.x, MOUND.z - f.z) : Math.atan2(dx, dz); let dy = ty - rig.root.rotation.y;      // 捕手擊球前即使橫移接球也面向投手
     dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rig.root.rotation.y += dy * Math.min(1, dt * 14);   // 平滑轉身
    rig.run = f.v > 5 ? 1.4 : f.v > .8 ? .6 : 0;
    if (rig.anim && (rig.anim.name === 'stance' || rig.anim.name === 'crouch') && f.pos !== 'C') rig.anim = null;
  } else { f.v *= Math.max(0, 1 - dt * 9); rig.run = 0; if (f.hold > 0) f.hold -= dt; }
  if (rig.stride) { if (!rig.anim || rig.anim.name !== 'pitch') rig.stride = Math.max(0, rig.stride - dt * 2.2); }
  rig.root.position.x = f.x; rig.root.position.z = f.z + (rig.stride || 0);
  if (!(rig.anim && rig.anim.name === 'dive')) rig.root.position.y = moundY(rig.root.position.x, rig.root.position.z);
}
function fieldFace(f, dt) {                  // 野手站定時的朝向：未擊球＝全員看打者；球打出後＝全員看球（球在誰手上就看誰）
  const rig = f.rig; if (!rig || G.mode !== 'play' || G.phase === 'pickoff' || rig.run > 0 || f.hasBall || (f.v || 0) > .8) return;
  if (rig.anim && rig.anim.name !== 'stance' && !(f.pos === 'C' && rig.anim.name === 'crouch')) return;
  let tx, tz;
  if (PL) { tx = ballMesh.position.x; tz = ballMesh.position.z; }
  else if (f.pos === 'C') { tx = 0; tz = MOUND.z; }          // 捕手面向投手
  else { tx = E.bat ? E.bat.x : 0; tz = 0; }          // 投手也一樣：沒動作時一律轉回面向打者
  const dx = tx - f.x, dz = tz - f.z; if (dx * dx + dz * dz < .25) return;
  let dy = Math.atan2(dx, dz) - rig.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rig.root.rotation.y += dy * Math.min(1, dt * 9);
}
function idleFace(f) { if (f.rig.run === 0 && PL === null) { const t = G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight'; if (t) faceRig(f.rig, f.pos === 'P' ? 0 : 0, f.pos === 'P' ? 3 : 0); } }

/* ---------------- start a ball in play ---------------- */
function launchBall(res, pt) {
  if (res.sty === undefined) { res.sty = pickBatStyle(res); shapeBatted(res); }
  const a = res.ang * Math.PI / 180, th = res.th * Math.PI / 180;
  const v0 = new V3(res.ev * Math.cos(a) * Math.sin(th), res.ev * Math.sin(a), -res.ev * Math.cos(a) * Math.cos(th));
  const p0 = res.px !== undefined ? new V3(clamp(res.px, -1.6, 1.6), clamp(res.py, .25, 1.9), clamp(res.pz, -1.2, .05)) : new V3(pt ? clamp(pt.fx * .9, -1.6, 1.6) : 0, pt ? clamp(pt.fy, .25, 1.9) : .95, -0.05);
  const env = ballEnv(res), sim = simulateBall(p0, v0, 12, env), cl = classifyBatted(sim);
  const hang = (() => { let m = 0; for (const s of sim.S) if (s.y > m) m = s.y; return m; })();
  const kind = res.bunt ? 'bunt' : res.ang < 8 ? 'gb' : res.ang < 20 ? (hang < 9 ? 'ld' : 'fb') : res.ang < 42 ? 'fb' : 'pu';
  PL = { id: ++G.playId, res, sim, cl, kind, t: 0, state: 'flight', holder: null, thr: null, plan: null, fair: cl.fair, foul: !cl.fair && !cl.hr, bunt: !!res.bunt, err: false, fc: false, outsMade: 0, runsMade: 0, batterOut: false, tAge: 0, loose: null, announced: false, env, luck: res.luck || 0, hang };
  PL.dist = Math.max(...sim.S.map(s => Math.hypot(s.x, s.z)));
  const lp = sim.over || sim.first; PL.land = lp ? { d: Math.hypot(lp.x, lp.z), t: lp.t } : null;
  const plan = planFielding(sim, cl, PL.foul, res);
  if (plan.robHR) cl.hr = false;                                           // 全壘打被跳起來抓走！
  PL.plan = plan;
  if (plan.kind === 'hr' && plan.miss && !plan.grd) { const mf = plan.miss, pl0 = PL, ot = (sim.over && sim.over.t) || 2, weakHit = (res.ev || 99) < 41; after(Math.max(.25, ot - .3), () => { if (PL !== pl0) return; mf.rig.anim = { name: 'catch', t: 0, dur: .5, opt: {} }; toast('差一點就攔下！', '#fff', '#8a5ad8'); say(`<em>${POS_FULL[mf.pos]}${mf.pl.name}貼牆躍起、伸長了手套…</em>${weakHit ? '球就在手套上方飛過牆頭，剛好出去的全壘打！' : '球差一點點就被攔下，還是飛出了全壘打牆！'}`, 3200); } ); }
  const rv = plan.robHR ? null : absReviewSetup(sim, cl, plan);
  G.phase = 'inplay';
  if (sim.pud) { const plp = PL; after(Math.max(.2, sim.pud.t), () => { if (PL === plp) { toast('積水！球停住了', '#fff', '#3a8ad8'); flowSfx('bounce', .5); } }); }
  setBall(sim.S[0], true, '#fff');
  maybeInjureOnBall(res, plan);
  { const sm = sim, pl0 = PL; const note = res.broken ? ['斷棒！', '#fff', '#c84'] : res.tip ? [res.tipText || '擦棒高飛', '#fff', '#68a'] : (sm.hug && cl.fair) ? ['貼線球！', '#fff', '#2a8'] : sm.chop ? ['高彈跳球', '#fff', '#a5f'] : sm.bagHit ? ['碰到壘包！', '#fff', '#a5f'] : sm.bumps ? ['不規則滾地球', '#fff', '#a5f'] : sm.wallTop ? ['擦牆頭！', '#fff', '#e83'] : (sm.sty && STY_NOTE[sm.sty]) ? STY_NOTE[sm.sty] : null;
    if (note) after(.7, () => { if (PL === pl0) toast(note[0], note[1], note[2]); }); }
  if (rv) { absReviewLaunch(rv, plan); return; }
  if (PL.foul) {
    recallRunners();
    if (plan.kind === 'catch') { /* foul fly caught */ assignRoles(plan); } else { PL.t = 0; for (const f of Object.values(E.F)) { if (plan.f === f) { f.tx = plan.x; f.tz = plan.z; f.sp = fspeed(f) * 1.2; f.wait = plan.react || .3; } } }
    flowOnContact(PL); return;
  }
  launchFair(plan, cl);
}
function launchFair(plan, cl, fin) {
  const sim = PL.sim;
  const br = makeBatterRunner(); PL.br = br;
  if (cl.grd && !cl.hr) {      // 場地規則二壘安打：球彈出場外成死球，打者與所有跑者各安全進 2 個壘
    for (let i = 2; i >= 0; i--) { const r = G.on[i]; if (!r) continue; r.goal = Math.min(4, i + 3); r.state = 'run'; r.from = i + 1; r.to = i + 2; r.s = (r.lead || 0) / BASE_LEN; r.dir = 1; r.isForce = true; G.on[i] = null; }
    for (const r of E.runners) { if (r !== br && r.state === 'run' && r.goal < 4) { r.goal = Math.min(4, Math.max(r.from, 0) + 2); r.dir = 1; r.isForce = true; r.stall = 0; } }
    br.goal = 2; plan.kind = 'hr'; plan.grd = true; PL.grd = true; const pl0 = PL, ot = (sim.over && sim.over.t) || 2; after(pl0.review ? .05 : Math.max(.4, ot), () => { if (PL === pl0) { toast('球彈出場外！場地規則二壘安打', '#fff', '#2a7ad8'); flowSfx('cheer', 1.6); crowdCheer(1.2); } });
  } else
  if (cl.hr) { for (let i = 2; i >= 0; i--) { const r = G.on[i]; if (!r) continue; r.goal = 4; r.state = 'run'; r.from = i + 1; r.to = i + 2; r.s = (r.lead || 0) / BASE_LEN; r.dir = 1; r.isForce = true; G.on[i] = null; } for (const r of E.runners) { if (r !== br && r.state === 'run' && r.goal < 4) { r.goal = 4; r.dir = 1; r.isForce = true; r.stall = 0; } } br.goal = 4; br.spd *= .86; plan.kind = 'hr'; }
  setupForced();
  if (plan.air && plan.kind === 'catch') recallRunners();
  assignRoles(plan);
  if (fin) fin(); else flowOnContact(PL);
}
const AIR_SPD = 1.14;      // 外野手追空中球時的衝刺倍率（追飛球全速跑，比一般跑位快）
function planFielding(sim, cl, foul, res) {
  const S = sim.S, list = Object.values(E.F), luck = res ? res.luck : 0;
  const firstT = sim.first ? sim.first.t : 99;
  if (sim.over && (cl.hr || cl.grd)) {                           // home run / 場地規則二壘安打 : outfielder to the wall
    const o = sim.over; let best = null, bd = 1e9;
    for (const p of ['LF', 'CF', 'RF']) { const f = E.F[p]; const d = dist2(f.x, f.z, o.x, o.z); if (d < bd) { bd = d; best = f; } }
    const wr = wallRadius(o.phi) - 1.2, k = wr / Math.hypot(o.x, o.z); let missF = null;
    const ROBY = WALL_H + .8;      // 擦牆頭的球（高度在牆頂上 0.8 m 內）：外野手可攀牆探手搶救
    if (best && o.y < ROBY && !foul && !cl.grd) {                  // 擦著牆頭的球：外野手有機會跳起來把全壘打抓回來
      const fl = best.pl.fld || 55, spd = fspeed(best), react = .42 - fl * .0012 + Math.abs(gauss()) * .06;
      const need = react + spd / (2 * (12 + fl * .05)) + Math.max(0, dist2(best.x, best.z, o.x * k, o.z * k) - 1.0) / spd, margin = o.t - need;
      if (margin > -.1) {
        const weak = res ? clamp((41 - (res.ev || 41)) / 6, 0, 1) : 0;      // 沒打得很扎實的全壘打（初速偏低、剛好過牆）更容易被攔下
        const pr = best.pl.ultra ? .85 : clamp((.04 + margin * .34 + (fl - 60) * .003 + (spd - 6.5) * .02 + (ROBY - o.y) * .22 + weak * .1 - luck * .04) * fancyK(), 0, .5);      // 守備、腳程越好越容易；本場精彩守備已多時會遞減（避免太常出現）
        if (Math.random() < pr) return { kind: 'catch', f: best, x: o.x * k, z: o.z * k, t: o.t, air: true, dive: true, great: true, robHR: true, react, y: o.y, weakHR: weak > .35 };
        if (pr > .03 && Math.random() < .75) missF = best;      // 有跳起來、但差一點點沒搆到
      }
    }
    return { kind: 'hr', grd: !!cl.grd, f: best, x: o.x * k, z: o.z * k, t: o.t, air: true, over: o, react: .3, miss: missF };
  }
  const limit = (x, z) => Math.hypot(x, z) < wallRadius(Math.atan2(x, -z) * 180 / Math.PI) - 0.3;
  // 強勁擊球係數：初速越快、仰角越低（滾地／平飛強襲），野手能判斷的時間越短、可伸手的範圍越小 → 強打者的球更容易穿越或落地成安打
  const hardK = (res && !res.bunt ? clamp(((res.ev || 25) - 27) / 15, 0, 1) * (res.ang < 24 ? 1 : .3) : 0) + (res && res.thru ? .38 : 0) + (res && (res.sty === 'rocket' || res.sty === 'line') ? .1 : 0);      // 強襲穿越球：手套範圍更小、反應時間更短
  const cands = [];
  for (const f of list) {
    const fl = f.pl.fld || 55, spd = fspeed(f) * 1.0, lag = spd / (2 * (12 + fl * .05)), isOF = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF';
    const readErr = (1 + nightK() * .1 + hazeK() * .12) * Math.abs(gauss()) * Math.max(.02 * windK(), .17 - fl * .0014 + windK() * .09) * (res && res.ang > 14 ? 1 + windK() * 1.1 : .35);     // 風大時高飛球更難判斷落點（風向風速仍在變化→守備差的更吃虧）     // 判斷落點的失誤（守備差、高飛球更明顯）
    let react = (isOF ? .40 : .40) - fl * .0018 + readErr * (res && res.ang >= 6 && res.ang < 24 ? 1 + hardK * .9 : 1) + lag + rainK() * .05 - (G.lv >= 3 && G.human !== 1 - G.half ? .035 : 0);
    react += hardK * (.07 + (1 - clamp(fl / 85, 0, 1)) * .09) + clamp(gauss() * .06, -.12, .14) + (Math.random() < .045 + (1 - clamp(fl / 100, 0, 1)) * .04 ? .06 + Math.random() * .16 : 0);      // 起步好壞不一，偶爾判斷失誤慢半拍；強勁球看不清＋每次起跑好壞不同（好的起跑能多救一顆、差的起跑會慢半拍）
    const pNB = f.pos === 'P' && !(res && res.bunt);      // 投手投完球重心在前、站位又離打者近：強勁平飛球／直擊球很難處理，高飛球交給內野手與捕手
    if (pNB) { react += 0.12 + hardK * 0.3; if (res && res.ang >= 42) continue; }
    const ult = !!f.pl.ultra, reach = ult ? 2.6 : (pNB ? 0.7 : 1.2) - hardK * .34;      // 傳說球員：手套範圍超大、不受強勁球影響                                                                  // 球速越快，手套實際能構到的範圍越小
    if (res && res.bunt) { react += (f.pos === 'P' ? .06 : 0); if (res.sneak) react += (.06 + Math.abs(gauss()) * .06) * (aiExpectBunt() ? .5 : 1) * (1.15 - fl * .004); }   // 投手剛投完球重心未穩；奇襲短打讓全隊來不及反應
    let got = null, dive = null, sup = null;
    const slack = Math.random() < .45 ? Math.random() * .22 : 0;      // 邊緣球：野手可能判斷／衝刺差一點點，球落在身前（不再是『算得到就一定接到』）
    const wT = sim.wallT || 1e9;
    for (let i = 0; i < S.length; i += 2) {
      const s = S[i]; if (sim.over && s.t > sim.over.t) break;
      // 外野全壘打牆邊：球在碰牆前，外野手可貼牆接殺（球高度超過 2.8m 要起跳攀牆，成功率看守備能力與球高）；碰牆之後的球算地滾球
      const rad = Math.hypot(s.x, s.z), wr = wallRadius(Math.atan2(s.x, -s.z) * 180 / Math.PI), nearWall = rad > wr - 2.4 && s.t <= wT + .02;
      const leap = s.y > 2.8 && s.y <= WALL_H + .5 && nearWall;
      if (s.y > 2.8 && !leap) continue;
      let sx = s.x, sz = s.z;
      if (!limit(sx, sz) && !foul) { if (rad <= wr + .7 && s.t <= wT + .05) { const k = (wr - .9) / rad; sx *= k; sz *= k; } else continue; }
      if (f.pos === 'C' && s.z < -2.5) continue;
      if (f.pos === 'C' && res && res.foulTip) continue;
      let d = dist2(f.x, f.z, sx, sz); if (G.tacGap && s.y < 1.2 && (f.pos === '1B' || f.pos === '2B' || f.pos === 'SS' || f.pos === '3B') && !(res && res.bunt)) d += G.tacGap; if (f.pos === 'C' && res && res.bunt) d = Math.max(0, d - 2.2);          // 捕手蹲在本壘後方，短打球／小飛球近在眼前
      const back = res && res.ang >= 14 ? Math.max(0, Math.hypot(sx, sz) - Math.hypot(f.x, f.z)) * .012 : 0;      // 往後退著跑／轉身追球比較慢
      const sp = (s.t < firstT - .02 && s.t <= wT + .02) ? spd * AIR_SPD : spd, ov1 = Math.max(0, d - reach), ov2 = pNB ? 99 : Math.max(0, d - (ult ? 6.0 : 2.3 - hardK * .45)), ov3 = pNB ? 99 : Math.max(0, d - (ult ? 8.0 : 3.0 - hardK * .6));      // 投手不能飛身撲接／極限伸展
      const need = react * clamp(ov1 / 1.4, 0, 1) + ov1 / sp + (leap ? .22 : 0) + (ov1 > 0 ? back : 0);      // 球在手套範圍內＝野手本來就站在那裡，不需要起步反應；範圍外才要判斷＋起跑＋跑到
      const airOk = s.t < firstT - .02 && s.t <= wT + .02;
      if (leap) { if (!dive && need <= s.t && airOk) dive = { f, t: s.t, x: sx, z: sz, air: true, dive: true, leap: true, y: s.y, react: react - lag }; continue; }
      if (!got && need + slack <= s.t) { got = { f, t: s.t, x: sx, z: sz, air: airOk, dive: false, y: s.y, react: react - lag }; break; }
      if (!dive) { const need2 = react * clamp(ov2 / 1.4, 0, 1) + ov2 / sp + (ov2 > 0 ? back : 0); if (need2 <= s.t && s.t > .35) dive = { f, t: s.t, x: sx, z: sz, air: airOk, dive: true, y: s.y, react: react - lag }; }
      if (!sup) { const need3 = react * clamp(ov3 / 1.4, 0, 1) + ov3 / sp + (ov3 > 0 ? back : 0); if (need3 <= s.t && s.t > .5 && s.y < 2.4) sup = { f, t: s.t, x: sx, z: sz, air: airOk, dive: true, y: s.y, react: react - lag, superTry: true }; }
    }
    if (got) cands.push(got); else if (dive) cands.push(dive); else if (sup) cands.push(sup);
  }
  if (cands.length) {
    const pPen = c => c.f.pos === 'P' && !(res && res.bunt) && dist2(c.x, c.z, c.f.x, c.f.z) > 4.5 ? .14 : 0;      // 同樣趕得到時，優先讓內野手處理
    cands.sort((a, b) => (a.t + (a.dive ? .25 : 0) + pPen(a)) - (b.t + (b.dive ? .25 : 0) + pPen(b)));
    let c = cands[0];
    if (c.dive) {
      const fl = c.f.pl.fld || 55;
      const p = c.f.pl.ultra ? .97 : c.leap ? clamp(.26 + fl * .004 - (c.y - 2.8) * .38 + luck * .03 - rainK() * .12, .04, .75) : clamp((c.superTry ? .03 + fl * .003 : .38 + fl * .0035) + luck * .03 - rainK() * .12 - stormK() * .1, .03, .8);
      if (Math.random() > (c.f.pl.ultra ? p : p - hardK * .10)) { // dive fails : ball goes through, next chaser
        const rest = cands.filter(x => x !== c && !x.dive);
        c.failedDive = true; if (rest.length) { c = rest[0]; c.failDive = cands[0]; } else { c = chasePlan(sim, S, list, foul); c.failDive = cands[0]; }
      } else c.great = true;                                       // 飛身撲接／極限伸展成功＝精彩守備
    }
    if (c.f.pl.ultra && !c.dive && !c.failedDive && c.t > .5 && Math.random() < .65) { c.dive = true; c.great = true; }      // 傳說球員：大機率以飛身撲接／美技處理球
    c.kind = c.air ? 'catch' : 'field'; if (!c.air && c.kind === 'field' && c.y > 1.2) c.kind = 'field';
    return c;
  }
  return chasePlan(sim, S, list, foul);
}
function rechaseBall(pl) {      // 守備員沒能在預定時間趕到球落點：從「現在」重新找最快能攔到球的人
  const sim = pl.sim, S = sim.S, t0 = pl.t, last = S[S.length - 1], old = pl.plan; let best = null, bt = 1e9;
  for (const f of Object.values(E.F)) {
    if ((f.pos === 'C' || f.pos === 'P') && Math.hypot(last.x, last.z) > 28) continue;
    const spd = fspeed(f) * 1.04; let pick = null;
    for (let i = 0; i < S.length; i += 3) { const s = S[i]; if (s.t < t0 + .05 || s.y > 1.6) continue; if (.15 + dist2(f.x, f.z, s.x, s.z) / spd <= s.t - t0) { pick = { x: s.x, z: s.z, t: s.t }; break; } }
    if (!pick) pick = { x: last.x, z: last.z, t: Math.max(sim.tEnd, t0 + dist2(f.x, f.z, last.x, last.z) / spd + .2) };
    if (pick.t < bt) { bt = pick.t; best = { kind: 'chase', f, x: pick.x, z: pick.z, t: pick.t, air: false, dive: false, react: .05, missed: true }; }
  }
  if (!best) return; if (old && old.f) old.f.chaser = false;
  pl.plan = best; assignRoles(best);
}
function chasePlan(sim, S, list, foul) {
  const last = S[S.length - 1]; let best = null, bt = 1e9;
  for (const f of list) {
    if ((f.pos === 'C' || f.pos === 'P') && Math.hypot(last.x, last.z) > 28) continue;
    const spd = fspeed(f) * 1.04; let pick = null;
    for (let i = 0; i < S.length; i += 3) { const s = S[i]; if (s.y > 1.6) continue; const d = dist2(f.x, f.z, s.x, s.z); if (.3 + d / spd <= s.t) { pick = { x: s.x, z: s.z, t: s.t }; break; } }
    if (!pick) pick = { x: last.x, z: last.z, t: Math.max(sim.tEnd, dist2(f.x, f.z, last.x, last.z) / spd + .3) };
    if (pick.t < bt) { bt = pick.t; best = { kind: 'chase', f, x: pick.x, z: pick.z, t: pick.t, air: false, dive: false, react: .3 }; }
  }
  return best;
}
function assignRoles(plan) {
  const F = E.F, ch = plan.f; const cover = {};
  for (const f of Object.values(F)) { f.cover = null; f.sp = 4.6; f.hold = 0; f.assist = false; }
  ch.tx = plan.x; ch.tz = plan.z; ch.sp = fspeed(ch) * (plan.air && plan.kind === 'catch' ? AIR_SPD : 1); ch.chaser = true; { const w0 = Math.max(0, plan.react !== undefined ? plan.react : .3); ch.wait = (plan.air && plan.kind === 'catch') ? Math.min(w0, .28) : Math.min(w0, .1); }      // 起步反應時間上限：不再呆站著等球經過身旁才追
  for (const f of Object.values(F)) if (f !== ch) f.chaser = false;
  if (plan.dive) ch.dive = true;
  const infieldPlay = Math.hypot(plan.x, plan.z) < 36;
  const gs = (PL && PL.sim && PL.sim.S) ? ballGuess(ch, 6, true, .5) : { x: plan.x, z: plan.z };      // 其他野手只依球的出手方向移動
  const gdx = gs.x, gdz = gs.z;
  const setT = (f, x, z, sp) => { f.tx = x; f.tz = z; f.sp = sp || fspeed(f) * .95; f.wait = .12 + Math.random() * .16 - ((f.pl.fld || 55) - 55) * .002; };
  const near = (a, b) => dist2(a.x, a.z, plan.x, plan.z) < dist2(b.x, b.z, plan.x, plan.z) ? a : b;
  // base coverage
  const b1 = baseSpot(1), b2 = baseSpot(2), b3 = baseSpot(3);
  const used = new Set([ch]);
  const take = (pos, base, dx, dz) => { const f = F[pos]; if (used.has(f)) return null; used.add(f); const b = baseSpot(base); setT(f, b.x + (dx || 0), b.z + (dz || 0)); cover[base] = f; f.cover = base; return f; };
  if (infieldPlay) {
    if (PL.bunt && ch.pos !== '1B' && ch.pos !== '2B') take('2B', 1, -.6, .5);          // 短打：一壘手前衝後，由二壘手補一壘
    else if (ch.pos !== '1B') { if (!take('1B', 1, -.6, .5)) { } else { } if (ch.pos === 'P' || ch.pos === '2B') { } }
    if (ch.pos === '1B') { if (!take('P', 1, -.3, 1.2)) { } }
    const farMI = plan.x > 0 ? F.SS : F['2B']; const nearMI = farMI === F.SS ? F['2B'] : F.SS;
    if (!used.has(farMI)) { used.add(farMI); const b = baseSpot(2); setT(farMI, b.x + (farMI === F.SS ? -.8 : .8), b.z + .4); cover[2] = farMI; farMI.cover = 2; }
    else if (!used.has(nearMI)) { used.add(nearMI); const b = baseSpot(2); setT(nearMI, b.x, b.z + .4); cover[2] = nearMI; nearMI.cover = 2; }
    if (!used.has(F['3B'])) take('3B', 3, .5, .5);
    if (!used.has(F.C)) { used.add(F.C); setT(F.C, 0, 1.6, 6); cover[0] = F.C; F.C.cover = 0; } else { cover[0] = ch; }
    if (!used.has(F.P) && ch.pos !== 'P') { used.add(F.P); setT(F.P, MOUND.x + (plan.x > 0 ? 1.5 : -1.5), MOUND.z + .6, 5); }      // 投手只在投手丘附近等待，不再跑離丘
    for (const p of ['LF', 'CF', 'RF']) if (!used.has(F[p])) { used.add(F[p]); const fo = F[p], bx = fo.x * .92 + clamp(plan.x * .3, -6, 6), bz = fo.z * .9; setT(fo, bx, bz, 5); }      // 外野手依球的方向往同側靠攏補位
    if (!cover[1]) cover[1] = F['1B']; if (!cover[3]) cover[3] = F['3B'];
  } else {
    // outfield : relay men
    const relay = plan.x > 0 ? F['2B'] : F.SS; const other = relay === F['2B'] ? F.SS : F['2B'];
    const dx = plan.x, dz = plan.z; const dm = Math.hypot(dx, dz);
    if (!used.has(relay)) { used.add(relay); setT(relay, dx / dm * 30 * .5, dz / dm * 30 * .5 - 10, 6); relay.cover = 'relay'; cover.relay = relay; }
    if (!used.has(other)) { used.add(other); const b = baseSpot(2); setT(other, b.x, b.z + .5); cover[2] = other; other.cover = 2; }
    take('3B', 3, .5, .5); take('1B', 1, -.6, .5);
    if (!used.has(F.C)) { used.add(F.C); setT(F.C, 0, 1.6, 6); cover[0] = F.C; F.C.cover = 0; }
    if (!used.has(F.P)) { used.add(F.P); setT(F.P, MOUND.x, MOUND.z, 5); }      // 外野方向的球：投手留在投手丘，不再繞到本壘後方
    for (const p of ['LF', 'CF', 'RF']) if (!used.has(F[p])) {      // 其他外野手：看球的方向立刻往落點靠攏，站在追球者後方補位（後援），而非往內側跑
      used.add(F[p]); const fo = F[p], k = .55, tx0 = lerp(fo.x, plan.x, k), tz0 = lerp(fo.z, plan.z, k), n = Math.hypot(tx0, tz0) || 1, ow = wallRadius(Math.atan2(tx0, -tz0) * 180 / Math.PI) - 3, rr = Math.min(n + 4, ow), kk = rr / n;
      setT(fo, tx0 * kk, tz0 * kk, fspeed(fo) * .98); fo.wait = Math.min(fo.wait, .16);
    }
    if (!cover[2]) cover[2] = F.SS; if (!cover[1]) cover[1] = F['1B']; if (!cover[3]) cover[3] = F['3B'];
  }
  PL.cover = cover;
  if (!PL.foul && !(PL.res && PL.res.bunt) && (plan.kind === 'catch' || plan.kind === 'field')) {      // 協防：附近另一名野手也衝向同一顆球（搶救／補位），有機會與隊友同時靠近
    const noRun = !G.on.some(x => x); let best = null, bd = 1e9;
    for (const f of Object.values(F)) {
      if (f === ch || f.pos === 'C' || f.pos === 'P' || f.cover === 1) continue; if (f.cover && !(plan.air && noRun)) continue;
      const d = dist2(f.x, f.z, plan.x, plan.z); if (d > (plan.air ? 13 : 8) || d < 2) continue;
      if (d / fspeed(f) > (plan.t || 1) + .4) continue; if (d < bd) { bd = d; best = f; }
    }
    if (best && Math.random() < (plan.air ? .55 : .25)) { best.assist = true; best.cover = null; best.tx = gdx + (best.x - gdx) * .1; best.tz = gdz + (best.z - gdz) * .1; best.sp = fspeed(best) * .97; best.wait = .2 + Math.random() * .2; PL.assist = best; }
  }
}

/* ---------------- runners ---------------- */
function makeRunnerFromRig(pl, rig, from) {
  const r = { pl, rig, from, to: from + 1, s: 0, dir: 1, goal: from, state: 'on', spd: 0, lead: 0, leadT: 0, isForce: false, id: ++G.runnerId || (G.runnerId = 1) };
  r.spd = (5.6 + (pl.spd || 55) * 0.036) * MOVEK;       // m/s
  { const k0 = G.inning * 2 + G.half, tmp = pl.limpKey === k0; rig.limp = pl.injLeg ? 1 : tmp ? .7 : 0; if (tmp && !pl.injLeg) r.spd *= pl.limpMul || .85; }       // 腿部受傷：一跛一跛、變慢
  E.runners.push(r); return r;
}
function makeBatterRunner() {
  const b = E.bat; const rig = b.rig; rig.ready = false; if (!rig.anim || (rig.anim.name !== 'swing' && rig.anim.name !== 'bunt')) { rig.bat.visible = false; rig.anim = null; }
  const r = makeRunnerFromRig(b.pl, rig, 0); r.state = 'run'; r.to = 1; r.s = 0; r.goal = 1; r.bat = true; r.isForce = true; r.spd *= 0.97; if (!(PL && PL.bunt)) r.spd *= 1.18;      // 打者衝一壘全力奔跑（滾地球內野安打更合理）
  r.pos = { x: b.x, z: b.z }; r.pre = (rig.anim && rig.anim.name === 'swing') ? 0.22 : (PL && PL.bunt ? clamp((PL.res.sneak ? .08 : .13) + (b.side > 0 ? .05 : 0) + (60 - (b.pl.bunt || 60)) * .002, .05, .28) : 0.12); if (PL && PL.bunt) r.spd *= (PL.res.sneak ? .96 : .93);      // 觸擊：打者要先收棒轉身，實際起跑與加速比一般跑者慢（約 4.2 秒到一壘的水準）                       // short start delay (swing recovery)
  E.bat = null; return r;
}
function setupForced() {
  // chain of forced runners
  const on = G.on; let chain = true;
  for (let i = 0; i < 3; i++) {
    const r = on[i]; if (r && chain) { r.isForce = true; r.goal = Math.max(r.goal, i + 2); r.state = 'run'; r.to = i + 2; r.from = i + 1; r.s = r.lead / BASE_LEN; r.dir = 1; on[i] = null; }
    else if (r) { chain = false; r.isForce = false; } else chain = false;
  }
}
function runnerXZ(r, out) {
  const a = baseSpot(r.from), b = baseSpot(r.to);
  if (r.bat && r.from === 0 && r.s === 0 && r.pre > 0) { out.x = r.pos.x; out.z = r.pos.z; return out; }
  if (r.state === 'on') { const n = baseSpot(r.from + 1), L = r.lead || 0, d = BASE_LEN; out.x = a.x + (n.x - a.x) / d * L; out.z = a.z + (n.z - a.z) / d * L; return out; }
  out.x = lerp(a.x, b.x, r.s); out.z = lerp(a.z, b.z, r.s); return out;
}
const _rp = { x: 0, z: 0 };
function wantSlide(r) {      // 接近壘包時要不要滑壘（每個壘包只決定一次）：積極搶壘＝多數跑者都會滑；跑速太慢的人才正常跑過去；越快越早滑
  if (r.dir < 0 || r.to < 1 || r.to > 4 || r.s < .5) return false;
  const spd = r.pl.spd || 55; if (spd < 42) return false;
  const sd = clamp(2.1 + (spd - 50) * .035, 1.7, 3.8) / BASE_LEN;
  if (1 - r.s > sd) return false;
  if (r.slideTo === r.to) return !!r.slideYes;
  r.slideTo = r.to;
  const thrownHere = !!(PL && PL.state === 'thrown' && PL.thr && !PL.thr.relay && PL.thr.b % 4 === r.to % 4);
  let p;
  if (r.stealRun) p = 1;
  else if (!PL || PL.done || (PL.plan && PL.plan.kind === 'hr')) p = .08;      // 全壘打慢跑、沒有守備動作時不滑
  else {
    p = clamp(.62 + (spd - 55) * .02, .3, .96);
    if (thrownHere) p += .3; else if (PL.state === 'held' || PL.state === 'thrown') p += .15;
    if (r.goal > r.to) p *= .4;                                   // 還要繼續往下一壘跑：不滑，直接衝
    if (r.to === 1) p = r.bat ? (thrownHere ? .72 : (PL.state === 'held' || PL.state === 'thrown') ? .4 : .1) : p;      // 打者上一壘：球正傳向一壘（close play）時多半會撲壘
  }
  r.slideYes = Math.random() < clamp(p, 0, 1);
  if (r.slideYes) {      // 滑壘方式：打者上一壘＝頭部先撲；本壘／其他壘包多半腳先滑，偶爾頭部先滑（跑越快、越搶時間越愛撲）
    const close = thrownHere || (PL && PL.state === 'thrown');
    r.slideHF = r.to === 1 ? Math.random() < (close ? .85 : .5) : r.to === 4 ? Math.random() < .28 : Math.random() < (.22 + (r.stealRun ? .18 : 0) + (close ? .12 : 0));
  }
  return r.slideYes;
}
function startSlide(r) {
  const spd = r.pl.spd || 55; r.sliding = true;
  r.slideReach = clamp(.28 + (spd - 50) * .012, .2, .8) / BASE_LEN;      // 腳（手）先伸到壘包：跑得越快滑得越遠 → 搶到少許時間，盜壘成功率小幅提高
  r.rig.run = 0; r.rig.anim = { name: r.slideHF ? 'hdive' : 'slide', t: 0, dur: r.slideHF ? .95 : 1.05, opt: {} }; r.dustT = 0;
  try { const p = runnerXZ(r, { x: 0, z: 0 }); spawnBurst(p.x, .15, p.z, .5 + clamp((spd - 50) * .012, 0, .6), '#c9a06a'); powderPuff(p.x, .12, p.z, 7, .5, 0, .3, 1.2, .35); flowSfx('swing', .5); if (spd >= 72) crowdCheer(.3); } catch (e) { }
}
function updateRunners(dt) {
  for (const r of E.runners) {
    if (r.sliding && r.state !== 'run' && !(r.rig.anim && (r.rig.anim.name === 'slide' || r.rig.anim.name === 'hdive'))) r.sliding = false;
    if (r.sliding && r.state === 'run') { r.dustT = (r.dustT || 0) - dt; if (r.dustT <= 0) { r.dustT = .07; try { runnerXZ(r, _rp); spawnBurst(_rp.x + (Math.random() - .5) * .5, .1 + Math.random() * .15, _rp.z + (Math.random() - .5) * .5, .28 + Math.random() * .22, '#c9a06a'); } catch (e) { } } }
    if (r.state === 'out' || r.state === 'home') { r.fadeT = (r.fadeT || 0) + dt; if (r.fadeT > 1.2 && r.rig.root.visible) r.rig.root.visible = false; continue; }
    if (r.state === 'on') {   // lead ramp
      const live = (G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight') && !PL, hold = G.phase === 'pickoff' && r.pkHold;      // 牽制進行中：跑者維持離壘，直到投手球出手後才反應回壘（不再球一投出去就瞬間縮回壘包、卻仍被判出局）
      const want = (live || hold) ? (r.leadMax ? effLead(r) : 0) : 0, rate = G.phase === 'pickoff' && r.pkRate ? r.pkRate : 3;
      r.lead += clamp(want - r.lead, -rate * dt, 3 * dt);
    } else if (r.state === 'run') {
      if (r.stall > 0) { r.stall -= dt; runnerXZ(r, _rp); r.rig.root.position.set(_rp.x, 0, _rp.z); if (r.stall <= 0) { r.rig.anim = null; r.slipped = false; } continue; }
      const blk = r.dir > 0 && r.to >= 1 && r.to <= 3 && !r.isForce && !r.bat && stealBlocked(r), wt = blk && r.earlyGo && !PL && G.phase !== 'result'; r.waiting = wt;
      if (wt && r.s >= .9) { r.s = .9; r.rig.run = 0; runnerXZ(r, _rp); r.rig.root.position.set(_rp.x, 0, _rp.z); const nb2 = baseSpot(r.to); faceRig(r.rig, nb2.x, nb2.z); continue; }      // 下一壘的人沒推進：停在壘前等他離開（這時被刺殺＝盜壘失敗）
      if (blk && !wt) {      // 前面壘包有人沒動：盜壘跑者必須折返、趕在球到前回到原壘，否則被傳殺出局
        r.dir = -1; r.goal = r.from; r.ret = true; r.pre = 0; r.accT = stealRamp(r); if (r.sliding) { r.sliding = false; r.rig.anim = null; }
        if (!r.blkSaid) { r.blkSaid = true; say(`<em>${r.pl.name}</em>發現前面的壘包有人沒動，趕緊折返！`, 2200); }
      }
      if (r.pre > 0) { r.pre -= dt; r.rig.run = 0; if (r.pre > 0) { runnerXZ(r, _rp); r.rig.root.position.set(_rp.x, 0, _rp.z); continue; } if (r.bat && r.rig.bat) { r.rig.bat.visible = false; r.rig.anim = null; } }
      const ahead = r.dir > 0;
      let rk = 1; if (r.stealer && r.accT !== undefined) { r.accT += dt; rk = .38 + .62 * clamp(r.accT / stealRamp(r), 0, 1); }       // 盜壘起跑：由慢到快加速
      r.s += r.dir * r.spd * rk * (r.dir > 0 ? 1 + Math.min(r.pushN || 0, 10) * .006 : 1) / BASE_LEN * dt;      // 玩家連點「推進」：每點一下跑得稍微更拼（最多約 +6%）
      if (ahead && !r.sliding && wantSlide(r)) startSlide(r);
      if (ahead && r.s >= 1 - (r.sliding ? (r.slideReach || 0) : 0)) { r.s = 1; runnerArrive(r); }
      else if (!ahead && r.s <= 0) { r.s = 0; runnerBack(r); }
    }
    runnerXZ(r, _rp); const rig = r.rig;
    if (r.state === 'run') { faceRig(rig, lerp(baseSpot(r.from).x, baseSpot(r.to).x, clamp(r.s + .2 * r.dir, 0, 1)), lerp(baseSpot(r.from).z, baseSpot(r.to).z, clamp(r.s + .2 * r.dir, 0, 1))); rig.run = 1.5; if (r.sliding) { rig.run = 0; } }
    else { rig.run = 0; if (r.state === 'on') { const n = baseSpot(r.from + 1); faceRig(rig, n.x, n.z); if (!rig.anim) rig.ready = true; } }
    rig.root.position.set(_rp.x, 0, _rp.z);
  }
  reconcileRunners();
}
function reconcileRunners() {
  const occ = {};
  for (const r of E.runners) {
    if (r.state !== 'on' || r.from < 1 || r.from > 3) continue;
    const o = occ[r.from];
    if (!o) { occ[r.from] = r; continue; }
    const keep = G.on[r.from - 1] === r ? r : o, lose = keep === r ? o : r; occ[r.from] = keep; G.on[r.from - 1] = keep; lose.isForce = false; putOut(lose, 'tag');
  }
}
function runnerArrive(r) {
  if (r.earlyGo && !r.bat && !PL && r.to >= 2 && r.to <= 3) { r.earlyGo = false; try { say(SAY.steal(r, true)); toast('盜壘成功！', '#fff27a', '#2a9a3a'); } catch (e) { } }
  r.stealRun = false; r.from = r.to; r.ruledSafe = false; r.reviewed = false; r.arrT = G.clk || 0;
  if (r.from >= 1 && r.from <= 3 && !r.slipped && !r.sliding) maybeSlip(r, r.stealer ? 1.6 : 1);
  if (r.from >= 1 && r.from <= 3) { if (r.stealer) maybeInjureRunner(r, 'slide'); else if (r.bat && r.from === 3) maybeInjureRunner(r, 'sprint'); else if (PL && PL.state === 'thrown') maybeInjureRunner(r, 'slide'); }
  if (r.trot && r.from >= 1 && r.from <= 3) { try { hrBaseFx(r.from); } catch (e) { } }
  if (r.from >= 4) { r.state = 'home'; const hrBat = r.bat && PL && PL.plan && PL.plan.kind === 'hr' && !PL.plan.grd; r.rig.anim = hrBat ? { name: 'cel' + (1 + Math.floor(Math.random() * 7)), t: 0, dur: 2.2 + Math.random() * .9, opt: {} } : { name: 'cheer', t: 0, dur: 1, opt: {} }; r.rig.run = 0; if (hrBat) { r.fadeT = -(r.rig.anim.dur + 1.6); flowSfx('cheer', 2); crowdCheer(1.6); try { hrHomeFx(); } catch (e) { console.error(e); } } scoreRunner(r); return; }
  if (r.goal > r.from && baseFree(r.from + 1, r)) { r.to = r.from + 1; r.s = 0; r.dir = 1; if (r.sliding) { r.sliding = false; r.rig.anim = null; } }
  else if (G.on[r.from - 1] && G.on[r.from - 1] !== r) { r.state = 'on'; r.s = 0; r.to = r.from + 1; putOut(r, 'tag'); }
  else { r.state = 'on'; r.s = 0; r.lead = 0; r.to = r.from + 1; G.on[r.from - 1] = r; r.goal = r.from; if (r.bat) r.bat = false; if (!r.sliding) r.rig.anim = null; }
}
function runnerBack(r) { r.stealer = false; r.stealRun = false; r.accT = undefined; r.state = 'on'; r.s = 0; r.dir = 1; r.lead = 0; r.to = r.from + 1; r.goal = r.from; if (r.from === 0) { r.state = 'out'; return; } G.on[r.from - 1] = r; }
function recallRunners() {          // 界外球／空中接殺：已起跑的跑者（盜壘、強迫進壘）立刻跑回原壘
  for (const r of E.runners) {
    if (r.state !== 'run' || r.bat || r.dir < 0 || r.from < 1) continue;
    r.dir = -1; r.goal = r.from; r.isForce = false; r.ret = true; r.pre = Math.min(r.pre || 0, .1); r.accT = stealRamp(r);
  }
}
function baseFree(b, r) { if (b >= 4) return true; const o = G.on[b - 1]; return !o || o === r; }
function scoreRunner(r) {
  if (r.tag && PL) PL.sacFly = true;
  const t = G.half; G.score[t]++; G.line[t][G.inning - 1] = (G.line[t][G.inning - 1] || 0) + 1;
  if (PL) { PL.runsMade++; G.runsPlay.push(r); }
  r.pl.runsScored = (r.pl.runsScored || 0) + 1;
  flowOnRun(r);
}
function putOut(r, how) {
  if (r.state === 'out' || r.state === 'home') return;
  if (G.outs >= 3) { r.state = 'out'; r.rig.run = 0; r.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; r.fadeT = -.6; for (let i = 0; i < 3; i++) if (G.on[i] === r) G.on[i] = null; return; }      // 第三個出局數已成立，不再多記出局
  const wasForce = r.isForce || r.bat;
  r.state = 'out'; r.rig.run = 0; r.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; r.fadeT = -.6;
  for (let i = 0; i < 3; i++) if (G.on[i] === r) G.on[i] = null;
  G.outs++; if (PL) { PL.outsMade++; if (r.bat) PL.batterOut = true; else PL.fc = true; }
  curPitcher().outs++;
  flowOnOut(r, how, wasForce);
  if (PL && PL.outsMade >= 2) dpNote(PL.outsMade);
}

/* ---------------- ball advance / throws ---------------- */
function throwDur(from, toXZ) { const d = dist2(from.x, from.z, toXZ.x, toXZ.z); return d / armSpeed(from.pl); }
function ballETA(b) {
  const B = baseSpot(b); if (!PL) return 99;
  if (PL.state === 'flight') { const pl = PL.plan; if (pl.kind === 'hr') return 99; const tr = Math.max(0, pl.t - PL.t); const d = dist2(pl.x, pl.z, B.x, B.z); return tr + .26 + d / armSpeed(pl.f.pl) + (d > 48 ? .55 : 0) + (pl.dive ? .5 : 0); }
  if (PL.state === 'held') { const f = PL.holder; const d = dist2(f.x, f.z, B.x, B.z); return .3 + d / armSpeed(f.pl) + (d > 48 ? .5 : 0); }
  if (PL.state === 'thrown') { const t = PL.thr, rem = t.dur - t.t; if (t.b === b % 4) return rem; const d = dist2(t.to.x, t.to.z, B.x, B.z); return rem + .45 + d / armSpeed(t.to.pl); }
  return 2.2 + dist2(PL.loose ? PL.loose.x : 0, PL.loose ? PL.loose.z : 0, B.x, B.z) / 28;
}
function holderThink(f) {
  if (!PL || PL.state !== 'held' || PL.holder !== f || PL.tagChase) return;
  const runners = E.runners.filter(r => r.state === 'run');
  let best = null;
  for (const r of runners) {
    const tb = r.dir > 0 ? r.to : r.from; const b = tb % 4; if (r.dir > 0 && r.to === 4) { /* home */ }
    const rem = r.dir > 0 ? (1 - r.s) * BASE_LEN : r.s * BASE_LEN, tArr = rem / r.spd + (r.pre > 0 ? r.pre : 0);
    const spot = baseSpot(tb); const d = dist2(f.x, f.z, spot.x, spot.z);
    const cov = PL.cover && PL.cover[b]; let recv = cov;
    let tThrow;
    if (recv === f) { tThrow = dist2(f.x, f.z, spot.x, spot.z) / (fspeed(f) * 1.05) + .1; }
    else { if (!recv || recv.chaser) recv = nearestCover(spot.x, spot.z, f); tThrow = (PL.bunt ? clamp(.24 - ((f.pl.fld || 55) - 55) * .002, .14, .32) : .24) + d / armSpeed(f.pl) + (d > 48 ? .5 : 0); }
    if (recv && recv !== f) { const dR = dist2(recv.x, recv.z, spot.x, spot.z); if (dR > 1.8) tThrow = Math.max(tThrow, dR / (fspeed(recv) * 1.1) + .15); }       // 補位的人要先跑到壘包才接得到球
    const margin = tArr - tThrow;
    const prio = (r.isForce ? .12 : 0) + tb * .05 - (tb === 4 && G.outs === 2 ? 0 : 0) + (tb === 4 ? .08 : 0);
    const sc = margin + prio;
    if (!best || sc > best.sc) best = { r, b, tb, margin, sc, recv, self: recv === f, tThrow, tArr };
  }
  if (!best) { return; }
  if (humanDef() && !PL.done) { openAsk(f, best, best); return; }
  { const rd = rundownTarget(f); if (rd) { startTagChase(f, rd); if (PL.tagChase) { PL.tagChase.rd = true; PL.tagChase.n = PL.rdPass || 0; PL.tagChase.pt = .35; } return; } }      // 跑者卡在兩壘之間、回不去也跑不到 → 持球者直接追最近的跑者夾殺
  { const tg = bestTagChase(f); if (tg && aiPrefersTag(f, best, tg)) { startTagChase(f, tg.r); return; } }
  // 第一優先：把球傳到需要防守的壘包（來不及阻殺也要傳，牽制跑者、不讓其他跑者多跑）；遠處野手由中繼員接力
  if (best.self) { f.tx = baseSpot(best.b).x; f.tz = baseSpot(best.b).z; f.sp = selfRunSpeed(f); f.selfTag = best.b; f.hold = 0; PL.selfTag = f; return; }
  throwTo(f, best.recv, best.b, best);
}
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
