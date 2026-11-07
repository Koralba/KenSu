/* ===== 13t3-su-doll.js ｜ 「小使」絨毛娃娃專屬外觀：方圓拉長的頭型、刺繡風五官（半睜黑眼／弧形眉／U 形鼻線＋單邊鼻涕／D 形嘴／交叉網格腮紅）、
   法被外套造型（阿使小老弟：藏青祭典圖案外套＋藍色內衫）、黃色細長手腳＋黑鞋 =====
   只改「外觀」：不動比賽邏輯、能力值、判定、亂數；只對生涯角色（vis.hx===1，且 vis.doll>0 或 vis.outfit===2）生效，電腦球員／教練／裁判完全不受影響。
   角色欄位（13c 的 sanitize 會補預設）：doll 0～2（0 一般、1 小使臉＝頭型＋刺繡五官、2 小使臉＋娃娃身形：細長手腳、小身體）、outfit 2（法被外套）、legCol（腿色，空白＝不改）。
   做法：
   ① 頭：把頭的球換成「超橢球」（方圓、下巴寬），膚色加一層很淡的絨毛雜訊；五官是一整片貼在頭前面的畫布貼圖（刺繡線條），座標直接取自參考照片；
      另有一張「眨眼」貼圖，每隔幾秒換一下（包住 rigStep，快轉時不更新）。原本的眼睛／眉毛／鼻／嘴／腮紅全部藏起來，13t 的表情層對小使臉不建立。
   ② 耳朵縮小壓扁（帶黑色耳內線）、黃色脖子、頭往上抬一點露出脖子。
   ③ 法被外套（outfit 2）：藏青底＋狐狸面具／鯛魚燒／櫻花／招財貓／燈籠圖案的外套（前面敞開）、寬短袖、藍色內衫；手臂與腿黃色、手是膚色、鞋黑色。
   載入位置：必須在 13t2 之後、14 之前。關閉：SUD.on=false（頭回到原本的球、外套退回浴衣）。 */
