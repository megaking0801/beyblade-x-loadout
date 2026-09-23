import { useMemo } from 'react'
import { recommendNextProducts } from '../../domain/recommendations.ts'
import { createCompetitiveEvidenceByCode, competitiveMetaSnapshot } from '../../domain/competitiveMeta.ts'
import { getCommunityEvidenceSource } from '../../catalog/communityRecords.ts'
import { getExpertPartRatingIndex } from '../../catalog/tierLists.ts'
import { getPartStrengthIndex } from '../../catalog/partStrength.ts'
import { formatProductLabel } from '../../domain/naming.ts'
import { useAppStore } from '../../store/appStore.ts'
import { Link } from '../router.tsx'
import { Badge, CatalogTitle, EmptyState, EstimateBadge, PageHeader, Section } from '../components/ui.tsx'

export function RecommendationsPage() {
  const products = useAppStore((state) => state.products)
  const productVariants = useAppStore((state) => state.productVariants)
  const ownedProducts = useAppStore((state) => state.ownedProducts)
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)
  const tournamentEvents = useAppStore((state) => state.tournamentEvents)
  const tournamentDecks = useAppStore((state) => state.tournamentDecks)
  const evidenceByCode = useMemo(
    () => createCompetitiveEvidenceByCode({ events: tournamentEvents, decks: tournamentDecks, community: getCommunityEvidenceSource() }),
    [tournamentEvents, tournamentDecks],
  )
  const expertTierByPartId = useMemo(() => getExpertPartRatingIndex(), [])
  const partStrengthIndex = useMemo(() => getPartStrengthIndex(), [])
  const result = useMemo(() => recommendNextProducts({
    products,
    variants: productVariants,
    ownedProducts,
    parts,
    rules,
    lots,
    combos,
    evidenceByCode,
    expertTierByPartId,
    partStrengthIndex,
    limit: 5,
  }), [combos, evidenceByCode, expertTierByPartId, lots, ownedProducts, partStrengthIndex, parts, productVariants, products, rules])

  return <>
    <PageHeader title="下一包推薦" description="以台灣賽場優先的完整配置證據，模擬多買一盒固定內容商品後能否組出更好的合法 3on3。" action={<EstimateBadge />} />
    {lots.length === 0 ? <EmptyState title="先登錄你現有的商品" hint="推薦會依實際庫存、已組配裝與相容規則計算。" action={<Link to="/products" className="btn btn-primary">新增商品</Link>} /> : null}
    {lots.length > 0 ? <Section title="前五名固定內容商品"><div className="stack">
      <p className="meta" style={{ margin: 0 }}>競技快照更新：{competitiveMetaSnapshot.updatedAt}。不含價格、稀有度與隨機包；完整配置沒有實戰資料時不會假稱保證強勢。</p>
      {result.recommendations.length === 0 ? <EmptyState title="目前沒有明確競技升級" hint="現有固定內容商品無法讓你組出更好的合法 3on3；可補登零件或已開封的隨機包內容後再看。" /> : result.recommendations.map((item) => {
        const label = formatProductLabel(item.product)
        return <article className="card stack" key={item.product.id} data-testid={`purchase-recommendation-${item.rank}`}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
            <span className="code rank-num">{item.rank}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}><CatalogTitle>{label.titleZhTW}</CatalogTitle></div>
              <div className="meta">固定內容：{item.addedPartNamesZhTW.join('、')}</div>
            </div>
            {item.isAdditionalCopy ? <Badge tone="accent">補足份數</Badge> : null}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{item.reasonsZhTW.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <Link to="/product" query={{ id: item.product.id }} className="btn btn-compact">查看商品</Link>
        </article>
      })}
    </div></Section> : null}
    {result.randomProducts.length > 0 ? <Section title="隨機包：可能補到的零件（不排名）"><div className="stack">
      <p className="meta" style={{ margin: 0 }}>隨機包的內容無法由單盒保證取得，因此只另外列出可能補到、你尚未持有的零件。</p>
      {result.randomProducts.slice(0, 12).map((item) => {
        const label = formatProductLabel(item.product)
        return <div className="card" key={item.product.id}><div style={{ fontWeight: 700 }}><CatalogTitle>{label.titleZhTW}</CatalogTitle></div><div className="meta" style={{ marginTop: 4 }}>可能補到：{item.possiblePartNamesZhTW.join('、')}</div><div style={{ height: 8 }} /><Link to="/product" query={{ id: item.product.id }} className="btn btn-compact">查看商品</Link></div>
      })}
      {result.randomProducts.length > 12 ? <div className="meta">另有 {result.randomProducts.length - 12} 款隨機包未展開。</div> : null}
    </div></Section> : null}
    <p className="meta" style={{ margin: '0 0 24px' }}>這是台灣賽場優先的決策輔助，不是實戰勝率或商品價值保證；發射技術、磨耗與當地環境仍會影響結果。</p>
  </>
}
