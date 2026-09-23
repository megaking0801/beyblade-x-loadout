# 交接筆記

最後更新：2026-09-23 UTC+08:00
交接原因：一般交接（使用者要求先寫交接再推）

## 目前目標

原本規劃訓練「A-vs-B 勝率模型」，這輪確認資料撐不起來、放棄，改成用結構化社群天梯站
資料強化既有「下一包推薦」與「3on3 組隊」的評分邏輯——**不是新功能，是既有評分公式的
資料來源擴充與 bug 修正**，畫面沒有變化。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨 |
| 本機 HEAD | `68be9fc`（push 前） |
| `origin/main` | `3d17d7c`（落後 6 個 commit，即將 push） |
| 線上 Pages | 尚未部署本輪改動——`src/domain/`／`src/ui/pages/` 有正式程式碼變更，
  依規則 push 後要接 `deploy:pages` + `test:live`，這份 HANDOFF 寫完後會立刻執行並回來更新 |

## 已驗證與未驗證

- `npx tsc -b`：通過。
- `npm test`：25 files / 450 tests 通過。
- `test:e2e`／`shots`／`test:live`：**尚未跑**，即將執行——部署結果會在跑完後另外更新這份
  HANDOFF，現在寫的內容不代表線上已經是新版。

## 阻塞

無。原本的 `YOUTUBE_API_KEY` 阻塞已解除（使用者提供並用過）；影片查核方向這輪降到最低
優先，不再視為阻塞項。

## 下一個具體動作

跑完整上線流程：`npm run test:e2e` → `npm run shots` → `git push` → `npm run deploy:pages`
→ `npm run test:live`，確認線上版本反映這輪修正，回來把結果寫回這份 HANDOFF。

## 怎麼跑（非顯而易見的）

- 這台機器沒裝 node/npm，要用 nvm（已裝在 `~/.nvm`）：每個新 shell 都要先
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` 才有 `node`／`npm`。
- `@playwright/test` 釘在 `1.57.0`（macOS 13 相容，Chromium 在 1.62.0、WebKit 在 1.58.0
  拿掉 macOS 13 支援），不要隨手升版，除非先查證新版何時恢復支援或機器已升級 macOS。
- `npm run fetch:stanyao-records`／`npm run fetch:bbxhub-meta` 各自獨立可重跑，會覆寫
  `src/catalog/sources/` 底下對應的 json。

## 踩過的坑

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

## 已知缺口

- BBXHub 只比對到 45/167 個零件（橋接表只有 101 筆常見零件英中對照，來自 stan-yao 資料），
  冷門／新品零件目前沒有來源可以補英文↔中文對照。
- BBXHub 的逐配置固鎖／軸心明細沒接（頁面用全名如「Hexa」標軸心，跟圖鑑代號「H」的對照
  未查證），這輪只收了零件層級的 Tier。
- stan-yao／BBXHub 交叉驗證抓到具體分歧案例（例如 XenoXcalibur 排名 31 vs 113），目前
  沒有機制標記「來源分歧、信心較低」，只有人工記錄，沒有寫進資料結構。
- 「3on3 組隊強度定義要不要納入社群意見」——使用者已表態要做，但要求先有資料再設計，
  這輪資料才剛接上，`deck.ts` 的角色分配／`scoreDeck` 本身邏輯還沒動。
- 六軸評估系統（`analysis.ts` 的 `BASE_BY_TYPE`）已確認是 4 類、24 個憑感覺編的常數，
  跟實戰無關，存廢待決；使用者要求排在「組隊強度重新定義」之後處理。

## 下一步（排序）

1. 跑完上線流程（見上「下一個具體動作」）——程式碼已經改了，不上線等於使用者看不到
   任何改善，排最前面。
2. 組隊推薦「強度」定義重新設計——使用者已要求，且資料現在才剛備齊，是下一個大工作。
3. 六軸評估系統存廢——需要第 2 項先有結論才知道六軸還剩多少必要性。
4. BBXHub 比對率／逐配置明細補強（低優先，非阻塞，隨時可以做）。
5. 影片查核（阿土等人的推薦影片）——排最後，結構化網站資料量已遠超原本目標，暫時
   沒有急迫性，除非之後發現資料缺口是社群站台補不上的。

## 資料管線表

`BeybladeHub（賽事＋高手評級）／beywatch.gg（全球快照）／stan-yao（15,131 筆逐場名次，
公開 Google Sheet）／BBXHub（167 零件 WBO Tier，45 個已比對）` → `createCompetitiveEvidenceByCode()`
（各來源各自算百分位排名，taiwan > community > global 優先序，見 `competitiveMeta.ts`）→
`recommendations.ts` 的 `competitiveEvidenceGain`／`expertTierGain`／廣度備援 → 下一包推薦
排序；同一份 `evidenceByCode` 現在也正確傳進 `suggestDecks`／`validateDeck` → 3on3 組隊
`scoreDeck` 的 balanced 策略。
