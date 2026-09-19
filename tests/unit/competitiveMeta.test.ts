import { describe, expect, it } from 'vitest'
import {
  competitiveEvidenceScore,
  competitiveMetaSnapshot,
  createCompetitiveEvidenceByCode,
} from '../../src/domain/competitiveMeta.ts'

describe('競技 Meta 快照', () => {
  it('每筆全球完整配置都有來源、日期與樣本，不把零件評級當作配置戰績', () => {
    expect(competitiveMetaSnapshot.entries.length).toBeGreaterThan(0)
    for (const entry of competitiveMetaSnapshot.entries) {
      expect(entry.comboCode).toMatch(/ /)
      expect(entry.sourceUrl).toMatch(/^https:\/\//)
      expect(entry.observedTo).toMatch(/^2026-/)
      expect(entry.appearances).toBeGreaterThan(0)
    }
  })

  it('同一完整配置有台灣賽果時，台灣數據優先而全球來源只做補充揭露', () => {
    const code = 'ウィザードロッド 1-60H'
    const result = createCompetitiveEvidenceByCode({
      events: [{ id: 'tw-g3', name: '台灣測試賽', date: '2026-09-01', sourceTier: 'community', sourceUrl: 'https://example.test/tw' }],
      decks: [{
        id: 'tw-deck', eventId: 'tw-g3', placement: 1,
        comboKeys: [code, '甲 1-60R', '乙 9-60FB'], sourceUrl: 'https://example.test/tw',
      }],
    })
    expect(result[code]).toMatchObject({ region: 'taiwan', appearances: 1, championships: 1 })
    expect(result[code]?.sourceUrls).toContain('https://beywatch.gg/combos')
  })

  it('沒有台灣完整牌組時才使用全球快照，且台灣同樣樣本獲得較高排序權重', () => {
    const code = competitiveMetaSnapshot.entries[0]!.comboCode
    const result = createCompetitiveEvidenceByCode({ events: [], decks: [] })
    const global = result[code]!
    expect(global.region).toBe('global')
    expect(global.totalDecks).toBeGreaterThanOrEqual(global.appearances)
    expect(competitiveEvidenceScore({ ...global, appearances: 1, totalDecks: 10 })).toBeLessThan(
      competitiveEvidenceScore({ ...global, region: 'taiwan', appearances: 1, totalDecks: 10 }),
    )
  })
})
