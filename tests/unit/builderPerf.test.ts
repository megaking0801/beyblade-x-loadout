import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { generateBuildableCombos } from '../../src/domain/builder.ts'

/**
 * 第 29 節的「我能組什麼」在圖鑑模式下會枚舉十幾萬組合。
 *
 * 改成兩段式（便宜評分挑前段、只對勝出者做完整分析）之前實測 28 秒，會把畫面卡死。
 * 這條守的是那一類的退化，不是機器負載，所以門檻放在 15 秒：
 * 單獨跑約 1.4 秒，整套並行跑時會慢幾倍，抓 5 秒會在邊界 flaky。
 */
describe('配置產生器的規模守門', () => {
  // 斷言守 15 秒；Vitest 預設 5 秒 timeout 必須另放寬，否則在斷言前就會中止。
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
    expect(elapsed).toBeLessThan(15_000)
  }, 20_000)
})
