/**
 * Repository：唯一允許碰 Dexie 的資料存取層。
 *
 * 規格對照：第 3 節（Catalog 更新不得覆蓋 Inventory）、第 10 節（完整 CRUD）、
 * 第 11–16 節（數量、來源、狀態）、第 13 節（Random Booster 開封）、
 * 第 30、31 節（配裝與實體鎖定）、第 35 節（想買清單）、第 37 節（匯出匯入）、
 * 第 38 節（新手／進階模式）、第 39 節（首頁統計）。
 */
import { checkCompatibility } from '../domain/compatibility.ts'
import { DEFAULT_DECK_RULES, validateDeck } from '../domain/deck.ts'
import {
  aggregatePartStock,
  collectAccessories,
  computeAvailabilityMap,
  describePartSources,
  expandOwnedProductToLots,
  validateOwnedProduct,
  type AccessoryStock,
  type PartAvailability,
  type PartSourceEntry,
  type PartStock,
} from '../domain/inventory.ts'
import { resolveDisplayName } from '../domain/naming.ts'
import type {
  BattleRound,
  CompatibilityRule,
  Deck,
  ImageAsset,
  InventoryLot,
  OwnedProduct,
  Part,
  PartPreference,
  PartVariant,
  Product,
  ProductVariant,
  SavedCombo,
  TournamentDeck,
  TournamentEvent,
  TournamentObservation,
  WishlistItem,
} from '../domain/types.ts'
import { DB_SCHEMA_VERSION, DEFAULT_SETTINGS, type AppSettings, type BeybladeDb } from './db.ts'

export interface CatalogBundle {
  version: string
  /**
   * 舊零件 id → 新零件 id 陣列。
   *
   * 例如 CX 上蓋從「紋章＋主刃合併成一顆」改成拆開兩顆之後，
   * 使用者裝置上已存的庫存批次與配裝還指向舊 id，載入新圖鑑時要照這張表搬過去。
   */
  partIdMigrations?: Record<string, string[]>
  parts: Part[]
  partVariants: PartVariant[]
  products: Product[]
  productVariants: ProductVariant[]
  compatibilityRules: CompatibilityRule[]
  images: ImageAsset[]
  tournamentEvents?: TournamentEvent[]
  tournamentDecks?: TournamentDeck[]
  tournamentObservations?: TournamentObservation[]
}

/** 零件 id 搬遷紀錄，寫在 meta 裡供事後查核。 */
export interface PartIdMigrationRecord {
  catalogVersion: string
  appliedAt: string
  applied: { oldId: string; newIds: string[]; lots: number; combos: number }[]
}

export interface InventorySummary {
  ownedProductCount: number
  bladeCount: number
  ratchetCount: number
  bitCount: number
  comboCount: number
  deckCount: number
}

export interface BackupPayload {
  schemaVersion: number
  catalogVersion: string | null
  ownedProducts: OwnedProduct[]
  inventoryLots: InventoryLot[]
  partPreferences: PartPreference[]
  savedCombos: SavedCombo[]
  decks: Deck[]
  wishlist: WishlistItem[]
  settings: AppSettings
}

export type AddOwnedProductInput = Omit<OwnedProduct, 'id' | 'createdAt'>
export type AddStandalonePartInput = Omit<InventoryLot, 'id' | 'createdAt' | 'sourceType' | 'condition'> &
  Partial<Pick<InventoryLot, 'condition'>>
export type SaveComboInput = Omit<SavedCombo, 'id' | 'createdAt'>
export type SaveDeckInput = Omit<Deck, 'id' | 'createdAt'>
export type AddWishlistInput = Omit<WishlistItem, 'id' | 'createdAt'>

const META_CATALOG_VERSION = 'catalogVersion'
const META_SETTINGS = 'settings'
/** 記下搬遷紀錄，方便事後追查個人資料被改了什麼。 */
const META_PART_ID_MIGRATIONS = 'partIdMigrations'

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

