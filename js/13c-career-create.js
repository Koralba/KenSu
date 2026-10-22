/* ===== 13c-career-create.js ｜ 生涯模式 第一階段：建立角色、外觀、角色存檔、球員卡 =====
   載入順序：13b 與 14 之間（見 FILE_MAP.md）；與其他 js/*.js 共用全域作用域。
   提供：CAREER.open()               主畫面「生涯模式」按鈕呼叫（角色欄位 → 建立／編輯角色）
         CAREER.vis(profile)         角色外觀 → 與 visFor() 同格式的 vis 物件（makeChibi({vis}) 可直接使用）
         CAREER.portrait(p, opts)    角色頭像／全身像（dataURL，離屏 three.js 渲染）
         CAREER.cardHtml(p, stats)   球員卡 HTML（結算畫面、編輯器預覽共用同一個函式）
         CAREER.session              開始生涯比賽時設為 { profile, player?, stats?, playerBat?, statsBat?, statsPit? }（二刀流：player＝投手物件、playerBat＝打者物件）；11 的 endGame() 會呼叫 CAREER.attachResult(rs) 貼上球員卡
   角色存檔：localStorage 鍵 cpbl2027.career.profile.<1~3>；匯出／匯入 .json（含 FNV 校驗碼）。
   與比賽存檔（13b）的關係：SAVE.hooks.career 已註冊，之後生涯比賽的存檔會一併帶上角色資料。 */
