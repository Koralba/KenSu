/* ===== 13zp-gfx-quality.js ｜ v1.3.2（v1.3.3 補：後製等級 post 由 13zq 讀取 GFX.cur.post） 畫質選項（高／中／低）：設定面板「🖼 畫質」，預設高 =====
   只調整「畫面精細度」，不碰遊戲邏輯、亂數、操作與任何功能（鎖步對戰、存檔、生涯模式都不受影響）。
   載入順序：在 13zo 之後、14 之前（需要 13zn 的 HDR／sun，以及 00-hd-core.js 的 GFX 等級表）。
   各等級調整的項目（等級表在 00-hd-core.js 的 GQ）：
     解析度　高：桌機最高 2.25 倍像素比（低 DPR 螢幕以 1.6 倍超取樣）／中：最高 1.5 倍、不超取樣／低：1 倍再乘 .85
     陰影　　高：即時柔邊陰影（4096／手機 2048）／中：一般邊緣、2048（手機 1024）／低：關閉（連只畫陰影的地板一起不畫）
     表面細節　高：草皮紅土顆粒＋微凹凸＋布料織紋／中：只留顆粒色差／低：全關
     貼圖各向異性　高：裝置最大／中：4／低：1　　畫面濾鏡（對比＋飽和）：低關閉
     抗鋸齒　低＝關（MSAA 只能在建立 WebGL 時決定，所以切換「低」之前／之後需重新整理頁面才會生效；面板會提示）
   動態解析度（adaptQuality）照常運作，會在這個等級的基礎上再視幀率微調。
   網址 ?gfx=low／mid／high 可臨時指定（不會寫入設定）。 */
