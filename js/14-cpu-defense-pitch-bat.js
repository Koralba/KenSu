/* 14-cpu-defense-pitch-bat.js — CPU 腦：守備站位／選球種／打擊（原 script.js 第 3175-3432 行） */
'use strict';
/* =====================================================================
   Part 5: CPU brain  (pitch calling / batting / baserunning / defence / bench)
   ===================================================================== */
const LVL = [      // ctl=控球散佈倍率(越小越準)、wild=暴投倍率、lvAdj=電腦球種等級加減、brk=球威(變化幅度)倍率、spd=球速修正、hit=電腦打者揮棒誤差倍率(越小越會打)
  { name: '弱', noise: 2.0, temp: .9, think: .55, steal: 1.0, sr: .3, srT: .8, hnr: 0, shift: false, learn: 0, mid: 1.3, plain: 1.3, ctl: .62, wild: .3, lvAdj: -1.8, brk: .78, spd: -.035, hit: 1.4 },
  { name: '普通', noise: 1.1, temp: .5, think: .75, steal: .85, sr: .5, srT: .55, hnr: .55, shift: true, learn: .5, mid: .5, plain: .35, ctl: .74, wild: .45, strk: .55, lvAdj: -.4, brk: .93, spd: -.01, hit: 1.05 },
  { name: '強', noise: .7, temp: .28, think: .92, steal: .75, sr: .68, srT: .38, hnr: .85, shift: true, learn: 1, mid: 0, plain: 0, ctl: 1, wild: 1, lvAdj: .6, brk: 1.06, spd: .01, hit: .9 },
  { name: '宗師', noise: .24, temp: .07, think: 1.0, steal: .6, sr: .82, srT: .25, hnr: 1, shift: true, learn: 2.0, mid: 0, plain: 0, ctl: .9, wild: 1, lvAdj: 1.6, brk: 1.2, spd: .025, hit: .75 }
];
const lvl = () => LVL[G.lv];
function phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
function pStrikeAt(tx, ty, sg) {
  const px = phi((ZW + .08 - tx) / sg) - phi((-ZW - .08 - tx) / sg), py = phi((ZC + ZH + .08 - ty) / sg) - phi((ZC - ZH - .08 - ty) / sg);
  return px * py;
}
function outsideDist(x, y) { return Math.max(Math.abs(x) - ZW, Math.abs(y - ZC) - ZH); }
function bhist(b) { return G.batHist[b.name + b.num] || (G.batHist[b.name + b.num] = { sw: 0, chase: 0, balls: 0, whiff: {}, hard: {}, seen: 0, take: 0, strikes: 0, lowChase: 0, highChase: 0 }); }
function strengthOf(b) { return b.con * .5 + b.pow * .45 + b.eye * .1; }
function runDiff(side) { return G.score[side] - G.score[1 - side]; }
function lateGame() { return G.inning >= G.innings - 1; }

