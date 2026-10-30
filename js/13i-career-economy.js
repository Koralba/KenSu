/* ===== 13i-career-economy.js ｜ 生涯模式：薪水／花費／體能／心情／運動設備（純邏輯，可在 Node 單獨測試） =====
   載入順序：13h 之後、14 之前。本檔不碰任何其他檔的全域；由 13e 透過 CECON.* 呼叫，狀態直接存在 SS.pro（P）上，跟著 13d 的 saveSeason() 整包存。
   所有數字都是「虛構、待調整」的起始值（單位：萬元），不是真實中職薪資。
   欄位（P = SS.pro）：money 存款、fit 體能 0～fitCap、mood 心情 0～100、gear 設備等級 0～5、shop {meal,date} 本季已用次數、econ 最近一次休賽季結算。
   A2 追加（合約／市場）：P.contract {team,years,left,salary,since}、P.pending（下一年生效的簽約／轉隊）、P.moves（轉隊紀錄）、P.market（休賽季市場畫面狀態）。沒有 contract 的舊存檔由 ensureContract() 補；沒有 contract 時 settle() 仍照舊用表現分數計薪。
   A4 追加（成長與傷病）：P.grow {tp 本季訓練點, rem 各能力小數餘額}、P.abil {能力名: 永久加成整數}、P.injury {sev,games,name,why,year}、P.injLog（傷病紀錄）。訓練不再直接加信賴度，只累積訓練點，休賽季結算（growthSettle）才轉成永久能力；套用在 13e inject 建好角色之後（applyAbil）。
   A5 追加（球種成長／請教投手前輩／訓練方向）：P.pitchLab {up 各球種已升等級, xp 升級經驗, learned 新學會的球種, mentors 已結識的虛構投手前輩好感, base 引擎給的原始球種快照}、P.grow.focus（訓練方向：能力名或 'pitch:球種id'，長期保留可隨時改）。球種等級 1～7，只在 applyAbil 套到引擎投手的 pitches[].lv；新球種從 Lv1 起、最多 6 條球種；每季每球種最多升 1 級。
   設計原則：花錢只影響「訓練效果倍率（trainMult）」與體能／心情，有上限；不直接改寫比賽結果、不能買先發。 */
