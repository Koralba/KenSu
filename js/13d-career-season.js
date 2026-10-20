/* ===== 13d-career-season.js ｜ 生涯模式 第二階段：社會甲組連續三場、依位置操控、對戰紀錄、中職選秀評分 =====
   載入順序：13c 與 14 之間（見 FILE_MAP.md）；與其他 js/*.js 共用全域作用域。
   入口：13c 角色欄位的「▶ 開始生涯」→ CSEASON.begin(profile, slot)
   做的事：
     1. 每場隨機產生虛構的「社會甲組」對手（隊名、球員皆為虛構），你的球隊也是虛構球隊；連打 3 場。
     2. 你的角色被放進你的球隊打線／先發輪值；引擎只在「輪到你的角色」時等你操作（G.role + CSEASON.mine()），其餘交給電腦。
        投手：只在你上場投球時操作；野手：你打擊時揮棒、球到你手上時決定傳球；指定打擊：只打擊。
     3. 每場結束記錄你的成績與勝負（存在 localStorage：cpbl2027.career.season.<角色id>，也會跟著比賽存檔 SAVE.hooks.career）。
     4. 三場結束 → 成績換算 0～100 分 → 決定被中職六隊中的哪一隊、第幾輪第幾順位選走（高分時喜愛球隊選中的機率較高）。
   與引擎的接點（其他檔案的小改動，見 CHANGES.md）：
     04 humanBats/humanPitches、06 humanDef(f)、07 AI 換人判斷、11 newGame()/endGame()、13 buildCards()（略過 hidden 隊）、13b prepare 接點。
   兩支臨時球隊固定放在 TEAMS[8]（你的球隊 id:MYS）、TEAMS[9]（對手 id:OPS），CPBL.MYS / CPBL.OPS 為其名單，每場重新寫入。 */
