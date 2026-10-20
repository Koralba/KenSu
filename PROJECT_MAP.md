# 中職野球2027 專案索引（給 AI 看的檔案地圖）

## 給 AI 的規則（請先讀）
1. 這是瀏覽器棒球遊戲，three.js r128，無打包工具。所有 JS 是**經典 script，共用同一個全域作用域**，不是 ES module；載入順序＝檔名數字順序（見 baseball.html），不可更動，`90-boot-title-menu.js` 必須最後載入。
2. 每個 JS 檔開頭有 `'use strict'`。頂層 `const/let` 在各檔之間共用；頂層程式（事件綁定、IIFE）在載入時就執行，只能引用**較小編號檔案**已定義的東西（函式提升不會跨檔）。
3. 後面的檔案會重新指派前面的函式（例如 rigStep、crowdRoar、hitSfx、bounceSfx、hitFanfare、hrFanfare、flowSfx），改這些函式前先用 grep 搜尋全部檔案。
4. CSS 後面編號的檔案會覆蓋前面的同名規則（大量 `!important` 與修補區塊），改樣式前先搜尋該選擇器出現在哪些檔案。
5. **不要要求使用者一次上傳全部檔案。** 先根據使用者描述，對照下表選出最相關的 1～3 個檔案，請使用者只上傳那些；若需要確認其他檔案是否呼叫某函式，請使用者貼出 `grep -n "函式名" js/*.js` 的結果。
6. 修改後只回傳有改動的檔案（完整檔案），並說明改了哪些函式。新功能優先建立新檔（例如 `js/80-career-*.js`、`css/20-career.css`），再到 baseball.html 加一行載入（JS 放在 90 之前，CSS 放最後）。
7. 生涯模式入口：`js/90-boot-title-menu.js` 的 `tmCareer`／`careerDlg`（目前為「開發中」提示）。

## 常見需求 → 該傳哪些檔案
| 需求 | 檔案 |
|---|---|
| 球員／球隊資料、球場資料 | js/02-teams-data.js |
| 能力值計算、等級 F～S、球員生成、心情值 | js/03-ability-engine.js |
| 球場外觀、燈光、夜間 | js/04-scene-stadium.js |
| 球員造型、動作動畫 | js/05-chibi-rigs-anim.js |
| 球、煙火、鏡頭 | js/06-ball-fx-camera.js |
| 投球判定／球種 | js/07-game-state-pitch.js |
| 揮棒、擊球判定 | js/08-swing-contact.js |
| 球飛行物理 | js/09-ball-physics.js |
| 守備、跑壘、傳球、觸殺 | js/10～13 |
| ABS 判決、全壘打判決 | js/12-abs-hr-rulings.js、js/21-abs-injury-subs.js |
| CPU 電腦策略 | js/14、js/15 |
| 音效、背景音樂 | js/16、17、18 |
| 轉播實況文字 | js/20-commentary.js |
| 比賽流程、局數、打席結果 | js/23-game-flow.js |
| 天氣 | js/26-weather.js |
| 賽前編成 | js/31-lineup-editor.js |
| 比賽中戰術 | js/32-ingame-tactics.js |
| 牛棚熱身 | js/34-bullpen-warmup.js ＋ css/09-bullpen.css |
| 主畫面選單、啟動 | js/90-boot-title-menu.js ＋ css/06-title-menu.css |
| 手機版面 | css/02、03、10 ＋ js/33 |
| 畫面 HTML 結構 | baseball.html |

## JS 檔案清單（依載入順序；列出頂層函式／常數供搜尋定位）

### js/01-utils-field.js
01-utils-field.js — 工具函式／球場幾何／球種定義（原 script.js 第 3-75 行）
- 行數：75
- 頂層名稱：TAU, clamp, lerp, sstep, _seed, srand, rnd, R, gauss, pick, ri, weighted, softmaxPick, BASE_LEN, H, BASES, MOUND, ZW, BALL_R, ZCM, WALL_H, FIELD_SCALE, buildWallPts, WALL_PTS, wallRadius, DEFAULT_POS, POS_LIST, POS_JP, POS_FULL, BASE_JP, PITCHES, REL

