# 交接筆記

寫給下一個接手的 session。最後更新：2026-09-18（第八段結束）。

這份文件會被整份蓋掉重寫，不是逐段追加。要看歷史細節請用 `git log`。

---

## 明天開工第一件事：工作區有沒推的改動

最後一個 commit 是 `2efdf4e`（可切換模式、去哪裡買、時鐘幻象固鎖限制，已部署上線）。
**在那之後還有一批改動只在工作區，沒有 commit、沒有推、沒有部署。**

### 那批改動是什麼

上一段收尾時照規則截圖自檢，發現**前台文案還在講「重量」**——重量早就整個拔掉了，
但「資料不足」那類說明字串沒跟著改。已經改掉的字串：

| 檔案 | 原本 | 改成 |
|---|---|---|
| `src/ui/pages/BuilderPage.tsx` | 官方尚未公布這些零件的類型與**重量** | 類型與旋向 |
| `src/ui/pages/HomePage.tsx` | 目前零件的**重量**與類型官方尚未公布 | 類型與旋向 |
| `src/ui/pages/PartDetailPage.tsx`（2 處） | 類型、**重量**與軸心特性 | 類型、旋向與軸心特性 |
| `src/ui/pages/SettingsPage.tsx` | 進階模式會顯示**重量**、來源與缺漏清單 | 顯示來源與缺漏清單 |
| `src/domain/deck.ts`（2 處） | 缺少官方類型與**重量**資料 | 類型與旋向 |
| `src/domain/provenance.ts` | **重量**、類型與軸心特性官方未公布 | 類型、旋向與軸心特性 |
| `scripts/buildCatalog.mjs` 的 `knownGaps` | 官方商品頁未公布零件的類型、**重量**、旋向與軸心特性 | 類型、旋向與軸心特性 |

`knownGaps` 那條會直接印在設定頁上，所以改完要 `npm run build:catalog`（已經跑過，
`catalog-audit.json` 的 diff 就是它）。

程式註解裡提到重量的地方**刻意保留**（那些是在解釋為什麼拿掉），只有使用者看得到的字串要清乾淨。

### 同一批還加了三條測試

- `tests/e2e/acceptance.spec.ts`：時鐘幻象裝 3-60 要警告、換 9-65 就不警告、警告要附來源連結，
  而且**不能擋儲存**（`compat-error` 必須是 0 筆）。
- `tests/e2e/acceptance.spec.ts`：選到惡魔幽冥要列出可切換模式與來源連結。
- `tests/e2e/pwa.spec.ts`：**巡所有頁面，畫面上不得再出現「重量」兩個字**。
  就是這條抓到上面那批漏網字串的。

前兩條做過變異驗證（把白名單加上 3-60、把「低位模式」改名，測試都會紅），第三條本來就是紅的才寫的。

`src/ui/pages/BuilderPage.tsx` 另外補了 `data-testid="compat-warning"`，
並讓每則相容性警告後面附上可回查的來源連結（規格 1.5 節）。

### 接手步驟

```bash
git status                     # 應該看到上面那 10 個檔案是 M
npm run typecheck              # 已驗過：綠
npm test                       # 已驗過：402 過
npm run build && npm run test:e2e        # ← 只剩這步沒跑完整套
git add -A && git commit && git push origin main
npm run deploy:pages && npm run test:live
```

三條新測試都個別跑綠了（含那條重量巡邏），**但全套 e2e 還沒在這批改動之後重跑過**。
接手時先跑一次全套再推。全套約 10 分鐘。

寫那條重量巡邏測試時踩過一個坑：配裝器預設是「只顯示我有的」，新的測試 context 庫存是空的，
所以選零件前要先按「顯示全部圖鑑」，不然 picker 是空的、測試會卡在 30 秒逾時
（看起來像測試壞掉，其實是模式問題）。

---

## 一分鐘現況

Beyblade X 收藏／配裝／分析的 PWA，繁體中文（台灣用語），深色單一主題，手機優先。

- 上線網址：<https://megaking0801.github.io/beyblade-x-loadout/>
- 原始碼：<https://github.com/megaking0801/beyblade-x-loadout>
- 目前狀態：**全綠**。typecheck 通過、單元 402 筆全過、e2e 75 過 1 skip。
- 主要功能都在：圖鑑、我的零件、配裝器（含證據、可切換模式、搭配限制、去哪裡買）、
  3on3、配裝比較、我能組什麼、想買清單、設定。
- 最大的未完成品是**視覺**：設計稿 11 張只實作到底層 token 與部分元件，多數頁面版面還是舊的。

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

### A. 視覺改版只做完第一階段 ← 最大的一塊

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

1. **把設計稿實作完**（缺口 A）。使用者最在意的就是「整個網頁太醜」，
   而且已經看過設計稿、同意了方向。一頁一頁做，每頁做完截圖自檢。
2. **順手修 H 的版面小瑕疵**，跟 1 是同一類工作。
3. **補 D 的 3 顆缺件**，賽事證據就會更完整，配裝器的理由也更有東西可講。
4. **B 等社群站更新**，每隔一陣子重跑 `fetchHubStats.mjs` 看看有沒有補上。
5. F、G 是長期議題，沒有外部條件配合做不完。

---

## 給接手者的提醒

- 這個 repo 的主要價值在**資料的誠實度**，不在功能多。
  加功能前先問「這個數字是從哪來的、查得回去嗎」。
- 使用者說的「自檢」是真的要跑、要看，不是宣稱。改資料就把數字撈出來核對，
  改畫面就截圖看，不要憑推理說「應該沒問題」。
- 前台文案用台灣玩家的講法。不確定就去 <https://beybladehub.app> 查，不要自己翻。
- 做完一段就 commit、push、`npm run deploy:pages`，不要累積一大包。
