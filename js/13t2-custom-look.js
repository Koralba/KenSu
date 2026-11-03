/* ===== 13t2-custom-look.js ｜ 生涯角色外觀擴充：50 種髮型（每種輪廓明顯不同）、娃娃款五官（鼻線／鼻水／腮紅款式）、浴衣造型、遮陽帽 =====
   只改「外觀」：不動比賽邏輯、能力值、判定、亂數。只對生涯角色（CAREER.vis 輸出的 vis.hx===1）生效；電腦球員、教練、裁判完全不受影響。
   做法：
   ① 包住 03 的 addHairEars：vis.hx 的角色改用本檔的髮型庫（耳朵／眼鏡／髮帶／鬍子／耳環等配件仍由原函式畫，只是把 hair 換成 'bald'，kr 韓系沿用原本的）。
      每種髮型分「低處」（戴帽也看得到：帽簷下的鬢髮、後腦、馬尾、髮髻、穿出帽頂的尖刺…）與「頭頂」（脫帽／遮陽帽才看得到：瀏海、分線、髮量、旋渦）。
   ② 包住 makeChibi（要在 13t 之後載入，才看得到表情層）：建完人物後加上 臉部附加物（鼻型 5～8、鼻水、腮紅款式）、造型服裝（浴衣：布紋貼圖、腰帶、領口、袖子、手臂顏色）、遮陽帽。
   新增角色欄位（13c 的 sanitize 會補預設）：cheek 0～5、snot 0～2、outfit 0～1、pat 0～3、fabCol、fanCol、armCol（''＝膚色／球衣）、collarCol，hatMode 多一個 'visor'；eyeType 到 8、brow 到 6、nose 到 8、mouth 到 8。
   關閉：LOOK.on=false（髮型／附加物／服裝都回到原樣；hair 為新名稱時會變成光頭）。 */
'use strict';
const LOOK = { on: true, tex: {}, ver: 1 };
const LK_PI = Math.PI, LK_TAU = Math.PI * 2;
const LK_OLD = { kr: 1 };      // 沿用 03 原本實作的髮型

/* =========================================================
   A. 髮型庫
   ========================================================= */
