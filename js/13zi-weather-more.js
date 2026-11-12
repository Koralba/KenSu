/* ===== 13zi-weather-more.js ｜ 天氣擴充：微風吹落葉／颳風／陽光普照／赤熱炎日 ＋ 夜間天象：星光／月光／極光／流星 =====
   載入順序：在 13zc 之後、14 之前（會包裝 updateNight / applyLighting，所以必須晚於 12、13r、13s）。

   【白天／全天候（新增 3 種天氣情境，另強化 1 種）】
     breeze  微風吹落葉   風速 1.1~3.6 m/s，畫面飄落葉片（受風向左右吹）
     gale    颳風         風速 5.2~9.6 m/s，強陣風、風線、沙塵、狂舞的落葉；風向穩定，飛球明顯受風影響
     scorch  赤熱炎日     氣溫 37~40°C，白熱日光、橘色暈染、熱浪波紋；投手體力消耗更快（hotK=1.8）
     sunny   陽光普照     （原本的晴天）加強日光束、金色光塵、暖色暈光，HUD 顯示「陽光普照」
   以上情境的資料（機率／風／氣溫／轉換）寫在 12-systems.js 的 WX_SCEN / TW_SC / TW_LBL / WX_NEXT 等表格裡。

   【夜間天象（只在夜間比賽、天空夠晴朗時看得到；純視覺，不影響比賽數值）】
     starry  星光燦爛  數千顆閃爍的星＋銀河
     moon    月光皎潔  放大的月亮＋月暈＋冷銀色月光（場地略帶冷色）
     aurora  極光      綠／藍／紫色的極光光幕，緩緩飄動
     meteor  流星雨    不定時劃過夜空的流星（其他天象也偶爾會有單顆流星）
   天象會在比賽中每 3~5 分鐘重新抽一次（需天空晴朗），可於菜單「進階設定」指定。

   【注意】這個檔案「不可使用 Math.random」：區網對戰會把 Math.random 換成同步亂數，視覺特效若吃掉亂數會讓兩邊不同步。
   一律使用下面私有的 wxfR()。 */
'use strict';

