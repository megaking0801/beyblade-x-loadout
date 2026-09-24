# 交接筆記

最後更新：2026-09-24 UTC+08:00（部署驗證輪）
交接原因：一般交接（部署前檢查全數補跑完成並上線）

## 目前目標

零件層級強度分數（規格第 50 節）已完成開發、審核並上線。下一步是待使用者對 0.3
權重（回測沒驗證出前瞻相關性）的答覆，以及非阻塞的長期缺口（見下方「已知缺口」）。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨，僅根目錄一份 worktree（SDD 用的 `.claude/worktrees/part-strength-fallback` 已不存在，分支已併入 `main`） |
| 本機 HEAD | `351da8f` |
| `origin/main` | `351da8f`，與本機一致 |
| 線上 Pages | 已部署，`gh-pages` commit `853a340`（建置來源 `main` HEAD `351da8f`），`npm run test:live` 6/6 通過 |

## 已驗證與未驗證

- `npx tsc -b`：通過（隨 e2e/build 流程一併跑過）。
- `npm run test:e2e`：87 passed / 1 skipped（skip 為既有的斷網情境測試，非本輪新增）。
- `npm run shots`：2 passed，並人工看過 phone/desktop 的 decks、home、buildable 等圖，
  確認「模型推估」標籤、「完整配置賽事證據：出現 N 次」文字正常顯示，無假名、無編造數字。
- `npm run deploy:pages`：成功，`gh-pages` HEAD `853a340`。
- `npm run test:live`：6/6 通過（phone + desktop）。
- SDD 7 個任務逐一 task review 都過（Task 2 有一輪 fix：補 CX 四件式測試覆蓋）。
- 最終整支分支 review（`docs/superpowers/plans/2026-09-24-part-strength-fallback.md`
  對應的 SDD ledger：`.claude/worktrees/part-strength-fallback/.superpowers/sdd/2026-09-24-part-strength-fallback/progress.md`）抓到：
  - **Critical**：`recommendations.ts` 的 `partStrengthGain` 原本沒扣掉使用者已擁有的
    零件，導致已擁有的商品也被推薦、且文案講假話。已修：改用
    `computeAvailabilityMap` 只算真正新增可用的零件，加總改平均。
  - **Important**：`scoreDeck()` 的零件強度 fallback，理論上不該贏過真實證據，但真實
    百分位很低時（台灣本地小樣本）原本贏得過。已修：真實證據分數加下限
    （floor 在 fallback 理論最高值）。
  - **Important**：CX 配置／沒賽果紀錄的上蓋，原本只用固鎖軸心平均出一個誤導性高分。
    已修：配置的「身分零件」（上蓋／CX 主刃／鎖定紋章）沒資料時整個回傳 `undefined`。
  - 修完跑過 scoped re-review，三項全部 ADDRESSED，只剩 4 條 Minor 已用 ruling 記在
    ledger 裡 park 掉（floor 讓低分真實證據互相打平／floor 剛好打平不算贏／某條回歸
    測試 else 分支恆真／CX 第三順位身分 key 打不到），不影響正確性，細節見 ledger。
- **回測結果（Task 7，時間切分，45 訓練期日期 vs 12 驗證期日期）**：驗證期內用訓練期
  零件強度分數對實際名次分組平均——第 1 名組 87.0（n=120）、第 2 名組 89.2（n=51）、
  第 3 名組 87.0（n=141）。第 1 名跟第 3 名完全打平，**沒有驗證出前瞻相關性**。已跟
  使用者回報過（維持 0.3／降低權重／整個拔掉三個選項），**使用者尚未答覆**，中途被
  要求暫停轉去處理最終 review 的 Critical/Important 修復。這是懸而未決的問題，見
  「下一個具體動作」。

## 阻塞

無。部署前檢查（e2e／shots／deploy／live）全數跑完並通過。**零件強度 fallback 的 0.3
權重要不要調整，還等使用者答覆**（見上方回測結果），不影響已上線版本，但下次調整前
要先問。

## 下一個具體動作

1. 等使用者對 0.3 權重的答覆（維持／降低／拔除三選項，見「已知缺口」）；沒有新指示
   前不用主動再改這個數字。
2. 六軸評估系統整組存廢——待評估，非阻塞（見下方排序）。

## 怎麼跑（非顯而易見的）

- 這批程式碼原本在 git worktree `.claude/worktrees/part-strength-fallback` 開發，
  分支已 fast-forward 併入 `main` 並推送，worktree 已不存在。之後改這批程式碼直接
  在根目錄 `main` 上做。
- `npm run build:part-strength`：重新跑零件強度資料管線（讀
  `stanyao-raw-records.json`，輸出 `part-strength.generated.json`）。
- `npm run backtest:part-strength`：跑 Task 7 的時間切分回測，純 console 輸出，不寫檔。
- 其餘沿用既有規則（見 `CLAUDE.md`）。

## 踩過的坑

- **`stanyao-raw-records.json` 的 `rank` 只收 1～3 名，全部都是「有進前三」的正例，
  沒有任何一筆「打了但沒進前三」的負例**——一開始想「訓練一個預測勝率的模型」整個
  前提就不成立，因為沒有負例、也沒有「這零件總共被用了幾次」的分母，算不出真正的
  機率。改成「零件層級的賽果聲量百分位聚合」才是資料撐得住的做法。以後任何想拿這批
  資料做「預測」相關功能，先檢查有沒有負例。
