/* ===== 13j-catcher-call.js ｜ 生涯模式：你當捕手時，由你替電腦投手配球（球種／位置／牽制／外角球） =====
   載入順序：13g 之後、14 之前。不修改 04／07／11，只包裝這幾個全域函式（與 13g 包裝 updatePlay 同一手法）：
     cpuDeliver（11）  ：電腦投手準備投球時，若「你是捕手、你的球隊守備」→ 先開配球面板，等你下指示才繼續
     aiPickPitch（07） ：有你的指示 → 回傳你指定的球種／落點（出手誤差、球威仍由引擎照投手能力計算）
     aiPickoffThink（07）：有你的指示 → 只依你的牽制指令；沒有就不牽制
     doPitch／doPickoff（11）：出手／牽制後清掉指示
   面板選項（v1.1.69 簡化）：球種＋「大概的位置」（好球帶 3×3：內／中／外 × 高／中／低；壞球：外角壞／內角壞／高壞／低壞）→ 按「下指示」後面板收起，畫面就和一般比賽一樣，
   由電腦投手自己投球、自己控球（落點會在你指的那一格裡隨機，再加上投手本身的控球誤差，所以只是「大概」）。另有 🤖 電腦決定、🚫 外角球（pitchout，防盜壘）、牽制 1／2／3 壘、🤖 本場全交給電腦。
   v1.1.69 新增「捕手接到球」：你是捕手、壘上有人、這球接住後，先不回傳投手，出現「傳一／二／三壘牽制」按鈕（2.4 秒內沒按就照常回傳投手）。
   快轉（13f）：面板開著時 CCALL.need() 為 true，13f 會暫停快轉。 */
