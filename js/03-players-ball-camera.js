/* ===== 03-players-ball-camera.js ｜ Q版球員外觀與姿勢／落地修正／球／擊球特效／煙火／止滑粉／鏡頭 =====
   載入順序 3/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
'use strict';
/* ---------- chibi players ---------- */
const GEO = {
  head: new THREE.SphereGeometry(.52, 20, 16), eye: new THREE.SphereGeometry(.058, 8, 6), cheek: new THREE.CircleGeometry(.07, 10),
  torso: new THREE.CylinderGeometry(.3, .27, .62, 14), leg: new THREE.CylinderGeometry(.13, .115, .55, 10), arm: new THREE.CylinderGeometry(.1, .085, .5, 8),
  hand: new THREE.SphereGeometry(.11, 8, 6), shoe: new THREE.BoxGeometry(.24, .12, .38), cap: new THREE.SphereGeometry(.545, 18, 10, 0, TAU, 0, Math.PI * .52),
  helm: new THREE.SphereGeometry(.56, 18, 12, 0, TAU, 0, Math.PI * .62), brim: new THREE.BoxGeometry(.62, .05, .4), glove: new THREE.SphereGeometry(.2, 10, 8)
};
const shadowTex = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const shadowGeo = new THREE.PlaneGeometry(1, 1);
const MAT = {}; const mat = (c) => MAT[c] || (MAT[c] = new THREE.MeshLambertMaterial({ color: c }));

/* ---------- 球員外觀／打擊姿勢／投球姿勢：依球員姓名決定（同一人每場都長一樣，不同人各有差異） ---------- */
function mkRng(seed) { let q = seed >>> 0 || 1; return () => { q ^= q << 13; q >>>= 0; q ^= q >> 17; q ^= q << 5; q >>>= 0; return q / 4294967296; }; }
const HAIR_COLS = ['#15110e', '#1b1612', '#241a14', '#2b2018', '#3a2a1c', '#4a3624', '#1a1a22', '#5a4030', '#6a4a2c', '#7a5a38', '#8a6a40', '#a07a48', '#b8905a'];
const HAIR_GRAY = ['#8a8a90', '#b4b4ba', '#d0d0d4', '#6a6a70'];
const HAIR_DYED = ['#7a4a22', '#9a6a2a', '#6a2a2a', '#b08a3a', '#c9a24a', '#8a1f1f', '#3a4a7a', '#5a3a6a'];
const HAIR_FUN = ['#f2e29a', '#e9e9f0', '#d8402e', '#27a6d8', '#8a44d8', '#ff7ab8', '#e8a23a', '#3ad8a0', '#2f6fe8', '#e8e84a', '#ff5a3a', '#c4c4cc', '#d83a8a', '#1fb85a'];      // 前衛染髮：金、白金、紅、藍、紫、粉、橘、薄荷
const SKINS = ['#ffd6b0', '#ffd2a8', '#f6c394', '#eebb8c', '#e3ac7c', '#d79e72', '#c98f64', '#bf8559', '#f8dcc4'];
const SKINS_F = SKINS.concat(['#f8dcc4', '#c68a5c', '#a8714a', '#8a5a3a', '#6e4630', '#563522', '#fbe3d0', '#e8b890', '#4a2e1e']);
/* 外籍球員（造型較前衛：染髮、髒辮、爆炸頭、鬍鬚、耳環、墨鏡）。球員名單可自行增減 */
const FOREIGN = new Set(['銳力獅', '羅戈', '勝騎士', '德保拉', '布雷克', '獅帝芬', '喬登', '馬傑森', '威克', '威能帝', '艾菩樂', '魔力藍', '梅賽鍶', '鋼龍', '魔神龍', '魔鷹', '艾速特', '坎南', '魔爾曼', '髙塩將樹', '鈴木駿輔']);
const FOREIGN_JP = new Set(['髙塩將樹', '鈴木駿輔']);
const EAR_GEO = new THREE.SphereGeometry(.09, 8, 6);
const wpick = (r, tbl) => { let s = 0; for (const x of tbl) s += x[1]; let q = r() * s; for (const x of tbl) { if ((q -= x[1]) < 0) return x[0]; } return tbl[0][0]; };
function visForBase(key) {      // 外觀只影響視覺，不影響任何能力值
  const fg = FOREIGN.has(key), jp = FOREIGN_JP.has(key), r = mkRng(hashStr('vis:' + key) ^ 0x9e3779b9), R = (a, b) => a + (b - a) * r(), pk = a => a[Math.floor(r() * a.length)];
  // ---- 體型：瘦高／普通／結實／肌肉／圓潤／嬌小／高壯 ----
  const bt = wpick(r, fg ? [['lean', 7], ['tall', 10], ['avg', 11], ['stout', 13], ['muscle', 20], ['round', 11], ['small', 1], ['big', 20], ['huge', 10]] : [['lean', 14], ['tall', 8], ['avg', 28], ['stout', 14], ['muscle', 9], ['round', 9], ['small', 11], ['big', 9], ['huge', 2]]);
  let h, w, hs, aw0 = null, belly = 0;
  switch (bt) {
    case 'lean': h = R(1.03, 1.1); w = R(.84, .93); hs = R(.93, 1.0); break;
    case 'avg': h = R(.98, 1.04); w = R(.97, 1.05); hs = R(.97, 1.04); break;
    case 'stout': h = R(.95, 1.01); w = R(1.1, 1.2); hs = R(1.0, 1.06); break;
    case 'muscle': h = R(1.0, 1.07); w = R(1.08, 1.16); hs = R(.95, 1.02); aw0 = R(1.12, 1.28); break;
    case 'round': h = R(.93, 1.0); w = R(1.15, 1.28); hs = R(1.02, 1.09); belly = R(.2, .36); break;
    case 'tall': h = R(1.1, 1.17); w = R(.9, .99); hs = R(.92, .98); break;
    case 'huge': h = R(1.08, 1.15); w = R(1.2, 1.34); hs = R(.93, .99); belly = R(.1, .3); aw0 = R(1.12, 1.3); break;
    case 'small': h = R(.86, .93); w = R(.88, .97); hs = R(1.04, 1.1); break;
    default: h = R(1.06, 1.14); w = R(1.12, 1.24); hs = R(.95, 1.02); if (r() < .4) belly = R(.08, .22);
  }
  // ---- 髮型：本土球員有光頭、辮子頭、包包頭等；外籍球員偏前衛 ----
  const hair = wpick(r, fg
    ? (jp ? [['buzz', 12], ['short', 20], ['mid', 16], ['long', 8], ['bun', 8], ['braid', 6], ['curly', 7], ['pony', 6], ['mullet', 6], ['bob', 5], ['mohawk', 3], ['topknot', 4], ['flip', 6], ['wavy', 4], ['undercut', 6]]
          : [['dreads', 14], ['afro', 9], ['braid', 6], ['cornrow', 8], ['twist', 7], ['mohawk', 6], ['mullet', 6], ['bob', 4], ['topknot', 5], ['short', 9], ['mid', 6], ['long', 7], ['curly', 6], ['bun', 6], ['bald', 8], ['buzz', 8], ['flip', 5], ['wavy', 5], ['undercut', 5]])
    : [['bald', 7], ['buzz', 12], ['short', 20], ['mid', 14], ['long', 6], ['pony', 5], ['curly', 6], ['braid', 6], ['bun', 4], ['dreads', 3], ['afro', 2], ['mullet', 4], ['bob', 4], ['cornrow', 2], ['twist', 2], ['mohawk', 2], ['topknot', 3], ['short', 6], ['flip', 7], ['wavy', 5], ['undercut', 7]]);
  const natural = pk(HAIR_COLS), hairCol = fg ? (r() < (jp ? .5 : .62) ? pk(HAIR_FUN) : r() < .06 ? pk(HAIR_GRAY) : natural) : (r() < .06 ? '#d8b868' : r() < .16 ? pk(HAIR_DYED) : r() < .05 ? pk(HAIR_GRAY) : natural);
  const tipCol = fg ? (r() < .65 ? pk(HAIR_FUN) : hairCol) : (hair === 'braid' ? (r() < .5 ? '#c0392b' : hairCol) : r() < .08 ? pk(HAIR_DYED) : hairCol);
  const br = r(), beard = fg ? (br < .20 ? 0 : br < .38 ? 1 : br < .60 ? 2 : br < .78 ? 3 : 4) : (br < .06 ? 1 : br < .10 ? 2 : br < .14 ? 3 : br < .18 ? 4 : 0);
  return { h, w, d: R(.92, 1.08), hs, ll: R(.96, 1.04), lw: R(.92, 1.0) + (w - 1) * .6, aw: aw0 !== null ? aw0 : R(.92, 1.0) + (w - 1) * .7, al: R(.97, 1.04),
    belly, skin: (fg && !jp) ? pk(SKINS_F) : pk(SKINS), hair, hairCol, tipCol, beardCol: natural, burn: hair !== 'bald' && r() < .3, beard: hair === 'bald' && !beard && r() < .5 ? 1 : beard,
    braids: r() < .45 ? 2 : 1, dreadN: 9 + Math.floor(r() * 4), dreadL: R(.5, .85),
    earring: fg ? (r() < .55 ? (r() < .6 ? 2 : 1) : 0) : (r() < .04 ? 1 : 0), shades: fg ? r() < .3 : r() < .02, eyeblack: r() < (fg ? .3 : .22),
    eyeSp: R(.9, 1.12), eyeS: R(.85, 1.15), eyeH: R(.9, 1.25), ear: R(.8, 1.3) };
}
/* 指定造型的球員（只影響外觀）：陳傑憲＝陣中最帥——身形修長勻稱的運動員體格、小臉、比例佳，俐落黑色短髮、乾淨無鬍、健康小麥膚色 */
const VIS_SPECIAL = {
  '陳傑憲': { h: 1.07, w: .99, d: 1.0, hs: .94, ll: 1.05, lw: .97, aw: 1.04, al: 1.03, belly: 0, skin: '#e9b78a', hair: 'short', hairCol: '#15110e', tipCol: '#15110e', beardCol: '#15110e',
    burn: true, beard: 0, earring: 0, shades: false, eyeblack: false, eyeSp: 1.04, eyeS: 1.0, eyeH: 1.12, ear: .9 }
};
VIS_SPECIAL['蘇家禾'] = { h: 1.13, w: .95, d: .95, hs: .9, ll: 1.1, lw: .95, aw: .98, al: 1.06, belly: 0, skin: '#f3cba6', hair: 'kr', hairCol: '#0c0c10', tipCol: '#0c0c10', beardCol: '#0c0c10',
  burn: false, beard: 0, earring: 0, shades: false, eyeblack: false, eyeSp: 1.06, eyeS: 1.05, eyeH: 1.18, ear: .85 };
