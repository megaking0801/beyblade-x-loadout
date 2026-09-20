import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import { analyzeCombo } from '../../domain/analysis.ts'
import { compareCombos, predictMatchup, type MatchupPrediction } from '../../domain/compare.ts'
import { buildPracticalComparison, type PracticalComparison } from '../../domain/practice.ts'
import { generateBuildableCombos, type BuilderMode } from '../../domain/builder.ts'
import { getBuilderSlotSchema, inferBuilderStructure, lockedSlotReason, parseComboSlots, pruneSlots, type BuilderStructure } from '../../domain/compatibility.ts'
import type { ComboSlots, ImageAsset, Part } from '../../domain/types.ts'
import { useRoute } from '../router.tsx'
import { EmptyState, EstimateBadge, NoticeCard, PageHeader, Section } from '../components/ui.tsx'
import { PartPickerField } from '../components/PartPicker.tsx'

const MODE_LABEL: Record<BuilderMode, string> = { owned: '我的零件', catalog: '全部圖鑑', hypothetical: '假想零件' }
const AXIS_COLOR: Record<string, string> = { 攻擊: 'var(--type-attack)', 防守: 'var(--type-defense)', 防禦: 'var(--type-defense)', 持久: 'var(--type-stamina)', 爆發: 'var(--type-attack)', 抗爆: 'var(--type-defense)', 穩定: 'var(--type-balance)', 操作難度: 'var(--type-balance)' }

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
  const comparison = useMemo(() => aComplete && bComplete ? compareCombos({ a: { slots: aBuild.slots, analysis: aAnalysis }, b: { slots: bBuild.slots, analysis: bAnalysis }, parts }) : null, [aAnalysis, aBuild.slots, aComplete, bAnalysis, bBuild.slots, bComplete, parts])
  const prediction = useMemo(() => aComplete && bComplete ? predictMatchup(aAnalysis, bAnalysis) : null, [aAnalysis, aComplete, bAnalysis, bComplete])
  const practical = useMemo(
    () => aComplete && bComplete ? buildPracticalComparison({ a: aBuild.slots, b: bBuild.slots, parts }) : null,
    [aBuild.slots, aComplete, bBuild.slots, bComplete, parts],
  )

  return <>
    <PageHeader title="陀螺比較" description="A、B 各自選擇來源、結構與零件；調整任何一邊後，結果會立即更新。" />
    <div className="compare-builders">
      <BuildEditor side="a" title="陀螺 A" build={aBuild} options={options} parts={parts} availability={availability} images={images} onUpdate={(changes) => updateBuild('a', changes)} />
      <BuildEditor side="b" title="陀螺 B" build={bBuild} options={options} parts={parts} availability={availability} images={images} onUpdate={(changes) => updateBuild('b', changes)} />
    </div>
    <div className="compare-results">
      {!aComplete || !bComplete ? <EmptyState title="還沒選滿兩套可用配裝" hint="請分別完成 A 與 B 的零件選擇，並確認相容性後再比較。" />
        : comparison && prediction && practical ? <Section title="比較結果"><ComparisonResult comparison={comparison} prediction={prediction} practical={practical} /></Section> : null}
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

