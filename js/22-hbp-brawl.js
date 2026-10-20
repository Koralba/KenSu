/* 22-hbp-brawl.js — 特殊事件：觸身球／板凳清空（原 script.js 第 4756-5090 行） */
'use strict';
/* ---------------- 觸身球事件 ---------------- */
const HBP_PART = { head: { n: '頭部', pain: 3.8, inj: .20 }, torso: { n: '肋骨', pain: 2.5, inj: .08 }, arm: { n: '手臂', pain: 1.9, inj: .07 }, hand: { n: '手腕', pain: 2.0, inj: .11 },
  thigh: { n: '大腿', pain: 1.9, inj: .05, leg: .85 }, knee: { n: '膝蓋', pain: 2.7, inj: .09, leg: .72 }, foot: { n: '腳踝', pain: 2.3, inj: .08, leg: .78 } };
const HBP_WHY = { head: ['頭部遭球直接擊中，倒地後頭暈目眩無法起身', '頭盔側面被砸中，眼神渙散需要攙扶'], torso: ['肋骨被球砸中，痛到蜷縮在地', '背部中彈，呼吸困難無法起身'], arm: ['球砸在手肘上，手臂麻到抬不起來', '前臂被擊中，疑似骨裂'], hand: ['球打在手腕上，疑似骨折跡象', '手指被砸中，痛到甩著手'],
  thigh: ['大腿被擊中，嚴重瘀血無法行走'], knee: ['觸身球擊中膝蓋，疑似韌帶受傷'], foot: ['腳踝被球砸中，完全無法承重'] };
