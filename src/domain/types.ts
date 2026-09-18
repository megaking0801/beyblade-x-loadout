/**
 * 領域型別定義。
 *
 * 規格對照：第 5 節（命名）、第 7 節（商品）、第 8 節（變體）、第 9 節（零件）、
 * 第 12 節（庫存來源）、第 22/23 節（賽事）、第 25 節（圖片）、第 41 節（來源驗證）。
 *
 * 此檔案不得 import Dexie、React 或任何 IO。純資料型別。
 */

/* ---------------------------------------------------------------- 命名與來源 */

/** 第 5 節：前台一律顯示 primaryZhTW，英日文只能當別名與詳細頁副標。 */
export interface Naming {
  primaryZhTW: string
  /** 台灣市場常用說法、玩家口語，供搜尋比對。 */
  aliasesZhTW?: string[]
  nameJa?: string
  nameEn?: string
  nameHasbro?: string
  nickname?: string[]
  /** true 表示尚無台灣正式名稱，primaryZhTW 為「型號 + 暫譯」。前台必須標註暫譯。 */
  isProvisionalZhTW?: boolean
}

/** 第 41 節：Catalog 每筆資料的驗證狀態。 */
export type VerificationStatus =
  | 'official_verified'
  | 'multi_source_verified'
  | 'community_only'
  | 'needs_review'

/** 第 41 節：每筆 Catalog 資料至少要能保存來源與驗證時間。 */
export interface Provenance {
  sourceUrls: string[]
  verifiedAt?: string
  verificationStatus: VerificationStatus
}

/* ---------------------------------------------------------------------- 圖片 */

/** 第 25 節：不得隨意抓網路圖片重新散布，故記錄 usageStatus。 */
export interface ImageAsset {
  id: string
  entityType: 'product' | 'product_variant' | 'part' | 'part_variant'
  entityId: string
  url: string
  thumbnailUrl?: string
  sourceUrl: string
  sourceName: string
  copyrightOwner?: string
  usageStatus: 'link_only' | 'permission_granted' | 'user_uploaded' | 'unknown'
  /**
   * 原始網址。圖片改成本機鏡像之後，url 是本機路徑，這裡保留原本抓到的位置，
   * 前台才有辦法把來源交代清楚（第 25 節）。
   */
  remoteUrl?: string
  /** true 表示這張是下載下來的本機副本，不是外部連結。 */
  isLocalMirror?: boolean
}

/* ---------------------------------------------------------------------- 零件 */

export type PartFamily =
  | 'blade'
  | 'ratchet'
  | 'bit'
  | 'lock_chip'
  | 'main_blade'
  | 'over_blade'
  | 'assist_blade'
  | 'integrated_blade'
  | 'other'

/**
 * 第 18 節：組裝結構。
 * BX／UX 為三件式；CX 的上蓋可再拆成三件式（紋章＋主刃＋輔助）或
 * 四件式（再多一片超越戰刃）。
 */
export type AssemblySystem = 'BX' | 'UX' | 'CX'

export type SpinDirection = 'right' | 'left' | 'dual'

/** 第 6 節：前台顯示用的旋向中文名稱。 */
export const SPIN_DIRECTION_ZH: Record<SpinDirection, string> = {
  right: '右旋',
  left: '左旋',
  dual: '雙旋',
}

export type BeyType = 'attack' | 'defense' | 'stamina' | 'balance'

/** 第 6 節：前台顯示用的中文類型名稱。 */
export const BEY_TYPE_ZH: Record<BeyType, string> = {
  attack: '攻擊',
  defense: '防守',
  stamina: '持久',
  balance: '均衡',
}

/** 第 6 節：前台顯示用的中文零件分類名稱。 */
export const PART_FAMILY_ZH: Record<PartFamily, string> = {
  blade: '上蓋',
  ratchet: '固鎖',
  bit: '軸心',
  lock_chip: '鎖定紋章',
  main_blade: '主刃',
  over_blade: '超越戰刃',
  assist_blade: '輔助戰刃',
  integrated_blade: '一體式上蓋',
  other: '其他',
}

/** 第 20 節 A：軸心特性。只填官方說明或實物可確認的接地形式。 */
export type BitContact = 'flat' | 'ball' | 'point' | 'needle' | 'rubber' | 'other'

export const BIT_CONTACT_ZH: Record<BitContact, string> = {
  flat: '平面',
  ball: '球狀',
  point: '尖點',
  needle: '針尖',
  rubber: '橡膠',
  other: '其他',
}

