/* ===== 13t-face-expression.js ｜ 球員表情系統：有眼白／虹膜／高光的眼睛、眼瞼眨眼與瞇眼、可動眉毛、畫布繪製的嘴型（牙齒／舌頭／歪嘴）、
   臉紅／汗珠／淚水／青筋符號，依「動作名稱」與「比賽狀況」自動切換表情 =====
   只改「外觀」：不動任何比賽邏輯、能力值、判定、亂數（使用自己的亂數產生器，不會影響區網對戰的鎖步同步）。
   做法：包住 03 的 eyeVariant／addFace（記錄原本的五官）、makeChibi（建完人物後加上表情層）、rigStep（每幀依 rig.anim.name 換表情）。
   原本的眼睛／眉毛／嘴巴會被隱藏，改由本檔的「表情層」繪製；角色編輯器選的眼型(eyeType)／眉型(brow)／嘴型(mouth)
   會變成該角色「平常的臉」（笑眼角色平常是彎彎的笑眼、嘴型 3 平常就是露齒笑…），表情只是在上面疊加。
   載入位置：必須在 13s-clay-skin.js 之後、14 之前（要包在 13d／13r 對 makeChibi 的包裝外面，才看得到它們放大後的眼睛）。
   遠景自動降級：鏡頭離人物超過 FACE.far 就只畫眼白＋虹膜＋眉毛＋嘴（約 7 個零件），近景才畫眼瞼／瞳孔／高光（約 19 個）。
   快轉（window.__ff）時完全不更新。
   關閉：把 FACE.on 改成 false（或拿掉 baseball.html 裡這個 <script>）→ 回到原本的臉。
   給其他檔觸發表情：FACE.emote(rig, 'angry', 1.5)；全部人物測試：FACE.all('laugh', 3)；可用名稱見 FACE.table。 */
'use strict';
const FACE = { on: true, near: 46, far: 56, ver: 1, list: [], table: null };
const FX_Z = .3;      // 表情層整體往前 .3：03 的 ghostRig 會把「位置 z>.1」的頭部零件全部藏起來，半透明的捕手／主審背面就不會透出表情
const FX_KEYS = ['lu', 'll', 'bY', 'bA', 'bK', 'mC', 'mW', 'mO', 'mR', 'mT', 'mG', 'mS', 'ew', 'pu', 'bl', 'sw', 'tr', 'vn', 'talk'];
/* 參數說明（全部 0 或預設＝平常的臉）：
   lu 上眼瞼閉合 0~1　ll 下眼瞼上推（瞇眼／笑眼）0~1　bY 眉毛高度 -1~1　bA 眉毛傾斜（+ 生氣＝內側壓低；- 難過＝內側抬高）　bK 單邊挑眉
   mC 嘴角（+ 笑 / - 垂）　mW 嘴寬　mO 嘴張開　mR 圓嘴（O 型）　mT 露牙　mG 露舌　mS 歪嘴　ew 睜大眼　pu 瞳孔縮放
   bl 臉紅　sw 汗珠　tr 淚水　vn 青筋符號　talk 嘴巴開合抖動（喊叫／大笑） */
const FX_ZERO = { lu: 0, ll: 0, bY: 0, bA: 0, bK: 0, mC: .12, mW: 1, mO: 0, mR: 0, mT: 0, mG: 0, mS: 0, ew: 0, pu: 0, bl: 0, sw: 0, tr: 0, vn: 0, talk: 0 };

/* =========================================================
   A. 表情預設（只列出與「平常的臉」不同的欄位；gz＝視線；br＝眨眼頻率倍率；spd＝切換速度）
   ========================================================= */
