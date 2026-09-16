import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, type BeybladeDb } from '../../src/data/db.ts'
import { createRepository, type Repository } from '../../src/data/repository.ts'
import {
  deckSetProduct,
  fixedProduct,
  randomProduct,
  randomVariants,
  testParts,
  testProducts,
} from '../fixtures/testCatalog.ts'

let db: BeybladeDb
let repo: Repository
let dbIndex = 0

const catalog = {
  version: 'test-1',
  parts: testParts,
  partVariants: [],
  products: testProducts,
  productVariants: randomVariants,
  compatibilityRules: [],
  images: [],
  tournamentEvents: [
    {
      id: 'tournament-1',
      name: '測試賽事',
      date: '2026-01-01',
      sourceTier: 'community' as const,
      sourceUrl: 'https://example.test/tournament-1',
    },
  ],
  tournamentDecks: [
    {
      id: 'tournament-deck-1',
      eventId: 'tournament-1',
      placement: 1,
      comboKeys: ['BladeA 3-60BitA', 'BladeB 9-60BitB', 'BladeC 5-70BitC'],
      comboPartIds: [
        ['test-blade-a', 'test-ratchet-a', 'test-bit-a'],
        ['test-blade-b', 'test-ratchet-b', 'test-bit-b'],
        ['test-blade-c', 'test-ratchet-c', 'test-bit-c'],
      ],
      sourceUrl: 'https://example.test/tournament-1',
    },
  ],
}

beforeEach(async () => {
  dbIndex += 1
  db = createDb(`beyblade-test-${dbIndex}`)
  repo = createRepository(db)
  await db.open()
})

describe('第一次開啟時個人資料完全空白（第 1 節、第 45 節 Case 1）', () => {
  it('尚未載入任何東西時全部為 0', async () => {
    const summary = await repo.getInventorySummary()
    expect(summary).toMatchObject({
      ownedProductCount: 0,
      bladeCount: 0,
      ratchetCount: 0,
      bitCount: 0,
      comboCount: 0,
      deckCount: 0,
    })
  })

  it('載入公共 Catalog 之後個人資料仍然為 0（第 1.2 節）', async () => {
    await repo.loadCatalog(catalog)
    const summary = await repo.getInventorySummary()
    expect(summary.ownedProductCount).toBe(0)
    expect(summary.bladeCount).toBe(0)
    expect(await repo.listOwnedProducts()).toEqual([])
    expect(await repo.listCombos()).toEqual([])
  })

  it('Catalog 本身有被載入', async () => {
    await repo.loadCatalog(catalog)
    expect((await repo.listParts()).length).toBe(testParts.length)
    expect((await repo.listProducts()).length).toBe(testProducts.length)
    expect(await repo.getCatalogVersion()).toBe('test-1')
    expect((await repo.listTournamentEvents()).map((event) => event.id)).toEqual(['tournament-1'])
    expect((await repo.listTournamentDecks()).map((deck) => deck.id)).toEqual(['tournament-deck-1'])
  })
})

describe('Catalog 更新不得覆蓋個人庫存（第 3 節）', () => {
  it('重新載入 Catalog 後個人商品與配裝都還在', async () => {
    await repo.loadCatalog(catalog)
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 2, status: 'owned' })
    await repo.saveCombo({
      nameZhTW: '我的配裝',
      system: 'BX',
      slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-a', bitId: 'test-bit-a' },
      favorite: false,
      physicallyBuilt: false,
    })

    await repo.loadCatalog({ ...catalog, version: 'test-2' })

    expect(await repo.getCatalogVersion()).toBe('test-2')
    expect((await repo.listOwnedProducts()).length).toBe(1)
    expect((await repo.listCombos()).length).toBe(1)
  })

  it('重新載入 Catalog 不會產生重複零件', async () => {
    await repo.loadCatalog(catalog)
    await repo.loadCatalog(catalog)
    expect((await repo.listParts()).length).toBe(testParts.length)
  })
})

