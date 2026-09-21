export const TRUSTED_VIDEO_SOURCE_SCHEMA = 'beyblade-x-trusted-video-sources' as const
export const TRUSTED_VIDEO_SOURCE_SCHEMA_VERSION = 1 as const

export type TrustedVideoSourceType = 'official' | 'tournament_organizer' | 'competitive_community'
export type VideoSourceApprovalStatus = 'candidate' | 'approved' | 'rejected' | 'suspended'
export type VideoSourceDecisionStatus = Exclude<VideoSourceApprovalStatus, 'candidate'>

export interface TrustedVideoSourceEvidence {
  readonly url: string
  readonly description: string
  readonly checkedAt: string
}

export interface TrustedVideoSourceDecision {
  readonly status: VideoSourceDecisionStatus
  readonly decidedBy: string
  readonly decidedAt: string
  readonly reason: string
}

export interface TrustedVideoSource {
  readonly id: string
  readonly platform: 'youtube'
  readonly youtube: {
    readonly channelId: string
    readonly channelUrl: string
    readonly displayName: string
  }
  readonly sourceType: TrustedVideoSourceType
  readonly countryCode: string | null
  readonly languages: readonly string[]
  readonly rationale: string
  readonly evidence: readonly TrustedVideoSourceEvidence[]
  readonly approval: {
    readonly status: VideoSourceApprovalStatus
    readonly decisions: readonly TrustedVideoSourceDecision[]
  }
  readonly createdAt: string
  readonly updatedAt: string
}

export interface TrustedVideoSourceRegistry {
  readonly schema: typeof TRUSTED_VIDEO_SOURCE_SCHEMA
  readonly schemaVersion: typeof TRUSTED_VIDEO_SOURCE_SCHEMA_VERSION
  readonly updatedAt: string
  readonly sources: readonly TrustedVideoSource[]
}

export type ApprovedTrustedVideoSource = TrustedVideoSource & {
  readonly approval: TrustedVideoSource['approval'] & { readonly status: 'approved' }
}

const SOURCE_TYPES: readonly TrustedVideoSourceType[] = [
  'official',
  'tournament_organizer',
  'competitive_community',
]
const APPROVAL_STATUSES: readonly VideoSourceApprovalStatus[] = [
  'candidate',
  'approved',
  'rejected',
  'suspended',
]
const DECISION_STATUSES: readonly VideoSourceDecisionStatus[] = ['approved', 'rejected', 'suspended']
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/u
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

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

function requireIsoDate(value: unknown, path: string): string {
  const text = requireString(value, path)
  if (Number.isNaN(Date.parse(text))) throw new Error(`${path} 必須是有效日期時間`)
  return text
}

function requireHttpsUrl(value: unknown, path: string): string {
  const text = requireString(value, path)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error(`${path} 必須是有效 HTTPS URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${path} 必須是有效 HTTPS URL`)
  return text
}

function validateYoutube(value: unknown, path: string): TrustedVideoSource['youtube'] {
  assertObject(value, path)
  assertKeys(value, ['channelId', 'channelUrl', 'displayName'], path)
  const channelId = requireString(value.channelId, `${path}.channelId`)
  if (!YOUTUBE_CHANNEL_ID.test(channelId)) {
    throw new Error(`${path}.channelId 必須是標準 YouTube UC channelId`)
  }
  const channelUrl = requireHttpsUrl(value.channelUrl, `${path}.channelUrl`)
  const parsed = new URL(channelUrl)
  if (
    !['youtube.com', 'www.youtube.com'].includes(parsed.hostname) ||
    parsed.pathname !== `/channel/${channelId}` ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(`${path}.channelUrl 必須是對應 channelId 的標準 YouTube channel URL`)
  }
  return {
    channelId,
    channelUrl,
    displayName: requireString(value.displayName, `${path}.displayName`),
  }
}

function validateEvidence(value: unknown, path: string): TrustedVideoSourceEvidence {
  assertObject(value, path)
  assertKeys(value, ['url', 'description', 'checkedAt'], path)
  return {
    url: requireHttpsUrl(value.url, `${path}.url`),
    description: requireString(value.description, `${path}.description`),
    checkedAt: requireIsoDate(value.checkedAt, `${path}.checkedAt`),
  }
}

