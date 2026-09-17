import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { getExpertPartRatings } from '../../src/catalog/tierLists.ts'
import {
  buildComboVerdict,
  buildEvidenceReasons,
  NO_EVIDENCE_NOTE_ZH,
} from '../../src/domain/reasons.ts'
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
      // 講法壓縮成「固鎖3-60　S 級（3/5 位高手）」，但等級與共識人數都不能省。
      expect(reason.textZhTW).toMatch(/\S+ 級/)
      expect(reason.textZhTW).toMatch(/\d+\/\d+ 位高手/)
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

  it('整套命中標 combo、單件命中標 part，前台才分得開', () => {
    const reasons = reasonsFor(G1_WINNER)
    expect(reasons.some((reason) => reason.scope === 'combo')).toBe(true)
    for (const reason of reasons) {
      expect(['combo', 'part']).toContain(reason.scope)
      if (reason.textZhTW.includes('整套出現在')) expect(reason.scope).toBe('combo')
    }
  })

  it('「整套出現過」要完全一樣，重複零件不能矇混過去', () => {
    // 觀測 [A, B, B] 與選取 [A, A, B]：長度相同、每一件也都在對方的集合裡，
    // 但不是同一套。用集合比對會誤判成整套命中。
    const [a, b] = [catalog.parts[0]!, catalog.parts[1]!]
    const reasons = buildEvidenceReasons({
      slots: { bladeId: a.id, ratchetId: a.id, bitId: b.id },
      parts: catalog.parts,
      ratings: [],
      events: [
        {
          id: 'fake-event',
          name: '假想賽事',
          date: '2026-01-01',
          tier: 'community',
          sourceTier: 'community',
          sourceUrl: 'https://example.invalid/x',
        },
      ],
      observations: [
        {
          id: 'fake-observation',
          eventId: 'fake-event',
          placement: 1,
          comboPartIds: [a.id, b.id, b.id],
          reportedCombo: '假想配置',
          sourceUrl: 'https://example.invalid/x',
        },
      ],
    })
    expect(reasons.some((reason) => reason.scope === 'combo')).toBe(false)
  })

  it('每一條理由都指得出是哪些零件撐起來的', () => {
    const partIds = new Set(catalog.parts.map((part) => part.id))
    for (const reason of reasonsFor(G1_WINNER)) {
      expect(reason.partIds.length).toBeGreaterThan(0)
      for (const id of reason.partIds) expect(partIds.has(id)).toBe(true)
    }
  })
})


describe('整顆陀螺的一句話結論', () => {
  it('沒有分數時不硬湊一句話', () => {
    expect(buildComboVerdict({})).toBeUndefined()
  })

  it('講得出最強與最弱的面向', () => {
    const verdict = buildComboVerdict({
      scores: { attack: 88, defense: 30, stamina: 28, burst: 70, burstResistance: 35, stability: 32 },
      typeZhTW: '攻擊',
    })
    expect(verdict).toContain('攻擊型配置')
    expect(verdict).toContain('強在')
    expect(verdict).toContain('弱在')
  })

  it('六軸差距太小時說是平均型，不硬講擅長什麼', () => {
    const verdict = buildComboVerdict({
      scores: { attack: 50, defense: 52, stamina: 48, burst: 51, burstResistance: 49, stability: 50 },
    })
    expect(verdict).toContain('沒有明顯偏向')
  })
})
