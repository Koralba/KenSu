/* ===== 13f-career-autosim.js ｜ 生涯模式：自動模擬（快轉到「輪到你」）＋計分板／壘包特殊畫面 =====
   載入順序：13e 與 14 之間（見 FILE_MAP.md）。
   用法：賽前畫面選「⏩ 自動模擬」→ AUTOSIM.arm(true)；選「👁 全程觀看」→ AUTOSIM.arm(false)。
   運作：
     - 偏好（pref）為開時，只要「不是輪到你的角色」就自動快轉（window.__ts 加速；window.__ff=true 時 14 的 frame() 不繪製 3D、不降畫質），
       並顯示特殊畫面（#asPanel：逐局比分、出局數、球數、壘包與跑者、目前打者／投手、最近幾則播報）。
     - 輪到你（humanBats／humanPitches／傳球詢問 PL.ask）時自動恢復正常速度與 3D 畫面；你的事情做完（下一位打者或換半局）自動再快轉。
     - 隨時可以切換：特殊畫面上的「👁 恢復觀看」＝關掉自動；比賽畫面右上角的「⏩ 自動模擬」＝再次開啟。
     - 沒有被叫上場的比賽（例如板凳候補今天沒機會）會一路快轉到比賽結束，直接顯示結算。
   音效：快轉時暫時把 08-audio.js 的 SND.mute／BGM.mute 設為 true 並呼叫 sfxApplyVol()／bgmApplyVol()，結束後還原玩家原本的設定。 */
