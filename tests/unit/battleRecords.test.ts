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
    a: [{ bladeId: 'a1' }, { bladeId: 'a2' }, { bladeId: 'a3' }],
    b: [{ bladeId: 'b1' }, { bladeId: 'b2' }, { bladeId: 'b3' }],
    points: [],
    playedAt: '2026-09-28',
    createdAt: '2026-09-28T00:00:00.000Z',
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

describe('computePartWinRateIndex（3on3：逐分歸屬，不是整場歸屬）', () => {
  it('空陣列不拋錯，回傳空 Map', () => {
    expect(computePartWinRateIndex([]).size).toBe(0)
  })

  it('前三場個別對戰，每一分只算給那一分實際打的陀螺，不是整場贏家的三隻陀螺全部算贏', () => {
    // 1st 陀螺：a1 贏（scorer a, beyIndex 0）；2nd 陀螺：b2 贏（scorer b, beyIndex 1）；
    // 3rd 陀螺：a3 打到極限直接讓 A 隊累計到 4 分（scorer a, beyIndex 2, xtreme +3）。
    const matches: BattleMatch[] = [
      match({
        points: [
          { scorer: 'a', finish: 'spin', beyIndex: 0 },
          { scorer: 'b', finish: 'over_burst', beyIndex: 1 },
          { scorer: 'a', finish: 'xtreme', beyIndex: 2 },
        ],
      }),
    ]
    const index = computePartWinRateIndex(matches)
    // A 隊贏了整場（1+3=4 分），但 a2（2nd 陀螺）那一場其實輸了，不該算贏。
    expect(index.get('a1')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('a2')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    expect(index.get('a3')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    // B 隊同理：b2 那一場贏了（不該算輸），b1、b3 才是真的輸。
    expect(index.get('b1')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    expect(index.get('b2')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('b3')).toEqual({ wins: 0, losses: 1, winRate: undefined })
  })

  it('延伸賽（沒有 beyIndex）的分數不歸屬給任何零件', () => {
    const matches: BattleMatch[] = [
      match({
        points: [
          { scorer: 'a', finish: 'spin', beyIndex: 0 },
          { scorer: 'b', finish: 'spin', beyIndex: 1 },
          { scorer: 'a', finish: 'spin', beyIndex: 2 },
          // 三場打完 2:1，還沒到 4 分，延伸賽兩分沒有 beyIndex。
          { scorer: 'a', finish: 'xtreme' },
          { scorer: 'a', finish: 'spin' },
        ],
      }),
    ]
    const index = computePartWinRateIndex(matches)
    // 前三場照樣正確歸屬。
    expect(index.get('a1')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('b1')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    // 延伸賽的兩分（讓 A 隊從 2 分衝到 6 分）不歸屬給任何零件，
    // 所以整體 counts 裡只有前三場涉及的 6 顆零件，沒有其他新零件冒出來。
    expect(index.size).toBe(6)
  })

  it('同一顆零件跨場輸贏各自累加不互相污染', () => {
    const sharedWins = () =>
      match({
        a: [{ bladeId: 'shared' }, { bladeId: 'a2' }, { bladeId: 'a3' }],
        b: [{ bladeId: 'other-1' }, { bladeId: 'b2' }, { bladeId: 'b3' }],
        points: [{ scorer: 'a', finish: 'xtreme', beyIndex: 0 }],
      })
    const sharedLoses = () =>
      match({
        a: [{ bladeId: 'other-2' }, { bladeId: 'a2' }, { bladeId: 'a3' }],
        b: [{ bladeId: 'shared' }, { bladeId: 'b2' }, { bladeId: 'b3' }],
        // scorer: 'a' -- A 那隻贏，B 側的 shared 才是輸的那個。
        points: [{ scorer: 'a', finish: 'xtreme', beyIndex: 0 }],
      })
    const matches: BattleMatch[] = [
      ...Array.from({ length: 3 }, sharedWins),
      ...Array.from({ length: 3 }, sharedLoses),
    ]
    const index = computePartWinRateIndex(matches)
    expect(index.get('shared')).toEqual({ wins: 3, losses: 3, winRate: 0.5 })
  })

  it('樣本數（wins+losses）低於門檻時 winRate 是 undefined，但 wins/losses 數字仍然正確', () => {
    const matches: BattleMatch[] = Array.from({ length: LOW_SAMPLE_THRESHOLD - 1 }, () =>
      match({ points: [{ scorer: 'a', finish: 'xtreme', beyIndex: 0 }] }),
    )
    const entry = computePartWinRateIndex(matches).get('a1')!
    expect(entry.wins).toBe(LOW_SAMPLE_THRESHOLD - 1)
    expect(entry.winRate).toBeUndefined()
  })
})
