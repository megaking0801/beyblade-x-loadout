import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { auditExpertTierLists, getExpertTierMatches } from '../../src/catalog/tierLists.ts'

describe('高手 T 表', () => {
  it('每個策展條目都對得到既有零件，並保留可追溯來源', () => {
    expect(auditExpertTierLists(catalog.parts)).toEqual([])
  })

  it('只依上蓋回傳專家評級，且不遺失作者、日期與警語', () => {
    expect(getExpertTierMatches({ bladeId: 'blade:シャークスケイル' })).toEqual([
      {
        listTitleZhTW: '阿土｜7月 高雄G1最強陀螺天梯表',
        authorZhTW: '阿土',
        updatedAt: '2026-09-14',
        sourceUrl: 'https://beybladehub.app/t/d2ynkeu9',
        noteZhTW: '社群專家的主觀評級，不是賽事樣本也不是本站模型推估。',
        tierLabel: 'T0',
      },
    ])
  })

  it('未評級或尚未選上蓋時不捏造評級', () => {
    expect(getExpertTierMatches({})).toEqual([])
    expect(getExpertTierMatches({ bladeId: 'blade:ドランソード' })).toEqual([])
  })
})