(function () {
  'use strict';
  if (typeof GFX === 'undefined' || typeof renderer === 'undefined' || typeof scene === 'undefined') return;
  const hdr = (typeof HDR !== 'undefined' && HDR.on) ? HDR : null, MAXAN = HD.maxAn || 8, TKEYS = ['map', 'bumpMap', 'alphaMap', 'emissiveMap', 'specularMap', 'normalMap'];
  const SM0 = (typeof sun !== 'undefined' && sun.shadow) ? sun.shadow.mapSize.x : 2048, AA0 = (() => { try { return !!renderer.getContext().getContextAttributes().antialias; } catch (e) { return true; } })();
  GFX.aaLive = AA0;

  /* 低畫質：13zn 每幀會把「只畫陰影的地板」設成可見；用屬性覆蓋，低畫質時一律不畫 */
  if (hdr && hdr.catcher) { let v = hdr.catcher.visible; Object.defineProperty(hdr.catcher, 'visible', { configurable: true, get() { return v && GFX.cur.shadow > 0; }, set(x) { v = x; } }); }

  const eachMat = fn => scene.traverse(o => { const ms = o.material; if (!ms) return; for (const m of (Array.isArray(ms) ? ms : [ms])) fn(m); });
  function applyShadow() {
    if (!hdr || typeof sun === 'undefined') return; const n = GFX.cur.shadow;
    const type = n === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap, size = n === 2 ? SM0 : Math.min(SM0, IS_TOUCH ? 1024 : 2048);
    if (renderer.shadowMap.type === type && sun.shadow.mapSize.x === size && sun.castShadow === (n > 0)) return;
    renderer.shadowMap.type = type; sun.castShadow = n > 0;
    if (sun.shadow.mapSize.x !== size || n === 0) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    eachMat(m => { m.needsUpdate = true; });      // 陰影類型變了：材質重新編譯（只在切換的當下發生一次）
  }
  function applyAniso(force) {
    const lim = Math.min(MAXAN, GFX.cur.aniso); HD.maxAn = lim;
    eachMat(m => { for (const k of TKEYS) { const t = m[k]; if (t && t.isTexture && t.anisotropy !== lim && (t.anisotropy > lim || force)) { t.anisotropy = lim; t.needsUpdate = true; } } });
  }
  function applyFilter() { try { const post = typeof POST !== 'undefined' && POST.on && GFX.cur.post > 0; renderer.domElement.style.filter = (!post && GFX.cur.filter && hdr && !IS_TOUCH) ? 'contrast(1.05) saturate(1.1)' : ''; } catch (e) { } }      // v1.3.3：後製管線（13zq）接手調色時不再疊 CSS 濾鏡

  const seg = document.getElementById('gfxSeg'), note = document.getElementById('gfxNote'), aaN = document.getElementById('gfxAA');
  const DESC = { high: '預設。最精細：視野貼合的高精度陰影、環境光遮蔽（腳下／壘包接觸陰影）、發光暈染、銳化抗鋸齒與調色、草皮／布料細節、高解析度。', mid: '陰影、解析度與後製降階（較少取樣的環境光遮蔽與暈染）、保留草皮顏色細節；適合一般手機或筆電。', low: '關閉陰影、後製與表面細節，降低解析度與抗鋸齒；給較舊或低階設備。' };
  function syncUI() {
    if (seg) [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.g === GFX.level));
    if (note) note.textContent = DESC[GFX.level];
    if (aaN) { const post = typeof POST !== 'undefined' && POST.on && GFX.cur.post > 0, need = !post && GFX.cur.aa !== AA0 && !(GFX.cur.aa && AA0); aaN.classList.toggle('hide', !need); }      // v1.3.3：高／中畫質由後製的 FXAA 負責抗鋸齒（不需 MSAA），所以不必重新整理
  }
  function applyAll(first) {
    GFX.cur = GFX.T[GFX.level]; HD.gfxD.value = GFX.cur.detail;
    try { applyShadow(); } catch (e) { console.error('[gfx shadow]', e); }
    try { applyAniso(!first); } catch (e) { console.error('[gfx aniso]', e); }
    applyFilter();
    if (typeof AQ !== 'undefined') { AQ.q = 1; AQ.up = 0; }      // 動態解析度從新等級重新評估
    try { resize(); } catch (e) { }
    syncUI();
  }
  GFX.set = function (lv) { if (!GFX.T[lv] || lv === GFX.level) { syncUI(); return; } GFX.level = lv; try { localStorage.setItem('cpbl_gfx', lv); } catch (e) { } applyAll(false); };
  if (seg) seg.addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (!b) return; GFX.set(b.dataset.g); b.blur(); });
  /* v1.4.3 幀率上限（PACE，00-hd-core.js）：自動＝觸控裝置 60fps（120Hz 螢幕每兩個 vsync 畫一幀，間隔恆定）、桌機不限；30＝省電／更穩；不限＝跟著螢幕更新率（120Hz 螢幕會跑 120，但高畫質後製很難撐住，容易忽快忽慢） */
  const fseg = document.getElementById('fpsSeg'), fnote = document.getElementById('fpsNote');
  const FDESC = { auto: '自動：手機／平板鎖定 60 幀，畫面間隔平均、發熱較少；桌機不限制。', 30: '30 幀：最省電、最不容易掉幀，動作感較不流暢。', 0: '不限：依螢幕更新率（120Hz 螢幕最高 120 幀）。高畫質很難穩定撐住，可能忽快忽慢。' };
  function fkey() { return (typeof PACE === 'undefined') ? 'auto' : PACE.auto ? 'auto' : String(PACE.cap); }
  function syncFps() { if (typeof PACE === 'undefined') return; const k = fkey(); if (fseg) [...fseg.children].forEach(b => b.classList.toggle('on', b.dataset.f === k)); if (fnote) fnote.textContent = FDESC[k] || ('上限 ' + k + ' 幀'); }
  if (fseg) fseg.addEventListener('click', e => { const b = e.target.closest('button[data-f]'); if (!b || typeof PACE === 'undefined') return; PACE.set(b.dataset.f); if (typeof AQ !== 'undefined') { AQ.acc = 0; AQ.n = 0; } syncFps(); b.blur(); });
  syncFps();
  setInterval(() => { if (GFX.cur.aniso < MAXAN) { try { applyAniso(false); } catch (e) { } } }, 6000);      // 13zn 週期性把貼圖拉回最大各向異性；中／低畫質時定期壓回
  applyAll(true);
})();
