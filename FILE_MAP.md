# 中職野球2027 — 檔案地圖（給 AI／開發者）

純前端、無打包：`baseball.html` 依序載入 `css/*.css` 與 `js/*.js`。
**所有 JS 共用同一個全域作用域**（classic script，不是 ES module）：頂層的 `const/let/function` 彼此可直接呼叫，不用 import/export。

## 規則（重要）
1. **載入順序＝檔名編號**，不可調換（頂層會立即執行的程式依賴前面檔案已定義的東西）。
2. 函式只在「執行時」才呼叫其他檔的函式，所以新增函式放哪個檔都能被呼叫；但**頂層立即執行的語句**只能用「編號較小的檔」裡的東西。
3. `14-bullpen-loop-boot.js` 結尾的 `boot()` 會啟動遊戲 → **新增檔案請插在 13g 與 14 之間**（編號用 13h、13i…），在 baseball.html 加一行 `<script src="js/13h-xxx.js"></script>`，並在檔頭加 `'use strict';`。
4. `mkRng`（653 起的 03 檔與 04 檔各有一份）、`practiceSwing`（11 與 13 檔各有一份）是原檔就有的**同名重複**，後載入者生效，**不要改動或刪除**（保持行為與原版一致）。
5. **新增任何 css/js/images 檔，必做三件事**：①`baseball.html` 加載入標籤；②`sw.js` 的 `LOCAL` 清單加路徑；③`sw.js` 的 `VERSION` 數字 +1（否則已安裝的玩家拿不到新檔，離線時還可能缺檔）。
6. CSS 是「補丁式堆疊」，後面的規則會覆蓋前面的；要覆蓋既有樣式，新規則放在最後（04）或新建 `css/0N-xxx.css` 並接在最後一個 css 之後載入。

## JS（依載入順序）
| 檔案 | 內容 | 修改時機 |
|---|---|---|
| `01-core-data.js` | 工具函式(clamp/rnd/pick…)、球場尺寸、`PITCHES` 球種、`TEAMS` 球隊球員資料、能力值換算(F～S)、心情值 | 改球員／球隊／能力值 |
| `02-stadium-scene.js` | three.js 場景：草皮、內野、全壘打牆看板、觀眾、夜間燈光（`lightPool` 場地光池、燈塔 `halo` 光暈、`BEAM_MAT`、`RIM`、燈頭顏色都是「加法混色」的疊加光，太亮會把畫面洗成死白，目前已調低偏暖；**場景主光 `hemi`／`sun`／`flood1~3` 的強度不在這個檔**，是別的檔在執行時設定，夜間整體亮度要去那裡調） | 改球場外觀 |
| `03-players-ball-camera.js` | Q版球員外觀／打擊投球姿勢／落地修正／球／擊球特效／煙火／止滑粉／鏡頭 | 改球員模型、鏡頭 |
| `04-pitch-swing-physics.js` | **`G` 遊戲狀態**、實體、投球模型、揮棒／擊球判定、球的物理、擊球軌跡 | 改投打手感 |
| `05-play-fielding-runners.js` | 球進場內：守備計畫、傳球、跑者、觸殺、出局 | 改守備／跑壘 |
| `06-play-abs-update.js` | ABS 跑壘／全壘打判決、接殺、每幀 play 更新、手動傳球 | 改判決與場內每幀邏輯 |
| `07-cpu-ai.js` | 電腦：站位、配球、打擊、盜壘、牽制、換人 | 改 AI 難度 |
| `08-audio.js` | `$` 取元素工具、WebAudio 音效、背景音樂、擊球／觀眾音效；檔尾 `AUTOSIM_FF_GUARD` 區塊：快轉（`window.__ff`）時所有發聲函式直接略過 | 改音樂音效 |
| `09-hud-commentary.js` | HUD 輔助、實況文字、主播＋球評 | 改畫面資訊／播報 |
| `10-events.js` | ABS 鷹眼挑戰、觸身球衝突、驅逐、傷退換人、沒收比賽 | 改特殊事件 |
| `11-game-flow.js` | 開賽介紹、半局／投球循環／打席結果、球棒事件、引擎 hooks、`endGame()` | 改比賽流程、結算（**生涯模式主要接點**） |
| `12-systems.js` | 天氣風力、暴雨、台灣天氣、心情事件、教練上場、傷病、擊球資訊面板 | 改天氣／狀態系統 |
| `13-ui-input-menu.js` | overlay、輸入、投球準度條、返回主選單、代打代跑、`toGame()`、`CFG` 比賽設定、`launchGame()`、賽前編成、戰術／守備面板、音樂面板 | 改選單／輸入／賽前編成 |
| `13b-save-system.js` | **存檔／讀檔**：3 個欄位（一般／生涯各 3 格）、匯出／匯入 .json、`SAVE.hooks.career` 生涯接點；包住 `startHalf`（每半局開始記檢查點）與 `uiHold`（視窗開著時暫停） | 改存檔內容、欄位數、存檔視窗 |
| `13c-career-create.js` | **生涯模式 第一階段**：`CAREER` 物件。角色欄位（3 格）、建立／編輯角色與外觀、頭像／球員卡、角色匯出匯入；欄位上的「▶ 開始生涯」呼叫 `CSEASON.begin()`；`CAREER.session` ＝目前生涯比賽的角色 | 改角色欄位、角色編輯器、球員卡 |
| `13d-career-season.js` | **生涯模式 第二階段**：`CSEASON` 物件。虛構社會組球隊產生器、把角色放進球隊、依位置操控、每場成績紀錄、選秀評分與抽籤、落選後「上班族一年」循環、`SAVE.hooks.career` 賽季資料 | 改生涯流程、對手強度、選秀規則、場數／局數 |
| `13e-career-pro.js` | **生涯模式 第三階段**：`CPRO` 物件。選上中職後的職業賽季：仿中職 120 場賽程產生器（系列戰、輪轉法）、其他隊比賽模擬與戰績表、板凳候補起步＋信賴度／升先發、比賽中叫上場（`benchCall`／`bullpenCall`）、賽程／戰績畫面 | 改職業賽季、賽程規則、出場機制 |
| `13f-career-autosim.js` | **生涯模式：自動模擬**。`AUTOSIM` 物件：偏好為開時，「不是輪到你」就用 `window.__ts` 快轉並顯示計分板／壘包／出局數特殊畫面（`#asPanel`），輪到你（`humanBats/humanPitches/PL.ask`）自動恢復，隨時可用「👁 恢復觀看」／右上角「⏩ 自動模擬」切換；快轉時 `window.__ff=true`，14 的 `frame()` 不繪製、不調畫質 | 改自動模擬、快轉速度、特殊畫面 |
| `13g-manual-fielding.js` | **手動守備**：`FM` 物件。玩家守備時，球打出後自動選取離球最近的守備員，方向鍵／手機方向盤走位撿球（相對畫面方向）、其他守備員頭上有半透明按鈕可換人、撿到球後可繼續走動再用傳球面板選壘；「輔助防守」開＝維持原本電腦自動追球。生涯模式只能操控自己的角色 | 改手動守備手感、換人按鈕、輔助防守 |
| `13h-career-story.js` | **生涯劇情事件引擎**：`CSTORY`（資料驅動：條件／選項／效果／旗標／防重複／存讀檔）＋40 個事件（賽季／季後賽／例行賽中段／多年度／第 3～15 年主線／退役選擇，phase：pro_start／after_game／season_end／po_series／po_end／offseason）。**只靠 ctx／adapter，不碰其他檔的全域**；由 `13e` 的 `storyGate()` 在 `showIntro()`／`showEnd()`（選單畫面，不在比賽／快轉中）呼叫，事件狀態存 `SS.pro.story`（跟 13d `saveSeason()` 整包存）。可在 Node 單獨測：`node tests/test-career-story.js` | 改劇情事件、觸發條件、選項效果 |
| `13i-career-economy.js` | **生涯經濟（A1）**：`CECON` 純邏輯。薪水／存款／體能／心情／運動設備（0～5 級）／商店（吃飯、約會、設備升級，有次數與等級上限）／休賽季結算（領年薪、扣生活費）／`trainMult()` 訓練效果倍率（0.85～1.45，只乘在信賴度的「正向」成長上）。狀態存 `SS.pro.money／fit／mood／gear／shop／econ`；舊存檔缺欄位由 `ensure()` 補預設。**13e 沒載入 13i 時整段略過**。Node 測試：`node tests/test-career-economy.js` | 改薪水公式、商店項目與價格、訓練倍率 |
| `14-bullpen-loop-boot.js` | 牛棚熱身、主迴圈 `frame/step`（快轉時不繪製、且 `step` 迴圈內一輪到玩家就中斷）、`boot()`、全螢幕、**主畫面（一般／生涯／離開，`#tmCareer`）**、標題特效 | 改主畫面入口、主迴圈 |