### js/02-teams-data.js
02-teams-data.js — 球隊／球員資料（中職名單與球場）（原 script.js 第 76-191 行）
- 行數：118
- 頂層名稱：TEAMS, STADIUMS, PARKS, PARK_W, SAT_PARKS, B, P, BN, PN, CPBL, hashStr, seededZone, seededNoise

### js/03-ability-engine.js
03-ability-engine.js — 能力值等級／校準引擎／mkBatter／mkPitcher／buildTeam／打線AI／心情值（原 script.js 第 192-459 行）
- 行數：270
- 頂層名稱：STAT_GAIN, ST, grLetter, lvGr, stuffOf, gr, RATE_CURVE, PIT_CURVE, curveRate, softTop, pctRank, calRate, limitS, REAL_TUNE, PIT_TUNE, _BLG, batSig, batLeague, batProf, ovrOf, _PLG, pitLeague, pitProf, mkBatter, buildAllStarData, SJH, SJH_BAT, SJH_SP, isSJH, EXTRA_PS, PIT_LV, mkPitcher, POS9, setPos, applyLineupEdit, aiAutoEdit, buildTeam, moodOf, fatCap, pitchCost, roleEdge, calcFatigue, moodVol, moodBonus, moodFace, moodWord, moodColor, adjustMood, adjustTilt, genBatter

### js/04-scene-stadium.js
04-scene-stadium.js — three.js 場景：球場、看台、燈塔、夜間（原 script.js 第 460-652 行）
- 行數：195
- 頂層名稱：VP, VW, measureVP, canvasGL, renderer, IS_TOUCH, MOB, calcMob, arrangeTop, scene, camera, V3, hemi, sun, rainbow, canvasTex, grassTex, grass, dark, SK, px, skinTex, skin, moundMesh, rosinBag, baseMeshes, AD_TEXT, drawAds, adTex, ringGeom, wallMat, wall, wallTop, crowdPal, crowdTex, stand, roof, backWall, LIGHT_TOWERS, LAMP_MAT, STEEL, LAMP_GEO, BEAM_MAT, NIGHT, radTex, flood1, flood2, skyDome, stars, moon, lightPool, CL, RIM, placeRim, placeCrowdLights, updateNight, applyPark, backstop

### js/05-chibi-rigs-anim.js
05-chibi-rigs-anim.js — Q版球員造型／骨架／各種動作動畫（原 script.js 第 653-1073 行）
- 行數：423
- 頂層名稱：GEO, shadowTex, shadowGeo, MAT, mkRng, HAIR_COLS, HAIR_GRAY, HAIR_DYED, HAIR_FUN, SKINS, SKINS_F, FOREIGN, FOREIGN_JP, EAR_GEO, wpick, visForBase, VIS_SPECIAL, visFor, addHairEars, BS_DEF, PS_DEF, batStyle, pitStyle, SIG_KINDS, SIG_DUR, pitSig, NUMTEX, numTex, lumOf, SHO_GEO, addGear, addCatcherGear, addUmpGear, makeChibi, setRigPose, _gp, _SOLE, _DISK, rigLowest, _gl, groundRig, rigPlay, rigStep, ghostRig, smx, BP_KEYS, bsParams, batterPose, faceRig

### js/06-ball-fx-camera.js
06-ball-fx-camera.js — 球、擊球特效、煙火、止滑粉、鏡頭（原 script.js 第 1074-1292 行）
- 行數：221
- 頂層名稱：seamTex, ballMesh, ballShadow, TRAIL_N, trailPos, setBall, burstTex, bursts, spawnBurst, dotTex, POWDER, powderPuff, rosinBurstFx, updatePowder, FW, FW_COLS, fwSprite, fwSpawn, fwExplode, fwLaunch, fwFountain, fireworkShow, HRC, hrCrewSpawn, hrCrewClear, hrCrewCheer, hrBaseFx, hrHomeFx, updateFireworks, updateBursts, CAMC, camSnap, setCamBat, setCamPlayTarget, camChase, updateCamera, AQ, adaptQuality, resize, crowdCheer

