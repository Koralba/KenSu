/* ===== 13s-clay-skin.js ｜ 職棒野球魂風外觀：紅土內野／割草紋草皮／警戒區／深藍牆面／明亮日光（參考圖 1221.png）=====
   只改「外觀」：內野紅土（本壘周圍深褐壓實土＋外圈橘紅土）、本壘高解析細節貼圖（白線磨損、腳印、粉塵）、
   投手丘、草皮割草紋、外野警戒區紅土帶、深藍牆面、藍色看台、明亮暖色日光與藍天。
   不動任何比賽邏輯、能力值、判定；全部靠重畫貼圖與包裝既有函式完成。
   關閉方式：把檔案開頭 CLAY.on 改成 false（或把 baseball.html 裡這個 <script> 拿掉）→ 還原成甲子園黑土外觀。
   載入位置：必須在 13r-koshien-skin.js 之後、14 之前（本檔覆寫 13r 的 koRedraw* 並包裝 applyLighting／applyPark）。 */
'use strict';
const CLAY = { on: true, N: 2048, HOME: 14 };      // N：內野貼圖邊長（像素）；HOME：本壘細節貼圖涵蓋的公尺數

/* =========================================================
   A. 小工具：亂數、可平鋪的值雜訊
   ========================================================= */
function clayRand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function clayField(w, h, cell, oct, seed) {      // 多層值雜訊（左右上下可無縫平鋪），回傳 0~1 的 Float32Array
  const out = new Float32Array(w * h), r = clayRand(seed), sm = t => t * t * (3 - 2 * t); let amp = 1, tot = 0, f = cell;
  for (let o = 0; o < oct; o++) {
    const gx = Math.max(2, Math.round(f)), gy = Math.max(2, Math.round(f * h / w)), G = new Float32Array(gx * gy); for (let i = 0; i < G.length; i++) G[i] = r();
    for (let y = 0; y < h; y++) {
      const v = y / h * gy, yi = Math.floor(v), yf = sm(v - yi), y0 = (yi % gy) * gx, y1 = ((yi + 1) % gy) * gx;
      for (let x = 0; x < w; x++) {
        const u = x / w * gx, xi = Math.floor(u), xf = sm(u - xi), x0 = xi % gx, x1 = (xi + 1) % gx;
        const a = G[y0 + x0], b = G[y0 + x1], c = G[y1 + x0], d = G[y1 + x1];
        out[y * w + x] += amp * (a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf);
      }
    }
    tot += amp; amp *= .5; f *= 2.1;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
function claySmooth(g) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
function clayMottle(g, N, seed, o) {      // 在畫布上疊「深／淺」兩層雜訊斑塊（大塊起伏＋中塊＋細顆粒）
  const M = 512, a = clayField(M, M, o.c1 || 4, 3, seed), b = clayField(M, M, o.c2 || 16, 3, seed + 1), d = clayField(M, M, o.c3 || 64, 2, seed + 2);
  const dk = document.createElement('canvas'), lt = document.createElement('canvas'); dk.width = dk.height = lt.width = lt.height = M;
  const dg = dk.getContext('2d'), lg = lt.getContext('2d'), di = dg.createImageData(M, M), li = lg.createImageData(M, M), D = di.data, L = li.data;
  const cd = o.dark, cl = o.light, k = o.amp || .5;
  for (let i = 0; i < M * M; i++) {
    const s = ((a[i] - .5) * (o.w1 || 1.4) + (b[i] - .5) * (o.w2 || 1) + (d[i] - .5) * (o.w3 || .7)) * 2.2;
    const p = i * 4, dv = Math.max(0, -s) * k, lv = Math.max(0, s) * k;
    D[p] = cd[0]; D[p + 1] = cd[1]; D[p + 2] = cd[2]; D[p + 3] = Math.min(255, dv * 255);
    L[p] = cl[0]; L[p + 1] = cl[1]; L[p + 2] = cl[2]; L[p + 3] = Math.min(255, lv * 255);
  }
  dg.putImageData(di, 0, 0); lg.putImageData(li, 0, 0); g.save(); claySmooth(g); g.drawImage(dk, 0, 0, N, N); g.drawImage(lt, 0, 0, N, N); g.restore();
}
function claySpeckle(g, N, n, seed, cols, amin, amax, smin, smax) {      // 細小的石粒／顆粒
  const r = clayRand(seed); g.save();
  for (let i = 0; i < n; i++) { g.globalAlpha = amin + r() * (amax - amin); g.fillStyle = cols[(r() * cols.length) | 0]; const q = smin + r() * (smax - smin); g.fillRect(r() * N, r() * N, q, q * (.6 + r() * .8)); }
  g.restore();
}

/* =========================================================
   B. 內野紅土（整張 90×90 公尺的貼圖）
   ========================================================= */
const CLC = { base: '#ad4f2b', packed: '#6a3a2a', packedLip: 'rgba(226,166,124,.55)', mound: '#8c4b33' };
function clayRedrawSkin() {
  const N = CLAY.N; SK.N = N; const c = skinTex.image; c.width = c.height = N;
  const g = c.getContext('2d'), S = v => v / SK.S * N, mk = () => { const k = document.createElement('canvas'); k.width = k.height = N; return k; };
  g.clearRect(0, 0, N, N);
  /* ① 遮罩：哪些地方是土（外圈弧、本壘圈、壘間跑道、壘包圈、投手丘），草皮菱形挖空露出下面的割草紋草皮 */
  const mk1 = mk(), mg = mk1.getContext('2d'); mg.fillStyle = '#fff';
  mg.beginPath(); mg.arc(px(0), pz(-16), S(23.5), 0, TAU); mg.fill();
  mg.beginPath(); mg.arc(px(0), pz(1.5), S(6.8), 0, TAU); mg.fill();
  const inset = 2.0, V = [[0, -inset * 1.7 - 2.5], [H - inset * 1.4, -H], [0, -2 * H + inset * 1.4], [-H + inset * 1.4, -H]];
  const poly = ctx => { ctx.beginPath(); V.forEach((p, i) => i ? ctx.lineTo(px(p[0]), pz(p[1])) : ctx.moveTo(px(p[0]), pz(p[1]))); ctx.closePath(); };
  mg.globalCompositeOperation = 'destination-out'; poly(mg); mg.fill(); mg.globalCompositeOperation = 'source-over';
  mg.strokeStyle = '#fff'; mg.lineCap = 'round'; mg.lineWidth = S(1.8); mg.beginPath();
  for (let i = 0; i < 4; i++) { const a = BASES[i], b = BASES[(i + 1) % 4]; mg.moveTo(px(a.x), pz(a.z)); mg.lineTo(px(b.x), pz(b.z)); } mg.stroke();
  for (const b of BASES.slice(1)) { mg.beginPath(); mg.arc(px(b.x), pz(b.z), S(3.4), 0, TAU); mg.fill(); }
  mg.beginPath(); mg.arc(px(0), pz(-15), S(3.7), 0, TAU); mg.fill();
  const soft = mk(), sg = soft.getContext('2d'); try { sg.filter = 'blur(' + (N / 1536 * 1.1).toFixed(2) + 'px)'; } catch (e) { } sg.drawImage(mk1, 0, 0); sg.filter = 'none';
  /* ② 土的顏色：橘紅底 → 斑塊 → 耙痕 → 本壘壓實深褐 → 壘包磨損 → 顆粒 */
  const cc = mk(), cg = cc.getContext('2d'), r = clayRand(31);
  cg.fillStyle = CLC.base; cg.fillRect(0, 0, N, N);
  clayMottle(cg, N, 101, { dark: [112, 52, 30], light: [238, 150, 98], amp: .62, c1: 3, c2: 12, c3: 50, w1: 1.5, w2: 1.1, w3: .6 });
  cg.save(); cg.lineCap = 'butt';      // 耙痕：沿外圈弧的同心細弧＋沿壘線的平行細線
  for (let i = 0; i < 260; i++) {
    const R = 6 + r() * 17.5, a0 = r() * TAU, len = .25 + r() * 1.1; cg.strokeStyle = r() < .5 ? 'rgba(120,56,32,.07)' : 'rgba(240,170,120,.06)'; cg.lineWidth = S(.04 + r() * .06);
    cg.beginPath(); cg.arc(px(0), pz(-16), S(R), a0, a0 + len); cg.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const a = BASES[i], b = BASES[(i + 1) % 4], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
    for (let k = 0; k < 24; k++) { const o = (r() - .5) * 3.4, t0 = r() * .7, t1 = t0 + .15 + r() * .3; cg.strokeStyle = r() < .5 ? 'rgba(110,52,30,.07)' : 'rgba(238,168,118,.06)'; cg.lineWidth = S(.04 + r() * .05); cg.beginPath(); cg.moveTo(px(a.x + dx * t0 + nx * o), pz(a.z + dz * t0 + nz * o)); cg.lineTo(px(a.x + dx * Math.min(1, t1) + nx * o), pz(a.z + dz * Math.min(1, t1) + nz * o)); cg.stroke(); }
  }
  cg.restore();
  cg.lineCap = 'round'; cg.strokeStyle = 'rgba(104,52,34,.30)'; cg.lineWidth = S(1.5); cg.beginPath();      // 壘間跑道：踩實、略深
  for (let i = 0; i < 4; i++) { const a = BASES[i], b = BASES[(i + 1) % 4]; cg.moveTo(px(a.x), pz(a.z)); cg.lineTo(px(b.x), pz(b.z)); } cg.stroke();
  for (const b of BASES) { const rg = cg.createRadialGradient(px(b.x), pz(b.z), 0, px(b.x), pz(b.z), S(3.1)); rg.addColorStop(0, 'rgba(96,48,32,.55)'); rg.addColorStop(1, 'rgba(96,48,32,0)'); cg.fillStyle = rg; cg.beginPath(); cg.arc(px(b.x), pz(b.z), S(3.1), 0, TAU); cg.fill(); }
  { const rg = cg.createRadialGradient(px(0), pz(-15), 0, px(0), pz(-15), S(4.2)); rg.addColorStop(0, 'rgba(110,56,36,.7)'); rg.addColorStop(.7, 'rgba(110,56,36,.4)'); rg.addColorStop(1, 'rgba(110,56,36,0)'); cg.fillStyle = rg; cg.beginPath(); cg.arc(px(0), pz(-15), S(4.2), 0, TAU); cg.fill(); }
  { const rg = cg.createRadialGradient(px(0), pz(1.5), 0, px(0), pz(1.5), S(7)); rg.addColorStop(0, 'rgba(98,54,38,1)'); rg.addColorStop(.88, 'rgba(104,57,40,1)'); rg.addColorStop(.95, 'rgba(112,62,42,.9)'); rg.addColorStop(1, 'rgba(120,66,44,0)'); cg.fillStyle = rg; cg.beginPath(); cg.arc(px(0), pz(1.5), S(7), 0, TAU); cg.fill(); }      // 本壘壓實深褐
  cg.strokeStyle = CLC.packedLip; cg.lineWidth = S(.2); cg.beginPath(); cg.arc(px(0), pz(1.5), S(6.82), 0, TAU); cg.stroke();      // 圈緣淡色細邊（參考圖的那條弧）
  clayMottle(cg, N, 211, { dark: [58, 28, 18], light: [190, 120, 86], amp: .33, c1: 6, c2: 26, c3: 90, w1: .8, w2: 1.2, w3: 1 });
  claySpeckle(cg, N, 16000, 41, ['#4a2214', '#7a3a22', '#f0b080', '#e49a68'], .14, .34, .8, 2.6);
  cg.globalCompositeOperation = 'destination-in'; cg.drawImage(soft, 0, 0); cg.globalCompositeOperation = 'source-over';
  g.drawImage(cc, 0, 0);
  /* ③ 土與草交界：草邊緣的一圈陰影（只畫在土這一側）*/
  g.save(); g.globalCompositeOperation = 'source-atop'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(70,32,20,.30)'; g.lineWidth = S(.5); poly(g); g.stroke();
  g.strokeStyle = 'rgba(70,32,20,.26)'; g.lineWidth = S(.5); g.beginPath(); g.arc(px(0), pz(-16), S(23.5), 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(244,184,138,.20)'; g.lineWidth = S(.16); g.beginPath(); g.arc(px(0), pz(-16), S(23.2), 0, TAU); g.stroke();      // 外緣內側淡色亮邊
  g.restore();
  skinTex.needsUpdate = true;
}

/* ---------- 本壘高解析細節貼圖：本壘板、打擊區／捕手區白線（會磨損）、腳印與粉塵 ---------- */
let clayHome = null;
function clayDrawHome(g, W) {
  const P = CLAY.HOME, K = W / P, hx = x => (x + P / 2) * K, hz = z => (z - 1.5 + P / 2) * K, r = clayRand(77), M = v => v * K;
  g.clearRect(0, 0, W, W);
  const cl = document.createElement('canvas'); cl.width = cl.height = W; const cg = cl.getContext('2d');
  cg.fillStyle = CLC.packed; cg.fillRect(0, 0, W, W);
  clayMottle(cg, W, 301, { dark: [52, 26, 17], light: [176, 112, 80], amp: .55, c1: 3, c2: 11, c3: 44, w1: 1.1, w2: 1.4, w3: .9 });
  clayMottle(cg, W, 331, { dark: [48, 22, 14], light: [200, 134, 98], amp: .28, c1: 14, c2: 55, c3: 160, w1: .6, w2: 1, w3: 1.2 });
  const blob = (x, z, rad, col, a) => { const X = hx(x), Z = hz(z), R = M(rad), rg = cg.createRadialGradient(X, Z, 0, X, Z, R); rg.addColorStop(0, col.replace('A', a)); rg.addColorStop(1, col.replace('A', 0)); cg.fillStyle = rg; cg.beginPath(); cg.ellipse(X, Z, R, R * (.55 + r() * .4), r() * 3.14, 0, TAU); cg.fill(); };
  for (let i = 0; i < 46; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 5; blob(Math.cos(a) * d, 1.5 + Math.sin(a) * d, .18 + r() * .55, 'rgba(206,140,102,A)', .16 + r() * .22); }      // 淡色粉塵
  for (let i = 0; i < 40; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 5; blob(Math.cos(a) * d, 1.5 + Math.sin(a) * d, .2 + r() * .6, 'rgba(46,22,14,A)', .12 + r() * .2); }      // 深色濕斑
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) blob(s * (1.4 + r() * 1.1), -1.2 + r() * 3.4, .12 + r() * .3, r() < .5 ? 'rgba(60,30,20,A)' : 'rgba(214,150,112,A)', .22 + r() * .2);      // 打擊區腳印／蹬痕
  for (let i = 0; i < 7; i++) blob(-1.1 + r() * 2.2, 2.5 + r() * 2, .25 + r() * .4, 'rgba(210,146,108,A)', .3);      // 捕手區較鬆的土
  claySpeckle(cg, W, 52000, 55, ['#3e1c10', '#6a3422', '#e4a678', '#f2c09a'], .16, .4, 1.2, 4.2);
  const rg = cg.createRadialGradient(hx(0), hz(1.5), M(5.1), hx(0), hz(1.5), M(6.7)); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');      // 邊緣漸層淡出，與下層內野貼圖無縫銜接
  cg.globalCompositeOperation = 'destination-in'; cg.fillStyle = rg; cg.fillRect(0, 0, W, W); cg.globalCompositeOperation = 'source-over';
  g.drawImage(cl, 0, 0);
  /* 白線＋本壘板：先畫在獨立畫布，打上小缺口與糊邊（粉筆線被踩、被風吹的磨損感），再疊上去 */
  const ch = document.createElement('canvas'); ch.width = ch.height = W; const hg = ch.getContext('2d');
  hg.strokeStyle = '#f4f1ea'; hg.lineWidth = M(.17); hg.lineJoin = 'miter';
  for (const s of [-1, 1]) hg.strokeRect(hx(s * 1.9 - .9), hz(-1.6), M(1.8), M(3.8));
  hg.strokeRect(hx(-1.6), hz(2.6), M(3.2), M(2));
  hg.fillStyle = '#f7f5ef'; hg.beginPath(); hg.moveTo(hx(-.8), hz(0)); hg.lineTo(hx(.8), hz(0)); hg.lineTo(hx(.8), hz(.5)); hg.lineTo(hx(0), hz(1.1)); hg.lineTo(hx(-.8), hz(.5)); hg.closePath(); hg.fill();
  hg.save(); hg.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 520; i++) { hg.globalAlpha = .35 + r() * .6; const q = M(.015 + r() * .05); hg.beginPath(); hg.ellipse(r() * W, r() * W, q * (1 + r() * 2), q, r() * 3.14, 0, TAU); hg.fill(); }
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { hg.globalAlpha = .75; const x = hx(s * 1.9 + (r() - .5) * 2), z = hz(-1.6 + r() * 3.8), q = M(.05 + r() * .1); hg.beginPath(); hg.ellipse(x, z, q * 1.8, q, r() * 3.14, 0, TAU); hg.fill(); }
  hg.restore();
  g.save(); try { g.filter = 'blur(' + (K / 146 * 1.2).toFixed(2) + 'px)'; } catch (e) { } g.globalAlpha = .55; g.drawImage(ch, 0, 0); g.filter = 'none'; g.globalAlpha = 1; g.drawImage(ch, 0, 0); g.restore();
  g.save(); g.globalAlpha = .1; g.fillStyle = '#000'; g.beginPath(); g.moveTo(hx(.78), hz(.04)); g.lineTo(hx(.84), hz(.04)); g.lineTo(hx(.84), hz(.56)); g.lineTo(hx(.04), hz(1.17)); g.lineTo(hx(0), hz(1.1)); g.lineTo(hx(.8), hz(.5)); g.fill(); g.restore();
}
function clayBuildHome() {
  if (clayHome) { clayHome.tex.needsUpdate = true; return; }
  const W = 2048, tex = canvasTex(W, W, g => clayDrawHome(g, W)); tex.anisotropy = 16;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(CLAY.HOME, CLAY.HOME), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, .03, 1.5); m.renderOrder = 2; scene.add(m); clayHome = { m, tex };
}

