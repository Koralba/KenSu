'use strict';
/* 13w-hr-show.js ｜ 全壘打強化：更盛大的慶祝＋更多球員互動＋全壘打回放（完整的擊球→飛行→飛出牆外）
   不改動 03／05／06 的原有慶祝（煙火秀、隊友迎接、壘包火花），而是「包住」它們再疊加：
   ① 盛大慶祝（包住 11 的 hrTrotStart；一般全壘打與 ABS 判決的全壘打都會觸發）：全壘打牆一整排噴泉、多波大型煙火＋結尾連發、全場金色彩帶雨、滿貫／三分砲／超遠距離字幕，遠距離時有機率「甩棒」（用 13q 的 KFX.toss 變成 3D 球棒）。
   ② 球員互動：
      ‧ 包住 03 的 hrCrewSpawn：迎接的隊友由 4 人增為 8 人。
      ‧ 包住 03 的 hrHomeFx（打者踏回本壘）：所有隊友衝過去把打者圍成一圈，抵達後各自做不同的慶祝動作、面向打者，過半數到齊時中央再爆一波火花；打者本人也有圍住的歡呼。
      ‧ 鏡頭在打者回到本壘時改成環繞特寫（拉近、繞一圈），結束後還原。
      ‧ 玩家自己的球隊轟出全壘打時，跑壘途中畫面下方會出現「慶祝動作」選單（跳躍歡呼／指天旋轉／謝幕鞠躬／展翅／舞步／高高跳起），回到本壘時用你選的動作（沒選＝維持原本隨機）。選單右上角 × 可關閉並記住（localStorage cpbl2027.hrpick=0）。
      ‧ 包住 03 的 hrBaseFx：每踩一壘多一點火花與歡呼。
   ③ 全壘打回放：每幀錄全場野手／跑者／打者／捕手／主審姿勢＋球（環狀緩衝約 9.5 秒）。球飛出牆外後約 1 秒存下這一段；整個全壘打流程結束、進下一球之前，凍結比賽播 3 個機位（打者揮棒特寫 → 本壘後方追焦球的完整飛行 → 牆邊側面看球飛出去），球出牆瞬間放慢，可「跳過」或 Space／Enter／Esc／點畫面；右下可開關（localStorage cpbl2027.hrrep=0）。
   ④ 區網對戰（vsOn）、快轉（window.__ff）全部停用；13q 三振回放／13v 美技回放播放中不重疊。
   依賴：11 的 hrTrotStart／flowOnPlayEnd，03 的 CAMC／fwLaunch／fwSpawn／fwFountain／HRC／makeChibi／teamStyle／faceRig／setBall／ballMesh／wallRadius／crowdCheer／flashScreen／toast，04 的 G／E／after，05 的 PL，11 的 flowOnPlayEnd，13q 的 KFX（選用）。載入位置：13v 之後、14 之前。 */
