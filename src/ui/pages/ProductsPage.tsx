/**
 * 商品頁：我的商品 + 商品庫。
 *
 * 規格對照：第 10 節（商品 CRUD）、第 11 節（數量）、第 13 節（Random Booster 開封）、
 * 第 15 節（商品狀態）、第 28 節（商品反查）、第 40 節（搜尋別名）。
 */
import { useEffect, useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { formatProductLabel } from '../../domain/naming.ts'
import { searchProducts } from '../../domain/search.ts'
import {
  OWNED_PRODUCT_STATUS_ZH,
  PRODUCT_CATEGORY_ZH,
  type OwnedProduct,
  type OwnedProductStatus,
  type Product,
} from '../../domain/types.ts'
import { Link } from '../router.tsx'
import { Badge, CatalogTitle, EmptyState, PageHeader, PartThumb, Quantity, Row, Section, TypeTag, useJustAdded } from '../components/ui.tsx'
import { formatPartLabel } from '../../domain/naming.ts'

const STATUS_OPTIONS: OwnedProductStatus[] = ['owned', 'ordered', 'wishlist', 'sold']

export function ProductsPage() {
  const [tab, setTab] = useState<'mine' | 'catalog'>('mine')
  const ownedProducts = useAppStore((state) => state.ownedProducts)

  return (
    <>
      <PageHeader
        title="商品"
        description="先把買過的盒子登記進來，系統才知道你有哪些零件。"
      />
      <Row gap={6}>
        <button
          type="button"
          data-testid="tab-my-products"
          className={tab === 'mine' ? 'btn btn-primary' : 'btn'}
          onClick={() => setTab('mine')}
        >
          我的商品（{ownedProducts.length}）
        </button>
        <button
          type="button"
          data-testid="tab-catalog"
          className={tab === 'catalog' ? 'btn btn-primary' : 'btn'}
          onClick={() => setTab('catalog')}
        >
          商品庫
        </button>
      </Row>
      <div style={{ height: 14 }} />
      {tab === 'mine' ? <MyProducts /> : <CatalogList />}
    </>
  )
}

function MyProducts() {
  const ownedProducts = useAppStore((state) => state.ownedProducts)
  const products = useAppStore((state) => state.products)
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  if (ownedProducts.length === 0) {
    return (
      <EmptyState
        title="我的商品：0"
        hint="切到「商品庫」找到你買的盒子，按「加入我的商品」即可。"
      />
    )
  }

  return (
    <div className="list-grid">
      {ownedProducts.map((owned) => {
        const product = productById.get(owned.productId)
        if (!product) return null
        return <OwnedProductCard key={owned.id} owned={owned} product={product} />
      })}
    </div>
  )
}

function OwnedProductCard({ owned, product }: { owned: OwnedProduct; product: Product }) {
  const run = useAppStore((state) => state.run)
  const productVariants = useAppStore((state) => state.productVariants)
  const images = useAppStore((state) => state.images)
  const [notes, setNotes] = useState(owned.notes ?? '')
  const label = formatProductLabel(product)
  const imageUrl = images.find((image) => image.entityType === 'product' && image.entityId === product.id)?.url
  const variants = productVariants.filter((variant) => variant.productId === product.id)
  // 已拆封盒數要把「選款式」與「自行登記內容」兩種都算進來。
  const openedTotal =
    (owned.openedVariants ?? []).reduce((sum, row) => sum + row.quantity, 0) +
    (owned.manualOpenedQuantity ?? 0)

  useEffect(() => setNotes(owned.notes ?? ''), [owned.notes])

  return (
    <div className="card" data-testid="owned-product">
      <Row>
        <PartThumb code={product.sku ?? product.id} imageUrl={imageUrl} size={56} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }} data-testid="owned-product-title">
            <CatalogTitle>{label.titleZhTW}</CatalogTitle>{' '}
            {label.isProvisional ? <Badge>暫譯</Badge> : null}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {label.categoryZhTW}
          </div>
        </div>
      </Row>

      <div style={{ height: 10 }} />
      <Row>
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>盒數</span>
        <Quantity
          testId="owned-qty"
          label={`${label.titleZhTW} 盒數`}
          value={owned.quantity}
          onChange={(next) => void run(() => repo.updateOwnedProduct(owned.id, { quantity: next }))}
        />
        <select
          className="field"
          style={{ width: 150 }}
          aria-label="商品狀態"
          value={owned.status}
          onChange={(event) =>
            void run(() =>
              repo.updateOwnedProduct(owned.id, {
                status: event.target.value as OwnedProductStatus,
              }),
            )
          }
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {OWNED_PRODUCT_STATUS_ZH[status]}
            </option>
          ))}
        </select>
      </Row>

      {product.isRandom ? (
        <>
          <div style={{ height: 10 }} />
          <div style={{ fontSize: 13 }}>
            未拆封 {owned.sealedQuantity ?? 0} 盒 ・ 已拆封 {openedTotal} 盒
          </div>
          <div style={{ fontSize: 13, color: 'var(--warn)' }}>
            未拆封不會加入任何可用零件。拆開後請登記實際抽到的內容。
          </div>
          {variants.length > 0 ? (
            <OpenVariantForm ownedId={owned.id} variantIds={variants.map((v) => v.id)} />
          ) : (
            <ManualOpenForm ownedId={owned.id} sealed={owned.sealedQuantity ?? 0} />
          )}
        </>
      ) : null}

      {/* 備註大多是空的，展開後才佔版面，收起來時整份清單才掃得快。 */}
      <details open={Boolean(owned.notes)} style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ink-dim)' }}>
          備註{owned.notes ? '' : '（空白）'}
        </summary>
        <textarea
          className="field"
          style={{ marginTop: 8 }}
          aria-label={`${label.titleZhTW} 備註`}
          placeholder="例如購買日期、來源或預計到貨日"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes === (owned.notes ?? '')) return
            void run(() => repo.updateOwnedProduct(owned.id, { notes: notes.trim() || undefined }))
          }}
        />
      </details>

      <div style={{ height: 10 }} />
      <Row>
        <Link to="/product" query={{ id: product.id }} className="btn">
          商品詳情
        </Link>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void run(() => repo.deleteOwnedProduct(owned.id))}
        >
          刪除
        </button>
      </Row>
    </div>
  )
}

