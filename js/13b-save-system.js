/* ===== 13b-save-system.js ｜ 存檔／讀檔：3 個欄位、匯出／匯入存檔檔案 =====
   載入順序：13 與 14 之間（見 FILE_MAP.md）；與其他 js/*.js 共用全域作用域（不是 module）。
   存檔時機：每個「半局開始」的乾淨狀態（0 出局、壘上無人、無球數）。比賽中按「更多 → 存檔／讀取」時，
   存的是「目前這個半局開始時」的進度；讀檔後從該半局開頭繼續。
   儲存位置：瀏覽器 localStorage（同一個裝置、同一個瀏覽器／已加入主畫面的 App 共用）。
   跨裝置：用「匯出」產生 .json 檔，到另一台裝置按「匯入」。
   生涯模式接點：SAVE.hooks.career = { active(){→bool}, collect(){→可 JSON 化資料}, apply(extra){…} }
   （collect 的資料會跟著存檔一起存、apply 在讀檔完成後被呼叫；未註冊前生涯存檔無法讀取） */
'use strict';
/*PURE-BEGIN*/
/* ---- 圖形序列化：保留物件共用參照與循環參照；函式、THREE／DOM 等非純資料物件一律略過 ---- */
const SV_SKIP = new Set(['def', 'rig', 'root', 'mesh']);
const SV_BAD = new Set(['__proto__', 'constructor', 'prototype']);
function svPlain(v) { const p = Object.getPrototypeOf(v); return Array.isArray(v) || p === Object.prototype || p === null; }
function svSer(root) {
  const ids = new Map(), nodes = [];
  const enc = v => {
    if (v === undefined) return { $u: 1 };
    if (v === null) return null;
    const t = typeof v;
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (t !== 'object' || !svPlain(v)) return undefined;
    let id = ids.get(v); if (id !== undefined) return { $r: id };
    id = nodes.length; ids.set(v, id);
    if (Array.isArray(v)) {
      const n = []; nodes.push(n);
      for (let i = 0; i < v.length; i++) { const e = enc(v[i]); n.push(e === undefined ? { $u: 1 } : e); }
    } else {
      const n = {}; nodes.push(n);
      for (const k of Object.keys(v)) { if (SV_SKIP.has(k) || SV_BAD.has(k) || v[k] === undefined) continue; const e = enc(v[k]); if (e !== undefined) n[k] = e; }
    }
    return { $r: id };
  };
  const r = enc(root); return { n: nodes, r };
}
function svDe(pack) {
  if (!pack || !Array.isArray(pack.n)) throw new Error('資料格式錯誤');
  const out = pack.n.map(n => Array.isArray(n) ? [] : {});
  const dec = v => {
    if (v && typeof v === 'object') {
      if ('$r' in v) { const o = out[v.$r]; if (!o) throw new Error('參照錯誤'); return o; }
      if ('$u' in v) return undefined;
      if ('$n' in v) return v.$n === 'NaN' ? NaN : v.$n === 'Infinity' ? Infinity : v.$n === '-Infinity' ? -Infinity : null;
    }
    return v;
  };
  pack.n.forEach((n, i) => {
    const o = out[i];
    if (Array.isArray(n)) n.forEach(e => o.push(dec(e)));
    else for (const k of Object.keys(n)) { if (!SV_BAD.has(k)) o[k] = dec(n[k]); }
  });
  return dec(pack.r);
}
function svHash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }
/*PURE-END*/

