# 交接筆記

最後更新：2026-09-23 UTC+08:00
交接原因：一般交接（使用者要求先寫交接、推上去再停）

## 目前目標

原本規劃訓練「A-vs-B 勝率模型」，這輪確認資料撐不起來、放棄，改成用結構化社群天梯站
資料強化既有「下一包推薦」與「3on3 組隊」的評分邏輯——**不是新功能，是既有評分公式的
資料來源擴充與 bug 修正**，畫面結構沒有變化，但推薦排序、理由文字跟組隊的證據加分
會不一樣。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨 |
| 本機 HEAD | `201a8a5` |
| `origin/main` | `201a8a5`（同步） |
| 線上 Pages | 已部署，gh-pages commit `6ff417a`（2026-09-23 11:08 部署），
  `test:live` 6/6 通過 |

## 已驗證與未驗證

- `npx tsc -b`：通過。
- `npm test`：25 files / 450 tests 通過。
- `npm run test:e2e`：87 通過、1 跳過（手機寬度的離線測試，桌機版同一測項有跑且通過，
  是既有設計不是這輪造成的）。
- `npm run shots`：手機截圖第一次跑逾時（`element was detached from the DOM`），單獨
  重跑一次乾淨通過（17 秒），判定是環境忙碌造成的 flaky，不是真的壞掉；已人工看過
  `phone-home.png`／`desktop-decks.png`，數字正常（整數、無 NaN/undefined）。
- `npm run test:live`：6/6 通過。

## 阻塞

無。原本的 `YOUTUBE_API_KEY` 阻塞已解除（使用者提供並用過）；影片查核方向這輪降到最低
優先，不再視為阻塞項。

## 下一個具體動作

組隊推薦「強度」定義重新設計——使用者已明確要求把社群意見（tier 評級、stan-yao/BBXHub
資料）納入 `deck.ts` 的「什麼叫最強隊伍」判斷，資料這輪才剛備齊，是下一個要開工的項目。

## 怎麼跑（非顯而易見的）

