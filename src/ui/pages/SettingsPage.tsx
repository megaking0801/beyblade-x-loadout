/**
 * 設定：模式切換、備份匯出匯入、資料版本與已知缺漏。
 *
 * 規格對照：第 37 節（匯出／匯入）、第 38 節（新手／進階模式）、
 * 第 41 節（資料來源）、第 42 節（Catalog Audit）、第 43 節（資料版本顯示）。
 */
import { useRef, useState } from 'react'
import { catalogMeta, repo, useAppStore } from '../../store/appStore.ts'
import { auditCatalog, catalog, catalogAudit } from '../../catalog/index.ts'
import { Badge, NoticeCard, PageHeader, Row, Section } from '../components/ui.tsx'

export function SettingsPage() {
  const mode = useAppStore((state) => state.settings.mode)
  const setMode = useAppStore((state) => state.setMode)
  const run = useAppStore((state) => state.run)
  const catalogVersion = useAppStore((state) => state.catalogVersion)
  const summary = useAppStore((state) => state.summary)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const issues = auditCatalog(catalog)

  return (
    <>
      <PageHeader title="設定" description="模式、備份與資料來源。" />

      <Section title="顯示模式">
        <Row gap={6}>
          <button
            type="button"
            className={mode === 'beginner' ? 'btn btn-primary' : 'btn'}
            onClick={() => void setMode('beginner')}
          >
            新手模式
          </button>
          <button
            type="button"
            className={mode === 'advanced' ? 'btn btn-primary' : 'btn'}
            onClick={() => void setMode('advanced')}
          >
            進階模式
          </button>
        </Row>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
          新手模式字體較大、只顯示必要數據並說明原因；進階模式會顯示重量、來源與缺漏清單。
        </div>
      </Section>

      <Section title="備份">
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
            匯出內容包含我的商品、零件批次、配裝、3on3、想買清單與設定，不含公共圖鑑。
          </div>
          <Row>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const backup = await repo.exportBackup()
                const blob = new Blob([JSON.stringify(backup, null, 2)], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `beyblade-x-backup-${new Date().toISOString().slice(0, 10)}.json`
                anchor.click()
                URL.revokeObjectURL(url)
                setMessage('已匯出備份檔')
              }}
            >
              匯出我的資料
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              匯入備份
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              aria-label="選擇備份檔"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                setMessage(null)
                try {
                  const parsed = JSON.parse(await file.text())
                  const ok = await run(() => repo.importBackup(parsed))
                  setMessage(ok ? '已匯入備份，資料已覆蓋' : null)
                } catch {
                  setMessage('備份檔不是有效的 JSON')
                }
                event.target.value = ''
              }}
            />
          </Row>
          {message ? <div style={{ fontSize: 14 }}>{message}</div> : null}
          <div style={{ fontSize: 13, color: 'var(--warn)' }}>
            匯入會覆蓋目前的個人資料，請先匯出一份再匯入。
          </div>
        </div>
      </Section>

      <Section title="目前資料量">
        <div className="card" style={{ display: 'grid', gap: 4, fontSize: 14 }}>
          <div>我的商品 {summary.ownedProductCount} 筆</div>
          <div>
            可用零件：上蓋 {summary.bladeCount} ・ 固鎖 {summary.ratchetCount} ・ 軸心{' '}
            {summary.bitCount}
          </div>
          <div>
            配裝 {summary.comboCount} 套 ・ 3on3 {summary.deckCount} 組
          </div>
        </div>
      </Section>

      <Section title="資料版本與來源">
        <div className="card" style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          <div>圖鑑版本：{catalogVersion ?? '未載入'}</div>
          <div>收錄商品 {catalog.products.length} 筆 ・ 零件 {catalog.parts.length} 筆</div>
          <div>來源擷取日：{catalogMeta.fetchedAt}</div>
          <div>
            官方來源：
            <a href={catalogMeta.sourceUrl} target="_blank" rel="noreferrer">
              {catalogMeta.sourceUrl}
            </a>
          </div>
          <Row>
            <Badge tone={issues.length === 0 ? 'ok' : 'danger'}>
              圖鑑稽核 {issues.length === 0 ? '通過' : `${issues.length} 項問題`}
            </Badge>
          </Row>
        </div>
      </Section>

      <Section title="已知缺漏">
        <NoticeCard tone="warn">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {catalogAudit.knownGaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </NoticeCard>
        <div className="card" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          內容待查商品 {catalogAudit.contentsUnknownProducts.length} 筆 ・ 零件組成未解析{' '}
          {catalogAudit.unparsedBeyProducts.length} 筆。這些商品可以登記數量，但不會自動加入零件。
        </div>
      </Section>
    </>
  )
}
