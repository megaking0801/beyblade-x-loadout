# 交接筆記

最後更新：2026-09-24 UTC+08:00
交接原因：一般交接（Task 8 全部完成，SDD 主線已上線，待做收尾流程）

## 目前目標

六軸評估系統換成「零件類型比重」的 SDD（8 個 Task）已全部完成並驗證上線，
且已用 `superpowers:finishing-a-development-branch` 確認收尾（全程直接在
`main` 上做，沒有分支／worktree 要清）。

這之後接著處理「BBXHub 零件對照覆蓋率」這個已知缺口：查出比對失敗的三個
真正根因並修掉（見下面「已知缺口」的完整說明），比對成功率從 45/167 修到
82/167。**這批改動（`buildCatalog.mjs`／`fetchBbxhubMeta.mjs` 及重新產出的
`catalog.generated.json`）還沒 commit**，下一步先做完收尾三件套
（commit → push → 因為 `catalog.generated.json` 變了，接著 deploy + test:live）。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | **不乾淨**——BBXHub 覆蓋率修復尚未 commit（見上） |
| 本機 HEAD | `698bc53` |
| `origin/main` | `698bc53`（同步，本機沒有未推的 commit，只有未 commit 的工作區變更） |
| 線上 Pages | 已部署，`gh-pages` commit `1129d0b`（六軸→類型比重那批），
  **不含這輪 BBXHub 修復**——`catalog.generated.json` 有改，commit+push 後要
  接著部署 |

## 已驗證與未驗證

- `npx tsc -b`：通過（本輪重跑，乾淨無輸出，在 BBXHub 修復之後）。
- `npm test`：463/463 全過（本輪重跑，在 BBXHub 修復之後）。
- `node scripts/fetchBbxhubMeta.mjs`：重新抓過，比對成功數 45→82（輸出見
  `src/catalog/sources/bbxhub-meta.json`），但這份資料**沒有任何程式消費**，
  改善不影響任何使用者看得到的畫面（見「已知缺口」）。
- `npm run test:e2e`：**這輪未跑**——BBXHub 修復沒動到任何 UI／路由，風險低，
  但收尾三件套的上線前關卡（`CLAUDE.md` 規定）還是要在 commit 之後補跑一次，
  不能省。
- `npm run shots`：上一輪（六軸→類型比重）跑過，這輪未重跑，同上理由。
- `npm run test:live`：上一輪 6/6 通過，這輪部署後要重跑。

## 阻塞

無。

## 下一個具體動作

1. `git add scripts/buildCatalog.mjs scripts/fetchBbxhubMeta.mjs
   src/catalog/catalog.generated.json src/catalog/sources/bbxhub-meta.json
   HANDOFF.md`，commit（`catalog-audit.json` 這輪內容沒變，不用加）。
2. `git push origin main`。
3. `npm run test:e2e`（上線前關卡第一步，這輪還沒跑過）。
4. `npm run shots` 看一眼截圖（這輪只改零件資料的 `nameEn`／`bbxhub-meta.json`，
   前台沒有任何地方顯示這兩個欄位，理論上截圖會跟上一輪一樣，但規則要求
   一個可部署批次要完整走一次，不能因為「應該沒差」就跳過）。
5. `npm run deploy:pages` → `npm run test:live`，把結果補回這份 HANDOFF。

## 怎麼跑（非顯而易見的）

- 這是用 `superpowers:executing-plans` 執行的 SDD 計畫，直接在 `main` 上做
  （沒有開 worktree／分支，使用者持續同意，見 ledger 開頭的 ruling）。Task 8
  的 Step-by-step 對照
  `docs/superpowers/plans/2026-09-24-six-axis-to-type-weight.md` 的 Task 8。
- 其餘沿用既有規則（見 `CLAUDE.md`）。

## 踩過的坑（這輪 SDD 新增）

- **改共用測試 fixture 會連帶影響同一個 describe block 裡沒被明講要改的既有
  測試**——Task 2 的 brief 要求把 `bladeDefense` 加進 `builder.test.ts` 共用的
  `lots`，這個改動讓另一條原本寫死「產生 8 個配置」的既有測試變成產生 12 個
  （3 顆上蓋 × 2 固鎖 × 2 軸心）。這不是 bug，是 fixture 變大的必然結果，但
  brief 沒提到，是跑紅了才發現。改共用 fixture 前，先搜一下同一個 describe
  block裡還有誰在用同一個變數、有沒有寫死數量的斷言。
