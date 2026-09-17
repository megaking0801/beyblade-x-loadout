/**
 * 配裝器。
 *
 * 規格對照：第 17 節（三種模式、槽位順序）、第 18 節（相容性阻擋）、第 19 節（結果欄位）、
 * 第 20 節（四層分析與模型推估標示）、第 30 節（儲存配裝）、第 31 節（實體鎖定）、
 * 第 36 節（分享，不含個人庫存）。
 */
import { useEffect, useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { analyzeCombo } from '../../domain/analysis.ts'
import { expertPartRatingMeta, getExpertPartRatings, getExpertTierMatches } from '../../catalog/tierLists.ts'
import { getObservedComboMatches, getTournamentEvidenceReport } from '../../domain/tournament.ts'
import { buildEvidenceReasons, NO_EVIDENCE_NOTE_ZH } from '../../domain/reasons.ts'
import {
  getBuilderSlotSchema,
  hasIntegratedRatchet,
  lockedSlotReason,
  inferBuilderStructure,
  INTEGRATED_RATCHET_NOTE_BIT_ZH,
  INTEGRATED_RATCHET_NOTE_BLADE_ZH,
  parseComboSlots,
  pruneSlots,
  type BuilderStructure,
  type SlotDef,
} from '../../domain/compatibility.ts'
import type { ComboSlots, Part } from '../../domain/types.ts'
import { navigate, useRoute } from '../router.tsx'
import {
  Badge,
  ConfidenceBadge,
  EstimateBadge,
  NoticeCard,
  PageHeader,
  Row,
  ScoreBar,
  Section,
} from '../components/ui.tsx'
import { PartPickerField } from '../components/PartPicker.tsx'

type BuilderMode = 'owned' | 'catalog' | 'hypothetical'
type Structure = BuilderStructure

const MODE_LABEL: Record<BuilderMode, string> = {
  owned: '只顯示我有的',
  catalog: '顯示全部圖鑑',
  hypothetical: '假想購買',
}

export function BuilderPage({ initialComboId }: { initialComboId?: string }) {
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)
  const tournamentEvents = useAppStore((state) => state.tournamentEvents)
  const tournamentDecks = useAppStore((state) => state.tournamentDecks)
  const tournamentObservations = useAppStore((state) => state.tournamentObservations)
  const availability = useAppStore((state) => state.availability)
  const images = useAppStore((state) => state.images)
  const run = useAppStore((state) => state.run)

  const [mode, setMode] = useState<BuilderMode>('owned')
  const [structure, setStructure] = useState<Structure>('standard')
  const [slots, setSlots] = useState<ComboSlots>({})
  const [name, setName] = useState('')
  const [physicallyBuilt, setPhysicallyBuilt] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [pruneNotice, setPruneNotice] = useState<string | null>(null)
  const route = useRoute()

  /**
   * 每一條改 slots 的路徑都從這裡走，避免畫面短暫顯示不適用的固鎖。
   * hypothetical 保留目前已選零件，其他模式則只允許可用庫存。
   */
  const commitSlots = (
    nextSlots: ComboSlots,
    nextMode: BuilderMode = mode,
    nextStructure: Structure = structure,
  ) => {
    const selectableIds = nextMode === 'catalog'
      ? undefined
      : new Set(
          parts
            .filter((part) => {
              const free = availability.get(part.id)?.free ?? 0
              return free > 0 || (nextMode === 'hypothetical' && Object.values(nextSlots).includes(part.id))
            })
            .map((part) => part.id),
        )
    const result = pruneSlots({ slots: nextSlots, parts, structure: nextStructure, selectableIds })
    setSlots(result.slots)
    setPruneNotice(result.removedKeys.length > 0 ? `已移除不適用的${result.removedKeys.length} 個零件選擇。` : null)
  }

  // 第 36 節：分享連結只帶配裝內容，不含任何個人庫存。
  const sharedParam = route.query.c
  useEffect(() => {
    if (!sharedParam || parts.length === 0) return
    try {
      const parsed = parseComboSlots(JSON.parse(decodeURIComponent(sharedParam)))
      if (!parsed) return
      const inferred = inferBuilderStructure(parsed, parts)
      setStructure(inferred)
      setMode('catalog')
      commitSlots(parsed, 'catalog', inferred)
    } catch {
      // 連結損壞就忽略，不要讓頁面壞掉。
    }
  }, [sharedParam, parts])

  useEffect(() => {
    if (!initialComboId || parts.length === 0) return
    const combo = combos.find((row) => row.id === initialComboId)
    if (!combo) return
    setName(combo.nameZhTW)
    setPhysicallyBuilt(combo.physicallyBuilt)
    setFavorite(combo.favorite)
    setEditingId(combo.id)
    const inferred = inferBuilderStructure(combo.slots, parts)
    setStructure(inferred)
    setMode('catalog')
    commitSlots(combo.slots, 'catalog', inferred)
  }, [initialComboId, combos, parts])

  /*
   * 槽位表要由使用者選的結構決定，不能只看 slots 推導：
   * 剛切到 CX 時 slots 還是空的，deriveSystem 會推成 BX，CX 欄位就永遠不出現。
   */
  const schema = useMemo(
    () => getBuilderSlotSchema(structure, slots, parts),
    [structure, slots, parts],
  )

  const selectable = useMemo(() => {
    if (mode === 'catalog') return parts
    return parts.filter((part) => {
      const free = availability.get(part.id)?.free ?? 0
      return free > 0 || (mode === 'hypothetical' && Object.values(slots).includes(part.id))
    })
  }, [parts, mode, availability, slots])

  const evidenceReport = useMemo(
    () => getTournamentEvidenceReport({ slots, parts, events: tournamentEvents, decks: tournamentDecks }),
    [slots, parts, tournamentEvents, tournamentDecks],
  )
  const analysis = useMemo(
    () => analyzeCombo({ slots, parts, rules, lots, combos, evidence: evidenceReport.exact }),
    [slots, parts, rules, lots, combos, evidenceReport.exact],
  )
  const expertTierMatches = useMemo(() => getExpertTierMatches(slots), [slots])
  const expertPartRatings = useMemo(() => getExpertPartRatings(slots), [slots])
  // 證據理由：把高手評級與賽事觀測翻成一句一句可回查的話。
  // 刻意不餵進六軸，模型歸模型、證據歸證據（第 20 節 D）。
  const evidenceReasons = useMemo(
    () =>
      buildEvidenceReasons({
        slots,
        parts,
        ratings: expertPartRatings,
        observations: tournamentObservations,
        events: tournamentEvents,
      }),
    [slots, parts, expertPartRatings, tournamentObservations, tournamentEvents],
  )
  const observedMatches = useMemo(
    () => getObservedComboMatches({ slots, events: tournamentEvents, observations: tournamentObservations }),
    [slots, tournamentEvents, tournamentObservations],
  )

  // 還沒選任何零件時不要先跳紅字，等使用者動作後再提示（第 46 節：新手友善）。
  const hasAnySelection = Object.values(slots).some(Boolean)
  const canSave = analysis.compatibility.ok && name.trim().length > 0

  return (
    <>
      <PageHeader title="配裝器" description="順序是上蓋 → 固鎖 → 軸心；CX 會顯示對應欄位。" />

      <div className="work-split">
      <div className="stack">
      <Section title="模式">
        <div className="chip-row">
          {(Object.keys(MODE_LABEL) as BuilderMode[]).map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? 'btn btn-primary' : 'btn'}
              onClick={() => {
                setMode(item)
                commitSlots(slots, item)
              }}
            >
              {MODE_LABEL[item]}
            </button>
          ))}
        </div>
        {mode === 'hypothetical' ? (
          <div className="meta" style={{ marginTop: 6 }}>
            假想購買：可以選還沒有的零件，結果會標示庫存不足。
          </div>
        ) : null}
      </Section>

      <Section title="結構">
        <div className="chip-row">
          <button
            type="button"
            className={structure === 'standard' ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setStructure('standard')
              setSlots({})
            }}
          >
            三件式（BX／UX）
          </button>
          <button
            type="button"
            className={structure === 'cx' ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setStructure('cx')
              setSlots({})
            }}
          >
            CX 模組化
          </button>
        </div>
      </Section>

      <Section title="選擇零件">
        <div className="stack">
          {schema.map((def) => (
            <PartPickerField
              key={def.key}
              def={def}
              options={selectable.filter((part) => def.families.includes(part.family))}
              selectedPart={parts.find((part) => part.id === slots[def.key])}
              availability={availability}
              images={images}
              noteZhTW={noteForPart(def, parts.find((part) => part.id === slots[def.key]))}
              disabledReasonZhTW={lockedSlotReason(def.key, slots, parts)}
              onChange={(next) => commitSlots({ ...slots, [def.key]: next || undefined })}
            />
          ))}
        </div>
      </Section>

      {pruneNotice ? <NoticeCard tone="warn">{pruneNotice}</NoticeCard> : null}

      {analysis.compatibility.ok || !hasAnySelection ? null : (
        <NoticeCard tone="danger" testId="compat-error">
          <strong>{analysis.compatibility.headlineZhTW}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {analysis.compatibility.errors.map((error, index) => (
              <li key={`${error.messageZhTW}-${index}`}>
                {error.messageZhTW}
                {error.sourceUrls && error.sourceUrls.length > 0 ? (
                  <>
                    {' '}
                    <a href={error.sourceUrls[0]} target="_blank" rel="noreferrer">
                      來源
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </NoticeCard>
      )}

      {!analysis.compatibility.ok && !hasAnySelection ? (
        <NoticeCard tone="accent">
          從上蓋開始選，三個欄位都選好就會顯示完整分析。
        </NoticeCard>
      ) : null}

      {analysis.compatibility.warnings.length > 0 ? (
        <NoticeCard tone="warn">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {analysis.compatibility.warnings.map((warning) => (
              <li key={warning.messageZhTW}>{warning.messageZhTW}</li>
            ))}
          </ul>
        </NoticeCard>
      ) : null}

      </div>

      <div className="work-result">
      <ComboResult
        analysis={analysis}
        evidenceReport={evidenceReport}
        expertTierMatches={expertTierMatches}
        expertPartRatings={expertPartRatings}
        evidenceReasons={evidenceReasons}
        hasAnySelection={hasAnySelection}
        observedMatches={observedMatches}
      />

      <Section title="儲存這套配裝">
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <input
            className="field"
            placeholder="配裝名稱"
            aria-label="配裝名稱"
            data-testid="combo-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Row>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                data-testid="physically-built"
                checked={physicallyBuilt}
                onChange={(event) => setPhysicallyBuilt(event.target.checked)}
              />
              已實際組裝（會占用庫存）
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={favorite}
                onChange={(event) => setFavorite(event.target.checked)}
              />
              收藏
            </label>
          </Row>
          <Row>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="save-combo"
              disabled={!canSave}
              onClick={async () => {
                const payload = {
                  nameZhTW: name.trim(),
                  system: analysis.system,
                  slots,
                  favorite,
                  physicallyBuilt,
                }
                const ok = editingId
                  ? await run(() => repo.updateCombo(editingId, payload))
                  : await run(() => repo.saveCombo(payload))
                if (ok) navigate('/')
              }}
            >
              {editingId ? '更新配裝' : '儲存配裝'}
            </button>
            {editingId ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const ok = await run(() => repo.deleteCombo(editingId))
                  if (ok) navigate('/')
                }}
              >
                刪除
              </button>
            ) : null}
          </Row>
          {analysis.compatibility.ok ? null : (
            <div style={{ fontSize: 13, color: 'var(--danger)' }}>
              無法實際安裝的配置不能儲存。
            </div>
          )}
        </div>
      </Section>

      <Section title="分享">
        <div className="card stack">
          <div className="meta">只分享這套配裝，不會包含你的庫存。</div>
          <Row>
            <button
              type="button"
              className="btn"
              disabled={!analysis.compatibility.ok}
              onClick={async () => {
                const text = `${analysis.fullNameZhTW}（${analysis.objective.structureZhTW}）`
                const ok = await copyText(text)
                setShareMessage(ok ? '已複製配裝文字' : '複製失敗，請手動選取')
              }}
            >
              複製文字
            </button>
            <button
              type="button"
              className="btn"
              disabled={!analysis.compatibility.ok}
              onClick={async () => {
                const url = buildShareUrl(slots)
                const ok = await shareUrl(url, analysis.fullNameZhTW)
                setShareMessage(ok ? '已複製或開啟分享連結' : '分享失敗，請手動複製網址')
              }}
            >
              分享連結
            </button>
          </Row>
          {shareMessage ? <div className="meta">{shareMessage}</div> : null}
        </div>
      </Section>
      </div>
      </div>
    </>
  )
}

