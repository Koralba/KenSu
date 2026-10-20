/* 17-bgm.js — 背景音樂（原 script.js 第 3848-4137 行） */
'use strict';
/* ---------------- 背景音樂（WebAudio 即時合成：輕鬆爵士／球場午後） ---------------- */
const BGM = { vol: 50, mute: false, ctx: null, bus: null, ch: null, inst: null, lead: null, drum: null, gtr: null, noise: null, timer: 0, step: 0, t0: 0, track: 2, beat: .6, swing: .6, irc: {} };
try { const v = localStorage.getItem('cpbl_bgm_vol'), m = localStorage.getItem('cpbl_bgm_mute'); if (v !== null && !isNaN(+v)) BGM.vol = clamp(+v, 0, 100); BGM.mute = m === '1'; const tk = localStorage.getItem('cpbl_bgm_track'); if (tk !== null && !isNaN(+tk) && +tk >= 0 && +tk < 5) BGM.track = +tk | 0; } catch (e) { }
try { if (localStorage.getItem('cpbl_bgm_v2') !== '1') { BGM.track = 2; BGM.vol = Math.min(BGM.vol, 50); localStorage.setItem('cpbl_bgm_v2', '1'); localStorage.setItem('cpbl_bgm_track', '2'); localStorage.setItem('cpbl_bgm_vol', String(BGM.vol)); } } catch (e) { }      // 一次性：預設改為「應援號角」、音量不超過 50
const BGM_LOOP = 128;
const BGM_CH = {
  Cmaj7: { r: 48, v: [55, 59, 62, 64] }, Am7: { r: 45, v: [55, 57, 60, 64] }, Dm7: { r: 50, v: [53, 57, 60, 62] }, G7: { r: 43, v: [53, 55, 59, 62] },
  Em7: { r: 52, v: [55, 59, 62, 67] }, A7: { r: 45, v: [55, 59, 61, 64] }, Fmaj7: { r: 53, v: [57, 60, 64, 67] }
};
const BGM_SONG = [   // c: 和弦（1個＝整小節、2個＝各半小節）  m: 旋律 [八分音符位置, MIDI, 長度]
  { c: ['Cmaj7'], m: [[0, 76, 2], [3, 74, 1], [4, 72, 2], [6, 67, 2]] },
  { c: ['Am7'], m: [[0, 69, 2], [2, 72, 1], [3, 76, 3], [7, 74, 1]] },
  { c: ['Dm7'], m: [[0, 74, 2], [3, 72, 1], [4, 69, 2], [6, 72, 2]] },
  { c: ['G7'], m: [[0, 71, 2], [2, 74, 2], [4, 72, 1], [5, 71, 1], [6, 67, 2]] },
  { c: ['Cmaj7'], m: [[0, 76, 2], [3, 79, 1], [4, 76, 2], [6, 74, 1], [7, 72, 1]] },
  { c: ['Em7', 'A7'], m: [[0, 71, 2], [2, 76, 2], [4, 73, 2], [6, 76, 2]] },
  { c: ['Dm7'], m: [[0, 74, 2], [2, 77, 2], [4, 76, 1], [5, 74, 1], [6, 72, 2]] },
  { c: ['G7'], m: [[0, 71, 3], [3, 67, 1], [4, 69, 2], [6, 71, 2]] },
  { c: ['Fmaj7'], m: [[0, 72, 2], [2, 76, 1], [3, 77, 1], [4, 76, 2], [6, 72, 2]] },
  { c: ['Em7'], m: [[0, 71, 2], [2, 74, 1], [3, 76, 3], [6, 74, 2]] },
  { c: ['Dm7'], m: [[0, 72, 2], [2, 74, 1], [3, 77, 1], [4, 76, 2], [6, 74, 2]] },
  { c: ['G7'], m: [[0, 71, 2], [3, 74, 1], [4, 79, 3], [7, 77, 1]] },
  { c: ['Em7'], m: [[0, 76, 3], [3, 74, 1], [4, 71, 2], [6, 74, 2]] },
  { c: ['Am7'], m: [[0, 72, 2], [2, 76, 2], [4, 81, 2], [6, 76, 2]] },
  { c: ['Dm7', 'G7'], m: [[0, 77, 2], [2, 74, 2], [4, 74, 1], [5, 71, 1], [6, 71, 2]] },
  { c: ['Cmaj7'], m: [[0, 76, 3], [3, 72, 1], [4, 67, 4]] }
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const bgmStepTime = i => Math.floor(i / 2) * BGM.beat + (i % 2 ? BGM.beat * BGM.swing : 0);
const bgmGainVal = () => BGM.mute ? 0 : Math.pow(BGM.vol / 100, 1.5) * 1.5;
function bgmApplyVol(first) {
  if (!BGM.bus) return; const t = BGM.ctx.currentTime;
  BGM.bus.gain.cancelScheduledValues(t); BGM.bus.gain.setTargetAtTime(bgmGainVal(), t + (first ? .3 : 0), first ? 1.2 : .06);
}
function bgmPulseWave(C, duty) { const n = 40, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) { re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * duty); im[k] = 2 / (k * Math.PI) * (1 - Math.cos(k * Math.PI * duty)); } return C.createPeriodicWave(re, im); }
function bgmDistCurve(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * k); } return c; }
function bgmChain(o) {      // 每首曲子各自一組音效鏈（殘響／延遲／失真吉他／鼓），切歌時舊的快速淡出
  const C = BGM.ctx, out = C.createGain(); out.gain.value = 0; out.connect(BGM.bus);
  const inst = C.createGain(); inst.connect(out);
  let ir = BGM.irc[o.rev]; if (!ir) { const len = Math.floor(C.sampleRate * o.rev); ir = C.createBuffer(2, len, C.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); } BGM.irc[o.rev] = ir; }
  const conv = C.createConvolver(); conv.buffer = ir; const wet = C.createGain(); wet.gain.value = o.revWet; inst.connect(conv); conv.connect(wet); wet.connect(out);
  const lead = C.createGain(); lead.connect(inst);
  const dl = C.createDelay(1.5); dl.delayTime.value = Math.min(1.4, BGM.beat * o.dly); const fb = C.createGain(); fb.gain.value = o.fb;
  const dlp = C.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600; const dw = C.createGain(); dw.gain.value = o.dw;
  lead.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dw); dw.connect(inst);
  const drum = C.createGain(); drum.gain.value = o.drum; drum.connect(out);
  const gtr = C.createGain(), sh = C.createWaveShaper(); sh.curve = BGM.dist; sh.oversample = '2x'; const glp = C.createBiquadFilter(); glp.type = 'lowpass'; glp.frequency.value = 4200; const gg = C.createGain(); gg.gain.value = .55;
  gtr.connect(sh); sh.connect(glp); glp.connect(gg); gg.connect(inst);      // 失真吉他匯流排
  return { out, inst, lead, drum, gtr };
}
function bgmSelect(i) {
  i = clamp(i | 0, 0, BGM_TRACKS.length - 1); BGM.track = i; const C = BGM.ctx; if (!C || !BGM.bus) return;
  const T = BGM_TRACKS[i], now = C.currentTime, old = BGM.ch;
  if (old) { old.out.gain.cancelScheduledValues(now); old.out.gain.setTargetAtTime(0, now, .04); setTimeout(() => { try { old.out.disconnect(); } catch (e) { } }, 2600); }
  BGM.beat = 60 / T.bpm; BGM.swing = T.swing; const ch = bgmChain(T.mix); BGM.ch = ch; BGM.inst = ch.inst; BGM.lead = ch.lead; BGM.drum = ch.drum; BGM.gtr = ch.gtr;
  ch.out.gain.setValueAtTime(0, now); ch.out.gain.setTargetAtTime(T.trim, now + (old ? .2 : .05), .07);
  BGM.step = 0; BGM.t0 = now + (old ? .22 : .25);
}
function bgmInit(C) {
  if (BGM.bus) return; BGM.ctx = C;
  const bus = C.createGain(); bus.gain.value = 0; const comp = C.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = .005; comp.release.value = .2;
  const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8500; bus.connect(comp); comp.connect(lp); lp.connect(C.destination);
  const nb = C.createBuffer(1, C.sampleRate, C.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  BGM.bus = bus; BGM.noise = nb; BGM.dist = bgmDistCurve(38); BGM.pulse25 = bgmPulseWave(C, .25); BGM.pulse125 = bgmPulseWave(C, .125);
  bgmSelect(BGM.track); bgmApplyVol(true);
  BGM.timer = setInterval(bgmTick, 100);
}
function bgmTick() {
  const C = BGM.ctx; if (!C || C.state !== 'running' || !BGM.ch) return; const T = BGM_TRACKS[BGM.track];
  const horizon = C.currentTime + 1.0; let guard = 0;
  while (guard++ < 64) {
    const t = BGM.t0 + bgmStepTime(BGM.step); if (t > horizon) break;
    if (t >= C.currentTime - .02 && !BGM.mute && BGM.vol > 0) { try { T.play(BGM.step, t); } catch (e) { } }
    BGM.step++;
  }
}
function bgmRhodes(m, t, d, v) {
  const C = BGM.ctx, f = mtof(m), e = Math.min(.45, d * .9);
  const g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500 + v * 2200;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .09, t + .008); g.gain.exponentialRampToValueAtTime(v * .04, t + e); g.gain.setTargetAtTime(0, t + d, .14);
  [[1, 1, 0, 0], [2, .2, 0, 1], [1, .45, 5, 0]].forEach(a => {
    const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = f * a[0]; o.detune.value = a[2]; const og = C.createGain(); og.gain.setValueAtTime(a[1], t);
    if (a[3]) og.gain.exponentialRampToValueAtTime(.0005, t + .28); o.connect(og); og.connect(lp); o.start(t); o.stop(t + d + 1.1);
  });
  lp.connect(g); g.connect(BGM.inst);
}
function bgmBell(m, t, d, v) {
  const C = BGM.ctx, f = mtof(m), dur = Math.max(d, .3) + .4; const g = C.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .11, t + .006); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  [[1, 1, 1], [2, .22, .5], [4, .1, .12]].forEach(a => {
    const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = f * a[0]; const og = C.createGain(); og.gain.setValueAtTime(a[1], t); og.gain.exponentialRampToValueAtTime(.001, t + dur * a[2] + .05);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .1);
  });
  g.connect(BGM.lead);
}
function bgmBass(m, t, d, v) {
  const C = BGM.ctx, f = mtof(m), g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .2, t + .012); g.gain.exponentialRampToValueAtTime(v * .11, t + Math.min(.15, d * .5)); g.gain.setTargetAtTime(0, t + d, .06);
  [['triangle', 1, 1], ['sine', 2, .15]].forEach(a => { const o = C.createOscillator(); o.type = a[0]; o.frequency.value = f * a[1]; const og = C.createGain(); og.gain.value = a[2]; o.connect(og); og.connect(lp); o.start(t); o.stop(t + d + .5); });
  lp.connect(g); g.connect(BGM.inst);
}
function bgmPad(notes, t, d) {
  const C = BGM.ctx, g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.012, t + .5); g.gain.setTargetAtTime(0, t + d, .5);
  notes.forEach(m => [-7, 7].forEach(dt => { const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + d + 2.4); }));
  lp.connect(g); g.connect(BGM.inst);
}
function bgmNoise(t, type, freq, q, dur, gain) {
  const C = BGM.ctx, s = C.createBufferSource(); s.buffer = BGM.noise; const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = C.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur); s.connect(f); f.connect(g); g.connect(BGM.drum); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
}
function bgmKick(t, v) {
  const C = BGM.ctx, o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + .12);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .22); o.connect(g); g.connect(BGM.drum); o.start(t); o.stop(t + .25);
}
function bgmPlayStep(n, t) {
  const s = n % BGM_LOOP, bar = s >> 3, st = s & 7, loop = Math.floor(n / BGM_LOOP), B = BGM_SONG[bar];
  const tr = (loop % 4) >= 2 ? 2 : 0, intro = loop === 0 && bar < 2, hu = () => (Math.random() - .5) * .016;
  const dur = k => bgmStepTime(n + k) - bgmStepTime(n);
  const nc = B.c.length, clen = nc === 1 ? 8 : 4;
  B.c.forEach((name, ci) => {
    const at = ci * clen, C = BGM_CH[name]; if (!C) return;
    const rel = st - at; if (rel < 0 || rel >= clen) return;
    if (rel === 0 || rel === 3 || (rel === 6 && clen === 8)) {         // 電鋼琴：切分和弦
      const first = rel === 0, d = first ? dur(2.7) : dur(1.4), v = first ? 1 : (rel === 3 ? .55 : .5);
      C.v.forEach((m, i) => bgmRhodes(m + tr, t + i * .014 + hu(), d, v * (.9 + Math.random() * .2)));
    }
    if (rel === 0) bgmPad(C.v.map(m => m + tr), t, dur(clen));
    if (!intro) {                                                       // 貝斯：根音－五度－根音
      if (rel === 0) bgmBass(C.r + tr, t, dur(2.7), 1);
      else if (rel === 3) bgmBass(C.r + 7 + tr, t, dur(1), .8);
      else if (rel === 4 && clen === 8) bgmBass(C.r + tr, t, dur(2.6), .85);
    }
  });
  B.m.forEach(x => { if (x[0] === st && !(loop % 2 === 1 && bar < 4)) bgmBell(x[1] + tr, t + hu() * .5, dur(x[2]), .85 + Math.random() * .25); });
  if (!intro) {                                                         // 輕柔鼓組：刷鼓感
    bgmNoise(t, 'highpass', 7500, .7, .04, st % 2 ? .035 : .055);
    if (st === 0 || st === 4) bgmKick(t, .38);
    if (st === 2 || st === 6) { bgmNoise(t, 'bandpass', 1800, .8, .09, .12); }
    if (bar % 8 === 7 && st === 7) bgmNoise(t, 'bandpass', 2200, .8, .08, .09);
  }
}
/* ---- 新增樂器 ---- */
function bgmGuitar(ms, t, d, v) {      // 失真吉他和弦（動力和弦／悶音切音）
  const C = BGM.ctx, g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .2, t + .006); g.gain.setTargetAtTime(v * .11, t + .02, Math.max(.04, d * .45)); g.gain.setTargetAtTime(0, t + d, .035); g.connect(BGM.gtr);
  ms.forEach(m => [-7, 7].forEach(dt => { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(g); o.start(t); o.stop(t + d + .25); }));
}
function bgmLeadG(m, t, d, v) {      // 主音吉他（過載＋顫音）
  const C = BGM.ctx, f = mtof(m), g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .2, t + .012); g.gain.setTargetAtTime(v * .15, t + .05, .3); g.gain.setTargetAtTime(0, t + d, .05); g.connect(BGM.gtr);
  const o = C.createOscillator(), o2 = C.createOscillator(), g2 = C.createGain(); o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f; o2.detune.value = 5; g2.gain.value = .5; o.connect(g); o2.connect(g2); g2.connect(g);
  const l = C.createOscillator(), lg = C.createGain(); l.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(.35, d)); l.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
  const e = t + d + .3; o.start(t); o2.start(t); l.start(t); o.stop(e); o2.stop(e); l.stop(e);
}
function bgmSynBass(m, t, d, v, type, cut) {
  const C = BGM.ctx, o = C.createOscillator(), g = C.createGain(), lp = C.createBiquadFilter(); o.type = type || 'sawtooth'; o.frequency.value = mtof(m); lp.type = 'lowpass'; lp.frequency.setValueAtTime((cut || 600) * 2.2, t); lp.frequency.exponentialRampToValueAtTime(cut || 600, t + .12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .22, t + .008); g.gain.setTargetAtTime(0, t + d, .03); o.connect(lp); lp.connect(g); g.connect(BGM.inst); o.start(t); o.stop(t + d + .2);
}
function bgmBrass(ms, t, d, v) {      // 銅管（小號／長號）：亮度隨音頭展開，帶一點顫音
  const C = BGM.ctx;
  ms.forEach(m => {
    const o = C.createOscillator(), o2 = C.createOscillator(), g = C.createGain(), lp = C.createBiquadFilter(); o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m); o2.detune.value = 6;
    lp.type = 'lowpass'; lp.Q.value = .8; lp.frequency.setValueAtTime(450, t); lp.frequency.linearRampToValueAtTime(2000, t + .08); lp.frequency.setTargetAtTime(1250, t + .1, .2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .07, t + .03); g.gain.setTargetAtTime(v * .05, t + .07, .15); g.gain.setTargetAtTime(0, t + d, .045);
    const l = C.createOscillator(), lg = C.createGain(); l.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(10, t + .25); l.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(BGM.lead); const e = t + d + .35; o.start(t); o2.start(t); l.start(t); o.stop(e); o2.stop(e); l.stop(e);
  });
}
function bgmPluck(m, t, d, v) {      // 烏克麗麗彈撥
  const C = BGM.ctx, f = mtof(m), g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(900, t + .25);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .11, t + .004); g.gain.setTargetAtTime(0, t + .005, Math.min(.22, d * .5));
  [['triangle', 1, 1], ['sine', 2, .35]].forEach(([ty, k, a]) => { const o = C.createOscillator(), og = C.createGain(); o.type = ty; o.frequency.value = f * k; og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + .7); });
  lp.connect(g); g.connect(BGM.inst);
}
function bgmMarimba(m, t, d, v) {
  const C = BGM.ctx, f = mtof(m), g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .16, t + .003); g.gain.setTargetAtTime(0, t + .004, Math.min(.2, .07 + d * .12));
  [[1, 1], [4, .28], [10, .06]].forEach(([k, a]) => { const o = C.createOscillator(), og = C.createGain(); o.type = 'sine'; o.frequency.value = f * k; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + .7); });
  g.connect(BGM.lead);
}
function bgmPulse(m, t, d, v, duty, dest) {      // 8-bit 方波／脈衝波
  const C = BGM.ctx, o = C.createOscillator(), g = C.createGain(); if (duty >= .5) o.type = 'square'; else o.setPeriodicWave(duty < .2 ? BGM.pulse125 : BGM.pulse25); o.frequency.value = mtof(m);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .1, t + .004); g.gain.setTargetAtTime(v * .07, t + .02, .1); g.gain.setTargetAtTime(0, t + d, .015); o.connect(g); g.connect(dest || BGM.lead); o.start(t); o.stop(t + d + .12);
}
function bgmSnare(t, v) {
  bgmNoise(t, 'bandpass', 2400, .8, .17, v * .55); bgmNoise(t, 'highpass', 5000, .7, .08, v * .25);
  const C = BGM.ctx, o = C.createOscillator(), g = C.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(130, t + .08); g.gain.setValueAtTime(v * .3, t); g.gain.exponentialRampToValueAtTime(.001, t + .11); o.connect(g); g.connect(BGM.drum); o.start(t); o.stop(t + .13);
}
function bgmHat(t, v, open) { bgmNoise(t, 'highpass', 8000, .7, open ? .22 : .045, v * (open ? .12 : .1)); }
function bgmCrash(t, v) { bgmNoise(t, 'highpass', 4500, .6, 1.3, v * .2); }
function bgmTom(t, f, v) { const C = BGM.ctx, o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .55, t + .16); g.gain.setValueAtTime(v * .5, t); g.gain.exponentialRampToValueAtTime(.001, t + .24); o.connect(g); g.connect(BGM.drum); o.start(t); o.stop(t + .27); }
function bgmClap(t, v) { [0, .011, .024].forEach((o, i) => bgmNoise(t + o, 'bandpass', 1500, .9, i === 2 ? .11 : .03, v * .22)); }
function bgmBlock(t, f, v) { const C = BGM.ctx, o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v * .25, t); g.gain.exponentialRampToValueAtTime(.001, t + .06); o.connect(g); g.connect(BGM.drum); o.start(t); o.stop(t + .08); }

