/* ===== 02-stadium-scene.js ｜ three.js 場景：草皮／內野／全壘打牆與看板／觀眾／夜間燈光 =====
   載入順序 2/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
'use strict';
/* =====================================================================
   Part 3: three.js scene — stadium, chibi players, ball, camera
   ===================================================================== */
const VP = { w: window.innerWidth, h: window.innerHeight, dpr: 1 };
const VW = () => VP.w, VH = () => VP.h;
function measureVP() {
  const wr = document.getElementById('wrap'), vv = window.visualViewport;
  let w = (wr && wr.clientWidth) || (vv && vv.width) || window.innerWidth, h = (wr && wr.clientHeight) || (vv && vv.height) || window.innerHeight;
  VP.w = Math.max(1, Math.round(w)); VP.h = Math.max(1, Math.round(h));
}
const canvasGL = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: canvasGL, antialias: true, powerPreference: 'high-performance' });
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let MOB = false;   // 手機／平板：觸控為主要輸入時啟用精簡版面（電腦版不受影響）
function calcMob() { MOB = !!(IS_TOUCH && ((window.matchMedia && matchMedia('(pointer:coarse)').matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))); document.body.classList.toggle('mob', MOB); arrangeTop(); }
function arrangeTop() {   // 手機版：把打者／投手／比分搬進同一列（打者在左、比分在右）；電腦版還原
  const g = id => document.getElementById(id), tb = g('topbar'), pi = g('pinfo'), sb = g('sb'), hud = g('hud'), pB = g('pBox'), bB = g('bBox');
  if (!tb || !pi || !sb || !pB || !bB) return;
  if (MOB) { if (!tb.contains(bB)) tb.append(bB, pB, sb); }
  else if (tb.contains(bB)) { pi.append(pB, bB); hud.insertBefore(sb, hud.firstChild); }
}
calcMob(); window.addEventListener('resize', calcMob);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8cc6ff);
scene.fog = new THREE.Fog(0xa8d4ff, 140, 360);
const camera = new THREE.PerspectiveCamera(46, 1, 0.3, 700);
const V3 = THREE.Vector3;
const hemi = new THREE.HemisphereLight(0xf0f2e6, 0x4a7a40, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(-40, 80, 40); scene.add(sun);
/* 彩虹：雨後放晴時，在外野後方遠處的天空出現（真正的 3D 物件，會被看台遮住下半部） */
const rainbow = new THREE.Group(); rainbow.visible = false;
[0xff4a4a, 0xff9a3a, 0xffe44a, 0x5ae06a, 0x4ac8e8, 0x4a6aff, 0x9a5aff].forEach((c, i) => rainbow.add(new THREE.Mesh(new THREE.RingGeometry(150 - (i + 1) * 5, 150 - i * 5, 96, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }))));
{ const gl = new THREE.Mesh(new THREE.RingGeometry(108, 160, 96, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false })); gl.userData.glow = true; rainbow.add(gl); }
rainbow.position.set(0, -45, -320); scene.add(rainbow);

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
/* ---------- grass: rotated checker ---------- */
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#59be59'; g.fillRect(0, 0, w, h); g.fillStyle = '#4cae50';
  g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  g.globalAlpha = .06; for (let i = 0; i < 1600; i++) { g.fillStyle = Math.random() < .5 ? '#fff' : '#000'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}, true);
grassTex.repeat.set(13, 13); grassTex.center.set(.5, .5); grassTex.rotation = Math.PI / 4;
const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshLambertMaterial({ map: grassTex }));
grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0, -30); scene.add(grass);
const dark = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x23402a }));
dark.rotation.x = -Math.PI / 2; dark.position.y = -0.3; scene.add(dark);

