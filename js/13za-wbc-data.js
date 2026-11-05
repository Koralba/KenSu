/* ===== 13za-wbc-data.js ｜ WBC 經典賽模式：2026 世界棒球經典賽 20 隊名單（分組、隊色、30 人名單）=====
   資料來源：維基百科「2026 World Baseball Classic rosters」＋ 各隊分組（A 組聖胡安、B 組休士頓、C 組東京、D 組邁阿密）。
   名單＝各國協會最終送審的 30 人（含因傷／保險遞補進來的球員，也保留原名單上後來被替換的球員）。
   能力值：打者／投手的成績不是官方累計，而是依「球員層級 q（1~10）＋類型」換算成與一般模式相同格式的成績（一律標 est:1），
   再交給 01-core-data.js 的 batProf／pitProf 換算成遊戲能力值；因此名氣越大、q 越高，能力越強。
   名字：日本／台灣用漢字，韓國用漢字（不確定的用羅馬拼音），其餘國家用「名字縮寫＋姓」（同名衝突時寫全名）。
   檔案內容：WBC_DATA = { TEAMS:[{id,pool,name,...,cp:{bat,bench,sp,rp}}], POOLS, PARK, byId, check() }
   載入順序：放在 13zh 與 14 之間（見 FILE_MAP.md）；全域作用域共用（不是 module）。 */
