# 零件強度 fallback 併入 BBXHub 資料

**狀態**：設計已跟使用者逐段確認，待書面 spec 審核。
**規格對照**：`BEYBLADE_X_codex_prompt.md` 第 50 節、第 50.6 節（回測方法論）。

## 1. 背景與動機

`estimateComboPartStrength()`（`deck.ts`）是配置沒有配置級賽事證據時的 fallback
訊號，資料完全來自 `stanyao-raw-records.json`（14,743 筆逐場進前三名次，只有
BX／UX 三件式）。`deck.ts` 自己的註解已經寫明：stan-yao 完全沒有 CX 的
`lock_chip`／`main_blade`／`assist_blade`／`over_blade` 家族零件，所以 CX
配置的 `IDENTITY_SLOT_KEYS`（`bladeId`／`mainBladeId`／`lockChipId`）在
`partStrengthIndex` 裡幾乎必然查不到——**CX 配置目前完全沒有零件強度
fallback，是刻意留下的「沒有樣本」，不是巧合**。

2026-09-24 這輪為了修 BBXHub（bbxhub.net，WBO 全球賽事統計）零件對照覆蓋率，
順手查清楚了 BBXHub 天梯榜單的性質：它同時收錄 BX／UX 一般上蓋跟 CX 融合上蓋
（紋章＋主刃），且規模遠比 stan-yao 大（單一零件數千筆追蹤名次），每個零件都有
`placements.{first,second,third,fourthPlus}`（進前幾名次數分布）——跟
`buildPartStrength.mjs` 現有的「進前三次數聚合」是同一種資料形狀，只是來源
不同、規模大很多。這代表 BBXHub 的資料可以直接填補 CX 完全空白的 fallback，
同時也能給 BX／UX 已有資料的零件補上第二個獨立來源。

## 2. 資料流

`buildPartStrength.mjs` 現有邏輯：讀 `stanyao-raw-records.json`，展開每筆
`record.comboPartIds`，累加進 `podiumCountByPart`（`Map<partId, 進前三次數>`），
再用 `computePercentiles()` 算出每個零件的百分位分數，寫進
`part-strength.generated.json`。

改動：在累加 stan-yao 資料之後，追加讀取 `bbxhub-meta.json`，對每個已解析出
`partId` 的條目，把 `placements.first + placements.second + placements.third`
（刻意不計 `fourthPlus`，對齊 stan-yao「進前三」的定義）加進**同一個**
`podiumCountByPart`，再統一算百分位。

這個合併點選在 `buildPartStrength.mjs` 而不是執行期（`deck.ts`／
`recommendations.ts`），理由：

- 下游完全不用改——`getPartStrengthIndex()`／`estimateComboPartStrength()`／
  `recommendations.ts` 的 `partStrengthGain` 全部只認 `part-strength.generated.json`
  這一份輸出，不管數字是哪個來源餵的。CX 零件本來查不到、合併後有數字了，
  既有的 fallback 邏輯會自動生效，不用新增任何 identity 判斷分支。
- 不用發明新的執行期權重常數——現有的 `PART_STRENGTH_FALLBACK_WEIGHT`
  （`deck.ts`）維持原樣，只是它吃到的百分位資料變得更完整。

## 3. 兩來源怎麼合併計數

**先試直接加總，不設換算係數**：`podiumCountByPart` 對同一個 `partId`，
stan-yao 的次數跟 bbxhub 的 `first+second+third` 直接相加。不引入任何
「bbxhub 一次等於 stan-yao 幾次」這種沒有真實依據、事後也無法校準的常數
（HANDOFF 已經在講 `PART_STRENGTH_FALLBACK_WEIGHT` 這種常數的校準問題，
不要再製造一個同類型的）。

已知風險：bbxhub 規模遠大於 stan-yao（單一零件數千筆 vs stan-yao 全部
14,743 筆），直接相加等於幾乎完全由 bbxhub 的排名決定結果，stan-yao 的
貢獻在有 bbxhub 資料的零件上會被稀釋到接近可忽略。這件事本身不一定是壞事
（`fetchBbxhubMeta.mjs` 的既有註解就寫「規模比現有資料大很多...可信度比
只有單一模糊來源的資料高」），但不能只憑這句直覺就上線，必須通過第 4 節的
回測驗證。

