/* ===== 13g-manual-fielding.js ｜ 手動守備：自己走位撿球、點頭上按鈕換人、可開「輔助防守」還原電腦撿球 =====
   載入順序：13f 與 14 之間（見 FILE_MAP.md）。
   規則：
     - 只在「玩家守備、非簡易模式、輔助防守關」時啟用（輔助防守開＝完全維持原本：電腦自動追球，玩家只選傳壘）。
     - 球打出後自動選取「離球最近」的守備員（球的落點／球目前位置）；方向鍵（↑↓←→）或手機左下方向盤可自由走動。
       方向是「相對於畫面」：往上＝往畫面深處跑。
     - 其他守備員頭上會出現半透明按鈕，點了就把操控權換給他（換人後自動選取暫停到這一球結束）。
     - 球到你的守備員身邊（滾地球／接殺範圍）自動接球；撿到球後仍可繼續走動，也照舊用傳球面板選壘包（走動時傳球倒數暫停）。
     - 生涯模式（G.role）只有「你的角色」可以被操控，其他野手維持電腦。
     - 自動模擬快轉中（window.__ff）停用手動：改由電腦自動追球，否則你的野手會在快轉裡站著不動；快轉在傳球詢問（PL.ask）時會自動停下來還給你。
     - 手機方向盤：13 的觸控拖曳會設定 PAD.f（{vx,vy}），inputDir() 讀它（原本讀的 PAD.v 沒有任何程式設定，所以手機拖曳一直無效）。
   與引擎的接點（其他檔案的小改動）：
     06 steerChaser 遇到 f.manual 不再自動追球；06 askUpdate 走動時暫停倒數；06 clearPlay 清 manual；05 rechaseBall 先問 FM.rechase()；
     11 newGame 設 G.assist；13 的 padOn 加入 FM.padNeeded()、點擊過濾加入 #fmLayer、CFG 預設 assist:0。 */