export interface Repository {
  loadCatalog(bundle: CatalogBundle): Promise<void>
  getCatalogVersion(): Promise<string | null>
  getPartIdMigrationRecord(): Promise<PartIdMigrationRecord | null>
  listParts(): Promise<Part[]>
  listProducts(): Promise<Product[]>
  listProductVariants(): Promise<ProductVariant[]>
  listCompatibilityRules(): Promise<CompatibilityRule[]>
  listImages(): Promise<ImageAsset[]>
  listTournamentEvents(): Promise<TournamentEvent[]>
  listTournamentDecks(): Promise<TournamentDeck[]>
  listTournamentObservations(): Promise<TournamentObservation[]>

  listOwnedProducts(): Promise<OwnedProduct[]>
  addOwnedProduct(input: AddOwnedProductInput): Promise<string>
  updateOwnedProduct(id: string, patch: Partial<AddOwnedProductInput>): Promise<void>
  deleteOwnedProduct(id: string): Promise<void>
  openRandomBooster(ownedProductId: string, variantId: string, quantity: number): Promise<void>
  recordOpenedContents(
    ownedProductId: string,
    boxes: number,
    contents: { partId: string; quantity: number }[],
  ): Promise<void>

  addStandalonePart(input: AddStandalonePartInput): Promise<string>
  updateStandalonePart(id: string, patch: Partial<InventoryLot>): Promise<void>
  deleteStandalonePart(id: string): Promise<void>

  getAllLots(): Promise<InventoryLot[]>
  listPartPreferences(): Promise<PartPreference[]>
  updatePartPreference(partId: string, patch: Partial<Omit<PartPreference, 'partId'>>): Promise<void>
  getPartStockMap(): Promise<Map<string, PartStock>>
  getAvailabilityMap(): Promise<Map<string, PartAvailability>>
  describeSources(partId: string): Promise<PartSourceEntry[]>
  listAccessories(): Promise<AccessoryStock[]>
  getInventorySummary(): Promise<InventorySummary>

  listCombos(): Promise<SavedCombo[]>
  saveCombo(input: SaveComboInput): Promise<string>
  updateCombo(id: string, patch: Partial<SaveComboInput>): Promise<void>
  deleteCombo(id: string): Promise<void>

  listBattleRounds(): Promise<BattleRound[]>
  saveBattleRound(input: Omit<BattleRound, 'id' | 'createdAt'>): Promise<string>
  deleteBattleRound(id: string): Promise<void>

  listDecks(): Promise<Deck[]>
  saveDeck(input: SaveDeckInput): Promise<string>
  updateDeck(id: string, patch: Partial<SaveDeckInput>): Promise<void>
  deleteDeck(id: string): Promise<void>

  listWishlist(): Promise<WishlistItem[]>
  addWishlistItem(input: AddWishlistInput): Promise<string>
  deleteWishlistItem(id: string): Promise<void>

  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<void>

  exportBackup(): Promise<BackupPayload>
  importBackup(payload: BackupPayload): Promise<void>
}