function validateDecision(value: unknown, path: string): TrustedVideoSourceDecision {
  assertObject(value, path)
  assertKeys(value, ['status', 'decidedBy', 'decidedAt', 'reason'], path)
  if (!DECISION_STATUSES.includes(value.status as VideoSourceDecisionStatus)) {
    throw new Error(`${path}.status 不是支援的決策狀態`)
  }
  return {
    status: value.status as VideoSourceDecisionStatus,
    decidedBy: requireString(value.decidedBy, `${path}.decidedBy`),
    decidedAt: requireIsoDate(value.decidedAt, `${path}.decidedAt`),
    reason: requireString(value.reason, `${path}.reason`),
  }
}

function validateApproval(value: unknown, path: string): TrustedVideoSource['approval'] {
  assertObject(value, path)
  assertKeys(value, ['status', 'decisions'], path)
  if (!APPROVAL_STATUSES.includes(value.status as VideoSourceApprovalStatus)) {
    throw new Error(`${path}.status 不是支援的核准狀態`)
  }
  if (!Array.isArray(value.decisions)) throw new Error(`${path}.decisions 必須是陣列`)
  const status = value.status as VideoSourceApprovalStatus
  const decisions = value.decisions.map((decision, index) => validateDecision(decision, `${path}.decisions[${index}]`))
  if (status === 'candidate' && decisions.length > 0) {
    throw new Error(`${path} 候選狀態不得帶入已形成的決策紀錄`)
  }
  if (status !== 'candidate' && decisions.length === 0) {
    throw new Error(`${path} 非候選狀態必須有決策紀錄`)
  }
  const latest = decisions.at(-1)
  if (latest && latest.status !== status) {
    throw new Error(`${path}.status 必須與最後一筆決策一致`)
  }
  return { status, decisions }
}

function validateSource(value: unknown, path: string): TrustedVideoSource {
  assertObject(value, path)
  assertKeys(
    value,
    [
      'id',
      'platform',
      'youtube',
      'sourceType',
      'countryCode',
      'languages',
      'rationale',
      'evidence',
      'approval',
      'createdAt',
      'updatedAt',
    ],
    path,
  )
  if (value.platform !== 'youtube') throw new Error(`${path}.platform 目前只接受 youtube`)
  if (!SOURCE_TYPES.includes(value.sourceType as TrustedVideoSourceType)) {
    throw new Error(`${path}.sourceType 不是支援的來源類型`)
  }
  if (value.countryCode !== null && (typeof value.countryCode !== 'string' || !/^[A-Z]{2}$/u.test(value.countryCode))) {
    throw new Error(`${path}.countryCode 必須是兩碼大寫國家代碼或 null`)
  }
  if (!Array.isArray(value.languages)) throw new Error(`${path}.languages 必須是陣列`)
  const languages = value.languages.map((language, index) => {
    const text = requireString(language, `${path}.languages[${index}]`)
    if (!LANGUAGE_TAG.test(text)) throw new Error(`${path}.languages[${index}] 必須是有效語言標籤`)
    return text
  })
  if (new Set(languages).size !== languages.length) throw new Error(`${path}.languages 不得重複`)
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
    throw new Error(`${path}.evidence 至少需要一筆來源證據`)
  }

  const source: TrustedVideoSource = {
    id: requireString(value.id, `${path}.id`),
    platform: 'youtube',
    youtube: validateYoutube(value.youtube, `${path}.youtube`),
    sourceType: value.sourceType as TrustedVideoSourceType,
    countryCode: value.countryCode as string | null,
    languages,
    rationale: requireString(value.rationale, `${path}.rationale`),
    evidence: value.evidence.map((evidence, index) => validateEvidence(evidence, `${path}.evidence[${index}]`)),
    approval: validateApproval(value.approval, `${path}.approval`),
    createdAt: requireIsoDate(value.createdAt, `${path}.createdAt`),
    updatedAt: requireIsoDate(value.updatedAt, `${path}.updatedAt`),
  }

  const createdAt = Date.parse(source.createdAt)
  const updatedAt = Date.parse(source.updatedAt)
  if (updatedAt < createdAt) throw new Error(`${path}.updatedAt 不得早於 createdAt`)
  for (const [index, evidence] of source.evidence.entries()) {
    if (Date.parse(evidence.checkedAt) > updatedAt) {
      throw new Error(`${path}.evidence[${index}].checkedAt 不得晚於 updatedAt`)
    }
  }
  let previousDecisionAt = Number.NEGATIVE_INFINITY
  for (const [index, decision] of source.approval.decisions.entries()) {
    const decisionAt = Date.parse(decision.decidedAt)
    if (decisionAt < createdAt || decisionAt > updatedAt) {
      throw new Error(`${path}.approval.decisions[${index}].decidedAt 必須介於 createdAt 與 updatedAt`)
    }
    if (decisionAt <= previousDecisionAt) {
      throw new Error(`${path}.approval.decisions 必須依時間順序排列且時間不得重複`)
    }
    if (
      decision.status === 'approved' &&
      !source.evidence.some((evidence) => Date.parse(evidence.checkedAt) <= decisionAt)
    ) {
      throw new Error(`${path}.approval.decisions[${index}] 核准前已核對的來源證據至少要有一筆`)
    }
    previousDecisionAt = decisionAt
  }
  return source
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