function visFor(key) { const v = visForBase(key); return VIS_SPECIAL[key] ? Object.assign(v, VIS_SPECIAL[key]) : v; }
function addHairEars(head, vis, bare) {
  const hm = mat(vis.hairCol), sk = mat(vis.skin), PI = Math.PI;
  for (const s of [-1, 1]) { const e = new THREE.Mesh(EAR_GEO, sk); e.position.set(s * .5, -.04, -.02); e.scale.setScalar(vis.ear); head.add(e); }
  const band = (len, rad, p0, pl) => { const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 16, 8, p0, pl, PI * .5, PI * len), hm); head.add(m); return m; };
  const T = vis.hair;
  if (T === 'bald') { /* 光頭：不加髮片 */ }
  else if (T === 'buzz') band(.07, .53, PI * .85, PI * 1.3);
  else if (T === 'short') band(.12, .535, PI * .8, PI * 1.4);
  else if (T === 'kr') {      // 韓系髮型：蓬鬆有層次的瀏海、兩側微蓋耳、後腦自然收尾
    const cap = (r, p0, pl, t0, tl, sy) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, p0, pl, t0, tl), hm); if (sy) m.scale.y = sy; head.add(m); return m; };
    cap(.552, 0, PI * 2, 0, PI * .36, 1.05);                                   // 頂部蓬鬆
    cap(.545, PI * .8, PI * 1.4, PI * .36, PI * .2);                           // 兩側＋後腦上緣
    cap(.54, PI * .8, PI * 1.4, PI * .56, PI * .12);                           // 兩側鬢角蓋耳上緣
    band(.2, .54, PI * .75, PI * 1.5);                                         // 後頸收尾
    for (let i = 0; i < 7; i++) {                                              // 斜分瀏海：髮束由頭頂往前額垂落
      const a = PI * (.28 + i * .07), f = new THREE.Mesh(new THREE.BoxGeometry(.13, .22 + (i % 2) * .05, .05), hm);
      f.position.set(-Math.cos(a) * .47, .22 - (i % 2) * .02, Math.sin(a) * .47); f.rotation.set(-.55, -(a - PI * .5) * .9, (3 - i) * .06); head.add(f);
    }
    const q = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), hm); q.scale.set(1.5, .7, 1.1); q.position.set(.05, .5, .1); head.add(q);   // 頂部瀏海蓬度
  }
  else if (T === 'flip') { band(.12, .535, PI * .8, PI * 1.4); for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 3.0, t = new THREE.Mesh(new THREE.SphereGeometry(.075, 6, 5), hm); t.scale.set(1, 1.3, 1.6); t.position.set(Math.sin(a) * .54, -.02 - (i % 2) * .04, -Math.cos(a) * .54); head.add(t); } }      // 帽簷下往外翻的髮尾
  else if (T === 'wavy') { band(.18, .538, PI * .75, PI * 1.5); for (let r2 = 0; r2 < 2; r2++) for (let i = 0; i < 8; i++) { const a = (i / 7 - .5) * 3.2, t = new THREE.Mesh(new THREE.SphereGeometry(.095, 7, 5), hm); t.position.set(Math.sin(a) * (.53 + r2 * .03), -.06 - r2 * .13, -Math.cos(a) * (.53 + r2 * .03)); head.add(t); } }      // 波浪捲髮
  else if (T === 'undercut') { band(.06, .53, PI * .8, PI * 1.4); const tp = new THREE.Mesh(new THREE.BoxGeometry(.5, .16, .14), hm); tp.position.set(0, .12, -.48); tp.rotation.x = .2; head.add(tp); }      // 兩側剃短、後腦留長
  else if (T === 'mid') band(.18, .538, PI * .75, PI * 1.5);
  else if (T === 'long') { band(.24, .54, PI * .75, PI * 1.5); const b = new THREE.Mesh(new THREE.BoxGeometry(.7, .5, .14), hm); b.position.set(0, -.3, -.4); b.rotation.x = .12; head.add(b); }
  else if (T === 'pony') { band(.12, .535, PI * .8, PI * 1.4); const ball = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 6), hm); ball.position.set(0, .0, -.57); head.add(ball); const tail = new THREE.Mesh(new THREE.CylinderGeometry(.08, .03, .42, 8), hm); tail.position.set(0, -.2, -.62); tail.rotation.x = -.15; head.add(tail); }
  else if (T === 'curly') { band(.1, .53, PI * .8, PI * 1.4); for (let i = 0; i < 14; i++) { const ph = PI * (.85 + 1.3 * i / 13), th = PI * (.53 + (i % 2) * .08), c = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), hm); c.position.set(-.54 * Math.cos(ph) * Math.sin(th), .54 * Math.cos(th), .54 * Math.sin(ph) * Math.sin(th)); head.add(c); } }
  else if (T === 'braid') {       // 辮子頭：1～2 條粗辮從後腦垂下，尾端綁色圈
    band(.12, .535, PI * .8, PI * 1.4); const tm = mat(vis.tipCol);
    for (const bx of (vis.braids === 2 ? [-.2, .2] : [0])) {
      for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(.105 - i * .008, 8, 6), hm); sp.position.set(bx, -.1 - i * .16, -.5 - i * .03); sp.scale.y = 1.15; head.add(sp); }
      const tp = new THREE.Mesh(new THREE.SphereGeometry(.062, 6, 5), tm); tp.position.set(bx, -.1 - 6 * .16, -.5 - 6 * .03); head.add(tp);
    }
  }
  else if (T === 'dreads') {      // 髒辮：後腦一圈細長辮，尾端可染色
    band(.15, .54, PI * .78, PI * 1.44); const tm = mat(vis.tipCol), n = vis.dreadN;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - .5) * 2.3, L = vis.dreadL * (.78 + ((i * 37) % 5) * .1), g = new THREE.Group();
      g.position.set(Math.sin(a) * .5, -.06, -Math.cos(a) * .5); g.rotation.set(.12, 0, Math.sin(a) * .22);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(.048, .04, L * .68, 6), hm); up.position.y = -L * .34; g.add(up);
      const dn = new THREE.Mesh(new THREE.CylinderGeometry(.04, .03, L * .34, 6), tm); dn.position.y = -L * .68 - L * .15; g.add(dn); head.add(g);
    }
  }
  else if (T === 'afro') {        // 爆炸頭：帽簷下蓬起的髮團
    band(.1, .53, PI * .8, PI * 1.4);
    for (let i = 0; i < 15; i++) { const a = (i / 14 - .5) * 3.8, row = i % 3, rad = .5 + (row === 1 ? .09 : 0), y = row === 2 ? .1 : row === 1 ? .0 : -.1, sp = new THREE.Mesh(new THREE.SphereGeometry(.17 + (i % 2) * .03, 8, 6), hm); sp.position.set(Math.sin(a) * rad, y, -Math.cos(a) * rad); head.add(sp); }
  }
  else if (T === 'bun') { band(.12, .535, PI * .8, PI * 1.4); const bn = new THREE.Mesh(new THREE.SphereGeometry(.19, 10, 8), hm); bn.position.set(0, .12, -.56); head.add(bn); const rb = new THREE.Mesh(new THREE.TorusGeometry(.17, .025, 6, 12), mat(vis.tipCol)); rb.position.set(0, .12, -.56); rb.rotation.y = PI / 2; head.add(rb); }
  else if (T === 'mullet') { band(.16, .538, PI * .78, PI * 1.44); const b = new THREE.Mesh(new THREE.BoxGeometry(.62, .46, .16), hm); b.position.set(0, -.3, -.42); b.rotation.x = .15; head.add(b); for (const sx of [-1, 1]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(.1, .3, .22), hm); sd.position.set(sx * .47, -.18, -.1); head.add(sd); } }
  else if (T === 'bob') { band(.2, .54, PI * .75, PI * 1.5); const b = new THREE.Mesh(new THREE.BoxGeometry(.74, .36, .15), hm); b.position.set(0, -.18, -.43); head.add(b); for (const sx of [-1, 1]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(.1, .36, .34), hm); sd.position.set(sx * .5, -.1, -.08); head.add(sd); } }
  else if (T === 'cornrow') { band(.1, .535, PI * .8, PI * 1.4); const tm = mat(vis.tipCol); for (let i = 0; i < 5; i++) { const x = (i - 2) * .15, c = new THREE.Mesh(new THREE.BoxGeometry(.05, .46, .05), hm); c.position.set(x, -.02, -.5 + Math.abs(i - 2) * .03); head.add(c); const tp = new THREE.Mesh(new THREE.SphereGeometry(.04, 6, 5), tm); tp.position.set(x, -.27, -.5 + Math.abs(i - 2) * .03); head.add(tp); } }
  else if (T === 'twist') { band(.1, .535, PI * .8, PI * 1.4); for (let i = 0; i < 18; i++) { const a = (i % 9 / 8 - .5) * 3.2, row = i < 9 ? 0 : 1, t = new THREE.Mesh(new THREE.SphereGeometry(.075, 6, 5), hm); t.scale.y = 1.9; t.position.set(Math.sin(a) * (.52 + row * .04), -.02 - row * .14, -Math.cos(a) * (.52 + row * .04)); head.add(t); } }
  else if (T === 'mohawk') { band(.08, .53, PI * .85, PI * 1.3); for (let i = 0; i < 7; i++) { const m2 = new THREE.Mesh(new THREE.BoxGeometry(.07, .2 - i * .008, .12), hm); m2.position.set(0, .3 - i * .045, -.12 - i * .075); m2.rotation.x = .3 + i * .09; head.add(m2); } }
  else if (T === 'topknot') { band(.1, .535, PI * .8, PI * 1.4); const k = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), hm); k.position.set(0, .32, -.34); head.add(k); const rb = new THREE.Mesh(new THREE.TorusGeometry(.12, .02, 6, 12), mat(vis.tipCol)); rb.position.set(0, .24, -.32); rb.rotation.x = PI / 2 - .3; head.add(rb); }
  /* ===== 第二批髮型／脫帽頭頂補片／眼鏡／髮帶（只是新增外觀；球員與舊角色沒有這些欄位時完全不受影響） =====
     bare＝脫帽模式（角色編輯器的「全程不戴」）：頭頂沒有帽子遮住，所以要補上頭頂的髮片、蓬度與瀏海 */
  { const TOPLESS = { bald: 1, mohawk: 1, kr: 1 }, TAU2 = PI * 2, tipM = mat(vis.tipCol), T2 = vis.hair;
    const cap2 = (r, p0, pl, t0, tl, sy) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, p0, pl, t0, tl), hm); if (sy) m.scale.y = sy; head.add(m); return m; };
    const bx = (w, h, d, x, y, z, rx, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hm); m.position.set(x, y, z); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; head.add(m); return m; };
    const sp = (r, x, y, z, sx, sy, sz, mt) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mt || hm); m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1); head.add(m); return m; };
    const spike = (dx, dy, dz, len, rad) => { const d = new THREE.Vector3(dx, dy, dz).normalize(), m = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 6), hm); m.position.copy(d).multiplyScalar(.5 + len * .3); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); head.add(m); };
    if (bare && !TOPLESS[T2]) { cap2(.536, 0, TAU2, 0, PI * .45); cap2(.537, PI * .8, PI * 1.4, PI * .45, PI * .07); }      // 脫帽：頭頂髮片（前額留出髮際線，後腦補滿）
    if (T2 === 'spiky') { band(.1, .535, PI * .8, PI * 1.4); if (bare) for (let i = 0; i < 17; i++) { const a = i * 2.4, th = i === 0 ? .05 : i < 9 ? .55 : 1.0; spike(Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a), .26, .075); } }      // 刺蝟頭
    else if (T2 === 'slick') { band(.1, .535, PI * .8, PI * 1.4); if (bare) sp(.2, 0, .46, -.05, 1.5, .55, 1.6); }      // 油頭
    else if (T2 === 'sidepart') { band(.12, .535, PI * .8, PI * 1.4); if (bare) { bx(.34, .1, .1, -.1, .44, .38, -.7, .35); bx(.26, .07, .1, .2, .47, .3, -.55, -.2); } }      // 旁分
    else if (T2 === 'bowl') { band(.2, .54, PI * .75, PI * 1.5); if (bare) { cap2(.56, 0, TAU2, 0, PI * .5); bx(.66, .13, .07, 0, .1, .5, .1); } }      // 鍋蓋頭
    else if (T2 === 'curtain') { band(.15, .536, PI * .78, PI * 1.44); if (bare) { bx(.26, .22, .07, -.15, .27, .44, -.45, .5); bx(.26, .22, .07, .15, .27, .44, -.45, -.5); } }      // 中分
    else if (T2 === 'pomp') { band(.08, .53, PI * .85, PI * 1.3); if (bare) sp(.2, 0, .52, .18, 1.5, .9, 1.4); }      // 飛機頭
    else if (T2 === 'twintail') { band(.12, .535, PI * .8, PI * 1.4); for (const s of [-1, 1]) { sp(.075, s * .44, .16, -.36, 1, 1, 1, tipM); const t = new THREE.Mesh(new THREE.CylinderGeometry(.1, .035, .6, 8), hm); t.position.set(s * .5, -.18, -.4); t.rotation.z = s * .12; head.add(t); } }      // 雙馬尾
    else if (T2 === 'twinbun') { band(.12, .535, PI * .8, PI * 1.4); for (const s of [-1, 1]) { sp(.17, s * .34, .4, -.28); const rb = new THREE.Mesh(new THREE.TorusGeometry(.14, .02, 6, 12), tipM); rb.position.set(s * .34, .3, -.26); rb.rotation.x = PI / 2 - .5; head.add(rb); } }      // 雙丸子
    else if (T2 === 'hipony') { band(.12, .535, PI * .8, PI * 1.4); sp(.09, 0, .4, -.4, 1, 1, 1, tipM); const t = new THREE.Mesh(new THREE.CylinderGeometry(.11, .035, .62, 8), hm); t.position.set(0, .15, -.58); t.rotation.x = .55; head.add(t); }      // 高馬尾
    else if (T2 === 'fade') { band(.09, .532, PI * .82, PI * 1.36); band(.045, .545, PI * .85, PI * 1.3); if (bare) bx(.42, .09, .46, 0, .5, -.02); }      // 漸層削邊
    else if (T2 === 'wolf') { band(.2, .54, PI * .75, PI * 1.5); bx(.58, .5, .14, 0, -.3, -.42, .18); bx(.4, .46, .12, 0, -.5, -.46, .25); for (const s of [-1, 1]) sp(.1, s * .47, -.06, -.1, 1, 1.5, 1); }      // 狼尾
    else if (T2 === 'shaggy') { band(.14, .536, PI * .78, PI * 1.44); if (bare) for (let i = 0; i < 11; i++) { const a = i * 2.4, th = (.15 + (i % 4) * .09) * PI; sp(.1 + (i % 3) * .015, Math.sin(th) * Math.cos(a) * .52, Math.cos(th) * .52, Math.sin(th) * Math.sin(a) * .52); } }      // 凌亂短髮
    if (vis.glasses) {      // 眼鏡：1 圓框、2 方框、3 運動護目鏡（鏡片半透明）
      const gm = new THREE.MeshLambertMaterial({ color: '#16181e', side: THREE.DoubleSide }), g3 = vis.glasses === 3, lens = new THREE.MeshLambertMaterial({ color: g3 ? '#2a6fb0' : '#9ec8e8', transparent: true, opacity: g3 ? .55 : .26, side: THREE.DoubleSide }), ex = .17 * vis.eyeSp;
      if (g3) {
        const gg = new THREE.Mesh(new THREE.CylinderGeometry(.575, .575, .15, 22, 1, true, -PI * .3, PI * .6), lens); gg.position.y = -.025; head.add(gg);
        for (const yy of [-.105, .05]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.577, .577, .02, 22, 1, true, -PI * .3, PI * .6), gm); r.position.y = yy; head.add(r); }
        const st = new THREE.Mesh(new THREE.CylinderGeometry(.548, .548, .05, 22, 1, true, PI * .3, PI * 1.4), gm); st.position.y = -.025; head.add(st);
      } else {
        for (const s of [-1, 1]) {
          const x = s * ex;
          if (vis.glasses === 1) { const fr = new THREE.Mesh(new THREE.TorusGeometry(.1, .014, 6, 20), gm); fr.position.set(x, -.015, .56); head.add(fr); const ln = new THREE.Mesh(new THREE.CircleGeometry(.1, 16), lens); ln.position.set(x, -.015, .557); head.add(ln); }
          else { const B = (w, h, px, py) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .014), gm); m.position.set(x + px, -.015 + py, .56); head.add(m); }; B(.21, .014, 0, .075); B(.21, .014, 0, -.075); B(.014, .15, .105, 0); B(.014, .15, -.105, 0); const ln = new THREE.Mesh(new THREE.PlaneGeometry(.2, .14), lens); ln.position.set(x, -.015, .557); head.add(ln); }
          const tp = new THREE.Mesh(new THREE.BoxGeometry(.014, .014, .56), gm); tp.position.set(s * .385, -.03, .28); tp.rotation.y = -s * .39; head.add(tp);      // 鏡腳
        }
        const br = new THREE.Mesh(new THREE.BoxGeometry(.1, .014, .014), gm); br.position.set(0, -.005, .56); head.add(br);      // 鼻樑架
      }
    }
    if (vis.headband) { const hb = new THREE.Mesh(new THREE.TorusGeometry(.53, .034, 6, 26), mat(vis.accCol || '#e8c040')); hb.rotation.x = PI / 2; hb.position.y = .1; head.add(hb); sp(.05, 0, .1, -.56, 1, 1, 1, mat(vis.accCol || '#e8c040')); }      // 髮帶（脫帽時看得到）
  }
  if (vis.burn) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.07, .22, .07), hm); b.position.set(s * .49, -.1, .17); head.add(b); }
  if (vis.beard) { const m = new THREE.MeshLambertMaterial({ color: vis.beardCol, transparent: vis.beard === 1, opacity: vis.beard === 1 ? .5 : 1 });
    if (vis.beard <= 2) head.add(new THREE.Mesh(new THREE.SphereGeometry(.525, 14, 8, 0, PI, PI * .64, PI * (vis.beard === 1 ? .12 : .17)), m));
    else { if (vis.beard === 4 || vis.beard === 3) { const st = new THREE.Mesh(new THREE.BoxGeometry(.3, .05, .07), m); st.position.set(0, -.2, .5); head.add(st); } if (vis.beard === 3) { const gt = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), m); gt.scale.set(1, 1.5, .7); gt.position.set(0, -.37, .46); head.add(gt); } } }
  if (vis.earring) for (const s of (vis.earring === 2 ? [-1, 1] : [-1])) { const e = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), mat(s < 0 ? '#f2c23a' : '#e4e8ee')); e.position.set(s * .56, -.15, -.02); head.add(e); }
  if (vis.eyeblack) for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.14, .035, .03), mat('#111')); m.position.set(s * .19, -.105, .468); m.rotation.z = -s * .15; head.add(m); }
  if (vis.shades) {               // 墨鏡掛在帽簷上方
    const sg = new THREE.Group(); sg.position.set(0, .46, .3); sg.rotation.x = .56; const lm = mat('#10141c');
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.2, .03, .12), lm); l.position.x = s * .15; sg.add(l); }
    const bg = new THREE.Mesh(new THREE.BoxGeometry(.1, .03, .03), lm); sg.add(bg); head.add(sg);
  }
}
/* ---------- 角色編輯器的五官預設／項鍊／護腕（vis 沒有這些欄位＝0＝不畫，球員與舊角色外觀完全不變） ---------- */
const shadeHex = (c, k) => { const h = String(c).replace('#', ''), v = [0, 2, 4].map(i => Math.max(0, Math.min(255, Math.round(parseInt(h.substr(i, 2), 16) * k)))); return '#' + v.map(x => x.toString(16).padStart(2, '0')).join(''); };
function eyeVariant(head, e, s, vis, sk) {      // 眼型：0 圓點眼（原本）、1 大圓眼、2 細長眼、3 笑眼、4 銳利眼、5 睏倦眼、6 亮晶晶
  const t = vis.eyeType | 0; if (!t) return; const x = s * .17 * vis.eyeSp, S1 = vis.eyeS, S2 = vis.eyeS * vis.eyeH;
  if (t === 1) { const w = new THREE.Mesh(new THREE.SphereGeometry(.088, 10, 8), mat('#ffffff')); w.position.set(x, -.02, .47); w.scale.set(S1, S2, .5); head.add(w); e.scale.multiplyScalar(1.12); }
  else if (t === 2) e.scale.set(S1 * 1.7, S1 * .38 * vis.eyeH, 1);
  else if (t === 3) { e.visible = false; const a = new THREE.Mesh(new THREE.TorusGeometry(.065, .017, 6, 10, Math.PI), mat('#1a1a1a')); a.position.set(x, -.03, .5); a.rotation.y = s * .35; a.scale.set(S1, S1, 1); head.add(a); }
  else if (t === 4) { e.scale.set(S1 * 1.35, S1 * .6 * vis.eyeH, 1); e.rotation.z = s * .3; }
  else if (t === 5) { const l = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), sk); l.position.copy(e.position); l.scale.set(S1, S2, S1); head.add(l); }
  else if (t === 6) { e.scale.multiplyScalar(1.45); const g = new THREE.Mesh(new THREE.SphereGeometry(.02, 6, 5), mat('#ffffff')); g.position.set(x + .026, .012, .563); head.add(g); }
}
function addFace(head, vis, sk) {      // 眉毛、鼻子、嘴巴
  const bw = vis.brow | 0, hb = vis.hairCol && lumOf(vis.hairCol) < .55 ? vis.hairCol : '#5a4636';
  if (bw) for (const s of [-1, 1]) {
    const w = bw === 5 ? .08 : bw === 2 ? .14 : .12, h = bw === 2 ? .052 : bw === 3 ? .034 : .028, rz = bw === 3 ? s * .3 : bw === 4 ? -s * .2 : bw === 2 ? s * .06 : 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .03), mat(hb)); m.position.set(s * .17 * vis.eyeSp, .085 + (vis.eyeH - 1.1) * .06 + (bw === 5 ? .035 : 0), .492); m.rotation.z = rz; m.rotation.y = s * .32; head.add(m);
  }
  const nz = vis.nose | 0, skd = mat(shadeHex(vis.skin, .86)), PI = Math.PI;
  if (nz === 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(.038, 8, 6), skd); m.position.set(0, -.115, .505); head.add(m); }
  else if (nz === 2) { const m = new THREE.Mesh(new THREE.ConeGeometry(.04, .11, 6), skd); m.rotation.x = PI / 2; m.position.set(0, -.1, .52); head.add(m); }
  else if (nz === 3) { const m = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), skd); m.scale.set(1.7, 1, 1); m.position.set(0, -.12, .505); head.add(m); }
  else if (nz === 4) { const m = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), skd); m.scale.set(1, 2.2, 1); m.position.set(0, -.05, .51); head.add(m); }
  const mo = vis.mouth | 0, mc = mat('#8a2f2f');
  if (mo && vis.beard !== 2) {
    if (mo === 1) { const m = new THREE.Mesh(new THREE.TorusGeometry(.075, .013, 5, 12, PI), mc); m.rotation.z = PI; m.position.set(0, -.235, .452); head.add(m); }
    else if (mo === 2) { const m = new THREE.Mesh(new THREE.BoxGeometry(.13, .02, .02), mc); m.position.set(0, -.27, .452); head.add(m); }
    else if (mo === 3) { const m = new THREE.Mesh(new THREE.CircleGeometry(.095, 14, PI, PI), mat('#5a1c1c')); m.position.set(0, -.235, .455); head.add(m); const t = new THREE.Mesh(new THREE.PlaneGeometry(.15, .03), mat('#ffffff')); t.position.set(0, -.25, .457); head.add(t); }
    else if (mo === 4) { const m = new THREE.Mesh(new THREE.TorusGeometry(.07, .012, 5, 12, PI * .7), mc); m.rotation.z = PI + .35; m.position.set(.03, -.24, .452); head.add(m); }
    else if (mo === 5) { const m = new THREE.Mesh(new THREE.TorusGeometry(.03, .011, 5, 10), mc); m.position.set(0, -.27, .452); head.add(m); }
  }
}
function addExtras(rig, vis, suit) {      // 項鍊（胸前金鍊＋墜飾）、護腕（色彩用 vis.accCol）
  if (suit) return; const ac = mat(vis.accCol || '#e8c040');
  if (vis.necklace) { const zf = .29 * vis.w * vis.d + .012, ch = new THREE.Mesh(new THREE.TorusGeometry(.13, .012, 6, 16, Math.PI), ac); ch.rotation.z = Math.PI; ch.position.set(0, 1.06, zf); rig.body.add(ch); const pd = new THREE.Mesh(new THREE.SphereGeometry(.036, 8, 6), ac); pd.position.set(0, .93, zf + .006); rig.body.add(pd); }
  if (vis.wristband) for (const a of [rig.armL, rig.armR]) { const wr = new THREE.Mesh(new THREE.CylinderGeometry(.108, .104, .075, 8), ac); wr.position.y = -.43; a.add(wr); }
}
const BS_DEF = { fsp: .22, yaw: -.45, lean: .1, crouch: .12, llx: -.1, lrx: .12, hd: 0, spread: .5, hy: 0, bth: -2.8, btl: .95, wag: .03, wagF: 3, tap: 0, tapF: 2, kick: 0, ld: .25, cth: 0, up: 0, cby: 0, fin: 1, finT: 1, rel: 0 };
const PS_DEF = { ab: .1, lift: 1, twist: .6, lean: 1, stride: 1, hi: 0, tilt: 0, tempo: 1 };
function batStyle(key) {      // 每位打者的預備動作與揮棒習慣
  const r = mkRng(hashStr('bat:' + key) ^ 0xc2b2ae35), R = (a, b) => a + (b - a) * r();
  return { fsp: R(.18, .3), yaw: R(-.7, -.25), lean: R(.02, .32), crouch: R(.1, .2), llx: R(-.3, .06), lrx: R(0, .32), hd: R(-.2, .22), spread: R(.38, .62), hy: R(.15, .4),
    bth: R(-3.0, -2.55), btl: R(.6, 1.25), wag: R(.015, .11), wagF: R(1.8, 5.2), tap: r() < .4 ? R(.4, 1) : 0, tapF: R(1.4, 2.6), kick: r() < .35 ? R(.45, 1) : R(0, .2),
    ld: R(.14, .4), cth: R(-.14, .14), up: R(-.03, .2), cby: R(-.1, .14), fin: R(.85, 1.2), finT: R(.8, 1.2), rel: r() < .4 ? R(.5, 1) : 0 };
}
function pitStyle(key) {      // 每位投手的投球姿勢：出手角度、抬腿高度、扭轉、前傾、跨步、雙手舉過頭、節奏
  const r = mkRng(hashStr('pit:' + key) ^ 0x85ebca6b), R = (a, b) => a + (b - a) * r(), k = r();
  const ab = k < .42 ? R(0, .12) : k < .8 ? R(.25, .5) : k < .94 ? R(.55, .78) : R(.85, 1.0);
  return { ab, lift: R(.75, 1.55), twist: R(.35, .95), lean: R(.68, 1.0), stride: R(.82, 1.2), hi: r() < .28 ? R(.5, 1) : 0, tilt: R(-.1, .1), tempo: R(.93, 1.1) };
}
const SIG_KINDS = ['highkick', 'rocker', 'turn', 'toetap', 'pump', 'sway', 'pause', 'quick'];
const SIG_DUR = { highkick: .9, rocker: 1.0, turn: .95, toetap: .75, pump: .85, sway: .85, pause: .95, quick: .4 };
function pitSig(p) {      // 每位投手固定一種「招牌預備動作」（高抬腿／後仰搖擺／轉身背對／點腳尖／雙臂上舉／左右搖晃／停頓／快速抬腳），投球前先做，讓打者知道要投了
  if (p._sig) return p._sig; const r = mkRng(hashStr('sig:' + (p.name || 'p')) ^ 0x9e3779b1), R = (a, b) => a + (b - a) * r();
  p._sig = { kind: SIG_KINDS[Math.floor(r() * SIG_KINDS.length)], amp: R(.75, 1.25), d: R(.85, 1.2), n: 2 + Math.floor(r() * 2) }; return p._sig;
}
const NUMTEX = {};
function numTex(n, fg, ol) { const k = n + fg + ol; return NUMTEX[k] || (NUMTEX[k] = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = ol; g.strokeText(String(n), 32, 35); g.fillStyle = fg; g.fillText(String(n), 32, 35); })); }
function lumOf(c) { try { const h = String(c).replace('#', ''), v = h.length === 3 ? h.split('').map(x => parseInt(x + x, 16)) : [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); const l = (v[0] * .3 + v[1] * .59 + v[2] * .11) / 255; return isNaN(l) ? .5 : l; } catch (e) { return .5; } }
const SHO_GEO = new THREE.SphereGeometry(.118, 10, 8), SLV_GEO = new THREE.CylinderGeometry(.098, .09, .27, 8), SOCK_GEO = new THREE.CylinderGeometry(.127, .117, .27, 10), RING_GEO = new THREE.CylinderGeometry(.13, .13, .03, 10),
  STRIPE_GEO = new THREE.BoxGeometry(.026, .5, .07), SOLE_GEO = new THREE.BoxGeometry(.255, .035, .4), PEL_GEO = new THREE.CylinderGeometry(.285, .27, .2, 14), COLLAR_GEO = new THREE.TorusGeometry(.2, .036, 6, 16), FLAP_GEO = new THREE.BoxGeometry(.09, .22, .3),
  BUCKLE_GEO = new THREE.BoxGeometry(.1, .07, .03), WRIST_GEO = new THREE.CylinderGeometry(.104, .1, .06, 8), LOGO_GEO = new THREE.CircleGeometry(.09, 14), NUM_GEO = new THREE.PlaneGeometry(.36, .36), WEB_GEO = new THREE.BoxGeometry(.2, .05, .12);
