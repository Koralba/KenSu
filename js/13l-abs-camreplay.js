'use strict';
/* 13l-abs-camreplay.js ｜ ABS 跑壘挑戰：多鏡頭慢動作回放（取代 06 的 showRaceReplay「時間軸圖表」）
   做法：
   ① 平常（有跑者在跑／在壘上、ABS 開啟、沒有凍結、非快轉）每幀把跑者與 9 位野手的 3D 姿勢＋球的位置錄進環狀緩衝（約 2.5 秒）。
   ② 包住 06 的 tagReview()：close play 一發生（尚未判決）就把最近 1.7 秒複製起來（含「現在」這一幀）。
   ③ 包住 06 的 showRaceReplay(info, cb)：挑戰成立時，凍結中的比賽改用這份錄影，從 3 個機位慢動作重播
      （壘包正面／俯視／壘包側面），在「球入手套」與「跑者踩壘」兩個瞬間定格並標示時間差，最後顯示 SAFE／OUT。
   ④ 不改判決邏輯（誰先到仍由 06 決定）；回放只是把同一份結果「演」出來。資料不足或快轉中，退回 06 原本的圖表。
   ⑤ 全壘打／界外／場地規則二壘安打判決（06 的 showFieldReplay）也改成同樣的多鏡頭慢動作：直接用球的模擬軌跡 sim.S 重播，
      畫面加上軌跡點、界線平面（全壘打柱）或牆頂線、落地點與越牆點標記，定格後顯示判決。
   只用到 06 的 tagReview／showRaceReplay／showFieldReplay／rpHide／BASE_NM／CLOSE_T，03 的 CAMC／camSnap／setBall／ballMesh，
   04 的 G／E／sampleAt／WALL_H／wallRadius。 */
