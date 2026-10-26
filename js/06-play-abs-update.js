/* ===== 06-play-abs-update.js ｜ ABS 跑壘與全壘打判決／接殺／每幀 play 更新／玩家手動傳球 =====
   載入順序 6/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
'use strict';
/* =====================================================================
   ABS 擴充：跑壘 close play 判決＋全壘打（界外／場地規則二壘安打／全壘打）判決
   ===================================================================== */
const CLOSE_T = .16;      // 球與跑者到壘時間差在 0.16 秒內＝close play，主審可能誤判、雙方可挑戰
const TAGVALS = { out: { r: 0 }, safe: { r: 1 } }, HRVALS = { foul: { r: 0 }, grd: { r: 1 }, hr: { r: 2 } };
const BASE_NM = ['本壘', '一壘', '二壘', '三壘'];
let RPT = [], RPA = 0;
function rpAt(ms, fn) { const tok = G.judgeTok; RPT.push(setTimeout(() => { if (tok === G.judgeTok) fn(); }, ms)); }
function rpHide() { RPT.forEach(clearTimeout); RPT = []; if (RPA) cancelAnimationFrame(RPA); RPA = 0; const e = $('rp'); if (e) e.classList.add('hide'); }
/* 通用判決流程：誰被誤判不利？AI 會自己決定是否挑戰；玩家方有 4 秒決定是否挑戰；挑戰 → 回放 → 改判或維持原判 */
function absJudge(o) {
  const tok = G.judgeTok, A = G.absOn && G.mode === 'play' && !G.over;
  const rk = k => o.vals[k].r;
  const hurt = rk(o.truth) > rk(o.call) ? G.half : rk(o.truth) < rk(o.call) ? 1 - G.half : -1;      // 這個判決對誰不利（攻方想要更高的結果，守方想要更低的）
  const can = t => A && G.abs[t] > 0 && !G.coachOut[t] && (t === G.half ? rk(o.call) < o.max : rk(o.call) > 0);
  const hum = vsOn() ? ([G.half, 1 - G.half].find(can) ?? -1) : (G.career && G.role && !(humanBats() || humanPitches())) ? -1 : G.human;      // 生涯模式：玩家沒有上場（板凳／守備不輪到你）時，這隊的挑戰由電腦決定，不跳出需要你按的挑戰面板
  const finish = k => { if (tok !== G.judgeTok) return; rpHide(); G.freeze = false; o.apply(k); };
  const challenge = team => {
    G.freeze = true; G.absStat[team].ch++; flowSfx('whistle'); toast('ABS 挑戰！', '#aef', '#07c');
    say(`${sideName(team)}提出挑戰，${o.title}回放確認中…`);
    o.replay(() => {
      if (tok !== G.judgeTok) return;
      const over = o.truth !== o.call;
      if (over) { G.absStat[team].ok++; updateAbsHud(); toast('改判！', '#9fffb0', '#0a8'); flowSfx('cheer', 1); G.log.push('ABS改判'); say(`<em>ABS 回放確認：原判誤判！</em>改判為${o.label(o.truth)}，${sideName(team)}挑戰成功，次數保留！`); }
      else { G.abs[team]--; updateAbsHud(); toast('維持原判', '#ffe08a', '#c60'); flowSfx('out'); say(`ABS 回放確認原判正確，維持${o.label(o.call)}。${sideName(team)}剩 ${G.abs[team]} 次挑戰`); }
      rpAt(over ? 1500 : 1700, () => finish(o.truth));
    });
  };
  const aiWants = t => {
    if (vsOn() || t === hum || !can(t)) return false; const L = lvl(), wronged = hurt === t;
    let lev = 1; try { const d = Math.abs(G.score[0] - G.score[1]); if (G.inning >= 7) lev += .3; if (d <= 2) lev += .2; if (G.on[1] || G.on[2]) lev += .15; if (G.strikes === 2 || G.balls === 3) lev += .15; } catch (e) { }      // 教練會挑時機：後段、分差小、得點圈有人、關鍵球數時更願意挑戰
    const scarce = G.abs[t] <= 1 && G.inning < 7 && lev < 1.4 ? .6 : 1;      // 只剩最後一次、比賽還早且不關鍵 → 先留著
    const p = Math.min(.93, (wronged ? clamp(.55 + L.learn * .15, .4, .85) * lev : .04) * scarce * (L.learn > 0 ? 1 : .75));
    return Math.random() < p;
  };
  const ai = [G.half, 1 - G.half].filter(aiWants);
  if (ai.length) { const team = ai.includes(hurt) ? hurt : ai[0]; G.freeze = true; say(`${sideName(team)}要求挑戰${o.title}`); rpAt(550, () => challenge(team)); return; }
  if (hum >= 0 && can(hum)) {
    G.freeze = true; say(`主審判定：<em>${o.label(o.call)}</em>。要挑戰嗎？<em>(C)</em>`);
    EV.abs = { t: 4, max: 4, team: hum, onGo: () => { if (tok === G.judgeTok) challenge(hum); }, onSkip: () => finish(o.call) };
    $('absTitle').textContent = o.panelTitle; $('absGo').textContent = 'ABS 挑戰 [C]'; $('absRem').textContent = `${o.label(o.call)}・剩${G.abs[hum]}`; $('absBarI').style.width = '100%'; absPanelOn(hum); return;
  }
  o.apply(o.call);
}
/* ---------------- 跑壘 close play ---------------- */
function tagCall(f, r, how) {          // 球先到、跑者還沒踩到壘（原本直接出局）→ 看時間差是否為 close play
  const rem = Math.max(0, (r.dir > 0 ? 1 - r.s - (r.sliding ? (r.slideReach || 0) : 0) : r.s)) * BASE_LEN / Math.max(1, r.spd);
  tagReview(f, r, how, rem, true);
}
function safeCheck(f, b4) {            // 跑者剛踩到壘、球才到：差距極小時主審可能誤判出局
  if (b4 >= 4) return; const r = G.on[b4 - 1];
  if (!r || r.state !== 'on' || r.reviewed || r.arrT == null) return;
  const dt = (G.rclk || 0) - r.arrT; if (dt < 0 || dt > CLOSE_T) return;
  tagReview(f, r, 'tag', -dt, false);
}
function tagReview(f, r, how, m, truthOut) {      // m：球比跑者早到的秒數（正＝球先到→出局；負＝跑者先到→安全）
  if (r.reviewed || r.ruledSafe || !G.absOn || Math.abs(m) > CLOSE_T || G.over) { if (truthOut) putOut(r, how); return; }
  r.reviewed = true;
  const bp = clamp((.42 - Math.abs(m) * 1.45) * (G.umpSkill || 1), 0, .46), blown = Math.random() < bp;
  const truth = truthOut ? 'out' : 'safe', call = (truthOut !== blown) ? 'out' : 'safe';
  const bs = r.state === 'on' ? r.from : (r.dir > 0 ? r.to : r.from), bn = BASE_NM[bs % 4];
  const info = { runner: r.pl.name, base: bn, fielder: `${POS_FULL[f.pos]}${f.pl.name}`, m, truthOut, callOut: call === 'out' };
  absJudge({
    kind: 'tag', truth, call, vals: TAGVALS, max: 1, title: '跑壘判決', panelTitle: '🦅 跑壘判決',
    label: k => k === 'out' ? '出局 OUT' : '安全 SAFE',
    replay: cb => showRaceReplay(info, cb),
    apply: k => {
      if (k === 'out') { if (r.state !== 'out' && r.state !== 'home') { tagAnim(f); putOut(r, how); } }
      else { r.ruledSafe = true; toast('安全 SAFE', '#fff', '#2a8'); say(`<em>${r.pl.name}</em>判定安全！`); }
    }
  });
}
function showRaceReplay(i, cb) {
  const e = $('rp'); e.classList.remove('hide'); const ms = Math.round(Math.abs(i.m) * 1000);
  const dB = 1.5, dR = clamp(dB + i.m * 5, .7, 2.4);      // 為了看得清楚，時間差放大 5 倍呈現
  e.innerHTML = `<div class="rp-t">🦅 ABS 跑壘回放</div><div class="rp-s">${i.runner} → ${i.base}（${i.fielder}接球）</div>
    <div class="rp-lane"><span>⚾ 傳球</span><div class="rp-tr"><i class="rp-dot rp-ball" id="rpB" style="transition:left ${dB}s linear"></i><b>${i.base}</b></div></div>
    <div class="rp-lane"><span>🏃 跑者</span><div class="rp-tr"><i class="rp-dot rp-run" id="rpR" style="transition:left ${dR}s linear"></i><b>${i.base}</b></div></div>
    <div class="rp-r" id="rpRes"></div><div class="rp-d" id="rpD" style="opacity:0"></div>`;
  void e.offsetWidth;
  rpAt(70, () => { $('rpB').style.left = 'calc(100% - 16px)'; $('rpR').style.left = 'calc(100% - 16px)'; });
  const T = Math.max(dB, dR) * 1000 + 300;
  rpAt(T, () => {
    const r = $('rpRes'), d = $('rpD'); if (!r || !d) return;
    r.textContent = i.truthOut ? 'OUT 出局' : 'SAFE 安全'; r.style.color = i.truthOut ? '#f66' : '#6f6';
    d.innerHTML = `${i.truthOut ? '球比跑者早到' : '跑者比球早到'} <b>${ms} 毫秒</b><br>主審原判：${i.callOut ? '出局' : '安全'}${i.callOut !== i.truthOut ? ' → <b>誤判</b>' : '（正確）'}`; d.style.opacity = 1;
  });
  rpAt(T + 1200, cb);
}
/* ---------------- 全壘打判決（界外／場地規則二壘安打／全壘打） ---------------- */
function absReviewSetup(sim, cl, plan) {
  const ov = sim.over; if (!G.absOn || !ov || G.over) return null;
  if (!cl.fair && plan.kind === 'catch') return null;
  const wr = wallRadius(ov.phi), fm = wr * Math.sin((45 - Math.abs(ov.phi)) * Math.PI / 180);      // 越牆點離全壘打柱的距離（正＝界內）
  const dAir = (sim.first ? sim.first.t : 99) - ov.t;                                           // 正＝越牆時還在空中；負＝先落地才彈出牆
  const truth = !cl.fair ? 'foul' : cl.hr ? 'hr' : 'grd';
  let mode, p, alt;
  if (Math.abs(fm) < 2.4) { mode = 'pole'; p = clamp(.42 - Math.abs(fm) * .19, 0, .42); alt = truth === 'foul' ? (dAir >= 0 ? 'hr' : 'grd') : 'foul'; }
  else if (cl.fair && Math.abs(dAir) < .35) { mode = 'bounce'; p = clamp(.34 - Math.abs(dAir), 0, .34); alt = truth === 'hr' ? 'grd' : 'hr'; }
  else return null;
  const blown = Math.random() < p * (G.umpSkill || 1);
  return { truth, call: blown ? alt : truth, mode, fm, dAir, tv: Math.max(.05, ov.t - .03), blown };
}
function absReviewLaunch(rv, plan) {         // 球飛出去後先「懸而未決」：跑者與打者原地等候，球越牆瞬間才宣判
  PL.review = rv; PL.plan = plan; PL.foul = false; PL.fair = true;
  if (CAMC.mode === 'bat') { CAMC.mode = 'batfollow'; after(.5, () => { if (CAMC.mode === 'batfollow') CAMC.mode = 'play'; }); } else CAMC.mode = 'play';
  if (rv.truth === 'foul') { if (plan.kind === 'catch') assignRoles(plan); else for (const f of Object.values(E.F)) { if (plan.f === f) { f.tx = plan.x; f.tz = plan.z; f.sp = fspeed(f) * 1.2; f.wait = plan.react || .3; } } }
  else assignRoles(plan);
  say(SAYX.contact(PL));
}
function startHRReview(pl) {
  const rv = pl.review; rv.started = true;
  absJudge({
    kind: 'hr', truth: rv.truth, call: rv.call, vals: HRVALS, max: 2, title: '全壘打判決', panelTitle: '🦅 全壘打判決',
    label: k => k === 'hr' ? '全壘打' : k === 'grd' ? '場地規則二壘安打' : '界外球',
    replay: cb => showFieldReplay(pl, rv, cb), apply: k => finalizeHR(pl, k)
  });
}
function finalizeHR(pl, key) {
  if (PL !== pl) return; const rv = pl.review; rv.done = true; rv.final = key;
  const cl = pl.cl, sim = pl.sim;
  cl.fair = key !== 'foul'; cl.hr = key === 'hr'; cl.grd = key === 'grd'; pl.fair = cl.fair; pl.foul = key === 'foul'; pl.grd = key === 'grd';
  let plan = pl.plan;
  if (key !== rv.truth) {
    for (let i = 0; i < 4; i++) { plan = planFielding(sim, cl, pl.foul, pl.res); if (!plan.robHR) break; }
    if (plan.robHR) plan = { kind: 'hr', grd: false, f: plan.f, x: plan.x, z: plan.z, t: sim.over.t, air: true, over: sim.over, react: .3 };
    pl.plan = plan;
  }
  if (key === 'foul') {
    recallRunners();
    if (plan.kind === 'catch') assignRoles(plan); else for (const f of Object.values(E.F)) { if (plan.f === f) { f.tx = plan.x; f.tz = plan.z; f.sp = fspeed(f) * 1.2; f.wait = plan.react || .3; } }
    flowOnContact(pl); return;
  }
  plan.kind = 'hr'; plan.grd = key === 'grd';
  launchFair(plan, cl, () => { if (key === 'hr') hrCelebrate(pl); });
}
function hrCelebrate(pl) {
  if (PL !== pl) return; pl.hrN = hrRunCount(); const bat0 = curBatter();
  say(SAYX.hr(bat0, pl) + `（飛行 ${Math.round(pl.dist)} m）`); colorSay(COLOR.hr(bat0, pl), 2.6); showHrBanner(pl.hrN || 1, bat0, pl); flowSfx('cheer', 2.6); flowSfx('hrfan', pl.hrN || 1); hrTrotStart(pl); crowdCheer(1.8); flashScreen(.5); crowdCheer(1); fireworkShow(clamp(15 + (pl.dist - 80) * .1, 15, 19), clamp((pl.dist - 70) / 30, .7, 1.6)); setHitResult(Math.round(pl.dist) + 'm 全壘打');
  hrExtraFx(pl.hrN || 1);
}
function hrExtraFx(n) {      // 全壘打額外特效：連閃、鏡頭震動、開場煙火齊發、彩帶雨
  try {
    [140, 300, 520].forEach((t, i) => setTimeout(() => flashScreen(.38 - i * .1), t));
    CAMC.shake = Math.max(CAMC.shake || 0, .32 + Math.min(n, 4) * .04);
    for (let j = 0; j < 4 + n; j++) after(.05 + j * .16, () => fwLaunch((Math.random() - .5) * 90, -70 - Math.random() * 40, 28 + Math.random() * 24, ['peony', 'ring', 'star', 'double'][j % 4], FW_COLS[(j * 3) % FW_COLS.length], '#ffd34d', 1 + Math.random() * .4, .7 + Math.random() * .2));
    const cols = ['#ffd34d', '#ff4d4d', '#4dd2ff', '#7dff7d', '#ff7de9', '#ffffff'], N = 70 + n * 25;
    for (let i = 0; i < N; i++) after(Math.random() * 1.6, () => fwSpawn((Math.random() - .5) * 70, 26 + Math.random() * 10, -20 - Math.random() * 60, (Math.random() - .5) * 3, -1 - Math.random() * 2, (Math.random() - .5) * 3, cols[i % cols.length], 3 + Math.random() * 1.5, .5 + Math.random() * .3, 2.2, 1.3));
    crowdCheer(2.2);
  } catch (e) { console.error(e); }
}
function showFieldReplay(pl, rv, cb) {
  const e = $('rp'); e.classList.remove('hide'); const sim = pl.sim, ov = sim.over, S = sim.S;
  const R = wallRadius(0), VX = R * .74 + 8, X0 = -VX, Y0 = -(R + 8), W = VX * 2, H = R + 16;
  const pts = []; for (let i = 0; i < S.length; i += 2) { const s = S[i]; if (s.t > ov.t + .1) break; pts.push([s.x, s.z]); } pts.push([ov.x, ov.z]);
  const fp = []; for (let a = -48; a <= 48; a += 4) { const r = wallRadius(a); fp.push((r * Math.sin(a * Math.PI / 180)).toFixed(1) + ',' + (-r * Math.cos(a * Math.PI / 180)).toFixed(1)); }
  const fx = a => { const r = wallRadius(a); return [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)]; }, pL = fx(-45), pR = fx(45);
  const lab = { hr: 'HOME RUN 全壘打', grd: '場地規則二壘安打', foul: 'FOUL 界外球' }, col = { hr: '#6f6', grd: '#6cf', foul: '#f66' };
  const side = ov.x > 0 ? '右' : '左';
  const bounce = sim.first && sim.first.t < ov.t ? sim.first : null;
  e.innerHTML = `<div class="rp-t">🦅 ABS 全壘打回放</div>
    <svg viewBox="${X0.toFixed(1)} ${Y0.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" width="270" height="${Math.round(270 * H / W)}" style="display:block;margin:0 auto;background:#06121e;border-radius:8px">
      <polygon points="0,0 ${fp.join(' ')}" fill="#14502a"/><polyline points="${fp.join(' ')}" fill="none" stroke="#fff" stroke-width="1.2"/>
      <line x1="0" y1="0" x2="${pL[0].toFixed(1)}" y2="${pL[1].toFixed(1)}" stroke="#fff" stroke-width=".8"/><line x1="0" y1="0" x2="${pR[0].toFixed(1)}" y2="${pR[1].toFixed(1)}" stroke="#fff" stroke-width=".8"/>
      <circle cx="${pL[0].toFixed(1)}" cy="${pL[1].toFixed(1)}" r="2.4" fill="#ffd21a"/><circle cx="${pR[0].toFixed(1)}" cy="${pR[1].toFixed(1)}" r="2.4" fill="#ffd21a"/>
      <polyline id="rpPath" points="" fill="none" stroke="#7df" stroke-width="1.1"/>
      <g id="rpMk" style="opacity:0">${bounce ? `<circle cx="${bounce.x.toFixed(1)}" cy="${bounce.z.toFixed(1)}" r="2.6" fill="#f90"/>` : ''}<circle cx="${ov.x.toFixed(1)}" cy="${ov.z.toFixed(1)}" r="3.4" fill="none" stroke="${col[rv.truth]}" stroke-width="1.5"/></g>
      <circle id="rpBl" cx="0" cy="0" r="2.4" fill="#fff"/></svg>
    <div class="rp-r" id="rpRes"></div><div class="rp-d" id="rpD" style="opacity:0"></div>`;
  const path = $('rpPath'), bl = $('rpBl'), t0 = performance.now(), DUR = 2300, tok = G.judgeTok;
  const loop = now => {
    if (tok !== G.judgeTok) return; const u = clamp((now - t0) / DUR, 0, 1), k = Math.floor(u * (pts.length - 1));
    path.setAttribute('points', pts.slice(0, k + 1).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')); bl.setAttribute('cx', pts[k][0].toFixed(1)); bl.setAttribute('cy', pts[k][1].toFixed(1));
    if (u < 1) RPA = requestAnimationFrame(loop);
  };
  RPA = requestAnimationFrame(loop);
  rpAt(DUR + 250, () => {
    const mk = $('rpMk'), r = $('rpRes'), d = $('rpD'); if (!mk || !r || !d) return; mk.style.opacity = 1;
    r.textContent = lab[rv.truth]; r.style.color = col[rv.truth];
    const det = rv.mode === 'pole' ? `球越過全壘打牆處在<b>${rv.fm >= 0 ? '界內' : '界外'} ${Math.abs(rv.fm).toFixed(2)} m</b>（${side}外野全壘打柱）`
      : (rv.dAir >= 0 ? `球越牆時<b>仍在空中</b>（落地前 ${rv.dAir.toFixed(2)} 秒越牆）` : `球<b>先落地</b>（越牆前 ${(-rv.dAir).toFixed(2)} 秒彈地）再彈出牆外`);
    d.innerHTML = `${det}<br>主審原判：${rv.call === 'hr' ? '全壘打' : rv.call === 'grd' ? '場地規則二壘安打' : '界外'}${rv.call !== rv.truth ? ' → <b>誤判</b>' : '（正確）'}`; d.style.opacity = 1;
  });
  rpAt(DUR + 1500, cb);
}
function tagAnim(f) { f.rig.anim = { name: 'catch', t: 0, dur: .4, opt: {} }; flowSfx('mitt'); }

