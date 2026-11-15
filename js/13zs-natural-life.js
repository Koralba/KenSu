/* ===== 13zs-natural-life.js ｜ 自然反應與細節動作層（v1.4.1） =====
   純外觀、不改任何模擬狀態（座標、時序、判定）。亂數只用自己的 LCG（不碰 Math.random，區網對戰同步不受影響）；快轉（window.__ff）整層略過；鏡頭 >46 的球員略過。
   架構：①包住 rigStep（每人每幀先算「這個人現在該有什麼反應」的數值 s.*，再呼叫原本的 rigStep，最後處理本檔新增的動作 nat_*）
         ②包住 setRigPose：只在 rigStep 執行期間，把 s.* 以「加法」疊進姿勢（頭、身體、腿的數值），所以髖部跟隨、蹲姿 IK、落地修正全部照常運作（不會懸空或陷地）。
   A. 視線追蹤：野手（打者出手前看本壘、球在空中／場內看球）、跑壘者（站壘看投手、跑動看球）、主審與跑動中的人看球；投手有跑者時輪流瞄壘。
      頭 ±1.15 弧度、抬頭／低頭、超過約 23° 身體跟著微轉；每人反應速度不同（5～9）。
   B. 預備小跳（split step）：投球出手瞬間，約 75% 的野手蹲低→小跳→落地吸震；站壘跑者改做「第二離壘」（重心前壓、膝微彎）。
   C. 跑壘者離壘擺動：重心左右換腳、腳跟微彈、手臂輕擺。
   D. 跑步時頭穩定：頭反向抵消軀幹扭轉與側傾（頭不再跟著身體亂晃）。
   E. 新待機小動作（野手，每人 14～36 秒一次，球不在場內才做）：nat_stretch 伸懶腰、nat_roll 轉頭轉肩、nat_toedig 鞋尖刨土、nat_look 抬頭看天掃視、nat_belt 拉褲子整理腰帶、nat_wave 向觀眾揮手、nat_clap 拍手加油。
   F. 事件反應：出局後（1～2 出局）部分野手舉手報出局數（nat_outs，真的舉起 1 或 2 根手指）、或拍手鼓勵；投手被判壞球後偶爾搖頭聳肩（nat_frown）。
   開關：`NAT.on=false` 全關；或 NAT.gaze／split／runner／run／acts／outs 分項關。 */
