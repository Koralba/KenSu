'use strict';
/* 13v-great-replay.js ｜ 精彩美技回放（做法與 13q 三振回放相同：錄影環狀緩衝 → 凍結比賽 → 多機位慢動作重播 → 還原）
   ① 觸發：包住 06 的 onFielded(f)——這一球的 plan.great 為真（電腦或玩家的飛身撲接／極限伸展／攀牆搶下全壘打）而且球真的接住（PL.state==='held'）時記下「美技」。
   ② 播放時機：包住 11 的 flowOnPlayEnd(pl)——這個打席／球的處理完全結束、準備進下一球之前才暫停比賽播回放，播完再繼續原本流程（不會在跑者還在跑時凍結）。
   ③ 錄影：每幀錄 9 位野手＋壘上／跑壘中的跑者的 3D 姿勢＋球位置（環狀緩衝約 6.5 秒），回放時逐幀還原（與 13q 同一套 pack／applyRig）。
   ④ 機位（依野手位置自動算）：1 轉播遠景（本壘後方高處，看球飛向野手）→ 2 側面（垂直於本壘→野手方向，看撲接）→ 3 迎面特寫（野手前方，看球進手套），接球瞬間放慢；可「跳過」或 Space／Enter／Esc／點畫面。
   ⑤ 偏好：回放視窗右下可開關（localStorage cpbl2027.grep=0 關閉）。區網對戰（vsOn）、快轉（window.__ff）停用，避免鎖步不同步／拖慢快轉；13q 三振回放播放中不重疊。
   依賴：03 的 CAMC／setBall／ballMesh，04 的 G／E／after，06 的 onFielded／flowOnPlayEnd（11）。載入位置：13u 之後、14 之前。 */
