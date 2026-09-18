# 交接筆記

寫給下一個接手的 session。最後更新：2026-09-18（第九段：設計稿 11 頁全部實作完）。

這份文件會被整份蓋掉重寫，不是逐段追加。要看歷史細節請用 `git log`。

---

## 設計稿 11 頁已全部實作完

最後一個 commit 是 `830e553`，已推、已部署、`test:live` 6 過。工作區乾淨。

使用者最在意的「整個網頁太醜」這一輪處理完了。逐頁做了什麼：

| 頁 | 做了什麼 |
|---|---|
| 首頁 | 「賽場正在用什麼」（名次徽章＋類型色圓點＋來源）、快速操作改兩欄卡片格 |
| 我能組什麼 | 序號＋零件圖＋迷你分數條＋「可組／差 N 件」三態徽章 |
| 配裝比較 | 「軸心 B → P」前後對照、每軸不同色的勝出底色 |
| 想買清單 | 「最划算的一盒」、清單合計盒數 |
| 設定 | 資料來源 5 列分類表（官方／社群／未確認）、顯示模式兩張大卡、補重載列 |
| 商品 | 「入門組」特色區、商品卡三種持有態 |
| 商品詳情 | 返回連結、頁內數量 stepper 與備註編輯 |
| 零件詳情 | 返回連結、三欄庫存統計條、其餘狀態改小標 |
| 零件庫 | 「我的零件」補搜尋＋系列與類型快篩、右欄從 9 行收成 1 行 |
| 配裝器 | 六軸改每軸不同色，資料不足畫虛線空軌 |
| 3on3 | 「隊伍覆蓋」類型統計、模式改分段控制、官方規則搬進桌機左欄 |

全站：裸 `<a>` 的顏色與底線、`<ul>` 項目符號（Tailwind preflight 補回）、
`EmptyState` 的 `action` 出口、`PageHeader` 的 `backTo`、`ReloadLatestButton` 抽成共用元件。

### 順手修掉的真問題

- `ComboAnalysis.stock.missingPartIds` 早就算好卻被丟掉，所以「我能組什麼」永遠只有
  二元的「庫存不足」。現在是「差 N 件」。
- `computeStock` 在一個槽位都沒解析到零件時回 `sufficient:false` 但缺件清單是空的，
  會顯示自相矛盾的「差 0 件」。改成「資料不足」（`src/domain/buildableRows.ts` 有守門測試）。
- `compare.ts` 的 `diffSlots` 收了 `parts` 卻 `void` 掉沒用，所以只能列槽位名稱。
  現在拿來解前後零件名稱。
- 入門組原本列出來的是 BX-00 門市限定與聯名塗裝款（store 拿到的商品順序不是圖鑑檔
  的順序）。現在排除 `-00` 型號並依型號排序。
- Tailwind preflight 把「來源」連結的底線與 13 個說明清單的項目符號都吃掉了，
  違反規格第 22 節（來源要看得到並查得回去）。

### 兩條寫在計畫裡但查證後發現是錯的方向

1. **`heightCode` 不要接 `statFieldLabel`。** 那讀的是 `statsProvenance`（社群實測），
   而 `heightCode` 是官方商品名裡的數字。接上去會把官方資料標成「社群實測」，
   是反方向的第 1.5 節違規。
2. **`/part?id=` 與 `/product?id=` 不要加進假名巡邏 `ROUTES`。** 規格第 147 行寫明
   「詳細頁才可顯示日文／英文次要名稱」，零件詳情的「其他名稱：ドランソード3-60F」
   是合規的。加進去會把合規欄位判成違規，接著就會有人砍掉它來換測試綠。

### 自檢規則改了（2026-09-18 使用者指示）

「不是直接跑測試 是紅隊檢查剛剛寫的有沒有問題就好 測試等每次大改之後要上線前再跑測試就好」。

- **每步驟**：派 `red-team` agent 看剛寫的 diff + `npx tsc -b` + 改畫面就截圖看 + 改資料就撈數字核對。
- **整套測試**只在一次大改完成後與要上線前跑。
- 寫新功能時該功能自己的測試照 TDD 先紅後綠，但只跑那一個檔。

