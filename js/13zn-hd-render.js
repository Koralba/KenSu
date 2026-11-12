/* ===== 13zn-hd-render.js ｜ v1.3.0 高畫質渲染：即時陰影（隨天氣／日夜變化）／草皮與紅土微細節／角色布料與亮面材質／貼圖最大各向異性 =====
   載入順序：在 13zm 之後、14 之前（會包裝 applyLighting／makeChibi，必須晚於 12、13r、13s、13t2）。依賴 00-hd-core.js 的 HD。
   ── 陰影怎麼做 ──
   · 主光 sun（DirectionalLight）開 castShadow，陰影貼圖 4096（手機 2048），涵蓋本壘到外野中段（約 85 公尺半徑）。
   · 場地上的陰影畫在一片「只畫陰影」的透明地板（ShadowMaterial）上，所以不會被草皮細節層蓋掉，而且「陰影濃淡／顏色」可以逐幀依天氣調整：
       晴天＝濃而偏藍的影子；多雲＝淡；陰雨＝幾乎沒有；夜間＝靠燈塔泛光，影子變淺、偏暖黑。濃淡＝主光佔全部光量的比例（sun / (sun + 半球光 + 泛光)）。
   · 球員身上也接收陰影（帽簷在臉上的影子、手臂在身體上的影子），所以真的是「光源決定」的陰影，不是貼圖。
   ── 想關掉 ──  網址加 ?hd=0（或在 console 執行 localStorage.hd='0' 後重新整理）會關閉本檔的所有效果，回到 v1.2.12 畫面。 */
