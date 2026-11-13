'use strict';
/* 13zn-fielding-moves.js ｜ v1.2.16 守備動作與守備結果強化
   以前所有「美技」都共用一個 'dive'（雙臂前伸＋身體前傾）姿勢，跳接、滑接、長距離接殺、雙殺轉傳、牽制觸殺都只是普通的 'catch'／'throw'。
   這個檔新增（並讓 06／05／11／07 的呼叫端改用）下面這些動作，全部是「包住 rigStep」的疊加動作，不改 03 的原 switch：
     dive        飛身撲接（重做）：蹲身蹬地 → 騰空平飛（手套伸出）→ 胸口落地滑行（揚塵）→ 單肘撐起亮球 → 跪起站起。
                 kind='fwd' 正面撲（雙手前伸）／'side' 側撲（順手套側＝正手；反手側＝手套橫過身體）。滑行距離隨衝刺速度而定，真的帶動野手位置。
     jumpcatch   跳接：蹲 → 蹬地 → 空中收膝、手套高舉、抬頭 → 落地緩衝；wall=true 貼牆跳接（身體後仰、一腳蹬牆、另一手撐牆，球越牆搶下全壘打）。
     slidecatch  滑接：腳先滑行、身體後仰、手套伸向前下方撈球，滑行塵土；之後彈起。
     runcatch    越肩接殺（長距離跑接）：保持跑步步伐、抬頭、手套高舉前伸，接球後減速、身體後仰煞車、慣性帶出一小段。
     dpcatch     雙殺中繼：踩壘包同時接球（腳拖壘）→ dpthrow 跳步閃過滑壘跑者＋側肩出手；dpflip 近距離反手／下手傳壘（餵球）。
     kneethrow   撲接／倒地後單膝跪地傳球；longthrow 外野遠傳（墊步 crow hop）。
     fbstretch   一壘手伸展接球（一腳踩壘、另一腳大步伸出、手套前伸）。
     tagsweep    掃壘觸殺（接球後手套貼地掃向跑者、身體前撲、單膝彎曲），牽制／盜壘／回壘觸殺共用。
     pkstep／pkspin  投手牽制動作：左投對一壘＝跨步快傳、右投＝轉身（旋轉）牽制。
   結果面：撲接／滑接後起身時間（落空者更久）、貼牆跳接撞牆停頓、越肩接殺的慣性（影響傳球與跑者回壘判斷）、雙殺轉傳遇到滑壘跑者較倉促。
   依賴：03 rigStep／setRigPose／poseMix／DIV_S／DIV_P／SLD_S／spawnBurst／powderPuff／faceRig，05 moundY，E／G／PL，13t FX_ANIM（表情）。
   載入位置：13zm 之後、14 之前。關閉：FMV.on=false（回到舊的單一動作）。 */