/* ---------- infield skin ---------- */
const SK = { x0: -45, z0: -69, S: 90, N: 1536 };
const px = x => (x - SK.x0) / SK.S * SK.N, pz = z => (z - SK.z0) / SK.S * SK.N;
const skinTex = canvasTex(SK.N, SK.N, (g) => {
  const dirt = '#c98b57';
  g.fillStyle = dirt;
  g.beginPath(); g.arc(px(0), pz(-16), 23.5 / SK.S * SK.N, 0, TAU); g.fill();       // infield arc（紅土縮小到接近實際比例，草地外野變大）
  g.beginPath(); g.arc(px(0), pz(1.5), 6.8 / SK.S * SK.N, 0, TAU); g.fill();         // home circle
  // grass diamond inside
  const gr = '#5cc760', inset = 2.0;
  const v = [[0, -inset * 1.7 - 2.5], [H - inset * 1.4, -H], [0, -2 * H + inset * 1.4], [-H + inset * 1.4, -H]];
  g.fillStyle = gr; g.beginPath(); v.forEach((p, i) => i ? g.lineTo(px(p[0]), pz(p[1])) : g.moveTo(px(p[0]), pz(p[1]))); g.closePath(); g.fill();
  g.fillStyle = dirt; for (const b of BASES.slice(1)) { g.beginPath(); g.arc(px(b.x), pz(b.z), 3.4 / SK.S * SK.N, 0, TAU); g.fill(); }
  g.beginPath(); g.arc(px(0), pz(-15), 3.6 / SK.S * SK.N, 0, TAU); g.fill();
  g.fillStyle = '#d8a06a'; g.beginPath(); g.arc(px(0), pz(-15), 2.5 / SK.S * SK.N, 0, TAU); g.fill();
  // rubber & boxes
  g.fillStyle = '#fff'; g.fillRect(px(-.6), pz(-15.15), 1.2 / SK.S * SK.N, .3 / SK.S * SK.N);
  g.strokeStyle = '#fff'; g.lineWidth = .16 / SK.S * SK.N;
  for (const s of [-1, 1]) g.strokeRect(px(s * 1.9 - 0.9), pz(-1.6), 1.8 / SK.S * SK.N, 3.8 / SK.S * SK.N);
  g.strokeRect(px(-1.6), pz(2.6), 3.2 / SK.S * SK.N, 2 / SK.S * SK.N);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(px(-.8), pz(0)); g.lineTo(px(.8), pz(0)); g.lineTo(px(.8), pz(.5)); g.lineTo(px(0), pz(1.1)); g.lineTo(px(-.8), pz(.5)); g.fill();
});
const skin = new THREE.Mesh(new THREE.PlaneGeometry(SK.S, SK.S), new THREE.MeshLambertMaterial({ map: skinTex, transparent: true }));
skin.rotation.x = -Math.PI / 2; skin.position.set(0, 0.02, SK.z0 + SK.S / 2); scene.add(skin);
const moundMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.9, 0.4, 24), new THREE.MeshLambertMaterial({ color: 0xd49a66 }));
moundMesh.position.set(MOUND.x, 0.18, MOUND.z); scene.add(moundMesh);
const rosinBag = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), new THREE.MeshLambertMaterial({ color: 0xf3f0e4 })); rosinBag.scale.set(1, .75, 1); rosinBag.position.set(MOUND.x + 1.05, .47, MOUND.z - .15); scene.add(rosinBag);      // 投手丘上的止滑粉袋
for (const s of [-1, 1]) {            // foul lines
  const l = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 104), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  l.rotation.x = -Math.PI / 2; l.rotation.z = s * Math.PI / 4 * -1; l.position.set(s * 36.8, 0.035, -36.8); scene.add(l);
}
const baseMeshes = BASES.slice(1).map(b => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, .25, 1.5), new THREE.MeshLambertMaterial({ color: 0xffffff })); m.position.set(b.x, .15, b.z); m.rotation.y = Math.PI / 4; scene.add(m); return m; });