/* ---------- 觀眾丟垃圾抗議（惡意觸身球驅逐投手時）：紙杯、紙團、寶特瓶從看台飛向投手丘，落地彈跳後散落場上，之後慢慢消失 ---------- */
const TRASH = []; let TRASH_Q = null;
function clearTrash() { for (const t of TRASH) { try { scene.remove(t.m); } catch (e) { } } TRASH.length = 0; TRASH_Q = null; }
function trashProtest() {
  if (G.mode !== 'play') return;
  TRASH_Q = { left: 46, gap: 0, t: 0 };
  say('<em>觀眾氣炸了！</em>看台上開始往場內丟垃圾，抗議惡意觸身！'); toast('觀眾丟垃圾抗議！', '#fff', '#b33');
  crowdCheer(0); try { flowSfx('out', .9); } catch (e) { }
}
const TRASH_KINDS = [
  () => new THREE.Mesh(new THREE.CylinderGeometry(.07, .05, .13, 8), new THREE.MeshPhongMaterial({ color: Math.random() < .5 ? 0xf2f2f2 : 0xd83a3a })),
  () => new THREE.Mesh(new THREE.IcosahedronGeometry(.09, 0), new THREE.MeshPhongMaterial({ color: 0xf4f4ee, flatShading: true })),
  () => new THREE.Mesh(new THREE.CylinderGeometry(.04, .045, .27, 8), new THREE.MeshPhongMaterial({ color: 0x5aa8e8, transparent: true, opacity: .8 })),
  () => new THREE.Mesh(new THREE.BoxGeometry(.2, .12, .14), new THREE.MeshPhongMaterial({ color: Math.random() < .5 ? 0xe8c060 : 0x7ac870 }))
];
function spawnTrash() {
  const m = TRASH_KINDS[Math.floor(Math.random() * TRASH_KINDS.length)](), sg = Math.random() < .5 ? -1 : 1, tz = -4 - Math.random() * 18;
  const sx = sg * (Math.abs(tz) + 7 + Math.random() * 9), sy = 3.5 + Math.random() * 3.5, sz = tz + (Math.random() - .5) * 6;
  const ex = (Math.random() - .5) * 6, ez = MOUND.z + (Math.random() - .5) * 6, T = .9 + Math.random() * .6;
  m.position.set(sx, sy, sz); scene.add(m);
  TRASH.push({ m, x: sx, y: sy, z: sz, vx: (ex - sx) / T, vz: (ez - sz) / T, vy: (0.1 - sy + 4.9 * T * T) / T, rx: 6 + Math.random() * 8, rz: 4 + Math.random() * 7, t: 0, rest: 0, bn: 0 });
}
function updateTrash(dt) {
  const Q = TRASH_Q;
  if (Q) { Q.t += dt; Q.gap -= dt; while (Q.left > 0 && Q.gap <= 0) { spawnTrash(); Q.left--; Q.gap += .04 + Math.random() * .09; } if (Q.left <= 0) TRASH_Q = null; }
  for (let i = TRASH.length - 1; i >= 0; i--) {
    const p = TRASH[i]; p.t += dt;
    if (p.rest > 0 || p.y <= .06 && Math.abs(p.vy) < .6) { p.rest += dt; const k = Math.max(0, 1 - 5 * dt); p.vx *= k; p.vz *= k; p.x += p.vx * dt; p.z += p.vz * dt; p.y = .06; p.m.position.set(p.x, p.y, p.z); if (p.rest > 7) { const u = clamp((p.rest - 7) / 1.2, 0, 1); p.m.scale.setScalar(1 - u); if (u >= 1) { scene.remove(p.m); TRASH.splice(i, 1); } } continue; }
    p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < .06) { p.y = .06; if (Math.abs(p.vy) > .8 && p.bn < 3) { p.vy *= -.35; p.vx *= .6; p.vz *= .6; p.bn++; p.rx *= .6; p.rz *= .6; if (p.bn === 1 && Math.random() < .3) { try { flowSfx('bounce', .35); } catch (e) { } } } else { p.vy = 0; p.rest = .001; } }
    p.m.position.set(p.x, p.y, p.z); if (p.vy !== 0) { p.m.rotation.x += p.rx * dt; p.m.rotation.z += p.rz * dt; }
  }
}
/* ---------- 主審驅逐出場：主審吹哨＋舉手勢＋紅牌＋大字幕，被驅逐者再走回休息室 ---------- */
let EJ_CARD = null;
function ejectScene(info, cb) {
  info = info || {}; const e = $('ejectBanner'), um = E.ump;
  if (e) { e.querySelector('.ej-s').textContent = `${info.role || ''} ${info.name || ''}${info.why ? '　' + info.why : ''}`.trim(); e.classList.remove('hide', 'show'); void e.offsetWidth; e.classList.add('show'); clearTimeout(ejectScene.h); ejectScene.h = setTimeout(() => e.classList.add('hide'), 2750); }
  toast('驅逐出場！', '#fff', '#e22'); flowSfx('whistle'); flowSfx('out', .9); flashScreen(.3); CAMC.shake = Math.max(CAMC.shake || 0, .25); crowdCheer(1.2);
  if (um) {
    um.anim = { name: 'eject', t: 0, dur: 2.2, opt: {} };
    um.root.traverse(o => { if (o.isMesh && o.material && o.material.transparent && o.material.opacity < .9) { o._ejOp = o.material.opacity; o.material.opacity = .95; } });      // 主審平時半透明：驅逐時變清楚
    try {
      if (EJ_CARD) scene.remove(EJ_CARD.m);
      const m = new THREE.Mesh(new THREE.BoxGeometry(.42, .6, .03), new THREE.MeshBasicMaterial({ color: 0xe00000 })); m.position.set(um.root.position.x, 3.2, um.root.position.z); scene.add(m); EJ_CARD = { m, t: 0 };
    } catch (err) { }
    setTimeout(() => { um.root.traverse(o => { if (o._ejOp != null) { o.material.opacity = o._ejOp; o._ejOp = null; } }); if (EJ_CARD) { scene.remove(EJ_CARD.m); EJ_CARD = null; } }, 2300);
  }
  if (cb) after(2.0, cb);
}
function updateEjectCard(dt) { const c = EJ_CARD; if (!c || !E.ump) return; c.t += dt; const u = Math.min(1, c.t / .25); c.m.position.set(E.ump.root.position.x + .35, 2.6 + .6 * u + Math.sin(c.t * 9) * .08, E.ump.root.position.z); c.m.rotation.z = Math.sin(c.t * 9) * .25 - .2; c.m.scale.setScalar(.3 + .7 * u); }
function ejectWalk(side, cb) {      // 被驅逐的投手低頭走回休息室
  const f = E.F.P; if (!f || !f.rig) { cb(); return; }
  const sx = side === 1 ? 19 : -19; E.walk = { f, rig: f.rig, t: 0, tx: sx, tz: -7, cb, sp: 4.9, x0: f.x, z0: f.z }; f.rig.anim = null; f.wait = 0; f.hold = 0;
  say(`<em>${f.pl ? f.pl.name : '投手'}</em>被驅逐，低著頭走回休息室…`);
}
function updateEjectWalk(dt) {
  const W = E.walk; if (!W) return; W.t += dt; const f = W.f, d = dist2(f.x, f.z, W.tx, W.tz);
  if (d > .8 && W.t < 6.5) { f.tx = W.tx; f.tz = W.tz; f.sp = W.sp; f.wait = 0; f.hold = 0; }      // 交給 moveFielder 帶著走（有跑步／走路動畫、自動轉身）
  else { f.v = 0; f.rig.run = 0; f.x = W.x0; f.z = W.z0; f.tx = f.x; f.tz = f.z; E.walk = null; W.cb(); }      // 走到休息室：座標還給投手丘，再由接替的投手上場
}
function hbpEvent(pt) {
  const p = pt.p, b = curBatter(), side = 1 - G.half, T = G.teams[side], part = pt.hbpPart || 'torso', I = HBP_PART[part], K = G.evt === 2 ? 1.7 : 1, head = part === 'head';
  p.hbp++; G.hbpN[side]++; T.hbpTension++; adjustTilt(p, 8);
  const streak = p.hbpAt != null && G.pitchNo - p.hbpAt <= 24; p.hbpAt = G.pitchNo;       // 同一投手連續兩次觸身
  if (!G.evt) { awardBase('HBP'); return; }
  const streakEj = streak && Math.random() < .25 + (head ? .2 : 0) + (T.warned ? .15 : 0) + Math.max(0, T.hbpTension - 2) * .05;
  const ko = head && !b.isPitcherBat && Math.random() < clamp((.09 + Math.max(0, pt.kmh - 135) * .004 + Math.max(0, (pt.lv || 3) - 4) * .01) * K, 0, .4);      // 頭部觸身：球速越快、球威（變化等級）越高，越容易直接昏倒      // 頭部被打中：有機會直接昏倒
  // 惡意觸身球：同一投手累積 3 次、頭部被打中 2 次、警告後再中、或高速頭部觸身 → 直接驅逐
  const cnt = G.hbpN[side], reckless = p.hbp >= 2 && (streakEj || (ko && Math.random() < .25) || p.hbp >= 3 || (head && p.hbp >= 2) || (T.warned && cnt >= 3) || (head && pt.kmh >= 148 && T.hbpTension >= 3));      // 同一投手只投出第一顆觸身球：一律不算惡意
  if (!reckless && !T.warned && cnt >= 2) { T.warned = true; say('<em>主審對雙方球隊發出警告：再有觸身球將直接驅逐投手！</em>'); toast('警告！', '#fff', '#c60'); }
  const inj = b.isPitcherBat ? 0 : (I.inj * .3 + Math.max(0, pt.kmh - 148) * .0012) * K;
  const ang = clamp((.07 + (T.hbpTension - 1) * .08 + (b.pow > 85 ? .06 : 0) + (pt.kmh > 148 ? .05 : 0) + (head ? .14 : 0) + (lateGame() && Math.abs(runDiff(G.half)) <= 1 ? .05 : 0) + (G.hbpN[1 - side] > 0 ? .06 : 0)) * K, 0, .85);
  const finish = () => {
    if (G.over) return;
    if (reckless) {
      toast('惡意觸身球！', '#fff', '#e22'); flowSfx('out'); G.log.push('惡意觸身驅逐'); p.hbpBrawl = true;
      say(`<em>主審認定 ${p.name} ${streak ? '連續觸身' : '多次觸身'}、有惡意，驅逐出場！</em>`);
      ejectScene({ role: '投手', name: p.name, why: streak ? '連續觸身・惡意傷人' : '多次觸身・惡意傷人' });
      after(.8, () => { try { trashProtest(); } catch (e) { console.error(e); } });
      after(1.6, () => pitcherRage(2.2, () => ejectWalk(side, () => { if (G.over) return; if (!removePitcher(side, 'eject')) return; updatePlayerBoxes(); after(.9, () => { if (!G.over) awardBase('HBP'); }); }))); return;
    }
    awardBase('HBP');
  };
  const down = () => { if (E.bat) { E.bat.rig.run = 0; E.bat.rig.anim = { name: 'writhe', t: 0, dur: 1e9, opt: { hold: true } }; } crowdCheer(0); flowSfx('whistle'); };
  if (ko) {                                         // 昏倒：醫護人員＋擔架上場，送醫急救，不能再上場
    koScene(b, pt, () => injCutscene('打者昏倒，送醫急救！', `${b.name}　頭部遭球直接擊中、失去意識，已由擔架抬出場外送醫急救，不得再上場！`, 3.4, () => {
      b.hospital = true; const old = b, sub = pickSub(G.half, old.pos, true), s2 = subInto(G.half, old, sub);
      if (E.bat) { E.bat.rig.anim = null; if (s2) E.bat.pl = s2; } if (E.F.P && E.F.P.rig) E.F.P.rig.anim = null; medicLeave();
      say(`${s2 ? '代跑／代打 ' + s2.name + ' 上場' : '換人'}。昏倒的打者仍判上一壘，${b.name}已被送往醫院`); updatePlayerBoxes(); G.log.push('昏倒送醫'); after(1.4, finish);
    })); return;
  }
  const r = Math.random();
  if (r < inj) {                                   // 重傷：倒地痛苦起不了身，必須退場
    const why = pick(HBP_WHY[part]); down(); say(`<em>${b.name}被球砸中${I.n}！</em>倒在地上痛苦翻滾，遲遲起不了身…`);
    after(1.8, () => injCutscene('打者被球擊傷！', `${b.name}　${why}，必須退場！`, 2.8, () => {
      const old = b, sub = pickSub(G.half, old.pos, true), s2 = subInto(G.half, old, sub);
      if (E.bat && s2) E.bat.pl = s2; say(`${s2 ? '代跑／代打 ' + s2.name + ' 上場' : '換人'}。受傷的打者仍判上一壘`); updatePlayerBoxes(); after(.8, finish);
    })); return;
  }
  if (r < inj + ang) { pt.reckless = reckless; startBrawl(pt, ang); return; }
  // 一般觸身：依部位倒地疼痛，再起身上壘；腿部被打到會跛行、甚至永久降低跑速
  down(); const pain = I.pain * (.85 + Math.random() * .4); if (adjustMood) adjustMood(b, head ? -12 : -6);
  say(`<em>${b.name}被球砸中${I.n}！</em>${head ? '倒地抱頭，全場一片安靜…' : '痛得倒在地上翻滾…'}`);
  after(pain, () => {
    if (G.over) return; let leg = false; if (E.bat) E.bat.rig.anim = null;
    if (I.leg) {
      leg = true; b.limpKey = G.inning * 2 + G.half; b.limpMul = I.leg;
      if (Math.random() < (part === 'knee' ? .5 : .32) * K) { b.injLeg = 1; b.spd = Math.max(30, Math.round(b.spd * .8)); say(`<em>${b.name}傷到${I.n}，跑速明顯下降了！</em>`); }
      else say(`${b.name}勉強起身，一跛一跛地走向一壘…`);
    } else if (head) say(`${b.name}被攙扶起身，仍有點頭暈。`);
    // 電腦隊：腿傷或傷勢明顯時自動換代跑；玩家隊需自行用「代打／代跑」換人
    if (leg && G.human !== G.half && !b.isPitcherBat) {
      const close = lateGame() && Math.abs(runDiff(G.half)) <= 2, want = b.injLeg ? .92 : close ? .6 : .35;
      if (Math.random() < want) { const sub = pickSub(G.half, b.pos, true); if (sub && sub.spd > b.spd) { const s2 = subInto(G.half, b, sub); if (E.bat && s2) { E.bat.pl = s2; say(`${sideName(G.half)}換上 <em>${s2.name}</em> 代跑`); toast('代跑', '#fff', '#39f'); G.log.push('代跑'); updatePlayerBoxes(); } } }
    } else if (leg && G.human === G.half) toast('球員腿部受傷，可在壘上用「代打／代跑」換人', '#fff', '#c60');
    finish();
  });
}
/* ---------------- 板凳清空衝突 ---------------- */
function mkBrawlExtra(side, i) {
  const st = teamStyle(side); const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, helmet: false }); scene.add(rig.root);
  const dir = side === 1 ? 1 : -1; rig.root.position.set(dir * 24 + rnd() * 2, 0, -5 + (i % 8) * 1.5); rig.run = 1.6;
  return { rig, side, x: rig.root.position.x, z: rig.root.position.z, tx: (Math.random() - .5) * 5.4, tz: MOUND.z + (Math.random() - .5) * 5.4, arr: false };
}
/* ---------- 血跡：臉上血痕、地上血漬 ---------- */
const BLOOD = { splats: [], mat: new THREE.MeshBasicMaterial({ color: 0xa80808 }) };
function addBloodFace(rig) { if (!rig || !rig.head || rig._blood) return; const g = new THREE.Group(); for (const q of [[.14, -.12, .475, .15, .2], [-.2, .02, .47, .1, .15], [0, -.3, .45, .22, .07], [-.05, .18, .48, .06, .14]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(q[3], q[4]), BLOOD.mat); m.position.set(q[0], q[1], q[2]); g.add(m); } rig.head.add(g); rig._blood = g; }
function removeBloodFace(rig) { if (rig && rig._blood && rig.head) { rig.head.remove(rig._blood); rig._blood = null; } }
function addBloodSplat(x, z, sz) { return; /* 已停用：不再產生地上血泊 */ 
   const m = new THREE.Mesh(new THREE.CircleGeometry(sz, 10), new THREE.MeshBasicMaterial({ color: 0x7a0a0a, transparent: true, opacity: .85, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, .07 + Math.random() * .01, z); scene.add(m); BLOOD.splats.push(m); if (BLOOD.splats.length > 80) scene.remove(BLOOD.splats.shift()); }
function clearBlood() { BLOOD.splats.forEach(m => scene.remove(m)); BLOOD.splats.length = 0; }
/* ---------- 頭部觸身昏倒：醫護人員＋擔架上場，送醫急救 ---------- */
function koScene(b, pt, done) {
  const P = E.F.P, bd = E.bat; if (!bd) { done(); return; }
  bd.rig.run = 0; bd.rig.anim = { name: 'ko', t: 0, dur: 1e9, opt: { hold: true } }; if (P && P.rig) P.rig.anim = { name: 'kneel', t: 0, dur: 1e9, opt: { hold: true } };
  toast('打者昏倒！', '#fff', '#e22'); flowSfx('whistle'); crowdCheer(0); CAMC.shake = .15; adjustTilt(pt.p, 25);
  say(`<em>${b.name}被球砸中頭部，整個人倒在地上一動也不動！</em>全場鴉雀無聲，醫護人員緊急衝上場…`);
  const sx = G.half === 1 ? 24 : -24, list = [];
  for (let i = 0; i < 3; i++) { const rig = makeChibi({ jersey: '#f4f4f4', pants: '#2a5ca8', cap: '#f4f4f4', belt: '#222' }); scene.add(rig.root); const z0 = -6 + i * 1.4; rig.root.position.set(sx, 0, z0); rig.run = 1.8; list.push({ rig, x: sx, z: z0, tx: bd.x + (i - 1) * .9 + (bd.side > 0 ? -.4 : .4), tz: bd.z + .9 - (i === 1 ? .5 : 0), arr: false }); }
  const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, .12, .7), new THREE.MeshLambertMaterial({ color: 0xdcdcdc })); st.position.set(sx, .35, -4.5); scene.add(st);
  const crM = new THREE.MeshBasicMaterial({ color: 0x2aa84a }); for (const d of [[.3, .02, .08], [.08, .02, .3]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), crM); cr.position.set(.9, .07, 0); st.add(cr); }
  E.medic = { list, st, sx, state: 'in', t: 0, bx: bd.x + (bd.side > 0 ? -1.1 : 1.1), bz: bd.z + .2, done, P, vic: null, vw: null, hid: null, gone: false, trip: 0, g1: false, g2: false };
}
function medicLeave() { const M = E.medic; if (!M) return; if (M.gone) { clearMedic(); return; } M.state = 'out'; M.t = 0; for (const m of M.list) { m.tx = M.sx; m.tz = -6; m.arr = false; m.rig.anim = null; m.rig.run = 1.5; } }
function clearMedic() { const M = E.medic; if (!M) return; for (const m of M.list) scene.remove(m.rig.root); scene.remove(M.st); if (M.hid && M.hid.root) M.hid.root.visible = true; E.medic = null; }
/* 醫護把昏倒的打者抬上擔架，沿途出現搞笑橋段（絆倒晃動、打者忽然舉手比讚又倒回去），再抬出場外 */
function medicLoad(M) {
  const bd = E.bat; if (!bd) { medicFinish(M); return; }
  const st = teamStyle(G.half), vr = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, helmet: true, pl: bd.pl });
  if (vr.root.children[0]) vr.root.children[0].visible = false;                 // 腳下陰影不要跟著躺平
  vr.root.rotation.y = -Math.PI / 2; const vw = new THREE.Group(); vw.add(vr.root); vw.rotation.z = -Math.PI / 2; vw.position.set(-1.1, 1.0, 0); M.st.add(vw);
  M.vic = vr; M.vw = vw; M.hid = bd.rig; bd.rig.root.visible = false;
  for (const m of M.list) { m.rig.anim = null; m.rig.run = 0; }
  M.state = 'load'; M.t = 0; flowSfx('mitt', .7);
  say(`<em>醫護人員小心翼翼地把${bd.pl.name}抬上擔架…</em>`);
}
function medicFinish(M) {
  for (const m of M.list) scene.remove(m.rig.root); scene.remove(M.st);
  M.gone = true; M.state = 'gone'; const f = M.done; M.done = null; f && f();
}
function medicCarry(M, dt) {
  const st = M.st, sp = st.position, tx = M.sx, tz = -4.5, dx = tx - sp.x, dz = tz - sp.z, d = Math.hypot(dx, dz);
  if (d < .7 || M.t > 11) { medicFinish(M); return; }
  const ux = dx / d, uz = dz / d, spd = M.trip > 0 ? 1.0 : 3.5, k = Math.min(d, spd * dt);
  sp.x += ux * k; sp.z += uz * k; st.rotation.y = Math.atan2(-uz, ux);
  if (M.trip > 0) { M.trip -= dt; const w = Math.sin(M.t * 24) * .34 * clamp(M.trip / .9, 0, 1); st.rotation.z = w; st.rotation.x = w * .6; if (M.trip <= 0) { st.rotation.z = 0; st.rotation.x = 0; const fm = M.list[2]; fm.rig.anim = null; } }
  else { st.rotation.z = Math.sin(M.t * 7) * .02; st.rotation.x = 0; }
  const put = (m, f, lat, run) => { m.x = sp.x + ux * f - uz * lat; m.z = sp.z + uz * f + ux * lat; m.rig.root.position.set(m.x, 0, m.z); faceRig(m.rig, tx, tz); m.rig.run = run; };
  const run = M.trip > 0 ? 0 : 1.5; put(M.list[0], -1.7, 0, run); put(M.list[2], 1.7, 0, M.trip > 0 ? 0 : 1.5); put(M.list[1], -3.2, .9, 1.6);
  if (!M.g1 && M.t > 1.0) {                       // 搞笑 1：前面的醫護絆倒，擔架劇烈晃動
    M.g1 = true; M.trip = .9; const fm = M.list[2]; fm.rig.anim = { name: 'down', t: 0, dur: 1, opt: { hold: true } };
    toast('哎呀！', '#fff', '#f90'); flowSfx('cheer', .7); crowdCheer(.6); CAMC.shake = .12;
    say('<em>抬擔架的醫護人員腳下一滑差點絆倒！</em>擔架劇烈晃動，打者差點滑下來…');
  }
  if (!M.g2 && M.t > 2.9 && M.vic) {              // 搞笑 2：昏倒的打者忽然舉手比讚，下一秒又倒回去
    M.g2 = true; M.vic.anim = { name: 'cheer', t: 0, dur: 1e9, opt: {} };
    toast('比讚！👍', '#fff27a', '#ff7a1a'); flowSfx('cheer', 1); crowdCheer(1.2);
    say('<em>昏倒的打者忽然舉起雙手比讚……</em>全場笑翻！');
    after(1.0, () => { if (M.vic) { M.vic.anim = null; } say('他又默默倒回擔架上，繼續被抬走…'); });
  }
}
function updateMedic(dt) {
  const M = E.medic; if (!M || M.gone) return; M.t += dt;
  for (const m of M.list) rigStep(m.rig, dt); if (M.vic) rigStep(M.vic, dt);
  const mv = (m, sp) => { const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz); if (d > .2) { const k = Math.min(d, sp * dt); m.x += dx / d * k; m.z += dz / d * k; m.rig.root.position.set(m.x, 0, m.z); faceRig(m.rig, m.tx, m.tz); return false; } m.rig.run = 0; return true; };
  if (M.state === 'in') {
    let all = true; M.list.forEach(m => { if (!m.arr) { if (mv(m, 6.6)) { m.arr = true; faceRig(m.rig, E.bat ? E.bat.x : 0, E.bat ? E.bat.z : 0); m.rig.anim = { name: 'kneel', t: 0, dur: 1e9, opt: { hold: true } }; } else all = false; } });
    const sp = M.st.position, dx = M.bx - sp.x, dz = M.bz - sp.z, d = Math.hypot(dx, dz); if (d > .2) { const k = Math.min(d, 6.4 * dt); sp.x += dx / d * k; sp.z += dz / d * k; all = false; }
    if (all) { M.state = 'tend'; M.t = 0; flowSfx('mitt', .6); }
  } else if (M.state === 'tend') {
    if (M.t > 1.5) medicLoad(M);
  } else if (M.state === 'load') {
    const u = clamp(M.t / .7, 0, 1); M.vw.position.y = .38 + .55 * (1 - u) * (1 - u) * Math.abs(Math.cos(u * 8));
    if (u >= 1) { M.vw.position.y = .38; M.state = 'carry'; M.t = 0; }
  } else if (M.state === 'carry') {
    medicCarry(M, dt);
  } else if (M.state === 'out') {
    let all = true; M.list.forEach(m => { if (!mv(m, 5.2)) all = false; });
    const sp = M.st.position, dx = M.sx - sp.x, dz = -4.5 - sp.z, d = Math.hypot(dx, dz); if (d > .2) { const k = Math.min(d, 4.6 * dt); sp.x += dx / d * k; sp.z += dz / d * k; all = false; }
    if (all) clearMedic();
  }
}
function pitcherRage(dur, cb) {
  const f = E.F.P; if (!f || !f.rig) { cb(); return; }
  E.rage = { f, t: 0, dur, cb, x0: f.x, z0: f.z, tx: -1.1, tz: MOUND.z + 8.5, bt: 0 };
  f.rig.anim = { name: 'rage', t: 0, dur: 1e9, opt: { hold: true } };
  toast('投手暴怒！', '#fff', '#e22'); flowSfx('cheer', 1.2); crowdCheer(1.2); CAMC.shake = .2;
  say(`<em>${f.pl ? f.pl.name : '投手'}氣炸了！</em>氣得跳腳，衝向本壘板和主審理論！`);
}
function updateRage(dt) {
  const R = E.rage; if (!R) return; R.t += dt; const f = R.f, u = clamp(R.t / 1.1, 0, 1), e = u * u * (3 - 2 * u);
  f.x = lerp(R.x0, R.tx, e); f.z = lerp(R.z0, R.tz, e); f.tx = f.x; f.tz = f.z; f.rig.root.position.set(f.x, 0, f.z); faceRig(f.rig, 0, 0);
  R.bt -= dt; if (R.bt <= 0) { R.bt = .33; spawnBurst(f.x + (Math.random() - .5) * .8, 2.3 + Math.random() * .5, f.z, .5, '#ff3020'); }
  if (R.t >= R.dur) { E.rage = null; f.x = R.x0; f.z = R.z0; f.tx = f.x; f.tz = f.z; f.rig.root.position.set(f.x, 0, f.z); f.rig.anim = null; f.rig.run = 0; faceRig(f.rig, 0, 0); R.cb(); }
}
function startBrawl(pt, anger) {
  G.brawlN++; G.phase = 'brawl'; const B = { kind: 'brawl', st: 'rush', t: 0, mash: 0, extras: [], pt, anger, dur: 3.6, batX: E.bat ? E.bat.x : 0, batZ: .35 };
  EV.brawl = B; $('brawlBanner').classList.remove('hide'); flowSfx('cheer', 1.8); crowdCheer(1.5); flashScreen(.25);
  for (let i = 0; i < 8; i++) { B.extras.push(mkBrawlExtra(0, i)); B.extras.push(mkBrawlExtra(1, i)); }
  const b = curBatter(), p = pt.p;
  say(`<em>觸身球！${b.name}不爽了，丟下球棒走向投手丘！</em>${p.name}也不甘示弱…雙方休息室全員衝出來了！！`); toast('板凳清空！', '#fff', '#e22');
  CAMC.mode = 'play'; lastFocus.set(0, 1.4, MOUND.z); CAMC.shake = .2;
  for (const pos of POS_LIST) { const f = E.F[pos]; if (pos === 'P') continue; f.tx = (Math.random() - .5) * 4.4; f.tz = MOUND.z + 1.5 + (Math.random() - .5) * 4; f.sp = 7.5; f.cover = null; f.hasBall = false; }
  const P = E.F.P; faceRig(P.rig, E.bat ? E.bat.x : 0, 1); P.rig.anim = { name: 'rage', t: 0, dur: 1e9, opt: { hold: true } };
  if (E.bat) { E.bat.rig.bat.visible = false; E.bat.rig.anim = null; E.bat.rig.run = 1.8; }
  after(1.9, () => beginMash());
}
function beginMash() {
  const B = EV.brawl; if (!B) return; B.st = 'mash'; B.t = 0; B.mash = 0;
  const humanBat = G.human === G.half, humanPit = G.human === 1 - G.half;
  B.humanSide = humanBat ? 'bat' : humanPit ? 'pit' : null;
  $('brawlBanner').textContent = '⚾ 觸身球！雙方球員衝出休息室，場面一片混亂！ ⚾';
  if (B.humanSide) { $('mashUi').classList.remove('hide'); $('mashTx').textContent = humanBat ? '連按【空白鍵】或連點滑鼠：衝向投手！' : '連按【空白鍵】或連點滑鼠：穩住隊友、壓住場面！'; $('mashBar').style.width = '0%'; }
  else say('兩隊球員在投手丘周圍推擠拉扯，裁判團努力拉開雙方…');
}
function registerMash() {
  const B = EV.brawl; if (!B) return; if (B.kind === 'protest') { B.mash += 1.5; B.idle = 0; return; }
  if (B.st === 'mash') { B.mash += 1.5; B.idle = 0; if (E.bat && G.human === G.half) E.bat.rig.root.position.y = .05; }
}
function updateBrawl(dt) {
  const B = EV.brawl; if (!B) return; B.t += dt;
  // 連按進度條：只要停手就快速掉回去，玩家必須持續狂按才能維持（電腦自動累積的一方不衰減）
  if (B.kind === 'protest' || (B.st === 'mash' && B.humanSide)) { B.idle = (B.idle == null ? 0 : B.idle) + dt; const dec = 1.0 + (B.idle > .6 ? 5 : 0); B.mash = Math.max(0, B.mash - dec * dt); }
  if (B.kind !== 'protest' && B.st === 'mash' && !B.humanSide) B.mash += dt * (B.cpuRate || (B.cpuRate = 4 + Math.random() * 11));      // 電腦對電腦：自動累積激烈程度
  if (B.kind === 'protest') {
    const pct = clamp(B.mash / 24, 0, 1); $('mashBar').style.width = pct * 100 + '%'; $('mashTx').textContent = pct < .3 ? '連點 / 連按空白鍵 來向主審抗議！' : pct < .8 ? '🔥 氣勢夠了！再激動一點，主審可能會改判！' : '⚠ 快過火了！再吵下去有被驅逐的風險！';
    if (B.t >= B.dur) { EV.brawl = null; $('mashUi').classList.add('hide'); const p = pct; runProtest(B.team, B.call, B.finish, .15 + p * .85); }
    return;
  }
  // 打者衝向投手丘、外圍球員跑過來
  if (E.bat && B.st !== 'done') { const r = E.bat.rig, tx = -.7, tz = MOUND.z + 1.3, dx = tx - r.root.position.x, dz = tz - r.root.position.z, d = Math.hypot(dx, dz); if (d > .8) { const s = 7.5 * dt; r.root.position.x += dx / d * s; r.root.position.z += dz / d * s; faceRig(r, tx, tz); r.run = 1.8; } else { r.run = 0; r.anim = { name: 'scrum', t: 0, dur: 1e9, opt: { hold: true } }; } }
  for (const e of B.extras) { const r = e.rig, dx = e.tx - r.root.position.x, dz = e.tz - r.root.position.z, d = Math.hypot(dx, dz); if (d > .7) { const s = 7 * dt; r.root.position.x += dx / d * s; r.root.position.z += dz / d * s; faceRig(r, e.tx, e.tz); r.run = 1.6; } else if (!e.arr) { e.arr = true; r.run = 0; r.anim = { name: 'scrum', t: 0, dur: 1e9, opt: { hold: true } }; } }
  for (const pos of POS_LIST) { const f = E.F[pos]; if (pos === 'P') { if (B.t > 1.2 && (!f.rig.anim || f.rig.anim.name === 'rage')) f.rig.anim = { name: 'scrum', t: 0, dur: 1e9, opt: { hold: true } }; continue; } if (Math.hypot(f.tx - f.x, f.tz - f.z) < .4 && !f.rig.anim) f.rig.anim = { name: 'scrum', t: 0, dur: 1e9, opt: { hold: true } }; }
  if (B.st === 'mash') {
    const pct = clamp(B.mash / 26, 0, 1);
    if (B.humanSide) $('mashBar').style.width = pct * 100 + '%';
    const stage = pct >= .85 ? 3 : pct >= .6 ? 2 : pct >= .35 ? 1 : 0; if (stage > (B.stage || 0)) {
      B.stage = stage; CAMC.shake = .3 + stage * .14; flowSfx('cheer', 1 + stage * .3); crowdCheer(1.4); flashScreen(.18 + stage * .08);
      if (stage >= 1) { addBloodFace(E.bat && E.bat.rig); addBloodFace(E.F.P.rig); }
      B.extras.forEach((e, i) => { if (stage >= 2 && i % (stage === 2 ? 4 : 2) === 0) { e.arr = true; e.rig.run = 0; e.rig.anim = { name: 'writhe', t: 0, dur: 1e9, opt: { hold: true } }; } });
      if (stage === 3) { toast('場面失控！', '#fff', '#a00'); say('<em>拳頭、腳踢、場面一片混亂！球員一個接一個倒在地上！</em>'); }
    }
    B.bt = (B.bt || 0) - dt;
    if (stage >= 1 && B.bt <= 0) { B.bt = .2 - stage * .04; const n = stage; for (let k = 0; k < n; k++) { const x = MOUND.x + (Math.random() - .5) * 6, z = MOUND.z + (Math.random() - .5) * 6; } }
    if (B.t >= B.dur) finishBrawl(pct);
  }
}
function finishBrawl(pct) {
  const B = EV.brawl; B.st = 'done'; $('mashUi').classList.add('hide');
  const L = lvl(), p = B.pt.p, b = curBatter();
  const aiA = clamp(32 + Math.random() * 38 + (G.teams[1 - G.half].hbpTension - 1) * 5 + B.anger * 20, 15, 96), mine = pct * 100;
  let ba, pa; if (B.humanSide === 'bat') { ba = mine; pa = aiA; } else if (B.humanSide === 'pit') { pa = mine; ba = clamp(aiA + 6, 15, 98); } else { ba = clamp(30 + Math.random() * 55, 15, 96); pa = clamp(30 + Math.random() * 55, 15, 96); }
  const I = B.humanSide ? pct : clamp(B.mash / 26, 0, 1), g = .02 + .98 * Math.pow(I, 1.3), chaos = Math.max(ba, pa) / 100, pSide = 1 - G.half, T = G.teams[pSide], rep = Math.max(0, T.hbpTension - 1);
  const pitchEj = !!B.pt.reckless || Math.random() < clamp((.03 + rep * .10 + Math.pow(chaos, 1.6) * .5 + (pa > ba ? .04 : 0)) * g, 0, .92);
  const batEj = !b.isPitcherBat && Math.random() < clamp((Math.max(0, ba - 40) / 60 * .62 + chaos * .08) * g, 0, .8);
  const coachEj = Math.random() < .07 * chaos * g * (G.absOn ? 1 : 0);
  const margin = ba - pa, ij = Math.pow(clamp((I - .35) / .5, 0, 1), 1.4);      // 受傷機率隨混戰激烈程度（ij）快速上升：不激烈時幾乎不會有人受傷
  const brutal = Math.max(0, I - .6) * .45, pitHurt = (margin > 10 && Math.random() < clamp((ba - 70) * .014, 0, .35) * g * ij) || Math.random() < brutal * .4;
  const batHurt = !b.isPitcherBat && ((margin < -10 && Math.random() < clamp((pa - 70) * .014, 0, .3) * g * ij) || Math.random() < brutal * .3);
  // 全員歸位
  for (const e of B.extras) { e.rig.run = 1.5; e.rig.anim = null; e.rig.root.position.y = 0; }
  const back = () => { for (const e of B.extras) scene.remove(e.rig.root); B.extras = []; };
  setTimeout(back, 1200);
  { const rg = [E.bat && E.bat.rig, E.F.P.rig]; after(7, () => rg.forEach(removeBloodFace)); }
  for (const pos of POS_LIST) { const f = E.F[pos]; f.rig.anim = (pos === 'C') ? { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } } : null; }
  resetFormation(false); $('brawlBanner').classList.add('hide');
  const msgs = []; let injured = null;
  { const hurtF = [];                                  // 混戰太激烈：場上野手也可能被打傷，必須換人
    if (I > .6) for (const pos of POS_LIST) { if (pos === 'P' || hurtF.length >= (I > .85 ? 2 : 1)) continue; const f = E.F[pos]; if (!f || !f.pl || f.pl.out) continue; if (Math.random() < clamp((I - .55) * .3, 0, .22) * (G.evt === 2 ? 1.5 : 1)) hurtF.push(f); }
    for (const f of hurtF) { queueInj({ type: 'field', side: pSide, pl: f.pl, pos: f.pos || pos0(f), why: pick(['在混戰中被人打中臉部，血流不止', '被推倒後腳踝扭傷，無法站起來', '肋骨被踹中，痛到蜷縮在地', '被人一拳打中眼眶，視線模糊']) }); f.rig.anim = { name: 'writhe', t: 0, dur: 1e9, opt: { hold: true } }; msgs.push(`${f.pl.name}在混戰中被打傷倒地，無法繼續比賽！`); }
    function pos0(f) { return POS_LIST.find(q => E.F[q] === f); } }
  if (pitHurt) { injured = 'pit'; msgs.push(`${p.name}被${b.name}打成重傷，被迫退場！`); }
  else if (pitchEj) msgs.push(`投手 ${p.name} 被主審驅逐出場！`);
  if (batEj) msgs.push(`打者 ${b.name} 率先衝上投手丘，被主審驅逐出場！`);
  if (batHurt) msgs.push(`${b.name}在混戰中受傷，無法繼續比賽！`);
  if (coachEj) { G.coachOut[G.half] = true; msgs.push(`${sideName(G.half)}總教練也被驅逐，本場無法再用 ABS 挑戰！`); updateAbsHud(); }
  if (G.coach) G.log.push('板凳清空');
  if (msgs.length) { toast(pitHurt ? '投手被打傷！' : '驅逐出場！', '#fff', '#e22'); flowSfx('out'); }
  else toast(ba > pa ? '打者佔上風' : '被及時拉開', '#ffe08a', '#c60');
  say(msgs.length ? `<em>${msgs.join(' ')}</em>` : `${ba > pa ? '打者氣勢較盛' : '裁判團及時把雙方拉開'}，沒有人被驅逐。比賽將繼續，${b.name}上一壘。`);
  EV.brawl = null; G.phase = 'inplay-wait';
  after(1.8, () => {
    if (G.over) return;
    if (pitHurt || pitchEj) {
      p.hbpBrawl = true; if (pitHurt) { injCutscene('投手被打傷退場！', `${p.name}　${pick(['被當場撲倒在投手丘上，肋骨疑似挫傷', '手腕遭用力扭轉，痛苦地按著手臂', '肩膀脫臼，必須退場'])}`, 2.4, () => { cont(); }); return; }
    }
    cont();
    function cont() {
      if (pitchEj && !pitHurt && !p._raged) { p._raged = true; ejectScene({ role: '投手', name: p.name, why: B.pt.reckless ? '惡意觸身・引發衝突' : '參與肢體衝突' }); after(1.6, () => pitcherRage(2.0, () => ejectWalk(pSide, cont))); return; }
      if (batEj && !b._ejShown) { b._ejShown = true; ejectScene({ role: '打者', name: b.name, why: '率先衝上投手丘' }, cont); return; }
      if (pitHurt || pitchEj) { if (!removePitcher(pSide, pitHurt ? 'injury' : 'eject')) return; }
      if (batEj || batHurt) { const sub = pickSub(G.half, b.pos, true), s2 = subInto(G.half, b, sub); if (E.bat && s2) E.bat.pl = s2; if (s2) say(`${sideName(G.half)}換上 ${s2.name} 代跑`); }
      updatePlayerBoxes(); after(.9, () => { if (!G.over) awardBase('HBP'); });
    }
  });
}
function updateEvents(dt) {
  if (!EV.abs && G.absPend && G.phase === 'pre') { const tot = G.pitchDelay + 3.6; $('absBarI').style.width = (humanPitches() ? 100 : clamp((tot - G.preT) / tot * 100, 0, 100)) + '%'; }
  if (EV.abs) { EV.abs.t -= dt; $('absBarI').style.width = clamp(EV.abs.t / EV.abs.max * 100, 0, 100) + '%'; if (EV.abs.t <= 0) { const bt = $('absGo'); absResolveInput(false); bt.textContent = 'ABS 挑戰'; $('absTitle').textContent = '🦅 ABS 挑戰'; } }
  if (G.lastLoc) G.lastLoc.t += dt;
  updateBrawl(dt); updateArgCoach(dt); updateRage(dt); updateEjectWalk(dt); updateEjectCard(dt); updateMedic(dt);
}
const _rs2 = rigStep;
rigStep = function (r, dt) {
  if (r.anim && r.anim.name === 'scrum') { r.t += dt; const s = Math.sin(r.t * (9 + (r.root.id % 5))), c = Math.cos(r.t * 7); setRigPose(r, { bx: .3, by: s * .5, alx: -1.9 + s * .7, arx: -1.9 - s * .7, llx: s * .3, lrx: -s * .3, y: Math.abs(c) * .12 }); return; }
  _rs2(r, dt);
};