## 生涯劇情事件（13h＋13e 的 storyGate）
- **載入**：已列入 `baseball.html`（13g 後、14 前）與 `sw.js`（`VERSION` v15）。13e 若沒載入 13h（`typeof CSTORY==='undefined'`）整段略過，不影響賽季。
- **觸發點（皆在 13e）**：`showIntro()` 開頭 → `pro_start`（賽季第一場前）、`after_game`（每場結束後，含「直接出結果」與正常打完回到選單）；`showEnd()` 開頭 → `after_game`（最後一場）、`season_end`。**只在選單畫面檢查，所以不會被自動模擬／快轉衝掉**。
- **檢查點存在 `SS.pro`**：`storyStart`（開季事件已檢查）、`storyChk`（上次檢查時的已打場數）、`storyEnd`；`SS.pro.story`＝`CSTORY` 狀態（flags／seen／rel／log）。事件看完前就離開（返回主畫面），下次進賽前畫面會再出現同一事件。
- **ctx（13e 的 `storyCtx()`）**：`year`＝`P.year||1`（多年度；`po`／`team.champion` 只在季後賽期間提供）、`gameNo`＝`P.log.length`、`starter`、`apps`、`trust`、`lastGame.played`、`team:{}`。**刻意不提供 `team.playoffQualified`**：季後賽賽制未實作前，季後賽／球季檢討事件不會出現。
- **adapter**：只有 `trust`（0～100）。引擎遇到遊戲沒有的數值（疲勞、士氣…）會略過，不新增欄位；關係值（coach／veteran／team）與旗標存在 `story` 狀態裡，目前只存不影響比賽。
- **新增事件**：在 13h 用 `register({ id, phase, title, text[], conditions[{field,operator,value}], once_per_career／once_per_season／cooldown_games, priority, choices[{id,label,hint,effects[],result[]}] })`；文字可用 `{team}`、`{name}`。同一時間點一次只彈一個、最多連續 3 個。
- **`team.playoffQualified` 已提供**：13e 的 `storyCtx()` 在例行賽全部打完時才給（`playoffField().qualified` 含我方球隊＝true），所以 `PRO_PLAYOFF_PUSH`（晉級）與 `PRO_SEASON_REVIEW`（未晉級）依 114 年賽制自動啟用；沒打完時不提供 → 不誤播。`year` 仍固定 1（多年度時再改）。
- 驗證：`tests/test-career-story.js` 27 項（引擎邏輯）；另有假環境載入真正 13e 的整合測試（開季事件→選擇→存檔→120 場快速模擬）通過；**尚未在瀏覽器實機驗證**。

