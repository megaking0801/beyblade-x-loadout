import { describe, expect, it } from 'vitest'
import { auditCatalog, catalog, catalogAudit, catalogMeta } from '../../src/catalog/index.ts'
import { checkCompatibility } from '../../src/domain/compatibility.ts'
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
    expect(catalog.products.length).toBeGreaterThanOrEqual(150)
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

  it('商品主圖只以可追溯的外部連結方式記錄，並保留缺圖稽核', () => {
    expect(catalog.images.length).toBe(catalogAudit.imageCount)
    expect(catalog.images.length).toBeGreaterThanOrEqual(100)
    expect(catalog.images.every((image) => image.usageStatus === 'link_only')).toBe(true)
    expect(catalog.images.every((image) => /(?:takaratomy\.co\.jp|rakuten\.co\.jp|amazon\.co\.jp)/.test(image.sourceUrl))).toBe(true)
    expect(catalog.images.every((image) => image.sourceName.trim().length > 0)).toBe(true)
    expect(catalogAudit.productsWithoutImages.length).toBe(catalog.products.length - catalog.images.length)
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

  it('零件的類型、重量、旋向官方未公布，一律留空而非亂填', () => {
    for (const part of catalog.parts) {
      expect(part.type).toBeUndefined()
      expect(part.officialWeightG).toBeUndefined()
      expect(part.spinDirection).toBeUndefined()
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

  it('旋向資料缺漏會被標為警告而不是誤判為可組', () => {
    const result = checkCompatibility({
      slots: { bladeId: 'blade:ドランソード', ratchetId: 'ratchet:3-60', bitId: 'bit:F' },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]!.messageZhTW).toContain('缺少旋向資料')
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
  it('缺少旋向資料的警告用中文零件名稱', () => {
    const result = checkCompatibility({
      slots: { bladeId: 'blade:ドランソード', ratchetId: 'ratchet:3-60', bitId: 'bit:F' },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    for (const warning of result.warnings) {
      expect(warning.messageZhTW).not.toMatch(/[぀-ヿ]/)
      expect(warning.messageZhTW).not.toContain('blade:')
      expect(warning.messageZhTW).not.toContain('ratchet:')
      expect(warning.messageZhTW).not.toContain('bit:')
    }
    expect(result.warnings[0]!.messageZhTW).toContain('蒼龍神劍')
  })
})
