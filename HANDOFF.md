# 交接筆記

最後更新：2026-09-20 UTC+08:00
交接原因：完成「獨立陀螺比較」與「下一包推薦」功能，已推送並部署；使用者準備另開新對話繼續做功能。

## 目前目標

等待使用者指定下一個功能。不要自行改動既有商品／零件資料管線或推薦模型的產品決策；先確認需求是否改變範圍。

> 2026-09-20 續作：已改為台灣競技向推薦。`src/domain/competitiveMeta.ts` 將台灣 Catalog 的完整 3on3 賽果與版本化全球 Top Cut 快照合併，3on3 候選不再只取「新手」排序，下一包推薦只在能改善合法競技 3on3 時入榜，配裝器會揭露台灣優先／全球補樣本、日期與來源。初版的全球快照將未知完整牌組分母傳成 0，命中配置時會觸發統計防呆而崩潰；已在 `2a47ea0` 修正為安全下限，並加上購買模擬快取與競技相關商品預篩。Pages commit `6ca9654` 已部署且以新 bundle 線上確認。驗證為 435 Vitest passed、typecheck、build passed；線上 smoke 已確認手機開站／新增商品與 Service Worker，執行器的其餘 case 因本機 30 秒工具中斷未取得完整結果。後續若更新 Meta，禁止從零件 T 表推導完整配置戰績；未有來源的 Top 4／冠軍數必須維持 0，未知完整牌組分母由匯入層以出現次數作安全下限，前台不可顯示 meta share。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 程式發布 commit | `ff7fc37` — `feat: 新增獨立比較與下一包推薦` |
| `origin/main` | `ff7fc37`；已 push |
| 線上 Pages | `4d2da37`；已部署，公開頁新 JS 資產已驗證 |

## 已驗證與未驗證

- 已驗證（本次）：`npm.cmd test -- --run`（432 passed）、`npm.cmd run build`、Playwright 驗收（44 passed）、GitHub Pages 公開資產與新功能字串 smoke check。
- 下次有 UI 大改時：再跑完整 `npm.cmd run test:e2e`，必要時跑截圖並人工看圖。

## 阻塞

無外部阻塞。

## 下一個具體動作

讀完本檔的「本次完成功能與不可回退的決策」，再依使用者的新需求實作、測試、`git push origin main`，最後執行 `npm.cmd run deploy:pages`。

## 本次完成功能與不可回退的決策

### 1. 獨立的「比較」第六頁

- 底部導覽第六個 Tab 是「比較」，路由為 `/compare`；推薦頁不是第七個 Tab。
- A、B 是兩個獨立配裝器：各自可選「我的零件／全部圖鑑／假想零件」、標準或 CX 結構、已儲存／可組配裝，以及逐零件微調。
- 從配裝頁按「拿這套去比較」只會預填 A；A 仍可繼續微調，B 不受影響。比較結果固定在兩個配裝器下方；桌機雙欄、手機直向。
- `PartPickerField` 新增 `idPrefix`，比較頁的測試識別為 `slot-trigger-a-bladeId`、`slot-trigger-b-bladeId` 等。不要拿掉前綴，否則兩套欄位會撞 DOM id／測試選擇器。
- 對打結果是模型推估，文案不可寫成真實勝率保證。現有 `compare.ts` 的對打模型已在前一 commit `fc02691` 由單純平均改為 KO／存活路線模型；不要改回 50/50 或六軸直接平均。

### 2. 「下一包推薦」：固定內容前五、隨機包分開