### js/07-game-state-pitch.js
07-game-state-pitch.js — 遊戲狀態 G/E／實體／投球模型（原 script.js 第 1293-1506 行）
- 行數：216
- 頂層名稱：G, E, TIMERS, after, stepTimers, battingTeam, curPitcher, curBatter, humanBats, teamStyle, disposeRig, fielderOf, playerAt, rebuildField, MOVEK, fspeed, fspeed0, armSpeed, setupBatter, batterStance, _stanceBackup, ZPAD, pitchLv, ctlSigma, FAST_T, flightT, brkVis, makePitch, _hv, batterHitPart, earlyC, pitchBase, _pb0, visualArrivalT, pitchPos, _pj, projPlane, rayAtZ, pitchPosEx, _sbp, swingBallPos, isStrikeLoc, zoneSDF, zoneCell, batterZoneRating

### js/08-swing-contact.js
08-swing-contact.js — 揮棒／擊球接觸模型（原 script.js 第 1507-1756 行）
- 行數：252
- 頂層名稱：batterR, BAT_TILT, BAT_K, BAT_SHAPE, batMinK, batZoneK, BATV, batTarget, batEase, batGeom, batContact, drawBat, SWING_DELAY, HINT, batBusy, resolveSwing, resolveBunt

### js/09-ball-physics.js
09-ball-physics.js — 球的物理（原 script.js 第 1757-1922 行）
- 行數：168
- 頂層名稱：GRAV, LIFT, STY_NOTE, pickBatStyle, shapeBatted, ballEnv, mkRng, simulateBall, sampleAt, isFairPt, classifyBatted

### js/10-play-start-runners.js
10-play-start-runners.js — 擊出後：守備計畫／跑者／傳球（原 script.js 第 1923-2337 行）
- 行數：417
- 頂層名稱：PL, _tmp, dist2, baseSpot, formationPos, resetFormation, moundY, moveFielder, fieldFace, idleFace, launchBall, launchFair, AIR_SPD, planFielding, rechaseBall, chasePlan, assignRoles, makeRunnerFromRig, makeBatterRunner, setupForced, runnerXZ, _rp, wantSlide, startSlide, updateRunners, reconcileRunners, runnerArrive, runnerBack, recallRunners, baseFree, scoreRunner, putOut, throwDur, ballETA, holderThink

### js/11-tag-plays.js
11-tag-plays.js — 野手持球觸殺跑者（原 script.js 第 2338-2497 行）
- 行數：162
- 頂層名稱：runnerTaggable, runnerFuture, bestTagChase, rundownTarget, rundownToss, aiPrefersTag, startTagChase, endTagChase, updateTagChase, tagCheck, nearestCover, nearestFielderTo, throwTo, onThrowArrive

### js/12-abs-hr-rulings.js
12-abs-hr-rulings.js — ABS 判決／close play／全壘打判決（原 script.js 第 2498-2682 行）
- 行數：187
- 頂層名稱：CLOSE_T, TAGVALS, BASE_NM, RPT, rpAt, rpHide, absJudge, tagCall, safeCheck, tagReview, showRaceReplay, absReviewSetup, absReviewLaunch, startHRReview, finalizeHR, hrCelebrate, hrExtraFx, showFieldReplay, tagAnim

### js/13-play-update-fielding.js
13-play-update-fielding.js — 接殺／逐幀守備更新／玩家傳球（原 script.js 第 2683-3174 行）
- 行數：494
- 頂層名稱：onFielded, tagUpThink, chaosK, bumpTilt, dropBall, airDropP, collideCheck, _gb, ballGuess, steerChaser, updatePlay, _rthink, startPick, runnersThink, pushCands, doPush, retreatCands, doRetreat, updatePushBtn, pushWindowOpen, checkPlayEnd, endPlay, returnBall, humanDef, BASE_NAME, openAsk, selfRunSpeed, baseMan, thrAvail, askMark, closeAsk, askUpdate, execThrow, nearestTeammate, execNear, nearestTagRunner, execRelay, humanThrow, clearPlay

