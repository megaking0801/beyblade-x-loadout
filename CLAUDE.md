# 這個 repo 的工作規則

給在這個 repo 工作的 AI 代理（以及未來的自己）。專案現況、已知缺漏與下一步請讀 `HANDOFF.md`。

## 語言

與使用者溝通一律使用繁體中文。程式碼、指令、檔案路徑、API、函式、變數、模型名稱與必要技術
識別字可保留英文。不需要每次重新確認語言偏好。

## 回答前檢查

每次輸出最終回答前，先做一次輕量 internal consistency check：有沒有明顯事實錯誤、明顯邏輯
矛盾、遺漏使用者明確要求或限制、與目前已知資訊明顯衝突。發現具體問題先修正再回答。

這項檢查本身**不得**自動觸發：repository 全面重掃、大量重讀 unchanged files、subagent、
模型升級、第二輪完整分析、full red-team。只有出現具體 evidence 時才擴大驗證。

## Repository 探索順序

預設由窄到寬：

1. 已知直接相關檔案
2. targeted grep / glob
3. direct dependencies / affected call path
4. 只有出現具體 evidence 時才 broader repository exploration

避免：routine task 就掃整個 repository、無理由重讀 unchanged files、verification 階段
重新探索同一區域、沒有 evidence 就持續往相鄰 module 擴張。

## 開工前（先辨識現況，不覆寫在飛工作）

每次開始實作或規劃前，先依序執行：

1. `git status --short`
2. `git fetch origin`
3. `git log --oneline HEAD..origin/main`

工作區不乾淨時，先讀 diff、`HANDOFF.md` 與最近 commit，確認未提交內容是在飛工作還是使用者既有修改。
**不得**用 `reset`、`checkout`、重建產物或大範圍格式化來清工作樹；沒有明確授權就保留。

## 收尾規則（不可省略）

一個工作階段要結束時 —— 使用者說「交接」「先到這」「明天繼續」，或是你判斷手上的事告一段落 ——
**一定要做完這三件事才算結束**：

1. **更新 `HANDOFF.md`**：這一輪做了什麼、哪裡還是壞的、下一步建議順序。
   數字（測試數、資料筆數）要當場核對過再寫，不要沿用舊的。
2. **有修改檔案時，commit + `git push origin main`**。
3. **有前台程式、型錄產物、PWA 或部署設定變更時**，接著跑 `npm run deploy:pages`，再以
   `npm run test:live` 確認線上真的換版了。僅文件變更則不部署，但 HANDOFF 必須寫清楚
   線上程式版本未變。

### 留額度給收尾

**不要把整個 session 的額度用在寫功能上。** 上面三件事要花時間跑測試、建置、部署，
所以做事的過程中要一路預留餘裕。

**每完成一個可獨立交付的里程碑，就留下可接手狀態。** 至少做 `git diff --check`、重讀
diff，並更新 HANDOFF 的「未推的在飛工作」。若接下來要跑全套 e2e、部署或開新大型項目，
優先先 commit，別把所有修改押到 session 最後。

沒有可靠訊號時**不得猜測或回報 session 額度百分比**，也不要求使用者回報額度；改以
里程碑 checkpoint 保證隨時能交接。收到服務明確的 context／usage 警示時，停止接新大型
工作，先更新 HANDOFF，再 commit、push 與視變更類型部署。

未推的 commit 跟沒寫的 handoff 對接手的人等於不存在。寧可少做一項功能，也要留著把手上的東西交出去。

## 自檢（分兩層，規格第 47 節有完整版）

總體時間是這樣被吃掉的：把上線前該做一次的驗證，變成每個步驟都做一次。所以分兩層。

### 每步驟 → 先自讀改動，再依風險測試

每次有意義的改動或完成一件可交付工作後，先重新閱讀剛改的檔案與 diff，才可進下一項。
至少確認：需求與既有決策一致、欄位／流程一致、沒有編造或未證實結論、沒有敏感資料，
以及需要補哪一層測試。可修的先修再重讀；無法判定的列為阻塞，不把推測寫成事實。

只挑「讀才抓得到、測試抓不到」的東西：

1. **編造**：資料、數值、來源（第 1.5 節）。
2. **來源標錯方向**：社群標成官方，或官方標成社群
   （`provenance` 管零件身分，`statsProvenance` 管數值來源）。
3. **破壞既有斷言**：testid、`toHaveText` 裡的字面空白、
   `getByRole('cell', { exact: true })` 的精確名稱、`getByRole('heading')` 的子字串碰撞。