已寫進 `BEYBLADE_X_codex_prompt.md` 第 47.1／47.6 節與 `CLAUDE.md`。

### 這一輪踩過的坑（別再踩）

- **不要邊派紅隊邊改同一個工作樹。** 紅隊會自己起 dev server、`rm -rf dist`、
  `pkill vite preview`。我在它跑的時候 `git stash` 又跑全套 e2e，結果整批
  `ERR_CONNECTION_REFUSED at 4173`，白跑兩次共 10 分鐘。派出去之後只做讀取。
- **`npx playwright test` 會清掉 `test-results/`**，截圖要最後跑，或立刻複製出去。
- **fullPage 截圖碰到 `position: fixed` 的底部導覽，會在畫面中段畫出一條導覽列並
  遮住該處文字。** 那是截圖假象，判斷前先用 DOM `innerText` 確認（我為此誤判過一次
  「內含零件顯示成 -」，實際 DOM 是正確的「F」）。
- **先拉再規劃。** 這一輪一開始對著過期的樹寫了一份大計畫，還派了三個規劃代理，
  拉下來才發現遠端 9 個 commit 早就把那三塊做完了，整份作廢重寫。

## 一分鐘現況

Beyblade X 收藏／配裝／分析的 PWA，繁體中文（台灣用語），深色單一主題，手機優先。

- 上線網址：<https://megaking0801.github.io/beyblade-x-loadout/>
- 原始碼：<https://github.com/megaking0801/beyblade-x-loadout>
- 目前狀態：**全綠**。typecheck 通過、單元 423 筆全過、e2e 83 過 1 skip、`test:live` 6 過。
- 主要功能都在：圖鑑、我的零件、配裝器（含證據、可切換模式、搭配限制、去哪裡買）、
  3on3、配裝比較、我能組什麼、想買清單、設定。
- 設計稿 11 頁已全部實作完（見上面的表）。下一個大項目要重新挑，建議見文末。

### 怎麼跑

```bash
npm install
npm run dev              # 開發

npm run build:catalog    # 重建圖鑑資料（改 src/catalog/sources/ 之後一定要跑）
npm run fetch:images     # 把新出現的遠端圖抓成本機副本（public/img）

npm run typecheck
npm test                 # vitest，單元＋整合
npm run build && npm run test:e2e   # playwright，跑之前先確認 4173 沒有殘留的 preview

npm run deploy:pages     # 部署到 gh-pages（推完一定要跑）
npm run test:live        # 打線上站的驗收
```

---

## 規則（使用者訂的，違反過會被罵）

1. **「推 code 就是要上線一版」**——`git push` 之後接著跑 `npm run deploy:pages`，
   不要停在「要不要推？」。使用者用手機驗收，沒部署等於沒做。
2. **每次交接前更新這份 HANDOFF.md，而且全程預留額度**做 commit / push / deploy。
3. **隨時監控 session 額度**，剩約 10% 要主動提醒，然後停止接新工作、轉入收尾。
   查法：`node ~/.claude/session-usage.mjs`。
   **`<total_tokens>` 不是 session 額度**，拿它算百分比會報出完全錯的數字（曾報 99%，實際 74%）。
4. **自檢**：宣稱完成前要跑 typecheck＋單元＋e2e；改畫面要截圖看；改資料要把數字撈出來核對；
   部署後跑 `npm run test:live`。
5. **不得編造**（規格 1.5 節）：查不到就留空、標來源，不要填看起來合理的值。
   官方資料與社群資料分開記。
6. **前台不得出現日文假名**（規格 1.4 節），有 e2e 在守。
7. 新增的測試若可能「必定通過」，要做變異驗證（故意改壞，確認它會紅）。
8. **名稱以 <https://beybladehub.app> 為準**，不是自己翻譯。該站寫「防守」不是「防禦」，
   平衡型寫「均衡」。

以上也寫在 `CLAUDE.md`，任何在這個 repo 工作的 agent 都會自動讀到。

---

## 資料是怎麼來的

### 管線

`scripts/buildCatalog.mjs` 讀這些來源，產出 `src/catalog/catalog.generated.json`
與 `src/catalog/catalog-audit.json`：

