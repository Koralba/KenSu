/* ===== 13r-koshien-skin.js ｜ 甲子園風外觀（參考圖 S__9216004.jpg）=====
   只改「外觀」：球場配色／陰天天空／甲子園看板／Q 版球員光澤與大頭／計分板／隊伍名單／壘包菱形／資料面板／擊球框。
   不動任何比賽邏輯、能力值、判定；全部靠包裝既有函式或重畫貼圖完成。
   關閉方式：把檔案開頭 KO.on 改成 false（或不載入此檔與 css/09-koshien.css）即可還原。
   載入位置：13g 之後、14 之前（見 FILE_MAP.md 規則）。 */
'use strict';
const KO = { on: true };

/* =========================================================
   A. 3D 場景：配色、天空、看板（只在有 three.js 的環境執行）
   ========================================================= */
const KOC = {      // 色票（取自參考圖）
  dirt: '#34302d', dirt2: '#403b37', dirtDk: '#262321', grass: '#7e9f4e', grass2: '#8aa956', wall: '#17402a', wallTop: 0x153a26,
  stand: '#0f2a1f', fog: 0xaab6bd, mound: 0x3d3834
};
function koRand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function koRedrawGrass() {
  const c = grassTex.image; c.width = c.height = 512; const g = c.getContext('2d'), w = c.width, h = c.height, r = koRand(7);
  g.fillStyle = KOC.grass; g.fillRect(0, 0, w, h); g.fillStyle = KOC.grass2; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  g.globalAlpha = .07; for (let i = 0; i < 5600; i++) { g.fillStyle = r() < .5 ? '#fff' : '#000'; g.fillRect(r() * w, r() * h, 2, 2); }
  g.globalAlpha = .12; for (let i = 0; i < 3400; i++) { g.fillStyle = r() < .5 ? '#5f8238' : '#a6c46e'; g.fillRect(r() * w, r() * h, 1.2, 5 + r() * 5); }
  g.globalAlpha = 1; grassTex.needsUpdate = true;
}
function koRedrawSkin() {      // 內野全黑土（參考圖：整個內野是近黑的炭灰色土）
  const c = skinTex.image, g = c.getContext('2d'), r = koRand(11); g.clearRect(0, 0, SK.N, SK.N);
  const S = v => v / SK.S * SK.N;
  g.fillStyle = KOC.dirt;
  g.beginPath(); g.arc(px(0), pz(-16), S(23.5), 0, TAU); g.fill(); g.beginPath(); g.arc(px(0), pz(1.5), S(6.8), 0, TAU); g.fill();
  const v = [[0, -3.4 - 2.5], [H - 2.8, -H], [0, -2 * H + 2.8], [-H + 2.8, -H]];      // 原本的草皮菱形也鋪成土（同色，略帶深淺）
  g.fillStyle = KOC.dirt; g.beginPath(); v.forEach((p, i) => i ? g.lineTo(px(p[0]), pz(p[1])) : g.moveTo(px(p[0]), pz(p[1]))); g.closePath(); g.fill();
  g.fillStyle = KOC.dirt2; for (let i = 0; i < 4; i++) { const a = BASES[i], b = BASES[(i + 1) % 4]; g.strokeStyle = KOC.dirt2; g.lineWidth = S(2.2); g.lineCap = 'round'; g.beginPath(); g.moveTo(px(a.x), pz(a.z)); g.lineTo(px(b.x), pz(b.z)); g.stroke(); }
  g.fillStyle = KOC.dirt2; for (const b of BASES.slice(1)) { g.beginPath(); g.arc(px(b.x), pz(b.z), S(3.4), 0, TAU); g.fill(); }
  g.beginPath(); g.arc(px(0), pz(-15), S(3.6), 0, TAU); g.fill();
  g.save(); g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 7000; i++) { g.globalAlpha = .08 + r() * .12; g.fillStyle = r() < .5 ? '#1b1816' : '#5a534d'; const q = .5 + r() * 1.5; g.fillRect(r() * SK.N, r() * SK.N, q, q); }
  g.restore(); g.globalAlpha = 1;
  g.fillStyle = '#e9e9e9'; g.fillRect(px(-.6), pz(-15.15), S(1.2), S(.3));
  g.strokeStyle = '#f2f2f2'; g.lineWidth = S(.16); for (const s of [-1, 1]) g.strokeRect(px(s * 1.9 - .9), pz(-1.6), S(1.8), S(3.8)); g.strokeRect(px(-1.6), pz(2.6), S(3.2), S(2));
  g.fillStyle = '#f4f4f4'; g.beginPath(); g.moveTo(px(-.8), pz(0)); g.lineTo(px(.8), pz(0)); g.lineTo(px(.8), pz(.5)); g.lineTo(px(0), pz(1.1)); g.lineTo(px(-.8), pz(.5)); g.fill();
  skinTex.needsUpdate = true;
}
function koRedrawStand() {      // 看台：深綠混凝土階梯＋整排坐滿的 Q 版觀眾（由上往下畫，下排蓋住上排；隊色球衣、帽子、揮舞的手、小旗、加油牌）
  const c = crowdTex.image; c.width = 2048; c.height = 1024;      // 加大解析度（原 1024×256 一個人只有 1～2 像素）
  const g = c.getContext('2d'), W = c.width, Hh = c.height, r = koRand(21);
  g.fillStyle = '#0c2218'; g.fillRect(0, 0, W, Hh);
  const jer = ['#d9342b', '#2f6fd8', '#f3f3ee', '#f2c230', '#2c9a5a', '#e8812a', '#8a4ad0', '#58c6ea', '#25272c', '#f08fb0', '#c92a2a', '#c92a2a', '#2f6fd8', '#f3f3ee'],
    skin = ['#f2cba3', '#e8b98c', '#d9a074', '#c68a5c', '#f6d9bc'], hair = ['#15110e', '#2a1c14', '#4a3222', '#15110e', '#6b6b6b', '#1c1c24'];
  const rowH = 30, rows = Math.ceil(Hh / rowH) + 1, pitch = 15;
  for (let k = 0; k < rows; k++) {      // k=0 最上排
    const y0 = k * rowH, baseY = y0 + rowH;
    g.fillStyle = k % 2 ? '#14352a' : '#103026'; g.fillRect(0, y0 + rowH - 9, W, 9);      // 這一排的階梯面
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y0 + rowH - 3, W, 3);
    const off = (k % 2) * (pitch / 2) + r() * 3;
    for (let x = -pitch; x < W + pitch; x += pitch) {
      if (r() < .05) continue;      // 偶爾一個空位
      const px = x + off + (r() - .5) * 3, bw = 12 + r() * 3, bh = 13 + r() * 3, cy = baseY - 11;
      const col = jer[(r() * jer.length) | 0], arm = r() < .09, flag = r() < .015;
      g.fillStyle = col; g.beginPath(); g.moveTo(px - bw / 2, cy + bh * .55); g.quadraticCurveTo(px - bw / 2, cy - bh * .55, px, cy - bh * .6); g.quadraticCurveTo(px + bw / 2, cy - bh * .55, px + bw / 2, cy + bh * .55); g.closePath(); g.fill();
      if (arm) { g.strokeStyle = col; g.lineWidth = 3.2; g.lineCap = 'round'; const sd = r() < .5 ? -1 : 1; g.beginPath(); g.moveTo(px + sd * bw * .42, cy - 2); g.lineTo(px + sd * (bw * .6 + 3), cy - bh * 1.15); g.stroke(); g.fillStyle = skin[(r() * 5) | 0]; g.beginPath(); g.arc(px + sd * (bw * .6 + 3), cy - bh * 1.2, 2.3, 0, TAU); g.fill(); }
      if (flag) { const fx = px + 5; g.fillStyle = '#ddd'; g.fillRect(fx, cy - bh * 2.3, 1.6, bh * 1.8); g.fillStyle = jer[(r() * jer.length) | 0]; g.fillRect(fx + 1.6, cy - bh * 2.3, 8, 5.5); }
      const hy = cy - bh * .62 - 4.2, hr = 4.6 + r() * .6;
      g.fillStyle = skin[(r() * skin.length) | 0]; g.beginPath(); g.arc(px, hy, hr, 0, TAU); g.fill();
      const q = r();
      if (q < .42) { g.fillStyle = col; g.beginPath(); g.arc(px, hy - 1, hr + .6, Math.PI, TAU); g.fill(); g.fillRect(px - hr - .6, hy - 1.4, hr * 2 + 1.2, 1.8); g.fillRect(px - 1, hy - 1.4, hr + 3.5, 1.8); }      // 球帽（隊色）
      else if (q < .95) { g.fillStyle = hair[(r() * hair.length) | 0]; g.beginPath(); g.arc(px, hy - .8, hr + .3, Math.PI * 1.02, TAU * .995); g.fill(); }
    }
    if (k % 5 === 2) {      // 偶爾一長條加油布條／毛巾牆
      const bx = r() * (W - 360), bw2 = 160 + r() * 200; g.fillStyle = jer[(r() * 8) | 0]; g.globalAlpha = .9; g.fillRect(bx, y0 + 6, bw2, 12); g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,.75)'; for (let t = 0; t < bw2 - 16; t += 22) g.fillRect(bx + 8 + t, y0 + 9, 10, 6);
    }
  }
  g.fillStyle = 'rgba(150,158,150,.92)'; for (let x = 240; x < W; x += 680) { g.fillRect(x, 0, 40, Hh); g.fillStyle = 'rgba(80,88,82,.9)'; g.fillRect(x + 34, 0, 6, Hh); g.fillStyle = 'rgba(150,158,150,.92)'; }      // 灰色樑柱
  const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.22)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(8,34,22,.58)'; g.fillRect(0, 0, W, Hh);      // 整體壓成深綠（參考圖看台近乎深綠色塊，觀眾只隱約可見）
  crowdTex.needsUpdate = true;
}
function koSkyTex() {      // 陰天：多層雜訊（fbm）雲，上方深灰藍、帶狀雲層、中間偶有淡藍缺口、地平線泛白（對照參考圖）
  const W = 2048, Hh = 1024, w = 640, h = 320, r = koRand(5), L = new Float32Array(65536); for (let i = 0; i < L.length; i++) L[i] = r();
  const sm = t => t * t * (3 - 2 * t), cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi), a = L[((yi & 255) << 8) | (xi & 255)], b = L[((yi & 255) << 8) | ((xi + 1) & 255)], c = L[(((yi + 1) & 255) << 8) | (xi & 255)], d = L[(((yi + 1) & 255) << 8) | ((xi + 1) & 255)]; return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  const fbm = (x, y) => { let s = 0, a = .5, f = 1; for (let o = 0; o < 6; o++) { s += a * vn(x * f, y * f); f *= 2.03; a *= .5; } return s; };
  const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#74869a'); gr.addColorStop(.38, '#9db0be'); gr.addColorStop(.72, '#c6d3da'); gr.addColorStop(1, '#e4e9ea'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  const gp = g.createRadialGradient(W * .5, Hh * .4, 0, W * .5, Hh * .4, W * .42); gp.addColorStop(0, 'rgba(150,192,222,.34)'); gp.addColorStop(1, 'rgba(150,192,222,0)'); g.fillStyle = gp; g.fillRect(0, 0, W, Hh);      // 中央偏上的淡藍天色
  const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d'), im = tg.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ny = y / h; let u = x / w * 5.2, v = ny * 4.4; const wp = fbm(u * .55 + 9, v * .55 + 3); u += wp * 1.5; v += wp * .6;      // 領域扭曲 → 雲邊緣不規則
    const den = fbm(u * .9, v * 2.1), cover = sm(cl01((den - .40) / .30)), lit = fbm(u * 1.9 + 4, v * 3.8 + 7);
    const k = cl01(lit * 1.5 - .22 + (1 - ny) * .12), a = cover * (1 - .4 * ny * ny) * .93;      // 越靠地平線雲越淡
    const i = (y * w + x) * 4; d[i] = 92 + (240 - 92) * k; d[i + 1] = 110 + (244 - 110) * k; d[i + 2] = 128 + (246 - 128) * k; d[i + 3] = a * 255;
  }
  tg.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(t, 0, 0, W, Hh);
  const ev = g.createRadialGradient(W / 2, Hh * .5, Hh * .35, W / 2, Hh * .5, W * .72); ev.addColorStop(0, 'rgba(50,66,82,0)'); ev.addColorStop(1, 'rgba(50,66,82,.3)'); g.fillStyle = ev; g.fillRect(0, 0, W, Hh);      // 四角壓暗
  const tx = new THREE.CanvasTexture(c); tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false; return tx;
}
/* ===== 看台尺寸／環形幾何 ===== */
const KOS = { D: 19, H: 10.5 };      // 看台水平深度／高度（公尺）。原本 34／24 太高，會把整片天空蓋住；縮小後上方才看得到雲層
function koRing(r0f, y0, r1f, y1, seg, uvLen) {      // 同 ringGeom，但貼圖週期調成「繞一圈剛好整數次」：中外野（phi=0）不會出現接縫、廣告被切一半
  let L = 0, prev = null;
  for (let i = 0; i <= seg; i++) { const a = i / seg * TAU, R = r0f(i / seg * 360), p = [R * Math.sin(a), -R * Math.cos(a)]; if (prev) L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  return ringGeom(r0f, y0, r1f, y1, seg, L / Math.max(1, Math.round(L / uvLen)));
}
function koApplyShape() {      // 依目前球場（牆高／牆形）重建看台與牆面，並重畫牆面廣告
  stand.geometry.dispose(); stand.geometry = koRing(p => wallRadius(p), WALL_H, p => wallRadius(p) + KOS.D, WALL_H + KOS.H, 220, 2 * Math.hypot(KOS.D, KOS.H));      // 貼圖 2:1，週期 = 2 × 斜面長 → 觀眾不會被拉長
  const fh = WALL_H * .78; wall.geometry.dispose(); wall.geometry = koRing(wallRadius, 0, wallRadius, fh, 220, adTex.image.width / adTex.image.height * fh);      // 貼圖每公尺像素：橫＝直 → 文字與圖樣比例正確
  koRedrawWall();
}

/* ===== 牆面：贊助商廣告「貼」在全壘打牆上（比例與牆面實際尺寸一致，不拉伸、不被護墊遮住）===== */
function koAdCell(g, x, y, w, h, ad) {
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, ad[2]); gr.addColorStop(1, ad[3]);
  g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(x + 2, y + 3, w, h);      // 板子在牆上的投影
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x, y, w, h * .05); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, y + h * .95, w, h * .05);
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = Math.max(2, h * .022); g.strokeRect(x + g.lineWidth, y + g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
  g.fillStyle = ad[1]; g.globalAlpha = .95; adLogo(g, ad[5], x + w / 2, y + h * .27, h * .16); g.globalAlpha = 1;
  const fit = (txt, wt, fs, fam, maxw) => { g.font = wt + ' ' + fs + 'px ' + fam; const mw = g.measureText(txt).width; if (mw > maxw) { fs *= maxw / mw; g.font = wt + ' ' + fs + 'px ' + fam; } };      // 太寬就整體縮小字級（不是橫向壓扁）
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ad[1];
  fit(ad[0], 900, h * .33, AD_FONT, w - h * .2); g.fillText(ad[0], x + w / 2, y + h * .6);
  g.globalAlpha = .88; fit(ad[4], 700, h * .1, 'Orbitron,' + AD_FONT, w - h * .24); g.fillText(ad[4], x + w / 2, y + h * .86); g.globalAlpha = 1;
}
function koRedrawWall() {
  const c = adTex.image, g = c.getContext('2d'), W = c.width, Hh = c.height, fh = WALL_H * .78, Y = m => Hh * (1 - m / fh);      // Y(m)：離地 m 公尺在貼圖上的 y
  g.clearRect(0, 0, W, Hh);
  const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#1d4d33'); bg.addColorStop(1, '#0f2f1e'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < W; x += 24) g.fillRect(x, 0, 2, Hh);      // 牆面墊板接縫
  const n = AD_TEXT.length, cw = W / n, top = Y(fh - .42), bot = Y(1.14);      // 護墊高 1 公尺：廣告只畫在護墊以上，標語不會被蓋住
  for (let i = 0; i < n; i++) koAdCell(g, i * cw + 8, top, cw - 16, bot - top, AD_TEXT[i]);
  g.fillStyle = 'rgba(240,244,240,.85)'; g.fillRect(0, Y(fh - .16), W, Hh * .018);      // 牆頂白線
  adTex.needsUpdate = true;
}