FACE.table = {
  idle: {},
  smile: { mC: .7, mW: 1.1, ll: .22, bY: .08, bl: .3 },
  grin: { mC: .85, mW: 1.25, mO: .45, mT: 1, mG: .2, ll: .45, lu: .08, bY: .2, bl: .5, gz: 'cam' },
  laugh: { mC: .9, mW: 1.35, mO: .78, mT: 1, mG: .55, ll: .7, lu: .42, bY: .25, bl: .7, talk: .22, spd: 14 },
  joyshout: { mC: .45, mW: 1.38, mO: 1, mT: .9, mG: .8, ll: .55, lu: .5, bY: .05, bA: .35, bl: .8, talk: .18, spd: 14 },
  proud: { lu: .86, ll: .4, bY: .35, bA: -.3, mC: .55, mW: 1, bl: .5, gz: 'up' },
  smirk: { mC: .45, mS: .9, bK: .6, ll: .2, lu: .14, gz: 'cam' },
  focus: { lu: .26, ll: .1, bY: -.35, bA: .4, mC: -.05, mW: .85, pu: -.2, br: .35 },
  intense: { lu: .42, ll: .3, bY: -.55, bA: .8, mC: -.1, mW: 1.25, mO: .28, mT: 1, pu: -.3, br: .2, spd: 14 },
  effort: { lu: .35, ll: .25, bY: -.3, bA: .55, mC: -.15, mW: 1.2, mO: .5, mT: .85, mG: .2, sw: .35, bl: .35, spd: 14 },
  contact: { lu: .5, ll: .3, bY: -.3, bA: .6, mC: 0, mW: 1.2, mO: .55, mT: .9, mG: .2, bl: .3, spd: 18 },
  run: { lu: .16, ll: .1, bY: -.2, bA: .3, mC: -.05, mW: .95, mO: .35, mT: .4, sw: .25, bl: .25 },
  alert: { bY: .2, bA: .12, ew: .1, mC: 0, mW: .9, pu: .1, br: .6 },
  catchface: { ew: .2, bY: .25, mC: 0, mW: .9, mO: .12, br: .3, spd: 16 },
  thinking: { bY: .1, bK: .55, lu: .12, mC: .05, mW: .85, gz: 'fwd' },
  wipe: { lu: .7, ll: .3, bY: -.2, bA: .2, mC: -.1, mO: .2, sw: .8, bl: .3 },
  surprise: { ew: 1, bY: .9, bA: -.1, mO: .7, mR: 1, mW: .55, mC: 0, pu: .5, spd: 18 },
  worry: { bY: .5, bA: -.8, mC: -.5, mW: .9, mO: .2, lu: .1, ew: .3, sw: .5, gz: 'down' },
  sad: { bY: -.1, bA: -.85, lu: .4, mC: -.7, mW: .9, gz: 'down', br: 1.3 },
  sigh: { bY: -.15, bA: -.7, lu: .55, mC: -.35, mW: .85, mO: .3, mR: 1, gz: 'down' },
  whiff: { bY: -.2, bA: -.6, lu: .3, mC: -.45, mW: 1.1, mO: .45, mR: .5, mT: .3, gz: 'down', spd: 14 },
  frustrated: { bY: -.4, bA: .6, lu: .4, ll: .2, mC: -.5, mW: 1.1, mO: .35, mT: .8, bl: .5, spd: 14 },
  shrug: { bY: .45, bA: -.5, lu: .15, mC: -.3, mW: 1, mS: .5, gz: 'fwd' },
  angry: { bY: -.7, bA: 1, lu: .3, ll: .45, mC: -.55, mW: 1.25, mO: .5, mT: 1, vn: 1, bl: .8, spd: 16 },
  scream: { bY: -.4, bA: .9, lu: .55, ll: .5, mC: -.2, mW: 1.35, mO: 1, mT: .9, mG: .9, vn: .9, bl: .9, talk: .18, spd: 16 },
  shout: { bY: .1, bA: .2, mC: 0, mW: 1.1, mO: .6, mT: .7, mG: .3, talk: .3, spd: 14 },
  squint: { lu: .8, ll: .5, bY: -.5, bA: .7, mC: -.25, mW: 1.2, mO: .3, mT: .9, spd: 16 },
  pain: { lu: 1, ll: .5, bY: .2, bA: -.9, mC: -.5, mW: 1.1, mO: .75, mT: .7, sw: .7, tr: .8, talk: .1, spd: 14 },
  knockout: { lu: 1, bA: -.3, mC: -.1, mO: .45, mR: 1, mW: .7, gz: 'down' }
};

/* rig.anim.name → 表情（需要看動畫進度 u 的用函式） */
const FX_ANIM = {
  windup: (u) => u < .4 ? 'focus' : 'intense', pitch: (u) => u < .5 ? 'intense' : 'effort', sig: 'focus', stretch: 'focus', legkick: 'focus', armshake: 'effort', rosin: 'wipe', wipe: 'wipe',
  nod: 'thinking', capadj: 'focus', glovepound: 'intense', fistpump: 'joyshout', hips: 'sigh', shrug: 'shrug', headdown: 'sad', dust: 'idle', fidget: 'focus', handsknee: 'alert', ready: 'alert', crouch: 'focus',
  sign: 'thinking', pcatch: 'catchface', cset: 'catchface', catch: 'catchface', swing: (u) => u < .45 ? 'intense' : 'contact', bunt: 'focus',
  recover: (u, a) => (a.opt && a.opt.whiff) ? 'whiff' : 'effort', throw: (u) => u < .5 ? 'intense' : 'effort', pickup: 'focus',
  dive: 'squint', hdive: 'squint', slide: 'squint', down: 'worry', kneel: 'worry', writhe: 'pain', rage: 'scream', ko: 'knockout', eject: 'scream', ump: 'shout', point: 'shout',
  cheer: 'grin', cel1: 'laugh', cel2: 'joyshout', cel3: (u) => u < .55 ? 'proud' : 'smile', cel4: 'smirk', cel5: 'laugh', cel6: 'smile', cel7: 'joyshout',
  bk_slam: 'angry', bk_snap: 'angry', bk_stomp: 'angry', bk_pound: 'angry', bk_kick: 'angry', bk_glare: 'angry', bk_drop: 'frustrated', bk_shake: 'sigh', bk_sigh: 'sigh', bk_scream: 'scream'
};
function fxAnimKey(a, u, r) { const m = FX_ANIM[a.name]; if (!m) return 'idle'; return typeof m === 'function' ? m(u, a, r) : m; }

/* =========================================================
   B. 共用貼圖（只畫一次）
   ========================================================= */
