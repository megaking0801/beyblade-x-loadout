/**
 * 我現在能組什麼。
 *
 * 規格對照：第 29 節（產生可組配置與排序）、第 17 節（三種模式）、第 19 節（結果欄位）。
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import {
  generateBuildableCombos,
  type BuildableSortKey,
  type BuilderMode,
} from '../../domain/builder.ts'
import { describeSortMetric, describeStockBadge } from '../../domain/buildableRows.ts'
import { Link } from '../router.tsx'
import {
  Badge,
  EmptyState,
  EstimateBadge,
  PageHeader,
  PartThumb,
  Section,
} from '../components/ui.tsx'

const SORT_LABEL: Record<BuildableSortKey, string> = {
  strength: '整體強度',
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
  const images = useAppStore((state) => state.images)

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

  // 一次建圖，不要每一列都對 300 多筆圖片做線性搜尋。
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const imageUrlByPartId = useMemo(
    () =>
      new Map(
        images
          .filter((image) => image.entityType === 'part')
          .map((image) => [image.entityId, image.url]),
      ),
    [images],
  )

  return (
    <>
      <PageHeader
        title="我能組什麼"
        description="只列出實際能安裝的組合；可用零件不足的不會出現在「只用我有的」模式。"
      />

      <Section title="模式">
        <div className="chip-row">
          {(Object.keys(MODE_LABEL) as BuilderMode[]).map((item) => (
            <button
              key={item}
              type="button"
              className="filter-chip"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              {MODE_LABEL[item]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="排序">
        {/*
          排序有 6 個選項，做成 chip 在 320px 會擠成三行，
          所以維持原生下拉——選項少的時候原生控制項體驗更好。
        */}
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

      <Section title="結果" action={<EstimateBadge />}>
        {rows.length === 0 ? (
          <EmptyState
            title="目前組不出任何完整配置"
            hint="至少需要一個上蓋、一個固鎖與一個軸心，而且都要是可用狀態。"
          />
        ) : (
          <>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="code" style={{ fontSize: 18, color: 'var(--signal)' }}>
                {rows.length}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>筆結果</span>
              <span style={{ flex: 1 }} />
              <span className="meta">
                {/* 枚舉本來就在 LIMIT 截斷，所以列滿時要講「還有更多」，不要讓人以為只有這些。 */}
                {rows.length === LIMIT ? `最多顯示 ${LIMIT} 筆` : '已全部列出'}
              </span>
            </div>
            <div style={{ height: 12 }} />
            <div className="spec-list">
              {rows.map((row, index) => {
                const metric = describeSortMetric(row.analysis, sortBy)
                const stock = describeStockBadge(row.analysis)
                const bladeId = row.slots.bladeId ?? row.slots.mainBladeId
                const blade = bladeId ? partById.get(bladeId) : undefined
                return (
                  <Link
                    key={row.analysis.fullCode}
                    to="/builder"
                    query={{ c: encodeURIComponent(JSON.stringify(row.slots)) }}
                    className="spec-row"
                  >
                    <span className="code rank-num">{index + 1}</span>
                    <PartThumb
                      code={blade?.code ?? ''}
                      nameZhTW={row.analysis.fullNameZhTW}
                      imageUrl={bladeId ? imageUrlByPartId.get(bladeId) : undefined}
                      size={46}
                    />
                    <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        {row.analysis.fullNameZhTW}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {metric.percent === undefined ? (
                          <span className="mini-bar is-empty" aria-hidden />
                        ) : (
                          <span
                            className="mini-bar"
                            aria-hidden
                            style={{ '--mini-bar-color': metric.color } as CSSProperties}
                          >
                            <span style={{ width: `${metric.percent}%` }} />
                          </span>
                        )}
                        <span className="code" style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
                          {metric.labelZhTW} {metric.valueZhTW}
                        </span>
                      </span>
                    </span>
                    <span className="spec-figure">
                      <Badge tone={stock.toneOk ? 'ok' : 'warn'}>{stock.textZhTW}</Badge>
                    </span>
                  </Link>
                )
              })}
            </div>
            <div style={{ height: 8 }} />
            <p className="meta" style={{ margin: 0 }}>
              分數為本站模型推估；「差 1 件」表示少一個零件就能組。
            </p>
          </>
        )}
      </Section>
    </>
  )
}
