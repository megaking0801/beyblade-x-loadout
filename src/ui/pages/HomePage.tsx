/**
 * 首頁。
 *
 * 規格對照：第 39 節（我的庫存、快速操作、最近使用）、第 24 節（賽事資料建置中）、
 * 第 38 節（新手模式說明為什麼）、第 46 節（主流程引導）。
 */
import { useMemo } from 'react'
import { catalogMeta, useAppStore } from '../../store/appStore.ts'
import { catalogAudit } from '../../catalog/index.ts'
import { resolveDisplayName } from '../../domain/naming.ts'
import { getFeaturedTournamentDeck } from '../../domain/tournament.ts'
import { recommendNextProducts } from '../../domain/recommendations.ts'
import { Link, navigate } from '../router.tsx'
import {
  Badge,
  EmptyState,
  NoticeCard,
  PageHeader,
  ReloadLatestButton,
  Row,
  Section,
  StatTile,
  TypeTag,
} from '../components/ui.tsx'

const QUICK_ACTIONS: { label: string; path: string; hint: string }[] = [
  { label: '下一包推薦', path: '/recommendations', hint: '依目前庫存模擬下一盒的配裝提升' },
  { label: '新增商品', path: '/products', hint: '登記你買了哪一盒' },
  { label: '新增零件', path: '/parts', hint: '單獨買的零件也能登記' },
  { label: '配裝器', path: '/builder', hint: '自己挑上蓋、固鎖、軸心' },
  { label: '我能組什麼', path: '/buildable', hint: '用現有零件自動列出可組配置' },
  { label: '3on3 組隊', path: '/decks', hint: '排出三顆一組的隊伍' },
  { label: '想買清單', path: '/wishlist', hint: '看買哪盒最划算' },
  { label: '配裝比較', path: '/compare', hint: '換一個零件差在哪' },
  { label: '設定與備份', path: '/settings', hint: '匯出、匯入、切換模式' },
]

/** 名次的講法：前三名用冠亞季軍，其餘寫第 N 名。沒有名次就不標。 */
function placementZhTW(placement: number | undefined): string | undefined {
  if (placement === undefined) return undefined
  if (placement === 1) return '冠軍'
  if (placement === 2) return '亞軍'
  if (placement === 3) return '季軍'
  return `第 ${placement} 名`
}

const TYPE_DOT_CLASS: Record<string, string> = {
  attack: 'type-attack',
  defense: 'type-defense',
  stamina: 'type-stamina',
  balance: 'type-balance',
}

