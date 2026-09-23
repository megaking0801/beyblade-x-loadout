import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import {
  auditExpertPartRatings,
  auditExpertTierLists,
  expertPartRatingMeta,
  expertTierListMeta,
  getExpertPartRatingIndex,
  getExpertPartRatings,
  getExpertTierMatches,
} from '../../src/catalog/tierLists.ts'

describe('高手 T 表', () => {
  it('每個策展條目都對得到既有零件，並保留可追溯來源', () => {
    expect(auditExpertTierLists(catalog.parts)).toEqual([])
    expect(expertTierListMeta.listCount).toBe(2)
    expect(expertTierListMeta.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('回傳所有選中零件的專家評級，且不遺失作者、日期與警語', () => {
    expect(getExpertTierMatches({ bladeId: 'blade:シャークスケイル' })).toEqual([
      expect.objectContaining({
        listTitleZhTW: '阿土｜7月 高雄G1最強陀螺天梯表',
        authorZhTW: '阿土',
        updatedAt: '2026-09-14',
        sourceUrl: 'https://beybladehub.app/t/d2ynkeu9',
        noteZhTW: '社群專家的主觀評級，不是賽事樣本也不是本站模型推估。',
        tierLabel: 'T0',
      }),
      expect.objectContaining({
        listTitleZhTW: '七月份T度排行',
        authorZhTW: '維辰孔丘',
        updatedAt: '2026-08-19',
        sourceUrl: 'https://beybladehub.app/t/NAu9mbLh',
        noteZhTW: '社群創作者的主觀評級，不是賽事樣本也不是本站模型推估。',
        tierLabel: 'T0',
      }),
    ])
  })

  it('CX 主刃也能對應到零件評級', () => {
    expect(getExpertTierMatches({ mainBladeId: 'main_blade:Bl' })).toEqual([
      expect.objectContaining({ listTitleZhTW: '七月份T度排行', tierLabel: 'T0.5' }),
    ])
  })

  it('未評級或尚未選上蓋時不捏造評級', () => {
    expect(getExpertTierMatches({})).toEqual([])
    expect(getExpertTierMatches({ bladeId: 'blade:ドランソード' })).toEqual([])
  })
})

describe('高手聚合評級（逐件）', () => {
  it('每筆評級都對得到零件，共識人數在合理範圍', () => {
    expect(auditExpertPartRatings(catalog.parts)).toEqual([])
    expect(expertPartRatingMeta.ratingCount).toBeGreaterThanOrEqual(30)
    expect(expertPartRatingMeta.expertCount).toBeGreaterThan(0)
    expect(expertPartRatingMeta.sourceUrl).toContain('beybladehub.app')
  })

  it('涵蓋上蓋、固鎖與軸心三種零件，不是只有上蓋', () => {
    const families = new Set(
      catalog.parts
        .filter((part) => auditedRatingPartIds().has(part.id))
        .map((part) => part.family),
    )
    expect(families.has('ratchet')).toBe(true)
    expect(families.has('bit')).toBe(true)
  })

  it('沒選零件時不回傳評級，選了才回傳並帶共識人數', () => {
    expect(getExpertPartRatings({})).toEqual([])
    const ratings = getExpertPartRatings({ bladeId: 'blade:シャークスケイル' })
    expect(ratings.length).toBeGreaterThan(0)
    for (const rating of ratings) {
      expect(rating.agreeCount).toBeGreaterThan(0)
      expect(rating.agreeCount).toBeLessThanOrEqual(rating.expertCount)
    }
  })
})

describe('高手評級數值化索引（購買推薦用）', () => {
  it('只收 X/SS/S，來源資料裡混入的 T1/T2（另一套獨立評級系統）不進索引', () => {
    const index = getExpertPartRatingIndex()
    // bit:R 在來源資料裡只有 T1 標籤（沒有 X/SS/S），必須被排除，
    // 不能假設 T1 跟 X/SS/S 的強度換算關係。
    expect(index.has('bit:R')).toBe(false)
    for (const rating of index.values()) {
      expect(['X', 'SS', 'S']).toContain(rating.tierLabel)
      expect(rating.rank).toBeGreaterThan(0)
    }
  })

  it('X 級零件的 rank 高於 SS 高於 S', () => {
    const index = getExpertPartRatingIndex()
    const byLabel = new Map<string, number>()
    for (const rating of index.values()) byLabel.set(rating.tierLabel, rating.rank)
    expect(byLabel.get('X')).toBeGreaterThan(byLabel.get('SS') ?? 0)
    expect(byLabel.get('SS')).toBeGreaterThan(byLabel.get('S') ?? 0)
  })
})

/** 測試輔助：目前有評級的零件 id。 */
function auditedRatingPartIds(): Set<string> {
  const ids = new Set<string>()
  for (const part of catalog.parts) {
    if (getExpertPartRatings({ bladeId: part.id }).length > 0) ids.add(part.id)
    if (getExpertPartRatings({ ratchetId: part.id }).length > 0) ids.add(part.id)
    if (getExpertPartRatings({ bitId: part.id }).length > 0) ids.add(part.id)
  }
  return ids
}
