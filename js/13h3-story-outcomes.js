'use strict';
/* 13h3-story-outcomes.js ｜ v1.1.74 劇情選項「選了才知道」：結果由當下狀態＋運氣決定，不再固定、也不再事先顯示
   載入順序：13h2 之後、13i 之前。只靠 CSTORY.setResolver() 掛進引擎（13h 的 choose() 會呼叫），13h 沒載入就整段略過。
   怎麼運作（對應 329 個既有選項，不用逐一改寫）：
     ① classify：依選項文字＋原本的效果，分成 6 種性質 —— grind 苦練硬撐／rest 休養／social 人際互動／media 公開曝光／mind 自我沉澱／joy 沉浸回味
     ② 每個選項選下去會擲出三種結果之一：
          順利（good）：原本的效果照給，另外多一點小加成（能力 +1、關係 +3、人氣 +、體能／心情回升…）
          普通（ok）　：原本的效果
          失手（bad）：原本的好處大幅縮水（只剩 25%），原本的代價照付，再依性質掉一個後果——
                       苦練 → 受傷／體能見底／能力小退步；休養 → 手感生疏／被教練覺得鬆懈；人際 → 對方關係下降／話被傳開；
                       公開 → 人氣下降／經紀人關係下降；自我 → 心情下降／想太多讓能力退一點；沉浸 → 信賴度與體能下降
     ③ 機率看「現在的你」：體能低還硬撐更容易受傷、心情低更容易搞砸、關係好的人更容易聊開、人氣高公開場合更容易加分、
        體能很低時休養特別對、連續失手後會稍微轉運（不會一路衰到底）。
     ④ 選項下面不再顯示 hint；結果畫面才列出實際變化（含失手時的專屬劇情格）。
   不動：事件 id／條件／旗標（旗標一律保留，後續劇情照常）；退役相關事件（PRO_RETIRE*）維持固定結果。
   純邏輯，可在 Node 單獨測：node tests/test-story-outcomes.js */
