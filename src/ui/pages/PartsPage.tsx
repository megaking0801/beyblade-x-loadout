/**
 * 零件頁：我的零件 + 零件庫。
 *
 * 規格對照：第 10 節（零件 CRUD）、第 16 節（零件狀態）、第 26 節（我的零件頁分類與卡片）、
 * 第 31 節（實體鎖定占用）、第 40 節（搜尋別名）。
 */
import { useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { formatPartLabel } from '../../domain/naming.ts'
import { searchParts } from '../../domain/search.ts'
import { PART_STATUS_ZH, SPIN_DIRECTION_ZH, type Part, type PartFamily, type PartStatus } from '../../domain/types.ts'
import { Link } from '../router.tsx'
import { Badge, CatalogTitle, EmptyState, PageHeader, PartThumb, Quantity, Row, Section, TypeTag, useJustAdded } from '../components/ui.tsx'

/** 第 26 節指定的分類。 */
const GROUPS: { key: string; label: string; families: PartFamily[] }[] = [
  { key: 'blade', label: '上蓋', families: ['blade'] },
  { key: 'ratchet', label: '固鎖', families: ['ratchet'] },
  { key: 'bit', label: '軸心', families: ['bit'] },
  { key: 'cx', label: 'CX 組件', families: ['lock_chip', 'main_blade', 'assist_blade'] },
  { key: 'integrated', label: '特殊一體式', families: ['integrated_blade'] },
]

const STATUS_OPTIONS: PartStatus[] = [
  'available',
  'ordered',
  'loaned_out',
  'sold',
  'lost',
  'damaged',
  'worn',
]

export function PartsPage() {
  const [tab, setTab] = useState<'mine' | 'catalog' | 'accessories'>('mine')
  const stock = useAppStore((state) => state.stock)

  return (
    <>
      <PageHeader title="零件" description="可用數量才會進配裝器、3on3 與自動推薦。" />
      <Row gap={6}>
        <button
          type="button"
          data-testid="tab-my-parts"
          className={tab === 'mine' ? 'btn btn-primary' : 'btn'}
          onClick={() => setTab('mine')}
        >
          我的零件（{stock.size}）
        </button>
        <button
          type="button"
          data-testid="tab-part-catalog"
          className={tab === 'catalog' ? 'btn btn-primary' : 'btn'}
          onClick={() => setTab('catalog')}
        >
          零件庫
        </button>
        <button
          type="button"
          className={tab === 'accessories' ? 'btn btn-primary' : 'btn'}
          onClick={() => setTab('accessories')}
        >
          配件庫
        </button>
      </Row>
      <div style={{ height: 14 }} />
      {tab === 'mine' ? <MyParts /> : tab === 'catalog' ? <PartCatalog /> : <Accessories />}
    </>
  )
}

function MyParts() {
  const stock = useAppStore((state) => state.stock)
  const availability = useAppStore((state) => state.availability)
  const parts = useAppStore((state) => state.parts)
  const partPreferences = useAppStore((state) => state.partPreferences)
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const images = useAppStore((state) => state.images)
  const partImageUrl = useMemo(
    () =>
      new Map(
        images
          .filter((image) => image.entityType === 'part')
          .map((image) => [image.entityId, image.url] as const),
      ),
    [images],
  )
  const preferenceByPartId = useMemo(
    () => new Map(partPreferences.map((preference) => [preference.partId, preference])),
    [partPreferences],
  )

  if (stock.size === 0) {
    return (
      <EmptyState
        title="我的零件：0"
        hint="到「商品」登記你買的盒子，或切到「零件庫」單獨新增零件。"
      />
    )
  }

  return (
    <>
      {GROUPS.map((group) => {
        const rows = [...stock.values()].filter((row) => {
          const part = partById.get(row.partId)
          return part ? group.families.includes(part.family) : false
        })
        if (rows.length === 0) return null
        return (
          <Section key={group.key} title={`${group.label}（${rows.length}）`}>
            <div className="spec-list">
              {rows.map((row) => {
                const part = partById.get(row.partId)
                if (!part) return null
                const label = formatPartLabel(part)
                const free = availability.get(row.partId)?.free ?? row.available
                const reserved = availability.get(row.partId)?.reserved ?? 0
                return (
                  <Link
                    to="/part"
                    query={{ id: part.id }}
                    className="spec-row"
                    key={row.partId}
                    testId="part-stock"
                    dataPartId={part.id}
                  >
                    <PartThumb
                      size={54}
                      code={part.code}
                      nameZhTW={label.titleZhTW}
                      imageUrl={partImageUrl.get(part.id)}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        <CatalogTitle>{label.titleZhTW}</CatalogTitle>
                      </div>
                      {/*
                        分類已經寫在區塊標題上，列裡改放真正有辨識度的規格：
                        類型（有顏色）與旋向。重量刻意不顯示：同款零件的個體差異
                        比配裝差異還大，標一個數字會讓人以為那是規格。
                      */}
                      <div className="chip-row" style={{ gap: 5, marginTop: 3 }}>
                        <TypeTag type={part.type} />
                        {part.spinDirection ? (
                          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                            {SPIN_DIRECTION_ZH[part.spinDirection]}
                          </span>
                        ) : null}
                      </div>
                      {label.plainDescriptionZhTW ? (
                        <div className="meta clamp-2">{label.plainDescriptionZhTW}</div>
                      ) : null}
                      {preferenceByPartId.get(part.id)?.favorite ? (
                        <div className="meta" style={{ fontSize: 12 }}>
                          已收藏
                        </div>
                      ) : null}
                    </div>
                    <div className="spec-figure" style={{ fontSize: 13 }}>
                        <div data-testid="part-available">
                          可用 <span className="code">×{row.available}</span>
                        </div>
                        {reserved > 0 ? (
                          <div style={{ color: 'var(--warn)' }} data-testid="part-reserved">
                            已組裝占用 ×{reserved}
                          </div>
                        ) : null}
                        {reserved > 0 ? <div data-testid="part-free">還能用 ×{free}</div> : null}
                        {row.ordered > 0 ? (
                          <div style={{ color: 'var(--warn)' }} data-testid="part-ordered">
                            未到貨 ×{row.ordered}
                          </div>
                        ) : null}
                        {row.loanedOut > 0 ? <div>借出 ×{row.loanedOut}</div> : null}
                        {row.worn > 0 ? <div>磨耗 ×{row.worn}</div> : null}
                        {row.damaged > 0 ? <div>損壞 ×{row.damaged}</div> : null}
                        {row.lost > 0 ? <div>遺失 ×{row.lost}</div> : null}
                      {row.sold > 0 ? <div>已出售 ×{row.sold}</div> : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          </Section>
        )
      })}
      <StandaloneLots />
    </>
  )
}

function StandaloneLots() {
  const lots = useAppStore((state) => state.lots)
  const parts = useAppStore((state) => state.parts)
  const run = useAppStore((state) => state.run)
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const standalone = lots.filter((lot) => lot.sourceType !== 'product')

  if (standalone.length === 0) return null

  return (
    <Section title="單獨新增的零件批次">
      <div style={{ display: 'grid', gap: 8 }}>
        {standalone.map((lot) => {
          const part = partById.get(lot.partId)
          return (
            <div className="card" key={lot.id}>
              <Row>
                <div style={{ flex: 1, minWidth: 140 }}>
                  {part ? formatPartLabel(part).titleZhTW : lot.partId}
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {lot.notes ?? '單獨購入'}
                  </div>
                </div>
                <Quantity
                  label="批次數量"
                  value={lot.quantity}
                  onChange={(next) =>
                    void run(() => repo.updateStandalonePart(lot.id, { quantity: next }))
                  }
                />
                <select
                  className="field"
                  style={{ width: 130 }}
                  aria-label="零件狀態"
                  value={lot.status}
                  onChange={(event) =>
                    void run(() =>
                      repo.updateStandalonePart(lot.id, {
                        status: event.target.value as PartStatus,
                      }),
                    )
                  }
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {PART_STATUS_ZH[status]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void run(() => repo.deleteStandalonePart(lot.id))}
                >
                  刪除
                </button>
              </Row>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function PartCatalog() {
  const parts = useAppStore((state) => state.parts)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')

  const filtered = useMemo(() => {
    const families = GROUPS.find((item) => item.key === group)?.families
    const pool = families ? parts.filter((part) => families.includes(part.family)) : parts
    return searchParts(pool, query).slice(0, 100)
  }, [parts, query, group])

  return (
    <>
      <Row>
        <input
          className="field"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="搜尋中文、型號、日文名或別名"
          aria-label="搜尋零件"
          data-testid="part-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="field"
          style={{ width: 140 }}
          aria-label="零件分類"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value="all">全部分類</option>
          {GROUPS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </Row>
      <div style={{ height: 12 }} />
      <Section title={`共 ${filtered.length} 筆`}>
        {filtered.length === 0 ? (
          <EmptyState title="找不到符合的零件" hint="試試型號，例如 3-60 或 960。" />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map((row) => (
              <CatalogPartCard key={row.part.id} part={row.part} />
            ))}
          </div>
        )}
      </Section>
    </>
  )
}

function CatalogPartCard({ part }: { part: Part }) {
  const run = useAppStore((state) => state.run)
  const images = useAppStore((state) => state.images)
  const [quantity, setQuantity] = useState(1)
  const [justAdded, markAdded] = useJustAdded()
  const label = formatPartLabel(part)
  // 圖鑑這半原本沒接零件圖，整頁只有型號佔位字，認不出是哪顆。
  const imageUrl = images.find(
    (image) => image.entityType === 'part' && image.entityId === part.id,
  )?.url

  return (
    <div className={justAdded ? 'card just-added' : 'card'} data-testid="catalog-part">
      <Row>
        <PartThumb code={part.code} nameZhTW={label.titleZhTW} imageUrl={imageUrl} size={54} />
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontWeight: 600 }} data-testid="catalog-part-title">
            <CatalogTitle>{label.titleZhTW}</CatalogTitle>{' '}
            {label.isProvisional ? <Badge>暫譯</Badge> : null}
          </div>
          <div className="chip-row" style={{ gap: 5, marginTop: 3 }}>
            <TypeTag type={part.type} />
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{label.familyZhTW}</span>
          </div>
          {part.plainDescriptionZhTW ? (
            <div className="meta clamp-2" style={{ marginTop: 3 }}>
              {part.plainDescriptionZhTW}
            </div>
          ) : null}
        </div>
      </Row>
      <div style={{ height: 8 }} />
      <Row>
        <Quantity
          testId="standalone-qty"
          label={`${label.titleZhTW} 數量`}
          min={1}
          value={quantity}
          onChange={setQuantity}
        />
        <button
          type="button"
          className="btn btn-primary"
          data-testid="add-standalone"
          onClick={async () => {
            const ok = await run(() =>
              repo.addStandalonePart({ partId: part.id, quantity, status: 'available' }),
            )
            if (ok) markAdded()
          }}
        >
          {justAdded ? `已加入 ×${quantity}` : '單獨新增'}
        </button>
        <Link to="/part" query={{ id: part.id }} className="btn">
          詳情
        </Link>
      </Row>
    </div>
  )
}

function Accessories() {
  const accessories = useAppStore((state) => state.accessories)
  if (accessories.length === 0) {
    return <EmptyState title="配件庫：0" hint="登記含發射器或握把的商品後會自動出現。" />
  }
  return (
    <Section title="配件（不進配裝器）">
      <div style={{ display: 'grid', gap: 8 }}>
        {accessories.map((row) => (
          <div className="card" key={row.name}>
            <Row>
              <PartThumb code={row.name} />
              <span style={{ flex: 1 }}>{row.name}</span>
              <span>×{row.quantity}</span>
            </Row>
          </div>
        ))}
      </div>
    </Section>
  )
}
