/* ===== 13n-storage-guard.js ｜ 存檔保護（要求持久儲存／整份 localStorage 備份與還原／超過 3 天沒備份提醒）=====
   載入順序：13l 之後、14 之前（baseball.html 已有這行 script）。與其他 js 共用全域作用域；不依賴 13b 的存檔格式，
   備份的是「整個 localStorage」（存檔欄位、生涯進度、設定都在裡面）。本遊戲沒有使用 cookie；存檔不在 IndexedDB。
   功能：
   ① 要求瀏覽器「持久儲存」（navigator.storage.persist），降低存檔被瀏覽器自動清掉的機會。
   ② 備份：電腦（Chrome／Edge）可選一個檔案位置並「自動寫入」（資料有變動時每 2 分鐘＋離開頁面時更新）；
      手機／平板走「分享表單（儲存到檔案）」或直接下載 .json。
   ③ 還原：選擇備份檔 → 確認 → 寫回 localStorage → 重新載入。
   ④ 超過 3 天沒備份（而且確實有存檔）→ 左下角 💾 按鈕出現紅點，並提醒一次。
   公開介面：window.STORE_GUARD = { status(), persist(), backup(), restore(), pickAuto(), autoOff(), lastBackup(), snapshot(), applySnapshot(obj) }
   介面：#sgFab（左下角小按鈕，比賽進行中自動隱藏）、#sgDlg（備份／還原視窗）。
   只動 localStorage 的讀取與（還原時的）寫入；備份用的紀錄鍵（cpbl_sg_*）不會被備份進檔案。 */
