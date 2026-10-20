# 中職野球2027 — 檔案地圖（給 AI／開發者）

純前端、無打包：`baseball.html` 依序載入 `css/*.css` 與 `js/*.js`。
**所有 JS 共用同一個全域作用域**（classic script，不是 ES module）：頂層的 `const/let/function` 彼此可直接呼叫，不用 import/export。

## 規則（重要）
1. **載入順序＝檔名編號**，不可調換（頂層會立即執行的程式依賴前面檔案已定義的東西）。
2. 函式只在「執行時」才呼叫其他檔的函式，所以新增函式放哪個檔都能被呼叫；但**頂層立即執行的語句**只能用「編號較小的檔」裡的東西。
3. `14-bullpen-loop-boot.js` 結尾的 `boot()` 會啟動遊戲 → **新增檔案請插在 13d 與 14 之間**（編號用 13e、13f…），在 baseball.html 加一行 `<script src="js/13e-xxx.js"></script>`，並在檔頭加 `'use strict';`。
4. `mkRng`（653 起的 03 檔與 04 檔各有一份）、`practiceSwing`（11 與 13 檔各有一份）是原檔就有的**同名重複**，後載入者生效，**不要改動或刪除**（保持行為與原版一致）。
5. **新增任何 css/js/images 檔，必做三件事**：①`baseball.html` 加載入標籤；②`sw.js` 的 `LOCAL` 清單加路徑；③`sw.js` 的 `VERSION` 數字 +1（否則已安裝的玩家拿不到新檔，離線時還可能缺檔）。
6. CSS 是「補丁式堆疊」，後面的規則會覆蓋前面的；要覆蓋既有樣式，新規則放在最後（04）或新建 `css/0N-xxx.css` 並接在最後一個 css 之後載入。

## JS（依載入順序）
| 檔案 | 內容 | 修改時機 |
|---|---|---|
| `01-core-data.js` | 工具函式(clamp/rnd/pick…)、球場尺寸、`PITCHES` 球種、`TEAMS` 球隊球員資料、能力值換算(F～S)、心情值 | 改球員／球隊／能力值 |
| `02-stadium-scene.js` | three.js 場景：草皮、內野、全壘打牆看板、觀眾、夜間燈光 | 改球場外觀 |
| `03-players-ball-camera.js` | Q版球員外觀／打擊投球姿勢／落地修正／球／擊球特效／煙火／止滑粉／鏡頭 | 改球員模型、鏡頭 |
| `04-pitch-swing-physics.js` | **`G` 遊戲狀態**、實體、投球模型、揮棒／擊球判定、球的物理、擊球軌跡 | 改投打手感 |
| `05-play-fielding-runners.js` | 球進場內：守備計畫、傳球、跑者、觸殺、出局 | 改守備／跑壘 |
| `06-play-abs-update.js` | ABS 跑壘／全壘打判決、接殺、每幀 play 更新、手動傳球 | 改判決與場內每幀邏輯 |
| `07-cpu-ai.js` | 電腦：站位、配球、打擊、盜壘、牽制、換人 | 改 AI 難度 |
| `08-audio.js` | `$` 取元素工具、WebAudio 音效、背景音樂、擊球／觀眾音效 | 改音樂音效 |
| `09-hud-commentary.js` | HUD 輔助、實況文字、主播＋球評 | 改畫面資訊／播報 |
| `10-events.js` | ABS 鷹眼挑戰、觸身球衝突、驅逐、傷退換人、沒收比賽 | 改特殊事件 |
| `11-game-flow.js` | 開賽介紹、半局／投球循環／打席結果、球棒事件、引擎 hooks、`endGame()` | 改比賽流程、結算（**生涯模式主要接點**） |
| `12-systems.js` | 天氣風力、暴雨、台灣天氣、心情事件、教練上場、傷病、擊球資訊面板 | 改天氣／狀態系統 |
| `13-ui-input-menu.js` | overlay、輸入、投球準度條、返回主選單、代打代跑、`toGame()`、`CFG` 比賽設定、`launchGame()`、賽前編成、戰術／守備面板、音樂面板 | 改選單／輸入／賽前編成 |
| `13b-save-system.js` | **存檔／讀檔**：3 個欄位（一般／生涯各 3 格）、匯出／匯入 .json、`SAVE.hooks.career` 生涯接點；包住 `startHalf`（每半局開始記檢查點）與 `uiHold`（視窗開著時暫停） | 改存檔內容、欄位數、存檔視窗 |
| `13c-career-create.js` | **生涯模式 第一階段**：`CAREER` 物件。角色欄位（3 格）、建立／編輯角色與外觀、頭像／球員卡、角色匯出匯入；欄位上的「▶ 開始生涯」呼叫 `CSEASON.begin()`；`CAREER.session` ＝目前生涯比賽的角色 | 改角色欄位、角色編輯器、球員卡 |
| `13d-career-season.js` | **生涯模式 第二階段**：`CSEASON` 物件。虛構社會組球隊產生器、把角色放進球隊、依位置操控、每場成績紀錄、選秀評分與抽籤、落選後「上班族一年」循環、`SAVE.hooks.career` 賽季資料 | 改生涯流程、對手強度、選秀規則、場數／局數 |
| `14-bullpen-loop-boot.js` | 牛棚熱身、主迴圈 `frame/step`、`boot()`、全螢幕、**主畫面（一般／生涯／離開，`#tmCareer`）**、標題特效 | 改主畫面入口、主迴圈 |

