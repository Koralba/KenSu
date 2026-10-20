/* 19-hud-helpers.js — HUD 輔助函式（原 script.js 第 4217-4340 行） */
'use strict';
/* ---------------- HUD helpers ---------------- */
let capTimer = null;
let colorTok = 0;
function setCap(html) { const e = $('capTx'); if (e) e.innerHTML = html; G.lastSay = html; }
function colorSay(html, delay) {      // 球評補充：主播講完後隔一下才接話；如果期間已有新的播報就不再插話
  const my = colorTok; after(delay == null ? 1.7 : delay, () => { if (colorTok === my && !G.over && G.mode === 'play') { clearTimeout(capTimer); setCap(html); } });
}
function say(html, ms) { colorTok++; const e = $('capTx'); e.innerHTML = html; clearTimeout(capTimer); if (ms) capTimer = setTimeout(() => { if (e.innerHTML === html) e.innerHTML = ''; }, ms); G.lastSay = html; }
let tipTimer = null, tipTimer2 = null;
function timingTip(text, c1, c2) {      // 過早／過晚提示：顯示在底部狀態列，停留約 3 秒
  const t = $('timingTip'); if (!t) return; clearTimeout(tipTimer); clearTimeout(tipTimer2);
  t.textContent = text; t.style.background = `linear-gradient(180deg,${c1},${c2})`; t.classList.remove('show', 'fade'); void t.offsetWidth; t.classList.add('show');
  tipTimer = setTimeout(() => t.classList.add('fade'), 2600); tipTimer2 = setTimeout(() => t.classList.remove('show', 'fade'), 3150);
}
function _mixHex(a, b, k) { const p = c => { c = String(c).replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c, 16); return isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }; const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); }
function _isWhite(c) { c = String(c).replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c, 16); return !isNaN(n) && Math.min((n >> 16) & 255, (n >> 8) & 255, n & 255) >= 225; }
function toast(text, c1, c2) {
  let a = c1 || '#fff27a', b = c2 || '#ff9a1a';
  if (_isWhite(a)) a = _mixHex(b, '#ffffff', .4);      // 純白上色會和白色外框糊在一起、整句變成白字 → 改用較淡的同色系（黃、淺藍等有顏色的不動）
  const t = $('toast'); t.textContent = text; t.style.background = `linear-gradient(180deg,${a} 8%,${b} 92%)`; t.style.webkitBackgroundClip = 'text'; t.style.backgroundClip = 'text'; t.style.color = 'transparent'; t.style.webkitTextFillColor = 'transparent';
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}
function placeSpeed() {      // 球速／球路：貼在計分板（#sb）正下方，左緣對齊、寬度至少與計分板同寬，不再被其他面板蓋住
  const s = $('spd'), sb = $('sb'), hud = $('hud'); if (!s || !sb || !hud) return;
  const hr = hud.getBoundingClientRect(), r = sb.getBoundingClientRect();
  if (r.width > 4 && r.height > 4) { s.style.left = Math.round(r.left - hr.left) + 'px'; s.style.top = Math.round(r.bottom - hr.top - 1) + 'px'; s.style.minWidth = Math.round(r.width) + 'px'; }
  else { s.style.left = '50%'; s.style.top = '12vh'; s.style.minWidth = ''; }
}
function showSpeed(kmh, name, col) {
  const s = $('spd'); s.innerHTML = kmh + '<small>km/h</small> <small style=\"color:' + (col || '#fff') + '\">' + name + '</small>';
  placeSpeed(); s.style.opacity = .97; clearTimeout(showSpeed.t); showSpeed.t = setTimeout(() => s.style.opacity = 0, 2400);
}
function pitchHint(pt) {      // 球落點結束（進手套／被打到／揮空）後，才以半透明小提示顯示剛才的球種與球速
  if (!pt || pt.hinted || pt.ibb) return; pt.hinted = true; showSpeed(pt.kmh, pt.spec.jp, pt.spec.col);
}
function flashScreen(a) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a || .5; void f.offsetWidth; f.style.transition = 'opacity .5s'; f.style.opacity = 0; }
function updateLamps() {
  document.querySelectorAll('.lamp.b').forEach((e, i) => e.classList.toggle('on', i < G.balls)); document.querySelectorAll('.lamp.s').forEach((e, i) => e.classList.toggle('on', i < G.strikes)); document.querySelectorAll('.lamp.o').forEach((e, i) => e.classList.toggle('on', i < G.outs));
  ['b1', 'b2', 'b3'].forEach((id, i) => $(id).classList.toggle('on', !!G.on[i]));
  $('inn').innerHTML = G.inning + '<small>局' + (G.half ? '下' : '上') + '</small>';
  layoutTop();
}
function updateScoreboard() {
  const n = Math.max(G.innings, G.inning), t = $('sbt'); let h = '<tr><th></th>'; for (let i = 1; i <= n; i++) h += '<th class="in">' + i + '</th>'; h += '<th>計</th><th class="x">安</th><th class="x">失</th></tr>';
  for (let s = 0; s < 2; s++) {
    const tm = G.teams[s]; h += '<tr class="' + (G.half === s ? 'on' : '') + '"><td class="nm" style="color:' + (s ? tm.c1 : '#fff') + '">' + tm.short + (G.human === s ? ' ★' : '') + '</td>';
    for (let i = 1; i <= n; i++) { const v = G.line[s][i - 1]; const played = i < G.inning || (i === G.inning && (s <= G.half)); h += '<td class="in ' + (i === G.inning && G.half === s ? 'cur' : '') + '">' + (v !== undefined ? v : (played ? 0 : '')) + '</td>'; }
    h += '<td class="tot">' + G.score[s] + '</td><td class="x">' + G.hits[s] + '</td><td class="x">' + G.errs[1 - s === s ? s : s] + '</td></tr>';
  }
  t.innerHTML = h;
  layoutTop();
}
function pitchSetText(p) { return p.pitches.map(q => PITCHES[q.id].short + lvGr(q.lv)).join(' '); }
function updatePlayerBoxes() {
  const p = curPitcher(), b = curBatter();
  const mdiv = m => `<div class="mood"><span>${moodFace(m)}</span><span class="mb"><i style="width:${Math.round(m)}%;background:${moodColor(m)}"></i></span><span>心情 ${Math.round(m)}・${moodWord(m)}</span></div>`;
  $('pN').innerHTML = '<span style="color:#9cf">' + ({ SP: '先發', RP: '中繼', CL: '終結' }[p.role] || '') + '</span> ' + p.name + ' <small>(' + (p.hand === 'R' ? '右' : '左') + '投)</small>';
  $('pS').innerHTML = Math.round(p.kmh) + 'km/h' + (p.vel != null ? gr(p.vel) : '') + ' ・ 球威' + gr(stuffOf(p)) + ' 控球' + gr(p.ctl) + ' ・ ' + pitchSetText(p) + ' ・ ' + p.pc + ' 球' + mdiv(moodOf(p));
  $('pBar').style.width = clamp(100 - p.fatigue, 3, 100) + '%';
  const h = E.bat ? E.bat.hand : b.hand;
  $('bN').innerHTML = '<span style="color:#9cf">第' + (G.bi[G.half] + 1) + '棒</span> ' + b.name + ' <small>(' + (h === 'R' ? '右' : '左') + '打)</small>';
  $('bS').innerHTML = (b.pos || '') + '・巧打' + gr(b.con) + ' 力量' + gr(b.pow) + ' 速度' + gr(b.spd) + ' 選球' + gr(b.eye) + (b.clt != null ? ' 得點圈' + gr(b.clt) + ' 對左' + gr(b.vsl) + ' 捕球' + gr(b.cat) : '') + ' ・ 今日 ' + b.st.ab + '打數' + b.st.h + '安打' + (b.st.hr ? ' 全壘打' + b.st.hr : '') + mdiv(moodOf(b));
  {   // 手機／平板精簡面板：能力與狀態一眼看完（兩行）
    const fat = clamp(100 - p.fatigue, 0, 100), fc = fat >= 55 ? '#7dff7d' : fat >= 30 ? '#ffe14a' : '#ff6a5a';
    const lv = v => v >= 80 ? 'hi' : v >= 65 ? 'mid' : v >= 50 ? '' : 'lo';
    const md = m => '<span class="md" style="color:' + moodColor(m) + '">' + moodFace(m) + ' ' + moodWord(m) + '</span>';
    $('pC').innerHTML = '<div class="ln"><span><b>' + Math.round(p.kmh) + '</b>km/h' + (p.vel != null ? gr(p.vel) : '') + '</span><span>球威' + gr(stuffOf(p)) + '</span><span>控球' + gr(p.ctl) + '</span><span>球數<b>' + p.pc + '</b></span><span class="fat">體力<i><u style="width:' + Math.round(fat) + '%;background:' + fc + '"></u></i><b style="color:' + fc + '">' + Math.round(fat) + '</b></span></div><div class="ln"><span class="pt">' + pitchSetText(p) + '</span>' + md(moodOf(p)) + '</div>';
    $('bC').innerHTML = '<div class="ln"><span>巧打' + gr(b.con) + '</span><span>力量' + gr(b.pow) + '</span><span>速度' + gr(b.spd) + '</span><span>選球' + gr(b.eye) + '</span>' + (b.clt != null ? '<span>圈' + gr(b.clt) + '</span><span>左' + gr(b.vsl) + '</span>' : '') + '</div><div class="ln"><span>' + (b.pos ? b.pos + '・' : '') + '今日<b>' + b.st.ab + '</b>打數<b>' + b.st.h + '</b>安打' + (b.st.hr ? '<b>' + b.st.hr + '</b>HR' : '') + '</span>' + md(moodOf(b)) + '</div>';
    layoutTop();
  }
}
function buildPitchPanel() {
  const pp = $('pitchPanel'); if (!humanPitches() || !(G.phase === 'pre')) { pp.classList.add('hide'); G.pitchOpen = false; return; }
  const p = curPitcher(); pp.classList.remove('hide'); pp.innerHTML = '';
  if (!p.pitches.some(q => q.id === G.selPitch)) G.selPitch = (p.pitches.find(q => q.id === 'ST') || p.pitches[0]).id;      // 預設球種＝直球（投手換人後若沒有目前球種也回到直球）
  const cur = p.pitches.find(q => q.id === G.selPitch), cs = PITCHES[cur.id];
  pp.classList.toggle('open', !!G.pitchOpen);
  const head = document.createElement('div'); head.className = 'pbtn sel pchead'; head.style.setProperty('--pc', cs.col); head.style.borderColor = cs.col;
  head.innerHTML = '<b class="pt">球種</b><b class="pcur"><em class="lg">' + cs.jp + '</em><em class="sh">' + cs.short + '</em></b><span>' + lvGr(cur.lv) + '</span><b class="car">▾</b>';
  head.onpointerdown = e => { e.stopPropagation(); if (G.pm) return; G.pitchOpen = !G.pitchOpen; buildPitchPanel(); };
  pp.appendChild(head);
  const list = document.createElement('div'); list.className = 'plist';
  p.pitches.forEach((q, i) => {
    const b = document.createElement('div'); b.className = 'pbtn' + (G.selPitch === q.id ? ' sel' : ''); b.innerHTML = '<b class="pn"><i class="k">' + (i + 1) + '. </i><em class="lg">' + PITCHES[q.id].jp + '</em><em class="sh">' + PITCHES[q.id].short + '</em></b><span>' + lvGr(q.lv) + '</span>'; b.style.borderColor = PITCHES[q.id].col; b.style.setProperty('--pc', PITCHES[q.id].col);
    b.onpointerdown = e => { e.stopPropagation(); if (G.pm) return; G.selPitch = q.id; G.pitchOpen = false; buildPitchPanel(); }; list.appendChild(b);      // 選好後選單收起，上方顯示目前球種，之後一直沿用直到再手動更換
  });
  pp.appendChild(list);
}
function canSteal() { return G.on.some(r => r && r.state === 'on'); }      // 一壘有人且二壘空、或二壘有人且三壘空，才能盜壘
function updateActs() {
  const hb = humanBats() && G.human >= 0, hp = humanPitches() && G.human >= 0;
  $('btnBench').style.display = hb ? '' : 'none'; $('btnBunt').style.display = hb && !G.easy ? '' : 'none'; $('btnPowPc').style.display = hb && !G.easy ? '' : 'none'; $('btnSteal').style.display = hb ? '' : 'none'; if (!canSteal()) G.stealReq = false; $('btnSteal').disabled = !canSteal(); $('btnSteal').style.opacity = canSteal() ? '' : '.4'; syncPowUI(); $('btnPick').style.display = 'none'; $('btnSub').style.display = G.human >= 0 && (hp || G.human === 1 - G.half) ? '' : 'none'; { const bm = $('btnMound'); bm.style.display = hp ? '' : 'none'; bm.innerHTML = '🧢 教練上場<i class="k"> M</i>（剩' + (G.human >= 0 ? G.visits[G.human] : 0) + '）'; }
  { const sb0 = $('sub'); if (!sb0.classList.contains('hide') && ((sb0.dataset.k === 'p' && !hp) || (sb0.dataset.k === 'b' && !hb) || (sb0.dataset.k === 'd' && !hp) || (sb0.dataset.k === 't' && !hp) || (sb0.dataset.k === 'o' && !hb))) sb0.classList.add('hide'); }
  { const bd = $('btnDef'); if (bd) bd.style.display = hp ? '' : 'none'; const bt2 = $('btnTac'); if (bt2) bt2.style.display = hp ? '' : 'none'; }
  { const bo = $('btnOff'); if (bo) { bo.style.display = hb ? '' : 'none'; bo.classList.toggle('on', hb && !!(G.offCall || G.leadMode || G.stealReq)); } }
  { const bmo = $('btnMore'); if (bmo) bmo.style.display = ''; }
  $('btnBunt').classList.toggle('on', !!G.callBunt && hb); { const bt = $('btnBuntT'); if (bt) { bt.style.display = hb && !G.easy ? '' : 'none'; bt.classList.toggle('on', !!G.callBunt && hb); } } $('btnSteal').classList.toggle('on', !!G.stealReq);
}
/* ---------------- commentary text ---------------- */
const HIT_NAME = ['', '一壘安打', '二壘安打', '三壘安打', '全壘打'];
function dirWord(x, z) { const a = Math.atan2(x, -z) * 180 / Math.PI; return a < -28 ? '左外野' : a < -10 ? '左外野線附近・左中間' : a < 10 ? '中外野' : a < 28 ? '右中間' : '右外野'; }
function areaWord(x, z) {
  const d = Math.hypot(x, z), a = Math.atan2(x, -z) * 180 / Math.PI;
  if (d < 33) { return a < -30 ? '三壘' : a < -8 ? '游擊' : a < 8 ? '投手' : a < 30 ? '二壘' : '一壘'; }
  return a < -16 ? '左外野' : a > 16 ? '右外野' : '中外野';
}
function hitTypeWord(k) { return { gb: '滾地球', ld: '平飛球', fb: '高飛球', pu: '內野小飛球', bunt: '短打' }[k] || ''; }
function lineSummary() { return ''; }
function numJp(n) { return n; }
const SAY = {
  pitchStart: (p, n, id) => pick([`${p.name}，第${n}球…`, `來，第${n}球，${p.name}高舉雙臂…`, `${p.name}，從定點姿勢…投出去了！`]),
  strikeLook: () => pick(['看著好球進去，好球！', '好球！完全沒有出棒', '漂亮地投進去了！好球！']),
  strikeSwing: () => pick(['揮空！', '咻！揮空了！', '時機完全不對，揮空！']),
  ball: () => pick(['壞球，選得很準', '壞球！偏出好球帶了', '壞球，這球看得很清楚']),
  foul: () => pick(['界外球！', '打高了！…界外球', '貼著邊線，界外！']),
  k: (b, sw) => sw ? pick([`揮空三振！${b.name}，遭到三振！`, `三振～！${b.name}，球棒揮空了！`]) : pick([`看三振！${b.name}，沒有出棒！`, `站著不動的三振～！`]),
  bb: b => pick([`四壞球保送。${b.name}，輕鬆上一壘`, `第四個壞球，${b.name}選到保送`]),
  hbp: b => `打到了！觸身球！${b.name}，上一壘`,
  steal: (r, ok) => ok ? `${r.pl.name}，盜壘成功！` : `${r.pl.name}，盜壘失敗！出局！`,
  hr: b => pick([`進去了～～！${b.name}，全壘打！！`, `很大！很大！進去了！是全壘打！！`, `${b.name}，完美的全壘打！看台都在震動！`]),
  scored: (n) => `跑回本壘得分！${n}`,
};


