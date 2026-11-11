/* ===== 00-hd-core.js ｜ v1.3.0 高畫質核心：逐像素光照材質／圓頂球棒幾何／細節貼圖工具 =====
   載入順序 0/14：必須在所有其他 js/*.js 之前（只依賴 three.js）。
   1) THREE.MeshLambertMaterial 改成「逐像素光照的 Phong（高光極低）」：r128 的 Lambert 是逐頂點打光，低面數的球員／場地會有
      階梯狀明暗與糊邊；改逐像素後明暗交界銳利、可吃 bumpMap、可接收陰影，而且所有既有程式碼不用改（材質建構式同名、參數相容）。
   2) HD.batGeo()：用 LatheGeometry 車出的整根球棒（握把膠帶＋底部圓球＋漸粗的棒身＋「半球形」圓潤頂端）。
   3) HD.noiseTex／HD.rnd：細節貼圖用的小工具（固定亂數種子，不影響比賽用的亂數）。 */
'use strict';
(function () {
  if (typeof THREE === 'undefined') return;
  const P = THREE.MeshPhongMaterial;
  function HDLambert(p) {
    p = Object.assign({}, p || {});
    if (p.specular === undefined) p.specular = 0x0a0a0a;      // 高光極低：看起來仍是霧面（跟原本 Lambert 一樣），只多了逐像素的明暗
    if (p.shininess === undefined) p.shininess = 8;
    const m = new P(p); m.userData.hdLambert = true; return m;
  }
  HDLambert.prototype = P.prototype;
  THREE.MeshLambertMaterial = HDLambert;

  const HD = window.HD = { ver: '1.3.4', maxAn: 16, gfxD: { value: 1 } };      // gfxD：表面細節強度（1 高／.5 中／0 低），草皮、紅土、布料的 shader 讀它

  /* ---------- v1.3.2 畫質等級（高／中／低）：只影響「畫面精細度」，不碰任何遊戲邏輯／亂數／操作 ----------
     解析度：flD/flT＝桌機／觸控的像素比下限，capD/capT＝上限，pxK＝總像素預算倍率，q＝最終倍率（再疊加 adaptQuality 動態降比例）
     shadow：2 柔邊高解析／1 一般解析度／0 關閉　detail：表面細節　aniso：貼圖各向異性上限　aa：抗鋸齒（需重新整理）　filter：畫面濾鏡 */
  const GQ = {
    high: { flD: 1.6, flT: 1.25, capD: 2.25, capT: 2.5, pxK: 1, q: 1, shadow: 2, detail: 1, aniso: 16, aa: true, filter: true, post: 2 },
    mid: { flD: 1, flT: 1, capD: 1.5, capT: 1.5, pxK: .55, q: 1, shadow: 1, detail: .5, aniso: 4, aa: true, filter: true, post: 1 },
    low: { flD: 1, flT: 1, capD: 1, capT: 1, pxK: .3, q: .85, shadow: 0, detail: 0, aniso: 1, aa: false, filter: false, post: 0 }
  };
  let gl = 'high'; try { const v = new URLSearchParams(location.search).get('gfx') || localStorage.getItem('cpbl_gfx'); if (GQ[v]) gl = v; } catch (e) { }
  window.GFX = { T: GQ, level: gl, cur: GQ[gl] };


  /* ---------- v1.3.3 硬體能力探測 ----------
     後製管線（SSAO／發光暈染／FXAA／銳化／調色）需要：WebGL2、「深度貼圖」可當 framebuffer 附件，最好還有半精度浮點（HDR）渲染目標。
     這裡用一張暫時的畫布「實際建一個 framebuffer 並檢查是否完整」，不只看有沒有擴充，所以在宣稱支援卻跑不起來的行動裝置上也能正確退回舊管線。
     結果存在 HD.caps：{ gl2, half（RGBA16F 可渲染）, depth（深度貼圖可用）, ok（可跑後製）, maxTex, maxSamples, renderer }。
     renderer 建立（02-stadium-scene.js）會讀 HD.caps.ok 決定要不要開 MSAA：後製有 FXAA＋超取樣，預設畫面緩衝再開 MSAA 只是浪費頻寬。 */
  HD.probe = function () {
    const r = { gl2: false, half: false, depth: false, ok: false, maxTex: 0, maxSamples: 0, renderer: '' };
    try {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const g = c.getContext('webgl2', { antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!g) return r;
      r.gl2 = true; r.maxTex = g.getParameter(g.MAX_TEXTURE_SIZE) | 0; r.maxSamples = g.getParameter(g.MAX_SAMPLES) | 0;
      try { const d = g.getExtension('WEBGL_debug_renderer_info'); r.renderer = d ? String(g.getParameter(d.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) { }
      const cbf = g.getExtension('EXT_color_buffer_float'), chf = g.getExtension('EXT_color_buffer_half_float');
      const test = (internal, fmt, type) => {
        const tex = g.createTexture(), dt = g.createTexture(), fb = g.createFramebuffer(); let ok = false;
        try {
          g.bindTexture(g.TEXTURE_2D, tex); g.texImage2D(g.TEXTURE_2D, 0, internal, 8, 8, 0, fmt, type, null);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
          g.bindTexture(g.TEXTURE_2D, dt); g.texImage2D(g.TEXTURE_2D, 0, g.DEPTH_COMPONENT24, 8, 8, 0, g.DEPTH_COMPONENT, g.UNSIGNED_INT, null);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
          g.bindFramebuffer(g.FRAMEBUFFER, fb);
          g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
          g.framebufferTexture2D(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.TEXTURE_2D, dt, 0);
          ok = g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE && g.getError() === 0;
        } catch (e) { ok = false; }
        g.bindFramebuffer(g.FRAMEBUFFER, null); g.deleteFramebuffer(fb); g.deleteTexture(tex); g.deleteTexture(dt); while (g.getError()) { }
        return ok;
      };
      r.depth = test(g.RGBA8, g.RGBA, g.UNSIGNED_BYTE);
      r.half = !!(cbf || chf) && test(g.RGBA16F, g.RGBA, g.HALF_FLOAT);
      r.ok = r.depth;
      const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
    } catch (e) { }
    return r;
  };
  HD.caps = HD.probe();
  { let off = false; try { off = /[?&]post=0/.test(location.search) || localStorage.getItem('cpbl_post') === '0'; } catch (e) { } HD.caps.post = HD.caps.ok && !off; }      // 後製是否會啟用（?post=0 或 localStorage.cpbl_post='0' 可關閉）

  /* ---------- 固定種子亂數 ---------- */
  HD.rnd = function (seed) { let q = (seed >>> 0) || 1; return () => { q ^= q << 13; q >>>= 0; q ^= q >> 17; q ^= q << 5; q >>>= 0; return q / 4294967296; }; };

  /* ---------- 球棒：整根車床件，頂端是真正的圓頂（半球），不再是平的圓柱截面 ----------
     座標：沿 +y 由「底部圓球」(y=0) 長到「圓頂」(y=1.425)，總長與舊版相同，所以揮棒／擊球判定完全不受影響。 */
  const BAT_L = 1.425, BAT_R = .096;
  let _batProf = null;
  function batProfile() {
    if (_batProf) return _batProf;
    const pts = [];
    const knob = [[0, 0], [.022, .0006], [.042, .004], [.057, .012], [.066, .024], [.069, .04], [.064, .058], [.052, .076], [.042, .094], [.037, .114], [.0355, .14]];
    for (const k of knob) pts.push([k[0], k[1]]);
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const yCap = BAT_L - BAT_R;      // 圓頂的球心高度：圓頂＝半徑 BAT_R 的半球
    for (let i = 1; i <= 44; i++) {      // 握把 → 漸粗的棒身（平滑 S 形過渡）→ 最粗處
      const y = .14 + (yCap - .14) * i / 44;
      const r = .0355 + (BAT_R - .0355) * Math.pow(ss(.42, 1.2, y), 1.08) + .0014 * Math.sin(y * 9);
      pts.push([Math.min(r, BAT_R), y]);
    }
    for (let i = 1; i <= 28; i++) { const t = i / 28 * Math.PI / 2; pts.push([BAT_R * Math.cos(t), yCap + BAT_R * Math.sin(t)]); }      // 半球形頂端
    pts[pts.length - 1][0] = 0;
    return _batProf = pts;
  }
  const GRIP = [.045, .045, .05], WOOD = [.93, .74, .47], WOOD2 = [.86, .62, .36];
  HD.batGeo = function (scale, centered, seg) {
    const prof = batProfile(), g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg || 48), pos = g.attributes.position, col = [];
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), ang = Math.atan2(pos.getZ(i), pos.getX(i));
      const tape = ss(.11, .15, y) * (1 - ss(.50, .54, y)) + (1 - ss(.02, .06, y)) * .0;      // 握把膠帶：y .13～.52（黑色）；底部圓球維持木色
      const knobC = 1 - ss(.045, .16, y);                                                       // 底部圓球：深色木紋
      const ring = Math.exp(-Math.pow((y - .98) / .035, 2)) * .5;                               // 棒身 Logo 帶（一圈淡深色）
      const grain = .94 + .06 * Math.sin(ang * 7 + y * 31) * Math.sin(y * 13 + ang * 3);          // 微弱木紋
      const tip = ss(BAT_L - .17, BAT_L - .02, y) * .16;                                          // 頂端稍深（打擊痕）
      const wr = WOOD[0] * (1 - knobC * .12) * grain, wg = WOOD[1] * (1 - knobC * .16) * grain, wb = WOOD[2] * (1 - knobC * .2) * grain;
      let r = wr + (GRIP[0] - wr) * tape, gg = wg + (GRIP[1] - wg) * tape, b = wb + (GRIP[2] - wb) * tape;
      r *= 1 - ring * .45 - tip * .6; gg *= 1 - ring * .5 - tip * .7; b *= 1 - ring * .6 - tip * .8;
      col.push(r, gg, b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (centered) g.translate(0, -BAT_L / 2, 0);
    if (scale && scale !== 1) g.scale(scale, scale, scale);
    g.computeBoundingSphere(); return g;
  };
  HD.batMat = new P({ color: 0xffffff, vertexColors: true, specular: 0x4a4038, shininess: 46 });      // 上了清漆的木棒：帶一點亮面高光
  HD.BAT_L = BAT_L;

  /* ---------- 噪聲貼圖（灰階高度圖）：kind = 'grass' 草葉／'dirt' 紅土顆粒／'macro' 大範圍明暗／'weave' 布料織紋 ---------- */
  HD.noiseTex = function (kind, N) {
    N = N || 512; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), r = HD.rnd(kind === 'grass' ? 7 : kind === 'dirt' ? 13 : kind === 'macro' ? 29 : 41);
    const wrap = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy); };      // 邊界環繞：貼圖可無縫重複
    g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
    if (kind === 'grass') {
      g.lineCap = 'round';
      for (let i = 0; i < N * 9; i++) {
        const x = r() * N, y = r() * N, a = r() * 6.2832, L = 3 + r() * 9, v = 40 + (r() * 190) | 0; g.strokeStyle = `rgba(${v},${v},${v},${(.35 + r() * .5).toFixed(2)})`; g.lineWidth = .6 + r() * 1.0;
        const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L, cx = (x + ex) / 2 + (r() - .5) * 3, cy = (y + ey) / 2 + (r() - .5) * 3;
        wrap((ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy); g.stroke(); });
      }
    } else if (kind === 'dirt') {
      for (let i = 0; i < N * 7; i++) {      // 細沙粒
        const x = r() * N, y = r() * N, s = .5 + r() * 1.5, v = 60 + (r() * 140) | 0; g.fillStyle = `rgba(${v},${v},${v},${(.3 + r() * .5).toFixed(2)})`;
        wrap((ox, oy) => { g.fillRect(x + ox, y + oy, s, s); });
      }
      for (let i = 0; i < N * .55; i++) {      // 小碎石：上亮下暗的小圓丘
        const x = r() * N, y = r() * N, s = 1.4 + r() * 3.2;
        wrap((ox, oy) => { const gr = g.createRadialGradient(x + ox - s * .3, y + oy - s * .3, s * .1, x + ox, y + oy, s); gr.addColorStop(0, 'rgba(235,235,235,.85)'); gr.addColorStop(.6, 'rgba(150,150,150,.5)'); gr.addColorStop(1, 'rgba(70,70,70,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, s, 0, 6.2832); g.fill(); });
      }
    } else if (kind === 'macro') {
      for (let i = 0; i < 90; i++) {      // 大塊緩變明暗（草皮濃淡、土色深淺）
        const x = r() * N, y = r() * N, s = N * (.08 + r() * .2), v = r() < .5 ? 40 : 220;
        wrap((ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, s); gr.addColorStop(0, `rgba(${v},${v},${v},.34)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x + ox - s, y + oy - s, s * 2, s * 2); });
      }
    } else if (kind === 'weave') {      // 布料：經緯交織的小方格＋細纖維
      const cell = N / 16;
      for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) { const up = (xx + yy) % 2; const gr = g.createLinearGradient(xx * cell, yy * cell, xx * cell + (up ? cell : 0), yy * cell + (up ? 0 : cell)); gr.addColorStop(0, up ? '#a8a8a8' : '#606060'); gr.addColorStop(.5, '#d0d0d0'); gr.addColorStop(1, up ? '#606060' : '#a8a8a8'); g.fillStyle = gr; g.fillRect(xx * cell + 1, yy * cell + 1, cell - 2, cell - 2); }
      g.globalAlpha = .12; for (let i = 0; i < N * 2; i++) { const v = r() < .5 ? 0 : 255; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * N, r() * N, 1, 1); } g.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = HD.maxAn; return t;
  };
})();