- 完整頁路由 `/recommendations`，首頁有「下一包推薦」區塊只顯示第 1 名並連到完整前五；首頁快捷操作也有入口。
- `src/domain/recommendations.ts` 的 `recommendNextProducts()` 會以現有可用庫存，模擬「再多買一盒」每個固定內容商品後的配裝變化。
- 排名順序：平衡 3on3 分數提升 → 整體強度峰值 → 攻擊／持久／穩定峰值 → 新主力候選數。沒有價格、稀有度或「最划算」判斷。
- 推薦理由必須指出實際新增零件、可補強的角色或新增主力候選；只可稱「模型／模擬」，不可稱實戰保證。
- 已經持有的商品**不是一律排除**：只有再次購買能確實增加可用配置、整體強度或 3on3 時才可入榜，畫面標為「補足份數」。
- Random Booster 絕不可混進前五排名；在同頁「隨機包：可能補到的零件（不排名）」獨立列出，並清楚說明單盒不能保證。
- 現行模型為效能上限取整體強度前 42 套候選、再取平衡 3on3；若未來庫存變多造成首頁變慢，先做 memo／背景計算或快取，**不要**為了快而改成用商品零件數或價格排序。

### 3. 強度排序的共用基礎

- `BuildableSortKey` 新增 `strength`，權重是攻擊 20%、防禦 15%、持久 20%、爆發 15%、抗爆 15%、穩定 15%。
- 這是「整體配裝強度」的模型指標，已顯示在可組配置排序，也供推薦器使用；不是官方數值、不是勝率。

## 怎麼跑（package.json 看不出來的那幾條）

- 改了 `src/catalog/sources/` 底下任何檔案 → 一定要跑 `npm run build:catalog`，否則 `catalog.generated.json` 不會更新，畫面看起來像沒改到。
- **任何 Catalog 公開資料有變動（含隨機款式、圖片、相容性、賽事、中文名），都必須遞增 `scripts/buildCatalog.mjs` 的 `CATALOG_VERSION`，再跑 `npm run build:catalog`。** App 只在版本不同時重載 Catalog；忘記升版會讓既有裝置持續使用 IndexedDB 的舊公開資料，即使已清 Service Worker／瀏覽器快取。
- 跑 e2e 前先 `lsof -ti:4173 | xargs kill -9`。設定是 `workers: 4`；若資源競爭造成 timeout，先降到 2，不要加 retries。
- `npm run test:e2e` **前面不要自己加 `npm run build`**，webServer 自己會 build。
- 順序固定：**測試 → 截圖 → 看圖**（`playwright test` 開跑會清掉 `test-results/`）。
- push 完一定接 `npm run deploy:pages`，再跑 `npm run test:live`。

## 踩過的坑（不看這節就會重蹈）

**測試與工具**
- **4173 殘留的 preview 會造成整批假綠或假紅**：`reuseExistingServer` 會接上舊的 dist。
- **`toHaveText('可用 ×3')` 裡的空白是 JSX 字面空白**：改成 flex + gap 兩個節點，`textContent` 會變成「可用×3」，四條斷言直接紅。
- **`getByRole('cell', { exact: true })` 比對的是 accessible name**：比較表項目名那一格加任何字或標籤，8 條斷言全紅。
- **`getByRole('heading', { name })` 預設是子字串比對**：新 Section 標題不能是既有標題的字首（「資料來源」vs「資料來源與致謝」就會撞）。
- **`getByLabel` 也是子字串比對**：新增的 `aria-label` 只要含「上蓋」「固鎖」「軸心」「主刃」「配裝 A」就會撞出 strict mode violation。
- **fullPage 截圖會把 fixed 底部導覽畫在畫面中段並遮住該處文字**：那是截圖假象，判斷前先用 DOM `innerText` 確認（曾因此誤判「內含零件顯示成 -」，實際是正確的「F」）。
- **代理會自己起 server、`pkill vite preview`、`rm -rf dist`**：派出去之後不要動同一個工作樹，否則會互相弄死（曾因此白跑兩次全套 e2e）。
- **`vite preview` 只綁 `::1`**：playwright 設定已加 `--host 127.0.0.1`。
- **Windows 的 `deployPages.mjs`**：環境變數在腳本裡設，`shell: true` 只給 npm 用；git 用 shell 會把 commit 訊息照空白切開。

