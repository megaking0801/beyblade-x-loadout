import { describe, expect, it } from 'vitest'
import {
  getComboTournamentEvidence,
  getFeaturedTournamentDeck,
  getObservedComboMatches,
  getPartTournamentDecks,
  getPartTournamentObservations,
  getTournamentEvidenceReport,
} from '../../src/domain/tournament.ts'
import { testParts } from '../fixtures/testCatalog.ts'

const events = [
  {
    id: 'event-1',
    name: '測試賽事',
    date: '2026-01-01',
    sourceTier: 'community' as const,
    sourceUrl: 'https://example.test/event-1',
  },
]

const decks = [
  {
    id: 'deck-1',
    eventId: 'event-1',
    placement: 1,
    comboKeys: ['BladeA 3-60BitA', 'BladeB 9-60BitB', 'BladeC 5-70BitC'],
    comboPartIds: [
      ['test-blade-a', 'test-ratchet-a', 'test-bit-a'],
      ['test-blade-b', 'test-ratchet-b', 'test-bit-b'],
      ['test-blade-c', 'test-ratchet-c', 'test-bit-c'],
    ],
    sourceUrl: 'https://example.test/event-1',
  },
]

const observations = [
  {
    id: 'observation-1',
    eventId: 'event-1',
    placement: 2,
    comboPartIds: ['test-blade-a', 'test-ratchet-a', 'test-bit-a'],
    reportedCombo: '測試配置 A',
    sourceUrl: 'https://example.test/event-1',
  },
  {
    id: 'observation-cx',
    eventId: 'event-1',
    placement: 3,
    slots: {
      lockChipId: 'test-blade-b',
      mainBladeId: 'test-blade-c',
      ratchetId: 'test-ratchet-b',
      bitId: 'test-bit-b',
    },
    reportedCombo: '測試 CX 配置',
    sourceUrl: 'https://example.test/event-1',
  },
]

describe('賽事資料反查', () => {
  it('只用完整已映射牌組計算配裝證據', () => {
    expect(
      getComboTournamentEvidence({
        slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-a', bitId: 'test-bit-a' },
        parts: testParts,
        events,
        decks,
      }),
    ).toEqual({
      appearances: 1,
      top4: 1,
      championships: 1,
      totalDecks: 1,
      sourceTier: 'community',
    })
  })

  it('沒有完全相同配裝時不捏造零出場統計', () => {
    expect(
      getComboTournamentEvidence({
        slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b', bitId: 'test-bit-a' },
        parts: testParts,
        events,
        decks,
      }),
    ).toBeUndefined()
  })

  it('可由已驗證 part IDs 反查零件的賽事出場', () => {
    expect(getPartTournamentDecks('test-bit-a', decks).map((deck) => deck.id)).toEqual(['deck-1'])
  })

  it('部分相符以零件配置為分母，不當成完整配置證據', () => {
    const report = getTournamentEvidenceReport({
      slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b', bitId: 'test-bit-a' },
      parts: testParts,
      events,
      decks,
    })
    expect(report.exact).toBeUndefined()
    expect(report.eventCount).toBe(1)
    expect(report.fullDeckCount).toBe(1)
    expect(report.comboSlotCount).toBe(3)
    expect(report.partial).toEqual([
      expect.objectContaining({
        kind: 'blade', appearances: 1, totalComboSlots: 3, sourceTier: 'community',
      }),
    ])
  })

  it('不完整牌組中的單顆觀測可揭露來源，但不當成完整牌組證據', () => {
    expect(
      getObservedComboMatches({
        slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-a', bitId: 'test-bit-a' },
        events,
        observations,
      }),
    ).toEqual([
      {
        id: 'observation-1',
        eventName: '測試賽事',
        eventDate: '2026-01-01',
        placement: 2,
        sourceUrl: 'https://example.test/event-1',
      },
    ])
    expect(getPartTournamentObservations('test-bit-a', observations)).toHaveLength(1)
    expect(getComboTournamentEvidence({
      slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-a', bitId: 'test-bit-a' },
      parts: testParts,
      events,
      decks: [],
    })).toBeUndefined()
  })

  it('具名槽位的 CX 觀測必須完整選到相同零件才會顯示', () => {
    const slots = {
      lockChipId: 'test-blade-b',
      mainBladeId: 'test-blade-c',
      ratchetId: 'test-ratchet-b',
      bitId: 'test-bit-b',
    }
    expect(getObservedComboMatches({ slots, events, observations })).toEqual([
      expect.objectContaining({ id: 'observation-cx', placement: 3 }),
    ])
    expect(getObservedComboMatches({ slots: { ...slots, bitId: 'test-bit-a' }, events, observations })).toEqual([])
    expect(getPartTournamentObservations('test-blade-c', observations)).toHaveLength(1)
  })
})