/* -------- defensive positioning -------- */
function computeShift() {
  G.shift = {}; G.tacGap = 0; const L = lvl(); if (!L.shift) { applyHumanTactics(); return; }
  const b = curBatter(), runners = G.on, outs = G.outs, def = 1 - G.half, diff = runDiff(def);
  const hand = E.bat ? E.bat.hand : b.hand === 'L' ? 'L' : 'R';
  const pullSign = hand === 'R' ? -1 : 1;
  const pull = clamp((b.pow - b.con * .6) / 60, -.3, 1.0);
  const sh = (p, x, z) => { const o = G.shift[p] || { x: 0, z: 0 }; o.x += x; o.z += z; G.shift[p] = o; };
  // outfield depth
  const d = b.pow >= 75 ? -7 : b.pow >= 60 ? -2 : b.pow < 45 ? 6 : 3;
  for (const p of ['LF', 'CF', 'RF']) sh(p, pullSign * 5 * pull, d);
  { const w = G.wx; if (G.wxOn && w && !w.dome && !w.off) { const c = Math.cos(w.dir * Math.PI / 180), k = clamp((w.spd || 0) / 6, 0, 1); for (const p of ['LF', 'CF', 'RF']) sh(p, 0, -c * 3.5 * k); } }      // 順風外野手後退、逆風前進
  // infield pull shift
  const ix = pullSign * 2.6 * pull * (b.pow > 70 ? 1.2 : 1);
  for (const p of ['1B', '2B', 'SS', '3B']) sh(p, ix, 0);
  // runner on third, <2 out, tight late game : infield in
  if (runners[2] && outs < 2 && (lateGame() ? diff <= 1 : diff <= 0)) { for (const p of ['1B', '2B', 'SS', '3B']) sh(p, p === '1B' || p === '3B' ? 0 : 0, 6.5); sh('P', 0, 0); for (const p of ['LF', 'CF', 'RF']) sh(p, 0, 4); }
  // double play depth : runner on first with <2 outs
  else if (runners[0] && outs < 2) { sh('SS', 2.4, 1.8); sh('2B', -2.4, 1.8); }
  // late and close with runner : corners guard the line
  if (lateGame() && diff >= 0 && diff <= 2 && outs < 2) { sh('1B', 2.4, 0); sh('3B', -2.4, 0); for (const p of ['LF', 'RF']) sh(p, p === 'LF' ? -4 : 4, 6); }
  // bunt expectation
  if (aiExpectBunt()) { sh('1B', 1.5, 6); sh('3B', -1.5, 6); sh('P', 0, 1.3); }
  // runner on second, 2 outs : outfield in a bit
  if (runners[1] && outs === 2) for (const p of ['LF', 'CF', 'RF']) sh(p, 0, 4);
  applyHumanTactics();
}
const TAC_INF = {
  in:   { name: '前進守備', desc: '內野手大幅趨前，擋住三壘跑者回本壘；兩側空檔變大、較容易被穿出安打' },
  dp:   { name: '雙殺布陣', desc: '二壘手、游擊手往二壘壘包靠攏，一壘有人時更容易發動雙殺' },
  bunt: { name: '警戒短打', desc: '一、三壘手與投手提前趨前，隨時處理短打滾地球' }
};
const TAC_OF = {
  deep: { name: '長打警戒', desc: '外野手集體後退，防全壘打與深遠二壘安打；淺飛球較容易落地' },
  pull: { name: '拉打警戒', desc: '外野整體往打者的拉打方向偏移（右打者往左外野、左打者往右外野）' },
  push: { name: '推打警戒', desc: '外野整體往打者的推打方向偏移（右打者往右外野、左打者往左外野）' }
};
function applyHumanTactics() {            // 玩家守備時選擇的戰術站位：覆蓋電腦自動站位（只調整站位，不直接決定結果）
  const T = G.tac; G.tacGap = 0; if (!T || G.human < 0 || G.human !== 1 - G.half || !G.shift) return;
  const b = curBatter(); if (!b) return; const hand = E.bat ? E.bat.hand : b.hand === 'L' ? 'L' : 'R', ps = hand === 'R' ? -1 : 1;
  const set = (p, x, z) => { G.shift[p] = { x, z }; };
  if (T.inf) {
    for (const p of ['1B', '2B', 'SS', '3B']) delete G.shift[p];
    if (T.inf === 'in') { set('1B', 0, 6.5); set('3B', 0, 6.5); set('2B', 0, 8); set('SS', 0, 8); G.tacGap = .8; }
    else if (T.inf === 'dp') { set('SS', 3.6, -2.2); set('2B', -3.6, -2.2); }
    else if (T.inf === 'bunt') { delete G.shift.P; set('1B', 1.5, 7); set('3B', -1.5, 7); set('P', 0, 1.6); set('2B', 2.2, 1); set('SS', 1.5, 0); }
  }
  if (T.of) {
    for (const p of ['LF', 'CF', 'RF']) delete G.shift[p];
    if (T.of === 'deep') { set('LF', -3, -9); set('CF', 0, -10); set('RF', 3, -9); }
    else if (T.of === 'pull') { const k = ps * 10; set('LF', k, -2); set('CF', k * .9, -1); set('RF', k * 1.2, -1); }
    else if (T.of === 'push') { const k = -ps * 9; set('LF', k, -2); set('CF', k * .9, -1); set('RF', k * 1.2, -1); }
  }
}
function aiExpectBunt() {
  const b = curBatter(), r = G.on; if (G.outs >= 2) return false;
  if (!(r[0] || r[1])) return false; if (r[2] && !r[1] && !r[0]) return false;
  const off = G.half, diff = runDiff(off);
  const weak = b.isPitcherBat || strengthOf(b) < 52; if (lateGame() && diff <= 0 && diff >= -1 && strengthOf(b) < 68) return true;
  return weak && diff >= -2 && diff <= 1;
}