function addGear(rig, o, vis, jc, pc, sk, vkey, suit) {      // 球衣領口與背號、長袖內衣、球襪、褲側線、鞋底、腰帶扣、帽徽、護腕、打擊手套、耳罩…
  const sc = mat(o.cap || o.jersey), wh = mat('#f4f4f4'), hR = mkRng(hashStr('gear:' + vkey) ^ 0x51ed270b), body = rig.body, zf = .29 * vis.w * vis.d;
  for (const a of [rig.armL, rig.armR]) a.add(new THREE.Mesh(SHO_GEO, jc));      // 圓肩：手臂與軀幹接合更自然
  { const pel = new THREE.Mesh(PEL_GEO, pc); pel.position.y = .5; pel.scale.set(vis.w, 1, vis.w * vis.d); body.add(pel); }      // 骨盆：腿與上身永遠連在一起
  if (suit) return;
  for (const a of [rig.armL, rig.armR]) { const sl = new THREE.Mesh(SLV_GEO, sc); sl.position.y = -.37; a.add(sl); }      // 長袖內衣袖口
  for (const l of [rig.legL, rig.legR]) {
    const sock = new THREE.Mesh(SOCK_GEO, sc); sock.position.y = -.41; l.add(sock); const ring = new THREE.Mesh(RING_GEO, wh); ring.position.y = -.31; l.add(ring);      // 球襪＋白色環
    const st = new THREE.Mesh(STRIPE_GEO, sc); st.position.set((l === rig.legL ? -1 : 1) * .126, -.2, 0); l.add(st);      // 褲側線
    const sole = new THREE.Mesh(SOLE_GEO, wh); sole.position.set(0, -.625, .06); l.add(sole);      // 白色鞋底
  }
  { const bk = new THREE.Mesh(BUCKLE_GEO, mat('#d9b44a')); bk.position.set(0, .6, zf + .01); body.add(bk); }
  { const cl = new THREE.Mesh(COLLAR_GEO, sc); cl.rotation.x = Math.PI / 2; cl.position.y = 1.165; cl.scale.set(vis.w, vis.w * vis.d, 1); body.add(cl); const pk = new THREE.Mesh(new THREE.BoxGeometry(.035, .5, .02), wh); pk.position.set(0, .92, zf + .004); body.add(pk); }      // 領口＋前排扣
  if (!o.bare) { const lg = new THREE.Mesh(LOGO_GEO, wh); lg.position.set(0, .2, .522); rig.head.add(lg); }      // 帽徽
  if (!o.catcher && !o.ump && o.pl && o.pl.num != null && o.pl.num !== '') { const dark = lumOf(o.jersey) > .62, pl = new THREE.Mesh(NUM_GEO, new THREE.MeshLambertMaterial({ map: numTex(o.pl.num, dark ? (o.cap || '#222') : '#ffffff', dark ? '#ffffff' : '#111111'), transparent: true })); pl.position.set(0, .9, -(zf + .008)); pl.rotation.y = Math.PI; pl.scale.set(vis.w, 1, 1); body.add(pl); }      // 背號
  if (hR() < .55) { const wr = new THREE.Mesh(WRIST_GEO, hR() < .5 ? wh : mat('#1b1b20')); wr.position.y = -.5; (hR() < .5 ? rig.armL : rig.armR).add(wr); }      // 護腕
  if (o.helmet) { const fl = new THREE.Mesh(FLAP_GEO, rig.head.children.find(c => c.material && c.material.shininess) ? rig.head.children.find(c => c.material && c.material.shininess).material : jc); fl.position.set(.535, -.03, .02); rig.head.add(fl); }      // 打擊頭盔耳罩
  if (o.bat) for (const a of [rig.armL, rig.armR]) { const hd = a.children.find(c => c.geometry === GEO.hand); if (hd) hd.material = mat(hR() < .6 ? '#1b1b20' : (o.cap || '#1b1b20')); }      // 打擊手套
}
function addCatcherGear(rig, vis, col) {      // 捕手護具：面罩、護胸、護膝護脛
  const dk = mat('#23262e'), cm = mat(col || '#2a3a6a'), B = (w, h, d, m, x, y, z, par) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); par.add(b); return b; };
  B(.68 * vis.w, .6, .3, cm, 0, .9, .17, rig.body); B(.08, .56, .03, dk, 0, .9, -.3, rig.body).rotation.z = .55; B(.08, .56, .03, dk, 0, .9, -.3, rig.body).rotation.z = -.55;
  for (const l of [rig.legL, rig.legR]) { B(.23, .4, .14, cm, 0, -.33, .13, l); B(.21, .13, .17, dk, 0, -.09, .14, l); }
  const mk = new THREE.Group(); for (let i = 0; i < 3; i++) B(.6, .03, .05, dk, 0, -.2 + i * .14, .52, mk); for (const x of [-.18, 0, .18]) B(.03, .46, .05, dk, x, -.02, .53, mk); rig.head.add(mk);
  const tr = new THREE.Mesh(new THREE.TorusGeometry(.535, .028, 6, 18), dk); tr.rotation.x = Math.PI / 2; tr.position.y = .04; rig.head.add(tr);
  if (rig.glove) rig.glove.scale.setScalar(1.35);
}
function addUmpGear(rig, vis) {      // 主審護胸與推到頭頂的面罩
  const dk = mat('#2b2b33'); const b = new THREE.Mesh(new THREE.BoxGeometry(.64 * vis.w, .55, .26), dk); b.position.set(0, .9, .15); rig.body.add(b);
  const mk = new THREE.Group(); mk.position.set(0, .5, .12); mk.rotation.x = -.9; for (let i = 0; i < 3; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(.56, .03, .05), mat('#444')); bar.position.set(0, i * .12 - .1, .4); mk.add(bar); } rig.head.add(mk);
}
function makeChibi(o) {
  const suit = !!(o.pl && o.pl.suit), vkey = o.pl ? o.pl.name : 'x' + Math.random(), vis = o.vis || visFor(vkey), root = new THREE.Group(), jc = mat(suit ? '#141a2a' : o.jersey), pc = mat(suit ? '#10151f' : (o.pants || '#f4f4f4')), sk = mat(o.skin || vis.skin), cc = mat(o.cap || o.jersey);
  const bare = !suit && vis.hatMode === 'bare', shw = vis.sw || 1;      // 角色的帽子設定：std 標準（打擊戴頭盔）／cap 不戴頭盔（打擊也戴球帽）／bare 全程不戴
  if (!suit && o.helmet && (vis.hatMode === 'cap' || bare)) o = Object.assign({}, o, { helmet: false });
  if (bare) o = Object.assign({}, o, { bare: true });
  const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .04; sh.scale.set(1.8, 1.8, 1); root.add(sh);
  const body = new THREE.Group(); root.add(body);
  const torso = new THREE.Mesh(GEO.torso, jc); torso.position.y = .86; body.add(torso); torso.scale.set(vis.w * shw, 1, vis.w * vis.d);
  if (vis.belly > .02) { const bl = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 10), jc); bl.scale.set(vis.w * .95, .75, .8 + vis.belly * 2); bl.position.set(0, .78, .08); body.add(bl); }
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.285, .285, .1, 14), mat(suit ? '#0b0b0e' : (o.belt || '#222'))); belt.position.y = .6; body.add(belt); belt.scale.set(vis.w, 1, vis.w * vis.d);
  if (suit) {      // 正式西裝：白襯衫、深色翻領、紅領帶、金色口袋巾
    const zf = .29 * vis.w * vis.d, M = (w, h, d, c, x, y, z, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); if (rz) m.rotation.z = rz; body.add(m); return m; };
    M(.24, .48, .03, '#f7f7fb', 0, .92, zf + .004);
    M(.095, .5, .04, '#141a2a', .125, .92, zf + .016, -.2); M(.095, .5, .04, '#141a2a', -.125, .92, zf + .016, .2);
    M(.065, .38, .03, '#b0132b', 0, .86, zf + .024); M(.09, .08, .04, '#b0132b', 0, 1.07, zf + .026);
    M(.075, .04, .035, '#f2c14e', .19, .98, zf + .026);
  }
  const head = new THREE.Group(); head.position.y = 1.62; body.add(head); head.scale.setScalar(vis.hs * (o.bat ? .86 : 1)); if (o.bat) head.position.y = 1.6;      // 打者：頭小一點、不再陷進肩膀
  head.add(new THREE.Mesh(GEO.head, sk));
  for (const s of [-1, 1]) { const e = new THREE.Mesh(GEO.eye, mat('#1a1a1a')); e.position.set(s * .17 * vis.eyeSp, -.02, .485); e.scale.set(vis.eyeS, vis.eyeS * vis.eyeH, 1); head.add(e); eyeVariant(head, e, s, vis, sk); if (vis.blush !== false) { const ch = new THREE.Mesh(GEO.cheek, new THREE.MeshBasicMaterial({ color: 0xff9a9a, transparent: true, opacity: .55 })); ch.position.set(s * .3, -.12, .42); ch.lookAt(s * .6, -.12, 1.2); head.add(ch); } }
  addFace(head, vis, sk);
  const capm = new THREE.Mesh(o.helmet ? GEO.helm : GEO.cap, o.helmet ? new THREE.MeshPhongMaterial({ color: o.cap || o.jersey, shininess: 80 }) : cc); capm.rotation.x = -.1; capm.position.y = .03; head.add(capm);
  const brim = new THREE.Mesh(GEO.brim, o.helmet ? capm.material : cc); brim.position.set(0, .13, .5); brim.rotation.x = .12; head.add(brim); if (suit || bare) { capm.visible = false; brim.visible = false; } addHairEars(head, vis, bare);
  const mkLimb = (x, y, geo, len, m, hand) => { const g = new THREE.Group(); g.position.set(x, y, 0); const l = new THREE.Mesh(geo, m); l.position.y = -len / 2; g.add(l); if (hand) { const h = new THREE.Mesh(GEO.hand, sk); h.position.y = -len - .02; g.add(h); } return g; };
  const armL = mkLimb(.4, 1.12, GEO.arm, .5, jc, true), armR = mkLimb(-.4, 1.12, GEO.arm, .5, jc, true); body.add(armL, armR); { const sx = .3 * vis.w * shw + .1; armL.position.x = sx; armR.position.x = -sx; for (const a of [armL, armR]) a.scale.set(vis.aw, vis.al, vis.aw); }
  const legL = mkLimb(-.17, .56, GEO.leg, .55, pc), legR = mkLimb(.17, .56, GEO.leg, .55, pc); root.add(legL, legR); { const lx = .17 * (.85 + .15 * vis.w); legL.position.x = -lx; legR.position.x = lx; for (const l of [legL, legR]) l.scale.set(vis.lw, vis.ll, vis.lw); }
  for (const l of [legL, legR]) { const s = new THREE.Mesh(GEO.shoe, mat(['#1d1d22', '#1d1d22', '#1d1d22', '#f2f2f2', '#b31b1b', '#16306a'][hashStr('shoe:' + vkey) % 6])); s.position.set(0, -.56, .06); l.add(s); }
  let legBase = null, bodyY = 0; if (o.bat) { const sy = vis.ll * 1.18, y0 = .55 * sy + .01; for (const l of [legL, legR]) { l.position.y = y0; l.scale.y = sy; } legBase = { y0, sy }; bodyY = y0 - .56; }      // 打者：腿加長約 18%，上半身整體抬高；蹲低時腿縮短＝膝蓋彎曲
  let gloveM = null, bat = null;
  if (o.glove) { gloveM = new THREE.Mesh(GEO.glove, mat(['#8a5a2a', '#6b3f1d', '#a8742f', '#2a2a30', '#9a2a22', '#1f3a6a', '#c28a3a'][hashStr('glove:' + vkey) % 7])); gloveM.position.set(0, -.58, .1); armL.add(gloveM); const wb = new THREE.Mesh(WEB_GEO, mat('#3a2412')); wb.position.set(0, .12, .06); gloveM.add(wb); }
  let batTilt = null;
  if (o.bat) {
    bat = new THREE.Group(); batTilt = new THREE.Group(); bat.add(batTilt);
    const bm = new THREE.Group(); bm.rotation.z = -Math.PI / 2; batTilt.add(bm);          // bat extends along +x of the tilt group
    const hd = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .55, 8), mat('#d8b070')); hd.position.y = .27;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(.095, .055, .95, 10), mat('#e8c080')); br.position.y = .95;
    const kn = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), mat('#caa060')); bm.add(hd, br, kn); body.add(bat);
  }
  root.scale.setScalar((o.scale || 1) * vis.h);
  const rig = { root, body, head, torso, armL, armR, legL, legR, bat, batTilt, glove: gloveM, anim: null, t: 0, run: 0, side: 1, baseY: 0, fade: 1, vis, bs: batStyle(vkey), ps: pitStyle(vkey), legBase, bodyY };
  rig.mats = [];
  try { addGear(rig, o, vis, jc, pc, sk, vkey, suit); addExtras(rig, vis, suit); if (o.catcher) addCatcherGear(rig, vis, o.cap || o.jersey); if (o.ump) addUmpGear(rig, vis); } catch (e) { console.error(e); }
  return rig;
}
// ----- animations -----
// 左打者整個身體是鏡像（body.scale.x=-1），身體轉動方向（轉體／側傾）也要反向，否則會往反方向轉、揮棒軌跡變形
function setRigPose(r, p) { const sg = r.side < 0 ? -1 : 1; r.body.rotation.set(p.bx || 0, (p.by || 0) * sg, (p.bz || 0) * sg);r.body.position.y = (p.y || 0) + (r.bodyY || 0); r.armL.rotation.set(p.alx || 0, 0, p.alz || 0); r.armR.rotation.set(p.arx || 0, 0, p.arz || 0); r.legL.rotation.x = p.llx || 0; r.legR.rotation.x = p.lrx || 0; r.legL.rotation.z = p.llz || 0; r.legR.rotation.z = p.lrz || 0;
  if (!r.legBase && r.vis) { r.legL.scale.y = r.vis.ll * (1 - .45 * (p.llk || 0)); r.legR.scale.y = r.vis.ll * (1 - .45 * (p.lrk || 0));
    const up = Math.max(0, p.y || 0), jk = clamp((up - .12) * 3, 0, 1);      // 跳躍：雙腿跟著身體離地，空中收膝、前後微擺（不再留在地面）
    r.legL.position.y = r.legR.position.y = .56 + up; if (jk > 0) { r.legL.rotation.x -= .5 * jk; r.legR.rotation.x -= .3 * jk; r.legL.scale.y *= 1 - .22 * jk; r.legR.scale.y *= 1 - .22 * jk; } }      // 抬腿時小腿收起（膝蓋彎曲）
  if (r.legBase) { const cr = clamp(-(p.y || 0), 0, .4), y0 = r.legBase.y0; r.legL.position.y = r.legR.position.y = y0 - cr + Math.max(0, p.y || 0); r.legL.scale.y = r.legR.scale.y = r.legBase.sy * (y0 - cr) / y0; } r.head.rotation.set(p.hx || 0, p.hy || 0, p.hz || 0); groundRig(r); }
