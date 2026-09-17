import { describe, expect, it } from 'vitest'
import {
  ASSEMBLY_ERROR_HEADLINE,
  checkCompatibility,
  deriveSystem,
  getSlotSchema,
  getSlotSchemaForSlots,
} from '../../src/domain/compatibility.ts'
import type { CompatibilityRule, ComboSlots, Part } from '../../src/domain/types.ts'

function p(
  id: string,
  family: Part['family'],
  system: Part['system'],
  spinDirection?: Part['spinDirection'],
): Part {
  return {
    id,
    family,
    system,
    code: id,
    naming: { primaryZhTW: id },
    spinDirection,
    provenance: { sourceUrls: [], verificationStatus: 'needs_review' },
  }
}

const parts: Part[] = [
  p('blade-r', 'blade', 'BX', 'right'),
  p('blade-l', 'blade', 'BX', 'left'),
  p('blade-ux', 'blade', 'UX', 'right'),
  p('blade-dual', 'blade', 'BX', 'dual'),
  p('ratchet-r', 'ratchet', 'BX', 'right'),
  p('ratchet-dual', 'ratchet', 'BX', 'dual'),
  p('bit-r', 'bit', 'BX', 'right'),
  p('bit-l', 'bit', 'BX', 'left'),
  p('bit-dual', 'bit', 'BX', 'dual'),
  p('chip-cx', 'lock_chip', 'CX'),
  p('main-cx', 'main_blade', 'CX', 'right'),
  p('assist-cx', 'assist_blade', 'CX'),
  p('integrated-ux', 'integrated_blade', 'UX', 'right'),
]

function check(slots: ComboSlots, rules: CompatibilityRule[] = []) {
  return checkCompatibility({ slots, parts, rules })
}

describe('槽位結構（第 17、18 節）', () => {
  it('BX 與 UX 為三槽：上蓋、固鎖、軸心', () => {
    expect(getSlotSchema('BX').map((s) => s.key)).toEqual(['bladeId', 'ratchetId', 'bitId'])
    expect(getSlotSchema('UX').map((s) => s.key)).toEqual(['bladeId', 'ratchetId', 'bitId'])
  })

  it('CX 完整槽位含超越戰刃：鎖定紋章、主刃、超越戰刃、輔助戰刃、固鎖、軸心', () => {
    // 四件式（超越拆組）是 CX 的最大結構；三件式會在 getSlotSchemaForSlots 被收掉。
    expect(getSlotSchema('CX').map((s) => s.key)).toEqual([
      'lockChipId',
      'mainBladeId',
      'overBladeId',
      'assistBladeId',
      'ratchetId',
      'bitId',
    ])
  })

  it('槽位帶有中文標籤供前台顯示（第 6 節）', () => {
    expect(getSlotSchema('BX').map((s) => s.labelZhTW)).toEqual(['上蓋', '固鎖', '軸心'])
  })
})

describe('系統推導', () => {
  it('有 CX 專用槽位時推導為 CX', () => {
    expect(deriveSystem({ lockChipId: 'chip-cx' }, parts)).toBe('CX')
  })

  it('上蓋為 UX 件時推導為 UX', () => {
    expect(deriveSystem({ bladeId: 'blade-ux' }, parts)).toBe('UX')
  })

  it('全為 BX 件時推導為 BX', () => {
    expect(deriveSystem({ bladeId: 'blade-r' }, parts)).toBe('BX')
  })

  it('完全空白時預設為 BX', () => {
    expect(deriveSystem({}, parts)).toBe('BX')
  })
})