**產品決策（不要「修」回去）**
- **Catalog 資料更新一定要升版**：曾補入 21 款隨機強化組的 94 個款式卻保留 r5，導致新裝置正常、既有裝置的 E 軸只顯示固定商品，沒有抽選來源。根因是 `appStore.init()` 以 Catalog 版本決定是否覆寫公共資料，而「重新載入最新版」只會清 Service Worker 與 Cache Storage，不會刪使用者的 IndexedDB。修正方式是 r5 → r6；另有整合測試守住「新款式載入、個人庫存與配裝仍保留」。
- **重量整個拔掉了**：同款零件個體差異比配裝差異大，顯示或計分都是誤導。資料還在 `beybladehub-stats.json`，只是不顯示、不進模型，而且有一條 e2e 巡邏守住「畫面上不得出現『重量』兩個字」。
- **一體式上蓋的固鎖欄位是鎖死變灰、不是消失**（`getBuilderSlotSchema()` + `lockedSlotReason()`）。直接消失會讓人以為畫面沒反應。
- **`heightCode` 不能接 `statFieldLabel`**：那讀的是 `statsProvenance`（社群實測），而 `heightCode` 是官方商品名裡的數字。接上去等於把官方資料標成社群。
- **`/part?id=` 與 `/product?id=` 不要加進假名巡邏 `ROUTES`**：規格第 147 行寫明「詳細頁才可顯示日文／英文次要名稱」，詳情頁的「其他名稱：ドランソード3-60F」是合規的。加進去會把合規欄位判成違規，接著就會有人砍掉它來換測試綠。
- **商品卡圖片要過 `assetUrl()`**：Pages 是子路徑，直接用 `/img/...` 會 404。守門在 `tests/live/live.spec.ts`（本機 base 是 `/`，重現不了）。

## 已知缺口

| # | 缺什麼 | 為什麼還沒做 |
|---|---|---|
| A | 4 顆 CX 上蓋仍合併（雄鹿之角、海怪扭動、大黃蜂堡、龍神勇氣），標 `cxFused` | 社群站零件頁還沒收錄它們的紋章與主刃。站方補上就會自動拆，比對中文名，不必改程式 |
| B | 3 筆商品解析不出零件（`bxa02`、`bx00-jtm`、`bx00-jsq`） | 名稱裡沒有固鎖代號也不是一體型。內容已人工補上 |
| C | 3 筆賽事配置解析不出：巨鯨鞭打、帝王極變、古屍詛咒 | 圖鑑缺紋章／主刃／上蓋。另外 `P.H` 這種帶點的寫法解析器還沒處理 |
| D | 套裝內容靠 `beybladehub-curated-sets.json` 人工維護 | 自動抓取分不出「內容」與「推薦搭配池」 |
| E | 圖片 `usageStatus` 仍是 `unknown`，`public/img` 9 MB 進了 git | 要嘛取得授權，要嘛改成部署時才抓 |
| F | 共用代號零件（輔助戰刃 `T`）的來源標記偏保守，一直是 `community_only` | `ensurePart` 會沿用既有那顆，要精確得讓 provenance 可合併升級 |

## 長期技術／資料待辦（需使用者確認優先序）

1. **缺口 C 補 3 顆缺件**。補完賽事證據更完整，首頁「賽場正在用什麼」才有機會顯示真正的 G1 場次（目前唯一的 G1 沒有完整映射的牌組，所以顯示的是社群賽事）。
2. **`Quantity` 快速連點會遺失更新**：連點 5 次「+」只加到 3。`onChange` 用 render 當下的 `value` 算 `next`，多個 handler 用同一個尚未更新的值。`ProductsPage` 與 `ProductDetailPage` 兩處都有。改成函式式更新，或樂觀 UI + 佇列化寫入。
3. **`stock` 與 `availability` 合併成一次查詢**：目前是兩次獨立的 `allLots()`，理論上有極短的 key 集合不一致視窗（機率極低、下次 refresh 自動修正）。
4. **3on3 手動組隊器**（設計稿 `Deck.dc.html` 畫的三槽角色卡）。那是新功能不只是改版，**做之前要先問使用者**。
5. E、F 是長期議題，沒有外部條件配合做不完。

## 資料管線表