function lookHair(head, vis, open) {
  const PI = LK_PI, TAU = LK_TAU, hm = mat(vis.hairCol), tm = mat(vis.tipCol), hd = mat(shadeHex(vis.hairCol, .78)), hl = mat(shadeHex(vis.hairCol, 1.2)), Y = new THREE.Vector3(0, 1, 0);
  const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m || hm); if (x != null) o.position.set(x, y, z); head.add(o); return o; };
  const sph = (r, x, y, z, sx, sy, sz, m) => { const o = add(new THREE.SphereGeometry(r, 10, 8), m, x, y, z); o.scale.set(sx || 1, sy || 1, sz || 1); return o; };
  const bx = (w, h, d, x, y, z, rx, ry, rz, m) => { const o = add(new THREE.BoxGeometry(w, h, d), m, x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); return o; };
  const cyl = (rt, rb, len, x, y, z, rx, ry, rz, m) => { const o = add(new THREE.CylinderGeometry(rt, rb, len, 8), m, x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); return o; };
  const cone = (rad, len, px, py, pz, dx, dy, dz, m) => { const d = new THREE.Vector3(dx, dy, dz).normalize(), o = add(new THREE.ConeGeometry(rad, len, 7), m); o.position.set(px, py, pz).addScaledVector(d, len / 2); o.quaternion.setFromUnitVectors(Y, d); return o; };
  const capp = (r, t0, tl, p0, pl, sy, m) => { const o = add(new THREE.SphereGeometry(r, 20, 12, p0, pl, PI * t0, PI * tl), m); if (sy) o.scale.y = sy; return o; };
  const nape = (len, r, p0, pl) => capp(r || .536, .5, len, p0 == null ? PI * .78 : p0, pl == null ? PI * 1.44 : pl);      // 帽簷下的一圈（兩側＋後腦）
  const LINE = { slick: .27, pomp: .26, undercut: .3, fade: .3, quiff: .3, combover: .3, sidepart: .33, texcrop: .34, buzz: .38, long: .39, kr: .4, short: .44, bowl: .47, hime: .46, airbang: .44, bob: .45, jellyfish: .45, layered: .42, mid: .36, curtain: .34, sweep: .42 }, GAPR = { slick: .75, pomp: .8, undercut: .7, fade: .7, quiff: .75, combover: .7, sidepart: .6, bowl: .3, hime: .35, bob: .35, airbang: .45 };
  const scalp = (r, th, gap, sy, m) => { const o = capp(r, 0, LINE[vis.hair] || th, PI / 2 + (GAPR[vis.hair] || gap), TAU - 2 * (GAPR[vis.hair] || gap), sy, m); const st = vis.hair; if (st === 'slick' || st === 'pomp' || st === 'undercut') cone(.07, .14, 0, .3, .5, 0, -1, .15, hd); if (st === 'curtain' || st === 'mid' || st === 'layered') bx(.025, .03, .5, 0, .56, .02, 0, 0, 0, hd); if (st === 'sidepart' || st === 'quiff') bx(.025, .03, .5, -.14, .555, .02, 0, 0, 0, hd); if (st === 'bowl' || st === 'hime' || st === 'bob') bx(.74, .02, .06, 0, .15, .52, 0, 0, 0, hd); return o; };                                  // 頭頂（前額留出髮際線；gap＝前額缺口半角）
  const full = (r, th, sy) => capp(r, 0, th, 0, TAU, sy);
  const bangs = (n, spread, y, len, tilt, w, m) => { for (let i = 0; i < n; i++) { const a = (i / (n - 1) - .5) * spread; bx(w, len, .06, Math.sin(a) * .5, y - len / 2 + .04, Math.cos(a) * .5, -tilt, a, 0, m); } };
  const sideLocks = (len, w, y, z) => { for (const s of [-1, 1]) bx(w || .1, len, .2, s * .5, (y == null ? -.08 : y) - len / 2, z == null ? .02 : z); };
  const chain = (n, x, y, z, dx, dy, dz, r0, r1, m) => { for (let i = 0; i < n; i++) { const t = i / Math.max(1, n - 1); sph(r0 + (r1 - r0) * t, x + dx * i, y + dy * i, z + dz * i, 1, 1.12, 1, m); } };
  const ring = (r, x, y, z, rx, ry, rz, m) => { const o = add(new THREE.TorusGeometry(r, .026, 6, 14), m || tm, x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); return o; };
  const rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const dome = (n, r, t0, t1, rad, k, sy) => { for (let i = 0; i < n; i++) { const th = PI * (t0 + (t1 - t0) * rnd(i, k)), ph = TAU * rnd(i, k + 5); sph(rad * (.85 + .3 * rnd(i, k + 9)), Math.sin(th) * Math.cos(ph) * r, Math.cos(th) * r * (sy || 1), Math.sin(th) * Math.sin(ph) * r); } };
  const H = {};
  H.bald = () => { };
  H.buzz = () => { nape(.07, .53, PI * .85, PI * 1.3); if (open) scalp(.536, .43, .55); };
  H.short = () => { nape(.12, .535, PI * .8, PI * 1.4); if (open) { scalp(.552, .4, .5); bangs(7, 1.5, .19, .12, .25, .12); } };
  H.undercut = () => { nape(.06, .53, PI * .82, PI * 1.36); sph(.1, 0, .16, -.5, 1.8, 1, .6); if (open) { scalp(.535, .46, .55); bx(.5, .2, .62, 0, .45, .02, .08); bx(.44, .14, .14, 0, .5, .38, -.55); } };
  H.flip = () => { nape(.12, .535, PI * .8, PI * 1.4); for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 3.0; sph(.085, Math.sin(a) * .55, -.02 - (i % 2) * .05, -Math.cos(a) * .55, 1, 1.3, 1.7); } if (open) { scalp(.552, .4, .5); for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 1.5; bx(.1, .16, .08, Math.sin(a) * .5, .22, Math.cos(a) * .5, .8, a, 0); } } };
  H.mid = () => { nape(.2, .54, PI * .75, PI * 1.5); sideLocks(.34, .1); if (open) { scalp(.552, .4, .5); for (const s of [-1, 1]) bx(.3, .26, .07, s * .15, .26, .45, -.45, 0, s * -.5); } };
  H.curtain = () => { nape(.15, .536, PI * .78, PI * 1.44); sideLocks(.26, .1); if (open) { scalp(.545, .38, .62); for (const s of [-1, 1]) { bx(.3, .3, .07, s * .17, .27, .45, -.5, 0, s * -.55); bx(.2, .26, .07, s * .36, .12, .36, -.4, s * .6, s * -.4); } } };
  H.wavy = () => { nape(.18, .538, PI * .75, PI * 1.5); for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) { const a = (i / 7 - .5) * 3.2; sph(.095, Math.sin(a) * (.53 + r * .03), -.06 - r * .13, -Math.cos(a) * (.53 + r * .03)); } if (open) { scalp(.552, .4, .5); for (let i = 0; i < 5; i++) { const a = (i / 4 - .5) * 1.7; sph(.1, Math.sin(a) * .5, .2 + (i % 2) * .03, Math.cos(a) * .5, 1, 1.3, 1); } } };
  H.curly = () => { nape(.1, .53, PI * .8, PI * 1.4); for (let i = 0; i < 14; i++) { const ph = PI * (.85 + 1.3 * i / 13), th = PI * (.53 + (i % 2) * .08); sph(.1, -.54 * Math.cos(ph) * Math.sin(th), .54 * Math.cos(th), .54 * Math.sin(ph) * Math.sin(th)); } if (open) dome(22, .52, .05, .42, .12, 3); };
  H.long = () => { nape(.24, .54, PI * .75, PI * 1.5); bx(.7, .9, .14, 0, -.5, -.4, .1); sideLocks(.8, .11, -.06, .0); if (open) { scalp(.552, .4, .5); bangs(6, 1.5, .2, .16, .3, .14); } };
  H.bob = () => { nape(.2, .54, PI * .75, PI * 1.5); bx(.74, .36, .15, 0, -.18, -.43); for (const s of [-1, 1]) bx(.1, .38, .36, s * .5, -.12, -.06); if (open) { scalp(.56, .42, .5); bx(.66, .14, .06, 0, .13, .5, -.15); } };
  H.mullet = () => { nape(.16, .538, PI * .78, PI * 1.44); bx(.62, .66, .16, 0, -.42, -.42, .12); for (const s of [-1, 1]) bx(.1, .3, .22, s * .47, -.18, -.1); if (open) { scalp(.552, .38, .5); for (let i = 0; i < 6; i++) { const a = (i / 5 - .5) * 1.5; cone(.06, .2, Math.sin(a) * .46, .26, Math.cos(a) * .46, Math.sin(a) * .4, .8, Math.cos(a) * .4); } } };
  H.pony = () => { nape(.12, .535, PI * .8, PI * 1.4); sph(.1, 0, .02, -.57, 1, 1, 1, tm); cyl(.09, .03, .5, 0, -.26, -.66, -.1); cyl(.03, .09, .3, 0, -.62, -.7, -.1, 0, 0, hm); if (open) { scalp(.552, .4, .5); bangs(5, 1.1, .2, .1, .2, .13); } };
  H.lowpony = () => { nape(.14, .536, PI * .78, PI * 1.44); sph(.085, 0, -.12, -.56, 1, 1, 1, tm); cyl(.1, .045, .5, 0, -.42, -.6, -.05); cyl(.045, .02, .24, 0, -.78, -.6, 0, 0, 0); if (open) { scalp(.552, .4, .5); bangs(5, 1.2, .2, .1, .2, .13); } };
  H.bun = () => { nape(.12, .535, PI * .8, PI * 1.4); sph(.2, 0, .24, -.5); ring(.18, 0, .24, -.5, 0, PI / 2, 0); if (open) { scalp(.552, .4, .5); bangs(5, 1.1, .2, .1, .2, .13); } };
  H.topknot = () => { nape(.1, .535, PI * .8, PI * 1.4); sph(.2, 0, .66, -.04); ring(.14, 0, .53, -.04, PI / 2, 0, 0); if (open) scalp(.552, .4, .5); };
  H.braid = () => { nape(.12, .535, PI * .8, PI * 1.4); for (const x of [-.2, .2]) { chain(6, x, -.1, -.5, 0, -.16, -.03, .105, .068); sph(.062, x, -.1 - 6 * .16, -.5 - 6 * .03, 1, 1, 1, tm); } if (open) { scalp(.552, .4, .5); bx(.03, .06, .8, 0, .55, -.02, 0, 0, 0, tm); } };
  H.twinbraid = () => { nape(.12, .535, PI * .8, PI * 1.4); for (const s of [-1, 1]) { chain(7, s * .46, -.06, .0, s * .02, -.15, .04, .105, .066); sph(.06, s * .46 + s * .14, -.06 - 7 * .15, .24, 1, 1, 1, tm); } if (open) { scalp(.552, .4, .5); bangs(6, 1.3, .2, .12, .25, .12); } };
  H.cornrow = () => { nape(.1, .535, PI * .8, PI * 1.4); for (let i = 0; i < 5; i++) { const x = (i - 2) * .15; bx(.05, .46, .05, x, -.02, -.5 + Math.abs(i - 2) * .03); sph(.04, x, -.27, -.5 + Math.abs(i - 2) * .03, 1, 1, 1, tm); } if (open) { scalp(.536, .43, .5); for (let i = 0; i < 5; i++) { const x = (i - 2) * .14, rz = Math.sqrt(Math.max(.01, .34 - x * x)); for (let j = 0; j < 7; j++) { const t = j / 6, th = PI * (.07 + .34 * t) * 1; const y = Math.cos(th) * .565 * .99, zz = Math.sin(th) * .55 * (1 - Math.abs(x) * .6); sph(.032, x, y, zz * 1, 1, 1, 1); sph(.032, x, y, -zz * 1); } } } };
  H.twist = () => { nape(.1, .535, PI * .8, PI * 1.4); for (let i = 0; i < 18; i++) { const a = (i % 9 / 8 - .5) * 3.2, row = i < 9 ? 0 : 1; sph(.075, Math.sin(a) * (.52 + row * .04), -.02 - row * .14, -Math.cos(a) * (.52 + row * .04), 1, 1.9, 1); } if (open) { scalp(.536, .43, .55); for (let i = 0; i < 16; i++) { const th = PI * (.06 + .34 * rnd(i, 2)), ph = TAU * rnd(i, 7); cone(.055, .26, Math.sin(th) * Math.cos(ph) * .5, Math.cos(th) * .5, Math.sin(th) * Math.sin(ph) * .5, Math.sin(th) * Math.cos(ph) * .8, 1, Math.sin(th) * Math.sin(ph) * .8); } } };
  H.dreads = () => { nape(.15, .54, PI * .78, PI * 1.44); const n = 11; for (let i = 0; i < n; i++) { const a = (i / (n - 1) - .5) * 2.4, L = .72 * (.78 + ((i * 37) % 5) * .1), g = new THREE.Group(); g.position.set(Math.sin(a) * .5, -.06, -Math.cos(a) * .5); g.rotation.set(.12, 0, Math.sin(a) * .22); const up = new THREE.Mesh(new THREE.CylinderGeometry(.05, .042, L * .68, 6), hm); up.position.y = -L * .34; g.add(up); const dn = new THREE.Mesh(new THREE.CylinderGeometry(.042, .03, L * .34, 6), tm); dn.position.y = -L * .68 - L * .15; g.add(dn); head.add(g); } if (open) { scalp(.545, .4, .5); for (let i = 0; i < 9; i++) { const ph = PI * (.1 + i * .22), th = PI * .3; cyl(.045, .036, .5, Math.cos(ph) * .52, .3, -Math.sin(ph) * .5 + .02, Math.sin(ph) * -.55, 0, Math.cos(ph) * .55); } } };
  H.afro = () => { nape(.1, .53, PI * .8, PI * 1.4); for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) { const a = (i / 11 - .5) * 4.4 + (r % 2) * .2, y = [-.14, .04, .22][r]; sph(.22 + (i % 2) * .03, Math.sin(a) * (.52 + r * .06), y, -Math.cos(a) * (.52 + r * .06)); } for (let i = 0; i < 9; i++) { const a = i * 2.4; sph(.22, Math.sin(a) * .3, .56 + (i % 3) * .06, Math.cos(a) * .3 - .06); } };
  H.puffs = () => { nape(.12, .535, PI * .8, PI * 1.4); for (const s of [-1, 1]) { sph(.27, s * .4, .5, -.04); ring(.2, s * .4, .27, -.04, PI / 2, 0, 0); } if (open) scalp(.552, .4, .5); };
  H.spiky = () => { nape(.1, .535, PI * .8, PI * 1.4); for (let i = 0; i < 17; i++) { const a = i * 2.4, th = i === 0 ? .05 : i < 9 ? .5 : .95, d = new THREE.Vector3(Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a)); if (!open && th > .6 && d.y < .6) continue; cone(.085, .36, d.x * .46, d.y * .46, d.z * .46, d.x, d.y, d.z); } if (open) scalp(.545, .4, .5); };
  H.saiyan = () => { nape(.1, .535, PI * .8, PI * 1.4); const L = [[0, .3, .1, .64], [-.3, .35, .04, .56], [.3, .35, .04, .56], [-.5, .1, .22, .5], [.5, .1, .22, .5], [-.12, .3, -.3, .5], [.12, .3, -.3, .5], [0, .2, .5, .4]]; for (const [dx, dy, dz, len] of L) { const d = new THREE.Vector3(dx, 1, dz); cone(.15, len, d.x * .2, .45, d.z * .2, dx, 1.2, dz); } if (open) scalp(.545, .4, .5); };
  H.slick = () => { nape(.1, .535, PI * .8, PI * 1.4); if (open) { scalp(.562, .42, .5, 1.05); sph(.2, 0, .5, .16, 1.6, .6, 1.5); bx(.5, .06, .1, 0, .3, .46, -.35); } else bx(.5, .06, .3, 0, .06, -.4); };
  H.pomp = () => { nape(.08, .53, PI * .85, PI * 1.3); sph(.24, 0, .56, .24, 1.7, 1, 1.6); sph(.16, 0, .64, .0, 1.5, 1, 2.2); if (open) scalp(.545, .4, .5); };
  H.sidepart = () => { nape(.12, .535, PI * .8, PI * 1.4); if (open) { scalp(.552, .4, .5); bx(.36, .12, .12, -.12, .47, .36, -.7, 0, .35); bx(.26, .08, .1, .22, .5, .28, -.55, 0, -.2); bx(.02, .05, .8, .06, .56, .0, 0, 0, 0, tm); } else bx(.3, .1, .2, -.2, .2, .45, -.6, 0, .3); };
  H.sweep = () => { nape(.2, .54, PI * .75, PI * 1.5); bx(.1, .5, .22, .5, -.28, .02); if (open) { scalp(.552, .4, .5); bx(.62, .36, .07, .12, .2, .5, -.2, 0, .55); bx(.3, .3, .06, .38, .02, .45, -.2, 0, .8); } else bx(.5, .3, .07, .18, .12, .5, -.25, 0, .6); };
  H.bowl = () => { nape(.2, .54, PI * .75, PI * 1.5); if (open) { full(.575, .46); bx(.72, .15, .08, 0, .1, .53, .08); } else bx(.62, .13, .08, 0, .12, .54, .08); };
  H.mushroom = () => { nape(.2, .6, PI * .62, PI * 1.76); for (const s of [-1, 1]) bx(.12, .3, .45, s * .56, -.05, .0); if (open) { capp(.64, 0, .5, 0, TAU, .85); sph(.3, 0, .6, 0, 1.6, .6, 1.6); } else bx(.8, .1, .1, 0, .14, .52, .1); };
  H.hime = () => { nape(.24, .54, PI * .75, PI * 1.5); bx(.74, 1.0, .14, 0, -.55, -.4, .1); sideLocks(.85, .12, -.06, .02); for (const s of [-1, 1]) bx(.07, .46, .06, s * .38, -.05, .46, 0, 0, s * .05); if (open) { scalp(.552, .4, .5); bx(.66, .16, .07, 0, .13, .5, -.1); } };
  H.fade = () => { nape(.09, .532, PI * .82, PI * 1.36); nape(.045, .545, PI * .85, PI * 1.3); if (open) { scalp(.535, .43, .55); bx(.44, .12, .5, 0, .52, -.02); } };
  H.wolf = () => { nape(.2, .54, PI * .75, PI * 1.5); bx(.58, .5, .14, 0, -.3, -.42, .18); bx(.4, .46, .12, 0, -.5, -.46, .25); for (const s of [-1, 1]) sph(.1, s * .47, -.06, -.1, 1, 1.5, 1); if (open) { scalp(.552, .4, .5); for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 1.7; bx(.1, .22, .06, Math.sin(a) * .5, .12, Math.cos(a) * .5, -.4, a, (i - 3) * .06); } } };
  H.shaggy = () => { nape(.14, .536, PI * .78, PI * 1.44); for (let i = 0; i < 7; i++) { const a = (i / 6) * TAU; cone(.06, .22, Math.sin(a) * .5, -.1 - (i % 2) * .08, -Math.cos(a) * .5, Math.sin(a), -.3, -Math.cos(a)); } if (open) { scalp(.54, .4, .5); for (let i = 0; i < 11; i++) { const a = i * 2.4, th = (.15 + (i % 4) * .09) * PI; sph(.1 + (i % 3) * .015, Math.sin(th) * Math.cos(a) * .52, Math.cos(th) * .52, Math.sin(th) * Math.sin(a) * .52); } } };
  H.flattop = () => { nape(.07, .53, PI * .82, PI * 1.36); bx(.66, .16, .66, 0, .6, 0); if (open) scalp(.53, .43, .5); };
  H.perm = () => { nape(.14, .536, PI * .78, PI * 1.44); dome(14, .62, .52, .6, .115, 21, .9); dome(34, .56, .02, .45, .12, 4); };
  H.balding = () => { nape(.2, .54, PI * .75, PI * 1.5); capp(.55, .3, .2, PI * .62, PI * 1.76); if (open) { bx(.03, .04, .5, -.12, .54, -.02, 0, 0, 0); bx(.03, .04, .46, 0, .55, -.02); bx(.03, .04, .42, .12, .54, -.02); } };
  H.combover = () => { nape(.12, .535, PI * .8, PI * 1.4); if (open) { scalp(.53, .4, .6); for (let i = 0; i < 7; i++) { const z = -.28 + i * .09; bx(.62 - Math.abs(i - 3) * .04, .035, .05, -.04, Math.sqrt(Math.max(.01, .3 - z * z)) * .98 + .02, z, 0, 0, .3); } } };
  H.cone = () => { nape(.1, .535, PI * .8, PI * 1.4); cone(.5, .88, 0, .22, 0, 0, 1, 0); const o = add(new THREE.SphereGeometry(.5, 14, 8, 0, TAU, 0, PI * .12), hm); o.position.y = .12; };
  H.swirl = () => {      // 螺旋錐頭（軟糖冰淇淋）：一圈圈往上縮小的髮環，髮環上有點點（髮尾色）
    nape(.1, .53, PI * .8, PI * 1.4);
    const rings = [[.585, .2, .62], [.5, .32, .6], [.41, .44, .58], [.31, .55, .56], [.2, .65, .54]];
    rings.forEach(([r, y, k], i) => { const o = sph(r, i % 2 ? .02 : -.02, y, i % 2 ? -.02 : .02, 1, k, 1); });
    cone(.13, .3, .02, .7, 0, .12, 1, .04);
    for (const [a, i, s] of [[.3, 0, .1], [2.5, 1, .09], [4.2, 0, .09], [5.4, 1, .08], [1.4, 2, .08], [3.5, 2, .075], [5.9, 2, .07]]) { const [r, y, k] = rings[i], d = new THREE.Vector3(Math.sin(a), .4, Math.cos(a)).normalize(); sph(s, d.x * r * 1.0, y + d.y * r * k * .62, d.z * r * 1.0, 1, 1, .5, tm).lookAt(d.x * 3, y + 1, d.z * 3); }
  };
  H.ahoge = () => { nape(.12, .535, PI * .8, PI * 1.4); if (open) { scalp(.552, .4, .5); bangs(7, 1.5, .19, .12, .25, .12); } const g = [[0, .54, .1], [.05, .68, .12], [.14, .78, .1], [.26, .83, .06]]; for (let i = 0; i < 3; i++) { const a = new THREE.Vector3(...g[i]), b = new THREE.Vector3(...g[i + 1]), d = b.clone().sub(a), o = add(new THREE.CylinderGeometry(.03 - i * .006, .035 - i * .006, d.length() + .02, 6)); o.position.copy(a).addScaledVector(d, .5); o.quaternion.setFromUnitVectors(Y, d.clone().normalize()); } sph(.04, .27, .83, .06); };
  H.sprout = () => {      // 嫩芽：短髮＋頭頂兩片葉子（葉子用髮尾色）
    nape(.12, .535, PI * .8, PI * 1.4); if (open) { scalp(.552, .4, .5); bangs(7, 1.5, .19, .12, .25, .12); }
    const lm = tm; cyl(.025, .03, .14, 0, .6, .04, 0, 0, 0, lm);
    for (const s of [-1, 1]) { const o = sph(.16, s * .13, .75, .04, 1.5, .28, .8, lm); o.rotation.z = s * .55; }
  };
  H.pineapple = () => { nape(.1, .535, PI * .8, PI * 1.4); sph(.15, 0, .6, 0, 1.2, 1, 1.2); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, o = .5 + (i % 2) * .15; cone(.06, .5 + (i % 2) * .15, Math.sin(a) * .1, .62, Math.cos(a) * .1, Math.sin(a) * .85, 1, Math.cos(a) * .85, i % 3 === 0 ? tm : hm); } if (open) scalp(.552, .4, .5); };
  H.monk = () => { nape(.06, .525, PI * .85, PI * 1.3); sph(.1, 0, .58, .3, 1, 1.1, 1); sph(.075, -.12, .55, .32); sph(.075, .12, .55, .32); };
  H.airbang = () => { nape(.14, .536, PI * .78, PI * 1.44); sideLocks(.3, .08); if (open) { scalp(.552, .38, .55); for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 1.4; bx(.05, .17, .03, Math.sin(a) * .5, .15, Math.cos(a) * .5 + .02, -.2, a, 0, i % 2 ? hl : hd); } } };
  H.layered = () => { nape(.22, .54, PI * .75, PI * 1.5); bx(.7, .5, .12, 0, -.3, -.42, .15); bx(.5, .4, .1, 0, -.5, -.44, .2, 0, 0, hd); sideLocks(.5, .1); if (open) { scalp(.552, .4, .5); bangs(7, 1.5, .2, .16, .3, .1, hl); } };
  H.jellyfish = () => { nape(.2, .545, PI * .75, PI * 1.5); for (let i = 0; i < 12; i++) { const a = (i / 11 - .5) * 4.2; cyl(.05, .03, .5, Math.sin(a) * .56, -.35, -Math.cos(a) * .56, 0, 0, Math.sin(a) * .25, i % 2 ? hm : hd); } if (open) { capp(.575, 0, .45, 0, TAU, .95); bangs(7, 1.6, .17, .2, .3, .12, hl); } };
  H.sidepony = () => { nape(.12, .535, PI * .8, PI * 1.4); sph(.09, .5, .2, -.1, 1, 1, 1, tm); cyl(.11, .035, .6, .62, -.14, -.12, 0, 0, -.2); if (open) { scalp(.552, .4, .5); bangs(5, 1.1, .2, .12, .25, .12); } };
  H.halfup = () => { nape(.2, .54, PI * .75, PI * 1.5); bx(.7, .8, .12, 0, -.42, -.42, .1); sideLocks(.6, .1); sph(.13, 0, .45, -.36); ring(.11, 0, .4, -.36, PI / 2, 0, 0); if (open) { scalp(.552, .4, .5); bangs(6, 1.4, .2, .14, .25, .12); } };
  H.texcrop = () => { nape(.09, .533, PI * .8, PI * 1.4); if (open) { scalp(.55, .4, .5); for (let i = 0; i < 12; i++) { const a = (i / 11 - .5) * 1.7; cone(.05, .2, Math.sin(a) * .47, .24, Math.cos(a) * .47, Math.sin(a) * .5, .5, Math.cos(a), i % 2 ? hl : hm); } } };
  H.quiff = () => { nape(.08, .53, PI * .85, PI * 1.3); sph(.2, 0, .55, .28, 1.4, .8, 1.5, hl); sph(.14, 0, .62, .1, 1.3, .8, 1.8); if (open) scalp(.545, .36, .55); };
  H.spacebuns = () => { nape(.12, .535, PI * .8, PI * 1.4); for (const s of [-1, 1]) { sph(.15, s * .26, .62, -.1); sph(.1, s * .26, .76, -.1, 1, 1, 1, tm); } if (open) { scalp(.552, .4, .5); bangs(6, 1.3, .2, .1, .2, .12); } };
  H.kr = () => { };
  H.twintail = () => { nape(.12, .535, PI * .8, PI * 1.4); for (const s of [-1, 1]) { sph(.085, s * .44, .16, -.36, 1, 1, 1, tm); cyl(.11, .035, .66, s * .52, -.2, -.4, 0, 0, s * .12); cyl(.035, .06, .25, s * .6, -.6, -.4, 0, 0, s * .12); } if (open) { scalp(.552, .4, .5); bangs(6, 1.3, .2, .12, .25, .12); } };
  H.twinbun = () => { nape(.12, .535, PI * .8, PI * 1.4); for (const s of [-1, 1]) { sph(.2, s * .42, .5, -.1); ring(.17, s * .42, .35, -.1, PI / 2, 0, s * .5); } if (open) { scalp(.552, .4, .5); bangs(6, 1.3, .2, .1, .2, .12); } };
  H.hipony = () => { nape(.12, .535, PI * .8, PI * 1.4); sph(.09, 0, .46, -.4, 1, 1, 1, tm); cyl(.12, .04, .5, 0, .62, -.62, .9, 0, 0); cyl(.04, .1, .42, 0, .3, -.95, .2, 0, 0); if (open) { scalp(.552, .4, .5); bangs(5, 1.1, .2, .1, .2, .13); } };
  (H[vis.hair] || H.short)();
}

