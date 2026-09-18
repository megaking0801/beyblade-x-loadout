import { describe, expect, it } from 'vitest'
import {
  aggregatePartStock,
  accessoryDisplayNameZhTW,
  collectAccessories,
  computePartReservations,
  describePartSources,
  expandOwnedProductToLots,
  getPartAvailability,
  validateOwnedProduct,
} from '../../src/domain/inventory.ts'
import type { InventoryLot, OwnedProduct, SavedCombo } from '../../src/domain/types.ts'
import {
  deckSetProduct,
  fixedProduct,
  randomProduct,
  randomVariants,
} from '../fixtures/testCatalog.ts'

const NOW = '2026-01-01T00:00:00.000Z'

function owned(over: Partial<OwnedProduct> & Pick<OwnedProduct, 'productId'>): OwnedProduct {
  return {
    id: `owned-${over.productId}`,
    quantity: 1,
    status: 'owned',
    createdAt: NOW,
    ...over,
  }
}

function lot(over: Partial<InventoryLot> & Pick<InventoryLot, 'partId' | 'quantity'>): InventoryLot {
  return {
    id: `lot-${over.partId}-${over.quantity}-${over.status ?? 'available'}`,
    sourceType: 'standalone_part',
    status: 'available',
    condition: 'new',
    createdAt: NOW,
    ...over,
  }
}

describe('商品展開成庫存批次（第 11、14 節）', () => {
  it('商品 ×1 時，每個內含零件依內含數量建立批次', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: fixedProduct.id }),
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    expect(lots.map((l) => [l.partId, l.quantity])).toEqual([
      ['test-blade-a', 1],
      ['test-ratchet-a', 1],
      ['test-bit-a', 1],
    ])
  })

  it('商品 ×3 時，每個內含零件自動乘 3（第 11 節、第 45 節 Case 2）', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: fixedProduct.id, quantity: 3 }),
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    const byPart = Object.fromEntries(lots.map((l) => [l.partId, l.quantity]))
    expect(byPart).toEqual({ 'test-blade-a': 3, 'test-ratchet-a': 3, 'test-bit-a': 3 })
  })

  it('一盒內含同一零件多個時，乘上盒數（第 14 節）', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: deckSetProduct.id, quantity: 2 }),
      product: deckSetProduct,
      variants: [],
      now: NOW,
    })
    const byPart = Object.fromEntries(lots.map((l) => [l.partId, l.quantity]))
    expect(byPart['test-bit-a']).toBe(4)
    expect(byPart['test-blade-b']).toBe(2)
  })

  it('配件不進零件庫存（第 4、14 節）', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: fixedProduct.id }),
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    expect(lots.some((l) => l.partId === '測試發射器')).toBe(false)
    expect(lots).toHaveLength(3)
  })

  it('配件另外由 collectAccessories 聚合，並乘上盒數', () => {
    const accessories = collectAccessories([
      {
        ownedProduct: owned({ productId: fixedProduct.id, quantity: 3 }),
        product: fixedProduct,
      },
      {
        ownedProduct: owned({ productId: deckSetProduct.id, quantity: 1 }),
        product: deckSetProduct,
      },
    ])
    expect(accessories).toEqual([
      { name: '測試發射器', quantity: 3 },
      { name: '測試握把', quantity: 1 },
    ])
  })

  it('商品數量 0 時不產生任何批次', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: fixedProduct.id, quantity: 0 }),
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    expect(lots).toEqual([])
  })

  it('想買清單狀態的商品不產生任何批次（第 15 節）', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: fixedProduct.id, quantity: 2, status: 'wishlist' }),
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    expect(lots).toEqual([])
  })

  it('未到貨商品產生的批次狀態為 ordered（第 15 節、第 45 節 Case 4）', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: fixedProduct.id, quantity: 2, status: 'ordered' }),
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    expect(lots).toHaveLength(3)
    expect(lots.every((l) => l.status === 'ordered')).toBe(true)
    expect(lots.every((l) => l.quantity === 2)).toBe(true)
  })

  it('已出售商品產生的批次狀態為 sold', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: fixedProduct.id, status: 'sold' }),
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    expect(lots.every((l) => l.status === 'sold')).toBe(true)
  })

  it('批次來源可追蹤回商品（第 11、12 節）', () => {
    const op = owned({ productId: fixedProduct.id, quantity: 3 })
    const lots = expandOwnedProductToLots({
      ownedProduct: op,
      product: fixedProduct,
      variants: [],
      now: NOW,
    })
    expect(lots.every((l) => l.sourceType === 'product' && l.sourceId === op.id)).toBe(true)
  })
})

