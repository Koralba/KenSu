/* 06-ball-fx-camera.js — 球、擊球特效、煙火、止滑粉、鏡頭（原 script.js 第 1074-1292 行） */
'use strict';
/* ---------- ball ---------- */
const seamTex = canvasTex(256, 128, (g, w, h) => {      // 棒球縫線貼圖：旋轉才看得出球種
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8281e'; g.lineWidth = 5;
  for (const off of [h * .3, h * .7]) { g.beginPath(); for (let x = 0; x <= w; x += 4) { const y = off + Math.sin(x / w * Math.PI * 4) * h * .13; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.lineWidth = 2; for (let x = 0; x < w; x += 10) { const y1 = h * .3 + Math.sin(x / w * Math.PI * 4) * h * .13, y2 = h * .7 + Math.sin(x / w * Math.PI * 4) * h * .13; g.beginPath(); g.moveTo(x, y1 - 6); g.lineTo(x + 3, y1 + 6); g.moveTo(x, y2 - 6); g.lineTo(x + 3, y2 + 6); g.stroke(); }
});
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * .9, 14, 10), new THREE.MeshPhongMaterial({ color: 0xffffff, map: seamTex, shininess: 60 })); ballMesh.visible = false; scene.add(ballMesh);
const ballShadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = .05; ballShadow.scale.set(1, 1, 1); ballShadow.visible = false; scene.add(ballShadow);
const TRAIL_N = 18; const trail = []; for (let i = 0; i < TRAIL_N; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * (.8 - i / TRAIL_N * .55), 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .0 })); m.visible = false; scene.add(m); trail.push(m); }
const trailPos = [];
function setBall(p, vis, trailCol, tfx) {
  ballMesh.visible = vis; ballShadow.visible = vis; if (!vis) { trail.forEach(t => t.visible = false); return; }
  ballMesh.position.set(p.x, p.y, p.z); ballShadow.position.set(p.x, .05, p.z); const s = 1.1 + p.y * .12; ballShadow.scale.set(s, s, 1);
  ballShadow.material.opacity = clamp(1 - p.y / 40, .25, 1);
  if (trailCol !== undefined) {
    trailPos.unshift(p.clone ? p.clone() : new V3(p.x, p.y, p.z)); if (trailPos.length > TRAIL_N) trailPos.pop();
    const tn = tfx ? tfx.n : TRAIL_N, top = tfx ? tfx.op : .5, fl = tfx && tfx.flicker ? .55 + Math.random() * .45 : 1;
    for (let i = 0; i < TRAIL_N; i++) { const t = trail[i], q = trailPos[i]; if (q && i > 0 && i < tn) { t.visible = true; t.position.copy(q); t.material.color.set(trailCol); t.material.opacity = (1 - i / tn) * top * fl; } else t.visible = false; }
  } else { trailPos.length = 0; trail.forEach(t => t.visible = false); }
}