### js/14-cpu-defense-pitch-bat.js
14-cpu-defense-pitch-bat.js — CPU 腦：守備站位／選球種／打擊（原 script.js 第 3175-3432 行）
- 行數：260
- 頂層名稱：LVL, lvl, phi, pStrikeAt, outsideDist, bhist, strengthOf, runDiff, lateGame, computeShift, TAC_INF, TAC_OF, applyHumanTactics, aiExpectBunt, pitcherModelKey, updatePitcherModel, aiPickPitch, guessPitch, aiBatPlan, aiBuntCall, humanDefTac, aiSqueezeCall, aiSneakBunt

### js/15-cpu-steal-pickoff-bench.js
15-cpu-steal-pickoff-bench.js — CPU 腦：盜壘／牽制／板凳調度（原 script.js 第 3433-3689 行）
- 行數：259
- 頂層名稱：aiOffenseCall, readRunners, stealThreat, defenseThreat, stealIdxs, stealBlocked, stealRamp, startSteal, stealWindowOpen, launchEarlySteal, humanSteal, updateStealWatch, stealPickoff, stealIntent, effLead, pickAbility, aiPickoffThink, pickoffSuccess, aiManagePitcher, aiPinch, aiIntentionalWalk

### js/16-sound.js
16-sound.js — 音效（WebAudio）（原 script.js 第 3690-3847 行）
- 行數：160
- 頂層名稱：SND, sfxGainVal, sfxApplyVol, sndInit, noiseBurst, tone, flowSfx, crowdRoar, hornSeq, cheerDrums, CHARGE, hitFanfare, hrFanfare, crowdAmbTick, sweepNoise, bounceSfx, ring, stadiumBus, hitSfx

### js/17-bgm.js
17-bgm.js — 背景音樂（原 script.js 第 3848-4137 行）
- 行數：292
- 頂層名稱：BGM, BGM_LOOP, BGM_CH, BGM_SONG, mtof, bgmStepTime, bgmGainVal, bgmApplyVol, bgmPulseWave, bgmDistCurve, bgmChain, bgmSelect, bgmInit, bgmTick, bgmRhodes, bgmBell, bgmBass, bgmPad, bgmNoise, bgmKick, bgmPlayStep, bgmGuitar, bgmLeadG, bgmSynBass, bgmBrass, bgmPluck, bgmMarimba, bgmPulse, bgmSnare, bgmHat, bgmCrash, bgmTom, bgmClap, bgmBlock, ROCK_R, ROCK_MEL, rockPlay, BR_R, BR_T, BR_MEL, brassPlay, SUM_R, SUM_V, SUM_MEL, sunPlay, CH_R, CH_A, CH_MEL, chipPlay, BGM_TRACKS

### js/18-sfx-modern.js
18-sfx-modern.js — 現代音效改版（擊球聲／觀眾聲）（原 script.js 第 4138-4216 行）
- 行數：81
- 頂層名稱：shapedNoise, apOK, applause, crowdGasp, crowdGroan

### js/19-hud-helpers.js
19-hud-helpers.js — HUD 輔助函式（原 script.js 第 4217-4340 行）
- 行數：126
- 頂層名稱：capTimer, colorTok, setCap, colorSay, say, tipTimer, timingTip, _mixHex, _isWhite, toast, placeSpeed, showSpeed, pitchHint, flashScreen, updateLamps, updateScoreboard, pitchSetText, updatePlayerBoxes, buildPitchPanel, canSteal, updateActs, HIT_NAME, dirWord, areaWord, hitTypeWord, lineSummary, numJp, SAY

### js/20-commentary.js
20-commentary.js — 轉播間：主播／球評實況（原 script.js 第 4341-4510 行）
- 行數：172
- 頂層名稱：CAST, tagA, castA, pickNR, cx, innTxt, diffTxt, runnerTxt, outsTxt, pitchFlavor, SAYX, COLOR

### js/21-abs-injury-subs.js
21-abs-injury-subs.js — 特殊事件：ABS鷹眼／教練抗議／傷退換人／投手管理（原 script.js 第 4511-4755 行）
- 行數：247
- 頂層名稱：FIELD_CAT, fitPenalty, EV, evInit, sideName, updateAbsHud, umpireCall, absEndMark, absFlow, absShowPend, coachBack, absClearPend, runPend, absResolveInput, aiWantsChallenge, runChallenge, showHawk, hideHawk, maybeProtest, startProtestMash, argCoachIn, argCoachOut, updateArgCoach, runProtest, runProtest0, pickSub, subInto, swapFielderRig, FIELD_INJ, maybeInjureFielder, maybeInjurePitcher, processInjuries, injCutscene, availPitchers, chooseReliever, removePitcher, doForfeit

