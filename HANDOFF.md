# 交接筆記

最後更新：2026-09-18

寫法規則見 `CLAUDE.md` 的「HANDOFF.md 怎麼寫」。這裡不寫「我做了什麼」，要看歷史用 `git log`。

## 現在狀態

- 上線：<https://megaking0801.github.io/beyblade-x-loadout/>（最後部署 `830e553`）
- 全綠：typecheck、單元 423 筆、e2e 83 過 1 skip、`test:live` 6 過
- 設計稿（`design-draft/` 11 張）已全部實作完

## 未推的在飛工作

無。工作區乾淨，本地與 `origin/main` 一致。

`830e553` 之後只改過文件（規格第 47 節、`CLAUDE.md`、這份檔案），沒動程式，
所以線上版就是最新的程式碼，不需要重新部署。

## 怎麼跑（package.json 看不出來的那幾條）

- 改了 `src/catalog/sources/` 底下任何檔案 → 一定要跑 `npm run build:catalog`，
  否則 `catalog.generated.json` 不會更新，畫面看起來像沒改到。
- 跑 e2e 前先 `lsof -ti:4173 | xargs kill -9`。
- `npm run test:e2e` **前面不要自己加 `npm run build`**，webServer 自己會 build。
- 順序固定：**測試 → 截圖 → 看圖**（`playwright test` 開跑會清掉 `test-results/`）。
- push 完一定接 `npm run deploy:pages`，再跑 `npm run test:live`。

## 踩過的坑（不看這節就會重蹈）

**測試與工具**
- **4173 殘留的 preview 會造成整批假綠或假紅**：`reuseExistingServer` 會接上舊的 dist。
- **`toHaveText('可用 ×3')` 裡的空白是 JSX 字面空白**：改成 flex + gap 兩個節點，
  `textContent` 會變成「可用×3」，四條斷言直接紅。
- **`getByRole('cell', { exact: true })` 比對的是 accessible name**：
  比較表項目名那一格加任何字或標籤，8 條斷言全紅。
- **`getByRole('heading', { name })` 預設是子字串比對**：新 Section 標題不能是既有標題的
  字首（「資料來源」vs「資料來源與致謝」就會撞）。
- **`getByLabel` 也是子字串比對**：新增的 `aria-label` 只要含「上蓋」「固鎖」「軸心」
  「主刃」「配裝 A」就會撞出 strict mode violation。
- **fullPage 截圖會把 fixed 底部導覽畫在畫面中段並遮住該處文字**：那是截圖假象，
  判斷前先用 DOM `innerText` 確認（曾因此誤判「內含零件顯示成 -」，實際是正確的「F」）。
- **代理會自己起 server、`pkill vite preview`、`rm -rf dist`**：派出去之後不要動同一個
  工作樹，否則會互相弄死（曾因此白跑兩次全套 e2e）。
- **`vite preview` 只綁 `::1`**：playwright 設定已加 `--host 127.0.0.1`。
- **Windows 的 `deployPages.mjs`**：環境變數在腳本裡設，`shell: true` 只給 npm 用；
  git 用 shell 會把 commit 訊息照空白切開。

**產品決策（不要「修」回去）**
- **重量整個拔掉了**：同款零件個體差異比配裝差異大，顯示或計分都是誤導。資料還在
  `beybladehub-stats.json`，只是不顯示、不進模型，而且有一條 e2e 巡邏守住
  「畫面上不得出現『重量』兩個字」。
- **一體式上蓋的固鎖欄位是鎖死變灰、不是消失**（`getBuilderSlotSchema()` +
  `lockedSlotReason()`）。直接消失會讓人以為畫面沒反應。
- **`heightCode` 不能接 `statFieldLabel`**：那讀的是 `statsProvenance`（社群實測），
  而 `heightCode` 是官方商品名裡的數字。接上去等於把官方資料標成社群。
- **`/part?id=` 與 `/product?id=` 不要加進假名巡邏 `ROUTES`**：規格第 147 行寫明
  「詳細頁才可顯示日文／英文次要名稱」，詳情頁的「其他名稱：ドランソード3-60F」是合規的。
  加進去會把合規欄位判成違規，接著就會有人砍掉它來換測試綠。
- **商品卡圖片要過 `assetUrl()`**：Pages 是子路徑，直接用 `/img/...` 會 404。
  守門在 `tests/live/live.spec.ts`（本機 base 是 `/`，重現不了）。

## 已知缺口

