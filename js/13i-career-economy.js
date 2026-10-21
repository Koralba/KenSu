/* ===== 13i-career-economy.js ｜ 生涯模式：薪水／花費／體能／心情／運動設備（純邏輯，可在 Node 單獨測試） =====
   載入順序：13h 之後、14 之前。本檔不碰任何其他檔的全域；由 13e 透過 CECON.* 呼叫，狀態直接存在 SS.pro（P）上，跟著 13d 的 saveSeason() 整包存。
   所有數字都是「虛構、待調整」的起始值（單位：萬元），不是真實中職薪資。
   欄位（P = SS.pro）：money 存款、fit 體能 0～fitCap、mood 心情 0～100、gear 設備等級 0～5、shop {meal,date} 本季已用次數、econ 最近一次休賽季結算。
   A2 追加（合約／市場）：P.contract {team,years,left,salary,since}、P.pending（下一年生效的簽約／轉隊）、P.moves（轉隊紀錄）、P.market（休賽季市場畫面狀態）。沒有 contract 的舊存檔由 ensureContract() 補；沒有 contract 時 settle() 仍照舊用表現分數計薪。
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
    ensure(P); const perf = perfScore(S), living = LIVING; let salary = salaryFor(P, perf);
    const c = P.contract; if (c && typeof c.salary === 'number' && isFinite(c.salary)) { salary = Math.round(c.salary * (P.level === 'farm' ? .6 : 1) / 10) * 10; c.left = Math.max(0, (c.left | 0) - 1); }      // 有合約：領合約年薪（二軍 6 折），剩餘年數 −1
    P.money = Math.max(0, Math.round(P.money + salary - living)); P.fit = fitCap(P); P.mood = Math.round(cl(P.mood * .5 + 30, 0, 100)); P.shop = { meal: 0, date: 0 };
    return { perf, salary, living, money: P.money, left: c ? c.left : null };
  }

  /* ---------- A2：合約／自由球員／交易／釋出（純邏輯；rnd 可注入，Node 測試用固定亂數） ---------- */
  const SAL_FLOOR = 150, TRUST_KEEP = .85;
  const roundTen = v => Math.max(SAL_FLOOR, Math.round(v / 10) * 10);
  function ensureContract(P) {      // 舊存檔／新角色：沒有合約就補一份 2 年約，年薪依目前表現估算
    if (!P) return P; const c = P.contract;
    if (c && typeof c === 'object' && isFinite(c.salary)) { c.years = Math.max(1, c.years | 0 || 1); c.left = cl(c.left | 0, 0, c.years); if (c.team == null) c.team = P.team; return c; }
    return (P.contract = { team: P.team, years: 2, left: 2, salary: roundTen(salaryFor({}, perfScore({ trust: P.trust, starter: P.starter }))), since: P.year || 1 });
  }
  const yearsFor = perf => (perf >= 70 ? 3 : perf >= 40 ? 2 : 1);
  const roleFor = (S, perf) => (((S && S.starter) && perf >= 55) || perf >= 70 ? 'starter' : 'bench');      // 只有「實際表現夠好」才可能談到先發，不能用錢買
  function offerFor(P, S, team, rnd, kind) {      // kind：own 本隊續約（不浮動）／fa 自由市場（0.9～1.15）／low 被釋出後的低薪約（0.7～0.9、1 年、一律板凳）
    const perf = perfScore(S), r = (rnd || Math.random)(), f = kind === 'own' ? 1 : kind === 'low' ? .7 + .2 * r : .9 + .25 * r;
    return { team, years: kind === 'low' ? 1 : yearsFor(perf), salary: roundTen(salaryFor({}, perf) * f), role: kind === 'low' ? 'bench' : roleFor(S, perf), kind };
  }
  const ownOffer = (P, S) => (perfScore(S) >= 18 ? offerFor(P, S, P.team, null, 'own') : null);      // 表現太差，本隊不續約
  function pickTeams(P, n, rnd) {      // 從其他球隊（共 6 隊）隨機取 n 隊
    const pool = [0, 1, 2, 3, 4, 5].filter(i => i !== P.team), out = []; rnd = rnd || Math.random;
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]); return out;
  }
  function faOffers(P, S, rnd, released) { const n = released ? 1 + Math.floor((rnd || Math.random)() * 2) : 3; return pickTeams(P, n, rnd).map(t => offerFor(P, S, t, rnd, released ? 'low' : 'fa')); }
  function tradeTry(P, S, rnd) {      // 要求交易：成功率 30～90%（依表現）；成功給 2 個去處，失敗心情 −8
    const perf = perfScore(S), p = cl(.3 + perf / 120, .3, .9), ok = (rnd || Math.random)() < p, c = ensureContract(P);
    if (!ok) { P.mood = cl(P.mood - 8, 0, 100); return { ok: false, p }; }
    const keep = c.left > 0;      // 合約還沒到期：帶著剩餘年數與年薪轉隊；到期：重簽新約
    return { ok: true, p, offers: pickTeams(P, 2, rnd).map(t => keep ? { team: t, years: c.left, salary: c.salary, role: perf >= 70 ? 'starter' : 'bench', kind: 'trade', keep: true } : offerFor(P, S, t, rnd, 'fa')) };
  }
  function evalFate(P, S, rnd) {      // 表現差：球團可能交易或釋出（機率；第 1 年減半；二軍加重）。釋出限「合約到期」或信賴度 <20（買斷）；其餘改為交易
    const c = ensureContract(P), tr = S.trust | 0, farm = P.level === 'farm'; let p = tr < 15 ? .6 : tr < 25 ? .35 : (tr < 35 && !S.starter) ? .15 : 0;
    if (p > 0 && farm) p += .1; if ((S.year || P.year || 1) <= 1) p /= 2;
    if (p <= 0 || (rnd || Math.random)() >= p) return { kind: 'none', p };
    const rel = (rnd || Math.random)() < .4, canRel = c.left <= 0 || tr < 20;
    return { kind: rel && canRel ? 'release' : 'trade', p, why: `本季信賴度 ${tr}${S.starter ? '' : '、未能站穩先發'}${farm ? '、待在二軍' : ''}，球團決定重新安排你的去向。` };
  }
  function moveEffect(P, role) {      // 換隊：信賴度打折；先發身分只在談到 starter 時保留（信賴度至少 55），否則從板凳開始
    P.trust = Math.round(cl(P.trust, 0, 100) * TRUST_KEEP); P.level = 'first'; P.lowStreak = 0; P.farmG = 0;
    if (role === 'starter') { P.starter = true; P.trust = Math.max(P.trust, 55); } else { P.starter = false; }
  }
  function applyPending(P) {      // 13e nextYear() 在存好本季摘要之後呼叫：換隊／換約生效，合約從下一年起算
    const d = P && P.pending; if (!d) return null; const from = P.team, y = P.year || 1;
    if (d.team != null && d.team !== P.team) { P.team = d.team; moveEffect(P, d.role); (P.moves = P.moves || []).push({ year: y, from, to: d.team, how: d.how }); }
    P.contract = { team: P.team, years: d.years, left: d.years, salary: d.salary, since: y + 1 }; P.pending = null; return P.contract;
  }
  return { ensureContract, yearsFor, roleFor, offerFor, ownOffer, pickTeams, faOffers, tradeTry, evalFate, moveEffect, applyPending, ensure, trainMult, afterGame, status, buy, perfScore, salaryFor, settle, fitCap, ITEMS, GEAR_COST };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CECON;
