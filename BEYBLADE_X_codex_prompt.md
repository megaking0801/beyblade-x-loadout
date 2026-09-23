# Codex 開發指令 — BEYBLADE X 配裝分析 PWA

你要建立一個可安裝、手機優先、可離線使用的 BEYBLADE X PWA。

這不是單純圖鑑，而是：

> 個人庫存管理 + 配裝分析 + 3on3 組隊 + 新手教學 + 未來賽事大數據

---

# 1. 最重要產品原則

1. PWA 初次開啟時，個人資料必須完全空白：
   - 我的商品：0
   - 我的零件：0
   - 我的配裝：0
   - 我的 3on3：0

2. 公共 Master Catalog 可以是完整的，但不能預載任何個人庫存。

3. 前台一律使用：
   - 台灣官方中文名稱
   - 台灣市場常用中文說法

4. 英文、日文、海外名稱、玩家暱稱：
   - 可以保留在資料庫
   - 可以當搜尋別名
   - 不得作為前台主要名稱

5. 不能編造：
   - 勝率
   - 官方數據
   - 賽事樣本
   - 商品內容
   - 零件相容性
   - 台灣正式名稱

---

# 2. 技術建議

使用：

- React
- TypeScript
- Vite
- vite-plugin-pwa
- IndexedDB
- Dexie.js
- Tailwind CSS
- Zustand 或 React Context

必須：

- RWD
- 手機優先
- iPhone Safari 可加入主畫面
- Android 可安裝
- 桌機可用
- 離線可開啟
- 離線可修改本地庫存
- manifest.json
- service worker
- App icon

---

# 3. 核心資料分層

必須分成：

## A. Catalog
所有官方商品、版本、零件、圖片、名稱、來源。

## B. Inventory
使用者自己擁有的商品與零件。

## C. Saved Combos
使用者儲存的配裝。

## D. Decks
使用者儲存的 3on3。

## E. Tournament Data
未來加入的賽事資料。

Catalog 更新不得覆蓋個人 Inventory。

---

# 4. Master Catalog 要求

目標是盡可能完整收錄目前 BEYBLADE X 官方商品與可玩零件。

至少涵蓋：

- BX
- UX
- CX
- Starter
- Booster
- Random Booster
- Random Select
- Deck Set
- Battle Set
- Entry Set
- Part Set
- 單賣零件
- 限定色
- Metal Coat
- B4 Store 限定
- App 限定
- Event 限定
- Rare Bey Get Battle
- Takara Tomy Mall 限定
- 比賽獎品
- 抽選／抽獎／くじ／獎項類
- 聯名商品
- 雜誌／Corocoro 附錄或限定
- 區域限定
- X-Over Project
- 其他官方正式發行且含可玩零件的商品

Launcher、Stadium、Grip、Case、Tool 等配件也可進 Catalog，但不進配裝器。

---

# 5. 命名規則

資料庫建議：

```ts
Naming {
  primaryZhTW: string
  aliasesZhTW?: string[]
  nameJa?: string
  nameEn?: string
  nameHasbro?: string
  nickname?: string[]
}
```

前台顯示：

- 主標：primaryZhTW
- 副標：型號
- 詳細頁才可顯示日文／英文次要名稱

搜尋可以接受所有別名，但結果仍顯示台灣中文主名稱。

如果新品尚無台灣正式名稱：
- 使用「型號 + 暫譯中文描述」
- 標註暫譯
- 不得直接把英文當主標

---

# 6. UI 用語

主要使用：

- 上蓋
- 固鎖
- 軸心
- 攻擊
- 防守
- 持久
- 平衡
- 配裝
- 零件庫
- 商品庫
- 想買清單
- 已擁有
- 未到貨
- 已借出
- 已出售
- 已損壞
- 收藏
- 比賽

避免前台直接使用：
- Blade
- Ratchet
- Bit
- Attack
- Defense
- Stamina
- Balance
- Deck
等英文術語作主要名稱。

---

# 7. 商品資料模型

```ts
Product {
  id: string
  sku?: string
  line: "BX" | "UX" | "CX" | "OTHER"
  category:
    | "starter"
    | "booster"
    | "random_booster"
    | "deck_set"
    | "battle_set"
    | "part_set"
    | "limited"
    | "event"
    | "prize"
    | "lottery"
    | "collaboration"
    | "magazine"
    | "tool"
    | "accessory"
  nameZhTW: string
  nameJa?: string
  nameEn?: string
  releaseDate?: string
  region: string[]
  sourceUrls: string[]
  imageIds: string[]
}
```