- **加一個新的「證據補分」訊號時，`recommendations.ts` 的 gain 一定要算「淨新增」不
  是「商品裡全部零件」**——`partStrengthGain` 第一版直接加總商品內所有零件的分數，
  沒扣掉使用者已經擁有的部分，導致 104/128 商品都變成「有增益」，「沒有任何增益就不
  推薦」的既有防呆機制整個被打穿，已擁有的商品也被推薦、文案還講假話。之後任何類似
  訊號（下一個是誰都一樣）都要先用 `computeAvailabilityMap` 或等效邏輯扣掉已擁有的
  部分，不能只看商品內容本身。
- **fallback／輔助訊號的權重上限只用滿分案例測不夠**——「零件推估不能贏過真實證據」
  這條規則，第一版測試只驗證了真實證據剛好滿分 100 的情況，但台灣本地小樣本的真實
  證據百分位可能只有個位數，這種低分真實證據反而會輸給拉滿的零件推估。任何「這個
  訊號不能贏過那個訊號」的規則，測試要覆蓋兩邊都是低分／極端值的情況，不能只測
  一邊拉滿。
- **零件層級聚合分數，要檢查「配置的身分零件」有沒有資料，不能只看有沒有任一零件命
  中**——stan-yao 資料只記錄 3 件式（上蓋＋固鎖＋軸心），完全沒有 CX 專屬零件
  （鎖定紋章／主刃／輔助刃／超刃）的紀錄。零件強度估算函式一開始只要任一零件命中
  就會給分，導致「上蓋本身從沒上過頒獎台，只是固鎖軸心剛好很常見」的配置被打出
  接近滿分的誤導分數。這是最終整支分支 review（不是逐任務 review）才抓到的問題——
  逐任務 review 的合成測試資料剛好都讓身分零件命中，沒測到這個真實資料的落差。
- **這輪的 SDD 執行在 git worktree 裡建立，但 worktree 用 `EnterWorktree` 建立時預設從
  `origin/<default-branch>` 分支（`fresh` 模式），不是從本地當時的 `main` HEAD**——
  當時本地 `main` 已經領先 origin 5 個 commit（deck 分數修正＋規格文件），worktree
  一開始完全沒接到，跑了一次 baseline 測試發現少 4 條測試才發現。之後手動
  `git merge main --ff-only` 補上。以後在本地 main 已經有未推送 commit 的情況下建立
  worktree，先確認 worktree 分支有沒有接到那些 commit，不要預設一定有。

## 已知缺口

- BBXHub 只比對到 45/167 個零件（橋接表只有 101 筆常見零件英中對照，來自 stan-yao
  資料），冷門／新品零件目前沒有來源可以補英文↔中文對照。
- BBXHub 的逐配置固鎖／軸心明細沒接（頁面用全名如「Hexa」標軸心，跟圖鑑代號「H」的
  對照未查證），這輪只收了零件層級的 Tier。
- 六軸評估系統（`analysis.ts` 的 `BASE_BY_TYPE`）已確認是 4 類、24 個憑感覺編的常數；
  這輪把它「判強弱」的職責拔掉、換成零件強度分數與 `percentileScore`，但六軸「判定位
  ／打法形狀」（`assignRoles()`、`vs_attack`／`vs_stamina` 策略）的職責保留，因為
  stan-yao 資料沒有分軸標籤，訓不出六個獨立分數。六軸系統本身要不要整組拔除，
  仍待評估。
- 零件強度 fallback 的 0.3 權重**沒有回測驗證出前瞻相關性**（見上方「已驗證與未驗證」）
  ——使用者已決定先維持這個權重上線觀察，但這不是「驗證過所以可信」，是「資料量不夠
  /訊號太弱測不出來，先用著看情況」，之後有更多賽事資料再重新回測。

## 下一步（排序）

1. 等使用者對零件強度 0.3 權重的答覆（維持／降低／拔除）。
2. 六軸評估系統整組存廢——待評估，非阻塞。
3. BBXHub 比對率／逐配置明細補強（低優先，非阻塞）。

## 資料管線表

`stanyao-raw-records.json`（14,743 筆逐場進前三名次，只有正例沒有負例）→
`scripts/buildPartStrength.mjs`（展開 comboPartIds、按零件聚合進前三次數、套
`computePercentiles()` 同一套百分位算法）→ `part-strength.generated.json`（124 個
零件的百分位分數＋7 個低樣本警告＋118 個型錄裡完全沒賽果紀錄的零件）→
`catalog/partStrength.ts` 的 `getPartStrengthIndex()` → `deck.ts` 的
`estimateComboPartStrength()`（身分零件沒資料就回傳 `undefined`）→
`scoreDeck()`（真實證據優先、fallback 加下限不會輸；`evidence` 策略不吃 fallback）
與 `recommendations.ts` 的獨立 `partStrengthGain`（只算淨新增可用零件、與
`deckScoreGain` 脫鉤）→ 前台三種文字狀態（完整證據／零件推估／無資料）。
