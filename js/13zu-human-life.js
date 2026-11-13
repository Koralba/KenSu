/* ===== 13zu-human-life.js ｜ 真人感層（v1.3.7）：個性＋情緒＋日常行為 =====
   純外觀、不改任何模擬狀態（座標、時序、判定）。亂數只用自己的 LCG（不碰 Math.random）；快轉（window.__ff）、區網對戰、練習都略過（cosmeticOK）；鏡頭 >46 的球員略過。
   架構：沿用 13zs 的做法——動作姿勢登錄進 NT_ACT（由 13zs 的 rigStep 包裝在原姿勢之後疊上去），所以蹲姿 IK、落地修正照常運作；本檔只負責「何時、由誰、做什麼」。
   A. 個性 HU.pers(rig)：每位球員由名字雜湊出固定個性（開朗／緊張／火爆／愛聊天／嚼口香糖／虔誠／老手），同一個人每場表現一致，不同人差很多。
   B. 表情微變化：待機時偶爾出現嚼口香糖、打哈欠、緊張、害羞、微笑、吹口哨…（依個性＋局面壓力＋心情值），只動臉不動身體，打者也適用。
   C. 待機動作（新）：檢查手套、深呼吸、緊張原地輕跳、打哈欠、指天、脫帽致意、投手投球前的儀式；跑者整理手套／敲頭盔／輕跳；捕手摸面罩；主審撥計數器／轉脖子。
   D. 互動：相鄰野手互相轉頭聊天→點頭→一起笑；一壘手和壘上跑者閒聊（牽制中的真實場景）。
   E. 事件反應：三振後投手握拳／指天／致意、出局後投手比手勢謝謝接殺的野手、失誤後當事人道歉或懊惱＋投手安慰、美技後投手比讚＋隊友拍手、被轟後內野手難以置信、保送後投手調整呼吸、安打上壘後跑者慶祝、壞球判定後捕手搖頭。
   開關：`HU.on=false` 全關；或 HU.face／idle／chat／react 分項關。測試：`HU.dbg`。 */
