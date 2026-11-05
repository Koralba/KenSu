/* ===== 13zc-wbc-ceremony.js ｜ WBC 經典賽：頒獎典禮（冠軍／亞軍／季軍上台領獎 → 全部獎項公布 → 合照 → 詢問是否回主畫面）=====
   入口：13zb-wbc.js 的 WBC 在大賽結束（S.done）後呼叫 WBC_CER.play({ S, D, onHome, onStay })。
   獎項：WBC_CER.compute(S, D) 依四強球隊（S.final）的名單與整屆賽程比分，產生「整屆累計成績」再選出各獎項
         （MVP、最佳投手、三振王、救援王、盜壘王、打點王、全壘打王、打擊王、金手套 9 守位、最佳九人＋先發＋救援、最佳總教練）。
         成績不是官方資料：模擬賽的個人成績由名單能力＋該隊整屆得失分隨機產生；玩家親自打的 3D 比賽，打者的真實 ab／h／hr／rbi 會
         由 WBC.afterEnd 記進 S.real，並併入該隊成績（所以你親手打出的全壘打會算數）。結果存在 S.awards，重看頒獎不會變。
   舞台：純 DOM／CSS／canvas（不動 3D 場景），每位球員是一個 SVG 小人，球衣＝隊色、帽子＝隊帽色；煙火與彩帶畫在 canvas。
   時間軸：季軍 → 亞軍 → 冠軍（全員依序上台、掛獎牌、煙火彩帶）→ 獎項逐一揭曉 → 冠軍合照（相機閃光）→「是否回到主畫面？」。右上角可略過。 */