| 來源檔（`src/catalog/sources/`） | 內容 | 產生方式 |
|---|---|---|
| Takara Tomy 商品一覽（PSV） | 官方商品名與型號 | 人工貼上 |
| `beybladehub-stats.json` | 264 筆零件的類型／迴轉／接觸／中文名／圖／說明 | `scripts/fetchHubStats.mjs` |
| `beybladehub-structure.json` | 零件分類結構、補充零件清單 | 人工＋抓取 |
| `beybladehub-curated-sets.json` | 人工彙整的套裝內容 | 人工 |
| `beybladehub-sets.json` | 自動抓到的套裝內容 | `scripts/fetchHubSetContents.mjs` |
| `beybladehub-tournaments.json` | 13 場台灣賽事、33 筆名次 | `scripts/fetchHubTournaments.mjs` |
| `beybladehub-tier-ratings.json` | 5 位高手、34 筆評級 | `scripts/fetchHubTierRatings.mjs` |
| `beybladehub-modes.json` | 4 個可切換模式的零件 | 人工（附原文引述） |
| `part-compatibility-notes.json` | 零件搭配限制（目前只有時鐘幻象） | 人工（附兩個來源與分歧說明） |
| `images.local.json` | 遠端圖到本機副本的對照 | `scripts/fetchImages.mjs` |

目前規模：商品 149 筆、零件 207 筆、圖 346 張全部本機化、賽事 23 場、來源觀測 93 筆。

### 資料誠信的做法

- `Part.provenance` 記「這顆零件的身分」是官方確認還是社群來源；
  `Part.statsProvenance` 另外記「這些數值」的來源，社群數值一律 `community_only`，
  前台會標示。
- 隨機補充包（`isRandom`）不推測內容，也不列進「去哪裡買」——列進去等於暗示買了就會有。
- 圖片 `usageStatus` 一律 `unknown`，不得寫成 `permission_granted`（有測試在守）。

---

## 功能現況（做完的）

### 配裝器（`src/ui/pages/BuilderPage.tsx`）

由上而下：

1. **這顆是什麼打法** —— `buildComboVerdict()` 給一句話結論（最強／最弱軸差距小於 12
   時說「沒有明顯偏向」）。
2. **整套出現過的賽事** —— 只有**完全一樣**的組合才算（`isSameCombo()` 逐槽比對，
   沒有具名槽位時用排序後的完全比對；`[A,B,B]` 與 `[A,A,B]` 不算同一套）。最多列 3 筆，
   其餘寫「另有 N 場」。
3. **零件的來歷** —— 各零件的專家評級與賽事紀錄合併成一句，不再是三份分開的報告。
4. **可切換模式的零件** —— 例如滅世紅面上撃／藍面重擊，附原文引述與來源連結。
5. **搭配限制警告** —— 時鐘幻象只裝得下簡易型固鎖。是**警告不是錯誤**，不擋儲存。
6. **去哪裡買** —— 每個零件列出含它的商品，並推薦「最划算的一盒」。
7. **優點／缺點（模型推估）** —— 六軸估分，明確標成推估。

分析相關程式在 `src/domain/`：`reasons.ts`（證據層）、`analysis.ts`（六軸）、
`compatibility.ts`（相容性與限制）、`sources.ts`（去哪裡買）。

### 已經處理掉的坑（別再踩）

- **六軸曾經全空**：`applyHubStats()` 沒把 `integrated_blade` 對應到社群站的 `blade`，
  三顆 UX 擴張上蓋因此沒有 `type`，`canEstimate` 為 false。已修。
- **重量全部拿掉**：同款零件個體差異比配裝差異大，顯示或計分都是誤導。
  資料還在 `beybladehub-stats.json`，只是不顯示也不進模型。
- **一體式零件的固鎖欄位**：選 UX 一體型上蓋時，固鎖欄要**鎖死變灰並說明原因**，
  不是消失（`getBuilderSlotSchema()` + `lockedSlotReason()`）。
- **商品卡圖片在 Pages 上 404**：圖網址存成 `/img/xxx.webp`，`<img src>` 要過
  `assetUrl()` 補上部署子路徑。守門測試在 `tests/live/live.spec.ts`（本機 base 是 `/`，
  這個 bug 在本機重現不了）。
