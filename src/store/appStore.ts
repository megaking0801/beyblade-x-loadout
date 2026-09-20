/**
 * 全域狀態（Zustand）。
 *
 * 規格對照：第 2 節（狀態管理）、第 3 節（資料分層）、第 38 節（新手／進階模式）。
 *
 * 這一層只負責「呼叫 repository、把結果放進 state」。所有判斷都在 domain 層。
 */
import { create } from 'zustand'
import { catalog, catalogAudit, catalogMeta } from '../catalog/index.ts'
import { db, type AppSettings } from '../data/db.ts'
import { createRepository, type Repository } from '../data/repository.ts'
import type { AccessoryStock, PartAvailability, PartStock } from '../domain/inventory.ts'
import type {
  CompatibilityRule,
  BattleRoundRecord,
  Deck,
  ImageAsset,
  InventoryLot,
  OwnedProduct,
  Part,
  PartPreference,
  Product,
  ProductVariant,
  SavedCombo,
  TournamentDeck,
  TournamentEvent,
  TournamentObservation,
  WishlistItem,
} from '../domain/types.ts'
import type { InventorySummary } from '../data/repository.ts'

export const repo: Repository = createRepository(db)

export interface AppState {
  ready: boolean
  errorZhTW: string | null
  settings: AppSettings

  parts: Part[]
  products: Product[]
  productVariants: ProductVariant[]
  rules: CompatibilityRule[]
  images: ImageAsset[]
  tournamentEvents: TournamentEvent[]
  tournamentDecks: TournamentDeck[]
  tournamentObservations: TournamentObservation[]

  ownedProducts: OwnedProduct[]
  lots: InventoryLot[]
  partPreferences: PartPreference[]
  stock: Map<string, PartStock>
  availability: Map<string, PartAvailability>
  accessories: AccessoryStock[]
  combos: SavedCombo[]
  decks: Deck[]
  wishlist: WishlistItem[]
  battleRounds: BattleRoundRecord[]
  summary: InventorySummary

  catalogVersion: string | null

  init: () => Promise<void>
  refresh: () => Promise<void>
  run: (action: () => Promise<unknown>) => Promise<boolean>
  setMode: (mode: AppSettings['mode']) => Promise<void>
  clearError: () => void
}

const EMPTY_SUMMARY: InventorySummary = {
  ownedProductCount: 0,
  bladeCount: 0,
  ratchetCount: 0,
  bitCount: 0,
  comboCount: 0,
  deckCount: 0,
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  errorZhTW: null,
  settings: { mode: 'beginner' },

  parts: [],
  products: [],
  productVariants: [],
  rules: [],
  images: [],
  tournamentEvents: [],
  tournamentDecks: [],
  tournamentObservations: [],

  ownedProducts: [],
  lots: [],
  partPreferences: [],
  stock: new Map(),
  availability: new Map(),
  accessories: [],
  combos: [],
  decks: [],
  wishlist: [],
  battleRounds: [],
  summary: EMPTY_SUMMARY,

  catalogVersion: null,

  async init() {
    try {
      const installedVersion = await repo.getCatalogVersion()
      // Catalog 更新只換公共資料，個人庫存完全不動（第 3 節）。
      if (installedVersion !== catalog.version) {
        await repo.loadCatalog(catalog)
      }
      await get().refresh()
      set({ ready: true })
    } catch (error) {
      set({ ready: true, errorZhTW: toMessage(error) })
    }
  },

  async refresh() {
    const [
      settings,
      parts,
      products,
      productVariants,
      rules,
      images,
      tournamentEvents,
      tournamentDecks,
      tournamentObservations,
      ownedProducts,
      lots,
      partPreferences,
      stock,
      availability,
      accessories,
      combos,
      decks,
      wishlist,
      battleRounds,
      summary,
      catalogVersion,
    ] = await Promise.all([
      repo.getSettings(),
      repo.listParts(),
      repo.listProducts(),
      repo.listProductVariants(),
      repo.listCompatibilityRules(),
      repo.listImages(),
      repo.listTournamentEvents(),
      repo.listTournamentDecks(),
      repo.listTournamentObservations(),
      repo.listOwnedProducts(),
      repo.getAllLots(),
      repo.listPartPreferences(),
      repo.getPartStockMap(),
      repo.getAvailabilityMap(),
      repo.listAccessories(),
      repo.listCombos(),
      repo.listDecks(),
      repo.listWishlist(),
      repo.listBattleRounds(),
      repo.getInventorySummary(),
      repo.getCatalogVersion(),
    ])
    set({
      settings,
      parts,
      products,
      productVariants,
      rules,
      images,
      tournamentEvents,
      tournamentDecks,
      tournamentObservations,
      ownedProducts,
      lots,
      partPreferences,
      stock,
      availability,
      accessories,
      combos,
      decks,
      wishlist,
      battleRounds,
      summary,
      catalogVersion,
    })
  },

  async run(action) {
    set({ errorZhTW: null })
    try {
      await action()
      await get().refresh()
      return true
    } catch (error) {
      set({ errorZhTW: toMessage(error) })
      return false
    }
  },

  async setMode(mode) {
    await get().run(() => repo.updateSettings({ mode }))
  },

  clearError() {
    set({ errorZhTW: null })
  },
}))

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return '發生未知錯誤'
}

export { catalogAudit, catalogMeta }
