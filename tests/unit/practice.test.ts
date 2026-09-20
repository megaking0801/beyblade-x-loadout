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
    expect(result.noticeZhTW).toContain('不會被誤算')
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

  it('只有五局與兩個獨立原始來源才升級為實戰 W–L，反向記錄也會正確換算', () => {
    const a = { bladeId: 'blade-a', ratchetId: 'ratchet-60', bitId: 'bit-f' }
    const b = { bladeId: 'blade-b', ratchetId: 'ratchet-80', bitId: 'bit-b' }
    const observations = [
      { id: '1', a, b, winner: 'a' as const, finish: 'xtreme' as const, sourceId: 'video-1', sourceUrl: 'https://example.test/1', timestampSeconds: 10, recordedAt: '2026-01-01', format: 'Standard 3on3', stadium: 'X Stadium' },
      { id: '2', a, b, winner: 'b' as const, finish: 'spin' as const, sourceId: 'video-1', sourceUrl: 'https://example.test/1', timestampSeconds: 20, recordedAt: '2026-01-01', format: 'Standard 3on3', stadium: 'X Stadium' },
      { id: '3', a, b, winner: 'a' as const, finish: 'over' as const, sourceId: 'video-2', sourceUrl: 'https://example.test/2', timestampSeconds: 30, recordedAt: '2026-01-02', format: 'Standard 3on3', stadium: 'X Stadium' },
      { id: '4', a: b, b: a, winner: 'b' as const, finish: 'burst' as const, sourceId: 'video-2', sourceUrl: 'https://example.test/2', timestampSeconds: 40, recordedAt: '2026-01-02', format: 'Standard 3on3', stadium: 'X Stadium' },
      { id: '5', a, b, winner: 'a' as const, finish: 'spin' as const, sourceId: 'video-2', sourceUrl: 'https://example.test/2', timestampSeconds: 50, recordedAt: '2026-01-02', format: 'Standard 3on3', stadium: 'X Stadium' },
    ]
    const result = buildPracticalComparison({ a, b, parts: standardParts, observations })
    expect(result.status).toBe('observed')
    expect(result.observedRounds).toBe(5)
    expect(result.observedSourceCount).toBe(2)
    expect(result.observedAWins).toBe(4)
    expect(result.observedBWins).toBe(1)
  })
})