'use strict';
const WBC_CER = (function () {
  const clampN = (x, a, b) => Math.max(a, Math.min(b, x)), rnd = Math.random;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / .7071; };
  const pois = l => { if (l <= 0) return 0; const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 200); return k - 1; };
  const binom = (n, p) => { let c = 0; for (let i = 0; i < n; i++) if (rnd() < p) c++; return c; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lastName = n => /[\u3400-\u9fff]/.test(n) ? n : String(n).trim().split(/\s+/).pop();
  const hash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const MEDAL = [{ ico: '🥇', name: '冠軍', col: '#ffd34d', beam: '#ffe9a0' }, { ico: '🥈', name: '亞軍', col: '#d8e0ea', beam: '#cfe3ff' }, { ico: '🥉', name: '季軍', col: '#d08a4e', beam: '#ffc08a' }];

  /* ================= 一、整屆成績與獎項 ================= */
  function compute(S, D) {
    const inn = S.inn || 9, k9 = inn / 9, ids = S.final.slice(), bats = [], pits = [];
    ids.forEach(id => {
      const t = D.byId[id], gs = S.games.filter(g => g.done && (g.a === id || g.h === id)), n = gs.length;
      const real = S.real && S.real.team === id ? S.real : null, nReal = real ? real.n : 0, nSim = Math.max(0, n - nReal);
      const rs = gs.reduce((a, g) => a + (g.a === id ? g.sa : g.sh), 0), sc = clampN(rs / Math.max(1, n) / 4.5, .6, 1.5);
      t.bat.concat(t.bench).forEach((b, i) => {
        const starter = i < 9, w = starter ? 1 : .3, ab0 = Math.max(0, Math.round(nSim * 3.6 * k9 * w * (.9 + .2 * rnd())));
        const avg = clampN(b.a * (.88 + .12 * sc) + gauss() * .035, .12, .55), h0 = binom(ab0, avg);
        const hr0 = Math.min(h0, pois(ab0 * (b.hr / 520) * sc)), rbi0 = hr0 + pois(h0 * .25 * sc), sb0 = Math.min(8, pois(nSim * (b.sb / 150) * w));
        const r = real && real.bat[b.n] || { ab: 0, h: 0, hr: 0, rbi: 0 };
        bats.push({ n: b.n, id, p: b.p, f: b.f, ar: b.ar, st: starter, ab: ab0 + r.ab, h: h0 + r.h, hr: hr0 + r.hr, rbi: rbi0 + r.rbi, sb: sb0, real: r.ab > 0 });
      });
      const pm = {}, gp = p => pm[p.n] || (pm[p.n] = { n: p.n, id, r: p.r, bb9: p.bb, k9: p.k, ip: 0, er: 0, k: 0, bb: 0, w: 0, l: 0, sv: 0, g: 0 });
      t.cp.sp.concat(t.cp.rp).forEach(gp);
      gs.forEach((g, gi) => {
        const mineA = g.a === id, ra = mineA ? g.sh : g.sa, rf = mineA ? g.sa : g.sh, won = rf > ra, sp = t.cp.sp[gi % t.cp.sp.length], rps = t.cp.rp, cl = rps[rps.length - 1];
        let ip = Math.min(inn, Math.round(sp.ipg * k9 * (.75 + .5 * rnd()) * 3) / 3), raS = Math.min(ra, Math.round(ra * (ip / inn) * (.7 + .6 * rnd()))), left = inn - ip, raL = ra - raS;
        const add = (p, i2, r2) => { const o = gp(p); o.g++; o.ip += i2; o.er += Math.round(r2 * .92); o.k += Math.min(pois(i2 * p.k / 9), Math.ceil(i2 * 1.7)); o.bb += pois(i2 * p.bb / 9); return o; };
        const so = add(sp, ip, raS); const used = [so]; let saved = false;
        if (left > 0) {
          const save = won && rf - ra <= 3 && left >= 1 && rnd() < .85, ci = save ? Math.min(left, Math.max(1, k9)) : 0;
          if (ci > 0) { const rl = Math.max(0, left - ci), p1 = rps[Math.floor(rnd() * (rps.length - 1))], rr = Math.round(raL * rl / Math.max(1, left)); if (rl > 0) used.push(add(p1, rl, rr)); const co = add(cl, ci, raL - rr); co.sv++; saved = true; used.push(co); }
          else { const p1 = rps[Math.floor(rnd() * rps.length)]; used.push(add(p1, left, raL)); }
        }
        if (won) (ip >= inn * 5 / 9 ? so : (used.length > 1 ? used[1 + Math.floor(rnd() * (used.length - 1))] : so)).w++;
        else (ip >= inn * 5 / 9 ? so : used[used.length - 1]).l++;
      });
      Object.values(pm).forEach(o => { o.era = o.ip > 0 ? o.er * 9 / o.ip : 99; pits.push(o); });
    });
    const tcode = id => D.byId[id].code, who = (o, line) => ({ n: o.n, id: o.id, line });
    const avgOf = b => b.ab ? b.h / b.ab : 0, bScore = b => b.h + b.hr * 3 + b.rbi * 1.2 + b.sb * .5 - (b.ab - b.h) * .12;
    const pScore = p => p.w * 5 + p.sv * 3 + p.k * .5 + Math.max(0, 3.5 - p.era) * 3 + p.ip * .3;
    const fmt3 = v => (v >= 1 ? '1.000' : v.toFixed(3).replace(/^0/, ''));
    const bLine = b => `${b.ab} 打數 ${b.h} 安打　${fmt3(avgOf(b))}　${b.hr} 轟 ${b.rbi} 打點${b.sb ? ' ' + b.sb + ' 盜' : ''}`;
    const pLine = p => `${p.w}勝${p.l}敗${p.sv ? ' ' + p.sv + '救援' : ''}　防禦率 ${p.era.toFixed(2)}　${p.ip.toFixed(1)} 局 ${p.k} 三振`;
    const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] || 1, qAB = Math.max(4, med(bats.filter(b => b.st).map(b => b.ab)) * .7), qIP = Math.max(5 * k9, med(pits.filter(p => p.r === 'SP' && p.ip > 0).map(p => p.ip)) * .9);      // 投手獎資格：投球局數要達先發投手的中位數附近
    const top = (arr, f, tie) => arr.slice().sort((x, y) => f(y) - f(x) || (tie ? tie(y) - tie(x) : 0))[0];
    const aw = [], push = (key, ico, title, o, line, extra) => { if (o) aw.push(Object.assign({ key, ico, title, n: o.n, id: o.id, line }, extra || {})); };
    /* MVP：冠軍隊裡綜合貢獻最高者（加一點隨機，前幾名都有機會） */
    const champ = ids[0], mvpPool = bats.filter(b => b.id === champ && b.ab >= 3).map(b => ({ o: b, s: bScore(b) * (.92 + .16 * rnd()), bat: 1 })).concat(pits.filter(p => p.id === champ && p.ip >= 2).map(p => ({ o: p, s: pScore(p) * (.92 + .16 * rnd()), bat: 0 })));
    const mv = mvpPool.sort((x, y) => y.s - x.s)[0];
    const q = bats.filter(b => b.ab >= qAB), pq = pits.filter(p => p.r === 'SP' && p.ip >= qIP);      // 最佳投手只從先發投手選（後援表現歸「最佳救援投手」）
    const bp = top(pq, p => -p.era, p => p.k), ks = top(pits, p => p.k), sv = top(pits.filter(p => p.sv > 0), p => p.sv, p => -p.era);
    const sb = top(bats.filter(b => b.sb > 0), b => b.sb, b => b.h), rb = top(bats, b => b.rbi, b => b.hr), hrk = top(bats.filter(b => b.hr > 0), b => b.hr, b => b.rbi), ba = top(q, avgOf, b => b.h);
    const main = [];
    if (bp) main.push(['bp', '🔥', '最佳投手獎', bp, pLine(bp)]);
    if (ks) main.push(['ks', '⚡', '三振王', ks, `${ks.k} 次三振　${ks.ip.toFixed(1)} 局`]);
    if (sv) main.push(['sv', '🧯', '最佳救援投手', sv, `${sv.sv} 次救援成功　防禦率 ${sv.era.toFixed(2)}`]);
    if (sb) main.push(['sb', '💨', '盜壘王', sb, `${sb.sb} 次盜壘成功`]);
    if (rb) main.push(['rbi', '🎯', '打點王', rb, `${rb.rbi} 分打點　${rb.hr} 轟`]);
    if (hrk) main.push(['hr', '💣', '全壘打王', hrk, `${hrk.hr} 支全壘打　${bLine(hrk)}`]);
    if (ba) main.push(['ba', '🏏', '打擊王', ba, bLine(ba)]);
    main.forEach(m => push(m[0], m[1], m[2], m[3], m[4]));
    /* 金手套：每個守位（含投手）一位 */
    const POS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'], gold = [];
    POS.forEach(pos => {
      if (pos === 'P') { const o = top(pits.filter(p => p.r === 'SP' && p.ip > 0), p => -(p.bb9 + p.era * .8) + gauss() * .8); if (o) gold.push({ pos, n: o.n, id: o.id }); return; }
      const o = top(bats.filter(b => b.p === pos && (b.st || b.ab >= 2)), b => b.f + (pos === 'LF' || pos === 'CF' || pos === 'RF' ? b.ar * .3 : 0) + (b.st ? 4 : 0) + gauss() * 3);
      if (o) gold.push({ pos, n: o.n, id: o.id });
    });
    /* 最佳九人：各守位（含 DH）打擊貢獻最高者＋最佳先發＋最佳後援 */
    const nine = [];
    ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].forEach(pos => { const o = top(bats.filter(b => b.p === pos && b.ab >= 3), bScore); if (o) nine.push({ pos, n: o.n, id: o.id, line: `${fmt3(avgOf(o))} ${o.hr}轟 ${o.rbi}打` }); });
    const nsp = top(pits.filter(p => p.r === 'SP' && p.ip >= 3), pScore), nrp = top(pits.filter(p => p.r !== 'SP' && p.ip >= 1), pScore);
    if (nsp) nine.push({ pos: 'SP', n: nsp.n, id: nsp.id, line: `${nsp.w}勝 防${nsp.era.toFixed(2)}` });
    if (nrp) nine.push({ pos: 'RP', n: nrp.n, id: nrp.id, line: `${nrp.sv}救 防${nrp.era.toFixed(2)}` });
    const ct = D.byId[champ], res = {
      v: 1, champ, ids,
      mvp: mv ? { ico: '🏅', title: '最有價值球員 MVP', n: mv.o.n, id: champ, line: mv.bat ? bLine(mv.o) : pLine(mv.o), real: !!mv.o.real } : null,
      main: aw, gold, nine, coach: { ico: '🧢', title: '最佳總教練', n: ct.mgr, id: champ, line: `帶領 ${ct.name} 登上世界之巔` }
    };
    return res;
  }

  /* ================= 二、煙火／彩帶（canvas） ================= */
  function mkFx(cv, calm) {
    const ctx = cv && cv.getContext && cv.getContext('2d'); if (!ctx) return { burst() { }, rocket() { }, volley() { }, confetti() { }, stop() { } };
    let W = 0, H = 0, P = [], C = [], raf = 0, last = 0, alive = true; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }; fit(); addEventListener('resize', fit);
    const mulN = calm ? .45 : 1;
    function burst(x, y, cols, kind, n) {
      n = Math.round((n || 70) * mulN); kind = kind || 'peony'; const sp0 = 120 + rnd() * 110, c2 = cols[Math.floor(rnd() * cols.length)];
      for (let i = 0; i < n; i++) {
        let vx, vy, sp = sp0 * (kind === 'ring' ? 1 : .35 + rnd() * .75), a = i / n * 6.2832 + rnd() * .1;
        if (kind === 'heart') { const t = a; vx = 16 * Math.pow(Math.sin(t), 3) * 7.5; vy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 7.5; }
        else if (kind === 'star') { const r = (i % 2 ? .5 : 1) * sp0 * 1.05; vx = Math.cos(a) * r; vy = Math.sin(a) * r; }
        else { vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; }
        P.push({ x, y, vx, vy, age: 0, life: (kind === 'willow' ? 2.4 : 1.2) + rnd() * .7, col: rnd() < .22 ? '#ffffff' : (i % 5 === 0 ? c2 : cols[i % cols.length]), g: kind === 'willow' ? 70 : 90, d: kind === 'willow' ? 1.3 : 1.7, s: 1.6 + rnd() * 1.6 });
      }
    }
    function rocket(x, ty, cols, kind) { P.push({ rk: 1, x, y: H + 10, vx: (rnd() - .5) * 30, vy: -(H - ty) * 1.25 - 120, ty, age: 0, life: 3, cols, kind, col: '#ffd9a0', g: 0, d: .2, s: 2.2 }); }
    function volley(cols, n, dur, kinds) { kinds = kinds || ['peony', 'ring', 'heart', 'star', 'willow']; n = Math.round(n * (calm ? .6 : 1)); for (let i = 0; i < n; i++) setTimeout(() => { if (alive) rocket(W * (.08 + rnd() * .84), H * (.1 + rnd() * .42), cols, kinds[Math.floor(rnd() * kinds.length)]); }, i * dur / n * 1000 + rnd() * 160); }
    function confetti(n, cols) { n = Math.round(n * mulN); for (let i = 0; i < n; i++) C.push({ x: rnd() * W, y: -20 - rnd() * H * .5, vx: (rnd() - .5) * 60, vy: 60 + rnd() * 90, rot: rnd() * 6, vr: (rnd() - .5) * 9, w: 5 + rnd() * 6, h: 3 + rnd() * 5, col: cols[Math.floor(rnd() * cols.length)], sw: rnd() * 6 }); }
    function tick(ts) {
      if (!alive) return; const dt = Math.min(.05, (ts - (last || ts)) / 1000); last = ts;
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.age += dt; const k = Math.exp(-dt * p.d); p.vx *= k; p.vy = p.vy * k + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.rk) { ctx.fillStyle = p.col; ctx.fillRect(p.x - 1, p.y, 2.4, 9); if (p.y <= p.ty || p.age > p.life) { burst(p.x, p.y, p.cols, p.kind, 80); P.splice(i, 1); } continue; }
        const u = p.age / p.life; if (u >= 1) { P.splice(i, 1); continue; } ctx.globalAlpha = (1 - u * u) * (.7 + .3 * Math.sin(p.age * 40 + i)); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - u * .4), 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      for (let i = C.length - 1; i >= 0; i--) { const c = C[i]; c.y += c.vy * dt; c.x += (c.vx + Math.sin(c.rot + c.sw) * 40) * dt; c.rot += c.vr * dt; if (c.y > H + 20) { C.splice(i, 1); continue; } ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(1, Math.cos(c.rot * 1.7)); ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore(); }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return { burst, rocket, volley, confetti, stop() { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', fit); }, _count: () => P.length + C.length };
  }

  /* ================= 三、球員小人（SVG） ================= */
  const SKIN = ['#f6d9bd', '#efc9a2', '#d9a77a', '#b57d52', '#8a5a37'];
  function figure(t, name, no, opt) {
    opt = opt || {}; const cjk = /[\u3400-\u9fff]/.test(name), h = hash(name), skin = opt.coach ? SKIN[h % 3] : (cjk ? SKIN[h % 2] : SKIN[h % 5]), jersey = opt.coach ? '#1b2234' : t.c1, trim = opt.coach ? t.c1 : t.c2;
    const lt = c => /^#(f|e|d)/i.test(c) && c.toLowerCase() !== '#d80621' && c.toLowerCase() !== '#d21034', numCol = lt(jersey) ? '#14213d' : '#fff';
    return `<svg viewBox="0 0 40 66" aria-hidden="true"><ellipse cx="20" cy="63.4" rx="11" ry="2.3" fill="#0007"/>
<g class="lg l"><rect x="12.6" y="44" width="6.2" height="16" rx="3" fill="${opt.coach ? '#222a3c' : trim === '#ffffff' ? '#f3f3f3' : trim}"/><rect x="11.6" y="58" width="8.2" height="4.6" rx="2.2" fill="#1a1a1a"/></g>
<g class="lg r"><rect x="21.2" y="44" width="6.2" height="16" rx="3" fill="${opt.coach ? '#222a3c' : trim === '#ffffff' ? '#f3f3f3' : trim}"/><rect x="20.2" y="58" width="8.2" height="4.6" rx="2.2" fill="#1a1a1a"/></g>
<g class="am l"><rect x="3.6" y="24" width="6.4" height="18" rx="3.2" fill="${jersey}"/><circle cx="6.8" cy="43.4" r="3.3" fill="${skin}"/></g>
<g class="am r"><rect x="30" y="24" width="6.4" height="18" rx="3.2" fill="${jersey}"/><circle cx="33.2" cy="43.4" r="3.3" fill="${skin}"/></g>
<rect x="9" y="22" width="22" height="26" rx="8" fill="${jersey}"/><rect x="9" y="42.5" width="22" height="3" fill="${trim}" opacity=".9"/>
${opt.coach ? `<path d="M17.5 22 L20 31 L22.5 22Z" fill="#fff"/><path d="M19 24 L21 24 L21.6 34 L20 36 L18.4 34Z" fill="${t.c1}"/>` : `<text x="20" y="38" font-size="${no > 9 ? 11 : 13}" font-weight="900" text-anchor="middle" fill="${numCol}" stroke="#0007" stroke-width=".35" font-family="Orbitron,sans-serif">${no}</text>`}
<circle cx="20" cy="14.5" r="10" fill="${skin}"/>
<path d="M9.4 13.5 Q9.8 2 20 2 Q30.2 2 30.6 13.5 Z" fill="${opt.coach ? '#222a3c' : t.cap}"/><path d="M8 12.6 Q20 10.2 32 12.6 L34 14.4 Q20 12.8 6.2 14.4Z" fill="${opt.coach ? '#222a3c' : t.cap}"/>
<circle cx="16.4" cy="17" r="1.25" fill="#222"/><circle cx="23.6" cy="17" r="1.25" fill="#222"/><path d="M16.8 20.8 Q20 23.6 23.2 20.8" stroke="#7a3d2b" fill="none" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  }
  function roster(t) {      // 全隊：總教練＋30 名球員（先發野手、板凳、先發投手、後援投手）
    const L = t.bat.concat(t.bench).map(b => b.n).concat(t.sp.map(p => p.n), t.rp.map(p => p.n)); return { coach: t.mgr, players: L };
  }

  /* ================= 四、典禮本體 ================= */
  let root = null, fx = null, dead = true, timers = [];
  const SPEED = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? .35 : 1);
  function sfx(k) {
    try {
      if (k === 'fan') hornSeq(CHARGE, .85); else if (k === 'fan2') { hornSeq([[67, 0, .25], [72, .27, .25], [76, .54, .25], [79, .81, .3], [84, 1.15, 1.1]], .9); cheerDrums(14, 110, .9); }
      else if (k === 'cheer') { flowSfx('cheer', 2.4); crowdRoar(1.6); } else if (k === 'big') { flowSfx('cheer', 3); crowdRoar(2.4); cheerDrums(10, 120, 1); }
      else if (k === 'pop') { tone(180, .22, .5, 'sine', .4); noiseBurst(.12, 2600, .8, .35, 'highpass'); } else if (k === 'shutter') { noiseBurst(.03, 3000, 1, .5, 'highpass'); setTimeout(() => noiseBurst(.04, 2000, 1, .45, 'highpass'), 70); }
    } catch (e) { }
  }
  function play(o) {
    stop(); const S = o.S, D = o.D, sp = SPEED(), calm = sp < 1; dead = false;
    const aw = S.awards || (S.awards = compute(S, D)); if (o.save) o.save();
    root = document.createElement('div'); root.id = 'wbcCer'; root.className = 'cer'; if (calm) root.classList.add('calm');
    root.innerHTML = `<div class="cer-bg"></div><i class="cer-beam b1"></i><i class="cer-beam b2"></i><i class="cer-beam b3"></i>
<div class="cer-crowd">${Array.from({ length: 46 }, () => `<i style="left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 70).toFixed(1)}%;animation-delay:${(rnd() * 3).toFixed(2)}s"></i>`).join('')}</div>
<canvas class="cer-fx"></canvas><div class="cer-hd"></div><div class="cer-stage"><div class="cer-troupe"></div><div class="cer-pod"><div class="p p2" data-r="1"><b>2</b><em></em></div><div class="p p1" data-r="0"><b>1</b><em></em></div><div class="p p3" data-r="2"><b>3</b><em></em></div></div></div>
<div class="cer-aw"></div><div class="cer-flash"></div><div class="cer-frame"></div><button class="cer-skip" type="button">⏭ 略過</button><div class="cer-end"></div>`;
    document.body.appendChild(root); const q = s => root.querySelector(s), hd = q('.cer-hd'), troupe = q('.cer-troupe'), awEl = q('.cer-aw'), stage = q('.cer-stage'), endEl = q('.cer-end'), flash = q('.cer-flash');
    fx = mkFx(q('.cer-fx'), calm); const STOP = { stop: 1 };
    const wait = ms => new Promise((res, rej) => { const id = setTimeout(() => dead ? rej(STOP) : res(), ms * sp); timers.push(id); });
    const T = id => D.byId[id], cols = t => [t.c1, t.c2 === '#ffffff' ? '#ffffff' : t.c2, t.cap, '#ffd34d'];
    const chip = id => `<span class="wb-chip" style="--c1:${T(id).c1};--c2:${T(id).cap}">${T(id).code}</span>`;
    const setBeam = c => root.style.setProperty('--beam', c), perRow = () => innerWidth < 560 ? 8 : innerWidth < 900 ? 10 : 11;
    const hdr = (ico, txt, sub, c1, c2) => { hd.innerHTML = `<div class="cer-rib" style="--c1:${c1};--c2:${c2}"><b>${ico} ${txt}</b>${sub ? `<small>${sub}</small>` : ''}</div>`; };
    function buildTroupe(id, medal) {      // 全隊人員排成三排＋總教練（依序從左右兩側走上台）
      const t = T(id), r = roster(t), per = perRow(), all = r.players.map((n, i) => ({ n, no: i + 1 })), rows = []; const rc = Math.ceil((all.length + 1) / per);
      for (let i = 0; i < rc; i++) rows.push([]);
      all.forEach((p, i) => rows[i % rc].push(p)); rows[rc - 1].splice(Math.max(1, Math.floor(rows[rc - 1].length * .25)), 0, { n: r.coach, no: 0, coach: 1 });
      let k = 0, h = '';
      rows.forEach((row, ri) => { h += `<div class="cer-row r${ri}">` + row.map((p, ci) => { const side = (ci + ri) % 2 ? 1 : -1, d = (k++ * .1 * (calm ? .4 : 1)).toFixed(2); return `<div class="cf${p.coach ? ' coach' : ''}" style="--fx:${side * 60}vw;--d:${d}s;--j:${(rnd() * .5).toFixed(2)}s">${figure(t, p.n, p.no, { coach: p.coach })}<i class="med">${medal.ico}</i><span class="nm">${esc(p.coach ? '教練 ' + lastName(p.n) : lastName(p.n))}</span></div>`; }).join('') + `</div>`; });
      troupe.className = 'cer-troupe'; troupe.innerHTML = h; return k;
    }
    async function medalTeam(r) {
      const id = S.final[r], t = T(id), m = MEDAL[r], mine = id === S.my; setBeam(m.beam);
      hdr(m.ico, `${m.name}　${esc(t.name)}`, `${esc(t.en)}${mine ? '　★ 你的球隊' : ''}`, t.c1, t.cap === '#ffffff' ? '#444' : t.cap);
      root.querySelectorAll('.cer-pod .p').forEach(p => p.classList.remove('on')); const pod = q(`.cer-pod .p[data-r="${r}"]`); pod.classList.add('on'); pod.querySelector('em').innerHTML = chip(id);
      sfx(r === 0 ? 'fan2' : 'fan'); const n = buildTroupe(id, m); await wait(500);
      troupe.classList.add('walk'); await wait(n * 100 * (calm ? .4 : 1) + 1500); troupe.classList.remove('walk'); troupe.classList.add('set', 'cheer', 'medal');
      sfx('pop'); fx.volley(cols(t).concat(m.col), r === 0 ? 14 : 8, r === 0 ? 4.2 : 3, null); fx.confetti(r === 0 ? 160 : 90, cols(t).concat(['#ffffff', m.col])); sfx(r === 0 ? 'big' : 'cheer');
      if (r === 0) { stage.classList.add('trophy'); } await wait(r === 0 ? 5200 : 3600);
      if (r !== 0) { troupe.classList.add('leave'); await wait(1100); troupe.innerHTML = ''; troupe.className = 'cer-troupe'; }
    }
    function card(a, big) { return `<div class="cer-awc${big ? ' big' : ''}"><div class="ic">${a.ico}</div><div class="tt">${esc(a.title)}</div><div class="nm">${esc(a.n)}</div><div class="tm">${chip(a.id)} ${esc(T(a.id).name)}</div><div class="ln">${esc(a.line || '')}</div>${a.real ? '<div class="rl">★ 你親手打出的成績</div>' : ''}</div>`; }
    async function awardsPhase() {
      stage.classList.add('away'); root.classList.add('awards'); setBeam('#fff1b0'); hdr('🏆', '大賽獎項', `2026 WORLD BASEBALL CLASSIC`, '#7a5400', '#e6b422'); awEl.classList.add('on');
      for (const a of aw.main) { awEl.innerHTML = card(a); sfx('pop'); fx.burst(innerWidth * (.3 + rnd() * .4), innerHeight * .3, ['#ffd34d', '#fff', T(a.id).c1], 'peony', 60); await wait(2500); }
      const grid = (title, ico, list, f) => `<div class="cer-grid"><h3>${ico} ${title}</h3><div class="g">${list.map((x, i) => `<div class="gi" style="animation-delay:${(i * .22 * (calm ? .4 : 1)).toFixed(2)}s"><small>${esc(x.pos)}</small><b>${esc(lastName(x.n))}</b><span>${chip(x.id)}</span>${x.line ? `<em>${esc(x.line)}</em>` : ''}</div>`).join('')}</div></div>`;
      awEl.innerHTML = grid('金手套獎', '🧤', aw.gold); sfx('cheer'); fx.volley(['#ffd34d', '#fff', '#8fe3ff'], 5, 2.2, ['ring', 'star']); await wait(aw.gold.length * 220 * (calm ? .4 : 1) + 3200);
      awEl.innerHTML = grid('最佳九人（All-WBC Team）', '⭐', aw.nine); sfx('cheer'); fx.volley(['#ffd34d', '#fff', '#ff7de9'], 5, 2.2, ['peony', 'heart']); await wait(aw.nine.length * 220 * (calm ? .4 : 1) + 3200);
      awEl.innerHTML = card(aw.coach); sfx('pop'); fx.burst(innerWidth * .5, innerHeight * .3, ['#ffd34d', '#fff'], 'ring', 70); await wait(2600);
      if (aw.mvp) { awEl.innerHTML = `<div class="cer-mvp"><div class="sp"></div>${card(aw.mvp, 1)}</div>`; sfx('fan2'); setTimeout(() => { if (!dead) sfx('big'); }, 900 * sp); fx.volley(['#ffd34d', '#fff', '#ff8a4d', '#8fe3ff'], 18, 5, null); fx.confetti(180, ['#ffd34d', '#fff', '#ff5a5a', '#5ab0ff']); await wait(6200); }
      awEl.classList.remove('on'); awEl.innerHTML = '';
    }
    async function photo(quick) {      // 冠軍全員合照：相機閃光、定格相框
      root.classList.remove('awards'); const id = S.final[0], t = T(id); stage.classList.remove('away'); stage.classList.add('photo', 'trophy'); setBeam('#ffe9a0');
      root.querySelectorAll('.cer-pod .p').forEach(p => p.classList.remove('on')); q('.cer-pod .p1').classList.add('on'); q('.cer-pod .p1 em').innerHTML = chip(id);
      hdr('📸', `${esc(t.name)}　冠軍合照`, '2026 WORLD BASEBALL CLASSIC', t.c1, t.cap === '#ffffff' ? '#444' : t.cap);
      const n = buildTroupe(id, MEDAL[0]); troupe.classList.add('set', 'cheer', 'medal'); troupe.querySelectorAll('.cf').forEach(f => { f.style.setProperty('--d', '0s'); f.style.animation = 'none'; f.style.opacity = 1; }); void n;
      if (!quick) { await wait(900); for (let i = 0; i < 3; i++) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); sfx('shutter'); await wait(650); } troupe.classList.remove('cheer'); troupe.classList.add('pose'); }
      q('.cer-frame').innerHTML = `<div class="fr"><b>${chip(id)} ${esc(t.name)}</b><span>2026 WORLD BASEBALL CLASSIC　CHAMPIONS</span></div>`; root.classList.add('framed');
      fx.volley(cols(t).concat('#ffd34d'), 10, 3, null); fx.confetti(120, cols(t).concat('#ffffff')); sfx('big'); await wait(quick ? 200 : 3800);
    }
    function finale() {
      if (!root) return; const pos = S.final.indexOf(S.my), c = T(S.final[0]); q('.cer-skip').style.display = 'none';
      const my = pos === 0 ? `🏆 你帶領 ${esc(T(S.my).name)} 奪下冠軍！` : pos > 0 ? `你的球隊 ${esc(T(S.my).name)} 榮獲${MEDAL[pos] ? MEDAL[pos].name : '殿軍'}。` : `你的球隊 ${esc(T(S.my).name)} 這次止步於${S.games.some(g => g.k === 'QF' && (g.a === S.my || g.h === S.my)) ? '八強' : '預賽'}。`;
      endEl.innerHTML = `<div class="cer-endc"><div class="ti">🎉 頒獎典禮圓滿結束</div><p>${esc(c.name)} 奪下 2026 世界棒球經典賽冠軍！<br>${my}</p><p class="qq">是否回到主畫面？</p><div class="acts"><button class="go" data-c="home" type="button">🏠 返回主畫面</button><button data-c="stay" type="button">📋 留在經典賽（賽果／得獎名單）</button><button data-c="again" type="button">🔁 重看頒獎典禮</button></div></div>`; endEl.classList.add('on');
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('cer-skip')) { skipTo(); return; }
      const c = b.dataset.c; if (!c) return;
      if (c === 'home') { close(); o.onHome && o.onHome(); } else if (c === 'stay') { close(); o.onStay && o.onStay(); } else if (c === 'again') { close(); play(o); }
    });
    let skipping = false; function skipTo() { if (skipping) return; skipping = true; dead = true; timers.forEach(clearTimeout); timers = []; setTimeout(() => { if (!root) return; dead = false; awEl.classList.remove('on'); awEl.innerHTML = ''; fx.volley(['#ffd34d', '#fff'], 6, 2, null); photo(true).then(finale).catch(() => { }); }, 30); }
    (async () => {
      try {
        setBeam('#9cc7ff'); hdr('🏟', '頒獎典禮', '2026 WORLD BASEBALL CLASSIC', '#123a78', '#2f7cff'); sfx('fan'); sfx('cheer'); fx.volley(['#9cc7ff', '#fff', '#ffd34d'], 5, 2.4, null); await wait(2600);
        await medalTeam(2); await medalTeam(1); await medalTeam(0); await awardsPhase(); await photo(false); finale();
      } catch (e) { if (e !== STOP) console.error(e); }
    })();
  }
  function close() { dead = true; timers.forEach(clearTimeout); timers = []; try { fx && fx.stop(); } catch (e) { } fx = null; if (root && root.parentNode) root.parentNode.removeChild(root); root = null; }
  function stop() { close(); }
  function listHTML(aw, D) {      // 賽後「得獎名單」（賽果頁用）
    if (!aw) return ''; const chip = id => `<span class="wb-chip" style="--c1:${D.byId[id].c1};--c2:${D.byId[id].cap}">${D.byId[id].code}</span>`;
    const one = a => `<div class="wa"><span class="i">${a.ico}</span><span class="t">${esc(a.title)}</span><span class="n">${chip(a.id)} <b>${esc(a.n)}</b></span><span class="l">${esc(a.line || '')}</span></div>`;
    const grid = (t, l) => `<div class="wa g"><span class="t">${t}</span><span class="gl">${l.map(x => `<em>${esc(x.pos)} <b>${esc(x.n)}</b> ${chip(x.id)}</em>`).join('')}</span></div>`;
    return `<h4>🏅 大賽獎項</h4><div class="wb-aw">${aw.mvp ? one(aw.mvp) : ''}${aw.main.map(one).join('')}${one(aw.coach)}${grid('🧤 金手套獎', aw.gold)}${grid('⭐ 最佳九人', aw.nine)}</div>`;
  }
  return { compute, play, close, listHTML, _figure: figure, _roster: roster, _mkFx: mkFx, MEDAL };
})();
