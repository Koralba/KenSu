/* ===== 13za2-wbc-flags.js ｜ WBC 經典賽 20 隊「國旗圓形隊徽」=====
   仿照 WBC 官方各國圖示的做法：把各國國旗裁成圓形、外圈白框。全部是向量 SVG（viewBox 0 0 40 40），沒有外部圖檔、離線可用。
   使用方式：wbcFlag('JPN') → SVG 字串；wbcChip(隊伍物件) → 小徽章＋三碼縮寫（賽程、積分榜、頒獎台用）。
   中華台北（TWN）的圖示取自 01-core-data.js 的 TPE（Team Taiwan）圖示，兩邊永遠同一個。
   載入順序：放在 13za-wbc-data.js 之後、13zb-wbc.js 之前。 */
'use strict';
const WBC_FLAGS = (function () {
  const R = (x, y, w, h, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
  const star = (cx, cy, r, f, n, inner) => { n = n || 5; const k = inner || (n === 5 ? .382 : .45), p = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * k : r; p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2)); } return `<polygon points="${p.join(' ')}" fill="${f}"/>`; };
  const tri = (pts, f) => `<polygon points="${pts}" fill="${f}"/>`;
  const stripesH = (cols, h) => cols.map((c, i) => R(0, i * h, 40, h + .05, c)).join('');
  const stripesV = (cols, w) => cols.map((c, i) => R(i * w, 0, w + .05, 40, c)).join('');
  const unionJack = (s) => `<g transform="${s}"><rect width="40" height="40" fill="#012169"/><path d="M0 0L40 40M40 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L40 40M40 0L0 40" stroke="#c8102e" stroke-width="3"/><path d="M20 0V40M0 20H40" stroke="#fff" stroke-width="12"/><path d="M20 0V40M0 20H40" stroke="#c8102e" stroke-width="7"/></g>`;
  const trig = (x, y, rot, pat) => `<g transform="translate(${x} ${y}) rotate(${rot})" fill="#111">${pat.map((solid, i) => { const yy = -2.6 + i * 2.6; return solid ? `<rect x="-3.6" y="${yy - .55}" width="7.2" height="1.1"/>` : `<rect x="-3.6" y="${yy - .55}" width="3.1" height="1.1"/><rect x=".5" y="${yy - .55}" width="3.1" height="1.1"/>`; }).join('')}</g>`;
  const F = {
    PUR: () => stripesH(['#ed0000', '#fff', '#ed0000', '#fff', '#ed0000'], 8) + tri('0,0 23,20 0,40', '#0050f0') + star(7.6, 20, 5.2, '#fff'),
    CUB: () => stripesH(['#002a8f', '#fff', '#002a8f', '#fff', '#002a8f'], 8) + tri('0,0 23,20 0,40', '#cf142b') + star(7.6, 20, 5.2, '#fff'),
    CAN: () => R(0, 0, 40, 40, '#d52b1e') + R(10, 0, 20, 40, '#fff') + `<path d="M20 7.5l2.1 4.6 2.6-1.2-.9 6 3.5-2.7.7 2.1 3-.9-.9 3.1 1.5 1.1-5.4 4.6.9 3.2-4.6-.9v6.6h-2v-6.6l-4.6.9.9-3.2-5.4-4.6 1.5-1.1-.9-3.1 3 .9.7-2.1 3.5 2.7-.9-6 2.6 1.2z" fill="#d52b1e"/>`,
    PAN: () => R(0, 0, 20, 20, '#fff') + R(20, 0, 20, 20, '#d21034') + R(0, 20, 20, 20, '#005293') + R(20, 20, 20, 20, '#fff') + star(10, 10, 6, '#005293') + star(30, 30, 6, '#d21034'),
    COL: () => R(0, 0, 40, 20, '#fcd116') + R(0, 20, 40, 10, '#003893') + R(0, 30, 40, 10, '#ce1126'),
    USA: () => { let s = ''; for (let i = 0; i < 13; i++) s += R(0, i * 40 / 13, 40, 40 / 13 + .05, i % 2 ? '#fff' : '#b22234'); s += R(0, 0, 21, 40 / 13 * 7, '#3c3b6e'); for (let r = 0; r < 4; r++) for (let c = 0; c < 4 - (r & 1); c++) s += `<circle cx="${3.6 + c * 4.4 + (r & 1) * 2.2}" cy="${3.2 + r * 5}" r="1" fill="#fff"/>`; return s; },
    MEX: () => stripesV(['#006847', '#fff', '#ce1126'], 40 / 3) + `<circle cx="20" cy="20" r="5" fill="#8c5a2b" opacity=".9"/><path d="M14.6 23.6q5.4 4.2 10.8 0" stroke="#1d7a3a" stroke-width="1.6" fill="none"/><circle cx="20" cy="19" r="2" fill="#c98a3a"/>`,
    ITA: () => stripesV(['#009246', '#fff', '#ce2b37'], 40 / 3),
    GBR: () => unionJack(''),
    BRA: () => R(0, 0, 40, 40, '#009c3b') + tri('20,4.5 37,20 20,35.5 3,20', '#ffdf00') + `<circle cx="20" cy="20" r="8.2" fill="#002776"/><path d="M12.2 18.2q8.6-2.6 15.6 3" stroke="#fff" stroke-width="1.9" fill="none"/>`,
    JPN: () => R(0, 0, 40, 40, '#fff') + `<circle cx="20" cy="20" r="9" fill="#bc002d"/>`,
    AUS: () => R(0, 0, 40, 40, '#012169') + unionJack('scale(.5)') + star(10, 30, 5, '#fff', 7, .5) + star(30, 7, 2.6, '#fff') + star(35.5, 17, 2.6, '#fff') + star(25.5, 20.5, 2.6, '#fff') + star(30, 31, 2.6, '#fff') + star(32.5, 23.5, 1.5, '#fff'),
    KOR: () => R(0, 0, 40, 40, '#fff') + `<circle cx="20" cy="20" r="8" fill="#0047a0"/><path d="M12 20A8 8 0 0 1 28 20A4 4 0 0 1 20 20A4 4 0 0 0 12 20Z" fill="#cd2e3a"/>` + trig(8.2, 8.2, -45, [1, 1, 1]) + trig(31.8, 8.2, 45, [0, 1, 0]) + trig(8.2, 31.8, 45, [1, 0, 1]) + trig(31.8, 31.8, -45, [0, 0, 0]),
    CZE: () => R(0, 0, 40, 20, '#fff') + R(0, 20, 40, 20, '#d7141a') + tri('0,0 23,20 0,40', '#11457e'),
    VEN: () => R(0, 0, 40, 13.4, '#ffcc00') + R(0, 13.3, 40, 13.4, '#00247d') + R(0, 26.6, 40, 13.4, '#cf142b') + [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = Math.PI * (1.12 + i * .108); return `<circle cx="${(20 + 13.5 * Math.cos(a)).toFixed(2)}" cy="${(33 + 13 * Math.sin(a)).toFixed(2)}" r="1.15" fill="#fff"/>`; }).join(''),
    DOM: () => R(0, 0, 20, 20, '#002d62') + R(20, 0, 20, 20, '#ce1126') + R(0, 20, 20, 20, '#ce1126') + R(20, 20, 20, 20, '#002d62') + R(0, 17.2, 40, 5.6, '#fff') + R(17.2, 0, 5.6, 40, '#fff') + `<circle cx="20" cy="20" r="4.4" fill="#fff"/><circle cx="20" cy="20" r="3" fill="#1d7a3a"/><path d="M17.7 18.6h4.6v2.8l-2.3 1.6-2.3-1.6z" fill="#002d62"/><path d="M20 18.6v4.4M17.7 20.7h4.6" stroke="#ce1126" stroke-width=".8"/>`,
    NED: () => stripesH(['#ae1c28', '#fff', '#21468b'], 40 / 3),
    ISR: () => R(0, 0, 40, 40, '#fff') + R(0, 5.5, 40, 4.6, '#0038b8') + R(0, 29.9, 40, 4.6, '#0038b8') + `<g fill="none" stroke="#0038b8" stroke-width="1.7" stroke-linejoin="miter"><polygon points="20,12.2 27,24.2 13,24.2"/><polygon points="20,27.8 27,15.8 13,15.8"/></g>`,
    NIC: () => R(0, 0, 40, 40, '#0067c6') + R(0, 10, 40, 20, '#fff') + `<polygon points="20,13.6 27,26.2 13,26.2" fill="#f6e27a" stroke="#2a7d3a" stroke-width="1.2"/><circle cx="20" cy="22" r="2.2" fill="#e0a000"/><path d="M15.4 24.4q4.6-5 9.2 0" stroke="#0067c6" stroke-width=".9" fill="none"/>`
  };
  const wrap = body => `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="wbcfc"><circle cx="20" cy="20" r="18.4"/></clipPath></defs><g clip-path="url(#wbcfc)">${body}</g><circle cx="20" cy="20" r="18.4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="20" cy="20" r="19.4" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".9"/></svg>`;
  function svgOf(code) {
    code = String(code || '').replace(/^W_/, '');
    if (code === 'TWN') { try { const t = TEAMS.find(x => x.id === 'TPE'); if (t && t.icon) return t.icon; } catch (e) { } }
    const f = F[code]; if (f) return wrap(f());
    return wrap(R(0, 0, 40, 40, '#445') + `<text x="20" y="25" font-size="12" font-weight="900" text-anchor="middle" fill="#fff">${code}</text>`);
  }
  return { svgOf, codes: Object.keys(F).concat(['TWN']) };
})();
function wbcFlag(code) { return WBC_FLAGS.svgOf(code); }
function wbcChip(t) { return `<span class="wb-chip" style="--c1:${t.c1};--c2:${t.cap}"><i class="wb-fl">${wbcFlag(t.code)}</i>${t.code}</span>`; }