| # | 缺什麼 | 為什麼還沒做 |
|---|---|---|
| A | **配件的中文名**：10 筆純片假名被當成**主名稱**渲染在 `PartsPage.tsx` 配件庫分頁與 `ProductDetailPage.tsx` | 目前唯一已知的第 1.4 節違規。要從 BeybladeHub 查證彙整，查不到的不得自己翻 |
| B | 4 顆 CX 上蓋仍合併（雄鹿之角、海怪扭動、大黃蜂堡、龍神勇氣），標 `cxFused` | 社群站零件頁還沒收錄它們的紋章與主刃。站方補上就會自動拆，比對中文名，不必改程式 |
| C | 3 筆商品解析不出零件（`bxa02`、`bx00-jtm`、`bx00-jsq`） | 名稱裡沒有固鎖代號也不是一體型。內容已人工補上 |
| D | 3 筆賽事配置解析不出：巨鯨鞭打、帝王極變、古屍詛咒 | 圖鑑缺紋章／主刃／上蓋。另外 `P.H` 這種帶點的寫法解析器還沒處理 |
| E | 套裝內容靠 `beybladehub-curated-sets.json` 人工維護 | 自動抓取分不出「內容」與「推薦搭配池」 |
| F | 圖片 `usageStatus` 仍是 `unknown`，`public/img` 9 MB 進了 git | 要嘛取得授權，要嘛改成部署時才抓 |
| G | 共用代號零件（輔助戰刃 `T`）的來源標記偏保守，一直是 `community_only` | `ensurePart` 會沿用既有那顆，要精確得讓 provenance 可合併升級 |

## 下一步（排序）

1. **`playwright.config.ts` 的 `workers: 1` → 平行。** 8 核機器上把 42 測試 × 2 project
   串行跑要 4.6 分鐘，是每次上線前最大一段等待。已確認可平行：沒有 `describe.serial`、
   沒有 `beforeAll`、沒有模組層級可變狀態，`setOffline` 掛在 context 上，IndexedDB 與
   service worker 註冊都是 per-BrowserContext 隔離。
   改 `fullyParallel: true` + `workers: 4`，**跑一次綠就算過**。
   不用刻意連跑幾次刷保險：真正的風險不是邏輯共用（context 隔離是 Playwright 的設計
   保證，重跑不會改變結論），是 8 核上同時開 4 個瀏覽器加一個 preview 的資源競爭，
   那種失敗長得像 timeout，一看就知道。之後每次上線前的全套本來就在持續取樣，
   紅了再降到 `workers: 2`、再不行退回 1 並在這裡記原因。
   **絕對不要加 `retries`** 去蓋掉。
2. **缺口 A 配件中文名**（唯一已知違規）。修完可以把「`/parts` 多點一次配件庫分頁」
   加進假名巡邏，但**不要**把 `/part?id=` 整頁加進去（理由見上面踩過的坑）。
3. **缺口 D 補 3 顆缺件**。補完賽事證據更完整，首頁「賽場正在用什麼」才有機會顯示真正的
   G1 場次（目前唯一的 G1 沒有完整映射的牌組，所以顯示的是社群賽事）。
4. **`Quantity` 快速連點會遺失更新**：連點 5 次「+」只加到 3。`onChange` 用 render 當下的
   `value` 算 `next`，多個 handler 用同一個尚未更新的值。`ProductsPage` 與
   `ProductDetailPage` 兩處都有。改成函式式更新，或樂觀 UI + 佇列化寫入。
5. **`stock` 與 `availability` 合併成一次查詢**：目前是兩次獨立的 `allLots()`，
   理論上有極短的 key 集合不一致視窗（機率極低、下次 refresh 自動修正）。
6. **3on3 手動組隊器**（設計稿 `Deck.dc.html` 畫的三槽角色卡）。那是新功能不只是改版，
   **做之前要先問使用者**。
7. F、G 是長期議題，沒有外部條件配合做不完。

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
| `part-compatibility-notes.json` | 零件搭配限制（目前只有時鐘幻象） | 人工（附兩來源與分歧說明） |
| `images.local.json` | 遠端圖到本機副本的對照 | `fetchImages.mjs` |

規模：商品 149、零件 207、圖 346 全本機化、賽事 23 場（10 場完整 3on3 牌組共 14 副、
13 場單顆名次觀測共 93 筆）。

隨機補充包不推測內容，也不列進「去哪裡買」——列進去等於暗示買了就會有。
