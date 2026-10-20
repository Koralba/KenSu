/* 29-pitch-meter-buttons.js — 投球準度條／主按鈕／止滑粉（原 script.js 第 6817-7007 行） */
'use strict';
/* ---------------- 投球準度條（類 MLB MVP 2005）：第一下鎖定落點並啟動，第二下按停；愈靠近綠區愈準 ---------------- */
function pmCancel() { if (G.pm) _tsKey = ''; G.pm = null; const e = $('pmeter'); if (e) e.classList.add('hide'); }
function pmStart() {
  const p = curPitcher(), id = G.selPitch, spec = PITCHES[id], lv = pitchLv(p, id) || 4, brk = Math.hypot(spec.bx, spec.by) * lv / 7;
  let zw = clamp(.05 + (p.ctl - 40) * .0011 + lv * .006 - (p.fatigue || 0) * .0003 + (moodOf(p) - 55) * .0004, .045, .17);
  zw *= clamp(1.22 - brk * .35 - (spec.knuckle ? .15 : 0), .72, 1.2) * 1.2 * (p.rosin > 0 ? 1.05 : 1); if (G.easy) zw *= 1.4;      // 控球好、球種單純（直球）→ 綠區寬；變化球／疲勞／心情差 → 窄
  const dur = clamp(.66 - brk * .15 - (p.fatigue || 0) * .0013, .42, .72) * 1.55, c = .78;      // 準度條掃描速度放慢（比先前慢約 35%）
  G.pm = { id, x: aim.x, y: aim.y, t: 0, dur, c, zw };
  const pc = v => clamp(v * 100, 0, 100).toFixed(1);
  const st = [[0, '#d33'], [c - zw * 1.75, '#d33'], [c - zw * 1.75, '#f80'], [c - zw * .88, '#f80'], [c - zw * .88, '#ec3'], [c - zw * .12, '#ec3'], [c - zw * .12, '#3d6'], [c + zw * .12, '#3d6'], [c + zw * .12, '#ec3'], [c + zw * .88, '#ec3'], [c + zw * .88, '#f80'], [c + zw * 1.75, '#f80'], [c + zw * 1.75, '#d33'], [1, '#d33']];      // 綠＝完美、黃＝正常、橘＝稍微失控、紅＝失準
  $('pmBar').style.background = 'linear-gradient(90deg,' + st.map(a => a[1] + ' ' + pc(a[0]) + '%').join(',') + ')';
  $('pmName').textContent = spec.jp + ' 準度'; $('pmHint').textContent = MOB ? '再按一次「投球」鈕，在綠區按停' : '再按一次投出（對準綠區最準）'; _tsKey = ''; $('pmCur').style.left = '0%'; $('pmeter').classList.remove('hide');
}
function pmStop(auto) {
  const m = G.pm; if (!m) return; const u = clamp(m.t / m.dur, 0, 1), err = Math.abs(u - m.c);
  const e = err / m.zw; let acc, tier;
  if (auto) { acc = 0; tier = 3; }
  else if (e <= .12) { acc = 1; tier = 0; }                                         // 完美出手
  else if (e <= .88) { acc = 1 - (e - .12) / .76 * .3; tier = 1; }                // 正常出手
  else if (e <= 1.75) { acc = .7 - (e - .88) / .87 * .35; tier = 2; }               // 稍微失控
  else { acc = Math.max(0, .35 - (e - 1.75) / .75 * .35); tier = 3; }              // 失準出手
  pmCancel(); doPitch({ id: m.id, x: m.x, y: m.y, acc, tier });
}
function pmTick(dt) {
  const m = G.pm; if (!m) return;
  if (G.mode !== 'play' || G.phase !== 'pre' || !humanPitches() || G.intWalk || G.over) { pmCancel(); return; }
  if (m.ret) { m.rt += dt / (G.ts || 1); const k = clamp(m.rt / m.rdur, 0, 1); $('pmCur').style.left = (1 - k * k * (3 - 2 * k)) * 100 + '%'; if (k >= 1) pmStop(true); return; }
  m.t += dt / (G.ts || 1); $('pmCur').style.left = clamp(m.t / m.dur, 0, 1) * 100 + '%';
  if (m.t >= m.dur) { m.ret = true; m.rt = 0; m.rdur = .3; toast('逾時！失準出手', '#fff', '#a33'); }      // 沒按停＝取消（不再自動投出）
}
$('pmeter').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (G.pm && !G.pm.ret) pmStop(false); });      // 觸控：直接點準度條也能按停
function toGame() {
  sndInit(); if (G.mode === 'title') { G.mode = 'menu'; $('title').classList.add('hide'); $('menu').classList.remove('hide'); CAMC.mode = 'title'; flowSfx('whistle'); }
}
const wrap = $('wrap'); let touchId = null;
let tpt = null;                                              // touch drag state (relative aiming)
wrap.addEventListener('pointerdown', e => {
  if (G.mode === 'title') return;
  if (EV.brawl && !(e.target.closest && e.target.closest('#absPanel'))) { registerMash(); return; }
  if (e.target.closest && e.target.closest('#menu,#movePad,#rosinTag,.pkTag,.pbtn,.abtn,#sub,#result,#quitDlg,#throwPanel,#touchBtns,#rot,#sb,#pinfo,#topbar,#audioPanel,#absPanel,#actMore')) return;
  if (e.pointerType === 'mouse') { aim.lm = null; aim.has = true; aim.cx = e.clientX; aim.cy = e.clientY; aim.shift = e.shiftKey || keyShift; updateAim(); humanAction(); return; }
  if (!aim.has) { aim.has = true; aim.cx = e.clientX; aim.cy = e.clientY; updateAim(); }
  tpt = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, ox: 0, oy: 0 }; padHint(0, 0, true);
  try { wrap.setPointerCapture(e.pointerId); } catch (_) { }
});
wrap.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { aim.mx = e.clientX; aim.my = e.clientY; if (aim.lm) { if (Math.hypot(e.clientX - aim.lm.x, e.clientY - aim.lm.y) < 10) return; aim.lm = null; } aim.has = true; aim.cx = e.clientX; aim.cy = e.clientY; aim.shift = e.shiftKey || keyShift; return; }
  if (!tpt || e.pointerId !== tpt.id) return;
  const dx = e.clientX - tpt.x, dy = e.clientY - tpt.y; tpt.x = e.clientX; tpt.y = e.clientY; tpt.moved += Math.abs(dx) + Math.abs(dy); tpt.ox = clamp(tpt.ox + dx * .5, -40, 40); tpt.oy = clamp(tpt.oy + dy * .5, -40, 40); padHint(tpt.ox, tpt.oy, true);
  aim.cx = clamp(aim.cx + dx * 1.25, 0, VW()); aim.cy = clamp(aim.cy + dy * 1.25, 0, VH()); aim.has = true;
});
const endTouch = e => { if (!tpt || e.pointerId !== tpt.id) return; const tap = tpt.moved < 12 && performance.now() - tpt.t0 < 280; tpt = null; padHint(0, 0, false); /* 觸控拖曳瞄準後放開，不再當成點擊揮棒；只有「揮棒」鈕才會揮棒 */ };      // 觸控投球只能用「投球」鈕，避免誤觸自動開始投球
wrap.addEventListener('pointerup', endTouch); wrap.addEventListener('pointercancel', endTouch);
['contextmenu', 'dblclick', 'gesturestart', 'gesturechange', 'selectstart', 'dragstart'].forEach(n => document.addEventListener(n, e => e.preventDefault()));
['touchstart', 'touchmove'].forEach(n => wrap.addEventListener(n, e => { const t = e.target; if ((t === wrap || (t.tagName === 'CANVAS')) && e.cancelable) e.preventDefault(); }, { passive: false }));      // 球場區域：擋掉長按放大鏡／縮放／捲動
if (IS_TOUCH) document.body.classList.add('touch');
function padHint(x, y, act) { const pad = $('movePad'), th = $('movePadT'); if (!pad) return; pad.classList.toggle('act', !!act); th.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`; }
function recenterAim() {            // 換打者：準心回到好球帶正中央
  const w = VW(), h = VH(), tc = new THREE.PerspectiveCamera(CAMC.tfov, w / h, camera.near, camera.far);
  tc.position.copy(CAMC.tpos); tc.lookAt(CAMC.tlook); tc.updateMatrixWorld(); tc.updateProjectionMatrix();
  const v = new THREE.Vector3(0, ZC, 0).project(tc);
  aim.cx = (v.x * .5 + .5) * w; aim.cy = (-v.y * .5 + .5) * h; aim.x = 0; aim.y = ZC; aim.has = true;
  aim.lm = { x: aim.mx || 0, y: aim.my || 0 };   // 滑鼠：移動超過 10px 才接手
}
$('btnAct').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sndInit(); const b = $('btnAct'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 260); humanAction(); });
$('btnPush').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); doPush(); });
$('btnBack').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); doRetreat(); });
$('btnPow').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setPow(!POW_PREF); });
let _tsKey = '';
/* ---- 右下角主按鈕圖示：投球＝縫線棒球、揮棒＝球棒 ---- */
const BALL_SVG = (() => {
  const q = (t, a, b, c) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c; let tk = '', sm = '';
  for (const m of [0, 1]) {
    const X = v => m ? 64 - v : v; sm += `<path d="M${X(17)} 12 Q${X(31)} 32 ${X(17)} 52" fill="none" stroke="#d8262b" stroke-width="2.4" stroke-linecap="round"/>`;
    for (const t of [.1, .24, .38, .5, .62, .76, .9]) {
      const x = q(t, 17, 31, 17), y = q(t, 12, 32, 52), tx = 2 * (1 - t) * 14 + 2 * t * -14, ty = 2 * (1 - t) * 20 + 2 * t * 20, l = Math.hypot(tx, ty), nx = -ty / l * 3.6, ny = tx / l * 3.6;
      tk += `<line x1="${X(x - nx).toFixed(1)}" y1="${(y - ny).toFixed(1)}" x2="${X(x + nx).toFixed(1)}" y2="${(y + ny).toFixed(1)}" stroke="#d8262b" stroke-width="1.7" stroke-linecap="round"/>`;
    }
  }
  return `<svg viewBox="0 0 64 64"><defs><radialGradient id="gBall" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#fff"/><stop offset=".62" stop-color="#eef0f5"/><stop offset="1" stop-color="#aab3c2"/></radialGradient></defs><circle cx="32" cy="32" r="24" fill="url(#gBall)" stroke="#26344c" stroke-opacity=".5" stroke-width="1.4"/><g transform="translate(0 0)" opacity=".85">${sm}${tk}</g></svg>`;
})();
const BAT_SVG = `<svg viewBox="0 0 64 64"><defs><linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a8"/><stop offset=".5" stop-color="#e2a652"/><stop offset="1" stop-color="#a4651d"/></linearGradient></defs><g transform="rotate(-40 32 32)"><path d="M11 29.8 L30 30.4 C37 29 41 26.8 45 26.4 L53.5 26.4 Q60 26.4 60 32 Q60 37.6 53.5 37.6 L45 37.6 C41 37.2 37 35 30 33.6 L11 34.2 Z" fill="url(#gWood)" stroke="#5a3510" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="8.6" cy="32" rx="3.4" ry="3.6" fill="#7a4a18" stroke="#4a2a08" stroke-width="1.3"/><rect x="11" y="29.9" width="14" height="4.2" fill="#2b2e38"/><path d="M14 29.9 V34.1 M18 29.9 V34.1 M22 29.9 V34.1" stroke="#8d93a6" stroke-width="1"/><path d="M46.5 26.8 V37.2 M50.5 26.6 V37.4" stroke="#8a5a22" stroke-width="1.3" opacity=".7"/><path d="M33 29.6 C39 28 43 26.8 53 27.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round"/></g></svg>`;
let _actK = '';
function setActBtn(k) {
  if (k === _actK) return; _actK = k; const b = $('btnAct'); if (!b) return; b.dataset.k = k;
  const ai = b.querySelector('.ai'), al = b.querySelector('.al'); if (ai) ai.innerHTML = k === 'swing' ? BAT_SVG : BALL_SVG; if (al) al.textContent = k === 'swing' ? '揮棒' : k === 'stop' ? '按停' : '投球';
}
function syncTouch() {
  if (!IS_TOUCH) return;
  const hb = humanBats() && G.human >= 0, hp = humanPitches() && G.human >= 0, ph = G.phase;
  const on = G.mode === 'play' && (hb || hp) && (ph === 'pre' || ph === 'windup' || ph === 'flight');
  const padOn = G.mode === 'play' && (hb || hp); $('movePad').classList.toggle('on', padOn && !(hb && G.easy));
  const key = [on, hb, hp, G.mode, G.easy, !!G.pm].join(); if (key === _tsKey) return; _tsKey = key;
  $('touchBtns').classList.toggle('on', on); setActBtn(hp ? (G.pm ? 'stop' : 'pitch') : 'swing'); $('btnPow').style.display = hb && !G.easy ? '' : 'none';
  document.body.classList.toggle('playing', G.mode === 'play');
}
let keyShift = false;
window.addEventListener('keydown', e => {
  if (QUIT_OPEN) { if (e.key === 'Escape') closeQuitDlg(); e.preventDefault(); return; }
  if (uiHold()) {      // 面板／選單開著：遊戲暫停，不接受比賽按鍵（Esc 可關閉）
    if (e.key === 'Escape') { _hSub.classList.add('hide'); _hActs.classList.remove('open'); if (!_hAud.classList.contains('hide')) { const c = $('audioClose'); if (c) c.click(); } e.preventDefault(); }
    else if (!/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test((e.target && e.target.tagName) || '')) e.preventDefault();
    return;
  }
  if (G.mode === 'title') { if (!$('careerDlg').classList.contains('hide') && (e.key === 'Escape' || e.key === 'Enter')) { $('careerDlg').classList.add('hide'); e.preventDefault(); } return; }
  if (e.key === 'Shift') { keyShift = true; aim.shift = true; }
  if (G.mode !== 'play') return;
  if (EV.brawl) { if (e.code === 'Space') { registerMash(); e.preventDefault(); } return; }
  if (EV.abs) { const k = e.key.toLowerCase(); if (EV.abs.protest ? k === 'r' : k === 'c') { absResolveInput(true); e.preventDefault(); return; } if (e.code === 'Space' || k === 'escape') { absResolveInput(false); e.preventDefault(); return; } }
  if (!EV.abs && G.absPend && e.key.toLowerCase() === 'c') { runPend(); e.preventDefault(); return; }
  if (G.freeze) { e.preventDefault(); return; }
  if (PL && PL.ask && /^[tT]$/.test(e.key)) { humanThrow('chase'); e.preventDefault(); return; }
  if (PL && PL.ask && /^[rR]$/.test(e.key)) { humanThrow('relay'); e.preventDefault(); return; }
  if (PL && PL.ask && /^[cC]$/.test(e.key)) { humanThrow('chase'); e.preventDefault(); return; }
  if (PL && PL.ask && /^[0-4]$|^[hH]$/.test(e.key)) { humanThrow(/^[hH0]$/.test(e.key) ? 0 : +e.key === 4 ? 0 : +e.key); e.preventDefault(); return; }
  if (e.repeat && (e.code === 'Space' || /^[bBqQeEsSmMfFrRdD]$/.test(e.key))) { e.preventDefault(); return; }
  if (e.code === 'Space') { humanAction(); e.preventDefault(); }
  else if (/^[1-8]$/.test(e.key) && humanPitches() && G.phase === 'pre' && !G.pm) { const p = curPitcher().pitches[+e.key - 1]; if (p) { G.selPitch = p.id; G.pitchOpen = false; buildPitchPanel(); } }
  else if (e.key === 'b' || e.key === 'B') { if (humanBats()) { toggleBunt(); updateActs(); applyBatStance(); } }
  else if (e.key === 'q' || e.key === 'Q') { if (humanBats()) toggleStealPanel(); }
  else if (e.key === 'e' || e.key === 'E') { humanPickoff(); }
  else if (e.key === 'r' || e.key === 'R') { humanRosin(); }
  else if (e.key === 'f' || e.key === 'F') { doPush(); }
  else if (e.key === 'd' || e.key === 'D') { doRetreat(); }
  else if (e.key === 's' || e.key === 'S') { if (humanBats()) setPow(!POW_PREF); }
  else if (e.key === 'm' || e.key === 'M') { if (humanPitches()) { moundVisit(G.human); } }
});
window.addEventListener('keyup', e => { if (e.key === 'Shift') { keyShift = false; aim.shift = false; } });
function humanRosin() { if (humanPitches() && G.phase === 'pre' && !G.pm && !G.intWalk && !G.rosinBusy && G.mode === 'play') { doRosin(); say('投手摸了摸止滑粉，下一球手感更穩'); } }
/* 止滑粉：投球前摸一下，只有「下一球」控球更穩（用掉就沒了，要再摸一次）、不易手滑；出手時手上會飛出一陣白粉 */
function doRosin(done) {
  const P = E.F.P, p = curPitcher(); if (!P || !P.rig || G.rosinBusy) return false;
  G.rosinBusy = true; G.rosinAge = 0; const h = p.hand === 'R' ? 1 : -1, dur = 2.0; P.rig.anim = { name: 'rosin', t: 0, dur, opt: { hand: h } }; faceRig(P.rig, 0, 3);
  // 彎腰 → 手碰粉袋三下（粉袋留在原位、只被壓扁一下）→ 起身雙手搓粉、握好球
  for (const t of [.52, .74, .96]) after(t, () => { if (!G.rosinBusy) return; const b = rosinBag.position; powderPuff(b.x, b.y + .08, b.z, 16, .22, h * .1, .7, 0, .16, { op: .7, life: 1.2, grow: 3.6, sw: .6 }); for (let q = 0; q < 14; q++) fwSpawn(b.x + gauss() * .05, b.y + .1, b.z + gauss() * .05, gauss() * 1.2, 1 + Math.random() * 1.8, gauss() * 1.2, '#ffffff', .5 + Math.random() * .4, .05 + Math.random() * .04, 3, 2); rosinBag.scale.set(1.2, .6, 1.2); flowSfx('mitt', .18); });
  for (const t of [1.3, 1.5]) after(t, () => { if (!G.rosinBusy) return; pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 16, .2, h * .1, .4, .3, .12, { op: .6, life: 1.4, grow: 3.8, sw: .6 }); });
  after(1.75, () => { if (!G.rosinBusy) return; pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 20, .2, 0, .25, 1.4, .12, { op: .6, life: 1.6, grow: 4.4, sw: .8 }); flowSfx('mitt', .12); });
  after(dur, () => { G.rosinBusy = false; p.rosin = 1; if (P.rig.anim && P.rig.anim.name === 'rosin') P.rig.anim = null; if (done) done(); });
  return true;
}
const _rb = new V3(), RB_HOME = { y: .47 };
function updateRosinTag(dt) {      // 粉袋：平時放在投手丘旁（依投手慣用手換邊）；摸粉時被投手拿到手上；「止滑粉」按鈕貼在粉袋旁
  const tag = $('rosinTag'), p = G.mode === 'play' ? curPitcher() : null, h = p && p.hand === 'L' ? -1 : 1, hx = MOUND.x - .4 * h, hz = MOUND.z + .65;
  rosinBag.position.set(hx, RB_HOME.y, hz);
  if (G.rosinBusy) {
    G.rosinAge = (G.rosinAge || 0) + dt;      // 粉袋留在丘上，只在被手碰到時壓扁
    rosinBag.scale.x += (1 - rosinBag.scale.x) * Math.min(1, dt * 12); rosinBag.scale.y += (.75 - rosinBag.scale.y) * Math.min(1, dt * 12); rosinBag.scale.z = rosinBag.scale.x;
  }
  if (!tag) return;
  const hp = humanPitches() && G.human >= 0 && G.mode === 'play' && G.phase === 'pre' && !G.intWalk && !G.rosinBusy && !G.pm;
  tag.classList.remove('on');      // 場上的「粉」標籤不再使用：止滑粉按鈕已移到左下「盜壘」旁的動作列
  const bt = $('btnRosin');
  if (bt) { const mine = humanPitches() && G.human >= 0 && G.mode === 'play'; bt.style.display = mine ? '' : 'none'; bt.disabled = !hp; bt.style.opacity = !mine ? '' : !hp ? '.4' : (p && p.rosin > 0) ? '.6' : ''; }
}
const STT = [];
function updateStealTags() {      // 玩家進攻：每個壘上跑者旁都有「盜壘」字樣，點哪個就哪個跑者盜壘（可連點多位一起盜）
  const rt = $('rosinTag'); if (!rt || !rt.parentNode) return;
  if (!STT.length) for (let i = 0; i < 3; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pkTag'; b.textContent = '盜壘'; b.style.cssText = 'background:rgba(217,150,28,.45);border-color:rgba(255,232,150,.85);color:#fff6d0'; b.setAttribute('aria-label', ['一壘', '二壘', '三壘'][i] + '盜壘'); b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); humanSteal(i); }; rt.parentNode.appendChild(b); STT.push(b); }
  const ok = G.mode === 'play' && humanBats() && G.human >= 0 && stealWindowOpen() && !G.over;
  for (let i = 0; i < 3; i++) {
    const b = STT[i], r = ok ? G.on[i] : null; let show = false;
    if (r && r.state === 'on' && !r.stepGo) { runnerXZ(r, _rp); const sc = w2s(_rp.x, 1.6, _rp.z), pr = ov.width / Math.max(1, ov.clientWidth || ov.width), X = clamp(sc.x / pr + (i === 0 ? 40 : i === 2 ? 46 : 0), 36, ov.clientWidth - 36), Y = sc.y / pr - (i === 1 ? 26 : 8); _rv.set(_rp.x, 1.6, _rp.z).project(camera);
      if (_rv.z < 1 && sc.x / pr > -20 && sc.x / pr < ov.clientWidth + 20 && Y > 20 && Y < ov.clientHeight - 20) { show = true; b.style.left = X + 'px'; b.style.top = Y + 'px'; } }
    b.classList.toggle('on', show);
  }
}
const PKT = [];
function updatePickTags() {      // 「牽制」半透明字樣：貼在有跑者的壘包旁，玩家可自由選擇要牽制哪一壘
  const rt = $('rosinTag'); if (!rt || !rt.parentNode) return;
  if (!PKT.length) for (let i = 0; i < 3; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pkTag'; b.textContent = '牽制'; b.setAttribute('aria-label', ['一壘', '二壘', '三壘'][i] + '牽制'); b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); humanPickoff(i); }; rt.parentNode.appendChild(b); PKT.push(b); }
  const ok = G.mode === 'play' && humanPitches() && G.human >= 0 && G.phase === 'pre' && !G.intWalk && !G.rosinBusy && !G.over; let any = false;
  for (let i = 0; i < 3; i++) {
    const b = PKT[i], r = ok ? G.on[i] : null; let show = false;
    if (r && r.state === 'on') { runnerXZ(r, _rp); const sc = w2s(_rp.x, 1.6, _rp.z), pr = ov.width / Math.max(1, ov.clientWidth || ov.width), X0 = sc.x / pr + (i === 0 ? 40 : i === 2 ? 46 : 0), X = clamp(X0, 36, ov.clientWidth - 36), Y = sc.y / pr - (i === 1 ? 26 : 8); _rv.set(_rp.x, 1.6, _rp.z).project(camera);
      if (_rv.z < 1 && sc.x / pr > -20 && sc.x / pr < ov.clientWidth + 20 && Y > 20 && Y < ov.clientHeight - 20) { show = true; b.style.left = X + 'px'; b.style.top = Y + 'px'; } }
    b.classList.toggle('on', show); if (show) any = true;
  }
  const bp = $('btnPick'); if (bp) bp.style.display = (humanPitches() && G.human >= 0 && !any && ok && (G.on.some(r => r && r.state === 'on') || E.runners.some(q => q.earlyGo && q.state === 'run'))) ? '' : 'none';      // 跑者不在畫面內才退回原本按鈕
}
const _rv = new V3();
function humanPickoff(sel) {
  if (humanPitches() && G.human >= 0 && !G.rosinBusy && stealWindowOpen()) { const rr = E.runners.find(q => q.earlyGo && q.state === 'run' && q.dir > 0 && q.s < .8); if (rr) { stealPickoff(rr); return; } }
  if (typeof sel === 'number') { if (humanPitches() && G.phase === 'pre' && !G.rosinBusy && G.on[sel] && G.on[sel].state === 'on') doPickoff(sel); return; } if (humanPitches() && G.phase === 'pre' && !G.rosinBusy) { for (const i of [2, 1, 0]) if (G.on[i] && G.on[i].state === 'on') { doPickoff(i); return; } } }
$('absGo').onclick = () => EV.abs ? absResolveInput(true) : runPend(); $('absSkip').onclick = () => EV.abs ? absResolveInput(false) : absClearPend();
$('btnPowPc').onclick = () => setPow(!POW_PREF);
$('btnBunt').onclick = $('btnBuntT').onclick = () => { toggleBunt(); updateActs(); applyBatStance(); };
$('btnSteal').onclick = () => toggleStealPanel();
$('btnPick').onclick = () => humanPickoff();
{ const br1 = $('btnRosin'); if (br1) br1.onclick = humanRosin; const rt = $('rosinTag'); if (rt) { rt.onpointerdown = e => { e.stopPropagation(); }; rt.onclick = e => { e.stopPropagation(); humanRosin(); }; } }
$('btnMound').onclick = () => { if (humanPitches()) moundVisit(G.human); };

