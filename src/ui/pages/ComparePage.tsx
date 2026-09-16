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
import { EmptyState, EstimateBadge, PageHeader, Row, Section } from '../components/ui.tsx'

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
        <>
          <Section title="選擇配裝">
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>配裝 A</span>
                <select
                  className="field"
                  aria-label="配裝 A"
                  value={aKey}
                  onChange={(event) => setAKey(event.target.value)}
                >
                  <option value="">尚未選擇</option>
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>配裝 B</span>
                <select
                  className="field"
                  aria-label="配裝 B"
                  value={bKey}
                  onChange={(event) => setBKey(event.target.value)}
                >
                  <option value="">尚未選擇</option>
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Section>

          {comparison ? (
            <Section title="比較結果" action={<EstimateBadge />}>
              <div className="card">
                <div style={{ fontSize: 14, marginBottom: 10 }}>{comparison.summaryZhTW}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th style={cellStyle}>項目</th>
                        <th style={cellStyle}>A</th>
                        <th style={cellStyle}>B</th>
                        <th style={cellStyle}>差距</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.rows.map((row) => (
                        <tr key={row.labelZhTW}>
                          <td style={cellStyle}>{row.labelZhTW}</td>
                          <td style={{ ...cellStyle, fontWeight: row.better === 'a' ? 700 : 400 }}>
                            {row.aValue}
                            {row.better === 'a' ? ' ✓' : ''}
                          </td>
                          <td style={{ ...cellStyle, fontWeight: row.better === 'b' ? 700 : 400 }}>
                            {row.bValue}
                            {row.better === 'b' ? ' ✓' : ''}
                          </td>
                          <td style={{ ...cellStyle, color: 'var(--text-dim)' }}>{row.deltaZhTW}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {comparison.changedSlotsZhTW.length > 0 ? (
                  <Row>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                      換掉的零件：{comparison.changedSlotsZhTW.join('、')}
                    </span>
                  </Row>
                ) : null}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </>
  )
}

const cellStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
}