/* ---------------- 私有亂數（不碰 Math.random） ---------------- */
const wxfR = (() => { let s = (Date.now() ^ 0x2545F491) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
const wxfRg = (a, b) => a + (b - a) * wxfR();
function wxfWeighted(tb) { let tot = 0; for (const x of tb) tot += x[1]; let r = wxfR() * tot; for (const x of tb) { if ((r -= x[1]) < 0) return x[0]; } return tb[0][0]; }
const wxfVs = () => { try { return typeof vsOn === 'function' && vsOn(); } catch (e) { return false; } };

const WXF = { t: 0, last: 0, leaves: [], streaks: [], motes: [], leafK: 0, leafT: 0, gale: 0, sun: 0, sc: 0 };
const NSKY_LBL = { starry: ['星光燦爛', '✨'], moon: ['月光皎潔', '🌕'], aurora: ['極光閃耀', '🌌'], meteor: ['流星雨', '🌠'] };
const NSKY_MSG = {
  starry: '✨ 雲散天開，夜空繁星點點、銀河隱約可見，星光灑滿球場！',
  moon: '🌕 明月高掛，皎潔的月光與球場燈光交織在一起。',
  aurora: '🌌 天邊竟然出現綠紫色的極光！全場觀眾都抬頭驚呼！',
  meteor: '🌠 流星雨開始了！夜空中一道道流星劃過，快許願！'
};
const NSKY = { kind: 'none', next: 200, t: 0, mt: 8, sayT: 0, s: { starry: 0, moon: 0, aurora: 0, meteor: 0 }, built: false, met: [], dense: [], milky: null, halo: null, aur: [] };

/* ---------------- 天氣情境的選項（菜單、URL 參數共用） ---------------- */
const WXF_SCENS = [['', '隨機（預設）'], ['sunny', '☀️ 陽光普照'], ['breeze', '🍃 微風吹落葉'], ['gale', '💨 颳風'], ['scorch', '🔥 赤熱炎日'], ['calm', '晴朗微風'], ['overcast', '陰天'], ['drizzle', '毛毛雨'], ['heavy', '大雨'], ['storm', '暴雨'], ['plum', '梅雨'], ['thunder', '午後雷陣雨'], ['typhoon', '颱風外圍環流'], ['hot', '悶熱高溫'], ['haze', '空氣霾害'], ['monsoon', '東北季風']];
const WXF_SKIES = [['', '隨機（預設）'], ['starry', '✨ 星光'], ['moon', '🌕 月光'], ['aurora', '🌌 極光'], ['meteor', '🌠 流星'], ['none', '無特殊天象']];

/* ---------------- 狀態判斷 ---------------- */
const wxfOn = () => typeof wxIn === 'function' && wxIn();
const wxfNoNightSkin = () => (typeof KO !== 'undefined' && KO && KO.on && !(typeof CLAY !== 'undefined' && CLAY && CLAY.on));      // 純甲子園外觀沒有夜空
const nightSkyOn = () => !!G.night && G.wxOn !== false && !!G.wx && !G.wx.dome && !G.wx.off && !wxfNoNightSkin();
function wxfClear() { const cl = cloudK(), hz = hazeK(); return (1 - clamp(cl * 1.5, 0, 1)) * (1 - hz * .6) * (1 - clamp(rainK() * 4, 0, 1)); }
function nightSkyLabel() { if (!nightSkyOn() || NSKY.kind === 'none') return null; return wxfClear() > .45 ? NSKY_LBL[NSKY.kind] : null; }
function wxfWantNight() { try { if (wxfVs()) return false; return !!(CFG && CFG.nsky && CFG.nsky !== 'none'); } catch (e) { return false; } }
function wxfSay(msg, toastTxt, col) { try { if (G.mode === 'play' && !G.over) { say(msg); if (toastTxt) toast(toastTxt, '#fff', col || '#38c'); } } catch (e) { } }

/* ---------------- 開賽初始化／強制指定（由 12-systems.js 的 initWeather 結尾呼叫） ---------------- */
function wxfApplyScen(sc) {      // 強制指定天氣情境（菜單／URL／console：wxfApplyScen('gale')）
  if (!G.wx || G.wx.dome || G.wx.off || !(sc === 'sunny' || sc === 'calm' || sc === 'overcast' || sc === 'drizzle' || sc === 'heavy' || sc === 'storm' || TW_SC[sc])) return false;
  const T = TW_SC[sc], PK = PARKS[G.wx.venue] || { dt: 0, wind: 1 };
  G.wxScen = sc; G.cloudBase = cloudFor(sc); G.cloud = G.cloudBase; G.windBoost = scenBoost(sc); G.scT = 900 + wxfR() * 300;
  if (T) { G.rain = G.rainT = T.rain ? T.rain() : 0; G.windBase = clamp(T.wind() * (PK.wind || 1), T.windRange[0], T.windRange[1]); G.windBoost = T.boost; }
  else { G.rain = G.rainT = sc === 'drizzle' ? .1 : sc === 'heavy' ? .58 : sc === 'storm' ? .92 : 0; G.windBase = sc === 'storm' ? 6 : sc === 'heavy' ? 3.5 : sc === 'drizzle' ? 2 : wxfRg(.2, .9); }
  G.windMean = G.windMeanT = G.windBase; G.haze = sc === 'haze' ? .9 : 0; G.heat = (sc === 'hot' || sc === 'scorch') ? 1 : sc === 'sunny' ? .3 : 0;
  G.wx.temp = twTemp(true, false, PK, sc); G.wx.tempT = null; G.wx.spd = G.windMean; G.wxLv = wxLevel(G.rain)[0];
  try { applyLighting(); updateWindHud(); } catch (e) { }
  return true;
}
function wxfPickSky(excl) {      // 依目前天氣調整各天象機率：晴朗無雲星星最亮；霾害／風大時月亮與星光較收斂；極光只在天空清澈時偶爾現身
  const sc = G.wxScen, M = { sunny: { starry: 1.4, meteor: 1.2, aurora: 1.3 }, calm: { moon: 1.2, starry: 1.1 }, haze: { starry: .45, meteor: .4, aurora: .15, moon: 1.3, none: 1.5 }, hot: { starry: .8, aurora: .5 }, monsoon: { aurora: 1.4, moon: .8, none: 1.3 }, gale: { starry: 1.2, moon: .9 }, breeze: { starry: 1.1 } }[sc] || {};
  const tb = [['starry', 26], ['moon', 24], ['meteor', 14], ['aurora', 9], ['none', 22]].filter(x => x[0] !== excl).map(x => [x[0], x[1] * (M[x[0]] ?? 1)]);
  return wxfWeighted(tb);
}
function nightSkyInit() {
  let param = null, pk = null; try { const q = new URLSearchParams(location.search); param = q.get('wx'); pk = q.get('sky'); } catch (e) { }
  const sc = (!wxfVs() && ((CFG && CFG.wxSc) || param)) || '';      // 區網對戰不套用強制天氣（雙方必須一致）
  if (sc) wxfApplyScen(sc);
  else if (G.night && G.wxScen === 'scorch') { G.wxScen = 'hot'; G.cloudBase = cloudFor('hot'); }      // 夜間不會有「赤熱炎日」→ 改成悶熱
  NSKY.kind = 'none'; NSKY.next = wxfRg(170, 300); NSKY.mt = wxfRg(6, 20); NSKY.sayT = 0;
  for (const k in NSKY.s) NSKY.s[k] = 0;
  if (!nightSkyOn()) return;
  const want = (CFG && CFG.nsky) || pk || '';
  NSKY.kind = want && (want === 'none' || NSKY_LBL[want]) ? want : wxfPick0();
  if (want) NSKY.next = 900;      // 指定天象：整場維持
  const cl = wxfClear(); if (NSKY.kind !== 'none') NSKY.s[NSKY.kind] = cl;
}
function wxfPick0() { return wxfRainy() ? 'none' : wxfPickSky(null); }
function wxfRainy() { return G.rain > .1 || (G.cloudBase || 0) > .7; }

/* ---------------- 3D 夜空物件（第一次進入夜間時才建立） ---------------- */
function wxfStarLayer(n, size, bright) {
  const pos = [], col = [], pal = [[.82, .9, 1], [1, .94, .84], [.72, .82, 1], [1, 1, 1]];
  for (let i = 0; i < n; i++) {
    const a = wxfR() * TAU, e = Math.asin(.04 + .96 * wxfR()), r = 468, p = pal[Math.floor(wxfR() * pal.length)], k = bright * (.55 + .45 * wxfR());
    pos.push(r * Math.cos(e) * Math.sin(a), r * Math.sin(e), -r * Math.cos(e) * Math.cos(a)); col.push(p[0] * k, p[1] * k, p[2] * k);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  p.visible = false; scene.add(p); return p;
}
function wxfMilkyTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,140,200,0)'); gr.addColorStop(.32, 'rgba(150,165,215,.14)'); gr.addColorStop(.5, 'rgba(218,218,245,.30)'); gr.addColorStop(.68, 'rgba(150,165,215,.14)'); gr.addColorStop(1, 'rgba(120,140,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) { const x = wxfR() * w, y = h * (.5 + (wxfR() - .5) * .34), r = 30 + wxfR() * 70, rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, i % 3 ? 'rgba(200,190,255,.11)' : 'rgba(255,214,190,.08)'); rg.addColorStop(1, 'rgba(200,190,255,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.globalCompositeOperation = 'destination-out';      // 暗塵帶
    for (let i = 0; i < 14; i++) { const x = wxfR() * w, y = h * (.5 + (wxfR() - .5) * .2), rx = 40 + wxfR() * 90, ry = 5 + wxfR() * 10; g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(x, y, rx, ry, (wxfR() - .5) * .4, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 2600; i++) { const x = wxfR() * w, y = h * (.5 + (wxfR() + wxfR() + wxfR() - 1.5) * .3), s = wxfR() < .08 ? 2 : 1; g.fillStyle = `rgba(255,255,255,${(.25 + .6 * wxfR()).toFixed(2)})`; g.fillRect(x, y, s, s); }
    g.globalCompositeOperation = 'destination-in';      // 左右兩端淡出
    const eg = g.createLinearGradient(0, 0, w, 0); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(.18, 'rgba(0,0,0,1)'); eg.addColorStop(.82, 'rgba(0,0,0,1)'); eg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = eg; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  });
}
const WXF_AUR_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const WXF_AUR_FS = [
  'uniform float uT; uniform float uA; uniform float uS; varying vec2 vUv;',
  'float nz(float x){ return sin(x) + .5*sin(x*2.31+1.7) + .25*sin(x*4.7+.3); }',
  'void main(){',
  '  float x = vUv.x, y = vUv.y;',
  '  float base = .20 + nz(x*7.0 + uT*.22 + uS)*.045 + nz(x*19.0 - uT*.35 + uS*2.0)*.014;',
  '  float h = y - base;',
  '  float bright = smoothstep(0.0, .035, h) * exp(-max(h, 0.0)*3.6);',
  '  float rays = .5 + .5*sin(x*150.0 + nz(x*6.0 + uT*.3 + uS)*3.0 + uT*.9);',
  '  rays = mix(1.0, rays, .35 + .65*smoothstep(.02, .45, h));',
  '  float env = smoothstep(0.0, .16, x) * smoothstep(1.0, .84, x);',
  '  float pulse = .62 + .38*sin(uT*.55 + x*5.0 + uS);',
  '  vec3 col = mix(vec3(.18, 1.0, .52), vec3(.25, .62, 1.0), smoothstep(.10, .38, h));',
  '  col = mix(col, vec3(.72, .28, .95), smoothstep(.34, .72, h));',
  '  float a = bright * rays * env * pulse * uA;',
  '  gl_FragColor = vec4(col * 1.5, clamp(a, 0.0, 1.0));',
  '}'].join('\n');
function wxfBuild() {
  if (NSKY.built) return; NSKY.built = true;
  NSKY.dense = [wxfStarLayer(1500, 2.6, .9), wxfStarLayer(260, 4.6, 1)];
  const mk = new THREE.Mesh(new THREE.PlaneGeometry(760, 190), new THREE.MeshBasicMaterial({ map: wxfMilkyTex(), transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  mk.position.set(-90, 250, -340); mk.lookAt(0, 0, 0); mk.rotateZ(.5); mk.visible = false; scene.add(mk); NSKY.milky = mk;
  const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radTex, color: 0xaecaff, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  hl.position.copy(moon.position); hl.scale.set(300, 300, 1); hl.visible = false; scene.add(hl); NSKY.halo = hl;
  [[455, 2.3, 190, 1.7], [440, 1.9, 175, 5.3]].forEach(([r, span, y, seed], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 260, 96, 1, true, Math.PI - span / 2 + (i ? .25 : 0), span),
      new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uS: { value: seed } }, vertexShader: WXF_AUR_VS, fragmentShader: WXF_AUR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    m.position.y = y; m.visible = false; scene.add(m); NSKY.aur.push(m);
  });
  const tt = canvasTex(256, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.6, 'rgba(200,225,255,.35)'); gr.addColorStop(.95, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w * .95, h * .12); g.quadraticCurveTo(w, h / 2, w * .95, h * .88); g.closePath(); g.fill();
    const hg = g.createRadialGradient(w * .94, h / 2, 0, w * .94, h / 2, h * .6); hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hg; g.fillRect(w * .7, 0, w * .3, h);
  });
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tt, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); NSKY.met.push({ mesh: m, v: new THREE.Vector3(), on: false, age: 0, life: 1, str: 1 });
  }
}
function wxfHideNight() {
  if (!NSKY.built) return;
  NSKY.dense.forEach(p => p.visible = false); NSKY.milky.visible = false; NSKY.halo.visible = false; NSKY.aur.forEach(m => m.visible = false); NSKY.met.forEach(m => { m.on = false; m.mesh.visible = false; });
  try { moon.scale.set(88, 88, 1); } catch (e) { }
}
function wxfMeteor(str) {
  const m = NSKY.met.find(x => !x.on); if (!m) return;
  const az = wxfRg(-70, 70) * Math.PI / 180, el = wxfRg(15, 52) * Math.PI / 180, r = 440, o = m.mesh;
  o.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), -r * Math.cos(el) * Math.cos(az));
  o.quaternion.set(0, 0, 0, 1); o.lookAt(0, 0, 0);      // 讓貼圖面向原點（鏡頭附近）
  o.rotateZ(wxfR() < .5 ? -wxfRg(.15, .85) : Math.PI + wxfRg(.15, .85));      // 往右下或左下劃過
  o.scale.set(wxfRg(80, 170), wxfRg(3, 5.2), 1);
  m.v.set(1, 0, 0).applyQuaternion(o.quaternion).multiplyScalar(wxfRg(150, 270));
  m.age = 0; m.life = wxfRg(.8, 1.4); m.on = true; m.str = str; o.visible = true; o.material.opacity = 0;
}
function wxfRoll(announce) {
  const old = NSKY.kind, nx = wxfPickSky(old); if (nx === old) return; NSKY.kind = nx;
  if (announce && nx !== 'none') wxfSay(NSKY_MSG[nx], NSKY_LBL[nx][1] + ' ' + NSKY_LBL[nx][0], nx === 'aurora' ? '#2a8' : '#36a');
}

