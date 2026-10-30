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
    if (path.indexOf('seen.') === 0) { const m = path.slice(5).split('.'), sn = st.seen[m[0]]; return m[1] === 'n' ? (sn ? sn.n : 0) : m[1] === 'season' ? (sn && sn.seasons[String(Math.floor(+ctx.year) || 0)] ? 1 : 0) : undefined; }      // seen.<事件id>.n＝該事件已被選過幾次（第二十四版新增，給「第二座冠軍」這類事件用）
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
    text: ['比賽結束，球場的燈還亮著。', '你第一次穿著{team}的球衣踏上這片場地，不管結果如何，這一天都已經寫進了你的職棒履歷。', '休息室裡，教練經過你的櫃子，只丟下一句：「今天的事，睡一覺再想。」'],
    choices: [
      { id: 'savor', label: '把這一刻好好記在心裡', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'SAVORED_DEBUT' }], result: ['你在更衣室角落坐了一會兒，才慢慢收拾東西。', '回家的路上，你一直在想：這只是開始。', '路過的前輩笑著說：「第一次都這樣啦，慢慢來，後面還很長喔。」'] },
      { id: 'refocus', label: '立刻回頭檢討內容', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你主動把剛才的每個細節整理給教練聽。', '教練難得地笑了一下：「還沒下班，就先想著下一場了。」'] }
    ]
  });
  register({
    id: 'PRO_BENCH_SLUMP', phase: 'after_game', title: '板凳上的低潮', cooldown_games: 20, priority: 30,
    conditions: [E('starter', 'eq', false), E('apps', 'gte', 5), E('trust', 'lte', 35)],
    text: ['連續好幾場，你大多時間都坐在板凳上看比賽。', '偶爾上場，表現也沒能讓教練多給你幾次機會。你開始懷疑，自己是不是真的屬於這裡。', '經過你身旁時，一位前輩壓低聲音說：「我當年也坐過這個位置，別急著下結論。」'],
    choices: [
      { id: 'talk', label: '找教練坦白談一談', hint: '信賴度 +2・教練關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 3 }], result: ['教練聽完你的想法，指出了兩個你沒注意到的小問題。', '「機會會來，」他說，「但要先把這兩件事做好。」'] },
      { id: 'extra', label: '把心思全放進加練', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'SLUMP_EXTRA_TRAINING' }], result: ['你把練習時間排得更滿，手上的繭一層又一層。', '沒有人說什麼，但你知道有人在看。'] },
      { id: 'patience', label: '沉住氣，等待機會', hint: '隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 2 }], result: ['你在板凳上替隊友加油、遞毛巾，也看清了每個人的習慣。', '有位隊友小聲說：「你這樣的人，遲早會被看見。」'] }
    ]
  });
  register({
    id: 'PRO_PROMOTED_STARTER', phase: 'after_game', title: '升為先發', once_per_career: true, priority: 40,
    conditions: [E('starter', 'eq', true)],
    text: ['教練把名單貼在牆上，你的名字出現在先發欄位。', '從板凳到先發，你靠的是一場又一場累積下來的表現。隊友一個接一個拍了拍你的肩膀。', '教練在名單旁停下腳步：「位置是你自己打來的，別讓它輕易溜走。」'],
    choices: [
      { id: 'thank', label: '向教練與前輩道謝', hint: '教練關係 +3・前輩關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'relationship_delta', target: 'veteran', value: 2 }], result: ['你鞠躬道謝，教練只回了一句：「別謝我，上場去證明。」'] },
      { id: 'prove', label: '告訴自己：這只是起點', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你把名單的照片存了起來，不是為了紀念，而是提醒自己：先發的位置，永遠不是理所當然。', '前輩拍拍你的背：「先發只是開始而已啦，好好守住喔。」'] }
    ]
  });
  register({
    id: 'PRO_PLAYOFF_PUSH', phase: 'season_end', title: '最後的衝刺', once_per_season: true, priority: 50,
    conditions: [E('team.playoffQualified', 'eq', true)],
    text: ['例行賽落幕，{team}拿到了季後賽門票。', '休息室裡的氣氛和春天完全不同——每個人都知道，接下來每一球都更沉重。', '隊長在更衣室中央拍了拍手：「從現在開始，一球一球來。」'],
    choices: [
      { id: 'all_in', label: '全力以赴，什麼都不留', hint: '信賴度 +3・隊友關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 3 }, { type: 'relationship_delta', target: 'team', value: 3 }], result: ['你在全隊會議上說：「不管輪到誰，我都準備好了。」', '沒有人笑你太用力，因為大家都是這麼想的。'] },
      { id: 'calm', label: '保持平常心，做好分內事', hint: '信賴度 +1・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你照著例行賽的節奏準備，一個步驟也沒有省。', '教練看在眼裡，點了點頭。', '隊友小聲說：「穩穩打就好啦，我們都在。」'] }
    ]
  });
  register({
    id: 'PRO_SEASON_REVIEW', phase: 'season_end', title: '球季檢討', once_per_season: true, priority: 50,
    conditions: [E('team.playoffQualified', 'eq', false)],
    text: ['這個球季，{team}沒能打進季後賽。', '球場漸漸安靜下來，你坐在更衣室裡，把這一年的每一場、每一次上場，在腦中重新走過一遍。', '隔壁櫃子的前輩輕聲說：「明年再來，這種滋味，記著就好。」'],
    choices: [
      { id: 'learn', label: '把教訓一條一條寫下來', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你寫滿了整整三頁，最後一行是：「明年要更早準備。」'] },
      { id: 'rest', label: '先好好休息，讓身體恢復', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['你關掉手機，睡了很久很久的一覺。醒來時，窗外已經有一點冬天的味道。'] },
      { id: 'goal', label: '替明年立下一個明確的目標', hint: '旗標：已立下目標', effects: [{ type: 'flag_set', flag: 'NEXT_SEASON_GOAL' }], result: ['你在筆記本上寫下一個數字，然後把它貼在每天一睜眼就能看到的地方。', '室友路過看到，笑說：「這目標很敢喔，我幫你監督啦。」'] }
    ]
  });

  /* ---------- 季後賽專屬事件（虛構情節；phase：'po_series'＝你的球隊每輪系列賽開打前；'po_end'＝季後賽全部結束後）
     ctx.po.stage：'ch'（季後挑戰賽）／'final'（台灣大賽）；po_end 時 ctx.po.out 為 'ch'／'final'（被淘汰的輪次）、ctx.team.champion 為是否奪冠 ---------- */
  register({
    id: 'PRO_PO_CH_EVE_BENCH', phase: 'po_series', title: '挑戰賽前夜', once_per_season: true, priority: 60,
    conditions: [E('po.stage', 'eq', 'ch'), E('starter', 'eq', false), E('level', 'ne', 'farm')],      // 二軍球員不在季後賽名單，不適用「隨時可能上場」
    text: ['季後挑戰賽前一天，{team}的練習特別安靜。', '你知道自己多半還是坐在板凳，但這種比賽，教練隨時可能把你叫上場——一個代打、一次代跑，就可能決定一場。', '練習結束前，教練只對你說了一句：「隨時準備好，我可能很快就叫你。」'],
    choices: [
      { id: 'ready', label: '把「隨時上場」的準備流程再走一遍', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你從熱身、揮棒到心跳的節奏，一項一項重新演練。', '教練路過時只說：「就是這樣，準備好的人才有機會。」'] },
      { id: 'cheer', label: '當好板凳上的第一個加油聲', hint: '隊友關係 +3', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }], result: ['你比誰都早到休息區，毛巾、水、加油聲，一樣都沒少。', '有人拍拍你：「有你在，板凳不會冷。」'] },
      { id: 'calm', label: '深呼吸，把它當成普通的一天', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['你提醒自己：緊張的人太多了，不差你一個。', '睡前，你把球衣整整齊齊掛好。', '隊友探頭說：「球衣掛這麼整齊喔？明天加油啦！」'] }
    ]
  });
  register({
    id: 'PRO_PO_CH_EVE_STARTER', phase: 'po_series', title: '挑戰賽前夜', once_per_season: true, priority: 60,
    conditions: [E('po.stage', 'eq', 'ch'), E('starter', 'eq', true)],
    text: ['季後挑戰賽前一天，教練在戰術會議上提到你的名字。', '這不再是例行賽——輸一場就可能整季結束。你第一次覺得，先發的位置有這麼重。', '隊友走過來，低聲說：「明天，我們一個出局數一個出局數慢慢來。」'],
    choices: [
      { id: 'routine', label: '照例行賽的節奏準備，不多不少', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你一個步驟也沒省，也沒有多加任何一個。', '教練看了你一眼，點點頭。', '教練輕聲說：「就照這個節奏啦，明天交給你們了。」'] },
      { id: 'lead', label: '主動找隊友聊聊明天的打法', hint: '信賴度 +1・隊友關係 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'team', value: 3 }], result: ['你把自己看到的對手習慣一條條說出來，有人拿筆記了下來。', '會議結束時，氣氛比開始時輕鬆了一點。', '隊友握拳說：「明天一起拚啦，不用留力氣！」'] },
      { id: 'video', label: '關起門來再看一次對手影片', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你把每個球種、每個習慣動作都看到幾乎能背起來。', '關燈時，你腦中只剩下明天的第一個打席（或第一球）。', '隊友探頭進來：「欸，早點睡啦，明天一起加油！」'] }
    ]
  });
  register({
    id: 'PRO_PO_FINAL_EVE', phase: 'po_series', title: '台灣大賽前夕', once_per_season: true, priority: 60,
    conditions: [E('po.stage', 'eq', 'final'), E('level', 'ne', 'farm')],      // 二軍球員不適用「上場以後只管眼前這一球」
    text: ['{team}站上了台灣大賽的舞台。', '看板、媒體、加班趕來的球迷——所有人的目光都比平常多了一倍。你在更衣室裡聽見自己的心跳，比任何時候都清楚。', '隊長站在更衣室中間：「站上這裡不容易，把今年的樣子，原原本本帶上場。」'],
    choices: [
      { id: 'embrace', label: '享受這個舞台，這輩子沒幾次', hint: '信賴度 +2・隊友關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你深吸一口氣，對自己說：能站在這裡，本身就已經不簡單。', '緊張還在，但它不再把你往下拉。', '隊友在旁邊笑說：「這種舞台沒幾次欸，打到最後一刻啦！」'] },
      { id: 'veteran', label: '去問前輩：第一次打總冠軍賽是什麼感覺', hint: '前輩關係 +4', effects: [{ type: 'relationship_delta', target: 'veteran', value: 4 }], result: ['老將笑了笑：「手會抖，這是正常的。上場以後，只管眼前這一球。」', '你把這句話記進心裡。'] },
      { id: 'focus', label: '關掉手機與訊息，只留比賽', hint: '信賴度 +3', effects: [{ type: 'stat_delta', target: 'trust', value: 3 }, { type: 'flag_set', flag: 'FINAL_FOCUS_MODE' }], result: ['你把螢幕朝下蓋在櫃子裡。', '外面的聲音全部退到很遠，只剩下你和下一場比賽。'] }
    ]
  });
  register({
    id: 'PRO_PO_CHAMPION', phase: 'po_end', title: '總冠軍之夜', once_per_season: true, priority: 70,
    conditions: [E('team.champion', 'eq', true)],
    text: ['最後一個出局數落進手套的瞬間，整個球場炸開了。', '{team}拿下了總冠軍。你被人群推著、抱著、潑了一身香檳——不管這一年你上場了幾次，這一刻，你就在這支球隊裡。', '有人在混亂中大喊：「我們是冠軍！」你分不清那是誰的聲音，只知道自己也在喊。'],
    choices: [
      { id: 'share', label: '把這份榮耀分給每一個人', hint: '隊友關係 +4・教練關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 4 }, { type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'flag_set', flag: 'WON_TITLE' }], result: ['你一個一個擁抱隊友、教練、防護員，連場邊的工作人員都沒漏。', '那晚的合照裡，你笑得比誰都用力。', '隊友們一起喊：「這座冠軍，是大家一起打下來的啦！」'] },
      { id: 'quiet', label: '一個人在空蕩的球場多待一會兒', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'WON_TITLE' }], result: ['人群散去後，你站在投手丘旁，看著滿地的彩帶。', '你知道，這一晚會是這輩子都記得的一晚。'] },
      { id: 'next', label: '舉杯之後，已經開始想明年', hint: '信賴度 +3・旗標：想衛冕', effects: [{ type: 'stat_delta', target: 'trust', value: 3 }, { type: 'flag_set', flag: 'WON_TITLE' }, { type: 'flag_set', flag: 'WANT_REPEAT' }], result: ['香檳還沒乾，你已經在腦中排好了休賽季的訓練。', '冠軍不是終點——你很清楚。', '教練笑著說：「來，明年我們再拚一次！」'] }
    ]
  });
  register({
    id: 'PRO_PO_LOST_FINAL', phase: 'po_end', title: '差一步的總冠軍', once_per_season: true, priority: 70,
    conditions: [E('po.out', 'eq', 'final'), E('level', 'ne', 'farm')],
    text: ['台灣大賽的最後一戰結束了，對手在場中央圍成一圈慶祝。', '{team}的休息區很安靜，有人低著頭，有人望著天花板。離冠軍，只差這麼一步。', '教練走進休息區，聲音沙啞：「抬起頭，你們今年每個人都拚盡全力了。」'],
    choices: [
      { id: 'console', label: '走過去，拍拍低頭的隊友', hint: '隊友關係 +4', effects: [{ type: 'relationship_delta', target: 'team', value: 4 }], result: ['你沒說什麼大道理，只是一個一個拍過肩膀。', '有人抬起頭，擠出一個苦笑。', '隊友吸了吸鼻子：「好啦，明年，明年一定打回來。」'] },
      { id: 'remember', label: '把這份不甘心記下來', hint: '信賴度 +2・旗標：不甘心', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'FINAL_REGRET' }], result: ['你在筆記本最後一頁，只寫了兩個字：明年。', '你合上本子，把它放進球袋最底層。'] },
      { id: 'respect', label: '向對手致意，認輸也要有風度', hint: '教練關係 +2・隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你走到對手休息區前，脫帽鞠躬。', '對方有人回禮，兩邊的球迷都為此鼓掌。', '球迷喊著：「輸得很漂亮啦，明年再來！」'] }
    ]
  });
  register({
    id: 'PRO_PO_LOST_CH', phase: 'po_end', title: '止步季後挑戰賽', once_per_season: true, priority: 70,
    conditions: [E('po.out', 'eq', 'ch'), E('level', 'ne', 'farm')],
    text: ['季後挑戰賽結束，{team}的賽季也跟著畫上句點。', '離進入台灣大賽只差幾個勝場。你坐在休息區，看著場上的燈一盞一盞熄滅。'],
    choices: [
      { id: 'thank', label: '向教練與隊友說聲辛苦了', hint: '教練關係 +3・隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你在更衣室門口對每個人說了一句「辛苦了」。', '有人回你：「明年再來。」'] },
      { id: 'fuel', label: '把這場輸球當成明年的燃料', hint: '信賴度 +2・旗標：想雪恥', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'CH_REGRET' }], result: ['你把比賽中最想重來的那個瞬間，一幀一幀記了下來。', '明年的某一天，你會讓它不一樣。', '教練拍拍你的肩：「這股不甘心先留著，明年用它打回來。」'] },
      { id: 'rest', label: '先放下，讓身心好好休息', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['你回家，關上門，把球袋丟在玄關。', '這一晚，你什麼都不想。', '隊友說：「好好睡一覺啦，明年再來。」'] }
    ]
  });

  /* ---------- 例行賽中段事件（after_game；每季各一次，條件用場數／信賴度／先發，不依賴遊戲沒有的數值） ---------- */
  register({
    id: 'PRO_MID_TEAMMATE', phase: 'after_game', title: '更衣室的閒聊', once_per_season: true, priority: 15,
    conditions: [E('gameNo', 'gte', 30)],
    text: ['賽季過了四分之一，{team}的更衣室比春天熟悉多了。', '賽後，一位年資比你高的隊友邀你一起收拾場邊的器材，順口問起：「這一路下來，你覺得自己最需要補什麼？」'],
    choices: [
      { id: 'honest', label: '老實說出自己的弱點', hint: '前輩關係 +3・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'veteran', value: 3 }, { type: 'stat_delta', target: 'trust', value: 1 }], result: ['他聽完沒笑你，反而分享了自己新人時期踩過的坑。', '「慢慢來，」他說，「這件事每個人都走過。」'] },
      { id: 'ask_back', label: '反問他當年是怎麼熬過來的', hint: '前輩關係 +4', effects: [{ type: 'relationship_delta', target: 'veteran', value: 4 }], result: ['他講了一個你沒聽過的故事，講到一半自己先笑了出來。', '那天回家的路上，你覺得這個球季比想像中短一點。', '前輩笑著說：「撐一下就過去了啦，每一天都好好打。」'] },
      { id: 'joke', label: '笑著帶過，把話題丟回去', hint: '隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 2 }], result: ['你們就這樣東拉西扯地收完了東西。', '有些話不用說清楚，氣氛已經夠了。', '隊友笑著回嘴：「好啦好啦，先打出來再說啦！」'] }
    ]
  });
  register({
    id: 'PRO_ALLSTAR_BREAK', phase: 'after_game', title: '明星賽週的空檔', once_per_season: true, priority: 16,
    conditions: [E('gameNo', 'gte', 58), E('season.asg', 'eq', false)],
    text: ['球季過半，聯盟進入明星賽週，{team}難得有幾天不用比賽。', '不管名單上有沒有你的名字，這段空檔都是整季最少見的喘息。你得決定怎麼用它。', '防護員在走廊叫住你：「這幾天好好休息，別把身體繃到下半季。」'],
    choices: [
      { id: 'train', label: '趁空檔補強練習量', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['別人在休息，你一個人在空曠的球場把基本動作重練一遍。', '汗水落在草皮上，很快就乾了。', '教練在場邊喊：「趁現在多練一點，下半季靠你囉！」'] },
      { id: 'rest', label: '徹底放鬆，把身體養好', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'ALLSTAR_BREAK_REST' }], result: ['你睡到自然醒，煮了一頓像樣的早餐。', '下半季要打的比賽還很多，你知道這種日子不多。', '隊友傳訊息來：「休息夠了就回來喔，我們等你啦。」'] },
      { id: 'family', label: '回家陪陪家人與朋友', hint: '隊友關係 +1・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'team', value: 1 }, { type: 'stat_delta', target: 'trust', value: 1 }], result: ['桌上的菜比平常多了兩道，大家都在問你比賽的事。', '你發現，被人惦記的感覺會變成很實在的力氣。', '家人在電話那頭說：「在外面放心打啦，我們都有在看喔。」'] }
    ]
  });
  register({
    id: 'PRO_STARTER_SLUMP', phase: 'after_game', title: '先發的低潮', cooldown_games: 25, priority: 31,
    conditions: [E('starter', 'eq', true), E('trust', 'lte', 40), E('gameNo', 'gte', 20)],
    text: ['先發名單上還有你的名字，但這幾場的內容連你自己看了都皺眉。', '你知道，教練的耐心不會無限延長。', '教練把你叫到一旁：「我不是要罵你，我只想知道你自己覺得哪裡卡住了。」'],
    choices: [
      { id: 'fundamentals', label: '回頭檢查最基本的動作', hint: '信賴度 +2・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你把影片一格一格倒回去看，終於找到那個小小的壞習慣。', '改起來不容易，但至少，你知道從哪裡開始。', '教練在旁邊說：「基本功穩了，手感就會回來啦，再來一次。」'] },
      { id: 'consult', label: '找前輩聊聊怎麼走出低潮', hint: '前輩關係 +3・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'veteran', value: 3 }, { type: 'stat_delta', target: 'trust', value: 1 }], result: ['老將只說了一句：「低潮不是你變差了，是你開始想太多。」', '你想了很久，才懂這句話的意思。'] },
      { id: 'simple', label: '把比賽想得簡單一點', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['下一場，你只給自己一個任務：把眼前這一球處理好。', '複雜的事，就留給賽後再想。', '前輩在旁邊說：「不用想那麼多啦，盯緊球，放膽揮。」'] }
    ]
  });
  register({
    id: 'PRO_HOT_STREAK', phase: 'after_game', title: '手感正熱', once_per_season: true, priority: 32,
    conditions: [E('starter', 'eq', true), E('trust', 'gte', 75)],
    text: ['最近每一場都有好內容，連對手的眼神都和之前不太一樣。', '記者在賽後多問了你幾個問題，隊友開玩笑說：「別把好運用完了。」'],
    choices: [
      { id: 'steady', label: '提醒自己：別被氣氛帶著走', hint: '信賴度 +1・教練關係 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'coach', value: 2 }], result: ['你把每場的準備流程原封不動地照做。', '教練看著你，沒說什麼，只輕輕點了頭。', '隊友說：「手感正好欸，穩穩的就好，不用急啦。」'] },
      { id: 'credit', label: '把功勞分給隊友', hint: '隊友關係 +3', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }], result: ['面對麥克風，你先謝謝了投手、捕手和守備。', '更衣室裡有人悄悄記住了這件事。', '隊友小聲說：「你這樣大家都有看到喔，繼續加油！」'] },
      { id: 'enjoy', label: '好好享受這段時光', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你知道手感不會永遠都在，所以每一場都比平常更專心。', '有些日子，值得被好好記住。', '隊友笑著說：「這幾天超強的欸，好好享受啦！」'] }
    ]
  });
  register({
    id: 'PRO_LATE_SEASON', phase: 'after_game', title: '球季尾聲的壓力', once_per_season: true, priority: 17,
    conditions: [E('gameNo', 'gte', 100)],
    text: ['只剩最後二十場，休息區的氣氛一天比一天緊。', '不管{team}的名次在哪裡，每一場輸贏都比春天沉重。你的身體也開始提醒你：這是一個很長的球季。', '有位前輩笑著說：「最後這段最難熬，撐過去，你就會懂為什麼大家都想打下去。」'],
    choices: [
      { id: 'adjust', label: '調整作息，把身體顧好', hint: '信賴度 +1・教練關係 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'coach', value: 1 }], result: ['你把睡眠和飲食排得比平常更嚴格。', '防護員點頭說：「這個時候，細節才是差別。」'] },
      { id: 'push', label: '咬牙把每一場都當最後一場', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你不再想排名，也不再想數字，只想把眼前的比賽打完。', '有時候，把事情變簡單，就是最好的辦法。', '隊友在休息區喊：「剩沒幾場了啦，一起撐到最後！」'] },
      { id: 'team_talk', label: '和隊友互相打氣', hint: '隊友關係 +3', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }], result: ['賽前，你們在走廊圍成一圈，什麼都不用多說。', '那一刻，你覺得自己真的是這支球隊的一部分。', '隊友們圍成一圈喊：「最後一段了，大家一起衝過去！」'] }
    ]
  });
  register({
    id: 'PRO_APPS_TEN', phase: 'after_game', title: '第十次上場', once_per_career: true, priority: 25,
    conditions: [E('apps', 'gte', 10), E('lastGame.played', 'eq', true)],
    text: ['你在賽後的紀錄表上，看到自己的出場數來到了兩位數。', '十次上場不算什麼大數字，但對一個從板凳起步的人來說，每一次都是靠自己換來的。'],
    choices: [
      { id: 'note', label: '在筆記本上記下這個數字', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'APPS_TEN_NOTED' }], result: ['你寫下日期、對手和一行簡短的心得。', '多年之後翻開，也許會笑。', '隊友探頭來：「欸，你又在寫日記喔？」'] },
      { id: 'tell', label: '打電話告訴家人', hint: '信賴度 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }], result: ['電話那頭沉默了一下，然後說：「我們都看了轉播。」', '你站在停車場，鼻子突然有點酸。'] }
    ]
  });

  /* ---------- 多年度：新球季開幕（pro_start，year ≥ 2）與休賽季續約（offseason）。
     沒有真正的合約／薪資系統，所以只存旗標與關係值；選項不會改寫球隊、年資或任何比賽規則 ---------- */
  register({
    id: 'PRO_Y2_OPENING', phase: 'pro_start', title: '第二個球季', once_per_career: true, priority: 12,
    conditions: [E('year', 'eq', 2)],
    text: ['新球季的第一天，{team}的休息室看起來和去年一樣，又好像哪裡不一樣了。', '你不再是那個誰都不認識的新人。這一次，你知道每個人的習慣、每條走廊的盡頭，也更清楚自己想站在哪裡。', '隔壁櫃子的新人怯生生地問你：「請問……早操要在哪裡集合？」你愣了一下，才發現自己已經是被問路的那個人了。'],
    choices: [
      { id: 'role', label: '把今年的目標說給教練聽', hint: '教練關係 +3', effects: [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'flag_set', flag: 'Y2_TOLD_GOAL' }], result: ['教練聽完，只是點頭：「很好，用表現說話。」', '你知道，那句話的分量比任何保證都重。'] },
      { id: 'rookie', label: '主動帶新人熟悉環境', hint: '隊友關係 +3・前輩關係 +1', effects: [{ type: 'relationship_delta', target: 'team', value: 3 }, { type: 'relationship_delta', target: 'veteran', value: 1 }], result: ['你想起自己第一天的模樣，拍了拍新人的肩膀。', '「慢慢來，」你說，「這裡比看起來友善。」'] },
      { id: 'grind', label: '默默比去年更早到球場', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['天還沒亮，你已經在球場邊熱身。', '管理員看到你，笑著說：「又是你。」'] }
    ]
  });
  register({
    id: 'PRO_YN_OPENING', phase: 'pro_start', title: '新球季開幕', once_per_season: true, priority: 11,
    conditions: [E('year', 'gte', 16)],
    text: ['又是新的一年，{team}的球衣依然掛在你的櫃子上。', '一路走到這裡，你的名字在聯盟裡已經不再陌生。新的球季，新的對手，也有新的人在看你。', '有位年輕球員遠遠朝你鞠躬，喊了一聲：「前輩，今年請多指教！」'],
    choices: [
      { id: 'prepare', label: '照既定節奏，穩穩地準備', hint: '信賴度 +2', effects: [{ type: 'stat_delta', target: 'trust', value: 2 }], result: ['你把休賽季累積下來的訓練成果，一項一項排進開季前的計畫。', '穩，就是最好的開始。', '教練說：「穩穩的就好啦，開幕戰見。」'] },
      { id: 'mentor', label: '和教練談談球隊的方向', hint: '教練關係 +2・隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'relationship_delta', target: 'team', value: 2 }], result: ['你們在辦公室聊了很久，從戰術談到更衣室的氣氛。', '離開時，教練說：「有你在，我比較放心。」'] },
      { id: 'fresh', label: '把去年的成績歸零，重新開始', hint: '信賴度 +1・隊友關係 +1', effects: [{ type: 'stat_delta', target: 'trust', value: 1 }, { type: 'relationship_delta', target: 'team', value: 1 }], result: ['不管去年好或壞，那都已經是過去。', '你把開幕戰的比賽時間貼在櫃子上，一個字一個字讀了出來。', '教練在更衣室說：「過去的就歸零啦，開幕戰，放手打！」'] }
    ]
  });
  register({
    id: 'PRO_RENEW', phase: 'offseason', title: '休賽季的續約談話', once_per_season: true, priority: 10,
    conditions: [E('year', 'gte', 1), E('year', 'lt', 10)],
    text: ['球季落幕，{team}的管理層找你談下一年的安排。', '桌上沒有誇張的數字，只有一份寫著球隊期待與你需要面對的課題的文件。你想用什麼心態面對接下來的合約與去留？', '管理層代表翻開文件，語氣平穩：「我們想先聽聽你自己的想法。」'],
    choices: [
      { id: 'sign', label: '好好談，專心準備明年', hint: '教練關係 +2・信賴度 +1', effects: [{ type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'RENEW_SIGNED' }], result: ['你把想法說得清清楚楚，沒有多餘的條件。', '「明年見，」對方說，「好好休息。」'] },
      { id: 'ask_role', label: '希望爭取更多上場機會', hint: '教練關係 +1・信賴度 -1（說出口也有壓力）', effects: [{ type: 'relationship_delta', target: 'coach', value: 1 }, { type: 'stat_delta', target: 'trust', value: -1 }, { type: 'flag_set', flag: 'RENEW_ASKED_ROLE' }], result: ['你把自己的想法一條一條說清楚，管理層沒有當場回應。', '離開時，你不確定這樣算不算好事——但至少，你說出口了。', '經紀人在門口說：「有說出口就很好了，接下來看你在球場上的表現啦。」'] },
      { id: 'quiet', label: '低調談完，把焦點留給球隊', hint: '隊友關係 +2', effects: [{ type: 'relationship_delta', target: 'team', value: 2 }, { type: 'flag_set', flag: 'RENEW_SIGNED' }], result: ['你說完想說的，把文件放回桌上。', '沒有人特別提起這件事，但球隊的人慢慢都知道了。'] }
    ]
  });


  /* ---------- 第 3～15 年主線＋退役（第七版）。全為虛構演出；只用信賴度／關係值／旗標，不改比賽規則。
     縮寫：Ev(id, phase, title, 條件[], 正文[], 選項[[id,標籤,效果,結果[]]], 額外欄位)；效果 { t:信賴度, coach／veteran／team:關係, flag, fv:旗標值 } ---------- */
  const RELN = { coach: '教練', veteran: '前輩', team: '隊友', medical: '防護團隊', rival: '競爭者', agent: '經紀人' }, sg = n => (n > 0 ? '+' : '') + n;
  function mkChoice(c) {
    const e = c[2] || {}, effects = [], hint = [];
    if (e.t) { effects.push({ type: 'stat_delta', target: 'trust', value: e.t }); hint.push('信賴度 ' + sg(e.t)); }
    Object.keys(RELN).forEach(k => { if (e[k]) { effects.push({ type: 'relationship_delta', target: k, value: e[k] }); hint.push(RELN[k] + '關係 ' + sg(e[k])); } });
    if (e.mood) { effects.push({ type: 'stat_delta', target: 'mood', value: e.mood }); hint.push('心情 ' + sg(e.mood)); }
    if (e.fit) { effects.push({ type: 'stat_delta', target: 'fit', value: e.fit }); hint.push('體能 ' + sg(e.fit)); }
    if (e.flag) effects.push({ type: 'flag_set', flag: e.flag, value: e.fv === undefined ? true : e.fv });
    if (e.flags) Object.keys(e.flags).forEach(k => effects.push({ type: 'flag_set', flag: k, value: e.flags[k] }));
    return { id: c[0], label: c[1], hint: hint.join('・'), effects, result: c[3] || [] };
  }
  /* ---------- 交友事件（after_game；條件＝13e 的 storyCtx 提供的 friend.coach／veteran／mate 好感 0～100，好感在總選單休兵日「找人聊聊」時增加；人物皆為遊戲虛構） ---------- */
  const FR = (id, who, th, title, text, choices) => register({ id, phase: 'after_game', title, once_per_career: true, priority: 18, conditions: [E('friend.' + who, 'gte', th)], text, choices });
  const T1 = (lbl, hint, eff, res) => ({ id: lbl.id, label: lbl.t, hint, effects: eff, result: res });
  FR('FRIEND_COACH_30', 'coach', 30, '教練室的門沒關', ['賽後，總教練在教練室門口叫住你：「有空嗎？進來坐一下。」', '你們這陣子聊得不少，他這次的語氣比平常輕鬆。'], [
    T1({ id: 'listen', t: '安靜聽他說' }, '教練關係 +3・信賴度 +1', [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'stat_delta', target: 'trust', value: 1 }], ['他講的不是戰術，而是他剛當教練時怎麼看待一個沒有出賽機會的年輕人。', '你離開時，覺得自己被「看見」了一點。']),
    T1({ id: 'ask', t: '主動問自己哪裡還不夠' }, '教練關係 +2・信賴度 +2', [{ type: 'relationship_delta', target: 'coach', value: 2 }, { type: 'stat_delta', target: 'trust', value: 2 }], ['他列了三件事，每一件都很具體。', '你把它們記在手機裡，睡前又看了一遍。', '教練說：「缺點補一補，你還可以更強啦。」']),
    T1({ id: 'thanks', t: '謝謝他這陣子的關照' }, '教練關係 +3・心情 +3', [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'stat_delta', target: 'mood', value: 3 }], ['他擺擺手，嘴角卻忍不住上揚。', '「好好打，就是最好的回禮。」'])]);
  FR('FRIEND_COACH_70', 'coach', 70, '教練的真心話', ['球季中段，總教練把你叫到場邊，沒有看你，只是望著空蕩蕩的外野。', '「有些話，我平常不會對球員說。」'], [
    T1({ id: 'trust', t: '告訴他你會扛起教練給的任務' }, '教練關係 +4・信賴度 +2', [{ type: 'relationship_delta', target: 'coach', value: 4 }, { type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'COACH_BOND' }], ['他點點頭，沒有多說，只拍了拍你的肩膀。', '那一下很輕，你卻記了很久。', '教練說：「這個任務交給你，放心去打啦。」']),
    T1({ id: 'honest', t: '坦白說出自己的不安' }, '教練關係 +3・心情 +4', [{ type: 'relationship_delta', target: 'coach', value: 3 }, { type: 'stat_delta', target: 'mood', value: 4 }, { type: 'flag_set', flag: 'COACH_BOND' }], ['他沉默了一會兒，說他當年也是這樣過來的。', '兩個人站在場邊，誰都沒有急著離開。', '教練說：「會緊張很正常啦，上場後把它變成力氣就好。」']),
    T1({ id: 'plain', t: '點頭答應，不多說什麼' }, '教練關係 +2', [{ type: 'relationship_delta', target: 'coach', value: 2 }], ['有些信任，不需要太多話。', '你轉身走回休息區，腳步比來時穩。', '教練說：「放心打啦，後面有我們。」']) ]);
  FR('FRIEND_VET_30', 'veteran', 30, '前輩的儲物櫃', ['你在更衣室碰到那位資深前輩，他正把一雙舊手套收進儲物櫃最深處。', '「這雙跟了我很多年，」他說，「你想不想知道它的故事？」'], [
    T1({ id: 'story', t: '好奇地聽他講' }, '前輩關係 +3・心情 +3', [{ type: 'relationship_delta', target: 'veteran', value: 3 }, { type: 'stat_delta', target: 'mood', value: 3 }], ['故事不長，卻讓你重新想了一遍「為什麼打球」。', '你發現，自己已經很久沒有想過這件事了。']),
    T1({ id: 'tips', t: '請他指點一個小細節' }, '前輩關係 +2・信賴度 +2', [{ type: 'relationship_delta', target: 'veteran', value: 2 }, { type: 'stat_delta', target: 'trust', value: 2 }], ['他示範了一個你從沒注意過的小動作，只要三秒鐘。', '隔天練習，你悄悄試了好幾次。', '前輩比著手勢說：「這個細節抓到，你的球就活了，再來一次啦。」']),
    T1({ id: 'laugh', t: '開個玩笑，氣氛輕鬆帶過' }, '隊友關係 +2・心情 +2', [{ type: 'relationship_delta', target: 'team', value: 2 }, { type: 'stat_delta', target: 'mood', value: 2 }], ['他笑得很大聲，連隔壁的人都探頭過來看。', '那個下午，更衣室的氣氛特別好。', '隊友笑說：「哈哈，你這個人真的很會欸。」'])]);
  FR('FRIEND_VET_70', 'veteran', 70, '前輩的叮嚀', ['賽季過了不少，那位前輩把你拉到休息區的角落，神情難得正經。', '「你有天分，但我看過太多有天分的人，卡在同一個地方。」'], [
    T1({ id: 'ask', t: '請他直說，是哪個地方' }, '前輩關係 +4・信賴度 +2', [{ type: 'relationship_delta', target: 'veteran', value: 4 }, { type: 'stat_delta', target: 'trust', value: 2 }, { type: 'flag_set', flag: 'VET_BOND' }], ['他說的不是技術，而是「太怕失敗」。', '你把這句話默念了好幾遍，才慢慢懂了。']),
    T1({ id: 'care', t: '先關心他最近的狀態' }, '前輩關係 +3・心情 +4', [{ type: 'relationship_delta', target: 'veteran', value: 3 }, { type: 'stat_delta', target: 'mood', value: 4 }, { type: 'flag_set', flag: 'VET_BOND' }], ['他愣了一下，才發現很久沒有人這樣問他。', '那天，他多聊了半個鐘頭。', '前輩笑著說：「你還年輕啦，路很長，慢慢拚就對了。」']),
    T1({ id: 'nod', t: '記在心裡，用比賽回答' }, '信賴度 +1', [{ type: 'stat_delta', target: 'trust', value: 1 }], ['你沒有多說，只是把這件事收好。', '下一場，你的第一個動作就比平常果斷。', '前輩點點頭：「說到做到喔，我等著看。」']) ]);
  FR('FRIEND_MATE_30', 'mate', 30, '同梯的深夜宵夜', ['比賽結束後，同梯好友傳訊息給你：「老地方，宵夜？我請。」', '你們已經很久沒有好好聊聊球場以外的事了。'], [
    T1({ id: 'go', t: '當然去，邊吃邊聊' }, '隊友關係 +3・心情 +5', [{ type: 'relationship_delta', target: 'team', value: 3 }, { type: 'stat_delta', target: 'mood', value: 5 }], ['你們聊起剛進球隊時的糗事，聊到店家都快打烊。', '回家的路上，你覺得肩膀輕了一些。', '隊友笑著說：「吃飽才有力氣啦，明天一起加油！」']),
    T1({ id: 'rest', t: '改天吧，今晚想早點睡' }, '心情 +1・信賴度 +1', [{ type: 'stat_delta', target: 'mood', value: 1 }, { type: 'stat_delta', target: 'trust', value: 1 }], ['他回了一個貼圖：「下次換你請。」', '你睡得很沉，隔天狀態不錯。']),
    T1({ id: 'talk', t: '去，順便聊聊彼此的壓力' }, '隊友關係 +2・心情 +3・信賴度 +1', [{ type: 'relationship_delta', target: 'team', value: 2 }, { type: 'stat_delta', target: 'mood', value: 3 }, { type: 'stat_delta', target: 'trust', value: 1 }], ['原來他也有說不出口的煩惱。', '你們約好，之後要常常互相提醒。', '隊友碰了碰你的拳頭：「壓力大就一起扛啦，下一場我們衝！」'])]);
  FR('FRIEND_MATE_70', 'mate', 70, '一起走到現在', ['球季的某個傍晚，你和同梯好友坐在空無一人的看台上，看夕陽慢慢落下。', '「還記得我們第一天站在這裡的樣子嗎？」他問。'], [
    T1({ id: 'promise', t: '約定要一起走更遠' }, '隊友關係 +4・心情 +6', [{ type: 'relationship_delta', target: 'team', value: 4 }, { type: 'stat_delta', target: 'mood', value: 6 }, { type: 'flag_set', flag: 'MATE_BOND' }], ['你們沒有擊掌，只是同時笑了出來。', '有人陪著走，球季就變得沒那麼長。', '隊友說：「說好囉，一起走到最後喔。」']),
    T1({ id: 'thank', t: '謝謝他一直在身邊' }, '隊友關係 +3・心情 +5・信賴度 +1', [{ type: 'relationship_delta', target: 'team', value: 3 }, { type: 'stat_delta', target: 'mood', value: 5 }, { type: 'stat_delta', target: 'trust', value: 1 }, { type: 'flag_set', flag: 'MATE_BOND' }], ['他別過頭去假裝看遠方，耳朵卻紅了。', '「少來，」他說，「明天一起加練。」']),
    T1({ id: 'silent', t: '安靜地看完夕陽' }, '心情 +3', [{ type: 'stat_delta', target: 'mood', value: 3 }], ['有時候，什麼都不說反而最舒服。', '天色暗下來，你們一起走出球場。']) ]);
  const Ev = (id, phase, title, conds, text, choices, o) => register(Object.assign({ id, phase, title, conditions: conds, text, choices: choices.map(mkChoice) }, o || {}));
  const Y = (n, extra) => [E('year', 'eq', n)].concat(extra || []), YO = { once_per_career: true, priority: 15 };

  Ev('PRO_Y3_STARTER_RACE', 'pro_start', '第三年的先發競爭', Y(3), ['第三個球季，名單上和你同位置的人不只一個。', '教練沒有點名誰是先發，只說：「位置是打出來的。」'], [
    ['early', '每天第一個到、最後一個走', { t: 2, coach: 2 }, ['你把基本功拆開，一項一項重練。', '守備教練說：「這樣的人，我會想讓他上場。」']],
    ['rival', '和競爭者互相切磋', { team: 3, veteran: 1 }, ['你和競爭者在場邊對練到天黑。', '兩人都沒說誰贏，但都知道對方變強了。', '競爭者說：「下次我可不會讓你喔！」']],
    ['video', '看影片研究自己的缺點', { t: 1, coach: 3 }, ['你熬夜把每個打席（或每次登板）剪成片段。', '隔天，你把整理好的重點交給教練。', '教練說：「看到缺點就是進步的第一步啦，來，去把它練掉。」']]], YO);
  Ev('PRO_Y4_SPOTLIGHT', 'pro_start', '鎂光燈', Y(4), ['媒體開始在賽前找你。有人說你是「下一個明星」，也有人說你只是曇花一現。', '同期的球員被拿來和你比，你的名字開始出現在球迷的討論裡。'], [
    ['humble', '低調回應：把焦點留給球隊', { team: 3, coach: 1 }, ['你只說了一句：「我只是做好今天的工作。」', '隊友笑著說：「這種回答，記者最頭痛。」']],
    ['fans', '花時間回應球迷', { t: 1, team: 2, flag: 'FAN_FAVORITE' }, ['簽名會結束時，手已經握到發酸。', '有個小朋友說：「我長大也要穿你的號碼。」']],
    ['ignore', '關掉討論，專心練球', { t: 2 }, ['你把手機留在櫃子裡。', '安靜，有時候就是最好的訓練。', '隊友說：「外面怎麼說都不用管啦，專心打就好。」']]], YO);
  Ev('PRO_Y5_CORE', 'pro_start', '成為主力之後', Y(5), ['第五年，管理層開始用不一樣的語氣和你說話：「球隊接下來要靠你這種人。」', '同時，內部的競爭也沒有因此變少——新人一批一批進來。'], [
    ['lead', '把這份期待當成責任', { t: 2, coach: 2 }, ['你接下了更多賽前準備的工作。', '責任很重，但你發現自己沒有想像中那麼怕。', '隊友在背後說：「你可以的啦，我們都在你後面。」']],
    ['balance', '提醒自己不要被角色綁住', { t: 1, veteran: 2 }, ['前輩對你說：「主力不是頭銜，是每天重新拿回來的。」', '你把這句話貼在櫃子裡。']],
    ['team', '先照顧好身邊的人', { team: 3, flag: 'CORE_TEAM_FIRST' }, ['你開始主動找年輕隊友吃飯、聊天。', '更衣室的氣氛，有了小小的改變。', '隊友笑著說：「有你在，我們心裡就安心多了。」']]], YO);
  Ev('PRO_Y6_TITLE_CHASE', 'pro_start', '第一次完整的追冠', Y(6), ['這是你第一次真正把「總冠軍」當成賽季目標。', '教練在開季會議上說：「想拿冠軍，就從今天的每一場開始。」'], [
    ['all', '全力以赴，每一場都當決賽', { t: 2, team: 2 }, ['你把所有的力氣都押在這一季。', '你知道這樣很累，但也很踏實。', '隊友們吆喝：「每一場都當決賽，走啦！」']],
    ['steady', '穩定節奏，不給自己太大壓力', { t: 1, coach: 2 }, ['你提醒自己：冠軍是累積出來的。', '教練點頭：「這樣最好。」']],
    ['veteran', '向老將請教大賽經驗', { veteran: 3, t: 1 }, ['老將說：「大賽沒有祕訣，只有不被情緒帶走。」', '你把這句話默默記了下來。']]], YO);
  Ev('PRO_Y7_PRESSURE', 'pro_start', '明星的另一面', Y(7), ['經紀人帶來了幾份代言邀約，還有一份滿滿的行程表。', '你的名字越來越響亮，可是自己的時間，越來越少。', '經紀人翻著行程表說：「機會很多，但你得決定哪些要推掉。」'], [
    ['accept', '接下部分代言，其餘婉拒', { t: -1, team: 1, flag: 'ENDORSE_SOME' }, ['你和經紀人坐下來一項一項勾選。', '最後留下的，都是你覺得「還能談得上喜歡」的。']],
    ['refuse', '全部推掉，專心比賽', { t: 2, flag: 'ENDORSE_NONE' }, ['經紀人嘆了口氣，但還是點頭。', '你知道，這是一個要承擔的選擇。']],
    ['family', '把休息日留給家人朋友', { team: 2, coach: 1, flag: 'LIFE_BALANCE' }, ['你關掉手機，回老家吃了一頓飯。', '母親什麼都沒問，只多夾了你愛吃的菜。', '母親把碗推過來：「在外面辛苦了，多吃一點啦。」']]], YO);
  Ev('PRO_Y8_COMEBACK', 'pro_start', '回到球場的路', Y(8, [E('econ.mood', 'lte', 55)]), ['這一年，你的身體和心情都不在最好的狀態。', '復健師說：「不要急，但也不要停。」（劇情演出：不代表遊戲內有傷病系統）'], [
    ['rehab', '照復健計畫，一格一格往前', { t: 1, coach: 3, flag: 'REHAB_FAITHFUL' }, ['你把每一次的訓練量，都寫在筆記上。', '有些日子毫無進展，但你沒有缺席。', '防護員在旁邊說：「一格一格來啦，你一定回得來。」']],
    ['rest', '給自己更多的休息時間', { team: 2, flag: 'REHAB_PATIENT' }, ['你告訴自己：沒有人規定一定要多快回來。', '回來的那天，隊友替你把手套放在櫃子上。', '隊友喊著：「歡迎回來！球場一直在等你欸。」']],
    ['talk', '向隊友坦白自己的不安', { team: 3, veteran: 2 }, ['你說出口之後，才發現原來大家都經歷過。', '那天晚上，你睡得比這幾個月都好。', '隊友拍拍你：「誰都會怕啦，一起撐，我們還有一整季。」']]], Object.assign({}, YO, { priority: 16 }));
  Ev('PRO_Y8_BODYCARE', 'pro_start', '長期的身體管理', Y(8, [E('econ.mood', 'gt', 55)]), ['第八年，球團的防護員提醒你：年輕時的透支，會在這個時間點開始顯現。', '你的狀態不錯，但沒有人敢保證能一直這樣下去。', '防護員一邊貼護帶一邊說：「身體不會騙人，現在不處理，以後會連本帶利要回去。」'], [
    ['plan', '和防護員、營養師訂下長期計畫', { t: 1, coach: 2, flag: 'BODYCARE_PLAN' }, ['你把睡眠、飲食和訓練量排成一張表。', '防護員笑說：「很少有人這麼認真。」']],
    ['push', '照目前的節奏繼續衝', { t: 2 }, ['你覺得身體還撐得住，不想把節奏放慢。', '你只在心裡留了一句：該聽身體說話了。', '防護員皺著眉說：「再硬撐下去，球季真的會斷在這裡喔。」']],
    ['mentor', '把自己的方法分享給年輕人', { team: 3, veteran: 1 }, ['年輕球員圍著你問東問西。', '你發現教人，也是在整理自己。', '年輕人握緊拳頭：「前輩，這招我一定練到會！」']]], YO);
  Ev('PRO_Y9_SCOUTED', 'pro_start', '被研究的人', Y(9), ['對手的分析團隊開始針對你做功課。', '你發現球路和配球都和以前不一樣了——他們很清楚你的習慣。', '休息區裡，教練團看著分析報告說：「他們盯上你了，我們得換個打法。」'], [
    ['adjust', '調整習慣，打破對方預期', { t: 2, coach: 2 }, ['你和教練在錄影室待到深夜，把每個招式拆開重組。', '改變很不舒服，但你覺得自己在進步。', '教練說：「對方看得出來，你就再變一次啦，這樣才厲害。」']],
    ['trust', '相信自己的基本功', { t: 1, veteran: 2 }, ['前輩說：「真正的好球員，被研究也沒關係。」', '你用同樣的節奏，慢慢站穩。']],
    ['study', '也開始研究對手', { t: 1, team: 2, flag: 'SCOUT_BACK' }, ['你開始整理每個對手的習慣。', '隊友自願加入，筆記越來越厚。', '隊友喊著：「換我們來看穿他們啦！」']]], YO);
  Ev('PRO_Y10_LEADER', 'pro_start', '十年的重量', Y(10), ['你已經在這個聯盟打了十年。', '球隊低潮的時候，大家不自覺地看向你，等你開口。', '年輕球員小聲問你：「前輩，你覺得我們現在該怎麼辦？」'], [
    ['speak', '主動站出來，在更衣室說話', { team: 3, coach: 2, flag: 'CAPTAIN_VOICE' }, ['你說的不多，只有幾句。', '但那一天之後，球隊的氣氛不一樣了。', '年輕隊友大聲說：「我們跟你一起拚啦！」']],
    ['act', '用行動帶頭，不多說話', { t: 2, team: 2 }, ['你比誰都早到，比誰都晚走。', '年輕人看著你，慢慢也有了樣子。', '年輕人小聲說：「我也想變得像前輩一樣。」']],
    ['listen', '先傾聽每個人的想法', { team: 3, veteran: 1, coach: 1 }, ['你一個一個問：「你怎麼想？」', '有人第一次對你說出藏在心裡的話。']]], YO);
  Ev('PRO_Y11_NEXT', 'pro_start', '新秀的身影', Y(11), ['球隊選進了一位很有潛力的新人，教練已經開始讓他得到機會。', '你感覺到自己的位置，不再像以前那麼穩。', '休息區裡，那位新人朝你點頭：「前輩，我可以看你的練習嗎？」你一時不知道該怎麼回。'], [
    ['teach', '把經驗毫不保留地教給他', { team: 3, coach: 2, flag: 'MENTOR_ROOKIE' }, ['你教他怎麼預備、怎麼看對手、怎麼面對失敗。', '他說：「我想成為像你一樣的人。」']],
    ['compete', '把他當成對手，守住位置', { t: 2 }, ['你更用力地練習。', '你告訴自己：他很強，但我也還沒有輸。', '教練在旁邊說：「有競爭才會進步啦，兩個都加油。」']],
    ['both', '一邊競爭，一邊提點', { t: 1, team: 2, coach: 1 }, ['你們在場上是對手，下了場是前後輩。', '這樣的關係，其實也不壞。', '年輕人說：「前輩，我會追上你的啦，等著看喔！」']]], YO);
  Ev('PRO_Y12_WINDOW', 'pro_start', '還有一次窗口', Y(12), ['球隊戰力正好，教練說：「這可能是我們最好的一次機會。」', '你第一次認真想：自己還能打幾年？'], [
    ['chase', '全力衝這一次冠軍', { t: 2, team: 2, flag: 'THOUGHT_CHASE' }, ['你把退休的念頭放在一邊，把心都放進這一季。', '你想，拿不拿得到都不後悔。', '隊友們喊著：「這次冠軍，我們一起把它抱回來！」']],
    ['think', '開始認真想退役這件事', { coach: 1, flag: 'THOUGHT_RETIRE' }, ['你一個人坐在空蕩蕩的看台上想了很久。', '沒有答案，但你不再逃避這個問題。']],
    ['talk', '和家人聊聊未來', { team: 1, flag: 'TALKED_FAMILY' }, ['家人說：「你想打，我們就陪你打。」', '你鼻子有點酸，沒有再說話。']]], YO);
  Ev('PRO_Y13_VETERAN', 'pro_start', '老將的位置', Y(13), ['你的出場時間開始變得不固定，更多時候是被需要時才上場。', '教練私下問你：「有沒有想過之後要做什麼？」'], [
    ['role', '接受新的角色，把自己準備好', { t: 1, coach: 3 }, ['你不再計較上場的次數，只在乎每次上場的品質。', '教練說：「你這樣的老將，我很放心。」']],
    ['fight', '不服輸，繼續爭先發', { t: 2, veteran: -1 }, ['你用更多的訓練證明自己還沒走下坡。', '有些人敬佩，也有些人搖頭。', '球迷在看台上喊：「老將加油！我們都挺你啦！」']],
    ['future', '開始和教練談之後的出路', { coach: 2, flag: 'COACH_PATH' }, ['你們聊到教練團、聊到青訓。', '你第一次想像自己站在場邊的樣子。', '教練說：「想當教練的話，隨時來找我聊啦。」']]], YO);
  Ev('PRO_Y14_PLAN', 'pro_start', '最後完整球季的準備', Y(14), ['如果還要再打，這是最後一次可以認真準備的完整球季。', '你可以選擇這一年的方向。'], [
    ['start', '拚到最後，再爭一次先發', { t: 2, flag: 'PLAN_START' }, ['你把自己放回新人的位置，從零開始練。', '你不想有任何一個「早知道」。']],
    ['mentor', '把心力放在帶新人', { team: 3, coach: 2, flag: 'PLAN_MENTOR' }, ['你把自己的練習時間分一半給年輕人。', '你知道，這會是留得最久的東西。', '新人大聲說：「前輩教的，我一輩子都不會忘啦！」']],
    ['title', '把冠軍當成最後的目標', { t: 1, team: 2, flag: 'PLAN_TITLE' }, ['你在全隊面前說：「我想和你們再拿一次。」', '沒有人笑，大家都點頭。']]], YO);
  Ev('PRO_Y15_LAST', 'pro_start', '最後的球季', Y(15), ['第十五個球季，也許是最後一個。', '不管這一年怎麼結束，你都已經在這個聯盟留下了自己的名字。結局不是別人決定，是你。'], [
    ['savor', '好好享受每一場比賽', { team: 2, flag: 'FINAL_SEASON', fv: 'savor' }, ['你比過去更用力地聽觀眾的聲音。', '每一次上場，都比平常更慢一點。']],
    ['fight', '用盡全力，不留遺憾', { t: 2, flag: 'FINAL_SEASON', fv: 'fight' }, ['你把所有想做的事都排進這一季。', '你想起第一天走進休息室的樣子。', '隊友笑著說：「老大，今天也一起拚到最後喔！」']],
    ['quiet', '平靜地面對，一場一場打', { t: 1, coach: 1, flag: 'FINAL_SEASON', fv: 'quiet' }, ['你沒有特別宣布什麼。', '只是把球衣掛好，把鞋帶綁緊。']]], { once_per_career: true, priority: 17 });

  /* ---------- 退役選擇（offseason；第 15 年起可自願，第 20 年強制）。RETIRE_CHOICE 旗標＝ceremony／quiet／lastdance／again；13e 的 goNext() 讀取它進入退役回顧 ---------- */
  const CH = (id, label, e, res) => [id, label, Object.assign({ flag: 'RETIRE_CHOICE', fv: id }, e), res];
  Ev('PRO_RETIRE_CHAMP', 'offseason', '以冠軍作結', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', true)], ['{team}拿下了總冠軍，你站在慶功宴的角落，看著大家笑得像孩子。', '你知道，這可能就是你能想像最好的告別。你會怎麼做？', '有位年輕隊友舉著杯子找到你：「前輩，謝謝你這幾年的照顧！」'], [
    CH('lastdance', '以冠軍作為最後一舞，正式退役', { team: 3, coach: 2 }, ['你把球衣掛回櫃子，輕輕撫過號碼。', '「這樣就夠了。」你說。']),
    CH('ceremony', '舉辦告別賽，感謝球迷', { team: 2, coach: 1 }, ['告別賽那天，看台坐滿了人。', '你向每個方向都鞠了躬。', '球迷們一起喊：「謝謝你！我們永遠挺你啦！」']),
    CH('again', '再戰一年', { t: 1 }, ['你笑說：「還沒打夠。」', '隊友們起鬨：「那就明年再來一次。」'])], { once_per_season: true, priority: 30 });
  Ev('PRO_RETIRE', 'offseason', '要不要再打一年', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', false), E('career.heavy', 'lt', 7), E('career.lowYears', 'lt', 2)], ['球季落幕。你的身體、成績和球隊的需要，都放在眼前。', '退役是你的決定，不是別人的。不管選哪一條路，都不需要向誰解釋。', '經紀人與球團代表都沒有催你，只說：「想清楚就好，我們尊重你的決定。」'], [
    CH('ceremony', '舉辦告別賽，與球迷道別', { team: 3, coach: 1 }, ['告別賽那天，球迷用你的名字唱了一整局。', '你站在投手丘（打擊區）旁邊，深深地鞠躬。', '球迷們喊著：「謝謝你這些年！我們都記得喔！」']),
    CH('quiet', '低調退役，把焦點留給球隊', { team: 3, veteran: 1 }, ['你沒有開記者會，只發了一封給隊友的信。', '更衣室裡，有人默默替你把號碼擦乾淨。', '隊友說：「這幾年，謝謝你一直罩著我們啦。」']),
    CH('again', '再戰一年', { t: 1 }, ['你告訴自己：還有一個球季。', '教練笑了：「那就好好打。」'])], { once_per_season: true, priority: 30 });
  Ev('PRO_RETIRE_FORCED', 'offseason', '二十年的終點', [E('year', 'gte', 20)], ['這是你的第二十個球季。聯盟裡沒有比你更久的名字了。', '不管成績、不管名次，這條路走到這裡，已經是完整的一生。'], [
    CH('ceremony', '舉辦告別賽，與球迷道別', { team: 3, coach: 2 }, ['二十年的回憶，在球場上一幕幕閃過。', '最後，你把帽子拿在手上，深深地鞠躬。', '球迷們一起喊：「你是我們的英雄啦，謝謝你！」']),
    CH('quiet', '低調退役，感謝所有人', { team: 3, veteran: 2 }, ['你寫了一封信，沒有留下任何多餘的話。', '但每個看過的人，都知道你想說什麼。'])], { once_per_season: true, priority: 35 });


  /* 結局 E：因身體負荷（career.heavy：高出賽／高投球量的球季數）或長期出場機會減少（career.lowYears）而出現的特殊退役選擇；仍由玩家決定，可選「再戰一年」 */
  Ev('PRO_RETIRE_HEALTH', 'offseason', '身體的警訊', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', false), E('career.heavy', 'gte', 7)], ['多年來高強度的出賽，讓你的身體留下了無法忽視的痕跡。', '防護員和復健師都希望你好好考慮——但他們說：「怎麼選，是你的決定。」（劇情演出：遊戲內沒有傷病系統，此選項由累積出賽量觸發）'], [
    CH('health', '為了身體，選擇光榮退役', { team: 3, coach: 2 }, ['你向球團與球迷說明了自己的狀況。', '沒有人責怪你，掌聲比任何一次安打都還要長。', '球迷喊著：「好好保重喔，你永遠是我們的英雄！」']),
    CH('ceremony', '舉辦告別賽，把最後一場留給球迷', { team: 3, coach: 1 }, ['你在告別賽中只打了一個打席（或投了一局）。', '但那一瞬間，整座球場都站了起來。', '球迷們一起喊：「謝謝你！我們陪你到最後一刻！」']),
    CH('again', '調整訓練量，再戰一年', { t: -1, coach: 1 }, ['你和防護團隊重新排了一張嚴格的訓練表。', '你知道這是賭注，但你還想再試一次。', '教練拍拍你的背：「再拚一年啦，不過這次我們打聰明一點。」'])], { once_per_season: true, priority: 32 });
  Ev('PRO_RETIRE_DECLINE', 'offseason', '逐漸減少的出場', [E('year', 'gte', 10), E('year', 'lt', 20), E('team.champion', 'eq', false), E('career.heavy', 'lt', 7), E('career.lowYears', 'gte', 2)], ['接連幾個球季，你的名字越來越少出現在先發名單上。', '教練私下對你說：「球隊永遠需要你。但你想以什麼樣的方式繼續，要由你決定。」'], [
    CH('decline', '坦然接受，結束球員生涯', { team: 2, coach: 3 }, ['你把這些年的筆記整理好，交給年輕的後輩。', '走出球場時，你覺得肩上輕了不少。', '隊友說：「辛苦啦，你真的已經很棒了。」']),
    CH('quiet', '低調退役，把位置留給年輕人', { team: 3, veteran: 1 }, ['你沒有開記者會，只在更衣室留了一張紙條。', '紙條上只有四個字：「謝謝大家」。']),
    CH('again', '不甘心，再拚一年', { t: 1 }, ['你把全部時間都放進了訓練。', '你想要的不是紀錄，只是再一次證明自己。', '隊友喊著：「你不服輸，那我們就陪你拚啦！」'])], { once_per_season: true, priority: 31 });


  /* ====================== 第二十版：生涯劇情擴充（皆為虛構演出）======================
     條件欄位由 13e 的 storyCtx() 提供：kind（bat／pit／two）、season（本季累計成績＋asg＝全明星資格）、career（生涯累計 h／hr／rbi／w／sv／pk）、
     inj（目前傷勢 sev／games）、healthy、rel（關係值）、award（球季結算時的獎項）、econ（存款／體能／心情）。ctx 沒有提供的欄位＝條件不成立，所以舊測試環境不受影響。
     效果只用：信賴度、心情、體能（有 13i 才有）、關係值、旗標；單次變動仍夾在 ±5。 */
  const KB = E('kind', 'in', ['bat', 'two']), KP = E('kind', 'in', ['pit', 'two']), PLAYED = E('lastGame.played', 'eq', true);
  const O1 = (pri, o) => Object.assign({ once_per_career: true, priority: pri }, o || {}), OS = (pri, o) => Object.assign({ once_per_season: true, priority: pri }, o || {});

  /* --- 春訓 --- */
  Ev('PRO_SPRING_CAMP', 'pro_start', '春訓營', [E('season.g', 'gte', 0)], ['二月的南部球場，早晨的風還帶著涼意。', '{team}的春訓營開始了。球員分組輪流練習，教練與防護團隊在場邊記錄每個人的狀態。這段時間要把什麼練到位，由你自己決定。', '教練在場邊拍手：「新的一年，從基本功開始，一項一項來！」'], [
    ['skill', '集中練技術細節', { t: 1, coach: 2 }, ['你把一個動作反覆練到肌肉自己記得為止。', '訓練員在記錄表上畫了一個圈，沒說為什麼。']],
    ['body', '先把體能與柔軟度補起來', { mood: 2, medical: 2 }, ['防護員替你排了一份伸展與核心訓練表。', '三週後，你上下樓梯時，膝蓋不再發出聲音。', '防護員說：「這樣練下去，今年身體會很穩喔。」']],
    ['team', '和隊友一起吃飯聊天，把默契養起來', { team: 3, mood: 2 }, ['晚餐時，大家輪流說出自己最怕的情況。', '那一晚的笑聲，比球場上的口號更有力量。', '隊友們舉起杯子：「今年好好吃、好好練，一起衝啦！」']]], OS(9));

  /* --- 里程碑（打者／二刀流）--- */
  Ev('PRO_FIRST_HIT', 'after_game', '生涯第一支安打', [KB, E('career.h', 'gte', 1), PLAYED], ['球在球棒上彈開的那一瞬間，你甚至沒有聽見聲音。', '壘審比出安全手勢，休息區所有人都站了起來。你站在一壘上，才發現雙腳有點發軟。', '一壘指導員拍著你的背大笑：「球留下來！那是你的！」'], [
    ['ball', '請工作人員把那顆球留下來', { mood: 3, flag: 'FIRST_HIT_BALL' }, ['賽後，一位工作人員把球交到你手上，上面用簽字筆寫了日期。', '你把它放在家裡最顯眼的位置。', '工作人員笑著說：「這顆球一定要留給你啦。」']],
    ['family', '賽後第一時間打給家人', { mood: 4, team: 1 }, ['電話那頭先是一陣尖叫，然後是吸鼻子的聲音。', '你笑著說：「不要哭啦，只是一支安打。」']],
    ['next', '告訴自己：這只是一支安打', { t: 2 }, ['你把喜悅壓在心底，回到打擊籠重新檢查動作。', '教練遠遠看著，沒有說話。']]], O1(22));
  Ev('PRO_FIRST_HR', 'after_game', '生涯第一支全壘打', [KB, E('career.hr', 'gte', 1), PLAYED], ['球飛出去的軌跡很高，你一邊跑一邊看著它落進看台。', '繞壘的每一步都像踩在雲上。回到本壘時，隊友把你團團圍住。', '隊友們在本壘邊大喊：「就是這樣！」'], [
    ['fan', '向看台脫帽致意', { mood: 3, team: 1, flag: 'FIRST_HR_FANS' }, ['你脫下帽子，朝球落下的方向深深一鞠躬。', '有位球迷後來在社群貼出撿到那顆球的照片，說要親手還給你。', '球迷大喊：「那一棒太爽了啦！明天全場都喊你的名字！」']],
    ['team', '把功勞歸給投手與跑者', { team: 3 }, ['你在受訪時，先說了前面兩位隊友的名字。', '更衣室裡有人悄悄記住了這件事。', '隊友大喊：「這支全壘打是大家的啦，下一棒繼續衝！」']],
    ['calm', '回到休息區，立刻看下一個打席', { t: 2 }, ['你擦了擦汗，什麼也沒說，只是拿起筆記本。', '好感覺會過去，但你想留下的是方法。', '隊友吐槽：「欸，你剛轟完還在看喔？」']]], O1(26));
  Ev('PRO_HR_TEN', 'after_game', '單季十轟', [KB, E('season.hr', 'gte', 10)], ['記分板上，你的全壘打數字來到了兩位數。', '賽前練習時，對手的捕手也特意多看了你一眼。長打，已經是你的標誌。', '對手捕手隨口說了一句：「這根球棒，今年很不好對付啊。」'], [
    ['power', '繼續強化長打，把數字再往上推', { t: 2, coach: 1 }, ['你和打擊教練把揮棒路徑重新拆解了一遍。', '「力量不是亂揮，」教練說，「是每次都打在對的位置。」']],
    ['balance', '提醒自己不要為了長打放棄選球', { t: 1, veteran: 2 }, ['前輩笑你想得真多，卻也點頭說：「這樣才能打得久。」']],
    ['fun', '享受這段打擊感覺最好的日子', { mood: 4 }, ['你不再計算數字，只管把每一球打得乾淨。', '有些日子，就是要被好好記住。', '隊友喊著：「手感正熱欸，再來一支啦！」']]], O1(27));
  Ev('PRO_HOT_BAT', 'after_game', '打擊率站上三成', [KB, E('season.ab', 'gte', 100), E('season.avg', 'gte', 0.3)], ['你的打擊率已經站穩三成。', '對手的配球開始變得小心翼翼，球評也在轉播裡提到了你的名字。', '休息室裡，打擊教練笑著說：「別動你的節奏，就這樣打。」'], [
    ['keep', '維持原本的準備流程，不去動它', { t: 2, coach: 1 }, ['你比平常更嚴格地執行賽前流程，連熱身的順序都沒有改。', '隊友笑說：「你這個習慣也太穩了吧。」']],
    ['share', '把自己的準備方式分享給隊友', { team: 3, mood: 1 }, ['幾位年輕球員圍著你問東問西。', '你發現，教別人也是在整理自己的想法。', '隊友認真說：「學起來啦，我們整條打線一起熱起來！」']],
    ['scout', '研究對手為什麼開始改變配球', { t: 1, rival: 1 }, ['你把最近幾場的配球模式全部畫成了圖。', '下一場，你猜中了第一個球。', '隊友大喊：「猜中了啦！就是這個節奏，再來一球！」']]], OS(29));
  Ev('PRO_COLD_BAT', 'after_game', '打不出去的日子', [KB, E('season.ab', 'gte', 60), E('season.avg', 'lte', 0.19)], ['打擊率停在一成多，每一次打出去的球都剛好被接殺。', '你開始在睡前一遍遍回想那些離安打只差一點點的球。'], [
    ['video', '把影片看到畫面背得出來', { t: 2, coach: 1 }, ['你終於發現，自己最近出棒總是慢了半拍。', '不是力量的問題，是想得太多。', '隊友笑著說：「別想那麼多啦，放膽揮就對了。」']],
    ['talk', '找打擊教練談談', { coach: 3, t: 1 }, ['教練只問了你一個問題：「你上一次覺得打擊很好玩，是什麼時候？」', '你答不出來，卻突然明白了什麼。']],
    ['break', '給自己一天完全不碰球棒', { mood: 4 }, ['你去了海邊，什麼都沒帶。', '回程時，你已經開始期待明天的練習。', '教練說：「明天回來，把球棒好好揮開啦。」']]], { cooldown_games: 30, priority: 33 });

  /* --- 里程碑（投手／二刀流）--- */
  Ev('PRO_FIRST_WIN', 'after_game', '生涯第一勝', [KP, E('career.w', 'gte', 1)], ['最後一個出局數落進手套，你的名字被記在勝投欄位。', '隊友輪流過來和你擊掌，捕手把比賽用球塞進你手裡：「這顆，是你的。」'], [
    ['ball', '把那顆球好好收起來', { mood: 3, flag: 'FIRST_WIN_BALL' }, ['你請人把日期、對手和比數寫在球上。', '它後來被放進家裡的玻璃櫃，最上面一格。', '家人驚呼：「哇，這顆要擺最上面那格喔！」']],
    ['catcher', '先謝謝捕手一路的引導', { team: 3, mood: 1 }, ['你向捕手低頭道謝，他卻說：「是你自己投出來的。」', '兩個人都笑了。']],
    ['next', '回去檢討今天的每一球', { t: 2, coach: 1 }, ['你把今天投過的球全部在紙上畫了出來。', '勝投很珍貴，但你更想知道怎麼投得更好。', '教練說：「勝投先放一邊啦，下一場我們要投得更好。」']]], O1(26));
  Ev('PRO_FIRST_SAVE', 'after_game', '第一次守住勝利', [KP, E('career.sv', 'gte', 1)], ['九局下，領先一分，兩個出局。', '當最後一球被打成滾地球、一壘手穩穩接下的時候，全場的聲音突然炸開。你才發現，自己的手一直在發抖。', '捕手衝上來抱住你，在你耳邊大喊：「你守住了！」'], [
    ['breathe', '深呼吸，提醒自己：下一次還要再來', { t: 2 }, ['你把剛才那種緊張的感覺，一字一句記在筆記本。', '那種心跳，只有守過的人才懂。', '隊友說：「下一次也交給你囉！」']],
    ['team', '和守備隊友一起慶祝', { team: 3, mood: 2 }, ['你們在投手丘旁邊圍成一圈，像孩子一樣笑。', '隊友喊著：「封鎖成功啦！今天是我們的夜晚！」']],
    ['coach', '去找投手教練複習最後一個打者', { coach: 3, t: 1 }, ['教練把那個打席的球路逐一畫出來，指給你看哪裡可以更好。', '投手教練說：「這顆球再壓低一點，下次就能三振他了啦。」']]], O1(26));
  Ev('PRO_TEN_WINS', 'after_game', '單季十勝', [KP, E('season.w', 'gte', 10)], ['勝投欄位的數字來到了兩位數。', '休息室裡有人開玩笑說，下一場該你請客了。', '捕手湊過來笑著說：「請客的時候，記得點貴一點的！」'], [
    ['team', '請全隊吃一頓好的', { team: 3, mood: 2 }, ['那頓飯的收據你一直留著。', '比任何一場勝利都更實在。', '隊友們舉杯：「下一個十勝，我們再一起拚！」']],
    ['train', '繼續投下去，不去想數字', { t: 2 }, ['你每天的準備都沒有變，連吃飯的時間都固定。', '隊友笑說：「你是機器人喔，連吃飯都這麼準時。」']],
    ['thank', '打電話給當年教你投球的人', { mood: 4, veteran: 1 }, ['電話那一頭安靜了很久，然後說：「我早就知道。」']]], OS(27));
  Ev('PRO_K_HUNDRED', 'after_game', '生涯第一百次三振', [KP, E('career.pk', 'gte', 100)], ['累計奪三振來到一百，記錄員在賽後特別多寫了一行。', '你想起第一個被你三振的打者，那顆球其實有點偏。'], [
    ['thanks', '謝謝每一位陪你練球的人', { team: 2, coach: 1 }, ['你在休息區慢慢念出每個名字，念到最後一個，聲音有點啞。', '隊友大喊：「下一個一百，我們繼續一起拚！」']],
    ['more', '告訴自己：下一個一百更重要', { t: 2 }, ['你把這個數字貼在櫃子裡，旁邊寫了更大的一個。', '教練說：「下一個一百才見真功夫啦，繼續投！」']]], O1(25));
  Ev('PRO_PIT_ROUGH', 'after_game', '被打爆的幾場', [KP, E('season.outs', 'gte', 45), E('season.era', 'gte', 6.5)], ['連續幾場，你都在前幾局就被打出滿壘。', '防禦率一路往上，你開始害怕看轉播的數據欄。', '投手教練在休息區對你說：「球沒有問題，是腦袋太急了，慢一點。」'], [
    ['basic', '回到最基本的控球練習', { t: 2, coach: 2 }, ['你把球種一個一個拆開，從最簡單的直球開始。', '投手教練說：「不好的日子，要用最笨的方法走出來。」']],
    ['catcher', '和捕手重新討論配球', { team: 2, t: 1 }, ['捕手把這幾場的配球攤開來，兩個人一球一球檢討。', '你才發現，自己一直在用同樣的節奏。', '捕手說：「這次換個方式啦，我們一起把打者逼到角落。」']],
    ['rest', '讓手臂休息幾天', { mood: 3, medical: 2 }, ['防護員幫你檢查了肩膀和手肘，確定沒有大礙。', '「休息也是訓練的一部分，」他說。']]], { cooldown_games: 30, priority: 33 });

  /* --- 全明星 --- */
  Ev('PRO_ALLSTAR_PICKED', 'after_game', '明星賽的名單', [E('gameNo', 'gte', 55), E('gameNo', 'lt', 100), E('season.asg', 'eq', true)], ['聯盟公布明星賽名單，你的名字出現在其中。', '球團的公關跑來通知你，教練拍了拍你的背：「好好去玩，也好好去看看別人怎麼打球。」'], [
    ['enjoy', '把握機會，好好享受這場盛會', { mood: 5, team: 1 }, ['你在場邊和對手球隊的球星合照，收到了不少簽名球。', '那天晚上，你發現所有人都只是熱愛棒球的人。', '其他球星笑著說：「來啦，這種舞台，大家一起玩個痛快！」']],
    ['learn', '向其他球星請教一個細節', { t: 2, veteran: 2 }, ['你找到平常只在轉播裡看到的前輩，鼓起勇氣問出了心裡的問題。', '他花了二十分鐘，回答得比你想的更仔細。', '球星拍拍你：「這個細節抓牢，你會更上一層樓啦。」']],
    ['fans', '花時間和球迷互動', { team: 2, mood: 3, flag: 'ASG_FAN_DAY' }, ['簽名會持續了很久，你的手握到發酸。', '有個孩子說：「我也要當職業球員。」']]], OS(19));

  /* --- 傷病（條件＝13i 傷病系統；醫療團隊關係）--- */
  Ev('PRO_INJURY_LIGHT', 'after_game', '小傷', [E('inj.sev', 'eq', 'light')], ['賽後，你覺得身體哪裡不太對勁。', '防護員檢查後告訴你：「不嚴重，但需要休息幾天。」'], [
    ['rest', '乖乖休息，照醫囑復健', { medical: 3, mood: 1, flag: 'INJ_SEEN' }, ['你把復健流程一項一項照做，一天都沒有偷懶。', '防護員說：「很少有人這麼聽話。」']],
    ['tough', '想盡快回場，多做一些訓練', { t: 1, medical: -1, flag: 'INJ_SEEN' }, ['你忍著不適繼續練習，防護員皺了皺眉頭。', '你知道，這樣的決定有它的風險。', '防護員提醒你：「逞強會讓整季泡湯，先把傷養好再衝啦。」']],
    ['learn', '趁養傷的時間研究對手', { t: 1, coach: 1, flag: 'INJ_SEEN' }, ['你抱著筆電坐在休息區，把影片一場一場看完。', '防護員探頭說：「眼睛也要休息一下喔。」']]], { cooldown_games: 15, priority: 45 });
  Ev('PRO_INJURY_MID', 'after_game', '需要好好處理的傷', [E('inj.sev', 'eq', 'mid')], ['檢查結果出來了，需要比預期更長的時間休養。', '復健師把訓練計畫攤開在桌上：「如果你願意配合，我們會盡量讓你回得完整。」'], [
    ['plan', '全盤接受復健計畫', { medical: 4, t: 1, flag: 'INJ_SEEN' }, ['計畫表貼在你的櫃子上，每完成一格就畫一個勾。', '防護員說：「每一格都算數啦，我陪你到回場那天。」']],
    ['team', '請隊友陪你一起練', { team: 3, mood: 2, flag: 'INJ_SEEN' }, ['有人願意在賽後多留半小時，陪你做那些枯燥的動作。', '隊友笑著說：「慢慢來沒關係啦，我們陪你，回來再一起打爆他們！」']],
    ['worry', '坦白說出對傷勢的擔心', { medical: 2, mood: 2, flag: 'INJ_SEEN' }, ['復健師沒有說空話，只說：「我看過更糟的，也看過回來的人。」']]], { cooldown_games: 45, priority: 45 });
  Ev('PRO_INJURY_SEVERE', 'after_game', '最漫長的一段路', [E('inj.sev', 'eq', 'severe')], ['醫生看著影像，沉默了一下才開口。', '這不是一兩週能解決的傷勢。你的球季，很可能就在這裡暫停。', '醫生終於開口：「先別想球季，我們先把復健的路規劃好。」'], [
    ['fight', '告訴自己：一定要回來', { t: 1, medical: 3, flag: 'INJ_SEEN' }, ['你把復健的目標貼在床頭。', '第一天，連簡單的動作都做不好，你只能笑著把汗擦掉。', '防護員說：「現在每一點進步都算數啦，你一定回得來。」']],
    ['family', '先回家和家人好好待幾天', { mood: 4, team: 1, flag: 'INJ_SEEN' }, ['母親什麼都沒問，只是煮了你小時候最愛吃的東西。', '母親說：「多吃一點，在家就不用想那麼多了。」']],
    ['talk', '找教練和前輩談談未來', { coach: 2, veteran: 2, flag: 'INJ_SEEN' }, ['前輩說：「我也躺過，第一個月最難，過了就會好一點。」']]], OS(46));
  Ev('PRO_INJURY_COMEBACK', 'after_game', '重回球場', [E('event_flags.INJ_SEEN', 'eq', true), E('healthy', 'eq', true)], ['傷勢終於痊癒，你換上球衣，站在休息區的最後一階。', '隊友們沒有說太多話，只是一個接一個走過來碰你的手套。', '一位老隊友低聲說：「歡迎回來，球場一直在等你。」'], [
    ['grateful', '謝謝防護團隊和一路陪伴的人', { medical: 3, team: 2, flag: 'INJ_SEEN', fv: false }, ['你向每一位防護員、復健師鞠躬。', '他們說：「你回來，就是最好的報答。」']],
    ['careful', '提醒自己：回來之後要更懂得照顧身體', { t: 1, flag: 'INJ_SEEN', fv: false }, ['你重新調整了暖身和收操的流程，每一項都做得比以前仔細。', '防護員說：「這次回來要打得久，也要打得穩喔。」']],
    ['hungry', '把這段時間的不甘心全部放進比賽', { t: 2, flag: 'INJ_SEEN', fv: false }, ['你的第一個打席（或第一球），比任何時候都有力。', '隊友大喊：「那股不甘心，今天全部打出去啦！」']]], { cooldown_games: 8, priority: 44 });

  /* --- 疲勞與金錢（econ）--- */
  Ev('PRO_FATIGUE', 'after_game', '身體在抗議', [E('econ.fit', 'lte', 45)], ['連續出賽讓你的身體開始變得沉重。', '早上起床時，雙腿像灌了鉛，防護員一看你的臉色就知道：「該休息了。」'], [
    ['rest', '主動要求減少練習量', { fit: 5, mood: 1, medical: 2 }, ['你把當天的訓練量砍了一半，早早上床。', '隔天醒來，覺得整個人都輕了一些。', '隊友說：「早點睡喔，明天再拚啦。」']],
    ['push', '咬牙撐過去', { t: 1, fit: -2 }, ['你把疲憊藏在笑容後面。', '身體記下了這筆帳，你也是。', '防護員說：「硬撐是有代價的啦，下一場我可不想看你倒下。」']],
    ['trainer', '請防護員重新排一週的恢復計畫', { medical: 3, fit: 3 }, ['他帶來一份按時間排好的表格：泡澡、按摩、睡眠。', '你第一次覺得，恢復也是一門技術。', '防護員說：「恢復也是一種比賽啦，這個禮拜我們一起贏。」']]], { cooldown_games: 25, priority: 28 });
  Ev('PRO_MONEY_WISE', 'after_game', '存款簿上的數字', [E('econ.money', 'gte', 400), E('year', 'gte', 2)], ['你翻開存款簿，上面的數字比剛進職棒時多了很多。', '你開始想：這筆錢，要拿來做什麼？'], [
    ['donate', '捐一部分給少棒隊和故鄉的球場', { mood: 4, team: 1, flag: 'DONATED' }, ['你回到當年的小球場，看見孩子們穿著洗得發白的球衣。', '那一天，你覺得自己好像也回到了起點。', '孩子們喊著：「我們以後也要打得跟你一樣強！」']],
    ['save', '好好存起來，為未來做準備', { t: 1, mood: 1 }, ['你把一部分存進長期帳戶，剩下的留作練習與恢復的預算。', '家人說：「你這樣想很對啦，穩穩的最好。」']],
    ['family', '先讓家人過得更舒服', { mood: 5, flag: 'FAMILY_FIRST' }, ['你幫家裡換了老舊的冷氣。', '母親一直說太浪費，卻悄悄在朋友面前提了好幾次。']]], O1(14));

  /* --- 關係值回收（rel 由 13h 事件累積；跨年有後續）--- */
  Ev('PRO_COACH_PAYOFF', 'after_game', '教練的託付', [E('rel.coach', 'gte', 14), E('year', 'gte', 2)], ['賽後，教練把你叫到辦公室，桌上放著一份名單。', '「我想讓你擔任一個新的角色，」他說，「不是因為你最強，是因為我信得過你。」'], [
    ['accept', '接下這份託付', { t: 3, coach: 2, flag: 'COACH_ENTRUST' }, ['你深吸一口氣，點頭答應。', '離開辦公室時，你發現自己的背挺得比來時更直。', '教練說：「這份託付不輕喔，但你扛得起來，放膽去打啦。」']],
    ['humble', '謝謝教練，但請再給我一點時間', { coach: 2, mood: 1 }, ['教練沒有生氣，反而笑了：「懂得衡量自己，也是一種資格。」']],
    ['team', '提議由大家一起分擔責任', { team: 3, coach: 1 }, ['教練想了想，說：「這個想法，我沒想過。」']]], O1(21));
  Ev('PRO_VET_LEGACY', 'after_game', '前輩的手套', [E('rel.veteran', 'gte', 12), E('year', 'gte', 3)], ['賽季的某天，那位資深前輩把一雙舊手套放在你的櫃子裡。', '上面的皮革已經被磨得發亮，內側用簽字筆寫了一行小字。', '那位前輩從旁邊走過，只淡淡說：「別問，也別推辭，好好用它。」'], [
    ['keep', '收下，好好珍惜', { mood: 4, veteran: 2, flag: 'VET_GIFT' }, ['你把手套帶回家，放在最顯眼的位置。', '你不知道自己能不能用到它，但你知道該怎麼珍惜。']],
    ['use', '帶著它上場', { t: 2, veteran: 2, flag: 'VET_GIFT' }, ['你戴著那雙手套完成第一次守備（或第一個打席）。', '前輩在休息區什麼都沒說，只是笑著點頭。']],
    ['return', '推辭，請他自己留著', { veteran: 3 }, ['他把手套硬塞回你手裡：「我已經用夠了，輪到你了。」']]], O1(21));
  Ev('PRO_TEAM_VOTE', 'after_game', '隊友的票', [E('rel.team', 'gte', 18), E('year', 'gte', 4)], ['球隊開會選出新的副隊長，有人先提了你的名字。', '你沒有拉票，也沒有拒絕——只是在隊友的目光裡，看見了期待。', '有位隊友笑著補了一句：「你一直都在，大家都看得見。」'], [
    ['accept', '接受這份信任', { team: 3, t: 2, flag: 'VICE_CAPTAIN' }, ['投票結果出來的時候，你的名字被念得特別大聲。', '你站起來，向所有人鞠躬。', '隊友們說：「我們全隊都挺你啦，一起拚！」']],
    ['share', '請大家一起分擔，不要只靠一個人', { team: 3, coach: 1, flag: 'VICE_CAPTAIN' }, ['你提議每個月輪流由不同的人帶熱身。', '休息室的氣氛慢慢變得不一樣。', '隊友大聲說：「大家一起扛啦，冠軍一起拿！」']],
    ['decline', '請把機會留給更適合的人', { team: 2, mood: 1 }, ['你的推辭反而讓大家更尊重你。', '隊友說：「你不當也是我們的核心啦，一起加油。」']]], O1(20));

  /* --- 對手線（RIVAL_STANCE 旗標：rival／friend／ignore）--- */
  Ev('PRO_RIVAL_INTRO', 'after_game', '另一個和你一樣的人', [E('year', 'gte', 2), E('gameNo', 'gte', 15), E('level', 'ne', 'farm')], ['比賽結束後，對手球隊的一位同期球員，在通道口叫住了你。', '「我記得你，」他說，「我們好像是同一年進來的。」他的眼神裡有好勝，也有一點好奇。'], [
    ['rival', '笑著說：「那我們就看誰先站到最高的地方。」', { t: 1, rival: 3, flags: { RIVAL_MET: true, RIVAL_STANCE: 'rival' } }, ['他伸出手，你握了上去。', '從這一天起，每次看到對手名單上有他，你都會多看一眼。', '對手笑著回：「好啊，頂端見！我也不會讓你喔。」']],
    ['friend', '邀他賽後一起吃個飯', { mood: 3, rival: 2, flags: { RIVAL_MET: true, RIVAL_STANCE: 'friend' } }, ['你們聊到起跑的日子、家人和自己的練習方式。', '原來每個人，都是從差不多的地方開始的。', '對手笑著說：「下次換我請啦。」']],
    ['ignore', '點個頭，繼續往前走', { t: 1, flags: { RIVAL_MET: true, RIVAL_STANCE: 'ignore' } }, ['你不想把自己的方向放在別人身上。', '但你還是記住了他的名字。']]], O1(13));
  Ev('PRO_RIVAL_REUNION', 'after_game', '多年後的再遇', [E('year', 'gte', 5), E('event_flags.RIVAL_MET', 'eq', true)], ['又一場和那支球隊的比賽，那個老對手再度站在你面前。', '你們都已不是剛進來的新人，球衣上的汗漬、眼角的細紋，都記錄著這些年的故事。', '老對手隔著打擊區朝你點點頭：「還在啊？今天，好好打。」'], [
    ['duel', '賽前碰面，約好今天要拚個痛快', { t: 2, rival: 2, flag: 'RIVAL_DUEL' }, ['那場比賽，你們各自拿出最好的狀態。', '結果誰贏都不重要，看台上的人看得很過癮。', '老對手說：「來啊，今天大家都不要留手喔！」']],
    ['talk', '賽後找他聊聊這些年', { mood: 3, rival: 3 }, ['你們坐在場邊，看著球場的燈一盞一盞熄滅。', '他說：「有你在，我才知道自己可以走多遠。」']],
    ['respect', '遠遠地向他點頭致意', { rival: 2, t: 1 }, ['他也點了點頭。有些尊重，不需要太多話。']]], O1(13));
  Ev('PRO_RIVAL_FINAL', 'after_game', '最後一次對決', [E('year', 'gte', 10), E('event_flags.PRO_RIVAL_REUNION_DONE', 'eq', true)], ['聯盟的老面孔越來越少，他是少數還留在場上的人。', '兩隊的賽前會議結束後，他走過來，遞給你一顆簽了名的球。「不知道還能碰幾次，」他說。'], [
    ['sign', '也簽一顆球給他', { mood: 4, rival: 3, flag: 'RIVAL_BALL' }, ['你們交換了球，沒有多說什麼。', '那顆球，後來一直放在你的櫃子裡。', '老對手笑著說：「謝啦，這顆我會好好收著。」']],
    ['hug', '給他一個擁抱', { mood: 5, team: 1, flag: 'RIVAL_BALL' }, ['兩個老球員在底線抱在一起，看台上傳來零星的掌聲。', '老對手在你耳邊說：「再多打幾年啦，我還想跟你比。」']],
    ['smile', '說：「下次再比一場。」', { t: 2, rival: 2 }, ['他笑得很大聲：「好，我等你。」']]], O1(13));

  /* --- 舊選擇的回報 --- */
  Ev('PRO_MENTEE_GROWN', 'pro_start', '當年的新人', [E('year', 'gte', 13), E('event_flags.MENTOR_ROOKIE', 'eq', true)], ['休息室裡多了一位新晉主力，他的櫃子就在你旁邊。', '你認出他是當年那個什麼都想學的新人，如今他已經能獨當一面。他說：「前輩，當年你教我的，我都還記得。」'], [
    ['proud', '拍拍他的肩膀：「你做得比我當年好。」', { team: 3, mood: 4, flag: 'MENTEE_BOND' }, ['他不好意思地低下頭，眼眶卻有點紅。', '你知道，這就是傳承的意思。', '年輕隊友說：「我會繼續追啦，總有一天會超越你。」']],
    ['teach', '再教他一個只有老球員才懂的訣竅', { team: 2, veteran: 1, t: 1, flag: 'MENTEE_BOND' }, ['你把自己多年來最珍貴的一個小習慣，毫無保留地告訴了他。', '後輩握緊拳頭：「這招我會帶著，一直打下去啦！」']],
    ['laugh', '開玩笑：「別忘了今天誰請客。」', { team: 2, mood: 3 }, ['休息室裡笑成一片，連教練都忍不住探頭看了一眼。', '後輩笑著回：「放心啦，贏了我請，輸了換你請！」']]], O1(14));
  Ev('PRO_FAN_LETTER', 'after_game', '一封球迷來信', [E('event_flags.FAN_FAVORITE', 'eq', true), E('year', 'gte', 6)], ['你在置物櫃裡發現一個厚厚的信封，寄信人是一位老球迷。', '信裡說，這些年看你比賽，是他生活裡最期待的事。他的字跡有些顫抖，卻寫得很認真。', '你看見信末有一句：「謝謝你，讓我每個星期都有事情可以期待。」'], [
    ['reply', '親手寫一封回信', { mood: 5, team: 1, flag: 'FAN_LETTER_REPLIED' }, ['你坐在休息室的角落，把想說的話一字一字寫下。', '幾天後，他把你的信裱起來放在客廳。', '小球迷後來說：「謝謝你的回信，我會好好練球！」']],
    ['visit', '安排球迷日，邀他到球場', { mood: 4, team: 2, flag: 'FAN_LETTER_REPLIED' }, ['他在球場見到你時，眼淚流了下來。', '你只是握住他的手，說：「謝謝你一直都在。」']],
    ['keep', '默默收好，當作比賽的力量', { t: 2 }, ['你把信放在球袋最裡層，每場比賽前都會摸一下。', '隊友好奇問：「欸，你每場都摸那個袋子，是什麼啦？」']]], O1(18));
  Ev('PRO_AGENT_RETURN', 'pro_start', '經紀人的來電', [E('year', 'gte', 9), E('event_flags.ENDORSE_SOME', 'eq', true)], ['經紀人帶來一份新的代言企劃，這次的內容比之前更貼近你的生活。', '「你當年選擇的那幾個合作，都做得很好，」他說，「現在有人想要長期簽約。」'], [
    ['sign', '簽下長期合約，穩定收入', { mood: 2, t: -1, agent: 2 }, ['簽約記者會很簡短，你只說了兩句話。', '那些代言，變成了你在球場外一個很踏實的身分。', '經紀人說：「放心啦，我會幫你把關。」']],
    ['limit', '只接下和棒球推廣有關的案子', { team: 2, agent: 1, flag: 'YOUTH_PROMO' }, ['你把代言的時間排進球隊休假日，專心去做少棒推廣。', '孩子們看見你，眼睛都亮了。', '孩子們喊著：「我們也要當棒球選手啦！」']],
    ['pass', '婉拒，專心比賽', { t: 2, agent: -1 }, ['經紀人點點頭，說他明白。', '經紀人笑說：「OK啦，球場上的事你最大。」']]], O1(14));
  Ev('PRO_AGENT_QUIET', 'pro_start', '一直低調的你', [E('year', 'gte', 9), E('event_flags.ENDORSE_NONE', 'eq', true)], ['經紀人在電話那頭笑了：「你知道嗎？這些年你推掉的邀約，比別人接的還多。」', '他說，業界開始流傳你是個只在乎球場的人。這個名聲，有人欣賞，也有人覺得可惜。'], [
    ['proud', '「我就是想把球打好。」', { t: 2, coach: 1 }, ['你說得很簡單，卻讓教練在隔天特別多看了你一眼。', '教練說：「就是這股傻勁啦，球場上見。」']],
    ['open', '考慮重新接觸一些合作', { mood: 2, agent: 2 }, ['你開始認真想，球場以外的自己，也許該有一點空間。', '經紀人說：「我先幫你整理幾個適合的，你慢慢看啦。」']],
    ['charity', '把心力放在公益和少棒', { team: 2, mood: 3, flag: 'YOUTH_PROMO' }, ['你悄悄去探望每一支少棒隊，沒有帶任何媒體。', '少棒小朋友們說：「下次你還會來嗎？我們練給你看！」']]], O1(14));

  /* --- 球季獎項（offseason；彼此互斥，最多只出現一個，不會擠掉退役選擇）--- */
  Ev('PRO_AWARD_MVP', 'offseason', '年度最有價值球員', [E('award.mvp', 'eq', true)], ['球團的頒獎典禮上，大螢幕播放著這一年你的精彩畫面。', '主持人念出你的名字，全場起立鼓掌。你站在台上，才發現手心全是汗。', '主持人握著麥克風說：「這個獎，是球迷、隊友和他自己一起寫出來的。」'], [
    ['thank', '把這座獎獻給球隊每一個人', { team: 4, coach: 2, flag: 'WON_MVP' }, ['你在台上念出了隊友、教練、防護員和球隊工作人員的名字。', '台下有人紅了眼眶。', '老教練在台下低聲說：「這座獎是你帶著大家一起拿的啦，明年繼續加油。」']],
    ['family', '把獎座帶回家，放在父母面前', { mood: 5, flag: 'WON_MVP' }, ['母親用手帕包著獎座擦了又擦，說了一句：「你做到了。」']],
    ['next', '握著獎座，已經想到明年', { t: 3, flag: 'WON_MVP' }, ['你把獎座放在櫃子最上面一格，每天一眼就能看見。', '家人說：「這座放最上面啦，超顯眼的！」']]], OS(42));
  Ev('PRO_AWARD_ROOKIE', 'offseason', '最佳新人', [E('award.rookie', 'eq', true), E('award.mvp', 'eq', false)], ['第一年的賽季結束，球團表揚了你的表現。', '頒獎的人說：「這個獎，代表一個很長旅程的第一步。」你握著獎盃，突然覺得，一切才剛開始。'], [
    ['humble', '謝謝大家，我還有很多要學', { coach: 3, team: 2, flag: 'WON_ROOKIE' }, ['你的謙虛讓更衣室裡的前輩們都笑了。', '前輩笑著說：「好小子，你還會更強啦，繼續加油！」']],
    ['goal', '在筆記本寫下下一年的目標', { t: 3, flag: 'WON_ROOKIE' }, ['你把目標寫得很具體：幾場、幾分、幾支。', '教練看了笑說：「寫這麼具體喔？很好啦。」']],
    ['call', '打電話告訴最初幫助你的人', { mood: 5, flag: 'WON_ROOKIE' }, ['電話那頭沉默了一下，然後傳來一聲哽咽。', '老教練說：「你要繼續往前飛喔，不要停啦。」']]], O1(41));
  Ev('PRO_AWARD_NIGHT', 'offseason', '年度表揚之夜', [E('award.any', 'gte', 1), E('award.mvp', 'eq', false), E('award.rookie', 'eq', false)], ['球季結束，球團舉辦了表揚晚宴。', '你的名字出現在其中幾個獎項的名單上。晚宴不算盛大，但每個人都真心鼓掌。', '領隊舉起酒杯說：「這一年，辛苦大家了。」'], [
    ['thanks', '上台簡單道謝', { team: 3, coach: 1 }, ['你的致詞只有三十秒，卻有人錄了下來。', '隊友笑說：「欸，你剛剛超短的，但我還是哭了啦。」']],
    ['quiet', '安靜地坐在台下，享受這一刻', { mood: 4 }, ['你拿著獎盃，看著台上其他人的笑容，覺得今年的辛苦都值得。']],
    ['train', '宴會一結束就回去訓練', { t: 2, coach: 1 }, ['你向教練報備後離開，球場的夜燈還亮著。', '教練說：「想練就去吧，今晚沒拚，明天可沒人等你喔。」']]], OS(40));


  /* ===== 第二十四版：新增 8 個事件（只用現有 ctx 欄位；不新增存檔欄位） ===== */
  const PL = [PLAYED];
  Ev('PRO_HIT_500', 'after_game', '生涯第五百支安打', [KB, E('career.h', 'gte', 500)].concat(PL), ['第五百支安打，是一支很普通的內野滾地球，卻剛好沒被接到。', '你站在一壘壘包上，聽見看台有人開始鼓掌，然後是整個球場。大螢幕亮出了「500」。'], [
    ['ball', '請球隊保留那顆球', { mood: 4, team: 1 }, ['你把球交給球團人員，請他們好好收著。', '多年以後，這顆球會和一張泛黃的照片一起放進展示櫃。']],
    ['thanks', '賽後先向打擊教練道謝', { coach: 3, t: 1 }, ['你在通道口等到教練出來，只說了一句：「謝謝您。」', '教練擺擺手：「是你自己一棒一棒打出來的。」']],
    ['next', '告訴自己：下一個五百才剛開始', { t: 2 }, ['你把這個數字抄進筆記本最後一頁，旁邊空了一大片。']]], O1(28));
  Ev('PRO_HR_100', 'after_game', '生涯第一百轟', [KB, E('career.hr', 'gte', 100)].concat(PL), ['球棒甩出去的瞬間，你就知道這一球不會落下來。', '這是你的第一百支全壘打。繞壘時你看見隊友全站在欄杆前，連投手教練都忍不住笑了。', '三壘指導員等在壘邊，對你喊：「一百轟了，別跑太快，享受一下！」'], [
    ['fans', '朝看台揮手，接受所有人的歡呼', { mood: 4, team: 2 }, ['你脫下帽子轉了一圈，看台的聲音像海浪一樣湧上來。', '球迷們喊著：「全場都為你加油啦！再來一支！」']],
    ['bat', '賽後把那支球棒仔細擦乾淨收好', { t: 2, veteran: 1 }, ['你在休息室用布一寸一寸擦著球棒。', '前輩路過，說：「好棒子，要懂得留。」']],
    ['young', '把一支球棒送給剛升上來的年輕球員', { team: 3, coach: 1 }, ['年輕人雙手接過去，半天說不出話。', '你拍拍他的肩：「下一個一百，換你。」']]], O1(29));
  Ev('PRO_WIN_100', 'after_game', '生涯第一百勝', [KP, E('career.w', 'gte', 100)].concat(PL), ['最後一個出局數到手，你走下投手丘時，隊友一個一個伸手過來。', '計分板上的數字寫著你的生涯勝場：一百。這一百場，每一場都有人在背後撐著你。', '捕手走上投手丘，拍了拍你的手臂：「一百勝，今天不用客氣。」'], [
    ['catcher', '先把球交給捕手，謝謝他一路接球', { team: 3, t: 1 }, ['捕手把球握在手裡，笑著說：「這顆我要留著。」']],
    ['rest', '回休息室，好好冰敷手臂', { mood: 2, medical: 2 }, ['防護員一邊包冰袋一邊念：「慶祝可以，但手臂要先照顧。」']],
    ['look', '抬頭看看計分板，把這一天記住', { mood: 4 }, ['你站在丘上看了很久，直到工作人員來關燈。', '工作人員小聲說：「那個，要關燈囉，明天再來看吧。」']]], O1(30));
  Ev('PRO_K_THOUSAND', 'after_game', '生涯第一千次三振', [KP, E('career.pk', 'gte', 1000)].concat(PL), ['又一個打者揮空，捕手把球握在手心，朝你比了個大大的手勢。', '生涯第一千次三振。轉播的畫面切到你的特寫，你只是低頭拉了拉帽沿。', '捕手把球遞給你：「這顆留著，值得收藏。」'], [
    ['plan', '把這些年的配球筆記整理給後輩', { coach: 2, team: 2 }, ['你把一本一本舊筆記翻出來，一頁一頁影印。', '年輕投手們拿到時，像拿到一份很重的禮物。', '後輩們說：「前輩，這份筆記，我們一定會傳下去啦！」']],
    ['mound', '在投手丘上再多站一會兒', { mood: 4 }, ['你用鞋底把投手板上的泥土抹平，抬頭看了一圈球場。']],
    ['next', '提醒自己：下一場還是要先讀懂打者', { t: 2 }, ['數字會過去，但每一個打者都是新的題目。']]], O1(31));
  Ev('PRO_TITLE_TWO', 'po_end', '又一座總冠軍', [E('team.champion', 'eq', true), E('seen.PRO_PO_CHAMPION.n', 'gte', 2)], ['這一次，你沒有那麼慌亂，卻比上一次更清楚這座獎盃有多重。', '香檳、彩帶、擁抱，一切都很熟悉。但你知道，每一座冠軍，都是不同的一年換來的。', '隊長高舉獎盃對大家說：「這一次，我們要好好記得每一個人。」'], [
    ['again', '提醒自己：衛冕比奪冠更難', { t: 2, coach: 1 }, ['你把獎盃放進櫃子，轉身就去翻下一年的訓練表。', '隊友笑說：「欸，你這麼快就在排明年了喔。」']],
    ['younger', '把獎盃讓年輕隊友先捧一下', { team: 4 }, ['第一次捧起獎盃的年輕人，眼眶一下子紅了。', '你在旁邊笑，想起很多年前的自己。', '年輕隊友說：「前輩，明年我們還要一起搶下它啦！」']],
    ['parade', '帶家人一起參加冠軍遊行', { mood: 4, team: 1 }, ['車隊經過的街上擠滿人，有人舉著寫了你名字的牌子。', '球迷們一起大喊：「冠軍！冠軍！」']]], O1(68));
  Ev('PRO_TITLE_BANQUET', 'po_end', '冠軍慶功宴', [E('team.champion', 'eq', true), E('seen.PRO_PO_CHAMPION.n', 'gte', 1)], ['冠軍夜之後，餐廳被球隊包了下來。', '桌上的菜還沒上齊，大家已經開始輪流講這一季的糗事，笑聲幾乎蓋過了音樂。', '有人舉杯大聲說：「下一個要講糗事的是誰？別想逃！」'], [
    ['toast', '起身帶大家一起敬杯', { team: 3, coach: 1 }, ['你舉起杯子，只說了一句：「謝謝這一年。」', '整間餐廳的杯子同時碰在一起。']],
    ['staff', '去隔壁桌敬後勤與工作人員', { team: 2, medical: 2 }, ['球隊的防護員、器材員、場務都愣了一下，隨即站起來回敬。', '工作人員們大聲說：「你們才是最耀眼的啦，明年一起再拚！」']],
    ['early', '早點離席，回去好好睡一覺', { fit: 4, mood: 2 }, ['你悄悄從後門離開，夜風很涼，腦中還在迴響剛才的歡呼。', '隊友傳訊息來：「你怎麼先跑啦？明天補一杯喔！」']]], OS(60));
  Ev('PRO_KID_FAN', 'pro_start', '場邊的小球迷', [E('year', 'gte', 8), E('event_flags.FAN_FAVORITE', 'eq', true)], ['開季前的練習，場邊有個小朋友一直踮著腳往場內看。', '他手上捧著一顆舊舊的球，球上用鉛筆寫著你的名字——字很歪，卻寫得很用力。', '小朋友鼓起勇氣喊：「請問……可以幫我簽名嗎？」'], [
    ['sign', '走過去，幫他簽名', { mood: 4, team: 1, flag: 'KID_FAN_SIGNED' }, ['你蹲下來，慢慢寫下名字，還多寫了一句「加油」。', '他緊緊抱著球，像抱著全世界。']],
    ['catch', '邀他進場，和你傳一次球', { mood: 5, t: 1, flag: 'KID_FAN_SIGNED' }, ['他接到球時整個人跳了起來。', '隊友們在旁邊笑著鼓掌。', '孩子大喊：「我以後也要站上這個球場！」']],
    ['wave', '笑著揮揮手，繼續暖身', { t: 1 }, ['你朝他比了個大拇指，他也用力揮手回應。', '孩子大喊：「我會一直看你比賽喔！」']]], O1(14));
  Ev('PRO_HOME_TABLE', 'offseason', '回家吃飯', [E('year', 'gte', 3), E('econ.mood', 'lte', 90)], ['休賽季，你回到久違的老家。', '餐桌上擺滿了你小時候愛吃的菜，爸媽沒問成績，只問你瘦了沒有。', '媽媽夾了一塊肉到你碗裡：「在外面有好好吃飯嗎？」'], [
    ['eat', '多吃兩碗，聽他們聊近況', { mood: 5 }, ['你聽著家裡的瑣事，才發現自己有多久沒這樣好好坐下來。', '家人笑著說：「多吃一點啦，不夠還有喔！」']],
    ['help', '幫忙收拾，順便陪爸爸看舊比賽', { mood: 4, t: 1 }, ['電視裡播著你很多年前的比賽。', '爸爸指著畫面說：「你那時候握球的姿勢，現在還是一樣。」']],
    ['plan', '吃完飯，把明年的計畫說給他們聽', { t: 2, mood: 2 }, ['媽媽聽得很認真，最後只說：「注意身體就好。」']]], O1(9));

  /* ---------- 第四十九版：二軍專屬事件、傳承、代言、敗北後的休賽季（全為虛構演出；只用信賴度／心情／體能／關係／旗標，不改比賽結果） ---------- */
  const FARM = E('level', 'eq', 'farm'), FIRST = E('level', 'eq', 'first');
  Ev('PRO_FARM_FIRST_START', 'after_game', '二軍球場的清晨', [FARM, E('year', 'lte', 3), E('gameNo', 'gte', 6)], ['二軍球場的看台上只有零星幾位家長和球迷，風把旗子吹得啪啪響。', '教練把名單貼在牆上，你的名字在上面——不華麗，卻是你自己一場一場打出來的位置。', '教練在名單旁說：「二軍沒人看，但每一球都算數。」'], [
    ['basic', '把每個打席（或每次登板）當成一軍來打', { t: 2, coach: 2 }, ['你沒有因為觀眾少就放鬆，連暖身的節奏都和一軍時一模一樣。', '二軍教練在筆記本上默默記了一筆。']],
    ['mates', '和二軍的同伴互相打氣', { team: 3, mood: 2 }, ['大家都在等同一通電話，所以反而特別懂彼此。', '練習結束，有人提議一起去吃宵夜。', '同伴們說：「一起拚啦，我們一定會上去！」']],
    ['learn', '向二軍的老教練請教基本功', { t: 1, coach: 3 }, ['他帶了很多年的球員，講話不多，每句都說在重點上。', '你把他的話抄在手機備忘錄裡。', '二軍老教練說：「基本功不會騙人啦，慢慢磨。」']]], { once_per_career: true, priority: 22 });
  Ev('PRO_FARM_CALLUP_WAIT', 'after_game', '等一通電話', [FARM, E('gameNo', 'gte', 30), E('trust', 'gte', 40)], ['比賽結束後，你習慣性地看一眼手機。', '沒有未接來電。一軍名單上哪天會有你的名字，沒有人能給你答案——但你知道，先把眼前的事做好。'], [
    ['train', '把等待的時間拿來加練', { t: 2, fit: -1 }, ['你在空無一人的打擊籠（或牛棚）又待了一小時。', '汗流下來的時候，焦慮好像也跟著流走了一點。', '同伴說：「欸，等一下我陪你練啦。」']],
    ['talk', '打電話給家人聊聊近況', { mood: 4 }, ['媽媽問你吃飽了沒，爸爸只說：「慢慢來，球不會跑掉。」', '你笑著掛上電話，心情輕了不少。']],
    ['coach', '主動問二軍教練還差什麼', { t: 1, coach: 3 }, ['他想了想，說出兩個具體要改的地方。', '不是安慰，是方向——你覺得這比安慰更有用。', '二軍教練說：「把這一項補好，我保證你離一軍更近啦。」']]], { once_per_season: true, cooldown_games: 40, priority: 21 });
  Ev('PRO_FARM_COACH_EYE', 'after_game', '二軍教練的評語', [FARM, E('trust', 'gte', 55), E('gameNo', 'gte', 20)], ['賽後，二軍教練把你叫到一旁，手裡拿著這幾週的紀錄。', '「我會把你的名字報上去，」他說，「不保證什麼，但我會講真話。」'], [
    ['thanks', '誠懇道謝，說會繼續努力', { t: 2, coach: 3, flag: 'FARM_COACH_VOUCH' }, ['他擺擺手：「謝我幹嘛，上去以後別丟二軍的臉就好。」']],
    ['ask', '請他直接說最需要補強的地方', { t: 1, coach: 2 }, ['他毫不客氣地列了三項，其中一項你自己也隱約知道。', '被說中的感覺不太舒服，卻很踏實。']],
    ['humble', '說還有很多不足，不想被特別關注', { team: 2, coach: 1 }, ['他看了你一眼，沒有多說，只是點點頭。']]], { once_per_season: true, priority: 23 });
  Ev('PRO_FARM_LONG_BUS', 'after_game', '南下的長途巴士', [FARM, E('gameNo', 'gte', 12)], ['二軍客場要坐很久的巴士，窗外的燈一盞一盞往後退。', '有人睡著了，有人戴著耳機。你把頭靠在窗邊，想起剛進球團的那一天。'], [
    ['sleep', '閉上眼睛，把體力補回來', { fit: 4, mood: 1 }, ['車子在顛簸裡搖了一路，你睡得出乎意料地沉。', '同伴拍拍你：「欸，到囉，起床啦。」']],
    ['review', '拿出筆記，回想今天的每個打席（或每次登板）', { t: 2, fit: -1 }, ['你在昏黃的車燈下寫了半頁。', '字很醜，但每一行都是之後能用上的東西。', '同伴瞄了一眼：「你的字真的有夠醜欸。」']],
    ['chat', '和鄰座的同伴聊到下車', { team: 3, mood: 3 }, ['聊到各自的家鄉、第一副手套、第一次被教練罵。', '下車時，你們都覺得路沒那麼長了。', '同伴說：「下一站，我們一起拚啦！」']]], { cooldown_games: 45, priority: 14 });
  Ev('PRO_TEAM_MOOD', 'after_game', '休息室的安靜', [FIRST, E('year', 'gte', 8), E('starter', 'eq', true), E('gameNo', 'gte', 30)], ['賽程進入悶熱的中段，休息室裡的笑聲比往常少。', '沒有人說出口，但每個人都感覺到氣氛有點沉。年輕球員在角落低頭看手機，前輩們也沒出聲。', '終於有人半開玩笑地說：「怎麼這麼安靜？是不是太熱了？」'], [
    ['speak', '站出來說幾句，把大家聚在一起', { t: 1, team: 4, coach: 1, flag: 'TEAM_RALLY' }, ['你沒有講大道理，只說：「今天先把自己的那一份做好。」', '有人點頭，有人笑了，氣氛稍微鬆開了一點。']],
    ['example', '用自己的練習量帶頭，什麼都不說', { t: 2, team: 2 }, ['隔天，你到球場的時候，已經有幾個年輕球員在加練。', '年輕球員說：「前輩，我們也想一起加練啦！」']],
    ['joke', '開個玩笑把氣氛炒熱', { mood: 3, team: 3 }, ['一個爛笑話讓整間休息室爆出笑聲。', '有時候，輕鬆也是一種戰力。', '隊友大喊：「好啦！今天誰都不能垮，大家上！」']]], { cooldown_games: 50, priority: 20 });
  Ev('PRO_NEWBIE_ASK', 'after_game', '新人的問題', [FIRST, E('year', 'gte', 11), E('apps', 'gte', 20)], ['練習結束，一位剛升上來的新人在你的儲物櫃旁站了很久，才鼓起勇氣開口。', '「前輩，你剛上來的時候，怎麼面對第一次被打爆（或三振）的感覺？」'], [
    ['honest', '坦白說出自己當年的糗事', { team: 3, mood: 3, flag: 'NEWBIE_TRUST' }, ['你講了那段最難堪的日子。', '他一邊聽一邊睜大眼睛：「原來前輩也……」你笑著說：「每個人都有。」']],
    ['method', '教他自己的賽前例行流程', { t: 2, team: 2, flag: 'NEWBIE_TRUST' }, ['你把呼吸、暖身、視覺化的順序一項項說給他聽。', '他拿出手機認真記錄。', '新人說：「前輩，我會努力練到跟你一樣！」']],
    ['busy', '說今天要先處理自己的狀態，改天再聊', { t: 1 }, ['他有些失望，卻還是鞠躬道謝。', '你心裡記下了：改天一定要補上。', '新人說：「沒關係啦，我等你！」']]], { once_per_career: true, priority: 19 });
  Ev('PRO_SPONSOR', 'pro_start', '一紙代言邀約', [FIRST, E('year', 'gte', 6), E('event_flags.FAN_FAVORITE', 'eq', true)], ['開季前，經紀人帶來一份代言邀約。', '對方希望你出現在平面廣告和一支短片裡，酬勞不錯，但拍攝日期會壓到休息日。', '經紀人補了一句：「錢不是重點，重點是你自己想不想拍。」'], [
    ['accept', '接下，並請對方配合訓練時程', { mood: 3, agent: 2, flag: 'SPONSOR_SIGNED' }, ['你談了拍攝時段，對方很爽快地答應調整。', '拍完那天，你累得倒在沙發上，但看到成品時還是笑了。', '攝影師比了個讚：「OK啦！這條很讚！」']],
    ['trim', '只接一部分，保留大部分休息日', { fit: 2, mood: 1, agent: 1 }, ['你把底線說得很清楚，經紀人說：「這樣更好談。」']],
    ['decline', '婉拒，把心思全放在球季', { t: 2, agent: -1 }, ['你知道機會不會每次都來，但這一年，你只想專心打球。']]], { once_per_career: true, priority: 14 });
  Ev('PRO_RAINY_DAY', 'after_game', '雨中的室內練習', [E('gameNo', 'gte', 25)], ['連著幾天的雨讓球場成了一片水窪，只剩室內練習場可以用。', '練習場的空間很擠，球員們輪流排隊，聊天聲和擊球聲混在一起。', '打擊教練在籠邊喊：「下一個！動作小一點，空間不夠！」'], [
    ['detail', '趁機把一個小動作重複練到順', { t: 1, fit: 1 }, ['沒有觀眾，沒有比分，只有你和那個動作。', '練到最後，它終於變成了「自己的」。']],
    ['mates', '和隊友玩點小遊戲放鬆', { team: 3, mood: 3 }, ['輸的人要請喝飲料，結果最後所有人都被拗了一杯。', '隊友笑著說：「輸的人請喝飲料喔，下一場我們再贏回來！」']],
    ['rest', '回休息室睡一覺', { fit: 3 }, ['雨聲很適合睡午覺。醒來時，天空已經透出一點藍。', '隊友探頭喊：「欸，醒了喔？雨停啦，走啦！」']]], { cooldown_games: 60, priority: 12 });
  Ev('PRO_OLD_BODY', 'after_game', '身體的時間', [FIRST, E('year', 'gte', 12), E('econ.fit', 'lte', 70)], ['早上熱身時，你發現同樣的動作，身體需要比以前更久才能「開機」。', '防護員沒說什麼，只是把你的恢復清單又加了兩項。'], [
    ['adapt', '調整練習結構，把量換成質', { fit: 3, medical: 2, t: 1 }, ['你和防護員重新排了一週的課表，少了蠻力，多了精準。', '防護員說：「把量換成質啦，你還可以打很多年。」']],
    ['deny', '不理它，照原本的方式練', { t: 1, fit: -3 }, ['你不想承認時間的事。身體卻誠實地把帳記下來了。', '防護員說：「欸，這樣硬撐不太好喔。」']],
    ['accept', '坦然接受，把經驗當武器', { mood: 2, medical: 1, coach: 1 }, ['你想起前輩說過的話：老將不是變慢，是更懂得怎麼省力。']]], { cooldown_games: 40, priority: 24 });
  Ev('PRO_COACH_OFFER', 'offseason', '教練室的邀請', [E('year', 'gte', 13), E('career.years', 'gte', 12)], ['休賽季，總教練約你在辦公室見面。', '「我想問你一件事，」他說，「如果有一天不穿球衣了，你有想過要不要留在這個球團？」'], [
    ['think', '說還沒想好，但很感謝他問', { coach: 2, mood: 1, flag: 'COACH_PATH_OPEN' }, ['他笑著說：「不急，我只是希望你知道，有這個選項。」']],
    ['yes', '坦白說對教練工作很有興趣', { coach: 3, t: 1, flag: 'COACH_PATH_OPEN' }, ['他點點頭，翻出一份簡單的培訓計畫。', '「球季後我們再談細節。」']],
    ['play', '說只想先把球打到最後一刻', { t: 2, coach: 1 }, ['他沒有勉強：「那就把這件事留到那天。」']]], { once_per_career: true, priority: 17 });
  Ev('PRO_WINTER_AFTER_FINAL', 'offseason', '輸掉之後的冬天', [E('seen.PRO_PO_LOST_FINAL.season', 'eq', 1)], ['休賽季，你把那場最後的比賽反覆看了很多遍。', '你以為自己已經放下，結果在某個安靜的夜晚，那個畫面還是跳了出來。'], [
    ['train', '把這股不甘心化成冬訓的動力', { t: 2, fit: -1, flag: 'WINTER_DRIVE' }, ['你比任何人都早到球場，鞋底磨出的聲音在空曠的場館裡迴盪。', '隊友說：「不甘心就燒起來啦，明年換我們笑！」']],
    ['mates', '約隊友一起聊聊，把心裡話倒出來', { team: 3, mood: 3 }, ['原來每個人心裡，都還有那個沒能回頭的瞬間。', '聊完，大家的肩膀都輕了一點。', '隊友握拳說：「說出來就好了啦，明年一起把它打回來。」']],
    ['away', '暫時離開球場，出去走走', { mood: 4, fit: 2 }, ['你去了一個沒人認得你的小鎮，看了一場業餘球賽。', '孩子們的歡呼聲，讓你想起打球最單純的快樂。', '孩子們喊著：「再玩一次！再來一次啦！」']]], { once_per_season: true, priority: 26 });

  /* ---------- 第五十一版：旗標回收（呼應玩家以前的選擇；全為虛構演出，只有旗標存在才會出現，不改比賽結果） ---------- */
  Ev('PRO_PAYOFF_VOUCH', 'after_game', '二軍教練的訊息', [FIRST, E('year', 'lte', 4), E('apps', 'gte', 1), E('lastGame.played', 'eq', true), E('event_flags.FARM_COACH_VOUCH', 'eq', true)], ['賽後，手機亮了一下。是二軍教練傳來的簡短訊息：「今天的比賽，我在電視上看了。」', '沒有多餘的字。你知道，當初他說要為你講真話，這句話他一直記得。'], [
    ['reply', '回訊息道謝，說會繼續努力', { t: 2, coach: 2 }, ['你打了很長一段，又刪掉，最後只留下簡單幾個字。', '他回了一個大拇指。']],
    ['visit', '休賽季時回二軍球場看看他', { mood: 3, coach: 3, flag: 'FARM_COACH_VISIT' }, ['你規劃了回去的行程，心裡先暖了起來。']],
    ['pledge', '告訴自己：不能讓這句話落空', { t: 3 }, ['你把訊息截圖，設成手機的鎖定畫面。']]], { once_per_career: true, priority: 26 });
  Ev('PRO_PAYOFF_SPONSOR', 'pro_start', '那支廣告之後', [FIRST, E('year', 'gte', 8), E('event_flags.SPONSOR_SIGNED', 'eq', true)], ['開季前，經紀人告訴你，之前那支廣告的合作方想談續約。', '你走在街上，偶爾會有人認出你，說在電視上看過。這份關注，比你想像的更長久。', '經紀人在電話那頭說：「對方問，你還有沒有興趣再合作一次？」'], [
    ['renew', '續約，但把拍攝時間限制在休賽季', { mood: 3, agent: 2 }, ['你和對方把時程寫得一清二楚。', '經紀人笑著說：「你現在比我還會談。」']],
    ['charity', '請對方把一部分酬勞用在少棒基層', { mood: 4, team: 1, flags: { SPONSOR_GIVE_BACK: true, LEGACY_GIVEN: true } }, ['對方想了想，點頭答應。', '你想起那個捧著舊球的小朋友。', '對方說：「沒問題啦，這個我們一起來。」']],
    ['stop', '不續了，專心打球', { t: 2, agent: -1 }, ['經紀人沒有勉強，只說：「你想清楚就好。」']]], { once_per_career: true, priority: 13 });
  Ev('PRO_PAYOFF_COACH_PATH', 'pro_start', '教練培訓的第一堂課', [FIRST, E('year', 'gte', 14), E('event_flags.COACH_PATH_OPEN', 'eq', true)], ['開季前，球團寄來教練培訓課程的時間表，總教練在旁邊親筆寫了一句：「有空就來看看。」', '你第一次用「教的人」的角度，重新看這座練習場。'], [
    ['attend', '抽空參加第一堂課', { coach: 3, t: 1, flags: { COACH_COURSE_TAKEN: true, LEGACY_GIVEN: true } }, ['講師說：「球員的直覺要拆成語言，才能傳下去。」', '你在筆記本寫下：拆解、示範、等待。']],
    ['observe', '先在場邊看教練團怎麼帶新人', { coach: 2, team: 2 }, ['你發現教練說的每句話，都經過反覆斟酌。']],
    ['later', '收起時間表，等球季結束再說', { t: 2 }, ['你把它夾進行事曆，提醒自己別忘了。']]], { once_per_career: true, priority: 16 });
  Ev('PRO_PAYOFF_NEWBIE', 'after_game', '後輩的道謝', [FIRST, E('year', 'gte', 13), E('event_flags.NEWBIE_TRUST', 'eq', true), E('gameNo', 'gte', 40)], ['賽前練習，那位曾向你請教的後輩走過來，遞給你一罐飲料。', '「前輩，你說的那個賽前流程，我一直在用。」他有點不好意思，「謝謝你當時願意講。」'], [
    ['smile', '笑著說：「用得上就好。」', { mood: 3, team: 3 }, ['他深深一鞠躬，又跑回隊伍裡。', '新人大聲說：「前輩，我一定會努力！」']],
    ['next', '告訴他：下一步換你去教別人', { team: 2, t: 1, flags: { PASS_IT_ON: true, LEGACY_GIVEN: true } }, ['他愣了一下，隨即用力點頭。', '你知道，這件事會一直傳下去。', '後輩說：「我會把這份心意傳下去啦！」']],
    ['tease', '開玩笑說：飲料我收下，下次換你請客', { mood: 2, team: 2 }, ['他笑著答應，約好下次要請一頓宵夜。', '後輩笑著說：「沒問題啦，宵夜我請，下一場我先打爆他們！」']]], { once_per_career: true, priority: 17 });
  Ev('PRO_PAYOFF_WINTER', 'pro_start', '冬訓之後的第一場練習', [E('year', 'gte', 2), E('event_flags.WINTER_DRIVE', 'eq', true)], ['新球季的第一天，你站進球場，發現身體比去年輕盈許多。', '那個冬天，你把不甘心練成了習慣。這種變化不一定看得見，但你自己清楚。'], [
    ['calm', '深呼吸，把心態放回「一場一場來」', { t: 2, mood: 2 }, ['你不想讓過去壓過今天。', '隊友說：「一場一場來啦，穩穩的。」']],
    ['share', '把冬訓的方法分享給隊友', { team: 3, coach: 1 }, ['幾個隊友開始跟著你一起加練，場邊多了熱鬧的聲音。', '隊友大聲說：「帶我們一起練啦！今年一起衝到最後！」']],
    ['quiet', '什麼都不說，繼續用練習回答', { t: 3 }, ['你很安靜地開始暖身。']]], { once_per_career: true, priority: 16 });

  /* ---------- 第五十二版：孤兒旗標回收＋最後球季的回聲（旗標全部來自玩家先前的選擇；虛構演出，不宣稱戰績） ---------- */
  Ev('PRO_FARM_REVISIT', 'pro_start', '回到二軍球場', [E('year', 'gte', 2), E('event_flags.FARM_COACH_VISIT', 'eq', true)], ['休賽季結束後，你繞道去了一趟二軍球場。', '看台依舊空蕩，旗子依舊啪啪作響。那位教練正拿著耙子整理內野的土，看見你，愣了一下，然後笑了。', '他拿著耙子擺了擺：「還記得路啊？進來坐坐。」'], [
    ['help', '捲起袖子，跟他一起整理場地', { mood: 4, coach: 3 }, ['兩個人沒說什麼話，只是一耙一耙把土整平。', '他說：「這塊場，比任何獎盃都乾淨。」']],
    ['gift', '送他一副用順手的手套', { coach: 3, mood: 2 }, ['他把手套試戴了好久，嘴上說「太貴重了」，手卻沒鬆開。']],
    ['kids', '請他介紹今年的新人給你認識', { team: 2, coach: 2, flag: 'MET_FARM_ROOKIES' }, ['幾個年輕人緊張地站成一排。', '你想起自己也曾站在同一個位置。', '二軍教練笑著說：「這群小子很有衝勁欸，你看，眼睛都在發亮。」']]], { once_per_career: true, priority: 20 });
  Ev('PRO_PASS_ON_ECHO', 'after_game', '傳下去的東西', [FIRST, E('year', 'gte', 14), E('event_flags.PASS_IT_ON', 'eq', true), E('gameNo', 'gte', 40)], ['賽前，你看見那位後輩正在場邊，用你教過的方法，跟另一位剛上來的新人說話。', '他手勢比得很認真，語氣有點生澀，卻很誠懇。', '你聽見他對新人說：「這是前輩教我的，先別急著出手。」'], [
    ['watch', '站遠一點，默默看完', { mood: 4, team: 2 }, ['你沒有走過去打擾，只是靠在欄杆上笑。']],
    ['join', '走過去補一句', { team: 3, t: 1 }, ['你說了一句很簡單的話。三個人都笑了。', '隊友說：「說得好啦，大家一起加油！」']],
    ['nod', '遠遠對他點個頭', { mood: 2, team: 2 }, ['他看到了，挺直了背。', '後輩在遠處大喊：「前輩，我會努力跟上的啦！」']]], { once_per_career: true, priority: 17 });
  Ev('PRO_LEGACY_ECHO', 'pro_start', '你留下來的東西', [E('year', 'gte', 14), E('event_flags.LEGACY_GIVEN', 'eq', true)], ['球季開始前，你在更衣室整理櫃子，翻出一疊這些年留下的東西：筆記、舊護具、訊息截圖。', '你才發現，這些年你做過的很多小事，並不是只為了自己。', '一張舊訊息截圖上寫著：「謝謝前輩，我會記得。」'], [
    ['keep', '把筆記留在櫃子裡，給之後的人看', { team: 3, mood: 3, flag: 'LEFT_NOTES' }, ['你在第一頁寫下一行字，又把它擦掉，換成了更簡單的一句。']],
    ['sort', '一樣一樣整理，決定哪些要帶走', { mood: 3, t: 1 }, ['每一樣東西，都連著一段不太一樣的日子。']],
    ['smile', '笑一笑，把櫃子關上，去練習', { t: 2 }, ['你把重量放在心裡，把腳步放在球場。']]], { once_per_career: true, priority: 16 });

  /* ---------- 第五十三版：最後 4 個孤兒旗標回收（旗標全部來自玩家先前的選擇；虛構演出，不宣稱戰績，不改比賽結果） ---------- */
  Ev('PRO_GIVE_BACK_CLINIC', 'offseason', '少棒教室的邀請', [E('year', 'gte', 9), E('event_flags.SPONSOR_GIVE_BACK', 'eq', true)], ['休賽季，一封信寄到球團：少棒隊的教練說，你當年捐出的那筆經費，買了新的球和護具。', '他們問你，願不願意在週末來看看孩子們練球。', '信的最後一行寫著：「孩子們都在等你，來看看他們就好。」'], [
    ['go', '答應，週末帶著手套去', { mood: 4, team: 1, flag: 'CLINIC_VISITED' }, ['孩子們排成一排，眼睛亮得像剛打磨過的球。', '你示範了一個最基本的接球姿勢，他們一個一個認真學。', '孩子們喊著：「再示範一次啦！我也想學！」']],
    ['sign', '只留下簽名球，請教練轉交', { mood: 2 }, ['你在每顆球上寫了不同的一句話。', '寫到最後，手有點酸，心裡卻很滿。', '教練笑著說：「小朋友拿到球，開心到不行啦。」']],
    ['later', '說明年一定去，先專心球季', { t: 2 }, ['你把那封信放進抽屜最上面一層。', '教練說：「沒關係啦，明年一定要來喔。」']]], { once_per_career: true, priority: 18 });
  Ev('PRO_COURSE_PRACTICE', 'after_game', '第一次當「教的人」', [FIRST, E('year', 'gte', 14), E('event_flags.COACH_COURSE_TAKEN', 'eq', true), E('gameNo', 'gte', 30)], ['賽前練習，守備教練突然把一位新人交給你：「今天你帶他十分鐘。」', '你想起培訓課上那三個字：拆解、示範、等待。'], [
    ['break', '把動作拆成三步，慢慢講', { coach: 2, team: 2, t: 1 }, ['你放慢速度，每一步都讓他自己做一次。', '十分鐘到了，他的腳步明顯穩了一點。', '孩子說：「我懂了啦，我再試一次！」']],
    ['show', '先示範一次，再讓他模仿', { coach: 2, mood: 2 }, ['他看得很專心，第二次就有模有樣。', '你忽然懂了教練們臉上的那種表情。', '孩子大喊：「再來一次！這次我一定接得到！」']],
    ['wait', '什麼都不說，先看他自己怎麼做', { team: 1, coach: 1, t: 1 }, ['你忍住想開口的衝動。', '他自己發現問題的時候，眼睛亮了。', '孩子大喊：「欸！我知道哪裡怪怪的了！」']]], { once_per_career: true, priority: 17 });
  Ev('PRO_NOTES_FOUND', 'after_game', '櫃子裡的筆記', [FIRST, E('year', 'gte', 15), E('event_flags.LEFT_NOTES', 'eq', true), E('gameNo', 'gte', 50)], ['練習後，一位年輕選手拿著一本舊筆記本，在更衣室門口猶豫了很久。', '「前輩，櫃子裡這本……是你留下的嗎？我一直照著第一頁那句話做。」'], [
    ['yes', '點頭承認，說那是寫給後面的人的', { mood: 4, team: 3 }, ['他把筆記本抱在胸前，用力鞠躬。', '你忽然覺得，這幾年的每一天都被好好接住了。', '後輩說：「前輩，謝謝你寫的這些啦。」']],
    ['smile', '笑著說：「寫得不好，別笑我。」', { mood: 3, team: 2 }, ['他連忙搖頭：「沒有，是我最近最有用的東西。」']],
    ['add', '請他在最後一頁，寫下他自己的那句', { team: 3, t: 1 }, ['他認真想了很久，才把筆尖落下。', '你沒有看他寫了什麼，只說：「留給下一個人。」']]], { once_per_career: true, priority: 16 });
  Ev('PRO_ROOKIES_RISE', 'after_game', '那天站成一排的新人', [FIRST, E('year', 'gte', 3), E('event_flags.MET_FARM_ROOKIES', 'eq', true), E('seen.PRO_FARM_REVISIT.season', 'eq', 0), E('gameNo', 'gte', 30)], ['賽前，一位剛升上一軍的年輕人朝你小跑過來。', '「前輩，二軍球場那天，你還記得我嗎？我就是站在最右邊、緊張得講不出話的那個。」'], [
    ['remember', '笑說記得，還記得他的手心都是汗', { mood: 3, team: 3 }, ['他害羞地撓撓頭，說原來前輩真的記得。', '新人說：「前輩，我一定不會讓你失望啦！」']],
    ['advice', '給他一個一軍的小提醒', { team: 2, coach: 1, t: 1 }, ['你說了一件你剛上來時最想有人告訴你的事。', '他一邊聽，一邊用力點頭。', '新人說：「謝謝前輩啦，我會打給你看！」']],
    ['cheer', '拍拍他的肩：「好好享受這一天。」', { mood: 3, team: 2 }, ['他吸了一口氣，挺直了背走回隊伍。', '新人說：「我會好好打完這一天啦！」']]], { once_per_career: true, priority: 15 });

  /* ---------- 第五十四版：回收 CLINIC_VISITED／LEGACY_GIVEN（旗標來自玩家先前的選擇；虛構演出，不宣稱戰績，不改比賽結果；不動退役事件） ---------- */
  Ev('PRO_CLINIC_LETTER', 'after_game', '孩子們的來信', [FIRST, E('year', 'gte', 10), E('event_flags.CLINIC_VISITED', 'eq', true), E('seen.PRO_GIVE_BACK_CLINIC.season', 'eq', 0), E('gameNo', 'gte', 40)], ['賽後，球團公關轉交給你一疊用蠟筆和原子筆寫的信，是少棒隊的孩子們寄來的。', '字歪歪扭扭，有人畫了你的背號，有人只寫了一句：「我今天接到球了。」'], [
    ['read', '回到休息室，一封一封讀完', { mood: 5, team: 1 }, ['你讀到有人把你示範的姿勢畫成了小人。', '讀完時，眼眶有點熱，你假裝在擦汗。']],
    ['reply', '挑幾封，親筆回信', { mood: 3, team: 2, t: 1 }, ['你寫得很慢，怕孩子看不懂，改了好幾次用字。', '孩子回了信：「我會一直練下去，總有一天我也要站上去！」']],
    ['wall', '把其中一封貼在儲物櫃內側', { mood: 3, t: 2 }, ['每天開櫃子，都會看到那句話。']]], { once_per_career: true, priority: 15 });
  Ev('PRO_LAST_SEASON_EVE', 'after_game', '最後一季的傍晚', [FIRST, E('year', 'gte', 15), E('event_flags.LEGACY_GIVEN', 'eq', true), E('gameNo', 'gte', 80)], ['賽後的球場很安靜，你一個人在外野草皮上坐了一會兒。', '你想起這些年遇到的人：教過你的、你教過的、還有沒說出口的謝謝。'], [
    ['thank', '把想謝的人，一個一個傳訊息說出口', { mood: 4, team: 3 }, ['有人秒回，有人隔天才回，每一則都讓你笑了一下。']],
    ['walk', '沿著外野警戒區慢慢走完一圈', { mood: 3, t: 2 }, ['草的氣味和這些年一樣。你走得很慢，像在記住它。']],
    ['stay', '什麼都不做，只是坐到燈熄掉', { mood: 4 }, ['燈一排一排暗下來，你沒有急著起身。']]], { once_per_career: true, priority: 14 });

  /* ---------- 第五十八版：首次被召回一軍（旗標 WAS_RECALLED 由 13e 在二軍→一軍時寫入；虛構演出，不宣稱戰績，不改比賽結果） ---------- */
  Ev('PRO_FIRST_RECALL', 'after_game', '回到一軍的那天', [FIRST, E('event_flags.WAS_RECALLED', 'eq', true), E('gameNo', 'gte', 3)], ['賽前，你站在一軍休息室的門口，一時間不確定該把背包放進哪個櫃子。', '球鞋上還沾著二軍球場的泥土，你低頭看了一眼，沒有急著拍掉。', '一位資深隊友從旁邊經過，順手把一個櫃子指給你：「這個空著，放這裡。」'], [
    ['thank', '傳訊息給帶過你的二軍教練，說聲謝謝', { coach: 2, mood: 3 }, ['他很快回了一句：「好好打，別回頭。」', '你把手機收進背包，忽然覺得背包輕了一點。']],
    ['work', '告訴自己這次要待久一點，賽前多加練', { t: 2, mood: 2 }, ['你提早半小時進打擊籠，一球一球打得很認真。', '教練說：「這次啦，把位置好好抓牢。」']],
    ['smile', '對隊友笑一笑，把背包放進空著的那個櫃子', { team: 2, mood: 2 }, ['有人拍了拍你的背，說：「歡迎回來。」']]], { once_per_career: true, priority: 16 });

  const api = { register, all, newState, importState, exportState, available, next, choose };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CSTORY;
