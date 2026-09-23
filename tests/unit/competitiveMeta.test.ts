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

  it('沒有台灣完整牌組時才使用全球快照，但全球樣本不進排序分數（只做補充揭露）', () => {
    const code = competitiveMetaSnapshot.entries[0]!.comboCode
    const result = createCompetitiveEvidenceByCode({ events: [], decks: [] })
    const global = result[code]!
    expect(global.region).toBe('global')
    expect(global.totalDecks).toBeGreaterThanOrEqual(global.appearances)
    // 全球快照的 appearances 是爬蟲累計全域出場數（可能成百上千），跟台灣樣本內的
    // 實際筆數不同量級；就算全球出場數遠大於台灣，分數也必須是 0，不能贏過任何
    // 有真實台灣賽果的配置。
    expect(competitiveEvidenceScore(global)).toBe(0)
    expect(competitiveEvidenceScore({ ...global, appearances: 999_999 })).toBe(0)
    expect(
      competitiveEvidenceScore({ ...global, region: 'taiwan', appearances: 1, top4: 0, championships: 0, totalDecks: 10 }),
    ).toBeGreaterThan(0)
  })

  it('台灣有賽果時優先於社群站台，社群站台優先於全球快照', () => {
    const code = 'ウィザードロッド 1-60H'
    const events = [{ id: 'tw-g3', name: '台灣測試賽', date: '2026-09-01', sourceTier: 'community' as const, sourceUrl: 'https://example.test/tw' }]
    const decks = [{ id: 'tw-deck', eventId: 'tw-g3', placement: 1, comboKeys: [code, '甲 1-60R', '乙 9-60FB'], sourceUrl: 'https://example.test/tw' }]
    const community = { records: [{ comboCode: code, rank: 1 }, { comboCode: code, rank: 2 }], updatedAt: '2026-09-23', sourceUrl: 'https://example.test/community' }

    const withTaiwan = createCompetitiveEvidenceByCode({ events, decks, community })
    expect(withTaiwan[code]?.region).toBe('taiwan')

    const withoutTaiwan = createCompetitiveEvidenceByCode({ events: [], decks: [], community })
    expect(withoutTaiwan[code]).toMatchObject({ region: 'community', appearances: 2, championships: 1 })

    const withNeither = createCompetitiveEvidenceByCode({ events: [], decks: [] })
    expect(withNeither[code]?.region).toBe('global')
  })

  it('百分位分數只跟同一來源內的相對排名有關，樣本量級不會讓量大的來源系統性贏過量小的來源', () => {
    // 社群站台樣本量遠大於台灣本地（1000 vs 3），但兩邊各自的「最強配置」都應該
    // 拿到滿分百分位——這是這次修的核心：不能因為社群站台筆數多就自動贏。
    const strongTaiwanCode = '甲 1-60R'
    const weakTaiwanCode = '乙 9-60FB'
    const events = [{ id: 'tw-g3', name: '台灣測試賽', date: '2026-09-01', sourceTier: 'community' as const, sourceUrl: 'https://example.test/tw' }]
    const decks = [
      { id: 'tw-deck-1', eventId: 'tw-g3', placement: 1, comboKeys: [strongTaiwanCode, weakTaiwanCode, '丙 3-60H'], sourceUrl: 'https://example.test/tw' },
      { id: 'tw-deck-2', eventId: 'tw-g3', placement: 2, comboKeys: [strongTaiwanCode, '丙 3-60H', '丁 7-60B'], sourceUrl: 'https://example.test/tw' },
      { id: 'tw-deck-3', eventId: 'tw-g3', placement: 3, comboKeys: [strongTaiwanCode, '丙 3-60H', '戊 5-60E'], sourceUrl: 'https://example.test/tw' },
    ]
    const dominantCommunityCode = 'ウィザードロッド 1-60H'
    const rareCommunityCode = 'エアロペガサス 1-60R'
    const communityRecords = [
      ...Array.from({ length: 999 }, () => ({ comboCode: dominantCommunityCode })),
      { comboCode: rareCommunityCode },
    ]
    const community = { records: communityRecords, updatedAt: '2026-09-23', sourceUrl: 'https://example.test/community' }

    const result = createCompetitiveEvidenceByCode({ events, decks, community })
    // 台灣樣本裡最強的配置（3 次出場，本地樣本裡最高）要拿到滿分百分位。
    expect(result[strongTaiwanCode]?.percentileScore).toBe(100)
    // 社群站台裡出場數遙遙領先的配置（999/1000）也要拿到滿分百分位——
    // 兩邊都是「滿分」，才代表百分位真的讓不同量級的來源可比。
    expect(result[dominantCommunityCode]?.percentileScore).toBe(100)
    // 社群站台裡只出現 1 次、敬陪末座的配置，百分位要遠低於滿分——
    // 即使它的原始筆數（1）跟台灣最弱配置（1）數字上相同，也不能因為社群站台
    // 樣本量大就自動比較不利；兩邊各自跟自己來源內的分布比才是重點。
    expect(result[rareCommunityCode]?.percentileScore).toBe(0)
    // 台灣本地樣本裡，1 次出場跟另外兩個配置（丁、戊）同分墊底，百分位是這三筆
    // 並列最低（50，不是 0），因為台灣樣本沒有比 1 次更低的出場數可比。
    expect(result[weakTaiwanCode]?.percentileScore).toBe(50)
  })
})
