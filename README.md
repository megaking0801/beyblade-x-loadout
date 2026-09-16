# BEYBLADE X 配裝分析 PWA

手機優先、可安裝、可離線使用的 BEYBLADE X 個人庫存與配裝分析工具。

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

## 目前狀態（實測數字）

| 項目 | 狀態 |
|---|---|
| 單元／整合測試 | 301 passed（13 檔） |
| 驗收與 PWA e2e | 33 passed、1 skipped（見下方） |
| 型別檢查 | `tsc -b` 無錯誤 |
| 打包 | 成功，service worker 預快取 13 個檔案 |
| 線上版煙霧測試 | 4 passed（手機 WebKit + 桌機 Chrome，含 service worker 註冊） |
| 圖鑑 | 官方商品 153 筆、零件 162 筆 |
| 賽事資料 | 社群來源 10 場、可完整對應圖鑑的牌組 14 副 |

唯一 skip：離線 reload 測試只跑 Chromium。Playwright 的 WebKit 在 `setOffline(true)` 後 reload 會拋
「WebKit encountered an internal error」，屬瀏覽器驅動限制。**實機 iOS Safari 的離線行為仍需人工驗證一次。**

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
- 零件組成由官方商品名稱解析（商品名本身就是官方資料）。解析不出來的一律留空並標 `needs_review`。
- 賽事資料來自 beywatch.gg 社群彙整，`sourceTier: community`；只收「能完整對應圖鑑」的牌組，
  對不上的整副拒收而不是部分匯入。
- **官方沒公布的東西一律留空，不補值**：零件的類型、官方重量、旋向、軸心特性目前都沒有官方數據，
  因此強度分析會顯示「資料不足」而不是給一組沒有依據的分數。
- 台灣官方中文名稱尚未取得，所有中文名都標記「暫譯」。
- 賽事統計只做規格第 21 節允許的：出場率、Top Cut 使用率、冠軍數、placement score、meta share，
  並附 Wilson 區間；沒有逐場對戰資料時**不計算勝率**。

## 已知缺漏（會在 App 的「設定 → 已知缺漏」同步顯示）

1. 零件的官方類型／重量／旋向／軸心特性未公布，強度分析多數顯示資料不足。
2. 隨機強化組的款式清單官方未公布，因此沒有預設款式；開封後由使用者自行登記實際內容。
3. 套裝商品的內含陀螺未在官方一覽頁公布，內容留空並標待查（8 筆商品名不符合可解析規則，30 筆內容未知）。
4. CX 上蓋在商品上是「鎖定紋章 + 主刃」已組合狀態，官方未公布個別名稱，故以單一零件表示並標 `cxFused`。
5. 尚未取得台灣官方中文名稱。
6. 分享功能支援複製文字與分享連結，QR Code 尚未實作（規格第 36 節列為可選）。
7. iOS 實機離線行為尚未人工驗證。

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

## 開發規則

規格第 47–49 節是硬性規則，不是建議：

- 第 47 節：每個步驟做完都要自檢並實際跑驗證，附固定回報格式。
- 第 48 節：TDD 為主、BDD 外圈。Vitest 做領域邏輯，Playwright 把第 45 節 Case 1–10 當 v1 的 definition of done。
- 第 49 節：不要偷懶。禁止佔位符、半成品回報、必定通過的測試與模糊措辭。