/* =========================================================
   B. 包住 addHairEars（hx 角色用新髮型庫）
   ========================================================= */
const _lkAddHair = addHairEars;
addHairEars = function (head, vis, bare) {
  if (!LOOK.on || !vis || !vis.hx) return _lkAddHair.apply(this, arguments);
  const open = !!bare || vis.hatMode === 'visor', keep = LK_OLD[vis.hair] ? vis.hair : 'bald';
  _lkAddHair(head, Object.assign({}, vis, { hair: keep }), bare);      // 耳朵、眼鏡、髮帶、鬍子、耳環、眼下黑膏、墨鏡等仍由原函式畫
  if (!LK_OLD[vis.hair]) { try { lookHair(head, vis, open); } catch (e) { console.error('[look hair]', e); } }
};

/* =========================================================
   C. 臉部附加物：鼻型 5～8、鼻水、腮紅款式
   ========================================================= */
function lkCv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function lkTex(c) { const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; }
function lkCheekTex(k) {
  const key = 'ch' + k; if (LOOK.tex[key]) return LOOK.tex[key]; const c = lkCv(128, 128), g = c.getContext('2d'); g.translate(64, 64); g.lineCap = 'round';
  if (k === 1) { const r = g.createRadialGradient(0, 0, 8, 0, 0, 60); r.addColorStop(0, 'rgba(255,110,130,.85)'); r.addColorStop(.7, 'rgba(255,120,140,.55)'); r.addColorStop(1, 'rgba(255,130,150,0)'); g.fillStyle = r; g.beginPath(); g.arc(0, 0, 60, 0, TAU2()); g.fill(); }
  else if (k === 2) {      // 交叉網格腮紅（娃娃款）：粉紅圓＋黑色斜格線＋外框
    g.fillStyle = '#e85c86'; g.beginPath(); g.arc(0, 0, 58, 0, TAU2()); g.fill(); g.save(); g.beginPath(); g.arc(0, 0, 56, 0, TAU2()); g.clip(); g.strokeStyle = '#1a1014'; g.lineWidth = 5;
    for (let i = -80; i <= 80; i += 20) { g.beginPath(); g.moveTo(i - 60, -60); g.lineTo(i + 60, 60); g.stroke(); g.beginPath(); g.moveTo(i + 60, -60); g.lineTo(i - 60, 60); g.stroke(); } g.restore(); g.strokeStyle = '#1a1014'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 56, 0, TAU2()); g.stroke();
  }
  else if (k === 3) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 6; for (const a of [-.3, 0, .3]) { g.beginPath(); g.moveTo(-40, a * 90); g.lineTo(40, a * 90 + a * 50); g.stroke(); } }
  else if (k === 4) { g.fillStyle = '#9a5a3a'; for (const [x, y, r] of [[-28, -14, 6], [-6, -26, 5], [18, -16, 6.5], [-20, 8, 5.5], [8, 2, 6], [30, 10, 5], [-2, 24, 5.5], [22, 28, 4.5], [-34, 26, 4.5]]) { g.beginPath(); g.arc(x, y, r, 0, TAU2()); g.fill(); } }
  else { g.fillStyle = '#ff5e8a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -LK_PI / 2 + i * LK_PI / 5, r = i % 2 ? 24 : 54; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.strokeStyle = '#c42a5a'; g.lineWidth = 4; g.stroke(); }
  return LOOK.tex[key] = lkTex(c);
}
function TAU2() { return LK_TAU; }
function lookFace(rig, vis) {
  const head = rig.head, R = .52, PI = LK_PI, surf = (x, y, off) => Math.sqrt(Math.max(.01, R * R - x * x - y * y)) + off, skd = mat(shadeHex(vis.skin, .84)), ink = mat('#14100e');
  const tube = (pts, rad, m) => { const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], surf(p[0], p[1], p[2] == null ? .012 : p[2])))), 18, rad, 5, false), o = new THREE.Mesh(g, m); head.add(o); return o; };
  const nz = vis.nose | 0;
  if (nz === 5) {      // U 形鼻線（娃娃款）：從兩頰往鼻下彎成一條粗黑線，中間有小鼻頭
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 5 - 1; pts.push([t * .21, -.07 - .115 * (1 - t * t)]); } tube(pts, .016, ink);
    const nb = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), skd); nb.scale.set(1.15, .9, .8); nb.position.set(0, -.105, surf(0, -.105, .02)); head.add(nb);
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.SphereGeometry(.014, 6, 5), ink); d.position.set(s * .026, -.118, surf(s * .026, -.118, .052)); head.add(d); }
  } else if (nz === 6) {      // 豬鼻
    const sn = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), mat(shadeHex(vis.skin, .93))); sn.scale.set(1.6, 1.1, .6); sn.position.set(0, -.12, surf(0, -.12, .035)); head.add(sn);
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.SphereGeometry(.014, 6, 5), ink); d.scale.z = .5; d.position.set(s * .03, -.12, surf(s * .03, -.12, .075)); head.add(d); }
  } else if (nz === 7) { const rn = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), mat('#e0402e')); rn.position.set(0, -.11, surf(0, -.11, .05)); head.add(rn); const hl = new THREE.Mesh(new THREE.SphereGeometry(.017, 6, 5), mat('#ffd0c8')); hl.position.set(-.025, -.085, surf(0, -.11, .118)); head.add(hl); }
  else if (nz === 8) { const hk = new THREE.Mesh(new THREE.ConeGeometry(.05, .2, 6), skd); hk.rotation.x = PI / 2 + .35; hk.position.set(0, -.09, surf(0, -.09, .08)); head.add(hk); }
  const sn = vis.snot | 0;
  if (sn === 1) {      // 鼻水：從左鼻孔垂下一條淡藍色鼻涕，尾端圓圓一顆
    const m = new THREE.MeshLambertMaterial({ color: '#8fe0f2', emissive: '#2a6a80', transparent: true, opacity: .92 });
    tube([[-.04, -.14, .03], [-.046, -.19, .036], [-.05, -.25, .036]], .02, m); const dr = new THREE.Mesh(new THREE.SphereGeometry(.034, 8, 6), m); dr.scale.y = 1.25; dr.position.set(-.05, -.27, surf(-.05, -.27, .04)); head.add(dr);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.009, 5, 4), mat('#ffffff')); hl.position.set(-.058, -.262, surf(-.05, -.27, .075)); head.add(hl);
  } else if (sn === 2) {      // 鼻涕泡泡
    const m = new THREE.MeshLambertMaterial({ color: '#bff0fa', emissive: '#3a8aa0', transparent: true, opacity: .62 }); const b = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 10), m); b.position.set(-.05, -.16, surf(-.05, -.16, .09)); head.add(b);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.016, 5, 4), mat('#ffffff')); hl.position.set(-.075, -.13, surf(-.05, -.16, .15)); head.add(hl);
  }
  const ck = vis.cheek | 0;
  if (ck) for (const s of [-1, 1]) {
    const ch = new THREE.Mesh(new THREE.CircleGeometry(ck === 3 ? .12 : .108, 18), new THREE.MeshBasicMaterial({ map: lkCheekTex(ck), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
    ch.position.set(s * .3, -.115, .425); ch.lookAt(s * .62, -.115, 1.25); head.add(ch);
  }
}

/* =========================================================
   D. 造型服裝：浴衣（布紋貼圖＋腰帶＋領口＋袖子＋手臂顏色）
   ========================================================= */
function lkFabTex(pat, base, fan, big) {
  const key = 'fab' + pat + base + fan + (big ? 'b' : 's'); if (LOOK.tex[key]) return LOOK.tex[key];
  const W = 512, H = 256, c = lkCv(W, H), g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, W, H);
  const light = 'rgba(255,255,255,.3)', dark = 'rgba(0,0,0,.18)';
  if (pat === 0) { const N = 32; g.strokeStyle = light; g.lineWidth = 1.4; for (let y = 0; y < H; y += N) for (let x = 0; x < W; x += N) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + N, y + N); g.moveTo(x + N, y); g.lineTo(x, y + N); g.moveTo(x + N / 2, y); g.lineTo(x + N / 2, y + N); g.moveTo(x, y + N / 2); g.lineTo(x + N, y + N / 2); g.moveTo(x + N / 2, y); g.lineTo(x + N, y + N / 2); g.lineTo(x + N / 2, y + N); g.lineTo(x, y + N / 2); g.closePath(); g.stroke(); } }
  else if (pat === 1) { for (let x = 0; x < W; x += 32) { g.fillStyle = dark; g.fillRect(x, 0, 14, H); g.fillStyle = light; g.fillRect(x + 20, 0, 3, H); } }
  else if (pat === 2) { for (let i = 0; i < 46; i++) { const x = (i * 97) % W, y = (i * 53) % H; g.fillStyle = 'rgba(255,200,220,.85)'; for (let k = 0; k < 5; k++) { const a = k * LK_TAU / 5; g.beginPath(); g.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 3.2, a, 0, LK_TAU); g.fill(); } g.fillStyle = '#e8a030'; g.beginPath(); g.arc(x, y, 2.4, 0, LK_TAU); g.fill(); } }
  else { g.strokeStyle = light; g.lineWidth = 2; for (let y = 0; y < H + 20; y += 16) for (let x = (y / 16 % 2) * 16; x < W + 32; x += 32) for (let r = 6; r <= 16; r += 5) { g.beginPath(); g.arc(x, y, r, LK_PI, 0); g.stroke(); } }
  if (big) {
    const motif = (cx, cy, r, col, flower, handle) => { if (handle) { g.fillStyle = '#f4c82a'; g.fillRect(cx - 5, cy + r - 6, 10, r * .8); } g.fillStyle = col; g.beginPath(); g.arc(cx, cy, r, 0, LK_TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.stroke(); g.fillStyle = flower; for (let k = 0; k < 5; k++) { const a = k * LK_TAU / 5, fx = cx + Math.cos(a * 1) * r * .45, fy = cy + Math.sin(a) * r * .45; for (let j = 0; j < 5; j++) { const b = j * LK_TAU / 5; g.beginPath(); g.ellipse(fx + Math.cos(b) * 4.5, fy + Math.sin(b) * 4.5, 3.6, 2.4, b, 0, LK_TAU); g.fill(); } } };
    motif(80, 78, 46, fan, '#ffffff', true); motif(250, 150, 42, '#f2efe6', '#7aa6d8', false); motif(420, 80, 46, fan, '#ffffff', true); motif(160, 215, 36, '#f2efe6', '#7aa6d8', false); motif(350, 222, 38, fan, '#ffffff', false);
  }
  const t = lkTex(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return LOOK.tex[key] = t;
}
function lookOutfit(rig, vis, o) {
  if (!vis.outfit || (o && o.pl && o.pl.suit)) return;
  const body = rig.body, jc = rig.torso.material, thigh = rig.legL.children.find(c => c.geometry === GEO.leg || c.geometry === THIGH_GEO), pcM = thigh && thigh.material;
  const fab = new THREE.MeshLambertMaterial({ map: lkFabTex(vis.pat | 0, vis.fabCol, vis.fanCol, true) }), pants = new THREE.MeshLambertMaterial({ map: lkFabTex(vis.pat | 0, vis.fabCol, vis.fanCol, false) });
  if (pants.map) { pants.map = pants.map; }
  const armM = mat(vis.armCol || vis.skin), colM = mat(vis.collarCol), zf = .29 * vis.w * vis.d;
  rig.root.traverse(m => {
    if (!m.isMesh) return; const g = m.geometry, mt = m.material;
    if (g === SLV_GEO) { m.material = armM; return; }
    if (g === SOCK_GEO) { m.material = pants; return; }
    if (g === RING_GEO || g === STRIPE_GEO || g === BUCKLE_GEO || g === NUM_GEO || g === WRIST_GEO) { m.visible = false; return; }
    if (g === COLLAR_GEO) { m.material = colM; return; }
    if (g && g.type === 'BoxGeometry' && g.parameters && Math.abs(g.parameters.width - .035) < .001 && Math.abs(g.parameters.height - .5) < .001) { m.visible = false; return; }      // 前排扣
    if (mt === jc) m.material = (g === FARM_GEO || g === ELB_GEO) ? armM : fab;
    else if (pcM && mt === pcM) m.material = pants;
  });
  const belt = body.children.find(c => c.geometry && c.geometry.type === 'CylinderGeometry' && c.geometry.parameters && Math.abs(c.geometry.parameters.radiusTop - .285) < .001 && Math.abs(c.geometry.parameters.height - .1) < .001);
  if (belt) belt.visible = false;
  const obiM = new THREE.MeshLambertMaterial({ map: lkFabTex(vis.pat | 0, shadeHex(vis.fabCol, .8), vis.fanCol, true) });
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(.305, .3, .26, 16), obiM); obi.position.y = .68; obi.scale.set(vis.w, 1, vis.w * vis.d); body.add(obi);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(.4, .22, .1), obiM); bow.position.set(0, .68, -(zf + .1)); body.add(bow);
  for (const s of [-1, 1]) { const bt = new THREE.Mesh(new THREE.BoxGeometry(.09, .3, .05), obiM); bt.position.set(s * .1, .5, -(zf + .1)); bt.rotation.z = s * .12; body.add(bt); }
  for (const s of [-1, 1]) { const lp = new THREE.Mesh(new THREE.BoxGeometry(.1, .52, .035), colM); lp.position.set(s * .1, 1.0, zf + .016); lp.rotation.z = s * .42; body.add(lp); }
  for (const a of [rig.armL, rig.armR]) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(.15, .185, .3, 10, 1, true), new THREE.MeshLambertMaterial({ map: fab.map, side: THREE.DoubleSide })); sl.position.y = -.16; a.add(sl); }
}

