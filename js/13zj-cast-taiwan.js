/* ===== 13zj-cast-taiwan.js ｜ 左下角主播／球評：台灣味趣味播報（台灣用語、梗、天氣與夜空天象連動） =====
   載入順序：在 13zi 之後、14 之前（會包裝 09 的 SAYX / COLOR，並覆寫 12 的 TW_MSG、13zi 的 NSKY_MSG）。

   做法：不動原本的播報邏輯。每次播報先照舊呼叫原函式（原本的亂數消耗完全不變），
        再依機率改用這裡的「台灣味」台詞；沒抽中或出錯就退回原句，所以不會壞掉。
   天氣連動：颳風／微風／赤熱炎日／陽光普照／悶熱／霾害／梅雨／雷雨／颱風／季風／各級雨勢，
            以及夜間的星光／月光／極光／流星，都有專屬台詞（大巨蛋則會有「冷氣開很大」的梗）。
   【注意】這個檔案「不可使用 Math.random」：區網對戰會把它換成同步亂數，視覺／文字不能吃掉亂數。一律用私有的 R()。 */
'use strict';
(function () {
  const R = (() => { let s = (Date.now() ^ 0x5bd1e995) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const chance = p => R() < p;
  const recent = [];
  function fresh(arr) {      // 從台詞池挑一句，避開最近講過的
    const pool = arr.filter(x => !recent.includes(x)); const a = pool.length ? pool : arr; const v = a[Math.floor(R() * a.length)];
    recent.push(v); if (recent.length > 40) recent.shift(); return v;
  }

  /* ---------------- 天氣／天象台詞 ---------------- */
  function wxState() {
    try {
      if (!G.wx || G.wxOn === false) return null;
      if (G.wx.dome) return 'dome';
      if (G.wx.off) return null;
      const sc = G.wxScen, rain = G.rain || 0;
      if (sc === 'thunder' || sc === 'plum' || sc === 'typhoon') return sc;      // 這幾種雨天情境有專屬台詞（不論雨量）
      if (rain >= .8) return 'storm'; if (rain >= .55) return 'heavy'; if (rain >= .3) return 'rain'; if (rain >= .06) return 'drizzle';
      return sc;
    } catch (e) { return null; }
  }
  const WXL = {
    dome: ['巨蛋裡冷氣開得很強，外面下什麼都跟我們無關，舒服啦', '大巨蛋就是爽，不怕風不怕雨，連蚊子都進不來', '室內球場，球迷穿短袖看球都不會冷，這就是小確幸'],
    sunny: ['今天太陽超大，防曬乳有擦的舉手！', '陽光普照，球場亮晶晶，簡直是棒球天氣的最佳代言人', '天氣好到讓人想請假來看球，這樣的好天氣不看球太可惜', '大太陽高掛，外野手戴著帽沿壓低，眼睛瞇成一條線'],
    scorch: ['赤熱炎日！地表溫度可以煎蛋了，各位要多補充水分', '熱浪在球場上翻滾，球員都快被烤成肉乾，投手體力掉超快', '這種天氣，球員流的汗比手搖飲的冰塊融得還快', '太陽毒辣辣，看台上的扇子和飲料今天銷量一定破表', '熱到連草皮都在冒煙，守備員要小心中暑，球迷也是！'],
    hot: ['悶熱到不行，連空氣都黏黏的，球員汗流浹背', '濕氣很重，感覺像整個人泡在蒸籠裡，投手手上都是汗', '這種悶熱天氣，冰涼的飲料一定賣翻'],
    breeze: ['微風輕輕吹，落葉在場邊打轉，好有秋天的氛圍', '涼涼的風吹過來，樹葉沙沙響，這種天氣打球最舒服', '幾片落葉隨風飄過球場，要是配上一杯熱奶茶就更完美了', '微風徐徐，旗子輕輕擺動，今天是很適合看球的好天氣'],
    gale: ['風超大！帽子要抓好，不然會被吹到外太空', '旗桿被吹得啪啪響，落葉和沙塵滿場亂飛，外野手要小心', '今天這風，高飛球根本是在玩「風箏」，守備員眼睛要睜大', '強風來襲！投手的球路也可能被吹歪，這下難預測了', '風吹得人站不穩，球迷的頭髮已經全部起飛了'],
    calm: ['今天天氣不錯，風也不大，球員應該很好發揮', '天氣穩穩的，球員可以專心打球，沒有天氣的藉口'],
    overcast: ['天空灰灰的，雲層有點厚，今天看球要帶件薄外套', '陰陰的天氣，沒有大太陽曬，其實滿舒服的', '雲層厚厚的，高飛球更不好判斷，外野手要注意囉'],
    drizzle: ['毛毛雨飄下來了，球員的帽沿開始滴水，球迷要不要撐傘？', '細細的雨絲，不大但黏黏的，場地開始有點濕', '毛毛雨就像手搖飲的少冰，不多但就是有感'],
    rain: ['雨一直下，場地變濕滑，傳球、接球都要多小心', '下雨了！球迷穿起雨衣，雨衣海浪在看台上很壯觀', '雨水打在球帽上，滴答滴答，投手手滑要小心'],
    heavy: ['大雨嘩啦嘩啦，球濕濕滑滑，投手握球好困難', '雨好大！球場已經水汪汪，外野手滑倒的風險很高', '這雨下得像天空破了個洞，主審隨時都可能考慮暫停'],
    storm: ['暴雨狂瀉！球場快變成游泳池，這場比賽能不能打完都是未知數', '雨大到看不清楚球，守備員只能憑感覺，全場都在祈禱雨小一點'],
    plum: ['梅雨鋒面滯留，空氣濕黏黏的，這種天氣衣服永遠曬不乾', '梅雨季的天氣，濕度爆表，連球棒都濕濕的', '又濕又黏的梅雨天，球員的手都是滑的，真的好難握球'],
    thunder: ['午後雷陣雨來勢洶洶，雲堆得好高，打雷了大家要小心', '轟隆隆！午後雷陣雨說來就來，比前任還不給人心理準備', '雷聲一響，全場都跟著抖一下，下一秒是不是就要傾盆大雨？'],
    typhoon: ['颱風外圍環流接近，風一陣一陣，球場旗桿快被吹彎了', '外圍環流的威力不容小覷，風雨交加，球員真的很拚', '颱風快來了，這場球會不會變成颱風假加班打？大家都很關注'],
    monsoon: ['東北季風又來報到，風濕濕冷冷的，外套記得穿好', '季風吹得又穩又涼，球員站在場上手都有點僵', '東北季風的味道，這就是台灣冬天的標準配備'],
    haze: ['空氣有點霾，遠方的高樓都模糊了，高飛球更難判斷', '今天空汙不太理想，有帶口罩的球迷很有先見之明', '霾霾的天空讓高飛球很難看，外野手要多瞇一下眼睛']
  };
  const SKYL = {
    starry: ['抬頭一看，滿天星星，今天的夜空美到不真實！', '銀河隱約可見，這種夜空在台灣真的不多見，看球還能看星星，賺到！', '星光點點，球場燈光和星星同台競技，浪漫指數破表', '夜空繁星閃爍，球迷拿手機拍星空的比拍球還多，這很合理'],
    moon: ['月亮又大又圓，簡直像掛在天上的大燈泡，超美的啦', '月光皎潔，球場燈光和月光交織在一起，氣氛直接拉滿', '今晚月色很美，球打得也很美，這種夜晚我可以一直看下去', '月亮高高掛，風有點涼，這種夜晚來看球根本是人生享受'],
    aurora: ['天邊竟然出現極光！台灣球場看極光，這是什麼神展開啊！', '綠色紫色的光幕在天上飄，全場觀眾都抬頭拍照，球員也偷瞄一下', '極光！這輩子能在球場看到極光，簡直可以吹一輩子', '極光和球場燈光一起閃，這個畫面今晚大概要洗版了'],
    meteor: ['流星劃過！快許願！希望我的球隊可以全勝！', '又一顆流星！這夜空今天太忙，球場也跟著浪漫起來', '流星雨正在上演，大家邊看球邊許願，願望清單都排滿了', '天上流星一道道，場上球一顆顆，今晚真是精彩的夜晚']
  };
  const NIGHTL = ['夜間比賽的燈光超有氣氛，球場像舞台一樣閃亮', '夜裡看球最對味，一邊吹涼風一邊吃宵夜，人生贏家', '燈塔全開，整個球場亮得像白天，球迷的聲音在夜裡特別響'];
  function skyKind() { try { return (G.night && typeof nightSkyLabel === 'function' && nightSkyLabel()) ? NSKY.kind : null; } catch (e) { return null; } }
  const RAINYS = ['drizzle', 'rain', 'heavy', 'storm', 'plum', 'thunder', 'typhoon'];
  const NRAINL = {
    drizzle: ['夜裡飄著毛毛雨，燈光下一絲絲雨線閃閃發亮，美是美，但球有點滑', '毛毛雨在燈塔下飛舞，像灑了一層金粉，好有氣氛'],
    rain: ['夜雨嘩啦嘩啦，燈光下的雨絲像銀線一樣，看台上雨衣一片，壯觀！', '晚上下雨，球場燈光把雨絲照得亮晶晶，球員的帽沿一直滴水'],
    heavy: ['夜裡大雨傾盆，燈光被雨打得一片朦朧，場上球員像在水簾洞裡打球', '大雨夜！球場積水反光，整個場地像鏡子一樣，守備要小心滑'],
    storm: ['夜間暴雨，天色黑漆漆、雨打在燈塔上轟轟響，這種天氣真的是極限挑戰', '暴雨夜！雨大到燈光都糊成一片，這場比賽能不能打完，大家都在祈禱'],
    plum: ['夜裡的梅雨細細密密，空氣又濕又涼，球員的手都是滑的', '梅雨夜，燈光下的雨絲慢慢飄，感覺全場都泡在濕氣裡'],
    thunder: ['夜間雷雨！閃電一亮整個球場亮如白晝，雷聲一響全場都跟著抖', '深夜雷陣雨，轟隆隆的雷聲搭配閃電，這氣氛比恐怖片還刺激', '夜裡打雷閃電，球迷抓緊雨衣，球員也偷看天空，今晚好驚險'],
    typhoon: ['夜裡颱風外圍環流來襲，風雨交加燈塔都在搖，大家小心安全', '颱風夜的球場，風大雨大，旗桿被吹得嗚嗚叫，球員真的很拚']
  };
  function weatherPool(c) {
    const L = [], st = wxState(); if (!st) return L;
    if (G.night && NRAINL[st]) L.push(...NRAINL[st], ...NRAINL[st]); else if (WXL[st]) L.push(...WXL[st]);
    if (G.night && st !== 'dome') { const sk = skyKind(); if (sk && SKYL[sk]) L.push(...SKYL[sk], ...SKYL[sk]); else if (['calm', 'sunny', 'breeze', 'gale'].includes(st)) L.push(...NIGHTL); }
    if (st === 'sunny' && G.night) L.length = 0, L.push(...(skyKind() ? SKYL[skyKind()] : NIGHTL));      // 夜裡的「晴」改講夜景，不講太陽
    if (st === 'dome' && G.night) L.push(...NIGHTL);
    return L;
  }
  const windy = () => { try { return !!(G.wx && !G.wx.dome && G.wx.spd >= 5); } catch (e) { return false; } };
  const hotDay = () => { try { return !!(G.wx && !G.wx.dome && (G.wxScen === 'scorch' || G.wxScen === 'hot')); } catch (e) { return false; } };

  /* ---------------- 主播台詞（每個事件一組；回傳字串陣列） ---------------- */
  const FUN = {
    pitchStart(c, p, n) {
      const b = c.b.name, pn = p.name, L = [
        `${c.strikes}好${c.balls}壞，${pn}把球捏在手上，氣氛超緊繃`, `來囉來囉！第${n}球，${pn}站在投手丘上超有架勢`, `${pn}深呼吸一口氣，${b}也站穩了，大家屏息以待`, `${b}眼神殺氣騰騰，今天的他有點不一樣喔`,
        `${pn}和${b}的對決開始，爆米花準備好了嗎？`, `${pn}看完暗號點點頭，這球交給他，穩啦`, `${c.strikes}好${c.balls}壞，連看台的啦啦隊都安靜了，這個對決太好看`, `這個對決比追劇還讓人停不下來！第${n}球來了`];
      if (c.full) L.push('滿count啦！心臟要夠大顆，這球真的是賭上全部！', '三壞兩好！連我手心都在冒汗，比等外送還煎熬');
      if (c.loaded) L.push(`滿壘！壓力大到${pn}想喊「我要回家」`, '壘上塞滿人，比尖峰時間的捷運還擠！');
      if (c.risp && c.late) L.push('得點圈有人，這種局面最考驗心臟，根本連續劇最高潮');
      if (c.strikes === 2) L.push(`兩好球了，${pn}準備送${b}回休息區喝茶！`, `${b}要縮短揮棒，不然下一球就要回去喝茶了`);
      if (c.balls === 3) L.push(`三壞球！${pn}再不投進去，教練的白頭髮又要多幾根`);
      if (c.tired) L.push(`${pn}汗如雨下，感覺球越來越重，牛棚的電話是不是要響了？`);
      if (c.last && c.close) L.push('最後關頭，每一球都是一生懸命，站著看的人請坐好！');
      return L;
    },
    strikeLook(c, pt, f) {
      const b = c.b.name, pn = c.p.name; f = f || '這球';
      const L = [`${f}！${b}看傻眼，好球！`, `主審手一舉：「好球！」${b}還在原地思考人生`, `這球壓在邊角，${b}連棒子都沒動，欸欸欸這樣不行啦！`, `好球！${c.strikes}好${c.balls}壞，${pn}今天控球超穩的`, `${b}站著賞景，賞完是好球，主審說謝謝再聯絡`, `角度刁鑽到連${b}都想說聲：讚啦`];
      if (c.strikes === 2) L.push(`兩好球在身，${b}現在壓力山大！`);
      return L;
    },
    strikeSwing(c, pt, f) {
      const b = c.b.name; f = f || '這球';
      const L = [`揮空啦！${f}，${b}這棒是在趕蚊子嗎？`, `咻～揮棒落空！${b}：「欸球呢？」`, `${b}被騙到了，棒子畫出一個漂亮的空氣圈`, `${f}，揮空！${c.strikes}好球，${b}尷尬地笑一下`, `空棒！風都被${b}揮出聲了，球卻不在那`, `${b}這棒揮得很帥，可惜球不領情，揮空啦`];
      if (c.strikes === 2) L.push(`揮空！${b}被逼到角落，快沒退路了！`);
      return L;
    },
    ball(c) {
      const b = c.b.name, pn = c.p.name;
      const L = [`壞球！${b}眼睛超亮，忍住沒揮，${c.balls}壞${c.strikes}好`, `這球偏了，${b}：「想騙我？沒那麼容易啦！」`, `${pn}這球失控，壞球！主審連頭都沒點`, `壞球～${b}選球像在選手搖飲甜度，微糖少冰一絲不苟`, `偏高偏低一點點，壞球！${c.balls}壞${c.strikes}好`];
      if (c.balls === 3) L.push(`三壞了！${pn}再丟壞球，教練的白頭髮要變多了`, `三壞球，${pn}不能再閃了，再閃就變保送啦！`);
      if (c.balls === 3 && c.strikes === 2) L.push('滿count啦！這球看你的了！');
      return L;
    },
    foul(c, high) {
      const b = c.b.name;
      return high ? ['高高的界外飛球，看台觀眾準備搶球啦！', '界外高飛球，球迷已經在比誰的手套大了', '打得好高！可惜是界外，看台那邊先撿到球的人賺到'] :
        [`界外！${b}死纏爛打，像極了追著你要報告的主管`, '界外！差那麼一點點，可惜到不行', `界外球，${b}還活著！繼續黏著投手不放`, `${b}這是在跟投手玩「你丟我就打」嗎？界外！`];
    },
    k(c, b, sw, f) {
      const pn = c.p.name, bn = b.name, end = c.outs + 1 >= 3; f = f || '這球';
      const L = sw ? [`三振！！${bn}被${pn}送回座位，請慢走！`, `揮空三振！${f}，${bn}原地蒸發！`, `K掉！${bn}被三振，${pn}笑得很開心`, `三振出局！${bn}回休息區的背影有點孤單…`] :
        [`看三振！${bn}傻在原地，主審：「好球，三振。」`, `站著不動就三振啦！${bn}今天的棒子是借來的嗎？`, `看著球進來完全沒反應，${bn}這下尷尬了…`, `看三振～！邊角被${pn}吃得死死的，漂亮！`];
      if (c.risp && !end) L.push(`危機解除！${pn}三振化解，這根本是救火隊！`);
      if (end) L.push(`三振終結這局！${pn}笑著走回休息區，爽啦！`);
      return L;
    },
    bb(c, b) {
      const pn = c.p.name, bn = b.name;
      const L = [`四壞球保送！${bn}好整以暇，慢慢走上一壘`, `保送！${pn}的控球像手搖飲的冰塊，突然就不見了`, `四壞球，${bn}選到保送，白吃一個壘包！`, `${bn}有夠有耐心，忍到最後選到保送，比排隊買爆款手搖飲還有毅力`];
      if (c.loaded) L.push(`滿壘還保送！押出一分，${pn}現在心裡一定在喊「不要啊」`);
      return L;
    },
    hbp(c, b) { const pn = c.p.name, bn = b.name; return [`觸身球！${bn}挨了一下，揉揉手臂乖乖上一壘`, `噢！打到了！${bn}痛到皺眉，但還是帥氣走向一壘`, `${pn}：「歹勢歹勢！不是故意的！」觸身球，${bn}上一壘`]; },
    contact(c, pl, area, kind) {
      const r = pl.res || {}, Q = r.Q || .5, b = c.b.name, L = [];
      if (Q > .85) L.push(`「叩！」超清脆！${kind}飛向${area}，這聲音超療癒`, `甜蜜點！${kind}往${area}狂奔，球在天上很忙`, `打得太漂亮了！${kind}直奔${area}！`);
      else if (Q > .6) L.push(`${b}一棒揮出，${kind}朝${area}去了！`, `${kind}往${area}飛，大家的眼睛都跟著球轉！`);
      else if (Q < .3) L.push(`勉強碰到，${kind}軟綿綿飄向${area}…`, `這球像沒吃飽，${kind}晃晃悠悠往${area}`);
      else L.push(`${b}擊出${kind}！方向${area}！`);
      if (r.broken) L.unshift(`斷棒啦！${b}的球棒當場投降，${kind}往${area}去`);
      if (pl.sim && pl.sim.hug) L.push(`球貼著邊線飛，界內還是界外？${area}方向，心臟快跳出來！`);
      if (pl.kind === 'fb' && windy()) L.push(`風這麼大，${kind}飄向${area}，守備員小心被風玩弄！`);
      if (pl.kind === 'fb' && hotDay()) L.push(`大熱天，${kind}飛向${area}，外野手汗流浹背追球中！`);
      return L;
    },
    hr(c, b, pl) {
      const bn = b.name, n = G.on.filter(Boolean).length + 1, d = c.diff + n, bef = c.diff;
      const kind = n === 4 ? '滿貫全壘打' : n === 3 ? '三分砲' : n === 2 ? '兩分砲' : '陽春全壘打';
      const L = [`${bn}一棒送出${kind}！！球直接飛離地球表面！`, `bye bye～！${bn}的${kind}，球已經在去夜市的路上了！`, `太扯了吧！${kind}！球迷全部站起來尖叫，連屋頂都在顫抖！`, `沒在怕的！${bn}這棒超猛，${kind}直接送進看台！`, `全壘打啦！！${bn}今天是不是吃了雞排加珍奶？打得超有力！`, `${kind}～！這球一出去，比賽的劇本直接改寫！`, `轟～！${bn}把球打到外太空，守備員只能目送！`];
      if (n === 4) L.unshift(`滿貫砲！！四分入袋，${bn}一棒定江山，根本神之一手！`, `大滿貫啦～！看台瘋了、我也瘋了！`);
      if (bef < 0 && d > 0) L.unshift(`逆轉！！${bn}翻轉戰局，這劇本連編劇都不敢寫！`);
      else if (bef < 0 && d === 0) L.unshift(`追平啦！${bn}的${kind}把比分扳平，這下好看了！`);
      else if (bef === 0) L.unshift(`${bn}打破僵局，${kind}！全場嗨翻天！`);
      if (c.bot && c.last && bef <= 0 && d > 0) L.unshift(`再見全壘打！！${bn}一棒結束比賽，球迷嗨翻天！`);
      if (G.night) L.push(`${bn}這球直奔夜空，連星星都被嚇到！`);
      if (windy()) L.push(`在這種大風天還能打出去，${bn}的力量連風都擋不住！`);
      if (hotDay()) L.push(`這麼熱的天還能轟出去，${bn}的體力是鐵打的吧！`);
      return L;
    },
    hit(c, b, n, pl, area, nm) {
      const bn = b.name, st = b.st, L = [];
      if (n === 1) L.push(`${area}方向，${nm}！${bn}穩穩上壘，拿穩小確幸`, `落地了！${nm}，${bn}站上一壘，球迷嗨起來！`, `${bn}把球敲進${area}，這支安打超Q的！`, `${nm}！球跑到${area}，守備員只能追著球跑`);
      if (n === 2) L.push(`${area}！二壘安打！${bn}腳底生風，一路衝上二壘！`, `長打來了！${bn}跑得像在趕最後一班公車！`);
      if (n === 3) L.push(`三壘打！！${bn}像在趕最後一班捷運，一路狂奔衝上三壘！`, `${area}！球越滾越遠，${bn}拼了命衝三壘，太拚了吧！`);
      if (c.risp && c.outs < 2) L.push(`得點圈有人，${bn}這支安打超及時，根本及時雨！`);
      if (st && st.h >= 2) L.push(`${bn}今天第${st.h}支安打，手感熱到可以煎蛋了！`);
      if (c.late && c.close) L.push(`關鍵時刻的${nm}，這支安打超值錢！`);
      return L;
    },
    catchOut(c, f, pl) {
      const pos = POS_FULL[f.pos], nm = f.pl.name, deep = pl.dist > 75;
      const L = [`${pos}${nm}穩穩接殺！出局！超穩的啦！`, `接住了！${pos}把球收進手套，一人出局，乾淨俐落！`];
      if (pl.kind === 'fb' && deep) L.push(`這球飛超遠！${pos}退到牆邊硬是接住，帥啦！`);
      if (pl.kind === 'pu') L.push('內野小飛球，小菜一碟，接殺！');
      if (pl.kind === 'ld') L.push(`平飛球！${pos}反應神速，直接接殺！`);
      if (pl.foul) L.unshift(`界外也接得到？${pos}真的有夠拚！`);
      if (pl.kind === 'fb' && windy()) L.push(`風這麼大還能穩穩接住，${pos}根本裝了GPS！`);
      if (c.outs + 1 >= 3) L.push('三出局！攻守交換，去喝口水吧！');
      return L;
    },
    out(c, nm, how, force) {
      const L = force ? [`${nm}差一步！一壘封殺出局，剎那間的距離！`, `傳到一壘了！${nm}出局，只差那麼一點點，可惜啦！`, `${nm}拼命衝，但球比他更快，出局！`] : [`${nm}出局！被觸殺，只能默默走回休息區`, `${nm}被刺殺，這下只好摸摸鼻子回去了`];
      if (c.outs + 1 >= 3) L.push('三出局，攻守交換！休息一下喝口水！');
      return L;
    },
    score(c) {
      const h = G.half, a = G.score[h], o = G.score[1 - h], d = a - o, bef = d - 1, t = battingTeam().short;
      const L = [`得分！！${t}${a}比${o}，跑者一路衝回來，帥氣！`, `回來啦～！${a}比${o}，球迷的尖叫聲差點掀掉屋頂！`, `${a}比${o}，這分拿得超漂亮，加一分是一分！`];
      if (bef < 0 && d === 0) L.unshift(`追平啦！！${a}比${o}平手，比賽重新洗牌，這下精彩了！`);
      else if (bef < 0 && d > 0) L.unshift(`逆轉！！${t}反超，${a}比${o}，全場尖叫聲比媽祖遶境還熱鬧！`);
      else if (bef === 0) L.unshift(`${t}先馳得點！${a}比${o}，先拔頭籌！`);
      else if (d >= 4) L.push(`${t}一路擴大領先，${a}比${o}，對手快撐不住了！`);
      return L;
    },
    halfStart(c) {
      const L = [`${innTxt(c)}，${c.bt.short}進攻！${c.p.name}上投手丘，好戲開鑼！`, `${c.inn}局${c.bot ? '下' : '上'}半開始！大家坐好坐滿，不要眨眼！`];
      if (c.last) L.unshift(`最後一局！${diffTxt(c)}，心臟準備好了嗎？`);
      else if (c.late && c.close) L.unshift(`比賽到後半段了，${diffTxt(c)}，每一球都超關鍵！`);
      return L;
    },
    batter(c, b, idx) {
      const bn = b.name, st = b.st, L = [`第${idx}棒${bn}上場！目前${st.ab}打數${st.h}安打`, `輪到第${idx}棒${bn}，大家為他加油！`];
      if (c.loaded) L.unshift(`滿壘！第${idx}棒${bn}登場，壓力山大但也是英雄時刻！`);
      else if (c.risp && c.outs < 2) L.unshift(`${runnerTxt(c)}，${outsTxt(c)}，${bn}是進攻的好機會！`);
      if (c.hot) L.push(`${bn}手感火燙燙，投手要小心被燙到！`);
      if (c.cold) L.push(`${bn}最近有點低潮，今天要靠這個打席翻身！`);
      if (st.h >= 2) L.push(`${bn}今天已經${st.h}支安打，手感超好的啦！`);
      return L;
    },
    inningEnd(c) {
      const L = [`三出局，攻守交換！比數${G.score[0]}比${G.score[1]}，先喝口水休息一下`];
      if (c.n) L.unshift(`壘上${c.n}個跑者全留壘，${c.bt.short}無功而返，好可惜！`);
      return L;
    }
  };

  /* ---------------- 套到 SAYX（先呼叫原函式、再依機率換句；失敗就用原句） ---------------- */
  const P = { pitchStart: .4, strikeLook: .5, strikeSwing: .5, ball: .5, foul: .5, k: .65, bb: .55, hbp: .65, contact: .4, hr: .75, hit: .6, catchOut: .5, out: .5, score: .6, halfStart: .55, batter: .45, inningEnd: .55 };
  const WXP = { pitchStart: .3, halfStart: .55, batter: .2, inningEnd: .45, strikeLook: .1, ball: .1 };      // 這些時機會「換成」天氣／天象台詞（其餘事件以劇情為主）
  const tagged = t => castA(t);
  const wrap = (name, gen) => {
    const o = SAYX[name]; if (typeof o !== 'function') return;
    SAYX[name] = function () {
      const base = o.apply(this, arguments);      // 一定先照舊呼叫：原本的亂數消耗不變
      try {
        const c = cx();
        if (chance(WXP[name] || 0)) { const wp = weatherPool(c); if (wp.length) { const w = fresh(wp); return tagged(w); } }
        if (!chance(P[name] || .5)) return base;
        const L = gen(c, arguments); if (L && L.length) return tagged(fresh(L));
      } catch (e) { }
      return base;
    };
  };
  wrap('pitchStart', (c, a) => FUN.pitchStart(c, a[0], a[1]));
  wrap('strikeLook', (c, a) => FUN.strikeLook(c, a[0], pitchFlavor(a[0])));
  wrap('strikeSwing', (c, a) => FUN.strikeSwing(c, a[0], pitchFlavor(a[0], true)));
  wrap('ball', c => FUN.ball(c));
  wrap('foul', (c, a) => FUN.foul(c, a[0]));
  wrap('k', (c, a) => FUN.k(c, a[0], a[1], pitchFlavor(a[2])));
  wrap('bb', (c, a) => FUN.bb(c, a[0]));
  wrap('hbp', (c, a) => FUN.hbp(c, a[0]));
  wrap('contact', (c, a) => FUN.contact(c, a[0], areaWord(a[0].plan.x, a[0].plan.z), hitTypeWord(a[0].kind)));
  wrap('hr', (c, a) => FUN.hr(c, a[0], a[1]));
  wrap('hit', (c, a) => FUN.hit(c, a[0], a[1], a[2], areaWord(a[2].plan.x, a[2].plan.z), HIT_NAME[a[1]]));
  wrap('catchOut', (c, a) => FUN.catchOut(c, a[0], a[1]));
  wrap('out', (c, a) => FUN.out(c, a[0], a[1], a[2]));
  wrap('score', c => FUN.score(c));
  wrap('halfStart', c => FUN.halfStart(c));
  wrap('batter', (c, a) => FUN.batter(c, a[0], a[1]));
  wrap('inningEnd', c => FUN.inningEnd(c));

  /* ---------------- 球評（COLOR）：依「球種／球速、球數、壘上、出局、比數、局數、投打狀態、天氣、夜空」組合台詞 ---------------- */
  const ptId = pt => (pt && pt.id) || '', kmh = pt => Math.round((pt && pt.kmh) || 0);
  const PTS = {      // 依球種的專業＋趣味點評（揮空時用）
    ST: ['直球直接擦過球棒上緣，不是打者不努力，是球真的太快了', '直球威力十足，高度又抓得剛剛好，打者揮到天上去了', '直球尾勁很強，球像會自己浮起來一樣，打者的棒子總是慢半拍'],
    SL: ['滑球最後那一下橫向位移，打者的球棒只能追著球尾巴跑', '滑球從外角往外逃，打者揮棒的時候球已經不在那了', '滑球切得很漂亮，打者跟不上，只能對空氣說對不起'],
    CU: ['曲球的落差太大，打者重心整個被帶走，這就是「掉下來」的威力', '曲球慢慢飄、突然掉，打者像被點穴一樣動不了', '大曲球高高拋起再落下，打者等得太久，結果揮早了'],
    FK: ['指叉球最後一刻掉下去，打者以為是好球，結果球在地板上', '指叉球掉得很深，這招專門騙揮棒的人，百發百中'],
    CH: ['變速球讓打者的節奏全亂，身體先出去，手還沒到，這叫提早投降', '變速球慢慢飄進來，打者等到花都謝了，揮棒卻太早'],
    CT: ['卡特球最後切進內角，打者的球棒來不及縮，這球很陰險', '卡特球在最後一刻往內鑽，打者被擠得很難受'],
    SK: ['伸卡球往下沉，打者想把球打起來，結果打在棒子上緣，被壓制了'],
    TS: ['二縫線直球帶位移，打者以為是直球，結果球自己拐了一下'],
    SH: ['內曲球大幅往內切，打者被逼到只能縮手'],
    SV: ['滑曲球斜斜切進來，打者的視線被帶歪了'],
    KN: ['蝴蝶球飄忽不定，連捕手都要賭一把，打者揮空一點都不意外']
  };
  const PTL = {      // 看三振／好球時的球種點評
    ST: ['直球直接壓進好球帶，打者來不及反應，這種球沒辦法怪他'], CU: ['曲球一個大弧度掉進好球帶，打者只能乾瞪眼', '曲球從高高的地方掉下來，剛好壓在好球帶下緣，漂亮'],
    SL: ['滑球從外角劃進好球帶邊緣，打者以為會偏，結果主審說好球'], FK: ['指叉球掉進好球帶，打者一點都沒有出棒的意思，太傻眼'], CH: ['變速球慢吞吞飄進來，打者看得太久，結果是好球']
  };
  function speedLine(pt) { const k = kmh(pt); if (k >= 158) return ['這球速已經是國際等級的速度，打者要反應真的很難']; if (k >= 150) return ['球速超過150公里，打者的反應時間只剩零點幾秒，很難抓時機']; if (k && k <= 118 && ptId(pt) !== 'KN') return [`球速只有${k}公里，但打者就是揮不到，這就是變速的藝術`, '慢球最怕打者等得住，可是這位打者好像沒等住']; return []; }
  const place = pl => { try { return areaWord(pl.plan.x, pl.plan.z); } catch (e) { return ''; } };
  const hitKind = pl => { try { return hitTypeWord(pl.kind); } catch (e) { return ''; } };
  const nm = x => (x && x.name) || '打者';

  /* 局面通用點評（比數／局數／壘上／出局／球數／投打狀態） */
  function sitPool(c) {
    const L = [], b = c.b, p = c.p, lead = c.diff, T = c.bt.short, F = c.ft.short;
    if (c.tied && c.late) L.push('同分又進入後半段，一分就是勝負，每個決定都要很謹慎', '雙方平手到現在，誰先失誤誰就吃虧，這種比賽最耗心力');
    if (lead >= 4) L.push(`${T}領先${lead}分，這時候最怕鬆懈，翻盤都是從大意開始的`, `${F}落後${lead}分，要追不是不可能，要先把氣勢追回來`);
    else if (lead <= -4) L.push(`${T}落後${-lead}分，追分要一分一分來，千萬別一次想全拿`, `${F}領先${-lead}分，守備要穩，不要讓對手一波就追回來`);
    else if (lead === 1 && c.late) L.push(`${T}只領先一分，這種比數隨便一支安打都可能翻盤，投手壓力很大`);
    else if (lead === -1 && c.late) L.push(`${T}只落後一分，一支安打就有機會追平，打者不要想太多`);
    if (c.last && c.bot && lead < 0) L.push('最後一次進攻機會，能不能逆轉全看這一局，球迷的心都揪在一起');
    if (c.last && !c.bot && lead >= 0) L.push('最後一局，守備方要穩住，打者要知道球隊的狀況');
    if (c.loaded) L.push('滿壘最怕保送，一不小心就押出分數，投手必須敢投進好球帶', '滿壘的局面，守備要先想好球打到哪裡要傳哪裡，不能慌');
    else if (c.risp && c.outs === 2) L.push('兩出局得點圈有人，這是壓力最大的局面，打者要有「這球我來解決」的氣魄', '兩出局還有人在得點圈，投手只要拿下這個打者就化險為夷');
    else if (c.risp) L.push('得點圈有人，投手要特別小心別投到打者喜歡的位置');
    if (c.n >= 1 && c.outs === 0) L.push('無人出局壘上有人，送個短打或強攻都是選項，要看教練的戰術', '無人出局先上壘的跑者，這是擴大戰果的好機會');
    if (c.n >= 1 && c.outs === 1 && c.on[0]) L.push('一出局一壘有人，要小心雙殺打，打者最好把球打高一點');
    if (c.full) L.push('滿count的局面，投手跟打者都沒退路，這是勇氣的對決', '三壞兩好，投手要進好球帶，打者要等好球，這一球的心理戰超有看頭');
    else if (c.strikes === 2) L.push('兩好球之後，打者要縮短揮棒保護好球帶，投手則可以放手配球');
    else if (c.balls === 3) L.push('三壞球的時候，投手只能投進好球帶，打者可以用等待來取得優勢');
    if (c.tired) L.push(`${p.name}體力開始下滑，球的位置越來越高，牛棚該準備了`, `${p.name}汗流浹背，投球節奏越來越慢，教練團一定在觀察`);
    if (c.hot) L.push(`${nm(b)}今天手感很熱，這種打者投手要小心別給他喜歡的球`);
    if (c.cold) L.push(`${nm(b)}這陣子手感不太好，今天的打席要靠耐心找回自信`);
    if (b.st && b.st.h >= 2) L.push(`${nm(b)}今天已經${b.st.h}支安打了，投手再投直球就真的太天真`);
    if (b.st && b.st.ab >= 3 && b.st.h === 0) L.push(`${nm(b)}今天${b.st.ab}個打數都還沒安打，這個打席很想翻身`);
    return L;
  }

  /* 天氣／夜空觀察點評（球評角度：談對比賽的影響，不像主播只描述景色） */
  const CWX = {
    dome: ['大巨蛋不受風雨影響，球的飛行就是純粹的球技較量，沒有藉口', '室內球場沒有風，守備員看高飛球比較沒有負擔，失誤要自己負責'],
    sunny: ['大太陽下外野手看高飛球要靠帽沿和墨鏡，球被陽光吃掉的機率會增加', '陽光太強的時候，外野手追高飛球會瞇眼，起步有時候會慢一拍'],
    scorch: ['這種高溫，投手手上的汗會讓球變滑，擦汗的頻率要提高', '赤熱炎日，體力流失速度是平常的兩倍，後段投手的狀況要特別注意', '高溫天空氣稀薄，球會飛得比較遠，投手投高了就是被打出去'],
    hot: ['悶熱的天氣，投手的體力消耗特別快，控球容易越來越飄', '濕度太高，球員流的汗特別多，這種天氣補水真的很重要'],
    breeze: ['微風不大，但高飛球的落點還是會被微微帶偏，外野手要看球的轉向', '小風有時候最難判斷，球在空中偷偷偏一點，野手的起步就不一樣'],
    gale: ['風這麼大，高飛球落點很難判斷，外野手起步要保守一點，先退再追比較安全', '順風投手要把球壓低，逆風打者要把球打高，這就是風的學問', '這個風向，往外野的飛球會被風影響很大，今天高飛球都要特別小心'],
    calm: ['天氣穩定沒有風，球路和球的飛行軌跡都很單純，今天沒有藉口'],
    overcast: ['陰天光線均勻，外野手看球比較沒有負擔，但天空顏色跟球一樣，有時候也會看不清'],
    drizzle: ['毛毛雨雖然小，但球會開始有點濕，投手握球的觸感跟平常不一樣', '場地開始有點濕，滾地球的速度會稍微變慢，內野手要多注意'],
    rain: ['下雨天場地濕滑，內野手傳球要小心，滾地球速度變慢、路線也變怪', '雨天打者可以多打滾地球，因為野手傳球容易手滑出錯', '雨一直下，球的縫線變滑，投手變化球很難控制'],
    heavy: ['雨這麼大，球很濕很滑，投手投球一定很吃力，控球會受到很大影響', '大雨中球員視線很差，外野手的高飛球判斷更難，場地積水也要注意'],
    storm: ['暴雨這種天氣，球根本握不住，打者揮棒圈也縮小，說實在是比賽進行的極限', '雨量這麼大，隨時可能暫停比賽，雙方都要做好心理準備'],
    plum: ['梅雨季的濕氣很重，球棒和球都濕濕的，打擊的手感會跟平常不一樣', '梅雨天又濕又黏，球員的手容易滑，控球和守備都會受影響'],
    thunder: ['雷雨的天氣隨時可能暫停比賽，現在的每一球都有可能是最後一球再開打', '有打雷的狀況，球場的安全最重要，裁判團一定很關注雲層變化'],
    typhoon: ['颱風外圍環流風雨交加，球的飛行軌跡很難預測，投手和野手都要多一分小心', '風雨一陣一陣的，這種天氣打球很考驗臨場判斷，每個人都在拼'],
    monsoon: ['東北季風又濕又冷，球員的手容易僵，傳球和接球都要多留意', '季風吹得又穩又涼，投手手指容易冷，球路不好控制'],
    haze: ['空氣有霾，高飛球的視線被影響，外野手比較不容易看清楚球的落點', '空氣品質不好，球員吸太多容易累，長時間比賽的體力都會被影響']
  };
  const CNIGHT = {
    starry: ['夜空這麼乾淨，外野手看高飛球反而更不被干擾，守備要更準', '星星都出來了，天氣穩定，今天晚上球的飛行會很單純'],
    moon: ['月亮高掛，球場燈光加上月光，高飛球其實更好追', '有月光的夜晚，外野手的視野很不錯，守備方可以放膽追球'],
    aurora: ['極光雖然美，但外野手千萬別抬頭看，球來了要專心追', '這種夜空球員偷看一眼我完全理解，但要記得專心看球'],
    meteor: ['流星雨來了，球員們要專心，不要抬頭許願，球會砸到頭的', '有人看流星看到分心，這種情況最怕守備失誤']
  };
  const CNIGHTRAIN = ['夜間下雨，燈光下雨絲很漂亮，但球員視線更差，高飛球更不好判斷', '夜裡下雨路面反光，外野手追球更吃力，傳球時也要提防濕滑', '夜間雨天燈塔的光被雨絲打散，球的軌跡很難跟，守備的壓力更大', '夜裡下雨氣溫更低，投手的手容易冷，球路不好控制'];
  const CNIGHTTHUNDER = ['夜間雷雨，閃電一亮球場像白天一樣，球員要小心不要被閃光干擾', '雷聲跟閃電在夜裡特別震撼，裁判團一定緊盯雲層，隨時可能暫停'];
  function wxColorPool(c) {
    const st = wxState(), L = []; if (!st) return L;
    const rainy = ['drizzle', 'rain', 'heavy', 'storm', 'plum', 'thunder', 'typhoon'].includes(st);
    if (CWX[st]) L.push(...CWX[st]);
    if (G.night && st !== 'dome') {
      if (rainy) { L.push(...CNIGHTRAIN); if (st === 'thunder' || st === 'storm' || st === 'typhoon') L.push(...CNIGHTTHUNDER); }
      else { const sk = skyKind(); if (sk && CNIGHT[sk]) L.push(...CNIGHT[sk]); }
    }
    return L;
  }

  /* 各事件專屬點評 */
  const CF = {
    pitch(c, a) {
      const pt = a[0], kind = a[1], L = [], t = ptId(pt);
      if (kind === 'strikeSwing') { L.push(...(PTS[t] || []), ...(PTS[t] || []), '配球很有學問，前面先建立印象，後面再用變化球收尾，投手很會玩', '打者被唬得一愣一愣，這種球真的很難抓', '這球轉彎轉得太兇，眼睛追得上，手追不上'); L.push(...speedLine(pt)); if (c.strikes === 2) L.push('兩好球還揮空，打者的心理已經被投手壓著走了'); }
      if (kind === 'strikeLook') { L.push(...(PTL[t] || []), ...(PTL[t] || []), '邊角壓得剛剛好，打者要出棒真的很難，只能說投手太狠', '好球帶邊緣跳舞，主審手一舉誰也沒意見', '這球看起來好像偏，其實壓邊角壓得剛剛好，投手控球一流'); L.push(...speedLine(pt)); if (c.strikes === 2) L.push('兩好球還不出棒，這是賭一把，賭輸了就是三振'); }
      if (kind === 'ball') L.push('打者很沉得住氣，選球眼不是隨便看看就有的', '這球差一點點，打者的眼睛是尺嗎？', '壞球就是壞球，打者不理它就對了，這叫好球帶紀律', c.balls === 3 ? '球數對投手越來越不利，下一球要穩穩投進去' : '投手要穩住節奏，別被打者的選球牽著鼻子走', '投手想誘使打者揮棒，可惜打者沒上當');
      if (kind === 'foul') L.push('界外代表時機快對上了，下一球要小心囉', '打者一直在微調，下一球說不定就是安打', '這個界外球很可惜，如果再早一點點就是安打了', '打者看起來越來越習慣投手的球路，投手要想新招了');
      return L;
    },
    k(c, a) {
      const b = a[0], pt = a[1], sw = a[2], p = c.p, L = [`${p.name}今天狀況很好，球威穩，這種投手最難打`, '這就是壓制力，投手把打者研究得很透', '變化球和速球搭配得剛剛好，簡直像在點菜，打者想吃都吃不到', '這個三振乾淨俐落，沒有一點拖泥帶水，給投手拍手'];
      if (sw) L.push(...(PTS[ptId(pt)] || []));
      else L.push(`${nm(b)}站著吃三振很可惜，好球帶邊角還是要出棒保護`, '看三振最傷士氣，打者回休息區的路特別長', '被站著三振的打者，這個打席大概要回去反省一下');
      L.push(...speedLine(pt));
      if (c.risp) L.push('得點圈有人還能三振打者，這就是王牌的氣勢', '關鍵時刻拿下三振，這種投手教練最愛');
      if (c.outs + 1 >= 3) L.push('用三振結束這局，等於是把氣勢帶回自己的休息區');
      return L;
    },
    bb(c, a) {
      const b = a[0], p = c.p, L = [`${nm(b)}選球眼很好，有些球差一點點就沒揮，這就是紀律`, '有時候保送不是壞事，避開強打者也是策略', '這個保送其實有點可惜，投手要把心情調整回來'];
      if (c.loaded) L.push('滿壘還保送，這種壓力下很難再控制得很準，投手要趕快調整心態', '押出一分實在太可惜，這是投手最不想看到的結果');
      if (c.tired) L.push(`${p.name}體力已經下降，教練團該考慮換投手了`, `${p.name}控球越來越飄，保送接二連三，牛棚應該要熱身了`);
      if (c.n === 0) L.push('壘上無人就保送，等於免費送對手一個進攻機會，這是投手最大的錯誤');
      return L;
    },
    hit(c, a) {
      const b = a[0], n = a[1], pl = a[2], r = pl.res || {}, ar = place(pl), kd = hitKind(pl), L = [];
      if ((r.Q || 0) > .85) L.push(`這顆球打在甜蜜點，${nm(b)}完全抓準時機，沒有給投手任何機會`, `${nm(b)}這個打擊太紮實，球速、角度都剛好，我只能說漂亮`);
      if ((r.inside || 0) > .35) L.push(`內角球還能打成安打，${nm(b)}的手腕處理得非常好`); else if ((r.inside || 0) < -.35) L.push('外角球推向反方向，這種打法很聰明，也很有紀律');
      if (pl.badHop) L.push('這顆球彈起來的角度很怪，野手真的很倒楣', '球落地的反彈很不規則，這是運氣也是實力的一部分');
      if (ar) L.push(`球打向${ar}，這個方向守備位置站得有點空，被打中了`, `打者把球推向${ar}，方向感很好，這就是打擊的技術`);
      if (pl.kind === 'gb') L.push('滾地球剛好穿過野手之間，這個空檔抓得好準', '這球速度很快，野手只能乾瞪眼，要怪就怪球太刁');
      if (pl.kind === 'ld') L.push('平飛球速度太快，野手沒有反應空間，這是打者的功力');
      if (pl.kind === 'fb') L.push('高飛球落在野手之間的空檔，不一定要很用力，位置對就是安打');
      if (n >= 2) L.push(`${nm(b)}腳程很快，守備方只能看著他多推一個壘包`, '長打對投手最傷，一個失投就讓打者站上得點圈');
      if (c.risp) L.push('有跑者在得點圈，這支安打可能讓比賽出現關鍵變化', '得點圈的安打最值錢，這就是為什麼大家都愛這種打者');
      if (c.late && c.close) L.push('這種時間點的安打，意義比一般的安打大很多');
      if (b.st && b.st.h >= 2) L.push(`${nm(b)}今天第${b.st.h}支安打，投手應該已經在想怎麼對付他了`);
      if (c.hot) L.push(`${nm(b)}手感正熱，這支安打一點都不意外`);
      return L;
    },
    hr(c, a) {
      const b = a[0], pl = a[1], d = Math.round(pl.dist || 0), L = [`${nm(b)}的爆發力在球場上很少見，這一擊改變了整場比賽`, '這種打擊聲，一聽就知道是全壘打，甜蜜點的聲音不會騙人', '投手的球偏高了一點，被打者抓得死死的，這就是高飛球轟出去的結果'];
      if (d >= 120) L.push(`${d}公尺！這球已經飛離球場，應該要在外面撿球了`, '這種距離，不是靠力量就能打出來，要有完美的時機和角度');
      else if (d >= 100) L.push(`${d}公尺，這球的飛行軌跡很漂亮，根本沒有擔心過會不會出去`);
      else L.push(`${d}公尺，剛好過牆，這是靠技巧而不是靠蠻力的全壘打`);
      const n = G.on.filter(Boolean).length + 1; if (n >= 3) L.push('多分砲對士氣的影響非常大，對手投手現在心裡一定很難受');
      if (c.diff < 0 && c.diff + n > 0) L.push('這是逆轉的一擊，對球隊的士氣是最大的鼓舞，隊友在休息區一定都跳起來了');
      if (c.late && c.close) L.push('這種時間點的全壘打，可能就是整場比賽的決勝點');
      if (windy()) L.push('今天有風，但這球力量大到風都擋不住');
      if (hotDay()) L.push('高溫下空氣比較稀薄，球本來就會飛得比較遠，加上打者的力量，球當然飛出去');
      if (G.night) L.push('夜空下的全壘打特別好看，球在燈光裡飛，超有畫面', '夜間比賽的全壘打，球飛進黑夜裡的感覺真的不一樣');
      return L;
    },
    out(c, a) {
      const kind = a[0], f = a[1], pl = a[2], L = [], pos = f && POS_FULL[f.pos];
      if (kind === 'fly') L.push('外野手的判斷很準，起步很快，路線也很漂亮', '這種高飛球要先站好位置再等球落下，很標準的處理', '野手追球前先看風向，這是經驗的差別');
      if (kind === 'gb') L.push('內野手腳步很到位，傳球也穩，穩穩的啦', '雙殺的機會就在這種滾地球上，內野要保持專注', '滾地球處理得乾淨，連一個多餘的動作都沒有');
      if (pos) L.push(`${pos}今天的守備很穩，這種球處理得這麼自然就是功夫`);
      if (pl && pl.great) L.push('這是非常精彩的守備，絕對是今天的亮點', '這種守備是會被拿來回放的，太帥了');
      if (c.risp) L.push('得點圈有人的時候還能拿下出局數，守備方的心臟真的很大顆');
      if (c.outs + 1 >= 3) L.push('結束這局的守備，球隊的氣勢又回來了');
      if (windy() && kind === 'fly') L.push('這種風勢下還能判斷準確，外野手的功力不是蓋的');
      return L;
    },
    score(c) {
      const h = G.half, a = G.score[h], o = G.score[1 - h], d = a - o, L = [];
      if (d === 0) L.push('比賽重新回到同一個起跑線，接下來的每一球都很關鍵', '這分追得很重要，對士氣是很大的鼓舞', '同分了，接下來比賽的走向完全看誰先穩住');
      else if (d > 0) L.push('這分攻下來，把比賽的主導權抓在手上了', '拿到這分，球隊的心理負擔輕了很多，打者可以打得更放鬆', `${c.bt.short}現在掌握主導權，後面要的是穩定`);
      else L.push('雖然還落後，但這分讓大家看到了反攻的機會', '把分追回來，氣勢一下就不一樣，守備方要小心被反撲');
      if (c.late) L.push('這個時間點的得分格外重要，剩下的局數不多了');
      if (d >= 4) L.push('領先幅度拉大，對手要追的壓力越來越大');
      return L;
    },
    inning(c) {
      const L = ['投手狀況不錯，接下來關鍵是控球要穩', '比賽才剛開始，一切都還有可能', `${c.p.name}這局的投球內容會是關鍵，球速和控球都要觀察`];
      if (c.last && c.close) L.push('最後一局，每一個決策都會影響結果，教練席壓力非常大');
      if (c.late && c.diff >= 3) L.push('這個比數，領先的球隊只要穩住守備就能把勝利守住');
      if (c.tied) L.push('比數持平，這局誰先得分，對氣勢的影響很大');
      if (c.p.fatigue > 60) L.push(`${c.p.name}已經投了不少球，體力是一個要注意的地方`);
      return L;
    },
    batter(c, a) {
      const b = a[0], st = b.st || {}, L = [];
      if (c.hot) L.push(`${nm(b)}最近手感很熱，投手要小心別給他喜歡的球`);
      if (c.cold) L.push(`${nm(b)}這陣子狀況起伏，今天這打席要靠耐心找回節奏`);
      if (st.h >= 2) L.push(`${nm(b)}今天已經打出${st.h}支安打，感覺投手對他沒什麼辦法`);
      if (st.ab >= 3 && st.h === 0) L.push(`${nm(b)}前面幾個打席都沒打出安打，這打席要想辦法翻身`);
      L.push(`${nm(b)}上場，這個打席要看他能不能把握機會`, `${nm(b)}站進打擊區，這個時候投手和打者的心理戰要開始了`);
      return L;
    },
    hbp(c, a) { const b = a[0]; return [`觸身球很危險，投手要注意內角的控制，打者受傷就不好了`, `${nm(b)}被打到，雖然會痛，但上一壘也算是一種收穫`, '內角球失控造成觸身，投手要趕快調整，不然後面打者也會很緊張']; },
    inningEnd(c) { const L = [`攻守交換，${c.bt.short}回到休息區要檢討一下這局的打擊`, '這一局的攻守告一段落，雙方教練在休息區都要調整策略']; if (c.n) L.push(`壘上留了${c.n}個人，這是最可惜的結果，下局要把握機會`); if (c.tied) L.push('比數還是持平，每一個半局都是關鍵'); return L; }
  };
  const PC = { pitch: .75, k: .8, bb: .75, hit: .8, hr: .85, out: .7, score: .7, inning: .8 };
  const wrapC = (name) => {
    const o = COLOR[name]; if (typeof o !== 'function' || !CF[name]) return;
    COLOR[name] = function () {
      const base = o.apply(this, arguments);      // 先照舊呼叫（亂數消耗不變）
      try {
        if (!chance(PC[name] || .7)) return base;
        const c = cx(), L = CF[name](c, arguments).slice(), sp = sitPool(c), wp = wxColorPool(c);
        const pool = [...L, ...L];      // 事件專屬點評權重最高
        if (sp.length && chance(.55)) pool.push(...sp);
        if (wp.length && chance(.38)) pool.push(...wp, ...wp);      // 約三到四成會談天氣／夜空對比賽的影響
        if (pool.length) return castB(fresh(pool));
      } catch (e) { }
      return base;
    };
  };
  ['pitch', 'k', 'bb', 'hit', 'hr', 'out', 'score', 'inning'].forEach(wrapC);

  /* 原本沒有球評的時機（打者登場／觸身球／半局結束／投球前）：主播講完後再補一句球評 */
  const coloredAfter = (name, key, prob, delay) => {
    const o = SAYX[name]; if (typeof o !== 'function') return;
    SAYX[name] = function () {
      const base = o.apply(this, arguments);
      try {
        if (typeof G === 'undefined' || G.mode !== 'play' || G.over || !chance(prob)) return base;
        const c = cx(), L = CF[key](c, arguments).slice(), sp = sitPool(c), wp = wxColorPool(c), pool = [...L];
        if (sp.length) pool.push(...sp); if (wp.length && chance(.4)) pool.push(...wp);
        const line = castB(fresh(pool)), args = arguments;
        after(.05, () => { try { colorSay(line, delay); } catch (e) { } });      // 延後一瞬間才註冊，避免被接下來的主播 say() 清掉
      } catch (e) { }
      return base;
    };
  };
  coloredAfter('batter', 'batter', .3, 2.2);
  coloredAfter('hbp', 'hbp', .6, 1.8);
  coloredAfter('inningEnd', 'inningEnd', .4, 2.4);

  /* ---------------- 天氣情境轉換／夜空天象出現時的播報：改成台灣味版本（每次都抽不同說法） ---------------- */
  const WXTALK = {
    thick: { d: ['☁️ 雲層越來越厚，天色暗下來了，看起來要變天囉', '☁️ 烏雲罩頂，天空灰濛濛，球迷是不是該把雨衣拿出來了？'], n: ['☁️ 雲層變厚，星星月亮都躲起來了，今晚沒得看囉', '☁️ 雲跑出來搶鏡了，夜空瞬間黯淡，剛剛那片星海不見了'] },
    clear: { d: ['🌤 雲散了，太陽公公出來上班啦，天氣轉好！', '🌤 雲層散開，陽光灑下來，心情一下子好起來！'], n: ['🌌 雲散了，星星月亮出來打卡，天氣轉好！', '🌌 雲層散開，夜空重新亮起來，剛剛躲起來的星星都回來了'] },
    sunny: { d: ['☀️ 天空放晴，陽光灑滿球場，這就是標準的棒球天氣！', '☀️ 雨停了，太陽出來啦！球場一下子亮晶晶'], n: ['🌙 天空放晴，月光與燈光灑滿球場，氣氛超棒！', '🌙 天氣放晴，涼風徐徐，今晚的球場好舒服'] },
    rain: { d: ['🌦 烏雲壓境，雨點嘩啦嘩啦落下，場地開始濕滑了', '🌦 老天爺說下就下，雨來了！球員趕快把帽子壓低'], n: ['🌦 雨說來就來，夜裡的雨絲在燈光裡閃閃發亮，但場地開始濕了', '🌦 烏雲壓境，雨點落下，夜間球場瞬間變成雨中決戰'] },
    ease: { d: ['🌥 雨勢漸漸減弱，天空慢慢轉亮，老天爺手下留情了', '🌥 雨小了，天色轉亮，球迷終於可以鬆口氣'], n: ['🌥 雨漸漸變小，雲層慢慢散開，夜空要回來了', '🌥 雨勢減弱，夜裡的空氣特別清新，比賽快要回復原本的節奏'] }
  };
  WXTALK.thunderBig = { d: ['⚡ <em>轟隆！</em>一道巨大的閃電劃破天際，雷聲震耳欲聾，全場都嚇一跳！', '⚡ <em>轟～！</em>閃電打下來，雷聲大到球場都在震，球迷尖叫！'], n: ['⚡ <em>轟隆！</em>一道巨大的閃電把夜空劈亮，整個球場亮如白晝，雷聲震耳欲聾！', '⚡ <em>轟～！</em>夜裡閃電劈下來，燈塔都跟著抖，球迷嚇到一起尖叫！'] };
  WXTALK.thunderFar = { d: ['⚡ 遠方傳來陣陣雷聲…老天爺在敲鼓了', '⚡ 悶悶的雷聲從遠方滾過來，要變天了嗎？'], n: ['⚡ 夜空遠方悶雷滾滾，隱約有閃光，今晚不太平靜…', '⚡ 遠處傳來隆隆雷聲，夜裡聽起來特別有壓迫感'] };
  window.wxTalk = k => { try { const t = WXTALK[k]; if (!t) return null; return castA(fresh(t[G.night ? 'n' : 'd'])); } catch (e) { return null; } };

  const TWV = {
    plum: ['🌫 梅雨鋒面滯留，空氣濕黏黏，細雨綿綿下不停，衣服永遠曬不乾…', '🌫 又是梅雨季，濕度爆表，連球棒握起來都滑滑的！'],
    thunder: ['⛈ 午後雷陣雨來了！雲堆得好高，雷聲轟隆隆，比前任還不給人心理準備！', '⛈ 午後對流旺盛，雷雨說來就來，全場觀眾抬頭看天，大家小心！'],
    typhoon: ['🌀 颱風外圍環流接近，風雨一陣一陣越來越強，這場球打得像在颱風天出勤！', '🌀 外圍環流到了！風雨交加，球迷和球員都很拚，大家小心安全！'],
    hot: ['🥵 悶熱難耐，空氣黏黏的，球員汗如雨下（投手體力消耗加快）', '🥵 悶到不行！整個人像泡在蒸籠裡，投手手心全是汗（體力消耗加快）'],
    haze: ['😷 空氣霾霾的，遠方被蒙上一層灰，高飛球更難看清楚了', '😷 空氣品質轉差，口罩請戴好，外野手也瞇起眼睛努力追球'],
    monsoon: ['🌬 東北季風增強，風勢穩定又濕冷，偶爾還有細雨，這就是台灣的冬天', '🌬 東北季風報到！風涼涼濕濕的，球員的手都有點僵了'],
    breeze: ['🍃 微風輕拂，樹葉沙沙響，落葉隨風飄過球場，好有氣氛', '🍃 涼涼的微風吹過來，幾片落葉在場邊打轉，這種天氣打球最舒服'],
    gale: ['💨 風勢驟強！旗幟獵獵作響，落葉沙塵四處亂飛，高飛球很難控制！', '💨 強風來襲！帽子要抓好，不然會被吹到外太空，高飛球更難判斷！'],
    scorch: ['🔥 赤日炎炎，地表熱浪翻騰，球員汗如雨下（投手體力消耗大增、飛球因空氣稀薄飛得更遠）', '🔥 太陽毒辣辣，球場像個大烤盤，補水千萬別忘！（投手體力消耗大增、飛球飛得更遠）']
  };
  const TWVN = {
    plum: ['🌫 夜裡的梅雨鋒面滯留，細雨綿綿又濕又黏，燈光下全是雨絲…'],
    thunder: ['⛈ 夜間雷雨來了！天空突然閃光，雷聲轟隆隆，大家小心安全！', '⛈ 夜裡對流旺盛，雷陣雨說來就來，閃電把夜空劈亮，球迷抬頭驚呼！'],
    typhoon: ['🌀 颱風外圍環流在夜裡逼近，風雨交加燈塔都在搖，大家注意安全！'],
    gale: ['💨 夜裡風勢驟強！旗幟被吹得啪啪響，落葉沙塵在燈光下亂飛，高飛球更難判斷！'],
    haze: ['😷 夜裡的空氣霾霾的，燈光被一層薄霧罩住，高飛球更難看清']
  };
  try { for (const k in TWV) Object.defineProperty(TW_MSG, k, { get() { return castA(fresh(G.night && TWVN[k] ? TWVN[k] : TWV[k])); }, configurable: true, enumerable: true }); } catch (e) { }
  try { const _t = TW_LBL.thunder; Object.defineProperty(TW_LBL, 'thunder', { get() { return [G.night ? '夜間雷陣雨' : _t[0], _t[1]]; }, configurable: true, enumerable: true }); } catch (e) { }

  const NSV = {
    starry: ['✨ 雲散天開，夜空繁星點點、銀河隱約可見，星光灑滿球場，浪漫指數破表！', '✨ 抬頭一看，滿天星星！銀河都出來了，這夜空美到不真實！'],
    moon: ['🌕 明月高掛，皎潔月光和球場燈光交織在一起，氣氛直接拉滿！', '🌕 今晚月色很美，球打得也很美，這種夜晚根本是人生享受！'],
    aurora: ['🌌 天邊竟然出現綠紫色的極光！台灣球場看極光，這是什麼神展開！全場抬頭驚呼！', '🌌 極光！！全場觀眾都抬頭拍照，球員也偷瞄一下，這畫面要洗版了！'],
    meteor: ['🌠 流星雨開始了！夜空中一道道流星劃過，快許願，希望我的球隊全勝！', '🌠 流星雨來囉！邊看球邊許願，今晚的願望清單可以排滿了！']
  };
  try { for (const k in NSV) Object.defineProperty(NSKY_MSG, k, { get() { return castA(fresh(NSV[k])); }, configurable: true, enumerable: true }); } catch (e) { }

  /* ---------------- 單顆流星／彩虹等小插曲 ---------------- */
  window.wxMeteorLine = () => castA(fresh(['🌠 一顆流星劃過夜空…快許願！', '🌠 咻！天上有流星，我已經許願了，希望球隊連勝！', '🌠 流星一閃而過，球迷同時「哇」了一聲']));
})();