/* ---------- 投手丘：貼上紅土花紋、加投手板 ---------- */
let clayRubber = null;
function clayBuildMound() {
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = CLC.mound; g.fillRect(0, 0, w, h);
    clayMottle(g, w, 401, { dark: [66, 32, 20], light: [210, 140, 100], amp: .42, c1: 2, c2: 7, c3: 28 });
    const rg = g.createRadialGradient(w / 2, h / 2, w * .1, w / 2, h / 2, w * .5); rg.addColorStop(0, 'rgba(96,48,32,.28)'); rg.addColorStop(.7, 'rgba(96,48,32,0)'); rg.addColorStop(1, 'rgba(210,150,110,.08)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
    claySpeckle(g, w, 2400, 9, ['#4a2214', '#e8a878'], .1, .22, .8, 2);
  });
  t.anisotropy = 16; moundMesh.material.map = t; moundMesh.material.color.setHex(0xffffff); moundMesh.material.needsUpdate = true;
  if (!clayRubber) { clayRubber = new THREE.Mesh(new THREE.BoxGeometry(1.2, .05, .22), new THREE.MeshLambertMaterial({ color: 0xf6f3ea })); clayRubber.position.set(MOUND.x, .405, MOUND.z); scene.add(clayRubber); }
}

/* ---------- 外野警戒區：牆前紅土帶 ---------- */
function clayBuildTrack() {
  const t = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#b05a34'; g.fillRect(0, 0, w, h);
    clayMottle(g, w, 501, { dark: [112, 52, 30], light: [232, 152, 104], amp: .5, c1: 10, c2: 40, c3: 120, w1: 1, w2: 1, w3: .8 });
    claySpeckle(g, w, 3600, 15, ['#5a2a18', '#f0b888'], .12, .3, .8, 2);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(60,28,16,.22)'); gr.addColorStop(.12, 'rgba(60,28,16,0)'); gr.addColorStop(.9, 'rgba(60,28,16,0)'); gr.addColorStop(1, 'rgba(40,18,10,.45)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, true);
  t.anisotropy = 16; track.material.map = t; track.material.color.setHex(0xffffff); track.material.needsUpdate = true; track.visible = true;
}

