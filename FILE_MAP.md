# 中職野球2027 — 檔案地圖（給 AI／開發者）

純前端、無打包：`baseball.html` 依序載入 `css/*.css` 與 `js/*.js`。
**所有 JS 共用同一個全域作用域**（classic script，不是 ES module）：頂層的 `const/let/function` 彼此可直接呼叫，不用 import/export。

## 規則（重要）
1. **載入順序＝檔名編號**，不可調換（頂層會立即執行的程式依賴前面檔案已定義的東西）。
2. 函式只在「執行時」才呼叫其他檔的函式，所以新增函式放哪個檔都能被呼叫；但**頂層立即執行的語句**只能用「編號較小的檔」裡的東西。
3. `14-bullpen-loop-boot.js` 結尾的 `boot()` 會啟動遊戲 → **新增檔案（例如生涯模式）請插在 13 與 14 之間**，在 baseball.html 加一行 `<script src="js/13b-career-xxx.js"></script>`，並在檔頭加 `'use strict';`。
4. `mkRng`（653 起的 03 檔與 04 檔各有一份）、`practiceSwing`（11 與 13 檔各有一份）是原檔就有的**同名重複**，後載入者生效，**不要改動或刪除**（保持行為與原版一致）。
5. CSS 是「補丁式堆疊」，後面的規則會覆蓋前面的；要覆蓋既有樣式，新規則放在最後（04）或新建 `css/05-xxx.css` 並接在 04 之後載入。

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
| `14-bullpen-loop-boot.js` | 牛棚熱身、主迴圈 `frame/step`、`boot()`、全螢幕、**主畫面（一般／生涯／離開，`#tmCareer`）**、標題特效 | 改主畫面入口、主迴圈 |

## CSS（依載入順序，後者覆蓋前者）
| 檔案 | 內容 |
|---|---|
| `01-base-title-menu-hud.css` | 基礎：標題、選單、HUD、結算 |
| `02-mobile-layout.css` | 手機／平板版面(`body.mob`)、背景音面板、OUT 提示、觸控方向區 |
| `03-menu-lineup-result.css` | v3~v5 選單、賽前編成、結算、主畫面按鈕、開場動畫、離開、投球準度條、ABS 面板 |
| `04-game-buttons-patches.css` | 比賽按鈕主題、ABS 置中、全壘打特效、牛棚、觸控版、能力等級色、「更多」選單、修正補丁 |

## 生涯模式接入點（目前）
- 主畫面按鈕：`14-…boot.js` 的 `$('tmCareer').onclick`（現在只開「開發中」的 `#careerDlg`）。
- 開賽設定：`13-…menu.js` 的 `CFG` → `launchGame()`；比賽結束：`11-game-flow.js` 的 `endGame()`。
- HTML 對話框：`baseball.html` 內的 `#careerDlg`。

## 其他
- 搜尋技巧：用 `grep -n "函式名" js/*.js` 找到檔案後，只讀該檔（或用 `sed -n 'a,bp'` 讀區段），不要整包讀。
- 若有 Service Worker／快取清單（`yw_manifest.json` 等），請把舊的 `script.js`、`style.css` 換成上面的新檔名。