/* ---------- wall with ad banners + crowd ---------- */
const AD_TEXT = [['鯨魚小兒科', '#fff', '#1f7a3a'], ['弱力鮮乳', '#fff', '#2a6ad8'], ['企鵝電機', '#ffe', '#1a1a1a'], ['居家中心', '#fff', '#d8362a'], ['章魚燒本舖', '#222', '#ffd21a'], ['拉麵一番', '#fff', '#c01818'], ['AI 保險', '#fff', '#5b2aa8'], ['楓葉銀行', '#fff', '#a81430'], ['貓咪運輸', '#222', '#ffffff'], ['鯱魚汽車', '#fff', '#0f3b94']];
function drawAds(g, w, h) {
  const n = AD_TEXT.length, bw = w / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = AD_TEXT[i][2]; g.fillRect(i * bw, 6, bw - 4, h - 12);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(i * bw, 6, bw - 4, 10);
    g.fillStyle = AD_TEXT[i][1]; g.font = "900 " + (h * .42) + "px 'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(AD_TEXT[i][0], i * bw + bw / 2, h / 2 + 3, bw - 20);
  }
}
const adTex = canvasTex(2048, 128, drawAds, true);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const c = adTex.image.getContext('2d'); c.clearRect(0, 0, 2048, 128); drawAds(c, 2048, 128); adTex.needsUpdate = true; });
function ringGeom(r0f, y0, r1f, y1, seg, uvLen, vFlip) {
  const pos = [], uv = [], idx = []; let acc = 0, prev = null;
  for (let i = 0; i <= seg; i++) {
    const phi = i / seg * 360, a = phi * Math.PI / 180, R0 = r0f(phi), R1 = r1f(phi);
    const p0 = [R0 * Math.sin(a), y0, -R0 * Math.cos(a)], p1 = [R1 * Math.sin(a), y1, -R1 * Math.cos(a)];
    if (prev) acc += Math.hypot(p0[0] - prev[0], p0[2] - prev[2]); prev = p0;
    pos.push(...p0, ...p1); uv.push(acc / uvLen, 0, acc / uvLen, 1);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
const wallMat = new THREE.MeshBasicMaterial({ map: adTex, side: THREE.DoubleSide });
const wall = new THREE.Mesh(ringGeom(wallRadius, 0, wallRadius, WALL_H * .78, 220, 74), wallMat); scene.add(wall);
const wallTop = new THREE.Mesh(ringGeom(wallRadius, WALL_H * .78, wallRadius, WALL_H, 220, 74), new THREE.MeshLambertMaterial({ color: 0x1d7a45, side: THREE.DoubleSide })); scene.add(wallTop);
const crowdPal = ['#d33', '#36c', '#fff', '#fd3', '#2a6', '#e83', '#c4c', '#6cf', '#222', '#f9a'];
const crowdTex = canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#2a2d3a'; g.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 7) for (let x = 0; x < w; x += 6) {
    const c = Math.random() < .55 ? pick(crowdPal) : pick(['#ddd', '#aab', '#665']);
    g.fillStyle = c; g.beginPath(); g.arc(x + 3 + (y % 2) * 2, y, 2.4, 0, TAU); g.fill();
    g.fillStyle = '#e9c9a0'; g.beginPath(); g.arc(x + 3 + (y % 2) * 2, y - 3.2, 1.6, 0, TAU); g.fill();
  }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, true);