- **賽事重複計算**：人工彙整與抓取的同一場活動名稱寫法不同。`eventDedupeKey()`
  取第一個括號前的名稱＋全名裡找到的組別去重。
- **e2e 被 4173 的殘留 preview 毒過兩次**：`reuseExistingServer` 會接上舊的 dist，
  造成假綠假紅。跑 e2e 前先殺掉 4173 的 listener。
- **`vite preview` 只綁 `::1`**：playwright 設定已加 `--host 127.0.0.1`。
- **Windows 上的 `deployPages.mjs`**：環境變數在腳本裡設，`shell: true` 只給 npm 用；
  git 用 shell 會把 commit 訊息照空白切開。

---

## 第八段（2026-09-18）做了什麼

1. **可切換模式的零件**（使用者舉 CX-09 焰神滅世）。掃過全部商品與零件頁，確認
   只有 4 個零件真的有可切換的攻防型態：滅世（翻面）、輔助戰刃 D（翻面）、
   惡魔幽冥（一般／低位模式）、軸心 Op（攻擊／防禦模式）。
   `bit:TK`、`bit:TP` 只改高度不改型態，暴風巨神的「攻防兩面兼備」是結構不是模式，
   三者列在 `excluded` 並寫明理由。
2. **去哪裡買**（`src/domain/sources.ts`）。排序：能一次補到最多缺件 → 一般商品優先
   → 內容單純的優先 → 數量 → 型號。型號結尾 `-00` 視為限定／聯名／門市獨佔，排後面
   （這條是因為它一度推薦「BX-00 版本2.0」這種 B4 門市限定品）。
3. **時鐘幻象的固鎖限制**。查了 BeybladeHub 與 WBO，兩邊清單不一致
   （社群站標 3-85／4-55／7-55／9-65，WBO 標 3-85／4-55／M-85／9-65），
   取聯集五款並在 `disputeZhTW` 寫明分歧，只警告不阻擋。
   **掃過 167 個商品頁，確認只有 UX-16 有搭配限制的描述。**
4. **補建 `9-65` 與 `7-55` 兩顆固鎖**。UX-16 是隨機補充包、內容刻意留空，
   它的原裝固鎖因此從來沒進圖鑑，害搭配限制指不到零件。
   補充零件的建立路徑不會經過陀螺名稱解析，所以要自己從代號補 `heightCode`
   （`9-65` → 65），不然圖鑑會出現沒有高度的固鎖。

---

## 還沒做 / 已知缺口

### A. 視覺改版已完成（保留此節是為了記住設計稿的位置）

深色主題、類型色、商品卡、零件列已經照設計稿改完，但**其餘頁面只吃到底層 token，
版面結構沒照稿重排**：

- 首頁的賽場區塊
- 我能組什麼的「差 1 件」標記
- 想買清單的「最划算的一盒」
- 設定頁的資料來源分類
- 配裝比較的勝出側底色

設計稿：`design-draft/`（11 張 `.dc.html` ＋ `canvas.json`），
已發布畫布 <https://claude.ai/code/artifact/54358ced-1e7e-4533-8fad-75940ed77937>。
種好的 2.6 MB 產物有 gitignore，要改就改 `.dc.html` 再重新 seed。

### B. 4 顆 CX 上蓋仍是合併的

雄鹿之角、海怪扭動、大黃蜂堡、龍神勇氣。社群站零件頁還沒收錄它們的紋章與主刃，
所以維持合併並標 `cxFused`（配裝時不出現鎖定紋章欄位）。
社群站補上就會自動拆開，拆解是比對中文名，不必改程式。

### C. 3 筆商品的官方名稱解析不出零件

`bxa02`、`bx00-jtm`、`bx00-jsq`。內容已由人工彙整補上，但名稱裡沒有固鎖代號也不是一體型。

### D. 3 筆賽事配置解析不出（圖鑑缺零件）

`巨鯨鞭打 FH 9-60 H`、`帝王極變 P.H 7-60 H`、`古屍詛咒 4-50 W`。
缺的是巨鯨（紋章）、鞭打／極變（主刃）、古屍詛咒（上蓋）。補進圖鑑就會自動解析。
另外 `P.H` 這種帶點的寫法解析器還沒處理。