---

# 8. 商品變體

Random Booster、限定色等不能只存在 Product。

```ts
ProductVariant {
  id: string
  productId: string
  variantName: string
  rarity?: string
  probability?: number
  contents: ProductContent[]
  imageIds: string[]
}
```

---

# 9. 零件資料模型

```ts
Part {
  id: string
  family:
    | "blade"
    | "ratchet"
    | "bit"
    | "lock_chip"
    | "main_blade"
    | "assist_blade"
    | "integrated_blade"
    | "other"
  code: string
  nameZhTW: string
  nameJa?: string
  nameEn?: string
  spinDirection?: "right" | "left" | "dual"
  type?: "attack" | "defense" | "stamina" | "balance"
  heightMm?: number
  officialWeightG?: number
  notes?: string
}
```

同一零件不同顏色／Metal Coat／版本：

```ts
PartVariant {
  id: string
  partId: string
  color?: string
  finish?: string
  metalCoat?: boolean
  moldRevision?: string
  region?: string
  measuredWeightG?: number
  imageIds: string[]
  sourceProductIds: string[]
}
```

---

# 10. 個人庫存必須支援完整 CRUD

我的商品：

- 新增
- 修改
- 刪除
- 調整數量
- 改狀態
- 備註

我的零件：

- 新增
- 修改
- 刪除
- 調整數量
- 改狀態
- 收藏
- 備註
- 查看來源

---

# 11. 數量規則

同一商品可以有多盒。

例如：

```txt
某商品 ×3
```

若每盒含：

```txt
A ×1
B ×1
C ×1
```

則自動聚合：

```txt
A ×3
B ×3
C ×3
```

如果使用者又單獨新增：

```txt
B ×2
```

則：

```txt
B 總庫存 ×5
```

來源必須可追蹤：

```txt
商品來源 ×3
單獨購入 ×2
```

---

# 12. 庫存來源模型

不要只存總數量。

```ts
InventoryLot {
  id: string
  sourceType: "product" | "standalone_part" | "manual_adjustment"
  sourceId?: string
  partId: string
  quantity: number
  status: "owned" | "ordered" | "loaned_out" | "sold" | "lost" | "damaged"
  condition: "new" | "used" | "worn"
  notes?: string
  createdAt: string
}
```

畫面顯示的是聚合值。

---

# 13. Random Booster 規則

Random Booster 不能自動加入所有可能零件。

使用者新增時：

```txt
未拆封
或
已拆封
```

未拆封：
- 只記商品數量
- 不加入可用零件

已拆封：
- 選擇實際抽到的 ProductVariant
- 只加入該版本零件

若有多包：

```txt
未拆 ×2
A 款 ×1
C 款 ×2
```

必須正確記錄。

---

# 14. Set 規則

Deck Set、Battle Set 等可能含多顆陀螺。

商品數量 ×N 時：
- 所有內含可玩零件各乘 N
- Launcher / Grip 等可進配件庫
- 但不進配裝器

---

# 15. 商品狀態

至少：

- 已擁有
- 已下單未到貨
- 想買
- 已出售

未到貨商品：
- 可顯示其預計零件
- 不得計入「可用庫存」
- 可在「到貨後模擬」中使用

---

# 16. 零件狀態

至少：

- 可用
- 未到貨
- 借出
- 已出售
- 遺失
- 損壞
- 磨耗

只有可用數量能正式進入：
- 配裝器
- 3on3
- 自動推薦

---

# 17. 配裝器

預設流程：

```txt
上蓋 → 固鎖 → 軸心
```

CX 或特殊 UX 結構依實際規則顯示正確欄位。

三種模式：

1. 只顯示我有的
2. 顯示全部圖鑑
3. 假想購買

---

# 18. 相容性

必須阻止實體無法組裝的配置。

至少處理：

- BX 標準結構
- UX 標準／特殊一體式
- CX 模組化
- 左旋／右旋限制
- 特殊固鎖／軸心限制
- 其他已知特殊規則

錯誤時顯示：

```txt
此組合無法實際安裝。
```

並說明原因。

---

# 19. 配裝結果

至少顯示：

- 完整配置名稱
- 類型
- 攻擊
- 防守
- 持久
- 爆發
- 抗爆
- 穩定
- 操作難度
- 高度
- 旋向
- 建議發射方式
- 優點
- 缺點
- 庫存是否足夠
- 資料可信度

---

# 20. 強度分析架構

不要只用一個主觀分數。

拆成：