/* ---------- 落地修正：不論身高、腿長、打者加長腿、滑壘／撲壘／蹲低等任何姿勢，雙腳與身體都不會陷進地面 ----------
   舊版腿的支點固定在 .56，但鞋底底部在 -.64（×腿長比例），站著就陷進地面約 .08～.14，蹲低／滑壘更深。
   每次擺姿勢後，用鞋底四角算「腳」的最低點、用骨盆／軀幹上下圓盤／頭／雙手／手套算「身體」的最低點：
   ① 腳陷進去 → 身體＋雙腿一起往上補到鞋底剛好貼地；② 身體（滑壘、撲壘、倒地等）比腳陷得更深 → 只把身體再往上補，腿不跟著懸空。 */
const _gp = new THREE.Vector3();
const _SOLE = [[-.125, -.6425, -.14], [.125, -.6425, -.14], [-.125, -.6425, .26], [.125, -.6425, .26]];
const _DISK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function rigLowest(r, out) {      // 回傳（腳、身體）在人物座標系的最低高度；人物原點＝地面
  r.body.updateMatrix(); r.legL.updateMatrix(); r.legR.updateMatrix(); r.armL.updateMatrix(); r.armR.updateMatrix();
  let mf = 1e9, mb = 1e9;
  for (const lg of [r.legL, r.legR]) for (const q of _SOLE) { _gp.set(q[0], q[1], q[2]).applyMatrix4(lg.matrix); if (_gp.y < mf) mf = _gp.y; }
  const bm = r.body.matrix, vw = r.vis ? r.vis.w : 1;
  for (const dk of [[.5, .28 * vw], [.55, .27 * vw], [1.17, .3 * vw]]) for (const q of _DISK) { _gp.set(q[0] * dk[1], dk[0], q[1] * dk[1]).applyMatrix4(bm); if (_gp.y < mb) mb = _gp.y; }
  _gp.set(0, r.head.position.y, 0).applyMatrix4(bm); { const hy = _gp.y - .5 * (r.head.scale.y || 1); if (hy < mb) mb = hy; }
  for (const a of [r.armL, r.armR]) { _gp.set(0, -.52, 0).applyMatrix4(a.matrix).applyMatrix4(bm); const hy = _gp.y - .12; if (hy < mb) mb = hy; }
  if (r.glove) { _gp.copy(r.glove.position).applyMatrix4(r.armL.matrix).applyMatrix4(bm); const gy = _gp.y - .2 * (r.glove.scale.x || 1); if (gy < mb) mb = gy; }
  out.f = mf; out.b = mb; return out;
}
const _gl = { f: 0, b: 0 };
function groundRig(r) {
  if (!r || !r.body || !r.legL || !r.legR || !r.armL || !r.armR || !r.head) return;
  rigLowest(r, _gl);
  const lf = _gl.f < .01 ? .01 - _gl.f : 0;                                  // 腳要補多少（留 1 公分間隙，避免與地面 z-fighting）
  const lb = Math.max(lf, _gl.b < .01 ? .01 - _gl.b : 0);                    // 身體要補多少（至少跟腳一樣多）
  if (lb > 0) r.body.position.y += lb;
  if (lf > 0) { r.legL.position.y += lf; r.legR.position.y += lf; }
}
function rigPlay(r, name, dur, opt) { r.anim = { name, t: 0, dur: dur || 1, opt: opt || {} }; }
/* ---------- 捕手接球：手套一定在球最後到達的位置 ----------
   原本 'catch' 動作是固定把左手高舉(-2.4 弧度，接近過頭)並站直，不管球落在哪；球落在下緣時，球在下面、手套卻在上面「接空氣」，
   而且接完 0.3 秒就收手站起來、球卻還停在原處。現在：
   ① solveCatchPose：球飛到一半時，在捕手的實際骨架上掃描「手臂抬起角度／前傾／蹲高」，找出手套最靠近球終點的姿勢（只用 setRigPose＋世界座標，不新增模型）
   ② catcherPose：蹲姿平順過渡到該姿勢；再把手套本體在手臂座標內微調，讓手套中心與球終點完全重合（上限 .34 公尺）
   ③ 接球瞬間手套被球打得往後「頓」一下（球越快越明顯），球跟著手套一起動，然後手套維持在原位直到捕手回傳（hold） */
