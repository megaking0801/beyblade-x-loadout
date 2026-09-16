/**
 * 測試專用假資料。
 * 刻意使用 test- 前綴與虛構名稱，避免與真實官方商品混淆（規格第 1.5 節禁止編造官方資料）。
 */
import type {
  Part,
  Product,
  ProductVariant,
  Provenance,
} from '../../src/domain/types.ts'

const prov: Provenance = {
  sourceUrls: ['https://example.test/fixture'],
  verificationStatus: 'needs_review',
}

function part(id: string, family: Part['family'], system: Part['system'], code: string): Part {
  return {
    id,
    family,
    system,
    code,
    naming: { primaryZhTW: `測試${code}`, nameEn: `Test ${code}` },
    provenance: prov,
  }
}

export const testParts: Part[] = [
  part('test-blade-a', 'blade', 'BX', 'BladeA'),
  part('test-blade-b', 'blade', 'BX', 'BladeB'),
  part('test-blade-c', 'blade', 'BX', 'BladeC'),
  part('test-ratchet-a', 'ratchet', 'BX', '3-60'),
  part('test-ratchet-b', 'ratchet', 'BX', '9-60'),
  part('test-ratchet-c', 'ratchet', 'BX', '5-70'),
  part('test-bit-a', 'bit', 'BX', 'BitA'),
  part('test-bit-b', 'bit', 'BX', 'BitB'),
  part('test-bit-c', 'bit', 'BX', 'BitC'),
]

/** 固定內容商品：每盒含 BladeA ×1、3-60 ×1、BitA ×1，另含發射器（配件）。 */
export const fixedProduct: Product = {
  id: 'test-product-fixed',
  line: 'BX',
  category: 'starter',
  naming: { primaryZhTW: '測試入門組' },
  region: ['JP'],
  isRandom: false,
  contents: [
    { partId: 'test-blade-a', quantity: 1 },
    { partId: 'test-ratchet-a', quantity: 1 },
    { partId: 'test-bit-a', quantity: 1 },
    { accessoryName: '測試發射器', quantity: 1 },
  ],
  provenance: prov,
}

/** 多顆商品：一盒含兩顆陀螺的份量（第 14 節 Set 規則）。 */
export const deckSetProduct: Product = {
  id: 'test-product-deckset',
  line: 'BX',
  category: 'deck_set',
  naming: { primaryZhTW: '測試三對三組' },
  region: ['JP'],
  isRandom: false,
  contents: [
    { partId: 'test-blade-a', quantity: 1 },
    { partId: 'test-blade-b', quantity: 1 },
    { partId: 'test-ratchet-a', quantity: 1 },
    { partId: 'test-ratchet-b', quantity: 1 },
    { partId: 'test-bit-a', quantity: 2 },
    { accessoryName: '測試握把', quantity: 1 },
  ],
  provenance: prov,
}

/** Random Booster：開封前不知道是哪一款（第 13 節）。 */
export const randomProduct: Product = {
  id: 'test-product-random',
  line: 'BX',
  category: 'random_booster',
  naming: { primaryZhTW: '測試隨機補充包' },
  region: ['JP'],
  isRandom: true,
  contents: [],
  provenance: prov,
}

export const randomVariants: ProductVariant[] = [
  {
    id: 'test-variant-a',
    productId: 'test-product-random',
    variantNameZhTW: 'A 款',
    contents: [
      { partId: 'test-blade-a', quantity: 1 },
      { partId: 'test-ratchet-a', quantity: 1 },
      { partId: 'test-bit-a', quantity: 1 },
    ],
    provenance: prov,
  },
  {
    id: 'test-variant-c',
    productId: 'test-product-random',
    variantNameZhTW: 'C 款',
    contents: [
      { partId: 'test-blade-b', quantity: 1 },
      { partId: 'test-ratchet-b', quantity: 1 },
      { partId: 'test-bit-b', quantity: 1 },
    ],
    provenance: prov,
  },
]

export const testProducts: Product[] = [fixedProduct, deckSetProduct, randomProduct]