## A. 客觀資料
- 重量
- 高度
- 旋向
- 結構
- 官方類型
- 軸心特性

## B. 配裝協同性
- 低位／高位
- 刮地風險
- 攻擊角度
- 重心
- 持久協同
- 防守協同
- 左右旋對位

這層必須標示：
`模型推估`

## C. 賽事證據
- 出現次數
- Top 4 次數
- 冠軍次數
- 30 / 90 / 180 天
- 地區
- 賽事級別
- 場地
- 格式
- 樣本數

## D. 可信度
- 高
- 中
- 低

---

# 21. 賽事資料規則

若只有 Top Cut deck list：
- 不可計算勝率

只能算：
- 出場率
- Top Cut 使用率
- 冠軍次數
- Placement score
- Meta share

只有真的有逐場對戰資料，才能算 matchup win rate。

小樣本不可直接比較百分比。
至少使用：
- Bayesian shrinkage
或
- Wilson interval
或
- confidence weighting

---

# 22. 賽事來源分級

```ts
sourceTier:
  "official"
  | "official_organizer"
  | "verified_community"
  | "community"
  | "user_submitted"
```

UI 必須可查看來源。

---

# 23. 賽事資料模型

```ts
TournamentEvent {
  id: string
  name: string
  date: string
  country: string
  region?: string
  tier?: "G1" | "G2" | "G3" | "S1" | "community" | "other"
  format?: string
  stadium?: string
  participantCount?: number
  sourceTier: string
  sourceUrl: string
}
```

```ts
TournamentDeck {
  id: string
  eventId: string
  placement?: number
  combos: string[]
  sourceUrl: string
}
```

---

# 24. 初版 Seed Data

v1 應預載：

- Product Catalog
- Product Variant
- Part Catalog
- 相容性規則
- 商品 → 零件對應
- 台灣名稱
- 搜尋別名
- 圖片來源
- 官方來源 URL

賽事資料：
- 至少帶入一批可驗證已完成賽事作為分析測試
- 若資料不足，顯示：
  `賽事資料仍在建置中`

不得用少量賽事假裝完整 Meta。

---

# 25. 圖片

商品與零件頁必須支援圖片。

至少：

- 商品主圖
- Random Booster 各版本圖
- 上蓋圖
- 固鎖圖
- 軸心圖
- 特殊色
- Metal Coat

資料模型：

```ts
ImageAsset {
  id: string
  entityType: "product" | "product_variant" | "part" | "part_variant"
  entityId: string
  url: string
  thumbnailUrl?: string
  sourceUrl: string
  sourceName: string
  copyrightOwner?: string
  usageStatus: "link_only" | "permission_granted" | "user_uploaded" | "unknown"
}
```

不要隨意抓網路圖片重新散布。

優先：
1. 官方可用素材
2. 外部連結
3. 使用者自行上傳

---

# 26. 我的零件頁

分類：

- 上蓋
- 固鎖
- 軸心
- CX 組件
- 特殊一體式
- 配件

每張卡至少：

```txt
[圖片]

台灣中文名稱
型號／代號
簡短白話用途

可用 ×N
未到貨 ×N
```

---

# 27. 零件來源反查

點任何零件後顯示：

- 哪些商品含此零件
- 哪些版本含此零件
- 我有幾個
- 哪些配裝正在使用
- 常見搭配
- 賽事使用情況

---

# 28. 商品反查

點任何商品顯示：

- 商品圖片
- 型號
- 台灣中文名稱
- 發售方式
- 發售日期
- 所有內含零件
- Random Booster 所有可能版本
- 我的數量
- 我的實際開封結果
- 來源網址

---

# 29. 「我現在能組什麼」

按鈕：

```txt
用我的零件產生可組配置
```

可排序：

- 最適合新手
- 攻擊最高
- 持久最高
- 最穩
- 賽事證據最多
- 操作最簡單

---

# 30. 儲存配裝

每套可：

- 命名
- 收藏
- 備註
- 設定定位
- 標記是否已實際組裝

---

# 31. 實體鎖定

若標記：

```txt
🔒 已實際組裝
```

則對應零件占用實際庫存。

例如：

```txt
9-60 可用 ×2
```

兩套實體配裝各用 1：
```txt
剩餘 ×0
```

第三套只能：
- 理論模擬
- 不可標記為實體可組

---

# 32. 3on3

按鈕：

```txt
用我現有零件組 3on3
```

必須檢查：

- 庫存數量
- 未到貨
- 相容性
- 正式規則下的重複零件限制
- 角色分工

