/* 26-weather.js — 天氣／風／暴雨／台灣特色天氣（原 script.js 第 6003-6419 行） */
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
  const human = G.human >= 0;
  $('rdTx').innerHTML = human ? '暴雨太大，場地已經不適合比賽！<br>等雨勢變小，或用<b>連點／空白鍵</b>讓教練出面激烈抗議，把<b>抗議值</b>衝滿就能繼續比賽。' : '暴雨太大，場地已經不適合比賽，等雨勢變小再繼續…';
  $('rdProt').classList.toggle('hide', !human); $('rdWait').style.width = '0%'; $('rdMeter').style.width = '0%'; $('rainDelay').classList.remove('hide');
  toast('主審宣布：暫停比賽', '#fff', '#3a6ad8'); flowSfx('whistle'); crowdCheer(.3);
  say(`<em>暴雨太大了！</em>主審宣布暫停比賽，等雨勢變小再繼續。${human ? '教練可以出面抗議（連點把抗議值衝滿）！' : ''}`);
}
function rdPress() {
  if (!RD.on || G.human < 0) return;
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
  const wob = Math.sin(performance.now() * .0011 + (G.windDir || 0)) * .25;                       // 細微起伏
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
const SKYN = { clear: { bg: 0x0b1838, fog: 0x1c2c58, fn: 150, ff: 420, hemi: .56, sun: .42, sc: 0xfff1d6, wall: 1.0, sp: [0, 95, 40], hc: 0xdfe8ff, hg: 0x4f8a55, fl: .26 },
  sunny: { bg: 0x0b1838, fog: 0x1c2c58, fn: 150, ff: 420, hemi: .56, sun: .42, sc: 0xfff1d6, wall: 1.0, sp: [0, 95, 40], hc: 0xdfe8ff, hg: 0x4f8a55, fl: .26 },
  overcast: { bg: 0x232b3c, fog: 0x38425e, fn: 120, ff: 340, hemi: .56, sun: .4, sc: 0xffe9cc, wall: 1.0, sp: [0, 95, 40], hc: 0xdfe6f5, hg: 0x4f8a55, fl: .26 },
  storm: { bg: 0x161b27, fog: 0x2a3346, fn: 80, ff: 260, hemi: .52, sun: .34, sc: 0xdfe6f5, wall: .92, sp: [0, 95, 40], hc: 0xc6d2ea, hg: 0x44704c, fl: .24 } };
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
  flood1.intensity = flood2.intensity = mix(base.fl, st.fl);
  if (ht > .01) { sun.intensity += .1 * ht; sun.color.lerp(_c2.set(0xffd89a), ht * .5); }                      // 悶熱：日照更強、偏暖
  if (hz > .01) { sun.intensity *= 1 - hz * .25; sun.color.lerp(_c2.set(0xffc58a), hz * .5); }                  // 霾：日光變淡、偏橘
  { const rb = G.rb || 0; if (rb > .01) { sun.color.lerp(_c2.set(0xffd9a0), rb * .6); sun.intensity += .16 * rb; hemi.intensity += .05 * rb; } }      // 彩虹時：暖色斜射光
  const w = mix(base.wall, st.wall); wallMat.color.setScalar(w); stand.material.color.setScalar(clamp(w * (nt ? .92 : .98), .4, 1.1));
  skyDome.material.color.copy(scene.fog.color).multiplyScalar(1.25); dark.material.color.set(nt ? 0x16301f : 0x23402a);
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
