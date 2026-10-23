/* ===== 13m-career-hub.js ｜ 生涯模式「總選單」（HUB）：進入生涯後的第一個畫面 =====
   分頁：總覽／賽程月曆／訓練休息／交友／交易合約／消費／戰績。
   規則：賽程月曆上，只有「下一場」比賽日點下去才能進入比賽畫面；沒有比賽的日子（休兵日）可以安排 訓練／休息／約會／找人聊聊（同一天一個）。
   載入順序：13i、13k 之後、14 之前。本檔不碰其他檔的全域（只在存在時使用 CSCENE 橫幅圖）；資料與動作由 13e 的 hubApi() 以函式傳入，
   休兵日行動、交友、消費的邏輯在 13i（CECON.hubDo／hubActs／ensureHub／buy／tradeTry）；本檔只負責畫面與導覽。存檔欄位 P.hub（見 13i 說明）。
   純函式（可在 Node 測）：calendarCells／monthsOf／contractView／awardRows／gameResult／lastPlayedKey／offDaysBefore／dayKey／dayInfo。 */
'use strict';
const CHUB = (function () {
  const TABS = [['home', '總覽'], ['sched', '🗓 賽程'], ['train', '🏋 訓練休息'], ['friend', '🤝 交友'], ['trade', '🔁 交易合約'], ['shop', '🛍 消費'], ['rec', '📈 戰績']];
  const BANNER = { home: 'HUB_OVERVIEW', sched: 'HUB_SCHEDULE', train: 'HUB_TRAIN', friend: 'HUB_FRIEND', trade: 'HUB_CONTRACT', shop: 'HUB_SHOP', rec: 'HUB_RECORD' };
  const HOW = { resign: '續約', fa: '自由球員簽約', trade: '交易', release: '被釋出後簽約' };
  const ACT_TX = { train: '🏋 專項訓練', rehab: '🩹 復健', rest: '💤 休息', date: '💞 約會', coach: '🤝 找總教練', veteran: '🤝 找前輩', mate: '🤝 找好友', pmeet: '🧢 結識投手前輩' };
  const actTx = act => (String(act).indexOf('pask:') === 0 ? '🧢 請教投手前輩' : ACT_TX[act] || act);
  const S = { tab: 'home', month: null, sel: null, msg: '' };
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  /* ---------- 純函式 ---------- */
  const dayKey = (y, m, d) => y * 10000 + m * 100 + d;
  const keyDate = k => ({ y: Math.floor(k / 10000), m: Math.floor(k / 100) % 100, d: k % 100 });
  const monthsOf = games => Array.from(new Set((games || []).map(g => g.m)));
  function calendarCells(games, y, m) {      // m：1～12；從週日起算、前後補空格；每格 {d, key, g}
    const first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate(), by = {};
    (games || []).forEach(g => { if (g.y === y && g.m === m) by[g.d] = g; });
    const cells = []; for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push({ d, key: dayKey(y, m, d), g: by[d] || null });
    while (cells.length % 7) cells.push(null);
    return { cells, rows: cells.length / 7 };
  }
  const gameResult = (P, g) => { const r = P.res && P.res[g.id]; if (!r) return null; const home = g.home === P.team, my = home ? r[0] : r[1], op = home ? r[1] : r[0]; return { my, op, t: my > op ? 'W' : my < op ? 'L' : 'T' }; };
  const lastPlayedKey = (P, games) => (games || []).reduce((k, g) => (P.res && P.res[g.id] != null && g.date > k ? g.date : k), 0);
  function offDaysBefore(a) {      // 「下一場」之前、上一場之後的休兵日（可安排行動的日子），回傳日期鍵陣列
    if (!a.next) return []; const out = [], lo = Math.max(lastPlayedKey(a.P, a.games), (a.seasonStartKey || 0) - 1), hi = a.next.date, have = {};
    a.games.forEach(g => { have[g.date] = 1; });
    const n = keyDate(hi), dt = new Date(n.y, n.m - 1, n.d); for (let i = 0; i < 60; i++) { dt.setDate(dt.getDate() - 1); const k = dayKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); if (k <= lo) break; if (!have[k]) out.unshift(k); }
    return out;
  }
  function dayInfo(a, key) {      // 這一天是什麼狀態：game-next／game-later／game-done／off-open／off-done／off-past／off-future
    const g = a.games.find(x => x.date === key), P = a.P, done = P.hub && P.hub.days && P.hub.days[key];
    if (g) { if (P.res[g.id] != null) return { kind: 'game-done', g }; return { kind: a.next && a.next.id === g.id ? 'game-next' : 'game-later', g }; }
    if (done) return { kind: 'off-done', act: done };
    if (!a.next) return { kind: 'off-past' };
    if (key >= a.next.date) return { kind: 'off-future' };
    return { kind: offDaysBefore(a).indexOf(key) >= 0 ? 'off-open' : 'off-past' };
  }
  function contractView(P, teams) {
    const c = P && P.contract; if (!c) return null;
    const tn = i => (teams && teams[i] ? teams[i].name : '—');
    return {
      team: tn(c.team != null ? c.team : P.team), years: c.years | 0, left: c.left | 0, salary: c.salary | 0, since: c.since | 0, expiring: (c.left | 0) <= 0,
      pending: P.pending ? { team: tn(P.pending.team != null ? P.pending.team : P.team), years: P.pending.years, salary: P.pending.salary, how: HOW[P.pending.how] || '簽約' } : null,
      moves: (P.moves || []).map(m => ({ year: m.year, from: tn(m.from), to: tn(m.to), how: HOW[m.how] || '轉隊' }))
    };
  }
  const awardRows = hist => (hist || []).filter(h => h && h.aw && h.aw.length).map(h => ({ year: h.year, aw: h.aw }));

  /* ---------- 畫面 ---------- */
  const STYLE = `#csDlg .hub .hubTabs{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0 8px}
#csDlg .hub .hubTabs button{padding:6px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font-weight:700}
#csDlg .hub .hubTabs button.on{background:#ffd166;color:#2a1a00;border-color:#ffd166}
#csDlg .hub .stScene svg{max-height:14vh}
#csDlg .hub .hubCal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin:6px 0}
#csDlg .hub .hubCal .wd{text-align:center;font-size:11px;opacity:.7}
#csDlg .hub .hubCal .c{min-height:46px;border-radius:6px;padding:2px 3px;font-size:11px;line-height:1.25;background:rgba(255,255,255,.05);border:1px solid transparent;overflow:hidden;color:#fff;text-align:left;font-weight:500}
#csDlg .hub .hubCal .c.e{background:none;border:0}
#csDlg .hub .hubCal .c b{font-size:11px;opacity:.85}
#csDlg .hub .hubCal .c.W{background:rgba(60,170,90,.35)}
#csDlg .hub .hubCal .c.L{background:rgba(214,60,60,.35)}
#csDlg .hub .hubCal .c.T{background:rgba(160,160,160,.3)}
#csDlg .hub .hubCal .c.up{border-color:rgba(255,255,255,.25)}
#csDlg .hub .hubCal .c.nx{border:2px solid #ffd166;box-shadow:0 0 8px rgba(255,209,102,.6)}
#csDlg .hub .hubCal .c.op{border:1px dashed #7fd1ff;background:rgba(127,209,255,.12)}
#csDlg .hub .hubCal .c.dn{background:rgba(127,209,255,.3)}
#csDlg .hub .hubCal .c.sel{outline:2px solid #fff}
#csDlg .hub .hubCal .c.off{opacity:.5}
#csDlg .hub .chips{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}
#csDlg .hub .chips button{padding:5px 10px;border-radius:8px;border:1px solid rgba(127,209,255,.6);background:rgba(127,209,255,.14);color:#fff}
#csDlg .hub .chips button.dn{background:rgba(127,209,255,.35)}
#csDlg .hub .chips button.sel{outline:2px solid #fff}
#csDlg .hub .kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:6px 0}
#csDlg .hub .kv span:nth-child(odd){opacity:.7}
#csDlg .hub .acts{display:flex;flex-direction:column;gap:5px;margin:6px 0}
#csDlg .hub .acts button{text-align:left;padding:8px 12px}
#csDlg .hub .acts button[disabled]{opacity:.5}
#csDlg .hub .acts small{display:block;opacity:.75}
#csDlg .hub .bar{height:8px;border-radius:4px;background:rgba(255,255,255,.15);overflow:hidden}
#csDlg .hub .bar i{display:block;height:100%;background:#ffd166}`;
  let styled = false;
  function addStyle() { if (styled || typeof document === 'undefined') return; styled = true; try { const st = document.createElement('style'); st.id = 'cHubCss'; st.textContent = STYLE; document.head.appendChild(st); } catch (e) { } }
  function banner(tab) { try { if (typeof CSCENE !== 'undefined' && CSCENE.html) return CSCENE.html({ id: BANNER[tab] }, 'pro_start'); } catch (e) { } return ''; }
  const tabsHtml = tab => `<div class="hubTabs">${TABS.map(t => `<button data-hub="${t[0]}"${t[0] === tab ? ' class="on"' : ''}>${t[1]}</button>`).join('')}</div>`;
  const kv = rows => `<div class="kv">${rows.map(r => `<span>${r[0]}</span><span>${r[1]}</span>`).join('')}</div>`;
  const needEco = '<div class="task">這個功能需要經濟系統（13i）。</div>';
  const keyTx = (a, k) => { const t = keyDate(k), wd = new Date(t.y, t.m - 1, t.d).getDay(); return `${t.m}/${t.d}（${a.wd[wd]}）`; };
  const offerTx = (a, o) => `${a.esc(a.teams[o.team].name)}・${o.years} 年・年薪 ${o.salary} 萬・${o.role === 'starter' ? '有先發機會' : '從板凳開始'}`;
  const myRow = a => { const T = a.standings || [], i = T.findIndex(x => x.i === a.P.team); return i < 0 ? null : { rank: i + 1, w: T[i].w, l: T[i].l, t: T[i].t, pct: T[i].pct }; };

  function dayPanel(a, key) {      // 選了某一天之後出現在畫面下方的面板
    if (!key) return '<div class="task">點一個日期：<b>金框</b>＝下一場比賽（點了可以進入比賽畫面）；<b>藍色虛線</b>＝休兵日，可以安排訓練、休息、約會或找人聊聊。</div>';
    const inf = dayInfo(a, key), title = keyTx(a, key), esc = a.esc;
    if (inf.kind === 'game-next') { const g = inf.g, home = g.home === a.P.team, opp = a.teams[home ? g.away : g.home]; return `<div class="task">⚾ <b>${title}</b>　${home ? '主場' : '客場'}對 ${esc(opp.name)}（系列 ${g.g}/3）<br><small>${a.P.level === 'farm' ? '你在二軍：進入後可以直接出結果或快轉。' : '進入比賽畫面後，可選全程觀看、自動模擬或直接出結果。'}</small></div><div class="btns"><button id="hubGo" class="pri">▶ 進入比賽畫面</button></div>`; }
    if (inf.kind === 'game-later') { const g = inf.g, home = g.home === a.P.team, opp = a.teams[home ? g.away : g.home]; return `<div class="task">⚾ <b>${title}</b>　${home ? '主場' : '客場'}對 ${esc(opp.name)}<br><small>還沒輪到這一場，要先打完前面的比賽。</small></div>`; }
    if (inf.kind === 'game-done') { const g = inf.g, r = gameResult(a.P, g), opp = a.teams[g.home === a.P.team ? g.away : g.home]; return `<div class="task">⚾ <b>${title}</b>　對 ${esc(opp.name)}：${r.my}:${r.op} ${r.t === 'W' ? '勝' : r.t === 'L' ? '敗' : '和'}</div>`; }
    if (inf.kind === 'off-done') return `<div class="task">📌 <b>${title}</b>　已安排：${actTx(inf.act)}</div>`;
    if (inf.kind === 'off-past') return `<div class="task"><b>${title}</b>　休兵日（已過去，沒有安排）。</div>`;
    if (inf.kind === 'off-future') return `<div class="task"><b>${title}</b>　休兵日。要等打完前面的比賽，輪到這段空檔時才能安排。</div>`;
    if (!a.E) return needEco;
    const acts = a.E.hubActs(a.P);
    return `<div class="task">📅 <b>${title}</b>　休兵日：選一件事來做（一天只能一個，選了不能改）</div><div class="acts">${acts.map(x => `<button data-do="${x.id}"${x.can ? '' : ' disabled'}>${x.label}<small>${x.hint}${x.why ? '・' + x.why : ''}</small></button>`).join('')}</div>`;
  }
  function pageHome(a) {
    const P = a.P, p = a.prof, g = a.next, teams = a.teams, esc = a.esc, cv = a.contract, r = myRow(a);
    const played = a.games.filter(x => P.res[x.id] != null).length, all = a.games.length;
    let nx = '賽季已打完。'; if (g) { const home = g.home === P.team, opp = teams[home ? g.away : g.home]; nx = `${g.m}/${g.d}（${a.wd[g.wd]}）${home ? '主場' : '客場'}對 ${esc(opp.name)}（系列 ${g.g}/3）`; }
    const rows = [['球隊', esc(teams[P.team].name)], ['角色', `${esc(p.name)} #${p.num}・${esc(p.pos === 'TWP' ? '二刀流' : p.pos)}`], ['身分', esc(a.roleTx)], ['年度／進度', `第 ${P.year || 1} 年・${played} / ${all} 場`]];
    if (r) rows.push(['球隊戰績', `${r.w} 勝 ${r.l} 敗 ${r.t} 和　勝率 ${r.pct.toFixed(3).replace(/^0/, '')}　第 ${r.rank} 名`]);
    rows.push(['信賴度', P.trust], ['下一場', nx]);
    if (a.E && a.E.injured && a.E.injured(P)) rows.push(['傷勢', `🚑 ${esc(P.injury.name)}（${esc(P.injury.why)}）・還要缺陣 ${P.injury.games} 場`]);
    if (a.eco) rows.push(['存款', `${Math.round(P.money || 0)} 萬`], ['體能／心情', `${P.fit} ／ ${P.mood}`], ['運動設備', `Lv${P.gear | 0}`]);
    if (a.E && a.E.gameMood) { const gm = a.E.gameMood(P), pc = (gm - 50) / 50 * 4.5; rows.push(['開賽狀態', `${gm}（約 ${pc >= 0 ? '+' : ''}${pc.toFixed(1)}% 能力；體能、心情、設備都會影響）`]); }
    if (cv) rows.push(['合約', `剩 ${cv.left} 年・年薪 ${cv.salary} 萬`]);
    return kv(rows) + `<div class="task">👉 到「🗓 賽程」點下一場比賽的日期就能開打；比賽之間的空檔可以到「🏋 訓練休息」安排。</div><div class="btns"><button id="hubTitle">返回主畫面</button></div>`;
  }
  function pageSched(a) {
    const P = a.P, games = a.games, ms = monthsOf(games), teams = a.teams, esc = a.esc;
    if (S.month == null || ms.indexOf(S.month) < 0) S.month = a.next ? a.next.m : ms[ms.length - 1];
    const sample = games.find(x => x.m === S.month), y = sample ? sample.y : 2027, cal = calendarCells(games, y, S.month);
    const cells = cal.cells.map(c => {
      if (!c) return '<div class="c e"></div>'; const sel = S.sel === c.key ? ' sel' : '';
      if (!c.g) { const k = dayInfo(a, c.key).kind; const cls = k === 'off-open' ? 'op' : k === 'off-done' ? 'dn' : 'off'; return `<button class="c ${cls}${sel}" data-day="${c.key}"><b>${c.d}</b>${k === 'off-done' ? '<br>✔' : k === 'off-open' ? '<br>休' : ''}</button>`; }
      const g = c.g, home = g.home === P.team, opp = teams[home ? g.away : g.home], r = gameResult(P, g), nx = a.next && a.next.id === g.id;
      return `<button class="c ${r ? r.t : 'up'}${nx ? ' nx' : ''}${sel}" data-day="${c.key}"><b>${c.d}</b> ${home ? '主' : '客'}<br>${esc(opp.short)}${r ? `<br>${r.my}:${r.op}` : ''}</button>`;
    }).join('');
    const mt = ms.map(m => `<button data-m="${m}"${m === S.month ? ' class="on"' : ''}>${m} 月</button>`).join('');
    return `<div class="hubTabs">${mt}</div><div class="hubCal">${WEEK.map(w => `<div class="wd">${w}</div>`).join('')}${cells}</div><div class="sub">綠＝勝　紅＝敗　灰＝和　金框＝下一場　藍虛線＝可安排的休兵日　✔＝已安排</div>${dayPanel(a, S.sel)}<div class="btns"><button id="hubTable">📋 列表式賽程</button></div>`;
  }
  function pageTrain(a) {
    if (!a.E) return needEco; const P = a.P, H = a.E.ensureHub(P), days = offDaysBefore(a);
    const GR = a.E.ensureGrow ? a.E.ensureGrow(P) : { tp: 0 }, hurt = !!(a.E.injured && a.E.injured(P));
    let h = kv([['體能', `${P.fit} / ${a.E.fitCap(P)}`], ['心情', P.mood], ['訓練次數（本季）', `${H.trainGain} 次`], ['訓練點（本季）', `${GR.tp}（休賽季轉成永久能力）`], ['訓練效果倍率', `×${a.E.trainMult(P)}`]]);
    if (hurt) h += `<div class="task">🚑 <b>${a.esc(P.injury.name)}</b>（${a.esc(P.injury.why)}）：還要缺陣 ${P.injury.games} 場。傷癒前不能專項訓練，休兵日可以安排「復健」，不保證縮短傷期。</div>`;
    const ab = P.abil || {}, abK = Object.keys(ab).filter(k => ab[k] > 0);
    h += `<div class="task">📈 <b>永久能力成長</b>：${abK.length ? abK.map(k => `${a.E.AB_NAME[k] || k} +${ab[k]}`).join('、') : '還沒有（訓練、出賽、球隊戰績、交友都會累積，每年休賽季結算）'}<br><small>偏細微：每項每季最多 +3、終身最多 +${a.E.ABIL_LIFE_CAP}（體能上限 +10），越高越難練；重傷整季會讓成長減半。</small></div>`;
    const pos = a.prof.pos, isPit = pos === 'P' || pos === 'TWP';
    if (a.E.focusOptions) {      // A5：訓練方向（長期保留、可隨時改）；結算時該方向的成長機率較高
      const opts = a.E.focusOptions(P, pos), cur = (P.grow && P.grow.focus) || null;
      h += `<div class="task">🎯 <b>訓練方向</b>：${a.esc(a.E.focusLabel(P, pos))}<br><small>指定後，休賽季結算時該方向更容易進步（其他方向略少）；仍受每季／終身上限限制，可隨時更改。${isPit ? '選擇球種＝把球種經驗主要分給它。' : ''}</small></div><div class="chips">${opts.map(o => `<button data-focus="${o.key == null ? '' : a.esc(o.key)}" class="${(o.key || null) === cur ? 'sel' : ''}">${a.esc(o.label)}</button>`).join('')}</div>`;
    }
    if (isPit && a.E.pitchView) {
      const pv = a.E.pitchView(P);
      if (pv.length) h += `<div class="task">⚾ <b>球種等級</b>（越高變化量越大；訓練、出賽、球隊戰績累積經驗，每季每球種最多升 1 級）<br>${pv.map(v => `${a.esc(v.name)} Lv${v.lv}／${v.max}${v.lv >= v.max ? '（已到上限）' : `（進度 ${v.pct}%）`}${v.learned ? ' 🆕' : ''}`).join('　')}</div>`;
    }
    if (!a.next) return h + '<div class="task">賽季已打完。</div>';
    h += days.length ? `<div class="task">下一場前還有 <b>${days.length}</b> 個休兵日可以安排（點日期）：</div><div class="chips">${days.map(k => `<button data-day="${k}" class="${H.days[k] ? 'dn ' : ''}${S.sel === k ? 'sel' : ''}">${keyTx(a, k)}${H.days[k] ? ' ✔' : ''}</button>`).join('')}</div>` : '<div class="task">下一場之前沒有空檔（連續比賽日）。打完這一輪，等下一個休兵日再來安排。</div>';
    return h + (S.sel ? dayPanel(a, S.sel) : '');
  }
  function pageFriend(a) {
    if (!a.E) return needEco; const H = a.E.ensureHub(a.P), F = a.E.FRIENDS;
    const rows = Object.keys(F).map(k => { const f = H.fr[k]; return `<div class="task">🤝 <b>${F[k].label}</b>　好感 ${f.aff}/100${f.got ? '　★已達 50' : ''}<div class="bar"><i style="width:${f.aff}%"></i></div></div>`; }).join('');
    let pm = '';
    if (a.E.mentorList && a.E.ensureGrow && (a.P.pitchLab && a.P.pitchLab.base)) {      // A5：投手限定——虛構的投手前輩，好感夠高請教有機會學到新球種
      const ml = a.E.mentorList(a.P), M = a.E.MENTORS, PN = a.E.PITCH_NAME;
      pm = `<div class="sub">投手前輩（可學新球種）</div>` + (ml.met.length ? ml.met.map(k => { const mt = a.P.pitchLab.mentors[k]; return `<div class="task">🧢 <b>${a.esc(M[k].label)}</b>　招牌：${a.esc(PN[M[k].pitch])}　好感 ${mt.aff}/${M[k].need}${mt.aff >= M[k].need ? '　★可以請教' : ''}<div class="bar"><i style="width:${Math.min(100, Math.round(mt.aff / M[k].need * 100))}%"></i></div></div>`; }).join('') : '<div class="task">還沒認識任何投手前輩。休兵日選「🧢 結識新的投手前輩」。</div>') + `<div class="task">還有 ${ml.unmet.length} 位沒認識${ml.full ? `（球種已達 ${a.E.MAX_PITCHES} 種上限，學不到更多了）` : ''}。學會的新球種從 Lv1 起步，要靠訓練慢慢升級。<br><small>這些前輩都是遊戲虛構角色，不代表任何真人。</small></div>`;
    }
    return `${rows}${pm}<div class="task">好感度在休兵日「找他聊聊」時增加（到「🏋 訓練休息」或賽程的休兵日選擇）。好感達 50 有一次性回饋：教練＋3 信賴度、前輩＋訓練次數上限、好友＋心情。<br><small>這些人物都是遊戲虛構角色，不代表任何真人。</small></div>`;
  }
  function pageTrade(a) {
    const cv = a.contract, esc = a.esc; if (!cv || !a.E) return needEco; const P = a.P, H = a.E.ensureHub(P);
    let h = kv([['球團', esc(cv.team)], ['簽約年度', `第 ${cv.since} 年`], ['合約年數', `${cv.years} 年`], ['剩餘年數', `${cv.left} 年`], ['年薪', `${cv.salary} 萬（虛構單位）`]]);
    h += cv.expiring ? '<div class="task">⚠ 合約到期：本季結束後會進入市場（續約、自由球員或交易）。</div>' : `<div class="task">合約還有 ${cv.left} 年，休賽季不會進入自由市場。</div>`;
    if (cv.pending) h += `<div class="task">📝 已談妥：${esc(cv.pending.how)}（${esc(cv.pending.team)}・${cv.pending.years} 年・年薪 ${cv.pending.salary} 萬），<b>下一年生效</b>。</div>`;
    if (H.tradeOffers && H.tradeOffers.length) h += `<div class="task">🔁 球團同意了你的交易要求，有以下去處（選了從下一年起生效）：</div><div class="acts">${H.tradeOffers.map((o, i) => `<button data-pick="${i}">${offerTx(a, o)}</button>`).join('')}<button data-cancel="1">↩ 改變主意，留在原球隊</button></div>`;
    else if (cv.pending) { /* 已有安排，不能再要求 */ }
    else if (H.tradeAsked) h += '<div class="task">今年已經提出過交易要求了（每年一次）。</div>';
    else h += '<div class="acts"><button data-trade="1">🔁 要求交易<small>成功率依本季表現 30～90%；失敗心情 −8；每年一次；成功後下一年才生效，信賴度會打折。</small></button></div>';
    if (cv.moves.length) h += `<div class="sub">轉隊紀錄</div><table><tr><th>年</th><th>原球隊</th><th>新球隊</th><th>方式</th></tr>${cv.moves.map(m => `<tr><td>${m.year}</td><td>${esc(m.from)}</td><td>${esc(m.to)}</td><td>${esc(m.how)}</td></tr>`).join('')}</table>`;
    return h;
  }
  function pageShop(a) {
    if (!a.E) return needEco; const st = a.E.status(a.P);
    return kv([['存款', `${st.money} 萬`], ['體能', `${st.fit} / ${st.fitCap}`], ['心情', st.mood], ['運動設備', `Lv${st.gear}`], ['訓練效果倍率', `×${st.mult}`]]) +
      `<div class="acts">${st.items.map(it => `<button data-buy="${it.id}"${it.can ? '' : ' disabled'}>${a.esc(it.label)}　${it.cost ? it.cost + ' 萬' : ''}<small>${a.esc(it.hint)}${it.limit && it.id !== 'gear' ? `（${it.used}/${it.limit}）` : ''}${it.why ? '・' + a.esc(it.why) : ''}</small></button>`).join('')}</div>`;
  }
  function pageRec(a) {
    const esc = a.esc, aw = awardRows(a.P.hist), T = a.standings || [];
    let h = a.statLine || '<div class="task">本季尚無成績。</div>';
    if (T.length) h += `<div class="sub">聯盟戰績（勝－敗－和）</div><table><tr><th>名次</th><th>球隊</th><th>勝-敗-和</th><th>勝率</th><th>得／失分</th></tr>${T.map((x, i) => `<tr${x.i === a.P.team ? ' style="background:#ffe14a22"' : ''}><td>${i + 1}</td><td style="text-align:left">${esc(a.teams[x.i].name)}</td><td>${x.w}-${x.l}-${x.t}</td><td>${x.pct.toFixed(3).replace(/^0/, '')}</td><td>${x.rs}/${x.ra}</td></tr>`).join('')}</table>`;
    const hh = a.histHtml; h += hh ? `<div class="sub">歷年球隊戰績</div>${hh}` : '';
    h += aw.length ? `<div class="sub">歷年榮譽</div><table>${aw.map(r => `<tr><td>第 ${r.year} 年</td><td style="text-align:left">${r.aw.map(esc).join('、')}</td></tr>`).join('')}</table>` : '';
    return h;
  }
  const PAGES = { home: pageHome, sched: pageSched, train: pageTrain, friend: pageFriend, trade: pageTrade, shop: pageShop, rec: pageRec };

  function render(api, back) {
    addStyle(); const a = api(); if (!PAGES[S.tab]) S.tab = 'home'; if (a.E) a.E.ensureHub(a.P);
    const msg = S.msg ? `<div class="task">${a.esc(S.msg)}</div>` : ''; S.msg = '';
    a.show(`<div class="csb hub"><h2>☰ 生涯總選單</h2>${banner(S.tab)}${tabsHtml(S.tab)}${msg}${PAGES[S.tab](a)}</div>`);
    const $ = id => document.getElementById(id), on = (id, f) => { const e = $(id); if (e) e.onclick = f; }, again = () => render(api, back), all = sel => document.querySelectorAll('#csDlg ' + sel);
    all('[data-hub]').forEach(b => { b.onclick = () => { S.tab = b.dataset.hub; S.sel = null; again(); }; });
    all('[data-m]').forEach(b => { b.onclick = () => { S.month = +b.dataset.m; again(); }; });
    all('[data-day]').forEach(b => { b.onclick = () => { S.sel = +b.dataset.day; again(); }; });
    all('[data-focus]').forEach(b => { b.onclick = () => { const r = a.E.setFocus(a.P, b.dataset.focus || null, a.prof.pos); S.msg = r.msg; if (r.ok) a.save(); again(); }; });
    all('[data-do]').forEach(b => { b.onclick = () => { const r = a.E.hubDo(a.P, S.sel, b.dataset.do); S.msg = r.msg; if (r.ok) a.save(); again(); }; });
    all('[data-buy]').forEach(b => { b.onclick = () => { const r = a.E.buy(a.P, b.dataset.buy); S.msg = r.msg; if (r.ok) a.save(); again(); }; });
    all('[data-trade]').forEach(b => { b.onclick = () => { const H = a.E.ensureHub(a.P), r = a.E.tradeTry(a.P, a.summary()); H.tradeAsked = true; if (r.ok) { H.tradeOffers = r.offers; S.msg = '球團同意了你的交易要求！請選擇去處。'; } else S.msg = '球團婉拒了你的交易要求，心情 −8。'; a.save(); again(); }; });
    all('[data-pick]').forEach(b => { b.onclick = () => { const H = a.E.ensureHub(a.P), o = H.tradeOffers && H.tradeOffers[+b.dataset.pick]; if (!o) return again(); a.P.pending = { team: o.team, years: o.keep ? Math.max(1, o.years - 1) : o.years, salary: o.salary, role: o.role, how: 'trade' };      /* 沿用合約（keep）：本季結算還會把剩餘年數 −1，所以先扣 1 年（至少 1 年），和休賽季市場（結算後才選）算法一致 */ H.tradeOffers = null; S.msg = '交易已談妥，下一年度起生效。'; a.save(); again(); }; });
    all('[data-cancel]').forEach(b => { b.onclick = () => { a.E.ensureHub(a.P).tradeOffers = null; S.msg = '你決定留在原球隊。'; a.save(); again(); }; });
    on('hubGo', () => a.enterGame()); on('hubTable', () => a.goSchedule(S.month)); on('hubTitle', () => a.toTitle());
  }
  function open(api, back, tab) { if (tab) S.tab = tab; S.month = null; S.sel = null; render(api, back || (() => { })); }      // 每次從外部進入都讓月曆回到「下一場」所在月份（畫面內重繪走 render，不受影響）
  return { open, calendarCells, monthsOf, contractView, awardRows, gameResult, lastPlayedKey, offDaysBefore, dayKey, dayInfo, _s: S };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CHUB;
