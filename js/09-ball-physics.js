/* 09-ball-physics.js — 球的物理（原 script.js 第 1757-1922 行） */
'use strict';
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

