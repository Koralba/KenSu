/* [v1.4.2] 生涯模式守備：①投球前（就定位後）玩家角色可用方向鍵／手機方向盤在定位點附近走動（內野 ROAM_IF 公尺、外野 ROAM_OF 公尺，見 roam()），下一球不會被「回到站位」強制拉回（包裝 fmReady）；②球一打出去按方向鍵就立刻接手（起跑不再慢半拍）；③隊友持球／傳球中也能走位（接球者與傳球者除外）。 */
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
  const DIVE_ON = false;        // 玩家手動守備的美技／飛身撲接：false＝完全停用（還原舊行為）
  const ROAM_ON = true;       // v1.4.2：生涯模式投球前可在定位點附近走動（false＝還原：投球前不能動）
  const ROAM_IF = 4.0, ROAM_OF = 12.0;      // 離定位點最遠可走幾公尺（內野／外野）
  const ROAM_SPD_IF = 3.8, ROAM_SPD_OF = 4.8;      // 投球前的走動速度（公尺／秒）
  const SHOW_CHIP = false;     // 左上角的小按鈕已改放到「更多」選單（#btnAssist）；要還原左上角按鈕，改成 true
  let sel = null, locked = false, lastPlan = null, lastPick = 0, mv = false, layer = null, chip = null; const btns = {};
  try { if (typeof CFG !== 'undefined') CFG.assist = localStorage.getItem(LS) === '1' ? 1 : 0; } catch (e) { }

  const d2 = (a, b, c, d) => Math.hypot(a - c, b - d);
  const allowed = f => !!f && !(f.pl && f.pl.out) && !(G.role && !(f.pl && f.pl.isMe));
  const baseOK = () => !window.__ff && G.mode === 'play' && (vsOn() || (G.human >= 0 && G.human === 1 - G.half)) && !G.easy && !G.assist && !!PL && !PL.foul && !PL.review && !(PL.plan && PL.plan.kind === 'hr');
  const uiOK = () => baseOK() && (!vsOn() || minePitches());      // 連線：只有防守方那支手機顯示搖桿／按鈕
  const live = () => !!PL && (PL.state === 'flight' || PL.state === 'loose');
  const flowing = () => live() || PL.state === 'held' || (!!G.role && PL.state === 'thrown');      // 球在場內進行中（生涯：傳球中也算，讓你的野手能走位補位）
  const isOFpos = p => p === 'LF' || p === 'CF' || p === 'RF';
  /* v1.4.2 投球前走位：回傳「現在可以自己微調站位」的生涯野手（投手／捕手不參與），否則 null */
  function roamer() {
    try {
      if (!ROAM_ON || window.__ff || PL || !G.role || G.mode !== 'play' || G.over || G.easy || G.assist || G.freeze || vsOn()) return null;
      if (!(G.human >= 0 && G.human === 1 - G.half) || G.intWalk) return null;
      if (G.phase !== 'pre' && G.phase !== 'windup' && G.phase !== 'flight') return null;
      if (typeof uiHold === 'function' && uiHold()) return null;
      if (E.walk || E.rage || (typeof EV !== 'undefined' && EV && (EV.brawl || EV.abs))) return null;
      const f = Object.values(E.F).find(g => g && g.pl && g.pl.isMe && g.pos !== 'P' && g.pos !== 'C');
      if (!f || f.pl.out || f.hasBall || f.hold > 0 || f.busy > 0 || f.pkRush || G.phase === 'pickoff') return null;
      const an = f.rig && f.rig.anim; if (an && (an.name === 'down' || an.name === 'dive' || (typeof FMV !== 'undefined' && FMV.LYING && FMV.LYING[an.name]))) return null;
      return f;
    } catch (e) { return null; }
  }
  let roamF = null;
  function roam() {
    const f = roamer(); if (!f) return;      // 不在可走位階段（兩球之間的轉場等）：保留 _roamed，讓 fmReady 仍視為已就位
    if (roamF && roamF !== f) roamF._roamed = false; roamF = f;
    const q = formationPos(f.pos), R = isOFpos(f.pos) ? ROAM_OF : ROAM_IF;
    if (f._roamed && f._roamT && (Math.abs(f.tx - f._roamT.x) > .02 || Math.abs(f.tz - f._roamT.z) > .02)) f._roamed = false;      // 別的程式（換打者重設站位、補位、牽制…）改了目標：放手交還電腦
    const dir = rawDir();
    if (dir) {
      let tx = f.x + dir.x * 5, tz = f.z + dir.z * 5; const dx = tx - q.x, dz = tz - q.z, dd = Math.hypot(dx, dz);
      if (dd > R) { tx = q.x + dx / dd * R; tz = q.z + dz / dd * R; }      // 離定位點太遠就停在邊界
      const c = clampField(tx, tz); f.tx = c.x; f.tz = c.z; f.sp = (isOFpos(f.pos) ? ROAM_SPD_OF : ROAM_SPD_IF) * (.6 + .4 * dir.m); f.wait = 0; f.hold = 0; f._roamed = true; f._roamT = { x: c.x, z: c.z };
      try { if (!window.__fmRoamHint && localStorage.getItem('cpbl2027.roamHint') !== '1') { window.__fmRoamHint = 1; localStorage.setItem('cpbl2027.roamHint', '1'); say('投球前可用方向鍵／方向盤在定位點附近微調站位', 2600); } } catch (e) { }      // 只提示一次
    } else if (f._roamed) { f.tx = f.x; f.tz = f.z; f._roamT = { x: f.x, z: f.z }; }      // 放開方向鍵：站在原地（不會自己走回定位點）
  }
  const roamedF = () => { try { if (!ROAM_ON || !G.role || G.assist || G.easy || vsOn()) return null; return Object.values(E.F).find(g => g && g._roamed && g.pl && g.pl.isMe) || null; } catch (e) { return null; } };      // 目前站在「自己調過的位置」上的生涯野手
  function padNeeded() { try { if (roamer()) return true; return uiOK() && !!sel && flowing(); } catch (e) { return false; } }
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
    if (!PL) { for (const g of Object.values(E.F)) g._fmDive = false; if (sel) { sel.manual = false; sel = null; } lastPlan = null; locked = false; mv = false; if (vsOn()) VS.fmCur = null; try { roam(); } catch (e) { console.error(e); } return; }
    if (roamF) { roamF._roamed = false; roamF = null; }      // 球打出去了：投球前走位結束，交給下面的守備流程
    if (!baseOK()) { if (sel) { sel.manual = false; sel._fmTook = false; sel = null; } lastPlan = null; mv = false; return; }
    if (PL.plan !== lastPlan) { const mc = PL.plan && PL.plan.manualChase; lastPlan = PL.plan; if (!mc) newPlay(); }
    const st = PL.state, plan = PL.plan, now = vsOn() ? PL.tAge : performance.now() / 1000;      // 連線：用模擬時間，兩台才一致
    const freeThrown = st === 'thrown' && !!G.role && !!sel && !PL.review && !(PL.thr && (PL.thr.to === sel || PL.thr.from === sel));      // v1.4.2 生涯：傳球途中你的野手（不是傳球者／接球者）也能走位
    if (st === 'dead' || st === 'hrdone' || (st === 'thrown' && !freeThrown)) { if (sel) sel.manual = false; mv = false; return; }
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
    const freeRun = !!G.role && f.hasBall !== true && ((st === 'held' && !!PL.holder && PL.holder !== f) || (st === 'thrown' && freeThrown));      // v1.4.2 球在隊友手上／傳球中：你的野手可走位補位，但沒按方向鍵前維持電腦跑位
    const roleFree = !!G.role && (freeRun || !(PL.plan && PL.plan.f === f));      // 生涯：你的野手目前不是追球者
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
    const lying = !!(f.pl && f.pl.out) || (f._fmLockUntil > PL.tAge) || !!(f.rig && f.rig.anim && (f.rig.anim.name === 'dive' || f.rig.anim.name === 'down' || (typeof FMV !== 'undefined' && FMV.LYING[f.rig.anim.name])));      // 倒地／撲接動作中（或已受傷）：不能操控移動，動作結束才恢復
    const canMove = !lying && !f._fmDive && (st === 'flight' || st === 'loose' || freeRun || (st === 'held' && PL.holder === f && !PL.tagChase && !PL.selfTag && !PL.pick));
    const dir = canMove ? inputDir() : null; mv = !!dir;
    if (st === 'flight' && dir && !PL.review) tryDive(f, plan, dir);      // 美技判定（會先於下面的走動設定 tx/tz）
    if (f._fmDive) { mv = false; }
    if (roleFree && dir) { if (!f._fmTook) { f.v = Math.max(f.v || 0, 2.4); f.wait = 0; f.hold = 0; } f._fmTook = true; f.manual = true; }      // 一按方向鍵立刻起跑（先給一點初速，不再慢半拍）      // 一按方向鍵就由你接手；沒按之前維持電腦原本的補位／後援跑位
    if (canMove && f.manual) {
      f.wait = 0; if (st !== 'held') f.hold = 0;
      if (dir) {
        const spd = (st === 'held' ? selfRunSpeed(f) : fspeed(f) * (plan && plan.air && plan.kind === 'catch' ? AIR_SPD : 1.04)) * MANUAL_K, c = clampField(f.x + dir.x * 5, f.z + dir.z * 5);
        f.tx = c.x; f.tz = c.z; f.sp = spd * (.7 + .3 * dir.m); f.chaser = !roleFree && (st === 'flight' || st === 'loose');
      } else { f.tx = f.x; f.tz = f.z; if (st === 'flight' || st === 'loose') f.chaser = !roleFree; }
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
    if (sel._fmWhiff === pl && ((sel._fmLockUntil || 0) > pl.tAge || (sel.hold || 0) > 0)) return false;      // v1.2.19：空撲後趴在地上的人不能繼續追，改由電腦挑最快能攔到球的野手
    if (G.role && !(PL.plan && PL.plan.f === sel)) return false;      // 生涯：沒接到球時只有「本來就是你在追」才由你繼續追，否則電腦隊友重新追
    const bp = PL.ballPos || { x: sel.x, z: sel.z }, np = { kind: 'chase', f: sel, x: bp.x, z: bp.z, t: PL.t + 1e6, air: false, dive: false, react: .05, missed: true, manualChase: true };
    if (PL.plan && PL.plan.f && PL.plan.f !== sel) PL.plan.f.chaser = false;
    PL.plan = np; lastPlan = np; assignRoles(np); sel.manual = true; sel.wait = 0; sel._fmDive = false; return true;
  }


  /* ================= v1.2.16 防守美技鍵（X／畫面右側「美技」鈕）=================
     球快到你的野手時按下：依「球的高度／距離／球速、野手守備能力與跑速、按鍵時機」判斷這一球能不能做出美技，
       高球（約 1.8 公尺以上）→ 跳接；低飛球／滾地球、距離在撲得到的範圍 → 撲接（外野手跑著＝滑接）。
     條件合理＋守備能力不太低（fld 約 42 以上才有機率，能力越高越穩）＋時機對（動作的「接球瞬間」要對到球到手套的瞬間）→ 成功：這球改成美技，沿用 plan.dive／plan.great（撲接／跳接／滑接動作＋greatPlay 歡呼）。
     條件不合理（球太遠／太高／太早／太晚／能力太低）→ 野手仍會做出動作（亂撲向地上、原地跳起、原地滑一下），但接不到，之後趴地／落地要一段時間才能再動。
     球本來就接得到卻硬撲：動作照做，但沒有美技加成、起身慢、失誤機率上升。一球只能按一次；區網對戰、快轉、簡易模式停用。輔助防守開時＝作用在電腦指定的追球者（若是你的角色）。 */
  const MV_ON = true;
  function moveActor() {
    if (!MV_ON || window.__ff || vsOn() || G.mode !== 'play' || !PL || G.human < 0 || G.human !== 1 - G.half || G.easy) return null;
    if ((PL.state !== 'flight' && PL.state !== 'loose') || PL.foul || PL.review || PL.done || (PL.plan && PL.plan.grd)) return null;      // v1.3.10：全壘打球也能按美技（貼牆跳接搶救）
    const c = (sel && sel.manual && allowed(sel)) ? sel : (PL.plan && allowed(PL.plan.f) ? PL.plan.f : null);
    if (!c || c.hasBall || c._fmUsed === PL || c._fmLockUntil > PL.tAge) return null;
    const an = c.rig && c.rig.anim; if (an && (an.name === 'down' || an.name === 'dive' || (typeof FMV !== 'undefined' && FMV.LYING[an.name]))) return null;
    return c;
  }
  function evalMove(f) {      // 回傳 { mode, p, tc, x, z, y, unneeded, why }
    const sim = PL.sim, o = {}, fl = f.pl.fld || 55, ult = !!f.pl.ultra, isOFp = f.pos === 'LF' || f.pos === 'CF' || f.pos === 'RF', WH = (typeof WALL_H === 'number') ? WALL_H : 5.4;
    const spd = Math.max(f.v || 0, fspeed(f) * MANUAL_K * .85), res = PL.res || {}, hard = res.bunt ? 0 : clamp(((res.ev || 25) - 27) / 15, 0, 1);
    const ab = ult ? 1 : fl < 42 ? 0 : Math.pow(clamp((fl - 40) / 50, 0, 1), .8);      // 守備能力：太低＝不會成功
    let best = null;
    if (PL.state === 'flight' && sim && sim.S && sim.S.length) {
      const tEnd = Math.min(sim.tEnd || 9, PL.t + 1.1);
      for (let t = PL.t + .14; t <= tEnd; t += .03) {
        sampleAt(sim.S, t, o);
        const rad = Math.hypot(o.x, o.z), wr = wallRadius(Math.atan2(o.x, -o.z) * 180 / Math.PI), nearW = isOFp && rad > wr - 2.6 && rad < wr + 1.4 && o.y > 2.4 && o.y <= WH + 1.6 && !(sim.wallT && t > sim.wallT + .05);      // v1.3.10：球在全壘打牆邊、高度在牆頭附近＝貼牆跳接的接球點
        if (o.y > 3.9 && !nearW) continue; const dtt = t - PL.t, d = d2(f.x, f.z, o.x, o.z), deff = Math.max(0, d - spd * Math.max(0, dtt - .12) * .9);
        const tryM = (mode, reach, lead, ok, ov) => {
          if (!ok || dtt < lead - .12) return; const m = dtt - lead, timing = clamp(1 - Math.abs(m > 0 ? m : m * 1.6) / .24, 0, 1), dd = ov ? ov.deff : deff, ratio = dd / reach;
          const fit = ratio >= 1 ? 0 : ratio <= .5 ? 1 : 1 - Math.pow((ratio - .5) / .5, 1.4), sc = fit * timing;
          if (!best || sc > best.sc || (sc === best.sc && ratio < best.ratio)) best = { mode, sc, fit, timing, ratio, tc: t, x: ov ? ov.x : o.x, z: ov ? ov.z : o.z, y: o.y, deff: dd };
        };
        if (nearW) { const kk = Math.min(1, (wr - .9) / Math.max(rad, 1)), wx = o.x * kk, wz = o.z * kk, dW = Math.max(0, d2(f.x, f.z, wx, wz) - spd * Math.max(0, dtt - .12) * .9); tryM('wall', 1.7 + fl * .006 + (ult ? .9 : 0), .42, o.y <= WH + .7 + fl * .004 + (ult ? .5 : 0), { x: wx, z: wz, deff: dW }); }
        const maxY = 2.45 + fl * .008 + (ult ? .3 : 0);
        tryM('jump', 1.1 + fl * .004 + (ult ? .3 : 0), .4, o.y >= 1.75 && o.y <= maxY);
        const mvq = (f.v || 0) > 3.2, reachD = Math.min(3.4, 2.5 + fl * .01 + (ult ? .4 : 0));
        tryM('slide', reachD + .3, .3, isOFp && mvq && o.y <= 1.05 && deff > 1.0);
        tryM('dive', reachD, .3, o.y <= 1.45);
      }
    }
    const bp = PL.ballPos || { x: f.x, y: 0, z: f.z }, plan = PL.plan;
    if (!best && plan && plan.kind === 'hr' && !plan.grd) {      // v1.3.10：全壘打球太高／太遠搆不到：外野手仍然會貼牆跳起來伸手（內野手原地跳），只是接不到
      const hx = plan.x != null ? plan.x : bp.x, hz = plan.z != null ? plan.z : bp.z;
      return { mode: isOFp ? 'wall' : 'jump', p: 0, tc: PL.t + Math.max(.45, Math.min(1.2, (plan.t || PL.t + .6) - PL.t)), x: hx, z: hz, y: (plan.over && plan.over.y) || bp.y, why: 'high' };
    }
    if (!best) {      // 沒有任何合理的接球點：依球「現在」的樣子決定亂撲的動作
      const m = (bp.y > 1.9 && d2(f.x, f.z, bp.x, bp.z) < 7) ? 'jump' : (isOFp && (f.v || 0) > 3.2) ? 'slide' : 'dive';
      return { mode: m, p: 0, tc: PL.t + .4, x: bp.x, z: bp.z, y: bp.y, why: 'none' };
    }
    let p = ab * best.fit * best.timing * (1 - hard * .22) * (1 - rainK() * .15) * .92 + clamp((PL.luck || 0) * .01, -.03, .03);
    if (best.mode === 'wall') p *= clamp(1 - (best.y - 2.8) / (WH + .8 - 2.8 + .6), .15, 1) * .8;      // 貼牆跳接：球越高越難
    p = clamp(p, 0, ult ? .95 : .85); if (best.fit <= 0 || best.timing <= 0) p = 0;
    const easy0 = !!plan && plan.f === f && (plan.kind === 'catch' || plan.kind === 'field') && best.deff < .7;      // 本來就接得到
    const easy = easy0 && best.timing > 0;      // v1.2.18：本來接得到的球也要看按鍵時機——太早／太晚（差超過 .24 s）＝空撲，不再必成功
    return { mode: best.mode, p: easy ? 1 : (easy0 ? 0 : p), tc: best.tc, x: best.x, z: best.z, y: best.y, unneeded: easy, why: best.fit <= 0 ? 'far' : best.timing <= 0 ? 'timing' : ab === 0 ? 'weak' : '' };
  }
  function undoHR() {      // 全壘打被玩家的野手搶救：擊球時已把打者／跑者設成「全壘打跑壘」，這裡還原成一般高飛球（跑者回壘等接殺、打者朝一壘跑，接到就出局）
    try {
      if (typeof CAMC !== 'undefined' && CAMC.mode === 'hrfly') CAMC.mode = 'play';      // 鏡頭已切到全壘打追焦的話切回一般畫面
      if (PL.cl) PL.cl.hr = false;
      for (const r of E.runners) {
        if (r.state !== 'run') continue;
        if (r.bat) { if (r.goal === 4) { r.goal = 1; r.spd /= .86; } continue; }
        if (r.from >= 1 && r.from <= 3) { r.to = r.from + 1; r.forceBase = r.from + 1; r.goal = r.from + 1; r.isForce = true; }
      }
      if (typeof recallRunners === 'function') recallRunners();
    } catch (e) { }
  }
  function pressMove() {
    const f = moveActor(); if (!f) return false; f._fmUsed = PL;
    const plan = PL.plan, sim = PL.sim, ev = evalMove(f), ok = Math.random() < ev.p, tl = Math.max(0, ev.tc - PL.t);
    const nm = `${POS_FULL[f.pos]}${f.pl.name}`;
    f.wait = 0; f.hold = 0; f._fmDive = true; try { if (f.rig.anim && f.rig.anim.name === 'stance') f.rig.anim = null; } catch (e) { }
    if (ok && plan && PL.state === 'flight') {
      if (plan.f !== f) takeChase(f);
      const air = ev.y > .45 && (!sim.first || ev.tc < sim.first.t - .03);
      plan.f = f; plan.x = ev.x; plan.z = ev.z; plan.y = ev.y; plan.t = ev.tc; plan.react = .05; delete plan.missed; plan.kind = air ? 'catch' : 'field'; plan.air = air;
      plan.dive = true; plan.great = !ev.unneeded; plan.fmMove = ev.mode; plan.failDive = null; plan.failedDive = false; plan.superTry = false; plan.leap = false;
      if (ev.mode === 'wall') { plan.robHR = true; plan.kind = 'catch'; plan.air = true; plan.miss = null; plan.great = true; undoHR(); }      // v1.3.10：貼牆跳接成功＝把全壘打（或牆邊的球）搶回來：球不算全壘打，打者與跑者改走一般飛球接殺流程
      f.chaser = true; f.tx = ev.x; f.tz = ev.z; f.sp = Math.max(f.sp || 0, 8.6);
      f.fmvPre = plan; f.rig.anim = FMV.startAnim(f, ev.mode, tl, { x: ev.x, z: ev.z, y: ev.y, air });
      f._fmLockUntil = PL.tAge + f.rig.anim.dur * .8;
      if (ev.unneeded) { f.hold = .3; try { say(`<em>${nm}${ev.mode === 'jump' ? '本來站著就能接，卻多此一舉跳起來' : '本來可以輕鬆處理，卻飛撲出去'}，起身慢了一些。</em>`, 1800); } catch (e) { } }
      return true;
    }
    // 失敗／不合理：動作照做，但接不到、之後要一段時間才能動
    const air = ev.y > .45; f.fmvPre = plan || null; f._fmWhiff = PL; if (plan) plan.fmWhiff = f; f.rig.anim = FMV.startAnim(f, ev.mode, tl, { x: ev.x, z: ev.z, y: ev.y, air, miss: true });      // v1.2.19：空撲標記——這個人不能再「接到」這球，球交給最快能攔到的野手（見 06 的 plan.fmWhiff、05 的 rechaseBall）
    f._fmLockUntil = PL.tAge + f.rig.anim.dur * .85; f.tx = f.x; f.tz = f.z; f.chaser = false; f.hold = (ev.mode === 'jump' || ev.mode === 'wall') ? .5 : .95;
    const why = ev.why === 'high' ? '球飛得又高又遠，' : ev.why === 'weak' ? '防守能力不夠，' : ev.why === 'far' ? '球太遠、太高或太低，' : ev.why === 'timing' ? '時機不對，' : ev.why === 'none' ? '根本構不到球，' : '運氣差一點，';
    try { toast(ev.mode === 'wall' ? '貼牆跳接落空' : ev.mode === 'jump' ? '跳接落空' : ev.mode === 'slide' ? '滑接落空' : '撲接落空', '#fff', '#8a5ad8'); say(`<em>${nm}${why}${ev.mode === 'wall' ? '貼著牆壁躍起伸長了手套，球從上方飛過了牆頭。' : ev.mode === 'jump' ? '原地跳起來卻什麼也沒碰到。' : ev.mode === 'slide' ? '滑了一下，球從身邊過去了。' : '往地上亂撲了一下，球沒接到！'}</em>`, 2200); } catch (e) { }
    return true;
  }

  /* ---------- 介面：頭上按鈕、操控中標記、輔助防守切換 ---------- */
  /* v1.2.16：#fmMove 避開其他可見按鈕（#acts 列、輔助守備、方向盤…）：預設在右側距底 170px，重疊就往上推，直到不重疊；每 20 幀重算一次 */
  function placeMove(xb) {
    if (xb._pl > 0 && --xb._pl) return; xb._pl = 20;
    try {
      xb.style.bottom = ''; const base = parseFloat(getComputedStyle(xb).bottom) || 170, others = [];
      for (const e of document.querySelectorAll('#acts button,#acts .btn,#btnAssist,#pad,#fmPad,.padRing,#hud button,#fmLayer .fb')) { if (e === xb || xb.contains(e)) continue; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue; const q = e.getBoundingClientRect(); if (q.width >= 8 && q.height >= 8) others.push(q); }
      let bot = base; const H = innerHeight, w = 72;
      for (let k = 0; k < 10; k++) {
        const r = xb.getBoundingClientRect(), top = H - bot - w, bottom = H - bot; let hit = null;
        for (const q of others) if (q.left < r.right && q.right > r.left && q.top < bottom && q.bottom > top) { if (!hit || q.top < hit.top) hit = q; }
        if (!hit) break; bot = H - hit.top + 10;
        if (bot + w > H - 8) { bot = base; break; }
      }
      xb.style.bottom = bot + 'px';
    } catch (e) { }
  }
  function ensureUI() {
    if (layer) return;
    const st = document.createElement('style'); st.id = 'fmStyle';
    st.textContent = `#fmLayer{position:fixed;inset:0;z-index:30;pointer-events:none}
#fmLayer .fb{position:absolute;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.24);border:2px solid rgba(255,255,255,.75);color:#fff;font:700 12px/34px sans-serif;text-align:center;pointer-events:auto;cursor:pointer;display:none;text-shadow:0 1px 2px #000;backdrop-filter:blur(2px)}
#fmLayer .fb:active{background:rgba(255,225,74,.6)}#fmLayer .fm{position:absolute;transform:translate(-50%,-100%);color:#ffe14a;font:700 12px sans-serif;text-align:center;text-shadow:0 1px 3px #000;display:none;white-space:nowrap}
#fmLayer .fx{position:fixed;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(170px + env(safe-area-inset-bottom,0px));width:72px;height:72px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe66a,#f08a10);border:3px solid #fff;color:#4a2300;font:900 15px/1.1 sans-serif;display:none;align-items:center;justify-content:center;text-align:center;pointer-events:auto;cursor:pointer;box-shadow:0 3px 12px #000a;animation:fmPulse .7s infinite alternate;user-select:none;-webkit-user-select:none;touch-action:manipulation}
#fmLayer .fx small{display:block;font-size:10px;font-weight:700;opacity:.8}@keyframes fmPulse{to{transform:scale(1.08)}}#fmLayer .fx:active{filter:brightness(1.3)}
#fmAssist{position:fixed;left:8px;top:calc(56px + env(safe-area-inset-top,0px));z-index:31;display:none;font:600 12px sans-serif;padding:5px 10px;border-radius:14px;border:1px solid #fff6;background:#0b1328cc;color:#fff;cursor:pointer}`;
    document.head.appendChild(st);
    layer = document.createElement('div'); layer.id = 'fmLayer'; document.body.appendChild(layer);
    const m = document.createElement('div'); m.className = 'fm'; m.id = 'fmMark'; layer.appendChild(m);
    const xb = document.createElement('div'); xb.className = 'fx'; xb.id = 'fmMove'; xb.innerHTML = '<span>美技<small>X</small></span>'; layer.appendChild(xb);
    const gx = e => { e.preventDefault(); e.stopPropagation(); pressMove(); }; xb.addEventListener('pointerdown', gx);
    chip = document.createElement('button'); chip.id = 'fmAssist'; document.body.appendChild(chip);
    chip.onclick = () => setAssist(!G.assist);
    ['pointerdown', 'touchstart'].forEach(n => chip.addEventListener(n, e => e.stopPropagation()));
  }
  function setAssist(on) {
    G.assist = !!on; if (typeof CFG !== 'undefined') CFG.assist = on ? 1 : 0; try { localStorage.setItem(LS, on ? '1' : '0'); } catch (e) { }
    document.querySelectorAll('.pill[data-k="assist"]').forEach(p => p.classList.toggle('sel', +p.dataset.v === (on ? 1 : 0)));
    if (!on) lastPlan = null; else if (sel) { sel.manual = false; sel = null; }
    try { syncAssistBtn(); } catch (e) { }
    try { say(on ? '輔助防守：開（電腦自動追球；有跑者時可快點傳球面板，沒點電腦自動處理）' : '輔助防守：關（方向鍵／方向盤自己走位撿球）', 1800); } catch (e) { }
  }
  function proj(x, y, z) { _pv.set(x, y, z).project(camera); if (_pv.z > 1 || _pv.z < -1) return null; return { x: (_pv.x * .5 + .5) * VW(), y: (-_pv.y * .5 + .5) * VH() }; }
  function drawUI() {
    requestAnimationFrame(drawUI); ensureUI(); try { syncAssistBtn(); } catch (e) { }
    const defending = G.mode === 'play' && G.human >= 0 && G.human === 1 - G.half && !G.easy && (!G.role || true);
    chip.style.display = (SHOW_CHIP && defending) ? 'block' : 'none'; if (defending) chip.textContent = G.assist ? '🤝 輔助防守：開' : '🎮 手動防守（點此改輔助）';
    const mark = document.getElementById('fmMark'), show = uiOK() && live() && sel, showMark = uiOK() && sel && flowing(), rf = roamer();
    { const xb = document.getElementById('fmMove'); if (xb) { let on = false; try { on = !!moveActor(); } catch (e) { } const useAct = on && IS_TOUCH; /* 觸控：美技鍵改放在投球圓鈕位置（#btnAct，見 13-ui-input-menu） */ xb.style.display = on && !useAct ? 'flex' : 'none'; if (on && !useAct) placeMove(xb); else xb._pl = 0; } }
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
    if (showMark) { const p = proj(sel.x, 2.7, sel.z); if (p) { mark.style.left = p.x + 'px'; mark.style.top = p.y + 'px'; mark.style.display = 'block'; mark.textContent = '▼ ' + sel.pos + '　操控中'; } else mark.style.display = 'none'; }
    else if (rf && !PL) { const p = proj(rf.x, 2.7, rf.z); if (p) { mark.style.left = p.x + 'px'; mark.style.top = p.y + 'px'; mark.style.display = 'block'; mark.textContent = '▼ ' + rf.pos + '　可自己走位'; } else mark.style.display = 'none'; }      // v1.4.2 投球前：頭上提示可以微調站位
    else mark.style.display = 'none';
  }
  window.addEventListener('keydown', e => {      // 方向鍵（移動）＋ X 鍵（防守美技，v1.2.16）合併成一個監聽器
    if (e.key && e.key.indexOf('Arrow') === 0) { keys[e.key] = true; if (padNeeded()) e.preventDefault(); return; }
    if ((e.key === 'x' || e.key === 'X') && !e.repeat && !e.ctrlKey && !e.metaKey) { let on = false; try { on = !!moveActor(); } catch (er) { } if (on) { e.preventDefault(); pressMove(); } }
  }, true);
  window.addEventListener('keyup', e => { if (e.key && e.key.indexOf('Arrow') === 0) keys[e.key] = false; }, true);
  window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
  document.querySelectorAll('.pill[data-k="assist"]').forEach(p => p.classList.toggle('sel', +p.dataset.v === (typeof CFG !== 'undefined' && CFG.assist ? 1 : 0)));
  document.querySelectorAll('.pill[data-k="assist"]').forEach(p => p.addEventListener('click', () => { try { localStorage.setItem(LS, p.dataset.v); } catch (e) { } }));      // 賽前選單的選擇也記住
  /* 「更多」旁邊（#acts 列，和止滑粉同一排）的輔助守備開關：點一下切換手動／輔助，按鈕文字與亮燈跟著目前狀態 */
  const abtn = document.getElementById('btnAssist');
  const syncAssistBtn = () => { if (!abtn) return; const t = G.assist ? '🤝 輔助守備：開' : '🎮 輔助守備：關'; if (abtn.textContent !== t) abtn.textContent = t; abtn.classList.toggle('on', !!G.assist); const show = G.mode === 'play' && G.human >= 0 && G.human === 1 - G.half && !G.easy && !vsOn(); if (abtn.style.display !== (show ? '' : 'none')) abtn.style.display = show ? '' : 'none'; };      // 按鈕放在「更多」旁邊（和止滑粉同一排）：只有玩家守備（非簡易模式）時顯示；開啟輔助時亮橘色
  if (abtn) abtn.onclick = () => setAssist(!G.assist);
  requestAnimationFrame(drawUI);
  /* v1.4.2：下一球開始前 11 的 fmReady() 要求所有野手回到定位點 1 公尺內，否則全員「快速回位」（會把你剛調好的站位拉回去）。
     你自己走位（在 ROAM 範圍內）時，把你當成「已就位」；範圍外／被電腦改過目標＝照舊。 */
  try { if (typeof fmReady !== 'function') throw 0; const _fr = fmReady; fmReady = function () { const f = roamedF(); if (f) { const q = formationPos(f.pos); if (dist2(f.x, f.z, q.x, q.z) <= (isOFpos(f.pos) ? ROAM_OF : ROAM_IF) + .8) { const sx = f.x, sz = f.z; f.x = q.x; f.z = q.z; try { return _fr.apply(this, arguments); } finally { f.x = sx; f.z = sz; } } } return _fr.apply(this, arguments); }; } catch (e) { if (e !== 0) console.warn('FM：無法包裝 fmReady', e); }
  try { const _up = updatePlay; updatePlay = function (dt) { try { pre(dt); } catch (e) { console.error(e); } return _up.call(this, dt); }; } catch (e) { console.warn('FM：無法包裝 updatePlay', e); }

  return { pre, rechase, pressMove, placeMove, moveActor, evalMove, padNeeded, select, rawDir, roamer, get roaming() { return roamF; }, uiOK, vsSel: pos => { const g = E.F[pos]; if (g && baseOK() && live()) select(g, true); }, setAssist, moving: f => !!(mv && f && f === sel), get selected() { return sel; } };
})();