'use strict';
const FM = (function () {
  const LS = 'cpbl2027.assistDef', keys = {}, _fv = new THREE.Vector3(), _pv = new THREE.Vector3();
  const MANUAL_K = 1.2;      // 玩家手動操控的野手走路／跑步速度倍率（只套用在 pre() 裡「被你操控的那一位」；不動 MOVEK／FIELDK_OF／fspeed，所以電腦守備與 planFielding 的安打／接殺判定完全不變）
  const SHOW_CHIP = false;     // 左上角的小按鈕已改放到「更多」選單（#btnAssist）；要還原左上角按鈕，改成 true
  let sel = null, locked = false, lastPlan = null, lastPick = 0, mv = false, layer = null, chip = null; const btns = {};
  try { if (typeof CFG !== 'undefined') CFG.assist = localStorage.getItem(LS) === '1' ? 1 : 0; } catch (e) { }

  const d2 = (a, b, c, d) => Math.hypot(a - c, b - d);
  const allowed = f => !!f && !(f.pl && f.pl.out) && !(G.role && !(f.pl && f.pl.isMe));
  const baseOK = () => !window.__ff && G.mode === 'play' && G.human >= 0 && G.human === 1 - G.half && !G.easy && !G.assist && !!PL && !PL.foul && !PL.review && !(PL.plan && PL.plan.kind === 'hr');
  const live = () => !!PL && (PL.state === 'flight' || PL.state === 'loose');
  function padNeeded() { try { return baseOK() && !!sel && (live() || PL.state === 'held'); } catch (e) { return false; } }
  function target() {
    if (PL.state === 'loose' && PL.loose) return { x: PL.loose.x, z: PL.loose.z };
    const bp = PL.ballPos; if (bp && bp.y < 2.2) return { x: bp.x, z: bp.z };
    const pn = PL.plan; return pn ? { x: pn.x, z: pn.z } : { x: 0, z: 0 };
  }

  /* ---------- 選取／換人 ---------- */
  function select(g, byUser) {
    if (!g) return; const old = sel, plan = PL && PL.plan;
    if (old && old !== g) { old.manual = false; if (!old.hasBall) { old.tx = old.x; old.tz = old.z; } }
    sel = g; g.manual = true; g.wait = 0; if (byUser) locked = true;
    if (plan && live() && plan.f !== g) {      // 換人：把「追球者」角色交給新選的人，原本的追球者改回補位／原地
      const of = plan.f; if (of) { of.chaser = false; of.manual = false; of.tx = of.x; of.tz = of.z; }
      if (PL.cover) for (const k of Object.keys(PL.cover)) if (PL.cover[k] === g) { PL.cover[k] = of; g.cover = null; if (of && /^[1-3]$/.test(k)) { of.cover = +k; const b = baseSpot(+k); of.tx = b.x; of.tz = b.z + .4; of.sp = fspeed(of); of.wait = .1; } }
      plan.f = g; g.chaser = true; plan.dive = false; plan.great = false;
    }
    if (PL && PL.assist === g) PL.assist = null;
  }
  function newPlay() {
    if (sel) { sel.manual = false; } sel = null; locked = false;
    const plan = PL.plan; if (!plan || !plan.f) return; let c = null;
    if (allowed(plan.f)) c = plan.f;
    else if (G.role) { const me = Object.values(E.F).find(allowed); if (me && d2(me.x, me.z, plan.x, plan.z) < 16) c = me; }
    if (c) select(c, false);
  }

  /* ---------- 輸入：方向鍵／手機方向盤 → 相對畫面的世界方向 ---------- */
  function inputDir() {
    let ix = 0, iy = 0; if (keys.ArrowLeft) ix -= 1; if (keys.ArrowRight) ix += 1; if (keys.ArrowUp) iy += 1; if (keys.ArrowDown) iy -= 1;
    const p = typeof PAD !== 'undefined' && (PAD.f || PAD.v); if (p) { ix += p.vx || 0; iy += -(p.vy || 0); }
    const m = Math.hypot(ix, iy); if (m < .12) return null; if (m > 1) { ix /= m; iy /= m; }
    camera.getWorldDirection(_fv); let fx = _fv.x, fz = _fv.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rx = -fz, rz = fx; return { x: rx * ix + fx * iy, z: rz * ix + fz * iy, m: Math.min(1, m) };
  }
  function clampField(x, z) {
    const r = Math.hypot(x, z), lim = wallRadius(Math.atan2(x, -z) * 180 / Math.PI) - 1.6; if (r > lim) { const k = lim / r; x *= k; z *= k; } return { x, z: Math.min(z, 5) };
  }

  /* ---------- 每幀（在 updatePlay 之前）：自動選取、移動、搶先撿球 ---------- */
  function pre(dt) {
    if (!PL) { if (sel) { sel.manual = false; sel = null; } lastPlan = null; locked = false; mv = false; return; }
    if (!baseOK()) { if (sel) { sel.manual = false; sel = null; } lastPlan = null; mv = false; return; }
    if (PL.plan !== lastPlan) { const mc = PL.plan && PL.plan.manualChase; lastPlan = PL.plan; if (!mc) newPlay(); }
    const st = PL.state, plan = PL.plan, now = performance.now() / 1000;
    if (st === 'thrown' || st === 'dead' || st === 'hrdone') { if (sel) sel.manual = false; mv = false; return; }
    if (st === 'held' && PL.holder && allowed(PL.holder) && PL.holder !== sel) select(PL.holder, false);
    if (st === 'loose' && PL.looseF && allowed(PL.looseF) && PL.looseF !== sel) select(PL.looseF, false);
    if (live() && !locked && now - lastPick > .5) {      // 自動選取：離球（落點）最近的守備員；要比目前這位近 5 公尺以上才換，避免跳來跳去
      const pt = target(); let best = null, bd = 1e9;
      for (const f of Object.values(E.F)) { if (!allowed(f)) continue; const d = d2(f.x, f.z, pt.x, pt.z); if (d < bd) { bd = d; best = f; } }
      if (best && best !== sel && !(G.role && bd > 16) && (!sel || d2(sel.x, sel.z, pt.x, pt.z) - bd > 5)) { select(best, false); lastPick = now; }
    }
    if (!sel) { mv = false; return; }
    const f = sel; f.manual = true;
    /* 搶先撿球：球一進手套範圍就接（不用等到 AI 預定的時間） */
    if (st === 'flight' && plan && !PL.review) {
      const bp = PL.ballPos;
      if (bp && f.hasBall !== true) {
        const dxz = d2(f.x, f.z, bp.x, bp.z);
        if (plan.kind === 'catch') { if (plan.f === f && bp.y < 2.3 && dxz < 1.5 && PL.t < plan.t) { plan.t = PL.t; plan.x = f.x; plan.z = f.z; } }
        else if (plan.f === f && plan.kind !== 'hr' && bp.y < 1.0 && dxz < 1.0) { plan.t = Math.min(plan.t, PL.t); if (plan.manualChase) plan.t = PL.t - 1; plan.x = bp.x; plan.z = bp.z; }
        if (plan.f === f && PL.t >= plan.t - .03 && !plan._mag) {      // 差一點點：把野手拉進手套範圍（接殺 2.9 公尺內、滾地球 2.2 公尺內）
          plan._mag = true; const dd = plan.air ? d2(f.x, f.z, plan.x, plan.z) : dxz;
          if (plan.air && dd > 2 && dd < 2.9) { f.x += (plan.x - f.x) * .55; f.z += (plan.z - f.z) * .55; }
          else if (!plan.air && dd > 1.2 && dd < 2.2) { f.x += (bp.x - f.x) * .6; f.z += (bp.z - f.z) * .6; }
        }
        if (PL.tAge > 30 && plan.kind === 'chase') { f.x = bp.x; f.z = bp.z; plan.t = PL.t - 1; plan.x = bp.x; plan.z = bp.z; }      // 保險：球停了很久還沒撿
      }
    }
    /* 走動 */
    const canMove = st === 'flight' || st === 'loose' || (st === 'held' && PL.holder === f && !PL.tagChase && !PL.selfTag && !PL.pick);
    const dir = canMove ? inputDir() : null; mv = !!dir;
    if (canMove) {
      f.wait = 0; if (st !== 'held') f.hold = 0;
      if (dir) {
        const spd = (st === 'held' ? selfRunSpeed(f) : fspeed(f) * (plan && plan.air && plan.kind === 'catch' ? AIR_SPD : 1.04)) * MANUAL_K, c = clampField(f.x + dir.x * 5, f.z + dir.z * 5);
        f.tx = c.x; f.tz = c.z; f.sp = spd * (.7 + .3 * dir.m); f.chaser = st !== 'held';
      } else { f.tx = f.x; f.tz = f.z; if (st !== 'held') f.chaser = true; }
    }
  }
  function rechase(pl) {      // 球沒接到、AI 本來要換人追球：手動模式改成「你繼續追」
    if (pl !== PL || !sel || !sel.manual || !baseOK()) return false;
    const bp = PL.ballPos || { x: sel.x, z: sel.z }, np = { kind: 'chase', f: sel, x: bp.x, z: bp.z, t: PL.t + 1e6, air: false, dive: false, react: .05, missed: true, manualChase: true };
    if (PL.plan && PL.plan.f && PL.plan.f !== sel) PL.plan.f.chaser = false;
    PL.plan = np; lastPlan = np; assignRoles(np); sel.manual = true; sel.wait = 0; return true;
  }

  /* ---------- 介面：頭上按鈕、操控中標記、輔助防守切換 ---------- */
  function ensureUI() {
    if (layer) return;
    const st = document.createElement('style'); st.id = 'fmStyle';
    st.textContent = `#fmLayer{position:fixed;inset:0;z-index:30;pointer-events:none}
#fmLayer .fb{position:absolute;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.24);border:2px solid rgba(255,255,255,.75);color:#fff;font:700 12px/34px sans-serif;text-align:center;pointer-events:auto;cursor:pointer;display:none;text-shadow:0 1px 2px #000;backdrop-filter:blur(2px)}
#fmLayer .fb:active{background:rgba(255,225,74,.6)}#fmLayer .fm{position:absolute;transform:translate(-50%,-100%);color:#ffe14a;font:700 12px sans-serif;text-align:center;text-shadow:0 1px 3px #000;display:none;white-space:nowrap}
#fmAssist{position:fixed;left:8px;top:calc(56px + env(safe-area-inset-top,0px));z-index:31;display:none;font:600 12px sans-serif;padding:5px 10px;border-radius:14px;border:1px solid #fff6;background:#0b1328cc;color:#fff;cursor:pointer}`;
    document.head.appendChild(st);
    layer = document.createElement('div'); layer.id = 'fmLayer'; document.body.appendChild(layer);
    const m = document.createElement('div'); m.className = 'fm'; m.id = 'fmMark'; layer.appendChild(m);
    chip = document.createElement('button'); chip.id = 'fmAssist'; document.body.appendChild(chip);
    chip.onclick = () => setAssist(!G.assist);
    ['pointerdown', 'touchstart'].forEach(n => chip.addEventListener(n, e => e.stopPropagation()));
  }
  function setAssist(on) {
    G.assist = !!on; if (typeof CFG !== 'undefined') CFG.assist = on ? 1 : 0; try { localStorage.setItem(LS, on ? '1' : '0'); } catch (e) { }
    document.querySelectorAll('.pill[data-k="assist"]').forEach(p => p.classList.toggle('sel', +p.dataset.v === (on ? 1 : 0)));
    if (!on) lastPlan = null; else if (sel) { sel.manual = false; sel = null; }
    try { syncAssistBtn(); } catch (e) { }
    try { say(on ? '輔助防守：開（電腦自動追球，你只選傳壘）' : '輔助防守：關（方向鍵／方向盤自己走位撿球）', 1800); } catch (e) { }
  }
  function proj(x, y, z) { _pv.set(x, y, z).project(camera); if (_pv.z > 1 || _pv.z < -1) return null; return { x: (_pv.x * .5 + .5) * VW(), y: (-_pv.y * .5 + .5) * VH() }; }
  function drawUI() {
    requestAnimationFrame(drawUI); ensureUI(); try { syncAssistBtn(); } catch (e) { }
    const defending = G.mode === 'play' && G.human >= 0 && G.human === 1 - G.half && !G.easy && (!G.role || true);
    chip.style.display = (SHOW_CHIP && defending) ? 'block' : 'none'; if (defending) chip.textContent = G.assist ? '🤝 輔助防守：開' : '🎮 手動防守（點此改輔助）';
    const mark = document.getElementById('fmMark'), show = baseOK() && live() && sel, showMark = baseOK() && sel && (live() || PL.state === 'held');
    const used = new Set();
    if (show) {
      const pt = target();
      for (const f of Object.values(E.F)) {
        if (f === sel || !allowed(f) || d2(f.x, f.z, pt.x, pt.z) > 48) continue; const p = proj(f.x, 2.5, f.z); if (!p) continue;
        let b = btns[f.pos]; if (!b) { b = btns[f.pos] = document.createElement('div'); b.className = 'fb'; layer.appendChild(b); const go = e => { e.preventDefault(); e.stopPropagation(); const g = E.F[b.dataset.pos]; if (g && baseOK() && live()) select(g, true); }; b.addEventListener('pointerdown', go); }
        b.dataset.pos = f.pos; b.textContent = f.pos; b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; b.style.display = 'block'; used.add(f.pos);
      }
    }
    for (const k of Object.keys(btns)) if (!used.has(k)) btns[k].style.display = 'none';
    if (showMark) { const p = proj(sel.x, 2.7, sel.z); if (p) { mark.style.left = p.x + 'px'; mark.style.top = p.y + 'px'; mark.style.display = 'block'; mark.textContent = '▼ ' + sel.pos + '　操控中'; } else mark.style.display = 'none'; } else mark.style.display = 'none';
  }
  window.addEventListener('keydown', e => { if (e.key && e.key.indexOf('Arrow') === 0) { keys[e.key] = true; if (padNeeded()) e.preventDefault(); } }, true);
  window.addEventListener('keyup', e => { if (e.key && e.key.indexOf('Arrow') === 0) keys[e.key] = false; }, true);
  window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
  document.querySelectorAll('.pill[data-k="assist"]').forEach(p => p.classList.toggle('sel', +p.dataset.v === (typeof CFG !== 'undefined' && CFG.assist ? 1 : 0)));
  document.querySelectorAll('.pill[data-k="assist"]').forEach(p => p.addEventListener('click', () => { try { localStorage.setItem(LS, p.dataset.v); } catch (e) { } }));      // 賽前選單的選擇也記住
  /* 「更多」旁邊（#acts 列，和止滑粉同一排）的輔助守備開關：點一下切換手動／輔助，按鈕文字與亮燈跟著目前狀態 */
  const abtn = document.getElementById('btnAssist');
  const syncAssistBtn = () => { if (!abtn) return; const t = G.assist ? '🤝 輔助守備：開' : '🎮 輔助守備：關'; if (abtn.textContent !== t) abtn.textContent = t; abtn.classList.toggle('on', !!G.assist); const show = G.mode === 'play' && G.human >= 0 && G.human === 1 - G.half && !G.easy; if (abtn.style.display !== (show ? '' : 'none')) abtn.style.display = show ? '' : 'none'; };      // 按鈕放在「更多」旁邊（和止滑粉同一排）：只有玩家守備（非簡易模式）時顯示；開啟輔助時亮橘色
  if (abtn) abtn.onclick = () => setAssist(!G.assist);
  requestAnimationFrame(drawUI);
  try { const _up = updatePlay; updatePlay = function (dt) { try { pre(dt); } catch (e) { console.error(e); } return _up.call(this, dt); }; } catch (e) { console.warn('FM：無法包裝 updatePlay', e); }

  return { pre, rechase, padNeeded, select, setAssist, moving: f => !!(mv && f && f === sel), get selected() { return sel; } };
})();
