/* ===== 13h-career-story.js ｜ 生涯模式：職業賽季劇情事件引擎（資料驅動）＋示範事件 =====
   載入順序：13g 與 14 之間（見 FILE_MAP.md）。本檔不碰任何其他檔的全域，只靠 ctx／adapter 與外界溝通；
   也能在 Node 底下單獨測試（node test-career-story.js）。
   名詞：
     phase   觸發時間點：'pro_start'（賽季第一場前）／'after_game'（每場結束後）／'season_end'（例行賽打完）／'po_series'（季後賽每輪開打前）／'po_end'（季後賽全部結束）／'offseason'（續約，進入下一年前）
     ctx     遊戲目前狀態快照：{ year, gameNo, starter, apps, trust, lastGame:{played}, team:{playoffQualified?, champion?}, po?:{stage, out?} }
             ※ ctx 沒有提供的欄位 ＝ 條件不成立（例如賽制未實作就不要給 team.playoffQualified）
     state   劇情存檔狀態（純 JSON）：{ v, flags, seen, rel, log }，由 exportState／importState 存讀
     adapter { targets:{ trust:{get,set,min,max} } }：把「遊戲裡真的存在的數值」交給引擎改；沒有的數值（如 fatigue）會略過並回報
   條件格式：{ field, operator, value }；field 可用路徑（'lastGame.played'）或 'event_flags.<旗標>'
             operator：eq ne gt gte lt lte in not_in（也接受 == != > >= < <=）
   效果格式：{ type:'stat_delta', target, value }｜{ type:'relationship_delta', target, value }｜{ type:'flag_set', flag, value }
   安全：單次 stat／關係變動夾在 ±5、信賴度夾 min～max、關係夾 ±100；已看過再 choose 會被拒絕；壞存檔不丟錯。 */
