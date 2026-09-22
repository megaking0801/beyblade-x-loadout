# 影片證據候選來源彙整

供貼進 NotebookLM 測試用；純轉錄自 `src/data/trustedVideoSources.ts` 既有 candidate 與本輪對話搜尋結果，
沒有新增推論或編造連結。所有頻道目前狀態都是 `candidate`（未核准），核准前不得視為可信來源。

## 1. TakaraTomyBeyblade（官方，日本）

- 頻道：https://www.youtube.com/channel/UCydxSsnKp10hAIjdGce2MQg
- sourceType：official
- 說明：Beyblade 原廠 Takara Tomy 官方頻道，內容含產品發表與官方賽事片段。

## 2. World Beyblade Organization / WBO（賽事主辦，國際）

- 頻道：https://www.youtube.com/channel/UCGX1vmquOg8VcNCqnH1c3GA
- 官網：https://worldbeyblade.org/
- sourceType：tournament_organizer
- 說明：全球最大 Beyblade 賽事社群，長期籌辦並轉播官方認證賽事。

## 3. Atulolz阿土（競技社群，台灣）

- 頻道：https://www.youtube.com/channel/UCEsTbpDqp0VntO1T42WbI2g
- sourceType：competitive_community
- 已知具體影片：
  - 「回放我的視角S1花蓮金發射器256人大賽」https://www.youtube.com/watch?v=7nCjrK9ezFQ
- 說明：頻道大量內容為開箱／改造／天梯講解（無實際對戰結果），但賽事回放片段可能含可判讀對戰結果，需逐片段篩選。

## 4. BEYBLADE English - Official Channel（官方，跨區域）

- 頻道：https://www.youtube.com/channel/UCktgoAFaL39_rYfiMZiD9jw
- sourceType：official
- 已知具體影片：
  - DAY1 世界大賽預賽全程直播：https://www.youtube.com/watch?v=7fbeMy90mow
  - DAY2 世界大賽決賽輪全程直播：https://www.youtube.com/watch?v=8wfCvJSbpzo
- 說明：2025 年 10 月「BEYBLADE X WORLD CHAMPIONSHIP 2025」東京世界大賽兩日全程直播獨家在此頻道播出，逐場有主播口播結果與畫面計分。

## 5. BEYBLADE Thailand – Official Channel（官方，泰國）

- 頻道：https://www.youtube.com/channel/UC3vIYjsBYuwi0obAFy_EWgQ
- sourceType：official

## 6. BEYBLADE Malaysia – Official Channel（官方，馬來西亞）

- 頻道：https://www.youtube.com/channel/UCDN1FYCY8V5d-8XNxSFCoCw
- sourceType：official

## 7. D100 Radio（一般媒體，香港）

- 頻道：https://www.youtube.com/channel/UCbmZSNWyEoM2xtWhbHRPo3w
- sourceType：competitive_community（標記勉強，D100 是一般媒體非專屬 Beyblade 頻道或賽事主辦方）
- 已知具體影片：
  - 【D100開LIVE直擊】爆旋陀螺X 香港陀螺手 G2爭霸戰總決賽：https://www.youtube.com/watch?v=qw9u91SD9rA
  - 【D100開LIVE直擊】爆旋陀螺X 香港陀螺手 G1爭霸戰總決賽：https://www.youtube.com/watch?v=037w61PRNYA

---

## 未核實／未列入 registry 的線索（僅供參考，不代表可信）

- 馬來西亞大型戰鬥陀螺X比賽相關影片：來自個人創作者頻道（Jack & Joanne），拍攝自己參賽視角，非官方或主辦方全場轉播，可信度判斷較難，未列入 registry。
- 台灣「2026 第一屆萊爾富戰鬥陀螺交流賽」：搜尋結果提及由「愛爾達體育」全程直播，但本輪未查到愛爾達體育官方 YouTube 頻道的確切 channelId，未編造、未列入 registry。
  - 相關搜尋結果連結：https://www.youtube.com/watch?v=XzpJ5hBcIgA