const FMV = (function () {
  const ss = x => sstep(clamp(x, 0, 1)), c01 = x => clamp(x, 0, 1), lerpN = (a, b, k) => a + (b - a) * k;
  const MY = { dive: 1, jumpcatch: 1, slidecatch: 1, runcatch: 1, dpcatch: 1, dpthrow: 1, dpflip: 1, kneethrow: 1, longthrow: 1, fbstretch: 1, tagsweep: 1, pkstep: 1, pkspin: 1 };
  const LYING = { dive: 1, slidecatch: 1, kneethrow: 1 };
  const F = { on: true, MY, LYING };
  try { Object.assign(FX_ANIM, { jumpcatch: 'effort', slidecatch: 'squint', runcatch: 'effort', dpcatch: 'intense', dpthrow: 'intense', dpflip: 'focus', kneethrow: 'effort', longthrow: 'effort', fbstretch: 'effort', tagsweep: 'intense', pkstep: 'intense', pkspin: 'intense' }); } catch (e) { }

  function owner(r) { for (const k in E.F) { const f = E.F[k]; if (f && f.rig === r) return f; } return null; }
  const quiet = () => { try { return !!window.__ff; } catch (e) { return false; } };
  function dust(x, z, size) { if (quiet()) return; try { spawnBurst(x, .12, z, size, '#c9a06a'); powderPuff(x, .1, z, 6, .45, 0, .3, 1.1, .32); } catch (e) { } }
  /* 滑行位移：把野手真的往 (vx,vz) 方向帶 total 公尺（只在 u0～u1 之間，ease-out）；受牆限制 */
  function skid(r, a, total, u0, u1, u, vx, vz) {
    const k = c01((u - u0) / Math.max(.01, u1 - u0)), e = 1 - (1 - k) * (1 - k), off = total * e, d = off - (a._off || 0);
    if (Math.abs(d) < 1e-5) return; a._off = off;
    const f = owner(r); if (!f) return;
    let nx = f.x + vx * d, nz = f.z + vz * d; const rad = Math.hypot(nx, nz), wr = wallRadius(Math.atan2(nx, -nz) * 180 / Math.PI) - 1.3; if (rad > wr) { nx *= wr / rad; nz *= wr / rad; }
    f.x = nx; f.z = nz; f.tx = nx; f.tz = nz; r.root.position.x = nx; r.root.position.z = nz;
  }
  /* 跑步姿勢（與 03 rigStep 的跑步循環同一組公式；野手不鏡像） */
  function runBase(r, spd) {
    const lm = r.limp || 0, sp = clamp(spd / 1.5, .45, 1.3), ph = r.t * (8.2 + spd) * (1 - lm * .38), kL = sp * (1 - lm * .69), fL = Math.sin(ph), fR = -fL;
    const thg = (f, k) => -.14 - .8 * k * f, kne = (c, k) => clamp(.78 + .66 * Math.cos(c + .45), .08, 1.5) * (.5 + .5 * k), bx = .2 + .1 * sp + lm * .1;
    return { sp, llx: thg(fL, kL), lrx: thg(fR, sp), lke: kne(ph, kL), rke: kne(ph + Math.PI, sp), alx: -.1 - .85 * sp * fL, arx: -.1 - .85 * sp * fR, ale: 1.3 + .3 * fL, are: 1.3 + .3 * fR, alz: .06, arz: -.06, bx, hx: -.5 * (bx - .08), by: -.12 * sp * fL, y: Math.abs(Math.cos(ph)) * (.07 * sp) };
  }
  const mix = (a, b, k) => { const o = {}; for (const key in a) o[key] = a[key]; for (const key in b) o[key] = lerpN(o[key] || 0, b[key], k); return o; };

  /* ================= 各動作的姿勢 ================= */
  // ---- 撲接 ----
  const D_LAUNCH = { bx: .78, y: -.3, hx: -.3, alx: -1.9, ale: .2, arx: -1.5, are: .2, llx: -.75, lke: 1.1, lrx: .5, rke: .6 };
  const D_AIR = { bx: 1.38, y: .5, hx: -.45, alx: -2.9, ale: .08, alz: .38, arx: -2.75, are: .1, arz: -.38, llx: .5, lke: .5, lrx: .8, rke: .95 };
  const D_HOLD = { bx: 1.0, y: -.42, hx: -.6, alx: -2.55, ale: .35, alz: .1, arx: -1.1, are: 1.0, arz: -.3, llx: .3, lke: .9, lrx: .2, rke: .6 };
  function diveSide(sd) {      // 側撲：身體整個側倒（頭端朝撲出方向）；sd=+1 正手（手套在撲出方向）、-1 反手
    const A = sd > 0 ? { bx: .3, bz: -1.3, y: .24, hx: -.35, hz: .2, alx: -.15, alz: 2.85, ale: .05, arx: -1.2, arz: -.9, are: .3, llx: .15, lke: .6, lrx: .5, rke: 1.0 }
      : { bx: .3, bz: 1.3, y: .24, hx: -.35, hz: -.2, alx: -2.8, alz: -.35, ale: .15, arx: -.4, arz: .7, are: .3, llx: .2, lke: .8, lrx: .3, rke: .8 };
    return A;
  }
  function poseDive(r, a, u, o) {
    const side = o.kind === 'side', sd = o.sd || 1;
    if (side && o.face != null && u < .5) { let dy = o.face - r.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.root.rotation.y += dy * Math.min(1, (a._dt || .016) * 16); }      // 側撲：先轉成面向球來的方向再倒下
    let wL = ss(u / .13) * (1 - ss((u - .13) / .09)), wA = ss((u - .09) / .1) * (1 - ss((u - .36) / .1)), wS = ss((u - .34) / .1) * (1 - ss((u - .8) / .1)), wP = ss((u - .78) / .12) * (1 - ss((u - .98) / .02));
    const tot = wL + wA + wS + wP; if (tot > 1) { wL /= tot; wA /= tot; wS /= tot; wP /= tot; }
    const wH = ss((u - .5) / .12) * (1 - ss((u - .82) / .1));
    const yk = c01(((o.y != null ? o.y : 1) - .1) / .9), air = side ? diveSide(sd) : mix(D_AIR, { y: .5 * (.3 + .7 * yk) }, 1);      // v1.4.4：球貼地（y≈0.2）時身體不要飛那麼高，手套才會落在球的高度（以前一律抬高 0.5 m，手套離地 0.8～1.2 m、球卻貼著地）
    const DS = mix(DIV_S, { hx: -.5, alz: .34, arz: -.34 }, 1); let slide = poseMix([[1 - wH, DS], [wH, D_HOLD]]);
    if (side) slide = poseMix([[1 - wH, mix(DS, { bz: -sd * .75, bx: .8, alx: sd > 0 ? -2.2 : -2.9, alz: sd > 0 ? 1.6 : -.3 }, 1)], [wH, mix(D_HOLD, { bz: -sd * .5 }, 1)]]);
    const pz = poseMix([[wL, o.kind === 'side' ? mix(D_LAUNCH, { bz: -sd * .35 }, 1) : D_LAUNCH], [wA, air], [wS, slide], [wP, DIV_P]]);
    setRigPose(r, pz);
    r.root.position.y = (typeof moundY === 'function') ? moundY(r.root.position.x, r.root.position.z) : 0;
    if (u >= .4 && !a._dust) { a._dust = 1; dust(r.root.position.x, r.root.position.z, .8 + c01((a._v0 || 0) / 8) * .6); }
    skid(r, a, o.skid != null ? o.skid : .45 + .1 * (a._v0 || 0), .38, .74, u, o.vx != null ? o.vx : Math.sin(r.root.rotation.y), o.vz != null ? o.vz : Math.cos(r.root.rotation.y));
  }
  // ---- 跳接 ----
  function poseJump(r, a, u, o) {
    const wall = !!o.wall, h = c01(((o.h || 2.4) - 2.0) / 1.8), crouch = ss(u / .16) * (1 - ss((u - .16) / .08));
    const air = ss((u - .14) / .1) * (1 - ss((u - .62) / .12)), land = ss((u - .6) / .1) * (1 - ss((u - .86) / .12)), arc = Math.sin(Math.PI * c01((u - .14) / .5));
    const C = { bx: .32, y: -.2, hx: -.1, alx: .5, arx: .5, llx: -.55, lke: .75, lrx: -.4, rke: .7 };
    const hw = c01(((o.h || 3) - 3) / 3), A = wall ? { bx: -.3, y: (.5 + .55 * h + 1.3 * hw) * arc, hx: -.5, alx: -2.9, ale: .04, alz: .45, arx: -1.6, are: .5, arz: -.6, llx: -1.0, lke: 1.0, lrx: -.15, rke: .5 }
      : { bx: -.14, y: (.42 + .5 * h) * arc, hx: -.5, alx: -2.75, ale: .05, alz: .55, arx: -2.0, are: .25, arz: -.75, llx: -.55, lke: .9, lrx: -.2, rke: 1.25 };
    const L = { bx: .38, y: -.22, hx: .1, alx: -.6, ale: .6, arx: -.5, are: .6, llx: -.7, lke: 1.0, lrx: -.55, rke: 1.0 };
    setRigPose(r, poseMix([[crouch, C], [air, A], [land, L]]));
    r.root.position.y = (typeof moundY === 'function') ? moundY(r.root.position.x, r.root.position.z) : 0;
    if (wall && u > .22 && u < .62) { r.body.rotation.x = Math.min(r.body.rotation.x, -.3); }
    if (u >= .62 && !a._lnd) { a._lnd = 1; if (wall) { dust(r.root.position.x, r.root.position.z, .5); try { CAMC.shake = Math.max(CAMC.shake || 0, .05); } catch (e) { } } }
  }
  // ---- 滑接 ----
  const SC_S = { bx: -.78, y: -.62, hx: -.35, alx: -1.45, ale: .1, alz: .2, arx: .75, are: .3, arz: -.5, llx: -.9, lke: .05, lrx: -.45, rke: 1.5, lrz: -.2 };
  function poseSlideCatch(r, a, u, o) {
    const sd = o.sd || 1, wI = ss(u / .12) * (1 - ss((u - .12) / .08)), wS = ss((u - .1) / .1) * (1 - ss((u - .66) / .14)), wP = ss((u - .62) / .16) * (1 - ss((u - .94) / .06)), wH = ss((u - .42) / .12) * (1 - ss((u - .7) / .12));
    const IN = { bx: .1, y: -.25, alx: -1.1, arx: .3, llx: -.6, lke: .5, lrx: .2, rke: .9 };
    const S = sd > 0 ? SC_S : flipP(SC_S), HLD = mix(S, { alx: -2.5, ale: .5, hx: -.1 }, 1);
    setRigPose(r, poseMix([[wI, IN], [wS * (1 - wH), S], [wS * wH, HLD], [wP, SLD_P]]));
    r.root.position.y = (typeof moundY === 'function') ? moundY(r.root.position.x, r.root.position.z) : 0;
    if (u >= .16 && !a._dust) { a._dust = 1; dust(r.root.position.x, r.root.position.z, 1.0); }
    skid(r, a, o.skid != null ? o.skid : 1.0 + .15 * (a._v0 || 0), .12, .66, u, Math.sin(r.root.rotation.y), Math.cos(r.root.rotation.y));
  }
  // ---- 越肩跑接 ----
  function poseRunCatch(r, a, u, o) {
    const v0 = a._v0 || 5, spd = clamp(.4 + v0 * .2, .55, 1.8) * (1 - .8 * ss((u - .55) / .4));
    const base = runBase(r, spd), wG = ss(u / .16) * (1 - ss((u - .66) / .2)), wH = ss(u / .2) * (1 - ss((u - .7) / .22)), brake = ss((u - .55) / .35);
    const p = mix(base, { alx: -2.7 + .06 * Math.sin(a.t * 14), ale: .15, alz: .12, bx: .08 - .2 * brake, hx: -.78, arz: -.3 }, wG); p.hx = lerpN(base.hx, -.78, wH); p.bx = lerpN(base.bx, .08, wG) - .22 * brake;
    if (u > .56) { p.alx = lerpN(p.alx, -1.0, ss((u - .62) / .2)); p.ale = lerpN(p.ale, .9, ss((u - .62) / .2)); }
    setRigPose(r, p);
    r.root.position.y = (typeof moundY === 'function') ? moundY(r.root.position.x, r.root.position.z) : 0;
    skid(r, a, o.skid != null ? o.skid : .5 + .13 * v0, .5, 1, u, Math.sin(r.root.rotation.y), Math.cos(r.root.rotation.y));
  }
  // ---- 雙殺：中繼接球／跳步轉傳／近距離下手傳壘 ----
  function poseDpCatch(r, a, u, o) {
    const k = ss(u / .35), lo = ss((u - .5) / .3);
    setRigPose(r, { bx: (.3 - .1 * lo) * k, y: -.12 * k, hx: .08 * k, alx: -1.35 * k + .2 * lo, ale: .2 * k, alz: .1 * k, arx: -.75 * k, are: .9 * k, llx: -.45 * k, lke: .3 * k, lrx: .22 * k, rke: .15 * k, by: -.15 * k });
  }
  function poseDpThrow(r, a, u, o) {
    const h = ss(u / .22) * (1 - ss((u - .5) / .25)), cock = ss(u / .3), rel = ss((u - .3) / .22), fol = ss((u - .52) / .3);
    const hop = Math.sin(Math.PI * c01((u - .06) / .5)), arm = u < .3 ? lerpN(-.2, 1.5, cock) : u < .52 ? lerpN(1.5, -1.75, rel) : lerpN(-1.75, -.3, fol);
    const rec = 1 - ss((u - .78) / .22);
    setRigPose(r, { bx: (.2 + .35 * rel * (1 - fol * .6)) * rec, by: (.7 * (1 - rel) - .45 * rel * (1 - fol)) * rec, y: .3 * hop * (1 - .3 * ss((u - .5) / .3)), hx: -.05 * rec, alx: -.8 * h * rec + .2, ale: .5 * h, alz: .6 * h, arx: arm * rec, arz: -(1.3 * (1 - rel) + .5 * rel) * rec, are: (.9 * (1 - rel) + .2 * rel) * rec, llx: -.5 * hop, lke: .9 * hop, lrx: .35 * hop + .3 * fol * rec, rke: .8 * hop + .4 * fol * rec });
  }
  function poseDpFlip(r, a, u, o) {
    const w = ss(u / .3), rel = ss((u - .3) / .22), fol = ss((u - .55) / .3), rec = 1 - ss((u - .8) / .2), arm = u < .3 ? lerpN(.15, .95, w) : u < .52 ? lerpN(.95, -1.35, rel) : lerpN(-1.35, -.2, fol);
    setRigPose(r, { bx: (.4 + .15 * rel) * rec, y: -.1 * rec, hx: .05, alx: -.8 * rec, ale: .5 * rec, arx: arm * rec, are: (.5 * (1 - rel) + .1 * rel) * rec, llx: -.5 * rel * rec, lke: .3 * rel * rec, lrx: .2 * rec, by: -.2 * rec });
  }
  // ---- 倒地後單膝傳球／外野遠傳 ----
  function poseKneeThrow(r, a, u, o) {
    const g = ss(u / .2), cock = ss(u / .35), rel = ss((u - .35) / .2), fol = ss((u - .55) / .25), rec = 1 - ss((u - .85) / .15), arm = u < .35 ? lerpN(.2, 1.5, cock) : u < .55 ? lerpN(1.5, -1.8, rel) : lerpN(-1.8, -.4, fol);
    setRigPose(r, { bx: (.5 + .2 * rel) * rec * g, by: (.5 * (1 - rel) - .4 * rel) * rec * g, y: -.3 * g * rec, hx: -.2 * g, alx: -1.0 * g * (1 - fol) * rec, ale: .4 * g, alz: .5 * g * (1 - rel), arx: arm * g * rec + .0, arz: -1.1 * (1 - rel) * g * rec, are: .8 * (1 - rel) * g, llx: -.9 * g * rec, lke: .9 * g * rec, lrx: .2 * g * rec, rke: 2.0 * g * rec });
  }
  function poseLongThrow(r, a, u, o) {
    const hop = Math.sin(Math.PI * c01((u - .06) / .34)), cock = ss((u - .12) / .26), rel = ss((u - .38) / .18), fol = ss((u - .56) / .3), rec = 1 - ss((u - .84) / .16), arm = u < .38 ? lerpN(-.4, 1.7, cock) : u < .56 ? lerpN(1.7, -2.3, rel) : lerpN(-2.3, -.5, fol);
    setRigPose(r, { bx: (-.18 * cock * (1 - rel) + .5 * rel * (1 - .4 * fol)) * rec, by: (.8 * cock * (1 - rel) - .5 * rel * (1 - fol)) * rec, y: .3 * hop, hx: -.1 * rec, alx: (-1.2 * cock * (1 - rel) - .2) * rec, ale: .3, alz: .5 * cock * (1 - rel), arx: arm * rec, arz: -.45 * (1 - rel) * rec, are: .4 * (1 - rel), llx: (-.6 * hop - .6 * cock * (1 - rel) * 0 + .35 * rel) * rec, lke: .9 * hop, lrx: (.2 + .6 * rel * (1 - fol)) * rec, rke: .5 * hop + .7 * fol * rec });
  }
  // ---- 一壘手伸展接球 ----
  function poseFbStretch(r, a, u, o) {
    const k = ss(u / .16) * (1 - ss((u - .62) / .3));
    setRigPose(r, { bx: .3 * k, y: -.28 * k, hx: -.12 * k, alx: -1.75 * k, ale: .1 * k, alz: .14 * k, arx: .6 * k, arz: -.5 * k, are: .3 * k, llx: -1.1 * k, lke: .06 * k, lrx: .45 * k, rke: .15 * k, llz: .1 * k, lrz: -.3 * k });
  }
  // ---- 掃壘觸殺 ----
  function poseTagSweep(r, a, u, o) {
    const sd = o.sd || 0, k = ss(u / .18) * (1 - ss((u - .62) / .3)), sw = Math.sin(Math.PI * c01((u - .1) / .5));
    setRigPose(r, { bx: (.55 + .12 * sw) * k, y: -.3 * k, hx: .05 * k, bz: -sd * .22 * k, alx: (-.55 + .35 * sw) * k, ale: .15 * k, alz: (.15 + sd * .4 * sw) * k, arx: -.25 * k, arz: -.5 * k, are: .8 * k, llx: -.8 * k, lke: .55 * k, lrx: .35 * k, rke: .75 * k });
  }
  // ---- 投手牽制 ----
  function posePkStep(r, a, u, o) {
    const h = o.hand || 1, cock = ss(u / .3), rel = ss((u - .3) / .16), fol = ss((u - .5) / .3), rec = 1 - ss((u - .82) / .18), st = ss((u - .05) / .3);
    const arm = u < .3 ? lerpN(-1.1, 1.5, cock) : u < .46 ? lerpN(1.5, -2.2, rel) : lerpN(-2.2, -.5, fol), pose = { bx: (.18 + .38 * rel * (1 - fol * .5)) * rec, by: -h * (.6 * cock * (1 - rel) - .45 * rel * (1 - fol)) * rec, hx: .05, y: -.05 * st * rec };
    const lead = (-.95 * st + .1 * fol) * rec;
    if (h > 0) { pose.arx = arm * rec; pose.arz = -.35 * (1 - rel); pose.alx = -1.2 * (1 - rel) * rec; pose.alz = .4; pose.llx = lead; pose.lke = .35 * st * rec; pose.lrx = .25 * rel * rec; }
    else { pose.alx = arm * rec; pose.alz = .35 * (1 - rel); pose.arx = -1.2 * (1 - rel) * rec; pose.arz = -.4; pose.lrx = lead; pose.rke = .35 * st * rec; pose.llx = .25 * rel * rec; }
    setRigPose(r, pose);
  }
  function posePkSpin(r, a, u, o) {
    const h = o.hand || 1, step = ss(u / .22), turn = ss((u - .06) / .3), cock = ss((u - .18) / .14), rel = ss((u - .32) / .14), fol = ss((u - .5) / .3), rec = 1 - ss((u - .82) / .18);
    const arm = u < .32 ? lerpN(-1.1, 1.5, cock) : u < .46 ? lerpN(1.5, -2.2, rel) : lerpN(-2.2, -.5, fol), pose = { by: -h * (-1.35 * turn + 1.8 * rel + -.45 * fol) * rec * -1, bx: (.1 + .4 * rel * (1 - fol * .5)) * rec, hx: .05, y: .06 * Math.sin(Math.PI * c01(u / .4)) * rec };
    const lead = (-.7 * step * (1 - rel) + .1 * fol) * rec;
    if (h > 0) { pose.arx = arm * rec; pose.arz = -.3 * (1 - rel); pose.alx = -1.0 * (1 - rel) * rec; pose.alz = .4; pose.llx = lead; pose.lke = .4 * step * (1 - rel) * rec; pose.lrx = .3 * rel * rec; }
    else { pose.alx = arm * rec; pose.alz = .3 * (1 - rel); pose.arx = -1.0 * (1 - rel) * rec; pose.arz = -.4; pose.lrx = lead; pose.rke = .4 * step * (1 - rel) * rec; pose.llx = .3 * rel * rec; }
    setRigPose(r, pose);
  }
  const POSE = { dive: poseDive, jumpcatch: poseJump, slidecatch: poseSlideCatch, runcatch: poseRunCatch, dpcatch: poseDpCatch, dpthrow: poseDpThrow, dpflip: poseDpFlip, kneethrow: poseKneeThrow, longthrow: poseLongThrow, fbstretch: poseFbStretch, tagsweep: poseTagSweep, pkstep: posePkStep, pkspin: posePkSpin };

  /* ================= v1.4.4 接球時機與球位置 ================= */
  /* 各動作「手套伸到定位、球剛好進手套」的時間點（占動作長度的比例）。以前 pre() 會提早最多 0.25 秒開始，球到的時候動作已過頭；現在動作的這一刻＝球到手套的這一刻。 */
  const PK = { dive: .32, slidecatch: .3, jumpcatch: .4, wall: .42, runcatch: .5 };
  const pkOf = a => a.name === 'jumpcatch' ? (a.opt && a.opt.wall ? PK.wall : PK.jumpcatch) : PK[a.name];
  const STICK = { dive: 1, slidecatch: 1, jumpcatch: 1, runcatch: 1 };
  const _gv = new THREE.Vector3(), _av = new THREE.Vector3(), _bv = new THREE.Vector3();
  const POCKET = .3;      // 球放在手套中心往手臂延伸方向 0.3 m（剛好露出手套前緣）
  function glovePocket(r, out) {
    r.root.updateMatrixWorld(true); r.glove.getWorldPosition(_gv); _av.set(0, -1, 0).transformDirection(r.armL.matrixWorld).normalize();
    return out.copy(_gv).addScaledVector(_av, POCKET * (r.glove.scale.x || 1) / 1.35);
  }
  /* 動作時間規劃：left＝球還有幾秒到手套；回傳 {t, rate}。時間夠＝從頭開始；不夠＝從頭開始但加速（最多 2.4 倍），仍不夠才跳過一小段。 */
  function plan0(pk, dur, left) {
    const need = pk * dur; if (left >= need) return { t: Math.max(0, need - left), rate: 1 };
    const rate = clamp(need / Math.max(.05, left), 1, 2.4); return { t: Math.max(0, need - left * rate), rate };
  }
  function stickBall(r, a, dt) {
    if (!STICK[a.name] || !PL || PL.state !== 'held' || !PL.holder || PL.holder.rig !== r || (a.opt && a.opt.miss)) return;
    const f = PL.holder; let s = f._stk; if (!s || s.pl !== PL) s = f._stk = { pl: PL, k: 0, from: ballMesh.position.clone() };
    glovePocket(r, _bv); if (s.dur === undefined) s.dur = .09 + .07 * c01(s.from.distanceTo(_bv) / 2.5); s.k = Math.min(1, s.k + dt / s.dur); const e = ss(s.k);      // 球離手套越遠（貼牆搶全壘打時球在牆頂上方）滑入的時間越長一點      // 球在 0.09 秒內滑進手套口袋，之後固定跟著手套（撲出去、滑行、撐起、落地都在手套裡）
    _bv.set(lerpN(s.from.x, _bv.x, e), lerpN(s.from.y, _bv.y, e), lerpN(s.from.z, _bv.z, e)); setBall(_bv, true);
  }
  /* 這個野手現在是不是在「專屬接球動作」中，而且動作還沒做到伸臂定位（06 先不判接到，最多多等 0.2 秒） */
  function ready(f, plan) {
    const a = f.rig && f.rig.anim; if (!F.on || !a || !STICK[a.name] || !a.opt || !a.opt.pre || a.opt.miss) return true;
    const pk = pkOf(a); if (!pk) return true;
    return a.t >= pk * a.dur - .04 || PL.t > plan.t + .6;
  }
  /* 接球瞬間：把野手水平位移到「手套剛好在球上」（取代 06 原本把人往落點瞬移 90% 的作法）。回傳是否由這裡處理。 */
  function capture(f, plan) {
    const a = f.rig && f.rig.anim; if (!F.on || !a || !STICK[a.name] || !a.opt || !a.opt.pre || a.opt.miss) return false;
    const r = f.rig; glovePocket(r, _bv); const b = ballMesh.position; let dx = b.x - _bv.x, dz = b.z - _bv.z; const L = Math.hypot(dx, dz);
    if (L > 1.8) { dx *= 1.8 / L; dz *= 1.8 / L; }
    let nx = f.x + dx, nz = f.z + dz; const rad = Math.hypot(nx, nz), wr = wallRadius(Math.atan2(nx, -nz) * 180 / Math.PI) - 1.3; if (rad > wr) { nx *= wr / rad; nz *= wr / rad; }
    f.x = nx; f.z = nz; f.tx = nx; f.tz = nz; r.root.position.x = nx; r.root.position.z = nz; f._stk = { pl: PL, k: 0, from: b.clone() };
    return true;
  }

  /* ================= rigStep 包裝 ================= */
  const _rs = rigStep;
  rigStep = function (r, dt) {
    const a = r.anim;
    if (!F.on || !a || !MY[a.name]) return _rs(r, dt);
    const o = a.opt || (a.opt = {});
    if (a.name === 'dive' && !o.v2) { o.v2 = 1; if (a.dur < 1.2) a.dur = 1.3; }
    if (a._v0 === undefined) { const f = owner(r); a._v0 = f ? (f.v || 0) : 0; }
    const dm = a._dm || (a._dm = { name: a.name, t: 0, dur: 1e9, opt: { hold: true } });      // 假動作：讓內層（原 switch／表情層／待機層）照常跑一遍，我們再把真正的姿勢蓋上去
    dm.t = a.t; r.anim = dm; _rs(r, dt); r.anim = a;
    let rate = (a.rate > 1 && a.pk && a.t < a.pk) ? a.rate : 1;
    if (a.pk && a.t >= a.pk && o.pre && !o.miss && PL && PL.state === 'flight' && PL.plan && PL.plan.f && PL.plan.f.rig === r && PL.t >= PL.plan.t - .02) rate = .2;      // v1.4.4b：手套已到定位、球還沒進來（野手比預定晚到）＝動作在伸臂定位處幾乎停住等球，不繼續往下做（不會等球時已落地／趴下）      // v1.4.4：球太快到、來不及從頭做動作時，把「起手到伸臂」那一段加速播完（不再直接從動作中段開始）
    a.t += dt * rate; a._dt = dt; const u = c01(a.t / a.dur);
    try { POSE[a.name](r, a, u, o); } catch (e) { if (!F._err) { F._err = 1; console.error('[fmv]', e); } }
    try { stickBall(r, a, dt); } catch (e) { if (!F._err2) { F._err2 = 1; console.error('[fmv]', e); } }      // v1.4.4：接到球後球黏在手套上（以前是固定放在身體中心 1.25 m，撲接趴地時球就懸在身上）
    if (u >= 1 && !o.hold) { r.anim = null; }
  };

  /* ================= 呼叫端用的選擇函式 ================= */
  const isOF = f => f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF';
  /* 這一球的守備動作種類：dive／side／jump／wall／slide／run／null（一般接球） */
  function kindOf(f, plan) {
    if (!plan) return null;
    if (plan.fmMove) return plan.fmMove === 'jump' ? 'jump' : plan.fmMove === 'wall' ? 'wall' : plan.fmMove === 'slide' ? 'slide' : 'dive';      // 玩家按下防守鍵指定的動作（見 13g FM.pressMove）
    const air = !!plan.air, y = plan.y || 0, dd = dist2(f.x, f.z, plan.x, plan.z);
    if (plan.robHR || plan.leap) return 'wall';
    if (air) {
      if (plan.dive || plan.superTry) return y < .9 ? 'slide' : y > 1.55 ? 'jump' : 'dive';      // v1.4.4：1.55 m 以上的高球，平飛的撲接手套只到 0.8～1 m 構不到（球要瞬間挪 1.7 m 才進手套）→ 改用跳接（手套高舉）
      // v1.3.10：球高超過「站著手套舉高就接得到」的高度，才用跳接（規劃階段已確認等球降下來也來不及，見 05 planFielding）
      const easy = typeof EASY_CATCH_Y === 'function' ? EASY_CATCH_Y(f) : (isOF(f) ? 2.0 : 1.9);
      if (y > easy && y <= 2.9 && !plan.dive) return 'jump';
      if (isOF(f) && Math.hypot(plan.x, plan.z) > 72 && dd > 6) return 'run';      // 外野深遠飛球：全速跑動越肩接殺
      return null;
    }
    if (plan.dive) return Math.hypot(plan.x, plan.z) > 36 ? 'slide' : 'dive';
    return null;
  }
  function diveGeom(f, plan) {      // 內野滾地球的撲接：球路與身體前進方向差很多＝側撲（面向球來向、往手套側／反手側撲）
    const dx = plan.x - f.x, dz = plan.z - f.z, d = Math.hypot(dx, dz) || 1, mx = dx / d, mz = dz / d;
    let hx = -f.x, hz = -f.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;      // 朝本壘
    const side = !isOF(f) && f.pos !== 'P' && !plan.air && Math.abs(mx * hx + mz * hz) < .62 && d > .5;
    if (!side) return { kind: 'fwd', vx: mx, vz: mz };
    const th = Math.atan2(hx, hz), lx = Math.cos(th), lz = -Math.sin(th), sd = (mx * lx + mz * lz) >= 0 ? 1 : -1;
    return { kind: 'side', sd, face: th, vx: mx, vz: mz };
  }
  /* 球飛行中預先開始的動作（plan.t 之前就要做，手套才會剛好在球到的瞬間伸到位）。回傳是否已啟動。 */
  function pre(plan) {
    if (!F.on || !plan || !plan.f) return false;
    const f = plan.f, r = f.rig; if (!r || f.fmvPre === plan) return false;
    const k = kindOf(f, plan); if (!k) return false;
    let left = plan.t - (PL ? PL.t : 0);
    { const dd = dist2(f.x, f.z, plan.x, plan.z), reachD = (k === 'dive' || k === 'slide') ? 2.2 : .9, tr = Math.max(0, dd - reachD) / Math.max(f.sp || 0, f.v || 0, 4);      // v1.4.4b：野手比預定落點晚到（球已過 plan.t、人還在跑）時，動作要配合「人實際到位」的時間才起手，不然手還沒到球、動作就先做完（跳接落地時才接到）
      if (tr > left) left = Math.min(tr, left + .6); }
    const mk = (name, dur, peak, opt) => { if (left > peak * dur + .02) return false; f.fmvPre = plan; opt.pre = 1; opt.hold = false; const w = plan0(peak, dur, left); r.anim = { name, t: w.t, dur, opt, rate: w.rate, pk: peak * dur }; return true; };      // v1.4.4：剛好在「手套到定位」前 peak×dur 秒才開始（以前提早 0.25 秒），來不及就加速
    if (k === 'dive') { const g = diveGeom(f, plan); const ok = mk('dive', 1.3, PK.dive, { kind: g.kind, sd: g.sd, vx: g.vx, vz: g.vz, y: plan.y, skid: .5 + .1 * (f.v || 0) }); if (ok && g.kind === 'side') r.anim.opt.face = g.face; return ok; }
    if (k === 'slide') return mk('slidecatch', 1.35, PK.slidecatch, { sd: 1 });
    if (k === 'jump') return mk('jumpcatch', 1.0, PK.jumpcatch, { h: plan.y || 2.4 });
    if (k === 'wall') return mk('jumpcatch', 1.1, PK.wall, { wall: true, h: plan.y || 3 });
    if (k === 'run') return mk('runcatch', 1.2, PK.runcatch, {});
    return false;
  }
  /* 野手接到／撿到球的當下要播的動作（若 pre() 已經啟動同一個動作就不要蓋掉） */
  function fieldAnim(f, plan, ground) {
    const cur = f.rig.anim; if (F.on && cur && MY[cur.name] && cur.opt && cur.opt.pre) return cur;
    if (!F.on) return null;
    const k = kindOf(f, plan);
    const LEAD = .2;      // v1.4.4：沒有預先開始動作時（球太近才規劃），也從「伸臂定位前 0.2 秒」起手，不再直接跳到伸臂的那一格
    const lead = (pk, dur) => Math.max(0, pk * dur - LEAD);
    if (k === 'dive' || (plan.dive && ground)) { const g = diveGeom(f, plan); return { name: 'dive', t: lead(PK.dive, 1.3), dur: 1.3, opt: { kind: g.kind, sd: g.sd, vx: g.vx, vz: g.vz, y: plan.y, pre: 1, skid: .3 } }; }
    if (k === 'slide') return { name: 'slidecatch', t: lead(PK.slidecatch, 1.35), dur: 1.35, opt: { sd: 1, pre: 1 } };
    if (k === 'jump') return { name: 'jumpcatch', t: lead(PK.jumpcatch, 1.0), dur: 1.0, opt: { h: plan.y || 2.4, pre: 1 } };
    if (k === 'wall') return { name: 'jumpcatch', t: lead(PK.wall, 1.1), dur: 1.1, opt: { wall: true, h: plan.y || 3, pre: 1 } };
    if (k === 'run') return { name: 'runcatch', t: lead(PK.runcatch, 1.2), dur: 1.2, opt: { pre: 1 } };
    return null;
  }
  /* 接到球之後的「整備」時間與慣性（回傳要加到 f.hold 的最小值）＝動作怎麼做、結果就怎麼算 */
  function holdAfter(f, plan, ground, base) {
    const cur = f.rig.anim, nm = cur && cur.name; let h = base || 0; f.catchMom = 0;
    if (nm === 'dive') h = Math.max(h, ground ? .58 : .7);            // 撲接：趴地要先撐起來（v1.4.4：滾地球 .42→.58，讓落地滑行做完才單膝傳，不在滑行中途硬切）
    else if (nm === 'slidecatch') h = Math.max(h, .6);                 // 滑接：彈起站穩
    else if (nm === 'jumpcatch') { h = Math.max(h, cur.opt && cur.opt.wall ? .62 : .32); if (cur.opt && cur.opt.wall) f.wallStun = .5; }      // 貼牆跳接：撞牆停頓；一般跳接：落地站穩
    else if (nm === 'runcatch') { h = Math.max(h, .12 + c01((f.v || 0) / 8) * .3); f.catchMom = c01((f.v || 0) / 8); }      // 越肩接殺：全速奔跑中接球，慣性還帶著人往前，要煞住、轉身才能傳
    return h;
  }
  function missDive(f, fd) {      // 沒接到的飛撲：趴地起身要久一點（球已經過去了，人還在地上）
    const g = diveGeom(f, fd); if (fd.leap) return { name: 'jumpcatch', t: .3, dur: 1.1, opt: { wall: !isOF(f) ? false : true, h: fd.y || 3 } };
    if (kindOf(f, fd) === 'slide') return { name: 'slidecatch', t: 0, dur: 1.35, opt: { sd: 1, miss: 1 } };
    return { name: 'dive', t: .1, dur: 1.3, opt: { kind: g.kind, sd: g.sd, vx: g.vx, vz: g.vz, miss: 1, skid: .5 } };
  }
  /* 傳球動作：依野手當下狀態挑（倒地＝單膝傳、雙殺轉傳＝跳步、近距離餵球＝下手、外野遠傳＝墊步、一般＝原本的 throw） */
  function throwAnim(f, tx, tz, ctx) {
    ctx = ctx || {}; const cur = f.rig.anim, d = dist2(f.x, f.z, tx, tz);
    if (!F.on) return { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } };
    if (cur && LYING[cur.name] && cur.t < cur.dur * .98) { return { name: 'kneethrow', t: 0, dur: .55, opt: { hand: 1 } }; }
    if (ctx.dp && !isOF(f)) return { name: 'dpthrow', t: 0, dur: .5, opt: { hand: 1 } };
    if (ctx.feed && d < 13 && !isOF(f)) return { name: 'dpflip', t: 0, dur: .42, opt: { hand: 1 } };
    if (isOF(f) && d > 38) return { name: 'longthrow', t: 0, dur: .55, opt: { hand: 1 } };
    return { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } };
  }
  /* 傳球被接到時，接球者的動作 */
  function receiveAnim(f, th) {
    const nm = th && th.b, cur = f.rig.anim; if (!F.on) return { name: 'catch', t: 0, dur: .3, opt: {} };
    const onBag = (() => { try { const bs = baseSpot(nm === 0 ? 4 : nm); return dist2(f.x, f.z, bs.x, bs.z) <= TAG_BASE_R + .3; } catch (e) { return false; } })();
    if (nm === 1 && f.pos === '1B' && onBag && !th.ret && !th.relay) return { name: 'fbstretch', t: 0, dur: .5, opt: {} };
    if (nm >= 2 && nm <= 3 && !isOF(f) && onBag && !th.ret && !th.relay && PL && PL.outsMade < 2 && E.runners.some(r => r.state === 'run' && r.dir > 0 && r.to === nm && forcedNow(r))) { f.fmvPivot = G.rclk || 0; return { name: 'dpcatch', t: 0, dur: .3, opt: {} }; }
    return { name: 'catch', t: 0, dur: .3, opt: {} };
  }
  /* 觸殺／封殺動作：f 是野手，r 是跑者（可省略），kind＝'tag'|'force'|'pick' */
  function tagAnim2(f, r, kind) {
    if (!F.on || !f.rig) return { name: 'catch', t: 0, dur: .4, opt: {} };
    const cur = f.rig.anim; if (cur && (cur.name === 'fbstretch' || cur.name === 'dpcatch') && kind === 'force') return cur;      // 封殺：維持踩壘接球的動作
    let sd = 0; if (r) { try { const p = runnerXZ(r, { x: 0, z: 0 }), th = f.rig.root.rotation.y; sd = ((p.x - f.x) * Math.cos(th) - (p.z - f.z) * Math.sin(th)) >= 0 ? 1 : -1; } catch (e) { } }
    if (kind === 'force') return { name: 'catch', t: 0, dur: .4, opt: {} };
    return { name: 'tagsweep', t: 0, dur: .55, opt: { sd } };
  }
  function pickoffThrow(P, hd, i) {      // 投手牽制出手：左投一壘＝跨步快傳；其餘＝轉身牽制
    if (!F.on) return { name: 'throw', t: 0, dur: .26, opt: { hand: hd } };
    return (hd < 0 && i === 0) ? { name: 'pkstep', t: 0, dur: .36, opt: { hand: hd } } : { name: 'pkspin', t: 0, dur: .4, opt: { hand: hd } };
  }
  /* 有跑者正在滑進 b 壘（轉傳雙殺時，樞紐野手要閃避）*/
  function slideAt(b) { try { return E.runners.some(q => (q.sliding || (q.rig && q.rig.anim && (q.rig.anim.name === 'slide' || q.rig.anim.name === 'hdive'))) && (q.to === b || q.from === b)); } catch (e) { return false; } }
  /* 玩家防守鍵：立刻開始動作。mode＝dive|jump|slide；tl＝距離球到手套剩幾秒（動作的「接球瞬間」會對到 tl 秒後）；opt.x／z＝目標點、opt.miss＝撲空／亂撲 */
  function startAnim(f, mode, tl, opt) {
    opt = opt || {}; const tx = opt.x != null ? opt.x : f.x + Math.sin(f.rig.root.rotation.y), tz = opt.z != null ? opt.z : f.z + Math.cos(f.rig.root.rotation.y);
    const g = diveGeom(f, { x: tx, z: tz, air: !!opt.air }), P = { dive: ['dive', 1.3, PK.dive], jump: ['jumpcatch', 1.0, PK.jumpcatch], wall: ['jumpcatch', 1.1, PK.wall], slide: ['slidecatch', 1.35, PK.slidecatch] }[mode] || ['dive', 1.3, .3];
    const o = { pre: 1, hold: false, miss: opt.miss ? 1 : 0 };
    if (mode === 'dive') { o.kind = g.kind; o.sd = g.sd; o.vx = g.vx; o.vz = g.vz; o.face = g.face; o.y = opt.y; o.skid = .5 + .1 * (f.v || 0); if (!opt.miss && g.kind === 'side') o.face = g.face; }
    else if (mode === 'jump') { o.h = opt.y || 2.4; }
    else if (mode === 'wall') { o.h = opt.y || 3.4; o.wall = true; }      // v1.3.10：玩家美技鍵在牆邊＝貼牆跳接（搶救全壘打）
    else { o.sd = 1; }
    if (opt.miss && mode === 'dive' && !opt.air && g.kind === 'fwd') { o.vx = Math.sin(f.rig.root.rotation.y); o.vz = Math.cos(f.rig.root.rotation.y); }
    const pkv = mode === 'dive' ? PK.dive : mode === 'jump' ? PK.jumpcatch : mode === 'wall' ? PK.wall : PK.slidecatch, w = plan0(pkv, P[1], Math.max(0, tl));      // v1.4.4：手動美技鍵也一樣——時間不夠就加速播前段
    return { name: P[0], t: w.t, dur: P[1], opt: o, rate: w.rate, pk: pkv * P[1] };
  }
  F.slideAt = slideAt; F.startAnim = startAnim; F.ready = ready; F.capture = capture; F.PK = PK;
  F.pre = pre; F.fieldAnim = fieldAnim; F.holdAfter = holdAfter; F.missDive = missDive; F.throwAnim = throwAnim; F.receiveAnim = receiveAnim; F.tagAnim = tagAnim2; F.pickoffThrow = pickoffThrow; F.kindOf = kindOf; F.poses = POSE; F.runBase = runBase;
  return F;
})();
