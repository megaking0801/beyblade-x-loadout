import { describe, expect, it } from 'vitest'
import {
  describeStatSource,
  statFieldLabel,
  summarizeStatSources,
} from '../../src/domain/provenance.ts'
import type { Part } from '../../src/domain/types.ts'

function part(over: Partial<Part> = {}): Part {
  return {
    id: 'p',
    family: 'blade',
    system: 'BX',
    code: 'X',
    naming: { primaryZhTW: '測試' },
    provenance: {
      sourceUrls: ['https://beyblade.takaratomy.co.jp/beyblade-x/lineup/'],
      verificationStatus: 'official_verified',
    },
    ...over,
  }
}

describe('數值來源標示（第 1.5、41 節）', () => {
  it('沒有數值來源時回 null', () => {
    expect(describeStatSource(part())).toBeNull()
  })

  it('社群來源會標成社群實測，且不算官方', () => {
    const source = describeStatSource(
      part({
        statsProvenance: {
          sourceUrls: ['https://beybladehub.app/parts/blades'],
          verificationStatus: 'community_only',
          verifiedAt: '2026-09-16',
        },
      }),
    )
    expect(source).toMatchObject({
      isOfficial: false,
      statusZhTW: '社群實測',
      suffixZhTW: '（社群實測）',
      verifiedAt: '2026-09-16',
    })
  })

  it('官方來源才算官方', () => {
    const source = describeStatSource(
      part({
        statsProvenance: {
          sourceUrls: ['https://beyblade.takaratomy.co.jp/x.pdf'],
          verificationStatus: 'official_verified',
        },
      }),
    )
    expect(source?.isOfficial).toBe(true)
  })
})

describe('欄位標籤不得把社群數據講成官方（第 1.5 節）', () => {
  it('社群數值的欄位不叫官方', () => {
    const labelled = statFieldLabel(
      part({
        statsProvenance: {
          sourceUrls: ['https://beybladehub.app/parts/blades'],
          verificationStatus: 'community_only',
        },
      }),
      '重量',
    )
    expect(labelled).toBe('重量（社群實測）')
    expect(labelled).not.toContain('官方')
  })

  it('沒有數值時仍顯示官方未公布用的標籤', () => {
    expect(statFieldLabel(part(), '重量')).toBe('官方重量')
  })

  it('官方數值才叫官方重量', () => {
    expect(
      statFieldLabel(
        part({
          statsProvenance: {
            sourceUrls: ['https://beyblade.takaratomy.co.jp/x.pdf'],
            verificationStatus: 'multi_source_verified',
          },
        }),
        '重量',
      ),
    ).toBe('官方重量')
  })
})

describe('配裝層級的來源摘要（第 22 節）', () => {
  const community = part({
    id: 'c',
    statsProvenance: {
      sourceUrls: ['https://beybladehub.app/parts/blades'],
      verificationStatus: 'community_only',
    },
  })

  it('含社群數值時給出提醒與來源清單', () => {
    const summary = summarizeStatSources([community, part({ id: 'plain' })])
    expect(summary.hasCommunityStats).toBe(true)
    expect(summary.noticeZhTW).toContain('社群圖鑑')
    expect(summary.sourceUrls).toEqual(['https://beybladehub.app/parts/blades'])
  })

  it('全部沒有數值來源時不提醒', () => {
    const summary = summarizeStatSources([part(), part({ id: 'b' })])
    expect(summary.hasCommunityStats).toBe(false)
    expect(summary.sourceUrls).toEqual([])
  })

  it('來源網址會去重', () => {
    const summary = summarizeStatSources([community, { ...community, id: 'c2' }])
    expect(summary.sourceUrls).toHaveLength(1)
  })
})
