import { describe, expect, it } from 'vitest'
import { summarizeImageSources } from '../../src/ui/components/ImageSource.tsx'
import { catalog } from '../../src/catalog/index.ts'
import type { ImageAsset } from '../../src/domain/types.ts'

function image(over: Partial<ImageAsset> & Pick<ImageAsset, 'id' | 'sourceName'>): ImageAsset {
  return {
    entityType: 'part',
    entityId: 'x',
    url: 'https://example.test/a.webp',
    sourceUrl: 'https://example.test/',
    usageStatus: 'link_only',
    ...over,
  }
}

describe('圖片來源彙總（第 22、25 節）', () => {
  it('依來源分組並依數量遞減排序', () => {
    const rows = summarizeImageSources([
      image({ id: '1', sourceName: 'A' }),
      image({ id: '2', sourceName: 'B' }),
      image({ id: '3', sourceName: 'B' }),
    ])
    expect(rows.map((row) => [row.sourceName, row.count])).toEqual([
      ['B', 2],
      ['A', 1],
    ])
  })

  it('空陣列回空結果', () => {
    expect(summarizeImageSources([])).toEqual([])
  })

  it('實際圖鑑的每個來源都有可點的網址', () => {
    const rows = summarizeImageSources(catalog.images)
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) {
      expect(row.sourceUrl).toMatch(/^https:\/\//)
      expect(row.count).toBeGreaterThan(0)
    }
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(catalog.images.length)
  })
})
