/**
 * 極簡 hash 路由。
 *
 * 用 hash 是為了讓離線 PWA 在任何路徑都能開起來（第 2 節：離線可開啟），
 * 不需要伺服器端 rewrite。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'

export interface Route {
  path: string
  query: Record<string, string>
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, queryString = ''] = raw.split('?')
  const query: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(queryString)) query[key] = value
  return { path: path || '/', query }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash())
  useEffect(() => {
    const onChange = (): void => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path: string, query?: Record<string, string>): void {
  const queryString = query ? `?${new URLSearchParams(query).toString()}` : ''
  window.location.hash = `${path}${queryString}`
}

export function href(path: string, query?: Record<string, string>): string {
  const queryString = query ? `?${new URLSearchParams(query).toString()}` : ''
  return `#${path}${queryString}`
}

export interface LinkProps {
  to: string
  query?: Record<string, string>
  children: ReactNode
  className?: string
  ariaCurrent?: boolean
  testId?: string
  dataPartId?: string
}

export function Link({
  to,
  query,
  children,
  className,
  ariaCurrent,
  testId,
  dataPartId,
}: LinkProps) {
  const target = useMemo(() => href(to, query), [to, query])
  return (
    <a
      href={target}
      className={className}
      {...(ariaCurrent ? { 'aria-current': 'page' } : {})}
      {...(testId ? { 'data-testid': testId } : {})}
      {...(dataPartId ? { 'data-part-id': dataPartId } : {})}
    >
      {children}
    </a>
  )
}