- 這台機器沒裝 node/npm，要用 nvm（已裝在 `~/.nvm`）：每個新 shell 都要先
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` 才有 `node`／`npm`。
- `@playwright/test` 釘在 `1.57.0`（macOS 13 相容，Chromium 在 1.62.0、WebKit 在 1.58.0
  拿掉 macOS 13 支援），不要隨手升版，除非先查證新版何時恢復支援或機器已升級 macOS。
- `npm run fetch:stanyao-records`／`npm run fetch:bbxhub-meta` 各自獨立可重跑，會覆寫
  `src/catalog/sources/` 底下對應的 json；`fetch:stanyao-records` 同時輸出
  `stanyao-raw-records.json`（逐場，稽核用，近 4MB）跟 `stanyao-combo-summary.json`
  （聚合摘要，app 實際吃這份，約 330KB）。

## 踩過的坑

- **`communityRecords.ts` 曾經直接 import 近 4MB 的 `stanyao-raw-records.json`**，
  Vite 會把整份 JSON 打包進瀏覽器程式碼，主 chunk 飆到 3.54MB，超過
  `vite-plugin-pwa` service worker precache 的 2MB 預設上限，**整個 `npm run build`
  直接失敗**。app 執行期只能 import 小的聚合摘要檔，原始逐場資料留在 repo 當稽核用，
  不能被 app 程式碼直接引用——以後任何新資料來源，先確認要 import 的 JSON 檔案大小。
- **`validateDeck()` 曾經完全沒把 `evidenceByCode` 傳給 `analyzeCombo`**，導致每個隊員的
  `analysis.evidence` 永遠是 `undefined`——這個 bug 存在很久（不是這輪引入的），這輪才
  修掉並補測試。以後改 `deck.ts`／`suggestDecks` 相關邏輯，記得證據要傳全程，不能只顧
  `generateBuildableCombos` 那一段。
- **不同證據來源的 `appearances` 量級差異極大**（台灣本地個位數 vs 社群站台上萬筆），
  直接加總或比較會讓大站台系統性蓋過小樣本真實賽果——這是這個 codebase 第二次犯同一類
  bug（第一次在已棄用的 `competitiveEvidenceScore()`）。任何新證據來源要接進評分前，先
  問「量級跟既有資料差多少」，答案是「差很多」就要走百分位歸一化，不能直接加總。
- **`fetchStanYaoRecords.mjs` 的 `comboCode` 曾經誤用站方中文原文**而不是圖鑑的日文
  `part.code`，導致資料完全對不上系統內部查表用的 key，卡了好一陣子才用端到端真實資料
  測試抓到（單元測試用合成 fixture 測不出這種格式錯誤，要拿真實資料跑一次才會現形）。
- 這個 sandbox 環境的 Bash 工具一開始找不到 `node`，但裝好 nvm 之後其實可以自己
  `source` 來用，不用每次都請使用者用 `!` 轉發指令。
- stan-yao／BBXHub 都是公開 Google Sheet／SSR 網頁，不需要 `claude-video-vision` 或任何
  轉錄工具就能拿到結構化資料——這次環境沒有 `claude-video-vision`，一度以為影片查核整條
  路卡死，後來才發現根本不需要碰影片，改找結構化網站更快更可靠。
- `npm run shots` 的手機截圖測試跑第一次容易在剛跑完 `test:e2e`／`build` 後 timeout
  （DOM 元素被重新渲染打斷），單獨重跑一次通常就過；不要看到一次失敗就當成真的壞了，
  但也不能不重跑就當作沒事，兩種各自要避免。

## 已知缺口

- BBXHub 只比對到 45/167 個零件（橋接表只有 101 筆常見零件英中對照，來自 stan-yao 資料），
  冷門／新品零件目前沒有來源可以補英文↔中文對照。
- BBXHub 的逐配置固鎖／軸心明細沒接（頁面用全名如「Hexa」標軸心，跟圖鑑代號「H」的對照
  未查證），這輪只收了零件層級的 Tier。
- stan-yao／BBXHub 交叉驗證抓到具體分歧案例（例如 XenoXcalibur 排名 31 vs 113），目前
  沒有機制標記「來源分歧、信心較低」，只有人工記錄，沒有寫進資料結構。
- 六軸評估系統（`analysis.ts` 的 `BASE_BY_TYPE`）已確認是 4 類、24 個憑感覺編的常數，
  跟實戰無關，存廢待決；使用者要求排在「組隊強度重新定義」之後處理。

## 下一步（排序）

1. 組隊推薦「強度」定義重新設計——使用者已要求，資料現在才剛備齊，排最前面。
2. 六軸評估系統存廢——需要第 1 項先有結論才知道六軸還剩多少必要性。
3. BBXHub 比對率／逐配置明細補強（低優先，非阻塞，隨時可以做）。
4. 影片查核（阿土等人的推薦影片）——排最後，結構化網站資料量已遠超原本目標，暫時
   沒有急迫性，除非之後發現資料缺口是社群站台補不上的。

## 資料管線表

`BeybladeHub（賽事＋高手評級）／beywatch.gg（全球快照）／stan-yao（15,131 筆逐場名次
聚合成 2,503 個配置摘要，公開 Google Sheet）／BBXHub（167 零件 WBO Tier，45 個已比對）`
→ `createCompetitiveEvidenceByCode()`（各來源各自算百分位排名，taiwan > community >
global 優先序，見 `competitiveMeta.ts`）→ `recommendations.ts` 的
`competitiveEvidenceGain`／`expertTierGain`／廣度備援 → 下一包推薦排序；同一份
`evidenceByCode` 現在也正確傳進 `suggestDecks`／`validateDeck` → 3on3 組隊 `scoreDeck`
的 balanced 策略。
