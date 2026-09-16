/**
 * 庫存領域邏輯（純函式）。
 *
 * 規格對照：第 11 節（數量規則）、第 12 節（庫存來源模型）、第 13 節（Random Booster）、
 * 第 14 節（Set 規則）、第 15 節（商品狀態）、第 16 節（零件狀態）、
 * 第 27 節（來源反查）、第 31 節（實體鎖定）。
 *
 * 第 48.4 節：本檔不得 import Dexie / React / repository。
 */
import {
  USABLE_PART_STATUSES,
  type InventoryLot,
  type OwnedProduct,
  type PartStatus,
  type Product,
  type ProductContent,
  type ProductVariant,
  type SavedCombo,
} from './types.ts'

/* ------------------------------------------------------------ 商品 → 批次 */

/** 第 15 節：商品狀態決定其展開出的零件批次狀態。 */
const LOT_STATUS_BY_PRODUCT_STATUS: Record<OwnedProduct['status'], PartStatus | null> = {
  owned: 'available',
  ordered: 'ordered',
  sold: 'sold',
  // 想買清單還沒買到，不產生任何庫存（第 15、35 節）。
  wishlist: null,
}

export interface ExpandArgs {
  ownedProduct: OwnedProduct
  product: Product
  variants: ProductVariant[]
  now: string
}

/**
 * 把「使用者擁有的商品」展開成零件批次。
 *
 * - 固定內容商品：內含數量 × 盒數（第 11、14 節）。
 * - Random Booster：未拆封不產生批次；已開封只計入所選款式（第 13 節）。
 * - 配件（accessoryName）不進零件庫存，改由 collectAccessories 處理（第 4、14 節）。
 */
export function expandOwnedProductToLots(args: ExpandArgs): InventoryLot[] {
  const { ownedProduct, product, variants, now } = args
  const status = LOT_STATUS_BY_PRODUCT_STATUS[ownedProduct.status]
  if (status === null) return []
  if (ownedProduct.quantity <= 0) return []

  const perPart = new Map<string, number>()
  const order: string[] = []

  const add = (contents: ProductContent[], boxes: number): void => {
    if (boxes <= 0) return
    for (const content of contents) {
      if (!content.partId) continue
      if (content.quantity <= 0) continue
      if (!perPart.has(content.partId)) order.push(content.partId)
      perPart.set(content.partId, (perPart.get(content.partId) ?? 0) + content.quantity * boxes)
    }
  }

  if (product.isRandom) {
    for (const opened of ownedProduct.openedVariants ?? []) {
      const variant = variants.find((v) => v.id === opened.variantId)
      if (!variant) continue
      add(variant.contents, opened.quantity)
    }
  } else {
    add(product.contents, ownedProduct.quantity)
  }

  return order.map((partId) => ({
    id: `${ownedProduct.id}:${partId}`,
    sourceType: 'product' as const,
    sourceId: ownedProduct.id,
    partId,
    quantity: perPart.get(partId) ?? 0,
    status,
    condition: 'new' as const,
    createdAt: now,
  }))
}

export interface AccessoryStock {
  name: string
  quantity: number
}

/** 第 4、14 節：配件進配件庫，不進配裝器。 */
export function collectAccessories(
  entries: { ownedProduct: OwnedProduct; product: Product }[],
): AccessoryStock[] {
  const totals = new Map<string, number>()
  const order: string[] = []
  for (const { ownedProduct, product } of entries) {
    if (LOT_STATUS_BY_PRODUCT_STATUS[ownedProduct.status] === null) continue
    if (ownedProduct.quantity <= 0) continue
    for (const content of product.contents) {
      if (!content.accessoryName) continue
      if (!totals.has(content.accessoryName)) order.push(content.accessoryName)
      totals.set(
        content.accessoryName,
        (totals.get(content.accessoryName) ?? 0) + content.quantity * ownedProduct.quantity,
      )
    }
  }
  return order.map((name) => ({ name, quantity: totals.get(name) ?? 0 }))
}

/* ------------------------------------------------------------------ 驗證 */

export interface ValidateArgs {
  ownedProduct: OwnedProduct
  product: Product
  variants: ProductVariant[]
}

/** 第 13 節：Random Booster 的未拆／已開封盒數必須與總盒數一致。 */
export function validateOwnedProduct(args: ValidateArgs): string[] {
  const { ownedProduct, product, variants } = args
  const errors: string[] = []

  if (ownedProduct.quantity < 0) errors.push('商品數量不可小於 0')

  const opened = ownedProduct.openedVariants ?? []

  if (!product.isRandom && opened.length > 0) {
    errors.push('此商品不是隨機商品，不應有開封紀錄')
  }

  for (const record of opened) {
    if (record.quantity < 0) {
      errors.push(`開封紀錄數量不可小於 0：${record.variantId}`)
    }
    const known = variants.some((v) => v.id === record.variantId && v.productId === product.id)
    if (!known) {
      errors.push(`開封紀錄指向不存在的款式：${record.variantId}`)
    }
  }

  if (product.isRandom) {
    const sealed = ownedProduct.sealedQuantity ?? 0
    if (sealed < 0) errors.push('未拆封盒數不可小於 0')
    const manualOpened = ownedProduct.manualOpenedQuantity ?? 0
    if (manualOpened < 0) errors.push('自行登記的開封盒數不可小於 0')
    const openedTotal = opened.reduce((sum, r) => sum + r.quantity, 0) + manualOpened
    if (sealed + openedTotal !== ownedProduct.quantity) {
      errors.push(
        `未拆封 ${sealed} 盒加上已開封 ${openedTotal} 盒不等於總盒數 ${ownedProduct.quantity} 盒`,
      )
    }
  }

  return errors
}

