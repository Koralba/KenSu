/* ===== 13zo-uniform-dirt.js ｜ v1.3.1 球衣髒汙：滑壘／撲壘／跑壘會讓球衣沾上紅土，整場比賽保留，越滑越髒 =====
   做法：
   ① 每位球員一份髒汙狀態（WeakMap，key＝球員物件；newGame 會重建球員，所以下一場自動歸零）。
      狀態 = 腳先滑壘次數 sl、撲壘次數 dv、跑壘距離 run → 轉成 0..1 的程度，放在「該球員所有 rig 共用」的 uniform。
   ② 包住 makeChibi：球衣／褲子材質改成「每位球員專屬複本」（原本同色全隊共用），
      用 onBeforeCompile 在 map_fragment 後把紅土色混進去（物件座標 3D 噪聲 → 不吃 UV、無接縫）。
      因為 uniform 是共用的：滑壘當下就變髒，下次打擊／守備／牛棚重新建立的 rig 也自動是髒的。
   ③ 每幀輪詢 E.runners／E.F 的動畫物件：出現新的 slide／hdive／dive 動畫就累加一次（不碰遊戲邏輯、不用亂數，鎖步對戰不受影響）。
   位置遮罩：腳先滑＝臀部、大腿外側／後側、小腿；頭先撲＝胸腹、前臂、膝蓋；跑壘＝褲管下緣塵土。
   關閉：網址加 ?dirt=0。除錯：DIRT.set(球員, 滑, 撲, 跑)／DIRT.all(1) 全隊最髒／DIRT.get(球員)。 */
