# BEYBLADE X 配裝分析 PWA

手機優先、可安裝、可離線使用的 BEYBLADE X 個人庫存與配裝分析工具。

可管理個人庫存、建立 BX／UX／CX 配裝、分析可組配置與賽事資料，並提供兩套配裝的模型比較及「下一包推薦」。所有強度、對打與推薦結果都是依資料與規則推估，並非實戰勝率或保證。

規格書：`BEYBLADE_X_codex_prompt.md`（共 49 節，是唯一 source of truth）。

---

## 快速開始

```bash
npm install
npm run dev          # 本機開發（http://localhost:5173）
npm run build        # 型別檢查 + 打包
npm run preview      # 預覽打包結果（PWA / service worker 要在這裡測）
```

手機實機測試：`npm run preview -- --host`，再用同網段手機開電腦的 IP。
iPhone Safari 從「分享 → 加入主畫面」安裝，Android Chrome 會出現安裝提示。

## 驗證指令

```bash
npm run typecheck        # tsc -b
npm test                 # Vitest：領域邏輯單元測試 + repository 整合測試
npm run test:e2e         # Playwright：第 45 節 Case 1–10 驗收情境 + PWA / 離線 / 執行期錯誤
npm run test:live        # 對已部署的線上版做煙霧測試（可用 LIVE_BASE_URL 覆寫網址）
npm run shots            # 擷取手機與桌機寬度截圖到 test-results/shots（人工檢查版面用）
npm run build:catalog    # 由官方商品一覽重建 Master Catalog
npm run build:catalog-images  # 重建圖片對應表
```

## 目前狀態（2026-09-19）

| 項目 | 狀態 |
|---|---|
| 單元／整合測試 | 432 passed |
| 驗收與 PWA e2e | 44 passed |
| 型別檢查與打包 | `tsc -b`、Vite build 均成功 |
| 線上版煙霧測試 | 已驗證公開 Pages 資產與新功能字串 |
| 圖鑑 | 商品 149 筆、零件 242 筆 |
| 隨機強化組 | 21 款，94 個官方可能款式（非保證內容） |
| 賽事資料 | 23 場：10 場完整 3on3 牌組共 14 副，13 場單顆名次觀測共 93 筆 |

最近一次完整驗證包含 `npm test -- --run`、`npm run build`、Playwright 驗收、公開 GitHub Pages smoke check。

## 主要功能

- **配裝器**：依個人庫存、完整圖鑑或假想零件建立標準與 CX 結構配裝，並排序可組配置。
- **比較**：`/compare` 提供 A、B 兩個完全獨立的配裝器；結果以 KO／存活路線模型推估，不能視為保證勝率。
- **下一包推薦**：`/recommendations` 模擬每個固定內容商品加入既有庫存後的提升，依平衡 3on3、整體強度與各型峰值排序。已持有商品僅在補足份數確實帶來提升時才會入榜。
- **隨機強化組**：只在推薦頁另列「可能補到的零件」，不納入前五排名；單盒內容不保證。

## 架構

```
src/
  domain/      純函式領域邏輯（不 import Dexie / React）
  data/        Dexie schema 與 repository（唯一碰 IndexedDB 的地方）
  catalog/     由官方資料產生的 Master Catalog 與稽核報告
  store/       Zustand 狀態
  ui/          頁面與元件（hash 路由，離線任何路徑都能開）
scripts/       Catalog 產生器、圖示產生器、繁中暫譯字典
tests/unit     領域邏輯 TDD
tests/integration  repository + fake-indexeddb
tests/e2e      第 45 節驗收情境、PWA、離線、執行期錯誤、日文假名守門
```

分層規則來自規格第 48.4 節：領域邏輯必須是純函式，Dexie 只能出現在 repository 層，
這樣內圈 TDD 不需要啟動 fake IndexedDB。

## 資料來源與誠實界線

