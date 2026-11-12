/* ===== 13zq-hd-post.js ｜ v1.3.3 近似光線追蹤畫質：視野貼合陰影／螢幕空間環境光遮蔽（SSAO）＋接觸陰影／發光暈染／FXAA／銳化／調色 =====
   載入順序：在 13zp 之後、14 之前（需要 13zn 的 HDR.dir、00-hd-core.js 的 HD.caps／GFX、02 的 renderer／scene／camera／sun／hemi）。
   瀏覽器的 WebGL 做不了真正的光線追蹤，所以用業界遊戲常用的「近似」：

   A) 視野貼合的級聯陰影（CSM，2 層；畫質「高」用兩層、「中」用單層貼合）
      每幀把主光的陰影相機「貼合」到目前鏡頭實際看得到的地面範圍（畫面 5×5 條射線 → 與地面／球員身高兩個平面求交 → 轉到光源空間取包圍盒）。
      原本固定涵蓋 172 公尺見方（4096 貼圖約 4 公分一格），現在打擊視角只涵蓋約 40 公尺 → 約 1 公分一格，球員腳下／帽簷的影子邊緣細很多；
      鏡頭拉遠追飛球時範圍自動放大，不會缺影子。為了避免鏡頭微晃時影子邊緣閃爍：範圍用 1.14 倍的階梯量化＋遲滯、中心點貼齊貼圖像素格。
      bias／normalBias 依格子大小自動縮放。不使用亂數，不碰遊戲邏輯。

   B) 後製管線（只在 WebGL2＋深度貼圖可用時啟用，不然維持原本的直接繪製）
      場景 → 半精度浮點 HDR 目標（含深度貼圖）
        → SSAO（半解析度、深度重建法線、半球取樣、深度感知雙邊模糊、雙邊上取樣）：腳下、褲管、壘包、球棒與地面的接觸暗部
        → 螢幕空間接觸陰影（沿主光方向在深度圖上短距離步進）：補足陰影貼圖解析度不到的最近處細節
        → 發光暈染 Bloom（亮部閾值＋13 點降採樣／帳篷上採樣金字塔）：燈塔、看板、日光高光的柔光
        → 合成：AO／接觸陰影／Bloom → 曝光 → 高光柔肩（HDR 過亮處平滑收斂）→ 對比 S 曲線 → 飽和度 → 暗部偏冷／亮部偏暖分色 → 暈角 → 抖色（防色帶）
        → FXAA（只處理有邊緣的像素，平坦處與貼圖細節不糊）＋ CAS 式自適應銳化 → 螢幕
      調色隨日夜／下雨／霾逐幀緩變（雨天降飽和與對比、夜間暗部偏藍並加強暈染）。
   畫質等級（00-hd-core.js 的 GQ.post）：高 2＝SSAO 14 取樣＋接觸陰影 8 步＋Bloom 5 級；中 1＝SSAO 8 取樣＋接觸陰影 5 步＋Bloom 4 級；低 0＝不走後製（與 v1.3.2 相同）。
   網址參數：?post=0 關閉後製與貼合陰影（回到 v1.3.2 畫面）／?post=1、?post=2 強制等級／?fit=0 只關閉貼合陰影／?pdbg=1..4 除錯檢視（1 AO、2 接觸陰影、3 Bloom、4 深度）。
   安全：任何一步丟錯或 framebuffer 不完整 → 自動退回直接繪製（半精度浮點不行會先改用 8 位元再試一次），並在 console 印出原因；POST.err 可查。 */