'use strict';
const SUD = { on: true, ver: 1, tex: {}, mat: {}, geo: {} };
/* 頭的超橢球：|x/a|^n + |y/b|^n + |z/c|^n = 1（n 越大越方）。單位與 03 的頭一致（原本半徑 .52） */
const SU_VAR = {      // 兩種小使：1＝圓潤臉、五官大（小使寶寶用）、2＝長臉、五官較小（阿使小老弟用）；身形與髮捲高度不看 doll，而看 outfit（法被外套＝細長身形＋短髮捲）。b＝頭半高、dy＝頭中心下移（頂部不變、下巴變長）、fs＝刺繡五官縮放、fy＝五官上移；貼圖涵蓋 y＝top 往下 rh 的範圍；S／cx／cy＝參考照片上 1 個頭單位＝946 像素、頭中心在 (877,1208)
  1: { a: .49, b: .5, c: .49, n: 2.3, dy: -.03, top: .49, rh: 1.2, fs: .93, fy: 0, S: 946, cx: 877, cy: 1208, W: 1024, H: 1252,
    tx: .518, rim: .45,      // tx＝耳內黑線的 x（與 1.zip 一樣：在頭表面外 .028）；rim＝髮罩前緣（髮際線）的高度，要在眉毛上方
    hairS: [[.45, .44, .84], [.37, .66, .46], [.1, .89, .85]],      // 小使錐頭髮捲 [半徑, 中心高度, 壓扁比, (後腦前後壓縮 zk＝1, 前後位移 zo＝0)]：法被外套（outfit 2）＝較矮。v1.1.69：只留最底層、倒數第二層、最頂層（原本第 2、3 層拿掉），最頂層降到貼在倒數第二層上，頭頂高度矮很多
    hairT: [[.45, .44, .84], [.38, .7, .47], [.09, .93, .9]] },      // 其他服裝＝較高（頂層 y 由 1.32 降到 .93，貼在倒數第二層上）
  2: { a: .47, b: .58, c: .5, bk: .78, n: 3.0, dy: -.04, top: .54, rh: 1.28, fs: .9, fy: .015, S: 946, cx: 877, cy: 1208, W: 1024, H: 1311,
    tx: .518, rim: .49,
    hairS: [[.48, .50, .55, .85, .06], [.4, .7, .46, .92, .03], [.1, .93, .85]],      // v1.1.69：同上只留 3 層；底層與倒數第二層前後壓縮（zk）並往前移（zo），後腦不再凸出一圈（前緣位置幾乎不變，只有後面變薄）
    hairT: [[.48, .50, .55, .85, .06], [.4, .72, .47, .92, .03], [.09, .96, 1]] }
};
const suV = v => (v === 2 ? 2 : 1), suH = v => SU_VAR[suV(v)];
function suZ(x, y, H) { const t = 1 - Math.pow(Math.abs(x / H.a), H.n) - Math.pow(Math.abs((y - H.dy) / H.b), H.n); return t > 0 ? H.c * Math.pow(t, 1 / H.n) : 0; }
function suGrad(x, y, z, H) {
  const { a, b, c, n } = H, gx = Math.sign(x) * Math.pow(Math.abs(x / a), n - 1) / a, gy = Math.sign(y) * Math.pow(Math.abs(y / b), n - 1) / b, gz = Math.sign(z) * Math.pow(Math.abs(z / c), n - 1) / c, L = Math.hypot(gx, gy, gz) || 1;
  return [gx / L, gy / L, gz / L];
}
function suHeadGeo(v) {
  const H = suH(v), gk = 'head' + suV(v); if (SUD.geo[gk]) return SUD.geo[gk]; const { a, b, c, n } = H, g = new THREE.SphereGeometry(1, 48, 34), p = g.attributes.position, nm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = Math.pow(Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n), -1 / n), X = x * f * a, Y = y * f * b, Z = z * f * c, N = suGrad(X, Y, Z, H);
    const bk = Z < 0 ? (H.bk || 1) : 1; p.setXYZ(i, X, Y + H.dy, Z * bk); nm.setXYZ(i, N[0], N[1], N[2] / bk);      // bk＝後腦前後壓縮（只壓 z<0 的後半邊，臉不動；v1.1.74）
  }
  p.needsUpdate = true; nm.needsUpdate = true; g.computeBoundingSphere(); return SUD.geo[gk] = g;
}
/* 貼著頭型的髮罩：把頭的超橢球放大 sc 倍（髮的厚度），只取一塊（th0～th1＝由頭頂往下的角度，p0／pl＝繞一圈的起點與範圍）。髮型用它來「貼住」頭，不會懸空或分離 */
function suHugGeo(v, sc, th0, th1, p0, pl) {
  const gk = ['hug', suV(v), sc, th0.toFixed(3), th1.toFixed(3), p0.toFixed(3), pl.toFixed(3)].join('|'); if (SUD.geo[gk]) return SUD.geo[gk];
  const H = suH(v), { a, b, c, n, dy } = H, g = new THREE.SphereGeometry(1, 44, 22, p0, pl, th0, th1 - th0), p = g.attributes.position, nm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = Math.pow(Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n), -1 / n), X = x * f * a, Y = y * f * b, Z = z * f * c, N = suGrad(X, Y, Z, H);
    const bk = Z < 0 ? (H.bk || 1) : 1; p.setXYZ(i, X * sc, Y * sc + dy, Z * sc * bk); nm.setXYZ(i, N[0], N[1], N[2] / bk);
  }
  p.needsUpdate = true; nm.needsUpdate = true; g.computeBoundingSphere(); return SUD.geo[gk] = g;
}
function suHugTheta(v, sc, yRim) {      // 正前方的髮罩邊緣剛好在 yRim 高度時，要取到的角度
  const H = suH(v), { b, n, dy } = H;
  for (let t = .02; t < .6; t += .005) { const s = Math.sin(t * Math.PI), c = Math.cos(t * Math.PI), f = Math.pow(Math.pow(s, n) + Math.pow(c, n), -1 / n); if (dy + b * sc * f * c <= yRim) return t * Math.PI; }
  return Math.PI * .3;
}
function suPatchGeo(v) {      // 貼在頭前面的曲面（x、y 平面等距取樣，z 取頭表面再外推一點點）
  const H = suH(v), gk = 'patch' + suV(v); if (SUD.geo[gk]) return SUD.geo[gk]; const { a, rh, top, dy } = H, g = new THREE.PlaneGeometry(a * 2, rh, 56, 66), p = g.attributes.position, nm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) + top - rh / 2, z = suZ(x * .995, (y - dy) * .995 + dy, H); p.setXYZ(i, x, y, z + .004); const N = suGrad(x * .995, (y - dy) * .995, Math.max(.02, z), H); nm.setXYZ(i, N[0], N[1], N[2]); }
  p.needsUpdate = true; nm.needsUpdate = true; return SUD.geo[gk] = g;
}
/* ---------- 刺繡臉貼圖：全部用參考照片（1.jpg）上量到的座標畫（照片像素），再縮放成貼圖；阿使小老弟版整體縮小 ---------- */
function suFaceTex(blink, v) {
  const H = suH(v), key = (blink ? 'fb' : 'fo') + suV(v); if (SUD.tex[key]) return SUD.tex[key]; const W = H.W, c = document.createElement('canvas'); c.width = W; c.height = H.H; const g = c.getContext('2d'), k = W / (2 * H.a) / H.S * H.fs;
  g.translate(W / 2, (H.top - H.fy) / H.rh * H.H); g.scale(k, k); g.translate(-H.cx, -H.cy); g.lineCap = 'round'; g.lineJoin = 'round';
  const INK = '#16100f';
  const thread = (pts, w0, w1) => {      // 一條會變粗細的線（頭尾細、中間粗）
    g.strokeStyle = INK; const n = pts.length - 1;
    for (let i = 0; i < n; i++) { const t = (i + .5) / n, w = w0 + (w1 - w0) * Math.sin(Math.PI * t); g.lineWidth = w; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); }
  };
  const curve = (pts, w) => { g.strokeStyle = INK; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); } const q = pts[pts.length - 1]; g.lineTo(q[0], q[1]); g.stroke(); };
  const cheek = (cx, cy, r, seed) => {      // 腮紅：洋紅圓＋亂亂的黑色交叉縫線
    g.save(); g.fillStyle = '#b3337f'; g.beginPath(); g.ellipse(cx, cy, r, r * .96, 0, 0, 6.2832); g.fill(); g.beginPath(); g.ellipse(cx, cy, r * .99, r * .95, 0, 0, 6.2832); g.clip();
    let q = seed; const rn = () => { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; return q / 4294967296; }; g.strokeStyle = INK; g.lineWidth = 8.5;
    for (let i = 0; i < 6; i++) { const o = (i - 2.5) * r * .34 + (rn() - .5) * 10, a = -.62 + (rn() - .5) * .3; g.beginPath(); g.moveTo(cx + o - Math.cos(a) * r * 1.2, cy + o * .2 - Math.sin(a) * r * 1.2); g.lineTo(cx + o + Math.cos(a) * r * 1.2, cy + o * .2 + Math.sin(a) * r * 1.2); g.stroke(); }
    for (let i = 0; i < 5; i++) { const o = (i - 2) * r * .36 + (rn() - .5) * 10, a = 1.05 + (rn() - .5) * .3; g.beginPath(); g.moveTo(cx - o * .3 - Math.cos(a) * r * 1.2, cy + o - Math.sin(a) * r * 1.2); g.lineTo(cx - o * .3 + Math.cos(a) * r * 1.2, cy + o + Math.sin(a) * r * 1.2); g.stroke(); }
    g.restore();
  };
  cheek(527, 1160, 80, 11); cheek(1210, 1242, 74, 29);
  g.save(); if (suV(v) === 1) { g.translate(H.cx, H.cy - 19); g.scale(.9, .9); g.translate(-H.cx, -H.cy); }      // 小使寶寶（圓臉）的眉毛與阿使小老弟（長臉版 fs＝.9、上移 .015）相同
  thread([[418, 1028], [430, 975], [452, 920], [488, 878], [538, 848]], 5, 11);      // 眉毛：兩道細細的弧線，貼近臉的兩側
  thread([[1205, 913], [1262, 950], [1295, 1000], [1308, 1055], [1305, 1108]], 5, 11);
  g.restore();
  /* 鼻子：一條大 U 形粗線＋左鼻孔圓圈（流鼻涕）＋右鼻孔小拱 */
  curve([[612, 1192], [655, 1202], [700, 1230], [758, 1257], [830, 1272], [900, 1277], [966, 1266], [1016, 1238], [1044, 1190], [1043, 1140], [1022, 1106]], 11);
  g.strokeStyle = INK; g.lineWidth = 11; g.beginPath(); g.ellipse(715, 1200, 34, 33, 0, 0, 6.2832); g.stroke();
  g.beginPath(); g.moveTo(857, 1272); g.bezierCurveTo(855, 1236, 935, 1236, 933, 1272); g.stroke();
  /* 鼻涕：從左鼻孔垂下的淡青色一條 */
  g.fillStyle = '#7bbfbd'; g.beginPath(); g.moveTo(701, 1210); g.bezierCurveTo(728, 1210, 732, 1240, 727, 1290); g.bezierCurveTo(724, 1330, 718, 1344, 706, 1344); g.bezierCurveTo(686, 1344, 682, 1320, 681, 1285); g.bezierCurveTo(680, 1245, 682, 1210, 701, 1210); g.closePath(); g.fill();
  g.strokeStyle = '#5ea4a3'; g.lineWidth = 3; g.beginPath(); g.moveTo(682, 1240); g.bezierCurveTo(680, 1290, 686, 1330, 700, 1343); g.stroke();
  g.strokeStyle = '#b4e2df'; g.lineWidth = 5; g.beginPath(); g.moveTo(711, 1232); g.bezierCurveTo(716, 1262, 714, 1300, 707, 1326); g.stroke();
  /* 嘴：洋紅的 D 形，黑色粗邊 */
  g.beginPath(); g.moveTo(690, 1381); g.bezierCurveTo(742, 1394, 860, 1392, 907, 1398); g.bezierCurveTo(914, 1428, 862, 1447, 801, 1446); g.bezierCurveTo(731, 1445, 683, 1418, 690, 1381); g.closePath();
  g.fillStyle = '#c0408c'; g.fill(); g.strokeStyle = INK; g.lineWidth = 11; g.stroke();
  /* 眼睛：黑色粗框的橢圓，上半黑、下半露出一彎銀白（睜一半的呆呆眼）；眨眼時變成一條彎線。兩眼高度、傾斜、白色位置都不一樣（照片就是這樣） */
  const eye = (cx, cy, rx, ry, rot, p0, p1) => {
    g.save(); g.translate(cx, cy); g.rotate(rot);
    if (blink) { g.strokeStyle = INK; g.lineWidth = 12; g.beginPath(); g.moveTo(-rx * .92, -ry * .1); g.quadraticCurveTo(0, ry * .7, rx * .92, -ry * .1); g.stroke(); g.restore(); return; }
    g.fillStyle = INK; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 6.2832); g.fill();
    g.save(); g.beginPath(); g.ellipse(0, 0, rx - 13, ry - 11, 0, 0, 6.2832); g.clip();
    g.fillStyle = '#e8e8ee'; g.beginPath(); g.moveTo(p0[0] * rx, p0[1] * ry); g.lineTo(p1[0] * rx, p1[1] * ry); g.lineTo(p1[0] * rx, ry * 1.5); g.lineTo(p0[0] * rx, ry * 1.5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(140,140,165,.5)'; g.lineWidth = 3; for (let i = 0; i < 5; i++) { const t = .18 + i * .16, x = (p0[0] + (p1[0] - p0[0]) * t) * rx, y = (p0[1] + (p1[1] - p0[1]) * t) * ry; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 3, ry); g.stroke(); }
    g.restore(); g.restore();
  };
  eye(557, 1020, 64, 39, -.14, [-1.1, .25], [1.1, -.3]);
  eye(1145, 1085, 68, 37, .36, [-1.1, -.15], [1.1, .5]);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return SUD.tex[key] = t;
}
function suFaceMat(blink, v) {
  const key = (blink ? 'fb' : 'fo') + suV(v); return SUD.mat[key] || (SUD.mat[key] = new THREE.MeshLambertMaterial({ map: suFaceTex(blink, v), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, emissive: 0x120e0c }));
}
/* ---------- 絨毛：很淡的雜訊貼圖（乘上膚色／髮色），讓表面有一點布料的顆粒感 ---------- */
function suPlushTex() {
  if (SUD.tex.plush) return SUD.tex.plush; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), im = g.createImageData(128, 128); let q = 12345;
  for (let i = 0; i < 128 * 128; i++) { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; const v = 232 + (q >>> 24) * 23 / 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 5); return SUD.tex.plush = t;
}
function suSkinMat(col) { const k = 'sk' + col; return SUD.mat[k] || (SUD.mat[k] = new THREE.MeshLambertMaterial({ color: col, map: suPlushTex() })); }
/* ---------- 頭：換成超橢球＋貼上刺繡臉；耳朵、脖子 ---------- */
function lookDollHead(rig, vis) {
  const head = rig.head, ud = head.userData || {}, sk0 = head.children.find(c => c.isMesh && c.geometry === GEO.head); if (!sk0) return;
  const skin = suSkinMat(vis.skin); const dv = suV(vis.doll); sk0.geometry = suHeadGeo(dv); sk0.material = skin;
  for (const c of head.children) if (c.isMesh && (c.geometry === GEO.eye || c.geometry === GEO.cheek)) c.visible = false;      // 原本的眼睛、一般腮紅
  for (const ev of (ud.fxEyes || [])) { ev.e.visible = false; for (const x of ev.extra) x.visible = false; }
  for (const c of (ud.fxFace || [])) c.visible = false;
  const face = new THREE.Mesh(suPatchGeo(dv), suFaceMat(false, dv)); face.renderOrder = 3; head.add(face);
  let seed = 0; try { seed = (hashStr('sufx:' + ((rig.root && rig.root.id) || 1)) >>> 0) || 7; } catch (e) { seed = 7; }
  rig.suFace = { v: dv, mesh: face, t: 1.2 + (seed % 25) / 10, bt: 0, on: false, rs: seed };
  for (const e of head.children) if (e.isMesh && e.geometry === EAR_GEO) {      // 耳朵：小小一片，貼在頭兩側；帶一條黑色耳內線
    const s = e.position.x < 0 ? -1 : 1; e.position.set(s * (suH(dv).a - .02), -.03, -.01); e.scale.set(.5 * vis.ear, .86 * vis.ear, .55 * vis.ear); e.material = skin;
    const ar = new THREE.Mesh(new THREE.TorusGeometry(.026, .0075, 5, 12, Math.PI * 1.45), mat('#16100f')); ar.position.set(s * suH(dv).tx, -.015, .012); ar.rotation.set(0, s * Math.PI / 2, s > 0 ? .5 : 2.6); head.add(ar);
  }
  head.position.y += dv === 2 ? .3 : .1;      // 頭往上抬一點，露出黃色脖子
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.15, .17, .5, 14), mat(vis.armCol || '#f2de3a')); neck.position.set(0, 1.2, 0); rig.body.add(neck);
}
function suBlinkStep(r, dt) {
  const d = r.suFace; if (!d || window.__ff) return; if (dt > .1) dt = .1;
  if (d.on) { d.bt -= dt; if (d.bt <= 0) { d.on = false; d.mesh.material = suFaceMat(false, d.v); d.rs = (Math.imul(d.rs, 1664525) + 1013904223) >>> 0; d.t = 2 + (d.rs / 4294967296) * 3.8; } }
  else { d.t -= dt; if (d.t <= 0) { d.on = true; d.bt = .13; d.mesh.material = suFaceMat(true, d.v); } }
}
const _suRigStep = rigStep;
rigStep = function (r, dt) { _suRigStep(r, dt); if (r.suFace) { try { suBlinkStep(r, dt); } catch (e) { r.suFace = null; console.error('[su blink]', e); } } };

