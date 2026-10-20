/* 01-utils-field.js — 工具函式／球場幾何／球種定義（原 script.js 第 3-75 行） */
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