4. **沒資料時顯示什麼**：undefined、空陣列、`length === 0`。
   曾經出過「差 0 件」這種自相矛盾的字。
5. 前台漏出日文假名，或已拔除的欄位（重量）。

程式、領域邏輯或型錄產物改動後跑 `npx tsc -b` + `npm test`（Vitest 全套數百筆只要幾秒，
便宜到沒理由跳過）。純文件修改不必跑。改畫面就截圖看，改資料就把數字撈出來核對。

寫新功能時該功能自己的測試照 TDD 先紅後綠，但只跑那一個檔
（`npm test -- tests/unit/xxx.test.ts`）。

### 上線前 → 一個可部署批次只做一次

1. `npm run test:e2e` —— **前面不要自己加 `npm run build`**。
   `webServer.command` 本身就是 `npm run build && npm run preview`，
   本機 `reuseExistingServer` 為 true，自己先 build 等於 build 兩次。
   跑之前先殺掉 4173 殘留的 preview。
2. `npm run shots`，然後實際看圖。
   **一定要排在測試之後**：`npx playwright test` 開跑時會清掉 `test-results/`，
   先截圖再跑測試等於白截。
3. 推 → `npm run deploy:pages` → `npm run test:live`。

部署紀錄必須寫明：部署的 commit SHA、URL 與 `test:live` 是否通過；本機 HEAD、
`origin/main`、線上版本不一致時，明確標為未驗證。

**對抗式審查（紅隊）也只在這裡，而且不阻塞**：同時派一個唯讀代理讀整批 diff，
與上面並行，不要坐著等。提示要受限 —— 禁止它跑 build、跑測試套件、起 server、
寫檔進 repo、`pkill`、`rm -rf dist`（它做這些會直接弄死正在跑的測試，
曾經因此白跑兩次全套），並用 `model: 'sonnet'`。

**沒驗證的事就不要當事實講。** 曾經發生過：憑 `<total_tokens>` 推算額度百分比回報 99%，
使用者介面實際是 74%。不確定就說不確定，或先去量。

## 其他長期規則

- **推 code 就是要上線一版。** push 完接 `npm run deploy:pages`，不要停在「要不要推？」。
  使用者是用手機驗收的，沒部署等於看不到。
- **名稱與用語一律以 <https://beybladehub.app> 為準**，不要自己翻譯。
  詞素表在 `scripts/zhTwTokens.mjs`，語序修正在 `scripts/buildCatalog.mjs` 的 `ZH_TW_PHRASE_RULES`。
  該站把「防禦」寫成**防守**，抓類型時兩種都要收。
- **規格第 1.5 節：不得編造。** 查不到就留空、標來源，不要填一個看起來合理的值。
  官方資料與社群資料要分開記（`provenance` vs `statsProvenance`），前台不得把社群數值講成官方數值。
- **前台不得出現日文假名**（第 1.4 節）。`tests/e2e/pwa.spec.ts` 有一條會巡所有列表頁檢查，
  判斷式刻意排除全形中點「・」，不要把它加回去。
- **新增的測試若可能「必定通過」，做一次變異驗證**：故意弄壞，確認它會紅，再改回來。
- **先拉再規劃。** 任何規劃工作開始前先 `git fetch` 比對遠端。曾經對著落後 9 個 commit 的樹
  寫了一份大計畫、還派了三個規劃代理，拉下來才發現那些工作早就做完了，整份作廢。
- **改 `src/catalog/sources/` 必須三件套同批交付**：原始來源檔、`npm run build:catalog`
  產出的 `catalog.generated.json`／`catalog-audit.json`，以及 audit 的缺口、未對應與過期
  mapping 檢查結果。不得手改 generated／audit 來掩蓋來源問題。
- **派出代理之後不要動同一個工作樹。** 只做讀取，或直接等它。
  代理會自己起 server、寫暫存檔、清 `dist`，兩邊同時寫就會互相弄死。
- **委派後不要主動輪詢、催問或持續查狀態。** 代理只在工作完成、需要阻塞性決策，或發生
  實質錯誤時主動回報；主代理交付該批結果後，必須等待使用者明確決定是否開始下一步。
- **不要坐著等代理。** 派出去之後去做不重疊的工作。上一輪三次代理審查共
  47 分鐘全部在關鍵路徑上等待，換到的是 3 個讀 diff 就找得到的問題。

## 模型與子代理分工