/* =========================================================
   法被外套（outfit 2）＋黃色手腳＋黑鞋
   ========================================================= */
function suHappiTex(base) {
  const key = 'hp' + base; if (SUD.tex[key]) return SUD.tex[key]; const W = 512, c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, W, W); g.lineJoin = 'round'; g.lineCap = 'round';
  const star = (cx, cy, r, n, ri, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? ri : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  const sakura = (cx, cy, r) => { g.fillStyle = '#ff4f8f'; for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.57; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * .55, cy + Math.sin(a) * r * .55, r * .5, r * .36, a, 0, 6.2832); g.fill(); } g.fillStyle = '#ffd0e0'; g.beginPath(); g.arc(cx, cy, r * .22, 0, 6.2832); g.fill(); };
  const fox = (cx, cy, r) => {      // 狐狸面具：白色圓臉＋兩隻尖耳＋紅色花紋
    g.fillStyle = '#f7f1e6'; g.strokeStyle = '#1b1422'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - r * .95, cy - r * .1); g.lineTo(cx - r * .8, cy - r * 1.05); g.lineTo(cx - r * .2, cy - r * .65); g.quadraticCurveTo(cx, cy - r * .7, cx + r * .2, cy - r * .65); g.lineTo(cx + r * .8, cy - r * 1.05); g.lineTo(cx + r * .95, cy - r * .1); g.quadraticCurveTo(cx + r * .9, cy + r * .8, cx, cy + r * .95); g.quadraticCurveTo(cx - r * .9, cy + r * .8, cx - r * .95, cy - r * .1); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e0242e'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * r * .8, cy - r * .9); g.lineTo(cx + s * r * .55, cy - r * .55); g.lineTo(cx + s * r * .9, cy - r * .3); g.closePath(); g.fill(); g.beginPath(); g.ellipse(cx + s * r * .5, cy + r * .12, r * .13, r * .3, s * .6, 0, 6.2832); g.fill(); g.beginPath(); g.moveTo(cx + s * r * .22, cy + r * .5); g.lineTo(cx + s * r * .5, cy + r * .72); g.lineTo(cx + s * r * .1, cy + r * .72); g.closePath(); g.fill(); }
    g.strokeStyle = '#1b1422'; g.lineWidth = 3; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * r * .15, cy + r * .1); g.lineTo(cx + s * r * .42, cy + r * .02); g.stroke(); } g.fillStyle = '#1b1422'; g.beginPath(); g.arc(cx, cy + r * .3, r * .08, 0, 6.2832); g.fill();
  };
  const taiyaki = (cx, cy, r, rot) => { g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = '#f2b43a'; g.strokeStyle = '#a2661c'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, r, r * .62, 0, 0, 6.2832); g.fill(); g.stroke(); g.beginPath(); g.moveTo(r * .85, 0); g.lineTo(r * 1.5, -r * .5); g.lineTo(r * 1.4, 0); g.lineTo(r * 1.5, r * .5); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#a2661c'; g.beginPath(); g.arc(-r * .55, -r * .12, r * .08, 0, 6.2832); g.fill(); g.strokeStyle = '#c4801f'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(r * (-.1 + i * .3), 0, r * .35, -1, 1); g.stroke(); } g.restore(); };
  const neko = (cx, cy, r) => { g.fillStyle = '#f7f1e6'; g.strokeStyle = '#1b1422'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - r * .8, cy - r * .3); g.lineTo(cx - r * .7, cy - r); g.lineTo(cx - r * .2, cy - r * .6); g.lineTo(cx + r * .2, cy - r * .6); g.lineTo(cx + r * .7, cy - r); g.lineTo(cx + r * .8, cy - r * .3); g.quadraticCurveTo(cx + r * .9, cy + r * .6, cx, cy + r * .75); g.quadraticCurveTo(cx - r * .9, cy + r * .6, cx - r * .8, cy - r * .3); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#e0242e'; g.beginPath(); g.arc(cx - r * .45, cy - r * .45, r * .14, 0, 6.2832); g.fill(); g.strokeStyle = '#1b1422'; g.lineWidth = 3; g.beginPath(); g.arc(cx - r * .3, cy, r * .15, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(cx + r * .3, cy, r * .15, Math.PI, 0); g.stroke(); g.fillStyle = '#f2b43a'; g.beginPath(); g.arc(cx, cy + r * .72, r * .16, 0, 6.2832); g.fill(); };
  const lantern = (cx, cy, r) => { g.fillStyle = '#e0242e'; g.strokeStyle = '#6a0f16'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, r * .72, r, 0, 0, 6.2832); g.fill(); g.stroke(); g.fillStyle = '#2a2230'; g.fillRect(cx - r * .42, cy - r * 1.18, r * .84, r * .2); g.fillRect(cx - r * .42, cy + r * .98, r * .84, r * .2); g.strokeStyle = '#f7e6a0'; g.lineWidth = 2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.ellipse(cx, cy, r * .72 * (.3 + .35 * Math.abs(i)), r, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); } };
  const cup = (cx, cy, r) => { g.fillStyle = '#e0242e'; g.beginPath(); g.moveTo(cx - r * .7, cy - r * .8); g.lineTo(cx + r * .7, cy - r * .8); g.lineTo(cx + r * .5, cy + r * .8); g.lineTo(cx - r * .5, cy + r * .8); g.closePath(); g.fill(); g.fillStyle = '#f7f1e6'; g.fillRect(cx - r * .62, cy - r * .2, r * 1.24, r * .38); };
  const leaf = (cx, cy, r) => { g.fillStyle = '#2fb589'; g.beginPath(); g.moveTo(cx - r, cy + r * .6); g.quadraticCurveTo(cx - r * .6, cy - r, cx + r, cy - r * .4); g.quadraticCurveTo(cx + r * .4, cy + r, cx - r, cy + r * .6); g.closePath(); g.fill(); g.strokeStyle = '#b8f0d8'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - r * .8, cy + r * .5); g.lineTo(cx + r * .6, cy - r * .3); g.stroke(); };
  const stripe = (cx, cy, r) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#c8c8d0' : '#6a6a78'; g.fillRect(cx - r, cy - r * .8 + i * r * .44, r * 2, r * .36); } };
  const bell = (cx, cy, r) => { g.fillStyle = '#f2b43a'; g.beginPath(); g.arc(cx, cy, r * .7, Math.PI, 0); g.lineTo(cx + r * .8, cy + r * .5); g.lineTo(cx - r * .8, cy + r * .5); g.closePath(); g.fill(); };
  const M = [fox, sakura, taiyaki, neko, lantern, cup, leaf, bell, stripe], G = 5, cell = W / G;
  let q = 7; const rn = () => { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; return q / 4294967296; };
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const i = (gx * 2 + gy * 3) % M.length, cx = (gx + .5) * cell + (rn() - .5) * 14, cy = (gy + .5) * cell + (rn() - .5) * 14, r = cell * (.27 + rn() * .06), f = M[i];
    for (const [ox, oy] of [[0, 0], [-W, 0], [W, 0], [0, -W], [0, W]]) { if (ox || oy) { if (cx + ox < -cell || cx + ox > W + cell || cy + oy < -cell || cy + oy > W + cell) continue; } g.save(); g.translate(ox, oy); if (f === taiyaki) f(cx, cy, r, (rn() - .5) * 1.2); else f(cx, cy, r); g.restore(); }
    if (gx % 2 === gy % 2) sakura(cx + cell * .38, cy + cell * .3, cell * .09);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return SUD.tex[key] = t;
}
function suLegs(rig, vis) {      // 黃色細長腿＋黑鞋（法被與浴衣共用）
  const legM = mat(vis.legCol), blk = mat('#0c0a0e');
  for (const l of [rig.legL, rig.legR]) l.traverse(m => { if (!m.isMesh) return; const g = m.geometry; if (g === THIGH_GEO || g === SHIN_GEO || g === KNEE_GEO || g === GEO.leg || g === SOCK_GEO) m.material = legM; else if (g === RING_GEO || g === STRIPE_GEO) m.visible = false; else if (g === SOLE_GEO || g === GEO.shoe) m.material = blk; });
}
function lookHappi(rig, vis, o) {
  if (o && o.pl && o.pl.suit) return;
  const body = rig.body, jc = rig.torso.material, thigh = rig.legL.children.find(c => c.geometry === GEO.leg || c.geometry === THIGH_GEO), pcM = thigh && thigh.material;
  const skinM = mat(vis.skin), armM = mat(vis.armCol || '#f0de3c'), legM = mat(vis.legCol || vis.armCol || '#f0de3c'), inner = mat(vis.fanCol || '#1a3bb0'), blk = mat('#0c0a0e');
  const tex = suHappiTex(vis.fabCol || '#16203c'), mk = (rx, ry) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }); };
  const zf = .29 * vis.w * vis.d, shw = vis.sw || 1;
  rig.root.traverse(m => {
    if (!m.isMesh) return; const g = m.geometry, mt = m.material;
    if (g === SOCK_GEO) { m.material = legM; return; }
    if (g === RING_GEO || g === STRIPE_GEO || g === BUCKLE_GEO || g === NUM_GEO || g === WRIST_GEO || g === COLLAR_GEO) { m.visible = false; return; }
    if (g === SOLE_GEO || g === GEO.shoe) { m.material = blk; return; }
    if (g && g.type === 'BoxGeometry' && g.parameters && Math.abs(g.parameters.width - .035) < .001 && Math.abs(g.parameters.height - .5) < .001) { m.visible = false; return; }
    if (g === SLV_GEO) { m.material = armM; return; }
    if (mt === jc) { m.material = (g === GEO.torso || g === PEL_GEO) ? inner : armM; return; }      // 軀幹與骨盆＝藍色內衫；手臂、肩、手肘＝黃色
    if (pcM && mt === pcM) m.material = (g === PEL_GEO) ? inner : legM;
  });
  const belt = body.children.find(c => c.geometry && c.geometry.type === 'CylinderGeometry' && c.geometry.parameters && Math.abs(c.geometry.parameters.radiusTop - .285) < .001 && Math.abs(c.geometry.parameters.height - .1) < .001); if (belt) belt.visible = false;
  for (const c of body.children) if (c.geometry === PEL_GEO) c.material = inner;
  /* 內衫下擺：藍色的寬短裙／短褲，鬆緊帶抓皺 */
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(.27, .3, .24, 16), inner); skirt.position.y = .46; skirt.scale.set(vis.w * 1.02, 1, vis.w * vis.d * 1.02); body.add(skirt);
  const gather = new THREE.Mesh(new THREE.TorusGeometry(.275, .02, 6, 18), mat(shadeHex(vis.fanCol || '#1a3bb0', .72))); gather.rotation.x = Math.PI / 2; gather.position.y = .56; gather.scale.set(vis.w, vis.w * vis.d, 1); body.add(gather);
  /* 外套本體：前面敞開的圓筒（藏青祭典圖案），加前襟滾邊 */
  const GAP = 1.05, shell = new THREE.Mesh(new THREE.CylinderGeometry(.345, .37, .74, 28, 1, true, GAP / 2, Math.PI * 2 - GAP), mk(2, .62)); shell.position.y = .82; shell.scale.set(vis.w * shw, 1, vis.w * vis.d); body.add(shell);
  const trimM = mat(vis.collarCol || '#d8d8e0');
  for (const s of [-1, 1]) {
    const a = s * GAP / 2, tr = new THREE.Mesh(new THREE.BoxGeometry(.03, .74, .035), trimM); tr.position.set(Math.sin(a) * .357 * vis.w * shw, .82, Math.cos(a) * .357 * vis.w * vis.d); tr.rotation.y = a; body.add(tr);
    const yoke = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * .5), mk(1, .3)); yoke.position.set(s * (.3 * vis.w * shw + .1) * .94, 1.12, 0); yoke.scale.set(1, .85, 1.05); body.add(yoke);      // 肩
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.33, .345, .08, 24, 1, true, GAP / 2, Math.PI * 2 - GAP), mk(2, .1)); top.position.y = 1.2; top.scale.set(vis.w * shw, 1, vis.w * vis.d); body.add(top);
  /* 寬短袖：圓筒（只蓋住上臂），手臂（黃色）從袖口露出來 */
  for (const a of [rig.armL, rig.armR]) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(.17, .225, .34, 14, 1, true), mk(1, .3)); sl.position.y = -.14; a.add(sl); }
}
/* =========================================================
   睡衣（outfit 3，阿使小老弟）：淺藍底、小熊／小狗／星星／雲朵卡通圖案；翻領＋藍色滾邊、藍釦子、胸前口袋；短袖、短褲；手腳黃色
   ========================================================= */