const _cgT = new THREE.Vector3(), _cgV = new THREE.Vector3();
function solveCatchPose(r, T) {
  if (!r || !r.glove || !r.armL) return null;
  const ck = Math.round(T.y * 25) + ':' + Math.round(T.z * 50); if (r._cgc && r._cgc[ck]) return r._cgc[ck];      // 同一個高度的球解過就直接用（解只跟 y、z 有關；x 由身體左右移動處理）：整場只有前幾球需要實際計算
  if (!r._gBase) r._gBase = r.glove.position.clone(); else r.glove.position.copy(r._gBase);
  const rx = r.root.position.x, best = { c: 1e9, k: 1e9, alx: -1.1, bx: .35, y: -.45, gx: 0 };
  const test = (bx, yy, alx) => {      // 擺姿勢→量手套離球終點多遠（只看 y、z；x 由身體左右移動解決）；稍微偏好原本的蹲姿，所以同樣接得到時不會亂變形
    setRigPose(r, { bx, y: yy, alx, arx: -.55, llx: -.9, lrx: -.9, hx: .1 }); r.root.updateMatrixWorld(true); r.glove.getWorldPosition(_cgV);
    const d = Math.hypot(_cgV.y - T.y, _cgV.z - (T.z + .1)), k = d + .015 * (Math.abs(bx - .35) + Math.abs(yy + .45));
    if (k < best.k) { best.k = k; best.c = d; best.bx = bx; best.y = yy; best.alx = alx; best.gx = _cgV.x - rx; }
  };
  for (const bx of [.35, .1, -.2]) { for (const yy of [-.45, -.6, -.25, 0]) for (let alx = -2.8; alx <= .5; alx += .22) test(bx, yy, alx); if (best.c < .03) break; }      // 粗掃
  { const b0 = best.bx, y0 = best.y, a0 = best.alx; for (const db of [-.08, 0, .08]) for (const dy of [-.07, 0, .07]) for (const da of [-.1, 0, .1]) test(b0 + db, y0 + dy, a0 + da); }      // 細修
  setRigPose(r, { bx: .35, alx: -1.1, arx: -.4, llx: -.9, lrx: -.9, y: -.45 });      // 掃描完還原成蹲姿，避免這一幀畫面停在掃描的最後一個姿勢
  (r._cgc || (r._cgc = {}))[ck] = best;
  return best;
}
function catcherPose(r, a, o) {
  const g = o.cg, T = o.T, pre = a.name === 'cset';
  const e = pre ? smx(clamp(a.t / Math.max(.05, a.dur), 0, 1)) : 1, L0 = (x0, x1) => x0 + (x1 - x0) * e;
  setRigPose(r, { bx: L0(.35, g.bx), alx: L0(-1.1, g.alx), arx: L0(-.4, -.55), llx: -.9, lrx: -.9, y: L0(-.45, g.y), hx: .1 * e });
  const gl = r.glove; if (!gl) return; if (!r._gBase) r._gBase = gl.position.clone();
  let tx = T.x, ty = T.y, tz = T.z, rc = 0;
  if (!pre) {
    const tt = a.t, amp = clamp(((o.kmh || 130) - 100) * .0014, .02, .08);
    rc = amp * Math.min(1, tt / .04) * Math.exp(-tt * 9);                                       // 球打進手套：手套被往後頂一下再回正（有分量的「啪」）
    tz += rc; ty -= rc * .45;
    if (tt > .06 && tt < .32 && tweens.length === 0 && ballMesh.visible && Math.hypot(ballMesh.position.x - T.x, ballMesh.position.y - T.y, ballMesh.position.z - T.z) < .4) ballMesh.position.set(tx, ty, tz);      // 球黏在手套裡跟著動
    if (tt > 2.4) { r.anim = { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } }; return; }      // 保險：沒人回傳也不會永遠舉著手
  }
  r.root.updateMatrixWorld(true); _cgT.set(tx, ty, tz + .1); r.armL.worldToLocal(_cgT); _cgT.sub(r._gBase);      // 手套中心＝球後方一點點（球在手套口袋前緣，看得到球）
  const L = _cgT.length(); if (L > .34) _cgT.multiplyScalar(.34 / L);
  gl.position.copy(r._gBase).addScaledVector(_cgT, e); r._gOff = true;
}
/* ---------- 揮棒殘影（棒身劃過的白色弧光）＋擊球衝擊環 ---------- */
const SWISH = [], RINGS = [], _swV = new THREE.Vector3();
function swishAdd(r, u) {
  if (u < .26 || u > .72 || window.__ff || !r.batTilt || !r.batTilt.children[0] || SWISH.length > 70) return;
  const bm = r.batTilt.children[0]; r.root.updateMatrixWorld(true);
  const w = u < .5 ? 1 : 1 - (u - .5) / .22;                                                   // 擊球點最亮，之後漸淡
  for (const yy of [.95, 1.2, 1.45]) {
    _swV.set(0, yy, 0); bm.localToWorld(_swV);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff1d0, opacity: 0 }));
    sp.position.copy(_swV); sp.scale.setScalar(.2 + (yy - .95) * .22); sp.renderOrder = 9; scene.add(sp); SWISH.push({ sp, t: 0, w: Math.max(.2, w) });
  }
}
const ringTex = canvasTex(128, 128, (g, w, h) => { const q = g.createRadialGradient(64, 64, 34, 64, 64, 62); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(.62, 'rgba(255,255,255,.95)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(0, 0, w, h); });
function spawnRing(x, y, z, size, col) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); if (col) sp.material.color.set(col);
  sp.position.set(x, y, z); sp.scale.set(.1, .1, 1); sp.renderOrder = 10; scene.add(sp); RINGS.push({ sp, t: 0, size });
}
function updateSwishRings(dt) {
  for (let i = 0; i < SWISH.length; i++) { const o = SWISH[i]; o.t += dt; const u = o.t / .16; o.sp.material.opacity = Math.max(0, (1 - u) * .55 * o.w); if (u >= 1) { scene.remove(o.sp); o.sp.material.dispose(); SWISH.splice(i, 1); i--; } }
  for (let i = 0; i < RINGS.length; i++) { const o = RINGS[i]; o.t += dt; const u = o.t / .26, e = 1 - Math.pow(1 - Math.min(1, u), 2.4); o.sp.scale.setScalar(.1 + o.size * e); o.sp.material.opacity = Math.max(0, 1 - u) * .85; if (u >= 1) { scene.remove(o.sp); o.sp.material.dispose(); RINGS.splice(i, 1); i--; } }
}
function rigStep(r, dt) {
  const a = r.anim; r.t += dt;
  if (r._gOff && r.glove && !(a && a.opt && a.opt.cg)) { r.glove.position.copy(r._gBase); r._gOff = false; }      // 捕手接球時手套被「帶到球的位置」；接球動作結束就還原
  if (r.run > 0.05 && !(a && a.name !== 'run')) {                                // running cycle
    const lm = r.limp || 0, ph = r.t * (7.6 + r.run * 0.7) * (1 - lm * .38); setRigPose(r, { llx: Math.sin(ph) * (.9 - lm * .62), lrx: -Math.sin(ph) * .9, alx: -Math.sin(ph) * .8, arx: Math.sin(ph) * .8, bx: .18 + lm * .1, bz: lm * Math.sin(ph) * .16, y: Math.abs(Math.sin(ph)) * (.08 - lm * .03) }); return;
  }
  if (!a) { const b = Math.sin(r.t * 2 + (r.root.id % 7)) * .02; setRigPose(r, { alz: .05, arz: -.05, y: b, bx: r.ready ? .22 : 0, llx: r.ready ? -.18 : 0, lrx: r.ready ? -.18 : 0, alx: r.ready ? .5 : 0, arx: r.ready ? .5 : 0 }); if (r.bat) { r.bat.position.set(0, 0, 0); } return; }
  a.t += dt; const u = a.warp ? (a.t < a.warp ? a.u0 + (.5 - a.u0) * a.t / a.warp : clamp(.5 + .5 * (a.t - a.warp) / Math.max(.01, a.dur - a.warp), 0, 1)) : clamp(a.t / a.dur, 0, 1), o = a.opt;      // warp：按下→接觸（u=.5）用 warp 秒，之後慢慢送棒收棒
  
  switch (a.name) {
    case 'windup': {           // pitcher; hand = +1 right
      const h = o.hand || 1;
      const lift = u < .55 ? sstep(u / .55) : 1 - sstep((u - .55) / .3), arm = u < .5 ? -2.6 * sstep(u / .5) : -2.6 + 5.4 * sstep((u - .5) / .45);
      const pose = { by: (u < .5 ? -h * .6 * sstep(u / .5) : -h * .6 + h * .9 * sstep((u - .5) / .5)), bx: u > .7 ? .5 * sstep((u - .7) / .3) : 0, llx: -1.3 * lift * (h > 0 ? 1 : 1), lrx: u > .6 ? .5 * sstep((u - .6) / .3) : 0, alx: -1.2 * lift, arx: 0 };
      if (h > 0) { pose.arx = arm; pose.alx = -1.2 * lift - .6 * sstep(u); } else { pose.alx = arm; pose.arx = -1.2 * lift; }
      setRigPose(r, pose); break;
    }
    case 'pitch': {            // 完整投球動作：重心後移→抬腿→跨步(身體前移)→手臂揮出(出手在 u=.62)→收尾回正
      const h = o.hand || 1, PS = r.ps || PS_DEF, S = 1.05 * PS.stride, REL = .62, ss = sstep, tw = PS.twist, LK = .8 * PS.lean;
      const lift = u < .06 ? 0 : u < .27 ? ss((u - .06) / .21) : u < .36 ? 1 : u < .5 ? 1 - ss((u - .36) / .14) * .75 : .25 * (1 - ss((u - .5) / .12));      // 標準投球：抬腿到最高點稍停（平衡點）再踏出
      const stride = u < .38 ? 0 : u < .62 ? ss((u - .38) / .24) : u < .74 ? 1 : 1 - ss((u - .74) / .26);
      // 手臂角度 θ（rotation.x，負＝向前）：合掌(θ≈-1.1) → 向下、向後拉到後方水平(θ=1.6) → 由上方甩過頭頂(θ=π) → 前上方出手(θ=4.2) → 收尾回垂直(θ=2π)
      let arm;
      if (u < .34) arm = -1.05 - .15 * ss(u / .34) - PS.hi * 1.7 * Math.sin(Math.PI * u / .34); else if (u < .5) arm = -1.2 + 2.8 * ss((u - .34) / .16); else if (u < REL) arm = 1.6 + 2.6 * ss((u - .5) / (REL - .5)); else if (u < .8) arm = 4.2 + 1.3 * ss((u - REL) / (.8 - REL)); else arm = 5.5 + .78 * ss((u - .8) / .2);
      const glove = u < .34 ? -1.05 - PS.hi * 1.7 * Math.sin(Math.PI * u / .34) : u < .5 ? -1.05 - .45 * ss((u - .34) / .16) : u < REL ? -1.5 + 1.1 * ss((u - .5) / (REL - .5)) : -.4 + .4 * ss((u - REL) / (1 - REL));
      const yaw = u < .12 ? 0 : u < .5 ? -h * tw * ss((u - .12) / .38) : u < REL ? -h * tw + h * (tw + .5) * ss((u - .5) / (REL - .5)) : h * .5 * (1 - ss((u - REL) / .38));
      const lean = u < .12 ? -.1 * ss(u / .12) : u < .34 ? -.1 + .02 * ss((u - .12) / .22) : u < REL ? -.08 + (LK + .08) * ss((u - .34) / (REL - .34)) : LK * (1 - ss((u - .78) / .22) * .95);
      const pose = { by: yaw, bx: lean, y: -.06 * ss(clamp((u - .45) / .17, 0, 1)) * (u < .8 ? 1 : 1 - ss((u - .8) / .2)), hx: .12 * ss(clamp((u - .2) / .3, 0, 1)) * (1 - ss(clamp((u - .8) / .2, 0, 1))), alz: u < .34 ? -.45 : 0, arz: u < .34 ? .45 : 0, hz: PS.tilt * ss(clamp((u - .3) / .3, 0, 1)) * (1 - ss(clamp((u - .8) / .2, 0, 1))) };
      { const abk = u < .34 ? 0 : u < .5 ? ss((u - .34) / .16) : u < .8 ? 1 : 1 - ss((u - .8) / .2), ab = PS.ab * abk; if (h > 0) pose.arz -= ab; else pose.alz += ab; pose.bz = -h * PS.ab * .22 * abk; }
      const lead = -1.45 * PS.lift * lift + (u > .5 ? .55 * stride : 0), trail = u > .56 ? .5 * ss((u - .56) / .16) * (1 - ss((u - .8) / .2)) : 0;     // 前腳抬起→踏出；後腳拖地
      const tuck = lift * (u < .5 ? 1 : 0) + (u >= .5 ? Math.max(0, 1 - stride * 1.6) * lift : 0);
      if (h > 0) { pose.llx = lead; pose.lrx = trail; pose.arx = arm; pose.alx = glove; pose.llk = tuck; } else { pose.lrx = lead; pose.llx = trail; pose.alx = arm; pose.arx = glove; pose.lrk = tuck; }
      setRigPose(r, pose); r.stride = S * stride; break;
    }
    case 'swing': batterPose(r, 'swing', u); swishAdd(r, u); if (u >= 1 && r.bat && E.bat && E.bat.rig === r) { r.anim = { name: 'recover', t: 0, dur: o.whiff ? .85 : .6, opt: { whiff: o.whiff, practice: o.practice } }; return; } break;
    case 'recover': batterPose(r, 'recover', u); if (u >= 1) { if (E.bat && E.bat.rig === r && G.phase !== 'inplay') batterStance(); else r.anim = null; } return;
    case 'bunt': batterPose(r, 'bunt', 1); break;
    case 'throw': {
      const e = u < .35 ? -2.4 * sstep(u / .35) : -2.4 + 4.4 * sstep((u - .35) / .35);
      setRigPose(r, { by: .4 * Math.sin(u * Math.PI) * (o.hand || 1), arx: e, alx: -.6, llx: -.3 * Math.sin(u * 3.14), bx: .25 * u }); break;
    }
    case 'capadj': { const h = o.hand || 1, k = sstep(clamp(u / .25, 0, 1)) * (1 - sstep(clamp((u - .72) / .28, 0, 1))), tap = Math.sin(a.t * 13) * .12 * k, pose = { bx: .1 * k, hx: .08 * k, llx: -.05, lrx: .05, y: -.02 * k }; if (h > 0) { pose.arx = -2.55 * k + tap; pose.alx = -.3 * k; } else { pose.alx = -2.55 * k + tap; pose.arx = -.3 * k; } setRigPose(r, pose); break; }      // 壓帽沿、整理帽子
    case 'wipe': { const h = o.hand || 1, k = sstep(clamp(u / .2, 0, 1)) * (1 - sstep(clamp((u - .8) / .2, 0, 1))), sw = Math.sin(a.t * 9) * .4 * k, pose = { bx: .14 * k, hx: .16 * k, y: -.03 * k }; if (h > 0) { pose.arx = -2.1 * k + sw; pose.arz = -.25 * k; } else { pose.alx = -2.1 * k + sw; pose.alz = .25 * k; } setRigPose(r, pose); break; }      // 用袖子擦汗
    case 'glovepound': { const k = sstep(clamp(u / .15, 0, 1)) * (1 - sstep(clamp((u - .85) / .15, 0, 1))), pn = Math.abs(Math.sin(a.t * 8)) * .32 * k; setRigPose(r, { bx: .2 * k, alx: -1.0 * k, arx: (-1.15 + pn) * k, alz: -.3 * k, arz: .3 * k, y: -.04 * k }); break; }      // 拳頭敲手套：集中精神
    case 'handsknee': { const k = sstep(clamp(u / .2, 0, 1)) * (1 - sstep(clamp((u - .85) / .15, 0, 1))); setRigPose(r, { bx: .62 * k, alx: .3 * k, arx: .3 * k, llx: -.15 * k, lrx: -.15 * k, y: -.2 * k, hx: -.25 * k }); break; }      // 雙手撐膝蓋的守備預備
    case 'fistpump': { const h = o.hand || 1, k = Math.sin(Math.PI * clamp(u, 0, 1)), pu = Math.abs(Math.sin(u * Math.PI * 2)); const pose = { bx: -.05 * k, hx: -.2 * k, y: .06 * pu }; if (h > 0) { pose.alx = -.5 * k; pose.arx = (-1.5 - 1.3 * pu) * k; pose.arz = -.2 * k; } else { pose.arx = -.5 * k; pose.alx = (-1.5 - 1.3 * pu) * k; pose.alz = .2 * k; } setRigPose(r, pose); break; }      // 三振後握拳怒吼
    case 'hips': { const k = sstep(clamp(u / .15, 0, 1)) * (1 - sstep(clamp((u - .88) / .12, 0, 1))), br = Math.sin(a.t * 2.4) * .02; setRigPose(r, { bx: .08 * k + br, hx: .38 * k, alx: -.25 * k, arx: -.25 * k, alz: .95 * k, arz: -.95 * k, y: -.03 * k }); break; }      // 雙手扠腰低頭（被轟之後）
    case 'shrug': { const k = sstep(clamp(u / .25, 0, 1)) * (1 - sstep(clamp((u - .75) / .25, 0, 1))); setRigPose(r, { bx: .05 * k, alx: -.7 * k, arx: -.7 * k, alz: .75 * k, arz: -.75 * k, hz: .18 * k, hx: .1 * k }); break; }      // 聳肩攤手（保送、判決不滿）
    case 'bk_slam': case 'bk_snap': case 'bk_drop': case 'bk_stomp': case 'bk_shake': case 'bk_pound': case 'bk_sigh': case 'bk_scream': case 'bk_kick': case 'bk_glare': {      // 被三振後的懊惱動作（13q 的 KFX.react 設定）：疊在打擊預備姿勢上
      if (!r.bat) { r.anim = null; return; } batterPose(r, 'stance', 0);
      const ee = sstep(clamp(u / .15, 0, 1)) * (1 - sstep(clamp((u - .85) / .15, 0, 1))), nm = a.name, ab = Math.abs(Math.sin(a.t * 8));
      if (nm === 'bk_shake') { r.head.rotation.y += Math.sin(a.t * 9) * .55 * ee; r.head.rotation.x += .4 * ee; r.body.rotation.x += .12 * ee; r.armL.rotation.z -= .3 * ee; r.armR.rotation.z += .3 * ee; }
      else if (nm === 'bk_stomp') { r.legL.rotation.x += -.9 * ab * ee; r.body.position.y -= .05 * ab * ee; r.head.rotation.x += .5 * ee; r.body.rotation.x += .15 * ee; r.armL.rotation.z -= .35 * ee; r.armR.rotation.z += .35 * ee; }
      else if (nm === 'bk_pound') { const s2 = Math.abs(Math.sin(a.t * 6.5)); r.body.rotation.x += .3 * s2 * ee; r.bat.position.y -= .45 * s2 * ee; r.bat.position.z += .12 * s2 * ee; r.head.rotation.x += .3 * ee; }
      else if (nm === 'bk_slam') { const w = sstep(clamp(u / .3, 0, 1)), d = sstep(clamp((u - .3) / .12, 0, 1)); r.armL.rotation.x = r.armR.rotation.x = -2.9 * w + 3.3 * d; r.body.rotation.x += -.18 * w + .55 * d * (1 - .5 * sstep(clamp((u - .6) / .4, 0, 1))); r.head.rotation.x += .35 * d; if (u >= .34 && !a.fx) { a.fx = 1; try { KFX.toss(r, 'slam'); } catch (e) { } } }
      else if (nm === 'bk_snap') { const w = sstep(clamp(u / .3, 0, 1)) * (1 - sstep(clamp((u - .6) / .2, 0, 1))); if (u < .6) { r.armL.rotation.x = r.armR.rotation.x = -1.05 * w; r.legL.rotation.x += -1.3 * w; r.body.rotation.x += .22 * w; } else { r.armL.rotation.x = r.armR.rotation.x = .1; r.body.rotation.x += .3 * ee; r.head.rotation.x += .5 * ee; } if (u >= .5 && !a.fx) { a.fx = 1; try { KFX.snapBat(r); } catch (e) { } } }
      else if (nm === 'bk_sigh') { const sg = Math.sin(a.t * 3.2) * ee; r.head.rotation.x += .55 * ee; r.head.rotation.y += sg * .5; r.body.rotation.x += .3 * ee; r.body.position.y -= .04 * ee; r.armL.rotation.x += .35 * ee; r.armR.rotation.x += .35 * ee; r.armL.rotation.z -= .25 * ee; r.armR.rotation.z += .25 * ee; r.bat.position.y -= .25 * ee; }      // 無奈：垂頭喪氣、慢慢搖頭嘆氣、球棒垂下
      else if (nm === 'bk_scream') { const w = sstep(clamp(u / .25, 0, 1)) * (1 - sstep(clamp((u - .78) / .22, 0, 1))), sk = Math.sin(a.t * 22) * .05 * w; r.head.rotation.x += -.7 * w; r.body.rotation.x += -.28 * w + sk; r.armL.rotation.x = -2.6 * w; r.armR.rotation.x = -2.6 * w; r.armL.rotation.z -= .5 * w; r.armR.rotation.z += .5 * w; r.legL.rotation.x += .15 * w; r.legR.rotation.x += -.15 * w; }      // 不甘心：仰天怒吼、雙臂高舉
      else if (nm === 'bk_kick') { const k2 = Math.max(0, Math.sin(a.t * 9)) * ee, k3 = Math.max(0, Math.sin(a.t * 9 + 3.1)) * ee; r.legL.rotation.x += -1.1 * k2 + .5 * k3; r.legR.rotation.x += .5 * k2 + -1.1 * k3; r.body.rotation.x += .28 * ee; r.head.rotation.x += .55 * ee; r.armL.rotation.z -= .3 * ee; r.armR.rotation.z += .3 * ee; r.body.position.y -= .03 * (k2 + k3); }      // 氣到猛踢打擊區的土
      else if (nm === 'bk_glare') { const g = sstep(clamp(u / .22, 0, 1)) * (1 - sstep(clamp((u - .82) / .18, 0, 1))); r.body.rotation.y += .6 * g; r.head.rotation.y += -.35 * g; r.head.rotation.x += -.05 * g; r.armL.rotation.x -= 1.0 * g; r.armR.rotation.x -= 1.0 * g; r.armL.rotation.z -= .5 * g; r.armR.rotation.z += .5 * g; r.body.rotation.x += .1 * g; }      // 不服氣：轉身瞪向投手／主審、握拳
      else { const d = sstep(clamp((u - .15) / .15, 0, 1)); r.armL.rotation.x = r.armR.rotation.x = -2.2 * ee; r.body.rotation.x += .25 * ee; r.head.rotation.x += .3 * ee; if (u >= .25 && !a.fx) { a.fx = 1; try { KFX.toss(r, 'drop'); } catch (e) { } } }
      if (u >= 1) { r.anim = null; if (E.bat && E.bat.rig === r && G.phase !== 'inplay') batterStance(); } return;
    }
    case 'headdown': { const k = sstep(clamp(u / .3, 0, 1)); setRigPose(r, { bx: .22 * k, hx: .55 * k, alx: .15 * k, arx: .15 * k, y: -.03 * k }); break; }      // 被三振後低頭
    case 'sign': { const f = sstep(clamp(u / .1, 0, 1)) * (1 - sstep(clamp((u - .9) / .1, 0, 1))), fg = Math.sin(a.t * 14) * .18 * f; setRigPose(r, { bx: .35, alx: -1.1, arx: -.4 + .45 * f + fg, llx: -.9, lrx: -.9, y: -.45, hx: .06 * Math.sin(a.t * 3) * f }); break; }      // 捕手蹲著比暗號
    case 'dust': { const k = sstep(clamp(u / .15, 0, 1)) * (1 - sstep(clamp((u - .85) / .15, 0, 1))), sw = Math.sin(a.t * 10) * .35 * k; setRigPose(r, { bx: .42 * k, alx: (.15 + sw) * k, arx: (.15 - sw) * k, alz: -.15 * k, arz: .15 * k, y: -.08 * k, hx: .18 * k }); break; }      // 拍掉褲子上的塵土
    case 'fidget': { batterPose(r, 'stance', 0); const env = Math.sin(Math.PI * clamp(u, 0, 1)), w = Math.sin(a.t * 7) * env; r.body.rotation.z += w * .05; r.head.rotation.y += Math.sin(a.t * 4) * .25 * env; r.legL.rotation.x += w * .18; r.legR.rotation.x -= w * .18; break; }      // 打者在打擊區晃動、調整站姿
    case 'sig': {              // 投球前的招牌準備動作（每位投手不同）：抬腳／後仰搖擺／轉身／點腳尖…
      const h = o.hand || 1, kd = o.kind || 'highkick', A = o.amp || 1, ss = sstep, ld = h > 0 ? 'l' : 'r', rear = h > 0 ? 'r' : 'l';
      const bump = (x, y) => u < x ? ss(u / x) : u < y ? 1 : 1 - ss((u - y) / (1 - y));      // 升起→停住→放下
      const pose = { bx: .22, alx: -1.2, arx: -1.2, alz: -.5, arz: .5, llx: -.1, lrx: .1, y: -.04, hx: .18 };
      const lead = (x, tk) => { pose[ld + 'lx'] = x; pose[ld + 'lk'] = tk || 0; pose[rear + 'lx'] = rear === 'l' ? -.1 : .1; };
      if (kd === 'highkick') { const k = bump(.3, .68); lead(-1.55 * A * k, k); pose.bx = .22 - .14 * k; pose.y = -.04 + .05 * k; pose.hx = .18 - .3 * k; pose.alx = pose.arx = -1.2 - .9 * k; }
      else if (kd === 'pause') { const k = bump(.28, .8); lead(-1.15 * A * k, k); pose.bx = .22 - .06 * k; pose.hx = .18 + Math.sin(a.t * 28) * .02 * k; }
      else if (kd === 'rocker') { pose.bx = .22 - .5 * ss(clamp(u / .35, 0, 1)) + .8 * ss(clamp((u - .35) / .3, 0, 1)) - .3 * ss(clamp((u - .65) / .35, 0, 1)); pose.y = -.04 - .06 * Math.sin(Math.PI * u); const kk = ss(clamp((u - .6) / .15, 0, 1)) * (1 - ss(clamp((u - .85) / .15, 0, 1))); lead(.3 * bump(.3, .45) * (1 - kk) - .7 * A * kk, kk * .6); }
      else if (kd === 'turn') { const k = bump(.35, .62); pose.by = -h * 1.8 * A * k; lead(-.7 * k, .5 * k); pose.hx = .18 - .08 * k; }
      else if (kd === 'toetap') { const tp = Math.abs(Math.sin(u * Math.PI * (o.n || 2))) * (u < .92 ? 1 : 1 - ss((u - .92) / .08)); lead(-.75 * A * tp, .3 * tp); pose.bx = .22 + .03 * tp; }
      else if (kd === 'pump') { const w = .5 - .5 * Math.cos(u * Math.PI * 2 * (o.n || 2)); pose.alx = pose.arx = -1.2 - 1.05 * w; pose.alz = -.5 * (1 - w * .6); pose.arz = .5 * (1 - w * .6); pose.bx = .22 - .1 * w; pose.y = -.04 + .03 * w; lead(-.3 * w, .1 * w); }
      else if (kd === 'sway') { const sw = Math.sin(u * Math.PI * 4), env = Math.sin(Math.PI * u); pose.bz = .14 * sw * env; pose.by = .15 * sw * env; pose.llx = -.1 - .35 * Math.max(0, sw) * env; pose.lrx = .1 - .35 * Math.max(0, -sw) * env; pose.y = -.04 - .03 * Math.abs(sw) * env; }
      else { const k = bump(.4, .6); lead(-.8 * k, .4 * k); }      // quick：快速抬腳（有跑者時的滑步）
      setRigPose(r, pose); break;
    }
    case 'nod': {              // 投手看捕手暗號：點頭 1~2 次（雙手收在胸前）
      const n = Math.max(0, Math.sin(u * Math.PI * (o.n || 3))) * .42;
      setRigPose(r, { bx: .14, alx: -1.1, arx: -1.1, alz: -.5, arz: .5, hx: n, hy: Math.sin(u * Math.PI) * .1 * (o.hand || 1), llx: -.04, lrx: .05 }); break;
    }
    case 'armshake': {         // 投球手臂甩一甩、轉肩放鬆
      const h = o.hand || 1, sw = Math.sin(u * Math.PI * 3) * .95 * Math.sin(u * Math.PI), pose = { bx: .06, bz: Math.sin(u * Math.PI * 3) * .04, hx: .1 * Math.sin(u * 6), hy: .08 * Math.sin(u * 4) };
      if (h > 0) { pose.arx = -.7 + sw; pose.alx = -.3; } else { pose.alx = -.7 + sw; pose.arx = -.3; }
      setRigPose(r, pose); break;
    }
    case 'legkick': {          // 踩投手板、小幅抬腳調整重心
      const k = Math.sin(u * Math.PI), kk = Math.sin(Math.min(1, u * 1.6) * Math.PI) * .8 + k * .2;
      setRigPose(r, { bx: .1 * k, y: .035 * k, alx: -1.05, arx: -1.05, alz: -.5, arz: .5, llx: (o.leg || 1) > 0 ? -.8 * kk : 0, lrx: (o.leg || 1) > 0 ? 0 : -.8 * kk, hx: .12 * k }); break;
    }
    case 'stretch': {          // 站定：雙手併在胸前、低頭看捕手，準備起動
      const k = sstep(u * 2.5);
      setRigPose(r, { bx: .22 * k, alx: -1.2 * k, arx: -1.2 * k, alz: -.5 * k, arz: .5 * k, llx: -.1 * k, lrx: .1 * k, y: -.04 * k, hx: .18 * k * (1 + Math.sin(a.t * 9) * .15) }); if (u >= 1) a.dur = 1e9; return;
    }
    case 'rosin': {            // 投手摸止滑粉：彎腰（屈膝）→ 投球手碰粉袋 3 下 → 起身雙手搓一搓握好球
      const h = o.hand || 1, ss = sstep, bend = ss(clamp(u / .2, 0, 1)) * (1 - ss(clamp((u - .5) / .15, 0, 1))), ch = ss(clamp((u - .5) / .15, 0, 1)) * (1 - ss(clamp((u - .9) / .1, 0, 1))), rw = bend * (1 - ch);
      const tp = (u > .26 && u < .48) ? Math.abs(Math.sin(Math.PI * (u - .26) / .11)) : (u <= .26 ? 1 : 1), rub = Math.sin(a.t * 15) * .1 * ch * (u > .6 && u < .88 ? 1 : 0);
      const tx = (-.7 + .25 * tp) * rw + (-1.1 + rub) * ch, gx = -.3 * rw + (-1.1 - rub) * ch;
      const pose = { bx: .7 * bend + .14 * ch, by: -.2 * h * bend, y: -.2 * bend, hx: .25 * bend + .1 * ch, llx: -.2 * bend, lrx: -.2 * bend, alz: -.5 * ch, arz: .5 * ch };
      if (h > 0) { pose.arx = tx; pose.alx = gx; } else { pose.alx = tx; pose.arx = gx; }
      setRigPose(r, pose); break;
    }
    case 'pcatch': { const k = Math.sin(Math.PI * clamp(u, 0, 1)); setRigPose(r, { bx: .35 - .12 * k, alx: -1.1 - .5 * k, arx: -.4 - .2 * k, llx: -.9, lrx: -.9, y: -.45 + .05 * k, hx: .12 * k }); break; }      // 蹲捕：接球時手套前伸、身體微微後仰
    case 'cset': case 'catch': if (o.cg && o.T) { catcherPose(r, a, o); break; } setRigPose(r, { alx: -2.4 * Math.sin(Math.min(u * 1.6, 1) * Math.PI / 2), bx: .1, llx: -.2, lrx: -.2 }); break;      // 捕手有 cg（依球落點解出的姿勢）就用 catcherPose：手套會到球的位置；其他野手接球維持原本動作
    case 'dive': setRigPose(r, { bx: 1.3 * sstep(u), alx: -2.6, arx: -2.6, llx: .8, lrx: .6, y: -.3 * u }); r.root.position.y = .0; break;
    case 'pickup': setRigPose(r, { bx: .95 * Math.sin(Math.min(1, u * 1.15) * Math.PI) + .1, alx: .2 - 1.0 * sstep(u), arx: .2 - 1.0 * sstep(u), llx: -.5 * Math.sin(u * Math.PI), lrx: .4 * Math.sin(u * Math.PI), y: -.25 * Math.sin(u * Math.PI) }); break;
    case 'slide': { const k = sstep(clamp(u / .16, 0, 1)) * (1 - sstep(clamp((u - .72) / .28, 0, 1))); setRigPose(r, { bx: -1.38 * k, llx: -1.55 * k, lrx: -.7 * k, alx: -2.8 * k, arx: -2.5 * k, alz: .25 * k, arz: -.25 * k, hx: -.35 * k, y: -.62 * k }); break; }      // 腳先滑壘：身體後仰幾乎貼地、一腳前伸、雙手高舉
    case 'hdive': { const k = sstep(clamp(u / .18, 0, 1)) * (1 - sstep(clamp((u - .74) / .26, 0, 1))); setRigPose(r, { bx: 1.42 * k, alx: -3.0 * k, arx: -3.0 * k, alz: .14 * k, arz: -.14 * k, llx: .55 * k, lrx: .3 * k, hx: -.6 * k, y: -.56 * k }); break; }      // 頭部先滑／撲壘：身體向前平撲、雙手前伸搆壘包      // 腳先滑壘：身體後仰貼地、雙手高舉，結束時站起
    case 'cheer': setRigPose(r, { alx: -2.9 + Math.sin(a.t * 14) * .3, arx: -2.9 - Math.sin(a.t * 14) * .3, alz: .3, arz: -.3, y: Math.abs(Math.sin(a.t * 7)) * .55 }); if (u >= 1) a.dur = 1e9; return;
    case 'down': setRigPose(r, { bx: .7, alx: .4, arx: .4, y: -.15 }); return;
    case 'rage': { const q = Math.sin(a.t * 11), q2 = Math.sin(a.t * 5.3); setRigPose(r, { bx: .28 + q2 * .08, by: q2 * .35, alx: -2.5 + q * .5, arx: -2.7 - q * .5, alz: .5, arz: -.5, llx: q * .55, lrx: -q * .55, hx: -.2 + q * .15, y: Math.abs(q) * .2 }); return; }      // 暴怒：跺腳、雙手亂揮
    case 'ko': setRigPose(r, { bx: .15, bz: 1.45, alx: -.3, arx: .3, llx: .1, lrx: -.05, hx: .4, y: -.05 }); return;      // 昏倒：整個人倒地不動
    case 'kneel': setRigPose(r, { bx: .85, alx: -.5, arx: -.5, llx: -.9, lrx: .2, hx: .2, y: -.32 }); return;      // 跪地查看／受驚
    case 'writhe': { const w1 = Math.sin(a.t * 8.5), w2 = Math.sin(a.t * 3.3); setRigPose(r, { bx: .55 + w2 * .12, bz: 1.28 + w1 * .1, alx: -1.1 + w1 * .7, arx: -.7 - w1 * .7, llx: .7 + w1 * .55, lrx: .25 - w1 * .55, hx: .3 + w2 * .2, y: -.12 }); return; }      // 被球砸中：側倒在地，抱著痛處翻滾
    // ---- 全壘打回到本壘的慶祝動作（隨機抽一種）----
    case 'cel1': { const j = Math.abs(Math.sin(a.t * 4.2)); setRigPose(r, { alx: -2.95, arx: -2.95, alz: .35, arz: -.35, y: j * .8, bx: -.12 * j, llx: -.4 * j, lrx: -.4 * j }); if (u >= 1) r.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; return; }          // 連續大跳＋雙手高舉
    case 'cel2': { const e = sstep(u); setRigPose(r, { by: e * Math.PI * 4, arx: -3.0, alx: .2, y: Math.abs(Math.sin(a.t * 3)) * .3 }); if (u >= 1) r.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; return; }                      // 單手指天旋轉兩圈
    case 'cel3': { if (u < .55) setRigPose(r, { arx: -3.05, alx: .3, hx: -.5, y: Math.abs(Math.sin(a.t * 5)) * .25, bz: Math.sin(a.t * 5) * .06 }); else setRigPose(r, { bx: .95 * Math.sin((u - .55) / .45 * Math.PI), alx: .2, arx: .2 }); if (u >= 1) r.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; return; }   // 指天感謝後鞠躬
    case 'cel4': { const s = Math.sin(a.t * 7); setRigPose(r, { alz: 1.5, arz: -1.5, alx: -.5 + s * .3, arx: -.5 - s * .3, bz: s * .12, y: Math.abs(s) * .12, hx: -.15 }); if (u >= 1) r.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; return; }                          // 擺肌肉秀
    case 'cel5': { const s = Math.sin(a.t * 6), s2 = Math.sin(a.t * 12); setRigPose(r, { by: s * .5, bz: s2 * .14, alx: -2.4 * Math.max(0, s), arx: -2.4 * Math.max(0, -s), llx: s2 * .5, lrx: -s2 * .5, y: Math.abs(s) * .15 }); if (u >= 1) r.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; return; }  // 搖擺舞
    case 'cel6': { const b = Math.abs(Math.sin(a.t * 2.6)); setRigPose(r, { bx: .85 * b, alz: 1.3, arz: -1.3, alx: -.2, arx: -.2, hx: -.3 * b }); if (u >= 1) r.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; return; }                                   // 向球迷三鞠躬
    case 'cel7': { const e = clamp(u * 2, 0, 1), jmp = Math.sin(Math.PI * e), p2 = Math.sin(a.t * 12) * (u > .5 ? 1 : 0); setRigPose(r, { bx: -.7 * jmp, y: jmp * 1.1, alx: -2.9 + p2 * .5, arx: -2.9 - p2 * .5, alz: .3, arz: -.3, llx: -.5 * jmp, lrx: -.5 * jmp }); if (u >= 1) r.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; return; }  // 後仰高跳＋雙拳連揮
    case 'point': setRigPose(r, { arx: -1.55, alx: 0 }); return;
    case 'eject': { const s = sstep(clamp(u / .18, 0, 1)), j = u > .18 ? Math.sin((u - .18) * 26) * .28 : 0; setRigPose(r, { arx: -2.95 * s + j * s, arz: -.45 * s, alx: -.25 * s, bx: .14 * s, hx: -.15 * s, y: .04 * s }); break; }      // 主審驅逐手勢：單手高舉、用力往外比（拇指向外甩）
    case 'ump': setRigPose(r, { arx: -2.7 * sstep(u), alx: 0 }); break;
    case 'ready': setRigPose(r, { bx: .55, alx: .9, arx: .9, llx: -.5, lrx: -.5, y: -.22 }); return;
    case 'crouch': setRigPose(r, { bx: .35, alx: -1.1, arx: -.4, llx: -.9, lrx: -.9, y: -.45 }); return;
    default: setRigPose(r, {});
  }
  if (u >= 1 && !o.hold) { r.anim = null; }
}
function ghostRig(r, op) {
  // 半透明（讓好球帶看得清楚）的捕手／主審：從背後看不應透出臉部五官（眼睛、眉毛、臉頰、眼睛下的黑貼、鬍子、墨鏡、帽簷等位在頭前方的零件），一律隱藏
  if (r.head) r.head.children.forEach(o => { if (!o.isMesh && !o.isGroup) return; const g = o.geometry, pr = g && g.parameters; if (o.position.z > .1 || (pr && pr.phiStart === 0 && pr.phiLength === Math.PI) || g === GEO.eye || g === GEO.cheek) o.visible = false; });
  r.root.traverse(o => { if (o.isMesh && o.material && !o.material.map) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = op; o.material.depthWrite = false; } }); }
