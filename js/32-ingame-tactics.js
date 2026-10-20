/* 32-ingame-tactics.js — 比賽中戰術（敬遠／進攻／守備調整）（原 script.js 第 7214-7342 行） */
'use strict';
/* ---------------- 比賽中：戰術（敬遠／野手站位） ---------------- */
function humanIBB() {
  if (!(humanPitches() && G.human >= 0 && G.mode === 'play' && G.phase === 'pre') || G.pm || G.rosinBusy || G.intWalk || G.over) { say('投球前、尚未開始投球時才能下達敬遠'); return false; }
  G.intWalk = true; G.preT = 0; G.pitchDelay = .8; G.prepT = .1; const b = curBatter();
  say(castA(`戰術：<em>敬遠</em>！直接保送 ${b.name}`)); toast('敬遠', '#9fff9f', '#2a9a3a'); try { updateActs(); updatePlayerBoxes(); } catch (e) { } return true;
}
function setTac(group, val) {
  if (!(humanPitches() && G.human >= 0 && G.mode === 'play' && G.phase === 'pre') || G.pm || G.intWalk) { say('投球前才能調整戰術站位'); return; }
  G.tac = G.tac || {}; G.tac[group] = (val && G.tac[group] !== val) ? val : null;
  computeShift(); resetFormation(false); const t = (group === 'inf' ? TAC_INF : TAC_OF)[val];
  say(G.tac[group] ? `戰術：<em>${t.name}</em>` : `戰術：${t.name}解除，回到標準站位`); toast(G.tac[group] ? t.name : '標準站位', '#cfe', '#07a');
}
function openTacPanel() {
  const sub = $('sub'); sub.classList.remove('hide'); sub.dataset.k = 't';
  const close = '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b>'; sub.innerHTML = '<h3>🧭 戰術' + close + '</h3>';
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const mk = (txt, fn, on) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (on) d.style.outline = '2px solid #ffd84a'; d.onclick = () => { fn(); sub.classList.add('hide'); }; sub.appendChild(d); };
  mk(`${!(G.tac && (G.tac.inf || G.tac.of)) ? '✔ ' : ''}不使用任何戰術<span>取消內野、外野站位戰術，回到完全沒有使用戰術的預設站位</span>`, () => { G.tac = {}; computeShift(); resetFormation(false); say('戰術：不使用任何戰術，回到預設站位'); toast('預設站位', '#cfe', '#07a'); }, !(G.tac && (G.tac.inf || G.tac.of)));
  head('投手');
  mk(`敬遠　<span>強制讓目前打者直接保送上壘${G.on[0] && G.on[1] && G.on[2] ? '（滿壘會押回一分！）' : ''}</span>`, humanIBB, G.intWalk);
  head('內野站位（再按一次＝解除）');
  for (const k in TAC_INF) mk(`${G.tac && G.tac.inf === k ? '✔ ' : ''}${TAC_INF[k].name}<span>${TAC_INF[k].desc}</span>`, () => setTac('inf', k), G.tac && G.tac.inf === k);
  head('外野站位（再按一次＝解除）');
  for (const k in TAC_OF) mk(`${G.tac && G.tac.of === k ? '✔ ' : ''}${TAC_OF[k].name}<span>${TAC_OF[k].desc}</span>`, () => setTac('of', k), G.tac && G.tac.of === k);
  mk('關閉', () => { });
}
/* ---------------- 比賽中：進攻戰術（擠壓短打／打帶跑／盜壘選人／離壘距離） ---------------- */
function openOffPanel() {
  const sub = $('sub'); sub.classList.remove('hide'); sub.dataset.k = 'o'; sub.dataset.s = '';
  const close = '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b>'; sub.innerHTML = '<h3>🏃 進攻戰術' + close + '</h3>';
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const mk = (txt, fn, on) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (on) d.style.outline = '2px solid #ffd84a'; d.onclick = () => { fn(); try { updateActs(); } catch (e) { } sub.classList.add('hide'); }; sub.appendChild(d); };
  const stopBunt = () => { if (G.callBunt) { cancelBunt(true); applyBatStance(); } };
  const none = !(G.offCall || G.leadMode || G.stealReq || G.callBunt);
  mk(`${none ? '✔ ' : ''}不使用任何戰術<span>取消短打、犧牲打、盜壘、擠壓、打帶跑，離壘回到標準，全部恢復預設進攻</span>`, () => { stopBunt(); G.offCall = null; G.squeeze = null; G.stealReq = false; G.stealSel = null; G.stealSet = null; G.leadMode = 0; G.hitAndRun = false; say('進攻：不使用任何戰術，回到預設進攻'); toast('預設進攻', '#cfe', '#07a'); }, none);
  const o2 = G.outs < 2, on3 = !!(G.on[2] && G.on[2].state === 'on'), on12 = !!((G.on[0] && G.on[0].state === 'on') || (G.on[1] && G.on[1].state === 'on'));
  const dis = (txt, why) => { const d = document.createElement('div'); d.className = 'pbtn'; d.style.opacity = '.5'; d.innerHTML = txt + '<span style="color:#ffb0a0">⛔ 目前無法執行：' + why + '</span>'; d.onclick = () => { toast('無法執行：' + why, '#fff', '#c33'); say('進攻戰術<em>無法執行</em>：' + why); }; sub.appendChild(d); };
  head('強迫取分・擠壓短打（再按一次＝取消）');
  if (on3 && o2) {
    mk(`${G.offCall === 'safety' ? '✔ ' : ''}安全式擠壓<span>打者短打，三壘跑者看球再決定要不要衝回本壘</span>`, () => { if (G.offCall === 'safety') { G.offCall = null; stopBunt(); return; } G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'safety'; _buntTs = 0; if (!G.callBunt) toggleBunt(true); applyBatStance(); say('進攻戰術：<em>安全式擠壓短打</em>'); toast('安全式擠壓', '#ffe9a0', '#c60'); }, G.offCall === 'safety');
    mk(`${G.offCall === 'suicide' ? '✔ ' : ''}自殺式擠壓<span>投手一出手三壘跑者就起跑，打者一定要把球短打在地上</span>`, () => { if (G.offCall === 'suicide') { G.offCall = null; stopBunt(); return; } G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'suicide'; _buntTs = 0; if (!G.callBunt) toggleBunt(true); applyBatStance(); say('進攻戰術：<em>自殺式擠壓短打</em>！下一球三壘跑者起跑'); toast('自殺式擠壓', '#ffe9a0', '#c60'); }, G.offCall === 'suicide');
  } else { const why = !on3 ? '三壘沒有跑者' : '已經兩出局（擠壓需未滿兩出局）'; dis('安全式擠壓（強迫取分）', why); dis('自殺式擠壓（強迫取分）', why); }
  head('犧牲短打・犧牲高飛（再按一次＝取消）');
  if (on12 && o2) {
    mk(`${G.offCall === 'sac' ? '✔ ' : ''}犧牲短打<span>打者以出局數換取一、二壘跑者推進一個壘包，打者多半被刺殺</span>`, () => { if (G.offCall === 'sac') { G.offCall = null; stopBunt(); return; } G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'sac'; _buntTs = 0; if (!G.callBunt) toggleBunt(true); applyBatStance(); say('進攻戰術：<em>犧牲短打</em>，把跑者送上去！'); toast('犧牲短打', '#ffe9a0', '#c60'); }, G.offCall === 'sac');
  } else dis('犧牲短打', !on12 ? '一、二壘都沒有跑者（三壘有人請用擠壓或犧牲高飛）' : '已經兩出局（犧牲短打需未滿兩出局）');
  if (on3 && o2) {
    mk(`${G.offCall === 'sacfly' ? '✔ ' : ''}犧牲高飛<span>打者刻意把球打高，外野接殺後三壘跑者觸壘跑回本壘得分；打成滾地球就沒效果</span>`, () => { if (G.offCall === 'sacfly') { G.offCall = null; return; } stopBunt(); G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = 'sacfly'; say('進攻戰術：<em>犧牲高飛</em>，打者要把球打高！'); toast('犧牲高飛', '#ffe9a0', '#c60'); }, G.offCall === 'sacfly');
  } else dis('犧牲高飛', !on3 ? '三壘沒有跑者' : '已經兩出局（犧牲高飛需未滿兩出局）');
  const runs = []; if (G.on[1] && !G.on[2]) runs.push([1, '二壘跑者', '三壘']); if (G.on[0] && !G.on[1]) runs.push([0, '一壘跑者', '二壘']);
  if (runs.length) {
    head('盜壘（再按一次＝取消）');
    runs.forEach(([i, nm, to]) => { const r = G.on[i], on = G.stealReq && G.offCall !== 'hitrun' && (G.stealSel === i || (G.stealSel == null && i === runs[0][0]));
      mk(`${on ? '✔ ' : ''}${nm}盜${to}<span>${r.pl.name}　速${gr(r.pl.spd)}</span>`, () => { if (on) { G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = null; return; } if (G.offCall === 'suicide' || G.offCall === 'safety' || G.offCall === 'sac') { G.offCall = null; stopBunt(); } G.offCall = null; G.stealSel = i; G.stealSet = null; G.stealReq = true; say(`進攻戰術：<em>${nm}盜${to}</em>，跑者立即起跑`); }, on); });
    head('打帶跑（跑者提前起跑、打者務必揮棒；再按一次＝取消）');
    runs.forEach(([i, nm, to]) => { const r = G.on[i], on = G.stealReq && G.offCall === 'hitrun' && (G.stealSel === i || (G.stealSel == null && i === runs[0][0]));
      mk(`${on ? '✔ ' : ''}${nm}打帶跑（跑${to}）<span>${r.pl.name}比盜壘更早起跑，打者要揮棒；滾地安打可多推進一壘，揮空或飛球有被刺殺／雙殺風險</span>`, () => { if (on) { G.stealReq = false; G.stealSel = null; G.stealSet = null; G.offCall = null; return; } stopBunt(); G.stealSel = i; G.stealSet = null; G.stealReq = true; G.offCall = 'hitrun'; say(`進攻戰術：<em>打帶跑</em>！${nm}提前起跑，打者務必揮棒`); toast('打帶跑', '#ffe9a0', '#c60'); }, on); });
  }
  if (!runs.length) { head('盜壘・打帶跑'); const why = '沒有可前進的跑者（需一壘有人且二壘空，或二壘有人且三壘空）'; dis('盜壘', why); dis('打帶跑', why); }
  if (!G.on.some(r => r && r.state === 'on')) { head('壘上跑者離壘距離'); dis('大幅／標準／保守離壘', '壘上沒有跑者'); }
  if (G.on.some(r => r && r.state === 'on')) {
    head('壘上跑者離壘距離');
    mk(`${G.leadMode > 0 ? '✔ ' : ''}大幅離壘<span>離壘更遠、更容易推進，但也更容易被牽制、被電腦看穿</span>`, () => { G.leadMode = G.leadMode > 0 ? 0 : 1; say(G.leadMode ? '跑者：<em>大幅離壘</em>' : '跑者：標準離壘'); }, G.leadMode > 0);
    mk(`${!G.leadMode ? '✔ ' : ''}標準離壘<span>預設，依跑者腳程與企圖心自動決定</span>`, () => { G.leadMode = 0; say('跑者：標準離壘'); }, !G.leadMode);
    mk(`${G.leadMode < 0 ? '✔ ' : ''}保守離壘<span>靠近壘包、不易被牽制，但推進較吃虧</span>`, () => { G.leadMode = G.leadMode < 0 ? 0 : -1; say(G.leadMode ? '跑者：<em>保守離壘</em>' : '跑者：標準離壘'); }, G.leadMode < 0);
  }
  mk('關閉', () => { });
}
function toggleStealPanel() {
  const sub = $('sub'); if (!sub.classList.contains('hide') && sub.dataset.k === 'o' && sub.dataset.s === '1') { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanBats()) return;
  if (!canSteal()) { G.stealReq = false; G.stealSet = null; updateActs(); say('壘上沒有可以盜壘的跑者（前方壘包有人）'); return; }
  openStealPanel();
}
function openStealPanel() {      // 盜壘選擇：全員盜壘，或自己勾選壘上哪幾位跑者要跑（可複選）
  const sub = $('sub'); sub.classList.remove('hide'); sub.dataset.k = 'o'; sub.dataset.s = '1';
  const names = ['一壘跑者', '二壘跑者', '三壘跑者'], tos = ['二壘', '三壘', '本壘'];
  const render = () => {
    sub.innerHTML = '<h3>🏃 盜壘選擇<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b></h3>';
    const cur = stealIdxs(), cand = [2, 1, 0].filter(i => G.on[i] && G.on[i].state === 'on');
    const item = (txt, fn, on) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (on) d.style.outline = '2px solid #ffd84a'; d.onclick = () => { fn(); try { updateActs(); } catch (e) { } render(); }; sub.appendChild(d); };
    const apply = set => { set = [...new Set(set)]; if (!set.length) { G.stealReq = false; G.stealSet = null; G.stealSel = null; say('取消盜壘指示'); return; } if (G.offCall === 'hitrun') G.offCall = null; G.stealSel = null; G.stealSet = set; G.stealReq = true; const ix = stealIdxs(); say(ix.length ? `盜壘：<em>${ix.map(i => names[i]).join('、')}</em>立即起跑` : '目前沒有可以盜壘的跑者'); };
    const all = cand;
    item(`${G.stealReq && all.length && all.every(i => cur.includes(i)) && cur.length === all.length ? '✔ ' : ''}全員盜壘<span>所有能跑的跑者一起起跑（${all.map(i => names[i]).join('、')}）</span>`, () => apply(all), G.stealReq && all.length > 0 && all.every(i => cur.includes(i)));
    cand.forEach(i => { const r = G.on[i], on = cur.includes(i), need = G.on[i + 1] && i < 2 ? '（前方有人，跑到壘前等）' : '';
      item(`${on ? '✔ ' : '☐ '}${names[i]}盜${tos[i]}${need}<span>${r.pl.name}　速${gr(r.pl.spd)}</span>`, () => { let set = cur.slice(); if (on) set = set.filter(x => x !== i); else set.push(i); apply(set); }, on); });
    if (G.stealReq) item('取消盜壘', () => apply([]), false);
    item('完成', () => sub.classList.add('hide'), false);
  };
  render();
}
$('btnOff').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide') && sub.dataset.k === 'o') { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanBats()) { say('進攻戰術只能在自己打擊時使用（守備時請用「戰術（敬遠／站位）」）'); return; }
  if (G.phase !== 'pre') { say('投手已經開始投球動作，請在下一球投球前下達進攻戰術'); return; }
  openOffPanel();
};
$('btnTac').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide') && sub.dataset.k === 't') { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanPitches() || G.phase !== 'pre') { say('自己守備、投球前才能下達戰術'); return; }
  openTacPanel();
};
/* ---------------- 比賽中：守備調整（代守／互換守位） ---------------- */
function openDefPanel(a) {
  const sub = $('sub'), side = G.human, t = G.teams[side]; sub.classList.remove('hide'); sub.dataset.k = 'd';
  const close = '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b>';
  const mk = (txt, fn, op) => { const d = document.createElement('div'); d.className = 'pbtn'; d.innerHTML = txt; if (op) d.style.opacity = op; d.onclick = fn; sub.appendChild(d); };
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const fin = msg => { sub.classList.add('hide'); say(msg); updatePlayerBoxes(); updateActs(); };
  const pct = (nat, pos) => { const p = fitPenalty(nat, pos); return p ? '守備 −' + Math.round(p * 100) + '%' : '守位適合'; };
  if (!a) {
    sub.innerHTML = '<h3>守備調整' + close + '</h3>'; head('點選要調整的野手（投球前、球進入死球狀態才能換）');
    t.lineup.forEach(p => { if (p.out) return; mk(`${POS_LABEL[p.pos] || p.pos}　${p.name}<span>守${gr(p.fld)} 肩${gr(p.arm)}${p.penalty ? '・非本位' : ''}</span>`, () => openDefPanel(p)); });
    mk('關閉', () => sub.classList.add('hide')); return;
  }
  sub.innerHTML = `<h3>${POS_LABEL[a.pos] || a.pos}　${a.name}${close}</h3>`;
  head('代守：換上板凳球員（原球員退場、本場不得再上）');
  const bn = t.bench.filter(x => !x.out); if (!bn.length) head('（板凳沒有人了）');
  bn.forEach(x => mk(`${x.name}（${x.nat}）<span>${pct(x.nat, a.pos)}・巧${gr(x.con)} 守${gr(x.fld0)} 肩${gr(x.arm0)}</span>`, () => { const old = a, s2 = subInto(side, old, x); if (s2) { toast('代守', '#fff', '#39f'); fin(`代守！${sideName(side)}換上 <em>${s2.name}</em> 守${POS_LABEL[a.pos] || a.pos}，${old.name}退場`); } }));
  if (a.pos === 'DH') head('指定打擊不能與野手互換守位（規則：DH 一旦守備即失去指定打擊資格）');
  else { head('互換守位（兩人都留在場上）'); t.lineup.forEach(b => { if (b === a || b.out || b.pos === 'DH') return; mk(`與 ${POS_LABEL[b.pos]} ${b.name} 互換<span>你守${POS_LABEL[b.pos]}：${pct(a.nat, b.pos)}　他守${POS_LABEL[a.pos]}：${pct(b.nat, a.pos)}</span>`, () => { const pa = a.pos, pb = b.pos; setPos(a, pb); setPos(b, pa); swapFielderRig(pa, b); swapFielderRig(pb, a); toast('換守位', '#fff', '#39f'); fin(`守備調整：${a.name}改守${POS_LABEL[pb]}，${b.name}改守${POS_LABEL[pa]}`); }); }); }
  mk('← 返回', () => openDefPanel()); 
}
$('btnDef').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide')) { sub.classList.add('hide'); return; }
  if (G.human < 0 || !humanPitches() || G.phase !== 'pre') { say('自己守備、投球前才能調整守備'); return; }
  openDefPanel();
};