**備案（只有直接加總沒過回測才用）**：兩個來源各自對自己的原始計數算一次
百分位，兩個百分位取平均，再拿平均後的百分位去排序——這樣不管哪個來源規模
大，對排名的「投票權重」相等，只是會損失「有多少證據支撐」這個資訊量。

## 4. 驗證關卡（不得省略）

`backtestPartStrength.mjs` 現有邏輯：把 stan-yao 資料按日期切成訓練期／驗證期，
訓練期算百分位，驗證期看是否仍常出現，用 Spearman 相關係數＋隨機打亂對照組
確認不是方法上的假訊號。bbxhub 資料是累積到抓取當下的彙總值，沒有可切分的
逐筆日期，因此**只能加進訓練期，不能加進驗證期**——這樣做剛好對應我們真正
想驗證的問題：「訓練期多了 bbxhub 資料，有沒有讓我們更準地猜中 stan-yao
之後（驗證期）實際觀測到的結果」。

新增一個合併版回測：跟現有邏輯一樣切分 stan-yao 的訓練／驗證期，差別是訓練期
的 `trainCountByPart` 額外加總 bbxhub 的 `placements` 計數（驗證期維持純
stan-yao 不動）。印出跟現有輸出同一組指標（Spearman、前 25%／後 75% 分段、
隨機打亂對照組），跟純 stan-yao 版本並排比較。

**上線判準**：合併版 Spearman 不能明顯低於純 stan-yao 版（尤其是「排除前
25% 熱門零件後的長尾 Spearman」——這才是 fallback 實際會用到的區間），且
合併版本身要明顯超出隨機打亂對照組的範圍。不過關就改用第 3 節的備案（百分位
平均）重跑一次驗證；如果備案也不過，`buildPartStrength.mjs` 這輪先不合併
bbxhub 資料，只把發現寫回 HANDOFF 當已知缺口，不能為了要交差硬上一個沒驗證
過的合併方式。

## 5. Provenance／誠實邊界

`part-strength.generated.json` 的 `source`／`note` 欄位要如實反映這是兩個
獨立社群來源的合併（stan-yao 表單＋BBXHub WBO 統計），不宣稱官方認證
（兩者現有的 `verificationStatus` 都是 `community_only`，合併後維持
`community_only`）。bbxhub 目前只對到 82/167 個 BBXHub 追蹤零件（見
`fetchBbxhubMeta.mjs` 的既有誠實邊界說明），沒對到的零件這次合併不會補上
任何數字，跟現在的行為一致（沒證據就是沒證據，不猜）。

## 6. 範圍界線（YAGNI）

- **不改** `deck.ts`／`recommendations.ts`——這是這份設計最大的簡化，靠
  既有的「單一 partStrengthIndex 抽象」拿到，不需要驗證就能確定不用碰。
- **不新增**執行期權重常數。
- **不處理** BBXHub 資料的定期更新機制——`fetch:bbxhub-meta`／
  `build:part-strength` 維持手動執行，跟現有 `fetch:stanyao-records` 一樣，
  不做排程自動化（不在這次範圍內，之後有需要再開）。
- **不新增**這兩支建置腳本的單元測試——現狀本來就沒有（`buildPartStrength.mjs`／
  `backtestPartStrength.mjs` 都是手動跑、看主控台輸出人工判讀的腳本），這次
  維持現狀，不擴大範圍。

## 7. 測試計畫

- 改完 `buildPartStrength.mjs`，跑 `npm run build:part-strength`，人工核對
  主控台輸出：零件數、`lowSampleWarnings`、`unmatchedCatalogPartIds` 的變化
  方向合理（CX 零件應該開始出現在 `parts` 裡）。
- 跑新的合併版回測，人工核對第 4 節的上線判準。
- 判準通過後，跑 `npx tsc -b && npm test`（463 個既有測試不應該因為
  `part-strength.generated.json` 內容變動而變紅——如果紅了，代表有測試
  寫死了假設「CX 零件永遠沒有 fallback」，要一併檢查那條測試的假設是否
  還成立）。
- 判準不通過，回退合併（`buildPartStrength.mjs` 維持只吃 stan-yao），把
  這次的查證結果寫進 HANDOFF 已知缺口，不上線任何合併版本。
