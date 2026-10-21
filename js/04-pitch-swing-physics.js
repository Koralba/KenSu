/* ===== 04-pitch-swing-physics.js ｜ 遊戲狀態G／實體／投球模型／揮棒與擊球判定／球的物理與擊球軌跡 =====
   載入順序 4/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
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
const humanBats = () => G.human === G.half && (!G.role || CSEASON.mine('bat')), humanPitches = () => G.human === 1 - G.half && (!G.role || CSEASON.mine('pit'));      // 生涯模式(G.role)：只有輪到自己的角色才由玩家操控（js/13d-career-season.js）
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
const FIELDK_OF = 1.08;      // 外野手跑動係數：外野距離最遠，不跟著跑者一起放慢到 .78（否則追球、撿球看起來像在散步）；內野與跑者仍用 MOVEK
function fspeed(f) { const of = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF'; return fspeed0(f) * (of ? FIELDK_OF : MOVEK); }
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

/* ---------------- swing / contact ---------------- */
function batterR(b, pt, power) {
  let r = 0.22 + b.con * 0.0031 - Math.max(0, pt.kmh - 140) * 0.0022 - (pt.perfect ? .014 : 0) - (pt.id === 'ST' ? 0 : pt.lv * 0.012 * clamp(1.35 - b.eye * .0065, .75, 1.15));   // 選球高→較能辨識變化球
  const fatigue = pt.p.fatigue || 0; r *= 1 + fatigue * 0.0011;
  r *= 1 - clamp(((pt.p.stf == null ? 60 : pt.p.stf) - 60) * .0016, -.04, .07) * (1.1 - clamp((b.eye - 30) / 140, 0, .5));      // 球威：投手球質越強、擊球圈越小；選球好的打者較能抵消
  { const risp = G.on[1] || G.on[2]; if (risp) r *= 1 + ((b.clt == null ? 50 : b.clt) - 50) * .0017; if (pt.p.hand === 'L') r *= 1 + ((b.vsl == null ? 50 : b.vsl) - 50) * .0014; }      // 得點圈打擊／對左投能力：壘上有人或面對左投時，揮棒圈隨個人能力增減（約 ±3~4%）
  { const bh = b.hand === 'S' ? (pt.p.hand === 'R' ? 'L' : 'R') : b.hand; r *= bh !== pt.p.hand ? 1.045 : .955; }      // 左右對決：異手打者較佔優勢、同手較吃虧（左右開弓永遠站有利一側）
  r *= (1 + moodBonus(b) * 1.1) * (1 - rainBK() * .07) * (1 - nightK() * .02);                                   // 心情加成（好→揮棒圈變大）
  if (typeof pt.acc === 'number') r *= 1 - (pt.acc - .6) * .1;                 // 失準的球好打（最多 +6%）、很準的球略難打（最多 -4%）
  r = clamp(r * .86, 0.17, 0.7);      // 好球帶縮小後，球棒整體（長度與粗細）依比例縮小
  if (power) r = Math.max(0.155, r * 0.9);                                 // 強打：擊球圈縮小（更難對準甜蜜點）
  return r;
}
/* 球棒形擊球框：游標＝甜蜜點（球棒最粗的位置）；握把朝打者身體一側、球頭微微上揚。球落在棒上的位置（球頭／甜蜜點／握把）與上下偏移決定擊球結果 */
const BAT_TILT = 16 * Math.PI / 180;
const BAT_K = { normal: .26, power: .22, bunt: .29 };      // 球棒半寬（相對 R0）：一般＝標準、強打略細但不再像鉛筆、短打＝短而寬的「接球面」
const BAT_SHAPE = { normal: [-.6, 1.5], power: [-.6, 1.5], bunt: [-.5, 1.2] };      // 球頭端／握把端位置（相對 R0）：短打棒身略短而寬（棒身 1.7R0，但 R0 本身放大 1.25 倍，實際長度與一般棒相近），一般與強打 2.1R0
function batMinK(R, k, ax, ay) {      // 依「畫面上實際大小」保底球棒粗細：小螢幕（手機）上棒子不會細成一條線，電腦與平板維持原比例；最多加粗 35%
  try {
    const a = w2s(ax, ay, 0), b = w2s(ax + 1, ay, 0), dp = ov.width / VW();
    if (!isFinite(a.x) || !isFinite(b.x) || !(dp > 0)) return k;
    const ppu = Math.abs(b.x - a.x) / dp, tablet = Math.min(VW(), VH()) >= 600, need = MOB ? (tablet ? 8 : 7) : 8;      // ppu：好球帶處每 1 公尺等於幾 CSS px；need：棒頭半寬至少幾 px
    return clamp(need / (R * ppu), k, k * 1.35);
  } catch (e) { return k; }
}
function batZoneK(b, x, y) {      // 球棒移到打者的熱區略放大、冷區略縮小（每位球員的熱冷區不同）
  // 修正：原本是「格子跳變」＋「出好球帶瞬間回 1」，游標跨格線時球棒會突然變大變小。改成連續插值（格心之間雙線性內插、帶外平滑回歸 1）
  if (!b || !b.zone) return 1;
  const gx = clamp((x + ZW) / (2 * ZW) * 3 - .5, 0, 2), gy = clamp((ZC + ZH - y) / (2 * ZH) * 3 - .5, 0, 2);
  const x0 = Math.min(1, Math.floor(gx)), y0 = Math.min(1, Math.floor(gy)), fx = gx - x0, fy = gy - y0, Z = (cx, cy) => b.zone[cy * 3 + cx] || 0;
  const zv = Z(x0, y0) * (1 - fx) * (1 - fy) + Z(x0 + 1, y0) * fx * (1 - fy) + Z(x0, y0 + 1) * (1 - fx) * fy + Z(x0 + 1, y0 + 1) * fx * fy;
  const out = Math.max(0, zoneSDF(x, y) + ZPAD), fade = clamp(1 - out / .35, 0, 1);      // 離開好球帶 0.35 內逐漸淡出熱冷區效果
  return clamp(1 + zv * .07 * fade, .86, 1.15);
}
/* 球棒顯示／判定尺寸的緩動：目標尺寸（球種球速、強打開關、熱冷區）改變時不再瞬間跳變，畫面看到的大小就是揮棒判定使用的大小 */
const BATV = { R: 0, k: 0, ok: false, t: 0 };
function batTarget(b, ax, ay) {
  const fake = PT || { kmh: 140, id: 'ST', lv: 0, fx: aim.x, fy: aim.y, p: curPitcher() }, bunt = !!G.callBunt, pw = powOn() && !bunt;
  const R = batterR(b, fake, pw) * (bunt ? 1.25 : 1) * ((IS_TOUCH || MOB) ? 1.1 : 1);
  const k = batMinK(R, (bunt ? BAT_K.bunt : pw ? BAT_K.power : BAT_K.normal) * batZoneK(b, ax, ay), ax, ay);
  const minHalf = bunt ? .14 : pw ? .12 : .14;      // 球棒最粗處（半寬）下限：整支粗細約等於九宮格一格寬（一格≈.37）
  return { R, k: Math.max(k, minHalf / R) };
}
function batEase(b, ax, ay, force) {
  const tg = batTarget(b, ax, ay), now = performance.now(), dt = clamp((now - BATV.t) / 1000, 0, .1); BATV.t = now;
  if (!BATV.ok || force || BATV.b !== b) { BATV.R = tg.R; BATV.k = tg.k; BATV.ok = true; BATV.b = b; return BATV; }
  const a = 1 - Math.exp(-dt * 14);      // 約 0.1 秒內追上目標
  BATV.R += (tg.R - BATV.R) * a; BATV.k += (tg.k - BATV.k) * a; return BATV;
}
function batGeom(R0, cx, cy, side, k, mode) {
  const hd = -side, c = Math.cos(BAT_TILT), s = Math.sin(BAT_TILT), sh = BAT_SHAPE[mode] || BAT_SHAPE.normal;
  return { cx, cy, ux: hd * c, uy: -s, nx: hd * s, ny: c, r: R0 * (k || BAT_K.normal), tb: R0 * sh[0], th: R0 * sh[1], R0 };      // t：沿棒身（正＝握把）；w：垂直棒身（正＝球在棒上方）
}
function batContact(g, px, py) {
  const dx = px - g.cx, dy = py - g.cy, t = dx * g.ux + dy * g.uy, w = dx * g.nx + dy * g.ny, tc = clamp(t, g.tb, g.th);
  return { t, w, d: Math.hypot(t - tc, w), rr: g.r * (1 - .4 * clamp(tc / g.th, 0, 1)) };      // rr：該段棒身的半寬（球頭粗、握把細）
}
function drawBat(ax, ay, R0, col, lw, k, mode) {
  const g = batGeom(R0, ax, ay, E.bat ? E.bat.side : 1, k, mode), c = octx, N = 10, rr = t => g.r * (1 - .4 * clamp(t / g.th, 0, 1)), rh = rr(g.th), pw = mode === 'power';
  const P = (t, w) => w2s(g.cx + g.ux * t + g.nx * w, g.cy + g.uy * t + g.ny * w, 0);
  c.beginPath(); let q = P(g.tb, g.r); c.moveTo(q.x, q.y);
  for (let i = 0; i <= N; i++) { const t = g.tb + (g.th - g.tb) * i / N; q = P(t, rr(t)); c.lineTo(q.x, q.y); }
  for (let i = 1; i < N; i++) { const a = Math.PI / 2 - Math.PI * i / N; q = P(g.th + rh * Math.cos(a), rh * Math.sin(a)); c.lineTo(q.x, q.y); }      // 握把端圓頭
  for (let i = N; i >= 0; i--) { const t = g.tb + (g.th - g.tb) * i / N; q = P(t, -rr(t)); c.lineTo(q.x, q.y); }
  for (let i = 1; i < N; i++) { const a = -Math.PI / 2 - Math.PI * i / N; q = P(g.tb + g.r * Math.cos(a), g.r * Math.sin(a)); c.lineTo(q.x, q.y); }      // 球頭端圓頭
  c.closePath(); c.globalAlpha = .26; c.fillStyle = col; c.fill(); c.globalAlpha = 1;
  { const p0 = P(g.tb, 0), p1 = P(g.th, 0), gr = c.createLinearGradient(p0.x, p0.y, p1.x, p1.y);      // 球頭端較亮、握把端漸暗，立體感
    gr.addColorStop(0, 'rgba(255,255,255,.34)'); gr.addColorStop(.5, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fill(); }
  c.lineJoin = 'round'; if (pw) { c.shadowColor = col; c.shadowBlur = lw * 3.2; }      // 強打：棒身發出火光
  c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.shadowBlur = 0; c.shadowColor = 'transparent'; c.lineJoin = 'miter';
  const s0 = -R0 * .3, s1 = R0 * .3, a = P(s0, g.r * .7), b = P(s1, g.r * .7), d = P(s1, -g.r * .7), e = P(s0, -g.r * .7);      // 甜蜜點帶：球打在這一段最扎實
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.globalAlpha = .38; c.fillStyle = '#fff'; c.fill(); c.globalAlpha = 1;
  c.strokeStyle = col; c.lineWidth = Math.max(1, lw * .4); c.globalAlpha = .5;      // 握把止滑帶
  for (let i = 0; i < 3; i++) { const t = g.th * (.5 + .17 * i), p1 = P(t, rr(t) * .85), p2 = P(t, -rr(t) * .85); c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke(); }
  c.globalAlpha = 1;
  const m = P(0, 0), h1 = P(g.th, 0); c.beginPath(); c.arc(m.x, m.y, 2.6 * (lw / 3), 0, TAU); c.fillStyle = col; c.fill();
  c.beginPath(); c.arc(h1.x, h1.y, 4 * (lw / 3), 0, TAU); c.fillStyle = col; c.globalAlpha = .8; c.fill(); c.globalAlpha = 1;      // 握把端記號
  return { a: m, rad: Math.abs(P(0, g.r).y - m.y) };
}
const SWING_DELAY = 0.05, WIN = 0.07; let SWLOCK = 0;
const HINT = { on: false, x: 0, y: 0, t: 0, pt: null };      // 投球落點提示（更多設定可開關）：投手出手瞬間，在預估落點顯示半透明點（帶些許誤差，只是「大概」位置）
function batBusy() { const a = E.bat && E.bat.rig && E.bat.rig.anim; return (!!a && (a.name === 'swing' || a.name === 'recover')) || performance.now() < SWLOCK; }      // 按下→棒子實際過本壘板的時間（動畫 u=.5 的時點與此一致）
//      // 揮棒延遲縮短：球視覺上到達本壘板的瞬間按下，就是擊球瞬間
function resolveSwing(pt, sw, b) {
  // sw = {tc, cx, cy, power, bunt}; returns {kind: whiff|hit, ...}
  const mv = moodVol(b), mb = moodBonus(b);
  const sideB = E.bat.side, insA = sw.bunt ? 0 : clamp(-(pt.fx * sideB) / ZW, -1.4, 1.4);          // >0 內角（靠近身體）、<0 外角
  const inK = Math.min(Math.max(insA, 0), 1.2), outK = Math.min(Math.max(-insA, 0), 1.2);
  const idealS = 0;                                    // 最佳出手時機：內角略早（要在身體前方打）、外角偏晚（讓球多飛一點再打）
  const W = WIN * (sw.human ? 1.3 : 1) * (sw.power ? 0.90 : 1) * (1 - rainBK() * .04) * (sw.bunt ? 1.25 : 1) * (sw.bunt ? 1 : 1 - inK * .08 + outK * .03) * (G.hitAndRun && !sw.bunt ? 1.08 : 1), R0 = sw.R || batterR(b, pt, sw.power) * (sw.bunt ? 1.25 : 1);
  let dt = sw.auto ? clamp((sw.bz + .45) / .5, -1.2, 1.2) * WIN : sw.tc - (sw.human && pt.Tv ? pt.Tv : pt.T);      // 時機＝揮棒接觸瞬間與球到達本壘板時刻的差，無隨機誤差
  let dtE = dt - idealS * W, Wd = W * (dtE < 0 ? 1 - outK * .12 + inK * .04 : 1 + outK * .12 - inK * .10), adt = Math.abs(dtE);   // 相對最佳時機的偏差；內角晚側窗口窄、外角晚側窗口寬／早側窗口窄
  const jx = sw.human ? 0 : gauss() * .012 * Math.max(0, mv - .7), jy = sw.human ? 0 : gauss() * .012 * Math.max(0, mv - .7);      // 玩家揮棒不加隨機偏移：位置與時機對了就不會被「隱形誤差」判成揮空
  let bq = swingBallPos(pt, sw), bxp = bq.x, byp = bq.y;
  let pj = sw.auto ? { x: bxp, y: byp } : (projPlane(bq.x, bq.y, bq.z), { x: _pj.x, y: _pj.y });      // 以畫面上看到的球位置判定擊球框
  let BG = batGeom(R0, sw.cx, sw.cy, sideB, sw.k || (sw.bunt ? BAT_K.bunt : sw.power ? BAT_K.power : BAT_K.normal) * batZoneK(b, sw.cx, sw.cy), sw.bunt ? 'bunt' : sw.power ? 'power' : 'normal'), bc = batContact(BG, pj.x + jx, pj.y + jy), d = bc.d;
  // —— 玩家揮棒：實況野球式判定 ——
  // 只要球棒畫面上確實碰到球、且出棒時機落在窗口內，就一定有結果（最差也是界外／擦棒），不再「棒子明明蓋住球卻揮空」。
  // ① 窗口放寬到 1.5 倍（過窗的部分只會是品質很差的擦棒）② 球棒是「掃過」本壘板：在出棒瞬間前後 ±0.035 秒內只要有任一刻碰到球就算碰到 ③ 球半徑用完整尺寸判定
  const humanA = !!sw.human && !sw.auto, CW = humanA ? 1.65 : 1.15, RB = BALL_R * (humanA ? 1.1 : .85), EARLY_IN = .6;
  const wdOf = dE => W * (dE < 0 ? 1 - outK * .12 + inK * .04 : 1 + outK * .12 - inK * .10);
  // 球在畫面上已經進到擊球框內才出棒：玩家眼中「球到了」，偏早的部分只算 60%（球實際離本壘還有一小段，但畫面上已和擊球框重疊）
  if (humanA && dtE < 0 && d <= bc.rr + BALL_R * .3) { dt *= EARLY_IN; dtE = dt - idealS * W; Wd = wdOf(dtE); adt = Math.abs(dtE); }
  if (humanA && d > bc.rr + RB && adt <= Wd * CW + .06) {
    let best = null;
    for (const o of [-.035, -.03, -.025, -.02, -.015, -.01, -.005, .005, .01, .015, .02, .025, .03, .035]) {
      const tc2 = sw.tc + o, dt2r = tc2 - (sw.human && pt.Tv ? pt.Tv : pt.T);
      const bq2 = swingBallPos(pt, { tc: tc2 }); const pj2 = (projPlane(bq2.x, bq2.y, bq2.z), { x: _pj.x, y: _pj.y }), bc2 = batContact(BG, pj2.x + jx, pj2.y + jy);
      if (!(bc2.d <= bc2.rr + RB)) continue;
      const dt2 = (dt2r < 0 && bc2.d <= bc2.rr + BALL_R * .3) ? dt2r * EARLY_IN : dt2r, dtE2 = dt2 - idealS * W, Wd2 = wdOf(dtE2), adt2 = Math.abs(dtE2);
      if (adt2 > Wd2 * CW) continue;
      if (!best || bc2.d - bc2.rr < best.bc.d - best.bc.rr) best = { bq: bq2, pj: pj2, bc: bc2, dt: dt2, dtE: dtE2, Wd: Wd2, adt: adt2 };
    }
    if (best) { bq = best.bq; bxp = bq.x; byp = bq.y; pj = best.pj; bc = best.bc; d = bc.d; dt = best.dt; dtE = best.dtE; Wd = best.Wd; adt = best.adt; }
  }
  if (adt > Wd * CW || d > bc.rr + RB) return { kind: 'whiff', dt, d, R: R0, dtE, adt, Wd, pz: bq.z };      // 球心落在球棒框（含球半徑）內且時機在窗口內＝一定碰得到
  const rrRef = bc.rr * (.5 / Math.max(BG.r / R0, .01)), un = bc.t / R0, wn = bc.w / rrRef;
  const fr = Math.min(1, d / (bc.rr + BALL_R * .85)), endC = bc.t < BG.tb - .01 || bc.t > BG.th + .01, eOff = clamp(bc.w / (bc.rr + BALL_R * .85), -1, 1);      // fr：球邊緣與棒邊緣的重疊程度（1＝只剛好擦到邊）；eOff：球相對棒軸的上下偏移（真實幾何）；endC：球打在棒子最前端／握把末端      // 上下偏移用「標準棒寬」正規化：棒子變細不會讓邊緣擊球變得更極端（否則滿場滾地球／內野小飛球）                                  // 球在棒上的位置：un<0 球頭、0 甜蜜點、>0 握把；wn>0 球在棒上方（打到球下緣）
  const dn = clamp((Math.hypot(un < 0 ? -un * .9 : un * .5, Math.abs(wn) * .8) - .2) / .8, 0, 1), qs = 1 - dn * dn * (3 - 2 * dn);   // 甜蜜點＝最佳，往球頭／握把／上下緣越來越差
  let Q = 0.5 * qs + 0.5 * (1 - Math.pow(clamp(adt / (Wd * 1.15 * (humanA ? .86 : 1)), 0, 1), 1.5));
  Q = clamp(Q + gauss() * 0.06 * (.6 + .4 * mv), 0, 1);      // 擊球品質隨機抖動：同樣的揮棒也會有「打得比預期好／差」的感覺
  const side = sideB;
  let chase = 0, far = false;                                               // 壞球程度：0＝好球帶內，1＝勉強碰得到的極限
  if (!sw.bunt) {
    const od = Math.max(0, outsideDist(pt.fx, pt.fy) - ZPAD);                 // 擦到判定好球帶邊緣（含球半徑）者視同好球帶內
    if (od > 0) {
      const reach = clamp(.3 + b.con * .0036 + b.eye * .0007 - (pt.id === 'ST' ? 0 : pt.lv * .01) - Math.max(0, pt.kmh - 140) * .0012 - (sw.power ? .03 : 0) - rainBK() * .03 - ((pt.p.stf == null ? 60 : pt.p.stf) - 60) * .0005, .22, .72);
      if (!humanA && od > reach * 1.15) return { kind: 'whiff', dt, d, R: R0, dtE, adt, Wd, pz: bq.z };          // 太外側的壞球：揮空
      chase = clamp(od / reach, 0, 1);
      // 邊緣壞球（chase<.3）只要位置與時機到位就必定碰到；愈遠愈難，變化球愈遠愈容易揮空
      const brk = ['SL', 'CU', 'FK', 'SV', 'SK', 'SH'].includes(pt.id) ? 1 - .12 * clamp((chase - .3) / .7, 0, 1) : 1;
      const tight = (d < R0 * .5 && adt < Wd * .5) ? .5 : 1;                  // 擊球點與時機都很準：不容易被壞球騙到揮空
      const pc = chase < .3 ? 1 : clamp(1 - Math.pow((chase - .3) / .7, 1.3) * .8 * tight, .15, 1);
      if (!humanA && Math.random() > pc * brk) return { kind: 'whiff', dt, d, R: R0, dtE, adt, Wd, pz: bq.z };
      Q = clamp(Q * (1 - chase * .45), 0, 1);                                  // 擊球點差：甜蜜點命中率下降、很難打成安打／全壘打
    }
  }
  if (sw.bunt) return resolveBunt(pt, sw, b, dt, d, R0, Q);
  const graze = fr > (humanA ? .96 : .88), marginal = d > rrRef * (humanA ? 1.0 : 0.92) || adt > Wd * (humanA ? 1.2 : 0.98) || chase > (humanA ? .8 : .7) || graze;
  // —— 擊球幾何 ——
  const s = clamp(dt / W, -1.2, 1.2);                                     // 絕對時機：<0 偏早 / >0 偏晚（決定拉打／推打）
  const sR = clamp(dtE / Wd, -1.2, 1.2);                                  // 相對該位置最佳時機的偏差（決定打在球棒哪個位置）
  const v = clamp(eOff * 1.15, -1.2, 1.2);      // 以真實接觸幾何決定：球在棒軸上方＝打到球下緣（飛高）、下方＝打到球上緣（滾地）                                         // >0：球在棒上方＝球棒打在球的下半部（上飄/後旋）；<0：打在上半部（滾地／前旋）
  const hz = clamp((pj.x - sw.cx) / Math.max(R0, .3), -1.2, 1.2);         // 內外角偏移
  const inside = insA, tkm = clamp((pt.kmh - 135) / 20, -.6, 1);
  const skill = clamp((b.pow * .45 + b.con * .55 - 38) / 52, 0, 1.15);    // 打者綜合能力（力量＋打擊）
  const pskill = clamp((b.pow * .75 + b.con * .25 - 38) / 52, 0, 1.15), pwk = clamp((b.pow - 45) / 40, 0, 1);      // 長打能力：以力量為主（力量型才吃得到強打／甜蜜點的長打加成）
  const hand = clamp(1.15 - b.pow * .003 - b.con * .002, .65, 1.1);       // 內角處理能力：力量／打擊好的打者較能處理
  const lvk = pt.id === 'ST' ? 0 : clamp(pt.lv / 7, 0, 1.2), dom = pt.p.dom || 0;
  const PJ = { CT: .16, TS: .09, SK: .07, ST: .05, SL: .04 }[pt.id] || .02;                       // 球種內角壓制力（卡特／二縫線最會逼進握把）
  const OA = { SL: .12, CU: .10, SV: .10, CH: .12, FK: .08, SK: .05, SH: .08 }[pt.id] || .02;     // 球種外角引誘滾地／打壞（外角遠離球棒）
  const press = clamp(.55 + lvk * .35 + tkm * .2 + PJ + dom * .04 - skill * .45, .1, 1.25);        // 被壓制程度：投手球威＋球種vs打者能力
  let base = sR * .85; if (outK > 0 && sR > 0) base *= 1 - .3 * Math.min(outK, 1);                 // 外角偏晚：球反而更接近球棒甜蜜點
  const bpu = clamp(un < 0 ? un * .55 : un * .5, -.6, 1);                  // 球實際落在球棒的哪一段：球頭（負）→甜蜜點→握把（正）
  const bp = clamp(base + bpu + inK * (sR > 0 ? sR * .30 * hand * (.7 + press * .5) : sR * .14) + outK * (sR < 0 ? sR * .22 * (.8 + OA * 2) : 0) + gauss() * .07 * mv, -1.25, 1.25);
  // 球棒擊球位置 bp：<0 球頭、>0 握把。內角：偏晚＝握把被壓制，偏早＝球頭拉打；外角：偏早＝球頭（出棒過早、滾地／拉偏），偏晚＝推向反方向
  const cz = bp > .62 ? 'handle' : bp > .32 ? 'near' : bp < -.58 ? 'end' : bp < -.30 ? 'tip' : 'sweet';
  // 紮實擊球係數 solid（0～1）：時機準（Q 高）＋打在甜蜜點＋球不在棒子上下緣 → 球出去要明顯比較強勁、比較穩（初速加成／下限、仰角與隨機抖動縮小）；擦邊、壞球、短打一律為 0
  const solid = (sw.bunt || marginal || cz !== 'sweet') ? 0 : clamp((Q - .6) / .3, 0, 1) * clamp(1 - (Math.abs(v) - .3) / .3, 0, 1);
  // 初速：球棒速度(力量)×擊球效率(Q、甜蜜點)＋來球速度，再乘心情加成與投手壓制力
  const pw = b.pow * 0.005, w0 = G.wx || { temp: 26 };
  let ev = 15 + 25 * (.25 + .75 * Q) * (0.48 + pw * 0.92) * (sw.power ? 1 + .09 * clamp((b.pow - 30) / 55, .1, 1.15) : 1) + (Q > .85 ? (sw.power ? 1.6 + 1.4 * clamp((b.pow - 35) / 55, 0, 1) : 1.8) : 0);   // 降低初速：只有甜蜜點＋高力量＋適當仰角才會出牆
  ev += (pt.kmh - 140) * .04 * Q; if (pt.id !== 'ST') ev *= 1 - Math.max(0, pt.lv - 3) * .006 * (1 - Q * .4);
  ev *= 1 + mb * .55 - dom * .03;
  ev *= 1 - clamp(((pt.p.stf == null ? 60 : pt.p.stf) - 60) * .0010, -.03, .045);      // 球威強的投手：同樣擊中也較難打出強勁初速
  ev *= clamp(1 - Math.max(0, Math.abs(bp) - .3) * .30 * (bp > 0 ? 1.1 + press * .35 : 1), .6, 1);
  if (b.ultra) ev = Math.max(ev, 30 + 8 * Q) * 1.12;      // 傳說球員：任何擊球都非常強勁    // 離開甜蜜點：握把端（被壓制）損失比球頭端更大
  if (inK > .25 && s < 0) ev *= 1 + clamp(-s, 0, 1) * Math.min(inK, 1) * .07 * Q * (.7 + pskill * .5) * (bp < -.3 ? 1.35 : 1);   // 內角球偏早、打在甜蜜點／球棒前端：拉得出去、力道略增
  if (outK > .2) ev *= 1 - clamp(.07 * (1.05 - skill) * outK * Math.max(0, sR), 0, .08);           // 外角推向反方向：力量不足的打者長打力減弱
  if (outK > .2 && sR < -.25) ev *= 1 - clamp((-sR - .25) * outK * (.10 + OA * .6), 0, .14);       // 外角出棒過早：球棒壓過球，力道流失
  ev *= 1 - .22 * clamp(Math.abs(v) - .6, 0, 1);                           // 打在球的最上/最下緣：能量損失
  if (sw.power && Q > .6) ev *= 1 + (Q - .6) * .10 * (.5 + pskill * .6);   // 強打＋紮實擊球：力量好的打者飛得更遠
  const sweetP = sw.power ? clamp(1 - (Math.abs(bp) - .1) / .35, 0, 1) * clamp((Q - .5) / .4, 0, 1) : 0;      // 強打且球落在棒子甜蜜點：額外加成
  if (sweetP > 0) { ev *= 1 + sweetP * .045 * (.6 + pskill * .5); ev += sweetP * .6 * (.4 + pwk * .8); }
  if (solid > 0) { ev *= 1 + solid * .03 * (.7 + pskill * .4); ev = Math.max(ev, 25 + solid * (3.5 + 1.5 * pwk)); }      // 甜蜜點＋好時機：小幅初速加成與保底（力量普通約 28.5 m/s、力量型約 30 m/s）：只確保不會軟弱，不額外增加全壘打
  if (ev > 30) ev = 30 + (ev - 30) * 0.85;

        // 高初速區壓縮：非力量型打者就算打到甜蜜點也不容易出牆，力量型才飛得遠
  ev *= 1 + clamp((w0.temp - 24) * .0009, -.017, .017);                      // 氣溫：天熱球彈性好、天冷偏悶
  ev *= (1 + gauss() * 0.07 * mv * (1 - solid * .6)) * (1 - rainBK() * .05);                 // 雨天：球濕滑、衝擊力減弱（大雨／暴雨更明顯）；紮實擊球的初速隨機抖動較小
  let ang = 3.0 + b.traj * 2.6 + v * 26 * (1 - solid * .3) + clamp(Q - .7, 0, .3) * 12 * (.5 + b.pow * .006) + gauss() * (8 + 10 * (1 - Q)) * (1 - solid * .35) * (.6 + .4 * mv) * clamp(1.3 - b.con * .006, .75, 1.2);      // 打擊技巧好：仰角穩定
  if (sw.power) ang += 1.8 + Q * 1.4 + sweetP * .8;                                      // 強打：揮棒上揚、擊球仰角較高（甜蜜點時更明顯）→ 容易飛得夠遠
  // 球種特性：沉球／指叉／曲球容易打出滾地球，直球上飄容易打成飛球
  const BRK = { SK: -4.5, TS: -2.2, SH: -2, CH: -2.4, FK: -5, CU: -3.2, SL: -1.4, SV: -2.2, ST: 1.6, CT: -.4 };
  ang += (BRK[pt.id] || 0) * (.6 + pt.lv * .07) * (1.15 - Q * .55) * (1 - solid * .4);      // 紮實擊中：下沉球種也較不容易被壓成滾地球
  if (bp > .32) { const j = bp - .32; ang += j * (10 + press * 10) * (1 + inK * .5); ev *= 1 - j * .2 * (.8 + press * .5); }    // 被壓制（球靠握把）：仰角變高、力道變弱
  if (bp < -.3 && outK > .15) ang -= (-bp - .3) * 8 * outK * (1 + OA * 3);      // 外角打在球頭：球棒蓋過球，打成滾地球
  if (outK > .2 && sR > .35) ang += (sR - .35) * 5 * outK * (1.1 - skill * .5);  // 外角偏晚、推向反方向：容易變成淺飛球
  if (v > .5) { const k = clamp((v - .5) / .7, 0, 1); ang += k * k * (36 + Math.random() * 16); ev *= 1 - .4 * k; }      // 棒子打到球的下緣：愈靠邊緣愈往上飛，邊緣甚至是飛得極高、力道很弱的「沖天炮」
  else if (v < -.5) { const k = clamp((-v - .5) / .7, 0, 1); ang -= k * k * (24 + Math.random() * 8); ev *= 1 - .22 * k; }      // 棒子打到球的上緣：往下壓成滾地球／彈地球
  if (ang < 14 && Q > .6) ev *= 1 + (Q - .6) * .2 * (.85 + b.con * .003);                       // 紮實擊中的低仰角球：強勁滾地球／平飛球
  if (cz === 'sweet' && Q > .6 && !sw.bunt) { const pull = Math.min(.85, clamp((Q - .6) / .4, 0, 1) * (.2 + skill * .25) * (1 + solid * .15)); ang += (clamp(ang, 7 + pwk * 2, 22 + pwk * 4) - ang) * pull; ev *= 1 + pull * .06 * (.6 + pskill * .6); }      // 甜蜜點＋好時機：球被打成「黃金仰角」的強勁平飛／長打，能力越強越明顯
  if (G.hitAndRun && !sw.bunt && ang > 4 && ang < 32) ang -= Math.min(ang - 3, 3.5 + Math.random() * 3.5);      // 打帶跑：打者壓低球路、盡量打成滾地球，配合起跑的跑者
  if (G.offCall === 'sacfly' && !sw.bunt && G.on[2] && ang < 20) ang += Math.min(20 - ang, 5 + Math.random() * 5);      // 犧牲高飛：打者刻意把球打高，讓三壘跑者有機會觸壘跑回
  ang = clamp(ang, -26, 78);
  let th = side * s * 48 - side * 8 - side * inside * (inside > 0 ? 8 : 6.5) + (pj.x - sw.cx) / Math.max(R0, .3) * 8 + gauss() * (15 + 16 * (1 - Q)) * (.6 + .4 * mv);   // 內角偏拉、外角偏推
  if (marginal) {      // 擦邊／時機邊緣：方向由接觸幾何決定（球在棒頭側／偏早→拉向界外側，握把側／偏晚→推向另一側），力道依偏離程度遞減，不再擲硬幣
    const off = clamp(Math.max(d / Math.max(rrRef, .01) - .9, adt / Math.max(Wd, .01) - .9, 0), 0, 1.2), dirS = (Math.abs(s) > .25 ? Math.sign(s) : (un < 0 ? -1 : 1));
    th += dirS * side * (humanA ? 6 + off * 22 : 18 + off * 40) + gauss() * 4; ev *= humanA ? 1 - .12 * clamp(off, 0, 1) : 0.7; }
  let broken = false, tip = false, tipKind = null, tipText = null, foulTip = false;
  if (!sw.bunt) {
    // 斷棒：球打在握把端被壓制、或擦到棒子邊緣，棒子可能斷裂 → 球軟弱、仰角高、落點難測（常是飄過內野的小飛球）
    const hardP = clamp((pt.kmh - 142) / 16, 0, 1) * .6 + lvk * .35;      // 強勁球（球速快／球種威力大）更容易震斷球棒
    if ((((bp > .5 || bp < -.62 || Math.abs(v) > .8) && Q < .58 && Math.random() < .09 + press * .06 + hardP * .07) || (Q < .3 && bp > .3 && Math.random() < .06 + hardP * .04)) && !marginal) { broken = true; ev *= .55 + Math.random() * .15; ang = clamp(ang + 9 + Math.random() * 11, -26, 78); th += gauss() * 9; }
    // 擦棒：只擦到球的邊緣，球往後方高高飛起（界外高飛球／捕手後方的小飛球）
    else if (graze || (!humanA && marginal && Math.random() < .18)) {      // 擦棒：只擦到球的邊緣——依擦到球的哪個位置，結果不同
      tip = true; Q = Math.min(Q, .2); const rs = Math.random();
      if (endC || (graze && Math.abs(v) < .55 && rs < .4)) { tipKind = 'side'; tipText = '擦邊・界外'; th = side * (Math.random() < .5 ? 1 : -1) * (35 + Math.random() * 45); ang = 2 + Math.random() * 24; ev = 14 + Math.random() * 10; }      // 擦到球的側邊／棒子末端：切向左右界外
      else if (v > 0) {
        if (rs < .2) { tipKind = 'stand'; tipText = '擦棒！飛向後方看台'; th = side * (158 + Math.random() * 28); ang = 32 + Math.random() * 22; ev = 21 + Math.random() * 8; }      // 擦棒後高高飛過後網進看台：撿不回來的界外球
        else if (rs < .42) { tipKind = 'foultip'; tipText = '擦棒！直飛後方'; foulTip = true; th = side * (168 + Math.random() * 10); ang = 2 + Math.random() * 10; ev = 24 + Math.random() * 10; }      // 擦到球正後下緣：像子彈般直飛捕手後方
        else { tipKind = Math.random() < .3 ? 'stand' : 'pop'; tipText = tipKind === 'stand' ? '擦棒！飛向後方看台' : '擦棒高飛'; th = side * (150 + Math.random() * 25); ang = 42 + Math.random() * 26; ev = 8 + Math.random() * 8; if (tipKind === 'stand') { th = side * (158 + Math.random() * 28); ang = 32 + Math.random() * 22; ev = 21 + Math.random() * 8; } }      // 擦到球下緣：往後方高高飛起
      } else { tipKind = 'chop'; tipText = '擦棒滾地'; th = side * (Math.random() < .5 ? 1 : -1) * (25 + Math.random() * 60); ang = -12 + Math.random() * 10; ev = 6 + Math.random() * 9; }      // 擦到球上緣：軟弱的滾地小球
    }
  }
  // 旋轉：打球下緣→後旋（飄得遠）；打上緣→前旋（急墜）。握把壓制減少後旋、外角打球頭增加前旋
  const spinB = clamp(1 + v * .95 + (ang - 18) * .012 - Math.max(0, bp - .4) * .5 - outK * Math.max(0, -bp - .3) * .6 + gauss() * .12 * mv, -.8, 2.1);
  const spinS = clamp(bp * .22 * side + gauss() * .12 * mv, -.55, .55);
  const luck = gauss() * (1 - solid * .35) * (.9 + .5 * mv) * clamp(1.32 - skill * .4, .85, 1.3) * Math.pow(G.day || 1, .5) * (1 + windK() * .3 + Math.max(0, rainBK() - .8) * .35);              // 不可控因素：陣風、擊中縫線、地面彈跳…（風大時更不穩定）
  return { kind: 'hit', broken, tip, tipKind, tipText, foulTip, ev, ang, th, Q, dt, d, R: R0, power: sw.power, marginal, s, sR, v, hz, bp, cz, inside, press, spinB, spinS, luck, W: Wd, mv, px: bxp, py: byp, pz: bq.z };
}
function resolveBunt(pt, sw, b, dt, d, R0, Q) {
  // 短打：結果由「球在棒上的接觸點(內外/上下)」「接觸時機(深度)」「球種球速與好壞球位置」「打者短打技術・心情・雨天」共同決定。
  // 技術越高越能把球壓死、控制方向；來球快、變化大、位置差（偏高／偏外）會增加小飛球、界外、擦棒與強彈的機率。
  const skill = clamp(((b.bunt || 60) / 100) * (1 + moodBonus(b) * .6) * (1 - rainBK() * .08), .2, .97), sneak = !!G.sneak, mv = moodVol(b), side = E.bat.side;
  const bq = swingBallPos(pt, sw), bxp = bq.x, byp = bq.y;
  const s = sw.auto ? clamp((sw.bz + .45) / .5, -1.2, 1.2) : clamp(dt / WIN, -1.2, 1.2);              // <0：球還在前面就碰到(偏早)　>0：球已深入(偏晚)
  const hz = clamp((bxp - sw.cx) / Math.max(R0, .3), -1.2, 1.2), v = clamp((byp - sw.cy) / Math.max(R0, .3), -1.2, 1.2);   // 球相對棒心的內外／高低
  const od = Math.max(0, outsideDist(pt.fx, pt.fy)), mov = (pt.spec.sx || 1) * .5 + (pt.spec.sy || 1) * .5;
  const hard = clamp((pt.kmh - 125) * .006 + pt.lv * .022 + (['SL', 'CU', 'FK', 'SV', 'CT'].includes(pt.id) ? .07 : 0) + (mov - 1) * .1 + od * .35 + Math.max(0, Math.abs(pt.fx) - ZW) * .15, 0, .65);
  const Qe = clamp(Q - hard * .45 + (skill - .6) * .25 + gauss() * .05 * mv, 0, 1);
  const mk = (extra) => Object.assign({ kind: 'hit', Q: Qe, bunt: true, sneak, dt, d, R: R0, s, v: 0, bp: 0, spinB: -.3, spinS: 0, hz, px: bxp, py: byp, pz: bq.z }, extra);
  // 擦棒／球棒邊緣：容易變成界外球（二好球時＝三振）
  if (Qe < .2 && Math.random() < .55 + (1 - skill) * .35) { const dir = (hz * side >= 0 ? 1 : -1) * (Math.random() < .7 ? 1 : -1); return mk({ ev: 2 + Math.random() * 3, ang: 8 + Math.random() * 28, th: dir * (52 + Math.random() * 40), luck: gauss() * .5, tip: true }); }
  if (Qe < .08 && Math.random() < (1 - skill) * .6) return { kind: 'whiff', dt, d, R: R0, pz: bq.z };            // 完全沒碰準（球從棒下／上擦過）
  // 球速：技術壓得越死越慢；來球快則彈得遠；打點(Qe)差球會彈得更用力
  const dead = clamp(skill * (.5 + .5 * Qe), 0, 1);
  let ev = 1.8 + (1 - dead) * 2.9 + (pt.kmh - 120) * .011 + gauss() * (.35 + .5 * (1 - skill)) * (.6 + .4 * mv);
  if (sneak) ev *= 1.0;
  ev = clamp(ev, 1.8, 7.5);
  // 仰角：打到球下緣(v>0)＝小飛球；高球(好球帶上緣以上)更容易；技術差、打點差、速球更容易出現
  const hiBall = clamp((byp - (ZC + ZH * .25)) / .6, 0, 1), loBall = clamp(((ZC - ZH * .6) - byp) / .5, 0, 1);
  let ang = -5 + v * 13 + hiBall * 6 - loBall * 3 + gauss() * (1.4 + 4.5 * (1 - skill));
  const popP = clamp((1 - skill) * .22 + (1 - Qe) * .22 + hiBall * .22 + Math.max(0, v - .45) * .45 + hard * .12 - loBall * .1, 0, .75) * .6;
  if (Math.random() < popP) { ang = 22 + Math.random() * 20; ev *= .8; }
  ang = clamp(ang, -16, 46);
  // 方向：偏早→拉向三壘側／偏晚→推向一壘側(依打者左右打)；球打在棒子內外側改變角度；技術低、打點差方向散得更開
  let th = side * s * 26 + hz * side * 16 + gauss() * (2.5 + 15 * (1 - skill)) * (1.15 - Qe * .5) * (.8 + .2 * mv);
  th += (th >= 0 ? 1 : -1) * 6;
  if (sneak) { const dir = Math.abs(th) > 4 ? Math.sign(th) : (Math.random() < .5 ? -1 : 1); th = dir * (14 + Math.random() * 24) + gauss() * (2 + 7 * (1 - skill)); }
  return mk({ ev, ang, th, luck: gauss() * .5 });
}

/* ---------------- ball physics ---------------- */
const GRAV = 9.8, DRAG = 0.0028;
const LIFT = .028, SIDEF = .028;
/* ---------- 擊球軌跡類型：依仰角、初速、旋轉挑一種真實棒球常見的飛行／滾動方式（約三成的球會出現） ----------
   skim 貼地平飛球（低彈道貼著草皮飛、落地後連續低彈跳）  dive 前旋下墜球（平飛到一半突然下沉）  rise 上飄平飛球（後旋強、球越飛越高）
   hook 彎曲飛球（強烈側旋，往界外或界內拐彎）  float 飄忽飛球（弱旋轉亂飄）  hop 落地長彈跳（前旋飛球落地後大彈跳再往前滾）
   curveRoll 旋轉滾地球（滾動中慢慢拐彎）  skipper 連續彈跳滾地球（像打水漂） */
const STY_NOTE = { skim: ['貼地平飛球！', '#fff', '#2a8'], dive: ['前旋下墜球！', '#fff', '#c63'], rise: ['上飄平飛球！', '#fff', '#39c'], hook: ['彎曲飛球！', '#fff', '#a5f'], float: ['飄忽飛球！', '#fff', '#68a'], hop: ['落地長彈跳球！', '#fff', '#a82'], curveRoll: ['旋轉滾地球！', '#fff', '#a5f'], skipper: ['連續彈跳滾地球！', '#fff', '#2a8'], rocket: ['強襲滾地球・穿越內野！', '#fff', '#e44'], laser: ['強襲平飛球・直擊空檔！', '#fff', '#e44'], bloop: ['軟弱小飛球・落在空檔！', '#fff', '#68a'], line: ['貼線強襲球！', '#fff', '#e83'] };
function pickBatStyle(res) {
  if (!res || res.bunt || res.tip || res.foulTip) return null;
  const a = res.ang, ev = res.ev || 0, Q = res.Q == null ? .5 : res.Q, sb = res.spinB == null ? 1 : res.spinB, r = Math.random();
  // v6 新球路：強襲滾地穿越、強襲平飛直擊空檔、貼線強襲、軟弱落空檔小飛球（打者越強、擊中越扎實越常見）
  if (a > -9 && a < 6 && ev >= 31.5 && Q > .6 && Math.random() < .3 + (Q - .6) * .6) return 'rocket';
  if (a >= 6 && a < 17 && ev >= 35 && Q > .68 && Math.random() < .26 + (Q - .68) * .5) return 'laser';
  if (a >= 25 && a < 48 && ev < 24 && Q < .6 && Math.random() < .4) return 'bloop';
  if (a >= 2 && a < 15 && ev >= 30 && Q > .5) { if (r < .34) return 'skim'; if (r < .52) return 'dive'; return null; }      // 紮實的低彈道平飛球
  if (a >= 9 && a < 22 && ev >= 31 && sb > .9 && r < .32) return 'rise';
  if (a >= 15 && a < 23 && ev >= 27 && sb < .55 && r < .4) return 'dive';
  if (a >= 20 && a < 46 && ev >= 24 && r < .26) return 'hook';
  if (a >= 24 && ev < 31 && r < .34) return 'float';
  if (a >= 14 && a < 40 && ev >= 22 && sb < .65 && r < .4) return 'hop';
  if (a < 5 && a > -26) { if (ev < 27 && r < .38) return 'curveRoll'; if (ev >= 24 && r < .3) return 'skipper'; }
  return null;
}
function shapeBatted(res) {      // 強襲球：方向會被「內野手之間／外野手之間」的空檔吸引；貼線球有機會貼著邊線飛
  const st = res.sty; if (!st || st === 'bloop') return;
  if (st === 'rocket' || st === 'laser') {
    const gaps = st === 'rocket' ? [-28, 0, 28] : [-16, 16, -43, 43]; let g = gaps[0]; for (const x of gaps) if (Math.abs(x - res.th) < Math.abs(g - res.th)) g = x;
    const dd = Math.abs(g - res.th); if (dd < (st === 'rocket' ? 11 : 9)) { res.th += (g - res.th) * (.45 + clamp(res.Q, 0, 1) * .35); res.thru = true; }
    res.ev *= st === 'rocket' ? 1.06 : 1.03; if (st === 'rocket') res.ang = Math.min(res.ang, 4);
    if (Math.abs(Math.abs(res.th) - 43) < 4) res.sty = 'line';
  }
}
function ballEnv(res) {            // 風、氣溫、旋轉、運氣 → 物理環境
  const w = G.wx || { spd: 0, dir: 0, temp: 26 }, gust = res ? clamp(res.luck, -2.4, 2.4) * .95 : 0;     // 擊球當下的陣風
  const rr = rainK(), wm = 1 + clamp(rr - .55, 0, .25) * .5 + clamp(rr - .8, 0, .2) * 1.5, ws = w.spd * clamp(.3 + Math.pow(Math.min(w.spd, 11) / 11, 2) * .7, .3, 1), gk = .5 + .5 * clamp(w.spd / 9, 0, 1), wx = ws * wm * Math.sin(w.dir * Math.PI / 180) + gust * .5 * gk, wz = -ws * wm * Math.cos(w.dir * Math.PI / 180) - gust * gk;      // 微風～中風對球的影響大幅減弱，暴雨（約 8 m/s 以上）才明顯
  return { wx, wz, back: res ? res.spinB * (1 - rainBK() * .08) : 1, side: res ? res.spinS : 0, hop: res ? res.luck : 0, seed: (Math.random() * 4294967296) >>> 0, rough: clamp((.72 + Math.random() * .6) * (1 + rainBK() * .5) * (1 + Math.abs(res ? res.luck : 0) * .1), .6, 2.1), swirl: 1 + windK() * 1.6 + rainBK() * .5, drag: (1 - (w.temp - 24) * .0025) * (1 + rainBK() * .09), roll: 1 + rainBK() * .42 + clamp((20 - w.temp) * .006, 0, .08), rest: 1 - rainBK() * .14 - clamp((22 - w.temp) * .0025, 0, .04), pud: PUD.lvl > .55 ? 1 : 0, sty: res && res.sty !== undefined ? res.sty : pickBatStyle(res) };     // 濕地：滾動阻力大、彈跳低；低溫：球偏硬悶
}
function mkRng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }      // 每一球一個種子：同一球的模擬結果固定，但每球不同
function simulateBall(p0, v0, maxT, env) {
  env = env || { wx: 0, wz: 0, back: 1, side: 0, hop: 0, drag: 1, roll: 1, rest: 1 };
  const S = [], dt = 1 / 60; let x = p0.x, y = p0.y, z = p0.z, vx = v0.x, vy = v0.y, vz = v0.z, t = 0, bk = env.back, sd = env.side;
  let pudHit = null, first = null, hr = false, wallHit = false, bounces = 0, stopped = false, over = null, wallT = 0, wallY = 0; const BN = [];
  /* ---- 不可控因素（以種子隨機，每球不同）---- */
  const rng = mkRng(env.seed || 20260), RN = (a, b) => a + (b - a) * rng(), RG = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  const rough = env.rough || 1, swl = env.swirl || 1;
  const sw1 = { a: RN(.15, .9) * swl, b: RN(.15, .9) * swl, f1: RN(.7, 1.9), f2: RN(.6, 1.6), p1: RN(0, TAU), p2: RN(0, TAU) };      // 高空亂流：飛行中風向風速微幅擺盪
  const fp = { p1: RN(0, TAU), p2: RN(0, TAU), p3: RN(0, TAU) };                                                                    // 草皮軟硬／長短不一的「地面狀況場」
  const sty = env.sty || null, skimT = RN(.5, 1.1), diveT = RN(.32, .62), diveG = RN(4.2, 7.5), skipOn = sty === 'skim' || sty === 'skipper' || sty === 'rocket', rollC = sty === 'curveRoll' ? (rng() < .5 ? -1 : 1) * RN(.10, .32) : 0;
  if (sty === 'skim') vy = Math.min(vy, 3.1 + Math.max(0, vy - 3.1) * .25);
  if (sty === 'rocket') vy = Math.min(vy, 1.2);      // 強襲滾地球：幾乎貼地飛出                                                          // 貼地平飛：出棒仰角壓低，球不會飛高
  if (sty === 'rise') bk = Math.max(bk, 1) * 1.45;                                                                                   // 上飄：後旋加強、升力變大
  if (sty === 'hook') sd = (Math.abs(sd) > .08 ? Math.sign(sd) : (rng() < .5 ? -1 : 1)) * RN(1.1, 1.9);                               // 彎曲：強烈側旋
  const hugOn = rng() < .66, kickOn = rng() < .28;                                                                                   // 貼線球／滾出界外
  const bad = [], bagDone = {}; let hug = false, hugDist = 0, kicked = false, rollD = 0, nextBump = RN(2.5, 6), chop = false, bagHit = false, moundHit = false, wallTop = false, bumps = 0;
  const rot = a => { const c = Math.cos(a), s2 = Math.sin(a), nvx = vx * c - vz * s2, nvz = vx * s2 + vz * c; vx = nvx; vz = nvz; };
  const grassF = (gx, gz) => 1 + (.22 * Math.sin(gx * .55 + fp.p1) * Math.cos(gz * .47 + fp.p2) + .12 * Math.sin(gx * 1.3 + gz * .9 + fp.p3)) * clamp(rough, .7, 1.8);
  S.push({ t: 0, x, y, z, g: false });
  while (t < (maxT || 11)) {
    if (y > BALL_R * 1.3) {
      const rvx = vx - env.wx, rvz = vz - env.wz, sp = Math.hypot(rvx, vy, rvz), k = DRAG * sp * env.drag;
      vx -= rvx * k * dt; vy -= (GRAV + vy * k) * dt; vz -= rvz * k * dt;
      const sh = Math.hypot(vx, vz) || 1;
      vy += LIFT * bk * sh * dt; vx += (-vz / sh) * SIDEF * sd * sh * dt; vz += (vx / sh) * SIDEF * sd * sh * dt;     // 馬格努斯力：後旋→升力、橫旋→側彎
      const wf = .15 + clamp(y / 20, 0, 1) * .15; vx += env.wx * wf * dt; vz += env.wz * wf * dt;                          // 風的推力（順風飄得更遠、逆風被壓回）
      bk *= 1 - .05 * dt; sd *= 1 - .05 * dt;
      if (sty === 'skim' || sty === 'laser' || sty === 'rocket') { if (t < (sty === 'laser' ? skimT * .8 : skimT) && y < 2.8 && vy < 1.5) vy += GRAV * (sty === 'skim' ? .58 : .72) * dt; }
      else if (sty === 'bloop') { vx -= vx * .45 * dt; vz -= vz * .45 * dt; }      // 軟弱小飛球：沒力、很快失速掉下來                                           // 貼地平飛：抵銷大半重力，球低低地一路飛
      else if (sty === 'dive') { if (t > diveT && t < diveT + .7) vy -= diveG * dt; }                                              // 前旋下墜：飛到一半突然往下沉
      else if (sty === 'float') { vy += Math.sin(t * 3.3 + fp.p3) * 1.5 * dt; vx += Math.sin(t * 2.1 + fp.p1) * .9 * dt; vz += Math.cos(t * 2.6 + fp.p2) * .9 * dt; }      // 飄忽：弱旋轉、軌跡忽左忽右忽上忽下
      if (y > 2.2) { const hk = clamp((y - 2.2) / 8, 0, 1); vx += sw1.a * Math.sin(sw1.f1 * t + sw1.p1) * hk * dt; vz += sw1.b * Math.sin(sw1.f2 * t + sw1.p2) * hk * dt; }      // 高空亂流
    } else { vy -= GRAV * dt; }
    let nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt; let onG = false;
    if (ny <= BALL_R) {
      ny = BALL_R;
      if (!first) first = { x: nx, z: nz, t: t + dt };
      if (env.pud && puddleAt(nx, nz)) { if (!pudHit) pudHit = { x: nx, z: nz, t: t + dt }; vx = vy = vz = 0; stopped = true; onG = true; }      // 暴雨積水：球一碰到水窪就直接停住、不再彈跳或滾動
      else if (vy < -1.6) {
        const vin = -vy, sp0 = Math.hypot(vx, vz), inf = Math.hypot(nx, nz) < 27, be = { t: t + dt, v: vin, x: nx, z: nz }; BN.push(be);
        // 棒球不像網球：落地時垂直速度只保留約 3~4 成，每彈一次再衰減；淺角度來球幾乎貼地滑行；水平速度也會被草皮／紅土吃掉一部分
        const ia = Math.atan2(vin, Math.max(.1, sp0)), shal = ia < .35 ? .78 + ia / .35 * .22 : 1;
        let rest = (inf ? .40 : .34) * (env.rest || 1) * shal * Math.pow(.8, bounces) * (bounces === 0 ? 1 + clamp(env.hop, -1.5, 1.5) * .10 : 1), hk = clamp((inf ? .90 : .85) - (bk - 1) * .05, .76, .96);      // 旋轉：前旋→落地後加速滑行；後旋→落地煞住、減速
        if (sty === 'hop' && bounces === 0 && vin > 5) { rest *= 1.5; hk = Math.max(hk, .96); }      // 前旋飛球落地：彈得高又保留前進速度，彈起後往前滾
        if (sty === 'rocket' || sty === 'laser') { rest *= .62; hk = Math.max(hk, .975); }      // 強襲球落地：貼地「滑」過去，速度幾乎沒損失
        vx *= hk; vz *= hk;
        if (bounces === 0 && Math.abs(env.hop) > .7) rot(env.hop * .13);                                                              // 原有：不規則彈跳
        // 巴爾的摩高彈：打在本壘板前方、向下砸的強勁球，彈得又高又慢
        if (bounces === 0 && Math.hypot(nx, nz) < 9 && vin > 5 && rng() < .30 + clamp((vin - 5) * .04, 0, .25)) { rest *= RN(1.25, 1.65); vx *= .8; vz *= .8; chop = true; bad.push({ t: t + dt, x: nx, z: nz, type: 'chop', sev: .5 }); be.bad = 'chop'; }
        // 每一次落地都可能踩到小石子、草皮坑洞或縫線：彈得特別高、特別低（死球）或往旁邊歪
        else if (bounces < 4 && sp0 > 3) {
          const pb = clamp(.05 * rough * (inf ? 1.25 : 1) * (bounces === 0 ? 1 : .6) + (Math.abs(env.hop) > .7 ? .08 : 0), 0, .4);
          if (rng() < pb) {
            const sev = RN(.4, 1), r0 = rng(); let type;
            if (r0 < .34) { rest *= 1 + sev * .5; type = 'pop'; }
            else if (r0 < .60) { rest *= 1 - sev * .65; vx *= 1 - sev * .2; vz *= 1 - sev * .2; type = 'die'; }
            else { rot((rng() < .5 ? -1 : 1) * RN(.14, .5) * sev); vx *= .93; vz *= .93; rest *= RN(.8, 1.2); type = 'side'; }
            be.bad = type; bad.push({ t: t + dt, x: nx, z: nz, type, sev });
          }
        }
        vy = Math.min(vin * rest, 7.5); if (vy < 1.1) vy = 0; if (skipOn && bounces < 3 && sp0 > 13) { vy = Math.max(vy, Math.min(vin * .5 + .9, 3.4)); vx *= .97; vz *= .97; } bounces++;      // 貼地平飛／連續彈跳：淺角度落地像打水漂，連續低彈跳往前衝
      } else { vy = 0; const s2 = Math.hypot(vx, vz); const dec = (1.8 + s2 * 0.06) * (Math.hypot(nx, nz) < 27 ? 1.12 : .9) * (env.roll || 1) * grassF(nx, nz) * dt; const ns = Math.max(0, s2 - dec); if (s2 > 1e-4) { vx *= ns / s2; vz *= ns / s2; } onG = true; if (ns < 0.15) { stopped = true; vx = vz = 0; }
        if (!stopped) {
          const sNow = Math.hypot(vx, vz); rollD += sNow * dt; if (rollC && sNow > 1.2) rot(rollC * dt);      // 旋轉滾地球：滾動中帶側旋，路線慢慢拐彎
          // 不規則滾地：滾動途中壓到小凸起，球忽然歪一下、彈一下
          if (rollD > nextBump) { rollD = 0; nextBump = RN(3, 8); if (sNow > 2.8 && rng() < .06 * rough) { rot(RG() * .09 * rough); const hp = RN(1.8, 3.4) * clamp(sNow / 10, .6, 1.3); vy = hp; vx *= .94; vz *= .94; onG = false; bumps++; bad.push({ t: t + dt, x: nx, z: nz, type: 'bump', sev: clamp(hp / 3.4, .3, 1) }); } }
          // 壘包：球剛好滾過／彈到壘包，會被彈歪、彈高
          if (sNow > 2.5) for (let bi = 1; bi <= 3; bi++) { const bb = BASES[bi]; if (!bagDone[bi] && Math.hypot(nx - bb.x, nz - bb.z) < .30) { bagDone[bi] = true; if (rng() < .55) { rot(RN(-.7, .7)); vy = RN(1.8, 3.6) * clamp(sNow / 10, .6, 1.2); vx *= .86; vz *= .86; onG = false; bagHit = true; bad.push({ t: t + dt, x: nx, z: nz, type: 'bag', sev: .85 }); } } }
          // 投手丘：斜坡讓球減速、略歪
          if (!moundHit && sNow > 2 && Math.hypot(nx - MOUND.x, nz - MOUND.z) < 2.4) { moundHit = true; if (rng() < .55) { rot(RG() * .10); vx *= .9; vz *= .9; if (rng() < .4) { vy = RN(1.6, 2.6); onG = false; } bad.push({ t: t + dt, x: nx, z: nz, type: 'mound', sev: .5 }); } }
          // 貼線球：球沿著一／三壘界線滾，一路貼在線內（甚至從線上被拉回界內）；少數會在到壘包前自己滾出界外
          if (onG) {
            const sg = nx >= 0 ? 1 : -1, ddl = (-nz - Math.abs(nx)) / Math.SQRT2, rd = Math.hypot(nx, nz), ux = sg / Math.SQRT2, uz = -1 / Math.SQRT2, qx = -sg / Math.SQRT2, qz = -1 / Math.SQRT2;
            const vt = vx * ux + vz * uz, vp = vx * qx + vz * qz, spd = Math.hypot(vx, vz);
            if (rd > 3.5 && rd < 60 && vt > 1.5) {
              if (!hug && !kicked && hugOn && ddl > -.28 && ddl < .75 && Math.abs(vp) < Math.max(.9, spd * .09)) hug = true;
              else if (!hug && !kicked && kickOn && rd < 19 && ddl > 0 && ddl < .5 && Math.abs(vp) < Math.max(.9, spd * .09)) kicked = true;
              if (hug) { const tgt = clamp((.14 - ddl) * 5, -.5, .6), np = vp + (tgt - vp) * Math.min(1, 9 * dt); vx = vt * ux + np * qx; vz = vt * uz + np * qz; hugDist += spd * dt; }
              else if (kicked && ddl > -.6) { const np = vp + (-1.1 - vp) * Math.min(1, 6 * dt); vx = vt * ux + np * qx; vz = vt * uz + np * qz; }
            }
          }
        }
      }
    }
    // fence
    const rad = Math.hypot(nx, nz), phi = Math.atan2(nx, -nz) * 180 / Math.PI, wr = wallRadius(phi);
    if (rad >= wr) {
      if (ny > WALL_H + .1) { if (!over) over = { x: nx, z: nz, t: t + dt, phi, y: ny }; }
      else { // bounce back
        const nxn = nx / rad, nzn = nz / rad; const vn = vx * nxn + vz * nzn;
        if (vn > 0) {
          vx -= 1.4 * vn * nxn; vz -= 1.4 * vn * nzn; vx *= .85; vz *= .85;
          const aphi = Math.abs(phi), corner = [45, 90, 135].some(c => Math.abs(aphi - c) < 3.5);                                     // 牆面轉角處反彈方向更難預測
          rot(RG() * .20 * (corner ? 2.4 : 1)); const k = RN(.82, 1.12); vx *= k; vz *= k; if (!wallHit && vy > -3) vy += RN(-.6, 1.6);   // 打牆反彈：角度與力道每次不同
          if (!wallHit && ny > WALL_H - .45 && ny <= WALL_H + .1 && rng() < .35) { vy = Math.abs(vy) * .4 + RN(2, 5); vx *= .55; vz *= .55; wallTop = true; bad.push({ t: t + dt, x: nx, z: nz, type: 'topwall', sev: .8 }); }      // 擦到牆頭：球往上彈、軟軟落回場內
        }
        nx = nxn * (wr - .05); nz = nzn * (wr - .05); if (!wallHit) { wallT = t + dt; wallY = ny; } wallHit = true;
      }
    }
    if (over && rad > wr + 6) { S.push({ t: t + dt, x: nx, y: ny, z: nz, g: false }); break; }
    x = nx; y = ny; z = nz; t += dt;
    S.push({ t, x, y, z, g: onG || y <= BALL_R + .001 });
    if (stopped) { for (let i = 0; i < 6; i++) S.push({ t: t + (i + 1) * dt, x, y, z, g: true }); break; }
  }
  return { S, first, over, wallHit, wallT, wallY, bn: BN, tEnd: S[S.length - 1].t, bad, chop, bagHit, moundHit, wallTop, bumps, hug: hugDist > 6, hugDist, kicked, pud: pudHit, sty };
}
function sampleAt(S, t, out) {
  if (t <= 0) { out.x = S[0].x; out.y = S[0].y; out.z = S[0].z; return out; }
  const i = Math.min(S.length - 1, Math.floor(t * 60)), a = S[i], b = S[Math.min(S.length - 1, i + 1)], f = clamp(t * 60 - i, 0, 1);
  out.x = lerp(a.x, b.x, f); out.y = lerp(a.y, b.y, f); out.z = lerp(a.z, b.z, f); return out;
}
const isFairPt = (x, z) => z < 0.01 && Math.abs(x) <= -z + 0.3;
function classifyBatted(sim) {
  // fair / foul following first ground contact (or passing 1B/3B line distance for grounders)
  const S = sim.S; let pt = null;
  if (sim.over) {      // 越過外野牆：空中越牆＝全壘打（即使越牆後很快落地）；先彈地才彈過牆＝場地規則二壘安打；越牆點在界外桿外側＝界外球
    const fairO = Math.abs(sim.over.phi) <= 45, air = !sim.first || sim.first.t >= sim.over.t;
    return { fair: fairO, hr: fairO && air, grd: fairO && !air, ground: false };
  }
  if (sim.first) {
    const f = sim.first; const rd = Math.hypot(f.x, f.z);
    if (rd >= 20) pt = f;
    else { for (const s of S) { if (s.t >= f.t && Math.hypot(s.x, s.z) >= 20) { pt = s; break; } } if (!pt) { const l = S[S.length - 1]; pt = l; } }
  } else pt = S[S.length - 1];
  return { fair: isFairPt(pt.x, pt.z), hr: false, pt };
}