const smx = k => k * k * (3 - 2 * k);
const BP_KEYS = ['by', 'bx', 'bz', 'y', 'llz', 'lrz', 'llx', 'lrx', 'alx', 'arx', 'alz', 'arz', 'hx', 'hy', 'hz', 'px', 'py', 'pz', 'th', 'tl'];
function bsParams(r, kind, u) {          // 依該打者的個人風格，算出（站姿／揮棒／短打）的身體與球棒姿勢
  const S = r.bs || BS_DEF, t = r.t, P = {}, wg = Math.sin(t * S.wagF), bob = Math.sin(t * 3) * .03, ax = -1.25 + S.hd;
  const base = { px: -.1, py: 1.14 - S.hd * .45 - (r.bodyY || 0), pz: .45 - S.hd * .2 };      // 球棒位置扣掉上半身抬高量：揮棒打擊區高度不變
  if (kind === 'swing') {
    const wh = r.anim && r.anim.opt && r.anim.opt.whiff ? 1 : 0; let th, tl, by;
    const th0 = S.bth, tl0 = S.btl, by0 = S.yaw, th1 = th0 - S.ld, tl1 = tl0 - .1, by1 = by0 - S.ld, th2 = -.2 + S.cth, tl2 = .03 + S.up, by2 = .8 + S.cby;
    if (u < .15) { const k = smx(u / .15); th = th0 + (th1 - th0) * k; tl = tl0 + (tl1 - tl0) * k; by = by0 + (by1 - by0) * k; }
    else if (u < .5) { const x = (u - .15) / .35, kb = Math.pow(x, 1.55), kh = Math.pow(x, 2.3), kt = Math.pow(x, 2.0); th = th1 + (th2 - th1) * kh; tl = tl1 + (tl2 - tl1) * kt; by = by1 + (by2 - by1) * kb; }      // 加速段：越揮越快、擊球點速度最大；身體(kb)先轉、手與棒頭(kh)稍晚才追上＝鞭打感（原本是對稱的 smoothstep，擊球瞬間速度反而是 0，看起來像「停一下再揮」）
    else { const y = (u - .5) / .5, kf = 1 - Math.pow(1 - y, 2.2); th = th2 + (1.35 + 1.15 * wh) * S.fin * kf; tl = tl2 + 1.1 * S.finT * kf; by = by2 + (.5 + .9 * wh) * S.fin * kf; }      // 送棒：從擊球點的速度順勢帶出去、再慢慢收（不是從 0 速重新起跑）；送棒更大、身體轉得更徹底
    const whx = wh && u > .5 ? .62 * smx((u - .5) / .5) : 0, kick = S.kick * Math.sin(Math.PI * clamp(u / .42, 0, 1)) * .95, rk = S.rel > 0 && u > .62 ? smx((u - .62) / .38) * S.rel : 0;
    const dip = .07 * Math.sin(Math.PI * clamp(u / .55, 0, 1)), hd0 = .2 * (u < .6 ? 1 : 1 - smx((u - .6) / .4));      // 揮棒時重心先下沉再頂起；頭部壓低盯著擊球點
    Object.assign(P, { hx: hd0, by, bx: S.lean + .1 * Math.sin(Math.PI * clamp(u / .6, 0, 1)) + (u > .15 ? S.up * 1.6 * smx(clamp((u - .15) / .35, 0, 1)) : 0) + whx, y: -S.crouch * (1 - .6 * u) - dip, llx: S.llx * (1 - u) + .12 * u - kick + whx * .6, lrx: S.lrx * (1 - u) - .1 * u - whx * .6,
      alx: ax, arx: ax, alz: -S.spread + rk * 1.3, arz: S.spread, hy: S.hy * (1 - .6 * u), llz: -S.fsp * (1 - .45 * u), lrz: S.fsp * (1 - .45 * u) }, base, { th, tl });
  } else if (kind === 'stance') {
    const tapK = S.tap * Math.pow(Math.max(0, Math.sin(t * S.tapF)), 5);
    Object.assign(P, { by: S.yaw, bx: S.lean, y: -S.crouch + bob, llx: S.llx - tapK * .55, lrx: S.lrx, alx: ax + wg * S.wag * .5, arx: ax + wg * S.wag * .5, alz: -S.spread, arz: S.spread, hy: S.hy, llz: -S.fsp, lrz: S.fsp },
      { px: base.px, py: base.py + bob + wg * S.wag * .25, pz: base.pz, th: S.bth + wg * S.wag * .6, tl: S.btl + wg * S.wag * 1.4 });
  } else {
    Object.assign(P, { bx: .5, by: .95, alx: -1.0, arx: -1.0, alz: -.45, arz: .45, llx: -.4, lrx: -.4, llz: -.15, lrz: .15, y: -.1, px: 0, py: 1.0 - (r.bodyY || 0), pz: .5, th: -1.57, tl: .05 });
  }
  return P;
}
function batterPose(r, kind, u) {
  const bat = r.bat, tilt = r.batTilt; if (!bat) return; let P;
  if (kind === 'recover') {            // 揮完（尤其揮空）後：先停一下收揮棒，再自然回到自己的預備姿勢
    const A = bsParams(r, 'swing', 1), B = bsParams(r, 'stance', 0), k = smx(clamp((u - .35) / .65, 0, 1)); P = {};
    for (const key of BP_KEYS) P[key] = (A[key] || 0) + ((B[key] || 0) - (A[key] || 0)) * k;
  } else P = bsParams(r, kind, u);
  if (kind === 'stance') {      // 球飛來時打者逐漸「蓄力」：手往後拉、重心微沉、前腳準備踏出，按下揮棒才能瞬間爆發（不再從靜止站姿直接彈出）
    r.loadK = (r.loadK || 0) + ((r.loadT || 0) - (r.loadK || 0)) * .2;
    if (r.loadK > .01) { const L = bsParams(r, 'swing', .22), k = r.loadK; for (const key of BP_KEYS) P[key] = (P[key] || 0) + ((L[key] || 0) - (P[key] || 0)) * k; }
  }
  setRigPose(r, P); bat.position.set(P.px || 0, P.py || 0, P.pz || 0); bat.rotation.set(0, P.th || 0, 0); tilt.rotation.set(0, 0, P.tl || 0);
  if (r.batShake) { const el = r.t - r.batShake.t0; if (el > .4 || el < 0) r.batShake = null; else tilt.rotation.z += Math.sin(el * 95) * r.batShake.amp * Math.exp(-el * 11); }      // 擊球後棒身餘震：甜蜜點只有輕輕一抖，吃到握把／球頭、擦棒則震得明顯
}
function faceRig(r, x, z) { const dx = x - r.root.position.x, dz = z - r.root.position.z; if (dx * dx + dz * dz > 1e-4) r.root.rotation.y = Math.atan2(dx, dz); }

