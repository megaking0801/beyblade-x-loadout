import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** GitHub Pages 專案頁必須從 repo 子路徑載入資源；本機與其他主機仍使用根目錄。 */
const base = process.env.GITHUB_ACTIONS ? '/beyblade-x-loadout/' : '/'

/** 版本戳記：首頁「資料狀態」會顯示，用來確認手機上跑的是不是最新一版。 */
const buildStamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base,
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'BEYBLADE X 配裝分析',
        short_name: 'X 配裝',
        description: '個人庫存管理、配裝分析與 3on3 組隊工具',
        lang: 'zh-Hant-TW',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 新版一上線就接管，不必等所有分頁關掉；不然手機上會一直看到舊畫面。
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        /*
         * 圖片全部是外部連結（第 25 節：只連結、不重新散布），所以離線時一定會破圖，
         * 除非看過的圖有被快取。零件去背圖在 img.beybladehub.app，
         * 目前佔全部圖片的多數，漏掉它等於零件頁離線全破。
         */
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/(?:img\.beybladehub\.app|beyblade\.takaratomy\.co\.jp|tshop\.r10s\.jp|m\.media-amazon\.com)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'beyblade-external-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/data/**'],
    },
  },
})
