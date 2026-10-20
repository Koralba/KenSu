/* 27-mood-coaching.js — 心情／投手教練／傷病／失誤後續／擊球資訊／CPU換人／投球準備（原 script.js 第 6420-6689 行） */
'use strict';
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
  const side = 1 - G.half; if (G.human === side || G.visits[side] <= 0 || !lvl().learn) return false;
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
}
function setHitResult(txt) { const e = $('hitRes'); if (e) e.innerHTML = ' ' + txt; }
function hideHitInfo(delay) { const el = $('hitInfo'); if (!el) return; const my = _hitT; if (!delay) { el.classList.add('hide'); return; } setTimeout(() => { if (my === _hitT) el.classList.add('hide'); }, delay); }
/* ---------------- CPU 教練：依表現換人 ---------------- */
function perfBad(b) { const s = b.st; return (s.ab >= 2 && s.h === 0 && (s.k >= 2 || moodOf(b) < 38)) || moodOf(b) < 24; }
function aiCoachBatter() {
  const side = G.half; if (G.human === side || !lvl().learn || G.over) return false; const t = battingTeam(); if (!t.bench || !t.bench.length) return false;
  const b = curBatter(); if (b.slot === undefined || b.isPitcherBat || G.inning < 3) return false; if (!perfBad(b)) return false;
  const c = t.bench.filter(x => !x.out && fitPenalty(x.nat, b.pos) <= .13 && (b.pos !== 'C' || x.nat === 'C') && strengthOf(x) + moodOf(x) * .1 > strengthOf(b) + moodOf(b) * .1 + 1).sort((a, z) => (strengthOf(z) + moodOf(z) * .1) - (strengthOf(a) + moodOf(a) * .1));
  if (!c[0] || Math.random() > .75) return false;
  const old = b, s2 = subInto(side, old, c[0]); if (!s2) return false;
  say(`${sideName(side)}教練見 <em>${old.name}</em> 狀況不佳，換上 <em>${s2.name}</em> 代打！`); toast('代打', '#fff', '#39f'); G.log.push('教練換人'); return true;
}
function aiCoachFielders() {            // 防守端：失誤／低迷的野手，局數後段換上守備較好的板凳
  const side = 1 - G.half; if (G.human === side || !lvl().learn || G.over || G.inning < Math.max(3, G.innings - 3)) return;
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