(function () {
  'use strict';
  const APP = 'cpbl2027-guard', FMT = 1, DAY3 = 3 * 24 * 3600 * 1000;
  const LAST = 'cpbl_sg_last', AUTO = 'cpbl_sg_auto', SKIP = new Set([LAST, AUTO]);
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const canPick = () => typeof window.showSaveFilePicker === 'function';
  const hash = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h + ':' + str.length; };

  /* ---------- 快照／套用（純資料，可單獨測試）---------- */
  function snapshot() {
    const items = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k == null || SKIP.has(k)) continue; items[k] = localStorage.getItem(k); } } catch (e) { }
    return { app: APP, fmt: FMT, t: new Date().toISOString(), n: Object.keys(items).length, items };
  }
  function applySnapshot(o) {
    if (!o || o.app !== APP || !o.items || typeof o.items !== 'object') throw new Error('這不是「中職野球2027」的備份檔');
    let n = 0; for (const k of Object.keys(o.items)) { if (SKIP.has(k) || typeof o.items[k] !== 'string') continue; if (!ls.set(k, o.items[k])) throw new Error('寫入失敗（儲存空間不足？）'); n++; }
    return n;
  }
  const hasSave = () => { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('cpbl2027') === 0) return true; } } catch (e) { } return false; };
  const fname = () => { const d = new Date(); return `cpbl2027-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`; };
  const lastBackup = () => +ls.get(LAST) || 0;
  const fmtT = t => { if (!t) return '從未備份'; const d = new Date(t); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const overdue = () => hasSave() && Date.now() - lastBackup() > DAY3;

  /* ---------- 檔案代碼（自動寫入用的檔案位置，存在獨立的 IndexedDB）---------- */
  const IDB = {
    run(mode, fn) { return new Promise(res => { try { const rq = indexedDB.open('cpbl_sguard', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('h'); rq.onerror = () => res(null); rq.onsuccess = () => { try { const tx = rq.result.transaction('h', mode), r = fn(tx.objectStore('h')); tx.oncomplete = () => res(r && r.result !== undefined ? r.result : null); tx.onerror = () => res(null); tx.onabort = () => res(null); } catch (e) { res(null); } }; } catch (e) { res(null); } }); },
    get() { return IDB.run('readonly', s => s.get('auto')); },
    put(h) { return IDB.run('readwrite', s => s.put(h, 'auto')); },
    del() { return IDB.run('readwrite', s => s.delete('auto')); }
  };
  let autoH = null, lastHash = '', busy = false;
  async function perm(h, ask) { try { const o = { mode: 'readwrite' }; if ((await h.queryPermission(o)) === 'granted') return true; if (ask && (await h.requestPermission(o)) === 'granted') return true; } catch (e) { } return false; }
  async function writeFile(h, text) { const w = await h.createWritable(); await w.write(text); await w.close(); }

  /* ---------- 持久儲存 ---------- */
  async function persist() {
    try { if (navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()) return true; if (navigator.storage && navigator.storage.persist) return !!(await navigator.storage.persist()); } catch (e) { }
    return false;
  }
  async function status() {
    const o = { persisted: false, usage: 0, quota: 0, last: lastBackup(), overdue: overdue(), auto: !!autoH, autoOk: false, canPick: canPick() };
    try { if (navigator.storage && navigator.storage.persisted) o.persisted = await navigator.storage.persisted(); } catch (e) { }
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); o.usage = e.usage || 0; o.quota = e.quota || 0; } } catch (e) { }
    if (autoH) o.autoOk = await perm(autoH, false);
    return o;
  }

  /* ---------- 備份 ---------- */
  function markDone() { ls.set(LAST, String(Date.now())); fab(); }
  async function backup() {
    const snap = snapshot(), text = JSON.stringify(snap), name = fname();
    if (autoH && await perm(autoH, true)) { try { await writeFile(autoH, text); lastHash = hash(JSON.stringify(snap.items)); markDone(); return '已寫入自動備份檔'; } catch (e) { } }
    if (canPick()) {
      try { const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '中職野球2027 備份', accept: { 'application/json': ['.json'] } }] }); await writeFile(h, text); markDone(); return '已備份到你選的檔案'; }
      catch (e) { if (e && e.name === 'AbortError') return '已取消'; }
    }
    try {
      for (const type of ['application/json', 'text/plain']) { const f = new File([text], name, { type }); if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: '中職野球2027 備份' }); markDone(); return '已開啟分享（請選「儲存到檔案」）'; } catch (e) { if (e && e.name === 'AbortError') return '已取消'; } break; } }
    } catch (e) { }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      markDone(); return '已下載備份檔';
    } catch (e) { return '備份失敗：' + (e && e.message || e); }
  }
  async function pickAuto() {
    if (!canPick()) return '這個瀏覽器不能指定檔案位置，請用「立即備份」';
    try {
      const h = await window.showSaveFilePicker({ suggestedName: 'cpbl2027-autobackup.json', types: [{ description: '中職野球2027 備份', accept: { 'application/json': ['.json'] } }] });
      await IDB.put(h); autoH = h; const snap = snapshot(); await writeFile(h, JSON.stringify(snap)); lastHash = hash(JSON.stringify(snap.items)); markDone(); return '已設定自動備份：資料有變動時會自動更新這個檔案';
    } catch (e) { return e && e.name === 'AbortError' ? '已取消' : '設定失敗：' + (e && e.message || e); }
  }
  async function autoOff() { autoH = null; await IDB.del(); return '已關閉自動備份'; }
  async function autoTick(force) {      // 資料有變動才寫；沒授權時不打擾（要到視窗按「重新授權」）
    if (!autoH || busy) return; busy = true;
    try {
      if (!(await perm(autoH, false))) return;
      const snap = snapshot(), hs = hash(JSON.stringify(snap.items)); if (hs === lastHash && !force) return;
      await writeFile(autoH, JSON.stringify(snap)); lastHash = hs; ls.set(LAST, String(Date.now()));
    } catch (e) { } finally { busy = false; }
  }

  /* ---------- 還原 ---------- */
  function restore() {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.style.display = 'none'; document.body.appendChild(inp);
      let done = false; const fin = m => { if (done) return; done = true; inp.remove(); res(m); };
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return fin('已取消');
        try {
          const o = JSON.parse(await f.text()); if (!o || o.app !== APP || !o.items) throw new Error('這不是「中職野球2027」的備份檔');
          const n = Object.keys(o.items).length;
          if (!confirm(`要還原這份備份嗎？\n備份時間：${fmtT(Date.parse(o.t))}\n資料筆數：${n}\n\n同名的存檔與設定會被備份檔內容覆蓋，還原後會自動重新載入。`)) return fin('已取消');
          applySnapshot(o); fin('還原完成，重新載入中…'); setTimeout(() => location.reload(), 600);
        } catch (e) { fin('還原失敗：' + (e && e.message || e)); }
      };
      inp.addEventListener('cancel', () => fin('已取消')); inp.click();
    });
  }

  /* ---------- 介面 ---------- */
  function css() {
    if ($('sgCss')) return; const st = document.createElement('style'); st.id = 'sgCss';
    st.textContent = '#sgFab{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:9300;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(10,30,50,.7);color:#fff;font-size:20px;line-height:38px;text-align:center;cursor:pointer;display:none;padding:0}'
      + '#sgFab.on{display:block}#sgFab i{position:absolute;right:1px;top:1px;width:11px;height:11px;border-radius:50%;background:#f33;border:1px solid #fff;display:none}#sgFab.od i{display:block}'
      + '#sgDlg{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;font-family:"Noto Sans TC",sans-serif}#sgDlg.on{display:flex}'
      + '#sgDlg .bx{width:min(92vw,420px);max-height:88vh;overflow:auto;background:#0f2438;border:1px solid rgba(255,255,255,.35);border-radius:14px;padding:16px 16px 12px;color:#eaf4ff;box-sizing:border-box}'
      + '#sgDlg h3{margin:0 0 8px;font-size:18px}#sgDlg .st{font-size:13px;line-height:1.7;opacity:.95;margin-bottom:10px}#sgDlg .st b{color:#ffe08a}#sgDlg .od{color:#ff8a8a;font-weight:800}'
      + '#sgDlg button{display:block;width:100%;margin:6px 0;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;font-size:14px;font-weight:700;cursor:pointer}#sgDlg button.pri{background:#1f7a3d;border-color:#7be69a}'
      + '#sgDlg .msg{min-height:1.4em;font-size:13px;color:#9fffb0;margin-top:4px}#sgDlg .tip{font-size:12px;opacity:.75;line-height:1.6;margin-top:6px}';
    document.head.appendChild(st);
  }
  function fab() {
    css(); let b = $('sgFab');
    if (!b) { b = document.createElement('button'); b.id = 'sgFab'; b.type = 'button'; b.title = '存檔備份'; b.setAttribute('aria-label', '存檔備份'); b.innerHTML = '💾<i></i>'; b.onclick = e => { e.stopPropagation(); openDlg(); }; b.onpointerdown = e => e.stopPropagation(); document.body.appendChild(b); }
    const playing = typeof G !== 'undefined' && G && G.mode === 'play';
    b.classList.toggle('on', !playing); b.classList.toggle('od', overdue());
  }
  async function openDlg() {
    css(); let d = $('sgDlg');
    if (!d) { d = document.createElement('div'); d.id = 'sgDlg'; d.onclick = e => { if (e.target === d) d.classList.remove('on'); }; document.body.appendChild(d); }
    const s = await status(); let msg = '';
    const draw = () => {
      d.innerHTML = `<div class="bx"><h3>💾 存檔保護</h3><div class="st">
        上次備份：<b>${fmtT(s.last)}</b>${s.overdue ? ' <span class="od">（超過 3 天沒備份！）</span>' : ''}<br>
        持久儲存：<b>${s.persisted ? '已啟用' : '未啟用（瀏覽器可能在空間不足時清掉資料）'}</b><br>
        已使用空間：${(s.usage / 1048576).toFixed(1)} MB${s.quota ? ' / ' + (s.quota / 1048576 / 1024).toFixed(1) + ' GB' : ''}<br>
        自動備份：<b>${s.auto ? (s.autoOk ? '開啟中' : '已設定，需要重新授權') : '未設定'}</b></div>
        <button class="pri" id="sgB1">立即備份</button><button id="sgB2">還原備份檔</button>
        ${s.canPick ? (s.auto ? (s.autoOk ? '' : '<button id="sgB5">重新授權自動備份</button>') + '<button id="sgB4">關閉自動備份</button>' : '<button id="sgB3">選擇檔案位置並開啟自動備份</button>') : ''}
        ${s.persisted ? '' : '<button id="sgB6">要求持久儲存</button>'}
        <div class="msg" id="sgMsg">${esc(msg)}</div>
        <div class="tip">備份檔是一份 .json，包含所有存檔欄位、生涯進度與設定；換手機或重灌時，用「還原備份檔」即可帶回。${s.canPick ? '' : '手機／平板備份時請在分享表單選「儲存到檔案」。'}</div>
        <button id="sgB0">關閉</button></div>`;
      const on = (id, fn) => { const b = $(id); if (b) b.onclick = async () => { b.disabled = true; try { msg = await fn(); } catch (e) { msg = '失敗：' + (e && e.message || e); } Object.assign(s, await status()); draw(); }; };
      on('sgB1', backup); on('sgB2', restore); on('sgB3', pickAuto); on('sgB4', autoOff);
      on('sgB5', async () => { if (autoH && await perm(autoH, true)) { await autoTick(true); return '已重新授權'; } return '授權失敗'; });
      on('sgB6', async () => (await persist()) ? '已啟用持久儲存' : '瀏覽器沒有同意（常見於未加入主畫面／使用時間較短）');
      $('sgB0').onclick = () => d.classList.remove('on');
    };
    draw(); d.classList.add('on');
  }

  /* ---------- 啟動 ---------- */
  window.STORE_GUARD = { status, persist, backup, restore, pickAuto, autoOff, lastBackup, snapshot, applySnapshot, open: openDlg, _hash: hash };
  function start() {
    fab(); setInterval(fab, 1500);
    persist();
    IDB.get().then(h => { if (h) { autoH = h; try { lastHash = hash(JSON.stringify(snapshot().items)); } catch (e) { } } });
    setInterval(() => autoTick(false), 120000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoTick(false); });
    addEventListener('pagehide', () => { autoTick(false); });
    setTimeout(() => { if (overdue()) { fab(); try { if (typeof toast === 'function') toast('超過 3 天沒備份存檔了，點左下角 💾 備份', '#fff', '#d9961c'); } catch (e) { } } }, 6000);
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', () => setTimeout(start, 400));
})();
