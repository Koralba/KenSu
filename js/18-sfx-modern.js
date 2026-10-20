/* 18-sfx-modern.js — 現代音效改版（擊球聲／觀眾聲）（原 script.js 第 4138-4216 行） */
'use strict';
/* ===== 現代棒球音效改版：以噪音塑形取代電子音（擊球木棒聲、皮手套、觀眾掌聲／歡呼／嘆息） ===== */
function shapedNoise(dur, f0, f1, q, peak, att, type, dest) {
  const C = SND.ctx; if (!C) return; const n = Math.floor(C.sampleRate * dur), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); let l = 0;
  for (let i = 0; i < n; i++) { l = l * .85 + (Math.random() * 2 - 1) * .15; d[i] = l * 2.6; }
  const s = C.createBufferSource(); s.buffer = b; const f = C.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = q; const t = C.currentTime;
  f.frequency.setValueAtTime(f0, t); f.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(dur * .8, att)); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || SND.master); s.start(t);
}
function apOK(gap) { const C = SND.ctx; if (!C) return false; const t = C.currentTime; if (SND.apT && t - SND.apT < gap) return false; SND.apT = t; return true; }
function applause(dur, v) {      // 掌聲：許多短促、隨機的「啪」疊成一片，底下墊一層噪音
  const C = SND.ctx; if (!C || !SND.on) return; v = clamp(v == null ? 1 : v, .3, 2.4);
  const n = Math.min(260, Math.round(dur * 38 * Math.min(v, 1.6)));
  for (let i = 0; i < n; i++) {
    const u = Math.random(), env = Math.sin(Math.PI * Math.pow(u, .7)), at = u * dur * 1000;
    setTimeout(() => { if (!SND.ctx || !SND.on) return; noiseBurst(.018 + Math.random() * .03, 1200 + Math.random() * 2600, .7 + Math.random() * .8, (.05 + .09 * Math.random()) * env * Math.min(v, 1.6), 'bandpass'); }, at);
  }
  shapedNoise(dur, 1800, 1500, .5, .10 * Math.min(v, 1.6), dur * .3, 'bandpass');
}
function crowdGasp(v) { shapedNoise(.5, 500, 900, 1.2, .16 * (v || 1), .12, 'bandpass'); }
function crowdGroan(v) { shapedNoise(1.1, 520, 300, 1.0, .15 * (v || 1), .25, 'bandpass'); }
crowdRoar = function (v) {      // 觀眾歡呼：人聲共振峰噪音浪潮＋掌聲，沒有任何正弦哨音
  const C = SND.ctx; if (!C || !SND.on) return; v = clamp(v, .5, 2.6); const dur = 2.2 + v * 1.6, pk = Math.min(.9, .2 * v + .06);
  shapedNoise(dur, 520, 700, .8, pk, .5, 'bandpass'); shapedNoise(dur, 1250, 1500, .9, pk * .7, .6, 'bandpass'); shapedNoise(dur, 300, 380, .6, pk * .6, .4, 'lowpass');
  applause(dur * .9, v * .8);
};
hitSfx = function (res) {      // 木棒擊球：脆響＋低頻悶響＋極短音高下滑，輔以球場殘響
  if (!SND.ctx || !SND.on) return;
  const D = stadiumBus() || SND.master, Q = clamp(res.Q == null ? .5 : res.Q, 0, 1), ev = res.ev || 25, ang = res.ang || 10, hard = clamp((ev - 20) / 32, 0, 1), v = clamp(.6 + ev / 60, .65, 1.3) * (res.power ? 1.1 : 1);
  const nz = (d, f, q, g, t) => noiseBurst(d, f, q, g, t || 'bandpass', D);
  if (res.bunt) { nz(.04, res.tip ? 2400 : 1500, 1.2, .3); nz(.08, 300, 1, .3, 'lowpass'); return; }
  if (res.tip) { nz(.02, 2800, 1.3, .3); nz(.05, 1400, 1.5, .18); return; }
  if (res.broken) setTimeout(() => { nz(.09, 2000, 1.1, .5); nz(.16, 650, 1.4, .4); shapedNoise(.12, 3000, 1200, 1, .25, .005, 'bandpass', D); }, 8);
  const sweet = Q > .78 && !res.marginal && Math.abs(res.s || 0) < .5, weak = Q < .35 || res.marginal || Math.abs(res.bp || 0) > .85 || Math.abs(res.s || 0) > .6;
  nz(.012, sweet ? 3400 : weak ? 1800 : 2600, .9, (sweet ? 1 : weak ? .45 : .75) * v);                          // 瞬間撞擊
  nz(.05, sweet ? 2000 : weak ? 1000 : 1500, 4, (sweet ? .9 : weak ? .4 : .65) * v);                           // 木頭「叩」
  nz(.12, weak ? 200 : 140, .9, (.5 + hard * .3) * v, 'lowpass');                                                // 低頻悶響
  tone(weak ? 170 : 130, .09, .3 * v, 'sine', .45, D);                                                          // 短促音高下滑
  if (ev > 26) setTimeout(() => nz(.08, 1300, 1, .1), 90 + Math.random() * 25);
  if (ev > 30 && ang >= 8) setTimeout(() => sweepNoise(.4 + ev * .006, 2200, 800, 1.3, clamp((ev - 28) / 45, .1, .3), 'bandpass'), 45);
  if (res.hr || ev > 38) setTimeout(() => applause(1.2, .6), 250);
};
bounceSfx = function (b) {
  if (!SND.ctx || !SND.on) return; const k = clamp(b.v / 24, .12, 1), dirt = Math.hypot(b.x, b.z + 14) < 24;
  noiseBurst(.07 + .05 * k, dirt ? 500 : 260, .9, .5 * k, 'lowpass'); noiseBurst(.012, dirt ? 2400 : 1600, 1, .12 * k, 'highpass');
};
hitFanfare = function (n) {      // 安打：掌聲＋歡呼，長打更熱烈
  if (!SND.ctx || !SND.on) return;
  if (n === 1) { applause(2.4, .8); crowdRoar(.7); }
  else if (n === 2) { applause(3.4, 1.1); crowdRoar(1.2); }
  else { applause(4.5, 1.5); crowdRoar(1.7); setTimeout(() => applause(2.5, 1.2), 2200); }
};
hrFanfare = function (n) {      // 全壘打：大歡呼＋多波掌聲
  if (!SND.ctx || !SND.on) return;
  crowdRoar(2.5); applause(5, 1.8);
  setTimeout(() => { crowdRoar(2.2); applause(4, 1.6); }, 1800);
  setTimeout(() => { crowdRoar(1.8); applause(3.5, 1.4); }, 4200);
  if (n >= 3) setTimeout(() => { crowdRoar(2.2); applause(3, 1.5); }, 6000);
};
{
  const _flow = flowSfx;
  flowSfx = function (n, v) {
    if (!SND.ctx || !SND.on) return; v = v || 1;
    switch (n) {
      case 'mitt': noiseBurst(.03, 1800, 1.2, .8 * v, 'bandpass'); noiseBurst(.09, 600, 1, .7 * v, 'lowpass'); noiseBurst(.05, 250, 1, .5 * v, 'lowpass'); return;
      case 'hit': case 'meet': noiseBurst(.03, 2400, 1, .5 * v); noiseBurst(.08, 180, 1, .5 * v, 'lowpass'); return;
      case 'bounce': noiseBurst(.07, 300, 1, .35, 'lowpass'); return;
      case 'wall': noiseBurst(.15, 700, 1, .5, 'bandpass'); noiseBurst(.2, 180, 1, .55, 'lowpass'); return;
      case 'strike': if (apOK(1.2)) applause(.8, .35); return;
      case 'ball': if (apOK(1.2)) shapedNoise(.5, 600, 500, 1, .06, .1, 'bandpass'); return;
      case 'out': case 'outcall': if (apOK(1.2)) applause(1.1, .5); return;
      case 'whistle': shapedNoise(.35, 2600, 2900, 9, .12, .05, 'bandpass'); return;
      case 'jingle': crowdRoar(1.4); applause(3.5, 1.2); return;
      case 'boom': noiseBurst(.45, 160, 1.1, .7 * v, 'lowpass'); return;
    }
    return _flow(n, v);
  };
}

