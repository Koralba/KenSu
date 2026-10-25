/* ===== 11-game-flow.js ｜ 比賽流程：開賽介紹／半局／投球循環／打席結果／球棒事件／引擎 hooks =====
   載入順序 11/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
'use strict';
/* =====================================================================
   Part 6b: game flow — innings, pitch cycle, at-bat results
   ===================================================================== */
let PT = null;                                    // current pitch
G.pmodel = {}; G.pickCount = 0; G.selPitch = 'ST';
const tweens = [];
function ballTween(a, b, dur, arc, cb, ease) { tweens.push({ a, b, dur, t: 0, arc: arc || 0, cb, ease }); }
function updateTweens(dt) {
  for (let i = 0; i < tweens.length; i++) {
    const w = tweens[i]; w.t += dt; const u0 = clamp(w.t / w.dur, 0, 1), u = w.ease ? 1 - (1 - u0) * (1 - u0) : u0;
    setBall({ x: lerp(w.a.x, w.b.x, u), y: lerp(w.a.y, w.b.y, u) + Math.sin(u * Math.PI) * w.arc, z: lerp(w.a.z, w.b.z, u) }, true);
    if (u0 >= 1) { tweens.splice(i, 1); i--; if (w.cb) w.cb(); }
  }
}
function newGame(cfg) {
  try { bpReset(); } catch (e) { }
  G.teams = [buildTeam(TEAMS[cfg.away], cfg, 0), buildTeam(TEAMS[cfg.home], cfg, 1)]; if (cfg.ace) { G.teams.forEach(t => { }); }
  if (cfg.career && typeof CSEASON !== 'undefined') CSEASON.inject(G.teams, cfg);      // 生涯模式：把玩家角色放進自己的球隊（js/13d-career-season.js）
  G.human = cfg.side === 2 ? -1 : cfg.side; G.lv = cfg.lv; G.easy = !!cfg.easy; G.assist = !!cfg.assist;      // 輔助防守（js/13g-manual-fielding.js） G.innings = cfg.inn;
  G.score = [0, 0]; G.line = [[], []]; G.hits = [0, 0]; G.errs = [0, 0]; G.fancy = 0; G.inning = 1; G.half = 0; G.bi = [0, 0]; G.pmodel = {}; G.batHist = {};
  G.rosinBusy = false; G.batFetch = false; try { if (FLYBAT) endFlyBat(true); killBoy(); clearTrash(); } catch (e) { } G.over = false; G.walkoff = false; G.venueDone = false; VENUE.on = false; VENUE.done = null; document.body.classList.remove('venuing'); $('venueIntro').classList.add('hide'); G.mode = 'play'; G.playId = 0; G.pending = null; G.absOn = cfg.abs !== 0; G.evt = cfg.evt === undefined ? 1 : cfg.evt; evInit(); G.visits = [3, 3]; G.errPl = {}; G.wxOn = cfg.wx !== 0; G.homeIdx = cfg.homeFirst ? 0 : 1; initWeather(G.teams[G.homeIdx], cfg.park, cfg.night); G.stormHalves = 0; try { resetRainDelay(); resetPuddles(); } catch (e) { console.error(e); } hideHitInfo(0);
  $('hud').classList.remove('hide'); $('menu').classList.add('hide'); $('title').classList.add('hide'); $('result').classList.add('hide'); $('sub').classList.add('hide');
  startHalf();
}
function startHalf() {
  aim.need = true;
  G.outs = 0; G.balls = 0; G.strikes = 0; G.on = [null, null, null]; clearPlay(); tweens.length = 0; TIMERS = []; G.phase = 'change'; G.shift = null; G.tac = {}; G.leadMode = 0; G.offCall = null; G.stealSel = null; G.stealSet = null; G.pending = null; G.dead = false; G.runsPlay = [];
  aiManagePitcher(1 - G.half); aiCoachFielders();
  const ft = fieldingTeam(); G.selPitch = 'ST'; G.pitchOpen = false;      // 每個半局球種回到預設直球，要玩家自己再選
  rebuildField(); resetFormation(true); setBall({ x: 0, y: 0, z: 0 }, false);
  updateScoreboard(); updateLamps(); updatePlayerBoxes(); $('pitchPanel').classList.add('hide'); updateActs();
  setCamBat(true);
  const begin = () => {
    say(SAYX.halfStart() + (G.inning === 1 && G.half === 0 && G.wx ? `（${G.wx.venue}・${G.night ? '🌙夜間・' : ''}${skyLabel().join(' ')}・${G.wx.temp}°C）` : '')); colorSay(COLOR.inning(), 2.2);
    toast(`${G.inning}局${G.half ? '下' : '上'}`, '#bff', '#39f'); flowSfx('whistle');
    after(2.4, () => processInjuries(nextBatter));
  };
  if (G.inning === 1 && G.half === 0 && !G.venueDone && G.mode === 'play' && G.wx) { G.venueDone = true; if (typeof AUTOSIM !== 'undefined' && AUTOSIM.pref) begin(); else venueIntro(begin); } else begin();      // 自動模擬：略過球場開場動畫，直接開賽
}
/* ---------------- 開賽前球場介紹：顯示球場／主隊資訊，鏡頭環繞球場一圈後才正式開打（點擊或按空白鍵可略過） ---------------- */
const PARK_LOC = { '洲際棒球場': '台中市', '亞太主球場': '台南市', '桃園棒球場': '桃園市', '新莊棒球場': '新北市', '天母棒球場': '台北市', '澄清湖棒球場': '高雄市', '台北大巨蛋': '台北市', '嘉義市立棒球場': '嘉義市', '斗六棒球場': '雲林縣', '花蓮縣立棒球場': '花蓮縣', '台東縣立棒球場': '台東縣' };
const VENUE = { on: false, t: 0, dur: 8.6, orbit: 7.2, done: null };
function venueIntro(done) {
  const home = G.teams[G.homeIdx], away = G.teams[1 - G.homeIdx], name = G.wx.venue, PK = PARKS[name] || {}, owner = TEAMS.find(t => t.home === name);
  const ownerTx = name === '台北大巨蛋' ? '聯盟共用球場' : owner ? `${owner.name} 主場球場` : '中職例行賽球場';
  const moved = owner ? owner.id !== home.id : name === '台北大巨蛋' ? false : home.home !== name;
  const homeTx = `🏠 主隊：<b>${home.name}</b>${moved && name !== '台北大巨蛋' ? '（本場於此球場出賽）' : name === '台北大巨蛋' ? '（本場於大巨蛋出賽）' : ''}　✈ 客隊：${away.name}`;
  const wx = (G.night ? '🌙 夜間比賽・燈塔全開　' : '☀️ 日間比賽　') + (G.wx.dome ? '室內球場・無風無雨' : G.wx.off ? '天氣系統關閉' : `${skyLabel().join(' ')}・${G.wx.temp}°C`) + (G.night && G.wxOn ? '<br><small>夜場：氣溫較涼、風較小，高飛球易受燈光眩光影響，投手手感稍佳</small>' : '');
  const el = $('venueIntro');
  el.style.setProperty('--tc', home.c1 || '#2a5adf');
  el.innerHTML = `<div class="vi-bar vi-top"></div><div class="vi-bar vi-bot"></div><div class="vi-card" style="--tc:${home.c1 || '#2a5adf'}"><div class="vi-tag">🏟 STADIUM ・ 比賽球場</div><div class="vi-name">${name}</div><div class="vi-loc">📍 ${PARK_LOC[name] || ''}　${ownerTx}${PK.note ? '　・　' + PK.note : ''}</div><div class="vi-home">${homeTx}</div><div class="vi-wx">${wx}</div></div><div class="vi-skip">點擊或按空白鍵略過 ▸</div>`;
  document.body.classList.add('venuing'); el.classList.remove('hide'); VENUE.on = true; VENUE.t = 0; VENUE.done = done; G.phase = 'change';
  CAMC.mode = 'venue'; CAMC.tpos.set(0, 31, 24); CAMC.tlook.set(0, 1, -30); CAMC.tfov = 60 * (VP.fk || 1); camSnap(); flowSfx('whistle', .5); crowdCheer(.6);
}
function venueEnd() {
  if (!VENUE.on) return; VENUE.on = false; document.body.classList.remove('venuing'); $('venueIntro').classList.add('hide'); const d = VENUE.done; VENUE.done = null;
  if (G.mode === 'play') setCamBat();
  if (d) d();
}
$('venueIntro').addEventListener('click', e => { e.stopPropagation(); venueEnd(); });
document.addEventListener('keydown', e => { if (VENUE.on && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { e.preventDefault(); e.stopImmediatePropagation(); venueEnd(); } }, true);
function cleanupRunners() {
  E.runners = E.runners.filter(r => { if (r.state === 'out' || r.state === 'home') { scene.remove(r.rig.root); return false; } return true; });
}
const INTRO = { q: [], busy: false };
const introBusy = () => INTRO.busy || INTRO.q.length > 0;
function introPush(o) { if (window.__ff || (typeof AUTOSIM !== 'undefined' && AUTOSIM.pref && !AUTOSIM.needMe())) return; /* 自動模擬快轉中：不排打者／換投介紹卡（它們用真實時間計時，不會被快轉加速） */ INTRO.q.push(o); if (!INTRO.busy) introPlay(); }
function introPlay() {
  const o = INTRO.q.shift(); const el = $('intro'); if (!o) { INTRO.busy = false; el.classList.add('hide'); return; }
  INTRO.busy = true; el.innerHTML = `<div class="in-card" style="--tc:${o.c}"><div class="in-tag">${o.tag}</div><div class="in-name">${o.name}</div><div class="in-sub">${o.sub}</div><div class="in-next">${o.next}</div></div>`;
  el.classList.remove('hide'); flowSfx('whistle', .4); const gen = INTRO.gen || 0; setTimeout(() => { if ((INTRO.gen || 0) === gen) introPlay(); }, 2100);
}
function introBatter(b) {
  const t = battingTeam(), lu = t.lineup, i = G.bi[G.half], nx = lu[(i + 1) % lu.length];
  const hand = b.hand === 'L' ? '左打' : b.hand === 'S' ? '左右開弓' : '右打', today = (b.st.ab || b.st.bb) ? `今日 ${b.st.ab} 打數 ${b.st.h} 安打` : '今日首打席';
  introPush({ c: t.c1, tag: `${t.short || t.name}・第 ${i + 1} 棒打擊`, name: `<i>${POS_FULL[b.pos] || b.pos}</i>${b.num ? '#' + b.num + ' ' : ''}${b.name}`, sub: `${hand}　${today}　${b.line || ''}`, next: `下一棒 ▸ 第 ${(i + 1) % lu.length + 1} 棒　${POS_FULL[nx.pos] || nx.pos}　${nx.name}` });
}
function introPitcher(side, np, old) {
  const t = G.teams[side];
  introPush({ c: t.c1, tag: `${t.short || t.name}・換投 PITCHING CHANGE`, name: `<i>投手</i>${np.num ? '#' + np.num + ' ' : ''}${np.name}`, sub: `${np.hand === 'L' ? '左' : '右'}投　最速 ${np.kmh} km/h　${np.line || ''}`, next: `接替 ▸ ${old.name}（${old.pc || 0} 球）` });
}
function nextBatter() {
  if (G.over || G.forfeit >= 0) return;
  cleanupRunners(); if (!aiCoachBatter()) aiPinch();
  if (E.bat && E.bat.pl !== curBatter()) setupBatter(); else if (!E.bat) setupBatter();
  G.balls = 0; G.strikes = 0; G.seq = []; G.lastPitch = null; G.pickCount = 0; G.callBunt = false; G.sneak = false; G.hitAndRun = false; G.runnerGo = []; G.stealReq = false; G.offCall = null; G.stealSel = null; G.stealSet = null; G.pending = null;
  G.intWalk = false; G.intWalk = aiIntentionalWalk();
  for (const pos of POS_LIST) { E.F[pos].rig.ready = pos !== 'C'; }
  computeShift(); resetFormation(false);
  for (const r of G.on) if (r) { r.leadMax = clamp(1.8 + (r.pl.spd - 50) * .02 + ((r.pl.agg || 50) - 50) * .008 + (G.lv >= 2 ? .4 : 0), 1.4, 3.6); }
  setCamBat(); const b = curBatter(); recenterAim(); try { syncPowUI(); } catch (e) { }
  updatePlayerBoxes(); updateLamps(); updateScoreboard();
  G.phase = 'change'; G.preT = 0; G.pitchDelay = .6 + Math.random() * .5;
  say(G.intWalk ? castA(`第${G.bi[G.half] + 1}棒，${b.name}。這裡可能要故意四壞…！`) : SAYX.batter(b, G.bi[G.half] + 1));
  introBatter(b); const tok = G.introTok = (G.introTok || 0) + 1;
  const go = () => { if (tok !== G.introTok || G.over || G.forfeit >= 0) return; if (introBusy()) { after(.12, go); return; } prePitch(true); };
  after(.2, go);
}
/* 防止「撿界外球／回防還沒完成就偷跑下一球」：下一球開始前，所有守備球員必須回到站位；太久沒回來就快速轉場（衝刺回位，逾時直接就位） */
function snapToReady() {      // 轉場瞬間：所有守備員回到站位、球消失、鏡頭回到打擊視角
  for (const pos of POS_LIST) { const f = E.F[pos], q = formationPos(pos); if (!f) continue; f.x = q.x; f.z = q.z; f.tx = q.x; f.tz = q.z; f.v = 0; f.sp = 6.5; f.cover = null; f.hasBall = false; f.dive = false; f.wait = 0; f.hold = 0; f.chaser = false; f.selfTag = null; if (f.rig) { f.rig.run = 0; f.rig.root.position.set(q.x, 0, q.z); if (f.rig.anim && f.rig.anim.name !== 'crouch' && f.rig.anim.name !== 'stance') f.rig.anim = null; } }
  try { setBall({ x: 0, y: 0, z: 0 }, false); } catch (e) { }
  try { setCamBat(true); } catch (e) { }
}
function foulCurtain(msg, done) {      // 黑幕轉場（全螢幕上下百葉窗，樣式見 css/06-transition.css）：閉幕 → 全員就定位 → 開幕 → 準備下一球
  const c = $('curtain'), tok = G.crTok = (G.crTok || 0) + 1, lb = c && c.querySelector('span'); if (!c) { snapToReady(); done(); return; }
  if (lb) lb.textContent = msg || '';
  c.classList.add('on');
  const ok = () => tok === G.crTok && !G.over && G.mode === 'play';
  const off = () => { if (tok === G.crTok) c.classList.remove('on'); };
  after(.6, () => { if (!ok()) { off(); return; } snapToReady(); after(.45, () => { off(); after(.5, () => { if (ok()) done(); }); }); });
}
function fmReady() { for (const pos of POS_LIST) { const f = E.F[pos]; if (!f) continue; const q = formationPos(pos); if (dist2(f.x, f.z, q.x, q.z) > (pos === 'P' || pos === 'C' ? 1.8 : 1.0) || f.hasBall) return false; } return true; }
function prePitch(first) {
  if (G.over) return;
  if (G.mode !== 'play' || G.fmGo || fmReady()) { G.fmGo = false; prePitchCore(first); return; }
  G.phase = 'change'; const tok = G.fmTok = (G.fmTok || 0) + 1; let t = 0; PT = null;      // 轉場期間不能投球／揮棒
  say('<em>守備球員快速回到各自的守備位置…</em>', 1800);
  for (const pos of POS_LIST) { const f = E.F[pos], q = formationPos(pos); if (!f) continue; f.tx = q.x; f.tz = q.z; f.sp = 9.5; f.cover = null; f.hasBall = false; f.dive = false; f.wait = 0; f.hold = 0; f.chaser = false; f.selfTag = null; if (f.rig && f.rig.anim && f.rig.anim.name !== 'crouch' && f.rig.anim.name !== 'stance') f.rig.anim = null; }
  const tick = () => {
    if (tok !== G.fmTok || G.over || G.mode !== 'play') return; t += .1;
    if (!fmReady() && t >= 5.0) { G.fmTok++; foulCurtain('各就各位', () => { G.fmGo = true; prePitch(first); }); return; }      // 回位太慢：黑幕轉場直接就位
    if (fmReady() || t >= 5.6) {
      if (!fmReady()) for (const pos of POS_LIST) { const f = E.F[pos], q = formationPos(pos); if (!f) continue; f.x = q.x; f.z = q.z; f.tx = q.x; f.tz = q.z; f.v = 0; if (f.rig) f.rig.run = 0; }      // 逾時：直接就位
      G.fmGo = true; prePitch(first); return;
    }
    after(.1, tick);
  };
  after(.1, tick);
}
function prePitchCore(first) {
  if (G.over) return; if (G.mode === 'play' && G.balls === 0 && G.strikes === 0 && rainDelayNeeded()) { startRainDelay(first); return; } try { syncPowUI(); } catch (e) { } if (E.bat && E.bat.rig && !E.bat.rig.anim) batterStance(); if (CAMC.mode !== 'bat' && CAMC.mode !== 'title') setCamBat(); resetFormation(false); if (E.F.P) E.F.P.sp = 6.5; G.phase = 'pre'; try { if (E.bat && E.bat.rig && E.bat.rig.batBroken) startBatBoy({ deliver: E.bat.rig }); } catch (e) { } try { updateActs(); } catch (e) { } G.preT = 0; G.prepT = .12 + Math.random() * .25; { const P0 = curPitcher(); if (P0._tp == null) P0._tp = .85 + Math.random() * .3;           // 每位投手有自己的節奏（快手／慢工），每球再隨機浮動
    const rr = Math.random(); let d = rr < .3 ? .6 + Math.random() * .5 : rr < .8 ? 1.0 + Math.random() * .7 : 1.6 + Math.random() * .8;
    d *= P0._tp * (.88 + Math.random() * .24) * (1 + (P0.fatigue || 0) * .003 + (G.strikes === 2 ? Math.random() * .12 : 0)); if (first) d += .2 + Math.random() * .3; if (G.on.some(x => x)) d *= .75 + Math.random() * .35;
    G.pitchDelay = clamp(d, .6, 2.6); G.preSwAt = (!(engBats() && G.human >= 0) && Math.random() < .5 && G.pitchDelay > 1.4) ? .5 + Math.random() * (G.pitchDelay - 1.3) : -1; G.fidgetAt = (!(engBats() && G.human >= 0) && Math.random() < .35 && G.pitchDelay > 1.8) ? .3 + Math.random() * (G.pitchDelay - 1.6) : -1; G.signAt = Math.random() < .7 ? .2 + Math.random() * .4 : -1; } PT = null; G.runnerGo = []; G.squeeze = null; G.hitAndRun = false;
  setBall({ x: 0, y: 1.5, z: MOUND.z + .6 }, true); E.F.P.rig.anim = null;
  if (!engBats()) { G.callBunt = false; G.sneak = false; aiOffenseCall(); if (G.callBunt && !G.sneak && E.bat) E.bat.rig.anim = { name: 'bunt', t: 0, dur: 1e9, opt: { hold: true } }; if (G.squeeze === 'safety') say(castA('<em>安全式擠壓短打</em>！打者擺出短打姿勢，三壘跑者看球再決定。')); }     // 一般犧牲短打：提早擺出短打姿勢（防守看得出來）；奇襲短打則到投手出手才轉身
  else if (G.sneak && G.callBunt) { G.sneak = false; }
  else if (G.human < 0) { }
  for (const r of E.runners) if (r.state === 'run' && r.waiting) { r.waiting = false; r.earlyGo = false; r.dir = -1; r.goal = r.from; r.ret = true; r.pre = 0; r.accT = stealRamp(r); }      // 這一球結束了、前面的人還是沒動：只好折返回原壘
  for (const r of G.on) if (r) { r.stepGo = false; if (!r.leadMax) r.leadMax = 2.2; r.stealer = false; r.earlyGo = false; r.hnr = false; }
  G.legUp = false; G.earlyAt = -1; G.earlyIdx = [];
  if (!engBats() && G.runnerGo.length && !G.squeeze && !G.hitAndRun) { G.earlyIdx = G.runnerGo.slice(); G.runnerGo = []; G.earlyAt = .3 + Math.random() * Math.max(.2, G.pitchDelay * .55); }      // 電腦盜壘：同樣是當場起跑（不再配合投球動作）
  updateLamps(); updatePlayerBoxes(); buildPitchPanel(); updateActs(); absShowPend();
  if (minePitches() && !G.intWalk) say(`<em>${curPitcher().name}</em>，選擇球種與落點後投球！（按 1～${curPitcher().pitches.length} 鍵 / 點擊）`);
}
let _buntTs = 0;
function cancelBunt(quiet) {              // 取消觸擊：一律把狀態、棒子姿勢、已投出球的處理都收乾淨
  const had = G.callBunt; G.callBunt = false; G.sneak = false; if (G.offCall === 'suicide' || G.offCall === 'safety' || G.offCall === 'sac') { G.offCall = null; G.squeeze = null; }
  if (PT && !PT.sw && !PT.done && G.phase === 'flight') { PT.pulled = true; if (had && !quiet) toast('收棒', '#cfe', '#07a'); }      // 球還沒過本壘前＝收棒（不嘗試觸擊）
  const b = E.bat;
  if (b && b.rig && mineBats() && G.human >= 0 && !(PT && PT.sw) && !(b.rig.anim && b.rig.anim.name === 'swing') && G.phase !== 'inplay' && G.phase !== 'result') batterStance();
}
function toggleBunt(on) {
  const now = performance.now(); if (now - _buntTs < 160) return; _buntTs = now;      // 避免連點／按鍵＋點擊重複觸發而互相抵銷
  const want = on === undefined ? !G.callBunt : !!on;
  if (!want) { cancelBunt(); return; }
  if (PT && PT.sw) return;                                             // 球已經碰到棒子，不能再改
  G.callBunt = true;
  G.sneak = G.phase === 'windup' || G.phase === 'flight';              // 投手開始動作後才轉短打＝奇襲短打
  if (G.sneak) { toast('奇襲短打！', '#9fffd0', '#0a7'); flowSfx('swing', .5); }
}
function practiceSwing() {                  // 打者趁投手準備時偶爾試揮一下
  const b = E.bat; if (!b || !b.rig || G.callBunt || PT || G.phase !== 'pre' || (b.rig.anim && b.rig.anim.name !== 'stance')) return;
  b.rig.anim = { name: 'swing', t: 0, dur: .32, opt: {} }; flowSfx('swing', .35);
  after(.55, () => { if (E.bat === b && G.phase === 'pre' && !PT && !G.callBunt && (!b.rig.anim || b.rig.anim.name !== 'bunt')) batterStance(); });
}
function batterFidget() {      // 打者趁投手準備時晃動身體、調整站姿
  const b = E.bat; if (!b || !b.rig || G.callBunt || PT || G.phase !== 'pre' || (b.rig.anim && b.rig.anim.name !== 'stance')) return;
  b.rig.anim = { name: 'fidget', t: 0, dur: 1.0, opt: {} };
  after(1.05, () => { if (E.bat === b && G.phase === 'pre' && !PT && !G.callBunt && (!b.rig.anim || b.rig.anim.name === 'fidget')) batterStance(); });
}
function catcherSign() {      // 捕手蹲著用手指比暗號
  const C = E.F.C; if (!C || !C.rig || G.phase !== 'pre' || PT || PL || !C.rig.anim || C.rig.anim.name !== 'crouch') return;
  C.rig.anim = { name: 'sign', t: 0, dur: 1.1, opt: {} };
  after(1.15, () => { if (E.F.C === C && !PL && (!C.rig.anim || C.rig.anim.name === 'sign')) C.rig.anim = { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } }; });
}
function fielderFidget() {      // 守備員／壘上跑者在投球間的小動作
  if (G.phase !== 'pre' || PT || PL) return;
  const keys = ['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'], k = keys[Math.floor(Math.random() * keys.length)], f = E.F[k];
  if (f && f.rig && !f.rig.anim && f.rig.run < .05 && !f.chaser && !f.hasBall && Math.hypot((f.tx == null ? f.x : f.tx) - f.x, (f.tz == null ? f.z : f.tz) - f.z) < .4) { const q = Math.random(); f.rig.anim = { name: q < .5 ? 'glovepound' : q < .85 ? 'handsknee' : 'dust', t: 0, dur: 1.1 + Math.random() * .5, opt: { hand: 1 } }; }
  if (Math.random() < .3 && G.preT < G.pitchDelay - 1.4 && !(G.runnerGo && G.runnerGo.length)) { const rs = E.runners.filter(r => r.state === 'on' && r.rig && !r.rig.anim && r.rig.run < .05 && r.rig.root.visible); if (rs.length) { const r = rs[Math.floor(Math.random() * rs.length)]; r.rig.anim = { name: 'dust', t: 0, dur: 1.1, opt: {} }; } }
}
function behaviorTick(dt) {
  if (G.phase !== 'pre' || PT || PL) return;
  if (G.fidgetAt > 0 && G.preT >= G.fidgetAt) { G.fidgetAt = -1; if (!(engBats() && G.human >= 0)) batterFidget(); }
  if (G.signAt > 0 && G.preT >= G.signAt) { G.signAt = -1; catcherSign(); }
  G.fbT = (G.fbT || 0) - dt; if (G.fbT <= 0) { G.fbT = 1.2 + Math.random() * 1.6; fielderFidget(); }
}
function pitchReact(kind, end) {      // 投手／打者對結果的反應
  const P = E.F.P; if (!P || !P.rig || PL) return; const hd = curPitcher().hand === 'R' ? 1 : -1, play = (n, d) => { P.rig.anim = { name: n, t: 0, dur: d, opt: { hand: hd } }; };
  if (end === 'K') { if (Math.random() < .75) play('fistpump', 1.0); const eb = E.bat; after(.5, () => { if (E.bat === eb && eb && eb.rig && !PL && G.phase !== 'pre') eb.rig.anim = { name: 'headdown', t: 0, dur: 1.5, opt: {} }; }); }
  else if (end === 'BB') play('shrug', 1.1);
  else if (kind === 'ball' && G.balls === 3 && Math.random() < .4) play('wipe', 1.0);
}
function offHold() {      // 玩家打擊時：「更多」選單或進攻戰術面板開著，電腦投手就先等待，不會在你選戰術時就投球
  try { if (!(mineBats() && G.human >= 0) || G.mode !== 'play') return false; const sb = $('sub'); return $('acts').classList.contains('open') || (!sb.classList.contains('hide') && sb.dataset.k === 'o'); } catch (e) { return false; }
}
function updatePre(dt) {
  G.preT += dt; if (offHold() && G.preT > G.pitchDelay - .4) G.preT = Math.max(0, G.pitchDelay - .4); behaviorTick(dt); if (G.preSwAt > 0 && G.preT >= G.preSwAt) { G.preSwAt = -1; if (!(engBats() && G.human >= 0)) practiceSwing(); }      // 玩家打擊時不自動試揮，只有玩家自己按鍵才會揮棒
  if ((!engPitches() || G.intWalk) && !G.cpuBusy) { G.prepT -= dt; if (G.prepT <= 0) { const d = prepAction(); G.prepT = d + .08 + Math.random() * .2; } }      // 等待期間（含玩家考慮 ABS 時），投手持續做準備動作
  if (G.preT > G.pitchDelay + (G.absPend ? 3.6 : 0) && (!engPitches() || G.intWalk) && !G.cpuBusy && (Math.hypot(E.F.P.x - DEFAULT_POS.P.x, E.F.P.z - DEFAULT_POS.P.z) < .4 || G.preT > G.pitchDelay + 1.2) && (G.preT > G.pitchDelay + .5 || !(E.F.P.rig.anim && E.F.P.rig.anim.name !== 'stretch' && E.F.P.rig.anim.t < E.F.P.rig.anim.dur * .9))) cpuDeliver();     // 投手回到投手丘才開始投
}
function cpuDeliver() {
  if (G.rosinBusy || G.batFetch) return;
  if (aiMoundThink()) return;
  const p = curPitcher();
  if (G.on.some(x => x)) readRunners(); else G.stealAlert = false;
  if (E.runners.some(q => q.earlyGo && q.state === 'run')) G.stealAlert = true;
  const pk = aiPickoffThink();
  if (pk >= 0 && !G.intWalk && !E.runners.some(q => q.earlyGo && (q.state === 'run' || q.stepGo))) { doPickoff(pk); return; }
  const sel = aiPickPitch(p, curBatter());
  { const er = E.runners.find(q => q.earlyGo && q.state === 'run' && q.dir > 0 && !q.waiting); if (er && !G.intWalk && G.balls < 3 && sel.id && !G.lastPitchout && er.s < .6 && Math.random() < [.1, .22, .34, .46][G.lv || 0]) { sel.pitchout = true; sel.x = E.bat.side * 2.15; sel.y = ZC + .2; sel.id = 'ST'; say('捕手看到跑者起跑，<em>要求投出外角球！</em>'); } }      // 捕手預判盜壘：投出壞球讓自己站起來直接傳
  const sqRead = !!(G.runnerGo && G.runnerGo.includes(2) && G.squeeze === 'suicide') && Math.random() < ([0, .07, .16, .28][G.lv] || 0);      // 電腦捕手／教練偶爾識破自殺式擠壓，投出外角球讓跑者出局
  const th = defenseThreat();                                          // 捕手預判：跑速快／有企圖盜壘的跑者 → 偶爾投出外角壞球(pitchout)讓捕手站起來直接傳
  if (!G.intWalk && G.balls < 3 && sel.id && !G.lastPitchout && (th.t > .9 || (th.r && th.r.tellRead) || sqRead)) { let pp = th.t > .9 ? (G.runnerGo.length ? .22 : .035) * th.t * (G.strikes >= 2 ? .6 : 1) : 0; if (th.r && th.r.tellRead) pp = Math.max(pp, (.12 + G.lv * .04) * (G.strikes >= 2 ? .5 : 1)); if (sqRead) pp = 1; if (Math.random() < pp) { sel.pitchout = true; sel.x = E.bat.side * 2.15; sel.y = ZC + .2; sel.id = 'ST'; say('捕手看穿跑者企圖，<em>要求投出外角球牽制！</em>'); } }
  if (!G.intWalk && !sel.pitchout && !(p.rosin > 0) && Math.random() < .09 + rainK() * .3 && doRosin(() => { if (G.phase === 'pre' && !G.over && G.mode === 'play') doPitch(sel); })) return;      // 電腦投手偶爾（雨天更常）也會先摸止滑粉
  doPitch(sel);
}
function doPickoff(i) {
  const r = G.on[i], P = E.F.P, tgt = i === 0 ? E.F['1B'] : i === 1 ? E.F.SS : E.F['3B'];
  if (!r || r.state !== 'on' || !P || !tgt || G.phase === 'pickoff') return;
  pitcherToMound();
  r.pkIntent = stealIntent(r); r.leadAtPick = r.lead || 0; r.stepGo = false; r.earlyGo = false; G.phase = 'pickoff'; G.pickCount++;
  { const pp0 = curPitcher(); pp0.pkLoad = (pp0.pkLoad || 0) + 2.4 + 1.1 * Math.max(0, G.pickCount - 1); pp0.fatigue = calcFatigue(pp0); }      // 牽制也耗體力：連續牽制消耗愈來愈多
  { const ab0 = pickAbility(i), w0 = r.wary || 0; r.wary = clamp(w0 + (.32 + ab0 * .3 + (r.leadAtPick > 2.6 ? .1 : 0)) * (1 - w0 * .4), 0, 1); }      // 跑者更警戒：離壘縮短、盜壘意願降低
  const out = pickoffSuccess(r), tok = G.pkTok = (G.pkTok || 0) + 1;
  const alive = () => tok === G.pkTok && !G.over && G.mode === 'play' && G.phase === 'pickoff', alive2 = () => tok === G.pkTok && !G.over && G.mode === 'play';
  const b = baseSpot(i + 1), cv = { x: b.x + (b.x > 0 ? -.5 : b.x < 0 ? .5 : 0), z: b.z + (i === 1 ? 1.2 : .6) }, hd = curPitcher().hand === 'L' ? -1 : 1;
  const clr = () => { for (const q of E.runners) { q.pkHold = false; q.pkRate = 0; } };
  const hand = () => { const h = new V3(); try { pitcherHandPos(h); } catch (e) { h.set(P.x, 1.5, P.z); } return h; };
  for (const q of E.runners) if (q.state === 'on') { q.pkHold = true; q.pkRate = 3; }      // 其他壘上跑者在牽制期間也維持原本的離壘
  // 流程：①投手站定盯著跑者、壘包手同時補位到壘包旁 → ②投手完整的傳球動作 → ③球飛到壘包、野手接球並觸殺 → ④判定 → ⑤野手把球傳回投手 → 才繼續比賽
  faceRig(P.rig, cv.x, cv.z); P.rig.anim = { name: 'stretch', t: 0, dur: .7, opt: { hand: hd } };
  tgt.tx = cv.x; tgt.tz = cv.z; tgt.sp = fspeed(tgt) * 1.1; tgt.wait = 0; tgt.hold = 0; if (tgt.rig.anim && (tgt.rig.anim.name === 'stance' || tgt.rig.anim.name === 'crouch')) tgt.rig.anim = null;
  const finish = () => { if (!alive2()) return; clr(); prePitch(); };
  const returnBall = () => {
    if (!alive2()) return; const h2 = hand();
    faceRig(tgt.rig, P.x, P.z); tgt.rig.anim = { name: 'throw', t: 0, dur: .3, opt: { hand: 1 } };
    after(.15, () => { if (!alive2()) return; ballTween({ x: cv.x, y: 1.3, z: cv.z }, { x: h2.x, y: h2.y, z: h2.z }, clamp(throwDur(tgt, P), .3, .7), .35, () => { if (!alive2()) return; flowSfx('mitt', .5); P.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; after(.3, finish); }); });
  };
  const tagIt = () => {
    if (!alive()) return;
    tagAnim(tgt);
    after(.2, () => {
      if (!alive()) return;
      if (out && r.state === 'on' && G.on[i] === r) {
        r.pkHold = false; putOut(r, 'pick'); say(`牽制出局！${r.pl.name}，來不及回壘！`); toast('牽制出局', '#fff', '#f55');
        after(1.1, () => { if (!alive2()) return; clr(); if (G.outs >= 3) { endHalf(); } else { cleanupRunners(); G.phase = 'pickoff'; returnBall(); } });
      } else {
        r.pkHold = false; say(`牽制，安全上壘！${r.wary > .35 ? '跑者變得更謹慎，離壘縮短了；' : ''}投手也消耗了一些體力。`);
        after(.55, () => { if (!alive()) return; if (r.rig.anim && (r.rig.anim.name === 'slide' || r.rig.anim.name === 'hdive')) r.rig.anim = null; try { faceRig(r.rig, P.x, P.z); } catch (e) { } returnBall(); });
      }
    });
  };
  const throwIt = () => {
    if (!alive()) return;
    faceRig(P.rig, cv.x, cv.z); faceRig(tgt.rig, P.x, P.z); P.rig.anim = { name: 'throw', t: 0, dur: .36, opt: { hand: hd } };
    after(.18, () => {
      if (!alive()) return;
      const h = hand(); flowSfx('pick', .4);
      r.pkHold = false; r.pkRate = out ? 1.6 : 7; try { const bs = baseSpot(r.from); faceRig(r.rig, bs.x, bs.z); } catch (e) { } if ((r.lead || 0) > 1.7) r.rig.anim = { name: 'hdive', t: 0, dur: Math.min(.7, .25 + (r.lead || 0) * .16), opt: {} }; else r.rig.anim = null; try { spawnBurst(r.rig.root.position.x, .12, r.rig.root.position.z, .5, '#c9a06a'); } catch (e) { }      // 球一出手跑者才開始撲回壘（被牽制出局者反應慢、回得慢）
      ballTween({ x: h.x, y: h.y, z: h.z }, { x: cv.x, y: 1.15, z: cv.z }, clamp(throwDur(P, cv), .3, .75), .45, () => { if (!alive()) return; flowSfx('mitt'); tgt.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; after(.14, tagIt); });
    });
  };
  let el = 0;
  const ready = () => {
    if (!alive()) return; el += .06; faceRig(P.rig, cv.x, cv.z);
    if ((el >= .5 && dist2(tgt.x, tgt.z, cv.x, cv.z) < .6) || el >= 1.6) { throwIt(); return; }      // 壘包手到位（或最多等 1.6 秒）才傳
    after(.06, ready);
  };
  after(.06, ready);
  after(9, () => { if (tok === G.pkTok && !G.over && G.mode === 'play' && G.phase === 'pickoff') { clr(); if (G.outs >= 3) endHalf(); else { cleanupRunners(); prePitch(); } } });      // 保險：流程被打斷時不會卡住
}
function doPitch(sel) {
  if (G.phase !== 'pre') return; const p = curPitcher(); G.phase = 'windup'; G.legUp = false; pitcherToMound(); if (CAMC.mode !== 'bat' && CAMC.mode !== 'title') setCamBat(); $('pitchPanel').classList.add('hide'); hideHitInfo(0);
  const pt = makePitch(p, sel.id, sel.x, sel.y, sel.acc); PT = pt; if (typeof sel.acc === 'number') { pt.acc = sel.acc; pt.tier = sel.tier; const TT = [['完美出手', '#2a9a3a'], ['正常出手', '#b89a10'], ['稍微失控', '#d9731a'], ['出手失準', '#c33']][sel.tier == null ? 1 : sel.tier]; toast(TT[0], '#fff', TT[1]); } pt.ibb = !!sel.ibb; pt.pitchout = !!sel.pitchout;
  const anyRun = G.on.some(x => x); const rhy = Math.random(), rk = rhy < .2 ? .85 : rhy < .8 ? 1 : 1.18;     // 快速投球／一般／慢節奏，每球不同
  const th0 = defenseThreat(), alertQ = anyRun && !engPitches() && !!G.stealAlert, wind = (anyRun ? .85 - Math.min(.1, th0.t * .05) : 1.2) * (alertQ ? .88 : 1) * (anyRun && (G.runnerGo.length || (G.earlyIdx && G.earlyIdx.length) || G.stealAlert) ? .85 : 1) * rk * (.92 + Math.random() * .16) * ((E.F.P && E.F.P.rig.ps && E.F.P.rig.ps.tempo) || 1);       // 提防盜壘時投手改用快速投球(滑步)       // 出手時間（從開始投球動作算起）；有人在壘＝快速投球
  const set0 = engPitches() && !G.intWalk ? .08 + Math.random() * .2 : (() => { let st = Math.random() < .2 ? .45 + Math.random() * .45 : .15 + Math.random() * .35; st *= .85 + (p._tp || 1) * .2; if (anyRun) st *= alertQ ? .6 : Math.random() < .35 ? 1.4 : .8; return clamp(st, .12, alertQ ? .45 : 1.0); })();   // 站定看捕手暗號（縮短）
  const sg = pitSig(p); let sk = sg.kind; if (anyRun && Math.random() < .45) sk = 'quick';
  const sd = clamp(SIG_DUR[sk] * sg.d * (alertQ ? .55 : anyRun ? .72 : 1), .3, 1.3), set = set0 + sd, hnd = p.hand === 'R' ? 1 : -1;      // 招牌預備動作（抬腳等）做完才開始正式投球
  if (set0 > .12) { const P = E.F.P; faceRig(P.rig, 0, 4); P.rig.anim = { name: 'stretch', t: 0, dur: set0 + .05, opt: { hand: hnd } }; }       // 出手前雙手併胸站定
  after(Math.max(.001, set0), () => { if (PT === pt && E.F.P) { faceRig(E.F.P.rig, 0, 4); E.F.P.rig.anim = { name: 'sig', t: 0, dur: sd, opt: { hand: hnd, kind: sk, amp: sg.amp, n: sg.n, hold: true } }; } });
  after(set, () => { if (PT === pt) { G.legUp = true; E.F.P.rig.anim = { name: 'pitch', t: 0, dur: wind / .62, opt: { hand: p.hand === 'R' ? 1 : -1, hold: false } }; } });
  if (engBats() && G.human >= 0) {      // 玩家進攻戰術：擠壓短打／打帶跑（與電腦使用同一套起跑與守備反應）
    if (G.offCall === 'suicide' || G.offCall === 'safety') { if (G.callBunt && G.on[2] && G.on[2].state === 'on' && G.outs < 2) { G.squeeze = G.offCall; if (G.offCall === 'suicide') { G.runnerGo = [2]; G.stealReq = false; } } else G.squeeze = null; }
    G.hitAndRun = G.offCall === 'hitrun' && !!G.stealReq;
  }
  if (engBats() && G.stealReq && G.offCall === 'hitrun') { const idx = stealIdxs(); if (idx.length) G.runnerGo = idx; }
  G.stealWatch = th0.t; G.lastPitchout = !!sel.pitchout;
  if (G.hitAndRun && G.runnerGo.length && !engBats()) { say(castA('<em>打帶跑！</em>跑者提前起跑，打者務必揮棒配合！')); toast('打帶跑！', '#ffe9a0', '#c60'); }
  if (G.squeeze === 'suicide') { say(castA('<em>三壘跑者起跑！自殺式擠壓短打！</em>')); toast('擠壓短打！', '#ffe9a0', '#c60'); }
  if (G.runnerGo.length) { const go = G.runnerGo.slice().sort((a, b) => b - a), jtOf = {}; let latest = 0; for (const i of go) { const r = G.on[i]; if (!r) continue; const pre0 = .05, jf = clamp((G.hitAndRun ? .3 : .8) + gauss() * .11 - ((r.pl.agg || 50) - 50) * .0014 - ((r.pl.spd || 50) - 50) * .0012, G.hitAndRun ? .12 : .5, 1.07); let jt = Math.max(0, wind * jf - pre0); if (go.includes(i + 1) && jtOf[i + 1] != null) jt = Math.max(jt, jtOf[i + 1] + .03); jtOf[i] = jt; latest = Math.max(latest, jt); after(set + jt, () => { startSteal([i], pre0); if (G.hitAndRun && r) r.hnr = true; }); }       // 起跑時機因人而異：看準投手動作的好跳／慢跳
    after(set + wind * (G.hitAndRun ? .32 : .55) + .06, () => coverSteal(go)); }
  absClearPend();
  say(SAYX.pitchStart(p, G.seq.length + 1));
  after(set + wind, () => releasePitch(pt));
}
const _hp = new V3();
function pitcherHandPos(out) {              // 投球手（握球的手）目前的世界座標：球在手上，不是飄在空中
  const P = E.F.P; if (!P || !P.rig) return out.set(0, 1.3, MOUND.z + .3); const rig = P.rig, arm = (curPitcher().hand === 'R') ? rig.armR : rig.armL;
  rig.root.updateMatrixWorld(true); return arm.localToWorld(out.set(0, -.58, .1));
}
function releasePitch(pt) {
  if (PT !== pt) return; G.phase = 'flight'; if (G.absPend) absClearPend(); pt.t = 0; const p = pt.p;
  if (HINT.on && mineBats() && !G.easy && isFinite(pt.fx + pt.fy)) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * .07; HINT.x = pt.fx + Math.cos(a) * r; HINT.y = pt.fy + Math.sin(a) * r; HINT.t = performance.now(); HINT.pt = pt; } else HINT.pt = null;
  { pitcherHandPos(_hp); if (isFinite(_hp.x + _hp.y + _hp.z)) pt.start.set(clamp(_hp.x, -1.6, 1.6), clamp(_hp.y, 1.1, 2.7), clamp(_hp.z, MOUND.z - .3, MOUND.z + 2.4)); }      // 球從實際出手點飛出
  if (p.rosin > 0) { const sd = p.hand === 'R' ? 1 : -1;      // 出手瞬間：指尖震落細白粉，順著手臂揮出方向拖出一道淡淡的粉霧，隨後在空中慢慢散開（不是一團大煙霧）
      powderPuff(_hp.x, _hp.y, _hp.z, 34, .34, sd * .5, .35, 3.4, .13, { op: .8, life: 1.3, grow: 3.4, sw: .6 });         // 指尖噴出的主粉霧（量更多、更白）
      powderPuff(_hp.x, _hp.y, _hp.z, 22, .18, sd * .2, .15, 1.0, .09, { op: .7, life: 2.0, grow: 4.4, sw: .9 });         // 細粉：停留較久、慢慢飄散
      powderPuff(_hp.x, _hp.y - .05, _hp.z, 14, .42, sd * .55, -.2, 1.8, .19, { op: .45, life: 1.6, grow: 3.8, sw: .7 }); // 外圍較大的淡粉團
      powderPuff(_hp.x, _hp.y, _hp.z, 18, .1, sd * .25, .1, 6.5, .075, { op: .75, life: .8, grow: 2.2, sw: .2, lv: .6 }); // 順球飛行方向射出的快速粉線
      const bp = ballMesh.position;
      for (let k = 1; k <= 9; k++) after(.035 * k, () => { if (PT !== pt) return;            // 球出手後沿途拖出的粉塵尾跡
        powderPuff(bp.x, bp.y, bp.z, 4, .08, sd * .08, .06, .5, .085 + (k < 4 ? .02 : 0), { op: .62 - k * .035, life: .8 + k * .05, grow: 3.4, sw: .5 }); });
      after(.06, () => { pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 18, .22, sd * .35, .25, 2.0, .11, { op: .6, life: 1.5, grow: 3.8, sw: .7 }); });
      after(.16, () => { pitcherHandPos(_hp); powderPuff(_hp.x, _hp.y, _hp.z, 10, .2, sd * .25, .2, 1.2, .1, { op: .45, life: 1.6, grow: 4.0, sw: .8 }); });
      rosinBurstFx(_hp, sd, pt);
      p.rosin--; }      // 出手瞬間：手上飛出白粉
  p.pc++; p.fl = (p.fl || 0) + pitchCost(p); for (const r of G.on) if (r && r.wary) r.wary *= .96; p.fatigue = calcFatigue(p);      // 牽制累積的體力負擔也算進疲勞；跑者的警戒心隨投球逐漸消退
    moodTick(p); moodTick(curBatter()); slumpTickAll(); weatherPitch(); if (pt.wildPitch && rainK() > .15) say('雨天球濕，投手手滑了！'); maybeInjurePitcher(p);
  if (G.callBunt && !G.sneak) buntCharge();
  updateModelAfterRelease(pt);
  if (!engBats()) { pt.plan = aiBatPlan(pt, curBatter()); if (G.callBunt && E.bat) { } }
  if (G.callBunt && E.bat) { E.bat.rig.anim = { name: 'bunt', t: 0, dur: 1e9, opt: { hold: true } }; }
  updatePlayerBoxes();
  if (vsOn()) VS.onRelease(pt);
}
function updateModelAfterRelease(pt) { updatePitcherModel(pt, curBatter()); }
function startSwing(pt, sw) {
  pt.sw = Object.assign({ tc: pt.t + SWING_DELAY }, sw); if (sw.tc !== undefined) pt.sw.tc = sw.tc;
  const rig = E.bat.rig; if (sw.bunt) { rig.anim = { name: 'bunt', t: 0, dur: 1e9, opt: { hold: true } }; }
  else { { const wp = clamp(pt.sw.tc - pt.t, .006, .1); rig.anim = { name: 'swing', t: 0, dur: .42, warp: wp, u0: wp >= .05 ? .22 : .5 - .28 * (wp / .05), opt: {} }; } /* 球棒動畫的「擊球瞬間」與判定時刻同步（原本最短 0.03 秒，會比判定晚） */ rig.loadK = rig.loadT = 0; SWLOCK = performance.now() + 1000; flowSfx('swing', .9); }
}
const _pp = new V3();
// 各球種視覺：軌跡長度/亮度(n,op)、旋轉轉速(rps：x=前後旋 y=側旋 z=子彈旋)、變化點閃光位置(flash：飛行進度)
const TFX = { ST: { n: 18, op: .62 }, SL: { n: 16, op: .5 }, CU: { n: 15, op: .5 }, FK: { n: 9, op: .45 }, SH: { n: 14, op: .45 }, CH: { n: 10, op: .38 }, CT: { n: 15, op: .5 }, SK: { n: 12, op: .45 }, TS: { n: 16, op: .55 }, SV: { n: 13, op: .5 }, KN: { n: 8, op: .35, flicker: true } };
const PSPIN = { ST: [-9, 0, 0], SL: [-1, 4, 7], CU: [10, 1, 0], FK: [1.2, 0, .5], SH: [-4, -3.5, 0], CH: [-3, -1.5, 0], CT: [-1, 1.5, 8], SK: [-3, -4, 0], TS: [-6, -2, 0], SV: [3, 4, 0], KN: [.35, .2, 0] };
const PFLASH = { SL: .56, CU: .42, FK: .7, CT: .74, SV: .55, CH: .66, SH: .6, SK: .55, TS: .62 };
function pitchFx(pt) {
  if (!pt.tfx) { const b = TFX[pt.id], k = clamp(Math.pow(pt.kmh / 145, 2.2), .45, 1.8); pt.tfx = { n: Math.round(b.n * k * (pt.perfect ? 1.3 : 1)), op: b.op * clamp(k, .6, 1.4) * (pt.perfect ? 1.25 : 1), flicker: b.flicker }; }      // 球速越快，拖尾越長越亮
  const sp = PSPIN[pt.id]; if (sp) { const t = Math.min(pt.t, pt.T); const sk = clamp(pt.kmh / 145, .6, 1.2) * (pt.perfect ? 1.15 : 1); ballMesh.rotation.set(sp[0] * TAU * t * sk, sp[1] * TAU * t * pt.hs * sk, sp[2] * TAU * t * pt.hs * sk); if (pt.id === 'KN') { ballMesh.rotation.x += Math.sin(t * 17 + pt.ph) * .5; ballMesh.rotation.y += Math.cos(t * 13 + pt.ph2) * .5; } }
  const f = PFLASH[pt.id]; if (f && !pt.flashed && pt.t / pt.T >= f) { pt.flashed = true; const mag = Math.hypot(pt.bx, pt.by); if (mag > .3) spawnBurst(_pp.x, _pp.y, _pp.z, clamp(.25 + mag * .3, .3, .75) * (pt.perfect ? 1.35 : 1), pt.spec.col); }      // 球開始急劇變化時，小閃光標示
}
function sqStep(dt) {
  if (!SQ) { if (ballMesh.scale.x !== 1) ballMesh.scale.set(1, 1, 1); return; }
  SQ.t += dt; const u = SQ.t / SQ.dur;
  if (u >= 1) { ballMesh.scale.set(1, 1, 1); SQ = null; return; }
  const k = u < .35 ? u / .35 : 1 - (u - .35) / .65, e = SQ.k * k * (1 + .18 * Math.sin(u * 18) * (1 - u));      // 先壓扁、再帶點彈性回彈
  ballMesh.scale.set(1 - e * .45, 1 + e * .18, 1 - e * .45);
}
function updateFlight(dt) {
  const pt = PT; if (!pt || pt.done) return;
  if (vsOn() && VS.stall(pt)) return;
  pt.t += dt;
  if (E.bat && E.bat.rig && !pt.sw && !G.callBunt && !pt.hitBatter) E.bat.rig.loadT = clamp((pt.t / pt.T - .4) / .45, 0, 1) * .9;      // 球越接近越蓄力
  const tEnd = pt.hitBatter ? pt.T : pt.T + pt.tm;
  // 精確對時：這一步若跨過「揮棒接觸」或「球進手套」的那一刻，時間就停在該刻再畫球、再判定。
  // 以前會多飛最多一個子步（≤1/60 秒，約一個球寬）才判定，畫面上的球位與判定／擊球起點會對不上。
  if (pt.sw && !pt.sw.done && pt.t >= pt.sw.tc) pt.t = Math.max(pt.t - dt, pt.sw.tc);
  else if ((!pt.sw || pt.waitCatch) && pt.t > tEnd) pt.t = tEnd;
  if (!pt.cprep && pt.t > pt.T * .5 && E.F.C) { pt.cprep = true; const C = E.F.C; C.tx = catchX(pt); C.tz = C.z; C.sp = 9; C.wait = 0; }
  if (pt.t <= tEnd) { pitchPosEx(pt, pt.t, _pp); if (pt.dirt && !pt.bnc && pt.t >= pt.vb * pt.T) { pt.bnc = true; flowSfx('bounce'); spawnBurst(_pp.x, .06, _pp.z, .35, '#c9a06a'); } setBall(_pp, true, pt.spec.col, pt.tfx || TFX[pt.id]); pt.pos = _pp; pitchFx(pt); }   // 沒揮棒：球停在真正的進壘點，不再外插下滑
  if (pt.plan && pt.plan.swing && !pt.sw && pt.t >= pt.plan.tc - SWING_DELAY) startSwing(pt, { tc: pt.plan.tc, cx: pt.plan.cx, cy: pt.plan.cy, power: pt.plan.power, bunt: pt.plan.bunt });
  if (pt.waitCatch) { if (pt.t >= tEnd) { pt.waitCatch = false; pt.done = true; flowSfx('mitt'); catcherCatch(pt); pitchResult('swing'); } return; }
  if (!pt.sw && G.callBunt && mineBats() && G.human >= 0 && !pt.hitBatter && pt.t >= pt.T * .6 && autoBuntContact(pt)) return;     // 玩家短打：不用再按揮擊鍵，球碰到棒子（圈子）就短打出去
  if (pt.sw && !pt.sw.done && pt.t >= pt.sw.tc) { pt.sw.done = true; handleSwing(pt); return; }
  if (!pt.sw && pt.t >= tEnd) { if (vsOn() && VS.hold(pt)) return; pt.done = true; takePitch(pt); }
}
function autoBuntContact(pt) {              // 球進入球棒可觸及的範圍（本壘前方～壘板上方），且落在棒子圈內 → 立刻短打
  if (pt.pulled || !G.callBunt) return false; const bp = pt.pos || _pp; if (!bp || bp.z < -1.0 || bp.z > .25) return false;                       // 球棒觸及深度：本壘板前方約 1 公尺內
  const R = cursorR(), bk0 = cursorK(), bg = batGeom(R, aim.x, aim.y, E.bat.side, bk0, 'bunt'), bcn = batContact(bg, bp.x, bp.y); if (bcn.d > bcn.rr + .03) return false;
  const bz = bp.z; pt.sw = { tc: pt.t, cx: aim.x, cy: aim.y, power: false, bunt: true, auto: true, bx: bp.x, by: bp.y, bz, R, k: bk0, done: true };
  E.bat.rig.anim = { name: 'bunt', t: 0, dur: 1e9, opt: { hold: true } };
  handleSwing(pt); return true;
}
function handleSwing(pt) {
  const b = curBatter(), sw = pt.sw; const res = vsOn() ? VS.swingRes(pt, sw, () => resolveSwing(pt, sw, b)) : resolveSwing(pt, sw, b);      // 連線對戰：以打者那支手機的判定為準，傳給對手
  if (res.kind === 'hit' && !sw.auto && !res.bunt && pt.pos && isFinite(pt.pos.x + pt.pos.y + pt.pos.z) && Math.hypot(pt.pos.x - res.px, pt.pos.y - res.py, pt.pos.z - res.pz) < 1.6) { res.px = pt.pos.x; res.py = pt.pos.y; res.pz = pt.pos.z; }      // 球從「畫面上看到球所在的位置」飛出去，不會瞬間往回跳
  try { maybeBatSlip(res, sw, pt); } catch (e) { console.error(e); }
  pt.done = true; if (res.kind !== 'whiff') pitchHint(pt); G.lastLoc = { x: pt.fx, y: pt.fy, t: 0, strike: outsideDist(pt.fx, pt.fy) <= 0 };
  const D = G.dbg || (G.dbg = { sw: 0, whiff: 0, hit: 0, take: 0, strikeTake: 0, ballTake: 0 }); D.sw++; if (res.kind === 'whiff') D.whiff++; else D.hit++;
  const bh = bhist(b); bh.sw++;
  const od = outsideDist(pt.fx, pt.fy);
  if (od > 0) { bh.chase++; bh.balls++; if (pt.fy < ZC - ZH) bh.lowChase++; if (pt.fy > ZC + ZH) bh.highChase++; }
  if (res.kind === 'whiff') {
    bh.whiff[pt.id] = (bh.whiff[pt.id] || 0) + 1;
    if (!sw.bunt && mineBats() && G.human >= 0 && res.Wd && res.adt > res.Wd * 1.2 && (res.dtE > 0 ? res.pz > .1 : res.pz < -.9)) {      // 時機偏離才提示；時機正確、只是位置不準就不顯示，讓玩家清楚問題在哪
      const early = res.dtE < 0; timingTip(early ? '揮棒過早' : '揮棒過晚', early ? '#4a8fe8' : '#e8892a', early ? '#2a6fd0' : '#c60');
    }
    if (!sw.bunt) { const a = E.bat.rig.anim; if (a && a.name === 'swing') { if (a.warp) { a.dur *= 1.3; } else { const u0 = clamp(a.t / a.dur, 0, 1); a.dur *= 1.3; a.t = u0 * a.dur; } a.opt = Object.assign(a.opt || {}, { whiff: true }); } flowSfx('swing', .6); }
    pt.done = false; pt.waitCatch = true;          // 揮空：球繼續飛完全程到捕手手套（updateFlight 到達本壘後才接球／判定）
    if (sw.bunt) { E.bat.rig.anim = { name: 'bunt', t: 0, dur: .3, opt: {} }; }
    return;
  }
  // contact
  bh.hard[pt.id] = (bh.hard[pt.id] || 0) + (res.Q > .65 ? 1 : 0);
  if (res.Q > .65) { (bh.hl || (bh.hl = [])).push({ x: pt.fx, y: pt.fy }); if (bh.hl.length > 6) bh.hl.shift(); }      // 記住被打得很扎實的位置，AI 投手之後會避開
  hitSfx(res); hitFeel(res, pt);
  { const q = res.Q, hard = clamp((res.ev - 20) / 32, 0, 1), sweetHit = q > .72 && !res.marginal, F = contactFeel(res);      // F＝打擊感：時機＋位置都對才扎實；擦棒、時機差、握把／球頭 → 無感
    CAMC.shake = clamp(q * .34 + hard * .26 + (res.power ? .09 : 0), .04, .62) * (sweetHit ? 1 : .2 + F * .55) * (.35 + F * .8) * 1.45;      // 越扎實震越大；擦到的球只有輕微震動
    if (!res.bunt) { CAMC.fov -= 8 * (.4 + hard * 1.2) * (.2 + F * 1.0); }      // 瞬間鏡頭微推（衝擊感），之後自然回彈
    G.lastPitch = pt; G.seq.push(pt.id);
    const hx = clamp(res.px, -1.6, 1.6), hy = clamp(res.py, .3, 1.9);
    spawnBurst(hx, hy, .15, ((sweetHit ? 1.0 : .55) + q * 1.5) * (res.tip ? .5 : (.6 + F * .5)), sweetHit ? '#fff6c8' : '#e8d8b0');      // 擦棒只有小小一點火花、紮實擊球才有大爆光
    const nChip = res.bunt ? 0 : res.tip ? 2 : Math.round((7 + hard * 11 + (res.broken ? 6 : 0)) * (.5 + F * .65));      // 木屑／塵粒向外飛散
    for (let i = 0; i < nChip; i++) fwSpawn(hx, hy, .1, (Math.random() - .5) * 4.5, (Math.random() - .2) * 3.6, (Math.random() - .1) * 2.2, res.broken ? '#c89a5a' : '#f4e6c4', .28 + Math.random() * .2, .22 + Math.random() * .16, 7, 2.4);
    if (sweetHit && F > .62 && res.ev > 30) flashScreen(.12 + hard * .1);
    if (sweetHit && F > .7 && hard > .6 && res.ang > 12) { const g0 = G.ts; if (g0 === 1) { G.ts = .45; setTimeout(() => { if (G.ts === .45) G.ts = 1; }, 420); } }      // 強勁長打：球剛離棒時短暫慢動作（約 0.4 秒）      // 打得又扎實又遠：畫面瞬間一閃
    if (!res.bunt && !res.tip) { hitStop(clamp((.07 + q * .14 + hard * .07 + (res.power ? .035 : 0)) * (.3 + F * 1.05), .02, .34)); if (sweetHit) setTimeout(() => { CAMC.shake = Math.max(CAMC.shake, .12 + hard * .1); spawnBurst(hx, hy, .3, .6 + hard * .9, '#ffffff'); }, 120); }      // 時間凍結長度依力道與甜蜜度
  }
  if (res.Q > .7 && !res.bunt) adjustMood(b, .8);
  try { vibHit(res, contactFeel(res)); } catch (e) { }
  launchBall(res, pt); if (res.broken) brokenBatFx(res);
  try { hitFeel2(res); } catch (e) { }
  showHitInfo(res, PL);
}
function hitFeel2(res) {      // v6 打擊感加強：依扎實度分層——甜蜜點＝悶雷低頻＋彗星尾跡＋短暫慢動作；強襲球＝閃光＋觀眾驚呼；擦到／吃棒＝輕、悶
  if (!res || res.bunt || res.tip) return; const F = contactFeel(res), hard = clamp((res.ev - 20) / 32, 0, 1), sweet = res.Q > .72 && !res.marginal && F > .55;
  if (sweet) {
    noiseBurst(.09, 110 + hard * 60, 1.1, .3 + hard * .22, 'lowpass'); noiseBurst(.05, 2600, 2.2, .1 + hard * .1, 'highpass');      // 低頻「碰」＋高頻「啪」
    CAMC.fov -= 3 + hard * 4; hitStop(.025 + hard * .05);
    const n = Math.round(4 + hard * 8), tk = res.thru || res.sty === 'rocket' || res.sty === 'laser' || res.sty === 'line' ? 1.3 : 1;      // 彗星尾跡
    for (let i = 1; i <= n; i++) setTimeout(() => { if (!PL || PL.res !== res) return; const bp = ballMesh.position; spawnBurst(bp.x, bp.y, bp.z, (.22 + hard * .3) * tk * (1 - i / (n + 2)), hard > .6 ? '#fff1b0' : '#ffffff'); }, 45 * i);
  }
  if (res.thru || res.sty === 'rocket' || res.sty === 'laser' || res.sty === 'line') { flashScreen(.1 + hard * .1); crowdCheer(.5 + hard * .4); CAMC.shake = Math.max(CAMC.shake || 0, .2 + hard * .15); if (res.Q > .78 && G.ts === 1) { G.ts = .55; setTimeout(() => { if (G.ts === .55) G.ts = 1; }, 300); } }      // 強襲球：閃光、觀眾驚呼、短暫慢動作
  else if (F < .3) { noiseBurst(.07, 360, 3, .16, 'bandpass'); CAMC.shake = Math.max(CAMC.shake || 0, .05); }      // 吃棒：悶、手麻
}
function contactFeel(res) {      // 打擊感 0～1：0＝擦棒／時機太早太晚／握把或球頭吃到（不扎實）；1＝時機與位置都剛好的甜蜜點
  if (!res || res.bunt) return .5; const q = clamp(res.Q == null ? .5 : res.Q, 0, 1);
  return clamp(q - Math.max(0, Math.abs(res.s || 0) - .3) * .9 - Math.max(0, Math.abs(res.bp || 0) - .55) * .4 - (res.marginal ? .22 : 0) - (res.tip ? .5 : 0) - (res.broken ? .1 : 0), 0, 1);
}
const VIB = { on: false, can: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' };
try { VIB.on = localStorage.getItem('cpbl_vib') === '1'; } catch (e) { }
function vibHit(res, F) {      // 打擊震動：越扎實、球越強勁震越有力；擦棒或時機差只有輕微一下
  if (!VIB.on || !VIB.can || !res) return; const hard = clamp(((res.ev || 20) - 20) / 32, 0, 1); let pat;
  if (res.bunt) pat = [10]; else if (res.tip) pat = [8];
  else if (F > .75) pat = hard > .7 ? [45, 25, 80] : hard > .4 ? [38, 20, 55] : [32];
  else if (F > .45) pat = [22]; else pat = [10];
  try { navigator.vibrate(pat); } catch (e) { }
}
let SQ = null;      // 球壓扁（擊中瞬間球被棒子壓成扁圓、飛出後彈回）
function hitFeel(res, pt) {
  if (res.bunt || res.tip) return;
  const q = res.Q, hard = clamp((res.ev - 20) / 32, 0, 1), sweetHit = q > .72 && !res.marginal;
  SQ = { t: 0, dur: .1 + hard * .06, k: (sweetHit ? .56 : .3) + hard * .2 };
  // 衝擊波：由擊球點向外擴散的火花環（沿球棒方向略扁）
  const hx = clamp(res.px, -1.6, 1.6), hy = clamp(res.py, .3, 1.9), n = Math.round(10 + hard * 14 + (sweetHit ? 8 : 0));
  for (let i = 0; i < n; i++) { const a = i / n * TAU, sp = (2.6 + Math.random() * 2.4) * (.6 + hard * .9) * (sweetHit ? 1.25 : 1); fwSpawn(hx, hy, .12, Math.cos(a) * sp, Math.sin(a) * sp * .8, (Math.random() - .5) * 1.2, sweetHit ? '#fff3b0' : '#e8dcc0', .16 + Math.random() * .1, .2 + Math.random() * .14, 0, 4.5); }
  // 球棒反作用力：打者身體被震一下（甜蜜點只微震、握把端／球頭吃到會明顯震手）
  try { const b = E.bat; if (b && b.rig && b.rig.root) { const sh = (1 - q) * .05 + (res.marginal ? .04 : 0); b.rig.root.position.x += (Math.random() - .5) * sh * 2; b.rig.root.position.y += -.012 - sh * .5; setTimeout(() => { try { b.rig.root.position.y += .012 + sh * .5; } catch (e) { } }, 90); } } catch (e) { }
  // 震手：打在握把／球頭、或擦到的球，棒子「嗡」一聲＋輕微畫面抖動；甜蜜點則是清脆乾淨
  if (!sweetHit && (q < .45 || res.marginal || contactFeel(res) < .35)) { setTimeout(() => { noiseBurst(.16, 480, 2.6, .22, 'bandpass'); CAMC.shake = Math.max(CAMC.shake || 0, .09); }, 40); }
  else if (sweetHit && hard > .4 && contactFeel(res) > .7) { setTimeout(() => { ring(1250, .1, .1); ring(62, .24, .55); noiseBurst(.12, 190, .9, .55, 'lowpass'); }, 8); }      // 甜蜜點：清脆的金屬般高頻餘音
}
const BBP = [];
function brokenBatFx(res) {      // 斷裂的棒頭飛出去：旋轉、彈地，可能砸到投手或內野手
  if (!res.broken || !E.bat) return;
  try { const rg = E.bat.rig; rg.batBroken = true; if (rg.batTilt && rg.batTilt.children[0]) rg.batTilt.children[0].scale.y = .38; } catch (e) { }      // 打者手上只剩半截斷棒
  const toP = Math.random() < .3; let a0 = (res.th || 0) * Math.PI / 180 + gauss() * .35, dx = Math.sin(a0), dz = -Math.cos(a0); if (toP) { dx = gauss() * .08; dz = -1; }
  const sp = 9 + Math.random() * 6, m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .034, .5, 8), new THREE.MeshPhongMaterial({ color: 0xc89a5a })); m.position.set(0, 1.0, -.3); scene.add(m);
  BBP.push({ m, x: 0, y: 1.0, z: -.3, vx: dx * sp, vy: 3 + Math.random() * 3, vz: dz * sp, sx: 6 + Math.random() * 8, sz: 4 + Math.random() * 6, t: 0, hit: false });
  say('<em>斷棒！</em>球棒的前半截飛了出去'); flowSfx('wall', .8);
}
function batPieceHit(f) {
  f.v = 0; f.tx = f.x; f.tz = f.z; f.wait = Math.max(f.wait || 0, .9); f.rig.run = 0; f.rig.anim = { name: 'down', t: 0, dur: 1.0, opt: {} };
  flowSfx('wall'); crowdCheer(.6); CAMC.shake = Math.max(CAMC.shake || 0, .14); spawnBurst(f.x, 1.1, f.z, .9, '#ffd9a0');
  say(`<em>斷棒飛出去砸到${POS_FULL[f.pos]}${f.pl.name}！</em>`);
  if (PL && PL.plan && PL.plan.f === f && !f.hasBall) PL.collide = true;      // 正要處理球的人被砸到：球處理失誤
  if (G.evt && !f.pl.out && Math.random() < .07 * durMul(f.pl) * (G.evt === 2 ? 1.9 : 1)) { f.pl.out = true; G.injQ.push({ type: 'field', side: 1 - G.half, pl: f.pl, pos: f.pos, why: '被斷裂的球棒砸中，疼痛難忍' }); f.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${f.pl.name}被球棒砸得倒地不起…</em>`); crowdCheer(0); flowSfx('whistle'); }
}
/* ---------- 球棒脫手飛出（打得太激烈）：球棒甩出去 → 落地彈滾 → 球員跑去撿回來 → 送回打擊區，主播全程播報 ---------- */
let FLYBAT = null;
function maybeBatSlip(res, sw, pt) {
  if (!G.evt || FLYBAT || sw.bunt || res.bunt || res.broken || G.mode !== 'play') return;
  const b = E.bat; if (!b || !b.rig || !b.rig.bat || !b.rig.bat.visible) return;
  const p = .009 * (sw.power ? 3 : 1) * (res.kind === 'whiff' ? 1.8 : (res.ev > 40 ? 1.4 : 1)) * (1 + rainK() * 2) * stormMul() * (G.evt === 2 ? 1.8 : 1);      // 強打、揮空（用力過猛）、擊出強勁球、雨天都更容易脫手
  if (Math.random() >= Math.min(p, .07)) return;
  after(res.kind === 'whiff' ? .16 : .1, () => { try { slipBat(b); } catch (e) { console.error(e); } });
}
function slipBat(b) {
  if (FLYBAT || G.mode !== 'play' || !b.rig || !b.rig.bat) return;
  const rig = b.rig, w = new V3(); rig.root.updateMatrixWorld(true); rig.bat.getWorldPosition(w);
  if (!isFinite(w.x + w.y + w.z)) w.set(b.x || 0, 1.2, .2);
  rig.bat.visible = false;
  const sgn = Math.random() < .5 ? -1 : 1, r = Math.random(); let a0, back = false;
  if (r < .42) a0 = sgn * (.7 + Math.random() * .6); else if (r < .64) a0 = sgn * (.15 + Math.random() * .4); else if (r < .84) a0 = sgn * (1.3 + Math.random() * .4); else { back = true; a0 = sgn * (.1 + Math.random() * .5); }
  const sp = back ? 4 + Math.random() * 3 : 6 + Math.random() * 6, dx = Math.sin(a0), dz = -Math.cos(a0) * (back ? -1 : 1);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.042, .016, .86, 10), new THREE.MeshPhongMaterial({ color: 0xc89a5a })); m.position.copy(w); scene.add(m);
  FLYBAT = { m, x: w.x, y: w.y, z: w.z, vx: dx * sp, vy: 4 + Math.random() * 3, vz: dz * sp, sx: 9 + Math.random() * 8, sz: 5 + Math.random() * 6, st: 'fly', t: 0, tm: 0, inn: G.inning, half: G.half, rig, f: null };
  const n = (curBatter() && curBatter().name) || '打者', area = back ? '本壘後方' : Math.abs(a0) > 1.25 ? '休息區那邊' : Math.abs(a0) < .5 ? '投手丘方向' : '界外區';
  const L = [`<em>球棒脫手了！</em>${n}這一棒揮得太用力，整支球棒飛向${area}`, `<em>哇，球棒變成迴旋鏢了！</em>${n}的球棒從手上滑掉，在空中轉個不停`, `<em>球棒飛走了！</em>${n}用力過猛，球棒決定自己去旅行`, `<em>這力道太驚人了！</em>${n}連球棒都握不住，場上的人都愣住了`];
  say(L[Math.floor(Math.random() * L.length)]); flowSfx('swing', .6); crowdCheer(.5);
}
function endFlyBat(abort) {
  const B = FLYBAT; if (!B) { G.batFetch = false; return; }
  try { scene.remove(B.m); B.m.geometry.dispose(); B.m.material.dispose(); } catch (e) { }
  if (B.f) { const q = formationPos(B.f.pos); B.f.tx = q.x; B.f.tz = q.z; B.f.sp = 4.2; B.f.hold = 0; if (B.f.pos === 'C' && !PL) B.f.rig.anim = { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } }; }
  FLYBAT = null; G.batFetch = false; if (abort) { try { killBoy(); } catch (e) { } }
}
function updateFlyBat(dt) {
  const B = FLYBAT; if (!B) return;
  if (G.mode !== 'play' || G.over || G.inning !== B.inn || G.half !== B.half || B.t > 40) { endFlyBat(true); return; }
  B.t += dt; const m = B.m;
  if (B.st === 'fly') {
    B.vy -= 9.8 * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
    if (B.y < .05) {
      B.y = .05;
      if (!B.bounced) { B.bounced = true; if (Math.random() < .22) breakFlyBat(B); }
      if (Math.abs(B.vy) > 1.4) { B.vy *= -.38; B.vx *= .62; B.vz *= .62; B.sx *= .6; B.sz *= .6; flowSfx('bounce', clamp(Math.abs(B.vy) / 5, .3, .8)); }
      else { B.vy = 0; const k = Math.max(0, 1 - 4 * dt); B.vx *= k; B.vz *= k; B.sx *= k; B.sz *= k; }
    }
    m.position.set(B.x, B.y, B.z); m.rotation.x += B.sx * dt; m.rotation.z += B.sz * dt;
    if (B.y <= .051 && B.vy === 0 && Math.hypot(B.vx, B.vz) < .3) {      // 停住：平躺在地上
      B.st = 'wait'; B.y = .045; m.rotation.order = 'YXZ'; m.rotation.set(Math.PI / 2, Math.atan2(B.vx || 1, B.vz || 1) + Math.random() * 3, 0); m.position.set(B.x, B.y, B.z);
      for (const pos of ['P', 'C', '1B', '2B', '3B', 'SS']) { const f = E.F[pos]; if (f && !f.pl.out && dist2(f.x, f.z, B.x, B.z) < 2.2) { say(`<em>差點砸到${POS_FULL[pos]}${f.pl.name}！</em>他嚇得趕快閃開`); crowdCheer(.4); break; } }
    }
    return;
  }
  if (B.st === 'wait') {
    const ended = !E.bat || E.bat.rig !== B.rig || G.phase === 'change' || G.phase === 'endhalf';
    if (ended) {      // 這位打者已經出局／打進場內／被換下：球棒不再送回，只由球僮收走，下一位打者直接上場
      if (PL || (G.phase !== 'pre' && G.phase !== 'change')) return;
      startBatBoy({ debris: B }); B.st = 'boy'; return;
    }
    if (PL || G.phase !== 'pre') return;      // 等這一球／這個打席的結果處理完，才輪到撿球棒
    if (B.brk) { startBatBoy({ deliver: B.rig, debris: B }); B.st = 'boy'; return; }      // 球棒摔斷了：球僮拿新球棒上來給打者
    let best = null, bd = 1e9;
    for (const pos of ['C', '1B', '3B', '2B', 'SS']) { const f = E.F[pos]; if (!f || !f.pl || f.pl.out) continue; const d = dist2(f.x, f.z, B.x, B.z); if (d < bd) { bd = d; best = f; } }
    if (!best) { endFlyBat(true); return; }
    G.batFetch = true; B.f = best; B.st = 'go'; B.tm = 0; best.tx = B.x; best.tz = B.z; best.sp = 5.2; best.wait = 0; best.hold = 0; if (best.pos === 'C') best.rig.anim = null;
    const L = [`${POS_FULL[best.pos]}${best.pl.name}小跑步過去撿球棒`, `<em>${POS_FULL[best.pos]}${best.pl.name}</em>主動去幫忙把球棒撿回來`, `比賽先暫停一下，${POS_FULL[best.pos]}${best.pl.name}去撿那支「離家出走」的球棒`];
    say(L[Math.floor(Math.random() * L.length)]); return;
  }
  if (B.st === 'boy') return;
  const f = B.f; if (!f) { endFlyBat(true); return; }
  B.tm += dt;
  if (B.st === 'go') {
    f.tx = B.x; f.tz = B.z; f.sp = 5.2; f.wait = 0;
    if (dist2(f.x, f.z, B.x, B.z) < .7 || B.tm > 8) { B.st = 'pick'; B.tm = 0; f.tx = f.x; f.tz = f.z; f.hold = .4; f.rig.anim = { name: 'pickup', t: 0, dur: .35, opt: {} }; flowSfx('mitt', .5); }
    return;
  }
  if (B.st === 'pick') {
    if (B.tm > .4) { B.st = 'carry'; B.tm = 0; f.hold = 0; B.dest = { x: (E.bat ? E.bat.x : -1.9) * 1.15, z: .9 }; }
    return;
  }
  if (B.st === 'carry') {
    f.tx = B.dest.x; f.tz = B.dest.z; f.sp = 4.6; f.wait = 0;
    B.m.rotation.order = 'XYZ'; B.m.rotation.set(.25, 0, -.7); B.m.position.set(f.x + .22, 1.0, f.z - .1);
    if (dist2(f.x, f.z, B.dest.x, B.dest.z) < .9 || B.tm > 8) {
      scene.remove(B.m); const same = E.bat && E.bat.rig === B.rig; if (same && B.rig.bat) B.rig.bat.visible = true;
      const n = same && curBatter() && curBatter().name ? curBatter().name : '打者';
      const L = [`${f.pl.name}把球棒還給${n}，全場笑成一團`, `<em>球棒平安歸隊！</em>${f.pl.name}遞還給${n}，觀眾報以熱烈掌聲`, `${n}接回球棒，趕快握緊一點，這次可別再飛出去了`];
      say(L[Math.floor(Math.random() * L.length)]); crowdCheer(.7); flowSfx('cheer', .8);
      B.st = 'back'; B.tm = 0; B.m.visible = false;
    }
    return;
  }
  if (B.st === 'back') {
    const q = formationPos(f.pos); f.tx = q.x; f.tz = q.z; f.sp = 4.4; f.wait = 0;
    if (dist2(f.x, f.z, q.x, q.z) < .5 || B.tm > 5) endFlyBat(false);
  }
}
/* ---------- 球棒摔斷／球僮送新棒、收走場上的棒子 ---------- */
function breakFlyBat(B) {      // 飛出去的球棒落地摔成兩截
  B.brk = true;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .034, .45, 8), new THREE.MeshPhongMaterial({ color: 0xc89a5a })); m.position.set(B.x, B.y + .1, B.z); scene.add(m);
  BBP.push({ m, x: B.x, y: B.y + .1, z: B.z, vx: B.vx * .8 + gauss() * 2, vy: 2.5 + Math.random() * 2, vz: B.vz * .8 + gauss() * 2, sx: 6 + Math.random() * 8, sz: 4 + Math.random() * 6, t: 0, hit: false });
  B.m.scale.y = .55; spawnBurst(B.x, .2, B.z, .6, '#e8d0a0');
  try { noiseBurst(.07, 3200, 1.4, .9, 'highpass'); ring(1900, .05, .4); noiseBurst(.12, 700, 1.8, .5, 'bandpass'); } catch (e) { }
  flowSfx('wall', .7); crowdCheer(.5);
  say('<em>球棒落地，斷成兩截了！</em>');
}
let BOY = null;
function startBatBoy(o) {
  if (BOY || G.mode !== 'play') return;
  const st = teamStyle(G.half), side = E.bat ? E.bat.side : 1, rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, helmet: true, scale: .92 });
  const x0 = -side * 5.5, z0 = 3.2; rig.root.position.set(x0, 0, z0); scene.add(rig.root);
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(.042, .016, .86, 10), new THREE.MeshPhongMaterial({ color: 0xe8c080 }));
  if (o.deliver) { scene.add(bm); G.batFetch = true; const n = (curBatter() && curBatter().name) || '打者'; say(`<em>${o.debris || o.deliver.batBroken ? '球棒斷了！' : '換棒！'}</em>球僮拿著新球棒跑上來給${n}`); }
  BOY = { rig, x: x0, z: z0, x0, z0, st: o.deliver ? 'toBat' : (o.debris ? 'toDeb' : 'leave'), o, bm, carry: !!o.deliver, t: 0, hold: 0 };
}
function killBoy() {
  const B = BOY; if (!B) return; BOY = null;
  try { scene.remove(B.rig.root); scene.remove(B.bm); B.bm.geometry.dispose(); B.bm.material.dispose(); } catch (e) { }
  G.batFetch = false;
  if (B.o.debris && FLYBAT && FLYBAT.st === 'boy') endFlyBat(false);
}
function updateBatBoy(dt) {
  const B = BOY; if (!B) return;
  if (G.mode !== 'play' || G.over) { killBoy(); return; }
  B.t += dt; const rig = B.rig, o = B.o, deb = o.debris; let tx = B.x, tz = B.z, moving = true;
  const next = () => { B.st = deb && !B.debDone ? 'toDeb' : 'leave'; };
  if (B.st === 'toBat') {
    if (!E.bat || E.bat.rig !== o.deliver) { B.carry = false; scene.remove(B.bm); G.batFetch = false; o.deliver = null; next(); return; }      // 打者已經換人：不用送了
    tx = E.bat.x * 1.12; tz = .95; if (dist2(B.x, B.z, tx, tz) < .45) { B.st = 'give'; B.hold = .55; }
  } else if (B.st === 'give') {
    moving = false; faceRig(rig, E.bat ? E.bat.x : 0, .35); B.hold -= dt;
    if (B.hold <= 0) {
      const rg = o.deliver; try { if (rg && rg.bat) { rg.bat.visible = true; if (rg.batTilt && rg.batTilt.children[0]) rg.batTilt.children[0].scale.y = 1; } if (rg) rg.batBroken = false; } catch (e) { }
      B.carry = false; scene.remove(B.bm); G.batFetch = false; const n = (curBatter() && curBatter().name) || '打者';
      say(`${n}接過新球棒，握緊了，繼續打擊`); crowdCheer(.6); flowSfx('mitt', .6); o.deliver = null; next();
    }
  } else if (B.st === 'toDeb') {
    tx = deb.x; tz = deb.z; if (dist2(B.x, B.z, tx, tz) < .6) { B.st = 'pick'; B.hold = .4; rig.anim = { name: 'pickup', t: 0, dur: .35, opt: {} }; flowSfx('mitt', .4); }
  } else if (B.st === 'pick') {
    moving = false; B.hold -= dt; if (B.hold <= 0) { try { deb.m.visible = false; } catch (e) { } B.debDone = true; B.st = 'leave'; }
  } else if (B.st === 'leave') {
    tx = B.x0; tz = B.z0; if (dist2(B.x, B.z, tx, tz) < .6 || B.t > 25) { killBoy(); return; }
  }
  if (moving) { if (rig.anim) rig.anim = null; const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, 5.2 * dt); B.x += dx / d * st; B.z += dz / d * st; faceRig(rig, tx, tz); rig.run = 1.3; } else rig.run = 0;
  rig.root.position.set(B.x, 0, B.z); rigStep(rig, dt);
  if (B.carry) { B.bm.rotation.order = 'XYZ'; B.bm.rotation.set(.25, 0, -.7); B.bm.position.set(B.x + .22, 1.0, B.z - .1); }
}
function updateBatPieces(dt) {
  for (let i = BBP.length - 1; i >= 0; i--) {
    const p = BBP[i]; p.t += dt; p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < .05) { p.y = .05; p.vy *= -.35; p.vx *= .6; p.vz *= .6; p.sx *= .6; p.sz *= .6; if (!p.bn) { p.bn = true; flowSfx('bounce'); } }
    p.m.position.set(p.x, p.y, p.z); p.m.rotation.x += p.sx * dt; p.m.rotation.z += p.sz * dt;
    if (!p.hit && p.y < 2.3) for (const pos of ['P', '1B', '2B', '3B', 'SS']) { const f = E.F[pos]; if (!f || f.pl.out) continue; if (dist2(f.x, f.z, p.x, p.z) < .9) { p.hit = true; p.vx *= -.25; p.vz *= -.25; p.vy = 2.5; batPieceHit(f); break; } }
    if (p.t > 2.4) { scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); BBP.splice(i, 1); }
  }
}
function takePitch(pt) {
  if (vsOn()) VS.onTake(pt);
  if (E.bat && E.bat.rig) E.bat.rig.loadT = 0;
  const D = G.dbg || (G.dbg = { sw: 0, whiff: 0, hit: 0, take: 0, strikeTake: 0, ballTake: 0 }); D.take++; if (isStrikeLoc(pt.fx, pt.fy)) D.strikeTake++; else D.ballTake++;
  pitchHint(pt); const b = curBatter(), bh = bhist(b); bh.take++;
  const od = outsideDist(pt.fx, pt.fy); if (od > 0) bh.balls++; else bh.strikes++;
  G.lastLoc = { x: pt.fx, y: pt.fy, t: 0, strike: outsideDist(pt.fx, pt.fy) <= 0 };
  if (pt.hitBatter) { catcherCatch(pt, true); G.lastPitch = pt; G.seq.push(pt.id); pitchResult('hbp'); return; }
  if (engBats() && G.callBunt && !pt.pulled && !pt.ibb && outsideDist(pt.fx, pt.fy) > 0) {      // 壞球但打者沒有及時收棒、仍擺著棒子＝視為觸擊嘗試，判定好球（兩好球時＝三振）
    say('球偏離好球帶，但打者<em>沒有及時收棒</em>，判定為觸擊嘗試＝好球'); toast('未收棒・好球', '#ffe08a', '#c60'); catcherCatch(pt); pitchResult('swing'); return;
  }
  const call = umpireCall(pt); pt.call = call; catcherCatch(pt);
  absFlow(pt, call, k => pitchResult(k));
}
function catchX(pt) {      // 球實際飛進手套的世界座標 x（沿鏡頭視線）：捕手要站在這裡，畫面上才會接得正
  const C = E.F.C, g = rayAtZ(pt.fx, pt.fy, (C ? C.z : 4) - .25, {}); return clamp(g.x, -1.9, 1.9);
}
function catcherCatch(pt, hbp) {
  const C = E.F.C, a0 = ballMesh.visible ? { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z } : { x: pt.fx, y: pt.fy, z: 0 };
  const hasR = G.on.some(x => x), far = Math.abs(pt.fx) > ZW + 1.25 - rainK() * .5 || pt.fy < ZC - ZH - .95 + rainK() * .3;
  const fldK = 1.25 - (C.pl.fld || 60) / 100 * .9;
  // 暴投／擋不住：控球失控的遠離好球帶球、彈地球，捕手接不住（有人在壘上時機率更高）；沒人在壘上也會滾走要去撿球
  const wild = !hbp && !pt.ibb && !pt.pitchout && (pt.dirt || far) && Math.random() < (pt.dirt ? .3 : .26) * fldK * (1 + rainK() * 1.6) * stormMul() * (hasR ? 1 : .55);
  pt.wild = wild; G.lastPitch = pt; if (!hbp) G.seq.push(pt.id);
  if (hbp) { ballTween(a0, { x: a0.x, y: .12, z: a0.z + .5 }, .3, .25); return; }       // 觸身球：球打到身體後掉在打者腳邊
  if (wild) {
    pt.wildLand = { x: clamp(pt.fx * 2.2 + gauss() * 2, -14, 14), z: 7 + Math.random() * 8 };
    C.rig.anim = { name: 'down', t: 0, dur: .6, opt: {} }; flowSfx('bounce');
    ballTween(a0, { x: pt.wildLand.x, y: .2, z: pt.wildLand.z }, .55 + pt.wildLand.z * .025, 1.2);
  } else {
    C.x = catchX(pt); C.tx = C.x; C.tz = C.z; C.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; flowSfx('mitt', .8);
    const gl = rayAtZ(pt.fx, pt.fy, C.z - .25, {});                                            // 手套位置＝視線上與落點同一個畫面位置
    ballTween(a0, gl, E.runners.some(r => r.state === 'run') ? .09 : .06, 0);                  // 球停在手套裡，之後由捕手回傳投手
    spawnBurst(gl.x, gl.y, gl.z + .1, clamp((pt.kmh - 118) * .022, .22, .9), '#ffe9a0'); if (pt.kmh >= 148) CAMC.shake = Math.max(CAMC.shake || 0, .05 + (pt.kmh - 148) * .008);
  }
}
function catcherReturn(cb) {                  // 捕手接到球後回傳給投手，投手接到球才進行下一球
  const C = E.F.C, P = E.F.P; if (!C || !P || G.over || G.mode !== 'play') { cb(); return; }
  after(.15, () => {
    if (G.over || G.mode !== 'play') return;
    const hand = { x: C.x, y: 1.05, z: C.z - .3 }, from = ballMesh.visible ? { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z } : hand;
    setBall(from, true);
    ballTween(from, hand, .14, 0, () => {                                                    // 球先落進捕手手中，再傳出
      C.rig.anim = { name: 'throw', t: 0, dur: .3, opt: { hand: 1 } }; flowSfx('throw', .6);
      const d = Math.hypot(P.x - hand.x, P.z - hand.z);
      after(.08, () => ballTween(hand, { x: P.x, y: 1.25, z: P.z + .2 }, clamp(d / 26, .45, .85), .5, () => { P.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; flowSfx('mitt', .5); after(.25, cb); }));
    });
  });
}
function pitchResult(kind) {
  const b = curBatter(); G.phase = 'result'; let end = null; { const pp = curPitcher(); if (kind === 'strikeLook') { adjustMood(pp, .8); adjustMood(b, -.5); } else if (kind === 'swing') { adjustMood(pp, 1); adjustMood(b, -1); } else if (kind === 'ball') { adjustMood(pp, -.5); adjustMood(b, .3); } }
  if (kind === 'strikeLook' || kind === 'swing') {
    G.strikes++; const sw = kind === 'swing';
    if (G.strikes >= 3) { end = 'K'; G.kSwing = sw; flowSfx('strike'); say(SAYX.k(b, sw, PT)); colorSay(COLOR.k(b, PT, sw), 1.9); toast(sw ? '揮空三振！' : '看三振！', '#fff27a', '#ff5a1a'); E.ump.anim = { name: 'ump', t: 0, dur: .4, opt: {} }; b.st.k++; G.outs++; curPitcher().outs++; showOut('三振'); }
    else { flowSfx('strike'); say(sw ? SAYX.strikeSwing(PT) : SAYX.strikeLook(PT)); if (Math.random() < .4) { const cm = COLOR.pitch(PT, sw ? 'strikeSwing' : 'strikeLook'); if (cm) colorSay(cm, 1.8); } toast(sw ? '揮空' : '好球', '#fff27a', '#ff7a1a'); }
  } else if (kind === 'ball') {
    G.balls++; if (G.balls >= 4) { end = G.intWalk ? 'IBB' : 'BB'; say(G.intWalk ? castA('故意四壞保送') : SAYX.bb(b)); if (!G.intWalk) colorSay(COLOR.bb(b), 1.9); toast(G.intWalk ? '故意四壞' : '四壞保送', '#9fff9f', '#2a9a3a'); }
    else { flowSfx('ball'); say(SAYX.ball(PT)); if (Math.random() < .4) { const cm = COLOR.pitch(PT, 'ball'); if (cm) colorSay(cm, 1.8); } toast('壞球', '#aaffaa', '#2a9a3a'); }
  } else if (kind === 'hbp') { end = 'HBP'; say(SAYX.hbp(b)); toast('觸身球', '#ffd0a0', '#ff5a1a'); flowSfx('mitt'); }
  updateLamps(); updateScoreboard(); try { pitchReact(kind, end); } catch (e) { }
  if (G.outs >= 3) { G.pending = null; after(1.0, endHalf); return; }
  const stealing = E.runners.some(r => r.state === 'run');
  const go = () => { if (end) finishAB(end); else { G.phase = 'pre'; prePitch(); } };
  const next = () => { if (!end || end === 'K') catcherReturn(go); else go(); };
  if (stealing || (PT && PT.wild)) { G.pending = end ? { kind: end } : null; after(.01, startBatteryPlay); return; }
  if (end === 'HBP') { const hp = PT; after(.9, () => hbpEvent(hp)); return; }
  if (end === 'BB' || end === 'IBB') { after(.7, () => awardBase(end)); return; }
  after(end ? 1.0 : .5, next);
}
function startBatteryPlay() {
  const C = E.F.C; const wild = PT && PT.wild;
  PL = { id: ++G.playId, kind: wild ? 'wp' : 'steal', state: 'held', holder: C, plan: { kind: wild ? 'wp' : 'steal', air: false }, res: {}, sim: null, t: 0, tAge: 0, foul: false, cover: { 0: C, 1: E.F['1B'], 2: E.bat && E.bat.side > 0 ? E.F.SS : E.F['2B'], 3: E.F['3B'] }, err: false, runsMade: 0, outsMade: 0 };
  G.phase = 'inplay';
  for (const f of Object.values(E.F)) { f.sp = 4.4; }
  PL.cover[2].tx = baseSpot(2).x; PL.cover[2].tz = baseSpot(2).z + .5; PL.cover[2].sp = 6; PL.cover[3].tx = baseSpot(3).x + .5; PL.cover[3].tz = baseSpot(3).z + .5; PL.cover[3].sp = 6;
  if (wild) {
    PL.state = 'loose'; { const wl = PT.wildLand || { x: PT.fx * 2.2, z: 12 }; PL.loose = { x: wl.x, z: wl.z, t: 0 }; } PL.looseF = C; C.tx = PL.loose.x; C.tz = PL.loose.z; C.sp = 6; PL.kind = 'wp'; flowOnError(C, 'wp');
    G.errs[1 - G.half] += 0; say(PT.dirt ? '<em>球打在地上彈開了！</em>捕手轉身去撿球！' : '暴投！球跑掉了！'); toast(PT.dirt ? '彈地球' : '暴投', '#fff', '#f55');
  } else holderThink(C);
}
function awardBase(kind) {
  if (G.over || G.forfeit >= 0) return; if (E.bat) { const eb = E.bat; eb.rig.root.position.set(eb.x, 0, eb.z); eb.rig.root.rotation.y = eb.side > 0 ? Math.PI / 2 : -Math.PI / 2; eb.rig.run = 0; eb.rig.anim = null; }
  const br = makeBatterRunner(); br.goal = 1; br.pre = .1; setupForced(); G.phase = 'inplay'; G.walking = true;
  const wait = () => { if (E.runners.some(r => r.state === 'run')) { after(.2, wait); } else { G.walking = false; after(.4, () => finishAB(kind, true)); } };
  after(.4, wait);
}
function finishAB(kind, already) {
  if (G.over || G.forfeit >= 0) return; const b = curBatter(), st = b.st;
  if (kind === 'K') { st.ab++; }
  else if (kind === 'BB' || kind === 'IBB' || kind === 'HBP') { st.bb++; }
  G.bi[G.half] = (G.bi[G.half] + 1) % 9;
  abMood(kind, b);
  clearPlay(); setBall({ x: 0, y: 0, z: 0 }, false); PT = null;
  updateScoreboard(); updateLamps();
  if (G.walkoff) { endGame(); return; }
  const buf = G.outFlag ? (kind === 'K' ? .9 : 1.5) : .6; G.outFlag = false;      // 打者／跑者出局後，多停 1~2 秒讓 OUT 提示看完再換下一位
  if (G.outs >= 3) { after(.5, endHalf); return; }
  const l = fieldingTeam(); aiManagePitcher(1 - G.half);
  G.phase = 'change'; after(buf, () => processInjuries(nextBatter));
}
function endHalf() {
  if (G.over || G.phase === 'endhalf') return; G.phase = 'endhalf'; G.stormHalves = rainK() >= .8 ? (G.stormHalves || 0) + 1 : 0; G.outFlag = false; clearPlay(); tweens.length = 0; setBall({ x: 0, y: 0, z: 0 }, false);
  toast('三上三下 攻守交換', '#fff', '#39f'); flowSfx('whistle'); say(SAYX.inningEnd());
  for (const r of E.runners) r.rig.root.visible = false;
  const lastIn = G.inning >= G.innings;
  if (G.half === 0) { if (lastIn && G.score[1] > G.score[0]) { after(1.6, endGame); return; } G.half = 1; }
  else { if (lastIn && G.score[0] !== G.score[1]) { after(1.6, endGame); return; } if (G.inning >= 12) { after(1.6, endGame); return; } G.half = 0; G.inning++; }
  updateScoreboard(); after(2.2, startHalf);
}
function changePitcher(side, idx, forced, why) {
  const t = G.teams[side]; const np = t.pitchers[idx]; if (!np || idx === t.cur || np.out) return;
  const old = t.pitchers[t.cur]; old.used = true; t.cur = idx; t.lastChg = G.inning * 2 + G.half; np.pc = 0; np.fl = 0; np.pkLoad = 0; np.fatigue = 0; np.tilt = clamp((60 - moodOf(np)) * .7, 0, 40); try { warmApply(np, side); } catch (e) { console.error(e); }
  if (!t.dh) { const pb = genBatter(1, 'P', np.num, 8); pb.name = np.name; pb.isPitcherBat = true; pb.nat = 'P'; pb.out = false; pb.pos = 'P'; t.lineup[8] = pb; }
  if (side === 1 - G.half && E.F.P) {
    const f = E.F.P, st = teamStyle(side); disposeRig(f.rig);
    const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, glove: true, pl: np, catcher: f.pos === 'C' }); scene.add(rig.root); rig.root.position.set(f.x, 0, f.z); f.rig = rig; f.pl = np; rig.ready = true; faceRig(rig, 0, 0);
  }
  if (!forced) say(`換投。${sideName(side)}由 <em>${np.name}</em>(${np.hand === 'R' ? '右' : '左'})走上投手丘接替 ${old.name}${why ? '（' + why + '）' : ''}${np._wn || ''}`);
  toast('換投', '#fff', '#39f'); updatePlayerBoxes(); introPitcher(side, np, old);
}
/* ---------------- hooks called by the play engine ---------------- */
function flowOnContact(pl) {
  if (CAMC.mode === 'bat') { CAMC.mode = 'batfollow'; after(.5, () => { if (CAMC.mode === 'batfollow') CAMC.mode = 'play'; }); } else CAMC.mode = 'play';
  if (pl.foul) { say(SAYX.foul(pl.plan.kind === 'catch')); if (Math.random() < .4) { const cm = COLOR.pitch(PT, 'foul'); if (cm) colorSay(cm, 1.8); } toast('界外', '#fff', '#f5a'); return; }
  if (pl.plan.grd) { say(SAYX.contact(pl)); return; }
  if (pl.plan.kind === 'hr') {      // 全壘打：擊球當下只報「打出去了」，球快飛出牆時才慶祝（不讓人一擊球就知道結果）
    say(SAYX.contact(pl)); pl.hrN = hrRunCount(); const bat0 = curBatter(), dly = Math.max(.5, ((pl.sim.over && pl.sim.over.t) || 2) - .5);
    after(dly, () => { if (PL !== pl) return; say(SAYX.hr(bat0, pl) + `（飛行 ${Math.round(pl.dist)} m）`); colorSay(COLOR.hr(bat0, pl), 2.6); showHrBanner(pl.hrN || 1, bat0, pl); flowSfx('cheer', 2.6); flowSfx('hrfan', pl.hrN || 1); hrTrotStart(pl); crowdCheer(1.8); flashScreen(.5); crowdCheer(1); fireworkShow(clamp(15 + (pl.dist - 80) * .1, 15, 19), clamp((pl.dist - 70) / 30, .7, 1.6)); setHitResult(Math.round(pl.dist) + 'm 全壘打'); hrExtraFx(pl.hrN || 1); });
    return;
  }
  const last = pl.sim.S[pl.sim.S.length - 1], t = pl.plan;
  say(SAYX.contact(pl));
}
function flowOnCatch(f, pl) { maybeInjureFielder(f); flowSfx('mitt', .8); if (!pl.great) { say(SAYX.catchOut(f, pl)); const cm = COLOR.out('fly', f, pl); if (cm && Math.random() < .6) colorSay(cm, 1.9); } if (pl.foulOut) showOut('界外接殺'); flowSfx('out'); setHitResult(`${POS_FULL[f.pos]}${pl.great ? '精彩' : ''}${pl.foul ? '接殺界外球' : '接殺'}`); }
function flowOnField(f, pl) { flowSfx('mitt', .6); maybeInjureFielder(f); if (pl.kind !== 'steal') say(`${POS_FULL[f.pos]}處理球…`); }
function flowOnThrow(th) { flowSfx('throw'); if (th.b >= 0 && PL && PL.kind !== 'wp') { /* throw */ } }
function flowOnError(f, how) { bumpTilt(1 - G.half, how === 'wp' ? .06 : .16); if (how === 'wp') return; try { errFallout(f, how); } catch (e) { } if (how === 'hop') { say(`<em>不規則彈跳！</em>球彈起來擦過${POS_FULL[f.pos]}的手套！`); toast('怪彈跳', '#fff', '#a5f'); return; }
  if (how === 'deflect') { say(`<em>強襲球！</em>球打到${POS_FULL[f.pos]}的手套彈開，滾向一旁！`); toast('強襲彈開', '#fff', '#a5f'); return; } say(`失誤！${POS_FULL[f.pos]}，${how === 'throw' ? '傳球暴傳' : '漏接・手滑'}！`); toast('失誤', '#fff', '#a5f'); }
function showOut(reason) {   // 出局提示：大字 OUT ＋ 出局數；並標記本打席有人出局（換下一棒前多等一下）
  const e = $('outBanner'), now = performance.now(); G.outFlag = true;
  if (showOut.n === G.outs && now - (showOut.lt || 0) < 400) return; showOut.n = G.outs; showOut.lt = now;
  e.querySelector('.ob-t').textContent = 'OUT'; e.querySelector('.ob-s').textContent = (reason ? reason + '・' : '') + (G.outs >= 3 ? '三出局' : G.outs + ' 出局');
  e.classList.remove('hide', 'show'); void e.offsetWidth; e.classList.add('show'); clearTimeout(showOut.t); showOut.t = setTimeout(() => e.classList.add('hide'), 1800); flowSfx('outcall');
}
function flowOnOut(r, how, wasForce) {
  flowSfx('out'); updateLamps();
  showOut(how === 'fly' ? '接殺' : r.ret ? '回壘不及' : r.stealer ? '盜壘失敗' : (r.bat ? '封殺' : '觸殺'));
  const nm = r.pl.name;
  if (how === 'pick') { }
  else if (r.ret) { say(`${nm}回壘不及，被傳殺出局！`); }
  else if (r.stealer) { say(SAY.steal(r, false)); }
  else if (r.bat && how !== 'fly') { const f = PL && PL.thr && PL.thr.from; say(SAYX.out(nm, how, true)); { const cm = COLOR.out('gb', null, PL); if (cm && Math.random() < .55) colorSay(cm, 1.9); } }
  else if (how !== 'fly') { say(SAYX.out(nm, how, false)); }
  if (G.outs >= 3) {
    G.dead = true;
    for (const rr of E.runners) if (rr.state === 'run') { rr.state = 'on'; rr.rig.run = 0; }
    if ((wasForce || r.bat) && G.runsPlay.length) { const n = G.runsPlay.length; G.score[G.half] -= n; G.line[G.half][G.inning - 1] -= n; G.runsPlay = []; G.walkoff = false; }
  }
  if (PL && PL.kind === 'steal' && !r.stealer) { }
  updateScoreboard();
}
function hrRunCount() { const st = new Set(); G.on.forEach(r => r && st.add(r)); E.runners.forEach(r => { if (!r.bat && (r.state === 'on' || r.state === 'run')) st.add(r); }); return st.size + 1; }
function showHrBanner(n, b, pl) {      // 一次顯示：全壘打／兩分／三分／滿貫（再見時加「再見」）
  const e = $('hrBanner'); if (!e) return;
  const walk = G.half === 1 && G.inning >= G.innings && G.score[1] <= G.score[0] && G.score[1] + n > G.score[0];
  const base = n >= 4 ? '滿貫全壘打' : n === 3 ? '三分全壘打' : n === 2 ? '兩分全壘打' : '全壘打';
  e.querySelector('.hb-t').textContent = (walk ? '再見' : '') + base; e.querySelector('.hb-s').textContent = `${b.name}・飛行 ${Math.round(pl.dist)} m` + (n > 1 ? `・一棒轟回 ${n} 分` : '');
  e.classList.toggle('gs', n >= 4); e.classList.remove('hide', 'show'); void e.offsetWidth; e.classList.add('show'); diaHrFlash(n); clearTimeout(showHrBanner.t); showHrBanner.t = setTimeout(() => e.classList.add('hide'), 5600);
}
function diaHrFlash(n) {      // 全壘打：壘包面板的每個壘包依序閃爍、跑一圈，最後四壘同時閃
  const ids = ['b1', 'b2', 'b3', 'bh'], rounds = n >= 4 ? 7 : 6, stepMs = n >= 4 ? 200 : 240, hot = { offset: .5, background: '#fff7a0', boxShadow: '0 0 14px 4px #ffd21a,0 0 30px 9px #ff7a1a', transform: 'rotate(45deg) scale(1.4)' };
  try {
    ids.forEach((id, i) => { const el = $(id); if (!el || !el.animate) return; for (let k = 0; k < rounds; k++) el.animate([hot], { duration: 420, delay: (k * ids.length + i) * stepMs }); });
    const endAt = rounds * ids.length * stepMs + 120;
    ids.forEach(id => { const el = $(id); if (el && el.animate) el.animate([hot], { duration: 400, delay: endAt, iterations: 5 }); });
    const bso = $('bso'); if (bso) { bso.classList.remove('hrGlow'); void bso.offsetWidth; bso.classList.add('hrGlow'); setTimeout(() => bso.classList.remove('hrGlow'), 8200); }
  } catch (e) { }
}
const _hrF = new V3();
function hrFocus() { const r = E.runners.find(x => x.bat && x.state === 'run') || E.runners.find(x => x.trot && x.state === 'run'); const p = r ? r.rig.root.position : baseSpot(4); _hrF.set(p.x, 0, p.z); return _hrF; }
function hrTrotStart(pl) {      // 全壘打確認：跑者加速跑回本壘（約 6～8 秒），鏡頭跟著打者，回到本壘後慶祝
  pl.hrTrot = true;
  for (const r of E.runners) if (r.state === 'run' || r.state === 'on') { if (!r.trot) { r.trot = true; r.spd = 6.0; } if (r.pre > 0) r.pre = 0; }
  try { const P = E.F.P; if (P && P.rig) P.rig.anim = { name: 'hips', t: 0, dur: 3.0, opt: {} }; for (const k of ['LF', 'CF', 'RF']) { const f = E.F[k]; if (f && f.rig && !f.chaser) f.rig.anim = { name: 'hips', t: 0, dur: 2.6, opt: {} }; } } catch (e) { }
  CAMC.mode = 'hrtrot'; try { hrCrewSpawn(); } catch (e) { console.error(e); }
}
function flowOnRun(r) {
  if (G.outs >= 3 && !G.runsPlay.length) { }
  const hrp = PL && PL.plan && PL.plan.kind === 'hr' && !PL.plan.grd;      // 全壘打：不逐人跳「得分！」，由全壘打大字一次交代
  curPitcher().er++; adjustMood(curPitcher(), -3); adjustMood(r.pl, 4); crowdCheer(.6); if (!hrp) { flowSfx('cheer', .8); if (r.tag) setTimeout(() => toast('高飛犧牲打！', '#fff27a', '#ff7a1a'), 60); }
  if (!hrp) { say(SAYX.score(r)); colorSay(COLOR.score(r), 1.9); toast('得分！', '#fff27a', '#ff7a1a'); } updateScoreboard();
  if (PL && PL.br) { curBatter().st.rbi++; }
  if (G.half === 1 && G.inning >= G.innings && G.score[1] > G.score[0] && !G.walkoff) { G.walkoff = true; say('再見安打！！比賽就此結束！！'); toast('再見！', '#fff27a', '#ff3a1a'); }
}
function flowOnPlayEnd(pl) {
  if (G.tilt) G.tilt = G.tilt.map(x => x * .86);      // 失誤造成的緊張氣氛隨時間慢慢消退
  G.runsPlay = []; const half = G.half; hideHitInfo(3800);
  if (pl.kind === 'steal' || pl.kind === 'wp') {
    clearPlay(); cleanupRunners(); updateLamps(); updateScoreboard();
    if (G.walkoff) { endGame(); return; }
    if (G.outs >= 3) { endHalf(); return; }
    const pd = G.pending; G.pending = null;
    if (pd) { if (pd.kind === 'BB' || pd.kind === 'IBB' || pd.kind === 'HBP') { awardBase(pd.kind); return; } finishAB(pd.kind); return; }
    G.phase = 'change'; after(.4, prePitch); return;
  }
  const b = curBatter(), st = b.st;
  if (pl.foul) {
    setHitResult(pl.foulOut ? '界外高飛球被接殺' : '界外球');
    clearPlay(); setBall({ x: 0, y: 0, z: 0 }, false);
    if (pl.foulOut) { st.ab++; updateLamps(); finishAB('foulout'); return; }
    if (G.strikes < 2) G.strikes++; else if (pl.bunt) { G.strikes = 3; G.outs++; curPitcher().outs++; st.k++; st.ab++; updateLamps(); say('三壘短打失敗！三振！'); showOut('三振'); finishAB('K'); return; }
    updateLamps(); G.phase = 'change';
    if (pl.lostBall || pl.slowFetch) { foulCurtain(pl.lostBall ? '球飛出場外・換新球' : '撿球耗時・各就各位', () => prePitch()); return; }
    after(.5, prePitch); return;
  }
  const br = pl.br; let kind = 'out';
  if (pl.plan.kind === 'hr' && !pl.plan.grd) { kind = 'HR'; }
  else if (br && br.state === 'home') kind = 'H4';
  else if (br && br.state === 'out') kind = 'out';
  else if (br) { if (pl.err) kind = 'E'; else if (pl.outsMade > 0) kind = 'FC'; else kind = 'H' + br.from; }
  if (!pl.foul) { const kn = { HR: '全壘打', H4: '場內全壘打', H1: '一壘安打', H2: pl.plan.grd ? '二壘安打（場地規則）' : '二壘安打', H3: '三壘安打', E: '失誤上壘', FC: '野手選擇', out: '出局' }[kind] || ''; setHitResult(`<b>${areaWord(pl.plan.x, pl.plan.z)}・${kn}</b>${pl.great ? '（' + (pl.greatTag || '精彩守備') + '）' : ''}${pl.badHop ? '（怪彈跳）' : ''}`); }
  const sac = pl.bunt && kind === 'out' && pl.runsMade + (E.runners.filter(r => r.state === 'on' && !r.bat).length) >= 0 && G.on.some(x => x);
  if (kind === 'HR' || kind === 'H4') { st.ab++; st.h++; st.hr++; G.hits[half]++; if (kind === 'HR') { for (const r of G.on) if (r && r.state === 'on') { r.state = 'home'; r.rig.run = 0; scoreRunner(r); } G.on = [null, null, null]; for (const r of E.runners) if (r.state === 'on' || r.state === 'run') { r.state = 'home'; r.rig.root.visible = false; } } }
  else if (kind[0] === 'H') { st.ab++; st.h++; G.hits[half]++; const n = +kind[1]; say(SAYX.hit(curBatter(), n, pl)); colorSay(hitWhy(pl, n) || COLOR.hit(curBatter(), n, pl), 1.9); toast(['', '安打！', '二壘安打！', '三壘安打！'][n], '#fff27a', '#ff7a1a'); flowSfx('cheer', [0, 1.5, 2.1, 2.7][n]); flowSfx('hitfan', n); crowdCheer([0, .9, 1.4, 1.9][n]); }
  else if (kind === 'E') { st.ab++; say('因失誤上壘！'); }
  else if (kind === 'FC') { st.ab++; say('野手選擇，打者跑者安全上壘'); }
  else { if (pl.sacFly && pl.caught && !pl.foul) { say('高飛犧牲打！跑者利用外野長飛球推進／回來得分'); } else if (!(sac && pl.bunt)) st.ab++; }
  clearPlay(); cleanupRunners(); updateLamps(); updateScoreboard();
  finishAB(kind);
}
function backToTitle() {            // 比賽中／結算畫面 → 返回主畫面（一般／生涯／離開）
  $('careerDlg').classList.add('hide'); quitToMenu(); $('menu').classList.add('hide'); $('title').classList.remove('hide'); G.mode = 'title'; CAMC.mode = 'title';
}
function endGame() {
  if (G.over) return; G.over = true; G.phase = 'over'; G.mode = 'over'; setBall({ x: 0, y: 0, z: 0 }, false);
  const s = G.score, ff = G.forfeit >= 0; let w = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1; if (ff) w = 1 - G.forfeit;
  const spec = G.human < 0, tie = w < 0, won = !tie && !spec && w === MYH(), lost = !tie && !spec && w !== MYH();
  flowSfx('jingle'); if (!lost) flowSfx('cheer', 2);
  const rs = $('result'); rs.className = won || (spec && !tie) ? 'win' : lost ? 'lose' : ''; rs.classList.remove('hide');
  const lines = G.teams.map((t, i) => `<div>${t.name}　<b style="font-size:1.3em;color:#ffe14a">${s[i]}</b>　<small>(${G.line[i].map(v => v || 0).join('-')}) 安打${G.hits[i]} 失誤${G.errs[i]}</small></div>`).join('');
  const score = `<div class="sc">${lines}</div>`;
  const score_ = p => (p.st.h * 3 + p.st.hr * 5 + p.st.rbi * 2);
  const best = (t) => t.lineup.filter(p => !p.isPitcherBat).slice().sort((a, b) => score_(b) - score_(a));
  const ab = G.absOn ? `ABS 挑戰：${G.teams[0].short} ${G.absStat[0].ok}/${G.absStat[0].ch} 成功　${G.teams[1].short} ${G.absStat[1].ok}/${G.absStat[1].ch} 成功` : '';
  const ffTxt = ff ? sideName(G.forfeit) + '已無投手可用，依規則判定輸球。<br>' : '';
  const btns = `<div class="rbtns"><button id="homeBtn" class="b-home">🏠 返回主畫面</button><button id="againBtn" class="b-again">再來一場</button></div>`;
  const fx = (kind, n) => { let h = ''; for (let i = 0; i < n; i++) { const l = Math.random() * 100, d = 2.6 + Math.random() * 3, dl = -Math.random() * 5; if (kind === 'cf') { const c = ['#ffd84a', '#ff5a5a', '#5ab0ff', '#7dff9a', '#ff8ae0', '#fff'][i % 6]; h += `<i class="cf" style="left:${l}%;background:${c};animation-duration:${d}s;animation-delay:${dl}s;width:${6 + Math.random() * 8}px"></i>`; } else h += `<i class="rain" style="left:${l}%;animation-duration:${0.8 + Math.random() * .9}s;animation-delay:${dl}s"></i>`; } return h; };

  if (won || (spec && !tie)) {
    const wt = G.teams[w], lt = G.teams[1 - w], ranked = best(wt);
    const mvp = ranked[0], hrK = wt.lineup.slice().sort((a, b) => b.st.hr - a.st.hr)[0], rbiK = wt.lineup.slice().sort((a, b) => b.st.rbi - a.st.rbi)[0], hitK = wt.lineup.slice().sort((a, b) => b.st.h - a.st.h)[0];
    const aw = [], got = new Set();
    const give = (pl, ico, ttl, desc) => { if (!pl || got.has(pl.name)) return; got.add(pl.name); aw.push([ico, ttl, pl.name, desc]); };
    const byK = k => wt.lineup.slice().filter(p => !got.has(p.name)).sort((a, b) => b.st[k] - a.st[k])[0];
    give(mvp, '🏅', '最有價值球員 MVP', mvp ? `${mvp.st.ab}打數 ${mvp.st.h}安打 ${mvp.st.hr}轟 ${mvp.st.rbi}打點` : '');
    let q = byK('hr'); if (q && q.st.hr > 0) give(q, '💣', '全壘打獎', `本場 ${q.st.hr} 支全壘打`);
    q = byK('rbi'); if (q && q.st.rbi > 0) give(q, '🎯', '打點王', `本場 ${q.st.rbi} 分打點`);
    q = byK('h'); if (q && q.st.h > 0 && aw.length < 3) give(q, '⚡', '安打獎', `本場 ${q.st.h} 支安打`);
    const sp = wt.pitchers && (wt.pitchers.find(p => p.used) || wt.pitchers[0]);
    if (aw.length < 3 && sp) give(sp, '🧤', '投手獎', '穩健壓制對手打線');
    const awHtml = aw.slice(0, 4).map((a, i) => `<div class="award" style="animation-delay:${1.0 + i * .55}s"><div class="ai">${a[0]}</div><div class="at">${a[1]}</div><div class="an">${a[2]}</div><div class="ad">${a[3]}</div></div>`).join('');
    const title = spec ? '比賽結束' : (G.walkoff ? '再見勝利！！' : '🎉 你贏了！');
    rs.innerHTML = `${fx('cf', 70)}<i class="fw" style="left:8%;top:14%">🎆</i><i class="fw" style="right:9%;top:20%;animation-delay:.6s">🎇</i><i class="fw" style="left:16%;top:58%;animation-delay:1.1s">✨</i><i class="fw" style="right:14%;top:62%;animation-delay:.3s">🎆</i>
<div class="rbox"><div class="trophy">🏆</div><h2>${title}</h2>
<div class="ribbon" style="background:linear-gradient(90deg,${wt.c1},${wt.c2})">${wt.name}　${spec ? '獲勝' : '奪下勝利'}</div>
${score}<div class="awards">${awHtml}</div>
<div class="rmini">${ffTxt}${spec ? '' : '<small>恭喜！每一球、每一棒都是你親手拿下的勝利。</small><br>'}<small>${ab}</small></div>${btns}</div>`;
  } else if (lost) {
    const mt = G.teams[MYH()], ranked = best(mt), mine = ranked[0];
    const words = ['輸贏乃兵家常事，真正的強者是跌倒後再站起來的人。', '每一次失敗，都是下一次勝利的練習。', '球場上沒有永遠的贏家，別灰心，下一場就是你的主場！', '大聯盟名將也會被三振，重要的是你還想繼續揮棒。'];
    const tips = ['試著選擇「簡易」模式，只要專心抓揮棒時機', '把電腦難度調低一級，先熟悉球路再挑戰', '投球時多變化球種與位置，別一直投同一個地方', '打擊時圈住來球後，等球接近本壘再揮棒'];
    rs.innerHTML = `${fx('rain', 46)}<div class="rbox"><div class="hug">🫂</div><h2>不要氣餒！</h2>
<div class="enc">${words[Math.floor(Math.random() * words.length)]}</div>
${score}
<div class="rmini">${ffTxt}${mine ? `<small>你的最佳球員：</small>${mine.name}<br><small>${mine.st.ab}打數 ${mine.st.h}安打 ${mine.st.hr}轟 ${mine.st.rbi}打點</small><br>` : ''}<small>${ab}</small></div>
<div class="tips">💡 小提醒：${tips[Math.floor(Math.random() * tips.length)]}</div>${btns}</div>`;
  } else {
    const top = best(G.teams[0].lineup.length ? G.teams[0] : G.teams[1])[0];
    rs.innerHTML = `<div class="rbox"><div class="hug">🤝</div><h2>和局</h2>${score}<div class="rmini">${ffTxt}<small>勢均力敵的精采對決！</small><br><small>${ab}</small></div>${btns}</div>`;
  }
  try { if (typeof CAREER !== 'undefined' && CAREER.session) CAREER.attachResult(rs); } catch (e) { console.error(e); }      // 生涯模式：結算畫面貼上自己的球員卡（js/13c-career-create.js）
  $('againBtn').onclick = () => { rs.classList.add('hide'); $('hud').classList.add('hide'); $('menu').classList.remove('hide'); G.mode = 'menu'; CAMC.mode = 'title'; };
  $('homeBtn').onclick = backToTitle;
  try { if (typeof CSEASON !== 'undefined' && G.role) CSEASON.afterEnd(rs); } catch (e) { console.error(e); }      // 生涯模式：記錄本場成績、接下一場／選秀（js/13d-career-season.js）
}

function buntCharge() {                    // 看到打者擺出短打姿勢：一、三壘手與投手在投球出手時就往前衝（守備越好反應越快，奇襲短打則來不及）
  const defs = [['1B', 8.6, -8.4], ['3B', -8.6, -8.4], ['P', 0, -10.2]];
  for (const [pos, x, z] of defs) { const f = E.F[pos]; if (!f) continue; const fl = f.pl.fld || 55; f.tx = x; f.tz = z; f.sp = fspeed(f) * .9; f.wait = clamp(.12 - (fl - 55) * .002 + Math.random() * .1, .02, .3); }
}

function pitcherToMound() {                // 投手每球都從投手丘站好再投（避免前衝、跨步、短打前衝後越站越前面）
  const P = E.F.P; if (!P) return;
  const d0 = DEFAULT_POS.P; P.x = d0.x; P.z = d0.z; P.tx = d0.x; P.tz = d0.z; P.hold = 0; P.rig.stride = 0; P.rig.root.position.x = d0.x; P.rig.root.position.z = d0.z; P.rig.root.position.y = moundY(d0.x, d0.z);
}


/* v54：結算畫面開啟時替 body 加上 resOn，讓 CSS 隱藏比賽 HUD（不依賴 :has） */
(function () { try { const rs = document.getElementById('result'); if (!rs || !window.MutationObserver) return; const sync = () => document.body.classList.toggle('resOn', !rs.classList.contains('hide')); new MutationObserver(sync).observe(rs, { attributes: true, attributeFilter: ['class'] }); sync(); } catch (e) { } })();
