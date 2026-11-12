/* ===== 13zr-body-shape.js ｜ 球員身體曲線（v1.4.0）：不再是一根根直圓柱 =====
   問題：軀幹、上臂、前臂、大腿、小腿（球襪）、袖子全部是「上下等粗的圓柱」，看起來像直筒。
   做法：把這些「全域共用」的幾何體就地換成有曲線的版本（物件本身不換，所以 `g === GEO.torso`、`g === THIGH_GEO` 這類辨識、髒汙、創角外觀、娃娃造型全部照常運作；
        頂點順序／UV 排法與 CylinderGeometry 相同，貼圖與漸層照舊）。每個零件的「長度」與「兩端半徑」維持原樣（關節球、肩球、球鞋、骨盆接點不用動），只改中段的輪廓：
   · 軀幹：倒三角（寬肩、圓潤的斗篷肌斜坡、胸廓、收腰、下擺微開），橫截面是「超橢圓」（胸寬、背厚、不是正圓）。
   · 骨盆：髖部圓潤外擴、臀部後凸，底面封閉。
   · 上臂：三角肌＋二頭肌隆起 → 手肘收窄。前臂：靠近手肘最粗（肱橈肌）→ 手腕變細。袖子跟著前臂外廓。
   · 大腿：股四頭肌前側隆起 → 膝蓋收窄。小腿（球襪）：腓腸肌後側隆起 → 腳踝收窄。手：略扁的拳形。
   · 球衣前排扣縮短（避免飄在收腰的軀幹外）；13zn 內層襪筒（被球襪蓋住的裝飾）在腳踝變細時會穿出來，隱藏。
   · 圓形零件的邊數提高（腰帶、領口），不再看得出多邊形。
   關閉：`BODY.on=false`（要在遊戲開始前，即網址加 `?body=0`）；完全不碰姿勢、座標、碰撞與落地計算（零件總長與兩端半徑不變）。 */