export function HomePage() {
  const summary = useAppStore((state) => state.summary)
  const combos = useAppStore((state) => state.combos)
  const decks = useAppStore((state) => state.decks)
  const mode = useAppStore((state) => state.settings.mode)
  const catalogVersion = useAppStore((state) => state.catalogVersion)
  const parts = useAppStore((state) => state.parts)
  const products = useAppStore((state) => state.products)
  const productVariants = useAppStore((state) => state.productVariants)
  const ownedProducts = useAppStore((state) => state.ownedProducts)
  const rules = useAppStore((state) => state.rules)
  const lots = useAppStore((state) => state.lots)
  const tournamentEvents = useAppStore((state) => state.tournamentEvents)
  const tournamentDecks = useAppStore((state) => state.tournamentDecks)

  const recentCombos = [...combos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
  const recentDecks = [...decks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
  const isEmpty = summary.ownedProductCount === 0 && summary.bladeCount === 0
  // 三種零件各自可用數相乘＝理論上排得出來的配裝數（不代表全都合法，實際要看「我能組什麼」）。
  const comboSpace = summary.bladeCount * summary.ratchetCount * summary.bitCount
  const featured = useMemo(
    () =>
      getFeaturedTournamentDeck({
        events: tournamentEvents,
        decks: tournamentDecks,
        parts,
      }),
    [tournamentEvents, tournamentDecks, parts],
  )
  const nextRecommendation = useMemo(() => {
    if (isEmpty) return undefined
    return recommendNextProducts({
      products,
      variants: productVariants,
      ownedProducts,
      parts,
      rules,
      lots,
      combos,
      limit: 1,
    }).recommendations[0]
  }, [combos, isEmpty, lots, ownedProducts, parts, productVariants, products, rules])

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

      {/*
        一顆陀螺就是「上蓋 × 固鎖 × 軸心」。把這條乘式當首頁主角，
        右邊直接給出理論組合數，回答使用者真正想問的「我現在能組幾種」。
      */}
      <Section title="我的零件">
        <div className="slot-rack">
          <SlotCount testId="stat-blades" label="上蓋" value={summary.bladeCount} />
          <span className="slot-rack-op" aria-hidden>
            ×
          </span>
          <SlotCount testId="stat-ratchets" label="固鎖" value={summary.ratchetCount} />
          <span className="slot-rack-op" aria-hidden>
            ×
          </span>
          <SlotCount testId="stat-bits" label="軸心" value={summary.bitCount} />
          <Link to="/buildable" className="slot-rack-total">
            <span className="meta">理論組合</span>
            <span className="code" style={{ fontSize: 34, lineHeight: 1.05 }}>
              {comboSpace}
            </span>
            <span className="meta">看能實際組出哪些</span>
          </Link>
        </div>
      </Section>

      {/*
        賽場正在用什麼：拿一副已完整映射的實際牌組當首頁的第二個焦點。
        映射不完整的牌組屬於「來源觀測」，不在這裡出現（第 23 節）。
      */}
      {featured ? (
        <Section title="賽場正在用什麼">
          <div className="spec-list">
            <div className="spec-row">
              {placementZhTW(featured.placement) ? (
                <Badge tone="warn">{placementZhTW(featured.placement)}</Badge>
              ) : null}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{featured.eventNameZhTW}</span>
              {featured.tier && featured.tier !== 'community' && featured.tier !== 'other' ? (
                <Badge>{featured.tier}</Badge>
              ) : null}
              <span className="code meta">{featured.date.slice(5).replace('-', '/')}</span>
            </div>
            {featured.members.map((member) => (
              <div className="spec-row" key={member.nameZhTW}>
                <span
                  aria-hidden
                  className={
                    member.type
                      ? `type-dot ${TYPE_DOT_CLASS[member.type]}`
                      : 'type-dot is-unknown'
                  }
                />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{member.nameZhTW}</span>
                <TypeTag type={member.type} />
              </div>
            ))}
          </div>
          <div style={{ height: 8 }} />
          <p className="meta" style={{ margin: 0 }}>
            這是社群玩家整理的賽果，不是官方公布的配裝。
            <a href={featured.sourceUrl} target="_blank" rel="noreferrer noopener">
              來源
            </a>
          </p>
        </Section>
      ) : null}

      <Section title="我的紀錄">
        <div className="stat-grid">
          <StatTile testId="stat-products" label="我的商品" value={summary.ownedProductCount} hint="盒數" />
          <StatTile testId="stat-combos" label="我的配裝" value={summary.comboCount} hint="已存的單顆配置" />
          <StatTile testId="stat-decks" label="我的 3on3" value={summary.deckCount} hint="已存的隊伍" />
        </div>
      </Section>

      <Section title="快速操作">
        <div className="quick-grid">
          {QUICK_ACTIONS.map((action) => (
            <button key={action.path} type="button" onClick={() => navigate(action.path)}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{action.label}</span>
              <span className="meta">{action.hint}</span>
            </button>
          ))}
        </div>
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
          {/* 手機上看不到最新改動時，先比對這個戳記確認跑的是不是新版。 */}
          <Row>
            <span style={{ flex: 1 }}>
              前端建置：<span className="code">{__BUILD_STAMP__}</span>
            </span>
            <ReloadLatestButton />
          </Row>
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
              目前零件的類型與旋向官方尚未公布，強度分析會標示「資料不足」。
            </div>
          )}
        </div>
      </Section>
      <Section title="下一包推薦">
        {nextRecommendation ? (
          <div className="card stack" data-testid="home-purchase-recommendation">
            <div style={{ fontWeight: 700 }}>第 1 名：{nextRecommendation.product.sku ?? ''} {nextRecommendation.product.naming.primaryZhTW}</div>
            <div>{nextRecommendation.reasonsZhTW[0]}</div>
            <Link to="/recommendations" className="btn btn-primary">查看前五名與原因</Link>
          </div>
        ) : (
          <EmptyState title="尚無可確認的下一包建議" hint="新增更多已持有商品後，會依可用零件產生推薦。" action={<Link to="/recommendations" className="btn">查看推薦頁</Link>} />
        )}
      </Section>
    </>
  )
}

function SlotCount({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="slot-rack-item" data-testid={testId}>
      <span className="meta">{label}</span>
      <span className="code" style={{ fontSize: 34, lineHeight: 1.05 }} data-testid={`${testId}-value`}>
        {value}
      </span>
    </div>
  )
}

/** 供其他頁面顯示商品或零件名稱。 */
export function displayTitle(naming: Parameters<typeof resolveDisplayName>[0]): string {
  return resolveDisplayName(naming).titleZhTW
}