/* =========================================================
   E. 遮陽帽：只留帽簷＋頭帶，髮型全露
   ========================================================= */
function lookVisor(rig, vis, o) {
  if (vis.hatMode !== 'visor' || (o && o.pl && o.pl.suit)) return; const head = rig.head;
  for (const c of head.children) { if (c.geometry === GEO.cap || c.geometry === GEO.helm || c.geometry === LOGO_GEO) c.visible = false; }
  const brim = head.children.find(c => c.geometry === GEO.brim); if (!brim) return;
  const r = new THREE.Mesh(new THREE.TorusGeometry(.535, .04, 6, 26), brim.material); r.rotation.x = LK_PI / 2 + .05; r.position.y = .1; head.add(r);
}



/* ---------- 飾品（vis.acc 1~12）：貓耳／兔耳／耳機／皇冠／蝴蝶結／墨鏡／口罩／頭巾／花／光環／惡魔角／眼罩 ---------- */
function lookAcc(rig, vis) {
  const k = vis.acc | 0; if (!k) return; const head = rig.head, PI = LK_PI, c = mat(vis.accCol || '#e8c040'), dk = mat('#15110e'), M = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); head.add(o); return o; };
  const dbl = col => new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
  if (k === 1 || k === 2) for (const s of [-1, 1]) { const o = M(new THREE.ConeGeometry(k === 1 ? .17 : .1, k === 1 ? .3 : .55, 4), c, s * .3, .62, -.05); o.rotation.z = -s * (k === 1 ? .35 : .15); M(new THREE.ConeGeometry(.08, .2, 4), mat('#ff9ab8'), s * .3, .6, .0).rotation.z = o.rotation.z; }
  else if (k === 3) { const b = M(new THREE.TorusGeometry(.56, .035, 6, 20, PI), dk, 0, .02, 0); for (const s of [-1, 1]) M(new THREE.CylinderGeometry(.14, .14, .1, 12), c, s * .56, -.02, 0).rotation.z = PI / 2; }
  else if (k === 4) { M(new THREE.CylinderGeometry(.3, .34, .14, 10, 1, true), dbl(vis.accCol || '#e8c040'), 0, .66, 0); for (let i = 0; i < 5; i++) { const a = i / 5 * LK_TAU; M(new THREE.ConeGeometry(.07, .2, 4), c, Math.sin(a) * .32, .78, Math.cos(a) * .32); } }
  else if (k === 5) { for (const s of [-1, 1]) { const o = M(new THREE.ConeGeometry(.12, .24, 4), c, s * .14, .6, .3); o.rotation.set(.9, 0, s * PI / 2 + s * .2); } M(new THREE.SphereGeometry(.06, 8, 6), c, 0, .6, .3); }
  else if (k === 6) { const m = new THREE.MeshLambertMaterial({ color: '#10141c' }); for (const s of [-1, 1]) M(new THREE.BoxGeometry(.24, .15, .03), m, s * .17, -.02, .53).rotation.y = s * .25; M(new THREE.BoxGeometry(.1, .03, .03), m, 0, 0, .545); }
  else if (k === 7) M(new THREE.SphereGeometry(.54, 14, 8, PI * .25, PI * .5, PI * .58, PI * .2), dbl('#f2f2f6'), 0, 0, 0);
  else if (k === 8) { const o = M(new THREE.TorusGeometry(.53, .06, 6, 24), c, 0, .12, 0); o.rotation.x = PI / 2; M(new THREE.SphereGeometry(.1, 8, 6), c, 0, .1, -.55); M(new THREE.BoxGeometry(.14, .3, .04), c, 0, -.05, -.58); }
  else if (k === 9) { for (let i = 0; i < 5; i++) { const a = i / 5 * LK_TAU; M(new THREE.SphereGeometry(.05, 6, 5), mat('#ff7ab8'), .38 + Math.cos(a) * .06, .42 + Math.sin(a) * .06, .3); } M(new THREE.SphereGeometry(.04, 6, 5), mat('#ffe02a'), .38, .42, .31); }
  else if (k === 10) M(new THREE.TorusGeometry(.26, .03, 6, 20), new THREE.MeshBasicMaterial({ color: '#fff3a0' }), 0, .95, 0).rotation.x = PI / 2;
  else if (k === 11) for (const s of [-1, 1]) M(new THREE.ConeGeometry(.07, .25, 6), mat('#d8402e'), s * .26, .64, .04).rotation.z = -s * .35;
  else if (k === 12) M(new THREE.BoxGeometry(.2, .17, .03), new THREE.MeshLambertMaterial({ color: '#15110e' }), .17, -.02, .52).rotation.y = .2;
}
/* =========================================================
   F. 包住 makeChibi（要在 13t 之後）
   ========================================================= */
