import type { VideoEvidenceDataset } from '../../src/domain/videoEvidence.ts'

export const videoEvidenceFixture = {
  schema: 'beyblade-x-video-evidence',
  schemaVersion: 1,
  generatedAt: '2026-09-21T00:00:00.000Z',
  records: [
    {
      id: 'youtube:fixture001:42-58',
      video: {
        youtubeVideoId: 'fixture001',
        url: 'https://www.youtube.com/watch?v=fixture001',
        channelId: 'UCfixtureapproved0000000',
        channelName: 'Fixture Competitive Channel',
        publishedAt: '2026-09-01T12:00:00.000Z',
      },
      round: { startSeconds: 42, endSeconds: 58 },
      a: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-a', bitId: 'test-bit-a' },
      b: { bladeId: 'test-blade-b', ratchetId: 'test-ratchet-b', bitId: 'test-bit-b' },
      winner: 'a',
      finish: 'xtreme',
      rules: { format: '3on3', stadium: 'Xtreme Stadium' },
      confidence: {
        timestamps: 0.98,
        a: 0.97,
        b: 0.96,
        winner: 0.99,
        finish: 0.95,
        rules: 0.94,
      },
      extraction: {
        provider: 'gemini',
        model: 'fixture-model',
        promptVersion: 'video-evidence-v1',
        extractedAt: '2026-09-21T00:00:00.000Z',
      },
      training: { included: true, rejectionReasons: [] },
    },
    {
      id: 'youtube:fixture001:75-91',
      video: {
        youtubeVideoId: 'fixture001',
        url: 'https://www.youtube.com/watch?v=fixture001',
        channelId: 'UCfixtureapproved0000000',
        channelName: 'Fixture Competitive Channel',
        publishedAt: '2026-09-01T12:00:00.000Z',
      },
      round: { startSeconds: 75, endSeconds: 91 },
      a: { bladeId: 'test-blade-a', ratchetId: 'test-ratchet-a', bitId: 'test-bit-a' },
      b: { bladeId: 'test-blade-b', bitId: 'test-bit-b' },
      winner: null,
      finish: null,
      rules: { format: '3on3', stadium: null },
      confidence: {
        timestamps: 0.93,
        a: 0.95,
        b: 0.62,
        winner: 0,
        finish: 0,
        rules: 0.71,
      },
      extraction: {
        provider: 'gemini',
        model: 'fixture-model',
        promptVersion: 'video-evidence-v1',
        extractedAt: '2026-09-21T00:00:00.000Z',
      },
      training: {
        included: false,
        rejectionReasons: ['missing_complete_combo', 'missing_winner', 'low_confidence'],
      },
    },
  ],
} as const satisfies VideoEvidenceDataset
