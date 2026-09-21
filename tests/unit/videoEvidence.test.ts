import { describe, expect, it } from 'vitest'
import { validateVideoEvidenceDataset } from '../../src/domain/videoEvidence.ts'
import { trustedVideoSourceRegistryFixture } from '../fixtures/trustedVideoSources.ts'
import { videoEvidenceFixture } from '../fixtures/videoEvidence.ts'

function cloneFixture(): unknown {
  return structuredClone(videoEvidenceFixture)
}

function cloneRegistryFixture(): unknown {
  return structuredClone(trustedVideoSourceRegistryFixture)
}

function validateFixture(value: unknown) {
  return validateVideoEvidenceDataset(value, cloneRegistryFixture())
}

describe('VideoEvidence schema', () => {
  it('接受可追溯的高信心與拒收 fixture，並回傳深層唯讀資料', () => {
    const dataset = validateFixture(cloneFixture())
    expect(dataset.records).toHaveLength(2)
    expect(dataset.records[0]?.training.included).toBe(true)
    expect(dataset.records[1]?.training).toEqual({
      included: false,
      rejectionReasons: ['missing_complete_combo', 'missing_winner', 'low_confidence'],
    })
    expect(Object.isFrozen(dataset)).toBe(true)
    expect(Object.isFrozen(dataset.records[0]?.video)).toBe(true)
  })

  it('拒絕非 YouTube 來源、無效時間範圍與重複 evidence id', () => {
    const wrongHost = cloneFixture() as { records: { video: { url: string } }[] }
    wrongHost.records[0]!.video.url = 'https://example.test/watch?v=fixture001'
    expect(() => validateFixture(wrongHost)).toThrow('YouTube')

    const wrongRange = cloneFixture() as { records: { round: { endSeconds: number } }[] }
    wrongRange.records[0]!.round.endSeconds = 42
    expect(() => validateFixture(wrongRange)).toThrow('結束秒數')

    const duplicate = cloneFixture() as { records: { id: string }[] }
    duplicate.records[1]!.id = duplicate.records[0]!.id
    expect(() => validateFixture(duplicate)).toThrow('重複')
  })

  it('拒絕把低信心、不完整配置或平手標成訓練資料', () => {
    const lowConfidence = cloneFixture() as {
      records: { confidence: { winner: number }; training: { included: boolean; rejectionReasons: string[] } }[]
    }
    lowConfidence.records[0]!.confidence.winner = 0.89
    expect(() => validateFixture(lowConfidence)).toThrow('信心')

    const incomplete = cloneFixture() as { records: { b: Record<string, string> }[] }
    incomplete.records[0]!.b = {}
    expect(() => validateFixture(incomplete)).toThrow('完整配置')

    const tie = cloneFixture() as { records: { winner: string }[] }
    tie.records[0]!.winner = 'tie'
    expect(() => validateFixture(tie)).toThrow('勝方')
  })

  it('拒絕拒收資料未列原因或未知欄位', () => {
    const noReason = cloneFixture() as { records: { training: { rejectionReasons: string[] } }[] }
    noReason.records[1]!.training.rejectionReasons = []
    expect(() => validateFixture(noReason)).toThrow('拒收原因')

    const unknownField = cloneFixture() as { records: Record<string, unknown>[] }
    unknownField.records[0]!.playerName = '不應收進 schema'
    expect(() => validateFixture(unknownField)).toThrow('未知欄位')
  })

  it('不讓候選或抽取當下尚未核准的頻道進入訓練資料', () => {
    const candidate = cloneFixture() as {
      records: { video: { channelId: string } }[]
    }
    candidate.records[0]!.video.channelId = 'UCfixturecandidate000000'
    expect(() => validateFixture(candidate)).toThrow('未核准')

    const approvedTooLate = cloneRegistryFixture() as {
      updatedAt: string
      sources: {
        updatedAt: string
        approval: { decisions: { decidedAt: string }[] }
      }[]
    }
    approvedTooLate.updatedAt = '2026-09-22T00:00:00.000Z'
    approvedTooLate.sources[0]!.updatedAt = '2026-09-22T00:00:00.000Z'
    approvedTooLate.sources[0]!.approval.decisions[0]!.decidedAt = '2026-09-22T00:00:00.000Z'
    expect(() => validateVideoEvidenceDataset(cloneFixture(), approvedTooLate)).toThrow('抽取當下尚未核准')
  })

  it('允許候選頻道只留下明確標示 untrusted_source 的拒收紀錄', () => {
    const rejected = cloneFixture() as {
      records: {
        video: { channelId: string }
        training: { included: boolean; rejectionReasons: string[] }
      }[]
    }
    rejected.records[0]!.video.channelId = 'UCfixturecandidate000000'
    rejected.records[0]!.training = {
      included: false,
      rejectionReasons: ['low_confidence'],
    }
    expect(() => validateFixture(rejected)).toThrow('untrusted_source')

    rejected.records[0]!.training = {
      included: false,
      rejectionReasons: ['untrusted_source'],
    }

    expect(validateFixture(rejected).records[0]?.training).toEqual({
      included: false,
      rejectionReasons: ['untrusted_source'],
    })
  })
})