'use strict';
const CSEASON = (function () {
  const N_GAMES = 3, N_YEAR = 12, INNINGS = 9, SLOT_MY = 8, SLOT_OP = 9, MYID = 'MYS', OPID = 'OPS', KEY = id => `cpbl2027.career.season.${id}`;
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gz = r => (r() + r() + r() - 1.5) * 2;      // 近似常態分佈（平均 0、標準差約 1）
  let SS = null, CFG0 = null;                        // SS＝目前的賽季資料；CFG0＝進入生涯前的一般模式設定備份

  /* ---------- 虛構球隊與球員產生器（同一個 seed 永遠產生同一份名單，所以存檔只需記 seed） ---------- */
  const PLACE = ['北港', '屏東', '花蓮', '金門', '澎湖', '基隆', '新竹', '苗栗', '彰化', '南投', '宜蘭', '嘉南', '雲林', '桃源', '大甲', '鳳山'];
  const MASCOT = ['海神', '雷霆', '飛鷹', '勇士', '蒼狼', '獵豹', '暴龍', '旭日', '金剛', '疾風', '黑熊', '藍鯨'];
  const COLORS = [['#1f6fd0', '#ffffff'], ['#c0392b', '#ffffff'], ['#1e8a4c', '#f5e08a'], ['#6b2fa0', '#ffffff'], ['#e8a317', '#222222'], ['#14808a', '#ffffff'], ['#222a35', '#e04a3a'], ['#d4561c', '#ffffff']];
  const SUR = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪', '邱', '曾', '廖', '賴', '徐', '周', '葉', '蘇', '莊', '呂', '江', '何', '蕭', '羅', '高'];
  const GIV = ['家豪', '志明', '冠宇', '承恩', '宥勝', '柏翰', '俊傑', '建宏', '宗翰', '彥廷', '品睿', '子軒', '冠霖', '佳宏', '仲恩', '哲維', '奕辰', '育誠', '信宏', '皓軒', '政嘉', '威廷', '瑞祥', '亦凱', '博文', '昱廷', '明軒', '宇辰', '紹宇', '立偉', '家銘', '柏宇', '漢霖', '彥成', '東翰', '正揚'];
  const FIELDS = ['嘉義市立棒球場', '斗六棒球場', '花蓮縣立棒球場', '台東縣立棒球場'];
  const PS_POOL = ['SL', 'CU', 'CH', 'FK', 'SK', 'CT'];
  const POS_BAT = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

  function genClub(seed, avoid, str) {
    const r = rng(seed), pk = a => a[Math.floor(r() * a.length)], z = () => gz(r), used = new Set([avoid]);
    const name = pk(PLACE) + pk(MASCOT), col = pk(COLORS), home = pk(FIELDS);
    const nm = () => { let n, g = 0; do { n = pk(SUR) + pk(GIV); } while (used.has(n) && g++ < 99); used.add(n); return n; };
    const bat = (pos, adj) => {
      const s = str + (adj || 0), a = cl(.252 + .03 * s + .02 * z(), .2, .335), o = a + cl(.062 + .012 * z(), .035, .1), sl = a + cl(.108 + .03 * z() + .01 * s, .05, .22);
      const fw = (pos === 'C' || pos === 'SS' || pos === 'CF') ? 4 : 0, aw = (pos === 'C' || pos === 'RF' || pos === '3B') ? 4 : 0;
      const hand = pk(['R', 'R', 'R', 'R', 'L', 'L', 'S']);
      return B(nm(), pos, hand, +a.toFixed(3), +o.toFixed(3), +sl.toFixed(3), Math.round(cl(4 + 3.5 * z() + 2 * s, 0, 17)), Math.round(cl(5 + 5 * z(), 0, 26)), +cl(15 + 3 * z(), 8, 26).toFixed(1), +cl(7.5 + 2 * z(), 3, 13).toFixed(1), Math.round(cl(62 + fw + 6 * z(), 45, 82)), Math.round(cl(62 + aw + 6 * z(), 45, 82)));
    };
    const pit = (role, ipg) => {
      const ps = []; while (ps.length < (role === 'SP' ? 3 : 2)) { const x = pk(PS_POOL); if (ps.indexOf(x) < 0) ps.push(x); }
      return P(nm(), role, pk(['R', 'R', 'R', 'L']), Math.round(cl(132 + 4 * z() + 3 * str + (role === 'CL' ? 3 : 0), 126, 148)), +cl(4.3 - .5 * str + .6 * z(), 2.6, 6.2).toFixed(2), +cl(14 + 2.5 * z() + str, 9, 22).toFixed(1), +cl(8.5 - .8 * str + 1.5 * z(), 4, 13).toFixed(1), Math.round(cl(88 + 8 * str + 6 * z(), 70, 110)), ipg, ps);
    };
    const roster = {
      bat: POS_BAT.map(p => bat(p)), bench: ['C', 'SS', 'CF', '1B', '3B'].map(p => bat(p, -.5)),
      sp: [0, 1, 2, 3, 4].map(() => pit('SP', +cl(5.5 + .6 * z(), 4.8, 6.6).toFixed(1))),
      rp: [pit('RP', 2), pit('RP', 1.5), pit('RP', 1.2), pit('CL', 1)]
    };
    return { seed, name, c1: col[0], c2: col[1], home, str, roster };
  }
  function setSlot(i, id, c) { TEAMS[i] = { id, name: c.name, short: c.name, c1: c.c1, c2: c.c2, cap: c.c1, home: c.home, dome: false, hidden: true }; CPBL[id] = c.roster; }

  /* ---------- 賽季資料 ---------- */
  const prof = () => SS && SS.profile;
  const rndSeed = () => Math.floor(Math.random() * 0x7fffffff) + 1;
  function mkGames(n) {
    const seeds = []; while (seeds.length < n) { const s = rndSeed(); if (seeds.indexOf(s) < 0) seeds.push(s); }
    const home = seeds.map(() => Math.random() < .5); if (n > 1 && (home.every(x => x) || home.every(x => !x))) home[1] = !home[1];      // 主客場至少各一次
    return seeds.map((s, i) => ({ oSeed: s, oStr: +(Math.random() * 1.7 - .8).toFixed(2), meHome: home[i], rec: null }));
  }
  const NG = () => SS.games.length;      // 這一階段的比賽場數（甲組試煉 3 場／上班族一年 12 場）
  const worker = () => !!(SS && SS.year > 0);
  function newSeason(profile, slot) { return { v: 2, id: profile.id, slot, profile, club: { seed: rndSeed() }, year: 0, idx: 0, draft: null, history: [], games: mkGames(N_GAMES) }; }
  function startWorkerYear() {      // 落選後：度過一整年（12 個月，每月一場隨機社會組比賽），之後才有下一次選秀
    SS.history = SS.history || []; SS.history.push({ year: SS.year, draft: SS.draft });
    SS.year = (SS.year || 0) + 1; SS.club = { seed: rndSeed() }; SS.games = mkGames(N_YEAR); SS.idx = 0; SS.draft = null; saveSeason(); showIntro();
  }
  function readSeason(id) { try { const j = JSON.parse(localStorage.getItem(KEY(id))); return j && (j.v === 1 || j.v === 2) && Array.isArray(j.games) ? j : null; } catch (e) { return null; } }
  function saveSeason() { if (!SS) return; try { localStorage.setItem(KEY(SS.id), JSON.stringify(SS)); } catch (e) { console.error(e); } }
  function clubsFor(g) {
    const p = prof(), my = genClub(SS.club.seed, p.name, 0); let op = genClub(g.oSeed, p.name, g.oStr), k = 0;
    while (op.name === my.name && k++ < 20) op = genClub(g.oSeed + k, p.name, g.oStr);      // 隊名不可相同
    return { my, op };
  }
  function register(g) { const c = clubsFor(g); setSlot(SLOT_MY, MYID, c.my); setSlot(SLOT_OP, OPID, c.op); return c; }

  /* ---------- 把角色放進球隊（newGame() 建好球隊、尚未開始半局前呼叫） ---------- */
  function myRow(p) {
    const base = { name: p.name, hand: p.bat };
    if (p.pos === 'P') return P(p.name, 'SP', p.thr, 137, 4.0, 15, 8, 94, 6.0, ['SL', 'CH', 'CU']);
    const fw = (p.pos === 'C' || p.pos === 'SS' || p.pos === 'CF') ? 4 : 0;
    return B(p.name, p.pos, base.hand, .268, .338, .405, 6, 8, 14, 8, 64 + fw, 64);
  }
  function inject(teams, cfg) {
    if (SS && SS.pro && SS.pro.active) return CPRO.inject(teams, cfg);      // 職業賽季：板凳候補起步
    const p = prof(); if (!p) return; const t = teams[cfg.side]; let me;
    if (p.pos === 'P') {
      me = mkPitcher(myRow(p)); me.isMe = true; me.num = String(p.num); me.mood = 62;
      t.cur = 0; t.pitchers[0] = me;
    } else {
      const i = t.lineup.findIndex(x => x.pos === p.pos); if (i < 0) return;
      const old = t.lineup[i]; me = mkBatter(myRow(p), old.slot); me.isMe = true; me.num = String(p.num); me.nat = p.pos; me.mood = 62; setPos(me, p.pos);
      t.lineup[i] = me; old.slot = undefined; old.out = false; t.bench.push(old);
    }
    G.role = { pos: p.pos }; G.career = true;
    if (CAREER.session) CAREER.session.player = me; else CAREER.session = { profile: p, player: me };
  }
  const findMe = () => { for (const t of (G.teams || [])) { if (!t) continue; for (const l of [t.lineup, t.bench, t.pitchers, t.retired]) if (l) for (const x of l) if (x && x.isMe) return x; } return null; };
  const mine = k => { try { const x = k === 'bat' ? curBatter() : curPitcher(); return !!(x && x.isMe); } catch (e) { return false; } };

  /* ---------- 介面（動態插入的全螢幕面板；樣式也在這裡，不動 css 檔） ---------- */
  function ensureDom() {
    if (el('csDlg')) return;
    const st = document.createElement('style'); st.id = 'csStyle';
    st.textContent = `#csDlg{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 30%,#1c2b4d,#070b16 75%);color:#fff;font-family:inherit;overflow:auto;padding:12px;box-sizing:border-box}
#csDlg.hide{display:none}#csDlg .csb{width:min(760px,100%);background:rgba(10,16,32,.86);border:1px solid rgba(255,225,74,.35);border-radius:16px;padding:18px 18px 16px;box-shadow:0 10px 40px #000a;max-height:100%;overflow:auto}
#csDlg h2{margin:0 0 4px;font-size:1.35em;color:#ffe14a}#csDlg .sub{opacity:.75;font-size:.9em;margin-bottom:10px}
#csDlg .vs{display:flex;align-items:center;justify-content:center;gap:14px;margin:10px 0;font-size:1.15em;flex-wrap:wrap}#csDlg .tm{padding:8px 14px;border-radius:10px;font-weight:700;border:2px solid #fff3;min-width:110px;text-align:center}
#csDlg .task{background:#ffffff12;border-left:4px solid #ffe14a;padding:8px 12px;border-radius:6px;margin:10px 0;line-height:1.55;font-size:.95em}
#csDlg table{width:100%;border-collapse:collapse;font-size:.88em;margin:8px 0}#csDlg th,#csDlg td{padding:5px 6px;border-bottom:1px solid #fff2;text-align:center;white-space:nowrap}#csDlg th{opacity:.7;font-weight:600}
#csDlg .btns{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}#csDlg button{font:inherit;padding:9px 18px;border-radius:9px;border:1px solid #fff4;background:#ffffff18;color:#fff;cursor:pointer}
#csDlg button.pri{background:linear-gradient(#ffd84a,#e8a317);color:#222;font-weight:700;border:0}
#csDlg .big{font-size:2.1em;font-weight:800;color:#ffe14a;text-align:center;margin:6px 0}#csDlg .pk{font-size:1.05em;text-align:center;line-height:1.7}
#csDlg .reveal>*{opacity:0;animation:csIn .6s forwards}@keyframes csIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#csDlg .row2{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}#csDlg .row2>div{flex:1;min-width:230px}
.cs-sum{margin:8px auto;max-width:520px;background:#0006;border-radius:10px;padding:8px 12px;font-size:.92em;line-height:1.6;text-align:center}`;
    document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'csDlg'; d.className = 'hide'; document.body.appendChild(d);
  }
  const dlg = () => { ensureDom(); return el('csDlg'); };
  const show = html => { const d = dlg(); d.innerHTML = html; d.classList.remove('hide'); };
  const hide = () => { const d = el('csDlg'); if (d) d.classList.add('hide'); };
  const POS_TASK = {
    P: '你是<b>先發投手</b>：只在你站上投手丘時由你操作（選球種、瞄準、投球準度）。打擊與其他守備位置由隊友與電腦處理。',
    DH: '你是<b>指定打擊</b>：只負責打擊，輪到你的棒次時由你揮棒；守備與跑壘決策由電腦處理。',
    C: '你是<b>捕手</b>：輪到你打擊時由你揮棒；球落到你手上時由你決定傳球／觸殺；投球、其他守備由電腦處理。',
  };
  const taskOf = p => POS_TASK[p.pos] || `你是<b>${esc(posNm(p.pos))}</b>：輪到你打擊時由你揮棒；球落到你的守備位置、由你拿到球時由你決定傳球；其他球員的打擊、投球與守備交給電腦。`;
  const POSN = { '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野手', CF: '中外野手', RF: '右外野手' };
  const posNm = p => POSN[p] || p;
  const recLine = r => !r ? '' : (r.pos === 'P' ? `${(r.outs / 3).toFixed(1)} 局　失 ${r.r} 分　被安打 ${r.hA}　三振 ${r.k}　四壞 ${r.bb}` : `${r.ab} 打數 ${r.h} 安打　${r.hr} 轟　${r.rbi} 打點　${r.bb} 四死球　${r.k} 三振　${r.e} 失誤`);
  const resTx = r => r === 'W' ? '勝' : r === 'L' ? '敗' : '和';
  function gamesTable() {
    const rows = SS.games.map((g, i) => {
      const c = g.rec; return `<tr><td>${i + 1}</td><td>${c ? esc(c.oppName) : '—'}</td><td>${c ? `${c.my}:${c.op}` : '—'}</td><td>${c ? resTx(c.res) : ''}</td><td style="text-align:left">${c ? esc(recLine(c)) : ''}</td></tr>`;
    }).join('');
    return `<table><tr><th>場次</th><th>對手</th><th>比分</th><th>勝負</th><th>你的表現</th></tr>${rows}</table>`;
  }

  /* ---------- 流程 ---------- */
  function begin(profile, slot) {
    ensureDom(); const old = readSeason(profile.id);
    if (old && old.pro && old.pro.active) {      // 職業賽季進行中
      if (confirm(`「${profile.name}」正在打職業賽季（${old.pro.done ? '例行賽已結束' : '已完成 ' + old.pro.log.length + ' 場'}）。\n按「確定」繼續；按「取消」放棄職業賽季、重新開始生涯。`)) {
        SS = old; SS.profile = profile; saveSeason(); if (G.mode === 'title') { try { sndInit(); } catch (e) { } G.mode = 'menu'; $('title').classList.add('hide'); CAMC.mode = 'title'; } CPRO.showIntro(); return;
      }
    }
    if (old && old.idx < old.games.length) {
      if (confirm(`找到「${profile.name}」進行中的生涯（${(old.year > 0 ? '上班族第 ' + old.year + ' 年' : '社會甲組')}，已完成 ${old.idx}／${old.games.length} 場）。\n按「確定」繼續；按「取消」重新開始（舊進度會被覆蓋）。`)) { SS = old; SS.profile = profile; }
      else SS = newSeason(profile, slot);
    } else if (old && old.draft) {
      if (confirm(`「${profile.name}」這一階段已結束。\n按「確定」查看選秀結果；按「取消」重新開始新的一輪。`)) { SS = old; SS.profile = profile; saveSeason(); showDraft(); return; }
      SS = newSeason(profile, slot);
    } else SS = newSeason(profile, slot);
    saveSeason();
    if (G.mode === 'title') { try { sndInit(); } catch (e) { } G.mode = 'menu'; $('title').classList.add('hide'); CAMC.mode = 'title'; }
    showIntro();
  }
  function showIntro() {
    const g = SS.games[SS.idx], p = prof(), c = clubsFor(g), n = SS.idx + 1;
    const stars = '★'.repeat(cl(Math.round(2.5 + g.oStr * 2), 1, 5)) + '☆'.repeat(5 - cl(Math.round(2.5 + g.oStr * 2), 1, 5));
    const away = g.meHome ? c.op : c.my, home = g.meHome ? c.my : c.op;
    const tm = (x, me) => `<div class="tm" style="background:linear-gradient(135deg,${x.c1},${x.c1}99);color:${x.c2}">${esc(x.name)}${me ? '<br><small>（你的球隊）</small>' : ''}</div>`;
    show(`<div class="csb"><h2>${worker() ? `上班族的一年・第 ${n} / ${NG()} 個月` : `社會甲組 第 ${n} / ${NG()} 場`}</h2><div class="sub">${esc(p.name)} #${p.num}・${esc(posNm(p.pos))}　｜　${INNINGS} 局比賽　｜　球場：${esc(home.home)}</div>
<div class="vs">${tm(away, away === c.my)}<span>＠</span>${tm(home, home === c.my)}</div>
<div class="sub" style="text-align:center">客隊 ＠ 主隊　｜　對手實力 ${stars}　｜　你的球隊${g.meHome ? '為主隊（後攻）' : '為客隊（先攻）'}</div>
<div class="task">🎯 本場任務：${taskOf(p)}<br><small>${worker() ? '白天上班、假日打球。這一年的成績，會決定明年選秀會上有沒有球隊看上你。' : '三場的對戰紀錄會換算成分數，決定你被中職六隊選走的順位。'}</small></div>
${n > 1 ? gamesTable() : ''}<div class="btns"><button id="csBack">返回主畫面</button><button id="csGo" class="pri">⚾ 開始比賽</button></div></div>`);
    el('csBack').onclick = () => { hide(); leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
    el('csGo').onclick = launch;
  }
  function launch() {
    const g = SS.games[SS.idx], p = prof(); register(g); hide();
    if (!CFG0) CFG0 = Object.assign({}, CFG);
    Object.assign(CFG, { H: g.meHome ? SLOT_MY : SLOT_OP, A: g.meHome ? SLOT_OP : SLOT_MY, ctl: g.meHome ? 0 : 1, ord: g.meHome ? 1 : 0, inn: INNINGS, lv: 1, abs: 0, evt: 0, ace: 0, pn: 0, easy: 0, park: '', night: -1, wx: 1 });
    syncCfg();
    CAREER.session = { profile: p, player: null };
    const c = Object.assign({}, CFG, { career: true, edit: [null, null], ace: 0 });
    try { sndInit(); } catch (e) { } $('lineup').classList.add('hide');
    newGame(c);
  }
  function leave() {      // 離開生涯比賽：清掉角色操控並還原一般模式設定
    G.role = null; G.career = false; if (typeof CAREER !== 'undefined') CAREER.session = null;
    if (CFG0) { Object.assign(CFG, CFG0); CFG0 = null; } else if (CFG.H > 7 || CFG.A > 7) Object.assign(CFG, { H: 1, A: 0, ctl: 0, ord: 0, inn: 9, abs: 1, evt: 1 });
    try { syncCfg(); } catch (e) { }
  }

  /* ---------- 比賽結束：記錄成績、接下一場或選秀 ---------- */
  function buildRec() {      // 從目前（剛結束的）比賽整理出你的角色這一場的成績
    const me = findMe(), side = G.human, my = G.score[side], op = G.score[1 - side], p = prof(), isP = p.pos === 'P', st = (me && me.st) || {};
    const w = G.forfeit >= 0 ? 1 - G.forfeit : (my === op ? -1 : (my > op ? side : 1 - side)), res = w < 0 ? 'T' : (w === side ? 'W' : 'L');
    const e = G.errPl && me && typeof G.errPl[me.name] === 'number' ? G.errPl[me.name] : 0, oppT = G.teams[1 - side];
    return { pos: p.pos, my, op, res, oppName: oppT ? oppT.name : '對手', ab: st.ab || 0, h: st.h || 0, hr: st.hr || 0, rbi: st.rbi || 0, bb: isP ? (me ? (me.bbA || 0) : 0) : (st.bb || 0), k: isP ? (me ? (me.kA || 0) : 0) : (st.k || 0), e,
      outs: isP && me ? (me.outs || 0) : 0, r: isP && me ? (me.er || 0) : 0, hA: isP && me ? (me.hA || 0) : 0 };
  }
  function afterEnd(rs) {
    if (SS && SS.pro && SS.pro.active && G.role) return CPRO.afterEnd(rs);      // 職業賽季（js/13e-career-pro.js）
    if (!SS || !G.role || !rs) return; const g = SS.games[SS.idx]; if (!g) return;
    if (!g.rec) {
      g.rec = buildRec();
      SS.idx++; if (SS.idx >= NG()) SS.draft = doDraft(); saveSeason();
    }
    const rec = g.rec, p = prof();
    CAREER.session = CAREER.session || { profile: p }; CAREER.session.stats = p.pos === 'P'
      ? [['投球局數', (rec.outs / 3).toFixed(1)], ['失分', rec.r], ['被安打', rec.hA], ['三振', rec.k]] : [['打數', rec.ab], ['安打', rec.h], ['全壘打', rec.hr], ['打點', rec.rbi]];
    try { CAREER.attachResult(rs); } catch (e) { }
    const bt = rs.querySelector('.rbtns'), box = rs.querySelector('.rbox') || rs;
    const sum = document.createElement('div'); sum.className = 'cs-sum';
    sum.innerHTML = `<b>第 ${SS.idx} / ${NG()} ${worker() ? '個月' : '場'}・${resTx(rec.res)}</b>　${esc(recLine(rec))}`;
    if (bt) box.insertBefore(sum, bt); else box.appendChild(sum);
    if (bt) {
      const ag = bt.querySelector('#againBtn'); if (ag) ag.remove();
      const nb = document.createElement('button'); nb.id = 'csNext'; nb.className = 'b-again';
      nb.textContent = SS.idx < NG() ? `▶ 下一場（第 ${SS.idx + 1} ${worker() ? '個月' : '場'}）` : '🎓 查看選秀結果'; bt.insertBefore(nb, bt.firstChild);
      nb.onclick = () => { rs.classList.add('hide'); try { quitToMenu(); } catch (e) { } G.role = null; G.career = false; if (SS.idx < NG()) showIntro(); else showDraft(); };
    }
  }

  /* ---------- 選秀評分 ---------- */
  function totals() { const t = { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, e: 0, outs: 0, r: 0, hA: 0, w: 0 }; for (const g of SS.games) { const c = g.rec; if (!c) continue; for (const k of ['ab', 'h', 'hr', 'rbi', 'bb', 'k', 'e', 'outs', 'r', 'hA']) t[k] += c[k] || 0; if (c.res === 'W') t.w++; } return t; }
  function scoreOf() {
    const p = prof(), t0 = totals(), n = NG(), f = 3 / n, t = Object.assign({}, t0); let sc = 0; const parts = [];
    for (const k of ['ab', 'h', 'hr', 'rbi', 'bb', 'k', 'e', 'outs', 'hA', 'w']) t[k] = t0[k] * f;      // 12 場也換算成「三場」的標準來評分
    if (p.pos === 'P') {
      const ip = t.outs / 3, era = t0.outs > 0 ? t0.r * 9 / (t0.outs / 3) : 99;
      parts.push(['投球局數', cl(ip / (INNINGS * 3 * .85) * 25, 0, 25)], ['防禦率', ip > 0 ? cl((6.5 - era) / 6.5, 0, 1) * 35 : 0], ['三振', cl(t.k * 1.4, 0, 15)], ['四壞球', -cl(t.bb * 1.4, 0, 10)], ['被安打', -cl(t.hA * .8, 0, 8)], ['球隊勝場', t.w * 4], ['基本分', 10]);
    } else {
      const avg = t.ab > 0 ? t.h / t.ab : 0;
      parts.push(['打擊率', t.ab > 0 ? cl((avg - .15) / .25, 0, 1) * 30 : 0], ['安打', cl(t.h * 1.6, 0, 10)], ['全壘打', cl(t.hr * 4, 0, 16)], ['打點', cl(t.rbi * 2, 0, 12)], ['四死球', cl(t.bb * 1.5, 0, 6)], ['三振', -cl(t.k * 1.2, 0, 8)], ['失誤', -cl(t.e * 3, 0, 9)], ['球隊勝場', t.w * 3], ['基本分', 8]);
      if ((p.pos === 'C' || p.pos === 'SS' || p.pos === 'CF') && t.e === 0) parts.push(['守備無失誤', 3]);
    }
    sc = cl(Math.round(parts.reduce((a, x) => a + x[1], 0)), 0, 100);
    return { sc, parts: parts.map(x => [x[0], Math.round(x[1])]), t };
  }
  const gradeOf = s => s >= 85 ? 'S' : s >= 70 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D';
  function doDraft() {
    const p = prof(), S = scoreOf(), sc = S.sc, order = [0, 1, 2, 3, 4, 5], rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    for (let i = 5; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }      // 抽籤決定每輪的選秀順位
    const fav = TEAMS.slice(0, 6).findIndex(t => t.id === p.team); let overall = 0, tier;
    if (sc >= 70) {      // 非常好：80% 被喜愛的球隊選走（沒有喜愛的中職球隊就是前段順位的隨機球隊）
      tier = 'great'; const top = sc >= 85 ? 1 : 2;
      if (fav >= 0 && Math.random() < .8) overall = (rnd(1, top) - 1) * 6 + order.indexOf(fav) + 1; else overall = rnd(1, top * 6);
    } else if (sc >= 55) { tier = 'good'; overall = rnd(7, 18); }      // 還不錯：中段順位、隨機一隊選走
    else if (sc >= 40) {      // 普通：順位偏後，且由「其他」隨機球隊選走；仍有兩成落選
      tier = 'mid'; if (Math.random() >= .2) { overall = rnd(19, 30); if (fav >= 0 && order[(overall - 1) % 6] === fav) overall += (overall % 6 === 0) ? -1 : 1; }
    } else tier = 'poor';      // 表現差：直接落選
    const und = overall < 1, rd = und ? 0 : Math.ceil(overall / 6), pi = und ? 0 : ((overall - 1) % 6) + 1;
    return { sc, grade: gradeOf(sc), tier, parts: S.parts, order, overall, round: rd, pickInRound: pi, teamIdx: und ? -1 : order[pi - 1], undrafted: und, fav, favored: !und && fav >= 0 && order[pi - 1] === fav, year: SS.year || 0 };
  }
  function showDraft() {
    const p = prof(), d = SS.draft || (SS.draft = doDraft()), T = d.teamIdx >= 0 ? TEAMS[d.teamIdx] : null, favT = d.fav >= 0 ? TEAMS[d.fav] : null, t = totals();
    const stats = p.pos === 'P' ? [['投球局數', (t.outs / 3).toFixed(1)], ['失分', t.r], ['三振', SS.games.reduce((a, g) => a + ((g.rec && g.rec.k) || 0), 0)], ['勝場', t.w]] : [['打數', t.ab], ['安打', t.h], ['全壘打', t.hr], ['打點', t.rbi]];
    let card = ''; try { card = CAREER.cardHtml(p, stats); } catch (e) { }
    const line = d.undrafted ? `很可惜，本屆選秀會你<b>沒有被任何球隊選中</b>。<br><small>多累積成績，下一輪再挑戰！</small>`
      : `<b style="color:${T.c1 === '#ffffff' ? '#fff' : T.c1}">${esc(T.name)}</b> 在第 <b>${d.round}</b> 輪第 <b>${d.pickInRound}</b> 順位（全體第 <b>${d.overall}</b> 順位）選中了你！`;
    const fx = d.undrafted ? '' : favT ? (d.favored ? `<div>🎉 圓夢！你最喜愛的 ${esc(favT.name)} 選中了你！</div>` : `<div>你喜愛的是 ${esc(favT.name)}，這次被 ${esc(T.name)} 選走。</div>`) : '';
    const bars = d.parts.map(x => `<tr><td style="text-align:left">${esc(x[0])}</td><td>${x[1] >= 0 ? '+' : ''}${x[1]}</td></tr>`).join('');
    show(`<div class="csb"><h2>🎓 ${d.year > 0 ? `上班族第 ${d.year} 年結束` : '社會甲組結束'}・中職選秀會</h2><div class="sub">${esc(p.name)}　${NG()} 場表現換算成績</div>
<div class="row2"><div>${card}</div><div><table><tr><th style="text-align:left">項目</th><th>分數</th></tr>${bars}</table><div class="big">${d.sc} 分・評價 ${d.grade}</div></div></div>
${gamesTable()}<div class="reveal"><div class="pk" style="animation-delay:.3s">本屆選秀順位（每輪順序）：${d.order.map(i => esc(TEAMS[i].short)).join(' → ')}</div>
<div class="pk" style="animation-delay:1.2s">${line}</div><div class="pk" style="animation-delay:2s">${fx}</div></div>
${d.undrafted ? `<div class="task">😢 你成了<b>平凡的上班族</b>。白天被主管追著跑、假日才有時間打球……<br>但夢想還沒結束：接下來要度過<b>一整年（${N_YEAR} 個月，每月一場隨機社會組比賽）</b>，才有機會再參加選秀。</div>` : `<div class="task">🎉 你踏上了職業之路！你將加入<b>${esc(T.name)}</b>，從<b>${p.pos === 'P' ? '牛棚候補' : '板凳候補'}</b>開始，靠表現爭取先發。</div>`}
<div class="btns"><button id="csAgain">重新開始新的一輪</button>${d.undrafted ? '<button id="csWork" class="pri">▶ 回到社會組，度過這一年</button>' : '<button id="csPro" class="pri">▶ 加入球隊，開始職業賽季</button>'}<button id="csHome">返回主畫面</button></div></div>`);
    saveSeason();
    el('csHome').onclick = () => { hide(); leave(); G.mode = 'title'; $('menu').classList.add('hide'); $('title').classList.remove('hide'); CAMC.mode = 'title'; };
    if (el('csWork')) el('csWork').onclick = startWorkerYear;
    if (el('csPro')) el('csPro').onclick = () => CPRO.start();
    el('csAgain').onclick = () => { if (!confirm('要重新開始嗎？這一輪的紀錄會被覆蓋。')) return; SS = newSeason(prof(), SS.slot); saveSeason(); showIntro(); };
  }

  /* ---------- 比賽存檔接點（13b 的 SAVE.hooks.career；13c 已註冊基本版，這裡補上賽季資料） ---------- */
  try {
    if (typeof SAVE !== 'undefined' && SAVE.hooks) {
      const old = SAVE.hooks.career || {};
      SAVE.hooks.career = {
        active: () => !!(typeof CAREER !== 'undefined' && CAREER.session),
        collect: () => ({ profile: CAREER.session ? CAREER.session.profile : CAREER.cur, season: SS }),
        prepare: x => { if (x && x.season) { SS = x.season; if (SS.profile && !(SS.pro && SS.pro.active)) { const g = SS.games[Math.min(SS.idx, NG() - 1)]; if (g) register(g); } } },      // 在 13b 驗證球隊資料前先重建臨時球隊
        apply: x => {
          if (old.apply) old.apply(x);
          if (x && x.season) { SS = x.season; if (CAREER.session) CAREER.session.profile = SS.profile; const me = findMe(); G.role = { pos: SS.profile.pos }; G.career = true; if (CAREER.session) CAREER.session.player = me; }
        }
      };
    }
  } catch (e) { console.error(e); }

  /* ---------- 掛上全域函式：newGame 清除舊的角色狀態、backToTitle 順便離開生涯 ---------- */
  try {
    const _ng = newGame; newGame = function (cfg) { if (!cfg || !cfg.career) { G.role = null; G.career = false; if (typeof CAREER !== 'undefined') CAREER.session = null; } return _ng.apply(this, arguments); };
    const _bt = backToTitle; backToTitle = function () { hide(); leave(); return _bt.apply(this, arguments); };
  } catch (e) { console.error(e); }
  try {
    const _mk = makeChibi; makeChibi = function (o) { try { if (o && o.pl && o.pl.isMe && !o.vis && SS && SS.profile) o = Object.assign({}, o, { vis: CAREER.vis(SS.profile) }); } catch (e) { } return _mk.call(this, o); };      // 你的角色用建立角色時的外觀（若 makeChibi 不是可重新指定的 function 宣告，這段會安靜略過）
  } catch (e) { console.warn('makeChibi 無法包裝，角色外觀將使用預設', e); }

  const setCfg = o => { if (!CFG0) CFG0 = Object.assign({}, CFG); Object.assign(CFG, o); syncCfg(); };
  return { core: { ss: () => SS, save: saveSeason, show, hide, leave, findMe, myRow, buildRec, recLine, setCfg }, begin, inject, mine, afterEnd, get season() { return SS; }, scoreOf, N_GAMES, N_YEAR };
})();
