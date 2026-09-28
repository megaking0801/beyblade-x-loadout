# 交接筆記

最後更新：2026-09-28 UTC+08:00
交接原因：正式交接（拿掉 1v1、對戰紀錄收斂成純 3on3＋選裝手風琴重新設計，
全部完成並已上線；final review 進行中，見下方「阻塞」）

## 目前目標

這輪兩件事：

1. **拿掉 1v1**：使用者決定對戰紀錄只留官方 3on3 團體賽，1v1 練習模式
   整個刪掉。`BattleMatch` 從上一輪的 discriminated union
   （`mode: '1v1' | '3on3'`）收斂回單一形狀（沒有 `mode` 欄位，`a`／`b`
   固定是 3 套配裝陣列）。使用者明確同意**舊資料整批清空**（不管是舊的
   1v1 紀錄還是上一輪的 3on3 紀錄，形狀都跟新形狀不相容）——IndexedDB
   v8→v9，migration 直接清空 `battleMatches` 表。
2. **選裝畫面改手風琴**：原本 A、B 各 3 隻陀螺全部展開（六張完整卡片），
   手機上非常長，改成收合列 + 點開才展開該格，同一側同時只有一格展開，
   已上場鎖住的格子永遠收合。查了 Pokémon team builder 手機版案例等
   UX 參考才定案，見 spec 第 2 節。

Spec：`docs/superpowers/specs/2026-09-28-3on3-only-accordion-design.md`
（這輪的型別收斂、migration、手風琴設計）＋
`docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`
（上一輪的 3on3 計分規則本身，仍然有效，這輪沒改計分邏輯）。

`TeamBattleLog.tsx` 併回 `BattleLogPage.tsx`（不再需要因為兩種模式拆成
兩個元件），沒有模式切換按鈕，`BattleLogPage` 就是整個對戰紀錄功能。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨，僅一個跟本輪無關的既有殘留（見下方「已知缺口」最後一條） |
| 本機 HEAD | `1c24167` |
| `origin/main` | `1c24167`（一致） |
| 線上 Pages | `07ae350`（`1c24167` 只改測試檔跟 spec 文件，沒有前台程式
  變更，不用再部署，線上版本維持不變） |

## 已驗證與未驗證

- `npx tsc -b`：通過，乾淨無輸出（final review 修復後再次確認）。
- `npm test`：**487/487 全過**（final review 修復後再次確認；1v1 相關
  測試刪除後總數下降是預期的）。
- `npm run test:e2e` 全套（非過濾，final review 修復後重跑）：
  **99 passed, 1 skipped**（skip 是既有 WebKit 離線測試已知 flake，
  跟本輪無關）。
- `npm run shots`：final review 修復**之前**跑的，已用 Read 工具確認
  `phone-battle-log-setup.png`（手風琴展開＋收合並存的樣子）、
  `battle-log-scoring.png`、`battle-log.png`（存檔後歷史紀錄／零件勝率表）
  都正常顯示，沒跑版；final review 修復沒動畫面，截圖不用重跑。
- `npm run deploy:pages`：完成，gh-pages `07ae350`（final review 修復
  沒有前台程式變更，這個部署版本仍是最新）。
- `npm run test:live`：**6/6 全過**（phone/desktop 各 3 條：可開啟＋加商品、
  service worker 註冊、圖片路徑）。

## 阻塞

無。

## 下一個具體動作

無待辦。

## Final review 發現與修復

fresh opus subagent 審查 `e308e8e..a003c0f`（3 個 commit：型別收斂、UI
併入手風琴、e2e 改寫），結論：**無 Critical、無 Important，可以合併**，
7 個 Minor。逐一驗證後修了 3 個真的有價值的，其餘記錄 deferred：

- **Minor 1（已修）**：拿掉 1v1 那批測試時，連帶刪掉了唯一驗證
  `battleMatches` 真的能流到 `BuilderPage` 零件勝率狀態行的 e2e 測試——
  那條測試本身不是 1v1 專屬，是共用路徑，補回來（3on3 版本）。
