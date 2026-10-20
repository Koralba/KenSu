/* ===== 08-audio.js ｜ WebAudio 音效合成／背景音樂／現代音效（擊球、手套、觀眾） =====
   載入順序 8/14；與其他 js/*.js 共用全域作用域（不是 module），順序見 FILE_MAP.md ===== */
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
    const C = new (window.AudioContext || window.webkitAudioContext)(); SND.ctx = C; SND.master = C.createGain(); SND.master.gain.value = sfxGainVal();
    const mc = C.createDynamicsCompressor(); mc.threshold.value = -14; mc.knee.value = 18; mc.ratio.value = 5; mc.attack.value = .004; mc.release.value = .22; SND.master.connect(mc); mc.connect(C.destination);      // 總輸出壓縮／限幅：多層音效同時發聲（歡呼＋掌聲＋擊球）也不會爆音破音
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
  if (!play) return;
  { const tens = (G.on && (G.on[1] || G.on[2])) && G.outs >= 2;      // 兩出局、得點圈有人：看台響起一串有節奏的拍手，營造緊張感
    if (tens && G.phase === 'pre' && Math.random() < .3 && apOK(5)) for (let i = 0; i < 4; i++) setTimeout(() => noiseBurst(.05, 1500, .9, .16, 'bandpass'), i * 420);
    if (G.night && !(typeof rainK === 'function' && rainK() > .15) && Math.random() < .45) { const f0 = 4300 + Math.random() * 500; for (let i = 0; i < 3; i++) setTimeout(() => tone(f0, .05, .008, 'sine'), i * 85); }      // 夜場：遠處極輕的蟲鳴
  }
  const r = Math.random();
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
/* ---------------- 背景音樂（WebAudio 即時合成：輕鬆爵士／球場午後） ---------------- */
const BGM = { vol: 50, mute: false, ctx: null, bus: null, ch: null, inst: null, lead: null, drum: null, gtr: null, noise: null, timer: 0, step: 0, t0: 0, track: 2, beat: .6, swing: .6, irc: {} };
try { const v = localStorage.getItem('cpbl_bgm_vol'), m = localStorage.getItem('cpbl_bgm_mute'); if (v !== null && !isNaN(+v)) BGM.vol = clamp(+v, 0, 100); BGM.mute = m === '1'; const tk = localStorage.getItem('cpbl_bgm_track'); if (tk !== null && !isNaN(+tk) && +tk >= 0 && +tk < 16) BGM.track = +tk | 0; } catch (e) { }
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

