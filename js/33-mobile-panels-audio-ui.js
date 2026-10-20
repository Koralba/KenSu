/* 33-mobile-panels-audio-ui.js — 手機面板／更多選單／背景音設定面板（原 script.js 第 7343-7434 行） */
'use strict';
/* ---------------- 手機版：中間面板依左右兩塊的實際寬度排版，避免重疊 ---------------- */
let _lt = 0;
function layoutTop() {
  const bso = $('bso'), tb = $('topbar'), lc = $('leftCol'), hudEl = $('hud'); if (!bso || !tb) return;
  { const bb0 = bso.getBoundingClientRect(); if (bb0.height) { document.documentElement.style.setProperty('--abstop', Math.ceil(bb0.bottom + 4) + 'px'); } }      // ABS 提示緊貼壘包／出局數資訊板正下方
  if (MOB && !hudEl.classList.contains('hide')) {
    const bb = bso.getBoundingClientRect();
    if (bb.width) { const st = document.documentElement.style; st.setProperty('--bsow', Math.ceil(bb.width) + 'px'); st.setProperty('--bsoh', Math.ceil(bb.height) + 'px'); }
    const hr = hudEl.getBoundingClientRect(), t = tb.getBoundingClientRect();
    if (t.height) lc.style.top = Math.round(t.bottom - hr.top + 4) + 'px';
  } else lc.style.top = '';
}
setInterval(layoutTop, 400);
window.addEventListener('resize', layoutTop); window.addEventListener('orientationchange', () => setTimeout(layoutTop, 200));
/* ---------------- 手機版：可展開的小面板 ---------------- */
$('btnMore').onclick = () => $('acts').classList.toggle('open');
$('actMore').addEventListener('click', () => setTimeout(() => $('acts').classList.remove('open'), 0));
/* 「更多」選單：依實際位置限制高度（不再被畫面邊緣截掉）、顯示可捲動提示、開啟時隱藏會遮擋的提示 */
(function () {
  const acts = $('acts'), more = $('actMore'), hud = $('hud');
  function fitMore() {
    const open = acts.classList.contains('open');
    document.body.classList.toggle('moreOpen', open);
    if (!open) { more.style.maxHeight = ''; more.classList.remove('sc-up', 'sc-dn'); return; }
    const hr = hud.getBoundingClientRect(), ar = acts.getBoundingClientRect();
    const room = Math.floor(ar.top - Math.max(hr.top, 0) - 12);            // 「更多」按鈕上方可用的高度
    more.style.maxHeight = Math.max(120, room) + 'px';
    more.classList.toggle('sc-up', more.scrollTop > 2);
    more.classList.toggle('sc-dn', more.scrollTop + more.clientHeight < more.scrollHeight - 2);
  }
  new MutationObserver(fitMore).observe(acts, { attributes: true, attributeFilter: ['class'] });
  more.addEventListener('scroll', fitMore, { passive: true });
  window.addEventListener('resize', fitMore);
  window.addEventListener('orientationchange', () => setTimeout(fitMore, 200));
  setInterval(fitMore, 300);                                                // 按鈕數量會隨打擊／投球切換，定時重算
})();
$('sb').addEventListener('click', () => { if (MOB) { $('sb').classList.toggle('open'); layoutTop(); } });
let _piT = 0;
$('pinfo').addEventListener('click', () => { if (!MOB) return; const el = $('pinfo'); el.classList.toggle('open'); clearTimeout(_piT); if (el.classList.contains('open')) _piT = setTimeout(() => el.classList.remove('open'), 7000); });
document.addEventListener('pointerdown', e => {
  const wasOpen = G.mode === 'play' && ($('acts').classList.contains('open') || !$('sub').classList.contains('hide'));
  for (const [id, sel] of [['sb', '#sb'], ['pinfo', '#pinfo'], ['acts', '#acts']]) { if (!MOB && id !== 'acts') continue; if (!e.target.closest(sel)) $(id).classList.remove('open'); }
  if (wasOpen && !e.target.closest('#acts,#sub,#audioPanel,#quitDlg,#absPanel,#sb,#pinfo,#topbar,#result,#menu,.abtn,.pbtn')) { e.stopPropagation(); e.preventDefault(); }      // 選單／面板開著時，點場上只是關選單，不會順便揮棒或投球
}, true);

