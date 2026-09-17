# 設計稿原始檔

App 改版設計稿的 artboard 原始碼。每個 `.dc.html` 是一張手機畫面，
`canvas.json` 決定它們在畫布上的位置與便利貼。

已發布的畫布：<https://claude.ai/code/artifact/54358ced-1e7e-4533-8fad-75940ed77937>

## 重新產生畫布

產生檔 `beyblade-x-app-redesign.html` 有 2.6 MB（內含整份編輯器程式），
所以不進版控。要重生的話用 `/design` skill 的 `seed-canvas.mjs`，
把全部 11 個 artboard 與 `canvas.json` 一起餵進去，再發布到同一個 artifact URL。

## 目前收錄的畫面

首頁、商品、零件庫、配裝器、我能組什麼、3on3 組隊、配裝比較、想買清單、
商品詳情、零件詳情、設定 —— 對應 `src/ui/pages/` 的全部 11 頁。
