/**
 * 商品詳情（商品反查）。
 *
 * 規格對照：第 28 節（商品反查必備欄位）、第 8 節（Random Booster 款式）、
 * 第 25 節（圖片 fallback）、第 41 節（來源網址）。
 */
import { useEffect, useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { accessoryDisplayNameZhTW } from '../../domain/inventory.ts'
import { formatPartLabel, formatProductLabel, resolveDisplayName } from '../../domain/naming.ts'
import { OWNED_PRODUCT_STATUS_ZH, type OwnedProduct } from '../../domain/types.ts'
import { Link } from '../router.tsx'
import {
  Badge,
  CatalogTitle,
  EmptyState,
  PageHeader,
  PartThumb,
  Quantity,
  Row,
  Section,
} from '../components/ui.tsx'
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
        <PageHeader title="商品詳情" backTo="/products" backLabelZhTW="商品" />
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
      <PageHeader
        title={label.titleZhTW}
        description={label.categoryZhTW}
        backTo="/products"
        backLabelZhTW="商品"
      />

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
            title={product.isRandom ? '隨機商品沒有固定內容' : '官方尚未公布內含零件'}
            hint={
              product.isRandom
                ? '每盒只會抽到下方「所有可能款式」其中一款；開封後可在「我的商品」登記實際抽到的內容。'
                : '官方商品一覽只列商品名稱，套裝內含哪幾顆沒有公布；社群圖鑑也還原不出完整清單，所以這裡留空而不是猜一組。'
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {product.contents.map((content, index) => {
              if (content.accessoryName) {
                /*
                  accessoryName 是日文官方名，前台不得渲染（第 1.4 節）。
                  顯示走 accessoryDisplayNameZhTW：有中文名用中文名，
                  查不到退回分類，絕不退回日文。
                */
                const shown = accessoryDisplayNameZhTW({
                  name: content.accessoryName,
                  ...(content.accessoryNameZhTW ? { nameZhTW: content.accessoryNameZhTW } : {}),
                  ...(content.accessoryTypeZhTW ? { typeZhTW: content.accessoryTypeZhTW } : {}),
                  quantity: content.quantity,
                })
                return (
                  <div className="card" key={`${content.accessoryName}-${index}`}>
                    <Row>
                      <PartThumb code="" nameZhTW={shown} />
                      <span style={{ flex: 1 }}>{shown}</span>
                      <Badge>{content.accessoryTypeZhTW ?? '配件'}</Badge>
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
                        if (part) return resolveDisplayName(part.naming).titleZhTW
                        // 同樣不能漏出日文原名。
                        return content.accessoryName
                          ? accessoryDisplayNameZhTW({
                              name: content.accessoryName,
                              ...(content.accessoryNameZhTW
                                ? { nameZhTW: content.accessoryNameZhTW }
                                : {}),
                              ...(content.accessoryTypeZhTW
                                ? { typeZhTW: content.accessoryTypeZhTW }
                                : {}),
                              quantity: content.quantity,
                            })
                          : undefined
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

      {/*
        我的數量原本只是唯讀清單，要改盒數得先回商品頁再找到那張卡。
        既然已經站在這個商品的頁面上，就在這裡直接改。
      */}
      <Section title="我的數量">
        {mine.length === 0 ? (
          <EmptyState
            title="還沒有登記這個商品"
            hint="到「商品」的商品庫找到它，按「加入」就會出現在這裡。"
            action={
              <Link to="/products" className="btn btn-primary">
                去登記
              </Link>
            }
          />
        ) : (
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <Field name="總盒數">{totalQuantity}</Field>
            {mine.map((owned) => (
              <OwnedRow key={owned.id} owned={owned} isRandom={product.isRandom} />
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

/**
 * 單一筆持有紀錄，可以直接改盒數與備註。
 *
 * 備註用 onBlur 才寫入，不要每打一個字就寫 IndexedDB。
 */
function OwnedRow({ owned, isRandom }: { owned: OwnedProduct; isRandom: boolean }) {
  const run = useAppStore((state) => state.run)
  const [notes, setNotes] = useState(owned.notes ?? '')
  // 別的頁面改了備註時要跟上，否則這裡會一直顯示進入頁面那一刻的舊值。
  useEffect(() => setNotes(owned.notes ?? ''), [owned.notes])

  const openedTotal =
    (owned.openedVariants ?? []).reduce((sum, row) => sum + row.quantity, 0) +
    (owned.manualOpenedQuantity ?? 0)

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <Row>
        <span style={{ flex: 1, fontSize: 14 }}>{OWNED_PRODUCT_STATUS_ZH[owned.status]}</span>
        <Quantity
          testId="detail-owned-qty"
          label={`${OWNED_PRODUCT_STATUS_ZH[owned.status]} 盒數`}
          value={owned.quantity}
          onChange={(next) => void run(() => repo.updateOwnedProduct(owned.id, { quantity: next }))}
        />
      </Row>
      {isRandom ? (
        <div className="meta">
          未拆封 {owned.sealedQuantity ?? 0} 盒 ・ 已拆封 {openedTotal} 盒
        </div>
      ) : null}
      <details open={Boolean(owned.notes)}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ink-dim)' }}>
          備註{owned.notes ? '' : '（空白）'}
        </summary>
        <textarea
          className="field"
          style={{ marginTop: 8 }}
          aria-label="這筆持有紀錄的備註"
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
    </div>
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
