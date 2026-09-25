/**
 * 個人對戰紀錄聚合（純函式）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md。
 */
import type { BattleFinish, BattleMatch, BattlePoint } from './types.ts'

export const LOW_SAMPLE_THRESHOLD = 5

/** 先到這個分數獲勝（官方規則：Beyblade X 個別對戰先到 4 分）。 */
export const MATCH_WIN_SCORE = 4

/**
 * 轉停 1 分、出界／爆裂 2 分（官方同分，合併成一個選項）、極限 3 分。
 *
 * 歷史紀錄的比分、贏家、零件勝率都是拿存好的 `points` 即時用這個常數重算，
 * 沒有把點值存進 `BattlePoint` 當快照。改這裡的數字會連舊紀錄的比分一起變，
 * 要調整先做版本化（例如把點值也存進 `BattlePoint`）。
 */
export const FINISH_POINTS: Record<BattleFinish, number> = {
  spin: 1,
  over_burst: 2,
  xtreme: 3,
}

export function computeMatchScore(points: BattlePoint[]): { a: number; b: number } {
  return points.reduce(
    (score, point) => {
      const value = FINISH_POINTS[point.finish]
      return point.scorer === 'a' ? { a: score.a + value, b: score.b } : { a: score.a, b: score.b + value }
    },
    { a: 0, b: 0 },
  )
}

/** 用「達到」不是「剛好等於」——極限終結可能讓分數一口氣超過 4。 */
export function isMatchComplete(points: BattlePoint[]): boolean {
  const score = computeMatchScore(points)
  return score.a >= MATCH_WIN_SCORE || score.b >= MATCH_WIN_SCORE
}

export function matchWinner(points: BattlePoint[]): 'a' | 'b' | undefined {
  const score = computeMatchScore(points)
  if (score.a >= MATCH_WIN_SCORE) return 'a'
  if (score.b >= MATCH_WIN_SCORE) return 'b'
  return undefined
}

export interface PartWinRateEntry {
  wins: number
  losses: number
  /** wins / (wins + losses)，樣本數低於 LOW_SAMPLE_THRESHOLD 時 undefined。 */
  winRate?: number
}

const SLOT_KEYS = [
  'bladeId',
  'lockChipId',
  'mainBladeId',
  'overBladeId',
  'assistBladeId',
  'ratchetId',
  'bitId',
] as const

function partIdsOf(slots: BattleMatch['a']): string[] {
  return SLOT_KEYS.map((key) => slots[key]).filter((id): id is string => Boolean(id))
}

interface MutableCount {
  wins: number
  losses: number
}

function ensure(counts: Map<string, MutableCount>, partId: string): MutableCount {
  const existing = counts.get(partId)
  if (existing) return existing
  const fresh: MutableCount = { wins: 0, losses: 0 }
  counts.set(partId, fresh)
  return fresh
}

export function computePartWinRateIndex(matches: BattleMatch[]): Map<string, PartWinRateEntry> {
  const counts = new Map<string, MutableCount>()

  for (const battleMatch of matches) {
    const winner = matchWinner(battleMatch.points)
    if (!winner) continue // 未完成的比賽不貢獻任何零件的輸贏。

    const aParts = partIdsOf(battleMatch.a)
    const bParts = partIdsOf(battleMatch.b)
    const winners = winner === 'a' ? aParts : bParts
    const losers = winner === 'a' ? bParts : aParts
    for (const partId of winners) ensure(counts, partId).wins += 1
    for (const partId of losers) ensure(counts, partId).losses += 1
  }

  const result = new Map<string, PartWinRateEntry>()
  for (const [partId, count] of counts) {
    const sample = count.wins + count.losses
    result.set(partId, {
      ...count,
      winRate: sample >= LOW_SAMPLE_THRESHOLD ? count.wins / sample : undefined,
    })
  }
  return result
}
