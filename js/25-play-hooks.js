/* 25-play-hooks.js — 比賽引擎 hooks（原 script.js 第 5829-6002 行） */
'use strict';
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
  const spec = G.human < 0, tie = w < 0, won = !tie && !spec && w === G.human, lost = !tie && !spec && w !== G.human;
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
    const mt = G.teams[G.human], ranked = best(mt), mine = ranked[0];
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
  $('againBtn').onclick = () => { rs.classList.add('hide'); $('hud').classList.add('hide'); $('menu').classList.remove('hide'); G.mode = 'menu'; CAMC.mode = 'title'; };
  $('homeBtn').onclick = backToTitle;
}

function buntCharge() {                    // 看到打者擺出短打姿勢：一、三壘手與投手在投球出手時就往前衝（守備越好反應越快，奇襲短打則來不及）
  const defs = [['1B', 8.6, -8.4], ['3B', -8.6, -8.4], ['P', 0, -10.2]];
  for (const [pos, x, z] of defs) { const f = E.F[pos]; if (!f) continue; const fl = f.pl.fld || 55; f.tx = x; f.tz = z; f.sp = fspeed(f) * .9; f.wait = clamp(.12 - (fl - 55) * .002 + Math.random() * .1, .02, .3); }
}

function pitcherToMound() {                // 投手每球都從投手丘站好再投（避免前衝、跨步、短打前衝後越站越前面）
  const P = E.F.P; if (!P) return;
  const d0 = DEFAULT_POS.P; P.x = d0.x; P.z = d0.z; P.tx = d0.x; P.tz = d0.z; P.hold = 0; P.rig.stride = 0; P.rig.root.position.x = d0.x; P.rig.root.position.z = d0.z; P.rig.root.position.y = moundY(d0.x, d0.z);
}