/* -------- pitch selection -------- */
function pitcherModelKey() { const p = curPitcher(); return p.name + p.num; }
function updatePitcherModel(pt, batter) {
  const k = pitcherModelKey(); const m = G.pmodel[k] || (G.pmodel[k] = { all: {}, bycount: {}, loc: {} });
  { const ky = G.strikes === 2 ? 't' : 'n', e = m.loc[ky]; pt.exp = e && e.n >= 3 ? { x: e.x, y: e.y } : null; if (!e) m.loc[ky] = { x: pt.fx, y: pt.fy, n: 1 }; else { e.n++; e.x += (pt.fx - e.x) * .25; e.y += (pt.fy - e.y) * .25; } }      // 打者記住投手慣用的落點（先取預期、再更新，避免偷看這一球）
  m.all[pt.id] = (m.all[pt.id] || 0) + 1; const ck = G.balls + '-' + G.strikes; (m.bycount[ck] || (m.bycount[ck] = {}))[pt.id] = ((m.bycount[ck][pt.id]) || 0) + 1;
}
function aiPickPitch(p, b) {
  const L = lvl(), side = E.bat.side, inside = -side;
  if (G.intWalk) { return { id: 'ST', x: -inside * 1.95, y: ZC + .1, ibb: true }; }
  const bh = bhist(b), bal = G.balls, str = G.strikes;
  const first1 = G.on[0] || G.on[1] || G.on[2];
  const dangerous = strengthOf(b) > 76, open1 = !G.on[0];
  const careful = (dangerous && open1 && G.outs < 2 && (G.on[1] || G.on[2]) && lateGame()) || (dangerous && open1 && G.on[1] && G.on[2] && G.outs < 2);
  const last = G.lastPitch;
  const xs = [-1.05, -.75, -.4, 0, .4, .75, 1.05], ys = [ZC - 1.05, ZC - .62, ZC - .25, ZC + .05, ZC + .35, ZC + .7, ZC + 1.0];
  const items = [], scores = [];
  for (const pi of p.pitches) {
    const spec = PITCHES[pi.id], sg = ctlSigma(p, pi.id, pi.lv);
    const bxv = spec.bx * pi.lv / 7 * (p.hand === 'R' ? 1 : -1);
    const away = bxv * side > .15 ? 1 : (bxv * side < -.15 ? -1 : 0);              // moves away from the batter ?
    const kmh = p.kmh * (p.ultra && FAST_T[id] ? 1 : spec.sp);
    for (const tx of xs) for (const ty of ys) {
      const pS = pStrikeAt(tx, ty, sg), od = outsideDist(tx, ty), near = Math.exp(-Math.max(0, od) / .42);
      const rate = batterZoneRating(b, tx, ty);
      const cen = clamp(1 - Math.hypot(tx / ZW, (ty - ZC) / ZH) / 1.2, 0, 1);
      let sc = 0;
      const gB = L.temp >= .28 ? 1 : .45;      // 頂級電腦（選球幾乎固定取最高分）的好球加成減半，避免好球率過高
      const need = (str < 2 ? (L.strk || 0) : 0) + (bal === 3 ? 3.2 : (bal === 2 && str < 2 ? 1.3 : str === 2 ? -.15 : bal > str ? .8 + .1 * gB : (bal === 0 && str === 0) ? .45 + .35 * gB : .45 + .2 * gB));      // 開球與落後球數時更積極搶好球，不再一開始就用壞球試探
      const cpk = (bal >= str && str < 2) ? (gB === 1 ? .65 : .9) : 1;      // 沒領先時減少「避開紅中」的程度（原本太怕被打，造成壞球率偏高）
      sc += need * pS;
      if (rate >= -1) sc += pS * (-.45 * rate);
      sc -= pS * cen * (.6 * cpk + (bh.hard[pi.id] || 0) * .1);
      if (L.mid) sc += pS * cen * L.mid * (bal === 3 ? .6 : 1);                      // 簡單／普通：偏愛好球帶中央（紅中）
      const chase = (1 - pS) * near * (1.15 - b.eye * .007) * (str === 2 ? 1.5 : str === 1 ? .6 : bal === 3 ? -2 : .1) * (1 - Math.min(.8, (L.mid || 0) * .6));
      sc += chase * (od > 0 ? 1 : 0.2);
      if (od > .55) sc -= .9 * (1 - pS);                      // far-off pitches are useless
      if (L.learn > 0 && bh.hl) for (const q of bh.hl) { const dd = Math.hypot(q.x - tx, q.y - ty); if (dd < .4) sc -= (.4 - dd) * 1.1 * L.learn * pS; }
      if (str === 2 && L.learn > 0) sc += (Math.hypot(spec.bx, spec.by) * pi.lv / 7) * (1 - pS) * near * .55 * L.learn;      // 兩好球：用變化最大的球種配合好球帶邊緣決勝
      sc += pi.lv / 7 * .6 + (pi.id === 'ST' ? (kmh - 140) * .012 : 0);
      if (L.plain) { if (pi.id === 'ST') sc += L.plain * .9; else sc -= L.plain * (.35 + pi.lv / 7 * .45); }      // 簡單／普通：多投沒有變化的直球
      if (last) { sc += Math.min(30, Math.abs(kmh - last.kmh)) / 30 * .5; if (last.id === pi.id) sc -= .15 + (G.seq.length > 1 && G.seq[G.seq.length - 2] === pi.id ? .45 : 0); if (last.id === pi.id && Math.abs(last.fx - tx) < .3 && Math.abs(last.fy - ty) < .3) sc -= .45; }
      if (L.learn > 0 && bh.whiff[pi.id]) sc += Math.min(.8, bh.whiff[pi.id] * .35) * L.learn;
      if (L.learn > 0) { if (bh.lowChase > 1 && ty < ZC - .5 && od > 0) sc += .4 * L.learn; if (bh.highChase > 1 && ty > ZC + .5 && od > 0) sc += .4 * L.learn; if (bh.chase / Math.max(1, bh.balls) > .5 && od > 0 && od < .5) sc += .3 * L.learn; }
      if (away > 0 && ty < ZC + .2) { sc += .25 * Math.max(0, tx * -inside) * .5; }
      if (away < 0) { sc += (tx * inside > .2 && tx * inside < .9 ? .22 : 0); }
      if (p.hand !== (E.bat.hand) && away > 0) sc += .12;
      // situation
      if (G.on[0] && G.outs < 2 && ty < ZC - .15 && ['SK', 'FK', 'CH', 'SH', 'CU'].includes(pi.id)) sc += .5 * pS;
      if (G.on[2] && G.outs < 2 && sg > .3 && ty < ZC - .8 && ['FK', 'CU'].includes(pi.id)) sc -= .9;
      if ((G.on[0] || G.on[1] || G.on[2]) && ty < ZC - .95 && sg > .26) sc -= .5 * (sg - .2) * 3;
      if (G.on[2] && str === 2 && pi.id === 'ST' && ty > ZC + .3) sc += .45;
      if (aiExpectBunt() && ty > ZC + .3 && pi.id === 'ST') sc += .9 * pS;
      if (careful) { sc -= pS * cen * 1.2; sc += (1 - pS) * near * .9; if (bal === 3) sc += pS * .6; }
      if (b.isPitcherBat) { sc += pS * .6; }
      if (p.fatigue > 55) sc -= cen * pS * .3;
      items.push({ id: pi.id, x: tx, y: ty }); scores.push(sc);
    }
  }
  const c = softmaxPick(items, scores, L.temp);
  return { id: c.id, x: c.x + gauss() * .03, y: c.y + gauss() * .03 };
}