/* ===== 後方看板：中央電子計分板＋時鐘＋球場名稱招牌＋兩側 PLAY BALL／BASEBALL 橫幅 =====
   全部做成「與看台同圓心的垂直圓柱面板」：左右邊垂直、從本壘看上下邊是直線；不再逐頂點推擠，所以不會彎曲扭曲 */
const KOD = { group: null, board: null, frame: null, sign: null, signFrame: null, clock: null, post: null, plates: [], boardTex: null, signTex: null, boardKey: '', signName: '', venue: '', bg: null };
const KO_EN = { '洲際棒球場': 'INTERCONTINENTAL STADIUM', '亞太主球場': 'ASIA PACIFIC STADIUM', '桃園棒球場': 'TAOYUAN STADIUM', '新莊棒球場': 'XINZHUANG STADIUM', '天母棒球場': 'TIANMU STADIUM', '澄清湖棒球場': 'CHENGCHING LAKE STADIUM', '台北大巨蛋': 'TAIPEI DOME', '嘉義市立棒球場': 'CHIAYI CITY STADIUM', '斗六棒球場': 'DOULIU STADIUM', '花蓮縣立棒球場': 'HUALIEN STADIUM', '台東縣立棒球場': 'TAITUNG STADIUM' };
function koBandGeom(phi, hb, wM, hM, lean, rOff, hs) {      // phi：中心方位；hb：板底離牆頂高度；lean：向後傾角（弧度）；hs：以該高度的看台斜面半徑為基準（同一組疊放的板子共用，才會上下對齊在同一條後傾軸線上）
  const t = Math.tan(lean), R = wallRadius(phi) + KOS.D * (hs === undefined ? hb : hs) / KOS.H + rOff + (hs === undefined ? 0 : (hb - hs) * t), nx = 28, pos = [], uv = [], idx = [], a0 = phi * Math.PI / 180;
  for (let j = 0; j <= 1; j++) { const y = WALL_H + hb + hM * j, r = R + hM * j * t; for (let i = 0; i <= nx; i++) { const u = i / nx, a = a0 + (u - .5) * wM / R; pos.push(r * Math.sin(a), y, -r * Math.cos(a)); uv.push(u, j); } }
  for (let i = 0; i < nx; i++) idx.push(i, i + 1, nx + 1 + i, i + 1, nx + 2 + i, nx + 1 + i);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
function koSpaced(g, txt, cx, cy, gap) {      // 字距拉開的置中文字（模擬 KOSHIEN 那種橫排字樣）
  const ws = [...txt].map(ch => g.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1); let x = cx - tot / 2; g.textAlign = 'left';
  [...txt].forEach((ch, i) => { g.fillText(ch, x, cy); x += ws[i] + gap; });
}
function koFitFont(g, txt, wt, fs, fam, maxw) { g.font = wt + ' ' + fs + 'px ' + fam; const mw = g.measureText(txt).width; if (mw > maxw) { fs *= maxw / mw; g.font = wt + ' ' + fs + 'px ' + fam; } return fs; }
function koPlateTex(txt) {      // 參考圖的淺綠底橫幅
  return canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#dfe9b8'); gr.addColorStop(1, '#bccd8e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#143824'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#17402a'; g.textBaseline = 'middle';
    koFitFont(g, txt, 900, h * .56, "Orbitron,'Noto Sans TC',Impact,sans-serif", w * .8); koSpaced(g, txt, w / 2, h / 2 + 4, 14);
  });
}
function koClockTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0b0d0c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ececec'; g.lineWidth = 9; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.stroke();
    g.lineCap = 'round'; g.strokeStyle = '#ececec'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r0 = i % 3 ? 92 : 82; g.lineWidth = i % 3 ? 4 : 7; g.beginPath(); g.moveTo(128 + r0 * Math.sin(a), 128 - r0 * Math.cos(a)); g.lineTo(128 + 100 * Math.sin(a), 128 - 100 * Math.cos(a)); g.stroke(); }
    g.lineWidth = 10; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 40, 128 - 38); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 30, 128 - 66); g.stroke();
  });
}
function koDrawSign(name) {      // 招牌：白底深綠字，顯示「目前球場名稱」（換球場時重畫）
  if (!KOD.signTex) return; name = String(name || ''); if (name === KOD.signName) return; KOD.signName = name;
  const c = KOD.signTex.image, g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = '#eef2ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#17402a'; g.lineWidth = 7; g.strokeRect(8, 8, w - 16, h - 16); g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
  g.fillStyle = '#17402a'; g.textBaseline = 'middle'; g.textAlign = 'center'; koFitFont(g, name, 900, h * .58, "'Noto Serif TC','Noto Sans TC',serif", w - 120); g.fillText(name, w / 2, h / 2 + 4);
  KOD.signTex.needsUpdate = true;
}
function koBuildDecor() {
  KOD.group = new THREE.Group();
  const bm = tex => new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), metal = () => new THREE.MeshBasicMaterial({ color: 0x2b3430, side: THREE.DoubleSide }), mk = (mat) => new THREE.Mesh(new THREE.BufferGeometry(), mat);
  KOD.boardTex = canvasTex(2048, 614, () => { }); KOD.board = mk(bm(KOD.boardTex)); KOD.frame = mk(metal());
  KOD.signTex = canvasTex(1024, 176, () => { }); KOD.sign = mk(bm(KOD.signTex)); KOD.signFrame = mk(metal());
  KOD.clock = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), bm(koClockTex())); KOD.post = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 1, 8), metal());
  KOD.plates = ['PLAY BALL', 'BASEBALL', 'BASEBALL', 'PLAY BALL'].map(t => mk(bm(koPlateTex(t))));
  KOD.group.add(KOD.frame, KOD.board, KOD.signFrame, KOD.sign, KOD.clock, KOD.post, ...KOD.plates); scene.add(KOD.group);
  for (const m of KOD.group.children) if (m.material) { m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; m.material.polygonOffsetUnits = -1; }
}
function koPlaceDecor(parkName) {      // 依目前球場外野牆形狀擺放（applyPark 之後呼叫）
  const L = .16, t = Math.tan(L), set = (m, geo) => { m.geometry.dispose(); m.geometry = geo; }, bh = Math.max(1.0, KOS.H - 11.0) + 1.6, ro = -1.4, BW = 28.5, BH = 8.55;
  set(KOD.board, koBandGeom(0, bh, BW, BH, L, ro)); set(KOD.frame, koBandGeom(0, bh - .55, BW + 1.2, BH + 1.1, L, ro + .3, bh));      // 計分板＋金屬外框（框在板後方 0.3 公尺）
  const sb = bh + BH + .6;      // 招牌：疊在計分板正上方，同一條後傾軸線（hs=bh），不會被板子擋住
  set(KOD.sign, koBandGeom(0, sb, 14, 2.5, L, ro, bh)); set(KOD.signFrame, koBandGeom(0, sb - .25, 14.6, 3.0, L, ro + .3, bh));
  [-30, -18, 18, 30].forEach((ph, i) => set(KOD.plates[i], koBandGeom(ph, KOS.H - 4.2, 10.5, 2.6, L, .8)));
  const hc = sb + 2.75 + 2.3, rc = wallRadius(0) + KOS.D * bh / KOS.H + ro + (hc - bh) * t, yc = WALL_H + hc, y0 = WALL_H + sb + 2.75;      // 時鐘立在招牌頂上，背景是天空
  KOD.clock.position.set(0, yc, -rc); KOD.clock.rotation.set(-L, 0, 0); KOD.post.position.set(0, (y0 + yc - 1.9) / 2, -(rc - (yc - y0) * t / 2)); KOD.post.scale.y = Math.max(.1, yc - 1.9 - y0);
  KOD.boardKey = ''; KOD.signName = ''; koDrawSign(parkName || (typeof G !== 'undefined' && G.wx && G.wx.venue) || '');
}
function koLedColor(hex) {      // 隊色太暗在黑底 LED 上看不清楚：往白色混合到夠亮
  let m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#ffb020'; const v = parseInt(m[1], 16); let R = v >> 16, Gc = (v >> 8) & 255, B = v & 255, lum = (.299 * R + .587 * Gc + .114 * B) / 255;
  if (lum < .55) { const k = (.62 - lum) / (1 - lum); R += (255 - R) * k; Gc += (255 - Gc) * k; B += (255 - B) * k; } return 'rgb(' + (R | 0) + ',' + (Gc | 0) + ',' + (B | 0) + ')';
}
function koLed(g, txt, x, cy, size, col, align, maxw, fam) {      // 發光的電子字：同色柔光 + 實心字
  txt = String(txt == null ? '' : txt); if (!txt) return; fam = fam || "Orbitron,'Noto Sans TC','Microsoft JhengHei',sans-serif";
  g.save(); g.textBaseline = 'middle'; g.textAlign = align || 'center'; koFitFont(g, txt, 800, size, fam, maxw || 9999); g.fillStyle = col;
  g.shadowColor = col; g.shadowBlur = size * .34; g.globalAlpha = .75; g.fillText(txt, x, cy); g.shadowBlur = size * .1; g.globalAlpha = 1; g.fillText(txt, x, cy); g.restore();
}
function koDrawBoard() {      // 電子計分板：球場英文名稱 ＋ 逐局比分表（隊色 LED）＋ 局數／好壞球／出局燈
  if (!KOD.board || typeof G === 'undefined' || !G.teams || !G.teams[0] || !G.teams[1]) return;
  const venue = (G.wx && G.wx.venue) || ''; if (venue !== KOD.signName) koDrawSign(venue);
  const key = JSON.stringify([G.line, G.score, G.hits, G.errs, G.inning, G.half, G.innings, G.strikes, G.balls, G.outs, venue, G.teams.map(t => t && [t.name, t.short, t.c1])]);
  if (key === KOD.boardKey) return; KOD.boardKey = key;
  const c = KOD.boardTex.image, g = c.getContext('2d'), W = c.width, Hh = c.height, T = G.teams, nm = s => (T[s] ? (T[s].name || T[s].short || '') : '');
  if (!KOD.bg) {      // 底圖（只畫一次）：黑色面板、灰色金屬外框、LED 方格
    const b = document.createElement('canvas'); b.width = W; b.height = Hh; const q = b.getContext('2d');
    q.fillStyle = '#060908'; q.fillRect(0, 0, W, Hh); const fr = q.createLinearGradient(0, 0, 0, Hh); fr.addColorStop(0, '#a6aea8'); fr.addColorStop(1, '#59625b');
    q.strokeStyle = fr; q.lineWidth = 26; q.strokeRect(13, 13, W - 26, Hh - 26); q.strokeStyle = '#1b211e'; q.lineWidth = 8; q.strokeRect(30, 30, W - 60, Hh - 60); KOD.bg = b;
    const p = document.createElement('canvas'); p.width = p.height = 5; const pg = p.getContext('2d'); pg.fillStyle = '#000'; pg.fillRect(0, 4, 5, 1); pg.fillRect(4, 0, 1, 5); KOD.dot = p;
  }
  g.clearRect(0, 0, W, Hh); g.drawImage(KOD.bg, 0, 0);
  const X0 = 56, X1 = W - 56, nameW = 560, n = clamp(Math.max(9, G.innings || 9, (G.line && G.line[0] || []).length, (G.line && G.line[1] || []).length), 9, 12), cw = (X1 - X0 - nameW) / (n + 3), cx = i => X0 + nameW + (i + .5) * cw;
  const en = KO_EN[venue] || String(venue).toUpperCase() || 'STADIUM';
  g.fillStyle = '#f2f4ee'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(255,255,255,.55)'; g.shadowBlur = 10; koFitFont(g, en, 900, 64, "'Noto Serif TC','Noto Serif',serif", W - 300); koSpaced(g, en, W / 2, 84, 16); g.shadowBlur = 0;      // 頂端：球場英文名稱（對照參考圖 KOSHIEN）
  const yH = [134, 206, 306, 406];
  g.strokeStyle = 'rgba(140,155,148,.6)'; g.lineWidth = 2; for (const y of yH) { g.beginPath(); g.moveTo(X0, y); g.lineTo(X1, y); g.stroke(); }
  g.beginPath(); g.moveTo(X0 + nameW, yH[0]); g.lineTo(X0 + nameW, yH[3]); g.moveTo(X0 + nameW + n * cw, yH[0]); g.lineTo(X0 + nameW + n * cw, yH[3]); g.stroke(); g.lineWidth = 1; g.globalAlpha = .5; for (let i = 1; i < n + 3; i++) { if (i === n) continue; g.beginPath(); g.moveTo(X0 + nameW + i * cw, yH[0]); g.lineTo(X0 + nameW + i * cw, yH[3]); g.stroke(); } g.globalAlpha = 1;
  if (G.inning >= 1 && G.inning <= n) { g.fillStyle = 'rgba(255,176,32,.17)'; g.fillRect(X0 + nameW + (G.inning - 1) * cw, yH[0], cw, yH[3] - yH[0]); }      // 目前局數整欄微亮
  koLed(g, 'TEAM', X0 + 24, 170, 46, '#58c6ea', 'left');
  for (let i = 1; i <= n; i++) koLed(g, i, cx(i - 1), 170, 48, G.inning === i ? '#ffffff' : '#58c6ea');
  ['R', 'H', 'E'].forEach((l, i) => koLed(g, l, cx(n + i), 170, 48, '#ff7a5a'));
  for (let s = 0; s < 2; s++) {
    const y = (yH[s + 1] + yH[s + 2]) / 2, bat = G.half === s;
    if (bat) { g.fillStyle = '#ffb020'; g.shadowColor = '#ffb020'; g.shadowBlur = 14; g.beginPath(); g.moveTo(X0 + 14, y - 18); g.lineTo(X0 + 40, y); g.lineTo(X0 + 14, y + 18); g.closePath(); g.fill(); g.shadowBlur = 0; }
    koLed(g, nm(s), X0 + 56, y, 64, koLedColor(T[s] && T[s].c1), 'left', nameW - 80, "'Noto Sans TC','Microsoft JhengHei',sans-serif");
    for (let i = 1; i <= n; i++) { const v = (G.line && G.line[s] || [])[i - 1]; if (v !== undefined) koLed(g, v, cx(i - 1), y, 70, '#ffd23a'); }
    koLed(g, G.score[s] || 0, cx(n), y, 78, '#ffffff'); koLed(g, (G.hits && G.hits[s]) || 0, cx(n + 1), y, 78, '#ffffff'); koLed(g, (G.errs || [0, 0])[s] || 0, cx(n + 2), y, 78, '#ffffff');
  }
  const fy = 492;      // 下方：局數、S／B／O 燈、聯盟標示
  if (G.inning) koLed(g, (G.half ? '▼ ' : '▲ ') + G.inning + (G.half ? ' 局下' : ' 局上'), X0 + 24, fy - 20, 74, '#ffb020', 'left', 640, "'Noto Sans TC','Microsoft JhengHei',sans-serif");
  koLed(g, 'CPBL 2027', X0 + 24, fy + 52, 40, '#58c6ea', 'left', 520);
  [['S', '#ffd23a', 2, G.strikes], ['B', '#4cf08a', 3, G.balls], ['O', '#ff4a3a', 2, G.outs]].forEach(([l, col, cnt, on], r) => {
    const y = fy - 54 + r * 56, x0 = W / 2 - 40; koLed(g, l, x0 - 40, y, 44, '#e8eee8');
    for (let k = 0; k < cnt; k++) { const lit = k < (on || 0); g.save(); g.fillStyle = lit ? col : 'rgba(80,92,86,.55)'; if (lit) { g.shadowColor = col; g.shadowBlur = 20; } g.beginPath(); g.arc(x0 + 18 + k * 56, y, 19, 0, TAU); g.fill(); g.restore(); }
  });
  koLed(g, venue, X1 - 24, fy - 12, 52, '#e8eee8', 'right', 640, "'Noto Serif TC','Noto Sans TC',serif");
  g.save(); g.globalAlpha = .34; g.fillStyle = g.createPattern(KOD.dot, 'repeat'); g.fillRect(34, 34, W - 68, Hh - 68); g.restore();      // LED 方格紋
  KOD.boardTex.needsUpdate = true;
}

