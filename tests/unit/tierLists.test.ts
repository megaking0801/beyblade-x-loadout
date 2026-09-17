import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import {
  auditExpertTierLists,
  expertTierListMeta,
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
