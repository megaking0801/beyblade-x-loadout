/** 配裝 A/B 比較與對戰模型。A 可由配裝器帶入；B 則在此頁直接組裝。 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import { analyzeCombo } from '../../domain/analysis.ts'
import { compareCombos, predictMatchup, type MatchupPrediction } from '../../domain/compare.ts'
import { generateBuildableCombos } from '../../domain/builder.ts'
import {
  getBuilderSlotSchema,
  inferBuilderStructure,
  lockedSlotReason,
  parseComboSlots,
  pruneSlots,
  type BuilderStructure,
} from '../../domain/compatibility.ts'
import type { ComboSlots } from '../../domain/types.ts'
import { useRoute } from '../router.tsx'
import { EmptyState, EstimateBadge, NoticeCard, PageHeader, Section } from '../components/ui.tsx'
import { PartPickerField } from '../components/PartPicker.tsx'

type BuilderMode = 'owned' | 'catalog' | 'hypothetical'

const MODE_LABEL: Record<BuilderMode, string> = {
  owned: '只顯示我有的',
  catalog: '顯示全部圖鑑',
  hypothetical: '假想購買',
}

const AXIS_COLOR: Record<string, string> = {
  攻擊: 'var(--type-attack)', 防守: 'var(--type-defense)', 持久: 'var(--type-stamina)',
  爆發: 'var(--type-attack)', 抗爆: 'var(--type-defense)', 穩定: 'var(--type-balance)', 操作難度: 'var(--type-balance)',
}

function isBuilderMode(value: string | undefined): value is BuilderMode {
  return value === 'owned' || value === 'catalog' || value === 'hypothetical'
}

function isStructure(value: string | undefined): value is BuilderStructure {
  return value === 'standard' || value === 'cx'
}

export function ComparePage() {
  const route = useRoute()
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)
  const availability = useAppStore((state) => state.availability)
  const images = useAppStore((state) => state.images)
  const options = useMemo(() => {
    const saved = combos.map((combo) => ({ key: `saved:${combo.id}`, label: `${combo.nameZhTW}（已儲存）`, slots: combo.slots }))
    const buildable = generateBuildableCombos({ parts, rules, lots, combos, mode: 'owned', sortBy: 'beginner', limit: 30 })
      .map((row) => ({ key: `buildable:${row.analysis.fullCode}`, label: row.analysis.fullNameZhTW, slots: row.slots }))
    return [...saved, ...buildable]
  }, [combos, parts, rules, lots])

  const [aKey, setAKey] = useState('')
  const [bKey, setBKey] = useState('')
  const [carriedA, setCarriedA] = useState<ComboSlots | null>(null)
  const [mode, setMode] = useState<BuilderMode>('catalog')
  const [structure, setStructure] = useState<BuilderStructure>('standard')
  const [bSlots, setBSlots] = useState<ComboSlots>({})
  const [pruneNotice, setPruneNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!route.query.a || parts.length === 0) return
    try {
      const parsed = parseComboSlots(JSON.parse(route.query.a))
      if (!parsed) return
      setCarriedA(parsed)
      setAKey('')
      setStructure(isStructure(route.query.structure) ? route.query.structure : inferBuilderStructure(parsed, parts))
      setMode(isBuilderMode(route.query.mode) ? route.query.mode : 'catalog')
      setBSlots({})
      setPruneNotice(null)
    } catch {
      setCarriedA(null)
    }
  }, [route.query.a, route.query.mode, route.query.structure, parts])

  const a = useMemo(() => carriedA
    ? { key: 'carried', label: '目前配裝（由配裝器帶入）', slots: carriedA }
    : options.find((option) => option.key === aKey), [aKey, carriedA, options])
  const schema = useMemo(() => getBuilderSlotSchema(structure, bSlots, parts), [structure, bSlots, parts])
  const selectable = useMemo(() => {
    if (mode === 'catalog') return parts
    return parts.filter((part) => {
      const free = availability.get(part.id)?.free ?? 0
      return free > 0 || (mode === 'hypothetical' && Object.values(bSlots).includes(part.id))
    })
  }, [availability, bSlots, mode, parts])
  const commitBSlots = (nextSlots: ComboSlots, nextMode = mode, nextStructure = structure) => {
    const selectableIds = nextMode === 'catalog' ? undefined : new Set(parts.filter((part) => {
      const free = availability.get(part.id)?.free ?? 0
      return free > 0 || (nextMode === 'hypothetical' && Object.values(nextSlots).includes(part.id))
    }).map((part) => part.id))
    const result = pruneSlots({ slots: nextSlots, parts, structure: nextStructure, selectableIds })
    setBSlots(result.slots)
    setPruneNotice(result.removedKeys.length > 0 ? `已移除不適用的 ${result.removedKeys.length} 個零件選擇。` : null)
  }
  const aAnalysis = useMemo(() => a ? analyzeCombo({ slots: a.slots, parts, rules, lots, combos }) : undefined, [a, combos, lots, parts, rules])
  const bAnalysis = useMemo(() => analyzeCombo({ slots: bSlots, parts, rules, lots, combos }), [bSlots, combos, lots, parts, rules])
  const comparison = useMemo(() => a && aAnalysis ? compareCombos({ a: { slots: a.slots, analysis: aAnalysis }, b: { slots: bSlots, analysis: bAnalysis }, parts }) : null, [a, aAnalysis, bAnalysis, bSlots, parts])
  const prediction = useMemo(() => aAnalysis ? predictMatchup(aAnalysis, bAnalysis) : null, [aAnalysis, bAnalysis])

  return <>
    <PageHeader title="配裝比較" description="把 A 帶進來後，直接配出 B；六軸、官方高度碼與對打模型會分開呈現。" />
    <div className="work-split">
      <div className="stack">
        <Section title="配裝 A"><div className="card stack">
          {carriedA ? <strong>{a?.label}</strong> : null}
          <ComboSelect label="配裝 A" value={aKey} options={options} onChange={(next) => { setCarriedA(null); setAKey(next) }} />
          {!a ? <div className="meta">先從配裝器帶入一套，或在此選擇配裝 A。</div> : null}
        </div></Section>
        <Section title="配裝 B"><div className="card stack">
          <ComboSelect
            label="配裝 B"
            value={bKey}
            options={options}
            onChange={(next) => {
              setBKey(next)
              const selected = options.find((option) => option.key === next)
              if (!selected) return
              const nextStructure = inferBuilderStructure(selected.slots, parts)
              setStructure(nextStructure)
              commitBSlots(selected.slots, mode, nextStructure)
            }}
          />
          <div className="meta">也可以直接在下面配出 B，不必先儲存。</div>
          <div><div className="meta" style={{ marginBottom: 4 }}>選擇範圍</div><div className="chip-row">
            {(Object.keys(MODE_LABEL) as BuilderMode[]).map((item) => <button key={item} type="button" className={mode === item ? 'btn btn-primary' : 'btn'} onClick={() => { setMode(item); commitBSlots(bSlots, item) }}>{MODE_LABEL[item]}</button>)}
          </div></div>
          <div><div className="meta" style={{ marginBottom: 4 }}>結構</div><div className="chip-row">
            <button type="button" className={structure === 'standard' ? 'btn btn-primary' : 'btn'} onClick={() => { setStructure('standard'); commitBSlots({}, mode, 'standard') }}>三件式（BX／UX）</button>
            <button type="button" className={structure === 'cx' ? 'btn btn-primary' : 'btn'} onClick={() => { setStructure('cx'); commitBSlots({}, mode, 'cx') }}>CX 模組化</button>
          </div></div>
          {schema.map((def) => <PartPickerField key={def.key} def={def} options={selectable.filter((part) => def.families.includes(part.family))} selectedPart={parts.find((part) => part.id === bSlots[def.key])} availability={availability} images={images} disabledReasonZhTW={lockedSlotReason(def.key, bSlots, parts)} onChange={(next) => { setBKey(''); commitBSlots({ ...bSlots, [def.key]: next || undefined }) }} />)}
          <button type="button" className="btn" disabled={!Object.values(bSlots).some(Boolean)} onClick={() => { setBKey(''); setBSlots({}); setPruneNotice(null) }}>清除 B 配裝</button>
          {pruneNotice ? <NoticeCard tone="warn">{pruneNotice}</NoticeCard> : null}
        </div></Section>
      </div>
      <div className="work-result">
        {!a ? <EmptyState title="還沒選滿兩套" hint="先在配裝器完成一套後按「拿這套去比較」，或從左側清單選一套。" />
          : !aAnalysis?.compatibility.ok || !bAnalysis.compatibility.ok ? <EmptyState title="還沒選滿兩套" hint="A 與 B 都選完相容的零件後，就會顯示比較與對打預測。" />
            : comparison && prediction ? <Section title="比較結果"><ComparisonResult comparison={comparison} prediction={prediction} /></Section> : null}
      </div>
    </div>
  </>
}

function ComparisonResult({ comparison, prediction }: { comparison: NonNullable<ReturnType<typeof compareCombos>>; prediction: MatchupPrediction }) {
  const outcome = prediction.outcome === 'a_advantage' ? 'A 較佔優' : prediction.outcome === 'b_advantage' ? 'B 較佔優' : prediction.outcome === 'even' ? '勝負難分' : '資料不足'
  return <div className="stack">
    <Section title="對打模型預測" action={<EstimateBadge />}><div className="card stack" data-testid="matchup-prediction">
      <strong style={{ fontSize: 18 }}>{outcome}</strong>
      {prediction.aModelProbability !== undefined ? <div><span className="code">A {prediction.aModelProbability}%</span>　<span className="code">B {prediction.bModelProbability}%</span></div> : null}
      <div>{prediction.noticeZhTW}</div>
      {prediction.reasonsZhTW.length > 0 ? <ul style={{ margin: 0, paddingLeft: 18 }}>{prediction.reasonsZhTW.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
      <div className="meta">實戰賽果：目前尚未收錄逐場 A 對 B 資料，因此不顯示真實勝率。</div>
    </div></Section>
    <Section title="高度對位"><div className="card" data-testid="height-matchup">{comparison.heightMatchupZhTW}</div></Section>
    {comparison.changedSlots.length > 0 ? <Section title="換掉的零件"><div className="card stack">
      <div style={{ fontSize: 13, fontWeight: 700, color: comparison.changedSlots.length === 1 ? 'var(--ok)' : 'var(--ink-dim)' }}>{comparison.changedSlots.length === 1 ? '只差一個零件' : `換了 ${comparison.changedSlots.length} 個零件`}</div>
      {comparison.changedSlots.map((slot) => <div key={slot.slotZhTW} style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{slot.slotZhTW} <span className="code">{slot.fromZhTW}</span> → <span className="code">{slot.toZhTW}</span></div>)}
    </div></Section> : null}
    <Section title="六軸與客觀資料比較" action={<EstimateBadge />}><div className="card stack">
      <p style={{ margin: 0 }}>{comparison.summaryZhTW}</p><div style={{ overflowX: 'auto' }}><table className="compare-table"><thead><tr><th>項目</th><th>A</th><th>B</th><th>差距</th></tr></thead><tbody>
        {comparison.rows.map((row) => {
          const axisColor = AXIS_COLOR[row.labelZhTW]
          const winStyle = axisColor ? ({ ['--win-color' as string]: axisColor } as CSSProperties) : undefined
          return <tr key={row.labelZhTW}><td>{row.labelZhTW}</td><td className={row.better === 'a' ? 'win' : undefined} style={row.better === 'a' ? winStyle : undefined}>{row.aValue}{row.better === 'a' ? ' ✓' : ''}</td><td className={row.better === 'b' ? 'win' : undefined} style={row.better === 'b' ? winStyle : undefined}>{row.bValue}{row.better === 'b' ? ' ✓' : ''}</td><td className="delta">{row.deltaZhTW}</td></tr>
        })}
      </tbody></table></div>
    </div></Section>
  </div>
}

function ComboSelect({ label, value, options, onChange }: { label: string; value: string; options: { key: string; label: string }[]; onChange: (next: string) => void }) {
  return <label className="stack" style={{ gap: 4 }}><span className="meta">{label}</span><select className="field" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">尚未選擇</option>{options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
}