export function createRepository(db: BeybladeDb): Repository {
  /** 商品來源的批次是即時展開的，確保商品數量一改，零件聚合立刻同步。 */
  async function derivedLots(): Promise<InventoryLot[]> {
    const [ownedProducts, products, variants] = await Promise.all([
      db.ownedProducts.toArray(),
      db.products.toArray(),
      db.productVariants.toArray(),
    ])
    const productById = new Map(products.map((product) => [product.id, product]))
    const lots: InventoryLot[] = []
    for (const ownedProduct of ownedProducts) {
      const product = productById.get(ownedProduct.productId)
      if (!product) continue
      lots.push(
        ...expandOwnedProductToLots({
          ownedProduct,
          product,
          variants: variants.filter((variant) => variant.productId === product.id),
          now: ownedProduct.createdAt,
        }),
      )
    }
    return lots
  }

  async function allLots(): Promise<InventoryLot[]> {
    const [derived, standalone] = await Promise.all([derivedLots(), db.inventoryLots.toArray()])
    return [...derived, ...standalone]
  }

  async function requireProduct(productId: string): Promise<Product> {
    const product = await db.products.get(productId)
    if (!product) throw new Error(`找不到商品：${productId}`)
    return product
  }

  /**
   * 零件 id 搬遷（第 3 節：Catalog 更新不得弄丟個人資料）。
   *
   * 圖鑑結構改變時（例如 CX 上蓋從合併一顆改成紋章＋主刃兩顆），舊 id 會消失。
   * 商品展開出來的批次會自己跟著新的商品內容重算，但這三種個人資料是直接記 id 的：
   *  - inventoryLots：單獨新增與開封登記的批次，一筆要拆成多筆
   *  - savedCombos：配裝的槽位，主刃要拆成鎖定紋章 + 主刃
   *  - partPreferences：收藏與備註
   *
   * 只有「舊 id 在新圖鑑裡真的不存在」才搬，所以重複載入同一份圖鑑不會重複搬。
   */
  async function migratePartIds(bundle: CatalogBundle): Promise<void> {
    const migrations = bundle.partIdMigrations
    if (!migrations || Object.keys(migrations).length === 0) return

    const partById = new Map(bundle.parts.map((part) => [part.id, part]))
    const applicable = new Map<string, string[]>()
    for (const [oldId, newIds] of Object.entries(migrations)) {
      // 舊 id 還在就不動；新 id 必須都存在，否則寧可不搬也不要指到空零件。
      if (partById.has(oldId)) continue
      if (newIds.length === 0 || newIds.some((id) => !partById.has(id))) continue
      applicable.set(oldId, newIds)
    }
    if (applicable.size === 0) return

    const slotForFamily = (family: string): keyof SavedCombo['slots'] | null => {
      if (family === 'lock_chip') return 'lockChipId'
      if (family === 'main_blade') return 'mainBladeId'
      if (family === 'over_blade') return 'overBladeId'
      if (family === 'assist_blade') return 'assistBladeId'
      return null
    }

    const applied: { oldId: string; newIds: string[]; lots: number; combos: number }[] = []

    await db.transaction('rw', [db.inventoryLots, db.savedCombos, db.partPreferences, db.meta], async () => {
      for (const [oldId, newIds] of applicable) {
        const lots = await db.inventoryLots.where('partId').equals(oldId).toArray()
        for (const lot of lots) {
          await db.inventoryLots.delete(lot.id)
          await db.inventoryLots.bulkAdd(
            newIds.map((newId) => ({
              ...lot,
              id: `${lot.id}:${newId}`,
              partId: newId,
              notes: lot.notes ?? '圖鑑結構更新時由合併零件拆出',
            })),
          )
        }

        const combos = await db.savedCombos.toArray()
        let touchedCombos = 0
        for (const combo of combos) {
          const usedSlots = (Object.keys(combo.slots) as (keyof SavedCombo['slots'])[]).filter(
            (key) => combo.slots[key] === oldId,
          )
          if (usedSlots.length === 0) continue
          const slots = { ...combo.slots }
          for (const key of usedSlots) delete slots[key]
          for (const newId of newIds) {
            const family = partById.get(newId)?.family
            const slotKey = family ? slotForFamily(family) : null
            if (slotKey) slots[slotKey] = newId
          }
          await db.savedCombos.put({ ...combo, slots })
          touchedCombos += 1
        }

        const preference = await db.partPreferences.get(oldId)
        if (preference) {
          await db.partPreferences.delete(oldId)
          await db.partPreferences.bulkPut(
            newIds.map((newId) => ({ ...preference, partId: newId })),
          )
        }

        applied.push({ oldId, newIds, lots: lots.length, combos: touchedCombos })
      }

      if (applied.length > 0) {
        await db.meta.put({
          key: META_PART_ID_MIGRATIONS,
          value: { catalogVersion: bundle.version, appliedAt: new Date().toISOString(), applied },
        })
      }
    })
  }

  async function assertOwnedProductValid(ownedProduct: OwnedProduct): Promise<void> {
    const product = await requireProduct(ownedProduct.productId)
    const variants = await db.productVariants.where('productId').equals(product.id).toArray()
    const errors = validateOwnedProduct({ ownedProduct, product, variants })
    if (errors.length > 0) throw new Error(errors.join('；'))
  }

  /** 第 18 節：無法安裝的配裝不可儲存。第 31 節：實體鎖定要有足夠可用庫存。 */
  async function assertComboSavable(combo: SavedCombo, excludeComboId?: string): Promise<void> {
    const [parts, rules] = await Promise.all([
      db.parts.toArray(),
      db.compatibilityRules.toArray(),
    ])
    const result = checkCompatibility({ slots: combo.slots, parts, rules })
    if (!result.ok) {
      throw new Error(
        `${result.headlineZhTW ?? ''}${result.errors.map((e) => e.messageZhTW).join('；')}`,
      )
    }
    if (!combo.physicallyBuilt) return

    const existing = (await db.savedCombos.toArray()).filter((row) => row.id !== excludeComboId)
    const availability = computeAvailabilityMap(await allLots(), existing)
    const needed = new Map<string, number>()
    for (const partId of Object.values(combo.slots)) {
      if (!partId) continue
      needed.set(partId, (needed.get(partId) ?? 0) + 1)
    }
    const partById = new Map(parts.map((part) => [part.id, part]))
    const shortages: string[] = []
    for (const [partId, required] of needed) {
      const free = availability.get(partId)?.free ?? 0
      if (free >= required) continue
      const part = partById.get(partId)
      const label = part ? resolveDisplayName(part.naming).titleZhTW : partId
      shortages.push(`${label} 需要 ${required} 個，可用只有 ${free} 個`)
    }
    if (shortages.length > 0) {
      throw new Error(`可用庫存不足，無法標記為已實際組裝：${shortages.join('；')}`)
    }
  }

  /**
   * 第 32 節：3on3 不能只依賴畫面上的推薦器檢查。
   * 匯入備份、未來其他 UI 或直接呼叫 repository 時，同樣必須擋下
   * 配裝遺失、數量不足或不相容的隊伍。
   */
  async function assertDeckSavable(comboIds: string[]): Promise<void> {
    if (comboIds.length !== DEFAULT_DECK_RULES.teamSize) {
      throw new Error(`隊伍必須剛好有 ${DEFAULT_DECK_RULES.teamSize} 套配裝`)
    }

    const [combos, parts, rules, lots] = await Promise.all([
      db.savedCombos.toArray(),
      db.parts.toArray(),
      db.compatibilityRules.toArray(),
      allLots(),
    ])
    const comboById = new Map(combos.map((combo) => [combo.id, combo]))
    const selected = comboIds.map((id) => comboById.get(id))
    const missingId = comboIds.find((_id, index) => !selected[index])
    if (missingId) throw new Error(`找不到配裝：${missingId}`)

    const validation = validateDeck({
      slotsList: selected.map((combo) => combo!.slots),
      parts,
      rules,
      lots,
      combos,
      ruleSet: DEFAULT_DECK_RULES,
    })
    if (!validation.ok) throw new Error(`無法儲存 3on3：${validation.errorsZhTW.join('；')}`)
  }

  async function getMeta<T>(key: string): Promise<T | null> {
    const row = await db.meta.get(key)
    return row ? (row.value as T) : null
  }

  return {
    /* ------------------------------------------------------------ Catalog */

    async loadCatalog(bundle) {
      // 只清 Catalog 相關表，個人資料表完全不動（第 3 節）。
      await db.transaction(
        'rw',
        [db.parts, db.partVariants, db.products, db.productVariants, db.compatibilityRules, db.images, db.tournamentEvents, db.tournamentDecks, db.tournamentObservations, db.meta],
        async () => {
          await Promise.all([
            db.parts.clear(),
            db.partVariants.clear(),
            db.products.clear(),
            db.productVariants.clear(),
            db.compatibilityRules.clear(),
            db.images.clear(),
            db.tournamentEvents.clear(),
            db.tournamentDecks.clear(),
            db.tournamentObservations.clear(),
          ])
          await Promise.all([
            db.parts.bulkPut(bundle.parts),
            db.partVariants.bulkPut(bundle.partVariants),
            db.products.bulkPut(bundle.products),
            db.productVariants.bulkPut(bundle.productVariants),
            db.compatibilityRules.bulkPut(bundle.compatibilityRules),
            db.images.bulkPut(bundle.images),
            db.tournamentEvents.bulkPut(bundle.tournamentEvents ?? []),
            db.tournamentDecks.bulkPut(bundle.tournamentDecks ?? []),
            db.tournamentObservations.bulkPut(bundle.tournamentObservations ?? []),
          ])
          await db.meta.put({ key: META_CATALOG_VERSION, value: bundle.version })
        },
      )

      await migratePartIds(bundle)
    },

    getCatalogVersion: () => getMeta<string>(META_CATALOG_VERSION),
    getPartIdMigrationRecord: () => getMeta<PartIdMigrationRecord>(META_PART_ID_MIGRATIONS),
    listParts: () => db.parts.toArray(),
    listProducts: () => db.products.toArray(),
    listProductVariants: () => db.productVariants.toArray(),
    listCompatibilityRules: () => db.compatibilityRules.toArray(),
    listImages: () => db.images.toArray(),
    listTournamentEvents: () => db.tournamentEvents.toArray(),
    listTournamentDecks: () => db.tournamentDecks.toArray(),
    listTournamentObservations: () => db.tournamentObservations.toArray(),

    /* ---------------------------------------------------------- 我的商品 */

    listOwnedProducts: () => db.ownedProducts.toArray(),

    async addOwnedProduct(input) {
      const product = await requireProduct(input.productId)
      const ownedProduct: OwnedProduct = {
        id: newId(),
        createdAt: nowIso(),
        ...input,
        // 隨機商品預設全部未拆封（第 13 節）。
        ...(product.isRandom && input.sealedQuantity === undefined
          ? { sealedQuantity: input.quantity }
          : {}),
      }
      await assertOwnedProductValid(ownedProduct)
      await db.ownedProducts.add(ownedProduct)
      return ownedProduct.id
    },

    async updateOwnedProduct(id, patch) {
      const existing = await db.ownedProducts.get(id)
      if (!existing) throw new Error(`找不到我的商品：${id}`)
      const product = await requireProduct(existing.productId)
      const merged: OwnedProduct = { ...existing, ...patch }
      if (product.isRandom && patch.quantity !== undefined && patch.sealedQuantity === undefined) {
        const openedTotal = (merged.openedVariants ?? []).reduce((sum, r) => sum + r.quantity, 0)
        merged.sealedQuantity = Math.max(0, patch.quantity - openedTotal)
      }
      await assertOwnedProductValid(merged)
      await db.ownedProducts.put(merged)
    },

    async deleteOwnedProduct(id) {
      // 連帶清掉開封登記產生的批次，避免留下孤兒庫存。
      await db.transaction('rw', [db.ownedProducts, db.inventoryLots], async () => {
        await db.ownedProducts.delete(id)
        await db.inventoryLots.where('sourceType').equals('product').and((lot) => lot.sourceId === id).delete()
      })
    },

    async openRandomBooster(ownedProductId, variantId, quantity) {
      const owned = await db.ownedProducts.get(ownedProductId)
      if (!owned) throw new Error(`找不到我的商品：${ownedProductId}`)
      const product = await requireProduct(owned.productId)
      if (!product.isRandom) throw new Error('此商品不是隨機商品，不需要開封流程')
      const variant = await db.productVariants.get(variantId)
      if (!variant || variant.productId !== product.id) {
        throw new Error(`找不到款式：${variantId}`)
      }
      if (quantity <= 0) throw new Error('開封數量必須大於 0')
      const sealed = owned.sealedQuantity ?? 0
      if (quantity > sealed) throw new Error('開封數量不可超過未拆封盒數')

      const openedVariants = [...(owned.openedVariants ?? [])]
      const index = openedVariants.findIndex((row) => row.variantId === variantId)
      if (index >= 0) {
        openedVariants[index] = {
          variantId,
          quantity: openedVariants[index]!.quantity + quantity,
        }
      } else {
        openedVariants.push({ variantId, quantity })
      }

      const merged: OwnedProduct = {
        ...owned,
        sealedQuantity: sealed - quantity,
        openedVariants,
      }
      await assertOwnedProductValid(merged)
      await db.ownedProducts.put(merged)
    },

    /**
     * 第 13 節：官方沒有公布款式清單時，使用者直接登記實際抽到的零件。
     * 不猜內容、不套用其他盒的結果，只記使用者說他抽到什麼。
     */
    async recordOpenedContents(ownedProductId, boxes, contents) {
      const owned = await db.ownedProducts.get(ownedProductId)
      if (!owned) throw new Error(`找不到我的商品：${ownedProductId}`)
      const product = await requireProduct(owned.productId)
      if (!product.isRandom) throw new Error('此商品不是隨機商品，不需要開封流程')
      if (boxes <= 0) throw new Error('開封盒數必須大於 0')
      const sealed = owned.sealedQuantity ?? 0
      if (boxes > sealed) throw new Error('開封數量不可超過未拆封盒數')
      const valid = contents.filter((row) => row.quantity > 0)
      if (valid.length === 0) throw new Error('請至少登記一個實際抽到的零件')
      for (const row of valid) {
        const part = await db.parts.get(row.partId)
        if (!part) throw new Error(`找不到零件：${row.partId}`)
      }

      const merged: OwnedProduct = {
        ...owned,
        sealedQuantity: sealed - boxes,
        manualOpenedQuantity: (owned.manualOpenedQuantity ?? 0) + boxes,
      }
      await assertOwnedProductValid(merged)

      const createdAt = nowIso()
      await db.transaction('rw', [db.ownedProducts, db.inventoryLots], async () => {
        await db.ownedProducts.put(merged)
        await db.inventoryLots.bulkAdd(
          valid.map((row) => ({
            id: newId(),
            sourceType: 'product' as const,
            sourceId: ownedProductId,
            partId: row.partId,
            quantity: row.quantity,
            status: 'available' as const,
            condition: 'new' as const,
            notes: '開封登記',
            createdAt,
          })),
        )
      })
    },

    /* ---------------------------------------------------------- 我的零件 */

    async addStandalonePart(input) {
      const part = await db.parts.get(input.partId)
      if (!part) throw new Error(`找不到零件：${input.partId}`)
      if (input.quantity < 0) throw new Error('零件數量不可小於 0')
      const lot: InventoryLot = {
        id: newId(),
        sourceType: 'standalone_part',
        condition: 'new',
        createdAt: nowIso(),
        ...input,
      }
      await db.inventoryLots.add(lot)
      return lot.id
    },

    async updateStandalonePart(id, patch) {
      const existing = await db.inventoryLots.get(id)
      if (!existing) throw new Error(`找不到零件批次：${id}`)
      const merged = { ...existing, ...patch, id: existing.id }
      if (merged.quantity < 0) throw new Error('零件數量不可小於 0')
      await db.inventoryLots.put(merged)
    },

    async deleteStandalonePart(id) {
      await db.inventoryLots.delete(id)
    },

    /* ------------------------------------------------------------ 聚合 */

  getAllLots: allLots,

    listPartPreferences: () => db.partPreferences.toArray(),

    async updatePartPreference(partId, patch) {
      const part = await db.parts.get(partId)
      if (!part) throw new Error(`找不到零件：${partId}`)
      const existing = await db.partPreferences.get(partId)
      const notes =
        patch.notes === undefined ? existing?.notes : patch.notes.trim() || undefined
      const preference: PartPreference = {
        partId,
        favorite: patch.favorite ?? existing?.favorite ?? false,
        ...(notes ? { notes } : {}),
      }
      if (!preference.favorite && !preference.notes) {
        await db.partPreferences.delete(partId)
      } else {
        await db.partPreferences.put(preference)
      }
    },

    async getPartStockMap() {
      return aggregatePartStock(await allLots())
    },

    async getAvailabilityMap() {
      const [lots, combos] = await Promise.all([allLots(), db.savedCombos.toArray()])
      return computeAvailabilityMap(lots, combos)
    },

    async describeSources(partId) {
      const [lots, ownedProducts, products] = await Promise.all([
        allLots(),
        db.ownedProducts.toArray(),
        db.products.toArray(),
      ])
      const productById = new Map(products.map((product) => [product.id, product]))
      const productNameByOwnedId: Record<string, string> = {}
      for (const owned of ownedProducts) {
        const product = productById.get(owned.productId)
        if (!product) continue
        productNameByOwnedId[owned.id] = resolveDisplayName(product.naming).titleZhTW
      }
      return describePartSources({ lots, partId, productNameByOwnedId })
    },

    async listAccessories() {
      const [ownedProducts, products] = await Promise.all([
        db.ownedProducts.toArray(),
        db.products.toArray(),
      ])
      const productById = new Map(products.map((product) => [product.id, product]))
      return collectAccessories(
        ownedProducts
          .map((ownedProduct) => ({
            ownedProduct,
            product: productById.get(ownedProduct.productId),
          }))
          .filter((row): row is { ownedProduct: OwnedProduct; product: Product } =>
            Boolean(row.product),
          ),
      )
    },

    async getInventorySummary() {
      const [stock, parts, ownedProductCount, comboCount, deckCount] = await Promise.all([
        aggregatePartStock(await allLots()),
        db.parts.toArray(),
        db.ownedProducts.count(),
        db.savedCombos.count(),
        db.decks.count(),
      ])
      const familyById = new Map(parts.map((part) => [part.id, part.family]))
      const sumBy = (families: string[]): number => {
        let total = 0
        for (const [partId, row] of stock) {
          const family = familyById.get(partId)
          if (family && families.includes(family)) total += row.available
        }
        return total
      }
      return {
        ownedProductCount,
        bladeCount: sumBy(['blade', 'main_blade', 'integrated_blade']),
        ratchetCount: sumBy(['ratchet']),
        bitCount: sumBy(['bit']),
        comboCount,
        deckCount,
      }
    },

    /* ------------------------------------------------------------ 配裝 */

    listCombos: () => db.savedCombos.toArray(),

    async saveCombo(input) {
      const combo: SavedCombo = { id: newId(), createdAt: nowIso(), ...input }
      await assertComboSavable(combo)
      await db.savedCombos.add(combo)
      return combo.id
    },

    async updateCombo(id, patch) {
      const existing = await db.savedCombos.get(id)
      if (!existing) throw new Error(`找不到配裝：${id}`)
      const merged: SavedCombo = { ...existing, ...patch }
      await assertComboSavable(merged, id)
      await db.savedCombos.put(merged)
    },

    async deleteCombo(id) {
      await db.savedCombos.delete(id)
    },

    /* -------------------------------------------------------- 個人對戰紀錄 */

    listBattleRounds: () => db.battleRounds.toArray(),

    async saveBattleRound(input) {
      const round: BattleRound = { id: newId(), createdAt: nowIso(), ...input }
      await db.battleRounds.add(round)
      return round.id
    },

    async deleteBattleRound(id) {
      await db.battleRounds.delete(id)
    },

    /* ------------------------------------------------------------- 3on3 */

    listDecks: () => db.decks.toArray(),

    async saveDeck(input) {
      const deck: Deck = { id: newId(), createdAt: nowIso(), ...input }
      await assertDeckSavable(deck.comboIds)
      await db.decks.add(deck)
      return deck.id
    },

    async updateDeck(id, patch) {
      const existing = await db.decks.get(id)
      if (!existing) throw new Error(`找不到隊伍：${id}`)
      const merged = { ...existing, ...patch }
      await assertDeckSavable(merged.comboIds)
      await db.decks.put(merged)
    },

    async deleteDeck(id) {
      await db.decks.delete(id)
    },

    /* -------------------------------------------------------- 想買清單 */

    listWishlist: () => db.wishlist.toArray(),

    async addWishlistItem(input) {
      await requireProduct(input.productId)
      const item: WishlistItem = { id: newId(), createdAt: nowIso(), ...input }
      await db.wishlist.add(item)
      return item.id
    },

    async deleteWishlistItem(id) {
      await db.wishlist.delete(id)
    },

    /* ------------------------------------------------------------- 設定 */

    async getSettings() {
      return (await getMeta<AppSettings>(META_SETTINGS)) ?? DEFAULT_SETTINGS
    },

    async updateSettings(patch) {
      const current = (await getMeta<AppSettings>(META_SETTINGS)) ?? DEFAULT_SETTINGS
      await db.meta.put({ key: META_SETTINGS, value: { ...current, ...patch } })
    },

    /* -------------------------------------------------------- 匯出匯入 */

    async exportBackup() {
      const [
        ownedProducts,
        inventoryLots,
        partPreferences,
        savedCombos,
        decks,
        wishlist,
        settings,
        catalogVersion,
      ] =
        await Promise.all([
          db.ownedProducts.toArray(),
          db.inventoryLots.toArray(),
          db.partPreferences.toArray(),
          db.savedCombos.toArray(),
          db.decks.toArray(),
          db.wishlist.toArray(),
          (async () => (await getMeta<AppSettings>(META_SETTINGS)) ?? DEFAULT_SETTINGS)(),
          getMeta<string>(META_CATALOG_VERSION),
        ])
      return {
        schemaVersion: DB_SCHEMA_VERSION,
        catalogVersion,
        ownedProducts,
        inventoryLots,
        partPreferences,
        savedCombos,
        decks,
        wishlist,
        settings,
      }
    },

    async importBackup(payload) {
      if (!payload || typeof payload !== 'object' || typeof payload.schemaVersion !== 'number') {
        throw new Error('備份格式不正確')
      }
      if (payload.schemaVersion > DB_SCHEMA_VERSION) {
        throw new Error(`備份版本過新（${payload.schemaVersion}），請先更新 App`)
      }
      const arrays: [string, unknown][] = [
        ['ownedProducts', payload.ownedProducts],
        ['inventoryLots', payload.inventoryLots],
        // schema v1 的備份還沒有個人零件標記，匯入時保留為空即可。
        ['partPreferences', payload.partPreferences ?? []],
        ['savedCombos', payload.savedCombos],
        ['decks', payload.decks],
        ['wishlist', payload.wishlist],
      ]
      for (const [name, value] of arrays) {
        if (!Array.isArray(value)) throw new Error(`備份格式不正確：${name} 不是陣列`)
      }

      await db.transaction(
        'rw',
        [
          db.ownedProducts,
          db.inventoryLots,
          db.partPreferences,
          db.savedCombos,
          db.decks,
          db.wishlist,
          db.meta,
        ],
        async () => {
          await Promise.all([
            db.ownedProducts.clear(),
            db.inventoryLots.clear(),
            db.partPreferences.clear(),
            db.savedCombos.clear(),
            db.decks.clear(),
            db.wishlist.clear(),
          ])
          await Promise.all([
            db.ownedProducts.bulkAdd(payload.ownedProducts),
            db.inventoryLots.bulkAdd(payload.inventoryLots),
            db.partPreferences.bulkAdd(payload.partPreferences ?? []),
            db.savedCombos.bulkAdd(payload.savedCombos),
            db.decks.bulkAdd(payload.decks),
            db.wishlist.bulkAdd(payload.wishlist),
          ])
          if (payload.settings) {
            await db.meta.put({ key: META_SETTINGS, value: payload.settings })
          }
        },
      )
    },
  }
}
