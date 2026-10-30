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
  g.globalAlpha = .10; for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < .5 ? '#2f8a3a' : '#8fe08a'; g.fillRect(Math.random() * w, Math.random() * h, 1, 4 + Math.random() * 3); }   // 草葉細紋
  g.globalAlpha = 1;
}, true);
grassTex.repeat.set(13, 13); grassTex.center.set(.5, .5); grassTex.rotation = Math.PI / 4;
const grass = new THREE.Mesh(new THREE.CircleGeometry(126, 96), new THREE.MeshLambertMaterial({ map: grassTex }));      // 圓形：只鋪到看台底下，不再有方形棋盤草皮露在看台外面
grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0, 0); scene.add(grass);
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
  g.strokeStyle = '#c98b57'; g.lineWidth = 1.5 / SK.S * SK.N; g.lineCap = 'round'; g.beginPath();          // 壘間跑道（紅土帶）
  for (let i = 0; i < 4; i++) { const a = BASES[i], b = BASES[(i + 1) % 4]; g.moveTo(px(a.x), pz(a.z)); g.lineTo(px(b.x), pz(b.z)); } g.stroke();
  g.fillStyle = dirt; for (const b of BASES.slice(1)) { g.beginPath(); g.arc(px(b.x), pz(b.z), 3.4 / SK.S * SK.N, 0, TAU); g.fill(); }
  g.beginPath(); g.arc(px(0), pz(-15), 3.6 / SK.S * SK.N, 0, TAU); g.fill();
  g.fillStyle = '#d8a06a'; g.beginPath(); g.arc(px(0), pz(-15), 2.5 / SK.S * SK.N, 0, TAU); g.fill();
  g.save(); g.globalCompositeOperation = 'source-atop';        // 紅土顆粒（僅畫在已有內容上）
  for (let i = 0; i < 5200; i++) { g.globalAlpha = .10 + Math.random() * .10; g.fillStyle = Math.random() < .5 ? '#a8693a' : '#e3b585'; const r = (.5 + Math.random() * 1.4); g.fillRect(Math.random() * SK.N, Math.random() * SK.N, r, r); }
  g.restore(); g.globalAlpha = 1;
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
/* 贊助商廣告牌（皆為虛構品牌）：[名稱, 字色, 底色上, 底色下, 英文標語, 圖樣]；牆面與看台橫幅共用 */
const AD_TEXT = [
  ['鯨魚小兒科', '#ffffff', '#27914a', '#145a2a', 'WHALE KIDS', 'wave'], ['弱力鮮乳', '#ffffff', '#3a7be8', '#1b4aa8', 'POWER MILK', 'drop'],
  ['企鵝電機', '#ffffee', '#2b2b2f', '#0e0e10', 'PENGUIN ELEC', 'diamond'], ['居家中心', '#ffffff', '#e8483a', '#a8231a', 'HOME CENTER', 'tri'],
  ['章魚燒本舖', '#2a1a00', '#ffd92a', '#f0a500', 'TAKOYAKI', 'circle'], ['拉麵一番', '#ffffff', '#cf2222', '#8c0f0f', 'RAMEN ICHIBAN', 'ring'],
  ['AI 保險', '#ffffff', '#6d38c4', '#3e1a80', 'AI INSURANCE', 'diamond'], ['楓葉銀行', '#ffffff', '#b81c3a', '#760f24', 'MAPLE BANK', 'star'],
  ['貓咪運輸', '#22202a', '#ffffff', '#d9dde4', 'NEKO LOGISTICS', 'tri'], ['鯱魚汽車', '#ffffff', '#1a4cb0', '#0a2766', 'ORCA MOTORS', 'wave'],
  ['雷霆運動', '#ffffff', '#ff6a00', '#b03e00', 'THUNDER SPORTS', 'bolt'], ['極速電信', '#06202c', '#27d3e8', '#0e93ab', 'SPEEDNET', 'bolt'],
  ['晨光咖啡', '#fff2dc', '#6b3f22', '#38200f', 'MORNING BREW', 'circle'], ['星河航空', '#ffffff', '#0e2a5e', '#06142e', 'STARLINE AIR', 'star'],
  ['御膳茶飲', '#ffffff', '#2f8a5e', '#145238', 'TEA HOUSE', 'drop'], ['巨匠建設', '#2a1a00', '#f2c230', '#c89400', 'MASTER BUILD', 'diamond'],
  ['鮮果園', '#ffffff', '#e8366a', '#a01742', 'FRESH FARM', 'drop'], ['安心藥局', '#ffffff', '#1a9a8e', '#0a5c54', 'CARE PHARMACY', 'ring']
];
function adLogo(g, k, cx, cy, r) {
  g.beginPath();
  if (k === 'circle') g.arc(cx, cy, r, 0, 6.2832);
  else if (k === 'diamond') { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); }
  else if (k === 'tri') { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy + r * .8); g.lineTo(cx - r, cy + r * .8); g.closePath(); }
  else if (k === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } g.closePath(); }
  else if (k === 'bolt') { g.moveTo(cx + r * .2, cy - r); g.lineTo(cx - r * .6, cy + r * .1); g.lineTo(cx - r * .05, cy + r * .1); g.lineTo(cx - r * .2, cy + r); g.lineTo(cx + r * .6, cy - r * .15); g.lineTo(cx + r * .05, cy - r * .15); g.closePath(); }
  else if (k === 'drop') { g.moveTo(cx, cy - r); g.quadraticCurveTo(cx + r * 1.1, cy + r * .25, cx, cy + r); g.quadraticCurveTo(cx - r * 1.1, cy + r * .25, cx, cy - r); }
  else if (k === 'wave') { g.arc(cx, cy + r * .2, r, Math.PI, 0); g.lineTo(cx + r, cy + r * .7); g.lineTo(cx - r, cy + r * .7); g.closePath(); }
  else { g.arc(cx, cy, r, 0, 6.2832); g.arc(cx, cy, r * .52, 0, 6.2832, true); }
  g.fill('evenodd');
}
const AD_FONT = "'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif";
function drawAdCell(g, x, y, w, h, ad) {      // 牆面用：直式看板（圖樣在上、品名在中、英文標語在下）
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, ad[2]); gr.addColorStop(1, ad[3]); g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.24)'; g.fillRect(x, y, w, h * .06); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y + h * .94, w, h * .06);
  g.fillStyle = ad[1]; g.globalAlpha = .9; adLogo(g, ad[5], x + w / 2, y + h * .24, h * .12); g.globalAlpha = 1;
  g.font = '900 ' + (h * .27) + 'px ' + AD_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ad[0], x + w / 2, y + h * .56, w - 18);
  g.globalAlpha = .85; g.font = '700 ' + (h * .085) + 'px Orbitron,' + AD_FONT; g.fillText(ad[4], x + w / 2, y + h * .84, w - 18); g.globalAlpha = 1;
}
function drawAds(g, w, h) {
  const n = AD_TEXT.length, bw = w / n;
  for (let i = 0; i < n; i++) { drawAdCell(g, i * bw + 2, 4, bw - 4, h - 8, AD_TEXT[i]); }
}
const adTex = canvasTex(4096, 192, drawAds, true);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const c = adTex.image, k = c.getContext('2d'); k.clearRect(0, 0, c.width, c.height); drawAds(k, c.width, c.height); adTex.needsUpdate = true; });
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
const trackMat = new THREE.MeshLambertMaterial({ color: 0xb07a4c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const track = new THREE.Mesh(ringGeom(p => wallRadius(p) - 5, .03, wallRadius, .03, 220, 40), trackMat); scene.add(track);      // 警戒區（外野牆前紅土帶）
const wallPad = new THREE.Mesh(ringGeom(p => wallRadius(p) - .08, 0, p => wallRadius(p) - .08, 1.0, 220, 74), new THREE.MeshLambertMaterial({ color: 0x14301c, side: THREE.DoubleSide })); scene.add(wallPad);   // 牆底護墊
const POLES = [-45, 45].map(phi => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffd21a })); scene.add(m); return { m, phi }; });
function placePoles() { for (const o of POLES) { const a = o.phi * Math.PI / 180, R = wallRadius(o.phi), h = WALL_H + 7; o.m.scale.y = h; o.m.position.set(R * Math.sin(a), h / 2, -R * Math.cos(a)); } }
placePoles();
const crowdPal = ['#d33', '#36c', '#fff', '#fd3', '#2a6', '#e83', '#c4c', '#6cf', '#222', '#f9a'];
const crowdTex = canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#2a2d3a'; g.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 7) for (let x = 0; x < w; x += 6) {
    const c = Math.random() < .55 ? pick(crowdPal) : pick(['#ddd', '#aab', '#665']);
    g.fillStyle = c; g.beginPath(); g.arc(x + 3 + (y % 2) * 2, y, 2.4, 0, TAU); g.fill();
    g.fillStyle = '#e9c9a0'; g.beginPath(); g.arc(x + 3 + (y % 2) * 2, y - 3.2, 1.6, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(10,12,20,.45)'; for (let y = 0; y < h; y += 28) g.fillRect(0, y + 5, w, 2);   // 看台階梯
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
/* ===== 白天天空：漸層藍天（天頂深、地平線淡）＋大氣散射的太陽（日面＋暖色光暈）＋蓬鬆白雲（會緩緩飄動，隨天氣增減、變灰、變暗）=====
   天空是一個跟著鏡頭走的穹頂（永遠在無限遠），雲是貼在穹頂上的立體感貼圖，被看台遮住的部分會自然被擋住。夜間／室內球場自動隱藏；快轉時不更新。
   想調整：太陽位置改 SUN 三個數字；雲的數量改下面迴圈的 24；雲飄速度改 update 裡的 .0028／.004。 */
const DAYSKY = (() => {
  const SUN = new THREE.Vector3(-.5, .4, -.77).normalize();      // 太陽方向：偏左外野上方（仰角約 24°）；球場正面鏡頭一抬頭就看得到。比賽光源 sun 的方向不變（維持球員正面受光）
  const R = 440, uni = { uZen: { value: new THREE.Color(0x3b7be0) }, uHor: { value: new THREE.Color(0xa9d0f5) }, uSunDir: { value: SUN.clone() }, uSunCol: { value: new THREE.Color(1, .93, .78) }, uSunI: { value: 1 }, uHaze: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI; uniform float uHaze; varying vec3 vDir;',
      'float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){',
      '  vec3 d = normalize(vDir); float h = d.y, hp = clamp(h, 0.0, 1.0);',
      '  float cs = max(dot(d, normalize(uSunDir)), 0.0);',
      '  vec3 col = mix(uHor, uZen, pow(hp, 0.45));',                                                        // 瑞利散射式漸層：天頂深藍→地平線淡
      '  col *= 1.0 - 0.10 * (1.0 - cs) * smoothstep(0.1, 0.9, hp) * uSunI;',                               // 背對太陽的天空更深、更飽和（有方向性的光感）
      '  col = mix(col, uHor * 1.06 + vec3(0.04), exp(-max(h, 0.0) * 6.0) * 0.4);',                        // 地平線泛白
      '  float low = exp(-max(h, 0.0) * 3.5);',
      '  col += uSunCol * pow(cs, 3.0) * 0.14 * low * uSunI * (1.0 + uHaze * 1.2);',                        // 米氏前向散射：太陽那一側的低空偏暖
      '  col = mix(col, uHor * 0.9, smoothstep(0.0, -0.08, h));',
      '  float wide = 1.0 + uHaze * 1.6;',
      '  col += uSunCol * (pow(cs, 6.0) * 0.16 * wide + pow(cs, 40.0) * 0.34 + pow(cs, 400.0) * 0.7 + pow(cs, 2500.0) * 1.2) * uSunI;',   // 多層光暈：大範圍暖光→近日光暈→日芯
      '  float disc = smoothstep(0.9988, 0.9994, cs);',
      '  col = mix(col, vec3(1.0, 0.98, 0.9) * 2.0, disc * uSunI);',
      '  col += (hsh(gl_FragCoord.xy) - 0.5) / 160.0;',                                                    // 抖色：避免漸層色帶
      '  gl_FragColor = vec4(col, 1.0);',
      '}'].join('\n') }));
  dome.renderOrder = -101; dome.frustumCulled = false; scene.add(dome);
  let sd = 20260; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;      // 固定亂數：每次開啟雲的樣子一致，也不會影響比賽用的亂數
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const cumulus = () => canvasTex(512, 256, (g, w, h) => {      // 積雲：許多圓團堆成、中間高兩側低、雲底平坦偏灰藍
    const base = h * .68;
    for (let i = 0; i < 44; i++) {
      const u = rnd(), hump = Math.sin(u * Math.PI), x = w * (.18 + .64 * u), r = h * (.09 + .13 * rnd()) * (.5 + .7 * hump), y = base - r * .55 - hump * h * .2 * rnd() - rnd() * r * .5;
      const gr = g.createRadialGradient(x - r * .25, y - r * .3, r * .08, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(247,250,255,.93)'); gr.addColorStop(.85, 'rgba(228,236,248,.5)'); gr.addColorStop(1, 'rgba(228,236,248,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createLinearGradient(0, h * .3, 0, base + 6); sh.addColorStop(0, 'rgba(150,170,200,0)'); sh.addColorStop(.55, 'rgba(150,170,200,.18)'); sh.addColorStop(1, 'rgba(110,128,160,.55)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createLinearGradient(0, base - 4, 0, base + 14); cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = cut; g.fillRect(0, base - 4, w, h);
    g.globalCompositeOperation = 'source-over';
  });
  const wispTex = canvasTex(512, 128, (g, w, h) => {      // 高空卷雲：細長柔軟的雲絲
    for (let i = 0; i < 26; i++) {
      const x = w * (.12 + .76 * rnd()), y = h * (.35 + .3 * rnd()), rx = w * (.1 + .18 * rnd()), ry = h * (.025 + .04 * rnd());
      g.save(); g.translate(x, y); g.rotate((rnd() - .5) * .25); g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
    }
  });
  const stratTex = canvasTex(512, 256, (g, w, h) => {      // 層雲：寬而扁的灰色雲層，陰天時鋪滿天空
    for (let i = 0; i < 60; i++) {
      const x = w * (.1 + .8 * rnd()), y = h * (.3 + .4 * rnd()), rx = w * (.1 + .16 * rnd()), ry = rx * (.28 + .2 * rnd());
      g.save(); g.translate(x, y); g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, 'rgba(235,240,247,.55)'); gr.addColorStop(.6, 'rgba(215,223,234,.28)'); gr.addColorStop(1, 'rgba(215,223,234,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
    }
    const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(70,82,100,.35)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(0, 0, w, h);
  });
  const texC = [cumulus(), cumulus(), cumulus(), cumulus()], grp = new THREE.Group(), clouds = [];
  const N_CU = 30, N_WISP = 6, N_ST = 12;      // 積雲／卷雲／層雲：陰天時雲更多、更厚
  for (let i = 0; i < N_CU + N_WISP + N_ST; i++) {
    const wisp = i >= N_CU && i < N_CU + N_WISP, strat = i >= N_CU + N_WISP;
    const el = (wisp ? 38 + rnd() * 30 : strat ? 5 + rnd() * 50 : 6 + Math.pow(rnd(), 1.3) * 44) * Math.PI / 180;
    const w = wisp ? 360 + rnd() * 160 : strat ? 560 + rnd() * 320 : (230 + rnd() * 170) * (1 - el * .5), h = wisp ? w * .22 : strat ? w * .34 : w * .5 * (el < .25 ? .75 : 1);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: wisp ? wispTex : strat ? stratTex : texC[i % 4], transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    sp.scale.set(w, h, 1); sp.renderOrder = -100; sp.frustumCulled = false; grp.add(sp);
    clouds.push({ sp, wisp, strat, el, az: rnd() * TAU, thr: wisp ? rnd() * .5 : strat ? .55 + rnd() * .4 : rnd() * .95, k: .6 + rnd() * .8 });
  }
  // 太陽光芒：貼在天穹上的放射光束＋大範圍暖色光暈（雲隙光）；被看台／雲遮住的部分會自然被擋
  const rayTex = canvasTex(256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2);
    for (let i = 0; i < 26; i++) { const a = rnd() * TAU, L = w * (.28 + .22 * rnd()), wd = .012 + .03 * rnd(); const gr = g.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); gr.addColorStop(0, 'rgba(255,240,200,.55)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - wd) * L, Math.sin(a - wd) * L); g.lineTo(Math.cos(a + wd) * L, Math.sin(a + wd) * L); g.closePath(); g.fill(); }
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, w * .5); rg.addColorStop(0, 'rgba(255,246,222,.9)'); rg.addColorStop(.2, 'rgba(255,232,180,.35)'); rg.addColorStop(1, 'rgba(255,225,170,0)'); g.fillStyle = rg; g.fillRect(-w / 2, -h / 2, w, h);
  });
  const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: rayTex, color: 0xfff0cc, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  rays.scale.set(380, 380, 1); rays.renderOrder = -99; rays.frustumCulled = false; rays.position.copy(SUN).multiplyScalar(R * .985); grp.add(rays);
  scene.add(grp);
  const CZ = [0x2f78e0, 0x76818f, 0x262d37].map(c => new THREE.Color(c)), CH = [0x9fcdf7, 0xa2aab5, 0x363e49].map(c => new THREE.Color(c)), _a = new THREE.Color(), _b = new THREE.Color();
  function update(dt) {
    const w = G.wx, vis = !G.night && !(w && w.dome); dome.visible = vis; grp.visible = vis; if (!vis) return;
    const on = G.wxOn !== false && w && !w.off, cl = on ? cloudK() : .1, rn = on ? rainK() : 0, hz = on ? hazeK() : 0;
    dome.position.copy(camera.position); grp.position.copy(camera.position);
    const gray = clamp((cl - .3) / .6, 0, 1), dk = clamp(rn * 1.5, 0, 1);      // 雲越多天越灰；下雨再變暗。好天氣（雲量低）維持飽和的藍
    uni.uZen.value.copy(CZ[0]).lerp(CZ[1], gray).lerp(CZ[2], dk); uni.uHor.value.copy(CH[0]).lerp(CH[1], gray).lerp(CH[2], dk);
    if (hz > .01) { uni.uZen.value.lerp(_b.set(0xb9ad94), hz * .55); uni.uHor.value.lerp(_b.set(0xd3c4a2), hz * .7); }
    const sunI = (1 - clamp(cl * 1.5, 0, 1)) * (1 - clamp(rn * 3, 0, 1)) * (1 - hz * .45); uni.uSunI.value = sunI; uni.uHaze.value = hz; rays.material.opacity = sunI * (.5 + .5 * Math.sin(NIGHT.t * .35)) * .12 + sunI * .1 * clamp(1 - Math.abs(cl - .35) * 2.2, 0, 1); rays.material.rotation = NIGHT.t * .004;      // 有些雲時（雲隙光）光芒最明顯，萬里無雲只剩淡淡光暈；緩慢轉動、微微呼吸 uni.uSunCol.value.setRGB(1, .93 - hz * .12, .78 - hz * .22);
    const step = window.__ff ? 0 : Math.min(dt || 0, .1), cover = clamp(.4 + cl * .95, 0, 1.4), ws = on && w ? clamp((w.spd || 0) / 6, 0, 1.5) : .2;
    _a.setRGB(1, 1, 1).lerp(_b.set(0x959fad), gray).multiplyScalar(1 - dk * .68);      // 陰天雲偏灰、下雨雲底更暗
    for (const c of clouds) {
      c.az += step * (.0028 + .004 * ws) * c.k;
      const ce = Math.cos(c.el), x = ce * Math.sin(c.az), y = Math.sin(c.el), z = -ce * Math.cos(c.az), dd = x * SUN.x + y * SUN.y + z * SUN.z;
      c.sp.position.set(R * x, R * y, R * z);
      const op = (c.wisp ? .55 * (1 - gray) : c.strat ? .85 * clamp((cl - .35) / .5, 0, 1) : .96) * sstep(c.thr, c.thr + .2, cover) * (1 - .65 * sstep(.985, .9995, dd));      // 雲飄到太陽前面時變薄，太陽不會被整團擋住
      c.sp.visible = op > .01; if (!c.sp.visible) continue;
      c.sp.material.opacity = op; const warm = Math.pow(Math.max(0, dd), 6) * sunI * .5;      // 太陽附近的雲邊緣偏暖
      c.sp.material.color.copy(_a); c.sp.material.color.g *= 1 - warm * .05; c.sp.material.color.b *= 1 - warm * .22;
    }
  }
  return { update, SUN, dome, clouds, rays };
})();
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
function updateNight(dt) {
  try { updateOuter(); } catch (e) { }                 // 夜空、星月、光暈與看台螢光棒／手機燈的閃爍（白天的藍天白雲太陽也在這裡更新）
  try { DAYSKY.update(dt); } catch (e) { }
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
  WALL_PTS.length = 0; WALL_PTS.push(...buildWallPts(k.cf, k.gap, k.ln));   // 界內加寬、本壘後方界外收窄
  WALL_H = k.h;
  const sw = (m, g) => { m.geometry.dispose(); m.geometry = g; };
  sw(wall, ringGeom(wallRadius, 0, wallRadius, WALL_H * .78, 220, 74));
  sw(track, ringGeom(p => wallRadius(p) - 5, .03, wallRadius, .03, 220, 40));
  sw(wallPad, ringGeom(p => wallRadius(p) - .08, 0, p => wallRadius(p) - .08, 1.0, 220, 74)); placePoles();
  sw(wallTop, ringGeom(wallRadius, WALL_H * .78, wallRadius, WALL_H, 220, 74)); wallTop.material.color.set(k.wc);
  sw(stand, ringGeom(p => wallRadius(p), WALL_H, p => wallRadius(p) + 34, WALL_H + 24, 220, 90));
  sw(roof, ringGeom(p => wallRadius(p) + 34, WALL_H + 24, p => wallRadius(p) + 40, WALL_H + 30, 120, 60));
  sw(backWall, ringGeom(p => wallRadius(p) + 40, WALL_H + 30, p => wallRadius(p) + 40, WALL_H - 2, 120, 60));
  for (const t of LIGHT_TOWERS) { const a = t.phi * Math.PI / 180, R0 = wallRadius(t.phi) + 42; t.g.position.set(R0 * Math.sin(a), 0, -R0 * Math.cos(a)); }
  placeCrowdLights();
  try { buildOuter(name); } catch (e) { }
}
/* ===== 第六十四版：場外環境（球場外牆、外圍廣場、行道樹、遠景天際線、地平霧帶）；每個球場配色與遠景各不相同 =====
   純外觀：只加新物件，不改球場／球員／鏡頭；日夜、天氣、圓頂球場（隱藏遠景）都會跟著切換。 */