'use strict';
const BODY = { on: !/[?&]body=0/.test(location.search), ver: 1 };
(function () {
  if (!BODY.on || typeof GEO === 'undefined') return;
  const sg = v => v < 0 ? -1 : 1;
  /* 曲線：Hermite 三次插值（通過每個節點，節點間平順），pts＝[[t, 值], …] */
  function curve(pts) {
    const n = pts.length, m = [];
    for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; m.push((b[1] - a[1]) / (b[0] - a[0])); }
    return t => {
      if (t <= pts[0][0]) return pts[0][1]; if (t >= pts[n - 1][0]) return pts[n - 1][1];
      let i = 0; while (t > pts[i + 1][0]) i++;
      const h = pts[i + 1][0] - pts[i][0], u = (t - pts[i][0]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * pts[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * pts[i + 1][1] + (u3 - u2) * h * m[i + 1];
    };
  }
  /* 雕塑：先做標準圓柱（單位半徑），再依高度 t（0＝底、1＝頂）把每個頂點推到 f(t) 給的橫截面上。
     f(t) → { a:左右半寬, bf:前側深, bb:後側深, zc:截面中心前後位移 }；e＝超橢圓指數（1＝正橢圓，<1 更方） */
  function sculpt(h, radial, hseg, f, caps, e) {
    const g = new THREE.CylinderGeometry(1, 1, h, radial, hseg, !caps), p = g.attributes.position, hh = h / 2;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 1e-6) { p.setXYZ(i, 0, y, 0); continue; }
      const sx = x / r, cz = z / r, o = f((y + hh) / h), zc = o.zc || 0;
      p.setXYZ(i, o.a * sg(sx) * Math.pow(Math.abs(sx), e) * r, y, (cz >= 0 ? o.bf : o.bb) * sg(cz) * Math.pow(Math.abs(cz), e) * r + zc);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal, W = radial + 1;      // 圓柱側面的縫（θ=0 的第一欄與最後一欄座標相同）：法線取平均，不留縫線
    for (let iy = 0; iy <= hseg; iy++) { const a = iy * W, b = iy * W + radial; let nx = n.getX(a) + n.getX(b), ny = n.getY(a) + n.getY(b), nz = n.getZ(a) + n.getZ(b); const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; n.setXYZ(a, nx, ny, nz); n.setXYZ(b, nx, ny, nz); }
    return g;
  }
  function swap(g, ng) {      // 把 ng 的內容放進既有的幾何體物件（辨識用的物件參照不變）
    g.setIndex(ng.index); g.setAttribute('position', ng.attributes.position); g.setAttribute('normal', ng.attributes.normal); g.setAttribute('uv', ng.attributes.uv);
    g.clearGroups(); for (const q of ng.groups) g.addGroup(q.start, q.count, q.materialIndex);
    g.type = 'BufferGeometry'; g._hull = undefined; g._pOK = undefined; g.boundingBox = null; g.boundingSphere = null;      // 不再是「標準圓柱」：落地計算改走頂點極值（已有的通用路徑）
    ng.dispose();
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---- 軀幹（高 .62，y -.31～+.31；t＝0 下擺、1 肩頸）---- */
  {
    const A = curve([[0, .270], [.12, .252], [.30, .228], [.46, .250], [.62, .306], [.76, .350], [.86, .368], [.93, .328], [1, .210]]),
      F = curve([[0, .272], [.12, .276], [.30, .280], [.46, .285], [.62, .292], [.76, .295], [.86, .286], [.93, .246], [1, .192]]),
      B = curve([[0, .280], [.12, .284], [.30, .285], [.46, .288], [.62, .293], [.76, .295], [.86, .286], [.93, .246], [1, .192]]);
    swap(GEO.torso, sculpt(.62, 40, 16, t => ({ a: A(t), bf: F(t), bb: B(t) }), true, .86));
  }
  /* ---- 骨盆（高 .2，y .4～.6；t＝0 胯下、1 腰帶）：髖外擴、臀後凸 ---- */
  if (typeof PEL_GEO !== 'undefined') {
    const A = curve([[0, .252], [.28, .290], [.62, .302], [1, .280]]), F = curve([[0, .236], [.3, .268], [.65, .278], [1, .272]]), B = curve([[0, .252], [.3, .292], [.65, .304], [1, .282]]);
    swap(PEL_GEO, sculpt(.2, 32, 6, t => ({ a: A(t), bf: F(t), bb: B(t) }), true, .9));
  }
  /* ---- 肢體：半徑＝原本線性漸縮 × 肌肉隆起曲線；s＝0 靠近近端關節（肩／髖／肘／膝）、1 遠端 ---- */
  function limb(g, h, rTop, rBot, mu, o) {
    o = o || {}; const M = curve(mu), zs = o.zs || 1, zc = o.zc || 0, ex = o.ex || 0;
    swap(g, sculpt(h, 28, 10, t => { const s = 1 - t, r = lerp(rTop, rBot, s) * M(s) + ex, bump = Math.max(0, M(s) - 1) * 6; return { a: r, bf: r * zs, bb: r * zs, zc: zc * Math.min(1, bump) }; }, false, 1));
  }
  const FA_MU = [[0, 1.0], [.22, 1.2], [.5, 1.05], [.8, .9], [1, .82]];
  if (typeof UARM_GEO !== 'undefined') limb(UARM_GEO, .25, .1, .0925, [[0, 1.02], [.2, 1.22], [.45, 1.2], [.75, 1.05], [1, .97]], { zs: 1.05, zc: .006 });      // 三角肌＋二頭肌
  if (typeof FARM_GEO !== 'undefined') limb(FARM_GEO, .25, .0925, .085, FA_MU, { zs: .96 });                                                                       // 肱橈肌 → 手腕
  if (typeof SLV_GEO !== 'undefined') {      // 袖子：外廓＝前臂外廓＋.005；袖子中心在 y=-.37（前臂座標 -.12），長 .27
    const M = curve(FA_MU);
    swap(SLV_GEO, sculpt(.27, 28, 10, t => { const y = (t - .5) * .27, s = Math.min(1, Math.max(0, (.12 - y) / .25)), r = lerp(.0925, .085, s) * M(s) + .002; return { a: r, bf: r * .96, bb: r * .96 }; }, false, 1));
  }
  if (typeof THIGH_GEO !== 'undefined') limb(THIGH_GEO, .275, .13, .1225, [[0, 1.0], [.24, 1.16], [.5, 1.12], [.8, 1.0], [1, .93]], { zs: 1.06, zc: .008 });      // 股四頭肌
  const CALF = [[0, .98], [.2, 1.14], [.4, 1.12], [.7, .9], [1, .78]];
  if (typeof SHIN_GEO !== 'undefined') limb(SHIN_GEO, .275, .1225, .115, CALF, { zs: 1.03, zc: -.012 });                                                                // 小腿（褲管內層）
  if (typeof SOCK_GEO !== 'undefined') limb(SOCK_GEO, .27, .127, .117, CALF, { zs: 1.03, zc: -.012, ex: .002 });                                                       // 球襪＝可見的小腿；腓腸肌 → 腳踝
  /* ---- 手：略扁的拳形（原本是正球）---- */
  { const p = GEO.hand.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * .88, p.getY(i) * 1.06, p.getZ(i) * .96); GEO.hand.computeVertexNormals(); GEO.hand.boundingBox = null; GEO.hand.boundingSphere = null; GEO.hand._pOK = undefined; GEO.hand._hull = undefined; }

  /* ---- 每個球員：微調依附在軀幹上的零件 ---- */
  function refit(r) {
    if (!r || !r.body || r._bodyFit) return; r._bodyFit = 1;
    for (const c of r.body.children) {      // 前排扣：縮短到胸口以下不外露（收腰、領口的軀幹表面比原本圓柱凹）
      const g = c.geometry; if (g && g.type === 'BoxGeometry' && g.parameters && Math.abs(g.parameters.width - .035) < .001 && Math.abs(g.parameters.height - .5) < .001) { c.scale.y = .78; c.position.y = .875; }
    }
    for (const l of [r.legL, r.legR]) {      // 褲側線：大腿變粗後會陷進去 → 外移並依漸縮傾斜貼著大腿表面
      const sx = l === r.legL ? -1 : 1; for (const c of l.children) if (c.geometry === STRIPE_GEO) { c.position.x = sx * .141; c.rotation.z = -sx * .116; }
    }
    for (const a of [r.armL, r.armR]) for (const c of a.children) { const g = c.geometry; if (g && g.type === 'SphereGeometry' && g.parameters && Math.abs(g.parameters.radius - .125) < .001) c.scale.set(1.12, 1.06, 1.1); }      // 肩球（三角肌頭）加大
    for (const l of [r.legL, r.legR]) {      // 13zn 的內層襪筒：腳踝變細後會從球襪下緣穿出，隱藏
      const ka = l && l._ka; if (!ka) continue;
      for (const c of ka.children) { const g = c.geometry; if (g && g.type === 'CylinderGeometry' && g.parameters && Math.abs(g.parameters.radiusTop - .118) < .001) c.visible = false; }
    }
  }
  { const _mk = makeChibi; makeChibi = function () { const r = _mk.apply(this, arguments); try { refit(r); } catch (e) { console.error('[body]', e); } return r; }; }
})();