const stand = new THREE.Mesh(ringGeom(p => wallRadius(p), WALL_H, p => wallRadius(p) + 34, WALL_H + 24, 220, 90), new THREE.MeshBasicMaterial({ map: crowdTex, side: THREE.DoubleSide })); scene.add(stand);
const roof = new THREE.Mesh(ringGeom(p => wallRadius(p) + 34, WALL_H + 24, p => wallRadius(p) + 40, WALL_H + 30, 120, 60), new THREE.MeshLambertMaterial({ color: 0x3a3f50, side: THREE.DoubleSide })); scene.add(roof);
const backWall = new THREE.Mesh(ringGeom(p => wallRadius(p) + 40, WALL_H + 30, p => wallRadius(p) + 40, WALL_H - 2, 120, 60), new THREE.MeshLambertMaterial({ color: 0x20242e, side: THREE.DoubleSide })); scene.add(backWall);
// light towers：桁架式燈塔＋多排燈具燈組（深色燈架、一排排獨立燈頭）＋維修平台＋燈光光暈，面向球場；白天燈具熄滅（灰色）、夜間點亮
const LIGHT_TOWERS = [];
const LAMP_MAT = new THREE.MeshBasicMaterial({ color: 0x8d8f96 });                    // 燈頭：白天灰、夜間暖白（updateNight 切換）
const STEEL = new THREE.MeshLambertMaterial({ color: 0x8a8f9c }), FRAME = new THREE.MeshLambertMaterial({ color: 0x2a2e38 });
const LAMP_GEO = new THREE.BoxGeometry(1.25, 1.05, .5), LAMP_COLS = 8, LAMP_ROWS = 5;
const BEAM_MAT = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
for (const phi of [30, 88, 150, 210, 272, 330]) {
  const a = phi * Math.PI / 180, R0 = wallRadius(phi) + 42;
  const g = new THREE.Group(), T = { g, phi }; LIGHT_TOWERS.push(T); g.position.set(R0 * Math.sin(a), 0, -R0 * Math.cos(a));
  // 桁架塔身：四支斜立柱＋每 8 公尺一圈橫撐
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.22, .34, 52, 5), STEEL); leg.position.set(sx * 1.4, 26, sz * 1.4); leg.rotation.z = -sx * .022; leg.rotation.x = sz * .022; g.add(leg); }
  for (let y = 4; y < 52; y += 8) { const w = 2.9 - y * .0045; for (const q of [[0, 0, w * 2, .22, .22], [0, 0, .22, .22, w * 2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(q[2], q[3], q[4]), STEEL); b.position.set(0, y, 0); g.add(b); } }
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 5), FRAME); base.position.y = .6; g.add(base);
  // 燈組：面向球場中心
  const bank = new THREE.Group(); bank.position.y = 58; bank.rotation.y = Math.atan2(-g.position.x, -30 - g.position.z); g.add(bank);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(LAMP_COLS * 1.6 + 1, LAMP_ROWS * 1.4 + 1, .7), FRAME); bank.add(frame);
  const lamps = new THREE.InstancedMesh(LAMP_GEO, LAMP_MAT, LAMP_COLS * LAMP_ROWS), m4 = new THREE.Matrix4(); let n = 0;
  for (let r = 0; r < LAMP_ROWS; r++) for (let c = 0; c < LAMP_COLS; c++) { m4.makeTranslation((c - (LAMP_COLS - 1) / 2) * 1.6, (r - (LAMP_ROWS - 1) / 2) * 1.4, .55); lamps.setMatrixAt(n++, m4); }
  lamps.instanceMatrix.needsUpdate = true; lamps.frustumCulled = false; bank.add(lamps);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(LAMP_COLS * 1.6 + 2.5, .35, 2.4), FRAME); walk.position.set(0, -(LAMP_ROWS * 1.4 + 1) / 2 - .2, -1.1); bank.add(walk);      // 維修平台
  const mast = new THREE.Mesh(new THREE.BoxGeometry(.5, 5, .5), STEEL); mast.position.set(0, -(LAMP_ROWS * 1.4 + 1) / 2 - 2.6, -.3); bank.add(mast);
  // 夜間朝場內打出的淡淡光束（只畫塔邊一小段，避免整場畫面被光柱橫切）
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 15, 52, 16, 1, true), BEAM_MAT); beam.rotation.x = -Math.PI / 2 + .32; beam.position.set(0, -8, 24.7); beam.visible = false; bank.add(beam); T.beam = beam; T.bank = bank;
  scene.add(g);
}