const HRX = (function () {
  const NODES = ['body', 'head', 'armL', 'armR', 'legL', 'legR', 'glove'], STR = 4 + NODES.length * 7 + 6, NF = 600, KEEP = 9.5, MAXR = 16, TAU = Math.PI * 2;
  const ring = []; let head = 0, cnt = 0, ct = 0, lastReal = performance.now(), cur = null, job = null, trackPL = null, plT = 0, choice = null, pickEl = null, orb = null;
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v)), mix = (a, b, k) => a + (b - a) * k, rnd = (a, b) => a + Math.random() * (b - a);
  const live = () => { try { return typeof G !== 'undefined' && G && G.mode === 'play' && !G.over; } catch (e) { return false; } };
  const vsx = () => { try { return !!vsOn(); } catch (e) { return false; } };
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  const repOn = () => ls('cpbl2027.hrrep', '1') !== '0';
  const busy = () => { try { return (typeof KFX !== 'undefined' && KFX.active) || (typeof GREP !== 'undefined' && GREP.active); } catch (e) { return false; } };
  const fxOK = () => live() && !window.__ff && !vsx();

  /* ---------- 錄影（姿勢封裝與 13q／13v 相同） ---------- */
  function rigsNow() {
    const out = [], seen = new Set(), add = o => { const r = o && o.rig; if (r && r.root && !seen.has(r) && out.length < MAXR) { seen.add(r); out.push(r); } };
    try { add(E.bat); add(E.ump); for (const f of Object.values(E.F)) add(f); for (const r of E.runners || []) add(r); } catch (e) { }
    return out;
  }
  function pack(rig, a, o) {
    const p = rig.root.position; a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = rig.root.rotation.y; let k = o + 4;
    for (const n of NODES) { const g = rig[n]; if (g) { a[k] = g.position.x; a[k + 1] = g.position.y; a[k + 2] = g.position.z; a[k + 3] = g.rotation.x; a[k + 4] = g.rotation.y; a[k + 5] = g.rotation.z; a[k + 6] = g.scale.y; } k += 7; }
    const bt = rig.bat; if (bt) { a[k] = bt.position.x; a[k + 1] = bt.position.y; a[k + 2] = bt.position.z; a[k + 3] = bt.rotation.y; a[k + 4] = rig.batTilt ? rig.batTilt.rotation.z : 0; a[k + 5] = bt.visible ? 1 : 0; } else a[k + 5] = 0;
    a[o + STR - 1] = rig.root.visible ? 1 : 0;
  }
  function applyRig(rig, da, oa, db, ob, u) {
    const L = j => { const x = da[oa + j]; if (!db) return x; const y = db[ob + j]; if (j === 3) { let d = y - x; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI; return x + d * u; } return x + (y - x) * u; };
    rig.root.position.set(L(0), L(1), L(2)); rig.root.rotation.y = L(3); let k = 4;
    for (const n of NODES) { const g = rig[n]; if (g) { g.position.set(L(k), L(k + 1), L(k + 2)); g.rotation.x = L(k + 3); g.rotation.y = L(k + 4); g.rotation.z = L(k + 5); g.scale.y = L(k + 6); } k += 7; }
    const bt = rig.bat; if (bt) { bt.position.set(L(k), L(k + 1), L(k + 2)); bt.rotation.y = L(k + 3); if (rig.batTilt) rig.batTilt.rotation.z = L(k + 4); bt.visible = da[oa + k + 5] > .5; }
    rig.root.visible = da[oa + STR - 1] > .5;
  }
  function sample() {
    const now = performance.now(), dt = Math.min(.05, (now - lastReal) / 1000); lastReal = now;
    if (!live() || G.freeze || window.__ff || document.hidden || cur || vsx()) return;
    ct += dt;
    if (PL !== trackPL) { trackPL = PL; plT = ct; if (job && PL && job.pl !== PL) job = null; }      // 記下「這一球」開始（擊球）的時間
    const rigs = rigsNow(); if (!rigs.length) return;
    const fr = ring[head] || (ring[head] = { t: 0, b: [0, 0, 0], bv: false, rigs: [], data: new Float32Array(MAXR * STR) }), bp = ballMesh.position;
    fr.t = ct; fr.bv = !!ballMesh.visible; fr.b[0] = bp.x; fr.b[1] = bp.y; fr.b[2] = bp.z; fr.rigs = rigs;
    for (let i = 0; i < rigs.length; i++) pack(rigs[i], fr.data, i * STR);
    head = (head + 1) % NF; cnt = Math.min(NF, cnt + 1);
    if (job && !job.F && ct >= job.t0 + (job.over ? job.over.t : 5.5) + 1.0) job.F = snap();      // 球飛出牆外約 1 秒：把整段擊球畫面存下來（跑壘慶祝要很久，不能等到最後才存）
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

  /* ================= ① 盛大慶祝 ================= */
  const KINDS = ['peony', 'ring', 'heart', 'star', 'willow', 'double'], COLS = ['#ffd34d', '#ff4d4d', '#4dd2ff', '#7dff7d', '#ff7de9', '#ffffff'];
  function bigShow(pl) {
    const n = pl.hrN || 1, d = pl.dist || 90, big = n >= 3 || d >= 120;
    for (let i = -3; i <= 3; i++) { const dg = i * 13, a = dg * Math.PI / 180, r = wallRadius(dg) - 1.2; after(.2 + Math.abs(i) * .14, () => fwFountain(r * Math.sin(a), -r * Math.cos(a), 4.2 + n * .5)); }      // 牆邊一整排噴泉
    const waves = 2 + Math.min(3, n);
    for (let w = 0; w < waves; w++) for (let j = 0; j < 5; j++) after(.8 + w * 1.9 + j * .13, () => fwLaunch(rnd(-52, 52), rnd(-95, -30), rnd(26, 52), KINDS[(w + j) % KINDS.length], COLS[(w * 2 + j) % COLS.length], '#ffd34d', rnd(1.05, 1.65), rnd(.8, 1)));      // 多波大型煙火
    const fin = 4.2 + waves * .5; for (let j = 0; j < 8; j++) after(fin + j * .1, () => fwLaunch(-60 + j * 17, rnd(-92, -60), rnd(34, 54), KINDS[j % KINDS.length], COLS[j % COLS.length], '#ffd34d', 1.5, .75));      // 結尾齊發
    const N = 150 + n * 55; for (let i = 0; i < N; i++) after(rnd(.2, 3.4), () => fwSpawn(rnd(-42, 42), rnd(26, 36), rnd(-72, 14), rnd(-1.5, 1.5), rnd(-3, -1), rnd(-1.5, 1.5), i % 2 ? '#ffd34d' : COLS[i % COLS.length], rnd(3, 4.6), rnd(.5, .85), 2.2, 1.3));      // 全場金色彩帶雨
    crowdCheer(2.6); try { flowSfx('cheer', 2.8); } catch (e) { }
    if (n >= 4) toast('滿貫全壘打！！', '#fff27a', '#c2185b'); else if (n === 3) toast('三分砲！', '#fff27a', '#d84315'); else if (d >= 125) toast(Math.round(d) + ' 公尺超級巨砲！', '#fff', '#6a1b9a');
    if (big) { after(1.2, () => { try { CAMC.shake = Math.max(CAMC.shake || 0, .4); flashScreen(.4); } catch (e) { } }); after(2.6, () => crowdCheer(2.4)); }
    if (d >= 100 && Math.random() < .55) after(.15, batFlip);      // 甩棒
  }
  function batFlip() {
    try { if (typeof KFX === 'undefined' || !fxOK()) return; const b = E.runners.find(r => r.bat) || E.bat, rig = b && b.rig; if (rig && rig.bat && rig.bat.visible) KFX.toss(rig, 'drop'); } catch (e) { }
  }

  /* ================= ② 球員互動 ================= */
  const CEL = ['cel1', 'cel7', 'cel2', 'cel5', 'cel4', 'cel3'];
  const PICKS = [['cel1', '🙌 跳躍歡呼'], ['cel2', '🌀 指天旋轉'], ['cel3', '🙇 謝幕鞠躬'], ['cel4', '✈️ 展翅'], ['cel5', '🕺 舞步'], ['cel7', '🦘 高高跳起']];
  function extraCrew() {
    if (!fxOK() || !HRC.list.length) return;
    const st = teamStyle(G.half), sx = Math.sign(HRC.list[0].x) || 1, spots = [[-4.2, 1.4], [4.2, 1.4], [-3.2, 3.9], [3.2, 3.9]];
    for (let i = 0; i < spots.length; i++) {
      const rig = makeChibi({ jersey: st.jersey, pants: st.pants, cap: st.cap, belt: st.belt, scale: .95 }); scene.add(rig.root);
      const x0 = sx * (12 + i * 1.1), z0 = 5.2 + i * .5; rig.root.position.set(x0, 0, z0); rig.run = 1.6;
      HRC.list.push({ rig, x: x0, z: z0, tx: spots[i][0], tz: spots[i][1], st: 'run', d: .6 + i * .22 });
    }
  }
  let hx = 0, hz = 0, arrived = 0, burstDone = false;
  function rush(b) {
    const p = b && b.rig ? b.rig.root.position : { x: 0, z: 0 }; hx = p.x; hz = p.z; arrived = 0; burstDone = false;
    const L = HRC.list, N = L.length; if (!N) return; const a0 = Math.random() * TAU;
    L.forEach((c, i) => { const a = a0 + i / N * TAU; c.st = 'x'; c.tx = hx + Math.cos(a) * 1.6; c.tz = hz + Math.sin(a) * 1.6; c.dl = i * .09; c.arr = false; c.kind = CEL[i % CEL.length]; });
    HRC.end = 9.8;      // 多留一會兒，讓大家圍著慶祝
  }
  function crewTick(dt) {
    const L = HRC.list; if (!L.length) return;
    for (const c of L) {
      if (c.st !== 'x') continue; if (c.dl > 0) { c.dl -= dt; continue; }
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      if (d < .2) {
        if (!c.arr) { c.arr = true; c.rig.run = 0; c.rig.anim = { name: c.kind, t: 0, dur: 2.2 + Math.random() * .8, opt: {} }; arrived++; if (!burstDone && arrived >= Math.ceil(L.length * .6)) { burstDone = true; centerBurst(); } }
        try { faceRig(c.rig, hx, hz); } catch (e) { }
      } else { if (c.rig.anim && c.rig.anim.name && /^cel|^cheer/.test(c.rig.anim.name)) c.rig.anim = null; const v = Math.min(d, 6.8 * dt); c.x += dx / d * v; c.z += dz / d * v; c.rig.run = 1.8; try { faceRig(c.rig, c.tx, c.tz); } catch (e) { } }
    }
  }
  function centerBurst() {      // 大家圍到打者身邊：中央爆出一波金色火花與煙火
    try {
      fwFountain(hx, hz, 1.8);
      for (let i = 0; i < 46; i++) { const a = i / 46 * TAU, sp = rnd(3, 7); fwSpawn(hx, .6, hz, Math.cos(a) * sp, rnd(5, 11), Math.sin(a) * sp, i % 3 ? '#ffd34d' : '#ffffff', rnd(.9, 1.5), .9, 9, 1.3); }
      for (let j = 0; j < 4; j++) after(j * .16, () => fwLaunch(hx + rnd(-6, 6), hz - rnd(2, 14), rnd(16, 26), KINDS[(j + 2) % KINDS.length], COLS[(j * 2) % COLS.length], '#ffd34d', .9, .6));
      CAMC.shake = Math.max(CAMC.shake || 0, .22); flashScreen(.35); crowdCheer(2.4);
    } catch (e) { }
  }
  /* 打者回到本壘：環繞特寫鏡頭 */
  function orbitStart() {
    if (!fxOK()) return; const cs = CAMC;
    let a0 = 0; try { a0 = Math.atan2(camera.position.x - hx, camera.position.z - hz); } catch (e) { }
    orb = { t: 0, dur: 3.6, a0, mode0: cs.mode, k0: cs.k, r0: clampN(Math.hypot(camera.position.x - hx, camera.position.z - hz), 9, 30) };
  }
  function orbitTick(dt) {
    if (!orb) return;
    if (!fxOK() || (CAMC.mode !== 'rcam' && orb.t > 0 && orb.set)) { orb = null; return; }      // 比賽流程已經換鏡頭了：不去搶
    orb.t += dt; const u = clampN(orb.t / orb.dur, 0, 1), e = u * u * (3 - 2 * u), a = orb.a0 + e * 2.1, r = mix(orb.r0, 6.2, clampN(u * 2.2, 0, 1)), y = mix(14, 2.5, clampN(u * 2, 0, 1)) + Math.sin(u * Math.PI) * .6;
    const cs = CAMC; cs.mode = 'rcam'; orb.set = true; cs.tpos.set(hx + Math.sin(a) * r, y, hz + Math.cos(a) * r); cs.tlook.set(hx, 1.35, hz); cs.tfov = 44 * (typeof VP !== 'undefined' && VP.fk || 1); cs.k = 3.2; cs.kl = 0; try { G._camBad = 0; } catch (e) { }
    if (u >= 1) { cs.mode = orb.mode0 || 'hrtrot'; cs.k = orb.k0 || 2.4; orb = null; }
  }
  /* 慶祝動作選單（玩家自己的球隊轟出全壘打時） */
  function humanBatting() { try { return G.human >= 0 && G.human === G.half && (!G.role || (curBatter() && curBatter().isMe)); } catch (e) { return false; } }
  function pickShow(pl) {
    pickHide(); choice = null; if (!fxOK() || ls('cpbl2027.hrpick', '1') === '0' || !humanBatting()) return;
    if (!document.getElementById('hrxCss')) { const s = document.createElement('style'); s.id = 'hrxCss'; s.textContent = `#hrxPick{position:fixed;left:50%;bottom:calc(22% + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:60;background:rgba(10,16,40,.78);border:1px solid rgba(255,225,120,.7);border-radius:14px;padding:8px 12px 10px;color:#fff;font-family:'Noto Sans TC',sans-serif;text-align:center;backdrop-filter:blur(4px);box-shadow:0 0 18px rgba(255,200,60,.45);max-width:94vw}
#hrxPick .t{font-weight:900;font-size:13px;color:#ffe08a;margin-bottom:6px;display:flex;justify-content:space-between;gap:12px}#hrxPick .t span{opacity:.75;cursor:pointer;font-weight:700}
#hrxPick .b{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}#hrxPick button{cursor:pointer;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:.4em .9em;font-size:13px;font-weight:700}#hrxPick button.on{background:#ffd34d;color:#222;border-color:#fff}`; document.head.appendChild(s); }
    const el = document.createElement('div'); el.id = 'hrxPick'; el.innerHTML = `<div class="t">🎉 選擇回本壘的慶祝動作<span class="x">✕ 不再顯示</span></div><div class="b">${PICKS.map(p => `<button data-c="${p[0]}">${p[1]}</button>`).join('')}</div>`;
    ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
    el.querySelectorAll('button').forEach(b => b.onclick = () => { choice = b.dataset.c; el.querySelectorAll('button').forEach(o => o.classList.toggle('on', o === b)); });
    el.querySelector('.x').onclick = () => { lsSet('cpbl2027.hrpick', '0'); choice = null; pickHide(); };
    document.body.appendChild(el); pickEl = el; pickEl._pl = pl;
  }
  function pickHide() { if (pickEl) { try { pickEl.remove(); } catch (e) { } pickEl = null; } }
  setInterval(() => { try { if (pickEl && (!PL || PL !== pickEl._pl || G.mode !== 'play')) pickHide(); } catch (e) { } }, 500);

  /* ---------- 包住原有函式 ---------- */
  /* 一般全壘打的慶祝寫在 11 的 flowOnContact 裡、ABS 判決的才走 06 的 hrCelebrate；兩條路都會呼叫 11 的 hrTrotStart(pl)，所以包這一個才兩邊都有 */
  try { const _c = hrTrotStart; hrTrotStart = function (pl) { const r = _c.apply(this, arguments); try { if (PL === pl && pl.plan && !pl.plan.grd && fxOK()) { arm(pl); bigShow(pl); pickShow(pl); } } catch (e) { console.error(e); } return r; }; } catch (e) { console.warn('HRX：無法包住 hrTrotStart', e); }
  try { const _c = hrCrewSpawn; hrCrewSpawn = function () { const r = _c.apply(this, arguments); try { extraCrew(); } catch (e) { console.error(e); } return r; }; } catch (e) { console.warn('HRX：無法包住 hrCrewSpawn', e); }
  try {
    const _c = hrHomeFx; hrHomeFx = function () {
      const r = _c.apply(this, arguments);
      try {
        if (!fxOK()) return r;
        const b = E.runners.find(q => q.bat && q.state === 'home') || E.runners.find(q => q.state === 'home');
        if (choice && b && b.rig) { b.rig.anim = { name: choice, t: 0, dur: 2.8, opt: {} }; b.fadeT = -(2.8 + 1.6); }      // 玩家選的慶祝動作
        pickHide(); rush(b); orbitStart();
      } catch (e) { console.error(e); } return r;
    };
  } catch (e) { console.warn('HRX：無法包住 hrHomeFx', e); }
  try { const _c = hrBaseFx; hrBaseFx = function (bs) { const r = _c.apply(this, arguments); try { if (fxOK()) { crowdCheer(1.2); const p = baseSpot(bs); for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; fwSpawn(p.x, .4, p.z, Math.cos(a) * 3, rnd(6, 10), Math.sin(a) * 3, i % 2 ? '#fff2a0' : '#ff9d2f', rnd(.8, 1.3), .8, 9, 1.3); } } } catch (e) { } return r; }; } catch (e) { console.warn('HRX：無法包住 hrBaseFx', e); }

  /* ================= ③ 全壘打回放 ================= */
  function arm(pl) {
    const ov = pl.sim && pl.sim.over; let side = 1; try { side = (E.bat && E.bat.side != null) ? E.bat.side : (curBatter().side || 1); } catch (e) { }
    job = { pl, t0: trackPL === pl ? plT : ct - 3, over: ov ? { x: ov.x, z: ov.z, t: ov.t } : null, dist: pl.dist || 0, n: pl.hrN || 1, ang: pl.res && pl.res.ang, side, name: '', F: null, resume: null };
    try { job.name = curBatter().name || ''; } catch (e) { }
  }
  const CSS = `#hrCam{position:fixed;inset:0;z-index:9500;color:#fff;font-family:'Noto Sans TC',sans-serif;touch-action:manipulation}
#hrCam .kc-bar{position:absolute;left:0;right:0;background:#000;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 3vw;box-sizing:border-box}
#hrCam .kc-top{top:0;height:11%;background:linear-gradient(#000 70%,rgba(0,0,0,0))}#hrCam .kc-bot{bottom:0;height:14%;background:linear-gradient(rgba(0,0,0,0),#000 35%)}
#hrCam .kc-t{font-weight:900;font-size:clamp(14px,2.6vw,24px);letter-spacing:.06em;text-shadow:0 0 8px #3c9}#hrCam .kc-t i{display:inline-block;width:.7em;height:.7em;border-radius:50%;background:#4f8;margin-right:.4em;animation:hxB 1s infinite}
@keyframes hxB{50%{opacity:.25}}
#hrCam .kc-cam{font-size:clamp(12px,2vw,18px);color:#ffe08a;font-weight:700}#hrCam .kc-info{font-size:clamp(11px,1.8vw,16px);opacity:.92}
#hrCam button{cursor:pointer;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:.35em 1em;font-size:clamp(12px,1.8vw,16px);font-weight:700;margin-left:6px}
#hrCam .kc-fl{position:absolute;left:50%;top:64%;transform:translate(-50%,0);text-align:center;opacity:0;white-space:nowrap;pointer-events:none}
#hrCam .kc-fl.on{animation:hxF 1.7s ease-out forwards}#hrCam .kc-fl b{display:block;font-size:clamp(24px,5.4vw,50px);font-weight:900;text-shadow:0 2px 10px #000,0 0 18px #4f8}#hrCam .kc-fl small{font-size:clamp(12px,2.2vw,20px);color:#ffe08a;text-shadow:0 1px 6px #000}
@keyframes hxF{0%{opacity:0;transform:translate(-50%,10px) scale(.8)}12%{opacity:1;transform:translate(-50%,0) scale(1.1)}25%{transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0}}
body.hrcam #hud,body.hrcam #pinfo,body.hrcam #sb,body.hrcam #topbar,body.hrcam #caption,body.hrcam #leftCol,body.hrcam #pitchPanel,body.hrcam #acts,body.hrcam #absPanel,body.hrcam #touchBtns,body.hrcam #throwPanel,body.hrcam #fmLayer,body.hrcam #fmAssist,body.hrcam #hrxPick{visibility:hidden!important}`;
  function css() { if (document.getElementById('hrCss')) return; const s = document.createElement('style'); s.id = 'hrCss'; s.textContent = CSS; document.head.appendChild(s); }
  const keyH = e => { if (!cur) return; if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (e.type === 'keydown') skip(); } };
  // a／b＝這個機位的播放區間；focus＝放慢的時間點（擊球／球出牆）；nw＝放慢範圍；sl＝放慢倍率
  const PASSES = [
    { kind: 'bat', name: '鏡頭 1／3　打者特寫', a: c => c.tc - .7, b: c => c.tc + .6, focus: c => c.tc, sp: .95, sl: .35, nw: .2, h0: .05, hf: .05 },
    { kind: 'follow', name: '鏡頭 2／3　球的完整飛行', a: c => c.tc - .1, b: c => c.Tov + .5, focus: c => c.Tov, sp: 1.95, sl: .5, nw: .3, h0: .05, hf: .05 },
    { kind: 'wall', name: '鏡頭 3／3　飛出全壘打牆', a: c => c.Tov - 1.3, b: c => c.Tov + .9, focus: c => c.Tov, sp: 1.2, sl: .35, nw: .3, h0: .05, hf: .3 }
  ];
  function start(j) {
    if (cur || !fxOK() || G.freeze || busy()) return false;
    const F = j.F; if (!F || F.length < 20) return false; const Tn = F[F.length - 1].t, tc = Math.max(F[0].t + .3, j.t0);
    let Tov = j.over ? j.t0 + j.over.t : null; if (Tov == null || Tov > Tn - .2) { let ie = -1; for (let i = F.length - 1; i >= 0; i--) if (F[i].bv) { ie = i; break; } Tov = ie >= 0 ? F[ie].t : tc + 3; }
    if (Tov - tc < .8) return false;
    const cs = typeof CAMC !== 'undefined' ? CAMC : null; if (!cs) return false;
    const cp = []; rigsNow().forEach(r => { const a = new Float32Array(STR); pack(r, a, 0); cp.push([r, a]); });
    const saved = { mode: cs.mode, pos: cs.pos.clone(), look: cs.look.clone(), fov: cs.fov, tpos: cs.tpos.clone(), tlook: cs.tlook.clone(), tfov: cs.tfov, k: cs.k, kl: cs.kl, ball: { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z, v: !!ballMesh.visible } };
    orb = null; css(); G.freeze = true; pickHide();
    let ox = 0, oz = 0; if (j.over) { ox = j.over.x; oz = j.over.z; } else { const bb = applyAt(F, Tov); ox = bb[0]; oz = bb[2]; }
    const R = Math.hypot(ox, oz) || 90, ux = ox / R, uz = oz / R; let sx = -uz, sz = ux; if (Math.hypot(ox * .8 + sx * 18, oz * .8 + sz * 18) > Math.hypot(ox * .8 - sx * 18, oz * .8 - sz * 18)) { sx = -sx; sz = -sz; }      // 側面機位放在球場內側
    const ui = document.createElement('div'); ui.id = 'hrCam';
    ui.innerHTML = `<div class="kc-bar kc-top"><span class="kc-t"><i></i>全壘打回放 REPLAY</span><span class="kc-cam"></span></div><div class="kc-fl"></div><div class="kc-bar kc-bot"><span class="kc-info"></span><span><button class="kc-tg"></button><button class="kc-skip">跳過 ⏭</button></span></div>`;
    document.body.appendChild(ui); document.body.classList.add('hrcam');
    ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(ev => ui.addEventListener(ev, e => { e.stopPropagation(); }));
    ui.addEventListener('click', () => skip());
    ui.querySelector('.kc-skip').onclick = e => { e.stopPropagation(); skip(); };
    const tg = ui.querySelector('.kc-tg'), tgT = () => { tg.textContent = repOn() ? '回放：開' : '回放：關'; }; tgT(); tg.onclick = e => { e.stopPropagation(); lsSet('cpbl2027.hrrep', repOn() ? '0' : '1'); tgT(); };
    ui.querySelector('.kc-info').textContent = `${j.name || ''}　${j.dist ? Math.round(j.dist) + ' 公尺 ' : ''}${j.n >= 4 ? '滿貫' : j.n === 3 ? '三分' : j.n === 2 ? '兩分' : ''}全壘打${j.ang != null ? '　仰角 ' + Math.round(j.ang) + '°' : ''}`;
    cur = { F, tc, Tov, Tn, t0: 0, tEnd: 0, tt: 0, pi: 0, hold: .05, stage: 'pass', vt: 0, saved, cp, ui, j, ox, oz, sx, sz, sd: j.side > 0 ? -1 : 1, last: performance.now(), fired: false };
    document.addEventListener('keydown', keyH, true); document.addEventListener('keyup', keyH, true);
    newPass(); requestAnimationFrame(loop); return true;
  }
  function newPass() { const P = PASSES[cur.pi]; cur.t0 = Math.max(cur.F[0].t, P.a(cur)); cur.tEnd = Math.min(cur.Tn, Math.max(P.b(cur), cur.t0 + .3)); cur.tt = cur.t0; cur.hold = P.h0; cur.fired = false; try { cur.ui.querySelector('.kc-fl').classList.remove('on'); } catch (e) { } cur.ui.querySelector('.kc-cam').textContent = P.name; cam(P.kind, true, cur.tt, applyAt(cur.F, cur.tt)); }
  function cam(kind, snapNow, tt, bb) {
    const cs = CAMC, c = cur, prog = clampN((tt - c.t0) / Math.max(.1, c.tEnd - c.t0), 0, 1); let pos, look, fov;
    if (kind === 'bat') { const w = clampN((tt - c.tc) / .6, 0, 1) * .9; pos = [c.sd * 3.6, 1.35, 1.3]; look = [mix(0, bb[0], w), mix(1.2, Math.max(1, bb[1]), w), mix(.1, bb[2], w)]; fov = 34 + 12 * w; }      // 打者側面：看揮棒與球離棒
    else if (kind === 'follow') { pos = [0, 9, 19]; look = [bb[0], Math.max(1.5, bb[1]), bb[2]]; const d = Math.hypot(bb[0] - pos[0], bb[1] - pos[1], bb[2] - pos[2]); fov = clampN(2 * Math.atan(13 / Math.max(14, d)) * 57.3, 12, 50); }      // 本壘後方高處：追著球看完整飛行
    else { pos = [c.ox * .8 + c.sx * 18, 5.2, c.oz * .8 + c.sz * 18]; look = [bb[0], Math.max(2, bb[1]), bb[2]]; fov = 32 - 8 * prog; }      // 牆邊側面：看球飛出去
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
        const Tf = P.focus(cur), near = Math.abs(cur.tt - Tf) < P.nw; cur.tt += dt * P.sp * (near ? P.sl : 1);
        if (!cur.fired && cur.tt >= Tf && Tf <= cur.tEnd) { cur.fired = true; cur.hold = P.hf; if (cur.pi === PASSES.length - 1) flash('💥 全壘打！', cur.j.dist ? Math.round(cur.j.dist) + ' 公尺' : ''); }
        if (cur.tt >= cur.tEnd) { cur.tt = cur.tEnd; if (cur.pi + 1 < PASSES.length) { cur.pi++; newPass(); return; } cur.stage = 'verdict'; cur.vt = 0; verdict(); }
      }
      bb = applyAt(cur.F, cur.tt); cam(P.kind, false, cur.tt, bb);
    } else { cur.vt += dt; bb = applyAt(cur.F, cur.tEnd); cam(PASSES[PASSES.length - 1].kind, false, cur.tEnd, bb); if (cur.vt > .9) stop(true); }
  }
  function flash(t, s) { const f = cur.ui.querySelector('.kc-fl'); f.innerHTML = `<b>${t}</b><small>${s}</small>`; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  function verdict() { cur.ui.querySelector('.kc-cam').textContent = `${cur.j.name || ''}　${cur.j.dist ? Math.round(cur.j.dist) + ' 公尺' : ''}全壘打`; }
  function skip() { if (!cur) return; if (cur.stage === 'pass') { cur.pi = PASSES.length - 1; cur.stage = 'verdict'; cur.vt = 0; cur.t0 = Math.max(cur.F[0].t, PASSES[cur.pi].a(cur)); cur.tEnd = Math.min(cur.Tn, Math.max(PASSES[cur.pi].b(cur), cur.t0 + .3)); cur.tt = cur.tEnd; verdict(); } else cur.vt = 99; }
  function stop(done) {
    const c = cur; if (!c) return; cur = null; const j = c.j;
    try { document.removeEventListener('keydown', keyH, true); document.removeEventListener('keyup', keyH, true); } catch (e) { }
    try { c.cp.forEach(([r, a]) => applyRig(r, a, 0, null, 0, 0)); const s = c.saved.ball; setBall({ x: s.x, y: s.y, z: s.z }, s.v); } catch (e) { }
    try { const s = c.saved, cs = CAMC; cs.mode = s.mode; cs.pos.copy(s.pos); cs.look.copy(s.look); cs.fov = s.fov; cs.tpos.copy(s.tpos); cs.tlook.copy(s.tlook); cs.tfov = s.tfov; cs.k = s.k; cs.kl = s.kl; } catch (e) { }
    try { c.ui.remove(); document.body.classList.remove('hrcam'); } catch (e) { }
    G.freeze = false; lastReal = performance.now();
    if (j && j.resume && !j._ran) { j._ran = true; try { j.resume(); } catch (e) { console.error(e); } }
  }
  /* 全壘打流程整個結束（跑完壘、慶祝完）、進下一球之前：暫停比賽播回放，播完再繼續 */
  try {
    const _flowEnd = flowOnPlayEnd;
    flowOnPlayEnd = function (pl) {
      const self = this, args = arguments, j = job;
      try {
        if (j && j.pl === pl) {
          job = null; if (!j.F && ct - j.t0 < KEEP - 1) j.F = snap();
          if (fxOK() && repOn() && !G.freeze && !G.over && j.F) { j.resume = () => _flowEnd.apply(self, args); if (start(j)) return; }
        }
      } catch (e) { console.error(e); if (!cur) G.freeze = false; if (j && !j._ran) { j._ran = true; return _flowEnd.apply(self, args); } }
      return _flowEnd.apply(self, args);
    };
  } catch (e) { console.warn('HRX：無法包住 flowOnPlayEnd，全壘打回放停用', e); }

  let lastT = performance.now();
  (function rec() { requestAnimationFrame(rec); const n = performance.now(), dt = Math.min(.05, (n - lastT) / 1000); lastT = n; try { if (!cur) sample(); if (!G.freeze && !window.__ff) { crewTick(dt); orbitTick(dt); } } catch (e) { } })();
  return { start, stop, get active() { return !!cur; }, get choice() { return choice; } };
})();