'use strict';
const CSTORY = (function () {
  const MAX_STEP = 5, REL_MAX = 100, LOG_MAX = 60;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const EVENTS = [];

  /* ---------- 登錄 ---------- */
  function register(ev) {
    if (!isObj(ev) || typeof ev.id !== 'string' || !ev.id) throw new Error('event needs id');
    if (typeof ev.phase !== 'string' || !ev.phase) throw new Error('event needs phase: ' + ev.id);
    if (!Array.isArray(ev.choices) || !ev.choices.length || ev.choices.some(c => !isObj(c) || typeof c.id !== 'string')) throw new Error('event needs choices: ' + ev.id);
    if (EVENTS.some(e => e.id === ev.id)) throw new Error('duplicate event id: ' + ev.id);
    EVENTS.push(ev); return ev;
  }
  const all = () => EVENTS.slice();

  /* ---------- 狀態 ---------- */
  const newState = () => ({ v: 1, flags: {}, seen: {}, rel: {}, log: [] });
  function importState(o) {
    const st = newState(); if (!isObj(o) || o.v !== 1) return st;
    if (isObj(o.flags)) for (const k of Object.keys(o.flags)) { const x = o.flags[k]; if (['boolean', 'number', 'string'].indexOf(typeof x) >= 0) st.flags[k] = x; }
    if (isObj(o.seen)) for (const k of Object.keys(o.seen)) {
      const s = o.seen[k]; if (!isObj(s)) continue;
      const e = { n: Math.max(0, Math.floor(+s.n) || 0), last: Math.floor(+s.last) || 0, seasons: {} };
      if (isObj(s.seasons)) for (const y of Object.keys(s.seasons)) if (s.seasons[y]) e.seasons[y] = true;
      st.seen[k] = e;
    }
    if (isObj(o.rel)) for (const k of Object.keys(o.rel)) { const x = +o.rel[k]; if (isFinite(x)) st.rel[k] = cl(Math.round(x), -REL_MAX, REL_MAX); }
    if (Array.isArray(o.log)) st.log = o.log.filter(isObj).slice(-LOG_MAX).map(x => ({ id: String(x.id), choice: String(x.choice), game: Math.floor(+x.game) || 0, year: Math.floor(+x.year) || 0 }));
    return st;
  }
  const exportState = st => JSON.parse(JSON.stringify(importState(st)));

  /* ---------- 條件 ---------- */
  function readField(path, ctx, st) {
    if (typeof path !== 'string') return undefined;
    if (path.indexOf('event_flags.') === 0) return st.flags[path.slice(12)];
    let v = ctx; for (const k of path.split('.')) { if (v == null || typeof v !== 'object') return undefined; v = v[k]; } return v;
  }
  function cmp(a, op, b) {
    switch (op) {
      case 'eq': case '==': case '===': return a === b;
      case 'ne': case '!=': case '!==': return a !== b;
      case 'gt': case '>': return a > b;
      case 'gte': case '>=': return a >= b;
      case 'lt': case '<': return a < b;
      case 'lte': case '<=': return a <= b;
      case 'in': return Array.isArray(b) && b.indexOf(a) >= 0;
      case 'not_in': return Array.isArray(b) && b.indexOf(a) < 0;
      default: return false;
    }
  }
  function condOK(c, ctx, st) { const v = readField(c && c.field, ctx, st); return v !== undefined && v !== null && cmp(v, c.operator, c.value); }      // 缺欄位 ＝ 不成立

  function eligible(ev, ctx, st, phase) {
    if (ev.phase !== phase) return false;
    const seen = st.seen[ev.id], year = String(Math.floor(+ctx.year) || 0), g = Math.floor(+ctx.gameNo) || 0;
    if (ev.once_per_career && seen) return false;
    if (ev.once_per_season && seen && seen.seasons[year]) return false;
    if (ev.cooldown_games && seen && g - seen.last < ev.cooldown_games) return false;
    return (ev.conditions || []).every(c => condOK(c, ctx, st));
  }
  function available(ctx, phase, st) {
    ctx = ctx || {}; st = st || newState();
    return EVENTS.filter(e => eligible(e, ctx, st, phase)).map((e, i) => ({ e, i })).sort((a, b) => (b.e.priority || 0) - (a.e.priority || 0) || a.i - b.i).map(x => x.e);
  }
  const next = (ctx, phase, st) => available(ctx, phase, st)[0] || null;      // 同一時間點一次只回傳一個

  /* ---------- 選擇與效果 ---------- */
  function choose(st, eventId, choiceId, ctx, phase, adapter) {
    ctx = ctx || {};
    const ev = EVENTS.find(e => e.id === eventId); if (!ev) return { ok: false, error: 'no_event' };
    if (!eligible(ev, ctx, st, phase)) return { ok: false, error: 'not_eligible' };
    const ch = ev.choices.find(c => c.id === choiceId); if (!ch) return { ok: false, error: 'no_choice' };
    const applied = [], skipped = [], targets = (adapter && adapter.targets) || {};
    for (const ef of (ch.effects || [])) {
      if (!ef) continue;
      if (ef.type === 'stat_delta') {
        const t = targets[ef.target]; if (!t || typeof t.get !== 'function' || typeof t.set !== 'function') { skipped.push(ef.target); continue; }
        const d = cl(Math.round(+ef.value) || 0, -MAX_STEP, MAX_STEP), cur = +t.get(), nv = cl(cur + d, t.min == null ? -Infinity : t.min, t.max == null ? Infinity : t.max);
        t.set(nv); applied.push({ type: ef.type, target: ef.target, value: nv - cur, clamped: d !== ef.value || nv !== cur + d });
      } else if (ef.type === 'relationship_delta') {
        const d = cl(Math.round(+ef.value) || 0, -MAX_STEP, MAX_STEP), cur = st.rel[ef.target] || 0, nv = cl(cur + d, -REL_MAX, REL_MAX);
        st.rel[ef.target] = nv; applied.push({ type: ef.type, target: ef.target, value: nv - cur, clamped: d !== ef.value || nv !== cur + d });
      } else if (ef.type === 'flag_set') {
        st.flags[ef.flag] = ef.value === undefined ? true : ef.value; applied.push({ type: ef.type, target: ef.flag, value: st.flags[ef.flag] });
      } else skipped.push(String(ef.type));
    }
    const year = String(Math.floor(+ctx.year) || 0), g = Math.floor(+ctx.gameNo) || 0, s = st.seen[ev.id] || (st.seen[ev.id] = { n: 0, last: 0, seasons: {} });
    s.n++; s.last = g; s.seasons[year] = true; st.flags[ev.id + '_DONE'] = true;
    st.log.push({ id: ev.id, choice: ch.id, game: g, year: Math.floor(+ctx.year) || 0 }); if (st.log.length > LOG_MAX) st.log.shift();
    return { ok: true, applied, skipped, text: ch.result || [] };
  }

  /* ---------- 示範事件（虛構情節；數值只用遊戲真的有的「信賴度」，其餘存在 rel／flags） ---------- */
  const E = (field, operator, value) => ({ field, operator, value });
  register({
    id: 'PRO_Y1_FIRST_DAY', phase: 'pro_start', title: '開季前的休息室', once_per_career: true, priority: 10,
    conditions: [E('year', 'eq', 1), E('starter', 'eq', false)],
    text: ['{team}的休息室裡，櫃子上整齊掛著你的球衣。', '前輩們各自忙著綁鞋帶、貼護具，沒有人特別多看你一眼——你知道，這裡要靠成績說話。', '教練從門口走過，朝你點了點頭：「開季了，自己想清楚要怎麼準備。」'],
    choices: [
      { id: 'drills', label: '主動留下來加練', hint: '信賴度 +2・教練關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 3 }], result: ['全隊散場後，你一個人還在打擊籠裡。', '教練站在籠外看了很久，什麼也沒說，只在離開前把燈留給你。'] },
      { id: 'observe', label: '靜靜觀察前輩怎麼準備', hint: '信賴度 +1・前輩關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'veteran', value: 3 }], result: ['你把前輩的熱身順序一項一項記進腦子裡。', '有位老將注意到你的目光，丟了一句：「想學就坐近一點。」'] },
      { id: 'ask', label: '向教練請教自己的定位', hint: '信賴度 +1・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'flag_set', flag: 'ASKED_ROLE' }], result: ['教練沒有給你保證，只說：「球隊需要的是隨時準備好的人。」', '你把這句話記了下來。'] }
    ]
  });
  register({
    id: 'PRO_FIRST_APPEARANCE', phase: 'after_game', title: '第一次站上一軍', once_per_career: true, priority: 20,
    conditions: [E('apps', 'gte', 1), E('lastGame.played', 'eq', true)],
    text: ['比賽結束，球場的燈還亮著。', '你第一次穿著{team}的球衣踏上這片場地，不管結果如何，這一天都已經寫進了你的職棒履歷。'],
    choices: [
      { id: 'savor', label: '把這一刻好好記在心裡', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'SAVORED_DEBUT' }], result: ['你在更衣室角落坐了一會兒，才慢慢收拾東西。', '回家的路上，你一直在想：這只是開始。'] },
      { id: 'refocus', label: '立刻回頭檢討內容', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你主動把剛才的每個細節整理給教練聽。', '教練難得地笑了一下：「還沒下班，就先想著下一場了。」'] }
    ]
  });
  register({
    id: 'PRO_BENCH_SLUMP', phase: 'after_game', title: '板凳上的低潮', cooldown_games: 20, priority: 30,
    conditions: [E('starter', 'eq', false), E('apps', 'gte', 5), E('trust', 'lte', 35)],
    text: ['連續好幾場，你大多時間都坐在板凳上看比賽。', '偶爾上場，表現也沒能讓教練多給你幾次機會。你開始懷疑，自己是不是真的屬於這裡。'],
    choices: [
      { id: 'talk', label: '找教練坦白談一談', hint: '信賴度 +2・教練關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 3 }], result: ['教練聽完你的想法，指出了兩個你沒注意到的小問題。', '「機會會來，」他說，「但要先把這兩件事做好。」'] },
      { id: 'extra', label: '把心思全放進加練', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'SLUMP_EXTRA_TRAINING' }], result: ['你把練習時間排得更滿，手上的繭一層又一層。', '沒有人說什麼，但你知道有人在看。'] },
      { id: 'patience', label: '沉住氣，等待機會', hint: '隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 2 }], result: ['你在板凳上替隊友加油、遞毛巾，也看清了每個人的習慣。', '有位隊友小聲說：「你這樣的人，遲早會被看見。」'] }
    ]
  });
  register({
    id: 'PRO_PROMOTED_STARTER', phase: 'after_game', title: '升為先發', once_per_career: true, priority: 40,
    conditions: [E('starter', 'eq', true)],
    text: ['教練把名單貼在牆上，你的名字出現在先發欄位。', '從板凳到先發，你靠的是一場又一場累積下來的表現。隊友一個接一個拍了拍你的肩膀。'],
    choices: [
      { id: 'thank', label: '向教練與前輩道謝', hint: '教練關係 +3・前輩關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'relationship_delta', target: 'veteran', value: 2 }], result: ['你鞠躬道謝，教練只回了一句：「別謝我，上場去證明。」'] },
      { id: 'prove', label: '告訴自己：這只是起點', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你把名單的照片存了起來，不是為了紀念，而是提醒自己：先發的位置，永遠不是理所當然。'] }
    ]
  });
  register({
    id: 'PRO_PLAYOFF_PUSH', phase: 'season_end', title: '最後的衝刺', once_per_season: true, priority: 50,
    conditions: [E('team.playoffQualified', 'eq', true)],
    text: ['例行賽落幕，{team}拿到了季後賽門票。', '休息室裡的氣氛和春天完全不同——每個人都知道，接下來每一球都更沉重。'],
    choices: [
      { id: 'all_in', label: '全力以赴，什麼都不留', hint: '信賴度 +3・隊友關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 3 }, { type: 'relationship_delta', target: 'team', value: 3 }], result: ['你在全隊會議上說：「不管輪到誰，我都準備好了。」', '沒有人笑你太用力，因為大家都是這麼想的。'] },
      { id: 'calm', label: '保持平常心，做好分內事', hint: '信賴度 +1・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你照著例行賽的節奏準備，一個步驟也沒有省。', '教練看在眼裡，點了點頭。'] }
    ]
  });
  register({
    id: 'PRO_SEASON_REVIEW', phase: 'season_end', title: '球季檢討', once_per_season: true, priority: 50,
    conditions: [E('team.playoffQualified', 'eq', false)],
    text: ['這個球季，{team}沒能打進季後賽。', '球場漸漸安靜下來，你坐在更衣室裡，把這一年的每一場、每一次上場，在腦中重新走過一遍。'],
    choices: [
      { id: 'learn', label: '把教訓一條一條寫下來', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你寫滿了整整三頁，最後一行是：「明年要更早準備。」'] },
      { id: 'rest', label: '先好好休息，讓身體恢復', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['你關掉手機，睡了很久很久的一覺。醒來時，窗外已經有一點冬天的味道。'] },
      { id: 'goal', label: '替明年立下一個明確的目標', hint: '旗標：已立下目標', effects: [{ type: 'flag_set', flag: 'NEXT_SEASON_GOAL' }], result: ['你在筆記本上寫下一個數字，然後把它貼在每天一睜眼就能看到的地方。'] }
    ]
  });

  /* ---------- 季後賽專屬事件（虛構情節；phase：'po_series'＝你的球隊每輪系列賽開打前；'po_end'＝季後賽全部結束後）
     ctx.po.stage：'ch'（季後挑戰賽）／'final'（台灣大賽）；po_end 時 ctx.po.out 為 'ch'／'final'（被淘汰的輪次）、ctx.team.champion 為是否奪冠 ---------- */
  register({
    id: 'PRO_PO_CH_EVE_BENCH', phase: 'po_series', title: '挑戰賽前夜', once_per_season: true, priority: 60,
    conditions: [E('po.stage', 'eq', 'ch'), E('starter', 'eq', false)],
    text: ['季後挑戰賽前一天，{team}的練習特別安靜。', '你知道自己多半還是坐在板凳，但這種比賽，教練隨時可能把你叫上場——一個代打、一次代跑，就可能決定一場。'],
    choices: [
      { id: 'ready', label: '把「隨時上場」的準備流程再走一遍', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你從熱身、揮棒到心跳的節奏，一項一項重新演練。', '教練路過時只說：「就是這樣，準備好的人才有機會。」'] },
      { id: 'cheer', label: '當好板凳上的第一個加油聲', hint: '隊友關係 +3', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }], result: ['你比誰都早到休息區，毛巾、水、加油聲，一樣都沒少。', '有人拍拍你：「有你在，板凳不會冷。」'] },
      { id: 'calm', label: '深呼吸，把它當成普通的一天', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['你提醒自己：緊張的人太多了，不差你一個。', '睡前，你把球衣整整齊齊掛好。'] }
    ]
  });
  register({
    id: 'PRO_PO_CH_EVE_STARTER', phase: 'po_series', title: '挑戰賽前夜', once_per_season: true, priority: 60,
    conditions: [E('po.stage', 'eq', 'ch'), E('starter', 'eq', true)],
    text: ['季後挑戰賽前一天，教練在戰術會議上提到你的名字。', '這不再是例行賽——輸一場就可能整季結束。你第一次覺得，先發的位置有這麼重。'],
    choices: [
      { id: 'routine', label: '照例行賽的節奏準備，不多不少', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你一個步驟也沒省，也沒有多加任何一個。', '教練看了你一眼，點點頭。'] },
      { id: 'lead', label: '主動找隊友聊聊明天的打法', hint: '信賴度 +1・隊友關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'team', value: 3 }], result: ['你把自己看到的對手習慣一條條說出來，有人拿筆記了下來。', '會議結束時，氣氛比開始時輕鬆了一點。'] },
      { id: 'video', label: '關起門來再看一次對手影片', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你把每個球種、每個習慣動作都看到幾乎能背起來。', '關燈時，你腦中只剩下明天的第一個打席（或第一球）。'] }
    ]
  });
  register({
    id: 'PRO_PO_FINAL_EVE', phase: 'po_series', title: '台灣大賽前夕', once_per_season: true, priority: 60,
    conditions: [E('po.stage', 'eq', 'final')],
    text: ['{team}站上了台灣大賽的舞台。', '看板、媒體、加班趕來的球迷——所有人的目光都比平常多了一倍。你在更衣室裡聽見自己的心跳，比任何時候都清楚。'],
    choices: [
      { id: 'embrace', label: '享受這個舞台，這輩子沒幾次', hint: '信賴度 +2・隊友關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你深吸一口氣，對自己說：能站在這裡，本身就已經不簡單。', '緊張還在，但它不再把你往下拉。'] },
      { id: 'veteran', label: '去問前輩：第一次打總冠軍賽是什麼感覺', hint: '前輩關係 +4', effects: [{ type: 'relationship_delta', target: 'veteran', value: 4 }], result: ['老將笑了笑：「手會抖，這是正常的。上場以後，只管眼前這一球。」', '你把這句話記進心裡。'] },
      { id: 'focus', label: '關掉手機與訊息，只留比賽', hint: '信賴度 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 3 }, { type: 'flag_set', flag: 'FINAL_FOCUS_MODE' }], result: ['你把螢幕朝下蓋在櫃子裡。', '外面的聲音全部退到很遠，只剩下你和下一場比賽。'] }
    ]
  });
  register({
    id: 'PRO_PO_CHAMPION', phase: 'po_end', title: '總冠軍之夜', once_per_season: true, priority: 70,
    conditions: [E('team.champion', 'eq', true)],
    text: ['最後一個出局數落進手套的瞬間，整個球場炸開了。', '{team}拿下了總冠軍。你被人群推著、抱著、潑了一身香檳——不管這一年你上場了幾次，這一刻，你就在這支球隊裡。'],
    choices: [
      { id: 'share', label: '把這份榮耀分給每一個人', hint: '隊友關係 +4・教練關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 4 }, { type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'flag_set', flag: 'WON_TITLE' }], result: ['你一個一個擁抱隊友、教練、防護員，連場邊的工作人員都沒漏。', '那晚的合照裡，你笑得比誰都用力。'] },
      { id: 'quiet', label: '一個人在空蕩的球場多待一會兒', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'WON_TITLE' }], result: ['人群散去後，你站在投手丘旁，看著滿地的彩帶。', '你知道，這一晚會是這輩子都記得的一晚。'] },
      { id: 'next', label: '舉杯之後，已經開始想明年', hint: '信賴度 +3・旗標：想衛冕', effects: [{ type: 'stat_delta', target: 'trust', value: 3 }, { type: 'flag_set', flag: 'WON_TITLE' }, { type: 'flag_set', flag: 'WANT_REPEAT' }], result: ['香檳還沒乾，你已經在腦中排好了休賽季的訓練。', '冠軍不是終點——你很清楚。'] }
    ]
  });
  register({
    id: 'PRO_PO_LOST_FINAL', phase: 'po_end', title: '差一步的總冠軍', once_per_season: true, priority: 70,
    conditions: [E('po.out', 'eq', 'final')],
    text: ['台灣大賽的最後一戰結束了，對手在場中央圍成一圈慶祝。', '{team}的休息區很安靜，有人低著頭，有人望著天花板。離冠軍，只差這麼一步。'],
    choices: [
      { id: 'console', label: '走過去，拍拍低頭的隊友', hint: '隊友關係 +4', effects: [{ type: 'relationship_delta', target: 'team', value: 4 }], result: ['你沒說什麼大道理，只是一個一個拍過肩膀。', '有人抬起頭，擠出一個苦笑。'] },
      { id: 'remember', label: '把這份不甘心記下來', hint: '信賴度 +2・旗標：不甘心', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'FINAL_REGRET' }], result: ['你在筆記本最後一頁，只寫了兩個字：明年。', '你合上本子，把它放進球袋最底層。'] },
      { id: 'respect', label: '向對手致意，認輸也要有風度', hint: '教練關係 +2・隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你走到對手休息區前，脫帽鞠躬。', '對方有人回禮，兩邊的球迷都為此鼓掌。'] }
    ]
  });
  register({
    id: 'PRO_PO_LOST_CH', phase: 'po_end', title: '止步季後挑戰賽', once_per_season: true, priority: 70,
    conditions: [E('po.out', 'eq', 'ch')],
    text: ['季後挑戰賽結束，{team}的賽季也跟著畫上句點。', '離進入台灣大賽只差幾個勝場。你坐在休息區，看著場上的燈一盞一盞熄滅。'],
    choices: [
      { id: 'thank', label: '向教練與隊友說聲辛苦了', hint: '教練關係 +3・隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你在更衣室門口對每個人說了一句「辛苦了」。', '有人回你：「明年再來。」'] },
      { id: 'fuel', label: '把這場輸球當成明年的燃料', hint: '信賴度 +2・旗標：想雪恥', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'CH_REGRET' }], result: ['你把比賽中最想重來的那個瞬間，一幀一幀記了下來。', '明年的某一天，你會讓它不一樣。'] },
      { id: 'rest', label: '先放下，讓身心好好休息', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['你回家，關上門，把球袋丟在玄關。', '這一晚，你什麼都不想。'] }
    ]
  });

  /* ---------- 例行賽中段事件（after_game；每季各一次，條件用場數／信賴度／先發，不依賴遊戲沒有的數值） ---------- */
  register({
    id: 'PRO_MID_TEAMMATE', phase: 'after_game', title: '更衣室的閒聊', once_per_season: true, priority: 15,
    conditions: [E('gameNo', 'gte', 30)],
    text: ['賽季過了四分之一，{team}的更衣室比春天熟悉多了。', '賽後，一位年資比你高的隊友邀你一起收拾場邊的器材，順口問起：「這一路下來，你覺得自己最需要補什麼？」'],
    choices: [
      { id: 'honest', label: '老實說出自己的弱點', hint: '前輩關係 +3・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'veteran', value: 3 }, { type: 'stat_delta', target: 'trust', value: 1 }], result: ['他聽完沒笑你，反而分享了自己新人時期踩過的坑。', '「慢慢來，」他說，「這件事每個人都走過。」'] },
      { id: 'ask_back', label: '反問他當年是怎麼熬過來的', hint: '前輩關係 +4', effects: [{ type: 'relationship_delta', target: 'veteran', value: 4 }], result: ['他講了一個你沒聽過的故事，講到一半自己先笑了出來。', '那天回家的路上，你覺得這個球季比想像中短一點。'] },
      { id: 'joke', label: '笑著帶過，把話題丟回去', hint: '隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 2 }], result: ['你們就這樣東拉西扯地收完了東西。', '有些話不用說清楚，氣氛已經夠了。'] }
    ]
  });
  register({
    id: 'PRO_ALLSTAR_BREAK', phase: 'after_game', title: '明星賽週的空檔', once_per_season: true, priority: 16,
    conditions: [E('gameNo', 'gte', 58)],
    text: ['球季過半，聯盟進入明星賽週，{team}難得有幾天不用比賽。', '不管名單上有沒有你的名字，這段空檔都是整季最少見的喘息。你得決定怎麼用它。'],
    choices: [
      { id: 'train', label: '趁空檔補強練習量', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['別人在休息，你一個人在空曠的球場把基本動作重練一遍。', '汗水落在草皮上，很快就乾了。'] },
      { id: 'rest', label: '徹底放鬆，把身體養好', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'ALLSTAR_BREAK_REST' }], result: ['你睡到自然醒，煮了一頓像樣的早餐。', '下半季要打的比賽還很多，你知道這種日子不多。'] },
      { id: 'family', label: '回家陪陪家人與朋友', hint: '隊友關係 +1・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'team', value: 1 }, { type: 'stat_delta', target: 'trust', value: 1 }], result: ['桌上的菜比平常多了兩道，大家都在問你比賽的事。', '你發現，被人惦記的感覺會變成很實在的力氣。'] }
    ]
  });
  register({
    id: 'PRO_STARTER_SLUMP', phase: 'after_game', title: '先發的低潮', cooldown_games: 25, priority: 31,
    conditions: [E('starter', 'eq', true), E('trust', 'lte', 40), E('gameNo', 'gte', 20)],
    text: ['先發名單上還有你的名字，但這幾場的內容連你自己看了都皺眉。', '你知道，教練的耐心不會無限延長。'],
    choices: [
      { id: 'fundamentals', label: '回頭檢查最基本的動作', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你把影片一格一格倒回去看，終於找到那個小小的壞習慣。', '改起來不容易，但至少，你知道從哪裡開始。'] },
      { id: 'consult', label: '找前輩聊聊怎麼走出低潮', hint: '前輩關係 +3・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'veteran', value: 3 }, { type: 'stat_delta', target: 'trust', value: 1 }], result: ['老將只說了一句：「低潮不是你變差了，是你開始想太多。」', '你想了很久，才懂這句話的意思。'] },
      { id: 'simple', label: '把比賽想得簡單一點', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['下一場，你只給自己一個任務：把眼前這一球處理好。', '複雜的事，就留給賽後再想。'] }
    ]
  });
  register({
    id: 'PRO_HOT_STREAK', phase: 'after_game', title: '手感正熱', once_per_season: true, priority: 32,
    conditions: [E('starter', 'eq', true), E('trust', 'gte', 75)],
    text: ['最近每一場都有好內容，連對手的眼神都和之前不太一樣。', '記者在賽後多問了你幾個問題，隊友開玩笑說：「別把好運用完了。」'],
    choices: [
      { id: 'steady', label: '提醒自己：別被氣氛帶著走', hint: '信賴度 +1・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你把每場的準備流程原封不動地照做。', '教練看著你，沒說什麼，只輕輕點了頭。'] },
      { id: 'credit', label: '把功勞分給隊友', hint: '隊友關係 +3', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }], result: ['面對麥克風，你先謝謝了投手、捕手和守備。', '更衣室裡有人悄悄記住了這件事。'] },
      { id: 'enjoy', label: '好好享受這段時光', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你知道手感不會永遠都在，所以每一場都比平常更專心。', '有些日子，值得被好好記住。'] }
    ]
  });
  register({
    id: 'PRO_LATE_SEASON', phase: 'after_game', title: '球季尾聲的壓力', once_per_season: true, priority: 17,
    conditions: [E('gameNo', 'gte', 100)],
    text: ['只剩最後二十場，休息區的氣氛一天比一天緊。', '不管{team}的名次在哪裡，每一場輸贏都比春天沉重。你的身體也開始提醒你：這是一個很長的球季。'],
    choices: [
      { id: 'adjust', label: '調整作息，把身體顧好', hint: '信賴度 +1・教練關係 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'coach', value: 1 }], result: ['你把睡眠和飲食排得比平常更嚴格。', '防護員點頭說：「這個時候，細節才是差別。」'] },
      { id: 'push', label: '咬牙把每一場都當最後一場', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你不再想排名，也不再想數字，只想把眼前的比賽打完。', '有時候，把事情變簡單，就是最好的辦法。'] },
      { id: 'team_talk', label: '和隊友互相打氣', hint: '隊友關係 +3', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }], result: ['賽前，你們在走廊圍成一圈，什麼都不用多說。', '那一刻，你覺得自己真的是這支球隊的一部分。'] }
    ]
  });
  register({
    id: 'PRO_APPS_TEN', phase: 'after_game', title: '第十次上場', once_per_career: true, priority: 25,
    conditions: [E('apps', 'gte', 10), E('lastGame.played', 'eq', true)],
    text: ['你在賽後的紀錄表上，看到自己的出場數來到了兩位數。', '十次上場不算什麼大數字，但對一個從板凳起步的人來說，每一次都是靠自己換來的。'],
    choices: [
      { id: 'note', label: '在筆記本上記下這個數字', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'APPS_TEN_NOTED' }], result: ['你寫下日期、對手和一行簡短的心得。', '多年之後翻開，也許會笑。'] },
      { id: 'tell', label: '打電話告訴家人', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['電話那頭沉默了一下，然後說：「我們都看了轉播。」', '你站在停車場，鼻子突然有點酸。'] }
    ]
  });

  /* ---------- 多年度：新球季開幕（pro_start，year ≥ 2）與休賽季續約（offseason）。
     沒有真正的合約／薪資系統，所以只存旗標與關係值；選項不會改寫球隊、年資或任何比賽規則 ---------- */
  register({
    id: 'PRO_Y2_OPENING', phase: 'pro_start', title: '第二個球季', once_per_career: true, priority: 12,
    conditions: [E('year', 'eq', 2)],
    text: ['新球季的第一天，{team}的休息室看起來和去年一樣，又好像哪裡不一樣了。', '你不再是那個誰都不認識的新人。這一次，你知道每個人的習慣、每條走廊的盡頭，也更清楚自己想站在哪裡。'],
    choices: [
      { id: 'role', label: '把今年的目標說給教練聽', hint: '教練關係 +3', effects: [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'flag_set', flag: 'Y2_TOLD_GOAL' }], result: ['教練聽完，只是點頭：「很好，用表現說話。」', '你知道，那句話的分量比任何保證都重。'] },
      { id: 'rookie', label: '主動帶新人熟悉環境', hint: '隊友關係 +3・前輩關係 +1', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }, { type: 'relationship_delta', target: 'veteran', value: 1 }], result: ['你想起自己第一天的模樣，拍了拍新人的肩膀。', '「慢慢來，」你說，「這裡比看起來友善。」'] },
      { id: 'grind', label: '默默比去年更早到球場', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['天還沒亮，你已經在球場邊熱身。', '管理員看到你，笑著說：「又是你。」'] }
    ]
  });
  register({
    id: 'PRO_YN_OPENING', phase: 'pro_start', title: '新球季開幕', once_per_season: true, priority: 11,
    conditions: [E('year', 'gte', 16)],
    text: ['又是新的一年，{team}的球衣依然掛在你的櫃子上。', '一路走到這裡，你的名字在聯盟裡已經不再陌生。新的球季，新的對手，也有新的人在看你。'],
    choices: [
      { id: 'prepare', label: '照既定節奏，穩穩地準備', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你把休賽季累積下來的訓練成果，一項一項排進開季前的計畫。', '穩，就是最好的開始。'] },
      { id: 'mentor', label: '和教練談談球隊的方向', hint: '教練關係 +2・隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你們在辦公室聊了很久，從戰術談到更衣室的氣氛。', '離開時，教練說：「有你在，我比較放心。」'] },
      { id: 'fresh', label: '把去年的成績歸零，重新開始', hint: '信賴度 +1・隊友關係 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'team', value: 1 }], result: ['不管去年好或壞，那都已經是過去。', '你把開幕戰的比賽時間貼在櫃子上，一個字一個字讀了出來。'] }
    ]
  });
  register({
    id: 'PRO_RENEW', phase: 'offseason', title: '休賽季的續約談話', once_per_season: true, priority: 10,
    conditions: [E('year', 'gte', 1), E('year', 'lt', 10)],
    text: ['球季落幕，{team}的管理層找你談下一年的安排。', '桌上沒有誇張的數字，只有一份寫著球隊期待與你需要面對的課題的文件。你想用什麼心態面對接下來的合約與去留？'],
    choices: [
      { id: 'sign', label: '好好談，專心準備明年', hint: '教練關係 +2・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'RENEW_SIGNED' }], result: ['你把想法說得清清楚楚，沒有多餘的條件。', '「明年見，」對方說，「好好休息。」'] },
      { id: 'ask_role', label: '希望爭取更多上場機會', hint: '教練關係 +1・信賴度 -1（說出口也有壓力）', effects: [{ type: 'relationship_delta', target: 'coach', value: 1 }, { type: 'stat_delta', target: 'trust', value: -1 }, { type: 'flag_set', flag: 'RENEW_ASKED_ROLE' }], result: ['你把自己的想法一條一條說清楚，管理層沒有當場回應。', '離開時，你不確定這樣算不算好事——但至少，你說出口了。'] },
      { id: 'quiet', label: '低調談完，把焦點留給球隊', hint: '隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 2 }, { type: 'flag_set', flag: 'RENEW_SIGNED' }], result: ['你說完想說的，把文件放回桌上。', '沒有人特別提起這件事，但球隊的人慢慢都知道了。'] }
    ]
  });


  /* ---------- 第 3～15 年主線＋退役（第七版）。全為虛構演出；只用信賴度／關係值／旗標，不改比賽規則。
     縮寫：Ev(id, phase, title, 條件[], 正文[], 選項[[id,標籤,效果,結果[]]], 額外欄位)；效果 { t:信賴度, coach／veteran／team:關係, flag, fv:旗標值 } ---------- */
  const RELN = { coach: '教練', veteran: '前輩', team: '隊友' }, sg = n => (n > 0 ? '+' : '') + n;
  function mkChoice(c) {
    const e = c[2] || {}, effects = [], hint = [];
    if (e.t) { effects.push({ type: 'stat_delta', target: 'trust', value: e.t }); hint.push('信賴度 ' + sg(e.t)); }
    Object.keys(RELN).forEach(k => { if (e[k]) { effects.push({ type: 'relationship_delta', target: k, value: e[k] }); hint.push(RELN[k] + '關係 ' + sg(e[k])); } });
    if (e.flag) effects.push({ type: 'flag_set', flag: e.flag, value: e.fv === undefined ? true : e.fv });
    return { id: c[0], label: c[1], hint: hint.join('・'), effects, result: c[3] || [] };
  }
  const Ev = (id, phase, title, conds, text, choices, o) => register(Object.assign({ id, phase, title, conditions: conds, text, choices: choices.map(mkChoice) }, o || {}));
  const Y = (n, extra) => [E('year', 'eq', n)].concat(extra || []), YO = { once_per_career: true, priority: 15 };

  Ev('PRO_Y3_STARTER_RACE', 'pro_start', '第三年的先發競爭', Y(3), ['第三個球季，名單上和你同位置的人不只一個。', '教練沒有點名誰是先發，只說：「位置是打出來的。」'], [
    ['early', '每天第一個到、最後一個走', { t: 2, coach: 2 }, ['你把基本功拆開，一項一項重練。', '守備教練說：「這樣的人，我會想讓他上場。」']],
    ['rival', '和競爭者互相切磋', { team: 3, veteran: 1 }, ['你和競爭者在場邊對練到天黑。', '兩人都沒說誰贏，但都知道對方變強了。']],
    ['video', '看影片研究自己的缺點', { t: 1, coach: 3 }, ['你熬夜把每個打席（或每次登板）剪成片段。', '隔天，你把整理好的重點交給教練。']]], YO);
  Ev('PRO_Y4_SPOTLIGHT', 'pro_start', '鎂光燈', Y(4), ['媒體開始在賽前找你。有人說你是「下一個明星」，也有人說你只是曇花一現。', '同期的球員被拿來和你比，你的名字開始出現在球迷的討論裡。'], [
    ['humble', '低調回應：把焦點留給球隊', { team: 3, coach: 1 }, ['你只說了一句：「我只是做好今天的工作。」', '隊友笑著說：「這種回答，記者最頭痛。」']],
    ['fans', '花時間回應球迷', { t: 1, team: 2, flag: 'FAN_FAVORITE' }, ['簽名會結束時，手已經握到發酸。', '有個小朋友說：「我長大也要穿你的號碼。」']],
    ['ignore', '關掉討論，專心練球', { t: 2 }, ['你把手機留在櫃子裡。', '安靜，有時候就是最好的訓練。']]], YO);
  Ev('PRO_Y5_CORE', 'pro_start', '成為主力之後', Y(5), ['第五年，管理層開始用不一樣的語氣和你說話：「球隊接下來要靠你這種人。」', '同時，內部的競爭也沒有因此變少——新人一批一批進來。'], [
    ['lead', '把這份期待當成責任', { t: 2, coach: 2 }, ['你接下了更多賽前準備的工作。', '責任很重，但你發現自己沒有想像中那麼怕。']],
    ['balance', '提醒自己不要被角色綁住', { t: 1, veteran: 2 }, ['前輩對你說：「主力不是頭銜，是每天重新拿回來的。」', '你把這句話貼在櫃子裡。']],
    ['team', '先照顧好身邊的人', { team: 3, flag: 'CORE_TEAM_FIRST' }, ['你開始主動找年輕隊友吃飯、聊天。', '更衣室的氣氛，有了小小的改變。']]], YO);
  Ev('PRO_Y6_TITLE_CHASE', 'pro_start', '第一次完整的追冠', Y(6), ['這是你第一次真正把「總冠軍」當成賽季目標。', '教練在開季會議上說：「想拿冠軍，就從今天的每一場開始。」'], [
    ['all', '全力以赴，每一場都當決賽', { t: 2, team: 2 }, ['你把所有的力氣都押在這一季。', '你知道這樣很累，但也很踏實。']],
    ['steady', '穩定節奏，不給自己太大壓力', { t: 1, coach: 2 }, ['你提醒自己：冠軍是累積出來的。', '教練點頭：「這樣最好。」']],
    ['veteran', '向老將請教大賽經驗', { veteran: 3, t: 1 }, ['老將說：「大賽沒有祕訣，只有不被情緒帶走。」', '你把這句話默默記了下來。']]], YO);
  Ev('PRO_Y7_PRESSURE', 'pro_start', '明星的另一面', Y(7), ['經紀人帶來了幾份代言邀約，還有一份滿滿的行程表。', '你的名字越來越響亮，可是自己的時間，越來越少。'], [
    ['accept', '接下部分代言，其餘婉拒', { t: -1, team: 1, flag: 'ENDORSE_SOME' }, ['你和經紀人坐下來一項一項勾選。', '最後留下的，都是你覺得「還能談得上喜歡」的。']],
    ['refuse', '全部推掉，專心比賽', { t: 2, flag: 'ENDORSE_NONE' }, ['經紀人嘆了口氣，但還是點頭。', '你知道，這是一個要承擔的選擇。']],
    ['family', '把休息日留給家人朋友', { team: 2, coach: 1, flag: 'LIFE_BALANCE' }, ['你關掉手機，回老家吃了一頓飯。', '母親什麼都沒問，只多夾了你愛吃的菜。']]], YO);
  Ev('PRO_Y8_COMEBACK', 'pro_start', '回到球場的路', Y(8, [E('econ.mood', 'lte', 55)]), ['這一年，你的身體和心情都不在最好的狀態。', '復健師說：「不要急，但也不要停。」（劇情演出：不代表遊戲內有傷病系統）'], [
    ['rehab', '照復健計畫，一格一格往前', { t: 1, coach: 3, flag: 'REHAB_FAITHFUL' }, ['你把每一次的訓練量，都寫在筆記上。', '有些日子毫無進展，但你沒有缺席。']],
    ['rest', '給自己更多的休息時間', { team: 2, flag: 'REHAB_PATIENT' }, ['你告訴自己：沒有人規定一定要多快回來。', '回來的那天，隊友替你把手套放在櫃子上。']],
    ['talk', '向隊友坦白自己的不安', { team: 3, veteran: 2 }, ['你說出口之後，才發現原來大家都經歷過。', '那天晚上，你睡得比這幾個月都好。']]], Object.assign({}, YO, { priority: 16 }));
  Ev('PRO_Y8_BODYCARE', 'pro_start', '長期的身體管理', Y(8, [E('econ.mood', 'gt', 55)]), ['第八年，球團的防護員提醒你：年輕時的透支，會在這個時間點開始顯現。', '你的狀態不錯，但沒有人敢保證能一直這樣下去。'], [
    ['plan', '和防護員、營養師訂下長期計畫', { t: 1, coach: 2, flag: 'BODYCARE_PLAN' }, ['你把睡眠、飲食和訓練量排成一張表。', '防護員笑說：「很少有人這麼認真。」']],
    ['push', '照目前的節奏繼續衝', { t: 2 }, ['你覺得身體還撐得住，不想把節奏放慢。', '你只在心裡留了一句：該聽身體說話了。']],
    ['mentor', '把自己的方法分享給年輕人', { team: 3, veteran: 1 }, ['年輕球員圍著你問東問西。', '你發現教人，也是在整理自己。']]], YO);
  Ev('PRO_Y9_SCOUTED', 'pro_start', '被研究的人', Y(9), ['對手的分析團隊開始針對你做功課。', '你發現球路和配球都和以前不一樣了——他們很清楚你的習慣。'], [
    ['adjust', '調整習慣，打破對方預期', { t: 2, coach: 2 }, ['你和教練在錄影室待到深夜，把每個招式拆開重組。', '改變很不舒服，但你覺得自己在進步。']],
    ['trust', '相信自己的基本功', { t: 1, veteran: 2 }, ['前輩說：「真正的好球員，被研究也沒關係。」', '你用同樣的節奏，慢慢站穩。']],
    ['study', '也開始研究對手', { t: 1, team: 2, flag: 'SCOUT_BACK' }, ['你開始整理每個對手的習慣。', '隊友自願加入，筆記越來越厚。']]], YO);
  Ev('PRO_Y10_LEADER', 'pro_start', '十年的重量', Y(10), ['你已經在這個聯盟打了十年。', '球隊低潮的時候，大家不自覺地看向你，等你開口。'], [
    ['speak', '主動站出來，在更衣室說話', { team: 3, coach: 2, flag: 'CAPTAIN_VOICE' }, ['你說的不多，只有幾句。', '但那一天之後，球隊的氣氛不一樣了。']],
    ['act', '用行動帶頭，不多說話', { t: 2, team: 2 }, ['你比誰都早到，比誰都晚走。', '年輕人看著你，慢慢也有了樣子。']],
    ['listen', '先傾聽每個人的想法', { team: 3, veteran: 1, coach: 1 }, ['你一個一個問：「你怎麼想？」', '有人第一次對你說出藏在心裡的話。']]], YO);
  Ev('PRO_Y11_NEXT', 'pro_start', '新秀的身影', Y(11), ['球隊選進了一位很有潛力的新人，教練已經開始讓他得到機會。', '你感覺到自己的位置，不再像以前那麼穩。'], [
    ['teach', '把經驗毫不保留地教給他', { team: 3, coach: 2, flag: 'MENTOR_ROOKIE' }, ['你教他怎麼預備、怎麼看對手、怎麼面對失敗。', '他說：「我想成為像你一樣的人。」']],
    ['compete', '把他當成對手，守住位置', { t: 2 }, ['你更用力地練習。', '你告訴自己：他很強，但我也還沒有輸。']],
    ['both', '一邊競爭，一邊提點', { t: 1, team: 2, coach: 1 }, ['你們在場上是對手，下了場是前後輩。', '這樣的關係，其實也不壞。']]], YO);
  Ev('PRO_Y12_WINDOW', 'pro_start', '還有一次窗口', Y(12), ['球隊戰力正好，教練說：「這可能是我們最好的一次機會。」', '你第一次認真想：自己還能打幾年？'], [
    ['chase', '全力衝這一次冠軍', { t: 2, team: 2, flag: 'THOUGHT_CHASE' }, ['你把退休的念頭放在一邊，把心都放進這一季。', '你想，拿不拿得到都不後悔。']],
    ['think', '開始認真想退役這件事', { coach: 1, flag: 'THOUGHT_RETIRE' }, ['你一個人坐在空蕩蕩的看台上想了很久。', '沒有答案，但你不再逃避這個問題。']],
    ['talk', '和家人聊聊未來', { team: 1, flag: 'TALKED_FAMILY' }, ['家人說：「你想打，我們就陪你打。」', '你鼻子有點酸，沒有再說話。']]], YO);
  Ev('PRO_Y13_VETERAN', 'pro_start', '老將的位置', Y(13), ['你的出場時間開始變得不固定，更多時候是被需要時才上場。', '教練私下問你：「有沒有想過之後要做什麼？」'], [
    ['role', '接受新的角色，把自己準備好', { t: 1, coach: 3 }, ['你不再計較上場的次數，只在乎每次上場的品質。', '教練說：「你這樣的老將，我很放心。」']],
    ['fight', '不服輸，繼續爭先發', { t: 2, veteran: -1 }, ['你用更多的訓練證明自己還沒走下坡。', '有些人敬佩，也有些人搖頭。']],
    ['future', '開始和教練談之後的出路', { coach: 2, flag: 'COACH_PATH' }, ['你們聊到教練團、聊到青訓。', '你第一次想像自己站在場邊的樣子。']]], YO);
  Ev('PRO_Y14_PLAN', 'pro_start', '最後完整球季的準備', Y(14), ['如果還要再打，這是最後一次可以認真準備的完整球季。', '你可以選擇這一年的方向。'], [
    ['start', '拚到最後，再爭一次先發', { t: 2, flag: 'PLAN_START' }, ['你把自己放回新人的位置，從零開始練。', '你不想有任何一個「早知道」。']],
    ['mentor', '把心力放在帶新人', { team: 3, coach: 2, flag: 'PLAN_MENTOR' }, ['你把自己的練習時間分一半給年輕人。', '你知道，這會是留得最久的東西。']],
    ['title', '把冠軍當成最後的目標', { t: 1, team: 2, flag: 'PLAN_TITLE' }, ['你在全隊面前說：「我想和你們再拿一次。」', '沒有人笑，大家都點頭。']]], YO);
  Ev('PRO_Y15_LAST', 'pro_start', '最後的球季', Y(15), ['第十五個球季，也許是最後一個。', '不管這一年怎麼結束，你都已經在這個聯盟留下了自己的名字。結局不是別人決定，是你。'], [
    ['savor', '好好享受每一場比賽', { team: 2, flag: 'FINAL_SEASON', fv: 'savor' }, ['你比過去更用力地聽觀眾的聲音。', '每一次上場，都比平常更慢一點。']],
    ['fight', '用盡全力，不留遺憾', { t: 2, flag: 'FINAL_SEASON', fv: 'fight' }, ['你把所有想做的事都排進這一季。', '你想起第一天走進休息室的樣子。']],
    ['quiet', '平靜地面對，一場一場打', { t: 1, coach: 1, flag: 'FINAL_SEASON', fv: 'quiet' }, ['你沒有特別宣布什麼。', '只是把球衣掛好，把鞋帶綁緊。']]], { once_per_career: true, priority: 17 });

  /* ---------- 退役選擇（offseason；第 15 年起可自願，第 20 年強制）。RETIRE_CHOICE 旗標＝ceremony／quiet／lastdance／again；13e 的 goNext() 讀取它進入退役回顧 ---------- */
  const CH = (id, label, e, res) => [id, label, Object.assign({ flag: 'RETIRE_CHOICE', fv: id }, e), res];
  Ev('PRO_RETIRE_CHAMP', 'offseason', '以冠軍作結', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', true)], ['{team}拿下了總冠軍，你站在慶功宴的角落，看著大家笑得像孩子。', '你知道，這可能就是你能想像最好的告別。你會怎麼做？'], [
    CH('lastdance', '以冠軍作為最後一舞，正式退役', { team: 3, coach: 2 }, ['你把球衣掛回櫃子，輕輕撫過號碼。', '「這樣就夠了。」你說。']),
    CH('ceremony', '舉辦告別賽，感謝球迷', { team: 2, coach: 1 }, ['告別賽那天，看台坐滿了人。', '你向每個方向都鞠了躬。']),
    CH('again', '再戰一年', { t: 1 }, ['你笑說：「還沒打夠。」', '隊友們起鬨：「那就明年再來一次。」'])], { once_per_season: true, priority: 30 });
  Ev('PRO_RETIRE', 'offseason', '要不要再打一年', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', false), E('career.heavy', 'lt', 7), E('career.lowYears', 'lt', 2)], ['球季落幕。你的身體、成績和球隊的需要，都放在眼前。', '退役是你的決定，不是別人的。不管選哪一條路，都不需要向誰解釋。'], [
    CH('ceremony', '舉辦告別賽，與球迷道別', { team: 3, coach: 1 }, ['告別賽那天，球迷用你的名字唱了一整局。', '你站在投手丘（打擊區）旁邊，深深地鞠躬。']),
    CH('quiet', '低調退役，把焦點留給球隊', { team: 3, veteran: 1 }, ['你沒有開記者會，只發了一封給隊友的信。', '更衣室裡，有人默默替你把號碼擦乾淨。']),
    CH('again', '再戰一年', { t: 1 }, ['你告訴自己：還有一個球季。', '教練笑了：「那就好好打。」'])], { once_per_season: true, priority: 30 });
  Ev('PRO_RETIRE_FORCED', 'offseason', '二十年的終點', [E('year', 'gte', 20)], ['這是你的第二十個球季。聯盟裡沒有比你更久的名字了。', '不管成績、不管名次，這條路走到這裡，已經是完整的一生。'], [
    CH('ceremony', '舉辦告別賽，與球迷道別', { team: 3, coach: 2 }, ['二十年的回憶，在球場上一幕幕閃過。', '最後，你把帽子拿在手上，深深地鞠躬。']),
    CH('quiet', '低調退役，感謝所有人', { team: 3, veteran: 2 }, ['你寫了一封信，沒有留下任何多餘的話。', '但每個看過的人，都知道你想說什麼。'])], { once_per_season: true, priority: 35 });


  /* 結局 E：因身體負荷（career.heavy：高出賽／高投球量的球季數）或長期出場機會減少（career.lowYears）而出現的特殊退役選擇；仍由玩家決定，可選「再戰一年」 */
  Ev('PRO_RETIRE_HEALTH', 'offseason', '身體的警訊', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', false), E('career.heavy', 'gte', 7)], ['多年來高強度的出賽，讓你的身體留下了無法忽視的痕跡。', '防護員和復健師都希望你好好考慮——但他們說：「怎麼選，是你的決定。」（劇情演出：遊戲內沒有傷病系統，此選項由累積出賽量觸發）'], [
    CH('health', '為了身體，選擇光榮退役', { team: 3, coach: 2 }, ['你向球團與球迷說明了自己的狀況。', '沒有人責怪你，掌聲比任何一次安打都還要長。']),
    CH('ceremony', '舉辦告別賽，把最後一場留給球迷', { team: 3, coach: 1 }, ['你在告別賽中只打了一個打席（或投了一局）。', '但那一瞬間，整座球場都站了起來。']),
    CH('again', '調整訓練量，再戰一年', { t: -1, coach: 1 }, ['你和防護團隊重新排了一張嚴格的訓練表。', '你知道這是賭注，但你還想再試一次。'])], { once_per_season: true, priority: 32 });
  Ev('PRO_RETIRE_DECLINE', 'offseason', '逐漸減少的出場', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', false), E('career.heavy', 'lt', 7), E('career.lowYears', 'gte', 2)], ['接連幾個球季，你的名字越來越少出現在先發名單上。', '教練私下對你說：「球隊永遠需要你。但你想以什麼樣的方式繼續，要由你決定。」'], [
    CH('decline', '坦然接受，結束球員生涯', { team: 2, coach: 3 }, ['你把這些年的筆記整理好，交給年輕的後輩。', '走出球場時，你覺得肩上輕了不少。']),
    CH('quiet', '低調退役，把位置留給年輕人', { team: 3, veteran: 1 }, ['你沒有開記者會，只在更衣室留了一張紙條。', '紙條上只有四個字：「謝謝大家」。']),
    CH('again', '不甘心，再拚一年', { t: 1 }, ['你把全部時間都放進了訓練。', '你想要的不是紀錄，只是再一次證明自己。'])], { once_per_season: true, priority: 31 });

  const api = { register, all, newState, importState, exportState, available, next, choose };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CSTORY;