const SAVE = (function () {
  const APP = 'cpbl2027', FMT = 1, N = 3, MODES = { normal: '一般模式', career: '生涯模式' };
  const LV = ['弱', '普通', '強', '宗師'];
  const key = (m, i) => `cpbl2027.save.${m}.${i}`;
  const S = { cp: null, open: false, kind: 'load', mode: 'normal', sel: 1, msg: '', err: false };
  const hooks = {};
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const G_KEYS = ['inning', 'half', 'score', 'line', 'hits', 'errs', 'bi', 'innings', 'lv', 'easy', 'human', 'homeIdx', 'fancy', 'absOn', 'evt', 'wxOn', 'abs', 'coachOut', 'tilt', 'day', 'umpSkill', 'injQ', 'absStat', 'errPl', 'visits', 'hbpN', 'brawlN', 'forfeit', 'log', 'coach', 'stormHalves', 'batHist', 'pmodel', 'pickCount'];

  /* ---------- 半局開始時的進度快照（只在記憶體，按下存入才寫進欄位） ---------- */
  function capture() {
    if (!G.teams || !G.teams[0] || !G.teams[1] || G.over) return null;
    const g = {}; for (const k of G_KEYS) if (G[k] !== undefined) g[k] = G[k];
    const T = G.teams;
    return {
      cfg: JSON.parse(JSON.stringify(CFG)), park: (G.wx && G.wx.venue) || '', night: !!G.night,
      pack: svSer({ teams: T, g }),
      info: { t: [T[0].short, T[1].short], score: G.score.slice(), inn: G.inning, half: G.half, innings: G.innings, lv: G.lv, human: G.human, park: (G.wx && G.wx.venue) || '' }
    };
  }
  const _startHalf = startHalf;                       // 11-game-flow.js 的原函式；包一層，每個半局開始後自動記下檢查點
  window.startHalf = function () { const r = _startHalf.apply(this, arguments); try { S.cp = capture(); } catch (e) { console.error(e); } return r; };

  /* ---------- 欄位讀寫 ---------- */
  function readSlot(m, i) { try { const s = localStorage.getItem(key(m, i)); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeSlot(m, i, o) { try { localStorage.setItem(key(m, i), JSON.stringify(o)); return true; } catch (e) { return false; } }
  function check(o) {
    if (!o || o.app !== APP) return '這不是《中職野球2027》的存檔檔案';
    if (!(o.fmt <= FMT)) return '這份存檔來自較新的版本，請先更新遊戲';
    if (!MODES[o.mode]) return '存檔缺少模式資訊';
    if (typeof o.payload !== 'string' || o.sum !== svHash(o.payload)) return '存檔檔案已損毀或被修改，無法使用';
    return '';
  }
  function makeSlot(mode, slot, cp) {
    let extra = null; try { extra = hooks[mode] && hooks[mode].collect ? hooks[mode].collect() : null; } catch (e) { console.error(e); }
    const payload = JSON.stringify({ cfg: cp.cfg, park: cp.park, night: cp.night, pack: cp.pack, extra });
    return { app: APP, fmt: FMT, mode, slot, ts: Date.now(), info: cp.info, payload, sum: svHash(payload) };
  }

  /* ---------- 讀檔：還原球隊與比賽狀態，從該半局開頭繼續 ---------- */
  function validate(obj) {
    if (!obj || !Array.isArray(obj.teams) || obj.teams.length !== 2 || !obj.g) throw new Error('存檔內容不完整');
    obj.teams.forEach(t => { if (!t || !Array.isArray(t.lineup) || !Array.isArray(t.pitchers) || !Array.isArray(t.bench) || !TEAMS.some(x => x.id === t.id)) throw new Error('球隊資料不完整'); });
    const g = obj.g; if (!(g.inning >= 1) || (g.half !== 0 && g.half !== 1) || !Array.isArray(g.score)) throw new Error('比賽進度資料不完整');
  }
  function syncMenuUI() {
    document.querySelectorAll('.pill').forEach(p => p.classList.toggle('sel', CFG[p.dataset.k] === +p.dataset.v));
    const sp = el('selPark'); if (sp) sp.value = CFG.park || '';
    try { setLvDesc(CFG.lv); } catch (e) { }
    try { buildCards(); } catch (e) { }
  }
  function restore(d, o) {
    if (G.mode === 'play') quitToMenu();               // 中途讀檔：先把目前比賽收乾淨
    sndInit();
    Object.assign(CFG, d.cfg); try { syncCfg(); } catch (e) { } syncMenuUI();
    const c = Object.assign({}, CFG); c.edit = [null, null]; c.park = PARKS[d.park] ? d.park : ''; c.night = d.night ? 1 : 0; c.ace = 0;
    ED[0] = ED[1] = null;
    if (G.mode === 'title') { G.mode = 'menu'; CAMC.mode = 'title'; }
    newGame(c);                                        // 先建立場景、天氣（同球場與日夜）
    TIMERS = []; tweens.length = 0; if (VENUE.on) { VENUE.done = null; venueEnd(); }     // 取消開場介紹
    d.obj.teams.forEach(t => { t.def = TEAMS.find(x => x.id === t.id) || TEAMS[0]; });
    G.teams = d.obj.teams; Object.assign(G, d.obj.g);
    G.venueDone = true; G.over = false; G.mode = 'play'; G.pending = null; G.freeze = false;
    ['hud'].forEach(id => el(id).classList.remove('hide')); ['menu', 'title', 'result', 'sub', 'lineup', 'careerDlg'].forEach(id => { const e = el(id); if (e) e.classList.add('hide'); });
    startHalf();                                       // 用還原後的球隊重建球場與打線
    try { if (hooks[o.mode] && hooks[o.mode].apply) hooks[o.mode].apply(d.extra); } catch (e) { console.error(e); }
  }
  function loadSlot(i) {
    const o = readSlot(S.mode, i); if (!o) return say('這個欄位是空的', true);
    return loadObj(o);
  }
  function loadObj(o) {
    const err = check(o); if (err) return say(err, true);
    if (o.mode === 'career' && !(hooks.career && hooks.career.apply)) return say('生涯模式尚未開放，存檔會先保留。', true);
    let d; try { d = JSON.parse(o.payload); try { if (o.mode === 'career' && hooks.career && hooks.career.prepare) hooks.career.prepare(d.extra); } catch (e) { console.error(e); } d.obj = svDe(d.pack); validate(d.obj); } catch (e) { return say('存檔內容無法讀取：' + e.message, true); }
    if (G.mode === 'play' && !confirm('讀取存檔會中斷目前這場比賽，確定要讀取嗎？')) return;
    close();
    try { restore(d, o); } catch (e) { console.error(e); try { backToTitle(); } catch (_) { } alert('讀取失敗，已回到主畫面：' + e.message); }
  }

  /* ---------- 匯出／匯入 ---------- */
  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
  async function exportFile(objs, name) {
    const text = JSON.stringify({ app: APP, fmt: FMT, exported: Date.now(), saves: objs });
    try {
      if (matchMedia('(pointer:coarse)').matches && navigator.canShare) {          // 手機／平板：優先用系統分享（可存到「檔案」或傳給自己）
        for (const type of ['application/json', 'text/plain']) {
          const f = new File([text], name, { type });
          if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: '中職野球2027 存檔' }); return '已開啟分享'; } catch (e) { if (e && e.name === 'AbortError') return '已取消'; } break; }
        }
      }
    } catch (e) { }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
    return '已下載存檔檔案';
  }
  async function doExport(list, name) { const r = await exportFile(list, name); say(r); }
  function pickFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.style.display = 'none';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      const rd = new FileReader(); rd.onload = () => importText(String(rd.result || '')); rd.onerror = () => say('檔案讀取失敗', true); rd.readAsText(f);
    };
    document.body.appendChild(inp); inp.click();
  }
  function importText(text) {
    let j; try { j = JSON.parse(text); } catch (e) { return say('這不是有效的存檔檔案', true); }
    const saves = j && j.app === APP && Array.isArray(j.saves) ? j.saves : null; if (!saves || !saves.length) return say('這不是《中職野球2027》的存檔檔案', true);
    for (const o of saves) { const e = check(o); if (e) return say(e, true); if (o.mode !== S.mode) return say(`這份存檔屬於「${MODES[o.mode]}」，請到${MODES[o.mode]}的讀取畫面匯入`, true); }
    const plan = saves.length === 1 ? [[S.sel, saves[0]]] : saves.slice(0, N).map((o, k) => [o.slot >= 1 && o.slot <= N ? o.slot : k + 1, o]);
    const over = plan.filter(([i]) => readSlot(S.mode, i)).map(([i]) => i);
    if (over.length && !confirm(`欄位 ${over.join('、')} 已有存檔，匯入後會被覆蓋，確定嗎？`)) return;
    let ok = 0; for (const [i, o] of plan) { if (writeSlot(S.mode, i, Object.assign({}, o, { slot: i }))) ok++; }
    say(ok === plan.length ? `已匯入 ${ok} 個存檔` : '瀏覽器儲存空間不足，部分存檔匯入失敗', ok !== plan.length); render();
  }

  /* ---------- 對話框 ---------- */
  const dlg = () => el('saveDlg');
  function say(t, bad) { S.msg = t; S.err = !!bad; const m = el('svMsg'); if (m) { m.textContent = t; m.className = 'sv-msg' + (bad ? ' bad' : ''); } }
  function fmtTime(ts) { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  function cpText(f) { return f ? `${f.inn}局${f.half ? '下' : '上'}開始（${esc(f.t[0])} ${f.score[0]} : ${f.score[1]} ${esc(f.t[1])}）` : ''; }
  function rowHtml(i, o) {
    const canSave = S.kind === 'save', sel = S.sel === i ? ' sel' : '';
    if (!o) return `<div class="sv-row empty${sel}" data-i="${i}"><div class="sv-no">${i}</div><div class="sv-main"><div class="sv-h">— 空的欄位 —</div><div class="sv-d">尚無存檔</div></div><div class="sv-btns">${canSave ? '<button data-a="save" class="pri">存入</button>' : ''}</div></div>`;
    const f = o.info || { t: ['?', '?'], score: [0, 0], inn: 1, half: 0, innings: 9, lv: 1, human: 0 }, bad = check(o);
    const who = f.human < 0 ? '觀戰' : '我方：' + esc(f.t[f.human] || '');
    return `<div class="sv-row${sel}${bad ? ' bad' : ''}" data-i="${i}"><div class="sv-no">${i}</div><div class="sv-main"><div class="sv-h">${esc(f.t[0])} <b>${f.score[0]}</b> : <b>${f.score[1]}</b> ${esc(f.t[1])}</div><div class="sv-d">${bad ? esc(bad) : `${f.inn}局${f.half ? '下' : '上'}開始・${f.innings}局制・電腦${LV[f.lv] || ''}・${who}${f.park ? '・' + esc(f.park) : ''}`}</div><div class="sv-d t">${fmtTime(o.ts)}</div></div><div class="sv-btns">${canSave ? '<button data-a="save">覆蓋</button>' : ''}${bad ? '' : '<button data-a="load" class="pri">讀取</button>'}<button data-a="exp">匯出</button><button data-a="del" class="dng">刪除</button></div></div>`;
  }
  function render() {
    const d = dlg(); if (!d) return;
    const saving = S.kind === 'save';
    el('svTitle').innerHTML = `${saving ? '💾 存檔／讀取' : '📂 讀取存檔'}<small>${MODES[S.mode]}</small>`;
    el('svHint').innerHTML = saving
      ? (S.cp ? `將存入：<b>${cpText(S.cp.info)}</b><br><small>每個半局開始時會自動記下進度；半局進行中的打席與壘包不會保留，讀檔後從該半局開頭繼續。</small>` : '目前沒有可存的進度。')
      : '點選欄位後按「讀取」。想換到別台裝置玩，按「匯出」存成檔案，再到另一台裝置按「匯入檔案」。';
    const rows = []; for (let i = 1; i <= N; i++) rows.push(rowHtml(i, readSlot(S.mode, i)));
    el('svList').innerHTML = rows.join('');
    const m = el('svMsg'); m.textContent = S.msg; m.className = 'sv-msg' + (S.err ? ' bad' : '');
  }
  function act(a, i) {
    S.sel = i;
    if (a === 'save') {
      if (!S.cp) return say('目前沒有可存的進度', true);
      if (readSlot(S.mode, i) && !confirm(`欄位 ${i} 已有存檔，要覆蓋嗎？`)) return;
      const ok = writeSlot(S.mode, i, makeSlot(S.mode, i, S.cp));
      say(ok ? `已存入欄位 ${i}：${S.cp.info.inn}局${S.cp.info.half ? '下' : '上'}開始` : '瀏覽器儲存空間不足或被停用，無法存檔（可試著刪除舊存檔）', !ok); render();
    } else if (a === 'load') loadSlot(i);
    else if (a === 'exp') { const o = readSlot(S.mode, i); if (o) doExport([o], `cpbl2027-${S.mode}-slot${i}-${stamp()}.json`); }
    else if (a === 'del') { if (confirm(`確定刪除欄位 ${i} 的存檔嗎？`)) { try { localStorage.removeItem(key(S.mode, i)); } catch (e) { } say(`已刪除欄位 ${i}`); render(); } }
  }
  function open(kind, mode) {
    S.kind = kind; S.mode = mode || 'normal'; S.msg = ''; S.err = false;
    if (kind === 'save') { try { S.cp = S.cp || capture(); } catch (e) { } }
    let first = 1; for (let i = 1; i <= N; i++) if (!readSlot(S.mode, i)) { first = i; break; }
    S.sel = first; S.open = true; dlg().classList.remove('hide'); render();
  }
  function close() { S.open = false; const d = dlg(); if (d) d.classList.add('hide'); }

  /* ---------- 綁定 ---------- */
  const _uh = uiHold; window.uiHold = () => _uh() || (S.open && G.mode === 'play');        // 存檔視窗開著時，遊戲暫停
  const d0 = dlg();
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'wheel'].forEach(ev => d0.addEventListener(ev, e => e.stopPropagation()));
  d0.addEventListener('click', e => { if (e.target === d0) close(); });
  el('svList').addEventListener('click', e => {
    const row = e.target.closest('.sv-row'); if (!row) return; const i = +row.dataset.i, b = e.target.closest('button');
    if (b) act(b.dataset.a, i); else { S.sel = i; render(); }
  });
  el('svImport').onclick = pickFile;
  el('svExpAll').onclick = () => { const l = []; for (let i = 1; i <= N; i++) { const o = readSlot(S.mode, i); if (o) l.push(o); } if (!l.length) return say('沒有可匯出的存檔', true); doExport(l, `cpbl2027-${S.mode}-all-${stamp()}.json`); };
  el('svClose').onclick = close;
  window.addEventListener('keydown', e => { if (S.open && e.key === 'Escape') { close(); e.stopPropagation(); e.preventDefault(); } }, true);
  el('btnSave').onclick = () => open('save', hooks.career && hooks.career.active && hooks.career.active() ? 'career' : 'normal');
  el('menuLoad').onclick = () => { sndInit(); open('load', 'normal'); };
  el('careerLoad').onclick = () => { sndInit(); open('load', 'career'); };

  return { hooks, open, close, capture, get cp() { return S.cp; }, readSlot, writeSlot, loadObj, MODES };
})();