describe('我的商品 CRUD 與零件聚合（第 10、11 節、第 45 節 Case 2）', () => {
  beforeEach(async () => {
    await repo.loadCatalog(catalog)
  })

  it('加入商品 ×3 後零件各 ×3', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 3, status: 'owned' })
    const stock = await repo.getPartStockMap()
    expect(stock.get('test-blade-a')?.available).toBe(3)
    expect(stock.get('test-ratchet-a')?.available).toBe(3)
    expect(stock.get('test-bit-a')?.available).toBe(3)
  })

  it('修改數量與備註後會保存，聚合也跟著變', async () => {
    const id = await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 3, status: 'owned' })
    await repo.updateOwnedProduct(id, { quantity: 1, notes: '第一批購入' })
    expect((await repo.getPartStockMap()).get('test-blade-a')?.available).toBe(1)
    expect((await repo.listOwnedProducts())[0]?.notes).toBe('第一批購入')
  })

  it('刪除商品後對應零件歸零', async () => {
    const id = await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 3, status: 'owned' })
    await repo.deleteOwnedProduct(id)
    expect((await repo.getPartStockMap()).get('test-blade-a')).toBeUndefined()
    expect(await repo.listOwnedProducts()).toEqual([])
  })

  it('單獨加入零件後與商品來源聚合（第 45 節 Case 3）', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 3, status: 'owned' })
    await repo.addStandalonePart({ partId: 'test-ratchet-a', quantity: 2, status: 'available' })
    expect((await repo.getPartStockMap()).get('test-ratchet-a')?.available).toBe(5)
  })

  it('來源可追蹤，分別列出商品來源與單獨購入', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 3, status: 'owned' })
    await repo.addStandalonePart({ partId: 'test-ratchet-a', quantity: 2, status: 'available' })
    const sources = await repo.describeSources('test-ratchet-a')
    expect(sources.map((s) => [s.labelZhTW, s.quantity])).toEqual([
      ['測試入門組', 3],
      ['單獨購入', 2],
    ])
  })

  it('未到貨商品不算可用庫存（第 45 節 Case 4）', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 2, status: 'ordered' })
    const stock = await repo.getPartStockMap()
    expect(stock.get('test-blade-a')?.available).toBe(0)
    expect(stock.get('test-blade-a')?.ordered).toBe(2)
  })

  it('Set 商品的多顆內容正確乘算（第 14 節）', async () => {
    await repo.addOwnedProduct({ productId: deckSetProduct.id, quantity: 2, status: 'owned' })
    const stock = await repo.getPartStockMap()
    expect(stock.get('test-bit-a')?.available).toBe(4)
  })

  it('配件進配件庫但不進零件庫（第 14 節）', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 3, status: 'owned' })
    expect(await repo.listAccessories()).toEqual([{ name: '測試發射器', quantity: 3 }])
  })

  it('加入不存在的商品會被拒絕', async () => {
    await expect(
      repo.addOwnedProduct({ productId: '不存在', quantity: 1, status: 'owned' }),
    ).rejects.toThrow('找不到商品')
  })

  it('數量為負數會被拒絕', async () => {
    await expect(
      repo.addOwnedProduct({ productId: fixedProduct.id, quantity: -1, status: 'owned' }),
    ).rejects.toThrow('商品數量不可小於 0')
  })
})

describe('Random Booster 開封流程（第 13 節、第 45 節 Case 5、6）', () => {
  beforeEach(async () => {
    await repo.loadCatalog(catalog)
  })

  it('未拆封 ×2 時不加入任何零件', async () => {
    await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 2,
      status: 'owned',
      sealedQuantity: 2,
    })
    expect((await repo.getPartStockMap()).size).toBe(0)
  })

  it('開封並選擇款式後才加入該款零件', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 2,
      status: 'owned',
      sealedQuantity: 2,
    })
    await repo.openRandomBooster(id, 'test-variant-c', 1)
    const stock = await repo.getPartStockMap()
    expect(stock.get('test-bit-b')?.available).toBe(1)
    expect(stock.get('test-bit-a')).toBeUndefined()
    const owned = (await repo.listOwnedProducts())[0]!
    expect(owned.sealedQuantity).toBe(1)
    expect(owned.openedVariants).toEqual([{ variantId: 'test-variant-c', quantity: 1 }])
  })

  it('開封數量超過未拆封數量時被拒絕', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 1,
      status: 'owned',
      sealedQuantity: 1,
    })
    await expect(repo.openRandomBooster(id, 'test-variant-a', 2)).rejects.toThrow(
      '開封數量不可超過未拆封盒數',
    )
  })

  it('開封不存在的款式時被拒絕', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 1,
      status: 'owned',
      sealedQuantity: 1,
    })
    await expect(repo.openRandomBooster(id, '不存在', 1)).rejects.toThrow('找不到款式')
  })
})

