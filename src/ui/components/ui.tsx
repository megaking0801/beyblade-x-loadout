/**
 * 共用 UI 元件。
 *
 * 規格對照：第 6 節（前台用語一律中文）、第 25 節（圖片缺漏時的 fallback）、
 * 第 38 節（新手／進階模式）。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BEY_TYPE_ZH, CONFIDENCE_ZH, type BeyType, type Confidence } from '../../domain/types.ts'

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header style={{ padding: '22px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ flex: 1 }}>
          {title}
        </h1>
        {action}
      </div>
      {description ? (
        <p className="meta" style={{ margin: '6px 0 0', maxWidth: '58ch' }}>
          {description}
        </p>
      ) : null}
    </header>
  )
}

export function Section({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 className="section-title" style={{ flex: 1 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({
  title,
  hint,
  testId,
}: {
  title: string
  hint?: string
  testId?: string
}) {
  return (
    <div
      className="card"
      style={{ textAlign: 'center', color: 'var(--text-dim)' }}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>{title}</p>
      {hint ? <p style={{ margin: '6px 0 0', fontSize: 14 }}>{hint}</p> : null}
    </div>
  )
}

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'

const TONE_COLOR: Record<BadgeTone, string> = {
  neutral: 'var(--text-dim)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  accent: 'var(--accent)',
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  const color = TONE_COLOR[tone]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

/** 型號在型錄裡是主角，拉丁代號用寬體，中文名維持正常字寬（第 5 節）。 */
const LEADING_SKU = /^([A-Z]{2,3}-\d+[A-Za-z]*)\s+(.*)$/
const TRAILING_COMBO = /^(.*?)((?:[A-Z]{1,2})?\d+-\d+[A-Za-z]+)$/

export function CatalogTitle({ children }: { children: string }) {
  const skuMatch = LEADING_SKU.exec(children)
  const sku = skuMatch?.[1]
  const rest = skuMatch?.[2] ?? children
  const comboMatch = TRAILING_COMBO.exec(rest)
  const name = comboMatch?.[1] || rest
  const combo = comboMatch?.[1] ? comboMatch[2] : undefined

  return (
    <>
      {sku ? (
        <>
          <span className="code" style={{ color: 'var(--ink-dim)' }}>
            {sku}
          </span>{' '}
        </>
      ) : null}
      {name}
      {combo ? <span className="code">{combo}</span> : null}
    </>
  )
}

/**
 * 「剛剛加進去了」的短暫狀態。
 *
 * 加入之後畫面若完全沒變化，使用者會以為沒按到而重複點，庫存就多算了。
 * 回傳的 flag 用來同時改按鈕文字與卡片外框，動畫關掉時文字仍然會變。
 */
export function useJustAdded(durationMs = 1600): [boolean, () => void] {
  const [active, setActive] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return [
    active,
    () => {
      window.clearTimeout(timer.current)
      setActive(true)
      timer.current = window.setTimeout(() => setActive(false), durationMs)
    },
  ]
}

/**
 * 零件類型標籤。
 *
 * 類型是掃清單時最常用的判斷依據，所以它是全站唯一有顏色編碼的標籤
 * （攻擊紅／防守藍／持久綠／均衡橘）。沒有類型資料時回 null，
 * 由呼叫端決定要不要顯示「資料不足」，不要自己編一個灰色的「未知」。
 */
const TYPE_CLASS: Record<BeyType, string> = {
  attack: 'type-attack',
  defense: 'type-defense',
  stamina: 'type-stamina',
  balance: 'type-balance',
}

export function TypeTag({ type }: { type?: BeyType }) {
  if (!type) return null
  return <span className={`type-tag ${TYPE_CLASS[type]}`}>{BEY_TYPE_ZH[type]}</span>
}

/** 第 20 節 B：模型推估的資料一律掛這個標籤。 */
export function EstimateBadge() {
  return <Badge tone="warn">模型推估</Badge>
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const tone: BadgeTone = confidence === 'high' ? 'ok' : confidence === 'medium' ? 'warn' : 'danger'
  return <Badge tone={tone}>可信度 {CONFIDENCE_ZH[confidence]}</Badge>
}

