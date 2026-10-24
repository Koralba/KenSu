/* ===== 07-cpu-ai.js ｜ 電腦大腦：守備站位／配球／打擊／盜壘／牽制／換人 =====
   載入順序 7/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
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