`scripts/buildCatalog.mjs` 讀這些，產出 `catalog.generated.json` 與 `catalog-audit.json`：

| 來源檔（`src/catalog/sources/`） | 內容 | 產生方式 |
|---|---|---|
| Takara Tomy 商品一覽（PSV） | 官方商品名與型號 | 人工貼上 |
| `beybladehub-stats.json` | 264 筆零件的類型／迴轉／接觸／中文名／圖／說明 | `fetchHubStats.mjs` |
| `beybladehub-structure.json` | 零件分類結構、補充零件清單 | 人工＋抓取 |
| `beybladehub-curated-sets.json` | 人工彙整的套裝內容 | 人工 |
| `beybladehub-sets.json` | 自動抓到的套裝內容 | `fetchHubSetContents.mjs` |
| `beybladehub-tournaments.json` | 台灣賽事與名次 | `fetchHubTournaments.mjs` |
| `beybladehub-tier-ratings.json` | 高手評級 | `fetchHubTierRatings.mjs` |
| `beybladehub-modes.json` | 4 個可切換模式的零件 | 人工（附原文引述） |
| `beybladehub-accessories.json` | 10 筆配件台灣中文名與分類 | 人工逐字查證 BeybladeHub 商品頁 |
| `takaratomy-random-boosters.json` | 21 款隨機強化組、94 個官方可能款式 | 人工逐份讀 Takara Tomy 產品說明書 |
| `part-compatibility-notes.json` | 零件搭配限制（目前只有時鐘幻象） | 人工（附兩來源與分歧說明） |
| `images.local.json` | 遠端圖到本機副本的對照 | `fetchImages.mjs` |

規模：商品 149、零件 242、隨機商品 21 款／官方款式 94、圖 374 全本機化、賽事 23 場（10 場完整 3on3 牌組共 14 副、
13 場單顆名次觀測共 93 筆）。

隨機強化組不寫入固定內容、不納入「最划算」；官方已確認的款式只顯示在「可能抽到（非保證）」。

## 2026-09-20 Compare 實戰改造：暫停點

使用者要求明天續作；**目前不要提交、推送或部署**。工作樹刻意保留 3 個未提交檔案：

- `src/domain/analysis.ts`：移除「高度固定換成攻擊／穩定／持久分數」；高度必須在兩組完整配置互動時判讀。
- `src/domain/practice.ts`：新增全目錄零件的實戰檔案層。它會為每個已選零件建立來源、限制與 CX 結構注意事項；來源目前有阿土、維辰孔丘、台灣天梯情報站與 BeybladeHub。它嚴格區分 T 表／賽事名次／逐局對戰，現階段沒有足夠可核對的 A 對 B 逐局影片，故回傳 `insufficient`，不會造假 W–L。
- `src/ui/pages/ComparePage.tsx`：已接入實戰結論、高度時間線、A/B 的全部已選零件實戰檔案、可展開來源。剛補上 `PracticeProfiles`，下一步必須先跑 typecheck／tests/build。

明天建議順序：

1. 跑 `npm.cmd run typecheck`、`npm.cmd test -- --run`、`npm.cmd run build`，先修所有編譯或既有測試落差（高度靜態分數移除可能影響 `compare.test.ts` 的預期）。
2. 擴充 `practice.ts` 的人工審核資料：只將可辨識雙方完整配置、賽制／盤型、勝者與時間戳的影片加入 `MatchupObservation`；須至少 5 局、2 個獨立原始影片後才升級為實戰 W–L。不可把 BeybladeHub 賽事名次當成對戰戰績。
3. 為阿土、維辰、RENLIgames 與台灣賽事補逐條零件／完整配置觀察；轉貼與彙整站要指向原始來源，不能增加獨立樣本。全 242 個零件都保留檔案，資料不足則顯示資料有限。
4. 加 `tests/unit/practice.test.ts`，測全零件 profile、A/B ratings 不互相覆蓋、相同／相近／大高度差、缺高度、CX、資料不足不輸出勝率；再補 Compare UI 測試。
5. 完成後依使用者既有指示直接 commit、push、`npm.cmd run deploy:pages`，再做快取繞過的 Pages smoke check。