/* =========================================================
   C. 草皮：割草紋＋自然色差（取代棋盤格）
   ========================================================= */
function clayRedrawGrass() {
  const c = grassTex.image; c.width = c.height = 1024; const g = c.getContext('2d'), w = 1024, r = clayRand(7);
  g.fillStyle = '#3f8636'; g.fillRect(0, 0, w, w);
  const bands = 4, bh = w / bands; for (let i = 0; i < bands; i++) { g.fillStyle = i % 2 ? '#3a7d32' : '#4a9540'; g.fillRect(0, i * bh, w, bh); }
  clayMottle(g, w, 601, { dark: [30, 82, 30], light: [118, 176, 78], amp: .26, c1: 3, c2: 9, c3: 36, w1: 1.2, w2: 1, w3: .7 });
  g.lineCap = 'round'; for (let i = 0; i < 16000; i++) { const x = r() * w, y = r() * w, L = 3 + r() * 7, a = -Math.PI / 2 + (r() - .5) * .9; g.strokeStyle = r() < .5 ? 'rgba(34,92,34,.2)' : 'rgba(150,204,98,.16)'; g.lineWidth = .8 + r() * .8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
  grassTex.needsUpdate = true;
}

/* =========================================================
   D. 牆面（深藍底＋贊助看板）、看台（藍色座椅＋觀眾）、天空
   ========================================================= */
function clayRedrawWall() {
  const c = adTex.image, g = c.getContext('2d'), W = c.width, Hh = c.height, fh = WALL_H * .78, Y = m => Hh * (1 - m / fh);
  g.clearRect(0, 0, W, Hh);
  const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#22397a'); bg.addColorStop(1, '#0f1d46'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(255,255,255,.06)'; for (let x = 0; x < W; x += 24) g.fillRect(x, 0, 2, Hh);
  const n = AD_TEXT.length, cw = W / n, top = Y(fh - .42), bot = Y(1.14);
  for (let i = 0; i < n; i++) { if (typeof koAdCell === 'function') koAdCell(g, i * cw + 8, top, cw - 16, bot - top, AD_TEXT[i]); else drawAdCell(g, i * cw + 8, top, cw - 16, bot - top, AD_TEXT[i]); }
  g.fillStyle = 'rgba(244,246,250,.9)'; g.fillRect(0, Y(fh - .16), W, Hh * .018);
  adTex.needsUpdate = true;
}
function clayRedrawStand() {
  const c = crowdTex.image; c.width = 2048; c.height = 1024; const g = c.getContext('2d'), W = c.width, Hh = c.height, r = clayRand(21);
  g.fillStyle = '#19244a'; g.fillRect(0, 0, W, Hh);
  const jer = ['#d9342b', '#2f6fd8', '#f3f3ee', '#f2c230', '#2c9a5a', '#e8812a', '#8a4ad0', '#58c6ea', '#25272c', '#f08fb0', '#c92a2a', '#c92a2a', '#2f6fd8', '#f3f3ee', '#f3f3ee', '#f2c230'],
    skin = ['#f2cba3', '#e8b98c', '#d9a074', '#c68a5c', '#f6d9bc'], hair = ['#15110e', '#2a1c14', '#4a3222', '#15110e', '#6b6b6b', '#1c1c24'];
  const rowH = 30, rows = Math.ceil(Hh / rowH) + 1, pitch = 15;
  for (let k = 0; k < rows; k++) {
    const y0 = k * rowH, baseY = y0 + rowH;
    g.fillStyle = k % 2 ? '#26356a' : '#202d5c'; g.fillRect(0, y0 + rowH - 9, W, 9); g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(0, y0 + rowH - 3, W, 3);
    const off = (k % 2) * (pitch / 2) + r() * 3;
    for (let x = -pitch; x < W + pitch; x += pitch) {
      if (r() < .05) continue;
      const px0 = x + off + (r() - .5) * 3, bw = 12 + r() * 3, bh = 13 + r() * 3, cy = baseY - 11, col = jer[(r() * jer.length) | 0], arm = r() < .09;
      g.fillStyle = col; g.beginPath(); g.moveTo(px0 - bw / 2, cy + bh * .55); g.quadraticCurveTo(px0 - bw / 2, cy - bh * .55, px0, cy - bh * .6); g.quadraticCurveTo(px0 + bw / 2, cy - bh * .55, px0 + bw / 2, cy + bh * .55); g.closePath(); g.fill();
      if (arm) { g.strokeStyle = col; g.lineWidth = 3.2; g.lineCap = 'round'; const sd = r() < .5 ? -1 : 1; g.beginPath(); g.moveTo(px0 + sd * bw * .42, cy - 2); g.lineTo(px0 + sd * (bw * .6 + 3), cy - bh * 1.15); g.stroke(); g.fillStyle = skin[(r() * 5) | 0]; g.beginPath(); g.arc(px0 + sd * (bw * .6 + 3), cy - bh * 1.2, 2.3, 0, TAU); g.fill(); }
      const hy = cy - bh * .62 - 4.2, hr = 4.6 + r() * .6; g.fillStyle = skin[(r() * skin.length) | 0]; g.beginPath(); g.arc(px0, hy, hr, 0, TAU); g.fill();
      const q = r();
      if (q < .42) { g.fillStyle = col; g.beginPath(); g.arc(px0, hy - 1, hr + .6, Math.PI, TAU); g.fill(); g.fillRect(px0 - hr - .6, hy - 1.4, hr * 2 + 1.2, 1.8); g.fillRect(px0 - 1, hy - 1.4, hr + 3.5, 1.8); }
      else if (q < .95) { g.fillStyle = hair[(r() * hair.length) | 0]; g.beginPath(); g.arc(px0, hy - .8, hr + .3, Math.PI * 1.02, TAU * .995); g.fill(); }
    }
  }
  g.fillStyle = 'rgba(150,160,184,.9)'; for (let x = 240; x < W; x += 680) { g.fillRect(x, 0, 40, Hh); g.fillStyle = 'rgba(70,80,104,.9)'; g.fillRect(x + 34, 0, 6, Hh); g.fillStyle = 'rgba(150,160,184,.9)'; }
  const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.2)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(12,20,52,.30)'; g.fillRect(0, 0, W, Hh);
  crowdTex.needsUpdate = true;
}
let claySky = null;
function claySkyTex() {      // 晴朗的藍天：上方深藍、地平線偏白，點綴柔和白雲
  const W = 1024, Hh = 512, c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'), r = clayRand(13);
  const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#2f6fc4'); gr.addColorStop(.35, '#69a6e2'); gr.addColorStop(.72, '#b4d6f0'); gr.addColorStop(1, '#dcecf6'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 30; i++) { const x = r() * W, y = 30 + r() * 300, w = 90 + r() * 200, h = w * (.12 + r() * .1); g.save(); g.translate(x, y); g.scale(1, h / w); const rg = g.createRadialGradient(0, 0, 0, 0, 0, w); rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, w, 0, TAU); g.fill(); g.restore(); }
  const tx = new THREE.CanvasTexture(c); tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false; return tx;
}

