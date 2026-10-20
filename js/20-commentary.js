/* 20-commentary.js — 轉播間：主播／球評實況（原 script.js 第 4341-4510 行） */
'use strict';
/* =====================================================================
   轉播間：主播（play-by-play）＋球評（color）— 依局數、比數、出局、壘上、球數、打者與投手狀態播報
   ===================================================================== */
const CAST = { recent: [] };
const tagA = '<span class="cl a">主播</span>', tagB = '<span class="cl b">球評</span>';
const castA = t => tagA + t, castB = t => tagB + t;
function pickNR(arr) {      // 避免連續講到一樣的話
  const pool = arr.filter(x => !CAST.recent.includes(x)); const v = pick(pool.length ? pool : arr); CAST.recent.push(v); if (CAST.recent.length > 14) CAST.recent.shift(); return v;
}
function cx() {      // 目前場面
  const h = G.half, on = G.on.map(x => !!x), n = on.filter(Boolean).length, diff = G.score[h] - G.score[1 - h];
  const bt = battingTeam(), ft = fieldingTeam(), p = curPitcher(), b = curBatter();
  return { inn: G.inning, bot: !!h, outs: G.outs, balls: G.balls, strikes: G.strikes, on, n, risp: on[1] || on[2], loaded: on[0] && on[1] && on[2], diff, bt, ft, p, b,
    late: G.inning >= 7, last: G.inning >= (G.innings || 9), close: Math.abs(diff) <= 1, tied: diff === 0, full: G.balls === 3 && G.strikes === 2, hot: moodOf(b) >= 66, cold: moodOf(b) <= 38, tired: (p.fatigue || 0) > 60 };
}
const innTxt = c => `${c.inn}局${c.bot ? '下' : '上'}`;
const diffTxt = c => c.diff === 0 ? '雙方戰成平手' : c.diff > 0 ? `${c.bt.short}目前領先${c.diff}分` : `${c.bt.short}目前落後${-c.diff}分`;
const runnerTxt = c => c.loaded ? '滿壘' : c.n === 0 ? '壘上無人' : c.on[1] && c.on[2] ? '二、三壘有人' : c.on[0] && c.on[2] ? '一、三壘有人' : c.on[0] && c.on[1] ? '一、二壘有人' : c.on[2] ? '三壘有人' : c.on[1] ? '二壘有人' : '一壘有人';
const outsTxt = c => ['無人出局', '一人出局', '兩人出局'][c.outs] || '';
function pitchFlavor(pt, swing) {      // 依球種／球速的形容（球出手後才講，不會洩漏下一球）
  if (!pt) return '';
  const k = Math.round(pt.kmh || 0), id = pt.id, nm = PITCHES[id] ? PITCHES[id].jp : '';
  const m = { ST: pick(['火球直球', '直球尾勁十足', '速球威力十足']), SL: pick(['滑球橫向大位移', '滑球末端急切', '滑球從外角劃進來']), CU: pick(['曲球高高拋起再落下', '大弧度曲球', '曲球讓打者重心全亂']), FK: pick(['指叉球最後突然掉下去', '指叉球墜得很深']), CH: pick(['變速球抓到打者時機', '變速球慢慢飄進來']), CT: pick(['卡特球往內角鑽', '卡特球在最後一刻切進來']), SK: '伸卡球往下沉', TS: '二縫線直球帶著位移', SH: '內曲球大幅度往內切', SV: '螺旋球詭異變向', KN: '蝴蝶球飄忽不定' }[id] || nm;
  return `${k}公里${m}`;
}
const SAYX = {
  pitchStart(p, n) {      // 球出手前：只談場面，不透露球種
    const c = cx(), L = [];
    L.push(`第${n}球…${p.name}看了看捕手暗號`, `${p.name}站上投手丘，${c.strikes}好${c.balls}壞，準備投球`, `來，${p.name}點頭，投球動作開始…`);
    if (c.full) L.push(`${c.outs === 2 ? '兩出局，' : ''}滿count！這一球決定這個打席！`, `三壞兩好！全場都站起來了，${p.name}能不能守住？`);
    else if (c.strikes === 2) L.push(`兩好球在身，${p.name}準備做結，${c.b.name}要小心了`, `已經兩好球，${c.b.name}得縮短揮棒了`);
    else if (c.balls === 3) L.push(`三壞球了！${p.name}不能再投壞球了`, `壞球已經累積到三顆，${p.name}必須要投進去`);
    if (c.loaded) L.push(`滿壘！${outsTxt(c)}，${p.name}壓力很大`, `壘上都是人，${p.name}深呼吸一口氣…`);
    else if (c.risp && c.late) L.push(`${runnerTxt(c)}，${c.b.name}站在關鍵位置`);
    if (c.last && c.close) L.push(`${innTxt(c)}，比數相當接近，每一球都是關鍵！`);
    return castA(pickNR(L));
  },
  strikeLook(pt) { const c = cx(), f = pitchFlavor(pt), L = [`看著${f}從邊角進來，好球！`, `${f}，${c.b.name}沒有出棒，好球！`, '主審右手一舉——好球！', `${c.strikes}好${c.balls}壞，這球抓得很準！`]; if (c.strikes === 2) L.push(`${c.strikes}好球了！${c.p.name}佔了上風`); return castA(pickNR(L)); },
  strikeSwing(pt) { const c = cx(), f = pitchFlavor(pt, true), L = [`揮空！${f}！`, `${c.b.name}揮棒落空，${f}`, `咻！棒子從球下面過去了，${c.strikes}好球`, `${c.b.name}被${pt ? PITCHES[pt.id].short : '球'}騙到了！`]; return castA(pickNR(L)); },
  ball(pt) { const c = cx(), L = [`壞球，${c.balls}壞${c.strikes}好`, `${c.b.name}忍住沒揮，壞球`, `偏高了一點，壞球`, `${pt ? PITCHES[pt.id].short : '這球'}沒有控制好，壞球`]; if (c.balls === 3) L.push(`三壞了！${c.p.name}開始有點緊繃`); if (c.balls === 3 && c.strikes === 2) L.push('滿count，球場氣氛瞬間凝結！'); return castA(pickNR(L)); },
  foul(high) { const c = cx(), L = high ? ['打高了！界外高飛球，接得到嗎！', '整個往後飛，界外高飛球！'] : [`界外球！${c.b.name}頑強地死纏爛打`, '界外！只差一點點就是安打', '貼著邊線飛出去，界外！']; if (c.strikes === 2 && !high) L.push('兩好球後被救回一球，打者活下來了！'); return castA(pickNR(L)); },
  k(b, sw, pt) {
    const c = cx(), f = pitchFlavor(pt), end = c.outs + 1 >= 3, L = sw ? [`三振！！${b.name}揮空！${f}`, `${c.p.name}送出三振！${b.name}完全抓不到時機`, `揮空三振！${f}，漂亮！`] : [`看三振！${b.name}站著不動！${f}`, `好球！三振出局！${b.name}傻在原地`, `${c.p.name}用${f}凍結了${b.name}！`];
    if (c.risp && !end) L.push(`${runnerTxt(c)}，${c.p.name}用三振化解危機！`); if (end && c.n) L.push(`三振終結這一局！壘上的${c.n}個跑者全部留壘！`);
    return castA(pickNR(L));
  },
  bb(b) { const c = cx(), L = [`四壞球保送！${b.name}忍住了，上一壘`, `第四個壞球，${b.name}選到保送`]; if (c.loaded) L.push(`滿壘還押出分數！${c.p.name}被迫送回一分！`); if (c.p.fatigue > 60) L.push(`${c.p.name}控球越來越不穩，教練團可能要有動作了`); return castA(pickNR(L)); },
  hbp(b) { return castA(pickNR([`打到了！觸身球！${b.name}痛得皺眉頭，上一壘`, `球擦過${b.name}的身體，觸身球！`])); },
  contact(pl) {
    const r = pl.res || {}, Q = r.Q || .5, c = cx(), area = areaWord(pl.plan.x, pl.plan.z), kind = hitTypeWord(pl.kind), L = [];
    if (Q > .85) L.push(`「叩！」清脆的打擊聲！${kind}直奔${area}！`, `完美擊中！${kind}飛向${area}！`);
    else if (Q > .6) L.push(`打出去了！${kind}，飛向${area}方向！`, `${c.b.name}打得很紮實，${kind}往${area}去！`);
    else if (Q < .3) L.push(`勉強碰到，${kind}軟弱地飄向${area}…`, `打得不太好，${kind}往${area}…`);
    else L.push(`擊出${kind}！方向${area}！`);
    if (pl.sim && pl.sim.hug) L.push(`球沿著邊線滾！會不會界內？${area}方向！`);
    if (r.broken) L.unshift(`斷棒！${c.b.name}的球棒被打斷了，${kind}飄向${area}！`);
    return castA(pickNR(L));
  },
  hr(b, pl) {
    const c = cx(), n = G.on.filter(Boolean).length + 1, d = c.diff + n, bef = c.diff, L = [];
    const kind = n === 4 ? '滿貫全壘打' : n === 3 ? '三分砲' : n === 2 ? '兩分砲' : '陽春全壘打';
    L.push(`${b.name}！！${kind}！！`, `進去了～～！${b.name}的${kind}！！`, `很大！很大！出去了！${kind}！！`);
    if (n === 4) L.unshift(`滿壘全壘打！！大——滿——貫！！${b.name}一棒定江山！！`);
    if (bef < 0 && d > 0) L.unshift(`逆轉！！${b.name}的${kind}，一棒翻轉比賽！！`);
    else if (bef < 0 && d === 0) L.unshift(`追平比分！${b.name}的${kind}！！`);
    else if (bef === 0) L.unshift(`${b.name}轟出${kind}，打破僵局！！`);
    if (c.bot && c.last && bef <= 0 && d > 0) L.unshift(`再見全壘打！！${b.name}為比賽畫下句點！！`);
    return castA(pickNR(L));
  },
  hit(b, n, pl) {
    const c = cx(), area = areaWord(pl.plan.x, pl.plan.z), nm = HIT_NAME[n], st = b.st, L = [];
    if (n === 1) L.push(`${area}方向，${nm}！`, `漂亮！${b.name}把球敲進${area}，安打！`, `落地了！${nm}，${b.name}上一壘！`);
    if (n === 2) L.push(`${area}！球一路滾向外野，二壘安打！`, `長打！${b.name}一路衝上二壘！`);
    if (n === 3) L.push(`${area}！球越滾越遠，${b.name}拼命衝向三壘，三壘安打！`, `三壘打！${b.name}腳程全開，一路跑到三壘！`);
    if (c.risp && c.outs < 2 && n >= 1) L.push(`得點圈有人的時候，${b.name}交出了安打！`);
    if (st.h >= 2) L.push(`${b.name}今天第${st.h}支安打了，手感正熱！`);
    if (c.late && c.close) L.push(`這支${nm}在關鍵時刻打出來，意義重大！`);
    return castA(pickNR(L));
  },
  catchOut(f, pl) {
    const c = cx(), deep = pl.dist > 75, L = [`${POS_FULL[f.pos]}${f.pl.name}穩穩接住！出局！`, `${POS_FULL[f.pos]}把球收進手套，一人出局！`];
    if (pl.kind === 'fb' && deep) L.push(`這球飛得很深！但${POS_FULL[f.pos]}退到牆邊接住了！`);
    if (pl.kind === 'pu') L.push('內野小飛球，沒有任何問題，接殺！');
    if (pl.kind === 'ld') L.push(`平飛球！${POS_FULL[f.pos]}剛好站在球的路徑上，接殺！`);
    if (pl.foul) L.unshift(`${POS_FULL[f.pos]}在界外把球接下來了！界外接殺！`);
    if (c.outs + 1 >= 3) L.push('這球接住，三出局，攻守交換！');
    return castA(pickNR(L));
  },
  out(nm, how, forceOut) {
    const c = cx(), L = forceOut ? [`出局！${nm}，在一壘被封殺`, `${nm}差了一步，一壘出局！`, `傳到一壘，${nm}出局！`] : [`${nm}，出局！`, `${nm}被刺殺！`];
    if (c.outs + 1 >= 3) L.push('三出局，結束這半局！'); return castA(pickNR(L));
  },
  score(r) {
    const h = G.half, a = G.score[h], o = G.score[1 - h], d = a - o, bef = d - 1, L = [`跑回本壘得分！${battingTeam().short}，${a}比${o}`];
    if (bef < 0 && d === 0) L.unshift(`追平比分！！${battingTeam().short}${a}比${o}平手！！`);
    else if (bef < 0 && d > 0) L.unshift(`逆轉！！${battingTeam().short}反超比數，${a}比${o}！！`);
    else if (bef === 0) L.unshift(`${battingTeam().short}先馳得點！${a}比${o}超前！`);
    else if (d >= 4) L.push(`${battingTeam().short}繼續擴大領先，${a}比${o}`);
    return castA(pickNR(L));
  },
  halfStart() {
    const c = cx(), L = [`${innTxt(c)}，${c.bt.name}進攻。投手丘上是${c.p.name}`, `${c.inn}局${c.bot ? '下半' : '上半'}開始！${c.bt.short}上場打擊，${c.p.name}鎮守投手丘`];
    if (c.last && c.bot && c.diff < 0) L.unshift(`${c.inn}局下半！${c.bt.short}最後一次進攻機會，${diffTxt(c)}！`);
    else if (c.last) L.unshift(`最後一局！${c.bt.short}進攻，${diffTxt(c)}！`);
    else if (c.late && c.close) L.unshift(`${innTxt(c)}，比賽進入後半段，${diffTxt(c)}，一分都不能放！`);
    return castA(pickNR(L));
  },
  batter(b, idx) {
    const c = cx(), st = b.st, L = [`第${idx}棒，${b.name}。目前${st.ab}打數${st.h}安打`, `接下來是第${idx}棒${b.name}`];
    if (c.loaded) L.unshift(`滿壘！${outsTxt(c)}，第${idx}棒${b.name}走上打擊區！`);
    else if (c.risp && c.outs < 2) L.unshift(`${runnerTxt(c)}，${outsTxt(c)}，${b.name}是進攻的機會！`);
    else if (c.n && c.outs === 2) L.push(`兩出局${runnerTxt(c)}，${b.name}要把握機會`);
    if (st.h >= 2) L.push(`${b.name}今天已經${st.h}支安打，感覺非常好！`);
    if (c.hot) L.push(`${b.name}手感很熱，投手要小心`); if (c.cold) L.push(`${b.name}最近狀況不太好，今天要靠這個打席扳回一城`);
    return castA(pickNR(L));
  },
  inningEnd() {
    const c = cx(), L = [`三出局，攻守交換。${G.score[0]}比${G.score[1]}`]; if (c.n) L.unshift(`三出局！壘上${c.n}個跑者全數留壘，${c.bt.short}無功而返！`);
    if (c.last && c.bot && G.score[1] < G.score[0]) L.push('比賽即將結束…'); return castA(pickNR(L));
  }
};
/* 球評：多半在主播講完後補一句分析（每句有條件、不會亂講） */
const COLOR = {
  pitch(pt, kind) {      // kind: strikeLook/strikeSwing/ball/foul
    const c = cx(), L = [];
    if (kind === 'strikeSwing' && pt && ['SL', 'CU', 'FK', 'SH', 'SV', 'SK', 'CH'].includes(pt.id)) L.push('這種變化球，打者要用眼睛追，球路一轉彎就很難跟上了', '配球很漂亮，前面先用直球建立印象，再用變化球誘導揮棒');
    if (kind === 'strikeSwing' && pt && pt.kmh >= 150) L.push('球速一旦超過150，打者的反應時間只剩零點幾秒，很難抓時機');
    if (kind === 'strikeLook') L.push('這顆球剛好壓在邊角，很難要求打者出棒', '看起來打者在等好球，這球選得有點可惜');
    if (kind === 'ball') L.push(c.balls === 3 ? '球數對投手越來越不利了，下一球一定要進好球帶' : '打者選球很有耐心，沒有被誘惑', c.tired ? `${c.p.name}體力開始下降，控球已經有點飄` : '投手要穩住節奏，別被打者影響');
    if (kind === 'foul') L.push('這種界外球代表打者的時機已經很接近了，下一球就是機會', c.strikes === 2 ? '兩好球後還能夠把球救成界外，這位打者很有韌性' : '打者在調整揮棒角度');
    if (c.risp && c.late) L.push('得點圈有人的後半段，每一球都可能是勝負關鍵');
    return L.length ? castB(pickNR(L)) : '';
  },
  k(b, pt, sw) {
    const c = cx(), L = ['這個三振解決得非常漂亮，配球邏輯很清楚', `${c.p.name}今天的球威很好，變化球和直球搭配得很好`];
    if (!sw) L.push(`${b.name}這球站著不動很可惜，好球帶邊角還是要出棒保護`);
    if (c.risp) L.push('有人在得點圈還能把三振拿下，這就是王牌的氣勢');
    return castB(pickNR(L));
  },
  bb(b) { const c = cx(); return castB(pickNR([c.tired ? `${c.p.name}體力已經下降，教練團該考慮換投手了` : '投手好像有點被打者的選球逼進角落了', '滿壘下被迫保送，投手心態很重要，要趕快調整', `${b.name}選球能力很好，把投手的節奏打亂了`])); },
  hit(b, n, pl) {
    const r = pl.res || {}, c = cx(), L = [];
    if ((r.Q || 0) > .85) L.push(`這顆球打在甜蜜點，${b.name}完全抓準時機，沒有給投手任何機會`);
    if ((r.inside || 0) > .35) L.push(`內角球還能打成安打，${b.name}的手腕處理得非常好`); else if ((r.inside || 0) < -.35) L.push('外角球推向反方向，這種打法很聰明');
    if (pl.badHop) L.push('這顆球彈起來的角度很怪，野手真的很倒楣');
    if (n >= 2) L.push(`${b.name}腳程很快，守備方只能眼睜睜看著他多推進一個壘包`);
    if (c.risp) L.push('有跑者在得點圈，這支安打可能會讓比賽出現關鍵變化');
    L.push('球飛行的軌跡很漂亮，守備員來不及反應', `${b.name}的選球與擊球時機都掌握得非常好`);
    return castB(pickNR(L));
  },
  hr(b, pl) { return castB(pickNR([`${Math.round(pl.dist)}公尺！這種飛行距離，根本不需要擔心有沒有出界`, '這球被打得非常漂亮，投手的球偏高了一點，被抓到了', `${b.name}的爆發力在球場上很少見，這一擊改變了整場比賽`, '甜蜜點打得很紮實，球飛出去的聲音都不一樣'])); },
  out(kind, f, pl) {
    const c = cx(), L = [];
    if (kind === 'fly') L.push('外野手的判斷很準，一開始的起步很快，路線也很漂亮', '這種高飛球守備要先站位置，再等球落下，很標準的處理');
    if (kind === 'gb') L.push('內野手的腳步移動很到位，傳球也很穩', '雙殺的機會就在這種滾地球上，內野防守要保持專注');
    if (pl && pl.great) L.push('這是一個非常精彩的守備，絕對是今天的亮點');
    return L.length ? castB(pickNR(L)) : '';
  },
  score(r) { const h = G.half, a = G.score[h], o = G.score[1 - h], d = a - o; return castB(pickNR(d === 0 ? ['比賽重新回到同一個起跑線，接下來的每一球都很關鍵', '這分追得很重要，對士氣是很大的鼓舞'] : d > 0 ? ['這分攻下來，把比賽的主導權抓在手上了', `${battingTeam().short}的打線在關鍵時刻接力得很完整`] : ['雖然還落後，但這分讓大家看到了反攻的機會', '要持續保持壓力，投手已經開始緊張了'])); },
  inning() {
    const c = cx(), L = [];
    if (c.last && c.close) L.push('最後一局，每一個決策都會影響結果，教練席壓力非常大');
    if (c.late && c.diff >= 3) L.push('這個比數，領先的球隊只要穩住守備就能把勝利守住');
    if (c.p.fatigue > 60) L.push(`${c.p.name}已經投了不少球，體力是一個要注意的地方`);
    L.push('投手狀況不錯，接下來關鍵是控球要穩');
    return castB(pickNR(L));
  }
};