describe('配裝與實體鎖定（第 30、31 節、第 45 節 Case 7、8）', () => {
  beforeEach(async () => {
    await repo.loadCatalog(catalog)
    await repo.addStandalonePart({ partId: 'test-blade-a', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-ratchet-b', quantity: 2, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-bit-a', quantity: 1, status: 'available' })
  })

  it('無法安裝的配裝不可儲存（第 45 節 Case 8）', async () => {
    await expect(
      repo.saveCombo({
        nameZhTW: '壞配裝',
        system: 'BX',
        slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b' },
        favorite: false,
        physicallyBuilt: false,
      }),
    ).rejects.toThrow('此組合無法實際安裝。')
  })

  it('標記已實際組裝後零件被占用（第 45 節 Case 7）', async () => {
    await repo.saveCombo({
      nameZhTW: '第一套',
      system: 'BX',
      slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b', bitId: 'test-bit-a' },
      favorite: false,
      physicallyBuilt: true,
    })
    const availability = await repo.getAvailabilityMap()
    expect(availability.get('test-ratchet-b')).toMatchObject({ available: 2, reserved: 1, free: 1 })
  })

  it('零件不足時不可再標記為已實際組裝', async () => {
    await repo.saveCombo({
      nameZhTW: '第一套',
      system: 'BX',
      slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b', bitId: 'test-bit-a' },
      favorite: false,
      physicallyBuilt: true,
    })
    await expect(
      repo.saveCombo({
        nameZhTW: '第二套',
        system: 'BX',
        slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b', bitId: 'test-bit-a' },
        favorite: false,
        physicallyBuilt: true,
      }),
    ).rejects.toThrow('可用庫存不足，無法標記為已實際組裝')
  })

  it('理論模擬的配裝可以儲存，不占用庫存', async () => {
    await repo.saveCombo({
      nameZhTW: '理論套',
      system: 'BX',
      slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b', bitId: 'test-bit-a' },
      favorite: false,
      physicallyBuilt: false,
    })
    expect((await repo.getAvailabilityMap()).get('test-ratchet-b')?.reserved).toBe(0)
  })

  it('配裝可以改名、收藏與刪除（第 30 節）', async () => {
    const id = await repo.saveCombo({
      nameZhTW: '舊名',
      system: 'BX',
      slots: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-b', bitId: 'test-bit-a' },
      favorite: false,
      physicallyBuilt: false,
    })
    await repo.updateCombo(id, { nameZhTW: '新名', favorite: true })
    const combo = (await repo.listCombos())[0]!
    expect([combo.nameZhTW, combo.favorite]).toEqual(['新名', true])
    await repo.deleteCombo(id)
    expect(await repo.listCombos()).toEqual([])
  })
})