### js/22-hbp-brawl.js
22-hbp-brawl.js — 特殊事件：觸身球／板凳清空（原 script.js 第 4756-5090 行）
- 行數：337
- 頂層名稱：HBP_PART, HBP_WHY, TRASH, clearTrash, trashProtest, TRASH_KINDS, spawnTrash, updateTrash, EJ_CARD, ejectScene, updateEjectCard, ejectWalk, updateEjectWalk, hbpEvent, mkBrawlExtra, BLOOD, addBloodFace, removeBloodFace, addBloodSplat, clearBlood, koScene, medicLeave, clearMedic, medicLoad, medicFinish, medicCarry, updateMedic, pitcherRage, updateRage, startBrawl, beginMash, registerMash, updateBrawl, finishBrawl, updateEvents, _rs2

### js/23-game-flow.js
23-game-flow.js — 比賽流程：開賽介紹／局數／投球循環／打席結果（原 script.js 第 5091-5557 行）
- 行數：469
- 頂層名稱：PT, tweens, ballTween, updateTweens, newGame, startHalf, PARK_LOC, VENUE, venueIntro, venueEnd, cleanupRunners, INTRO, introBusy, introPush, introPlay, introBatter, introPitcher, nextBatter, snapToReady, foulCurtain, fmReady, prePitch, prePitchCore, _buntTs, cancelBunt, toggleBunt, practiceSwing, batterFidget, catcherSign, fielderFidget, behaviorTick, pitchReact, offHold, updatePre, cpuDeliver, doPickoff, doPitch, _hp, pitcherHandPos, releasePitch, updateModelAfterRelease, startSwing, _pp, TFX, PSPIN, PFLASH, pitchFx, sqStep, updateFlight, autoBuntContact, handleSwing, hitFeel2, contactFeel, VIB, vibHit, SQ, hitFeel, BBP, brokenBatFx, batPieceHit

### js/24-bat-events.js
24-bat-events.js — 球棒脫手／摔斷／換棒（原 script.js 第 5558-5828 行）
- 行數：273
- 頂層名稱：FLYBAT, maybeBatSlip, slipBat, endFlyBat, updateFlyBat, breakFlyBat, BOY, startBatBoy, killBoy, updateBatBoy, updateBatPieces, takePitch, catchX, catcherCatch, catcherReturn, pitchResult, startBatteryPlay, awardBase, finishAB, endHalf, changePitcher

### js/25-play-hooks.js
25-play-hooks.js — 比賽引擎 hooks（原 script.js 第 5829-6002 行）
- 行數：176
- 頂層名稱：flowOnContact, flowOnCatch, flowOnField, flowOnThrow, flowOnError, showOut, flowOnOut, hrRunCount, showHrBanner, diaHrFlash, _hrF, hrFocus, hrTrotStart, flowOnRun, flowOnPlayEnd, backToTitle, endGame, buntCharge, pitcherToMound

### js/26-weather.js
26-weather.js — 天氣／風／暴雨／台灣特色天氣（原 script.js 第 6003-6419 行）
- 行數：419
- 頂層名稱：rainK, rainBK, WX_SCEN, wxLevel, initWeather, weatherRetarget, windRetarget, weatherPitch, windK, windDirDiff, windClass, windImpactTxt, updateRainbow, updateWeather, stormK, stormMul, PUD, puddleAt, resetPuddles, initPuddles, buildPuddleMeshes, updatePuddles, RD, rainDelayNeeded, resetRainDelay, startRainDelay, rdPress, endRainDelay, updateRainDelay, windStep, windWord, skyLabel, SKY, SKYN, _c3, mixHex, HEXK, mixSky, cloudFor, cloudK, WX_NEXT, TW_SC, TW_LBL, TW_BIAS, twW, scenBoost, gustMul, ltMin, wxIn, nightK, hazeK, heatK, hotK, twTemp, twTempShift, TW_MSG, twEnter, drawTwFx, shiftScene, _c1 …

