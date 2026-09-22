import type { TrustedVideoSourceRegistry } from '../domain/trustedVideoSources.ts'

/**
 * 版本化的正式來源 registry。維護者必須逐筆補證據與核准紀錄；
 * candidate 狀態僅代表已研究、待人工審核，尚不可進訓練資料。
 */
export const trustedVideoSourceRegistry = {
  schema: 'beyblade-x-trusted-video-sources',
  schemaVersion: 1,
  updatedAt: '2026-09-23T00:00:00.000Z',
  sources: [
    {
      id: 'takara-tomy-beyblade',
      platform: 'youtube',
      youtube: {
        channelId: 'UCydxSsnKp10hAIjdGce2MQg',
        channelUrl: 'https://www.youtube.com/channel/UCydxSsnKp10hAIjdGce2MQg',
        displayName: 'TakaraTomyBeyblade',
      },
      sourceType: 'official',
      countryCode: 'JP',
      languages: ['ja'],
      rationale:
        'Beyblade 原廠 Takara Tomy 的官方 YouTube 頻道，內容含產品發表與官方賽事片段；' +
        '尚未逐一核對每支影片是否含可判讀對戰結果，需人工審核後才能核准。',
      evidence: [
        {
          url: 'https://www.youtube.com/channel/UCydxSsnKp10hAIjdGce2MQg',
          description: '頻道首頁；帳號名稱與版面標示為 Takara Tomy 官方 Beyblade 頻道。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
    {
      id: 'world-beyblade-organization',
      platform: 'youtube',
      youtube: {
        channelId: 'UCGX1vmquOg8VcNCqnH1c3GA',
        channelUrl: 'https://www.youtube.com/channel/UCGX1vmquOg8VcNCqnH1c3GA',
        displayName: 'World Beyblade Organization',
      },
      sourceType: 'tournament_organizer',
      countryCode: null,
      languages: ['en'],
      rationale:
        'World Beyblade Organization（WBO）是全球最大的 Beyblade 賽事社群，長期籌辦並轉播官方認證賽事；' +
        '為國際性組織無單一國家代碼。尚未核對頻道內對戰片段是否穩定含完整計分與時間戳，需人工審核後才能核准。',
      evidence: [
        {
          url: 'https://worldbeyblade.org/',
          description:
            'WBO 官方網站；經第三方統計服務（Social Blade）確認其 YouTube 頻道 channelId 為 ' +
            'UCGX1vmquOg8VcNCqnH1c3GA，訂閱數約 32.9K。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
    {
      id: 'atulolz-atu',
      platform: 'youtube',
      youtube: {
        channelId: 'UCEsTbpDqp0VntO1T42WbI2g',
        channelUrl: 'https://www.youtube.com/channel/UCEsTbpDqp0VntO1T42WbI2g',
        displayName: 'Atulolz阿土',
      },
      sourceType: 'competitive_community',
      countryCode: 'TW',
      languages: ['zh-TW'],
      rationale:
        '台灣競技社群創作者，內容含大型賽事（如「S1花蓮金發射器256人大賽」）第一視角回放與改造分析；' +
        '賽事回放片段可能含可判讀對戰結果，但頻道大量內容為開箱、改造與天梯講解、無實際對戰結果，' +
        '需人工審核並依單支影片內容篩選，才能核准。',
      evidence: [
        {
          url: 'https://www.youtube.com/channel/UCEsTbpDqp0VntO1T42WbI2g',
          description: '頻道首頁；內容涵蓋賽事回放、開箱與改造分析，作者曾提及 2024 亞洲盃季軍成績。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
    {
      id: 'beyblade-english-official',
      platform: 'youtube',
      youtube: {
        channelId: 'UCktgoAFaL39_rYfiMZiD9jw',
        channelUrl: 'https://www.youtube.com/channel/UCktgoAFaL39_rYfiMZiD9jw',
        displayName: 'BEYBLADE English - Official Channel',
      },
      sourceType: 'official',
      countryCode: null,
      languages: ['en'],
      rationale:
        'BEYBLADE 官方英語頻道，2025 年 10 月「BEYBLADE X WORLD CHAMPIONSHIP 2025」東京世界大賽兩日全程' +
        '直播即在此頻道獨家播出（含預賽與決賽輪，逐場對戰有主播口播結果與畫面計分）；' +
        '尚未逐場核對每局是否可清楚判讀雙方完整配置與時間戳，需人工審核後才能核准。' +
        '官方英語頻道服務對象跨區域，無法判定單一國家代碼故留 null。',
      evidence: [
        {
          url: 'https://www.youtube.com/watch?v=7fbeMy90mow',
          description:
            'DAY1: October 11th BEYBLADE X WORLD CHAMPIONSHIP 2025 PRELIMINARY ROUND LIVESTREAM，' +
            '官方頻道直播世界大賽預賽全程。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
        {
          url: 'https://www.youtube.com/watch?v=8wfCvJSbpzo',
          description:
            'DAY2: October 12th BEYBLADE X WORLD CHAMPIONSHIP 2025 CHAMPIONSHIP ROUND LIVESTREAM，' +
            '官方頻道直播世界大賽決賽輪全程。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
    {
      id: 'beyblade-thailand-official',
      platform: 'youtube',
      youtube: {
        channelId: 'UC3vIYjsBYuwi0obAFy_EWgQ',
        channelUrl: 'https://www.youtube.com/channel/UC3vIYjsBYuwi0obAFy_EWgQ',
        displayName: 'BEYBLADE Thailand – Official Channel',
      },
      sourceType: 'official',
      countryCode: 'TH',
      languages: ['th'],
      rationale:
        '官方泰國區域頻道，可能轉播當地區域賽事；尚未逐支核對是否含可判讀對戰結果，需人工審核後才能核准。',
      evidence: [
        {
          url: 'https://www.youtube.com/channel/UC3vIYjsBYuwi0obAFy_EWgQ',
          description: '頻道首頁；帳號名稱標示為 BEYBLADE 泰國官方頻道。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
    {
      id: 'beyblade-malaysia-official',
      platform: 'youtube',
      youtube: {
        channelId: 'UCDN1FYCY8V5d-8XNxSFCoCw',
        channelUrl: 'https://www.youtube.com/channel/UCDN1FYCY8V5d-8XNxSFCoCw',
        displayName: 'BEYBLADE Malaysia – Official Channel',
      },
      sourceType: 'official',
      countryCode: 'MY',
      languages: ['ms', 'en'],
      rationale:
        '官方馬來西亞區域頻道，可能轉播當地區域賽事（搜尋另見馬來西亞大型戰鬥陀螺X比賽相關內容，' +
        '但該影片來自個人創作者頻道非此官方頻道，未列入）；尚未逐支核對是否含可判讀對戰結果，' +
        '需人工審核後才能核准。',
      evidence: [
        {
          url: 'https://www.youtube.com/channel/UCDN1FYCY8V5d-8XNxSFCoCw',
          description: '頻道首頁；帳號名稱標示為 BEYBLADE 馬來西亞官方頻道。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
    {
      id: 'd100-radio-hk',
      platform: 'youtube',
      youtube: {
        channelId: 'UCbmZSNWyEoM2xtWhbHRPo3w',
        channelUrl: 'https://www.youtube.com/channel/UCbmZSNWyEoM2xtWhbHRPo3w',
        displayName: 'D100 Radio',
      },
      sourceType: 'competitive_community',
      countryCode: 'HK',
      languages: ['zh-HK', 'yue'],
      rationale:
        '香港媒體 D100 曾全程直播「爆旋陀螺X 香港陀螺手 G1／G2 爭霸戰總決賽」，非專屬 Beyblade 頻道' +
        '而是一般媒體轉播單場賽事；sourceType 標記較勉強（非官方也非賽事主辦方，只是轉播單位），' +
        '需人工確認該場賽事的規則、計分是否清楚可判讀，並重新評估 sourceType 是否合適，才能核准。',
      evidence: [
        {
          url: 'https://www.youtube.com/watch?v=qw9u91SD9rA',
          description: '【D100開LIVE直擊】爆旋陀螺X 香港陀螺手 G2爭霸戰總決賽直播錄影。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
        {
          url: 'https://www.youtube.com/watch?v=037w61PRNYA',
          description: '【D100開LIVE直擊】爆旋陀螺X 香港陀螺手 G1爭霸戰總決賽直播錄影。',
          checkedAt: '2026-09-23T00:00:00.000Z',
        },
      ],
      approval: {
        status: 'candidate',
        decisions: [],
      },
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
  ],
} as const satisfies TrustedVideoSourceRegistry