describe('3on3 儲存（第 32 節）', () => {
  beforeEach(async () => {
    await repo.loadCatalog(catalog)
  })

  async function addDeckCombo(nameZhTW: string, slots: { bladeId: string; ratchetId: string; bitId: string }) {
    return repo.saveCombo({
      nameZhTW,
      system: 'BX',
      slots,
      favorite: false,
      physicallyBuilt: false,
    })
  }

  it('可以儲存與刪除合法隊伍', async () => {
    const comboIds = await Promise.all([
      addDeckCombo('第一套', {
        bladeId: 'test-blade-a',
        ratchetId: 'test-ratchet-a',
        bitId: 'test-bit-a',
      }),
      addDeckCombo('第二套', {
        bladeId: 'test-blade-b',
        ratchetId: 'test-ratchet-b',
        bitId: 'test-bit-b',
      }),
      addDeckCombo('第三套', {
        bladeId: 'test-blade-c',
        ratchetId: 'test-ratchet-c',
        bitId: 'test-bit-c',
      }),
    ])
    await repo.addStandalonePart({ partId: 'test-blade-a', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-blade-b', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-blade-c', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-ratchet-a', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-ratchet-b', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-ratchet-c', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-bit-a', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-bit-b', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-bit-c', quantity: 1, status: 'available' })

    const id = await repo.saveDeck({ nameZhTW: '我的隊伍', comboIds })
    expect((await repo.listDecks()).length).toBe(1)
    await repo.deleteDeck(id)
    expect(await repo.listDecks()).toEqual([])
  })

  it('拒絕不足三套、遺失配置，或超過庫存的隊伍', async () => {
    const comboId = await addDeckCombo('第一套', {
      bladeId: 'test-blade-a',
      ratchetId: 'test-ratchet-a',
      bitId: 'test-bit-a',
    })

    await expect(repo.saveDeck({ nameZhTW: '不足三套', comboIds: [comboId] })).rejects.toThrow(
      '隊伍必須剛好有 3 套配裝',
    )
    await expect(
      repo.saveDeck({ nameZhTW: '遺失配置', comboIds: [comboId, comboId, 'missing-combo'] }),
    ).rejects.toThrow('找不到配裝')

    const secondId = await addDeckCombo('第二套', {
      bladeId: 'test-blade-b',
      ratchetId: 'test-ratchet-a',
      bitId: 'test-bit-a',
    })
    const thirdId = await addDeckCombo('第三套', {
      bladeId: 'test-blade-c',
      ratchetId: 'test-ratchet-a',
      bitId: 'test-bit-a',
    })
    await repo.addStandalonePart({ partId: 'test-blade-a', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-blade-b', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-blade-c', quantity: 1, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-ratchet-a', quantity: 2, status: 'available' })
    await repo.addStandalonePart({ partId: 'test-bit-a', quantity: 2, status: 'available' })

    await expect(
      repo.saveDeck({ nameZhTW: '零件超量', comboIds: [comboId, secondId, thirdId] }),
    ).rejects.toThrow('可用只有 2 個')
  })
})

describe('想買清單（第 35 節）', () => {
  beforeEach(async () => {
    await repo.loadCatalog(catalog)
  })

  it('可以加入與移除', async () => {
    const id = await repo.addWishlistItem({ productId: fixedProduct.id, quantity: 1 })
    expect((await repo.listWishlist()).length).toBe(1)
    await repo.deleteWishlistItem(id)
    expect(await repo.listWishlist()).toEqual([])
  })
})

describe('我的零件標記（第 10 節）', () => {
  beforeEach(async () => {
    await repo.loadCatalog(catalog)
  })

  it('可以收藏、寫備註，清空後不留下無意義資料', async () => {
    await repo.updatePartPreference('test-bit-a', { favorite: true, notes: '比賽用' })
    expect(await repo.listPartPreferences()).toEqual([
      { partId: 'test-bit-a', favorite: true, notes: '比賽用' },
    ])

    await repo.updatePartPreference('test-bit-a', { favorite: false, notes: '' })
    expect(await repo.listPartPreferences()).toEqual([])
  })

  it('不存在的零件不能建立個人標記', async () => {
    await expect(repo.updatePartPreference('missing-part', { favorite: true })).rejects.toThrow(
      '找不到零件',
    )
  })
})

describe('匯出與匯入（第 37 節）', () => {
  beforeEach(async () => {
    await repo.loadCatalog(catalog)
  })

  it('匯出內容包含商品、零件、配裝、3on3、想買清單與設定', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 1, status: 'owned' })
    const backup = await repo.exportBackup()
    expect(Object.keys(backup).sort()).toEqual(
      [
        'catalogVersion',
        'decks',
        'inventoryLots',
        'ownedProducts',
        'partPreferences',
        'savedCombos',
        'schemaVersion',
        'settings',
        'wishlist',
      ].sort(),
    )
  })

  it('匯入備份後資料完整回復', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 2, status: 'owned' })
    await repo.addStandalonePart({ partId: 'test-bit-b', quantity: 1, status: 'available' })
    await repo.updatePartPreference('test-bit-b', { favorite: true, notes: '備份測試' })
    const backup = await repo.exportBackup()

    const otherDb = createDb('beyblade-test-import')
    const otherRepo = createRepository(otherDb)
    await otherDb.open()
    await otherRepo.loadCatalog(catalog)
    await otherRepo.importBackup(backup)

    expect((await otherRepo.listOwnedProducts()).length).toBe(1)
    expect((await otherRepo.getPartStockMap()).get('test-blade-a')?.available).toBe(2)
    expect((await otherRepo.getPartStockMap()).get('test-bit-b')?.available).toBe(1)
    expect(await otherRepo.listPartPreferences()).toEqual([
      { partId: 'test-bit-b', favorite: true, notes: '備份測試' },
    ])
    await otherDb.delete()
  })

  it('匯入會覆蓋既有個人資料，不留下舊資料', async () => {
    await repo.addOwnedProduct({ productId: fixedProduct.id, quantity: 1, status: 'owned' })
    const backup = await repo.exportBackup()
    await repo.addOwnedProduct({ productId: deckSetProduct.id, quantity: 1, status: 'owned' })
    await repo.importBackup(backup)
    const owned = await repo.listOwnedProducts()
    expect(owned.length).toBe(1)
    expect(owned[0]!.productId).toBe(fixedProduct.id)
  })

  it('格式錯誤的備份會被拒絕', async () => {
    await expect(repo.importBackup({ 亂資料: true } as never)).rejects.toThrow('備份格式不正確')
  })

  it('版本過新的備份會被拒絕', async () => {
    const backup = await repo.exportBackup()
    await expect(repo.importBackup({ ...backup, schemaVersion: 999 })).rejects.toThrow(
      '備份版本過新',
    )
  })
})