/** 外部或版本化來源資料必須先通過此 runtime 邊界。 */
export function validateTrustedVideoSourceRegistry(value: unknown): TrustedVideoSourceRegistry {
  assertObject(value, 'TrustedVideoSourceRegistry')
  assertKeys(value, ['schema', 'schemaVersion', 'updatedAt', 'sources'], 'TrustedVideoSourceRegistry')
  if (value.schema !== TRUSTED_VIDEO_SOURCE_SCHEMA) throw new Error('TrustedVideoSourceRegistry.schema 不正確')
  if (value.schemaVersion !== TRUSTED_VIDEO_SOURCE_SCHEMA_VERSION) {
    throw new Error('TrustedVideoSourceRegistry.schemaVersion 不支援')
  }
  if (!Array.isArray(value.sources)) throw new Error('TrustedVideoSourceRegistry.sources 必須是陣列')
  const updatedAt = requireIsoDate(value.updatedAt, 'TrustedVideoSourceRegistry.updatedAt')
  const sources = value.sources.map((source, index) => validateSource(source, `sources[${index}]`))
  const ids = new Set<string>()
  const channelIds = new Set<string>()
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`TrustedVideoSourceRegistry 有重複 source id：${source.id}`)
    if (channelIds.has(source.youtube.channelId)) {
      throw new Error(`TrustedVideoSourceRegistry 有重複 YouTube channelId：${source.youtube.channelId}`)
    }
    if (Date.parse(source.updatedAt) > Date.parse(updatedAt)) {
      throw new Error(`來源 ${source.id} 的 updatedAt 不得晚於 registry.updatedAt`)
    }
    ids.add(source.id)
    channelIds.add(source.youtube.channelId)
  }
  return deepFreeze({
    schema: TRUSTED_VIDEO_SOURCE_SCHEMA,
    schemaVersion: TRUSTED_VIDEO_SOURCE_SCHEMA_VERSION,
    updatedAt,
    sources,
  })
}

function isCurrentlyApproved(source: TrustedVideoSource): source is ApprovedTrustedVideoSource {
  return source.approval.status === 'approved'
}

/** 供後續影片發現管線取得來源；候選、拒絕與暫停來源一律不會出現在結果中。 */
export function listApprovedVideoSources(value: unknown): readonly ApprovedTrustedVideoSource[] {
  return deepFreeze(validateTrustedVideoSourceRegistry(value).sources.filter(isCurrentlyApproved))
}

/** 核對某來源在指定時間是否已核准；避免事後核准被倒填成抽取當下已可信。 */
export function wasVideoSourceApprovedAt(source: TrustedVideoSource, at: string): boolean {
  const instant = Date.parse(at)
  if (Number.isNaN(instant) || source.approval.status !== 'approved') return false
  const latestDecision = source.approval.decisions.filter((decision) => Date.parse(decision.decidedAt) <= instant).at(-1)
  return latestDecision?.status === 'approved'
}
