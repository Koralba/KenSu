/* ===== 13zm-wx-gentle.js ｜ 天氣視覺減負＋地面草葉隨風（v1.2.11） =====
   載入順序：在 13zl 之後、14 之前（會覆蓋 13zi 的 wxfLeaves／wxfGale／wxfScorch／heatShimmer／heatGlare，所以必須晚於 13zi）。

   【為什麼改】過熱的熱浪、颳風的風線＋沙塵、天空飄落的葉片，都畫在「螢幕上」、正好蓋在球場中央，影響看球。
   【做法】
   ① 天氣機率：主軸是「好天氣（晴／多雲／陰）」與「小雨／毛毛雨」之間來回變化；悶熱、赤熱炎日、颳風、微風、霾害、大雨暴雨颱風等
      改成「輔助、機率性」出現（初始權重與轉換權重都調低；一旦出現，也比較快轉回好天氣）。
   ② 熱流：改成「只在畫面左右兩側、遠景一小條」的暖色熱浪，正中央（球與野手活動區）完全不畫；強度也大幅降低。
      赤熱炎日的白熱天空／橘色暈染／日光眩光同步減弱。
   ③ 颳風：風線只剩幾條極淡的細線、只在畫面最上方（天空／看台）；不再整片蓋沙塵色。
   ④ 飄落的葉片整個取消（也不放落葉、不放高草叢）。草皮維持原本短淺柔和的樣子，只讓它「隨風微微擺動」：
      · 風波：一層極薄、柔邊的明暗波紋貼在草皮上（不放任何會在畫面上變成小黑點的草叢／草葉），順風向緩緩掃過（像風吹過草坪）；無風幾乎看不到，微風淡淡的，強風／陣風明顯一點但仍很淡。
      · 風向、風速、陣風都直接用比賽的 G.wx（與飛球受的風一致：dir 0＝順風往外野吹）；內野紅土、牆外不畫。
   【注意】純外觀：不碰 Math.random（用 13zi 的私有亂數 wxfR，區網對戰不會不同步）；快轉（window.__ff）略過；室內球場／天氣關閉不顯示。
   關閉草皮擺動：GLIFE.on=false；想還原舊的天氣機率／特效：刪掉本檔的載入即可。 */
'use strict';

/* ---------------- ① 天氣機率：好天氣＋小雨為主，其餘輔助 ---------------- */
(function wxGentleOdds() {
  try {
    const W0 = { calm: 22, sunny: 26, overcast: 14, drizzle: 11, change: 8, heavy: 4, storm: 2, plum: 3.5, thunder: 3.5, typhoon: .8, hot: 3, haze: 2, monsoon: 2, breeze: 5, gale: 1.5, scorch: 1.5 };
    for (const e of WX_SCEN) if (W0[e[0]] != null) e[1] = W0[e[0]];      // 開賽時的天氣（還會再乘上球場／晝夜係數）
    const F = { hot: .45, scorch: .4, gale: .4, breeze: .8, haze: .6, heavy: .8, storm: .6, typhoon: .5, thunder: .7, monsoon: .7 };      // 中途轉換：轉入「輔助天氣」的機率打折
    const S = { hot: .5, scorch: .4, gale: .45, haze: .7 };      // 輔助天氣出現後，「繼續維持」的權重降低 → 比較快轉回好天氣
    for (const k in WX_NEXT) for (const e of WX_NEXT[k]) { if (e[0] !== k && F[e[0]] != null) e[1] *= F[e[0]]; if (e[0] === k && S[k] != null) e[1] *= S[k]; }
    WX_NEXT.sunny.push(['drizzle', 1.4]); WX_NEXT.calm.push(['drizzle', 1.2]);      // 好天氣 ⇄ 小雨：晴天也有機會飄起毛毛雨（雲層會先聚集，雨才跟著下）
    for (const e of WX_NEXT.overcast) if (e[0] === 'drizzle') e[1] *= 1.5;
    for (const e of WX_NEXT.drizzle) if (e[0] === 'sunny' || e[0] === 'calm') e[1] *= 1.4;      // 小雨之後也容易放晴
  } catch (e) { console.error('wxGentleOdds', e); }
})();