/* ---------------- 每幀更新（掛在 updateNight 後面；夜間才做事） ---------------- */
function wxfNightTick(dt) {
  dt = Math.min(dt || 0, .1);
  if (!nightSkyOn()) { if (NSKY.built) wxfHideNight(); return; }
  wxfBuild(); NSKY.t += dt; const t = NSKY.t, clear = wxfClear();
  if (clear > .62 && NSKY.wasClear === false && NSKY.kind === 'none' && NSKY.next > 20 && NSKY.next < 800) NSKY.next = wxfRg(6, 14);      // 雨停雲散：不用等 3～5 分鐘，很快就換上夜空天象
  NSKY.wasClear = clear > .45;
  NSKY.next -= dt; if (NSKY.next <= 0) { NSKY.next = wxfRg(170, 300); if (clear > .55) wxfRoll(true); }
  for (const k in NSKY.s) NSKY.s[k] += clamp((k === NSKY.kind ? clear : 0) - NSKY.s[k], -dt * .12, dt * .12);      // 約 8 秒淡入／淡出
  const S = NSKY.s;
  const dn = clamp(S.starry * .95 + S.meteor * .6 + S.aurora * .5 + S.moon * .12, 0, 1);
  NSKY.dense.forEach((p, i) => { p.material.opacity = dn * (.72 + .28 * Math.sin(t * (1.9 + i * .8) + i * 2)); p.visible = dn > .01; });
  const mo = clamp(S.starry * .9 + S.meteor * .5 + S.aurora * .3, 0, 1); NSKY.milky.material.opacity = mo; NSKY.milky.visible = mo > .01;
  if (moon.visible) { moon.scale.set(88 + 62 * S.moon, 88 + 62 * S.moon, 1); NSKY.halo.material.opacity = S.moon * (.42 + .06 * Math.sin(t * .7)); NSKY.halo.scale.set(300 + 170 * S.moon, 300 + 170 * S.moon, 1); NSKY.halo.visible = S.moon > .01; } else NSKY.halo.visible = false;
  NSKY.aur.forEach((m, i) => { m.material.uniforms.uT.value = t + i * 11; m.material.uniforms.uA.value = S.aurora * (i ? .6 : .95); m.visible = S.aurora > .01; });
  const gap = { meteor: [.7, 2.4], starry: [12, 30], aurora: [25, 50], moon: [45, 90], none: [50, 110] }[NSKY.kind];
  NSKY.mt -= dt; if (NSKY.mt <= 0) {
    NSKY.mt = wxfRg(gap[0], gap[1]);
    if (clear > .5) {
      wxfMeteor(clear); if (NSKY.kind === 'meteor' && wxfR() < .35) wxfMeteor(clear);
      if (NSKY.kind !== 'meteor' && t - NSKY.sayT > 45 && wxfR() < .4) { NSKY.sayT = t; wxfSay(typeof wxMeteorLine === 'function' ? wxMeteorLine() : '🌠 一顆流星劃過夜空…'); }
    }
  }
  for (const m of NSKY.met) { if (!m.on) continue; m.age += dt; m.mesh.position.addScaledVector(m.v, dt); const u = m.age / m.life; if (u >= 1) { m.on = false; m.mesh.visible = false; continue; } m.mesh.material.opacity = Math.pow(Math.sin(Math.PI * u), .7) * m.str; }
}
{ const _un = updateNight; updateNight = function (dt) { const r = _un.apply(this, arguments); try { wxfNightTick(dt); } catch (e) { console.error(e); } return r; }; }
{ const _al = applyLighting; const _col = new THREE.Color();      // 月光：場地偏冷銀；極光：淡綠；赤熱炎日：日照更強偏暖
  applyLighting = function () {
    const r = _al.apply(this, arguments);
    try {
      if (nightSkyOn()) { const ms = NSKY.s.moon, as = NSKY.s.aurora; if (ms > .01) { hemi.intensity += .06 * ms; hemi.color.lerp(_col.set(0xbfd2ff), .25 * ms); } if (as > .01) hemi.color.lerp(_col.set(0x7fffc0), .08 * as); }
      else if (wxfOn() && !G.night && WXF.sc > .01) { sun.intensity += .12 * WXF.sc; sun.color.lerp(_col.set(0xffe0a8), .5 * WXF.sc); hemi.intensity += .04 * WXF.sc; }
    } catch (e) { }
    return r;
  };
}

