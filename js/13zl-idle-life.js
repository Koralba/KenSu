/* ===== 13zl-idle-life.js ｜ 細微待機動作（v1.2.9）：站著不動的球員也「活著」 =====
   做法：疊加層（additive）。包住 rigStep：原本的姿勢擺完之後，只在「這個人目前沒有任何動作」時，把胸口呼吸、重心左右換腳、頭慢慢轉、手臂輕晃
   以極小的幅度疊上去，再呼叫 groundRig 重新量腳底，不會懸空或陷地。天氣影響強度：
   熱＝喘氣（呼吸變快變大、頭微垂）；冷＝縮肩低頭、間歇微微打顫、偶爾呼出白氣；雨＝低頭瞇眼；風＝身體隨陣風微晃。
   另有「偶發小事件」（整理帽簷、敲手套、叉腰），每人 9～22 秒一次，只在球不在場內的空檔、只有野手。
   ── 紅線（驗收用）──
   · 打者：完全不動（只有 13t 的表情層）。       · 投手：只有兩次投球之間沒有任何動作時才呼吸，暗號／stretch／windup／pitch 一律不碰。
   · 捕手：只在 phase==='pre' 的蹲姿 hold 時做極小的呼吸與轉頭（手套與蹲姿高度不動）；cset／catch／sign／throw 不碰。
   · 球在場內（PL）、跑動中、有其他動作時：疊加層歸零（torso 縮放還原）；事件只在 phase==='pre' 且 PL 不存在時才會開始。
   · 亂數只用自己的 LCG（不碰 Math.random，不影響區網對戰同步）；快轉（window.__ff）整個略過；鏡頭太遠（>46）略過；室內球場不啟動天氣加成（強度為 0）。
   · 純外觀：不改任何模擬狀態（座標、時序、判定）。 */
