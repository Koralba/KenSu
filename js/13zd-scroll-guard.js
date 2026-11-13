'use strict';
/* iOS 橡皮筋回彈防護：手指按下時，若捲動容器剛好在最頂／最底，先位移 1px，
   讓往上／往下的拖曳都被容器自己吸收，不會連動整頁回彈、也不會讓 ✕ 被彈到看不見。 */
(function () {
  const ok = el => { const o = getComputedStyle(el).overflowY; return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1; };
  document.addEventListener('touchstart', e => {
    let el = e.target; if (el && el.nodeType !== 1) el = el.parentElement;
    if (el && el.closest && el.closest('input[type=range],canvas')) return;
    while (el && el !== document.body && el !== document.documentElement) {
      if (ok(el)) {
        const max = el.scrollHeight - el.clientHeight;
        if (el.scrollTop <= 0) el.scrollTop = 1; else if (el.scrollTop >= max) el.scrollTop = max - 1;
        return;
      }
      el = el.parentElement;
    }
  }, { passive: true, capture: true });
})();
