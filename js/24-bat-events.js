/* 24-bat-events.js — 球棒脫手／摔斷／換棒（原 script.js 第 5558-5828 行） */
'use strict';
/* ---------- 球棒脫手飛出（打得太激烈）：球棒甩出去 → 落地彈滾 → 球員跑去撿回來 → 送回打擊區，主播全程播報 ---------- */
let FLYBAT = null;
function maybeBatSlip(res, sw, pt) {
  if (!G.evt || FLYBAT || sw.bunt || res.bunt || res.broken || G.mode !== 'play') return;
  const b = E.bat; if (!b || !b.rig || !b.rig.bat || !b.rig.bat.visible) return;
  const p = .009 * (sw.power ? 3 : 1) * (res.kind === 'whiff' ? 1.8 : (res.ev > 40 ? 1.4 : 1)) * (1 + rainK() * 2) * stormMul() * (G.evt === 2 ? 1.8 : 1);      // 強打、揮空（用力過猛）、擊出強勁球、雨天都更容易脫手
  if (Math.random() >= Math.min(p, .07)) return;
  after(res.kind === 'whiff' ? .16 : .1, () => { try { slipBat(b); } catch (e) { console.error(e); } });
}
function slipBat(b) {
  if (FLYBAT || G.mode !== 'play' || !b.rig || !b.rig.bat) return;
  const rig = b.rig, w = new V3(); rig.root.updateMatrixWorld(true); rig.bat.getWorldPosition(w);
  if (!isFinite(w.x + w.y + w.z)) w.set(b.x || 0, 1.2, .2);
  rig.bat.visible = false;
  const sgn = Math.random() < .5 ? -1 : 1, r = Math.random(); let a0, back = false;
  if (r < .42) a0 = sgn * (.7 + Math.random() * .6); else if (r < .64) a0 = sgn * (.15 + Math.random() * .4); else if (r < .84) a0 = sgn * (1.3 + Math.random() * .4); else { back = true; a0 = sgn * (.1 + Math.random() * .5); }
  const sp = back ? 4 + Math.random() * 3 : 6 + Math.random() * 6, dx = Math.sin(a0), dz = -Math.cos(a0) * (back ? -1 : 1);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.042, .016, .86, 10), new THREE.MeshPhongMaterial({ color: 0xc89a5a })); m.position.copy(w); scene.add(m);
  FLYBAT = { m, x: w.x, y: w.y, z: w.z, vx: dx * sp, vy: 4 + Math.random() * 3, vz: dz * sp, sx: 9 + Math.random() * 8, sz: 5 + Math.random() * 6, st: 'fly', t: 0, tm: 0, inn: G.inning, half: G.half, rig, f: null };
  const n = (curBatter() && curBatter().name) || '打者', area = back ? '本壘後方' : Math.abs(a0) > 1.25 ? '休息區那邊' : Math.abs(a0) < .5 ? '投手丘方向' : '界外區';
  const L = [`<em>球棒脫手了！</em>${n}這一棒揮得太用力，整支球棒飛向${area}`, `<em>哇，球棒變成迴旋鏢了！</em>${n}的球棒從手上滑掉，在空中轉個不停`, `<em>球棒飛走了！</em>${n}用力過猛，球棒決定自己去旅行`, `<em>這力道太驚人了！</em>${n}連球棒都握不住，場上的人都愣住了`];
  say(L[Math.floor(Math.random() * L.length)]); flowSfx('swing', .6); crowdCheer(.5);
}
function endFlyBat(abort) {
  const B = FLYBAT; if (!B) { G.batFetch = false; return; }
  try { scene.remove(B.m); B.m.geometry.dispose(); B.m.material.dispose(); } catch (e) { }
  if (B.f) { const q = formationPos(B.f.pos); B.f.tx = q.x; B.f.tz = q.z; B.f.sp = 4.2; B.f.hold = 0; if (B.f.pos === 'C' && !PL) B.f.rig.anim = { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } }; }
  FLYBAT = null; G.batFetch = false; if (abort) { try { killBoy(); } catch (e) { } }
}
function updateFlyBat(dt) {
  const B = FLYBAT; if (!B) return;
  if (G.mode !== 'play' || G.over || G.inning !== B.inn || G.half !== B.half || B.t > 40) { endFlyBat(true); return; }
  B.t += dt; const m = B.m;
  if (B.st === 'fly') {
    B.vy -= 9.8 * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
    if (B.y < .05) {
      B.y = .05;
      if (!B.bounced) { B.bounced = true; if (Math.random() < .22) breakFlyBat(B); }
      if (Math.abs(B.vy) > 1.4) { B.vy *= -.38; B.vx *= .62; B.vz *= .62; B.sx *= .6; B.sz *= .6; flowSfx('bounce', clamp(Math.abs(B.vy) / 5, .3, .8)); }
      else { B.vy = 0; const k = Math.max(0, 1 - 4 * dt); B.vx *= k; B.vz *= k; B.sx *= k; B.sz *= k; }
    }
    m.position.set(B.x, B.y, B.z); m.rotation.x += B.sx * dt; m.rotation.z += B.sz * dt;
    if (B.y <= .051 && B.vy === 0 && Math.hypot(B.vx, B.vz) < .3) {      // 停住：平躺在地上
      B.st = 'wait'; B.y = .045; m.rotation.order = 'YXZ'; m.rotation.set(Math.PI / 2, Math.atan2(B.vx || 1, B.vz || 1) + Math.random() * 3, 0); m.position.set(B.x, B.y, B.z);
      for (const pos of ['P', 'C', '1B', '2B', '3B', 'SS']) { const f = E.F[pos]; if (f && !f.pl.out && dist2(f.x, f.z, B.x, B.z) < 2.2) { say(`<em>差點砸到${POS_FULL[pos]}${f.pl.name}！</em>他嚇得趕快閃開`); crowdCheer(.4); break; } }
    }
    return;
  }
  if (B.st === 'wait') {
    const ended = !E.bat || E.bat.rig !== B.rig || G.phase === 'change' || G.phase === 'endhalf';
    if (ended) {      // 這位打者已經出局／打進場內／被換下：球棒不再送回，只由球僮收走，下一位打者直接上場
      if (PL || (G.phase !== 'pre' && G.phase !== 'change')) return;
      startBatBoy({ debris: B }); B.st = 'boy'; return;
    }
    if (PL || G.phase !== 'pre') return;      // 等這一球／這個打席的結果處理完，才輪到撿球棒
    if (B.brk) { startBatBoy({ deliver: B.rig, debris: B }); B.st = 'boy'; return; }      // 球棒摔斷了：球僮拿新球棒上來給打者
    let best = null, bd = 1e9;
    for (const pos of ['C', '1B', '3B', '2B', 'SS']) { const f = E.F[pos]; if (!f || !f.pl || f.pl.out) continue; const d = dist2(f.x, f.z, B.x, B.z); if (d < bd) { bd = d; best = f; } }
    if (!best) { endFlyBat(true); return; }
    G.batFetch = true; B.f = best; B.st = 'go'; B.tm = 0; best.tx = B.x; best.tz = B.z; best.sp = 5.2; best.wait = 0; best.hold = 0; if (best.pos === 'C') best.rig.anim = null;
    const L = [`${POS_FULL[best.pos]}${best.pl.name}小跑步過去撿球棒`, `<em>${POS_FULL[best.pos]}${best.pl.name}</em>主動去幫忙把球棒撿回來`, `比賽先暫停一下，${POS_FULL[best.pos]}${best.pl.name}去撿那支「離家出走」的球棒`];
    say(L[Math.floor(Math.random() * L.length)]); return;
  }
  if (B.st === 'boy') return;
  const f = B.f; if (!f) { endFlyBat(true); return; }
  B.tm += dt;
  if (B.st === 'go') {
    f.tx = B.x; f.tz = B.z; f.sp = 5.2; f.wait = 0;
    if (dist2(f.x, f.z, B.x, B.z) < .7 || B.tm > 8) { B.st = 'pick'; B.tm = 0; f.tx = f.x; f.tz = f.z; f.hold = .4; f.rig.anim = { name: 'pickup', t: 0, dur: .35, opt: {} }; flowSfx('mitt', .5); }
    return;
  }
  if (B.st === 'pick') {
    if (B.tm > .4) { B.st = 'carry'; B.tm = 0; f.hold = 0; B.dest = { x: (E.bat ? E.bat.x : -1.9) * 1.15, z: .9 }; }
    return;
  }
  if (B.st === 'carry') {
    f.tx = B.dest.x; f.tz = B.dest.z; f.sp = 4.6; f.wait = 0;
    B.m.rotation.order = 'XYZ'; B.m.rotation.set(.25, 0, -.7); B.m.position.set(f.x + .22, 1.0, f.z - .1);
    if (dist2(f.x, f.z, B.dest.x, B.dest.z) < .9 || B.tm > 8) {
      scene.remove(B.m); const same = E.bat && E.bat.rig === B.rig; if (same && B.rig.bat) B.rig.bat.visible = true;
      const n = same && curBatter() && curBatter().name ? curBatter().name : '打者';
      const L = [`${f.pl.name}把球棒還給${n}，全場笑成一團`, `<em>球棒平安歸隊！</em>${f.pl.name}遞還給${n}，觀眾報以熱烈掌聲`, `${n}接回球棒，趕快握緊一點，這次可別再飛出去了`];
      say(L[Math.floor(Math.random() * L.length)]); crowdCheer(.7); flowSfx('cheer', .8);
      B.st = 'back'; B.tm = 0; B.m.visible = false;
    }
    return;
  }
  if (B.st === 'back') {
    const q = formationPos(f.pos); f.tx = q.x; f.tz = q.z; f.sp = 4.4; f.wait = 0;
    if (dist2(f.x, f.z, q.x, q.z) < .5 || B.tm > 5) endFlyBat(false);
  }
}
/* ---------- 球棒摔斷／球僮送新棒、收走場上的棒子 ---------- */
function breakFlyBat(B) {      // 飛出去的球棒落地摔成兩截
  B.brk = true;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .034, .45, 8), new THREE.MeshPhongMaterial({ color: 0xc89a5a })); m.position.set(B.x, B.y + .1, B.z); scene.add(m);
  BBP.push({ m, x: B.x, y: B.y + .1, z: B.z, vx: B.vx * .8 + gauss() * 2, vy: 2.5 + Math.random() * 2, vz: B.vz * .8 + gauss() * 2, sx: 6 + Math.random() * 8, sz: 4 + Math.random() * 6, t: 0, hit: false });
  B.m.scale.y = .55; spawnBurst(B.x, .2, B.z, .6, '#e8d0a0');
  try { noiseBurst(.07, 3200, 1.4, .9, 'highpass'); ring(1900, .05, .4); noiseBurst(.12, 700, 1.8, .5, 'bandpass'); } catch (e) { }
  flowSfx('wall', .7); crowdCheer(.5);
  say('<em>球棒落地，斷成兩截了！</em>');
}
let BOY = null;
function startBatBoy(o) {
  if (BOY || G.mode !== 'play') return;
  const st = teamStyle(G.half), side = E.bat ? E.bat.side : 1, rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, helmet: true, scale: .92 });
  const x0 = -side * 5.5, z0 = 3.2; rig.root.position.set(x0, 0, z0); scene.add(rig.root);
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(.042, .016, .86, 10), new THREE.MeshPhongMaterial({ color: 0xe8c080 }));
  if (o.deliver) { scene.add(bm); G.batFetch = true; const n = (curBatter() && curBatter().name) || '打者'; say(`<em>${o.debris || o.deliver.batBroken ? '球棒斷了！' : '換棒！'}</em>球僮拿著新球棒跑上來給${n}`); }
  BOY = { rig, x: x0, z: z0, x0, z0, st: o.deliver ? 'toBat' : (o.debris ? 'toDeb' : 'leave'), o, bm, carry: !!o.deliver, t: 0, hold: 0 };
}
function killBoy() {
  const B = BOY; if (!B) return; BOY = null;
  try { scene.remove(B.rig.root); scene.remove(B.bm); B.bm.geometry.dispose(); B.bm.material.dispose(); } catch (e) { }
  G.batFetch = false;
  if (B.o.debris && FLYBAT && FLYBAT.st === 'boy') endFlyBat(false);
}
function updateBatBoy(dt) {
  const B = BOY; if (!B) return;
  if (G.mode !== 'play' || G.over) { killBoy(); return; }
  B.t += dt; const rig = B.rig, o = B.o, deb = o.debris; let tx = B.x, tz = B.z, moving = true;
  const next = () => { B.st = deb && !B.debDone ? 'toDeb' : 'leave'; };
  if (B.st === 'toBat') {
    if (!E.bat || E.bat.rig !== o.deliver) { B.carry = false; scene.remove(B.bm); G.batFetch = false; o.deliver = null; next(); return; }      // 打者已經換人：不用送了
    tx = E.bat.x * 1.12; tz = .95; if (dist2(B.x, B.z, tx, tz) < .45) { B.st = 'give'; B.hold = .55; }
  } else if (B.st === 'give') {
    moving = false; faceRig(rig, E.bat ? E.bat.x : 0, .35); B.hold -= dt;
    if (B.hold <= 0) {
      const rg = o.deliver; try { if (rg && rg.bat) { rg.bat.visible = true; if (rg.batTilt && rg.batTilt.children[0]) rg.batTilt.children[0].scale.y = 1; } if (rg) rg.batBroken = false; } catch (e) { }
      B.carry = false; scene.remove(B.bm); G.batFetch = false; const n = (curBatter() && curBatter().name) || '打者';
      say(`${n}接過新球棒，握緊了，繼續打擊`); crowdCheer(.6); flowSfx('mitt', .6); o.deliver = null; next();
    }
  } else if (B.st === 'toDeb') {
    tx = deb.x; tz = deb.z; if (dist2(B.x, B.z, tx, tz) < .6) { B.st = 'pick'; B.hold = .4; rig.anim = { name: 'pickup', t: 0, dur: .35, opt: {} }; flowSfx('mitt', .4); }
  } else if (B.st === 'pick') {
    moving = false; B.hold -= dt; if (B.hold <= 0) { try { deb.m.visible = false; } catch (e) { } B.debDone = true; B.st = 'leave'; }
  } else if (B.st === 'leave') {
    tx = B.x0; tz = B.z0; if (dist2(B.x, B.z, tx, tz) < .6 || B.t > 25) { killBoy(); return; }
  }
  if (moving) { if (rig.anim) rig.anim = null; const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, 5.2 * dt); B.x += dx / d * st; B.z += dz / d * st; faceRig(rig, tx, tz); rig.run = 1.3; } else rig.run = 0;
  rig.root.position.set(B.x, 0, B.z); rigStep(rig, dt);
  if (B.carry) { B.bm.rotation.order = 'XYZ'; B.bm.rotation.set(.25, 0, -.7); B.bm.position.set(B.x + .22, 1.0, B.z - .1); }
}
function updateBatPieces(dt) {
  for (let i = BBP.length - 1; i >= 0; i--) {
    const p = BBP[i]; p.t += dt; p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < .05) { p.y = .05; p.vy *= -.35; p.vx *= .6; p.vz *= .6; p.sx *= .6; p.sz *= .6; if (!p.bn) { p.bn = true; flowSfx('bounce'); } }
    p.m.position.set(p.x, p.y, p.z); p.m.rotation.x += p.sx * dt; p.m.rotation.z += p.sz * dt;
    if (!p.hit && p.y < 2.3) for (const pos of ['P', '1B', '2B', '3B', 'SS']) { const f = E.F[pos]; if (!f || f.pl.out) continue; if (dist2(f.x, f.z, p.x, p.z) < .9) { p.hit = true; p.vx *= -.25; p.vz *= -.25; p.vy = 2.5; batPieceHit(f); break; } }
    if (p.t > 2.4) { scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); BBP.splice(i, 1); }
  }
}
function takePitch(pt) {
  if (E.bat && E.bat.rig) E.bat.rig.loadT = 0;
  const D = G.dbg || (G.dbg = { sw: 0, whiff: 0, hit: 0, take: 0, strikeTake: 0, ballTake: 0 }); D.take++; if (isStrikeLoc(pt.fx, pt.fy)) D.strikeTake++; else D.ballTake++;
  pitchHint(pt); const b = curBatter(), bh = bhist(b); bh.take++;
  const od = outsideDist(pt.fx, pt.fy); if (od > 0) bh.balls++; else bh.strikes++;
  G.lastLoc = { x: pt.fx, y: pt.fy, t: 0, strike: outsideDist(pt.fx, pt.fy) <= 0 };
  if (pt.hitBatter) { catcherCatch(pt, true); G.lastPitch = pt; G.seq.push(pt.id); pitchResult('hbp'); return; }
  if (humanBats() && G.callBunt && !pt.pulled && !pt.ibb && outsideDist(pt.fx, pt.fy) > 0) {      // 壞球但打者沒有及時收棒、仍擺著棒子＝視為觸擊嘗試，判定好球（兩好球時＝三振）
    say('球偏離好球帶，但打者<em>沒有及時收棒</em>，判定為觸擊嘗試＝好球'); toast('未收棒・好球', '#ffe08a', '#c60'); catcherCatch(pt); pitchResult('swing'); return;
  }
  const call = umpireCall(pt); pt.call = call; catcherCatch(pt);
  absFlow(pt, call, k => pitchResult(k));
}
function catchX(pt) {      // 球實際飛進手套的世界座標 x（沿鏡頭視線）：捕手要站在這裡，畫面上才會接得正
  const C = E.F.C, g = rayAtZ(pt.fx, pt.fy, (C ? C.z : 4) - .25, {}); return clamp(g.x, -1.9, 1.9);
}
function catcherCatch(pt, hbp) {
  const C = E.F.C, a0 = ballMesh.visible ? { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z } : { x: pt.fx, y: pt.fy, z: 0 };
  const hasR = G.on.some(x => x), far = Math.abs(pt.fx) > ZW + 1.25 - rainK() * .5 || pt.fy < ZC - ZH - .95 + rainK() * .3;
  const fldK = 1.25 - (C.pl.fld || 60) / 100 * .9;
  // 暴投／擋不住：控球失控的遠離好球帶球、彈地球，捕手接不住（有人在壘上時機率更高）；沒人在壘上也會滾走要去撿球
  const wild = !hbp && !pt.ibb && !pt.pitchout && (pt.dirt || far) && Math.random() < (pt.dirt ? .3 : .26) * fldK * (1 + rainK() * 1.6) * stormMul() * (hasR ? 1 : .55);
  pt.wild = wild; G.lastPitch = pt; if (!hbp) G.seq.push(pt.id);
  if (hbp) { ballTween(a0, { x: a0.x, y: .12, z: a0.z + .5 }, .3, .25); return; }       // 觸身球：球打到身體後掉在打者腳邊
  if (wild) {
    pt.wildLand = { x: clamp(pt.fx * 2.2 + gauss() * 2, -14, 14), z: 7 + Math.random() * 8 };
    C.rig.anim = { name: 'down', t: 0, dur: .6, opt: {} }; flowSfx('bounce');
    ballTween(a0, { x: pt.wildLand.x, y: .2, z: pt.wildLand.z }, .55 + pt.wildLand.z * .025, 1.2);
  } else {
    C.x = catchX(pt); C.tx = C.x; C.tz = C.z; C.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; flowSfx('mitt', .8);
    const gl = rayAtZ(pt.fx, pt.fy, C.z - .25, {});                                            // 手套位置＝視線上與落點同一個畫面位置
    ballTween(a0, gl, E.runners.some(r => r.state === 'run') ? .09 : .06, 0);                  // 球停在手套裡，之後由捕手回傳投手
    spawnBurst(gl.x, gl.y, gl.z + .1, clamp((pt.kmh - 118) * .022, .22, .9), '#ffe9a0'); if (pt.kmh >= 148) CAMC.shake = Math.max(CAMC.shake || 0, .05 + (pt.kmh - 148) * .008);
  }
}
function catcherReturn(cb) {                  // 捕手接到球後回傳給投手，投手接到球才進行下一球
  const C = E.F.C, P = E.F.P; if (!C || !P || G.over || G.mode !== 'play') { cb(); return; }
  after(.15, () => {
    if (G.over || G.mode !== 'play') return;
    const hand = { x: C.x, y: 1.05, z: C.z - .3 }, from = ballMesh.visible ? { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z } : hand;
    setBall(from, true);
    ballTween(from, hand, .14, 0, () => {                                                    // 球先落進捕手手中，再傳出
      C.rig.anim = { name: 'throw', t: 0, dur: .3, opt: { hand: 1 } }; flowSfx('throw', .6);
      const d = Math.hypot(P.x - hand.x, P.z - hand.z);
      after(.08, () => ballTween(hand, { x: P.x, y: 1.25, z: P.z + .2 }, clamp(d / 26, .45, .85), .5, () => { P.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; flowSfx('mitt', .5); after(.25, cb); }));
    });
  });
}
function pitchResult(kind) {
  const b = curBatter(); G.phase = 'result'; let end = null; { const pp = curPitcher(); if (kind === 'strikeLook') { adjustMood(pp, .8); adjustMood(b, -.5); } else if (kind === 'swing') { adjustMood(pp, 1); adjustMood(b, -1); } else if (kind === 'ball') { adjustMood(pp, -.5); adjustMood(b, .3); } }
  if (kind === 'strikeLook' || kind === 'swing') {
    G.strikes++; const sw = kind === 'swing';
    if (G.strikes >= 3) { end = 'K'; G.kSwing = sw; flowSfx('strike'); say(SAYX.k(b, sw, PT)); colorSay(COLOR.k(b, PT, sw), 1.9); toast(sw ? '揮空三振！' : '看三振！', '#fff27a', '#ff5a1a'); E.ump.anim = { name: 'ump', t: 0, dur: .4, opt: {} }; b.st.k++; G.outs++; curPitcher().outs++; showOut('三振'); }
    else { flowSfx('strike'); say(sw ? SAYX.strikeSwing(PT) : SAYX.strikeLook(PT)); if (Math.random() < .4) { const cm = COLOR.pitch(PT, sw ? 'strikeSwing' : 'strikeLook'); if (cm) colorSay(cm, 1.8); } toast(sw ? '揮空' : '好球', '#fff27a', '#ff7a1a'); }
  } else if (kind === 'ball') {
    G.balls++; if (G.balls >= 4) { end = G.intWalk ? 'IBB' : 'BB'; say(G.intWalk ? castA('故意四壞保送') : SAYX.bb(b)); if (!G.intWalk) colorSay(COLOR.bb(b), 1.9); toast(G.intWalk ? '故意四壞' : '四壞保送', '#9fff9f', '#2a9a3a'); }
    else { flowSfx('ball'); say(SAYX.ball(PT)); if (Math.random() < .4) { const cm = COLOR.pitch(PT, 'ball'); if (cm) colorSay(cm, 1.8); } toast('壞球', '#aaffaa', '#2a9a3a'); }
  } else if (kind === 'hbp') { end = 'HBP'; say(SAYX.hbp(b)); toast('觸身球', '#ffd0a0', '#ff5a1a'); flowSfx('mitt'); }
  updateLamps(); updateScoreboard(); try { pitchReact(kind, end); } catch (e) { }
  if (G.outs >= 3) { G.pending = null; after(1.0, endHalf); return; }
  const stealing = E.runners.some(r => r.state === 'run');
  const go = () => { if (end) finishAB(end); else { G.phase = 'pre'; prePitch(); } };
  const next = () => { if (!end || end === 'K') catcherReturn(go); else go(); };
  if (stealing || (PT && PT.wild)) { G.pending = end ? { kind: end } : null; after(.01, startBatteryPlay); return; }
  if (end === 'HBP') { const hp = PT; after(.9, () => hbpEvent(hp)); return; }
  if (end === 'BB' || end === 'IBB') { after(.7, () => awardBase(end)); return; }
  after(end ? 1.0 : .5, next);
}
function startBatteryPlay() {
  const C = E.F.C; const wild = PT && PT.wild;
  PL = { id: ++G.playId, kind: wild ? 'wp' : 'steal', state: 'held', holder: C, plan: { kind: wild ? 'wp' : 'steal', air: false }, res: {}, sim: null, t: 0, tAge: 0, foul: false, cover: { 0: C, 1: E.F['1B'], 2: E.bat && E.bat.side > 0 ? E.F.SS : E.F['2B'], 3: E.F['3B'] }, err: false, runsMade: 0, outsMade: 0 };
  G.phase = 'inplay';
  for (const f of Object.values(E.F)) { f.sp = 4.4; }
  PL.cover[2].tx = baseSpot(2).x; PL.cover[2].tz = baseSpot(2).z + .5; PL.cover[2].sp = 6; PL.cover[3].tx = baseSpot(3).x + .5; PL.cover[3].tz = baseSpot(3).z + .5; PL.cover[3].sp = 6;
  if (wild) {
    PL.state = 'loose'; { const wl = PT.wildLand || { x: PT.fx * 2.2, z: 12 }; PL.loose = { x: wl.x, z: wl.z, t: 0 }; } PL.looseF = C; C.tx = PL.loose.x; C.tz = PL.loose.z; C.sp = 6; PL.kind = 'wp'; flowOnError(C, 'wp');
    G.errs[1 - G.half] += 0; say(PT.dirt ? '<em>球打在地上彈開了！</em>捕手轉身去撿球！' : '暴投！球跑掉了！'); toast(PT.dirt ? '彈地球' : '暴投', '#fff', '#f55');
  } else holderThink(C);
}
function awardBase(kind) {
  if (G.over || G.forfeit >= 0) return; if (E.bat) { const eb = E.bat; eb.rig.root.position.set(eb.x, 0, eb.z); eb.rig.root.rotation.y = eb.side > 0 ? Math.PI / 2 : -Math.PI / 2; eb.rig.run = 0; eb.rig.anim = null; }
  const br = makeBatterRunner(); br.goal = 1; br.pre = .1; setupForced(); G.phase = 'inplay'; G.walking = true;
  const wait = () => { if (E.runners.some(r => r.state === 'run')) { after(.2, wait); } else { G.walking = false; after(.4, () => finishAB(kind, true)); } };
  after(.4, wait);
}
function finishAB(kind, already) {
  if (G.over || G.forfeit >= 0) return; const b = curBatter(), st = b.st;
  if (kind === 'K') { st.ab++; }
  else if (kind === 'BB' || kind === 'IBB' || kind === 'HBP') { st.bb++; }
  G.bi[G.half] = (G.bi[G.half] + 1) % 9;
  abMood(kind, b);
  clearPlay(); setBall({ x: 0, y: 0, z: 0 }, false); PT = null;
  updateScoreboard(); updateLamps();
  if (G.walkoff) { endGame(); return; }
  const buf = G.outFlag ? (kind === 'K' ? .9 : 1.5) : .6; G.outFlag = false;      // 打者／跑者出局後，多停 1~2 秒讓 OUT 提示看完再換下一位
  if (G.outs >= 3) { after(.5, endHalf); return; }
  const l = fieldingTeam(); aiManagePitcher(1 - G.half);
  G.phase = 'change'; after(buf, () => processInjuries(nextBatter));
}
function endHalf() {
  if (G.over || G.phase === 'endhalf') return; G.phase = 'endhalf'; G.stormHalves = rainK() >= .8 ? (G.stormHalves || 0) + 1 : 0; G.outFlag = false; clearPlay(); tweens.length = 0; setBall({ x: 0, y: 0, z: 0 }, false);
  toast('三上三下 攻守交換', '#fff', '#39f'); flowSfx('whistle'); say(SAYX.inningEnd());
  for (const r of E.runners) r.rig.root.visible = false;
  const lastIn = G.inning >= G.innings;
  if (G.half === 0) { if (lastIn && G.score[1] > G.score[0]) { after(1.6, endGame); return; } G.half = 1; }
  else { if (lastIn && G.score[0] !== G.score[1]) { after(1.6, endGame); return; } if (G.inning >= 12) { after(1.6, endGame); return; } G.half = 0; G.inning++; }
  updateScoreboard(); after(2.2, startHalf);
}
function changePitcher(side, idx, forced, why) {
  const t = G.teams[side]; const np = t.pitchers[idx]; if (!np || idx === t.cur || np.out) return;
  const old = t.pitchers[t.cur]; old.used = true; t.cur = idx; t.lastChg = G.inning * 2 + G.half; np.pc = 0; np.fl = 0; np.pkLoad = 0; np.fatigue = 0; np.tilt = clamp((60 - moodOf(np)) * .7, 0, 40); try { warmApply(np, side); } catch (e) { console.error(e); }
  if (!t.dh) { const pb = genBatter(1, 'P', np.num, 8); pb.name = np.name; pb.isPitcherBat = true; pb.nat = 'P'; pb.out = false; pb.pos = 'P'; t.lineup[8] = pb; }
  if (side === 1 - G.half && E.F.P) {
    const f = E.F.P, st = teamStyle(side); disposeRig(f.rig);
    const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, glove: true, pl: np, catcher: f.pos === 'C' }); scene.add(rig.root); rig.root.position.set(f.x, 0, f.z); f.rig = rig; f.pl = np; rig.ready = true; faceRig(rig, 0, 0);
  }
  if (!forced) say(`換投。${sideName(side)}由 <em>${np.name}</em>(${np.hand === 'R' ? '右' : '左'})走上投手丘接替 ${old.name}${why ? '（' + why + '）' : ''}${np._wn || ''}`);
  toast('換投', '#fff', '#39f'); updatePlayerBoxes(); introPitcher(side, np, old);
}
