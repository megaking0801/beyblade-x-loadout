# 交接筆記

最後更新：2026-09-24 UTC+08:00
交接原因：一般交接（三批獨立修復都已驗證上線）

## 目前目標

這輪做了三件互不相關的事，全部上線且驗證過：

1. **零件強度 fallback 的 0.3 權重問題已有結論**：Task 7 舊回測問錯了問題（比較
   「已進前三」的名次分組，天花板效應測不出東西）。改測「時間持續性」
   （Spearman 排名相關係數＋隨機打亂對照組）後，訊號確認有效，方法論與結果記在
   規格第 50.6 節，不用再花時間校準 0.3 的大小（原因也寫在該節）。
2. **CX 合併零件（焰神滅世等 21 種）的搜尋缺漏已修復**：拆成紋章＋主刃兩顆零件後，
   只有短名可搜，官方外盒／賽事紀錄用的合併名稱搜不到。已補進 `aliasesZhTW`，
   21/21 驗證可搜到，見 `tests/unit/catalog.test.ts` 的回歸測試。
3. **比較頁（`/compare`）已整頁移除**：使用者判斷「模型沒有用」——其實這頁的
   模型推估半年前就已停用，只剩兩個配裝器並排＋各自查賽事紀錄，配裝器本身
   （第 17 節）已經有同樣的六軸與賽事證據顯示，維護成本大於價值。導覽、
   跨頁連結、對應測試、規格第 34 節都已同步更新為「已移除」。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨 |
| 本機 HEAD | `4778915` |
| `origin/main` | `4778915`，與本機一致 |
| 線上 Pages | 已部署，`gh-pages` commit `b0364e5`，`npm run test:live` 6/6 通過 |

## 已驗證與未驗證

- `npx tsc -b`：通過。
- `npm test`：456 tests 全過（含新增的 CX 合併名稱搜尋回歸測試，已用變異驗證
  ——故意還原程式碼確認會紅，改回來確認變綠）。
- `npm run test:e2e`：83 passed / 1 skipped（skip 為既有斷網情境測試）。比較頁
  移除後少了 5 條相關測試（原 88 條）。第一次跑遇過一次計時 flake（`openApp`
  的 navigation race），單獨重跑過確認不是這輪改動造成的。
- `npm run shots`：2 passed，人工看過畫面確認導覽列與首頁快速操作都沒有殘留
  「比較」入口。
- `npm run deploy:pages` → `npm run test:live`：都過。第一次跑 test:live 遇到
  GitHub Pages CDN 剛部署完的傳播延遲（圖片間歇性 503／破圖，兩次跑失敗的項目
  還不一樣），等一輪重跑後 6/6 全過——不是真的迴歸，純 CDN 傳播延遲。

## 阻塞

無。

## 下一個具體動作

1. 六軸評估系統整組存廢——待評估，非阻塞。
2. 累積更多新賽事資料後，重跑 `npm run backtest:part-strength` 確認零件強度
   持續性訊號沒有隨 meta 消失（沒有明確時間點，等資料量有感增加再做）。
3. BBXHub 比對率／逐配置明細補強（低優先，非阻塞）。

## 怎麼跑（非顯而易見的）

- `npm run build:part-strength`：重新跑零件強度資料管線。
- `npm run backtest:part-strength`：跑時間切分持續性回測，純 console 輸出。
- `npm run build:catalog`：重新跑型錄建置管線（含 CX 拆件與別名邏輯）。
- 其餘沿用既有規則（見 `CLAUDE.md`）。

## 踩過的坑

- **`stanyao-raw-records.json` 只有正例沒有負例**，也沒有「零件總共被用了幾次」
  的分母，算不出真正的機率——任何想拿這批資料做「預測」的功能，先檢查有沒有
  負例。細節與「零件層級聲量聚合」這個修正方向見規格第 50.1 節。
- **回測「比較哪幾組」的設計本身會決定測不測得出訊號，跟資料量無關**——比較
  「已經篩選過的同一批正例」（例如都已進前三的名次分組）容易有天花板效應，
  測出「沒有訊號」其實是問錯問題。任何相關係數結果都要先跑隨機打亂對照組
  排除方法論假訊號，細節見規格第 50.6 節。
- **加一個新的「證據補分」訊號時，gain 一定要算「淨新增」不是「商品裡全部
  零件」**，否則會打穿「沒有任何增益就不推薦」的防呆機制。任何「這個訊號不能
  贏過那個訊號」的規則，測試要覆蓋兩邊都是低分／極端值，不能只測一邊拉滿。
  零件層級聚合分數要檢查「配置的身分零件」有沒有資料，不能只看任一零件命中
  ——這三條全是零件強度 fallback 開發時踩的坑，細節見 commit `92757b5` 訊息。
- **刪除一個頁面時，`grep "<Link"` 抓不到所有殘留 import**——`DecksPage.tsx`
  的 `import { Link } from '../router.tsx'` 沒有匹配到 `<Link\|Link,` 這種
  grep pattern，是 `tsc -b` 的 unused-import 檢查才抓到。刪頁面／刪功能後
  務必跑一次 `tsc -b`，不能只靠 grep 確認乾淨。
- **刪功能前先查有沒有已經死掉的舊程式碼掛在同一個名字下**——`domain/compare.ts`
  的 `compareCombos()` 早就沒有任何生產程式碼在用（只剩它自己的測試在跑），
  是比較頁換成 `domain/practice.ts` 的 `buildPracticalComparison()` 之後留下的
  孤兒。順手一起清掉；以後刪功能前先確認同名／同主題模組有沒有類似的死程式碼。

## 已知缺口

- BBXHub 只比對到 45/167 個零件，逐配置固鎖／軸心明細沒接，冷門／新品零件
  沒有來源可補英中對照。
- 六軸評估系統（`analysis.ts` 的 `BASE_BY_TYPE`）已確認是憑感覺編的常數；
  「判強弱」職責已拔除換成零件強度分數，「判定位／打法形狀」職責保留（stan-yao
  資料沒有分軸標籤，訓不出六個獨立分數）。整組要不要拔除仍待評估。
- 零件強度 fallback 的訊號方向已驗證有時間持續性，但只對這次的特定訓練／驗證
  切分成立，賽事 meta 會隨新品發售、規則調整改變，之後要重跑回測再確認。

## 資料管線表

`stanyao-raw-records.json`（14,743 筆逐場進前三名次，只有正例沒有負例）→
`scripts/buildPartStrength.mjs`（展開 comboPartIds、按零件聚合、套
`computePercentiles()`）→ `part-strength.generated.json` → `catalog/partStrength.ts`
的 `getPartStrengthIndex()`（模組層級快取，見 `src/catalog/partStrength.ts`）→
`deck.ts` 的 `estimateComboPartStrength()`（身分零件沒資料就回傳 `undefined`）→
`scoreDeck()`（真實證據優先、fallback 加下限不會輸；`evidence` 策略不吃 fallback）
與 `recommendations.ts` 的獨立 `partStrengthGain`（只算淨新增可用零件）→
前台三種文字狀態（完整證據／零件推估／無資料）。

CX 拆件：`scripts/buildCatalog.mjs` 的 `decomposeCxBlade()` 比對紋章＋主刃中文名
能不能拼出合併名稱，能拆就拆並用 `addAliasZhTW()` 把合併名稱補進兩顆零件的
`aliasesZhTW`（同一顆紋章配不同主刃時會累加多個別名）→ `catalog-audit.json` 的
`cxSplitBlades` 記錄拆件對照表 → `domain/search.ts` 的 `searchParts()` 吃
`aliasesZhTW` 做比對。
