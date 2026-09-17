import { describe, expect, it } from 'vitest'
import {
  getComboTournamentEvidence,
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
})
