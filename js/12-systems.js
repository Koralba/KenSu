/* ===== 12-systems.js ｜ 系統擴充：天氣風力／暴雨／台灣天氣／心情／教練上場／傷病／擊球資訊面板 =====
   載入順序 12/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
'use strict';
/* =====================================================================
   Part 6d: 系統擴充 — 天氣風力 / 心情值 / 投手教練上場 / 傷病擴充 / CPU 教練決策 / 擊球資訊面板 / 精彩守備
   ===================================================================== */
/* ---------------- 天氣與球場（風、雨、動態變化；可於開賽前關閉） ---------------- */
const rainK = () => (G.wxOn && G.rain) ? G.rain : 0;
const rainBK = () => {                      // 打擊／球飛行用雨勢（分段加重）：毛毛雨、小雨影響很小；大雨明顯；暴雨(>.8)再大幅加重
  const r = rainK(); if (r <= 0) return 0;
  if (r < .3) return r * .25;                                    // 毛毛雨：最多 .075
  if (r < .55) return .075 + (r - .3) * .6;                       // 小雨：.075 ~ .225
  if (r < .8) return .225 + (r - .55) * 2.1;                      // 大雨：.225 ~ .75
  return .75 + (r - .8) * 3.8;                                   // 暴雨：.805 ~ 1.505（明顯大於大雨）
};
const WX_SCEN = [['calm', 16], ['sunny', 20], ['overcast', 14], ['drizzle', 6], ['change', 8], ['heavy', 7], ['storm', 4], ['plum', 5], ['thunder', 6], ['typhoon', 2.5], ['hot', 8], ['haze', 4], ['monsoon', 4]];      // 後六項為台灣特色天氣：梅雨／午後雷陣雨／颱風外圍環流／悶熱高溫／空氣霾害／東北季風
function wxLevel(r) { return r < .06 ? ['晴／多雲', '☀️'] : r < .3 ? ['毛毛雨', '🌦'] : r < .55 ? ['小雨', '🌧'] : r < .8 ? ['大雨', '🌧'] : ['暴雨', '⛈']; }
function initWeather(homeTeam, parkSel, nightSel) {
  const on = G.wxOn !== false; let st = parkSel && PARKS[parkSel] ? parkSel : null;      // 玩家指定球場；未指定則依主場／移師場地／大巨蛋機率決定
  if (!st) {
    if (Math.random() < .3) st = pick(STADIUMS);      // 30% 機率：從所有球場中平均隨機選一座（不一定是主隊主場）
    else { st = (homeTeam && homeTeam.home) || pick(STADIUMS.slice(0, 6)); const sat = homeTeam && SAT_PARKS[homeTeam.id]; if (sat) { let r = Math.random(); for (const [n, p] of sat) { if ((r -= p) < 0) { st = n; break; } } } }      // 70% 機率：主隊主場（偶爾移師外地）
  }
  const PK = PARKS[st] || PARKS['洲際棒球場'], dome = !!PK.dome; applyPark(st);
  G.night = (nightSel === 0 || nightSel === 1) ? !!nightSel : Math.random() < .3;      // 選好球場後，30% 機率改為夜間比賽（燈塔全開）
  G.lt = null; G.rain = 0; G.rainT = 0; G.wxClock = 0; G.wxLv = 0; G.wxScen = 'calm'; G.windBase = 0; G.windBoost = 0;
  if (on && !dome) {
    G.wxScen = weighted(WX_SCEN.map(x => x[0]), twW(WX_SCEN, st));
    if (PK.rain > 1 && ['calm', 'sunny', 'overcast'].includes(G.wxScen) && Math.random() < (PK.rain - 1) * .2) G.wxScen = 'drizzle';          // 多雨球場：晴陰天有機會改成毛毛雨
    else if (PK.rain < 1 && ['drizzle', 'heavy', 'storm'].includes(G.wxScen) && Math.random() < (1 - PK.rain) * .5) G.wxScen = 'overcast';
  }
  const sc = G.wxScen;
  G.windBase = !on || dome ? 0 : (sc === 'calm' || sc === 'sunny') ? Math.random() * .8 + (sc === 'sunny' ? .2 : 0) : sc === 'overcast' ? clamp(Math.abs(gauss()) * 1.4 + .5, 0, 3.5) : clamp(Math.abs(gauss()) * 2.4 + .6, 0, 7);
  G.windBase *= PK.wind * (G.night ? .75 : 1); G.windBoost = scenBoost(sc);
  if (sc === 'drizzle') G.rain = G.rainT = .08 + Math.random() * .07; else if (sc === 'heavy') G.rain = G.rainT = .5 + Math.random() * .15; else if (sc === 'storm') G.rain = G.rainT = .85 + Math.random() * .15;
  if (on && !dome && TW_SC[sc]) { const T = TW_SC[sc]; G.rain = G.rainT = T.rain ? T.rain() : 0; G.windBase = clamp(T.wind() * PK.wind * (G.night ? .8 : 1), T.windRange[0], T.windRange[1]); G.windBoost = T.boost; }
  G.windMean = G.windMeanT = G.windBase; G.windDir = G.windDirT = Math.random() * 360; G.gust = { cd: 3 + Math.random() * 6, t: 0, dur: 0, amp: 0, env: 0 }; G.windClock = 0; G._windCls = ''; G._windNoteT = 0; G._windHudT = 0;
  G.cloudBase = cloudFor(sc); G.cloud = G.cloudBase; G.haze = sc === 'haze' ? .9 : 0; G.heat = sc === 'hot' ? 1 : sc === 'sunny' ? .3 : 0; G.rb = 0; G.rbT = 0; G._rbArm = false; rainbow.visible = false;
  G.wx = { spd: G.windBase + G.rain * G.windBoost, dir: G.windDir, gust: 0, temp: twTemp(on, dome, PK, sc), dome, venue: st, off: !on };
  G.wxLv = wxLevel(G.rain)[0]; G._windCls = windClass(); updateWindHud(); applyLighting();
}
function weatherRetarget() {                // 每隔十餘球決定下一階段的雨勢目標
  if (!G.wxOn || G.wx.dome) return; if (G.scCool > 0) G.scCool--; else if (Math.random() < ({ thunder: .5, typhoon: .25 }[G.wxScen] ?? .3)) shiftScene(); const sc = G.wxScen, r = Math.random();
  if (TW_SC[sc]) G.rainT = TW_SC[sc].retarget(G.rainT);
  else if (sc === 'calm' || sc === 'sunny' || sc === 'overcast') G.rainT = 0;
  else if (sc === 'drizzle') G.rainT = clamp(.08 + Math.random() * .08, 0, 1);
  else if (sc === 'heavy') G.rainT = clamp(.48 + Math.random() * .22, 0, .72);
  else if (sc === 'storm') G.rainT = clamp(.8 + Math.random() * .2, 0, 1);
  else { const cur = G.rainT; G.rainT = r < .45 ? (cur > .05 ? 0 : .08 + Math.random() * .1) : r < .65 ? clamp(cur + .08 + Math.random() * .15, 0, .48) : clamp(cur - .25 - Math.random() * .3, 0, 1); if (G.rainT < .08) G.rainT = Math.random() < .6 ? 0 : G.rainT; }
  G.wx.dir = (G.wx.dir + (Math.random() - .5) * 90 + 360) % 360;
}
function windRetarget(strong) {            // 風：每 5~10 球決定新的平均風速／風向目標（之後漸進轉變，不會瞬間跳變）
  if (!G.wxOn || !G.wx || G.wx.dome) return;
  const calm = (G.wxScen === 'calm' || G.wxScen === 'sunny'), cap = calm ? 1.8 : G.wxScen === 'overcast' ? 4 : G.wxScen === 'storm' ? 9 : 7;
  let m = G.windMeanT + gauss() * (calm ? .5 : 1.7) + (strong ? (Math.random() < .5 ? -1 : 1) * 2 : 0); if (!calm && Math.random() < .12) m = 4.5 + Math.random() * 3;
  G.windMeanT = clamp(m, calm ? .1 : .6, cap); if (TW_SC[G.wxScen]) G.windMeanT = clamp(G.windMeanT, TW_SC[G.wxScen].windRange[0], TW_SC[G.wxScen].windRange[1]); else if (G.wxScen !== 'storm') { const ty = { drizzle: 2.5, heavy: 4.5, change: 3, overcast: 2, calm: .8, sunny: .8 }[G.wxScen] ?? 2; G.windMeanT -= Math.max(0, G.windMeanT - ty) * .35; }      // 風雨天氣好轉後，風也慢慢減弱
  let turn = gauss() * 42; if (Math.random() < .2 || strong) turn = (Math.random() < .5 ? -1 : 1) * (80 + Math.random() * 90);   // 偶爾風向大轉彎（順風⇄逆風）
  if (TW_SC[G.wxScen] && TW_SC[G.wxScen].steady) turn *= .25; G.windDirT = (G.windDirT + turn + 720) % 360;
}
function weatherPitch() {
  if (!G.wxOn) return; G.wxClock++; if (G.wxClock >= 16 + Math.floor(Math.random() * 12)) { G.wxClock = 0; weatherRetarget(); }
  G.windClock = (G.windClock || 0) + 1; if (G.windClock >= 5 + Math.floor(Math.random() * 6)) { G.windClock = 0; windRetarget(); }
}
const windK = () => (G.wxOn && G.wx && !G.wx.dome && !G.wx.off) ? clamp((G.wx.spd || 0) / 8, 0, 1) : 0;     // 風力強度 0~1（影響控球、外野手判斷）
function windDirDiff(a, b) { return ((a - b + 540) % 360) - 180; }
function windClass() {
  const w = G.wx; if (!w || w.dome || w.off) return ''; const c = Math.cos(w.dir * Math.PI / 180), sn = Math.sin(w.dir * Math.PI / 180), lv = w.spd < 1.5 ? 0 : w.spd < 3.5 ? 1 : w.spd < 6 ? 2 : 3;
  return (lv === 0 ? 'calm' : (c > .6 ? 'tail' : c < -.6 ? 'head' : sn > 0 ? 'right' : 'left')) + lv;
}
function windImpactTxt(cls) {
  const k = cls.replace(/\d/g, ''), lv = +cls.slice(-1);
  if (k === 'calm') return '風勢轉弱，球飛行不受影響';
  const s = lv >= 3 ? '強' : lv === 2 ? '中等' : '微';
  return { tail: `${s}順風！高飛球會多飛、更容易出牆，滯空時間縮短`, head: `${s}逆風！飛球被壓回，長打變難、外野手往前站`, right: `${s}風由左往右吹，高飛球會往右外野偏、落點難抓`, left: `${s}風由右往左吹，高飛球會往左外野偏、落點難抓` }[k] || '';
}
function updateRainbow(dt) {
  if (G.rain > .12 && !G.night) G._rbArm = true;                                                    // 下過雨才有機會出彩虹
  if (G._rbArm && G.rain < .04 && cloudK() < .7 && !(G.rbT > 0)) { G._rbArm = false; if (Math.random() < .85) { G.rbT = 90 + Math.random() * 90; if (G.mode === 'play' && !G.over) { say('🌈 雨過天晴，天邊出現了彩虹！'); toast('彩虹出現', '#fff', '#c5a'); } } }
  if (G.rbT > 0) { G.rbT -= dt; if (G.rain > .12 || cloudK() > .85) G.rbT = 0; }
  const tg = G.rbT > 0 ? 1 : 0, cur = G.rb || 0; G.rb = clamp(cur + clamp(tg - cur, -dt * .08, dt * .1), 0, 1);
  rainbow.visible = G.rb > .01;
  if (rainbow.visible) for (const m of rainbow.children) m.material.opacity = m.userData.glow ? G.rb * .12 : G.rb * .5;
}
function updateWeather(dt) {
  try { updateNight(dt); } catch (e) { }
  if (!G.wxOn || !G.wx || G.wx.dome) { if (rainbow.visible) rainbow.visible = false; return; }
  { const rt = G.rainT > G.rain ? Math.min(G.rainT, (G.cloud || 0) * .9 + .08) : G.rainT, rate = (typeof RD !== 'undefined' && RD.on) ? .012 : .004; G.rain = clamp(G.rain + clamp(rt - G.rain, -dt * rate, dt * rate), 0, 1); }      // 雨勢漸變（約每分鐘 ±.24）；要等雲層聚集，雨才跟著變大
  { const tg = Math.max(G.cloudBase || 0, clamp(G.rain * 2.5, 0, 1)); G.cloud = (G.cloud || 0) + clamp(tg - (G.cloud || 0), -dt * .006, dt * .006); }
  if (G.wx.tempT != null && G.wx.tempT !== G.wx.temp) { G._tClk = (G._tClk || 0) + dt; if (G._tClk > 45) { G._tClk = 0; G.wx.temp += Math.sign(G.wx.tempT - G.wx.temp); } }
  { const hzT = G.wxScen === 'haze' ? .9 : 0, htT = G.wxScen === 'hot' ? 1 : G.wxScen === 'sunny' ? .3 : 0; G.haze = (G.haze || 0) + clamp(hzT - (G.haze || 0), -dt * .01, dt * .01); G.heat = (G.heat || 0) + clamp(htT - (G.heat || 0), -dt * .01, dt * .01); }
  windStep(dt); updateRainbow(dt); updateLightning(dt);
  const lv = wxLevel(G.rain)[0];
  if (lv !== G.wxLv) {
    const old = G.wxLv, worse = G.rain > (G._lastRain || 0); G.wxLv = lv; updateWindHud();
    if (G.mode === 'play' && !G.over) { const e = wxLevel(G.rain)[1]; toast(lv === '晴／多雲' ? '雨停了' : '天氣：' + lv, '#cfe', '#38c'); say(`${e} 天氣變化：<em>${old} → ${lv}</em>${worse ? '，場地變濕滑，投球與守備更難掌握！' : '，天氣逐漸好轉。'}`); [curPitcher(), curBatter()].forEach(x => adjustMood(x, worse ? -2 : 2)); updatePlayerBoxes(); }
  }
  G._lastRain = G.rain; G._wxHud = (G._wxHud || 0) + dt; if (G._wxHud > .35) { G._wxHud = 0; updateWindHud(); applyLighting(); }
}
/* ---------------- 暴雨：失誤加成／場地積水／主審暫停比賽（可教練抗議） ---------------- */
const stormK = () => clamp((rainK() - .78) / .2, 0, 1);      // 暴雨強度 0~1（雨勢超過約 .78 才開始計）
const stormMul = () => 1 + stormK() * 1.2 + (wxIn() && G.wxScen === 'typhoon' ? .25 : 0);                   // 暴雨時，失誤與各種突發狀況的機率倍率（最高約 2.2 倍）
const PUD = { list: null, meshes: [], lvl: 0, grp: null, ph: 0 };
function puddleAt(x, z) {
  if (!PUD.list) return false; const k = .55 + .45 * PUD.lvl;
  for (const p of PUD.list) { const dx = (x - p.x) / (p.rx * k), dz = (z - p.z) / (p.rz * k); if (dx * dx + dz * dz <= 1) return true; }
  return false;
}
function resetPuddles() {
  if (PUD.grp) { scene.remove(PUD.grp); PUD.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  PUD.grp = null; PUD.meshes = []; PUD.list = null; PUD.lvl = (G.wxOn && G.wx && !G.wx.dome && G.rain >= .8) ? 1 : 0;
}
function initPuddles() {
  const rn = mkRng((Math.random() * 4294967296) >>> 0), list = [];
  const ok = (x, z, rx, rz) => {
    const R = Math.max(rx, rz);
    for (let b = 0; b < 4; b++) if (Math.hypot(x - BASES[b].x, z - BASES[b].z) < R + 2.4) return false;
    if (Math.hypot(x - MOUND.x, z - MOUND.z) < R + 3.6) return false;
    for (const q of list) if (Math.hypot(x - q.x, z - q.z) < R + Math.max(q.rx, q.rz) + 1.5) return false;
    const rad = Math.hypot(x, z), phi = Math.atan2(x, -z) * 180 / Math.PI;
    return rad < wallRadius(phi) - 5 - R && z < -3 && Math.abs(x) <= -z - 1;
  };
  const add = (n, r0, r1, rx0, rx1) => {
    for (let k = 0; k < n; k++) for (let tries = 0; tries < 80; tries++) {
      const rad = r0 + (r1 - r0) * rn(), ang = (-44 + 88 * rn()) * Math.PI / 180, x = Math.sin(ang) * rad, z = -Math.cos(ang) * rad;
      const rx = rx0 + (rx1 - rx0) * rn(), rz = rx * (.6 + .3 * rn());
      if (ok(x, z, rx, rz)) { list.push({ x, z, rx, rz }); break; }
    }
  };
  add(3, 7, 30, 1.5, 2.4);      // 內野：幾灘小水窪
  add(6, 34, 68, 2.0, 3.4);     // 外野草皮：比較大的積水
  PUD.list = list;
}
function buildPuddleMeshes() {
  PUD.grp = new THREE.Group(); scene.add(PUD.grp); PUD.meshes = [];
  const mk = (geo, color, y) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 2; PUD.grp.add(m); return m; };
  for (const p of PUD.list) {
    const w = mk(new THREE.CircleGeometry(1, 32), 0x56789c, .035), h = mk(new THREE.CircleGeometry(1, 24), 0xdcecff, .04), r = mk(new THREE.RingGeometry(.88, 1, 32), 0xeaf4ff, .045);
    w.position.x = p.x; w.position.z = p.z; h.position.x = p.x - p.rx * .18; h.position.z = p.z - p.rz * .12; r.position.x = p.x; r.position.z = p.z;
    PUD.meshes.push({ w, h, r });
  }
}
function updatePuddles(dt) {
  const on = G.wxOn && G.wx && !G.wx.dome && G.mode === 'play';
  if (!on) PUD.lvl = Math.max(0, PUD.lvl - dt * .1);
  else if (G.rain >= .8) PUD.lvl = Math.min(1, PUD.lvl + dt * .12);      // 暴雨：約 8 秒積滿水
  else if (G.rain >= .45) PUD.lvl = Math.max(0, PUD.lvl - dt * .008);    // 雨小一點：積水慢慢退
  else PUD.lvl = Math.max(0, PUD.lvl - dt * .03);
  if (PUD.lvl <= .001 && !PUD.grp) return;
  if (!PUD.list) initPuddles(); if (!PUD.grp) buildPuddleMeshes();
  PUD.ph += dt; const lv = PUD.lvl, k = .55 + .45 * lv, a = Math.min(1, lv * 1.4); PUD.grp.visible = lv > .01;
  PUD.meshes.forEach((m, i) => {
    const p = PUD.list[i], ph = (PUD.ph * .9 + i * .37) % 1;
    m.w.scale.set(p.rx * k, p.rz * k, 1); m.w.material.opacity = .62 * a;
    m.h.scale.set(p.rx * k * .55, p.rz * k * .4, 1); m.h.material.opacity = .22 * a;
    m.r.scale.set(p.rx * k * (.25 + ph * .75), p.rz * k * (.25 + ph * .75), 1); m.r.material.opacity = (1 - ph) * .35 * (G.rain > .5 ? 1 : 0) * a;
  });
}
const RD = { on: false, t: 0, minT: 10, meter: 0, idle: 0, resume: null, r0: .9, scenWas: null, coach: false };
function rainDelayNeeded() { return !RD.on && G.mode === 'play' && !G.over && G.wxOn && G.wx && !G.wx.dome && rainK() >= .8 && (G.stormHalves || 0) >= 2; }      // 暴雨持續超過兩個半局 → 主審暫停比賽
function resetRainDelay() { RD.on = false; RD.resume = null; RD.meter = 0; RD.coach = false; const el = $('rainDelay'); if (el) el.classList.add('hide'); }
function startRainDelay(first) {
  RD.on = true; RD.t = 0; RD.minT = 10 + Math.random() * 5; RD.meter = 0; RD.idle = 0; RD.coach = false; RD.r0 = Math.max(G.rain, .8); RD.resume = () => prePitch(first);
  G.phase = 'rain'; try { $('pitchPanel').classList.add('hide'); hideHitInfo(0); } catch (e) { }
  RD.scenWas = G.wxScen; G.rainT = .55 + Math.random() * .1; if (G.wxScen === 'storm') { G.wxScen = 'heavy'; G.windBoost = 1.4; }      // 暫停期間雨勢慢慢變小
  const human = G.human >= 0 && !vsOn();      // 區網對戰：雨delay 自動結束（不做連打抗議）
  $('rdTx').innerHTML = human ? '暴雨太大，場地已經不適合比賽！<br>等雨勢變小，或用<b>連點／空白鍵</b>讓教練出面激烈抗議，把<b>抗議值</b>衝滿就能繼續比賽。' : '暴雨太大，場地已經不適合比賽，等雨勢變小再繼續…';
  $('rdProt').classList.toggle('hide', !human); $('rdWait').style.width = '0%'; $('rdMeter').style.width = '0%'; $('rainDelay').classList.remove('hide');
  toast('主審宣布：暫停比賽', '#fff', '#3a6ad8'); flowSfx('whistle'); crowdCheer(.3);
  say(`<em>暴雨太大了！</em>主審宣布暫停比賽，等雨勢變小再繼續。${human ? '教練可以出面抗議（連點把抗議值衝滿）！' : ''}`);
}
function rdPress() {
  if (!RD.on || G.human < 0 || vsOn()) return;
  RD.meter = Math.min(100, RD.meter + 8); RD.idle = 0;
  if (!RD.coach) { RD.coach = true; try { argCoachIn(G.human); } catch (e) { } flowSfx('cheer', .5); }
}
function endRainDelay(protest) {
  const f = RD.resume; RD.on = false; RD.resume = null; $('rainDelay').classList.add('hide'); G.stormHalves = 0;
  try { if (E.argC && E.argC.st !== 'out') argCoachOut(false); } catch (e) { }
  if (protest) {
    G.rainT = Math.max(G.rainT, .86 + Math.random() * .12); if (RD.scenWas === 'storm') { G.wxScen = 'storm'; G.windBoost = 6; }      // 抗議成功：雨勢沒變小，繼續在暴雨中比賽（之後雨勢一直沒變小會再度暫停）
    toast('激烈抗議成功！比賽繼續', '#9fffb0', '#0a8'); say('<em>教練激烈抗議！</em>主審被說服了，雨雖然還很大，比賽照常繼續…'); crowdCheer(1); flowSfx('cheer', 1);
  } else {
    if (RD.scenWas === 'storm' && Math.random() < .35) { G.wxScen = 'storm'; G.windBoost = 6; }      // 偶爾雨勢之後又轉強
    toast('雨勢減弱，比賽恢復', '#cfe', '#38c'); say('🌦 雨勢終於變小了，主審宣布比賽恢復！');
  }
  after(.9, () => { if (!G.over && G.mode === 'play' && G.phase === 'rain') { if (f) f(); } });
}
function updateRainDelay(dt) {
  if (!RD.on) return;
  if (G.mode !== 'play' || G.over) { resetRainDelay(); return; }
  RD.t += dt; RD.idle += dt; if (RD.idle > .45) RD.meter = Math.max(0, RD.meter - 26 * dt);      // 停手抗議值就會掉
  $('rdWait').style.width = clamp((RD.r0 - G.rain) / Math.max(.01, RD.r0 - .74), 0, 1) * 100 + '%'; $('rdMeter').style.width = RD.meter + '%';
  if (RD.meter >= 100) { endRainDelay(true); return; }
  if (RD.t >= RD.minT && G.rain < .74) endRainDelay(false);
}
window.addEventListener('keydown', e => { if (!RD.on) return; if (e.code === 'Space' || e.key === 'r' || e.key === 'R' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) rdPress(); } }, true);
$('rdBtn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); rdPress(); });
function windStep(dt) {                   // 風速／風向連續變化＋陣風
  const g = G.gust, w = G.wx;
  G.windMean += clamp(G.windMeanT - G.windMean, -dt * .1, dt * .1);
  const dd = windDirDiff(G.windDirT, G.windDir); G.windDir = (G.windDir + clamp(dd, -dt * 3, dt * 3) + gauss() * dt * 1.2 + 360) % 360;
  g.cd -= dt;
  if (g.t <= 0 && g.cd <= 0) { g.t = g.dur = 2.4 + Math.random() * 5; g.amp = (.9 + Math.random() * 2.8) * gustMul() * (Math.random() < .5 ? 1 : -.55); }
  if (g.t > 0) { g.t -= dt; const u = 1 - g.t / g.dur; g.env = g.amp * Math.sin(Math.PI * clamp(u, 0, 1)) ** 2; if (g.t <= 0) { g.env = 0; g.cd = (5 + Math.random() * 12) * (G.wxScen === 'typhoon' ? .45 : 1); } }
  const wob = Math.sin((vsOn() ? (VS.wxT || 0) * 1000 : performance.now()) * .0011 + (G.windDir || 0)) * .25;                       // 細微起伏
  w.gust = g.env; w.dir = G.windDir; w.spd = clamp(G.windMean + g.env + wob * ((G.wxScen === 'calm' || G.wxScen === 'sunny') ? .3 : 1) + G.rain * G.windBoost, 0, 11);
  const cls = windClass(); G._windNoteT = Math.max(0, (G._windNoteT || 0) - dt);
  if (cls !== G._windCls) {
    const old = G._windCls; G._windCls = cls;
    const kindChg = old && cls.replace(/\d/g, '') !== old.replace(/\d/g, ''), lvChg = old && Math.abs(+cls.slice(-1) - +old.slice(-1)) >= 2;
    if ((kindChg || lvChg) && G._windNoteT <= 0 && G.mode === 'play' && !G.over && (+cls.slice(-1) >= 1 || +old.slice(-1) >= 2)) { G._windNoteT = 18; say(`🌬 風向變了：<em>${windImpactTxt(cls)}</em>`); }
  }
}
function windWord() {
  const w = G.wx; if (w.off) return '天氣系統關閉'; if (w.dome) return '室內（無風無雨）';
  const c = Math.cos(w.dir * Math.PI / 180), s = Math.sin(w.dir * Math.PI / 180);
  const along = c > .6 ? '吹向外野（順風）' : c < -.6 ? '吹向本壘（逆風）' : s > 0 ? '由左往右吹' : '由右往左吹';
  return `${w.spd.toFixed(1)} m/s ${along}`;
}
function skyLabel() {
  const r = rainK(), lv = wxLevel(r), on = G.wxOn && G.wx && !G.wx.dome && !G.wx.off, T = on ? TW_LBL[G.wxScen] : null;
  if (T) return [r >= .06 ? `${T[0]}・${lv[0]}` : T[0], r >= .3 ? lv[1] : T[1]];
  if (r < .06 && on) { const cl = cloudK(); return cl < .3 ? [G.night ? '晴朗夜空' : '大晴天', G.night ? '🌙' : '☀️'] : cl < .7 ? ['多雲', '⛅'] : ['陰暗天', '☁️']; }
  return lv;
}
const SKY = { clear: { bg: 0x86bdf2, fog: 0xa6c8e6, fn: 140, ff: 360, hemi: .82, sun: .62, sc: 0xffe8b8, wall: .94, sp: [-40, 80, 40], hc: 0xf0f2e6, hg: 0x4a7a40, fl: 0 },
  sunny: { bg: 0x6fb2ea, fog: 0xb0cfe6, fn: 160, ff: 400, hemi: .8, sun: .62, sc: 0xffe2a8, wall: .93, sp: [-32, 95, 36], hc: 0xf0f2e6, hg: 0x4a7a40, fl: 0 },
  overcast: { bg: 0x8d97a5, fog: 0x9ba4b1, fn: 110, ff: 300, hemi: .75, sun: .22, sc: 0xdde5ef, wall: .82, sp: [0, 90, 8], hc: 0xf0f2e6, hg: 0x4a7a40, fl: 0 },
  storm: { bg: 0x4a5461, fog: 0x586272, fn: 70, ff: 230, hemi: .6, sun: .1, sc: 0xb9c6d8, wall: .6, sp: [0, 90, 8], hc: 0xf0f2e6, hg: 0x4a7a40, fl: 0 } };
/* 夜間：燈塔全開，整體亮度與白天相當（不昏暗），改用冷色天光＋暖白主燈＋兩盞泛光燈做出立體的夜場感 */
const SKYN = { clear: { bg: 0x02050d, fog: 0x050b1a, fn: 220, ff: 640, hemi: .60, sun: .36, sc: 0xffd8a0, wall: .95, sp: [-45, 90, -110], hc: 0xf4e8d2, hg: 0x4a7a40, fl: .14 },      // 夜間：天空／霧維持近黑，場內光線改成接近白天的中性偏暖（黃昏感）且略暗，人物與球場保持原本配色（不再被藍黑色光壓黑）
  sunny: { bg: 0x02050d, fog: 0x050b1a, fn: 220, ff: 640, hemi: .60, sun: .36, sc: 0xffd8a0, wall: .95, sp: [-45, 90, -110], hc: 0xf4e8d2, hg: 0x4a7a40, fl: .14 },
  overcast: { bg: 0x070b14, fog: 0x0c1324, fn: 170, ff: 520, hemi: .50, sun: .14, sc: 0xe3d2b8, wall: .93, sp: [-45, 90, -110], hc: 0xe2dccd, hg: 0x44703a, fl: .10 },
  storm: { bg: 0x03050a, fog: 0x070b16, fn: 110, ff: 360, hemi: .38, sun: .06, sc: 0xc8c0b0, wall: .86, sp: [-45, 90, -110], hc: 0xcfcac0, hg: 0x3d6334, fl: .07 } };
const _c3 = new THREE.Color();
const mixHex = (a, b, t) => _c3.set(a).lerp(new THREE.Color(b), t).getHex();
const HEXK = new Set(['bg', 'fog', 'sc', 'hc', 'hg']);
function mixSky(a, b, t) { const n = (x, y) => x + (y - x) * t, o = {}; for (const k in a) { const v = a[k]; o[k] = Array.isArray(v) ? v.map((x, i) => n(x, b[k][i])) : HEXK.has(k) ? mixHex(v, b[k], t) : n(v, b[k]); } return o; }
const cloudFor = sc => ({ sunny: 0, calm: .45, overcast: .95, drizzle: 1, change: .6, heavy: 1, storm: 1, plum: 1, thunder: .85, typhoon: 1, hot: .05, haze: .4, monsoon: .9 }[sc] ?? .3);
const cloudK = () => clamp(G.cloud === undefined ? .3 : G.cloud, 0, 1);
const WX_NEXT = { calm: [['calm', 8], ['sunny', 3], ['overcast', 3], ['drizzle', .8]], sunny: [['sunny', 8], ['calm', 3], ['overcast', 3], ['drizzle', .6]], overcast: [['overcast', 6], ['sunny', 3], ['calm', 3], ['drizzle', 1.8], ['heavy', 1.0]], drizzle: [['drizzle', 4], ['overcast', 4], ['sunny', 2], ['calm', 1], ['heavy', 1.6]], change: [['change', 5], ['overcast', 3], ['drizzle', 1], ['sunny', 3], ['heavy', .7]], heavy: [['heavy', 3], ['drizzle', 5], ['overcast', 2], ['storm', 1.3]], storm: [['storm', 2], ['heavy', 5], ['drizzle', 1]] };      // 好天氣可能轉雨、雨天也會轉好（暴雨→大雨→毛毛雨→陰→放晴）

/* ---------------- 台灣特色天氣：梅雨／午後雷陣雨／颱風外圍環流／悶熱高溫／空氣霾害／東北季風 ---------------- */
const TW_SC = {
  plum:    { boost: 1,   rain: () => .10 + Math.random() * .16, wind: () => .3 + Math.random() * 1.6, windRange: [.2, 2.6], retarget: c => Math.random() < .12 ? .32 + Math.random() * .16 : .09 + Math.random() * .2 },
  thunder: { boost: 2.2, rain: () => .52 + Math.random() * .3,  wind: () => 2.5 + Math.random() * 2.5, windRange: [1.2, 6.5], retarget: c => c > .6 ? (Math.random() < .55 ? .78 + Math.random() * .12 : .5 + Math.random() * .2) : .55 + Math.random() * .3 },
  typhoon: { boost: 2.2, rain: () => .22 + Math.random() * .3,  wind: () => 4.2 + Math.random() * 2.3, windRange: [3.5, 8.5], steady: true, retarget: c => c > .45 ? .12 + Math.random() * .22 : .5 + Math.random() * .25 },
  hot:     { boost: 1,   rain: null, wind: () => .1 + Math.random() * .9, windRange: [.1, 1.4], retarget: () => 0 },
  haze:    { boost: 1,   rain: null, wind: () => .1 + Math.random() * .8, windRange: [.1, 1.2], retarget: () => 0 },
  monsoon: { boost: 1.1, rain: () => Math.random() < .5 ? .08 + Math.random() * .1 : 0, wind: () => 3.6 + Math.random() * 2.2, windRange: [3, 6.6], steady: true, retarget: () => Math.random() < .4 ? .08 + Math.random() * .12 : 0 }
};
const TW_LBL = { plum: ['梅雨', '🌧'], thunder: ['午後雷陣雨', '⛈'], typhoon: ['颱風外圍環流', '🌀'], hot: ['悶熱高溫', '🥵'], haze: ['空氣霾害', '😷'], monsoon: ['東北季風', '🌬'] };
const TW_BIAS = {      // 各球場的區域天氣傾向（倍率，未列出＝1）
  '洲際棒球場': { haze: 2, thunder: 1.2, plum: .8, monsoon: .6, typhoon: .6 }, '亞太主球場': { hot: 1.8, thunder: 1.5, haze: 1.2, plum: .6, monsoon: .3 },
  '桃園棒球場': { monsoon: 2.2, plum: 1.4, hot: .8, thunder: .8 }, '新莊棒球場': { plum: 2, monsoon: 1.6, thunder: 1.2, haze: .7 }, '天母棒球場': { plum: 2, monsoon: 1.5, thunder: 1.4, haze: .6 },
  '澄清湖棒球場': { hot: 2, haze: 1.7, thunder: 1.4, plum: .4, monsoon: .2, typhoon: 1.2 }, '嘉義市立棒球場': { hot: 1.6, thunder: 2, haze: 1.3, plum: .6, monsoon: .3 },
  '斗六棒球場': { hot: 1.7, haze: 1.8, thunder: 1.5, plum: .6, monsoon: .4 }, '花蓮縣立棒球場': { typhoon: 3, monsoon: 2, plum: 1.2, thunder: .6, hot: .8, haze: .2 }, '台東縣立棒球場': { typhoon: 3, monsoon: 1.8, hot: 1.3, haze: .3, plum: .6 }
};
const twW = (arr, park) => arr.map(x => x[1] * ((TW_BIAS[park] || {})[x[0]] ?? 1));
const scenBoost = s => TW_SC[s] ? TW_SC[s].boost : s === 'storm' ? 6 : s === 'heavy' ? 1.4 : 1;
const gustMul = () => ({ calm: .5, sunny: .5, hot: .5, haze: .5, plum: .5, storm: 1.5, typhoon: 1.7, thunder: 1.3, monsoon: 1.15 }[G.wxScen] ?? 1);
const ltMin = () => G.wxScen === 'thunder' ? .4 : G.wxScen === 'typhoon' ? .55 : .8;      // 雷陣雨／颱風雨帶：雨勢不必到暴雨就會打雷
const wxIn = () => G.wxOn && G.wx && !G.wx.dome && !G.wx.off;
const nightK = () => (G.night && G.wxOn) ? 1 : 0;
const hazeK = () => wxIn() ? clamp(G.haze || 0, 0, 1) : 0;
const heatK = () => wxIn() ? clamp(G.heat || 0, 0, 1) : 0;
const hotK = () => (wxIn() && G.wxScen === 'hot') ? 1 : 0;
function twTemp(on, dome, PK, sc) {
  if (!on) return 26; if (dome) return 25; const r = Math.random();
  let t = { hot: 34 + r * 4, monsoon: 17 + r * 6, plum: 23 + r * 4, typhoon: 24 + r * 4, haze: 27 + r * 6 }[sc];
  if (t === undefined) t = 22 + r * 10 + PK.dt - G.rain * 4; else t += PK.dt * .5;
  if (G.night) t -= 3 + Math.random() * 3; return Math.round(t);      // 夜間比賽比較涼（球飛行阻力較大）
}
function twTempShift(nx) {
  if (!G.wx || G.wx.dome || G.wx.off) return; const dt = (PARKS[G.wx.venue] || {}).dt || 0, tg = ({ hot: 36, monsoon: 20, plum: 25, typhoon: 26, haze: 30, thunder: 26, heavy: 24, storm: 24, drizzle: 25, overcast: 26, sunny: 29, calm: 28 }[nx] ?? 27) + dt * .5 - (G.night ? 4 : 0);
  G.wx.tempT = Math.round(G.wx.temp + (tg - G.wx.temp) * .6);
}
const TW_MSG = { plum: '🌫 梅雨鋒面滯留，空氣濕黏，細雨綿綿下個不停…', thunder: '⛈ 午後對流旺盛，雲層快速堆高，雷陣雨來了！', typhoon: '🌀 颱風外圍環流接近，風雨一陣一陣越來越強！', hot: '🥵 悶熱難耐，球員揮汗如雨（投手體力消耗加快）', haze: '😷 空氣品質轉差，遠方蒙上一層霾，高飛球更難看清', monsoon: '🌬 東北季風增強，風勢穩定又濕冷，偶有細雨' };
function twEnter(nx) {
  const T = TW_SC[nx]; if (!T) return; G.rainT = T.rain ? T.rain() : 0;
  const pw = (G.wx && PARKS[G.wx.venue] && PARKS[G.wx.venue].wind) || 1; G.windMeanT = clamp(T.wind() * pw * (G.night ? .8 : 1), T.windRange[0], T.windRange[1]);
  if (G.mode === 'play' && !G.over) { say(TW_MSG[nx]); toast(TW_LBL[nx][1] + ' ' + TW_LBL[nx][0], '#fff', '#c84'); }
}
Object.assign(WX_NEXT, { plum: [['plum', 6], ['drizzle', 3], ['overcast', 3], ['heavy', .8], ['calm', 1]], thunder: [['thunder', 3], ['heavy', 2], ['drizzle', 4], ['overcast', 2], ['sunny', 2]], typhoon: [['typhoon', 6], ['heavy', 2], ['drizzle', 1.5], ['storm', .8]], hot: [['hot', 7], ['sunny', 3], ['thunder', 2], ['calm', 2], ['overcast', 1]], haze: [['haze', 7], ['overcast', 2], ['calm', 2], ['sunny', 1]], monsoon: [['monsoon', 7], ['overcast', 3], ['drizzle', 2], ['calm', 1]] });
WX_NEXT.sunny.push(['hot', 1.2]); WX_NEXT.calm.push(['hot', 1.2], ['haze', .5]); WX_NEXT.overcast.push(['plum', 1], ['thunder', .6]); WX_NEXT.drizzle.push(['plum', 1.4]); WX_NEXT.heavy.push(['typhoon', .3]);
function drawTwFx(c, W, H) {          // 夜間燈塔眩光／暗角、悶熱熱浪、霾害、梅雨濕氣
  if (!G.wx) return; const t = performance.now() / 1000, on = wxIn();
  if (G.night) {
    [[.07, -.05], [.93, -.05]].forEach(([x, y], i) => { const g = c.createRadialGradient(W * x, H * y, 0, W * x, H * y, H * .6); g.addColorStop(0, `rgba(255,244,214,${(.2 + .03 * Math.sin(t * 1.3 + i)).toFixed(3)})`); g.addColorStop(.35, 'rgba(255,236,190,.06)'); g.addColorStop(1, 'rgba(255,236,190,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); });
    const v = c.createRadialGradient(W / 2, H * .5, Math.min(W, H) * .45, W / 2, H * .5, Math.hypot(W, H) * .62); v.addColorStop(0, 'rgba(10,20,50,0)'); v.addColorStop(1, 'rgba(10,20,50,.2)'); c.fillStyle = v; c.fillRect(0, 0, W, H);      // 暗角很淡：場地保持明亮
  }
  if (!on) return; const ht = heatK(), hz = hazeK();
  if (ht > .05 && !G.night || G.wxScen === 'hot') { const k = G.wxScen === 'hot' ? Math.max(ht, .5) : ht * .5; c.fillStyle = `rgba(255,190,90,${(.045 * k).toFixed(3)})`; c.fillRect(0, 0, W, H);
    c.save(); c.globalAlpha = .05 * k; c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const y0 = H * (.5 + i * .09); c.beginPath(); c.moveTo(0, y0); for (let x = 0; x <= W; x += W / 24) c.lineTo(x, y0 + Math.sin(x * .012 + t * (1.5 + i * .4) + i) * H * .006); for (let x = W; x >= 0; x -= W / 24) c.lineTo(x, y0 + H * .03 + Math.sin(x * .012 + t * 1.5 + i + 1) * H * .006); c.closePath(); c.fill(); } c.restore(); }
  if (hz > .05) { c.fillStyle = G.night ? `rgba(150,130,95,${(.1 * hz).toFixed(3)})` : `rgba(205,190,150,${(.16 * hz).toFixed(3)})`; c.fillRect(0, 0, W, H); }
  if (G.wxScen === 'plum') { c.fillStyle = 'rgba(175,190,205,.07)'; c.fillRect(0, 0, W, H); }
  if (G.wxScen === 'monsoon') { c.fillStyle = 'rgba(120,150,190,.05)'; c.fillRect(0, 0, W, H); }
}
function shiftScene() {              // 隨比賽進行，天氣情境會慢慢轉變（晴→多雲→陰→雨，或雲散放晴）
  const cur = G.wxScen, tb = WX_NEXT[cur]; if (!tb) return;
  const nx = weighted(tb.map(x => x[0]), twW(tb, G.wx && G.wx.venue)); if (nx === cur) return;
  G.scCool = 1; G.wxScen = nx; G.cloudBase = cloudFor(nx); G.windBoost = scenBoost(nx); twTempShift(nx); twEnter(nx);
  const clear = s => s === 'sunny' || s === 'calm';
  if (G.mode === 'play' && !G.over) { if (clear(cur) && nx === 'overcast') say(G.night ? '☁️ 雲層變厚，遮住了星月…' : '☁️ 雲層變厚了，天色漸漸暗下來…'); else if (cur === 'overcast' && clear(nx)) say(G.night ? '🌌 雲層散開，星月露臉，天氣轉好了！' : '🌤 雲層散開，陽光露臉，天氣轉好了！'); else if (nx === 'sunny' && cur !== 'calm') say(G.night ? '🌙 天空放晴，月光與燈光灑滿球場！' : '☀️ 天空放晴，陽光灑滿球場！'); else if ((nx === 'drizzle' || nx === 'heavy' || nx === 'storm') && (clear(cur) || cur === 'overcast')) say('🌦 烏雲壓境，雨點開始落下了…'); else if ((cur === 'drizzle' || cur === 'heavy' || cur === 'storm') && (nx === 'overcast' || nx === 'calm')) say(G.night ? '🌥 雨勢漸漸減弱，雲層慢慢散開…' : '🌥 雨勢漸漸減弱，天空慢慢轉亮…'); }
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function applyLighting() {            // 依日夜、天氣（晴／陰／雨／霾／悶熱）調整天空、霧、光源、場邊廣告牆與觀眾席亮度
  const on = G.wxOn !== false && G.wx && !G.wx.off && !G.wx.dome, nt = !!G.night, T = nt ? SKYN : SKY;
  const base = on ? mixSky(T.sunny, T.overcast, cloudK()) : T.clear, st = T.storm, k = on ? clamp(Math.pow(rainK(), 1.6) * 1.05, 0, 1) : 0, hz = on ? hazeK() : 0, ht = on ? heatK() : 0;
  const mix = (a, b) => a + (b - a) * k, col = (a, b) => _c1.set(a).lerp(_c2.set(b), k);
  scene.background.copy(col(base.bg, st.bg)); scene.fog.color.copy(col(base.fog, st.fog)); let fn = mix(base.fn, st.fn), ff = mix(base.ff, st.ff);
  if (hz > .01) { scene.background.lerp(_c2.set(nt ? 0x3a3a3c : 0xb7ab94), hz * .55); scene.fog.color.lerp(_c2.set(nt ? 0x4a4338 : 0xc2b49a), hz * .8); fn *= 1 - hz * .45; ff *= 1 - hz * .4; }
  scene.fog.near = fn; scene.fog.far = ff;
  hemi.intensity = mix(base.hemi, st.hemi); hemi.color.copy(col(base.hc, st.hc)); hemi.groundColor.copy(col(base.hg, st.hg));
  sun.intensity = mix(base.sun, st.sun); sun.color.copy(col(base.sc, st.sc)); sun.position.set(mix(base.sp[0], st.sp[0]), mix(base.sp[1], st.sp[1]), mix(base.sp[2], st.sp[2]));
  flood1.intensity = flood2.intensity = flood3.intensity = mix(base.fl, st.fl);
  if (ht > .01 && !nt) { sun.intensity += .1 * ht; sun.color.lerp(_c2.set(0xffd89a), ht * .5); }                      // 悶熱：日照更強、偏暖
  if (hz > .01 && !nt) { sun.intensity *= 1 - hz * .25; sun.color.lerp(_c2.set(0xffc58a), hz * .5); }                  // 霾：日光變淡、偏橘
  { const rb = G.rb || 0; if (rb > .01) { sun.color.lerp(_c2.set(0xffd9a0), rb * .6); sun.intensity += .16 * rb; hemi.intensity += .05 * rb; } }      // 彩虹時：暖色斜射光
  const w = mix(base.wall, st.wall); wallMat.color.setScalar(w); stand.material.color.setScalar(clamp(w * (nt ? .74 : .98), .4, 1.1));
  skyDome.material.color.copy(scene.fog.color).multiplyScalar(nt ? 2.6 : 1.25); dark.material.color.set(nt ? 0x0a170e : 0x23402a);
}
function drawSky(c, W, H) {           // 晴：右上角柔和暖陽光暈；陰：灰藍色調與暗角（依雲量連續變化）
  if (!G.wxOn || !G.wx || G.wx.dome || G.wx.off) return; const cl = cloudK();
  const k = (1 - cl) * (1 - clamp(rainK() * 3, 0, 1)) * (G.night ? 0 : 1);
  if (k > .02) { const t = performance.now() * .0004, pul = .94 + Math.sin(t) * .06;
    const g = c.createRadialGradient(W * .92, -H * .06, 0, W * .92, -H * .06, H * 1.1); g.addColorStop(0, `rgba(255,214,130,${.075 * k * pul})`); g.addColorStop(.4, `rgba(255,200,110,${.025 * k})`); g.addColorStop(1, 'rgba(255,190,100,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  if ((G.rb || 0) > .01) { const g = c.createRadialGradient(W * .5, H * .25, 0, W * .5, H * .25, Math.hypot(W, H) * .6); g.addColorStop(0, `rgba(255,226,170,${.1 * G.rb})`); g.addColorStop(1, 'rgba(255,226,170,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  if ((G.rb || 0) > .01) {                                                           // 彩虹：天空中的微微七彩弧光（柔和、半透明）
    const rb = G.rb, cx = W * .5, cy = H * .78, R = Math.min(H * .72, W * .42), bw = R * .045, cols = ['255,74,74', '255,154,58', '255,228,74', '90,224,106', '74,200,232', '74,106,255', '154,90,255'];
    c.save(); c.globalCompositeOperation = 'screen';
    c.lineWidth = bw * 9; c.strokeStyle = `rgba(255,236,200,${.035 * rb})`; c.beginPath(); c.arc(cx, cy, R - bw * 3, Math.PI * 1.06, Math.PI * 1.94); c.stroke();
    for (let i = 0; i < 7; i++) { c.lineWidth = bw + 1; c.strokeStyle = `rgba(${cols[i]},${(.13 * rb).toFixed(3)})`; c.beginPath(); c.arc(cx, cy, R - i * bw, Math.PI * 1.06, Math.PI * 1.94); c.stroke(); }
    c.restore();
  }
  const a = clamp((cl - .35) / .65, 0, 1) * (G.night ? .35 : 1);
  if (a > 0) { c.fillStyle = `rgba(46,58,76,${.12 * a})`; c.fillRect(0, 0, W, H); const g = c.createRadialGradient(W / 2, H * .5, Math.min(W, H) * .35, W / 2, H * .5, Math.hypot(W, H) * .6); g.addColorStop(0, 'rgba(8,14,26,0)'); g.addColorStop(1, `rgba(8,14,26,${.38 * a})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
}
function updateWindHud() {
  const e = $('windBox'); if (!e) return; const w = G.wx, lv = skyLabel();
  if (w.off) { e.innerHTML = `<span>${G.night ? '🌙 ' : ''}${w.venue}・天氣關閉</span>`; return; }
  if (w.dome) { e.innerHTML = `<span>${G.night ? '🌙 ' : ''}🏟 ${w.venue}・室內</span>`; return; }
  const cls = windClass(), k = cls.replace(/\d/g, ''), d = { calm: '微風', tail: '順風', head: '逆風', right: '左→右', left: '右→左' }[k], col = k === 'tail' ? '#8f8' : k === 'head' ? '#f99' : '#ffe14a';
  const gs = w.gust > .8 ? ' <b style="color:#ffb23a">陣風▲</b>' : w.gust < -.6 ? ' <b style="color:#9cf">風減▼</b>' : '';
  e.title = windImpactTxt(cls);
  e.innerHTML = `<span class="warr" style="transform:rotate(${w.dir.toFixed(0)}deg);color:${col}">⬆</span><span>${w.spd.toFixed(1)}m/s <b style="color:${col}">${d}</b>${gs}</span><span>${G.night ? '🌙夜間 ' : ''}${lv[1]}${lv[0]}・${w.temp}°C</span>`;
}
function coverSteal(idxs) {               // 盜壘起跑時，負責補位的內野手立刻啟動跑向壘包（不是等捕手接到球才動）
  for (const i of idxs) {
    const base = i + 2; if (base > 3) continue; const bs = baseSpot(base);
    const f = base === 2 ? (E.bat && E.bat.side > 0 ? E.F.SS : E.F['2B']) : E.F['3B']; if (!f) continue;
    f.tx = bs.x + (base === 2 ? (f.pos === 'SS' ? -.6 : .6) : .5); f.tz = bs.z + .5; f.sp = fspeed(f) * 1.08; f.cover = base; f.wait = clamp(.16 - ((f.pl.fld || 55) - 55) * .002, .05, .3);
  }
}
/* ---------- 暴雨：閃電＋雷聲 ---------- */
function ltBolt(W, H) {      // 鋸齒狀閃電主幹＋幾條分支
  const pts = []; let x = W * (.12 + Math.random() * .76), y = 0; pts.push([x, y]);
  const n = 9 + Math.floor(Math.random() * 4), dy = H * (.5 + Math.random() * .12) / n;
  const br = [];
  for (let i = 0; i < n; i++) { x += (Math.random() - .5) * W * .09; y += dy * (.7 + Math.random() * .6); pts.push([x, y]); if (i > 1 && i < n - 2 && Math.random() < .35) { const b = [[x, y]]; let bx = x, by = y; for (let k = 0; k < 3; k++) { bx += (Math.random() < .5 ? -1 : 1) * W * (.02 + Math.random() * .04); by += dy * (.5 + Math.random() * .5); b.push([bx, by]); } br.push(b); } }
  return { pts, br };
}
function updateLightning(dt) {
  if (rainK() < ltMin()) { if (G.lt && G.lt.t < 0) G.lt.cd = Math.max(G.lt.cd, 8); if (G.lt && G.lt.t >= 0) G.lt.t += dt; return; }
  const L = G.lt || (G.lt = { cd: 8 + Math.random() * 8, t: -1, bolt: null, thunder: -1 });
  if (L.t < 0) { L.cd -= dt; if (L.cd <= 0) { L.t = 0; L.bolt = null; L.big = Math.random() < .35; L.thunder = .25 + Math.random() * 1.6; L.cd = (15 + Math.random() * 15) * (G.wxScen === 'thunder' ? .55 : 1); } }
  else { L.t += dt; if (L.t > .7) L.t = -1; }
  if (L.thunder >= 0 && L.t >= 0) { L.thunder -= dt; if (L.thunder < 0) { try { noiseBurst(1.8, 140, .7, .55 * (L.big ? 1.2 : .8), 'lowpass'); noiseBurst(1.1, 70, .6, .5, 'lowpass'); if (L.big) { noiseBurst(.25, 1800, 1.2, .35, 'bandpass'); CAMC.shake = Math.max(CAMC.shake || 0, .1); } } catch (e) { } if (G.mode === 'play' && !G.over && Math.random() < .35) say(L.big ? '⚡ <em>轟隆！</em>一道巨大的閃電劃破天際，雷聲震耳欲聾！' : '⚡ 遠方傳來陣陣雷聲…'); } }
}
function drawLightning(c, W, H) {
  const L = G.lt; if (!L || L.t < 0) return; const t = L.t;
  const a = t < .1 ? .8 : t < .2 ? .4 : t < .3 ? .6 : t < .7 ? Math.max(0, .3 * (1 - (t - .3) / .4)) : 0;      // 閃光變柔和、不再快速明暗跳動（降低眼睛不適）
  if (a <= 0) return; const dpr = W / VW();
  c.save(); c.fillStyle = `rgba(214,226,255,${(a * (L.big ? .4 : .27)).toFixed(3)})`; c.fillRect(0, 0, W, H);
  if (t < .3) {
    if (!L.bolt) L.bolt = ltBolt(W, H);
    const draw = (pts, lw, col, blur) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.lineWidth = lw * dpr; c.strokeStyle = col; c.shadowColor = '#9cc8ff'; c.shadowBlur = blur * dpr; c.lineJoin = 'round'; c.stroke(); };
    const ba = Math.min(1, a * 1.2);
    draw(L.bolt.pts, 5.5, `rgba(150,190,255,${(ba * .45).toFixed(2)})`, 26); draw(L.bolt.pts, 2.4, `rgba(255,255,255,${ba.toFixed(2)})`, 14);
    for (const b of L.bolt.br) { draw(b, 3, `rgba(150,190,255,${(ba * .4).toFixed(2)})`, 16); draw(b, 1.3, `rgba(255,255,255,${(ba * .9).toFixed(2)})`, 8); }
  }
  c.restore();
}
const DRIZ = { a: [], t: 0 };
function drawDrizzleDrops(c, W, H, r, dpr, wind) {            // 毛毛雨／小雨：稀疏但看得清楚的小雨滴，每顆慢慢落下、落到底後隔一會兒才再出現（頻率不高）
  const now = performance.now(), dt = Math.min(.1, DRIZ.t ? (now - DRIZ.t) / 1000 : .016); DRIZ.t = now;
  const k = clamp(1 - (r - .3) / .25, 0, 1), A = DRIZ.a; if (k <= 0) { A.length = 0; return; }
  const want = Math.round((9 + r * 60) * k);
  while (A.length < want) A.push({ x: Math.random(), y: Math.random() * 1.1 - .1, v: .7 + Math.random() * .5, len: 16 + Math.random() * 16, a: .5 + Math.random() * .3, wait: Math.random() * 1.2 });
  if (A.length > want) A.length = want;
  c.lineCap = 'round'; c.lineWidth = 1.7 * dpr;
  for (const d of A) {
    if (d.wait > 0) { d.wait -= dt; continue; }
    d.y += d.v * dt * (780 * dpr / H);
    if (d.y > 1.04) { d.x = Math.random(); d.y = -.04; d.v = .7 + Math.random() * .5; d.len = 16 + Math.random() * 16; d.a = .5 + Math.random() * .3; d.wait = .15 + Math.random() * 1.6; continue; }
    const x = d.x * (W + 40 * dpr), y = d.y * H, l = d.len * dpr;
    c.strokeStyle = `rgba(215,235,255,${d.a.toFixed(2)})`; c.beginPath(); c.moveTo(x, y); c.lineTo(x - wind * .55 * dpr, y + l); c.stroke();
  }
}
function drawRain(c, W, H) {            // 雨量：毛毛雨＝細密雨絲＋薄霧；小雨＝明顯雨幕；大雨/暴雨＝密集粗雨
  const r = rainK(); if (r < .03) { DRIZ.a.length = 0; return; } const dpr = W / VW(), wind = Math.min(G.wx.spd || 0, r < .8 ? 4 : 11) * .6 + 2;
  c.save(); drawDrizzleDrops(c, W, H, r, dpr, wind); c.restore();
  const rv = r < .55 ? r * .62 : r < .8 ? .341 + (r - .55) * .95 : .58 + (r - .8) * 2.1, n = Math.floor((30 + 560 * Math.pow(Math.min(rv, 1), 1.25)) * clamp((r - .1) / .3, .2, 1)), len = (9 + rv * 24) * dpr;
  c.fillStyle = `rgba(${G.night ? '110,130,170' : '150,170,196'},${(.035 + Math.min(r, .5) * .12).toFixed(3)})`; c.fillRect(0, 0, W, H);                // 薄霧：低雨量也看得出空氣濕濛
  c.fillStyle = `rgba(12,24,44,${(rv * .15 * (G.night ? .3 : 1)).toFixed(3)})`; c.fillRect(0, 0, W, H);
  c.strokeStyle = G.night ? `rgba(240,245,255,${Math.min(1, (.22 + rv * .4) * 1.25).toFixed(2)})` : `rgba(205,228,255,${(.22 + rv * .4).toFixed(2)})`; c.lineWidth = (.9 + rv * 1.0) * dpr; c.beginPath();
  for (let i = 0; i < n; i++) { const x = Math.random() * (W + 80 * dpr), y = Math.random() * H; c.moveTo(x, y); c.lineTo(x - wind * 1.6 * dpr * (len / (30 * dpr)), y + len); } c.stroke();
}
function slipRunner(r, why) {            // 跑者在濕滑場地滑倒
  if (r.stall > 0 || r.state !== 'run') return; r.slipped = true;
  if (why === 'stumble') { r.stall = .35 + Math.random() * .35; r.rig.anim = { name: 'down', t: 0, dur: .6, opt: { hold: true } }; say(`<em>${r.pl.name}過壘時腳步踉蹌，差點跌倒！</em>`); toast('踉蹌！', '#fff', '#c84'); flowSfx('bounce'); return; }
  r.stall = .8 + Math.random() * .6;
  r.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${r.pl.name}在濕滑的場地上滑倒了！</em>`); toast('滑倒！', '#fff', '#38c'); flowSfx('bounce');
  maybeInjureRunner(r, 'slip');
}
function maybeSlip(r, mult) {
  const q = rainK(); if (!r || r.pl.isPitcherBat) return;
  if (q < .08) { const p = clamp(.004 * (mult || 1) * (1 + (55 - (r.pl.spd || 55)) * .01) * chaosK(G.half), .001, .02); if (Math.random() < p) slipRunner(r, 'stumble'); return; }      // 晴天也偶爾會踉蹌（跑速慢、盜壘衝刺時機率稍高）
  const p = q * q * .06 * (mult || 1) * stormMul() * (1 + ((r.pl.spd || 55) - 55) * .006); if (Math.random() < p) slipRunner(r);
}
/* ---------------- 心情值事件 ---------------- */
function abMood(kind, b) {
  const pp = curPitcher(); b = b || curBatter();
  if (pp) { pp.bbA = pp.bbA || 0; pp.hA = pp.hA || 0; pp.kA = pp.kA || 0; }
  if (kind === 'K') { adjustMood(pp, 4); adjustMood(b, -6); pp.kA++; }
  else if (kind === 'out' || kind === 'foulout') { adjustMood(pp, 2); adjustMood(b, -3); }
  else if (kind === 'BB' || kind === 'IBB') { adjustMood(pp, -5); adjustMood(b, 2); pp.bbA++; }
  else if (kind === 'HR') { adjustMood(pp, -11); adjustMood(b, 11); pp.hA++; }
  else if (kind === 'H4') { adjustMood(pp, -9); adjustMood(b, 9); pp.hA++; }
  else if (kind === 'HBP') { adjustMood(pp, -3); adjustMood(b, -1); }
  else if (kind === 'E') { adjustMood(pp, -2); adjustMood(b, 2); }
  else if (kind === 'FC') { adjustMood(pp, 1); adjustMood(b, -1); }
  else if (kind && kind[0] === 'H') { adjustMood(pp, -4); adjustMood(b, 6); pp.hA++; }
  if (pp) { const hit = kind === 'HR' || kind === 'H4', bad = hit || kind === 'BB' || kind === 'IBB' || kind === 'HBP' || kind === 'E' || (kind && kind[0] === 'H'), good = kind === 'K' || kind === 'out' || kind === 'foulout' || kind === 'FC'; pp.shaky = clamp((pp.shaky || 0) + (hit ? 2 : bad ? 1 : good ? -1 : 0), 0, 8); }   // 不穩定累積值（長時間投不好才會上升）
  // 局面壓力：得點圈有人時投手心情更容易下滑
  if (G.on[1] || G.on[2]) adjustMood(pp, -.8);
  updatePlayerBoxes();
}
function moodTick(p) {             // 每球：心情向基準值緩慢回歸，體力差時、下雨時緩慢下滑
  if (!p) return; const base = 55; p.mood = clamp(moodOf(p) + (base - moodOf(p)) * .012 - (p.fatigue > 60 ? .1 : 0) - rainK() * .14 - hotK() * .05, 0, 100); if (p.kind === 'P') p.tilt = clamp((60 - p.mood) * .7, 0, 40);
}
/* ---------------- 投手教練上場（心理建設） ---------------- */
const VISIT_LINES = {
  low: ['深呼吸…把球投進捕手手套就好！', '忘掉剛剛那球，下一球重新開始！', '你的球威比他強，別想太多！'],
  mid: ['穩住節奏，照著自己的步調來！', '別急，守備會幫你的！', '相信你的球路，用力投！'],
  hi: ['狀況很好，繼續保持！', '很棒，別讓對手找到節奏！'],
  scold: ['你在搞什麼！控球給我投好！', '再這樣投就換你下去了！', '振作一點！剛剛那是什麼球！', '別給我丟臉，專心投！'],
  joke: ['笑一個啦，今晚宵夜我請！', '對面打者看起來比你還緊張耶！', '放輕鬆，大不了被打全壘打再說！']
};
function canVisit(side) { return G.visits[side] > 0 && G.phase === 'pre' && !G.over && !EV.abs && !EV.brawl && fieldingTeam() === G.teams[side] && !E.coach; }
function moundVisit(side, cpu) {
  if (!canVisit(side)) { if (!cpu) say(G.visits[side] <= 0 ? '本場教練上場次數（3 次）已經用完了' : '投球前才能請投手教練上場'); return false; }
  const p = curPitcher(), P = E.F.P; G.visits[side]--; G.phase = 'visit'; $('pitchPanel').classList.add('hide'); G.cpuBusy = true;
  const st = teamStyle(1 - G.half); const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt }); scene.add(rig.root);
  const sx = side === 1 ? 24 : -24; rig.root.position.set(sx, 0, -6); rig.run = 1.6;
  E.coach = { rig, x: sx, z: -6, tx: MOUND.x + 1.3, tz: MOUND.z + .9, st: 'in', t: 0, sx, p, side, mood0: moodOf(p) };
  CAMC.mode = 'play'; lastFocus.set(0, 1.3, MOUND.z); toast('投手教練上場', '#fff', '#39f'); flowSfx('whistle');
  say(`${sideName(side)}投手教練上場，和 <em>${p.name}</em> 談話（本場剩 ${G.visits[side]} 次）`);
  for (const pos of ['C', '1B', '2B', 'SS', '3B']) { const f = E.F[pos]; if (!f) continue; f.tx = MOUND.x + (pos === 'C' ? 0 : pos === '1B' || pos === '2B' ? 3 : -3); f.tz = MOUND.z + (pos === 'C' ? 3.2 : pos === '3B' || pos === '1B' ? 1.8 : 2.4); f.sp = 3.4; f.wait = 0; }
  const vb = $('visitBox'); vb.classList.add('hide');
  return true;
}
function updateCoach(dt) {
  const c = E.coach; if (!c) return; c.t += dt; const r = c.rig, P = E.F.P;
  const go = (tx, tz, sp) => { const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz); if (d > .15) { const s = Math.min(d, sp * dt); c.x += dx / d * s; c.z += dz / d * s; faceRig(r, tx, tz); r.run = 1.5; return false; } r.run = 0; return true; };
  r.root.position.x = c.x; r.root.position.z = c.z;
  if (c.st === 'in') { if (go(c.tx, c.tz, 6.2)) { c.st = 'talk'; c.t = 0; faceRig(r, P.x, P.z); faceRig(P.rig, c.x, c.z); r.anim = { name: 'cheer', t: 0, dur: .9, opt: {} }; showVisitBox(c); flowSfx('mitt', .6); } }
  else if (c.st === 'talk') {
    const u = clamp(c.t / 2.6, 0, 1), vb = $('visitBox'), bar = $('vmBar');
    if (!c.applied && c.t > .9) { c.applied = true; applyVisit(c); }
    if (c.applied && bar) { const m = c.mood0 + (moodOf(c.p) - c.mood0) * sstep((c.t - .9) / 1.2); bar.style.width = clamp(m, 2, 100) + '%'; bar.style.background = moodColor(m); $('vmFace').textContent = moodFace(m); $('vmNum').textContent = Math.round(m); }
    if (c.t > 1.0 && c.t < 1.15 && !c.pat) { c.pat = true; P.rig.anim = { name: 'cheer', t: 0, dur: .7, opt: {} }; for (let i = 0; i < 5; i++) spawnBurst(P.x + (Math.random() - .5) * 1.4, 1.2 + Math.random() * 1.2, P.z + (Math.random() - .5) * 1.0, .6 + Math.random() * .6); }
    if (c.t > 2.2 && !c.sp2) { c.sp2 = true; for (let i = 0; i < 4; i++) spawnBurst(P.x + (Math.random() - .5), 1.5 + Math.random(), P.z, .5); }
    if (c.t >= 2.9) { c.st = 'out'; c.t = 0; vb.classList.add('hide'); c.tx = c.sx; c.tz = -6; }
  }
  else if (c.st === 'out') {
    if (go(c.tx, c.tz, 6.0)) { scene.remove(r.root); E.coach = null; G.phase = 'pre'; G.cpuBusy = false; resetFormation(false); setCamBat(); P.rig.anim = null; prePitch(); updatePlayerBoxes(); updateActs(); }
  }
}
function applyVisit(c) {
  const p = c.p, m0 = moodOf(p);
  // 教練談話方式：鼓勵／斥責／開玩笑放鬆；心情低落時較容易失控發飆，投手個性（dur 越低越玻璃心）也會影響效果
  const fragile = clamp((75 - (p.dur || 75)) / 40, -.3, .5);           // 玻璃心程度
  const scoldP = clamp(.18 + (m0 < 35 ? .12 : 0) + (p.er >= 3 ? .08 : 0), .1, .4), jokeP = .15;
  const roll = Math.random(), style = roll < scoldP ? 'scold' : roll < scoldP + jokeP ? 'joke' : 'cheer';
  let gain, tone;
  if (style === 'scold') {
    // 斥責：心情好、有自信的投手會被激起鬥志；心情低落或玻璃心的投手反而更崩潰
    const backfire = clamp(.25 + (55 - m0) * .012 + fragile * .6, .1, .9);
    if (Math.random() < backfire) { gain = -(6 + Math.random() * 9 + fragile * 6); tone = 'bad'; }
    else { gain = 5 + Math.random() * 9; tone = 'good'; }
  } else if (style === 'joke') {
    gain = Math.random() < .25 + fragile * .3 ? -(2 + Math.random() * 5) : 6 + Math.random() * 10; tone = gain < 0 ? 'bad' : 'good';
  } else {
    // 鼓勵：多半有效，但偶爾「話沒說到心坎裡」，甚至讓投手更有壓力
    if (Math.random() < .14 + fragile * .15 + (m0 > 70 ? .08 : 0)) { gain = -(2 + Math.random() * 6); tone = 'bad'; }
    else { gain = clamp(16 + (55 - m0) * .28 + Math.random() * 8, 10, 36); tone = 'good'; }
  }
  gain = Math.round(gain);
  adjustMood(p, gain); p.pkLoad = (p.pkLoad || 0) - 3; p.fatigue = calcFatigue(p); p.lastVisitPc = p.pc; p.visits = (p.visits || 0) + 1;
  const C = E.F.C.pl; if (C && C.kind === 'B') adjustMood(C, tone === 'bad' ? -1 : 2);
  const key = m0 < 38 ? 'low' : m0 < 65 ? 'mid' : 'hi';
  const line = style === 'scold' ? pick(VISIT_LINES.scold) : style === 'joke' ? pick(VISIT_LINES.joke) : pick(VISIT_LINES[key]);
  c.line = line; c.style = style; c.tone = tone; $('vmLine').textContent = '「' + line + '」';
  $('vmName').textContent = `${p.name}　投手教練${style === 'scold' ? '斥責' : style === 'joke' ? '開玩笑緩和氣氛' : '鼓勵'}`;
  const nm = Math.round(moodOf(p));
  if (tone === 'bad') { say(`<em>${p.name}</em> ${style === 'scold' ? '被教練罵得更緊張了…' : '反而覺得壓力更大了…'}（心情 ${Math.round(m0)} → ${nm}）`); toast(style === 'scold' ? '斥責適得其反' : '談話沒有效果', '#fff', '#c33'); flowSfx('out', .5); }
  else { say(`<em>${p.name}</em> ${style === 'scold' ? '被罵醒了，眼神變得銳利！' : '情緒穩定下來了'}（心情 ${Math.round(m0)} → ${nm}）`); flowSfx('cheer', .6); crowdCheer(.5); }
  updatePlayerBoxes();
}
function showVisitBox(c) {
  const vb = $('visitBox'); vb.classList.remove('hide'); $('vmName').textContent = `${c.p.name}　投手教練談話`; $('vmLine').textContent = '…'; $('vmBar').style.width = clamp(c.mood0, 2, 100) + '%'; $('vmBar').style.background = moodColor(c.mood0); $('vmFace').textContent = moodFace(c.mood0); $('vmNum').textContent = Math.round(c.mood0);
}
function aiMoundThink() {
  const side = 1 - G.half; if (G.human === side || vsOn() || G.visits[side] <= 0 || !lvl().learn) return false;
  const p = curPitcher(), m = moodOf(p), risk = (G.on[1] || G.on[2] ? 1 : 0) + (lateGame() ? .6 : 0);
  if (p.lastVisitPc !== undefined && p.pc - p.lastVisitPc < 14) return false;
  if (m < 26 || (m < 38 && risk >= 1) || (m < 44 && G.on[2] && G.outs < 2 && lateGame())) { if (G.visits[side] > 1 || m < 24) return moundVisit(side, true); }
  return false;
}
/* ---------------- 傷病擴充 ---------------- */
function durMul(pl) { return 1 + (75 - (pl && pl.dur || 75)) * .012; }
function queueInj(e) { e.pl.out = true; G.injQ.push(e); }
function maybeInjureRunner(r, kind) {
  if (!G.evt || r.pl.out || r.pl.isPitcherBat) return;
  const p = (kind === 'slide' ? .008 : kind === 'sprint' ? .012 : kind === 'slip' ? .07 : .005) * durMul(r.pl) * (G.evt === 2 ? 2 : 1) * stormMul() * (1 + Math.max(0, r.pl.spd - 70) * .01);
  if (Math.random() < p) { queueInj({ type: 'run', side: G.half, pl: r.pl, r, why: kind === 'slip' ? pick(['滑倒時膝蓋重重著地，疑似韌帶受傷', '滑倒後手腕撐地，疼痛難忍']) : kind === 'slide' ? pick(['滑壘時手指被壘包卡住，疑似骨折', '滑壘後腳踝扭傷，無法站起來']) : pick(['全力衝刺時大腿後肌拉傷，緩緩蹲下', '跑壘急停時膝蓋扭到，臉色難看']) }); r.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${r.pl.name}倒在壘包上了！</em>看起來受傷不輕…`); crowdCheer(0); }
}
function maybeInjureOnBall(res, plan) {
  if (!G.evt || !res) return;
  const k = (G.evt === 2 ? 2 : 1) * stormMul();
  // 1) 強勁平飛／滾地球直擊投手
  if (plan && plan.f && plan.f.pos === 'P' && res.ev > 31 && res.ang < 16 && !plan.air && !plan.great) {
    const p = clamp((res.ev - 30) * .008, 0, .05) * durMul(plan.f.pl) * k;
    if (Math.random() < p) { const pl = plan.f.pl; queueInj({ type: 'pitch', side: 1 - G.half, pl, why: pick(['被強勁平飛球直接擊中小腿，痛到倒地', '手掌被強襲球砸中，立刻抱住手']) }); plan.f.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${pl.name}被強襲球擊中！</em>倒地不起…`); }
  }
  // 2) 打者：界外球打到自己
  if (!plan.air && res.marginal && res.ang < 4 && Math.random() < .012 * k) {
    const b = curBatter(); if (!b.out) { queueInj({ type: 'bat', side: G.half, pl: b, why: '界外球打在自己腳背上，疼痛難忍' }); say(`<em>${b.name}被自己的界外球打中腳！</em>`); }
  }
}
/* ---------------- 精彩守備 ---------------- */

/* ---------------- 失誤後的心情／低潮／受傷 ---------------- */
function applySlump(p) { if (p && p.fld0 != null && p.pos) setPos(p, p.pos); }
function slumpTickAll() {      // 每球：低潮慢慢消退（約 2～3 局恢復一半）
  const arr = Object.values(E.F).map(f => f.pl); try { arr.push(curBatter()); } catch (e) { }
  for (const p of arr) { if (!p || !p.slump) continue; p.slump *= .985; if (p.slump < .4) p.slump = 0; applySlump(p); }
}
const ERR_SEV = { field: .6, throw: .5, hop: .12, deflect: .12, dive: .55, leap: .65, robdrop: .9 };      // 失誤嚴重程度：撲接／跳接失敗、掉球、暴傳較重；怪彈跳、強襲彈開不是球員的錯，影響很小
const ERR_INJ = { dive: ['撲接落地時手腕重重撐地，疑似骨折', '飛身撲接後肩膀著地，劇痛站不起來'], leap: ['跳起落地時腳踝扭傷，無法站立', '躍起撞到護牆，肩膀受傷'], throw: ['暴傳瞬間手肘傳來劇痛', '用力傳球時肩膀拉傷'], field: ['漏接後急停轉身，大腿後側拉傷', '球直接打到手指，疑似骨折'] };
function errFallout(f, how, sev) {
  if (!f || !f.pl || G.mode !== 'play') return; const p = f.pl;
  if (sev == null) sev = (ERR_SEV[how] != null ? ERR_SEV[how] : .4) * (how === 'field' && PL && PL.plan && PL.plan.dive ? 1.4 : 1);
  adjustMood(p, -(3 + sev * 9));                                                       // 心情下滑（嚴重程度越高掉越多）
  if (sev >= .3) { p.slump = Math.min(12, (p.slump || 0) + sev * 3.5); applySlump(p); }      // 暫時降低能力值
  if (sev >= .5 && moodOf(p) < 42 && Math.random() < .6) colorSay(`${p.name}失誤之後臉色凝重，心情明顯受到影響…`, 2.4);
  if (!G.evt || p.out || sev < .3) return;
  const pr = sev * .011 * durMul(p) * (G.evt === 2 ? 2 : 1) * (1 + (p.slump || 0) * .03);      // 受傷機率依嚴重程度
  if (Math.random() >= pr) return;
  const serious = Math.random() < clamp(.25 + sev * .35 + (G.evt === 2 ? .1 : 0), .2, .7);      // 嚴重程度越高，越可能是需要離場就醫的重傷
  const key = how === 'dive' || how === 'leap' || how === 'throw' ? how : (how === 'robdrop' ? 'leap' : 'field');
  if (serious) {
    p.out = true; const why = pick(ERR_INJ[key]);
    G.injQ.push(f.pos === 'P' ? { type: 'pitch', side: 1 - G.half, pl: p, why } : { type: 'field', side: 1 - G.half, pl: p, pos: f.pos, why });
    f.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${p.name}失誤之後倒在地上…</em>看起來傷得不輕！`); crowdCheer(0); flowSfx('whistle');
  } else {
    adjustMood(p, -6); p.slump = Math.min(12, (p.slump || 0) + 3); applySlump(p);
    say(`<em>${p.name}揉著${pick(['手腕', '腳踝', '肩膀', '膝蓋'])}，似乎有點痛…</em>比了比手勢表示可以繼續比賽。`);
  }
}
function fancyK() { return 1 / (1 + (G.fancy || 0) * .3); }      // 本場精彩守備越多，額外的美技機率越低（平衡用）
function diveMissNote(c) {      // 撲接／跳接沒碰到球
  const f = c.f, nm = `${POS_FULL[f.pos]}${f.pl.name}`, air = !!c.air;
  const t = c.leap ? `${nm}躍起伸長手套，球從手套上方擦了過去！` : air ? pick([`${nm}俯衝飛撲，球卻在手套前落地！`, `${nm}拚命往前滑接，差一點點就接到了！`]) : pick([`${nm}飛身撲向滾地球，球從手套下方溜了過去！`, `${nm}橫向撲救，球擦過手套邊緣穿越！`]);
  toast(c.leap ? '跳接落空' : '撲接落空', '#fff', '#8a5ad8'); say(`<em>${t}</em>`, 3000); try { errFallout(f, c.leap ? 'leap' : 'dive'); } catch (e) { }
}
function robDropP(f, plan) {      // 跳起來攔下全壘打後，落地／撞牆時手套鬆脫的機率（守備好的比較穩）
  const fl = (f.pl.cat == null ? (f.pl.fld || 55) : f.pl.cat) * .6 + (f.pl.fld || 55) * .4;
  return clamp((.13 - (fl - 60) * .0022) * (plan.weakHR ? .8 : 1) * (1 + rainK() * 1.2), .04, .2);
}
function hitWhy(pl, n) {      // 安打是怎麼來的：撲接落空／來不及接／強襲穿越／內野安打／打牆彈球…
  const plan = pl.plan || {}, res = pl.res || {}, sim = pl.sim || {}, f = plan.f; if (!f || plan.kind === 'hr' || pl.badHop) return null;
  const nm = `${POS_FULL[f.pos]}${f.pl.name}`, air = res.ang >= 14, ev = res.ev || 0, dist = Math.hypot(plan.x, plan.z), fd = plan.failDive;
  if (fd) return `<em>${POS_FULL[fd.f.pos]}${fd.f.pl.name}拚命飛撲卻沒能碰到球</em>，從手套邊溜過去變成安打！`;
  if (sim.wallHit && n >= 2) return `球直接打在牆上彈回來，${nm}處理牆彈球的時候，打者已經跑上${n === 3 ? '三' : '二'}壘！`;
  if (Math.random() > .8) return null;
  if (plan.missed) return `${nm}起步慢了半拍、判斷也有點偏差，球落在身前來不及接到！`;
  if (res.bunt) return `短打的力道剛好，${nm}處理球時打者已經快到一壘了！`;
  if (!air && ev > 36 && dist < 42) return `強襲球速度太快，${nm}來不及反應，球從身旁穿越內野！`;
  if (!air && n === 1 && dist < 32 && (curBatter().spd || 0) >= 68) return `內野安打！${curBatter().name}腳程飛快，${nm}傳球差了一步！`;
  if (air && res.ang < 24) return `平飛球又快又低，${nm}往前衝還是來不及接，球落在${areaWord(plan.x, plan.z)}！`;
  if (air) return `高飛球落在${areaWord(plan.x, plan.z)}的守備空檔，${nm}全力追趕還是慢了一步！`;
  return null;
}
function dpNote(n) {      // 雙殺／三殺
  const pl = PL; if (!pl || pl['dp' + n]) return; pl['dp' + n] = true;
  const fancy = n >= 3 || pl.great || (pl.thr && pl.thr.laser) || (pl.plan && pl.plan.dive) || ((pl.res && pl.res.ev) > 36 && pl.kind === 'gb' && Math.random() < .5);
  if (fancy && n < 3) G.fancy = (G.fancy || 0) + .5;
  const tag = n >= 3 ? '三殺！！' : fancy ? '精彩雙殺！' : '雙殺！';
  after(.2, () => { toast(tag, '#fff27a', n >= 3 ? '#d4143a' : '#ff3a1a'); flowSfx('cheer', n >= 3 ? 2.6 : fancy ? 1.9 : 1.3); crowdCheer(n >= 3 ? 1.8 : fancy ? 1.3 : .8); if (fancy) flashScreen(.18);
    say(n >= 3 ? '<em>三殺！！</em>一個球連續三個出局，這是極為罕見的畫面！' : fancy ? '<em>精彩的雙殺守備！</em>防守端行雲流水地完成了兩個出局，把氣勢拉了回來！' : '<em>雙殺！</em>一個球兩個出局，防守端化解了危機。'); });
  if (G.log) G.log.push(n >= 3 ? '三殺' : '雙殺'); adjustMood(curPitcher(), n >= 3 ? 8 : 4);
}
function greatPlay(f, plan) {
  PL.great = true; G.fancy = (G.fancy || 0) + 1;
  const rob = plan.robHR, res = PL.res || {}, nm = `${POS_FULL[f.pos]}${f.pl.name}`, isOF = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF';
  const air = !!plan.air, y = plan.y || 0, lin = res.ang >= 6 && res.ang < 24, deep = (PL.dist || 0) > 78;
  let tag, line, amt = 1.5;
  if (rob) {
    amt = 2.2;
    if (plan.weakHR) { tag = '攔下全壘打！'; line = `${nm}在牆邊算準時間躍起，把這球打得不算扎實、差點出牆的全壘打攔了下來！`; }
    else { tag = '搶救全壘打！'; line = `${nm}撲向全壘打牆，躍起把全壘打球「搶」了回來！五星守備！`; }
  } else if (!air) {
    amt = 1.8;
    if (plan.superTry) { tag = '極限伸展！'; line = `${nm}把身體拉長到極限，把這顆看似安打的球攔了下來！`; }
    else if (Math.hypot(plan.x, plan.z) < 36) { tag = '飛身撲接！'; line = pick([`${nm}橫向飛撲，把這顆眼看就要穿越的滾地球攔了下來！`, `${nm}反手撲接滾地球，爬起來準備傳球！`]); }
    else { tag = '滑接！'; line = `${nm}全力衝刺、俯身滑接，把落在身前的球撈了起來！`; }
  } else if (plan.leap) { amt = 2; tag = '貼牆跳接！'; line = `${nm}背貼著牆壁高高躍起，把球接了下來！`; }
  else if (y < 1.0) { tag = '低飛撲接！'; line = `${nm}往前俯衝，在球落地前一刻從草皮上撈起來！腳邊的接殺！`; }
  else if (lin && y > 1.7) { tag = '跳接！'; line = `${nm}高高跳起，把這顆強勁的平飛球截了下來！`; }
  else if (isOF && deep) { amt = 1.9; tag = '越肩接殺！'; line = `${nm}背對本壘全力奔跑，越過肩膀把深遠的飛球接住了！`; }
  else { tag = '精彩守備！'; line = `${nm}飛身撲接，漂亮的五星守備！`; }
  PL.greatTag = tag;
  toast(tag, '#fff27a', '#ff3a1a'); flowSfx('cheer', amt + .4); crowdCheer(amt - .3); flashScreen(.22);
  say(`<em>${line}</em>`);
  adjustMood(curBatter(), -4); adjustMood(curPitcher(), 4); if (G.log) G.log.push('精彩守備'); adjustMood(f.pl, 5); if (f.pl.slump) { f.pl.slump *= .6; applySlump(f.pl); }      // 美技讓野手信心大增
  if (rob) setHitResult(plan.weakHR ? '沒打扎實的全壘打被攔下！' : '被外野手跳起來把全壘打抓走！');
}
/* ---------------- 擊球資訊面板（擊球點／仰角／初速／旋轉／運氣） ---------------- */
let _hitT = 0;
function showHitInfo(res, pl) {
  const el = $('hitInfo'); if (!el) return; const q = res.Q, bp = res.bp !== undefined ? res.bp : (res.s || 0), sxx = clamp(125 - bp * 62, 18, 188);
  const qtxt = res.bunt ? (res.sneak ? '奇襲短打！' : '短打') : q > .85 ? '甜蜜點！！' : q > .65 ? '擊球紮實' : q > .4 ? '普通' : q > .2 ? '打得不太好' : '擦到球';
  const tm = res.bunt ? '' : (res.s < -.4 ? '時機偏早・' : res.s > .4 ? '時機偏晚・' : '時機剛好・'), zl = { handle: '握把・被壓制', near: '靠近握把', sweet: '棒子甜蜜點', tip: '偏球頭', end: '球棒最前端' }[res.cz || (Math.abs(bp) < .3 ? 'sweet' : bp < 0 ? 'tip' : 'near')], io = (res.inside || 0) > .35 ? '內角・' : (res.inside || 0) < -.35 ? '外角・' : '', loc = res.bunt ? '' : io + tm + zl;
  const col = q > .85 ? '#7dff7d' : q > .6 ? '#ffe14a' : q > .35 ? '#ffb060' : '#ff7a6a';
  const v = res.v || 0, hz = res.hz || 0, dot = { x: 32 + clamp(hz, -1, 1) * 17, y: 32 + clamp(v, -1, 1) * 17 };
  const a = clamp(res.ang, -26, 78) * Math.PI / 180, ax = 8 + 46 * Math.cos(a), ay = 54 - 46 * Math.sin(a);
  const th = res.th, dirTxt = Math.abs(th) < 6 ? '中間' : (th < 0 ? '左' : '右') + Math.round(Math.abs(th)) + '°';
  const spinTxt = Math.abs(res.spinB || 0) < .25 ? '' : (res.spinB > 0 ? '後旋' : '前旋'), lk = res.luck || 0, luckTxt = Math.abs(lk) < .6 ? '' : lk > 0 ? ' 🍀' : ' ☁';
  const d = pl && pl.land ? `・約${Math.round(pl.land.d)}m` : '';
  const sm = pl && pl.sim, tg = []; if (res.broken) tg.push('斷棒'); if (res.tip) tg.push('擦棒高飛'); if (sm) { if (sm.hug) tg.push('貼線滾地'); if (sm.kicked) tg.push('滾出界外'); if (sm.chop) tg.push('高彈跳'); if (sm.bumps) tg.push('不規則滾地'); if (sm.bagHit) tg.push('碰到壘包'); if (sm.wallTop) tg.push('擦牆頭'); else if (sm.bad.some(e => e.type === 'pop' || e.type === 'die' || e.type === 'side')) tg.push('怪彈跳'); }
  const tagTxt = tg.length ? ' <b style="color:#ffd35a">' + tg.join('・') + '</b>' : '';
  el.innerHTML = `<div class="hq" style="color:${col}">${qtxt}<small> ${loc}</small></div>
  <svg viewBox="0 0 200 26" class="hbar"><path d="M8 11 H62 L110 6 Q190 3 196 13 Q190 23 110 20 L62 15 H8 Z" fill="#c89a5a" stroke="#fff" stroke-width="1.5"/><rect x="104" y="4" width="44" height="18" rx="7" fill="#5f5" opacity=".4"/><circle cx="${sxx}" cy="13" r="5.5" fill="#fff" stroke="${col}" stroke-width="3"/></svg>
  <div class="hrow"><svg viewBox="0 0 64 64" class="hb"><circle cx="32" cy="32" r="24" fill="#f4f4f4" stroke="#999" stroke-width="2"/><circle cx="${dot.x}" cy="${dot.y}" r="6" fill="${col}" stroke="#000" stroke-width="1.5"/></svg>
  <svg viewBox="0 0 64 64" class="hb"><line x1="4" y1="56" x2="62" y2="56" stroke="#7a7" stroke-width="2"/><line x1="8" y1="56" x2="${ax}" y2="${ay}" stroke="${col}" stroke-width="3" stroke-linecap="round"/><circle cx="${ax}" cy="${ay}" r="3.5" fill="#fff"/></svg>
  <div class="ha">仰角 ${Math.round(res.ang)}°<small>${Math.round(res.ev * 3.6)}km/h・${dirTxt}</small></div></div>
  "<div class="hs">${spinTxt}${tagTxt}<span id="hitRes" class="hres"></span></div>`;
  el.classList.remove('hide'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  const my = ++_hitT; el._my = my;
  clearTimeout(el._ht); el._ht = setTimeout(() => { if (my === _hitT) el.classList.add('hide'); }, 3200);      // 擊球資訊只停留約 3 秒（之前會一路顯示到整個守備流程結束）
}
function setHitResult(txt) { const e = $('hitRes'); if (e) { e.innerHTML = ' ' + txt; const el = $('hitInfo'); if (el && !el.classList.contains('hide')) { const my = _hitT; clearTimeout(el._ht); el._ht = setTimeout(() => { if (my === _hitT) el.classList.add('hide'); }, 2200); } } }      // 結果文字出現後再多留約 2 秒
function hideHitInfo(delay) { const el = $('hitInfo'); if (!el) return; const my = _hitT; if (!delay) { clearTimeout(el._ht); el.classList.add('hide'); return; } setTimeout(() => { if (my === _hitT) el.classList.add('hide'); }, delay); }
/* ---------------- CPU 教練：依表現換人 ---------------- */
function perfBad(b) { const s = b.st; return (s.ab >= 2 && s.h === 0 && (s.k >= 2 || moodOf(b) < 38)) || moodOf(b) < 24; }
function aiCoachBatter() {
  const side = G.half; if (G.human === side || vsOn() || !lvl().learn || G.over) return false; const t = battingTeam(); if (!t.bench || !t.bench.length) return false;
  const b = curBatter(); if (b.slot === undefined || b.isPitcherBat || G.inning < 3) return false; if (!perfBad(b)) return false;
  const c = t.bench.filter(x => !x.out && fitPenalty(x.nat, b.pos) <= .13 && (b.pos !== 'C' || x.nat === 'C') && strengthOf(x) + moodOf(x) * .1 > strengthOf(b) + moodOf(b) * .1 + 1).sort((a, z) => (strengthOf(z) + moodOf(z) * .1) - (strengthOf(a) + moodOf(a) * .1));
  if (!c[0] || Math.random() > .75) return false;
  const old = b, s2 = subInto(side, old, c[0]); if (!s2) return false;
  say(`${sideName(side)}教練見 <em>${old.name}</em> 狀況不佳，換上 <em>${s2.name}</em> 代打！`); toast('代打', '#fff', '#39f'); G.log.push('教練換人'); return true;
}
function aiCoachFielders() {            // 防守端：失誤／低迷的野手，局數後段換上守備較好的板凳
  const side = 1 - G.half; if (G.human === side || vsOn() || !lvl().learn || G.over || G.inning < Math.max(3, G.innings - 3)) return;
  const t = G.teams[side]; if (!t.bench || !t.bench.length) return;
  for (const f of t.lineup.slice()) {
    if (f.out || f.pos === 'DH' || f.pos === 'P' || !f.pos) continue; const errs = (G.errPl && G.errPl[f.name]) || 0;
    if (errs < 1 && !(moodOf(f) < 24 && f.st.ab >= 2 && f.st.h === 0)) continue;
    const c = t.bench.filter(x => !x.out && fitPenalty(x.nat, f.pos) <= .07 && x.fld > f.fld + 4).sort((a, z) => z.fld - a.fld)[0];
    if (!c) continue; const s2 = subInto(side, f, c); if (s2) { say(`${sideName(side)}教練換人：${f.pos} ${f.name} 下場，由 <em>${s2.name}</em> 接替守備`); G.log.push('守備換人'); break; }
  }
}

/* ---------------- 投手投球前的準備動作（每次隨機） ---------------- */
function prepAction() {
  const P = E.F.P; if (!P || PL || G.phase !== 'pre') return 0; const h = (curPitcher().hand === 'R') ? 1 : -1, r = Math.random(), run = G.on.findIndex(x => x && x.state === 'on');
  faceRig(P.rig, 0, 4);
  if (P.rig.anim && P.rig.anim.name !== 'stretch') return 0;
  const play = (name, dur, opt) => { P.rig.anim = { name, t: 0, dur, opt: Object.assign({ hand: h }, opt || {}) }; return dur; };
  const r2 = Math.random(); if (r2 < .1) return play('capadj', 1.0); if (r2 < .18) return play('wipe', 1.0); if (r2 < .26) return play('glovepound', 1.0);      // 整理帽子／擦汗／敲手套
  if (r < .22) return play('nod', .8 + Math.random() * .5, { n: Math.random() < .5 ? 2 : 3 });                  // 看暗號點頭
  if (r < .42) return play('armshake', .9 + Math.random() * .4);                                                  // 甩手臂
  if (r < .60) return play('legkick', .7 + Math.random() * .3, { leg: Math.random() < .7 ? 1 : -1 });            // 抬腳調整
  if (r < .78 && run >= 0) { const b = baseSpot(run + 1); faceRig(P.rig, b.x, b.z); P.rig.anim = null; const d = .45 + Math.random() * .5; after(d, () => { if (G.phase === 'pre' && E.F.P === P) faceRig(P.rig, 0, 4); }); flowSfx('pick', .2); return d; }   // 回頭看壘上跑者
  if (r < .9) { flowSfx('pick', .4); return play('catch', .35); }                                                 // 整理手套
  return play('stretch', .55 + Math.random() * .3);
}

