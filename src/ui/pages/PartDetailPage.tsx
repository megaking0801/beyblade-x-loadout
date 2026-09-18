/**
 * 零件詳情（零件來源反查）。
 *
 * 規格對照：第 27 節（哪些商品含此零件、我有幾個、哪些配裝在用、常見搭配、賽事使用情況）、
 * 第 12 節（來源批次）、第 31 節（實體鎖定）、第 24 節（賽事資料建置中）。
 */
import { useEffect, useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { formatPartLabel, formatProductLabel, resolveDisplayName } from '../../domain/naming.ts'
import {
  VERIFICATION_STATUS_ZH,
  describeStatSource,
  statFieldLabel,
} from '../../domain/provenance.ts'
import { BEY_TYPE_ZH, BIT_CONTACT_ZH, SPIN_DIRECTION_ZH } from '../../domain/types.ts'
import { getPartTournamentDecks, getPartTournamentObservations } from '../../domain/tournament.ts'
import { getExpertTierMatches } from '../../catalog/tierLists.ts'
import type { PartStock } from '../../domain/inventory.ts'
import { PART_STATUS_ZH, type PartSourceEntryLike } from './partDetailTypes.ts'
import { Link } from '../router.tsx'
import { Badge, CatalogTitle, EmptyState, PageHeader, PartThumb, Row, Section } from '../components/ui.tsx'
import { ImageSourceNote } from '../components/ImageSource.tsx'

/**
 * 除了「可用／占用／還能用」以外的庫存狀態。
 *
 * 這七種多半是 0，所以只在非 0 時以小徽章出現，不要每一種都固定佔一行。
 */
const OTHER_STOCK_STATES: { labelZhTW: string; pick: (row: PartStock) => number }[] = [
  { labelZhTW: '未到貨', pick: (row) => row.ordered },
  { labelZhTW: '借出', pick: (row) => row.loanedOut },
  { labelZhTW: '磨耗', pick: (row) => row.worn },
  { labelZhTW: '損壞', pick: (row) => row.damaged },
  { labelZhTW: '遺失', pick: (row) => row.lost },
  { labelZhTW: '已出售', pick: (row) => row.sold },
]

export function PartDetailPage({ partId }: { partId: string }) {
  const parts = useAppStore((state) => state.parts)
  const images = useAppStore((state) => state.images)
  const products = useAppStore((state) => state.products)
  const productVariants = useAppStore((state) => state.productVariants)
  const stock = useAppStore((state) => state.stock)
  const availability = useAppStore((state) => state.availability)
  const combos = useAppStore((state) => state.combos)
  const partPreferences = useAppStore((state) => state.partPreferences)
  const tournamentEvents = useAppStore((state) => state.tournamentEvents)
  const tournamentDecks = useAppStore((state) => state.tournamentDecks)
  const tournamentObservations = useAppStore((state) => state.tournamentObservations)
  const [sources, setSources] = useState<PartSourceEntryLike[]>([])

  const part = parts.find((row) => row.id === partId)

  useEffect(() => {
    if (!part) return
    let alive = true
    void repo.describeSources(part.id).then((rows) => {
      if (alive) setSources(rows)
    })
    return () => {
      alive = false
    }
  }, [part])

  const containingProducts = useMemo(
    () =>
      products.filter((product) =>
        product.contents.some((content) => content.partId === partId),
      ),
    [products, partId],
  )

  const containingVariants = useMemo(
    () =>
      productVariants.filter((variant) =>
        variant.contents.some((content) => content.partId === partId),
      ),
    [productVariants, partId],
  )

  const usingCombos = useMemo(
    () => combos.filter((combo) => Object.values(combo.slots).includes(partId)),
    [combos, partId],
  )
  const tournamentUses = useMemo(
    () => getPartTournamentDecks(partId, tournamentDecks),
    [partId, tournamentDecks],
  )
  const tournamentObservationsForPart = useMemo(
    () => getPartTournamentObservations(partId, tournamentObservations),
    [partId, tournamentObservations],
  )
  const tournamentEventById = useMemo(
    () => new Map(tournamentEvents.map((event) => [event.id, event])),
    [tournamentEvents],
  )
  const expertTierMatches = useMemo(
    () => getExpertTierMatches({ bladeId: partId }),
    [partId],
  )

  if (!part) {
    return (
      <>
        <PageHeader title="零件詳情" backTo="/parts" backLabelZhTW="零件" />
        <EmptyState title="找不到這個零件" />
      </>
    )
  }

  const label = formatPartLabel(part)
  const statSource = describeStatSource(part)
  const partImage = images.find(
    (image) => image.entityType === 'part' && image.entityId === part.id,
  )
  const row = stock.get(part.id)
  const avail = availability.get(part.id)
  const preference = partPreferences.find((item) => item.partId === part.id)

  return (
    <>
      <PageHeader
        title={label.titleZhTW}
        description={label.familyZhTW}
        backTo="/parts"
        backLabelZhTW="零件"
      />

      <Section title="基本資料">
        <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          <Row>
            <PartThumb code={part.code} nameZhTW={label.titleZhTW} size={64} />
            <ImageSourceNote image={partImage} />
            <div style={{ flex: 1 }}>
              {label.isProvisional ? <Badge>暫譯名稱</Badge> : null}
              {label.secondaryNames.length > 0 ? (
                <div style={{ color: 'var(--text-dim)' }}>{label.secondaryNames.join(' ／ ')}</div>
              ) : null}
            </div>
          </Row>
          <div>組裝系統：{part.system}</div>
          <div>
            {statFieldLabel(part, '類型')}：
            {part.type ? BEY_TYPE_ZH[part.type] : '官方未公布'}
          </div>
          <div>
            {statFieldLabel(part, '旋向')}：
            {part.spinDirection ? SPIN_DIRECTION_ZH[part.spinDirection] : '官方未公布'}
          </div>
          {part.family === 'ratchet' ? (
            <div>高度標示：{part.heightCode ?? '官方未公布'}</div>
          ) : null}
          {part.family === 'bit' ? (
            <div>
              {statFieldLabel(part, '軸心特性')}：
              {part.bitContact ? BIT_CONTACT_ZH[part.bitContact] : '官方未公布'}
            </div>
          ) : null}
          {part.cxFused ? (
            <div style={{ color: 'var(--warn)' }}>
              此為 CX「鎖定紋章 + 主刃」已組合的狀態，官方尚未公布兩者個別名稱。
            </div>
          ) : null}
        </div>
      </Section>

      {expertTierMatches.length > 0 ? (
        <Section title="高手 T 表評級">
          <div className="card" style={{ display: 'grid', gap: 8, fontSize: 14 }} data-testid="part-expert-tier">
            {expertTierMatches.map((match) => (
              <div key={`${match.listTitleZhTW}-${match.tierLabel}`}>
                <Badge tone="accent">{match.tierLabel}</Badge>{' '}
                {match.listTitleZhTW}（{match.authorZhTW}，{match.updatedAt}）{' '}
                <a href={match.sourceUrl} target="_blank" rel="noreferrer">來源</a>
                <div className="meta">{match.noteZhTW}</div>
              </div>
            ))}
            <div className="meta">這是獨立的社群評級，不會改變賽事統計、模型分數或可信度。</div>
          </div>
        </Section>
      ) : null}

      {/*
        三個數字才是真正會被問的：有幾個、被占用幾個、還能用幾個。
        其餘七種狀態（未到貨、借出、磨耗、損壞、遺失、已出售）多半是 0，
        原本每一種各佔一行會把卡片拉長，改成只在非 0 時出現的小徽章。
      */}
      <Section title="我有幾個">
        {row ? (
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <div className="stat-strip">
              <div className="stat-strip-item">
                <span className="meta">可用</span>
                <span className="code">×{row.available}</span>
              </div>
              <div className="stat-strip-item">
                <span className="meta">已被配裝占用</span>
                <span className="code">×{avail?.reserved ?? 0}</span>
              </div>
              <div className="stat-strip-item">
                <span className="meta">還能用</span>
                <span className="code">×{avail?.free ?? row.available}</span>
              </div>
            </div>
            {OTHER_STOCK_STATES.some(({ pick }) => pick(row) > 0) ? (
              <div className="chip-row">
                {OTHER_STOCK_STATES.filter(({ pick }) => pick(row) > 0).map(({ labelZhTW, pick }) => (
                  <Badge key={labelZhTW} tone="neutral">
                    {labelZhTW} ×{pick(row)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="目前沒有這個零件"
            hint="登記含有它的商品，或到「零件」單獨新增。"
            action={
              <Link to="/parts" className="btn btn-primary">
                去登記
              </Link>
            }
          />
        )}
      </Section>

      <PartPreferenceEditor
        partId={part.id}
        favorite={preference?.favorite ?? false}
        notes={preference?.notes ?? ''}
      />

      <Section title="庫存來源">
        {sources.length === 0 ? (
          <EmptyState title="還沒有來源紀錄" />
        ) : (
          <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            {sources.map((source, index) => (
              <div key={`${source.labelZhTW}-${index}`}>
                {source.labelZhTW} ×{source.quantity}（{PART_STATUS_ZH[source.status]}）
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="哪些商品含此零件">
        {containingProducts.length === 0 ? (
          <EmptyState title="圖鑑中沒有已確認含此零件的商品" />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {containingProducts.map((product) => (
              <Link to="/product" query={{ id: product.id }} className="card" key={product.id}>
                <Row>
                  <span style={{ flex: 1 }}>
                    <CatalogTitle>{formatProductLabel(product).titleZhTW}</CatalogTitle>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{product.sku}</span>
                </Row>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {containingVariants.length > 0 ? (
        <Section title="哪些款式含此零件">
          <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            {containingVariants.map((variant) => (
              <div key={variant.id}>{variant.variantNameZhTW}</div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="哪些配裝正在使用">
        {usingCombos.length === 0 ? (
          <EmptyState title="還沒有配裝用到它" />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {usingCombos.map((combo) => (
              <Link to="/builder" query={{ combo: combo.id }} className="card" key={combo.id}>
                <Row>
                  <span style={{ flex: 1 }}>{combo.nameZhTW}</span>
                  {combo.physicallyBuilt ? <Badge tone="warn">已實際組裝</Badge> : null}
                </Row>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="常見搭配">
        <CommonPairings partId={part.id} />
      </Section>

      <Section title="賽事使用情況">
        {tournamentUses.length === 0 ? (
          <EmptyState title="尚無可對應此零件的賽事資料" hint="只計入完整且已映射到型錄的社群賽事牌組。" />
        ) : (
          <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div>出現在已匯入的 {tournamentUses.length} 副 Top Cut 牌組中。</div>
            {tournamentUses.map((deck) => {
              const event = tournamentEventById.get(deck.eventId)
              return event ? (
                <a key={deck.id} href={event.sourceUrl} target="_blank" rel="noreferrer">
                  {event.name}（第 {deck.placement ?? '未標示'} 名・{event.date}・社群彙整）
                </a>
              ) : null
            })}
          </div>
        )}
      </Section>

      {tournamentObservationsForPart.length > 0 ? (
        <Section title="賽事來源觀測">
          <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }} data-testid="part-tournament-observations">
            <div className="meta">
              這些配置所在的三對三牌組尚有零件未映射，因此只揭露來源，不納入出場率、Meta share 或可信度。
            </div>
            {tournamentObservationsForPart.map((observation) => {
              const event = tournamentEventById.get(observation.eventId)
              return event ? (
                <a key={observation.id} href={observation.sourceUrl} target="_blank" rel="noreferrer">
                  {event.name}（第 {observation.placement ?? '未標示'} 名・{event.date}）
                </a>
              ) : null
            })}
          </div>
        </Section>
      ) : null}

      <Section title="來源網址">
        <div className="card" style={{ display: 'grid', gap: 10, fontSize: 14 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontWeight: 600 }}>
              零件身分（型號與名稱）
              <Badge tone="ok">{VERIFICATION_STATUS_ZH[part.provenance.verificationStatus]}</Badge>
            </div>
            {part.provenance.sourceUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            ))}
            <div style={{ color: 'var(--text-dim)' }}>
              核對日期：{part.provenance.verifiedAt ?? '未記錄'}
            </div>
          </div>

          {statSource ? (
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>
                類型、旋向與軸心特性
                <Badge tone={statSource.isOfficial ? 'ok' : 'warn'}>{statSource.statusZhTW}</Badge>
              </div>
              {statSource.isOfficial ? null : (
                <div style={{ color: 'var(--warn)' }}>
                  官方沒有公布這些數值，這裡採用社群圖鑑的玩家實測，與官方數據不同。
                </div>
              )}
              {statSource.sourceUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              ))}
              <div style={{ color: 'var(--text-dim)' }}>
                核對日期：{statSource.verifiedAt ?? '未記錄'}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-dim)' }}>
              類型、旋向與軸心特性目前沒有任何來源，因此留空。
            </div>
          )}
        </div>
      </Section>
    </>
  )
}

function PartPreferenceEditor({
  partId,
  favorite,
  notes: initialNotes,
}: {
  partId: string
  favorite: boolean
  notes: string
}) {
  const run = useAppStore((state) => state.run)
  const [notes, setNotes] = useState(initialNotes)

  useEffect(() => setNotes(initialNotes), [initialNotes])

  return (
    <Section title="我的標記">
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            aria-label="收藏這個零件"
            checked={favorite}
            onChange={(event) =>
              void run(() => repo.updatePartPreference(partId, { favorite: event.target.checked }))
            }
          />
          收藏這個零件
        </label>
        <textarea
          className="field"
          aria-label="零件備註"
          placeholder="例如：哪顆磨耗較明顯、想測試的搭配"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => void run(() => repo.updatePartPreference(partId, { notes }))}
        />
      </div>
    </Section>
  )
}

/** 從圖鑑中的商品內容統計同盒常見搭配，不是賽事資料。 */
function CommonPairings({ partId }: { partId: string }) {
  const products = useAppStore((state) => state.products)
  const parts = useAppStore((state) => state.parts)
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const product of products) {
      const ids = product.contents.map((content) => content.partId).filter(Boolean) as string[]
      if (!ids.includes(partId)) continue
      for (const id of ids) {
        if (id === partId) continue
        map.set(id, (map.get(id) ?? 0) + 1)
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [products, partId])

  if (counts.length === 0) {
    return <EmptyState title="沒有同盒搭配紀錄" />
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
      <div style={{ color: 'var(--text-dim)' }}>依官方商品組成統計同盒出現次數，不是賽事數據。</div>
      {counts.map(([id, count]) => {
        const part = partById.get(id)
        return (
          <div key={id}>
            {part ? resolveDisplayName(part.naming).titleZhTW : id} ・ 同盒出現 {count} 次
          </div>
        )
      })}
    </div>
  )
}
