/* 35-main-loop.js — 主迴圈（原 script.js 第 7601-7655 行） */
'use strict';
/* ---------------- main loop ---------------- */
G.ts = 1; let lastT = performance.now(); let lastFocus = new V3(0, 0, -20);
window.__viol = []; let _ph = '', _phT = 0;
function checkInv() {
  const v = [], seen = new Set();
  G.on.forEach((r, i) => { if (!r) return; if (r.state !== 'on') v.push('on-state ' + r.state + ' base' + i); if (r.from !== i + 1) v.push('from ' + r.from + ' vs ' + (i + 1)); if (seen.has(r)) v.push('dup'); seen.add(r); });
  if (G.outs > 3) v.push('outs>3'); if (G.phase === 'pre' && E.runners.some(r => r.state === 'run')) v.push('running in pre');
  const pos = {}; E.runners.forEach(r => { if (r.state === 'on') { if (pos[r.from]) v.push('two runners on ' + r.from + ' ' + JSON.stringify(E.runners.map(q => [q.pl.name, q.state, q.from, q.to, +q.s.toFixed(2), q.goal, q.isForce ? 'F' : '', q.bat ? 'B' : '', q.stealer ? 'S' : ''])) + ' PL=' + (PL ? PL.kind + '/' + PL.state + '/' + (PL.plan && PL.plan.kind) : 'none') + ' on=' + G.on.map(x => x ? x.pl.name : '-')); pos[r.from] = 1; } });
  const k = G.phase + (PL ? PL.state : ''); if (G.phase === 'over' || G.phase === 'endhalf') { _phT = 0; } else if (k === _ph) { _phT += 1 / 60; if (_phT > 40) { v.push('stuck ' + k); _phT = -999; } } else { _ph = k; _phT = 0; }
  for (const x of v) if (window.__viol.length < 60) window.__viol.push(G.inning + '/' + G.half + ' o' + G.outs + ' ' + x);
}
let HS = 0; function hitStop(t) { HS = Math.max(HS, t); }
function step(dt) {
  if (QUIT_OPEN || uiHold()) return;
  if (G.mode === 'play' && E.bat && E.bat.rig && E.bat.rig.anim && E.bat.rig.anim.name === 'bunt' && !G.callBunt && !(PT && PT.sw) && (G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight')) batterStance();      // 觸擊取消後不再卡在觸擊姿勢
  if (HS > 0) { HS -= dt; updateBursts(dt); sqStep(dt * .5); return; }
  sqStep(dt);
  updateBursts(dt); updateFireworks(dt); updateBatPieces(dt); updateFlyBat(dt); updateBatBoy(dt); updateTrash(dt); stepTimers(dt); updateEvents(dt); updateCoach(dt); if (G.mode === 'play') { updateWeather(dt); try { warmTick(dt); } catch (e) { console.error(e); } } try { updatePuddles(dt); updateRainDelay(dt); } catch (e) { console.error(e); } if (window.__dbg) checkInv(); if (window.__hook) window.__hook(dt);
  pmTick(dt);
  if (G.freeze && G.mode !== 'play') G.freeze = false;
  if (G.freeze) return;
  G.clk = (G.clk || 0) + dt;
  if (G.mode === 'play') {
    try { updateStealWatch(dt); } catch (e) { console.error(e); }
    if (G.phase === 'pre') updatePre(dt); else if (G.phase === 'flight') updateFlight(dt);
    if (!PL && (G.phase === 'pre' || G.phase === 'windup') && !tweens.length && E.F.P) { pitcherHandPos(_hp); setBall(_hp, true); }
  }
  updatePlay(dt); updateTweens(dt); updateRunners(dt);
  for (const pos of POS_LIST) { const f = E.F[pos]; if (f) { moveFielder(f, dt); fieldFace(f, dt); rigStep(f.rig, dt); } }
  if (E.bat) rigStep(E.bat.rig, dt);
  for (const r of E.runners) rigStep(r.rig, dt);
  if (E.ump) rigStep(E.ump, dt);
  if (E.coach) rigStep(E.coach.rig, dt);
  crowdCheer.v = Math.max(0, (crowdCheer.v || 0) - dt * .5); if (crowdCheer.v > 0) { stand.position.y = Math.abs(Math.sin(performance.now() * .02)) * .25 * crowdCheer.v; } else stand.position.y = 0;
}
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (real > .003) FRAME_AVG += (Math.min(real, .05) - FRAME_AVG) * .05;
  adaptQuality(real);
  let rem = real * (window.__ts || 1) * (G.mode === 'play' ? G.ts : 1);
  while (rem > 1e-6) { const s = Math.min(rem, 1 / 60); step(s); rem -= s; }
  let focus = null;
  if (CAMC.mode === 'play') { if (ballMesh.visible) { lastFocus.copy(ballMesh.position); } focus = lastFocus; }
  else if (CAMC.mode === 'batfollow') { if (!CAMC._pm && !ballMesh.visible) lastFocus.set(0, 1.2, -1); if (ballMesh.visible) lastFocus.copy(ballMesh.position); focus = lastFocus; }
  else if (CAMC.mode === 'hrtrot') { focus = hrFocus(); }
  // 保險：沒有進行中的球賽動作（準備投球／投球中）時，鏡頭一定回到擊球視角，超過 0.6 秒仍在遠景就強制切回
  if (G.mode === 'play' && !PL && (G.phase === 'pre' || G.phase === 'windup' || G.phase === 'flight') && CAMC.mode !== 'bat' && CAMC.mode !== 'title' && CAMC.mode !== 'pen') { G._camBad = (G._camBad || 0) + real; if (G._camBad > .6) { setCamBat(); G._camBad = 0; } } else G._camBad = 0;
  try { bpFrame(real); } catch (e) { console.error(e); }
  updateCamera(real, focus); camera.updateMatrixWorld(true);
  if (G.mode === 'play' && aim.need && CAMC.mode === 'bat' && CAMC.pos.distanceTo(CAMC.tpos) < .4) { const a = w2s(0, ZC, 0), dp = ov.width / VW(); if (isFinite(a.x)) { aim.cx = a.x / dp; aim.cy = a.y / dp; aim.has = true; aim.need = false; } }      // 開賽／換半局：準心先置於好球帶中央，不必等第一球
  if (PAD.v && G.mode === 'play') { const sp = 1.4 * Math.min(VW(), VH()) * real; aim.cx = clamp(aim.cx + PAD.v.vx * sp, 0, VW()); aim.cy = clamp(aim.cy + PAD.v.vy * sp, 0, VH()); aim.has = true; }
  updateAim(); drawOverlay(); syncTouch(); updatePushBtn(); if (MOB && (++_lt % 45) === 0) layoutTop();
  renderer.render(scene, camera);
}
