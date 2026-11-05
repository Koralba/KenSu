'use strict';
/* 13zh-hr-feel.js ｜ 全壘打震撼特效（只加畫面效果，不影響比賽邏輯）
   ① 擊球瞬間：白金閃光＋放射速度線、鏡頭猛力前壓（FOV 衝擊）、強烈晃動、短暫頓格；上下出現電影黑邊
   ② 飛行中：球拖著金色彗星尾跡＋發光光暈（尾跡越舊越小越淡）
   ③ 球過牆前 0.35 秒：慢動作（約 0.75 秒真實時間）；過牆瞬間：金色煙火噴泉、爆光、全場歡呼、鏡頭震動、邊緣金光
   ④ 球落進看台：落點火花噴泉＋閃光＋觀眾歡呼；之後鏡頭才切去看打者跑壘（03／11 的 hrfly→hrtrot）
   區網對戰（vsOn）、快轉（window.__ff）時不啟用；可關閉：localStorage cpbl2027.hrfx=0。
   依賴：03 的 scene／ballMesh／dotTex／CAMC／spawnBurst／fwSpawn／crowdCheer，09 的 flashScreen，11 的 flowOnContact／flowSfx，14 的 hitStop。 */
const HRF = (function () {
  let on = true; try { on = localStorage.getItem('cpbl2027.hrfx') !== '0'; } catch (e) { }
  if (typeof THREE === 'undefined' || typeof flowOnContact !== 'function' || typeof dotTex === 'undefined') return { on: false };
  const fxOK = () => on && !(typeof vsOn === 'function' && vsOn()) && !window.__ff;
  const lite = () => document.body.classList.contains('mob');
  const st = document.createElement('style'); st.textContent = `
#hrfImp{position:fixed;inset:0;pointer-events:none;z-index:44;opacity:0;
  background:radial-gradient(circle at 50% 56%,rgba(255,255,255,.95) 0,rgba(255,236,160,.6) 9%,rgba(255,200,80,.18) 26%,transparent 52%),
  repeating-conic-gradient(from 0deg at 50% 56%,rgba(255,244,190,.7) 0 1deg,transparent 1deg 6deg);
  -webkit-mask:radial-gradient(circle at 50% 56%,#000 0,#000 8%,rgba(0,0,0,.85) 30%,transparent 74%);mask:radial-gradient(circle at 50% 56%,#000 0,#000 8%,rgba(0,0,0,.85) 30%,transparent 74%);mix-blend-mode:screen}
#hrfImp.on{animation:hrfPop .55s cubic-bezier(.1,.7,.2,1) forwards}
@keyframes hrfPop{0%{opacity:1;transform:scale(.55)}100%{opacity:0;transform:scale(1.7)}}
#hrfVig{position:fixed;inset:0;pointer-events:none;z-index:43;opacity:0;background:radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(255,190,60,.55) 100%);mix-blend-mode:screen}
#hrfVig.on{animation:hrfVig 1.1s ease-out forwards}
@keyframes hrfVig{0%{opacity:1}100%{opacity:0}}
.hrfBar{position:fixed;left:0;right:0;height:0;background:#000;pointer-events:none;z-index:42;transition:height .35s cubic-bezier(.2,.8,.2,1)}
#hrfTop{top:0}#hrfBot{bottom:0}
body.hrfCin .hrfBar{height:min(9vh,64px)}
@media (prefers-reduced-motion:reduce){#hrfImp.on,#hrfVig.on{animation-duration:.01s}}`;
  document.head.appendChild(st);
  const mkdiv = (id, cls) => { const d = document.createElement('div'); if (id) d.id = id; if (cls) d.className = cls; document.body.appendChild(d); return d; };
  const imp = mkdiv('hrfImp'), vig = mkdiv('hrfVig'); mkdiv('hrfTop', 'hrfBar'); mkdiv('hrfBot', 'hrfBar');
  const pulse = el => { el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); };
  // 彗星尾跡：一串加法混合的光點＋球身光暈
  const N = 34, trail = [], hist = [], _q = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < N; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffd24a, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.renderOrder = 14; s.visible = false; s.frustumCulled = false; scene.add(s); trail.push(s); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xfff1b0, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); halo.renderOrder = 15; halo.visible = false; halo.frustumCulled = false; scene.add(halo);
  const C0 = new THREE.Color(0xffffff), C1 = new THREE.Color(0xffd24a), C2 = new THREE.Color(0xff7a1a);
  let cur = null;
  function hideTrail() { trail.forEach(s => s.visible = false); halo.visible = false; hist.length = 0; }
  function shower(x, y, z, n, up, spread, life, size) {
    const cols = ['#fff4c0', '#ffd24a', '#ffb02a', '#ff7a1a', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, h = Math.random() * spread, vy = up * (.45 + Math.random() * .75);
      fwSpawn(x, y, z, Math.cos(a) * h, vy, Math.sin(a) * h, cols[(Math.random() * cols.length) | 0], life * (.7 + Math.random() * .6), size * (.6 + Math.random() * .8), 7, .55);
    }
  }
  function begin(pl) {
    cur = { pl, over: pl.sim && pl.sim.over, tail: pl.sim && pl.sim.tail, slow: false, crossed: false, landed: false, t0: performance.now() };
    hideTrail(); document.body.classList.add('hrfCin'); pulse(imp);
    try { CAMC.shake = Math.max(CAMC.shake || 0, .55); CAMC.fov -= 9; } catch (e) { }
    try { hitStop(.05); } catch (e) { }
    try { flashScreen(.45); } catch (e) { }
  }
  function end() { cur = null; hideTrail(); document.body.classList.remove('hrfCin'); }
  const _fc = flowOnContact;
  flowOnContact = function (pl) {
    const r = _fc.apply(this, arguments);
    try { if (pl && pl.plan && pl.plan.kind === 'hr' && !pl.plan.grd && fxOK()) begin(pl); } catch (e) { console.error(e); }
    return r;
  };
  function frame(now) {
    requestAnimationFrame(frame);
    if (!cur) return;
    try {
      if (!fxOK() || typeof PL === 'undefined' || PL !== cur.pl || G.mode !== 'play' || CAMC.mode === 'hrtrot') { end(); return; }
      const t = PL.t || 0, ov = cur.over, tl = cur.tail, k = lite() ? .6 : 1;
      if (ov && !cur.slow && t >= ov.t - .35) { cur.slow = true; if (G.ts === 1) { G.ts = .4; setTimeout(() => { if (G.ts === .4) G.ts = 1; }, 750); } }
      if (ov && !cur.crossed && t >= ov.t) {
        cur.crossed = true; const p = ballMesh.position;
        shower(p.x, p.y, p.z, Math.round(46 * k), 16, 12, 1.5, .9); try { spawnBurst(p.x, p.y, p.z, 11, '#ffe27a'); flashScreen(.3); crowdCheer(2.2); flowSfx('cheer', 2); CAMC.shake = Math.max(CAMC.shake || 0, .45); } catch (e) { }
        pulse(vig);
      }
      if (tl && !cur.landed && tl.hit && t >= tl.tLand) {
        cur.landed = true; const h = tl.hit;
        shower(h.x, h.y + .3, h.z, Math.round(40 * k), 12, 8, 1.2, .8); try { spawnBurst(h.x, h.y + .5, h.z, 7, '#ffffff'); flashScreen(.14); crowdCheer(1.8); CAMC.shake = Math.max(CAMC.shake || 0, .22); } catch (e) { }
      }
      // 尾跡：直接沿著球「剛飛過的軌跡」取樣（每 0.02 秒一點），不受畫面幀率影響，永遠是一條連續的彗星尾巴
      if (ballMesh.visible && (PL.state === 'flight' || PL.state === 'hrdone') && PL.sim && PL.sim.S) {
        const S = PL.sim.S, tt = Math.min(t, PL.sim.tEnd || t), p = ballMesh.position, pu = .5 + .5 * Math.sin(now * .02);
        for (let i = 0; i < N; i++) {
          const s = trail[i], ts = tt - i * .02; if (ts < 0) { s.visible = false; continue; }
          sampleAt(S, ts, _q); const u = i / N; s.visible = true; s.position.set(_q.x, _q.y, _q.z); s.scale.setScalar((1.5 * (1 - u) + .22) * (1 + pu * .12));
          s.material.color.copy(u < .35 ? C0.clone().lerp(C1, u / .35) : C1.clone().lerp(C2, (u - .35) / .65)); s.material.opacity = Math.pow(1 - u, 1.3) * .9;
        }
        halo.visible = true; halo.position.set(p.x, p.y, p.z); halo.scale.setScalar(2.3 + pu * .7); halo.material.opacity = .5 + pu * .25;
      } else { trail.forEach(s => s.visible = false); halo.visible = false; }
      if (PL.state === 'hrdone' && now - cur.t0 > 9000) end();
    } catch (e) { end(); }
  }
  requestAnimationFrame(frame);
  return { get on() { return on; }, set(v) { on = !!v; try { localStorage.setItem('cpbl2027.hrfx', v ? '1' : '0'); } catch (e) { } } };
})();
