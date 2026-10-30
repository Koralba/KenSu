/* [第十一版] 手動守備也會有機率觸發「飛身撲接／美技」：球快到、你的野手正朝落點跑但差一點點時，依守備能力、時機（跑向落點的方向）、剩餘距離、球速、雨天擲骰（見 tryDive，DIVE_ON 可關）；成功沿用電腦野手同一套 plan.dive／plan.great（撲接動作＋greatPlay 歡呼／實況）。區網對戰（vsOn）為避免兩台不同步，不啟用。 */
/* [第十版] 生涯模式修正：不再自動把追球權搶給你的角色（修正「我當投手時電腦隊友接到球不傳球」）；你的野手平常維持電腦補位，按方向鍵才接手，先碰到球才算你的（takeChase／搶先撿球）。 */
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
  const DIVE_ON = true;        // 玩家手動守備的美技／飛身撲接：false＝完全停用（還原舊行為）
  const SHOW_CHIP = false;     // 左上角的小按鈕已改放到「更多」選單（#btnAssist）；要還原左上角按鈕，改成 true
  let sel = null, locked = false, lastPlan = null, lastPick = 0, mv = false, layer = null, chip = null; const btns = {};
  try { if (typeof CFG !== 'undefined') CFG.assist = localStorage.getItem(LS) === '1' ? 1 : 0; } catch (e) { }

  const d2 = (a, b, c, d) => Math.hypot(a - c, b - d);
  const allowed = f => !!f && !(f.pl && f.pl.out) && !(G.role && !(f.pl && f.pl.isMe));
  const baseOK = () => !window.__ff && G.mode === 'play' && (vsOn() || (G.human >= 0 && G.human === 1 - G.half)) && !G.easy && !G.assist && !!PL && !PL.foul && !PL.review && !(PL.plan && PL.plan.kind === 'hr');
  const uiOK = () => baseOK() && (!vsOn() || minePitches());      // 連線：只有防守方那支手機顯示搖桿／按鈕
  const live = () => !!PL && (PL.state === 'flight' || PL.state === 'loose');
  function padNeeded() { try { return uiOK() && !!sel && (live() || PL.state === 'held'); } catch (e) { return false; } }
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
    if (plan && live() && plan.f !== g && !G.role) takeChase(g);      // 生涯模式不自動搶追球權（見 takeChase／搶先撿球）
    if (PL && PL.assist === g) PL.assist = null;
  }
  function takeChase(g) {      // 換人／搶球：把「追球者」角色交給 g，原本的追球者改回補位／原地
    const plan = PL && PL.plan; if (!plan || plan.f === g) return;
    const of = plan.f; if (of) { of.chaser = false; of.manual = false; of.tx = of.x; of.tz = of.z; }
    if (PL.cover) for (const k of Object.keys(PL.cover)) if (PL.cover[k] === g) { PL.cover[k] = of; g.cover = null; if (of && /^[1-3]$/.test(k)) { of.cover = +k; const b = baseSpot(+k); of.tx = b.x; of.tz = b.z + .4; of.sp = fspeed(of); of.wait = .1; } }
    plan.f = g; g.chaser = true; plan.dive = false; plan.great = false;
  }
  function newPlay() {
    for (const g of Object.values(E.F)) g._fmDive = false;
    if (sel) { sel.manual = false; sel._fmTook = false; } sel = null; locked = false; if (vsOn()) lastPick = -1;
    const plan = PL.plan; if (!plan || !plan.f) return; let c = null;
    if (allowed(plan.f)) c = plan.f;
    else if (G.role) c = Object.values(E.F).find(allowed) || null;      // 生涯：永遠選取「你自己的角色」，但不會把追球權搶走
    if (c) select(c, false);
  }

  /* ---------- 輸入：方向鍵／手機方向盤 → 相對畫面的世界方向 ---------- */
  function inputDir() { return vsOn() ? (VS.fmCur || null) : rawDir(); }      // 連線：用兩台同一步套用的向量
  function rawDir() {
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
    if (!PL) { for (const g of Object.values(E.F)) g._fmDive = false; if (sel) { sel.manual = false; sel = null; } lastPlan = null; locked = false; mv = false; if (vsOn()) VS.fmCur = null; return; }
    if (!baseOK()) { if (sel) { sel.manual = false; sel._fmTook = false; sel = null; } lastPlan = null; mv = false; return; }
    if (PL.plan !== lastPlan) { const mc = PL.plan && PL.plan.manualChase; lastPlan = PL.plan; if (!mc) newPlay(); }
    const st = PL.state, plan = PL.plan, now = vsOn() ? PL.tAge : performance.now() / 1000;      // 連線：用模擬時間，兩台才一致
    if (st === 'thrown' || st === 'dead' || st === 'hrdone') { if (sel) sel.manual = false; mv = false; return; }
    if (st === 'held' && PL.holder && allowed(PL.holder) && PL.holder !== sel) select(PL.holder, false);
    if (st === 'loose' && PL.looseF && allowed(PL.looseF) && PL.looseF !== sel) select(PL.looseF, false);
    if (live() && !locked && !G.role && now - lastPick > .5) {      // 自動選取：離球（落點）最近的守備員；要比目前這位近 5 公尺以上才換，避免跳來跳去
      const pt = target(); let best = null, bd = 1e9;
      for (const f of Object.values(E.F)) { if (!allowed(f)) continue; const d = d2(f.x, f.z, pt.x, pt.z); if (d < bd) { bd = d; best = f; } }
      if (best && best !== sel && !(G.role && bd > 16) && (!sel || d2(sel.x, sel.z, pt.x, pt.z) - bd > 5)) { select(best, false); lastPick = now; }
    }
    if (!sel) { mv = false; return; }
    const f = sel;
    /* 生涯：你的野手不是電腦指定的追球者，但「先碰到球」就算你的（搶接殺／搶撿滾地球／搶撿漏接的球） */
    if (G.role && f.hasBall !== true && !PL.review && plan && plan.f !== f) {
      const bp = PL.ballPos;
      if (st === 'flight' && bp && plan.f && !plan.f.hasBall && plan.kind !== 'hr') {
        const dxz = d2(f.x, f.z, bp.x, bp.z);
        if (plan.kind === 'catch') { if (bp.y < 2.3 && dxz < 1.5 && PL.t < plan.t) { takeChase(f); plan.t = PL.t; plan.x = f.x; plan.z = f.z; } }
        else if (bp.y < 1.0 && dxz < 1.0) { takeChase(f); plan.t = Math.min(plan.t, PL.t); plan.x = bp.x; plan.z = bp.z; }
      } else if (st === 'loose' && PL.loose && PL.looseF !== f && PL.loose.t > .3 && d2(f.x, f.z, PL.loose.x, PL.loose.z) < 1.2) PL.looseF = f;
    }
    const roleFree = !!G.role && !(PL.plan && PL.plan.f === f);      // 生涯：你的野手目前不是追球者
    f.manual = !roleFree || !!f._fmTook;
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
    const lying = !!(f.pl && f.pl.out) || !!(f.rig && f.rig.anim && (f.rig.anim.name === 'dive' || f.rig.anim.name === 'down'));      // 倒地／撲接動作中（或已受傷）：不能操控移動，動作結束才恢復
    const canMove = !lying && !f._fmDive && (st === 'flight' || st === 'loose' || (st === 'held' && PL.holder === f && !PL.tagChase && !PL.selfTag && !PL.pick));
    const dir = canMove ? inputDir() : null; mv = !!dir;
    if (st === 'flight' && dir && !PL.review) tryDive(f, plan, dir);      // 美技判定（會先於下面的走動設定 tx/tz）
    if (f._fmDive) { mv = false; }
    if (roleFree && dir) { f._fmTook = true; f.manual = true; }      // 一按方向鍵就由你接手；沒按之前維持電腦原本的補位／後援跑位
    if (canMove && f.manual) {
      f.wait = 0; if (st !== 'held') f.hold = 0;
      if (dir) {
        const spd = (st === 'held' ? selfRunSpeed(f) : fspeed(f) * (plan && plan.air && plan.kind === 'catch' ? AIR_SPD : 1.04)) * MANUAL_K, c = clampField(f.x + dir.x * 5, f.z + dir.z * 5);
        f.tx = c.x; f.tz = c.z; f.sp = spd * (.7 + .3 * dir.m); f.chaser = !roleFree && st !== 'held';
      } else { f.tx = f.x; f.tz = f.z; if (st !== 'held') f.chaser = !roleFree; }
    }
  }
  /* 玩家手動守備的美技：球快到（剩 .12～.5 秒）、你的野手是這球的追球者、正朝落點跑、
     只差一點點（正常跑不到、但撲得到）時，擲一次骰；成功就把這球改成 plan.dive＋plan.great，
     之後完全走引擎原本的撲接流程（撲接動作、3.2 公尺內判接到、greatPlay 歡呼與實況）。擲不過＝維持原本判定。 */
  function tryDive(f, plan, dir) {
    if (!DIVE_ON || vsOn() || !dir || !plan || plan._fmDiveTried || plan.dive || plan.robHR || plan.f !== f || f.hasBall || f.pos === 'P') return;
    if (plan.kind !== 'catch' && plan.kind !== 'field') return;
    const tl = plan.t - PL.t; if (tl > .5 || tl < .12) return;
    const dd = d2(f.x, f.z, plan.x, plan.z); if (dd < 1.0 || dd > 4.8) return;      // 太近＝直接接；太遠＝撲不到
    const ux = (plan.x - f.x) / dd, uz = (plan.z - f.z) / dd, dot = dir.x * ux + dir.z * uz; if (dot < .35) return;      // 方向要大致朝向落點（時機）
    plan._fmDiveTried = true;      // 一球只擲一次
    const fl = f.pl.fld || 55, ult = !!f.pl.ultra, spd = Math.max(f.sp || 0, fspeed(f) * MANUAL_K), remain = dd - spd * tl * .9;      // remain＝全速再跑 tl 秒後還差多遠
    if (remain > 3.0) return;
    const res = PL.res || {}, hard = res.bunt ? 0 : clamp(((res.ev || 25) - 27) / 15, 0, 1);
    const base = ult ? .6 : .10 + fl * .0035, timing = .5 + .5 * clamp(dot, 0, 1);
    const sweet = remain <= .3 ? .35 : remain < 2.2 ? 1 : lerp(1, .4, (remain - 2.2) / .8);      // 剛好差一截最容易撲到；本來就跑得到＝只是偶爾順勢撲；差太多機率遞減
    let p = base * timing * sweet * .65 - hard * .06 - rainK() * .1 + clamp((PL.luck || 0) * .01, -.03, .03);
    p = clamp(p, 0, ult ? .6 : .45); if (Math.random() >= p) return;
    plan.dive = true; plan.great = true; f._fmDive = true; f.wait = 0; f.tx = plan.x; f.tz = plan.z; f.sp = Math.max(f.sp || 0, 8.5);      // 往落點撲出去
  }
  function rechase(pl) {      // 球沒接到、AI 本來要換人追球：手動模式改成「你繼續追」
    if (pl !== PL || !sel || !sel.manual || !baseOK()) return false;
    if (G.role && !(PL.plan && PL.plan.f === sel)) return false;      // 生涯：沒接到球時只有「本來就是你在追」才由你繼續追，否則電腦隊友重新追
    const bp = PL.ballPos || { x: sel.x, z: sel.z }, np = { kind: 'chase', f: sel, x: bp.x, z: bp.z, t: PL.t + 1e6, air: false, dive: false, react: .05, missed: true, manualChase: true };
    if (PL.plan && PL.plan.f && PL.plan.f !== sel) PL.plan.f.chaser = false;
    PL.plan = np; lastPlan = np; assignRoles(np); sel.manual = true; sel.wait = 0; sel._fmDive = false; return true;
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
    const mark = document.getElementById('fmMark'), show = uiOK() && live() && sel, showMark = uiOK() && sel && (live() || PL.state === 'held');
    const used = new Set();
    if (show) {
      const pt = target();
      for (const f of Object.values(E.F)) {
        if (f === sel || !allowed(f) || d2(f.x, f.z, pt.x, pt.z) > 48) continue; const p = proj(f.x, 2.5, f.z); if (!p) continue;
        let b = btns[f.pos]; if (!b) { b = btns[f.pos] = document.createElement('div'); b.className = 'fb'; layer.appendChild(b); const go = e => { e.preventDefault(); e.stopPropagation(); const g = E.F[b.dataset.pos]; if (g && uiOK() && live()) { if (vsOn()) VS.tickAct('FMSEL', [g.pos]); else select(g, true); } }; b.addEventListener('pointerdown', go); }
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
  const syncAssistBtn = () => { if (!abtn) return; const t = G.assist ? '🤝 輔助守備：開' : '🎮 輔助守備：關'; if (abtn.textContent !== t) abtn.textContent = t; abtn.classList.toggle('on', !!G.assist); const show = G.mode === 'play' && G.human >= 0 && G.human === 1 - G.half && !G.easy && !vsOn(); if (abtn.style.display !== (show ? '' : 'none')) abtn.style.display = show ? '' : 'none'; };      // 按鈕放在「更多」旁邊（和止滑粉同一排）：只有玩家守備（非簡易模式）時顯示；開啟輔助時亮橘色
  if (abtn) abtn.onclick = () => setAssist(!G.assist);
  requestAnimationFrame(drawUI);
  try { const _up = updatePlay; updatePlay = function (dt) { try { pre(dt); } catch (e) { console.error(e); } return _up.call(this, dt); }; } catch (e) { console.warn('FM：無法包裝 updatePlay', e); }

  return { pre, rechase, padNeeded, select, rawDir, uiOK, vsSel: pos => { const g = E.F[pos]; if (g && baseOK() && live()) select(g, true); }, setAssist, moving: f => !!(mv && f && f === sel), get selected() { return sel; } };
})();