/* -------- batting -------- */
function guessPitch(b) {
  const L = lvl(); if (L.learn === 0) return null;
  const p = curPitcher(), m = G.pmodel[pitcherModelKey()]; const ck = G.balls + '-' + G.strikes;
  const w = {}; let tot = 0;
  for (const pi of p.pitches) { let v = (pi.id === 'ST' ? 2.0 : 1.0) * (1 - Math.min(.7, L.learn * 0)); if (m) { v += (m.all[pi.id] || 0) * .4 + (m.bycount[ck] ? (m.bycount[ck][pi.id] || 0) * 1.1 : 0); } w[pi.id] = v; tot += v; }
  if (G.lastPitch && G.seq.length) { const lp = G.lastPitch.id; if (lp !== 'ST' && w.ST) w.ST *= 1.25; if (lp === 'ST' && Math.random() < .5) for (const k in w) if (k !== 'ST') w[k] *= 1.15; }
  let best = null, bv = -1; for (const k in w) { const v = w[k] * (.85 + Math.random() * .3 / Math.max(.3, L.learn)); if (v > bv) { bv = v; best = k; } }
  return best;
}
function aiBatPlan(pt, b) {
  const L = lvl(), bh = bhist(b), bal = G.balls, str = G.strikes;
  const eyeS = clamp(1.45 - b.eye * .008, .5, 1.3), N = L.noise * (.8 + .2 * moodVol(b));
  const guess = guessPitch(b), match = guess === pt.id;
  const hit = !!G.hitAndRun;
  // perceived location
  const pn = (.05 + (100 - b.eye) * .0034) * N * (match ? .6 : (guess ? 1.15 : 1)) * (1 + (pt.id === 'ST' ? 0 : pt.lv * .045));
  const px = pt.fx + gauss() * pn, py = pt.fy + gauss() * pn;
  const od = outsideDist(px, py);
  const sit = G.on, out = G.outs;
  // intentional walk / take signs
  if (G.intWalk) return { swing: false };
  // bunt ?
  if (G.callBunt) {
    const noise = (.26 - b.bunt * .0018) * N * .8;
    return { swing: true, bunt: true, tc: pt.T - .01 + gauss() * .02 * N, cx: pt.fx + gauss() * noise, cy: pt.fy + gauss() * noise, power: false, take: od > .25 && !(G.squeeze === 'suicide' && od < .5) };
  }
  let p;
  if (od < -.2) p = .6; else if (od < 0) p = .46; else if (od < .15) p = .38; else if (od < .35) p = .14; else p = .04;
  if (od > 0) p *= eyeS * (str === 2 ? 2.2 : 1);
  if (str === 2) { p = od < .05 ? .97 : p; if (od > 0 && od < .42) p = Math.max(p, .72 - b.eye * .003); }
  const z = batterZoneRating(b, px, py); if (z >= 1 && od < 0) p += .08 * z; if (z <= -1 && od < 0) p -= .1 * -z;
  if (bal === 3 && str === 0) p = (od < -.35 && strengthOf(b) > 66 && L.learn > 0 ? .35 : od < -.1 ? .08 : .0);
  else if (bal >= 2 && str < 2 && od < 0) p += .07;
  // 每個打席隨機決定「打擊心態」：積極／正常／耐心（受選手積極度、打擊強度、選球與 AI 難度影響），不再固定前兩球不揮
  if (!G.seq.length || !G._apr || G._aprKey !== b.name + b.num) { const ag = ((b.agg || 50) - 50) * .006, st = (strengthOf(b) - 60) * .003, ey = (b.eye - 60) * .0025; G._aprKey = b.name + b.num; G._apr = clamp(gauss() * (.2 + .08 * L.noise) + ag + st - ey - (L.learn > 1 ? .04 : 0), -.55, .7); }
  { const ap = G._apr, early = str < 2 && bal < 3;
    if (early && od < .12) { p *= 1 + ap * (str === 0 && bal === 0 ? 1.0 : .7); }
    if (early && od < -.05) { const fl = (.14 + Math.max(0, ap + .25) * .38) * (L.learn === 0 ? 1.15 : L.learn >= 2 ? .85 : 1); p = Math.max(p, fl * (str === 0 && bal === 0 ? 1 : .9)); }     // 好球帶內至少有一定揮棒機率，弱／強打者機率不同
    if (early && od > .12 && od < .4 && Math.random() < .05 * L.noise * (1 + Math.max(0, ap))) p = Math.max(p, .5);                                         // 偶爾被壞球誘出（追球）
    if (od < -.1 && str < 2 && Math.random() < .06 * (1 + L.noise * .5)) p *= .35;                                                                         // 偶爾好球也放著看
  }
  if (bal === 3 && str === 2) p = od < .12 ? .98 : .0;
  if (match && od < 0) p += .1;
  { const pp0 = curPitcher(); if (L.learn > 0 && od > -.1) { const wildish = clamp((pp0.fatigue || 0) * .003 + (100 - pp0.ctl) * .004 - .1, 0, .3); p *= 1 - wildish * (b.eye / 100) * L.learn * (str === 2 ? .3 : 1); } }      // 投手控球差／疲勞時，選球好的打者更有耐心
  if (hit) { p = od < .4 ? .93 : .1; }
  if (G.runnerGo && G.runnerGo.length && !hit) { p = od < -.1 ? Math.max(p, .5) : p * .5; }
  // pitcher low fatigue etc.
  if (Math.random() > clamp(p, 0, .99)) return { swing: false };
  // swing details
  const lastP = G.lastPitch; let foolV = 0, foolL = 0, foolBias = 0;      // 前後兩球的速差、位置落差，以及邊角球，都會讓電腦打者更難掌握
  if (lastP && lastP.kmh) { const dv = Math.abs(pt.kmh - lastP.kmh); foolV = clamp((dv - 8) / 30, 0, 1); foolBias = (pt.kmh < lastP.kmh ? -1 : .6) * foolV * .028; const ld = Math.hypot(pt.fx - lastP.fx, pt.fy - lastP.fy); foolL = clamp((ld - .6) / 1.2, 0, 1); }
  const edgeK = clamp(Math.hypot(px / ZW, (py - ZC) / ZH) - .7, 0, .7), eyeR = clamp(1.15 - b.eye * .006, .6, 1);
  const foolK = 1 + clamp((foolV * .3 + foolL * .18 + edgeK * .35) * eyeR, 0, .55), foolT = 1 + foolV * .7 * eyeR;
  const sg0 = ((.1 + (100 - b.con) * .0034) * N * (match ? .7 : (guess ? 1.1 : 1)) * (1 + (pt.id === 'ST' ? 0 : pt.lv * .05))) + .09 + Math.max(0, pt.kmh - 125) * .0016;
  const sg = sg0 * foolK * (L.hit || 1);      // 難度越低電腦打者揮棒越不準
  const R0 = batterR(b, pt, false);
  let power = false;
  const midMiddle = od < -.3 && Math.hypot(px / ZW, (py - ZC) / ZH) < .75;
  if (str < 2 && L.learn > 0 && b.pow > 62 && (midMiddle || (bal > str && od < -.15)) && Math.random() < clamp((b.pow - 50) / 60 + (bal > str ? .25 : 0), 0, .8)) power = true;
  if (str === 2 || b.isPitcherBat) power = false;
  const sgf = (str === 2 && L.learn > 0 && b.con > 55) ? .9 : 1;                 // 兩好球縮短揮棒、專注碰球
  let cx = px + gauss() * sg * sgf, cy = py + gauss() * sg * sgf;
  if (L.learn > 0 && pt.exp) { const w = .22 * L.learn * (1 + (b.eye - 50) * .006), dx0 = pt.exp.x - cx, dy0 = pt.exp.y - cy; if (Math.hypot(dx0, dy0) < .6) { cx += dx0 * w * .5; cy += dy0 * w * .5; } }
  // situational intent
  const shift = clamp(R0 * (power ? .70 : 1), .2, .8);
  if (L.learn > 0.5) {
    if (sit[2] && out < 2 && !sit[0]) cy -= shift * .35;                 // need a fly ball
    else if (sit[0] && out < 2 && !sit[1]) cy += shift * .22;            // avoid DP (hit it in the air)
    else if (sit[0] && out < 2) cy -= shift * .15;
  }
  let tc = pt.T - .012 + foolBias * eyeR + gauss() * foolT * (.011 + (100 - b.eye) * .00035) * N * (match ? .65 : (guess ? 1.0 : .9)) * (1 - Math.min(.25, G.seq.length * .06 * L.learn));      // 看過幾球後，時機掌握越來越準
  if (guess && !match) tc += (guess === 'ST' ? 1 : -1) * (pt.id === 'ST' ? 0 : .03) * (guess === 'ST' && pt.id !== 'ST' ? -1 : 1) * -.6 * N;
  if (L.learn > .5) {                                                    // spray intent
    const s = E.bat.side;
    if (sit[1] && !sit[2] && out < 2) tc += .018 * s * -1 * -1 * 0 + (s > 0 ? .018 : .018);       // go the other way
    else if (b.pow > 68 && bal >= str && od < -.1 && !power) tc -= .012;
  }
  return { swing: true, tc, cx, cy, power, bunt: false, take: false };
}
function aiBuntCall() {
  const b = curBatter(), r = G.on; if (!aiExpectBunt()) return false;
  const L = lvl(); if (L.learn === 0) return Math.random() < .25;
  let pS = b.isPitcherBat ? .92 : lateGame() ? .75 : .5;
  if (G.strikes === 2) return false; if (G.balls === 3) return false;
  pS *= [.85, .85, 1, 1.08][G.lv] || 1;                                      // 越強的電腦越懂得該在什麼時候犧牲
  if (humanDefTac('bunt')) pS *= L.learn >= 2 ? .3 : .55; else if (humanDefTac('in')) pS *= L.learn >= 2 ? .7 : .85;      // 玩家擺出警戒短打／前進守備：聰明的電腦會放棄硬bunt
  // infield playing in/fast defence -> less bunt
  return Math.random() < pS;
}