/* ---------------- fielded ---------------- */
function onFielded(f) {
  const plan = PL.plan;
  if (plan.robHR && !PL.cleanField && Math.random() < robDropP(f, plan)) { dropBall(f, false, true); return; }      // 跳起來攔下全壘打，卻在落地／撞牆時沒抓穩
  if (!PL.foul && !PL.cleanField && !plan.robHR && plan.kind !== 'hr') { if (PL.collide || (plan.air && Math.random() < airDropP(f, plan))) { dropBall(f, !!PL.collide); return; } }      // 相撞或漏接：球沒接住
  PL.state = 'held'; PL.holder = f; f.hasBall = true; f.chaser = false; f.sp = 4;
  const ground = !plan.air; f.tx = f.x; f.tz = f.z;
  f.rig.anim = ground && !plan.dive ? { name: 'pickup', t: 0, dur: .3, opt: { hold: false } } : { name: plan.dive ? 'dive' : 'catch', t: 0, dur: plan.dive ? .6 : .35, opt: { hold: false } };
  if (ground) { const pk = PL.bunt && !plan.dive ? clamp(.22 - ((f.pl.fld || 55) - 55) * .0015, .13, .28) : .16; startPick(plan.dive ? .3 : pk); f.hold = plan.dive ? .3 : pk; } else f.hold = .08;
  const p = PL.sim.S[Math.min(PL.sim.S.length - 1, Math.floor(plan.t * 60))];
  if (plan.great) greatPlay(f, plan);
  if (plan.air && plan.kind !== 'hr') {
    flowSfx('mitt');
    if (PL.foul) { PL.foulOut = true; G.outs++; PL.outsMade++; PL.caught = true; curPitcher().outs++; flowOnCatch(f, PL); if (G.outs >= 3) { after(.9, () => endPlay()); return; } recallRunners(); after(.12, () => holderThink(f)); after(.9, () => { if (!E.runners.some(r => r.state === 'run')) endPlay(); }); return; }
    PL.caught = true; if (PL.br) { putOut(PL.br, 'fly'); }
    flowOnCatch(f, PL);
    if (G.outs >= 3) { after(1.0, () => endPlay()); return; }
    // tag ups
    for (const r of E.runners.filter(r => r.state === 'on' && r.from >= 1).sort((a, b) => b.from - a.from)) tagUpThink(r, f);
    after(.12, () => holderThink(f));
    return;
  }
  // fielded on the ground / one-hop
  flowSfx('mitt');
  const fe = clamp(0.030 - ((f.pl.fld || 55) * .6 + (f.pl.cat == null ? (f.pl.fld || 55) : f.pl.cat) * .4) * .00027, .006, .03) * (PL.kind === 'gb' ? 1.15 : 1) * (plan.dive ? 1.3 : 1) * (1 + clamp(-(PL.luck || 0) * .25, -.4, .8)) * (1 + rainK() * 1.6) * chaosK(1 - G.half);
  let bh = PL.kind === 'gb' && !plan.dive && Math.abs(PL.luck || 0) > 1.3 - rainK() * .4 && Math.random() < .4;      // 不規則彈跳（怪彈跳）
  let bhHow = 'hop';
  if (!bh && PL.sim && PL.sim.bad && PL.sim.bad.length && !plan.dive) {      // 球在接球前一刻剛好踩到坑洞／小石子／壘包：手套前突然變向、變高、變低
    let m = 0; for (const e of PL.sim.bad) { if (e.type === 'chop') continue; const dtb = PL.t - e.t; if (dtb > -.05 && dtb < .5 && dist2(f.x, f.z, e.x, e.z) < 5.5) m = Math.max(m, e.sev * (e.type === 'bump' ? .55 : 1)); }
    if (m > 0 && Math.random() < m * clamp(.78 - (f.pl.fld || 55) * .004, .3, .75)) bh = true;
  }
  if (!bh && f.pos === 'P' && PL.kind === 'gb' && PL.res && PL.res.ev > 36 && Math.random() < .12) { bh = true; bhHow = 'deflect'; }      // 投手被強襲球打到手套／身體彈開
  if ((Math.random() < fe || bh) && !PL.cleanField) {
    if (bh) PL.badHop = true; else { PL.err = true; G.errs[1 - G.half]++; if (G.errPl) G.errPl[f.pl.name] = (G.errPl[f.pl.name] || 0) + 1; }
    PL.state = 'loose'; f.hasBall = false; let a = Math.random() * TAU, dd = 4.5;
    if (bh && PL.sim) { const i0 = Math.min(PL.sim.S.length - 4, Math.max(0, Math.floor(PL.t * 60))), p1 = PL.sim.S[i0], p2 = PL.sim.S[i0 + 3]; if (p1 && p2 && Math.hypot(p2.x - p1.x, p2.z - p1.z) > .02) { a = Math.atan2(p2.z - p1.z, p2.x - p1.x) + gauss() * (bhHow === 'deflect' ? .9 : .5); dd = 3.5 + Math.random() * 5; } }      // 彈開的球順著原本方向竄出去
    PL.loose = { x: f.x + Math.cos(a) * dd, z: f.z + Math.sin(a) * dd, t: 0 }; PL.looseF = f; f.tx = PL.loose.x; f.tz = PL.loose.z; f.sp = fspeed(f); f.rig.anim = { name: 'down', t: 0, dur: .7, opt: {} };
    flowOnError(f, bh ? bhHow : 'field'); return;
  }
  if (plan.failDive) { }
  flowOnField(f, PL);
  // 接到滾地球後的整備時間（腳步調整／手套換手／站穩）：跑位越遠、球太慢或太強、守備越差越久；偶爾手套不穩
  let gx = 0;
  if (!PL.bunt) {
    const isOFg = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF', fd0 = formationPos(f.pos), mv = dist2(f.x, f.z, fd0.x, fd0.z), ev0 = (PL.res && PL.res.ev) || 25, fl0 = f.pl.fld || 55;
    gx = 0.08 + clamp((mv - 2) * .045, 0, .32) + clamp((22 - ev0) * .02, 0, .22) + clamp((ev0 - 34) * .015, 0, .12) - clamp((fl0 - 55) * .004, -.12, .12) + (!isOFg && Math.random() < .07 + (1 - fl0 / 100) * .10 ? .12 + Math.random() * .28 : 0) + (plan.dive ? .12 : 0);
    gx = Math.max(.05, gx) * (isOFg ? .5 : 1); f.hold = (f.hold || 0) + gx;
  }
  after((plan.dive ? .3 : (PL.bunt ? .1 : .08)) + gx, () => { if (PL && PL.state === 'held' && PL.holder === f) holderThink(f); });
}
function tagUpThink(r, f) {         // 高飛犧牲打／接殺後跑者判斷是否離壘進壘：看外野手到下一壘的傳球時間 vs 自己的跑壘時間
  if (G.outs >= 3 || r.state !== 'on') return;        // G.outs 已含打者的接殺出局：只要原本不是兩出局就能進壘
  const nb = r.from + 1; if (nb < 4 && !baseFree(nb, r)) return;
  const spot = baseSpot(nb), dist = dist2(f.x, f.z, spot.x, spot.z), relay = dist > 48;
  const tBall = .5 + dist / armSpeed(f.pl) + (relay ? .5 : 0) + (r.from === 3 ? .1 : .05);
  const tRun = BASE_LEN / r.spd + .1, margin = tBall - tRun;
  const agg = ((r.pl.agg || 50) - 50) * .006, read = gauss() * (G.lv >= 2 ? .16 : .26);
  const need = (r.from === 3 ? -.28 : .1) - agg;
  let go = margin + read > need;
  if (!go && margin + read > need - .95) {              // 距離其實不夠遠卻賭一把：之後由回傳速度決定出局或安全
    const p = clamp(.12 + ((r.pl.agg || 50) - 50) * .005 + (r.from === 3 && lateGame() && Math.abs(runDiff(G.half)) <= 1 ? .3 : 0), .02, .5);
    go = Math.random() < p;
  }
  if (go) { r.goal = nb; r.state = 'run'; r.to = nb; r.dir = 1; r.s = 0; r.lead = 0; r.tag = true; r.isForce = false; G.on[r.from - 1] = null; r.pre = .1 + Math.abs(gauss()) * .04; }
}