describe('Random Booster 展開規則（第 13 節、第 45 節 Case 5、6）', () => {
  it('未拆封時不加入任何零件', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({ productId: randomProduct.id, quantity: 2, sealedQuantity: 2 }),
      product: randomProduct,
      variants: randomVariants,
      now: NOW,
    })
    expect(lots).toEqual([])
  })

  it('開封後只加入所選款式的零件', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({
        productId: randomProduct.id,
        quantity: 1,
        sealedQuantity: 0,
        openedVariants: [{ variantId: 'test-variant-a', quantity: 1 }],
      }),
      product: randomProduct,
      variants: randomVariants,
      now: NOW,
    })
    const byPart = Object.fromEntries(lots.map((l) => [l.partId, l.quantity]))
    expect(byPart).toEqual({ 'test-blade-a': 1, 'test-ratchet-a': 1, 'test-bit-a': 1 })
    expect(byPart['test-blade-b']).toBeUndefined()
  })

  it('未拆 ×2、A 款 ×1、C 款 ×2 時只計入已開封的零件（第 13 節範例）', () => {
    const lots = expandOwnedProductToLots({
      ownedProduct: owned({
        productId: randomProduct.id,
        quantity: 5,
        sealedQuantity: 2,
        openedVariants: [
          { variantId: 'test-variant-a', quantity: 1 },
          { variantId: 'test-variant-c', quantity: 2 },
        ],
      }),
      product: randomProduct,
      variants: randomVariants,
      now: NOW,
    })
    const stock = aggregatePartStock(lots)
    expect(stock.get('test-blade-a')?.available).toBe(1)
    expect(stock.get('test-blade-b')?.available).toBe(2)
    expect(stock.get('test-bit-b')?.available).toBe(2)
  })

  it('開封紀錄指向不存在的款式時忽略該筆並可由驗證器攔到', () => {
    const op = owned({
      productId: randomProduct.id,
      quantity: 1,
      sealedQuantity: 0,
      openedVariants: [{ variantId: 'test-variant-不存在', quantity: 1 }],
    })
    const lots = expandOwnedProductToLots({
      ownedProduct: op,
      product: randomProduct,
      variants: randomVariants,
      now: NOW,
    })
    expect(lots).toEqual([])
    expect(validateOwnedProduct({ ownedProduct: op, product: randomProduct, variants: randomVariants }))
      .toContain('開封紀錄指向不存在的款式：test-variant-不存在')
  })
})

describe('商品數量一致性驗證（第 13 節）', () => {
  it('Random Booster 的未拆 + 已開封數量必須等於總盒數', () => {
    const errors = validateOwnedProduct({
      ownedProduct: owned({
        productId: randomProduct.id,
        quantity: 5,
        sealedQuantity: 2,
        openedVariants: [{ variantId: 'test-variant-a', quantity: 1 }],
      }),
      product: randomProduct,
      variants: randomVariants,
    })
    expect(errors).toContain('未拆封 2 盒加上已開封 1 盒不等於總盒數 5 盒')
  })

  it('數量一致時沒有錯誤', () => {
    const errors = validateOwnedProduct({
      ownedProduct: owned({
        productId: randomProduct.id,
        quantity: 3,
        sealedQuantity: 1,
        openedVariants: [{ variantId: 'test-variant-a', quantity: 2 }],
      }),
      product: randomProduct,
      variants: randomVariants,
    })
    expect(errors).toEqual([])
  })

  it('數量為負數時報錯', () => {
    const errors = validateOwnedProduct({
      ownedProduct: owned({ productId: fixedProduct.id, quantity: -1 }),
      product: fixedProduct,
      variants: [],
    })
    expect(errors).toContain('商品數量不可小於 0')
  })

  it('非 Random Booster 商品填了開封紀錄時報錯', () => {
    const errors = validateOwnedProduct({
      ownedProduct: owned({
        productId: fixedProduct.id,
        openedVariants: [{ variantId: 'test-variant-a', quantity: 1 }],
      }),
      product: fixedProduct,
      variants: randomVariants,
    })
    expect(errors).toContain('此商品不是隨機商品，不應有開封紀錄')
  })
})