/* ---- 曲目 2：熱血決戰（A 小調・156 BPM・失真吉他搖滾） ---- */
const ROCK_R = [45, 41, 48, 43, 45, 41, 43, 45, 41, 43, 45, 40, 41, 43, 40, 40];
const ROCK_MEL = [
  [[0, 76, 2], [2, 76, 1], [3, 74, 1], [4, 72, 2], [6, 74, 2]], [[0, 72, 2], [2, 69, 2], [4, 72, 2], [6, 77, 2]], [[0, 76, 2], [2, 76, 1], [3, 79, 1], [4, 76, 2], [6, 72, 2]], [[0, 74, 3], [3, 71, 1], [4, 74, 2], [6, 79, 2]],
  [[0, 81, 2], [2, 79, 1], [3, 76, 1], [4, 72, 2], [6, 76, 2]], [[0, 77, 2], [2, 76, 1], [3, 72, 1], [4, 69, 2], [6, 72, 2]], [[0, 74, 2], [2, 76, 1], [3, 74, 1], [4, 71, 2], [6, 74, 2]], [[0, 69, 4], [4, 72, 1], [5, 74, 1], [6, 76, 2]],
  [[0, 81, 2], [2, 81, 1], [3, 79, 1], [4, 77, 2], [6, 76, 2]], [[0, 79, 2], [2, 79, 1], [3, 77, 1], [4, 76, 2], [6, 74, 2]], [[0, 76, 2], [2, 81, 2], [4, 79, 2], [6, 76, 2]], [[0, 76, 2], [2, 79, 2], [4, 83, 3], [7, 81, 1]],
  [[0, 81, 2], [2, 81, 1], [3, 79, 1], [4, 77, 2], [6, 79, 2]], [[0, 83, 2], [2, 81, 1], [3, 79, 1], [4, 74, 2], [6, 79, 2]], [[0, 80, 2], [2, 83, 2], [4, 81, 2], [6, 80, 2]], [[0, 76, 4], [4, 80, 2], [6, 83, 2]]
];
function rockPlay(n, t) {
  const s = n % 128, bar = s >> 3, st = s & 7, loop = Math.floor(n / 128), dur = k => bgmStepTime(n + k) - bgmStepTime(n);
  const R = ROCK_R[bar], pw = [R + 12, R + 19, R + 24], chorus = bar >= 8, intro = loop === 0 && bar < 2, fill = (bar & 3) === 3;
  if (intro) { if (st === 0) bgmGuitar(pw, t, dur(8), .7); }
  else if (chorus) { if (st === 0 || st === 4) bgmGuitar(pw, t, dur(3.6), 1); else if (st === 2 || st === 6) bgmGuitar(pw, t, dur(1.5), .7); }
  else bgmGuitar(pw.slice(0, 2), t, dur(.75), st === 0 || st === 4 ? 1 : .68);      // 悶音切音（palm mute）
  bgmSynBass(st === 3 || st === 7 ? R + 12 : R, t, dur(.9), st === 0 ? 1 : .75, 'sawtooth', 520);
  if (!intro) ROCK_MEL[bar].forEach(x => { if (x[0] === st) bgmLeadG(x[1], t, dur(x[2]) * .96, 1); });
  bgmHat(t, st % 2 ? .5 : .85, chorus && st === 7);
  if (st === 0 || st === 3 || st === 4 || (chorus && st === 5)) bgmKick(t, .62);
  if ((st === 2 || st === 6) && !(fill && st === 6)) bgmSnare(t, 1);
  if (fill && st >= 5) { if (st === 5) bgmTom(t, 210, .9); else if (st === 6) { bgmSnare(t, .9); bgmTom(t, 160, .9); } else { bgmSnare(t, 1); bgmTom(t, 110, 1); } }
  if (st === 0 && (bar & 3) === 0 && !(loop === 0 && bar === 0)) bgmCrash(t, 1);
}