/* ---------- hit burst ---------- */
const burstTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 60); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,230,120,.9)'); r.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
});
const bursts = [];
function spawnBurst(x, y, z, size, col) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex, transparent: true, depthTest: false, depthWrite: false })); if (col) sp.material.color.set(col); sp.position.set(x, y, z); sp.scale.set(.2, .2, 1); sp.renderOrder = 10; scene.add(sp); bursts.push({ sp, t: 0, size });
}
/* ---------- 全壘打煙火秀 ---------- */
const dotTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.28, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
/* ---------- 止滑粉：白粉顆粒（柔邊圓點、一般混色，飄散漸淡） ---------- */
const POWDER = [];      // 止滑粉粒子上限（提高以呈現更濃的粉霧）
function powderPuff(x, y, z, n, spread, vx, vy, vz, size, o) {
  o = o || {};
  for (let i = 0; i < n && POWDER.length < 1100; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: false, depthWrite: false, color: 0xf6f3e8, opacity: o.op || .8 })); sp.renderOrder = 11;
    const s0 = size * (.6 + Math.random() * .8); sp.position.set(x + gauss() * .04, y + gauss() * .04, z + gauss() * .04); sp.scale.setScalar(s0); scene.add(sp);
    POWDER.push({ sp, t: 0, op: o.op || .75, grow: o.grow === undefined ? 2.6 : o.grow, sw: o.sw || 0, ph: Math.random() * 6.28, life: (o.life || .7) * (1 + Math.random() * (o.lv === undefined ? 1.3 : o.lv)), vx: vx + gauss() * spread, vy: vy + Math.abs(gauss()) * spread * .6, vz: vz + gauss() * spread, s0 });
  }
}
function rosinBurstFx(hp, sd, pt) {      // 加強版止滑粉：出手瞬間爆開一大團粉霧＋閃亮粉粒四散落下＋沿球路拖出長長的粉塵尾跡
  const x = hp.x, y = hp.y, z = hp.z;
  powderPuff(x, y, z, 46, .5, sd * .8, .5, 4.2, .2, { op: .9, life: 1.6, grow: 4.2, sw: .7 });      // 大團主粉霧
  powderPuff(x, y, z, 30, .3, sd * .3, .3, 1.4, .13, { op: .85, life: 2.4, grow: 5, sw: 1 });      // 久留的細粉
  powderPuff(x, y - .05, z, 18, .6, sd * .9, -.1, 2.4, .26, { op: .5, life: 1.9, grow: 4.4, sw: .8 });      // 外圍淡粉團
  for (let i = 0; i < 70; i++) { const a = Math.random() * TAU, sp = .6 + Math.random() * 2.6; fwSpawn(x + gauss() * .03, y + gauss() * .03, z + gauss() * .03, Math.cos(a) * sp * .7 + sd * (1 + Math.random() * 2.2), (Math.random() - .3) * 2.2, Math.sin(a) * sp * .7 + 1.5 + Math.random() * 3, Math.random() < .25 ? '#fff6c8' : '#ffffff', .6 + Math.random() * .7, .045 + Math.random() * .06, 2.6, 2.2); }      // 閃亮粉粒：被光線打亮、四散後緩緩落下
  const bp = ballMesh.position;
  for (let k = 10; k <= 18; k++) after(.035 * k, () => { if (PT !== pt) return; powderPuff(bp.x, bp.y, bp.z, 5, .1, sd * .1, .06, .4, .1, { op: .5, life: 1.0, grow: 3.6, sw: .6 }); });      // 尾跡延長
  after(.03, () => { pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 26, .3, sd * .5, .3, 2.4, .15, { op: .7, life: 1.7, grow: 4.2, sw: .8 }); });
  CAMC.shake = Math.max(CAMC.shake || 0, .03);
}
function updatePowder(dt) {
  for (let i = 0; i < POWDER.length; i++) {
    const q = POWDER[i]; q.t += dt; const u = q.t / q.life, d = Math.max(0, 1 - dt * 2.4); q.vx *= d; q.vy = q.vy * d + .25 * dt; q.vz *= d; if (q.sw) { q.vx += Math.sin(q.t * 3.1 + q.ph) * q.sw * dt; q.vz += Math.cos(q.t * 2.6 + q.ph) * q.sw * dt; }      // 細粉在空氣中緩緩飄晃
    q.sp.position.x += q.vx * dt; q.sp.position.y += q.vy * dt; q.sp.position.z += q.vz * dt; q.sp.scale.setScalar(q.s0 * (1 + u * q.grow)); q.sp.material.opacity = q.op * Math.min(1, u * 14) * Math.pow(Math.max(0, 1 - u), 1.3);
    if (u >= 1) { scene.remove(q.sp); q.sp.material.dispose(); POWDER.splice(i, 1); i--; }
  }
}
const FW = { pool: [], live: [], rockets: [], on: false };
const FW_COLS = ['#ff4d4d', '#ffd34d', '#4dd2ff', '#7dff7d', '#ff7de9', '#ffffff', '#ffa63d', '#b57dff'];
function fwSprite() { let s = FW.pool.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); s.renderOrder = 12; } scene.add(s); return s; }
function fwSpawn(x, y, z, vx, vy, vz, col, life, size, grav, drag) {
  if (FW.live.length > 1100) return; const sp = fwSprite(); sp.position.set(x, y, z); sp.material.color.set(col); sp.material.opacity = 1; sp.scale.setScalar(size);
  FW.live.push({ sp, vx, vy, vz, t: 0, life, size, grav: grav === undefined ? 9 : grav, drag: drag === undefined ? 1.5 : drag });
}
function fwExplode(kind, x, y, z, c1, c2, sc) {
  fwSpawn(x, y, z, 0, 0, 0, '#ffffff', .22, 14 * sc, 0, 0);                                   // 爆開瞬間的閃光
  const P = (vx, vy, vz, i, life, gr) => fwSpawn(x, y, z, vx, vy, vz, (c2 && i % 2) ? c2 : c1, life || (1.5 + Math.random() * .7), 1.1 * sc + Math.random() * .5, gr, 1.4);
  if (kind === 'peony') for (let i = 0; i < 80; i++) { const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), sp = 15 * sc * (.65 + Math.random() * .35); P(sp * Math.sin(ph) * Math.cos(th), sp * Math.cos(ph), sp * Math.sin(ph) * Math.sin(th), i); }
  else if (kind === 'ring') for (let i = 0; i < 56; i++) { const a = i / 56 * 6.283, sp = 17 * sc; P(Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - .5) * 2, i); }
  else if (kind === 'heart') for (let i = 0; i < 72; i++) { const t = i / 72 * 6.283, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); P(hx * .95 * sc, (hy + 3) * .95 * sc, (Math.random() - .5) * 2, i, 1.8, 3); }
  else if (kind === 'star') for (let i = 0; i < 75; i++) { const seg = Math.floor(i / 15), f = (i % 15) / 15, a0 = seg * 4 * Math.PI / 5, a1 = (seg + 1) * 4 * Math.PI / 5, px = Math.cos(a0) * (1 - f) + Math.cos(a1) * f, py = Math.sin(a0) * (1 - f) + Math.sin(a1) * f; P(px * 17 * sc, py * 17 * sc + 2, (Math.random() - .5) * 2, i, 1.7, 3); }
  else if (kind === 'willow') for (let i = 0; i < 60; i++) { const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), sp = 11 * sc * (.6 + Math.random() * .4); P(sp * Math.sin(ph) * Math.cos(th), sp * Math.cos(ph) + 2, sp * Math.sin(ph) * Math.sin(th), 0, 2.8 + Math.random() * 1, 3.2); }
  else if (kind === 'double') { for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283; P(Math.cos(a) * 18 * sc, Math.sin(a) * 18 * sc, 0, 0); P(Math.cos(a) * 9 * sc, Math.sin(a) * 9 * sc, 0, 1); } }
  if (typeof flowSfx === 'function') { flowSfx('boom', clamp(sc * .8, .4, 1)); setTimeout(() => flowSfx('crackle', .7), 260); }
}
function fwLaunch(x, z, ty, kind, c1, c2, sc, rise) { FW.rockets.push({ x, y: 1, z, vy: (ty - 1) / rise, ty, kind, c1, c2, sc }); }
function fwFountain(x, z, dur) { FW.rockets.push({ fountain: true, x, z, t: 0, dur }); }
function fireworkShow(dur, power) {                        // 煙火秀：陸續升空、多種花型、最後連發大結尾，並配合場邊噴泉火花
  if (FW.on) return; FW.on = true; const kinds = ['peony', 'ring', 'heart', 'star', 'willow', 'double']; dur = dur || 10; power = power || 1;
  const n = 9 + Math.round(power * 4); fwFountain(-34, -72, dur * .7); fwFountain(0, -80, dur * .7); fwFountain(34, -72, dur * .7);
  for (let i = 0; i < n; i++) {
    const t = .3 + (dur - 2.6) * i / n + Math.random() * .4, k = kinds[Math.floor(Math.random() * kinds.length)], c1 = FW_COLS[Math.floor(Math.random() * FW_COLS.length)], c2 = Math.random() < .5 ? FW_COLS[Math.floor(Math.random() * FW_COLS.length)] : null;
    after(t, () => fwLaunch((Math.random() - .5) * 110, -78 - Math.random() * 40, 30 + Math.random() * 26, k, c1, c2, .85 + Math.random() * .5, .8 + Math.random() * .25));
  }
  const n2 = 6 + Math.round(power * 4);      // 近景煙火：升在內野／場中上空，鏡頭跟著跑者時一定看得到
  for (let i = 0; i < n2; i++) { const t = 1 + (dur - 3.5) * i / n2 + Math.random() * .5, k = kinds[Math.floor(Math.random() * kinds.length)], c1 = FW_COLS[Math.floor(Math.random() * FW_COLS.length)];
    after(t, () => fwLaunch((Math.random() - .5) * 70, -18 - Math.random() * 40, 20 + Math.random() * 12, k, c1, Math.random() < .5 ? '#ffd34d' : null, .7 + Math.random() * .4, .8)); }
  for (let j = 0; j < 6; j++) after(dur - 1.6 + j * .12, () => fwLaunch(-55 + j * 22 + Math.random() * 8, -85 - Math.random() * 25, 34 + Math.random() * 18, kinds[Math.floor(Math.random() * kinds.length)], FW_COLS[(j * 3) % FW_COLS.length], '#ffd34d', 1.25, .75));       // 結尾連發
  after(dur + 3.5, () => { FW.on = false; });
}
const HRC = { list: [], t: 0 };
function hrCrewSpawn() {      // 全壘打：隊友從休息區衝出來，在本壘旁等著迎接
  hrCrewClear(); const st = teamStyle(G.half), sx = Math.random() < .5 ? -1 : 1;
  for (let i = 0; i < 4; i++) { const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, scale: .95 }); scene.add(rig.root);
    const x0 = sx * (11 + i * .9), z0 = 4.5 + i * .6; rig.root.position.set(x0, 0, z0); rig.run = 1.6;
    HRC.list.push({ rig, x: x0, z: z0, tx: (i < 2 ? -1 : 1) * (1.8 + (i % 2) * .8), tz: 2.4 + (i % 2) * .8, st: 'run', d: .4 + i * .3 }); }
  HRC.t = 0;
}
function hrCrewClear() { for (const c of HRC.list) scene.remove(c.rig.root); HRC.list = []; }
function hrCrewCheer(big) { for (const c of HRC.list) { c.st = 'cheer'; c.rig.run = 0; c.rig.anim = { name: big ? 'cel1' : 'cheer', t: 0, dur: big ? 2.4 : 1, opt: {} }; } HRC.t = 0; HRC.end = 5.5; }
function hrBaseFx(b) {      // 打者踩到壘包：壘包爆出金色火花與小煙火，壘包面板同步閃一下
  const p = baseSpot(b); fwSpawn(p.x, .5, p.z, 0, 0, 0, '#fff2a0', .5, 7, 0, 0);
  for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, sp = 4 + Math.random() * 3; fwSpawn(p.x, .3, p.z, Math.cos(a) * sp, 6 + Math.random() * 4, Math.sin(a) * sp, i % 3 ? '#ffd34d' : '#ffffff', .9 + Math.random() * .5, .9, 9, 1.3); }
  fwLaunch(p.x, p.z, 14 + Math.random() * 5, ['ring', 'peony', 'star'][b % 3], FW_COLS[(b * 2) % FW_COLS.length], '#ffd34d', .55, .55);
  try { const el = $(['b1', 'b2', 'b3', 'bh'][b - 1]); if (el && el.animate) el.animate([{ offset: .5, background: '#fff7a0', boxShadow: '0 0 14px 4px #ffd21a,0 0 30px 9px #ff7a1a', transform: 'rotate(45deg) scale(1.5)' }], { duration: 700, iterations: 2 }); } catch (e) { }
}
function hrHomeFx() {      // 回到本壘：噴泉、環形煙火、金色彩帶、全員歡呼
  fwFountain(-1.8, 1.5, 2.6); fwFountain(1.8, 1.5, 2.6); fwFountain(0, 3, 2.2);
  for (let j = 0; j < 8; j++) after(.1 + j * .22, () => fwLaunch((Math.random() - .5) * 40, -6 - Math.random() * 30, 16 + Math.random() * 12, ['peony', 'ring', 'star', 'heart', 'double'][j % 5], FW_COLS[(j * 3) % FW_COLS.length], '#ffd34d', .7 + Math.random() * .3, .65));
  const cols = ['#ffd34d', '#ff4d4d', '#4dd2ff', '#7dff7d', '#ff7de9', '#ffffff'];
  for (let i = 0; i < 110; i++) after(Math.random() * 2.2, () => fwSpawn((Math.random() - .5) * 34, 13 + Math.random() * 5, 4 - Math.random() * 28, (Math.random() - .5) * 2.5, -1 - Math.random() * 1.5, (Math.random() - .5) * 2.5, cols[i % cols.length], 4 + Math.random() * 1.5, .5 + Math.random() * .3, 1.6, 1.2));
  hrCrewCheer(true); crowdCheer(2); try { CAMC.shake = Math.max(CAMC.shake || 0, .2); flashScreen(.3); } catch (e) { }
}
function updateFireworks(dt) {
  for (const r of E.runners) { if (r && r.trot && r.state === 'run' && r.rig && r.rig.root.visible) { const q = r.rig.root.position; for (let k = 0; k < 2; k++) fwSpawn(q.x + (Math.random() - .5) * .5, .25 + Math.random() * .3, q.z + (Math.random() - .5) * .5, (Math.random() - .5) * 2, 1 + Math.random() * 2, (Math.random() - .5) * 2, k ? '#ffd34d' : '#ffffff', .55 + Math.random() * .3, .55, 3, 1.5); } }      // 慢跑時腳下拖出金色火花尾跡
  if (HRC.list.length) { HRC.t += dt; for (const c of HRC.list) { if (c.st === 'run') { if (c.d > 0) { c.d -= dt; c.rig.run = 0; } else { const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz); if (d < .25) { c.st = 'wait'; c.rig.run = 0; c.rig.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; faceRig(c.rig, 0, 0); } else { const v = Math.min(d, 5.5 * dt); c.x += dx / d * v; c.z += dz / d * v; c.rig.run = 1.6; faceRig(c.rig, c.tx, c.tz); } } } c.rig.root.position.set(c.x, 0, c.z); rigStep(c.rig, dt); }
    if (HRC.end && HRC.t > HRC.end || HRC.t > 40 || G.mode !== 'play') { hrCrewClear(); HRC.end = 0; } }
  for (let i = FW.rockets.length - 1; i >= 0; i--) {
    const r = FW.rockets[i];
    if (r.fountain) { r.t += dt; for (let k = 0; k < 3; k++) fwSpawn(r.x + (Math.random() - .5), 1, r.z, (Math.random() - .5) * 7, 17 + Math.random() * 9, (Math.random() - .5) * 5, Math.random() < .5 ? '#ffe9a0' : '#ffb347', .9 + Math.random() * .5, .7, 11, 1); if (r.t > r.dur) FW.rockets.splice(i, 1); continue; }
    r.y += r.vy * dt; fwSpawn(r.x, r.y, r.z, (Math.random() - .5) * 2, -3, (Math.random() - .5) * 2, '#ffcf80', .5, .8, 3, 2);
    if (r.y >= r.ty) { fwExplode(r.kind, r.x, r.y, r.z, r.c1, r.c2, r.sc); FW.rockets.splice(i, 1); }
  }
  for (let i = FW.live.length - 1; i >= 0; i--) {
    const p = FW.live[i]; p.t += dt; const k = Math.exp(-dt * p.drag); p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k; const sp = p.sp; sp.position.x += p.vx * dt; sp.position.y += p.vy * dt; sp.position.z += p.vz * dt;
    const u = p.t / p.life; if (u >= 1 || sp.position.y < .2) { scene.remove(sp); FW.pool.push(sp); FW.live.splice(i, 1); continue; }
    sp.material.opacity = (1 - u * u) * (.75 + .25 * Math.sin(p.t * 40 + i)); sp.scale.setScalar(p.size * (1 - u * .45));
  }
}
function updateBursts(dt) { updatePowder(dt); if (typeof updatePickTags === 'function') updatePickTags(); if (typeof updateStealTags === 'function') updateStealTags(); if (typeof updateRosinTag === 'function') updateRosinTag(dt); for (let i = 0; i < bursts.length; i++) { const b = bursts[i]; b.t += dt; const u = b.t / .28; b.sp.scale.setScalar(.2 + b.size * Math.min(1, u * 1.4)); b.sp.material.opacity = Math.max(0, 1 - u); if (u >= 1) { scene.remove(b.sp); bursts.splice(i, 1); i--; } } }
/* ---------- camera controller ---------- */
const CAMC = { mode: 'title', pos: new V3(0, 30, 50), look: new V3(0, 0, -25), fov: 46, tpos: new V3(), tlook: new V3(), tfov: 46, k: 3, kl: 0, orbit: 0, shake: 0, pt: 0, has: false, px: 0, pz: 0, vx: 0, vz: 0, fy: 1.5, _pm: false };
function camSnap() { CAMC.pos.copy(CAMC.tpos); CAMC.look.copy(CAMC.tlook); CAMC.fov = CAMC.tfov; }
function setCamBat(snap) { CAMC.mode = 'bat'; CAMC.tpos.set(0, 4.6, 9.4); CAMC.tlook.set(0, 1.45, -9); CAMC.tfov = 42 * (VP.fk || 1); CAMC.k = 4; if (snap) camSnap(); }
function setCamPlayTarget(f) { CAMC.mode = 'play'; }
/* ---------- 擊球後追焦鏡頭 ----------
   舊版：鏡頭貼在球後方低位跟拍，球飛到外野時鏡頭也跑進外野，內野與跑壘完全看不到、視角又太近。
   新版：鏡頭固定在本壘後方高處（類似電視轉播的高機位），只隨球的方向小幅平移；
   看的位置在「內野中心」與「球／跑者」之間依距離加權，內野球多看場面、遠飛球多看球；
   球慢下來（被接殺、持球）時把還在跑的跑者一起納入畫面；球速越快鏡頭提前量越大，球不會跑出畫面。 */
