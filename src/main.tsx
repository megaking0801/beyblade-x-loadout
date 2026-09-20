import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'

/**
 * GitHub Pages 的 SW 更新不能走 HTTP 快取；否則舊的 navigation fallback 會
 * 一直送回已被部署取代的 index.html。新版啟用後重新載入一次，讓當前分頁也
 * 立即切到新 bundle；個人庫存位於 IndexedDB，不受影響。
 */
if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}sw.js`
  const scope = import.meta.env.BASE_URL
  let reloadedForNewController = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForNewController) return
    reloadedForNewController = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(swUrl, { scope, updateViaCache: 'none' })
      .then((registration) => registration.update())
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 節點')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
