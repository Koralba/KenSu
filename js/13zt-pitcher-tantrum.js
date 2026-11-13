/* ===== 13zt-pitcher-tantrum.js ｜ v1.3.9 投手發脾氣：摔手套＋吐口水 =====
   三個時機（全部只做畫面動作，不影響比賽結果；window.__ff 快轉／測試時不會觸發）：
   ① 投手被打爆、心情很差（reactAB 之後，依心情／結果機率觸發；每位投手每場最多 2 次、至少隔 20 球）
   ② 被教練換下場而且很不爽（心情差或失分多）：分身留在丘上摔手套、吐口水，再低頭走回休息室（接替的投手同時上場，比賽流程不被拖慢）
   ③ 被驅逐出場：怒吼（原本的 pitcherRage）之後，摔手套、吐口水，再走回休息室
   動作 'gthrow'（摔手套）、'spit'（吐口水）定義在 03-players-ball-camera.js 的 rig 動畫 switch；手套飛出去／口水落地由本檔的簡易物理負責。 */
const TANTRUM = (() => {
  const pieces = [], ghosts = []; let lastT = performance.now();
  const ok = () => { try { return typeof cosmeticOK === 'function' ? cosmeticOK() : true; } catch (e) { return false; } };
  const nm = r => { try { return (r && r.pl && r.pl.name) || ''; } catch (e) { return ''; } };
  function worldOf(o) { const w = new THREE.Vector3(); try { o.updateWorldMatrix(true, false); o.getWorldPosition(w); } catch (e) { } if (!isFinite(w.x + w.y + w.z)) w.set(0, 1.2, 0); return w; }
  function toss(r, big) {      // 手套飛出去：朝前下方用力甩，落地彈跳後躺在丘上；幾秒後撿回（手套重新出現在手上）
    if (!r || !r.glove || !ok() || r._tantG) return;
    try {
      r.root.updateMatrixWorld(true); const w = worldOf(r.glove), m = new THREE.Mesh(r.glove.geometry, r.glove.material), ry = r.root.rotation.y, s = Math.random() < .5 ? -1 : 1, sp = big ? 6.5 : 4.6;
      m.scale.copy(r.glove.scale).multiplyScalar(1.15); m.position.copy(w); scene.add(m); r.glove.visible = false; r._tantG = true;
      pieces.push({ k: 'g', m, r, vx: Math.sin(ry) * sp + s * 1.4, vy: 2.2 + Math.random(), vz: Math.cos(ry) * sp, sx: (Math.random() - .5) * 16, sz: (Math.random() - .5) * 16, age: 0, rest: 0, bounce: .38 });
      while (pieces.length > 10) { const o = pieces.shift(); scene.remove(o.m); if (o.r) { o.r.glove.visible = true; o.r._tantG = false; } }
      try { noiseBurst(.1, 240, 2, .3, 'lowpass'); CAMC.shake = Math.max(CAMC.shake || 0, .07); } catch (e) { }
      try { say(`<em>啪！${nm(r)}氣到把手套摔在地上！</em>`, 2200); } catch (e) { }
    } catch (e) { }
  }
  function spit(r) {      // 往地上吐口水：一小顆白色泡沫從嘴前飛出去，落地後攤平、慢慢消失
    if (!r || !r.head || !ok()) return;
    try {
      const w = worldOf(r.head), ry = r.root.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(i ? .028 : .04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: .92 }));
        m.position.set(w.x + fx * .42, w.y - .12, w.z + fz * .42); scene.add(m);
        pieces.push({ k: 's', m, vx: fx * (2.2 + i * .5) + (Math.random() - .5) * .4, vy: 1.1 + Math.random() * .5, vz: fz * (2.2 + i * .5) + (Math.random() - .5) * .4, sx: 0, sz: 0, age: 0, rest: 0, bounce: 0 });
      }
      try { noiseBurst(.07, 2600, 1.6, .1, 'highpass'); } catch (e) { }
      try { say(`<em>${nm(r)}往地上吐了一口口水，表達不滿…</em>`, 2200); } catch (e) { }
    } catch (e) { }
  }
  function physics(dt) {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const o = pieces[i], m = o.m; o.age += dt;
      const life = o.k === 'g' ? 3.6 : 4.2;
      if (o.age > life) { scene.remove(m); if (o.k === 's') { try { m.geometry.dispose(); m.material.dispose(); } catch (e) { } } if (o.r) { o.r.glove.visible = true; o.r._tantG = false; } pieces.splice(i, 1); continue; }
      if (o.k === 's' && o.rest) { m.material.opacity = Math.max(0, .92 * Math.min(1, (life - o.age) / 1.2)); continue; }
      if (o.rest) continue; o.vy -= 9.8 * dt; m.position.x += o.vx * dt; m.position.y += o.vy * dt; m.position.z += o.vz * dt;
      if (o.k === 'g') { m.rotation.x += o.sx * dt; m.rotation.z += o.sz * dt; }
      const gy = o.k === 'g' ? .09 : .02;
      if (m.position.y < gy) {
        m.position.y = gy;
        if (o.k === 's') { o.rest = 1; m.scale.set(2.6, .25, 2.6); }
        else if (Math.abs(o.vy) > 1.2) { o.vy = -o.vy * o.bounce; o.vx *= .65; o.vz *= .65; o.sx *= .6; o.sz *= .6; }
        else { o.vy = 0; o.vx *= .88; o.vz *= .88; o.sx *= .8; o.sz *= .8; if (Math.hypot(o.vx, o.vz) < .15) o.rest = 1; }
      }
    }
  }
  function ghostStep(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]; g.t += dt; const r = g.rig;
      if (g.t > 16 || G.over) { try { scene.remove(r.root); disposeRig(r); } catch (e) { } ghosts.splice(i, 1); continue; }
      if (g.t >= g.walkAt) {
        const dx = g.tx - g.x, dz = g.tz - g.z, d = Math.hypot(dx, dz);
        if (d < .6) { try { scene.remove(r.root); disposeRig(r); } catch (e) { } ghosts.splice(i, 1); continue; }
        const v = Math.min(d, 3.6 * dt); g.x += dx / d * v; g.z += dz / d * v; r.run = 1.0; faceRig(r, g.tx, g.tz);
        if (!r.anim || r.anim.t >= r.anim.dur) r.anim = { name: 'headdown', t: 0, dur: 1e9, opt: { hold: true } };
      }
      r.root.position.set(g.x, 0, g.z); try { rigStep(r, dt); } catch (e) { }
    }
  }
  (function loop() { requestAnimationFrame(loop); const n = performance.now(), dt = Math.min(.05, (n - lastT) / 1000); lastT = n; try { if (!G.freeze && !window.__ff) { if (pieces.length) physics(dt); if (ghosts.length) ghostStep(dt); } } catch (e) { } })();
  /* 發脾氣整套：摔手套（1.5 秒）→ 吐口水（1.2 秒）。done 在整套結束時呼叫。 */
  function sequence(r, o, done) {
    o = o || {}; if (!r || !ok()) { if (done) done(); return false; }
    r.run = 0; r.anim = { name: 'gthrow', t: 0, dur: 1.5, opt: { big: !!o.big } };
    try { if (typeof faceEmote === 'function') faceEmote(r, 'angry', 3.0); } catch (e) { }
    after(1.55, () => { if (!r.root || !r.root.parent && !o.ghost) { if (done) done(); return; } r.anim = { name: 'spit', t: 0, dur: 1.2, opt: {} }; try { if (typeof faceEmote === 'function') faceEmote(r, 'angry', 1.6); } catch (e) { } });
    after(2.8, () => { if (done) done(); });
    return true;
  }
  /* ① 場上生氣：投手還在丘上，球不會在這段時間投出（借用 G.rosinBusy 擋住出手，跟摸止滑粉一樣） */
  function onMound(f) {
    const r = f && f.rig; if (!r || !ok() || G.rosinBusy || PL || G.mode !== 'play' || G.over) return false;
    if (r.anim && r.anim.t < r.anim.dur) return false;
    G.rosinBusy = true; const tok = G.tantTok = (G.tantTok || 0) + 1; faceRig(r, 0, 3);
    sequence(r, { big: false }, () => { if (G.tantTok === tok) G.rosinBusy = false; });
    return true;
  }
  /* ②③ 離場：在丘上留一個分身，摔手套、吐口水，再走回休息室（side：該投手所屬球隊，1＝主場／右側休息室） */
  function exitGhost(old, side, x0, z0, big) {
    if (!ok()) return false;
    try {
      const st = teamStyle(side), rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, glove: true, pl: old, catcher: false }), sx = side === 1 ? 1 : -1;
      scene.add(rig.root); rig.ready = true; const gx = x0 + sx * 1.3, gz = z0 + .3; rig.root.position.set(gx, 0, gz); faceRig(rig, 0, 3);
      const g = { rig, x: gx, z: gz, tx: sx * 19, tz: -7, t: 0, walkAt: 99 }; ghosts.push(g);
      sequence(rig, { big: !!big, ghost: true }, () => { g.walkAt = g.t; });
      return true;
    } catch (e) { return false; }
  }
  return { toss, spit, sequence, onMound, exitGhost, get pieces() { return pieces.length; }, get ghosts() { return ghosts.length; } };
})();

