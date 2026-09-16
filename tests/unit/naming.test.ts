import { describe, expect, it } from 'vitest'
import { JAPANESE_KANA, formatPartLabel, formatProductLabel, resolveDisplayName } from '../../src/domain/naming.ts'
import type { Naming, Part, Product } from '../../src/domain/types.ts'

const prov = { sourceUrls: [], verificationStatus: 'needs_review' as const }

function naming(over: Partial<Naming> = {}): Naming {
  return { primaryZhTW: '疾風飛龍', nameJa: 'ドランソード', nameEn: 'Dran Sword', ...over }
}

describe('前台名稱一律使用台灣中文主名稱（第 5 節）', () => {
  it('主標為 primaryZhTW，不使用英日文', () => {
    const r = resolveDisplayName(naming())
    expect(r.titleZhTW).toBe('疾風飛龍')
    expect(r.titleZhTW).not.toContain('Dran')
  })

  it('暫譯名稱會被標記，前台要顯示暫譯標籤', () => {
    const r = resolveDisplayName(naming({ primaryZhTW: 'BX-99 暫譯名', isProvisionalZhTW: true }))
    expect(r.isProvisional).toBe(true)
    expect(r.provisionalLabelZhTW).toBe('暫譯')
  })

  it('非暫譯時不顯示暫譯標籤', () => {
    const r = resolveDisplayName(naming())
    expect(r.isProvisional).toBe(false)
    expect(r.provisionalLabelZhTW).toBeUndefined()
  })

  it('次要名稱只在詳細頁使用，且依日文、英文、孩之寶順序', () => {
    const r = resolveDisplayName(naming({ nameHasbro: 'Dran Sword 3-60F' }))
    expect(r.secondaryNames).toEqual(['ドランソード', 'Dran Sword', 'Dran Sword 3-60F'])
  })

  it('沒有次要名稱時回空陣列', () => {
    const r = resolveDisplayName({ primaryZhTW: '只有中文' })
    expect(r.secondaryNames).toEqual([])
  })

  it('主名稱為空字串時視為資料缺漏並丟出錯誤', () => {
    expect(() => resolveDisplayName({ primaryZhTW: '   ' })).toThrow('缺少台灣中文主名稱')
  })
})

describe('零件與商品的卡片標籤（第 26、28 節）', () => {
  const part: Part = {
    id: 'p1',
    family: 'ratchet',
    system: 'BX',
    code: '9-60',
    naming: { primaryZhTW: '九柱六十' },
    plainDescriptionZhTW: '重一點、比較耐撞',
    provenance: prov,
  }

  it('零件卡主標為中文名、副標只剩分類、並帶白話用途', () => {
    const label = formatPartLabel(part)
    expect(label.titleZhTW).toBe('九柱六十')
    expect(label.familyZhTW).toBe('固鎖')
    expect(label.plainDescriptionZhTW).toBe('重一點、比較耐撞')
  })

  it('沒有白話用途時該欄位為 undefined，不得自行編造', () => {
    const label = formatPartLabel({ ...part, plainDescriptionZhTW: undefined })
    expect(label.plainDescriptionZhTW).toBeUndefined()
  })

  it('商品卡主標把型號寫在名稱前，副標只剩分類中文', () => {
    const product: Product = {
      id: 'prod1',
      line: 'BX',
      category: 'random_booster',
      naming: { primaryZhTW: '測試隨機包' },
      region: ['JP'],
      isRandom: true,
      contents: [],
      provenance: prov,
    }
    expect(formatProductLabel({ ...product, sku: 'BX-100' }).titleZhTW).toBe('BX-100 測試隨機包')
    expect(formatProductLabel(product).titleZhTW).toBe('測試隨機包')
    expect(formatProductLabel(product).categoryZhTW).toBe('隨機強化組')
  })
})

describe('前台標籤不得出現日文（第 1.4、5 節）', () => {
  const base: Part = {
    id: 'p',
    family: 'blade',
    system: 'BX',
    code: 'ドランソード',
    naming: { primaryZhTW: '蒼龍神劍', nameJa: 'ドランソード', isProvisionalZhTW: false },
    provenance: prov,
  }

  it('代號本身是日文時不進入任何前台欄位，只留在次要名稱', () => {
    const label = formatPartLabel(base)
    expect(label.titleZhTW).toBe('蒼龍神劍')
    expect(label.familyZhTW).not.toMatch(JAPANESE_KANA)
    expect(label.secondaryNames).toEqual(['ドランソード'])
  })

  it('固鎖與軸心的主標就是型號本身，不另外加分類前綴', () => {
    const label = formatPartLabel({
      ...base,
      family: 'ratchet',
      code: '4-80',
      naming: { primaryZhTW: '4-80', isProvisionalZhTW: false },
    })
    expect(label.titleZhTW).toBe('4-80')
    expect(label.familyZhTW).toBe('固鎖')
  })
})
