/* 07-game-state-pitch.js — 遊戲狀態 G/E／實體／投球模型（原 script.js 第 1293-1506 行） */
'use strict';
/* =====================================================================
   Part 4a: game state, entities, pitch model, swing/contact model, ball physics
   ===================================================================== */
const G = {
  mode: 'title', teams: [null, null], human: 0, lv: 1, innings: 5, inning: 1, half: 0, outs: 0, balls: 0, strikes: 0,
  score: [0, 0], line: [[], []], hits: [0, 0], errs: [0, 0], on: [null, null, null], bi: [0, 0], phase: 'idle', ts: 1, over: false,
  pitchNo: 0, seq: [], batHist: {}, lastPitch: null, runsPlay: [], playId: 0, intWalk: false, tac: {}, tacGap: 0, auto: false, wx: { spd: 0, dir: 0, temp: 26, dome: false, venue: '' }, visits: [3, 3]
};
const E = { F: {}, bat: null, runners: [], ump: null, all: [] };
let TIMERS = [];
function after(sec, fn) { const t = { t: sec, fn }; TIMERS.push(t); return t; }
function stepTimers(dt) { for (let i = 0; i < TIMERS.length; i++) { const t = TIMERS[i]; if (G.freeze) continue; t.t -= dt; if (t.t <= 0) { TIMERS.splice(i, 1); i--; try { t.fn(); } catch (e) { console.error(e); } } } }
const battingTeam = () => G.teams[G.half], fieldingTeam = () => G.teams[1 - G.half];
const curPitcher = () => { const t = fieldingTeam(); return t.pitchers[t.cur]; };
const curBatter = () => { const t = battingTeam(); return t.lineup[G.bi[G.half]]; };
const humanBats = () => G.human === G.half, humanPitches = () => G.human === 1 - G.half;
function teamStyle(side) {
  const t = G.teams[side];
  if (side === 1) return { jersey: t.c1, pants: '#f2f2f2', cap: t.cap };
  let j = t.c2; if (G.teams[0].id === G.teams[1].id) j = '#9aa3b0';
  return { jersey: j, pants: '#d6d9e0', cap: t.cap, belt: t.c1 };
}
/* ---------------- entities ---------------- */
function disposeRig(r) { scene.remove(r.root); }
function fielderOf(pos) { return E.F[pos]; }
function playerAt(team, pos) { if (pos === 'P') return team.pitchers[team.cur]; return team.lineup.find(p => p.pos === pos) || team.lineup.find(p => p.pos === 'DH') || team.lineup[0]; }
function rebuildField() {
  Object.values(E.F).forEach(f => disposeRig(f.rig)); E.F = {};
  if (E.bat) disposeRig(E.bat.rig); E.runners.forEach(r => disposeRig(r.rig)); E.runners = [];
  if (E.ump) disposeRig(E.ump);
  const ft = fieldingTeam(), st = teamStyle(1 - G.half);
  for (const pos of POS_LIST) {
    const pl = playerAt(ft, pos); const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, glove: true, pl, catcher: pos === 'C' });
    scene.add(rig.root); const d = DEFAULT_POS[pos];
    const f = { pos, pl, rig, x: d.x, z: d.z, tx: d.x, tz: d.z, hasBall: false, busy: 0, dive: false };
    rig.root.position.set(d.x, 0, d.z); faceRig(rig, 0, 0); rig.ready = pos !== 'C';
    E.F[pos] = f;
  }
  E.F.C.rig.anim = { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } }; ghostRig(E.F.C.rig, .28);
  E.ump = makeChibi({ jersey: '#1a1a22', pants: '#3a3a44', cap: '#111', scale: 1, ump: true, pl: { name: '主審' } }); E.ump.root.position.set(1.2, 0, 5.7); E.ump.root.rotation.y = Math.PI; scene.add(E.ump.root); E.ump.root.rotation.y = Math.PI; ghostRig(E.ump, .28);
  setupBatter();
}
const MOVEK = .78;      // 全場跑動速度係數：場地很大的感覺（跑者、守備員同步放慢）
function fspeed(f) { return fspeed0(f) * MOVEK; }
function fspeed0(f) { const pl = f.pl, of = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF'; return 3.7 + (pl.fld || 55) * 0.026 + ((pl.spd || 55) - 55) * (of ? .02 : .012) + (of ? .85 + (f.pos === 'CF' ? .25 : 0) : 0) + (f.pos === 'P' ? -.5 : 0); }      // 外野手腳程較快（中外野最快），並看個人跑速
function armSpeed(pl) { return 15 + (pl.arm || 60) * 0.11; }      // 傳球飛行速度放慢（肩力60約21.6m/s、肩力90約24.9m/s）
function setupBatter() {
  BATV.ok = false;      // 換打者：球棒尺寸直接對齊新打者，不做緩動
  const pl = curBatter(), ph = curPitcher(), st = teamStyle(G.half);
  if (E.bat) disposeRig(E.bat.rig);
  let h = pl.hand; if (h === 'S') h = ph.hand === 'R' ? 'L' : 'R';
  const side = h === 'R' ? 1 : -1;                       // +1 : right handed batter (stands on the 3B side, x<0)
  const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, helmet: true, bat: true, pl });
  rig.side = side; rig.root.position.set(-1.9 * side, 0, 0.35); scene.add(rig.root); faceRig(rig, 0, 0.35); rig.root.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; rig.ready = true;
  rig.body.scale.x = side > 0 ? 1 : -1;
  E.bat = { pl, rig, side, hand: h, x: -1.9 * side, z: .35 };
  batterStance();
}
function batterStance() { const r = E.bat.rig; r.anim = { name: 'stance', t: 0, dur: 1e9, opt: { hold: true } }; }
const _stanceBackup = rigStep;
rigStep = function (r, dt) {            // add 'stance' pose (bat on shoulder)
  if (r.anim && r.anim.name === 'stance') { r.t += dt; batterPose(r, 'stance', 0); return; }
  _stanceBackup(r, dt);
};

