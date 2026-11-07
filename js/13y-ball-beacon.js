'use strict';
/* 13y-ball-beacon.js ｜ 球落地後的「找球提示光」
   球在場內落地滾動／停住、還沒被野手撿起（PL.state === 'loose'，或擊出的球已貼地滾動）時，球上會出現：
   ① 球周圍一圈細緻的空心光環 ② 幾顆輕輕閃爍的小星芒 ③ 地面一圈很淡的擴散光環（球本身完全看得見、不再有光柱）。球被撿起（held）／傳出（thrown）／全壘打時自動消失。
   大小會隨「球離鏡頭的距離」調整，讓它在畫面上永遠大約一樣大；只是畫面效果，不影響比賽邏輯（區網對戰兩邊各自顯示，不需同步）。
   關閉：localStorage cpbl2027.beacon=0。依賴：03 的 scene／ballMesh／dotTex／camera，04 的 PL。 */
const BEACON = (function () {
  let on = true; try { on = localStorage.getItem('cpbl2027.beacon') !== '0'; } catch (e) { }
  if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof ballMesh === 'undefined') return { on: false };
  const col = 0xffe9a0, add = THREE.AdditiveBlending;
  const mkTex = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); };
  /* 細緻的空心光環（中心透明，球本身完全看得見）＋ 4 芒小星芒（在球周圍輕輕閃爍） */
  const ringTex = mkTex(128, 128, (g, w) => { const gr = g.createRadialGradient(64, 64, 40, 64, 64, 62); gr.addColorStop(0, 'rgba(255,233,160,0)'); gr.addColorStop(.55, 'rgba(255,233,160,.55)'); gr.addColorStop(.7, 'rgba(255,233,160,.18)'); gr.addColorStop(1, 'rgba(255,233,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const sparkTex = mkTex(64, 64, (g, w) => { const c = w / 2; g.translate(c, c); const gr = g.createRadialGradient(0, 0, 0, 0, 0, c); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.22, 'rgba(255,240,190,.55)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = gr; g.fillRect(-c, -c, w, w); g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 2; i++) { g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(-c * .92, 0); g.quadraticCurveTo(0, -c * .07, c * .92, 0); g.quadraticCurveTo(0, c * .07, -c * .92, 0); g.fill(); } });
  const gTex = mkTex(128, 128, (g, w) => { const gr = g.createRadialGradient(64, 64, 24, 64, 64, 62); gr.addColorStop(0, 'rgba(255,233,160,0)'); gr.addColorStop(.7, 'rgba(255,233,160,.4)'); gr.addColorStop(1, 'rgba(255,233,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: add, opacity: 0 }));
  const gring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: gTex, transparent: true, depthWrite: false, blending: add, opacity: 0 })); gring.rotation.x = -Math.PI / 2; gring.renderOrder = 5;
  const sparks = [0, 1, 2, 3, 4].map(i => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: add, opacity: 0 })); sp.renderOrder = 7; sp.userData = { ph: i * 1.7 + .3, sp: .9 + i * .23, r: .78 + (i % 3) * .14 }; return sp; });
  ring.renderOrder = 6;
  const all = [ring, gring].concat(sparks);
  all.forEach(o => { o.visible = false; o.frustumCulled = false; scene.add(o); });
  let fade = 0, t0 = 0;
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
    fade += ((w ? 1 : 0) - fade) * Math.min(1, dt * (w ? 7 : 12));
    if (fade < .02) { all.forEach(o => o.visible = false); return; }
    const p = ballMesh.position, d = camera.position.distanceTo(p), s = Math.max(.9, Math.min(4, d * .028)), tt = now * .001;
    all.forEach(o => o.visible = true);
    ring.position.set(p.x, Math.max(.2, p.y), p.z); ring.scale.setScalar(s * (1.5 + .08 * Math.sin(tt * 3))); ring.material.opacity = fade * .5;
    const ph = (tt * .9) % 1; gring.position.set(p.x, .09, p.z); gring.scale.set(s * (1.2 + 1.1 * ph), s * (1.2 + 1.1 * ph), 1); gring.material.opacity = fade * (1 - ph) * .3;
    sparks.forEach(sp => { const u = sp.userData, a = tt * u.sp * 1.3 + u.ph * 2.1, tw = Math.max(0, Math.sin(tt * 3.2 * u.sp + u.ph)), r = s * .75 * u.r; sp.position.set(p.x + Math.cos(a) * r * .9, Math.max(.2, p.y) + Math.sin(a * 1.3) * r * .7, p.z + Math.sin(a) * r * .9); sp.scale.setScalar(s * (.17 + .34 * tw)); sp.material.opacity = fade * tw * .95; });
  }
  requestAnimationFrame(tick);
  return { get on() { return on; }, set(v) { on = !!v; try { localStorage.setItem('cpbl2027.beacon', v ? '1' : '0'); } catch (e) { } } };
})();
