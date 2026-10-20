檔案結構（載入順序即檔名數字順序，不可更動順序；90 號須最後載入）
baseball.html        入口（依序載入 css/*.css 與 js/*.js）
css/01~11-*.css      樣式（後面的檔案會覆蓋前面的同名規則，順序＝原 style.css 順序）
js/01~35-*.js        遊戲程式（全域共用，每檔皆 'use strict'，順序＝原 script.js 順序）
js/90-boot-title-menu.js  boot()／主畫面選單（tmCareer 生涯入口）／開場特效，必須最後載入
新增檔案（例如 js/80-career-*.js、css/20-career.css）請在 baseball.html 中放在 90 之前／css 最後。