describe('庫存聚合（第 11、12、16 節）', () => {
  it('同一零件的多個批次相加，並依狀態分列', () => {
    const stock = aggregatePartStock([
      lot({ partId: 'test-bit-a', quantity: 3, sourceType: 'product', sourceId: 'owned-x' }),
      lot({ partId: 'test-bit-a', quantity: 2 }),
      lot({ partId: 'test-bit-a', quantity: 1, status: 'ordered' }),
      lot({ partId: 'test-bit-a', quantity: 1, status: 'loaned_out' }),
      lot({ partId: 'test-bit-a', quantity: 1, status: 'worn' }),
    ])
    const bit = stock.get('test-bit-a')
    expect(bit).toMatchObject({
      partId: 'test-bit-a',
      available: 5,
      ordered: 1,
      loanedOut: 1,
      worn: 1,
      total: 8,
    })
  })

  it('商品來源 ×3 加上單獨購入 ×2 等於 5（第 11 節範例、第 45 節 Case 3）', () => {
    const lots = [
      ...expandOwnedProductToLots({
        ownedProduct: owned({ productId: fixedProduct.id, quantity: 3 }),
        product: fixedProduct,
        variants: [],
        now: NOW,
      }),
      lot({ partId: 'test-ratchet-a', quantity: 2 }),
    ]
    expect(aggregatePartStock(lots).get('test-ratchet-a')?.available).toBe(5)
  })

  it('未到貨、借出、出售、遺失、損壞、磨耗都不計入可用（第 16 節）', () => {
    const stock = aggregatePartStock([
      lot({ partId: 'p', quantity: 1, status: 'ordered' }),
      lot({ partId: 'p', quantity: 1, status: 'loaned_out' }),
      lot({ partId: 'p', quantity: 1, status: 'sold' }),
      lot({ partId: 'p', quantity: 1, status: 'lost' }),
      lot({ partId: 'p', quantity: 1, status: 'damaged' }),
      lot({ partId: 'p', quantity: 1, status: 'worn' }),
    ])
    expect(stock.get('p')?.available).toBe(0)
    expect(stock.get('p')?.total).toBe(6)
  })

  it('空批次清單聚合成空結果', () => {
    expect(aggregatePartStock([]).size).toBe(0)
  })
})

describe('來源反查（第 11、12、27 節）', () => {
  it('列出每個來源各貢獻多少數量', () => {
    const op = owned({ productId: fixedProduct.id, quantity: 3 })
    const lots = [
      ...expandOwnedProductToLots({ ownedProduct: op, product: fixedProduct, variants: [], now: NOW }),
      lot({ partId: 'test-ratchet-a', quantity: 2, notes: '單獨購入' }),
    ]
    const sources = describePartSources({
      lots,
      partId: 'test-ratchet-a',
      productNameByOwnedId: { [op.id]: '測試入門組' },
    })
    expect(sources).toEqual([
      { labelZhTW: '測試入門組', sourceType: 'product', sourceId: op.id, quantity: 3, status: 'available' },
      { labelZhTW: '單獨購入', sourceType: 'standalone_part', sourceId: undefined, quantity: 2, status: 'available' },
    ])
  })

  it('查無此零件時回空陣列', () => {
    expect(describePartSources({ lots: [], partId: 'p', productNameByOwnedId: {} })).toEqual([])
  })
})

