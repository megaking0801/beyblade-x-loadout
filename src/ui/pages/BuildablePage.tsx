/**
 * 我現在能組什麼。
 *
 * 規格對照：第 29 節（產生可組配置與排序）、第 17 節（三種模式）、第 19 節（結果欄位）。
 */
import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import {
  generateBuildableCombos,
  type BuildableSortKey,
  type BuilderMode,
} from '../../domain/builder.ts'
import { Link } from '../router.tsx'
import {
  Badge,
  EmptyState,
  EstimateBadge,
  PageHeader,
  Row,
  Section,
} from '../components/ui.tsx'

const SORT_LABEL: Record<BuildableSortKey, string> = {
  beginner: '最適合新手',
  attack: '攻擊最高',
  stamina: '持久最高',
  stability: '最穩',
  evidence: '賽事證據最多',
  simplest: '操作最簡單',
}

const MODE_LABEL: Record<BuilderMode, string> = {
  owned: '只用我有的',
  catalog: '全部圖鑑',
  hypothetical: '假想購買',
}

const LIMIT = 40

export function BuildablePage() {
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)

  const [sortBy, setSortBy] = useState<BuildableSortKey>('beginner')
  const [mode, setMode] = useState<BuilderMode>('owned')

  const rows = useMemo(
    () =>
      generateBuildableCombos({
        parts,
        rules,
        lots,
        combos,
        mode,
        sortBy,
        limit: LIMIT,
      }),
    [parts, rules, lots, combos, mode, sortBy],
  )

  return (
    <>
      <PageHeader
        title="我能組什麼"
        description="只列出實際能安裝的組合；可用零件不足的不會出現在「只用我有的」模式。"
      />

      <Section title="模式">
        <Row gap={6}>
          {(Object.keys(MODE_LABEL) as BuilderMode[]).map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? 'btn btn-primary' : 'btn'}
              onClick={() => setMode(item)}
            >
              {MODE_LABEL[item]}
            </button>
          ))}
        </Row>
      </Section>

      <Section title="排序">
        <select
          className="field"
          aria-label="排序方式"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as BuildableSortKey)}
        >
          {(Object.keys(SORT_LABEL) as BuildableSortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABEL[key]}
            </option>
          ))}
        </select>
      </Section>

      <Section title={`結果（最多顯示 ${LIMIT} 筆）`} action={<EstimateBadge />}>
        {rows.length === 0 ? (
          <EmptyState
            title="目前組不出任何完整配置"
            hint="至少需要一個上蓋、一個固鎖與一個軸心，而且都要是可用狀態。"
          />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((row) => (
              <Link
                key={row.analysis.fullCode}
                to="/builder"
                query={{ c: encodeURIComponent(JSON.stringify(row.slots)) }}
                className="card"
              >
                <Row>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 600 }}>{row.analysis.fullNameZhTW}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {row.analysis.fullCode} ・ {row.analysis.objective.structureZhTW}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13 }}>
                    <div>攻 {row.analysis.scores?.attack ?? '—'}</div>
                    <div>久 {row.analysis.scores?.stamina ?? '—'}</div>
                    <div>穩 {row.analysis.scores?.stability ?? '—'}</div>
                  </div>
                  {row.analysis.stock.sufficient ? (
                    <Badge tone="ok">庫存足夠</Badge>
                  ) : (
                    <Badge tone="warn">庫存不足</Badge>
                  )}
                </Row>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