'use strict';
const IDLE = { on: true, rs: 20271109, far: 46 };
function idRnd() { IDLE.rs = (Math.imul(IDLE.rs, 1664525) + 1013904223) >>> 0; return IDLE.rs / 4294967296; }
function idPos(r) {      /* 這個人在 E.F 的哪個守位（null＝不是野手：打者／跑者／裁判…） */
  if (typeof E === 'undefined' || !E.F) return null; const k = r._idk; if (k && E.F[k] && E.F[k].rig === r) return k;
  if (r._idNo > r.t) return null; for (const q in E.F) if (E.F[q] && E.F[q].rig === r) { r._idk = q; return q; }
  r._idk = null; r._idNo = r.t + 2; return null;
}
function idActive(r, pos) {
  if (!pos || r.run > .05 || (r.root && r.root.visible === false)) return false;
  if (typeof G === 'undefined' || G.mode !== 'play' || G.over) return false;
  if (typeof E !== 'undefined' && E.bat && E.bat.rig === r) return false;
  const a = r.anim;
  if (pos === 'C') { if (!(a && a.name === 'crouch' && a.opt && a.opt.hold)) return false; if (G.phase !== 'pre' || (typeof PL !== 'undefined' && PL)) return false; return true; }
  if (pos === 'P' && ((G.phase !== 'pre' && G.phase !== 'change') || (typeof PL !== 'undefined' && PL))) return false;      /* 投手：只有 pre（投球前空檔）與 change（換局）；windup／flight／result 一律不碰 */
  return !a;
}
function idState(r) {
  let s = r._id; if (s) return s;
  s = r._id = { p1: idRnd() * 6.283, p2: idRnd() * 6.283, p3: idRnd() * 6.283, k: 0, ev: 4 + idRnd() * 14, pf: 2 + idRnd() * 5, ts: null, on: false, gs: idRnd() < .5 ? 1 : -1 };
  return s;
}
function idRelease(r, s) {      /* 疊加層歸零：只有 torso 縮放是「絕對值」要還原，其餘每幀 setRigPose 會整組重設 */
  if (s.on) { if (s.ts && r.torso) r.torso.scale.copy(s.ts); s.on = false; } s.k = 0;
}
function idApply(r, s, dt, pos, z) {
  const t = r.t, k = s.k, hot = z.hot, cold = z.cold, wet = z.wet, wind = z.wind, isC = pos === 'C', b = r.body, h = r.head;
  if (!s.ts) s.ts = r.torso.scale.clone(); s.on = true;
  /* 胸口呼吸（熱＝喘：更快更大） */
  const w = 1.9 + 4.4 * hot, br = Math.sin(t * w + s.p1), ba = .012 + .024 * hot;
  r.torso.scale.set(s.ts.x * (1 + ba * br * k), s.ts.y, s.ts.z * (1 + ba * .8 * br * k));
  b.position.y += isC ? .0035 * (1 + br) * k : (.0045 + .006 * hot) * br * k - cold * .012 * k;      /* 捕手只往上（不會沉進地面，也就不用重新落地修正） */
  h.rotation.x += ((isC ? .008 : .014) + .02 * hot) * br * k + (cold * .06 + hot * .08 + wet * .06) * k;
  /* 頭慢慢轉（看左看右）、輕輕歪頭 */
  h.rotation.y += (Math.sin(t * .31 + s.p3) * (isC ? .06 : .1) + Math.sin(t * .83 + s.p1) * .03) * k;
  h.rotation.z += Math.sin(t * .23 + s.p2) * .025 * k;
  if (isC) { if (cold > .15) { const g = clamp(Math.sin(t * .9 + s.p2) * 2.2, 0, 1) * cold; b.rotation.z += Math.sin(t * 49 + s.p1) * .005 * g * k; } return; }      /* 捕手：到此為止（手套、蹲姿高度不動） */
  /* 重心左右換腳＋風的陣風微晃（腳不動，上半身晃） */
  const gust = wind * (.5 + .5 * Math.sin(t * 1.1 + s.p3)) * .03 * s.gs;
  b.rotation.z += (Math.sin(t * .37 + s.p2) * .014 + gust) * k; b.rotation.x += wind * .025 * k;
  /* 手臂輕晃（手套手與投擲手不同相位） */
  r.armL.rotation.x += Math.sin(t * .9 + s.p1) * .025 * k; r.armR.rotation.x += Math.sin(t * .9 + s.p1 + 1.7) * .025 * k;
  if (cold > .15) {      /* 冷：間歇微微打顫（約 8 Hz，一陣一陣） */
    const g = clamp(Math.sin(t * .9 + s.p2) * 2.2, 0, 1) * cold * k;
    b.rotation.z += Math.sin(t * 49 + s.p1) * .008 * g; h.rotation.z += Math.sin(t * 43 + s.p3) * .014 * g; r.armL.rotation.z += Math.sin(t * 47 + s.p2) * .012 * g; r.armR.rotation.z -= Math.sin(t * 47 + s.p2) * .012 * g;
  }
}
function idEvent(r, s, dt, pos, z) {      /* 偶發小事件：只有野手（不含投手／捕手），球不在場內、沒有其他動作時 */
  if (pos === 'P' || pos === 'C') return;
  s.ev -= dt; if (s.ev > 0) return;
  if (typeof hlEligible === 'function' ? !hlEligible(r) : r.anim) { s.ev = 1 + idRnd() * 4; return; }
  const x = idRnd(), hand = idRnd() < .5 ? 1 : -1, nm = x < .4 ? 'capadj' : x < .75 && r.glove ? 'glovepound' : 'hips', dur = nm === 'hips' ? 1.3 : 1.1;
  r.anim = { name: nm, t: 0, dur, opt: { hand, hlv: 1 } }; r.t = 0; s.ev = 9 + idRnd() * 13; idRelease(r, s);
}
function idTick(r, dt) {
  if (!r || !r.torso || !r.legL || !IDLE.on || window.__ff) return;
  const pos = idPos(r), s = r._id || (pos ? idState(r) : null); if (!s) return;
  if (!idActive(r, pos)) { idRelease(r, s); return; }
  if (typeof CAMC !== 'undefined' && CAMC.pos && CAMC.pos.distanceTo(r.root.position) > IDLE.far) { idRelease(r, s); return; }
  const z = typeof hlWxC === 'function' ? hlWxC() : { hot: 0, cold: 0, wet: 0, wind: 0 };
  s.k = Math.min(1, s.k + dt * 2.5);      /* 動作結束後 0.4 秒內慢慢加進來，不會突然彈一下 */
  idApply(r, s, dt, pos, z); if (pos !== 'C') groundRig(r);
  if (z.cold > .3 && pos !== 'C' && typeof hlPuff === 'function') { s.pf -= dt; if (s.pf <= 0) { s.pf = 3.5 + idRnd() * 3 / z.cold; if (r.fade == null || r.fade > .6) hlPuff(r, 1.2); } }      /* 冷天：偶爾呼出白氣 */
  idEvent(r, s, dt, pos, z);
}
{
  const _rs = rigStep;
  rigStep = function (r, dt) { _rs(r, dt); idTick(r, dt); };
}