## 114 年（中職 36 年）賽制（13e：`tally`／`decideField`／`playoffField`／`fieldHtml`）
- **半季**：每隊第 1～60 場＝上半季、第 61～120 場＝下半季（`HALF=60`；以每隊場次序號切分，非日期；半季場數是由 120 場推得，**未逐條查證官方規章**）。
- **名單判定（依 2025 年網路報導，非官方規章原文）**：①上下半季冠軍不同隊 → 全年勝率較高者直通台灣大賽（7 戰 4 勝、5 場主場）；較低者＋「兩半季冠軍以外全年勝率最高」者打季後挑戰賽（5 戰 3 勝，半季冠軍先取 1 勝、G1/G3/G4 主場）。②同隊包辦 → 該隊直通；全年第 2 對第 3 打挑戰賽，第 2 名 3 場主場（**報導未提保送 1 勝，程式設 0，待確認**）。
- **同勝率排序**：官方規則未查到，簡化為「得失分差 → 球隊編號」。
- **已做（名單）**：賽季結算畫面（`showEnd`）顯示賽制結果；`SS.pro.field` 存名單；晉級才觸發季後賽劇情事件。
- **已做（季後賽實際比賽，13e 的 `poBegin／showPO／poAdvance／poRecord／poSettle／poFinish`）**：結算畫面晉級球隊有「🏆 前往季後賽」→ 季後挑戰賽 → 台灣大賽。狀態 `SS.pro.po = {active,done,stage,ser,chWinner,champ,out,hist[]}`，你的出賽紀錄在 `SS.pro.poLog`（**不混進**例行賽 `log`／`apps`）；比賽 id 為字串 `po-<stage>-<第幾戰>-<已打場數>`，物件帶 `po:true`。`curGame()`＝季後賽期間回傳季後賽下一場（13e 的 `inject`／`afterEnd` 都改用它）；季後賽期間 `SS.pro.active` 保持 true，所以 13d 仍把 `inject`／`afterEnd` 轉給 13e（**13d 沒改**）。你沒參賽或被淘汰後，其餘場次由 `simGame()` 自動模擬（和局重抽；你打出的和局不計、重打）。`finish()` 拆出 `growth()`（信賴度／先發升降），例行賽與季後賽共用。
- **主客場（依 2025 年報導）**：挑戰賽有保送勝：半季冠軍 G1/G3/G4、外卡 G2（4 場內決勝，先取 3 勝含保送 1 勝）；台灣大賽 7 戰 4 勝：直通隊 G1/G2/G5/G6/G7、挑戰賽勝者 G3/G4。**同隊包辦（無保送勝）的 5 戰主場順序未查到，暫設 第2名 G1/G2/G5**。
- **多年度（第五版）**：賽季（含季後賽）結束後出現「📝 續約，進入第 N 年」→ 先播 `offseason` 續約事件 → `CPRO.nextYear()`：`P.hist` 存本季摘要、`P.year`+1、新 seed、清空 res／log／apps／po／field 與劇情檢查點，保留球隊／信賴度／先發身分／`P.story`。**未做**：球隊異動／選秀重抽、年齡與退役結局、15 年主線事件、獎項、合約系統。
- 測試：`tests/test-career-integration.js`（TEAM／SEED 環境變數可換隊伍與種子；晉級 39 項、未晉級 25 項；6 隊×3 種子共 18 個整季皆通過）。**只用「直接出結果」（quick）跑過季後賽；真的進場比賽（launch→afterEnd）的路徑沒在瀏覽器驗證**。
- 測試：`tests/test-career-integration.js`（假環境載入真 13e＋13h；含 114 年賽制單元測試與整季模擬，6 隊×2 種子皆通過）。

## 測試腳本（`tests/` 資料夾）
- **不屬於遊戲**：`baseball.html` 不載入、`sw.js` 不快取，玩家用不到；只給開發者在電腦上用 Node.js 檢查邏輯。不上傳 GitHub 也不影響遊戲運作（建議一起放進去，方便之後重跑）。
- 檔案：`tests/test-career-story.js`（劇情引擎 13h，27 項）、`tests/test-career-integration.js`（用假環境載入真正的 13e＋13h：開季事件、整季 120 場、114 年賽制、季後賽流程、存讀；晉級 39 項／未晉級 25 項）。
- 路徑：兩個檔案都用「測試檔自己的位置」找 `../js/`，所以**在專案根目錄或 `tests/` 內執行都可以**；若搬到別處要改檔頭的 `../js/` 路徑。
- 執行（專案根目錄）：`node tests/test-career-story.js`、`node tests/test-career-integration.js`；換隊伍／種子：`TEAM=3 SEED=222 node tests/test-career-integration.js`（Windows PowerShell：`$env:TEAM=3; $env:SEED=222; node tests/test-career-integration.js`）。
- 注意：這些是邏輯測試，**不代表瀏覽器實機已驗證**。`test-manual-fielding.js`（手動守備）不是本次整理的檔案，位置請以專案實際為準。

