/* 中職野球2027 遊戲程式（由 baseball.html 拆出）。須在 three.js r128 載入後執行 */
'use strict';
/* =====================================================================
   實況風 弱力職棒  -  single file game
   Part 2: utilities / data / teams / pitch types
   ===================================================================== */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
let _seed = 1234567;
function srand(s) { _seed = s >>> 0 || 1; }
function rnd() { _seed ^= _seed << 13; _seed >>>= 0; _seed ^= _seed >> 17; _seed ^= _seed << 5; _seed >>>= 0; return (_seed >>> 0) / 4294967296; }
const R = { f: () => Math.random() };           // gameplay randomness (non-seeded)
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
const pick = a => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
function weighted(items, ws) { let t = 0; for (const w of ws) t += w; let r = Math.random() * t; for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; }
function softmaxPick(items, scores, temp) {
  let m = -1e9; for (const s of scores) if (s > m) m = s;
  const ws = scores.map(s => Math.exp((s - m) / temp)); return weighted(items, ws);
}

/* ---------------- field geometry (units ~ meters, stylised) ---------------- */
const BASE_LEN = 20;                       // distance between bases
const H = BASE_LEN / Math.SQRT2;
const BASES = [ { x: 0, z: 0 }, { x: H, z: -H }, { x: 0, z: -2 * H }, { x: -H, z: -H } ];   // home,1B,2B,3B
const MOUND = { x: 0, z: -15 };
const ZW = 0.55, ZC = 1.35, ZH = 0.72;      // strike zone half width / centre y / half height（寬:高≈3:4，與真實好球帶 43cm × 約 57cm 比例相近）
const BALL_R = 0.16;
const ZCM = 43 / (2 * ZW);      // 1 單位 ≈ 幾公分（好球帶寬 43cm 對應 2×ZW）
let WALL_H = 5.4;
const FIELD_SCALE = 1.05;      // 界內外野牆整體放大 5%：外野更寬敞
function buildWallPts(cf, gap, ln) {      // 界內：中外野→左右外野線；界外：外牆緊貼著邊線外側慢慢收攏，不再大幅內縮（界外區縮小、界內相對變大）
  const R0 = (ln + 3) * FIELD_SCALE;
  return [[0, cf * FIELD_SCALE], [22.5, (gap + 2) * FIELD_SCALE], [45, R0], [50, R0 * .91], [57, R0 * .70], [66, R0 * .57], [78, 36], [95, 30], [115, 26.5], [140, 25], [180, 24]];
}
const WALL_PTS = buildWallPts(80, 75.5, 71);
function wallRadius(phi) {                // phi deg from centre field (0), either sign
  let a = Math.abs(phi); a = a > 180 ? 360 - a : a;
  for (let i = 0; i < WALL_PTS.length - 1; i++) {
    const p = WALL_PTS[i], q = WALL_PTS[i + 1];
    if (a >= p[0] && a <= q[0]) return lerp(p[1], q[1], (a - p[0]) / (q[0] - p[0]));
  }
  return 30;
}
const DEFAULT_POS = {   // fielder default positions (x,z)
  P: { x: 0, z: -15 }, C: { x: 0, z: 4.0 }, '1B': { x: 12.2, z: -14.5 }, '2B': { x: 6.8, z: -23 },
  SS: { x: -6.8, z: -23 }, '3B': { x: -12.2, z: -14.5 }, LF: { x: -36, z: -57 }, CF: { x: 0, z: -64 }, RF: { x: 36, z: -57 }
};
const POS_LIST = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const POS_JP = { P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右' };
const POS_FULL = { P: '投手', C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野手', CF: '中外野手', RF: '右外野手' };
const BASE_JP = ['本壘', '一壘', '二壘', '三壘'];

/* ---------------- pitch types ---------------- */
// bx: +glove side (for RHP => +x in world),  by: vertical break (neg = drop)
const PITCHES = {
  // bx/by: 到本壘板時相對「慣性直線」的總位移(公尺)；tx/ty: 位移成長指數（越大＝越晚才變化＝尾勁越強）；miss: 此球路常見的落點偏差[橫(依投手手)、縱]
  ST: { id: 'ST', dec: 0.8, jp: '四縫線直球', sp: 1.00, bx: 0.20, by: 0.42, tx: 1.3, ty: 2.3, ex: 0, ey: 0, grv: .55, bite: .22, arc: -0.03, sx: .85, sy: .85, miss: [.04, .16], col: '#ff6a5a', short: '直球', tail: '尾段上飄' },
  SL: { id: 'SL', dec: 1.0, jp: '滑球', sp: 0.89, bx: 1.55, by: -0.42, tx: 2.9, ty: 2.2, ex: .08, ey: 0, grv: 1, bite: .86, arc: .0, sx: 1.2, sy: .95, miss: [.26, -.08], col: '#ffb23a', short: '滑球', tail: '末段橫向急切' },
  CU: { id: 'CU', dec: 1.2, jp: '曲球', sp: 0.72, bx: 0.70, by: -1.5, tx: 1.5, ty: 1.35, ex: .30, ey: .42, grv: 1.1, bite: .60, arc: 0.22, sx: .95, sy: 1.25, miss: [.08, -.22], col: '#7ad0ff', short: '曲球', tail: '高拋大弧線下墜' },
  FK: { id: 'FK', dec: 1.35, jp: '指叉球', sp: 0.84, bx: 0.18, by: -1.4, tx: 2.4, ty: 3.6, ex: 0, ey: 0, grv: 1, bite: .92, arc: 0.02, sx: .9, sy: 1.35, miss: [0, -.32], col: '#9a7aff', short: '指叉', tail: '最後 1/4 才掉落' },
  SH: { id: 'SH', dec: 0.95, jp: '內曲球', sp: 0.94, bx: -1.30, by: -0.26, tx: 1.35, ty: 1.9, ex: .38, ey: .1, grv: 1, bite: .34, arc: .0, sx: 1.15, sy: .9, miss: [-.22, 0], col: '#6aff9a', short: '內曲', tail: '持續內切' },
  CH: { id: 'CH', dec: 1.7, jp: '變速球', sp: 0.80, bx: -1.00, by: -0.80, tx: 1.75, ty: 2.1, ex: .15, ey: .12, grv: 1.15, bite: .76, arc: 0.04, sx: 1.05, sy: 1.15, miss: [-.15, -.20], col: '#ffe84a', short: '變速', tail: '減速後沉降內飄' },
  CT: { id: 'CT', dec: 0.9, jp: '卡特球', sp: 0.93, bx: 0.6, by: -0.20, tx: 3.7, ty: 2.4, ex: 0, ey: 0, grv: .9, bite: .84, arc: .0, sx: 1.1, sy: .9, miss: [.15, .0], col: '#ff9acb', short: '卡特', tail: '進壘前急切' },
  SK: { id: 'SK', dec: 0.95, jp: '伸卡球', sp: 0.92, bx: -1.10, by: -0.85, tx: 1.6, ty: 2.0, ex: .22, ey: .2, grv: 1, bite: .30, arc: -0.02, sx: 1.1, sy: 1.1, miss: [-.18, -.20], col: '#4adfc0', short: '伸卡', tail: '內切下沉' },
  TS: { id: 'TS', dec: 0.9, jp: '二縫線速球', sp: 0.96, bx: -0.80, by: -0.35, tx: 1.4, ty: 2.0, ex: .34, ey: .05, grv: .85, bite: .26, arc: -0.01, sx: 1.0, sy: .95, miss: [-.12, -.06], col: '#ffd27a', short: '二縫', tail: '內切微沉' },
  SV: { id: 'SV', dec: 1.1, jp: '滑曲球', sp: 0.80, bx: 1.20, by: -0.90, tx: 1.6, ty: 1.9, ex: .30, ey: .28, grv: 1.05, bite: .80, arc: 0.06, sx: 1.15, sy: 1.15, miss: [.18, -.18], col: '#b266ff', short: '滑曲', tail: '斜向大幅切入' },
  KN: { id: 'KN', jp: '蝴蝶球', sp: 0.56, bx: 0.0, by: -0.12, tx: 2.0, ty: 2.0, bite: .5, arc: .1, miss: [0, 0], col: '#f5f5f5', short: '蝴蝶', knuckle: true, tail: '不規則飄動' }
};
// 各球種的出手點微調（相對於投手個人的手臂角度）
const REL = { ST: [0, 0], SL: [.07, -.06], CU: [-.04, .10], FK: [-.03, .04], SH: [.09, -.04], CH: [-.05, -.08], CT: [.03, -.02], SK: [.11, -.13], TS: [.08, -.05], SV: [.02, .06], KN: [-.02, .02] };


/* =====================================================================
   Part 2b: 中職野球 2027 — 球隊／球員資料（數據→能力值換算）
   ★ 打者 AVG/OBP/SLG/HR/SB/K% 與投手 ERA/K%/BB%/ERA+ 為 2026 官方累計（截至 2026-10-12，達規定者）
   ★ 標記 est:1 者為未達規定打席／局數或資料不全，以角色與常見表現估算；手別、球速、球種組合、守備評價皆為估算
   ===================================================================== */
const TEAMS = [
  { id: 'CTB', name: '中信兄弟', short: '兄弟', c1: '#f2c200', c2: '#1b1b1b', cap: '#1b1b1b', home: '洲際棒球場', dome: false },
  { id: 'UNI', name: '統一7-ELEVEn獅', short: '統一獅', c1: '#f26a00', c2: '#ffffff', cap: '#e05a00', home: '亞太主球場', dome: false },
  { id: 'RAK', name: '樂天桃猿', short: '樂天', c1: '#8c0a2a', c2: '#ffffff', cap: '#6d0820', home: '桃園棒球場', dome: false },
  { id: 'FBK', name: '富邦悍將', short: '富邦', c1: '#0a56a8', c2: '#ffffff', cap: '#08407e', home: '新莊棒球場', dome: false },
  { id: 'WCD', name: '味全龍', short: '味全', c1: '#d6122e', c2: '#ffffff', cap: '#b00d24', home: '天母棒球場', dome: false },
  { id: 'TSG', name: '台鋼雄鷹', short: '台鋼', c1: '#0d6b3d', c2: '#f5d36a', cap: '#0a4f2d', home: '澄清湖棒球場', dome: false },
  { id: 'TPE', name: 'Team Taiwan', short: 'Taiwan', card: 'Team Taiwan', c1: '#1f5fd0', c2: '#e30613', cap: '#0b2a66', home: '台北大巨蛋', dome: true, icon: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="20" fill="#fff"/><g transform="translate(20 20)"><g fill="#e30613" stroke="#1d3a8a" stroke-width="1.1"><circle cx="0" cy="-9" r="6.2"/><circle cx="8.56" cy="-2.78" r="6.2"/><circle cx="5.29" cy="7.28" r="6.2"/><circle cx="-5.29" cy="7.28" r="6.2"/><circle cx="-8.56" cy="-2.78" r="6.2"/></g><circle r="6.6" fill="#1d3a8a"/><circle r="3.7" fill="#fff"/></g></svg>` },
  { id: 'ALL', name: '明星隊', short: '明星隊', card: '明星隊', c1: '#f5b400', c2: '#16233f', cap: '#16233f', home: '台北大巨蛋', dome: true, icon: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="20" fill="#f5b400"/><polygon points="20,6.5 23.6,15.5 33.3,16.1 25.8,22.3 28.3,31.7 20,26.4 11.7,31.7 14.2,22.3 6.7,16.1 16.4,15.5" fill="#fff" stroke="#9a5a00" stroke-width="1"/></svg>` }
];
const STADIUMS = ['洲際棒球場', '亞太主球場', '桃園棒球場', '新莊棒球場', '天母棒球場', '澄清湖棒球場', '台北大巨蛋', '嘉義市立棒球場', '斗六棒球場', '花蓮縣立棒球場', '台東縣立棒球場'];
/* 球場特性（2026 年中職例行賽共使用 11 座球場）。cf=中外野、gap=左右中間、ln=兩翼（遊戲單位），h=外野牆高，
   dt=氣溫修正(°C)，wind=風力倍率，rain=降雨傾向，wc=牆頂顏色。尺寸為依球場特色設定的示意比例，非精確丈量值 */
const PARKS = {
  '洲際棒球場': { cf: 80, gap: 75.5, ln: 71, h: 5.4, dt: 0, wind: 1.0, rain: 1.0, wc: 0x1d7a45, note: '標準尺寸，中部球場' },
  '亞太主球場': { cf: 81.5, gap: 76.5, ln: 71.5, h: 5.6, dt: 1, wind: .9, rain: 1.1, wc: 0x1b4f9c, note: '全新球場，場地寬敞' },
  '桃園棒球場': { cf: 79, gap: 74, ln: 70, h: 5.0, dt: -1, wind: 1.3, rain: 1.0, wc: 0x7a1030, note: '風勢較大，外野牆較矮' },
  '新莊棒球場': { cf: 79, gap: 74.5, ln: 70, h: 5.3, dt: 0, wind: 1.0, rain: 1.0, wc: 0x0a56a8, note: '中規中矩的北部球場' },
  '天母棒球場': { cf: 76, gap: 72, ln: 68.5, h: 5.0, dt: -1, wind: .9, rain: 1.1, wc: 0x9a1020, note: '場地偏小，容易出現全壘打' },
  '澄清湖棒球場': { cf: 80, gap: 75.5, ln: 71, h: 5.4, dt: 2, wind: 1.1, rain: .9, wc: 0x0d6b3d, note: '南部炎熱，天氣多半晴朗' },
  '台北大巨蛋': { cf: 81, gap: 76, ln: 71.5, h: 5.8, dt: 0, wind: 0, rain: 0, wc: 0x203a60, dome: true, note: '室內球場，無風無雨' },
  '嘉義市立棒球場': { cf: 78, gap: 73.5, ln: 69.5, h: 5.3, dt: 2, wind: .9, rain: 1.2, wc: 0x2f6b3a, note: '悶熱潮濕，午後雷陣雨多' },
  '斗六棒球場': { cf: 77, gap: 72.5, ln: 69, h: 5.1, dt: 2, wind: .8, rain: 1.2, wc: 0x3d6b2f, note: '內陸悶熱，風小、場地偏小' },
  '花蓮縣立棒球場': { cf: 79, gap: 74.5, ln: 70, h: 5.3, dt: -2, wind: 1.4, rain: 1.5, wc: 0x23607a, note: '東岸多風多雨，氣溫較涼' },
  '台東縣立棒球場': { cf: 77.5, gap: 73, ln: 69.5, h: 5.1, dt: 2, wind: 1.5, rain: 1.1, wc: 0x2a7a6a, note: '海風強勁，天氣炎熱' }
};
/* 自動選場時的全聯盟加權（2026 年例行賽各球場使用場次） */
const PARK_W = [['台北大巨蛋', 90], ['桃園棒球場', 52], ['新莊棒球場', 50], ['亞太主球場', 48], ['洲際棒球場', 47], ['澄清湖棒球場', 45], ['天母棒球場', 40], ['嘉義市立棒球場', 10], ['台東縣立棒球場', 6], ['斗六棒球場', 2], ['花蓮縣立棒球場', 2]];
/* 部分主場賽事會移師外地球場（機率依 2026 年賽程場次概估） */
const SAT_PARKS = {
  TSG: [['嘉義市立棒球場', .10], ['台東縣立棒球場', .07], ['斗六棒球場', .03], ['花蓮縣立棒球場', .03]],
  UNI: [['嘉義市立棒球場', .07], ['台東縣立棒球場', .03]],
  WCD: [['斗六棒球場', .03], ['花蓮縣立棒球場', .03]]
};
/* 打者：[姓名, 守位, 打, AVG, OBP, SLG, HR, SB, K%, BB%, 守備, 肩力, est] */
const B = (n, p, h, a, o, s, hr, sb, k, bb, f, ar, est) => ({ n, p, h, a, o, s, hr, sb, k, bb, f, ar, est: est ? 1 : 0 });
/* 投手：[姓名, 角色, 手, 球速, ERA, K%, BB%, ERA+, 局/場, 球種, est] */
const P = (n, r, h, v, era, k, bb, ep, ipg, ps, est) => ({ n, r, h, v, era, k, bb, ep, ipg, ps, est: est ? 1 : 0 });
/* 補充名單用簡化建構：BN＝板凳野手(AVG,HR,SB,守備,肩力)；PN＝投手(角色/手/球速/ERA/K%/BB%/球種/每場局數)；全部為估算值 */
const BN = (n, p, h, a, hr, sb, f, ar) => B(n, p, h, a, +(a + .055).toFixed(3), +(a + .070 + hr * .006).toFixed(3), hr, sb, 15, 7, f, ar, 1);
const PN = (n, r, h, v, era, k, bb, ps, ipg) => P(n, r, h, v, era, k, bb, Math.round(Math.max(60, Math.min(150, 360 / era))), ipg || (r === 'SP' ? 5.8 : 1.1), ps, 1);
const CPBL = {
  /* Team Taiwan：2024 世界12強冠軍中華隊 28 人（含遞補的郭俊麟、黃恩賜、曾頌恩；古林睿煬、邱浩鈞、潘文輝因傷退出）。能力值依當時成績與國際賽表現估算，整體偏強 */
  TPE: {
    bat: [B('林家正', 'C', 'R', .300, .380, .500, 15, 3, 16, 11, 76, 78, 1), B('吉力吉撈·鞏冠', '1B', 'R', .300, .360, .480, 11, 2, 17, 8, 66, 72, 1), B('張政禹', '2B', 'R', .305, .370, .390, 2, 25, 11, 9, 76, 72, 1),
      B('潘傑楷', '3B', 'L', .315, .385, .420, 5, 10, 12, 11, 72, 70, 1), B('江坤宇', 'SS', 'R', .300, .370, .380, 3, 6, 10, 9, 80, 76, 1), B('林安可', 'LF', 'L', .305, .365, .510, 15, 6, 17, 8, 66, 76, 1),
      B('陳傑憲', 'CF', 'L', .335, .410, .470, 9, 10, 9, 11, 82, 74, 1), B('陳晨威', 'RF', 'R', .315, .380, .440, 7, 20, 9, 9, 74, 72, 1), B('林立', 'DH', 'R', .295, .365, .490, 14, 6, 15, 9, 60, 66, 1)],
    bench: [B('朱育賢', '1B', 'R', .285, .345, .450, 11, 2, 17, 7, 58, 62, 1), B('李凱威', '2B', 'R', .290, .355, .380, 2, 6, 12, 8, 76, 70, 1), B('岳東華', '1B', 'R', .290, .345, .420, 5, 3, 13, 7, 64, 64, 1),
      B('曾頌恩', '1B', 'R', .285, .345, .480, 10, 2, 16, 8, 62, 64, 1), B('戴培峰', 'C', 'R', .275, .335, .370, 2, 2, 14, 7, 74, 78, 1), B('邱智呈', 'LF', 'R', .290, .385, .400, 6, 10, 12, 12, 72, 70, 1)],
    sp: [P('林昱珉', 'SP', 'L', 152, 2.40, 25, 6, 150, 6.0, ['SL', 'CH', 'CU'], 1), P('郭俊麟', 'SP', 'R', 148, 3.10, 19, 6, 115, 5.8, ['SL', 'CH', 'CU'], 1), P('黃子鵬', 'SP', 'R', 149, 2.50, 17, 4.5, 135, 6.2, ['SL', 'CH', 'CU'], 1),
      P('江國豪', 'SP', 'R', 150, 2.90, 19, 6, 120, 5.6, ['SL', 'CH', 'FK'], 1), P('林凱威', 'SP', 'R', 151, 2.60, 21, 6.5, 130, 5.2, ['SL', 'FK', 'CH'], 1)],
    rp: [P('陳冠宇', 'RP', 'L', 149, 2.10, 24, 6, 150, 1.2, ['SL', 'CH'], 1), P('張奕', 'RP', 'R', 150, 2.30, 24, 7, 150, 1.1, ['SL', 'FK'], 1), P('陳冠偉', 'RP', 'R', 149, 2.60, 21, 7, 135, 1.1, ['SL', 'FK'], 1),
      P('王志煊', 'RP', 'R', 150, 2.90, 21, 8, 120, 1, ['SL', 'FK'], 1), P('莊昕諺', 'RP', 'R', 148, 3.00, 20, 8, 115, 1.1, ['SL', 'CH'], 1), P('陳柏清', 'RP', 'R', 148, 2.80, 20, 7, 125, 1.1, ['SL', 'CH'], 1),
      P('黃恩賜', 'RP', 'R', 148, 3.00, 19, 8, 115, 1.1, ['SL', 'CH'], 1), P('吳俊偉', 'CL', 'R', 153, 1.80, 26, 6, 150, 1, ['SL', 'FK'], 1)]
  },
  CTB: {
    bat: [B('王威晨', '2B', 'R', .292, .349, .361, 1, 6, 8.6, 7.8, 70, 66), B('江坤宇', 'SS', 'R', .283, .363, .350, 2, 3, 10.0, 8.1, 76, 74), B('張仁瑋', '3B', 'R', .300, .340, .380, 4, 16, 10.4, 6.1, 68, 70),
      B('曾頌恩', '1B', 'R', .268, .330, .420, 6, 3, 15, 7, 62, 62, 1), B('陳俊秀', 'DH', 'R', .275, .335, .400, 5, 4, 14, 7, 55, 58, 1), B('黃韋盛', 'CF', 'L', .272, .338, .365, 2, 14, 13, 8, 74, 68, 1),
      B('許庭綸', 'LF', 'L', .266, .330, .372, 3, 9, 14, 8, 66, 62, 1), B('詹子賢', 'RF', 'R', .262, .322, .360, 3, 6, 15, 7, 66, 72, 1), B('岳政華', 'C', 'R', .246, .300, .338, 2, 1, 16, 6, 70, 74, 1)],
    bench: [B('岳東華', '1B', 'R', .255, .315, .350, 2, 2, 15, 7, 62, 62, 1), B('林智平', 'SS', 'R', .250, .310, .330, 1, 4, 14, 7, 68, 66, 1), B('張祖恩', 'CF', 'R', .258, .320, .340, 1, 8, 15, 7, 66, 66, 1), BN('楊晉豪','C','R',.240,1,1,66,70), BN('郭阜林','3B','R',.245,2,3,66,66), BN('蔡琞傑','CF','L',.235,1,8,66,64)],
    sp: [P('鄭浩均', 'SP', 'R', 148, 3.89, 16, 7, 92, 6.0, ['SL', 'CH', 'CU']), P('羅戈', 'SP', 'R', 150, 3.33, 16.5, 5.9, 97, 6.2, ['SL', 'CH', 'CU']), P('勝騎士', 'SP', 'R', 148, 3.08, 20.2, 2.9, 105, 6.2, ['CT', 'CH', 'CU']), P('德保拉', 'SP', 'R', 147, 3.16, 17, 5, 100, 5.8, ['SL', 'CH', 'SK'], 1), PN('吳哲源','SP','R',147,3.7,17,7,['SL','CH','CU']), PN('伍立辰','SP','R',146,4.6,17,8,['SL','CH','CU'],5.3), PN('林暉盛','SP','R',145,4.4,15,7,['SL','CH','CU']), PN('游竣宥','SP','R',146,4.3,16,8,['SL','CH'],5.0)],
    rp: [P('鄭浩均', 'RP', 'R', 146, 3.89, 16, 7, 88, 3, ['SL', 'CH'], 1), P('呂彥青', 'RP', 'R', 148, 3.2, 21, 7, 105, 1.1, ['SL', 'FK'], 1), P('李振昌', 'CL', 'R', 150, 2.9, 22, 7, 115, 1, ['SL', 'FK'], 1), PN('魏碩成','RP','R',145,4.0,15,7,['SL','CH'],2.3), PN('黃恩賜','RP','R',146,3.7,18,8,['SL','CH']), PN('蔡齊哲','RP','R',145,3.5,19,7,['SL','FK']), PN('官大元','RP','L',144,3.4,17,8,['SL','CH']), PN('陳琥','RP','R',150,3.5,22,9,['SL','FK'])]
  },
  UNI: {
    bat: [B('陳傑憲', 'CF', 'L', .322, .403, .412, 5, 7, 9.8, 11.4, 78, 70), B('潘傑楷', '2B', 'L', .305, .396, .397, 3, 6, 14.6, 11.7, 72, 66), B('邱智呈', '3B', 'R', .257, .365, .341, 3, 9, 14.5, 13.5, 68, 68),
      B('蘇智傑', 'RF', 'L', .270, .340, .420, 8, 5, 16, 8, 66, 74, 1), B('陳聖平', '1B', 'R', .233, .286, .343, 6, 6, 12.3, 6.7, 62, 62), B('高宇杰', 'C', 'R', .255, .320, .350, 3, 2, 14, 7, 72, 76, 1),
      B('廖健富', 'SS', 'R', .250, .310, .330, 1, 8, 13, 7, 76, 72, 1), B('林培緯', 'LF', 'R', .262, .325, .370, 4, 8, 15, 7, 64, 66, 1), B('陳重羽', 'DH', 'L', .258, .330, .385, 5, 3, 16, 8, 52, 56, 1)],
    bench: [B('吳俊偉', 'SS', 'R', .245, .305, .320, 1, 5, 14, 6, 70, 68, 1), B('王正棠', 'C', 'R', .240, .295, .320, 1, 1, 17, 6, 66, 70, 1), BN('林佳緯','LF','R',.255,3,6,64,64), BN('李丞齡','CF','L',.250,2,8,68,66), BN('陳鏞基','DH','R',.250,4,1,50,54)],
    sp: [P('布雷克', 'SP', 'R', 148, 1.61, 16.2, 2.8, 201, 6.6, ['CT', 'CU', 'CH']), P('獅帝芬', 'SP', 'R', 149, 2.71, 15.5, 8.7, 117, 5.9, ['SL', 'CH', 'CU']), P('喬登', 'SP', 'R', 150, 2.9, 19, 7, 110, 6, ['SL', 'CH', 'CU'], 1), PN('邱浩鈞','SP','R',147,3.1,17,7,['SL','CH','CU']), PN('銳力獅','SP','R',149,3.3,18,6,['SL','CH','CU']), PN('郭俊麟','SP','R',146,4.7,15,7,['SL','CH','CU'],5.6), PN('林詔恩','SP','L',143,3.5,17,7,['SL','CH','SK'],5.2), PN('胡智爲','SP','R',148,5.0,16,7,['SL','FK'],5.4)],
    rp: [P('江少慶', 'RP', 'R', 150, 3.3, 20, 8, 100, 1.2, ['FK', 'SL'], 1), P('髙塩將樹', 'RP', 'R', 147, 2.8, 21, 6, 115, 1, ['SL', 'CH'], 1), P('鍾允華', 'CL', 'R', 150, 2.2, 23, 6, 140, 1, ['SL', 'FK'], 1), PN('陳韻文','RP','R',148,2.9,21,6,['SL','FK']), PN('鄭副豪','RP','R',146,3.8,17,8,['SL','CH']), PN('高偉強','RP','R',145,3.9,16,8,['SL','CH'],2.0)]
  },
  RAK: {
    bat: [B('陳晨威', 'RF', 'R', .304, .361, .416, 6, 23, 8.4, 8.1, 70, 68), B('林子偉', '2B', 'R', .275, .335, .370, 3, 20, 13, 7, 72, 66, 1), B('馬傑森', '3B', 'R', .275, .326, .349, 3, 2, 11, 4.9, 66, 68),
      B('威克', '1B', 'R', .270, .340, .450, 8, 2, 17, 8, 56, 62, 1), B('林泓育', 'DH', 'L', .268, .340, .400, 5, 2, 15, 9, 52, 56, 1), B('朱迦恩', 'C', 'R', .245, .305, .340, 2, 1, 15, 6, 70, 74, 1),
      B('蔣少宏', 'SS', 'R', .255, .312, .335, 1, 8, 13, 6, 76, 72, 1), B('王靖斌', 'CF', 'L', .262, .325, .350, 2, 12, 14, 7, 72, 66, 1), B('岳政樺', 'LF', 'R', .258, .322, .370, 4, 4, 16, 7, 62, 60, 1)],
    bench: [B('陳睦衡', 'SS', 'R', .240, .300, .320, 1, 3, 15, 6, 68, 66, 1), B('張育成', '1B', 'R', .250, .310, .360, 3, 1, 17, 7, 58, 60, 1), B('梁家榮', 'C', 'R', .238, .295, .320, 1, 1, 17, 6, 66, 70, 1), BN('林立','CF','L',.250,2,8,68,64), BN('藍寅倫','2B','R',.248,1,5,68,64), BN('郭嚴文','3B','R',.242,2,2,64,66)],
    sp: [P('威能帝', 'SP', 'R', 151, 2.9, 20, 5.5, 112, 6.4, ['SL', 'CH', 'CU'], 1), P('艾菩樂', 'SP', 'R', 148, 2.81, 17.4, 4.2, 115, 6.5, ['SL', 'CH', 'CU']), P('曾家輝', 'SP', 'L', 144, 2.69, 15.7, 6.8, 121, 5.5, ['SL', 'CH', 'SK']), PN('林子崴','SP','L',145,3.6,16,7,['SL','CH','SK']), PN('邱駿威','SP','R',146,3.9,15,7,['SL','CH']), PN('劉家翔','SP','L',144,3.9,16,8,['SL','CH','CU'],5.4)],
    rp: [P('蘇俊璋', 'RP', 'R', 147, 3.0, 19, 7, 105, 1.1, ['SL', 'FK'], 1), P('朱承洋', 'RP', 'R', 149, 3.1, 21, 8, 102, 1, ['SL', 'CH'], 1), P('陳冠宇', 'CL', 'L', 146, 2.9, 22, 7, 110, 1, ['SL', 'CH'], 1), PN('林煜清','RP','R',146,3.4,19,8,['SL','CH']), PN('陳 品','RP','L',144,3.6,18,8,['SL','CH'],2.0)]
  },
  FBK: {
    bat: [B('林澤彬', 'CF', 'L', .311, .371, .369, 0, 6, 8.2, 8.4, 72, 66), B('張育成', '1B', 'R', .285, .390, .470, 16, 9, 17.6, 11.6, 62, 66), B('范國宸', 'DH', 'R', .282, .344, .427, 13, 2, 16.5, 7.6, 52, 60),
      B('林哲瑄', 'RF', 'L', .270, .335, .380, 4, 4, 14, 7, 62, 70, 1), B('申皓瑋', '3B', 'R', .262, .322, .350, 3, 6, 14, 7, 66, 68, 1), B('陳彥廷', 'C', 'R', .245, .300, .335, 2, 1, 15, 6, 70, 74, 1),
      B('江國豪', 'SS', 'R', .258, .315, .335, 1, 10, 13, 6, 76, 72, 1), B('劉冠麟', '2B', 'R', .256, .318, .340, 2, 7, 14, 7, 70, 64, 1), B('王正棠', 'LF', 'R', .252, .312, .350, 3, 6, 15, 7, 62, 62, 1)],
    bench: [B('張進德', 'DH', 'L', .265, .330, .400, 5, 1, 17, 8, 50, 56, 1), B('陳晨昱', 'SS', 'R', .240, .298, .320, 1, 4, 14, 6, 68, 66, 1), B('朱益生', 'C', 'R', .236, .292, .318, 1, 1, 17, 6, 66, 70, 1), BN('林岳谷','SS','R',.242,1,5,70,66), BN('楊舒帆','2B','R',.240,1,4,66,62)],
    sp: [P('李東洺', 'SP', 'R', 150, 2.54, 18, 6, 125, 6.3, ['SL', 'CH', 'CU'], 1), P('鈴木駿輔', 'SP', 'R', 150, 2.31, 20.5, 6.1, 141, 6.0, ['SL', 'FK', 'CU']), P('魔力藍', 'SP', 'R', 148, 3.04, 15.6, 5.8, 107, 5.8, ['CT', 'CH', 'CU']), PN('林維恩','SP','R',146,3.7,16,7,['SL','CH','CU']), PN('游霆崴','SP','R',146,3.6,17,7,['SL','CH','CU'],5.6)],
    rp: [P('張奕', 'RP', 'R', 147, 3.0, 20, 7, 105, 1.1, ['SL', 'CH'], 1), P('江家豪', 'RP', 'L', 146, 3.4, 18, 8, 95, 1, ['SL', 'CH'], 1), P('曾峻岳', 'CL', 'R', 151, 2.5, 24, 7, 125, 1, ['SL', 'FK'], 1), PN('陳仕朋','RP','R',146,3.6,18,8,['SL','CH']), PN('王躍霖','RP','R',147,3.5,19,8,['SL','CH'],2.0)]
  },
  WCD: {
    bat: [B('張政禹', 'SS', 'R', .284, .356, .339, 1, 33, 14.1, 9.4, 74, 70), B('郭天信', 'CF', 'L', .252, .310, .359, 9, 24, 9.6, 7.0, 74, 68), B('李凱威', '2B', 'R', .263, .338, .327, 3, 19, 10.2, 9.3, 70, 66),
      B('朱育賢', 'DH', 'R', .235, .302, .359, 13, 0, 20.2, 6.3, 50, 60), B('劉基鴻', '3B', 'R', .246, .301, .357, 8, 5, 14.2, 6.2, 66, 72), B('林承飛', 'RF', 'R', .262, .322, .370, 5, 6, 14, 7, 64, 70, 1),
      B('林琨笙', 'C', 'R', .252, .312, .340, 2, 2, 15, 7, 70, 76, 1), B('王政順', '1B', 'R', .255, .320, .380, 5, 2, 16, 8, 56, 60, 1), B('吳東融', 'LF', 'L', .258, .322, .350, 3, 9, 14, 7, 64, 64, 1)],
    bench: [B('張祖綸', 'SS', 'R', .245, .305, .320, 1, 5, 14, 6, 70, 68, 1), B('陳培硯', 'LF', 'R', .250, .312, .340, 2, 4, 15, 7, 62, 62, 1), B('陳 玉', 'C', 'R', .236, .290, .318, 1, 1, 17, 6, 66, 70, 1), BN('陳子豪','RF','R',.262,5,5,64,68), BN('郭峻偉','2B','R',.245,1,6,68,64), BN('蔣智賢','CF','L',.248,2,9,68,64)],
    sp: [P('蔣銲', 'SP', 'R', 151, 1.49, 25.5, 8.1, 218, 6.4, ['SL', 'CU', 'CH']), P('梅賽鍶', 'SP', 'R', 149, 1.79, 15.3, 4.0, 181, 6.5, ['CT', 'CH', 'CU']), P('鋼龍', 'SP', 'R', 149, 2.31, 19.3, 6.9, 140, 6.1, ['SL', 'FK', 'CU']), P('魔神龍', 'SP', 'L', 146, 2.2, 21, 7, 150, 6, ['SL', 'CH', 'CU'], 1), PN('黃暐傑','SP','R',146,4.2,16,8,['SL','CH','CU']), PN('郭郁政','SP','R',147,3.3,18,7,['SL','CH'],5.6)],
    rp: [P('陳冠偉', 'RP', 'R', 148, 2.9, 20, 7, 108, 1, ['SL', 'FK'], 1), P('林凱威', 'CL', 'R', 150, 2.4, 24, 6, 130, 1, ['SL', 'FK'], 1)]
  },
  TSG: {
    bat: [B('王博玄', 'CF', 'R', .307, .338, .357, 1, 22, 14.1, 3.9, 74, 68), B('曾子祐', 'SS', 'R', .278, .344, .346, 2, 6, 9.2, 8.6, 74, 72), B('吳念庭', '3B', 'R', .258, .348, .307, 0, 3, 9.8, 12.3, 70, 70),
      B('魔鷹', '1B', 'R', .294, .361, .517, 20, 2, 15.2, 8.2, 60, 62), B('王柏融', 'DH', 'L', .253, .304, .358, 7, 6, 20.7, 5.3, 54, 62), B('陳文杰', 'RF', 'R', .276, .331, .377, 3, 8, 11.0, 6.5, 66, 70),
      B('張肇元', 'C', 'R', .255, .320, .350, 3, 2, 14, 7, 72, 76, 1), B('戴培峰', '2B', 'R', .255, .315, .335, 1, 8, 13, 6, 70, 64, 1), B('高國麟', 'LF', 'L', .262, .325, .365, 3, 6, 14, 7, 62, 64, 1)],
    bench: [B('陳家駒', 'SS', 'R', .240, .300, .320, 1, 4, 14, 6, 68, 66, 1), B('黃梓祥', 'CF', 'L', .248, .310, .330, 1, 7, 15, 7, 66, 64, 1), B('林子崴', 'C', 'R', .232, .290, .315, 1, 1, 18, 6, 64, 68, 1), BN('董子恩','2B','R',.245,1,4,68,62), BN('李宗賢','LF','L',.250,2,6,64,64)],
    sp: [P('黃子鵬', 'SP', 'R', 147, 2.20, 13.3, 3.4, 147, 6.3, ['SL', 'CH', 'CU']), P('艾速特', 'SP', 'R', 150, 2.63, 20.4, 7.4, 123, 5.9, ['SL', 'CH', 'CU']), P('坎南', 'SP', 'R', 148, 4.2, 16, 7, 95, 5.5, ['CT', 'CH'], 1), P('魔爾曼', 'SP', 'R', 148, 3.5, 17, 7, 100, 5.5, ['SL', 'CH'], 1), PN('陳正毅','SP','R',146,4.8,15,8,['SL','CH'],5.0)],
    rp: [P('陳柏清', 'RP', 'R', 147, 2.9, 20, 7, 108, 1.1, ['SL', 'CH'], 1), P('黃群', 'RP', 'R', 148, 3.1, 19, 8, 102, 1, ['SL', 'FK'], 1), P('林詩翔', 'CL', 'R', 150, 2.7, 23, 7, 120, 1, ['SL', 'FK'], 1)]
  }
};
/* 名稱 hash → 固定的冷熱區 */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seededZone(name, con) {
  let s = hashStr(name) || 1; const rr = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const z = []; for (let i = 0; i < 9; i++) { const g = (rr() + rr() + rr() - 1.5) * 1.5; z.push(clamp(Math.round(g + (con - 60) / 40), -2, 2)); } return z;
}
function seededNoise(key, amp) { let h = hashStr(key) || 1; h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return ((h / 4294967296) + ((hashStr(key + '#') >>> 0) / 4294967296) - 1) * amp; }      // 固定的個人差異（同名同值，三角分佈）
/* ===== 能力值：內部範圍 30～99；前台一律顯示為 F～S 等級（F30-39 E40-49 D50-59 C60-69 B70-79 A80-89 S90-99） ===== */
const STAT_GAIN = 1.12;      // 能力值生成時以 50 為中心略為拉開（差距更明顯），並限制在 30～99
function ST(x) { return Math.round(Math.max(30, Math.min(99, 50 + (x - 50) * STAT_GAIN))); }
function grLetter(v) { v = Math.round(v); return v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 50 ? 'D' : v >= 40 ? 'E' : 'F'; }
function lvGr(lv) { const L = 'FEDCBAS'[Math.max(0, Math.min(6, Math.round(lv) - 1))]; return '<b class="gr g' + L + '">' + L + '</b>'; }      // 球種等級 Lv1～7 → F～S
function stuffOf(p) { if (p.stf != null) return Math.round(Math.max(30, Math.min(99, p.stf))); return Math.round(Math.max(30, Math.min(99, 60 + (p.dom || 0) * 55 + (p.kmh - 146) * 2.2 + (p.ultra ? 30 : 0)))); }      // 球威：優先使用校準後的球威能力值（stf，30～99）
function gr(v) { const L = grLetter(v); return '<b class="gr g' + L + '">' + L + '</b>'; }
/* 能力值換算（實況野球風格：50＝聯盟一般、60＝不錯、70＝主力、80＝明星、90＋＝頂級；各項彼此獨立，且都會影響比賽結果）
   巧打：打擊率＋三振率（揮棒圈大小）　力量：長打率−打擊率（ISO）＋全壘打（擊球初速）　選球：保送率−三振率＋上壘率差（辨識變化球）
   跑力：盜壘＋守位基準　得點圈：打擊技術＋固定個人特性（壘上有人時揮棒圈增減）　對左投：打擊側＋個人特性　捕球：守備＋個人特性（失誤率） */
/* ===== 打者個性化能力（球員特色）：以全聯盟成績做標準分數，再依球員類型拉開差距 =====
   ‧ 長打型（重砲）：力量高、跑速慢　‧ 速度／安打型：跑速快、力量小　‧ 守備型：守備與肩力高　‧ 巧打型：巧打高
   ‧ 每隊都會有長打、速度、守備、巧打的代表球員；每位球員都至少有一項明顯弱點（E／F）；聯盟頂尖球員會有數項 A／S */
/* ===== 能力值校準引擎（百分位 × 標準分數；野球魂式分佈）=====
   ‧ 把全聯盟球員（含板凳、國家隊）的真實成績算成各項綜合分，先排百分位、再與標準分數混合，最後對應到 30～99：
     50 前後＝聯盟一般，60＝不錯，70＝主力，80＝明星，90＋(S)＝聯盟前 2～3% 的頂尖；99 只留給傳說角色。
   ‧ S 級沒有項數上限：成績真的是聯盟頂尖（標準分數 ≥1.9）才給 S，超級球星可以多項 S；成績不夠的一律壓在 A。重砲型跑得慢、速度型力量小，保持各項彼此獨立。
   ‧ REAL_TUNE：依球員實際風格與 2026 成績做的個別微調（只列辨識度高的選手，其餘全靠成績算出）。 */
const RATE_CURVE = [[0, 31], [.04, 38], [.12, 45], [.30, 53], [.50, 59], [.68, 65], [.82, 72], [.91, 79], [.955, 85], [.978, 90], [.995, 93.5], [1, 96]];
const PIT_CURVE = [[0, 36], [.04, 43], [.12, 51], [.30, 59], [.50, 65], [.68, 70], [.82, 76], [.91, 82], [.955, 87], [.978, 91], [.995, 94], [1, 96]];      // 投手曲線：整體比打者高約 6（維持原本投打平衡），頂端同樣稀少
function curveRate(p, c) { c = c || RATE_CURVE; for (let i = 1; i < c.length; i++) { const a = c[i - 1], b = c[i]; if (p <= b[0]) return a[1] + (b[1] - a[1]) * (p - a[0]) / Math.max(1e-9, b[0] - a[0]); } return 96; }
function softTop(x) { return x > 84 ? 84 + (x - 84) * .55 : x < 40 ? 40 + (x - 40) * .6 : x; }
function pctRank(vals, v) { let lt = 0, eq = 0; for (const x of vals) { if (x < v - 1e-9) lt++; else if (Math.abs(x - v) <= 1e-9) eq++; } return (lt + eq / 2) / Math.max(1, vals.length); }
function calRate(vals, v, z, noise, curve, base) { return .6 * curveRate(pctRank(vals, v), curve) + .4 * softTop((base || 59) + 12.5 * z) + (noise || 0); }
function limitS(o, keys, zm, free) {      // S（≥90）不設項數上限：只有「該項成績真的是聯盟頂尖（標準分數 ≥1.9）」才保留 S，否則壓在 89；單項上限 97。真正的超級球星可同時有多項 S
  keys.forEach(k => { if (o[k] >= 90 && !(free && free[k] != null) && zm && zm[k] != null && zm[k] < 1.9) o[k] = 89; if (o[k] > 97) o[k] = 97; });
}
const REAL_TUNE = {      // 打者個別微調：只收「公式算出來與球員實際風格明顯不符」的幾位，其餘全由成績算出（_a＝限定打擊率範圍，避免同名的估算板凳誤套用）
  '陳傑憲': { con: 93, eye: 85, pow: 58, spd: 72, fld: 86, arm: 72 },       // 聯盟頂級安打機器＋中外野金手套：巧打 S、選球 A、長打普通
  '江坤宇': { fld: 88, arm: 80 },                                           // 金手套級游擊手：守備 A 上緣、肩力 A
  '王柏融': { con: 52, pow: 66, eye: 38 }                                   // 近年打擊率下滑、三振偏多，但長打仍在
};
const PIT_TUNE = {};      // 投手全由成績（K%、BB%、ERA+、球速）算出；需要個別調整時在此加 '姓名': { stf, ctl }
let _BLG = null;
const batSig = r => r.n + '|' + r.a + '|' + r.s + '|' + r.hr + '|' + r.sb;
function batLeague() {
  if (_BLG) return _BLG;
  const ids = ['CTB', 'UNI', 'RAK', 'FBK', 'WCD', 'TSG', 'TPE'], rows = [], seen = new Set();
  ids.forEach(id => { const T = CPBL[id]; if (!T) return; T.bat.concat(T.bench || []).forEach(r => { const k = batSig(r); if (!seen.has(k)) { seen.add(k); rows.push(r); } }); });
  const F = { a: r => r.a, iso: r => r.s - r.a, hr: r => r.hr, sb: r => r.sb, k: r => r.k, bb: r => r.bb, ob: r => r.o - r.a, f: r => r.f, ar: r => r.ar }, M = {}, S = {};
  for (const k in F) { M[k] = rows.reduce((a, r) => a + F[k](r), 0) / rows.length; S[k] = Math.sqrt(rows.reduce((a, r) => a + Math.pow(F[k](r) - M[k], 2), 0) / rows.length) || 1; }
  const z = (k, r) => (F[k](r) - M[k]) / S[k], posSpd = { CF: .5, SS: .4, '2B': .3, RF: .2, LF: 0, '3B': -.15, C: -.7, '1B': -.6, DH: -.6 };
  const raw = r => ({ con: z('a', r) * .72 - z('k', r) * .28, pow: z('iso', r) * .55 + z('hr', r) * .45, eye: z('bb', r) * .55 + z('ob', r) * .35 - z('k', r) * .1, spd: z('sb', r) * .7 + (posSpd[r.p] || 0) + seededNoise(r.n + 'spz', .35), fld: z('f', r), arm: z('ar', r) });
  const ks = ['con', 'pow', 'eye', 'spd', 'fld', 'arm'], V = {}, mu = {}, sd = {}, all = rows.map(raw);
  ks.forEach(k => { V[k] = all.map(o => o[k]); mu[k] = V[k].reduce((a, x) => a + x, 0) / V[k].length; sd[k] = Math.sqrt(V[k].reduce((a, x) => a + (x - mu[k]) * (x - mu[k]), 0) / V[k].length) || 1; });
  const ovr = q => q.con * .9 + q.pow * .9 + q.eye * .4 + q.spd * .3 + q.fld * .3, list = all.map(ovr).sort((a, b) => b - a);
  _BLG = { raw, V, mu, sd, ks, starCut: list[Math.max(0, Math.round(list.length * .09))] || 9 };
  return _BLG;
}
function batProf(r) {
  const BL = batLeague(), q = BL.raw(r), nz = (k, a) => seededNoise(r.n + k, a), o = {};
  BL.ks.forEach(k => { o[k] = calRate(BL.V[k], q[k], (q[k] - BL.mu[k]) / BL.sd[k], nz(k, 2.4)); });
  o.spd -= 3; o.fld += 3; o.arm += 4;                    // 整體平衡微調：跑力略降、守備與肩力略升（與原本全聯盟平均水準一致）
  if (o.pow >= 76) o.spd -= (o.pow - 76) * .55 + 3;       // 重砲型：身形壯、跑得慢
  if (o.spd >= 80) o.pow -= (o.spd - 80) * .45 + 2;       // 速度型：力量小
  const strong = BL.ks.filter(k => o[k] >= 84).length, weak = BL.ks.slice().sort((a, b) => o[a] - o[b])[0];
  if (strong < 2 && o[weak] > 52) o[weak] = 47 + nz('w', 4);      // 非明星至少有一項明顯弱點（E）
  const t = REAL_TUNE[r.n]; if (t && (!t._a || (r.a >= t._a[0] && r.a <= t._a[1]))) Object.assign(o, t, { _a: undefined });
  const zm = {}; BL.ks.forEach(k => { zm[k] = (q[k] - BL.mu[k]) / BL.sd[k]; });
  limitS(o, BL.ks, zm, t);
  BL.ks.forEach(k => { o[k] = Math.round(Math.max(30, Math.min(99, o[k]))); });
  return o;
}
function ovrOf(q) { return q.con * .9 + q.pow * .9 + q.eye * .4 + q.spd * .3 + q.fld * .3; }
/* 投手校準：球速 vel（絕對換算）、球威 stf（三振率＋ERA+＋球速）、控球 ctl（保送率）；球威同時決定壓制力 dom 與各球種等級 */
let _PLG = null;
function pitLeague() {
  if (_PLG) return _PLG;
  const ids = ['CTB', 'UNI', 'RAK', 'FBK', 'WCD', 'TSG', 'TPE'], rows = [], seen = new Set();
  ids.forEach(id => { const T = CPBL[id]; if (!T) return; T.sp.concat(T.rp).forEach(r => { const k = r.n + '|' + r.v + '|' + r.era + '|' + r.k + '|' + r.bb; if (!seen.has(k)) { seen.add(k); rows.push(r); } }); });
  const F = { k: r => r.k, bb: r => r.bb, ep: r => r.ep, v: r => r.v }, M = {}, S = {};
  for (const k in F) { M[k] = rows.reduce((a, r) => a + F[k](r), 0) / rows.length; S[k] = Math.sqrt(rows.reduce((a, r) => a + Math.pow(F[k](r) - M[k], 2), 0) / rows.length) || 1; }
  const z = (k, r) => (F[k](r) - M[k]) / S[k], raw = r => ({ stf: z('k', r) * .4 + z('ep', r) * .4 + z('v', r) * .2, ctl: -z('bb', r) * .8 + z('ep', r) * .2 });
  const all = rows.map(raw), ks = ['stf', 'ctl'], V = {}, mu = {}, sd = {};
  ks.forEach(k => { V[k] = all.map(o => o[k]); mu[k] = V[k].reduce((a, x) => a + x, 0) / V[k].length; sd[k] = Math.sqrt(V[k].reduce((a, x) => a + (x - mu[k]) * (x - mu[k]), 0) / V[k].length) || 1; });
  _PLG = { raw, V, mu, sd, ks };
  return _PLG;
}
function pitProf(r) {
  const PL = pitLeague(), q = PL.raw(r), nz = (k, a) => seededNoise(r.n + k, a), o = {};
  PL.ks.forEach(k => { o[k] = calRate(PL.V[k], q[k], (q[k] - PL.mu[k]) / PL.sd[k], nz('p' + k, 2.6), PIT_CURVE, 65); });
  o.vel = clamp(30 + (r.v - 130) * 2.45, 30, 99);        // 球速：130→30、140→54、146→69、150→79、153→86、156→94
  const t = PIT_TUNE[r.n]; if (t) Object.assign(o, t);
  const zm = {}; PL.ks.forEach(k => { zm[k] = (q[k] - PL.mu[k]) / PL.sd[k]; });
  limitS(o, ['stf', 'ctl', 'vel'], zm, t);
  ['stf', 'ctl', 'vel'].forEach(k => { o[k] = Math.round(Math.max(30, Math.min(99, o[k]))); });
  return o;
}
function mkBatter(r, slot, nat) {
  if (r.ultra && !r._base) {      // 傳說球員：全能力 99、擊球特別強勁、西裝造型
    const m = mkBatter(Object.assign({}, r, { ultra: false, _base: 1 }), slot, nat);
    return Object.assign(m, { ultra: true, suit: true, con: 99, pow: 99, spd: 99, eye: 99, fld: 99, arm: 99, fld0: 99, arm0: 99, cat: 99, cat0: 99, clt: 99, vsl: 99, traj: 4, bunt: 99, mood: 99, dur: 99, agg: 99, line: '傳說級・全能力 99・西裝' });
  }
  const pos = nat || r.p, pf = batProf(r), con = pf.con, pow = pf.pow, eye = pf.eye, spd = pf.spd;
  const iso = r.s - r.a;
  const traj = clamp(Math.round(1.5 + iso * 8 + (r.hr > 12 ? .5 : 0)), 1, 4);
  const fld0 = pf.fld, arm0 = pf.arm, cat0 = Math.round(clamp(fld0 + seededNoise(r.n + 'cat', 14) + (r.p === 'C' ? 4 : 0), 30, 99));
  const clt = Math.round(clamp(50 + (con - 55) * .25 + (pow - 55) * .1 + seededNoise(r.n + 'clt', 24), 30, 99));
  const vsl = Math.round(clamp((r.h === 'R' ? 53 : r.h === 'L' ? 41 : 56) + (con - 55) * .2 + seededNoise(r.n + 'vsl', 20), 30, 99));
  return {
    kind: 'B', name: r.n, num: '', pos, nat: pos, hand: r.h, con, pow, spd, eye, fld: fld0, arm: arm0, fld0, arm0, cat: cat0, cat0, clt, vsl, traj, zone: seededZone(r.n, con),
    st: { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 }, bunt: Math.round(clamp(70 - pow * .45 + spd * .4 + seededNoise(r.n + 'bnt', 16), 30, 99)), out: false, slot,
    mood: Math.round(clamp(52 + (r.a - .265) * 150 + (Math.random() - .5) * 18, 30, 80)), dur: Math.round(clamp(72 + Math.random() * 22, 55, 96)), agg: Math.round(clamp(40 + r.sb * 1.6, 25, 95)),
    line: `2027 .${String(Math.round(r.a * 1000)).padStart(3, '0')}/.${String(Math.round(r.o * 1000)).padStart(3, '0')}/.${String(Math.round(r.s * 1000)).padStart(3, '0')} ${r.hr}HR ${r.sb}SB${r.est ? '（估）' : ''}`
  };
}

/* 明星隊：由六支中職球隊的完整名單（先發、板凳、先發投手、牛棚）依能力值自動挑出最強陣容：9 個先發依守位適性與打擊能力找出最佳組合（含 DH），
   板凳補上最強的備援捕手／游擊／中外野與最強打者，牛棚也是全聯盟最菁英的投手。第一次選到明星隊時才計算（此時所有守位資料都已就緒） */
function buildAllStarData() {
  const ids = ['CTB', 'UNI', 'RAK', 'FBK', 'WCD', 'TSG'], W = { C: .55, SS: .5, CF: .48, '2B': .42, '3B': .36, RF: .32, LF: .26, '1B': .16, DH: 0 };
  const hv = m => m.con * .5 + m.pow * .45 + m.eye * .2 + m.spd * .08;
  const val = (m, pos) => { const pen = fitPenalty(m.nat, pos); return hv(m) + W[pos] * (m.fld0 * (1 - pen) + m.arm0 * (1 - pen * .6) * .5) - pen * 45; };
  const pool = new Map();
  ids.forEach(id => CPBL[id].bat.concat(CPBL[id].bench).forEach(r => { const m = mkBatter(r, 0), o = pool.get(r.n); if (!o || hv(m) > hv(o.m)) pool.set(r.n, { r, m }); }));
  const all = Array.from(pool.values());
  // 先發：從打擊最強的 9 人開始，反覆「交換守位」「換上更強的人」直到無法再進步
  const sel = all.slice().sort((a, b) => hv(b.m) - hv(a.m)).slice(0, 9), ps = POS9.slice();
  let imp = true, guard = 0;
  while (imp && guard++ < 200) {
    imp = false;
    for (let i = 0; i < 9 && !imp; i++) for (let j = i + 1; j < 9 && !imp; j++) if (val(sel[i].m, ps[j]) + val(sel[j].m, ps[i]) - val(sel[i].m, ps[i]) - val(sel[j].m, ps[j]) > .01) { [ps[i], ps[j]] = [ps[j], ps[i]]; imp = true; }
    if (imp) continue;
    for (let i = 0; i < 9 && !imp; i++) for (const q of all) { if (sel.indexOf(q) >= 0) continue; if (val(q.m, ps[i]) - val(sel[i].m, ps[i]) > .01) { sel[i] = q; imp = true; break; } }
  }
  const used = new Set(sel), bat = sel.map((o, i) => Object.assign({}, o.r, { p: ps[i] })), bench = [], rest = () => all.filter(o => !used.has(o));
  const take = list => { const o = list[0]; if (o) { used.add(o); bench.push(o.r); } };
  ['C', 'SS', 'CF'].forEach(pos => take(rest().filter(o => o.r.p === pos).sort((a, b) => val(b.m, pos) - val(a.m, pos))));
  for (let i = 0; i < 3; i++) take(rest().sort((a, b) => hv(b.m) - hv(a.m)));
  const sc = r => r.ep * .5 + r.k * 1.6 - r.bb * 2.5 + (r.v - 145) * 1.5 + (4.5 - r.era) * 8, spM = new Map();
  ids.forEach(id => CPBL[id].sp.forEach(r => { if (r.ipg >= 5 && (!spM.has(r.n) || sc(r) > sc(spM.get(r.n)))) spM.set(r.n, r); }));
  const sp = Array.from(spM.values()).sort((a, b) => sc(b) - sc(a)).slice(0, 6), spN = new Set(sp.map(r => r.n)), rpM = new Map();
  ids.forEach(id => CPBL[id].rp.concat(CPBL[id].sp).forEach(r => { if (!spN.has(r.n) && (!rpM.has(r.n) || sc(r) > sc(rpM.get(r.n)))) rpM.set(r.n, r); }));
  const rps = Array.from(rpM.values()).sort((a, b) => sc(b) - sc(a)), clR = rps.find(r => r.r === 'CL') || rps[0];
  const mids = rps.filter(r => r !== clR).slice(0, 7).map(r => Object.assign({}, r, { r: 'RP', ipg: Math.min(r.ipg, 1.3) }));
  return { bat, bench: bench.concat([SJH_BAT]), sp: sp.concat([SJH_SP]), rp: mids.concat([Object.assign({}, clR, { r: 'CL', ipg: 1 })]) };
}
/* 傳說球員：蘇家禾（只出現在明星隊；可當先發投手或指定打擊；選擇時需輸入密碼） */
const SJH = { name: '蘇家禾', pw: '0181', ok: false };
const SJH_BAT = Object.assign(B('蘇家禾', 'DH', 'R', .450, .560, 1.100, 60, 60, 5, 16, 99, 99), { ultra: true });
const SJH_SP = Object.assign(P('蘇家禾', 'SP', 'R', 170, 0.00, 42, 0, 260, 9, ['SL', 'CU', 'FK', 'SH', 'CH', 'CT', 'SK', 'TS', 'SV', 'KN']), { ultra: true });
const isSJH = r => !!(r && (r.ultra || r.name === SJH.name || r.n === SJH.name));
{ let _all = null; Object.defineProperty(CPBL, 'ALL', { enumerable: true, configurable: true, get() { return _all || (_all = buildAllStarData()); } }); }
/* 球種超過四種的投手（估算）：額外球種會出現在選球面板，電腦投手也會使用 */
const EXTRA_PS = { '布雷克': ['SL'], '鈴木駿輔': ['CT', 'CH'], '李東洺': ['FK'], '羅戈': ['CT'], '勝騎士': ['SL', 'SK'], '德保拉': ['CU'], '喬登': ['CT', 'SK'], '獅帝芬': ['FK', 'TS'], '威能帝': ['CT', 'SK'], '艾菩樂': ['SV'], '魔力藍': ['SL', 'FK'], '曾家輝': ['CU', 'CT'], '江少慶': ['CH'], '鍾允華': ['CH'] };
const PIT_LV = { SL: 0, CU: 0, FK: 0, CH: 0, CT: 0, SK: 0, SH: 0, TS: 0, SV: 0 };
function mkPitcher(r, slot) {
  if (r.ultra && !r._base) {      // 傳說球員：全球種 Lv7、變化幅度誇張、控球與體力頂級
    const p = mkPitcher(Object.assign({}, r, { ultra: false, _base: 1 }), slot);
    p.pitches = ['ST'].concat(r.ps).map(id => ({ id, lv: 7 }));
    return Object.assign(p, { ultra: true, suit: true, kmh: r.v, vel: 99, stf: 99, ctl: 99, sta: 100, mood: 99, dur: 99, dom: .6, clt: 99, lr: false, line: '傳說級・全球種 S 級・體力無限' });
  }
  const sp = r.r === 'SP';
  const pp = pitProf(r), lv = clamp(Math.round(2.1 + (r.k - 10) / 4.2 + (pp.stf - 62) / 70), 2, 6);                         // 變化球基礎等級（依三振率）：一般投手約 3~5，只有頂級才到 6~7
  const pitches = [{ id: 'ST', lv: clamp(Math.round(2.6 + (r.v - 140) / 4.2 + (pp.vel - 70) / 60), 2, 6) }];
  const xps = (EXTRA_PS[r.n] || []).filter(id => PITCHES[id] && id !== 'ST' && !r.ps.includes(id)); const allPs = r.ps.concat(xps);      // 部分投手球種超過四種：額外球種較不熟（等級低）
  allPs.forEach((id, i) => pitches.push({ id, lv: clamp(lv - (i === 0 ? 0 : 1) - (i >= 3 ? 1 : 0) - ((hashStr(r.n + id) >>> 3) % 3 === 2 ? 1 : 0), 2, 7) }));   // 第一變化球最熟，其餘較生疏
  const ctl = pp.ctl, lr = !sp && r.r !== 'CL' && r.ipg >= 1.6;
  return {
    kind: 'P', name: r.n, num: '', role: r.r, hand: r.h, kmh: r.v, vel: pp.vel, stf: pp.stf, ctl, sta: sp ? Math.round(clamp(60 + (r.ipg - 5.5) * 14, 55, 100)) : (r.r === 'CL' ? 32 : lr ? 55 : 42),
    pitches, slot: Math.random(), tilt: 0, fatigue: 0, pc: 0, er: 0, outs: 0, hA: 0, bbA: 0, kA: 0, out: false, used: false, hbp: 0,
    mood: Math.round(clamp(58 + (r.ep - 100) * .12 + (Math.random() - .5) * 14, 36, 84)), dur: Math.round(clamp(70 + Math.random() * 24, 55, 96)),
    dom: clamp(((pp.stf * .7 + pp.ctl * .3) - 60) / 62, -.35, .6), lr, clt: Math.round(clamp(50 + (r.ep - 100) * .08 + (60 - r.bb * 3 - 40) * .1 + seededNoise(r.n + 'pclt', 14), 30, 99)),
    line: `2027 ERA ${r.era.toFixed(2)} K%${r.k.toFixed(1)} BB%${r.bb.toFixed(1)}${r.est ? '（估）' : ''}`
  };
}
const POS9 = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
/* 設定球員守位：非本位會依適性（fitPenalty）折減守備範圍與傳球能力 */
function setPos(pl, pos) {
  pl.pos = pos; const pen = fitPenalty(pl.nat, pos); pl.penalty = pen;
  const sl = 1 - Math.min(.12, (pl.slump || 0) * .01);      // 失誤後的低潮：暫時小幅降低守備範圍／傳球／接球能力（隨時間慢慢恢復）
  pl.fld = Math.max(30, Math.round((pl.fld0 != null ? pl.fld0 : pl.fld) * (1 - pen) * sl)); pl.arm = Math.max(30, Math.round((pl.arm0 != null ? pl.arm0 : pl.arm) * (1 - pen * .6) * (1 - (1 - sl) * .7)));
  if (pl.cat0 != null) pl.cat = Math.max(30, Math.round(pl.cat0 * (1 - pen) * sl));
}
/* 套用玩家的賽前編成：9 名先發（棒次＋守位）＋其餘為板凳；資料不合法就退回預設 */
function applyLineupEdit(ed, raw, benchRaw) {
  const pool = raw.concat(benchRaw), by = {}; pool.forEach(p => { by[p.name] = p; });
  if (!ed.order || ed.order.length !== 9) return null;
  const ns = new Set(ed.order), ps = new Set(ed.order.map(n => ed.pos[n]));
  if (ns.size !== 9 || ps.size !== 9 || !POS9.every(p => ps.has(p)) || !ed.order.every(n => by[n])) return null;
  const lineup = ed.order.map((n, i) => { const p = by[n]; setPos(p, ed.pos[n]); p.slot = i; return p; });
  const rest = pool.filter(p => lineup.indexOf(p) < 0); rest.forEach(p => { p.slot = undefined; setPos(p, p.nat); });
  return { lineup, bench: rest };
}
/* 電腦隊：依球員能力與守位適性，自動找出最適合的先發＋守位＋棒次；每場有「手感」隨機變化，所以每次開賽的組合與先發都不同 */
function aiAutoEdit(def, cfg) {
  const D = CPBL[def.id], pool = D.bat.concat(D.bench).filter(r => !r.ultra).map(r => mkBatter(r, 0)), form = new Map(pool.map(p => [p, gauss() * 4.5]));
  const W = { C: .55, SS: .5, CF: .48, '2B': .42, '3B': .36, RF: .32, LF: .26, '1B': .16, DH: 0 };
  const val = (p, pos) => { const pen = fitPenalty(p.nat, pos), fl = p.fld0 * (1 - pen), ar = p.arm0 * (1 - pen * .6); return p.con * .5 + p.pow * .45 + p.eye * .2 + p.spd * .08 + form.get(p) + W[pos] * (fl + ar * .5) - pen * 45; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const runs = [];
  for (let k = 0; k < 10; k++) {
    const sel = shuffle(pool).slice(0, 9), ps = shuffle(POS9); let imp = true, guard = 0;
    while (imp && guard++ < 60) {
      imp = false;
      for (let i = 0; i < 9 && !imp; i++) for (let j = i + 1; j < 9 && !imp; j++) { if (val(sel[i], ps[j]) + val(sel[j], ps[i]) - val(sel[i], ps[i]) - val(sel[j], ps[j]) > .01) { [ps[i], ps[j]] = [ps[j], ps[i]]; imp = true; } }
      if (imp) continue;
      for (let i = 0; i < 9 && !imp; i++) for (const q of pool) { if (sel.indexOf(q) >= 0) continue; if (val(q, ps[i]) - val(sel[i], ps[i]) > .01) { sel[i] = q; imp = true; break; } }
    }
    runs.push({ sel, ps, cur: sel.reduce((a, p, i) => a + val(p, ps[i]), 0) });
  }
  runs.sort((a, b) => b.cur - a.cur);
  const top = runs.filter(o => o.cur >= runs[0].cur - 4), ch = top[Math.floor(Math.random() * top.length)], pm = {}; ch.sel.forEach((p, i) => { pm[p.name] = ch.ps[i]; });
  const f = p => form.get(p), lead = ch.sel.slice().sort((a, b) => (b.eye * .5 + b.spd * .6 + b.con * .5 + f(b)) - (a.eye * .5 + a.spd * .6 + a.con * .5 + f(a)))[0];
  const rest = ch.sel.filter(x => x !== lead).sort((a, b) => (b.con + b.pow * .8 + b.eye * .35 + f(b)) - (a.con + a.pow * .8 + a.eye * .35 + f(a))), t5 = rest.slice(0, 5);
  const order = [lead, t5[1], t5[0], t5[2], t5[3], t5[4]].concat(rest.slice(5));
  return { teamId: def.id, order: order.map(p => p.name), pos: pm, spIdx: cfg && cfg.ace ? 0 : Math.floor(Math.random() * Math.min(6, D.sp.length)) };
}
function buildTeam(def, cfg, side) {
  cfg = cfg || {}; const D = CPBL[def.id];
  // 打線：8 守備 + 指定打擊（中職採 DH 制）
  const raw = D.bat.map((r, i) => mkBatter(r, i));
  const ord = raw.slice().sort((a, b) => (b.con + b.pow * .8 + b.eye * .35) - (a.con + a.pow * .8 + a.eye * .35));
  const lead = raw.slice().sort((a, b) => (b.eye * .5 + b.spd * .6 + b.con * .5) - (a.eye * .5 + a.spd * .6 + a.con * .5))[0];
  const rest = ord.filter(x => x !== lead);
  const top = rest.slice(0, 5);   // 前五強打者
  const order = [lead, top[1], top[0], top[2], top[3], top[4]].concat(rest.slice(5));
  order.forEach((b, i) => { b.slot = i; });
  let bench = D.bench.filter(r => !r.ultra).map(r => mkBatter(r, undefined)); if (cfg.pn === 1) bench.length = Math.min(bench.length, 3);
  let ed = cfg.edit && cfg.edit[side] && cfg.edit[side].teamId === def.id ? cfg.edit[side] : null;
  if (cfg.side !== undefined && side !== undefined && cfg.side !== side) ed = aiAutoEdit(def, cfg);        // 非玩家操控的隊伍：交給電腦自動編成
  let lineupF = order, benchF = bench;
  if (ed) { const ap = applyLineupEdit(ed, raw, D.bench.map(r => mkBatter(r, undefined))); if (ap) { lineupF = ap.lineup; benchF = ap.bench; } }
  { const mineSide = cfg.side === undefined || side === undefined || cfg.side === side; benchF = benchF.filter(p => !p.ultra || (SJH.ok && mineSide) || lineupF.indexOf(p) >= 0); }      // 傳說球員只屬於玩家操控的隊伍，且需解鎖
  const spList = D.sp, spIdx = ed && ed.spIdx !== undefined ? ed.spIdx % spList.length : cfg.spIdx !== undefined ? cfg.spIdx % spList.length : Math.floor(Math.random() * Math.min(6, spList.length));
  const sp = mkPitcher(spList[spIdx]);
  const others = spList.filter((_, i) => i !== spIdx).map(r => Object.assign({}, r, { r: 'RP', ipg: 3 }));
  const mids = D.rp.filter(r => r.r !== 'CL').map(r => mkPitcher(r));
  const clR = D.rp.find(r => r.r === 'CL') || D.rp[D.rp.length - 1], cl = mkPitcher(clR); cl.role = 'CL';
  const extra = others.slice(0, 2).map(r => { const p = mkPitcher(Object.assign({}, r, { ipg: 3 })); p.sta = 55; p.lr = true; return p; });
  let pit = cfg.pn === 1 ? [sp, mids[0], cl] : [sp].concat(mids, extra, [cl]).filter(Boolean);
  pit.forEach(p => { p.out = false; p.used = false; p.hbp = 0; });
  return { def, id: def.id, name: def.name, short: def.short, c1: def.c1, c2: def.c2, cap: def.cap, lineup: lineupF, bench: benchF, retired: [], pitchers: pit, cur: 0, bi: 0, order: 0, inj: [], hbpTension: 0, forfeit: false, dh: true, home: def.home };
}
/* ---------------- 心情值：越高越穩定、略有加成；越低越不可控 ---------------- */
const moodOf = p => (p && p.mood != null ? p.mood : 55);
/* 投手疲勞（0=精力充沛、100=見底）：從第 1 球就開始消耗，前段緩慢、超過體力上限後急遽惡化；牽制負擔也計入 */
function fatCap(p) {      // 體力降到約 20%（疲勞 80）時的負荷球數：依「全場總局數」換算，先發約撐到半場多一點，中繼更短，終結者最短
  const ref = (G.innings || 9) * 15.5, role = p.role || 'SP';
  const frac = role === 'SP' ? clamp(.5 + ((p.sta || 65) - 65) * .004, .42, .66) : role === 'CL' ? .14 : (p.lr ? .30 : .22);
  return Math.max(9, ref * frac);
}
function pitchCost(p) {      // 每球消耗的體力負荷：狀況低迷、心情差、被打爆、守備失誤連連、壘上有人 → 掉得更快
  const mood = moodOf(p); let m = 1;
  if (mood < 55) m += (55 - mood) * .012;
  m += (p.shaky || 0) * .035 + clamp((p.er || 0) * .04, 0, .3) + clamp((((G.errs || [])[1 - G.half]) || 0) * .05, 0, .2) + clamp((p.tilt || 0) * .006, 0, .24);
  m += (G.on && (G.on[1] || G.on[2])) ? .08 : (G.on && G.on[0]) ? .04 : 0;
  return clamp(m, 1, 2.2);
}
const roleEdge = p => (p.role === 'CL' ? clamp((50 - (p.fatigue || 0)) / 50, 0, 1) * 5 : 0) - (moodOf(p) < 35 ? (35 - moodOf(p)) * .3 : 0);      // 終結者剛上場特別有威力；心情崩潰時控球額外變差
function calcFatigue(p) {
  if (p.ultra) return 0;      // 0=精力充沛、100=見底。先發：前段穩定、後段下滑；中繼：短回合型、掉得快；終結者：前段爆發、之後迅速見底
  const load = Math.max(0, (p.fl != null ? p.fl : (p.pc || 0)) + (p.pkLoad || 0)), t = load * (1 + hotK() * .07) / fatCap(p), role = p.role || 'SP';
  const ex = role === 'SP' ? 1.15 : role === 'CL' ? 1.55 : 1.3;
  const base = t < 1 ? 80 * Math.pow(t, ex) : 80 + (t - 1) * (role === 'SP' ? 55 : 75);
  return clamp(base, 0, 100);
}
const moodVol = p => clamp(1.36 - moodOf(p) * .0070, .70, 1.36);      // 隨機波動倍率
const moodBonus = p => (moodOf(p) - 50) / 50 * .045;                   // ±4.5% 能力加成
function moodFace(m) { return m >= 80 ? '😄' : m >= 62 ? '🙂' : m >= 42 ? '😐' : m >= 25 ? '😟' : '😣'; }
function moodWord(m) { return m >= 80 ? '絕佳' : m >= 62 ? '良好' : m >= 42 ? '普通' : m >= 25 ? '低落' : '崩潰邊緣'; }
function moodColor(m) { return m >= 62 ? '#7dff7d' : m >= 42 ? '#ffe14a' : m >= 25 ? '#ffa04a' : '#ff6a5a'; }
function adjustMood(p, d) { if (!p) return; p.mood = clamp(moodOf(p) + d, 0, 100); if (p.kind === 'P') p.tilt = clamp((60 - p.mood) * .7, 0, 40); }
function adjustTilt(p, d) { adjustMood(p, -d * 1.5); }
function genBatter(strength, pos, num, slot) {
  return { kind: 'B', name: '臨時替補', num: '', pos, nat: pos, hand: 'R', con: 50, pow: 40, spd: 55, eye: 50, fld: 50, arm: 55, fld0: 50, arm0: 55, traj: 2, zone: [0, 0, 0, 0, 0, 0, 0, 0, 0], st: { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 }, bunt: 60, out: false, slot, mood: 50, dur: 70, agg: 45, line: '' };
}