/* ---------------- ② 熱流：只畫兩側、遠景一小條，中央留白 ---------------- */
let _hsTile2 = null;
heatShimmer = function (c, W, H, dpr, t, k) {
  if (!(k > .02)) return; k = Math.min(1, k) * .5;
  if (!_hsTile2 || _hsTile2.dpr !== dpr) {
    const cv = document.createElement('canvas'), S = Math.round(160 * dpr); cv.width = cv.height = S; const g = cv.getContext('2d'); let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 360; i++) { const x = rnd() * S, y = rnd() * S, w = (1.4 + rnd() * 2.4) * dpr, h = (14 + rnd() * 30) * dpr, a = .035 + rnd() * .06; g.fillStyle = rnd() < .4 ? `rgba(255,205,135,${a})` : `rgba(255,150,70,${a})`; for (const oy of [-S, 0, S]) { g.beginPath(); g.ellipse(x, y + oy, w, h, 0, 0, 6.2832); g.fill(); } }
    _hsTile2 = { cv, dpr, S, pat: null };
  }
  if (!_hsTile2.pat) _hsTile2.pat = c.createPattern(_hsTile2.cv, 'repeat'); if (!_hsTile2.pat) return;
  const y0 = H * .4, y1 = H * .62, sh = Math.max(3, Math.round(4 * dpr)), scroll = (t * 8 * dpr) % _hsTile2.S, NC = 7, cw = W / NC;
  const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  c.save(); c.fillStyle = _hsTile2.pat;
  for (let j = 0; j < NC; j++) {
    const m = ss(.3, .9, Math.abs((j + .5) / NC - .5) * 2); if (m < .02) continue;      // 中央 ~30% 寬度（球與守備區）完全不畫
    for (let y = y0; y < y1; y += sh) {
      const u = (y - y0) / (y1 - y0), env = Math.sin(Math.PI * u), amp = (.9 + 1.6 * u) * dpr, ox = Math.sin(y * .05 / dpr + t * .8) * amp + Math.sin(y * .015 / dpr - t * .45) * amp * 1.2;
      c.globalAlpha = clamp(k * env * m * 1.5, 0, .7); c.setTransform(1, 0, 0, 1, ox, -scroll); c.fillRect(j * cw - 1, y + scroll, cw + 2, sh);
    }
  }
  c.restore();
  heatGlare(c, W, H, dpr, t, k * 2);
};
heatGlare = function (c, W, H, dpr, t, k) {      // 地面熱反光：只留兩側的柔邊暖光，亮度很低
  if (!(k > .02)) return; k = Math.min(1, k);
  c.save(); c.globalCompositeOperation = 'lighter';
  const a0 = .028 * k * (.8 + .2 * Math.sin(t * .6)), gy0 = H * .5, gy1 = H * .92, vg = c.createLinearGradient(0, gy0, 0, gy1); vg.addColorStop(0, 'rgba(255,225,165,0)'); vg.addColorStop(.4, 'rgba(255,225,165,1)'); vg.addColorStop(1, 'rgba(255,215,150,0)');
  const hg = c.createLinearGradient(0, 0, W, 0); hg.addColorStop(0, `rgba(255,225,165,${a0.toFixed(3)})`); hg.addColorStop(.28, `rgba(255,225,165,${(a0 * .3).toFixed(3)})`); hg.addColorStop(.5, 'rgba(255,225,165,0)'); hg.addColorStop(.72, `rgba(255,225,165,${(a0 * .3).toFixed(3)})`); hg.addColorStop(1, `rgba(255,225,165,${a0.toFixed(3)})`);
  c.fillStyle = hg; c.fillRect(0, gy0, W, gy1 - gy0);
  for (let i = 0; i < 6; i++) {      // 蜃景反光斑：只放在左右兩側
    const ph = i * 2.399, side = i % 2 ? 1 : -1, fx = .5 + side * (.3 + (i % 3) * .07 + .02 * Math.sin(t * .17 + ph)), fy = .56 + (i % 3) * .09 + .01 * Math.sin(t * .5 + ph);
    const x = fx * W, y = fy * H, rw = (80 + (i % 3) * 40) * dpr, rh = (4 + (i % 3) * 2) * dpr, a = .05 * k * (.35 + .65 * (.5 + .5 * Math.sin(t * .9 + ph * 1.7)));
    if (a < .004) continue;
    c.save(); c.translate(x + Math.sin(t * .7 + ph) * 5 * dpr, y); c.scale(1, rh / rw);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rw); g.addColorStop(0, `rgba(255,240,205,${a.toFixed(3)})`); g.addColorStop(.55, `rgba(255,222,165,${(a * .35).toFixed(3)})`); g.addColorStop(1, 'rgba(255,210,150,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rw, 0, 6.2832); c.fill(); c.restore();
  }
  c.restore();
};
wxfScorch = function (c, W, H, dpr, t, k) {      // 赤熱炎日：保留「白熱、偏橘」的氣氛，但大幅減弱，不蓋球場
  if (k < .02) return;
  c.save();
  let g = c.createLinearGradient(0, 0, 0, H * .45); g.addColorStop(0, `rgba(255,244,214,${(.1 * k * (.94 + .06 * Math.sin(t * .9))).toFixed(3)})`); g.addColorStop(1, 'rgba(255,236,190,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = `rgba(255,150,40,${(.03 * k).toFixed(3)})`; c.fillRect(0, 0, W, H);
  g = c.createRadialGradient(W / 2, H * .5, Math.min(W, H) * .5, W / 2, H * .5, Math.hypot(W, H) * .62); g.addColorStop(0, 'rgba(255,110,20,0)'); g.addColorStop(1, `rgba(255,100,20,${(.08 * k).toFixed(3)})`); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'lighter';
  g = c.createRadialGradient(W * .9, -H * .04, 0, W * .9, -H * .04, H * .5); g.addColorStop(0, `rgba(255,250,225,${(.2 * k * (.92 + .08 * Math.sin(t * 1.3))).toFixed(3)})`); g.addColorStop(.3, `rgba(255,222,150,${(.07 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; heatShimmer(c, W, H, dpr, t, k);
  c.restore();
};

/* ---------------- ③ 颳風：幾條極淡的細線，只在畫面最上方 ---------------- */
wxfGale = function (c, W, H, dpr, dt, sn, ws, k) {
  const A = WXF.streaks, n = Math.round(7 * k), gust = Math.max(0, G.wx.gust || 0), dx = sn >= 0 ? 1 : -1, nw = () => ({ x: wxfR() * W, y: wxfR() * H * .26, l: wxfRg(60, 170), v: wxfRg(.8, 1.5), a: wxfRg(.04, .1), w: wxfRg(1, 1.6) });
  while (A.length < n) A.push(nw()); if (A.length > n) A.length = n;
  c.save(); c.lineCap = 'round';
  for (const s of A) {
    s.x += dx * s.v * 900 * dpr * dt * (.6 + ws / 10);
    if ((dx > 0 && s.x - s.l * dpr > W) || (dx < 0 && s.x + s.l * dpr < 0)) { Object.assign(s, nw()); s.x = dx > 0 ? -20 * dpr : W + 20 * dpr; }
    c.strokeStyle = `rgba(255,255,255,${(s.a * k * (1 + Math.min(gust, 2) * .25)).toFixed(3)})`; c.lineWidth = s.w * dpr; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - dx * s.l * dpr, s.y + s.l * dpr * .03); c.stroke();
  }
  c.restore();
};

/* ---------------- ④ 草皮擺動：風波（貼地薄層）＋短草葉（3D） ---------------- */
wxfLeaves = function () { if (WXF.leaves.length) WXF.leaves.length = 0; };      // 舊的「天空飄落葉片」整個停用

const GLIFE = { on: true, ready: false, grp: null, wave: null, t: 0, last: 0, err: false };
function glDetailTex() {      // 細緻草葉貼圖（可無縫拼貼）：深／中／淺三色細葉筆觸＋少量柔邊色塊，平均亮度接近中性，疊上去不會讓草皮變暗或變亮
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); let sd = 20271109; const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const wrap = f => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy); };
  for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * S, R = 30 + r() * 60, c = r() < .5 ? '60,130,50' : '170,210,100'; wrap((ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R); gr.addColorStop(0, `rgba(${c},.10)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x + ox - R, y + oy - R, R * 2, R * 2); }); }
  g.lineCap = 'round';
  const cols = ['rgba(24,78,30,.42)', 'rgba(52,118,42,.32)', 'rgba(110,172,70,.30)', 'rgba(188,226,112,.34)', 'rgba(222,240,150,.22)'];
  for (let i = 0; i < 11000; i++) {
    const x = r() * S, y = r() * S, L = 4 + r() * 10, a = r() * TAU, bend = (r() - .5) * 3, k = r(); g.strokeStyle = cols[k < .22 ? 0 : k < .46 ? 1 : k < .7 ? 2 : k < .93 ? 3 : 4]; g.lineWidth = .7 + r() * .9;
    const cx = x + Math.cos(a) * L * .5 + Math.cos(a + 1.57) * bend, cy = y + Math.sin(a) * L * .5 + Math.sin(a + 1.57) * bend, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    wrap((ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy); g.stroke(); });
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8); return t;
}
function glWaveMesh() {      // 草皮細節＋風波層：極座標網格貼在草皮上，邊界收在外野牆前約 7 單位並淡出；紅土／白線依內野貼圖遮罩掉
  const NA = 72, NR = 14, pos = [], edge = [], idx = [];
  for (let a = 0; a <= NA; a++) { const ph = -105 + 210 * a / NA, rad = ph * Math.PI / 180, Rm = wallRadius(ph) - 7; for (let r = 0; r <= NR; r++) { const R = 6 + (Rm - 6) * r / NR; pos.push(Math.sin(rad) * R, 0, -Math.cos(rad) * R); edge.push(Math.min(1, (NR - r) / 3, r / 2 + .15)); } }
  for (let a = 0; a < NA; a++) for (let r = 0; r < NR; r++) { const i = a * (NR + 1) + r, j = i + NR + 1; idx.push(i, j, i + 1, j, j + 1, i + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: { uT: { value: 0 }, uDir: { value: new THREE.Vector2(0, -1) }, uAmp: { value: 0 }, uSpd: { value: 1 }, uSway: { value: 0 }, uLum: { value: 1 }, uDet: { value: .85 }, uTex: { value: glDetailTex() }, uSkin: { value: typeof skinTex !== 'undefined' ? skinTex : null }, uSk: { value: new THREE.Vector3(SK.x0, SK.z0, SK.S) } },
    vertexShader: 'attribute float aEdge; varying vec2 vW; varying float vE; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xz; vE = aEdge; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uT; uniform vec2 uDir; uniform float uAmp; uniform float uSpd; uniform float uSway; uniform float uLum; uniform float uDet; uniform sampler2D uTex; uniform sampler2D uSkin; uniform vec3 uSk; varying vec2 vW; varying float vE;' +
      'void main(){' +
      ' vec2 suv = vec2((vW.x-uSk.x)/uSk.z, 1.0-(vW.y-uSk.y)/uSk.z); float mk = 1.0;' +      /* 內野貼圖遮罩：只在「草」的地方畫（紅土／白線不畫；貼圖透明處＝外野草） */
      ' if(suv.x>0.0 && suv.x<1.0 && suv.y>0.0 && suv.y<1.0){ vec4 sk = texture2D(uSkin, suv); mk = (1.0-sk.a) + sk.a*clamp((sk.g-sk.r)*7.0,0.0,1.0); }' +
      ' float s = dot(vW,uDir); float p = dot(vW,vec2(-uDir.y,uDir.x));' +
      ' float w1 = sin(s*0.21 - uT*uSpd + sin(p*0.05)*1.8); float w2 = sin(s*0.46 - uT*uSpd*1.35 + p*0.11 + 1.3); float w3 = sin(s*0.085 - uT*uSpd*0.7 + sin(p*0.03)*2.4);' +
      ' float w = w1*0.45 + w2*0.25 + w3*0.30;' +
      ' vec2 b1 = uDir * (sin(s*0.35 - uT*uSpd*1.6 + p*0.2)*0.5 + 0.5*w) * uSway; vec2 b2 = uDir * (sin(s*0.61 - uT*uSpd*2.1 + p*0.3 + 2.0)*0.5 + 0.5*w) * uSway * 0.7;' +      /* 草葉順風彎曲：貼圖座標沿風向來回位移 */
      ' vec4 t1 = texture2D(uTex, vW/6.0 + b1); vec4 t2 = texture2D(uTex, vW/2.3 + b2 + 0.37);' +
      ' float ta = clamp(t1.a*0.85 + t2.a*0.55, 0.0, 1.0) * uDet; vec3 tc = (t1.rgb*t1.a*0.85 + t2.rgb*t2.a*0.55) / max(t1.a*0.85 + t2.a*0.55, 0.001);' +
      ' float lt = smoothstep(-0.15,0.9,w), dk = smoothstep(0.1,0.95,-w); float wa = (lt*0.9 + dk*0.8) * uAmp; vec3 wc = mix(vec3(0.08,0.26,0.09), vec3(1.0,0.98,0.72), lt/(lt+dk+0.0001));' +
      ' float aa = 1.0 - (1.0-ta)*(1.0-wa); vec3 col = (tc*ta*(1.0-wa) + wc*wa) / max(aa, 0.0001);' +
      ' float dist = length(vW); gl_FragColor = vec4(col*uLum, aa * mk * clamp(vE,0.0,1.0)); }'
  });
  const mesh = new THREE.Mesh(g, m); mesh.position.y = .024; mesh.renderOrder = 1; mesh.frustumCulled = false; return mesh;
}
function glInit() {
  if (GLIFE.ready) return true; if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof skinTex === 'undefined') return false;
  GLIFE.wave = glWaveMesh(); GLIFE.grp = new THREE.Group(); GLIFE.grp.add(GLIFE.wave); scene.add(GLIFE.grp); GLIFE.ready = true; return true;
}
function glUpdate(dt) {
  const w = G.wx, ws = Math.max(0, w.spd || 0), gust = Math.max(0, w.gust || 0), wd = (w.dir || 0) * Math.PI / 180, wx = Math.sin(wd), wz = -Math.cos(wd), t = GLIFE.t += dt, rn = typeof rainK === 'function' ? rainK() : 0;
  const U = GLIFE.wave.material.uniforms; U.uT.value = t; U.uDir.value.set(wx, wz); U.uSpd.value = .8 + ws * .38 + gust * .25;
  const k = clamp(dt * 1.5, 0, 1), tgt = clamp(.02 + ws * .036 + gust * .06, 0, .4) * (1 - rn * .4) * (G.night ? .7 : 1);      // 風波強度：無風幾乎看不到、強風明顯
  U.uAmp.value += (tgt - U.uAmp.value) * k; U.uSway.value += (clamp(ws * .0045 + gust * .006, 0, .06) - U.uSway.value) * k;      // 草葉彎曲幅度
  U.uLum.value += ((G.night ? .5 : 1) * (1 - clamp(typeof cloudK === 'function' ? cloudK() : 0, 0, 1) * .15) - U.uLum.value) * k;
}
function glFrame() {
  const now = performance.now(), dt = clamp((now - (GLIFE.last || now)) / 1000, 0, .1); GLIFE.last = now;
  if (window.__ff) return;
  const on = GLIFE.on && typeof G !== 'undefined' && G.mode === 'play' && typeof wxIn === 'function' && wxIn();
  if (!on) { if (GLIFE.grp) GLIFE.grp.visible = false; return; }
  if (!glInit()) return; GLIFE.grp.visible = true; glUpdate(dt);
}
{
  const _do = drawOverlay;
  drawOverlay = function () { _do.apply(this, arguments); try { glFrame(); } catch (e) { if (!GLIFE.err) { GLIFE.err = true; console.error('glFrame', e); } } };
}