/* =========================================================
   E. 套用：覆寫 13r 的重繪函式、重畫一次、包裝光線與球場切換
   ========================================================= */
function clayApplyLook() {
  KOC.mound = 0x8c4b33; KOC.wallTop = 0x16244a; KOC.fog = 0xd2e4f2;
  clayRedrawGrass(); clayRedrawSkin(); clayRedrawStand(); clayRedrawWall();
  clayBuildHome(); clayBuildMound(); clayBuildTrack();
  wallTop.material.color.setHex(KOC.wallTop); wallPad.material.color.setHex(0x0b1634); dark.material.color.setHex(0x233a2a);
  const an = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8; for (const tx of [grassTex, skinTex]) tx.anisotropy = Math.min(16, an);
  if (typeof koFence !== 'undefined' && koFence) koFence.material.opacity = .3;
}
function clayLight() {      // 接在 13r 的陰天光線之後：改成明亮暖色日光＋藍天（保留原本雨天變暗的幅度）
  const dk = clamp((.92 - hemi.intensity) / .5, 0, .8);
  if (!claySky) claySky = claySkyTex();
  scene.background = claySky; scene.fog.color.setHex(0xd2e4f2).multiplyScalar(1 - dk * .75);
  hemi.color.setHex(0xfff6ec); hemi.groundColor.setHex(0x8a6450); hemi.intensity = .84 - dk * .45;
  sun.color.setHex(0xfff0da); sun.intensity = .44 - dk * .22; sun.position.set(-30, 80, 50);
  if (typeof koMtn !== 'undefined' && koMtn) koMtn.visible = false;
  track.visible = true;
}
if (CLAY.on && typeof KO !== 'undefined' && KO.on && typeof THREE !== 'undefined' && typeof scene !== 'undefined' && typeof koSceneInit === 'function') {
  koRedrawSkin = clayRedrawSkin; koRedrawGrass = clayRedrawGrass; koRedrawWall = clayRedrawWall; koRedrawStand = clayRedrawStand;
  clayApplyLook();
  const _applyLighting = applyLighting;
  applyLighting = function () {
    const r = _applyLighting.apply(this, arguments);
    try { if (!(typeof CAMC !== 'undefined' && CAMC.mode === 'title')) clayLight(); } catch (e) { console.error(e); }
    return r;
  };
  const _applyPark = applyPark;
  applyPark = function () { const r = _applyPark.apply(this, arguments); try { track.visible = true; } catch (e) { console.error(e); } return r; };
  try { if (!(CAMC.mode === 'title')) applyLighting(); } catch (e) { console.error(e); }
}