/* ---------------- per-frame play update ---------------- */
/* 野手追球的「判斷落點」：
   以前球一打出，負責接球的野手立刻知道球「最終落在哪」，筆直衝過去、早早站在那裡等球，看起來像先知。
   現在：起步反應後先朝「目前估計的落點」跑，隨球飛行逐漸修正（高飛／強勁平飛球誤差大、守備差誤差更大；滾地球誤差小）；
   時間充裕時用「剛好趕到」的步調跑，不會提早很久站著；時間吃緊（誤差修正不及）時立刻改成全力衝向真正落點，所以不影響原本的接殺／處理判定。 */
function chaosK(team) {      // 天時地利人和：當天狀態 × 該隊場面氣氛（失誤連鎖）× 單次隨機波動；數值越高，越容易發生不可控的小狀況（強者也不例外，只是基礎機率較低）
  const d = G.day || 1, t = (G.tilt && G.tilt[team == null ? 1 - G.half : team]) || 0;
  return clamp(d * (1 + t * .7) * Math.exp(gauss() * .22) * stormMul(), .45, 2.6 + stormK() * 1.6);      // 暴雨：所有失誤與突發狀況更頻繁
}
function bumpTilt(team, v) { if (!G.tilt) G.tilt = [0, 0]; G.tilt[team] = clamp(G.tilt[team] + v, 0, 1.2); }
function dropBall(f, coll, soft) {      // 接球失誤／相撞掉球：球掉在野手附近，變成界內滾動球（soft＝美技嘗試沒抓穩：記安打、不記失誤）
  if (!soft) { PL.err = true; G.errs[1 - G.half]++; if (G.errPl) G.errPl[f.pl.name] = (G.errPl[f.pl.name] || 0) + 1; }
  PL.state = 'loose'; f.hasBall = false; f.chaser = false; const a = Math.random() * TAU, dd = coll ? 2.2 : 1.5 + Math.random() * 2.5;
  PL.loose = { x: f.x + Math.cos(a) * dd, z: f.z + Math.sin(a) * dd, t: 0 }; PL.looseF = f; f.tx = PL.loose.x; f.tz = PL.loose.z; f.sp = fspeed(f);
  f.rig.anim = { name: 'down', t: 0, dur: coll ? 1.3 : .7, opt: {} }; if (coll) f.wait = Math.max(f.wait || 0, 1.0);
  if (soft) { try { errFallout(f, 'robdrop'); } catch (e) { } bumpTilt(1 - G.half, .05); toast('沒抓穩！', '#fff', '#a5f'); say(`<em>${POS_FULL[f.pos]}${f.pl.name}跳起來碰到球了，但落地時沒能抓穩，球掉了出來！</em>`, 3200); }
  else flowOnError(f, 'field');
}
function airDropP(f, plan) {      // 高飛球／平飛球漏接機率：守備差、風、雨、沖天炮（難判斷）、飛撲、球的不規則性
  const fl = (f.pl.fld || 55) * .6 + (f.pl.cat == null ? (f.pl.fld || 55) : f.pl.cat) * .4, res = PL.res || {};
  return clamp(chaosK(1 - G.half) * (.010 + (75 - fl) * .0006 + windK() * .035 + rainK() * .06 + (res.ang > 55 ? .015 : 0) + (plan.dive ? .05 : 0) + Math.abs(PL.luck || 0) * .004), .007, .2);
}
function collideCheck() {      // 兩名野手同時衝向同一顆球：多數會喊「我來」避開，太緊急或太接近會撞在一起
  const A = PL && PL.assist; if (!A || PL.colDone || PL.foul || PL.state !== 'flight') return;
  const plan = PL.plan, f = plan && plan.f; if (!f || f.hasBall || A.hasBall) return;
  const d = dist2(f.x, f.z, A.x, A.z);
  if (!PL.called && d < 3.6) {
    PL.called = true; const fl = f.pl.fld || 55, left = plan.t - PL.t, urg = (plan.dive ? .28 : 0) + (left < .9 ? .12 : 0) + (plan.t < 1.5 ? .1 : 0);
    PL.callOff = !G.evt || Math.random() < clamp(.80 + (fl - 55) * .003 - urg - rainK() * .1 - stormK() * .12, .3, .94);
    if (PL.callOff) { A.tx = A.x; A.tz = A.z; A.wait = .6; A.assist = false; PL.colDone = true; say(`${POS_FULL[f.pos]}${f.pl.name}喊「我來！」，${A.pl.name}讓開`); return; }
  }
  if (PL.called && !PL.callOff && d < 1.15) {
    PL.colDone = true; PL.collide = true;
    for (const x of [f, A]) { x.v = 0; x.tx = x.x; x.tz = x.z; x.wait = x === f ? 1.2 : 1.0; x.rig.run = 0; x.rig.anim = { name: 'down', t: 0, dur: 1.3, opt: {} }; }
    flowSfx('wall'); crowdCheer(.6); CAMC.shake = .14; say(`<em>${f.pl.name}和${A.pl.name}為了搶同一顆球撞在一起！</em>`);
    for (const x of [f, A]) { if (x.pl.out || !G.evt) continue; if (Math.random() < .09 * durMul(x.pl) * (G.evt === 2 ? 1.9 : 1)) { x.pl.out = true; G.injQ.push({ type: 'field', side: 1 - G.half, pl: x.pl, pos: x.pos, why: '與隊友相撞，膝蓋疼痛站不起來' }); x.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } }; say(`<em>${x.pl.name}倒地不起，看起來撞得不輕…</em>`); crowdCheer(0); flowSfx('whistle'); }}
  }
}
const _gb = { x: 0, y: 0, z: 0 }, _gb2 = { x: 0, y: 0, z: 0 };
/* 野手「看球」：只用球目前的位置與速度（眼睛看得到的資訊）估計要往哪跑；不直接讀預先算好的落點／停球點 */
function ballGuess(f, spd, air, lf) {
  const S = PL.sim.S, t = Math.max(0, PL.t); sampleAt(S, t, _gb); sampleAt(S, t + .1, _gb2);
  const vx = (_gb2.x - _gb.x) / .1, vy = (_gb2.y - _gb.y) / .1, vz = (_gb2.z - _gb.z) / .1; let lead;
  if (air) { const rem = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * 9.8 * Math.max(0, _gb.y)))) / 9.8; lead = clamp(rem, 0, 7) * lf; }       // 飛球：依球目前高度與上升／下降速度估計還要飛多久，只往球飛行的方向走
  else lead = clamp(dist2(f.x, f.z, _gb.x, _gb.z) / Math.max(spd, 1), .2, 1.8) * .85;                                                    // 滾地球：追球的「現在位置＋前進方向」，球滾到哪就跟到哪
  return { x: _gb.x + vx * lead, z: _gb.z + vz * lead };
}
function smartInterceptor(S, t0) {      // 找出「最快能攔到球」的野手與攔截點（考慮球之後會滾到哪、每個人的速度與起步）；球貼牆時目標點拉回牆內
  const last = S[S.length - 1]; let best = null;
  for (const f of Object.values(E.F)) {
    if ((f.pos === 'C' || f.pos === 'P') && Math.hypot(last.x, last.z) > 28) continue;
    const spd = fspeed(f) * 1.1; let pick = null;
    for (let i = 0; i < S.length; i += 3) { const q = S[i]; if (q.t < t0 || q.y > 1.6) continue; if (.2 + dist2(f.x, f.z, q.x, q.z) / spd <= q.t - t0) { pick = { x: q.x, z: q.z, t: q.t }; break; } }
    if (!pick) pick = { x: last.x, z: last.z, t: Math.max(last.t, t0 + .2 + dist2(f.x, f.z, last.x, last.z) / spd) };
    const wr = wallRadius(Math.atan2(pick.x, -pick.z) * 180 / Math.PI) - 1.0, rd = Math.hypot(pick.x, pick.z); if (rd > wr) { pick.x *= wr / rd; pick.z *= wr / rd; }
    if (!best || pick.t < best.t) best = { f, x: pick.x, z: pick.z, t: pick.t };
  }
  return best;
}
function steerChaser() {
  const plan = PL && PL.plan; if (!plan || !plan.f || (plan.kind !== 'catch' && plan.kind !== 'field' && plan.kind !== 'chase')) return;
  const f = plan.f; if (f.hasBall || f.manual || PL.done || (PL.foul && plan.kind !== 'catch')) return;      // f.manual：玩家手動操控（js/13g-manual-fielding.js）
  let st = plan._st;
  if (!st) st = plan._st = { T: Math.max(.4, (plan.t || 1) - PL.t), t0: PL.t };
  const air = !!(plan.air && plan.kind === 'catch');
  const spd = fspeed(f) * (air ? AIR_SPD : 1), fl2 = f.pl.fld || 55, acc = 12 + fl2 * .05, rem = plan.t - PL.t;
  const isOFc = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF', readT = clamp(st.T * (air ? (isOFc ? .2 : .3) : .5), air ? .2 : .35, 1.6), u = clamp((PL.t - st.t0 - (plan.react || .3)) / readT, 0, 1), conf = u * u * (3 - 2 * u);     // 看球越久、判斷越準
  const g = ballGuess(f, spd, air, air ? .86 + .14 * conf : .35 + .65 * conf);      // 飛球：出棒後依球速與仰角就能估出大致落點方向與深度（不再先往本壘方向靠、等球過了內野才反應），之後隨看球時間逐步修正
  const ex = air ? lerp(g.x, plan.x, conf * conf) : g.x, ez = air ? lerp(g.z, plan.z, conf * conf) : g.z;
  const dTrue = dist2(f.x, f.z, plan.x, plan.z), tNeed = Math.max(0, dTrue - 1.0) / spd + spd / (2 * acc) + .03;
  const off = dist2(ex, ez, plan.x, plan.z);
  const commit = rem - tNeed < off * 2 / spd + .2;                 // 剩餘時間不夠繞路 → 全力衝向球的實際位置
  if (!air) {      // 滾地球／低球：持續「盯著球目前的位置與速度」追球（每一幀重新判斷、球彈到哪、拐到哪就跟到哪），不再直接跑到預先算好的停球點站著等球
    sampleAt(PL.sim.S, Math.min(PL.t, PL.sim.tEnd), _gb); const bx = _gb.x, bz = _gb.z;
    const dB = dist2(f.x, f.z, bx, bz);
    if (dB < 1.6) {      // 貼近球了：直接跟著球走、迎前把球接在身前（球不規則彈跳歪掉也能跟上）
      sampleAt(PL.sim.S, Math.min(PL.t + .18, PL.sim.tEnd), _gb2); f.tx = lerp(bx, _gb2.x, .6); f.tz = lerp(bz, _gb2.z, .6); f.sp = spd * .95;
    } else {
      const wP = commit ? .5 : (rem < .8 ? .18 : 0);      // 只有「再不衝就來不及」時才稍微往預判截擊點偏，平常都是追球的當下位置＋前進方向
      f.tx = lerp(ex, plan.x, wP); f.tz = lerp(ez, plan.z, wP); f.sp = spd;
    }
    if (f.v > 1 && dB > 2.5) { const hx = bx - f.x, hz = bz - f.z, hl = Math.hypot(hx, hz) || 1, k = clamp((dB - 2.5) / 12, 0, .35); f.tx += hx / hl * k * 2; f.tz += hz / hl * k * 2; }      // 離球還遠：略往球的正方向多修正一點（邊跑邊看球）
  }
  else if (commit) { f.tx = plan.x; f.tz = plan.z; f.sp = spd; }
  else { f.tx = ex; f.tz = ez; f.sp = clamp(Math.max(0, dist2(f.x, f.z, ex, ez) - 1.0) / Math.max(.25, rem - .3) * 1.15, spd * .88, spd); }
  const A = PL.assist; if (A && A !== f && !A.hasBall && !A.cover) { A.tx = f.tx + (A.x - f.tx) * .1; A.tz = f.tz + (A.z - f.tz) * .1; }
}
function updatePlay(dt) {
  if (!PL) return;
  PL.tAge += dt;
  const sim = PL.sim, plan = PL.plan;
  if (PL.state === 'flight') {
    PL.t += dt; const tEnd = sim.tEnd;
    const tt = Math.min(PL.t, tEnd); sampleAt(sim.S, tt, _tmp); setBall(_tmp, true, PL.kind === 'gb' ? undefined : '#fff'); PL.ballPos = _tmp.clone(); steerChaser(); collideCheck();
    if (PL.review && !PL.review.done) { if (!PL.review.started && PL.t >= PL.review.tv) startHRReview(PL); return; }
    if (PL.foul && !plan.f) { }
    if (sim.bn) { PL.bi = PL.bi | 0; while (PL.bi < sim.bn.length && PL.t >= sim.bn[PL.bi].t) { bounceSfx(sim.bn[PL.bi]); PL.bi++; } }      // 球落地彈跳聲（內野紅土／外野草皮）
    if (sim.wallHit && !PL.wallSnd && PL.t >= sim.wallT) { PL.wallSnd = true; flowSfx('wall'); }
    // landing of foul ball / ground contact sound
    if (!PL.landed && sim.first && PL.t >= sim.first.t) { PL.landed = true; if (PL.foul && plan.kind !== 'catch') { } }
    if (PL.foul) {
      if (plan.kind === 'catch' || plan.kind === 'field') {
        if (plan.kind === 'catch' && PL.t >= plan.t) { const ff = plan.f; if (dist2(ff.x, ff.z, plan.x, plan.z) < (plan.dive ? 3.2 : 2.4)) { onFielded(ff); return; } else if (PL.t > plan.t + .15) { plan.kind = 'field'; plan.air = false; plan.dive = false; } }
      }
      if (plan.kind !== 'catch') {
        const last = sim.S[sim.S.length - 1], oob = !!sim.over || Math.hypot(last.x, last.z) > 60;      // 只有球真的越過牆頂（飛進看台）才算出場外；滾到牆邊停住的球要由野手去撿，不再空等好幾秒才黑畫面轉場
        if (oob) { const bp = PL.ballPos, gone = bp && Math.hypot(bp.x, bp.z) > wallRadius(Math.atan2(bp.x, -bp.z) * 180 / Math.PI) + 1.5;
          if ((gone && PL.t > .8) || PL.t >= Math.min(tEnd, 9)) { PL.lostBall = true; PL.state = 'dead'; toast('飛進看台！', '#fff', '#a5f'); flowSfx('cheer', .7); say('<em>球飛出場外、撿不回來了！</em>', 2200); after(.9, () => endPlay()); return; } }
        if (!oob && (PL.t >= Math.min((sim.first ? sim.first.t + .12 : tEnd), tEnd, 9) || PL.t >= tEnd)) {      // 球一落地就動身，不等球完全停下
          if (PL.tAge > 14) { PL.state = 'dead'; after(.6, () => endPlay()); return; }
          if (!PL.fchase) { PL.fchase = true; const pk = smartInterceptor(sim.S, PL.t), f = (pk && pk.f) || nearestFielderTo(last.x, last.z, null); PL.ff = f; PL.ffPick = pk; f.chaser = true; f.wait = 0; f.hold = 0; f.sp = fspeed(f) * 1.25; }      // 挑「最快能攔到球」的野手（不只是離球最近的人），朝預測攔截點移動
          const f = PL.ff, bq = sampleAt(sim.S, Math.min(PL.t, tEnd), {}), aq = sampleAt(sim.S, Math.min(PL.t + .6, tEnd), {});      // 邊跑邊預判：朝球接下來滾到的位置攔截
          PL.fchaseT = (PL.fchaseT || 0) + dt; if (PL.fchaseT > 6.0 && !PL.slowFetch) { PL.slowFetch = true; f.chaser = false; PL.state = 'dead'; after(.4, () => endPlay()); return; }
          { const pk = PL.ffPick, still = Math.hypot(aq.x - bq.x, aq.z - bq.z) < .5; if (pk && pk.f === f && !still) { f.tx = lerp(pk.x, aq.x, .35); f.tz = lerp(pk.z, aq.z, .35); } else { f.tx = lerp(bq.x, aq.x, .35); f.tz = lerp(bq.z, aq.z, .35); } } f.wait = 0;
          if (dist2(f.x, f.z, bq.x, bq.z) < (Math.hypot(bq.x, bq.z) > wallRadius(Math.atan2(bq.x, -bq.z) * 180 / Math.PI) - 2.5 ? 2.6 : 1.3) && bq.y < 1.6) { f.chaser = false; f.tx = f.x; f.tz = f.z; PL.state = 'held'; PL.holder = f; f.hasBall = true; startPick(.25); f.hold = .25; f.rig.anim = { name: 'pickup', t: 0, dur: .25, opt: {} }; flowSfx('mitt', .6); after(.3, () => endPlay()); }
        }
      } else if (PL.t >= tEnd + .3) { PL.state = 'dead'; after(.5, () => endPlay()); }
      return;
    }
    if (plan.kind === 'hr') { if (PL.t >= plan.t + 1.0) { PL.state = 'hrdone'; } }
    else if (plan.kind === 'chase') {
      const f = plan.f;
      if (PL.t >= plan.t - .05 && (dist2(f.x, f.z, plan.x, plan.z) < 1.3 || PL.t > plan.t + 6)) onFielded(f);
      else if (PL.t >= plan.t - .05 && PL.t < plan.t + 6) { sampleAt(sim.S, Math.min(PL.t, sim.tEnd), _gb); if (dist2(f.x, f.z, _gb.x, _gb.z) < 1.2 && _gb.y < 1.4) { plan.x = _gb.x; plan.z = _gb.z; onFielded(f); } }      // 追到球的當下位置就撿起來（球滾到哪、野手就追到哪）
    } else if (PL.t >= plan.t) {
      const f = plan.f; if (plan.dive && !f.divePlayed) { f.divePlayed = true; }
      const dd = dist2(f.x, f.z, plan.x, plan.z), thr = plan.dive || plan.robHR ? 3.2 : 2.0;
      let nearBall = dd < thr;
      if (!plan.air && !plan.dive && !plan.robHR) { sampleAt(sim.S, Math.min(PL.t, sim.tEnd), _gb); nearBall = dd < 1.0 || (dist2(f.x, f.z, _gb.x, _gb.z) < 1.4 && _gb.y < 1.4); }      // 滾地球：手套真的碰到球才算接到（不再球還沒到、人還在跑就判出局）
      if (nearBall) { f.x = lerp(f.x, plan.x, .9); f.z = lerp(f.z, plan.z, .9); onFielded(f); }
      else if (!plan.robHR && PL.t > plan.t + .15) rechaseBall(PL);      // 球早就過去、野手還沒趕到：沒接到！改成追球（不再瞬間移動接球）
      else if (PL.t > plan.t + 1.5) { f.x = lerp(f.x, plan.x, .9); f.z = lerp(f.z, plan.z, .9); onFielded(f); }
    }
    // dive animation trigger
    if (plan.dive && !plan.f.divePlayed2 && PL.t > plan.t - .45) { plan.f.divePlayed2 = true; plan.f.rig.anim = { name: 'dive', t: 0, dur: .6, opt: {} }; }
    if (plan.failDive && !plan.failDive.f.fdPlayed && PL.t > plan.failDive.t - .3) { plan.failDive.f.fdPlayed = true; plan.failDive.f.rig.anim = { name: 'dive', t: 0, dur: .7, opt: {} }; plan.failDive.f.x = plan.failDive.x; plan.failDive.f.z = plan.failDive.z; plan.failDive.f.tx = plan.failDive.x; plan.failDive.f.tz = plan.failDive.z; plan.failDive.f.hold = .6; diveMissNote(plan.failDive); }
  } else if (PL.state === 'held') {
    const f = PL.holder; let by = 1.25, bz = f.z + .2;
    if (PL.pick) { PL.pick.t += dt; const k = clamp(PL.pick.t / PL.pick.dur, 0, 1); by = lerp(.14, 1.25, k * k); bz = f.z + lerp(.5, .2, k); if (k >= 1) PL.pick = null; }
    setBall({ x: f.x, y: by, z: bz }, true);
    if (PL.ask) askUpdate(dt);
    if (!PL.ask && !PL.noRunAsk && humanDef(f) && !PL.foul && !PL.tagChase && !PL.selfTag && !PL.pick && !(f.hold > 0) && !PL.done && G.outs < 3 && !E.runners.some(r => r.state === 'run')) {      // 沒有跑者在跑：撿到球仍可按傳壘（傳球選單）
      PL.noRunAsk = true; openAsk(f, null, null); if (PL.ask) { PL.ask.noRun = true; PL.ask.T = PL.ask.t = 2.2; }
    }
    if (!PL.ask && !PL.tagChase && !PL.selfTag && !PL.pick && !(f.hold > 0) && !PL.done && G.outs < 3 && E.runners.some(r => r.state === 'run')) {      // 保險：持球野手有跑者在跑卻遲遲不動作 → 立刻重新判斷傳球／追人（玩家守備時＝重新跳出傳球選單，外野接殺後跑者才起跑也能選）
      PL.idleT = (PL.idleT || 0) + dt; if (PL.idleT > (humanDef(f) ? .18 : .45)) { PL.idleT = 0; holderThink(f); }
    } else PL.idleT = 0;
    if (PL.tagChase) updateTagChase(dt); tagCheck();
    if (PL.selfTag === f && dist2(f.x, f.z, f.tx, f.tz) < .4) {
      const b = f.selfTag; PL.selfTag = null; f.selfTag = null; const b4 = b === 0 ? 4 : b;
      for (const r of E.runners.slice()) { if (r.state === 'run' && !r.ruledSafe && r.dir > 0 && r.to === b4 && r.s < (r.sliding ? 1 - (r.slideReach || 0) - .004 : .985)) { tagAnim(f); tagCall(f, r, 'force'); } }
      safeCheck(f, b4);
      after(.15, () => { if (PL && PL.state === 'held' && PL.holder === f && G.outs < 3) holderThink(f); });
    }
    checkPlayEnd();
  } else if (PL.state === 'thrown') {
    const th = PL.thr; th.delay -= dt; if (th.delay > 0) { setBall({ x: th.x0, y: 1.5, z: th.z0 }, true); return; }
    th.t += dt; const u = clamp(th.t / th.dur, 0, 1);
    const x = lerp(th.x0, th.x1, u), z = lerp(th.z0, th.z1, u), dd = th.dur * armSpeed(th.from.pl);
    let y;
    if (th.hop) {      // 落地一彈：前段低弧線落地、彈起後再飛向接球者
      const u0 = .62;
      if (u < u0) { const a = u / u0; y = lerp(1.6, BALL_R, Math.pow(a, 1.5)) + Math.sin(a * Math.PI) * Math.min(1.6, dd * .035); }
      else { const a = (u - u0) / (1 - u0); y = lerp(BALL_R, 1.1, a * a) + Math.sin(a * Math.PI) * Math.min(1.0, dd * .016); }
      if (!th.hopDone && u >= u0) { th.hopDone = true; flowSfx('bounce'); spawnBurst(x, .06, z, .3, Math.hypot(x, z) > 30 ? '#6a9a50' : '#c9a06a'); }
    } else if (th.roll) {      // 太遠：落地彈起、再彈一小下，最後貼地滾到接球者腳邊
      if (u < .4) { const a = u / .4; y = lerp(1.6, BALL_R, Math.pow(a, 1.4)) + Math.sin(a * Math.PI) * Math.min(1.6, dd * .03); if (!th.hopDone && u >= .38) { th.hopDone = true; flowSfx('bounce'); spawnBurst(x, .06, z, .3, Math.hypot(x, z) > 30 ? '#6a9a50' : '#c9a06a'); } }
      else if (u < .72) { const a = (u - .4) / .32; y = BALL_R + Math.sin(a * Math.PI) * Math.min(.9, dd * .012); if (!th.hop2 && a >= .95) { th.hop2 = true; flowSfx('bounce', .6); } }
      else { const a = clamp((u - .85) / .15, 0, 1); y = BALL_R + a * a * .5; }
    } else if (th.laser) y = lerp(1.7, 1.2, u) + Math.sin(u * Math.PI) * Math.min(1.1, dd * .018);      // 雷射肩：低平直線
    else y = lerp(1.6, 1.1, u) + Math.sin(u * Math.PI) * Math.min(3, dd * .07);
    setBall({ x, y, z }, true, '#fff');
    if (u >= 1) {
      const rc = th.to, dRc = rc ? dist2(rc.x, rc.z, th.x1, th.z1) : 0;
      if (!th.wild && rc && dRc > 1.0 && dRc <= (th.relay || th.ret ? 4 : 2.6) && (th.wA = (th.wA || 0) + dt) < .6) { rc.tx = th.x1; rc.tz = th.z1; rc.sp = fspeed(rc) * 1.1; rc.wait = 0; rc.hold = 0; }      // 接球的人還沒到位：球先停在壘包上方，等他伸手接到才判定
      else onThrowArrive(th);
    }
  } else if (PL.state === 'loose') {
    const L = PL.loose; L.t += dt; const nb = PL.looseF; setBall({ x: L.x, y: BALL_R, z: L.z }, true);
    if (dist2(nb.x, nb.z, L.x, L.z) < 1.0 && L.t > .5) { PL.state = 'held'; PL.holder = nb; nb.hasBall = true; PL.cleanThrow = true; nb.tx = nb.x; nb.tz = nb.z; nb.hold = .16; startPick(.16); nb.rig.anim = { name: 'pickup', t: 0, dur: .16, opt: {} }; after(.2, () => { if (PL && PL.state === 'held' && PL.holder === nb) holderThink(nb); }); }
  } else if (PL.state === 'hrdone') { checkPlayEnd(); }
  runnersThink(dt);
}
let _rthink = 0;
function startPick(dur) { PL.pick = { t: 0, dur }; }
function runnersThink(dt) {
  _rthink -= dt; if (_rthink > 0 || !PL || PL.done) return; _rthink = .1;
  const live = PL.state === 'flight' || PL.state === 'held' || PL.state === 'thrown' || PL.state === 'loose';
  if (!live || PL.foul) return;
  if (PL.plan.kind === 'hr') return;
  if (PL.plan.air && PL.state === 'flight') return;       // wait for the catch
  const rs = E.runners.filter(r => r.state === 'run' || r.state === 'on').sort((a, b) => (b.from + b.s) - (a.from + a.s));
  for (const r of rs) {
    if (r.from < 1 && !r.bat && r.state !== 'run') continue;
    if (PL.caught && (r.tag || r.dir < 0 || r.state === 'on')) continue;
    if (PL.tagChase && PL.tagChase.r === r && r.state === 'run' && r.dir > 0 && !r.isForce && !r.bat && r.from >= 1 && r.s < .6) {      // 被追的非強迫跑者：有機會折返原壘
      PL.revd = PL.revd || new Set(); const cf = PL.tagChase.f; runnerXZ(r, _rp);
      if (!PL.revd.has(r) && dist2(cf.x, cf.z, _rp.x, _rp.z) < 7 && baseFree(r.from, r)) { PL.revd.add(r); if (Math.random() < .5 + G.lv * .1) { r.dir = -1; r.goal = r.from; continue; } }
    }
    const frac = r.state === 'run' ? r.s : 0;
    const base = r.state === 'run' ? r.to : r.from + 1;
    const dirNow = r.state === 'run' ? r.dir : 1;
    // retreat logic
    if (r.state === 'run' && r.dir > 0 && !r.isForce && !r.bat && r.from >= 1 && r.s < .55 && !(r.pushUntil > PL.tAge) && !(r.stealer && (PL.kind === 'steal' || PL.kind === 'wp')) && !(r.squeeze && PL.res && PL.res.bunt) && !(r.hnr && PL.kind === 'gb' && r.s > .25)) {
      const rem = (1 - r.s) * BASE_LEN / r.spd, eta = ballETA(r.to % 4 === 0 ? 0 : r.to);
      if (eta < rem - .15 && PL.state !== 'flight' && baseFree(r.from, r) && !E.runners.some(o => o !== r && o.state === 'run' && o.dir > 0 && o.to === r.from)) { r.dir = -1; r.goal = r.from; continue; }
    }
    // extra base evaluation
    if (r.state === 'run' && r.dir > 0 || r.state === 'on') {
      const target = base;                                     // the next base on his path
      const rem = r.state === 'run' ? (1 - r.s) * BASE_LEN : BASE_LEN - (r.lead || 0);
      const nextGoal = r.state === 'run' ? r.to + 1 : r.from + 1;
      if (r.state === 'on') {
        if (r.isForce) continue;
        // non-forced runner may take off : only on hits through
        if (PL.kind === 'gb' && !PL.res.bunt && Math.hypot(PL.plan.x, PL.plan.z) < 30 && !(r.from === 3 && G.outs < 2 && false)) continue;
        if (PL.state === 'held') continue;
        const tR = rem / r.spd + .15, eta = ballETA(r.from + 1 >= 4 ? 0 : r.from + 1);
        const need = (G.outs === 2 ? -.3 : (r.from === 3 ? .02 : .2) + (G.lv < 2 ? .3 : 0)) - ((r.pl.agg || 50) - 50) * .005;      // 跑者更積極：願意搶更多壘
        if (baseFree(r.from + 1, r) && tR + need < eta) { r.goal = r.from + 1; r.state = 'run'; r.to = r.from + 1; r.s = (r.lead || 0) / BASE_LEN; r.dir = 1; G.on[r.from - 1] = null; }
        continue;
      }
      if (r.goal >= 4) continue;
      if (r.goal > r.to) continue;
      const nb = r.to + 1; if (nb > 4) continue;
      if (nb < 4 && !baseFree(nb, r) ) continue;
      const tR = rem / r.spd + BASE_LEN / r.spd + .1 - (r.hnr ? .3 : 0);
      const eta = ballETA(nb >= 4 ? 0 : nb);
      const need = (G.outs === 2 ? -.12 : .14) + (nb === 4 ? .08 : 0) + (G.lv < 2 ? .25 : 0) - (PL.plan && PL.plan.f && PL.plan.f.pl.arm < 55 ? .15 : 0) - ((r.pl.agg || 50) - 50) * .003 - (G.lv >= 2 ? .06 : 0);
      if (tR + need < eta && (r.s > .35 || r.s === 0 || true)) { r.goal = nb; }
    }
  }
}
function pushCands() {      // 可以「推進」的跑者：已起跑者（加速、改目標），或剛站上壘包、球還沒回傳到位的跑者
  if (!PL || PL.done || PL.foul || G.outs >= 3 || !engBats() || G.human < 0 || G.mode !== 'play') return [];
  if (PL.state === 'dead' || PL.state === 'hrdone' || !PL.plan || PL.plan.kind === 'hr') return [];
  if (PL.state === 'flight' && PL.plan.air) return [];
  const out = [];
  for (const r of E.runners) {
    if (r.state === 'run' && r.dir >= 0) { if (r.to < 4 || r.s < .97) out.push(r); }
    else if (r.state === 'on' && r.from >= 1 && r.from <= 3 && !PL.caught && baseFree(r.from + 1, r)) out.push(r);
  }
  return out;
}
function doPush() {
  if (G.freeze) return false;
  const cs = pushCands(); if (!cs.length) return false;
  cs.sort((a, b) => (b.from + (b.state === 'run' ? b.s : 0)) - (a.from + (a.state === 'run' ? a.s : 0)));
  let started = false;
  for (const r of cs) {      // 每點一下：還在壘上的跑者最多多出發一位（最前面的優先）；已在跑的全部加速、改成積極進壘
    if (r.state === 'on') {
      const nb = r.from + 1; if (nb > 4 || !baseFree(nb, r)) continue;      // 壘上所有跑者「同步」起跑（由最前面的跑者開始依序騰出壘包）
      r.goal = nb; r.state = 'run'; r.to = nb; r.s = (r.lead || 0) / BASE_LEN; r.dir = 1; r.isForce = false; r.tag = false; G.on[r.from - 1] = null; r.pre = 0; r.sliding = false; r.pushN = 1; r.pushUntil = PL.tAge + 2; const firstGo = !started; started = true;
      if (firstGo) toast('全壘包推進！', '#fff', '#e80'); say(`<em>${r.pl.name}</em>看準時機，積極往${BASE_NAME[nb % 4]}推進！`, 2500);
    } else {
      if (r.dir < 0) { r.dir = 1; r.goal = r.to; }
      if (r.goal <= r.to && r.to < 4 && baseFree(r.to + 1, r)) r.goal = r.to + 1;
      r.pushN = (r.pushN || 0) + 1; r.pushUntil = PL.tAge + 1.2; r.isForce = r.isForce && r.dir > 0;
    }
  }
  if (!started && !cs.some(r => r.state === 'run')) return false;
  PL.idleT = .28; PL.endHold = 0; return true;      // 守備方約 0.15 秒內就會重新判斷（追人／傳球）
}
function forcedBehind(r) {      // 真的被「後面的跑者」逼著往前跑才不能折返；打者跑過一壘後、或自己按了推進，都可以退回最近的上一個壘包
  if (!(r.isForce && r.dir > 0) || r.pushN > 0) return false;
  return E.runners.some(o => o !== r && (o.state === 'run' || o.state === 'on') && o.dir >= 0 && (o.to === r.from || (o.state === 'on' && o.from === r.from - 1 && o.isForce)));
}
function retreatCands() {      // 可以「回壘」的跑者：正在壘間跑動、已離開原壘（不含剛擊出球、還沒到一壘的打者）、不是被強迫進壘的人
  if (!PL || PL.done || G.outs >= 3 || !engBats() || G.human < 0 || G.mode !== 'play') return [];
  if (PL.state === 'dead' || PL.state === 'hrdone' || !PL.plan || PL.plan.kind === 'hr') return [];
  const out = E.runners.filter(r => r.state === 'run' && r.from >= 1 && r.from <= 3 && !(r.sliding && r.s > .9) && !forcedBehind(r) && !r.trot);
  for (const r of E.runners) if (r.state === 'on' && r.from >= 2 && r.from <= 3 && !PL.caught && baseFree(r.from - 1, r) && !E.runners.some(o => o !== r && o.state === 'run' && o.dir > 0 && o.to === r.from - 1)) out.push(r);      // 站在壘包上也能退回「上一個壘包」（那一壘沒人、也沒有人正在跑過來）：隨時可進可退
  return out;
}
function doRetreat() {      // 回壘：所有跑在壘間的跑者「同步」回到離自己最近的壘包（已過半就停在前面那一壘），同壘不會擠在一起
  if (G.freeze) return false;
  const cs = retreatCands(); if (!cs.length) return false;
  cs.sort((a, b) => (b.from + b.s) - (a.from + a.s));      // 最前面的跑者先決定
  const claimed = {}; let back = 0, hold = 0;
  for (const r of cs) {
    if (r.state === 'on') {      // 站在壘包上：轉成「從目前壘包往上一壘跑」
      const cur = r.from; G.on[cur - 1] = null; r.state = 'run'; r.from = cur - 1; r.to = cur; r.s = 1; r.dir = -1; r.goal = cur - 1; r.isForce = false; r.ret = true; r.tag = false; r.pre = 0; r.stall = 0; r.pushN = 0; r.pushUntil = 0; r.lead = 0; back++; claimed[cur - 1] = true; continue;
    }
    let tgt = r.from;      // 一律回到「最後一個已確定安全上壘的壘包」（r.from；還沒安全上壘的打者不在名單內，按了沒反應）
    const occ = b => b >= 1 && b <= 3 && G.on[b - 1] && G.on[b - 1] !== r;
    if (tgt === r.from && occ(r.from) && r.to <= 4 && !occ(r.to) && !claimed[r.to]) tgt = r.to;      // 原壘已被後面的跑者佔住：只能往前跑
    claimed[tgt] = true;
    if (tgt === r.from) {
      r.dir = -1; r.goal = r.from; r.isForce = false; r.ret = true; r.tag = false; r.pre = 0; r.stall = 0; r.pushN = 0; r.pushUntil = 0;
      if (r.stealer) r.accT = stealRamp(r); if (r.sliding) { r.sliding = false; r.rig.anim = null; } back++;
    } else {
      r.dir = 1; r.goal = r.to; r.pushN = 0; r.pushUntil = 0; hold++;      // 離前方壘包比較近：直接跑到前一壘就停
    }
  }
  toast('回壘！', '#fff', '#2a7ae8'); say(hold ? '跑者同步折返，回到最後一個安全上壘的壘包（原壘被佔住的跑者只能往前）！' : '全部跑者同步折返，拼命回到最後一個安全上壘的壘包！', 2500);
  PL.idleT = .28; PL.endHold = 0; return true;
}
function updatePushBtn() {
  const b = $('btnPush'), c = $('btnBack');
  if (b) { const on = mineBats() && pushCands().length > 0; if (on === b.classList.contains('hide')) b.classList.toggle('hide', !on); }
  if (c) { const on = mineBats() && retreatCands().length > 0; if (on === c.classList.contains('hide')) c.classList.toggle('hide', !on); }
}
function pushWindowOpen(dt) {      // 跑者剛站上壘包但球還沒回傳到位：最多多留 2.2 秒給玩家決定要不要繼續推進
  if (!engBats() || G.human < 0) return false;
  const on = E.runners.filter(r => r.state === 'on' && r.from >= 1 && r.from <= 3 && baseFree(r.from + 1, r));
  if (!on.length || PL.caught || PL.state === 'dead') { PL.endHold = 0; return false; }
  const r = on.sort((a, b) => b.from - a.from)[0], nb = r.from + 1, eta = ballETA(nb >= 4 ? 0 : nb), tR = BASE_LEN / r.spd;
  if (eta < tR * .8) { PL.endHold = 0; return false; }
  PL.endHold = (PL.endHold || 0) + dt; return PL.endHold < 2.2;
}
function checkPlayEnd() {
  if (!PL) return;
  { const dtp = Math.max(0, PL.tAge - (PL._cpeT == null ? PL.tAge : PL._cpeT)); PL._cpeT = PL.tAge; if (!PL.ending && G.outs < 3 && !E.runners.some(r => r.state === 'run') && PL.tAge < 20 && pushWindowOpen(dtp)) return; }
  if (G.outs >= 3 && PL.state !== 'flight') { if (!PL.ending) { PL.ending = true; after(.8, () => endPlay()); } return; }
  const moving = E.runners.some(r => r.state === 'run');
  const askWait = PL.state === 'held' && humanDef(PL.holder) && !PL.foul && G.outs < 3 && (PL.ask || !PL.noRunAsk);
  if ((PL.state === 'held' || PL.state === 'hrdone') && !moving && !PL.selfTag && !PL.tagChase && PL.tAge > .3 && !askWait) {
    if (!PL.ending) { PL.ending = true; after(PL.state === 'hrdone' ? 4.6 : .35, () => endPlay()); }
  }
  if (PL.tAge > (PL.plan && PL.plan.kind === 'hr' ? 70 : 40) && !PL.ending) { PL.ending = true; endPlay(); }
}
function endPlay() {
  if (!PL || PL.done) return;
  if (PL.foul && !PL.foulOut && E.runners.some(r => r.state === 'run' && !r.bat) && (PL.endWait = (PL.endWait || 0) + 1) < 60) { after(.2, endPlay); return; } if (PL.plan && PL.plan.kind === 'hr' && E.runners.some(r => r.state === 'run') && (PL.hrWait = (PL.hrWait || 0) + 1) < 200) { after(.2, endPlay); return; } PL.done = true; const pl = PL;
  // settle runners
  if (pl.plan && pl.plan.kind === 'hr' && !pl.plan.grd) { for (const r of E.runners) if (r.state === 'run') { r.state = 'home'; r.rig.run = 0; r.rig.root.visible = false; scoreRunner(r); } }   // 全壘打：還沒跑完的跑者直接得分，不留在壘上
  else for (const r of E.runners) { if (r.state === 'run') { r.state = 'on'; if (r.dir > 0) { r.from = r.s > .5 ? r.to : r.from; } r.s = 0; r.to = r.from + 1; r.lead = 0; if (r.from >= 1 && r.from <= 3) G.on[r.from - 1] = r; } }
  const fin = () => { setBall({ x: 0, y: 0, z: 0 }, false); flowOnPlayEnd(pl); };
  returnBall(pl, fin);
}
function returnBall(pl, cb) {
  const P = E.F.P; let h = pl.holder;
  if (G.outs >= 3 || (pl.plan && pl.plan.kind === 'hr') || !P || !h || pl.state === 'dead') { cb(); return; }
  const mound = formationPos('P');
  if (pl.foul && !pl.foulOut) after(5.0, () => { if (PL === pl && pl.retCb) { pl.slowFetch = true; pl.retCb(); } });      // 界外球撿回來超過一球的準備時間：直接轉場
  P.tx = mound.x; P.tz = mound.z; P.sp = 8.5; P.hold = 0;
  pl.retCb = () => { pl.retCb = null; cb(); };
  if (h === P) { const back = n => { if (PL !== pl) return; if (dist2(P.x, P.z, mound.x, mound.z) > 1.3 && n < 80) { P.tx = mound.x; P.tz = mound.z; P.sp = 8.5; P.hold = 0; P.wait = 0; after(.1, () => back(n + 1)); return; } pl.retCb && pl.retCb(); }; after(.2, () => back(0)); return; }      // 投手自己持球（例如補位一壘接到傳球）：先拿著球走回投手丘才開始下一球，不再瞬間切換
  const d = dist2(h.x, h.z, mound.x, mound.z);
  // 距離太遠（多半是外野手）：先傳給「距離他最近的壘上內野手」，再由內野手傳回投手，不再一路遠傳到投手丘
  let relayF = null;
  if (d > 38 && h.pos !== 'C') {
    let bd = 1e9; for (const pos of ['1B', '2B', 'SS', '3B']) { const f = E.F[pos]; if (!f || f === h || !f.pl || f.pl.out) continue; const dr = dist2(h.x, h.z, f.x, f.z); if (dr < bd) { bd = dr; relayF = f; } }
    if (relayF && !(bd < d - 8)) relayF = null;      // 中繼的人要明顯比投手近才有意義
  }
  if (relayF) {
    const rf = relayF, dr = dist2(h.x, h.z, rf.x, rf.z);
    rf.tx = rf.x; rf.tz = rf.z; rf.sp = 0; faceRig(rf.rig, h.x, h.z);
    pl.retCb = () => { pl.retCb = null; if (PL === pl) returnBall(pl, cb); };      // 內野手接到後，再呼叫一次 returnBall：此時距離近，直接傳給投手
    after(.04, () => {
      if (PL !== pl) return;
      pl.state = 'thrown'; h.hasBall = false; h.rig.anim = { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } }; faceRig(h.rig, rf.x, rf.z);
      pl.thr = { from: h, to: rf, b: -1, t: 0, dur: dr / (armSpeed(h.pl) * .85) + .05, x0: h.x, z0: h.z, x1: rf.x, z1: rf.z, wild: false, relay: false, ret: true, delay: .15, info: null };
      pl.holder = null;
    });
    return;
  }
  const goThrow = n => {      // 投手還沒回到投手丘（例如剛去補位／撿球）時，野手先持球等他回來，不再把球傳向空無一人的投手丘
    if (PL !== pl || pl.holder !== h) return;
    if (dist2(P.x, P.z, mound.x, mound.z) > 1.3 && n < 45) { P.tx = mound.x; P.tz = mound.z; P.sp = 8.5; P.hold = 0; after(.1, () => goThrow(n + 1)); return; }
    const tx = P.x, tz = P.z, dd = dist2(h.x, h.z, tx, tz); P.tx = tx; P.tz = tz;      // 傳向投手「實際站的位置」
    pl.state = 'thrown'; h.hasBall = false; h.rig.anim = { name: 'throw', t: 0, dur: .35, opt: { hand: 1 } }; faceRig(h.rig, tx, tz); faceRig(P.rig, h.x, h.z);
    pl.thr = { from: h, to: P, b: -1, t: 0, dur: dd / (armSpeed(h.pl) * .85) + .05, x0: h.x, z0: h.z, x1: tx, z1: tz, wild: false, relay: false, ret: true, delay: .15, info: null };
    pl.holder = null;
  };
  after(.04, () => goThrow(0));
}
/* ---------------- human-controlled throwing ---------------- */
const humanDef = f => !G.easy && (vsOn() || (G.human >= 0 && G.human === 1 - G.half)) && !G.intWalk && (!G.role || !f || !!(f.pl && f.pl.isMe));      // 生涯模式：只有球在「自己的角色」手上才問傳球
const BASE_NAME = { 1: '一壘', 2: '二壘', 3: '三壘', 0: '本壘' };
function openAsk(f, best, auto) {
  if (PL.directThrow === undefined) PL.directThrow = true;      // 玩家選壘包＝直接傳到該壘包（按 R 才改成經中繼員）
  PL.ask = { f, t: 3.2, T: 3.2, auto, rec: best ? best.b : -1 };
  const tp = $('throwPanel'); tp.classList.remove('hide');
  const pos = { 0: [50, 84], 1: [84, 50], 2: [50, 16], 3: [16, 50] };
  const isOF = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF';
  let h = '<svg viewBox="0 0 100 100"><polygon points="50,16 84,50 50,84 16,50" fill="none" stroke="#fff" stroke-width="2"/></svg><div class="tt"></div><div class="tbar"><i id="tAskBar"></i></div>';
  h += '<div class="tb tctr" data-b="chase" style="left:50%;top:50%"><span class="tn">追殺</span><small>T</small></div>';      // 中間：持球追最近的跑者並觸殺（沒有跑者時不能按）
  for (const b of [2, 3, 1, 0]) { const cv = PL.cover && PL.cover[b]; h += `<div class="tb" data-b="${b}" style="left:${pos[b][0]}%;top:${pos[b][1]}%"><span class="tn">${BASE_NAME[b]}</span><small>${b === 0 ? 'H' : b}</small>${cv ? '<span class="tf">' + cv.pos + '</span>' : ''}</div>`; }
  h += `<div class="tb tmode" data-b="relay" style="left:88%;top:88%"><span class="tn">中繼</span><small>R</small></div>`;      // 傳給中繼內野手（外野手傳回內野、內野手也可轉傳）
  tp.innerHTML = h;
  tp.querySelectorAll('.tb').forEach(el => { const go = e => { e.preventDefault(); e.stopPropagation(); const d = el.dataset.b; humanThrow(d === 'mode' || d === 'chase' || d === 'relay' ? d : +d); }; el.addEventListener('pointerdown', go); });
  askMark();
}
function selfRunSpeed(f) {      // 野手自己持球跑壘包：依個人跑速、守備能力調整（持球略慢於全速）
  const pl = f.pl; return fspeed(f) * clamp(.96 + ((pl.spd || 55) - 55) * .0022 + ((pl.fld || 55) - 55) * .0006, .88, 1.1);
}
function baseMan(b, f) {      // 該壘包的守備員：投手補一壘時，依「持球者」與「投手」誰離壘包近決定——持球者較近就自己站壘包，投手較近就傳給投手（兩人不會同時搶壘包）
  let cv = PL && PL.cover && PL.cover[b]; if (b < 1 || b > 3 || !PL.cover) return cv;
  if (cv && (cv.pos === 'P' || cv.pos === 'C')) {
    const nm = E.F[{ 1: '1B', 2: '2B', 3: '3B' }[b]], spot = baseSpot(b), okF = g => g && !(g.pl && g.pl.out) && (g === f || !g.chaser);
    let best = cv, bd = dist2(cv.x, cv.z, spot.x, spot.z);
    for (const g of [nm, f]) { if (!okF(g) || g === cv) continue; const d = dist2(g.x, g.z, spot.x, spot.z); if (d < bd - .01) { bd = d; best = g; } }
    cv = PL.cover[b] = best;
  }
  return cv;
}
function thrAvail(b) {      // 玩家選擇傳往哪個壘包：該壘包必須已有守備員在壘包上（或持球者自己就是該壘包的守備員），否則不能傳
  const A = PL && PL.ask; if (!A) return { ok: false };
  const cv = baseMan(b, A.f), spot = baseSpot(b);
  if (!cv || (cv.pl && cv.pl.out)) return { ok: false, why: '無人' };
  if (cv === A.f) return { ok: true, self: true, cv };
  if (cv.chaser) return { ok: false, why: '無人' };
  return { ok: true, cv };
}
function askMark() {
  if (!PL || !PL.ask) return; const rs = E.runners.filter(r => r.state === 'run'); const hot = new Set(rs.map(r => (r.dir > 0 ? r.to : r.from) % 4));
  document.querySelectorAll('#throwPanel .tb').forEach(el => { const b = +el.dataset.b; el.classList.toggle('hot', hot.has(b)); el.classList.toggle('rec', b === PL.ask.rec);
    if (el.dataset.b === 'chase') { el.classList.toggle('dis', !nearestTagRunner(PL.ask.f)); return; }
    if (el.dataset.b === 'near' || el.dataset.b === 'mode' || isNaN(b)) return;
    const av = thrAvail(b); el.classList.toggle('dis', !av.ok); let sp = el.querySelector('.tf'); if (!sp) { sp = document.createElement('span'); sp.className = 'tf'; el.appendChild(sp); }
    sp.textContent = av.ok ? (av.self ? '自己跑' : av.cv.pos) : av.why; });
}
function closeAsk() { if (PL) PL.ask = null; const tp = $('throwPanel'); if (tp) { tp.classList.add('hide'); } }
function askUpdate(dt) {
  const A = PL.ask; if (!A) return;
  if (PL.holder !== A.f || PL.done || (!A.noRun && !E.runners.some(r => r.state === 'run')) || G.outs >= 3) { closeAsk(); return; }
  A.t -= (typeof FM !== 'undefined' && FM.moving(A.f) ? 0 : dt); const bar = $('tAskBar'); if (bar) bar.style.width = clamp(A.t / A.T, 0, 1) * 100 + '%'; askMark();
  if (A.t <= 0) { const au = A.auto; closeAsk(); if (au) execThrow(A.f, au.b, au); }
}
function execThrow(f, b, info) {
  if (!PL || PL.state !== 'held' || PL.holder !== f) return;
  const cov = baseMan(b, f), spot = baseSpot(b);
  { const P = E.F.P; if (cov === f && P && P !== f && P.cover === b) { P.cover = null; const m = formationPos('P'); P.tx = m.x; P.tz = m.z; P.sp = fspeed(P) * .9; P.wait = 0; } if (cov && cov !== f && cov.pos !== 'P' && E.F.P && E.F.P.cover === b) { const P = E.F.P; P.cover = null; const m = formationPos('P'); P.tx = m.x; P.tz = m.z; P.sp = fspeed(P) * .9; P.wait = 0; } if (cov) cov.cover = b; }      // 只留一個人守壘包：另一個回投手丘／原位
  if (cov === f) { f.tx = spot.x; f.tz = spot.z; f.sp = selfRunSpeed(f); f.selfTag = b; f.hold = 0; f.wait = clamp(.12 - ((f.pl.fld || 55) - 55) * .002, .04, .22); PL.selfTag = f; say(`${POS_FULL[f.pos]}${f.pl.name}持球跑向${BASE_NAME[b]}！`, 1800); return; }
  throwTo(f, cov || nearestFielderTo(spot.x, spot.z, f), b, info || {});
}
function nearestTeammate(f) { let b = null, bd = 1e9; for (const g of Object.values(E.F)) { if (g === f) continue; const d = dist2(g.x, g.z, f.x, f.z); if (d < bd) { bd = d; b = g; } } return b; }
function execNear(f) {      // 把球傳給離自己最近的守備員（遠距離會落地一彈，肩力強則有機會雷射直傳）
  if (!PL || PL.state !== 'held' || PL.holder !== f) return; const g = nearestTeammate(f); if (!g) return;
  g.tx = g.x; g.tz = g.z; g.sp = 0; g.chaser = false; g.wait = 0;
  throwTo(f, g, -2, {}, true); say(`${POS_FULL[f.pos]}${f.pl.name}把球傳給最近的${POS_FULL[g.pos]}${g.pl.name}`, 2200);
}
function nearestTagRunner(f) {      // 離持球者最近、可被觸殺的跑者
  let best = null, bd = 1e9; if (!f) return null;
  for (const r of E.runners) { if (!runnerTaggable(r)) continue; runnerXZ(r, _rp); const d = dist2(f.x, f.z, _rp.x, _rp.z); if (d < bd) { bd = d; best = r; } }
  return best;
}
function execRelay(f) {      // 傳給中繼內野手：優先用外野落點對應的中繼員，否則傳給最近的內野手
  if (!PL || PL.state !== 'held' || PL.holder !== f) return;
  let g = PL.cover && PL.cover.relay; if (!g || g === f || g.chaser || (g.pl && g.pl.out)) { g = null; let bd = 1e9; for (const pos of ['SS', '2B', '3B', '1B']) { const c = E.F[pos]; if (!c || c === f || c.chaser || (c.pl && c.pl.out)) continue; const d = dist2(c.x, c.z, f.x, f.z); if (d < bd) { bd = d; g = c; } } }
  if (!g) return; g.tx = g.x; g.tz = g.z; g.sp = 0; g.chaser = false; g.wait = 0;
  throwTo(f, g, -2, {}, true); say(`${POS_FULL[f.pos]}${f.pl.name}傳給中繼的${POS_FULL[g.pos]}${g.pl.name}`, 2200);
}
function humanThrow(b) { if (!PL || !PL.ask || G.freeze) return; const f = PL.ask.f; if (b === 'relay') { closeAsk(); execRelay(f); return; } if (b === 'mode') { PL.directThrow = !PL.directThrow; const el = document.querySelector('#throwPanel .tmode'); if (el && el.firstChild) el.firstChild.nodeValue = PL.directThrow ? '直傳' : '中繼'; return; } if (b === 'chase') { const tr = nearestTagRunner(f); if (!tr) { say('目前沒有可以觸殺的跑者！', 1500); return; } closeAsk(); startTagChase(f, tr); return; } if (b !== 'near' && b !== 'tag') { const av = thrAvail(b); if (!av.ok) { say(av.why === '補位中' ? `${BASE_NAME[b]}的守備員還在補位途中，等他到壘包再傳！` : `${BASE_NAME[b]}目前沒有守備員，等有人補位後才能傳球！`, 1800); return; } } closeAsk(); if (b === 'near' || b === 'tag') { execNear(f); return; } execThrow(f, b, {}); }
function clearPlay() { const tp = document.getElementById('throwPanel'); if (tp) tp.classList.add('hide'); PL = null; for (const f of Object.values(E.F)) { f.manual = false; f.hasBall = false; f.chaser = false; f.dive = false; f.divePlayed = f.divePlayed2 = f.fdPlayed = false; f.selfTag = null; f.hold = 0; f.wait = 0; f.v = 0; } }