## CSS（依載入順序，後者覆蓋前者）
| 檔案 | 內容 |
|---|---|
| `01-base-title-menu-hud.css` | 基礎：標題、選單、HUD、結算 |
| `02-mobile-layout.css` | 手機／平板版面(`body.mob`)、背景音面板、OUT 提示、觸控方向區 |
| `03-menu-lineup-result.css` | v3~v5 選單、賽前編成、結算、主畫面按鈕、開場動畫、離開、投球準度條、ABS 面板 |
| `04-game-buttons-patches.css` | 比賽按鈕主題、ABS 置中、全壘打特效、牛棚、觸控版、能力等級色、「更多」選單、修正補丁 |
| `05-save-system.css` | 存檔／讀取視窗（`#saveDlg`）、主選單「讀取存檔」鈕 |
| `06-transition.css` | **黑幕轉場 `#curtain`**（全螢幕上下百葉窗＋金線＋文字）。`#curtain` 位於 `<body>` 最外層（不在 `#hud` 內），由 `11-game-flow.js` 的 `foulCurtain()` 加／移除 `.on` |

## 生涯模式（13c＋13d＋13e＋13f，已做到：社會甲組三場 → 選秀 → 落選則上班族一年／選上則進入職業賽季；季後賽已實作（114 年賽制，見該段）；續約與下一年度尚未做）
**流程**：主畫面「生涯模式」→ `CAREER.open()`（13c 角色欄位）→「▶ 開始生涯」→ `CSEASON.begin(profile, slot)`（13d）→ 賽前介紹 → `launch()` → `newGame()` → 比賽 → `endGame()` → `CSEASON.afterEnd()` 記錄成績 → 下一場／選秀。
- 階段：`SS.year===0` ＝甲組三場（`N_GAMES`）；`SS.year>0` ＝上班族第 N 年（`N_YEAR`＝12 場，每月一場）。每階段結束都會 `doDraft()`；落選就 `startWorkerYear()`，選上則停在「之後劇情待補」。
- 比賽設定（`13d` 的 `launch()`）：`INNINGS`＝9 局、普通難度、ABS 關、特殊事件（evt）關、天氣開。
- 臨時球隊：固定放 `TEAMS[8]`（你的球隊，id `MYS`）、`TEAMS[9]`（對手，id `OPS`），標記 `hidden:true`（`13` 的 `buildCards()` 會略過）；名單在 `CPBL.MYS／CPBL.OPS`，每場由 seed 重新產生（隊名與球員皆虛構）。
- 依位置操控：`G.role = { pos }`＋球員物件的 `isMe` 旗標。`04` 的 `humanBats()/humanPitches()` 與 `06` 的 `humanDef(f)` 會問 `CSEASON.mine()`；`07` 的電腦換投／代打對生涯隊伍也生效（`&& !G.role`），但會排除 `isMe`（電腦不會把你的角色換下場，也不會自己挑你上場；只有 `CPRO.benchCall/bullpenCall` 的安排才會叫你上場）。**之後新增「只有玩家才該能操作」的判斷，請用這幾個函式，不要直接比 `G.human`。**
- **職業賽季（13e）**：選上後 `SS.pro = {team, seed, res[], apps, trust, starter, log[], plan, ...}`。賽程由 `CPRO.genSchedule(seed)` 產生（不存場次，只存 seed 與 `res`＝各場比分）：6 隊輪轉法 5 輪×8 循環＝40 系列（每系列同對手連 3 場，同組對戰每循環主客對調），週五～日每週一次、週二～四隔週一次，週一休兵、7/9 明星賽週停賽；每隊 120 場、對每個對手 24 場（主客各 12），約 3/26～9/30，每月約 17～20 場。其他球隊的比賽由 `simOthers()` 用 `CPBL` 的打擊 OPS／先發防禦率換算實力模擬，我方每打完（或快速模擬）一場就把到當天為止的其他比賽模擬完。
- **板凳候補起步**：打者放 `t.bench`、投手插入牛棚；每場先決定 `plan`（今天有沒有機會用你：機率＝0.2＋信賴度/160，上限 0.8；類型 代打 PH／代跑 PR／登板 RP）。`07` 的 `aiPinch()`／`aiManagePitcher()` 開頭呼叫 `CPRO.benchCall()`／`bullpenCall()`，到達預定局數就用 `subInto()`／`changePitcher()` 叫你上場；`G.roleCall` 存這個安排（已列入 13b 的 `G_KEYS`）。信賴度 ≥70 且出場 ≥10 次升先發（打者進打線；投手每 5 場輪值一次），先發後信賴度 <30 會被調回板凳。
- 職業賽季的比賽設定與社會組相同（9 局、普通難度、ABS 關、特殊事件關），`launch` 在 `CPRO.launch()`；可「快速模擬本場」（含你的登場成績）。
- **自動模擬（13f）**：賽前畫面（13d `showIntro`、13e `showIntro`）選「⏩ 自動模擬」→ `AUTOSIM.arm(true)`，選「👁 全程觀看」→ `arm(false)`。比賽中由 13f 的 rAF 迴圈每幀判斷：`pref && !needMe()` 就快轉。`14` 的 `frame()` 兩處改為 `if (!window.__ff)`（快轉時不繪製 3D、不調畫質）。快轉時的靜音分兩層：①用 `08-audio.js` 自己的靜音旗標，暫時把 `SND.mute`／`BGM.mute` 設 true 並呼叫 `sfxApplyVol()`／`bgmApplyVol()`，結束後還原玩家原本的設定（不寫 localStorage，所以中途關頁面不會把靜音存下來）；②`08` 檔尾的 `AUTOSIM_FF_GUARD` 在 `window.__ff` 為真時讓 `noiseBurst／tone／sweepNoise／ring／shapedNoise／flowSfx／crowdRoar／hornSeq／cheerDrums／hitFanfare／hrFanfare／hitSfx／bounceSfx／applause／crowdGasp／crowdGroan` 直接 return，快轉時不再建立音效節點（高倍速不被音效拖慢）。**之後在 08 新增發聲函式，請把名字加進這份清單。** 背景音樂在 `BGM.mute` 為真時 `bgmTick` 本來就不排程新音符。新增「只有玩家才能操作」的流程時，請確認 `needMe()` 能偵測到（目前看 `humanBats()`、`humanPitches()`、`PL.ask`）。**精準停點**：`14` 的 `frame()` 在 `step()` 迴圈裡，快轉中每走一步就問 `AUTOSIM.needMe()`，為真就立刻 `break`（下一個 rAF 由 13f 的 `tick` 呼叫 `stop()` 恢復畫面與音量）；否則高倍速／卡頓時單一畫面可能推進超過 1 秒，衝過玩家打席的第一球。13f 的 rAF `tick` 註冊早於 14 的 `frame`，所以每幀先 `stop()` 再繪製。
- 選秀分級（`doDraft()`，分數 0～100）：≥70 非常好（80% 喜愛球隊選走，第 1～2 輪）／55～69 還不錯（第 2～3 輪，隨機隊）／40～54 普通（第 4～5 輪，非喜愛隊，20% 落選）／<40 落選。12 場的階段會換算成「三場」標準後評分。
- 生涯進度：`localStorage` 鍵 `cpbl2027.career.season.<角色id>`（賽季＋歷史），角色本身在 `cpbl2027.career.profile.<1~3>`；比賽中存檔由 `SAVE.hooks.career`（13d 覆寫 13c 的版本，多帶 `season`，並提供 `prepare()` 於 13b 驗證前重建臨時球隊）。
- 與引擎的接點：`11` 的 `newGame()`（呼叫 `CSEASON.inject`）與 `endGame()` 末尾（呼叫 `CSEASON.afterEnd`）；13d 也會包裝全域的 `newGame`、`backToTitle`、`makeChibi`（`03` 的 `makeChibi(o)` 是 function 宣告、吃 `o.pl／o.vis`，所以可以包裝，讓 `isMe` 的球員用建立角色時的外觀）。
- 介面：`#csDlg` 與其樣式由 13d 動態插入（不在 css 檔裡）；舊的 `#careerDlg`（「開發中」）已不再使用。