### E. 套裝內容的維護方式是人工

`beybladehub-curated-sets.json` 手工維護，社群站改版或新商品上架要手動補。
自動抓取只處理得了「錨點剛好就是內容」的單純情況；要自動化得先解決
「怎麼區分內容與推薦搭配池」。

### F. 圖片有本機副本但沒有授權

`usageStatus` 仍是 `unknown`。要洗乾淨只有兩條路：取得 BeybladeHub／Takara Tomy 同意，
或改用官方素材（官方只有整盒包裝照，沒有單件去背圖）。
另外 `public/img` 有 9 MB 進了 git，每次重抓都會再長一份歷史；
要控制 repo 大小得考慮改成部署時才抓。

### G. 共用代號的零件來源標記偏保守

輔助戰刃 `T` 先由四件式拆分建立，標了 `community_only`；之後三件式商品若也用 `T`，
`ensurePart` 會沿用既有那顆，來源標記就一直是社群。不影響正確性，
要精確得讓 provenance 可以合併升級。

### H. 版面小瑕疵

3on3 與比較頁在桌機的左欄只有一個下拉選單，下面留白偏多；
手機版三頁的區塊間距偏鬆（Section 18px ＋ stack 12px）。

---

## 建議的下一步順序

設計稿已做完，所以下一個大項目要重新挑。依「投入 / 使用者有感」排：

1. **配件的中文名**（第 1.4 節違規，目前唯一已知的違規）。10 筆純片假名被當成
   **主名稱**渲染在 `PartsPage.tsx`（配件庫分頁）與 `ProductDetailPage.tsx`。
   做法：新增 `src/catalog/sources/beybladehub-accessories.json`，從 BeybladeHub
   查證彙整（附 `sourceUrl` + `quoteZhTW`）。**查不到的不得自己翻**，改成只顯示
   中文類別（發射器／對戰盤／工具），日文原名降為詳情頁次要名稱，並記進 `knownGaps`。
   修完可以把「`/parts` 多點一次配件庫分頁」加進假名巡邏（但**不要**把
   `/part?id=` 整頁加進去，理由見上）。
2. **補 3 顆缺件讓賽事配置解析得出來**（缺口 D）：巨鯨（紋章）、鞭打／極變（主刃）、
   古屍詛咒（上蓋）；`P.H` 這種帶點的寫法解析器也還沒處理。補完賽事證據會更完整，
   首頁的「賽場正在用什麼」也才有機會顯示真正的 G1 場次（目前唯一的 G1 沒有完整
   映射的牌組，所以顯示的是社群賽事）。
3. **`Quantity` 快速連點會遺失更新**（紅隊實測：連點 5 次「+」只加到 3）。
   原因是 `onChange` 用 render 當下的 `value` 算 `next`，多個 handler 用同一個
   尚未更新的值。`ProductsPage` 與 `ProductDetailPage` 兩處都有。
   做法：改成函式式更新，或樂觀 UI + 佇列化寫入。
4. **`stock` 與 `availability` 合併成一次查詢。** 目前是兩次獨立的 `allLots()`
   讀取，理論上有極短的 key 集合不一致視窗，會讓零件詳情的 fallback 顯示
   不對應的數字（機率極低、下次 refresh 自動修正）。
5. **3on3 的手動組隊器**（設計稿 `Deck.dc.html` 畫的三槽角色卡）。
   那是新功能不只是改版，**做之前要先問使用者要不要做**。
6. **B 等社群站更新**，每隔一陣子重跑 `fetchHubStats.mjs` 看有沒有補上那 4 顆 CX 上蓋。
7. F、G 是長期議題，沒有外部條件配合做不完。

---

## 給接手者的提醒

- 這個 repo 的主要價值在**資料的誠實度**，不在功能多。
  加功能前先問「這個數字是從哪來的、查得回去嗎」。
- 使用者說的「自檢」是真的要跑、要看，不是宣稱。改資料就把數字撈出來核對，
  改畫面就截圖看，不要憑推理說「應該沒問題」。
- 前台文案用台灣玩家的講法。不確定就去 <https://beybladehub.app> 查，不要自己翻。
- 做完一段就 commit、push、`npm run deploy:pages`，不要累積一大包。
