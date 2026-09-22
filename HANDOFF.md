# 交接筆記

最後更新：2026-09-23 UTC+08:00
交接原因：一般交接（使用者要求先寫交接再推）

## 目前目標

找出真正可靠的「A vs B 對戰結果」資料來源，供之後模型訓練用。本輪確認 NotebookLM 抽取整條路
放棄（見「踩過的坑」），改成人工用 `claude-video-vision` 逐支影片核對；但業餘手機側拍賽事影片
的終局勝負判定抓不到乾淨畫面，下一步要換官方轉播「單場精華片段」（短版，非整場直播）實測。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 有未推變更（見下）；推送前 HEAD `a45e20a` |
| `origin/main` | `a45e20a` |
| 線上 Pages | 未變動，本輪無需部署——新增的 candidate 資料完全沒有被任何 app 進入點 import
（僅測試檔引用），不影響 production bundle |

未推變更：`src/data/trustedVideoSources.ts`（新增 7 個 candidate 來源）、
`tests/unit/trustedVideoSources.test.ts`（更新一條過期斷言）、3 份根目錄研究文件
（`video-evidence-candidates.md`、`notebooklm-yt-links.txt`、`notebooklm-extraction-prompt.txt`）。

## 已驗證與未驗證

- `npx tsc -b`：通過。
- `npm test`：25 files / 443 tests 通過。
- 未跑 `test:e2e`／`shots`／`test:live`（純資料＋文件變更，不影響前台，依規則不需要）。

## 阻塞

- `YOUTUBE_API_KEY` 仍未取得（使用者正在申請）。
- env 裡的 `GEMINI_API_KEY` 歸屬未確認是否可用於本專案，尚未寫入 `.env`，不得動用。
- 7 個 candidate 頻道全部待人工核准，一個都不能進訓練。

## 下一個具體動作

去找 1-2 支「官方轉播單場精華片段」（幾十秒到幾分鐘的短版，不是整場直播 VOD），用
`claude-video-vision` 實測能不能抓到乾淨的終局判定（勝方＋完場方式），驗證人工抽取這條路能否
規模化。長片直播 VOD 在本機下載會失敗，先別再試整場直播。

## 怎麼跑（非顯而易見的）

- `claude-video-vision` 這個 session 內建工具可以直接傳 YouTube 網址給 `video_info`／
  `video_analyze`／`video_watch`／`video_detail`，不需要影片本身有字幕。
- 流程規定先 `video_info` 再 `video_analyze`（>30 秒影片必做）才能 `video_watch`；
  長片建議先用短片驗證流程再處理長片。
- 本機 whisper.cpp 未安裝，轉錄退回某個 Gemini 後端，會噴 503／不確定花誰的額度——純看畫面
  （`skip_audio: true`）可以完全避開這個問題。

## 踩過的坑

- **NotebookLM 貼 YouTube 連結會幻覺**：對戰畫面靠語音聽不出配置名稱時，它會編出不存在的名字
  （本輪實測出現「陀螺破壞者J」「萌甲暴刃」這類根本不存在的選手/配置名），千萬不要把它的輸出
  直接當訓練資料，只能當「這條路值不值得投資」的探路測試。
- **NotebookLM 只吃有字幕的 YouTube 影片**，貼頻道首頁網址無效，只認單支影片或播放清單。
- **業餘手機側拍賽事影片的計分板是機械翻牌動畫**：翻牌瞬間畫面會糊成疊字（例如糊出
  「3001」），那是動畫殘影不是真實比分，千萬別直接讀出來當比分。
- **同一顆刃在不同輪次的畫面代號會換**（例如「UX-15 鮫鯊狂鱗」在 16 強用 `3-60FB`、8 強用
  `9-60Nr`），不能建一個全域代號→零件對照表，一定要搭配該輪最近一張圖鑑卡才能解碼。
- **`claude-video-vision` 對長片（直播 VOD）在這台 Windows 機器上載會失敗**（yt-dlp 分段檔案
  重新命名出錯，`Unable to rename file`），跟影片內容/可信度無關，純本機技術限制；已知一支
  9 分 26 秒的短片下載成功，長片（1 小時以上直播）目前兩次都失敗。
- **改 `src/data/trustedVideoSources.ts` 這種還沒被 app 引用的資料檔，不用觸發部署**——先用
  `grep -rl "from '.*data/trustedVideoSources'" src` 確認沒有 import 才敢下這個結論，不要用猜的。

## 已知缺口

- 亞洲「對戰組合純文字資料」來源（如日文部落格 おくろぐ、BeybladeHub）形狀跟現有
  `VideoEvidence` schema（綁死影片＋時間戳）對不上，需要另一個 schema 才能收，這輪按使用者
  指示先不做，等影片這條路測完再決定要不要開。
- 人工抽取 SOP（一支影片要抽多少局、怎麼進 `VideoEvidence` 格式、誰核對）還沒有結論，取決於
  官方精華片段的測試結果。
- 其餘既有缺口（前台未接、Catalog 映射閘門、自動發現/白名單流程、模型訓練）維持不變，見
  `src/domain/videoEvidence.ts` 與 `trustedVideoSources.ts` 內的驗證邊界。

## 下一步（排序）

1. 官方轉播精華片段實測終局判定可讀性——排最前面是因為手動抽取的規模化可行性完全取決於這步。
2. 若可行，定人工抽取 SOP 並開始小批量核對現有 7 個 candidate 頻道，決定哪些能核准。
3. 若不可行或太貴，回頭評估「文字賽事結果」新 schema 這條路（見上「已知缺口」）。

## 資料管線表

`可信頻道 registry → 官方轉播精華片段（人工 + claude-video-vision 核對）→ VideoEvidence
validator → Catalog 映射與信心閘門 → 高／低信心 JSON → 高信心訓練集 → 模型／品質報告 →
Compare／3on3`（原規劃的「YouTube Data API + Gemini 自動抽取」仍是長期目標，但短期先用人工
核對驗證資料形狀與品質）