- **Minor 5（已修）**：v8→v9 migration 測試原本只塞一筆舊 1v1 形狀的
  紀錄，spec 講的是「不管 1v1 還是 3on3 都要清空」，兩種形狀都要測到，
  補了一筆舊版 union 形狀的 3on3 紀錄；另外補了「點擊已展開的格子會
  收合」的 e2e 斷言（原本只測過「切到別格」，沒測過「收合原本那格」）。
- **Minor 2（已修，改 spec 不改程式碼）**：spec 原本寫收合列要有縮圖，
  實作沒做——三個零件名稱本身就有辨識度，縮圖要選三顆裡哪一顆代表也沒
  明顯答案，判定不補縮圖，改 spec 文字跟實作對齊，並記下為什麼。
- Minor 記錄到 deferred（不修）：匯入舊版備份時沒有提示使用者舊對戰
  紀錄會被丟棄（跟既有匯入行為一致，非本輪新問題）；升版後歷史紀錄
  UI 直接顯示空清單，沒有額外提示「舊資料已清空」（使用者已同意清空，
  UI 沒有誤導成「還在」，屬於可以接受的沉默）；`aria-expanded` 沒配對
  `aria-controls`（無障礙細節，跟核心正確性無關）。

## 怎麼跑（非顯而易見的）

- 這輪沒有走完整 SDD（沒開 `.superpowers/sdd/` ledger、沒寫獨立 plan
  文件）——brainstorming 對話定案後直接照 TDD 紀律做（每個檔案改完跑
  `tsc -b`／對應測試，紅燈先確認再修），plan 相關的細節（migration 設計、
  手風琴互動規則）都寫進了 spec 本身，不是分散在 ledger。
- `BattleLogPage.tsx` 現在是整個對戰紀錄功能唯一的檔案（沒有
  `TeamBattleLog.tsx` 這個獨立元件了），`TeamSideEditor` 是這個檔案內部的
  手風琴子元件，不是共用元件，不要去 `ui/components/` 找。
- 手風琴的「展開」狀態（`expandedA`／`expandedB`）跟「鎖定」狀態
  （`foughtCount` 算出來的 `lockedCount`）是兩個獨立變數：`expanded`
  的判斷式是 `!locked && expandedIndex === index`——鎖定永遠贏，不管
  `expandedIndex` 剛好是不是那個索引，已上場的格子都不會顯示成展開。

## 踩過的坑（這輪新增）

- **這是這個檔案第三次記錄同一類坑：改 IndexedDB schema 版本時，除了
  `DB_SCHEMA_VERSION` 常數，測試檔案裡每一條寫死 `expect(db.verno).toBe(N)`
  的既有斷言都要一起找出來改**——這輪 v8→v9，又漏了一條完全獨立的
  「IndexedDB v5 migration」測試（寫死 `toBe(8)`），被 `npm test` 全套跑
  才抓到。這次有記取教訓：改完立刻 `grep "verno).toBe("` 確認全部一致，
  這條指令值得寫進日常改 schema 版本的固定動作，不要每次都等測試爆炸
  才想到要 grep。
- **Dexie 的 `.upgrade()` 裡直接 `tx.table(x).clear()` 就能整表清空**——
  不用先 `.toCollection().toArray()` 再逐筆刪，一行 `clear()` 搞定，
  跟 v5 那次「battleRounds: null」（整表刪除定義）不同——這次要保留表
  結構（下一版還要用同一張表存新形狀的資料），只是清空內容，用
  `.stores({...})` 保留表定義 + `.upgrade()` 裡 `clear()` 清內容，兩者
  分開處理。
- **拿掉一個 discriminated union、把型別收斂回單一形狀時，要記得回頭刪
  當初為了那個 union 才新增的周邊型別工具**——`DistributiveOmit`（標準庫
  `Omit` 對 union 不分流才需要的自訂型別）跟著 union 一起刪掉，
  `Repository.saveBattleMatch` 的參數型別改回普通 `Omit`。如果只刪 union
  本身、忘記清這些周邊工具，會留下「型別上合法但語意上死掉」的程式碼
  （`DistributiveOmit<NonUnionType, K>` 在數學上等價於 `Omit<...>`，
  tsc 不會報錯，但讀的人看不懂為什麼這裡需要一個「處理 union」的型別）。

## 踩過的坑（沿用既有，仍然有效）