- **重構期間，`.某舊欄位` 在 TS 型別上不存在，但 Vitest（esbuild transform）
  不做型別檢查，執行期照樣跑、只是欄位讀出來是 `undefined`**——這會讓「這個
  測試現在該紅」的預期落空：deck.ts 還沒改掉 `.scores` 的時候，讀
  `member.analysis.typeWeight`（Task 1 已經有的新欄位）的新測試反而因為
  `scoreDeck()`／`assignRoles()` 內部退化成到處都是 tie（`-1 - -1 = 0`）而
  「碰巧」全部綠燈，不是邏輯正確，是每個候選都被打成平局。這輪用一支臨時
  Node 腳本（跑完就刪）額外驗證了實作完之後這幾條比較式是真的有分出高下、
  不是巧合平局，才敢放心進下一步。以後遇到「這個測試現在該紅，結果是綠的」，
  先懷疑退化 tie，不要照單全收。
- **Step 8 的收尾 grep 不能只查計畫列出的檔案**——「六軸」這個字眼在
  `BuilderPage.tsx` 裡除了計畫明確列出的分數條區塊，還藏在另外兩處使用者
  看得到的提示文字（沒有賽事證據時的提示、可切換模式的提示），是全域 grep
  才抓到的，不在 Task 7 brief 原本列的行號範圍內。收尾用的全域搜尋一定要
  對著整個 `src/` 跑，不能只看計畫寫的檔案清單。

## 踩過的坑（沿用既有，仍然有效）

- `stanyao-raw-records.json` 只有正例沒有負例，也沒有「零件總共被用了幾次」
  的分母，算不出真正的機率——任何想拿這批資料做「預測」的功能，先檢查有沒有
  負例（規格第 50.1 節）。
- 回測「比較哪幾組」的設計本身會決定測不測得出訊號，跟資料量無關；任何相關
  係數結果都要先跑隨機打亂對照組排除方法論假訊號（規格第 50.6 節）。
- 加一個新的「證據補分」訊號時，gain 一定要算「淨新增」不是「商品裡全部
  零件」，否則會打穿「沒有任何增益就不推薦」的防呆機制。
- 刪除一個頁面時，`grep "<Link"` 抓不到所有殘留 import，要靠 `tsc -b` 的
  unused-import 檢查才抓得到。
- 規格宣告「已經拆分職責」不代表程式碼真的拆了——要 grep 舊職責的具體符號
  確認，不能只看規格文字。
- 加總多個維度時，先代入每個純類型手算一次結果，才知道有沒有系統性偏差。

## 已知缺口

- **`bbxhub-meta.json`（`scripts/fetchBbxhubMeta.mjs` 的輸出）目前沒有任何
  程式消費它**——`grep -rln "bbxhub-meta" src/` 沒有結果，前台的 T 表／高手
  評級走的是完全不同的 `beybladehub-tier-lists.json`／`beybladehub-tier-ratings.json`
  （見 `catalog/tierLists.ts`）。這份 BBXHub（bbxhub.net，WBO 賽事統計）資料
  抓完之後從沒接進任何評分或顯示邏輯，是個孤兒管線。2026-09-24 這輪把它的
  比對成功率從 45/167 修到 82/167（見下），但這個數字目前**不影響任何使用者
  看得到的東西**——除非未來真的把它接進 `deck.ts`／`recommendations.ts`，
  否則後續要不要再花力氣提升這個比對率，先評估「接進來」這件事本身值不值得
  （屬於架構決策，不是這輪修的範圍）。