describe('合法配裝', () => {
  it('BX 三件同旋向可以組裝', () => {
    const r = check({ bladeId: 'blade-r', ratchetId: 'ratchet-r', bitId: 'bit-r' })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('CX 五件齊全可以組裝', () => {
    const r = check({
      lockChipId: 'chip-cx',
      mainBladeId: 'main-cx',
      assistBladeId: 'assist-cx',
      ratchetId: 'ratchet-r',
      bitId: 'bit-r',
    })
    expect(r.ok).toBe(true)
  })

  it('雙旋向零件可搭配任一旋向', () => {
    expect(check({ bladeId: 'blade-l', ratchetId: 'ratchet-dual', bitId: 'bit-l' }).ok).toBe(true)
    expect(check({ bladeId: 'blade-dual', ratchetId: 'ratchet-r', bitId: 'bit-r' }).ok).toBe(true)
  })
})

describe('不完整配裝不可儲存（第 18、45 節 Case 8）', () => {
  it('缺軸心時不可組裝並指出缺哪一槽', () => {
    const r = check({ bladeId: 'blade-r', ratchetId: 'ratchet-r' })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('尚未選擇軸心')
  })

  it('完全空白時不可組裝', () => {
    expect(check({}).ok).toBe(false)
  })

  it('錯誤結果附上固定標題句（第 18 節）', () => {
    const r = check({ bladeId: 'blade-r' })
    expect(r.headlineZhTW).toBe(ASSEMBLY_ERROR_HEADLINE)
    expect(ASSEMBLY_ERROR_HEADLINE).toBe('此組合無法實際安裝。')
  })

  it('可組裝時不顯示錯誤標題', () => {
    const r = check({ bladeId: 'blade-r', ratchetId: 'ratchet-r', bitId: 'bit-r' })
    expect(r.headlineZhTW).toBeUndefined()
  })
})

describe('槽位與零件種類必須相符', () => {
  it('把軸心放進上蓋槽會被擋下', () => {
    const r = check({ bladeId: 'bit-r', ratchetId: 'ratchet-r', bitId: 'bit-r' })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('上蓋槽不能放入軸心')
  })

  it('不存在的零件 id 會被擋下', () => {
    const r = check({ bladeId: '不存在', ratchetId: 'ratchet-r', bitId: 'bit-r' })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('找不到零件資料：不存在')
  })
})

describe('系統混用限制（第 18 節）', () => {
  it('BX 與 UX 的三件式零件可互換', () => {
    const r = check({ bladeId: 'blade-ux', ratchetId: 'ratchet-r', bitId: 'bit-r' })
    expect(r.ok).toBe(true)
  })

  it('CX 專用件不能放進三件式配裝', () => {
    const r = check({ bladeId: 'main-cx', ratchetId: 'ratchet-r', bitId: 'bit-r' })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('上蓋槽不能放入主刃')
  })

  it('CX 配裝缺少輔助戰刃時不可組裝', () => {
    const r = check({
      lockChipId: 'chip-cx',
      mainBladeId: 'main-cx',
      ratchetId: 'ratchet-r',
      bitId: 'bit-r',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('尚未選擇輔助戰刃')
  })

  it('三件式配裝填入 CX 槽位時被擋下', () => {
    const r = check({
      bladeId: 'blade-r',
      ratchetId: 'ratchet-r',
      bitId: 'bit-r',
      assistBladeId: 'assist-cx',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.messageZhTW.includes('不使用輔助戰刃'))).toBe(true)
  })
})

describe('旋向限制（第 18 節）', () => {
  it('右旋上蓋配左旋軸心不可組裝', () => {
    const r = check({ bladeId: 'blade-r', ratchetId: 'ratchet-r', bitId: 'bit-l' })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('旋向衝突：右旋零件與左旋零件不能組在一起')
  })

  it('左旋上蓋配右旋軸心不可組裝', () => {
    const r = check({ bladeId: 'blade-l', ratchetId: 'ratchet-r', bitId: 'bit-r' })
    expect(r.ok).toBe(false)
  })

  it('單一零件旋向未知不阻擋，也不逐件警告（固鎖與軸心本來就左右通用）', () => {
    const r = checkCompatibility({
      slots: { bladeId: 'blade-unknown', ratchetId: 'ratchet-r', bitId: 'bit-r' },
      parts: [...parts, p('blade-unknown', 'blade', 'BX', undefined)],
      rules: [],
    })
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.messageZhTW).join()).not.toContain('旋向')
  })

  it('整組都查不到旋向時才提醒無法檢查', () => {
    const r = checkCompatibility({
      slots: { bladeId: 'blade-unknown', ratchetId: 'ratchet-unknown', bitId: 'bit-unknown' },
      parts: [
        p('blade-unknown', 'blade', 'BX', undefined),
        p('ratchet-unknown', 'ratchet', 'BX', undefined),
        p('bit-unknown', 'bit', 'BX', undefined),
      ],
      rules: [],
    })
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.messageZhTW)).toContain(
      '這套配裝的零件都查不到旋向，無法檢查左右旋相容性',
    )
  })
})

