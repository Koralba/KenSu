/* 16-sound.js — 音效（WebAudio）（原 script.js 第 3690-3847 行） */
'use strict';
/* =====================================================================
   Part 6a: sound, HUD helpers, commentary (實況)
   ===================================================================== */
const $ = id => document.getElementById(id);
/* ---------------- sound (WebAudio, all synthesized) ---------------- */
const SND = { ctx: null, master: null, crowd: null, crowdGain: null, on: true, vol: 70, mute: false };
try { const v = localStorage.getItem('cpbl_sfx_vol'), m = localStorage.getItem('cpbl_sfx_mute'); if (v !== null && !isNaN(+v)) SND.vol = Math.max(0, Math.min(100, +v)); SND.mute = m === '1'; } catch (e) { }
const sfxGainVal = () => SND.mute ? 0 : .8 * Math.pow(SND.vol / 70, 1.5);      // 音效總音量（觀眾聲＋擊球／守備／環境等所有音效）；70＝原本的音量
function sfxApplyVol() { if (!SND.master || !SND.ctx) return; const t = SND.ctx.currentTime; SND.master.gain.cancelScheduledValues(t); SND.master.gain.setTargetAtTime(sfxGainVal(), t, .05); }
function sndInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)(); SND.ctx = C; SND.master = C.createGain(); SND.master.gain.value = sfxGainVal(); SND.master.connect(C.destination);
    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0); let l = 0; for (let i = 0; i < len; i++) { l = l * .97 + (Math.random() * 2 - 1) * .03; d[i] = l * 6; }
    const src = C.createBufferSource(); src.buffer = buf; src.loop = true; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .5; const g = C.createGain(); g.gain.value = .07;
    src.connect(f); f.connect(g); g.connect(SND.master); src.start(); SND.crowdGain = g; SND.crowdF = f;
    { const s2 = C.createBufferSource(); s2.buffer = buf; s2.loop = true; s2.playbackRate.value = .93; const f2 = C.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1000; f2.Q.value = .35; const g2 = C.createGain(); g2.gain.value = .0; s2.connect(f2); f2.connect(g2); g2.connect(SND.master); s2.start(); SND.amb = g2; SND.ambF = f2; setInterval(crowdAmbTick, 1300); }      // 第二層「球場人聲」：隨機起伏、零星拍手／鼓聲／口哨
    try { bgmInit(C); } catch (e2) { console.warn('bgm', e2); }
  } catch (e) { SND.ctx = null; }
}
function noiseBurst(dur, freq, q, gain, type, dest) {
  const C = SND.ctx; if (!C) return; const n = Math.floor(C.sampleRate * dur), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = C.createBufferSource(); s.buffer = b; const f = C.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = C.createGain(); g.gain.value = gain;
  s.connect(f); f.connect(g); g.connect(dest || SND.master); s.start();
}
function tone(freq, dur, gain, type, slide, dest) {
  const C = SND.ctx; if (!C) return; const o = C.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq; if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), C.currentTime + dur);
  const g = C.createGain(); g.gain.setValueAtTime(gain, C.currentTime); g.gain.exponentialRampToValueAtTime(.001, C.currentTime + dur); o.connect(g); g.connect(dest || SND.master); o.start(); o.stop(C.currentTime + dur);
}
function flowSfx(n, v) {
  if (!SND.ctx || !SND.on) return; v = v || 1;
  switch (n) {
    case 'hit': noiseBurst(.07, 1700, 1.1, .6 * v, 'bandpass'); tone(150, .12, .6 * v, 'triangle', .5); break;
    case 'meet': noiseBurst(.07, 1800, 1, .5, 'highpass'); tone(210, .08, .4, 'triangle', .6); break;
    case 'mitt': noiseBurst(.035, 1500, 1.1, .85 * v, 'bandpass'); noiseBurst(.1, 420, 1, .75 * v, 'lowpass'); tone(190, .07, .5 * v, 'sine', .5); tone(95, .1, .45 * v, 'sine', .6); break;
    case 'swing': sweepNoise(.2, 420, 1500, .9, .24 * (v > 1 ? 1 : v), 'bandpass'); break;
    case 'bounce': tone(120, .06, .25, 'sine', .7); break;
    case 'strike': tone(880, .09, .25, 'square'); setTimeout(() => tone(1180, .1, .22, 'square'), 90); break;
    case 'ball': tone(520, .12, .22, 'square'); break;
    case 'out': tone(300, .2, .3, 'sawtooth', .6); break;
    case 'cheer': if (v < 1) { crowdRoar(Math.max(.5, v * .6)); break; } crowdRoar(v); if (SND.crowdGain) { const t = SND.ctx.currentTime; SND.crowdGain.gain.cancelScheduledValues(t); SND.crowdGain.gain.setValueAtTime(SND.crowdGain.gain.value, t); SND.crowdGain.gain.linearRampToValueAtTime(Math.min(2.0, .5 * v + .1), t + .35); SND.crowdGain.gain.linearRampToValueAtTime(.07, t + 5.5 * v); SND.crowdF.frequency.setValueAtTime(1100, t); SND.crowdF.frequency.linearRampToValueAtTime(700, t + 3.2 * v); } break;
    case 'boom': noiseBurst(.45, 160, 1.1, .75 * v, 'lowpass'); tone(62, .35, .55 * v, 'sine', .6); break;
    case 'crackle': for (let i = 0; i < 7; i++) setTimeout(() => noiseBurst(.03, 3800, 1, .22 * v, 'highpass'), i * 55 + Math.random() * 40); break;
    case 'jingle': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, .3, 'triangle'), i * 120)); break;
    case 'whistle': tone(1900, .25, .15, 'sine'); break;
    case 'pick': noiseBurst(.07, 700, 1, .5); break;
    case 'throw': sweepNoise(.22, 2000, 700, 1.1, .22, 'bandpass'); break;
    case 'wall': noiseBurst(.12, 1100, 1, .5, 'bandpass'); tone(170, .2, .55, 'triangle', .55); break;
    case 'hitfan': hitFanfare(v); break;
    case 'hrfan': hrFanfare(v); break;
    case 'outcall': tone(988, .1, .22, 'triangle'); setTimeout(() => tone(740, .26, .22, 'triangle'), 110); break;
  }
}
function crowdRoar(v) {                                      // 觀眾歡呼：寬頻人聲噪音浪潮＋零星掌聲＋口哨
  const C = SND.ctx; if (!C || !SND.on) return; v = clamp(v, .5, 2.6);
  const dur = 2.4 + v * 1.8, n = Math.floor(C.sampleRate * dur), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); let l = 0;
  for (let i = 0; i < n; i++) { l = l * .9 + (Math.random() * 2 - 1) * .1; d[i] = l * 3; }
  const s = C.createBufferSource(); s.buffer = b; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .7; const t = C.currentTime;
  f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1300, t + .5); f.frequency.linearRampToValueAtTime(800, t + dur);
  const g = C.createGain(), pk = Math.min(1.2, .26 * v + .08);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .35); g.gain.linearRampToValueAtTime(pk * .8, t + dur * .5); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(SND.master); s.start(t);
  const nc = Math.min(64, Math.round(17 * v));
  { const s2 = C.createBufferSource(); s2.buffer = b; s2.playbackRate.value = 1.12; const f2 = C.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 1.6; f2.frequency.setValueAtTime(1000, t); f2.frequency.linearRampToValueAtTime(1800, t + .6); f2.frequency.linearRampToValueAtTime(1200, t + dur); const g2 = C.createGain(); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(pk * .55, t + .4); g2.gain.exponentialRampToValueAtTime(.001, t + dur); s2.connect(f2); f2.connect(g2); g2.connect(SND.master); s2.start(t); }      // 高亢的「哇～」人聲層
  for (let i = 0; i < nc; i++) setTimeout(() => noiseBurst(.05, 2400 + Math.random() * 1200, .8, .22 + .1 * Math.min(v, 2), 'highpass'), 200 + i * (dur * 700 / nc) + Math.random() * 60);
  if (v >= 1.3) { setTimeout(() => tone(1700 + Math.random() * 300, .3, .07, 'sine', 1.25), 300); setTimeout(() => tone(1500 + Math.random() * 300, .35, .06, 'sine', 1.3), 700); }
}
function hornSeq(notes, vol) {      // 號角：[MIDI, 開始秒, 長度]；柔和銅管音色，給安打／全壘打的應援短句
  const C = SND.ctx; if (!C || !SND.on) return; const t0 = C.currentTime + .02; vol = vol || 1;
  notes.forEach(([m, st, d]) => {
    const t = t0 + st, f = mtof(m), g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .8;
    lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2300, t + .06); lp.frequency.setTargetAtTime(1400, t + .09, .2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2 * vol, t + .02); g.gain.setTargetAtTime(.14 * vol, t + .05, .12); g.gain.setTargetAtTime(0, t + d, .05);
    [0, 7].forEach(dt => { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + d + .35); });
    lp.connect(g); g.connect(SND.master);
  });
}
function cheerDrums(n, gap, v) {      // 應援大鼓＋拍手：咚咚恰
  v = v || 1; for (let i = 0; i < n; i++) setTimeout(() => { if (!SND.ctx || !SND.on) return; if (i % 3 === 2) noiseBurst(.07, 1500, .9, .38 * v, 'bandpass'); else { tone(95, .22, .42 * v, 'sine', .5); noiseBurst(.05, 300, 1, .22 * v, 'lowpass'); } }, i * gap);
}
const CHARGE = [[67, 0, .14], [72, .16, .14], [76, .32, .14], [79, .48, .22], [76, .74, .16], [79, .92, .7]];      // 衝鋒號
function hitFanfare(n) {      // 安打：號角短句＋拍手；長打更熱鬧
  if (!SND.ctx || !SND.on) return;
  if (n === 1) { hornSeq([[72, 0, .12], [76, .15, .12], [79, .3, .4]], .6); cheerDrums(6, 130, .7); }
  else if (n === 2) { hornSeq(CHARGE, .75); cheerDrums(10, 120, .85); }
  else { hornSeq(CHARGE, .9); setTimeout(() => hornSeq([[72, 0, .18], [76, .2, .18], [79, .4, .18], [84, .6, .9], [79, .6, .9]], .9), 1250); cheerDrums(16, 110, 1); }
}
function hrFanfare(n) {      // 全壘打：衝鋒號＋勝利和弦＋鈸＋密集大鼓＋多波歡呼
  if (!SND.ctx || !SND.on) return;
  hornSeq(CHARGE, 1); cheerDrums(14, 105, 1.1);
  setTimeout(() => { hornSeq([[72, 0, .2], [76, .22, .2], [79, .44, .2], [84, .66, 1.5], [79, .66, 1.5], [76, .66, 1.5]], 1); noiseBurst(1.4, 5000, .6, .5, 'highpass'); crowdRoar(2.4); }, 1500);
  setTimeout(() => cheerDrums(12, 120, 1), 2300);
  setTimeout(() => crowdRoar(2.2), 3300); setTimeout(() => crowdRoar(1.8), 5200);
  if (n >= 3) setTimeout(() => { hornSeq(CHARGE, 1); crowdRoar(2.4); }, 4200);
}
function crowdAmbTick() {      // 球場環境人聲：低沉的「嗡～」底噪緩慢起伏，偶爾零星稀疏的掌聲；大歡呼只留給安打／全壘打／特殊狀況
  const C = SND.ctx; if (!C || !SND.on || !SND.amb || C.state !== 'running') return;
  const play = typeof G !== 'undefined' && G.mode === 'play', t = C.currentTime;
  const swell = (G.phase === 'flight' || G.phase === 'windup') ? .03 : 0;      // 投球飛行時稍微安靜下來、帶一點期待感
  SND.amb.gain.setTargetAtTime(play ? .05 + Math.random() * .035 + swell + (crowdCheer.v || 0) * .08 : .02, t, 1.2);
  SND.ambF.frequency.setTargetAtTime(520 + Math.random() * 260, t, 1.0);
  if (!play) return; const r = Math.random();
  if (r < .16) { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) setTimeout(() => noiseBurst(.04, 1800 + Math.random() * 900, .8, .05 + Math.random() * .03, 'bandpass'), i * (180 + Math.random() * 140)); }      // 稀疏的零星拍手
  else if (r < .2) { const c = C.currentTime; noiseBurst(.5 + Math.random() * .4, 700 + Math.random() * 300, .6, .05, 'bandpass'); }      // 遠處一小群人的低語
}
function sweepNoise(dur, f0, f1, q, gain, type, dest) {            // 破空／揮動類：頻率掃過的噪音
  const C = SND.ctx; if (!C) return; const n = Math.floor(C.sampleRate * dur), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * Math.pow(i / n, .6));
  const s = C.createBufferSource(); s.buffer = b; const f = C.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, C.currentTime); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), C.currentTime + dur);
  const g = C.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(dest || SND.master); s.start();
}
function bounceSfx(b) {                                      // 落地聲：力道越大越響；內野（紅土）較悶實、外野（草皮）較軟
  if (!SND.ctx || !SND.on) return; const k = clamp(b.v / 24, .12, 1), dirt = Math.hypot(b.x, b.z + 14) < 24;
  tone(dirt ? 125 : 90, .07 + .04 * k, .32 * k, 'sine', .6); noiseBurst(.05, dirt ? 900 : 450, 1, .22 * k, 'lowpass');
}
function ring(f, dur, gain, f1, dest) {                           // 短促衰減的共鳴：模擬木棒／球殼被瞬間敲擊後的震動
  const C = SND.ctx; if (!C) return; const t = C.currentTime, o = C.createOscillator(), g = C.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(f * (f1 || 1.05), t); o.frequency.exponentialRampToValueAtTime(f, t + .015);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .0012); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(g); g.connect(dest || SND.master); o.start(t); o.stop(t + dur + .02);
}
/* 球場空間感：擊球聲送進一條「球場匯流排」——短殘響（看台／外野牆反射）＋延遲回音（對面看台），讓擊球聲有場地的厚度，而不是貼在耳邊的乾音 */
function stadiumBus() {
  const C = SND.ctx; if (!C) return null; if (SND.stad) return SND.stad;
  const inp = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500; lp.Q.value = .5; inp.connect(lp); lp.connect(SND.master);      // 乾聲：削掉刺耳的極高頻
  const len = Math.floor(C.sampleRate * 1.5), ir = C.createBuffer(2, len, C.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let l = 0; for (let i = 0; i < len; i++) { const u = i / len; l = l * .6 + (Math.random() * 2 - 1) * .4; d[i] = l * Math.pow(1 - u, 2.6) * (u < .012 ? u / .012 : 1); } }
  const cv = C.createConvolver(); cv.buffer = ir; const wet = C.createGain(); wet.gain.value = .34; const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
  const lp2 = C.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 3200; inp.connect(hp); hp.connect(cv); cv.connect(lp2); lp2.connect(wet); wet.connect(SND.master);
  const dl = C.createDelay(1); dl.delayTime.value = .19; const fb = C.createGain(); fb.gain.value = .28; const ef = C.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 1500; const eg = C.createGain(); eg.gain.value = .22;
  inp.connect(dl); dl.connect(ef); ef.connect(fb); fb.connect(dl); ef.connect(eg); eg.connect(SND.master);      // 對面看台的回音（越打越遠越明顯）
  return SND.stad = inp;
}
function hitSfx(res) {      // 擊球聲：木棒「叩」的實聲＋球被壓扁的低頻重量＋球場殘響；甜蜜點清脆有力、握把／球頭悶鈍、擦棒短促
  if (!SND.ctx || !SND.on) return;
  const D = stadiumBus() || SND.master, Q = clamp(res.Q == null ? .5 : res.Q, 0, 1), ev = res.ev || 25, ang = res.ang || 10, hard = clamp((ev - 20) / 32, 0, 1), v = clamp(.6 + ev / 60, .65, 1.3) * (res.power ? 1.1 : 1);
  const nz = (d, f, q, g, t) => noiseBurst(d, f, q, g, t || 'bandpass', D), rg = (f, d, g, f1) => ring(f, d, g, f1, D);
  if (res.bunt) { if (res.tip) { nz(.03, 2400, 1.2, .35); rg(1100, .04, .12); } else { nz(.045, 1200, 1, .4); rg(360, .07, .26); nz(.07, 320, 1, .3, 'lowpass'); } return; }
  if (res.tip) { nz(.025, 2600, 1.3, .38); nz(.05, 1300, 1.6, .22); rg(1000, .05, .13); return; }      // 擦棒：短促的「嘖」，不再尖銳
  if (res.broken) { setTimeout(() => { nz(.08, 2200, 1.1, .6); rg(1300, .06, .24); rg(700, .14, .28); nz(.14, 600, 1.4, .4); }, 8); }      // 斷棒：木頭裂開
  const sweet = Q > .78 && !res.marginal && Math.abs(res.s || 0) < .5, weak = Q < .35 || res.marginal || Math.abs(res.bp || 0) > .85 || Math.abs(res.s || 0) > .6, gb = ang < 8, pop = ang > 50;
  const base = (sweet ? 880 : weak ? 430 : 650) * (gb ? .92 : pop ? .96 : 1) * (.95 + Math.random() * .1);
  nz(.014, sweet ? 3000 : weak ? 1700 : 2300, .8, (sweet ? .9 : weak ? .45 : .7) * v);                                // ① 瞬間撞擊的「啪」（中高頻，不是刺耳的嘶聲）
  nz(.06, sweet ? 1800 : weak ? 900 : 1300, 1.6, (sweet ? .8 : weak ? .45 : .65) * v);                               // ② 木頭的「叩」寬頻脆響
  rg(base, sweet ? .13 : .08, (sweet ? .55 : .42) * v);                                                               // ③ 球棒主共振（木質中頻）
  rg(base * 1.9, .05, (sweet ? .22 : .1) * v);                                                                        // ④ 泛音
  rg(weak ? 140 : 165, .09 + .05 * v, .6 * v, 1.4);                                                                   // ⑤ 球被壓扁的低頻
  if (!weak) { rg(105, .18, (.55 + hard * .25) * v, 1.5); nz(.1, 240, .9, (.5 + hard * .2) * v, 'lowpass'); }          //    紮實擊中的重量感
  if (sweet && hard > .35) { setTimeout(() => { rg(58, .26, .5 + hard * .35, 1.4); nz(.12, 150, .8, .35 + hard * .3, 'lowpass'); }, 6); }      // ⑥ 打得扎實又遠：腹部能感覺到的低頻衝擊
  if (weak) { setTimeout(() => { nz(.1, 520, 2.2, .26); rg(220, .12, .16); }, 12); }                                  // 握把／球頭：棒身震動的悶「嗡」
  if (res.power) setTimeout(() => { nz(.22, 480, .9, .42 * v, 'lowpass'); rg(70, .24, .45); }, 12);                    // 強打：低頻爆音
  if (ev > 26) setTimeout(() => nz(.08, 1500, 1, .12 * clamp(v, .6, 1.2)), 90 + Math.random() * 25);                  // 球場回音
  if (ev > 30 && !gb) setTimeout(() => sweepNoise(.42 + ev * .006, 2200, 800, 1.3, clamp((ev - 28) / 45, .1, .3), 'bandpass'), 45);      // 球飛出的破空聲
  else if (ev > 26 && gb) setTimeout(() => sweepNoise(.25, 1500, 700, 1.1, .1, 'bandpass'), 40);
  if (sweet && !gb && ev > 40 && res.ang > 14 && SND.crowdGain) flowSfx('cheer', clamp((ev - 36) / 24, 1, 1.4));
}