'use strict';
const WBC_DATA = (function () {
  const clampN = (x, a, b) => Math.max(a, Math.min(b, x)), nzz = (n, k, a) => seededNoise(n + '#wbc' + k, a);
  /* 打者：H(姓名, 守位, 打, q, 類型)；類型 P 重砲／X 超級重砲／C 巧打／S 速度／G 守備型／預設均衡 */
  const FB = { C: 66, '1B': 54, '2B': 66, '3B': 64, SS: 70, LF: 60, CF: 68, RF: 62, DH: 48 }, AB = { C: 70, '1B': 54, '2B': 62, '3B': 70, SS: 70, LF: 60, CF: 66, RF: 72, DH: 50 };
  function H(n, p, h, q, t) { return { _s: [n, p, h, q, t] }; }      // 先只記規格，等 T() 知道所屬球隊的調整值再換算
  function mkB(n, p, h, q, t, A) {
    A = A || {}; q = clampN(q + (A.o || 0) + (PLAYER_Q[n] || 0), 1, 11);
    t = t || 'B'; let a = .202 + .0116 * q, iso = .088 + .0135 * q, ob = .046 + .0042 * q, k = 20.5 - .75 * q, bb = 5.2 + .42 * q, sb = Math.max(0, (q - 3) * .7), hrx = 0;
    if (t === 'P' || t === 'X') { a -= .014; iso += .072; ob += .012; k += 6.5; bb += 1.2; sb = Math.max(0, sb - 1.5); if (t === 'X') { iso += .055; ob += .03; hrx = 9; sb += 5; } }
    else if (t === 'C') { a += .012; iso -= .045; ob += .002; k -= 4.5; bb -= .4; }
    else if (t === 'S') { iso -= .03; sb = 6 + q * 2.6; k -= 1.5; }
    else if (t === 'G') { a -= .012; iso -= .022; k += 1; }
    else sb += 1.5;
    a = clampN(a + nzz(n, 'a', .009), .17, .36); iso = clampN(iso + nzz(n, 'i', .012), .05, .36); const o = clampN(a + ob + nzz(n, 'o', .008), a + .03, .5), s = a + iso;
    const hr = Math.round(clampN((iso - .07) * 135 + q * .25 + hrx + nzz(n, 'h', 2.5), 0, 48)); sb = Math.round(clampN(sb + nzz(n, 's', 2), 0, 42));
    const f = Math.round(clampN((FB[p] || 60) + (q - 5) * .8 + (A.f || 0) + (t === 'G' ? 10 : 0) - (t === 'P' || t === 'X' ? 4 : 0) + nzz(n, 'f', 5), 44, 90)), ar = Math.round(clampN((AB[p] || 60) + (A.f || 0) * .6 + (t === 'G' ? 5 : 0) + nzz(n, 'r', 5), 44, 84));
    return B(n, p, h, +a.toFixed(3), +o.toFixed(3), +s.toFixed(3), hr, sb, +clampN(k + nzz(n, 'k', 2), 6, 30).toFixed(1), +clampN(bb + nzz(n, 'b', 1), 3, 18).toFixed(1), f, ar, 1);
  }
  /* 投手：Pt(姓名, 投, 球速km/h, q, 球種)；先發／牛棚由放進 sp／rp 陣列決定，rp 最後一位＝終結者 */
  function Pt(n, h, v, q, ps) { return { n, h, v, q, ps: ps.split(',') }; }
  function mkP(r, role, A) {
    A = A || {}; const q = clampN(r.q + (A.p || 0) + (PLAYER_Q[r.n] || 0), 1, 11), era = clampN(5.7 - .37 * q + nzz(r.n, 'e', .25), 1.4, 6.5), k = clampN(9.5 + 1.85 * q + (role === 'CL' ? 2 : 0) + nzz(r.n, 'k', 1.2), 7, 33), bb = clampN(10.6 - .52 * q + nzz(r.n, 'b', .8), 3.5, 13);
    return P(r.n, role, r.h, r.v, +era.toFixed(2), +k.toFixed(1), +bb.toFixed(1), Math.round(clampN(360 / era, 60, 160)), role === 'SP' ? +(5.2 + .09 * q).toFixed(1) : role === 'CL' ? 1 : 1.1, r.ps, 1);
  }
  const T = (id, pool, name, en, c1, c2, cap, mgr, bat, bench, sp, rp) => ({ id: 'W_' + id, code: id, pool, name, en, c1, c2, cap, mgr, bat: bat.map(b => mkB(...b._s, ADJ[id])), bench: bench.map(b => mkB(...b._s, ADJ[id])), sp, rp });
  /* ===== 國家隊強度調整（v1.1.47）：依「WBSC 世界排名（2025-12-31）為底、WBC 2026 實際成績微調」重排各隊整體水準與風格 =====
     o＝全隊打者 q 加減、p＝全隊投手 q 加減、f＝全隊守備／肩力加減（只動數值，不動名單）。
     風格：日本＝投手＋守備為王；美國／委內瑞拉＝攻守俱強；多明尼加＝重砲強攻；中華台北＝投強打普；荷蘭／以色列／波多黎各／巴拿馬＝守備見長；
     墨西哥／加拿大／英國＝靠打線；捷克／巴西＝實力偏弱。（參考：WBC 2026 冠軍委內瑞拉、亞軍美國、季軍多明尼加、第四義大利。） */
  const ADJ = { JPN: { o: 0.5, p: -1, f: 5 }, USA: { o: 0, p: -0.5, f: 2 }, VEN: { o: 0.5, p: 2, f: 1 }, DOM: { o: 0.5, p: -1, f: -1 }, TWN: { o: -0.5, p: -0.5, f: 2.5 }, KOR: { o: 0, p: 0, f: 2 }, ITA: { o: 0.5, p: 1, f: 1 }, MEX: { o: 0.5, p: 0.5, f: -1 }, PUR: { o: 0.5, p: -0.5, f: 4 }, CAN: { o: 0.5, p: 0.5, f: -2 }, CUB: { o: 0.5, p: -1, f: 0 }, PAN: { o: 0, p: 0, f: 3 }, NED: { o: -0.5, p: 0, f: 5 }, AUS: { o: 0, p: 1, f: 1 }, COL: { o: 0, p: -0.5, f: -1 }, GBR: { o: 0, p: 0, f: -2.5 }, NIC: { o: 0, p: -0.5, f: -1 }, ISR: { o: -0.5, p: -1, f: 4 }, CZE: { o: 0, p: 2, f: -2 }, BRA: { o: 0, p: -1, f: -2.5 } };
  /* 個別球員微調（q 加減）：WBC 2026 大賽 MVP 等已知事實；其餘球員靠球隊整體調整 */
  const PLAYER_Q = { 'M. García': 1.5 };
  const RAW = [
    /* ---------------- A 組（聖胡安）---------------- */
    T('PUR', 'A', '波多黎各', 'Puerto Rico', '#c8102e', '#ffffff', '#1a3a8f', 'Yadier Molina',
      [H('C. Vázquez', 'C', 'R', 4, 'G'), H('E. Rivera', '1B', 'R', 5), H('D. Hernáiz', '2B', 'R', 4, 'G'), H('N. Arenado', '3B', 'R', 6, 'G'), H('E. Arroyo', 'SS', 'S', 5, 'S'), H('E. Rosario', 'LF', 'L', 5, 'P'), H('H. Ramos', 'CF', 'R', 7, 'P'), H('M. Lugo', 'RF', 'R', 4), H('W. Castro', 'DH', 'S', 6, 'S')],
      [H('M. Maldonado', 'C', 'R', 3, 'G'), H('MJ Melendez', 'RF', 'L', 5, 'P'), H('C. Cortes', 'LF', 'L', 5, 'P'), H('Bryan Torres', '2B', 'R', 3, 'S'), H('L. Vázquez', 'SS', 'R', 3)],
      [Pt('S. Lugo', 'R', 148, 7, 'CU,CH,SL'), Pt('Elmer Rodríguez', 'R', 152, 5, 'SL,CH,CU'), Pt('J. De León', 'R', 148, 4, 'SL,CH'), Pt('L. Quiñones', 'R', 149, 4, 'SL,CH,CU'), Pt('J. Morán', 'L', 148, 5, 'SL,CH')],
      [Pt('F. Cruz', 'R', 152, 6, 'FK,SL'), Pt('J. Espada', 'R', 156, 5, 'SL,CH'), Pt('R. Garcia', 'R', 148, 4, 'SL,CH'), Pt('J. López', 'R', 152, 5, 'SL,CH,SK'), Pt('R. Burgos', 'L', 147, 3, 'SL,CH'), Pt('Á. Reyes', 'R', 151, 4, 'SL,FK'), Pt('Y. Ríos', 'R', 150, 3, 'SL,CH'), Pt('Eduardo Rivera', 'L', 148, 3, 'SL,CH'), Pt('Gabriel Rodríguez', 'L', 147, 3, 'SL,CH'), Pt('R. Velez', 'R', 148, 3, 'SL,CH'), Pt('E. Díaz', 'R', 160, 9, 'SL,CH')]),
    T('CUB', 'A', '古巴', 'Cuba', '#1e3a8a', '#ffffff', '#c8102e', 'Germán Mesa',
      [H('O. Hernández', 'C', 'L', 4, 'C'), H('M. Núñez', '1B', 'R', 5, 'P'), H('Alexei Ramírez', '2B', 'R', 4, 'G'), H('Y. Moncada', '3B', 'S', 6), H('E. Arruebarrena', 'SS', 'R', 4, 'G'), H('A. Martínez', 'LF', 'L', 5, 'P'), H('Y. Guibert', 'CF', 'R', 5, 'C'), H('L. Moas', 'RF', 'R', 5, 'C'), H('A. Despaigne', 'DH', 'R', 7, 'P')],
      [H('A. Pérez', 'C', 'R', 4), H('Y. Yanqui', 'RF', 'R', 5, 'C'), H('R. Santos', 'LF', 'L', 5, 'S'), H('Y. Cappe', '2B', 'R', 4), H('A. Vargas', 'SS', 'R', 4, 'S'), H('Cristián Rodríguez', '3B', 'R', 3)],
      [Pt('Yariel Rodríguez', 'R', 154, 6, 'SL,FK,CH'), Pt('L. Moinelo', 'L', 154, 7, 'SL,CH,CU'), Pt('F. Álvarez', 'R', 150, 4, 'SL,CH'), Pt('D. Núñez', 'L', 148, 4, 'SL,CH'), Pt('A. Dueñas', 'R', 149, 4, 'SL,CH,CU')],
      [Pt('E. Chapman', 'R', 150, 4, 'SL,CH'), Pt('J. Cousín', 'R', 150, 4, 'SL,CH'), Pt('D. Larrondo', 'R', 151, 4, 'SL,CH'), Pt('Y. López', 'R', 150, 4, 'SL,CH'), Pt('Randy Martínez', 'L', 150, 4, 'SL,CH'), Pt('J. Robaina', 'L', 148, 4, 'SL,CH'), Pt('Osiel Rodríguez', 'R', 154, 4, 'SL,CH'), Pt('M. Romero', 'R', 150, 4, 'SL,CH'), Pt('P. Santos', 'R', 150, 3, 'SL,CH'), Pt('Raidel Martínez', 'R', 157, 7, 'SL,FK')]),
    T('CAN', 'A', '加拿大', 'Canada', '#d80621', '#ffffff', '#a50417', 'Ernie Whitt',
      [H('B. Naylor', 'C', 'L', 5), H('J. Naylor', '1B', 'L', 8), H('E. Julien', '2B', 'L', 6), H('A. Toro', '3B', 'S', 4), H('O. López', 'SS', 'R', 5, 'C'), H('O. Caissie', 'LF', 'L', 6, 'P'), H('D. Clarke', 'CF', 'R', 5, 'S'), H('T. O\'Neill', 'RF', 'R', 7, 'P'), H('L. Hicks', 'DH', 'L', 6, 'C')],
      [H('T. Black', '2B', 'L', 5), H('M. Davidson', '1B', 'R', 5, 'P'), H('J. Young', 'LF', 'L', 4), H('J. Robson', 'CF', 'L', 3, 'S'), H('Adam Hall', 'SS', 'R', 3, 'S')],
      [Pt('J. Taillon', 'R', 150, 6, 'SL,CU,CH'), Pt('M. Soroka', 'R', 149, 6, 'SL,CH,CU'), Pt('J. Paxton', 'L', 152, 6, 'CU,CT,CH'), Pt('C. Quantrill', 'R', 150, 5, 'SL,CH'), Pt('Logan S. Allen', 'L', 148, 4, 'SL,CH,CU')],
      [Pt('M. Ashman', 'L', 148, 3, 'SL,CH'), Pt('P. Aumont', 'R', 155, 3, 'SL,CU'), Pt('J. Balazovic', 'R', 150, 4, 'SL,CH'), Pt('E. Cerantola', 'L', 152, 3, 'SL,CH'), Pt('B. Dykxhoorn', 'R', 150, 4, 'SL,CH'), Pt('A. Jean', 'L', 150, 3, 'SL,CH'), Pt('A. Macko', 'L', 148, 3, 'CU,CH'), Pt('N. Skirrow', 'R', 148, 3, 'SL,CH'), Pt('M. Wilkinson', 'L', 148, 3, 'SL,CH'), Pt('R. Zastryzny', 'L', 148, 4, 'SL,CH'), Pt('I. Diaz', 'R', 157, 5, 'SL,FK')]),
    T('PAN', 'A', '巴拿馬', 'Panama', '#0b4ea2', '#ffffff', '#d21034', 'José Mayorga',
      [H('M. Amaya', 'C', 'R', 5), H('R. Tejada', '1B', 'R', 3), H('J. Caballero', '2B', 'R', 6, 'S'), H('J. Camargo', '3B', 'S', 4), H('E. Sosa', 'SS', 'R', 6, 'G'), H('A. Córdoba', 'LF', 'L', 3), H('E. Bradfield', 'CF', 'L', 4, 'S'), H('L. Castillo', 'RF', 'R', 3), H('L. Jiménez', 'DH', 'R', 4)],
      [H('L. Bernal', 'C', 'S', 3), H('C. Bethancourt', 'C', 'R', 3, 'G'), H('J. Araúz', '2B', 'S', 4), H('J. Ramos', 'RF', 'R', 3), H('J. Santos', 'LF', 'R', 3)],
      [Pt('Logan T. Allen', 'L', 148, 5, 'SL,CH,CU'), Pt('A. Jurado', 'R', 148, 5, 'SL,CH,SK'), Pt('H. Mejía', 'R', 150, 4, 'SL,CH'), Pt('J. Barría', 'R', 147, 4, 'SL,CH'), Pt('P. Espino', 'R', 146, 3, 'SL,CH')],
      [Pt('D. Agrazal', 'R', 146, 3, 'SL,CH'), Pt('M. Cienfuegos', 'L', 148, 3, 'SL,CH'), Pt('Jorge García', 'R', 152, 3, 'SL,CH'), Pt('M. Gómez', 'R', 150, 3, 'SL,CH'), Pt('James González', 'R', 152, 3, 'SL,CH'), Pt('Severino González', 'R', 150, 3, 'SL,CH'), Pt('J. Guerra', 'R', 150, 3, 'SL,CH'), Pt('K. Hernández', 'L', 147, 3, 'SL,CH'), Pt('A. Mendoza', 'R', 150, 3, 'SL,CH'), Pt('Erian Rodríguez', 'R', 152, 3, 'SL,CH'), Pt('A. Baldonado', 'L', 152, 5, 'SL,FK')]),
    T('COL', 'A', '哥倫比亞', 'Colombia', '#f2c200', '#ffffff', '#1b3c8f', 'José Mosquera',
      [H('D. Vellojín', 'C', 'S', 4), H('R. Rodríguez', '1B', 'R', 3, 'P'), H('D. Solano', '2B', 'R', 5, 'C'), H('G. Urshela', '3B', 'R', 5, 'G'), H('M. Arroyo', 'SS', 'R', 5), H('G. Campero', 'LF', 'R', 3), H('T. Polo', 'CF', 'S', 3, 'S'), H('H. Ramírez', 'RF', 'R', 6, 'C'), H('Jordan Díaz', 'DH', 'R', 5, 'P')],
      [H('C. Martínez', 'C', 'R', 3, 'G'), H('C. Arroyo', '2B', 'R', 3), H('B. Buelvas', 'CF', 'R', 3, 'S'), H('D. Frías', 'SS', 'R', 3), H('J. Marriaga', 'LF', 'R', 3)],
      [Pt('J. Quintana', 'L', 146, 6, 'CU,CH,SL'), Pt('J. Teherán', 'R', 146, 5, 'SL,CH,CU'), Pt('A. Bergner', 'R', 150, 4, 'SL,CH'), Pt('E. Alcalá', 'R', 148, 3, 'SL,CH'), Pt('L. Patiño', 'R', 152, 4, 'SL,CH')],
      [Pt('A. Almeida', 'L', 148, 3, 'SL,CH'), Pt('R. Gomez', 'L', 148, 3, 'SL,CH'), Pt('P. García', 'R', 148, 3, 'SL,CH'), Pt('Yapson Gómez', 'L', 148, 3, 'SL,CH'), Pt('D. Lorduy', 'R', 150, 3, 'SL,CH'), Pt('E. Martínez', 'R', 148, 3, 'SL,CH'), Pt('J. Romero', 'R', 152, 4, 'SL,CH'), Pt('E. Zabaleta', 'R', 148, 3, 'SL,CH'), Pt('G. Zuñiga', 'R', 150, 3, 'SL,CH'), Pt('D. Correa', 'R', 158, 6, 'SL,CH')]),
    /* ---------------- B 組（休士頓）---------------- */
    T('USA', 'B', '美國', 'United States', '#1b3f8b', '#ffffff', '#0a2352', 'Mark DeRosa',
      [H('C. Raleigh', 'C', 'S', 9, 'P'), H('B. Harper', '1B', 'L', 9, 'P'), H('B. Turang', '2B', 'L', 7, 'S'), H('G. Henderson', '3B', 'L', 9, 'P'), H('B. Witt Jr.', 'SS', 'R', 10, 'S'), H('R. Anthony', 'LF', 'L', 7), H('P. Crow-Armstrong', 'CF', 'L', 7, 'S'), H('A. Judge', 'RF', 'R', 10, 'X'), H('K. Schwarber', 'DH', 'L', 9, 'P')],
      [H('W. Smith', 'C', 'R', 8), H('A. Bregman', '3B', 'R', 8, 'C'), H('B. Buxton', 'CF', 'R', 7, 'S'), H('E. Clement', '2B', 'R', 5, 'C')],
      [Pt('P. Skenes', 'R', 160, 10, 'SL,CH,SK'), Pt('T. Skubal', 'L', 156, 10, 'CH,SL,CU'), Pt('L. Webb', 'R', 148, 8, 'SK,CH,SL'), Pt('C. Kershaw', 'L', 144, 7, 'SL,CU'), Pt('N. McLean', 'R', 154, 7, 'SK,CU,SL')],
      [Pt('M. Boyd', 'L', 149, 6, 'SL,CH'), Pt('G. Cleavinger', 'L', 154, 6, 'SL,CH'), Pt('J. Hoffman', 'R', 156, 7, 'SL,CU,CH'), Pt('C. Holmes', 'R', 154, 6, 'SK,SL'), Pt('G. Jax', 'R', 153, 6, 'SL,CH'), Pt('B. Keller', 'R', 154, 6, 'SL,CH'), Pt('G. Speier', 'L', 151, 5, 'SL,CH'), Pt('G. Whitlock', 'R', 152, 6, 'CH,SL'), Pt('M. Wacha', 'R', 148, 6, 'CH,CT,CU'), Pt('R. Yarbrough', 'L', 146, 4, 'CT,CH'), Pt('D. Bednar', 'R', 156, 7, 'SL,CU'), Pt('M. Miller', 'R', 165, 9, 'SL,CH')]),
    T('MEX', 'B', '墨西哥', 'Mexico', '#0a7a4b', '#ffffff', '#0a7a4b', 'Benji Gil',
      [H('A. Kirk', 'C', 'R', 7, 'C'), H('J. Aranda', '1B', 'L', 7), H('N. Gonzales', '2B', 'R', 5, 'C'), H('N. Alvarez Jr.', '3B', 'L', 5), H('J. Ortiz', 'SS', 'R', 6, 'G'), H('R. Arozarena', 'LF', 'R', 8, 'P'), H('J. Duran', 'CF', 'L', 8, 'S'), H('A. Osuna', 'RF', 'L', 6, 'P'), H('R. Tellez', 'DH', 'L', 5, 'P')],
      [H('A. Wilson', 'C', 'R', 4, 'G'), H('J. Meneses', '1B', 'R', 5, 'C'), H('A. Thomas', 'CF', 'L', 5, 'S'), H('M. Gil', '2B', 'R', 4), H('J. Ornelas', 'RF', 'R', 4), H('J. Serna', 'SS', 'R', 3)],
      [Pt('T. Walker', 'R', 150, 6, 'FK,SL,CU'), Pt('J. Assad', 'R', 148, 6, 'CT,CH,SL'), Pt('M. Barreda', 'R', 146, 3, 'SL,CH'), Pt('R. Ramírez', 'R', 148, 3, 'SL,CH'), Pt('L. Gastélum', 'R', 150, 3, 'SL,CH')],
      [Pt('A. Armenta', 'L', 150, 3, 'SL,CH'), Pt('B. Bernardino', 'L', 148, 4, 'SL,CH'), Pt('A. Carrillo', 'R', 152, 4, 'SL,CH'), Pt('J. Cruz', 'R', 150, 3, 'SL,CH'), Pt('D. Duarte', 'R', 154, 4, 'SL,CH'), Pt('R. García', 'L', 152, 5, 'SL,CH'), Pt('S. Natera Jr.', 'L', 148, 3, 'SL,CH'), Pt('G. Reyes', 'R', 150, 4, 'SL,CH'), Pt('V. Vodnik', 'R', 157, 5, 'SL,CH'), Pt('A. Muñoz', 'R', 162, 8, 'SL,FK')]),
    T('ITA', 'B', '義大利', 'Italy', '#1a6fc4', '#ffffff', '#0b3a75', 'Francisco Cervelli',
      [H('K. Teel', 'C', 'L', 6), H('V. Pasquantino', '1B', 'L', 7, 'C'), H('T. Saggese', '2B', 'R', 5), H('A. Fischer', '3B', 'R', 5, 'P'), H('B. Rocchio', 'SS', 'S', 5, 'G'), H('D. Canzone', 'LF', 'L', 6, 'C'), H('J. Marsee', 'CF', 'L', 5, 'S'), H('J. Caglianone', 'RF', 'L', 6, 'P'), H('Z. Dezenzo', 'DH', 'R', 5, 'P')],
      [H('M. Gasper', 'C', 'L', 4), H('J.J. D\'Orazio', 'C', 'R', 3), H('A. Annunziata', 'C', 'R', 3), H('J. Berti', '3B', 'R', 5, 'S'), H('M. Mastrobuoni', '2B', 'L', 5), H('S. Antonacci', '2B', 'L', 4), H('N. Morabito', 'RF', 'L', 4), H('D. Nori', 'LF', 'L', 4), H('R. Martini', 'SS', 'R', 3)],
      [Pt('A. Nola', 'R', 150, 8, 'CU,CH,SK'), Pt('M. Lorenzen', 'R', 152, 6, 'SL,CH,SK'), Pt('S. Aldegheri', 'L', 150, 5, 'SL,CH'), Pt('G. Graceffo', 'R', 150, 5, 'SL,CH,CU'), Pt('D. DeLucia', 'R', 150, 4, 'SL,CH')],
      [Pt('D. Altavilla', 'R', 156, 4, 'SL,CH'), Pt('M. Festa', 'R', 150, 4, 'SL,CH'), Pt('A. Jacob', 'R', 144, 5, 'SL,CH'), Pt('J. La Sorsa', 'L', 150, 4, 'SL,CH'), Pt('K. Nicolas', 'R', 156, 4, 'SL,CH'), Pt('A. Ottavino', 'R', 148, 5, 'SW,SK'), Pt('C. Scotti', 'R', 148, 3, 'SL,CH'), Pt('G. Quattrini', 'R', 148, 3, 'SL,CH'), Pt('G. Weissert', 'R', 154, 5, 'SL,CH'), Pt('R. Marinaccio', 'R', 150, 5, 'CH,SL')]),
    T('GBR', 'B', '英國', 'Great Britain', '#9c1c2c', '#ffffff', '#14275c', 'Brad Marcelino',
      [H('H. Ford', 'C', 'L', 6), H('N. Ward', '1B', 'L', 4, 'P'), H('J. Chisholm Jr.', '2B', 'L', 8, 'P'), H('N. Eaton', '3B', 'R', 4, 'S'), H('L. Fox', 'SS', 'S', 3, 'S'), H('M. Koperniak', 'LF', 'L', 4), H('K. Robinson', 'CF', 'R', 5, 'P'), H('T. Thompson', 'RF', 'R', 5, 'P'), H('J. Wylie', 'DH', 'R', 3)],
      [H('W. Cresswell', 'C', 'L', 3), H('I. Johnson', '3B', 'R', 3), H('I. Lewis Jr.', '2B', 'L', 3, 'S'), H('BJ Murray', 'SS', 'R', 3), H('W. Clark', '1B', 'R', 3)],
      [Pt('Tristan Beck', 'R', 148, 5, 'SL,CH,CU'), Pt('D. Covey', 'R', 148, 4, 'SL,CH'), Pt('V. Worley', 'R', 144, 4, 'SL,CH,CU'), Pt('M. Petersen', 'R', 148, 4, 'SL,CH'), Pt('Brendan Beck', 'R', 148, 4, 'SL,CH,CU')],
      [Pt('J. Anderson', 'R', 150, 3, 'SL,CH'), Pt('D. Benoit', 'R', 150, 3, 'SL,CH'), Pt('C. Fernander', 'R', 148, 3, 'SL,CH'), Pt('Gary Hill', 'R', 152, 3, 'SL,CH'), Pt('A. Knowles', 'R', 152, 3, 'SL,CH'), Pt('M. Langhorne', 'R', 150, 3, 'SL,CH'), Pt('R. Long', 'R', 150, 3, 'SL,CH'), Pt('J. Seppings', 'R', 150, 3, 'SL,CH'), Pt('G. Spraker', 'R', 150, 3, 'SL,CH'), Pt('N. Victor', 'R', 150, 3, 'SL,CH'), Pt('T. Viza', 'R', 148, 3, 'SL,CH'), Pt('N. Wells', 'L', 146, 3, 'SL,CH'), Pt('O. Wild', 'R', 150, 3, 'SL,CH'), Pt('A. Scrubb', 'R', 156, 4, 'SL,CH')]),
    T('BRA', 'B', '巴西', 'Brazil', '#f5d400', '#ffffff', '#0a8a3d', 'Daniel Matsumoto',
      [H('G. Gomes', 'C', 'R', 3), H('L. Rojo', '1B', 'R', 3), H('F. Mizukosi', '2B', 'R', 3), H('D. Bichette Jr.', '3B', 'R', 4, 'P'), H('V. Ito', 'SS', 'R', 3, 'G'), H('V. Mascai', 'LF', 'R', 3), H('G. Maciel', 'CF', 'R', 3, 'S'), H('O. Carvalho', 'RF', 'R', 2), H('L. Reginatto', 'DH', 'R', 3)],
      [H('G. do Carmo', 'C', 'R', 3), H('M. Silva', 'C', 'R', 2), H('F. Koragi', 'SS', 'R', 3), H('T. Nishiyama', '2B', 'R', 2), H('L. Ramirez', 'RF', 'L', 3)],
      [Pt('E. Pardinho', 'R', 152, 4, 'SL,CH,CU'), Pt('B. Takahashi', 'R', 150, 5, 'SL,FK,CU'), Pt('T. Vieira', 'R', 158, 4, 'SL,CH'), Pt('J. Contreras', 'R', 148, 3, 'SL,CH'), Pt('M. Gouvea', 'R', 144, 2, 'SL,CH')],
      [Pt('G. Barbosa', 'R', 150, 2, 'SL,CH'), Pt('T. da Silva', 'R', 148, 3, 'SL,CH'), Pt('C. de Araujo', 'R', 148, 2, 'SL,CH'), Pt('H. Kanabushi', 'L', 144, 2, 'SL,CH'), Pt('P. Lemos', 'R', 148, 2, 'SL,CH'), Pt('T. Lopez', 'R', 146, 2, 'SL,CH'), Pt('J. Marostica', 'R', 148, 2, 'SL,CH'), Pt('O. Nakaoshi', 'L', 144, 2, 'SL,CH'), Pt('P. Rienzo', 'R', 146, 2, 'SL,CH'), Pt('E. Sawayama', 'L', 146, 2, 'SL,CH'), Pt('H. Villarroel', 'L', 146, 3, 'SL,CH')]),
    /* ---------------- C 組（東京）---------------- */
    T('JPN', 'C', '日本', 'Japan', '#1f56c4', '#ffffff', '#10286e', 'Hirokazu Ibata',
      [H('坂本誠志郎', 'C', 'R', 5, 'G'), H('村上宗隆', '1B', 'L', 9, 'P'), H('牧秀悟', '2B', 'R', 7, 'P'), H('岡本和真', '3B', 'R', 8, 'P'), H('源田壯亮', 'SS', 'R', 6, 'G'), H('近藤健介', 'LF', 'L', 9, 'C'), H('周東佑京', 'CF', 'R', 6, 'S'), H('鈴木誠也', 'RF', 'R', 9, 'P'), H('大谷翔平', 'DH', 'L', 10, 'X')],
      [H('中村悠平', 'C', 'R', 5, 'G'), H('若月健矢', 'C', 'R', 4, 'G'), H('吉田正尚', 'LF', 'L', 8, 'C'), H('森下翔太', 'RF', 'R', 6, 'P'), H('佐藤輝明', '3B', 'L', 7, 'P'), H('小園海斗', 'SS', 'L', 6, 'C'), H('牧原大成', '2B', 'L', 5, 'C')],
      [Pt('山本由伸', 'R', 158, 10, 'FK,CU,CT'), Pt('菅野智之', 'R', 150, 7, 'SL,FK,CU'), Pt('菊池雄星', 'L', 155, 7, 'SL,CH,CU'), Pt('宮城大彌', 'L', 148, 8, 'CH,CU,SL'), Pt('高橋宏斗', 'R', 158, 8, 'FK,SL,CU')],
      [Pt('伊藤大海', 'R', 153, 7, 'FK,SL,CU'), Pt('金丸夢斗', 'L', 152, 6, 'SL,CH'), Pt('種市篤暉', 'R', 155, 7, 'FK,SL'), Pt('曾谷龍平', 'L', 150, 6, 'SL,CH'), Pt('北山亘基', 'R', 156, 6, 'FK,SL'), Pt('松本裕樹', 'R', 154, 6, 'SL,FK'), Pt('石井大智', 'R', 155, 6, 'SL,FK'), Pt('平良海馬', 'R', 160, 8, 'SL,FK'), Pt('大勢', 'R', 156, 8, 'FK,SL')]),
    T('AUS', 'C', '澳洲', 'Australia', '#0b7a53', '#ffffff', '#ffcd00', 'Dave Nilsson',
      [H('M. Edwards', 'C', 'R', 3), H('R. Wingrove', '1B', 'L', 4, 'P'), H('T. Bazzana', '2B', 'L', 6), H('C. Mead', '3B', 'R', 6), H('J. Dale', 'SS', 'R', 3, 'G'), H('A. Whitefield', 'LF', 'R', 4, 'S'), H('U. Bojarski', 'CF', 'R', 3, 'S'), H('T. Kennelly', 'RF', 'R', 3), H('L. Wade', 'DH', 'R', 3)],
      [H('R. Perkins', 'C', 'R', 3, 'G'), H('Alex Hall', 'C', 'R', 3), H('G. Callil', '2B', 'R', 3), H('R. Glendinning', 'SS', 'R', 3), H('C. Burke', 'LF', 'R', 3), H('M. Durrington', '3B', 'R', 4)],
      [Pt('Lachlan Wells', 'L', 146, 5, 'SL,CH,CU'), Pt('W. Saupold', 'R', 144, 3, 'SL,CH,CU'), Pt('J. Hendrickson', 'L', 146, 3, 'SL,CH'), Pt('T. Van Steensel', 'R', 144, 3, 'SL,CH'), Pt('Alex Wells', 'L', 144, 3, 'SL,CH')],
      [Pt('K. Hall', 'R', 148, 3, 'SL,CH'), Pt('K. Hampton', 'R', 148, 3, 'SL,CH'), Pt('S. Holland', 'R', 150, 3, 'SL,CH'), Pt('J. Kennedy', 'L', 146, 3, 'SL,CH'), Pt('C. MacDonald', 'R', 148, 3, 'SL,CH'), Pt('C. Morgan', 'L', 146, 3, 'SL,CH'), Pt('M. Neunborn', 'R', 150, 3, 'SL,CH'), Pt('J. O\'Loughlin', 'L', 146, 3, 'SL,CH'), Pt('B. Townsend', 'L', 148, 3, 'SL,CH'), Pt('C. Wynne', 'R', 152, 4, 'SL,CH')]),
    T('KOR', 'C', '韓國', 'Korea', '#c8102e', '#ffffff', '#0a1f5c', 'Ryu Ji-hyun',
      [H('朴東元', 'C', 'R', 5, 'G'), H('文保景', '1B', 'R', 6), H('金慧成', '2B', 'L', 6, 'S'), H('盧施煥', '3B', 'R', 6, 'P'), H('金到永', 'SS', 'L', 8, 'S'), H('安賢民', 'LF', 'R', 7, 'P'), H('李政厚', 'CF', 'L', 9, 'C'), H('具滋昱', 'RF', 'L', 6, 'C'), H('S. Whitcomb', 'DH', 'R', 6, 'P')],
      [H('金炯俊', 'C', 'R', 5, 'G'), H('金周元', 'SS', 'R', 6, 'S'), H('申旻宰', '2B', 'R', 5, 'C'), H('文賢彬', 'RF', 'L', 6, 'C'), H('朴海旻', 'LF', 'R', 5), H('J. Jones', 'CF', 'R', 5, 'S')],
      [Pt('柳賢振', 'L', 144, 7, 'CH,CU,CT'), Pt('D. Dunning', 'R', 150, 5, 'SL,CH,CU'), Pt('郭彬', 'R', 152, 6, 'SL,CU,CH'), Pt('孫周永', 'L', 148, 5, 'SL,CH,CU'), Pt('高永表', 'R', 146, 5, 'CH,CU,SL')],
      [Pt('蘇炯準', 'R', 150, 5, 'SL,CH,CU'), Pt('宋承基', 'L', 148, 5, 'SL,CH'), Pt('Yoo Young-chan', 'R', 150, 5, 'SL,CH'), Pt('金英奎', 'L', 148, 5, 'SL,CH'), Pt('盧景銀', 'R', 148, 4, 'SL,CH,CU'), Pt('Jeong Woo-joo', 'R', 155, 5, 'SL,CH'), Pt('Jo Byeong-hyeon', 'R', 152, 5, 'SL,FK'), Pt('金澤延', 'R', 154, 5, 'SL,CH'), Pt('高祐錫', 'R', 150, 6, 'SL,FK'), Pt('朴英賢', 'R', 156, 6, 'SL,FK')]),
    T('CZE', 'C', '捷克', 'Czechia', '#1c4e9d', '#ffffff', '#d7141a', 'Pavel Chadim',
      [H('M. Červenka', 'C', 'R', 2, 'G'), H('M. Chlup', '1B', 'R', 4), H('V. Menšík', '2B', 'R', 3), H('T. Vavra', '3B', 'L', 5), H('M. Červinka', 'SS', 'R', 3, 'G'), H('M. Krejčiřík', 'LF', 'R', 2), H('W. Escala', 'CF', 'R', 2, 'S'), H('M. Prejda', 'RF', 'L', 2), H('M. Mužík', 'DH', 'R', 3)],
      [H('M. Bubeník', 'C', 'R', 2), H('M. Zelenka', 'C', 'R', 2), H('R. Johnson', '1B', 'R', 2), H('J. Pospíšil', '3B', 'R', 2), H('M. Prokop', '2B', 'R', 2), H('M. Sindelka', 'LF', 'R', 2)],
      [Pt('D. Padyšák', 'R', 150, 4, 'SL,CH,CU'), Pt('O. Satoria', 'R', 142, 3, 'SL,CH'), Pt('J. Barto', 'L', 138, 2, 'SL,CH'), Pt('T. Duffek', 'L', 138, 2, 'CH,CU'), Pt('M. Schneider', 'R', 138, 2, 'SL,CH')],
      [Pt('F. Čapka', 'R', 144, 2, 'SL,CH'), Pt('L. Ercoli', 'L', 142, 2, 'SL,CH'), Pt('L. Hlouch', 'R', 146, 2, 'SL,CH'), Pt('F. Kollmann', 'R', 148, 2, 'SL,CH'), Pt('M. Kovala', 'L', 144, 2, 'SL,CH'), Pt('M. Minařík', 'R', 144, 2, 'SL,CH'), Pt('J. Novák', 'L', 138, 2, 'SL,CH'), Pt('T. Ondra', 'L', 140, 2, 'SL,CH'), Pt('O. Vank', 'R', 146, 2, 'SL,CH'), Pt('B. Večerka', 'R', 146, 2, 'SL,CH')]),
    T('TWN', 'C', '中華台北', 'Chinese Taipei', '#1f5fd0', '#ffffff', '#0b2a66', '曾豪駒',
      [H('林家正', 'C', 'R', 6, 'P'), H('吉力吉撈·鞏冠', '1B', 'R', 7, 'P'), H('張政禹', '2B', 'R', 6, 'S'), H('張育成', '3B', 'R', 7, 'P'), H('江坤宇', 'SS', 'R', 6, 'G'), H('林安可', 'LF', 'L', 7, 'P'), H('陳傑憲', 'CF', 'L', 9, 'C'), H('陳晨威', 'RF', 'R', 7, 'S'), H('林子偉', 'DH', 'R', 6, 'C')],
      [H('蔣少宏', 'C', 'R', 4, 'G'), H('吳念庭', '3B', 'R', 6, 'C'), H('鄭宗哲', 'SS', 'L', 5, 'S'), H('宋晟睿', 'RF', 'R', 5, 'C'), H('S. Fairchild', 'CF', 'R', 5)],
      [Pt('古林睿煬', 'R', 158, 8, 'SL,FK,CU'), Pt('徐若熙', 'R', 158, 8, 'SL,FK,CU'), Pt('林昱珉', 'L', 154, 8, 'SL,CH,CU'), Pt('林凱威', 'R', 152, 6, 'SL,FK,CH'), Pt('鄭浩均', 'R', 150, 6, 'SL,CH,CU')],
      [Pt('陳冠宇', 'L', 150, 6, 'SL,CH'), Pt('陳柏毓', 'R', 156, 6, 'SL,CH'), Pt('林維恩', 'L', 150, 5, 'SL,CH'), Pt('胡智爲', 'R', 150, 6, 'SL,FK'), Pt('林詩翔', 'R', 152, 6, 'SL,FK'), Pt('沙子宸', 'R', 150, 5, 'SL,CH'), Pt('曾峻岳', 'R', 152, 6, 'SL,CH'), Pt('張峻瑋', 'R', 152, 5, 'SL,FK'), Pt('莊陳仲敖', 'R', 156, 6, 'SL,CH'), Pt('孫易磊', 'R', 157, 7, 'SL,FK'), Pt('張奕', 'R', 151, 7, 'SL,FK')]),
    /* ---------------- D 組（邁阿密）---------------- */
    T('VEN', 'D', '委內瑞拉', 'Venezuela', '#7a1230', '#ffffff', '#7a1230', 'Omar López',
      [H('William Contreras', 'C', 'R', 8), H('Willson Contreras', '1B', 'R', 7, 'P'), H('L. Arráez', '2B', 'L', 9, 'C'), H('E. Suárez', '3B', 'R', 7, 'P'), H('M. García', 'SS', 'R', 7, 'C'), H('W. Abreu', 'LF', 'L', 7, 'P'), H('J. Chourio', 'CF', 'R', 8, 'S'), H('R. Acuña Jr.', 'RF', 'R', 9, 'X'), H('S. Pérez', 'DH', 'R', 8, 'P')],
      [H('G. Torres', '2B', 'R', 7), H('E. Tovar', 'SS', 'R', 6, 'G'), H('A. Giménez', '2B', 'L', 7, 'G'), H('J. Sanoja', 'CF', 'R', 4, 'S')],
      [Pt('R. Suárez', 'L', 149, 9, 'CH,SK,CU'), Pt('Eduardo Rodríguez', 'L', 148, 7, 'CT,CH,CU'), Pt('K. Montero', 'R', 153, 5, 'SL,CH'), Pt('A. Senzatela', 'R', 150, 5, 'SL,CH,CU'), Pt('J. Buttó', 'R', 150, 5, 'CH,SL')],
      [Pt('J. Álvarez', 'L', 150, 4, 'SL,CH'), Pt('L. Avila', 'R', 152, 4, 'SL,CH'), Pt('E. Bazardo', 'R', 150, 4, 'SL,CH'), Pt('E. De Jesús', 'L', 148, 3, 'SL,CH'), Pt('Jhonathan Díaz', 'L', 148, 4, 'SL,CH'), Pt('Yoendrys Gómez', 'R', 155, 4, 'SL,CH'), Pt('C. Guzmán', 'R', 152, 3, 'SL,CH'), Pt('A. Machado', 'R', 154, 5, 'SL,FK'), Pt('A. Molina', 'R', 154, 3, 'SL,CH'), Pt('R. Sánchez', 'L', 148, 3, 'SL,CH'), Pt('Christian Suárez', 'L', 148, 3, 'SL,CH'), Pt('Á. Zerpa', 'L', 152, 6, 'SL,CH'), Pt('D. Palencia', 'R', 164, 8, 'SL,CH')]),
    T('DOM', 'D', '多明尼加', 'Dominican Republic', '#1a3d8f', '#ffffff', '#c8102e', 'Albert Pujols',
      [H('A. Wells', 'C', 'L', 6, 'P'), H('V. Guerrero Jr.', '1B', 'R', 9, 'P'), H('K. Marte', '2B', 'S', 8), H('M. Machado', '3B', 'R', 8), H('G. Perdomo', 'SS', 'S', 8, 'C'), H('J. Soto', 'LF', 'L', 10, 'C'), H('J. Rodríguez', 'CF', 'R', 9, 'S'), H('F. Tatís Jr.', 'RF', 'R', 9, 'X'), H('J. Caminero', 'DH', 'R', 8, 'P')],
      [H('Agustín Ramírez', 'C', 'R', 6, 'P'), H('O. Cruz', 'CF', 'L', 7, 'P'), H('A. Rosario', 'SS', 'R', 5, 'S'), H('C. Santana', '1B', 'S', 5, 'P'), H('E. González', '3B', 'R', 4, 'G'), H('J. Lake', 'LF', 'R', 4)],
      [Pt('C. Sánchez', 'L', 150, 9, 'CH,SK,SL'), Pt('S. Alcántara', 'R', 157, 8, 'CH,SL,SK'), Pt('L. Severino', 'R', 157, 6, 'SL,CH,SK'), Pt('B. Bello', 'R', 153, 6, 'CH,SL,SK'), Pt('J. Mejía', 'R', 153, 4, 'SL,CH')],
      [Pt('A. Abreu', 'R', 156, 5, 'SL,FK'), Pt('E. Alvarado', 'R', 156, 5, 'SL,CH'), Pt('H. Brazobán', 'R', 154, 4, 'SL,CH'), Pt('S. Domínguez', 'R', 160, 6, 'SL,FK'), Pt('C. Estévez', 'R', 156, 6, 'SL,CH'), Pt('W. Peralta', 'L', 150, 5, 'CH,SL'), Pt('D. Santana', 'R', 154, 5, 'SL,CH'), Pt('G. Soto', 'L', 156, 5, 'SL,CH'), Pt('A. Uribe', 'R', 163, 7, 'SL,CH'), Pt('C. Doval', 'R', 162, 7, 'SL,CT')]),
    T('NED', 'D', '荷蘭', 'Netherlands', '#f36c21', '#ffffff', '#f36c21', 'Andruw Jones',
      [H('C. Tromp', 'C', 'R', 3, 'G'), H('S. Schoop', '1B', 'R', 3), H('O. Albies', '2B', 'S', 7), H('J. Profar', '3B', 'S', 4), H('X. Bogaerts', 'SS', 'R', 7, 'C'), H('D. Jones', 'LF', 'R', 4, 'S'), H('C. Rafaela', 'CF', 'R', 7, 'G'), H('D. Croes', 'RF', 'R', 3), H('D. Gregorius', 'DH', 'L', 5, 'G')],
      [H('H. Clementina', 'C', 'R', 4), H('R. Didder', 'CF', 'R', 3, 'S'), H('J. Josepha', 'RF', 'R', 3), H('D. Selassa', 'LF', 'R', 3)],
      [Pt('S. Martis', 'R', 146, 4, 'SL,CH,CU'), Pt('L. Huijer', 'R', 146, 4, 'SL,CH'), Pt('J.C. Sulbaran', 'R', 146, 4, 'SL,CH'), Pt('J. Estanista', 'R', 150, 4, 'SL,CH'), Pt('D. West', 'R', 148, 3, 'SL,CH')],
      [Pt('J. Cornelia', 'L', 150, 3, 'SL,CH'), Pt('W. Floranus', 'R', 148, 3, 'SL,CH'), Pt('A. Fransen', 'R', 150, 3, 'SL,CH'), Pt('Antwone Kelly', 'R', 150, 3, 'SL,CH'), Pt('Jaitoine Kelly', 'R', 148, 3, 'SL,CH'), Pt('Kevin Kelly', 'R', 148, 3, 'SL,CH'), Pt('E. Mendez', 'R', 146, 3, 'SL,CH'), Pt('R. Merite', 'L', 148, 3, 'SL,CH'), Pt('J. Morales', 'R', 146, 3, 'SL,CH'), Pt('S. Oduber', 'R', 150, 3, 'SL,CH'), Pt('D. Wilson', 'R', 152, 3, 'SL,CH'), Pt('K. Jansen', 'R', 150, 7, 'CT,SL')]),
    T('ISR', 'D', '以色列', 'Israel', '#1b5ab5', '#ffffff', '#1b5ab5', 'Brad Ausmus',
      [H('G. Stubbs', 'C', 'L', 4, 'G'), H('M. Mervis', '1B', 'L', 4, 'P'), H('N. Mendlinger', '2B', 'L', 4), H('J. Gelof', '3B', 'R', 4, 'P'), H('C. Carrigg', 'SS', 'S', 3, 'G'), H('Z. Levenson', 'LF', 'L', 3), H('H. Bader', 'CF', 'R', 7, 'G'), H('RJ Schreck', 'RF', 'L', 3), H('S. Horwitz', 'DH', 'L', 6, 'C')],
      [H('C.J. Stubbs', 'C', 'R', 3), H('C. Halter', 'RF', 'L', 3), H('A. Lowengart', 'LF', 'R', 3), H('B. Rosengard', '2B', 'R', 3)],
      [Pt('D. Kremer', 'R', 148, 6, 'CH,SL,CU'), Pt('R. Prager', 'L', 146, 4, 'SL,CH'), Pt('J. Fishman', 'L', 144, 3, 'SL,CH'), Pt('M. Lazar', 'R', 150, 4, 'SL,CH'), Pt('J. Mallitz', 'R', 150, 3, 'SL,CH')],
      [Pt('C. Beilenson', 'R', 150, 3, 'SL,CH'), Pt('M. Bowman', 'R', 148, 3, 'SL,CH'), Pt('H. Cohen', 'R', 150, 3, 'SL,CH'), Pt('D. Federman', 'R', 150, 3, 'SL,CH'), Pt('J. Geber', 'R', 150, 3, 'SL,CH'), Pt('T. Jacobson', 'R', 150, 3, 'SL,CH'), Pt('R. Kaminsky', 'L', 146, 3, 'SL,CH'), Pt('Z. Leban', 'R', 150, 3, 'SL,CH'), Pt('C. Lequerica', 'R', 150, 3, 'SL,CH'), Pt('B. Simon', 'R', 150, 3, 'SL,CH'), Pt('Z. Weiss', 'R', 150, 3, 'SL,CH'), Pt('T. Kahnle', 'R', 152, 5, 'CH,SL')]),
    T('NIC', 'D', '尼加拉瓜', 'Nicaragua', '#1a4ea0', '#ffffff', '#1a4ea0', 'Dusty Baker',
      [H('M. Novoa', 'C', 'R', 3, 'G'), H('J.S. Orozco', '1B', 'R', 3), H('J. Downs', '2B', 'R', 4), H('M. Vientos', '3B', 'R', 7, 'P'), H('F. Zamora', 'SS', 'R', 4, 'G'), H('C. Dawson', 'LF', 'L', 3), H('I. Munguia', 'CF', 'L', 4, 'S'), H('C. Sandoval', 'RF', 'R', 3), H('C. Cuthbert', 'DH', 'R', 5)],
      [H('R. Rivera', 'C', 'R', 3), H('B. Alegria', '2B', 'R', 3), H('B. Leyton', 'SS', 'R', 3), H('O. Mendoza', 'RF', 'R', 3), H('J. Montes', 'LF', 'R', 3), H('E. Rayo', '3B', 'R', 3), H('E. Trujillo', '1B', 'R', 3)],
      [Pt('Carlos Rodríguez', 'R', 154, 6, 'SL,CH,CU'), Pt('E. Ramírez', 'R', 146, 5, 'CT,CH,SL'), Pt('J.C. Ramírez', 'R', 146, 4, 'SL,CH'), Pt('D. Mejía', 'L', 146, 3, 'SL,CH'), Pt('Á. Obando', 'R', 148, 3, 'SL,CH')],
      [Pt('D. Bermudez', 'L', 146, 3, 'SL,CH'), Pt('K. Burton', 'R', 148, 3, 'SL,CH'), Pt('S. Cruz', 'R', 152, 3, 'SL,CH'), Pt('O. Gutierrez', 'R', 148, 3, 'SL,CH'), Pt('D. Hebbert', 'R', 150, 3, 'SL,CH'), Pt('R. Medrano', 'R', 148, 3, 'SL,CH'), Pt('Oscar Rayo', 'L', 148, 3, 'SL,CH'), Pt('C. Teller', 'L', 140, 3, 'SL,CH'), Pt('B. Torres', 'R', 150, 3, 'SL,CH')])
  ];
  const POOLS = { A: ['W_PUR', 'W_CUB', 'W_CAN', 'W_PAN', 'W_COL'], B: ['W_USA', 'W_MEX', 'W_ITA', 'W_GBR', 'W_BRA'], C: ['W_JPN', 'W_AUS', 'W_KOR', 'W_CZE', 'W_TWN'], D: ['W_VEN', 'W_DOM', 'W_NED', 'W_ISR', 'W_NIC'] };
  const PARK = { A: '澄清湖棒球場', B: '亞太主球場', C: '台北大巨蛋', D: '洲際棒球場', K: '台北大巨蛋' };      // 各組比賽用的球場（淘汰賽一律在巨蛋）
  const POOL_VENUE = { A: '聖胡安', B: '休士頓', C: '東京', D: '邁阿密' };
  /* 轉成遊戲用的 CPBL 格式：{bat,bench,sp,rp}；rp 最後一位是終結者（CL） */
  RAW.forEach(t => { const A = ADJ[t.code]; t.cp = { bat: t.bat, bench: t.bench, sp: t.sp.map(r => mkP(r, 'SP', A)), rp: t.rp.map((r, i) => mkP(r, i === t.rp.length - 1 ? 'CL' : 'RP', A)) }; });
  const byId = {}; RAW.forEach(t => { byId[t.id] = t; });
  function check() {      // 資料自我檢查：回傳問題清單（空陣列＝沒問題）
    const bad = [], seenAll = new Map();
    if (RAW.length !== 20) bad.push('隊數不是 20：' + RAW.length);
    for (const g in POOLS) if (POOLS[g].length !== 5 || POOLS[g].some(id => !byId[id] || byId[id].pool !== g)) bad.push('分組有誤：' + g);
    RAW.forEach(t => {
      const pos = t.bat.map(b => b.p).sort().join(','), want = ['1B', '2B', '3B', 'C', 'CF', 'DH', 'LF', 'RF', 'SS'].join(',');
      if (pos !== want) bad.push(t.name + ' 先發守位不齊：' + pos);
      if (t.bat.length !== 9) bad.push(t.name + ' 先發不是 9 人');
      if (t.bench.length < 4) bad.push(t.name + ' 板凳太少');
      if (t.sp.length < 5 || t.rp.length < 8) bad.push(t.name + ' 投手群不足');
      const names = t.bat.concat(t.bench).map(b => b.n).concat(t.sp.map(p => p.n), t.rp.map(p => p.n)), seen = new Set();
      names.forEach(n => { if (seen.has(n)) bad.push(t.name + ' 同隊重名：' + n); seen.add(n); });
      t.bat.concat(t.bench).forEach(b => { if (!(b.a > .15 && b.o >= b.a && b.s >= b.a)) bad.push(t.name + ' 打者數值怪：' + b.n); });
      t.sp.concat(t.rp).forEach(p => p.ps.forEach(id => { if (!PITCHES[id]) bad.push(t.name + ' 球種不存在：' + p.n + ' ' + id); }));
      t.cp.sp.concat(t.cp.rp).forEach(p => p.ps.forEach(id => { if (!PITCHES[id]) bad.push(t.name + ' 球種不存在：' + p.n + ' ' + id); }));
    });
    RAW.forEach(t => t.bat.concat(t.bench).map(b => b.n).concat(t.sp.map(p => p.n), t.rp.map(p => p.n)).forEach(n => { if (!seenAll.has(n)) seenAll.set(n, []); seenAll.get(n).push(t.name); }));
    seenAll.forEach((v, n) => { if (v.length > 1) bad.push('跨隊同名：' + n + '（' + v.join('、') + '）'); });
    return bad;
  }
  return { TEAMS: RAW, POOLS, PARK, POOL_VENUE, byId, check };
})();
