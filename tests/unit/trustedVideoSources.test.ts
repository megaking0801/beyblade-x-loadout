import { describe, expect, it } from 'vitest'
import { trustedVideoSourceRegistry } from '../../src/data/trustedVideoSources.ts'
import {
  listApprovedVideoSources,
  validateTrustedVideoSourceRegistry,
} from '../../src/domain/trustedVideoSources.ts'
import { trustedVideoSourceRegistryFixture } from '../fixtures/trustedVideoSources.ts'

function cloneFixture(): unknown {
  return structuredClone(trustedVideoSourceRegistryFixture)
}

describe('可信影片來源 registry', () => {
  it('接受具證據與決策歷程的離線 fixture，並只選出已核准來源', () => {
    const registry = validateTrustedVideoSourceRegistry(cloneFixture())
    const approved = listApprovedVideoSources(registry)

    expect(approved.map((source) => source.id)).toEqual(['fixture-approved-source'])
    expect(Object.isFrozen(registry)).toBe(true)
    expect(Object.isFrozen(registry.sources[0]?.approval.decisions)).toBe(true)
    expect(Object.isFrozen(approved)).toBe(true)
  })

  it('正式 registry 的候選來源在人工核准前都不可信', () => {
    const registry = validateTrustedVideoSourceRegistry(trustedVideoSourceRegistry)
    expect(registry.sources.every((source) => source.approval.status === 'candidate')).toBe(true)
    expect(listApprovedVideoSources(registry)).toEqual([])
  })

  it('拒絕把沒有人工決策的候選直接標為已核准', () => {
    const registry = cloneFixture() as {
      sources: { approval: { status: string; decisions: unknown[] } }[]
    }
    registry.sources[1]!.approval.status = 'approved'

    expect(() => validateTrustedVideoSourceRegistry(registry)).toThrow('決策紀錄')
  })

  it('拒絕決策狀態不一致、逆序時間與晚於 registry 的來源更新', () => {
    const mismatched = cloneFixture() as {
      sources: { approval: { status: string } }[]
    }
    mismatched.sources[0]!.approval.status = 'suspended'
    expect(() => validateTrustedVideoSourceRegistry(mismatched)).toThrow('最後一筆決策')

    const reversed = cloneFixture() as {
      sources: { approval: { decisions: { decidedAt: string }[] } }[]
    }
    reversed.sources[0]!.approval.decisions.push({
      status: 'approved',
      decidedBy: 'fixture-maintainer',
      decidedAt: '2026-08-14T00:00:00.000Z',
      reason: 'Fixture：時間倒退的無效決策。',
    } as never)
    expect(() => validateTrustedVideoSourceRegistry(reversed)).toThrow('時間順序')

    const lateUpdate = cloneFixture() as { sources: { updatedAt: string }[] }
    lateUpdate.sources[0]!.updatedAt = '2026-09-02T00:00:00.000Z'
    expect(() => validateTrustedVideoSourceRegistry(lateUpdate)).toThrow('registry.updatedAt')
  })

  it('拒絕在任何來源證據完成核對前就核准', () => {
    const registry = cloneFixture() as {
      sources: {
        updatedAt: string
        evidence: { checkedAt: string }[]
        approval: { decisions: { decidedAt: string }[] }
      }[]
    }
    registry.sources[0]!.updatedAt = '2026-08-16T00:00:00.000Z'
    registry.sources[0]!.evidence[0]!.checkedAt = '2026-08-16T00:00:00.000Z'

    expect(() => validateTrustedVideoSourceRegistry(registry)).toThrow('核准前已核對')
  })

  it('拒絕重複頻道、非標準 YouTube channel URL 與未知欄位', () => {
    const duplicate = cloneFixture() as {
      sources: { youtube: { channelId: string; channelUrl: string } }[]
    }
    duplicate.sources[1]!.youtube = { ...duplicate.sources[0]!.youtube }
    expect(() => validateTrustedVideoSourceRegistry(duplicate)).toThrow('重複 YouTube channelId')

    const handleUrl = cloneFixture() as { sources: { youtube: { channelUrl: string } }[] }
    handleUrl.sources[0]!.youtube.channelUrl = 'https://www.youtube.com/@fixture'
    expect(() => validateTrustedVideoSourceRegistry(handleUrl)).toThrow('channel URL')

    const unknown = cloneFixture() as { sources: Record<string, unknown>[] }
    unknown.sources[0]!.subscriberCount = 1000
    expect(() => validateTrustedVideoSourceRegistry(unknown)).toThrow('未知欄位')
  })
})
