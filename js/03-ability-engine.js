/* 03-ability-engine.js — 能力值等級／校準引擎／mkBatter／mkPitcher／buildTeam／打線AI／心情值（原 script.js 第 192-459 行） */
'use strict';
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