(function () {
  if (typeof CSTORY === 'undefined' || !CSTORY.setResolver) return;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const sg = n => (n > 0 ? '+' : '') + n;

  /* ---------- ① 分類 ---------- */
  const MEDIA_EV = /^(PRO_Y4_SPOTLIGHT|PRO_Y7_PRESSURE|PRO_ALLSTAR_PICKED|PRO_FAN_LETTER|PRO_AGENT_|PRO_AWARD_|PRO_MONEY_WISE|PRO_SPONSOR|PRO_PAYOFF_SPONSOR|PRO_KID_FAN|PRO_GIVE_BACK_CLINIC|PRO_FIRST_HR|PRO_HR_100)/;
  const RX = {
    media: /球迷|看台|麥克風|簽下|簽一顆|簽名|遊行|告別賽|代言|合約|捐|獎座|上台|脫帽|揮手|媒體|採訪|廣告|公益|少棒|案子|歡呼|簽到/,
    grind: /加練|苦練|練到|重練|早到|最晚|咬牙|硬撐|撐過去|衝|全力|不留|拚|熬夜|補強練習|當最後一場|繼續投|守住打擊籠|拆開|不服輸|汗水|盡快回場|繼續強化|更早到|不跳|照目前的節奏/,
    rest: /休息|放鬆|睡|養傷|養到|冰敷|喘口氣|放空|不碰球棒|減少練習|恢復|復健|保養|防護員|柔軟度|先放下|什麼都不投|要求減少|長期計畫/,
    social: /聊|談|請教|問|說出|坦白|聽|道謝|謝|擁抱|打電話|一起|吃飯|陪|分享|分擔|拍拍|請他|交給|鞠躬|帶新人|教給|傳下去|帶頭|開玩笑|笑著|照顧|致意|回信|邀|說話|站出來|反問|提議|送給|扛起|接下|整理給|請大家|指點|點頭答應|切磋/,
    joy: /享受|慶祝|珍惜|記在心裡|收進心裡|收好|擦乾淨|紀念|夕陽|看看|多待|多站|放進|感受|記下來|寫給|筆記本|收起/
  };
  const sumOf = (c, type, tg) => (c.effects || []).filter(x => x.type === type && (tg == null || x.target === tg)).reduce((a, x) => a + (+x.value || 0), 0);
  function classify(ev, c) {
    const L = (c && c.label) || '', id = (ev && ev.id) || '';
    if (/^PRO_RETIRE/.test(id)) return null;      // 退役決定：固定結果
    if (RX.media.test(L) && (MEDIA_EV.test(id) || !/家人|隊友|對手/.test(L))) return 'media';
    if (RX.grind.test(L) || sumOf(c, 'stat_delta', 'fit') <= -3) return 'grind';
    if (RX.rest.test(L) || sumOf(c, 'stat_delta', 'fit') >= 6) return 'rest';
    if (RX.social.test(L)) return 'social';
    if (RX.joy.test(L)) return 'joy';
    const rel = (c.effects || []).filter(x => x.type === 'relationship_delta').reduce((a, x) => a + Math.max(0, x.value), 0);
    if (rel >= 6) return 'social';
    if (sumOf(c, 'stat_delta', 'mood') >= 6) return 'joy';
    return 'mind';
  }
  const isMediaEv = ev => MEDIA_EV.test((ev && ev.id) || '');

  /* ---------- 風險輪廓 ---------- */
  function profile(c) {      // 'safe' 穩穩的／'mid' 一般／'gamble' 高報酬高風險（有代價、或有持續加成）
    const neg = (c.effects || []).reduce((a, x) => a + (x.type !== 'flag_set' && +x.value < 0 && x.type !== 'momentum' ? -x.value : 0), 0);
    const gain = (c.effects || []).reduce((a, x) => a + (x.type === 'stat_delta' && x.target === 'trust' && x.value > 0 ? x.value : 0) + (x.type === 'momentum' && x.value > 0 ? x.value * 2 : 0), 0);
    if (neg >= 3 || gain >= 7) return 'gamble';
    if (neg === 0 && gain <= 3) return 'safe';
    return 'mid';
  }
  const BASE = { safe: [.10, .22], mid: [.20, .28], gamble: [.32, .33] };      // [失手, 順利]

  /* ---------- ③ 依當下狀態調整機率 ---------- */
  function relTarget(c) {      // 這個選項主要是跟誰互動（原本效果裡加最多的那個關係）；沒有就當隊友
    let best = null, bv = 0; (c.effects || []).forEach(x => { if (x.type === 'relationship_delta' && x.value > bv) { best = x.target; bv = x.value; } }); return best || 'team';
  }
  function odds(kind, prof, c, S, rel, mediaEv) {      // S：{fit, mood, trust, pop}；回傳 { bad, good }（0～1）
    let [bad, good] = BASE[prof] || BASE.mid; const { fit, mood, trust, pop } = S;
    if (mood < 30) bad += .06; if (trust >= 70) good += .03;
    if (kind === 'grind') { if (fit < 60) bad += .10; if (fit < 45) bad += .12; if (fit >= 85) bad -= .08; if (fit >= 80 && mood >= 60) good += .06; }
    else if (kind === 'rest') { if (fit < 50) { bad -= .08; good += .15; } else if (fit >= 90 && mood >= 70) bad += .12; }
    else if (kind === 'joy') { if (mood < 40) good += .12; else if (mood >= 85) bad += .10; }
    else if (kind === 'mind') { if (mood < 35) bad += .12; else if (mood >= 70) good += .05; }
    else if (kind === 'social') { const r = rel[relTarget(c)] || 0; if (r >= 25) { good += .12; bad -= .06; } else if (r <= -5) bad += .10; if (mood < 35) bad += .06; }
    else if (kind === 'media') { if (pop >= 60) good += .10; else if (pop < 20) bad += .05; if (trust < 30) bad += .08; }
    return { bad: cl(bad, .04, .6), good: cl(good, .08, .5) };
  }

  /* ---------- 文字 ---------- */
  const SPK = { coach: '教練', veteran: '前輩', team: '隊友', medical: '防護員', rival: '隊友', agent: '經紀人' };
  const AB = { con: '打擊準度', pow: '長打力', eye: '選球眼', spd: '速度', fld: '守備', arm: '傳球', vel: '球速', stf: '球威', ctl: '控球', sta: '投球體力', dur: '耐久', body: '體能上限' };
  const KEYS = { B: ['con', 'pow', 'eye', 'spd', 'fld', 'arm'], P: ['vel', 'stf', 'ctl', 'sta'], TWP: ['con', 'pow', 'eye', 'vel', 'stf', 'ctl'] };
  const WHY = { P: [['手肘不適', '手肘突然傳來一陣刺痛'], ['肩膀緊繃', '肩膀突然一緊'], ['手指起水泡', '手指的水泡整個裂開'], ['背部痠痛', '背後一陣痠痛竄上來']], B: [['大腿後肌拉傷', '大腿後側突然一緊'], ['手腕扭傷', '手腕猛地一扭'], ['腰部痠痛', '腰部一陣痠痛'], ['腳踝扭傷', '腳踝踩歪了']] };
  const T = {
    good: {
      grind: [['cage', 'low+warm', '練到最後一組，你突然覺得身體的每個環節都接上了。', '{who}在旁邊看著，難得多說了一句：「剛剛那一下，記住那個感覺。」'], ['gym', 'close+warm', '汗水滴進眼睛，你卻笑了：那個卡了好幾天的動作，終於自己順了。'], ['medroom', 'wide', '防護員路過，順手檢查你的狀態，點點頭說：「這種強度，你的身體吃得下。」']],
      rest: [['sunrise', 'wide+warm', '睡醒的時候，身體輕得像換了一副。', '你這才想起，原來這才是自己該有的狀態。'], ['medroom', 'close+warm', '防護員檢查完，笑著說：「恢復得比預期還快，繼續保持。」']],
      social: [['clubtalk', 'wide+warm', '對方沉默了一下，說出口的話比你預期的更坦白。', '你們之間的某一道牆，悄悄矮了一截。'], ['club', 'L+warm', '{who}說：「說真的，今天這樣談，我很高興。」', '你們聊到比原本預定的還久，誰也沒急著離開。']],
      media: [['phonemsg', 'close', '現場有人把這一幕拍了下來，傳到網路上，留言一面倒地是善意。', '你的手機整晚震個不停。'], ['crowdroar', 'wide+warm', '球迷的歡呼比你想的還久，有人甚至特地把標語改成你的名字。']],
      mind: [['notebook', 'close+warm', '腦袋裡那團亂線，忽然被你自己理出了頭緒。', '你把它寫在筆記本最後一行，然後安心地闔上。']],
      joy: [['dusk', 'wide+warm', '那份心情像熱湯一樣慢慢暖開，你發現自己好久沒這麼放鬆過了。', '明天的練習，大概會輕一點。']]
    },
    bad: {
      injury: [['medroom', 'close+cold', '練到後半，{why}，你本能地停下動作。', '防護員跑過來說：「別硬撐，先停，讓我看一下。」', '檢查結果不太樂觀。你知道，這一次是自己逼得太緊了。']],
      exhaust: [['tired', 'wide+dim', '練到最後，視線開始發白，雙腿像灌了鉛。', '{who}遠遠看著，只說：「今天到這裡，回去睡覺。」', '你明白，有些力氣不是靠意志力就能憑空變出來的。']],
      slump: [['slump', 'low+cold', '你越練越用力，動作卻越來越僵。', '隔天再看影片，才發現自己把{ab}練走樣了。']],
      idleAb: [['empty', 'wide+dim', '休息本來是好事，但這一天你什麼都沒碰，連球也沒摸。', '隔天回到場上，{ab}多少有些生疏。']],
      idleCoach: [['coachroom', 'L+dim', '教練路過，瞄了你一眼，什麼也沒說。', '那個眼神你看得懂：他覺得你太鬆了。']],
      awkward: [['locker', 'close+cold', '你話才說到一半，就知道時機不對。', '{who}說：「嗯，我知道了。」語氣客氣得有點遠。', '那份客氣，比責備更讓人難受。']],
      leak: [['club', 'R+dim', '這段談話不知怎麼傳到了別人耳裡，版本還被改得有點走樣。', '隔天更衣室的氣氛，微妙得讓你不太自在。']],
      twist: [['press', 'close+cold', '有人把你的話截成短短一段，丟上了網路。', '留言兩極，有人說你太高調，也有人說你在作秀。']],
      flop: [['camflash', 'wide+dim', '原本想做得體面，現場卻出了點小亂子，場面有點尷尬。', '經紀人在電話那頭嘆了口氣：「這張照片，我們得想辦法壓一壓。」']],
      overthink: [['rainwindow', 'wide+cold', '你越想越深，最後連簡單的事都卡住了。', '窗外下起了雨，你盯著天花板發了很久的呆。']],
      tight: [['notebook', 'low+cold', '你把自己逼進了一個死角，連動作都開始變形。', '隔天練習，{ab}怎麼抓都抓不回原本的感覺。']],
      slack: [['night', 'wide+dim', '那股心情捨不得放，你熬到很晚才睡。', '隔天練習，腦袋有一半還留在昨天，連教練都看出來了。']]
    }
  };
  const fill = (lines, m) => lines.map(l => String(l).replace(/\{(\w+)\}/g, (_, k) => (m[k] != null ? m[k] : '')));
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const beatOf = (a, m) => ({ scene: a[0], shot: a[1], lines: fill(a.slice(2), m) });

  /* ---------- ② 結果解析（掛進 CSTORY.choose） ---------- */
  function state(adapter) {
    const g = k => { try { const t = adapter && adapter.targets && adapter.targets[k]; const v = t && typeof t.get === 'function' ? +t.get() : NaN; return isFinite(v) ? v : null; } catch (e) { return null; } };
    const inf = adapter && typeof adapter.info === 'function' ? (adapter.info() || {}) : {};
    const n = (k, d) => (isFinite(+inf[k]) && inf[k] != null ? +inf[k] : (g(k) != null ? g(k) : d));
    return { fit: n('fit', 70), mood: n('mood', 60), trust: n('trust', 40), pop: n('pop', 30), pos: inf.pos === 'P' || inf.pos === 'TWP' ? inf.pos : 'B', hurt: !!inf.hurt, known: g('fit') != null };
  }
  const scaleBad = ef => {      // 失手：好處剩 25%、代價照付、正向持續效果取消、旗標保留
    if (!ef) return null;
    if (ef.type === 'flag_set') return ef;
    if (ef.type === 'momentum') return ef.value < 0 ? ef : null;
    const v = +ef.value || 0; if (v <= 0) return ef; const nv = Math.floor(v * .25); return nv ? Object.assign({}, ef, { value: nv }) : null;
  };
  const add = (list, type, target, value, extra) => { if (value) list.push(Object.assign({ type, target, value }, extra || {})); };

  function merge(list) {      // 同一個數值的多筆變動合併成一筆（結果畫面才不會同一項出現兩次）
    const out = [], idx = {};
    list.forEach(x => {
      if (!x) return;
      if (x.type === 'stat_delta' || x.type === 'relationship_delta' || x.type === 'abil_delta') { const k = x.type + ':' + (x.target || x.key); if (idx[k] != null) { out[idx[k]].value += x.value; return; } idx[k] = out.length; out.push(Object.assign({}, x)); return; }
      out.push(x);
    });
    return out.filter(x => !((x.type === 'stat_delta' || x.type === 'relationship_delta' || x.type === 'abil_delta') && !x.value));
  }
  function resolve(ev, c, st, ctx, adapter) {
    const kind = classify(ev, c); if (!kind) return null;      // 退役事件：回 null＝照原本固定效果
    const rnd = (adapter && typeof adapter.rnd === 'function' ? adapter.rnd : Math.random), S = state(adapter);
    if (!S.known && !(adapter && typeof adapter.info === 'function')) return null;      // 這個遊戲沒有體能／心情系統（沒有 13i）：保持舊行為
    const prof = profile(c), media = isMediaEv(ev), rel = (st && st.rel) || {}, tg = relTarget(c), who = SPK[tg] || '隊友';
    const o = odds(kind, prof, c, S, rel, media), flags = (st && st.flags) || {};
    let run = +flags.OUT_BADRUN || 0; if (run >= 2) o.bad *= .4;      // 連續失手後稍微轉運
    const r = rnd(), tier = r < o.bad ? 'bad' : r < o.bad + o.good ? 'good' : 'ok';
    if (st && st.flags) st.flags.OUT_BADRUN = tier === 'bad' ? run + 1 : 0;
    const base = (c.effects || []).slice(), withdraw = media && kind !== 'media';      // 媒體類事件中「推掉／低調」的選項：人氣小跌
    const m = { who, why: '', ab: '' }, out = [];
    const popBase = media ? (kind === 'media' ? 3 : -1) : 0;

    if (tier === 'ok') {
      base.forEach(x => out.push(x)); add(out, 'stat_delta', 'pop', popBase);
      return { tier, effects: merge(out), pages: null, note: undefined };
    }
    if (tier === 'good') {
      base.forEach(x => out.push(x)); add(out, 'stat_delta', 'pop', popBase);
      if (kind === 'grind') { add(out, 'stat_delta', 'trust', 2); add(out, 'stat_delta', 'mood', 1); if (rnd() < .45) { const key = pick(KEYS[S.pos], rnd); out.push({ type: 'abil_delta', key, value: 1 }); } }
      else if (kind === 'rest') { add(out, 'stat_delta', 'fit', 4); add(out, 'stat_delta', 'mood', 3); }
      else if (kind === 'social') { add(out, 'relationship_delta', tg, 3); add(out, 'stat_delta', 'mood', 2); }
      else if (kind === 'media') { add(out, 'stat_delta', 'pop', 4); add(out, 'stat_delta', 'trust', 1); }
      else if (kind === 'mind') { add(out, 'stat_delta', 'trust', 2); out.push({ type: 'momentum', target: 'trust', value: 1, games: 3 }); }
      else { add(out, 'stat_delta', 'mood', 3); add(out, 'relationship_delta', 'team', 2); }
      if (withdraw) add(out, 'stat_delta', 'pop', 2);      // 低調反而被稱讚
      const extra = beatOf(pick(T.good[kind], rnd), m), pg = (c.after || []).length ? c.after.slice() : [{ scene: null, shot: null, lines: (c.result || []).slice() }];
      return { tier, effects: merge(out), pages: pg.concat([extra]), note: undefined };
    }
    /* —— 失手 —— */
    base.forEach(x => { const y = scaleBad(x); if (y) out.push(y); });
    let sub, pen = [];
    const keyPick = () => pick(KEYS[S.pos].concat(['dur']), rnd);
    if (kind === 'grind') {
      const noInj = S.hurt || ev.phase === 'offseason' || ev.phase === 'po_end', pi = noInj ? 0 : cl(.2 + (65 - S.fit) * .012, .12, .6), q = rnd() * (pi + .6);
      if (q < pi) { sub = 'injury'; const w = pick(WHY[S.pos === 'P' ? 'P' : S.pos === 'TWP' ? (rnd() < .5 ? 'P' : 'B') : 'B'], rnd); m.why = w[1]; pen.push({ type: 'injury', sev: S.fit < 40 && rnd() < .3 ? 'mid' : 'light', why: w[0] }); add(pen, 'stat_delta', 'mood', -3); }
      else if (q < pi + .3) { sub = 'exhaust'; add(pen, 'stat_delta', 'fit', -6); add(pen, 'stat_delta', 'trust', -2); }
      else { sub = 'slump'; const key = keyPick(); m.ab = AB[key]; pen.push({ type: 'abil_delta', key, value: -1 }); add(pen, 'stat_delta', 'mood', -2); pen.push({ type: 'momentum', target: 'trust', value: -1, games: 3 }); }
    } else if (kind === 'rest') {
      if (rnd() < .5) { sub = 'idleAb'; const key = keyPick(); m.ab = AB[key]; pen.push({ type: 'abil_delta', key, value: -1 }); add(pen, 'stat_delta', 'trust', -1); }
      else { sub = 'idleCoach'; add(pen, 'relationship_delta', 'coach', -3); add(pen, 'stat_delta', 'trust', -2); m.who = '教練'; }
    } else if (kind === 'social') {
      if (rnd() < .65) { sub = 'awkward'; add(pen, 'relationship_delta', tg, -5); add(pen, 'stat_delta', 'mood', -3); }
      else { sub = 'leak'; add(pen, 'relationship_delta', 'team', -4); add(pen, 'stat_delta', 'mood', -2); }
    } else if (kind === 'media') {
      if (rnd() < .6) { sub = 'twist'; add(pen, 'stat_delta', 'pop', -6); add(pen, 'stat_delta', 'trust', -2); }
      else { sub = 'flop'; add(pen, 'stat_delta', 'pop', -4); add(pen, 'relationship_delta', 'agent', -4); }
    } else if (kind === 'mind') {
      if (rnd() < .55) { sub = 'overthink'; add(pen, 'stat_delta', 'mood', -5); add(pen, 'stat_delta', 'trust', -2); }
      else { sub = 'tight'; const key = keyPick(); m.ab = AB[key]; pen.push({ type: 'abil_delta', key, value: -1 }); add(pen, 'stat_delta', 'mood', -3); }
    } else { sub = 'slack'; add(pen, 'stat_delta', 'fit', -4); add(pen, 'stat_delta', 'trust', -2); }
    if (withdraw && kind !== 'media') add(pen, 'stat_delta', 'pop', -3);
    else if (media && kind === 'media' && sub !== 'twist' && sub !== 'flop') add(pen, 'stat_delta', 'pop', -3);
    pen.forEach(x => out.push(x));
    const first = (c.after || [])[0], head = first ? (() => { const keep = (first.lines || []).filter(l => !/「/.test(l)); return { scene: first.scene, shot: first.shot, fx: first.fx, lines: keep.length ? keep : (first.lines || []).slice(0, 1) }; })() : { scene: null, shot: null, lines: (c.result || []).slice(0, 1) };
    const gb = pick(T.bad[sub], rnd), cu = CSTORY.OUT && CSTORY.OUT.BADTX && CSTORY.OUT.BADTX[ev.id + '|' + c.id];      // v1.1.79：有「事件專屬失手文字」（13h4）就用它；受傷仍多補一格共用的受傷說明
    if (cu && cu.length) { const own = { scene: head.scene || gb[0], shot: 'close+cold', lines: fill(cu, m) }; return { tier, effects: merge(out), pages: sub === 'injury' ? [head, own, beatOf(gb, m)] : [head, own], note: '', sub }; }
    return { tier, effects: merge(out), pages: [head, beatOf(gb, m)], note: '', sub };
  }

  CSTORY.setResolver(resolve);
  CSTORY.OUT = { BADTX: {}, classify, profile, odds, resolve, merge, relTarget, isMediaEv, BASE, KINDS: ['grind', 'rest', 'social', 'media', 'mind', 'joy'] };
})();
