import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { generateBuildableCombos } from '../../src/domain/builder.ts'

/**
 * 第 29 節的「我能組什麼」在圖鑑模式下會枚舉大量組合。
 * 圖鑑一長大就可能把 UI 卡死，所以這裡守一個時間上限，並印出實際耗時方便追蹤。
 */
describe('配置產生器的規模守門', () => {
  it('圖鑑模式在合理時間內完成，並回傳有效結果', () => {
    const started = performance.now()
    const rows = generateBuildableCombos({
      parts: catalog.parts,
      rules: catalog.compatibilityRules,
      lots: [],
      combos: [],
      mode: 'catalog',
      sortBy: 'attack',
      limit: 40,
    })
    const elapsed = performance.now() - started
    console.log(`圖鑑模式枚舉耗時 ${Math.round(elapsed)} ms，回傳 ${rows.length} 筆`)

    expect(rows.length).toBe(40)
    expect(rows.every((row) => row.analysis.compatibility.ok)).toBe(true)
    expect(elapsed).toBeLessThan(5_000)
  })
})
