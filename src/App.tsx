/**
 * App 外殼與路由。
 *
 * 規格對照：第 2 節（手機優先、離線可開啟）、第 6 節（中文用語）、第 39 節（首頁）。
 */
import { useEffect } from 'react'
import { useAppStore } from './store/appStore.ts'
import { Link, useRoute } from './ui/router.tsx'
import { ErrorBanner } from './ui/components/ui.tsx'
import { HomePage } from './ui/pages/HomePage.tsx'
import { ProductsPage } from './ui/pages/ProductsPage.tsx'
import { ProductDetailPage } from './ui/pages/ProductDetailPage.tsx'
import { PartsPage } from './ui/pages/PartsPage.tsx'
import { PartDetailPage } from './ui/pages/PartDetailPage.tsx'
import { BuilderPage } from './ui/pages/BuilderPage.tsx'
import { BuildablePage } from './ui/pages/BuildablePage.tsx'
import { DecksPage } from './ui/pages/DecksPage.tsx'
import { ComparePage } from './ui/pages/ComparePage.tsx'
import { RecommendationsPage } from './ui/pages/RecommendationsPage.tsx'
import { WishlistPage } from './ui/pages/WishlistPage.tsx'
import { SettingsPage } from './ui/pages/SettingsPage.tsx'

const TABS: { path: string; label: string }[] = [
  { path: '/', label: '首頁' },
  { path: '/products', label: '商品' },
  { path: '/parts', label: '零件' },
  { path: '/builder', label: '配裝' },
  { path: '/decks', label: '3on3' },
  { path: '/compare', label: '比較' },
]

export function App() {
  const route = useRoute()
  const ready = useAppStore((state) => state.ready)
  const errorZhTW = useAppStore((state) => state.errorZhTW)
  const clearError = useAppStore((state) => state.clearError)
  const init = useAppStore((state) => state.init)
  const mode = useAppStore((state) => state.settings.mode)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div
      className={mode === 'beginner' ? 'app-shell beginner-mode' : 'app-shell'}
      // 目前路由標在外層，測試才能等到畫面真的換頁（導覽列在每一頁都存在，不能當依據）。
      data-route={route.path}
      data-app-ready={ready ? 'true' : 'false'}
    >
      {errorZhTW ? <ErrorBanner message={errorZhTW} onClose={clearError} /> : null}
      {ready ? <Page path={route.path} query={route.query} /> : <LoadingView />}
      <nav className="tabbar" aria-label="主要導覽">
        {TABS.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className="tab"
            ariaCurrent={route.path === tab.path}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

function LoadingView() {
  return (
    <p style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-dim)' }}>
      資料載入中…
    </p>
  )
}

function Page({ path, query }: { path: string; query: Record<string, string> }) {
  switch (path) {
    case '/':
      return <HomePage />
    case '/products':
      return <ProductsPage />
    case '/product':
      return <ProductDetailPage productId={query.id ?? ''} />
    case '/parts':
      return <PartsPage />
    case '/part':
      return <PartDetailPage partId={query.id ?? ''} />
    case '/builder':
      return <BuilderPage initialComboId={query.combo} />
    case '/buildable':
      return <BuildablePage />
    case '/decks':
      return <DecksPage />
    case '/compare':
      return <ComparePage />
    case '/recommendations':
      return <RecommendationsPage />
    case '/wishlist':
      return <WishlistPage />
    case '/settings':
      return <SettingsPage />
    default:
      return (
        <div className="card" style={{ marginTop: 24 }}>
          找不到這個頁面。<Link to="/">回首頁</Link>
        </div>
      )
  }
}