const humanDefTac = k => G.human >= 0 && G.human === 1 - G.half && !!(G.tac && G.tac.inf === k);
function aiSqueezeCall() {                    // 擠壓短打（強迫取分）：三壘有人、不到兩出局、比數接近時，電腦依難度與打者短打能力決定要不要賭一分
  const L = lvl(), b = curBatter(), r = G.on[2]; G.squeeze = null;
  if (L.learn === 0 || !r || r.state !== 'on' || G.outs >= 2 || G.intWalk) return false;
  if (G.strikes === 2 || G.balls === 3) return false;
  const diff = runDiff(G.half), late = lateGame(), sk = b.bunt || 55;
  if (!(late ? diff >= -2 && diff <= 1 : diff >= -1 && diff <= 0)) return false;
  if (!b.isPitcherBat && strengthOf(b) > 74 && sk < 75) return false;      // 強打者直接讓他打
  let p = (.05 + (sk - 50) * .003 + (late ? .07 : 0) + (diff === 0 ? .04 : 0) + (G.outs === 0 ? .03 : 0) + (b.isPitcherBat ? .18 : 0) + (r.pl.spd - 55) * .0012) * ([0, .5, 1, 1.4][G.lv] || 0);
  if (humanDefTac('bunt')) p *= .35; else if (humanDefTac('in')) p *= .7;
  if (Math.random() >= clamp(p, 0, .4)) return false;
  const suicide = r.pl.spd >= 55 && sk >= 60 && Math.random() < .35 + G.lv * .15;      // 自殺式：投手一出手三壘跑者就起跑；安全式：先看球再決定
  G.callBunt = true; G.sneak = suicide; G.squeeze = suicide ? 'suicide' : 'safety'; if (suicide) G.runnerGo = [2];
  return true;
}
function aiSneakBunt() {                      // 奇襲短打：腳程快、短打技術好的打者，在守備沒防備時偷襲
  const L = lvl(), b = curBatter(); if (L.learn === 0 || G.intWalk || b.isPitcherBat) return false;
  if (G.strikes === 2 || G.balls === 3 || G.on[2] || aiExpectBunt() || strengthOf(b) > 76) return false;
  const p = clamp((b.spd - 62) * .0034 + (b.bunt - 55) * .0016, 0, .1) * (G.on[0] || G.on[1] ? .6 : 1) * (G.outs === 2 ? .5 : 1) * ([0, 1, 1.25, 1.5][G.lv] || 1) * (humanDefTac('bunt') ? .4 : 1);
  return Math.random() < p;
}