const GREP = (function () {
  const NODES = ['body', 'head', 'armL', 'armR', 'legL', 'legR', 'glove'], STR = 4 + NODES.length * 7 + 6, NF = 480, KEEP = 6.5, MAXR = 14;
  const ring = []; let head = 0, cnt = 0, ct = 0, lastReal = performance.now(), cur = null, job = null;
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v)), mix = (a, b, k) => a + (b - a) * k;
  const live = () => { try { return typeof G !== 'undefined' && G && G.mode === 'play' && !G.over; } catch (e) { return false; } };
  const vsx = () => { try { return !!vsOn(); } catch (e) { return false; } };
  const prefOn = () => { try { return localStorage.getItem('cpbl2027.grep') !== '0'; } catch (e) { return true; } };
  const setPref = v => { try { localStorage.setItem('cpbl2027.grep', v ? '1' : '0'); } catch (e) { } };
  const kfxBusy = () => { try { return typeof KFX !== 'undefined' && KFX.active; } catch (e) { return false; } };
  const fxOK = () => live() && !window.__ff && !vsx() && !kfxBusy();

  /* ---------- 錄影（與 13q 相同的姿勢封裝） ---------- */
  function rigsNow() {
    const out = [], seen = new Set(), add = o => { const r = o && o.rig; if (r && r.root && !seen.has(r) && out.length < MAXR) { seen.add(r); out.push(r); } };
    try { for (const f of Object.values(E.F)) add(f); for (const r of E.runners || []) add(r); } catch (e) { }
    return out;
  }
  function pack(rig, a, o) {
    const p = rig.root.position; a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = rig.root.rotation.y; let k = o + 4;
    for (const n of NODES) { const g = rig[n]; if (g) { a[k] = g.position.x; a[k + 1] = g.position.y; a[k + 2] = g.position.z; a[k + 3] = g.rotation.x; a[k + 4] = g.rotation.y; a[k + 5] = g.rotation.z; a[k + 6] = g.scale.y; } k += 7; }
    const bt = rig.bat; if (bt) { a[k] = bt.position.x; a[k + 1] = bt.position.y; a[k + 2] = bt.position.z; a[k + 3] = bt.rotation.y; a[k + 4] = rig.batTilt ? rig.batTilt.rotation.z : 0; a[k + 5] = bt.visible ? 1 : 0; } else a[k + 5] = 0;
    a[o + STR - 1] = rig.root.visible ? 1 : 0;      // 最後一格記可見與否（跑者得分後會隱藏）
  }
  function applyRig(rig, da, oa, db, ob, u) {
    const L = j => { const x = da[oa + j]; if (!db) return x; const y = db[ob + j]; if (j === 3) { let d = y - x; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return x + d * u; } return x + (y - x) * u; };
    rig.root.position.set(L(0), L(1), L(2)); rig.root.rotation.y = L(3); let k = 4;
    for (const n of NODES) { const g = rig[n]; if (g) { g.position.set(L(k), L(k + 1), L(k + 2)); g.rotation.x = L(k + 3); g.rotation.y = L(k + 4); g.rotation.z = L(k + 5); g.scale.y = L(k + 6); } k += 7; }
    const bt = rig.bat; if (bt) { bt.position.set(L(k), L(k + 1), L(k + 2)); bt.rotation.y = L(k + 3); if (rig.batTilt) rig.batTilt.rotation.z = L(k + 4); bt.visible = da[oa + k + 5] > .5; }
    rig.root.visible = da[oa + STR - 1] > .5;
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

  /* ---------- 記下美技（接球當下） ---------- */
  const _onFielded = onFielded;
  onFielded = function (f) {
    let great = false, plan = null; try { plan = PL && PL.plan; great = !!(plan && plan.great && plan.f === f); } catch (e) { }
    const r = _onFielded.apply(this, arguments);
    try {
      if (great && PL && PL.state === 'held' && PL.holder === f && fxOK()) job = { pl: PL, f, Tc: ct, x: f.x, z: f.z, dive: !!plan.dive, rob: !!plan.robHR, air: !!plan.air, age: PL.tAge || 0, resume: null };
    } catch (e) { console.error(e); }
    return r;
  };

  /* ---------- 這一球處理完、進下一球之前：暫停比賽播回放，播完再繼續 ---------- */
  const _flowEnd = (typeof flowOnPlayEnd === 'function') ? flowOnPlayEnd : null;
  if (_flowEnd) {
    flowOnPlayEnd = function (pl) {
      const self = this, args = arguments, j = job; job = null;
      try {
        if (j && j.pl === pl && fxOK() && prefOn() && !G.freeze && !G.over) {
          j.resume = () => _flowEnd.apply(self, args);
          if (start(j)) return;
        }
      } catch (e) { console.error(e); if (!cur) G.freeze = false; if (j && !j._ran) { j._ran = true; return _flowEnd.apply(self, args); } }
      return _flowEnd.apply(self, args);
    };
  } else console.warn('GREP：找不到 flowOnPlayEnd，美技回放停用');

  /* ---------- 回放 ---------- */
  const CSS = `#grCam{position:fixed;inset:0;z-index:9500;color:#fff;font-family:'Noto Sans TC',sans-serif;touch-action:manipulation}
#grCam .kc-bar{position:absolute;left:0;right:0;background:#000;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 3vw;box-sizing:border-box}
#grCam .kc-top{top:0;height:11%;background:linear-gradient(#000 70%,rgba(0,0,0,0))}#grCam .kc-bot{bottom:0;height:14%;background:linear-gradient(rgba(0,0,0,0),#000 35%)}
#grCam .kc-t{font-weight:900;font-size:clamp(14px,2.6vw,24px);letter-spacing:.06em;text-shadow:0 0 8px #e90}#grCam .kc-t i{display:inline-block;width:.7em;height:.7em;border-radius:50%;background:#fb2;margin-right:.4em;animation:gcB 1s infinite}
@keyframes gcB{50%{opacity:.25}}
#grCam .kc-cam{font-size:clamp(12px,2vw,18px);color:#ffe08a;font-weight:700}#grCam .kc-info{font-size:clamp(11px,1.8vw,16px);opacity:.92}
#grCam button{cursor:pointer;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:.35em 1em;font-size:clamp(12px,1.8vw,16px);font-weight:700;margin-left:6px}
#grCam .kc-fl{position:absolute;left:50%;top:66%;transform:translate(-50%,0);text-align:center;opacity:0;white-space:nowrap;pointer-events:none}
#grCam .kc-fl.on{animation:gcF 1.5s ease-out forwards}#grCam .kc-fl b{display:block;font-size:clamp(22px,5vw,46px);font-weight:900;text-shadow:0 2px 10px #000,0 0 18px #fb2}#grCam .kc-fl small{font-size:clamp(12px,2.2vw,20px);color:#ffe08a;text-shadow:0 1px 6px #000}
@keyframes gcF{0%{opacity:0;transform:translate(-50%,10px) scale(.8)}12%{opacity:1;transform:translate(-50%,0) scale(1.1)}25%{transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0}}
body.grcam #hud,body.grcam #pinfo,body.grcam #sb,body.grcam #topbar,body.grcam #caption,body.grcam #leftCol,body.grcam #pitchPanel,body.grcam #acts,body.grcam #absPanel,body.grcam #touchBtns,body.grcam #throwPanel,body.grcam #fmLayer,body.grcam #fmAssist{visibility:hidden!important}`;
  function css() { if (document.getElementById('grCss')) return; const s = document.createElement('style'); s.id = 'grCss'; s.textContent = CSS; document.head.appendChild(s); }
  const keyH = e => { if (!cur) return; if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (e.type === 'keydown') skip(); } };
  // pre／post＝接球前／後要播多久（秒）；sp＝播放速度；sl＝接球前後的慢動作倍率；nw＝慢動作範圍；hf＝接球瞬間停格
  const PASSES = [
    { kind: 'wide', name: '鏡頭 1／3　轉播遠景', sp: 1.7, sl: .5, nw: .2, pre: 2.0, post: .5, h0: .05, hf: .1 },
    { kind: 'side', name: '鏡頭 2／3　側面', sp: 1.15, sl: .4, nw: .2, pre: 1.0, post: .6, h0: .05, hf: .2 },
    { kind: 'front', name: '鏡頭 3／3　迎面特寫', sp: 1.0, sl: .3, nw: .25, pre: .6, post: .8, h0: .05, hf: .4 }
  ];
  function start(j) {
    if (cur || !fxOK() || G.freeze) return false;
    const F = snap(); if (F.length < 20) return false;
    const Tn = F[F.length - 1].t; if (j.Tc - F[0].t < .6 || j.Tc > Tn) return false;
    const cs = typeof CAMC !== 'undefined' ? CAMC : null; if (!cs) return false;
    const cp = []; rigsNow().forEach(r => { const a = new Float32Array(STR); pack(r, a, 0); cp.push([r, a]); });      // 現況姿勢：回放結束後還原
    const saved = { mode: cs.mode, pos: cs.pos.clone(), look: cs.look.clone(), fov: cs.fov, tpos: cs.tpos.clone(), tlook: cs.tlook.clone(), tfov: cs.tfov, k: cs.k, kl: cs.kl, ball: { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z, v: !!ballMesh.visible } };
    css(); G.freeze = true;
    const fx = j.x, fz = j.z, L = Math.hypot(fx, fz) || 1, ux = fx / L, uz = fz / L;      // u＝本壘→野手 的單位向量
    let sx = -uz, sz = ux; if (Math.hypot(fx + sx * 11, fz + sz * 11) > Math.hypot(fx - sx * 11, fz - sz * 11)) { sx = -sx; sz = -sz; }      // 側面機位放在球場內側（不會跑到牆外）
    const ui = document.createElement('div'); ui.id = 'grCam';
    ui.innerHTML = `<div class="kc-bar kc-top"><span class="kc-t"><i></i>美技回放 REPLAY</span><span class="kc-cam"></span></div><div class="kc-fl"></div><div class="kc-bar kc-bot"><span class="kc-info"></span><span><button class="kc-tg"></button><button class="kc-skip">跳過 ⏭</button></span></div>`;
    document.body.appendChild(ui); document.body.classList.add('grcam');
    ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(ev => ui.addEventListener(ev, e => { e.stopPropagation(); }));
    ui.addEventListener('click', () => skip());
    ui.querySelector('.kc-skip').onclick = e => { e.stopPropagation(); skip(); };
    const tg = ui.querySelector('.kc-tg'), tgT = () => { tg.textContent = prefOn() ? '回放：開' : '回放：關'; }; tgT(); tg.onclick = e => { e.stopPropagation(); setPref(!prefOn()); tgT(); };
    const how = j.rob ? '攀牆搶下全壘打' : j.dive ? (j.air ? '飛身撲接' : '撲接滾地球') : '極限守備';
    let nm = ''; try { nm = (j.f.pl && j.f.pl.name) || ''; } catch (e) { }
    ui.querySelector('.kc-info').textContent = `${j.f.pos} ${nm}　${how}`;
    cur = { F, Tc: j.Tc, Tn, t0: 0, tEnd: 0, tt: 0, pi: 0, hold: .1, stage: 'pass', vt: 0, saved, cp, ui, j, fx, fz, ux, uz, sx, sz, how, last: performance.now(), fired: false };
    document.addEventListener('keydown', keyH, true); document.addEventListener('keyup', keyH, true);
    newPass(); requestAnimationFrame(loop); return true;
  }
  function newPass() { const P = PASSES[cur.pi]; cur.t0 = Math.max(cur.F[0].t, cur.Tc - P.pre); cur.tEnd = Math.min(cur.Tn, cur.Tc + P.post); cur.tt = cur.t0; cur.hold = P.h0; cur.fired = false; try { cur.ui.querySelector('.kc-fl').classList.remove('on'); } catch (e) { } cur.ui.querySelector('.kc-cam').textContent = `${P.name}　慢動作`; cam(P.kind, true, cur.tt, applyAt(cur.F, cur.tt)); }
  function cam(kind, snapNow, tt, bb) {
    const cs = CAMC, c = cur, prog = clampN((tt - c.t0) / Math.max(.1, c.tEnd - c.t0), 0, 1), fx = c.fx, fz = c.fz; let pos, look, fov;
    const blend = (w) => [mix(fx, bb[0], w), mix(1.0, Math.max(.7, bb[1]), w), mix(fz, bb[2], w)];      // 看向「野手」與「球」之間
    if (kind === 'wide') { pos = [fx * .2, 8.5, 17]; look = blend(.85); fov = clampN(2 * Math.atan(16 / Math.max(20, Math.hypot(fx - pos[0], fz - pos[2]))) * 57.3, 15, 52) * (1 - .2 * prog); }      // 本壘後方高處：看球飛向野手
    else if (kind === 'side') { pos = [fx + c.sx * 11, 2.1, fz + c.sz * 11]; look = blend(.55 + .35 * prog); fov = 36 - 8 * prog; }      // 側面：看撲接的動作
    else { pos = [fx - c.ux * 9 + c.sx * 2.2, 1.5, fz - c.uz * 9 + c.sz * 2.2]; look = blend(.5 + .5 * prog); fov = 34 - 12 * prog; }      // 迎面：看球進手套
    cs.mode = 'rcam'; cs.tpos.set(pos[0], pos[1], pos[2]); cs.tlook.set(look[0], look[1], look[2]); cs.tfov = fov * (typeof VP !== 'undefined' && VP.fk || 1); cs.k = 10; cs.kl = 0;
    if (snapNow) { cs.pos.copy(cs.tpos); cs.look.copy(cs.tlook); cs.fov = cs.tfov; }
  }
  function loop() { if (!cur) return; requestAnimationFrame(loop); try { tick(); } catch (e) { console.error(e); stop(false); } }
  function tick() {
    const now = performance.now(), dt = Math.min(.05, (now - cur.last) / 1000); cur.last = now;
    if (G.over || G.mode !== 'play') return stop(false);
    G._camBad = 0; const P = PASSES[cur.pi]; let bb;
    if (cur.stage === 'pass') {
      if (cur.hold > 0) cur.hold -= dt;
      else {
        const near = Math.abs(cur.tt - cur.Tc) < P.nw; cur.tt += dt * P.sp * (near ? P.sl : 1);
        if (!cur.fired && cur.tt >= cur.Tc) { cur.tt = cur.Tc; cur.fired = true; cur.hold = P.hf; if (cur.pi === PASSES.length - 1) flash('🧤 精彩美技！', cur.how); }
        if (cur.tt >= cur.tEnd) { cur.tt = cur.tEnd; if (cur.pi + 1 < PASSES.length) { cur.pi++; newPass(); return; } cur.stage = 'verdict'; cur.vt = 0; verdict(); }
      }
      bb = applyAt(cur.F, cur.tt); cam(P.kind, false, cur.tt, bb);
    } else { cur.vt += dt; bb = applyAt(cur.F, cur.tEnd); cam(PASSES[PASSES.length - 1].kind, false, cur.tEnd, bb); if (cur.vt > .8) stop(true); }
  }
  function flash(t, s) { const f = cur.ui.querySelector('.kc-fl'); f.innerHTML = `<b>${t}</b><small>${s}</small>`; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  function verdict() { cur.ui.querySelector('.kc-cam').textContent = `${cur.j.f.pos}　${cur.how}`; }
  function skip() { if (!cur) return; if (cur.stage === 'pass') { cur.pi = PASSES.length - 1; cur.stage = 'verdict'; cur.vt = 0; cur.tEnd = Math.min(cur.Tn, cur.Tc + PASSES[cur.pi].post); cur.tt = cur.tEnd; verdict(); } else cur.vt = 99; }
  function stop(done, jj) {
    const c = cur; cur = null; const j = c ? c.j : jj; if (!c) return;
    try { document.removeEventListener('keydown', keyH, true); document.removeEventListener('keyup', keyH, true); } catch (e) { }
    try { c.cp.forEach(([r, a]) => applyRig(r, a, 0, null, 0, 0)); const s = c.saved.ball; setBall({ x: s.x, y: s.y, z: s.z }, s.v); } catch (e) { }
    try { const s = c.saved, cs = CAMC; cs.mode = s.mode; cs.pos.copy(s.pos); cs.look.copy(s.look); cs.fov = s.fov; cs.tpos.copy(s.tpos); cs.tlook.copy(s.tlook); cs.tfov = s.tfov; cs.k = s.k; cs.kl = s.kl; } catch (e) { }
    try { c.ui.remove(); document.body.classList.remove('grcam'); } catch (e) { }
    G.freeze = false; lastReal = performance.now();
    if (j && j.resume && !j._ran) { j._ran = true; try { j.resume(); } catch (e) { console.error(e); } }      // 繼續原本被暫停的「這一球結束」流程
  }
  (function rec() { requestAnimationFrame(rec); try { if (cur) return; sample(); } catch (e) { } })();
  return { start, stop, get active() { return !!cur; } };
})();