## 手動守備（13g）
- **手機方向盤（已修）**：原本 13g 讀 `PAD.v`，但全部已上傳的檔案中**沒有任何程式設定 `PAD.v`**（`13` 的觸控拖曳只移動畫面上的方向盤圖示並移動瞄準準心），所以手機拖左邊方向鍵一直無效。現在 `13` 的觸控拖曳在 `FM.padNeeded()` 為真時設定 `PAD.f`（拖曳量 ÷40，上＝`vy` 負），13g 的 `inputDir()` 讀 `PAD.f`（`PAD.v` 仍保留相容，目前無人設定）。`14` 的 `frame()` 讀 `PAD.v` 移動準心，所以**不要把方向盤資料放進 `PAD.v`**，會同時拖動準心。
- **快轉中停用（已修）**：`baseOK()` 加 `!window.__ff`。自動模擬快轉時由電腦追球，不再讓被標記 `manual` 的野手站著不動；快轉遇到傳球詢問（`PL.ask`）會自動停下來。
- 生涯模式刻意只能操控「你的角色」（`allowed()`）；球離你超過 16 公尺時**不會**幫你選別的野手，這是設計不是故障。
- 啟用條件：`baseOK()`＝玩家守備、非簡易、`G.assist` 為假、非界外球／全壘打。輔助防守設定：賽前「更多設定」的 pill（`CFG.assist`）、比賽中「☰ 更多」旁邊（`#acts` 列，和止滑粉同一排）的「輔助守備」按鈕（`baseball.html` 的 `#btnAssist`，由 13g 綁定點擊、文字、亮燈（開＝橘色 `.on`），並只在玩家守備且非簡易模式時顯示；原本左上角的小按鈕 `#fmAssist` 已隱藏，13g 的 `SHOW_CHIP` 改 true 可還原）；偏好存 `localStorage: cpbl2027.assistDef`；`11` 的 `newGame()` 把 `CFG.assist` 轉成 `G.assist`。
- 做法：13g 包裝全域 `updatePlay()`，每幀先跑 `FM.pre(dt)`：自動選取、依輸入設定被選野手的 `tx/tz`、搶先撿球（滾地球 1 公尺內、接殺 1.5 公尺內且球高 <2.3 公尺）、差一點點的「手套範圍」拉近（接殺 2.9 公尺／滾地 2.2 公尺）。被操控的野手有 `f.manual=true`：`06` 的 `steerChaser()` 會略過他，`05` 的 `rechaseBall()` 先問 `FM.rechase()`（沒接到就繼續由玩家追）。
- 換人＝把 `PL.plan.f` 與補位表 `PL.cover` 對調；換人後 `locked` 到這一球結束，不再自動選取。
- 球的軌跡、落點與接球／漏接判定仍是引擎預先算好的（`planFielding`），手動只是改成「看你人有沒有在那裡」。
- 外野手手感（比原本快）：`04` 的 `FIELDK_OF` 1.08、`05` 的 `planFielding` 反應 .29／`assignRoles` 起步等待 .1、`06` 的 `steerChaser` 看球時間縮短、落點估計更準、不再放慢腳步等球。要再調快慢，改這幾個數字。
- **玩家操控野手的速度（`13g` 的 `MANUAL_K`，目前 1.2）**：只乘在 `pre()` 裡「被你操控的那一位」的走動速度（含持球跑動），方向盤／方向鍵輕推時最低速為 70%（原 55%）。**刻意不動 `MOVEK`／`FIELDK_OF`／`fspeed()`**：那些同時被電腦野手與 `planFielding`（安打／接殺判定）使用，改了會讓安打變少。想再快或慢，只改 `MANUAL_K`。