- **BBXHub 比對失敗根因已查清，不是「冷門零件沒對照表」這麼簡單**：
  1. 原本的比對邏輯把整個 BBXHub 條目字串（可能是「融合上蓋 輔助戰刃」兩段式，
     例：`PegasusBlast Heavy`）當一個名字去查橋接表，橋接表只收得到融合上蓋
     單獨的名字，兩段式的永遠查不到——這是 `no_bridge_entry` 的主因，已修
     （`fetchBbxhubMeta.mjs` 的 `splitAssistBladeSuffix()`，用圖鑑裡的
     `assist_blade.naming.nameEn` 判斷該不該拆、拆完的融合上蓋歸到
     `main_blade`／`lock_chip` 這個身分零件，跟 `deck.ts` 的
     `IDENTITY_SLOT_KEYS` 同一套優先序）。
  2. `applyHubStats()`（`buildCatalog.mjs`）本來就抓得到 BeybladeHub 零件頁的
     `nameEn`，但只拿去比對 `type`／`spinDirection`／`officialWeightG` 等
     數值欄位，從沒把 `nameEn` 寫回 `naming.nameEn`——固鎖／軸心／輔助戰刃
     這三類因此幾乎全部沒有英文名（例如 `assist_blade` 19 顆裡原本只有 1 顆
     有 `nameEn`），已修（`applyHubStats()` 補一段複製邏輯，`assist_blade`
     現在 19 顆有 18 顆、`over_blade` 4 顆全有）。
  3. 橋接表（stan-yao Google Sheet）的中文翻譯偶爾跟圖鑑自己的翻譯不一致
     （例：`UnicornSting` 橋接表譯「幻獸刺心」，圖鑑實際是「獨角刺心」），
     照中文名查會查不到——已修，改成先直接比對圖鑑自己的 `naming.nameEn`
     （108 顆上蓋家族零件裡 95 顆已有），查不到才退回橋接表。
  - 修完後 45/167 → 82/167。剩下 85 筆：6 筆是圖鑑真的沒收錄的零件（例：
    `MummyCurse`／`OrochiCluster`／`SamuraiSteel`——beybladehub.app 的零件頁
    確認存在日文名，但我們的圖鑑建置流程沒抓到這幾顆，來源缺口，不是比對
    邏輯問題，不確定是不是太新還沒被官方一覽頁收錄），79 筆是兩段式名稱裡
    融合上蓋本身圖鑑跟橋接表都沒有（同一種缺口，只是發生在融合上蓋而不是
    輔助戰刃）。**沒有嘗試補這 6 顆缺漏零件或擴充橋接表**——加一顆新零件要
    完整資料（type／旋向／來源／provenance），不確定的東西不能半套塞進圖鑑，
    留給下一輪有需要時再查證。
  - **驗證注意**：查過程中先用 WebFetch 摘要了一份「輔助戰刃中文名對照表」
    （斬擊／迴圈／緩衝…），後來直接 `curl` 原始 HTML 核對，發現那份表是
    AI 摘要**幻覺出來的**，頁面上根本沒有這些中文字——所以最後只採用了
    `beybladehub-stats.json` 裡本來就有、也在原始 HTML 逐一 grep 驗證過的
    `nameEn` 英文名，中文名維持原樣（代號本身）。以後查 beybladehub.app 這類
    頁面內容，WebFetch 摘要當線索可以，寫進圖鑑前一定要拿 `curl` 對原始
    HTML 逐字確認，不能只信 AI 摘要。
- 零件強度 fallback 的訊號方向已驗證有時間持續性，但只對這次的特定訓練／驗證
  切分成立，賽事 meta 會隨新品發售、規則調整改變，之後要重跑回測再確認。
- `TYPE_WEIGHT`（上蓋 0.5／軸心 0.3／固鎖 0.2 的槽位權重）已測試過不支持用
  零件強度那套方法校正（見規格第 5 節），維持現狀，不用再花時間。
- `.claude/worktrees/part-strength-fallback` 與根目錄 `context-audit-v2.md`
  是未追蹤檔案，跟本輪 SDD 無關（分別是另一支功能的 worktree、另一份審計
  請求），本輪沒有動它們，接手時不要誤以為是本輪產物。

## 資料管線表

`stanyao-raw-records.json`（14,743 筆逐場進前三名次，只有正例沒有負例）→
`scripts/buildPartStrength.mjs`（展開 comboPartIds、按零件聚合、套
`computePercentiles()`）→ `part-strength.generated.json` → `catalog/partStrength.ts`
的 `getPartStrengthIndex()`（模組層級快取）→ `deck.ts` 的
`estimateComboPartStrength()`（身分零件沒資料就回傳 `undefined`）→
`scoreDeck()`（真實證據優先、fallback 加下限不會輸）與 `recommendations.ts`
的獨立 `partStrengthGain`（只算淨新增可用零件）→ 前台三種文字狀態。

CX 拆件：`scripts/buildCatalog.mjs` 的 `decomposeCxBlade()` 比對紋章＋主刃中文名
能不能拼出合併名稱，能拆就拆並用 `addAliasZhTW()` 把合併名稱補進兩顆零件的
`aliasesZhTW` → `catalog-audit.json` 的 `cxSplitBlades` 記錄拆件對照表 →
`domain/search.ts` 的 `searchParts()` 吃 `aliasesZhTW` 做比對。

零件類型比重（這輪主線）：`analysis.ts` 的 `estimateTypeWeight()` 直接把零件
`type` 標籤按槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權混合成四個百分比
（`distributeToHundred()` 用最大餘數法保證加總剛好 100）→
`ComboAnalysis.typeWeight` → `builder.ts`／`buildableRows.ts`／`deck.ts`／
`recommendations.ts`／`reasons.ts`／`BuilderPage.tsx` 全部消費端。