/* ===================== 新增曲目（5 首）：新樂器＋程序式作曲 ===================== */
function bgmStrings(ms, t, d, v) {      // 弦樂合奏：三重失諧鋸齒波、慢起音、濾波漸亮
  const C = BGM.ctx;
  ms.forEach(m => {
    const g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(2600, t + Math.min(.5, d * .5));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .05, t + Math.min(.28, d * .4)); g.gain.setTargetAtTime(0, t + d, .12);
    [-9, 0, 9].forEach(dt => { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + d + .9); });
    lp.connect(g); g.connect(BGM.inst);
  });
}
function bgmSuper(m, t, d, v, cut) {      // 超級鋸齒主奏（五重失諧）：電子曲的亮麗主旋律
  const C = BGM.ctx, g = C.createGain(), lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime((cut || 3000) * .5, t); lp.frequency.exponentialRampToValueAtTime(cut || 3000, t + .05);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .07, t + .01); g.gain.setTargetAtTime(v * .05, t + .05, .2); g.gain.setTargetAtTime(0, t + d, .04);
  [-14, -5, 0, 5, 14].forEach(dt => { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + d + .3); });
  lp.connect(g); g.connect(BGM.lead);
}
function bgmRiser(t, d, v) {      // 升調噪音掃頻：段落前的緊張堆疊
  const C = BGM.ctx, s = C.createBufferSource(); s.buffer = BGM.noise; s.loop = true; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(7000, t + d); const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .18, t + d); g.gain.setTargetAtTime(0, t + d, .03);
  s.connect(f); f.connect(g); g.connect(BGM.drum); s.start(t); s.stop(t + d + .2);
}
function sngRng(s) { return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function mkSong(o) {      // 依和弦進行＋音階＋節奏型，自動編出 16 小節（A－B－A'－高潮）；每次固定同一首
  const rn = sngRng(o.seed), sc = []; for (let oc = -3; oc <= 4; oc++) o.scale.forEach(x => sc.push(o.key + x + 12 * oc)); sc.sort((a, b) => a - b);
  const R = [], T = [], M = [], tri = [];
  o.prog.forEach(([off, q]) => {
    const r = o.key + off; let b = r; while (b > o.bassHi) b -= 12; while (b < o.bassHi - 11) b += 12; R.push(b);
    const rt = r + 12 * Math.ceil((o.chordLo - r) / 12), th = rt + (q === 'm' || q === 'd' ? 3 : q === 's' ? 5 : 4), fi = rt + (q === 'd' ? 6 : 7);
    T.push([rt, th, fi]); tri.push([rt % 12, th % 12, fi % 12]);
  });
  const lo = sc.findIndex(x => x >= o.lo); let hi = 0; sc.forEach((x, i) => { if (x <= o.hi) hi = i; });
  const nearest = (idx, bar) => { let best = idx, bd = 99; for (let k = lo; k <= hi; k++) if (tri[bar].includes(sc[k] % 12)) { const d = Math.abs(k - idx) + rn() * .3; if (d < bd) { bd = d; best = k; } } return best; };
  let pos = sc.findIndex(x => x >= o.start);
  for (let bar = 0; bar < 16; bar++) {
    if (bar >= 8 && bar < 12) { M.push(M[bar - 8].map(([s, m, l]) => { if (s % 4 !== 0) return [s, m, l]; let k = sc.indexOf(m); if (k >= 0 && !tri[bar].includes(m % 12)) k = nearest(k, bar); return [s, k >= 0 ? sc[k] : m, l]; })); continue; }      // 第三段重現第一段的旋律（記憶點）
    const pat = o.rhy[(bar >> 2) % o.rhy.length], fl = (bar & 3) === 3 ? (o.fill || pat) : pat, lift = bar >= 12, notes = [];
    fl.forEach(([s, l], k) => {
      if (k === 0 || s === 0 || s === 4) pos = nearest(clamp(pos + (lift ? 1 : 0), lo, hi), bar);
      else { const stp = [-2, -1, -1, 1, 1, 2][Math.floor(rn() * 6)]; pos = clamp(pos + stp + (lift && rn() < .3 ? 1 : 0), lo, hi); }
      notes.push([s, sc[pos], l]);
    });
    M.push(notes);
  }
  { let best = -1; for (let k = lo; k <= hi; k++) if (sc[k] % 12 === o.key % 12 && (best < 0 || Math.abs(k - pos) < Math.abs(best - pos))) best = k; const ln = M[15], z = ln[ln.length - 1]; if (best >= 0) ln[ln.length - 1] = [z[0], sc[best], Math.max(2, 8 - z[0])]; }      // 最後一小節回到主音
  return { R, T, M };
}
const SONGS = {}, song = o => SONGS[o.id] || (SONGS[o.id] = mkSong(o)), MIN7 = [0, 2, 3, 5, 7, 8, 10], MAJ7 = [0, 2, 4, 5, 7, 9, 11];
const SNG_CLUTCH = { id: 'clutch', seed: 7141, key: 62, scale: MIN7, bassHi: 47, chordLo: 57, lo: 69, hi: 88, start: 74,
  prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [5, 'm'], [0, 'm'], [8, 'M'], [10, 'M'], [5, 'm'], [0, 'm'], [7, 'M'], [7, 'M']],
  rhy: [[[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2]], [[0, 3], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2]]], fill: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2]] };
const SNG_ACE = { id: 'ace', seed: 2203, key: 64, scale: MIN7, bassHi: 47, chordLo: 52, lo: 64, hi: 83, start: 71,
  prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [5, 'm'], [0, 'm'], [3, 'M'], [10, 'M'], [5, 'm'], [0, 'm'], [8, 'M'], [7, 'M']],
  rhy: [[[0, 4], [4, 2], [6, 2]], [[0, 2], [2, 2], [4, 4]], [[0, 3], [3, 1], [4, 4]]], fill: [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]] };