- **`Row` 元件本身沒有上下 margin，只有 `Section` 有**——`ui.tsx` 的
  `Row()` 只是 `display:flex; gap; flexWrap`，垂直間距全靠外層
  `Section` 的 `marginBottom: 22` 或父層 `.stack`／`.card` 的 grid
  `gap`。在 `Section` 外面裸放連續好幾個 `Row` 或自訂 `div`，中間會是
  0 間距、疊在一起。新畫面／新區塊只要沒包在 `Section` 或帶 gap 的容器
  裡，一定要自己補間距，寫完務必截圖核對，不能只看 `tsc`／單元測試過。
- **`fullPage: true` 的截圖會把 `position: fixed` 的底部 tabbar 畫在畫面
  中段，疊住底下的按鈕**——純粹是全頁截圖的算圖方式問題，實機不會有這個
  現象，看截圖核對版面時記得這一條，不要誤判成真的 bug。
- **改 IndexedDB schema 版本時，`DB_SCHEMA_VERSION` 常數要跟 `db.version(N)`
  同步升級，兩者是分開的兩個地方**——改完可以直接 `grep DB_SCHEMA_VERSION`
  確認只有一個數字、跟最新的 `db.version()` 一致。

- **加分訊號的原始值域不含負數時，直接加總等於「有資料就加分，不管資料
  說的是好是壞」**——先找出值域裡代表「中性、沒有訊號」的那個點，加總前
  先減掉那個基準點，負面資料才真的能扣分，不能預設「有資料 = 加分」。
- **新增一個 IndexedDB 新表時，匯出／匯入備份不會自動涵蓋，要自己記得
  補**——`db.ts` 加新表，`BackupPayload`／`exportBackup`／`importBackup`
  三處要一起檢查，不能假設「資料存進 IndexedDB 就等於安全」。
- **舊表刪除後沿用同一個表名做完全不同的新功能時，舊備份裡同名欄位的
  資料形狀可能不相容**——匯入舊備份一定要先判斷 `schemaVersion` 再決定
  要不要讀那個欄位，不能同名就照單全收。
- **寫 plan 的程式碼範例前，一定要先讀元件的真實簽名（prop 名、參數順序），
  不能憑印象或憑語感編**——self-review 階段抓到過不存在的 prop 名。
- **e2e 斷言用純文字比對在畫面上有 `<option>` 或多筆重複資料時會撞到
  strict mode violation**——已全面改用 `data-testid` 而不是 `getByText()`
  來定位互動元件跟需要唯一識別的清單項目。
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

- **3on3 延伸賽（三場打完仍未到 4 分）不模擬官方的換陀螺順序演算法**——
  官方規則本身沒寫死怎麼換順序（比賽現場由雙方協調），這輪延伸賽只給
  通用、不綁定特定陀螺的加分介面，見
  `docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`
  第 7 節。
- **3on3 選裝不檢查「同一隊三隻陀螺不能用重複零件」**——那是
  `DecksPage` 隊伍組建階段的責任，`BattleLogPage` 是現場記分工具，不
  重新做一次驗證，刻意排除。
- **不整合已存的 `Deck`（3on3 隊伍）快速選裝**——對戰紀錄一律現場選
  6 套配裝，不會從 `DecksPage` 已存的隊伍清單挑一組直接帶入。
- **`FINISH_POINTS`（轉停 1／出界爆裂 2／極限 3）之後如果要調整，舊紀錄
  的比分會跟著重算變動**——沒有把每一分的實際點值存進 `BattlePoint`，
  歷史紀錄的比分是即時用目前的 `FINISH_POINTS` 常數算出來的，不是存檔當下
  凍結的快照。只要這個常數本身不變就沒事，但如果之後官方規則改了要調這幾
  個數字，舊紀錄的比分顯示會跟著變，這輪沒有做版本化快照。
- **個人對戰紀錄不做跨裝置同步／多人資料匯聚**——純本機 IndexedDB，別人裝
  這個 PWA 記錄的對戰你完全拿不到，是上一輪 spec 刻意排除的範圍，不是
  遺漏。