### js/27-mood-coaching.js
27-mood-coaching.js — 心情／投手教練／傷病／失誤後續／擊球資訊／CPU換人／投球準備（原 script.js 第 6420-6689 行）
- 行數：272
- 頂層名稱：abMood, moodTick, VISIT_LINES, canVisit, moundVisit, updateCoach, applyVisit, showVisitBox, aiMoundThink, durMul, queueInj, maybeInjureRunner, maybeInjureOnBall, applySlump, slumpTickAll, ERR_SEV, ERR_INJ, errFallout, fancyK, diveMissNote, robDropP, hitWhy, dpNote, greatPlay, _hitT, showHitInfo, setHitResult, hideHitInfo, perfBad, aiCoachBatter, aiCoachFielders, prepAction

### js/28-overlay-input.js
28-overlay-input.js — 2D 覆蓋層／輸入（原 script.js 第 6690-6816 行）
- 行數：129
- 頂層名稱：ov, PAD, aim, _v, w2s, pointerToZone, AIM_MARGIN, updateAim, POW_PREF, powOn, syncPowUI, setPow, cursorR, cursorK, drawRing, drawOverlay, applyBatStance, practiceSwing, _evT, _evTouch, FRAME_AVG, dispLat, touchLat, inputNow, humanAction

### js/29-pitch-meter-buttons.js
29-pitch-meter-buttons.js — 投球準度條／主按鈕／止滑粉（原 script.js 第 6817-7007 行）
- 行數：193
- 頂層名稱：pmCancel, pmStart, pmStop, pmTick, toGame, wrap, tpt, endTouch, padHint, recenterAim, _tsKey, BALL_SVG, BAT_SVG, _actK, setActBtn, syncTouch, keyShift, humanRosin, doRosin, _rb, updateRosinTag, STT, updateStealTags, PKT, updatePickTags, _rv, humanPickoff

### js/30-quit-subs-menu.js
30-quit-subs-menu.js — 返回主選單／代打代跑／設定選單（原 script.js 第 7008-7113 行）
- 行數：108
- 頂層名稱：QUIT_OPEN, openQuitDlg, closeQuitDlg, _hSub, uiHold, quitToMenu, syncHintBtn, openSubP, CFG, syncCfg, buildCards, LV_DESC, setLvDesc, launchGame

### js/31-lineup-editor.js
31-lineup-editor.js — 賽前編成（打線／守位／先發）（原 script.js 第 7114-7213 行）
- 行數：102
- 頂層名稱：ED, ED_TAB, POS_LABEL, _edPoolCache, edPool, edDefault, edEnsure, edChips, spCardHtml, askSJH, renderLineup

### js/32-ingame-tactics.js
32-ingame-tactics.js — 比賽中戰術（敬遠／進攻／守備調整）（原 script.js 第 7214-7342 行）
- 行數：131
- 頂層名稱：humanIBB, setTac, openTacPanel, openOffPanel, toggleStealPanel, openStealPanel, openDefPanel

### js/33-mobile-panels-audio-ui.js
33-mobile-panels-audio-ui.js — 手機面板／更多選單／背景音設定面板（原 script.js 第 7343-7434 行）
- 行數：94
- 頂層名稱：_lt, layoutTop, _piT

### js/34-bullpen-warmup.js
34-bullpen-warmup.js — 牛棚熱身（原 script.js 第 7435-7600 行）
- 行數：168
- 頂層名稱：WARM, BP, BPI, BP_SHOTS, _bv, warmTxt, warmFatEst, warmingList, BP_LX, bpLayout, bpBuildProps, bpLaneOff, bpLaneSet, bpAssign, bpStage, bpClear, bpReset, bpSync, bpShot, bpStart, bpEnd, bpSkip, bpOverlay, bpThrow, bpFrame, warmApply, warmHurt, warmTick, bpHud

### js/35-main-loop.js
35-main-loop.js — 主迴圈（原 script.js 第 7601-7655 行）
- 行數：57
- 頂層名稱：checkInv, HS, step, frame