const SNG_BASES = { id: 'bases', seed: 9187, key: 57, scale: MIN7, bassHi: 45, chordLo: 57, lo: 69, hi: 93, start: 76,
  prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [5, 'm'], [8, 'M'], [0, 'm'], [7, 'M'], [5, 'm'], [8, 'M'], [7, 'M'], [7, 'M']],
  rhy: [[[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2]], [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 1], [7, 1]]], fill: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]] };
const SNG_VICT = { id: 'victory', seed: 5519, key: 60, scale: MAJ7, bassHi: 47, chordLo: 55, lo: 67, hi: 88, start: 72,
  prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M'], [0, 'M'], [7, 'M'], [9, 'm'], [5, 'M'], [5, 'M'], [0, 'M'], [7, 'M'], [9, 'm'], [5, 'M'], [0, 'M'], [7, 'M'], [0, 'M']],
  rhy: [[[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 2], [6, 1], [7, 1]], [[0, 3], [3, 1], [4, 4]]], fill: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 4]] };
const SNG_NIGHT = { id: 'night', seed: 3301, key: 63, scale: MAJ7, bassHi: 46, chordLo: 55, lo: 70, hi: 86, start: 74,
  prog: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M'], [0, 'M'], [9, 'm'], [5, 'M'], [7, 'M'], [2, 'm'], [7, 'M'], [0, 'M'], [9, 'm'], [2, 'm'], [7, 'M'], [0, 'M'], [0, 'M']],
  rhy: [[[0, 3], [3, 1], [4, 4]], [[0, 2], [2, 2], [4, 2], [6, 2]], [[1, 2], [3, 1], [4, 3]]], fill: [[0, 2], [2, 2], [4, 4]] };
