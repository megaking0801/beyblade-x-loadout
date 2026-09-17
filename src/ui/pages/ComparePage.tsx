/**
 * 配裝 A/B 比較。
 *
 * 規格對照：第 34 節（比較項目、讓新手看懂換一個零件的差別）、第 38 節（白話說明）。
 */
import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import { analyzeCombo } from '../../domain/analysis.ts'
import { compareCombos } from '../../domain/compare.ts'
import { generateBuildableCombos } from '../../domain/builder.ts'
import { Badge, EmptyState, EstimateBadge, PageHeader, Section } from '../components/ui.tsx'

export function ComparePage() {
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)

  const options = useMemo(() => {
    const saved = combos.map((combo) => ({
      key: `saved:${combo.id}`,
      label: `${combo.nameZhTW}（已儲存）`,
      slots: combo.slots,
    }))
    const buildable = generateBuildableCombos({
      parts,
      rules,
      lots,
      combos,
      mode: 'owned',
      sortBy: 'beginner',
      limit: 30,
    }).map((row) => ({
      key: `buildable:${row.analysis.fullCode}`,
      label: row.analysis.fullNameZhTW,
      slots: row.slots,
    }))
    return [...saved, ...buildable]
  }, [combos, parts, rules, lots])

  const [aKey, setAKey] = useState('')
  const [bKey, setBKey] = useState('')

  const a = options.find((option) => option.key === aKey)
  const b = options.find((option) => option.key === bKey)

  const comparison = useMemo(() => {
    if (!a || !b) return null
    const sideA = {
      slots: a.slots,
      analysis: analyzeCombo({ slots: a.slots, parts, rules, lots, combos }),
    }
    const sideB = {
      slots: b.slots,
      analysis: analyzeCombo({ slots: b.slots, parts, rules, lots, combos }),
    }
    return compareCombos({ a: sideA, b: sideB, parts })
  }, [a, b, parts, rules, lots, combos])

  return (
    <>
      <PageHeader
        title="配裝比較"
        description="選兩套配裝，看看只換一個固鎖或軸心到底差在哪。"
      />

      {options.length < 2 ? (
        <EmptyState
          title="可比較的配裝不足 2 套"
          hint="先儲存配裝，或把庫存登記齊讓系統產生可組配置。"
        />
      ) : (
        <div className="work-split">
          <div className="stack">
            <Section title="選擇配裝">
              <div className="stack">
                <ComboSelect
                  label="配裝 A"
                  value={aKey}
                  options={options}
                  onChange={setAKey}
                />
                <ComboSelect
                  label="配裝 B"
                  value={bKey}
                  options={options}
                  onChange={setBKey}
                />
              </div>
            </Section>

            {comparison && comparison.changedSlotsZhTW.length > 0 ? (
              <div className="card">
                <div className="section-title">換掉的零件</div>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {comparison.changedSlotsZhTW.map((slot) => (
                    <Badge key={slot} tone="accent">
                      {slot}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="work-result">
            {comparison ? (
              <Section title="比較結果" action={<EstimateBadge />}>
                <div className="card stack">
                  <p style={{ margin: 0 }}>{comparison.summaryZhTW}</p>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="compare-table">
                      <thead>
                        <tr>
                          <th>項目</th>
                          <th>A</th>
                          <th>B</th>
                          <th>差距</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.rows.map((row) => (
                          <tr key={row.labelZhTW}>
                            <td>{row.labelZhTW}</td>
                            <td className={row.better === 'a' ? 'win' : undefined}>
                              {row.aValue}
                              {row.better === 'a' ? ' ✓' : ''}
                            </td>
                            <td className={row.better === 'b' ? 'win' : undefined}>
                              {row.bValue}
                              {row.better === 'b' ? ' ✓' : ''}
                            </td>
                            <td className="delta">{row.deltaZhTW}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Section>
            ) : (
              <EmptyState title="還沒選滿兩套" hint="左邊各選一套就會出現比較表。" />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ComboSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { key: string; label: string }[]
  onChange: (next: string) => void
}) {
  return (
    <label className="stack" style={{ gap: 4 }}>
      <span className="meta">{label}</span>
      <select
        className="field"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">尚未選擇</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
