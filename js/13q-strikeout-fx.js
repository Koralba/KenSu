'use strict';
/* 13q-strikeout-fx.js ｜ 三振強化：K 數統計、三振慢動作回放、空揮特效、被三振的懊惱動作（摔棒／折棒…）
   ① K 數：包住 11 的 finishAB／本檔包住 pitchResult，投手物件記 p.kx（09 的投手資訊面板顯示「K n」；與 p.kA 取較大值）
   ② 回放：每幀錄 投手／捕手／打者／主審 的 3D 姿勢＋球棒＋球位置（環狀緩衝約 4 秒）；三振當下包住 11 的 pitchResult，
      約 1 秒後凍結比賽（G.freeze，與 13l 相同做法），用 3 個機位快速重播整球（捕手後方／投手後方／打者側特寫，只在球進手套前後放慢，全程約 6～7 秒），
      球進手套瞬間放慢並標示「揮空三振／看三振」，可「跳過」或 Space／Enter／Esc／點畫面；右下角可關閉回放（localStorage cpbl2027.krep=0）。
      「漂亮」的定義（KFX.nice）：揮空三振一律播；看三振只在 球速≥148、有人在得點圈、或結束半局時播。
   ③ 空揮：11 的揮空判定處呼叫 KFX.whiff()：揮棒風聲、鏡頭震動、白色揮空弧線與「呼～」字樣、短暫頓格；03 的揮空姿勢也加大（過度揮棒、重心被帶走）。
   ④ 懊惱：11 的 pitchReact（K）呼叫 KFX.react(打者)：隨機 摔棒／折棒／丟棒／跺腳／搖頭／敲地／嘆氣／仰天怒吼／踢土／瞪人 動作（03 的 bk_* 動畫），
      棒子變成真的 3D 物件（飛出去彈跳、折成兩截＋木屑），本檔內建簡易物理。
   ⑤ 區網對戰（vsOn()）、快轉（window.__ff）、練習模式一律停用以上特效（避免鎖步不同步／拖慢快轉）。
   依賴：03 的 CAMC／camSnap／setBall／ballMesh／spawnBurst，04 的 G／E／after／vsOn／PITCHES，11 的 PT／pitchResult／finishAB／curBatter／curPitcher。 */
