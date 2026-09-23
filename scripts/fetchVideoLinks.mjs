/**
 * 只做一件事：把 `src/data/trustedVideoSources.ts` 裡登記的頻道，抓出近期上傳影片的連結，
 * 輸出 `video-link-candidates.json` 供人工／`claude-video-vision` 之後逐支核對。
 *
 * 誠實界線：這支工具只收集連結與標題／發佈時間，**不判讀影片內容、不判定勝負**。
 * 輸出的每一筆都還是未核對狀態，不能直接當 VideoEvidence 使用。
 *
 * 為什麼要有這支工具：收集連結不需要看懂畫面，交給 API 做完全不用吃模型 token；
 * 之後真正判讀對戰結果那一步（需要模型看畫面）才有必要的話再手動一支一支跑。
 *
 * 用法：
 *   YOUTUBE_API_KEY=xxx node scripts/fetchVideoLinks.mjs
 *   或
 *   node --env-file=.env.local scripts/fetchVideoLinks.mjs   （key 放在 .env.local，已被 .gitignore 的 *.local 規則排除）
 *
 * 用 search.list（order=date, type=video）取每個頻道最新上傳，100 unit/次；
 * 7 個頻道約 700 unit，日配額 10,000 還很夠。
 *
 * 原本用 channels.list + playlistItems.list（各 1 unit，配額省 50 倍）取
 * uploads 播放清單，但實測發現 playlistItems 回傳順序是舊到新，抓出來的
 * 是十幾年前的開箱片，跟這支工具要找「近期精華片段」的目的完全相反。
 * 配額省下來但抓錯方向的資料沒有用，換回 search.list 换正確排序。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const SOURCES_FILE = resolve(root, 'src/data/trustedVideoSources.ts')
const OUT_FILE = resolve(root, 'video-link-candidates.json')

const MAX_VIDEOS_PER_CHANNEL = 25
const API_BASE = 'https://www.googleapis.com/youtube/v3'

const apiKey = process.env.YOUTUBE_API_KEY
if (!apiKey) {
  console.error(
    '缺少 YOUTUBE_API_KEY。用 YOUTUBE_API_KEY=xxx node scripts/fetchVideoLinks.mjs，' +
      '或把金鑰放進 .env.local 後用 node --env-file=.env.local scripts/fetchVideoLinks.mjs。',
  )
  process.exit(1)
}

/**
 * 從 registry 原始碼逐塊抽出頻道基本欄位。
 *
 * 不引入 TS 執行環境去 import 這個檔案（scripts 目前一律吃 JSON／純文字來源，
 * 不對 .ts 開先例）；registry 裡每個 source 區塊欄位順序固定，用正則逐塊切開夠穩。
 */
function parseChannels(sourceText) {
  const blocks = sourceText.split(/\n {4}\{\n {6}id: '/u).slice(1)
  return blocks.map((block) => {
    const id = /^([^']+)'/u.exec(block)?.[1]
    const channelId = /channelId: '([^']+)'/u.exec(block)?.[1]
    const displayName = /displayName: '([^']+)'/u.exec(block)?.[1]
    const sourceType = /sourceType: '([^']+)'/u.exec(block)?.[1]
    const status = /approval: \{\n {8}status: '([^']+)'/u.exec(block)?.[1]
    if (!id || !channelId || !displayName || !sourceType || !status) {
      throw new Error(`${SOURCES_FILE} 有一個 source 區塊解析不出必要欄位，先確認格式沒變`)
    }
    return { id, channelId, displayName, sourceType, status }
  })
}

async function fetchJson(url) {
  const response = await fetch(url)
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `YouTube API 回應 ${response.status}`)
  }
  return body
}

async function fetchRecentVideos(channelId) {
  const url =
    `${API_BASE}/search?part=snippet&channelId=${channelId}&type=video&order=date` +
    `&maxResults=${MAX_VIDEOS_PER_CHANNEL}&key=${apiKey}`
  const body = await fetchJson(url)
  return (body.items ?? [])
    .map((item) => {
      const videoId = item.id?.videoId
      if (!videoId) return undefined
      return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: item.snippet?.title ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
      }
    })
    .filter((video) => video !== undefined)
}

const channels = parseChannels(readFileSync(SOURCES_FILE, 'utf8'))

const results = []
const errors = []

for (const channel of channels) {
  try {
    const videos = await fetchRecentVideos(channel.channelId)
    results.push({ ...channel, videos })
  } catch (error) {
    errors.push({ id: channel.id, channelId: channel.channelId, message: error.message })
  }
}

writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      note:
        '這份清單只是連結收集結果，內容未經人工或 claude-video-vision 核對，' +
        '不得直接當 VideoEvidence 使用；下一步是逐支核對終局判定可讀性。',
      fetchedAt: new Date().toISOString(),
      channels: results,
      errors,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const videoCount = results.reduce((sum, channel) => sum + channel.videos.length, 0)
console.log(
  `頻道 ${results.length}/${channels.length} 個抓成功，共 ${videoCount} 支影片連結` +
    (errors.length > 0 ? `；${errors.length} 個頻道失敗，見輸出檔 errors 欄位` : ''),
)
