/* 08-swing-contact.js — 揮棒／擊球接觸模型（原 script.js 第 1507-1756 行） */
'use strict';
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
  if (ev > 30) ev = 30 + (ev - 30) * 0.85;
  
        // 高初速區壓縮：非力量型打者就算打到甜蜜點也不容易出牆，力量型才飛得遠
  ev *= 1 + clamp((w0.temp - 24) * .0009, -.017, .017);                      // 氣溫：天熱球彈性好、天冷偏悶
  ev *= (1 + gauss() * 0.07 * mv) * (1 - rainBK() * .05);                 // 雨天：球濕滑、衝擊力減弱（大雨／暴雨更明顯）
  let ang = 3.0 + b.traj * 2.6 + v * 26 + clamp(Q - .7, 0, .3) * 12 * (.5 + b.pow * .006) + gauss() * (8 + 10 * (1 - Q)) * (.6 + .4 * mv) * clamp(1.3 - b.con * .006, .75, 1.2);      // 打擊技巧好：仰角穩定
  if (sw.power) ang += 1.8 + Q * 1.4 + sweetP * .8;                                      // 強打：揮棒上揚、擊球仰角較高（甜蜜點時更明顯）→ 容易飛得夠遠
  // 球種特性：沉球／指叉／曲球容易打出滾地球，直球上飄容易打成飛球
  const BRK = { SK: -4.5, TS: -2.2, SH: -2, CH: -2.4, FK: -5, CU: -3.2, SL: -1.4, SV: -2.2, ST: 1.6, CT: -.4 };
  ang += (BRK[pt.id] || 0) * (.6 + pt.lv * .07) * (1.15 - Q * .55);
  if (bp > .32) { const j = bp - .32; ang += j * (10 + press * 10) * (1 + inK * .5); ev *= 1 - j * .2 * (.8 + press * .5); }    // 被壓制（球靠握把）：仰角變高、力道變弱
  if (bp < -.3 && outK > .15) ang -= (-bp - .3) * 8 * outK * (1 + OA * 3);      // 外角打在球頭：球棒蓋過球，打成滾地球
  if (outK > .2 && sR > .35) ang += (sR - .35) * 5 * outK * (1.1 - skill * .5);  // 外角偏晚、推向反方向：容易變成淺飛球
  if (v > .5) { const k = clamp((v - .5) / .7, 0, 1); ang += k * k * (36 + Math.random() * 16); ev *= 1 - .4 * k; }      // 棒子打到球的下緣：愈靠邊緣愈往上飛，邊緣甚至是飛得極高、力道很弱的「沖天炮」
  else if (v < -.5) { const k = clamp((-v - .5) / .7, 0, 1); ang -= k * k * (24 + Math.random() * 8); ev *= 1 - .22 * k; }      // 棒子打到球的上緣：往下壓成滾地球／彈地球
  if (ang < 14 && Q > .6) ev *= 1 + (Q - .6) * .2 * (.85 + b.con * .003);                       // 紮實擊中的低仰角球：強勁滾地球／平飛球
  if (cz === 'sweet' && Q > .6 && !sw.bunt) { const pull = clamp((Q - .6) / .4, 0, 1) * (.2 + skill * .25); ang += (clamp(ang, 7 + pwk * 2, 22 + pwk * 4) - ang) * pull; ev *= 1 + pull * .06 * (.6 + pskill * .6); }      // 甜蜜點＋好時機：球被打成「黃金仰角」的強勁平飛／長打，能力越強越明顯
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
  const luck = gauss() * (.9 + .5 * mv) * clamp(1.32 - skill * .4, .85, 1.3) * Math.pow(G.day || 1, .5) * (1 + windK() * .3 + Math.max(0, rainBK() - .8) * .35);              // 不可控因素：陣風、擊中縫線、地面彈跳…（風大時更不穩定）
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