function camChase(dt, focus) {
  const C = CAMC, fx = focus.x, fz = focus.z, fy = focus.y;
  C.pt += dt;
  if (C.has && dt > 1e-4) { const ik = 1 / dt, kk = Math.min(1, dt * 8); C.vx += (clamp((fx - C.px) * ik, -80, 80) - C.vx) * kk; C.vz += (clamp((fz - C.pz) * ik, -80, 80) - C.vz) * kk; } else { C.vx = C.vz = 0; C.has = true; }
  C.px = fx; C.pz = fz;
  const spd = Math.hypot(C.vx, C.vz);
  let tx = fx, tz = fz, rx = 0, rz = 0, rn = 0;
  try { for (const r of E.runners) if (r.state === 'run' && r.rig) { const p = r.rig.root.position; rx += p.x; rz += p.z; rn++; } } catch (e) { }
  if (rn) { const w = .55 * clamp(1 - spd / 9, 0, 1); tx = fx * (1 - w) + (rx / rn) * w; tz = fz * (1 - w) + (rz / rn) * w; }      // 球幾乎停住 → 改看跑者
  if (spd > 1) { const ld = Math.min(8, spd * .1); tx += C.vx / spd * ld; tz += C.vz / spd * ld; }      // 領先量：看球前進的方向
  const dd = Math.hypot(tx, tz), wB = clamp(.5 + dd / 160, .5, .78);
  const lx = tx * wB, lz = -22 * (1 - wB) + tz * wB;
  C.fy += (Math.max(1, fy * .6) - C.fy) * Math.min(1, dt * 8);      // 高度另外平滑：球彈跳時畫面不上下抖，高飛球仍能快速抬頭追上
  const ly = 1 + (C.fy - 1) * wB, far = Math.min(dd, 110);
  const ramp = clamp(C.pt / .9, 0, 1);
  C.tlook.set(lx, ly, lz);
  C.tpos.set(clamp(lx * .28, -10, 10), 11 + far * .17 + Math.max(0, C.fy - 3) * .25, 18);      // 本壘後方、看台牆內側（牆半徑 ≥ 22）
  C.tfov = (52 + clamp(dd / 90, 0, 1) * 8) * (VP.fk || 1);
  C.k = 3 + 1.2 * ramp; C.kl = 7 + 2 * ramp;      // 剛擊球時鏡頭慢慢拉開、看的方向與視角（fov）較快跟上
  if (tz > 1.5 && C.vz > 0) {      // 球飛到本壘後方（界外高飛、擦棒球）：不然球會跑到鏡頭正上方 → 鏡頭移到本壘旁邊看球
    C.tpos.set((fx >= 0 ? -1 : 1) * 13, 8, 4); C.tlook.set(fx * .9, Math.max(1.2, C.fy * .85), fz); C.tfov = 58 * (VP.fk || 1);
  }
}
function updateCamera(dt, focus) {
  CAMC.kl = 0;
  { const pm = CAMC.mode === 'play' || CAMC.mode === 'batfollow'; if (pm && !CAMC._pm) { CAMC.pt = 0; CAMC.has = false; CAMC.fy = focus ? Math.max(1, focus.y * .6) : 1.5; } CAMC._pm = pm; }
  if (VENUE.on && CAMC.mode !== 'venue') { VENUE.on = false; VENUE.done = null; document.body.classList.remove('venuing'); $('venueIntro').classList.add('hide'); }
  if (CAMC.mode === 'venue' && VENUE.on) {
    VENUE.t += dt; const u = clamp(VENUE.t / VENUE.orbit, 0, 1), e = u * .6 + (u * u * (3 - 2 * u)) * .4, a = e * Math.PI * 2 * .96, sw = Math.sin(u * Math.PI);
    const R = 54 - 5 * sw, H = 42 - 6 * sw;
    CAMC.tpos.set(Math.sin(a) * R, H, -30 + Math.cos(a) * R); CAMC.tlook.set(Math.sin(a + 1.2) * 4, 2, -30 + Math.cos(a + 1.2) * 4); CAMC.tfov = 60 * (VP.fk || 1); CAMC.k = 6;
    if (VENUE.t >= VENUE.dur) venueEnd();
  } else if (CAMC.mode === 'pen' && BP.shotCur) {
    CAMC.tpos.copy(BP.shotCur.pos); CAMC.tlook.copy(BP.shotCur.look); CAMC.tfov = BP.shotCur.fov * (VP.fk || 1); CAMC.k = 5;
  } else if (CAMC.mode === 'title') {
    CAMC.orbit += dt * .08; const a = CAMC.orbit, r = 62;
    CAMC.tpos.set(Math.sin(a) * 12, 40, 38 + Math.cos(a) * 3); CAMC.tlook.set(Math.sin(a * 1.3) * 6, 0, -27); CAMC.tfov = 58 * (VP.fk || 1); CAMC.k = 1.2;
  } else if ((CAMC.mode === 'play' || CAMC.mode === 'batfollow') && focus) {
    camChase(dt, focus);
  } else if (CAMC.mode === 'hrtrot' && focus) {
    CAMC.tlook.set(focus.x, 1.1, focus.z); CAMC.tpos.set(focus.x * .4, 15 + Math.hypot(focus.x, focus.z) * .15, focus.z + 26); CAMC.tfov = 52 * (VP.fk || 1); CAMC.k = 2.4;
  } else if (CAMC.mode === 'close' && focus) {
    CAMC.tlook.set(focus.x, 1, focus.z); CAMC.tpos.set(focus.x + (focus.x >= 0 ? 8 : -8), 7, focus.z + 12); CAMC.tfov = 46 * (VP.fk || 1); CAMC.k = 3.4;
  }
  const f = 1 - Math.exp(-dt * CAMC.k), fl = CAMC.kl ? 1 - Math.exp(-dt * CAMC.kl) : f;
  CAMC.pos.lerp(CAMC.tpos, f); CAMC.look.lerp(CAMC.tlook, fl); CAMC.fov += (CAMC.tfov - CAMC.fov) * (CAMC.kl ? fl : f);
  camera.position.copy(CAMC.pos);
  if (CAMC.shake > 0) { camera.position.x += (Math.random() - .5) * CAMC.shake; camera.position.y += (Math.random() - .5) * CAMC.shake; CAMC.shake = Math.max(0, CAMC.shake - dt * 2); }
  camera.fov = CAMC.fov; camera.lookAt(CAMC.look); camera.updateProjectionMatrix();
}
const AQ = { q: 1, acc: 0, n: 0, good: 0, last: 0, up: 0, wait: 6000 };      // 動態解析度：畫面吃緊（幀時間過長）就自動降一點像素比，順了再慢慢拉回
function adaptQuality(real) {
  if (typeof G === 'undefined' || G.mode !== 'play' || document.hidden) { AQ.acc = 0; AQ.n = 0; return; }
  AQ.acc += real; AQ.n++; if (AQ.n < 40) return; const avg = AQ.acc / AQ.n; AQ.acc = 0; AQ.n = 0; const now = performance.now();
  if (avg > 1 / 46 && AQ.q > .62) { if (now - AQ.up < 15000) AQ.wait = Math.min(AQ.wait * 2, 60000); AQ.q = Math.max(.62, AQ.q - .12); AQ.good = 0; AQ.last = now; resize(); }      // 剛拉高又掉下來：下次等更久再試，避免畫質來回跳動
  else if (avg < 1 / 54 && AQ.q < 1 && now - AQ.last > AQ.wait) { if (++AQ.good >= 4) { AQ.q = Math.min(1, AQ.q + .08); AQ.good = 0; AQ.last = AQ.up = now; resize(); } }
  else if (avg >= 1 / 54) AQ.good = 0;
}
function resize() {
  measureVP(); const w = VP.w, h = VP.h, dpr = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 2 : 2);
  // 依解析度自動調整像素比：像素總量過大的設備（高 DPR 平板）自動降比例，維持流暢又清晰
  const maxPx = IS_TOUCH ? 2.6e6 : 5e6; const pr = Math.max(.7, Math.max(1, Math.min(dpr, Math.sqrt(maxPx / (w * h)))) * AQ.q);
  VP.dpr = pr; renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h;
  const ov = document.getElementById('ov'); ov.width = Math.round(w * pr); ov.height = Math.round(h * pr);
  // 直式／窄螢幕：垂直視角加大，確保水平視野不被裁切、比例不變形
  const asp = w / h, k = asp < 1.78 ? Math.min(1.9, Math.pow(1.78 / asp, .62)) : 1; VP.fk = k;
  if (CAMC.mode === 'bat') CAMC.tfov = 42 * k;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 250); setTimeout(resize, 700); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
if (window.ResizeObserver) { try { new ResizeObserver(() => resize()).observe(document.getElementById('wrap')); } catch (e) { } }
document.addEventListener('fullscreenchange', () => setTimeout(resize, 120)); document.addEventListener('webkitfullscreenchange', () => setTimeout(resize, 120));
resize();
function crowdCheer(amt) { crowdCheer.v = Math.max(crowdCheer.v || 0, amt); }

