import type { TrustedVideoSourceRegistry } from '../domain/trustedVideoSources.ts'

/**
 * 版本化的正式來源 registry。維護者必須逐筆補證據與核准紀錄；
 * 在此之前保持空白，避免把未審查的真實頻道誤標為可信。
 */
export const trustedVideoSourceRegistry = {
  schema: 'beyblade-x-trusted-video-sources',
  schemaVersion: 1,
  updatedAt: '2026-09-21T00:00:00.000Z',
  sources: [],
} as const satisfies TrustedVideoSourceRegistry