const ENV_STYLE = {
  '洲際棒球場': { shell: '#cdc6b4', city: .5, hill: 55, tree: .9, seed: 11 },
  '亞太主球場': { shell: '#d3d8de', city: .8, hill: 34, tree: .7, seed: 23 },
  '桃園棒球場': { shell: '#b7826e', city: .65, hill: 42, tree: .8, seed: 37 },
  '新莊棒球場': { shell: '#c4c9d0', city: .95, hill: 26, tree: .5, seed: 41 },
  '天母棒球場': { shell: '#c9bfae', city: .7, hill: 72, tree: 1, seed: 53 },
  '澄清湖棒球場': { shell: '#d8d2c2', city: .35, hill: 46, tree: 1.2, seed: 67 },
  '台北大巨蛋': { shell: '#dcdfe3', city: 1, hill: 22, tree: .4, seed: 71 },
  '嘉義市立棒球場': { shell: '#c8b79f', city: .45, hill: 62, tree: 1, seed: 83 },
  '斗六棒球場': { shell: '#c9c2ae', city: .3, hill: 50, tree: 1.2, seed: 97 },
  '花蓮縣立棒球場': { shell: '#cbd3d6', city: .2, hill: 96, tree: 1, seed: 101 },
  '台東縣立棒球場': { shell: '#d6d0bf', city: .22, hill: 86, tree: 1.1, seed: 113 }
};
const ENV = { shTexD: null, shTexN: null, shNt: null, lamps: null, lampPools: null, lampBulbs: null, sky: null, haze: null, shell: null, plaza: null, ground: null, trees: null, texD: null, texN: null, nt: null, name: '' };
function envRng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function envPano(st, night) {
  const tx = canvasTex(2048, 256, (g, w, h) => {
    const r = envRng(st.seed * 7 + 5), mx = 2640 / w, my = 100 / h, ph = [0, 1, 2, 3, 4].map(() => r() * TAU), lite = night ? '#26325a' : '#d3e3f3';
    const hills = (amp, col, k0) => {
      const gr = g.createLinearGradient(0, h - amp / my, 0, h); gr.addColorStop(0, col); gr.addColorStop(1, lite); g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) { let v = 0; [2, 3, 5, 8, 13].forEach((k, i) => v += Math.sin(x / w * TAU * (k + k0) + ph[i]) / (1 + i * .9)); v = clamp((v / 2.4 + 1) / 2, 0, 1); g.lineTo(x, h - amp * (.2 + .8 * v) / my); }
      g.lineTo(w, h); g.closePath(); g.fill();
    };
    hills(st.hill * 1.25, night ? '#1f2a4a' : '#b4c8de', 2);
    hills(st.hill, night ? '#1b2542' : '#8ea9c9', 0);
    hills(st.hill * .62, night ? '#141c31' : '#6f9a7e', 1);
    const city = (n, hs, cols, wins, spire) => {
      for (let i = 0; i < n; i++) {
        const x = r() * w, bw = (10 + r() * 30) / mx, bh = Math.min(85, 10 + r() * r() * 70 * (.5 + st.city)) * hs / my;
        for (const ox of [0, -w]) {
          const X = x + ox; if (X + bw < 0 || X > w) continue;
          g.fillStyle = cols[i % cols.length]; g.fillRect(X, h - bh, bw, bh);
          g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(X, h - bh, 2, bh);
          if (wins) for (let yy = h - bh + 3; yy < h - 14; yy += 5) for (let xx = X + 2; xx < X + bw - 2; xx += 4) if (r() < (night ? .35 : .16)) { g.fillStyle = night ? 'rgba(255,214,130,.9)' : 'rgba(255,255,255,.4)'; g.fillRect(xx, yy, 2, 2); }
          if (spire && bh * my > 50) { g.fillStyle = night ? '#0e1322' : '#8f98a8'; g.fillRect(X + bw / 2, h - bh - 10, 1, 10); if (night) { g.fillStyle = '#ff3b30'; g.fillRect(X + bw / 2 - 1, h - bh - 12, 3, 3); } }
        }
      }
    };
    city(Math.round(st.city * 70), .55, night ? ['#10172b', '#0d1325'] : ['#c6cedb', '#bcc5d3'], false, false);
    city(Math.round(st.city * 90), 1, night ? ['#0e1322'] : ['#b4bccb', '#a3adbf', '#c3c9d4'], true, true);
    g.fillStyle = night ? '#0b140f' : '#4f6f4b';
    for (let x = 0; x < w; x += 5) { const rr = (4 + r() * 6) / mx; g.beginPath(); g.ellipse(x, h - 2, rr, (5 + r() * 5) / my, 0, 0, TAU); g.fill(); }
  }, true);
  tx.wrapT = THREE.ClampToEdgeWrapping; return tx;
}
function envGroundTex(st) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = envRng(st.seed * 13 + 1), gray = clamp(st.city, 0, 1);
    g.fillStyle = gray > .6 ? '#6c7566' : '#5b8548'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.globalAlpha = .35; g.fillStyle = ['#4f7a40', '#6a944f', '#76935a', '#8a8f6a', '#5d6b52'][i % 5]; g.fillRect(r() * w, r() * h, 20 + r() * 90, 14 + r() * 60); }
    g.globalAlpha = .1; for (let i = 0; i < 1800; i++) { g.fillStyle = r() < .5 ? '#fff' : '#000'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.globalAlpha = 1;
  }, true);
}
function envPlazaTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#9a9a96'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let x = 16; x < w; x += 64) g.fillRect(x, 150, 3, 86);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 140, w, 2);
    g.globalAlpha = .08; for (let i = 0; i < 900; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.globalAlpha = 1;
  }, true);
}
function envShellTex(st, wc, night) {
  return canvasTex(1024, 256, (g, w, h) => {
    const r = envRng(st.seed * 29 + (night ? 7 : 3)), hex = '#' + ('000000' + (wc >>> 0).toString(16)).slice(-6);
    g.fillStyle = night ? '#4a4a52' : st.shell; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.09)'; g.lineWidth = 1; for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.30)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.24)'; g.fillRect(0, h - 22, w, 22); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, h - 23, w, 2);
    for (let b = 0; b < 4; b++) {
      const x0 = b * 256;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0, 0, 8, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x0 + 8, 0, 3, h);
      for (let y = 44; y < h - 112; y += 34) for (let c = 0; c < 3; c++) {
        const wx = x0 + 24 + c * 70, lit = night && r() < .6;
        g.fillStyle = '#1c2230'; g.fillRect(wx - 1, y - 1, 66, 18);
        g.fillStyle = lit ? (r() < .5 ? '#ffd98a' : '#ffe9b8') : (night ? '#111623' : '#33425c'); g.fillRect(wx, y, 64, 16);
        if (!night) { g.fillStyle = 'rgba(200,225,255,.28)'; g.beginPath(); g.moveTo(wx, y + 16); g.lineTo(wx + 22, y); g.lineTo(wx + 36, y); g.lineTo(wx + 14, y + 16); g.fill(); }
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(wx, y + 16, 64, 2);
      }
    }
    for (const b of [1, 3]) {      // 入口拱門與雨遮
      const x0 = b * 256 + 28;
      for (let d = 0; d < 3; d++) { const dx = x0 + d * 66; g.fillStyle = night ? '#ffcf7a' : '#1b2230'; g.beginPath(); g.moveTo(dx, h - 22); g.lineTo(dx, h - 66); g.quadraticCurveTo(dx + 28, h - 88, dx + 56, h - 66); g.lineTo(dx + 56, h - 22); g.fill(); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(dx + 27, h - 66, 2, 44); }
      g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(x0 - 8, h - 100, 204, 7); g.fillStyle = hex; g.fillRect(x0 - 8, h - 107, 204, 7);
    }
    g.fillStyle = hex; g.fillRect(0, 8, w, 14); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 24, w, 2); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, w, 6);
    g.globalAlpha = .07; for (let i = 0; i < 1400; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect(r() * w, r() * h, 2, 2); } g.globalAlpha = 1;
  }, true);
}
function buildOuter(name) {
  const st = ENV_STYLE[name] || ENV_STYLE['洲際棒球場'], k = PARKS[name] || PARKS['洲際棒球場'];
  const kill = o => { if (!o) return; scene.remove(o); o.traverse && o.traverse(c => { c.geometry && c.geometry.dispose(); if (c.material) { c.material.map && c.material.map.dispose(); c.material.dispose(); } }); };
  [ENV.shell, ENV.plaza, ENV.ground, ENV.trees, ENV.lamps].forEach(kill); [ENV.texD, ENV.texN, ENV.shTexD, ENV.shTexN].forEach(t => t && t.dispose());
  const flat = (g, y) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: null, side: THREE.DoubleSide })); m.position.y = y; return m; };
  ENV.ground = flat(new THREE.RingGeometry(118, 690, 96, 1), -.12); ENV.ground.rotation.x = -Math.PI / 2; ENV.ground.material.map = envGroundTex(st); ENV.ground.material.map.repeat.set(26, 26); scene.add(ENV.ground);
  ENV.plaza = flat(ringGeom(p => wallRadius(p) + 41, .04, p => wallRadius(p) + 74, .04, 120, 33), 0); ENV.plaza.material.map = envPlazaTex(); scene.add(ENV.plaza);
  ENV.shell = flat(ringGeom(p => wallRadius(p) + 40.3, 0, p => wallRadius(p) + 40.3, WALL_H + 30, 120, 40), 0); ENV.shTexD = envShellTex(st, k.wc, false); ENV.shTexN = envShellTex(st, k.wc, true); ENV.shell.material.map = ENV.shTexD; ENV.shell.material.side = THREE.FrontSide; scene.add(ENV.shell);      // 外牆只畫朝外的那一面：場內看不到
  const r = envRng(st.seed), NT = Math.round(70 * st.tree), NC = Math.round((st.hill > 60 ? 34 : 14) * st.tree), M4 = new THREE.Matrix4(), C = new THREE.Color();
  const groves = Array.from({ length: 9 }, () => { const phi = r() * 360, a = phi * Math.PI / 180, R = wallRadius(phi) + 82 + r() * 90; return [R * Math.sin(a), -R * Math.cos(a)]; });
  const tr = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }), NT), pn = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), NC);
  const put = (im, i, sMin, sVar, yk, hue) => { const gv = groves[Math.floor(r() * groves.length)], s0 = sMin + r() * sVar; M4.makeScale(s0, s0 * yk, s0); M4.setPosition(gv[0] + (r() - .5) * 34, s0 * (yk > 1.5 ? 1.3 : 1.9), gv[1] + (r() - .5) * 34); im.setMatrixAt(i, M4); im.setColorAt(i, C.setHSL(hue + r() * .07, .36 + r() * .15, .17 + r() * .1)); };
  for (let i = 0; i < NT; i++) put(tr, i, 2.4, 2.4, 1.25, .26);
  for (let i = 0; i < NC; i++) put(pn, i, 1.8, 1.6, 2.2, .36);
  tr.frustumCulled = pn.frustumCulled = false; ENV.trees = new THREE.Group(); ENV.trees.add(tr, pn); ENV.trees.geometry = null; scene.add(ENV.trees);
  const NL = 40, lamp = new THREE.Group(), poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .18, 6.4, 5), new THREE.MeshLambertMaterial({ color: 0x4a4f5a }), NL),
    bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.55, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), NL), pools = new THREE.InstancedMesh(new THREE.CircleGeometry(8, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }), NL);
  for (let i = 0; i < NL; i++) { const phi = i * 360 / NL, a = phi * Math.PI / 180, R = wallRadius(phi) + 58, x = R * Math.sin(a), z = -R * Math.cos(a); M4.makeTranslation(x, 3.2, z); poles.setMatrixAt(i, M4); M4.makeTranslation(x, 6.7, z); bulbs.setMatrixAt(i, M4); M4.makeTranslation(x, .07, z); pools.setMatrixAt(i, M4); }
  poles.frustumCulled = bulbs.frustumCulled = pools.frustumCulled = false; lamp.add(poles, bulbs); ENV.lampPools = pools; lamp.add(pools); ENV.lamps = lamp; ENV.lampBulbs = bulbs; scene.add(lamp);
  ENV.texD = envPano(st, false); ENV.texN = envPano(st, true);
  if (!ENV.sky) { ENV.sky = new THREE.Mesh(new THREE.CylinderGeometry(420, 420, 100, 96, 1, true), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })); ENV.sky.position.y = 48; ENV.sky.renderOrder = 1; scene.add(ENV.sky);
    const hc = document.createElement('canvas'); hc.width = 4; hc.height = 256; const hg = hc.getContext('2d'), gr = hg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.6, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,.85)'); hg.fillStyle = gr; hg.fillRect(0, 0, 4, 256);
    ENV.haze = new THREE.Mesh(new THREE.CylinderGeometry(436, 436, 40, 64, 1, true), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })); ENV.haze.position.y = 16; ENV.haze.renderOrder = 2; scene.add(ENV.haze); }
  ENV.sky.material.map = ENV.texD; ENV.sky.material.needsUpdate = true; ENV.nt = false; ENV.shNt = null; ENV.name = name;      // 先套白天遠景；之後 updateOuter 依日夜切換
  try { updateOuter(); } catch (e) { }
}
function updateOuter() {
  try {      // 天空（白天天空球、雲、夜空球、星月）跟著相機走：避免相機離球場很遠時，天空球被遠裁切面切掉而露出多邊形底色
    const so = [DAYSKY.dome, DAYSKY.rays && DAYSKY.rays.parent, skyDome, moon, ...stars];
    if (!ENV.skyBase) ENV.skyBase = so.map(o => o ? o.position.clone() : null);
    so.forEach((o, i) => { if (o && ENV.skyBase[i]) o.position.copy(ENV.skyBase[i]).add(camera.position); });
  } catch (e) { }
  if (!ENV.sky) return;
  const GG = (typeof G !== 'undefined') ? G : {}, dome = !!(GG.wx && GG.wx.dome), nt = !!GG.night;
  ENV.sky.visible = ENV.haze.visible = ENV.trees.visible = !dome;
  if (ENV.nt !== nt) { ENV.nt = nt; ENV.sky.material.map = nt ? ENV.texN : ENV.texD; ENV.sky.material.needsUpdate = true; }
  const dk = clamp((.92 - hemi.intensity) / .5, 0, .8), s = 1 - dk * .5;
  if (ENV.shNt !== nt) { ENV.shNt = nt; ENV.shell.material.map = nt ? ENV.shTexN : ENV.shTexD; ENV.shell.material.needsUpdate = true; }
  if (nt) { ENV.ground.material.color.setRGB(.2, .27, .42); ENV.plaza.material.color.setRGB(.4, .43, .55); ENV.shell.material.color.setScalar(.8); } else { ENV.ground.material.color.setScalar(s); ENV.plaza.material.color.setScalar(s); ENV.shell.material.color.setScalar(s); }
  ENV.lampPools.visible = nt; ENV.lampBulbs.material.color.setHex(nt ? 0xffe2a0 : 0x9a9ea8); ENV.lamps.visible = !dome;
  ENV.sky.material.color.setScalar(nt ? 1 : 1 - dk * .35); ENV.haze.material.color.copy(scene.fog.color);
  ENV.haze.material.opacity = nt ? .7 : .8;
}
try { buildOuter('洲際棒球場'); } catch (e) { }
// backstop
const backstop = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: .35, side: THREE.DoubleSide }));
backstop.position.set(0, 4.5, 14); 