function OpenVariantForm({ ownedId, variantIds }: { ownedId: string; variantIds: string[] }) {
  const run = useAppStore((state) => state.run)
  const productVariants = useAppStore((state) => state.productVariants)
  const [variantId, setVariantId] = useState(variantIds[0] ?? '')
  const [quantity, setQuantity] = useState(1)

  return (
    <Row>
      <select
        className="field"
        style={{ width: 160 }}
        aria-label="抽到的款式"
        value={variantId}
        onChange={(event) => setVariantId(event.target.value)}
      >
        {variantIds.map((id) => (
          <option key={id} value={id}>
            {productVariants.find((variant) => variant.id === id)?.variantNameZhTW ?? id}
          </option>
        ))}
      </select>
      <Quantity label="開封盒數" value={quantity} min={1} onChange={setQuantity} />
      <button
        type="button"
        className="btn"
        onClick={() => void run(() => repo.openRandomBooster(ownedId, variantId, quantity))}
      >
        登記開封
      </button>
    </Row>
  )
}

/**
 * 官方沒公布款式清單時的開封登記（第 13 節）。
 * 使用者自己說抽到什麼，系統就只加那個，不做任何推測。
 */
function ManualOpenForm({ ownedId, sealed }: { ownedId: string; sealed: number }) {
  const run = useAppStore((state) => state.run)
  const parts = useAppStore((state) => state.parts)
  const [rows, setRows] = useState<{ partId: string; quantity: number }[]>([
    { partId: '', quantity: 1 },
  ])

  const options = useMemo(
    () =>
      parts
        .filter((part) => part.family !== 'other')
        .map((part) => ({ id: part.id, label: formatPartLabel(part) }))
        .sort((a, b) => a.label.familyZhTW.localeCompare(b.label.familyZhTW)),
    [parts],
  )

  if (sealed <= 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
        沒有未拆封的盒子可以登記。
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 8 }} data-testid="manual-open-form">
      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
        官方未公布這盒的款式清單。請直接登記你這盒實際抽到的零件。
      </div>
      {rows.map((row, index) => (
        <Row key={index}>
          <select
            className="field"
            style={{ flex: 1, minWidth: 180 }}
            aria-label={`實際抽到的零件 ${index + 1}`}
            data-testid="manual-open-part"
            value={row.partId}
            onChange={(event) =>
              setRows((prev) =>
                prev.map((item, i) => (i === index ? { ...item, partId: event.target.value } : item)),
              )
            }
          >
            <option value="">選擇零件</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label.familyZhTW}：{option.label.titleZhTW}
              </option>
            ))}
          </select>
          <Quantity
            label={`實際抽到數量 ${index + 1}`}
            min={1}
            value={row.quantity}
            onChange={(next) =>
              setRows((prev) =>
                prev.map((item, i) => (i === index ? { ...item, quantity: next } : item)),
              )
            }
          />
        </Row>
      ))}
      <Row>
        <button
          type="button"
          className="btn"
          onClick={() => setRows((prev) => [...prev, { partId: '', quantity: 1 }])}
        >
          再加一個零件
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="manual-open-submit"
          onClick={async () => {
            const contents = rows.filter((row) => row.partId)
            const ok = await run(() => repo.recordOpenedContents(ownedId, 1, contents))
            if (ok) setRows([{ partId: '', quantity: 1 }])
          }}
        >
          登記這一盒的內容
        </button>
      </Row>
    </div>
  )
}

/** 產品線是找商品時最先用的條件：多數人記得的是「CX 那條」而不是分類。 */
const LINE_FILTERS = ['all', 'BX', 'UX', 'CX'] as const
type LineFilter = (typeof LINE_FILTERS)[number]
const LINE_LABEL: Record<LineFilter, string> = {
  all: '全部',
  BX: 'BX 三件式',
  UX: 'UX 三件式',
  CX: 'CX 模組化',
}