推薦模式：

- 最適合新手
- 最穩定
- 最暴力
- 平衡型
- 最高賽事證據
- 對攻擊
- 對持久

---

# 33. 3on3 結果

每隊至少標示：

- 主攻
- 持久
- 穩定／抗攻
- 特殊對位

並解釋：
- 為什麼這三顆一起用
- 哪些零件被占用
- 哪些替代方案可用

---

# 34. 配裝比較

支援 A / B 比較：

- 攻擊
- 防守
- 持久
- 高度
- 穩定
- 操作難度
- 賽事證據
- 可信度

重點是讓新手看懂：
「我只換一個固鎖／軸心，到底差在哪？」

---

# 35. Wishlist

商品可加入想買清單。

顯示：

```txt
買這盒會新增：
零件 A ×1
零件 B ×1
零件 C ×1
```

以及：

```txt
可解鎖的新配裝數量
```

---

# 36. 分享

至少支援：

- 複製文字
- 分享連結
- 可選 QR Code

預設只分享配裝／3on3。
不得未經使用者同意分享完整個人庫存。

---

# 37. 備份

必須支援：

```txt
匯出我的資料
匯入備份
```

JSON 至少包含：

- 商品
- 零件
- 配裝
- 3on3
- Wishlist
- 設定

---

# 38. 新手模式 / 進階模式

新手模式：
- 大圖
- 中文白話
- 少量必要數據
- 告訴使用者「為什麼」

進階模式：
- 重量
- 高度
- 賽事樣本
- Meta
- 詳細對位
- 資料來源

---

# 39. 首頁

建議：

## 我的庫存
- 商品數
- 上蓋數
- 固鎖數
- 軸心數

## 快速操作
- 新增商品
- 新增零件
- 配裝器
- 我能組什麼
- 3on3

## 最近使用
- 最近配裝
- 最近隊伍

---

# 40. 搜尋

支援：

- 台灣中文名稱
- 型號
- 英文名
- 日文名
- 海外名稱
- 玩家別名

搜尋結果永遠以台灣中文主名稱顯示。

---

# 41. 資料來源與驗證

每筆 Catalog 資料至少可保存：

```ts
sourceUrl
verifiedAt
verificationStatus
```

```ts
verificationStatus:
  "official_verified"
  | "multi_source_verified"
  | "community_only"
  | "needs_review"
```

來源優先：

1. Takara Tomy BEYBLADE X 日本官方
2. Takara Tomy Asia / 台灣官方
3. 官方新聞／活動／限定公告
4. 官方說明書
5. 官方合作商品頁
6. 高品質社群資料庫
7. 人工核對

---

# 42. Catalog Audit

發布 v1 前必須檢查：

- 官方型號是否完整
- Random Booster 是否有所有版本
- Deck Set 是否完整拆解
- Battle Set 是否完整拆解
- 限定品是否收錄
- App / Event 限定是否收錄
- Prize / Lottery 是否收錄
- Collaboration 是否收錄
- 每個商品是否有圖片或 fallback
- 每個商品是否能對應零件
- 每個零件是否至少有一個來源
- 台灣中文名稱是否核對
- 相容性規則是否完整

---

# 43. 初版必做

- [ ] 空白個人庫存
- [ ] 完整 Master Catalog 架構
- [ ] 商品 CRUD
- [ ] 零件 CRUD
- [ ] 數量
- [ ] 商品 → 零件自動聚合
- [ ] Random Booster 開封流程
- [ ] Set 多顆內容
- [ ] 未到貨
- [ ] 單獨零件加入
- [ ] 來源追蹤
- [ ] 圖片
- [ ] 相容性
- [ ] 配裝器
- [ ] 我能組什麼
- [ ] 強度分析架構
- [ ] 新手解說
- [ ] 儲存配裝
- [ ] 實體鎖定
- [ ] 配裝比較
- [ ] 3on3
- [ ] Wishlist
- [ ] 分享
- [ ] JSON 匯出／匯入
- [ ] 離線 PWA
- [ ] 台灣中文前台
- [ ] 搜尋別名
- [ ] 資料版本顯示

---

# 44. 暫時不要做

v1 先不要：

- 登入
- 雲端同步
- 好友
- 留言
- 社群 Feed
- AI 拍照辨識
- 即時價格
- 自動比價
- 自動網購
- 個人 Elo
- 完整 AI 對戰勝率預測

---

# 45. 驗收核心情境

## Case 1
第一次開 App：
```txt
我的商品 0
我的零件 0
```