/** 可切換模式的說明；來源是社群整理，逐筆保留原文引述。 */
export interface PartSwitchableModes {
  /** 怎麼切換：翻面、手動切換。 */
  howZhTW: string
  modes: { nameZhTW: string; sideZhTW?: string; effectZhTW: string }[]
  sourceUrl: string
  quoteZhTW: string
}

/** 上蓋的固鎖搭配限制；來源與爭議都要保留，前台才講得出憑據。 */
export interface PartRatchetAllowList {
  codes: string[]
  noteZhTW: string
  /** 來源之間不一致時的說明；沒有分歧就省略。 */
  disputeZhTW?: string
  sources: { url: string; quoteZhTW: string }[]
}

export interface Part {
  id: string
  family: PartFamily
  /** 官方型號／代號，例如 `3-60`、`DranSword`。前台當副標。 */
  code: string
  naming: Naming
  /** 此零件屬於哪個組裝系統。CX 專用件標 CX。 */
  system: AssemblySystem
  spinDirection?: SpinDirection
  type?: BeyType
  /**
   * 官方型號中的高度標示值（例：固鎖「3-60」的 60）。
   * 這是官方命名規則裡的數字，不是毫米實測值，故不命名為 heightMm。
   */
  heightCode?: number
  officialWeightG?: number
  /** 第 20 節 A：軸心特性，僅軸心類零件適用。 */
  bitContact?: BitContact
  /**
   * CX 上蓋在商品上是「鎖定紋章 + 主刃」已組合的狀態。
   * 官方商品頁只公布整體名稱、未公布兩者的個別名稱，因此暫以一個 main_blade 零件表示，
   * 並標記 cxFused，讓相容性檢查知道此配裝不需要再選鎖定紋章（第 1.5 節：不得編造零件）。
   */
  cxFused?: boolean
  /**
   * 四件式（超越拆組）的主刃：除了輔助戰刃之外還要再裝一片超越戰刃。
   * 官方商品名把兩片黏在一起寫（例：バハムートブリッツ「BK」= 超越 B + 輔助 K），
   * 是四件式這件事來自 BeybladeHub 的商品頁，因此拆出來的零件標社群來源。
   */
  cxOverBlade?: boolean
  /**
   * 這個零件已經把固鎖做在自己身上，所以配裝不需要獨立固鎖。
   *
   * 兩種情況：UX 的「擴張上蓋」（固鎖一體型上蓋）與 Op／Tr 這類固鎖一體型軸心。
   * 官方商品名不會標出來（名稱裡直接少了固鎖代號），這件事來自 BeybladeHub 的零件頁。
   */
  integratedRatchet?: boolean
  /** 白話用途說明，給新手模式用（第 26、38 節）。 */
  plainDescriptionZhTW?: string
  /**
   * 可切換模式的零件（第 20 節 B）。
   *
   * 有些零件翻面或手動切換之後攻防型態會變，例如 CX-09 的主刃「滅世」
   * 紅面是上撃、藍面是重擊。圖鑑只記得住一個 `type`，所以這些零件的
   * 六軸推估只描述得了其中一面，前台必須講明白，不能假裝那是唯一型態。
   */
  switchableModes?: PartSwitchableModes
  /**
   * 這顆上蓋只裝得下哪些固鎖（第 18 節）。
   *
   * 官方不會標，來源是社群實測，而且來源之間可能不一致，所以只作為提醒，
   * 不阻擋儲存 —— 硬擋等於幫使用者做他沒授權的判斷。
   */
  ratchetAllowList?: PartRatchetAllowList
  notes?: string
  provenance: Provenance
  /**
   * 第 20 節：重量、類型、旋向、軸心特性的來源。
   *
   * Takara Tomy 官方商品頁不公布這些欄位，數值來自社群圖鑑的玩家實測，
   * 與零件身分（型號、名稱）的來源不同，所以分開記錄，前台才能誠實標示。
   */
  statsProvenance?: Provenance
}

/** 第 9 節：同一零件的不同顏色／Metal Coat／模具版本。 */
export interface PartVariant {
  id: string
  partId: string
  color?: string
  finish?: string
  metalCoat?: boolean
  moldRevision?: string
  region?: string
  measuredWeightG?: number
  sourceProductIds: string[]
  provenance: Provenance
}

/* ---------------------------------------------------------------------- 商品 */

export type ProductLine = 'BX' | 'UX' | 'CX' | 'OTHER'

export type ProductCategory =
  | 'starter'
  | 'booster'
  | 'random_booster'
  | 'deck_set'
  | 'battle_set'
  | 'entry_set'
  | 'part_set'
  | 'limited'
  | 'event'
  | 'prize'
  | 'lottery'
  | 'collaboration'
  | 'magazine'
  | 'tool'
  | 'accessory'

