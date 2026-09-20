# 交接筆記

最後更新：2026-09-21 04:07 UTC+08:00
交接原因：產品方向改為「自動分析可信 YouTube 影片並訓練配裝預測模型」，先留下可直接實作的決策。

## 目前目標

移除所有需要使用者人工記錄對局的功能，改由維護端批次分析全球可信社群的公開 YouTube 影片，產生可追溯資料集並離線訓練配裝勝負／推薦模型。

不可延續目前的「本機記錄一局 → 匿名匯出 → 人工審核」路線。影片抽取未通過驗證、模型未通過品質門檻前，Compare 必須維持「樣本不足，暫不預測」，不得拿舊六軸補成實戰勝率。

## 已鎖定的產品與架構決策

- 不用 NotebookLM MCP。維護端使用 Gemini API 直接分析公開 YouTube URL 的畫面、聲音與時間戳；此能力目前是 Preview：<https://ai.google.dev/gemini-api/docs/video-understanding>。
- 網站維持純 GitHub Pages；API 金鑰只放 GitHub Secrets／本機環境，絕不進 bundle、repo 或 IndexedDB。
- 來源涵蓋全球官方、賽事主辦與成熟競技社群。自動發現候選頻道，但加入可信白名單需維護者核准一次；之後歷史回填與新片處理全自動。
- 低信心抽取可在證據頁查看並明示缺欄位，但不得進勝率、推薦或訓練集；只有高信心資料能訓練。
- 模型用於 A/B 比較與 3on3 配裝推薦；「下一包推薦」暫時維持現有規則，不交給新模型排序。
- 首次處理白名單頻道全部相關公開歷史影片，之後 GitHub Actions 每週增量掃描、分析、驗證與重訓。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 更新交接文件前為乾淨；功能尚未依新方向修改 |
| 程式功能基線 | `370620b`；其後僅有本次交接文件 commit |
| `origin/main` | 本檔與時間戳快照已推送；最新 SHA 以 `git log -1` 為準 |
| 線上 Pages | `7fbaf1a`；仍包含本機逐局記錄與匿名匯出，尚未移除 |

本次只改文件並推 `main`，依 `CLAUDE.md` 不部署 Pages，因此線上版本預期不變。

## 已驗證與未驗證

- 上一功能版本曾通過 typecheck、24 files / 436 Vitest、build；修正 App ready 後，6 個線上 phone／desktop smoke 通過。
- 本次為純文件修改，不重跑程式測試或 live test。
- 自動影片管線、資料集、模型、排程與移除人工記錄都尚未實作／驗證。

## 阻塞

- 可先完成結構、fixture 與離線測試；首次真實回填前需要 `GEMINI_API_KEY`、`YOUTUBE_API_KEY`。
- 尚未建立全球可信頻道白名單；實作時先研究並提交候選來源與納入理由，不能自動把搜尋結果當可信來源。

## 下一個具體動作

先做一個可獨立發布的「人工紀錄移除＋自動證據 schema」批次：刪除 Compare 的記錄／刪除／匿名匯出 UI 與相關 store/repository/type，IndexedDB 升 v5 並刪除 `battleRounds`，同時加入唯讀 `VideoEvidence` schema、fixture、驗證器及測試；此批不需 API key。

## 後續實作順序

1. **移除人工資料流**：清掉 `BattleRoundRecord` 全鏈路及備份欄位；舊備份匯入時忽略該欄位。先做是因為它已被使用者明確否決，且線上仍看得到。
2. **建立證據管線**：可信來源 registry、YouTube 歷史列舉／增量游標、Gemini 兩階段抽取、Catalog 映射、去重、重試、可續跑快取與版本化輸出。
3. **信心閘門**：完整 A/B、勝負、時間戳兩次抽取一致，欄位信心皆 `>= 0.90`，並通過合法組合與來源檢查才列為高信心；其餘低信心或拒收。
4. **訓練與評估**：正則化 pairwise logistic／Bradley–Terry；A/B 對調增強，按影片／賽事分組並保留時間 holdout，平手與無效局不進二元勝負訓練。
5. **發布模型**：至少 200 局高信心、3 個獨立來源、30 套完整配置，且 holdout log loss／Brier 不劣於 50% 與既有模型才發布；否則沿用上一版或顯示資料不足。
6. **接前台**：`predictMatchup(a,b,context)` 回傳機率、可信度、樣本支援及不足原因；3on3 依預測、對手覆蓋與隊伍多樣性排序。未知零件／分布外資料拒絕預測，不用六軸補值。
7. **自動化**：新增首次 `workflow_dispatch` 全量回填與每週 cron；品質閘門通過才更新資料／模型產物，失敗只留報告，不發布壞模型。

## 預定公開資料介面

- `VideoEvidence`：影片／頻道／發布時間、逐局時間範圍、A/B 完整配置、勝方、結束方式、規則／場地、逐欄信心、抽取版本、納入訓練與否及原因。
- `PredictionModelArtifact`：schema／資料／模型版本、訓練日期、特徵與係數、校準資料、訓練範圍及評估指標。
- `predictMatchup(...)`：成功時提供校準後機率與證據摘要；資料不足時回傳具體拒絕原因，不產生假百分比。

## 測試與驗收要點

- 一般 CI 使用固定 Gemini response fixture，不呼叫付費 API；另測格式錯誤、限額、重試、斷點續跑與同影片去重。
- 單元測試守住：低信心／非法配置／無勝負／無時間戳不進訓練；A/B 對調後機率互補；同影片不跨 train/test。
- migration 測試守住 v4 → v5 刪除 `battleRounds`、個人庫存與已存配裝仍保留、舊備份可匯入但忽略逐局欄位。
- E2E 必須確認所有人工記錄／匯出控制消失，低信心證據標「未納入模型」，預測都能開原始影片時間戳；無支援時誠實降級。

## 怎麼跑（非顯而易見）

- Catalog 來源有改動時遞增 `scripts/buildCatalog.mjs` 的 `CATALOG_VERSION`，再跑 `npm run build:catalog`；不能手改 generated／audit。
- e2e 前確認 4173 沒有殘留 preview；`npm run test:e2e` 自己會 build。順序固定為 tests → shots → 實際看圖。
- 程式批次完成後：typecheck + Vitest → e2e／截圖 → commit/push → `npm run deploy:pages` → `npm run test:live`。

## 踩過的坑／不可回退

- 現有六軸來自固定類型模板，不是真實對局模型；不可調權重後改名為勝率。
- 賽事 Top Cut、名次、T 表與同上蓋替代只能作配置／Meta 證據，不能當逐局 A 對 B 標籤。
- YouTube URL 分析目前只支援公開影片且是 Preview；失敗或額度不足要延後，不得以來源不明的字幕抓取方式繞過。
- PWA/Catalog 更新不能清使用者庫存；刪 `battleRounds` 時 migration 必須只刪這張已廢棄表。
- 推 code 就需部署，但純文件 push 不部署；下一輪真正改 UI／資料庫後不可停在 main 未上線。

## 資料管線

`可信頻道 registry → YouTube Data API 影片清單 → Gemini 影片分段／逐局抽取 → Catalog 映射與驗證 → 高／低信心證據 JSON → 高信心訓練集 → 分組訓練與品質報告 → 唯讀模型 JSON → Compare／3on3`。