## Case 2
加入商品 ×3：
商品內每個零件自動 ×3。

## Case 3
另加單一零件 ×2：
聚合正確，來源可追蹤。

## Case 4
未到貨：
不算可用庫存。

## Case 5
Random Booster 未拆：
不加入任何實際零件。

## Case 6
Random Booster 開封：
選擇實際版本後才加入零件。

## Case 7
實體鎖定：
庫存會被占用。

## Case 8
配裝器：
不可儲存無法安裝的配置。

## Case 9
3on3：
不得超過實際可用數量。

## Case 10
搜尋英文或日文別名：
結果仍顯示台灣中文主名稱。

---

# 46. 最終 UX 目標

任何新手打開後，應能自然完成：

```txt
我買了什麼
↓
系統知道我有哪些零件
↓
我現在可以怎麼組
↓
這樣組強不強
↓
為什麼
↓
有哪些實際比賽證據
↓
我的 3on3 該怎麼排
↓
如果缺件，要買哪盒
```

如果任何一個主要流程需要使用者先懂大量 BEYBLADE X 專有名詞，表示 UI 還不夠好。

---

# 47. 每個步驟完成後的自檢規則（強制）

這是開發流程的硬性規則，不是建議。

任何一個步驟（一個資料模型、一個頁面、一個流程、一次重構、一次資料匯入）在說「完成」之前，必須先做完下列自檢並把結果寫出來。沒寫自檢結果就不算完成。

## 47.1 每步驟必做：自己讀 diff，不派代理、不跑 e2e

每個步驟做完後**自己**讀一次剛寫的 diff。**這一步不派代理、不跑端到端測試**——
兩者都移到 47.6 的上線前關卡。

要挑的只有這幾項，共同點是**只有讀才抓得到、測試抓不到**：

1. 回讀規格：對照本文件相關章節逐條確認，不是憑印象。
2. **有沒有編造**的資料、數值、來源（第 1.5 節）。
3. **來源標錯方向**：把社群資料標成官方，或把官方資料標成社群
   （`provenance` 管零件身分，`statsProvenance` 管數值來源，兩者不可混用）。
4. **破壞既有斷言**：testid、`toHaveText` 裡的字面空白、
   `getByRole('cell', { exact: true })` 的精確名稱、`getByRole('heading')` 的子字串碰撞。
5. **沒資料時顯示什麼**：undefined、空陣列、`length === 0`。
   曾經出過「差 0 件」這種自相矛盾的字。
6. 前台有沒有漏出日文假名（第 1.4 節），或已被拔除的欄位（重量）。

然後跑這兩個，加起來約 11 秒，每步都做：

- `npx tsc -b`
- `npm test`（Vitest 全套，數百筆只要幾秒，便宜到沒有理由跳過）

改了畫面就截圖看（手機寬度 + 桌機寬度各一次）。改了畫面不看畫面不算做完。
檢查有沒有殘留執行期錯誤。清掉這一步產生的測試產物與暫存檔。

## 47.2 資料相關步驟額外自檢

- 每筆新增的 Catalog 資料是否有 `sourceUrl`、`verifiedAt`、`verificationStatus`。
- 沒有可驗證來源的資料，必須標 `needs_review`，不得填成已驗證。
- 有沒有編造：勝率、官方數據、賽事樣本、商品內容、零件相容性、台灣正式名稱。若有，立刻移除。
- 前台顯示是否為台灣中文主名稱；無正式名稱者是否標「暫譯」。

## 47.3 庫存／配裝步驟額外自檢

- 新開狀態下個人資料是否仍為 0（第 1 節）。
- 商品 ×N 的零件聚合數字是否正確，來源是否可追蹤回 `InventoryLot`。
- 未到貨 / 借出 / 已出售 / 遺失 / 損壞 是否確實被排除在可用庫存之外。
- Random Booster 未拆封是否沒有加入任何零件。
- 實體鎖定是否真的占用庫存，超量時是否阻止標記為實體可組。
- 相容性檢查是否真的阻止無法安裝的組合，且不可儲存。

## 47.4 自檢回報格式

每步結束時回報：

```txt
步驟：<做了什麼>
對照章節：<第 N 節>
已跑的驗證：<指令與結果>
發現的問題：<有／無，以及當場如何修正>
尚未驗證的部分：<明講，不得省略>
清理狀況：<測試產物已清除／無產物>
```

## 47.5 禁止事項