/* ---- 曲目 3：應援號角（C 大調・140 BPM・銅管進行曲＋拍手） ---- */
const BR_R = [48, 41, 43, 48, 45, 41, 43, 43, 41, 43, 40, 45, 41, 43, 48, 48];
const BR_T = [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67], [60, 64, 69], [60, 65, 69], [59, 62, 67], [59, 62, 67], [60, 65, 69], [59, 62, 67], [59, 64, 67], [60, 64, 69], [60, 65, 69], [59, 62, 67], [60, 64, 67], [60, 64, 67]];
const BR_MEL = [
  [[0, 67, 1], [1, 72, 1], [2, 76, 2], [4, 79, 1], [5, 79, 1], [6, 76, 2]], [[0, 77, 1], [1, 77, 1], [2, 72, 2], [4, 69, 1], [5, 72, 1], [6, 77, 2]], [[0, 74, 1], [1, 74, 1], [2, 79, 2], [4, 77, 1], [5, 74, 1], [6, 71, 2]], [[0, 72, 2], [2, 76, 1], [3, 79, 1], [4, 84, 4]],
  [[0, 81, 2], [2, 76, 1], [3, 81, 1], [4, 79, 2], [6, 76, 2]], [[0, 77, 2], [2, 72, 1], [3, 77, 1], [4, 81, 2], [6, 77, 2]], [[0, 79, 1], [1, 79, 1], [2, 74, 2], [4, 71, 1], [5, 74, 1], [6, 79, 2]], [[0, 79, 4], [4, 83, 1], [5, 81, 1], [6, 79, 1], [7, 77, 1]],
  [[0, 81, 1], [1, 81, 1], [2, 81, 2], [4, 77, 2], [6, 81, 2]], [[0, 83, 1], [1, 83, 1], [2, 83, 2], [4, 79, 2], [6, 83, 2]], [[0, 79, 2], [2, 83, 2], [4, 86, 2], [6, 83, 2]], [[0, 81, 2], [2, 84, 2], [4, 81, 2], [6, 76, 2]],
  [[0, 77, 1], [1, 81, 1], [2, 84, 2], [4, 81, 1], [5, 77, 1], [6, 81, 2]], [[0, 79, 1], [1, 83, 1], [2, 86, 2], [4, 83, 1], [5, 79, 1], [6, 83, 2]], [[0, 84, 2], [2, 79, 1], [3, 84, 1], [4, 88, 4]], [[0, 84, 1], [1, 79, 1], [2, 84, 1], [3, 79, 1], [4, 84, 4]]
];
function brassPlay(n, t) {
  const s = n % 128, bar = s >> 3, st = s & 7, loop = Math.floor(n / 128), dur = k => bgmStepTime(n + k) - bgmStepTime(n);
  const R = BR_R[bar], tri = BR_T[bar], intro = loop === 0 && bar < 2, chorus = bar >= 8;
  if (st === 0 || st === 4) bgmSynBass(R, t, dur(1.5), 1, 'sawtooth', 420); else if (st === 2 || st === 6) bgmSynBass(R + 7, t, dur(1.2), .7, 'sawtooth', 420);      // 低音號：oom-pah
  if (!intro && (st === 3 || st === 7)) bgmBrass(tri, t, dur(.8), chorus ? .5 : .38);                                                                                // 小號／長號切分和弦
  if (!intro) BR_MEL[bar].forEach(x => { if (x[0] === st) bgmBrass([x[1]], t, dur(x[2]) * .95, 1); });
  if (st === 0 || st === 4) bgmKick(t, .5); else if (st === 2 || st === 6) bgmKick(t, .24);      // 大鼓：咚—咚，不再每拍猛敲
  if (st === 2 || st === 6) { bgmSnare(t, .42); bgmClap(t, .55); } else if (st % 2) bgmSnare(t, .09);                                                                 // 小鼓行進＋拍手
  if ((bar & 1) && (st === 5 || st === 7)) bgmClap(t, .4);
  if (bar >= 8 && st === 3) bgmClap(t, .35);      // 副歌多一點觀眾拍手
  if (st === 0 && (bar & 3) === 0) bgmCrash(t, .8);
  if (bar === 15 && st >= 4) bgmTom(t, 200 - (st - 4) * 22, .8);
}