/* ---------------- 背景音設定面板（「更多」→「背景音設定」開啟） ---------------- */
(function () {
  const panel = $('audioPanel'), mute = $('audioMute'), vol = $('audioVol'), num = $('audioNum'), list = $('audioTracks'), now = $('audioNow');
  const save = () => { try { localStorage.setItem('cpbl_bgm_vol', BGM.vol); localStorage.setItem('cpbl_bgm_mute', BGM.mute ? '1' : '0'); localStorage.setItem('cpbl_bgm_track', BGM.track); } catch (e) { } };
  const tagCls = { '熱血': 'hot', '休閒': 'chill', '輕鬆': 'chill', '趣味': 'fun' };
  BGM_TRACKS.forEach((T, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'trk'; b.dataset.i = i;
    b.innerHTML = `<span class="ti">${T.icon}</span><span class="tn"><b>${T.name}</b><i>${T.sub}</i></span><em class="${tagCls[T.tag] || ''}">${T.tag}</em>`;
    b.addEventListener('click', () => { sndInit(); if (BGM.mute || BGM.vol === 0) { BGM.mute = false; if (BGM.vol === 0) BGM.vol = 50; bgmApplyVol(); } bgmSelect(i); save(); sync(); b.blur(); });
    list.appendChild(b);
  });
  const sfxM = $('sfxMute'), sfxV = $('sfxVol'), sfxN = $('sfxNum');
  const sfxSave = () => { try { localStorage.setItem('cpbl_sfx_vol', SND.vol); localStorage.setItem('cpbl_sfx_mute', SND.mute ? '1' : '0'); } catch (e) { } };
  const sfxSync = () => { const off = SND.mute || SND.vol === 0; sfxM.textContent = off ? '🔇 遊戲音效　關' : '🔊 遊戲音效　開'; sfxM.classList.toggle('on', !off); sfxV.value = SND.vol; sfxN.textContent = SND.vol; };
  let sfxTestT = 0; const sfxTest = () => { const n = performance.now(); if (n - sfxTestT < 350) return; sfxTestT = n; try { flowSfx('mitt', 1); } catch (e) { } };
  sfxM.addEventListener('click', () => { sndInit(); if (SND.mute || SND.vol === 0) { SND.mute = false; if (SND.vol === 0) SND.vol = 70; } else SND.mute = true; sfxApplyVol(); sfxSave(); sfxSync(); sfxM.blur(); if (!SND.mute) sfxTest(); });
  sfxV.addEventListener('input', () => { sndInit(); SND.vol = +sfxV.value; if (SND.vol > 0) SND.mute = false; sfxApplyVol(); sfxSave(); sfxSync(); });
  sfxV.addEventListener('change', () => { sfxTest(); sfxV.blur(); });
  const vibB = $('vibToggle'), vibN = $('vibNote');
  const vibSync = () => { vibB.disabled = !VIB.can; vibB.classList.toggle('on', VIB.on && VIB.can); vibB.textContent = !VIB.can ? '📳 此裝置不支援震動' : VIB.on ? '📳 打擊震動　開' : '📳 打擊震動　關'; vibN.textContent = VIB.can ? '開啟後，打到球手機／平板會震動：打得越扎實震得越有力，擦棒或時機不好只有輕微一下。' : '（電腦與 iPhone 的瀏覽器不支援網頁震動，Android 手機／平板可使用）'; };
  vibB.addEventListener('click', () => { if (!VIB.can) return; VIB.on = !VIB.on; try { localStorage.setItem('cpbl_vib', VIB.on ? '1' : '0'); } catch (e) { } vibSync(); if (VIB.on) { try { navigator.vibrate([30, 20, 60]); } catch (e) { } } vibB.blur(); });
  const sync = () => {
    vibSync(); sfxSync(); const off = BGM.mute || BGM.vol === 0; mute.textContent = off ? '🔇 背景音樂　關' : '🔊 背景音樂　開'; mute.classList.toggle('on', !off); vol.value = BGM.vol; num.textContent = BGM.vol;
    [...list.children].forEach((b, i) => b.classList.toggle('on', i === BGM.track)); const T = BGM_TRACKS[BGM.track]; now.textContent = `♪ 目前播放：${T.name}（${T.sub}）`;
  };
  const open = () => { sndInit(); sync(); panel.classList.remove('hide'); };
  const close = () => { panel.classList.add('hide'); if (document.activeElement) document.activeElement.blur(); };
  $('btnBgm').addEventListener('click', e => { e.stopPropagation(); open(); });
  $('menuBgm').addEventListener('click', e => { e.stopPropagation(); open(); });
  $('titleBgm').addEventListener('click', e => { e.stopPropagation(); open(); });
  $('titleBgm').addEventListener('pointerdown', e => e.stopPropagation());
  $('audioClose').addEventListener('click', close);
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  document.addEventListener('pointerdown', e => {            // 面板開著時，點外面＝關閉（並吃掉這次點擊，避免誤觸揮棒）
    if (panel.classList.contains('hide')) return;
    if (e.target.closest('#audioPanel,#btnBgm,#menuBgm,#titleBgm')) return;
    close(); e.stopPropagation(); e.preventDefault();
  }, true);
  mute.addEventListener('click', () => { sndInit(); if (BGM.mute || BGM.vol === 0) { BGM.mute = false; if (BGM.vol === 0) BGM.vol = 50; } else BGM.mute = true; bgmApplyVol(); save(); sync(); mute.blur(); });
  vol.addEventListener('input', () => { sndInit(); BGM.vol = +vol.value; if (BGM.vol > 0) BGM.mute = false; bgmApplyVol(); save(); sync(); });
  vol.addEventListener('change', () => vol.blur());
  sync();
  /* 主畫面（標題）就有音樂：載入時先建立音訊；瀏覽器要求「使用者操作後」才能出聲，所以第一次點擊／觸控／按鍵立刻啟動 */
  try { sndInit(); } catch (e) { }
  const wake = () => { try { if (!SND.ctx) sndInit(); else if (SND.ctx.state !== 'running') SND.ctx.resume(); } catch (e) { } };
  ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, wake, { capture: true, passive: true }));
})();