(function () {
  'use strict';
  if (typeof makeChibi !== 'function' || typeof THREE === 'undefined') return;
  const DIRT = window.DIRT = { on: !/[?&]dirt=0/.test(location.search), fielderDive: true, errs: 0 };
  if (!DIRT.on) return;

  const REG = new WeakMap();
  const lv = (n, k) => 1 - Math.exp(-Math.max(0, n) * k);      // 飽和曲線：越髒增加越慢
  function state(pl) {
    let D = REG.get(pl);
    const tm = (typeof G !== 'undefined') ? G.teams : null;
    if (!D) { let h = 0; const s = String(pl.name || '') + (pl.num || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; D = { sl: 0, dv: 0, run: 0, u: { value: new THREE.Vector3() }, seed: (h & 1023) / 37, tm, cache: new Map() }; REG.set(pl, D); }
    else if (D.tm !== tm) { D.tm = tm; D.sl = D.dv = D.run = 0; refresh(D); }      // 跨場（球員物件被沿用，例如生涯主角）：新的一場從乾淨球衣開始
    return D;
  }
  function refresh(D) { D.u.value.set(lv(D.sl, .5), lv(D.dv, .5), lv(D.run, .085)); }
  function add(pl, kind, w) {
    if (!pl || pl.isCoach || pl.suit || !pl.name) return; const D = state(pl);
    if (kind === 'slide') D.sl += w; else if (kind === 'dive') D.dv += w; else D.run += w; refresh(D);
  }
  DIRT.get = pl => { const D = pl && REG.get(pl); return D ? { slide: D.sl, dive: D.dv, run: D.run, level: D.u.value.toArray() } : null; };
  DIRT.set = (pl, sl, dv, run) => { const D = state(pl); D.sl = sl || 0; D.dv = dv || 0; D.run = run || 0; refresh(D); };
  DIRT.all = (k) => { if (typeof G === 'undefined' || !G.teams) return; for (const t of G.teams) for (const p of [].concat(t.lineup || [], t.pitchers || [], t.bench || [])) if (p && p.name && !p.isCoach) DIRT.set(p, 3 * k, 1.5 * k, 20 * k); };
  DIRT.add = add;

  /* ---------- shader ---------- */
  const FRAG_FN = `float dnH(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float dnV(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(dnH(i), dnH(i + vec3(1.,0.,0.)), f.x), mix(dnH(i + vec3(0.,1.,0.)), dnH(i + vec3(1.,1.,0.)), f.x), f.y),
                 mix(mix(dnH(i + vec3(0.,0.,1.)), dnH(i + vec3(1.,0.,1.)), f.x), mix(dnH(i + vec3(0.,1.,1.)), dnH(i + vec3(1.,1.,1.)), f.x), f.y), f.z); }`;
  /* DPART：0 軀幹／1 上臂＋肩／2 前臂＋手肘＋袖口／3 大腿／4 小腿＋膝＋褲口／5 肚子
     yy：該零件本地 y 正規化到 -1..1（腿／手臂越負越靠近腳／手） */
  const FRAG_BODY = `
      { float dTot = uDirt.x + uDirt.y + uDirt.z;
        if (dTot > 0.004) {
          vec3 dp = vDP, dn = normalize(vDN);
          #if DPART == 6
            /* 臉：只有顴骨、鼻梁、下巴、額頭一點點塵土（最多約四成透明度），不會整張臉變黑 */
            float fr = smoothstep(.15, .75, dn.z);
            float cheek = exp(-pow((abs(dp.x) - .30) / .16, 2.) - pow((dp.y + .12) / .17, 2.));
            float nose = exp(-pow(dp.x / .09, 2.) - pow((dp.y + .08) / .14, 2.));
            float chin = smoothstep(-.28, -.5, dp.y) * fr, brow = smoothstep(.12, .3, dp.y) * fr;
            float fm = fr * (cheek * .9 + nose * .6 + chin * .7 + brow * .35);
            float fl = min(.45, uDirt.y * .65 + uDirt.x * .35 + uDirt.z * .08);
            float fn = dnV(dp * vec3(22., 14., 22.) + uDOff);
            float fa = smoothstep(.12, .42, fm * fl * 1.7 + (fn - .5) * .5) * smoothstep(0., .05, fm * fl);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.55, .38, .26), vec3(.42, .28, .18), dnV(dp * 50. + uDOff)), fa * .42);
          #elif DPART == 7
            /* 手：滑壘／撲壘撐地，手背手指有土 */
            float hl = min(.7, uDirt.x * .45 + uDirt.y * .8);
            float ha = smoothstep(.2, .6, hl + (dnV(dp * 26. + uDOff) - .5) * .7) * smoothstep(0., .05, hl);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.48, .32, .2), ha * .6);
          #else
          #if DPART == 0
            float yy = dp.y / .31;
          #elif DPART == 1 || DPART == 2
            float yy = dp.y / .125;
          #elif DPART == 5
            float yy = dp.y / .28;
          #else
            float yy = dp.y / .1375;
          #endif
          float back = smoothstep(.1, -.7, dn.z), fr = smoothstep(-.1, .7, dn.z), sd = smoothstep(.25, .9, abs(dn.x));
          float sM = 0., dM = 0., rM = 0.;
          #if DPART == 0
            sM = smoothstep(.6, -.9, yy) * (.55 + .45 * back + .25 * sd); dM = fr * (.55 + .45 * smoothstep(.4, -.8, yy));
          #elif DPART == 1
            sM = (.25 + .5 * back) * (.5 + .5 * smoothstep(.2, -1., yy)) * .8; dM = .4 + .3 * fr;
          #elif DPART == 2
            sM = .6 * smoothstep(.3, -1., yy); dM = .85;
          #elif DPART == 3
            sM = (.45 + .4 * back + .4 * sd) * (.7 + .3 * smoothstep(-1., 1., yy)); dM = fr * .7 * (.5 + .5 * smoothstep(.5, -1., yy)); rM = .18 * smoothstep(.2, -1., yy);
          #elif DPART == 4
            sM = .35 + .3 * back + .45 * sd; dM = fr * .85 + .1; rM = smoothstep(.3, -1., yy) * (.5 + .4 * (1. - fr * .5));
          #else
            sM = smoothstep(.2, -1., yy) * .5; dM = fr * .9;
          #endif
          float cov = clamp(uDirt.x * sM + uDirt.y * dM + uDirt.z * rM * .8, 0., 1.) * .82;      // 上限 .82：再髒也會露出一部分原本的布料顏色
          /* 順著肢體方向拉長的塊狀擦痕（y 方向頻率低＝沿軸線的條紋）＋細顆粒＋整體一層薄塵 */
          vec3 q = dp * vec3(15., 6., 15.) + uDOff;
          float nz = dnV(q) * .55 + dnV(q * 2.1 + 7.1) * .3 + dnV(dp * vec3(34., 12., 34.) + uDOff * 2.) * .15;
          float a = smoothstep(.3, .7, cov * 1.15 + (nz - .5) * .8) * smoothstep(0., .08, cov);
          float lum = dot(diffuseColor.rgb, vec3(.3, .59, .11));
          vec3 soil = mix(vec3(.50, .31, .17), vec3(.37, .23, .13), dnV(dp * 55. + uDOff * 1.7));      // 紅土：橘褐色，最深也是深褐，不是黑
          float edge = smoothstep(.05, .3, a) * (1. - smoothstep(.3, .75, a));
          soil *= 1. - .16 * edge;      // 塊狀邊緣稍深（擦痕邊界）
          float speck = step(.7, dnV(dp * 95. + uDOff)) * smoothstep(0., .3, cov);      // 細小土粒
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .50, .36), smoothstep(0., .5, cov) * .2 * dnV(dp * 9. + uDOff));      // 一層淡淡的塵
          diffuseColor.rgb = mix(diffuseColor.rgb, soil, clamp(a * mix(.62, .82, lum) + speck * .12, 0., .85));      // 深色球衣土色稍淡、白褲較明顯
          #endif
        } }`;
  function inject(sh, part, uDirt, off) {
    sh.uniforms.uDirt = uDirt; sh.uniforms.uDOff = off;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDP; varying vec3 vDN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDP = position; vDN = normal;');
    sh.fragmentShader = '#define DPART ' + part + '\n' + sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDP; varying vec3 vDN; uniform vec3 uDirt; uniform float uDOff;\n' + FRAG_FN)
      .replace('#include <map_fragment>', '#include <map_fragment>' + FRAG_BODY);
  }
  function dirtMat(src, part, side, D) {      // 同一位球員、同一零件、同一來源材質 → 只做一份
    const ck = part + '|' + side + '|' + src.uuid; let m = D.cache.get(ck); if (m) return m;
    m = src.clone(); const prev = src.onBeforeCompile, base = String(src.customProgramCacheKey ? src.customProgramCacheKey() : ''), key = base + '|dirt' + part;
    const off = { value: D.seed + part * 7.3 + side * 13.1 }, u = D.u;
    m.onBeforeCompile = function (sh, rd) { if (prev) prev.call(this, sh, rd); inject(sh, part, u, off); };
    m.customProgramCacheKey = () => key;
    const proto = Object.getPrototypeOf(m);
    m.clone = function () { const c = proto.clone.call(this); c.onBeforeCompile = this.onBeforeCompile; c.customProgramCacheKey = this.customProgramCacheKey; c.clone = this.clone; return c; };      // 捕手半透明（ghostRig）會再複製一次材質：複本要保留髒汙
    m.needsUpdate = true; D.cache.set(ck, m); return m;
  }
  const inside = (o, g) => { for (let p = o; p; p = p.parent) if (p === g) return true; return false; };
  function dress(rig, pl) {
    const skm = rig.head && rig.head.children[0] && rig.head.children[0].material, jm = rig.torso && rig.torso.material, th = rig.legL && rig.legL.children[0], pm = th && th.material; if (!jm || !pm || !jm.isMeshPhongMaterial) return;
    const D = state(pl), U = typeof UARM_GEO !== 'undefined' ? UARM_GEO : null, F = typeof FARM_GEO !== 'undefined' ? FARM_GEO : null, T = typeof THIGH_GEO !== 'undefined' ? THIGH_GEO : null, S = typeof SHIN_GEO !== 'undefined' ? SHIN_GEO : null;
    rig.root.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material)) return; const mt = o.material, g = o.geometry; if (mt !== jm && mt !== pm && mt !== skm) return;
      let part = -1, side = 0;
      const aL = inside(o, rig.armL), aR = inside(o, rig.armR), lL = inside(o, rig.legL), lR = inside(o, rig.legR);
      if (mt === skm && mt !== jm && mt !== pm) {      // 皮膚：臉（頭球＋耳朵）part 6、手 part 7
        if (g === GEO.head || (typeof EAR_GEO !== 'undefined' && g === EAR_GEO)) part = 6; else if (g === GEO.hand) { part = 7; side = aL ? 1 : 2; }
      } else if (mt === jm) {
        if (g === GEO.torso) part = 0;
        else if (aL || aR) part = (g === U || (g && g.type === 'SphereGeometry' && g.parameters.radius > .12)) ? 1 : (inside(o, aL ? rig.armL._fa : rig.armR._fa) ? 2 : 1);
        else if (g && g.type === 'SphereGeometry') part = 5;
        side = aL ? 1 : aR ? 2 : 0;
      } else {
        if (lL || lR) part = g === T ? 3 : (inside(o, lL ? rig.legL._ka : rig.legR._ka) ? 4 : 3);
        side = lL ? 1 : 2;
      }
      if (part >= 0) o.material = dirtMat(mt, part, side, D);
    });
  }
  { const _mk = makeChibi; makeChibi = function (o) {
      const r = _mk.apply(this, arguments);
      try { const pl = o && o.pl; if (pl && !pl.suit && !o.ump && !pl.isCoach && pl.name && r && r.root && !(r.vis && r.vis.doll)) dress(r, pl); } catch (e) { DIRT.errs++; if (DIRT.errs < 4) console.error('[dirt]', e); }
      return r;
    }; }

  /* ---------- 累加：輪詢動畫物件（每個新動畫只算一次） ---------- */
  function tick() {
    requestAnimationFrame(tick);
    try {
      if (typeof E === 'undefined' || typeof G === 'undefined' || !G.teams || !G.teams[0]) return;
      for (const r of E.runners) {
        if (!r || !r.pl || !r.rig) continue; const an = r.rig.anim;
        if (an && an !== r._dAn && (an.name === 'slide' || an.name === 'hdive')) {
          r._dAn = an; if (an.name === 'slide') add(r.pl, 'slide', 1); else add(r.pl, 'dive', an.dur < .8 ? .6 : 1);      // hdive 短（牽制回壘的撲回）算輕一點
        }
        if (r.state === 'run' || r.state === 'on') {      // 跑壘距離（以「壘間長度」為單位）
          if (r._dTo === r.to && r._dS != null) { const d = Math.abs(r.s - r._dS); if (d > 0 && d < .3) add(r.pl, 'run', d); }
          r._dTo = r.to; r._dS = r.s;
        }
      }
      if (DIRT.fielderDive && E.F) for (const k in E.F) { const f = E.F[k], an = f && f.rig && f.rig.anim; if (an && an !== f._dAn && an.name === 'dive') { f._dAn = an; add(f.pl, 'dive', .5); } }
    } catch (e) { if (!DIRT._te) { DIRT._te = 1; console.error('[dirt tick]', e); } }
  }
  requestAnimationFrame(tick);
})();
