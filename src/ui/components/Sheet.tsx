import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, type ReactNode } from 'react'

let scrollLockCount = 0
let lockedScrollY = 0

function lockBodyScroll() {
  if (scrollLockCount++ > 0) return
  lockedScrollY = window.scrollY
  Object.assign(document.body.style, {
    position: 'fixed', top: `-${lockedScrollY}px`, left: '0', right: '0', overflow: 'hidden',
  })
}

function unlockBodyScroll() {
  if (--scrollLockCount > 0) return
  scrollLockCount = 0
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', overflow: '' })
  window.scrollTo(0, lockedScrollY)
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open,
  titleZhTW,
  onClose,
  header,
  footer,
  children,
  testId,
}: {
  open: boolean
  titleZhTW: string
  onClose: () => void
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  testId?: string
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockBodyScroll()
    const timer = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 0)
    return () => {
      window.clearTimeout(timer)
      unlockBodyScroll()
      returnFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (items.length === 0) return
    const first = items[0]!
    const last = items.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="sheet-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
        data-testid={testId}
      >
        <div className="sheet-header">
          <h2 id={titleId} className="sheet-title">{titleZhTW}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="關閉">關閉</button>
          {header}
        </div>
        <div className="sheet-content">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