/** 第 6 節：前台顯示用的商品分類中文名稱。 */
export const PRODUCT_CATEGORY_ZH: Record<ProductCategory, string> = {
  starter: '入門組',
  booster: '增強包',
  random_booster: '隨機強化組',
  deck_set: '套組',
  battle_set: '對戰組',
  entry_set: '入門套裝',
  part_set: '零件組',
  limited: '限定品',
  event: '活動限定',
  prize: '比賽獎品',
  lottery: '抽選商品',
  collaboration: '聯名商品',
  magazine: '雜誌限定',
  tool: '工具',
  accessory: '配件',
}

/** 第 4 節：Launcher/Stadium/Grip 等可進 Catalog 但不進配裝器。 */
export const NON_PLAYABLE_CATEGORIES: readonly ProductCategory[] = ['tool', 'accessory']

/** 商品內含物。零件用 partId；配件用 accessoryName。 */
export interface ProductContent {
  partId?: string
  /**
   * Launcher／Grip／對戰盤等非配裝零件。官方名稱，是日文。
   *
   * **前台不得直接渲染這個欄位**（第 1.4 節：前台不得出現日文假名）。
   * 顯示時用 `accessoryNameZhTW`，沒有中文名時退回 `accessoryTypeZhTW`。
   */
  accessoryName?: string
  /** 台灣中文名，來自 `beybladehub-accessories.json`（逐字抄自來源頁，未自行翻譯）。 */
  accessoryNameZhTW?: string
  /** 配件分類（發射器／握把／對戰盤／工具）。查不到中文名時至少還能顯示這個。 */
  accessoryTypeZhTW?: string
  quantity: number
}

export interface Product {
  id: string
  sku?: string
  line: ProductLine
  category: ProductCategory
  naming: Naming
  releaseDate?: string
  region: string[]
  /** 固定內容物。Random Booster 的內容放在 variants，此處留空。 */
  contents: ProductContent[]
  /** true 表示開封後才知道實際內容（第 13 節）。 */
  isRandom: boolean
  provenance: Provenance
}

/** 第 8 節：Random Booster、限定色等的實際款式。 */
export interface ProductVariant {
  id: string
  productId: string
  variantNameZhTW: string
  rarity?: string
  /** 官方公布的抽出機率。沒有官方數據就留空，不得估算（第 1.5 節）。 */
  probability?: number
  contents: ProductContent[]
  provenance: Provenance
}

/* ------------------------------------------------------------------ 相容性 */

/**
 * 第 18 節：除了結構性規則之外的已知特殊限制，一律以資料表達並附來源。
 * 沒有來源的限制不得寫死在程式裡（第 1.5 節禁止編造零件相容性）。
 */
export interface CompatibilityRule {
  id: string
  kind: 'requires' | 'forbids'
  /** 觸發此規則的零件。 */
  partId: string
  /** 被要求或被禁止的對象。 */
  targetPartIds?: string[]
  targetFamilies?: PartFamily[]
  reasonZhTW: string
  provenance: Provenance
}

/* -------------------------------------------------------------------- 庫存 */

/** 第 16 節：零件狀態。只有 available 能進配裝器／3on3／推薦。 */
export type PartStatus =
  | 'available'
  | 'ordered'
  | 'loaned_out'
  | 'sold'
  | 'lost'
  | 'damaged'
  | 'worn'

/** 第 16 節：前台顯示用中文。 */
export const PART_STATUS_ZH: Record<PartStatus, string> = {
  available: '可用',
  ordered: '未到貨',
  loaned_out: '借出',
  sold: '已出售',
  lost: '遺失',
  damaged: '損壞',
  worn: '磨耗',
}

/**
 * 第 16 節：「只有可用數量能正式進入配裝器／3on3／自動推薦」。
 * 磨耗是與可用並列的獨立狀態，因此不計入可用庫存。
 */
export const USABLE_PART_STATUSES: readonly PartStatus[] = ['available']

export type ItemCondition = 'new' | 'used' | 'worn'

/** 第 12 節：庫存批次。不要只存總數量。 */
export interface InventoryLot {
  id: string
  sourceType: 'product' | 'standalone_part' | 'manual_adjustment'
  /** 來源商品的 ownedProductId（sourceType 為 product 時）。 */
  sourceId?: string
  partId: string
  quantity: number
  status: PartStatus
  condition: ItemCondition
  notes?: string
  createdAt: string
}

