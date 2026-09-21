import type { ComboSlots } from './types.ts'
import {
  validateTrustedVideoSourceRegistry,
  wasVideoSourceApprovedAt,
} from './trustedVideoSources.ts'

export const VIDEO_EVIDENCE_SCHEMA = 'beyblade-x-video-evidence' as const
export const VIDEO_EVIDENCE_SCHEMA_VERSION = 1 as const
export const VIDEO_EVIDENCE_TRAINING_CONFIDENCE = 0.9

export type VideoEvidenceWinner = 'a' | 'b' | 'tie' | 'invalid'
export type VideoEvidenceFinish = 'xtreme' | 'over' | 'burst' | 'spin' | 'none'
export type VideoEvidenceRejectionReason =
  | 'missing_complete_combo'
  | 'missing_winner'
  | 'missing_timestamps'
  | 'low_confidence'
  | 'illegal_combo'
  | 'untrusted_source'
  | 'extraction_disagreement'

export interface VideoEvidence {
  readonly id: string
  readonly video: {
    readonly youtubeVideoId: string
    readonly url: string
    readonly channelId: string
    readonly channelName: string
    readonly publishedAt: string
  }
  readonly round: {
    readonly startSeconds: number | null
    readonly endSeconds: number | null
  }
  readonly a: Readonly<ComboSlots>
  readonly b: Readonly<ComboSlots>
  readonly winner: VideoEvidenceWinner | null
  readonly finish: VideoEvidenceFinish | null
  readonly rules: {
    readonly format: string | null
    readonly stadium: string | null
  }
  readonly confidence: {
    readonly timestamps: number
    readonly a: number
    readonly b: number
    readonly winner: number
    readonly finish: number
    readonly rules: number
  }
  readonly extraction: {
    readonly provider: 'gemini'
    readonly model: string
    readonly promptVersion: string
    readonly extractedAt: string
  }
  readonly training: {
    readonly included: boolean
    readonly rejectionReasons: readonly VideoEvidenceRejectionReason[]
  }
}

export interface VideoEvidenceDataset {
  readonly schema: typeof VIDEO_EVIDENCE_SCHEMA
  readonly schemaVersion: typeof VIDEO_EVIDENCE_SCHEMA_VERSION
  readonly generatedAt: string
  readonly records: readonly VideoEvidence[]
}

const SLOT_KEYS = [
  'bladeId',
  'lockChipId',
  'mainBladeId',
  'overBladeId',
  'assistBladeId',
  'ratchetId',
  'bitId',
] as const satisfies readonly (keyof ComboSlots)[]

const WINNERS: readonly VideoEvidenceWinner[] = ['a', 'b', 'tie', 'invalid']
const FINISHES: readonly VideoEvidenceFinish[] = ['xtreme', 'over', 'burst', 'spin', 'none']
const REJECTION_REASONS: readonly VideoEvidenceRejectionReason[] = [
  'missing_complete_combo',
  'missing_winner',
  'missing_timestamps',
  'low_confidence',
  'illegal_combo',
  'untrusted_source',
  'extraction_disagreement',
]

function assertObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} 必須是物件`)
  }
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${path} 有未知欄位：${unknown.join('、')}`)
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} 必須是非空字串`)
  return value
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null
  return requireString(value, path)
}

function requireIsoDate(value: unknown, path: string): string {
  const text = requireString(value, path)
  if (Number.isNaN(Date.parse(text))) throw new Error(`${path} 必須是有效日期時間`)
  return text
}

function requireConfidence(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${path} 信心必須介於 0 與 1`)
  }
  return value
}