function noteForPart(def: SlotDef, part: Part | undefined): string | undefined {
  if (!hasIntegratedRatchet(part)) return undefined
  return def.key === 'bitId' ? INTEGRATED_RATCHET_NOTE_BIT_ZH : INTEGRATED_RATCHET_NOTE_BLADE_ZH
}

export function ComboResult({
  analysis,
  evidenceReport,
  expertTierMatches,
  expertPartRatings,
  evidenceReasons,
  hasAnySelection,
  observedMatches,
}: {
  analysis: ReturnType<typeof analyzeCombo>
  evidenceReport: ReturnType<typeof getTournamentEvidenceReport>
  expertTierMatches: ReturnType<typeof getExpertTierMatches>
  expertPartRatings: ReturnType<typeof getExpertPartRatings>
  evidenceReasons: ReturnType<typeof buildEvidenceReasons>
  hasAnySelection: boolean
  observedMatches: ReturnType<typeof getObservedComboMatches>
}) {
  return (
    <Section title="配裝結果">
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {analysis.fullNameZhTW || '尚未選完零件'}
          </div>
          {/*
            不顯示 fullCode：它由官方日文上蓋代號組成，前台不得以日文為名稱（第 1.4 節）。
            日文原名可在零件詳情頁的次要名稱看到（第 5 節）。
          */}
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {analysis.objective.structureZhTW}
          </div>
        </div>

        <Row>
          <Badge tone="accent">類型 {analysis.typeZhTW}</Badge>
          <Badge>{analysis.objective.structureZhTW}</Badge>
          <Badge>旋向 {analysis.objective.spinDirectionZhTW ?? '資料不足'}</Badge>
          <Badge>
            高度 {analysis.objective.heightCode ?? '資料不足'}
          </Badge>
          <Badge>
            總重 {analysis.objective.totalWeightG ? `${analysis.objective.totalWeightG} g` : '資料不足'}
          </Badge>
          <ConfidenceBadge confidence={analysis.confidence} />
        </Row>

        <div>
          <Row>
            <strong style={{ fontSize: 14 }}>六軸評估</strong>
            <EstimateBadge />
          </Row>
          <div style={{ height: 6 }} />
          <ScoreBar label="攻擊" value={analysis.scores?.attack} />
          <ScoreBar label="防守" value={analysis.scores?.defense} />
          <ScoreBar label="持久" value={analysis.scores?.stamina} />
          <ScoreBar label="爆發" value={analysis.scores?.burst} />
          <ScoreBar label="抗爆" value={analysis.scores?.burstResistance} />
          <ScoreBar label="穩定" value={analysis.scores?.stability} />
          <ScoreBar label="操作難度" value={analysis.operationDifficulty} />
          {analysis.scores ? null : (
            <div style={{ fontSize: 13, color: 'var(--warn)' }}>
              官方尚未公布這些零件的類型與重量，因此不給推估分數，避免誤導。
            </div>
          )}
        </div>

        <div style={{ fontSize: 14 }}>
          <strong>建議發射方式：</strong>
          {analysis.launchSuggestionZhTW}
        </div>

        {analysis.synergyNotesZhTW.length > 0 ? (
          <div>
            <Row>
              <strong style={{ fontSize: 14 }}>配裝協同性</strong>
              <EstimateBadge />
            </Row>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14 }}>
              {analysis.synergyNotesZhTW.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/*
          證據優先於模型：先講「賽場上真的有人這樣打」「幾位高手評幾級」，
          再講模型推估的優缺點。兩段刻意分開，不合併成一個分數（第 20 節 D）。
        */}
        {hasAnySelection ? (
          <div style={{ fontSize: 13 }} data-testid="evidence-reasons">
            <strong>為什麼這樣配：</strong>
            {evidenceReasons.length === 0 ? (
              <div className="meta" style={{ marginTop: 4 }}>{NO_EVIDENCE_NOTE_ZH}</div>
            ) : (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 5 }}>
                {evidenceReasons.map((reason) => (
                  <li key={`${reason.kind}-${reason.textZhTW}`}>
                    <Badge tone={reason.kind === 'tournament' ? 'accent' : 'warn'}>
                      {reason.kind === 'tournament' ? '賽事' : '高手'}
                    </Badge>{' '}
                    {reason.textZhTW}
                    {reason.sourceUrl ? (
                      <>
                        {' '}
                        <a href={reason.sourceUrl} target="_blank" rel="noreferrer">
                          來源
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {analysis.prosZhTW.length > 0 || analysis.consZhTW.length > 0 ? (
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            {analysis.prosZhTW.length > 0 ? (
              <div>
                <strong style={{ color: 'var(--ok)' }}>優點（模型推估）：</strong>
                {analysis.prosZhTW.join('；')}
              </div>
            ) : null}
            {analysis.consZhTW.length > 0 ? (
              <div>
                <strong style={{ color: 'var(--danger)' }}>缺點（模型推估）：</strong>
                {analysis.consZhTW.join('；')}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ fontSize: 14 }}>
          <strong>庫存：</strong>
          {analysis.stock.sufficient ? (
            <span style={{ color: 'var(--ok)' }}>可用零件足夠</span>
          ) : (
            <span style={{ color: 'var(--danger)' }}>
              庫存不足（缺 {analysis.stock.missingPartIds.length} 種零件）
            </span>
          )}
        </div>

        {analysis.objective.statsNoticeZhTW ? (
          <div style={{ fontSize: 13, color: 'var(--warn)' }}>
            {analysis.objective.statsNoticeZhTW}
            {analysis.objective.statsSourceUrls?.[0] ? (
              <>
                {' '}
                <a href={analysis.objective.statsSourceUrls[0]} target="_blank" rel="noreferrer">
                  來源
                </a>
              </>
            ) : null}
          </div>
        ) : null}

        {analysis.dataCompleteness.missingFieldsZhTW.length > 0 ? (
          <div style={{ fontSize: 13, color: 'var(--warn)' }}>
            缺少官方資料：{analysis.dataCompleteness.missingFieldsZhTW.join('、')}
          </div>
        ) : null}

        <div style={{ fontSize: 13, color: 'var(--warn)' }}>
          {analysis.evidence ? (
            <>
              完全相符：賽事出場 {analysis.evidence.appearances}/{analysis.evidence.totalDecks} 副完整牌組（Top 4：
              {analysis.evidence.top4}；冠軍：{analysis.evidence.championships}；社群彙整資料）。
            </>
          ) : (
            analysis.evidenceNoticeZhTW
          )}
          {evidenceReport.partial.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              <strong>部分相符：</strong>以下是零件曾出現的配置，不是同一套配裝的成績。
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {evidenceReport.partial.map((match) => (
                  <li key={match.kind}>
                    {match.labelZhTW} {match.appearances}/{match.totalComboSlots} 顆配置（Top 4：{match.top4}；冠軍：{match.championships}；社群彙整）
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {expertPartRatings.length > 0 ? (
          <div style={{ fontSize: 13 }} data-testid="expert-part-ratings">
            <strong>高手零件評級：</strong>
            <div className="chip-row" style={{ marginTop: 4 }}>
              {expertPartRatings.map((rating) => (
                <span key={`${rating.partId}-${rating.tierLabel}`}>
                  <Badge tone="accent">{rating.tierLabel}</Badge> {rating.labelZhTW}
                  <span className="meta">
                    （{rating.agreeCount}/{rating.expertCount} 位高手）
                  </span>
                </span>
              ))}
            </div>
            <div className="meta">
              {expertPartRatingMeta.noteZhTW}{' '}
              <a href={expertPartRatingMeta.sourceUrl} target="_blank" rel="noreferrer">
                來源
              </a>
            </div>
          </div>
        ) : null}

        {expertTierMatches.length > 0 ? (
          <div style={{ fontSize: 13 }}>
            <strong>專家評級：</strong>
            {expertTierMatches.map((match) => (
              <div key={`${match.listTitleZhTW}-${match.tierLabel}`} style={{ marginTop: 4 }}>
                <Badge tone="accent">{match.tierLabel}</Badge>{' '}
                {match.listTitleZhTW}（{match.authorZhTW}，{match.updatedAt}）{' '}
                <a href={match.sourceUrl} target="_blank" rel="noreferrer">來源</a>
                <div className="meta">{match.noteZhTW}</div>
              </div>
            ))}
          </div>
        ) : null}

        {observedMatches.length > 0 ? (
          <div style={{ fontSize: 13 }} data-testid="observed-combo-matches">
            <strong>來源觀測：</strong>這些已映射的單顆配置來自一副尚未完整映射的牌組，
            不計入出場率、Meta share 或可信度。
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {observedMatches.map((match) => (
                <li key={match.id}>
                  <a href={match.sourceUrl} target="_blank" rel="noreferrer">
                    {match.eventName}
                  </a>
                  （第 {match.placement ?? '未標示'} 名・{match.eventDate}）
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  )
}

export function buildShareUrl(slots: ComboSlots): string {
  const payload = encodeURIComponent(JSON.stringify(slots))
  return `${window.location.origin}${window.location.pathname}#/builder?c=${payload}`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function shareUrl(url: string, title: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url })
      return true
    } catch {
      return copyText(url)
    }
  }
  return copyText(url)
}