const KFX = (function () {
  const NODES = ['body', 'head', 'armL', 'armR', 'legL', 'legR', 'glove'], STR = 4 + NODES.length * 7 + 6, NF = 360, KEEP = 4.2, MAXR = 6;
  const ring = []; let head = 0, cnt = 0, ct = 0, lastReal = performance.now(), cur = null, pieces = [];
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const live = () => { try { return typeof G !== 'undefined' && G && G.mode === 'play' && !G.over; } catch (e) { return false; } };
  const vsx = () => { try { return !!vsOn(); } catch (e) { return false; } };
  const prefOn = () => { try { return localStorage.getItem('cpbl2027.krep') !== '0'; } catch (e) { return true; } };
  const setPref = v => { try { localStorage.setItem('cpbl2027.krep', v ? '1' : '0'); } catch (e) { } };
  const fxOK = () => live() && !window.__ff && !vsx();

  /* ---------- 錄影 ---------- */
  function rigsNow() {
    const out = [], seen = new Set(), add = o => { const r = o && o.rig; if (r && r.root && !seen.has(r) && out.length < MAXR) { seen.add(r); out.push(r); } };
    try { add(E.F.P); add(E.F.C); add(E.bat); add(E.ump); } catch (e) { }
    return out;
  }
  function pack(rig, a, o) {
    const p = rig.root.position; a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = rig.root.rotation.y; let k = o + 4;
    for (const n of NODES) { const g = rig[n]; if (g) { a[k] = g.position.x; a[k + 1] = g.position.y; a[k + 2] = g.position.z; a[k + 3] = g.rotation.x; a[k + 4] = g.rotation.y; a[k + 5] = g.rotation.z; a[k + 6] = g.scale.y; } k += 7; }
    const bt = rig.bat; if (bt) { a[k] = bt.position.x; a[k + 1] = bt.position.y; a[k + 2] = bt.position.z; a[k + 3] = bt.rotation.y; a[k + 4] = rig.batTilt ? rig.batTilt.rotation.z : 0; a[k + 5] = bt.visible ? 1 : 0; } else a[k + 5] = 0;
  }
  function applyRig(rig, da, oa, db, ob, u) {
    const L = j => { const x = da[oa + j]; if (!db) return x; const y = db[ob + j]; if (j === 3) { let d = y - x; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return x + d * u; } return x + (y - x) * u; };
    rig.root.position.set(L(0), L(1), L(2)); rig.root.rotation.y = L(3); let k = 4;
    for (const n of NODES) { const g = rig[n]; if (g) { g.position.set(L(k), L(k + 1), L(k + 2)); g.rotation.x = L(k + 3); g.rotation.y = L(k + 4); g.rotation.z = L(k + 5); g.scale.y = L(k + 6); } k += 7; }
    const bt = rig.bat; if (bt) { bt.position.set(L(k), L(k + 1), L(k + 2)); bt.rotation.y = L(k + 3); if (rig.batTilt) rig.batTilt.rotation.z = L(k + 4); bt.visible = da[oa + k + 5] > .5; }
  }
  function sample() {
    const now = performance.now(), dt = Math.min(.05, (now - lastReal) / 1000); lastReal = now;
    if (!live() || G.freeze || window.__ff || document.hidden || cur || vsx()) return;
    ct += dt; const rigs = rigsNow(); if (!rigs.length) return;
    const fr = ring[head] || (ring[head] = { t: 0, b: [0, 0, 0], bv: false, rigs: [], data: new Float32Array(MAXR * STR) }), bp = ballMesh.position;
    fr.t = ct; fr.bv = !!ballMesh.visible; fr.b[0] = bp.x; fr.b[1] = bp.y; fr.b[2] = bp.z; fr.rigs = rigs;
    for (let i = 0; i < rigs.length; i++) pack(rigs[i], fr.data, i * STR);
    head = (head + 1) % NF; cnt = Math.min(NF, cnt + 1);
  }
  function snap() {
    const out = []; if (!cnt) return out; const now = ring[(head - 1 + NF) % NF].t;
    for (let i = cnt - 1; i >= 0; i--) { const fr = ring[(head - 1 - (cnt - 1 - i) + NF * 2) % NF]; if (now - fr.t > KEEP) break; out.push({ t: fr.t, b: fr.b.slice(), bv: fr.bv, rigs: fr.rigs.slice(), data: fr.data.slice(0, fr.rigs.length * STR) }); }
    return out.reverse();
  }
  function locate(F, tt) {
    const n = F.length; if (tt <= F[0].t) return [0, 0, 0]; if (tt >= F[n - 1].t) return [n - 1, n - 1, 0];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].t <= tt) lo = mid; else hi = mid; }
    return [lo, hi, (tt - F[lo].t) / Math.max(1e-6, F[hi].t - F[lo].t)];
  }
  function applyAt(F, tt) {
    const [i, j, u] = locate(F, tt), A = F[i], B = F[j];
    A.rigs.forEach((rig, ia) => { const ib = i === j ? -1 : B.rigs.indexOf(rig); applyRig(rig, A.data, ia * STR, ib >= 0 ? B.data : null, ib * STR, u); });
    const bb = i === j ? A.b : [A.b[0] + (B.b[0] - A.b[0]) * u, A.b[1] + (B.b[1] - A.b[1]) * u, A.b[2] + (B.b[2] - A.b[2]) * u];
    setBall({ x: bb[0], y: bb[1], z: bb[2] }, A.bv && (i === j || B.bv)); return bb;
  }

  /* ---------- K 數統計 ---------- */
  const kOf = p => Math.max((p && p.kx) || 0, (p && p.kA) || 0);
  const addK = b => { try { const p = curPitcher(); if (!p || !b) return; p.kx = (p.kx || 0) + 1; b._kc = true; if (typeof updatePlayerBoxes === 'function') updatePlayerBoxes(); } catch (e) { } };      // 三振當下立刻刷新投手面板的 K 數
  const _finishAB = finishAB;
  finishAB = function (kind) {
    try { if (kind === 'K') { const b = curBatter(); if (b && !b._kc) addK(b); if (b) b._kc = false; } } catch (e) { }
    return _finishAB.apply(this, arguments);
  };

  /* ---------- 三振發生：計數＋排回放 ---------- */
  const _pitchResult = pitchResult;
  pitchResult = function (kind) {
    let b = null, k0 = 0; try { b = curBatter(); k0 = b.st.k; } catch (e) { }
    const r = _pitchResult.apply(this, arguments);
    try {
      if (b && b.st.k > k0) {
        addK(b);
        if (fxOK() && prefOn() && !G.freeze && nice(kind)) { const info = { sw: kind === 'swing', n: kOf(curPitcher()), pt: PT, end: G.outs >= 3, b, p: curPitcher() }; after(G.outs >= 3 ? .9 : 1.15, () => { try { start(info); } catch (e) { console.error(e); try { stop(false); } catch (e2) { } } }); }
      }
    } catch (e) { console.error(e); }
    return r;
  };
  function nice(kind) {
    if (kind === 'swing') return true;
    let risp = false; try { risp = !!(G.on && (G.on[2] || G.on[3])); } catch (e) { }
    return !!((PT && PT.kmh >= 148) || risp || G.outs >= 3);
  }

  /* ---------- 回放 ---------- */
  const CSS = `#krCam{position:fixed;inset:0;z-index:9500;color:#fff;font-family:'Noto Sans TC',sans-serif;touch-action:manipulation}
#krCam .kc-bar{position:absolute;left:0;right:0;background:#000;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 3vw;box-sizing:border-box}
#krCam .kc-top{top:0;height:11%;background:linear-gradient(#000 70%,rgba(0,0,0,0))}#krCam .kc-bot{bottom:0;height:14%;background:linear-gradient(rgba(0,0,0,0),#000 35%)}
#krCam .kc-t{font-weight:900;font-size:clamp(14px,2.6vw,24px);letter-spacing:.06em;text-shadow:0 0 8px #c33}#krCam .kc-t i{display:inline-block;width:.7em;height:.7em;border-radius:50%;background:#f33;margin-right:.4em;animation:kcB 1s infinite}
@keyframes kcB{50%{opacity:.25}}
#krCam .kc-cam{font-size:clamp(12px,2vw,18px);color:#ffe08a;font-weight:700}#krCam .kc-info{font-size:clamp(11px,1.8vw,16px);opacity:.92}
#krCam button{cursor:pointer;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:.35em 1em;font-size:clamp(12px,1.8vw,16px);font-weight:700;margin-left:6px}
#krCam .kc-fl{position:absolute;left:50%;top:66%;transform:translate(-50%,0);text-align:center;opacity:0;white-space:nowrap;pointer-events:none}
#krCam .kc-fl.on{animation:kcF 1.4s ease-out forwards}#krCam .kc-fl b{display:block;font-size:clamp(22px,5vw,46px);font-weight:900;text-shadow:0 2px 10px #000,0 0 18px #f33}#krCam .kc-fl small{font-size:clamp(12px,2.2vw,20px);color:#ffe08a;text-shadow:0 1px 6px #000}
@keyframes kcF{0%{opacity:0;transform:translate(-50%,10px) scale(.8)}12%{opacity:1;transform:translate(-50%,0) scale(1.1)}25%{transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0}}
#krCam .kc-k{position:absolute;right:5vw;top:15%;font:900 clamp(40px,12vw,110px) Orbitron,sans-serif;color:#fff;text-shadow:0 0 18px #f33,3px 3px 0 #b00;opacity:0;pointer-events:none}#krCam .kc-k.on{animation:kcK .9s ease-out forwards}
@keyframes kcK{0%{opacity:0;transform:scale(2.4) rotate(-8deg)}35%{opacity:1;transform:scale(1) rotate(-4deg)}100%{opacity:1;transform:scale(1) rotate(-4deg)}}
body.krcam #hud,body.krcam #pinfo,body.krcam #sb,body.krcam #topbar,body.krcam #caption,body.krcam #leftCol,body.krcam #pitchPanel,body.krcam #acts,body.krcam #absPanel,body.krcam #touchBtns{visibility:hidden!important}
#kWhiff{position:fixed;left:0;right:0;top:34%;z-index:60;text-align:center;pointer-events:none;font:900 clamp(34px,9vw,96px) 'Mochiy Pop One','Noto Sans TC',sans-serif;font-style:italic;color:#fff;letter-spacing:.12em;text-shadow:0 0 14px #5ab0ff,4px 4px 0 #134a9c;opacity:0}
#kWhiff.on{animation:kwF .75s ease-out forwards}#kWhiff:before{content:'';position:absolute;left:-10%;right:-10%;top:50%;height:.16em;background:linear-gradient(90deg,transparent,#fff,transparent);transform:translateY(-50%) skewX(-30deg);opacity:.85}
@keyframes kwF{0%{opacity:0;transform:translateX(-12%) scale(.8)}18%{opacity:1;transform:translateX(0) scale(1.15)}60%{opacity:1;transform:translateX(3%) scale(1)}100%{opacity:0;transform:translateX(10%) scale(1)}}`;
  function css() { if (document.getElementById('krCss')) return; const s = document.createElement('style'); s.id = 'krCss'; s.textContent = CSS; document.head.appendChild(s); }
  const keyH = e => { if (!cur) return; if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (e.type === 'keydown') skip(); } };
  const PASSES = [      // 由遠到近：捕手後方（看好球帶）→ 投手後方（看整體球路）→ 打者側特寫（看揮棒與進手套）；總長約 6～7 秒（原本約 15 秒）
    { kind: 'behind', name: '鏡頭 1／3　捕手後方', sp: 1.15, sl: .45, nw: .13, pre: .35, post: .3, h0: .1, hf: .25 },
    { kind: 'mound', name: '鏡頭 2／3　投手後方', sp: 1.05, sl: .4, nw: .13, pre: .3, post: .3, h0: .1, hf: .25 },
    { kind: 'side', name: '鏡頭 3／3　打者側特寫', sp: .95, sl: .3, nw: .15, pre: .15, post: .55, h0: .1, hf: .5 }
  ];
  function start(info) {
    if (cur || !fxOK() || G.freeze) return;
    const F = snap(); if (F.length < 20) return;
    const Tn = F[F.length - 1].t; let ie = -1;      // 找「這一球」最後一段看得到球的區間
    for (let i = F.length - 1; i >= 0; i--) { if (F[i].bv) { ie = i; break; } }
    if (ie < 0) return; let is = ie; while (is > 0 && F[is - 1].bv) is--;
    let ic = is; for (let i = is; i <= ie; i++) if (F[i].b[2] > F[ic].b[2]) ic = i;
    const Tc = F[ic].t, Ts = F[is].t, P0 = PASSES[0], t0 = Math.max(F[0].t, Ts - P0.pre), tEnd = Math.min(Tn, Tc + P0.post); if (tEnd - t0 < .5) return;
    const cs = typeof CAMC !== 'undefined' ? CAMC : null; if (!cs) return;
    const cp = []; rigsNow().forEach(r => { const a = new Float32Array(STR); pack(r, a, 0); cp.push([r, a]); });      // 現況姿勢：回放結束後還原
    const saved = { mode: cs.mode, pos: cs.pos.clone(), look: cs.look.clone(), fov: cs.fov, tpos: cs.tpos.clone(), tlook: cs.tlook.clone(), tfov: cs.tfov, k: cs.k, kl: cs.kl, ball: { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z, v: !!ballMesh.visible } };
    css(); G.freeze = true; pieces.forEach(o => { o.m.visible = false; });
    const pt = info.pt || {}, nm = (typeof PITCHES !== 'undefined' && PITCHES[pt.id]) ? PITCHES[pt.id].jp : '', sd = (E.bat && E.bat.side > 0) ? -1 : 1;
    const ui = document.createElement('div'); ui.id = 'krCam';
    ui.innerHTML = `<div class="kc-bar kc-top"><span class="kc-t"><i></i>三振回放 REPLAY</span><span class="kc-cam"></span></div><div class="kc-fl"></div><div class="kc-k">K</div><div class="kc-bar kc-bot"><span class="kc-info"></span><span><button class="kc-tg"></button><button class="kc-skip">跳過 ⏭</button></span></div>`;
    document.body.appendChild(ui); document.body.classList.add('krcam');
    ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(ev => ui.addEventListener(ev, e => { e.stopPropagation(); }));
    ui.addEventListener('click', () => skip());
    ui.querySelector('.kc-skip').onclick = e => { e.stopPropagation(); skip(); };
    const tg = ui.querySelector('.kc-tg'), tgT = () => { tg.textContent = prefOn() ? '回放：開' : '回放：關'; }; tgT(); tg.onclick = e => { e.stopPropagation(); setPref(!prefOn()); tgT(); };
    ui.querySelector('.kc-info').textContent = `${info.p ? info.p.name : ''} 對 ${info.b ? info.b.name : ''}　${pt.kmh ? Math.round(pt.kmh) + ' 公里 ' : ''}${nm}　${info.sw ? '揮空三振' : '看三振'}`;
    cur = { F, t0, tEnd, Tc, Ts, Tn, tt: t0, pi: 0, hold: .1, stage: 'pass', vt: 0, saved, cp, ui, info, sd, last: performance.now(), tok: G.fmTok, fired: false };
    document.addEventListener('keydown', keyH, true); document.addEventListener('keyup', keyH, true);
    newPass(); requestAnimationFrame(loop);
  }
  function newPass() { const P = PASSES[cur.pi]; cur.t0 = Math.max(cur.F[0].t, cur.Ts - P.pre); cur.tEnd = Math.min(cur.Tn, cur.Tc + P.post); cur.tt = cur.t0; cur.hold = P.h0; cur.fired = false; try { cur.ui.querySelector('.kc-fl').classList.remove('on'); } catch (e) { } cur.ui.querySelector('.kc-cam').textContent = `${P.name}　慢動作`; cam(P.kind, true, cur.tt, applyAt(cur.F, cur.tt)); }
  function cam(kind, snapNow, tt, bb) {
    const cs = CAMC, prog = clampN((tt - cur.t0) / Math.max(.1, cur.tEnd - cur.t0), 0, 1), vis = bb && bb[2] > -30, mix = (a, b, k) => a + (b - a) * k; let pos, look, fov;
    if (kind === 'behind') { pos = [.5, 1.5, 5.4]; look = [mix(0, bb[0], .5), mix(1.05, bb[1], .55), mix(-1.5, bb[2], .6)]; fov = 26 - 8 * prog; }      // 捕手後方：好球帶始終在畫面中，球越近越放大
    else if (kind === 'mound') { pos = [.6, 2.4, -22]; look = [mix(0, bb[0], .75), mix(1.1, bb[1], .8), mix(-4, bb[2], .85)]; fov = 15 - 6 * prog; }      // 投手後方高位：球一直往遠離鏡頭的方向飛，不會有鏡頭被球甩過去的急轉
    else { pos = [cur.sd * 4.4, 1.15, .4]; look = [mix(0, bb[0], .7), mix(1, bb[1], .75), mix(-1, bb[2], .8)]; fov = 38 - 10 * prog; }      // 打者側特寫：與本壘板同高、貼近側面，看揮棒與球進手套
    cs.mode = 'rcam'; cs.tpos.set(pos[0], pos[1], pos[2]); cs.tlook.set(look[0], look[1], look[2]); cs.tfov = fov * (typeof VP !== 'undefined' && VP.fk || 1); cs.k = 10; cs.kl = 0;
    if (snapNow) { cs.pos.copy(cs.tpos); cs.look.copy(cs.tlook); cs.fov = cs.tfov; }
  }
  function loop() {
    if (!cur) return; requestAnimationFrame(loop);
    try { tick(); } catch (e) { console.error(e); stop(false); }
  }
  function tick() {
    const now = performance.now(), dt = Math.min(.05, (now - cur.last) / 1000); cur.last = now;
    if (G.over || G.mode !== 'play') return stop(false);
    G._camBad = 0; const P = PASSES[cur.pi]; let bb;
    if (cur.stage === 'pass') {
      if (cur.hold > 0) cur.hold -= dt;
      else {
        const near = Math.abs(cur.tt - cur.Tc) < P.nw; cur.tt += dt * P.sp * (near ? P.sl : 1);
        if (!cur.fired && cur.tt >= cur.Tc) { cur.tt = cur.Tc; cur.fired = true; cur.hold = P.hf; if (cur.pi === PASSES.length - 1) flash(cur.info.sw ? '💨 揮空三振！' : '👀 看三振！', cur.info.pt && cur.info.pt.kmh ? `${Math.round(cur.info.pt.kmh)} 公里` : ''); }
        if (cur.tt >= cur.tEnd) { cur.tt = cur.tEnd; if (cur.pi + 1 < PASSES.length) { cur.pi++; newPass(); return; } cur.stage = 'verdict'; cur.vt = 0; verdict(); }
      }
      bb = applyAt(cur.F, cur.tt); cam(P.kind, false, cur.tt, bb);
    } else { cur.vt += dt; bb = applyAt(cur.F, cur.tEnd); cam(PASSES[PASSES.length - 1].kind, false, cur.tEnd, bb); if (cur.vt > 1.1) stop(true); }
  }
  function flash(t, s) { const f = cur.ui.querySelector('.kc-fl'); f.innerHTML = `<b>${t}</b><small>${s}</small>`; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  function verdict() { const k = cur.ui.querySelector('.kc-k'); k.textContent = 'K ' + (cur.info.n || ''); k.classList.add('on'); cur.ui.querySelector('.kc-cam').textContent = `${cur.info.p ? cur.info.p.name : ''} 本場第 ${cur.info.n || 1} 次三振`; }
  function skip() { if (!cur) return; if (cur.stage === 'pass') { cur.pi = PASSES.length - 1; cur.stage = 'verdict'; cur.vt = 0; cur.tEnd = Math.min(cur.Tn, cur.Tc + PASSES[cur.pi].post); cur.tt = cur.tEnd; verdict(); } else cur.vt = 99; }
  function stop(done) {
    const c = cur; if (!c) return; cur = null;
    try { document.removeEventListener('keydown', keyH, true); document.removeEventListener('keyup', keyH, true); } catch (e) { }
    try { c.cp.forEach(([r, a]) => applyRig(r, a, 0, null, 0, 0)); const s = c.saved.ball; setBall({ x: s.x, y: s.y, z: s.z }, s.v); } catch (e) { }
    try { const s = c.saved, cs = CAMC; cs.mode = s.mode; cs.pos.copy(s.pos); cs.look.copy(s.look); cs.fov = s.fov; cs.tpos.copy(s.tpos); cs.tlook.copy(s.tlook); cs.tfov = s.tfov; cs.k = s.k; cs.kl = s.kl; } catch (e) { }
    try { c.ui.remove(); document.body.classList.remove('krcam'); } catch (e) { }
    pieces.forEach(o => { o.m.visible = true; }); G.freeze = false; lastReal = performance.now();
  }

  /* ---------- 空揮特效 ---------- */
  function whiff() {      // 空揮：不再顯示「呼～！」字樣與白色殘影；改用「大力揮空」的實感——沉重的破空聲、鏡頭被甩一下、頓一格、腳下揚起的塵土
    if (!fxOK()) return;
    try { for (const o of SWISH) { scene.remove(o.sp); o.sp.material.dispose(); } SWISH.length = 0; } catch (e) { }
    try { noiseBurst(.22, 520, .8, .3, 'lowpass'); setTimeout(() => { try { noiseBurst(.14, 1100, 1.2, .16, 'bandpass'); } catch (e) { } }, 60); } catch (e) { }
    try { CAMC.shake = Math.max(CAMC.shake || 0, .26); CAMC.fov -= 2.2; } catch (e) { }
    try { if (typeof hitStop === 'function') hitStop(.09); } catch (e) { }
    try { const p = E.bat && E.bat.rig && E.bat.rig.root.position; if (p) { powderPuff(p.x, .05, p.z, 6, .22, 0, .35, 0, .2, { op: .3, life: .9, grow: 2.4, col: 0xc9a06a }); powderGrains(p.x, .05, p.z, 10, 0, .5, 0, .5, { life: .8, op: .6 }); } } catch (e) { }
    try { if (typeof crowdGroan === 'function' && Math.random() < .3) crowdGroan(.4); } catch (e) { }
  }

  /* ---------- 懊惱：動作＋棒子 3D 物件 ---------- */
  const KINDS = [['bk_slam', 1.9, .2], ['bk_snap', 2.1, .14], ['bk_drop', 1.8, .12], ['bk_stomp', 1.8, .2], ['bk_shake', 1.9, .2], ['bk_pound', 1.8, .14], ['bk_sigh', 2.2, .16], ['bk_scream', 1.8, .12], ['bk_kick', 1.8, .12], ['bk_glare', 1.9, .12]];
  function react(b) {
    if (!fxOK() || !b || !b.rig || !b.rig.bat || b.rig.anim && b.rig.anim.opt && b.rig.anim.opt.practice) return false;
    let r = Math.random() * KINDS.reduce((s, k) => s + k[2], 0), k = KINDS[0]; for (const q of KINDS) { if ((r -= q[2]) <= 0) { k = q; break; } }
    b.rig.anim = { name: k[0], t: 0, dur: k[1], opt: {} }; return true;
  }
  const mkBat = (len, rad) => new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * .4, len, 10), new THREE.MeshPhongMaterial({ color: 0xc89a5a }));
  function worldOf(r) { const w = new THREE.Vector3(); try { r.root.updateMatrixWorld(true); r.bat.getWorldPosition(w); } catch (e) { } if (!isFinite(w.x + w.y + w.z)) w.set(0, 1.2, .3); return w; }
  function add(m, w, v, o) {
    m.position.copy(w); scene.add(m); pieces.push(Object.assign({ m, vx: v[0], vy: v[1], vz: v[2], sx: (Math.random() - .5) * 14, sz: (Math.random() - .5) * 14, age: 0, rest: 0 }, o || {}));
    while (pieces.length > 8) { const o = pieces.shift(); scene.remove(o.m); }
  }
  function toss(r, how) {      // 摔棒（朝前下方用力丟）／丟棒（輕輕放掉）
    if (!r || !r.bat || !fxOK()) return; const w = worldOf(r); r.bat.visible = false; const m = mkBat(.86, .042), s = Math.random() < .5 ? -1 : 1;
    if (how === 'slam') { add(m, w, [s * (1 + Math.random() * 2.5), -1.5, 3 + Math.random() * 3], { bounce: .45 }); try { noiseBurst(.1, 240, 2, .3, 'lowpass'); CAMC.shake = Math.max(CAMC.shake || 0, .08); } catch (e) { } }
    else add(m, w, [s * .6, .5, .8 + Math.random()], { bounce: .3 });
  }
  function snapBat(r) {      // 折棒：在膝蓋上折成兩截＋木屑
    if (!r || !r.bat || !fxOK()) return; const w = worldOf(r); r.bat.visible = false; const s = Math.random() < .5 ? -1 : 1;
    const a = mkBat(.5, .045), c = mkBat(.38, .03); a.rotation.z = c.rotation.z = .6;
    add(a, w, [s * (1.5 + Math.random() * 2), 2.5, 1 + Math.random() * 2], { bounce: .35 }); add(c, w, [-s * (1.5 + Math.random() * 2), 3, 2 + Math.random() * 2], { bounce: .3 });
    try { spawnBurst(w.x, w.y, w.z, .6, '#e8c080'); noiseBurst(.14, 1100, 2.4, .42, 'bandpass'); CAMC.shake = Math.max(CAMC.shake || 0, .16); if (typeof flashScreen === 'function') flashScreen(.12); } catch (e) { }
    try { say('<em>啪！球棒被折斷了！</em>' + ((curBatter() && curBatter().name) || '打者') + '氣到把棒子折成兩截'); } catch (e) { }
  }
  function physics(dt) {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const o = pieces[i], m = o.m; o.age += dt; if (o.age > 7) { scene.remove(m); pieces.splice(i, 1); continue; }
      if (o.rest) continue; o.vy -= 9.8 * dt; m.position.x += o.vx * dt; m.position.y += o.vy * dt; m.position.z += o.vz * dt; m.rotation.x += o.sx * dt; m.rotation.z += o.sz * dt;
      if (m.position.y < .06) { m.position.y = .06; if (Math.abs(o.vy) > 1.2) { o.vy = -o.vy * o.bounce; o.vx *= .7; o.vz *= .7; o.sx *= .6; o.sz *= .6; } else { o.vy = 0; o.vx *= .9; o.vz *= .9; o.sx *= .8; o.sz *= .8; if (Math.hypot(o.vx, o.vz) < .15) { o.rest = 1; m.rotation.x = Math.PI / 2; } } }
    }
  }
  let lastP = performance.now();
  (function pl() { requestAnimationFrame(pl); const n = performance.now(), dt = Math.min(.05, (n - lastP) / 1000); lastP = n; try { if (!G.freeze && !window.__ff && pieces.length) physics(dt); } catch (e) { } })();
  (function rec() { requestAnimationFrame(rec); try { if (cur) return; sample(); } catch (e) { } })();
  return { whiff, react, toss, snapBat, kOf, start, stop, nice, get active() { return !!cur; }, get pieces() { return pieces.length; } };
})();