function CatalogList() {
  const products = useAppStore((state) => state.products)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [line, setLine] = useState<LineFilter>('all')

  const filtered = useMemo(() => {
    const byLine = line === 'all' ? products : products.filter((product) => product.line === line)
    const pool =
      category === 'all' ? byLine : byLine.filter((product) => product.category === category)
    return searchProducts(pool, query).slice(0, 80)
  }, [products, query, category, line])

  const countByLine = useMemo(() => {
    const counts = new Map<LineFilter, number>([['all', products.length]])
    for (const product of products) {
      const key = product.line as LineFilter
      if (LINE_FILTERS.includes(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [products])

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))],
    [products],
  )

  return (
    <>
      <div className="filter-row">
        {LINE_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className="filter-chip"
            data-testid={`line-filter-${item}`}
            aria-pressed={line === item}
            onClick={() => setLine(item)}
          >
            {LINE_LABEL[item]}
            {countByLine.get(item) ? `（${countByLine.get(item)}）` : ''}
          </button>
        ))}
      </div>
      <div style={{ height: 10 }} />
      <Row>
        <input
          className="field"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="搜尋中文、型號、日文名或別名"
          aria-label="搜尋商品"
          data-testid="product-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="field"
          style={{ width: 150 }}
          aria-label="商品分類"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">全部分類</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {PRODUCT_CATEGORY_ZH[item]}
            </option>
          ))}
        </select>
      </Row>
      <div style={{ height: 12 }} />
      <Section title={`共 ${filtered.length} 筆`}>
        {filtered.length === 0 ? (
          <EmptyState title="找不到符合的商品" hint="試試型號，例如 BX-01。" />
        ) : (
          <div className="card-grid">
            {filtered.map((row) => (
              <CatalogProductCard key={row.product.id} product={row.product} />
            ))}
          </div>
        )}
      </Section>
    </>
  )
}

function CatalogProductCard({ product }: { product: Product }) {
  const run = useAppStore((state) => state.run)
  const images = useAppStore((state) => state.images)
  const [quantity, setQuantity] = useState(1)
  const [status, setStatus] = useState<OwnedProductStatus>('owned')
  const [justAdded, markAdded] = useJustAdded()
  const label = formatProductLabel(product)
  const imageUrl = images.find((image) => image.entityType === 'product' && image.entityId === product.id)?.url
  // 商品本身沒有類型，用盒內上蓋的類型代表它；一盒多顆時不標，免得誤導。
  const parts = useAppStore((state) => state.parts)
  const mainBladeType = useMemo(() => {
    const blades = product.contents
      .map((entry) => parts.find((part) => part.id === entry.partId))
      .filter((part) => part && ['blade', 'integrated_blade', 'main_blade'].includes(part.family))
    return blades.length === 1 ? blades[0]?.type : undefined
  }, [product.contents, parts])

  return (
    <div
      className={justAdded ? 'product-card just-added' : 'product-card'}
      data-testid="catalog-product"
    >
      {/* 圖片佔上半：挑盒子時先認得出是哪顆陀螺，名稱才是輔助。 */}
      <div className="product-card-art">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          // 圖磚是淺底，共用的深色佔位圖放上去會變成一個黑洞，這裡直接寫型號。
          <span className="code" style={{ fontSize: 18, color: '#8d9bb0' }}>
            {product.sku ?? '—'}
          </span>
        )}
      </div>
      <div className="product-card-body">
        <div style={{ fontWeight: 600, fontSize: 14 }} data-testid="catalog-product-title">
          <CatalogTitle>{label.titleZhTW}</CatalogTitle>{' '}
          {label.isProvisional ? <Badge>暫譯</Badge> : null}
        </div>
        <div className="chip-row" style={{ gap: 5 }}>
          <TypeTag type={mainBladeType} />
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{label.categoryZhTW}</span>
        </div>
        {/*
          半欄寬塞不下原尺寸的步進器＋下拉＋兩顆按鈕（會擠成三行更難按），
          但「一次加三盒」「標成未到貨」都是真實需求，所以留功能、縮尺寸。
        */}
        <div className="qty-compact" style={{ display: 'grid', gap: 6 }}>
          <Quantity
            testId="catalog-qty"
            label={`${label.titleZhTW} 盒數`}
            min={1}
            value={quantity}
            onChange={setQuantity}
          />
          <select
            className="field"
            aria-label="加入狀態"
            data-testid="catalog-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as OwnedProductStatus)}
          >
            {STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {OWNED_PRODUCT_STATUS_ZH[item]}
              </option>
            ))}
          </select>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="add-owned"
          onClick={async () => {
            const ok = await run(() =>
              repo.addOwnedProduct({ productId: product.id, quantity, status }),
            )
            // 加入後留在原地繼續挑，只用按鈕與外框回饋；原本會 navigate 回同一頁，
            // 畫面毫無變化，使用者會以為沒按到而重複加。
            if (ok) markAdded()
          }}
        >
          {justAdded ? `已加入 ×${quantity}` : '加入'}
        </button>
        </div>
        <Link to="/product" query={{ id: product.id }} className="btn btn-compact">
          詳情
        </Link>
      </div>
    </div>
  )
}
