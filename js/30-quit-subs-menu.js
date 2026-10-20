/* 30-quit-subs-menu.js — 返回主選單／代打代跑／設定選單（原 script.js 第 7008-7113 行） */
'use strict';
/* ---------------- 返回主選單（遊戲中途離開：確認後直接中斷比賽） ---------------- */
let QUIT_OPEN = false;
function openQuitDlg() { if (G.mode !== 'play') return; QUIT_OPEN = true; $('quitDlg').classList.remove('hide'); }
function closeQuitDlg() { QUIT_OPEN = false; $('quitDlg').classList.add('hide'); }
/* 比賽中開著「更多」選單／戰術／守備／換投／代打／音樂設定面板時，遊戲暫停（關閉後才繼續），避免邊設定邊偷跑 */
const _hSub = $('sub'), _hAud = $('audioPanel'), _hActs = $('acts');
function uiHold() { return G.mode === 'play' && (!_hSub.classList.contains('hide') || !_hAud.classList.contains('hide') || _hActs.classList.contains('open') || BP.cut); }
function quitToMenu() {
  closeQuitDlg(); try { bpReset(); } catch (e) { }
  TIMERS = []; tweens.length = 0; INTRO.q.length = 0; INTRO.busy = false; INTRO.gen = (INTRO.gen || 0) + 1; HS = 0;
  try { clearPlay(); } catch (e) { }
  G.freeze = false; G.judgeTok = (G.judgeTok || 0) + 1; rpHide(); pmCancel(); PT = null; G.over = true; try { resetRainDelay(); } catch (e) { } G.mode = 'menu'; G.phase = 'over'; G.pending = null; G.walking = false; G.absPend = null; G.cpuBusy = false; G.ts = 1;
  try { evInit(); } catch (e) { }
  if (E.coach) { try { scene.remove(E.coach.rig.root); } catch (e) { } E.coach = null; }
  if (E.argC) { try { scene.remove(E.argC.rig.root); } catch (e) { } E.argC = null; }
  E.rage = null; try { clearMedic(); } catch (e) { }
  setBall({ x: 0, y: 0, z: 0 }, false); rainbow.visible = false; G.night = false; try { applyLighting(); updateNight(0); } catch (e) { }
  for (const id of ['hud', 'intro', 'sub', 'result', 'throwPanel', 'pitchPanel', 'outBanner', 'ejectBanner', 'absPanel', 'hitInfo', 'visitBox', 'brawlBanner']) { const e = $(id); if (e) e.classList.add('hide'); }
  $('acts').classList.remove('open'); $('btnSpeed').textContent = '⏩ 遊戲速度 x1';
  $('menu').classList.remove('hide'); CAMC.mode = 'title';
}
$('btnQuit').onclick = () => openQuitDlg();
$('quitNo').onclick = closeQuitDlg;
$('quitYes').onclick = backToTitle;
try { HINT.on = localStorage.getItem('cpbl_hint') === '1'; } catch (e) { }
const syncHintBtn = () => { $('btnHint').textContent = '🎯 投球落點提示 ' + (HINT.on ? 'ON' : 'OFF'); };
$('btnHint').onclick = () => { HINT.on = !HINT.on; if (!HINT.on) HINT.pt = null; try { localStorage.setItem('cpbl_hint', HINT.on ? '1' : '0'); } catch (e) { } syncHintBtn(); };
syncHintBtn();
$('btnSpeed').onclick = () => { G.ts = G.ts === 1 ? 2 : G.ts === 2 ? 4 : 1; $('btnSpeed').textContent = '⏩ 遊戲速度 x' + G.ts; };
function openSubP(refresh) {
  const sub = $('sub'); if (!refresh && !sub.classList.contains('hide')) { sub.classList.add('hide'); return; }
  if (G.phase !== 'pre') { say('投球前才能換投／熱身'); return; }
  if (G.human < 0 || G.human > 1) { say('只有自己守備（投球）時才能換投'); return; }
  const side = G.human, t = G.teams[side], canSwap = humanPitches(); sub.classList.remove('hide'); sub.dataset.k = 'p';
  sub.innerHTML = '<h3>' + (canSwap ? '換投／場下熱身' : '場下熱身（進攻中只能熱身）') + '<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b></h3>';
  const tip = document.createElement('div'); tip.style.cssText = 'font-size:11.5px;opacity:.88;margin:-2px 0 6px;line-height:1.5;color:#ffd9a8'; tip.innerHTML = '🔥 讓預備投手提早在牛棚熱身：手感與心情會變好；熱身太久（過熱）登板時體力會大幅下降，還可能受傷。最多可同時熱身兩名。'; sub.appendChild(tip);
  t.pitchers.forEach((p, i) => {
    if (i !== t.cur && (p.out || p.used)) return; const d = document.createElement('div'); d.className = 'pbtn' + (i === t.cur ? ' sel' : '');
    d.innerHTML = `${p.num} ${p.name} (${p.hand === 'R' ? '右' : '左'}) ${p.kmh}km/h・控球${gr(p.ctl)}<span>${p.role === 'SP' ? '先發' : p.role === 'CL' ? '終結者' : p.lr ? '長中繼' : '中繼'}${i === t.cur ? '・目前投手' : ''}</span>`;
    d.onclick = () => { if (!canSwap) { say('目前是進攻局，無法換投；可以先按「場下熱身」讓投手提早準備'); return; } if (G.human !== side || !humanPitches() || G.phase !== 'pre') { sub.classList.add('hide'); return; } if (i !== t.cur) { changePitcher(side, i, false, '玩家指示'); } sub.classList.add('hide'); buildPitchPanel(); };
    if (i !== t.cur) {
      const w = document.createElement('div'); w.className = 'wu'; const wv = Math.round(p.warm || 0), fe = warmFatEst(p);
      w.innerHTML = `<i class="wb"><u style="width:${wv}%"></u></i><em>${p.warming || wv > 0 ? '熱身 ' + wv + '%・' + warmTxt(p) + (fe ? '・體力-' + fe : '') : '尚未熱身'}</em>`;
      const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'wubtn' + (p.warming ? ' on' : ''); bt.textContent = p.warming ? '■ 停止熱身' : '🔥 場下熱身';
      bt.onclick = e => { e.stopPropagation(); if (p.warming) { p.warming = false; bpSync(); openSubP(true); } else { bpStart(side, i); } };
      w.appendChild(bt); d.appendChild(w); d.style.flexWrap = 'wrap';
    }
    sub.appendChild(d);
  });
  const c = document.createElement('div'); c.className = 'pbtn'; c.textContent = '關閉'; c.onclick = () => sub.classList.add('hide'); sub.appendChild(c);
}
$('btnSub').onclick = () => openSubP(false);
/* ---------------- 代打／代跑 ---------------- */
$('btnBench').onclick = () => {
  const sub = $('sub'); if (!sub.classList.contains('hide')) { sub.classList.add('hide'); return; }
  if (G.phase !== 'pre' || !humanBats()) { say('投球前才能代打／代跑'); return; }
  const side = G.human, t = G.teams[side], b = curBatter(); const avail = t.bench.filter(x => !x.out);
  sub.classList.remove('hide'); sub.dataset.k = 'b'; sub.innerHTML = '<h3>代打／代跑<b class="sx" onclick="this.closest(\'#sub\').classList.add(\'hide\')">✕</b></h3>';
  const mk = (txt, cls, fn) => { const d = document.createElement('div'); d.className = 'pbtn' + (cls ? ' ' + cls : ''); d.innerHTML = txt; d.onclick = fn; sub.appendChild(d); return d; };
  const head = s => { const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-weight:900;color:#9cf;font-size:13px'; h.textContent = s; sub.appendChild(h); };
  const fitTx = (x, pos) => { const p = fitPenalty(x.nat, pos); return p === 0 ? '守位適合' : '守備 -' + Math.round(p * 100) + '%'; };
  const done = () => { sub.classList.add('hide'); updatePlayerBoxes(); updateActs(); };
  if (!avail.length) { head('板凳已經沒有人了'); }
  else {
    head(b.isPitcherBat ? '代打：投手打席無法代打（請先換投）' : `代打：換下第${G.bi[side] + 1}棒 ${b.name}`);
    if (!b.isPitcherBat) avail.forEach(x => mk(`${x.name} (${x.nat}・${x.hand === 'R' ? '右' : x.hand === 'L' ? '左' : '兩'}打)<span>巧${gr(x.con)} 力${gr(x.pow)} 速${gr(x.spd)}・${fitTx(x, b.pos)}</span>`, '', () => {
      const s2 = subInto(side, b, x); if (!s2) return; if (E.bat) E.bat.pl = s2; setupBatter(); say(`代打！${sideName(side)}換上 <em>${s2.name}</em> 代替 ${b.name}`); toast('代打', '#fff', '#39f'); G.log.push('代打'); done(); }));
    const runners = E.runners.filter(r => r.state === 'on' && r.from >= 1 && !r.pl.isPitcherBat);
    runners.forEach(r => { head(`代跑：${r.from}壘跑者 ${r.pl.name}（速度${grLetter(r.pl.spd)}）`); avail.forEach(x => mk(`${x.name} (${x.nat})<span>速${gr(x.spd)}・${fitTx(x, r.pl.pos)}</span>`, '', () => {
      const old = r.pl, s2 = subInto(side, old, x); if (!s2) return; r.pl = s2; r.spd = (5.6 + s2.spd * .036) * MOVEK; r.rig.limp = 0; say(`代跑！${s2.name}代替 ${old.name} 站上${r.from}壘`); toast('代跑', '#fff', '#39f'); G.log.push('代跑'); done(); })); });
  }
  { const ret = t.retired || []; head('規則：退場球員本場不得再上場；代打／代跑者承接被替換者的棒次與守位');
    if (ret.length) { head('已退場名單'); ret.forEach(x => { const d = document.createElement('div'); d.className = 'pbtn'; d.style.opacity = '.5'; d.innerHTML = x.name + '<span>' + (x.nat || '') + '</span>'; sub.appendChild(d); }); } }
  mk('關閉', '', () => sub.classList.add('hide'));
};
/* ---------------- menu ---------------- */
/* CFG.H / CFG.A = 真正的主隊／客隊；CFG.ctl = 我操控(0主 1客 2觀戰)；CFG.ord = 我方先後攻(0先攻 1後攻)
   CFG.away / CFG.home / CFG.side 為遊戲內部使用：away＝先攻球隊、home＝後攻球隊、side＝我方所在的攻擊順序 */
const CFG = { park: '', easy: 0, H: 1, A: 0, ctl: 0, ord: 0, homeFirst: true, away: 1, home: 0, side: 0, inn: 9, lv: 1, abs: 1, pn: 0, evt: 1, ace: 0, wx: 1, night: -1 };
function syncCfg() {
  const ctlHome = CFG.ctl !== 1, myFirst = CFG.ord === 0;
  const homeFirst = ctlHome ? myFirst : !myFirst;
  CFG.homeFirst = homeFirst;
  CFG.away = homeFirst ? CFG.H : CFG.A; CFG.home = homeFirst ? CFG.A : CFG.H;
  CFG.side = CFG.ctl === 2 ? 2 : (ctlHome ? (homeFirst ? 0 : 1) : (homeFirst ? 1 : 0));
  const a = $('homeOrd'), b = $('awayOrd'); if (a) a.textContent = homeFirst ? '先攻' : '後攻'; if (b) b.textContent = homeFirst ? '後攻' : '先攻';
}
function buildCards() {
  syncCfg();
  for (const [id, key] of [['homeCards', 'H'], ['awayCards', 'A']]) {
    const box = $(id); box.innerHTML = '';
    TEAMS.forEach((t, i) => {
      const d = document.createElement('div'); d.className = 'card' + (CFG[key] === i ? ' sel' : ''); d.innerHTML = t.icon ? `<i class="bdg ico">${t.icon}</i><span>${t.card || t.short}</span>` : `<i class="bdg" style="background:linear-gradient(135deg,${t.c1} 50%,${t.c2} 50%)"></i><span>${t.short}</span>`; d.setAttribute('role', 'button');
      d.onclick = () => { const ok = key === 'A' ? 'H' : 'A'; if (CFG[ok] === i) CFG[ok] = CFG[key]; CFG[key] = i; buildCards(); }; box.appendChild(d);   // 選到對方隊伍時自動互換，避免同隊對戰
    });
  }
}
const LV_DESC = ['<b>弱</b>　電腦多投好打的直球、變化小、球速較慢且控球穩定（少壞球），打者容易揮空，適合新手練習', '<b>普通</b>　標準難度，電腦配球與控球均衡、偶有變化球，打者表現中等，推薦首次遊玩', '<b>強</b>　電腦會讀球、針對你的弱點配球，球種等級與球威更高，打者更會選球，守備與跑壘更積極', '<b>宗師・最高難度</b>　電腦極度聰明強悍：選球與配球近乎精準、記住並攻擊你的弱點、守備反應更快，專為高手設計'];
function setLvDesc(v) { const e = $('lvDesc'); if (e) { e.innerHTML = (LV_DESC[v] || '') + (CFG.easy ? '<br><b>簡易模式</b>　打擊只要抓時機按「揮棒」、不用瞄準；守備由電腦自動傳球補位' : ''); e.dataset.lv = v; } }
setLvDesc(CFG.lv);
document.querySelectorAll('.pill').forEach(p => p.onclick = () => { const k = p.dataset.k; CFG[k] = +p.dataset.v; if (k === 'lv' || k === 'easy') setLvDesc(CFG.lv); if (k === 'ctl' || k === 'ord') syncCfg(); document.querySelectorAll(`.pill[data-k="${k}"]`).forEach(x => x.classList.toggle('sel', x === p)); });
{ const sp = $('selPark'); if (sp) { sp.innerHTML = '<option value="">自動（依主場／賽程）</option>' + STADIUMS.map(n => `<option value="${n}">${n}${PARKS[n].dome ? '（室內）' : ''}</option>`).join(''); sp.title = '選擇比賽球場；不同球場的外野尺寸、牆高與天氣特性都不同'; sp.onchange = () => { CFG.park = sp.value; }; } }
function launchGame() { sndInit(); const c = Object.assign({}, CFG); if (c.ace) c.spIdx = 0; c.edit = [0, 1].map(i => { const e = ED[i], id = TEAMS[i ? CFG.home : CFG.away].id; return CFG.side === i && e && e.teamId === id ? e : null; }); $('lineup').classList.add('hide'); newGame(c); }
$('startBtn').onclick = () => { sndInit(); openLineup(); };
$('quickBtn').onclick = () => { sndInit(); ED[0] = ED[1] = null; launchGame(); };          // 直接開賽：雙方使用預設陣容
$('swapTeams').onclick = () => { const t = CFG.A; CFG.A = CFG.H; CFG.H = t; buildCards(); };