### 2026-09-20 續作完成

- 上述暫停工作已完成，這段以下的結果取代「目前不要提交、推送或部署」：可直接提交、推送與部署。
- `analysis.ts` 已移除高度的固定攻擊／穩定／持久加分；高度判讀改在 `practice.ts` 以 A/B 完整配裝輸出開局／中段／低轉速三段文字，差距一級時一律標為相近高度、不宣稱低方必然有效。
- `practice.ts` 已為任何 Catalog 的已選零件建立檔案，支援標準三件式、CX 紋章／主刃／Over Blade／輔助刃、一體式零件。每檔案都保留 Catalog 來源、高手聚合評級與可回查 T 表；未命中評級的冷門零件明示資料有限，不借用熱門零件的結論。
- 新增 `MatchupObservation` 的人工逐局資料規格與門檻：完整相同的 A/B 配置，至少 5 局、2 個獨立原始影片來源才顯示 W–L。現有 `matchupObservations` 刻意是空的，因為已研究影片未能可靠辨識每局雙方完整配裝；賽事名次、T 表與影片標題絕不偽造為對戰勝負。
- Compare UI 新增：實戰證據結論、高度互動時間線、A/B 所有已選零件實戰檔案、阿土／維辰孔丘／台灣天梯／BeybladeHub 可展開來源，以及每個命中零件的高手／T 表連結。
- 驗證完成：`npm.cmd run typecheck`、`npm.cmd test -- --run`（23 files / 440 tests）、`npm.cmd run build`；單一桌機 Compare Playwright 驗收通過。整組 E2E 曾因執行工具硬性 30 秒中斷，不能標為完整通過。
- 已部署 Pages commit `05d575b`。部署工具確認 gh-pages 推送成功；本機公開站 smoke request 因 Windows TLS 憑證錯誤失敗，尚未能獨立確認 CDN 已換新 bundle。

### 2026-09-20 Compare 實戰資料第二次修正（待 commit／push／deploy）

- 使用者正確指出：只顯示「0 局」和泛用來源不是可用的比較功能。現在 Compare 會直接吃 Catalog 的台灣賽事「單顆前四名配置觀測」，而非只列一堆來源名稱。
- `src/domain/practice.ts` 新增 `TournamentPracticeEvidence`：每一側先查「完整配置相同」的賽場紀錄，再查「同上蓋、但固鎖或軸心已更換」的上位替代；兩種紀錄絕對分開，後者不能被當成使用者當前配置的成績，也不能當 A 對 B 勝率。這同時支援標準、CX 與固鎖一體式結構。
- `src/ui/pages/ComparePage.tsx` 將排序改為：實戰證據結論 → 賽場上位替代（帶賽事、日期、名次、原始頁連結）→ 高度時間線 → 零件檔案／來源 → 收合的補充模型。模型 49/51 不再搶走實戰資訊。
- 子彈獅鷲這類固鎖一體式上蓋不再被誤報「固鎖高度資料不足」：它本來就沒有獨立固鎖／高度碼，畫面改為說明不可把它與對方的 60／70／80 直接對比，並改以接觸面、分離機構與軸心作待驗證對位。
- 已驗證的真實資料例子（只作配置／名次證據）：漢謚 118 人交流賽的鳳凰飛翼 3-70J 亞軍、子彈獅鷲 M 季軍；羽智波 T2 盃的子彈獅鷲 H 冠軍與亞軍。它們會在選到相同上蓋時出現在「同上蓋替代」，不被說成鳳凰 9-60H 或子彈 GF 的戰績。
- 逐局 W–L 的門檻及空資料仍保留。研究已找到 Yi HSY 的「鳳凰飛翼 7-60Nr 實測 9 顆賽場配置」影片，描述中有子彈獅鷲 H 的時間點，但尚未取得可辨識全部回合配置與勝負的逐局片段，因此沒有不誠實地灌入 `MatchupObservation`。
- 本次驗證：`npm.cmd run typecheck`、`npm.cmd test -- --run`（23 files / 441 tests）、`npm.cmd run build`、Playwright 桌機寬度 44/44。手機完整套件因執行工具 30 秒上限中斷，不能標為完整通過。
- 下一步：依既有使用者授權直接 `git add`／commit／`git push origin main`／`npm.cmd run deploy:pages`；部署後不要宣稱已新增逐局影片 W–L，除非人工完成影片逐回合摘錄。