## 引擎接點一覽（為生涯／手動守備而改過的既有檔案，改這些地方時要小心別弄壞）
| 檔案 | 位置 | 做什麼 |
|---|---|---|
| `04` | `humanBats/humanPitches` | 加 `(!G.role \|\| CSEASON.mine(...))`；`FIELDK_OF` 1.08 |
| `05` | `planFielding`／`assignRoles`／`rechaseBall` | 外野手反應更快；`rechaseBall` 開頭問 `FM.rechase()` |
| `06` | `humanDef(f)`、`steerChaser`、`askUpdate`、`clearPlay` | 只有自己的角色才問傳球；`f.manual` 略過 AI 追球並調快外野手判斷；走動時暫停傳球倒數；清 `manual` |
| `07` | `aiPinch`／`aiManagePitcher` | 生涯隊伍由電腦調度（排除 `isMe`）；開頭呼叫 `CPRO.benchCall/bullpenCall` |
| `11` | `newGame`／`endGame` | `CSEASON.inject`、`G.assist`；`endGame` 末尾 `CSEASON.afterEnd` |
| `13` | `buildCards`、`padOn`、點擊過濾、`CFG`、`PAD`、觸控拖曳 | 略過 `hidden` 隊；方向盤在手動守備時開啟；`#fmLayer,#fmAssist` 不觸發揮棒；`CFG.assist`；**觸控拖曳（pointerdown／pointermove／endTouch）在手動守備需要方向盤時設定 `PAD.f={vx,vy}`（-1～1），手指直接放在 `#movePad` 上也能拖** |
| `13b` | `loadObj`、`G_KEYS` | `hooks.career.prepare()`；加入 `roleCall` |
| `13c` | 角色欄位按鈕 | 「▶ 開始生涯」→ `CSEASON.begin()` |
| `14` | `frame()` | `if (!window.__ff)` 兩處（快轉不繪製、不調畫質）；`step()` 迴圈內 `if (window.__ff && AUTOSIM.needMe()) break`（輪到你立刻停） |
| `08` | 檔尾 | `AUTOSIM_FF_GUARD`：快轉時發聲函式不建立節點 |
| `baseball.html`／`sw.js` | script 標籤、`LOCAL`、`VERSION` | 13c～13g；「輔助防守」設定選項、`#acts` 列的 `#btnAssist`（「更多」旁）；v14 |

## 已驗證／尚未驗證
- 已對照原始碼確認：`humanBats/humanPitches/humanDef` 是玩家操控的集中判斷點；`subInto(side, old, sub)` 回傳新球員；`makeChibi` 可包裝；`08` 的 `SND.mute／BGM.mute` 可用來靜音；`12` 的電腦教練換人對玩家隊略過；`availPitchers(side)` 回傳 `{p, i}`。
- 只用假資料做過邏輯測試（球隊產生器、選秀分級、賽程產生器、自動模擬畫面、手動守備選取／走位／換人）；**尚未在瀏覽器實機打過整場**，請玩過後回報手感。
- 自動模擬（本次逐行對照 `13f`、`14`、`08`、`sw.js`、`baseball.html`）：script 載入順序（13e→13f→13g→14）與 `sw.js` 的 `LOCAL` 都正確；`08` 所有聲音只經 `SND.master`／`BGM.bus` 兩條總線，靜音旗標能涵蓋全部；`14` 的 `frame()` 兩處 `__ff` 判斷存在；`13f` 的 `start/stop/muteAll` 成對還原 `__ts`、`__ff`、靜音設定。語法檢查（`node --check`）通過。
- **尚未驗證（需要實機或其他檔案）**：①（已處理）13g 與快轉：快轉中手動守備停用、改由電腦代守，見「手動守備」段落；**手機拖曳方向盤與實機手感仍未實機驗證**。②`11-game-flow.js`、`13d`／`13e` 有沒有用 `setTimeout`／真實時間（不是 `step(dt)` 的遊戲時間）做半局轉場，這類延遲不會被快轉加速。③`13d` 是否真的設定 `G.career`（`AUTOSIM.active()` 的條件）。④`say` 的 log 擷取依賴 `say` 是 function 宣告（若是 `const` 會被 try/catch 吞掉，特殊畫面最近播報只會顯示「比賽進行中…」）。
- 尚未看過的檔案：`02-stadium-scene.js`、`09-hud-commentary.js`（`say`／`toast` 的定義應在這裡）。
- 已知限制：生涯模式目前關閉 ABS 與特殊事件；鏡頭跟著球、不跟著手動操控的野手；手動守備沒有主動飛身撲接；職業賽季季後賽、續約與下一年度尚未做。

