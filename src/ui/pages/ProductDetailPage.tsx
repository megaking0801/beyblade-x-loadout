/**
 * 商品詳情（商品反查）。
 *
 * 規格對照：第 28 節（商品反查必備欄位）、第 8 節（Random Booster 款式）、
 * 第 25 節（圖片 fallback）、第 41 節（來源網址）。
 */
import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore.ts'
import { formatPartLabel, formatProductLabel, resolveDisplayName } from '../../domain/naming.ts'
import { OWNED_PRODUCT_STATUS_ZH } from '../../domain/types.ts'
import { Link } from '../router.tsx'
import { Badge, CatalogTitle, EmptyState, PageHeader, PartThumb, Row, Section } from '../components/ui.tsx'
import { ImageSourceNote } from '../components/ImageSource.tsx'

export function ProductDetailPage({ productId }: { productId: string }) {
  const products = useAppStore((state) => state.products)
  const parts = useAppStore((state) => state.parts)
  const productVariants = useAppStore((state) => state.productVariants)
  const ownedProducts = useAppStore((state) => state.ownedProducts)
  const images = useAppStore((state) => state.images)

  const product = products.find((row) => row.id === productId)
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])

  if (!product) {
    return (
      <>
        <PageHeader title="商品詳情" />
        <EmptyState title="找不到這個商品" hint="可能圖鑑已更新。" />
      </>
    )
  }

  const label = formatProductLabel(product)
  const variants = productVariants.filter((variant) => variant.productId === product.id)
  const mine = ownedProducts.filter((owned) => owned.productId === product.id)
  const totalQuantity = mine.reduce((sum, owned) => sum + owned.quantity, 0)
  const productImage = images.find(
    (image) => image.entityType === 'product' && image.entityId === product.id,
  )

  return (
    <>
      <PageHeader title={label.titleZhTW} description={label.categoryZhTW} />

      <Section title="基本資料">
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <Row>
            <PartThumb code={product.sku ?? product.id} size={72} imageUrl={productImage?.url} />
            <ImageSourceNote image={productImage} />
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {productImage ? '官方主圖以外部連結顯示；離線或讀取失敗時會改用型號佔位。' : '尚未取得官方主圖，暫以型號佔位。'}
            </div>
          </Row>
          <Field name="台灣中文名稱">
            <CatalogTitle>{label.titleZhTW}</CatalogTitle>{' '}
            {label.isProvisional ? <Badge>暫譯</Badge> : null}
          </Field>
          {label.secondaryNames.length > 0 ? (
            <Field name="其他名稱">{label.secondaryNames.join(' ／ ')}</Field>
          ) : null}
          <Field name="型號">{product.sku ?? '官方未編號'}</Field>
          <Field name="發售方式">{label.categoryZhTW}</Field>
          <Field name="發售日期">{product.releaseDate ?? '未公布'}</Field>
          <Field name="販售地區">{product.region.join('、')}</Field>
          <Field name="資料驗證">
            <Badge tone={product.provenance.verificationStatus === 'official_verified' ? 'ok' : 'warn'}>
              {product.provenance.verificationStatus === 'official_verified' ? '官方已核對' : '待查'}
            </Badge>
          </Field>
        </div>
      </Section>

      <Section title="所有內含零件">
        {product.contents.length === 0 ? (
          <EmptyState
            title={product.isRandom ? '隨機內容，官方未公布款式清單' : '官方尚未公布內含零件'}
            hint={
              product.isRandom
                ? '開封後可以在「我的商品」自行登記實際抽到什麼，系統只採信你登記的內容。'
                : '官方商品一覽只列商品名稱，套裝內含哪幾顆沒有公布；社群圖鑑也還原不出完整清單，所以這裡留空而不是猜一組。'
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {product.contents.map((content, index) => {
              if (content.accessoryName) {
                return (
                  <div className="card" key={`${content.accessoryName}-${index}`}>
                    <Row>
                      <PartThumb code={content.accessoryName} />
                      <span style={{ flex: 1 }}>{content.accessoryName}</span>
                      <Badge>配件</Badge>
                      <span>×{content.quantity}</span>
                    </Row>
                  </div>
                )
              }
              const part = content.partId ? partById.get(content.partId) : undefined
              if (!part) return null
              const partLabel = formatPartLabel(part)
              return (
                <Link to="/part" query={{ id: part.id }} className="card" key={`${part.id}-${index}`}>
                  <Row>
                    <PartThumb
                      code={part.code}
                      nameZhTW={partLabel.titleZhTW}
                      imageUrl={
                        images.find(
                          (image) => image.entityType === 'part' && image.entityId === part.id,
                        )?.url
                      }
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>
                        <CatalogTitle>{partLabel.titleZhTW}</CatalogTitle>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {partLabel.familyZhTW}
                      </div>
                    </div>
                    <span>×{content.quantity}</span>
                  </Row>
                </Link>
              )
            })}
          </div>
        )}
      </Section>

      {product.isRandom ? (
        <Section title="所有可能款式">
          {variants.length === 0 ? (
            <EmptyState
              title="官方未公布款式清單"
              hint="開封後請到「零件」頁把實際抽到的零件單獨新增，庫存與來源一樣會被記錄。"
            />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {variants.map((variant) => (
                <div className="card" key={variant.id}>
                  <div style={{ fontWeight: 600 }}>{variant.variantNameZhTW}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    {variant.contents
                      .map((content) => {
                        const part = content.partId ? partById.get(content.partId) : undefined
                        return part ? resolveDisplayName(part.naming).titleZhTW : content.accessoryName
                      })
                      .filter(Boolean)
                      .join('、')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      <Section title="我的數量">
        {mine.length === 0 ? (
          <EmptyState title="還沒有登記這個商品" />
        ) : (
          <div className="card" style={{ display: 'grid', gap: 6 }}>
            <Field name="總盒數">{totalQuantity}</Field>
            {mine.map((owned) => (
              <div key={owned.id} style={{ fontSize: 14 }}>
                {OWNED_PRODUCT_STATUS_ZH[owned.status]} ×{owned.quantity}
                {product.isRandom
                  ? `（未拆封 ${owned.sealedQuantity ?? 0}，已拆封 ${
                      (owned.openedVariants ?? []).reduce((sum, row) => sum + row.quantity, 0) +
                      (owned.manualOpenedQuantity ?? 0)
                    }）`
                  : ''}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="來源網址">
        <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          {product.provenance.sourceUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          ))}
          {product.provenance.verifiedAt ? (
            <div style={{ color: 'var(--text-dim)' }}>核對日期：{product.provenance.verifiedAt}</div>
          ) : null}
        </div>
      </Section>
    </>
  )
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 14 }}>
      <span style={{ width: 96, flex: '0 0 96px', color: 'var(--text-dim)' }}>{name}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  )
}
