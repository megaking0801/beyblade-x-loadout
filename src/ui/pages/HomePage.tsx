/**
 * 首頁。
 *
 * 規格對照：第 39 節（我的庫存、快速操作、最近使用）、第 24 節（賽事資料建置中）、
 * 第 38 節（新手模式說明為什麼）、第 46 節（主流程引導）。
 */
import { catalogMeta, useAppStore } from '../../store/appStore.ts'
import { catalogAudit } from '../../catalog/index.ts'
import { resolveDisplayName } from '../../domain/naming.ts'
import { Link, navigate } from '../router.tsx'
import {
  EmptyState,
  Grid,
  NoticeCard,
  PageHeader,
  Row,
  Section,
  StatTile,
} from '../components/ui.tsx'

const QUICK_ACTIONS: { label: string; path: string; hint: string }[] = [
  { label: '新增商品', path: '/products', hint: '登記你買了哪一盒' },
  { label: '新增零件', path: '/parts', hint: '單獨買的零件也能登記' },
  { label: '配裝器', path: '/builder', hint: '自己挑上蓋、固鎖、軸心' },
  { label: '我能組什麼', path: '/buildable', hint: '用現有零件自動列出可組配置' },
  { label: '3on3 組隊', path: '/decks', hint: '排出三顆一組的隊伍' },
  { label: '想買清單', path: '/wishlist', hint: '看買哪盒最划算' },
  { label: '配裝比較', path: '/compare', hint: '換一個零件差在哪' },
  { label: '設定與備份', path: '/settings', hint: '匯出、匯入、切換模式' },
]

export function HomePage() {
  const summary = useAppStore((state) => state.summary)
  const combos = useAppStore((state) => state.combos)
  const decks = useAppStore((state) => state.decks)
  const mode = useAppStore((state) => state.settings.mode)
  const catalogVersion = useAppStore((state) => state.catalogVersion)

  const recentCombos = [...combos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
  const recentDecks = [...decks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
  const isEmpty = summary.ownedProductCount === 0 && summary.bladeCount === 0

  return (
    <>
      <PageHeader
        title="BEYBLADE X 配裝分析"
        description="登記你買了什麼，系統就會算出你現在能組什麼、強在哪、還缺哪一盒。"
      />

      {isEmpty ? (
        <NoticeCard tone="accent">
          還沒有任何個人資料。先到「商品」把你買過的盒子登記進去，或到「零件」單獨新增零件。
        </NoticeCard>
      ) : null}

      <Section title="我的庫存">
        <Grid min={110}>
          <StatTile testId="stat-products" label="我的商品" value={summary.ownedProductCount} hint="盒數" />
          <StatTile testId="stat-blades" label="上蓋" value={summary.bladeCount} hint="可用數" />
          <StatTile testId="stat-ratchets" label="固鎖" value={summary.ratchetCount} hint="可用數" />
          <StatTile testId="stat-bits" label="軸心" value={summary.bitCount} hint="可用數" />
          <StatTile testId="stat-combos" label="我的配裝" value={summary.comboCount} />
          <StatTile testId="stat-decks" label="我的 3on3" value={summary.deckCount} />
        </Grid>
      </Section>

      <Section title="快速操作">
        <Grid min={150}>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.path}
              type="button"
              className="card"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => navigate(action.path)}
            >
              <div style={{ fontWeight: 600 }}>{action.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{action.hint}</div>
            </button>
          ))}
        </Grid>
      </Section>

      <Section title="最近使用">
        {recentCombos.length === 0 && recentDecks.length === 0 ? (
          <EmptyState title="還沒有儲存過配裝或隊伍" hint="配裝器存一套之後就會出現在這裡。" />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {recentCombos.map((combo) => (
              <Link key={combo.id} to="/builder" query={{ combo: combo.id }} className="card">
                <Row>
                  <span style={{ flex: 1 }}>{combo.nameZhTW}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {combo.physicallyBuilt ? '已實際組裝' : '理論配置'}
                  </span>
                </Row>
              </Link>
            ))}
            {recentDecks.map((deck) => (
              <Link key={deck.id} to="/decks" className="card">
                <Row>
                  <span style={{ flex: 1 }}>{deck.nameZhTW}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>3on3</span>
                </Row>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="資料狀態">
        <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          <div>
            圖鑑版本：{catalogVersion ?? '未載入'}（來源擷取日 {catalogMeta.fetchedAt}）
          </div>
          <div>
            資料來源：
            <a href={catalogMeta.sourceUrl} target="_blank" rel="noreferrer">
              Takara Tomy BEYBLADE X 官方商品一覽
            </a>
          </div>
          <div style={{ color: 'var(--text-dim)' }}>已匯入可追溯的社群賽事 Top Cut 牌組；未對應型錄的資料不納入分析。</div>
          {mode === 'advanced' ? (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--text-dim)' }}>
              {catalogAudit.knownGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          ) : (
            <div style={{ color: 'var(--text-dim)' }}>
              目前零件的重量與類型官方尚未公布，強度分析會標示「資料不足」。
            </div>
          )}
        </div>
      </Section>
    </>
  )
}

/** 供其他頁面顯示商品或零件名稱。 */
export function displayTitle(naming: Parameters<typeof resolveDisplayName>[0]): string {
  return resolveDisplayName(naming).titleZhTW
}