describe('設定（第 38 節 新手／進階模式）', () => {
  it('預設為新手模式', async () => {
    expect((await repo.getSettings()).mode).toBe('beginner')
  })

  it('可以切換為進階模式並保存', async () => {
    await repo.updateSettings({ mode: 'advanced' })
    expect((await repo.getSettings()).mode).toBe('advanced')
  })
})

describe('沒有官方款式清單時的開封登記（第 13 節）', () => {
  beforeEach(async () => {
    await repo.loadCatalog({ ...catalog, productVariants: [] })
  })

  it('登記實際抽到的零件後才加入庫存', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 2,
      status: 'owned',
      sealedQuantity: 2,
    })
    expect((await repo.getPartStockMap()).size).toBe(0)

    await repo.recordOpenedContents(id, 1, [{ partId: 'test-blade-b', quantity: 1 }])

    const stock = await repo.getPartStockMap()
    expect(stock.get('test-blade-b')?.available).toBe(1)
    const owned = (await repo.listOwnedProducts())[0]!
    expect(owned.sealedQuantity).toBe(1)
    expect(owned.manualOpenedQuantity).toBe(1)
  })

  it('來源仍指向該商品，可追蹤', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 1,
      status: 'owned',
      sealedQuantity: 1,
    })
    await repo.recordOpenedContents(id, 1, [{ partId: 'test-bit-b', quantity: 1 }])
    const sources = await repo.describeSources('test-bit-b')
    expect(sources).toHaveLength(1)
    expect(sources[0]!.labelZhTW).toBe('開封登記')
    expect(sources[0]!.sourceId).toBe(id)
  })

  it('開封盒數超過未拆封數時被拒絕', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 1,
      status: 'owned',
      sealedQuantity: 1,
    })
    await expect(
      repo.recordOpenedContents(id, 2, [{ partId: 'test-bit-b', quantity: 1 }]),
    ).rejects.toThrow('開封數量不可超過未拆封盒數')
  })

  it('沒有登記任何零件時被拒絕', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 1,
      status: 'owned',
      sealedQuantity: 1,
    })
    await expect(repo.recordOpenedContents(id, 1, [])).rejects.toThrow('請至少登記一個實際抽到的零件')
  })

  it('刪除商品時連帶清掉開封登記的批次', async () => {
    const id = await repo.addOwnedProduct({
      productId: randomProduct.id,
      quantity: 1,
      status: 'owned',
      sealedQuantity: 1,
    })
    await repo.recordOpenedContents(id, 1, [{ partId: 'test-bit-b', quantity: 1 }])
    await repo.deleteOwnedProduct(id)
    expect((await repo.getPartStockMap()).size).toBe(0)
    expect(await repo.getAllLots()).toEqual([])
  })
})
