import { describe, expect, it } from 'vitest'
import { auditCatalog, catalog, catalogAudit, catalogMeta } from '../../src/catalog/index.ts'
import { checkCompatibility } from '../../src/domain/compatibility.ts'
import { analyzeCombo } from '../../src/domain/analysis.ts'
import { statFieldLabel } from '../../src/domain/provenance.ts'
import { formatPartLabel, formatProductLabel, resolveDisplayName } from '../../src/domain/naming.ts'

/**
 * 第 42 節 Catalog Audit：這些檢查是發布前的守門條件。
 * 第 49 節：不得只 seed 少量樣本卻讓 UI 看起來完整，故這裡也檢查規模與缺漏標記。
 */

describe('Catalog 基本完整性（第 42 節）', () => {
  it('稽核沒有任何問題', () => {
    expect(auditCatalog(catalog)).toEqual([])
  })

  it('收錄的商品數與零件數與稽核報告一致', () => {
    expect(catalog.products.length).toBe(catalogAudit.productCount)
    expect(catalog.parts.length).toBe(catalogAudit.partCount)
  })

  it('商品數達到官方一覽的規模，不是少量樣本', () => {
    expect(catalog.products.length).toBeGreaterThanOrEqual(145)
  })

  it('貼紙類周邊不收進圖鑑（沒有零件，對庫存與配裝沒有意義）', () => {
    expect(catalog.products.filter((product) => product.naming.nameJa?.includes('ステッカー'))).toEqual([])
  })

  it('零件涵蓋上蓋、固鎖、軸心、CX 主刃與輔助戰刃', () => {
    const families = new Set(catalog.parts.map((part) => part.family))
    expect(families).toContain('blade')
    expect(families).toContain('ratchet')
    expect(families).toContain('bit')
    expect(families).toContain('main_blade')
    expect(families).toContain('assist_blade')
  })

  it('每筆商品都有官方來源網址與驗證狀態', () => {
    for (const product of catalog.products) {
      expect(product.provenance.sourceUrls.length).toBeGreaterThan(0)
      expect(product.provenance.sourceUrls[0]).toContain('takaratomy.co.jp')
      expect(['official_verified', 'multi_source_verified', 'community_only', 'needs_review'])
        .toContain(product.provenance.verificationStatus)
    }
  })

  it('圖片只以可追溯的外部連結方式記錄，並保留缺圖稽核', () => {
    expect(catalog.images.length).toBe(catalogAudit.imageCount)
    expect(catalog.images.length).toBeGreaterThanOrEqual(100)
    expect(catalog.images.every((image) => image.usageStatus === 'link_only')).toBe(true)
    // 官方商品圖與社群零件圖都只連結、不重新散布，來源網域兩者都要能追溯。
    expect(
      catalog.images.every((image) =>
        /(?:takaratomy\.co\.jp|rakuten\.co\.jp|amazon\.co\.jp|beybladehub\.app)/.test(image.sourceUrl),
      ),
    ).toBe(true)
    expect(catalog.images.every((image) => image.sourceName.trim().length > 0)).toBe(true)
    const productImages = catalog.images.filter((image) => image.entityType === 'product')
    expect(catalogAudit.productsWithoutImages.length).toBe(
      catalog.products.length - productImages.length,
    )
  })

  it('零件也有圖，且標明來源與只連結不散布', () => {
    const partImages = catalog.images.filter((image) => image.entityType === 'part')
    expect(partImages.length).toBeGreaterThan(100)
    for (const image of partImages) {
      expect(image.usageStatus).toBe('link_only')
      expect((image.copyrightOwner ?? '').trim().length).toBeGreaterThan(0)
      expect(catalog.parts.some((part) => part.id === image.entityId)).toBe(true)
    }
  })

  it('Catalog 版本與來源資訊有記錄', () => {
    expect(catalogMeta.version).toContain('takaratomy-lineup')
    expect(catalogMeta.sourceUrl).toContain('beyblade.takaratomy.co.jp')
    expect(catalogMeta.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('前台名稱規則（第 1.4、5 節）', () => {
  it('所有商品主名稱都是中文，沒有日文假名', () => {
    for (const product of catalog.products) {
      expect(product.naming.primaryZhTW).not.toMatch(/[぀-ヿ]/)
    }
  })

  it('所有零件主名稱都是中文，沒有日文假名', () => {
    for (const part of catalog.parts) {
      expect(part.naming.primaryZhTW).not.toMatch(/[぀-ヿ]/)
    }
  })

  it('BeybladeHub 未收錄的名稱才標暫譯，收錄者不標', () => {
    const provisional = catalog.products.filter((product) => product.naming.isProvisionalZhTW)
    const confirmed = catalog.products.filter((product) => !product.naming.isProvisionalZhTW)
    expect(confirmed.length).toBeGreaterThan(0)
    for (const product of provisional) {
      expect(resolveDisplayName(product.naming).provisionalLabelZhTW).toBe('暫譯')
    }
    for (const product of confirmed) {
      expect(resolveDisplayName(product.naming).provisionalLabelZhTW).toBeUndefined()
    }
  })

  it('日文原名有保留在資料庫作為搜尋別名', () => {
    const withJa = catalog.products.filter((product) => product.naming.nameJa)
    expect(withJa.length).toBe(catalog.products.length)
  })
})

describe('不得編造內容（第 1.5 節）', () => {
  it('隨機補充包沒有預設內容，也沒有假造款式', () => {
    const randoms = catalog.products.filter((product) => product.isRandom)
    expect(randoms.length).toBeGreaterThan(0)
    for (const product of randoms) {
      expect(product.contents).toEqual([])
    }
    expect(catalog.productVariants).toEqual([])
  })

  it('內容未知的商品一律標記為待查', () => {
    for (const product of catalog.products) {
      const expectsContents = !['tool', 'accessory'].includes(product.category)
      if (expectsContents && product.contents.length === 0) {
        expect(product.provenance.verificationStatus).toBe('needs_review')
      }
    }
  })

  it('類型、重量、旋向來自社群實測，必須獨立記來源且不冒充官方', () => {
    const withStats = catalog.parts.filter(
      (part) => part.type || part.officialWeightG || part.spinDirection || part.bitContact,
    )
    expect(withStats.length).toBeGreaterThan(0)
    for (const part of withStats) {
      // 零件身分仍然是官方來源，數值則獨立標社群實測，兩者不混為一談。
      expect(part.provenance.verificationStatus).toBe('official_verified')
      expect(part.statsProvenance?.verificationStatus).toBe('community_only')
      expect(part.statsProvenance?.sourceUrls.length).toBeGreaterThan(0)
    }
    // 沒有數值的零件不得憑空掛上來源。
    for (const part of catalog.parts) {
      if (part.type || part.officialWeightG || part.spinDirection || part.bitContact) continue
      expect(part.statsProvenance).toBeUndefined()
    }
  })

  it('沒有任何相容性規則被憑空寫入', () => {
    expect(catalog.compatibilityRules).toEqual([])
  })

  it('稽核報告明確列出已知缺漏', () => {
    expect(catalogAudit.knownGaps.length).toBeGreaterThan(0)
    expect(catalogAudit.knownGaps.join('')).toContain('官方商品頁未公布零件的類型')
  })
})

describe('官方說明書補齊的套裝內容（第 14、24、41 節）', () => {
  it.each([
    ['bx07', 3],
    ['bx08', 9],
    ['bx17', 6],
    ['bx20', 9],
    ['bx21', 9],
    ['ux04', 6],
    ['ux07', 9],
    ['ux10', 13],
    ['ux15', 10],
  ])('%s 的可玩零件內容來自官方說明書', (id, expectedPartCount) => {
    const product = catalog.products.find((row) => row.id === id)
    expect(product?.contents.filter((content) => content.partId)).toHaveLength(expectedPartCount)
    expect(product?.provenance.verificationStatus).toBe('official_verified')
    expect(product?.provenance.sourceUrls.some((url) => url.includes('/manual/'))).toBe(true)
  })
})

describe('固鎖高度標示（第 20 節 A）', () => {
  it('固鎖的高度標示取自官方型號數字', () => {
    const r360 = catalog.parts.find((part) => part.id === 'ratchet:3-60')
    expect(r360?.heightCode).toBe(60)
    const m85 = catalog.parts.find((part) => part.id === 'ratchet:M-85')
    expect(m85?.heightCode).toBe(85)
  })

  it('每個固鎖都有高度標示', () => {
    for (const part of catalog.parts.filter((p) => p.family === 'ratchet')) {
      expect(typeof part.heightCode).toBe('number')
    }
  })
})

describe('實際 Catalog 可以組出合法配裝（第 17、18 節）', () => {
  it('BX 三件式可以通過相容性檢查', () => {
    const result = checkCompatibility({
      slots: { bladeId: 'blade:ドランソード', ratchetId: 'ratchet:3-60', bitId: 'bit:F' },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.ok).toBe(true)
    expect(result.system).toBe('BX')
  })

  it('CX 未拆分上蓋可以通過相容性檢查', () => {
    const result = checkCompatibility({
      slots: {
        mainBladeId: 'main_blade:ドランブレイブ',
        assistBladeId: 'assist_blade:S',
        ratchetId: 'ratchet:6-60',
        bitId: 'bit:V',
      },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.ok).toBe(true)
    expect(result.system).toBe('CX')
  })

  it('上蓋帶旋向時就不再抱怨旋向未知（固鎖與軸心左右通用）', () => {
    const result = checkCompatibility({
      slots: { bladeId: 'blade:ドランソード', ratchetId: 'ratchet:3-60', bitId: 'bit:F' },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.ok).toBe(true)
    expect(result.warnings.map((warning) => warning.messageZhTW).join()).not.toContain('旋向')
  })
})

describe('實際 Catalog 的前台標籤不得出現日文（第 1.4 節）', () => {
  it('每個零件的主標與分類都沒有日文假名', () => {
    for (const part of catalog.parts) {
      const label = formatPartLabel(part)
      expect(label.titleZhTW).not.toMatch(/[぀-ヿ]/)
      expect(label.familyZhTW).not.toMatch(/[぀-ヿ]/)
    }
  })

  it('每個商品的主標與分類都沒有日文假名', () => {
    for (const product of catalog.products) {
      const label = formatProductLabel(product)
      expect(label.titleZhTW).not.toMatch(/[぀-ヿ]/)
      expect(label.categoryZhTW).not.toMatch(/[぀-ヿ]/)
    }
  })
})

describe('相容性提示不得吐出內部 id 或日文（第 1.4 節）', () => {
  it('相容性警告用中文零件名稱', () => {
    // 未拆分的 CX 上蓋不需要鎖定紋章，硬選一個會產生警告，用它來檢查訊息寫法。
    const fused = catalog.parts.find((part) => part.cxFused)
    const assist = catalog.parts.find((part) => part.family === 'assist_blade')
    const result = checkCompatibility({
      slots: {
        bladeId: fused?.id,
        assistBladeId: assist?.id,
        ratchetId: 'ratchet:3-60',
        bitId: 'bit:F',
        lockChipId: fused?.id,
      },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    const messages = [...result.warnings, ...result.errors]
    expect(messages.length).toBeGreaterThan(0)
    for (const warning of messages) {
      expect(warning.messageZhTW).not.toMatch(/[぀-ヿ]/)
      expect(warning.messageZhTW).not.toContain('blade:')
      expect(warning.messageZhTW).not.toContain('ratchet:')
      expect(warning.messageZhTW).not.toContain('bit:')
    }
    // 相容性訊息一律用中文的槽位與零件分類用語，不夾雜代號。
    expect(messages.map((message) => message.messageZhTW).join()).toMatch(/[一-鿿]/)
  })
})

/**
 * 資料層的守門在上面「類型、重量、旋向來自社群實測」那條。
 * 這裡守的是顯示層：欄位標籤與配裝結果不能把社群數值講成官方數值。
 */
describe('社群數值在畫面上不得被講成官方數據（第 1.5、41 節）', () => {
  it('社群來源的數值欄位標籤不會冠上「官方」', () => {
    const community = catalog.parts.filter(
      (part) => part.statsProvenance?.verificationStatus === 'community_only',
    )
    expect(community.length).toBeGreaterThan(0)
    for (const part of community) {
      expect(statFieldLabel(part, '重量')).toBe('重量（社群實測）')
      expect(statFieldLabel(part, '重量')).not.toContain('官方')
    }
  })

  it('配裝分析會帶出社群數值的提醒與來源', () => {
    const result = analyzeCombo({
      slots: { bladeId: 'blade:ドランソード', ratchetId: 'ratchet:3-60', bitId: 'bit:F' },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
      lots: [],
      combos: [],
    })
    expect(result.objective.statsNoticeZhTW).toContain('社群圖鑑')
    expect(result.objective.statsSourceUrls?.[0]).toContain('beybladehub.app')
  })
})