### 2026-09-20 Compare 高度 0 修正（待 commit／push／deploy）

- 使用者貼出比較表後發現：子彈獅鷲這類一體式上蓋在舊表中被顯示為高度 `0`、差 `60`。這不是資料值，而是 `compare.ts` 將缺少 `heightCode` 用 `?? 0` 代入靜態表格的錯誤。
- 已從 `compareCombos()` 的數字表移除「高度」列及舊 `heightMatchupZhTW`；前台標題改為「六軸與資料比較」。高度只保留 `practice.ts` 的完整 A/B 高度互動時間線，整合式結構會明說沒有獨立固鎖高度碼、不可與 60／70／80 作假數字比較。
- 同時移除了 `estimateOperationDifficulty()` 依 60／75 高度碼固定加減的隱性規則，和配裝協同文字中「低位不容易被打飛／高位較穩」的靜態斷言。現在只顯示原始高度碼，並說明需配合對手、盤型與實戰判讀。
- 驗證：`npm.cmd run typecheck`、`npm.cmd test -- --run`（23 files / 438 tests）、`npm.cmd run build`、Playwright 桌機寬度 44/44。接著直接 commit、push、deploy。

### 2026-09-20 Compare 操作難度箭頭修正（待 commit／push／deploy）

- 使用者接著指出「操作難度 65 ↑」的箭頭語意也錯：操作難度是數字越低越容易，沿用其他欄位的上箭頭會暗示高分較好。
- `ComparePage` 現在在勝出的操作難度格顯示「較易」，其他高分較優的模型欄才保留 `↑`。
- 驗證：typecheck、438 tests、build、Playwright 桌機 44/44；依既有授權直接發布。

### 2026-09-20 Compare 舊賽事 0 統計移除（待 commit／push／deploy）

- 使用者繼續貼出的 `賽事證據 0 / 0` 是舊靜態表只看「完全相同配置」的結果，無法反映上方已新增的同上蓋賽場替代，會錯誤暗示整頁沒有實戰資料。
- 已從六軸模型表移除「賽事證據」與「資料可信度」。實戰資料只在上方的「賽場上位替代」卡中呈現完整相同／同上蓋替代、名次、日期與來源連結；不再用兩個 0 與實際資料互相矛盾。
- 驗證：typecheck、437 tests、build、Playwright 桌機 44/44；依既有授權直接發布。

### 2026-09-20 PWA 舊比較頁快取防護（待 commit／push／deploy）

- 使用者貼出的整頁內容仍是部署前 bundle：缺「賽場上位替代」，卻有已刪除的高度 0、舊高度互動與靜態賽事 0。直接以 `curl` 查 Pages，遠端 `index.html` 已正確指向當前 bundle，因此根因是使用者端舊 Service Worker 的 navigation cache。
- 不再讓外掛自動產生簡化的 SW 註冊碼。`vite.config.ts` 改 `injectRegister: false`，`src/main.tsx` 手動以 `updateViaCache: 'none'` 註冊並呼叫 `registration.update()`；SW controller 改變時只 reload 一次。這讓未來更新不受 GitHub Pages HTTP 快取影響，且不會動 IndexedDB 庫存。
- 本次使用者仍須在首頁或設定頁按一次「重新載入最新版」來清掉**舊** SW；按鈕只刪程式快取與 SW，不刪庫存／已存配裝。
- 驗證：typecheck、437 tests、build、Playwright 桌機 44/44；依既有授權直接發布。

### 2026-09-20 Compare 可用結論改版（待 commit／push／deploy）