## CSS（依載入順序，後者覆蓋前者）
| 檔案 | 內容 |
|---|---|
| `01-base-title-menu-hud.css` | 基礎：標題、選單、HUD、結算 |
| `02-mobile-layout.css` | 手機／平板版面(`body.mob`)、背景音面板、OUT 提示、觸控方向區 |
| `03-menu-lineup-result.css` | v3~v5 選單、賽前編成、結算、主畫面按鈕、開場動畫、離開、投球準度條、ABS 面板 |
| `04-game-buttons-patches.css` | 比賽按鈕主題、ABS 置中、全壘打特效、牛棚、觸控版、能力等級色、「更多」選單、修正補丁 |
| `05-save-system.css` | 存檔／讀取視窗（`#saveDlg`）、主選單「讀取存檔」鈕 |
| `06-transition.css` | **黑幕轉場 `#curtain`**（全螢幕上下百葉窗＋金線＋文字）。`#curtain` 位於 `<body>` 最外層（不在 `#hud` 內），由 `11-game-flow.js` 的 `foulCurtain()` 加／移除 `.on` |

## 生涯模式（13c＋13d，已做到：社會甲組三場 → 選秀 → 落選則上班族一年；選上之後的劇情尚未做）
**流程**：主畫面「生涯模式」→ `CAREER.open()`（13c 角色欄位）→「▶ 開始生涯」→ `CSEASON.begin(profile, slot)`（13d）→ 賽前介紹 → `launch()` → `newGame()` → 比賽 → `endGame()` → `CSEASON.afterEnd()` 記錄成績 → 下一場／選秀。
- 階段：`SS.year===0` ＝甲組三場（`N_GAMES`）；`SS.year>0` ＝上班族第 N 年（`N_YEAR`＝12 場，每月一場）。每階段結束都會 `doDraft()`；落選就 `startWorkerYear()`，選上則停在「之後劇情待補」。
- 比賽設定（`13d` 的 `launch()`）：`INNINGS`＝9 局、普通難度、ABS 關、特殊事件（evt）關、天氣開。
- 臨時球隊：固定放 `TEAMS[8]`（你的球隊，id `MYS`）、`TEAMS[9]`（對手，id `OPS`），標記 `hidden:true`（`13` 的 `buildCards()` 會略過）；名單在 `CPBL.MYS／CPBL.OPS`，每場由 seed 重新產生（隊名與球員皆虛構）。
- 依位置操控：`G.role = { pos }`＋球員物件的 `isMe` 旗標。`04` 的 `humanBats()/humanPitches()` 與 `06` 的 `humanDef(f)` 會問 `CSEASON.mine()`；`07` 的電腦換投／代打對生涯隊伍也生效（`&& !G.role`）。**之後新增「只有玩家才該能操作」的判斷，請用這幾個函式，不要直接比 `G.human`。**
- 選秀分級（`doDraft()`，分數 0～100）：≥70 非常好（80% 喜愛球隊選走，第 1～2 輪）／55～69 還不錯（第 2～3 輪，隨機隊）／40～54 普通（第 4～5 輪，非喜愛隊，20% 落選）／<40 落選。12 場的階段會換算成「三場」標準後評分。
- 生涯進度：`localStorage` 鍵 `cpbl2027.career.season.<角色id>`（賽季＋歷史），角色本身在 `cpbl2027.career.profile.<1~3>`；比賽中存檔由 `SAVE.hooks.career`（13d 覆寫 13c 的版本，多帶 `season`，並提供 `prepare()` 於 13b 驗證前重建臨時球隊）。
- 與引擎的接點：`11` 的 `newGame()`（呼叫 `CSEASON.inject`）與 `endGame()` 末尾（呼叫 `CSEASON.afterEnd`）；13d 也會包裝全域的 `newGame`、`backToTitle`、`makeChibi`（讓角色用自訂外觀）。
- 介面：`#csDlg` 與其樣式由 13d 動態插入（不在 css 檔裡）；舊的 `#careerDlg`（「開發中」）已不再使用。

