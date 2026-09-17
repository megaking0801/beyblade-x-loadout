import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { getExpertPartRatings } from '../../src/catalog/tierLists.ts'
import { buildEvidenceReasons, NO_EVIDENCE_NOTE_ZH } from '../../src/domain/reasons.ts'
import type { ComboSlots } from '../../src/domain/types.ts'

function reasonsFor(slots: ComboSlots) {
  return buildEvidenceReasons({
    slots,
    parts: catalog.parts,
    ratings: getExpertPartRatings(slots),
    observations: catalog.tournamentObservations ?? [],
    events: catalog.tournamentEvents ?? [],
  })
}

/** G1 冠軍實際用過的配置，拿來確認整套命中走得通。 */
const G1_WINNER: ComboSlots = {
  bladeId: 'blade:ウィザードロッド',
  ratchetId: 'ratchet:1-60',
  bitId: 'bit:H',
}

describe('配裝理由的證據層（第 20 節 C、第 22 節）', () => {
  it('沒選零件時不生成任何理由', () => {
    expect(reasonsFor({})).toEqual([])
  })

  it('賽事用過的配置會給出整套命中，且帶名次、日期與來源', () => {
    const reasons = reasonsFor(G1_WINNER)
    const whole = reasons.filter((reason) => reason.textZhTW.includes('整套出現在'))
    expect(whole.length).toBeGreaterThan(0)
    for (const reason of whole) {
      expect(reason.kind).toBe('tournament')
      expect(reason.sourceUrl).toMatch(/^https?:\/\//)
      expect(reason.textZhTW).toMatch(/\d{4}-\d{2}-\d{2}/)
    }
    // 名次越前面排越前面，使用者先看到最強的證據
    expect(reasons[0]!.textZhTW).toContain('冠軍')
  })

  it('高手評級會講出共識人數與等級，不會只說「很強」', () => {
    const reasons = reasonsFor({
      bladeId: 'blade:ドランソード',
      ratchetId: 'ratchet:3-60',
      bitId: 'bit:F',
    })
    const expert = reasons.filter((reason) => reason.kind === 'expert')
    expect(expert.length).toBeGreaterThan(0)
    for (const reason of expert) {
      expect(reason.textZhTW).toMatch(/\d+\/\d+ 位高手評為 \S+ 級/)
    }
  })

  it('整套已命中的場次不會再重複講一次單顆命中', () => {
    const reasons = reasonsFor(G1_WINNER)
    // 用場次 id 判定：高雄站有成人組與通常組兩場，名稱前綴相同，比字串會誤判。
    const wholeEventIds = new Set(
      reasons.filter((reason) => reason.textZhTW.includes('整套出現在')).map((reason) => reason.eventId),
    )
    expect(wholeEventIds.size).toBeGreaterThan(0)
    const singles = reasons.filter((reason) => !reason.textZhTW.includes('整套出現在'))
    for (const single of singles) {
      expect(wholeEventIds.has(single.eventId)).toBe(false)
    }
  })

  it('沒有任何證據時回傳空陣列，由前台顯示固定說明而不是留白', () => {
    // 這顆上蓋與這組零件都還沒進榜、也沒出現在收錄的賽事裡。
    const reasons = reasonsFor({
      bladeId: 'blade:ナイトシールド',
      ratchetId: 'ratchet:4-80',
      bitId: 'bit:N',
    })
    expect(reasons).toEqual([])
    expect(NO_EVIDENCE_NOTE_ZH).toContain('模型推估')
  })

  it('每一條理由都指得出是哪些零件撐起來的', () => {
    const partIds = new Set(catalog.parts.map((part) => part.id))
    for (const reason of reasonsFor(G1_WINNER)) {
      expect(reason.partIds.length).toBeGreaterThan(0)
      for (const id of reason.partIds) expect(partIds.has(id)).toBe(true)
    }
  })
})