Sonnet 是一般開發預設主模型：一般 feature、bug fix、debug、測試、一般效能分析、普通
verification 都由 Sonnet 直接處理。普通自檢或回答前 consistency check 不因此自動升級模型；
只有真正困難問題，或使用者明確要求 `full red-team`，才升級到較高成本 escalation。簡單任務
不要為了「分工」而自動啟動 subagent。

Claude Code 的主 session 模型由使用者以 `/model` 或啟動參數選定；規則不能讓主 session
自行換模型。要做模型分工，使用 `.claude/agents/*.md` 的 custom subagent，並在 frontmatter
固定 `model`，不可依賴 `inherit`。

| 工作 | 子代理模型 | 範圍 |
|---|---|---|
| 來源、中文命名、provenance、發布前結論審核 | Opus | 只讀，必須附檔案與來源依據 |
| 一般 UI／功能實作、測試與截圖審查 | 主代理或 Sonnet | 實作只允許一個寫入者 |
| 檔案盤點、generated／audit 差異、缺 mapping 清單 | Haiku | 只讀；不得把盤點當作證據結論 |

不得因為可委派就委派。只有工作可獨立、唯讀，或確實可平行且不共用工作樹時才派；每次最多
一個審核子代理。子代理一律不得修改 repo、起 server、跑完整測試、清 `dist` 或終止程序；
主代理負責實作與驗證。

## HANDOFF.md 怎麼寫

它的唯一用途是**讓下一個 session 接手**，不是紀錄我做了什麼。

判準一句話：**`git log`、程式碼、這份 CLAUDE.md 查得到的，一律不寫。**

所以**不要寫**：這一輪改了什麼（commit 訊息已經很長了）、功能有哪些區塊
（讀程式就知道，而且會過期）、使用者訂的規則（這份檔案每個 session 自動讀到，
重複一份只會兩邊不同步）。

固定用這個模板，目標 **100 行以內**。寫 HANDOFF 前必須重新執行
`git status --short`、`git rev-parse --short HEAD` 與
`git rev-parse --short origin/main`。測試數字只能寫當次實際輸出；沒有跑就寫「未驗證」。
工作區不乾淨時，必須列出在飛變更範圍、最後完成步驟與下一個具體動作，不能寫「乾淨」或
「已上線」。

一般交接（含正式交接、usage 警示、一般「可移交」狀態）直接覆寫 `HANDOFF.md`，**不**自動
建立 `handoffs/YYYYMMDD-HHMM.md`。只有以下情況才額外複製一份歷史快照：major milestone、
release、architecture freeze、postmortem／重大事故，或使用者明確要求保留 snapshot。
要建立 snapshot 時，確認兩份都沒有憑證、個資或真實使用者資料，才可停止。
交接觸發後不得開始新的大型工作。

```
# 交接筆記
最後更新：<日期與時區>
交接原因：<正式交接／usage 警示／可移交里程碑>

## 目前目標             未完成前不得開始的事也要寫清楚
## 發布狀態             工作區／origin/main／線上，各自的 SHA 或未驗證狀態
## 已驗證與未驗證       測試、截圖、live test 各自分開；不把綠燈擴大解讀
## 阻塞                 沒有就寫「無」；有的話寫缺什麼與誰能解除
## 下一個具體動作       一件可直接執行的事，不寫籠統待辦
## 怎麼跑（非顯而易見的） 只寫 package.json 看不出來的那幾條
## 踩過的坑            最有價值的一節，收錄標準見下
## 已知缺口            分項列，每項寫「為什麼還沒做」
## 下一步（排序）       含「為什麼這個排前面」
## 資料管線表          哪個來源檔餵給哪個欄位
```

「踩過的坑」的收錄標準：**下一個人不看這行就會重蹈**。
例如「4173 殘留 preview 會造成假綠假紅」、「`toHaveText('可用 ×3')` 的空白是 JSX
字面空白，改成 flex 兩節點就會紅」、「fullPage 截圖會把 fixed 導覽列畫在畫面中段
並遮住文字，那是假象不是 bug」。不是「這一輪我修了什麼」。

## `/clear` 後接手

長 session 需要 `/clear` 時，新 session 優先順序：讀這份 `CLAUDE.md` → 讀 `HANDOFF.md` →
`git status` → `git diff` → 只讀 `HANDOFF.md` 下一步列出的直接相關檔案。

不要因為是新 session 就：重新掃整個 repository、重新研究 `HANDOFF.md` 已記錄完成的決策、
自動讀全部舊 `handoffs/`、建立新的 summary、建立新的 timestamp handoff。