/* ---------------- 畫面特效（螢幕空間 2D，每幀從 drawOverlay 呼叫） ---------------- */
const LEAF_COL = [['#6fae3a', '#3f7d24'], ['#9bc24a', '#5d8a2a'], ['#d9b43c', '#a8801f'], ['#c9782c', '#8c4a17'], ['#8a5a2b', '#5a3715']];
function wxfNewLeaf(W, H, dpr, sn, anywhere) {
  const z = .55 + wxfR() * .85;
  return { x: anywhere ? wxfR() * W : (sn >= 0 ? -24 * dpr : W + 24 * dpr), y: wxfR() * H * .8 - H * .05, z, a: wxfR() * TAU, sp: wxfRg(-2.4, 2.4), fl: wxfR() * TAU, fs: wxfRg(2, 5), sw: wxfR() * TAU, ci: Math.floor(wxfR() * LEAF_COL.length), sz: wxfRg(9, 18) };
}
function wxfDrawLeaf(c, L, dpr, nt) {
  const s = L.sz * L.z * dpr, cc = LEAF_COL[L.ci];
  c.save(); c.translate(L.x, L.y); c.rotate(L.a); c.scale(1, Math.cos(L.fl) * .85 + (Math.cos(L.fl) < 0 ? -.15 : .15));      // 翻滾
  c.globalAlpha = (nt ? .72 : .9) * (L.z > 1.2 ? .75 : 1); c.fillStyle = cc[0];
  c.beginPath(); c.moveTo(-s, 0); c.quadraticCurveTo(0, -s * .62, s, 0); c.quadraticCurveTo(0, s * .62, -s, 0); c.fill();
  c.strokeStyle = cc[1]; c.lineWidth = Math.max(.8, s * .09); c.beginPath(); c.moveTo(-s * 1.05, 0); c.lineTo(s * .85, 0); c.stroke();
  c.restore();
}
function wxfLeaves(c, W, H, dpr, dt, t, sc, ws, sn, cs, rn, nt) {
  let lt = 0;
  if (sc === 'breeze') lt = 1; else if (sc === 'gale') lt = 2.4; else if (ws > 2.2 && rn < .15 && sc !== 'hot' && sc !== 'scorch' && sc !== 'haze') lt = .3 * clamp((ws - 2) / 3, 0, 1.4);      // 其他天氣風夠大時偶爾也有幾片
  WXF.leafK += clamp(lt - WXF.leafK, -dt * .25, dt * .25);
  const A = WXF.leaves, tg = Math.round(WXF.leafK * 20), gk = sc === 'gale' ? 2.6 : 1, gust = G.wx.gust || 0;
  WXF.leafT -= dt; if (A.length < tg && WXF.leafT <= 0) { A.push(wxfNewLeaf(W, H, dpr, sn, A.length < 4)); WXF.leafT = wxfRg(.12, .3) / Math.max(.4, WXF.leafK); }
  for (let i = A.length - 1; i >= 0; i--) {
    const L = A[i], vx = (sn * ws * 34 + (sn >= 0 ? 1 : -1) * 16) * L.z * gk * dpr, vy = (24 + 20 * L.z) * dpr / (sc === 'gale' ? 2.2 : 1) - cs * ws * 10 * L.z * dpr - Math.max(0, gust) * 14 * dpr;
    L.x += (vx + Math.sin(t * L.fs + L.sw) * 22 * dpr * L.z) * dt; L.y += (vy + Math.cos(t * L.fs * .8 + L.sw) * 16 * dpr) * dt; L.a += L.sp * dt * (1 + ws * .15 * gk); L.fl += L.fs * dt * (1 + (gk - 1) * .6);
    if (L.x < -50 * dpr || L.x > W + 50 * dpr || L.y > H + 30 * dpr || L.y < -90 * dpr) { A.splice(i, 1); continue; }
    wxfDrawLeaf(c, L, dpr, nt);
  }
}
function wxfGale(c, W, H, dpr, dt, sn, ws, k) {      // 風線＋沙塵
  const A = WXF.streaks, n = Math.round(30 * k), gust = Math.max(0, G.wx.gust || 0), dx = sn >= 0 ? 1 : -1;
  while (A.length < n) A.push({ x: wxfR() * W, y: wxfR() * H, l: wxfRg(70, 240), v: wxfRg(.8, 1.6), a: wxfRg(.09, .24), w: wxfRg(1, 2.2) });
  if (A.length > n) A.length = n;
  c.save(); c.lineCap = 'round';
  for (const s of A) {
    s.x += dx * s.v * 1100 * dpr * dt * (.6 + ws / 10);
    if ((dx > 0 && s.x - s.l * dpr > W) || (dx < 0 && s.x + s.l * dpr < 0)) { s.x = dx > 0 ? -20 * dpr : W + 20 * dpr; s.y = wxfR() * H; s.l = wxfRg(70, 240); s.v = wxfRg(.8, 1.6); s.a = wxfRg(.09, .24); }
    c.strokeStyle = `rgba(255,255,255,${(s.a * k * (1 + Math.min(gust, 2) * .3)).toFixed(3)})`; c.lineWidth = s.w * dpr; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - dx * s.l * dpr, s.y + s.l * dpr * .04); c.stroke();
  }
  c.fillStyle = `rgba(196,170,120,${(.05 * k * (1 + gust * .15)).toFixed(3)})`; c.fillRect(0, H * .35, W, H * .65);
  c.restore();
}
function wxfSunshine(c, W, H, dpr, dt, t, k, sn, ws) {      // 陽光普照：金色暖光、斜射光束、飄浮光塵
  if (k < .02) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  let g = c.createRadialGradient(W * .9, -H * .08, 0, W * .9, -H * .08, H * 1.25); g.addColorStop(0, `rgba(255,226,150,${(.12 * k).toFixed(3)})`); g.addColorStop(.5, `rgba(255,214,130,${(.04 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(255,210,120,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) {
    const x0 = W * (.42 + i * .12) + Math.sin(t * .25 + i * 1.7) * W * .02, wd = W * (.03 + .025 * ((i * .37) % 1)), dx = -W * .55, y1 = H * 1.1, a = k * (.045 + .03 * Math.sin(t * .5 + i * 2.3));
    const gr = c.createLinearGradient(x0, 0, x0 + dx, y1); gr.addColorStop(0, `rgba(255,236,190,${a.toFixed(3)})`); gr.addColorStop(.7, `rgba(255,236,190,${(a * .35).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,236,190,0)');
    c.fillStyle = gr; c.beginPath(); c.moveTo(x0 - wd * .4, 0); c.lineTo(x0 + wd * .4, 0); c.lineTo(x0 + dx + wd * 1.6, y1); c.lineTo(x0 + dx - wd * 1.6, y1); c.closePath(); c.fill();
  }
  const M = WXF.motes; while (M.length < 26) M.push({ x: wxfR() * W, y: wxfR() * H, r: wxfRg(1.2, 3.2), ph: wxfR() * TAU, v: wxfRg(.6, 1.4) });
  for (const m of M) {
    m.x += (sn * ws * 4 + 7 * m.v) * dpr * dt; m.y -= 9 * m.v * dpr * dt + Math.sin(t * .8 + m.ph) * .1; if (m.x > W + 10) m.x = -10; if (m.x < -10) m.x = W + 10; if (m.y < -10) { m.y = H + 10; m.x = wxfR() * W; }
    const a = .5 * k * (.5 + .5 * Math.sin(t * 1.4 + m.ph)); if (a < .02) continue; c.fillStyle = `rgba(255,240,200,${a.toFixed(3)})`; c.beginPath(); c.arc(m.x, m.y, m.r * dpr, 0, TAU); c.fill();
  }
  c.restore();
}
/* ---------- 熱流（v1.2.1）：細緻的暖色熱浪，取代原本會抖動的白色粗線 ----------
   預先畫好一塊細絲紋理（暖橘＋琥珀，非純白），畫面上切成 3px 細條，每條依高度與時間做很小的水平位移並緩慢上升，
   產生「空氣被烤得扭動」的折射感；位移是平滑的低頻正弦，不會一格一格跳動。 */
let _hsTile = null;
function heatShimmer(c, W, H, dpr, t, k) {
  if (!(k > .02)) return;
  if (!_hsTile || _hsTile.dpr !== dpr) {
    const cv = document.createElement('canvas'), S = Math.round(192 * dpr); cv.width = cv.height = S; const g = cv.getContext('2d'); let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 520; i++) { const x = rnd() * S, y = rnd() * S, w = (1.2 + rnd() * 2.2) * dpr, h = (12 + rnd() * 30) * dpr, warm = rnd() < .35, a = .03 + rnd() * .06; g.fillStyle = warm ? `rgba(255,196,120,${a})` : `rgba(255,128,48,${a})`; for (const oy of [-S, 0, S]) { g.beginPath(); g.ellipse(x, y + oy, w, h, 0, 0, 6.2832); g.fill(); } }
    _hsTile = { cv, dpr, S, pat: null };
  }
  if (!_hsTile.pat) _hsTile.pat = c.createPattern(_hsTile.cv, 'repeat'); if (!_hsTile.pat) return;
  const y0 = H * .34, y1 = H * .84, sh = Math.max(2, Math.round(3 * dpr)), scroll = (t * 9 * dpr) % _hsTile.S;
  c.save(); c.fillStyle = _hsTile.pat;
  for (let y = y0; y < y1; y += sh) {
    const u = (y - y0) / (y1 - y0), env = Math.sin(Math.PI * u) * (.45 + .55 * u), amp = (1.1 + 2.4 * u) * dpr;      // 越靠近地面扭動越明顯
    const ox = Math.sin(y * .045 / dpr + t * .85) * amp + Math.sin(y * .013 / dpr - t * .5) * amp * 1.5;
    c.globalAlpha = clamp(k * env * 1.9, 0, 1); c.setTransform(1, 0, 0, 1, ox, -scroll); c.fillRect(-amp * 3, y + scroll, W + amp * 6, sh);
  }
  c.restore();
  const g2 = c.createLinearGradient(0, H * .5, 0, H * .86); g2.addColorStop(0, 'rgba(255,170,70,0)'); g2.addColorStop(.7, `rgba(255,160,60,${(.05 * k).toFixed(3)})`); g2.addColorStop(1, 'rgba(255,150,50,0)'); c.save(); c.fillStyle = g2; c.fillRect(0, H * .5, W, H * .36); c.restore();
  heatGlare(c, W, H, dpr, t, k);
}
/* ---------- 地面熱反光（v1.2.7）：被曬燙的地面微微泛光，幾片柔軟的暖白色反光斑緩慢飄動、明暗起伏（像柏油路上的蜃景），全部是柔邊、低亮度，沒有任何細線 ---------- */
function heatGlare(c, W, H, dpr, t, k) {
  if (!(k > .02)) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const gy0 = H * .46, gy1 = H, sh = c.createLinearGradient(0, gy0, 0, gy1);      // ① 整片地面的暖色泛光：越靠近鏡頭越亮，隨時間緩慢呼吸
  const br = .8 + .2 * Math.sin(t * .6); sh.addColorStop(0, 'rgba(255,225,165,0)'); sh.addColorStop(.35, `rgba(255,228,175,${(.035 * k * br).toFixed(3)})`); sh.addColorStop(1, 'rgba(255,215,150,0)');
  c.fillStyle = sh; c.fillRect(0, gy0, W, gy1 - gy0);
  for (let i = 0; i < 9; i++) {      // ② 反光斑（蜃景水光）：橫向拉長的柔邊橢圓，位置緩慢漂移、忽明忽暗
    const ph = i * 2.399, fx = (i * .113 + .07 + .03 * Math.sin(t * .17 + ph)) % 1, fy = .54 + (i % 4) * .085 + .012 * Math.sin(t * .5 + ph);
    const x = fx * W, y = fy * H, rw = (90 + (i % 3) * 55) * dpr, rh = (5 + (i % 3) * 2.5) * dpr, a = .085 * k * (.35 + .65 * (.5 + .5 * Math.sin(t * .9 + ph * 1.7))) * (.7 + .3 * (y / H));
    if (a < .004) continue;
    c.save(); c.translate(x + Math.sin(t * .7 + ph) * 6 * dpr, y); c.scale(1, rh / rw);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rw); g.addColorStop(0, `rgba(255,240,205,${a.toFixed(3)})`); g.addColorStop(.55, `rgba(255,222,165,${(a * .38).toFixed(3)})`); g.addColorStop(1, 'rgba(255,210,150,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rw, 0, 6.2832); c.fill(); c.restore();
  }
  c.restore();
}
function wxfScorch(c, W, H, dpr, t, k) {      // 赤熱炎日：白熱天空、橘色暈染、日光眩光、上升熱浪
  if (k < .02) return;
  c.save();
  let g = c.createLinearGradient(0, 0, 0, H * .62); g.addColorStop(0, `rgba(255,244,214,${(.26 * k * (.94 + .06 * Math.sin(t * .9))).toFixed(3)})`); g.addColorStop(1, 'rgba(255,236,190,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = `rgba(255,150,40,${(.07 * k).toFixed(3)})`; c.fillRect(0, 0, W, H);
  g = c.createRadialGradient(W / 2, H * .5, Math.min(W, H) * .4, W / 2, H * .5, Math.hypot(W, H) * .62); g.addColorStop(0, 'rgba(255,110,20,0)'); g.addColorStop(1, `rgba(255,100,20,${(.2 * k).toFixed(3)})`); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'lighter';
  g = c.createRadialGradient(W * .88, -H * .04, 0, W * .88, -H * .04, H * .75); g.addColorStop(0, `rgba(255,250,225,${(.5 * k * (.92 + .08 * Math.sin(t * 1.3))).toFixed(3)})`); g.addColorStop(.25, `rgba(255,222,150,${(.2 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; heatShimmer(c, W, H, dpr, t, k);
  c.restore();
}
let _wxfV = null;
function wxfNightFx(c, W, H, t) {      // 月暈、冷色月光、極光天光
  if (!nightSkyOn()) return; const ms = NSKY.s.moon, as = NSKY.s.aurora;
  if (ms > .02) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(150,180,255,${(.035 * ms).toFixed(3)})`; c.fillRect(0, 0, W, H);
    if (moon.visible) {
      _wxfV = _wxfV || new THREE.Vector3(); _wxfV.copy(moon.position).project(camera);
      if (_wxfV.z < 1 && _wxfV.z > -1) {
        const sx = (_wxfV.x * .5 + .5) * W, sy = (-_wxfV.y * .5 + .5) * H, R = Math.hypot(W, H);
        if (sx > -W * .5 && sx < W * 1.5 && sy > -H * .6 && sy < H * 1.2) {
          const g = c.createRadialGradient(sx, sy, 0, sx, sy, R * .42), a = ms * (.95 + .05 * Math.sin(t * .8)); g.addColorStop(0, `rgba(215,230,255,${(.3 * a).toFixed(3)})`); g.addColorStop(.12, `rgba(180,205,255,${(.13 * a).toFixed(3)})`); g.addColorStop(1, 'rgba(160,190,255,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
          c.translate(sx, sy); for (let i = 0; i < 7; i++) { const ang = Math.PI * (.1 + .8 * ((i * .618 + .2) % 1)) + Math.sin(t * .4 + i * 2) * .03, len = R * (.4 + .3 * ((i * .41) % 1)), wd = R * .012; const gr = c.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len); gr.addColorStop(0, `rgba(190,215,255,${(.05 * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(190,215,255,0)'); c.fillStyle = gr; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(ang - wd / len) * len, Math.sin(ang - wd / len) * len); c.lineTo(Math.cos(ang + wd / len) * len, Math.sin(ang + wd / len) * len); c.closePath(); c.fill(); }
        }
      }
    }
    c.restore();
  }
  if (as > .02) { const g = c.createLinearGradient(0, 0, 0, H * .5); g.addColorStop(0, `rgba(70,255,170,${(.07 * as * (.8 + .2 * Math.sin(t * .6))).toFixed(3)})`); g.addColorStop(1, 'rgba(70,255,170,0)'); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore(); }
}
function drawWxFx(c, W, H) {
  const now = performance.now(), dt = clamp((now - (WXF.last || now)) / 1000, 0, .1); WXF.last = now; WXF.t += dt; const t = WXF.t;
  if (!wxfOn()) return;
  const dpr = W / VW(), sc = G.wxScen, cl = cloudK(), rn = rainK(), nt = !!G.night, ws = G.wx.spd || 0, wd = (G.wx.dir || 0) * Math.PI / 180, sn = Math.sin(wd), cs = Math.cos(wd);
  const sunT = (!nt && sc === 'sunny') ? (1 - cl) * (1 - clamp(rn * 3, 0, 1)) : 0; WXF.sun += clamp(sunT - WXF.sun, -dt * .15, dt * .15);
  const scT = (!nt && sc === 'scorch') ? (1 - clamp(rn * 3, 0, 1)) : 0; WXF.sc += clamp(scT - WXF.sc, -dt * .12, dt * .12);
  const gT = sc === 'gale' ? 1 : 0; WXF.gale += clamp(gT - WXF.gale, -dt * .3, dt * .3);
  try { wxfSunshine(c, W, H, dpr, dt, t, WXF.sun, sn, ws); } catch (e) { }
  try { wxfScorch(c, W, H, dpr, t, WXF.sc); } catch (e) { }
  try { wxfNightFx(c, W, H, t); } catch (e) { }
  try { if (WXF.gale > .02) wxfGale(c, W, H, dpr, dt, sn, ws, WXF.gale); else WXF.streaks.length = 0; } catch (e) { }
  try { wxfLeaves(c, W, H, dpr, dt, t, sc, ws, sn, cs, rn, nt); } catch (e) { }
}

/* ---------------- 菜單：進階設定裡的「天氣情境」「夜空天象」 ---------------- */
(function wxfMenu() {
  const fill = (id, list, key) => { const el = document.getElementById(id); if (!el) return; el.innerHTML = list.map(([v, n]) => `<option value="${v}">${n}</option>`).join(''); el.value = (CFG && CFG[key]) || ''; el.onchange = () => { CFG[key] = el.value; }; };
  try { fill('selWx', WXF_SCENS, 'wxSc'); fill('selSky', WXF_SKIES, 'nsky'); } catch (e) { console.error(e); }
})();
