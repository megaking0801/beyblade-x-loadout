# 交接筆記

最後更新：2026-09-18 23:10 UTC+08:00
交接原因：修正既有裝置未重載隨機強化組款式的 Catalog 版本問題，已部署。

## 目前目標

配裝器現在會將「保證取得」和「可能抽到（非保證）」完整分開列出；Catalog r6 會強制既有 r5 裝置重載公開款式資料。下一個優先項回到補 3 筆無法映射的賽事配置。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 程式發布 commit | `4649c39` |
| `origin/main` | `4649c39`；已 push |
| 線上 Pages | `36594fa`；已部署 |

## 已驗證與未驗證

- 已驗證（本次）：`build:catalog`、typecheck、單元／整合 427、production build；全圖鑑 242 個零件的固定／隨機商品來源稽核；E 軸線上版與手機版驗證；線上手機／桌機健康檢查。
- 待跑：下次有可部署的功能批次，再跑完整 e2e 與截圖。

## 阻塞

無外部阻塞。

## 下一個具體動作

再處理 3 筆賽事配置（巨鯨鞭打、帝王極變、古屍詛咒）。

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

## 下一步（排序）

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
