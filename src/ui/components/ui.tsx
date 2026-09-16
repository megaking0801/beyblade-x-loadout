/**
 * 共用 UI 元件。
 *
 * 規格對照：第 6 節（前台用語一律中文）、第 25 節（圖片缺漏時的 fallback）、
 * 第 38 節（新手／進階模式）。
 */
import { useState, type ReactNode } from 'react'
import { CONFIDENCE_ZH, type Confidence } from '../../domain/types.ts'

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
    <header style={{ padding: '18px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: 1 }}>{title}</h1>
        {action}
      </div>
      {description ? (
        <p style={{ margin: '6px 0 0', color: 'var(--text-dim)', fontSize: 14 }}>{description}</p>
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
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>{title}</h2>
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
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        border: `1px solid ${TONE_COLOR[tone]}`,
        color: TONE_COLOR[tone],
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
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
    <div className="card" style={{ padding: 12 }} {...(testId ? { 'data-testid': testId } : {})}>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</div>
      <div
        style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}
        {...(testId ? { 'data-testid': `${testId}-value` } : {})}
      >
        {value}
      </div>
      {hint ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{hint}</div> : null}
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
  const latin = code.replace(/[^0-9A-Za-z-]/g, '').slice(0, 4)
  const chinese = (nameZhTW ?? '').replace(/\s/g, '').slice(0, 2)
  const short = latin || chinese || '—'

  const frame = {
    width: size,
    height: size,
    flex: `0 0 ${size}px`,
    borderRadius: 10,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
  } as const

  if (imageUrl && !failed) {
    return (
      <div style={frame}>
        <img
          src={imageUrl}
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
      style={{
        ...frame,
        display: 'grid',
        placeItems: 'center',
        fontSize: size <= 40 ? 11 : 13,
        color: 'var(--text-dim)',
        fontWeight: 600,
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
