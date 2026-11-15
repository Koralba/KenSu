/* ===== 13zk-heat-life.js ｜ 天氣對球員的影響：熱／冷／雨／風的表情與小動作（v1.2.7 熱、v1.2.8 加入冷／雨／風） =====
   ① 熱（悶熱／赤熱炎日）：臉紅、流汗、眼皮半垂、微張嘴喘氣；擦汗、拉帽簷搧風、雙手撐膝、叉腰嘆氣
   ② 冷（氣溫低：梅雨／東北季風／夜間）：鼻頭臉頰凍紅、眉頭微皺、牙齒打顫；呵手搓手、抱臂搓手臂、全身發抖
   ③ 雨：瞇眼、眉壓低、臉上滴水；用手抹臉、甩水
   ④ 風（強風／颳風／颱風外圍）：瞇眼擋風；壓住帽子、整理帽簷、抹眼睛
   表情是改「表情預設」，隨天氣強度連續變化，天氣回復自動還原；動作在球不在場內的空檔隨機出現（各人錯開），越嚴苛越頻繁。
   只動外觀：自己的亂數（不碰 Math.random，不影響區網對戰同步）；快轉略過；球在場內／打擊中不打斷任何動作。室內球場（dome）全部不啟動。
   v1.2.9：①呵手／搓手／發抖時手套暫時收起（露出手掌）；②呵手時嘴前吐出白霧（冷天白氣，13zl 的待機呼吸也用）；③小動作進行中球被打進場內、或野手要起跑，立刻放掉動作（不再用「抱臂姿勢」滑行）；
   ④投手投球前的天氣小動作：機率降到 ≤10%、回報的等待時間 ≤0.6 秒（不拉長投球間隔）。 */