### js/90-boot-title-menu.js
90-boot-title-menu.js — boot／全螢幕／主畫面選單／離開遊戲／開場特效（須最後載入）（原 script.js 第 7656-7830 行）
- 行數：176
- 頂層名稱：boot, XD, openExitDlg, closeExitDlg, exitGame

## CSS 檔案清單（依載入順序，後者覆蓋前者）

### css/01-base-title-hud.css
01-base-title-hud.css — 基礎／標題／選單／HUD／結算（原 style.css 第 1-196 行）
- 行數：197
- 主要 id：#wrap, #gl, #ov, #title, #menu, #startBtn, #hud, #sb, #bso, #dia, #inn, #pinfo, #caption, #timingTip, #toast, #spd, #pitchPanel, #acts, #help, #flash, #curtain, #result, #sub, #throwPanel, #touchBtns

### css/02-mobile-layout.css
02-mobile-layout.css — 簡化選單＋手機／平板版面（原 style.css 第 197-345 行）
- 行數：150
- 主要 id：#actMore, #hud, #menu, #startBtn, #title, #result, #sb, #bso, #inn, #dia, #pinfo, #spd, #leftCol, #windBox, #absInfo, #hitInfo, #absPanel, #absRem, #caption, #touchBtns, #btnAct, #btnPow, #acts, #pitchPanel, #throwPanel

### css/03-mobile-topbar-dialogs.css
03-mobile-topbar-dialogs.css — 手機上方資訊列／音效面板／OUT提示／離開對話框（原 style.css 第 346-489 行）
- 行數：145
- 主要 id：#topbar, #pinfo, #bBox, #pBox, #sb, #audioPanel, #audioClose, #audioVol, #audioNum, #audioTracks, #titleBgm, #btnPowPc, #quitDlg, #intro, #hud, #ov, #venueIntro, #outBanner, #ejectBanner, #absPanel, #movePad

### css/04-menu-lineup.css
04-menu-lineup.css — v3/v4 選單／賽前編成（原 style.css 第 490-569 行）
- 行數：81
- 主要 id：#menu, #topbar, #lineup

### css/05-team-select-result.css
05-team-select-result.css — v5 選隊畫面／結算畫面（原 style.css 第 570-691 行）
- 行數：123
- 主要 id：#menu, #lineup, #result

### css/06-title-menu.css
06-title-menu.css — 主畫面選項（一般／生涯／離開）（原 style.css 第 692-783 行）
- 行數：93
- 主要 id：#title, #fff, #exitDlg, #bye, #careerDlg

### css/07-pitch-meter-abs-v2.css
07-pitch-meter-abs-v2.css — 投球準度條／ABS提示／v2調整（原 style.css 第 784-857 行）
- 行數：75
- 主要 id：#pmeter, #absPanel, #absRem, #absCnt, #wrap, #btnAct, #btnPow, #topbar, #bBox, #sb

### css/08-game-buttons-theme.css
08-game-buttons-theme.css — 區塊2-3：推球鈕／比賽按鈕主題／全壘打字幕（原 style.css 第 858-1024 行）
- 行數：168
- 主要 id：#btnPush, #btnBack, #dia, #hud, #e6ecf3, #rosinTag, #pitchPanel, #absPanel, #rp, #hrBanner, #bso, #title

### css/09-bullpen.css
09-bullpen.css — 區塊4：牛棚熱身（原 style.css 第 1025-1045 行）
- 行數：22
- 主要 id：#warmBox, #penUI, #penSkip

### css/10-patches-touch-menus.css
10-patches-touch-menus.css — 區塊5：下雨／觸控／等級色／更多選單修正（原 style.css 第 1046-1138 行）
- 行數：94
- 主要 id：#rainDelay, #pitchPanel, #movePad, #touchBtns, #btnBuntT, #acts, #hud, #b9c0ca, #rot, #d5dae1, #sjhDlg, #throwPanel

### css/11-fixpatch-misc.css
11-fixpatch-misc.css — 區塊6：球速標籤／牛棚手機版（原 style.css 第 1139-1154 行）
- 行數：16
- 主要 id：#spd, #sb, #windBox, #penUI, #penSkip
