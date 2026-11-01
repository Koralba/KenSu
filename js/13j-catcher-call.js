/* ===== 13j-catcher-call.js ｜ 生涯模式：你當捕手時，由你替電腦投手配球（球種／位置／牽制／外角球） =====
   載入順序：13g 之後、14 之前。不修改 04／07／11，只包裝這幾個全域函式（與 13g 包裝 updatePlay 同一手法）：
     cpuDeliver（11）  ：電腦投手準備投球時，若「你是捕手、你的球隊守備」→ 先開配球面板，等你下指示才繼續
     aiPickPitch（07） ：有你的指示 → 回傳你指定的球種／落點（出手誤差、球威仍由引擎照投手能力計算）
     aiPickoffThink（07）：有你的指示 → 只依你的牽制指令；沒有就不牽制
     doPitch／doPickoff（11）：出手／牽制後清掉指示
   面板選項：🤖 電腦決定（照原本 AI）、球種＋5×5 落點（中間 3×3＝好球帶、外圈＝壞球）、🚫 外角球（pitchout，防盜壘）、牽制 1／2／3 壘、🤖 本場全交給電腦。
   快轉（13f）：面板開著時 CCALL.need() 為 true，13f 會暫停快轉。 */
'use strict';
const CCALL = (function () {
  let cur = null, shown = false, panel = null, autoAll = false, pickId = null, pickCell = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMine = () => { try { return !!(G && G.role && G.mode === 'play' && !G.over && G.human >= 0 && G.human === 1 - G.half && !G.intWalk && E.F && E.F.C && E.F.C.pl && E.F.C.pl.isMe); } catch (e) { return false; } };
  /* 5×5 落點：欄＝橫向（外圈 ±2＝壞球）、列＝高低（+2 最高）。外角方向 = 打者慣用側 side（與 07 的外角球 x = side*2.15 一致） */
  function cellXY(c, r) { const x = Math.abs(c) <= 1 ? c * ZW * 2 / 3 : Math.sign(c) * (ZW + .4), y = ZC + (Math.abs(r) <= 1 ? r * ZH * 2 / 3 : Math.sign(r) * (ZH + .33)); return { x, y }; }
  const side = () => { try { return E.bat.side || 1; } catch (e) { return 1; } };
  const colLabel = c => (c === 0 ? '中' : (c * side() > 0 ? '外' : '內') + (Math.abs(c) === 2 ? '(壞)' : ''));
  function ensureDom() {
    if (panel) return;
    const st = document.createElement('style'); st.id = 'ccStyle';
    st.textContent = '#ccPanel{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:8300;display:none;width:min(440px,96vw);background:#0a1020ee;border:1px solid #ffe14a77;border-radius:14px;padding:10px 12px;color:#fff;font-size:.9em;box-sizing:border-box}#ccPanel.on{display:block}#ccPanel h4{margin:0 0 6px;color:#ffe14a;font-size:1em}#ccPanel .row{display:flex;gap:6px;flex-wrap:wrap;margin:5px 0}#ccPanel button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #fff4;background:#ffffff1c;color:#fff;cursor:pointer}#ccPanel button.sel{border-color:#ffe14a;color:#ffe14a;background:#ffe14a22}#ccPanel button.pri{background:linear-gradient(#ffd84a,#e8a317);color:#222;font-weight:700;border:0}#ccPanel button:disabled{opacity:.4}#ccPanel .g{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}#ccPanel .g button{padding:9px 0;font-size:.8em}#ccPanel .g button.o{background:#ff6a5a22}#ccPanel .g button.i{background:#4caf5033}';
    document.head.appendChild(st); panel = document.createElement('div'); panel.id = 'ccPanel'; document.body.appendChild(panel);
  }
  const hide = () => { shown = false; if (panel) { panel.classList.remove('on'); panel.innerHTML = ''; } };
  const give = c => { cur = c; hide(); };
  function open() {
    ensureDom(); shown = true; pickId = null; pickCell = null; render(); panel.classList.add('on');
  }
  function render() {
    if (!panel || !shown) return;
    const p = curPitcher(), b = curBatter(), runners = [0, 1, 2].filter(i => G.on && G.on[i]);
    let h = `<h4>🧤 捕手配球　${esc(b && b.name)}　${G.balls}-${G.strikes}　${G.outs} 出局</h4><div class="row">`;
    (p.pitches || []).forEach(x => { const d = PITCHES[x.id] || {}; h += `<button data-p="${x.id}"${pickId === x.id ? ' class="sel"' : ''}>${esc(d.short || x.id)} Lv${x.lv == null ? '' : x.lv}</button>`; });
    h += '</div><div class="g">';
    for (let r = 2; r >= -2; r--) for (let c = -2; c <= 2; c++) { const key = c + ',' + r, inz = Math.abs(c) <= 1 && Math.abs(r) <= 1; h += `<button data-c="${key}" class="${inz ? 'i' : 'o'}${pickCell === key ? ' sel' : ''}">${inz ? colLabel(c) : ''}</button>`; }
    h += `</div><div class="row"><button class="pri" id="ccGo"${pickId && pickCell ? '' : ' disabled'}>✔ 下指示</button><button id="ccAuto">🤖 電腦決定</button><button id="ccAll">🤖 本場全交給電腦</button>${G.balls < 3 ? '<button id="ccPO">🚫 外角球（防盜壘）</button>' : ''}</div>`;
    if (runners.length) h += '<div class="row">' + runners.map(i => `<button data-k="${i}">⚾ 牽制${['一', '二', '三'][i]}壘</button>`).join('') + '</div>';
    panel.innerHTML = h;
    panel.querySelectorAll('[data-p]').forEach(e => e.onclick = () => { pickId = e.dataset.p; render(); });
    panel.querySelectorAll('[data-c]').forEach(e => e.onclick = () => { pickCell = e.dataset.c; render(); });
    panel.querySelectorAll('[data-k]').forEach(e => e.onclick = () => give({ pk: +e.dataset.k }));
    const $ = id => panel.querySelector('#' + id);
    $('ccGo').onclick = () => { if (!pickId || !pickCell) return; const [c, r] = pickCell.split(',').map(Number), xy = cellXY(c, r); give({ id: pickId, x: xy.x, y: xy.y }); };
    $('ccAuto').onclick = () => give({ auto: true });
    $('ccAll').onclick = () => { autoAll = true; give({ auto: true }); };
    if ($('ccPO')) $('ccPO').onclick = () => give({ pitchout: true });
  }
  /* ---------- 包裝引擎函式 ---------- */
  try { const _cd = cpuDeliver; cpuDeliver = function () { if (isMine() && !autoAll && !G.rosinBusy && !G.batFetch) { if (!cur) { if (!shown) open(); return; } } return _cd.apply(this, arguments); }; } catch (e) { console.warn('CCALL：無法包裝 cpuDeliver', e); }
  try { const _ap = aiPickPitch; aiPickPitch = function (p, b) {
    const c = cur;
    if (c && !c.auto && c.pk == null && !G.intWalk) {
      if (c.pitchout) { G.lastPitchout = true; return { id: 'ST', x: side() * 2.15, y: ZC + .2, pitchout: true }; }
      if (c.id && p && p.pitches && p.pitches.some(x => x.id === c.id)) { G.lastPitchout = true; return { id: c.id, x: c.x, y: c.y }; }      // lastPitchout=true：避免電腦臨時改成外角球蓋掉你的指示（doPitch 會重設）
    }
    return _ap.apply(this, arguments);
  }; } catch (e) { console.warn('CCALL：無法包裝 aiPickPitch', e); }
  try { const _pk = aiPickoffThink; aiPickoffThink = function () { const c = cur; if (c && !c.auto) return c.pk != null ? c.pk : -1; return _pk.apply(this, arguments); }; } catch (e) { console.warn('CCALL：無法包裝 aiPickoffThink', e); }
  try { const _dp = doPitch; doPitch = function () { cur = null; return _dp.apply(this, arguments); }; } catch (e) { }
  try { const _dk = doPickoff; doPickoff = function () { cur = null; return _dk.apply(this, arguments); }; } catch (e) { }
  (function watch() { requestAnimationFrame(watch); try { if (shown && (!isMine() || G.phase !== 'pre')) hide(); if (!G || G.mode !== 'play' || G.over) { autoAll = false; cur = null; } else if (!isMine() && !shown) cur = null; } catch (e) { } })();
  return { need: () => shown, isMine, get pending() { return cur; }, get autoAll() { return autoAll; }, reset: () => { cur = null; autoAll = false; hide(); } };
})();