/* ---------- ball ---------- */
const seamTex = canvasTex(256, 128, (g, w, h) => {      // 棒球縫線貼圖：旋轉才看得出球種
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8281e'; g.lineWidth = 5;
  for (const off of [h * .3, h * .7]) { g.beginPath(); for (let x = 0; x <= w; x += 4) { const y = off + Math.sin(x / w * Math.PI * 4) * h * .13; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.lineWidth = 2; for (let x = 0; x < w; x += 10) { const y1 = h * .3 + Math.sin(x / w * Math.PI * 4) * h * .13, y2 = h * .7 + Math.sin(x / w * Math.PI * 4) * h * .13; g.beginPath(); g.moveTo(x, y1 - 6); g.lineTo(x + 3, y1 + 6); g.moveTo(x, y2 - 6); g.lineTo(x + 3, y2 + 6); g.stroke(); }
});
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * .9, 14, 10), new THREE.MeshPhongMaterial({ color: 0xffffff, map: seamTex, shininess: 60 })); ballMesh.visible = false; scene.add(ballMesh);
const ballShadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = .05; ballShadow.scale.set(1, 1, 1); ballShadow.visible = false; scene.add(ballShadow);
const TRAIL_N = 26; const trail = []; for (let i = 0; i < TRAIL_N; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * (.8 - i / TRAIL_N * .55), 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .0 })); m.visible = false; scene.add(m); trail.push(m); }
const trailPos = [];
function setBall(p, vis, trailCol, tfx) {
  ballMesh.visible = vis; ballShadow.visible = vis; if (!vis) { trail.forEach(t => t.visible = false); return; }
  ballMesh.position.set(p.x, p.y, p.z); ballShadow.position.set(p.x, .05, p.z); const s = 1.1 + p.y * .12; ballShadow.scale.set(s, s, 1);
  ballShadow.material.opacity = clamp(1 - p.y / 40, .25, 1);
  if (trailCol !== undefined) {
    trailPos.unshift(p.clone ? p.clone() : new V3(p.x, p.y, p.z)); if (trailPos.length > TRAIL_N) trailPos.pop();
    const tn = tfx ? tfx.n : TRAIL_N, top = tfx ? tfx.op : .5, fl = tfx && tfx.flicker ? .55 + Math.random() * .45 : 1;
    for (let i = 0; i < TRAIL_N; i++) { const t = trail[i], q = trailPos[i]; if (q && i > 0 && i < tn) { t.visible = true; t.position.copy(q); t.material.color.set(trailCol); t.material.opacity = (1 - i / tn) * top * fl; } else t.visible = false; }
  } else { trailPos.length = 0; trail.forEach(t => t.visible = false); }
}

/* ---------- hit burst ---------- */
const burstTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 60); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,230,120,.9)'); r.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
});
const bursts = [];
function spawnBurst(x, y, z, size, col) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex, transparent: true, depthTest: false, depthWrite: false })); if (col) sp.material.color.set(col); sp.position.set(x, y, z); sp.scale.set(.2, .2, 1); sp.renderOrder = 10; scene.add(sp); bursts.push({ sp, t: 0, size });
}
/* ---------- 全壘打煙火秀 ---------- */
const dotTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.28, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
/* ---------- 止滑粉：白粉顆粒（柔邊圓點、一般混色，飄散漸淡） ---------- */
const POWDER = [];      // 止滑粉粒子上限（提高以呈現更濃的粉霧）
function powderPuff(x, y, z, n, spread, vx, vy, vz, size, o) {
  o = o || {};
  for (let i = 0; i < n && POWDER.length < 1100; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: false, depthWrite: false, color: 0xf6f3e8, opacity: o.op || .8 })); sp.renderOrder = 11;
    const s0 = size * (.6 + Math.random() * .8); sp.position.set(x + gauss() * .04, y + gauss() * .04, z + gauss() * .04); sp.scale.setScalar(s0); scene.add(sp);
    POWDER.push({ sp, t: 0, op: o.op || .75, grow: o.grow === undefined ? 2.6 : o.grow, sw: o.sw || 0, ph: Math.random() * 6.28, life: (o.life || .7) * (1 + Math.random() * (o.lv === undefined ? 1.3 : o.lv)), vx: vx + gauss() * spread, vy: vy + Math.abs(gauss()) * spread * .6, vz: vz + gauss() * spread, s0 });
  }
}
function rosinBurstFx(hp, sd, pt) {      // 加強版止滑粉：出手瞬間爆開一大團粉霧＋閃亮粉粒四散落下＋沿球路拖出長長的粉塵尾跡
  const x = hp.x, y = hp.y, z = hp.z;
  powderPuff(x, y, z, 46, .5, sd * .8, .5, 4.2, .2, { op: .9, life: 1.6, grow: 4.2, sw: .7 });      // 大團主粉霧
  powderPuff(x, y, z, 30, .3, sd * .3, .3, 1.4, .13, { op: .85, life: 2.4, grow: 5, sw: 1 });      // 久留的細粉
  powderPuff(x, y - .05, z, 18, .6, sd * .9, -.1, 2.4, .26, { op: .5, life: 1.9, grow: 4.4, sw: .8 });      // 外圍淡粉團
  for (let i = 0; i < 70; i++) { const a = Math.random() * TAU, sp = .6 + Math.random() * 2.6; fwSpawn(x + gauss() * .03, y + gauss() * .03, z + gauss() * .03, Math.cos(a) * sp * .7 + sd * (1 + Math.random() * 2.2), (Math.random() - .3) * 2.2, Math.sin(a) * sp * .7 + 1.5 + Math.random() * 3, Math.random() < .25 ? '#fff6c8' : '#ffffff', .6 + Math.random() * .7, .045 + Math.random() * .06, 2.6, 2.2); }      // 閃亮粉粒：被光線打亮、四散後緩緩落下
  const bp = ballMesh.position;
  for (let k = 10; k <= 18; k++) after(.035 * k, () => { if (PT !== pt) return; powderPuff(bp.x, bp.y, bp.z, 5, .1, sd * .1, .06, .4, .1, { op: .5, life: 1.0, grow: 3.6, sw: .6 }); });      // 尾跡延長
  after(.03, () => { pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 26, .3, sd * .5, .3, 2.4, .15, { op: .7, life: 1.7, grow: 4.2, sw: .8 }); });
  CAMC.shake = Math.max(CAMC.shake || 0, .03);
}
function updatePowder(dt) {
  for (let i = 0; i < POWDER.length; i++) {
    const q = POWDER[i]; q.t += dt; const u = q.t / q.life, d = Math.max(0, 1 - dt * 2.4); q.vx *= d; q.vy = q.vy * d + .25 * dt; q.vz *= d; if (q.sw) { q.vx += Math.sin(q.t * 3.1 + q.ph) * q.sw * dt; q.vz += Math.cos(q.t * 2.6 + q.ph) * q.sw * dt; }      // 細粉在空氣中緩緩飄晃
    q.sp.position.x += q.vx * dt; q.sp.position.y += q.vy * dt; q.sp.position.z += q.vz * dt; q.sp.scale.setScalar(q.s0 * (1 + u * q.grow)); q.sp.material.opacity = q.op * Math.min(1, u * 14) * Math.pow(Math.max(0, 1 - u), 1.3);
    if (u >= 1) { scene.remove(q.sp); q.sp.material.dispose(); POWDER.splice(i, 1); i--; }
  }
}
const FW = { pool: [], live: [], rockets: [], on: false };
const FW_COLS = ['#ff4d4d', '#ffd34d', '#4dd2ff', '#7dff7d', '#ff7de9', '#ffffff', '#ffa63d', '#b57dff'];
function fwSprite() { let s = FW.pool.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })); s.renderOrder = 12; } scene.add(s); return s; }
function fwSpawn(x, y, z, vx, vy, vz, col, life, size, grav, drag) {
  if (FW.live.length > 1100) return; const sp = fwSprite(); sp.position.set(x, y, z); sp.material.color.set(col); sp.material.opacity = 1; sp.scale.setScalar(size);
  FW.live.push({ sp, vx, vy, vz, t: 0, life, size, grav: grav === undefined ? 9 : grav, drag: drag === undefined ? 1.5 : drag });
}
function fwExplode(kind, x, y, z, c1, c2, sc) {
  fwSpawn(x, y, z, 0, 0, 0, '#ffffff', .22, 14 * sc, 0, 0);                                   // 爆開瞬間的閃光
  const P = (vx, vy, vz, i, life, gr) => fwSpawn(x, y, z, vx, vy, vz, (c2 && i % 2) ? c2 : c1, life || (1.5 + Math.random() * .7), 1.1 * sc + Math.random() * .5, gr, 1.4);
  if (kind === 'peony') for (let i = 0; i < 80; i++) { const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), sp = 15 * sc * (.65 + Math.random() * .35); P(sp * Math.sin(ph) * Math.cos(th), sp * Math.cos(ph), sp * Math.sin(ph) * Math.sin(th), i); }
  else if (kind === 'ring') for (let i = 0; i < 56; i++) { const a = i / 56 * 6.283, sp = 17 * sc; P(Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - .5) * 2, i); }
  else if (kind === 'heart') for (let i = 0; i < 72; i++) { const t = i / 72 * 6.283, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); P(hx * .95 * sc, (hy + 3) * .95 * sc, (Math.random() - .5) * 2, i, 1.8, 3); }
  else if (kind === 'star') for (let i = 0; i < 75; i++) { const seg = Math.floor(i / 15), f = (i % 15) / 15, a0 = seg * 4 * Math.PI / 5, a1 = (seg + 1) * 4 * Math.PI / 5, px = Math.cos(a0) * (1 - f) + Math.cos(a1) * f, py = Math.sin(a0) * (1 - f) + Math.sin(a1) * f; P(px * 17 * sc, py * 17 * sc + 2, (Math.random() - .5) * 2, i, 1.7, 3); }
  else if (kind === 'willow') for (let i = 0; i < 60; i++) { const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), sp = 11 * sc * (.6 + Math.random() * .4); P(sp * Math.sin(ph) * Math.cos(th), sp * Math.cos(ph) + 2, sp * Math.sin(ph) * Math.sin(th), 0, 2.8 + Math.random() * 1, 3.2); }
  else if (kind === 'double') { for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283; P(Math.cos(a) * 18 * sc, Math.sin(a) * 18 * sc, 0, 0); P(Math.cos(a) * 9 * sc, Math.sin(a) * 9 * sc, 0, 1); } }
  if (typeof flowSfx === 'function') { flowSfx('boom', clamp(sc * .8, .4, 1)); setTimeout(() => flowSfx('crackle', .7), 260); }
}
function fwLaunch(x, z, ty, kind, c1, c2, sc, rise) { FW.rockets.push({ x, y: 1, z, vy: (ty - 1) / rise, ty, kind, c1, c2, sc }); }
function fwFountain(x, z, dur) { FW.rockets.push({ fountain: true, x, z, t: 0, dur }); }
function fireworkShow(dur, power) {                        // 煙火秀：陸續升空、多種花型、最後連發大結尾，並配合場邊噴泉火花
  if (FW.on) return; FW.on = true; const kinds = ['peony', 'ring', 'heart', 'star', 'willow', 'double']; dur = dur || 10; power = power || 1;
  const n = 9 + Math.round(power * 4); fwFountain(-34, -72, dur * .7); fwFountain(0, -80, dur * .7); fwFountain(34, -72, dur * .7);
  for (let i = 0; i < n; i++) {
    const t = .3 + (dur - 2.6) * i / n + Math.random() * .4, k = kinds[Math.floor(Math.random() * kinds.length)], c1 = FW_COLS[Math.floor(Math.random() * FW_COLS.length)], c2 = Math.random() < .5 ? FW_COLS[Math.floor(Math.random() * FW_COLS.length)] : null;
    after(t, () => fwLaunch((Math.random() - .5) * 110, -78 - Math.random() * 40, 30 + Math.random() * 26, k, c1, c2, .85 + Math.random() * .5, .8 + Math.random() * .25));
  }
  const n2 = 6 + Math.round(power * 4);      // 近景煙火：升在內野／場中上空，鏡頭跟著跑者時一定看得到
  for (let i = 0; i < n2; i++) { const t = 1 + (dur - 3.5) * i / n2 + Math.random() * .5, k = kinds[Math.floor(Math.random() * kinds.length)], c1 = FW_COLS[Math.floor(Math.random() * FW_COLS.length)];
    after(t, () => fwLaunch((Math.random() - .5) * 70, -18 - Math.random() * 40, 20 + Math.random() * 12, k, c1, Math.random() < .5 ? '#ffd34d' : null, .7 + Math.random() * .4, .8)); }
  for (let j = 0; j < 6; j++) after(dur - 1.6 + j * .12, () => fwLaunch(-55 + j * 22 + Math.random() * 8, -85 - Math.random() * 25, 34 + Math.random() * 18, kinds[Math.floor(Math.random() * kinds.length)], FW_COLS[(j * 3) % FW_COLS.length], '#ffd34d', 1.25, .75));       // 結尾連發
  after(dur + 3.5, () => { FW.on = false; });
}
const HRC = { list: [], t: 0 };
function hrCrewSpawn() {      // 全壘打：隊友從休息區衝出來，在本壘旁等著迎接
  hrCrewClear(); const st = teamStyle(G.half), sx = Math.random() < .5 ? -1 : 1;
  for (let i = 0; i < 4; i++) { const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, scale: .95 }); scene.add(rig.root);
    const x0 = sx * (11 + i * .9), z0 = 4.5 + i * .6; rig.root.position.set(x0, 0, z0); rig.run = 1.6;
    HRC.list.push({ rig, x: x0, z: z0, tx: (i < 2 ? -1 : 1) * (1.8 + (i % 2) * .8), tz: 2.4 + (i % 2) * .8, st: 'run', d: .4 + i * .3 }); }
  HRC.t = 0;
}
function hrCrewClear() { for (const c of HRC.list) scene.remove(c.rig.root); HRC.list = []; }
function hrCrewCheer(big) { for (const c of HRC.list) { c.st = 'cheer'; c.rig.run = 0; c.rig.anim = { name: big ? 'cel1' : 'cheer', t: 0, dur: big ? 2.4 : 1, opt: {} }; } HRC.t = 0; HRC.end = 5.5; }
function hrBaseFx(b) {      // 打者踩到壘包：壘包爆出金色火花與小煙火，壘包面板同步閃一下
  const p = baseSpot(b); fwSpawn(p.x, .5, p.z, 0, 0, 0, '#fff2a0', .5, 7, 0, 0);
  for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, sp = 4 + Math.random() * 3; fwSpawn(p.x, .3, p.z, Math.cos(a) * sp, 6 + Math.random() * 4, Math.sin(a) * sp, i % 3 ? '#ffd34d' : '#ffffff', .9 + Math.random() * .5, .9, 9, 1.3); }
  fwLaunch(p.x, p.z, 14 + Math.random() * 5, ['ring', 'peony', 'star'][b % 3], FW_COLS[(b * 2) % FW_COLS.length], '#ffd34d', .55, .55);
  try { const el = $(['b1', 'b2', 'b3', 'bh'][b - 1]); if (el && el.animate) el.animate([{ offset: .5, background: '#fff7a0', boxShadow: '0 0 14px 4px #ffd21a,0 0 30px 9px #ff7a1a', transform: 'rotate(45deg) scale(1.5)' }], { duration: 700, iterations: 2 }); } catch (e) { }
}
function hrHomeFx() {      // 回到本壘：噴泉、環形煙火、金色彩帶、全員歡呼
  fwFountain(-1.8, 1.5, 2.6); fwFountain(1.8, 1.5, 2.6); fwFountain(0, 3, 2.2);
  for (let j = 0; j < 8; j++) after(.1 + j * .22, () => fwLaunch((Math.random() - .5) * 40, -6 - Math.random() * 30, 16 + Math.random() * 12, ['peony', 'ring', 'star', 'heart', 'double'][j % 5], FW_COLS[(j * 3) % FW_COLS.length], '#ffd34d', .7 + Math.random() * .3, .65));
  const cols = ['#ffd34d', '#ff4d4d', '#4dd2ff', '#7dff7d', '#ff7de9', '#ffffff'];
  for (let i = 0; i < 110; i++) after(Math.random() * 2.2, () => fwSpawn((Math.random() - .5) * 34, 13 + Math.random() * 5, 4 - Math.random() * 28, (Math.random() - .5) * 2.5, -1 - Math.random() * 1.5, (Math.random() - .5) * 2.5, cols[i % cols.length], 4 + Math.random() * 1.5, .5 + Math.random() * .3, 1.6, 1.2));
  hrCrewCheer(true); crowdCheer(2); try { CAMC.shake = Math.max(CAMC.shake || 0, .2); flashScreen(.3); } catch (e) { }
}
function updateFireworks(dt) {
  for (const r of E.runners) { if (r && r.trot && r.state === 'run' && r.rig && r.rig.root.visible) { const q = r.rig.root.position; for (let k = 0; k < 2; k++) fwSpawn(q.x + (Math.random() - .5) * .5, .25 + Math.random() * .3, q.z + (Math.random() - .5) * .5, (Math.random() - .5) * 2, 1 + Math.random() * 2, (Math.random() - .5) * 2, k ? '#ffd34d' : '#ffffff', .55 + Math.random() * .3, .55, 3, 1.5); } }      // 慢跑時腳下拖出金色火花尾跡
  if (HRC.list.length) { HRC.t += dt; for (const c of HRC.list) { if (c.st === 'run') { if (c.d > 0) { c.d -= dt; c.rig.run = 0; } else { const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz); if (d < .25) { c.st = 'wait'; c.rig.run = 0; c.rig.anim = { name: 'cheer', t: 0, dur: 1, opt: {} }; faceRig(c.rig, 0, 0); } else { const v = Math.min(d, 5.5 * dt); c.x += dx / d * v; c.z += dz / d * v; c.rig.run = 1.6; faceRig(c.rig, c.tx, c.tz); } } } c.rig.root.position.set(c.x, 0, c.z); rigStep(c.rig, dt); }
    if (HRC.end && HRC.t > HRC.end || HRC.t > 40 || G.mode !== 'play') { hrCrewClear(); HRC.end = 0; } }
  for (let i = FW.rockets.length - 1; i >= 0; i--) {
    const r = FW.rockets[i];
    if (r.fountain) { r.t += dt; for (let k = 0; k < 3; k++) fwSpawn(r.x + (Math.random() - .5), 1, r.z, (Math.random() - .5) * 7, 17 + Math.random() * 9, (Math.random() - .5) * 5, Math.random() < .5 ? '#ffe9a0' : '#ffb347', .9 + Math.random() * .5, .7, 11, 1); if (r.t > r.dur) FW.rockets.splice(i, 1); continue; }
    r.y += r.vy * dt; fwSpawn(r.x, r.y, r.z, (Math.random() - .5) * 2, -3, (Math.random() - .5) * 2, '#ffcf80', .5, .8, 3, 2);
    if (r.y >= r.ty) { fwExplode(r.kind, r.x, r.y, r.z, r.c1, r.c2, r.sc); FW.rockets.splice(i, 1); }
  }
  for (let i = FW.live.length - 1; i >= 0; i--) {
    const p = FW.live[i]; p.t += dt; const k = Math.exp(-dt * p.drag); p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k; const sp = p.sp; sp.position.x += p.vx * dt; sp.position.y += p.vy * dt; sp.position.z += p.vz * dt;
    const u = p.t / p.life; if (u >= 1 || sp.position.y < .2) { scene.remove(sp); FW.pool.push(sp); FW.live.splice(i, 1); continue; }
    sp.material.opacity = (1 - u * u) * (.75 + .25 * Math.sin(p.t * 40 + i)); sp.scale.setScalar(p.size * (1 - u * .45));
  }
}
function updateBursts(dt) { updatePowder(dt); updateSwishRings(dt); if (typeof updatePickTags === 'function') updatePickTags(); if (typeof updateStealTags === 'function') updateStealTags(); if (typeof updateRosinTag === 'function') updateRosinTag(dt); for (let i = 0; i < bursts.length; i++) { const b = bursts[i]; b.t += dt; const u = b.t / .28; b.sp.scale.setScalar(.2 + b.size * Math.min(1, u * 1.4)); b.sp.material.opacity = Math.max(0, 1 - u); if (u >= 1) { scene.remove(b.sp); bursts.splice(i, 1); i--; } } }
/* ---------- camera controller ---------- */
const CAMC = { mode: 'title', pos: new V3(0, 30, 50), look: new V3(0, 0, -25), fov: 46, tpos: new V3(), tlook: new V3(), tfov: 46, k: 3, kl: 0, orbit: 0, shake: 0, pt: 0, has: false, px: 0, pz: 0, vx: 0, vz: 0, fy: 1.5, _pm: false, near: 0, slow: 0 };
function camSnap() { CAMC.pos.copy(CAMC.tpos); CAMC.look.copy(CAMC.tlook); CAMC.fov = CAMC.tfov; }
function setCamBat(snap) { CAMC.mode = 'bat'; CAMC.tpos.set(0, 4.6, 9.4); CAMC.tlook.set(0, 1.45, -9); CAMC.tfov = 42 * (VP.fk || 1); CAMC.k = 4; if (snap) camSnap(); }
function setCamPlayTarget(f) { CAMC.mode = 'play'; }
/* ---------- 擊球後追焦鏡頭 ----------
   舊版：鏡頭貼在球後方低位跟拍，球飛到外野時鏡頭也跑進外野，內野與跑壘完全看不到、視角又太近。
   新版：鏡頭固定在本壘後方高處（類似電視轉播的高機位），只隨球的方向小幅平移；
   看的位置在「內野中心」與「球／跑者」之間依距離加權，內野球多看場面、遠飛球多看球；
   球慢下來（被接殺、持球）時把還在跑的跑者一起納入畫面；球速越快鏡頭提前量越大，球不會跑出畫面。 */
