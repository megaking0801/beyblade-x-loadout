import { describe, expect, it } from 'vitest'
import { buildSearchTokens, searchParts, searchProducts } from '../../src/domain/search.ts'
import type { Part, Product } from '../../src/domain/types.ts'

const prov = { sourceUrls: [], verificationStatus: 'needs_review' as const }

const parts: Part[] = [
  {
    id: 'blade-dran',
    family: 'blade',
    system: 'BX',
    code: 'DranSword',
    naming: {
      primaryZhTW: '疾風飛龍',
      aliasesZhTW: ['飛龍劍'],
      nameJa: 'ドランソード',
      nameEn: 'Dran Sword',
      nickname: ['DS'],
    },
    provenance: prov,
  },
  {
    id: 'ratchet-9-60',
    family: 'ratchet',
    system: 'BX',
    code: '9-60',
    naming: { primaryZhTW: '九柱六十' },
    provenance: prov,
  },
  {
    id: 'bit-flat',
    family: 'bit',
    system: 'BX',
    code: 'F',
    naming: { primaryZhTW: '平面', nameEn: 'Flat' },
    provenance: prov,
  },
]

describe('搜尋支援所有別名（第 40 節、第 45 節 Case 10）', () => {
  it('用英文名搜尋得到結果，但結果顯示台灣中文主名稱', () => {
    const r = searchParts(parts, 'Dran Sword')
    expect(r).toHaveLength(1)
    expect(r[0]!.displayTitleZhTW).toBe('疾風飛龍')
  })

  it('用日文名搜尋得到結果', () => {
    expect(searchParts(parts, 'ドランソード')[0]!.part.id).toBe('blade-dran')
  })

  it('用玩家暱稱搜尋得到結果', () => {
    expect(searchParts(parts, 'DS')[0]!.part.id).toBe('blade-dran')
  })

  it('用中文別名搜尋得到結果', () => {
    expect(searchParts(parts, '飛龍劍')[0]!.part.id).toBe('blade-dran')
  })

  it('用型號搜尋得到結果', () => {
    expect(searchParts(parts, '9-60')[0]!.part.id).toBe('ratchet-9-60')
  })

  it('型號省略連字號也能搜到', () => {
    expect(searchParts(parts, '960')[0]!.part.id).toBe('ratchet-9-60')
  })

  it('大小寫不影響結果', () => {
    expect(searchParts(parts, 'dran sword')[0]!.part.id).toBe('blade-dran')
  })

  it('部分字串也能搜到', () => {
    expect(searchParts(parts, '飛龍')[0]!.part.id).toBe('blade-dran')
  })

  it('查無結果時回空陣列', () => {
    expect(searchParts(parts, '不存在的東西')).toEqual([])
  })

  it('空白查詢回傳全部，供列表頁使用', () => {
    expect(searchParts(parts, '   ')).toHaveLength(3)
  })

  it('中文主名稱完全相符排在部分相符之前', () => {
    const extra: Part = {
      id: 'blade-other',
      family: 'blade',
      system: 'BX',
      code: 'Other',
      naming: { primaryZhTW: '疾風飛龍改' },
      provenance: prov,
    }
    const r = searchParts([extra, ...parts], '疾風飛龍')
    expect(r[0]!.part.id).toBe('blade-dran')
  })

  it('搜尋結果會標明命中的是哪個別名，供 UI 說明', () => {
    const r = searchParts(parts, 'Flat')
    expect(r[0]!.matchedOn).toBe('nameEn')
  })
})

describe('商品搜尋', () => {
  const products: Product[] = [
    {
      id: 'prod-1',
      sku: 'BX-34',
      line: 'BX',
      category: 'random_booster',
      naming: { primaryZhTW: '測試隨機包', nameJa: 'テストブースター' },
      region: ['JP'],
      isRandom: true,
      contents: [],
      provenance: prov,
    },
  ]

  it('用型號搜尋商品', () => {
    expect(searchProducts(products, 'BX-34')[0]!.product.id).toBe('prod-1')
  })

  it('用日文商品名搜尋', () => {
    expect(searchProducts(products, 'テストブースター')[0]!.displayTitleZhTW).toBe('測試隨機包')
  })
})

describe('搜尋索引建立', () => {
  it('索引包含所有名稱欄位與型號', () => {
    const tokens = buildSearchTokens(parts[0]!.naming, parts[0]!.code)
    expect(tokens).toContain('疾風飛龍')
    expect(tokens).toContain('飛龍劍')
    expect(tokens).toContain('ドランソード')
    expect(tokens).toContain('dran sword')
    expect(tokens).toContain('ds')
    expect(tokens).toContain('dransword')
  })

  it('不含空字串', () => {
    const tokens = buildSearchTokens({ primaryZhTW: '甲', aliasesZhTW: ['', '  '] }, '')
    expect(tokens).toEqual(['甲'])
  })
})
