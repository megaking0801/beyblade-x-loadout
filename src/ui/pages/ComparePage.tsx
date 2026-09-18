/**
 * 配裝 A/B 比較。
 *
 * 規格對照：第 34 節（比較項目、讓新手看懂換一個零件的差別）、第 38 節（白話說明）。
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import { analyzeCombo } from '../../domain/analysis.ts'
import { compareCombos } from '../../domain/compare.ts'
import { generateBuildableCombos } from '../../domain/builder.ts'
import { EmptyState, EstimateBadge, PageHeader, Section } from '../components/ui.tsx'

/*
 * 比較項目對應的顏色。
 *
 * 只有真正屬於某個類型軸的項目才給色，其餘（高度、賽事證據、資料可信度）
 * 留空退回主色 —— 給每一列都上不同顏色只會變成色票展示，反而看不出重點。
 */
const AXIS_COLOR: Record<string, string> = {
  攻擊: 'var(--type-attack)',
  防守: 'var(--type-defense)',
  持久: 'var(--type-stamina)',
  穩定: 'var(--type-balance)',
  操作難度: 'var(--type-balance)',
}

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

            {comparison && comparison.changedSlots.length > 0 ? (
              <div className="card">
                <div className="section-title">換掉的零件</div>
                {/*
                  只列槽位名稱（「固鎖」）看不出換了什麼。寫成「固鎖 3-60 → 3-80」
                  才看得出差異在哪，這也是新手最需要的那一句（第 38 節）。
                */}
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    color: comparison.changedSlots.length === 1 ? 'var(--ok)' : 'var(--ink-dim)',
                  }}
                >
                  {comparison.changedSlots.length === 1
                    ? '只差一個零件'
                    : `換了 ${comparison.changedSlots.length} 個零件`}
                </div>
                <div className="stack" style={{ marginTop: 8 }}>
                  {comparison.changedSlots.map((slot) => (
                    <div key={slot.slotZhTW} style={{ fontSize: 13, color: 'var(--ink-dim)' }}>
                      {slot.slotZhTW}{' '}
                      <span className="code">{slot.fromZhTW}</span>
                      {' → '}
                      <span className="code">{slot.toZhTW}</span>
                    </div>
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
                        {comparison.rows.map((row) => {
                          const axisColor = AXIS_COLOR[row.labelZhTW]
                          // 只掛在勝出的那一格；同分時兩格都不上色。
                          const winStyle = axisColor
                            ? ({ ['--win-color' as string]: axisColor } as CSSProperties)
                            : undefined
                          return (
                            <tr key={row.labelZhTW}>
                              {/*
                                項目名這一格只能是純文字：e2e 用
                                getByRole('cell', { name, exact: true }) 精確比對這八個名稱，
                                加任何字或標籤都會讓斷言失敗。
                              */}
                              <td>{row.labelZhTW}</td>
                              <td
                                className={row.better === 'a' ? 'win' : undefined}
                                style={row.better === 'a' ? winStyle : undefined}
                              >
                                {row.aValue}
                                {row.better === 'a' ? ' ✓' : ''}
                              </td>
                              <td
                                className={row.better === 'b' ? 'win' : undefined}
                                style={row.better === 'b' ? winStyle : undefined}
                              >
                                {row.bValue}
                                {row.better === 'b' ? ' ✓' : ''}
                              </td>
                              <td className="delta">{row.deltaZhTW}</td>
                            </tr>
                          )
                        })}
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