export function StatTile({
  label,
  value,
  hint,
  testId,
}: {
  label: string
  value: ReactNode
  hint?: string
  testId?: string
}) {
  return (
    <div className="card" style={{ padding: '12px 14px' }} {...(testId ? { 'data-testid': testId } : {})}>
      <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{label}</div>
      <div
        className="code"
        style={{ fontSize: 30, lineHeight: 1.15, margin: '2px 0' }}
        {...(testId ? { 'data-testid': `${testId}-value` } : {})}
      >
        {value}
      </div>
      {hint ? <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{hint}</div> : null}
    </div>
  )
}

export function Grid({ children, min = 140 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      }}
    >
      {children}
    </div>
  )
}

export function Row({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', gap, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
}

/**
 * 第 25 節：官方圖片只以 link_only 方式顯示，不下載或重散布；讀取失敗時退回型號佔位圖。
 */
/**
 * 本機圖片路徑要補上 BASE_URL。
 * GitHub Pages 部署在 /beyblade-x-loadout/ 子路徑，直接用 /img/... 會 404。
 */
export function assetUrl(path: string | undefined): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//.test(path)) return path
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export function PartThumb({
  code,
  nameZhTW,
  size = 44,
  imageUrl,
}: {
  code: string
  /** 代號是日文時改用中文名稱取字，避免前台出現日文（第 1.4 節）。 */
  nameZhTW?: string
  size?: number
  /** 第 25 節：外部連結圖片。載入失敗或離線時退回型號佔位圖。 */
  imageUrl?: string
}) {
  const [failed, setFailed] = useState(false)
  // 「BX-01」被切成「BX-0」會看起來像壞掉，型號一律留完整。
  const latin = code.replace(/[^0-9A-Za-z-]/g, '').slice(0, 6)
  const chinese = (nameZhTW ?? '').replace(/\s/g, '').slice(0, 2)
  const short = latin || chinese || '—'

  const frame = {
    width: size,
    height: size,
    flex: `0 0 ${size}px`,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-2)',
    border: '1px solid var(--rule)',
    overflow: 'hidden',
  } as const

  const resolved = assetUrl(imageUrl)
  if (resolved && !failed) {
    return (
      <div style={frame}>
        <img
          src={resolved}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className="code"
      style={{
        ...frame,
        display: 'grid',
        placeItems: 'center',
        padding: 2,
        fontSize: short.length > 4 ? 10 : 12,
        color: 'var(--ink-dim)',
        textAlign: 'center',
        lineHeight: 1.1,
      }}
    >
      {short}
    </div>
  )
}

export function ScoreBar({ label, value }: { label: string; value?: number }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-dim)' }}>{value === undefined ? '資料不足' : value}</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: 'var(--surface-2)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            width: `${value ?? 0}%`,
            height: '100%',
            background: value === undefined ? 'transparent' : 'var(--accent)',
          }}
        />
      </div>
    </div>
  )
}

export function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="alert"
      className="card"
      style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 12 }}
    >
      <Row>
        <span style={{ flex: 1 }}>{message}</span>
        <button type="button" className="btn" onClick={onClose}>
          關閉
        </button>
      </Row>
    </div>
  )
}

export function NoticeCard({
  children,
  tone = 'warn',
  testId,
}: {
  children: ReactNode
  tone?: BadgeTone
  testId?: string
}) {
  return (
    <div
      className="card"
      style={{ borderColor: TONE_COLOR[tone], marginBottom: 12 }}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <div style={{ fontSize: 14, color: 'var(--text)' }}>{children}</div>
    </div>
  )
}

export function Quantity({
  value,
  onChange,
  min = 0,
  label,
  testId,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  label: string
  testId?: string
}) {
  return (
    <Row gap={6}>
      <button
        type="button"
        className="btn"
        aria-label={`${label} 減少`}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <input
        className="field"
        style={{ width: 72, textAlign: 'center' }}
        type="number"
        inputMode="numeric"
        aria-label={label}
        {...(testId ? { 'data-testid': testId } : {})}
        value={value}
        min={min}
        onChange={(event) => {
          const next = Number(event.target.value)
          onChange(Number.isFinite(next) ? Math.max(min, Math.trunc(next)) : min)
        }}
      />
      <button
        type="button"
        className="btn"
        aria-label={`${label} 增加`}
        onClick={() => onChange(value + 1)}
      >
        ＋
      </button>
    </Row>
  )
}