- **BBXHub 資料併進零件強度 fallback 已試過，兩種合併策略都沒通過回測，
  沒有合併**（詳細設計見
  `docs/superpowers/specs/2026-09-24-bbxhub-part-strength-merge-design.md`）。
  `mergePodiumCounts()`（`scripts/buildPartStrength.mjs`）兩種模式都已經
  寫好、保留在檔案裡，但沒有接進 `main()`。CX 配置維持沒有 fallback 的
  現狀。結論細節（sum 模式差距 0.094、percentile-average 模式差距 0.051，
  兩者都超出 0.05 容忍值判準）與判準本身的長尾定義模糊地帶，已記在上一版
  HANDOFF 歷史裡，重試合併前先看那份 spec。
- **`bbxhub-meta.json` 本身沒有任何程式消費它**——`grep -rln "bbxhub-meta" src/`
  無結果，前台 T 表走的是完全不同的
  `beybladehub-tier-lists.json`／`beybladehub-tier-ratings.json`。目前還是
  孤兒管線，不影響任何使用者看得到的東西。
- `.claude/worktrees/part-strength-fallback` 與根目錄 `context-audit-v2.md`
  是未追蹤／未 commit 的既有殘留檔案，跟本輪 SDD 無關，本輪沒有動它們，
  接手時不要誤以為是本輪產物；`src/catalog/catalog-audit.json` 目前也有一份
  未 commit 的既有修改，同樣跟本輪無關。
- 零件強度 fallback 的訊號方向已驗證有時間持續性，但只對特定訓練／驗證
  切分成立，賽事 meta 會隨新品發售、規則調整改變，之後要重跑回測再確認。
- `TYPE_WEIGHT`（上蓋 0.5／軸心 0.3／固鎖 0.2 的槽位權重）已測試過不支持用
  零件強度那套方法校正，維持現狀，不用再花時間。

## 資料管線表

`stanyao-raw-records.json`（14,743 筆逐場進前三名次，只有正例沒有負例）→
`scripts/buildPartStrength.mjs`（展開 comboPartIds、按零件聚合、套
`computePercentiles()`）→ `part-strength.generated.json` → `catalog/partStrength.ts`
的 `getPartStrengthIndex()`（模組層級快取）→ `deck.ts` 的
`estimateComboPartStrength()`（身分零件沒資料就回傳 `undefined`）→
`scoreDeck()`（真實證據優先、fallback 加下限不會輸）與 `recommendations.ts`
的獨立 `partStrengthGain`（只算淨新增可用零件）→ 前台三種文字狀態。

個人對戰紀錄：`BattleLogPage`（1v1，現場選 A／B 兩套零件）／
`TeamBattleLog`（3on3，現場選 A／B 各 3 套零件）→ `points: BattlePoint[]`
逐分記錄（`domain/battleRecords.ts` 的 `FINISH_POINTS` 算分、
`isMatchComplete()`／`matchWinner()` 判定，兩種模式共用）→
`repository.saveBattleMatch()`（未達 4 分擋存檔）→ IndexedDB
`battleMatches` 表（schema v8，`mode: '1v1'|'3on3'` 判斷形狀）→
`computePartWinRateIndex()` 算每顆零件勝率（1v1 整場歸屬、3on3 逐分
歸屬——見 `docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`
第 4 節）→ `deck.ts` 的 `personalWinRateGain`（減 0.5 置中之後才加總，
只用在 `balanced`／`vs_attack`／`vs_stamina` 三種策略，`evidence` 策略
排除）→ `BuilderPage` 狀態行與 `BattleLogPage` 零件勝率簡表。

CX 拆件：`scripts/buildCatalog.mjs` 的 `decomposeCxBlade()` 比對紋章＋主刃中文名
能不能拼出合併名稱，能拆就拆並用 `addAliasZhTW()` 把合併名稱補進兩顆零件的
`aliasesZhTW` → `catalog-audit.json` 的 `cxSplitBlades` 記錄拆件對照表 →
`domain/search.ts` 的 `searchParts()` 吃 `aliasesZhTW` 做比對。

零件類型比重：`analysis.ts` 的 `estimateTypeWeight()` 直接把零件 `type` 標籤
按槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權混合成四個百分比
（`distributeToHundred()` 用最大餘數法保證加總剛好 100）→
`ComboAnalysis.typeWeight` → `builder.ts`／`buildableRows.ts`／`deck.ts`／
`recommendations.ts`／`reasons.ts`／`BuilderPage.tsx` 全部消費端。