let koSceneReady = false, koSky = null, koGlow = null, koFence = null;
function koFenceGeom() { return ringGeom(p => wallRadius(p) + KOS.D, WALL_H + KOS.H, p => wallRadius(p) + KOS.D, WALL_H + KOS.H + 2.4, 220, 8); }
function koSceneInit() {
  if (koSceneReady) return; koSceneReady = true;
  koRedrawGrass(); koRedrawSkin(); koRedrawStand();
  koApplyShape(); koBuildDecor(); koPlaceDecor(); koSky = koSkyTex();
  const an = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8;      // 斜視角貼圖更清晰（牆面廣告、看台、草皮）
  for (const tx of [adTex, crowdTex, grassTex, skinTex, KOD.boardTex, KOD.signTex]) if (tx) tx.anisotropy = Math.min(16, an);
  const ft = canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(205,212,208,.75)'; g.lineWidth = 3; for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); } g.lineWidth = 8; g.beginPath(); g.moveTo(0, 4); g.lineTo(w, 4); g.stroke(); }, true);
  koFence = new THREE.Mesh(koFenceGeom(), new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false })); scene.add(koFence);      // 看台頂端的鐵絲網
  const mt = canvasTex(1024, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,142,168,.95)'); gr.addColorStop(1, 'rgba(160,176,192,.9)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, h); g.lineTo(0, 190); g.bezierCurveTo(140, 150, 230, 70, 380, 60); g.bezierCurveTo(470, 54, 520, 120, 640, 120); g.bezierCurveTo(780, 120, 880, 170, w, 196); g.lineTo(w, h); g.closePath(); g.fill(); });
  const mtn = new THREE.Mesh(new THREE.PlaneGeometry(520, 130), new THREE.MeshBasicMaterial({ map: mt, transparent: true, fog: false, depthWrite: false })); mtn.position.set(120, 38, -470); scene.add(mtn);      // 遠方藍灰色山丘（參考圖中央偏右）
  wallTop.material.color.setHex(KOC.wallTop); wallPad.material.color.setHex(0x0e2a1a); moundMesh.material.color.setHex(KOC.mound);
  roof.visible = false; backWall.visible = false; track.visible = false; ROOFL.visible = false; LIGHT_TOWERS.forEach(t => t.g.visible = false);
  for (const o of POLES) o.m.material.color.setHex(0xf2e04a);
  /* 打擊區的青色光暈（參考圖：打者腳下發光的框） */
  const gt = canvasTex(256, 512, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, h * .55); rg.addColorStop(0, 'rgba(120,235,255,.0)'); rg.addColorStop(1, 'rgba(120,235,255,.55)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,250,255,.95)'; g.lineWidth = 7; g.shadowColor = '#5fe8ff'; g.shadowBlur = 22; g.beginPath(); g.moveTo(34, 60); g.lineTo(w - 34, 60); g.lineTo(w - 12, h - 60); g.lineTo(12, h - 60); g.closePath(); g.stroke();
    g.lineWidth = 3; g.shadowBlur = 8; g.beginPath(); g.moveTo(60, 120); g.lineTo(w - 60, 120); g.moveTo(40, h - 130); g.lineTo(w - 40, h - 130); g.stroke();
  });
  koGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.0), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  koGlow.rotation.x = -Math.PI / 2; koGlow.position.y = .07; koGlow.renderOrder = 2; koGlow.visible = false; scene.add(koGlow);
}
function koDrawVignette(c, W, Hh) { const g = c.createRadialGradient(W / 2, Hh * .5, Math.min(W, Hh) * .4, W / 2, Hh * .5, Math.hypot(W, Hh) * .62); g.addColorStop(0, 'rgba(20,30,40,0)'); g.addColorStop(1, 'rgba(20,30,40,.26)'); c.fillStyle = g; c.fillRect(0, 0, W, Hh); }