'use strict';
const AUTOSIM = (function () {
  const SPEEDS = [40, 80, 160], SPD_NAME = { 40: '快', 80: '更快', 160: '極速' };      // 快轉速度＝每幀的邏輯運算時間預算（毫秒），見 14 的 frame()：越大越快、畫面更新越慢
  let pref = false, on = false, speed = 80, cur = 80, base = 1, frames = 0, lastRender = 0, panel = null, btn = null, savedMute = null; const log = [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 記錄實況播報（say）的文字，給特殊畫面顯示「最近發生了什麼事」 */
  try { const _say = say; say = function (h) { try { log.push(String(h).replace(/<[^>]+>/g, '')); if (log.length > 40) log.shift(); } catch (e) { } return _say.apply(this, arguments); }; } catch (e) { }

  /* 打席結算：包裝 finishAB（11），用打者統計前後差值判斷結果；快轉面板與「快轉結束回顧」使用 */
  const results = [], snap = new WeakMap(); let segStart = 0, recapOn = false, savedTs = null, manualStop = false;
  try { const _fa = finishAB; finishAB = function (kind, already) {
    let info = null; try { if (!(G.over || G.forfeit >= 0)) { const b = curBatter(), T = G.teams[G.half]; info = { b, p: snap.get(b) || { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 }, inn: G.inning, half: G.half, team: T.short || T.name, who: b.name, me: !!b.isMe, kind }; } } catch (e) { }
    const r = _fa.apply(this, arguments);
    try { if (info) { const s = info.b.st || {}, p = info.p, d = k => (s[k] || 0) - (p[k] || 0), kd = info.kind; let t;
        if (kd === 'IBB') t = '故意四壞'; else if (kd === 'HBP') t = '觸身球'; else if (kd === 'BB' || d('bb') > 0) t = '四壞球保送'; else if (kd === 'K' || d('k') > 0) t = '三振'; else if (kd === 'foulout') t = '界外飛球出局'; else if (d('hr') > 0) t = '全壘打'; else if (d('h') > 0) t = '安打'; else t = '出局';
        if (d('rbi') > 0) t += `（${d('rbi')} 分打點）`;
        results.push({ inn: info.inn, half: info.half, team: info.team, who: info.who, me: info.me, res: t, sc: G.score.slice() }); if (results.length > 300) { results.shift(); segStart = Math.max(0, segStart - 1); }
        [0, 1].forEach(h => { const b = G.teams[h].lineup[G.bi[h]]; if (b && b.st) snap.set(b, Object.assign({}, b.st)); }); } } catch (e) { }
    return r; }; } catch (e) { }
  const rowsHtml = (arr, n) => arr.slice(-n).map(r => `<tr${r.me ? ' class="me"' : ''}><td>${r.inn}${r.half === 0 ? '上' : '下'}</td><td class="n">${esc(r.team)} ${esc(r.who)}</td><td>${esc(r.res)}</td><td>${r.sc[0]}-${r.sc[1]}</td></tr>`).join('');
  const active = () => !!(G && G.career && G.role && G.mode === 'play' && !G.over);
  function needMe() { try { return !!(humanBats() || humanPitches() || (typeof PL !== 'undefined' && PL && PL.ask) || (typeof CCALL !== 'undefined' && CCALL.need())); } catch (e) { return false; } }      // CCALL：捕手配球面板（13j）開著時也停下快轉

  /* ---------- 介面 ---------- */
  function ensureDom() {
    if (panel) return;
    const st = document.createElement('style'); st.id = 'asStyle';
    st.textContent = `#asPanel{position:fixed;inset:0;z-index:8500;display:none;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 20%,#18305c,#060a14 78%);color:#fff;padding:10px;box-sizing:border-box;overflow:auto;font-family:inherit}
#asPanel.on{display:flex}#asPanel .asb{width:min(820px,100%);background:#0a1020cc;border:1px solid #ffe14a55;border-radius:16px;padding:14px 16px;box-shadow:0 10px 40px #000a}
#asPanel h3{margin:0 0 8px;color:#ffe14a;font-size:1.15em;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
#asPanel table{width:100%;border-collapse:collapse;font-size:.92em}#asPanel th,#asPanel td{padding:5px 6px;text-align:center;border-bottom:1px solid #fff2}#asPanel td.n{text-align:left;white-space:nowrap;font-weight:700}
#asPanel td.cu{background:#ffe14a33}#asPanel tr.me td.n{color:#ffe14a}#asPanel .sc{display:flex;justify-content:center;align-items:center;gap:14px;margin:2px 0 10px;font-weight:700}#asPanel .sc .tm{display:flex;flex-direction:column;align-items:center;min-width:5.2em;opacity:.85}#asPanel .sc .tm.me{opacity:1;color:#ffe14a}#asPanel .sc .tm small{font-size:.72em;font-weight:400;opacity:.8}#asPanel .sc .n{font-size:2.6em;line-height:1}#asPanel .sc .vs{font-size:1.4em;opacity:.6}#asPanel .sc .ou{font-size:.8em;font-weight:400;text-align:center;opacity:.9;line-height:1.5}#asPanel .mid{display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;margin:10px 0}
#asPanel .dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin:0 3px;border:2px solid #fff6;vertical-align:middle}#asPanel .dot.o{background:#ff5252;border-color:#ff5252}#asPanel .dot.b{background:#4caf50;border-color:#4caf50}#asPanel .dot.s{background:#ffc107;border-color:#ffc107}
#asPanel .info{flex:1;min-width:200px;line-height:1.7;font-size:.95em}#asPanel .res{max-height:min(30vh,220px);overflow:auto;background:#0006;border-radius:10px;margin:8px 0;padding:2px 6px}#asPanel .res table{font-size:.85em}#asPanel .res td,#asPanel .res th{padding:3px 4px}#asPanel .res td.n{white-space:normal}#asPanel .res tr.me td{color:#ffe14a}#asPanel .logb{background:#0006;border-radius:10px;padding:8px 10px;font-size:.88em;line-height:1.6;min-height:5.2em}#asPanel .logb div{opacity:.85}#asPanel .logb div:last-child{opacity:1;color:#ffe14a}
#asPanel .tools{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:10px}#asPanel button,#asBtn{font:inherit;padding:8px 14px;border-radius:9px;border:1px solid #fff4;background:#ffffff1c;color:#fff;cursor:pointer}
#asPanel button.pri{background:linear-gradient(#ffd84a,#e8a317);color:#222;font-weight:700;border:0}#asPanel button.sel{border-color:#ffe14a;color:#ffe14a}
#asBtn{position:fixed;top:calc(var(--abstop,64px) + 34px);right:6px;z-index:8400;display:none;background:#0b132855;border-color:#fff2;font-size:.75em;padding:4px 9px;opacity:.7}#asBtn.on{display:block}`;
    document.head.appendChild(st);
    panel = document.createElement('div'); panel.id = 'asPanel'; document.body.appendChild(panel);
    btn = document.createElement('button'); btn.id = 'asBtn'; document.body.appendChild(btn);
    btn.onclick = () => { pref = !pref; if (!pref && on) stop(); refreshBtn(); };
  }
  function refreshBtn() { if (!btn) return; const show = active() && !on; btn.classList.toggle('on', show); btn.textContent = pref ? '👁 取消' : '⏩ 自動'; }
  function diamond() {
    const o = G.on || [], f = i => (o[i] ? '#ffe14a' : '#ffffff22'), nm = i => (o[i] && o[i].pl ? esc(o[i].pl.name) : '');
    return `<svg viewBox="0 0 200 170" width="190" height="162"><g stroke="#fff6" fill="none"><path d="M100 150 L170 80 L100 20 L30 80 Z"/></g>
<rect x="90" y="10" width="20" height="20" transform="rotate(45 100 20)" fill="${f(1)}" stroke="#fff"/><rect x="160" y="70" width="20" height="20" transform="rotate(45 170 80)" fill="${f(0)}" stroke="#fff"/><rect x="20" y="70" width="20" height="20" transform="rotate(45 30 80)" fill="${f(2)}" stroke="#fff"/>
<path d="M92 150 h16 v-8 l-8 -6 l-8 6 z" fill="#fff"/><g fill="#fff" font-size="10" text-anchor="middle"><text x="100" y="8">${nm(1)}</text><text x="168" y="104">${nm(0)}</text><text x="32" y="104">${nm(2)}</text></g></svg>`;
  }
  function scoreHead(T) {      // 大比分：客隊 比 主隊（你的球隊標黃色）＋局數／出局
    try {
      const tm = t => `<div class="tm${t === G.human ? ' me' : ''}"><small>${esc(T[t].short || T[t].name)}${t === G.human ? '（你）' : ''}</small><span class="n">${G.score[t]}</span></div>`;
      return `<div class="sc">${tm(0)}<span class="vs">:</span>${tm(1)}<div class="ou">${G.inning} 局${G.half === 0 ? '上' : '下'}<br>${G.outs} 出局</div></div>`;
    } catch (e) { return ''; }
  }
  function roleLine() {
    try {
      const me = CSEASON.core.findMe(), rc = G.roleCall; if (!me) return '今天沒有安排你出場，會一路快轉到比賽結束。';
      if (humanBats() || humanPitches()) return '輪到你了！';
      if (G.role && G.role.two) {      // 二刀流：有「打者」「投手」兩個身分
        const core = CSEASON.core, mb = core.findMeBat && core.findMeBat(), mp = core.findMePit && core.findMePit();
        if (rc && rc.none) { const inLine = mb && G.teams[G.human].lineup.indexOf(mb) >= 0; return inLine ? `你是先發 DH${mb.slot != null ? `（第 ${mb.slot + 1} 棒）` : ''}，${mp && G.teams[G.human].pitchers.indexOf(mp) >= 0 ? '今天也輪到你先發登板' : '今天不是輪值日、不投球'}，輪到你就會暫停。` : '今天沒有安排你出場，會一路快轉到比賽結束。'; }
      }
      if (rc && rc.none) return me.slot !== undefined || (me.pos && G.teams[G.human].lineup.indexOf(me) >= 0) ? `你是先發，第 ${(me.slot != null ? me.slot + 1 : '?')} 棒，輪到你就會暫停。` : '今天沒有安排你出場，會一路快轉到比賽結束。';
      if (rc && !rc.done) return `教練預計第 ${rc.inn} 局之後叫你上場（${({ PH: '代打', PR: '代跑', RP: '登板' })[rc.type] || '登場'}），到時會自動暫停。`;
      return '你已經上過場了，後面會快轉到比賽結束。';
    } catch (e) { return ''; }
  }
  function render() {
    if (!panel || !on) return;
    try {
      const n = Math.max(G.innings || 9, G.inning || 1), T = G.teams, cells = [], head = []; for (let i = 1; i <= n; i++) head.push(`<th>${i}</th>`);
      for (let t = 0; t < 2; t++) {
        let row = ''; for (let i = 1; i <= n; i++) { const v = G.line[t][i - 1], curC = (G.inning === i && G.half === t), done = v != null || i < G.inning || (i === G.inning && G.half > t); row += `<td${curC ? ' class="cu"' : ''}>${v != null ? v : (done ? 0 : (curC ? '·' : ''))}</td>`; }
        cells.push(`<tr${t === G.human ? ' class="me"' : ''}><td class="n">${esc(T[t].short || T[t].name)}</td>${row}<td><b>${G.score[t]}</b></td><td>${G.hits[t]}</td><td>${G.errs[t]}</td></tr>`);
      }
      const dots = (k, c, m) => Array.from({ length: m }, (_, i) => `<span class="dot ${i < k ? c : ''}"></span>`).join('');
      let b = '', p = ''; try { const x = curBatter(), y = curPitcher(); b = x ? `${x.isMe ? '⭐ ' : ''}${esc(x.name)}` : ''; p = y ? `${y.isMe ? '⭐ ' : ''}${esc(y.name)}` : ''; } catch (e) { }
      const oldRes = panel.querySelector('.res'), keep = oldRes ? { top: oldRes.scrollTop, bot: oldRes.scrollTop + oldRes.clientHeight >= oldRes.scrollHeight - 6 } : null;
      panel.innerHTML = `<div class="asb"><h3><span>⏩ 自動模擬中（${SPD_NAME[speed] || ''}）</span><span style="font-size:.85em;opacity:.8">${G.inning} 局${G.half === 0 ? '上' : '下'}　${esc(T[G.half].short || T[G.half].name)} 進攻</span></h3>
${scoreHead(T)}<table><tr><th></th>${head.join('')}<th>R</th><th>H</th><th>E</th></tr>${cells.join('')}</table>
<div class="mid">${diamond()}<div class="info"><div>出局 ${dots(G.outs, 'o', 3)}</div><div>好球 ${dots(G.strikes, 's', 2)}　壞球 ${dots(G.balls, 'b', 3)}</div><div>打者：<b>${b}</b></div><div>投手：<b>${p}</b></div><div style="color:#ffe14a">${esc(roleLine())}</div></div></div>
<div class="res"><table><tr><th>局</th><th>打席</th><th>結果</th><th>比分</th></tr>${rowsHtml(results.slice(segStart), 40) || '<tr><td colspan="4">（目前還沒有打席結果）</td></tr>'}</table></div>
<div class="logb">${log.slice(-3).map(t => `<div>${esc(t)}</div>`).join('') || '<div>比賽進行中…</div>'}</div>
<div class="tools">${SPEEDS.map(s => `<button data-sp="${s}"${s === speed ? ' class="sel"' : ''}>${SPD_NAME[s]}</button>`).join('')}<button class="pri" id="asWatch">👁 恢復觀看</button></div></div>`;
      panel.querySelectorAll('[data-sp]').forEach(x => x.onclick = () => { speed = cur = +x.dataset.sp; window.__ffBudget = cur; render(); });
      { const nr = panel.querySelector('.res'); if (nr) nr.scrollTop = (!keep || keep.bot) ? nr.scrollHeight : keep.top; }
      const w = panel.querySelector('#asWatch'); if (w) w.onclick = () => { pref = false; manualStop = true; stop(); refreshBtn(); };
    } catch (e) { console.error(e); }
  }
  function muteAll(m) {      // 用 08-audio.js 自己的靜音旗標（SND.mute／BGM.mute）：快轉時靜音、結束時還原成玩家原本的設定
    try {
      if (m) { savedMute = { s: SND.mute, b: BGM.mute }; SND.mute = true; BGM.mute = true; } else if (savedMute) { SND.mute = savedMute.s; BGM.mute = savedMute.b; savedMute = null; }
      sfxApplyVol(); bgmApplyVol();
    } catch (e) { }
  }

  /* ---------- 快轉結束回顧（輪到你時暫停，看完按「繼續」） ---------- */
  function showRecap() {
    ensureDom(); recapOn = true; try { if (G.mode === 'play') { savedTs = G.ts; G.ts = 0; } } catch (e) { }      // G.ts=0：14 的 frame() 不再推進比賽（暫停），按「繼續」還原
    const seg = results.slice(segStart);
    panel.innerHTML = `<div class="asb"><h3><span>📋 剛才的比賽結果（${seg.length} 個打席）</span><span style="font-size:.85em;opacity:.8">${G.inning} 局${G.half === 0 ? '上' : '下'}　${G.score[0]} : ${G.score[1]}</span></h3><div class="res" style="max-height:min(55vh,420px)"><table><tr><th>局</th><th>打席</th><th>結果</th><th>比分</th></tr>${rowsHtml(seg, 80)}</table></div><div class="tools"><button class="pri" id="asRecapGo">▶ 繼續（輪到你了）</button></div></div>`;
    panel.classList.add('on'); const nr = panel.querySelector('.res'); if (nr) nr.scrollTop = nr.scrollHeight;
    const go = panel.querySelector('#asRecapGo'); if (go) go.onclick = closeRecap;
  }
  function closeRecap() { if (!recapOn) return; recapOn = false; try { if (savedTs != null) G.ts = savedTs; } catch (e) { } savedTs = null; segStart = results.length; if (panel && !on) { panel.classList.remove('on'); panel.innerHTML = ''; } }
  /* ---------- 快轉開關 ---------- */
  function start() { if (on) return; ensureDom(); on = true; base = window.__ts || 1; cur = speed; window.__ts = 12; window.__ffBudget = cur; segStart = results.length; manualStop = false; window.__ff = true; /* __ts=12：舊版 14（沒有時間預算）的備援倍率 */ panel.classList.add('on'); muteAll(true); render(); refreshBtn(); }
  function stop() { if (!on) return; on = false; window.__ts = base; window.__ff = false; window.__ffBudget = 0; if (panel) { panel.classList.remove('on'); panel.innerHTML = ''; } muteAll(false); try { camSnap(); } catch (e) { } refreshBtn(); if (!manualStop && results.length > segStart && active()) showRecap(); manualStop = false; }
  function tick(now) {
    requestAnimationFrame(tick);
    if (!active()) { if (recapOn) { manualStop = true; closeRecap(); } if (on) { manualStop = true; stop(); } if (btn) btn.classList.remove('on'); return; }
    if (recapOn) return;      // 回顧畫面開著：不重新快轉
    const want = pref && !needMe();
    if (want && !on) start(); else if (!want && on) stop();
    if (on) {
      if (now - lastRender > 250) { lastRender = now; render(); }
    } else if ((++frames % 15) === 0) refreshBtn();
  }
  requestAnimationFrame(tick);

  return { arm: b => { pref = !!b; if (!pref && on) stop(); }, isOn: () => on, needMe, get pref() { return pref; } };
})();
