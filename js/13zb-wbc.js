/* ===== 13zb-wbc.js ｜ WBC 經典賽模式：選國家隊 → 預賽（4 組各 5 隊單循環）→ 八強 → 四強 → 季軍賽／冠軍賽 =====
   入口：主畫面「WBC經典賽模式」按鈕（#tmWbc，在 baseball.html，位於生涯模式下方）→ WBC.open()
   資料：js/13za-wbc-data.js 的 WBC_DATA（2026 WBC 20 隊）。每隊在載入時註冊進 CPBL[id]；開賽時把我方／對手放進 TEAMS[8]／TEAMS[9]（隱藏隊伍，與生涯模式同一套做法）。
   玩家只操控自己國家隊的比賽（真實 3D 比賽），其他場次與「快速模擬」用球隊強度＋隨機（Poisson）算比分。
   結算：js/11-game-flow.js 的 endGame() 會呼叫 WBC.afterEnd(rs)（G.wbc 由 newGame(cfg.wbc) 帶入）；賽程進度存在 localStorage 'cpbl2027.wbc.v1'。
   和局：WBC 沒有和局 → 12 局後仍平手，用強度加權隨機決定勝負並補 1 分（標「突破僵局」）。 */
'use strict';
const WBC = (function () {
  const D = WBC_DATA, KEY = 'cpbl2027.wbc.v1', SLOT_MY = 8, SLOT_OP = 9, KEYS = ['P0', 'P1', 'P2', 'P3', 'P4', 'QF', 'SF', 'BR', 'FN'];
  const DAYN = { P0: '預賽 第1輪', P1: '預賽 第2輪', P2: '預賽 第3輪', P3: '預賽 第4輪', P4: '預賽 第5輪', QF: '八強賽', SF: '四強賽', BR: '季軍賽', FN: '冠軍賽' };
  const $$ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let S = null, sel = null, tab = 'sched', banner = '', opts = { inn: 9 }, showBrk = false;
  D.TEAMS.forEach(t => { CPBL[t.id] = t.cp; });
  const T = id => D.byId[id], nm = id => T(id).name;
  /* ---------- 球隊強度：進攻＝先發 9 人打擊；防守＝投手（先發前 4＋牛棚前 6）為主、野手守備＋肩力為輔；全部換成 z 分數再轉 30~99 顯示值 ---------- */
  let ST = null;
  const STD = { off: [177.019, 17.344], pit: [63.661, 10.719], fld: [57.271, 6], sp: [64.334, 11.455], bp: [62.839, 10.481], d: 0.744 };      // [平均, 標準差]：off／pit／fld／sp／bp；d＝防守綜合分的標準差
  const styleOf = (o, d) => { const a = (o + d) / 2, g = o - d; return Math.abs(g) < 8 && a >= 74 && Math.min(o, d) >= 68 ? '攻守俱強' : g >= 8 ? '強攻型' : g <= -8 ? '防守型' : a < 50 ? '實力偏弱' : '攻守均衡'; };      // 俱強＝兩項都高且差距小；差距≥8 看偏哪邊；兩項都低＝實力偏弱；其餘＝均衡
  function strength() {
    if (ST) return ST; const raw = {}, pr = r => { const q = pitProf(r); return q.stf * .6 + q.ctl * .25 + q.vel * .15; };
    D.TEAMS.forEach(t => {
      const bq = t.cp.bat.map(r => batProf(r)), off = bq.map(ovrOf).reduce((a, b) => a + b, 0) / 9, fld = bq.reduce((a, q) => a + q.fld * .6 + q.arm * .4, 0) / 9;
      const sp = t.cp.sp.map(pr).sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0) / 4, bp = t.cp.rp.map(pr).sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0) / 6;
      raw[t.id] = { off, sp, bp, fld, pit: sp * .55 + bp * .45 };
    });
    const ids = Object.keys(raw), zv = (k, v) => (v - STD[k][0]) / STD[k][1], disp = z => Math.round(Math.max(30, Math.min(99, 60 + 13 * z))); ST = {};
    ids.forEach(i => {      // 固定基準（以調整前 20 隊的平均／標準差定錨），所以調整某一隊不會連帶改變別隊的顯示值
      const r = raw[i], o = zv('off', r.off), d = (.75 * zv('pit', r.pit) + .25 * zv('fld', r.fld)) / STD.d, off = disp(o), def = disp(d);
      ST[i] = { zo: o, zp: d, zd: d, off, def, pit: disp(zv('pit', r.pit)), sp: disp(zv('sp', r.sp)), bp: disp(zv('bp', r.bp)), fld: disp(zv('fld', r.fld)), ovr: Math.round((off + def) / 2), style: styleOf(off, def), raw: r };
    });
    return ST;
  }
  const mu = (a, b) => 4.3 * Math.exp(.17 * strength()[a].zo - .17 * strength()[b].zd);
  const pois = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }, gam = () => { let s = 0; for (let i = 0; i < 5; i++) s -= Math.log(1 - Math.random()); return s / 5; };
  function simScore(a, h) {      // a=客隊 h=主隊 → {sa,sh,ex}
    const ma = mu(a, h), mh = mu(h, a); let sa = pois(ma * gam()), sh = pois(mh * gam()), ex = 0;
    while (sa === sh && ex < 10) { ex++; sa += pois(ma / 9 * 1.5 * gam()); sh += pois(mh / 9 * 1.5 * gam()); }
    if (sa === sh) { if (Math.random() < ma / (ma + mh)) sa++; else sh++; ex++; }
    return { sa, sh, ex };
  }
  /* ---------- 賽程 ---------- */
  function roundRobin(ids) { const l = ids.slice(); l.push(null); const n = l.length, rounds = []; for (let r = 0; r < n - 1; r++) { const m = []; for (let i = 0; i < n / 2; i++) { const a = l[i], b = l[n - 1 - i]; if (a && b) m.push(r % 2 ? { a: b, h: a } : { a, h: b }); } rounds.push(m); l.splice(1, 0, l.pop()); } return rounds; }
  function newState(my, inn) {
    const s = { v: 1, my, inn, k: 0, games: [], out: false, done: false, final: null, log: [] };
    for (const p in D.POOLS) roundRobin(D.POOLS[p]).forEach((m, r) => m.forEach((g, i) => s.games.push({ id: 'P' + p + r + i, k: 'P' + r, pool: p, a: g.a, h: g.h, done: false })));
    return s;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
  const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!(o && o.v === 1 && T(o.my))) return null; if (o.out && !o.done && o.games.some(g => !g.done && (g.a === o.my || g.h === o.my))) o.out = false; return o; } catch (e) { return null; } };      // 舊版 bug 存檔：還有我的比賽沒打卻 out=true → 修回 false
  const wipe = () => { try { localStorage.removeItem(KEY); } catch (e) { } };
  const dayGames = () => S.games.filter(g => g.k === KEYS[S.k]), myGame = () => dayGames().find(g => !g.done && (g.a === S.my || g.h === S.my));
  const win = g => g.sa > g.sh ? g.a : g.h, lose = g => g.sa > g.sh ? g.h : g.a;
  /* 預賽名次：勝場 → 同勝場者互相對戰勝場 → 得失分差 → 總得分 → 球隊強度 */
  function standings(pool) {
    const ids = D.POOLS[pool], rows = ids.map(id => ({ id, w: 0, l: 0, rs: 0, ra: 0 })), by = {}; rows.forEach(r => { by[r.id] = r; });
    const gs = S.games.filter(g => g.pool === pool && g.done);
    gs.forEach(g => { const A = by[g.a], H = by[g.h]; A.rs += g.sa; A.ra += g.sh; H.rs += g.sh; H.ra += g.sa; if (g.sa > g.sh) { A.w++; H.l++; } else { H.w++; A.l++; } });
    const h2h = (id, grp) => gs.filter(g => grp.includes(g.a) && grp.includes(g.h) && win(g) === id).length;
    rows.sort((x, y) => y.w - x.w);
    const out = []; for (let i = 0; i < rows.length;) { let j = i; while (j < rows.length && rows[j].w === rows[i].w) j++; const grp = rows.slice(i, j), ids2 = grp.map(r => r.id); grp.sort((x, y) => h2h(y.id, ids2) - h2h(x.id, ids2) || (y.rs - y.ra) - (x.rs - x.ra) || y.rs - x.rs || strength()[y.id].ovr - strength()[x.id].ovr); out.push(...grp); i = j; }
    return out;
  }
  const poolDone = p => S.games.filter(g => g.pool === p).every(g => g.done);
  function setRes(g, sa, sh, ex) { g.sa = sa; g.sh = sh; g.ex = ex || 0; g.done = true; }
  function mk(k, id, a, h) { S.games.push({ id, k, a, h, done: false }); }
  function enterStage() {      // 進入新階段時產生對戰表
    const k = KEYS[S.k];
    if (k === 'QF') {
      const q = {}; for (const p in D.POOLS) q[p] = standings(p).slice(0, 2).map(r => r.id);
      mk('QF', 'QF1', q.A[0], q.B[1]); mk('QF', 'QF2', q.C[0], q.D[1]); mk('QF', 'QF3', q.B[0], q.A[1]); mk('QF', 'QF4', q.D[0], q.C[1]);
      if (!S.games.some(g => g.k === 'QF' && (g.a === S.my || g.h === S.my))) S.out = true;
    } else if (k === 'SF') { const w = n => win(S.games.find(g => g.id === n)); mk('SF', 'SF1', w('QF1'), w('QF2')); mk('SF', 'SF2', w('QF3'), w('QF4')); }
    else if (k === 'BR') { const l = n => lose(S.games.find(g => g.id === n)); mk('BR', 'BR', l('SF1'), l('SF2')); }
    else if (k === 'FN') { const w = n => win(S.games.find(g => g.id === n)); mk('FN', 'FN', w('SF1'), w('SF2')); }
  }
  function advance() {      // 本日全部打完 → 進入下一階段
    while (!S.done && dayGames().every(g => g.done)) {
      const k = KEYS[S.k];
      if (k === 'SF') { S.games.filter(g => g.k === 'SF').forEach(g => { if (lose(g) === S.my) S.sfLoss = true; }); }
      if (k === 'QF') S.games.filter(g => g.k === 'QF').forEach(g => { if (lose(g) === S.my) S.out = true; });
      if (k === 'BR' && S.games.some(g => g.k === 'BR' && (g.a === S.my || g.h === S.my))) S.out = true;      // 只有我打了季軍賽才算止步；已晉級冠軍賽的隊伍不能被標成淘汰（原 bug：無條件 out=true）
      if (k === 'FN') { const f = S.games.find(g => g.id === 'FN'), b = S.games.find(g => g.id === 'BR'); S.final = [win(f), lose(f), win(b), lose(b)]; S.done = true; break; }
      S.k++; enterStage();
    }
    fixOut(); save();
  }
  function fixOut() { if (S.done) return; const left = S.games.some(g => !g.done && (g.a === S.my || g.h === S.my)); if (S.out && left) S.out = false; }      // 還有我的比賽沒打 → 不可能是淘汰
  function simDay() { dayGames().filter(g => !g.done && g.a !== S.my && g.h !== S.my).forEach(g => { const r = simScore(g.a, g.h); setRes(g, r.sa, r.sh, r.ex); }); advance(); }
  function simMine() { const g = myGame(); if (!g) return null; const r = simScore(g.a, g.h); setRes(g, r.sa, r.sh, r.ex); return g; }
  /* ---------- 開賽（真實 3D 比賽） ---------- */
  function badge(t) { return wbcFlag(t.code); }
  function defOf(t) { return Object.assign({}, TEAMS[0], { id: t.id, name: t.name, short: t.name, card: t.name, c1: t.c1, c2: t.c2, cap: t.cap, home: '', dome: false, hidden: true, icon: badge(t) }); }
  let CFG0 = null;
  function launch(g) {
    const meHome = g.h === S.my, me = T(S.my), op = T(meHome ? g.a : g.h);
    TEAMS[SLOT_MY] = defOf(me); TEAMS[SLOT_OP] = defOf(op);
    if (!CFG0) CFG0 = Object.assign({}, CFG);
    Object.assign(CFG, { H: meHome ? SLOT_MY : SLOT_OP, A: meHome ? SLOT_OP : SLOT_MY, ctl: meHome ? 0 : 1, ord: meHome ? 1 : 0, inn: S.inn, lv: 1, abs: 1, evt: 0, ace: 0, pn: 0, easy: 0, park: g.pool ? D.PARK[g.pool] : D.PARK.K, night: -1, wx: 1 });
    syncCfg(); hide(); $$('title').classList.add('hide'); $$('menu').classList.add('hide'); $$('lineup').classList.add('hide');
    try { sndInit(); bgmScene('wbcGame'); } catch (e) { }      // WBC 比賽專屬背景音樂
    newGame(Object.assign({}, CFG, { edit: [null, null], ace: 0, wbc: { gid: g.id } }));
  }
  function restoreCfg() { if (CFG0) { Object.assign(CFG, CFG0); CFG0 = null; } try { syncCfg(); } catch (e) { } }
  function afterEnd(rs) {      // 真實比賽打完（由 endGame 呼叫）
    const gid = G.wbc && G.wbc.gid, g = S && S.games.find(x => x.id === gid); if (!g || g.done) return;
    const sc = G.score.slice(), aId = G.teams[0].id; let sa = aId === g.a ? sc[0] : sc[1], sh = aId === g.a ? sc[1] : sc[0], ex = 0;
    if (G.forfeit >= 0) { const loserId = G.teams[G.forfeit].id; if (loserId === g.a) { sa = Math.min(sa, sh - 1 < 0 ? 0 : sh - 1); if (sa >= sh) sh = sa + 1; } else { if (sh >= sa) sa = sh + 1; } }
    if (sa === sh) { const ma = mu(g.a, g.h), mh = mu(g.h, g.a); if (Math.random() < ma / (ma + mh)) sa++; else sh++; ex = 1; }
    setRes(g, sa, sh, ex); const mine = win(g) === S.my; banner = `${DAYN[g.k]}：${nm(g.a)} ${g.sa} － ${g.sh} ${nm(g.h)}（${mine ? '勝' : '敗'}）${g.ex ? '　※突破僵局判定' : ''}`;
    try { recReal(g); } catch (e) { console.error(e); }
    restoreCfg(); simDay(); showBrk = true;
    const hb = $$('homeBtn'), ab = $$('againBtn'); if (ab) ab.style.display = 'none';
    if (hb) { hb.textContent = S.done ? '🏆 查看大賽結果' : '▶ 回到經典賽'; hb.onclick = () => { leaveGame(); open(true); }; }
    if (rs) { const n = document.createElement('div'); n.className = 'wb-resnote'; n.textContent = (S.out && !S.done ? '你的球隊已結束本屆旅程。' : S.done ? '大賽已經結束！' : '其餘場次已自動模擬完畢。'); rs.querySelector('.rbox') && rs.querySelector('.rbox').appendChild(n); }
  }
  function recReal(g) {      // 親自打的 3D 比賽：把我方打者的真實 ab／h／hr／rbi 記起來（頒獎的 MVP／全壘打王等會併入）
    const mt = G.teams.find(t => t.id === S.my); if (!mt || !mt.lineup) return; const R = S.real && S.real.team === S.my ? S.real : (S.real = { team: S.my, n: 0, bat: {} }); R.n++;
    mt.lineup.forEach(p => { if (!p || !p.st || p.isPitcherBat) return; const o = R.bat[p.name] || (R.bat[p.name] = { ab: 0, h: 0, hr: 0, rbi: 0 }); o.ab += p.st.ab | 0; o.h += p.st.h | 0; o.hr += p.st.hr | 0; o.rbi += p.st.rbi | 0; });
  }
  let leaving = false;
  function leaveGame() { G.wbc = null; leaving = true; try { quitToMenu(); } catch (e) { } leaving = false; $$('menu').classList.add('hide'); $$('result').classList.add('hide'); $$('hud').classList.add('hide'); G.mode = 'title'; try { CAMC.mode = 'title'; } catch (e) { } restoreCfg(); }
  /* ---------- 畫面 ---------- */
  const dlg = () => $$('wbcDlg'), hide = () => dlg().classList.add('hide'), show = () => dlg().classList.remove('hide');
  const stars = n => { const k = Math.max(1, Math.min(5, Math.round((n - 40) / 11))); return '★'.repeat(k) + '☆'.repeat(5 - k); };
  const chip = id => wbcChip(T(id));
  function selectHTML() {
    const sv = load(), st = strength(); let h = `<div class="wb-top"><button class="wb-btn ghost" data-a="back">← 主畫面</button><div class="wb-ttl"><b>WBC 經典賽</b><small>2026 WORLD BASEBALL CLASSIC　20 隊・4 組預賽・單淘汰</small></div><span></span></div>`;
    if (sv) h += `<div class="wb-resume"><span>偵測到進行中的大賽：<b>${esc(nm(sv.my))}</b>（${DAYN[KEYS[sv.k]] || '已結束'}）</span><button class="wb-btn go" data-a="resume">▶ 繼續大賽</button></div>`;
    h += `<div class="wb-pools">`;
    for (const p in D.POOLS) h += `<div class="wb-pool"><h3>${p} 組<small>${D.POOL_VENUE[p]}</small></h3>${D.POOLS[p].map(id => `<button class="wb-team${sel === id ? ' on' : ''}" data-a="pick" data-id="${id}" style="--c1:${T(id).c1};--c2:${T(id).cap}"><i>${wbcFlag(T(id).code)}</i><b>${esc(T(id).name)}</b><em class="wb-mini" title="${st[id].style}"><u><s>攻</s><span><span class="f" style="width:${st[id].off}%"></span></span><strong>${st[id].off}</strong></u><u class="d"><s>守</s><span><span class="f" style="width:${st[id].def}%"></span></span><strong>${st[id].def}</strong></u></em></button>`).join('')}</div>`;
    h += `</div><div class="wb-detail">`;
    if (!sel) h += `<p class="wb-hint">請選擇你要帶領的國家隊（每組取前兩名晉級八強）</p>`;
    else {
      const t = T(sel), s = st[sel], bats = t.cp.bat.concat(t.cp.bench).slice().sort((x, y) => ovrOf(batProf(y)) - ovrOf(batProf(x))).slice(0, 3).map(b => b.n), ps = t.cp.sp.slice().sort((x, y) => { const f = r => { const q = pitProf(r); return q.stf * .6 + q.ctl * .25 + q.vel * .15; }; return f(y) - f(x); }).slice(0, 2).map(p => p.n), cl = t.cp.rp[t.cp.rp.length - 1].n;
      const bar = (l, v, c) => `<div class="wb-bar${c ? ' ' + c : ''}"><span>${l}</span><div><i style="width:${v}%"></i></div><b>${v}</b></div>`;
      h += `<div class="wb-dh" style="--c1:${t.c1};--c2:${t.cap}"><div class="wb-big">${badge(t)}</div><div><h2>${esc(t.name)}<small>${esc(t.en)}　${t.pool} 組</small></h2><p>總教練：${esc(t.mgr)}　名單 ${t.cp.bat.length + t.cp.bench.length + t.cp.sp.length + t.cp.rp.length} 人</p></div></div><div class="wb-style" data-s="${s.style}"><b>${s.style}</b><span>${stars(s.ovr)}</span></div>${bar('綜合戰力', s.ovr)}${bar('⚔ 進攻', s.off, 'o')}${bar('🛡 防守', s.def, 'd')}<div class="wb-sub2">${bar('先發投手', s.sp)}${bar('牛棚', s.bp)}${bar('野手守備', s.fld)}</div><p class="wb-key">🔥 打線代表：${bats.map(esc).join('、')}<br>⚾ 先發王牌：${ps.map(esc).join('、')}　🧯 終結者：${esc(cl)}</p>`;
      h += `<div class="wb-opt">比賽局數：${[3, 5, 9].map(n => `<button class="wb-pill${opts.inn === n ? ' on' : ''}" data-a="inn" data-n="${n}">${n} 局</button>`).join('')}</div><button class="wb-btn go big" data-a="start">開始經典賽 ▶</button>`;
    }
    return h + `</div>`;
  }
  function gameRow(g, hl) {
    const mine = g.a === S.my || g.h === S.my; return `<div class="wb-g${mine ? ' me' : ''}${hl ? ' hl' : ''}">${chip(g.a)}<span class="n">${esc(nm(g.a))}</span><b class="s">${g.done ? g.sa : '–'}</b><i>:</i><b class="s">${g.done ? g.sh : '–'}</b><span class="n r">${esc(nm(g.h))}</span>${chip(g.h)}${g.ex ? '<em title="突破僵局">延</em>' : ''}</div>`;
  }
  function hubHTML() {
    const t = T(S.my); let h = `<div class="wb-top"><button class="wb-btn ghost" data-a="back">← 主畫面</button><div class="wb-ttl"><b>${esc(t.name)}　<small>${S.done ? '大賽結束' : DAYN[KEYS[S.k]]}</small></b><small>WBC 經典賽・${S.inn} 局制</small></div><button class="wb-btn ghost" data-a="reset">重選球隊</button></div>`;
    if (banner) h += `<div class="wb-banner">${esc(banner)}</div>`;
    if (S.done) return h + finalHTML();
    const mg = myGame(), k = KEYS[S.k];
    h += `<div class="wb-next">`;
    if (mg) { const meHome = mg.h === S.my, opId = meHome ? mg.a : mg.h; h += `<div class="wb-nh">${DAYN[k]}${mg.pool ? '　' + mg.pool + ' 組・' + D.POOL_VENUE[mg.pool] : '　台北大巨蛋'}</div><div class="wb-vs">${gameRow(mg, true)}</div><p class="wb-sub">對手戰力 ${stars(strength()[opId].ovr)}　${meHome ? '你是主場（後攻）' : '你是客場（先攻）'}</p><div class="wb-acts"><button class="wb-btn go" data-a="play">▶ 親自出戰</button><button class="wb-btn" data-a="simone">⚡ 模擬本場</button><button class="wb-btn" data-a="simnext">⏩ 模擬到我的下一場</button><button class="wb-btn" data-a="brk">📊 晉級樹狀圖</button></div>`; }
    else if (S.out) h += `<div class="wb-nh">${S.sfLoss ? '季軍賽已打完，你的賽程結束' : '你的球隊已止步於此'}</div><p class="wb-sub">可以繼續模擬，看看誰會捧起冠軍。</p><div class="wb-acts"><button class="wb-btn" data-a="simday">⏩ 模擬下一日</button><button class="wb-btn go" data-a="simend">⏭ 模擬到大賽結束</button></div>`;
    else h += `<div class="wb-nh">${DAYN[k]}・本隊輪空</div><p class="wb-sub">預賽每隊只打 4 場，今天休息。</p><div class="wb-acts"><button class="wb-btn go" data-a="simday">⏩ 進行下一日</button></div>`;
    h += `</div><div class="wb-tabs">${[['sched', '賽程'], ['stand', '積分榜'], ['ko', '晉級樹狀圖']].map(x => `<button class="${tab === x[0] ? 'on' : ''}" data-a="tab" data-t="${x[0]}">${x[1]}</button>`).join('')}</div><div class="wb-body">`;
    if (tab === 'sched') {
      const mine = S.games.filter(g => g.a === S.my || g.h === S.my); h += `<h4>我的賽程</h4>` + mine.map(g => `<div class="wb-row"><span class="d">${DAYN[g.k]}</span>${gameRow(g)}</div>`).join('') + `<h4>本日全部賽事</h4>` + (dayGames().map(g => gameRow(g)).join('') || '<p class="wb-sub">—</p>');
    } else if (tab === 'stand') {
      for (const p in D.POOLS) { const rows = standings(p), fin = poolDone(p); h += `<table class="wb-tb"><caption>${p} 組　<small>${D.POOL_VENUE[p]}</small></caption><tr><th></th><th>球隊</th><th>勝</th><th>敗</th><th>得</th><th>失</th><th>差</th></tr>${rows.map((r, i) => `<tr class="${r.id === S.my ? 'me' : ''}${fin && i < 2 ? ' up' : ''}"><td>${i + 1}</td><td>${chip(r.id)} ${esc(nm(r.id))}</td><td>${r.w}</td><td>${r.l}</td><td>${r.rs}</td><td>${r.ra}</td><td>${r.rs - r.ra > 0 ? '+' : ''}${r.rs - r.ra}</td></tr>`).join('')}</table>`; }
      h += `<p class="wb-sub">每組前兩名晉級八強。同勝場時依序比：相互對戰、得失分差、總得分。</p>`;
    } else {
      h += pathHTML() + `<div class="bk-scroll">${bracketHTML(false)}</div>`;
    }
    return h + `</div>`;
  }

  /* ---------- 晉級樹狀圖（每場打完自動跳出；勝者高亮、連線描繪、晉級隊伍飛入下一輪格子） ---------- */
  const SEEDS = { QF1: ['A1', 'B2'], QF2: ['C1', 'D2'], QF3: ['B1', 'A2'], QF4: ['D1', 'C2'] }, SRC = { SF1: [['W', 'QF1'], ['W', 'QF2']], SF2: [['W', 'QF3'], ['W', 'QF4']], BR: [['L', 'SF1'], ['L', 'SF2']], FN: [['W', 'SF1'], ['W', 'SF2']] };
  const GN = { QF1: '八強 ①', QF2: '八強 ②', QF3: '八強 ③', QF4: '八強 ④', SF1: '四強 ①', SF2: '四強 ②', BR: '季軍賽', FN: '冠軍賽' }, gById = id => S.games.find(g => g.id === id);
  function slot(gid, i) {      // 某場比賽第 i 側（0 客／1 主）是誰；未決定時回傳說明文字（預賽中顯示「暫定」）
    const g = gById(gid); if (g) return { id: i ? g.h : g.a };
    if (SEEDS[gid]) { const sd = SEEDS[gid][i], pl = sd[0], n = +sd[1], rows = standings(pl); return { id: S.games.some(x => x.pool === pl && x.done) ? rows[n - 1].id : null, proj: true, label: pl + ' 組第' + n + '名' }; }
    const a = SRC[gid][i], sg = gById(a[1]); if (sg && sg.done) return { id: a[0] === 'W' ? win(sg) : lose(sg) };
    return { id: null, label: (a[0] === 'W' ? '' : '敗者 ') + GN[a[1]] + (a[0] === 'W' ? ' 勝者' : '') };
  }
  function bracketHTML(anim) {
    const seen = new Set(S.seen || []), fresh = [], isNew = k => { if (!anim || seen.has(k)) return false; fresh.push(k); return true; }, myNext = myGame();
    const card = gid => {
      const g = gById(gid), fr = g && g.done && isNew('R:' + gid), cur = myNext && myNext.id === gid;
      const rows = [0, 1].map(i => {
        const sl = slot(gid, i); if (!sl.id) return `<div class="bk-t empty"><span>${esc(sl.label)}</span></div>`;
        const w = g && g.done && ((i === 0) === (g.sa > g.sh)), l = g && g.done && !w, land = !sl.proj && isNew('L:' + gid + ':' + i + ':' + sl.id);
        return `<div class="bk-t${w ? ' win' : ''}${l ? ' lose' : ''}${sl.id === S.my ? ' me' : ''}${sl.proj ? ' proj' : ''}${land ? ' land' : ''}">${chip(sl.id)}<span>${esc(nm(sl.id))}${sl.proj ? '<em>暫定</em>' : ''}</span><b>${g && g.done ? (i ? g.sh : g.sa) : ''}</b></div>`;
      }).join('');
      return `<div class="bk-m${fr ? ' fresh' : ''}${cur ? ' cur' : ''}" id="bk-${gid}"><small>${GN[gid]}${g && g.ex ? '　延' : ''}</small>${rows}</div>`;
    };
    const h = `<div class="bk"><div class="bk-col l1"><div class="bk-con"></div>${card('QF1')}${card('QF2')}</div><div class="bk-col l2">${card('SF1')}</div><div class="bk-col c"><div class="bk-tro">🏆</div>${card('FN')}<div class="bk-bz">${card('BR')}</div></div><div class="bk-col r2">${card('SF2')}</div><div class="bk-col r1"><div class="bk-con"></div>${card('QF3')}${card('QF4')}</div></div>`;
    if (anim && fresh.length) { S.seen = (S.seen || []).concat(fresh); save(); }
    return h;
  }
  function cands(gid) { const g = gById(gid); if (g && g.done) return [win(g)]; return [slot(gid, 0).id, slot(gid, 1).id].filter(Boolean); }
  function pathHTML() {      // 我的晉級之路：下一場對手＋若晉級後可能遇到的對手
    if (S.done) return ''; if (S.out) return `<div class="bk-path out">你的球隊已止步，可繼續觀看其他隊伍的晉級。</div>`;
    const k = KEYS[S.k], names = a => a.length ? a.map(id => esc(nm(id))).join('／') : '待定';
    if (k[0] === 'P') {
      const pl = T(S.my).pool, rows = standings(pl), pos = rows.findIndex(r => r.id === S.my) + 1, left = S.games.filter(g => !g.done && (g.a === S.my || g.h === S.my)), g = left[0];
      return `<div class="bk-path">預賽 ${pl} 組目前第 <b>${pos}</b> 名（前 2 名晉級八強）・還剩 ${left.length} 場${g ? '・下一場對手：<b>' + esc(nm(g.a === S.my ? g.h : g.a)) + '</b>' : ''}</div>`;
    }
    const mg = S.games.find(g => !g.done && (g.a === S.my || g.h === S.my)); if (!mg) return '';
    const nxt = { QF1: 'QF2', QF2: 'QF1', QF3: 'QF4', QF4: 'QF3' };
    let t = `<div class="bk-path">${GN[mg.id]}：對手 <b>${names([mg.a === S.my ? mg.h : mg.a])}</b>`;
    if (nxt[mg.id]) t += `<br>若晉級四強：對上 <b>${names(cands(nxt[mg.id]))}</b>（${GN[nxt[mg.id]]}勝者）`;
    if (mg.id[0] === 'Q' || mg.id === 'SF1' || mg.id === 'SF2') { const other = (mg.id === 'SF1' || mg.id === 'QF1' || mg.id === 'QF2') ? 'SF2' : 'SF1'; t += `<br>若進決賽：對上 <b>${names(cands(other))}</b>（${GN[other]}勝者）`; }
    return t + '</div>';
  }
  function poolsMini() {
    if (KEYS[S.k][0] !== 'P') return ''; let h = '<div class="bk-pools">';
    for (const p in D.POOLS) h += `<div><b>${p} 組</b>${standings(p).map((r, i) => `<div class="${i < 2 ? 'up' : ''}${r.id === S.my ? ' me' : ''}">${i + 1} ${chip(r.id)} <span>${esc(nm(r.id))}</span><em>${r.w}-${r.l}</em></div>`).join('')}</div>`;
    return h + '</div>';
  }
  function overlayHTML() {
    return `<div class="wb-ov"><div class="wb-ovi"><div class="wb-ovh"><b>🏟 晉級樹狀圖</b>${banner ? '<span>' + esc(banner) + '</span>' : ''}</div>${pathHTML()}<div class="bk-scroll">${bracketHTML(true)}</div>${poolsMini()}<div class="wb-acts"><button class="wb-btn go" data-a="brkclose">${S.done ? '🏆 查看大賽結果' : '繼續 ▶'}</button></div></div></div>`;
  }
  function finalHTML() {
    const f = S.final, lab = ['🥇 冠軍', '🥈 亞軍', '🥉 季軍', '殿軍'], pos = f.indexOf(S.my);
    return `<div class="wb-final"><div class="wb-trophy">🏆</div><h2>${esc(nm(f[0]))} 奪下冠軍！</h2><p class="wb-sub">${pos === 0 ? '恭喜！你帶領 ' + esc(nm(S.my)) + ' 登上世界之巔！' : pos > 0 ? esc(nm(S.my)) + ' 最終名列' + lab[pos] : esc(nm(S.my)) + ' 止步於' + (S.games.some(g => g.k === 'QF' && (g.a === S.my || g.h === S.my)) ? '八強' : '預賽')}</p><div class="wb-podium">${f.map((id, i) => `<div class="${id === S.my ? 'me' : ''}"><span>${lab[i]}</span>${chip(id)} <b>${esc(nm(id))}</b></div>`).join('')}</div><div class="wb-acts"><button class="wb-btn go" data-a="cer">🎖 觀看頒獎典禮</button><button class="wb-btn" data-a="again">再玩一次</button><button class="wb-btn" data-a="back">返回主畫面</button></div></div><div class="wb-body">${S.awards && typeof WBC_CER !== 'undefined' ? WBC_CER.listHTML(S.awards, D) : ''}${['QF', 'SF', 'BR', 'FN'].map(k => `<h4>${DAYN[k]}</h4>` + S.games.filter(g => g.k === k).map(g => gameRow(g)).join('')).join('')}</div>`;
  }
  function render() { dlg().innerHTML = `<div class="wb-wrap">${S ? hubHTML() : selectHTML()}</div>` + (S && showBrk ? overlayHTML() : ''); const w = dlg().firstChild; if (w) w.scrollTop = 0; }
  function open(keep) {      // keep=true：直接回到進行中的大賽畫面
    try { sndInit(); } catch (e) { } $$('title').classList.add('hide'); show(); try { bgmScene('wbcMenu'); } catch (e) { }      // WBC 選單專屬背景音樂
    if (!keep) { S = null; banner = ''; showBrk = false; }
    if (keep && !S) S = load(); render();
  }
  function startCeremony() {      // 大賽結束 → 頒獎典禮（冠亞季軍全員上台）→ 結尾詢問是否回主畫面
    if (!S || !S.done || typeof WBC_CER === 'undefined') return false; S.cer = true; save(); try { bgmScene('victory'); } catch (e) { }      // 頒獎典禮改播「冠軍之夜」
    WBC_CER.play({ S, D, save, onHome: () => { toTitle(); }, onStay: () => { try { bgmScene('wbcMenu'); } catch (e) { } showBrk = false; render(); } }); return true;
  }
  function toTitle() { try { bgmSceneEnd(); } catch (e) { } hide(); $$('title').classList.remove('hide'); G.mode = 'title'; try { CAMC.mode = 'title'; } catch (e) { } }
  function act(a, el) {
    if (a === 'back') return toTitle();
    if (a === 'pick') { sel = el.dataset.id; return render(); }
    if (a === 'inn') { opts.inn = +el.dataset.n; return render(); }
    if (a === 'start') { if (!sel) return; showBrk = false; wipe(); S = newState(sel, opts.inn); banner = ''; save(); return render(); }
    if (a === 'resume') { S = load(); banner = ''; showBrk = false; return render(); }
    if (a === 'reset') { if (confirm('放棄目前進度、重新選擇球隊？')) { wipe(); S = null; sel = null; banner = ''; render(); } return; }
    if (a === 'again') { showBrk = false; wipe(); S = null; sel = null; banner = ''; return render(); }
    if (a === 'brk') { showBrk = true; return render(); }
    if (a === 'brkclose') { const first = S && S.done && !S.cer; showBrk = false; render(); if (first) startCeremony(); return; }
    if (a === 'cer') { showBrk = false; return startCeremony(); }
    if (a === 'tab') { tab = el.dataset.t; return render(); }
    if (a === 'play') { const g = myGame(); if (g) launch(g); return; }
    if (a === 'simone') { const g = simMine(); if (g) { banner = `${DAYN[g.k]}：${nm(g.a)} ${g.sa} － ${g.sh} ${nm(g.h)}（${win(g) === S.my ? '勝' : '敗'}）${g.ex ? '　※延長／突破僵局' : ''}`; simDay(); showBrk = true; } return render(); }
    if (a === 'simday') { simDay(); banner = ''; showBrk = true; return render(); }
    if (a === 'simnext') { simMine(); simDay(); banner = ''; let n = 0; while (!S.done && !S.out && !myGame() && n++ < 20) simDay(); showBrk = true; return render(); }
    if (a === 'simend') { let n = 0; while (!S.done && n++ < 20) simDay(); banner = ''; showBrk = true; return render(); }
  }
  /* ---------- 初始化：按鈕與事件 ---------- */
  function init() {
    const d = dlg(); if (!d) return; d.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el) act(el.dataset.a, el); });
    const b = $$('tmWbc'); if (b) b.onclick = () => open(false);
    const sv = $$('btnSave'); if (sv) { const old = sv.onclick; sv.onclick = function (e) { if (G && G.wbc) { try { toast('WBC 經典賽比賽中不能存檔（賽程進度會自動保存）'); } catch (_) { } return; } return old && old.call(this, e); }; }
  }
  init();
  try { const _q = quitToMenu; quitToMenu = function () { const r = _q.apply(this, arguments); if (!leaving) { try { bgmSceneEnd(); } catch (e) { } } return r; }; } catch (e) { }      // 比賽中途直接退出 → 換回玩家原本的曲子
  return { open, afterEnd, startCeremony, _t: { simMine, simScore, standings, roundRobin, newState, strength, enterStage, advance, simDay, setS: s => { S = s; }, getS: () => S, mu } };
})();
