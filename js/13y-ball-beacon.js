'use strict';
/* 13y-ball-beacon.js ｜ 球落地後的「找球提示」（v1.1.100 重做：質感簡潔版）
   球在場內落地滾動／停住、還沒被野手撿起（PL.state === 'loose'，或擊出的球已貼地滾動）時，球下方地面會出現：
   ① 一圈貼地的細緻白金色光環（輕微呼吸）② 一圈緩慢向外擴散、漸淡的細漣漪 ③ 光環上每隔約 2 秒「閃一下」（一顆小閃光短暫亮起即消失，位置每次不同），其餘時間完全靜止、不閃爍。
   一般混色（非加法發光）、有深度測試（會被牆／看台正常遮住，不再有穿牆的光暈或亂飄的星芒）；大小隨鏡頭距離微調，畫面上大小穩定。
   球被撿起（held）／傳出（thrown）／全壘打時淡出。只是畫面效果，不影響比賽邏輯（區網對戰兩邊各自顯示，不需同步）。
   關閉：localStorage cpbl2027.beacon=0。依賴：03 的 scene／ballMesh／camera，04 的 PL。 */
const BEACON = (function () {
  let on = true; try { on = localStorage.getItem('cpbl2027.beacon') !== '0'; } catch (e) { }
  if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof ballMesh === 'undefined') return { on: false };
  const mkTex = (w, fn) => { const c = document.createElement('canvas'); c.width = c.height = w; fn(c.getContext('2d'), w); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
  /* 主光環：實線細環＋極淡內填＋柔和外緣，銳利不暈 */
  const ringTex = mkTex(256, (g, w) => {
    const c = w / 2; const fill = g.createRadialGradient(c, c, 0, c, c, c * .74); fill.addColorStop(0, 'rgba(255,244,205,0)'); fill.addColorStop(1, 'rgba(255,244,205,.12)');
    g.fillStyle = fill; g.beginPath(); g.arc(c, c, c * .74, 0, Math.PI * 2); g.fill();
    g.shadowColor = 'rgba(255,236,170,.7)'; g.shadowBlur = 8; g.strokeStyle = 'rgba(255,248,222,.95)'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, c * .74, 0, Math.PI * 2); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6; g.beginPath(); g.arc(c, c, c * .74 - 6, 0, Math.PI * 2); g.stroke();
  });
  /* 漣漪：更細的單線環 */
  const rippleTex = mkTex(256, (g, w) => { const c = w / 2; g.strokeStyle = 'rgba(255,244,205,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c * .8, 0, Math.PI * 2); g.stroke(); });
  const mkPlane = (tex, order) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); m.rotation.x = -Math.PI / 2; m.renderOrder = order; m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
  /* 小閃光：一個亮點＋細十字星芒，沿光環繞行 */
  const glintTex = mkTex(64, (g, w) => { const c = w / 2; const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, 'rgba(255,246,210,.7)'); gr.addColorStop(.5, 'rgba(255,240,190,.12)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 2; i++) { g.save(); g.translate(c, c); g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(-c * .95, 0); g.quadraticCurveTo(0, -c * .05, c * .95, 0); g.quadraticCurveTo(0, c * .05, -c * .95, 0); g.fill(); g.restore(); } });
  const glints = [0].map(i => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp.renderOrder = 7; sp.visible = false; sp.frustumCulled = false; sp.userData = { a0: i * Math.PI, sp: .9 - i * .25, k: i ? .75 : 1 }; scene.add(sp); return sp; });
  const ring = mkPlane(ringTex, 6), ripple = mkPlane(rippleTex, 5), all = [ring, ripple].concat(glints);
  let fade = 0, t0 = 0, gt = 0;      // gt＝提示出現後經過的秒數（閃光用）
  function want() {
    try {
      if (!on || typeof PL === 'undefined' || !PL || PL.done || !ballMesh.visible || G.mode !== 'play') return false;
      if (PL.plan && PL.plan.kind === 'hr') return false;
      const y = ballMesh.position.y; if (PL.state === 'loose') return true;
      return PL.state === 'flight' && y < 1.2 && (PL.t || 0) > .45 && Math.hypot(ballMesh.position.x, ballMesh.position.z) > 6;      // 打出去的球已貼地滾動
    } catch (e) { return false; }
  }
  function tick(now) {
    requestAnimationFrame(tick);
    const w = want(), dt = Math.min(.1, (now - t0) / 1000 || .016); t0 = now;
    fade += ((w ? 1 : 0) - fade) * Math.min(1, dt * (w ? 6 : 10));
    if (fade < .02) { all.forEach(o => o.visible = false); gt = 0; return; }
    gt += dt;
    const p = ballMesh.position, d = camera.position.distanceTo(p), s = Math.max(.8, Math.min(3.2, d * .02)), tt = now * .001;
    all.forEach(o => o.visible = true);
    const gy = .07 + Math.min(.0, p.y * 0);      // 貼地（球在空中時環仍在地面，指出球的地面位置）
    ring.position.set(p.x, gy, p.z); const br = 1 + .05 * Math.sin(tt * 2.6); ring.scale.set(s * 1.25 * br, s * 1.25 * br, 1); ring.material.opacity = fade * .85;
    const ph = (tt * .75) % 1; ripple.position.set(p.x, gy - .01, p.z); const rs = s * (1.25 + .9 * ph); ripple.scale.set(rs, rs, 1); ripple.material.opacity = fade * (1 - ph) * (1 - ph) * .55;
    const rw = s * 1.25 * br * .37;      // 光環在世界座標的半徑
    const FT = 2.0, FD = .4, c = gt - .3, k = c >= 0 ? c % FT : 99, idx = c >= 0 ? Math.floor(c / FT) : 0, env = k < FD ? Math.pow(Math.sin(Math.PI * k / FD), 2) : 0;      // 出現 .3 秒後第一次閃，之後每 2 秒閃 .4 秒；平時 env＝0（完全看不到）
    glints.forEach(sp => { const a = -.9 + idx * 2.4, rw2 = rw; sp.visible = env > .01; sp.position.set(p.x + Math.cos(a) * rw2, gy + .12, p.z + Math.sin(a) * rw2); sp.scale.setScalar(s * (.14 + .16 * env)); sp.material.opacity = fade * env * .95; });
  }
  requestAnimationFrame(tick);
  return { get on() { return on; }, set(v) { on = !!v; try { localStorage.setItem('cpbl2027.beacon', v ? '1' : '0'); } catch (e) { } } };
})();