if (KO.on && typeof THREE !== 'undefined' && typeof scene !== 'undefined') {
  /* 天氣／光線：任何天氣與日夜都用參考圖的陰天色調（暴雨時仍會比較暗）；保留原本的雨、風、閃電等效果 */
  const _applyLighting = applyLighting;
  applyLighting = function () {
    koSceneInit();
    const bg = scene.background, tmp = new THREE.Color(); scene.background = tmp;
    try { _applyLighting.apply(this, arguments); } finally { scene.background = (bg && bg.isTexture) ? bg : koSky; }
    scene.background = koSky;
    const dk = clamp(1 - (hemi.intensity / .8), 0, .4);      // 原本的雨天會把光調暗，沿用那個暗度
    scene.fog.color.setHex(KOC.fog).multiplyScalar(1 - dk * .8); scene.fog.near = Math.max(scene.fog.near, 160); scene.fog.far = Math.max(scene.fog.far, 430);
    hemi.color.setHex(0xe4eaee); hemi.groundColor.setHex(0x4a5648); hemi.intensity = .92 - dk * .5;
    sun.color.setHex(0xf0f4f7); sun.intensity = .36 - dk * .2; sun.position.set(-30, 80, 50);
    flood1.intensity = flood2.intensity = flood3.intensity = 0;
    wallMat.color.setScalar(1); stand.material.color.setScalar(1 - dk * .4); dark.material.color.setHex(0x16281d);
    skyDome.visible = false;
  };
  const _updateNight = updateNight;
  updateNight = function (dt) {
    _updateNight.apply(this, arguments);
    skyDome.visible = false; moon.visible = false; stars.forEach(s => s.visible = false); lightPool.visible = false; CL.forEach(o => o.p.visible = false);
    LIGHT_TOWERS.forEach(x => { x.halo.visible = false; x.beam.visible = false; x.g.visible = false; }); ROOFL.visible = false; RIM.forEach(o => o.p.visible = false);
  };
  const _applyPark = applyPark;
  applyPark = function () { const r = _applyPark.apply(this, arguments); try { koSceneInit(); wallTop.material.color.setHex(KOC.wallTop); roof.visible = false; backWall.visible = false; track.visible = false; koApplyShape(); koPlaceDecor(arguments[0]); if (koFence) { koFence.geometry.dispose(); koFence.geometry = koFenceGeom(); } } catch (e) { console.error(e); } return r; };
  const _drawSky = drawSky;
  drawSky = function (c, W, Hh) { koDrawVignette(c, W, Hh); };      // 原本晴天的暖色陽光／彩虹光暈不適用於陰天畫面
  koSceneInit();
  scene.background = koSky;
}