const FX = { tex: {}, geo: {}, mat: {}, irisMat: {} };
function fxCv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function fxCT(c) { const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; }
function fxPO(m, l) { m.polygonOffset = true; m.polygonOffsetFactor = -l; m.polygonOffsetUnits = -l * 2; return m; }
function fxTexSclera() {      // 眼白：中央純白、邊緣帶一點被眼瞼遮住的陰影
  if (FX.tex.sc) return FX.tex.sc; const c = fxCv(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 30, 4, 32, 32, 31);
  r.addColorStop(0, '#ffffff'); r.addColorStop(.6, '#f7f3ee'); r.addColorStop(1, '#cdbfb6'); g.fillStyle = r; g.beginPath(); g.arc(32, 32, 31, 0, 6.2832); g.fill(); return FX.tex.sc = fxCT(c);
}
function fxTexIris(col) {      // 虹膜：中心較亮、外圈有深色輪廓環（瞳孔另外一片，才能縮放）
  const k = 'i' + col; if (FX.tex[k]) return FX.tex[k]; const c = fxCv(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, shadeHex(col, 1.9)); r.addColorStop(.45, shadeHex(col, 1.3)); r.addColorStop(.8, col); r.addColorStop(.93, shadeHex(col, .5)); r.addColorStop(1, shadeHex(col, .32));
  g.fillStyle = r; g.beginPath(); g.arc(32, 32, 31, 0, 6.2832); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; for (let i = 0; i < 18; i++) { const a = i / 18 * 6.2832; g.beginPath(); g.moveTo(32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12); g.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); g.stroke(); }
  return FX.tex[k] = fxCT(c);
}
function fxTexShine() {      // 眼睛高光：大亮點（左上）＋小亮點（右下）＋虹膜下緣的反光弧
  if (FX.tex.sh) return FX.tex.sh; const c = fxCv(64, 64), g = c.getContext('2d');
  const rf = g.createRadialGradient(40, 46, 4, 36, 40, 22); rf.addColorStop(0, 'rgba(255,255,255,.0)'); rf.addColorStop(.7, 'rgba(255,255,255,.0)'); rf.addColorStop(1, 'rgba(255,255,255,.22)');
  g.fillStyle = rf; g.beginPath(); g.arc(32, 32, 28, 0, 6.2832); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(22, 20, 8.5, 9.5, -.35, 0, 6.2832); g.fill();
  g.globalAlpha = .9; g.beginPath(); g.arc(43, 44, 4.2, 0, 6.2832); g.fill(); return FX.tex.sh = fxCT(c);
}
function fxTexLid(rim) {      // 眼瞼：白色橢圓（乘上膚色）；上眼瞼下緣有一圈深色睫毛線（閉眼時就是那條線）
  const k = rim ? 'lr' : 'lp'; if (FX.tex[k]) return FX.tex[k]; const c = fxCv(64, 64), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 31, 0, 6.2832); g.fill();
  if (rim) { g.strokeStyle = '#2a1812'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.arc(32, 32, 28, .12, Math.PI - .12); g.stroke(); }
  return FX.tex[k] = fxCT(c);
}
function fxTexSweat() { if (FX.tex.sw) return FX.tex.sw; const c = fxCv(48, 64), g = c.getContext('2d'); g.beginPath(); g.moveTo(24, 4); g.bezierCurveTo(40, 28, 44, 40, 24, 58); g.bezierCurveTo(4, 40, 8, 28, 24, 4); const r = g.createLinearGradient(8, 8, 40, 58); r.addColorStop(0, '#e8fbff'); r.addColorStop(1, '#6cc4ee'); g.fillStyle = r; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#2f86b8'; g.stroke(); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(17, 36, 3, 7, .3, 0, 6.2832); g.fill(); return FX.tex.sw = fxCT(c); }
function fxTexTear() { if (FX.tex.tr) return FX.tex.tr; const c = fxCv(32, 48), g = c.getContext('2d'); g.beginPath(); g.moveTo(16, 3); g.bezierCurveTo(28, 22, 30, 32, 16, 44); g.bezierCurveTo(2, 32, 4, 22, 16, 3); const r = g.createLinearGradient(6, 6, 26, 44); r.addColorStop(0, '#f2fdff'); r.addColorStop(1, '#8fd6f6'); g.fillStyle = r; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(60,140,190,.9)'; g.stroke(); return FX.tex.tr = fxCT(c); }
function fxTexVein() {      // 漫畫的「💢」青筋符號
  if (FX.tex.vn) return FX.tex.vn; const c = fxCv(64, 64), g = c.getContext('2d'); g.translate(32, 32); g.lineCap = 'round';
  for (const [w, col] of [[11, '#3b0a0a'], [6.5, '#ee3b33']]) { g.lineWidth = w; g.strokeStyle = col; for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2); g.beginPath(); g.arc(17, 17, 12, Math.PI * 1.02, Math.PI * 1.48); g.stroke(); g.restore(); } }
  return FX.tex.vn = fxCT(c);
}
function fxGeo() {
  if (FX.geo.circ) return FX.geo; FX.geo.circ = new THREE.CircleGeometry(1, 20); FX.geo.plane = new THREE.PlaneGeometry(1, 1);
  FX.mat.sclera = fxPO(new THREE.MeshLambertMaterial({ color: 0xffffff, map: fxTexSclera(), emissive: 0x4a463f, transparent: false, alphaTest: .4 }), 1);
  FX.mat.pupil = fxPO(new THREE.MeshBasicMaterial({ color: 0x0b0707 }), 3);
  FX.mat.shine = fxPO(new THREE.MeshBasicMaterial({ map: fxTexShine(), transparent: true, depthWrite: false }), 4);
  FX.mat.sprVein = new THREE.SpriteMaterial({ map: fxTexVein(), transparent: true, depthWrite: false });
  FX.mat.sprSweat = new THREE.SpriteMaterial({ map: fxTexSweat(), transparent: true, depthWrite: false });
  FX.mat.sprTear = new THREE.SpriteMaterial({ map: fxTexTear(), transparent: true, depthWrite: false });
  return FX.geo;
}
function fxMouthGeom(R) {      // 貼合頭部球面的彎曲平面（頭座標，z 已扣掉 FX_Z）
  const k = 'm' + R; if (FX.geo[k]) return FX.geo[k]; const g = new THREE.PlaneGeometry(.34, .17, 14, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = -.235 + p.getY(i); p.setXYZ(i, x, y, Math.sqrt(Math.max(.01, R * R - x * x - y * y)) + .006 - FX_Z); }
  p.needsUpdate = true; return FX.geo[k] = g;
}