- 使用者指出目前 Compare 雖有上位替代，但其餘區塊仍是「資料攤列」：實戰證據沒有回答怎麼選、零件檔案是泛用句、高度時間線太籠統、影片沒有直接開啟連結、六軸沒有統整結論。
- `ComparePage` 已改為先呈現「對戰統整：怎麼選」：清楚顯示模型暫時傾向、A/B 各自必須走成的贏法與條件式選擇建議。它緊接可驗證實戰證據，並明確標示為模型而非 W–L。
- `compare.ts` 的模型輸出新增可稽核拆解：擊出壓力（攻擊 × 0.6 + 爆發 × 0.4）、拖時間能力（持久為主，加入穩定／防守／抗爆並扣對手擊出）、操作難度。高度、賽事名次、T 表絕不混進模型。模型區塊改為直接可讀、不再收合。
- 「高度互動時間線」改名為「高度／接觸位：可判讀範圍」，每段明確用可確認／不能確認／不能推論界定資料邊界；70 對 80 被寫成相近高度，不宣稱低打高必然有效。一體式結構明確不是高度 0。
- 零件檔案改為各零件可核對的規格、高手評級／來源與限制，不再按零件類別重複泛用效果句；影片／社群來源改成每筆都有具名的直接開啟按鈕（阿土、維辰孔丘、台灣天梯、BeybladeHub）。
- 「換掉的零件／差異」改為「關鍵變因：這些差異會改什麼」，把上蓋／固鎖／軸心對應到下一輪應如何固定變因測試；「六軸與資料比較」改成原始資料，明示它不單獨決定勝負。
- 尚待完成：執行完整驗證後，依使用者既有授權直接 commit、push、`npm.cmd run deploy:pages`。不應聲稱新增了完整逐局影片 W–L；本次是把現有可驗證資料與模型輸出整理成可用結論。

## 2026-09-20 Compare 真實模型重建（最新方向）

### 使用者最終判斷

目前 Compare 的比較結果、對戰統整、高度文字、零件檔案、模型拆解、關鍵變因與六軸都沒有足夠實戰參考價值。固定列出的阿土／維辰／資料站連結也不符合需求；影片必須與使用者當下選到的完整配置或零件真正相關。

### 已確認的根因

- `analysis.ts` 的六軸不是實戰資料：只有攻擊／防守／持久／平衡四組固定模板，再以上蓋 50%、軸心 30%、固鎖 20% 混合。不同零件只要類型相同，就會產生相同或近似分數。
- `compare.ts` 的擊出壓力、拖時間與百分比只是再次計算上述六軸，沒有新增實戰證據；`practice.ts` 的 `matchupObservations` 仍是空陣列。
- 六軸不只影響 Compare，也支撐配裝器排序、「我能組什麼」、3on3 角色與隊伍評分、首頁購買推薦和配裝優缺點。重建時必須盤點所有 `analysis.scores` 使用點，不能只改 Compare，也不能暗中退回舊公式。
- 現有賽事資料是上位名次／配置出現，不是逐局 A 對 B，不能當對打標籤。

### 已決定的資料策略

採用「公開影片人工標註＋玩家自己的逐局紀錄」。每局至少記錄 A/B 完整配置、勝方或平手／無效局、Xtreme／Over／Burst／Spin、盤型、賽制、日期、來源影片與時間點；玩家測試另記資料可信等級。

但目前網站是純 GitHub Pages＋本機 IndexedDB，沒有後端；玩家紀錄不會自動彙集。第一版應採：本機記錄 → 匿名 JSON 匯出 → 人工審核 → 併入 repo 的版本化資料集 → 離線訓練 → 部署唯讀模型 JSON。不要在資料流程尚未證明價值前先擴張後端。

### 模型與上線門檻