/* ---- 曲目 4：夏日海風（C 大調・116 BPM・烏克麗麗＋木琴） ---- */
const SUM_R = [48, 43, 45, 41, 48, 43, 41, 43, 48, 43, 45, 41, 50, 43, 48, 48];
const SUM_V = { 48: [64, 67, 72], 43: [62, 67, 71], 45: [64, 69, 72], 41: [65, 69, 72], 50: [62, 65, 69] };
const SUM_MEL = [
  [[0, 79, 1], [1, 76, 1], [2, 79, 1], [3, 84, 2], [5, 83, 1], [6, 79, 2]], [[0, 74, 1], [1, 79, 1], [2, 83, 2], [4, 81, 1], [5, 79, 1], [6, 74, 2]], [[0, 76, 1], [1, 81, 1], [2, 84, 2], [4, 81, 1], [5, 76, 1], [6, 72, 2]], [[0, 77, 1], [1, 81, 1], [2, 84, 1], [3, 81, 1], [4, 77, 2], [6, 72, 2]],
  [[0, 76, 1], [1, 79, 1], [2, 84, 2], [4, 88, 1], [5, 84, 1], [6, 79, 2]], [[0, 83, 1], [1, 79, 1], [2, 74, 2], [4, 79, 1], [5, 83, 1], [6, 86, 2]], [[0, 84, 1], [1, 81, 1], [2, 77, 2], [4, 81, 1], [5, 84, 1], [6, 89, 2]], [[0, 83, 2], [2, 79, 1], [3, 74, 1], [4, 79, 4]],
  [[0, 84, 1], [1, 79, 1], [2, 76, 1], [3, 79, 2], [5, 84, 1], [6, 88, 2]], [[0, 86, 1], [1, 83, 1], [2, 79, 2], [4, 83, 1], [5, 86, 1], [6, 83, 2]], [[0, 84, 2], [2, 81, 1], [3, 84, 1], [4, 88, 2], [6, 84, 2]], [[0, 81, 1], [1, 84, 1], [2, 89, 2], [4, 84, 1], [5, 81, 1], [6, 77, 2]],
  [[0, 81, 1], [1, 77, 1], [2, 74, 2], [4, 77, 1], [5, 81, 1], [6, 86, 2]], [[0, 83, 1], [1, 79, 1], [2, 74, 1], [3, 79, 1], [4, 83, 2], [6, 86, 2]], [[0, 84, 2], [2, 79, 1], [3, 76, 1], [4, 79, 1], [5, 84, 1], [6, 88, 2]], [[0, 84, 3], [3, 79, 1], [4, 76, 2], [6, 72, 2]]
];
function sunPlay(n, t) {
  const s = n % 128, bar = s >> 3, st = s & 7, loop = Math.floor(n / 128), dur = k => bgmStepTime(n + k) - bgmStepTime(n);
  const R = SUM_R[bar], V = SUM_V[R], intro = loop === 0 && bar < 2;
  if ([0, 2, 3, 5, 6, 7].includes(st)) V.forEach((m, i) => bgmPluck(m, t + i * .011, dur(1.2), st === 0 ? 1 : (st === 3 || st === 7 ? .6 : .75)));      // 烏克麗麗刷弦
  if (!intro) {
    if (st === 0) bgmSynBass(R, t, dur(2.4), .9, 'triangle', 700); else if (st === 3) bgmSynBass(R + 7, t, dur(1), .7, 'triangle', 700); else if (st === 4) bgmSynBass(R + 12, t, dur(1.6), .8, 'triangle', 700); else if (st === 7) bgmSynBass(R + 7, t, dur(.8), .6, 'triangle', 700);
    if (st === 0 || st === 4) bgmKick(t, .5);
    if (st === 2 || st === 6) bgmClap(t, .55);
    bgmNoise(t, 'highpass', 6500, .7, .05, st % 2 ? .06 : .09);
    if ((bar & 3) === 3 && st >= 5) bgmBlock(t, [900, 1100, 1400][st - 5], .9);
    SUM_MEL[bar].forEach(x => { if (x[0] === st) bgmMarimba(x[1], t, dur(x[2]), 1); });
  }
}