/* =========================================================
   B. Q 版球員：頭更大、眼睛更亮、頭盔／帽子有光澤高光
   ========================================================= */
if (KO.on && typeof THREE !== 'undefined' && typeof makeChibi === 'function') {
  const HL = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .62, depthWrite: false }), HL_GEO = new THREE.SphereGeometry(1, 10, 8), EYE_HL = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const _makeChibi = makeChibi;
  makeChibi = function (o) {
    const rig = _makeChibi.apply(this, arguments);
    try {
      const head = rig.head; head.scale.multiplyScalar(1.18); head.scale.y *= .97; head.position.y += .08;      // 頭再大一點（參考圖頭身比約 1:1.3）
      for (const m of head.children) if (m.geometry === GEO.eye) {
        m.scale.x *= 1.22; m.scale.y *= 1.3; const hl = new THREE.Mesh(HL_GEO, EYE_HL); hl.scale.set(.02, .02, .012); hl.position.set(.022, .026, .05); m.add(hl);
      }
      const capm = head.children.find(c => c.material && c.material.shininess), hasHelm = !!(o && o.helmet);
      if (capm) { capm.material = capm.material.clone(); capm.material.specular && capm.material.specular.setHex(0xffffff); capm.material.shininess = 150; }
      if (!(o && (o.bare || (o.pl && o.pl.suit)))) {
        if (capm && capm.visible !== false) {
          const rr = hasHelm ? .575 : .56, d = new THREE.Vector3(-.38, .82, .3).normalize(), hl = new THREE.Mesh(HL_GEO, HL);
          hl.material = HL.clone(); hl.material.opacity = .4; hl.material.polygonOffset = true; hl.material.polygonOffsetFactor = -2;
          hl.scale.set(hasHelm ? .12 : .09, hasHelm ? .07 : .05, .004); hl.position.copy(d).multiplyScalar(rr); hl.position.y += capm.position.y; hl.lookAt(hl.position.clone().add(d)); head.add(hl);
        }
      }
      const cache = new Map();      // 皮膚／球衣／褲子由 Lambert 換成帶柔和高光的 Phong（參考圖角色表面有圓潤的光澤）
      rig.root.traverse(m => {
        const mt = m.material; if (!m.isMesh || !mt || !mt.isMeshLambertMaterial || mt.map || mt.transparent) return;
        let q = cache.get(mt); if (!q) { q = new THREE.MeshPhongMaterial({ color: mt.color.clone(), specular: 0x3a3a3a, shininess: 32 }); cache.set(mt, q); } m.material = q;
      });
    } catch (e) { console.error(e); }
    return rig;
  };
}

