import { describe, expect, it } from 'vitest'
import { computePartWinRateIndex, LOW_SAMPLE_THRESHOLD } from '../../src/domain/battleRecords.ts'
import type { BattleRound } from '../../src/domain/types.ts'

function round(overrides: Partial<BattleRound>): BattleRound {
  return {
    id: 'r1',
    a: { bladeId: 'blade-a' },
    b: { bladeId: 'blade-b' },
    result: 'a',
    finish: 'spin',
    playedAt: '2026-09-24',
    createdAt: '2026-09-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('computePartWinRateIndex（第 3 節：零件勝率聚合）', () => {
  it('空陣列不拋錯，回傳空 Map', () => {
    const index = computePartWinRateIndex([])
    expect(index.size).toBe(0)
  })

  it('A 贏時，A 的零件各記一次贏、B 的零件各記一次輸', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      round({ id: `r${i}`, result: 'a' }),
    )
    const index = computePartWinRateIndex(rounds)
    expect(index.get('blade-a')).toEqual({ wins: LOW_SAMPLE_THRESHOLD, losses: 0, ties: 0, winRate: 1 })
    expect(index.get('blade-b')).toEqual({ wins: 0, losses: LOW_SAMPLE_THRESHOLD, ties: 0, winRate: 0 })
  })

  it('平手不進 winRate 分母，只計進 ties', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      round({ id: `r${i}`, result: 'tie' }),
    )
    const index = computePartWinRateIndex(rounds)
    expect(index.get('blade-a')).toEqual({ wins: 0, losses: 0, ties: LOW_SAMPLE_THRESHOLD, winRate: undefined })
  })

  it('同一顆零件同時出現在 A、B 兩邊的不同局，輸贏各自累加不互相污染', () => {
    const rounds: BattleRound[] = [
      ...Array.from({ length: 3 }, (_, i) =>
        round({ id: `w${i}`, a: { bladeId: 'shared' }, b: { bladeId: 'other-1' }, result: 'a' }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        round({ id: `l${i}`, a: { bladeId: 'other-2' }, b: { bladeId: 'shared' }, result: 'a' }),
      ),
    ]
    const index = computePartWinRateIndex(rounds)
    // shared 在前 3 局是 a 方且贏了 3 次；在後 3 局是 b 方且輸了 3 次（因為 result 仍是 'a'，b 輸）
    expect(index.get('shared')).toEqual({ wins: 3, losses: 3, ties: 0, winRate: 0.5 })
  })

  it('樣本數（wins+losses）低於門檻時 winRate 是 undefined，但 wins/losses 數字仍然正確', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD - 1 }, (_, i) =>
      round({ id: `r${i}`, result: 'a' }),
    )
    const index = computePartWinRateIndex(rounds)
    const entry = index.get('blade-a')!
    expect(entry.wins).toBe(LOW_SAMPLE_THRESHOLD - 1)
    expect(entry.winRate).toBeUndefined()
  })

  it('CX 配置（多槽位）的每一顆零件都各自累加', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      round({
        id: `r${i}`,
        a: { lockChipId: 'chip-1', mainBladeId: 'main-1', assistBladeId: 'assist-1', ratchetId: 'r-60', bitId: 'bit-f' },
        b: { bladeId: 'blade-b' },
        result: 'a',
      }),
    )
    const index = computePartWinRateIndex(rounds)
    for (const partId of ['chip-1', 'main-1', 'assist-1', 'r-60', 'bit-f']) {
      expect(index.get(partId)?.wins).toBe(LOW_SAMPLE_THRESHOLD)
    }
  })
})