function trackCtx(n, SN) { const s = n % 128, bar = s >> 3, loop = Math.floor(n / 128), S = song(SN); return { S, bar, st: s & 7, loop, R: S.R[bar], T: S.T[bar], M: S.M[bar], chorus: bar >= 8, intro: loop === 0 && bar < 2, dur: k => bgmStepTime(n + k) - bgmStepTime(n) }; }
/* 曲目 6：逆轉關鍵（D 小調・138 BPM・弦樂切分＋超鋸齒＋銅管，緊張追分） */
function clutchPlay(n, t) {
  const { bar, st, loop, R, T, M, chorus, intro, dur } = trackCtx(n, SNG_CLUTCH);
  bgmSynBass(R, t, dur(.9), st === 0 ? 1 : st & 1 ? .6 : .8, 'sawtooth', 480);
  if (st === 0) bgmStrings(T, t, dur(8), chorus ? .95 : .7); else if (!intro && (st === 3 || st === 6)) bgmStrings(T, t, dur(1), .8);
  if (chorus && (st === 0 || st === 3 || st === 6)) bgmBrass(T, t, dur(1.2), .55);
  if (!intro) M.forEach(([ms, m, l]) => { if (ms === st) { bgmSuper(m, t, dur(l) * .95, 1, chorus ? 3600 : 2600); if (chorus) bgmBrass([m], t, dur(l) * .95, .7); } });
  if (!intro) { if (st === 0 || st === 4 || (chorus && st === 3)) bgmKick(t, .7); if (st === 2 || st === 6) bgmSnare(t, .9); bgmHat(t, st & 1 ? .5 : .8, st === 7); }
  if (bar === 7 || bar === 15) { if (st === 0) bgmRiser(t, dur(8), .9); if (st === 5 || st === 7) bgmSnare(t, .7); }
  if (st === 0 && (bar & 3) === 0 && !(loop === 0 && bar === 0)) bgmCrash(t, .9);
}
/* 曲目 7：王牌登板（E 小調・104 BPM・電影感重鼓＋低音銅管） */
function acePlay(n, t) {
  const { bar, st, loop, R, T, M, chorus, intro, dur } = trackCtx(n, SNG_ACE);
  if (st === 0) { bgmStrings(T, t, dur(8), .85); bgmSynBass(R, t, dur(7.5), 1, 'triangle', 300); }
  if (st === 0 || st === 3) bgmBrass([R + 12, R + 19], t, dur(2.4), .6);
  if (!intro) {
    if (st === 0) { bgmKick(t, .8); bgmTom(t, 90, .9); } else if (st === 3) bgmTom(t, 110, .7); else if (st === 4) { bgmSnare(t, 1); bgmClap(t, .6); bgmKick(t, .5); } else if (st === 6) bgmTom(t, 130, .6);
    if (chorus && (st & 1)) bgmHat(t, .4);
    M.forEach(([ms, m, l]) => { if (ms === st) { bgmBrass([m], t, dur(l) * .95, 1); if (chorus) bgmBell(m + 12, t, dur(l), .8); } });
  }
  if (st === 0 && (bar & 3) === 0 && !(loop === 0 && bar === 0)) bgmCrash(t, .9);
  if (bar === 15 && st >= 4) bgmTom(t, 220 - (st - 4) * 30, .9);
}
/* 曲目 8：滿壘危機（A 小調・150 BPM・高速電子脈衝＋超鋸齒主奏） */
function basesPlay(n, t) {
  const { bar, st, loop, R, T, M, chorus, intro, dur } = trackCtx(n, SNG_BASES);
  bgmSynBass(R, t, dur(.8), st === 0 ? 1 : .7, 'sawtooth', 700);
  bgmPulse(T[[0, 1, 2, 1, 2, 1, 0, 1][st]] + 12, t, dur(.9), .4, .25);
  if (st === 0) bgmStrings(T, t, dur(8), .5);
  if (!intro) M.forEach(([ms, m, l]) => { if (ms === st) bgmSuper(m, t, dur(l) * .9, 1, 3400); });
  if (!(st & 1)) bgmKick(t, .65); if (st === 2 || st === 6) bgmClap(t, .6); bgmHat(t, st & 1 ? .55 : .35, !!(st & 1));
  if (bar === 7 || bar === 15) { if (st === 0) bgmRiser(t, dur(8), 1); if (st >= 4) bgmSnare(t, .45 + (st - 4) * .15); }
  if (st === 0 && (bar & 3) === 0 && !(loop === 0 && bar === 0)) bgmCrash(t, .9);
}
/* 曲目 9：冠軍之夜（C 大調・122 BPM・凱旋進行曲：銅管＋弦樂＋定音鼓＋鐘琴） */
function victoryPlay(n, t) {
  const { bar, st, loop, R, T, M, chorus, intro, dur } = trackCtx(n, SNG_VICT);
  if (st === 0 || st === 4) bgmSynBass(R, t, dur(3.5), 1, 'sawtooth', 420); else if (st === 2 || st === 6) bgmSynBass(R + 7, t, dur(1.5), .7, 'sawtooth', 420);
  if (st === 0) bgmStrings(T, t, dur(8), .9);
  if (chorus && (st === 0 || st === 3 || st === 6)) bgmBrass(T, t, dur(st === 0 ? 3 : 1), .55); else if (!chorus && !intro && (st === 3 || st === 7)) bgmBrass(T, t, dur(.9), .35);
  if (!intro) M.forEach(([ms, m, l]) => { if (ms === st) { bgmBrass([m], t, dur(l) * .95, 1); if (chorus) bgmBell(m + 12, t, dur(l), .8); } });
  if (st === 0 || st === 4) bgmKick(t, .6); if (st === 2 || st === 6) { bgmSnare(t, .8); bgmClap(t, .5); }
  if ((bar & 3) === 3 && st >= 4) bgmSnare(t, .55 + (st - 4) * .1);
  if (chorus && st === 0) bgmTom(t, 85, .8);
  if (st === 0 && (bar & 3) === 0 && !(loop === 0 && bar === 0)) bgmCrash(t, 1);
}
/* 曲目 10：夜場燈下（降 E 大調・96 BPM・電鋼琴＋顫音琴＋柔和鼓點，適合夜間比賽） */
function nightPlay(n, t) {
  const { bar, st, R, T, M, intro, dur } = trackCtx(n, SNG_NIGHT);
  if (st === 0) { T.forEach((m, i) => bgmRhodes(m, t + i * .015, dur(2.7), 1)); bgmPad(T, t, dur(8)); } else if (st === 3 || st === 6) T.forEach((m, i) => bgmRhodes(m, t + i * .015, dur(1.4), .45));
  if (st === 0) bgmBass(R, t, dur(2.7), 1); else if (st === 3) bgmBass(R + 7, t, dur(1), .7); else if (st === 4) bgmBass(R, t, dur(2.6), .85);
  if (!intro) {
    M.forEach(([ms, m, l]) => { if (ms === st) bgmBell(m, t, dur(l), .9); });
    if (st === 0 || st === 4) bgmKick(t, .4); if (st === 2 || st === 6) bgmNoise(t, 'bandpass', 1800, .8, .09, .1);
    bgmNoise(t, 'highpass', 7500, .7, .04, st & 1 ? .03 : .05);
  }
}

