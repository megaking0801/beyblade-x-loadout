import type {
  BattleEvidenceLevel,
  BattleFinish,
  BattleRecordSource,
  BattleRoundRecord,
  BattleRoundResult,
  ComboSlots,
} from './types.ts'

export interface SaveBattleRoundInput {
  a: ComboSlots
  b: ComboSlots
  result: BattleRoundResult
  finish: BattleFinish
  stadium: string
  format: string
  playedAt: string
  source: BattleRecordSource
  sourceUrl?: string
  timestampSeconds?: number
  notes?: string
}

export interface BattlePairSummary {
  records: BattleRoundRecord[]
  validRounds: number
  aWins: number
  bWins: number
  ties: number
  invalidRounds: number
  localRounds: number
  videoAttachedRounds: number
  reviewedRounds: number
}

export interface AnonymousBattleRound {
  a: ComboSlots
  b: ComboSlots
  result: BattleRoundResult
  finish: BattleFinish
  stadium: string
  format: string
  playedAt: string
  source: BattleRecordSource
  evidenceLevel: BattleEvidenceLevel
  sourceUrl?: string
  timestampSeconds?: number
}

export interface BattleDatasetExport {
  schema: 'beyblade-x-battle-rounds'
  schemaVersion: 1
  exportedAt: string
  privacy: 'anonymous-no-device-or-player-id'
  records: AnonymousBattleRound[]
}

function definedSlotCount(slots: ComboSlots): number {
  return Object.values(slots).filter((value) => typeof value === 'string' && value.length > 0).length
}

export function sameComboSlots(a: ComboSlots, b: ComboSlots): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => a[key as keyof ComboSlots] === b[key as keyof ComboSlots])
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`請填寫${label}`)
  return trimmed
}

function normalizedUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('影片來源必須是有效網址')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('影片來源只接受 http 或 https 網址')
  }
  return parsed.toString()
}

/** 儲存前的唯一驗證入口；UI 與 repository 共用同一套規則。 */
export function validateBattleRoundInput(input: SaveBattleRoundInput): SaveBattleRoundInput {
  if (definedSlotCount(input.a) === 0 || definedSlotCount(input.b) === 0) {
    throw new Error('A、B 都必須是完整配置')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.playedAt) || Number.isNaN(Date.parse(`${input.playedAt}T00:00:00Z`))) {
    throw new Error('對戰日期格式不正確')
  }
  if ((input.result === 'a' || input.result === 'b') && input.finish === 'none') {
    throw new Error('分出勝負時必須選擇勝利方式')
  }
  if ((input.result === 'tie' || input.result === 'invalid') && input.finish !== 'none') {
    throw new Error('平手或無效局的勝利方式必須為「不適用」')
  }

  const sourceUrl = normalizedUrl(input.sourceUrl)
  const hasTimestamp = input.timestampSeconds !== undefined
  if (hasTimestamp && (!Number.isInteger(input.timestampSeconds) || input.timestampSeconds! < 0)) {
    throw new Error('影片時間點必須是 0 以上的整數秒')
  }
  if (hasTimestamp && !sourceUrl) throw new Error('填寫影片時間點時也必須提供影片網址')
  if (input.source === 'public_video' && (!sourceUrl || !hasTimestamp)) {
    throw new Error('公開影片紀錄必須提供影片網址與時間點')
  }

  const notes = input.notes?.trim()
  if (notes && notes.length > 1000) throw new Error('備註最多 1000 字')
  return {
    ...input,
    stadium: requireText(input.stadium, '盤型'),
    format: requireText(input.format, '賽制'),
    ...(sourceUrl ? { sourceUrl } : { sourceUrl: undefined }),
    ...(hasTimestamp ? { timestampSeconds: input.timestampSeconds } : { timestampSeconds: undefined }),
    ...(notes ? { notes } : { notes: undefined }),
  }
}

export function evidenceLevelFor(input: SaveBattleRoundInput): Exclude<BattleEvidenceLevel, 'reviewed'> {
  return input.sourceUrl ? 'video_attached' : 'local'
}

export function summarizeBattlePair(
  records: readonly BattleRoundRecord[],
  a: ComboSlots,
  b: ComboSlots,
): BattlePairSummary {
  const matching = records.filter((record) =>
    (sameComboSlots(record.a, a) && sameComboSlots(record.b, b))
    || (sameComboSlots(record.a, b) && sameComboSlots(record.b, a)),
  )
  let aWins = 0
  let bWins = 0
  let ties = 0
  let invalidRounds = 0
  for (const record of matching) {
    if (record.result === 'tie') {
      ties += 1
      continue
    }
    if (record.result === 'invalid') {
      invalidRounds += 1
      continue
    }
    const directOrder = sameComboSlots(record.a, a)
    const selectedAWon = directOrder ? record.result === 'a' : record.result === 'b'
    if (selectedAWon) aWins += 1
    else bWins += 1
  }
  return {
    records: matching,
    validRounds: aWins + bWins + ties,
    aWins,
    bWins,
    ties,
    invalidRounds,
    localRounds: matching.filter((record) => record.evidenceLevel === 'local').length,
    videoAttachedRounds: matching.filter((record) => record.evidenceLevel === 'video_attached').length,
    reviewedRounds: matching.filter((record) => record.evidenceLevel === 'reviewed').length,
  }
}

/**
 * 匿名資料集匯出：刻意排除本機 id、建立時間與自由文字備註，避免把裝置資訊或
 * 使用者可能寫入備註的個資送進人工審核流程。
 */
export function exportBattleDataset(
  records: readonly BattleRoundRecord[],
  exportedAt = new Date().toISOString(),
): BattleDatasetExport {
  return {
    schema: 'beyblade-x-battle-rounds',
    schemaVersion: 1,
    exportedAt,
    privacy: 'anonymous-no-device-or-player-id',
    records: records.map((record) => ({
      a: record.a,
      b: record.b,
      result: record.result,
      finish: record.finish,
      stadium: record.stadium,
      format: record.format,
      playedAt: record.playedAt,
      source: record.source,
      evidenceLevel: record.evidenceLevel,
      ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
      ...(record.timestampSeconds === undefined ? {} : { timestampSeconds: record.timestampSeconds }),
    })),
  }
}