'use strict';
const CAREER = (function () {
  const APP = 'cpbl2027', FMT = 1, N = 3, YEAR = 2027, KEY = n => `cpbl2027.career.profile.${n}`;
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const POS = [['P', '投手'], ['TWP', '二刀流'], ['C', '捕手'], ['1B', '一壘手'], ['2B', '二壘手'], ['3B', '三壘手'], ['SS', '游擊手'], ['LF', '左外野手'], ['CF', '中外野手'], ['RF', '右外野手'], ['DH', '指定打擊']];
  const HAIR = [['bald', '光頭'], ['buzz', '平頭'], ['short', '短髮'], ['undercut', '鏟青'], ['flip', '外翻'], ['kr', '韓系'], ['mid', '中長髮'], ['wavy', '波浪'], ['curly', '捲髮'], ['long', '長髮'], ['bob', '鮑伯'], ['mullet', '鯔魚頭'], ['pony', '馬尾'], ['bun', '包包頭'], ['topknot', '丸子頭'], ['braid', '辮子頭'], ['cornrow', '玉米辮'], ['twist', '扭辮'], ['dreads', '髒辮'], ['afro', '爆炸頭'], ['mohawk', '莫霍克'], ['spiky', '刺蝟頭'], ['slick', '油頭'], ['sidepart', '旁分'], ['bowl', '鍋蓋頭'], ['curtain', '中分'], ['pomp', '飛機頭'], ['twintail', '雙馬尾'], ['twinbun', '雙丸子'], ['hipony', '高馬尾'], ['fade', '漸層削邊'], ['wolf', '狼尾'], ['shaggy', '凌亂短髮']];
  const HAT = [['std', '標準（打擊戴安全頭盔）'], ['cap', '不戴頭盔（打擊也戴球帽）'], ['bare', '全程不戴（光頭／髮型全露）']];
  const GLASS = [[0, '無'], [1, '圓框眼鏡'], [2, '方框眼鏡'], [3, '運動護目鏡']];
  const EYE_T = [[0, '圓點眼'], [1, '大圓眼'], [2, '細長眼'], [3, '笑眼'], [4, '銳利眼'], [5, '睏倦眼'], [6, '亮晶晶']];
  const BROW_T = [[0, '無眉毛'], [1, '標準眉'], [2, '粗濃眉'], [3, '上揚眉'], [4, '八字眉'], [5, '細短眉']];
  const NOSE_T = [[0, '無'], [1, '小圓鼻'], [2, '高挺鼻'], [3, '寬鼻'], [4, '長鼻']];
  const MOUTH_T = [[0, '無'], [1, '微笑'], [2, '平嘴'], [3, '露齒笑'], [4, '壞笑'], [5, '驚訝']];
  const ACC_SW = ['#e8c040', '#e8e8f0', '#d8402e', '#2f6fe8', '#1fb85a', '#ff7ab8', '#8a44d8', '#15110e'];
  /* 五官組合：一鍵套用眼型／眉型／鼻型／嘴型與眼睛微調 */
  const FACES = [['陽光男孩', { eyeType: 1, brow: 1, nose: 1, mouth: 3, eyeSp: 1, eyeS: 1.05, eyeH: 1.1 }], ['酷帥', { eyeType: 4, brow: 3, nose: 2, mouth: 2, eyeSp: .96, eyeS: 1, eyeH: 1 }], ['憨厚', { eyeType: 0, brow: 4, nose: 3, mouth: 1, eyeSp: 1.04, eyeS: 1.05, eyeH: 1.1 }], ['瞇瞇眼', { eyeType: 3, brow: 5, nose: 1, mouth: 1, eyeSp: 1.02, eyeS: 1, eyeH: 1 }], ['睡眼惺忪', { eyeType: 5, brow: 4, nose: 4, mouth: 2, eyeSp: 1, eyeS: 1, eyeH: 1 }], ['閃亮偶像', { eyeType: 6, brow: 1, nose: 1, mouth: 4, eyeSp: 1, eyeS: 1.05, eyeH: 1.15 }], ['熱血硬漢', { eyeType: 2, brow: 2, nose: 3, mouth: 2, eyeSp: .98, eyeS: 1, eyeH: 1 }], ['呆萌驚嚇', { eyeType: 1, brow: 3, nose: 1, mouth: 5, eyeSp: 1.06, eyeS: 1.1, eyeH: 1.2 }]];
  /* 造型組合：髮型＋髮色＋配件一鍵套用（可再個別微調） */
  const STYLES = [['校園球星', { hair: 'sidepart', hairCol: '#2b2018', glasses: 0, headband: false, necklace: false, wristband: true, accCol: '#2f6fe8', beard: 0, burn: false, eyeblack: true }], ['街頭潮流', { hair: 'fade', hairCol: '#15110e', glasses: 3, headband: false, necklace: true, wristband: true, accCol: '#e8c040', beard: 0, burn: true, eyeblack: false }], ['學院書生', { hair: 'curtain', hairCol: '#4a3624', glasses: 1, headband: false, necklace: false, wristband: false, accCol: '#e8e8f0', beard: 0, burn: false, eyeblack: false }], ['熱血少年', { hair: 'spiky', hairCol: '#d8402e', glasses: 0, headband: true, necklace: false, wristband: true, accCol: '#e8e8f0', beard: 0, burn: false, eyeblack: true }], ['復古油頭', { hair: 'slick', hairCol: '#15110e', glasses: 2, headband: false, necklace: false, wristband: false, accCol: '#e8c040', beard: 4, burn: true, eyeblack: false }], ['雙馬尾少女', { hair: 'twintail', hairCol: '#ff7ab8', tipCol: '#8a44d8', glasses: 0, headband: false, necklace: false, wristband: true, accCol: '#ff7ab8', beard: 0, burn: false, eyeblack: false }], ['高馬尾運動風', { hair: 'hipony', hairCol: '#6a4a2c', tipCol: '#d8402e', glasses: 3, headband: true, necklace: false, wristband: true, accCol: '#d8402e', beard: 0, burn: false, eyeblack: false }], ['粗獷大叔', { hair: 'shaggy', hairCol: '#8a8a90', glasses: 0, headband: false, necklace: true, wristband: false, accCol: '#e8c040', beard: 3, burn: true, eyeblack: false }], ['狼尾搖滾', { hair: 'wolf', hairCol: '#2f6fe8', tipCol: '#27a6d8', glasses: 2, headband: false, necklace: true, wristband: true, accCol: '#e8e8f0', beard: 0, burn: true, eyeblack: false }], ['光頭猛將', { hair: 'bald', hairCol: '#15110e', glasses: 3, headband: false, necklace: true, wristband: true, accCol: '#e8c040', beard: 2, burn: false, eyeblack: true }]];
  const BEARD = [[0, '無'], [1, '淡鬍渣'], [2, '鬍渣'], [3, '山羊鬍'], [4, '小鬍子']];
  const BAT = [['R', '右打'], ['L', '左打'], ['S', '左右開弓']], THR = [['R', '右投'], ['L', '左投']];
  const PRESET = [['lean', '瘦長', { cm: 186, kg: 70, muscle: .95 }], ['avg', '標準', { cm: 178, kg: 76, muscle: 1 }], ['stout', '結實', { cm: 174, kg: 88, muscle: 1.05 }], ['muscle', '肌肉', { cm: 182, kg: 94, muscle: 1.28 }], ['round', '圓潤', { cm: 176, kg: 104, muscle: .95 }], ['small', '嬌小', { cm: 167, kg: 64, muscle: .95 }], ['tall', '高壯', { cm: 195, kg: 108, muscle: 1.15 }], ['giant', '巨漢', { cm: 198, kg: 122, muscle: 1.1 }], ['tiny', '迷你', { cm: 161, kg: 57, muscle: .9 }]];
  const SKIN_SW = ['#fbe3d0', '#ffd6b0', '#f6c394', '#eebb8c', '#e3ac7c', '#d79e72', '#c98f64', '#a8714a', '#8a5a3a', '#6e4630', '#563522', '#4a2e1e'];
  const HAIR_SW = ['#15110e', '#2b2018', '#4a3624', '#6a4a2c', '#8a6a40', '#b8905a', '#d8b868', '#8a8a90', '#d0d0d4', '#8a1f1f', '#d8402e', '#ff7ab8', '#8a44d8', '#2f6fe8', '#27a6d8', '#1fb85a', '#f2e29a', '#e9e9f0'];
  const ZODIAC = [[1, 20, '水瓶座'], [2, 19, '雙魚座'], [3, 21, '牡羊座'], [4, 20, '金牛座'], [5, 21, '雙子座'], [6, 22, '巨蟹座'], [7, 23, '獅子座'], [8, 23, '處女座'], [9, 23, '天秤座'], [10, 24, '天蠍座'], [11, 23, '射手座'], [12, 22, '摩羯座']];      // [月, 起始日, 該日起的星座]；1/20 前為摩羯座
  const HEX = /^#[0-9a-f]{6}$/i;
  /* 二刀流（pos='TWP'、two=true）：13d 實作完「同場雙身分」後把 CSEASON.twp 設為 true，編輯器才會顯示這個位置；
     在那之前，匯入進來的二刀流角色可以存取、編輯，但按「開始生涯」會被擋下，避免舊版 13d 把它當成單一位置而出錯。 */
  const twpReady = () => { try { return typeof CSEASON !== 'undefined' && CSEASON.twp === true; } catch (e) { return false; } };

  /* ---------- 資料：預設值、檢查、計算 ---------- */
  const teamOf = id => TEAMS.find(t => t.id === id) || TEAMS[0];
  const dim = (y, m) => new Date(y, m, 0).getDate();
  function defaults() {
    return { v: 1, id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36), name: '', num: 7, pos: 'CF', bat: 'R', thr: 'R', team: TEAMS[0].id, by: 2003, bm: 6, bd: 15,
      cm: 178, kg: 76, muscle: 1, head: 1, legs: 1, skin: '#eebb8c', hair: 'short', hairCol: '#15110e', tipCol: '#15110e', beard: 0, burn: false, earring: 0, shades: false, eyeblack: false, eyeSp: 1, eyeS: 1, eyeH: 1.1, ear: 1,
      hatMode: 'std', eyeType: 0, brow: 0, nose: 0, mouth: 0, blush: true, glasses: 0, headband: false, necklace: false, wristband: false, accCol: '#e8c040', sw: 1, gut: 1 };
  }
  function sanitize(x) {
    const d = defaults(), p = Object.assign({}, d, x || {});
    p.name = String(p.name == null ? '' : p.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8);
    p.num = Math.round(cl(+p.num || 0, 0, 99));
    if (!POS.some(a => a[0] === p.pos)) p.pos = d.pos;
    if (p.pos === 'TWP') p.two = true; else delete p.two;      // 舊角色沒有 two 欄位，行為不變
    if (!BAT.some(a => a[0] === p.bat)) p.bat = 'R'; if (!THR.some(a => a[0] === p.thr)) p.thr = 'R';
    if (!TEAMS.some(t => t.id === p.team)) p.team = d.team;
    p.by = Math.round(cl(+p.by || d.by, 1983, 2009)); p.bm = Math.round(cl(+p.bm || 1, 1, 12)); p.bd = Math.round(cl(+p.bd || 1, 1, dim(p.by, p.bm)));
    p.cm = Math.round(cl(+p.cm || d.cm, 160, 200)); p.kg = Math.round(cl(+p.kg || d.kg, 55, 125));
    p.muscle = cl(+p.muscle || 1, .85, 1.3); p.head = cl(+p.head || 1, .88, 1.12); p.legs = cl(+p.legs || 1, .96, 1.14);
    for (const k of ['skin', 'hairCol', 'tipCol']) if (!HEX.test(p[k])) p[k] = d[k];
    if (!HAIR.some(a => a[0] === p.hair)) p.hair = d.hair;
    p.beard = Math.round(cl(+p.beard || 0, 0, 4)); p.earring = Math.round(cl(+p.earring || 0, 0, 2));
    for (const k of ['burn', 'shades', 'eyeblack']) p[k] = !!p[k];
    p.eyeSp = cl(+p.eyeSp || 1, .9, 1.12); p.eyeS = cl(+p.eyeS || 1, .85, 1.15); p.eyeH = cl(+p.eyeH || 1.1, .9, 1.25); p.ear = cl(+p.ear || 1, .8, 1.3);
    if (!HAT.some(a => a[0] === p.hatMode)) p.hatMode = 'std';
    for (const [k, mx] of [['eyeType', 6], ['brow', 5], ['nose', 4], ['mouth', 5], ['glasses', 3]]) p[k] = Math.round(cl(+p[k] || 0, 0, mx));
    for (const k of ['headband', 'necklace', 'wristband']) p[k] = !!p[k];
    p.blush = p.blush !== false && p.blush !== 0 && p.blush !== 'false'; if (!HEX.test(p.accCol)) p.accCol = d.accCol;
    p.sw = cl(+p.sw || 1, .88, 1.2); p.gut = cl(+p.gut || 1, .6, 1.5);
    return p;
  }
  const zodiac = (m, d) => { let z = '摩羯座'; for (const [mm, dd, n] of ZODIAC) if (m > mm || (m === mm && d >= dd)) z = n; return z; };
  const ageOf = p => YEAR - p.by - ((p.bm > 4 || (p.bm === 4 && p.bd > 1)) ? 1 : 0);      // 以 2027/4/1 開季日計算
  const bmiOf = p => p.kg / Math.pow(p.cm / 100, 2);
  const posName = id => (POS.find(a => a[0] === id) || [0, id])[1];
  /* 角色 → vis（欄位名稱、數值範圍與 visFor() 相同，只影響外觀） */
  function toVis(p, bare) {
    /* 身高、胖瘦直接決定整個角色的縮放與寬度；範圍比舊版放寬，高矮胖瘦在球場上一眼看得出來 */
    const bmi = bmiOf(p), h = cl(.8 + (p.cm - 160) / 40 * .4, .8, 1.22), w = cl(.78 + (bmi - 17.5) / 17 * .72, .78, 1.5);
    return { h, w, d: cl(1 + (w - 1) * .55, .9, 1.3), hs: p.head, ll: p.legs, lw: cl(.9 + (w - 1) * .7, .82, 1.4), aw: cl((.92 + (w - 1) * .8) * p.muscle, .82, 1.45), al: 1,
      belly: bmi > 25 ? cl((bmi - 25) / 9 * .5 * p.gut, 0, .75) : 0, sw: p.sw, skin: p.skin, hair: p.hair, hairCol: p.hairCol, tipCol: p.tipCol, beardCol: p.hairCol, burn: p.burn, beard: p.beard,
      braids: 2, dreadN: 10, dreadL: .7, earring: p.earring, shades: p.shades, eyeblack: p.eyeblack, eyeSp: p.eyeSp, eyeS: p.eyeS, eyeH: p.eyeH, ear: p.ear,
      hatMode: bare ? 'bare' : p.hatMode, eyeType: p.eyeType, brow: p.brow, nose: p.nose, mouth: p.mouth, blush: p.blush, glasses: p.glasses, headband: p.headband, necklace: p.necklace, wristband: p.wristband, accCol: p.accCol };
  }

  /* ---------- 頭像／全身像：獨立的離屏 three.js 場景（不影響主場景與主迴圈） ---------- */
  const PR = { r: null, cv: null, scene: null, cam: null, cache: new Map(), shared: null };
  function prInit() {
    if (PR.r) return true;
    try {
      PR.cv = document.createElement('canvas');
      PR.r = new THREE.WebGLRenderer({ canvas: PR.cv, alpha: true, antialias: true, preserveDrawingBuffer: true }); PR.r.setPixelRatio(1); PR.r.setClearColor(0x000000, 0);
      PR.scene = new THREE.Scene(); PR.scene.add(new THREE.AmbientLight(0xffffff, .85)); const dl = new THREE.DirectionalLight(0xffffff, .6); dl.position.set(2, 4, 5); PR.scene.add(dl);
      PR.cam = new THREE.PerspectiveCamera(30, 1, .1, 50); return true;
    } catch (e) { console.error(e); PR.r = null; return false; }
  }
  function sharedGeos() {
    if (PR.shared) return PR.shared; const S = PR.shared = new Set();
    try { for (const k in GEO) if (GEO[k] && GEO[k].isBufferGeometry) S.add(GEO[k]); } catch (e) { }
    for (const g of [typeof EAR_GEO !== 'undefined' && EAR_GEO, typeof PEL_GEO !== 'undefined' && PEL_GEO, typeof BUCKLE_GEO !== 'undefined' && BUCKLE_GEO, typeof COLLAR_GEO !== 'undefined' && COLLAR_GEO, typeof NUM_GEO !== 'undefined' && NUM_GEO, typeof WEB_GEO !== 'undefined' && WEB_GEO, typeof shadowGeo !== 'undefined' && shadowGeo]) if (g) S.add(g);
    return S;
  }
  function portrait(p, o) {
    o = o || {}; const mode = o.mode || 'full', w = o.w || 240, h = o.h || 320, yaw = o.yaw || 0, key = (o.bare ? 'B' : '') + mode + '|' + w + 'x' + h + '|' + yaw.toFixed(2) + '|' + JSON.stringify(p);
    if (PR.cache.has(key)) return PR.cache.get(key); if (!prInit()) return '';
    let rig = null, url = '';
    try {
      const T = teamOf(p.team), vis = toVis(p, o.bare);
      rig = makeChibi({ jersey: T.c1, pants: '#f4f4f4', cap: T.c1, belt: '#222', vis, pl: { name: p.name || '新人', num: p.num } });
      rig.root.rotation.y = yaw; PR.scene.add(rig.root);
      PR.r.setSize(w, h, false); PR.cam.aspect = w / h;
      if (mode === 'bust') { const hy = 1.62 * vis.h; PR.cam.fov = 26; PR.cam.position.set(0, hy + .02, 3.1); PR.cam.lookAt(0, hy - .06, 0); }
      else { const d = (2.3 * 1.22 + .3) / (2 * Math.tan(15 * Math.PI / 180)); PR.cam.fov = 30; PR.cam.position.set(0, 1.4, d); PR.cam.lookAt(0, 1.4, 0); }      // 全身像用固定鏡頭：高個子頭頂更高、矮個子更低，身型差異才看得出來
      PR.cam.updateProjectionMatrix(); PR.r.render(PR.scene, PR.cam); url = PR.cv.toDataURL('image/png');
    } catch (e) { console.error(e); }
    if (rig) { PR.scene.remove(rig.root); const S = sharedGeos(); rig.root.traverse(m => { if (m.geometry && !S.has(m.geometry)) m.geometry.dispose(); }); }
    if (url) { if (PR.cache.size > 60) PR.cache.delete(PR.cache.keys().next().value); PR.cache.set(key, url); }
    return url;
  }

  /* ---------- 球員卡（結算畫面與編輯器預覽共用） ---------- */
  function cardHtml(p, stats, cls) {
    p = sanitize(p); const T = teamOf(p.team), img = portrait(p, { mode: 'bust', w: 240, h: 288, yaw: .35 });
    const st = stats && stats.length ? `<div class="cr-st">${stats.map(s => `<span><small>${esc(s[0])}</small><b>${esc(s[1])}</b></span>`).join('')}</div>` : '';
    return `<div class="cr-card ${cls || ''}" style="--c1:${esc(T.c1)};--c2:${esc(T.c2)}"><div class="cr-top"><span>${esc(posName(p.pos))}</span><span>${esc(T.short)}</span></div>` +
      `<div class="cr-pic">${img ? `<img alt="" src="${img}">` : ''}<b class="cr-num">${p.num}</b></div><div class="cr-name">${esc(p.name || '（未命名）')}</div>` +
      `<div class="cr-sub">${esc((BAT.find(a => a[0] === p.bat) || [0, ''])[1])}・${esc((THR.find(a => a[0] === p.thr) || [0, ''])[1])}・${p.cm}cm／${p.kg}kg</div>` +
      `<div class="cr-sub">${p.bm}月${p.bd}日生・${ageOf(p)}歲・${zodiac(p.bm, p.bd)}</div>${st}</div>`;
  }

  /* ---------- 角色存檔 ---------- */
  function readSlot(i) { try { const s = localStorage.getItem(KEY(i)); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeSlot(i, o) { try { localStorage.setItem(KEY(i), JSON.stringify(o)); return true; } catch (e) { return false; } }
  function makeSlot(i, p) { const payload = JSON.stringify({ profile: p }); return { app: APP, fmt: FMT, kind: 'career-profile', slot: i, ts: Date.now(), info: { name: p.name, num: p.num, pos: p.pos, team: p.team }, payload, sum: svHash(payload) }; }
  function openSlot(o) {      // 回傳 sanitize 後的角色；格式錯誤或校驗失敗時丟出錯誤
    if (!o || o.app !== APP || o.kind !== 'career-profile') throw new Error('這不是《中職野球2027》的角色存檔');
    if (!(o.fmt <= FMT)) throw new Error('這份存檔來自較新的版本，請先更新遊戲');
    if (typeof o.payload !== 'string' || o.sum !== svHash(o.payload)) throw new Error('存檔已損毀或被修改');
    const p = sanitize((JSON.parse(o.payload) || {}).profile); if (!p.name) throw new Error('角色資料不完整'); return p;
  }
  const readProfile = i => { const o = readSlot(i); if (!o) return null; try { return openSlot(o); } catch (e) { return { bad: e.message }; } };

  /* ---------- 介面 ---------- */
  const S = { view: 'hub', slot: 1, p: null, tab: 'base', yaw: .5, pbare: false, dirty: false, msg: '', err: false, raf: 0 };
  const TABS = [['base', '基本資料'], ['team', '球隊與位置'], ['style', '造型組合'], ['look', '髮型膚色'], ['face', '五官'], ['acc', '配件帽子'], ['body', '身型'], ['card', '球員卡']];
  const pbare = () => S.pbare || S.tab === 'face' || S.p && S.p.hatMode === 'bare';
  const dlg = () => el('careerStudio');
  function ensureDom() {
    if (dlg()) return; const d = document.createElement('div'); d.id = 'careerStudio'; d.className = 'hide'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); el('wrap').appendChild(d);
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'].forEach(ev => d.addEventListener(ev, e => e.stopPropagation()));
    d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); back(); } });      // 攔住標題畫面的 Enter／Esc／方向鍵處理
    d.addEventListener('click', onClick); d.addEventListener('input', onInput); d.addEventListener('change', onInput);
  }
  function say(t, bad) { S.msg = t; S.err = !!bad; const m = el('crMsg'); if (m) { m.textContent = t; m.className = 'cr-msg' + (bad ? ' bad' : ''); } }
  const fmtTime = ts => { const d = new Date(ts), q = n => String(n).padStart(2, '0'); return `${d.getFullYear()}/${q(d.getMonth() + 1)}/${q(d.getDate())} ${q(d.getHours())}:${q(d.getMinutes())}`; };

  function hubHtml() {
    let rows = '';
    for (let i = 1; i <= N; i++) {
      const p = readProfile(i);
      if (!p) rows += `<div class="cr-slot empty"><div class="cr-no">${i}</div><div class="cr-main"><div class="cr-h">— 空的欄位 —</div><div class="cr-d">還沒有角色</div></div><div class="cr-btns"><button data-a="new" data-i="${i}" class="pri">建立角色</button></div></div>`;
      else if (p.bad) rows += `<div class="cr-slot bad"><div class="cr-no">${i}</div><div class="cr-main"><div class="cr-h">存檔無法讀取</div><div class="cr-d">${esc(p.bad)}</div></div><div class="cr-btns"><button data-a="del" data-i="${i}" class="dng">刪除</button></div></div>`;
      else { const T = teamOf(p.team), o = readSlot(i), img = portrait(p, { mode: 'bust', w: 84, h: 100, yaw: .35 });
        rows += `<div class="cr-slot"><div class="cr-no">${i}</div><div class="cr-thumb" style="--c1:${esc(T.c1)};--c2:${esc(T.c2)}">${img ? `<img alt="" src="${img}">` : ''}</div><div class="cr-main"><div class="cr-h">${esc(p.name)} <small>#${p.num}</small></div><div class="cr-d">${esc(posName(p.pos))}・喜愛 ${esc(T.short)}・${p.bm}/${p.bd}生</div><div class="cr-d t">${fmtTime(o.ts)}</div></div><div class="cr-btns"><button data-a="play" data-i="${i}" class="pri">▶ 開始生涯</button><button data-a="edit" data-i="${i}">編輯</button><button data-a="exp" data-i="${i}">匯出</button><button data-a="del" data-i="${i}" class="dng">刪除</button></div></div>`; }
    }
    return `<div class="cr-box hub"><div class="cr-t">🌟 生涯模式<small>選一個欄位，建立你的球員</small></div><div class="cr-slots">${rows}</div><div class="cr-msg" id="crMsg"></div>` +
      `<div class="cr-foot"><button data-a="imp">📥 匯入角色</button><button data-a="expall">📤 匯出全部</button><button data-a="close">返回主畫面</button></div></div>`;
  }
  const chip = (f, v, label, cur, t) => `<button type="button" class="chip${String(cur) === String(v) ? ' on' : ''}" data-set="${f}" data-v="${esc(v)}" data-t="${t || 's'}">${esc(label)}</button>`;
  const sw = (f, v, cur) => `<button type="button" class="sw${String(cur).toLowerCase() === v ? ' on' : ''}" data-set="${f}" data-v="${v}" style="background:${v}" aria-label="${v}"></button>`;
  const slider = (f, label, min, max, step, val, unit) => `<label class="f sl"><span>${label}</span><input type="range" data-f="${f}" data-t="n" min="${min}" max="${max}" step="${step}" value="${val}"><output data-o="${f}">${unit ? unit(val) : val}</output></label>`;
  const colorIn = (f, v) => `<input type="color" class="clr" data-f="${f}" data-t="c" value="${esc(v)}" title="自訂顏色">`;

  function tabHtml(p) {
    if (S.tab === 'base') {
      const yrs = [], mos = [], dys = []; for (let y = 2009; y >= 1983; y--) yrs.push(`<option${y === p.by ? ' selected' : ''}>${y}</option>`);
      for (let m = 1; m <= 12; m++) mos.push(`<option${m === p.bm ? ' selected' : ''}>${m}</option>`); for (let d = 1; d <= dim(p.by, p.bm); d++) dys.push(`<option${d === p.bd ? ' selected' : ''}>${d}</option>`);
      return `<label class="f"><span>姓名</span><input data-f="name" data-t="s" maxlength="8" placeholder="1～8 個字" value="${esc(p.name)}" autocomplete="off"></label>` +
        `<label class="f"><span>背號</span><input data-f="num" data-t="n" type="number" min="0" max="99" value="${p.num}" class="narrow"></label>` +
        `<div class="f"><span>生日</span><div class="row"><select data-f="by" data-t="n">${yrs.join('')}</select>年<select data-f="bm" data-t="n">${mos.join('')}</select>月<select data-f="bd" data-t="n">${dys.join('')}</select>日</div></div>` +
        `<div class="hint" id="crAge">${ageOf(p)} 歲（以 2027 年 4 月 1 日計）・${zodiac(p.bm, p.bd)}</div>` +
        `<div class="f"><span>打擊</span><div class="row">${BAT.map(a => chip('bat', a[0], a[1], p.bat)).join('')}</div></div><div class="f"><span>投球</span><div class="row">${THR.map(a => chip('thr', a[0], a[1], p.thr)).join('')}</div></div>`;
    }
    if (S.tab === 'team') return `<div class="f col"><span>喜愛球隊（球衣與帽子的顏色）</span><div class="teams">${TEAMS.map(t => `<button type="button" class="tm${t.id === p.team ? ' on' : ''}" data-set="team" data-v="${esc(t.id)}"><i style="background:linear-gradient(135deg,${esc(t.c1)} 50%,${esc(t.c2)} 50%)"></i>${esc(t.short)}</button>`).join('')}</div></div>` +
      `<div class="f col"><span>守備位置</span><div class="row wrap">${POS.filter(a => a[0] !== 'TWP' || twpReady() || p.pos === 'TWP').map(a => chip('pos', a[0], a[1], p.pos)).join('')}</div></div>` +
      (p.pos === 'TWP' ? `<div class="hint">二刀流：同一個角色同時是先發投手與 DH 打者。輪值日先發投球並打 DH，非輪值日只打 DH；投球與打擊成績分開記錄，體能消耗也比單一位置大。</div>` : '');
    if (S.tab === 'look') return `<div class="f col"><span>髮型</span><div class="row wrap">${HAIR.map(a => chip('hair', a[0], a[1], p.hair)).join('')}</div></div>` +
      `<div class="f col"><span>髮色</span><div class="row wrap">${HAIR_SW.map(c => sw('hairCol', c, p.hairCol)).join('')}${colorIn('hairCol', p.hairCol)}</div></div>` +
      `<div class="f col"><span>髮尾／髮圈色（辮子、髒辮、包包頭等）</span><div class="row wrap">${HAIR_SW.map(c => sw('tipCol', c, p.tipCol)).join('')}${colorIn('tipCol', p.tipCol)}</div></div>` +
      `<div class="f col"><span>膚色</span><div class="row wrap">${SKIN_SW.map(c => sw('skin', c, p.skin)).join('')}${colorIn('skin', p.skin)}</div></div>` +
      `<div class="f col"><span>鬍子</span><div class="row wrap">${BEARD.map(a => chip('beard', a[0], a[1], p.beard, 'n')).join('')}</div></div>` +
      '';
    if (S.tab === 'style') return `<div class="f col"><span>一鍵造型（髮型＋髮色＋配件，套用後可再微調）</span><div class="row wrap">${STYLES.map((a, i) => `<button type="button" class="chip" data-style="${i}">${a[0]}</button>`).join('')}</div></div><div class="hint">想自己搭配，到「髮型膚色」「五官」「配件帽子」分頁調整。</div>`;
    if (S.tab === 'face') return `<div class="f col"><span>五官組合（一鍵套用）</span><div class="row wrap">${FACES.map((a, i) => `<button type="button" class="chip" data-face="${i}">${a[0]}</button>`).join('')}</div></div>` +
      `<div class="f col"><span>眼型</span><div class="row wrap">${EYE_T.map(a => chip('eyeType', a[0], a[1], p.eyeType, 'n')).join('')}</div></div>` +
      `<div class="f col"><span>眉毛</span><div class="row wrap">${BROW_T.map(a => chip('brow', a[0], a[1], p.brow, 'n')).join('')}</div></div>` +
      `<div class="f col"><span>鼻子</span><div class="row wrap">${NOSE_T.map(a => chip('nose', a[0], a[1], p.nose, 'n')).join('')}</div></div>` +
      `<div class="f col"><span>嘴巴（有鬍子時不顯示）</span><div class="row wrap">${MOUTH_T.map(a => chip('mouth', a[0], a[1], p.mouth, 'n')).join('')}</div></div>` +
      `<div class="f col"><span>腮紅</span><div class="row wrap">${chip('blush', 1, p.blush ? '有腮紅' : '無腮紅', 1, 'b')}</div></div>` +
      slider('eyeSp', '眼距', .9, 1.12, .01, p.eyeSp) + slider('eyeS', '眼睛大小', .85, 1.15, .01, p.eyeS) + slider('eyeH', '眼睛高度', .9, 1.25, .01, p.eyeH) + slider('ear', '耳朵大小', .8, 1.3, .01, p.ear) +
      `<div class="hint">五官分頁時左側預覽會自動拿掉帽子，方便看臉。</div>`;
    if (S.tab === 'acc') return `<div class="f col"><span>比賽中的帽子／頭盔</span><div class="row wrap">${HAT.map(a => chip('hatMode', a[0], a[1], p.hatMode, 's')).join('')}</div></div>` +
      `<div class="hint">「全程不戴」時頭髮完整露出，守備與跑壘也不戴帽；捕手、主審的護具不受影響。</div>` +
      `<div class="f col"><span>眼鏡</span><div class="row wrap">${GLASS.map(a => chip('glasses', a[0], a[1], p.glasses, 'n')).join('')}</div></div>` +
      `<div class="f col"><span>飾品</span><div class="row wrap">${chip('headband', 1, '髮帶', p.headband ? 1 : 0, 'b')}${chip('necklace', 1, '金屬項鍊', p.necklace ? 1 : 0, 'b')}${chip('wristband', 1, '護腕', p.wristband ? 1 : 0, 'b')}${chip('burn', 1, '鬢角', p.burn ? 1 : 0, 'b')}${chip('eyeblack', 1, '眼下黑膏', p.eyeblack ? 1 : 0, 'b')}${chip('shades', 1, '帽簷墨鏡', p.shades ? 1 : 0, 'b')}</div></div>` +
      `<div class="f col"><span>耳環</span><div class="row wrap">${chip('earring', 0, '無', p.earring, 'n')}${chip('earring', 1, '單耳環', p.earring, 'n')}${chip('earring', 2, '雙耳環', p.earring, 'n')}</div></div>` +
      `<div class="f col"><span>髮帶／項鍊／護腕顏色</span><div class="row wrap">${ACC_SW.map(c => sw('accCol', c, p.accCol)).join('')}${colorIn('accCol', p.accCol)}</div></div>`;
    if (S.tab === 'body') return `<div class="f col"><span>體型預設</span><div class="row wrap">${PRESET.map(a => `<button type="button" class="chip" data-preset="${a[0]}">${a[1]}</button>`).join('')}</div></div>` +
      slider('cm', '身高', 160, 200, 1, p.cm, v => v + ' cm') + slider('kg', '體重', 55, 125, 1, p.kg, v => v + ' kg') + `<div class="hint" id="crBmi">BMI ${bmiOf(p).toFixed(1)}</div>` +
      slider('muscle', '肌肉（手臂粗細）', .85, 1.3, .01, p.muscle) + slider('head', '頭大小', .88, 1.12, .01, p.head) + slider('legs', '腿長', .96, 1.14, .01, p.legs) + slider('sw', '肩膀寬度', .88, 1.2, .01, p.sw) + slider('gut', '肚子大小（體重偏高時）', .6, 1.5, .01, p.gut) + `<div class="hint">身高與胖瘦會直接反映在比賽中的角色大小與體格；左側全身像用固定鏡頭，高矮差異看得出來。</div>`;
    return `<div class="cr-cardwrap" id="crCard">${cardHtml(p, null)}</div><div class="hint">這就是結算畫面會看到的球員卡；左側全身像會隨設定即時更新。</div>`;
  }
  function editHtml() {
    const p = S.p, tabs = TABS.map(t => `<button type="button" class="tab${S.tab === t[0] ? ' on' : ''}" data-tab="${t[0]}">${t[1]}</button>`).join('');
    return `<div class="cr-box edit"><div class="cr-t">${readSlot(S.slot) ? '編輯角色' : '建立角色'}<small>欄位 ${S.slot}</small><button type="button" class="cr-x" data-a="back" aria-label="返回">✕</button></div>` +
      `<div class="cr-body"><div class="cr-prev" style="--c1:${esc(teamOf(p.team).c1)};--c2:${esc(teamOf(p.team).c2)}" id="crPrevBox"><img id="crPrev" alt="角色預覽" src="${portrait(sanitize(p), { mode: 'full', w: 300, h: 400, yaw: S.yaw, bare: pbare() })}"><div class="cr-rot"><button type="button" data-a="rotl" aria-label="向左轉">◀</button><button type="button" data-a="rotr" aria-label="向右轉">▶</button><button type="button" data-a="bare" aria-label="切換帽子">🧢</button></div></div>` +
      `<div class="cr-pane"><div class="tabs">${tabs}</div><div class="cr-tab" id="crTab">${tabHtml(p)}</div></div></div>` +
      `<div class="cr-msg" id="crMsg"></div><div class="cr-foot"><button data-a="rand">🎲 隨機外觀</button><button data-a="back">取消</button><button data-a="save" class="pri">💾 儲存角色</button></div></div>`;
  }
  function render() { const d = dlg(); d.innerHTML = S.view === 'hub' ? hubHtml() : editHtml(); const m = el('crMsg'); if (m && S.msg) { m.textContent = S.msg; m.className = 'cr-msg' + (S.err ? ' bad' : ''); } }
  function renderTab() { const t = el('crTab'); if (t) t.innerHTML = tabHtml(S.p); document.querySelectorAll('#careerStudio .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab)); }
  function refreshPreview() {      // 預覽以 rAF 合併：拖曳滑桿時不會每個事件都渲染
    if (S.raf) return; S.raf = requestAnimationFrame(() => {
      S.raf = 0; const img = el('crPrev'); if (!img) return; const p = sanitize(S.p), T = teamOf(p.team), box = el('crPrevBox');
      img.src = portrait(p, { mode: 'full', w: 300, h: 400, yaw: S.yaw, bare: pbare() }); if (box) { box.style.setProperty('--c1', T.c1); box.style.setProperty('--c2', T.c2); }
      const a = el('crAge'); if (a) a.textContent = `${ageOf(p)} 歲（以 2027 年 4 月 1 日計）・${zodiac(p.bm, p.bd)}`;
      const b = el('crBmi'); if (b) b.textContent = 'BMI ' + bmiOf(p).toFixed(1); const c = el('crCard'); if (c) c.innerHTML = cardHtml(p, null);
    });
  }
  function setField(f, v) { S.p[f] = v; S.dirty = true; }
  const coerce = (v, t) => t === 'n' ? +v : t === 'b' ? !!+v : v;

  function onClick(e) {
    const t = e.target, set = t.closest('[data-set]'), tab = t.closest('[data-tab]'), pre = t.closest('[data-preset]'), act = t.closest('[data-a]');
    if (set && S.view === 'edit') {
      const f = set.dataset.set, tt = set.dataset.t; let v = coerce(set.dataset.v, tt); if (tt === 'b') v = !S.p[f];
      setField(f, v); renderTab(); refreshPreview(); return;
    }
    if (tab) { S.tab = tab.dataset.tab; renderTab(); refreshPreview(); return; }
    const stl = t.closest('[data-style]'), fc = t.closest('[data-face]');
    if (stl && S.view === 'edit') { Object.assign(S.p, STYLES[+stl.dataset.style][1]); S.dirty = true; renderTab(); refreshPreview(); return; }
    if (fc && S.view === 'edit') { Object.assign(S.p, FACES[+fc.dataset.face][1]); S.dirty = true; renderTab(); refreshPreview(); return; }
    if (pre) { const a = PRESET.find(x => x[0] === pre.dataset.preset); Object.assign(S.p, a[2], { head: 1, legs: 1, sw: 1, gut: 1 }); S.dirty = true; renderTab(); refreshPreview(); return; }
    if (act) doAct(act.dataset.a, +act.dataset.i);
  }
  function onInput(e) {
    const t = e.target; if (!t.dataset || !t.dataset.f || S.view !== 'edit') return; const f = t.dataset.f; let v = coerce(t.value, t.dataset.t === 'c' ? 's' : t.dataset.t);
    if (t.dataset.t === 'n' && !isFinite(v)) return; setField(f, v);
    const o = document.querySelector(`#careerStudio [data-o="${f}"]`); if (o) o.textContent = f === 'cm' ? v + ' cm' : f === 'kg' ? v + ' kg' : v;
    if (t.dataset.t === 'c') document.querySelectorAll(`#careerStudio [data-set="${f}"]`).forEach(b => b.classList.remove('on'));
    if (e.type === 'change' && (f === 'by' || f === 'bm')) { S.p.bd = Math.min(S.p.bd, dim(S.p.by, S.p.bm)); renderTab(); }
    refreshPreview();
  }

  /* ---------- 動作 ---------- */
  function back() { if (S.view === 'edit') { if (S.dirty && !confirm('這個角色還沒儲存，確定要離開嗎？')) return; S.view = 'hub'; S.msg = ''; render(); } else close(); }
  function close() { const d = dlg(); if (d) d.classList.add('hide'); try { el('tmCareer').focus(); } catch (e) { } }
  function open() { ensureDom(); S.view = 'hub'; S.msg = ''; render(); dlg().classList.remove('hide'); }
  function startEdit(i, p) { S.view = 'edit'; S.slot = i; S.p = p; S.tab = 'base'; S.yaw = .5; S.pbare = false; S.dirty = !readSlot(i); S.msg = ''; render(); }
  function randomLook() {
    const pk = a => a[Math.floor(Math.random() * a.length)], r = (a, b) => a + (b - a) * Math.random(), q = S.p, pre = pk(PRESET)[2];
    Object.assign(q, { hair: pk(HAIR)[0], hairCol: pk(HAIR_SW), tipCol: pk(HAIR_SW), skin: pk(SKIN_SW), beard: Math.random() < .25 ? pk(BEARD)[0] : 0, burn: Math.random() < .3, earring: Math.random() < .1 ? 1 : 0, shades: Math.random() < .08, eyeblack: Math.random() < .25, eyeType: Math.floor(Math.random() * 7), brow: Math.floor(Math.random() * 6), nose: Math.floor(Math.random() * 5), mouth: Math.floor(Math.random() * 6), glasses: Math.random() < .2 ? 1 + Math.floor(Math.random() * 3) : 0, headband: Math.random() < .1, necklace: Math.random() < .12, wristband: Math.random() < .25, accCol: pk(ACC_SW),
      eyeSp: +r(.94, 1.1).toFixed(2), eyeS: +r(.9, 1.1).toFixed(2), eyeH: +r(.95, 1.2).toFixed(2), ear: +r(.85, 1.2).toFixed(2), cm: pre.cm + Math.round(r(-3, 3)), kg: pre.kg + Math.round(r(-4, 4)), muscle: pre.muscle, head: +r(.94, 1.06).toFixed(2), legs: +r(.98, 1.1).toFixed(2) });
    S.dirty = true; renderTab(); refreshPreview();
  }
  function saveCur() {
    const p = sanitize(S.p); if (!p.name) { S.tab = 'base'; renderTab(); say('請先幫角色取個名字（1～8 個字）', true); return; }
    if (readSlot(S.slot) && !S.dirty) { say('沒有變更'); return; }
    const ok = writeSlot(S.slot, makeSlot(S.slot, p)); if (!ok) { say('瀏覽器儲存空間不足或被停用，無法存檔（可試著刪除舊角色）', true); return; }
    S.p = p; S.dirty = false; CAREER.cur = p; S.view = 'hub'; S.msg = `已儲存「${p.name}」到欄位 ${S.slot}`; S.err = false; render();
  }
  function doAct(a, i) {
    if (a === 'close') close(); else if (a === 'back') back();
    else if (a === 'new') startEdit(i, defaults());
    else if (a === 'edit') { const p = readProfile(i); if (p && !p.bad) startEdit(i, p); }
    else if (a === 'del') { if (confirm(`確定刪除欄位 ${i} 的角色嗎？`)) { try { localStorage.removeItem(KEY(i)); } catch (e) { } say(`已刪除欄位 ${i}`); render(); } }
    else if (a === 'play') { const p = readProfile(i); if (p && !p.bad) { if (p.pos === 'TWP' && !twpReady()) { say('二刀流需要更新後的生涯模組（13d）才能開始，角色已保留。', true); return; } close(); CSEASON.begin(p, i); } }      // 開始生涯：社會甲組三場（js/13d-career-season.js）
    else if (a === 'save') saveCur();
    else if (a === 'rand') randomLook();
    else if (a === 'bare') { S.pbare = !S.pbare; refreshPreview(); }
    else if (a === 'rotl') { S.yaw -= .5; refreshPreview(); } else if (a === 'rotr') { S.yaw += .5; refreshPreview(); }
    else if (a === 'exp') { const o = readSlot(i); if (o) exportFile([o], `cpbl2027-career-slot${i}-${stamp()}.json`); }
    else if (a === 'expall') { const l = []; for (let k = 1; k <= N; k++) { const o = readSlot(k); if (o) l.push(o); } if (!l.length) return say('沒有可匯出的角色', true); exportFile(l, `cpbl2027-career-all-${stamp()}.json`); }
    else if (a === 'imp') pickFile();
  }
  const stamp = () => { const d = new Date(), q = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${q(d.getMonth() + 1)}${q(d.getDate())}-${q(d.getHours())}${q(d.getMinutes())}`; };
  async function exportFile(list, name) {
    const text = JSON.stringify({ app: APP, fmt: FMT, kind: 'career-profile-pack', exported: Date.now(), saves: list });
    try { if (matchMedia('(pointer:coarse)').matches && navigator.canShare) { const f = new File([text], name, { type: 'application/json' }); if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: '中職野球2027 角色存檔' }); say('已開啟分享'); return; } catch (e) { if (e && e.name === 'AbortError') return say('已取消'); } } } } catch (e) { }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500); say('已下載角色存檔');
  }
  function pickFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.style.display = 'none';
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f) return; const rd = new FileReader(); rd.onload = () => importText(String(rd.result || '')); rd.onerror = () => say('檔案讀取失敗', true); rd.readAsText(f); };
    document.body.appendChild(inp); inp.click();
  }
  function importText(text) {
    let j; try { j = JSON.parse(text); } catch (e) { return say('這不是有效的角色存檔', true); }
    const list = j && j.app === APP && j.kind === 'career-profile-pack' && Array.isArray(j.saves) ? j.saves.slice(0, N) : null; if (!list || !list.length) return say('這不是《中職野球2027》的角色存檔', true);
    const profs = []; try { for (const o of list) profs.push(openSlot(o)); } catch (e) { return say(e.message, true); }
    const free = []; for (let i = 1; i <= N; i++) if (!readSlot(i)) free.push(i);
    const plan = profs.map((p, k) => [free[k] || (list[k].slot >= 1 && list[k].slot <= N ? list[k].slot : k + 1), p]);      // 優先放進空欄位，不夠才覆蓋
    const over = plan.filter(([i]) => readSlot(i)).map(([i]) => i); if (over.length && !confirm(`欄位 ${over.join('、')} 已有角色，匯入後會被覆蓋，確定嗎？`)) return;
    let ok = 0; for (const [i, p] of plan) if (writeSlot(i, makeSlot(i, p))) ok++;
    S.msg = ok === plan.length ? `已匯入 ${ok} 個角色` : '瀏覽器儲存空間不足，部分角色匯入失敗'; S.err = ok !== plan.length; render();
  }

  /* ---------- 與比賽存檔、結算畫面銜接 ---------- */
  const api = { cur: null, session: null, open, close, vis: p => toVis(sanitize(p)), portrait: (p, o) => portrait(sanitize(p), o), cardHtml, sanitize, readProfile, zodiac, ageOf, util: { toVis, sanitize, zodiac, ageOf, bmiOf, defaults, dim, makeSlot, openSlot } };
  try { if (typeof SAVE !== 'undefined' && SAVE.hooks) SAVE.hooks.career = { active: () => !!api.session, collect: () => ({ profile: api.session ? api.session.profile : api.cur }), apply: x => { if (x && x.profile) { api.cur = sanitize(x.profile); api.session = { profile: api.cur }; } } }; } catch (e) { console.error(e); }
  /* 結算畫面：11-game-flow.js 的 endGame() 在寫完 #result 後呼叫。session = { profile, player? , stats? }
     player 是比賽中該角色的球員物件（取 player.st 的打數／安打／全壘打／打點）；也可直接給 stats＝[[標籤,值],…] */
  api.attachResult = function (rs) {
    const ss = api.session; if (!ss || !rs) return; const old = rs.querySelector('.cr-resdock'); if (old) old.remove();
    let stats = ss.stats; const st = ss.player && ss.player.st;
    if (!stats && st) stats = [['打數', st.ab || 0], ['安打', st.h || 0], ['全壘打', st.hr || 0], ['打點', st.rbi || 0]];
    if (!ss.stats && ss.profile && ss.profile.two) {      // 二刀流：打擊與投球兩份成績並列（投球由 13d 先整理成 [[標籤,值],…] 放在 statsPit）
      const bp = ss.playerBat && ss.playerBat.st, bs = ss.statsBat || (bp ? [['打數', bp.ab || 0], ['安打', bp.h || 0], ['全壘打', bp.hr || 0], ['打點', bp.rbi || 0]] : (st ? stats : []));
      stats = (bs || []).concat(ss.statsPit || []);
    }
    const w = document.createElement('div'); w.className = 'cr-resdock'; w.innerHTML = cardHtml(ss.profile, stats, 'res'); rs.appendChild(w);
  };
  return api;
})();