const BGM_TRACKS = [
  { id: 'jazz', icon: '🎷', name: '午後球場', sub: '輕鬆爵士・電鋼琴與刷鼓', tag: '休閒', bpm: 100, swing: .6, trim: 1, mix: { rev: 2.2, revWet: .22, dly: .75, fb: .28, dw: .3, drum: .8 }, play: bgmPlayStep },
  { id: 'rock', icon: '🔥', name: '熱血決戰', sub: '激昂搖滾・失真吉他與重鼓', tag: '熱血', bpm: 156, swing: .5, trim: .8, mix: { rev: 1.2, revWet: .12, dly: .75, fb: .22, dw: .16, drum: 1 }, play: rockPlay },
  { id: 'brass', icon: '📯', name: '應援號角', sub: '銅管進行曲・拍手與小鼓', tag: '熱血', bpm: 128, swing: .5, trim: .72, mix: { rev: 1.8, revWet: .2, dly: .5, fb: .2, dw: .15, drum: .95 }, play: brassPlay },
  { id: 'sun', icon: '🌴', name: '夏日海風', sub: '輕快烏克麗麗・彈跳木琴', tag: '輕鬆', bpm: 116, swing: .56, trim: 1.05, mix: { rev: .9, revWet: .14, dly: .75, fb: .25, dw: .22, drum: .7 }, play: sunPlay },
  { id: 'chip', icon: '🕹', name: '街機全壘打', sub: '8-bit 電玩・復古亢奮', tag: '趣味', bpm: 144, swing: .5, trim: .62, mix: { rev: .5, revWet: .06, dly: .75, fb: .3, dw: .2, drum: .7 }, play: chipPlay },
  { id: 'clutch', icon: '⚡', name: '逆轉關鍵', sub: '緊張追分・弦樂切分與銅管', tag: '緊張', bpm: 138, swing: .5, trim: .78, mix: { rev: 1.6, revWet: .16, dly: .75, fb: .22, dw: .14, drum: 1 }, play: clutchPlay },
  { id: 'ace', icon: '🧢', name: '王牌登板', sub: '電影感重鼓・低音銅管', tag: '氣勢', bpm: 104, swing: .5, trim: .78, mix: { rev: 2.4, revWet: .24, dly: .75, fb: .2, dw: .12, drum: 1 }, play: acePlay },
  { id: 'bases', icon: '🚨', name: '滿壘危機', sub: '高速電子脈衝・超鋸齒主奏', tag: '刺激', bpm: 150, swing: .5, trim: .7, mix: { rev: 1, revWet: .1, dly: .75, fb: .3, dw: .22, drum: 1 }, play: basesPlay },
  { id: 'victory', icon: '🏆', name: '冠軍之夜', sub: '凱旋進行曲・管絃與定音鼓', tag: '榮耀', bpm: 122, swing: .5, trim: .74, mix: { rev: 2.2, revWet: .24, dly: .5, fb: .2, dw: .12, drum: 1 }, play: victoryPlay },
  { id: 'night', icon: '🌙', name: '夜場燈下', sub: '質感夜曲・電鋼琴與顫音琴', tag: '質感', bpm: 96, swing: .56, trim: 1, mix: { rev: 2.8, revWet: .3, dly: .75, fb: .3, dw: .28, drum: .75 }, play: nightPlay }
];
document.addEventListener('visibilitychange', () => { const c = SND.ctx; if (!c) return; if (document.hidden) c.suspend(); else c.resume(); });
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