- 不得因為 token 或時間不足而假稱完成。遇限制時留下「已做／未做／下一步／相關檔案路徑」。
- 不得把「應該可以」當成驗證結果。
- 不得跳過自檢直接進下一步。
- **不得每個小步驟都跑端到端測試或派代理審查。** 那會把上線前該做一次的驗證
  變成每步做一次，總體時間就是這樣被吃掉的。
- 不得把「應該可以」當成驗證結果。

## 47.6 上線前關卡（一個可部署批次只做一次）

端到端測試、截圖與對抗式審查都在這裡，**不在每個步驟**。

順序固定，理由寫在後面：

1. `npm run test:e2e` —— **不要在前面自己加 `npm run build`**。
   Playwright 的 `webServer.command` 本身就是 `npm run build && npm run preview`，
   本機的 `reuseExistingServer` 為 true，自己先 build 等於 build 兩次。
   跑之前先殺掉 4173 上殘留的 preview，否則會接上舊的 dist 造成假綠假紅。
2. `npm run shots`，然後**實際看圖**。
   **一定要排在測試之後**：`npx playwright test` 開跑時會清掉 `test-results/`，
   先截圖再跑測試等於白截。
3. 推 → `npm run deploy:pages` → `npm run test:live`。

### 對抗式審查（紅隊）放在這裡，而且不阻塞

同一時間派一個紅隊代理讀**整批** diff，與上面第 1、2 步並行，不要坐著等它。
提示必須是受限版：

```
只讀 git diff <上一個已部署的 commit>..HEAD。
禁止：npm run build、任何測試套件、起 dev 或 preview server、
      寫任何檔案進 repo、pkill、rm -rf dist。
測試與截圖由我自己跑，不要重複。
只回報三類：編造的資料／破壞既有斷言／沒資料時的顯示。
每項要 file:line 與具體失敗情境。
```

用 `model: 'sonnet'`，不要繼承較貴的模型。

**為什麼禁止它執行任何東西**：代理起 server、`pkill vite preview`、`rm -rf dist`
會直接弄死正在跑的測試（曾經因此白跑兩次全套）。而它跑的那些驗證本來就會跑一次。

**派出代理之後不要動同一個工作樹**——只做讀取，或直接等它。
曾經在代理跑的時候 `git stash`，把它的暫存檔一起動了還跟它搶埠。

### 不受本節限制的

第 48 節的 TDD 流程照舊：寫新功能時**該功能自己的**測試先紅後綠，
但只跑那一個檔（`npm test -- tests/unit/xxx.test.ts`）。

`npm test`（Vitest）也不受限制 —— 它只要幾秒，每步都該跑。
本節限制的是端到端測試與代理審查。

---

# 48. 測試策略（強制）

採用 **TDD 為主 + BDD 外圈**。不導入 Cucumber / Gherkin / `.feature` 檔。

理由：Gherkin 的價值在讓非技術 stakeholder 讀 feature 檔，本專案沒有這個需求，多一層 step definitions 只是開銷。但第 45 節 Case 1–10 本身就是驗收契約，必須保留成情境級測試，不可拆散成零碎 unit test。

## 48.1 工具

- 單元測試：Vitest
- 端到端／情境測試：Playwright
- 不使用 Cucumber、不寫 `.feature` 檔

## 48.2 外圈：驗收情境（BDD 精神，TDD 機制）

- 第 45 節 Case 1–10 各對應一個 Playwright 測試。
- `describe` / `it` 名稱直接用中文情境句，例如：
  ```ts
  it('第一次開 App 時，我的商品與我的零件都是 0', ...)
  it('加入商品 ×3 後，商品內每個零件自動變成 ×3', ...)
  ```
- 專案初始化時就把 10 個測試全部寫出來，未實作的先 `it.skip`。
- 這 10 個測試全綠 = v1 的 definition of done。不得在未全綠時宣稱 v1 完成。
- 必須真的走 IndexedDB 與真實 UI，不可用 mock 取代。

## 48.3 內圈：領域邏輯 TDD（red → green → refactor）

下列邏輯一律先寫 failing 測試再寫實作：

- 庫存聚合：`InventoryLot[]` → 可用數量（第 11、12 節）
- 狀態過濾：未到貨／借出／已出售／遺失／損壞／磨耗 不計入可用（第 15、16 節）
- Random Booster 未拆封 vs 已拆封（第 13 節）
- Set ×N 展開、Launcher / Grip 不進配裝器（第 14 節）
- 相容性規則：BX 標準、UX 標準與一體式、CX 模組化、左右旋限制（第 18 節）
- 實體鎖定的庫存占用與超量阻擋（第 31 節）
- 3on3 重複零件限制與庫存上限（第 32 節）
- 統計：Wilson interval / Bayesian shrinkage / confidence weighting（第 21 節）

