import type { TrustedVideoSourceRegistry } from '../../src/domain/trustedVideoSources.ts'

export const trustedVideoSourceRegistryFixture = {
  schema: 'beyblade-x-trusted-video-sources',
  schemaVersion: 1,
  updatedAt: '2026-09-01T00:00:00.000Z',
  sources: [
    {
      id: 'fixture-approved-source',
      platform: 'youtube',
      youtube: {
        channelId: 'UCfixtureapproved0000000',
        channelUrl: 'https://www.youtube.com/channel/UCfixtureapproved0000000',
        displayName: 'Fixture Approved Competitive Channel',
      },
      sourceType: 'competitive_community',
      countryCode: 'TW',
      languages: ['zh-TW'],
      rationale: 'Fixture：模擬有公開賽事影片與可核對頻道身分的成熟競技社群。',
      evidence: [
        {
          url: 'https://example.test/fixture-approved-source-evidence',
          description: 'Fixture：模擬維護者核對頻道身分與公開影片的證據頁。',
          checkedAt: '2026-08-14T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'approved',
        decisions: [
          {
            status: 'approved',
            decidedBy: 'fixture-maintainer',
            decidedAt: '2026-08-15T00:00:00.000Z',
            reason: 'Fixture：證據完整，核准供離線測試使用。',
          },
        ],
      },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
    {
      id: 'fixture-candidate-source',
      platform: 'youtube',
      youtube: {
        channelId: 'UCfixturecandidate000000',
        channelUrl: 'https://www.youtube.com/channel/UCfixturecandidate000000',
        displayName: 'Fixture Candidate Tournament Channel',
      },
      sourceType: 'tournament_organizer',
      countryCode: null,
      languages: [],
      rationale: 'Fixture：模擬仍待維護者審查的賽事主辦頻道候選。',
      evidence: [
        {
          url: 'https://example.test/fixture-candidate-source-evidence',
          description: 'Fixture：只有候選來源證據，尚未形成人工核准決策。',
          checkedAt: '2026-08-20T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
  ],
} as const satisfies TrustedVideoSourceRegistry