describe('實體鎖定占用庫存（第 31 節、第 45 節 Case 7）', () => {
  function combo(id: string, ratchetId: string, physicallyBuilt: boolean): SavedCombo {
    return {
      id,
      nameZhTW: id,
      system: 'BX',
      slots: { bladeId: 'test-blade-a', ratchetId, bitId: 'test-bit-a' },
      favorite: false,
      physicallyBuilt,
      createdAt: NOW,
    }
  }

  it('只有標記已實際組裝的配裝才占用庫存', () => {
    const reservations = computePartReservations([
      combo('c1', 'test-ratchet-b', true),
      combo('c2', 'test-ratchet-b', false),
    ])
    expect(reservations.get('test-ratchet-b')).toBe(1)
  })

  it('兩套實體配裝各用 1 個時，可用餘額歸零（第 31 節範例）', () => {
    const lots = [lot({ partId: 'test-ratchet-b', quantity: 2 })]
    const combos = [combo('c1', 'test-ratchet-b', true), combo('c2', 'test-ratchet-b', true)]
    const availability = getPartAvailability({ lots, combos, partId: 'test-ratchet-b' })
    expect(availability).toEqual({ partId: 'test-ratchet-b', available: 2, reserved: 2, free: 0 })
  })

  it('占用超過庫存時 free 不得為負數', () => {
    const lots = [lot({ partId: 'test-ratchet-b', quantity: 1 })]
    const combos = [combo('c1', 'test-ratchet-b', true), combo('c2', 'test-ratchet-b', true)]
    expect(getPartAvailability({ lots, combos, partId: 'test-ratchet-b' }).free).toBe(0)
  })

  it('同一配裝重複使用同一零件時占用數量累加', () => {
    const c: SavedCombo = {
      id: 'cx',
      nameZhTW: 'cx',
      system: 'CX',
      slots: {
        lockChipId: 'test-blade-a',
        mainBladeId: 'test-blade-a',
        assistBladeId: 'test-blade-a',
        ratchetId: 'test-ratchet-a',
        bitId: 'test-bit-a',
      },
      favorite: false,
      physicallyBuilt: true,
      createdAt: NOW,
    }
    expect(computePartReservations([c]).get('test-blade-a')).toBe(3)
  })

  it('沒有任何配裝時占用為空', () => {
    expect(computePartReservations([]).size).toBe(0)
  })
})

describe('配件的前台顯示名稱（第 1.4 節：前台不得出現日文假名）', () => {
  it('有中文名就用中文名', () => {
    expect(
      accessoryDisplayNameZhTW({
        name: 'ワインダーランチャー レッドVer.',
        nameZhTW: '拉條式發射器 紅色',
        typeZhTW: '發射器',
        quantity: 1,
      }),
    ).toBe('拉條式發射器 紅色')
  })

  it('沒有中文名就退回分類，**不得**退回日文原名', () => {
    const shown = accessoryDisplayNameZhTW({
      name: 'ワインダーランチャー レッドVer.',
      typeZhTW: '發射器',
      quantity: 1,
    })
    expect(shown).toBe('發射器')
    expect(shown).not.toContain('ランチャー')
  })

  it('連分類都沒有時給中性字，仍然不得漏出日文', () => {
    const shown = accessoryDisplayNameZhTW({ name: 'CXツール', quantity: 1 })
    expect(shown).toBe('配件')
    expect(shown).not.toContain('ツール')
  })

  it('collectAccessories 會把中文名與分類一起帶出來', () => {
    const product = {
      ...fixedProduct,
      contents: [
        {
          accessoryName: 'ワインダーランチャー レッドVer.',
          accessoryNameZhTW: '拉條式發射器 紅色',
          accessoryTypeZhTW: '發射器',
          quantity: 1,
        },
      ],
    }
    const rows = collectAccessories([{ ownedProduct: owned({ productId: product.id }), product }])
    expect(rows).toEqual([
      {
        name: 'ワインダーランチャー レッドVer.',
        nameZhTW: '拉條式發射器 紅色',
        typeZhTW: '發射器',
        quantity: 1,
      },
    ])
  })
})