'use strict';
const HLIFE = { on: true, rs: 20271107, orig: null, lastKey: '' };
function hlRnd() { HLIFE.rs = (Math.imul(HLIFE.rs, 1664525) + 1013904223) >>> 0; return HLIFE.rs / 4294967296; }
const HL_KEYS = ['idle', 'focus', 'alert', 'run', 'thinking', 'intense', 'effort', 'catchface', 'sigh'];
function hlWx() {      // 目前天氣對球員的「不舒服」強度（0~1）：熱、冷、雨、風
  const z = { hot: 0, cold: 0, wet: 0, wind: 0 };
  try {
    if (!HLIFE.on || typeof G === 'undefined' || G.mode !== 'play' || typeof wxIn !== 'function' || !wxIn()) return z;
    z.hot = clamp(typeof heatK === 'function' ? heatK() : 0, 0, 1);
    const tp = G.wx && typeof G.wx.temp === 'number' ? G.wx.temp : 26; z.cold = clamp((22 - tp) / 8, 0, 1);
    z.wet = clamp((typeof rainK === 'function' ? rainK() : 0) * 1.7, 0, 1);
    z.wind = clamp((((G.wx && G.wx.spd) || 0) - 3) / 5, 0, 1);
  } catch (e) { }
  return z;
}
function hlSyncFace(z) {      // 依天氣改寫「平常臉」的預設（臉紅、汗／水珠、瞇眼、皺眉、打顫）
  if (typeof FACE === 'undefined' || !FACE.table) return;
  const q = v => Math.round(v * 10) / 10, key = [q(z.hot), q(z.cold), q(z.wet), q(z.wind)].join(','); if (key === HLIFE.lastKey) return; HLIFE.lastKey = key;
  if (!HLIFE.orig) { HLIFE.orig = {}; for (const k of HL_KEYS) HLIFE.orig[k] = Object.assign({}, FACE.table[k] || {}); }
  const h = q(z.hot), c = q(z.cold), w = q(z.wet), n = q(z.wind), any = h + c + w + n > 0;
  for (const k of HL_KEYS) {
    const o = HLIFE.orig[k]; if (!any) { FACE.table[k] = Object.assign({}, o); continue; }
    FACE.table[k] = Object.assign({}, o, {
      bl: Math.max(o.bl || 0, .78 * h, .5 * c), sw: Math.max(o.sw || 0, .95 * h, .6 * w),
      lu: Math.max(o.lu || 0, Math.min(.55, .24 * h + .2 * c + .25 * w + .32 * n)), ll: Math.max(o.ll || 0, .25 * w + .3 * n + .1 * c),
      bY: (o.bY || 0) - .1 * h - .05 * c - .2 * w - .2 * n, bA: (o.bA || 0) - .35 * c + .2 * w + .15 * n,
      mO: Math.max(o.mO || 0, .16 * h + .1 * c), talk: Math.max(o.talk || 0, c > .4 ? .12 * c : 0)
    });
  }
}
if (typeof FACE !== 'undefined' && FACE.table) {      // 動作專屬的臉
  FACE.table.hl_cold = { lu: .4, ll: .15, bA: -.5, bY: .05, bl: .6, mO: .2, mC: -.3, talk: .2, gz: 'down' };
  FACE.table.hl_wind = { lu: .5, ll: .4, bY: -.3, bA: .3, mC: -.2, mW: .9 };
  Object.assign(FX_ANIM, { hl_blow: 'hl_cold', hl_rub: 'hl_cold', hl_shiver: 'hl_cold', hl_cap: 'hl_wind' });
}
function hlEligible(r) {      // 這個野手現在可以做小動作嗎
  if (!r) return false; if (G.over || G.mode !== 'play' || window.__ff) return false;
  if (typeof PL !== 'undefined' && PL) return false; if (G.phase !== 'pre') return false;
  if (r.run > .05 || (r.anim && !(r.anim.name === 'crouch' && r.anim.opt && r.anim.opt.hold))) return false;
  if (typeof E !== 'undefined' && E.bat && E.bat.rig === r) return false; return true;
}
function hlPick(z, isC) {      // 依「最嚴重的天氣」挑動作：[動作, 秒數, 表情]
  const m = Math.max(z.hot, z.cold, z.wet, z.wind), x = hlRnd();
  if (m === z.hot) return isC ? ['wipe', 1.1, 'wipe'] : x < .46 ? ['wipe', 1.1, 'wipe'] : x < .68 ? ['capadj', 1.0, 'sigh'] : x < .86 ? ['handsknee', 1.5, 'sigh'] : ['hips', 1.4, 'sigh'];
  if (m === z.cold) return isC ? ['hl_blow', 1.8, 'hl_cold'] : x < .36 ? ['hl_blow', 1.8, 'hl_cold'] : x < .7 ? ['hl_rub', 2.0, 'hl_cold'] : ['hl_shiver', 1.6, 'hl_cold'];
  if (m === z.wet) return isC ? ['wipe', 1.1, 'wipe'] : x < .5 ? ['wipe', 1.1, 'wipe'] : x < .8 ? ['armshake', 1.0, 'squint'] : ['capadj', 1.0, 'squint'];
  return isC ? ['capadj', 1.0, 'hl_wind'] : x < .5 ? ['hl_cap', 1.4, 'hl_wind'] : x < .78 ? ['capadj', 1.0, 'hl_wind'] : ['wipe', 1.1, 'hl_wind'];      // 風：壓帽子、整理帽簷、揉眼睛
}
function hlAct(r, pos, z) {
  const isC = pos === 'C', [name, dur, face] = hlPick(z, isC), hand = hlRnd() < .5 ? 1 : -1;
  if (isC) r._cRun = true;      // 捕手做完動作要蹲回去（moveFielder 看 _cRun）
  r.anim = { name, t: 0, dur, opt: { hand, hlv: 1 } }; r.t = 0;
  if (typeof FACE !== 'undefined' && FACE.emote) FACE.emote(r, face, dur + .3);
  return dur;
}
function hlTick(r, dt, z) {
  const m = Math.max(z.hot, z.cold, z.wet, z.wind); if (m < .25) return;
  let pos = null; if (typeof E !== 'undefined' && E.F) for (const k in E.F) if (E.F[k] && E.F[k].rig === r) { pos = k; break; } if (!pos || pos === 'P') return;
  if (r._hl == null) r._hl = 2 + hlRnd() * 8 / m;
  r._hl -= dt; if (r._hl > 0) return;
  if (!hlEligible(r)) { r._hl = .6 + hlRnd() * 3.4; return; }      /* 不能做時隨機再等一下（不然半局間的空檔過後全員同時開始） */
  hlAct(r, pos, z); r._hl = (7 + hlRnd() * 9) / m;      // 越嚴苛越頻繁（強度 1 約 7～16 秒一次）
}
const HL_BARE = { hl_blow: 1, hl_rub: 1, hl_shiver: 1 };
function hlWxC() {      // 天氣強度（每 0.1 秒才重算一次，九個人共用）
  const n = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!HLIFE.z || n - HLIFE.zAt > 100 || n < HLIFE.zAt) { HLIFE.z = hlWx(); HLIFE.zAt = n; } return HLIFE.z;
}
function hlGuard(r) {      /* 小動作（opt.hlv）進行中球被打進場內、或人要起跑：立刻放掉動作 */
  const a = r.anim; if (a && a.opt && a.opt.hlv && (r.run > .05 || (typeof PL !== 'undefined' && PL))) r.anim = null;
}
function hlGlove(r) {      /* 呵手／搓手／發抖：手套收起來露出手掌，動作結束還原 */
  if (!r.glove) return; const bare = !!(r.anim && HL_BARE[r.anim.name]);
  if (bare && !r._hlG) { r.glove.visible = false; r._hlG = 1; } else if (!bare && r._hlG) { r.glove.visible = true; r._hlG = 0; }
}
function hlPuffTex() {
  if (HLIFE.ptex) return HLIFE.ptex; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.5, 'rgba(240,248,255,.5)'); gr.addColorStop(1, 'rgba(235,245,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return (HLIFE.ptex = t);
}
function hlPuff(r, dur) {      /* 嘴前吐出一團白霧（冷天白氣）：掛在頭上、半透明、往前飄散淡出 */
  if (!r || !r.head) return; let p = r._puff;
  if (!p) { p = r._puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: hlPuffTex(), transparent: true, depthWrite: false, opacity: 0 })); p.visible = false; r.head.add(p); }
  p.userData.t = p.userData.d = dur || 1.1; p.visible = true;
}
function hlPuffStep(r, dt) {
  const p = r._puff; if (!p || !(p.userData.t > 0)) return; p.userData.t -= dt;
  if (p.userData.t <= 0) { p.visible = false; return; }
  const q = 1 - p.userData.t / p.userData.d, s = .16 + .4 * q; p.position.set(0, -.3 + .1 * q, .62 + .5 * q); p.scale.set(s, s * .8, 1); p.material.opacity = .62 * Math.sin(Math.PI * Math.min(1, q * 1.15));
}
{
  const _rs = rigStep;
  rigStep = function (r, dt) {
    if (r && r.anim) hlGuard(r);
    _rs(r, dt); if (!r || !r.legL) return;
    hlGlove(r); if (r._puff) hlPuffStep(r, dt);
    if (!HLIFE.on || window.__ff) return;
    const z = hlWxC(); hlSyncFace(z); hlTick(r, dt, z);
    const a = r.anim; if (a && a.name === 'hl_blow' && a.dur < 1e8) {      /* 呵手：每次呼氣吐一團白霧 */
      const n = Math.floor((a.t * 5.2 - .3) / 6.2832); if (a._pn == null) a._pn = -1; if (n > a._pn && a.t / a.dur > .15) { a._pn = n; hlPuff(r, 1.2); }
    }
  };
  if (typeof prepAction === 'function') {      /* 投手：投球前的天氣小動作。v1.2.9：機率 ≤10%、回報等待 ≤0.6 秒，不拉長投球間隔 */
    const _pa = prepAction;
    prepAction = function () {
      const z = hlWx(), m = Math.max(z.hot, z.cold, z.wet, z.wind), P = typeof E !== 'undefined' && E.F && E.F.P;
      if (m > .3 && P && P.rig && !(typeof PL !== 'undefined' && PL) && G.phase === 'pre' && (!P.rig.anim || P.rig.anim.name === 'stretch') && hlRnd() < .1 * m) {
        const h = (curPitcher().hand === 'R') ? 1 : -1, [name, dur, face] = hlPick(z, false);
        P.rig.anim = { name, t: 0, dur, opt: { hand: h, hlv: 1 } }; if (typeof FACE !== 'undefined' && FACE.emote) FACE.emote(P.rig, face, dur + .3); return Math.min(dur, .6);
      }
      return _pa.apply(this, arguments);
    };
  }
}
