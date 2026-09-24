/**
 * 個人對戰紀錄聚合（純函式）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-24-personal-battle-log-design.md 第 3 節。
 */
import type { BattleRound } from './types.ts'

export const LOW_SAMPLE_THRESHOLD = 5

export interface PartWinRateEntry {
  wins: number
  losses: number
  ties: number
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

function partIdsOf(slots: BattleRound['a']): string[] {
  return SLOT_KEYS.map((key) => slots[key]).filter((id): id is string => Boolean(id))
}

interface MutableCount {
  wins: number
  losses: number
  ties: number
}

function ensure(counts: Map<string, MutableCount>, partId: string): MutableCount {
  const existing = counts.get(partId)
  if (existing) return existing
  const fresh: MutableCount = { wins: 0, losses: 0, ties: 0 }
  counts.set(partId, fresh)
  return fresh
}

export function computePartWinRateIndex(rounds: BattleRound[]): Map<string, PartWinRateEntry> {
  const counts = new Map<string, MutableCount>()

  for (const round of rounds) {
    const aParts = partIdsOf(round.a)
    const bParts = partIdsOf(round.b)

    if (round.result === 'tie') {
      for (const partId of [...aParts, ...bParts]) ensure(counts, partId).ties += 1
      continue
    }

    const winners = round.result === 'a' ? aParts : bParts
    const losers = round.result === 'a' ? bParts : aParts
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
