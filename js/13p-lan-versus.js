/* 13p-lan-versus.js ｜ 同 Wi-Fi 雙人連線對戰（兩支手機各選一隊、各操控自己那一隊）
   原理：兩支手機各跑一份完全相同的模擬（固定 1/60 秒步長＋同種子亂數），只互傳「投球選擇」「揮棒判定」這類很小的資料。
   連線：WebRTC DataChannel 直連（同一個 Wi-Fi，不需要任何伺服器）；用「邀請碼／回覆碼」互相交換一次即可。
   規則：投手每球限時 15 秒（壘上有人 18 秒），時間到由電腦自動投直球。
   其他檔案的配合：04 的 vsOn/engBats/engPitches/mineBats/minePitches/MYH、11 的 handleSwing/takePitch/updateFlight/releasePitch、14 的 frame 固定步長。 */
const VS = {
  on: false, role: '', me: 0, gs: 0, n: 0, acc: 0, rngOn: false, sr: null, rtt: 40, running: false,
  myReady: -1, peerReady: -1, turnOn: false, pend: null, pitching: false, snaps: {}, swings: {}, takes: {}, inbox: null,
  lobby: { hostTeam: -1, guestTeam: -1, inn: 9, first: 'rand', park: '', assist: 1, hint: 0, easy: 0, wx: 1, abs: 1 }, ep: 0, ck: 0, peerEp: -1, peerCk: -1, free: false, rec: {}, hs: [], diag: [], diagT: 0, pendFs: null, stT: 0, wxT: 0, wxRun: false, inAdv: false, tq: {}, peerId: -1, peerSn: -1, aseq: 0, actQ: [], applying: false, fmCur: null, fmLast: '', link: null, W: [], natRand: null, mismatch: 0
};
(function () {
  const $$ = id => document.getElementById(id), NATIVE = Math.random.bind(Math);
  const TIME_NO = 15, TIME_RUN = 18, NAME = { bye: '對手已離開比賽', lost: '與對手的連線中斷了' };
  /* ---------------- 亂數：兩邊用同一個種子 ---------------- */
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mk(seed) { let a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  VS.reseed = function (tag) { const k = [VS.gs, tag, VS.n, G.inning, G.half, G.outs, G.balls, G.strikes, G.score[0], G.score[1]].join(','); VS.sr = mk(hashStr(k)); };
  /* ---------------- 傳輸：WebRTC（手動交換邀請碼） ---------------- */
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64 = t => { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  /* 邀請碼／回覆碼：只留 ICE 帳密、指紋與候選位址，重組成 SDP（約 150 字元，可直接做成 QR） */
  const hex2b = h => Uint8Array.from(h.split(':').map(x => parseInt(x, 16))), b2hex = u => Array.from(u).map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(':');
  async function encode(o) {
    const g = r => { const m = new RegExp('^a=' + r + ':(.+)$', 'm').exec(o.s); return m ? m[1].trim() : ''; };
    const fp = g('fingerprint').split(' ')[1] || '', cs = [];
    for (const l of o.s.split(/\r?\n/)) { const m = /^a=candidate:\S+ \d+ udp \d+ (\S+) (\d+) typ host/i.exec(l); if (m) cs.push(m[1] + '#' + m[2]); }
    return 'CP2.' + o.k + '|' + g('ice-ufrag') + '|' + g('ice-pwd') + '|' + b64(hex2b(fp)) + '|' + cs.join(',');
  }
  async function decode(txt) {
    const m = /CP2\.([oa])\|([^|\s]+)\|([^|\s]+)\|([A-Za-z0-9_-]+)\|(\S+)/.exec(String(txt || '').replace(/\s+/g, '')); if (!m) throw new Error('邀請碼格式不對（請重新掃描或完整貼上）');
    const cs = m[5].split(',').map((c, i) => { const [ip, port] = c.split('#'); return `a=candidate:${i + 1} 1 udp ${2122260223 - i * 1000} ${ip} ${port} typ host generation 0`; });
    const sdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=ice-ufrag:' + m[2], 'a=ice-pwd:' + m[3], 'a=fingerprint:sha-256 ' + b2hex(unb64(m[4])), 'a=setup:' + (m[1] === 'o' ? 'actpass' : 'active'), 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144'].concat(cs, ['']).join('\r\n');
    return { k: m[1], s: sdp };
  }
  function waitIce(pc) { return new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 3500); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); }); }
  const L = { pc: null, dc: null, lastRx: 0, pingT: 0, open: false };
  VS.link = L;
  function newPc() {
    closeLink(); const pc = new RTCPeerConnection({ iceServers: [] }); L.pc = pc;
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') netLost('連線失敗：請確認兩支手機在同一個 Wi-Fi，且路由器沒有開「AP 隔離／訪客網路」'); else if (pc.connectionState === 'disconnected') setTimeout(() => { if (L.pc === pc && pc.connectionState !== 'connected') netLost(NAME.lost); }, 4000); };
    return pc;
  }
  function wireDc(dc) {
    L.dc = dc; dc.onopen = () => { L.open = true; L.lastRx = performance.now(); VS.send({ t: 'p', ts: performance.now() }); lobbyOpen(); };
    dc.onclose = () => { if (L.open) netLost(NAME.lost); };
    dc.onmessage = e => { L.lastRx = performance.now(); let m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(m); };
  }
  function closeLink() { L.open = false; try { if (L.dc) { L.dc.onclose = null; L.dc.close(); } } catch (e) { } try { if (L.pc) { L.pc.onconnectionstatechange = null; L.pc.close(); } } catch (e) { } L.pc = L.dc = null; }
  VS.send = o => { try { if (L.dc && L.dc.readyState === 'open') L.dc.send(JSON.stringify(o)); } catch (e) { } };
  async function hostOffer() { const pc = newPc(); wireDc(pc.createDataChannel('vs', { ordered: true })); await pc.setLocalDescription(await pc.createOffer()); await waitIce(pc); return encode({ k: 'o', s: pc.localDescription.sdp }); }
  async function guestAnswer(code) { const d = await decode(code); if (d.k !== 'o') throw new Error('這不是「邀請碼」，請貼上房主給你的那一組'); const pc = newPc(); pc.ondatachannel = e => wireDc(e.channel); await pc.setRemoteDescription({ type: 'offer', sdp: d.s }); await pc.setLocalDescription(await pc.createAnswer()); await waitIce(pc); return encode({ k: 'a', s: pc.localDescription.sdp }); }
  async function hostAccept(code) { const d = await decode(code); if (d.k !== 'a') throw new Error('這不是「回覆碼」，請貼上對方回傳的那一組'); await L.pc.setRemoteDescription({ type: 'answer', sdp: d.s }); }
  setInterval(() => {      // 心跳：量測延遲、偵測斷線
    if (!L.open) return; VS.send({ t: 'p', ts: performance.now() });
    const gap = performance.now() - L.lastRx; const w = $$('vsWarn');
    if (VS.on && w) { const recent = performance.now() - (VS.diagT || -1e9) < 6000; w.classList.toggle('on', gap > 4000 || recent); w.textContent = gap > 4000 ? '連線不穩，等待對手…' : '同步校正中（' + VS.mismatch + '）'; w.onclick = () => { try { alert((VS.diag.slice(-8).join('\n')) || '無紀錄'); } catch (e) { } }; }
    if (gap > 25000) netLost(NAME.lost);
  }, 1000);
  /* ---------------- 訊息分派 ---------------- */
  function onMsg(m) {
    switch (m.t) {
      case 'p': VS.send({ t: 'q', ts: m.ts }); break;
      case 'q': { const r = performance.now() - m.ts; VS.rtt = VS.rtt * .7 + r * .3; VS.rttMax = Math.max(r, (VS.rttMax || 0) * .9); lobbyStat(); break; }
      case 'lobby': Object.assign(VS.lobby, m.L); lobbyRender(); break;
      case 'pick': VS.lobby.guestTeam = m.team; lobbyRender(); lobbySync(); break;
      case 'start': begin(m.cfg); break;
      case 'bye': leaveWith(NAME.bye); break;
      case 'ready': onReady(m); break;
      case 'turn': if (m.n === VS.n) { VS.turnOn = true; VS.turnT0 = performance.now(); VS.limit = m.limit; } break;
      case 'ptsnap': VS.snaps[m.n] = m.pt; if (PT && PT.vsN === m.n && PT.vsWait) { adopt(PT, m.pt); PT.vsWait = 0; } break;
      case 'swing': applySwing(m); break;
      case 'take': VS.takes[m.n] = 1; break;
      case 'st': VS.hs.push(m); procSnaps(); break;
      case 'tk': addTick(m.e); break;
      case 'sn': VS.peerEp = m.e; VS.peerCk = m.s; break;
    }
  }
  /* ---------------- 一球的同步流程 ---------------- */
  const digest = () => [G.inning, G.half, G.outs, G.balls, G.strikes, G.score[0], G.score[1], G.on.map(r => r && r.pl ? r.pl.name : '-').join('|'), (typeof curBatter === 'function' && curBatter() || {}).name, (typeof curPitcher === 'function' && curPitcher() || {}).name].join('/');
  const fullState = () => ({ o: G.outs, b: G.balls, s: G.strikes, r: G.score.slice(), on: G.on.map(r => r && r.state === 'on' && r.pl ? r.pl.name : null), i: G.inning, h: G.half });
  function diag(msg) { VS.diag.push(msg); if (VS.diag.length > 40) VS.diag.shift(); VS.diagT = performance.now(); VS.mismatch++; console.warn('[VS]', msg); }
  function fixBases(hb) {      // 房主的壘上名單為準：把我這邊的跑者移到同一壘（或移除）
    let ch = 0; const mine = G.on.map(r => r && r.state === 'on' ? r : null);
    mine.forEach((r, i) => { if (!r || !r.pl) return; const j = hb.indexOf(r.pl.name); if (j === i) return; ch++; G.on[i] = null; if (j < 0) { r.state = 'out'; try { scene.remove(r.rig.root); } catch (e) { } E.runners = E.runners.filter(q => q !== r); } else r.__mv = j; });
    mine.forEach(r => { if (r && r.__mv !== undefined) { const j = r.__mv; delete r.__mv; G.on[j] = r; r.from = j + 1; r.to = j + 2; r.s = 0; r.lead = 0; try { const b = baseSpot(j + 1); r.rig.root.position.set(b.x, 0, b.z); } catch (e) { } } });
    return ch;
  }
  function applyFull(fs) {      // 每球開始：房主把「出局／球數／比分／壘上」直接覆蓋給訪客（保證不會越錯越遠）
    if (!fs || VS.role !== 'guest') return; const d = [];
    if (G.outs !== fs.o || G.balls !== fs.b || G.strikes !== fs.s || G.score[0] !== fs.r[0] || G.score[1] !== fs.r[1]) { d.push('count'); G.outs = fs.o; G.balls = fs.b; G.strikes = fs.s; G.score = fs.r.slice(); try { updateScoreboard(); updateLamps(); } catch (e) { } }
    const mb = G.on.map(r => r && r.state === 'on' && r.pl ? r.pl.name : null);
    if (mb.join('|') !== fs.on.join('|')) { d.push('bases ' + mb.join('|') + ' -> ' + fs.on.join('|')); fixBases(fs.on); try { updateActs(); } catch (e) { } }
    if (G.inning !== fs.i || G.half !== fs.h) d.push('inning');
    if (d.length) diag('賽前校正：' + d.join('；'));
  }
  VS.onPre = function () {      // 每球開始（兩台在同一個邏輯點）：換新的「共同時鐘」
    VS.myReady = VS.n; VS.pitching = false; VS.turnOn = false; VS.ep++; VS.ck = 0; VS.free = false; VS.rec = {}; VS.myDig = digest();
    VS.send({ t: 'ready', n: VS.n, d: VS.myDig, fs: fullState() }); wxAdvance(); VS.fmLast = '';
    for (const k in VS.tq) if (+k < VS.ep) delete VS.tq[k];
    if (VS.pendFs && VS.pendFs.n === VS.n) { applyFull(VS.pendFs.fs); VS.pendFs = null; }
    checkTurn();
  };
  function onReady(m) {
    VS.peerReady = m.n; VS.peerDig = m.d;
    if (VS.role === 'guest' && m.fs) { if (VS.myReady === m.n) applyFull(m.fs); else VS.pendFs = { n: m.n, fs: m.fs }; }
    checkTurn();
  }
  function checkTurn() {
    if (VS.turnOn || VS.myReady !== VS.n || VS.peerReady !== VS.n || G.phase !== 'pre') return;
    VS.turnOn = true; VS.turnT0 = performance.now(); VS.limit = G.on.some(r => r) ? TIME_RUN : TIME_NO;
    if (minePitches()) { VS.send({ t: 'turn', n: VS.n, limit: VS.limit }); trySend(); }
  }
  VS.submit = function (sel) {      // 自己是投手：玩家按完準度條（或時間到）
    if (VS.pitching || VS.pend) return; VS.pend = sel;
    if (!(VS.myReady === VS.n && VS.peerReady === VS.n)) { try { toast('等待對手同步…', '#fff', '#555'); } catch (e) { } }
    trySend();
  };
  function trySend() {      // 投手端送出：排進共同時鐘（現在＋5 步），兩台在同一步一起開始投球
    if (!VS.pend || VS.pitching || VS.myReady !== VS.n || VS.peerReady !== VS.n || G.phase !== 'pre') return;
    VS.pitching = true; const sel = VS.pend; VS.pend = null; VS.tickAct('PITCH', [sel]);
  }
  function pumpInbox() { }
  function exec(sel) {      // 兩邊同一時間點、同一個種子，執行同一球
    if (G.phase !== 'pre') { VS.pend = null; return; }
    if (G.rosinBusy) { G.rosinBusy = false; try { curPitcher().rosin = 1; const P = E.F.P; if (P && P.rig.anim && P.rig.anim.name === 'rosin') P.rig.anim = null; } catch (e) { } }      // 對手的止滑粉動畫還沒演完也不擋投球
    const pr = VS.rngOn; VS.running = true; VS.rngOn = true; try { VS.reseed('pitch'); window.doPitch(sel); } finally { VS.rngOn = pr; VS.running = false; }
    VS.n++; VS.turnOn = false; showTimer();
  }
  function stance() { try { if (E.bat && E.bat.rig) { if (G.callBunt) E.bat.rig.anim = { name: 'bunt', t: 0, dur: 1e9, opt: { hold: true } }; else if (E.bat.rig.anim && E.bat.rig.anim.name === 'bunt') batterStance(); } } catch (e) { } }
  function applyBunt(m) { G.callBunt = !!m.v; G.sneak = !!m.s; if (PT && m.pl) PT.pulled = true; stance(); }
  const SKIP = { t: 1, done: 1, waitCatch: 1, flashed: 1, cprep: 1, bnc: 1, sw: 1, pulled: 1, call: 1, pos: 1, tfx: 1, plan: 1, vsN: 1, vsWait: 1, vsRes: 1, vsH0: 1, vsTake: 1, resolved: 1, swing: 1 };
  const isXYZ = v => v && typeof v === 'object' && isFinite(v.x) && isFinite(v.y) && isFinite(v.z) && Object.keys(v).length <= 6;
  function snapshot(pt) { const o = {}; for (const k of Object.keys(pt)) { if (SKIP[k]) continue; const v = pt[k], ty = typeof v; if (ty === 'number' ? isFinite(v) : (ty === 'boolean' || ty === 'string')) o[k] = v; else if (isXYZ(v)) o[k] = { x: v.x, y: v.y, z: v.z }; } return o; }
  function adopt(pt, sn) { for (const k in sn) { const v = sn[k]; if (v && typeof v === 'object') { if (pt[k] && typeof pt[k].set === 'function') pt[k].set(v.x, v.y, v.z); else if (pt[k] && typeof pt[k] === 'object') { pt[k].x = v.x; pt[k].y = v.y; pt[k].z = v.z; } } else pt[k] = v; } }
  VS.onRelease = function (pt) {      // 球出手：打者那台把「這球的實際軌跡」傳給投手那台，讓兩邊完全一樣（含觸身球判定）
    const n = VS.n - 1; pt.vsN = n;
    if (mineBats()) VS.send({ t: 'ptsnap', n, pt: snapshot(pt) });
    else { const sn = VS.snaps[n]; if (sn) adopt(pt, sn); else pt.vsWait = performance.now(); const sw = VS.swings[n]; if (sw) applySwing(sw); }
  };
  VS.stall = pt => { if (!pt.vsWait) return false; if (performance.now() - pt.vsWait > 1500) { pt.vsWait = 0; return false; } return true; };
  const clean = o => JSON.parse(JSON.stringify(o));
  VS.swingRes = function (pt, sw, fn) {      // 判定一律以打者那台為準（判定用到鏡頭位置，兩台不會一模一樣）
    if (mineBats()) { const res = fn(); VS.send({ t: 'swing', n: VS.n - 1, sw: clean(sw), res: clean(res) }); VS.reseed('hit'); return res; }
    const res = pt.vsRes; VS.reseed('hit'); return res || fn();
  };
  function applySwing(m) {
    if (!PT || PT.vsN !== m.n || PT.sw) { VS.swings[m.n] = m; return; }
    const sw = Object.assign({}, m.sw); delete sw.done; PT.vsRes = m.res; startSwing(PT, sw);
  }
  VS.onTake = function (pt) { if (mineBats()) VS.send({ t: 'take', n: VS.n - 1 }); };
  VS.hold = function (pt) {      // 投手這台：球到本壘了，要等打者那台說「揮了」或「沒揮」才繼續
    if (mineBats() || pt.sw || pt.vsTake || VS.takes[VS.n - 1]) return false; if (!pt.vsH0) pt.vsH0 = performance.now(); return performance.now() - pt.vsH0 < 1800;
  };
  /* ---------------- 投球倒數與自動直球 ---------------- */
  function showTimer() { const e = $$('vsTimer'); if (!e) return; const show = VS.on && VS.turnOn && !VS.pitching && G.phase === 'pre' && G.mode === 'play'; e.classList.toggle('on', !!show); }
  setInterval(() => {
    if (!VS.on) return; const e = $$('vsTimer'); if (!e) return;
    if (G.mode !== 'play' || G.phase !== 'pre' || !VS.turnOn || VS.pitching) { e.classList.remove('on'); return; }
    const left = Math.max(0, VS.limit - (performance.now() - VS.turnT0) / 1000), mine = minePitches();
    e.classList.add('on'); e.classList.toggle('mine', mine); e.classList.toggle('low', left <= 5);
    e.innerHTML = `<b>${Math.ceil(left)}</b><span>${mine ? '你的投球時間' : '對手投球中'}${G.on.some(r => r) ? '（壘上有人 18 秒）' : ''}</span>`;
    if (mine && left <= 0 && !VS.pend) autoPitch();
    if (VS.inbox) pumpInbox();
  }, 100);
  function autoPitch() {
    try { pmCancel(); } catch (e) { } const p = curPitcher(), id = p.pitches.some(q => q.id === 'ST') ? 'ST' : p.pitches[0].id;
    try { toast('時間到！自動投直球', '#fff', '#a33'); $('pitchPanel').classList.add('hide'); } catch (e) { }
    VS.submit({ id, x: (NATIVE() - .5) * .3, y: ZC + (NATIVE() - .5) * .25 });
  }
  /* ---------------- 安裝／還原：只在連線對戰期間改動引擎 ---------------- */
  const COSM = 'spawnBurst fwSpawn powderPuff rosinBurstFx noiseBurst tone ring sweepNoise shapedNoise flowSfx crowdRoar hornSeq cheerDrums hitFanfare hrFanfare hitSfx bounceSfx applause crowdGasp crowdGroan hitFeel hitFeel2 updateBursts updateFireworks updateTrash updateBatBoy batterFidget prepAction behaviorTick practiceSwing showHitInfo vibHit flashScreen'.split(' ');
  const RESEED = 'startHalf endHalf nextBatter finishAB pitchResult takePitch'.split(' ');
  function wrap(name, make) { const o = window[name]; if (typeof o !== 'function') return; VS.W.push([name, o]); window[name] = make(o); }

  /* ---------------- 動作同步（賽前：即時互傳；球進場內：依「共同步數」同一步套用） ---------------- */
  VS.nat = () => NATIVE();
  const LEAD = 4, DL = LEAD + 1, OFFK = ['offCall', 'squeeze', 'stealReq', 'stealSel', 'stealSet', 'leadMode', 'hitAndRun'];
  VS.H = {      // 動作表：兩台手機用同一份函式、同一組參數執行
    TAC: (g, v) => setTacCore(g, v), TACCLR: () => tacClr(), IBB: () => ibbCore(),
    OFF: s => { for (const k of OFFK) if (k in s) G[k] = s[k]; },
    ROSIN: () => { doRosin(); }, PICK: i => doPickoff(i),
    SPICK: b => { const ok = q => q.earlyGo && q.state === 'run' && q.dir > 0 && q.s < .95, rr = E.runners.find(q => ok(q) && (!b || q.to === b)) || E.runners.find(ok); if (rr) stealPickoff(rr); },
    MV: s => moundVisit(s), CP: (s, i) => actCP(s, i), BPS: (s, i) => bpStart(s, i),
    BPX: (s, i) => { const p = G.teams[s].pitchers[i]; if (p) p.warming = false; bpSync(); },
    PH: (s, a, b) => actPH(s, a, b), PR: (s, f, n) => actPR(s, f, n), DS: (s, a, b) => actDS(s, a, b), SW: (s, a, b) => actSW(s, a, b),
    STEAL: i => launchEarlySteal([i]),
    PUSH: () => doPush(), RET: () => doRetreat(), THROW: b => humanThrow(b),
    FMSEL: pos => FM.vsSel(pos), FMV: q => { VS.fmCur = q ? { x: q[0], z: q[1], m: q[2] } : null; }
  };
  function wxAdvance() {      // 天氣只在「每球開始」這個兩台一致的時間點前進（其他時間凍結），風向／雨量才不會兩台各算各的
    if (!G.wxOn || !G.wx || G.wx.dome || typeof updateWeather !== 'function') return;
    const pr = VS.rngOn, ps = VS.sr; VS.rngOn = true; VS.sr = mk(hashStr(VS.gs + 'wx' + VS.n + ',' + G.inning + ',' + G.half + ',' + G.outs)); VS.wxRun = VS.inAdv = true;
    try { for (let i = 0; i < 10; i++) { VS.wxT += 2; updateWeather(2); } } catch (e) { console.error('[VS] wx', e); } finally { VS.wxRun = VS.inAdv = false; VS.rngOn = pr; VS.sr = ps; }
  }
  const PRE_ONLY = new Set(['TAC', 'TACCLR', 'IBB', 'OFF', 'ROSIN', 'PICK', 'SPICK', 'MV', 'CP', 'BPS', 'BPX', 'PH', 'PR', 'DS', 'SW', 'STEAL', 'PITCH']);
  VS.H.PITCH = sel => exec(sel);
  VS.H.PROT = q => { const c = VS.protCtx; VS.protCtx = null; if (c) runProtest(c.team, c.call, c.finish, .15 + clamp(q / 20, 0, 1) * .85); };      // 教練抗議：該隊手機把連點結果送給兩台，兩台用同一個力道、同一組亂數判定
  window.vsProtEnd = (B, pct) => { VS.protCtx = { team: B.team, call: B.call, finish: B.finish }; if (MYH() === B.team) VS.tickAct('PROT', [Math.round(clamp(pct, 0, 1) * 20)]); };
  VS.H.BUNT = (v, s2, pl) => applyBunt({ v, s: s2, pl });
  VS.H.ABS = (kind, go) => { if (kind === 'r') absResolveInput(go); else if (go) runPend(); else absClearPend(); };
  window.vsAct = function (k, a) {      // 單機：直接執行；連線：排進共同時鐘，兩台同一步套用
    const h = VS.H[k]; if (!vsOn() || VS.applying) return h.apply(null, a);
    const sp = (k === 'SPICK' || k === 'PICK') && G.phase === 'windup';      // 盜壘時投手可在投球動作中改傳壘
    if ((G.phase !== 'pre' && !sp) || (!sp && (VS.pitching || VS.pend))) { try { toast('投球前才能操作', '#fff', '#555'); } catch (e) { } return false; }
    VS.tickAct(k, a); return true;
  };
  window.vsOffSync = () => { if (!vsOn() || G.phase !== 'pre') return; const s = {}; for (const k of OFFK) s[k] = G[k] === undefined ? null : G[k]; vsAct('OFF', [clean(s)]); };
  function addTick(e) { const q = VS.tq[e.ep] || (VS.tq[e.ep] = {}); (q[e.tick] || (q[e.tick] = [])).push(e); }
  VS.tickAct = function (k, a) {      // 所有輸入：排在「共同時鐘＋5」，兩台同一步套用
    if (!VS.on) return false;
    const e = { ep: VS.ep, tick: VS.ck + DL, k, a: a || [], who: VS.role === 'host' ? 0 : 1, seq: ++VS.aseq };
    addTick(e); VS.send({ t: 'tk', e }); return true;
  };
  function applyTicks() {
    const q = VS.tq[VS.ep]; if (!q) return; const ks = Object.keys(q).map(Number).filter(t => t <= VS.ck).sort((a, b) => a - b); if (!ks.length) return;
    const ps = VS.sr, pa = VS.applying; VS.applying = true;
    try { for (const t of ks) { const ev = q[t].sort((a, b) => a.who - b.who || a.seq - b.seq); delete q[t]; for (const e of ev) { if (PRE_ONLY.has(e.k) && G.phase !== 'pre' && !((e.k === 'SPICK' || e.k === 'PICK') && G.phase === 'windup')) continue; const h = VS.H[e.k]; if (!h) continue; VS.sr = mk(hashStr(VS.gs + 'ev' + e.who + ':' + e.seq)); try { h.apply(null, e.a); } catch (x) { console.error('[VS] ev', e.k, x); } } } } finally { VS.applying = pa; VS.sr = ps; }
  }
  /* ---- 房主權威校正：房主每 5 步送一份狀態，訪客拿「同一步的自己」比對，差多少就補多少 ---- */
  function takeSnap() {
    const o = { c: [G.outs, G.balls, G.strikes, G.score[0], G.score[1]], r: {}, f: {}, ph: G.phase };
    for (const r of E.runners) if (r.pl) o.r[r.pl.name] = [r.state, r.from, r.to, r.dir, +(+r.s || 0).toFixed(3), +(+r.lead || 0).toFixed(3)];
    for (const k in E.F) { const f = E.F[k]; if (f) o.f[k] = [+f.x.toFixed(2), +f.z.toFixed(2)]; }
    if (typeof PL !== 'undefined' && PL && !PL.done) o.p = [PL.state, +(+PL.t || 0).toFixed(3), +(+PL.tAge || 0).toFixed(3)];
    return o;
  }
  function correct(h, m) {
    const d = [];
    if (h.c.some((v, i) => v !== m.c[i])) { d.push('count'); G.outs = h.c[0]; G.balls = h.c[1]; G.strikes = h.c[2]; G.score = [h.c[3], h.c[4]]; try { updateScoreboard(); updateLamps(); } catch (e) { } }
    for (const nm in h.r) {
      const a = h.r[nm], b = m.r[nm], cur = E.runners.find(r => r.pl && r.pl.name === nm);
      if (!b || !cur) { d.push('runner ' + nm + ' 不存在'); continue; }
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3]) { d.push('runner ' + nm + ' ' + b.slice(0, 4).join('/') + '≠' + a.slice(0, 4).join('/')); continue; }
      if (Math.abs(a[4] - b[4]) > .02) cur.s += a[4] - b[4]; if (Math.abs(a[5] - b[5]) > .05) cur.lead += a[5] - b[5];
    }
    for (const k in h.f) { const a = h.f[k], b = m.f[k], f = E.F[k]; if (!b || !f) continue; const dx = a[0] - b[0], dz = a[1] - b[1]; if (Math.hypot(dx, dz) > .12) { f.x += dx; f.z += dz; } }
    if (h.p && m.p && typeof PL !== 'undefined' && PL) { if (h.p[0] !== m.p[0]) d.push('play ' + m.p[0] + '≠' + h.p[0]); else { if (Math.abs(h.p[1] - m.p[1]) > .008) PL.t += h.p[1] - m.p[1]; if (Math.abs(h.p[2] - m.p[2]) > .008) PL.tAge += h.p[2] - m.p[2]; } }
    if (d.length) diag('校正@' + VS.ck + '：' + d.join('；'));
  }
  function procSnaps() {
    if (VS.role !== 'guest') { VS.hs = []; return; }
    VS.hs = VS.hs.filter(m => { if (m.e < VS.ep) return false; if (m.e > VS.ep) return true; const mine = VS.rec[m.s]; if (mine) { correct(m.d, mine); return false; } return m.s >= VS.ck - 60; });
  }
  function afterStep() {
    VS.ck++; VS.send({ t: 'sn', e: VS.ep, s: VS.ck });
    if (VS.ck % 5 === 0) { const sn = takeSnap(); if (VS.role === 'host') VS.send({ t: 'st', e: VS.ep, s: VS.ck, d: sn }); else { VS.rec[VS.ck] = sn; delete VS.rec[VS.ck - 60]; procSnaps(); } }
  }
  setInterval(() => {      // 手動守備：把搖桿方向（量化）排進同步佇列
    if (!VS.on || !minePitches() || typeof FM === 'undefined') return;
    const pl = typeof PL !== 'undefined' ? PL : null;
    if (!pl || pl.done || !FM.uiOK()) { VS.fmLast = ''; return; }
    const d = FM.rawDir(), q = d ? [Math.round(d.x * 20) / 20, Math.round(d.z * 20) / 20, Math.round(d.m * 10) / 10] : null, key = q ? q.join(',') : '';
    if (key !== VS.fmLast) { VS.fmLast = key; VS.tickAct('FMV', [q]); }
  }, 33);
  function install() {
    VS.W = []; VS.natRand = Math.random; Math.random = () => VS.rngOn ? VS.sr() : NATIVE();
    wrap('step', o => function (dt) {
      VS.rngOn = true;
      if (PT && PT.vsWait && !PT.done) { if (performance.now() - PT.vsWait < 1500) { VS.rngOn = false; return; } PT.vsWait = 0; }      // 等對手送來的投球軌跡：整步暫停（兩台時鐘才不會歪）
      const pk = VS.peerEp === VS.ep ? VS.peerCk : (VS.peerEp > VS.ep ? 1e9 : -1);      // 共同時鐘：領先對方超過 LEAD 步就等
      if (!VS.free && VS.ck > pk + LEAD) { const now = performance.now(); if (!VS.stT) VS.stT = now; if (now - VS.stT < 1500) { VS.rngOn = false; return; } VS.free = true; diag('等待對手逾時，先自行繼續'); }
      VS.stT = 0; applyTicks();
      try { return o.call(this, dt); } finally { VS.rngOn = false; afterStep(); }
    });
    for (const n of COSM) wrap(n, o => function () { const p = VS.rngOn; VS.rngOn = false; try { return o.apply(this, arguments); } finally { VS.rngOn = p; } });
    for (const n of RESEED) wrap(n, o => function () { if (VS.rngOn) VS.reseed(n); return o.apply(this, arguments); });
    wrap('prePitchCore', o => function () { if (VS.rngOn) VS.reseed('pre'); const r = o.apply(this, arguments); if (G.phase === 'pre') VS.onPre(); return r; });
    wrap('doPitch', o => function (sel) { if (VS.running) return o.call(this, sel); if (!minePitches()) return; VS.submit(sel); });
    wrap('uiHold', o => function () { return false; });
    wrap('updateWeather', o => function (dt) { if (VS.wxRun) return o.call(this, dt); try { updateNight(dt); } catch (e) { } });      // 平時只更新夜景，不改風／雨狀態
    { let ltKey = '', ltT0 = 0; wrap('drawLightning', o => function (c, W, H) {      // 連線：天氣只在每球開始時推進，閃電計時會停在第一幀 → 閃電一直掛在畫面上。這裡只改「畫面」：用真實時間播完 0.7 秒就消失；不改 G.lt（兩台天氣狀態要一致）
      const L = G.lt; if (!L || L.t < 0) { ltKey = ''; return o.apply(this, arguments); }
      const k = L.t + '|' + L.cd; if (k !== ltKey) { ltKey = k; ltT0 = performance.now(); }
      const el = (performance.now() - ltT0) / 1000; if (el > .7) return;
      const t = L.t; L.t = t + el; try { return o.apply(this, arguments); } finally { L.t = t; }
    }); }
    wrap('updateNight', o => function (dt) { if (VS.inAdv) return; return o.call(this, dt); });
    wrap('doPush', o => function () { if (VS.applying || VS.rngOn) return o.apply(this, arguments); if (!mineBats() || !PL || PL.done || !pushCands().length) return false; return VS.tickAct('PUSH'); });
    wrap('doRetreat', o => function () { if (VS.applying || VS.rngOn) return o.apply(this, arguments); if (!mineBats() || !PL || PL.done || !retreatCands().length) return false; return VS.tickAct('RET'); });
    wrap('humanThrow', o => function (b) { if (VS.applying || VS.rngOn) return o.apply(this, arguments); if (!minePitches() || !PL || !PL.ask) return; VS.tickAct('THROW', [b]); });
    wrap('openAsk', o => function () { const r = o.apply(this, arguments); if (!minePitches()) { const tp = $$('throwPanel'); if (tp) tp.classList.add('hide'); } return r; });
        wrap('toggleBunt', o => function () { const r = o.apply(this, arguments); if (mineBats() && !VS.applying) VS.tickAct('BUNT', [!!G.callBunt, !!G.sneak, !!(PT && PT.pulled)]); return r; });
        wrap('cancelBunt', o => function () { const r = o.apply(this, arguments); if (mineBats() && !VS.applying) VS.tickAct('BUNT', [false, false, !!(PT && PT.pulled)]); return r; });
    wrap('absResolveInput', o => function (go) { if (VS.applying || VS.rngOn) return o.apply(this, arguments); const t = EV.abs ? EV.abs.team : -1; if (t < 0 || MYH() !== t) return; VS.tickAct('ABS', ['r', !!go]); });
    wrap('runPend', o => function () { if (VS.applying || VS.rngOn) return o.apply(this, arguments); const d = G.absPend; if (!d || MYH() !== d.team) return; VS.tickAct('ABS', ['p', true]); });
    wrap('absClearPend', o => function () { if (VS.applying || VS.rngOn) return o.apply(this, arguments); const d = G.absPend; if (!d || MYH() !== d.team) return; VS.tickAct('ABS', ['p', false]); });
    wrap('backToTitle', o => function () { leave(true); return o.apply(this, arguments); });
    const q = $$('quitYes'); VS.qOld = q.onclick; q.onclick = () => { leave(true); VS.qOld && VS.qOld(); };
    document.body.classList.add('vsx');
  }
  function uninstall() {
    for (const [n, o] of VS.W.reverse()) window[n] = o; VS.W = []; if (VS.natRand) { Math.random = VS.natRand; VS.natRand = null; }
    const q = $$('quitYes'); if (q && VS.qOld) q.onclick = VS.qOld; VS.qOld = null; document.body.classList.remove('vsx'); try { if (VS.hintWas !== undefined) HINT.on = VS.hintWas; } catch (e) { }
    ['vsTimer', 'vsWarn'].forEach(i => { const e = $$(i); if (e) e.classList.remove('on'); });
  }
  /* ---------------- 開賽／離開 ---------------- */
  function begin(cfg) {
    if (VS.on) return; VS.gs = cfg.seed; VS.me = VS.role === 'host' ? cfg.side : 1 - cfg.side; VS.n = 0; VS.acc = 0; VS.wxT = 0; VS.tq = {}; VS.ep = 0; VS.ck = 0; VS.peerEp = -1; VS.peerCk = -1; VS.free = false; VS.rec = {}; VS.hs = []; VS.diag = []; VS.pendFs = null; VS.mismatch = 0; VS.aseq = 0; VS.actQ = []; VS.fmCur = null; VS.fmLast = ''; VS.myReady = VS.peerReady = -1; VS.turnOn = false; VS.pend = null; VS.pitching = false; VS.inbox = null; VS.snaps = {}; VS.swings = {}; VS.takes = {}; VS.mismatch = 0;
    const root = $$('vsRoot'); if (root) root.classList.add('hide');
    try { sndInit(); } catch (e) { } install(); VS.on = true; ensureHud(); try { VS.hintWas = HINT.on; HINT.on = !!cfg.hint; } catch (e) { }
    if (typeof srand === 'function') srand(cfg.seed);
    VS.sr = mk(hashStr('new' + cfg.seed)); VS.rngOn = true;
    try { newGame(cfg); } finally { VS.rngOn = false; }
  }
  function leave(notify) { if (!VS.on) return; if (notify) VS.send({ t: 'bye' }); VS.on = false; clearTimeout(VS.lockT); uninstall(); closeLink(); }
  function leaveWith(msg) { const was = VS.on; leave(false); closeLink(); try { alert(msg); } catch (e) { } if (was) { try { backToTitle(); } catch (e) { } } else lobbyClose(); }
  function netLost(msg) { if (!L.open && !VS.on && !$$('vsRoot')) return; L.open = false; leaveWith(msg); }
  VS.leave = leave; VS.onMsg = onMsg; VS._begin = begin;
  /* ---------------- 畫面：大廳／配對 ---------------- */
  function ensureHud() {
    if ($$('vsTimer')) return; const t = document.createElement('div'); t.id = 'vsTimer'; document.body.appendChild(t);
    const w = document.createElement('div'); w.id = 'vsWarn'; document.body.appendChild(w);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function root() { let r = $$('vsRoot'); if (!r) { r = document.createElement('div'); r.id = 'vsRoot'; document.body.appendChild(r); } r.classList.remove('hide'); return r; }
  function lobbyClose() { const r = $$('vsRoot'); if (r) r.classList.add('hide'); closeLink(); const t = $$('title'); if (t) t.classList.remove('hide'); }
  const teams = () => TEAMS.map((t, i) => [t, i]).filter(([t]) => !t.hidden);
  function shell(title, body) { const r = root(); r.innerHTML = `<div class="vs-box"><h2>${title}</h2>${body}</div>`; return r; }
  async function copyTxt(txt, btn) { try { await navigator.clipboard.writeText(txt); } catch (e) { const ta = document.querySelector('#vsRoot textarea'); if (ta) { ta.select(); try { document.execCommand('copy'); } catch (_) { } } } if (btn) { const o = btn.textContent; btn.textContent = '✔ 已複製'; setTimeout(() => btn.textContent = o, 1200); } }
  async function share(txt, title) { if (navigator.share) { try { await navigator.share({ title, text: txt }); return true; } catch (e) { } } return false; }
  function scrMode() {
    const r = shell('⚔ 雙人連線對戰', `<p class="vs-tip">兩支手機連到<b>同一個 Wi-Fi</b>，各選一隊、各操控自己的隊伍。<br>投手每球限時 <b>15 秒</b>（壘上有人 <b>18 秒</b>），超時自動投直球。</p>
      <div class="vs-row"><button class="vs-btn big" id="vsHost">🏠 我來開房間</button><button class="vs-btn big alt" id="vsJoin">🔗 加入對方的房間</button></div><button class="vs-btn ghost" id="vsBack">← 返回主畫面</button>`);
    $$('vsHost').onclick = scrHost; $$('vsJoin').onclick = scrJoin; $$('vsBack').onclick = lobbyClose;
  }
  /* ---- QR：顯示（qrcode-generator）與掃描（BarcodeDetector，沒有就用 jsQR） ---- */
  const loadJs = src => new Promise((ok, no) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = () => no(new Error('載入失敗：' + src)); document.head.appendChild(e); });
  async function qrHtml(txt) { if (typeof qrcode !== 'function') await loadJs('js/vendor/qrcode.min.js'); const q = qrcode(0, 'L'); q.addData(txt); q.make(); return q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }); }
  async function scanQr(onCode) {
    const ov = document.createElement('div'); ov.id = 'vsScan'; ov.innerHTML = '<video playsinline muted></video><div class="vs-scanmsg">把鏡頭對準對方手機上的 QR Code</div><button class="vs-btn">取消</button>'; document.body.appendChild(ov);
    let stop = false, stream = null; const vid = ov.querySelector('video'), done = () => { stop = true; try { stream && stream.getTracks().forEach(t => t.stop()); } catch (e) { } ov.remove(); };
    ov.querySelector('button').onclick = done;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); } catch (e) { done(); alert('無法開啟相機（需要允許相機權限，且網址要是 https）。也可以改用下方「貼上邀請碼」。'); return; }
    vid.srcObject = stream; await vid.play().catch(() => { });
    let det = null; try { if (window.BarcodeDetector) det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { }
    if (!det && typeof jsQR !== 'function') { try { await loadJs('js/vendor/jsqr.min.js'); } catch (e) { done(); alert('掃描元件載入失敗，請改用貼上邀請碼'); return; } }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (stop) return; let txt = '';
      try { if (vid.videoWidth) { if (det) { const r = await det.detect(vid); if (r.length) txt = r[0].rawValue; } else { const w = Math.min(640, vid.videoWidth), h = Math.round(w * vid.videoHeight / vid.videoWidth); cv.width = w; cv.height = h; cx.drawImage(vid, 0, 0, w, h); const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h); if (r) txt = r.data; } } } catch (e) { }
      if (txt && /CP2\./.test(txt)) { done(); onCode(txt); return; } setTimeout(tick, 120);
    }; tick();
  }
  const pasteInto = async id => { try { $$(id).value = await navigator.clipboard.readText(); } catch (e) { $$('vsErr').textContent = '無法讀取剪貼簿，請長按文字框選「貼上」'; } };
  async function scrHost() {
    VS.role = 'host'; shell('🏠 開房間', `<p class="vs-tip">產生邀請碼中…</p>`);
    let code, qr; try { code = await hostOffer(); qr = await qrHtml(code); } catch (e) { shell('無法建立連線', `<p class="vs-tip">${esc(e.message || e)}<br>此瀏覽器可能不支援 WebRTC。</p><button class="vs-btn" id="vsBk">返回</button>`); $$('vsBk').onclick = scrMode; return; }
    shell('🏠 開房間', `<p class="vs-tip"><b>①</b> 請朋友按「加入」→「📷 掃描 QR」，掃下面的 QR Code<br><b>②</b> 朋友手機會出現回覆 QR，按下面「📷 掃描朋友的回覆」</p>
      <div class="vs-qr">${qr}</div>
      <div class="vs-row"><button class="vs-btn alt" id="vsScanA">📷 掃描朋友的回覆 QR</button></div>
      <details class="vs-det"><summary>不能掃 QR？改用文字碼</summary><textarea class="vs-ta" readonly id="vsMyCode">${code}</textarea>
      <div class="vs-row"><button class="vs-btn" id="vsCp">📋 複製邀請碼</button><button class="vs-btn alt" id="vsSh">📤 分享</button></div>
      <textarea class="vs-ta" id="vsPeerCode" placeholder="貼上朋友傳回來的回覆碼"></textarea>
      <div class="vs-row"><button class="vs-btn" id="vsPaste">📥 貼上</button><button class="vs-btn big" id="vsGo">連線</button></div></details><div class="vs-err" id="vsErr"></div><button class="vs-btn ghost" id="vsBk">← 返回</button>`);
    const go = async txt => { $$('vsErr').textContent = '連線中…（約需數秒）'; try { await hostAccept(txt); } catch (e) { $$('vsErr').textContent = '❌ ' + (e.message || e); } };
    $$('vsCp').onclick = e => copyTxt(code, e.target); $$('vsSh').onclick = () => share(code, '棒球對戰邀請碼'); $$('vsBk').onclick = () => { closeLink(); scrMode(); };
    $$('vsPaste').onclick = () => pasteInto('vsPeerCode'); $$('vsGo').onclick = () => go($$('vsPeerCode').value); $$('vsScanA').onclick = () => scanQr(go);
  }
  function scrJoin() {
    VS.role = 'guest'; shell('🔗 加入房間', `<p class="vs-tip">請房主按「我來開房間」，然後用相機掃他螢幕上的 QR Code</p>
      <div class="vs-row"><button class="vs-btn big" id="vsScanA">📷 掃描房主的 QR</button></div>
      <details class="vs-det"><summary>不能掃 QR？改用文字碼</summary><textarea class="vs-ta" id="vsPeerCode" placeholder="貼上房主的邀請碼"></textarea>
      <div class="vs-row"><button class="vs-btn" id="vsPaste">📥 貼上</button><button class="vs-btn big" id="vsGo">產生回覆</button></div></details><div class="vs-err" id="vsErr"></div><button class="vs-btn ghost" id="vsBk">← 返回</button>`);
    $$('vsBk').onclick = () => { closeLink(); scrMode(); }; $$('vsPaste').onclick = () => pasteInto('vsPeerCode');
    const go = async txt => {
      $$('vsErr').textContent = '產生回覆中…'; let code, qr; try { code = await guestAnswer(txt); qr = await qrHtml(code); } catch (e) { $$('vsErr').textContent = '❌ ' + (e.message || e); return; }
      shell('🔗 加入房間', `<p class="vs-tip">請房主按「📷 掃描朋友的回覆 QR」，掃下面這個 QR，就會自動進入大廳</p><div class="vs-qr">${qr}</div>
        <details class="vs-det"><summary>文字碼</summary><textarea class="vs-ta" readonly id="vsMyCode">${code}</textarea><div class="vs-row"><button class="vs-btn" id="vsCp">📋 複製回覆碼</button><button class="vs-btn alt" id="vsSh">📤 分享</button></div></details>
        <div class="vs-err">等待房主連線中…</div><button class="vs-btn ghost" id="vsBk">← 取消</button>`);
      $$('vsCp').onclick = e => copyTxt(code, e.target); $$('vsSh').onclick = () => share(code, '棒球對戰回覆碼'); $$('vsBk').onclick = () => { closeLink(); scrMode(); };
    };
    $$('vsGo').onclick = () => go($$('vsPeerCode').value); $$('vsScanA').onclick = () => scanQr(go);
  }
  function lobbyOpen() {
    const host = VS.role === 'host', lb = VS.lobby; lb.hostTeam = -1; lb.guestTeam = -1;
    const opts = (id, arr, cur) => arr.map(([v, t]) => `<button class="vs-chip${cur == v ? ' on' : ''}" data-${id}="${v}">${t}</button>`).join('');
    shell('⚔ 對戰大廳', `<div class="vs-stat" id="vsStat"></div>
      <div class="vs-pick"><div><h3>我的隊伍</h3><div class="vs-teams" id="vsTeams"></div></div><div><h3>對手選擇</h3><div class="vs-opp" id="vsOpp">尚未選擇</div></div></div>
      <div id="vsCfg"></div><div class="vs-err" id="vsErr"></div><div class="vs-row"><button class="vs-btn ghost" id="vsBk">離開</button><button class="vs-btn big" id="vsStart" ${host ? '' : 'disabled'}>${host ? '開始比賽' : '等待房主開始…'}</button></div>`);
    $$('vsBk').onclick = () => { VS.send({ t: 'bye' }); closeLink(); scrMode(); };
    $$('vsTeams').innerHTML = teams().map(([t, i]) => `<button class="vs-team" data-i="${i}" style="--c1:${t.c1 || '#2a5adf'};--c2:${t.c2 || '#fff'}">${esc(t.short || t.name)}</button>`).join('');
    $$('vsTeams').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const i = +b.dataset.i; if (host) lb.hostTeam = i; else { lb.guestTeam = i; VS.send({ t: 'pick', team: i }); } lobbyRender(); if (host) lobbySync(); };
    $$('vsCfg').onclick = e => { if (!host) return; const b = e.target.closest('[data-k]'); if (!b) return; lb[b.dataset.k] = /^(inn|assist|hint|easy|wx|abs)$/.test(b.dataset.k) ? +b.dataset.v : b.dataset.v; lobbyRender(); lobbySync(); };
    $$('vsCfg').onchange = e => { if (host && e.target.id === 'vsPark') { lb.park = e.target.value; lobbySync(); } };
    $$('vsStart').onclick = hostStart; lobbyRender(); lobbyStat(); lobbySync();
  }
  const lobbySync = () => { if (VS.role === 'host') VS.send({ t: 'lobby', L: VS.lobby }); };
  function lobbyStat() { const e = $$('vsStat'); if (e) e.textContent = `🟢 已連線　延遲約 ${Math.round(VS.rtt)} ms`; }
  function lobbyRender() {
    const host = VS.role === 'host', lb = VS.lobby, my = host ? lb.hostTeam : lb.guestTeam, op = host ? lb.guestTeam : lb.hostTeam; if (!$$('vsTeams')) return;
    $$('vsTeams').querySelectorAll('[data-i]').forEach(b => { const i = +b.dataset.i; b.classList.toggle('on', i === my); b.classList.toggle('taken', i === op); });
    const ot = op >= 0 ? TEAMS[op] : null; $$('vsOpp').innerHTML = ot ? `<span class="vs-team on" style="--c1:${ot.c1 || '#2a5adf'};--c2:${ot.c2 || '#fff'}">${esc(ot.name)}</span>` : '尚未選擇';
    const chips = (k, arr) => `<div class="vs-line"><span>${k[1]}</span>${arr.map(([v, t]) => `<button class="vs-chip${lb[k[0]] == v ? ' on' : ''}" data-k="${k[0]}" data-v="${v}" ${host ? '' : 'disabled'}>${t}</button>`).join('')}</div>`;
    const parks = (typeof STADIUMS !== 'undefined' ? STADIUMS : []).map(n => `<option value="${esc(n)}"${lb.park === n ? ' selected' : ''}>${esc(n)}</option>`).join('');
    $$('vsCfg').innerHTML = chips(['inn', '局數'], [[3, '3 局'], [5, '5 局'], [9, '9 局']]) + chips(['first', '房主打序'], [['rand', '隨機'], ['bat', '先攻'], ['field', '後攻']]) + `<div class="vs-line"><span>球場</span><select id="vsPark" ${host ? '' : 'disabled'}><option value="">隨機</option>${parks}</select></div>`;
    $$('vsCfg').innerHTML += chips(['assist', '輔助守備（開＝電腦自動接球；關＝防守方手動走位）'], [[1, '開'], [0, '關']]) + chips(['hint', '投球提示（打者看得到落點提示）'], [[0, '關'], [1, '開']]) + chips(['easy', '簡易模式'], [[0, '關'], [1, '開']]) + chips(['wx', '天氣與風向'], [[1, '開'], [0, '關']]) + chips(['abs', 'ABS 鷹眼挑戰（雙方各 3 次）'], [[1, '開'], [0, '關']]);      // 開賽前由房主設定，開賽後雙方都不能改
    const ok = lb.hostTeam >= 0 && lb.guestTeam >= 0 && lb.hostTeam !== lb.guestTeam, st = $$('vsStart'), er = $$('vsErr');
    if (host) { st.disabled = !ok; er.textContent = lb.hostTeam >= 0 && lb.hostTeam === lb.guestTeam ? '兩邊要選不同的球隊' : (ok ? '' : '請雙方都選好球隊'); } else er.textContent = (my >= 0 && my === op) ? '兩邊要選不同的球隊' : '';
  }
  function hostStart() {
    const lb = VS.lobby; if (!(lb.hostTeam >= 0 && lb.guestTeam >= 0 && lb.hostTeam !== lb.guestTeam)) return;
    const seed = (NATIVE() * 4294967295) >>> 0, r = mk(seed), hostSide = lb.first === 'bat' ? 0 : lb.first === 'field' ? 1 : (r() < .5 ? 0 : 1);
    const t0 = hostSide === 0 ? lb.hostTeam : lb.guestTeam, t1 = hostSide === 0 ? lb.guestTeam : lb.hostTeam;
    const cfg = Object.assign({}, CFG, { away: t0, home: t1, homeFirst: false, side: hostSide, inn: lb.inn, lv: 1, abs: lb.abs ? 1 : 0, evt: 0, wx: lb.wx ? 1 : 0, pn: 0, ace: 1, spIdx: 0, assist: lb.assist ? 1 : 0, easy: lb.easy ? 1 : 0, hint: lb.hint ? 1 : 0, park: lb.park || '', night: r() < .5 ? 1 : 0, edit: [null, null], seed });
    VS.send({ t: 'start', cfg }); begin(cfg);
  }
  const tb = $$('tmVersus'); if (tb) tb.onclick = () => { try { sndInit(); } catch (e) { } if (typeof RTCPeerConnection !== 'function') { alert('這個瀏覽器不支援連線對戰（需要 WebRTC）'); return; } const t = $$('title'); if (t) t.classList.add('hide'); scrMode(); };
})();