'use strict';
const HDR = (() => {
  const R = { on: true, gid: 0, rigs: [], sweeps: 0, T: {}, catcher: null };
  try { if (/[?&]hd=0/.test(location.search) || localStorage.getItem('hd') === '0') R.on = false; } catch (e) { }
  if (!R.on || typeof renderer === 'undefined' || typeof HD === 'undefined') { R.on = false; return R; }
  const LOW = !!IS_TOUCH, V = new THREE.Vector3(), tmpC = new THREE.Color();
  HD.maxAn = Math.min(16, (renderer.capabilities.getMaxAnisotropy && renderer.capabilities.getMaxAnisotropy()) || 8);
  const maxTex = renderer.capabilities.maxTextureSize || 4096;

  /* ================= 1) 即時陰影：主光 ================= */
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const SM = Math.min(maxTex, LOW ? 2048 : 4096), CEN = new V3(0, 0, -32), SR = 86;
  sun.castShadow = true; sun.shadow.mapSize.set(SM, SM);
  { const c = sun.shadow.camera; c.left = -SR; c.right = SR; c.top = SR; c.bottom = -SR; c.near = 20; c.far = 360; c.updateProjectionMatrix(); }
  sun.shadow.bias = -.00045; sun.shadow.normalBias = .03;
  scene.add(sun.target); sun.target.position.copy(CEN);
  function hdLight() {      // 主光方向微調（影子側向落在畫面上，不會全被球員自己擋住），並把主光「目標」移到場地中心，讓陰影貼圖解析度集中在比賽區域
    V.copy(sun.position);      // 呼叫時 sun.position 一定是 applyLighting 剛重設的「純方向」值（本函式只在它之後呼叫），所以不會重複疊加
    V.set(V.x * 1.22, Math.max(V.y, 30), V.z * .82).normalize(); (R.dir || (R.dir = new THREE.Vector3())).copy(V);      // v1.3.3：另存「朝向太陽的單位方向」，13zq 每幀依視野貼合陰影範圍時使用（sun.position 會被它每幀移動）
    V.multiplyScalar(120);
    sun.target.position.copy(CEN); sun.target.updateMatrixWorld(); sun.position.copy(V).add(CEN);
  }
  { const _al = applyLighting; applyLighting = function () { const r = _al.apply(this, arguments); try { hdLight(); } catch (e) { } return r; }; }
  try { hdLight(); } catch (e) { }

  /* ================= 2) 只畫陰影的場地地板 ================= */
  const catcherMat = new THREE.ShadowMaterial({ opacity: .4, color: 0x0b1a2e, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const catcher = new THREE.Mesh(new THREE.CircleGeometry(126, 72), catcherMat);
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = .058; catcher.receiveShadow = true; catcher.renderOrder = 4; catcher.frustumCulled = false; scene.add(catcher); R.catcher = catcher;

  /* ================= 3) 草皮／紅土：世界座標微細節（顏色顆粒＋微凹凸，近處才出現，遠處淡出避免摩爾紋） ================= */
  R.T.grass = HD.noiseTex('grass', 512); R.T.dirt = HD.noiseTex('dirt', 512); R.T.macro = HD.noiseTex('macro', 256);
  const GLSL_COL = `
    float hdD = length(vHdW - cameraPosition); float hdF = 1.0 - smoothstep(24.0, 78.0, hdD); float hdFm = 1.0 - smoothstep(70.0, 170.0, hdD);
    vec2 hdP = vHdW.xz; float hdh1 = 0.5;
    if (uHdQ > 0.25) {
      hdh1 = texture2D(uHdT, hdP * uHdP.x).r; float hdh2 = texture2D(uHdT, hdP * uHdP.y + vec2(0.37, 0.61)).r; float hdmc = texture2D(uHdM, hdP * 0.021).r;
      float hdv = (hdh1 - 0.5) * 0.95 + (hdh2 - 0.5) * 0.75;
      diffuseColor.rgb *= 1.0 + hdv * uHdP.z * hdF + (hdmc - 0.5) * 0.34 * hdFm;
    }`;
  const GLSL_NRM = `
    if (uHdQ > 0.75) { float e = 1.0 / 512.0; float hx = texture2D(uHdT, hdP * uHdP.x + vec2(e, 0.0)).r - hdh1; float hz = texture2D(uHdT, hdP * uHdP.x + vec2(0.0, e)).r - hdh1;
      vec3 wp = vec3(-hx, 0.0, -hz) * uHdP.w * hdF; normal = normalize(normal + (viewMatrix * vec4(wp, 0.0)).xyz); }`;
  function hdGround(mesh, kind) {
    const m = mesh && mesh.material; if (!m || !m.isMeshPhongMaterial || m.userData.hdG) return; m.userData.hdG = kind;
    const grass = kind === 'grass', P = grass ? new THREE.Vector4(.85, .21, .44, 7.5) : new THREE.Vector4(.62, .16, .38, 9.5), id = ++R.gid;
    m.specular.setHex(0x000000); m.shininess = 4;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHdT = { value: grass ? R.T.grass : R.T.dirt }; sh.uniforms.uHdM = { value: R.T.macro }; sh.uniforms.uHdP = { value: P }; sh.uniforms.uHdQ = HD.gfxD;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHdW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHdW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHdW; uniform sampler2D uHdT; uniform sampler2D uHdM; uniform vec4 uHdP; uniform float uHdQ;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + GLSL_COL).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (LOW ? '' : GLSL_NRM));
    };
    m.customProgramCacheKey = () => 'hdg' + id; m.needsUpdate = true;
  }
  hdGround(grass, 'grass'); hdGround(skin, 'dirt'); hdGround(moundMesh, 'dirt'); hdGround(track, 'dirt');
  moundMesh.receiveShadow = true; try { rosinBag.receiveShadow = true; rosinBag.castShadow = true; baseMeshes.forEach(b => { b.receiveShadow = true; b.castShadow = true; }); } catch (e) { }

  /* ================= 3b) 體型：更像真實球員（寬肩、收腰、前後較薄；頭縮小並加脖子；球衣袖口／內搭長袖／高筒球襪） ================= */
  { const g = GEO.torso, ps = g.attributes.position; for (let i = 0; i < ps.count; i++) { const y = ps.getY(i), t = Math.max(0, Math.min(1, (y + .31) / .62)), f = 1 + .1 * Math.pow(t, 1.5); ps.setX(i, ps.getX(i) * f); ps.setZ(i, ps.getZ(i) * f * .95); } ps.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); }
  const NECK = new THREE.CylinderGeometry(.115, .14, .3, 20), SHO = new THREE.SphereGeometry(.125, 18, 14), SOCK = new THREE.CylinderGeometry(.118, .108, .27, 20), HEM = new THREE.CylinderGeometry(.135, .13, .07, 20), CUFF = new THREE.CylinderGeometry(.098, .098, .05, 18);
  function shape(r, o) {
    const vis = r.vis, suit = !!(o && o.pl && o.pl.suit); if (r._shaped) return; r._shaped = 1;
    const hm = r.head.children[0] && r.head.children[0].material, jm = r.torso.material;
    r.head.scale.multiplyScalar(1.1);      // 實況野球魂風：大圓頭、短身體（不加脖子，頭直接坐在肩上）
    r.head.position.y -= .06;
    for (const a of [r.armL, r.armR]) { const sh = new THREE.Mesh(SHO, jm); sh.position.set(0, -.01, 0); a.add(sh); }
    if (suit) return;
    const key = (o && o.pl && o.pl.name) || 'x', H = hashStr('under:' + key), under = [null, '#f6f6f6', '#17181d', (o && o.cap) || null, null][H % 5];
    for (const a of [r.armL, r.armR]) {
      const fa = a._fa; if (!fa) continue;
      if (under) { const fm = fa.children.find(c => c.geometry === FARM_GEO); if (fm) { fm.material = mat(under); const cf = new THREE.Mesh(CUFF, jm); cf.position.y = -.01; fa.add(cf); } }
    }
    const sockC = (H >> 3) % 3 === 0 ? '#f4f4f4' : ((o && o.cap) || '#f4f4f4');
    for (const l of [r.legL, r.legR]) {
      const ka = l._ka; if (!ka) continue; const sm = ka.children.find(c => c.geometry === SHIN_GEO); if (!sm) continue;
      const sk = new THREE.Mesh(SOCK, mat(sockC)); sk.position.set(0, -.14, 0); ka.add(sk); sk.scale.set(1.02, 1, 1.02);
      const hm2 = new THREE.Mesh(HEM, l.children[0].material); hm2.position.set(0, -.02, 0); ka.add(hm2);
    }
  }
  /* ================= 4) 角色：布料織紋凹凸、頭盔／鞋／手套亮面、膚色柔光、陰影（投射＋接收） ================= */
    const skinSet = new Set((typeof SKINS_F !== 'undefined' ? SKINS_F : []).map(s => String(s).toLowerCase()));
  /* 環境反射貼圖（程序化天空盒：天藍／地平線亮／草地綠）：頭盔、球棒、球鞋、手套會反射天空；強度隨天氣光量與日夜變化 */
  const envTex = (() => {
    const mk = (top, mid, bot) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, top); gr.addColorStop(.5, mid); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; };
    const side = mk('#6aa6e8', '#e6f1ff', '#4c7a3a'), up = mk('#4f93e6', '#4f93e6', '#8cc0f2'), dn = mk('#4c7a3a', '#4c7a3a', '#3a5a2c');
    const t = new THREE.CubeTexture([side, side, up, dn, side, side]); t.needsUpdate = true; return t;
  })();
  const REFL = [];
  function refl(m, k) { m.envMap = envTex; m.combine = THREE.AddOperation; m.reflectivity = k; m.userData.rk = k; REFL.push(m); m.needsUpdate = true; }
  refl(HD.batMat, .22);
  const VAR = new Map(), hexOf = m => '#' + m.color.getHexString();
  function variant(m, kind) {      // 同色材質共用：helm 塑膠亮面／shoe 皮革／glove 皮革
    const key = kind + hexOf(m) + (m.transparent ? 't' : ''); let v = VAR.get(key); if (v) return v;
    v = m.clone(); v.userData.hdV = kind; v.bumpMap = null;
    if (kind === 'helm') { v.specular.setHex(0x3e3e3e); v.shininess = 64; refl(v, .3); } else if (kind === 'shoe') { v.specular.setHex(0x3c3c3c); v.shininess = 42; refl(v, .14); } else if (kind === 'glove') { v.specular.setHex(0x2a241c); v.shininess = 26; refl(v, .06); }
    VAR.set(key, v); return v;
  }
  /* 布料質感（無貼圖的球衣／褲子／帽子／袖子）：不規則細纖維顆粒（距離一遠自動淡出，不會閃爍或出現格紋）＋大尺度皺褶明暗＋邊緣柔光（布料絨毛感），柔光強度跟著天氣光量 */
  const HDU = { amb: { value: 1 } };
  const CLOTH_V = `float hdH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float hdVn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hdH(i), hdH(i + vec2(1.0, 0.0)), f.x), mix(hdH(i + vec2(0.0, 1.0)), hdH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
  function clothHook(sh) {
    sh.uniforms.uHdAmb = HDU.amb; sh.uniforms.uHdQ = HD.gfxD;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHdU;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHdU = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vHdU; uniform float uHdAmb; uniform float uHdQ;\n' + CLOTH_V)
      .replace('#include <map_fragment>', `#include <map_fragment>
      if (uHdQ > 0.25) { vec2 q = vHdU * 150.0; float fa = 1.0 - smoothstep(0.5, 1.6, fwidth(q.x) + fwidth(q.y));
        float grain = hdVn(q) * 0.65 + hdVn(q * 2.7 + 3.1) * 0.35, fold = hdVn(vHdU * vec2(5.0, 8.0) + 1.3) * 0.65 + hdVn(vHdU * vec2(13.0, 21.0)) * 0.35;
        diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.16 * fa + (fold - 0.5) * 0.22; }`)
      .replace('#include <envmap_fragment>', `#include <envmap_fragment>
      { float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4); outgoingLight += (diffuseColor.rgb * 0.30 + 0.035) * rim * 0.55 * uHdAmb; }`);
  }
  function matPass(m) {      // 一般材質（沒有貼圖的純色）：布料凹凸；膚色：柔和亮面
    if (!m || m.userData.hdM || m.userData.hdSkin || !m.isMeshPhongMaterial) return; m.userData.hdM = 1;
    if (m.map || m.transparent || m.vertexColors) return;
    if (skinSet.has(hexOf(m))) { m.specular.setHex(0x1c1814); m.shininess = 20; return; }
    m.specular.setHex(0x1a1a1a); m.shininess = 16; m.onBeforeCompile = clothHook; m.customProgramCacheKey = () => 'hdcloth'; m.needsUpdate = true;
  }
  const _ws = new THREE.Vector3();
  function tagMesh(o) {
    if (o.userData.hdS) return; o.userData.hdS = 1; if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, mt = o.material; if (!mt || Array.isArray(mt)) return;
    if (g === shadowGeo || (mt.map && mt.map === shadowTex)) { mt.opacity = .5; return; }      // 腳下原本的「圓形假影」：只留當接觸陰影（淡），真正的影子交給光源
    if (mt.isMeshBasicMaterial || mt.isSpriteMaterial) return;
    if (g === GEO.head || g === GEO.hand || g === GEO.cheek || (typeof EAR_GEO !== 'undefined' && g === EAR_GEO)) {      // 皮膚：不要布料紋，改柔和亮面
      if (!mt.userData.hdSkin) { mt.userData.hdSkin = 1; mt.userData.hdM = 1; if (!mt.map) { mt.specular.setHex(0x1c1814); mt.shininess = 20; } }
    } else if (g === GEO.helm) o.material = variant(mt, 'helm'); else if (g === GEO.shoe) o.material = variant(mt, 'shoe'); else if (g === GEO.glove) o.material = variant(mt, 'glove'); else matPass(mt);
    if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(_ws);
    if (g.boundingSphere.radius * Math.max(_ws.x, _ws.y, _ws.z) < .075) return;      // 太小的零件（眼睛、鈕扣…）不投影，省效能
    o.castShadow = true; o.receiveShadow = true;
  }
  function tagRig(r) {
    if (!r) return; if (r.root) r.root.traverse(tagMesh);
    if (r._dropBat) { r._dropBat.castShadow = true; r._dropBat.receiveShadow = true; }
  }
  { const _mk = makeChibi; makeChibi = function () { const r = _mk.apply(this, arguments); try { shape(r, arguments[0]); } catch (e) { console.error('HD shape', e); } try { r._hdT = performance.now(); R.rigs.push(r); tagRig(r); } catch (e) { } return r; }; }
  try { ballMesh.castShadow = true; } catch (e) { }

  /* ================= 5) 貼圖各向異性：全場景貼圖用最大值（斜視角的草皮／紅土／看板更銳利） ================= */
  const TKEYS = ['map', 'bumpMap', 'alphaMap', 'emissiveMap', 'specularMap', 'normalMap'];
  function sharpen() {
    scene.traverse(o => { const ms = o.material; if (!ms) return; for (const m of (Array.isArray(ms) ? ms : [ms])) for (const k of TKEYS) { const t = m[k]; if (t && t.isTexture && t.anisotropy < HD.maxAn) { t.anisotropy = HD.maxAn; } } });
  }
  sharpen();

  /* ================= 6) 逐幀：陰影濃淡與顏色隨天氣／日夜變化；定期把新出現的零件補上陰影旗標 ================= */
  let lastSweep = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    try {
      const nt = !!(typeof G !== 'undefined' && G.night), sI = sun.intensity, hI = hemi.intensity, fl = flood1.intensity + flood2.intensity + flood3.intensity;
      const frac = sI / Math.max(.05, sI + hI * .9 + fl * .7);      // 主光佔全部光量的比例：越高，影子越濃越清楚
      let op = Math.min(.46, frac * .72);
      if (typeof G !== 'undefined') { const rn = (G.rain || 0), hz = (G.haze || 0); op *= (1 - Math.min(1, rn * 1.6) * .85) * (1 - hz * .35); }
      const k = (catcherMat.opacity += (op - catcherMat.opacity) * .12);      // 緩變：雲遮日時影子慢慢淡去，不會閃
      if (nt) catcherMat.color.setRGB(.025, .03, .05); else catcherMat.color.setRGB(.045, .085, .15);
      catcher.visible = k > .012; HDU.amb.value = Math.max(.3, Math.min(1.3, (.3 + sI * .55 + hI * .45) * (nt ? .8 : 1)));
      const rf = Math.max(.12, Math.min(1.1, (sI + hI * .5) / 1.1)) * (nt ? .55 : 1); for (const m of REFL) m.reflectivity = m.userData.rk * rf;
      const wet = (typeof G !== 'undefined' && G.rain) ? Math.min(1, G.rain * 1.8) : 0;      // 下雨：草地／紅土變濕，出現天空的反光
      for (const gm of [grass.material, skin.material, moundMesh.material]) { const v = .02 + wet * .32; gm.specular.setRGB(v, v, v * 1.05); gm.shininess = 6 + wet * 60; }
      if (now - lastSweep > 800) {
        lastSweep = now; R.sweeps++;
        for (let i = R.rigs.length - 1; i >= 0; i--) { const r = R.rigs[i]; if (!r.root.parent && now - r._hdT > 8000) { R.rigs.splice(i, 1); continue; } tagRig(r); }
        if (R.sweeps < 12 || R.sweeps % 15 === 0) sharpen();
      }
    } catch (e) { if (!R._err) { R._err = 1; console.error('HDR tick', e); } }
  }
  if (!LOW && !(HD.caps && HD.caps.post)) { try { renderer.domElement.style.filter = 'contrast(1.05) saturate(1.1)'; } catch (e) { } }      // v1.3.3：後製管線可用時，調色（對比／飽和）改在 13zq 的 shader 內做，不再用 CSS 濾鏡      // 輕微提高對比與飽和：畫面更鮮明
  requestAnimationFrame(tick);
  R.hdLight = hdLight; R.tagRig = tagRig; R.sharpen = sharpen;
  return R;
})();

/* ================= 7) 熱流改版：一陣一陣冒出的暖色熱煙（柔軟光團緩緩上升、擴散、淡出），不再有條紋／紋路 =================
   覆蓋 13zm 的 heatShimmer／heatGlare（呼叫端 12-systems／13zi 的 wxfScorch 都是執行時才查全域名稱，所以覆蓋有效）。
   每團熱煙有自己的週期與相位，再乘上一條很慢的「陣風」包絡，所以會成群湧出、再安靜一會兒，不是連續的整片波紋。 */
if (HDR.on) {
  const PUFF = []; { let sd = 5; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 12; i++) PUFF.push({ x: .06 + r() * .88, y: .42 + r() * .2, per: 4.5 + r() * 4, ph: r() * 20, w: 90 + r() * 90, drift: (r() - .5) * 30 }); }
  heatShimmer = function (c, W, H, dpr, t, k) {
    if (!(k > .02)) return; k = Math.min(1, k);
    const burst = Math.pow(Math.max(0, Math.sin(t * .32) * .6 + Math.sin(t * .13 + 1.7) * .5 + .35), 1.4);      // 緩慢的陣風包絡：有時成群、有時安靜
    c.save();
    for (const p of PUFF) {
      const u = ((t + p.ph) / p.per) % 1, env = Math.sin(Math.PI * u), a = .06 * k * env * env * (.25 + .75 * Math.min(1, burst * 1.3));
      if (a < .004) continue;
      const cx = p.x * W + p.drift * u * dpr, cy = (p.y - .05 * u) * H - u * 46 * dpr, rw = p.w * dpr * (.7 + .8 * u), rh = rw * .42;
      c.save(); c.translate(cx, cy); c.scale(1, rh / rw);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rw); g.addColorStop(0, `rgba(255,236,205,${a.toFixed(3)})`); g.addColorStop(.5, `rgba(255,214,160,${(a * .45).toFixed(3)})`); g.addColorStop(1, 'rgba(255,205,150,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, rw, 0, 6.2832); c.fill(); c.restore();
    }
    c.restore();
  };
  heatGlare = function () { };      // 地面條狀反光一併移除
}
