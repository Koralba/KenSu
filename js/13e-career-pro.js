/* ===== 13e-career-pro.js ｜ 生涯模式 第三階段：選上中職後的職業賽季（賽程機制、板凳候補起步） =====
   載入順序：13d 與 14 之間（見 FILE_MAP.md）。入口：選秀成功畫面的「加入球隊」→ CPRO.start()；13d 的 begin() 遇到進行中的職業賽季會呼叫 CPRO.showIntro()。
   賽程（仿中職）：6 隊、每隊 120 場；每個「系列戰」固定同一對手連打 3 場（週二～四、週五～日；每兩週為 3 個系列），
     6 隊用輪轉法排出 5 輪、重複 8 個循環 → 每隊對每個對手各 24 場（主客場各 12 場）；週一固定休兵，7 月中旬明星賽停賽。
     一個月通常 15～19 場，而且常常連續好幾場面對同一支球隊。賽程由 seed 決定（存檔只記 seed），其他隊的比賽用隊伍實力模擬，累積成戰績表。
   板凳候補：新人一開始在板凳（打者＝代打／代跑；投手＝牛棚新人）。「信賴度」決定每場被教練叫上場的機率；表現好信賴度上升，達標升為先發。
     比賽中由 07 的 aiPinch()／aiManagePitcher() 開頭呼叫 CPRO.benchCall()／CPRO.bullpenCall() 讓角色登場。
   存放位置：CSEASON.core.ss().pro（跟著 13d 的賽季資料存進 localStorage 與比賽存檔）。 */