function suPajamaTex(base, line) {
  const key = 'pj' + base + line; if (SUD.tex[key]) return SUD.tex[key]; const W = 512, c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, W, W);
  g.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 11, W);      // 淡淡的直條
  g.lineJoin = 'round'; g.lineCap = 'round';
  const star = (cx, cy, r) => { g.strokeStyle = line; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.stroke(); };
  const cloud = (cx, cy, r) => { g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(cx - r * .5, cy, r * .5, 0, 6.2832); g.arc(cx, cy - r * .25, r * .6, 0, 6.2832); g.arc(cx + r * .55, cy, r * .45, 0, 6.2832); g.fill(); };
  const bear = (cx, cy, r, col) => { g.fillStyle = col; g.strokeStyle = '#7a5a3a'; g.lineWidth = 2.5; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * .72, cy - r * .7, r * .34, 0, 6.2832); g.fill(); g.stroke(); } g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill(); g.stroke(); g.fillStyle = '#3a2a22'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * .36, cy - r * .1, r * .09, 0, 6.2832); g.fill(); } g.fillStyle = '#f7e6c8'; g.beginPath(); g.ellipse(cx, cy + r * .32, r * .38, r * .28, 0, 0, 6.2832); g.fill(); g.fillStyle = '#3a2a22'; g.beginPath(); g.ellipse(cx, cy + r * .2, r * .12, r * .08, 0, 0, 6.2832); g.fill(); };
  const dog = (cx, cy, r) => { bear(cx, cy, r, '#e0b070'); g.fillStyle = '#a9743a'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * r * .95, cy - r * .1, r * .28, r * .6, s * .3, 0, 6.2832); g.fill(); } };
  const cell = 128; let q = 5; const rn = () => { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; return q / 4294967296; };
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const cx = (gx + .5) * cell + (rn() - .5) * 18, cy = (gy + .5) * cell + (rn() - .5) * 18, k = (gx + gy * 2) % 4;
    if (k === 0) bear(cx, cy, 24, '#e8b878'); else if (k === 1) star(cx, cy, 24); else if (k === 2) dog(cx, cy, 22); else cloud(cx, cy, 24);
    if ((gx + gy) % 2) star(cx + cell * .45, cy + cell * .3, 9);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return SUD.tex[key] = t;
}
function lookPajama(rig, vis, o) {
  if (o && o.pl && o.pl.suit) return;
  const body = rig.body, jc = rig.torso.material, thigh = rig.legL.children.find(c => c.geometry === GEO.leg || c.geometry === THIGH_GEO), pcM = thigh && thigh.material;
  const base = vis.fabCol || '#bcd8f2', line = vis.fanCol || '#4a86d9', armM = mat(vis.armCol || '#f0de3c'), legM = mat(vis.legCol || vis.armCol || '#f0de3c'), blk = mat('#0c0a0e');
  const tex = suPajamaTex(base, line), mk = (rx, ry) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }); };
  const shirt = mk(1.0, .8), zf = .29 * vis.w * vis.d, pipe = mat(line), lap = mat(vis.collarCol || '#e8f2ff');
  rig.root.traverse(m => {
    if (!m.isMesh) return; const g = m.geometry, mt = m.material;
    if (g === SOCK_GEO) { m.material = legM; return; }
    if (g === RING_GEO || g === STRIPE_GEO || g === BUCKLE_GEO || g === NUM_GEO || g === WRIST_GEO || g === COLLAR_GEO) { m.visible = false; return; }
    if (g === SOLE_GEO || g === GEO.shoe) { m.material = blk; return; }
    if (g && g.type === 'BoxGeometry' && g.parameters && Math.abs(g.parameters.width - .035) < .001 && Math.abs(g.parameters.height - .5) < .001) { m.visible = false; return; }
    if (g === SHO_GEO) { m.material = shirt; m.scale.multiplyScalar(1.12); return; }
    if (g === SLV_GEO) { m.material = armM; return; }
    if (mt === jc) { m.material = (g === GEO.torso || g === PEL_GEO) ? shirt : armM; return; }
    if (pcM && mt === pcM) m.material = (g === PEL_GEO) ? shirt : legM;
  });
  const belt = body.children.find(c => c.geometry && c.geometry.type === 'CylinderGeometry' && c.geometry.parameters && Math.abs(c.geometry.parameters.radiusTop - .285) < .001 && Math.abs(c.geometry.parameters.height - .1) < .001); if (belt) belt.visible = false;
  for (const c of body.children) if (c.geometry === PEL_GEO) c.material = shirt;
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(.27, .31, .3, 18), mk(1.2, .5)); shorts.position.y = .44; shorts.scale.set(vis.w * 1.03, 1, vis.w * vis.d * 1.03); body.add(shorts);      // 睡褲
  const hem = new THREE.Mesh(new THREE.TorusGeometry(.305, .014, 6, 20), pipe); hem.rotation.x = Math.PI / 2; hem.position.y = .3; hem.scale.set(vis.w * 1.03, vis.w * vis.d * 1.03, 1); body.add(hem);
  for (const s of [-1, 1]) {      // 翻領：兩片淺色領片＋藍色滾邊
    const lp = new THREE.Mesh(new THREE.BoxGeometry(.13, .3, .03), lap); lp.position.set(s * .1, 1.04, zf + .02); lp.rotation.z = s * .5; body.add(lp);
    const pp = new THREE.Mesh(new THREE.BoxGeometry(.018, .31, .034), pipe); pp.position.set(s * .17, 1.02, zf + .026); pp.rotation.z = s * .5; body.add(pp);
  }
  for (let i = 0; i < 4; i++) { const bt = new THREE.Mesh(new THREE.SphereGeometry(.024, 8, 6), mat('#2f6fe8')); bt.position.set(0, .95 - i * .12, zf + .016); body.add(bt); }      // 藍釦子
  const pk = new THREE.Mesh(new THREE.BoxGeometry(.13, .11, .02), lap); pk.position.set(.15 * vis.w, .86, zf + .016); body.add(pk); const pe = new THREE.Mesh(new THREE.BoxGeometry(.14, .018, .024), pipe); pe.position.set(.15 * vis.w, .915, zf + .02); body.add(pe);      // 胸前口袋
  const nk = new THREE.Mesh(new THREE.CylinderGeometry(.2, .27, .16, 18), shirt); nk.position.y = 1.08; nk.scale.set(vis.w, 1, vis.w * vis.d); body.add(nk);      // 領口：蓋住脖子根部
  const nr = new THREE.Mesh(new THREE.TorusGeometry(.205, .02, 6, 20), lap); nr.rotation.x = Math.PI / 2; nr.position.y = 1.16; nr.scale.set(vis.w, vis.w * vis.d, 1); body.add(nr);
  for (const a of [rig.armL, rig.armR]) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(.115, .135, .26, 12, 1, true), mk(.6, .25)); sl.position.y = -.12; a.add(sl); const sp = new THREE.Mesh(new THREE.TorusGeometry(.13, .012, 6, 14), pipe); sp.rotation.x = Math.PI / 2; sp.position.y = -.25; a.add(sp); }
}
/* =========================================================
   包住 makeChibi（要在 13t2 之後）
   ========================================================= */
const _suMakeChibi = makeChibi;
makeChibi = function (o) {
  const rig = _suMakeChibi.apply(this, arguments), v = rig && rig.vis;
  try {
    if (SUD.on && v && v.hx) {
      if (v.doll) lookDollHead(rig, v);
      if ((v.outfit | 0) === 3) lookPajama(rig, v, o); else if ((v.outfit | 0) === 2) lookHappi(rig, v, o); else if ((v.outfit | 0) === 1 && v.legCol && !(o && o.pl && o.pl.suit)) suLegs(rig, v);
    }
  } catch (e) { console.error('[su doll]', e); }
  return rig;
};
