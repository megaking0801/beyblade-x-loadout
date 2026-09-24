import { describe, expect, it } from 'vitest'
import {
  computeMatchScore,
  computePartWinRateIndex,
  isMatchComplete,
  matchWinner,
  LOW_SAMPLE_THRESHOLD,
  MATCH_WIN_SCORE,
} from '../../src/domain/battleRecords.ts'
import type { BattleMatch, BattlePoint } from '../../src/domain/types.ts'

function match(overrides: Partial<BattleMatch>): BattleMatch {
  return {
    id: 'm1',
    a: { bladeId: 'blade-a' },
    b: { bladeId: 'blade-b' },
    points: [],
    playedAt: '2026-09-25',
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeMatchScore／isMatchComplete／matchWinner（第 2 節：先到 4 分獲勝）', () => {
  it('轉停 1 分、出界爆裂 2 分、極限 3 分，依序累加', () => {
    const points: BattlePoint[] = [
      { scorer: 'a', finish: 'spin' },
      { scorer: 'a', finish: 'over_burst' },
      { scorer: 'b', finish: 'xtreme' },
    ]
    expect(computeMatchScore(points)).toEqual({ a: 3, b: 3 })
  })

  it('還沒有一邊到 4 分時，isMatchComplete 是 false，matchWinner 是 undefined', () => {
    const points: BattlePoint[] = [{ scorer: 'a', finish: 'over_burst' }]
    expect(isMatchComplete(points)).toBe(false)
    expect(matchWinner(points)).toBeUndefined()
  })

  it('極限把分數從 2 推到 5（超過 4）時，仍然正確判定達陣，不是卡在剛好等於 4', () => {
    const points: BattlePoint[] = [
      { scorer: 'a', finish: 'over_burst' },
      { scorer: 'a', finish: 'xtreme' },
    ]
    expect(computeMatchScore(points)).toEqual({ a: 5, b: 0 })
    expect(isMatchComplete(points)).toBe(true)
    expect(matchWinner(points)).toBe('a')
  })

  it('MATCH_WIN_SCORE 是 4', () => {
    expect(MATCH_WIN_SCORE).toBe(4)
  })
})

describe('computePartWinRateIndex（第 2 節：零件勝率聚合，改吃 BattleMatch[]）', () => {
  it('空陣列不拋錯，回傳空 Map', () => {
    expect(computePartWinRateIndex([]).size).toBe(0)
  })

  it('A 贏一場（4 分），A 的零件各記一次贏、B 的零件各記一次輸', () => {
    const matches: BattleMatch[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      match({ id: `m${i}`, points: [{ scorer: 'a', finish: 'xtreme' }, { scorer: 'a', finish: 'spin' }] }),
    )
    const index = computePartWinRateIndex(matches)
    expect(index.get('blade-a')).toEqual({ wins: LOW_SAMPLE_THRESHOLD, losses: 0, winRate: 1 })
    expect(index.get('blade-b')).toEqual({ wins: 0, losses: LOW_SAMPLE_THRESHOLD, winRate: 0 })
  })

  it('同一顆零件同時出現在 A、B 兩邊的不同場，輸贏各自累加不互相污染', () => {
    // shared 零件前 3 場放在 A（A 贏），後 3 場也放在 A（但這次 B 贏）——
    // 同一顆零件、同一個槽位角色，只是不同場的勝負不同，驗證輸贏各自累加
    // 對，不是「只要出現在 A 就一律算贏」這種誤判。
    const sharedWins = () =>
      match({ a: { bladeId: 'shared' }, b: { bladeId: 'other-1' }, points: [{ scorer: 'a', finish: 'xtreme' }, { scorer: 'a', finish: 'spin' }] })
    const sharedLoses = () =>
      match({ a: { bladeId: 'shared' }, b: { bladeId: 'other-2' }, points: [{ scorer: 'b', finish: 'xtreme' }, { scorer: 'b', finish: 'spin' }] })
    const matches: BattleMatch[] = [
      ...Array.from({ length: 3 }, sharedWins),
      ...Array.from({ length: 3 }, sharedLoses),
    ]
    const index = computePartWinRateIndex(matches)
    expect(index.get('shared')).toEqual({ wins: 3, losses: 3, winRate: 0.5 })
  })

  it('樣本數（wins+losses）低於門檻時 winRate 是 undefined，但 wins/losses 數字仍然正確', () => {
    const matches: BattleMatch[] = Array.from({ length: LOW_SAMPLE_THRESHOLD - 1 }, (_, i) =>
      match({ id: `m${i}`, points: [{ scorer: 'a', finish: 'xtreme' }, { scorer: 'a', finish: 'spin' }] }),
    )
    const entry = computePartWinRateIndex(matches).get('blade-a')!
    expect(entry.wins).toBe(LOW_SAMPLE_THRESHOLD - 1)
    expect(entry.winRate).toBeUndefined()
  })

  it('未完成的比賽（沒有一邊到 4 分）不會被當成任何一方贏，不貢獻任何零件的 wins/losses', () => {
    const matches: BattleMatch[] = [match({ points: [{ scorer: 'a', finish: 'spin' }] })]
    const index = computePartWinRateIndex(matches)
    expect(index.size).toBe(0)
  })
})
