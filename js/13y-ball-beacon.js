'use strict';
/* 13y-ball-beacon.js ｜ 球落地後的「找球提示光」
   球在場內落地滾動／停住、還沒被野手撿起（PL.state === 'loose'，或擊出的球已貼地滾動）時，球上會出現：
   ① 發光光暈（跟著球）② 地面脈動光環 ③ 向上的光柱（遠處也看得到）。球被撿起（held）／傳出（thrown）／全壘打時自動消失。
   大小會隨「球離鏡頭的距離」調整，讓它在畫面上永遠大約一樣大；只是畫面效果，不影響比賽邏輯（區網對戰兩邊各自顯示，不需同步）。
   關閉：localStorage cpbl2027.beacon=0。依賴：03 的 scene／ballMesh／dotTex／camera，04 的 PL。 */
const BEACON = (function () {
  let on = true; try { on = localStorage.getItem('cpbl2027.beacon') !== '0'; } catch (e) { }
  if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof ballMesh === 'undefined') return { on: false };
  const col = 0xfff05a, add = THREE.AdditiveBlending;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: col, transparent: true, depthTest: false, depthWrite: false, blending: add, opacity: 0 }));
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 30, 64, 64, 62); gr.addColorStop(0, 'rgba(255,240,90,0)'); gr.addColorStop(.62, 'rgba(255,240,90,.15)'); gr.addColorStop(.84, 'rgba(255,250,170,.95)'); gr.addColorStop(1, 'rgba(255,240,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t; })();
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: add, opacity: 0 })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5;
  const beamTex = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,245,120,.95)'); gr.addColorStop(.5, 'rgba(255,240,90,.35)'); gr.addColorStop(1, 'rgba(255,240,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 128); const hz = g.createLinearGradient(0, 0, 16, 0); return new THREE.CanvasTexture(c); })();
  const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamTex, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: add, opacity: 0 }));
  beam.center.set(.5, 0); beam.renderOrder = 5; halo.renderOrder = 6;
  [halo, ring, beam].forEach(o => { o.visible = false; o.frustumCulled = false; scene.add(o); });
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
    if (fade < .02) { halo.visible = ring.visible = beam.visible = false; return; }
    const p = ballMesh.position, d = camera.position.distanceTo(p), k = Math.max(.9, Math.min(5.5, d * .05)), pul = .5 + .5 * Math.sin(now * .008);
    halo.visible = ring.visible = beam.visible = true;
    halo.position.set(p.x, Math.max(.3, p.y), p.z); halo.scale.setScalar(k * (1.5 + .5 * pul)); halo.material.opacity = fade * (.55 + .3 * pul);
    ring.position.set(p.x, .09, p.z); const rs = k * (1.6 + 1.5 * ((now * .0017) % 1)); ring.scale.set(rs, rs, 1); ring.material.opacity = fade * (1 - ((now * .0017) % 1)) * .95;
    beam.position.set(p.x, .1, p.z); beam.scale.set(k * .55, Math.max(6, d * .28), 1); beam.material.opacity = fade * (.5 + .25 * pul);
  }
  requestAnimationFrame(tick);
  return { get on() { return on; }, set(v) { on = !!v; try { localStorage.setItem('cpbl2027.beacon', v ? '1' : '0'); } catch (e) { } } };
})();