/* 打擊區光暈：跟著目前打者走 */
function koTickScene() {
  if (!koGlow || typeof G === 'undefined' || typeof E === 'undefined') return;
  if (typeof G !== 'undefined' && G.mode === 'play') koDrawBoard();
  const b = E.bat, show = !!(KO.on && b && b.rig && G.mode === 'play' && (G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight'));
  koGlow.visible = show; if (!show) return;
  const p = b.rig.root.position; koGlow.position.x = p.x; koGlow.position.z = p.z + .35; koGlow.material.opacity = .72 + .18 * Math.sin(performance.now() / 260);
}

/* =========================================================
   C. 擊球框：青色半透明方框（參考圖）＋保留實際球棒判定輪廓；好球帶改白框＋四角三角
   ========================================================= */
if (KO.on && typeof drawBat === 'function') {
  drawBat = function (ax, ay, R0, col, lw, k, mode) {
    const g = batGeom(R0, ax, ay, E.bat ? E.bat.side : 1, k, mode), c = octx, dpr = ov.width / VW();
    const tl = w2s(ax - R0, ay + R0, 0), br = w2s(ax + R0, ay - R0, 0), x = tl.x, y = tl.y, w = br.x - tl.x, h = br.y - tl.y;
    const pw = mode === 'power', bu = mode === 'bunt', swung = /rgba\(255,255,255,\.4\)/.test(col);
    const edge = swung ? 'rgba(255,255,255,.55)' : pw ? '#ff9a5a' : bu ? '#8dffae' : '#a6eef5';
    c.save(); c.fillStyle = swung ? 'rgba(150,150,150,.22)' : 'rgba(120,130,134,.4)'; c.fillRect(x, y, w, h);
    c.strokeStyle = edge; c.lineWidth = Math.max(2, 2.4 * dpr); if (pw) { c.shadowColor = '#ff7a3a'; c.shadowBlur = lw * 3; } c.strokeRect(x, y, w, h); c.shadowBlur = 0;
    const P = (t, ww) => w2s(g.cx + g.ux * t + g.nx * ww, g.cy + g.uy * t + g.ny * ww, 0), N = 10, rr = t => g.r * (1 - .4 * clamp(t / g.th, 0, 1));
    c.beginPath(); let q = P(g.tb, g.r); c.moveTo(q.x, q.y);      // 實際球棒判定輪廓（淡）：棒身位置與判定範圍不變
    for (let i = 0; i <= N; i++) { const t = g.tb + (g.th - g.tb) * i / N; q = P(t, rr(t)); c.lineTo(q.x, q.y); }
    for (let i = N; i >= 0; i--) { const t = g.tb + (g.th - g.tb) * i / N; q = P(t, -rr(t)); c.lineTo(q.x, q.y); }
    c.closePath(); c.strokeStyle = 'rgba(255,255,255,.62)'; c.lineWidth = Math.max(1, 1.3 * dpr); c.stroke(); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill();
    const s0 = P(-R0 * .3, g.r * .7), s1 = P(R0 * .3, g.r * .7), s2 = P(R0 * .3, -g.r * .7), s3 = P(-R0 * .3, -g.r * .7);
    c.beginPath(); c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y); c.lineTo(s2.x, s2.y); c.lineTo(s3.x, s3.y); c.closePath(); c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();      // 甜蜜點帶
    c.restore();
    const m = P(0, 0); return { a: m, rad: Math.abs(h) / 2 };
  };
}
if (KO.on && typeof drawOverlay === 'function' && typeof octx !== 'undefined') {
  const _drawOverlay = drawOverlay;
  drawOverlay = function () {
    const c = octx, proto = CanvasRenderingContext2D.prototype.strokeRect;
    c.strokeRect = function (x, y, w, h) {      // 只攔截「好球帶外框」（白、.85）：改畫灰色半透明＋白框＋四角三角；其他 strokeRect 照舊
      if (this.strokeStyle === 'rgba(255, 255, 255, 0.85)' || this.strokeStyle === 'rgba(255,255,255,.85)') {
        const dpr = ov.width / VW(); this.save(); this.fillStyle = 'rgba(190,200,205,.07)'; this.fillRect(x, y, w, h); this.strokeStyle = 'rgba(245,248,250,.9)'; this.lineWidth = Math.max(2, 2 * dpr); proto.call(this, x, y, w, h);
        const t = Math.min(Math.abs(w), Math.abs(h)) * .11; this.fillStyle = 'rgba(245,248,250,.95)';
        const X0 = Math.min(x, x + w), Y0 = Math.min(y, y + h), X1 = Math.max(x, x + w), Y1 = Math.max(y, y + h);
        for (const [cx, cy, sx, sy] of [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]]) { this.beginPath(); this.moveTo(cx, cy); this.lineTo(cx + sx * t, cy); this.lineTo(cx, cy + sy * t); this.closePath(); this.fill(); }
        this.restore(); return;
      }
      return proto.apply(this, arguments);
    };
    try { return _drawOverlay.apply(this, arguments); } finally { delete c.strokeRect; }
  };
}