/* =========================================================
   C. 嘴型繪製（128×64 畫布；1 個頭座標單位 = 376 像素）
   ========================================================= */
function fxDrawMouth(g, m) {
  const W = 128, H = 64, cx = 64, cy = 24, U = 376, lip = '#7d2a2d';
  g.clearRect(0, 0, W, H);
  const hw = .066 * m.mW * U * (1 - m.mR * .22), cr = .036 * U, oh = m.mO * .08 * U;
  const yc = cy - m.mC * cr, sk = m.mS * .022 * U, yL = yc + sk, yR = yc - sk;      // 左右嘴角；mS>0＝右嘴角較高（歪嘴笑）
  const yT = cy - m.mR * oh * .38, yB = cy + oh + (oh > 2 ? Math.max(0, m.mC) * cr * .55 : 0) + m.mR * oh * .1;
  const k = .75, cT = (yT - (yL + yR) / 8) / k, cB = (yB - (yL + yR) / 8) / k, xs = hw * (.55 + m.mR * .5);
  const top = () => { g.moveTo(cx - hw, yL); g.bezierCurveTo(cx - xs, cT, cx + xs, cT, cx + hw, yR); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (oh > 1.6) {
    const shape = () => { g.beginPath(); top(); g.bezierCurveTo(cx + xs, cB, cx - xs, cB, cx - hw, yL); g.closePath(); };
    g.save(); shape(); g.clip();
    const gr = g.createLinearGradient(0, yT - 4, 0, yB); gr.addColorStop(0, '#5a1c20'); gr.addColorStop(1, '#2e0b0f'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (m.mG > .04 && oh > 6) {      // 舌頭
      g.fillStyle = '#e5737d'; g.beginPath(); g.ellipse(cx, yB - oh * .26 - 1, hw * .52, Math.max(2, oh * .36 * (.4 + m.mG * .6)), 0, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(150,40,60,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, yB - oh * .5); g.lineTo(cx, yB - 2); g.stroke();
    }
    if (m.mT > .04) {      // 上排牙齒（嘴小時＝咬緊牙關，整個口腔都是牙＋中間一條縫）
      const th = m.mT * Math.min(oh + 3, Math.max(oh * .55, 9));
      g.fillStyle = '#f6f2ea'; g.beginPath(); top(); g.lineTo(cx + hw, yR + th); g.bezierCurveTo(cx + xs, cT + th * 1.3, cx - xs, cT + th * 1.3, cx - hw, yL + th); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(70,40,40,.22)'; g.lineWidth = 1; g.beginPath(); for (const f of [-.5, 0, .5]) { g.moveTo(cx + hw * f, yc - 6); g.lineTo(cx + hw * f, yc + th + 1); } g.stroke();
      if (oh < 12 && m.mT > .6) { g.strokeStyle = 'rgba(60,20,24,.6)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(cx - hw * .92, yc + oh * .5); g.lineTo(cx + hw * .92, yc + oh * .5); g.stroke(); }
    }
    g.restore();
    shape(); g.strokeStyle = lip; g.lineWidth = 2.8; g.stroke();
    if (m.mR > .5) { shape(); g.strokeStyle = 'rgba(200,100,105,.45)'; g.lineWidth = 1.2; g.stroke(); }
  } else {      // 閉嘴：一條有粗細的唇線＋下唇的淡淡反光
    g.beginPath(); top(); g.strokeStyle = lip; g.lineWidth = 3.4; g.stroke();
    const bz = t => { const a = 1 - t; return [a * a * a * (cx - hw) + 3 * a * a * t * (cx - xs) + 3 * a * t * t * (cx + xs) + t * t * t * (cx + hw), a * a * a * yL + 3 * a * a * t * cT + 3 * a * t * t * cT + t * t * t * yR]; };
    g.beginPath(); for (let i = 0; i <= 8; i++) { const p = bz(.22 + i * .07); i ? g.lineTo(p[0], p[1] + 3.6) : g.moveTo(p[0], p[1] + 3.6); } g.strokeStyle = 'rgba(205,110,110,.5)'; g.lineWidth = 2.2; g.stroke();
  }
}

/* =========================================================
   D. 平常的臉（由角色編輯器的眼型／眉型／嘴型換算）
   ========================================================= */
function fxBase(vis) {
  const b = Object.assign({}, FX_ZERO), et = vis.eyeType | 0, bw = vis.brow | 0, mo = vis.mouth | 0;
  if (et === 3) { b.lu = .92; b.ll = .4; } else if (et === 5) b.lu = .38; else if (et === 4) { b.bA += .25; b.lu = .1; }
  if (bw === 3) b.bA += .35; else if (bw === 4) b.bA -= .3; else if (bw === 5) b.bY += .25; else if (bw === 2) b.bY -= .05;
  if (mo === 1) { b.mC = .55; b.mW = 1.05; } else if (mo === 2) { b.mC = -.02; b.mW = .9; } else if (mo === 3) { b.mC = .75; b.mW = 1.25; b.mO = .4; b.mT = 1; b.mG = .15; b.ll = Math.max(b.ll, .3); }
  else if (mo === 4) { b.mC = .4; b.mS = .8; } else if (mo === 5) { b.mO = .28; b.mR = 1; b.mW = .45; b.mC = 0; }
  return b;
}
const FX_IRIS = ['#2a1a12', '#2a1a12', '#33200f', '#33200f', '#3d2a18', '#1c1a22', '#4a3220', '#26303a'];

/* =========================================================
   E. 包住 03 的 eyeVariant／addFace，記錄「原本的五官零件」之後好隱藏
   ========================================================= */
const _fxEyeVariant = eyeVariant;
eyeVariant = function (head, e, s, vis, sk) { const n = head.children.length; _fxEyeVariant(head, e, s, vis, sk); const ud = head.userData; (ud.fxEyes = ud.fxEyes || []).push({ e, s, extra: head.children.slice(n) }); };
const _fxAddFace = addFace;
addFace = function (head, vis, sk) { const n = head.children.length; _fxAddFace(head, vis, sk); head.userData.fxFace = head.children.slice(n); };

/* =========================================================
   F. 建立表情層
   ========================================================= */
function fxSurfZ(R, x, y, off) { return Math.sqrt(Math.max(.01, R * R - x * x - y * y)) + off - FX_Z; }
function faceBuild(rig, o) {
  const head = rig.head, vis = rig.vis || {}, ud = head.userData || {}, skM = head.children[0] && head.children[0].material; if (!skM || !ud.fxEyes) return;
  fxGeo(); const R = vis.beard === 2 ? .535 : .52, key = (o && o.pl && o.pl.name) || ('x' + rig.root.id), hs = hashStr('face:' + key);
  const root = new THREE.Group(); root.position.z = FX_Z; head.add(root);
  const f = rig.fx = { root, base: fxBase(vis), P: Object.assign({}, FX_ZERO), T: Object.assign({}, FX_ZERO), eyes: [], brows: [], cheeks: [], gx: 0, gy: 0, tgx: 0, tgy: 0, wx: 0, wy: 0, wt: 1, t: 0, acc: 0, near: true, blink: 0, bs: 0, bp: 0, bt: 1 + (hs % 30) / 10, rs: (hs >>> 0) || 7, ph: (hs % 628) / 100, em: null, gt: 0, gmode: 'ball', mkey: '' };
  Object.assign(f.P, f.base); const irisCol = vis.eyeCol || FX_IRIS[hs % FX_IRIS.length];
  /* 隱藏 13r 加在眼睛旁的白色小高光球（改用本檔的高光） */
  for (const c of head.children) { const gm = c.geometry, p = gm && gm.parameters; if (c.isMesh && gm && gm.type === 'SphereGeometry' && p && p.radius < .045 && c.material && c.material.color && c.material.color.getHex() === 0xffffff && c.position.z > .42 && Math.abs(c.position.y) < .2) c.visible = false; }
  for (const c of head.children) if (c.isMesh && c.geometry === GEO.cheek) f.cheeks.push({ m: c, op: c.material.opacity, col: c.material.color.clone() });
  /* 眼睛 */
  const lidU = skM.clone(), lidL = skM.clone(); lidU.map = fxTexLid(true); lidL.map = fxTexLid(false);
  for (const m of [lidU, lidL]) { m.alphaTest = .4; m.transparent = false; m.needsUpdate = true; } fxPO(lidU, 6); fxPO(lidL, 5);
  const irisM = FX.irisMat[irisCol] || (FX.irisMat[irisCol] = fxPO(new THREE.MeshBasicMaterial({ map: fxTexIris(irisCol), alphaTest: .35 }), 2)), G = FX.geo, et = vis.eyeType | 0;
  for (const ev of ud.fxEyes) {
    const e = ev.e, s = ev.s, x = e.position.x, y = e.position.y, zc = Math.sqrt(Math.max(.01, R * R - x * x - y * y)) + .007;
    let ex = Math.max(.04, .058 * Math.abs(e.scale.x)), ey = Math.max(.034, .058 * Math.abs(e.scale.y));
    const sx = ex * (et === 6 ? 1.2 : 1.42), sy = ey * (et === 6 ? 1.2 : 1.34), ix = ex * (et === 6 ? 1.06 : .98), iy = ey * .98;
    const eg = new THREE.Group(); eg.rotation.order = 'YXZ'; eg.position.set(x, y, zc - FX_Z); eg.rotation.set(-Math.atan2(y, Math.hypot(x, zc)), Math.atan2(x, zc), e.rotation.z || 0); root.add(eg);
    const mk = (geo, mat, z, sc) => { const m = new THREE.Mesh(geo, mat); m.position.z = z; m.scale.set(sc[0], sc[1], 1); eg.add(m); return m; };
    const sclera = mk(G.circ, FX.mat.sclera, 0, [sx, sy]), iris = mk(G.circ, irisM, .003, [ix, iy]), pupil = mk(G.circ, FX.mat.pupil, .006, [ix * .42, iy * .42]), shine = mk(G.plane, FX.mat.shine, .009, [ix * 2.15, iy * 2.15]);
    const Yt = sy * 1.12, A = sx * 1.18, lu = mk(G.circ, lidU, .012, [A, 1]), ll = mk(G.circ, lidL, .011, [A, 1]); lu.visible = ll.visible = false; shine.renderOrder = 5;
    e.visible = false; let arc = null; for (const ex2 of ev.extra) { if (et === 3 && ex2.geometry && ex2.geometry.type === 'TorusGeometry') arc = ex2; else ex2.visible = false; }
    f.eyes.push({ s, g: eg, sclera, iris, pupil, shine, lu, ll, sx, sy, ix, iy, Yt, A, mx: (sx - ix) * .62, my: (sy - iy) * .6, pr: .42, arc });
  }
  /* 眉毛（隱藏原本的，改用可動的；沒有選眉型的角色也給一對細眉，才有表情） */
  for (const c of (ud.fxFace || [])) if (c.position.y > .06 || c.position.y < -.2) c.visible = false;
  const bw = vis.brow | 0, hb = vis.hairCol && lumOf(vis.hairCol) < .55 ? vis.hairCol : '#5a4636', bm = mat(hb);
  const bwid = bw === 5 ? .08 : bw === 2 ? .14 : .12, bhei = bw === 2 ? .052 : bw === 3 ? .034 : bw ? .028 : .024, brz = bw === 3 ? .3 : bw === 4 ? -.2 : bw === 2 ? .06 : 0;
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bwid, bhei, .03), bm); m.rotation.order = 'YXZ'; root.add(m);
    f.brows.push({ m, s, x0: Math.abs(.17 * vis.eyeSp), y0: .085 + (vis.eyeH - 1.1) * .06 + (bw === 5 ? .035 : 0), rz0: s * brz * (bw === 4 ? 1 : 1), R });
  }
  /* 嘴 */
  const cv = fxCv(128, 64), tex = fxCT(cv), mm = fxPO(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), 7), mouth = new THREE.Mesh(fxMouthGeom(R), mm); mouth.renderOrder = 6; root.add(mouth);
  f.mouth = { cv, g: cv.getContext('2d'), tex };
  /* 符號：青筋、汗、淚 */
  const sp = (mt, sz) => { const s = new THREE.Sprite(mt); s.scale.set(sz, sz, 1); s.visible = false; root.add(s); return s; };
  f.vein = sp(FX.mat.sprVein, .26); f.sweat = sp(FX.mat.sprSweat, .12); f.tears = [sp(FX.mat.sprTear, .09), sp(FX.mat.sprTear, .09)];
  fxApply(f, 0, true); fxPush(rig);
}
function fxPush(rig) { if (typeof WeakRef === 'undefined') return; FACE.list.push(new WeakRef(rig)); if (FACE.list.length > 400) FACE.list = FACE.list.filter(w => w.deref()); }

