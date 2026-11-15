'use strict';
/* 13z-runner-tracker.js ｜ 壘包計算版上的「跑者即時位置」
   球打出去後，左邊（甲子園版面的 #koDia，或一般版面的 #dia）壘包菱形上，每位跑者各有一個紅點，
   沿著壘間路線即時移動：站在壘上＝停在壘包上（有離壘就微微往前）、跑向下一壘＝從原壘拖出一條紅色進度線，點跟著跑，
   回壘（折返）時反方向移動；打者跑向一壘用橘色點。回到本壘得分、或被封殺／觸殺的跑者自動消失。
   區網對戰：對方撿球畫面拉近時，進攻方靠這個就能隨時知道每位跑者跑到哪裡（只讀取 E.runners，不影響比賽、不需要同步）。
   位置全部量測畫面上實際的壘包元素（不寫死座標），所以不同畫面比例／甲子園版型都對得上。
   關閉：localStorage cpbl2027.runhud=0。依賴：04 的 G／E、05 的跑者資料（r.from／r.to／r.s／r.dir／r.state／r.lead／r.bat）。 */
const RUNHUD = (function () {
  let enabled = true; try { enabled = localStorage.getItem('cpbl2027.runhud') !== '0'; } catch (e) { }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.id = 'runHud'; svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:46;display:none;overflow:visible';
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<radialGradient id="rhG" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ff7a7a"/><stop offset="1" stop-color="#d4141c"/></radialGradient>' +
    '<radialGradient id="rhB" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ffc060"/><stop offset="1" stop-color="#e07000"/></radialGradient>';
  svg.appendChild(defs); document.body.appendChild(svg);
  const items = new Map();      // runner → { g, line, dot, ring }
  function mk() {
    const g = document.createElementNS(NS, 'g'), line = document.createElementNS(NS, 'line'), ring = document.createElementNS(NS, 'circle'), dot = document.createElementNS(NS, 'circle');
    line.setAttribute('stroke-linecap', 'round'); ring.setAttribute('fill', 'none'); dot.setAttribute('stroke', '#fff');
    g.appendChild(line); g.appendChild(ring); g.appendChild(dot); svg.appendChild(g); return { g, line, ring, dot };
  }
  const baseEls = () => {      // 取得 本壘／一壘／二壘／三壘 四個壘包元素的畫面中心點（甲子園版：#koDia 內的 .bs；一般版：#b*）
    const ko = document.getElementById('koDia');
    if (ko && ko.offsetWidth > 0 && document.body.classList.contains('ko')) {
      const bs = ko.querySelectorAll('.bs'); if (bs.length >= 4) return { home: bs[3], b1: bs[1], b2: bs[0], b3: bs[2], host: ko };
    }
    const d = document.getElementById('dia'); if (d && d.offsetWidth > 0) return { home: document.getElementById('bh'), b1: document.getElementById('b1'), b2: document.getElementById('b2'), b3: document.getElementById('b3'), host: d };
    return null;
  };
  const ctr = e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  let last = 0, geo = null, geoT = -1e9, shown = false;      // 效能：最多每 50ms 更新一次（約 20 次／秒）、壘包位置每 0.4 秒才重新量測一次，沒有跑者時幾乎不花時間
  const hideAll = () => { if (shown) { svg.style.display = 'none'; shown = false; } };
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 50) return; last = now;
    try {
      if (!enabled || typeof G === 'undefined' || typeof E === 'undefined' || !G || G.mode !== 'play' || !E.runners) { hideAll(); return; }
      if (!E.runners.some(r => r && (r.state === 'run' || (r.state === 'on' && r.from >= 1)))) { hideAll(); for (const [r, it] of items) { it.g.remove(); items.delete(r); } return; }
      if (!geo || now - geoT > 400) {
        const hud = document.getElementById('hud'), B = baseEls(); if ((hud && hud.classList.contains('hide')) || !B) { hideAll(); return; }
        const hr0 = B.host.getBoundingClientRect(); geo = { hr: { width: hr0.width }, P: [ctr(B.home), ctr(B.b1), ctr(B.b2), ctr(B.b3), ctr(B.home)] }; geoT = now;      // 索引 0..4（4＝回到本壘）
      }
      const hr = geo.hr, P = geo.P;
      const rad = Math.max(4.2, Math.min(8, hr.width * .068)), live = new Set(); let any = false;
      for (const r of E.runners) {
        if (!r || (r.state !== 'on' && r.state !== 'run') || !(r.from >= 0 && r.from <= 3)) continue;
        if (r.state === 'on' && r.from < 1) continue;
        const a = P[r.from], to = r.state === 'run' ? Math.max(1, Math.min(4, r.to)) : Math.min(4, r.from + 1), b = P[to];
        let s = r.state === 'run' ? Math.max(0, Math.min(1, r.s || 0)) : Math.max(0, Math.min(.5, (r.lead || 0) / (typeof BASE_LEN !== 'undefined' ? BASE_LEN : 20)));
        const x = a[0] + (b[0] - a[0]) * s, y = a[1] + (b[1] - a[1]) * s, it = items.get(r) || (items.set(r, mk()), items.get(r)); live.add(r); any = true;
        const bat = !!r.bat && r.from === 0, run = r.state === 'run';
        it.g.style.display = '';
        it.line.setAttribute('x1', a[0]); it.line.setAttribute('y1', a[1]); it.line.setAttribute('x2', x); it.line.setAttribute('y2', y);
        it.line.setAttribute('stroke', bat ? '#ff9a2a' : '#ff3a3a'); it.line.setAttribute('stroke-width', Math.max(2, rad * .45)); it.line.setAttribute('opacity', run && s > .02 ? .85 : 0);
        it.dot.setAttribute('cx', x); it.dot.setAttribute('cy', y); it.dot.setAttribute('r', rad); it.dot.setAttribute('fill', bat ? 'url(#rhB)' : 'url(#rhG)'); it.dot.setAttribute('stroke-width', Math.max(1.2, rad * .22));
        it.dot.style.filter = 'drop-shadow(0 0 4px ' + (bat ? 'rgba(255,150,40,.95)' : 'rgba(255,50,50,.95)') + ')';
        const pu = run ? (.5 + .5 * Math.sin(now * .012)) : 0;      // 跑動中：外圈脈動
        it.ring.setAttribute('cx', x); it.ring.setAttribute('cy', y); it.ring.setAttribute('r', rad + 2 + pu * 3); it.ring.setAttribute('stroke', bat ? '#ffb050' : '#ff6a6a'); it.ring.setAttribute('stroke-width', 1.4); it.ring.setAttribute('opacity', run ? .75 - pu * .45 : 0);
      }
      for (const [r, it] of items) if (!live.has(r)) { it.g.remove(); items.delete(r); }
      svg.style.display = any ? '' : 'none'; shown = any;
    } catch (e) { }
  }
  requestAnimationFrame(frame);
  return { get on() { return enabled; }, set(v) { enabled = !!v; try { localStorage.setItem('cpbl2027.runhud', v ? '1' : '0'); } catch (e) { } } };
})();