describe('資料驅動的特殊限制（第 18 節、第 1.5 節）', () => {
  const forbidRule: CompatibilityRule = {
    id: 'rule-forbid',
    kind: 'forbids',
    partId: 'bit-r',
    targetPartIds: ['ratchet-r'],
    reasonZhTW: '測試用：此軸心與此固鎖干涉',
    provenance: { sourceUrls: ['https://example.test/rule'], verificationStatus: 'official_verified' },
  }

  const requireRule: CompatibilityRule = {
    id: 'rule-require',
    kind: 'requires',
    partId: 'integrated-ux',
    targetFamilies: ['bit'],
    reasonZhTW: '測試用：此一體式上蓋必須搭配軸心',
    provenance: { sourceUrls: ['https://example.test/rule'], verificationStatus: 'official_verified' },
  }

  it('forbids 規則會擋下組合並顯示來源理由', () => {
    const r = check({ bladeId: 'blade-r', ratchetId: 'ratchet-r', bitId: 'bit-r' }, [forbidRule])
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('測試用：此軸心與此固鎖干涉')
    expect(r.errors.find((e) => e.ruleId === 'rule-forbid')?.sourceUrls).toEqual([
      'https://example.test/rule',
    ])
  })

  it('規則不相關時不影響結果', () => {
    const r = check({ bladeId: 'blade-r', ratchetId: 'ratchet-dual', bitId: 'bit-r' }, [forbidRule])
    expect(r.ok).toBe(true)
  })

  it('requires 規則在缺少必要種類時擋下', () => {
    const r = checkCompatibility({
      slots: { bladeId: 'integrated-ux', ratchetId: 'ratchet-r' },
      parts,
      rules: [requireRule],
    })
    expect(r.ok).toBe(false)
  })

  it('沒有任何規則時不得自行推測限制', () => {
    const r = check({ bladeId: 'blade-r', ratchetId: 'ratchet-r', bitId: 'bit-r' }, [])
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })
})

