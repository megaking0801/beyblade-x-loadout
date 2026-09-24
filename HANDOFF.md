# 交接筆記

最後更新：2026-09-24 UTC+08:00
交接原因：一般交接（Task 8 收尾流程進行中）

## 目前目標

六軸評估系統換成「零件類型比重」的 SDD 計畫（8 個 Task）功能與驗證已全部完成
（Task 7 的 `npm run shots` 已人工看過截圖，四條類型比重分數條顯示正常、有 `%`、
無「六軸」殘留字樣）。目前在做 Task 8 收尾：規格文件第 50.7 節與 spec 狀態列已
改為「已完成」，`tsc -b`／`npm test` 已重跑確認乾淨，準備 commit + push +
deploy + test:live。

- Spec：`docs/superpowers/specs/2026-09-24-six-axis-to-type-weight-design.md`
- Plan：`docs/superpowers/plans/2026-09-24-six-axis-to-type-weight.md`

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 有未 commit 的文件變更（`BEYBLADE_X_codex_prompt.md`、spec 狀態列） |
| 本機 HEAD | `c5e8ecc` |
| `origin/main` | `c5e8ecc`（同步，Task 1–7 程式碼已在上一輪推送過） |
| 線上 Pages | **未變更**，尚未部署本輪（Task 1–7 的類型比重介面還沒上線） |

## 已驗證與未驗證

- `npx tsc -b`：通過（本輪重跑，乾淨無輸出）。
- `npm test`：463/463 全過（本輪重跑）。
- `npm run test:e2e`：85 passed / 1 skipped（上一輪跑過，本輪未重跑，文件變更
  不影響程式邏輯）。
- `npm run shots`：已跑，已用 Read 工具人工看過
  `test-results/shots/desktop-builder.png`／`phone-builder.png`，確認顯示正常。
- push／deploy／test:live：**還沒做**，是下一步。

## 阻塞

無。

## 下一個具體動作

1. commit 這輪文件變更（`BEYBLADE_X_codex_prompt.md`、
   `docs/superpowers/specs/2026-09-24-six-axis-to-type-weight-design.md`、
   `HANDOFF.md`），訊息：
   `docs: mark six-axis-to-type-weight spec and plan as implemented`。
2. `git push origin main`。
3. `npm run deploy:pages`，記下輸出的 `gh-pages` commit SHA。
4. `npm run test:live`，全部通過後把結果與 SHA 補回這份 HANDOFF 的「發布狀態」
   表格（純文件變更，不用再部署一次）。
5. 全部驗證過、確認線上真的換版後，用
   `superpowers:finishing-a-development-branch` 收尾這支 SDD（這次直接在
   `main` 上做，不是獨立分支，收尾時注意這點）。

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

- BBXHub 只比對到 45/167 個零件，逐配置固鎖／軸心明細沒接，冷門／新品零件
  沒有來源可補英中對照。
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
