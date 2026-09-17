/**
 * 圖片來源標示。
 *
 * 規格對照：第 25 節（圖片只連結、不重新散布，且要能追蹤來源與版權）、
 * 第 22 節（UI 必須可查看來源）。
 *
 * 圖片全部是外部連結，離線或對方改路徑時會退回型號佔位圖，這裡也一併講清楚。
 */
import type { ImageAsset } from '../../domain/types.ts'

const USAGE_ZH: Record<ImageAsset['usageStatus'], string> = {
  link_only: '僅外部連結，未重新散布',
  permission_granted: '已取得使用授權',
  user_uploaded: '使用者自行上傳',
  unknown: '授權狀態未確認',
}

export function ImageSourceNote({ image }: { image: ImageAsset | undefined }) {
  if (!image) {
    return (
      <div className="meta">目前沒有可用的外部圖片，顯示型號佔位圖。</div>
    )
  }
  return (
    <div className="meta" style={{ display: 'grid', gap: 2 }}>
      <span>
        圖片來源：
        <a href={image.sourceUrl} target="_blank" rel="noreferrer">
          {image.sourceName}
        </a>
      </span>
      <span>
        {image.copyrightOwner ? `版權：${image.copyrightOwner}・` : '版權人未標示・'}
        {image.isLocalMirror ? '本機副本（未取得授權）' : USAGE_ZH[image.usageStatus]}
      </span>
      {image.remoteUrl ? (
        <span>
          原始位置：
          <a href={image.remoteUrl} target="_blank" rel="noreferrer">
            {new URL(image.remoteUrl).host}
          </a>
        </span>
      ) : null}
    </div>
  )
}

export interface ImageSourceSummaryRow {
  sourceName: string
  count: number
  sourceUrl: string
}

/** 把圖片依來源彙總，給設定頁列出。 */
export function summarizeImageSources(images: ImageAsset[]): ImageSourceSummaryRow[] {
  const map = new Map<string, ImageSourceSummaryRow>()
  for (const image of images) {
    const row = map.get(image.sourceName)
    if (row) {
      row.count += 1
      continue
    }
    map.set(image.sourceName, {
      sourceName: image.sourceName,
      count: 1,
      sourceUrl: image.sourceUrl,
    })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}