'use strict';
const CECON = (function () {
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const GEAR_COST = [40, 80, 140, 220, 320];      // 升到第 1～5 級的價格
  const GEAR_MAX = GEAR_COST.length;
  const ITEMS = { meal: { label: '🍱 吃一頓好的', cost: 3, limit: 6, mood: 5, fit: 6 }, date: { label: '💞 約會／放鬆一天', cost: 10, limit: 3, mood: 14, fit: 0 } };
  const LIVING = 150, BASE = 240, PERF_RATE = 7;

  const fitCap = P => cl(80 + (P.gear | 0) * 4 + Math.max(0, (P.abil && P.abil.body) | 0), 0, 100);      // A4：永久「體能」成長（abil.body，最多 +10）也提高體能上限
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
  function gameMood(P) {      // 開賽時角色的「引擎心情」（取代原本固定的 62）：心情、體能、設備小幅影響；引擎的 moodBonus 只給 ±4.5% 能力，所以影響有上限，也不改先發身分。預設（心情60／體能80／設備0）＝62
    ensure(P); return Math.round(cl(62 + (P.mood - 60) * .45 + (P.fit - 80) * .3 + P.gear * .8, 30, 85));
  }
  function afterGame(P, o) {      // o：{ played, isP, d, two? }（d＝這場表現分；two＝{pit:是否投球}，二刀流專用）；上場消耗體能、沒上場緩慢恢復；心情隨表現小幅起伏
    ensure(P); o = o || {};
    const cost = o.two ? (o.two.pit ? 9 : 4) : (o.isP ? 6 : 3);      // 二刀流（o.two）：投＋打同場 −9、只打 −4，比單一位置（投手 −6、野手 −3）大
    P.fit = cl(P.fit + (o.played ? -cost : 1), 0, fitCap(P));
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
    P.money = Math.max(0, Math.round(P.money + salary - living)); P.fit = P.two ? Math.max(0, fitCap(P) - 8) : fitCap(P); /* 二刀流：休賽季只能恢復到上限減 8 */ P.mood = Math.round(cl(P.mood * .5 + 30, 0, 100)); P.shop = { meal: 0, date: 0 };
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
    if (injured(P)) return { kind: 'none', p: 0 };      // 受傷中（含重傷整季報銷）：不會因缺賽被球團交易／釋出
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

  /* ---------- 總選單（13m HUB）：休兵日行動（訓練／休息／約會）與交友；欄位 P.hub（隨 SS 整包存檔，舊存檔由 ensureHub 補預設） ----------
     P.hub = { year, days:{ 日期鍵(yyyymmdd): 'train'|'rest'|'date'|'coach'|'veteran'|'mate' }, trainGain, tradeAsked, tradeOffers, fr:{ coach|veteran|mate: {aff, got} } }
     days／trainGain／tradeAsked 每個新年度重置；fr（好感）跨年保留。所有數字都是起始值。花費只有時間與體能，不能買先發，也不直接改寫比賽結果。 */
  const TRAIN_CAP = 6, TRAIN_CAP_VET = 9, TRAIN_FIT = 8, REST_FIT = 12;
  const FRIENDS = { coach: { label: '總教練', mood: 4, fit: -2 }, veteran: { label: '資深前輩', mood: 4, fit: -2 }, mate: { label: '同梯好友', mood: 6, fit: -2 } };
  const FR_AFF = 6, FR_MILE = 50;
  function ensureHub(P) {
    if (!P) return P; ensure(P); const y = P.year || 1, H = (P.hub && typeof P.hub === 'object') ? P.hub : (P.hub = {});
    if (H.year !== y) { H.year = y; H.days = {}; H.trainGain = 0; H.tradeAsked = false; H.tradeOffers = null; }
    if (!H.days || typeof H.days !== 'object') H.days = {}; H.trainGain = Math.max(0, H.trainGain | 0);
    if (!H.fr || typeof H.fr !== 'object') H.fr = {};
    Object.keys(FRIENDS).forEach(k => { const f = H.fr[k] && typeof H.fr[k] === 'object' ? H.fr[k] : (H.fr[k] = {}); f.aff = cl(typeof f.aff === 'number' && isFinite(f.aff) ? f.aff : (k === 'mate' ? 20 : 10), 0, 100); f.got = !!f.got; });
    return H;
  }
  const trainCap = H => (H.fr.veteran.got ? TRAIN_CAP_VET : TRAIN_CAP);
  function hubActs(P) {      // 給 HUB 畫面用：每個行動能不能做、為什麼不行
    const H = ensureHub(P), out = [];
    const hurt = injured(P), trainWhy = hurt ? '受傷中，先復健' : P.fit < TRAIN_FIT + 2 ? '體能不足' : H.trainGain >= trainCap(H) ? '本季訓練成果已到上限' : '';
    out.push({ id: 'train', label: '🏋 專項訓練', can: !trainWhy, why: trainWhy, hint: `體能 −${TRAIN_FIT}・訓練點 +${Math.round(TP_TRAIN * trainMult(P) * 10) / 10}，休賽季轉成永久能力（本季 ${H.trainGain}/${trainCap(H)} 次）${P.grow && P.grow.focus ? '・方向：' + focusLabel(P, 'P') : ''}` });
    if (hurt) out.push({ id: 'rehab', label: '🩹 復健', can: true, why: '', hint: `體能 +4・有機會縮短傷期（剩 ${P.injury.games} 場；不保證）` });
    out.push({ id: 'rest', label: '💤 好好休息', can: true, why: '', hint: `體能 +${REST_FIT}・心情 +2` });
    const it = ITEMS.date, used = P.shop.date | 0, dwhy = used >= it.limit ? '本季約會次數已達上限' : P.money < it.cost ? '存款不足' : '';
    out.push({ id: 'date', label: '💞 約會／放鬆一天', can: !dwhy, why: dwhy, hint: `${it.cost} 萬・心情 +${it.mood}（${used}/${it.limit}）` });
    Object.keys(FRIENDS).forEach(k => out.push({ id: k, label: `🤝 找${FRIENDS[k].label}`, can: true, why: '', hint: `好感 ${H.fr[k].aff}/100・心情 +${FRIENDS[k].mood}・體能 ${FRIENDS[k].fit}` }));
    const ml = mentorList(P);      // A5：只有「投手」（已記下球種快照）才有；球種滿 6 種或前輩的招牌都學會了就不出現
    if (ml.known && !ml.full) {
      if (ml.unmet.length) out.push({ id: 'pmeet', label: '🧢 結識新的投手前輩', can: true, why: '', hint: `心情 +3・體能 −2・認識一位擅長不同球種的前輩（還有 ${ml.unmet.length} 位沒認識）` });
      ml.met.forEach(k => { const m = MENTORS[k], mt = P.pitchLab.mentors[k]; out.push({ id: 'pask:' + k, label: `🧢 向${m.label}請教${PITCH_NAME[m.pitch]}`, can: true, why: '', hint: `好感 ${mt.aff}/${m.need}（達到後每次有機會學會，從 Lv${LEARN_LV} 起步）・體能 −2` }); });
    }
    return out;
  }
  function hubDo(P, key, act, rnd) {      // 在休兵日 key 做一個行動；同一天只能一個；成功才寫入 P.hub.days
    const H = ensureHub(P); if (!key) return { ok: false, msg: '沒有選日期' };
    if (H.days[key]) return { ok: false, msg: '這天已經安排過了' };
    const a = hubActs(P).find(x => x.id === act); if (!a) return { ok: false, msg: '沒有這個行動' }; if (!a.can) return { ok: false, msg: a.why };
    let msg = '';
    if (act === 'train') { const g = Math.round(TP_TRAIN * trainMult(P) * 10) / 10, G0 = ensureGrow(P); P.fit = cl(P.fit - TRAIN_FIT, 0, fitCap(P)); G0.tp = Math.round((G0.tp + g) * 10) / 10; H.trainGain++; msg = `完成專項訓練（訓練點 +${g}，本季累計 ${G0.tp}；體能 ${P.fit}）。成果會在休賽季轉成永久能力`; }
    else if (act === 'rehab') { const r = rehab(P, null); msg = r.msg; }
    else if (act === 'rest') { P.fit = cl(P.fit + REST_FIT, 0, fitCap(P)); P.mood = cl(P.mood + 2, 0, 100); msg = `好好休息了一天（體能 ${P.fit}、心情 ${P.mood}）`; }
    else if (act === 'date') { const r = buy(P, 'date'); if (!r.ok) return r; msg = `享受了放鬆的一天（心情 ${P.mood}）`; }
    else if (act === 'pmeet') { const r = meetMentor(P, rnd); if (!r.ok) return r; P.mood = cl(P.mood + 3, 0, 100); P.fit = cl(P.fit - 2, 0, fitCap(P)); msg = r.msg; }
    else if (act.indexOf('pask:') === 0) { const r = askMentor(P, act.slice(5), rnd); if (!r.ok) return r; P.mood = cl(P.mood + 2, 0, 100); P.fit = cl(P.fit - 2, 0, fitCap(P)); msg = r.msg; }
    else { const fd = FRIENDS[act], f = H.fr[act]; f.aff = cl(f.aff + FR_AFF, 0, 100); P.mood = cl(P.mood + fd.mood, 0, 100); P.fit = cl(P.fit + fd.fit, 0, fitCap(P)); msg = `和${fd.label}相處了一天（好感 ${f.aff}）`;
      if (!f.got && f.aff >= FR_MILE) { f.got = true; if (act === 'coach') { P.trust = cl((P.trust | 0) + 3, 0, 100); msg += `。教練看見你的用心，信賴度 +3（${P.trust}）`; } else if (act === 'veteran') msg += `。前輩傳授了訓練心得：本季訓練上限提高到 ${TRAIN_CAP_VET} 次`; else { P.mood = cl(P.mood + 10, 0, 100); msg += '。好友的陪伴讓你心情大好（+10）'; } } }
    H.days[key] = act; return { ok: true, msg };
  }

  /* ---------- A4：永久能力成長（訓練點→休賽季結算）與傷病 ----------
     原則：訓練不改信賴度、不改比賽結果；成長偏細微（每項每季 ≤ +3、終身 ≤ +15，體能 ≤ +10，越高越難練，年資高成長變慢）。所有數字都是起始值。 */
  const TP_TRAIN = 3, TP_DIV = 4, ABIL_SEASON_CAP = 3, ABIL_LIFE_CAP = 15, BODY_CAP = 10;
  const AB_BAT = { con: .22, pow: .18, eye: .14, spd: .08, fld: .16, arm: .08, dur: .07, body: .07 };
  const AB_PIT = { vel: .18, stf: .26, ctl: .26, sta: .14, dur: .08, body: .08 };
  const AB_NAME = { con: '打擊準度', pow: '長打力', eye: '選球眼', spd: '速度', fld: '守備', arm: '傳球', vel: '球速', stf: '球威', ctl: '控球', sta: '投球體力', dur: '耐久', body: '體能上限' };
  function abilWeights(pos) {      // 依位置決定哪些能力會成長；二刀流＝打擊與投球各半
    const m = {}, add = (src, k) => Object.keys(src).forEach(a => { m[a] = (m[a] || 0) + src[a] * k; });
    if (pos === 'P') add(AB_PIT, 1); else if (pos === 'TWP') { add(AB_BAT, .5); add(AB_PIT, .5); } else add(AB_BAT, 1); return m;
  }
  function ensureGrow(P) {
    if (!P.grow || typeof P.grow !== 'object') P.grow = {}; const g = P.grow; g.tp = typeof g.tp === 'number' && isFinite(g.tp) ? Math.max(0, g.tp) : 0; if (!g.rem || typeof g.rem !== 'object') g.rem = {}; if (g.focus != null && typeof g.focus !== 'string') delete g.focus;
    if (!P.abil || typeof P.abil !== 'object') P.abil = {}; Object.keys(P.abil).forEach(k => { const v = P.abil[k]; P.abil[k] = typeof v === 'number' && isFinite(v) ? cl(Math.floor(v), 0, k === 'body' ? BODY_CAP : ABIL_LIFE_CAP) : 0; });
    return g;
  }
  function growthSettle(P, S, pos, opts) {      // 休賽季結算（13e settleYear 在 settle 之後呼叫、且在 hub 年度重置之前）：訓練點＋出賽量＋球隊勝率＋表現＋好感 → 永久能力
    const g = ensureGrow(P); S = S || {}; const H = P.hub && P.hub.fr ? P.hub : null, yr = S.year || P.year || 1, af = yr <= 8 ? 1 : yr <= 12 ? .7 : .4;
    const games = (S.w | 0) + (S.l | 0), pct = games ? (S.w | 0) / games : .5;
    const parts = { train: g.tp, apps: Math.min(S.apps | 0, 100) / 100 * 3, team: cl((pct - .5) * 10, 0, 2), perf: perfScore(S) / 100 * 2, friend: H ? ((H.fr.veteran && H.fr.veteran.got ? 1 : 0) + (H.fr.coach && H.fr.coach.got ? 1 : 0)) : 0 };
    const pts = parts.train + parts.apps + parts.team + parts.perf + parts.friend, units = pts / TP_DIV * af, w = abilWeights(pos), gains = {}, hurtYear = P.injury && P.injury.sev === 'severe' ? .5 : 1;      // 重傷整季：成長減半
    const fKey = focusAbil(P, w); if (fKey) Object.keys(w).forEach(k => { w[k] *= (k === fKey ? FOCUS_W : FOCUS_REST); });      // A5：訓練方向偏重——指定的能力權重 ×1.8、其餘 ×0.85
    Object.keys(w).forEach(k => {
      const life = k === 'body' ? BODY_CAP : ABIL_LIFE_CAP, cur = P.abil[k] | 0, room = life - cur; if (room <= 0) { g.rem[k] = 0; return; }
      const eff = (units * w[k] * hurtYear * (1 - cur / (life * 1.5)) + (g.rem[k] || 0)), whole = Math.floor(Math.min(eff, ABIL_SEASON_CAP, room));
      if (whole > 0) { P.abil[k] = cur + whole; gains[k] = whole; } g.rem[k] = Math.min(.99, Math.max(0, eff - whole));
    });
    let focusBonus = false;
    if (fKey && units > 0) {      // A5：指定方向另有一次額外機率（15～50%，依本季成長量；重傷年減半）多 +1，仍受每季／終身上限限制
      const rnd = (opts && opts.rnd) || Math.random, life = fKey === 'body' ? BODY_CAP : ABIL_LIFE_CAP, cur = P.abil[fKey] | 0;
      if (cur < life && (gains[fKey] | 0) < ABIL_SEASON_CAP && rnd() < cl(.15 + units * .08, .15, .5) * hurtYear) { P.abil[fKey] = cur + 1; gains[fKey] = (gains[fKey] | 0) + 1; focusBonus = true; }
    }
    const out = { pts: Math.round(pts * 10) / 10, parts, gains, af, focus: P.grow.focus || null, focusBonus };
    const base = (opts && opts.pitches) || (P.pitchLab && P.pitchLab.base); if ((pos === 'P' || pos === 'TWP') && Array.isArray(base)) out.pitchGains = pitchSettle(P, units * hurtYear, base);
    g.tp = 0; return out;
  }
  const abilTx = (gains, pitchGains) => Object.keys(gains || {}).map(k => `${AB_NAME[k] || k} +${gains[k]}`).concat(Object.keys(pitchGains || {}).map(id => `${PITCH_NAME[id] || id} Lv+${pitchGains[id]}`)).join('、') || '（這季沒有明顯進步）';
  function applyAbil(P, pl) {      // 13e inject 在 mkBatter／mkPitcher 之後、setPos 之前呼叫：把永久加成加到引擎角色物件上
    if (!P || !pl) return pl; const a = P.abil || {}, c = v => Math.round(cl(v, 30, 99));
    if (pl.kind === 'B') { ['con', 'pow', 'eye', 'spd'].forEach(k => { if (a[k]) pl[k] = c(pl[k] + a[k]); }); if (a.fld) { pl.fld = c(pl.fld + a.fld); pl.fld0 = c((pl.fld0 != null ? pl.fld0 : pl.fld) + a.fld); if (pl.cat0 != null) { pl.cat0 = c(pl.cat0 + a.fld); pl.cat = c(pl.cat + a.fld); } } if (a.arm) { pl.arm = c(pl.arm + a.arm); pl.arm0 = c((pl.arm0 != null ? pl.arm0 : pl.arm) + a.arm); } }
    else if (pl.kind === 'P') { ['vel', 'stf', 'ctl'].forEach(k => { if (a[k]) pl[k] = c(pl[k] + a[k]); }); if (a.vel) pl.kmh = (pl.kmh || 0) + Math.round(a.vel / 3); if (a.sta) pl.sta = Math.min(100, (pl.sta || 0) + a.sta); if (a.stf || a.ctl) pl.dom = cl(((pl.stf * .7 + pl.ctl * .3) - 60) / 62, -.35, .6); applyPitches(P, pl); }
    if (a.dur) pl.dur = Math.min(99, (pl.dur || 0) + a.dur); return pl;
  }
  /* ---------- A5：球種成長／請教投手前輩／訓練方向（純邏輯；rnd 可注入） ---------- */
  const PITCH_NAME = { ST: '直球', SL: '滑球', CU: '曲球', FK: '指叉球', SH: '內曲球', CH: '變速球', CT: '卡特球', SK: '伸卡球', TS: '二縫線速球', SV: '滑曲球', KN: '蝴蝶球' };
  const MAX_PITCHES = 6, PITCH_LV_MAX = 7, LEARN_LV = 1, LEARN_LV_MAX = 6, PITCH_UP_CAP = 3, PITCH_SHARE = .6, FOCUS_W = 1.8, FOCUS_REST = .85;
  const PITCH_NEED = [0, 2, 3, 4.5, 6, 8, 10];      // 球種從 Lv L 升到 L+1 需要的經驗（PITCH_NEED[L]）；越高越難
  const ASK_AFF = 8;
  const MENTORS = {      // 虛構的投手前輩（不代表任何真人）：各有一個招牌球種；好感到門檻後請教才有機會學會
    m_sl: { label: '滑球職人・阿森', pitch: 'SL', need: 40 }, m_cu: { label: '曲球老將・老周', pitch: 'CU', need: 40 }, m_fk: { label: '指叉達人・小野', pitch: 'FK', need: 45 },
    m_sh: { label: '內曲球好手・阿凱', pitch: 'SH', need: 40 }, m_ch: { label: '變速球專家・大軍', pitch: 'CH', need: 40 }, m_ct: { label: '卡特球前輩・老馬', pitch: 'CT', need: 45 },
    m_sk: { label: '伸卡球投手・阿豪', pitch: 'SK', need: 40 }, m_ts: { label: '二縫線速球投手・老陳', pitch: 'TS', need: 40 }, m_sv: { label: '滑曲球怪才・小宇', pitch: 'SV', need: 50 }, m_kn: { label: '蝴蝶球傳奇・老蔡', pitch: 'KN', need: 65 }
  };
  function ensurePitchLab(P) {
    if (!P.pitchLab || typeof P.pitchLab !== 'object') P.pitchLab = {}; const L = P.pitchLab;
    ['up', 'xp', 'learned', 'mentors'].forEach(k => { if (!L[k] || typeof L[k] !== 'object') L[k] = {}; });
    Object.keys(L.up).forEach(k => { L.up[k] = cl(Math.floor(+L.up[k] || 0), 0, 6); }); Object.keys(L.xp).forEach(k => { L.xp[k] = cl(+L.xp[k] || 0, 0, 20); });
    Object.keys(L.mentors).forEach(k => { if (!MENTORS[k]) delete L.mentors[k]; else { const m = L.mentors[k]; m.aff = cl(typeof m.aff === 'number' && isFinite(m.aff) ? m.aff : 10, 0, 100); } });
    if (L.base != null && !Array.isArray(L.base)) delete L.base; return L;
  }
  const bOf = (L, id) => (L.base || []).find(q => q.id === id);
  const ownedIds = L => { const o = (L.base || []).map(q => q.id); Object.keys(L.learned).forEach(id => { if (L.learned[id] && o.indexOf(id) < 0) o.push(id); }); return o; };
  function capUp(L, id) { if (L.learned[id] && !bOf(L, id)) return LEARN_LV_MAX - LEARN_LV; const b = bOf(L, id); return b ? Math.max(0, Math.min(PITCH_UP_CAP, PITCH_LV_MAX - b.lv)) : 0; }
  function lvOf(L, id) { const u = Math.min(L.up[id] | 0, capUp(L, id)), b = bOf(L, id); return b ? cl(b.lv + u, 1, PITCH_LV_MAX) : L.learned[id] ? cl(LEARN_LV + u, 1, LEARN_LV_MAX) : 0; }
  function notePitches(P, list) { if (!P || !Array.isArray(list)) return null; const L = ensurePitchLab(P); L.base = list.filter(q => q && PITCH_NAME[q.id] && isFinite(q.lv)).map(q => ({ id: q.id, lv: q.lv })); return L; }
  function pitchView(P) {      // 給訓練畫面：每個變化球的目前等級／可升上限／進度
    const L = ensurePitchLab(P); return ownedIds(L).filter(id => id !== 'ST').map(id => { const lv = lvOf(L, id), top = (bOf(L, id) ? bOf(L, id).lv : LEARN_LV) + capUp(L, id), need = PITCH_NEED[lv] || 0; return { id, name: PITCH_NAME[id], lv, max: Math.min(PITCH_LV_MAX, top), learned: !bOf(L, id), pct: lv >= Math.min(PITCH_LV_MAX, top) || !need ? 100 : Math.round(cl((L.xp[id] || 0) / need, 0, 1) * 100) }; });
  }
  function pitchSettle(P, pool, base) {      // 休賽季：把本季成長量的一部分分給各變化球；指定「球種方向」的拿 75%；每季每球種最多升 1 級
    const L = ensurePitchLab(P); if (base !== L.base) L.base = base.filter(q => q && PITCH_NAME[q.id]).map(q => ({ id: q.id, lv: q.lv }));
    const ids = ownedIds(L).filter(id => id !== 'ST'), gains = {}, f = P.grow && P.grow.focus, foc = f && f.indexOf('pitch:') === 0 && ids.indexOf(f.slice(6)) >= 0 ? f.slice(6) : null; if (!ids.length || !(pool > 0)) return gains;
    ids.forEach(id => {
      const others = ids.length - 1, share = foc ? (id === foc ? (others ? .75 : 1) : .25 / others) : 1 / ids.length, need = () => PITCH_NEED[lvOf(L, id)] || 0;
      L.xp[id] = (L.xp[id] || 0) + pool * PITCH_SHARE * share; const cap = capUp(L, id);
      if ((L.up[id] | 0) >= cap) { L.xp[id] = 0; return; }
      if (need() && L.xp[id] >= need()) { L.xp[id] -= need(); L.up[id] = (L.up[id] | 0) + 1; gains[id] = 1; if ((L.up[id] | 0) >= cap) L.xp[id] = 0; }
      L.xp[id] = Math.min(L.xp[id] || 0, (need() || 1) * 1.5);
    });
    return gains;
  }
  function applyPitches(P, pl) {      // 13e inject（applyAbil）：把球種等級成長與新學會的球種套到引擎投手；傳說球員（ultra）已全 Lv7，略過
    if (!pl || pl.kind !== 'P' || pl.ultra || !Array.isArray(pl.pitches)) return pl;
    const L = ensurePitchLab(P); L.base = pl.pitches.map(q => ({ id: q.id, lv: q.lv }));      // 記下引擎原本給的球種（之後的升級量都相對於它）
    pl.pitches.forEach(q => { if (q.id === 'ST') return; q.lv = cl(q.lv + Math.min(L.up[q.id] | 0, capUp(L, q.id)), 1, PITCH_LV_MAX); });
    Object.keys(L.learned).forEach(id => { if (L.learned[id] && PITCH_NAME[id] && !pl.pitches.some(q => q.id === id) && pl.pitches.length < MAX_PITCHES) pl.pitches.push({ id, lv: cl(LEARN_LV + Math.min(L.up[id] | 0, LEARN_LV_MAX - LEARN_LV), 1, LEARN_LV_MAX) }); });
    return pl;
  }
  function focusAbil(P, w) { const f = P.grow && P.grow.focus; return f && w && w[f] != null ? f : null; }
  function focusOptions(P, pos) {      // 訓練方向清單：均衡＋該位置會成長的能力＋（投手）每個變化球
    const L = ensurePitchLab(P), out = [{ key: null, label: '均衡（不特別指定）' }], w = abilWeights(pos);
    Object.keys(w).forEach(k => out.push({ key: k, label: AB_NAME[k] || k }));
    if (pos === 'P' || pos === 'TWP') pitchView(P).forEach(v => { if (v.lv < v.max) out.push({ key: 'pitch:' + v.id, label: `${v.name}（Lv${v.lv}）` }); });
    return out;
  }
  function setFocus(P, key, pos) {
    const g = ensureGrow(P); if (key == null || key === '') { delete g.focus; return { ok: true, msg: '訓練方向：均衡' }; }
    const o = focusOptions(P, pos).find(x => x.key === key); if (!o) return { ok: false, msg: '這個方向不能選' }; g.focus = key; return { ok: true, msg: `訓練方向：${o.label}（成果在休賽季結算時偏重這個方向）` };
  }
  const focusLabel = (P, pos) => { const f = P.grow && P.grow.focus; if (!f) return '均衡'; const o = focusOptions(P, pos || 'P').find(x => x.key === f) || focusOptions(P, 'CF').find(x => x.key === f); return o ? o.label : '均衡'; };
  function mentorList(P) {      // 已結識／未結識的前輩（只列招牌球種自己還沒有的）；未結識的才能再「結識」
    const L = ensurePitchLab(P), have = ownedIds(L), met = [], unmet = [];
    Object.keys(MENTORS).forEach(k => { const m = MENTORS[k]; if (have.indexOf(m.pitch) >= 0) return; (L.mentors[k] ? met : unmet).push(k); }); return { met, unmet, full: have.length >= MAX_PITCHES, known: Array.isArray(L.base) };
  }
  function meetMentor(P, rnd) {
    const L = ensurePitchLab(P), ml = mentorList(P); if (!ml.known || ml.full || !ml.unmet.length) return { ok: false, msg: '目前沒有可以結識的新投手前輩' };
    const k = ml.unmet[Math.floor((rnd || Math.random)() * ml.unmet.length) % ml.unmet.length]; L.mentors[k] = { aff: 10 };
    return { ok: true, key: k, msg: `在牛棚認識了投手前輩「${MENTORS[k].label}」，他最拿手的是${PITCH_NAME[MENTORS[k].pitch]}。多找他聊聊、請教，說不定能學到（好感 ${MENTORS[k].need} 以上有機會）` };
  }
  function askMentor(P, k, rnd) {
    const L = ensurePitchLab(P), m = MENTORS[k], ml = mentorList(P); if (!m || !L.mentors[k]) return { ok: false, msg: '還不認識這位前輩' }; if (ml.full) return { ok: false, msg: `球種已達 ${MAX_PITCHES} 種上限` };
    if (ownedIds(L).indexOf(m.pitch) >= 0) return { ok: false, msg: '你已經會這個球種了' };
    const mt = L.mentors[k]; mt.aff = cl(mt.aff + ASK_AFF, 0, 100); if (mt.aff < m.need) return { ok: true, learned: false, msg: `向${m.label}請教${PITCH_NAME[m.pitch]}（好感 ${mt.aff}／${m.need}，還需要多相處幾次）` };
    const p = cl(.25 + (mt.aff - m.need) * .01, .25, .6);
    if ((rnd || Math.random)() < p) { ensureGrow(P); L.learned[m.pitch] = true; L.up[m.pitch] = 0; L.xp[m.pitch] = 0; return { ok: true, learned: true, pitch: m.pitch, msg: `🎉 學會了${PITCH_NAME[m.pitch]}！從 Lv${LEARN_LV} 起步，要靠訓練慢慢升級（可到「訓練方向」指定練它）` }; }
    return { ok: true, learned: false, msg: `向${m.label}請教${PITCH_NAME[m.pitch]}：快抓到感覺了，但還差一點（好感 ${mt.aff}，下次再試）` };
  }
  /* 傷病：只在「出賽的比賽」之後擲骰；傷期內視同不出賽（13e 走和二軍一樣的快轉路徑）。與引擎比賽中受傷（12-systems）互相獨立。 */
  const INJ = { light: { label: '輕傷', lo: 3, hi: 10 }, mid: { label: '中度傷勢', lo: 20, hi: 40 }, severe: { label: '重傷（整季報銷）' } };
  const INJ_WHY = { P: ['手肘不適', '肩膀緊繃', '手指起水泡', '背部痠痛'], B: ['大腿後肌拉傷', '手腕扭傷', '腰部痠痛', '腳踝扭傷'] };
  const injured = P => !!(P && P.injury && (P.injury.games | 0) > 0);
  function injuryRisk(P, o) {      // 每場出賽的受傷機率：基礎 0.5%；體能低、投手、二刀流提高；設備與耐久成長降低
    ensure(P); ensureGrow(P); o = o || {}; const fm = P.fit >= 70 ? 1 : 1 + (70 - P.fit) * .012, pm = o.two ? 1.2 + (o.pit ? .2 : 0) : o.isP ? 1.4 : 1, gm = 1 - P.gear * .04 - Math.min(10, P.abil.dur | 0) * .01;
    return Math.round(cl(.005 * fm * pm * gm, .001, .05) * 10000) / 10000;
  }
  function injuryRoll(P, o, rnd) {      // o：{played,isP,two,pit,left（本季剩餘場數）}；已受傷或沒上場不擲骰。回傳新傷勢或 null
    ensure(P); if (!o || !o.played || injured(P)) return null; rnd = rnd || Math.random; if (rnd() >= injuryRisk(P, o)) return null;
    const r = rnd(), sev = r < .03 ? 'severe' : r < .25 ? 'mid' : 'light', d = INJ[sev], pit = o.isP || (o.two && o.pit), why = INJ_WHY[pit ? 'P' : 'B'][Math.floor(rnd() * 4) % 4];
    const games = sev === "severe" ? Math.max(1, o.left | 0) + 12 : d.lo + Math.floor(rnd() * (d.hi - d.lo + 1));
    P.injury = { sev, games, name: d.label, why, year: P.year || 1, total: games }; (P.injLog = P.injLog || []).push({ year: P.year || 1, sev, why, games }); if (P.injLog.length > 40) P.injLog.shift(); return P.injury;
  }
  function injuryTick(P) {      // 每經過一場（不論有沒有上場）傷期 −1；傷癒回傳訊息
    if (!injured(P)) { if (P && P.injury) P.injury = null; return null; } P.injury.games--;
    if (P.injury.games > 0) return null; const sev = P.injury.sev; P.injury = null;
    if (sev === 'severe') { ensureGrow(P); P.abil.body = Math.max(0, (P.abil.body | 0) - 1); P.abil.dur = Math.max(0, (P.abil.dur | 0) - 1); }      // 重傷留下後遺症：抵消 1 點體能／耐久成長（本來就沒有成長就不扣）
    return sev === 'severe' ? '🩹 你終於傷癒復出了。重傷留下了一點後遺症（體能與耐久的成長各 −1）。' : '🩹 傷勢痊癒，可以回到球隊了！';
  }
  function rehab(P, rnd) {      // 休兵日復健：體能 +4；輕／中傷有 65% 縮短 2 場，重傷有 50% 縮短 1 場；不保證
    ensure(P); if (!injured(P)) return { ok: false, msg: '你目前沒有傷勢' }; P.fit = cl(P.fit + 4, 0, fitCap(P));
    const sev = P.injury.sev, ok = (rnd || Math.random)() < (sev === 'severe' ? .5 : .65), cut = ok ? (sev === 'severe' ? 1 : 2) : 0; P.injury.games = Math.max(1, P.injury.games - cut);
    return { ok: true, cut, msg: cut ? `復健順利，傷期縮短 ${cut} 場（還要 ${P.injury.games} 場）` : `復健沒有明顯進展（還要 ${P.injury.games} 場），體能 +4` };
  }
  function injurySummary(P) {      // 退役回顧用：全部取自 P.injLog（沒有就是空）；severe 的 games 含「整季報銷」的估算，不當成實際缺陣場數
    const log = (P && Array.isArray(P.injLog) ? P.injLog : []).filter(x => x && INJ[x.sev]), rank = { light: 1, mid: 2, severe: 3 };
    const rows = log.map(x => ({ year: x.year | 0, sev: x.sev, label: INJ[x.sev].label, why: x.why || '', games: x.sev === 'severe' ? null : x.games | 0 }));
    const worst = rows.reduce((b, r) => (!b || rank[r.sev] > rank[b.sev] ? r : b), null); return { count: rows.length, severe: rows.filter(r => r.sev === 'severe').length, rows, worst };
  }
  function injuryYearEnd(P) {      // 換年：輕／中傷痊癒；重傷帶 12 場到下一季（不是永遠報銷）
    if (!P || !P.injury) return; if (P.injury.sev === 'severe') P.injury.games = Math.min(12, Math.max(1, P.injury.games)); else P.injury = null;
  }
  return { gameMood, ensureGrow, ensurePitchLab, notePitches, pitchView, pitchSettle, focusOptions, setFocus, focusLabel, mentorList, meetMentor, askMentor, injurySummary, MENTORS, PITCH_NAME, MAX_PITCHES, growthSettle, abilTx, applyAbil, injured, injuryRisk, injuryRoll, injuryTick, rehab, injuryYearEnd, INJ, AB_NAME, ABIL_LIFE_CAP, ensureHub, hubActs, hubDo, FRIENDS, ensureContract, yearsFor, roleFor, offerFor, ownOffer, pickTeams, faOffers, tradeTry, evalFate, moveEffect, applyPending, ensure, trainMult, afterGame, status, buy, perfScore, salaryFor, settle, fitCap, ITEMS, GEAR_COST };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CECON;