/* ------------------------------------------------------------------ 聚合 */

export interface PartStock {
  partId: string
  available: number
  ordered: number
  loanedOut: number
  sold: number
  lost: number
  damaged: number
  worn: number
  total: number
}

const EMPTY_STOCK = (partId: string): PartStock => ({
  partId,
  available: 0,
  ordered: 0,
  loanedOut: 0,
  sold: 0,
  lost: 0,
  damaged: 0,
  worn: 0,
  total: 0,
})

const STOCK_FIELD_BY_STATUS: Record<PartStatus, keyof Omit<PartStock, 'partId' | 'total'>> = {
  available: 'available',
  ordered: 'ordered',
  loaned_out: 'loanedOut',
  sold: 'sold',
  lost: 'lost',
  damaged: 'damaged',
  worn: 'worn',
}

/** 第 12 節：畫面顯示的是聚合值。第 16 節：依狀態分列。 */
export function aggregatePartStock(lots: InventoryLot[]): Map<string, PartStock> {
  const result = new Map<string, PartStock>()
  for (const lot of lots) {
    if (lot.quantity === 0) continue
    const stock = result.get(lot.partId) ?? EMPTY_STOCK(lot.partId)
    stock[STOCK_FIELD_BY_STATUS[lot.status]] += lot.quantity
    stock.total += lot.quantity
    result.set(lot.partId, stock)
  }
  return result
}

export function getPartStock(lots: InventoryLot[], partId: string): PartStock {
  return aggregatePartStock(lots.filter((l) => l.partId === partId)).get(partId) ?? EMPTY_STOCK(partId)
}

/** 第 16 節：只有可用狀態能進配裝器／3on3／推薦。 */
export function isUsableStatus(status: PartStatus): boolean {
  return USABLE_PART_STATUSES.includes(status)
}

/* -------------------------------------------------------------- 來源反查 */

export interface PartSourceEntry {
  labelZhTW: string
  sourceType: InventoryLot['sourceType']
  sourceId: string | undefined
  quantity: number
  status: PartStatus
}

export interface DescribeSourcesArgs {
  lots: InventoryLot[]
  partId: string
  /** ownedProductId → 商品中文名稱，用於顯示來源標籤（第 27 節）。 */
  productNameByOwnedId: Record<string, string>
}

const DEFAULT_SOURCE_LABEL: Record<InventoryLot['sourceType'], string> = {
  product: '商品來源',
  standalone_part: '單獨購入',
  manual_adjustment: '手動調整',
}

/** 第 11、27 節：來源必須可追蹤，列出每個來源各貢獻多少。 */
export function describePartSources(args: DescribeSourcesArgs): PartSourceEntry[] {
  const { lots, partId, productNameByOwnedId } = args
  return lots
    .filter((l) => l.partId === partId)
    .map((l) => ({
      labelZhTW:
        l.notes ??
        (l.sourceId ? productNameByOwnedId[l.sourceId] : undefined) ??
        DEFAULT_SOURCE_LABEL[l.sourceType],
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      quantity: l.quantity,
      status: l.status,
    }))
}

/* ------------------------------------------------------------ 實體鎖定 */

/** 第 17 節：配裝會實際占用的槽位。 */
const OCCUPYING_SLOTS = [
  'bladeId',
  'lockChipId',
  'mainBladeId',
  'assistBladeId',
  'ratchetId',
  'bitId',
] as const

/** 第 31 節：只有標記已實際組裝的配裝會占用庫存。 */
export function computePartReservations(combos: SavedCombo[]): Map<string, number> {
  const reservations = new Map<string, number>()
  for (const combo of combos) {
    if (!combo.physicallyBuilt) continue
    for (const slot of OCCUPYING_SLOTS) {
      const partId = combo.slots[slot]
      if (!partId) continue
      reservations.set(partId, (reservations.get(partId) ?? 0) + 1)
    }
  }
  return reservations
}

export interface PartAvailability {
  partId: string
  /** 可用狀態的總數。 */
  available: number
  /** 被實體配裝占用的數量。 */
  reserved: number
  /** 還能再拿去組新配裝的數量，不會小於 0。 */
  free: number
}

export function getPartAvailability(args: {
  lots: InventoryLot[]
  combos: SavedCombo[]
  partId: string
}): PartAvailability {
  const { lots, combos, partId } = args
  const available = getPartStock(lots, partId).available
  const reserved = computePartReservations(combos).get(partId) ?? 0
  return { partId, available, reserved, free: Math.max(0, available - reserved) }
}

/** 一次算出所有零件的可用餘額，供配裝器與 3on3 使用。 */
export function computeAvailabilityMap(
  lots: InventoryLot[],
  combos: SavedCombo[],
): Map<string, PartAvailability> {
  const stock = aggregatePartStock(lots)
  const reservations = computePartReservations(combos)
  const result = new Map<string, PartAvailability>()
  const partIds = new Set<string>([...stock.keys(), ...reservations.keys()])
  for (const partId of partIds) {
    const available = stock.get(partId)?.available ?? 0
    const reserved = reservations.get(partId) ?? 0
    result.set(partId, { partId, available, reserved, free: Math.max(0, available - reserved) })
  }
  return result
}