function requireNullableSecond(value: unknown, path: string): number | null {
  if (value === null) return null
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${path} 必須是 0 以上整數秒或 null`)
  return value as number
}

function validateSlots(value: unknown, path: string): Readonly<ComboSlots> {
  assertObject(value, path)
  assertKeys(value, SLOT_KEYS, path)
  const result: ComboSlots = {}
  for (const key of SLOT_KEYS) {
    if (value[key] !== undefined) result[key] = requireString(value[key], `${path}.${key}`)
  }
  return result
}

function hasMinimumComboIdentity(slots: Readonly<ComboSlots>): boolean {
  return Boolean((slots.bladeId || slots.mainBladeId) && slots.bitId)
}

function validateVideo(value: unknown, path: string): VideoEvidence['video'] {
  assertObject(value, path)
  assertKeys(value, ['youtubeVideoId', 'url', 'channelId', 'channelName', 'publishedAt'], path)
  const youtubeVideoId = requireString(value.youtubeVideoId, `${path}.youtubeVideoId`)
  const urlText = requireString(value.url, `${path}.url`)
  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    throw new Error(`${path}.url 必須是有效 YouTube 網址`)
  }
  const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'])
  if (url.protocol !== 'https:' || !youtubeHosts.has(url.hostname) || !urlText.includes(youtubeVideoId)) {
    throw new Error(`${path}.url 必須是對應影片的 HTTPS YouTube 網址`)
  }
  return {
    youtubeVideoId,
    url: urlText,
    channelId: requireString(value.channelId, `${path}.channelId`),
    channelName: requireString(value.channelName, `${path}.channelName`),
    publishedAt: requireIsoDate(value.publishedAt, `${path}.publishedAt`),
  }
}

function validateRound(value: unknown, path: string): VideoEvidence['round'] {
  assertObject(value, path)
  assertKeys(value, ['startSeconds', 'endSeconds'], path)
  const startSeconds = requireNullableSecond(value.startSeconds, `${path}.startSeconds`)
  const endSeconds = requireNullableSecond(value.endSeconds, `${path}.endSeconds`)
  if ((startSeconds === null) !== (endSeconds === null)) throw new Error(`${path} 的開始與結束秒數必須同時存在`)
  if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) {
    throw new Error(`${path}.endSeconds 結束秒數必須晚於開始秒數`)
  }
  return { startSeconds, endSeconds }
}

function validateRules(value: unknown, path: string): VideoEvidence['rules'] {
  assertObject(value, path)
  assertKeys(value, ['format', 'stadium'], path)
  return {
    format: nullableString(value.format, `${path}.format`),
    stadium: nullableString(value.stadium, `${path}.stadium`),
  }
}

function validateConfidence(value: unknown, path: string): VideoEvidence['confidence'] {
  assertObject(value, path)
  const keys = ['timestamps', 'a', 'b', 'winner', 'finish', 'rules'] as const
  assertKeys(value, keys, path)
  return {
    timestamps: requireConfidence(value.timestamps, `${path}.timestamps`),
    a: requireConfidence(value.a, `${path}.a`),
    b: requireConfidence(value.b, `${path}.b`),
    winner: requireConfidence(value.winner, `${path}.winner`),
    finish: requireConfidence(value.finish, `${path}.finish`),
    rules: requireConfidence(value.rules, `${path}.rules`),
  }
}

function validateExtraction(value: unknown, path: string): VideoEvidence['extraction'] {
  assertObject(value, path)
  assertKeys(value, ['provider', 'model', 'promptVersion', 'extractedAt'], path)
  if (value.provider !== 'gemini') throw new Error(`${path}.provider 目前只接受 gemini`)
  return {
    provider: 'gemini',
    model: requireString(value.model, `${path}.model`),
    promptVersion: requireString(value.promptVersion, `${path}.promptVersion`),
    extractedAt: requireIsoDate(value.extractedAt, `${path}.extractedAt`),
  }
}

function validateTraining(value: unknown, path: string): VideoEvidence['training'] {
  assertObject(value, path)
  assertKeys(value, ['included', 'rejectionReasons'], path)
  if (typeof value.included !== 'boolean') throw new Error(`${path}.included 必須是 boolean`)
  if (!Array.isArray(value.rejectionReasons)) throw new Error(`${path}.rejectionReasons 必須是陣列`)
  const rejectionReasons = value.rejectionReasons.map((reason, index) => {
    if (!REJECTION_REASONS.includes(reason as VideoEvidenceRejectionReason)) {
      throw new Error(`${path}.rejectionReasons[${index}] 是未知拒收原因`)
    }
    return reason as VideoEvidenceRejectionReason
  })
  if (value.included && rejectionReasons.length > 0) throw new Error(`${path} 已納入訓練時不得有拒收原因`)
  if (!value.included && rejectionReasons.length === 0) throw new Error(`${path} 未納入訓練時必須列出拒收原因`)
  return { included: value.included, rejectionReasons }
}

function validateEvidence(value: unknown, path: string): VideoEvidence {
  assertObject(value, path)
  assertKeys(value, ['id', 'video', 'round', 'a', 'b', 'winner', 'finish', 'rules', 'confidence', 'extraction', 'training'], path)
  const winner = value.winner === null
    ? null
    : WINNERS.includes(value.winner as VideoEvidenceWinner) ? value.winner as VideoEvidenceWinner : undefined
  if (winner === undefined) throw new Error(`${path}.winner 不是支援的勝方值`)
  const finish = value.finish === null
    ? null
    : FINISHES.includes(value.finish as VideoEvidenceFinish) ? value.finish as VideoEvidenceFinish : undefined
  if (finish === undefined) throw new Error(`${path}.finish 不是支援的結束方式`)

  const evidence: VideoEvidence = {
    id: requireString(value.id, `${path}.id`),
    video: validateVideo(value.video, `${path}.video`),
    round: validateRound(value.round, `${path}.round`),
    a: validateSlots(value.a, `${path}.a`),
    b: validateSlots(value.b, `${path}.b`),
    winner,
    finish,
    rules: validateRules(value.rules, `${path}.rules`),
    confidence: validateConfidence(value.confidence, `${path}.confidence`),
    extraction: validateExtraction(value.extraction, `${path}.extraction`),
    training: validateTraining(value.training, `${path}.training`),
  }

  if (evidence.winner === null && evidence.confidence.winner !== 0) {
    throw new Error(`${path}.confidence.winner 在勝方缺漏時必須為 0`)
  }
  if (evidence.finish === null && evidence.confidence.finish !== 0) {
    throw new Error(`${path}.confidence.finish 在結束方式缺漏時必須為 0`)
  }
  if (evidence.training.included) {
    if (evidence.round.startSeconds === null) throw new Error(`${path} 納入訓練時必須有時間戳`)
    if (!hasMinimumComboIdentity(evidence.a) || !hasMinimumComboIdentity(evidence.b)) {
      throw new Error(`${path} 納入訓練時 A、B 必須有完整配置識別`)
    }
    if (evidence.winner !== 'a' && evidence.winner !== 'b') throw new Error(`${path} 納入訓練時必須有 A 或 B 勝方`)
    if (evidence.finish === null || evidence.finish === 'none') throw new Error(`${path} 納入訓練時必須有結束方式`)
    if (evidence.rules.format === null || evidence.rules.stadium === null) {
      throw new Error(`${path} 納入訓練時必須有賽制與場地`)
    }
    if (Object.values(evidence.confidence).some((confidence) => confidence < VIDEO_EVIDENCE_TRAINING_CONFIDENCE)) {
      throw new Error(`${path} 納入訓練時每個欄位信心都必須至少為 ${VIDEO_EVIDENCE_TRAINING_CONFIDENCE}`)
    }
  }
  return evidence
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

/**
 * 唯讀影片證據的 runtime 邊界；外部 JSON 與來源 registry 都必須先通過此函式。
 * 未核准來源可以留下拒收紀錄，但絕不會被標為訓練資料。
 */
export function validateVideoEvidenceDataset(value: unknown, sourceRegistryValue: unknown): VideoEvidenceDataset {
  const sourceRegistry = validateTrustedVideoSourceRegistry(sourceRegistryValue)
  assertObject(value, 'VideoEvidenceDataset')
  assertKeys(value, ['schema', 'schemaVersion', 'generatedAt', 'records'], 'VideoEvidenceDataset')
  if (value.schema !== VIDEO_EVIDENCE_SCHEMA) throw new Error('VideoEvidenceDataset.schema 不正確')
  if (value.schemaVersion !== VIDEO_EVIDENCE_SCHEMA_VERSION) throw new Error('VideoEvidenceDataset.schemaVersion 不支援')
  if (!Array.isArray(value.records)) throw new Error('VideoEvidenceDataset.records 必須是陣列')
  const records = value.records.map((record, index) => validateEvidence(record, `records[${index}]`))
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`VideoEvidenceDataset 有重複 evidence id：${record.id}`)
    ids.add(record.id)
    const source = sourceRegistry.sources.find(
      (candidate) => candidate.youtube.channelId === record.video.channelId,
    )
    if (!source || source.approval.status !== 'approved') {
      if (record.training.included) {
        throw new Error(`來源頻道 ${record.video.channelId} 未核准，不得納入訓練資料`)
      }
      if (!record.training.rejectionReasons.includes('untrusted_source')) {
        throw new Error(`未核准來源頻道 ${record.video.channelId} 的拒收紀錄必須包含 untrusted_source`)
      }
      continue
    }
    if (!wasVideoSourceApprovedAt(source, record.extraction.extractedAt)) {
      if (record.training.included) {
        throw new Error(`來源頻道 ${record.video.channelId} 在抽取當下尚未核准，不得納入訓練資料`)
      }
      if (!record.training.rejectionReasons.includes('untrusted_source')) {
        throw new Error(`抽取當下尚未核准的來源 ${record.video.channelId} 必須包含 untrusted_source`)
      }
    }
  }
  return deepFreeze({
    schema: VIDEO_EVIDENCE_SCHEMA,
    schemaVersion: VIDEO_EVIDENCE_SCHEMA_VERSION,
    generatedAt: requireIsoDate(value.generatedAt, 'VideoEvidenceDataset.generatedAt'),
    records,
  })
}