'use strict';
const CCALL = (function () {
  let cur = null, shown = false, panel = null, autoAll = false, pickId = null, pickCell = null, hold = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMine = () => { try { return !!(G && G.role && G.mode === 'play' && !G.over && G.human >= 0 && G.human === 1 - G.half && !G.intWalk && E.F && E.F.C && E.F.C.pl && E.F.C.pl.isMe); } catch (e) { return false; } };
  /* 落點代碼 c,r：c＝橫向（|c|≤1 好球帶內、±2＝外圈壞球）、r＝高低（+高）。外角方向 = 打者慣用側 side（與 07 的外角球 x = side*2.15 一致）。
     v1.1.69：只是「大概的位置」→ 在你選的那一格（或壞球帶）裡隨機取點，之後引擎還會再加投手自己的控球誤差。 */
  const rnd = () => Math.random() * 2 - 1;
  function cellXY(c, r) {
    let x, y;
    if (Math.abs(c) <= 1 && Math.abs(r) <= 1) { x = c * ZW * 2 / 3 + rnd() * ZW / 3 * .85; y = ZC + r * ZH * 2 / 3 + rnd() * ZH / 3 * .85; }
    else if (Math.abs(c) === 2) { x = Math.sign(c) * (ZW + .12 + Math.random() * .42); y = ZC + rnd() * ZH * .6; }
    else { x = rnd() * ZW * .7; y = ZC + Math.sign(r) * (ZH + .1 + Math.random() * .38); }
    return { x, y };
  }
  const side = () => { try { return E.bat.side || 1; } catch (e) { return 1; } };
  const colLabel = c => (c === 0 ? '中' : (c * side() > 0 ? '外' : '內'));
  const rowLabel = r => (r > 0 ? '高' : r < 0 ? '低' : '中');
  const cellLabel = (c, r) => (c === 0 && r === 0 ? '正中' : colLabel(c) + rowLabel(r));
  function ensureDom() {
    if (panel) return;
    const st = document.createElement('style'); st.id = 'ccStyle';
    st.textContent = '#ccPanel{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:8300;display:none;width:min(360px,94vw);background:#0a1020e6;border:1px solid #ffe14a77;border-radius:14px;padding:8px 10px;color:#fff;font-size:.88em;box-sizing:border-box}#ccPanel.on{display:block}#ccPanel h4{margin:0 0 5px;color:#ffe14a;font-size:.98em}#ccPanel .row{display:flex;gap:5px;flex-wrap:wrap;margin:4px 0}#ccPanel button{font:inherit;padding:6px 9px;border-radius:8px;border:1px solid #fff4;background:#ffffff1c;color:#fff;cursor:pointer;touch-action:manipulation}#ccPanel button.sel{border-color:#ffe14a;color:#ffe14a;background:#ffe14a22}#ccPanel button.pri{background:linear-gradient(#ffd84a,#e8a317);color:#222;font-weight:700;border:0}#ccPanel button:disabled{opacity:.4}#ccPanel .g{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}#ccPanel .g button{padding:10px 0;font-size:.85em;background:#4caf5033}#ccPanel .g button.sel{background:#ffe14a33}#ccPanel .bl button{flex:1;background:#ff6a5a22;padding:6px 2px;font-size:.8em}#ccPanel .bl button.sel{background:#ffe14a33}#ccPanel .tbar{height:4px;background:#fff2;border-radius:2px;margin:6px 0 2px;overflow:hidden}#ccPanel .tbar i{display:block;height:100%;width:100%;background:#ffe14a}';
    document.head.appendChild(st); panel = document.createElement('div'); panel.id = 'ccPanel'; document.body.appendChild(panel);
  }
  const hide = () => { shown = false; if (panel && !hold) { panel.classList.remove('on'); panel.innerHTML = ''; } };
  /* 投手願不願意照捕手配球：捕手能力（cat／fld）越差、投手心情越差，越容易「搖頭不配合」→ 改回電腦自己選球，投手露出不高興的表情 */
  function refuseP() { try { const c = E.F.C.pl, q = (c.cat == null ? (c.fld || 55) : c.cat) * .6 + (c.fld || 55) * .4, m = (curPitcher().mood == null ? 50 : curPitcher().mood); return clamp((62 - q) * .007 + (50 - m) * .002 + .02, 0, .4); } catch (e) { return .03; } }
  const give = c => { if (c && c.id) c.refuse = Math.random() < refuseP(); cur = c; hide(); };
  function sulk() { try { const P = E.F.P; if (typeof FACE !== 'undefined' && P && P.rig) FACE.emote(P.rig, 'angry', 1.8); say('<em>投手搖了搖頭，不太樂意照捕手的配球投…</em>', 2200); } catch (e) { } }
  function open() {
    ensureDom(); shown = true; pickId = null; pickCell = null; render(); panel.classList.add('on');
  }
  function render() {
    if (!panel || !shown) return;
    const p = curPitcher(), b = curBatter(), runners = [0, 1, 2].filter(i => G.on && G.on[i]);
    let h = `<h4>🧤 捕手配球　${esc(b && b.name)}　${G.balls}-${G.strikes}　${G.outs} 出局</h4><div class="row">`;
    (p.pitches || []).forEach(x => { const d = PITCHES[x.id] || {}; h += `<button data-p="${x.id}"${pickId === x.id ? ' class="sel"' : ''}>${esc(d.short || x.id)} Lv${x.lv == null ? '' : x.lv}</button>`; });
    h += '</div><div class="g">';
    for (let r = 1; r >= -1; r--) for (let c = -1; c <= 1; c++) { const key = c + ',' + r; h += `<button data-c="${key}"${pickCell === key ? ' class="sel"' : ''}>${cellLabel(c, r)}</button>`; }
    const sd = side(), bl = [[2 * sd, 0, '外角壞'], [-2 * sd, 0, '內角壞'], [0, 2, '高壞'], [0, -2, '低壞']];
    h += '</div><div class="row bl">' + bl.map(x => { const key = x[0] + ',' + x[1]; return `<button data-c="${key}"${pickCell === key ? ' class="sel"' : ''}>${x[2]}</button>`; }).join('') + '</div>';
    h += `<div class="row"><button class="pri" id="ccGo"${pickId && pickCell ? '' : ' disabled'}>✔ 下指示（電腦投手自己投）</button><button id="ccAuto">🤖 電腦決定</button></div><div class="row"><button id="ccAll">🤖 本場全交給電腦</button>${G.balls < 3 ? '<button id="ccPO">🚫 外角球（防盜壘）</button>' : ''}</div>`;
    if (runners.length) h += '<div class="row">' + runners.map(i => `<button data-k="${i}">⚾ 牽制${['一', '二', '三'][i]}壘</button>`).join('') + '</div>';
    try {      // 防守戰術：故意四壞＋內／外野站位（再按一次＝解除）；電腦隊友照站位配合
      h += '<div class="row"><button id="ccIBB">🚷 故意四壞</button></div><div class="row">';
      for (const k in TAC_INF) h += `<button data-ti="${k}"${G.tac && G.tac.inf === k ? ' class="sel"' : ''}>${esc(TAC_INF[k].name)}</button>`;
      for (const k in TAC_OF) h += `<button data-to="${k}"${G.tac && G.tac.of === k ? ' class="sel"' : ''}>${esc(TAC_OF[k].name)}</button>`;
      h += '</div>';
    } catch (e) { }
    panel.innerHTML = h;
    panel.querySelectorAll('[data-p]').forEach(e => e.onclick = () => { pickId = e.dataset.p; render(); });
    panel.querySelectorAll('[data-c]').forEach(e => e.onclick = () => { pickCell = e.dataset.c; render(); });
    panel.querySelectorAll('[data-k]').forEach(e => e.onclick = () => give({ pk: +e.dataset.k }));
    const $ = id => panel.querySelector('#' + id);
    const setT = (g, v) => { try { setTacCore(g, v); computeShift(); resetFormation(false); say(G.tac[g] ? `捕手要求守備調整：<em>${(g === 'inf' ? TAC_INF : TAC_OF)[v].name}</em>` : '捕手解除守備戰術，回到標準站位'); } catch (e) { console.error(e); } render(); };
    panel.querySelectorAll('[data-ti]').forEach(e => e.onclick = () => setT('inf', e.dataset.ti));
    panel.querySelectorAll('[data-to]').forEach(e => e.onclick = () => setT('of', e.dataset.to));
    if ($('ccIBB')) $('ccIBB').onclick = () => { try { ibbCore(); } catch (e) { console.error(e); } hide(); };
    $('ccGo').onclick = () => { if (!pickId || !pickCell) return; const [c, r] = pickCell.split(',').map(Number), xy = cellXY(c, r); give({ id: pickId, x: xy.x, y: xy.y }); };
    $('ccAuto').onclick = () => give({ auto: true });
    $('ccAll').onclick = () => { autoAll = true; give({ auto: true }); };
    if ($('ccPO')) $('ccPO').onclick = () => give({ pitchout: true });
  }
  /* ---------- 捕手接到球：可以傳壘牽制（v1.1.69） ---------- */
  const HOLD_T = 2.4;
  function holdOK() { try { return isMine() && !G.freeze && G.strikes < 3 && G.balls < 4 && G.outs < 3 && !!G.on && G.on.some(r => r && r.state === 'on') && typeof pickoffSuccess === 'function' && typeof pickTargetFielder === 'function'; } catch (e) { return false; } }
  function releaseHold(pickBase) {
    if (!hold) return; const h = hold; hold = null; if (panel) { panel.classList.remove('on'); panel.innerHTML = ''; }
    if (pickBase != null) { try { catcherPick(pickBase); return; } catch (e) { console.error('CCALL 牽制失敗，改回傳投手', e); } }
    h.orig(h.cb);
  }
  function openHold(orig, cb) {
    ensureDom(); hold = { orig, cb, t0: performance.now(), last: 0 }; shown = false;
    const runners = [0, 1, 2].filter(i => G.on[i] && G.on[i].state === 'on');
    panel.innerHTML = `<h4>🧤 接到球了　要傳哪裡？</h4><div class="row">${runners.map(i => `<button data-k="${i}">⚾ 傳${['一', '二', '三'][i]}壘牽制${(G.on[i].lead || 0) > 2.4 ? '（離壘大！）' : ''}</button>`).join('')}<button id="ccRet" class="pri">↩ 回傳投手</button></div><div class="tbar"><i id="ccBar"></i></div>`;
    panel.classList.add('on');
    panel.querySelectorAll('[data-k]').forEach(e => e.onclick = () => releaseHold(+e.dataset.k));
    panel.querySelector('#ccRet').onclick = () => releaseHold(null);
  }
  function holdTick() {
    if (!hold) return; if (!isMine() || G.over || G.mode !== 'play' || !holdOK()) { releaseHold(null); return; }
    const el = (performance.now() - hold.t0) / 1000, bar = panel && panel.querySelector('#ccBar'); if (bar) bar.style.width = Math.max(0, 1 - el / HOLD_T) * 100 + '%';
    if (el >= HOLD_T) releaseHold(null);
  }
  /* 捕手傳壘牽制：流程仿 11 的 doPickoff（壘包手衝回壘包 → 傳球 → 觸殺／回壘 → pickoffSuccess 判定 → 把球傳回投手 → 下一球），只是出手的人是捕手 */
  function catcherPick(i) {
    const C = E.F.C, P = E.F.P, r = G.on[i], tgt = pickTargetFielder(i);
    if (!C || !P || !r || r.state !== 'on' || !tgt) { G.phase = 'pre'; prePitch(); return; }
    G.phase = 'pickoff'; const tok = G.pkTok = (G.pkTok || 0) + 1;
    const alive = () => tok === G.pkTok && !G.over && G.mode === 'play' && G.phase === 'pickoff', alive2 = () => tok === G.pkTok && !G.over && G.mode === 'play';
    r.pkIntent = stealIntent(r); r.leadAtPick = r.lead || 0; r.stepGo = false; r.earlyGo = false;
    { const ab0 = pickAbility(i), w0 = r.wary || 0; r.wary = clamp(w0 + (.4 + ab0 * .3 + (r.leadAtPick > 2.6 ? .14 : 0)) * (1 - w0 * .4), 0, 1); }
    const out = pickoffSuccess(r) && Math.random() < .92, lead0 = r.lead || 0;      // 捕手蹲著傳壘比投手牽制難一點點
    const b = baseSpot(i + 1), cv = { x: b.x + (b.x > 0 ? -.5 : b.x < 0 ? .5 : (tgt.x >= 0 ? .7 : -.7)), z: b.z + (i === 1 ? 1.0 : .6) };
    const clr = () => { for (const q of E.runners) { q.pkHold = false; q.pkRate = 0; } tgt.pkRush = false; };
    const hand = () => ({ x: C.x, y: 1.05, z: C.z - .3 });
    for (const q of E.runners) if (q.state === 'on') { q.pkHold = true; q.pkRate = 3; }
    faceRig(C.rig, cv.x, cv.z); try { if (C.rig.anim && C.rig.anim.name === 'cset') C.rig.anim = { name: 'crouch', t: 0, dur: 1e9, opt: { hold: true } }; } catch (e) { }
    if (lead0 > 2.2) { try { toast('牽制！', '#ffe9a0', '#c60'); } catch (e) { } }
    try { say(`捕手${C.pl.name}接球後<em>傳${['一', '二', '三'][i]}壘牽制！</em>`, 1800); } catch (e) { }
    tgt.tx = cv.x; tgt.tz = cv.z; tgt.sp = fspeed(tgt) * 2.4; tgt.wait = 0; tgt.hold = 0; tgt.v = Math.max(tgt.v || 0, 5.5); tgt.pkRush = true;
    const finish = () => { if (!alive2()) return; clr(); prePitch(); };
    const returnBall = () => {
      if (!alive2()) return; const h2 = new THREE.Vector3(); try { pitcherHandPos(h2); } catch (e) { h2.set(P.x, 1.5, P.z); }
      faceRig(tgt.rig, P.x, P.z); tgt.rig.anim = { name: 'throw', t: 0, dur: .3, opt: { hand: 1 } };
      after(.15, () => { if (!alive2()) return; ballTween({ x: cv.x, y: 1.3, z: cv.z }, { x: h2.x, y: h2.y, z: h2.z }, clamp(throwDur(tgt, P), .3, .7), .35, () => { if (!alive2()) return; flowSfx('mitt', .5); P.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; after(.3, finish); }); });
    };
    const tagIt = () => {
      if (!alive()) return; tagAnim(tgt);
      after(.2, () => {
        if (!alive()) return;
        if (out && r.state === 'on' && G.on[i] === r) {
          r.pkHold = false; pickCall(tgt, r, true, 'pick'); if (r.state === 'out') { say(`牽制出局！${r.pl.name}，來不及回壘！`); toast('牽制出局', '#fff', '#f55'); }
          after(1.1, () => { if (!alive2()) return; clr(); if (G.outs >= 3) { endHalf(); } else { cleanupRunners(); G.phase = 'pickoff'; returnBall(); } });
        } else {
          r.pkHold = false; pickCall(tgt, r, false, 'pick'); if (r.state !== 'out' && !G.freeze) say(`牽制，安全上壘！${r.wary > .35 ? '跑者變得更謹慎，離壘縮短了。' : ''}`);
          after(.4, () => { if (r.state === 'out' && alive2()) { clr(); if (G.outs >= 3) { endHalf(); return; } cleanupRunners(); returnBall(); return; } if (!alive()) return; if (r.rig.anim && (r.rig.anim.name === 'slide' || r.rig.anim.name === 'hdive')) r.rig.anim = null; try { faceRig(r.rig, P.x, P.z); } catch (e) { } returnBall(); });
        }
      });
    };
    const throwIt = () => {
      if (!alive()) return; C.rig.anim = { name: 'throw', t: 0, dur: .3, opt: { hand: 1 } };
      after(.1, () => {
        if (!alive()) return; const h = ballMesh.visible ? { x: ballMesh.position.x, y: ballMesh.position.y, z: ballMesh.position.z } : hand(); flowSfx('pick', .85); try { CAMC.shake = Math.max(CAMC.shake || 0, lead0 > 2.2 ? .09 : .04); } catch (e) { }
        r.pkHold = false; r.pkRate = out ? 1.6 : 7; try { const bs = baseSpot(r.from); faceRig(r.rig, bs.x, bs.z); } catch (e) { } if ((r.lead || 0) > 1.7) r.rig.anim = { name: 'hdive', t: 0, dur: Math.min(.6, .2 + (r.lead || 0) * .13), opt: {} }; else r.rig.anim = null;
        setBall(h, true); ballTween(h, { x: cv.x, y: 1.15, z: cv.z }, clamp(throwDur(C, cv) * .8, .25, .65), .35, () => { if (!alive()) return; flowSfx('mitt'); tgt.rig.anim = { name: 'catch', t: 0, dur: .3, opt: {} }; after(.1, tagIt); });
      });
    };
    let el = 0;
    const ready = () => { if (!alive()) return; el += .04; faceRig(C.rig, cv.x, cv.z); if ((el >= .12 && dist2(tgt.x, tgt.z, cv.x, cv.z) < .85) || el >= 1.1) { throwIt(); return; } after(.04, ready); };
    after(.04, ready);
    after(9, () => { if (tok === G.pkTok && !G.over && G.mode === 'play' && G.phase === 'pickoff') { clr(); if (G.outs >= 3) endHalf(); else { cleanupRunners(); prePitch(); } } });      // 保險：流程被打斷時不會卡住
  }
  /* ---------- 包裝引擎函式 ---------- */
  try { const _cd = cpuDeliver; cpuDeliver = function () { if (isMine() && !autoAll && !G.rosinBusy && !G.batFetch) { if (!cur) { if (!shown) open(); return; } } return _cd.apply(this, arguments); }; } catch (e) { console.warn('CCALL：無法包裝 cpuDeliver', e); }
  try { const _ap = aiPickPitch; aiPickPitch = function (p, b) {
    const c = cur;
    if (c && !c.auto && c.pk == null && !G.intWalk) {
      if (c.pitchout) { G.lastPitchout = true; return { id: 'ST', x: side() * 2.15, y: ZC + .2, pitchout: true }; }
      if (c.refuse && c.id) { if (!c.noted) { c.noted = true; sulk(); } G.lastPitchout = false; return _ap.apply(this, arguments); }      // 投手不配合：照電腦原本的選球
      if (c.id && p && p.pitches && p.pitches.some(x => x.id === c.id)) { G.lastPitchout = true; return { id: c.id, x: c.x, y: c.y }; }      // lastPitchout=true：避免電腦臨時改成外角球蓋掉你的指示（doPitch 會重設）
    }
    return _ap.apply(this, arguments);
  }; } catch (e) { console.warn('CCALL：無法包裝 aiPickPitch', e); }
  try { const _pk = aiPickoffThink; aiPickoffThink = function () { const c = cur; if (c && !c.auto) return c.pk != null ? c.pk : -1; return _pk.apply(this, arguments); }; } catch (e) { console.warn('CCALL：無法包裝 aiPickoffThink', e); }
  try { const _dp = doPitch; doPitch = function () { cur = null; return _dp.apply(this, arguments); }; } catch (e) { }
  try { const _dk = doPickoff; doPickoff = function () { cur = null; return _dk.apply(this, arguments); }; } catch (e) { }
  try { const _cr = catcherReturn; catcherReturn = function (cb) { if (!autoAll && holdOK() && !hold) { openHold(_cr, cb); return; } return _cr.apply(this, arguments); }; } catch (e) { console.warn('CCALL：無法包裝 catcherReturn', e); }
  (function watch() { requestAnimationFrame(watch); try { holdTick(); } catch (e) { }; try { if (shown && (!isMine() || G.phase !== 'pre')) hide(); if (!G || G.mode !== 'play' || G.over) { autoAll = false; cur = null; } else if (!isMine() && !shown) cur = null; } catch (e) { } })();
  return { need: () => shown, holding: () => !!hold, isMine, get pending() { return cur; }, get autoAll() { return autoAll; }, reset: () => { cur = null; autoAll = false; hide(); } };
})();
