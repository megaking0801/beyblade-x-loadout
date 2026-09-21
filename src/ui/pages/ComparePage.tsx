import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import { analyzeCombo } from '../../domain/analysis.ts'
import { buildPracticalComparison, type PracticalComparison } from '../../domain/practice.ts'
import { generateBuildableCombos, type BuilderMode } from '../../domain/builder.ts'
import { getBuilderSlotSchema, inferBuilderStructure, lockedSlotReason, parseComboSlots, pruneSlots, type BuilderStructure } from '../../domain/compatibility.ts'
import type { ComboSlots, ImageAsset, Part } from '../../domain/types.ts'
import { useRoute } from '../router.tsx'
import { EmptyState, NoticeCard, PageHeader, Section } from '../components/ui.tsx'
import { PartPickerField } from '../components/PartPicker.tsx'

const MODE_LABEL: Record<BuilderMode, string> = { owned: '我的零件', catalog: '全部圖鑑', hypothetical: '假想零件' }
interface BuildState { mode: BuilderMode; structure: BuilderStructure; slots: ComboSlots; selectedKey: string; pruneNotice: string | null }
const EMPTY_BUILD: BuildState = { mode: 'catalog', structure: 'standard', slots: {}, selectedKey: '', pruneNotice: null }

function isBuilderMode(value: string | undefined): value is BuilderMode { return value === 'owned' || value === 'catalog' || value === 'hypothetical' }
function isStructure(value: string | undefined): value is BuilderStructure { return value === 'standard' || value === 'cx' }

export function ComparePage() {
  const route = useRoute()
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)
  const availability = useAppStore((state) => state.availability)
  const images = useAppStore((state) => state.images)
  const tournamentEvents = useAppStore((state) => state.tournamentEvents)
  const tournamentObservations = useAppStore((state) => state.tournamentObservations)
  const [aBuild, setABuild] = useState<BuildState>(EMPTY_BUILD)
  const [bBuild, setBBuild] = useState<BuildState>(EMPTY_BUILD)

  const options = useMemo(() => {
    const saved = combos.map((combo) => ({ key: `saved:${combo.id}`, label: `${combo.nameZhTW}（已儲存）`, slots: combo.slots }))
    const buildable = generateBuildableCombos({ parts, rules, lots, combos, mode: 'owned', sortBy: 'beginner', limit: 30 })
      .map((row) => ({ key: `buildable:${row.analysis.fullCode}`, label: row.analysis.fullNameZhTW, slots: row.slots }))
    return [...saved, ...buildable]
  }, [combos, lots, parts, rules])

  // 從配裝頁帶來的內容只預填 A；之後 A、B 都是可獨立編輯的配裝器。
  useEffect(() => {
    if (!route.query.a || parts.length === 0) return
    try {
      const slots = parseComboSlots(JSON.parse(route.query.a))
      if (!slots) return
      setABuild({
        mode: isBuilderMode(route.query.mode) ? route.query.mode : 'catalog',
        structure: isStructure(route.query.structure) ? route.query.structure : inferBuilderStructure(slots, parts),
        slots,
        selectedKey: '',
        pruneNotice: null,
      })
    } catch {
      // Ignore a malformed hand-off query and leave A editable.
    }
  }, [parts, route.query.a, route.query.mode, route.query.structure])

  const normalize = (current: BuildState, changes: Partial<BuildState>): BuildState => {
    const next = { ...current, ...changes }
    const selectableIds = next.mode === 'catalog' ? undefined : new Set(parts.filter((part) => {
      const free = availability.get(part.id)?.free ?? 0
      return free > 0 || (next.mode === 'hypothetical' && Object.values(next.slots).includes(part.id))
    }).map((part) => part.id))
    const result = pruneSlots({ slots: next.slots, parts, structure: next.structure, selectableIds })
    return {
      ...next,
      slots: result.slots,
      pruneNotice: result.removedKeys.length > 0 ? `已移除 ${result.removedKeys.length} 個不適用的零件欄位。` : changes.pruneNotice ?? null,
    }
  }
  const updateBuild = (side: 'a' | 'b', changes: Partial<BuildState>) => {
    const setter = side === 'a' ? setABuild : setBBuild
    setter((current) => normalize(current, changes))
  }

  const aAnalysis = useMemo(() => analyzeCombo({ slots: aBuild.slots, parts, rules, lots, combos }), [aBuild.slots, combos, lots, parts, rules])
  const bAnalysis = useMemo(() => analyzeCombo({ slots: bBuild.slots, parts, rules, lots, combos }), [bBuild.slots, combos, lots, parts, rules])
  const aComplete = aAnalysis.compatibility.ok
  const bComplete = bAnalysis.compatibility.ok
  const practical = useMemo(
    () => aComplete && bComplete ? buildPracticalComparison({
      a: aBuild.slots,
      b: bBuild.slots,
      parts,
      tournamentEvents,
      tournamentObservations,
    }) : null,
    [aBuild.slots, aComplete, bBuild.slots, bComplete, parts, tournamentEvents, tournamentObservations],
  )

  return <>
    <PageHeader title="陀螺比較" description="A、B 各自選擇來源、結構與零件；調整任何一邊後，結果會立即更新。" />
    <div className="compare-builders">
      <BuildEditor side="a" title="陀螺 A" build={aBuild} options={options} parts={parts} availability={availability} images={images} onUpdate={(changes) => updateBuild('a', changes)} />
      <BuildEditor side="b" title="陀螺 B" build={bBuild} options={options} parts={parts} availability={availability} images={images} onUpdate={(changes) => updateBuild('b', changes)} />
    </div>
    <div className="compare-results">
      {!aComplete || !bComplete ? <EmptyState title="還沒選滿兩套可用配裝" hint="請分別完成 A 與 B 的零件選擇，並確認相容性後再比較。" />
        : practical ? <Section title="比較結果"><ComparisonResult practical={practical} /></Section> : null}
    </div>
  </>
}