/* ---- 掛接 ---- */
(function () {
  // ① 被打爆、心情很差：reactAB（打席結束後投手反應）之後，依結果與心情機率發脾氣
  if (typeof reactAB === 'function') {
    const _ra = reactAB;
    reactAB = function (kind, b) {
      try { _ra.apply(this, arguments); } catch (e) { console.error(e); }
      try {
        if (!kind || !cosmeticOK()) return; const f = E.F.P, pp = curPitcher(); if (!f || !f.rig || !pp) return;
        const m = moodOf(pp), hr = kind === 'HR' || kind === 'H4', hit = kind[0] === 'H' && kind !== 'HBP' && !hr, bb = kind === 'BB' || kind === 'IBB';
        const base = hr ? .55 : hit ? .2 : bb ? .08 : 0; if (!base) return;
        const ang = clamp((52 - m) / 32, 0, 1); if (ang <= 0) return;
        if ((pp._tantN || 0) >= 2 || (G.pitchNo != null && pp._tantAt != null && G.pitchNo - pp._tantAt < 20)) return;
        if (Math.random() >= base * ang * (G.on[1] || G.on[2] ? 1.2 : 1)) return;
        pp._tantN = (pp._tantN || 0) + 1; pp._tantAt = G.pitchNo != null ? G.pitchNo : 0;
        after(2.5, () => { try { if (E.F.P === f && G.phase !== 'inplay' && !E.walk && !E.rage) TANTRUM.onMound(f); } catch (e) { } });
      } catch (e) { }
    };
  }
  // ② 被換下場（非受傷、非驅逐）：心情差、失分多就生氣離場
  if (typeof changePitcher === 'function') {
    const _cp = changePitcher;
    changePitcher = function (side, idx, forced, why) {
      let info = null;
      try {
        if (!forced && cosmeticOK() && side === 1 - G.half && E.F.P && E.F.P.rig && G.mode === 'play') {
          const t = G.teams[side], old = t.pitchers[t.cur];
          if (old && idx !== t.cur) {
            const m = moodOf(old), er = old.er || 0, p = clamp((55 - m) / 55 * .8 + (er >= 4 ? .3 : er >= 3 ? .15 : 0) + (old.tilt > 25 ? .1 : 0), 0, .9);
            if (Math.random() < p) info = { old, side, x: E.F.P.x, z: E.F.P.z, big: m < 35 || er >= 4 };
          }
        }
      } catch (e) { }
      const rv = _cp.apply(this, arguments);
      try { if (info) TANTRUM.exitGhost(info.old, info.side, info.x, info.z, info.big); } catch (e) { }
      return rv;
    };
  }
  // ③ 被驅逐：怒吼之後先摔手套、吐口水，再走回休息室
  if (typeof ejectWalk === 'function') {
    const _ew = ejectWalk;
    ejectWalk = function (side, cb) {
      const f = E.F.P;
      if (f && f.rig && cosmeticOK()) { f.rig.anim = null; TANTRUM.sequence(f.rig, { big: true }, () => _ew(side, cb)); return; }
      return _ew(side, cb);
    };
  }
})();
