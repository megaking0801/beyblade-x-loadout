import { describe, expect, it } from 'vitest'
import { buildPracticalComparison, practiceSources } from '../../src/domain/practice.ts'
import type { Part } from '../../src/domain/types.ts'

const provenance = { sourceUrls: ['https://example.test/catalog'], verificationStatus: 'official_verified' as const }

function part(over: Partial<Part> & Pick<Part, 'id' | 'family'>): Part {
  return {
    system: 'BX',
    code: over.id,
    naming: { primaryZhTW: over.id },
    provenance,
    ...over,
  }
}

const standardParts: Part[] = [
  part({ id: 'blade-a', family: 'blade', type: 'attack', spinDirection: 'right' }),
  part({ id: 'blade-b', family: 'blade', type: 'stamina', spinDirection: 'right' }),
  part({ id: 'ratchet-60', family: 'ratchet', heightCode: 60 }),
  part({ id: 'ratchet-70', family: 'ratchet', heightCode: 70 }),
  part({ id: 'ratchet-80', family: 'ratchet', heightCode: 80 }),
  part({ id: 'bit-f', family: 'bit', bitContact: 'flat' }),
  part({ id: 'bit-b', family: 'bit', bitContact: 'ball' }),
]

describe('實戰比較資料層', () => {
  it('兩側所有已選零件都產生檔案，不只處理固鎖範例', () => {
    const result = buildPracticalComparison({
      a: { bladeId: 'blade-a', ratchetId: 'ratchet-60', bitId: 'bit-f' },
      b: { bladeId: 'blade-b', ratchetId: 'ratchet-80', bitId: 'bit-b' },
      parts: standardParts,
    })
    expect(result.profilesA.map((profile) => profile.partId)).toEqual(['blade-a', 'ratchet-60', 'bit-f'])
    expect(result.profilesB.map((profile) => profile.partId)).toEqual(['blade-b', 'ratchet-80', 'bit-b'])
    expect(result.status).toBe('insufficient')
    expect(result.noticeZhTW).toContain('不會被換算成勝率')
  })

  it('相近高度不把低方直接寫成剋制，高度相同也保持中立', () => {
    const near = buildPracticalComparison({
      a: { bladeId: 'blade-a', ratchetId: 'ratchet-70', bitId: 'bit-f' },
      b: { bladeId: 'blade-b', ratchetId: 'ratchet-80', bitId: 'bit-b' },
      parts: standardParts,
    })
    expect(near.heightTimelineZhTW.opening).toContain('相近高度')
    expect(near.heightTimelineZhTW.opening).toContain('不宣稱低打高必然有效')

    const equal = buildPracticalComparison({
      a: { bladeId: 'blade-a', ratchetId: 'ratchet-60', bitId: 'bit-f' },
      b: { bladeId: 'blade-b', ratchetId: 'ratchet-60', bitId: 'bit-b' },
      parts: standardParts,
    })
    expect(equal.heightTimelineZhTW.opening).toContain('同高度')
    expect(equal.heightTimelineZhTW.opening).toContain('不因高度偏向')
  })

  it('一體式上蓋不是高度資料缺漏，並分開列出同上蓋的實戰替代', () => {
    const integrated = part({ id: 'bullet', family: 'integrated_blade', integratedRatchet: true, type: 'balance' })
    const result = buildPracticalComparison({
      a: { bladeId: 'blade-a', ratchetId: 'ratchet-60', bitId: 'bit-f' },
      b: { bladeId: 'bullet', bitId: 'bit-b' },
      parts: [...standardParts, integrated],
      tournamentEvents: [{ id: 'event', name: '測試賽', date: '2026-05-24', participantCount: 64, sourceTier: 'verified_community', sourceUrl: 'https://example.test/event' }],
      tournamentObservations: [
        { id: 'exact-b', eventId: 'event', placement: 1, slots: { bladeId: 'bullet', bitId: 'bit-b' }, reportedCombo: '整合上蓋 B', sourceUrl: 'https://example.test/exact' },
        { id: 'alternative-b', eventId: 'event', placement: 2, slots: { bladeId: 'bullet', bitId: 'bit-f' }, reportedCombo: '整合上蓋 F', sourceUrl: 'https://example.test/alt' },
      ],
    })
    expect(result.heightTimelineZhTW.opening).toContain('一體式結構')
    expect(result.heightTimelineZhTW.opening).not.toContain('資料不足')
    expect(result.tournamentB.exact.map((row) => row.reportedCombo)).toEqual(['整合上蓋 B'])
    expect(result.tournamentB.sameBladeAlternatives.map((row) => row.reportedCombo)).toEqual(['整合上蓋 F'])
  })

  it('CX 的每個已選結構件都保留在實戰檔案中', () => {
    const cxParts = [
      part({ id: 'chip', family: 'lock_chip', system: 'CX' }),
      part({ id: 'main', family: 'main_blade', system: 'CX', type: 'attack', cxOverBlade: true }),
      part({ id: 'over', family: 'over_blade', system: 'CX' }),
      part({ id: 'assist', family: 'assist_blade', system: 'CX' }),
      part({ id: 'ratchet', family: 'ratchet', system: 'CX', heightCode: 60 }),
      part({ id: 'bit', family: 'bit', system: 'CX', bitContact: 'flat' }),
    ]
    const result = buildPracticalComparison({
      a: { lockChipId: 'chip', mainBladeId: 'main', overBladeId: 'over', assistBladeId: 'assist', ratchetId: 'ratchet', bitId: 'bit' },
      b: { lockChipId: 'chip', mainBladeId: 'main', overBladeId: 'over', assistBladeId: 'assist', ratchetId: 'ratchet', bitId: 'bit' },
      parts: cxParts,
    })
    expect(result.profilesA).toHaveLength(6)
    expect(result.profilesA.map((profile) => profile.familyZhTW)).toContain('Over Blade')
  })

  it('固定來源保留原始／彙整身分，前台可回查而不增加假樣本', () => {
    expect(practiceSources.some((source) => source.nameZhTW.includes('阿土') && source.independence === 'primary')).toBe(true)
    expect(practiceSources.some((source) => source.nameZhTW.includes('維辰') && source.independence === 'primary')).toBe(true)
    expect(practiceSources.some((source) => source.independence === 'curated')).toBe(true)
    expect(practiceSources.every((source) => source.sourceUrl.startsWith('https://'))).toBe(true)
  })

  it('沒有已發布影片模型時固定誠實降級，不從賽事或 T 表產生勝率', () => {
    const result = buildPracticalComparison({
      a: { bladeId: 'blade-a', ratchetId: 'ratchet-60', bitId: 'bit-f' },
      b: { bladeId: 'blade-b', ratchetId: 'ratchet-80', bitId: 'bit-b' },
      parts: standardParts,
    })
    expect(result.status).toBe('insufficient')
    expect(result.titleZhTW).toBe('樣本不足，暫不預測')
    expect(result.noticeZhTW).toContain('尚未發布')
  })
})