- 商品身分（型號、日文名、分類、發售日）來自
  [Takara Tomy BEYBLADE X 官方商品一覽](https://beyblade.takaratomy.co.jp/beyblade-x/lineup/)，擷取日 2026-09-16。
- 零件結構、類型與說明主要來自 BeybladeHub 社群資料；每筆資料保留來源與驗證狀態。套裝內容另有人工維護的資料集補充。
- 賽事資料來自 BeybladeHub 社群彙整，標為 `community`。完整 3on3 牌組與單顆名次觀測分開處理。
- 重量不顯示、也不計入模型，避免把個體差異誤當成配裝差異。
- 強度、比較與推薦使用明示權重的模型分數；沒有逐場對戰資料時，不會宣稱實際勝率。
- 競技向 3on3、配裝與購買推薦另讀取版本化 Meta 快照：台灣完整牌組優先，全球 Top Cut 僅補足台灣尚無的完整配置；每筆快照都附來源與日期，離線使用時不會即時爬網。

## 已知缺漏（會在 App 的「設定 → 已知缺漏」同步顯示）

1. 4 顆 CX 上蓋仍以合併零件 `cxFused` 表示：雄鹿之角、海怪扭動、大黃蜂堡、龍神勇氣；等待來源補齊紋章與主刃資料。
2. `bxa02`、`bx00-jtm`、`bx00-jsq` 三筆商品無法由名稱解析完整零件，已人工補上內容。
3. 巨鯨鞭打、帝王極變、古屍詛咒三筆賽事配置尚不能完整解析。
4. 套裝內容仍部分依賴人工維護，因自動抓取無法可靠區分「內含內容」與「推薦搭配池」。
5. 圖片使用狀態尚未逐張完成授權確認；目前本機圖片約 9 MB 已納入版本控制。
6. 共用代號零件的來源標記仍偏保守，尚未支援來源資訊自動合併升級。

## 部署

線上版本（GitHub Pages）：<https://megaking0801.github.io/beyblade-x-loadout/>

```bash
npm run deploy:pages   # 用 Pages 的 base path 打包，再把 dist 推到 gh-pages 分支
```

`scripts/deployPages.mjs` 會用 git worktree 掛上 `gh-pages`、清空後放入 `dist`、補上 `.nojekyll`
再 commit / push，不會把原始碼推到 gh-pages。`vite.config.ts` 依 `GITHUB_ACTIONS` 決定
`base`（Pages 用 `/beyblade-x-loadout/`，本機用 `/`），manifest 的 `start_url` 與 `scope` 也跟著改。

想放到其他靜態主機：

```bash
npm run build          # base 為 /
# 然後把 dist/ 整個目錄上傳
```

- Netlify / Vercel / Cloudflare Pages：build command `npm run build`、publish directory `dist`。
- 放在子路徑時要改 `vite.config.ts` 的 `base`，否則 service worker 與資源路徑會找不到。
- 必須用 HTTPS（或 localhost）才能註冊 service worker、才能加入主畫面。
- 個人資料只存在使用者裝置的 IndexedDB，沒有後端、不會上傳；換裝置請用「設定 → 匯出我的資料」。

## Catalog 資料更新

修改 `src/catalog/sources/` 下任何來源檔後，必須執行 `npm run build:catalog`。若改動任何公開 Catalog 資料（例如隨機款式、圖片、相容性、賽事或中文名），還必須先遞增 `scripts/buildCatalog.mjs` 的 `CATALOG_VERSION`；否則既有裝置會繼續使用 IndexedDB 中的舊 Catalog。

競技 Meta 快照位於 `src/domain/competitiveMeta.ts`，不屬於 Catalog／IndexedDB。更新時必須保留完整配置、地區、觀測日期、出現次數與來源網址；若來源沒給 Top 4 或冠軍數，欄位維持 `0`。若來源沒給可對應到完整牌組數的分母，保留原始未知值，並由匯入層以出現次數作最小安全分母，前台不可顯示其 meta share。

## 開發規則

規格第 47–49 節是硬性規則，不是建議：

- 第 47 節：每個步驟做完都要自檢並實際跑驗證，附固定回報格式。
- 第 48 節：TDD 為主、BDD 外圈。Vitest 做領域邏輯，Playwright 把第 45 節 Case 1–10 當 v1 的 definition of done。
- 第 49 節：不要偷懶。禁止佔位符、半成品回報、必定通過的測試與模糊措辭。
- 推送 `main` 後依序執行 `npm run deploy:pages` 與 `npm run test:live`。