function BuildEditor({ side, title, build, options, parts, availability, images, onUpdate }: {
  side: 'a' | 'b'
  title: string
  build: BuildState
  options: { key: string; label: string; slots: ComboSlots }[]
  parts: Part[]
  availability: ReadonlyMap<string, { free: number }>
  images: ImageAsset[]
  onUpdate: (changes: Partial<BuildState>) => void
}) {
  const schema = useMemo(() => getBuilderSlotSchema(build.structure, build.slots, parts), [build.slots, build.structure, parts])
  const selectable = useMemo(() => build.mode === 'catalog' ? parts : parts.filter((part) => {
    const free = availability.get(part.id)?.free ?? 0
    return free > 0 || (build.mode === 'hypothetical' && Object.values(build.slots).includes(part.id))
  }), [availability, build.mode, build.slots, parts])
  const selectCombo = (key: string) => {
    const selected = options.find((option) => option.key === key)
    if (!selected) return onUpdate({ selectedKey: '', slots: {}, pruneNotice: null })
    onUpdate({ selectedKey: key, slots: selected.slots, structure: inferBuilderStructure(selected.slots, parts), pruneNotice: null })
  }
  return <Section title={title}><div className="card stack">
    <ComboSelect label={`配裝 ${side.toUpperCase()}`} value={build.selectedKey} options={options} onChange={selectCombo} />
    <p className="meta" style={{ margin: 0 }}>可先載入配裝，再直接微調每個零件。</p>
    <div><div className="meta" style={{ marginBottom: 4 }}>零件來源</div><div className="chip-row">{(Object.keys(MODE_LABEL) as BuilderMode[]).map((mode) => <button key={mode} type="button" className={build.mode === mode ? 'btn btn-primary' : 'btn'} onClick={() => onUpdate({ mode })}>{MODE_LABEL[mode]}</button>)}</div></div>
    <div><div className="meta" style={{ marginBottom: 4 }}>結構</div><div className="chip-row">
      <button type="button" className={build.structure === 'standard' ? 'btn btn-primary' : 'btn'} onClick={() => onUpdate({ structure: 'standard', slots: {}, selectedKey: '' })}>標準（BX／UX）</button>
      <button type="button" className={build.structure === 'cx' ? 'btn btn-primary' : 'btn'} onClick={() => onUpdate({ structure: 'cx', slots: {}, selectedKey: '' })}>CX 組裝式</button>
    </div></div>
    {schema.map((def) => <PartPickerField key={def.key} idPrefix={side} def={def} options={selectable.filter((part) => def.families.includes(part.family))} selectedPart={parts.find((part) => part.id === build.slots[def.key])} availability={availability} images={images} disabledReasonZhTW={lockedSlotReason(def.key, build.slots, parts)} onChange={(partId) => onUpdate({ selectedKey: '', slots: { ...build.slots, [def.key]: partId || undefined } })} />)}
    <button type="button" className="btn" disabled={!Object.values(build.slots).some(Boolean)} onClick={() => onUpdate({ slots: {}, selectedKey: '', pruneNotice: null })}>清除 {title}</button>
    {build.pruneNotice ? <NoticeCard tone="warn">{build.pruneNotice}</NoticeCard> : null}
  </div></Section>
}