/* =========================================================
   G. 每幀：決定表情、平滑過渡、眨眼、視線，再套到零件上
   ========================================================= */
function fxRnd(f) { f.rs = (Math.imul(f.rs, 1664525) + 1013904223) >>> 0; return f.rs / 4294967296; }
const _fxV = new THREE.Vector3();
function fxGazeTarget(r, f, mode) {      // 把世界座標的目標換算成頭部座標的視線方向（-1~1）
  let tw = null;
  if (mode === 'cam' && typeof CAMC !== 'undefined') tw = CAMC.pos;
  else if (mode === 'ball' || mode === 'pit') {
    if (mode === 'pit' && typeof E !== 'undefined' && E.pit && E.pit.rig && E.pit.rig !== r) tw = E.pit.rig.root.position;
    else if (typeof ballMesh !== 'undefined' && ballMesh.visible) tw = ballMesh.position;
  }
  if (!tw) return false; _fxV.copy(tw); if (mode !== 'cam' && tw.y < 1) _fxV.y += 1.3; r.head.worldToLocal(_fxV); if (_fxV.z < .08) return false;
  f.tgx = clamp(Math.atan2(_fxV.x, _fxV.z) / .75, -1, 1); f.tgy = clamp(Math.atan2(_fxV.y, Math.hypot(_fxV.x, _fxV.z)) / .55, -1, 1); return true;
}
function fxSetLod(f, on) { f.near = on; }
function faceUpdate(r, dt) {
  const f = r.fx; if (!FACE.on || !f || window.__ff || !f.root.visible) return; if (dt > .1) dt = .1; f.t += dt;
  if (typeof CAMC !== 'undefined' && CAMC.pos) { const d = CAMC.pos.distanceTo(r.root.position); if (f.near && d > FACE.far) fxSetLod(f, false); else if (!f.near && d < FACE.near) fxSetLod(f, true); }
  if (!f.near) { f.acc += dt; if (f.acc < .1) return; dt = f.acc; f.acc = 0; }
  /* 1) 目前該是什麼表情 */
  const a = r.anim; let key = 'idle', u = 0;
  if (f.em && f.em.t > 0) { f.em.t -= dt; key = f.em.name; if (f.em.t <= 0) f.em = null; }
  else if (a) { u = a.dur > 0 && a.dur < 1e8 ? clamp(a.t / a.dur, 0, 1) : 0; key = fxAnimKey(a, u, r); }
  else if (r.run > .05) key = 'run';
  else if (typeof E !== 'undefined' && E.bat && E.bat.rig === r) key = 'focus';
  else if (r.ready) key = 'alert';
  const pre = FACE.table[key] || FACE.table.idle, B = f.base, T = f.T, P = f.P, kk = 1 - Math.exp(-dt * (pre.spd || 9));
  for (const k of FX_KEYS) { const v = pre[k]; T[k] = v !== undefined ? v : (B[k] !== undefined ? B[k] : 0); }
  if (key === 'idle' || key === 'focus' || key === 'alert' || key === 'thinking') { T.bY += Math.sin(f.t * .7 + f.ph) * .05; T.mC += Math.sin(f.t * .43 + f.ph * 2) * .04; }      // 平常也會有一點點細微的表情起伏
  for (const k of FX_KEYS) P[k] += (T[k] - P[k]) * kk;
  /* 2) 眨眼（自己的亂數；專注時眨得少；已經閉眼的表情不眨） */
  f.bt -= dt;
  if (!f.bs && f.bt <= 0) { f.bs = 1; f.bp = 0; }
  if (f.bs) { f.bp += dt / .17; f.blink = f.bp < .42 ? f.bp / .42 : 1 - (f.bp - .42) / .58; if (f.bp >= 1) { f.bs = 0; f.blink = 0; f.bt = (fxRnd(f) < .16 ? .14 : (2.2 + fxRnd(f) * 3.6)) / (pre.br || 1); } else f.blink = clamp(f.blink, 0, 1); }
  /* 3) 視線：球飛行時盯著球；打者看投手；難過往下看；慶祝看鏡頭；其餘小幅度亂飄 */
  const mode = pre.gz || (typeof E !== 'undefined' && E.bat && E.bat.rig === r ? 'pit' : 'ball');
  f.wt -= dt; if (f.wt <= 0) { f.wt = 1.2 + fxRnd(f) * 2.2; f.wx = (fxRnd(f) - .5) * .4; f.wy = (fxRnd(f) - .5) * .25; }
  if (mode === 'down') { f.tgx = f.wx * .3; f.tgy = -.85; } else if (mode === 'up') { f.tgx = f.wx * .3; f.tgy = .8; }
  else if (mode === 'fwd') { f.tgx = f.wx; f.tgy = f.wy; }
  else { f.gt -= dt; if (f.gt <= 0) { f.gt = .07; if (!fxGazeTarget(r, f, mode)) { f.tgx = f.wx; f.tgy = f.wy; } } }
  const gk = 1 - Math.exp(-dt * 16); f.gx += (f.tgx - f.gx) * gk; f.gy += (f.tgy - f.gy) * gk;
  fxApply(f, dt, false);
}
function fxApply(f, dt, first) {
  const P = f.P, near = f.near, bl = f.blink, R = f.brows.length ? f.brows[0].R : .52;
  /* 眼睛 */
  for (const E of f.eyes) {
    if (E.arc) { const on = P.lu > .72 && P.ew < .2; E.arc.visible = on; E.g.visible = !on; if (on) continue; }
    const cu = clamp(Math.max(P.lu, near ? bl : 0) * (1 - P.ew * .8), 0, 1), cl = clamp(P.ll * .55, 0, .6) * (1 - P.ew);
    E.g.scale.set(1 + P.ew * .1, (1 + P.ew * .3) * (near ? 1 : 1 - bl * .85), 1);
    if (near) {
      if (cu > .03) { E.lu.visible = true; E.lu.scale.set(E.A, E.Yt * cu, 1); E.lu.position.y = E.Yt * (1 - cu); } else E.lu.visible = false;
      if (cl > .03) { E.ll.visible = true; E.ll.scale.set(E.A, E.Yt * cl, 1); E.ll.position.y = -E.Yt * (1 - cl); } else E.ll.visible = false;
    } else E.lu.visible = E.ll.visible = false;
    E.pupil.visible = E.shine.visible = near;
    const gx = f.gx * E.mx, gy = f.gy * E.my, ps = E.pr * (1 + P.pu * .35);
    E.iris.position.set(gx, gy, .003); E.pupil.position.set(gx, gy, .006); E.pupil.scale.set(E.ix * ps, E.iy * ps, 1); E.shine.position.set(gx * .35 - E.ix * .02, gy * .35 + E.iy * .02, .009);
  }
  /* 眉毛 */
  for (const b of f.brows) {
    const s = b.s, y = b.y0 + P.bY * .034 + (s > 0 ? P.bK * .03 : -P.bK * .012), x = s * Math.max(.05, b.x0 - P.bA * .014), z = fxSurfZ(b.R, x, y, .013);
    b.m.position.set(x, y, z); b.m.rotation.set(-Math.asin(clamp(y / b.R, -.9, .9)) * .9, Math.atan2(x, z + FX_Z), b.rz0 + s * P.bA * .5);
    b.m.scale.set(1 + Math.abs(P.bA) * .1, 1 + Math.max(0, P.bA) * .3, 1);
  }
  /* 臉紅 */
  for (const c of f.cheeks) { c.m.material.opacity = clamp(c.op + P.bl * .4, 0, .95); c.m.material.color.setRGB(1, .6 - P.bl * .18, .6 - P.bl * .22); }
  /* 嘴（量化後有變才重畫） */
  const tk = P.talk > .01 ? Math.sin(f.t * 16 + f.ph) * P.talk : 0, q = v => Math.round(v * 24) / 24;
  const m = { mC: q(P.mC), mW: q(P.mW), mO: q(clamp(P.mO + tk + Math.abs(tk) * .4, 0, 1)), mR: q(P.mR), mT: q(P.mT), mG: q(P.mG), mS: q(P.mS) };
  const mk = m.mC + ',' + m.mW + ',' + m.mO + ',' + m.mR + ',' + m.mT + ',' + m.mG + ',' + m.mS;
  if (mk !== f.mkey) { f.mkey = mk; fxDrawMouth(f.mouth.g, m); f.mouth.tex.needsUpdate = true; }
  /* 符號 */
  const t = f.t + f.ph, hv = P.vn > .1, hsw = P.sw > .15, htr = P.tr > .15;
  f.vein.visible = hv; if (hv) { const z = P.vn * (1 + .14 * Math.sin(t * 14)); f.vein.scale.set(.26 * z, .26 * z, 1); f.vein.position.set(.46, .44, .26 - FX_Z); }
  f.sweat.visible = hsw; if (hsw) { const st = (t * .9) % 1, z = Math.min(1, P.sw * 1.2) * Math.sin(Math.PI * st) ** .5; f.sweat.scale.set(.12 * z, .12 * z, 1); f.sweat.position.set(.4 + .03 * st, .2 - .42 * st, .3 - FX_Z); }
  for (let i = 0; i < 2; i++) { const sp = f.tears[i]; sp.visible = htr; if (htr) { const st = (t * .8 + i * .5) % 1, z = Math.min(1, P.tr * 1.2) * Math.sin(Math.PI * st) ** .5, sg = i ? 1 : -1; sp.scale.set(.09 * z, .1 * z, 1); sp.position.set(sg * (.27 + .02 * st), -.1 - .28 * st, .4 - FX_Z); } }
}