/* ===== 夜間比賽：夜空／星空／月亮／泛光燈／燈塔光暈／場地光池／看台閃光 ===== */
const NIGHT = { t: 0 };
const radTex = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const flood1 = new THREE.DirectionalLight(0xf4f7ff, 0); flood1.position.set(55, 90, 35); scene.add(flood1);
const flood2 = new THREE.DirectionalLight(0xfff2dc, 0); flood2.position.set(-30, 70, -70); scene.add(flood2);
const flood3 = new THREE.DirectionalLight(0xf0f4ff, 0); flood3.position.set(-60, 85, 20); scene.add(flood3);      // 第三盞燈塔泛光：讓夜間場內亮度平均、清楚
const skyDome = (() => { const g = new THREE.SphereGeometry(520, 28, 18), p = g.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const v = 1 - .78 * Math.pow(Math.max(0, p.getY(i) / 520), .55); c.push(v, v, v); } g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); m.renderOrder = -100; m.visible = false; scene.add(m); return m; })();
const stars = [0, 1].map(() => { const pos = [], col = []; for (let i = 0; i < 520; i++) { const a = Math.random() * TAU, e = Math.asin(.06 + Math.random() * .94), r = 480, k = .75 + Math.random() * .25; pos.push(r * Math.cos(e) * Math.sin(a), r * Math.sin(e), -r * Math.cos(e) * Math.cos(a)); col.push(k, k, Math.min(1, k + .1)); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.0, vertexColors: true, transparent: true, fog: false, depthWrite: false })); p.visible = false; scene.add(p); return p; });
const moon = (() => { const t = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 10, 64, 64, 64); r.addColorStop(0, 'rgba(255,248,220,.55)'); r.addColorStop(1, 'rgba(255,248,220,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(64, 64, 20, 0, TAU); g.fill(); g.fillStyle = 'rgba(200,190,160,.35)'; for (const [x, y, q] of [[58, 58, 5], [70, 66, 4], [60, 72, 3]]) { g.beginPath(); g.arc(x, y, q, 0, TAU); g.fill(); } }); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false, depthWrite: false })); s.scale.set(88, 88, 1); s.position.set(-150, 175, -330); s.visible = false; scene.add(s); return s; })();
LIGHT_TOWERS.forEach(t => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radTex, color: 0xffdca0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })); s.scale.set(64, 52, 1); s.position.set(0, 58, 0); s.visible = false; t.bank.add(s); t.halo = s; });
const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), new THREE.MeshBasicMaterial({ map: radTex, color: 0xe8c890, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
lightPool.rotation.x = -Math.PI / 2; lightPool.position.set(0, .05, -32); lightPool.renderOrder = 1; lightPool.visible = false; scene.add(lightPool);
const CL = [0, 1].map(() => { const n = 360, g = new THREE.BufferGeometry(), col = [], meta = [], pal = [[1, .95, .8], [.6, .9, 1], [1, .6, .8], [.7, 1, .6]]; for (let i = 0; i < n; i++) { col.push(...pal[(Math.random() * 4) | 0]); meta.push([Math.random() * 360, Math.random()]); } g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.8, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); p.visible = false; p.frustumCulled = false; scene.add(p); return { p, meta }; });
const RIM = [0].map(() => { const n = 180, g = new THREE.BufferGeometry(), col = []; for (let i = 0; i < n; i++) col.push(1, .96, .82); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); p.visible = false; p.frustumCulled = false; scene.add(p); return { p, n }; });      // 屋簷下緣的一整圈照明
/* 屋簷下緣一整圈可見的燈具（夜間點亮、白天熄滅）：從場內任何角度都看得到照明設備 */
const ROOF_N = 96, ROOFL_MAT = new THREE.MeshBasicMaterial({ color: 0x8d8f96, fog: false });
const ROOFL = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, .9, .9), ROOFL_MAT, ROOF_N); ROOFL.frustumCulled = false; scene.add(ROOFL);
function placeRoofLamps() {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < ROOF_N; i++) { const phi = i / ROOF_N * 360, r = wallRadius(phi) + 34.6, a = phi * Math.PI / 180; p.set(r * Math.sin(a), WALL_H + 23.2, -r * Math.cos(a)); q.setFromAxisAngle(ax, -a); m4.compose(p, q, s); ROOFL.setMatrixAt(i, m4); }
  ROOFL.instanceMatrix.needsUpdate = true;
}
function placeRim() { placeRoofLamps(); for (const o of RIM) { const a = o.p.geometry.attributes.position; for (let i = 0; i < o.n; i++) { const phi = i / o.n * 360, r = wallRadius(phi) + 36, q = phi * Math.PI / 180; a.setXYZ(i, r * Math.sin(q), WALL_H + 25.5, -r * Math.cos(q)); } a.needsUpdate = true; } }
function placeCrowdLights() { placeRim(); for (const o of CL) { const a = o.p.geometry.attributes.position; o.meta.forEach(([phi, t], i) => { const r = wallRadius(phi) + 34 * t - .3, q = phi * Math.PI / 180; a.setXYZ(i, r * Math.sin(q), WALL_H + 24 * t + .3, -r * Math.cos(q)); }); a.needsUpdate = true; } }
placeCrowdLights();
function updateNight(dt) {                 // 夜空、星月、光暈與看台螢光棒／手機燈的閃爍
  const nt = !!G.night, vis = nt && !(G.wx && G.wx.dome), on = G.wxOn && G.wx && !G.wx.dome && !G.wx.off; NIGHT.t += dt; const t = NIGHT.t;
  skyDome.visible = vis; moon.visible = vis; stars.forEach(s => s.visible = vis); lightPool.visible = nt; CL.forEach(o => o.p.visible = nt); LIGHT_TOWERS.forEach(x => { x.halo.visible = nt; x.beam.visible = nt; }); LAMP_MAT.color.setHex(nt ? 0xffe9b8 : 0x8d8f96); ROOFL_MAT.color.setHex(nt ? 0xffe9b8 : 0x8d8f96); RIM.forEach(o => o.p.visible = nt);
  if (!nt) return;
  const cl = on ? cloudK() : 0, hz = on ? hazeK() : 0, clear = (1 - clamp(cl * 1.5, 0, 1)) * (1 - hz * .6);
  stars[0].material.opacity = clear * (.65 + .35 * Math.sin(t * 2.1)); stars[1].material.opacity = clear * (.65 + .35 * Math.sin(t * 1.5 + 2)); moon.material.opacity = clear;
  CL[0].p.material.opacity = .5 + .5 * Math.sin(t * 6.1); CL[1].p.material.opacity = .5 + .5 * Math.sin(t * 4.3 + 2);
  const hs = .38 + .05 * Math.sin(t * 1.7) + (on ? rainK() * .1 : 0); LIGHT_TOWERS.forEach(x => x.halo.material.opacity = Math.min(1, hs)); BEAM_MAT.opacity = .03 + (on ? rainK() * .02 + hz * .02 : 0); RIM.forEach(o => o.p.material.opacity = .5 + .08 * Math.sin(t * 1.3));
}
/* 套用球場：重設外野牆形狀／高度，重建牆面、看台與燈塔位置 */
function applyPark(name) {
  const k = PARKS[name] || PARKS['洲際棒球場'];
  WALL_PTS.length = 0; WALL_PTS.push(...buildWallPts(k.cf, k.gap, k.ln));   // 界內加寬、本壘後方界外收窄 WALL_H = k.h;
  const sw = (m, g) => { m.geometry.dispose(); m.geometry = g; };
  sw(wall, ringGeom(wallRadius, 0, wallRadius, WALL_H * .78, 220, 74));
  sw(wallTop, ringGeom(wallRadius, WALL_H * .78, wallRadius, WALL_H, 220, 74)); wallTop.material.color.set(k.wc);
  sw(stand, ringGeom(p => wallRadius(p), WALL_H, p => wallRadius(p) + 34, WALL_H + 24, 220, 90));
  sw(roof, ringGeom(p => wallRadius(p) + 34, WALL_H + 24, p => wallRadius(p) + 40, WALL_H + 30, 120, 60));
  sw(backWall, ringGeom(p => wallRadius(p) + 40, WALL_H + 30, p => wallRadius(p) + 40, WALL_H - 2, 120, 60));
  for (const t of LIGHT_TOWERS) { const a = t.phi * Math.PI / 180, R0 = wallRadius(t.phi) + 42; t.g.position.set(R0 * Math.sin(a), 0, -R0 * Math.cos(a)); }
  placeCrowdLights();
}
// backstop
const backstop = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: .35, side: THREE.DoubleSide }));
backstop.position.set(0, 4.5, 14); 