function camChase(dt, focus) {
  const C = CAMC, fx = focus.x, fz = focus.z, fy = focus.y;
  C.pt += dt;
  if (C.has && dt > 1e-4) { const ik = 1 / dt, kk = Math.min(1, dt * 8); C.vx += (clamp((fx - C.px) * ik, -80, 80) - C.vx) * kk; C.vz += (clamp((fz - C.pz) * ik, -80, 80) - C.vz) * kk; } else { C.vx = C.vz = 0; C.has = true; }
  C.px = fx; C.pz = fz;
  const spd = Math.hypot(C.vx, C.vz);
  let tx = fx, tz = fz, rx = 0, rz = 0, rn = 0;
  try { for (const r of E.runners) if (r.state === 'run' && r.rig) { const p = r.rig.root.position; rx += p.x; rz += p.z; rn++; } } catch (e) { }
  /* 外野追球特寫：球飛到外野、速度慢下來（滾動、彈跳、停在牆邊）時，鏡頭從本壘後方往外野推進，貼近球的後方；
     球被撿起、傳出去（速度突然變快）或球被持住不動 0.35 秒以上，就慢慢拉回遠景，讓玩家看得到內野與傳球目標。
     near：0＝遠景（原本的高機位），1＝外野特寫。 */
  /* 手動守備（玩家自己操控野手跑去撿球）：球在場內、還沒被任何人持住時，鏡頭一律貼近外野追球（球停在牆邊也不拉遠，
     不然玩家看不到球在哪）；球一被撿起（持球）就拉回遠景，方便看壘包與跑者、選傳球目標。
     mfo＝目前被玩家操控的野手（13g 的 FM.selected）；沒有手動守備時完全沿用上面的原本行為。 */
  let mfo = null, mLive = false;
  try { if (typeof FM !== 'undefined' && typeof PL !== 'undefined' && PL && FM.selected && FM.padNeeded()) { mfo = FM.selected; mLive = PL.state === 'flight' || PL.state === 'loose'; } } catch (e) { }
  { let want;
    if (mfo) {
      const out = clamp((Math.hypot(fx, fz) - 26) / 16, 0, 1), rolling = Math.max(.55, clamp(1 - (spd - 18) / 16, 0, 1));      // 手動：離本壘 26 公尺以上就開始推近；球再快也不會完全不推
      want = mLive ? out * rolling * clamp((C.pt - .35) / .5, 0, 1) : 0;      // 持球／傳球中 → 遠景
      C.slow = 0;
    } else {
      const out = clamp((Math.hypot(fx, fz + 0) - 42) / 26, 0, 1), rolling = clamp(1 - (spd - 10) / 14, 0, 1);
      C.slow = spd < 2.5 && C.pt > .8 ? C.slow + dt : 0;
      want = C.slow > .35 ? 0 : out * rolling * clamp((C.pt - .5) / .8, 0, 1);
    }
    C.near += (want - C.near) * Math.min(1, dt * (want > C.near ? 2.6 : 2.0)); }
  const nr = C.near;
  if (rn) { const w = .55 * (1 - nr) * clamp(1 - spd / 9, 0, 1); tx = fx * (1 - w) + (rx / rn) * w; tz = fz * (1 - w) + (rz / rn) * w; }      // 球幾乎停住 → 改看跑者
  if (spd > 1) { const ld = Math.min(8, spd * .1); tx += C.vx / spd * ld; tz += C.vz / spd * ld; }      // 領先量：看球前進的方向
  const dd = Math.hypot(tx, tz), wB = clamp(.5 + dd / 160, .5, .78) * (1 - nr) + .95 * nr;
  const lx = tx * wB, lz = -22 * (1 - wB) + tz * wB;
  C.fy += (Math.max(1, fy * .6) - C.fy) * Math.min(1, dt * 8);      // 高度另外平滑：球彈跳時畫面不上下抖，高飛球仍能快速抬頭追上
  const ly = 1 + (C.fy - 1) * wB, far = Math.min(dd, 110);
  const ramp = clamp(C.pt / .9, 0, 1);
  C.tlook.set(lx, ly, lz);
  { const wx = clamp(lx * .28, -10, 10), wy = 11 + far * .17 + Math.max(0, C.fy - 3) * .25, wz = 18;      // 遠景：本壘後方、看台牆內側（牆半徑 ≥ 22）
    const cx = clamp(fx * .75, -45, 45), cy = 7 + Math.max(0, C.fy - 2) * .3, cz = Math.min(18, fz + 24);      // 特寫：球的後方（本壘一側）約 24 公尺、高 7 公尺
    C.tpos.set(wx + (cx - wx) * nr, wy + (cy - wy) * nr, wz + (cz - wz) * nr); }
  let nearFov = 46;
  if (mfo && nr > .01) {      // 手動追球：球和「我操控的野手」都要在畫面內——兩者拉開時，看的位置往野手偏、鏡頭多退後一些、視角稍寬
    const sep = Math.hypot(mfo.x - fx, mfo.z - fz), w = clamp((sep - 6) / 26, 0, .5) * nr;
    C.tlook.x += (mfo.x * wB - C.tlook.x) * w; C.tlook.z += (-22 * (1 - wB) + mfo.z * wB - C.tlook.z) * w;
    const back = clamp(sep - 6, 0, 30) * .5 * nr; C.tpos.z = Math.min(34, C.tpos.z + back); C.tpos.y += clamp(sep - 6, 0, 30) * .12 * nr;
    nearFov = 50 + clamp(sep / 30, 0, 1) * 6;
  }
  C.tfov = ((52 + clamp(dd / 90, 0, 1) * 8) * (1 - nr) + nearFov * nr) * (VP.fk || 1);
  C.k = (3 + 1.2 * ramp) * (1 + nr * .6); C.kl = (7 + 2 * ramp) * (1 + nr * .4);      // 剛擊球時鏡頭慢慢拉開、看的方向與視角（fov）較快跟上
  if (tz > 1.5 && C.vz > 0) {      // 球飛到本壘後方（界外高飛、擦棒球）：不然球會跑到鏡頭正上方 → 鏡頭移到本壘旁邊看球
    C.tpos.set((fx >= 0 ? -1 : 1) * 13, 8, 4); C.tlook.set(fx * .9, Math.max(1.2, C.fy * .85), fz); C.tfov = 58 * (VP.fk || 1);
  }
}
function updateCamera(dt, focus) {
  CAMC.kl = 0;
  { const pm = CAMC.mode === 'play' || CAMC.mode === 'batfollow'; if (pm && !CAMC._pm) { CAMC.pt = 0; CAMC.has = false; CAMC.near = 0; CAMC.slow = 0; CAMC.fy = focus ? Math.max(1, focus.y * .6) : 1.5; } CAMC._pm = pm; }
  if (VENUE.on && CAMC.mode !== 'venue') { VENUE.on = false; VENUE.done = null; document.body.classList.remove('venuing'); $('venueIntro').classList.add('hide'); }
  if (CAMC.mode === 'venue' && VENUE.on) {
    VENUE.t += dt; const u = clamp(VENUE.t / VENUE.orbit, 0, 1), e = u * .6 + (u * u * (3 - 2 * u)) * .4, a = e * Math.PI * 2 * .96, sw = Math.sin(u * Math.PI);
    const R = 54 - 5 * sw, H = 42 - 6 * sw;
    CAMC.tpos.set(Math.sin(a) * R, H, -30 + Math.cos(a) * R); CAMC.tlook.set(Math.sin(a + 1.2) * 4, 2, -30 + Math.cos(a + 1.2) * 4); CAMC.tfov = 60 * (VP.fk || 1); CAMC.k = 6;
    if (VENUE.t >= VENUE.dur) venueEnd();
  } else if (CAMC.mode === 'pen' && BP.shotCur) {
    CAMC.tpos.copy(BP.shotCur.pos); CAMC.tlook.copy(BP.shotCur.look); CAMC.tfov = BP.shotCur.fov * (VP.fk || 1); CAMC.k = 5;
  } else if (CAMC.mode === 'title') {
    CAMC.orbit += dt * .08; const a = CAMC.orbit, r = 62;
    CAMC.tpos.set(Math.sin(a) * 12, 40, 38 + Math.cos(a) * 3); CAMC.tlook.set(Math.sin(a * 1.3) * 6, 0, -27); CAMC.tfov = 58 * (VP.fk || 1); CAMC.k = 1.2;
  } else if ((CAMC.mode === 'play' || CAMC.mode === 'batfollow') && focus) {
    camChase(dt, focus);
  } else if (CAMC.mode === 'hrtrot' && focus) {
    CAMC.tlook.set(focus.x, 1.1, focus.z); CAMC.tpos.set(focus.x * .4, 15 + Math.hypot(focus.x, focus.z) * .15, focus.z + 26); CAMC.tfov = 52 * (VP.fk || 1); CAMC.k = 2.4;
  } else if (CAMC.mode === 'close' && focus) {
    CAMC.tlook.set(focus.x, 1, focus.z); CAMC.tpos.set(focus.x + (focus.x >= 0 ? 8 : -8), 7, focus.z + 12); CAMC.tfov = 46 * (VP.fk || 1); CAMC.k = 3.4;
  }
  const f = 1 - Math.exp(-dt * CAMC.k), fl = CAMC.kl ? 1 - Math.exp(-dt * CAMC.kl) : f;
  CAMC.pos.lerp(CAMC.tpos, f); CAMC.look.lerp(CAMC.tlook, fl); CAMC.fov += (CAMC.tfov - CAMC.fov) * (CAMC.kl ? fl : f);
  camera.position.copy(CAMC.pos);
  if (CAMC.shake > 0) { camera.position.x += (Math.random() - .5) * CAMC.shake; camera.position.y += (Math.random() - .5) * CAMC.shake; CAMC.shake = Math.max(0, CAMC.shake - dt * 2); }
  camera.fov = CAMC.fov; camera.lookAt(CAMC.look); camera.updateProjectionMatrix();
}
const AQ = { q: 1, acc: 0, n: 0, good: 0, last: 0, up: 0, wait: 6000 };      // 動態解析度：畫面吃緊（幀時間過長）就自動降一點像素比，順了再慢慢拉回
function adaptQuality(real) {
  if (typeof G === 'undefined' || G.mode !== 'play' || document.hidden) { AQ.acc = 0; AQ.n = 0; return; }
  AQ.acc += real; AQ.n++; if (AQ.n < 40) return; const avg = AQ.acc / AQ.n; AQ.acc = 0; AQ.n = 0; const now = performance.now();
  if (avg > 1 / 46 && AQ.q > .62) { if (now - AQ.up < 15000) AQ.wait = Math.min(AQ.wait * 2, 60000); AQ.q = Math.max(.62, AQ.q - .12); AQ.good = 0; AQ.last = now; resize(); }      // 剛拉高又掉下來：下次等更久再試，避免畫質來回跳動
  else if (avg < 1 / 54 && AQ.q < 1 && now - AQ.last > AQ.wait) { if (++AQ.good >= 4) { AQ.q = Math.min(1, AQ.q + .08); AQ.good = 0; AQ.last = AQ.up = now; resize(); } }
  else if (avg >= 1 / 54) AQ.good = 0;
}
function resize() {
  measureVP(); const w = VP.w, h = VP.h, dpr = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 2 : 2);
  // 依解析度自動調整像素比：像素總量過大的設備（高 DPR 平板）自動降比例，維持流暢又清晰
  const maxPx = IS_TOUCH ? 2.6e6 : 5e6; const pr = Math.max(.7, Math.max(1, Math.min(dpr, Math.sqrt(maxPx / (w * h)))) * AQ.q);
  VP.dpr = pr; renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h;
  const ov = document.getElementById('ov'); ov.width = Math.round(w * pr); ov.height = Math.round(h * pr);
  // 直式／窄螢幕：垂直視角加大，確保水平視野不被裁切、比例不變形
  const asp = w / h, k = asp < 1.78 ? Math.min(1.9, Math.pow(1.78 / asp, .62)) : 1; VP.fk = k;
  if (CAMC.mode === 'bat') CAMC.tfov = 42 * k;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 250); setTimeout(resize, 700); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
if (window.ResizeObserver) { try { new ResizeObserver(() => resize()).observe(document.getElementById('wrap')); } catch (e) { } }
document.addEventListener('fullscreenchange', () => setTimeout(resize, 120)); document.addEventListener('webkitfullscreenchange', () => setTimeout(resize, 120));
resize();
function crowdCheer(amt) { crowdCheer.v = Math.max(crowdCheer.v || 0, amt); }