/* =========================================================
   H. 對外介面＋掛上 03 的函式
   ========================================================= */
FACE.emote = function (rig, name, dur, instant) { const f = rig && rig.fx; if (!f || !FACE.table[name]) return false; f.em = { name, t: dur > 0 ? dur : 1.5 }; if (instant) { const pre = FACE.table[name]; for (const k of FX_KEYS) f.P[k] = pre[k] !== undefined ? pre[k] : (f.base[k] || 0); fxApply(f, 0, true); } return true; };
FACE.clear = function (rig) { if (rig && rig.fx) rig.fx.em = null; };
FACE.all = function (name, dur) { let n = 0; for (const w of FACE.list) { const r = w.deref && w.deref(); if (r && FACE.emote(r, name, dur || 2)) n++; } return n; };      // 測試用：FACE.all('angry', 3)

const _fxMakeChibi = makeChibi;
makeChibi = function (o) { const rig = _fxMakeChibi.apply(this, arguments); try { if (FACE.on && rig && rig.head) faceBuild(rig, o); } catch (e) { console.error('[face]', e); } return rig; };
const _fxRigStep = rigStep;
rigStep = function (r, dt) { _fxRigStep(r, dt); if (r.fx) { try { faceUpdate(r, dt); } catch (e) { if (!FACE._err) { FACE._err = 1; console.error('[face]', e); } } } };