function ComparisonResult({ practical }: { practical: PracticalComparison }) {
  return <div className="stack">
    <Section title="預測狀態"><div className="card stack" data-testid="matchup-prediction">
      <strong style={{ fontSize: 18 }}>{practical.titleZhTW}</strong>
      <div>{practical.noticeZhTW}</div>
      <div className="meta">舊六軸百分比與人工逐局資料已停用。只有通過自動抽取驗證、跨來源評估與校準檢查的模型，未來才會在這裡提供預測。</div>
    </div></Section>
    <Section title="賽場上位配置（不是 A 對 B 戰績）"><div className="card stack" data-testid="tournament-practice-evidence">
      <TournamentEvidence title="A" evidence={practical.tournamentA} />
      <TournamentEvidence title="B" evidence={practical.tournamentB} />
      <div className="meta">這裡只列前四名選手實際交出的配置。相同上蓋但固鎖／軸心不同時列為替代，不會換算成目前配裝的勝率。</div>
    </div></Section>
  </div>
}

function TournamentEvidence({ title, evidence }: { title: string; evidence: PracticalComparison['tournamentA'] }) {
  return <div className="stack" style={{ gap: 8 }}>
    <strong>{title} 的賽場紀錄</strong>
    {evidence.exact.length > 0 ? <div className="stack" style={{ gap: 6 }}>
      <div className="meta">完整配置相同（可作為此配裝的賽場紀錄）</div>
      {evidence.exact.map((row) => <TournamentRecord key={row.id} row={row} />)}
    </div> : <div className="meta">目前沒有相同完整配置的前四名紀錄。</div>}
    {evidence.sameBladeAlternatives.length > 0 ? <div className="stack" style={{ gap: 6 }}>
      <div className="meta">同上蓋的上位替代（固鎖或軸心已不同）</div>
      {evidence.sameBladeAlternatives.map((row) => <TournamentRecord key={row.id} row={row} />)}
    </div> : <div className="meta">目前沒有同上蓋的可回查上位替代。</div>}
  </div>
}

function TournamentRecord({ row }: { row: PracticalComparison['tournamentA']['exact'][number] }) {
  const placement = row.placement === 1 ? '冠軍' : row.placement === 2 ? '亞軍' : row.placement === 3 ? '季軍' : row.placement === 4 ? '殿軍' : '上位'
  return <div className="stack" style={{ gap: 2 }}>
    <a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.reportedCombo}・{placement}</a>
    <div className="meta">{row.eventNameZhTW}・{row.eventDate}{row.participantCount ? `・${row.participantCount} 人` : ''}</div>
  </div>
}

function ComboSelect({ label, value, options, onChange }: { label: string; value: string; options: { key: string; label: string }[]; onChange: (next: string) => void }) {
  return <label className="stack" style={{ gap: 4 }}><span className="meta">{label}</span><select className="field" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">選擇配裝</option>{options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
}