describe('首頁的代表性賽事牌組', () => {
  const g1 = {
    id: 'event-g1',
    name: '極限盃 G1 高雄站',
    date: '2026-07-25',
    tier: 'G1' as const,
    sourceTier: 'community' as const,
    sourceUrl: 'https://example.test/g1',
  }
  const laterCommunity = {
    id: 'event-later',
    name: '社群賽',
    date: '2026-09-01',
    tier: 'community' as const,
    sourceTier: 'community' as const,
    sourceUrl: 'https://example.test/later',
  }
  const olderG1 = {
    id: 'event-old-g1',
    name: '極限盃 G1 台北站',
    date: '2026-03-01',
    tier: 'G1' as const,
    sourceTier: 'community' as const,
    sourceUrl: 'https://example.test/old-g1',
  }

  const fullCombos = [
    ['test-blade-a', 'test-ratchet-a', 'test-bit-a'],
    ['test-blade-b', 'test-ratchet-b', 'test-bit-b'],
    ['test-blade-c', 'test-ratchet-c', 'test-bit-c'],
  ]
  const deck = (id: string, eventId: string, placement: number) => ({
    id,
    eventId,
    placement,
    comboKeys: ['a', 'b', 'c'],
    comboPartIds: fullCombos,
    sourceUrl: `https://example.test/${id}`,
  })

  it('等級高的賽事優先，即使社群賽事日期更近', () => {
    const r = getFeaturedTournamentDeck({
      events: [g1, laterCommunity],
      decks: [deck('d-community', laterCommunity.id, 1), deck('d-g1', g1.id, 1)],
      parts: testParts,
    })
    expect(r?.eventNameZhTW).toBe('極限盃 G1 高雄站')
  })

  it('同等級時取日期較近的', () => {
    const r = getFeaturedTournamentDeck({
      events: [g1, olderG1],
      decks: [deck('d-old', olderG1.id, 1), deck('d-new', g1.id, 1)],
      parts: testParts,
    })
    expect(r?.date).toBe('2026-07-25')
  })

  it('同一場取名次較前的', () => {
    const r = getFeaturedTournamentDeck({
      events: [g1],
      decks: [deck('d-3rd', g1.id, 3), deck('d-1st', g1.id, 1)],
      parts: testParts,
    })
    expect(r?.placement).toBe(1)
  })

  it('零件名稱用中文顯示名，並在沒有官方類型時不硬給類型', () => {
    const r = getFeaturedTournamentDeck({
      events: [g1],
      decks: [deck('d-1st', g1.id, 1)],
      parts: testParts,
    })
    expect(r?.members).toEqual([
      { nameZhTW: '測試BladeA 測試3-60 測試BitA' },
      { nameZhTW: '測試BladeB 測試9-60 測試BitB' },
      { nameZhTW: '測試BladeC 測試5-70 測試BitC' },
    ])
  })

  it('零件對不到圖鑑的牌組不列出來', () => {
    const broken = {
      ...deck('d-broken', g1.id, 1),
      comboPartIds: [['does-not-exist', 'test-ratchet-a', 'test-bit-a'], fullCombos[1]!, fullCombos[2]!],
    }
    expect(
      getFeaturedTournamentDeck({ events: [g1], decks: [broken], parts: testParts }),
    ).toBeUndefined()
  })

  it('沒有任何完整牌組時回傳 undefined，不要湊一筆出來', () => {
    expect(
      getFeaturedTournamentDeck({ events: [g1], decks: [], parts: testParts }),
    ).toBeUndefined()
  })

  it('牌組對應不到賽事時不列出來', () => {
    expect(
      getFeaturedTournamentDeck({
        events: [],
        decks: [deck('d-orphan', g1.id, 1)],
        parts: testParts,
      }),
    ).toBeUndefined()
  })
})