/* ---- 曲目 5：街機全壘打（E 小調・144 BPM・8-bit 電玩） ---- */
const CH_R = [40, 36, 43, 38, 40, 36, 38, 38, 36, 38, 40, 40, 36, 38, 47, 47];
const CH_A = [[64, 67, 71, 76], [60, 64, 67, 72], [62, 67, 71, 74], [62, 66, 69, 74], [64, 67, 71, 76], [60, 64, 67, 72], [62, 66, 69, 74], [62, 66, 69, 74], [60, 64, 67, 72], [62, 66, 69, 74], [64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [62, 66, 69, 74], [63, 66, 69, 71], [63, 66, 69, 71]];
const CH_MEL = [
  [[0, 76, 2], [2, 79, 1], [3, 83, 1], [4, 81, 2], [6, 79, 2]], [[0, 79, 2], [2, 76, 1], [3, 79, 1], [4, 84, 2], [6, 79, 2]], [[0, 83, 2], [2, 79, 1], [3, 74, 1], [4, 79, 2], [6, 83, 2]], [[0, 81, 2], [2, 78, 1], [3, 81, 1], [4, 86, 2], [6, 81, 2]],
  [[0, 88, 1], [1, 83, 1], [2, 79, 1], [3, 83, 1], [4, 88, 2], [6, 86, 2]], [[0, 84, 1], [1, 79, 1], [2, 76, 1], [3, 79, 1], [4, 84, 2], [6, 83, 2]], [[0, 81, 1], [1, 78, 1], [2, 74, 1], [3, 78, 1], [4, 81, 2], [6, 86, 2]], [[0, 86, 3], [3, 85, 1], [4, 86, 2], [6, 81, 2]],
  [[0, 84, 2], [2, 88, 2], [4, 91, 2], [6, 88, 2]], [[0, 86, 2], [2, 90, 2], [4, 86, 2], [6, 81, 2]], [[0, 88, 2], [2, 83, 2], [4, 79, 2], [6, 83, 2]], [[0, 88, 4], [4, 86, 1], [5, 83, 1], [6, 79, 2]],
  [[0, 84, 1], [1, 88, 1], [2, 91, 2], [4, 88, 1], [5, 84, 1], [6, 79, 2]], [[0, 86, 1], [1, 90, 1], [2, 93, 2], [4, 90, 1], [5, 86, 1], [6, 81, 2]], [[0, 87, 2], [2, 90, 2], [4, 87, 2], [6, 83, 2]], [[0, 87, 1], [1, 90, 1], [2, 93, 1], [3, 90, 1], [4, 87, 2], [6, 90, 2]]
];
function chipPlay(n, t) {
  const s = n % 128, bar = s >> 3, st = s & 7, loop = Math.floor(n / 128), dur = k => bgmStepTime(n + k) - bgmStepTime(n);
  const R = CH_R[bar], A = CH_A[bar], intro = loop === 0 && bar < 2;
  bgmSynBass(st & 1 ? R + 12 : R, t, dur(.9), .85, 'triangle', 1000);
  bgmPulse(A[[0, 1, 2, 3, 2, 1, 2, 3][st]] + (bar >= 8 ? 12 : 0), t, dur(.85), .5, .125);      // 琶音
  if (!intro) CH_MEL[bar].forEach(x => { if (x[0] === st) bgmPulse(x[1], t, dur(x[2]) * .92, 1, .25); });
  if (st === 0 || st === 4 || ((bar & 3) === 3 && st === 6)) bgmKick(t, .5);
  if ((st === 2 || st === 6) && bar !== 15) bgmNoise(t, 'bandpass', 3800, .8, .09, .3);
  if (bar === 15 && st >= 4) bgmNoise(t, 'bandpass', 3800, .8, .07, .3);
  bgmNoise(t, 'highpass', 9500, .7, .03, st & 1 ? .05 : .08);
}

const BGM_TRACKS = [
  { id: 'jazz', icon: '🎷', name: '午後球場', sub: '輕鬆爵士・電鋼琴與刷鼓', tag: '休閒', bpm: 100, swing: .6, trim: 1, mix: { rev: 2.2, revWet: .22, dly: .75, fb: .28, dw: .3, drum: .8 }, play: bgmPlayStep },
  { id: 'rock', icon: '🔥', name: '熱血決戰', sub: '激昂搖滾・失真吉他與重鼓', tag: '熱血', bpm: 156, swing: .5, trim: .8, mix: { rev: 1.2, revWet: .12, dly: .75, fb: .22, dw: .16, drum: 1 }, play: rockPlay },
  { id: 'brass', icon: '📯', name: '應援號角', sub: '銅管進行曲・拍手與小鼓', tag: '熱血', bpm: 128, swing: .5, trim: .72, mix: { rev: 1.8, revWet: .2, dly: .5, fb: .2, dw: .15, drum: .95 }, play: brassPlay },
  { id: 'sun', icon: '🌴', name: '夏日海風', sub: '輕快烏克麗麗・彈跳木琴', tag: '輕鬆', bpm: 116, swing: .56, trim: 1.05, mix: { rev: .9, revWet: .14, dly: .75, fb: .25, dw: .22, drum: .7 }, play: sunPlay },
  { id: 'chip', icon: '🕹', name: '街機全壘打', sub: '8-bit 電玩・復古亢奮', tag: '趣味', bpm: 144, swing: .5, trim: .62, mix: { rev: .5, revWet: .06, dly: .75, fb: .3, dw: .2, drum: .7 }, play: chipPlay }
];
document.addEventListener('visibilitychange', () => { const c = SND.ctx; if (!c) return; if (document.hidden) c.suspend(); else c.resume(); });