/**
 * 使用者對某個 Catalog 零件的個人標記。
 * 這和庫存批次分開，讓同一零件不論來自哪個商品或單獨購入，都共用收藏與備註。
 */
export interface PartPreference {
  partId: string
  favorite: boolean
  notes?: string
}

/** 第 15 節：商品狀態。 */
export type OwnedProductStatus = 'owned' | 'ordered' | 'wishlist' | 'sold'

export const OWNED_PRODUCT_STATUS_ZH: Record<OwnedProductStatus, string> = {
  owned: '已擁有',
  ordered: '已下單未到貨',
  wishlist: '想買',
  sold: '已出售',
}

/** 第 13 節：Random Booster 的開封記錄。 */
export interface OpenedVariantRecord {
  variantId: string
  quantity: number
}

/** 使用者擁有的商品。 */
export interface OwnedProduct {
  id: string
  productId: string
  /** 總盒數。 */
  quantity: number
  status: OwnedProductStatus
  /** Random Booster：尚未拆封的盒數。 */
  sealedQuantity?: number
  /** Random Booster：已拆封並確認款式的紀錄。 */
  openedVariants?: OpenedVariantRecord[]
  /**
   * Random Booster：已拆封但官方沒有款式清單可選，改由使用者直接登記實際內容的盒數。
   * 這些盒子的零件會以獨立批次記錄，來源仍指向這個商品（第 13 節）。
   */
  manualOpenedQuantity?: number
  notes?: string
  createdAt: string
}

/* ------------------------------------------------------------------ 配裝 */

/** 第 17 節：配裝的零件槽位。CX 才會用到 lockChip / mainBlade / assistBlade。 */
export interface ComboSlots {
  bladeId?: string
  lockChipId?: string
  mainBladeId?: string
  /** 四件式 CX 才有的超越戰刃。 */
  overBladeId?: string
  assistBladeId?: string
  ratchetId?: string
  bitId?: string
}

export interface SavedCombo {
  id: string
  nameZhTW: string
  system: AssemblySystem
  slots: ComboSlots
  favorite: boolean
  notes?: string
  /** 第 31 節：標記為已實際組裝時會占用實際庫存。 */
  physicallyBuilt: boolean
  /** 第 30 節：定位標記，例如「主攻」。 */
  roleZhTW?: string
  createdAt: string
}

/** 第 32 節：3on3 隊伍。 */
export interface Deck {
  id: string
  nameZhTW: string
  comboIds: string[]
  notes?: string
  createdAt: string
}

/** 第 35 節：想買清單。 */
export interface WishlistItem {
  id: string
  productId: string
  quantity: number
  notes?: string
  createdAt: string
}

/* ------------------------------------------------------------------ 賽事 */

/** 第 22 節。 */
export type SourceTier =
  | 'official'
  | 'official_organizer'
  | 'verified_community'
  | 'community'
  | 'user_submitted'

export interface TournamentEvent {
  id: string
  name: string
  date: string
  /** 來源未標示地點時不猜測。 */
  country?: string
  region?: string
  tier?: 'G1' | 'G2' | 'G3' | 'S1' | 'community' | 'other'
  format?: string
  stadium?: string
  participantCount?: number
  sourceTier: SourceTier
  sourceUrl: string
}

/** 第 23 節：一份賽事名單。combos 為配裝的槽位組合字串或 comboKey。 */
export interface TournamentDeck {
  id: string
  eventId: string
  placement?: number
  comboKeys: string[]
  /** 已對應到 Catalog 的零件 ID；用於零件反查與匯入完整性驗證。 */
  comboPartIds?: string[][]
  sourceUrl: string
}

/**
 * 已確認的單顆配置，但來源沒有提供（或尚無法完整映射）同副完整三對三牌組。
 * 僅供「來源觀測」顯示，絕不可用於出場率、Meta share 或可信度計算。
 */
export interface TournamentObservation {
  id: string
  eventId: string
  placement?: number
  /** 標準三件式的依序上蓋、固鎖、軸心；每顆都必須已映射到 Catalog。 */
  comboPartIds?: string[]
  /** CX 等非標準結構以具名槽位記錄，避免把零件順序誤判成三件式。 */
  slots?: ComboSlots
  /** 來源頁上的原始配置文字，供資料維護回查。 */
  reportedCombo: string
  sourceUrl: string
}

/* -------------------------------------------------------------- 可信度 */

/** 第 20 節 D：資料可信度。 */
export type Confidence = 'high' | 'medium' | 'low'

export const CONFIDENCE_ZH: Record<Confidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
}
