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
  const SPEEDS = [6, 12, 24];
  let pref = false, on = false, speed = 12, cur = 12, base = 1, frames = 0, lastRender = 0, panel = null, btn = null, savedMute = null; const log = [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 記錄實況播報（say）的文字，給特殊畫面顯示「最近發生了什麼事」 */
  try { const _say = say; say = function (h) { try { log.push(String(h).replace(/<[^>]+>/g, '')); if (log.length > 40) log.shift(); } catch (e) { } return _say.apply(this, arguments); }; } catch (e) { }

  const active = () => !!(G && G.career && G.role && G.mode === 'play' && !G.over);
  function needMe() { try { return !!(humanBats() || humanPitches() || (typeof PL !== 'undefined' && PL && PL.ask)); } catch (e) { return false; } }

  /* ---------- 介面 ---------- */
  function ensureDom() {
    if (panel) return;
    const st = document.createElement('style'); st.id = 'asStyle';
    st.textContent = `#asPanel{position:fixed;inset:0;z-index:8500;display:none;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 20%,#18305c,#060a14 78%);color:#fff;padding:10px;box-sizing:border-box;overflow:auto;font-family:inherit}
#asPanel.on{display:flex}#asPanel .asb{width:min(820px,100%);background:#0a1020cc;border:1px solid #ffe14a55;border-radius:16px;padding:14px 16px;box-shadow:0 10px 40px #000a}
#asPanel h3{margin:0 0 8px;color:#ffe14a;font-size:1.15em;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
#asPanel table{width:100%;border-collapse:collapse;font-size:.92em}#asPanel th,#asPanel td{padding:5px 6px;text-align:center;border-bottom:1px solid #fff2}#asPanel td.n{text-align:left;white-space:nowrap;font-weight:700}
#asPanel td.cu{background:#ffe14a33}#asPanel tr.me td.n{color:#ffe14a}#asPanel .mid{display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;margin:10px 0}
#asPanel .dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin:0 3px;border:2px solid #fff6;vertical-align:middle}#asPanel .dot.o{background:#ff5252;border-color:#ff5252}#asPanel .dot.b{background:#4caf50;border-color:#4caf50}#asPanel .dot.s{background:#ffc107;border-color:#ffc107}
#asPanel .info{flex:1;min-width:200px;line-height:1.7;font-size:.95em}#asPanel .logb{background:#0006;border-radius:10px;padding:8px 10px;font-size:.88em;line-height:1.6;min-height:5.2em}#asPanel .logb div{opacity:.85}#asPanel .logb div:last-child{opacity:1;color:#ffe14a}
#asPanel .tools{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:10px}#asPanel button,#asBtn{font:inherit;padding:8px 14px;border-radius:9px;border:1px solid #fff4;background:#ffffff1c;color:#fff;cursor:pointer}
#asPanel button.pri{background:linear-gradient(#ffd84a,#e8a317);color:#222;font-weight:700;border:0}#asPanel button.sel{border-color:#ffe14a;color:#ffe14a}
#asBtn{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));right:8px;z-index:8400;display:none;background:#0b1328d9;font-size:.85em;padding:6px 11px}#asBtn.on{display:block}`;
    document.head.appendChild(st);
    panel = document.createElement('div'); panel.id = 'asPanel'; document.body.appendChild(panel);
    btn = document.createElement('button'); btn.id = 'asBtn'; document.body.appendChild(btn);
    btn.onclick = () => { pref = !pref; if (!pref && on) stop(); refreshBtn(); };
  }
  function refreshBtn() { if (!btn) return; const show = active() && !on; btn.classList.toggle('on', show); btn.textContent = pref ? '👁 取消自動模擬（輪完你會自動繼續快轉）' : '⏩ 自動模擬'; }
  function diamond() {
    const o = G.on || [], f = i => (o[i] ? '#ffe14a' : '#ffffff22'), nm = i => (o[i] && o[i].pl ? esc(o[i].pl.name) : '');
    return `<svg viewBox="0 0 200 170" width="190" height="162"><g stroke="#fff6" fill="none"><path d="M100 150 L170 80 L100 20 L30 80 Z"/></g>
<rect x="90" y="10" width="20" height="20" transform="rotate(45 100 20)" fill="${f(1)}" stroke="#fff"/><rect x="160" y="70" width="20" height="20" transform="rotate(45 170 80)" fill="${f(0)}" stroke="#fff"/><rect x="20" y="70" width="20" height="20" transform="rotate(45 30 80)" fill="${f(2)}" stroke="#fff"/>
<path d="M92 150 h16 v-8 l-8 -6 l-8 6 z" fill="#fff"/><g fill="#fff" font-size="10" text-anchor="middle"><text x="100" y="8">${nm(1)}</text><text x="168" y="104">${nm(0)}</text><text x="32" y="104">${nm(2)}</text></g></svg>`;
  }
  function roleLine() {
    try {
      const me = CSEASON.core.findMe(), rc = G.roleCall; if (!me) return '今天沒有安排你出場，會一路快轉到比賽結束。';
      if (humanBats() || humanPitches()) return '輪到你了！';
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
      panel.innerHTML = `<div class="asb"><h3><span>⏩ 自動模擬中（×${Math.round(cur)}）</span><span style="font-size:.85em;opacity:.8">${G.inning} 局${G.half === 0 ? '上' : '下'}　${esc(T[G.half].short || T[G.half].name)} 進攻</span></h3>
<table><tr><th></th>${head.join('')}<th>R</th><th>H</th><th>E</th></tr>${cells.join('')}</table>
<div class="mid">${diamond()}<div class="info"><div>出局 ${dots(G.outs, 'o', 3)}</div><div>好球 ${dots(G.strikes, 's', 2)}　壞球 ${dots(G.balls, 'b', 3)}</div><div>打者：<b>${b}</b></div><div>投手：<b>${p}</b></div><div style="color:#ffe14a">${esc(roleLine())}</div></div></div>
<div class="logb">${log.slice(-5).map(t => `<div>${esc(t)}</div>`).join('') || '<div>比賽進行中…</div>'}</div>
<div class="tools">${SPEEDS.map(s => `<button data-sp="${s}"${s === speed ? ' class="sel"' : ''}>×${s}</button>`).join('')}<button class="pri" id="asWatch">👁 恢復觀看</button></div></div>`;
      panel.querySelectorAll('[data-sp]').forEach(x => x.onclick = () => { speed = cur = +x.dataset.sp; window.__ts = cur; render(); });
      const w = panel.querySelector('#asWatch'); if (w) w.onclick = () => { pref = false; stop(); refreshBtn(); };
    } catch (e) { console.error(e); }
  }
  function muteAll(m) {      // 用 08-audio.js 自己的靜音旗標（SND.mute／BGM.mute）：快轉時靜音、結束時還原成玩家原本的設定
    try {
      if (m) { savedMute = { s: SND.mute, b: BGM.mute }; SND.mute = true; BGM.mute = true; } else if (savedMute) { SND.mute = savedMute.s; BGM.mute = savedMute.b; savedMute = null; }
      sfxApplyVol(); bgmApplyVol();
    } catch (e) { }
  }

  /* ---------- 快轉開關 ---------- */
  function start() { if (on) return; ensureDom(); on = true; base = window.__ts || 1; cur = speed; window.__ts = cur; window.__ff = true; panel.classList.add('on'); muteAll(true); render(); refreshBtn(); }
  function stop() { if (!on) return; on = false; window.__ts = base; window.__ff = false; if (panel) { panel.classList.remove('on'); panel.innerHTML = ''; } muteAll(false); try { camSnap(); } catch (e) { } refreshBtn(); }
  function tick(now) {
    requestAnimationFrame(tick);
    if (!active()) { if (on) stop(); if (btn) btn.classList.remove('on'); return; }
    const want = pref && !needMe();
    if (want && !on) start(); else if (!want && on) stop();
    if (on) {
      if ((++frames % 20) === 0 && typeof FRAME_AVG === 'number') { if (FRAME_AVG > .04 && cur > 3) cur = Math.max(3, cur * .7); else if (FRAME_AVG < .022 && cur < speed) cur = Math.min(speed, cur * 1.15); window.__ts = cur; }      // 手機太慢時自動降速
      if (now - lastRender > 250) { lastRender = now; render(); }
    } else if ((++frames % 15) === 0) refreshBtn();
  }
  requestAnimationFrame(tick);

  return { arm: b => { pref = !!b; if (!pref && on) stop(); }, isOn: () => on, needMe, get pref() { return pref; } };
})();