- 先做可解釋、具正則化且 A/B 對調必須互補的成對勝負基準模型；另預測各勝利方式，不能把不同計分全部壓成單一勝負。
- 訓練／驗證必須按影片、玩家或日期分組；同一影片的多回合不能被拆到訓練和測試兩側，也不能冒充多個獨立來源。
- 必須勝過「永遠猜熱門配置」及「只看上蓋」等基準，並檢查 log loss／Brier score、校準與跨來源表現。未達門檻就不顯示模型預測。
- 新零件、冷門配置、未知盤型或超出訓練分布時必須拒絕預測；不能再用官方類型或六軸補值。每次模型需有資料版本、訓練日期與測試報告。
- 玩家本機未驗證紀錄、附影片紀錄、人工審核資料不能同權訓練；須防止單一玩家或單一來源支配模型。

### 產品重建順序

1. 先停用 Compare 會誤導的百分比、對戰統整、高度泛用文字、零件檔案、模型拆解、關鍵變因與靜態六軸；無合格資料時顯示「樣本不足，暫不預測」。
2. 建立逐局 schema、資料驗證器、本機對戰紀錄、匿名匯出，以及影片標註格式。影片只保存連結、時間點、命中配置和事實標註，不收錄或重新散布影片檔。
3. 影片按「完整 A 對 B／完整命中一方／同上蓋不同配裝／只命中單一零件」分級；畫面只顯示與當下選擇命中的影片及時間點。
4. 建立版本化資料集、訓練與評估管線；通過跨來源驗證後才重新開啟預測與特徵解釋。
5. 逐一替換 Builder、Buildable、3on3、首頁購買推薦等舊六軸依賴。3on3 必須在單顆模型成熟後另做牌序、零件不可重複、計分與對手 Meta 模擬，不能把三顆單勝率直接相加。

### 執行原則

- 不再調整舊六軸權重或改寫模糊文案來冒充改進。
- 不保證 242 個零件都有預測；沒有資料時誠實拒絕預測。
- 使用者已授權正常功能修改完成後直接 commit、push、deploy，不再詢問。
- 目前部署仍是 `d44d729`（main）／`05b0104`（gh-pages）；上述真實模型重建尚未實作。

## 2026-09-21 真實模型重建第一階段完成

- Compare 已停用舊六軸百分比、模型傾向、泛用贏法、高度時間線、零件泛用檔案、固定頻道清單、模型拆解與六軸比較表。完整 A/B 沒有合格模型時固定顯示「樣本不足，暫不預測」。
- 新增本機逐局紀錄：保存 A/B 完整配置、A 勝／B 勝／平手／無效局、Xtreme／Over／Burst／Spin、盤型、賽制、日期、玩家實測或公開影片來源、影片網址與時間點、備註。
- 證據分成 `local`、`video_attached`、`reviewed`；使用者新增的資料最多只能到 `video_attached`，不可自行標成已審核。本機計數可以顯示，但不會換算成勝率。
- IndexedDB schema 已升到 v4，新增 `battleRounds` 個人資料表；Catalog 更新不會清除它，完整備份／匯入也已包含逐局紀錄。
- Compare 只顯示與當前完整 A/B 相符的影片紀錄；不再固定列出阿土、維辰或 T 表。賽事前四名配置仍獨立列出，明示不是 A 對 B 戰績。
- 新增匿名逐局 JSON 匯出；刻意排除本機 id、建立時間、自由文字備註及玩家／裝置識別，保留人工審核需要的配置與事實欄位。
- 驗證：typecheck、24 files / 436 Vitest、build 通過。完整 Playwright 兩 worker 執行時有 81 passed、1 skipped，6 個手機冷啟動案例因舊 helper 的就緒競態失敗；App 加入明確 `data-app-ready` 後，這 6 個案例已定向重跑全過，Compare 手機／桌機定向 2/2 通過。Pages 已部署，線上 phone／desktop smoke 6/6 通過（開站、IndexedDB 寫入、Service Worker、圖片子路徑）。
- 下一階段：建立 repo 內的版本化人工審核資料集與匯入驗證器，再做分組訓練／評估管線。模型未通過熱門配置與只看上蓋基準、log loss／Brier／校準及跨來源檢查前，不得重新顯示預測。