'use strict';
const CPRO = (function () {
  const K = () => CSEASON.core, SSx = () => K().ss(), PR = () => SSx().pro, prof = () => SSx().profile;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const HALF = 60;      // 上／下半季各 60 場（每隊第 1～60 場＝上半季、第 61～120 場＝下半季；120 場＝上下半季各 60 場是依 120 場總數推得，官方半季場數未逐條查證）
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const WD = ['日', '一', '二', '三', '四', '五', '六'], SEASON_START = [2027, 2, 26], ASG = [2027, 6, 9], DAY = 864e5;      // 開幕 3/26（週五）、明星賽 7/9～7/10 停賽（示意日期）
  const dkey = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

  /* ---------- 賽程產生器（純函式，可單獨測試） ---------- */
  function genSchedule(seed) {
    const r = rng(seed), pairsOf = [];      // pairsOf[round] = [[a,b],[c,d],[e,f]]
    let arr = [0, 1, 2, 3, 4, 5];
    for (let k = 0; k < 5; k++) { const ps = []; for (let i = 0; i < 3; i++) ps.push([arr[i], arr[5 - i]]); pairsOf.push(ps); arr = [arr[0], arr[5], arr[1], arr[2], arr[3], arr[4]]; }
    const series = [];      // 40 個系列，每個系列＝3 場對戰
    for (let c = 0; c < 8; c++) {
      const order = [0, 1, 2, 3, 4]; for (let i = 4; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (const ro of order) series.push(pairsOf[ro].map(([a, b]) => c % 2 === 0 ? { home: a, away: b } : { home: b, away: a }));      // 同一組對戰每個循環主客場對調
    }
    const base = new Date(SEASON_START[0], SEASON_START[1], SEASON_START[2]), games = []; let si = 0, w = 0;
    while (si < series.length) {
      const fri = new Date(base.getTime() + w * 7 * DAY), slots = [];
      if (w % 2 === 1) slots.push(new Date(fri.getTime() - 3 * DAY));      // 週二～四（每兩週一次）
      const isAsg = fri.getFullYear() === ASG[0] && fri.getMonth() === ASG[1] && fri.getDate() === ASG[2];
      if (!isAsg) slots.push(fri);      // 週五～日（明星賽週停賽）
      for (const st of slots) { if (si >= series.length) break; series[si].forEach(m => { for (let g = 0; g < 3; g++) { const d = new Date(st.getTime() + g * DAY); games.push({ date: dkey(d), y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), wd: d.getDay(), home: m.home, away: m.away, ser: si, g: g + 1 }); } }); si++; }
      w++;
    }
    games.sort((a, b) => a.date - b.date || a.ser - b.ser); games.forEach((g, i) => { g.id = i; });
    return games;
  }
  const SCHED = new Map();
  const sched = seed => { if (!SCHED.has(seed)) SCHED.set(seed, genSchedule(seed)); return SCHED.get(seed); };

  /* ---------- 其他球隊的比賽模擬（用球隊打擊／投手資料換算實力） ---------- */
  let RATE = null;
  function rates() {
    if (RATE) return RATE; const R = [];
    for (let i = 0; i < 6; i++) { const D = CPBL[TEAMS[i].id]; const ops = D.bat.reduce((a, b) => a + b.o + b.s, 0) / D.bat.length, era = D.sp.slice(0, 5).reduce((a, b) => a + b.era, 0) / Math.min(5, D.sp.length); R.push({ ops, era }); }
    const lo = R.reduce((a, b) => a + b.ops, 0) / 6, le = R.reduce((a, b) => a + b.era, 0) / 6; RATE = R.map(x => ({ off: 1 + (x.ops - lo) * 2.2, pit: 1 + (x.era - le) * .12 })); return RATE;
  }
  const pois = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
  function simGame(g) {
    const R = rates(), h = pois(4.4 * R[g.home].off * R[g.away].pit * 1.03), a = pois(4.4 * R[g.away].off * R[g.home].pit);
    if (h === a && Math.random() < .7) return Math.random() < .5 ? [h + 1, a] : [h, a + 1];      // 延長賽分出勝負；其餘維持和局
    return [h, a];
  }
  function simOthers(upTo) {      // 模擬到 upTo（含）這一天為止「不是自己球隊」的比賽
    const P = PR(), S = sched(P.seed);
    for (const g of S) { if (g.date > upTo) break; if (P.res[g.id] == null && g.home !== P.team && g.away !== P.team) P.res[g.id] = simGame(g); }
  }
  function standings() {
    const P = PR(), S = sched(P.seed), T = []; for (let i = 0; i < 6; i++) T.push({ i, w: 0, l: 0, t: 0, rs: 0, ra: 0 });
    for (const g of S) { const r = P.res[g.id]; if (!r) continue; const H = T[g.home], A = T[g.away]; H.rs += r[0]; H.ra += r[1]; A.rs += r[1]; A.ra += r[0]; if (r[0] > r[1]) { H.w++; A.l++; } else if (r[0] < r[1]) { A.w++; H.l++; } else { H.t++; A.t++; } }
    T.forEach(x => { x.pct = (x.w + x.l) ? x.w / (x.w + x.l) : 0; }); return T.sort((a, b) => b.pct - a.pct || (b.rs - b.ra) - (a.rs - a.ra));
  }
  /* ---------- 114 年（中職 36 年）賽制：上／下半季冠軍＋全年勝率 → 季後挑戰賽（5 戰 3 勝）→ 台灣大賽（7 戰 4 勝） ----------
     依據（2025 年網路報導，非官方規章原文）：①上下半季冠軍為不同隊：全年勝率較高者直接晉級台灣大賽（5 場主場優勢）；較低者與「兩個半季冠軍以外全年勝率最高」的球隊打季後挑戰賽，
       半季冠軍先拿 1 勝並有 G1、G3、G4 主場。②同一隊包辦上下半季冠軍：該隊直接晉級；全年勝率第 2 對第 3 打季後挑戰賽，第 2 名有 3 場主場（報導未提及保送 1 勝，這裡設為 0，待確認）。
     簡化（官方同勝率的排序規則未查到）：同勝率時依「得失分差、球隊編號」排序，只影響極少見的同率情況。 */
  const rank = (a, b) => b.pct - a.pct || (b.rs - b.ra) - (a.rs - a.ra) || a.i - b.i;
  function tally(h) {      // h：0 上半季／1 下半季／null 全年；回傳依名次排序的 6 隊紀錄
    const P = PR(), S = sched(P.seed), T = [], cnt = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 6; i++) T.push({ i, w: 0, l: 0, t: 0, rs: 0, ra: 0 });
    const add = (t, my, op, k) => { if (h != null && (k < HALF ? 0 : 1) !== h) return; const x = T[t]; x.rs += my; x.ra += op; if (my > op) x.w++; else if (my < op) x.l++; else x.t++; };
    for (const g of S) { const r = P.res[g.id], kh = cnt[g.home]++, ka = cnt[g.away]++; if (!r) continue; add(g.home, r[0], r[1], kh); add(g.away, r[1], r[0], ka); }
    T.forEach(x => { x.pct = (x.w + x.l) ? x.w / (x.w + x.l) : 0; }); return T.sort(rank);
  }
  function decideField(h0, h1, full) {      // 純函式：傳入上半季／下半季／全年排序後的紀錄，回傳季後賽名單
    const c0 = h0[0].i, c1 = h1[0].i, order = full.map(x => x.i);
    if (c0 === c1) { const rest = order.filter(i => i !== c0); return { champs: [c0, c1], same: true, direct: c0, ch: { a: rest[0], b: rest[1], aPre: 0 }, qualified: [c0, rest[0], rest[1]] }; }
    const hi = order.indexOf(c0) < order.indexOf(c1) ? c0 : c1, lo = hi === c0 ? c1 : c0, wc = order.find(i => i !== c0 && i !== c1);
    return { champs: [c0, c1], same: false, direct: hi, ch: { a: lo, b: wc, aPre: 1 }, qualified: [hi, lo, wc] };
  }
  const seasonOver = () => !nextGame();
  function playoffField() { simOthers(99999999); return decideField(tally(0), tally(1), tally(null)); }
  function fieldHtml(F) {
    const P = PR(), nm = i => esc(TEAMS[i].short), me = i => (i === P.team ? '（你的球隊）' : '');
    const lines = [`上半季冠軍：<b>${nm(F.champs[0])}</b>${me(F.champs[0])}　下半季冠軍：<b>${nm(F.champs[1])}</b>${me(F.champs[1])}`];
    lines.push(F.same ? `${nm(F.direct)}${me(F.direct)}<b>包辦上下半季冠軍</b>，直接晉級台灣大賽。` : `全年勝率較高的半季冠軍 <b>${nm(F.direct)}</b>${me(F.direct)} 直接晉級台灣大賽（7 戰 4 勝，5 場主場優勢）。`);
    lines.push(`季後挑戰賽（5 戰 3 勝）：<b>${nm(F.ch.a)}</b>${me(F.ch.a)}（${F.ch.aPre ? '先取 1 勝、' : ''}G1／G3／G4 主場）對 <b>${nm(F.ch.b)}</b>${me(F.ch.b)}`);
    return `<div class="task">🏆 114 年賽制（上／下半季各 ${HALF} 場）<br>${lines.join('<br>')}</div>`;
  }
  const myGames = () => sched(PR().seed).filter(g => g.home === PR().team || g.away === PR().team);
  const nextGame = () => myGames().find(g => PR().res[g.id] == null);
  const poOn = () => !!(PR().po && PR().po.active);
  const curGame = () => (poOn() ? poNextGame() : nextGame());      // 目前要打的比賽（季後賽期間＝季後賽下一場）
  const dateTx = g => `${g.m}/${g.d}（${WD[g.wd]}）`;

  /* ---------- 進入職業賽季 ---------- */
  function start() {
    const S = SSx(), d = S.draft, p = prof(); if (!d || d.undrafted) return;
    const bench = p.pos === 'TWP' ? '板凳候補（二刀流：代打／代跑／中繼）' : p.pos !== 'P' ? '板凳候補（代打／代跑）' : '牛棚候補（中繼）';
    S.pro = { active: true, team: d.teamIdx, seed: Math.floor(Math.random() * 0x7fffffff) + 1, res: [], apps: 0, trust: cl(Math.round(50 - d.overall), 18, 48), starter: false, log: [], plan: null, spTurn: 0, role: bench, done: false, two: p.pos === 'TWP' };
    K().save(); showIntro();
  }
  const FARM = { demote: 15, streak: 6, reset: 28, recall: 45, minGames: 10, tick: 5 };      // A3 二軍：板凳信賴度 <15 連續 6 場下放（信賴度改 28）；二軍每 5 場訓練加信賴度；≥45 且滿 10 場有 60% 機率召回
  const isFarm = () => PR().level === 'farm';
  function plan(g) {      // 今天教練的安排（決定後存起來，重新載入也一樣）
    const P = PR(); if (P.plan && P.plan.gid === g.id) return P.plan;
    if (sitOut()) return (P.plan = { gid: g.id, use: false, type: 'PH', inn: 9 });      // 二軍或受傷：不出賽
    const p = prof(); let use, type = 'PH', inn = rint(6, 9);
    let sp = false;      // sp：今天先發投球（P 與二刀流的輪值日）
    if (P.starter) { use = p.pos === 'P' ? (P.spTurn % 5 === 0) : true; type = 'START'; inn = 1; sp = (p.pos === 'P' || p.pos === 'TWP') && P.spTurn % 5 === 0; }      // 二刀流先發：每場都打 DH，輪值日再加先發投球
    else { use = Math.random() < cl(.2 + P.trust / 160, .2, .8); if (p.pos === 'P') type = 'RP'; else if (p.pos === 'TWP') type = Math.random() < .5 ? 'RP' : (Math.random() < .3 ? 'PR' : 'PH'); else type = Math.random() < .3 ? 'PR' : 'PH'; }
    return (P.plan = { gid: g.id, use, type, inn, sp });
  }

  /* ---------- 球隊放入角色（13d 的 inject() 在職業賽季時轉到這裡） ---------- */
  function inject(teams, cfg) {
    const P = PR(), p = prof(), t = teams[cfg.side], pl = plan(curGame()), me0 = K().myRow(p); let me = null;
    if (p.pos === 'TWP') return injectTwp(P, p, t, pl);
    if (p.pos === 'P') {
      if (P.starter && pl.use) { me = ab(mkPitcher(me0)); me.isMe = true; me.num = String(p.num); me.mood = gameMood(); t.cur = 0; t.pitchers[0] = me; }
      else if (!P.starter) { me = ab(mkPitcher(Object.assign({}, me0, { r: 'RP', ipg: 1.2 }))); me.isMe = true; me.num = String(p.num); me.mood = 60; me.role = 'RP'; me.out = false; me.used = false; t.pitchers.splice(Math.max(1, t.pitchers.length - 1), 0, me); }
    } else if (P.starter) {
      const i = t.lineup.findIndex(x => x.pos === p.pos); if (i >= 0) { const old = t.lineup[i]; me = ab(mkBatter(me0, old.slot)); me.isMe = true; me.num = String(p.num); me.nat = p.pos; me.mood = gameMood(); setPos(me, p.pos); t.lineup[i] = me; old.slot = undefined; old.out = false; t.bench.push(old); }
    } else {
      me = ab(mkBatter(me0, undefined)); me.isMe = true; me.num = String(p.num); me.nat = p.pos; me.mood = 60; me.out = false; setPos(me, p.pos); t.bench.unshift(me);
    }
    G.roleCall = P.starter ? { none: true, done: true } : (pl.use ? { type: pl.type, inn: pl.inn, done: false } : { none: true, done: true });
    G.role = { pos: p.pos }; G.career = true;
    if (CAREER.session) CAREER.session.player = me; else CAREER.session = { profile: p, player: me };
  }

  function injectTwp(P, p, t, pl) {      // 二刀流：先發＝DH 棒次每場都在，輪值日再加先發投手；板凳＝依今天的安排放「牛棚」或「板凳」其中一個身分
    const rb = K().myRow(p), rp = K().myRowPit(p); let bat = null, pit = null; t.dh = true;
    const mkB = (slot, mood) => { const b = ab(mkBatter(rb, slot)); b.isMe = true; b.num = String(p.num); b.nat = 'DH'; b.mood = mood; b.out = false; setPos(b, 'DH'); return b; };
    if (P.starter) {
      let i = t.lineup.findIndex(x => x.pos === 'DH'); if (i < 0) i = t.lineup.length - 1; const old = t.lineup[i];
      bat = mkB(old.slot, 62); t.lineup[i] = bat; old.slot = undefined; old.out = false; t.bench.push(old);
      if (pl.sp) { pit = ab(mkPitcher(rp)); pit.isMe = true; pit.num = String(p.num); pit.mood = gameMood(); t.cur = 0; t.pitchers[0] = pit; }
    } else if (pl.type === 'RP') {
      pit = ab(mkPitcher(Object.assign({}, rp, { r: 'RP', ipg: 1.2 }))); pit.isMe = true; pit.num = String(p.num); pit.mood = 60; pit.role = 'RP'; pit.out = false; pit.used = false; t.pitchers.splice(Math.max(1, t.pitchers.length - 1), 0, pit);
    } else { bat = mkB(undefined, 60); t.bench.unshift(bat); }
    G.roleCall = P.starter ? { none: true, done: true } : (pl.use ? { type: pl.type, inn: pl.inn, done: false } : { none: true, done: true });
    G.role = { pos: 'TWP', two: true }; G.career = true;
    if (CAREER.session) { CAREER.session.player = pit || bat; CAREER.session.playerBat = bat; } else CAREER.session = { profile: p, player: pit || bat, playerBat: bat };
  }

  /* ---------- 比賽中：叫板凳球員上場（07 的 aiPinch／aiManagePitcher 開頭呼叫） ---------- */
  function benchCall(side) {
    const rc = G.roleCall; if (!rc || rc.done || !G.career || side !== G.human || prof().pos === 'P' || rc.type === 'RP') return false;
    const me = K().findMeBat ? K().findMeBat() : K().findMe(), t = G.teams[side]; if (!me || me.out || t.bench.indexOf(me) < 0 || G.inning < rc.inn) return false;
    if (rc.type === 'PR' && G.inning >= G.innings) rc.type = 'PH';
    if (rc.type === 'PR') {
      const r = G.on[0]; if (!r || G.outs >= 2) return false; const old = r.pl, s2 = subInto(side, old, me); if (!s2) return false;
      r.pl = s2; r.spd = (5.6 + s2.spd * .036) * MOVEK; r.rig.limp = 0; say(`代跑！新人 <em>${s2.name}</em> 代替 ${old.name} 站上一壘`); toast('代跑上場', '#fff', '#39f');
    } else {
      const b = curBatter(); if (!b || b.slot === undefined || b.isPitcherBat) return false; const s2 = subInto(side, b, me); if (!s2) return false;
      say(`代打！新人 <em>${s2.name}</em> 代替 ${b.name} 站上打擊區`); toast('輪到你代打！', '#fff', '#39f');
    }
    rc.done = true; me.played = true; return true;
  }
  function bullpenCall(side) {
    const rc = G.roleCall; if (!rc || rc.done || !G.career || side !== G.human || (prof().pos !== 'P' && !(prof().pos === 'TWP' && rc.type === 'RP'))) return false;
    if (G.inning < rc.inn || G.outs !== 0 || G.on.some(x => x)) return false;
    const t = G.teams[side], i = t.pitchers.findIndex(x => x.isMe); if (i < 0 || t.pitchers[i].out || t.cur === i) return false;
    changePitcher(side, i, false, '新人登板'); rc.done = true; t.pitchers[i].played = true; return true;
  }

  /* ---------- 劇情事件（13h-career-story.js；沒載入或出錯時整段略過，不影響賽季） ----------
     只在 showIntro／showEnd 這種「選單畫面」才檢查（不在比賽中、不在快轉中），所以事件不會被自動模擬衝掉，快速模擬本場也一樣會走到。
     檢查點存在 PR() 裡（storyStart／storyChk／storyEnd），事件狀態存 PR().story，跟著 13d 的 saveSeason() 一起存。 */
  const friendCtx = P => { const f = P.hub && P.hub.fr; return f ? { coach: (f.coach && f.coach.aff) | 0, veteran: (f.veteran && f.veteran.aff) | 0, mate: (f.mate && f.mate.aff) | 0 } : undefined; };      // 總選單交友好感（沒有 P.hub＝不提供，交友事件不成立）
  let storyCnt = 0;      // 同一個時間點最多連續顯示 3 個事件（防呆）
  const storyCtx0 = () => { const P = PR(), last = P.log[P.log.length - 1], po = P.po, inPO = !!(po && P.field && P.field.qualified.indexOf(P.team) >= 0), c = { level: P.level === 'farm' ? 'farm' : 'first', year: P.year || 1, gameNo: P.log.length, starter: !!P.starter, apps: P.apps, trust: P.trust, lastGame: { played: !!(last && last.played) }, econ: { money: P.money || 0, fit: P.fit == null ? 80 : P.fit, mood: P.mood == null ? 60 : P.mood, gear: P.gear || 0 }, friend: friendCtx(P), team: seasonOver() ? { playoffQualified: playoffField().qualified.indexOf(P.team) >= 0 } : {} }; if (inPO) { if (po.active && !po.out && po.ser && (po.ser.a === P.team || po.ser.b === P.team)) c.po = { stage: po.ser.stage }; else if (po.done) { c.po = { stage: 'done' }; if (po.out) c.po.out = po.out; c.team.champion = po.champ === P.team; } } return c; };      // po.stage／po.out／team.champion 只在季後賽期間提供（劇情事件 po_series／po_end 用）；例行賽打完才提供 team.playoffQualified（依 114 年賽制判定）；沒打完時不提供 → 不會誤播季後賽／檢討事件
  function careerCtx() {      // 生涯累積摘要（含「已打完、尚未存進 hist」的本季；退役事件／主線事件條件用）
    const P = PR(), H = (P.hist || []).slice(); if (!P.retired && canNext()) H.push(seasonSummary());
    return { years: H.length, titles: H.filter(h => h.champ).length, playoffs: H.filter(h => h.qual).length, starterYears: H.filter(h => h.starter).length, heavy: H.filter(h => h.st && (prof().pos === 'P' ? h.st.outs >= 450 : prof().pos === 'TWP' ? (h.st.ab >= 400 || (h.st.pit && h.st.pit.outs >= 450)) : h.st.ab >= 400)).length, lowYears: H.filter(h => h.trust < 35 && !h.starter).length };
  }
  const storyCtx = () => { const c = storyCtx0(); c.career = careerCtx(); if (canNext() && c.team.champion === undefined) c.team.champion = false; return c; };      // 沒晉級時 champion＝false（讓「沒奪冠」的事件能判斷）
  const storyAdapter = () => { const t = { trust: { get: () => PR().trust, set: v => { PR().trust = v; }, min: 0, max: 100 } }; if (ECO()) t.mood = { get: () => { ecoP(); return PR().mood; }, set: v => { PR().mood = v; }, min: 0, max: 100 }; return { targets: t }; };      // 心情只在有經濟系統（13i）時提供；沒有就略過
  const storyDue = ph => { const P = PR(); return ph === 'pro_start' ? (!P.storyStart && !P.log.length) : ph === 'after_game' ? (P.log.length > 0 && P.storyChk !== P.log.length) : ph === 'season_end' ? !P.storyEnd : ph === 'po_series' ? !!(P.po && P.po.active && !P.po.out && P.po.ser && (P.po.ser.a === P.team || P.po.ser.b === P.team) && P.storyPo !== P.po.ser.stage) : ph === 'po_end' ? !!(P.po && P.po.done && !P.storyPoEnd && P.field && P.field.qualified.indexOf(P.team) >= 0) : ph === 'offseason' ? !P.storyOff : false; };
  const storyMark = ph => { const P = PR(); if (ph === 'pro_start') P.storyStart = true; else if (ph === 'after_game') P.storyChk = P.log.length; else if (ph === 'po_series') P.storyPo = P.po && P.po.ser ? P.po.ser.stage : P.storyPo; else if (ph === 'po_end') P.storyPoEnd = true; else if (ph === 'offseason') P.storyOff = true; else P.storyEnd = true; storyCnt = 0; K().save(); };
  const storyTx = t => esc(String(t).replace(/\{team\}/g, TEAMS[PR().team].name).replace(/\{name\}/g, prof().name));
  const sceneHtml = (ev, ph) => (typeof CSCENE !== 'undefined' ? CSCENE.html(ev, ph) : '');      // 場景插畫（13k-story-scenes.js；沒載入就不顯示）
  function storyGate(ph) {
    if (typeof CSTORY === 'undefined' || !storyDue(ph)) return false;
    try {
      const P = PR(), st = (P.story = CSTORY.importState(P.story)), ev = CSTORY.next(storyCtx(), ph, st);
      if (!ev || ++storyCnt > 3) { storyMark(ph); return false; }
      const cont = () => (ph === 'season_end' ? showEnd() : (ph === 'po_series' || ph === 'po_end') ? showPO() : ph === 'offseason' ? goNext() : showIntro());
      K().show(`<div class="csb"><h2>📖 ${storyTx(ev.title || ev.id)}</h2>${sceneHtml(ev, ph)}<div class="sub">${esc(prof().name)}・${roleTx()}・信賴度 ${P.trust}</div>${(ev.text || []).map(t => `<div class="task">${storyTx(t)}</div>`).join('')}<div class="btns" style="flex-direction:column;align-items:stretch">${ev.choices.map((c, i) => `<button data-c="${i}">${storyTx(c.label || c.id)}${c.hint ? `<br><small style="opacity:.7">${storyTx(c.hint)}</small>` : ''}</button>`).join('')}</div></div>`);
      document.querySelectorAll('#csDlg [data-c]').forEach(b => b.onclick = () => {
        const c = ev.choices[+b.dataset.c]; let r; try { r = CSTORY.choose(st, ev.id, c.id, storyCtx(), ph, storyAdapter()); } catch (e) { console.error(e); r = null; }
        K().save();
        if (!r || !r.ok) { storyMark(ph); return cont(); }      // 選擇失敗就當作這個時間點結束，不讓玩家卡住
        const delta = r.applied.filter(x => x.target === 'trust' && x.value).map(x => `信賴度 ${x.value > 0 ? '+' : ''}${x.value}`).join('　');
        K().show(`<div class="csb"><h2>📖 ${storyTx(ev.title || ev.id)}</h2>${sceneHtml(ev, ph)}${(r.text || []).map(t => `<div class="task">${storyTx(t)}</div>`).join('')}${delta ? `<div class="sub">${esc(delta)}（目前 ${PR().trust}）</div>` : ''}<div class="btns"><button id="stNext" class="pri">繼續</button></div></div>`);
        document.getElementById('stNext').onclick = cont;
      });
      return true;
    } catch (e) { console.error(e); try { storyMark(ph); } catch (e2) { } return false; }
  }

  /* ---------- 季後賽實際比賽（114 年賽制：季後挑戰賽 → 台灣大賽） ----------
     狀態 P.po = { active, done, stage:'ch'|'final', ser, chWinner, champ, out, hist[] }；P.poLog＝你在季後賽的出賽紀錄（不混進例行賽 P.log／apps）。
     系列賽 ser = { stage, a, b, need, wins:[a,b], pat:[各場主場隊], games:[{home,away,sc,w}], over, winner, loser }；pat 以「已分出勝負的場數」取用（和局不計、重打）。
     主客場：挑戰賽（有保送勝）a 主場 G1/G3/G4、b G2；同隊包辦時（無保送勝）a 假設 G1/G2/G5 主場（報導只說 3 場主場，順序待確認）；
     台灣大賽 7 戰 4 勝：直通隊主場 G1/G2/G5/G6/G7、挑戰賽晉級隊 G3/G4（2025 年報導：晉級隊兩場主場為第 3、4 場）。
     你的球隊不在系列賽內，或你被淘汰後，其餘場次由 simGame() 用球隊實力自動模擬（和局重抽）。 */
  const STG = { ch: '季後挑戰賽', final: '台灣大賽' };
  function simNoTie(g) { let r; do { r = simGame(g); } while (r[0] === r[1]); return r; }
  function mkSeries(stage, a, b, aPre) {
    if (stage === 'final') return { stage, a, b, need: 4, wins: [0, 0], pat: [a, a, b, b, a, a, a], games: [], over: false };
    return { stage, a, b, need: 3, wins: [aPre ? 1 : 0, 0], pat: aPre ? [a, b, a, a] : [a, a, b, b, a], games: [], over: false };
  }
  const decided = s => s.games.filter(x => x.w != null).length;
  function poNextGame() {
    const po = PR().po; if (!po || !po.ser || po.ser.over) return null; const s = po.ser, i = decided(s), home = s.pat[i]; if (home == null) return null;
    return { po: true, id: 'po-' + s.stage + '-' + (i + 1) + '-' + s.games.length, home, away: home === s.a ? s.b : s.a, no: i + 1, stage: s.stage };
  }
  function poSettle() {      // 系列賽有人先拿到勝場就結束；挑戰賽勝者進台灣大賽
    const P = PR(), po = P.po, s = po.ser; if (!s || s.over) return;
    const k = s.wins[0] >= s.need ? 0 : s.wins[1] >= s.need ? 1 : -1; if (k < 0) return;
    s.over = true; s.winner = k ? s.b : s.a; s.loser = k ? s.a : s.b; po.hist.push({ stage: s.stage, a: s.a, b: s.b, wins: s.wins.slice(), winner: s.winner, pat: s.pat.slice(), games: s.games.map(x => ({ home: x.home, away: x.away, w: x.w })) });
    if (s.loser === P.team) po.out = s.stage;
    if (s.stage === 'ch') { po.chWinner = s.winner; po.stage = 'final'; po.ser = mkSeries('final', po.F.direct, s.winner); }
    else { po.champ = s.winner; po.active = false; po.done = true; }
  }
  function poRecord(g, sc) {      // 把一場結果記進系列賽（和局不計勝場，也不佔主場順序）
    const s = PR().po.ser, w = sc[0] > sc[1] ? g.home : sc[1] > sc[0] ? g.away : null; s.games.push({ home: g.home, away: g.away, sc: sc.slice(), w });
    if (w != null) s.wins[w === s.a ? 0 : 1]++; poSettle();
  }
  function poAdvance() {      // 自動模擬不涉及你的比賽，直到輪到你或決出冠軍
    const P = PR(), po = P.po; let guard = 0;
    while (po.active && guard++ < 60) {
      const g = poNextGame(); if (!g) break;
      if ((g.home === P.team || g.away === P.team) && !po.out) break;
      poRecord(g, simNoTie(g));
    }
    K().save();
  }
  function poFinish(g, s, rec) {
    const P = PR(); P.plan = null; { const hm = g.home === P.team; rec.dec = decide(rec, hm ? s[0] : s[1], hm ? s[1] : s[0]); } rec.gid = g.id; rec.date = STG[g.stage] + ' G' + g.no; P.poLog.push(rec); poRecord(g, s); growth(rec, '季後賽'); K().save();
  }
  function poBegin() {
    const P = PR(), F = P.field || (P.field = playoffField()); if (F.qualified.indexOf(P.team) < 0) return;
    if (!P.po || (!P.po.active && !P.po.done)) { P.po = { active: true, done: false, stage: 'ch', F, ser: mkSeries('ch', F.ch.a, F.ch.b, F.ch.aPre), chWinner: null, champ: null, out: null, hist: [] }; P.poLog = []; }
    P.plan = null; showPO();
  }
  function poSummary(F) {
    const P = PR(), po = P.po, nm = i => esc(TEAMS[i].name);
    if (F.qualified.indexOf(P.team) < 0) return '本季你的球隊沒有進入季後賽。';
    if (!po) return '🎉 你的球隊打進了季後賽！';
    if (po.champ === P.team) return '🏆 <b>你的球隊是本季台灣大賽總冠軍！</b>';
    if (po.done) return `季後賽結束，總冠軍是 <b>${nm(po.champ)}</b>。你的球隊${po.out === 'ch' ? '止步於季後挑戰賽' : po.out === 'final' ? '在台灣大賽落敗' : '本季完賽'}。`;
    return '季後賽進行中。';
  }
  const serTx = s => { const nm = i => esc(TEAMS[i].short); return `${nm(s.a)} <b>${s.wins[0]}</b> : <b>${s.wins[1]}</b> ${nm(s.b)}（${s.need} 勝晉級${s.stage === 'ch' && s.wins[0] && !s.games.length ? '，' + nm(s.a) + '已先取 1 勝' : ''}）`; };
  function showPO() {
    const P = PR(), p = prof(), po = P.po; if (!po) return showEnd();
    poAdvance(); if (storyGate('po_series') || storyGate('po_end')) return;      // 劇情事件（13h）：季後賽每輪開打前／全部結束後；看完回到這裡
    const $e = id => document.getElementById(id);
    if (po.done || !po.active) {
      const rows = po.hist.map(h => `<tr><td>${STG[h.stage]}</td><td style="text-align:left">${esc(TEAMS[h.a].short)} ${h.wins[0]} : ${h.wins[1]} ${esc(TEAMS[h.b].short)}</td><td>${esc(TEAMS[h.winner].short)}</td></tr>`).join('');
      K().show(`<div class="csb"><h2>🏆 季後賽結束</h2><div class="task">${poSummary(P.field)}</div><table><tr><th>輪次</th><th>結果</th><th>晉級／奪冠</th></tr>${rows}</table>${histHtml()}<div class="btns">${nextBtn()}<button id="cpHome">返回主畫面</button></div></div>`);
      bindNext();
      $e('cpHome').onclick = () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; }; return;
    }
    const g = poNextGame(), s = po.ser, meHome = g.home === P.team, opp = TEAMS[meHome ? g.away : g.home], my = TEAMS[P.team], pl = plan(g);
    const tx = P.starter ? (p.pos === 'TWP' ? (pl.sp ? '今天輪到你<b>先發登板</b>，同時<b>打 DH</b>！' : '今天不是輪值日：你只打 <b>DH</b>，不投球。') : pl.use ? (p.pos === 'P' ? '今天輪到你<b>先發登板</b>！' : '今天你是<b>先發球員</b>！') : '今天不是你的輪值日，在牛棚待命。') : (pl.use ? '教練今天<b>有機會用你</b>：待命，被叫到就要上場！' : '今天看起來<b>只是待命</b>，不太會輪到你。');
    K().show(`<div class="csb"><h2>🏆 ${STG[g.stage]}・第 ${g.no} 戰</h2><div class="sub">${esc(p.name)} #${p.num}・${esc(p.pos === 'TWP' ? '二刀流' : p.pos)}　｜　${my.name}・${roleTx()}　｜　信賴度 ${P.trust}</div>
<div class="vs"><div class="tm" style="background:linear-gradient(135deg,${meHome ? my.c1 : opp.c1},#0006);color:#fff">${esc((meHome ? opp : my).short)}<br><small>客</small></div><span>＠</span><div class="tm" style="background:linear-gradient(135deg,${meHome ? my.c1 : opp.c1},#0006);color:#fff">${esc((meHome ? my : opp).short)}<br><small>主</small></div></div>
<div class="sub" style="text-align:center">${serTx(s)}</div><div class="task">📋 ${tx}<br><small>季後賽每場都要分出勝負（和局不計、重打）。</small></div>
<div class="btns"><button id="cpHome">返回主畫面</button><button id="poSim"${sitOut() ? ' class="pri"' : ''}>⏭ 直接出結果</button>${sitOut() ? '' : '<button id="poGoW">👁 全程觀看</button><button id="poGo" class="pri">⏩ 自動模擬（快轉到我上場）</button>'}</div></div>`);
    $e('cpHome').onclick = () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
    $e('poSim').onclick = () => quick(g); if (!sitOut()) { $e('poGo').onclick = () => { AUTOSIM.arm(true); launch(g); }; $e('poGoW').onclick = () => { AUTOSIM.arm(false); launch(g); }; }
  }

  /* ---------- 經濟（13i-career-economy.js；沒載入時整段略過）：薪水／存款／體能／心情／設備、商店畫面 ---------- */
  const ECO = () => (typeof CECON !== 'undefined' ? CECON : null);
  const gameMood = () => { const E = ecoP(); return E && E.gameMood ? E.gameMood(PR()) : 62; };      // 開賽心情：由體能／心情／設備算出（沒有 13i 就是原本的 62）
  const ecoP = () => { const E = ECO(); if (E) { E.ensure(PR()); if (E.ensureContract) E.ensureContract(PR()); } return E; };
  const ab = o => { const E = ECO(); return E && E.applyAbil ? E.applyAbil(PR(), o) : o; };      // A4：把永久能力成長套到引擎角色上（mkBatter／mkPitcher 之後、setPos 之前）
  function basePitches() {      // A5：投手（含二刀流）目前引擎給的原始球種［{id,lv}］；球種成長與「請教前輩」都相對於它。打者回 null
    const p = prof(); if (p.pos !== 'P' && p.pos !== 'TWP') return null;
    try { const pl = mkPitcher(p.pos === 'TWP' ? K().myRowPit(p) : K().myRow(p)); return pl && Array.isArray(pl.pitches) ? pl.pitches.map(q => ({ id: q.id, lv: q.lv })) : null; } catch (e) { return null; }
  }
  const hurt = () => { const E = ECO(); return !!(E && E.injured && E.injured(PR())); };      // A4：受傷中＝不出賽（和二軍走同一條快轉路徑）
  const sitOut = () => isFarm() || hurt();
  const addMsg = m => { const P = PR(); P.farmMsg = (P.farmMsg ? P.farmMsg + '<br>' : '') + m; };
  function settleYear() {
    const E = ecoP(), P = PR(); if (!E) return null; if (P.econ && P.econ.settled === (P.year || 1)) return P.econ;
    const S0 = seasonSummary(); P.econ = Object.assign({ settled: P.year || 1 }, E.settle(P, S0)); if (E.growthSettle) P.econ.growth = E.growthSettle(P, S0, prof().pos, { pitches: basePitches() }); K().save(); return P.econ;      // 永久能力成長在 hub 年度重置之前結算（訓練點存在 P.grow，不在每年重置的 P.hub）
  }
  function showShop(back, off, msg) {      // back：離開商店後回哪裡（賽季中）；off＝休賽季版（含結算與「進入下一年」）
    const E = ecoP(), P = PR(); if (!E) return off ? nextYear() : back();
    const st = E.status(P), ec = P.econ, $e = id => document.getElementById(id);
    const HOW = { resign: '續約', fa: '自由球員簽約', trade: '交易', release: '被釋出後簽約' }, pd = off && P.pending, head = (off && ec ? `<div class="task">📊 第 ${ec.settled} 年結算：表現分數 <b>${ec.perf}</b>　年薪 <b>${ec.salary}</b> 萬　生活開銷 −${ec.living} 萬</div>` : '') + (off && ec && ec.growth ? `<div class="task">📈 本季成長（訓練、出賽、球隊戰績、交友）：<b>${esc(E.abilTx(ec.growth.gains, ec.growth.pitchGains))}</b><br><small>成長是永久的，但偏細微：每項每季最多 +3，越高越難練。</small></div>` : '') + (pd ? `<div class="task">📑 下一年：<b>${esc(TEAMS[pd.team].name)}</b>（${HOW[pd.how] || ''}・${pd.years} 年約・年薪 ${pd.salary} 萬${pd.team !== P.team ? '・' + (pd.role === 'starter' ? '以先發身分加入' : '從板凳開始') : ''}）</div>` : (off && P.contract ? `<div class="task">📑 合約：${esc(TEAMS[P.contract.team].short)}・剩 ${P.contract.left} 年・年薪 ${P.contract.salary} 萬</div>` : ''));
    K().show(`<div class="csb"><h2>🛍 ${off ? '休賽季' : ''}商店</h2><div class="sub">💰 存款 <b>${st.money}</b> 萬　｜　體能 ${st.fit}/${st.fitCap}　心情 ${st.mood}　設備 Lv${st.gear}　｜　訓練效果 ×${st.mult}</div>${head}${msg ? `<div class="task" id="ecMsg">${esc(msg)}</div>` : ''}<div class="btns" style="flex-direction:column;align-items:stretch">${st.items.map(it => `<button id="ec_${it.id}"${it.can ? '' : ' disabled'}>${esc(it.label)}　${it.cost ? it.cost + ' 萬' : ''}<br><small style="opacity:.7">${esc(it.hint)}${it.limit && it.id !== 'gear' ? `（${it.used}/${it.limit}）` : ''}${it.why ? '・' + esc(it.why) : ''}</small></button>`).join('')}</div><div class="btns">${off ? `<button id="ecNext" class="pri">▶ 進入第 ${(P.year || 1) + 1} 年</button>` : '<button id="ecBack" class="pri">返回</button>'}</div></div>`);
    st.items.forEach(it => { const b = $e('ec_' + it.id); if (b) b.onclick = () => { const r = E.buy(P, it.id); K().save(); showShop(back, off, r.msg); }; });
    if (off) $e('ecNext').onclick = nextYear; else $e('ecBack').onclick = back;
  }


  /* ---------- A2：休賽季市場（合約續約／自由球員／交易／被釋出）；狀態存 P.market（stage：stay／expiry／fa／tradePick／traded／done），選定後存 P.pending，在 nextYear() 才生效 ---------- */
  const offerTx = o => `${esc(TEAMS[o.team].name)}　${o.years} 年約・年薪 <b>${o.salary}</b> 萬・${o.role === 'starter' ? '以先發身分加入' : '從板凳開始'}${o.keep ? '（沿用現有合約）' : ''}`;
  function showMarket() {
    const E = ecoP(), P = PR(); if (!E || !E.evalFate) return showShop(null, true);
    const y = P.year || 1, S = seasonSummary(), perf = E.perfScore(S), c = P.contract, $e = id => document.getElementById(id);
    let M = P.market; if (!M || M.year !== y) M = P.market = { year: y, stage: null, tried: false };
    if (!M.stage && P.pending) { M.stage = 'done'; K().save(); }      // 賽季中已經在總選單談妥交易／簽約：不再進入休賽季市場
    if (M.stage === 'done') return showShop(null, true);
    if (!M.stage) {
      const f = E.evalFate(P, S); M.why = f.why || '';
      if (f.kind === 'release') { M.stage = 'fa'; M.released = true; M.offers = E.faOffers(P, S, null, true); }
      else if (f.kind === 'trade') { const t = E.pickTeams(P, 1)[0], keep = c.left > 0, o = keep ? { team: t, years: c.left, salary: c.salary, role: 'bench', kind: 'trade', keep: true } : E.offerFor(P, S, t, null, 'fa'); o.role = 'bench'; M.stage = 'traded'; M.offers = [o]; }
      else if (c.left <= 0) { M.stage = 'expiry'; M.own = E.ownOffer(P, S); }
      else M.stage = 'stay';
      K().save();
    }
    const go = (o, how) => { P.pending = { team: o.team, years: o.years, salary: o.salary, role: o.role, how }; M.stage = 'done'; K().save(); showShop(null, true); };
    const head = `<div class="sub">📑 現有合約：${esc(TEAMS[c.team == null ? P.team : c.team].short)}・剩 ${c.left} 年・年薪 ${c.salary} 萬　｜　本季表現分數 ${perf}　信賴度 ${P.trust}${isFarm() ? '　（二軍）' : ''}</div>`;
    let body = '', btns = [];
    const msg = M.msg ? `<div class="task">${esc(M.msg)}</div>` : '';
    if (M.stage === 'traded') { body = `<div class="task">🔁 <b>你被交易了。</b>${esc(M.why)}<br>去向：${offerTx(M.offers[0])}</div>`; btns = [{ id: 'mk0', t: '接受，前往新球隊', pri: 1, f: () => go(M.offers[0], 'trade') }]; }
    else if (M.stage === 'fa') {
      body = `<div class="task">${M.released ? `✂️ <b>球團決定不再與你續約，把你放到自由市場。</b>${esc(M.why)}<br>只有少數球隊願意給機會（低薪、1 年約、從板凳開始）：` : '🕊 <b>自由球員市場</b>：三支球隊開出了條件：'}</div>`;
      btns = M.offers.map((o, i) => ({ id: 'mk' + i, t: offerTx(o), f: () => go(o, M.released ? 'release' : 'fa') }));
      if (!M.released && M.own) btns.push({ id: 'mkBack', t: '↩ 回頭跟本隊談：' + offerTx(M.own), f: () => go(M.own, 'resign') });
    } else if (M.stage === 'tradePick') {
      body = `<div class="task">🔁 球團同意了你的交易要求，有兩個去處：</div>`; btns = M.offers.map((o, i) => ({ id: 'mk' + i, t: offerTx(o), f: () => go(o, 'trade') })); btns.push({ id: 'mkCancel', t: '↩ 改變主意，留在原球隊', f: () => { M.stage = M.prev; M.offers = null; K().save(); showMarket(); } });
    } else if (M.stage === 'expiry') {
      body = `<div class="task">📝 <b>合約到期。</b>${M.own ? '本隊願意續約：' + offerTx(M.own) : '本隊評估後<b>不打算續約</b>（本季表現不足），你只能到自由市場或要求交易。'}</div>`;
      if (M.own) btns.push({ id: 'mkOwn', t: '✍ 續約：' + offerTx(M.own), pri: 1, f: () => go(M.own, 'resign') });
      btns.push({ id: 'mkFA', t: '🕊 成為自由球員（看其他球隊的報價）', f: () => { M.stage = 'fa'; M.offers = E.faOffers(P, S, null, false); K().save(); showMarket(); } });
    } else { body = `<div class="task">合約還有 <b>${c.left}</b> 年，今年不需要簽約。你可以安心留隊，或向球團<b>要求交易</b>。</div>`; btns.push({ id: 'mkStay', t: '▶ 留在球隊（繼續履行合約）', pri: 1, f: () => { M.stage = 'done'; K().save(); showShop(null, true); } }); }
    if ((M.stage === 'stay' || M.stage === 'expiry') && !M.tried) btns.push({ id: 'mkTrade', t: '🔁 要求交易（成功率依表現；失敗心情 −8）', f: () => { const r = E.tradeTry(P, S); M.tried = true; if (r.ok) { M.prev = M.stage; M.stage = 'tradePick'; M.offers = r.offers; M.msg = ''; } else M.msg = '球團婉拒了你的交易要求，心情 −8。'; K().save(); showMarket(); } });
    K().show(`<div class="csb"><h2>📑 休賽季：合約與去留</h2>${head}${msg}${body}<div class="btns" style="flex-direction:column;align-items:stretch">${btns.map(b => `<button id="${b.id}"${b.pri ? ' class="pri"' : ''}>${b.t}</button>`).join('')}</div></div>`);
    btns.forEach(b => { const e = $e(b.id); if (e) e.onclick = b.f; });
  }

  /* ---------- 多年度：續約 → 下一個球季（同一支球隊；重置賽程／出場／季後賽，保留信賴度、先發身分、劇情狀態，並把本季摘要存進 P.hist） ---------- */
  function seasonSummary() { const o = seasonSummary0(); o.aw = awardsFor(o); return o; }
  function seasonSummary0() {
    const P = PR(), T = standings(), row = T.find(x => x.i === P.team) || {}, po = P.po, q = !!(P.field && P.field.qualified.indexOf(P.team) >= 0);
    return { year: P.year || 1, team: P.team, w: row.w || 0, l: row.l || 0, t: row.t || 0, rank: T.findIndex(x => x.i === P.team) + 1, apps: P.apps, starter: !!P.starter, trust: P.trust, qual: q, champ: !!(po && po.champ === P.team), out: (po && po.out) || null, st: statSum(), pst: statSum(P.poLog) };
  }
  const STK = ['ab', 'h', 'hr', 'rbi', 'bb', 'k', 'e', 'outs', 'r', 'hA'];      // r＝投手自責分（13d buildRec 的 me.er）
  const PITK = ['outs', 'r', 'hA', 'k', 'bb'], zeroPit = () => ({ g: 0, w: 0, l: 0, sv: 0, outs: 0, r: 0, hA: 0, k: 0, bb: 0 });
  function statSum(LG) {      // 例行賽（或季後賽 poLog）累積成績：STK 加上 g（出場）、w／l／sv（簡化推定的勝敗救，見 decide）
    const o = { g: 0, w: 0, l: 0, sv: 0 }; STK.forEach(k => { o[k] = 0; }); const two = prof().pos === 'TWP'; if (two) o.pit = zeroPit();      // 二刀流：頂層＝打擊，o.pit＝投球（勝敗救也在 o.pit）
    (LG || PR().log || []).forEach(x => { if (!x || !x.played) return; o.g++; STK.forEach(k => { o[k] += +x[k] || 0; });
      if (two) { if (x.pit && x.pit.played) { o.pit.g++; PITK.forEach(k => { o.pit[k] += +x.pit[k] || 0; }); if (x.dec === 'W') o.pit.w++; else if (x.dec === 'L') o.pit.l++; else if (x.dec === 'S') o.pit.sv++; } }
      else if (x.dec === 'W') o.w++; else if (x.dec === 'L') o.l++; else if (x.dec === 'S') o.sv++; }); return o;
  }
  function decide(rec, my, op) {      // 投手勝敗救「簡化推定」（引擎沒有記錄官方決勝投手）：先發型（≥5 局）球隊贏＝勝、輸且自責≥3＝敗；後援贏 1 分＝勝、贏 2～3 分且無自責＝救援、輸且有自責且差 ≤2＝敗
    if (!rec || !rec.played) return ''; const pos = prof().pos; let outs, er;      // 二刀流：只看 rec.pit（投球那一份）
    if (pos === 'P') { outs = rec.outs | 0; er = rec.r | 0; } else if (pos === 'TWP' && rec.pit && rec.pit.played) { outs = rec.pit.outs | 0; er = rec.pit.r | 0; } else return ''; const mg = my - op;
    if (outs >= 15) return mg > 0 ? 'W' : (mg < 0 && er >= 3 ? 'L' : 'ND');
    if (mg > 0 && er === 0 && outs >= 3) return mg === 1 ? 'W' : mg <= 3 ? 'S' : 'ND';
    if (mg < 0 && er >= 1 && outs >= 3 && -mg <= 2) return 'L'; return 'ND';
  }
  const fmtAvg = (h, ab) => (ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '—'), fmtEra = (er, o) => (o > 0 ? (er * 27 / o).toFixed(2) : '—'), fmtIp = o => (Math.floor(o / 3) + (o % 3) / 10).toFixed(1);
  function awardsFor(sm) {      // 球團年度表彰：只用個人成績門檻判定（聯盟沒有其他球員的個人數據，所以不是聯盟投票獎項）；不保證每年都有
    const p = prof(), st = sm.st || {}, a = [], isP = p.pos === 'P', two = p.pos === 'TWP', pt = two ? (st.pit || zeroPit()) : st, prev = (PR().hist || []).slice(-1)[0];
    if (sm.champ) a.push('🏆 台灣大賽總冠軍');
    if (sm.year === 1 && sm.apps >= 15) a.push('年度最佳新人（球團表揚）');
    if (prev && sm.trust - prev.trust >= 15 && sm.apps >= 20) a.push('最佳進步獎（球團表揚）');
    const era = pt.outs > 0 ? pt.r * 27 / pt.outs : 99, avg = st.ab > 0 ? st.h / st.ab : 0;      // 明星賽／MVP 只看實際成績（不看信賴度），所以不會每年都有；二刀流：投打任一邊達標即可，另有雙料獎
    const pitAsg = (pt.outs >= 150 && era <= 3.5) || pt.sv >= 10 || pt.w >= 8, batAsg = (st.ab >= 200 && avg >= .3) || st.hr >= 15 || st.rbi >= 60;
    const pitMvp = (pt.outs >= 300 && era <= 2.5) || pt.w >= 12, batMvp = (st.ab >= 300 && avg >= .33) || st.hr >= 25 || st.rbi >= 90;
    if (sm.starter && sm.apps >= (isP ? 20 : 60) && (isP ? pitAsg : two ? (batAsg || pitAsg) : batAsg)) a.push('明星賽代表（以成績門檻判定）');
    if (sm.starter && sm.qual && (isP ? pitMvp : two ? (batMvp || pitMvp) : batMvp)) a.push('球團年度 MVP');
    if (isP || two) { if (pt.outs >= 300 && pt.r * 27 / pt.outs <= 2.5) a.push('防禦率優良獎'); if (pt.w >= 10) a.push('十勝投手'); if (pt.sv >= 15) a.push('救援貢獻獎'); if (pt.k >= 100) a.push('百三振'); }
    if (!isP) { if (st.ab >= 200 && st.h / st.ab >= .32) a.push('打擊優良獎'); if (st.hr >= 20) a.push('二十轟'); if (st.rbi >= 80) a.push('八十打點'); }
    if (two && st.hr >= 15 && pt.w >= 8) a.push('🌟 二刀流雙料（15 轟＋8 勝，以成績門檻判定）');
    return a;
  }
  const canNext = () => { const P = PR(); if (!P || !P.done) return false; const q = !!(P.field && P.field.qualified.indexOf(P.team) >= 0); return !q || !!(P.po && P.po.done); };
  function nextYear() {
    const P = PR(); if (!canNext()) return showEnd();
    const sum = seasonSummary(); if (P.econ && P.econ.settled === (P.year || 1)) Object.assign(sum, { salary: P.econ.salary, perf: P.econ.perf, money: P.econ.money }); (P.hist = P.hist || []).push(sum);
    { const E = ECO(), t0 = P.team; if (E && E.applyPending && P.pending) { E.applyPending(P); if (P.team !== t0) P.farmMsg = `🔁 你加入了 <b>${esc(TEAMS[P.team].name)}</b>，${P.starter ? '以先發身分' : '從板凳'}重新開始（信賴度 ${P.trust}）。`; } }      // 簽約／轉隊在存好本季摘要之後才生效
    { const E1 = ECO(); if (E1 && E1.injuryYearEnd) E1.injuryYearEnd(P); }      // 輕／中傷痊癒；重傷帶少量場數到下一季
    P.year = (P.year || 1) + 1; P.seed = Math.floor(Math.random() * 0x7fffffff) + 1; P.res = []; P.apps = 0; P.log = []; P.plan = null; P.spTurn = 0; P.done = false; P.po = null; P.poLog = []; P.field = null; P.justPromoted = P.justDemoted = false;
    ['storyStart', 'storyChk', 'storyEnd', 'storyPo', 'storyPoEnd', 'storyOff', 'market', 'pending'].forEach(k => { delete P[k]; });
    P.lowStreak = 0; if (P.level === 'farm' && P.trust >= FARM.recall - 5) { P.level = 'first'; P.farmG = 0; P.farmMsg = (P.farmMsg ? P.farmMsg + '<br>' : '') + '📈 休賽季後，你被召回一軍（從板凳開始）。'; }
    K().save(); showIntro();
  }
  function goNext() { if (storyGate('offseason')) return; const k = (PR().story && PR().story.flags || {}).RETIRE_CHOICE; if (['ceremony', 'quiet', 'lastdance', 'health', 'decline'].indexOf(k) >= 0) return showRetire(k); if (!ecoP()) return nextYear(); settleYear(); showMarket(); }      // 先看休賽季（續約）談話事件 → 結算年薪 → 合約／自由球員／交易市場 → 商店 → 下一年
  const nextBtn = () => (canNext() ? `<button id="cpNY" class="pri">📝 續約，進入第 ${(PR().year || 1) + 1} 年</button>` : '');
  const bindNext = () => { const b = document.getElementById('cpNY'); if (b) b.onclick = goNext; };
  const histHtml = () => { const H = PR().hist || []; return H.length ? `<table><tr><th>年</th><th>球隊</th><th>名次</th><th>勝-敗-和</th><th>季後賽</th></tr>${H.map(h => `<tr><td>${h.year}</td><td>${h.team != null && TEAMS[h.team] ? esc(TEAMS[h.team].short) : ''}</td><td>${h.rank}</td><td>${h.w}-${h.l}-${h.t}</td><td>${h.champ ? '🏆 冠軍' : h.qual ? (h.out === 'final' ? '台灣大賽' : '挑戰賽') : '—'}</td></tr>`).join('')}</table>` : ''; };

  /* ---------- 介面 ---------- */
  const monthStat = g => { const L = myGames(), same = L.filter(x => x.y === g.y && x.m === g.m); return [L.filter(x => x.date <= g.date && x.y === g.y && x.m === g.m).length, same.length]; };
  const roleTx = () => PR().level === 'farm' ? '二軍' : PR().starter ? (prof().pos === 'TWP' ? '先發二刀流' : '先發球員') : (prof().pos === 'P' ? '牛棚候補' : prof().pos === 'TWP' ? '板凳候補（二刀流）' : '板凳候補');
  /* 生涯總選單（13m CHUB）：把只讀資料交給 CHUB；api 是函式，CHUB 每次重繪都重新取值 */
  function hubApi() {
    const P = PR(), E = ECO(); if (E) ecoP(); if (E && E.notePitches) { const bp = basePitches(); if (bp && !(P.pitchLab && P.pitchLab.base && P.pitchLab.base.length)) E.notePitches(P, bp); }      // A5：總選單開啟時先記下投手的原始球種（第一場比賽前也能請教前輩）
    return { P, prof: prof(), teams: TEAMS, games: myGames(), next: nextGame(), esc, wd: WD, roleTx: roleTx(), statLine: statLine(), histHtml: histHtml(), eco: !!E, E: E && E.hubDo ? E : null, contract: E ? CHUB.contractView(P, TEAMS) : null,
      standings: standings(), seasonStartKey: dkey(new Date(SEASON_START[0], SEASON_START[1], SEASON_START[2])), summary: seasonSummary, save: () => K().save(),
      show: h => K().show(h), back: showIntro, enterGame: () => { const g = nextGame(); if (g) showGameDay(g); }, goSchedule: m => showSchedule(m),
      toTitle: () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; } };
  }
  function hubOpen() { CHUB.open(hubApi, showIntro); }
  function showIntro() {      // 生涯主入口：有 13m（CHUB）就先顯示「總選單」，點賽程上的比賽日才進入比賽畫面（showGameDay）；沒有 13m 則維持原本的賽前畫面
    if (PR().retired) return PR().civil ? showCivilian() : showRetire(PR().retired);      // 已退役：永遠回到生涯回顧
    const g = nextGame(); if (!g) return (poOn() ? showPO() : showEnd());
    if (storyGate('pro_start') || storyGate('after_game')) return;      // 劇情事件（13h）：有到期的事件就先顯示，看完會回到這裡
    if (typeof CHUB !== 'undefined') return hubOpen();
    showGameDay(g);
  }
  function showGameDay(g) {      // 原本的賽前畫面（全程觀看／自動模擬／直接出結果）
    const P = PR(), p = prof();
    const meHome = g.home === P.team, opp = TEAMS[meHome ? g.away : g.home], my = TEAMS[P.team], pl = plan(g), [mi, mn] = monthStat(g), played = myGames().filter(x => P.res[x.id] != null).length, all = myGames().length;
    const prev = myGames().filter(x => x.ser === g.ser && x.id < g.id).length;
    const farm = isFarm(), inj = hurt(), out = farm || inj, fm = takeMsg(), tx = inj && !farm ? `你正在<b>養傷</b>（${esc(P.injury.why)}・${esc(P.injury.name)}），還要缺陣 <b>${P.injury.games}</b> 場，這段時間一軍比賽自動模擬、你不出賽。休兵日可以安排「復健」，不保證縮短傷期。` : farm ? `你在<b>二軍</b>，一軍比賽自動模擬、你不出賽。每 ${FARM.tick} 場依訓練成果提升信賴度；信賴度達 ${FARM.recall} 且滿 ${FARM.minGames} 場後有機會被召回（目前第 ${P.farmG | 0} 場）。` : P.starter ? (p.pos === 'TWP' ? (pl.sp ? '今天輪到你<b>先發登板</b>，同時<b>打 DH</b>！' : '今天不是輪值日：你只打 <b>DH</b>，不投球。') : pl.use ? (p.pos === 'P' ? '今天輪到你<b>先發登板</b>！' : '今天你是<b>先發球員</b>！') : '今天不是你的輪值日，在牛棚待命。')
      : (pl.use ? '教練今天<b>有機會用你</b>：待命，被叫到就要上場！' : '今天看起來<b>只是待命</b>，不太會輪到你。');
    K().show(`<div class="csb"><h2>${my.name}・${roleTx()}</h2><div class="sub">${esc(p.name)} #${p.num}・${esc(p.pos === 'TWP' ? '二刀流' : p.pos)}　｜　第 ${played + 1} / ${all} 場　｜　信賴度 ${P.trust}${ECO() ? `　｜　💰 ${Math.round(ecoP() && P.money)} 萬　體能 ${P.fit}${P.contract ? `　📑 剩 ${P.contract.left} 年・年薪 ${P.contract.salary} 萬` : ''}` : ''}</div>
<div class="vs"><div class="tm" style="background:linear-gradient(135deg,${meHome ? my.c1 : opp.c1},#0006);color:#fff">${esc((meHome ? opp : my).short)}<br><small>客</small></div><span>＠</span><div class="tm" style="background:linear-gradient(135deg,${meHome ? my.c1 : opp.c1},#0006);color:#fff">${esc((meHome ? my : opp).short)}<br><small>主</small></div></div>
<div class="sub" style="text-align:center">${dateTx(g)}　｜　對${esc(opp.name)}系列戰第 ${prev + 1} / 3 場　｜　${g.m} 月第 ${mi} / ${mn} 場</div>
${fm ? `<div class="task">${fm}</div>` : ''}<div class="task">📋 ${tx}<br><small>${inj && !farm ? '傷癒前不能進場；休兵日復健、逛商店恢復體能。' : farm ? '二軍期間不能進場；可以逛商店提升體能與訓練效果。' : '被教練叫上場時才由你操作（代打／代跑／登板）；其餘時間由電腦進行。想看整場請選「全程觀看」；比賽中也能隨時切換自動模擬，或用「直接出結果」跳過整場。'}</small></div>
<div class="task" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">🎚 電腦難度　<select id="cpLv" style="font:inherit;padding:4px 8px;border-radius:7px">${['弱', '普通', '強', '宗師'].map((n, i) => `<option value="${i}"${i === lvOf() ? ' selected' : ''}>${n}</option>`).join('')}</select><small>（影響之後每場比賽，可隨時更改）</small></div>
<div class="btns"><button id="cpHome">返回主畫面</button><button id="cpSch">🗓 賽程</button><button id="cpStd">📊 戰績</button>${typeof CHUB !== 'undefined' ? '<button id="cpHub" class="pri">☰ 返回總選單</button>' : ''}${ECO() ? '<button id="cpShop">🛍 商店</button>' : ''}<button id="cpSim">⏭ 直接出結果</button>${out ? '<button id="cpSim10" class="pri">⏩ 快轉 10 場</button>' : '<button id="cpGoW">👁 全程觀看</button><button id="cpGo" class="pri">⏩ 自動模擬（快轉到我上場）</button>'}</div></div>`);
    const $e = id => document.getElementById(id);
    if (document.getElementById('cpLv')) document.getElementById('cpLv').onchange = e => { try { PR().lv = +e.target.value; K().save(); } catch (x) { } };
    $e('cpHome').onclick = () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
    if ($e('cpHub')) $e('cpHub').onclick = hubOpen; $e('cpSch').onclick = () => showSchedule(g.m); $e('cpStd').onclick = showStandings; if ($e('cpShop')) $e('cpShop').onclick = () => showShop(showIntro); $e('cpSim').onclick = () => quick(g);
    if (out) $e('cpSim10').onclick = () => { for (let i = 0; i < 10; i++) { const g2 = nextGame(); if (!g2) break; quick(g2, true); if (!sitOut()) break; } showIntro(); }; else { $e('cpGo').onclick = () => { AUTOSIM.arm(true); launch(g); }; $e('cpGoW').onclick = () => { AUTOSIM.arm(false); launch(g); }; }
  }
  function lvOf() { try { const v = PR().lv; return v === 0 || v === 1 || v === 2 || v === 3 ? v : 1; } catch (e) { return 1; } }      // 生涯電腦難度（0弱 1普通 2強 3宗師），存在 pro 裡，預設普通
  function launch(g) {
    const P = PR(), meHome = g.home === P.team; K().hide();
    K().setCfg({ H: g.home, A: g.away, ctl: meHome ? 0 : 1, ord: meHome ? 1 : 0, inn: 9, lv: lvOf(), abs: 0, evt: 0, ace: 0, pn: 0, easy: 0, park: '', night: -1, wx: 1 });
    CAREER.session = { profile: prof(), player: null }; try { sndInit(); } catch (e) { } $('lineup').classList.add('hide');
    newGame(Object.assign({}, CFG, { career: true, edit: [null, null], ace: 0 }));
  }
  function quick(g, silent) {      // 不進場：模擬本場結果＋（若有安排）你的登場成績
    const P = PR(), p = prof(), pl = plan(g), s = g.po ? simNoTie(g) : simGame(g), meHome = g.home === P.team, my = meHome ? s[0] : s[1], op = meHome ? s[1] : s[0];
    const rec = { pos: p.pos, my, op, res: my === op ? 'T' : my > op ? 'W' : 'L', oppName: TEAMS[meHome ? g.away : g.home].name, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, e: 0, outs: 0, r: 0, hA: 0, played: false, quick: true };
    if (p.pos === 'TWP') rec.pit = { outs: 0, r: 0, hA: 0, k: 0, bb: 0, played: false };
    if (pl.use) {
      rec.played = true;
      const simPit = o => { o.outs = 3 * rint(1, 2); o.r = Math.random() < .25 ? 1 : 0; o.hA = rint(0, 2); o.k = rint(0, 3); o.bb = rint(0, 1); };
      const simBat = () => { rec.ab = 1; if (Math.random() < .08) { rec.ab = 0; rec.bb = 1; } else if (Math.random() < .27) { rec.h = 1; if (Math.random() < .12) { rec.hr = 1; rec.rbi = 1; } else if (Math.random() < .3) rec.rbi = 1; } else if (Math.random() < .22) rec.k = 1; };
      if (p.pos === 'P') simPit(rec);
      else if (p.pos === 'TWP') { if (pl.sp || pl.type === 'RP') { simPit(rec.pit); rec.pit.played = true; } if (pl.type !== 'RP' && pl.type !== 'PR') simBat(); }
      else if (pl.type !== 'PR') simBat();
    }
    if (g.po) { poFinish(g, s, rec); if (!silent) showPO(); } else { finish(g, s, rec); if (!silent) showIntro(); }
  }
  function farmStep() {      // A3：一軍板凳持續低信賴度 → 下放二軍；二軍期間依訓練成果加信賴度，達標召回（召回後從板凳開始）
    const P = PR(); if (!P) return;
    if (isFarm()) {
      P.farmG = (P.farmG | 0) + 1;
      if (P.farmG % FARM.tick === 0) { const E = ecoP(); let g = rint(0, 3); if (E) g = Math.round(g * E.trainMult(P)); P.trust = cl(P.trust + g, 0, 100); if (E && E.ensureGrow) { const G0 = E.ensureGrow(P); G0.tp = Math.round((G0.tp + 1.5) * 10) / 10; } }      // 二軍訓練：信賴度（沿用）＋訓練點
      if (P.farmG >= FARM.minGames && P.trust >= FARM.recall && Math.random() < .6) { P.level = 'first'; P.farmG = 0; P.lowStreak = 0; P.farmMsg = '📈 二軍訓練有成，球團把你<b>召回一軍</b>（從板凳開始）。'; }
    } else if (!P.starter) {
      P.lowStreak = (P.trust < FARM.demote && !hurt()) ? (P.lowStreak | 0) + 1 : 0;      // 受傷缺賽不算「長期沒有表現」
      if (P.lowStreak >= FARM.streak) { P.level = 'farm'; P.farmG = 0; P.lowStreak = 0; P.trust = FARM.reset; P.farmMsg = '📉 長期沒有表現，球團把你<b>下放二軍</b>。二軍不出賽，靠訓練把信賴度練回來。'; }
    } else P.lowStreak = 0;
  }
  const takeMsg = () => { const P = PR(), m = P.farmMsg || ''; P.farmMsg = ''; return m; };
  function growth(rec, tag) {      // 依這場表現更新出場數／信賴度／先發資格（例行賽與季後賽共用）
    const P = PR(), p = prof();
    { const E0 = ecoP(); if (E0 && E0.injuryTick) { const m = E0.injuryTick(P); if (m) addMsg(m); } }      // A4：每過一場，傷期 −1
    if (rec.played) {
      P.apps++; let d;
      const pitD = r => (r.outs / 3) * 1.5 - r.r * 2.5 + r.k * .7 - r.bb * .7 - r.hA * .3, batD = r => r.h * 2 + r.hr * 2 + r.rbi * 1 + r.bb * .5 - (r.ab - r.h) * .6 - r.k * .4 - r.e * 1.5, pitPlayed = !!(rec.pit && rec.pit.played);
      if (p.pos === 'P') d = pitD(rec); else if (p.pos === 'TWP') d = batD(rec) + (pitPlayed ? pitD(rec.pit) : 0); else d = batD(rec);      // 二刀流：打擊與投球表現合併算信賴度
      const dd = cl(d * 1.2 - (rec.ab + rec.outs / 3 > 0 ? 0 : 0), -4, 6), E = ecoP(); P.trust = cl(Math.round(P.trust + (E && dd > 0 ? dd * E.trainMult(P) : dd)), 0, 100); if (E) E.afterGame(P, { played: true, isP: p.pos === 'P', d, two: p.pos === 'TWP' ? { pit: pitPlayed } : null });
      if (E && E.injuryRoll) { const inj = E.injuryRoll(P, { played: true, isP: p.pos === 'P', two: p.pos === 'TWP', pit: pitPlayed, left: myGames().filter(x => P.res[x.id] == null).length }); if (inj) addMsg(`🚑 你在比賽中受傷了：${inj.why}（${inj.name}，預計缺陣 ${inj.games} 場）。傷癒前不能出賽，休兵日可以安排復健。`); }
    } else { const E = ecoP(); if (E) E.afterGame(P, { played: false }); }
    if ((p.pos === 'P' || p.pos === 'TWP') && P.starter) P.spTurn++;
    farmStep();
    if (!P.starter && !isFarm() && P.trust >= 70 && P.apps >= 10) { P.starter = true; P.trust = 55; P.promoted = tag; P.justPromoted = true; }
    else if (P.starter && P.trust < 30) { P.starter = false; P.trust = 40; P.justDemoted = true; }
  }
  function finish(g, s, rec) {      // 記錄這一場、模擬同日其他比賽、更新信賴度與先發資格
    const P = PR(); P.res[g.id] = s; simOthers(g.date); P.plan = null;
    { const hm = g.home === P.team; rec.dec = decide(rec, hm ? s[0] : s[1], hm ? s[1] : s[0]); } rec.gid = g.id; rec.date = dateTx(g); P.log.push(rec);
    growth(rec, dateTx(g)); K().save();
  }
  function afterEnd(rs) {
    const P = PR(), g = curGame(); if (!g) return; const rec = K().buildRec(); if (prof().pos === 'TWP') { const mb = K().findMeBat(); rec.played = !!((mb && (mb.played || rec.ab > 0 || rec.bb > 0 || mb.slot !== undefined)) || (rec.pit && rec.pit.played)); } else rec.played = !!(K().findMe() && (K().findMe().played || rec.ab > 0 || rec.outs > 0 || (prof().pos !== 'P' && K().findMe().slot !== undefined)));
    const meHome = g.home === P.team, s = meHome ? [rec.my, rec.op] : [rec.op, rec.my]; const LG = g.po ? P.poLog : P.log; if (!LG.some(x => x.gid === g.id)) (g.po ? poFinish : finish)(g, s, rec);
    const r2 = LG.find(x => x.gid === g.id) || rec; const p = prof();
    CAREER.session = CAREER.session || { profile: p }; if (p.pos === 'TWP') { const q = r2.pit || {}; CAREER.session.stats = undefined; CAREER.session.statsBat = [['打數', r2.ab], ['安打', r2.h], ['全壘打', r2.hr], ['打點', r2.rbi]]; CAREER.session.statsPit = q.played ? [['投球局', (q.outs / 3).toFixed(1)], ['失分', q.r], ['被安打', q.hA], ['奪三振', q.k]] : []; }
    else CAREER.session.stats = p.pos === 'P' ? [['投球局數', (r2.outs / 3).toFixed(1)], ['失分', r2.r], ['被安打', r2.hA], ['三振', r2.k]] : [['打數', r2.ab], ['安打', r2.h], ['全壘打', r2.hr], ['打點', r2.rbi]];
    try { CAREER.attachResult(rs); } catch (e) { }
    const bt = rs.querySelector('.rbtns'), box = rs.querySelector('.rbox') || rs, sum = document.createElement('div'); sum.className = 'cs-sum';
    sum.innerHTML = `${r2.played ? `<b>你的表現</b>　${esc(K().recLine(r2))}` : '你今天沒有上場'}<br>信賴度 ${P.trust}${P.justPromoted ? '<br>🎉 教練決定讓你<b>升為先發</b>！' : ''}${P.justDemoted ? '<br>😥 表現不穩，被調回板凳。' : ''}${P.farmMsg ? '<br>' + takeMsg() : ''}`; P.justPromoted = P.justDemoted = false;
    if (bt) box.insertBefore(sum, bt); else box.appendChild(sum);
    if (bt) { const ag = bt.querySelector('#againBtn'); if (ag) ag.remove(); const nb = document.createElement('button'); nb.className = 'b-again'; nb.textContent = poOn() ? '🏆 季後賽' : (nextGame() ? '▶ 下一場' : '📋 賽季結算'); bt.insertBefore(nb, bt.firstChild); nb.onclick = () => { rs.classList.add('hide'); try { quitToMenu(); } catch (e) { } G.role = null; G.career = false; (poOn() ? showPO : showIntro)(); }; }
  }
  function showSchedule(m0) {
    const P = PR(), L = myGames(), months = Array.from(new Set(L.map(g => g.m))); m0 = months.indexOf(m0) >= 0 ? m0 : months[0];
    const rows = L.filter(g => g.m === m0).map(g => {
      const meHome = g.home === P.team, opp = TEAMS[meHome ? g.away : g.home], r = P.res[g.id], my = r ? (meHome ? r[0] : r[1]) : null, op = r ? (meHome ? r[1] : r[0]) : null, lg = P.log.find(x => x.gid === g.id);
      return `<tr><td>${g.m}/${g.d}（${WD[g.wd]}）</td><td>${meHome ? '主' : '客'}</td><td style="text-align:left">${esc(opp.short)}（系列 ${g.g}/3）</td><td>${r ? `${my}:${op} ${my > op ? '勝' : my < op ? '敗' : '和'}` : '—'}</td><td>${lg ? (lg.played ? '出場' : '未出場') : ''}</td></tr>`;
    }).join('');
    const tabs = months.map(m => `<button data-m="${m}"${m === m0 ? ' class="pri"' : ''}>${m} 月</button>`).join(' ');
    K().show(`<div class="csb"><h2>🗓 賽程（${TEAMS[P.team].short}）</h2><div class="sub">${tabs}</div><div class="sub">${m0} 月共 ${L.filter(g => g.m === m0).length} 場</div><table><tr><th>日期</th><th>主客</th><th>對手</th><th>結果</th><th>你</th></tr>${rows}</table><div class="btns"><button id="cpBk" class="pri">返回</button></div></div>`);
    document.querySelectorAll('#csDlg [data-m]').forEach(b => b.onclick = () => showSchedule(+b.dataset.m)); document.getElementById('cpBk').onclick = () => (nextGame() ? showIntro() : showEnd());
  }
  function showStandings() {
    const T = standings(), P = PR(), rows = T.map((x, i) => `<tr${x.i === P.team ? ' style="background:#ffe14a22"' : ''}><td>${i + 1}</td><td style="text-align:left">${esc(TEAMS[x.i].name)}</td><td>${x.w}-${x.l}-${x.t}</td><td>${x.pct.toFixed(3).replace(/^0/, '')}</td><td>${x.rs}/${x.ra}</td></tr>`).join('');
    K().show(`<div class="csb"><h2>📊 聯盟戰績</h2><table><tr><th>名次</th><th>球隊</th><th>勝-敗-和</th><th>勝率</th><th>得／失分</th></tr>${rows}</table>${statLine()}<div class="btns"><button id="cpBk" class="pri">返回</button></div></div>`);
    document.getElementById('cpBk').onclick = () => (nextGame() ? showIntro() : showEnd());
  }
  function statLine() {
    const L = PR().log, p = prof(); if (!L.length) return '';
    if (p.pos === 'TWP') { const T = statSum(), q = T.pit || zeroPit(); return `<div class="task">你的${roleTx()}成績：出場 ${T.g} 場<br>打擊：${T.ab} 打數 ${T.h} 安打　打擊率 ${fmtAvg(T.h, T.ab)}　${T.hr} 轟　${T.rbi} 打點<br>投球：${q.g} 登板　${q.w}-${q.l}-${q.sv}　${fmtIp(q.outs)} 局　失 ${q.r} 分　三振 ${q.k}　防禦率 ${fmtEra(q.r, q.outs)}　｜　信賴度 ${PR().trust}</div>`; } const t = { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, outs: 0, r: 0, g: 0 };
    L.forEach(x => { if (x.played) { t.g++; for (const k of ['ab', 'h', 'hr', 'rbi', 'bb', 'k', 'outs', 'r']) t[k] += x[k] || 0; } });
    return `<div class="task">你的${roleTx()}成績：出場 ${t.g} 場　${p.pos === 'P' ? `${(t.outs / 3).toFixed(1)} 局　失 ${t.r} 分　三振 ${t.k}　防禦率 ${t.outs ? (t.r * 9 / (t.outs / 3)).toFixed(2) : '—'}` : `${t.ab} 打數 ${t.h} 安打　打擊率 ${t.ab ? (t.h / t.ab).toFixed(3).replace(/^0/, '') : '—'}　${t.hr} 轟　${t.rbi} 打點`}　｜　信賴度 ${PR().trust}</div>`;
  }
  const RT = { ceremony: ['🎖 告別賽', '球場座無虛席，球迷用你的名字唱了一整局。'], quiet: ['🌙 低調退役', '沒有儀式，只有隊友與一封信。你把焦點留給了球隊。'], lastdance: ['🏆 最後一舞', '你在奪冠之後選擇謝幕——最好的句點，是由自己寫下。'], health: ['🩺 為了身體的光榮退役', '多年的高強度出賽留下了痕跡。你選擇在還能好好走路的時候，好好告別。'], decline: ['📉 坦然謝幕', '出場機會越來越少，但你沒有怨言。你選擇用自己的方式，把位置交給下一個人。'] };
  const sumSt = (H, key) => { const o = { g: 0, w: 0, l: 0, sv: 0 }; STK.forEach(k => { o[k] = 0; }); const K0 = Object.keys(o); H.forEach(h => { const x = h[key] || {}; K0.forEach(k => { o[k] += +x[k] || 0; }); if (x.pit) { o.pit = o.pit || zeroPit(); Object.keys(zeroPit()).forEach(k => { o.pit[k] += +x.pit[k] || 0; }); } }); return o; };
  function recTable(H) {      // 逐年成績表＋生涯合計（只列適用於你位置的欄位；二刀流＝打擊表＋投球表兩張）
    const two = prof().pos === 'TWP', isP = prof().pos === 'P';
    const bRow = (lab, a, st) => `<tr><td>${lab}</td><td>${a}</td><td>${st.ab}</td><td>${st.h}</td><td>${fmtAvg(st.h, st.ab)}</td><td>${st.hr}</td><td>${st.rbi}</td><td>${st.bb}</td><td>${st.k}</td></tr>`;
    const pRow = (lab, a, st) => `<tr><td>${lab}</td><td>${a}</td><td>${st.w}-${st.l}-${st.sv}</td><td>${fmtIp(st.outs)}</td><td>${fmtEra(st.r, st.outs)}</td><td>${st.k}</td><td>${st.bb}</td></tr>`;
    const bHead = '<tr><th>年</th><th>出賽</th><th>打數</th><th>安打</th><th>打擊率</th><th>全壘打</th><th>打點</th><th>四死球</th><th>三振</th></tr>', pHead = '<tr><th>年</th><th>登板</th><th>勝-敗-救</th><th>投球局</th><th>防禦率</th><th>三振</th><th>四壞</th></tr>';
    const T = sumSt(H, 'st'), PT = sumSt(H, 'pst'), note = '<br>勝敗救為依比分與投球內容的簡化推定（遊戲沒有官方決勝投手記錄）；防禦率＝自責分×27÷出局數。';
    if (two) {
      const Tp = T.pit || zeroPit(), PTp = PT.pit || zeroPit();
      return `<div style="overflow-x:auto"><b>打擊</b><table>${bHead}${H.map(h => bRow(h.year, h.apps, h.st || sumSt([], 'x'))).join('')}${bRow('<b>生涯</b>', T.g, T)}</table><b>投球</b><table>${pHead}${H.map(h => { const q = (h.st && h.st.pit) || zeroPit(); return pRow(h.year, q.g, q); }).join('')}${pRow('<b>生涯</b>', Tp.g, Tp)}</table></div><div class="sub">季後賽累積：打擊 ${PT.g} 場・${PT.ab} 打數 ${PT.h} 安打・打擊率 ${fmtAvg(PT.h, PT.ab)}・${PT.hr} 轟 ${PT.rbi} 打點；投球 ${PTp.g} 登板・${PTp.w}-${PTp.l}-${PTp.sv}・${fmtIp(PTp.outs)} 局・防禦率 ${fmtEra(PTp.r, PTp.outs)}・${PTp.k} 三振${note}</div>`;
    }
    const row = isP ? pRow : bRow, head = isP ? pHead : bHead;
    return `<div style="overflow-x:auto"><table>${head}${H.map(h => row(h.year, h.apps, h.st || sumSt([], 'x'))).join('')}${row('<b>生涯</b>', T.g, T)}</table></div><div class="sub">季後賽累積：${isP ? `${PT.g} 登板・${PT.w}-${PT.l}-${PT.sv}・${fmtIp(PT.outs)} 局・防禦率 ${fmtEra(PT.r, PT.outs)}・${PT.k} 三振` : `${PT.g} 場・${PT.ab} 打數 ${PT.h} 安打・打擊率 ${fmtAvg(PT.h, PT.ab)}・${PT.hr} 轟 ${PT.rbi} 打點`}${note}</div>`;
  }
  function buildStory(kind, H) {      // 生涯故事（文字敘述）：全部取自 hist／劇情旗標／關係值，沒有捏造
    const P = PR(), p = prof(), isP = p.pos === 'P', two = p.pos === 'TWP', fl = (P.story && P.story.flags) || {}, rel = (P.story && P.story.rel) || {}, tm = TEAMS[(H[0] && H[0].team != null ? H[0].team : P.team)].name, T = sumSt(H, 'st'), out = [];
    out.push(`${p.name}，背號 ${p.num}，一位${two ? '二刀流球員（既是先發投手，也是打線中的 DH）' : isP ? '投手' : '野手'}。你從${tm}的板凳起步，在中職走過 ${H.length} 個球季。`);
    H.forEach(h => {
      const st = h.st || {}; let t = `第 ${h.year} 年，${h.team != null && TEAMS[h.team] ? TEAMS[h.team].name : tm}戰績 ${h.w}勝${h.l}敗${h.t ? h.t + '和' : ''}（第 ${h.rank} 名）${h.champ ? '，並奪得總冠軍' : h.qual ? (h.out === 'final' ? '，打進台灣大賽' : '，打進季後賽') : ''}。`;
      if (!h.apps) t += '這一年你大多在板凳上等待機會。';
      else if (two) { const q = st.pit || zeroPit(); t += `你出賽 ${h.apps} 場：打擊率 ${fmtAvg(st.h || 0, st.ab || 0)}，${st.hr || 0} 轟、${st.rbi || 0} 打點；投球 ${q.g} 場登板，${q.w} 勝 ${q.l} 敗，防禦率 ${fmtEra(q.r, q.outs)}，三振 ${q.k}。`; }
      else t += isP ? `你登板 ${h.apps} 場，${st.w || 0} 勝 ${st.l || 0} 敗${st.sv ? ' ' + st.sv + ' 救援' : ''}，防禦率 ${fmtEra(st.r || 0, st.outs || 0)}，三振 ${st.k || 0}。` : `你出賽 ${h.apps} 場，打擊率 ${fmtAvg(st.h || 0, st.ab || 0)}，${st.hr || 0} 轟、${st.rbi || 0} 打點。`;
      if (h.aw && h.aw.length) t += `這一年的榮譽：${h.aw.join('、')}。`; out.push(t);
    });
    if ((P.moves || []).length) out.push(`你換過 ${P.moves.length} 次球隊：${P.moves.map(m => `第 ${m.year} 年後 ${TEAMS[m.from].short}→${TEAMS[m.to].short}（${{ trade: '交易', fa: '自由球員', release: '被釋出', resign: '續約' }[m.how] || ''}）`).join('、')}。`);
    { const E = ECO(), sm = E && E.injurySummary ? E.injurySummary(P) : null; if (sm && sm.count) { const w = sm.worst; out.push(`${H.length} 個球季裡，你一共受過 ${sm.count} 次傷${sm.severe ? `，其中 ${sm.severe} 次是重傷` : ''}。最重的一次在第 ${w.year} 年（${w.why}・${w.label}）。每一次，你都得一格一格地把身體和信心找回來。`); } }
    const bits = []; if (fl.WON_TITLE) bits.push('你親手捧起過總冠軍獎盃'); if (fl.FAN_FAVORITE) bits.push('球迷把你當成自己人'); if (fl.CAPTAIN_VOICE) bits.push('在球隊低潮時，你站出來說話'); if (fl.MENTOR_ROOKIE) bits.push('你把經驗毫無保留地教給了新人');
    if (fl.REHAB_FAITHFUL || fl.REHAB_PATIENT) bits.push('你走過一段復健的路，一格一格回到了球場'); if (fl.BODYCARE_PLAN) bits.push('你很早就開始照顧自己的身體'); if (fl.LIFE_BALANCE) bits.push('再忙，你也留時間給家人'); if (fl.COACH_PATH) bits.push('你曾和教練聊過退役後站在場邊的樣子');
    if ((rel.coach || 0) >= 10) bits.push('教練是最信任你的人之一'); if ((rel.team || 0) >= 15) bits.push('隊友把你當成球隊的核心'); if ((rel.veteran || 0) >= 8) bits.push('前輩把他們的經驗傳給了你');
    if (bits.length) out.push(bits.join('；') + '。');
    if (two) { const q = T.pit || zeroPit(); out.push(`累計打擊：${T.ab} 打數 ${T.h} 安打、打擊率 ${fmtAvg(T.h, T.ab)}、${T.hr} 支全壘打、${T.rbi} 分打點；投球：${fmtIp(q.outs)} 局、${q.w} 勝 ${q.l} 敗 ${q.sv} 救援、防禦率 ${fmtEra(q.r, q.outs)}、${q.k} 三振，總冠軍 ${H.filter(h => h.champ).length} 次。`); }
    else out.push(`累計${isP ? `${fmtIp(T.outs)} 局、${T.w} 勝 ${T.l} 敗 ${T.sv} 救援、防禦率 ${fmtEra(T.r, T.outs)}、${T.k} 三振` : `${T.ab} 打數 ${T.h} 安打、打擊率 ${fmtAvg(T.h, T.ab)}、${T.hr} 支全壘打、${T.rbi} 分打點`}，總冠軍 ${H.filter(h => h.champ).length} 次。`);
    out.push({ ceremony: '告別賽那天，球場坐滿了人。你向每個方向鞠躬，沒有說太多話，因為所有的話，都已經在這些年的比賽裡說完了。', quiet: '你沒有舉行任何儀式，只留下一封給隊友的信。更衣室裡，有人默默把你的櫃子擦得乾乾淨淨。', lastdance: '你選擇在總冠軍之後謝幕。這一次，沒有人需要問你遺不遺憾。', health: '你選擇在身體還能支撐生活的時候告別。掌聲很長，長到你好像聽見了第一天走進休息室的腳步聲。', decline: '你把筆記整理好，交給下一個人。你說：「球場不是我一個人的，我只是借住了很久。」' }[kind] || '你脫下了球衣。');
    return out;
  }
  const goHome = () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
  function injHtml() {      // 退役回顧：傷病紀錄（取自 P.injLog，沒有紀錄就不顯示）
    const E = ECO(), sm = E && E.injurySummary ? E.injurySummary(PR()) : null; if (!sm || !sm.count) return '';
    return `<div class="task" style="text-align:left"><b>🩹 傷病紀錄</b>（共 ${sm.count} 次${sm.severe ? `，其中重傷 ${sm.severe} 次` : ''}）<table><tr><th>年</th><th>傷勢</th><th>部位／原因</th><th>缺陣</th></tr>${sm.rows.map(r => `<tr><td>${r.year}</td><td>${esc(r.label)}</td><td style="text-align:left">${esc(r.why)}</td><td>${r.games == null ? '整季' : r.games + ' 場'}</td></tr>`).join('')}</table><small>傷期為受傷當下的預估場數，復健可能縮短；重傷整季報銷、帶 12 場進下一季。</small></div>`;
  }
  function showRetire(kind) {      // 退役生涯回顧（成績表＋榮譽＋文字敘述）；按「確認」才進入平凡生活畫面
    const P = PR(), E = ecoP();
    if (!P.retired) { try { if (E) settleYear(); } catch (e) { } const sum = seasonSummary(); if (P.econ && P.econ.settled === (P.year || 1)) Object.assign(sum, { salary: P.econ.salary, perf: P.econ.perf, money: P.econ.money }); (P.hist = P.hist || []).push(sum); P.retired = kind; K().save(); }
    kind = P.retired; const H = P.hist || [], rt = RT[kind] || RT.quiet, aws = H.filter(h => h.aw && h.aw.length).map(h => `第 ${h.year} 年：${h.aw.join('、')}`), salary = H.reduce((a, h) => a + (+h.salary || 0), 0);
    K().show(`<div class="csb"><h2>${rt[0]}・生涯回顧</h2><div class="sub">${esc(prof().name)}　${esc(TEAMS[P.team].name)}　${H.length} 個球季</div><div class="task">${esc(rt[1])}</div>${recTable(H)}<div class="task"><b>榮譽</b>（球團表彰，以個人成績門檻判定，非聯盟投票）<br>${aws.length ? aws.map(esc).join('<br>') : '（沒有獲獎紀錄）'}${salary ? `<br><small>年薪合計約 ${salary} 萬（虛構）</small>` : ''}</div>${histHtml()}${injHtml()}<div class="task" style="max-height:34vh;overflow:auto;text-align:left"><b>你的故事</b>${buildStory(kind, H).map(t => `<p style="margin:.5em 0">${esc(t)}</p>`).join('')}</div><div class="btns"><button id="cpOK" class="pri">✅ 確認，告別球場</button></div></div>`);
    document.getElementById('cpOK').onclick = () => { P.civil = true; K().save(); showCivilian(); };
  }
  function showCivilian() {
    K().show(`<div class="csb"><h2>🌤 回歸平凡的日子</h2><div class="task" style="text-align:left"><p>脫下球衣的那一天，聚光燈熄滅了。</p><p>你回到了社會，成為一個再普通不過的人。</p><p>早晨煮一杯咖啡，傍晚在河堤散步；偶爾翻出舊球衣，笑著想起那些年的汗水與掌聲。</p><p><b>你過著幸福而平淡的日子。</b></p></div><div class="btns"><button id="cpBackRv">📖 再看一次生涯回顧</button><button id="cpHome" class="pri">返回主畫面</button></div></div>`);
    document.getElementById('cpBackRv').onclick = () => showRetire(PR().retired); document.getElementById('cpHome').onclick = goHome;
  }
  function showEnd() {
    if (storyGate('after_game') || storyGate('season_end')) return;      // 劇情事件（13h）
    const P = PR(); P.done = true; simOthers(99999999); const F = (P.field = playoffField()); K().save(); const T = standings(), pos = T.findIndex(x => x.i === P.team) + 1;
    K().show(`<div class="csb"><h2>🏁 例行賽結束</h2><div class="sub">${esc(TEAMS[P.team].name)} 本季排名第 ${pos}</div>${statLine()}${fieldHtml(F)}<div class="task">${poSummary(F)}</div>${histHtml()}<div class="btns"><button id="cpStd">📊 戰績</button>${F.qualified.indexOf(P.team) >= 0 && !(P.po && P.po.done) ? '<button id="cpPO" class="pri">🏆 前往季後賽</button>' : ''}${nextBtn()}<button id="cpHome"${F.qualified.indexOf(P.team) >= 0 && !(P.po && P.po.done) ? '' : ''}>返回主畫面</button></div></div>`);
    if (document.getElementById('cpPO')) document.getElementById('cpPO').onclick = poBegin; bindNext();
    document.getElementById('cpStd').onclick = showStandings; document.getElementById('cpHome').onclick = () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
  }
  return { _t: { decide, awardsFor, statSum, plan, growth }, start, nextYear, goNext, showRetire, showCivilian, canNext, showIntro, afterEnd, inject, benchCall, bullpenCall, genSchedule, standings, simGame, tally, poBegin, showPO, decideField, playoffField, active: () => !!(SSx() && SSx().pro && SSx().pro.active) };
})();
