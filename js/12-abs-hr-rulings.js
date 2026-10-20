/* 12-abs-hr-rulings.js — ABS 判決／close play／全壘打判決（原 script.js 第 2498-2682 行） */
'use strict';
/* =====================================================================
   ABS 擴充：跑壘 close play 判決＋全壘打（界外／場地規則二壘安打／全壘打）判決
   ===================================================================== */
const CLOSE_T = .26;      // 球與跑者到壘時間差在 0.16 秒內＝close play，主審可能誤判、雙方可挑戰
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
  const hum = G.human;
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
    if (t === hum || !can(t)) return false; const L = lvl(), wronged = hurt === t;
    const p = (wronged ? clamp(.55 + L.learn * .15, .4, .85) : .04) * (G.abs[t] <= 1 ? .7 : 1) * (L.learn > 0 ? 1 : .6);
    return Math.random() < p;
  };
  const ai = [G.half, 1 - G.half].filter(aiWants);
  if (ai.length) { const team = ai.includes(hurt) ? hurt : ai[0]; G.freeze = true; say(`${sideName(team)}要求挑戰${o.title}`); rpAt(550, () => challenge(team)); return; }
  if (hum >= 0 && can(hum)) {
    G.freeze = true; say(`主審判定：<em>${o.label(o.call)}</em>。要挑戰嗎？<em>(C)</em>`);
    EV.abs = { t: 4, max: 4, team: hum, onGo: () => { if (tok === G.judgeTok) challenge(hum); }, onSkip: () => finish(o.call) };
    $('absTitle').textContent = o.panelTitle; $('absGo').textContent = 'ABS 挑戰 [C]'; $('absRem').textContent = `${o.label(o.call)}・剩${G.abs[hum]}`; $('absBarI').style.width = '100%'; $('absPanel').classList.remove('hide'); return;
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
  const dt = (G.clk || 0) - r.arrT; if (dt < 0 || dt > CLOSE_T) return;
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