const ABSCAM = (function () {
  const NODES = ['body', 'head', 'armL', 'armR', 'legL', 'legR'], STR = 4 + NODES.length * 7, MAXR = 18, NF = 150, KEEP = 1.7;
  const ring = []; let head = 0, cnt = 0, lastT = -9;
  const REV = []; let cur = null;
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const live = () => typeof G !== 'undefined' && G && G.mode === 'play' && G.absOn && !G.over;

  /* ---------- 錄影 ---------- */
  function rigsNow() {
    const out = [], seen = new Set(), add = r => { if (r && r.root && !seen.has(r) && out.length < MAXR) { seen.add(r); out.push(r); } };
    try { for (const r of E.runners) if (r) add(r.rig); for (const k in E.F) if (E.F[k]) add(E.F[k].rig); } catch (e) { }
    return out;
  }
  function pack(rig, a, o) {
    const p = rig.root.position; a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = rig.root.rotation.y; let k = o + 4;
    for (const n of NODES) { const g = rig[n]; if (g) { a[k] = g.position.x; a[k + 1] = g.position.y; a[k + 2] = g.position.z; a[k + 3] = g.rotation.x; a[k + 4] = g.rotation.y; a[k + 5] = g.rotation.z; a[k + 6] = g.scale.y; } k += 7; }
  }
  function applyRig(rig, da, oa, db, ob, u) {
    const L = j => { const x = da[oa + j]; if (!db) return x; const y = db[ob + j]; if (j === 3) { let d = y - x; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return x + d * u; } return x + (y - x) * u; };
    rig.root.position.set(L(0), L(1), L(2)); rig.root.rotation.y = L(3); let k = 4;
    for (const n of NODES) { const g = rig[n]; if (g) { g.position.set(L(k), L(k + 1), L(k + 2)); g.rotation.x = L(k + 3); g.rotation.y = L(k + 4); g.rotation.z = L(k + 5); g.scale.y = L(k + 6); } k += 7; }
  }
  function sample(force) {
    const t = G.clk || 0;
    if (!force) { if (t < lastT - .5) { cnt = 0; lastT = -9; } if (t - lastT < .0155) return; }
    const rigs = rigsNow(); if (!rigs.length) return;
    const fr = ring[head] || (ring[head] = { t: 0, b: [0, 0, 0], bv: false, rigs: [], data: new Float32Array(MAXR * STR) }), bp = ballMesh.position;
    fr.t = t; fr.bv = !!ballMesh.visible; fr.b[0] = bp.x; fr.b[1] = bp.y; fr.b[2] = bp.z; fr.rigs = rigs;
    for (let i = 0; i < rigs.length; i++) pack(rigs[i], fr.data, i * STR);
    head = (head + 1) % NF; cnt = Math.min(NF, cnt + 1); lastT = t;
  }
  function snap() {
    const out = []; if (!cnt) return out; const now = ring[(head - 1 + NF) % NF].t;
    for (let i = cnt - 1; i >= 0; i--) { const fr = ring[(head - 1 - (cnt - 1 - i) + NF * 2) % NF]; if (now - fr.t > KEEP) break; out.push({ t: fr.t, b: fr.b.slice(), bv: fr.bv, rigs: fr.rigs.slice(), data: fr.data.slice(0, fr.rigs.length * STR) }); }
    return out.reverse();
  }

  /* ---------- 攔 06：close play 發生時存下錄影 ---------- */
  const _tagReview = tagReview;
  tagReview = function (f, r, how, m, truthOut) {
    try {
      if (live() && !window.__ff && r && !r.reviewed && !r.ruledSafe && Math.abs(m) <= CLOSE_T) {
        sample(true);
        REV.push({ f, r, m, truthOut, bs: r.state === 'on' ? r.from : (r.dir > 0 ? r.to : r.from), frames: snap() });
        if (REV.length > 6) REV.shift();
      }
    } catch (e) { console.error(e); }
    return _tagReview.apply(this, arguments);
  };
  const _showRaceReplay = showRaceReplay;
  showRaceReplay = function (i, cb) {
    let ok = false;
    try { ok = !window.__ff && start(i, cb); } catch (e) { console.error(e); try { stop(false); } catch (e2) { } ok = false; }
    if (!ok) return _showRaceReplay.call(this, i, cb);
  };
  const _rpHide = rpHide;
  rpHide = function () { if (cur) { try { stop(false); } catch (e) { } } return _rpHide.apply(this, arguments); };

  /* ---------- 壘包座標與機位 ---------- */
  function baseXZ(bs) {
    const b = (bs % 4 === 0) ? 4 : bs % 4;
    try { if (typeof baseSpot === 'function') { const p = baseSpot(b); if (p && isFinite(p.x) && isFinite(p.z)) return { x: p.x, z: p.z }; } } catch (e) { }
    return null;
  }
  function locate(F, tt) {
    const n = F.length; if (tt <= F[0].t) return [0, 0, 0]; if (tt >= F[n - 1].t) return [n - 1, n - 1, 0];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].t <= tt) lo = mid; else hi = mid; }
    return [lo, hi, (tt - F[lo].t) / Math.max(1e-6, F[hi].t - F[lo].t)];
  }
  function rigPosAt(F, rig, tt) {
    const [i, j, u] = locate(F, tt), A = F[i], B = F[j], ia = A.rigs.indexOf(rig); if (ia < 0) return null;
    const ib = i === j ? -1 : B.rigs.indexOf(rig), a = ia * STR, b = ib * STR;
    return ib < 0 ? { x: A.data[a], z: A.data[a + 2] } : { x: A.data[a] + (B.data[b] - A.data[a]) * u, z: A.data[a + 2] + (B.data[b + 2] - A.data[a + 2]) * u };
  }

  /* ---------- 介面 ---------- */
  const CSS = `#rpCam{position:fixed;inset:0;z-index:90;pointer-events:none;color:#fff;font-family:'Noto Sans TC',sans-serif}
#rpCam .rc-bar{position:absolute;left:0;right:0;background:#000;display:flex;align-items:center;justify-content:space-between;padding:0 3vw;box-sizing:border-box}
#rpCam .rc-top{top:0;height:11%;background:linear-gradient(#000 70%,rgba(0,0,0,0))}#rpCam .rc-bot{bottom:0;height:13%;background:linear-gradient(rgba(0,0,0,0),#000 35%)}
#rpCam .rc-t{font-weight:900;font-size:clamp(14px,2.6vw,24px);letter-spacing:.06em;text-shadow:0 0 8px #07c}#rpCam .rc-t i{display:inline-block;width:.7em;height:.7em;border-radius:50%;background:#f33;margin-right:.4em;animation:rcB 1s infinite}
@keyframes rcB{50%{opacity:.25}}
#rpCam .rc-cam{font-size:clamp(12px,2vw,18px);color:#ffe08a;font-weight:700}#rpCam .rc-info{font-size:clamp(11px,1.8vw,16px);opacity:.9}
#rpCam .rc-skip{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:.35em 1em;font-size:clamp(12px,1.8vw,16px);font-weight:700}
#rpCam .rc-fl{position:absolute;left:50%;top:70%;transform:translate(-50%,0);text-align:center;opacity:0;white-space:nowrap}
#rpCam .rc-fl.on{animation:rcF 1.3s ease-out forwards}#rpCam .rc-fl b{display:block;font-size:clamp(18px,4vw,36px);font-weight:900;text-shadow:0 2px 10px #000,0 0 16px #0af}#rpCam .rc-fl small{font-size:clamp(12px,2.2vw,20px);color:#ffe08a;text-shadow:0 1px 6px #000}
@keyframes rcF{0%{opacity:0;transform:translate(-50%,10px) scale(.85)}12%{opacity:1;transform:translate(-50%,0) scale(1.05)}25%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0}}
#rpCam .rc-ver{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) scale(.6);text-align:center;opacity:0;transition:all .35s cubic-bezier(.2,1.4,.4,1);background:rgba(0,0,0,.62);border:2px solid #fff;border-radius:14px;padding:.6em 1.6em}
#rpCam .rc-ver.on{opacity:1;transform:translate(-50%,-50%) scale(1)}#rpCam .rc-ver b{display:block;font-size:clamp(28px,8vw,70px);font-weight:900;letter-spacing:.08em}#rpCam .rc-ver div{font-size:clamp(12px,2.4vw,20px);line-height:1.6}
body.rpcam #leftCol,body.rpcam #acts,body.rpcam #absPanel{visibility:hidden!important}`;
  function css() { if (document.getElementById('absCamCss')) return; const s = document.createElement('style'); s.id = 'absCamCss'; s.textContent = CSS; document.head.appendChild(s); }
  function buildUI(title, infoText) {
    css(); const e = document.createElement('div'); e.id = 'rpCam';
    e.innerHTML = `<div class="rc-bar rc-top"><span class="rc-t"><i></i>${title}</span><span class="rc-cam"></span></div><div class="rc-fl"></div><div class="rc-ver"></div><div class="rc-bar rc-bot"><span class="rc-info"></span><button class="rc-skip">跳過 ⏭</button></div>`;
    document.body.appendChild(e); document.body.classList.add('rpcam');
    e.querySelector('.rc-info').textContent = infoText;
    e.querySelector('.rc-skip').onclick = ev => { ev.stopPropagation(); skip(); };
    return e;
  }
  const flash = (html) => { const f = cur.ui.querySelector('.rc-fl'); f.innerHTML = html; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); };
  const keyH = e => { if (!cur) return; if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (e.type === 'keydown') skip(); } };

  /* ---------- 回放主流程 ---------- */
  const PASSES = [
    { kind: 'front', name: '鏡頭 1／3　壘包正面', speed: .35, hold: .35 },
    { kind: 'top', name: '鏡頭 2／3　俯視', speed: .35, hold: .25 },
    { kind: 'side', name: '鏡頭 3／3　壘包側面（定判）', speed: .3, hold: .4 }
  ];
  function start(i, cb) {
    const rv = REV.slice().reverse().find(x => x.r && x.r.pl && x.r.pl.name === i.runner && BASE_NM[x.bs % 4] === i.base);
    if (!rv || !rv.frames || rv.frames.length < 6) return false;
    const F = rv.frames; if (F[F.length - 1].t - F[0].t < .3) return false;
    const B = baseXZ(rv.bs); if (!B) return false;
    const rr = rv.r.rig, fr = rv.f && rv.f.rig; if (!rr || !F[F.length - 1].rigs.includes(rr)) return false;
    const Tb = F[F.length - 1].t, Tr = Tb + rv.m, Tfirst = Math.min(Tb, Tr), Tsecond = Math.max(Tb, Tr), tEnd = Tsecond + .14, t0 = Math.max(F[0].t, Tfirst - .4);
    let p0 = rigPosAt(F, rr, t0), dx = p0 ? B.x - p0.x : 0, dz = p0 ? B.z - p0.z : 0;
    if (Math.hypot(dx, dz) < 1.2) { const pb = baseXZ(rv.bs % 4 === 1 ? 4 : (rv.bs % 4 === 0 ? 3 : rv.bs - 1)); if (pb) { dx = B.x - pb.x; dz = B.z - pb.z; } }
    const dl = Math.hypot(dx, dz); if (dl < .1) return false; dx /= dl; dz /= dl;
    let px = -dz, pz = dx; const b2 = baseXZ(2), cx = b2 ? b2.x / 2 : 0, cz = b2 ? b2.z / 2 : -19; if (px * (B.x - cx) + pz * (B.z - cz) < 0) { px = -px; pz = -pz; }
    const lastR = rigPosAt(F, rr, Tb), lastFrame = F[F.length - 1], saved = {
      mode: CAMC.mode, pos: CAMC.pos.clone(), look: CAMC.look.clone(), fov: CAMC.fov, tpos: CAMC.tpos.clone(), tlook: CAMC.tlook.clone(), tfov: CAMC.tfov, k: CAMC.k, kl: CAMC.kl,
      ball: { x: lastFrame.b[0], y: lastFrame.b[1], z: lastFrame.b[2], v: lastFrame.bv }
    };
    cur = { rv, F, B, d: { x: dx, z: dz }, p: { x: px, z: pz }, rr, fr, Tb, Tr, Tfirst, Tsecond, tEnd, t0, lastR, saved, info: i, cb, tok: G.judgeTok, kind: 'run', passes: PASSES, pi: 0, tt: t0, hold: .35, stage: 'pass', vt: 0, last: performance.now(), evs: [], mk: {}, ui: buildUI('ABS 跑壘回放', `${i.runner} → ${i.base}（${i.fielder}接球）`) };
    document.addEventListener('keydown', keyH, true); document.addEventListener('keyup', keyH, true);
    newPass(); return true;
  }
  function newPass() {
    const P = cur.passes[cur.pi]; cur.hold = .35; let ev;
    if (cur.kind === 'ball') { ev = cur.evDefs.map(e => Object.assign({}, e, { done: false })); cur.t0 = Math.max(0, cur.Tfirst - P.lead); cur.tEnd = Math.min(cur.tMax, cur.Tsecond + P.post); }
    else { ev = [{ t: cur.Tb, kind: 'ball', label: '🧤 球進手套' }, { t: cur.Tr, kind: 'run', label: '👟 跑者踩壘' }].sort((a, b) => a.t - b.t); ev.forEach((e, k) => { e.done = false; e.tc = k === 0 ? '0.000 秒' : `+${Math.abs(cur.rv.m).toFixed(3)} 秒`; }); }
    cur.tt = cur.t0;
    cur.evs = ev; cur.ui.querySelector('.rc-cam').textContent = `${P.name}　慢動作 ×${P.speed}`;
    camFor(P.kind, true); applyAt(cur.tt);
  }
  function camFor(kind, snapNow) {
    if (cur.kind === 'ball') return camForBall(kind, snapNow);
    const B = cur.B, d = cur.d, p = cur.p; let pos, fov;
    if (kind === 'front') { pos = [B.x + d.x * 5.4, 1.3, B.z + d.z * 5.4]; fov = 34; }
    else if (kind === 'top') { pos = [B.x - d.x * .9, 10.5, B.z - d.z * .9]; fov = 38; }
    else { pos = [B.x + p.x * 5.2 - d.x * .6, 1.05, B.z + p.z * 5.2 - d.z * .6]; fov = 36; }
    const rp = cur.rrNow || cur.lastR || B, w = .3, ly = kind === 'top' ? .2 : .75;
    const prog = clampN((cur.tt - cur.t0) / Math.max(.1, cur.tEnd - cur.t0), 0, 1);
    CAMC.mode = 'rcam'; CAMC.tpos.set(pos[0], pos[1], pos[2]); CAMC.tlook.set(B.x + (rp.x - B.x) * w, ly, B.z + (rp.z - B.z) * w); CAMC.tfov = fov * (1 - .12 * prog) * (VP.fk || 1); CAMC.k = 10; CAMC.kl = 0;
    if (snapNow) { camSnap(); CAMC.pos.copy(CAMC.tpos); CAMC.look.copy(CAMC.tlook); CAMC.fov = CAMC.tfov; }
  }
  function applyAt(tt) {
    if (cur.kind === 'ball') return applyBall(tt);
    const F = cur.F, [i, j, u] = locate(F, tt), A = F[i], Bf = F[j];
    A.rigs.forEach((rig, ia) => { const ib = i === j ? -1 : Bf.rigs.indexOf(rig); applyRig(rig, A.data, ia * STR, ib >= 0 ? Bf.data : null, ib * STR, u); });
    const bb = i === j ? A.b : [A.b[0] + (Bf.b[0] - A.b[0]) * u, A.b[1] + (Bf.b[1] - A.b[1]) * u, A.b[2] + (Bf.b[2] - A.b[2]) * u];
    setBall({ x: bb[0], y: bb[1], z: bb[2] }, A.bv);
    const rr = cur.rr, rp = rr.root.position;
    if (tt > cur.Tb && cur.rv.m > .001) { const k = clampN((tt - cur.Tb) / cur.rv.m, 0, 1); rp.x = cur.lastR.x + (cur.B.x - cur.lastR.x) * k; rp.z = cur.lastR.z + (cur.B.z - cur.lastR.z) * k; }
    cur.rrNow = { x: rp.x, z: rp.z };
    markers(tt, bb);
  }
  function markers(tt, bb) {
    try {
      if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
      if (!cur.mk.base) {
        const mat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .85, depthTest: false });
        const rg = new THREE.Mesh(new THREE.RingGeometry(.55, .8, 32), mat(0x6dff8c)); rg.rotation.x = -Math.PI / 2; rg.position.set(cur.B.x, .08, cur.B.z); rg.renderOrder = 999; rg.visible = false; scene.add(rg);
        const gl = new THREE.Mesh(new THREE.SphereGeometry(.32, 14, 10), mat(0xffa43a)); gl.renderOrder = 999; gl.visible = false; scene.add(gl); cur.mk.base = rg; cur.mk.glove = gl;
      }
      const pu = 1 + .18 * Math.sin(performance.now() * .012);
      cur.mk.base.visible = tt >= cur.Tr; cur.mk.base.scale.set(pu, pu, 1);
      cur.mk.glove.visible = tt >= cur.Tb; const L = cur.F[cur.F.length - 1].b; cur.mk.glove.position.set(L[0], L[1], L[2]); cur.mk.glove.scale.setScalar(pu);
    } catch (e) { }
  }
  function verdict() {
    if (cur.kind === 'ball') return verdictBall();
    const i = cur.info, ms = Math.round(Math.abs(i.m) * 1000), v = cur.ui.querySelector('.rc-ver'), out = i.truthOut;
    v.innerHTML = `<b style="color:${out ? '#ff6b6b' : '#6dff8c'}">${out ? 'OUT 出局' : 'SAFE 安全'}</b><div>${out ? '球比跑者早到' : '跑者比球早到'} <b style="display:inline;font-size:1.15em;color:#ffe08a">${ms} 毫秒</b></div><div>主審原判：${i.callOut ? '出局' : '安全'}${i.callOut !== out ? ' → <b style="display:inline;font-size:1em;color:#ffd24d">誤判</b>' : '（正確）'}</div>`;
    v.style.borderColor = out ? '#ff6b6b' : '#6dff8c'; void v.offsetWidth; v.classList.add('on');
    cur.ui.querySelector('.rc-cam').textContent = '判定結果'; cur.ui.querySelector('.rc-skip').style.visibility = 'hidden';
  }
  function skip() { if (!cur) return; if (cur.stage === 'pass') { cur.stage = 'verdict'; cur.vt = 0; cur.tt = cur.tEnd; camFor(cur.passes[cur.passes.length - 1].kind, true); applyAt(cur.tt); verdict(); } else cur.vt = 99; }
  function tick() {
    const now = performance.now(), dt = Math.min(.05, (now - cur.last) / 1000); cur.last = now;
    if (cur.tok !== G.judgeTok || G.over || G.mode !== 'play') return stop(false);
    G._camBad = 0;
    if (cur.stage === 'pass') {
      const P = cur.passes[cur.pi];
      if (cur.hold > 0) cur.hold -= dt;
      else {
        cur.tt += dt * P.speed;
        for (const e of cur.evs) if (!e.done && cur.tt >= e.t) { cur.tt = e.t; e.done = true; cur.hold = P.hold; flash(`<b>${e.label}</b><small>${e.tc}</small>`); break; }
        if (cur.tt >= cur.tEnd) { cur.tt = cur.tEnd; cur.hold = .25; if (cur.pi + 1 < cur.passes.length) { cur.pi++; newPass(); return; } cur.stage = 'verdict'; cur.vt = 0; verdict(); }
      }
      applyAt(cur.tt); camFor(P.kind, false);
    } else { cur.vt += dt; applyAt(cur.tEnd); camFor(cur.passes[cur.passes.length - 1].kind, false); if (cur.vt > 2.2) stop(true); }
  }
  function stop(done) {
    const c = cur; if (!c) return; cur = null;
    try { document.removeEventListener('keydown', keyH, true); document.removeEventListener('keyup', keyH, true); } catch (e) { }
    try { if (c.F) { const L = c.F[c.F.length - 1]; L.rigs.forEach((rig, ia) => applyRig(rig, L.data, ia * STR, null, 0, 0)); } setBall({ x: c.saved.ball.x, y: c.saved.ball.y, z: c.saved.ball.z }, c.saved.ball.v); if (c.kind === 'ball') ballMesh.scale.setScalar(c.saved.bscale || 1); } catch (e) { }
    try { if (c.mk.base) { scene.remove(c.mk.base); scene.remove(c.mk.glove); } if (c.objs) c.objs.forEach(o => { scene.remove(o); if (o.geometry) o.geometry.dispose(); }); } catch (e) { }
    try { const s = c.saved; CAMC.mode = s.mode; CAMC.pos.copy(s.pos); CAMC.look.copy(s.look); CAMC.fov = s.fov; CAMC.tpos.copy(s.tpos); CAMC.tlook.copy(s.tlook); CAMC.tfov = s.tfov; CAMC.k = s.k; CAMC.kl = s.kl; } catch (e) { }
    try { c.ui.remove(); document.body.classList.remove('rpcam'); } catch (e) { }
    if (done && c.cb) c.cb();
  }

  /* ---------- 全壘打／界外／場地規則二壘安打：用球的模擬軌跡重播 ---------- */
  const PASS_POLE = [
    { kind: 'line', name: '鏡頭 1／3　沿界線（從場內看全壘打柱）', speed: .3, hold: .45, lead: .6, post: .3 },
    { kind: 'side', name: '鏡頭 2／3　界線側面（界內在前、界外在後）', speed: .25, hold: .35, lead: .3, post: .2 },
    { kind: 'top', name: '鏡頭 3／3　俯視（定判）', speed: .25, hold: .4, lead: .35, post: .2 }
  ];
  const PASS_BOUNCE = [
    { kind: 'wall', name: '鏡頭 1／3　牆邊側面', speed: .3, hold: .45, lead: .6, post: .3 },
    { kind: 'behind', name: '鏡頭 2／3　本壘方向（看高度）', speed: .25, hold: .35, lead: .3, post: .2 },
    { kind: 'top', name: '鏡頭 3／3　俯視（定判）', speed: .25, hold: .4, lead: .35, post: .2 }
  ];
  const _showFieldReplay = showFieldReplay;
  showFieldReplay = function (pl, rv, cb) {
    let ok = false;
    try { ok = !window.__ff && startBall(pl, rv, cb); } catch (e) { console.error(e); try { stop(false); } catch (e2) { } ok = false; }
    if (!ok) return _showFieldReplay.call(this, pl, rv, cb);
  };
  const LAB = { hr: 'HOME RUN 全壘打', grd: '場地規則二壘安打', foul: 'FOUL 界外球' }, COL = { hr: '#6dff8c', grd: '#6cf', foul: '#ff6b6b' };
  function startBall(pl, rv, cb) {
    const sim = pl && pl.sim, ov = sim && sim.over, S = sim && sim.S; if (!ov || !S || S.length < 12 || !rv || typeof sampleAt !== 'function' || typeof THREE === 'undefined') return false;
    const sgn = ov.x >= 0 ? 1 : -1, wr45 = wallRadius(sgn * 45), u = { x: .70711 * sgn, z: -.70711 }, P = { x: u.x * wr45, z: u.z * wr45 };
    let nx = u.z, nz = -u.x; const fx = -P.x, fz = -60 - P.z; if (nx * fx + nz * fz < 0) { nx = -nx; nz = -nz; }
    const rl = Math.hypot(ov.x, ov.z) || 1, rh = { x: ov.x / rl, z: ov.z / rl }, C = { x: ov.x, y: ov.y || (WALL_H + 1), z: ov.z };
    const bounce = sim.first && sim.first.t < ov.t ? sim.first : null, evDefs = [];
    if (rv.mode === 'pole') evDefs.push({ t: ov.t, label: '📍 越過全壘打柱位置', tc: `${rv.fm >= 0 ? '界內' : '界外'} ${Math.abs(rv.fm).toFixed(2)} 公尺` });
    else if (bounce) { evDefs.push({ t: bounce.t, label: '⬇ 球先落地（彈地）', tc: '0.000 秒' }); evDefs.push({ t: ov.t, label: '🚧 彈出牆外', tc: `+${(ov.t - bounce.t).toFixed(3)} 秒` }); }
    else evDefs.push({ t: ov.t, label: '🚧 越牆時球仍在空中', tc: sim.first ? `${(sim.first.t - ov.t).toFixed(2)} 秒後才落地` : '全程未落地' });
    const Tfirst = evDefs[0].t, Tsecond = evDefs[evDefs.length - 1].t, tMax = S[S.length - 1].t;
    const saved = { mode: CAMC.mode, pos: CAMC.pos.clone(), look: CAMC.look.clone(), fov: CAMC.fov, tpos: CAMC.tpos.clone(), tlook: CAMC.tlook.clone(), tfov: CAMC.tfov, k: CAMC.k, kl: CAMC.kl, ball: { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z, v: !!ballMesh.visible }, bscale: ballMesh.scale.x };
    const info = { rv, ov, rl }, side = ov.x > 0 ? '右' : '左';
    cur = { kind: 'ball', pl, rv, sim, S, ov, C, P, u, n: { x: nx, z: nz }, rh, tg: { x: -rh.z, z: rh.x }, bounce, evDefs, Tfirst, Tsecond, tMax, t0: Math.max(0, Tfirst - .7), tEnd: Math.min(tMax, Tsecond + .3), saved, info, cb, tok: G.judgeTok, passes: rv.mode === 'pole' ? PASS_POLE : PASS_BOUNCE, pi: 0, tt: 0, hold: .35, stage: 'pass', vt: 0, last: performance.now(), evs: [], mk: {}, objs: [], out: {}, side,
      ui: buildUI('ABS 全壘打／界外回放', rv.mode === 'pole' ? `${side}外野全壘打柱・界線判定` : '全壘打牆・越牆瞬間判定') };
    buildBallScene(); ballMesh.scale.setScalar(1.8); setBall(sampleAt(S, Math.max(0, Tfirst - .7), {}), true);
    document.addEventListener('keydown', keyH, true); document.addEventListener('keyup', keyH, true);
    newPass(); return true;
  }
  function buildBallScene() {
    const c = cur, add = o => { scene.add(o); c.objs.push(o); return o; }, bm = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
    if (c.rv.mode === 'pole') {
      const pn = add(new THREE.Mesh(new THREE.PlaneGeometry(26, WALL_H + 34), bm(0xffe14d, .26))); pn.position.set(c.P.x - c.u.x * 9, (WALL_H + 34) / 2, c.P.z - c.u.z * 9); pn.rotation.y = Math.atan2(-c.u.z, c.u.x); pn.renderOrder = 5;
      const pl = add(new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, WALL_H + 34, 8), bm(0xffe14d, .95))); pl.position.set(c.P.x, (WALL_H + 34) / 2, c.P.z); pl.renderOrder = 6;
    } else {
      const wl = add(new THREE.Mesh(new THREE.BoxGeometry(46, .14, .14), bm(0xffe14d, .95))); wl.position.set(c.C.x - c.rh.x * .15, WALL_H, c.C.z - c.rh.z * .15); wl.rotation.y = Math.atan2(-c.tg.z, c.tg.x); wl.renderOrder = 6;
      const wp = add(new THREE.Mesh(new THREE.PlaneGeometry(46, WALL_H), bm(0xffe14d, .12))); wp.position.set(c.C.x - c.rh.x * .15, WALL_H / 2, c.C.z - c.rh.z * .15); wp.rotation.y = Math.atan2(-c.tg.z, c.tg.x); wp.renderOrder = 5;
    }
    const N = Math.min(c.S.length, Math.ceil((c.tMax + .1) * 60) + 1), pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const q = c.S[Math.min(i, c.S.length - 1)]; pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setDrawRange(0, 0);
    c.path = add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x66e0ff, size: .55, sizeAttenuation: true, transparent: true, opacity: .9, depthTest: false }))); c.path.frustumCulled = false; c.path.renderOrder = 8; c.pathN = N;
    const mat = col => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, depthTest: false });
    c.mCross = add(new THREE.Mesh(new THREE.SphereGeometry(.7, 14, 10), mat(0xff5a36))); c.mCross.position.set(c.C.x, c.C.y, c.C.z); c.mCross.visible = false; c.mCross.renderOrder = 9;
    if (c.bounce) { c.mBounce = add(new THREE.Mesh(new THREE.RingGeometry(.9, 1.3, 28), mat(0xffa43a))); c.mBounce.rotation.x = -Math.PI / 2; c.mBounce.position.set(c.bounce.x, .1, c.bounce.z); c.mBounce.visible = false; c.mBounce.renderOrder = 9; }
  }
  function applyBall(tt) {
    const c = cur, q = sampleAt(c.S, tt, c.out); setBall(q, true);
    c.path.geometry.setDrawRange(0, Math.min(c.pathN, Math.floor(tt * 60) + 1));
    const pu = 1 + .2 * Math.sin(performance.now() * .012);
    c.mCross.visible = tt >= c.ov.t; c.mCross.scale.setScalar(pu); if (c.mBounce) { c.mBounce.visible = tt >= c.bounce.t; c.mBounce.scale.set(pu, pu, 1); }
    c.bNow = { x: q.x, y: q.y, z: q.z };
  }
  function camForBall(kind, snapNow) {
    const c = cur, C = c.C, P = c.P, u = c.u, n = c.n, rh = c.rh, tg = c.tg; let pos, fov, ly = C.y;
    if (kind === 'line') { pos = [P.x - u.x * 16, 3.2, P.z - u.z * 16]; fov = 30; }
    else if (kind === 'side') { pos = [P.x - u.x * 7 + n.x * 14, 4, P.z - u.z * 7 + n.z * 14]; fov = 40; }
    else if (kind === 'wall') { pos = [C.x - rh.x * 4 + tg.x * 17, 2.2, C.z - rh.z * 4 + tg.z * 17]; fov = 38; ly = Math.min(C.y, WALL_H + 3); }
    else if (kind === 'behind') { pos = [C.x - rh.x * 26, 5, C.z - rh.z * 26]; fov = 28; }
    else { pos = [C.x, 72, C.z + 2]; fov = 30; ly = 0; }
    const b = c.bNow || C, w = kind === 'top' ? 0 : .3, prog = clampN((c.tt - c.t0) / Math.max(.1, c.tEnd - c.t0), 0, 1);
    CAMC.mode = 'rcam'; CAMC.tpos.set(pos[0], pos[1], pos[2]); CAMC.tlook.set(C.x + (b.x - C.x) * w, ly + (b.y - C.y) * w, C.z + (b.z - C.z) * w); CAMC.tfov = fov * (1 - .1 * prog) * (VP.fk || 1); CAMC.k = 10; CAMC.kl = 0;
    if (snapNow) { camSnap(); CAMC.pos.copy(CAMC.tpos); CAMC.look.copy(CAMC.tlook); CAMC.fov = CAMC.tfov; }
  }
  function verdictBall() {
    const c = cur, rv = c.rv, ov = c.ov, v = c.ui.querySelector('.rc-ver'), t = rv.truth, side = c.side;
    const det = rv.mode === 'pole' ? `球越過全壘打牆處在<b style="display:inline;font-size:1em;color:#ffe08a">${rv.fm >= 0 ? '界內' : '界外'} ${Math.abs(rv.fm).toFixed(2)} 公尺</b>（${side}外野全壘打柱）`
      : (rv.dAir >= 0 ? `球越牆時<b style="display:inline;font-size:1em;color:#ffe08a">仍在空中</b>（落地前 ${rv.dAir.toFixed(2)} 秒越牆）` : `球<b style="display:inline;font-size:1em;color:#ffe08a">先落地</b>（越牆前 ${(-rv.dAir).toFixed(2)} 秒彈地）再彈出牆外`);
    v.innerHTML = `<b style="color:${COL[t]};font-size:clamp(22px,6vw,52px)">${LAB[t]}</b><div>${det}</div><div>主審原判：${LAB[rv.call]}${rv.call !== t ? ' → <b style="display:inline;font-size:1em;color:#ffd24d">誤判</b>' : '（正確）'}</div>`;
    v.style.borderColor = COL[t]; void v.offsetWidth; v.classList.add('on');
    c.ui.querySelector('.rc-cam').textContent = '判定結果'; c.ui.querySelector('.rc-skip').style.visibility = 'hidden';
  }

  (function loop() { requestAnimationFrame(loop); try { if (cur) tick(); else if (live() && !G.freeze && !window.__ff && !document.hidden && E.runners.some(r => r && (r.state === 'run' || r.state === 'on'))) sample(false); } catch (e) { console.error(e); } })();
  return { active: () => !!cur, _test: { REV, ring, sample, snap, start, stop, get cur() { return cur; } } };
})();