describe('未拆分的 CX 上蓋（第 17、18 節；官方未公布鎖定紋章名稱）', () => {
  const fusedBlade: Part = {
    id: 'cx-fused',
    family: 'main_blade',
    system: 'CX',
    code: 'ドランブレイブ',
    naming: { primaryZhTW: '龍勇' },
    spinDirection: 'right',
    cxFused: true,
    provenance: { sourceUrls: [], verificationStatus: 'needs_review' },
  }
  const withFused = [...parts, fusedBlade]

  it('未拆分上蓋 + 輔助戰刃 + 固鎖 + 軸心即可組裝，不需要鎖定紋章', () => {
    const r = checkCompatibility({
      slots: {
        mainBladeId: fusedBlade.id,
        assistBladeId: 'assist-cx',
        ratchetId: 'ratchet-r',
        bitId: 'bit-r',
      },
      parts: withFused,
      rules: [],
    })
    expect(r.ok).toBe(true)
    expect(r.system).toBe('CX')
  })

  it('未拆分上蓋時再選鎖定紋章會被擋下', () => {
    const r = checkCompatibility({
      slots: {
        lockChipId: 'chip-cx',
        mainBladeId: fusedBlade.id,
        assistBladeId: 'assist-cx',
        ratchetId: 'ratchet-r',
        bitId: 'bit-r',
      },
      parts: withFused,
      rules: [],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.messageZhTW.includes('不使用鎖定紋章'))).toBe(true)
  })

  it('一般 CX 上蓋仍然需要鎖定紋章', () => {
    const r = checkCompatibility({
      slots: {
        mainBladeId: 'main-cx',
        assistBladeId: 'assist-cx',
        ratchetId: 'ratchet-r',
        bitId: 'bit-r',
      },
      parts: withFused,
      rules: [],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('尚未選擇鎖定紋章')
  })

  it('槽位表會依選中的上蓋變化', () => {
    expect(
      getSlotSchemaForSlots({ mainBladeId: fusedBlade.id }, withFused).map((s) => s.key),
    ).toEqual(['mainBladeId', 'assistBladeId', 'ratchetId', 'bitId'])
    expect(getSlotSchemaForSlots({ mainBladeId: 'main-cx' }, withFused).map((s) => s.key)).toEqual([
      'lockChipId',
      'mainBladeId',
      'assistBladeId',
      'ratchetId',
      'bitId',
    ])
  })
})

describe('CX 四件式超越拆組（第 17、18 節）', () => {
  /**
   * 官方商品名把超越戰刃與輔助戰刃寫成相鄰兩個字母（例：バハムートブリッツ「BK」）。
   * 四件式這件事來自 BeybladeHub 的商品頁，實際結構為
   * 鎖定紋章＋金屬主刃＋超越戰刃＋輔助戰刃。
   */
  const fusedFour: Part = {
    id: 'cx-four',
    family: 'main_blade',
    system: 'CX',
    code: 'バハムートブリッツ',
    naming: { primaryZhTW: '龍王閃擊' },
    cxFused: true,
    cxOverBlade: true,
    provenance: { sourceUrls: [], verificationStatus: 'community_only' },
  }
  const fusedThree: Part = {
    id: 'cx-three',
    family: 'main_blade',
    system: 'CX',
    code: 'ドランブレイブ',
    naming: { primaryZhTW: '蒼龍勇氣' },
    cxFused: true,
    provenance: { sourceUrls: [], verificationStatus: 'needs_review' },
  }
  const overBlade: Part = {
    id: 'over-b',
    family: 'over_blade',
    system: 'CX',
    code: 'B',
    naming: { primaryZhTW: '超越戰刃 B' },
    provenance: { sourceUrls: [], verificationStatus: 'community_only' },
  }
  const pool = [...parts, fusedFour, fusedThree, overBlade]

  it('四件式要選超越戰刃才算完整', () => {
    const missing = checkCompatibility({
      slots: {
        mainBladeId: fusedFour.id,
        assistBladeId: 'assist-cx',
        ratchetId: 'ratchet-r',
        bitId: 'bit-r',
      },
      parts: pool,
      rules: [],
    })
    expect(missing.ok).toBe(false)
    expect(missing.errors.map((e) => e.messageZhTW)).toContain('尚未選擇超越戰刃')

    const complete = checkCompatibility({
      slots: {
        mainBladeId: fusedFour.id,
        overBladeId: overBlade.id,
        assistBladeId: 'assist-cx',
        ratchetId: 'ratchet-r',
        bitId: 'bit-r',
      },
      parts: pool,
      rules: [],
    })
    expect(complete.ok).toBe(true)
    expect(complete.system).toBe('CX')
  })

  it('三件式不使用超越戰刃，硬塞會被擋下', () => {
    const r = checkCompatibility({
      slots: {
        mainBladeId: fusedThree.id,
        overBladeId: overBlade.id,
        assistBladeId: 'assist-cx',
        ratchetId: 'ratchet-r',
        bitId: 'bit-r',
      },
      parts: pool,
      rules: [],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.messageZhTW.includes('不使用超越戰刃'))).toBe(true)
  })

  it('槽位表會依主刃是三件式或四件式變化', () => {
    expect(
      getSlotSchemaForSlots({ mainBladeId: fusedFour.id }, pool).map((s) => s.key),
    ).toEqual(['mainBladeId', 'overBladeId', 'assistBladeId', 'ratchetId', 'bitId'])
    expect(
      getSlotSchemaForSlots({ mainBladeId: fusedThree.id }, pool).map((s) => s.key),
    ).toEqual(['mainBladeId', 'assistBladeId', 'ratchetId', 'bitId'])
  })

  it('超越戰刃槽位只接受超越戰刃', () => {
    const r = checkCompatibility({
      slots: {
        mainBladeId: fusedFour.id,
        overBladeId: 'assist-cx',
        assistBladeId: 'assist-cx',
        ratchetId: 'ratchet-r',
        bitId: 'bit-r',
      },
      parts: pool,
      rules: [],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.messageZhTW)).toContain('超越戰刃槽不能放入輔助戰刃')
  })
})

describe('固鎖一體型零件（第 17、18 節）', () => {
  /**
   * UX 的「擴張上蓋」與 Op／Tr 這類軸心已經把固鎖做在自己身上，
   * 這種配裝沒有獨立固鎖，硬要求固鎖會讓這些商品永遠組不起來。
   */
  const expandBlade: Part = {
    id: 'blade-expand',
    family: 'integrated_blade',
    system: 'UX',
    code: 'バレットグリフォン',
    naming: { primaryZhTW: '子彈獅鷲' },
    spinDirection: 'right',
    integratedRatchet: true,
    provenance: { sourceUrls: [], verificationStatus: 'community_only' },
  }
  const fusedBit: Part = {
    id: 'bit-fused',
    family: 'bit',
    system: 'BX',
    code: 'Tr',
    naming: { primaryZhTW: 'Tr' },
    spinDirection: 'dual',
    integratedRatchet: true,
    provenance: { sourceUrls: [], verificationStatus: 'community_only' },
  }
  const pool = [...parts, expandBlade, fusedBit]

  it('一體式上蓋 + 軸心就算完整，不需要固鎖', () => {
    const r = checkCompatibility({
      slots: { bladeId: expandBlade.id, bitId: 'bit-r' },
      parts: pool,
      rules: [],
    })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('一體式上蓋再選固鎖會被擋下', () => {
    const r = checkCompatibility({
      slots: { bladeId: expandBlade.id, ratchetId: 'ratchet-r', bitId: 'bit-r' },
      parts: pool,
      rules: [],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((issue) => issue.messageZhTW.includes('不使用固鎖'))).toBe(true)
  })

  it('固鎖一體型軸心也不需要固鎖', () => {
    const r = checkCompatibility({
      slots: { bladeId: 'blade-r', bitId: fusedBit.id },
      parts: pool,
      rules: [],
    })
    expect(r.ok).toBe(true)
  })

  it('還沒選到一體型零件時，固鎖照常是必填', () => {
    const r = checkCompatibility({
      slots: { bladeId: 'blade-r', bitId: 'bit-r' },
      parts: pool,
      rules: [],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.map((issue) => issue.messageZhTW)).toContain('尚未選擇固鎖')
  })

  it('槽位表在選到一體型零件後不再有固鎖欄位', () => {
    expect(
      getSlotSchemaForSlots({ bladeId: expandBlade.id }, pool).map((slot) => slot.key),
    ).toEqual(['bladeId', 'bitId'])
    expect(
      getSlotSchemaForSlots({ bladeId: 'blade-r' }, pool).map((slot) => slot.key),
    ).toEqual(['bladeId', 'ratchetId', 'bitId'])
  })
})
