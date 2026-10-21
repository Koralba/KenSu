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
  const myGames = () => sched(PR().seed).filter(g => g.home === PR().team || g.away === PR().team);
  const nextGame = () => myGames().find(g => PR().res[g.id] == null);
  const dateTx = g => `${g.m}/${g.d}（${WD[g.wd]}）`;

  /* ---------- 進入職業賽季 ---------- */
  function start() {
    const S = SSx(), d = S.draft, p = prof(); if (!d || d.undrafted) return;
    const bench = p.pos !== 'P' ? '板凳候補（代打／代跑）' : '牛棚候補（中繼）';
    S.pro = { active: true, team: d.teamIdx, seed: Math.floor(Math.random() * 0x7fffffff) + 1, res: [], apps: 0, trust: cl(Math.round(50 - d.overall), 18, 48), starter: false, log: [], plan: null, spTurn: 0, role: bench, done: false };
    K().save(); showIntro();
  }
  function plan(g) {      // 今天教練的安排（決定後存起來，重新載入也一樣）
    const P = PR(); if (P.plan && P.plan.gid === g.id) return P.plan;
    const p = prof(); let use, type = 'PH', inn = rint(6, 9);
    if (P.starter) { use = p.pos === 'P' ? (P.spTurn % 5 === 0) : true; type = 'START'; inn = 1; }
    else { use = Math.random() < cl(.2 + P.trust / 160, .2, .8); if (p.pos === 'P') type = 'RP'; else type = Math.random() < .3 ? 'PR' : 'PH'; }
    return (P.plan = { gid: g.id, use, type, inn });
  }

  /* ---------- 球隊放入角色（13d 的 inject() 在職業賽季時轉到這裡） ---------- */
  function inject(teams, cfg) {
    const P = PR(), p = prof(), t = teams[cfg.side], pl = plan(nextGame()), me0 = K().myRow(p); let me = null;
    if (p.pos === 'P') {
      if (P.starter && pl.use) { me = mkPitcher(me0); me.isMe = true; me.num = String(p.num); me.mood = 62; t.cur = 0; t.pitchers[0] = me; }
      else if (!P.starter) { me = mkPitcher(Object.assign({}, me0, { r: 'RP', ipg: 1.2 })); me.isMe = true; me.num = String(p.num); me.mood = 60; me.role = 'RP'; me.out = false; me.used = false; t.pitchers.splice(Math.max(1, t.pitchers.length - 1), 0, me); }
    } else if (P.starter) {
      const i = t.lineup.findIndex(x => x.pos === p.pos); if (i >= 0) { const old = t.lineup[i]; me = mkBatter(me0, old.slot); me.isMe = true; me.num = String(p.num); me.nat = p.pos; me.mood = 62; setPos(me, p.pos); t.lineup[i] = me; old.slot = undefined; old.out = false; t.bench.push(old); }
    } else {
      me = mkBatter(me0, undefined); me.isMe = true; me.num = String(p.num); me.nat = p.pos; me.mood = 60; me.out = false; setPos(me, p.pos); t.bench.unshift(me);
    }
    G.roleCall = P.starter ? { none: true, done: true } : (pl.use ? { type: pl.type, inn: pl.inn, done: false } : { none: true, done: true });
    G.role = { pos: p.pos }; G.career = true;
    if (CAREER.session) CAREER.session.player = me; else CAREER.session = { profile: p, player: me };
  }

  /* ---------- 比賽中：叫板凳球員上場（07 的 aiPinch／aiManagePitcher 開頭呼叫） ---------- */
  function benchCall(side) {
    const rc = G.roleCall; if (!rc || rc.done || !G.career || side !== G.human || prof().pos === 'P') return false;
    const me = K().findMe(), t = G.teams[side]; if (!me || me.out || t.bench.indexOf(me) < 0 || G.inning < rc.inn) return false;
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
    const rc = G.roleCall; if (!rc || rc.done || !G.career || side !== G.human || prof().pos !== 'P') return false;
    if (G.inning < rc.inn || G.outs !== 0 || G.on.some(x => x)) return false;
    const t = G.teams[side], i = t.pitchers.findIndex(x => x.isMe); if (i < 0 || t.pitchers[i].out || t.cur === i) return false;
    changePitcher(side, i, false, '新人登板'); rc.done = true; t.pitchers[i].played = true; return true;
  }

  /* ---------- 介面 ---------- */
  const monthStat = g => { const L = myGames(), same = L.filter(x => x.y === g.y && x.m === g.m); return [L.filter(x => x.date <= g.date && x.y === g.y && x.m === g.m).length, same.length]; };
  const roleTx = () => PR().starter ? '先發球員' : (prof().pos === 'P' ? '牛棚候補' : '板凳候補');
  function showIntro() {
    const P = PR(), p = prof(), g = nextGame(); if (!g) return showEnd();
    const meHome = g.home === P.team, opp = TEAMS[meHome ? g.away : g.home], my = TEAMS[P.team], pl = plan(g), [mi, mn] = monthStat(g), played = myGames().filter(x => P.res[x.id] != null).length, all = myGames().length;
    const prev = myGames().filter(x => x.ser === g.ser && x.id < g.id).length;
    const tx = P.starter ? (pl.use ? (p.pos === 'P' ? '今天輪到你<b>先發登板</b>！' : '今天你是<b>先發球員</b>！') : '今天不是你的輪值日，在牛棚待命。')
      : (pl.use ? '教練今天<b>有機會用你</b>：待命，被叫到就要上場！' : '今天看起來<b>只是待命</b>，不太會輪到你。');
    K().show(`<div class="csb"><h2>${my.name}・${roleTx()}</h2><div class="sub">${esc(p.name)} #${p.num}・${esc(p.pos)}　｜　第 ${played + 1} / ${all} 場　｜　信賴度 ${P.trust}</div>
<div class="vs"><div class="tm" style="background:linear-gradient(135deg,${meHome ? my.c1 : opp.c1},#0006);color:#fff">${esc((meHome ? opp : my).short)}<br><small>客</small></div><span>＠</span><div class="tm" style="background:linear-gradient(135deg,${meHome ? my.c1 : opp.c1},#0006);color:#fff">${esc((meHome ? my : opp).short)}<br><small>主</small></div></div>
<div class="sub" style="text-align:center">${dateTx(g)}　｜　對${esc(opp.name)}系列戰第 ${prev + 1} / 3 場　｜　${g.m} 月第 ${mi} / ${mn} 場</div>
<div class="task">📋 ${tx}<br><small>被教練叫上場時才由你操作（代打／代跑／登板）；其餘時間由電腦進行。想看整場請選「全程觀看」；比賽中也能隨時切換自動模擬，或用「直接出結果」跳過整場。</small></div>
<div class="btns"><button id="cpHome">返回主畫面</button><button id="cpSch">🗓 賽程</button><button id="cpStd">📊 戰績</button><button id="cpSim">⏭ 直接出結果</button><button id="cpGoW">👁 全程觀看</button><button id="cpGo" class="pri">⏩ 自動模擬（快轉到我上場）</button></div></div>`);
    const $e = id => document.getElementById(id);
    $e('cpHome').onclick = () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
    $e('cpSch').onclick = () => showSchedule(g.m); $e('cpStd').onclick = showStandings; $e('cpSim').onclick = () => quick(g); $e('cpGo').onclick = () => { AUTOSIM.arm(true); launch(g); }; $e('cpGoW').onclick = () => { AUTOSIM.arm(false); launch(g); };
  }
  function launch(g) {
    const P = PR(), meHome = g.home === P.team; K().hide();
    K().setCfg({ H: g.home, A: g.away, ctl: meHome ? 0 : 1, ord: meHome ? 1 : 0, inn: 9, lv: 1, abs: 0, evt: 0, ace: 0, pn: 0, easy: 0, park: '', night: -1, wx: 1 });
    CAREER.session = { profile: prof(), player: null }; try { sndInit(); } catch (e) { } $('lineup').classList.add('hide');
    newGame(Object.assign({}, CFG, { career: true, edit: [null, null], ace: 0 }));
  }
  function quick(g) {      // 不進場：模擬本場結果＋（若有安排）你的登場成績
    const P = PR(), p = prof(), pl = plan(g), s = simGame(g), meHome = g.home === P.team, my = meHome ? s[0] : s[1], op = meHome ? s[1] : s[0];
    const rec = { pos: p.pos, my, op, res: my === op ? 'T' : my > op ? 'W' : 'L', oppName: TEAMS[meHome ? g.away : g.home].name, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, e: 0, outs: 0, r: 0, hA: 0, played: false, quick: true };
    if (pl.use) {
      rec.played = true;
      if (p.pos === 'P') { rec.outs = 3 * rint(1, 2); rec.r = Math.random() < .25 ? 1 : 0; rec.hA = rint(0, 2); rec.k = rint(0, 3); rec.bb = rint(0, 1); }
      else if (pl.type !== 'PR') { rec.ab = 1; if (Math.random() < .08) { rec.ab = 0; rec.bb = 1; } else if (Math.random() < .27) { rec.h = 1; if (Math.random() < .12) { rec.hr = 1; rec.rbi = 1; } else if (Math.random() < .3) rec.rbi = 1; } else if (Math.random() < .22) rec.k = 1; }
    }
    finish(g, s, rec); showIntro();
  }
  function finish(g, s, rec) {      // 記錄這一場、模擬同日其他比賽、更新信賴度與先發資格
    const P = PR(), p = prof(); P.res[g.id] = s; simOthers(g.date); P.plan = null;
    rec.gid = g.id; rec.date = dateTx(g); P.log.push(rec);
    if (rec.played) {
      P.apps++; let d;
      if (p.pos === 'P') d = (rec.outs / 3) * 1.5 - rec.r * 2.5 + rec.k * .7 - rec.bb * .7 - rec.hA * .3; else d = rec.h * 2 + rec.hr * 2 + rec.rbi * 1 + rec.bb * .5 - (rec.ab - rec.h) * .6 - rec.k * .4 - rec.e * 1.5;
      P.trust = cl(Math.round(P.trust + cl(d * 1.2 - (rec.ab + rec.outs / 3 > 0 ? 0 : 0), -4, 6)), 0, 100);
    }
    if (p.pos === 'P' && P.starter) P.spTurn++;
    if (!P.starter && P.trust >= 70 && P.apps >= 10) { P.starter = true; P.trust = 55; P.promoted = dateTx(g); P.justPromoted = true; }
    else if (P.starter && P.trust < 30) { P.starter = false; P.trust = 40; P.justDemoted = true; }
    K().save();
  }
  function afterEnd(rs) {
    const P = PR(), g = nextGame(); if (!g) return; const rec = K().buildRec(); rec.played = !!(K().findMe() && (K().findMe().played || rec.ab > 0 || rec.outs > 0 || (prof().pos !== 'P' && K().findMe().slot !== undefined)));
    const meHome = g.home === P.team, s = meHome ? [rec.my, rec.op] : [rec.op, rec.my]; if (!P.log.some(x => x.gid === g.id)) finish(g, s, rec);
    const r2 = P.log.find(x => x.gid === g.id) || rec; const p = prof();
    CAREER.session = CAREER.session || { profile: p }; CAREER.session.stats = p.pos === 'P' ? [['投球局數', (r2.outs / 3).toFixed(1)], ['失分', r2.r], ['被安打', r2.hA], ['三振', r2.k]] : [['打數', r2.ab], ['安打', r2.h], ['全壘打', r2.hr], ['打點', r2.rbi]];
    try { CAREER.attachResult(rs); } catch (e) { }
    const bt = rs.querySelector('.rbtns'), box = rs.querySelector('.rbox') || rs, sum = document.createElement('div'); sum.className = 'cs-sum';
    sum.innerHTML = `${r2.played ? `<b>你的表現</b>　${esc(K().recLine(r2))}` : '你今天沒有上場'}<br>信賴度 ${P.trust}${P.justPromoted ? '<br>🎉 教練決定讓你<b>升為先發</b>！' : ''}${P.justDemoted ? '<br>😥 表現不穩，被調回板凳。' : ''}`; P.justPromoted = P.justDemoted = false;
    if (bt) box.insertBefore(sum, bt); else box.appendChild(sum);
    if (bt) { const ag = bt.querySelector('#againBtn'); if (ag) ag.remove(); const nb = document.createElement('button'); nb.className = 'b-again'; nb.textContent = nextGame() ? '▶ 下一場' : '📋 賽季結算'; bt.insertBefore(nb, bt.firstChild); nb.onclick = () => { rs.classList.add('hide'); try { quitToMenu(); } catch (e) { } G.role = null; G.career = false; showIntro(); }; }
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
    const L = PR().log, p = prof(); if (!L.length) return ''; const t = { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, outs: 0, r: 0, g: 0 };
    L.forEach(x => { if (x.played) { t.g++; for (const k of ['ab', 'h', 'hr', 'rbi', 'bb', 'k', 'outs', 'r']) t[k] += x[k] || 0; } });
    return `<div class="task">你的${roleTx()}成績：出場 ${t.g} 場　${p.pos === 'P' ? `${(t.outs / 3).toFixed(1)} 局　失 ${t.r} 分　三振 ${t.k}　防禦率 ${t.outs ? (t.r * 9 / (t.outs / 3)).toFixed(2) : '—'}` : `${t.ab} 打數 ${t.h} 安打　打擊率 ${t.ab ? (t.h / t.ab).toFixed(3).replace(/^0/, '') : '—'}　${t.hr} 轟　${t.rbi} 打點`}　｜　信賴度 ${PR().trust}</div>`;
  }
  function showEnd() {
    const P = PR(); P.done = true; simOthers(99999999); K().save(); const T = standings(), pos = T.findIndex(x => x.i === P.team) + 1;
    K().show(`<div class="csb"><h2>🏁 例行賽結束</h2><div class="sub">${esc(TEAMS[P.team].name)} 本季排名第 ${pos}</div>${statLine()}<div class="task">之後的季後賽、續約與下一年度，之後再補上。</div><div class="btns"><button id="cpStd">📊 戰績</button><button id="cpHome" class="pri">返回主畫面</button></div></div>`);
    document.getElementById('cpStd').onclick = showStandings; document.getElementById('cpHome').onclick = () => { K().hide(); K().leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
  }
  return { start, showIntro, afterEnd, inject, benchCall, bullpenCall, genSchedule, standings, simGame, active: () => !!(SSx() && SSx().pro && SSx().pro.active) };
})();