統計那項強制 TDD 並附已知答案的測試向量。數學錯誤肉眼看不出來，不得只靠目測結果合理就通過。

## 48.4 架構要求（由測試策略推導，硬性）

- 領域邏輯必須是**純函式**：輸入 plain array / plain object，輸出 plain object，不依賴 Dexie、不依賴 IndexedDB、不依賴 React。
- Dexie 只能出現在 repository 層。
- 純函式層不得 import repository；資料由呼叫端傳入。
- 不遵守此分層，內圈測試就必須啟動 fake IndexedDB，速度會使 TDD 無法持續。

## 48.5 開發順序

1. 建立專案骨架，寫出第 45 節 Case 1–10 的 Playwright 測試（未實作者 `it.skip`）。
2. 每個功能：Vitest 單元測試 red → 實作 green → refactor。
3. 功能完成後解除對應 Case 的 skip，確認轉綠。
4. 每個步驟結束跑第 47 節自檢。

## 48.6 禁止事項

- 不得先寫實作再補測試後宣稱 TDD。
- 不得為了讓測試通過而修改測試期望值以迎合錯誤實作；先確認規格，規格對就修實作。
- 不得刪除或長期 skip 第 45 節的驗收測試。若必須 skip，要在回報中明列原因與解除條件。
- 不得用 mock 取代第 45 節情境測試中的 IndexedDB 與 UI。

---

# 49. 不要偷懶（強制）

這節優先於任何「效率」考量。

## 49.1 定義：什麼算偷懶

以下行為一律禁止，出現即視為未完成：

- 用 `TODO`、`// 待補`、`throw new Error('not implemented')` 佔位後宣稱該功能完成。
- 只做規格的一部分卻回報整節完成。
- 資料只 seed 幾筆樣本，卻讓 UI 看起來像完整 Catalog。
- 測試只寫 happy path，跳過邊界與錯誤情境。
- 測試寫成必定通過（沒有斷言、斷言恆真、`expect(true).toBe(true)`）。
- 為了讓測試變綠而放寬斷言或改期望值，而不是修實作。
- 長期 `it.skip` 而不在回報中列出原因與解除條件。
- 以「應該可以」、「理論上正確」代替實際執行驗證。
- 複製貼上同樣邏輯到多處而不抽出，導致後續只改一處。
- 跳過第 47 節自檢或第 48 節測試流程。
- 遇到難題就縮小規格範圍，而不先回報並詢問。

## 49.2 必須做完才算完成

- 規格該節的每一條都實作或明確標記未做並說明原因。
- 每個狀態、每個分支、每個錯誤路徑都有對應測試。
- 邊界情境要測：數量 0、數量超量、空庫存、重複零件、未到貨、已拆封與未拆封並存、左右旋衝突、無效輸入。
- UI 要在手機寬度與桌機寬度各實際看過。
- 離線要實際斷網測過一次。

## 49.3 遇到障礙時的正確做法

不可默默縮小範圍。順序是：

1. 先把不依賴該障礙的部分全部做完。
2. 在回報中明確寫出：卡在哪、為什麼、有哪些選項、你建議哪個。
3. 需要使用者決定才會影響正確性的，才停下來問。
4. 其餘一律標註假設後繼續做完。

## 49.4 回報誠實度

- 測試沒過就說沒過，附上最短的決定性錯誤訊息。
- 步驟跳過就說跳過。
- 沒驗證的就說沒驗證。
- 不得用模糊措辭掩蓋未完成（「基本上完成」、「大致可用」一律不接受）。

---

# 50. 零件層級強度分數（社群賽果聚合）

2026-09-24 設計討論確認。目的：讓「下一包推薦」與「3on3 組隊」對**沒有完整配置賽事紀錄**的
型錄配置也能拿到非零分數，取代目前這種配置一律 0 分的覆蓋率死角。

## 50.1 資料限制（先講清楚，不得迴避）

- `stanyao-raw-records.json` 的 `rank` 只收 1～3 名，站方沒有記錄「打了但沒進前三」的場次。
- 換句話說：這批資料**只有正例，沒有負例**，算不出真正的「進前三機率」或「勝率」，
  只能算「進前三次數多不多」。
- 因此本節**不得**實作、不得宣稱任何形式的勝率預測、名次預測或「準確率」（違反第 1.5 節）。
  唯一合法的輸出是「零件在賽果紀錄裡的聲量聚合分數」，性質上跟現有 `percentileScore`
  是同一種東西，只是聚合單位換成零件。