function ComparisonResult({ comparison, prediction, practical }: { comparison: NonNullable<ReturnType<typeof compareCombos>>; prediction: MatchupPrediction; practical: PracticalComparison }) {
  const outcome = prediction.outcome === 'a_advantage' ? 'A 較有利' : prediction.outcome === 'b_advantage' ? 'B 較有利' : prediction.outcome === 'even' ? '勝負難分' : '資料不足'
  return <div className="stack">
    <Section title="實戰證據結論"><div className="card stack" data-testid="practical-matchup">
      <strong style={{ fontSize: 18 }}>{practical.titleZhTW}</strong>
      <div>{practical.noticeZhTW}</div>
      {practical.status === 'observed' ? <div><span className="code">A {practical.observedAWins} 勝</span>　vs　<span className="code">B {practical.observedBWins} 勝</span></div> : null}
      <div className="meta">只有可辨識雙方完整配置、盤型／賽制與勝負的逐局影片，才會顯示為實戰 W–L；目前來源不會被冒充為勝率。</div>
    </div></Section>
    <Section title="高度互動時間線"><div className="card stack" data-testid="height-timeline">
      <div><strong>開局接觸：</strong>{practical.heightTimelineZhTW.opening}</div>
      <div><strong>對局中段：</strong>{practical.heightTimelineZhTW.midgame}</div>
      <div><strong>低轉速／後期：</strong>{practical.heightTimelineZhTW.endgame}</div>
    </div></Section>
    <Section title="全零件實戰檔案"><div className="card stack" data-testid="part-practice-profiles">
      <PracticeProfiles title="A" profiles={practical.profilesA} />
      <PracticeProfiles title="B" profiles={practical.profilesB} />
    </div></Section>
    <Section title="社群與影片來源"><div className="card stack" data-testid="practice-sources">
      {practical.sources.map((source) => <details key={source.id}><summary>{source.nameZhTW}・{source.kindZhTW}・{source.independence === 'primary' ? '原始來源' : '彙整來源'}</summary><div className="stack" style={{ marginTop: 8 }}><div>{source.noteZhTW}</div><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceUrl}</a><div className="meta">資料日期：{source.updatedAt}</div></div></details>)}
      {practical.expertEvidence.length > 0 ? <div className="meta">目前已選零件命中 {practical.expertEvidence.length} 筆高手 T 表來源；它們僅作社群觀察，不列為對局戰績。</div> : <div className="meta">已選零件尚未命中現有高手 T 表；不以其他零件的評級代替。</div>}
    </div></Section>
    <Section title="對打推估" action={<EstimateBadge />}><div className="card stack" data-testid="matchup-prediction">
      <strong style={{ fontSize: 18 }}>{outcome}</strong>
      {prediction.aModelProbability !== undefined ? <div><span className="code">A {prediction.aModelProbability}%</span>　vs　<span className="code">B {prediction.bModelProbability}%</span></div> : null}
      <div>{prediction.noticeZhTW}</div>
      {prediction.reasonsZhTW.length > 0 ? <ul style={{ margin: 0, paddingLeft: 18 }}>{prediction.reasonsZhTW.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
      <div className="meta">這是依零件特性建立的模型推估，不是實戰勝率保證。</div>
    </div></Section>
    <Section title="高度互動"><div className="card" data-testid="height-matchup">{comparison.heightMatchupZhTW}</div></Section>
    {comparison.changedSlots.length > 0 ? <Section title="零件差異"><div className="card stack">
      <div style={{ fontSize: 13, fontWeight: 700, color: comparison.changedSlots.length === 1 ? 'var(--ok)' : 'var(--ink-dim)' }}>{comparison.changedSlots.length === 1 ? '只有一個零件不同' : `共有 ${comparison.changedSlots.length} 個零件不同`}</div>
      {comparison.changedSlots.map((slot) => <div key={slot.slotZhTW} style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{slot.slotZhTW} <span className="code">{slot.fromZhTW}</span> → <span className="code">{slot.toZhTW}</span></div>)}
    </div></Section> : null}
    <Section title="六軸與高度比較" action={<EstimateBadge />}><div className="card stack"><p style={{ margin: 0 }}>{comparison.summaryZhTW}</p><div style={{ overflowX: 'auto' }}><table className="compare-table"><thead><tr><th>指標</th><th>A</th><th>B</th><th>差異</th></tr></thead><tbody>
      {comparison.rows.map((row) => {
        const axisColor = AXIS_COLOR[row.labelZhTW]
        const winStyle = axisColor ? ({ ['--win-color' as string]: axisColor } as CSSProperties) : undefined
        return <tr key={row.labelZhTW}><td>{row.labelZhTW}</td><td className={row.better === 'a' ? 'win' : undefined} style={row.better === 'a' ? winStyle : undefined}>{row.aValue}{row.better === 'a' ? ' ↑' : ''}</td><td className={row.better === 'b' ? 'win' : undefined} style={row.better === 'b' ? winStyle : undefined}>{row.bValue}{row.better === 'b' ? ' ↑' : ''}</td><td className="delta">{row.deltaZhTW}</td></tr>
      })}
    </tbody></table></div></div></Section>
  </div>
}

function PracticeProfiles({ title, profiles }: { title: string; profiles: PracticalComparison['profilesA'] }) {
  return <div className="stack" style={{ gap: 8 }}>
    <strong>{title} 的已選零件</strong>
    {profiles.map((profile) => <details key={profile.partId}>
      <summary>{profile.familyZhTW}・{profile.partNameZhTW}・{profile.status === 'covered' ? '有社群覆蓋' : '資料有限'}</summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <div>{profile.summaryZhTW}</div>
        {profile.expertRating ? <div className="meta">高手聚合評級：{profile.expertRating.tierLabel}（{profile.expertRating.agreeCount}/{profile.expertRating.expertCount} 位來源同意；不代表勝率）</div> : null}
        <ul style={{ margin: 0, paddingLeft: 18 }}>{profile.cautionsZhTW.map((caution) => <li key={caution}>{caution}</li>)}</ul>
        {profile.expertSources.map((source) => <a key={`${source.partId}-${source.sourceUrl}`} href={source.sourceUrl} target="_blank" rel="noreferrer">{source.authorZhTW}・{source.listTitleZhTW}・{source.tierLabel}</a>)}
        {profile.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">零件資料來源</a>)}
      </div>
    </details>)}
  </div>
}

function ComboSelect({ label, value, options, onChange }: { label: string; value: string; options: { key: string; label: string }[]; onChange: (next: string) => void }) {
  return <label className="stack" style={{ gap: 4 }}><span className="meta">{label}</span><select className="field" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">選擇配裝</option>{options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
}
