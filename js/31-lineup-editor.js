/* 31-lineup-editor.js — 賽前編成（打線／守位／先發）（原 script.js 第 7114-7213 行） */
'use strict';
/* =====================================================================
   賽前編成：守備位置／打擊順序／先發投手（中職真實名單）＋ 比賽中守備調整
   ===================================================================== */
const ED = [null, null];
const ED_TAB = { v: 0 };
const POS_LABEL = { C: '捕手', '1B': '一壘', '2B': '二壘', '3B': '三壘', SS: '游擊', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊' };
const _edPoolCache = {};
function edPool(teamId) {          // 該隊 12 名野手（9 先發＋3 板凳）的能力值（與比賽中完全相同的換算結果）
  if (_edPoolCache[teamId]) return _edPoolCache[teamId]; const D = CPBL[teamId], m = {};
  D.bat.concat(D.bench).forEach(r => { m[r.n] = mkBatter(r, 0); }); return _edPoolCache[teamId] = m;
}
function edDefault(ti) {
  const def = TEAMS[ti ? CFG.home : CFG.away], t = buildTeam(def, { spIdx: 0 }, undefined);
  const pos = {}; t.lineup.forEach(p => { pos[p.name] = p.pos; });
  return { teamId: def.id, order: t.lineup.map(p => p.name), pos, spIdx: 0 };
}
function edEnsure(ti) { const id = TEAMS[ti ? CFG.home : CFG.away].id; if (!ED[ti] || ED[ti].teamId !== id) ED[ti] = edDefault(ti); return ED[ti]; }
const edChips = (p, pos) => { const pen = fitPenalty(p.nat, pos), fl = Math.round(p.fld0 * (1 - pen)), c = v => v >= 80 ? 'hi' : v >= 65 ? 'mid' : v >= 50 ? '' : 'lo';
  return `<span class="chip">巧${gr(p.con)}</span><span class="chip">力${gr(p.pow)}</span><span class="chip">速${gr(p.spd)}</span><span class="chip">守${gr(fl)}</span><span class="chip">${p.hand === 'S' ? '兩' : p.hand === 'L' ? '左' : '右'}打</span>${pen ? `<span class="chip warn">非本位 −${Math.round(pen * 100)}%</span>` : ''}`; };
function spCardHtml(r, i, on, clickable) {
  const p = mkPitcher(r);
  return `<div class="spc${on ? ' on' : ''}${isSJH(r) ? ' sjh' : ''}"${clickable ? ` data-sp="${i}"` : ' style="cursor:default"'}><div><b>${isSJH(r) ? (SJH.ok ? '⭐ ' : '🔒 ') : ''}${r.n}</b><em>${r.h === 'L' ? '左' : '右'}投</em></div><small>${Math.round(p.kmh)}km/h・球威${gr(stuffOf(p))}・控球${gr(p.ctl)}・ERA ${r.era.toFixed(2)}${r.est ? '（估）' : ''}</small><small>${p.pitches.map(q => PITCHES[q.id].short + lvGr(q.lv)).join(' ')}</small></div>`;
}
function askSJH(onOk, onCancel) {      // 傳說球員密碼視窗
  const old = document.getElementById('sjhDlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'sjhDlg';
  d.innerHTML = '<div class="sjh-box"><div class="sjh-t">🔒 傳說球員・蘇家禾</div><div class="sjh-s">請輸入密碼才能選擇這位球員</div><input id="sjhIn" type="text" inputmode="numeric" maxlength="8" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="****"><div class="sjh-e" id="sjhE"></div><div class="sjh-b"><button type="button" id="sjhNo">取消</button><button type="button" id="sjhYes">確認</button></div></div>';
  document.body.appendChild(d);
  const inp = d.querySelector('#sjhIn'), err = d.querySelector('#sjhE'), close = () => d.remove();
  let real = ''; inp.addEventListener('input', () => { let r = ''; for (let i = 0; i < inp.value.length; i++) { const c = inp.value[i]; r += c === '*' ? (real[i] || '') : c; } real = r.replace(/\D/g, '').slice(0, 8); inp.value = '*'.repeat(real.length); });
  const no = () => { close(); if (onCancel) onCancel(); };
  const go = () => { if (real === SJH.pw) { SJH.ok = true; close(); if (onOk) onOk(); } else { err.textContent = '密碼錯誤，請再試一次'; inp.value = ''; real = ''; inp.focus(); } };
  d.querySelector('#sjhYes').onclick = go; d.querySelector('#sjhNo').onclick = no;
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); else if (e.key === 'Escape') no(); });
  d.addEventListener('pointerdown', e => e.stopPropagation());
  setTimeout(() => inp.focus(), 60);
}
function renderLineup() {
  const el = $('lineup'), ti = ED_TAB.v, ed = edEnsure(ti), def = TEAMS[ti ? CFG.home : CFG.away], D = CPBL[def.id], pool = edPool(def.id);
  const mine = CFG.side === ti, names = Object.keys(pool).filter(n => mine || n !== SJH.name), bench = names.filter(n => ed.order.indexOf(n) < 0);
  let h = `<div class="lu-card"><div class="lu-h"><b>🧢 賽前編排</b><button type="button" id="luX" class="lu-x" title="返回比賽設定">✕</button></div>
  <div class="lu-tabs">${[0, 1].map(i => { const d = TEAMS[i ? CFG.home : CFG.away]; return `<button type="button" class="lu-tab${i === ti ? ' on' : ''}" data-t="${i}" style="border-bottom-color:${d.c1}">${(i === (CFG.homeFirst ? 0 : 1)) ? '主隊' : '客隊'}(${i ? '後攻' : '先攻'})・${d.short}${CFG.side === i ? ' ★' : ''}</button>`; }).join('')}</div>
  <div class="lu-tip">${mine ? '點「名字」或「守位」直接更換，選到重複的會自動互換。' : '🤖 電腦隊伍會在開賽時自動決定先發與棒次。' + (CFG.side === 2 ? '（觀戰模式：兩隊皆由電腦編排）' : '')}</div>`;
  if (!mine) {
    h += `<div class="lu-sec">球隊野手</div><div class="lu-roster">`;
    names.forEach(n => { const p = pool[n]; h += `<div class="rc"><b>${n}<small style="opacity:.7;font-weight:500">（${p.nat}）</small></b><span class="lc">${edChips(p, p.nat)}</span></div>`; });
    h += `</div><div class="lu-sec">投手群</div><div class="lu-sp">${D.sp.map((r, i) => isSJH(r) ? '' : spCardHtml(r, i, false, false)).join('')}</div>
    <div class="lu-btns"><button type="button" id="luBack" class="pillb">← 返回</button><button type="button" id="luDone" class="pillb" style="background:linear-gradient(#5fd98f,#1f9150)">開始比賽 ▶</button></div></div>`;
    el.innerHTML = h; return;
  }
  h += `<div class="lu-quick"><button type="button" id="luAuto" class="pillb">🤖 智慧編排</button><button type="button" id="luReset" class="pillb">↺ 還原預設</button></div>
  <div class="lu-sec">先發投手</div><div class="lu-sp">${D.sp.map((r, i) => spCardHtml(r, i, ed.spIdx === i, true)).join('')}</div>
  <div class="lu-sec">打擊順序・守備位置</div>`;
  ed.order.forEach((n, i) => {
    const p = pool[n], pos = ed.pos[n];
    h += `<div class="lr"><span class="ln">${i + 1}</span>
    <select class="lp" data-i="${i}">${names.map(x => `<option value="${x}"${x === n ? ' selected' : ''}>${x === SJH.name ? (SJH.ok ? '⭐ ' : '🔒 ') : ''}${x}（${pool[x].nat}${bench.indexOf(x) >= 0 ? '・板凳' : ''}）</option>`).join('')}</select>
    <select class="ls" data-i="${i}">${POS9.map(q => `<option value="${q}"${q === pos ? ' selected' : ''}>${POS_LABEL[q]}</option>`).join('')}</select>
    <span class="mv"><button type="button" data-up="${i}"${i ? '' : ' disabled'}>▲</button><button type="button" data-dn="${i}"${i < 8 ? '' : ' disabled'}>▼</button></span>
    <span class="lc">${edChips(p, pos)}</span></div>`;
  });
  h += `<div class="lu-sec">板凳（可代打／代跑／代守）</div>`;
  bench.forEach(n => { const p = pool[n]; h += `<div class="lr bn"><span class="ln">板</span><span class="bnm">${n === SJH.name ? (SJH.ok ? '⭐ ' : '🔒 ') : ''}${n}（${p.nat}）</span><span class="lc">${edChips(p, p.nat)}</span></div>`; });
  h += `<details class="lu-doc"><summary>📖 能力值如何影響比賽</summary><div>
  <b>打者</b>：巧打＝揮棒圈大小／碰到壞球的極限；力量＝擊球初速與全壘打；速度＝跑壘、盜壘與內野安打；選球＝辨識變化球；得點圈＝壘上有人時的打擊技術；對左投＝面對左投手的打擊；捕球＝野手接球失誤率（與守備範圍合計）。異手對決打者較有利。<br>
  <b>投手</b>：球速與球種等級（Lv）決定位移幅度；控球決定落點與暴投率；球數增加會疲勞。<br>
  <b>守備</b>：守＝反應、跑速、飛撲與失誤率；肩＝傳球速度；非本位球員依適性折減。<br>
  <b>天氣</b>：大雨與暴雨會縮小揮棒圈、削弱擊球力道，並讓球路與滾地球更難掌握。暴雨時失誤與突發狀況更常發生、場上會積水（球碰到水窪會直接停住）；暴雨持續太久主審會暫停比賽，暫停時可用「教練抗議」連點把抗議值衝滿、激烈抗議讓比賽繼續，但過一陣子雨勢沒變小仍會再度暫停。<br><b>台灣特色天氣</b>：梅雨（綿密細雨、濕冷）、午後雷陣雨（雷雨來得快去得快，雨後可能出現彩虹）、颱風外圍環流（強風與一陣一陣的風雨，失誤變多）、悶熱高溫（氣溫可達 37°C 以上，球飛得較遠、投手體力消耗更快）、空氣霾害（視線不佳、高飛球更難判斷）、東北季風（穩定強風、濕冷）。各球場的區域天氣傾向不同。<br><b>夜間比賽</b>：選好球場後有 30% 機率改為夜場；燈塔全開、場地明亮，氣溫較涼、風較小，高飛球易受燈光眩光影響。</div></details>
  <div class="lu-btns"><button type="button" id="luBack" class="pillb">← 返回</button><button type="button" id="luDone" class="pillb" style="background:linear-gradient(#5fd98f,#1f9150)">開始比賽 ▶</button></div></div>`;
  el.innerHTML = h;
}
(function () {
  const el = $('lineup'); let st = 0;
  const open = () => { SJH.ok = false; for (let k = 0; k < 2; k++) { const e0 = ED[k]; if (e0 && ((e0.order || []).indexOf(SJH.name) >= 0 || (e0.spIdx != null && isSJH(((CPBL[e0.teamId] || {}).sp || [])[e0.spIdx])))) ED[k] = null; } ED_TAB.v = CFG.side === 1 ? 1 : 0; edEnsure(0); edEnsure(1); renderLineup(); el.classList.remove('hide'); el.scrollTop = 0; };
  window.openLineup = open;
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('click', e => {
    const t = e.target, ed = ED[ED_TAB.v]; if (!ed) return;
    if (t.id === 'luX' || t.id === 'luBack') { el.classList.add('hide'); return; }
    if (t.id === 'luDone') { launchGame(); return; }
    if (t.id === 'luAuto') { if (CFG.side !== ED_TAB.v) return; const na = aiAutoEdit(TEAMS[ED_TAB.v ? CFG.home : CFG.away], { ace: 1 }); na.spIdx = ed.spIdx || 0; ED[ED_TAB.v] = na; renderLineup(); return; }
    if (t.id === 'luReset') { if (CFG.side !== ED_TAB.v) return; ED[ED_TAB.v] = edDefault(ED_TAB.v); renderLineup(); return; }
    if (t.dataset.t !== undefined && t.classList.contains('lu-tab')) { ED_TAB.v = +t.dataset.t; renderLineup(); return; }
    if (CFG.side !== ED_TAB.v) return; const sp = t.closest('[data-sp]'); if (sp) { const si = +sp.dataset.sp, rr = CPBL[TEAMS[ED_TAB.v ? CFG.home : CFG.away].id].sp[si]; if (isSJH(rr)) { askSJH(() => { ed.spIdx = si; renderLineup(); }); return; } ed.spIdx = si; renderLineup(); return; }
    if (t.dataset.up !== undefined || t.dataset.dn !== undefined) { const i = +(t.dataset.up !== undefined ? t.dataset.up : t.dataset.dn), j = t.dataset.up !== undefined ? i - 1 : i + 1; if (j < 0 || j > 8) return; [ed.order[i], ed.order[j]] = [ed.order[j], ed.order[i]]; renderLineup(); }
  });
  el.addEventListener('change', e => {
    const t = e.target, ed = ED[ED_TAB.v]; if (!ed || t.dataset.i === undefined || CFG.side !== ED_TAB.v) return; const i = +t.dataset.i;
    if (t.classList.contains('lp') && t.value === SJH.name && !SJH.pass) { const nv = t.value; renderLineup(); askSJH(() => { const s2 = el.querySelector('.lp[data-i="' + i + '"]'); if (s2) { s2.value = nv; SJH.pass = true; s2.dispatchEvent(new Event('change', { bubbles: true })); SJH.pass = false; } }); return; }
    if (t.classList.contains('lp')) {              // 換人：選到先發者＝兩人互換打序；選到板凳者＝替換並承接守位
      const n = t.value, j = ed.order.indexOf(n), old = ed.order[i];
      if (j >= 0) { if (j !== i) [ed.order[i], ed.order[j]] = [ed.order[j], ed.order[i]]; }
      else { ed.order[i] = n; ed.pos[n] = ed.pos[old]; delete ed.pos[old]; }
    } else if (t.classList.contains('ls')) {       // 換守位：與持有該守位者互換
      const q = t.value, me = ed.order[i], j = ed.order.findIndex(n => ed.pos[n] === q);
      if (j >= 0 && ed.order[j] !== me) ed.pos[ed.order[j]] = ed.pos[me]; ed.pos[me] = q;
    }
    renderLineup();
  });
})();