'use strict';
const NAT = { on: true, rs: 20271111, far: 46, gaze: true, split: true, runner: true, run: true, acts: true, outs: true, relId: 0, outId: 0, ballId: 0, ph: '', outsN: 0, balls: 0, gAt: -1 };
function ntRnd() { NAT.rs = (Math.imul(NAT.rs, 1664525) + 1013904223) >>> 0; return NAT.rs / 4294967296; }
function ntS(r) { return r._nt || (r._nt = { gy: 0, gx: 0, tw: 0, k: 0, sp: null, sv: null, sw: null, rc: false, mod: false, p1: ntRnd() * 6.283, p2: ntRnd() * 6.283, p3: ntRnd() * 6.283, sa: .72 + ntRnd() * .45, lat: 5 + ntRnd() * 4, role: null, rt: -1e9, ev: 8 + ntRnd() * 20, relId: 0, outId: 0, ballId: 0, pend: null, gt: 0, gb: 0, tgy: 0, tgx: 0 }); }
function ntNow() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function ntRole(r, s) {
  const n = ntNow(); if (s.role !== undefined && n - s.rt < 300 && s.role !== null) return s.role; if (n - s.rt < 300 && s.role === null) return null; s.rt = n; let ro = null;
  try {
    if (typeof E !== 'undefined') {
      if (E.bat && E.bat.rig === r) ro = { k: 'B' };
      else if (E.F) { for (const q in E.F) if (E.F[q] && E.F[q].rig === r) { ro = { k: 'F', pos: q }; break; } }
      if (!ro && E.ump === r) ro = { k: 'U' };
      if (!ro && E.runners) for (const u of E.runners) if (u && u.rig === r) { ro = { k: 'R', u }; break; }
    }
  } catch (e) { }
  return (s.role = ro);
}
function ntGlobal() {      /* 每幀只算一次：投球出手、出局數、壞球數的變化 */
  const n = ntNow(); if (Math.abs(n - NAT.gAt) < 3) return; NAT.gAt = n;
  if (typeof G === 'undefined' || G.mode !== 'play') return;
  if (G.phase === 'flight' && NAT.ph !== 'flight') NAT.relId++;
  NAT.ph = G.phase;
  if (G.outs !== NAT.outsN) { if (G.outs > NAT.outsN && G.outs < 3) NAT.outId++; NAT.outsN = G.outs; }
  if (G.balls !== NAT.balls) { if (G.balls > NAT.balls) NAT.ballId++; NAT.balls = G.balls; }
}
const NT_FACE = { x: 0, y: 1, z: 0.3 };
function ntTarget(r, ro, s, dt, out) {      /* 這個人現在看哪裡（世界座標）；回傳 false＝沒有特別要看的 */
  const ph = G.phase, inPlay = typeof PL !== 'undefined' && PL, bv = typeof ballMesh !== 'undefined' && ballMesh.visible;
  if (bv && (inPlay || ph === 'flight' || ph === 'result')) { out.x = ballMesh.position.x; out.y = ballMesh.position.y; out.z = ballMesh.position.z; return true; }
  if (ro.k === 'F') {
    if (ro.pos === 'C') return false;
    if (ro.pos === 'P') {
      if (ph !== 'pre' || !G.on) return false; const occ = []; for (let i = 0; i < 3; i++) if (G.on[i]) occ.push(i + 1); if (!occ.length) return false;
      s.gt -= dt; if (s.gt <= 0) { s.gt = 1.4 + ntRnd() * 3; const j = Math.floor(ntRnd() * (occ.length + 1)); s.gb = j === 0 ? 0 : occ[j - 1]; }
      if (!s.gb) return false; const b = typeof baseSpot === 'function' ? baseSpot(s.gb) : null; if (!b) return false; out.x = b.x; out.y = 1; out.z = b.z; return true;
    }
    if (ph === 'pre' || ph === 'windup') { out.x = 0; out.y = 1; out.z = .3; return true; }
    return false;
  }
  if (ro.k === 'R' && ro.u && ro.u.state === 'on' && (ph === 'pre' || ph === 'windup') && typeof MOUND !== 'undefined') { out.x = MOUND.x; out.y = 1.3; out.z = MOUND.z; return true; }
  return false;
}
const _nt = { x: 0, y: 0, z: 0 };
function ntPre(r, dt, s) {
  s.sv = null; s.sw = null; s.rc = false;
  if (typeof G === 'undefined' || G.mode !== 'play' || G.over || !r.root || r.root.visible === false) { s.k = Math.max(0, s.k - dt * 3.5); s.sp = null; return; }
  const ro = ntRole(r, s), a = r.anim, moving = r.run > .05 && !a, idle = !a || a.name === 'ready';
  if (typeof CAMC !== 'undefined' && CAMC.pos && CAMC.pos.distanceTo(r.root.position) > NAT.far) { s.k = Math.max(0, s.k - dt * 3.5); s.sp = null; return; }
  const inPlay = typeof PL !== 'undefined' && PL;
  /* D. 跑步：頭反向抵消身體扭轉／側傾 */
  if (NAT.run && moving && ro) s.rc = true;
  /* B. 預備小跳／第二離壘 */
  if (NAT.split && ro && s.relId !== NAT.relId) {
    s.relId = NAT.relId;
    if (ro.k === 'F' && ro.pos !== 'P' && ro.pos !== 'C' && !a && r.run < .05 && !inPlay && G.phase === 'flight' && ntRnd() < .75) s.sp = { t: -ntRnd() * .1, kind: 'split', dur: .6 };
    else if (NAT.runner && ro.k === 'R' && ro.u && ro.u.state === 'on' && !a && r.run < .05 && !inPlay) s.sp = { t: -ntRnd() * .05, kind: 'lead', dur: .6 };
  }
  if (s.sp) {
    s.sp.t += dt; const t = s.sp.t;
    if (a || r.run > .05 || t > s.sp.dur) s.sp = null;
    else if (t >= 0) {
      let c = 0, air = 0;
      if (s.sp.kind === 'split') { c = t < .13 ? sstep(t / .13) : t < .3 ? 1 : 1 - sstep((t - .3) / .3); }
      else { c = t < .12 ? sstep(t / .12) : t < .35 ? 1 : 1 - sstep((t - .35) / .25); }
      s.sv = { kind: s.sp.kind, c: c * s.sa, air: air * s.sa };
    }
  }
  /* C. 站壘跑者的重心擺動 */
  if (NAT.runner && ro && ro.k === 'R' && ro.u && ro.u.state === 'on' && !a && r.run < .05 && !s.sv) {
    const t = r.t, w = Math.sin(t * 1.7 + s.p1); s.sw = { bz: w * .05, l: w * .07, a: Math.sin(t * 1.7 + s.p3) * .12, y: (Math.abs(Math.sin(t * 3.4 + s.p2)) - .5) * .014 };
  }
  /* A. 視線 */
  let want = false;
  if (NAT.gaze && ro && ro.k !== 'B' && (idle || moving) && !s.sv) {
    if (ntTarget(r, ro, s, dt, _nt)) {
      want = true; const rp = r.root.position, dx = _nt.x - rp.x, dz = _nt.z - rp.z; let yaw = Math.atan2(dx, dz) - r.root.rotation.y; while (yaw > Math.PI) yaw -= 6.2832; while (yaw < -Math.PI) yaw += 6.2832;
      const hd = Math.hypot(dx, dz) + .001, el = Math.atan2(_nt.y - (rp.y + 1.5 * (r.root.scale.y || 1)), hd);
      s.tgy = Math.max(-1.15, Math.min(1.15, yaw)); s.tgx = -Math.max(-.45, Math.min(.95, el)) * .85;
    }
  } else if (NAT.gaze && ro && ro.k === 'B' && moving && inPlay && typeof ballMesh !== 'undefined' && ballMesh.visible) {
    want = true; const rp = r.root.position, dx = ballMesh.position.x - rp.x, dz = ballMesh.position.z - rp.z; let yaw = Math.atan2(dx, dz) - r.root.rotation.y; while (yaw > Math.PI) yaw -= 6.2832; while (yaw < -Math.PI) yaw += 6.2832; s.tgy = Math.max(-1.15, Math.min(1.15, yaw)); s.tgx = 0;
  }
  const kk = 1 - Math.exp(-dt * s.lat); if (!want) { s.tgy = 0; s.tgx = 0; }
  s.gy += (s.tgy - s.gy) * kk; s.gx += (s.tgx - s.gx) * kk; s.k = Math.max(0, Math.min(1, s.k + (want ? dt * 3.5 : -dt * 3.5)));
  s.tw = s.k > .01 ? Math.sign(s.gy) * Math.max(0, Math.abs(s.gy) - .4) * .3 : 0;
  /* E／F. 待機小動作與事件反應 */
  if (r._ntF && r._ntFon && !(a && a.name === 'nat_outs')) { ntFing(r, 0); r._ntFon = false; }
  if (NAT.acts && ro && ro.k === 'F' && ro.pos !== 'C') ntEvents(r, dt, s, ro);
}
function ntElig(r) { if (typeof hlEligible === 'function') return hlEligible(r); return !r.anim && r.run < .05 && !(typeof PL !== 'undefined' && PL) && G.phase === 'pre'; }
function ntStart(r, name, opt) { const d = NT_ACT[name]; r.anim = { name, t: 0, dur: d.dur, opt: Object.assign({ hand: ntRnd() < .5 ? 1 : -1, hlv: 1 }, opt || {}) }; r.t = 0; }
function ntEvents(r, dt, s, ro) {
  const isP = ro.pos === 'P', IF = ro.pos === '1B' || ro.pos === '2B' || ro.pos === '3B' || ro.pos === 'SS';
  if (s.outId !== NAT.outId) {      /* 出局後：舉手報出局數／拍手 */
    s.outId = NAT.outId;
    if (NAT.outs && !isP && G.outs >= 1 && G.outs <= 2) { const x = ntRnd(); if (x < (IF ? .55 : .3)) s.pend = { name: 'nat_outs', t: .6 + ntRnd() * 1.8, opt: { n: G.outs } }; else if (x < (IF ? .75 : .5)) s.pend = { name: 'nat_clap', t: .5 + ntRnd() * 1.5 }; }
  }
  if (isP && s.ballId !== NAT.ballId) { s.ballId = NAT.ballId; if (ntRnd() < .35) s.pend = { name: 'nat_frown', t: .25 }; }
  else if (!isP) s.ballId = NAT.ballId;
  if (s.pend) { s.pend.t -= dt; if (s.pend.t <= 0) { const p = s.pend; s.pend = null; if (ntElig(r)) { ntStart(r, p.name, p.opt); return; } } }
  if (isP) return;
  s.ev -= dt; if (s.ev > 0) return;
  if (!ntElig(r)) { s.ev = 1 + ntRnd() * 4; return; }
  const x = ntRnd(), nm = x < .16 ? 'nat_stretch' : x < .32 ? 'nat_roll' : x < .52 ? 'nat_toedig' : x < .64 ? 'nat_look' : x < .8 ? 'nat_belt' : x < .84 ? 'nat_wave' : x < .93 ? 'nat_clap' : 'nat_roll';
  ntStart(r, nm); s.ev = 14 + ntRnd() * 22;
}
/* ---- 手指（報出局數用）：掛在右手前臂，平常隱藏 ---- */
const NT_FING = new THREE.CylinderGeometry(.03, .024, .2, 8);
function ntFing(r, n) {
  let f = r._ntF;
  if (!f) {
    if (!n) return; const fa = r.armR._fa || r.armR, hd = fa.children.find(c => c.geometry === GEO.hand) || r.armR.children.find(c => c.geometry === GEO.hand), m = hd ? hd.material : mat('#e8b890'); f = r._ntF = [];
    for (let i = 0; i < 2; i++) { const k = new THREE.Mesh(NT_FING, m); k.position.set(i ? -.05 : .035, -.47, .05); k.rotation.z = i ? .16 : -.16; k.visible = false; fa.add(k); f.push(k); }
  }
  f[0].visible = n >= 1; f[1].visible = n >= 2; r._ntFon = n > 0;
}
/* ---- 新動作姿勢表（以右手＝裸手；左手＝手套手）---- */
const ntEnv = u => sstep(Math.max(0, Math.min(1, u / .18))) * (1 - sstep(Math.max(0, Math.min(1, (u - .82) / .18))));
const NT_ACT = {
  nat_stretch: { dur: 2.4, face: 'effort', pose(r, a, u) { const k = ntEnv(u), sw = Math.sin(a.t * 2.2) * .08 * k; return { alx: -2.7 * k, arx: -2.7 * k, alz: 1.0 * k + sw, arz: -1.0 * k + sw, ale: .08 * k, are: .08 * k, bx: -.14 * k, hx: -.4 * k, y: .012 * k, llx: -.04 * k, lrx: .04 * k }; } },
  nat_roll: { dur: 2.0, face: 'idle', pose(r, a, u) { const k = ntEnv(u), w = a.t * 3.1; return { hy: Math.sin(w) * .5 * k, hz: Math.cos(w) * .22 * k, hx: .14 * k, alx: Math.sin(w) * .45 * k, arx: -Math.sin(w) * .45 * k, ale: .22 * k, are: .22 * k, bx: .03 * k, alz: .08 * k, arz: -.08 * k }; } },
  nat_toedig: { dur: 1.5, face: 'focus', pose(r, a, u) { const k = ntEnv(u), h = (a.opt && a.opt.hand) || 1, sc = Math.abs(Math.sin(a.t * 7)) * k, p = { bx: .1 * k, hx: .38 * k, alx: .1 * k, arx: .1 * k, ale: .2 * k, are: .2 * k }; if (h > 0) { p.lrx = -.6 * sc; p.rke = .3 * k + .15 * sc; p.llx = .05 * k; } else { p.llx = -.6 * sc; p.lke = .3 * k + .15 * sc; p.lrx = .05 * k; } return p; } },
  nat_look: { dur: 2.6, face: 'thinking', pose(r, a, u) { const k = ntEnv(u); return { hx: -.55 * k, hy: Math.sin(a.t * 1.4) * .65 * k, bx: -.07 * k, alx: .08 * k, arx: .08 * k, ale: .15 * k, are: .15 * k, hz: Math.sin(a.t * 1.4 + 1) * .08 * k }; } },
  nat_belt: { dur: 1.7, face: 'sigh', pose(r, a, u) { const k = ntEnv(u), tug = Math.max(0, Math.sin(a.t * 8.5)) * k; return { ale: 1.35 * k, are: 1.35 * k, alx: -.45 * k - .12 * tug, arx: -.45 * k - .12 * tug, alz: .38 * k, arz: -.38 * k, bx: .06 * k, hx: .35 * k, y: .014 * tug }; } },
  nat_wave: { dur: 2.0, face: 'grin', pose(r, a, u) { const k = ntEnv(u), w = Math.sin(a.t * 8) * .5 * k; return { arx: -2.6 * k, arz: -1.05 * k, are: .25 * k + w * .45, alx: .05 * k, hz: .12 * k, hy: .25 * k, bx: -.04 * k, y: .01 * k }; } },
  nat_clap: { dur: 1.8, face: 'smile', pose(r, a, u) { const k = ntEnv(u), c = Math.abs(Math.sin(a.t * 11)); return { ale: 1.7 * k, are: 1.7 * k, alx: -.95 * k, arx: -.95 * k, alz: (.36 - .3 * c) * k, arz: -(.36 - .3 * c) * k, bx: .05 * k, hx: -.08 * k, y: Math.abs(Math.sin(a.t * 5.5)) * .02 * k }; } },
  nat_outs: { dur: 2.3, face: 'shout', pose(r, a, u) { const k = ntEnv(u), n = (a.opt && a.opt.n) || 1; ntFing(r, k > .55 ? n : 0); return { arx: -2.55 * k, are: .15 * k, arz: -1.1 * k, alx: -.08 * k, hx: -.12 * k, bx: -.03 * k, hy: Math.sin(a.t * 1.6) * .3 * k }; } },
  nat_frown: { dur: 1.2, face: 'worry', pose(r, a, u) { const k = ntEnv(u); return { hy: Math.sin(a.t * 8) * .36 * k, hx: .22 * k, alz: .36 * k, arz: -.36 * k, ale: .5 * k, are: .5 * k, alx: -.2 * k, arx: -.2 * k, bx: .04 * k }; } }
};
if (typeof FX_ANIM !== 'undefined') for (const k in NT_ACT) FX_ANIM[k] = NT_ACT[k].face;
/* ---- 疊進姿勢（只在 rigStep 執行期間）---- */
function ntMod(r, p) {
  const s = r._nt; let q = null; const M = () => q || (q = Object.assign({}, p));
  if (s.k > .01) { const m = M(); m.hy = (m.hy || 0) + s.gy * s.k; m.hx = (m.hx || 0) + s.gx * s.k; if (s.tw) m.by = (m.by || 0) + s.tw * s.k; }
  if (s.sv) {
    const m = M(), c = s.sv.c, air = s.sv.air;
    if (s.sv.kind === 'split') { m.llx = (m.llx || 0) - .38 * c; m.lrx = (m.lrx || 0) - .38 * c; m.lke = (m.lke || 0) + .76 * c + .9 * air; m.rke = (m.rke || 0) + .76 * c + .9 * air; m.llx = (m.llx || 0) - .3 * air; m.lrx = (m.lrx || 0) - .15 * air; m.alx = (m.alx || 0) - .25 * air; m.arx = (m.arx || 0) - .25 * air; m.y = (m.y || 0) - .055 * c + .3 * air; m.bx = (m.bx || 0) + .12 * c; m.alx = (m.alx || 0) - .1 * c; m.arx = (m.arx || 0) - .1 * c; }
    else { m.bx = (m.bx || 0) + .16 * c; m.llx = (m.llx || 0) - .3 * c; m.lrx = (m.lrx || 0) - .3 * c; m.lke = (m.lke || 0) + .55 * c; m.rke = (m.rke || 0) + .55 * c; m.y = (m.y || 0) - .04 * c; }
  }
  if (s.sw) { const m = M(), w = s.sw; m.bz = (m.bz || 0) + w.bz; m.llx = (m.llx || 0) + w.l; m.lrx = (m.lrx || 0) - w.l; m.alx = (m.alx || 0) + w.a; m.arx = (m.arx || 0) - w.a; m.y = (m.y || 0) + w.y; }
  if (s.rc) { const m = M(); m.hy = (m.hy || 0) - (p.by || 0) * .7; m.hz = (m.hz || 0) - (p.bz || 0) * .5; }
  return q || p;
}
{
  const _srp = setRigPose;
  setRigPose = function (r, p) { if (r && r._nt && r._nt.mod) p = ntMod(r, p); return _srp.call(this, r, p); };
  const _rs = rigStep;
  rigStep = function (r, dt) {
    if (!NAT.on || window.__ff || !r || !r.legL || !r.torso) return _rs(r, dt);
    const s = ntS(r); try { ntGlobal(); ntPre(r, dt, s); } catch (e) { if (!NAT._e) { NAT._e = 1; console.error('[nat]', e); } }
    const a0 = r.anim, act = a0 && NT_ACT[a0.name];
    s.mod = true;
    try {
      _rs(r, dt);
      if (act && r.anim === a0) setRigPose(r, act.pose(r, a0, Math.max(0, Math.min(1, a0.t / a0.dur))));
    } finally { s.mod = false; }
  };
}