'use strict';
const POST = (() => {
  const P = { ver: '1.3.4', on: false, ready: false, lv: 0, dbg: 0, err: null, fit: true, caps: (typeof HD !== 'undefined' && HD.caps) || null, info: {} };
  if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || typeof scene === 'undefined' || typeof camera === 'undefined' || typeof sun === 'undefined') return P;
  const T = THREE, qs = new URLSearchParams(location.search);
  let killAll = false; try { killAll = qs.get('post') === '0' || localStorage.getItem('cpbl_post') === '0'; } catch (e) { }
  if (killAll) return P;
  const forceLv = qs.get('post') === '1' ? 1 : qs.get('post') === '2' ? 2 : 0;
  P.dbg = +(qs.get('pdbg') || 0) | 0;
  const _render = renderer.render.bind(renderer);
  const gl = renderer.getContext();

  /* =====================================================================
     A) 視野貼合的級聯陰影（CSM，2 層）
     ===================================================================== */
  /* A1) 修補 three.js r128 的陰影 shader（全域 ShaderChunk；必須在任何材質編譯之前，所以放在本檔載入時）：
         場上有「兩顆同方向、同亮度的主光」：sun＝近層（高精度、只涵蓋鏡頭附近）、sunB＝遠層（涵蓋整個視野）。
         每個像素依它在近層陰影貼圖裡的位置算出權重 m（在近層範圍內＝1，靠邊緣 7% 平滑降到 0）：
           sun 的直射光 × m × 近層陰影，sunB 的直射光 × (1-m) × 遠層陰影 → 兩顆合起來剛好是「一顆太陽」的亮度，且層與層之間平滑過渡。
         只在兩顆都開投影（NUM_DIR_LIGHT_SHADOWS>1）時生效；其餘情況 hdCsmK 恆為 1，與原版完全相同。
         v1.4.3 效能：getShadow 前先判斷權重 > 0 才取樣——近層範圍內的像素不再白白去採遠層（反之亦然），每個像素的 PCF 軟陰影取樣（每層 9 次貼圖讀取）省下將近一半，輸出完全相同（權重為 0 的那層本來就乘 0）。
         展開迴圈（unroll_loop）的內容是「不加大括號直接貼上」，所以修補只能是運算式、不能在迴圈內宣告變數。 */
  const CSM = { want: qs.get('csm') !== '0', ok: false, on: false, orig: null, frames: 0, bad: false };
  const sunB = new T.DirectionalLight(0xffffff, 0); sunB.visible = false; sunB.castShadow = false; sunB.userData.hdCsm = 1; scene.add(sunB); scene.add(sunB.target);
  function csmInstall() {
    try {
      if (!CSM.want || (renderer.info.programs && renderer.info.programs.length)) return false;      // 已經有材質編譯過了：改不到，維持單層
      const C = T.ShaderChunk; CSM.orig = { lfb: C.lights_fragment_begin, smp: C.shadowmap_pars_fragment, smk: C.shadowmask_pars_fragment };
      const nd1 = 'directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
      const nd2a = 'DirectionalLightShadow directionalLight;\n\t#pragma unroll_loop_start', nd2b = 'shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n\t}\n\t#pragma unroll_loop_end';
      if (C.lights_fragment_begin.indexOf(nd1) < 0 || C.shadowmask_pars_fragment.indexOf(nd2a) < 0 || C.shadowmask_pars_fragment.indexOf(nd2b) < 0) return false;      // 找不到原文（three.js 版本不同）：不修補
      C.lights_fragment_begin = C.lights_fragment_begin.replace(nd1, 'directLight.color *= ( ( all( bvec2( directLight.visible, receiveShadow ) ) && hdCsmK( UNROLLED_LOOP_INDEX, vDirectionalShadowCoord[ 0 ] ) > 0.0 ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0 ) * hdCsmK( UNROLLED_LOOP_INDEX, vDirectionalShadowCoord[ 0 ] );');
      C.shadowmask_pars_fragment = C.shadowmask_pars_fragment.replace(nd2a, 'DirectionalLightShadow directionalLight;\n\tfloat hdAcc = 0.0;\n\t#pragma unroll_loop_start')
        .replace(nd2b, 'hdAcc += hdCsmK( UNROLLED_LOOP_INDEX, vDirectionalShadowCoord[ 0 ] ) * ( ( receiveShadow && hdCsmK( UNROLLED_LOOP_INDEX, vDirectionalShadowCoord[ 0 ] ) > 0.0 ) ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0 );\n\t}\n\t#pragma unroll_loop_end\n\tshadow *= hdAcc;');
      C.shadowmap_pars_fragment += `
#ifdef USE_SHADOWMAP
float hdCsmK( int idx, vec4 sc ) {
#if NUM_DIR_LIGHT_SHADOWS > 1
	vec3 c = sc.xyz / sc.w;
	float e = min( min( c.x, 1.0 - c.x ), min( c.y, 1.0 - c.y ) );
	float m = smoothstep( 0.0, 0.07, e ) * step( c.z, 1.0 ) * step( 0.0, c.z );
	return idx == 0 ? m : ( idx == 1 ? 1.0 - m : 1.0 );
#else
	return 1.0;
#endif
}
#endif
`;
      return true;
    } catch (e) { console.warn('[csm] 修補失敗，改用單層貼合陰影', e); return false; }
  }
  function csmRestore() { if (!CSM.orig) return; const C = T.ShaderChunk; C.lights_fragment_begin = CSM.orig.lfb; C.shadowmap_pars_fragment = CSM.orig.smp; C.shadowmask_pars_fragment = CSM.orig.smk; CSM.orig = null; }
  CSM.ok = csmInstall(); P.csm = CSM.ok;

  /* A2) 每層的陰影相機都貼合視野：
         畫面 5×5 條射線 → 與「地面」「球員身高(2.2m)」兩個平面求交（朝天空／太遠者改取水平 maxD 處）→ 轉到光源空間取 x／y 包圍盒。
         包圍盒取階梯量化（1.14 倍）＋遲滯、中心貼齊貼圖像素格 → 鏡頭微晃時陰影邊緣不閃爍。z 軸往光源方向多留 70 公尺，高飛球不會被裁掉。 */
  const mkFit = () => ({ halfW: 0, halfH: 0, texel: 0 });
  const FARHALF = qs.get('farhalf') !== '0';
  const FIT = { on: qs.get('fit') !== '0', near: mkFit(), far: mkFit(), cp: new T.Vector3(), L: new T.Vector3(), lx: new T.Vector3(), ly: new T.Vector3(), up: new T.Vector3(0, 1, 0), p: new T.Vector3(), pos: new T.Vector3(), n: 0 };
  const GRID = [-1, -.5, 0, .5, 1], HS = [0, 2.2], RR = 1.14;
  const qz = v => Math.max(8, Math.pow(RR, Math.ceil(Math.log(v / 8) / Math.log(RR))) * 8);
  const stepQ = (cur, need) => (!cur || need > cur || need < cur / (RR * RR * 1.05)) ? qz(need) : cur;      // 遲滯：只在需要更大、或明顯太大時才換階
  function fitLight(light, st, maxD) {
    const sh = light.shadow, SM = sh.mapSize.x; if (!SM) return;
    const cp = FIT.cp, L = FIT.L, lx = FIT.lx, ly = FIT.ly, p = FIT.p;
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
    for (const gx of GRID) for (const gy of GRID) {
      p.set(gx, gy, .5).unproject(camera);
      let dx = p.x - cp.x, dy = p.y - cp.y, dz = p.z - cp.z; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      for (const h of HS) {
        const t = dy < -1e-3 ? (h - cp.y) / dy : -1; let hx = cp.x + dx * t, hz = cp.z + dz * t;
        if (!(t > 0) || Math.hypot(hx - cp.x, hz - cp.z) > maxD) { const hl = Math.hypot(dx, dz) || 1e-6; hx = cp.x + dx / hl * maxD; hz = cp.z + dz / hl * maxD; }      // 朝天空／太遠的射線：改取水平 maxD 處的地面點
        const r = Math.hypot(hx, hz); if (r > 124) { hx *= 124 / r; hz *= 124 / r; }      // 球場以外沒有接收陰影的東西
        const X = hx * lx.x + h * lx.y + hz * lx.z, Y = hx * ly.x + h * ly.y + hz * ly.z, Z = hx * L.x + h * L.y + hz * L.z;
        if (X < mnx) mnx = X; if (X > mxx) mxx = X; if (Y < mny) mny = Y; if (Y > mxy) mxy = Y; if (Z < mnz) mnz = Z; if (Z > mxz) mxz = Z;
      }
    }
    st.halfW = stepQ(st.halfW, (mxx - mnx) / 2 * 1.04 + 1); st.halfH = stepQ(st.halfH, (mxy - mny) / 2 * 1.04 + 1);
    const tx = 2 * st.halfW / SM, ty = 2 * st.halfH / SM, cx = Math.round((mnx + mxx) / 2 / tx) * tx, cy = Math.round((mny + mxy) / 2 / ty) * ty;      // 中心貼齊貼圖像素格
    const zTop = Math.ceil((mxz + 70) / 2) * 2;
    FIT.pos.set(0, 0, 0).addScaledVector(lx, cx).addScaledVector(ly, cy).addScaledVector(L, zTop);
    light.position.copy(FIT.pos); light.target.position.copy(FIT.pos).addScaledVector(L, -1);
    const c = sh.camera; c.left = -st.halfW; c.right = st.halfW; c.bottom = -st.halfH; c.top = st.halfH; c.near = .5; c.far = Math.max(60, zTop - mnz + 8); c.updateProjectionMatrix();
    st.texel = Math.max(tx, ty); sh.bias = -.0004; sh.normalBias = Math.min(.12, Math.max(.012, st.texel * .9));
  }
  function csmSync(want) {      // 近層 sun／遠層 sunB 同步：顏色、亮度、貼圖大小；不用時 sunB 完全關閉（不加光、不投影）
    if (want !== CSM.on) { CSM.on = want; sunB.castShadow = want; sunB.visible = want; if (!want) { if (sunB.shadow.map) { sunB.shadow.map.dispose(); sunB.shadow.map = null; } sunB.shadow.autoUpdate = true; sunB.intensity = 0; } }
    if (!want) return;
    sunB.color.copy(sun.color); sunB.intensity = sun.intensity;
    const SM = sun.shadow.mapSize.x; if (sunB.shadow.mapSize.x !== SM) { sunB.shadow.mapSize.set(SM, SM); if (sunB.shadow.map) { sunB.shadow.map.dispose(); sunB.shadow.map = null; } }
  }
  function shadowStep() {
    P.fit = FIT.on; const hdrOn = typeof HDR !== 'undefined' && HDR.on && HDR.dir;
    const shLv = (typeof GFX !== 'undefined' && GFX.cur) ? GFX.cur.shadow : 2;
    const wantCsm = CSM.ok && !CSM.bad && FIT.on && hdrOn && sun.castShadow && shLv === 2;      // 級聯只在畫質「高」開（中／低維持單層貼合或關閉）
    csmSync(wantCsm);
    if (!FIT.on || !hdrOn || !sun.castShadow || !sun.shadow) return;
    const cp = FIT.cp.setFromMatrixPosition(camera.matrixWorld); FIT.L.copy(HDR.dir).normalize(); const lx = FIT.lx.crossVectors(FIT.up, FIT.L); if (lx.lengthSq() < 1e-4) lx.set(1, 0, 0); lx.normalize(); FIT.ly.crossVectors(FIT.L, lx);
    if (wantCsm) {
      const nearD = Math.max(34, Math.min(80, 28 + 1.6 * cp.y));      // 近層涵蓋「鏡頭前方約 35～80 公尺內的地面」（打擊視角約 35 公尺：本壘到二壘）
      fitLight(sun, FIT.near, nearD);
      /* v1.4.3 效能：遠層（涵蓋整個視野、約 4～9 公分一格，只用在近層範圍以外的遠處）每 2 幀才重畫一次陰影貼圖。
         遠處的球員在畫面上很小，影子晚 1 幀（60fps＝16ms）完全看不出來；近層（打擊視角下的內野、本壘區）仍然逐幀更新。
         貼圖、相機位置、矩陣都只在「更新那一幀」一起換，所以不會錯位。?farhalf=0 可關閉。 */
      const sb = sunB.shadow;
      if (FARHALF) { sb.autoUpdate = false; if (!sb.map || (FIT.n & 1) === 0) { fitLight(sunB, FIT.far, 150); sb.needsUpdate = true; } }
      else { sb.autoUpdate = true; fitLight(sunB, FIT.far, 150); }
      P.info.shadowTexelCm = [Math.round(FIT.near.texel * 1000) / 10, Math.round(FIT.far.texel * 1000) / 10]; P.info.cascadeNearD = Math.round(nearD);
    } else { fitLight(sun, FIT.far, shLv === 2 ? 150 : 120); P.info.shadowTexelCm = Math.round(FIT.far.texel * 1000) / 10; }
    FIT.n++;
    if (CSM.on && ++CSM.frames % 40 === 3) csmCheck();
  }
  function csmCheck() {      // 保險：若有 shader 編譯失敗（diagnostics.runnable === false）→ 還原原版 shader、關閉級聯、重新編譯一次
    let bad = false; try { for (const pr of (renderer.info.programs || [])) if (pr.diagnostics && pr.diagnostics.runnable === false) { bad = true; break; } } catch (e) { }
    if (!bad) return; CSM.bad = true; P.csmErr = 'shader compile failed'; console.error('[csm] 級聯陰影 shader 編譯失敗，退回單層貼合陰影');
    csmRestore(); csmSync(false); scene.traverse(o => { const ms = o.material; if (ms) for (const m of (Array.isArray(ms) ? ms : [ms])) m.needsUpdate = true; });
  }

  /* =====================================================================
     B) 後製管線
     ===================================================================== */
  const CP = P.caps;
  P.on = !!(CP && CP.post && renderer.capabilities.isWebGL2);
  if (!P.on) { renderer.render = function (s, c) { if (s === scene && c === camera) { try { shadowStep(); } catch (e) { } } return _render(s, c); }; P.ready = false; return P; }

  const LV = { 1: { ao: 8, cs: 5, aoS: .5, bloom: 4, sharp: .45, aoRad: .85 }, 2: { ao: 14, cs: 8, aoS: .5, bloom: 5, sharp: .6, aoRad: .9 } };
  const tri = new T.BufferGeometry(); tri.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); tri.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const qScene = new T.Scene(), qCam = new T.Camera(), qMesh = new T.Mesh(tri, null); qMesh.frustumCulled = false; qScene.add(qMesh);
  const VERT = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (frag, uniforms, defines) => new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, blending: T.NoBlending });
  const U = v => ({ value: v });

  const COMMON = `
    varying vec2 vUv;
    const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
    float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    float hsh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`;

  const AO_FRAG = COMMON + `
    uniform sampler2D tDepth; uniform mat4 uP; uniform mat4 uPI; uniform vec2 uTexel; uniform vec2 uNF;
    uniform float uRad; uniform float uInt; uniform float uBias; uniform vec3 uK[NS]; uniform vec3 uL; uniform float uCS;
    // 半解析度像素中心剛好落在全解析度深度貼圖的像素交界：最近鄰取樣會逐列隨機挑上／下一列 → 規律條紋。所有深度取樣統一偏移 0.25 像素落入像素內部。
    vec2 dq(vec2 uv){ return uv + uTexel * 0.25; }
    vec3 vp(vec2 uv){ float d = texture2D(tDepth, dq(uv)).r; vec4 p = uPI * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    // v1.4.3：只要視空間 z 時不必做整個 4x4 反投影（SSAO 每個像素有 14 個取樣點＋8 步接觸陰影，全是這個函式）；透視投影的封閉公式結果相同、運算量約 1/8
    float vz(vec2 uv){ float d = texture2D(tDepth, dq(uv)).r; return -2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - (d * 2.0 - 1.0) * (uNF.y - uNF.x)); }
    void main(){
      float d0 = texture2D(tDepth, dq(vUv)).r;
      if (d0 >= 0.99999) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); return; }
      vec3 P = vp(vUv);
      float fade = 1.0 - smoothstep(55.0, 130.0, -P.z);
      if (fade <= 0.001) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); return; }
      vec3 pxp = vp(vUv + vec2(uTexel.x, 0.0)), pxm = vp(vUv - vec2(uTexel.x, 0.0)), pyp = vp(vUv + vec2(0.0, uTexel.y)), pym = vp(vUv - vec2(0.0, uTexel.y));
      vec3 dx = abs(pxp.z - P.z) < abs(P.z - pxm.z) ? pxp - P : P - pxm;
      vec3 dy = abs(pyp.z - P.z) < abs(P.z - pym.z) ? pyp - P : P - pym;
      vec3 N = normalize(cross(dx, dy));
      if (dot(N, P) > 0.0) N = -N;
      float ang = hsh(gl_FragCoord.xy) * 6.2831853;
      vec3 rv = vec3(cos(ang), sin(ang), 0.0);
      vec3 Tg = normalize(rv - N * dot(rv, N)); vec3 Bt = cross(N, Tg); mat3 TBN = mat3(Tg, Bt, N);
      float bias = uBias * (1.0 + 0.06 * -P.z) + 0.00004 * P.z * P.z;
      float occ = 0.0;
      for (int i = 0; i < NS; i++) {
        vec3 sp = P + (TBN * uK[i]) * uRad;
        vec4 pr = uP * vec4(sp, 1.0); vec2 suv = pr.xy / pr.w * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
        float sz = vz(suv);
        float rc = smoothstep(0.0, 1.0, uRad / max(abs(P.z - sz), 1e-3));
        occ += (sz >= sp.z + bias ? 1.0 : 0.0) * rc;
      }
      float ao = 1.0 - clamp(occ / float(NS) * uInt, 0.0, 1.0);
      ao = mix(1.0, ao, fade);
      float cs = 1.0;
      if (uCS > 0.001) {
        float j = hsh(gl_FragCoord.xy + 17.0), hit = 0.0, b2 = 0.03 + 0.008 * -P.z + 0.00004 * P.z * P.z;
        for (int k = 0; k < CSN; k++) {
          float t = 0.04 + (float(k) + j) / float(CSN) * 0.95;
          vec3 sp = P + uL * t;
          vec4 pr = uP * vec4(sp, 1.0); vec2 suv = pr.xy / pr.w * 0.5 + 0.5;
          if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
          float diff = vz(suv) - sp.z;
          if (diff > b2 && diff < 0.45) hit = max(hit, 1.0 - t);
        }
        cs = 1.0 - hit * uCS * fade;
      }
      gl_FragColor = vec4(ao, cs, 0.0, 1.0);
    }`;

  const BLUR_FRAG = COMMON + `
    uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uDir; uniform vec2 uNF; uniform vec2 uDpx;
    float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x)); }
    void main(){
      float zc = linZ(texture2D(tDepth, vUv + uDpx * 0.25).r);
      vec2 sum = texture2D(tSrc, vUv).rg; float ws = 1.0;
      for (int i = 1; i <= 4; i++) {
        float g = exp(-float(i * i) / 8.0);
        for (int s = -1; s <= 1; s += 2) {
          vec2 uvp = vUv + uDir * float(i * s);
          float zp = linZ(texture2D(tDepth, uvp + uDpx * 0.25).r);
          float w = g * exp(-abs(zp - zc) / (0.025 * zc + 0.06));
          sum += texture2D(tSrc, uvp).rg * w; ws += w;
        }
      }
      gl_FragColor = vec4(sum / ws, 0.0, 1.0);
    }`;

  const DOWN_FRAG = COMMON + `
    uniform sampler2D tSrc; uniform vec2 uPx; uniform float uThr; uniform float uKnee;
    vec3 pf(vec3 c){ c = max(c, vec3(0.0)); float br = max(c.r, max(c.g, c.b)); float soft = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4); float k = max(soft, br - uThr) / max(br, 1e-4); return c * k; }
    vec3 S(vec2 o){ vec3 c = texture2D(tSrc, vUv + o * uPx).rgb;
    #ifdef PRE
      return pf(c);
    #else
      return c;
    #endif
    }
    void main(){
      vec3 a = S(vec2(-2.0, 2.0)), b = S(vec2(0.0, 2.0)), c = S(vec2(2.0, 2.0));
      vec3 d = S(vec2(-2.0, 0.0)), e = S(vec2(0.0, 0.0)), f = S(vec2(2.0, 0.0));
      vec3 g = S(vec2(-2.0, -2.0)), h = S(vec2(0.0, -2.0)), i = S(vec2(2.0, -2.0));
      vec3 j = S(vec2(-1.0, 1.0)), k = S(vec2(1.0, 1.0)), l = S(vec2(-1.0, -1.0)), m = S(vec2(1.0, -1.0));
      vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
      gl_FragColor = vec4(o, 1.0);
    }`;

  const UP_FRAG = COMMON + `
    uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uPx; uniform float uScatter;
    vec3 L(float x, float y){ return texture2D(tLow, vUv + uPx * vec2(x, y)).rgb; }
    void main(){
      vec3 s = L(-1.0, -1.0) + L(0.0, -1.0) * 2.0 + L(1.0, -1.0) + L(-1.0, 0.0) * 2.0 + L(0.0, 0.0) * 4.0 + L(1.0, 0.0) * 2.0 + L(-1.0, 1.0) + L(0.0, 1.0) * 2.0 + L(1.0, 1.0);
      gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + s * (uScatter / 16.0), 1.0);
    }`;

  const COMP_FRAG = COMMON + `
    uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tBloom; uniform sampler2D tDepth;
    uniform vec2 uAOpx; uniform vec2 uDpx; uniform vec2 uNF; uniform float uAO; uniform float uBloom; uniform float uExp; uniform float uContrast; uniform float uSat; uniform float uVig; uniform float uAspect;
    uniform vec3 uBloomTint; uniform vec3 uShadowT; uniform vec3 uHiT; uniform int uDebug;
    float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x)); }
    vec2 aoUp(vec2 uv, float zc){
      vec2 f = uv / uAOpx - 0.5; vec2 i0 = floor(f); vec2 fr = f - i0; vec2 base = (i0 + 0.5) * uAOpx;
      vec2 acc = vec2(0.0); float ws = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2));
        vec2 uvk = base + o * uAOpx;
        float wb = (o.x > 0.5 ? fr.x : 1.0 - fr.x) * (o.y > 0.5 ? fr.y : 1.0 - fr.y);
        float zk = linZ(texture2D(tDepth, uvk + uDpx * 0.25).r);
        float w = wb * exp(-abs(zk - zc) / (0.03 * zc + 0.08)) + 1e-5;
        acc += texture2D(tAO, uvk).rg * w; ws += w;
      }
      return acc / ws;
    }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      float d = texture2D(tDepth, vUv).r;
      vec2 a = aoUp(vUv, linZ(d));
      vec3 bl = texture2D(tBloom, vUv).rgb;
      if (uDebug == 1) { gl_FragColor = vec4(vec3(a.x), 1.0); return; }
      if (uDebug == 2) { gl_FragColor = vec4(vec3(a.y), 1.0); return; }
      if (uDebug == 3) { gl_FragColor = vec4(bl, 1.0); return; }
      if (uDebug == 4) { gl_FragColor = vec4(vec3(pow(d, 60.0)), 1.0); return; }
      float L0 = dot(max(c, vec3(0.0)), LUM);
      float aoK = mix(a.x, 1.0, smoothstep(0.75, 1.5, L0) * 0.4);
      aoK = mix(1.0, aoK, uAO);
      c *= vec3(pow(aoK, 1.10), pow(aoK, 1.0), pow(aoK, 0.92)) * a.y;
      c += bl * uBloomTint * uBloom;
      c *= uExp;
      vec3 ov = max(c - 0.9, 0.0); c = min(c, vec3(0.9)) + 0.1 * (1.0 - exp(-ov / 0.1));
      c = clamp(c, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
      float l = dot(c, LUM); c = mix(vec3(l), c, uSat);
      float sm = 1.0 - smoothstep(0.0, 0.55, l), hm = smoothstep(0.45, 1.0, l);
      c += uShadowT * sm * 0.5 + uHiT * hm * 0.5;
      vec2 q = vUv - 0.5; q.x *= uAspect; c *= 1.0 - uVig * smoothstep(0.30, 0.95, length(q) * 1.25);
      c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;

  const FIN_FRAG = COMMON + `
    uniform sampler2D tLdr; uniform vec2 uPx; uniform float uSharp;
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 T(float x, float y){ return texture2D(tLdr, vUv + vec2(x, y) * uPx).rgb; }
    void main(){
      vec3 M = T(0.0, 0.0), nw = T(-1.0, -1.0), ne = T(1.0, -1.0), sw = T(-1.0, 1.0), se = T(1.0, 1.0);
      float lM = lum(M), lNW = lum(nw), lNE = lum(ne), lSW = lum(sw), lSE = lum(se);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec3 col = M;
      if (lMax - lMin > max(0.03, lMax * 0.10)) {
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
        float dr = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
        dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + dr), -8.0, 8.0) * uPx;
        vec3 a = 0.5 * (texture2D(tLdr, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tLdr, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
        vec3 b = a * 0.5 + 0.25 * (texture2D(tLdr, vUv + dir * -0.5).rgb + texture2D(tLdr, vUv + dir * 0.5).rgb);
        float lB = lum(b); col = (lB < lMin || lB > lMax) ? a : b;
      }
      vec3 n = T(0.0, -1.0), s = T(0.0, 1.0), w = T(-1.0, 0.0), e = T(1.0, 0.0);
      vec3 mn = min(min(n, s), min(w, e)); mn = min(mn, col); vec3 mx = max(max(n, s), max(w, e)); mx = max(mx, col);
      vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
      vec3 wg = amp * (-1.0 / mix(8.0, 5.0, uSharp));
      col = clamp((col + (n + s + w + e) * wg) / (1.0 + 4.0 * wg), 0.0, 1.0);
      gl_FragColor = vec4(col, 1.0);
    }`;

  /* ---------- 資源 ---------- */
  const S = { w: 0, h: 0, lv: -1, half: !!CP.half, rt: null, ldr: null, ao: [], down: [], up: [], M: null, checked: false, sz: new T.Vector2() };
  const kernel = n => { const r = HD.rnd(90210), a = []; for (let i = 0; i < n; i++) { const v = new T.Vector3(r() * 2 - 1, r() * 2 - 1, r() * .8 + .2).normalize(); let sc = (i + 1) / n; sc = .12 + .88 * sc * sc; v.multiplyScalar(sc * (.45 + .55 * r())); a.push(v); } return a; };
  const rtOpt = type => ({ minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
  function mkRT(w, h, type, depth) {
    const o = rtOpt(type); o.depthBuffer = !!depth; const rt = new T.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), o);
    if (depth) rt.depthTexture = new T.DepthTexture(rt.width, rt.height, T.UnsignedIntType);
    rt.texture.generateMipmaps = false; return rt;
  }
  function disposeAll() {
    for (const r of [S.rt, S.ldr, ...S.ao, ...S.down, ...S.up]) if (r) { if (r.depthTexture) r.depthTexture.dispose(); r.dispose(); }
    S.rt = S.ldr = null; S.ao = []; S.down = []; S.up = [];
    if (S.M) for (const k in S.M) { const m = S.M[k]; if (Array.isArray(m)) { for (const x of m) if (x && x.dispose) x.dispose(); } else if (m && m.dispose) m.dispose(); } S.M = null;      // M.dn／M.up 是材質陣列（逐項釋放）
  }
  const UN = {      // 逐幀更新的共用 uniform
    proj: U(new T.Matrix4()), projInv: U(new T.Matrix4()), nf: U(new T.Vector2(.3, 700)), L: U(new T.Vector3(0, 1, 0)), cs: U(.8),
    ao: U(1), bloom: U(.16), exp: U(1.04), con: U(.16), sat: U(1.1), vig: U(.2), asp: U(1.78),
    bt: U(new T.Vector3(1, .97, .92)), st: U(new T.Vector3(-.03, -.005, .05)), ht: U(new T.Vector3(.05, .025, -.04)), dbg: U(P.dbg), thr: U(.9), knee: U(.25)
  };
  function build(w, h, lv) {
    disposeAll(); const C = LV[lv], ft = S.half ? T.HalfFloatType : T.UnsignedByteType;
    S.w = w; S.h = h; S.lv = lv; S.checked = false;
    S.rt = mkRT(w, h, ft, true); S.ldr = mkRT(w, h, T.UnsignedByteType, false);
    const aw = Math.max(2, Math.round(w * C.aoS)), ah = Math.max(2, Math.round(h * C.aoS)); S.ao = [mkRT(aw, ah, T.UnsignedByteType, false), mkRT(aw, ah, T.UnsignedByteType, false)];
    let bw = w, bh = h; for (let i = 0; i < C.bloom; i++) { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); S.down.push(mkRT(bw, bh, ft, false)); if (i < C.bloom - 1) S.up.push(mkRT(bw, bh, ft, false)); }
    const M = S.M = {};
    M.ao = mk(AO_FRAG, { tDepth: U(S.rt.depthTexture), uP: UN.proj, uPI: UN.projInv, uNF: UN.nf, uTexel: U(new T.Vector2(1 / w, 1 / h)), uRad: U(C.aoRad), uInt: U(1.7), uBias: U(.05), uK: U(kernel(C.ao)), uL: UN.L, uCS: UN.cs }, { NS: C.ao, CSN: C.cs });
    M.blurH = mk(BLUR_FRAG, { tSrc: U(S.ao[0].texture), tDepth: U(S.rt.depthTexture), uDir: U(new T.Vector2(1 / aw, 0)), uNF: UN.nf, uDpx: U(new T.Vector2(1 / w, 1 / h)) });
    M.blurV = mk(BLUR_FRAG, { tSrc: U(S.ao[1].texture), tDepth: U(S.rt.depthTexture), uDir: U(new T.Vector2(0, 1 / ah)), uNF: UN.nf, uDpx: U(new T.Vector2(1 / w, 1 / h)) });
    M.pre = mk(DOWN_FRAG, { tSrc: U(S.rt.texture), uPx: U(new T.Vector2(1 / w, 1 / h)), uThr: UN.thr, uKnee: UN.knee }, { PRE: 1 });
    M.dn = []; M.up = [];
    for (let i = 1; i < C.bloom; i++) M.dn.push(mk(DOWN_FRAG, { tSrc: U(S.down[i - 1].texture), uPx: U(new T.Vector2(1 / S.down[i - 1].width, 1 / S.down[i - 1].height)), uThr: UN.thr, uKnee: UN.knee }));
    for (let i = C.bloom - 2; i >= 0; i--) { const low = (i === C.bloom - 2) ? S.down[i + 1] : S.up[i + 1]; M.up[i] = mk(UP_FRAG, { tLow: U(low.texture), tHigh: U(S.down[i].texture), uPx: U(new T.Vector2(1 / low.width, 1 / low.height)), uScatter: U(.75) }); }
    const bloomTex = C.bloom > 1 ? S.up[0].texture : S.down[0].texture;
    M.comp = mk(COMP_FRAG, { tScene: U(S.rt.texture), tAO: U(S.ao[0].texture), tBloom: U(bloomTex), tDepth: U(S.rt.depthTexture), uAOpx: U(new T.Vector2(1 / aw, 1 / ah)), uDpx: U(new T.Vector2(1 / w, 1 / h)), uNF: UN.nf, uAO: UN.ao, uBloom: UN.bloom, uExp: UN.exp, uContrast: UN.con, uSat: UN.sat, uVig: UN.vig, uAspect: UN.asp, uBloomTint: UN.bt, uShadowT: UN.st, uHiT: UN.ht, uDebug: UN.dbg });
    M.fin = mk(FIN_FRAG, { tLdr: U(S.ldr.texture), uPx: U(new T.Vector2(1 / w, 1 / h)), uSharp: U(C.sharp) });
    P.info.size = [w, h]; P.info.ao = [aw, ah]; P.info.hdr = S.half; P.info.level = lv;
  }
  function run(mat, target) { qMesh.material = mat; renderer.setRenderTarget(target); _render(qScene, qCam); }

  /* ---------- 調色：隨日夜／下雨／霾逐幀緩變 ---------- */
  const G_ = () => (typeof G !== 'undefined' && G) || {}, cur = {}, lerpK = (k, t, f) => { cur[k] = cur[k] === undefined ? t : cur[k] + (t - cur[k]) * f; return cur[k]; };
  let lastT = 0, pul = 0, pulTau = .35, lamp = 0;
  const RM = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  P.pulse = (k, tau) => { if (RM || !P.ready) return; k = Math.max(0, Math.min(1, +k || 0)); if (k > pul) { pul = k; pulTau = Math.max(.12, Math.min(1.2, +tau || .35)); } };      // v1.3.4：瞬間光影脈衝（發光暈染＋曝光拉高後緩降）；由 flashScreen 等既有閃光觸發
  function grade(now) {
    const dt = Math.min(.25, Math.max(.001, (now - lastT) / 1000)); lastT = now; const f = 1 - Math.exp(-dt * 2.2), g = G_();
    const nt = !!g.night, rain = Math.min(1, (g.rain || 0) * 1.6), hz = Math.min(1, g.haze || 0);
    const dr = nt ? 0 : 1, wet = rain;      // dr：白天 1／夜間 0
    const cs = (typeof HDR !== 'undefined' && HDR.on && HDR.catcher) ? Math.min(1, HDR.catcher.material.opacity * 2.4) : .5;      // 影子濃度：陰天／雨天自然變淡
    UN.exp.value = lerpK('exp', 1.04 - wet * .02 + (nt ? .03 : 0), f);
    UN.con.value = lerpK('con', (nt ? .22 : .16) - wet * .07 - hz * .03, f);
    UN.sat.value = lerpK('sat', (nt ? 1.06 : 1.1) - wet * .2 - hz * .08, f);
    UN.vig.value = lerpK('vig', (nt ? .34 : .2) + wet * .04, f);
    UN.bloom.value = lerpK('bloom', nt ? .4 : (.14 + hz * .1 + wet * .02), f);
    UN.thr.value = lerpK('thr', nt ? .62 : .9, f); UN.knee.value = lerpK('knee', nt ? .35 : .25, f);
    pul *= Math.exp(-dt / pulTau); if (pul < .004) pul = 0; lamp += dt; P.info.pul = pul;
    const flick = nt ? (Math.sin(lamp * 1.7) * .5 + Math.sin(lamp * 4.3 + 1.3) * .25) * .035 : 0;      // 夜間燈塔光暈極輕微呼吸（±3.5%）
    UN.bloom.value *= 1 + flick; UN.bloom.value += pul * .55; UN.exp.value *= 1 + pul * .10; UN.thr.value = Math.max(.35, UN.thr.value - pul * .25); UN.vig.value += pul * .08;
    UN.ao.value = lerpK('ao', nt ? .9 : 1, f); UN.cs.value = lerpK('cs', nt ? .3 : .85 * (.25 + .75 * cs), f);
    const w = 1 - wet * .7;
    UN.st.value.set(lerpK('s0', (nt ? -.03 : -.03) * w, f), lerpK('s1', (nt ? -.005 : -.005) * w, f), lerpK('s2', (nt ? .075 : .05) * (.5 + .5 * w), f));
    UN.ht.value.set(lerpK('h0', (nt ? -.01 : .05) * w, f), lerpK('h1', (nt ? .015 : .025) * w, f), lerpK('h2', (nt ? .05 : -.04) * w, f));
    UN.bt.value.set(1, nt ? .96 : .97, nt ? .92 : .92);
    // 接觸陰影方向：白天＝太陽，夜間＝主燈塔（都是「朝向光源」的方向，轉到視空間）
    const Lw = nt ? flood1.position : (typeof HDR !== 'undefined' && HDR.dir ? HDR.dir : sun.position); UN.L.value.copy(Lw).normalize().transformDirection(camera.matrixWorldInverse);
  }

  /* ---------- 主繪製 ---------- */
  function fail(e, why) { P.err = String(e && e.message || e); P.ready = false; P.on = false; console.error('[post] ' + why + '：' + P.err + '（自動退回直接繪製）'); try { renderer.setRenderTarget(null); renderer.autoClear = true; } catch (x) { } try { disposeAll(); } catch (x) { } }
  function renderPost(s, c, lv) {
    const sz = renderer.getDrawingBufferSize(S.sz), w = sz.x | 0, h = sz.y | 0; if (w < 8 || h < 8) return _render(s, c);
    if (!S.rt || S.w !== w || S.h !== h || S.lv !== lv) build(w, h, lv);
    UN.proj.value.copy(c.projectionMatrix); UN.projInv.value.copy(c.projectionMatrixInverse); UN.nf.value.set(c.near, c.far); UN.asp.value = w / h; grade(performance.now());
    const prev = renderer.autoClear; renderer.autoClear = true; renderer.setRenderTarget(S.rt); _render(s, c);
    if (!S.checked) {      // 第一次：確認 framebuffer 完整（半精度浮點不行就改 8 位元重試一次）
      S.checked = true; const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (st !== gl.FRAMEBUFFER_COMPLETE) { renderer.autoClear = prev; renderer.setRenderTarget(null); if (S.half) { S.half = false; P.info.hdr = false; console.warn('[post] 半精度浮點渲染目標不完整，改用 8 位元'); S.lv = -1; return _render(s, c); } throw new Error('framebuffer 不完整 0x' + st.toString(16)); }
    }
    renderer.autoClear = false; const M = S.M, C = LV[lv];
    run(M.ao, S.ao[0]); run(M.blurH, S.ao[1]); run(M.blurV, S.ao[0]);
    run(M.pre, S.down[0]); for (let i = 1; i < C.bloom; i++) run(M.dn[i - 1], S.down[i]);
    for (let i = C.bloom - 2; i >= 0; i--) run(M.up[i], S.up[i]);
    run(M.comp, S.ldr); run(M.fin, null);
    renderer.autoClear = prev;
  }
  P.level = () => { if (forceLv) return forceLv; const q = (typeof GFX !== 'undefined' && GFX.cur) ? GFX.cur.post : 2; return q | 0; };
  renderer.render = function (s, c) {
    if (s !== scene || c !== camera) return _render(s, c);
    try { shadowStep(); } catch (e) { if (!FIT._err) { FIT._err = 1; console.error('[fit]', e); } FIT.on = false; try { csmSync(false); } catch (x) { } }
    const lv = P.on ? P.level() : 0; P.lv = lv;
    if (lv <= 0) { P.ready = false; return _render(s, c); }
    try { renderPost(s, c, lv); P.ready = true; } catch (e) { fail(e, '後製'); return _render(s, c); }
  };
  P.ready = false;
  try {      // 既有畫面閃光（全壘打／三振／事件）同步帶動光影脈衝；原函式照常執行，任何錯誤都不影響遊戲
    if (typeof window.flashScreen === 'function' && !window.flashScreen.__hd) {
      const o = window.flashScreen; const w = function (a) { try { P.pulse(Math.min(1, (a || .5) * 1.1), .3 + Math.min(.5, (a || .5) * .5)); } catch (e) { } return o.apply(this, arguments); }; w.__hd = 1; window.flashScreen = w;
    }
  } catch (e) { }
  P.setDebug = v => { P.dbg = v | 0; UN.dbg.value = P.dbg; };
  try { if (renderer.domElement) renderer.domElement.style.filter = ''; } catch (e) { }
  return P;
})();