## 存檔系統（13b）
- 存的是「半局開始」的乾淨狀態；`G.teams` 以圖形序列化（保留共用參照，略過 `def`／THREE／DOM），再配合 `G_KEYS` 列的 `G` 欄位。**新增會跨半局保留的 `G` 欄位，請加進 `13b` 的 `G_KEYS`。**
- **存檔流程（`act('save')`）**：成功就 `close()` 關閉視窗並用 `toast('已儲存（欄位 N）')` 提示一次，不再留在視窗裡；失敗才顯示錯誤訊息並留在視窗。`open()` 有防重入：視窗已開、或剛 `close()` 不到 600 ms 就忽略（`S.closedAt`），避免殘留點擊再次打開。若還有「需要按確認的已儲存訊息」，來源不在 13b（13b 只用 `confirm` 問覆蓋／刪除／中斷比賽），請搜尋其他檔的 `alert(`／`已儲存`。
- 讀檔＝`newGame()` 重建場景與天氣（同球場、日夜）→ 覆蓋球隊與 `G` → 再跑一次 `startHalf()`。
- localStorage 鍵：`cpbl2027.save.<normal|career>.<1~3>`；匯出檔格式 `{app:'cpbl2027', fmt:1, saves:[…]}`，內含 FNV 校驗碼。
- 生涯模式：註冊 `SAVE.hooks.career = { active, collect, apply }` 後，存檔會一併帶上 `collect()` 的資料，讀檔後呼叫 `apply(extra)`。

## PWA／離線（不是遊戲邏輯，但每次新增檔案都要連動）
| 檔案 | 內容 | 修改時機 |
|---|---|---|
| `sw.js` | Service Worker。`LOCAL` ＝離線快取清單、`VERSION` ＝快取版本（目前 v20）。本站檔案「先用快取、背景更新」，改版後下次開啟才生效 | **新增／改名／刪除任何 css、js、images 檔**；或想讓所有人立刻換新版（`VERSION` +1） |
| `yw_manifest.json` | PWA 安裝資訊（名稱、圖示、全螢幕、橫向、主題色）。`baseball.html` 以 `<link rel="manifest">` 引用 | 改 App 名稱、圖示、顯示方式 |

> `sw.js` 的 `LOCAL` 已列入 `13c`～`13h`；之後新增 13h 等檔案時務必一併補上，並把 `VERSION` +1。

## 任務 → 需要上傳的檔案（給下一個 AI／使用者）
**任何任務都先傳 `FILE_MAP.md`。** 其餘依任務挑選（不確定時多傳 `baseball.html`）。
| 任務 | 請上傳 |
|---|---|
| 轉場／黑幕（半局、就位、換球） | `css/06-transition.css`、`js/11-game-flow.js`、`baseball.html`（若動 DOM） |
| 開場介紹／球場介紹動畫 | `css/02-mobile-layout.css`、`js/11-game-flow.js` |
| 主畫面／標題特效 | `css/03-menu-lineup-result.css`、`js/14-bullpen-loop-boot.js` |
| 賽前選單／編成／戰術面板 | `css/03`、`js/13-ui-input-menu.js` |
| 比賽中按鈕／HUD 版面 | `css/04`、`css/02`（手機）、`js/09-hud-commentary.js` |
| 球員／球隊／能力 | `js/01-core-data.js` |
| 球場外觀、夜間燈光 | `js/02-stadium-scene.js` |
| 球員模型、鏡頭、特效 | `js/03-players-ball-camera.js` |
| 投打手感、物理 | `js/04-pitch-swing-physics.js` |
| 守備／跑壘／判決 | `js/05-…`、`js/06-…` |
| 電腦 AI | `js/07-cpu-ai.js` |
| 音樂音效 | `js/08-audio.js` |
| 實況播報 | `js/09-hud-commentary.js` |
| ABS、驅逐、傷退等事件 | `js/10-events.js` |
| 比賽流程／結算 | `js/11-game-flow.js` |
| 天氣／傷病／心情 | `js/12-systems.js` |
| 存檔／讀檔 | `js/13b-save-system.js`、`css/05-save-system.css` |
| 生涯模式（角色／欄位／球員卡） | `js/13c-career-create.js`、`css/03`（若動樣式） |
| 生涯模式（賽季／選秀／對手／依位置操控） | `js/13d-career-season.js`、`js/04`、`js/06`、`js/11`、`js/13b`（接點） |
| 生涯模式（職業賽季／賽程／板凳出場） | `js/13e-career-pro.js`、`js/13d`、`js/07`（兩個 hook）、`js/10`（`subInto`／`availPitchers`） |
| 自動模擬（快轉／計分板畫面） | `js/13f-career-autosim.js`、`js/14-bullpen-loop-boot.js`（`frame()`）、`js/08-audio.js`（靜音） |
| 手動守備／輔助防守／外野手手感 | `test-manual-fielding.js`（Node 邏輯測試，用假引擎載入 13g）、`js/13g-manual-fielding.js`、`js/05`、`js/06`、`js/04`（數值）、`js/13`（方向盤／設定）、`baseball.html`（設定選項） |
| 生涯劇情事件（職業賽季） | `HANDOVER_CAREER_STORY.md`、`js/13h-career-story.js`、`tests/test-career-story.js`、`js/13e`、`js/13d`、`js/13b`、`js/11` |
| 新增任何檔案 | `baseball.html`、`sw.js`（＋要改的檔） |
| PWA／離線／安裝 | `sw.js`、`yw_manifest.json`、`baseball.html` |
| 不確定原因的樣式問題 | 對應 `css/*.css` 全部（`01` 含最基礎的 `#hud`、`#curtain` 舊規則） |

