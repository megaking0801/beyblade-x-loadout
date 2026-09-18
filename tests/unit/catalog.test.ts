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

  it('已知的隨機包款式與 CX 紋章可作為社群來源零件收錄', () => {
    for (const id of ['bit:Nr', 'blade:クロックミラージュ', 'lock_chip:Vl', 'assist_blade:W']) {
      const part = catalog.parts.find((row) => row.id === id)
      expect(part, `缺少社群補充零件：${id}`).toBeDefined()
      expect(part?.provenance.verificationStatus).toBe('community_only')
      expect(part?.provenance.sourceUrls.some((url) => url.includes('beybladehub.app'))).toBe(true)
    }
    // 觀測筆數會隨 BeybladeHub 賽事頁增加，只守「有收到而且每筆都對得到零件」。
    const observations = catalog.tournamentObservations ?? []
    expect(observations.length).toBeGreaterThanOrEqual(9)
    const partIds = new Set(catalog.parts.map((part) => part.id))
    for (const observation of observations) {
      const ids = observation.comboPartIds ?? Object.values(observation.slots ?? {})
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) expect(partIds.has(id as string)).toBe(true)
    }
  })

  it('台灣賽事的名次觀測有收進來，且來源可追溯', () => {
    const taiwanEvents = (catalog.tournamentEvents ?? []).filter((event) =>
      event.sourceUrl?.includes('beybladehub.app/tournaments'),
    )
    expect(taiwanEvents.length).toBeGreaterThanOrEqual(10)
    for (const event of taiwanEvents) {
      expect(event.sourceTier).toBe('community')
      expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('每筆商品都有官方來源網址與驗證狀態', () => {
    for (const product of catalog.products) {
      expect(product.provenance.sourceUrls.length).toBeGreaterThan(0)
      expect(product.provenance.sourceUrls[0]).toContain('takaratomy.co.jp')
      expect(['official_verified', 'multi_source_verified', 'community_only', 'needs_review'])
        .toContain(product.provenance.verificationStatus)
    }
  })

  it('圖片一律可追溯來源，並保留缺圖稽核', () => {
    expect(catalog.images.length).toBe(catalogAudit.imageCount)
    expect(catalog.images.length).toBeGreaterThanOrEqual(100)
    /*
     * 圖片已改成本機副本（專案擁有者決定自存一份，避免來源改路徑就整批破圖）。
     * 鏡像不等於取得授權，所以狀態是 unknown 而不是 permission_granted；
     * 原始網址與來源名稱都要留著，前台才交代得出來。
     */
    for (const image of catalog.images) {
      if (image.isLocalMirror) {
        expect(image.usageStatus).toBe('unknown')
        expect(image.url.startsWith('/img/')).toBe(true)
        expect(image.remoteUrl).toBeDefined()
      } else {
        expect(image.usageStatus).toBe('link_only')
      }
    }
    // 官方商品圖與社群零件圖的來源網域兩者都要能追溯。
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
      expect(['link_only', 'unknown']).toContain(image.usageStatus)
      expect(image.sourceName.trim().length).toBeGreaterThan(0)
      expect(image.sourceUrl.trim().length).toBeGreaterThan(0)
      expect(catalog.parts.some((part) => part.id === image.entityId)).toBe(true)
    }
  })

  it('不得把社群去背圖的版權掛給社群站（第 1.5、25 節）', () => {
    /*
     * 去背圖是社群整理的，原始商品外觀的著作權仍屬 Takara Tomy。
     * 以前把 copyrightOwner 寫成 BeybladeHub，那是捏造的歸屬。
     * 不知道版權人時就留空，並讓 sourceName／sourceUrl 指向實際取圖的地方。
     */
    const hubImages = catalog.images.filter((image) =>
      (image.remoteUrl ?? image.url).includes('beybladehub.app'),
    )
    expect(hubImages.length).toBeGreaterThan(100)
    for (const image of hubImages) {
      expect(image.copyrightOwner).toBeUndefined()
      expect(image.sourceUrl).toContain('beybladehub.app')
      expect(image.sourceName).toContain('BeybladeHub')
    }
  })

  it('官方商品圖仍標明版權人為 Takara Tomy', () => {
    const official = catalog.images.filter((image) =>
      (image.remoteUrl ?? image.url).includes('takaratomy.co.jp'),
    )
    expect(official.length).toBeGreaterThan(0)
    for (const image of official) {
      expect(image.copyrightOwner).toBe('Takara Tomy')
    }
  })

  it('每張圖都能對應到存在的商品或零件', () => {
    for (const image of catalog.images) {
      const exists =
        image.entityType === 'part'
          ? catalog.parts.some((part) => part.id === image.entityId)
          : catalog.products.some((product) => product.id === image.entityId)
      expect(exists, `${image.id} 指向不存在的 ${image.entityType}`).toBe(true)
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
  it('隨機補充包沒有預設內容，款式只採用官方說明書資料', () => {
    const randoms = catalog.products.filter((product) => product.isRandom)
    expect(randoms.length).toBeGreaterThan(0)
    for (const product of randoms) {
      expect(product.contents).toEqual([])
    }
    expect(catalog.productVariants.length).toBeGreaterThan(0)
    for (const product of randoms) {
      expect(catalog.productVariants.some((variant) => variant.productId === product.id)).toBe(true)
    }
    for (const variant of catalog.productVariants) {
      expect(randoms.some((product) => product.id === variant.productId)).toBe(true)
      expect(variant.contents.length).toBeGreaterThan(0)
      expect(variant.probability).toBeUndefined()
      expect(variant.provenance.verificationStatus).toBe('official_verified')
    }
  })

  it('內容未知的商品一律標記為待查', () => {
    for (const product of catalog.products) {
      const expectsContents = !['tool', 'accessory'].includes(product.category)
      if (expectsContents && product.contents.length === 0 && !product.isRandom) {
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
      /*
       * 零件身分與數值的來源分開記。
       * 官方商品名有列的零件，身分是官方來源；
       * CX 的紋章／主刃／超越戰刃連名稱都只有社群站有，身分本身就是社群來源。
       */
      /*
       * 身分的驗證狀態必須跟來源網域一致，這條比「一律官方」更能真的擋住亂標：
       *  - official_verified：名稱來自官方商品名（官方一覽頁）
       *  - community_only：只有社群站有（CX 的紋章／主刃／超越、只出現在套裝內的上蓋）
       */
      const status = part.provenance.verificationStatus
      expect(['official_verified', 'community_only']).toContain(status)
      const urls = part.provenance.sourceUrls.join(' ')
      if (status === 'official_verified') {
        expect(urls, `${part.id} 標官方卻沒有官方來源`).toContain('takaratomy.co.jp')
      } else {
        expect(urls, `${part.id} 標社群卻沒有社群來源`).toContain('beybladehub.app')
      }
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
    // UX-15 含一顆 CX：上蓋拆成鎖定紋章＋主刃之後零件數多一個。
    ['ux15', 11],
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

  it('仍未拆分的 CX 上蓋可以通過相容性檢查（不需要鎖定紋章）', () => {
    // 社群站還沒收錄紋章／主刃的那幾顆維持合併，這時鎖定紋章槽不該出現。
    const fused = catalog.parts.find((part) => part.cxFused)
    expect(fused).toBeDefined()
    const result = checkCompatibility({
      slots: {
        mainBladeId: fused!.id,
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

describe('CX 四件式超越拆組（第 9、17 節）', () => {
  /**
   * 官方商品名把超越戰刃與輔助戰刃寫成相鄰兩個字母（バハムートブリッツ「BK」）。
   * 拆錯的話會產生一顆不存在的「BK 輔助戰刃」，商品內容也會少一片。
   * 四件式這件事來自 BeybladeHub 商品頁，已逐筆確認 CX-13／CX-14／CX-15。
   */
  it('超越戰刃是獨立零件，且標社群來源', () => {
    const overBlades = catalog.parts.filter((part) => part.family === 'over_blade')
    expect(overBlades.length).toBeGreaterThan(0)
    for (const part of overBlades) {
      expect(part.code.length).toBe(1)
      expect(part.provenance.verificationStatus).toBe('community_only')
      expect(part.provenance.sourceUrls.some((url) => url.includes('beybladehub.app'))).toBe(true)
    }
  })

  it('不會再出現兩個字母的輔助戰刃', () => {
    const twoLetter = catalog.parts.filter(
      (part) => part.family === 'assist_blade' && part.code.length > 1,
    )
    expect(twoLetter.map((part) => part.code)).toEqual([])
  })

  it('四件式主刃有 cxOverBlade 標記，三件式沒有', () => {
    const four = catalog.parts.filter((part) => part.cxOverBlade)
    expect(four.length).toBeGreaterThan(0)
    for (const part of four) {
      expect(part.family).toBe('main_blade')
      // 拆開後的金屬主刃是獨立零件（id 帶 metal- 前綴避免與普通主刃撞號）。
      expect(part.id.startsWith('main_blade:metal-') || part.cxFused === true).toBe(true)
    }
    const three = catalog.parts.find((part) => part.id === 'main_blade:Br')
    expect(three?.cxOverBlade).toBeUndefined()
  })

  it('四件式商品的內容含主刃、超越戰刃、輔助戰刃、固鎖與軸心', () => {
    const product = catalog.products.find((row) => row.sku === 'CX-13')
    expect(product).toBeDefined()
    const families = product!.contents
      .map((content) => catalog.parts.find((part) => part.id === content.partId)?.family)
      .filter(Boolean)
    expect(families).toEqual([
      'lock_chip',
      'main_blade',
      'over_blade',
      'assist_blade',
      'ratchet',
      'bit',
    ])
  })

  it('四件式配裝可以通過相容性檢查', () => {
    const main = catalog.parts.find((part) => part.cxOverBlade)!
    const chip = catalog.parts.find((part) => part.family === 'lock_chip')!
    const over = catalog.parts.find((part) => part.family === 'over_blade')!
    const assist = catalog.parts.find((part) => part.family === 'assist_blade')!
    const result = checkCompatibility({
      slots: {
        lockChipId: chip.id,
        mainBladeId: main.id,
        overBladeId: over.id,
        assistBladeId: assist.id,
        ratchetId: 'ratchet:3-60',
        bitId: 'bit:F',
      },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.ok).toBe(true)
    expect(result.system).toBe('CX')
  })

  it('四件式主刃少了超越戰刃會被擋下', () => {
    const main = catalog.parts.find((part) => part.cxOverBlade)!
    const chip = catalog.parts.find((part) => part.family === 'lock_chip')!
    const assist = catalog.parts.find((part) => part.family === 'assist_blade')!
    const result = checkCompatibility({
      slots: {
        lockChipId: chip.id,
        mainBladeId: main.id,
        assistBladeId: assist.id,
        ratchetId: 'ratchet:3-60',
        bitId: 'bit:F',
      },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.map((issue) => issue.messageZhTW)).toContain('尚未選擇超越戰刃')
  })
})

describe('稽核要把「刻意不填」與「真的缺」分開（第 13、42 節）', () => {
  it('隨機補充包的固定內容刻意留空，款式改記在官方款式清單', () => {
    expect(catalogAudit.randomContentsByDesign).toEqual([])
    const randomIds = new Set(catalogAudit.randomBoosterVariants.applied.map((row) => row.productId))
    for (const product of catalog.products.filter((row) => row.isRandom)) {
      expect(randomIds.has(product.id), `${product.id} 應有官方款式`).toBe(true)
    }
    for (const row of catalogAudit.contentsUnknownProducts) {
      const product = catalog.products.find((item) => item.id === row.id)
      expect(product?.isRandom).toBe(false)
    }
  })

  it('配件類記在無零件商品，也不算待查', () => {
    expect(catalogAudit.noPartsProducts.length).toBeGreaterThan(0)
    for (const row of catalogAudit.noPartsProducts) {
      expect(['tool', 'accessory']).toContain(row.category)
    }
    const unknownIds = new Set(catalogAudit.contentsUnknownProducts.map((row) => row.id))
    for (const row of catalogAudit.noPartsProducts) {
      expect(unknownIds.has(row.id)).toBe(false)
    }
  })

  it('真正待查的只剩套裝，數量遠少於混在一起時', () => {
    expect(catalogAudit.contentsUnknownProducts.length).toBeLessThan(
      catalogAudit.randomContentsByDesign.length + catalogAudit.noPartsProducts.length,
    )
    for (const row of catalogAudit.contentsUnknownProducts) {
      const product = catalog.products.find((item) => item.id === row.id)
      expect(['deck_set', 'battle_set', 'entry_set', 'part_set', 'starter', 'booster']).toContain(
        product?.category,
      )
    }
  })
})

describe('CX 紋章與主刃拆開（第 9、17 節）', () => {
  /**
   * 官方只公布合併後的上蓋名稱，個別的鎖定紋章與主刃名稱只有 BeybladeHub 有。
   * 拆開的重點是「同一顆紋章可以換不同主刃」，這是 CX 系統的賣點。
   * 社群站還沒收錄的那幾顆維持合併，不硬拆。
   */
  it('拆出來的紋章與主刃都是獨立零件，且標社群來源', () => {
    const chips = catalog.parts.filter((part) => part.family === 'lock_chip')
    expect(chips.length).toBeGreaterThan(5)
    for (const chip of chips) {
      expect(chip.provenance.verificationStatus).toBe('community_only')
      expect(chip.provenance.sourceUrls.some((url) => url.includes('beybladehub.app'))).toBe(true)
      expect(chip.naming.primaryZhTW).not.toMatch(/[぀-ヿ]/)
    }
  })

  it('金屬主刃與同代號的普通主刃不會撞號', () => {
    const metal = catalog.parts.find((part) => part.id === 'main_blade:metal-Fr')
    const plain = catalog.parts.find((part) => part.id === 'main_blade:Fr')
    expect(metal).toBeDefined()
    expect(plain).toBeDefined()
    expect(metal!.naming.primaryZhTW).not.toBe(plain!.naming.primaryZhTW)
    expect(metal!.cxOverBlade).toBe(true)
    expect(plain!.cxOverBlade).toBeUndefined()
  })

  it('搬遷表把每顆被拆開的合併件指到紋章 + 主刃', () => {
    const migrations = catalog.partIdMigrations ?? {}
    expect(Object.keys(migrations).length).toBe(catalogAudit.cxSplitBlades.length)
    for (const [oldId, newIds] of Object.entries(migrations)) {
      expect(oldId.startsWith('main_blade:')).toBe(true)
      // 舊 id 必須真的已經不在圖鑑裡，否則搬遷不會被觸發
      expect(catalog.parts.some((part) => part.id === oldId)).toBe(false)
      expect(newIds).toHaveLength(2)
      const families = newIds.map(
        (id) => catalog.parts.find((part) => part.id === id)?.family,
      )
      expect(families).toEqual(['lock_chip', 'main_blade'])
    }
  })

  it('可以把不同商品的紋章與主刃混搭成合法配裝', () => {
    // 蒼龍（CX-01）的紋章配上幽冥（CX-03）的主刃，官方沒有這樣賣，但實體可以這樣組。
    const result = checkCompatibility({
      slots: {
        lockChipId: 'lock_chip:Dr',
        mainBladeId: 'main_blade:Dr',
        assistBladeId: 'assist_blade:R',
        ratchetId: 'ratchet:3-60',
        bitId: 'bit:F',
      },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(result.ok).toBe(true)
    expect(result.system).toBe('CX')
  })

  it('社群站沒收錄的那幾顆維持合併，並記在稽核報告', () => {
    expect(catalogAudit.cxUnsplitBlades.length).toBeGreaterThan(0)
    for (const row of catalogAudit.cxUnsplitBlades) {
      const part = catalog.parts.find((item) => item.id === row.fusedId)
      expect(part?.cxFused).toBe(true)
    }
  })
})

describe('固鎖一體型商品（第 17 節）', () => {
  /**
   * 這些商品的官方名稱裡沒有固鎖代號（例：バレットグリフォンH），
   * 以前一律判成「解析不出零件組成」，內容整筆空白。
   * 「哪些零件是固鎖一體型」官方沒公布，來源是 BeybladeHub 的零件頁。
   */
  it('UX 擴張上蓋歸在特殊一體式並標記固鎖一體型', () => {
    const blade = catalog.parts.find((part) => part.id === 'integrated_blade:バレットグリフォン')
    expect(blade).toBeDefined()
    expect(blade!.family).toBe('integrated_blade')
    expect(blade!.integratedRatchet).toBe(true)
    expect(blade!.provenance.verificationStatus).toBe('community_only')
  })

  it('固鎖一體型軸心也有標記', () => {
    const bit = catalog.parts.find((part) => part.id === 'bit:Tr')
    expect(bit?.integratedRatchet).toBe(true)
  })

  it('UX-19 的內容是上蓋 + 軸心，沒有固鎖', () => {
    const product = catalog.products.find((row) => row.sku === 'UX-19')
    const families = product!.contents
      .map((content) => catalog.parts.find((part) => part.id === content.partId)?.family)
      .filter(Boolean)
    expect(families).toEqual(['integrated_blade', 'bit'])
  })

  it('CX-07 的內容是紋章 + 主刃 + 輔助 + 一體型軸心，沒有固鎖', () => {
    const product = catalog.products.find((row) => row.id === 'cx07')
    const families = product!.contents
      .map((content) => catalog.parts.find((part) => part.id === content.partId)?.family)
      .filter(Boolean)
    expect(families).toEqual(['lock_chip', 'main_blade', 'assist_blade', 'bit'])
  })

  it('這些商品可以通過相容性檢查', () => {
    const ux19 = checkCompatibility({
      slots: { bladeId: 'integrated_blade:バレットグリフォン', bitId: 'bit:H' },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(ux19.ok).toBe(true)

    const cx07 = checkCompatibility({
      slots: {
        lockChipId: 'lock_chip:Pg',
        mainBladeId: 'main_blade:Bl',
        assistBladeId: 'assist_blade:A',
        bitId: 'bit:Tr',
      },
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
    })
    expect(cx07.ok).toBe(true)
    expect(cx07.system).toBe('CX')
  })
})

describe('套裝內容已全部補齊（第 14、24、41 節）', () => {
  /**
   * 官方一覽頁不列套裝內含哪幾顆，以前這些商品內容全空、登記一盒也不會進任何零件。
   * 現在改成逐筆讀 BeybladeHub 商品頁彙整，每筆都附網址與原文引述。
   */
  it('除了隨機商品與配件，每個商品都有內容', () => {
    const empty = catalog.products.filter(
      (product) =>
        product.contents.length === 0 &&
        !product.isRandom &&
        !['tool', 'accessory'].includes(product.category),
    )
    expect(empty.map((product) => product.id)).toEqual([])
  })

  it('稽核的兩個缺漏欄位都清空了', () => {
    expect(catalogAudit.contentsUnknownProducts).toEqual([])
    expect(catalogAudit.unparsedBeyProducts).toEqual([])
  })

  it('人工彙整的套裝都標社群來源，並附商品頁網址', () => {
    expect(catalogAudit.curatedSets.applied.length).toBeGreaterThan(5)
    expect(catalogAudit.curatedSets.failed).toEqual([])
    for (const row of catalogAudit.curatedSets.applied) {
      const product = catalog.products.find((item) => item.id === row.productId)
      expect(product?.provenance.verificationStatus).toBe('community_only')
      expect(product?.provenance.sourceUrls.some((url) => url.includes('beybladehub.app'))).toBe(
        true,
      )
    }
  })

  it('多顆套裝的內容數量對得上顆數', () => {
    // BX-46 兩顆三件式 = 6 件；CX-11 一顆 CX（含紋章／主刃／輔助／一體型軸心）+ 兩顆三件式 = 10 件
    expect(catalog.products.find((row) => row.id === 'bx46')?.contents).toHaveLength(6)
    expect(catalog.products.find((row) => row.id === 'cx11')?.contents).toHaveLength(10)
    expect(catalog.products.find((row) => row.id === 'bx00-25set')?.contents).toHaveLength(12)
  })

  it('只出現在套裝內的上蓋標社群來源，且名稱是中文', () => {
    const setOnly = catalog.parts.find((part) => part.id === 'blade:ゴートタックル')
    expect(setOnly).toBeDefined()
    expect(setOnly!.provenance.verificationStatus).toBe('community_only')
    expect(setOnly!.naming.primaryZhTW).toBe('戰羊阻截')
  })
})

describe('圖片本機副本（第 25 節）', () => {
  /**
   * 原本全部是外部連結，來源改路徑或擋掉就整批破圖。
   * 專案擁有者決定自存一份，但鏡像不等於取得授權，所以：
   *  - usageStatus 標 unknown，不寫成 permission_granted
   *  - 原始網址與來源名稱都保留，前台照樣顯示來源
   */
  it('每張圖都有本機副本，並保留原始網址', () => {
    expect(catalogAudit.localImages.mirrored).toBe(catalog.images.length)
    expect(catalogAudit.localImages.stillRemote).toBe(0)
    for (const image of catalog.images) {
      expect(image.isLocalMirror).toBe(true)
      expect(image.url).toMatch(/^\/img\/[0-9a-f]{16}\.(webp|png|jpg)$/)
      expect(image.remoteUrl).toMatch(/^https:\/\//)
      expect(image.sourceUrl).toMatch(/^https:\/\//)
    }
  })

  it('不得把鏡像講成已取得授權', () => {
    for (const image of catalog.images) {
      expect(image.usageStatus).not.toBe('permission_granted')
      expect(image.usageStatus).toBe('unknown')
    }
  })

  it('本機路徑不重複指到同一個實體時仍各自對得上原始網址', () => {
    const byUrl = new Map<string, Set<string>>()
    for (const image of catalog.images) {
      const set = byUrl.get(image.url) ?? new Set<string>()
      set.add(image.remoteUrl as string)
      byUrl.set(image.url, set)
    }
    // 同一個本機檔可以被多筆共用（同一顆上蓋的商品圖與零件圖），
    // 但它們必須來自同一個原始網址，否則表示對應表出錯。
    for (const [localPath, remotes] of byUrl) {
      expect(remotes.size, `${localPath} 對到多個原始網址`).toBe(1)
    }
  })
})

describe('可切換模式的零件（第 20 節 B）', () => {
  it('標記的零件都對得到圖鑑，且附得出來源與原文引述', () => {
    const switchable = catalog.parts.filter((part) => part.switchableModes)
    expect(switchable.length).toBeGreaterThanOrEqual(4)
    for (const part of switchable) {
      const modes = part.switchableModes!
      expect(modes.modes.length).toBeGreaterThanOrEqual(2)
      expect(modes.sourceUrl).toMatch(/^https:\/\/beybladehub\.app\//)
      expect(modes.quoteZhTW.trim().length).toBeGreaterThan(10)
      expect(modes.howZhTW.trim().length).toBeGreaterThan(0)
    }
  })

  it('CX-09 的主刃「滅世」有紅藍兩面，且分別標了效果', () => {
    const part = catalog.parts.find((row) => row.id === 'main_blade:Ec')
    const names = part?.switchableModes?.modes.map((mode) => mode.nameZhTW)
    expect(names).toEqual(['上撃模式', '重擊模式'])
    const sides = part?.switchableModes?.modes.map((mode) => mode.sideZhTW)
    expect(sides).toEqual(['紅面', '藍面'])
  })

  it('只改高度、不改攻防型態的零件不列入（TK、TP）', () => {
    for (const id of ['bit:TK', 'bit:TP']) {
      expect(catalog.parts.find((row) => row.id === id)?.switchableModes).toBeUndefined()
    }
  })
})