const _lkMakeChibi = makeChibi;
makeChibi = function (o) {
  const rig = _lkMakeChibi.apply(this, arguments);
  try { if (LOOK.on && rig && rig.vis && rig.vis.hx) { lookFace(rig, rig.vis); lookAcc(rig, rig.vis); lookOutfit(rig, rig.vis, o); lookVisor(rig, rig.vis, o); } } catch (e) { console.error('[look]', e); }
  return rig;
};

/* =========================================================
   G. 電腦／各隊球員的個人特色：依「姓名」固定抽（不用 Math.random，區網對戰兩邊一致；跨場、跨回放都同一張臉）
   包住 03 的 visFor：沒有 hx 的球員（電腦球員、對手、替補）補上 hx＋新髮型／五官／腮紅／鼻水／頭部飾品／瞳色／眼鏡／耳朵大小／膚色微調。
   特殊球員（VIS_SPECIAL）已寫死的欄位不會被蓋掉；教練（aged）與主審不動。關閉：LOOK.npc=false。
   ========================================================= */
LOOK.npc = true;
const LK_NEWH = ['sweep', 'hime', 'lowpony', 'twinbraid', 'ahoge', 'flattop', 'puffs', 'pineapple', 'monk', 'perm', 'sprout', 'airbang', 'layered', 'jellyfish', 'sidepony', 'halfup', 'texcrop', 'quiff', 'spacebuns', 'combover', 'saiyan'];
const LK_SKIN_J = ['#fbe3d0', '#ffd6b0', '#f6c394', '#eebb8c', '#e3ac7c', '#d79e72', '#c98f64'];
function lookNpc(v, key) {
  const r = mkRng(hashStr('npclook:' + key) ^ 0x7f4a7c15), R = (a, b) => a + (b - a) * r(), pk = a => a[Math.floor(r() * a.length)], sp = VIS_SPECIAL && VIS_SPECIAL[key] || {};
  v.hx = 1; const set = (k, val) => { if (!(k in sp)) v[k] = val; };
  if (v.hair === 'mohawk') set('hair', 'spiky');
  if (r() < .42) { const h = pk(LK_NEWH); set('hair', h); if (['pineapple', 'sprout', 'puffs', 'spacebuns', 'twinbraid', 'sidepony', 'halfup'].includes(h)) set('tipCol', pk(HAIR_FUN)); }
  else if (r() < .03) { set('hair', pk(['swirl', 'cone', 'mushroom', 'balding'])); set('hatMode', 'visor'); }
  if (v.hair === 'balding' || v.hair === 'combover') set('hatMode', 'visor');
  if (r() < .6) set('eyeType', pk([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13]));
  if (r() < .5) set('brow', pk([1, 2, 3, 4, 5, 7]));
  if (r() < .6) set('nose', pk([1, 1, 2, 3, 4, 5, 6, 7, 8]));
  if (r() < .6) set('mouth', pk([1, 2, 3, 3, 4, 5, 6, 7, 9, 10, 11]));
  if (r() < .22) { set('cheek', pk([1, 1, 3, 4, 4, 5, 2])); set('blush', false); }
  if (r() < .04) set('snot', pk([1, 2]));
  if (r() < .12) { set('acc', pk([1, 2, 3, 5, 6, 8, 9, 11, 12])); set('accCol', pk(ACC_COLS_LK)); }
  if (r() < .25) set('eyeCol', pk(['#5a3a1e', '#2f6fe8', '#1fb85a', '#8a44d8', '#d8402e', '#27a6d8', '#9a9aa4', '#e8c040']));
  if (r() < .16 && !v.glasses) set('glasses', pk([1, 2, 3]));
  if (r() < .1) { set('headband', true); set('accCol', pk(ACC_COLS_LK)); }
  if (r() < .12) set('necklace', true); if (r() < .22) set('wristband', true);
  set('ear', Math.max(.8, Math.min(1.5, (v.ear || 1) * R(.88, 1.32))));
  set('eyeSp', Math.max(.9, Math.min(1.12, (v.eyeSp || 1) * R(.96, 1.05)))); set('eyeS', Math.max(.85, Math.min(1.15, (v.eyeS || 1) * R(.93, 1.08))));
  if (v.skin && !('skin' in sp)) v.skin = shadeHex(v.skin, R(.93, 1.05));
}
const ACC_COLS_LK = ['#e8c040', '#e8e8f0', '#d8402e', '#2f6fe8', '#1fb85a', '#ff7ab8', '#8a44d8', '#15110e'];
const _lkVisFor = visFor;
visFor = function (key) { const v = _lkVisFor(key); if (LOOK.on && LOOK.npc && v && !v.hx && !v.aged && key !== '主審') { try { lookNpc(v, key); } catch (e) { console.error('[look npc]', e); } } return v; };