## 存檔系統（13b）
- 存的是「半局開始」的乾淨狀態；`G.teams` 以圖形序列化（保留共用參照，略過 `def`／THREE／DOM），再配合 `G_KEYS` 列的 `G` 欄位。**新增會跨半局保留的 `G` 欄位，請加進 `13b` 的 `G_KEYS`。**
- 讀檔＝`newGame()` 重建場景與天氣（同球場、日夜）→ 覆蓋球隊與 `G` → 再跑一次 `startHalf()`。
- localStorage 鍵：`cpbl2027.save.<normal|career>.<1~3>`；匯出檔格式 `{app:'cpbl2027', fmt:1, saves:[…]}`，內含 FNV 校驗碼。
- 生涯模式：註冊 `SAVE.hooks.career = { active, collect, apply }` 後，存檔會一併帶上 `collect()` 的資料，讀檔後呼叫 `apply(extra)`。

## PWA／離線（不是遊戲邏輯，但每次新增檔案都要連動）
| 檔案 | 內容 | 修改時機 |
|---|---|---|
| `sw.js` | Service Worker。`LOCAL` ＝離線快取清單、`VERSION` ＝快取版本（目前 v5）。本站檔案「先用快取、背景更新」，改版後下次開啟才生效 | **新增／改名／刪除任何 css、js、images 檔**；或想讓所有人立刻換新版（`VERSION` +1） |
| `yw_manifest.json` | PWA 安裝資訊（名稱、圖示、全螢幕、橫向、主題色）。`baseball.html` 以 `<link rel="manifest">` 引用 | 改 App 名稱、圖示、顯示方式 |

> `sw.js` 的 `LOCAL` 已列入 `13c`、`13d`；之後新增 13e 等檔案時務必一併補上，並把 `VERSION` +1。

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
| 生涯模式（賽季／選秀／對手／操控） | `js/13d-career-season.js`、`js/04`、`js/06`、`js/11`、`js/13b`（接點） |
| 新增任何檔案 | `baseball.html`、`sw.js`（＋要改的檔） |
| PWA／離線／安裝 | `sw.js`、`yw_manifest.json`、`baseball.html` |
| 不確定原因的樣式問題 | 對應 `css/*.css` 全部（`01` 含最基礎的 `#hud`、`#curtain` 舊規則） |

## 手感數值速查（常被要求調整）
- 跑動速度：`04-…js` 的 `MOVEK`（跑者＋內野手 .78）、`FIELDK_OF`（外野手 .95）、`fspeed0()`（個人公式）；跑者速度在 `05-…js` 的 `makeRunnerFromRig`。
- 傳球：`04-…js` 的 `armSpeed()`；彈地／滾地／外野回傳係數在 `05-…js` 的 `throwTo()`。
- 跑壘判決：`06-…js` 的 `CLOSE_T`（close play 視窗）、`safeCheck`／`tagReview`；跑者踩壘時間用 `G.rclk`（由 `updateRunners` 累加，**不要改回 `G.clk`，它沒有人遞增**）。

## 其他
- 搜尋技巧：用 `grep -n "函式名" js/*.js` 找到檔案後，只讀該檔（或用 `sed -n 'a,bp'` 讀區段），不要整包讀。