/* ---------------- pitch model ---------------- */
const ZPAD = BALL_R * 0.8;                                  // 球只要邊緣擦到好球帶就算好球
function pitchLv(p, id) { const o = p.pitches.find(q => q.id === id); return o ? o.lv : 0; }
function ctlSigma(p, type, lv) {
  const fat = p.fatigue || 0;
  let c = p.ctl - fat * 0.38 - (G.on[0] || G.on[1] || G.on[2] ? 2 : 0) + (moodOf(p) - 55) * .14 + roleEdge(p);
  let sg = clamp(0.72 - c * 0.0058, 0.08, 0.6) * (1 + (moodVol(p) - 1) * .8) * (1 + rainK() * .18) * (1 + stormK() * .3) * (1 - nightK() * .035) * (1 + windK() * (.05 + Math.max(0, (G.wx.gust || 0)) * .02));
  sg *= .86;      // 好球帶縮小後，投球散佈也依比例縮小
  if (type) sg *= 1.22 - (lv || 4) * 0.035;
  if (G.lv >= 0 && LVL[G.lv] && !humanPitches()) sg *= LVL[G.lv].ctl || 1;      // 電腦投手：難度愈低控球愈不精準
  if (G.on[1] || G.on[2]) sg *= 1 - ((p.clt == null ? 50 : p.clt) - 50) * .0012;      // 抗壓：得點圈有人時，抗壓好的投手控球更穩
  if (p.rosin > 0) sg *= .93;      // 摸過止滑粉：手不滑、控球更穩
  if (type === 'KN') sg *= 1.5;
  return sg;
}
const FAST_T = { ST: 1, TS: 1, SK: 1, CT: 1, SH: 1 };      // 速球類（直球／二縫／伸卡／卡特／內曲）：傳說球員全部用最高球速投出
function flightT(kmh) { return clamp(.69 * Math.pow(150 / kmh, 1.6), .5, 1.5); }      // 投出到進壘的時間：快速球更「咻」一下就到、慢速球明顯飄很久（速差被放大，約為原本的 1.5 次方）
function brkVis(lv) { return 1 + clamp(lv - 1, 0, 6) * .12; }
function makePitch(p, id, aimX, aimY, acc) {
  const spec = PITCHES[id], lvRaw = pitchLv(p, id) || 4, LC = (G.lv >= 0 && LVL[G.lv] && !humanPitches()) ? LVL[G.lv] : null, lv = LC ? clamp(lvRaw + (LC.lvAdj || 0), 1, 7) : lvRaw;      // 電腦投手：難度越高球種等級／球威越高
  let sg = ctlSigma(p, id, lvRaw); const hasAcc = typeof acc === 'number';
  if (hasAcc) sg *= 1.9 - 1.12 * acc;                    // 準度條：按得準→落點集中；按偏→落點散
  // 控球誤差（高斯）＋偶發失投（體力差、心情差、球路不熟時更容易）
  // 失投（暴投）機率：控球越好越穩；體力下降、心情／心態差、球種不熟（等級低）、變化幅度越大的球種都更容易失控；球威好的投手稍穩
  const stab = clamp((p.ctl - 40) / 55, 0, 1), mood0 = moodOf(p), fat0 = p.fatigue || 0;
  const unrest = (.003 + Math.pow(1 - stab, 1.6) * .034) * (1 + fat0 * .014) * (1 + ((G.tilt && G.tilt[1 - G.half]) || 0) * .35) * clamp(Math.pow(G.day || 1, .6), .7, 1.5) * (mood0 < 50 ? 1 + (50 - mood0) * .04 : Math.max(.6, 1 - (mood0 - 50) * .008)) * (lvRaw >= 6 ? .85 : 1 + Math.max(0, 5 - lvRaw) * .45) * clamp(1 - (p.dom || 0) * .25, .75, 1.15) * (1 + rainK() * 1.2) * stormMul() * (p.rosin > 0 ? .8 : 1);
  const breakK = .8 + clamp(Math.hypot(spec.bx, spec.by) / 1.6, 0, 1.1) * .7 + (spec.knuckle ? .5 : 0);
  const wildP = clamp(unrest * breakK * (hasAcc ? 1 + (1 - acc) * 1.5 : 1) * (LC ? LC.wild : 1), .002, .12);
  const wildPitch = !p.ultra && Math.random() < wildP; const k = wildPitch ? 2.4 : 1;
  const perfect = !wildPitch && (hasAcc ? acc >= .999 : (!humanPitches() && Math.random() < clamp(.05 + (p.dom || 0) * .08 + (lvRaw - 4) * .012, .02, .14)));      // 完美投球：玩家＝準度條完美；電腦＝依球威偶爾投出
  let ex = gauss() * sg * k * (spec.sx || 1), ey = gauss() * sg * .9 * k * (spec.sy || 1);
  if (!humanPitches() && !hasAcc && !wildPitch && outsideDist(aimX, aimY) <= 0) {      // 電腦投手瞄準好球帶時會「專心投進去」：落點散佈縮小（開球、球數落後時更明顯），避免明明想投好球卻常投偏
    const kk = ((G.balls === 0 && G.strikes === 0) || G.balls > G.strikes) ? (G.lv >= 3 ? .94 : G.lv === 1 ? .8 : .88) : (G.lv >= 3 ? .97 : G.lv === 1 ? .88 : .94); ex *= kk; ey *= kk;
  }
  const m = Math.hypot(ex, ey), mx = sg * 2.4 * k; if (m > mx) { ex *= mx / m; ey *= mx / m; }
  const mb = spec.miss || [0, 0], ms = (1.3 - lvRaw * .045) * (LC ? LC.ctl : 1) * (1 + (100 - p.ctl) * .004), hs0 = p.hand === 'R' ? 1 : -1;
  let ox = 0, oy = 0; if (hasAcc && acc < 1) { const miss = 1 - acc, ag = Math.random() * TAU, mag = Math.pow(miss, 1.4) * .9 * (.6 + Math.random() * .4); ox = Math.cos(ag) * mag; oy = Math.sin(ag) * mag * .9; }      // 時機差太多：整體偏離想投的位置
  let fx = aimX + ex + ox + mb[0] * hs0 * ms, fy = aimY + ey + oy + mb[1] * ms;           // 各球路有各自常見的落點偏差
  const fat = p.fatigue || 0;
  const kmh = Math.round(p.kmh * ((p.ultra && FAST_T[id] ? 1 : spec.sp) - (spec.sp < .95 && !(p.ultra && FAST_T[id]) && id !== 'KN' ? (lv - 4) * .008 : 0)) * (1 - fat * 0.0009) * (p.role === 'CL' && fat < 45 ? 1.008 : 1) * (1 + moodBonus(p) * .25) * (hasAcc ? 1 + (acc - .6) * .02 : 1) * (LC ? 1 + LC.spd : 1) + (Math.random() - .5) * 2.6 * moodVol(p) + (perfect ? 1.2 + Math.random() * 1.2 : 0));
  const hs = p.hand === 'R' ? 1 : -1;
  // 球威(stuff)：變化幅度由「該球種等級 lv」「投手壓制力 dom」「球速」決定；控球差的投手每球變化幅度更不穩
  const stuff = clamp(.8 + (lv - 4) * .068 + (p.dom || 0) * .24 + ((p.kmh || 145) - 146) * .005, .62, 1.45) * (LC ? LC.brk : 1);      // 越強的投手／球種等級越高，變化幅度差距越明顯
  const br = Math.pow(lv / 7, .85) * stuff * (p.ultra ? 1.6 : 1) * (1 + gauss() * (.045 + (100 - p.ctl) * .0009) * (1 + Math.max(0, moodVol(p) - .7))) * (1 + gauss() * .09) * (1 - (p.fatigue || 0) * .0025) * (hasAcc ? 1 + (acc - .6) * .2 : 1) * (perfect ? 1.2 + clamp((lv - 4) * .02 + (p.dom || 0) * .1, 0, .12) : 1);   // 完美投球：變化幅度加大；每球變化幅度不一；準度條：失準→變化變小、球威弱；很準→略強（偶爾沒投好＝變化變小）
  const BRK_VIS = brkVis(lv);                            // 球種等級越高，變化幅度越大（lv1≈1.0、lv4≈1.3、lv7≈1.6）
  // 每位投手同一球種的轉軸略有不同（偏橫或偏縱）；轉軸角度固定，不是每球亂數
  const tAng = spec.knuckle ? 0 : (((hashStr(p.name + id) >>> 4) % 200) - 100) / 100 * (id === 'ST' ? .22 : .3), cA = Math.cos(tAng), sA = Math.sin(tAng);
  const bx0 = spec.bx * hs, by0 = spec.by;
  const bx = (bx0 * cA - by0 * sA * hs) * br * BRK_VIS, by = (by0 * cA + bx0 * hs * sA) * br * BRK_VIS;
  const T = flightT(kmh);
  // 出手點：投手個人手臂角度 × 球種微調 × 每球隨機抖動（控球差/疲勞時抖動更大）
  const jit = .022 + (100 - p.ctl) * .0007 + fat * .0005, rel = REL[id] || [0, 0], sl = p.slot || .4;
  const start = new V3(hs * (.26 + sl * .34 + rel[0]) + gauss() * jit, 2.0 - sl * .5 + rel[1] + gauss() * jit * .8, MOUND.z + 1.4 + gauss() * .03);
  const apx = fx - bx, apy = fy - by;                       // 球出手後「看起來」要去的假想落點；末段才被位移咬回真正落點
  const ph = Math.random() * 6.28, ph2 = Math.random() * 6.28, tj = clamp(1 + (lv - 4) * .09 + (p.dom || 0) * .1 + gauss() * .05 + (perfect ? .14 : 0), .8, 1.5);          // 尾勁：球種等級／壓制力越高，變化越晚才咬住（球越「伸」、越難判斷）
  const pt = { id, spec, lv, kmh, T, start, apx, apy, bx, by, fx, fy, aimX, aimY, arc: spec.arc * (.6 + lv / 14), grav: 1.225 * Math.pow(66.2 / kmh, 2) * .7, tj, perfect, t: 0, hs, p, swing: null, resolved: false, hitBatter: false, wild: false, wildPitch, ph, ph2, called: null };
  // 觸身球：球的終點落在打者身體範圍內（身體寬約 ±0.5，高 0.35~1.95）
  const bxPos = E.bat.x;
  { let part = batterHitPart(fx, fy);
    if (part && !humanPitches() && Math.random() < .62) { const sd = E.bat.side || 1; pt.fx = fx = E.bat.x + sd * (1.15 + Math.random() * .5); pt.apx = fx - bx; part = batterHitPart(fx, fy); }      // 電腦投手多半會避開打者身體：落點被拉回好球帶邊緣（降低觸身球機率）
    if (part) { pt.hitBatter = true; pt.hbpPart = part; } }      // 依打者實際身體（頭盔／軀幹／手臂／手／腿／腳）在畫面上的位置判定：看起來碰到就是觸身

  pt.hbpHigh = pt.hitBatter && pt.hbpPart === 'head';
  // 失控丟到地上：球在本壘前先彈地，彈起後再進入捕手手套（變化球、控球差、疲勞、雨天更容易）
  { const dirtP = clamp(unrest * breakK * ((spec.by < -.3) ? .9 : .2), 0, .12);
    if (!pt.hitBatter && !spec.knuckle && Math.random() < dirtP) {
      const fyr = -(.12 + Math.random() * .5); pt.fyRaw = fyr; pt.apy = fyr - by; pt.dirt = false; pt.fy = fyr;
      let vb = .9; for (let v = .5; v <= 1.0001; v += .01) { pitchBase(pt, v, _pb0); if (_pb0.y < BALL_R) { vb = v; break; } }
      pt.vb = vb; pt.dirt = true; pt.fy = pt.fyRaw < BALL_R ? BALL_R + (BALL_R - pt.fyRaw) * .55 : pt.fyRaw; }
  }
  pt.tm = clamp(3.8 / Math.max(15, kmh / 3.6 * .8), .09, .26);                              // 過本壘後飛向捕手手套的時間
  pt.mitt = { x: clamp(fx, -1.9, 1.9), y: Math.max(.3, pt.fy), z: (E.F.C ? E.F.C.z : 4) - .25 };
  pt.Tv = visualArrivalT(pt);
  return pt;
}
const _hv = new V3();
function batterHitPart(fx, fy) {      // 把打者各部位（球）投影到好球帶平面，和球的落點比：畫面上重疊＝觸身
  const rg = E.bat && E.bat.rig; if (!rg) return null; rg.root.updateMatrixWorld(true);
  const c = camera.position, sc = rg.root.scale.x, vis = rg.vis || { w: 1, aw: 1, lw: 1, hs: 1, belly: 0 };
  const hit = (obj, lx, ly, lz, r) => { _hv.set(lx, ly, lz); obj.localToWorld(_hv); const dz = _hv.z - c.z; if (Math.abs(dz) < 1e-3) return false; const k = -c.z / dz, px = c.x + (_hv.x - c.x) * k, py = c.y + (_hv.y - c.y) * k; return Math.hypot(fx - px, fy - py) < r * sc * Math.abs(k) + BALL_R * .85; };
  if (hit(rg.head, 0, 0, 0, .58 * rg.head.scale.x)) return 'head';
  for (const a of [rg.armL, rg.armR]) { const ar = .12 * a.scale.x; if (hit(a, 0, -.56, 0, .14 * a.scale.x)) return 'hand'; }
  for (const a of [rg.armL, rg.armR]) { const ar = .12 * a.scale.x; if (hit(a, 0, 0, 0, ar) || hit(a, 0, -.25, 0, ar) || hit(a, 0, -.5, 0, ar)) return 'arm'; }
  const tr = .33 * vis.w + (vis.belly || 0) * .1; for (const y of [.68, .88, 1.08]) if (hit(rg.body, 0, y, 0, tr)) return 'torso';
  for (const l of [rg.legL, rg.legR]) { const lr = .16 * l.scale.x; if (hit(l, 0, -.08, 0, lr) || hit(l, 0, -.25, 0, lr)) return 'thigh'; }
  for (const l of [rg.legL, rg.legR]) { const lr = .15 * l.scale.x; if (hit(l, 0, -.42, 0, lr)) return 'knee'; if (hit(l, 0, -.56, .06, .18 * l.scale.x)) return 'foot'; }
  return null;
}
const earlyC = v => 1 - Math.pow(1 - v, 1.9);      // 出手後立即開始彎的「早段變化」曲線
function pitchBase(pt, v, out) {
  // 位移 = (1-e)·t^p ＋ e·早段曲線：p 大＝尾勁（極晚才變化）、e 大＝出手即開始彎；每種球各有 tx/ty/ex/ey，軌跡形狀不同（不只是變化量大小不同）
  const s = pt.spec, tj = pt.tj || 1, ex = s.ex || 0, ey = s.ey || 0, ec = (ex || ey) ? earlyC(v) : 0;
  const hx = (1 - ex) * Math.pow(v, clamp((s.tx || 2) * (1 + (tj - 1) * .8) * 1.08, 1.1, 4.2)) + ex * ec, hy = (1 - ey) * Math.pow(v, clamp((s.ty || 2) * (1 + (tj - 1) * .8) * 1.08, 1.1, 4.2)) + ey * ec;
  const zp = v * (1 + clamp(.04 + (pt.kmh - 105) * .0016, .04, .11) * (s.dec || 1) * (1 - v));      // 空氣阻力：球速越快、末段減速越明顯
  out.x = pt.start.x + (pt.apx - pt.start.x) * v + pt.bx * hx;
  out.y = pt.start.y + (pt.apy - pt.start.y) * v + pt.by * hy + (pt.arc + (pt.grav || 0) * (s.grv === undefined ? 1 : s.grv)) * 4 * v * (1 - v);      // 重力拋物線：慢球弧度大；直球 grv<1＝比預期少掉（上飄感）、曲球／變速球 grv>1＝下墜更明顯
  if (pt.dirt && out.y < BALL_R) out.y = BALL_R + (BALL_R - out.y) * .55;                // 彈地：向上反彈並損失能量
  out.z = pt.start.z + (0 - pt.start.z) * zp;
  if (s.knuckle) { const e = Math.sin(Math.PI * v); out.x += Math.sin(v * 11 + pt.ph) * .2 * e; out.y += Math.sin(v * 9 + pt.ph2) * .2 * e; }
  return out;
}
const _pb0 = new V3(), _pb1 = new V3();
function visualArrivalT(pt) {      // 玩家「看到」球到達落點的時刻：球在畫面上（沿視線投影到好球帶平面）與落點重疊到一個球半徑內的最早時刻；球進壘前最後一小段主要是變大、位置幾乎不動，肉眼早就判斷「到了」
  const c = camera.position; let tv = pt.T;
  if (pt.hitBatter || !c) return tv;
  const q = new V3();
  for (let i = 0; i <= 120; i++) {
    const v = i / 120; pitchBase(pt, v, q); const dz = q.z - c.z; if (Math.abs(dz) < 1e-3) continue;
    const k = -c.z / dz, px = c.x + (q.x - c.x) * k, py = c.y + (q.y - c.y) * k;
    if (Math.hypot(px - pt.fx, py - pt.fy) <= BALL_R * .4) { tv = v * pt.T; break; }
  }
  return clamp(tv, pt.T - .02, pt.T);      // 修正：原本最多可比球真正到達本壘板早 15%（約 0.1 秒），正中球幾乎永遠被判成「早 0.1 秒就該揮」→ 畫面上球還沒到就打出去。改成最多只早 0.02 秒（擊球點略在本壘板前）
}
function pitchPos(pt, t, out) {
  const u = t / pt.T;
  return pitchBase(pt, clamp(u, 0, 1), out);      // 球到終點就停在終點，不再外插下墜
}
const _pj = { x: 0, y: 0 };
function projPlane(x, y, z) {               // 把空間中的球，沿著「鏡頭視線」投影到好球帶平面(z=0)：畫面上看到球在哪，判定就在哪
  const c = camera.position, dz = z - c.z; if (Math.abs(dz) < 1e-3) { _pj.x = x; _pj.y = y; return _pj; }
  const k = -c.z / dz; _pj.x = c.x + (x - c.x) * k; _pj.y = c.y + (y - c.y) * k; return _pj;
}
function rayAtZ(x, y, zt, out) {            // 好球帶平面上的點，沿鏡頭視線移到深度 zt（畫面位置不變）
  const c = camera.position, k = (zt - c.z) / (0 - c.z); out.x = c.x + (x - c.x) * k; out.y = c.y + (y - c.y) * k; out.z = zt; return out;
}
function pitchPosEx(pt, t, out) {          // 球過本壘板後繼續飛進捕手手套
  if (t <= pt.T) return pitchBase(pt, clamp(t / pt.T, 0, 1), out);
  pitchBase(pt, 1, out); if (pt.hitBatter || !pt.tm) return out;
  const u = clamp((t - pt.T) / pt.tm, 0, 1), m = pt.mitt;
  return rayAtZ(out.x, out.y, m.z * u, out);        // 過本壘後沿視線飛向手套：畫面上的位置與落點完全一致（不會因透視看起來變低）
}
const _sbp = new V3();
function swingBallPos(pt, sw) {            // 揮棒接觸瞬間「球實際所在位置」
  if (sw.auto) return { x: sw.bx, y: sw.by, z: sw.bz };
  pitchPosEx(pt, clamp(sw.tc, 0, pt.T + (pt.tm || 0)), _sbp); return { x: _sbp.x, y: _sbp.y, z: _sbp.z };
}
function isStrikeLoc(x, y) { return Math.abs(x) <= ZW + ZPAD && Math.abs(y - ZC) <= ZH + ZPAD; }
/* 距離「判定好球帶」邊界的有號距離：<0 在好球帶內（好球），>0 在帶外（壞球） */
function zoneSDF(x, y) { return Math.max(Math.abs(x) - ZW, Math.abs(y - ZC) - ZH) - ZPAD; }
function zoneCell(x, y) {                 // 0..8 cell inside the zone (row major, top-left origin), -1 outside
  if (Math.abs(x) > ZW || Math.abs(y - ZC) > ZH) return -1;
  const cx = Math.min(2, Math.floor((x + ZW) / (2 * ZW) * 3)), cy = Math.min(2, Math.floor((ZC + ZH - y) / (2 * ZH) * 3));
  return cy * 3 + cx;
}
function batterZoneRating(b, x, y) {         // -2..2 : in terms of absolute (catcher view) coordinates, mirrored by batting side
  const c = zoneCell(x, y); if (c < 0) return -1;
  return b.zone[c];
}