## 50.2 產物

- 新增 `src/catalog/sources/part-strength.generated.json`：逐 partId 記錄百分位分數、
  樣本數（進前三次數）、來源、更新時間。跟 `stanyao-combo-summary.json` 同層級，
  是資料產物，不是程式。
- 演算法：展開 `stanyao-raw-records.json` 每筆的 `comboPartIds`，同一零件跨不同配置的
  進前三次數加總，套用 `competitiveMeta.ts` 既有的 `computePercentiles()` 算百分位，
  不得另外發明一套沒校準過的公式。
- 產物需標 `provenance`／`verificationStatus: 'community'`，不得標成官方。

## 50.3 整合點與 fallback 規則

- **不進 `analyzeCombo()`／`ComboAnalysis`。** 跟 `expertTierGain` 同一個既有模式：
  不當成 evidence 層的一部分，直接在 `deck.ts` 用 `member.slots` 查零件強度索引、
  加總——`analysis.ts`／`builder.ts` 完全不用改，索引透過 `SuggestDecksArgs` 的新欄位
  `partStrengthIndex?: Map<string, PartStrengthEntry>` 由呼叫端 DI 傳入。
- `deck.ts` 新增一個匯出的純函式（例如 `estimateComboPartStrength(slots, partStrengthIndex)`），
  給 `scoreDeck()` 內部用，也給 UI 層算顯示文字用，避免同一段「掃 OCCUPYING_SLOT_KEYS
  查表加總」的邏輯在兩個地方各寫一次。
- `scoreDeck()` 的 `competitiveEvidence`：`member.analysis.evidence?.percentileScore` 有值就
  用它；沒有時才用 `estimateComboPartStrength()` 的結果 × fallback 權重。`evidence` 策略
  維持**只吃真實 evidence，不吃這個 fallback**（跟現在 `evidence` 策略不吃 `expertTierGain`
  是同一個理由——策略名稱承諾「最高賽事證據」，混進零件拼湊推估會誤導）。
- `recommendations.ts` **不需要**另外接這個 fallback：`profile()` 已經會把 `partStrengthIndex`
  轉傳給內部的 `suggestDecks()`，`deckScoreGain` 自然就會反映到；`competitiveEvidenceGain`
  對應的文字明講「完整配置賽事證據」，維持只算真實 evidence，不得混入 fallback。
- fallback 權重**不得憑感覺定**（第 47.2 節、避免重蹈 `EXPERT_TIER_WEIGHT` 沒校準就上路的
  問題）：實作時先給一個保守初始值（例如 0.3），50.6 節的回測階段驗證後才能改。
- 索引比照 `expertPartRatingIndex` 的既有 DI 模式，由呼叫端（UI 層）組好傳進來，
  `deck.ts`／`analysis.ts` 不得直接 import catalog 層。

## 50.4 前台文字

- 「完整配置賽事證據：出現 N 次」與「零件歷史戰績推估（非完整配置實測）」必須是
  兩種不同文字，不得合併成同一句話，避免使用者把推估當成實測（第 1.5、49.4 節）。

## 50.5 六軸評估系統的角色（拆分後的結論）

- 六軸（`analysis.ts` 的 `BASE_BY_TYPE`）**不拔除**，但角色限縮成只回答「這配置是什麼
  打法形狀」（`assignRoles()` 的主攻／持久／穩定分工、`vs_attack`／`vs_stamina` 策略），
  不再兼職回答「這配置到底強不強」——後者交給本節的零件強度分數與既有 `percentileScore`。
- 原因：stan-yao 資料只有整體名次，沒有攻擊／持久／穩定的分軸標籤，訓不出六個獨立分數。

## 50.6 稽核與回測

- 比照第 1.5 節既有規則：改 `src/catalog/sources/` 必須三件套同批交付——來源腳本、
  `part-strength.generated.json`、稽核結果（樣本數過少要標記不可信、型錄裡比對不到的
  partId 要列出，比照 `catalog-audit.json` 既有格式，不得手改產物掩蓋來源問題）。
- 回測用時間切分：用較早的賽事日期算零件分數，用較晚的賽事日期驗證——分數高的零件，
  在後續賽事的進前三次數／比例是否真的比較高。不得隨機切分（會讓未來資料洩漏進訓練集）。
- 回測結果是相關性／分組比較，**不得**包裝成「準確率」或「模型評分」對外呈現。