'use strict';
const HU = { on: true, rs: 20261112, far: 46, face: true, idle: true, chat: true, react: true, n: {}, gAt: -1, dt: .016, chatT: 7, balls: 0, outs: 0, _e: 0 };
function huRnd() { HU.rs = (Math.imul(HU.rs, 1664525) + 1013904223) >>> 0; return HU.rs / 4294967296; }
function huHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function huMul(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function huNow() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function huOK() { try { return typeof cosmeticOK === 'function' ? cosmeticOK() : true; } catch (e) { return false; } }
function huErr(e) { if (!HU._e) { HU._e = 1; console.error('[hu]', e); } }
function huPers(r) {      /* 個性：由名字決定，終身不變 */
  if (r._hup) return r._hup; const nm = (r.pl && r.pl.name) || ('x' + Math.floor(huRnd() * 1e6)), g = huMul(huHash(nm));
  return (r._hup = { cheer: g(), nerv: g(), hot: g(), chat: g(), gum: g() < .38, faith: g() < .3, vet: g() < .35, hand: g() < .5 ? 1 : -1 });
}
function huRisp() { try { return !!(G.on && (G.on[1] || G.on[2])); } catch (e) { return false; } }
function huLev() {      /* 局面壓力 0～1：後段、分差小、得點圈有人、兩出局 */
  let v = 0; try { const d = Math.abs(G.score[0] - G.score[1]); if (G.inning >= G.innings - 2) v += .35; if (d <= 2) v += .3; if (huRisp()) v += .35; if (G.outs === 2) v += .1; } catch (e) { } return Math.min(1, v);
}
function huRole(r) { try { return ntRole(r, ntS(r)); } catch (e) { return null; } }
function huElig(r) {      /* 野手／捕手現在可以做小動作嗎（跟 13zk 同一套規則） */
  try { if (typeof hlEligible === 'function') return hlEligible(r); } catch (e) { } return !r.anim && r.run < .05 && !(typeof PL !== 'undefined' && PL) && G.phase === 'pre';
}
function huRunnerOK(r, u) { return u && u.state === 'on' && r.run < .05 && !r.anim && !(typeof PL !== 'undefined' && PL) && G.phase === 'pre' && !u.stall; }
function huYaw(r, a) {      /* 目標相對身體正前方的水平角（弧度，±π） */
  const o = a.opt || {}; let tx, tz; if (o.tgt && o.tgt.root) { tx = o.tgt.root.position.x; tz = o.tgt.root.position.z; } else if (o.tx != null) { tx = o.tx; tz = o.tz; } else return 0;
  const p = r.root.position; let y = Math.atan2(tx - p.x, tz - p.z) - r.root.rotation.y; while (y > Math.PI) y -= 6.2832; while (y < -Math.PI) y += 6.2832; return y;
}
const huK = (a, u) => { const o = a.opt || {}; let k = ntEnv(u); if (o.ab != null) k *= Math.max(0, 1 - o.ab / .3); return k; };
const huC = (v, m) => Math.max(-m, Math.min(m, v));
/* ---- 新臉 ---- */
if (typeof FACE !== 'undefined' && FACE.table) {
  Object.assign(FACE.table, {
    chew: { mC: .12, mW: .9, mO: .1, talk: .1, gz: 'fwd', spd: 8 },
    yawn: { lu: 1, ll: .3, bY: .3, bA: -.2, mC: -.1, mW: .85, mO: 1, mT: .5, mG: .5, gz: 'down', spd: 5 },
    nervous: { bY: .35, bA: -.6, mC: -.25, mW: .85, mO: .15, sw: .45, bl: .3, lu: .1, gz: 'fwd', spd: 8, talk: .05 },
    sheepish: { bY: .2, bA: -.5, mC: .3, mS: .55, mW: 1, bl: .8, lu: .25, gz: 'down', spd: 9 },
    relief: { lu: .65, bY: .1, bA: -.4, mC: .1, mO: .5, mR: 1, mW: .7, gz: 'up', spd: 8 },
    disbelief: { ew: .55, bY: .7, bA: -.35, mC: -.2, mO: .4, mW: .95, mR: .4, pu: .3, gz: 'fwd', spd: 12 },
    bored: { lu: .5, ll: .15, bY: -.1, bA: -.3, mC: -.1, mW: .85, gz: 'fwd' },
    chat: { mC: .2, mW: 1, mO: .28, talk: .2, bY: .15, gz: 'fwd', spd: 12 },
    listen: { mC: .25, mW: 1, bY: .2, bK: .3, gz: 'fwd' },
    whistle: { mR: 1, mO: .35, mW: .5, mC: .05, bY: .1, gz: 'up' },
    excited: { ew: .4, bY: .6, bA: .1, mC: .8, mW: 1.3, mO: .7, mT: 1, mG: .3, bl: .6, spd: 14 },
    determined: { lu: .35, ll: .2, bY: -.45, bA: .7, mC: -.1, mW: 1.1, mO: .1, mT: .8, pu: -.2, spd: 10 },
    pray: { lu: 1, ll: .2, bY: .2, bA: -.3, mC: .1, mW: .9, gz: 'up' }
  });
}
/* ---- 新動作姿勢（右手＝裸手；左手＝手套手）---- */
const HU_ACT = {
  hu_chat: { dur: 2.4, face: 'chat', pose(r, a, u) { const k = huK(a, u), y = huYaw(r, a), w = a.t; return { hy: huC(y, 1.1) * k + Math.sin(w * 2.3) * .06 * k, hx: .03 * k + Math.sin(w * 3.1) * .05 * k, by: huC(y * .5, .6) * k, arx: -.7 * k + Math.sin(w * 4.2) * .35 * k, are: .9 * k + Math.sin(w * 5.1) * .3 * k, arz: -.35 * k, alx: -.2 * k + Math.sin(w * 3) * .1 * k, ale: .3 * k }; } },
  hu_nod: { dur: 2.4, face: 'listen', pose(r, a, u) { const k = huK(a, u), y = huYaw(r, a), w = a.t; return { hy: huC(y, 1.1) * k, by: huC(y * .45, .5) * k, hx: .1 * k + Math.max(0, Math.sin(w * 4.4)) * .2 * k, alx: .05 * k, arx: .05 * k, ale: .2 * k, are: .2 * k }; } },
  hu_laugh: { dur: 1.5, face: 'laugh', pose(r, a, u) { const k = huK(a, u), y = huYaw(r, a), w = a.t; return { hx: -.25 * k + Math.sin(w * 14) * .05 * k, hy: huC(y * .5, .6) * k, bx: .08 * k + Math.sin(w * 14) * .05 * k, ale: 1.2 * k, are: 1.2 * k, alx: -.6 * k, arx: -.6 * k, y: Math.abs(Math.sin(w * 7)) * .015 * k }; } },
  hu_point: { dur: 1.5, face: 'smile', pose(r, a, u) { const k = huK(a, u), y = huYaw(r, a); return { hy: huC(y * .8, 1) * k, by: huC(y * .55, .7) * k, arx: -1.5 * k, arz: -.1 * k, are: .08 * k, alx: .05 * k, bx: -.02 * k }; } },
  hu_thumbs: { dur: 1.5, face: 'grin', pose(r, a, u) { const k = huK(a, u), y = huYaw(r, a), w = a.t; return { hy: huC(y * .7, 1) * k, by: huC(y * .5, .6) * k, arx: -1.25 * k, are: .75 * k, arz: -.15 * k, hx: -.05 * k, y: Math.abs(Math.sin(w * 6)) * .012 * k }; } },
  hu_glovecheck: { dur: 2.0, face: 'focus', pose(r, a, u) { const k = huK(a, u), w = a.t; return { ale: 1.35 * k, alx: -1.15 * k, alz: -.15 * k, arx: -.9 * k + Math.sin(w * 7) * .12 * k, are: 1.1 * k, arz: .1 * k, hx: .38 * k, bx: .07 * k }; } },
  hu_breath: { dur: 2.6, face: 'relief', pose(r, a, u) {
    const ab = a.opt && a.opt.ab != null ? Math.max(0, 1 - a.opt.ab / .3) : 1, c01 = v => Math.max(0, Math.min(1, v)), inh = sstep(c01(u / .42)), exh = sstep(c01((u - .42) / .4)), fade = 1 - sstep(c01((u - .86) / .14)), w1 = inh * (1 - exh) * ab, w2 = exh * fade * ab;
    return { hx: -.38 * w1 + .3 * w2, bx: .14 * w2, alz: .22 * w1, arz: -.22 * w1, ale: .1 * w2, are: .1 * w2, y: .03 * w1 - .03 * w2 };
  } },
  hu_bounce: { dur: 1.9, face: 'nervous', pose(r, a, u) { const k = huK(a, u), w = a.t, b = Math.abs(Math.sin(w * 9)); return { y: b * .05 * k, lke: .25 * b * k, rke: .25 * b * k, alx: -.35 * k, arx: -.35 * k, ale: .6 * k, are: .6 * k, alz: .15 * k, arz: -.15 * k, bz: Math.sin(w * 4.5) * .03 * k }; } },
  hu_yawn: { dur: 2.2, face: 'yawn', pose(r, a, u) { const k = huK(a, u); return { hx: -.45 * k, arx: -1.6 * k, are: 2.1 * k, arz: -.15 * k, bx: -.1 * k, alx: -.3 * k, ale: .2 * k, y: .02 * k }; } },
  hu_sky: { dur: 1.7, face: 'pray', pose(r, a, u) { const k = huK(a, u); return { arx: -2.95 * k, arz: -.15 * k, hx: -.55 * k, y: .03 * k, alx: .05 * k }; } },
  hu_tipcap: { dur: 1.5, face: 'smile', pose(r, a, u) { const k = huK(a, u); return { arx: -2.35 * k, are: 2.0 * k, arz: -.45 * k, hx: .28 * k, bx: .1 * k, hz: .1 * k }; } },
  hu_sorry: { dur: 1.8, face: 'sheepish', pose(r, a, u) { const k = huK(a, u), y = huYaw(r, a), w = a.t; return { arx: -1.8 * k, are: 1.4 * k, arz: -.3 * k + Math.sin(w * 6) * .08 * k, hx: .3 * k, hy: huC(y * .6, .8) * k, bx: .16 * k }; } },
  hu_disbelief: { dur: 1.9, face: 'disbelief', pose(r, a, u) { const k = huK(a, u), w = a.t; return { alz: .85 * k, arz: -.85 * k, ale: .7 * k, are: .7 * k, alx: -.4 * k, arx: -.4 * k, hy: Math.sin(w * 6) * .3 * k, hx: -.1 * k, bx: -.05 * k }; } },
  hu_rglove: { dur: 1.8, face: 'focus', pose(r, a, u) { const k = huK(a, u), tug = Math.max(0, Math.sin(a.t * 7)) * k; return { ale: 1.5 * k, are: 1.5 * k, alx: -.9 * k - .08 * tug, arx: -.9 * k - .08 * tug, alz: .2 * k, arz: -.2 * k, hx: .3 * k, bx: .06 * k }; } },
  hu_helmet: { dur: 1.6, face: 'focus', pose(r, a, u) { const k = huK(a, u), tap = Math.abs(Math.sin(a.t * 7)) * .12 * k; return { arx: -2.4 * k - tap, are: 2.1 * k, arz: -.5 * k, hx: .15 * k }; } },
  hu_clicker: { dur: 1.7, face: 'focus', pose(r, a, u) { const k = huK(a, u); return { arx: -.95 * k, are: 1.5 * k + Math.max(0, Math.sin(a.t * 9)) * .12 * k, hx: .35 * k, bx: .05 * k }; } },
  hu_cmask: { dur: 1.5, face: 'focus', pose(r, a, u) { const k = huK(a, u); return { bx: .35, alx: -1.1, llx: -.9, lrx: -.9, y: -.45, sq: 1, arx: -.4 - 1.7 * k, are: 1.9 * k, arz: -.3 * k, hx: .1 * k }; } },
  hu_cshake: { dur: 1.3, face: 'worry', pose(r, a, u) { const k = huK(a, u); return { bx: .35, alx: -1.1 - .15 * k, arx: -.4, llx: -.9, lrx: -.9, y: -.45, sq: 1, hy: Math.sin(a.t * 7) * .3 * k, hx: .1 * k }; } }
};
for (const k in HU_ACT) { NT_ACT[k] = HU_ACT[k]; if (typeof FX_ANIM !== 'undefined') FX_ANIM[k] = HU_ACT[k].face; }
/* ---- 開始一個動作（也可以用遊戲原有的動作名，例如 fistpump／hips） ---- */
function huStart(r, name, opt) {
  if (!r || !r.root) return false; const d = NT_ACT[name]; const o = Object.assign({ hlv: 1, hu: 1, hand: huPers(r).hand }, opt || {}), dur = o.dur || (d && d.dur) || 1.2, ro = huRole(r);
  r.run = 0; r.anim = { name, t: 0, dur, opt: o }; r.t = 0; if (ro && ro.k === 'F' && ro.pos === 'C') r._cRun = true;
  const face = o.face === false ? null : (o.face || (d && d.face)); if (face && typeof FACE !== 'undefined' && FACE.emote) FACE.emote(r, face, dur + .2);
  HU.n[name] = (HU.n[name] || 0) + 1; return true;
}
function huEnd(r) { r.anim = null; }
function huGuard(r, dt) {      /* 進行中的動作：球打進場內／要起跑立刻放掉；不是投球前的階段就在 0.3 秒內淡出（事件反應 any＝不管階段） */
  const a = r.anim, o = a.opt;
  if (G.over || G.mode !== 'play' || r.run > .05 || (!o.keep && typeof PL !== 'undefined' && PL)) { huEnd(r); return; }
  if (!o.any) { const ph = G.phase; if (ph !== 'pre' && ph !== 'windup') { o.ab = (o.ab || 0) + dt; if (o.ab > .3) huEnd(r); } }
}
/* ---- 稍後做（條件還沒好就每 0.5 秒再試，最多等 wait 秒；fn 回傳 'retry' 表示現在不行） ---- */
function huWhen(fn, delay, wait) { let t = 0; const step = () => { try { if (!huOK()) return; if (fn() === 'retry' && t < (wait || 5)) { t += .5; after(.5, step); } } catch (e) { huErr(e); } }; after(delay, step); }
/* ---- 個性化的選動作 ---- */
function huWPick(list) { let s = 0; for (const x of list) s += x[1]; if (s <= 0) return null; let q = huRnd() * s; for (const x of list) { q -= x[1]; if (q <= 0) return x[0]; } return list[list.length - 1][0]; }
function huPickField(r, p, lev) {
  return huWPick([['hu_glovecheck', 1], ['hu_breath', .2 + 1.4 * p.nerv * lev], ['hu_bounce', .1 + 1.2 * p.nerv * lev], ['hu_yawn', lev < .35 ? .8 * (1 - p.nerv) : 0], ['hu_sky', p.faith && lev > .4 ? .6 : 0]]);
}
function huPickRunner(r, p, lev) { return huWPick([['hu_helmet', 1], ['hu_rglove', 1], ['hu_bounce', .2 + 1.2 * p.nerv * lev], ['hu_sky', p.faith ? .35 : 0]]); }
/* ---- 每個人每幀：表情微變化＋待機動作 ---- */
function huFaceMicro(r, h, p, ro, dt) {
  const f = r.fx; if (!f || !f.near || f.em || r.anim || r.run > .05) return; h.fe -= dt; if (h.fe > 0) return;
  h.fe = 7 + huRnd() * 14; if (!huOK() || (typeof PL !== 'undefined' && PL) || (G.phase !== 'pre' && G.phase !== 'change')) return;
  const lev = huLev(), pl = r.pl, m = pl && pl.mood != null ? pl.mood : 55, bat = ro.k === 'B', pit = ro.k === 'F' && ro.pos === 'P', free = !bat && !pit && !(ro.k === 'F' && ro.pos === 'C');
  const x = huWPick([['chew', p.gum ? 1.6 : 0], ['nervous', p.nerv * lev * 1.2], ['smile', free ? p.cheer * (m > 50 ? 1 : .3) : 0], ['smirk', free ? p.cheer * .4 * (m > 60 ? 1 : 0) : 0], ['sheepish', free && m < 45 ? p.cheer * .5 : 0], ['sigh', m < 40 ? .8 : 0], ['yawn', free && lev < .3 ? .5 * (1 - p.nerv) : 0], ['bored', free && lev < .3 ? .3 : 0], ['determined', lev > .5 ? .6 : 0], ['whistle', free ? p.cheer * .2 : 0]]);
  if (!x) return; const dur = x === 'chew' ? 5 + huRnd() * 5 : 1.2 + huRnd() * 1.1; FACE.emote(r, x, dur); HU.n['f_' + x] = (HU.n['f_' + x] || 0) + 1;
}
function huTick(r, dt) {
  const ro = huRole(r); if (!ro) return; const h = r._hu || (r._hu = { nx: 8 + huRnd() * 20, fe: 2 + huRnd() * 8 }), p = huPers(r);
  if (HU.face && typeof FACE !== 'undefined' && FACE.on) huFaceMicro(r, h, p, ro, dt);
  if (!HU.idle || ro.k === 'B') return; h.nx -= dt; if (h.nx > 0) return;
  if (!huOK()) { h.nx = 2 + huRnd() * 4; return; }
  const lev = huLev(); let name = null, o = null;
  if (ro.k === 'F' && ro.pos === 'P') { h.nx = 30; return; }      /* 投手的儀式在 prepAction 掛接 */
  if (ro.k === 'F' && ro.pos === 'C') { if (!huElig(r)) { h.nx = 1 + huRnd() * 3; return; } name = 'hu_cmask'; }
  else if (ro.k === 'F') { if (!huElig(r)) { h.nx = 1 + huRnd() * 3; return; } name = huPickField(r, p, lev); }
  else if (ro.k === 'R') { if (!huRunnerOK(r, ro.u)) { h.nx = 1 + huRnd() * 3; return; } name = huPickRunner(r, p, lev); }
  else if (ro.k === 'U') { if (r.anim || G.phase !== 'pre' || (typeof PL !== 'undefined' && PL)) { h.nx = 2 + huRnd() * 3; return; } name = huRnd() < .6 ? 'hu_clicker' : 'nat_roll'; }
  if (name) huStart(r, name, o);
  h.nx = (14 + huRnd() * 26) * (1.35 - .6 * p.cheer * .5 - .3 * p.nerv);
}
/* ---- 兩人聊天（相鄰內野手、一壘手＋壘上跑者） ---- */
function huChat() {
  if (!HU.chat || !huOK() || G.phase !== 'pre' || (typeof PL !== 'undefined' && PL) || (typeof E !== 'undefined' && E.coach)) return false;
  const pairs = [], F = E.F || {}, cand = (a, b, w) => { const x = F[a], y = F[b]; if (x && y && x.rig && y.rig && huElig(x.rig) && huElig(y.rig)) pairs.push([x.rig, y.rig, w * (.4 + huPers(x.rig).chat + huPers(y.rig).chat)]); };
  const on1 = G.on && G.on[0], f1 = F['1B'];
  if (on1 && on1.rig && f1 && f1.rig && huRunnerOK(on1.rig, on1) && huElig(f1.rig) && Math.hypot(f1.rig.root.position.x - on1.rig.root.position.x, f1.rig.root.position.z - on1.rig.root.position.z) < 5) pairs.push([f1.rig, on1.rig, 2.2 * (.4 + huPers(f1.rig).chat + huPers(on1.rig).chat)]);
  cand('2B', 'SS', 1); cand('SS', '3B', 1); cand('1B', '2B', .7);
  const pr = huWPick(pairs.map(x => [x, x[2]])); if (!pr) return false;
  const A = pr[0], B = pr[1], dur = 2.2 + huRnd() * 1.2, laugh = huRnd() < .5;
  huStart(A, 'hu_chat', { tgt: B, dur });
  after(.4, () => { if (huOK() && !B.anim && !(typeof PL !== 'undefined' && PL)) huStart(B, 'hu_nod', { tgt: A, dur: dur - .3 }); });
  after(dur + .1, () => {
    if (!huOK() || G.phase !== 'pre' || (typeof PL !== 'undefined' && PL)) return;
    if (laugh) { if (!A.anim) huStart(A, 'hu_laugh', { tgt: B }); if (!B.anim) huStart(B, 'hu_laugh', { tgt: A, dur: 1.2 }); }
    else if (!B.anim) { huStart(B, 'hu_chat', { tgt: A, dur: 1.3 }); }
  });
  HU.n.chat = (HU.n.chat || 0) + 1; return true;
}
/* ---- 每幀全域：壞球、聊天排程 ---- */
function huGlobal(dt) {
  const n = huNow(); if (Math.abs(n - HU.gAt) < 3) return; HU.gAt = n; HU.dt = Math.min(dt, .1);
  if (typeof G === 'undefined' || G.mode !== 'play') return;
  if (G.balls > HU.balls) huOnBall(); HU.balls = G.balls;
  if (G.phase === 'pre' && HU.chat) { HU.chatT -= HU.dt; if (HU.chatT <= 0) { HU.chatT = 9 + huRnd() * 16; try { huChat(); } catch (e) { huErr(e); } } }
}
function huOnBall() {      /* 壞球判定：火爆的捕手偶爾搖頭 */
  if (!HU.react || !huOK()) return; const C = E.F && E.F.C; if (!C || !C.rig) return; const p = huPers(C.rig); if (huRnd() >= .08 + .3 * p.hot) return;
  huWhen(() => { if (!E.F || E.F.C !== C) return; if (!huElig(C.rig)) return 'retry'; huStart(C.rig, 'hu_cshake'); }, .5, 3);
}
/* ---- 事件反應 ---- */
function huAfter(r, name, opt, delay, wait) { huWhen(() => { if (!r || !r.root) return; if (typeof PL !== 'undefined' && PL) return 'retry'; if (r.anim && !(r.anim.name === 'crouch' && r.anim.opt && r.anim.opt.hold)) return 'retry'; if (r.run > .05) return 'retry'; huStart(r, name, Object.assign({ any: true }, opt || {})); }, delay, wait || 4); }
function huPitcherK(P) {
  if (!P || !P.rig || E.F.P !== P || G.outs >= 3) return; const p = huPers(P.rig), pp = curPitcher(), m = moodOf(pp), x = huRnd();
  if (x < .24 + .3 * p.cheer * (m > 45 ? 1 : .4)) huAfter(P.rig, 'fistpump', { dur: 1.0, face: p.cheer > .5 ? 'joyshout' : 'angry' }, .9);
  else if (p.faith && x < .5) huAfter(P.rig, 'hu_sky', {}, .9);
  else if (p.vet && x < .62) huAfter(P.rig, 'hu_tipcap', {}, .9);
}
function huReact(kind, b) {
  if (!HU.on || !HU.react || !huOK() || !kind || !E.F) return;
  const P = E.F.P, third = G.outs >= 3, hr = kind === 'HR' || kind === 'H4', hit = kind[0] === 'H' && kind !== 'HBP' && !hr, bb = kind === 'BB' || kind === 'IBB';
  if (kind === 'K') huPitcherK(P);
  else if ((kind === 'out' || kind === 'FC' || kind === 'foulout') && !third && P && P.rig && typeof PL !== 'undefined' && PL && PL.holder && PL.holder.pos !== 'P' && huRnd() < .3 + .3 * huPers(P.rig).cheer) {
    const tgt = PL.holder.rig; huAfter(P.rig, 'hu_thumbs', { tgt }, 1.2);      /* 比手勢謝謝剛剛處理球的野手 */
  } else if (bb && P && P.rig) { const p = huPers(P.rig); if (huRnd() < .15 + .3 * (p.nerv + p.hot) / 2) huAfter(P.rig, huRnd() < .55 ? 'hu_breath' : 'hips', { face: huRnd() < .5 ? 'frustrated' : 'sigh' }, 1.0); }
  else if (hr) { for (const pos of ['1B', '2B', 'SS', '3B']) { const f = E.F[pos]; if (f && f.rig && huRnd() < .42) huAfter(f.rig, 'hu_disbelief', {}, 2.0 + huRnd() * .8, 5); } }
  else if (hit && b) {      /* 安打上壘：跑者慶祝（個性決定怎麼慶祝） */
    huWhen(() => {
      const u = G.on && G.on.find(x => x && x.pl === b); if (!u || !u.rig) return; if (!huRunnerOK(u.rig, u)) return 'retry'; const p = huPers(u.rig), x = huRnd();
      if (p.cheer > .5 && x < .55) huStart(u.rig, 'fistpump', { dur: 1.0, face: 'joyshout' });
      else if (p.faith && x < .75) huStart(u.rig, 'hu_sky');
      else if (x < .85) huStart(u.rig, 'hu_helmet');
      else huStart(u.rig, 'hu_rglove');
    }, .9 + huRnd() * .6, 4);
  }
}
function huOnError(f) {      /* 失誤：當事人道歉或懊惱，投手隨後比手勢安慰 */
  if (!HU.on || !HU.react || !huOK() || !f || !f.rig) return; const P = E.F.P, p = huPers(f.rig);
  if (p.hot > .6) huAfter(f.rig, huRnd() < .5 ? 'glovepound' : 'headdown', { face: 'frustrated' }, 1.4, 5);
  else huAfter(f.rig, 'hu_sorry', P && f !== P ? { tgt: P.rig } : {}, 1.4, 5);
  if (P && P.rig && f !== P && huRnd() < .5) huAfter(P.rig, 'hu_thumbs', { tgt: f.rig, face: 'smile' }, 3.2, 5);
}
function huOnGreat(f) {      /* 美技：當事人慶祝、投手比讚、鄰近隊友拍手 */
  if (!HU.on || !HU.react || !huOK() || !f || !f.rig) return; const P = E.F.P, p = huPers(f.rig);
  if (p.cheer > .5) huAfter(f.rig, 'fistpump', { dur: 1.0, face: 'joyshout' }, 1.7, 6); else if (p.vet) huAfter(f.rig, 'hu_tipcap', {}, 1.7, 6);
  if (P && P.rig && f !== P && huRnd() < .6) huAfter(P.rig, 'hu_point', { tgt: f.rig, face: 'grin' }, 2.3, 6);
  const near = []; for (const pos in E.F) { const q = E.F[pos]; if (q && q !== f && q !== P && q.rig && pos !== 'C') near.push([Math.hypot(q.x - f.x, q.z - f.z), q]); } near.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < Math.min(2, near.length); i++) if (huRnd() < .6) huAfter(near[i][1].rig, 'nat_clap', {}, 2.1 + huRnd() * .8, 6);
}
/* ---- 掛接 ---- */
{
  const _rs = rigStep;
  rigStep = function (r, dt) {
    if (HU.on && r && r.anim && r.anim.opt && r.anim.opt.hu) { try { huGuard(r, dt); } catch (e) { huErr(e); } }
    _rs(r, dt);
    if (!HU.on || window.__ff || !r || !r.legL || !r.torso || !r.root || r.root.visible === false) return;
    try {
      if (typeof G === 'undefined' || G.mode !== 'play' || G.over) return;
      if (typeof CAMC !== 'undefined' && CAMC.pos && CAMC.pos.distanceTo(r.root.position) > HU.far) return;
      huGlobal(dt); huTick(r, dt);
    } catch (e) { huErr(e); }
  };
  if (typeof abMood === 'function') { const _am = abMood; abMood = function (kind, b) { const rv = _am.apply(this, arguments); try { huReact(kind, b); } catch (e) { huErr(e); } return rv; }; }
  if (typeof flowOnError === 'function') { const _fe = flowOnError; flowOnError = function (f, how) { const rv = _fe.apply(this, arguments); try { if (how !== 'wp') huOnError(f); } catch (e) { huErr(e); } return rv; }; }
  if (typeof greatPlay === 'function') { const _gp = greatPlay; greatPlay = function (f, plan) { const rv = _gp.apply(this, arguments); try { huOnGreat(f); } catch (e) { huErr(e); } return rv; }; }
  if (typeof prepAction === 'function') {      /* 投手投球前的個性化小儀式：機率低、回報等待 ≤0.6 秒，不拉長投球間隔 */
    const _pa = prepAction;
    prepAction = function () {
      try {
        const P = typeof E !== 'undefined' && E.F && E.F.P;
        if (HU.on && HU.idle && huOK() && P && P.rig && !(typeof PL !== 'undefined' && PL) && G.phase === 'pre' && (!P.rig.anim || P.rig.anim.name === 'stretch')) {
          const p = huPers(P.rig), lev = huLev(), pp = curPitcher(), m = moodOf(pp);
          if (huRnd() < .06 + .1 * lev + (m < 45 ? .05 : 0)) {
            const name = huWPick([['hu_breath', 1 + 2 * p.nerv], ['hu_glovecheck', 1], ['hu_sky', p.faith && lev > .4 ? 1.2 : 0]]);
            if (name) { huStart(P.rig, name, { hand: pp.hand === 'R' ? 1 : -1 }); return Math.min(NT_ACT[name].dur, .6); }
          }
        }
      } catch (e) { huErr(e); }
      return _pa.apply(this, arguments);
    };
  }
}
HU.dbg = { start: huStart, act: HU_ACT, pers: huPers, chat: huChat, react: huReact, onError: huOnError, onGreat: huOnGreat, pitcherK: huPitcherK, elig: huElig };
