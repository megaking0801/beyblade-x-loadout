/**
 * 想買清單。
 *
 * 規格對照：第 35 節（買這盒會新增什麼、可解鎖幾套配裝）、第 13 節（隨機內容不確定）。
 */
import { useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { analyzeWishlistProduct } from '../../domain/wishlist.ts'
import { formatProductLabel } from '../../domain/naming.ts'
import { searchProducts } from '../../domain/search.ts'
import type { Product } from '../../domain/types.ts'
import { Link } from '../router.tsx'
import {
  Badge,
  EmptyState,
  PageHeader,
  Quantity,
  Row,
  Section,
} from '../components/ui.tsx'

export function WishlistPage() {
  const products = useAppStore((state) => state.products)
  const wishlist = useAppStore((state) => state.wishlist)
  const run = useAppStore((state) => state.run)
  const [query, setQuery] = useState('')

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  const results = useMemo(
    () => (query.trim() ? searchProducts(products, query).slice(0, 20) : []),
    [products, query],
  )

  return (
    <>
      <PageHeader title="想買清單" description="看看買哪一盒最能解鎖新配裝。" />

      <Section title="加入商品">
        <input
          className="field"
          placeholder="搜尋要加入的商品"
          aria-label="搜尋想買的商品"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div style={{ height: 10 }} />
        <div style={{ display: 'grid', gap: 8 }}>
          {results.map((row) => (
            <div className="card" key={row.product.id}>
              <Row>
                <span style={{ flex: 1 }}>{formatProductLabel(row.product).titleZhTW}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    void run(() => repo.addWishlistItem({ productId: row.product.id, quantity: 1 }))
                  }
                >
                  加入
                </button>
              </Row>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`我的想買清單（${wishlist.length}）`}>
        {wishlist.length === 0 ? (
          <EmptyState title="想買清單：0" hint="搜尋商品後按「加入」。" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {wishlist.map((item) => {
              const product = productById.get(item.productId)
              if (!product) return null
              return <WishlistCard key={item.id} itemId={item.id} product={product} quantity={item.quantity} />
            })}
          </div>
        )}
      </Section>
    </>
  )
}

function WishlistCard({
  itemId,
  product,
  quantity,
}: {
  itemId: string
  product: Product
  quantity: number
}) {
  const parts = useAppStore((state) => state.parts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const combos = useAppStore((state) => state.combos)
  const productVariants = useAppStore((state) => state.productVariants)
  const run = useAppStore((state) => state.run)
  const [quantityDraft, setQuantityDraft] = useState(quantity)

  const impact = useMemo(
    () =>
      analyzeWishlistProduct({
        product,
        variants: productVariants,
        parts,
        rules,
        lots,
        combos,
        quantity: quantityDraft,
      }),
    [product, productVariants, parts, rules, lots, combos, quantityDraft],
  )

  const label = formatProductLabel(product)

  return (
    <div className="card">
      <Row>
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontWeight: 600 }}>{label.titleZhTW}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {label.categoryZhTW}
          </div>
        </div>
        <Quantity label="想買盒數" min={1} value={quantityDraft} onChange={setQuantityDraft} />
      </Row>

      <div style={{ height: 10 }} />

      {impact.isUncertain ? (
        <div style={{ fontSize: 14, color: 'var(--warn)' }}>{impact.uncertaintyNoticeZhTW}</div>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 600 }}>買這盒會新增：</div>
          {impact.addedParts.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
              官方尚未公布這盒的內含零件，因此無法計算。
            </div>
          ) : (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 14 }}>
              {impact.addedParts.map((row) => (
                <li key={row.partId}>
                  {row.nameZhTW} ×{row.quantity}
                </li>
              ))}
            </ul>
          )}
          {impact.addedAccessories.length > 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              配件：{impact.addedAccessories.map((row) => `${row.name} ×${row.quantity}`).join('、')}
            </div>
          ) : null}
          <div style={{ height: 8 }} />
          <Row>
            <Badge tone={impact.unlockedComboCount > 0 ? 'ok' : 'neutral'}>
              可解鎖新配裝 {impact.unlockedComboCount} 套
            </Badge>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              目前 {impact.currentBuildableCount} 套 → 買後 {impact.buildableCountAfterPurchase} 套
            </span>
          </Row>
          {impact.unlockedExamplesZhTW.length > 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
              例如：{impact.unlockedExamplesZhTW.join('、')}
            </div>
          ) : null}
        </>
      )}

      {impact.possibleVariants.length > 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
          可能款式：{impact.possibleVariants.map((variant) => variant.variantNameZhTW).join('、')}
        </div>
      ) : null}

      <div style={{ height: 10 }} />
      <Row>
        <Link to="/product" query={{ id: product.id }} className="btn">
          商品詳情
        </Link>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void run(() => repo.deleteWishlistItem(itemId))}
        >
          移除
        </button>
      </Row>
    </div>
  )
}
