/**
 * IndexedDB 結構（Dexie）。
 *
 * 規格對照：第 2 節（IndexedDB / Dexie）、第 3 節（五層資料分離）。
 *
 * 第 48.4 節：Dexie 只出現在這一層與 repository，領域邏輯不得 import 本檔。
 */
import Dexie, { type EntityTable } from 'dexie'
import type {
  CompatibilityRule,
  BattleRoundRecord,
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

export const DB_NAME = 'beyblade-x-loadout'
export const DB_SCHEMA_VERSION = 4

/** 第 38 節：新手模式／進階模式。 */
export interface AppSettings {
  mode: 'beginner' | 'advanced'
}

export const DEFAULT_SETTINGS: AppSettings = { mode: 'beginner' }

export interface MetaRow {
  key: string
  value: unknown
}

export interface BeybladeDb extends Dexie {
  // A. Catalog
  parts: EntityTable<Part, 'id'>
  partVariants: EntityTable<PartVariant, 'id'>
  products: EntityTable<Product, 'id'>
  productVariants: EntityTable<ProductVariant, 'id'>
  compatibilityRules: EntityTable<CompatibilityRule, 'id'>
  images: EntityTable<ImageAsset, 'id'>
  // B. Inventory
  ownedProducts: EntityTable<OwnedProduct, 'id'>
  /** 只存單獨購入與手動調整的批次；商品來源的批次由商品即時展開。 */
  inventoryLots: EntityTable<InventoryLot, 'id'>
  partPreferences: EntityTable<PartPreference, 'partId'>
  // C. Saved Combos / D. Decks
  savedCombos: EntityTable<SavedCombo, 'id'>
  decks: EntityTable<Deck, 'id'>
  wishlist: EntityTable<WishlistItem, 'id'>
  /** 使用者自己的逐局紀錄；與公共賽事資料分表，Catalog 更新不得清除。 */
  battleRounds: EntityTable<BattleRoundRecord, 'id'>
  // E. Tournament Data
  tournamentEvents: EntityTable<TournamentEvent, 'id'>
  tournamentDecks: EntityTable<TournamentDeck, 'id'>
  tournamentObservations: EntityTable<TournamentObservation, 'id'>
  // 設定與資料版本
  meta: EntityTable<MetaRow, 'key'>
}

export function createDb(name: string = DB_NAME): BeybladeDb {
  const db = new Dexie(name) as BeybladeDb
  db.version(2).stores({
    parts: 'id, family, system, code',
    partVariants: 'id, partId',
    products: 'id, line, category, sku',
    productVariants: 'id, productId',
    compatibilityRules: 'id, partId',
    images: 'id, [entityType+entityId]',
    ownedProducts: 'id, productId, status',
    inventoryLots: 'id, partId, status, sourceType',
    partPreferences: 'partId, favorite',
    savedCombos: 'id, favorite, physicallyBuilt',
    decks: 'id',
    wishlist: 'id, productId',
    tournamentEvents: 'id, date, country',
    tournamentDecks: 'id, eventId',
    meta: 'key',
  })
  db.version(3).stores({
    parts: 'id, family, system, code',
    partVariants: 'id, partId',
    products: 'id, line, category, sku',
    productVariants: 'id, productId',
    compatibilityRules: 'id, partId',
    images: 'id, [entityType+entityId]',
    ownedProducts: 'id, productId, status',
    inventoryLots: 'id, partId, status, sourceType',
    partPreferences: 'partId, favorite',
    savedCombos: 'id, favorite, physicallyBuilt',
    decks: 'id',
    wishlist: 'id, productId',
    tournamentEvents: 'id, date, country',
    tournamentDecks: 'id, eventId',
    tournamentObservations: 'id, eventId',
    meta: 'key',
  })
  db.version(4).stores({
    parts: 'id, family, system, code',
    partVariants: 'id, partId',
    products: 'id, line, category, sku',
    productVariants: 'id, productId',
    compatibilityRules: 'id, partId',
    images: 'id, [entityType+entityId]',
    ownedProducts: 'id, productId, status',
    inventoryLots: 'id, partId, status, sourceType',
    partPreferences: 'partId, favorite',
    savedCombos: 'id, favorite, physicallyBuilt',
    decks: 'id',
    wishlist: 'id, productId',
    battleRounds: 'id, playedAt, source, evidenceLevel',
    tournamentEvents: 'id, date, country',
    tournamentDecks: 'id, eventId',
    tournamentObservations: 'id, eventId',
    meta: 'key',
  })
  return db
}

/** 模組層級單例，供 UI 使用。測試請用 createDb 建立獨立實例。 */
export const db: BeybladeDb = createDb()
