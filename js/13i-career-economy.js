/* ===== 13i-career-economy.js ｜ 生涯模式：薪水／花費／體能／心情／運動設備（純邏輯，可在 Node 單獨測試） =====
   載入順序：13h 之後、14 之前。本檔不碰任何其他檔的全域；由 13e 透過 CECON.* 呼叫，狀態直接存在 SS.pro（P）上，跟著 13d 的 saveSeason() 整包存。
   所有數字都是「虛構、待調整」的起始值（單位：萬元），不是真實中職薪資。
   欄位（P = SS.pro）：money 存款、fit 體能 0～fitCap、mood 心情 0～100、gear 設備等級 0～5、shop {meal,date} 本季已用次數、econ 最近一次休賽季結算。
   設計原則：花錢只影響「訓練效果倍率（trainMult）」與體能／心情，有上限；不直接改寫比賽結果、不能買先發。 */
'use strict';
const CECON = (function () {
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const GEAR_COST = [40, 80, 140, 220, 320];      // 升到第 1～5 級的價格
  const GEAR_MAX = GEAR_COST.length;
  const ITEMS = { meal: { label: '🍱 吃一頓好的', cost: 3, limit: 6, mood: 5, fit: 6 }, date: { label: '💞 約會／放鬆一天', cost: 10, limit: 3, mood: 14, fit: 0 } };
  const LIVING = 150, BASE = 240, PERF_RATE = 7;

  const fitCap = P => cl(80 + (P.gear | 0) * 4, 0, 100);
  function ensure(P) {      // 舊存檔沒有這些欄位時補預設；已有的不動
    if (!P) return P;
    const num = (k, d, a, b) => { P[k] = typeof P[k] === 'number' && isFinite(P[k]) ? cl(P[k], a, b) : d; };
    num('money', 50, 0, 1e9); num('gear', 0, 0, GEAR_MAX); P.gear = Math.floor(P.gear); num('mood', 60, 0, 100); num('fit', 80, 0, 100); P.fit = Math.min(P.fit, fitCap(P));
    if (!P.shop || typeof P.shop !== 'object') P.shop = {}; P.shop.meal = Math.max(0, P.shop.meal | 0); P.shop.date = Math.max(0, P.shop.date | 0);
    return P;
  }
  function trainMult(P) {      // 訓練效果倍率：只乘在「正向」成長上（見 13e growth）；上下限 0.85～1.45
    ensure(P); const m = 1 + .06 * P.gear + (P.mood - 50) / 500 - (P.fit < 30 ? .15 : P.fit < 50 ? .05 : 0);
    return Math.round(cl(m, .85, 1.45) * 100) / 100;
  }
  function afterGame(P, o) {      // o：{ played, isP, d }（d＝這場表現分）；上場消耗體能、沒上場緩慢恢復；心情隨表現小幅起伏
    ensure(P); o = o || {};
    P.fit = cl(P.fit + (o.played ? -(o.isP ? 6 : 3) : 1), 0, fitCap(P));
    if (o.played) { if (o.d >= 3) P.mood = cl(P.mood + 1, 0, 100); else if (o.d <= -2) P.mood = cl(P.mood - 1, 0, 100); }
  }
  const gearCost = P => (P.gear >= GEAR_MAX ? null : GEAR_COST[P.gear]);
  function status(P) {      // 給商店畫面用
    ensure(P);
    const items = Object.keys(ITEMS).map(id => { const it = ITEMS[id], used = P.shop[id] | 0; let why = ''; if (used >= it.limit) why = '本季已達上限'; else if (P.money < it.cost) why = '存款不足'; return { id, label: it.label, cost: it.cost, used, limit: it.limit, can: !why, why, hint: `心情 +${it.mood}${it.fit ? '・體能 +' + it.fit : ''}` }; });
    const gc = gearCost(P), gwhy = gc == null ? '已達最高等級' : P.money < gc ? '存款不足' : '';
    items.push({ id: 'gear', label: gc == null ? '🏋 運動設備（最高等級）' : `🏋 升級運動設備 Lv${P.gear}→Lv${P.gear + 1}`, cost: gc == null ? 0 : gc, used: P.gear, limit: GEAR_MAX, can: !gwhy, why: gwhy, hint: '體能上限 +4・訓練效果 +6%（永久）' });
    return { money: P.money, fit: P.fit, fitCap: fitCap(P), mood: P.mood, gear: P.gear, mult: trainMult(P), items };
  }
  function buy(P, id) {
    ensure(P); const st = status(P), it = st.items.find(x => x.id === id);
    if (!it) return { ok: false, msg: '沒有這個項目' }; if (!it.can) return { ok: false, msg: it.why };
    P.money -= it.cost;
    if (id === 'gear') P.gear++; else { const d = ITEMS[id]; P.shop[id] = (P.shop[id] | 0) + 1; P.mood = cl(P.mood + d.mood, 0, 100); P.fit = cl(P.fit + d.fit, 0, fitCap(P)); }
    return { ok: true, msg: id === 'gear' ? `設備升到 Lv${P.gear}` : `${ITEMS[id].label.replace(/^\S+\s*/, '')}（心情 ${P.mood}、體能 ${P.fit}）` };
  }
  function perfScore(S) {      // 0～100；S＝一季摘要（13e 的 seasonSummary）
    S = S || {}; return Math.round(cl((S.trust || 0) * .6 + (S.starter ? 15 : 0) + Math.min(S.apps || 0, 50) / 50 * 10 + (S.qual ? 5 : 0) + (S.champ ? 10 : 0), 0, 100));
  }
  const salaryFor = (P, perf) => Math.round((BASE + perf * PERF_RATE) * (P && P.level === 'farm' ? .6 : 1) / 10) * 10;
  function settle(P, S) {      // 休賽季結算：領年薪、扣生活費、恢復體能、心情回穩、重置本季商店次數
    ensure(P); const perf = perfScore(S), salary = salaryFor(P, perf), living = LIVING;
    P.money = Math.max(0, Math.round(P.money + salary - living)); P.fit = fitCap(P); P.mood = Math.round(cl(P.mood * .5 + 30, 0, 100)); P.shop = { meal: 0, date: 0 };
    return { perf, salary, living, money: P.money };
  }
  return { ensure, trainMult, afterGame, status, buy, perfScore, salaryFor, settle, fitCap, ITEMS, GEAR_COST };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CECON;