## 手感數值速查（常被要求調整）
- **甜蜜點擊球強度（`04` 的 `resolveSwing`，`solid` 係數）**：`cz`（球在棒上的位置）算出後定義 `solid`（0～1）＝甜蜜點 × 時機準（`Q` 由 .6 起算、.9 滿）× 球不在棒子上下緣（`|v|`＜.3～.6 漸減）；擦邊（`marginal`）、壞球造成 `Q` 下降、短打時為 0。`solid` 的效果：①初速 ×(1＋solid×.03×…) 並有保底 `25 + solid×(3.5＋1.5×pwk)` m/s（力量普通約 28.5、力量型約 30；在 `ev>30` 壓縮之前；原本 .07／6／5 的版本全壘打太多，已調低）；②初速隨機抖動 −60%、仰角隨機抖動 −35%、上下偏移對仰角的影響 −30%、球種下沉影響 −40%、`luck` −35%；③黃金仰角拉力 ×(1＋solid×.15)（上限 .85；加太多會把球全拉進全壘打仰角）。要調強弱：改保底數字 `25`／`3.5`／`1.5` 與 `.03`；全壘打還是多就先降 `.15`（仰角拉力）；要調「多容易算紮實」：改 `(Q - .6) / .3`。
- 跑動速度：`04-…js` 的 `MOVEK`（跑者＋內野手 .78）、`FIELDK_OF`（外野手 1.08；原 .95，已調快）、`fspeed0()`（個人公式）；跑者速度在 `05-…js` 的 `makeRunnerFromRig`。
- 傳球：`04-…js` 的 `armSpeed()`；彈地／滾地／外野回傳係數在 `05-…js` 的 `throwTo()`。
- 跑壘判決：`06-…js` 的 `CLOSE_T`（close play 視窗）、`safeCheck`／`tagReview`；跑者踩壘時間用 `G.rclk`（由 `updateRunners` 累加，**不要改回 `G.clk`，它沒有人遞增**）。

## 其他
- 搜尋技巧：用 `grep -n "函式名" js/*.js` 找到檔案後，只讀該檔（或用 `sed -n 'a,bp'` 讀區段），不要整包讀。

## 第 3～15 年主線與退役（第七版，13h＋13e）
- **13h**：`PRO_Y3…Y15` 每年一個 `pro_start` 開幕主線（第 8 年依 `econ.mood` 分 `PRO_Y8_COMEBACK`／`PRO_Y8_BODYCARE`）；`PRO_YN_OPENING` 改為第 16 年起；`PRO_RENEW` 只在第 1～14 年。退役事件（`offseason`，第 15 年起）：`PRO_RETIRE_CHAMP`（奪冠才有「最後一舞」）、`PRO_RETIRE`（告別賽／低調／再戰一年）、`PRO_RETIRE_FORCED`（第 20 年起，無「再戰」）。選項把旗標 `RETIRE_CHOICE` 設為 `ceremony／quiet／lastdance／again`。新增事件可用 `Ev(id, phase, title, 條件[], 正文[], [[id,標籤,{t,coach,veteran,team,flag,fv},結果[]]], 額外)` 縮寫。
- **13e**：`seasonSummary()` 多 `st`（本季例行賽累積：ab h hr rbi bb k e outs r hA）；`storyCtx()` 多 `career:{years,titles,playoffs,starterYears}`，並在例行賽／季後賽結束後補 `team.champion`（沒奪冠＝false）；`goNext()` 在劇情後檢查 `RETIRE_CHOICE`，是退役就 `showRetire(kind)`（生涯回顧，設 `P.retired`；之後 `showIntro()` 一律回到回顧畫面）。
- 測試：`test-career-story.js` 44 項、`test-career-integration.js` 83 項（含年 1→年 15 退役；6 隊×3 種子 18 次 0 失敗）、`test-career-economy.js` 12 項。

## 第八版：紀錄／獎項／結局 E／退役故事（13e＋13h）
- **自願退役改為第 10 年起，第 20 年強制**：`PRO_RENEW` 只在第 1～9 年；`PRO_RETIRE_CHAMP`／`PRO_RETIRE`／`PRO_RETIRE_HEALTH`／`PRO_RETIRE_DECLINE`（第 10～19 年，彼此互斥）／`PRO_RETIRE_FORCED`（第 20 年起，無「再戰」）。
- **紀錄（13e）**：每場 `rec.dec`＝勝敗救**簡化推定**（`decide()`；引擎沒有官方決勝投手，規則寫在函式註解與回顧畫面）。`statSum(LG)` 累積 `g w l sv ab h hr rbi bb k e outs r hA`（`r`＝投手自責分，防禦率＝r×27÷outs）。`seasonSummary()` 每年存 `st`（例行賽）、`pst`（季後賽）、`aw`（榮譽），進 `P.hist`；全在 `SS.pro`，所以隨賽季存檔與比賽中存檔（`collect()` 整包 `SS`）一起儲存。
- **榮譽（`awardsFor`）**：球團表彰，只用個人成績門檻判定（聯盟沒有其他球員的個人數據，不是聯盟投票）。不保證每年都有。
- **結局 E**：`careerCtx` 新增 `heavy`（高出賽／高投球量球季數，打者 ab≥400、投手 outs≥450）與 `lowYears`（信賴度<35 且非先發的球季數）。`heavy≥7`→`PRO_RETIRE_HEALTH`（health）；`lowYears≥2`→`PRO_RETIRE_DECLINE`（decline）；兩者都保留「再戰一年」。`RETIRE_CHOICE` 值：ceremony／quiet／lastdance／health／decline／again。
- **退役流程**：`goNext()`→`showRetire(kind)`（逐年成績表、季後賽累積、榮譽、全程文字故事 `buildStory`）→按「✅ 確認，告別球場」→`showCivilian()`（回歸平凡、幸福平淡的日子；可回看回顧）。`P.retired`／`P.civil` 存檔；之後 `showIntro()` 直接回到對應畫面。
- 測試：story 45／economy 12／integration 82（RETIRE_AT=10／14／20×6 隊×3 種子共 54 次 0 失敗）。環境變數 `RETIRE_AT=<年>` 控制測試在第幾年選退役。