/* =========================================================
   D. HUD：比分板／隊伍名單／壘包菱形／資料面板（資料全部來自既有的 G，不改任何狀態）
   ========================================================= */
const KOH = { key: {}, el: null };
function koG9(v) { return clamp(Math.round((+v || 0) / 11), 1, 9); }
function koEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function koBuildHud() {
  const hud = document.getElementById('hud'); if (!hud || document.getElementById('koHud')) return;
  const d = document.createElement('div'); d.id = 'koHud';
  d.innerHTML = '<div id="koTop"></div><div class="koSide home" id="koHome"></div><div class="koSide away" id="koAway"></div><div id="koDia"></div><div id="koInfo"></div>';
  hud.insertBefore(d, hud.firstChild); KOH.el = d;
}
function koSet(id, html) { const e = document.getElementById(id); if (e && KOH.key[id] !== html) { KOH.key[id] = html; e.innerHTML = html; } }
function koRowsFor(s) {
  const t = G.teams[s]; if (!t || !t.lineup || !t.lineup.length) return '';
  const n = t.lineup.length, bi = ((G.bi && G.bi[s]) || 0) % n, atBat = G.half === s, out = [];
  for (let k = 0; k < 3; k++) { const i = (bi + k) % n, p = t.lineup[i]; if (!p) continue; out.push('<div class="rw' + (atBat && k === 0 ? ' cur' : '') + (!atBat ? ' dim' : '') + '"><em>' + (i + 1) + 'P</em><span>' + koEsc(p.name) + '</span><u>' + koEsc(p.pos || '') + '</u></div>'); }
  return out.join('');
}
function koUpdateHud() {
  if (!KO.on || typeof G === 'undefined' || !G.teams || !G.teams[0] || !G.teams[1] || !KOH.el) return;
  const w = G.wx, wind = (w && !w.off && !w.dome) ? w : null, rain = (typeof rainK === 'function' && G.wxOn) ? rainK() : 0;
  const lamp = (cls, n, on) => { let h = ''; for (let i = 0; i < n; i++) h += '<i class="' + (i < on ? 'on' : '') + '"></i>'; return '<div class="' + cls + '">' + { s: 'S', b: 'B', o: 'O' }[cls] + ' ' + h + '</div>'; };
  const row = s => '<div class="tr' + (G.half === s ? ' at' : '') + '"><b>' + (G.score[s] || 0) + '</b><span>' + koEsc(G.teams[s].name || G.teams[s].short) + '</span></div>';
  koSet('koTop', '<div class="inn"><span>' + G.inning + '局</span><span>' + (G.half ? '下' : '上') + '</span></div><div class="tm">' + row(0) + row(1) + '</div><div class="sbo">' + lamp('s', 2, G.strikes) + lamp('b', 3, G.balls) + lamp('o', 2, G.outs) + '</div><div class="wx"><div class="ic">' + (rain > .15 ? '☂' : '✱') + '</div><div class="wd">' + (wind ? '<i style="transform:rotate(' + ((wind.dir || 0) - 90).toFixed(0) + 'deg)">◀</i>' + Math.round(wind.spd || 0) + ' m' : '— m') + '</div></div>');
  koSet('koHome', '<div class="hd">HOME</div>' + koRowsFor(1)); koSet('koAway', '<div class="hd">AWAY</div>' + koRowsFor(0));
  const bs = (i, x, y) => '<i class="bs' + (G.on && G.on[i] ? ' on' : '') + '" style="left:' + x + '%;top:' + y + '%"></i>';
  koSet('koDia', '<div class="fr"></div>' + bs(1, 50, 14) + bs(0, 86, 50) + bs(2, 14, 50) + '<i class="bs h" style="left:50%;top:88%"></i><div class="ot">' + G.outs + ' Out</div>');
  let b = null, p = null; try { b = curBatter(); p = curPitcher(); } catch (e) { }
  if (!b || !p) return;
  const st = b.st || {}, avg = st.ab ? (st.h / st.ab).toFixed(3) : '0.000', k = Math.max(p.kx || 0, p.kA || 0), fat = clamp(100 - (p.fatigue || 0), 0, 100), kmh = Math.round(p.kmh || 0);
  const stf = (typeof stuffOf === 'function') ? stuffOf(p) : 50, role = { SP: 'SP', RP: 'RP', CL: 'CL' }[p.role] || 'RP';
  const sc = (l, v) => '<div>' + l + '<b>' + v + '</b></div>';
  koSet('koInfo',
    '<div class="pn bt"><div class="st">' + sc('力量', koG9(b.pow)) + sc('打擊', koG9(b.con)) + sc('速度', koG9(b.spd)) + sc('傳球', koG9(b.arm)) + sc('守備', koG9(b.fld)) + '</div>' +
    '<div class="nm"><small>' + (((G.bi && G.bi[G.half]) || 0) + 1) + '</small><span>' + koEsc(b.name) + '</span><b>' + koEsc(b.pos || '') + '</b><u>' + (b.hand === 'L' ? '左' : b.hand === 'S' ? '兩' : '右') + '</u></div>' +
    '<div class="ft">' + avg + ' HR ' + (st.hr || 0) + ' RBI ' + (st.rbi || 0) + ' (' + (st.h || 0) + '/' + (st.ab || 0) + ')</div></div>' +
    '<div class="pn pt"><div class="st">' + sc('控球', koG9(p.ctl)) + sc('球速', kmh) + sc('球威', koG9(stf)) + '<div class="kk">' + k + '<i>K</i></div></div>' +
    '<div class="nm"><small>' + role + '</small><span>' + koEsc(p.name) + '</span><u>' + (p.hand === 'L' ? '左' : '右') + '</u></div>' +
    '<div class="ft">' + (p.pc || 0) + ' P　體力<i><u style="width:' + Math.round(fat) + '%"></u></i></div></div>');
}
if (KO.on) {
  document.body.classList.add('ko');
  const _boot = () => { koBuildHud(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot); else _boot();
  setInterval(() => { try { koBuildHud(); koUpdateHud(); } catch (e) { } }, 120);
  const _tick = () => { try { koTickScene(); } catch (e) { } requestAnimationFrame(_tick); }; requestAnimationFrame(_tick);
}
