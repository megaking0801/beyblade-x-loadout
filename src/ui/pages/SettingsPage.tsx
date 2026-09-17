/**
 * 設定：模式切換、備份匯出匯入、資料版本與已知缺漏。
 *
 * 規格對照：第 37 節（匯出／匯入）、第 38 節（新手／進階模式）、
 * 第 41 節（資料來源）、第 42 節（Catalog Audit）、第 43 節（資料版本顯示）。
 */
import { useRef, useState } from 'react'
import { catalogMeta, repo, useAppStore } from '../../store/appStore.ts'
import { auditCatalog, catalog, catalogAudit } from '../../catalog/index.ts'
import { expertTierListMeta } from '../../catalog/tierLists.ts'
import { Badge, NoticeCard, PageHeader, Row, Section } from '../components/ui.tsx'
import { summarizeImageSources } from '../components/ImageSource.tsx'

export function SettingsPage() {
  const mode = useAppStore((state) => state.settings.mode)
  const setMode = useAppStore((state) => state.setMode)
  const refresh = useAppStore((state) => state.refresh)
  const catalogVersion = useAppStore((state) => state.catalogVersion)
  const summary = useAppStore((state) => state.summary)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const images = useAppStore((state) => state.images)
  const imageSources = summarizeImageSources(images)

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
                  // 先完成匯入並立刻回饋，再重讀全域狀態。
                  // refresh() 要重載整份圖鑑，等它跑完才顯示訊息會讓使用者以為沒反應。
                  await repo.importBackup(parsed)
                  setMessage('已匯入備份，資料已覆蓋')
                  await refresh()
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : '備份檔不是有效的 JSON')
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

      <Section title="資料來源與致謝">
        <div className="card" style={{ display: 'grid', gap: 10, fontSize: 14 }} data-testid="source-acknowledgement">
          <div>
            <strong>Takara Tomy（官方）</strong>
            <div className="meta">
              商品身分、品號與官方商品一覽以官方資料為準；官方未公布的欄位會保留資料不足，不會自行補值。
            </div>
            <a href={catalogMeta.sourceUrl} target="_blank" rel="noreferrer">查看官方商品一覽</a>
          </div>
          <div>
            <strong>BeybladeHub（社群）</strong>
            <div className="meta">
              感謝提供台灣慣用名稱、零件實測資料、圖片原始位置、套裝內容整理、賽事配置與高手 T 表來源。
            </div>
            <a href="https://beybladehub.app" target="_blank" rel="noreferrer">前往 BeybladeHub</a>
          </div>
          <NoticeCard tone="warn">
            BeybladeHub 是非官方玩家資源站；社群數值、賽事配置與專家評級都會標示來源，不能視為官方公告或本站模型結論。
          </NoticeCard>
          <div className="meta">
            高手 T 表目前收錄 {expertTierListMeta.listCount} 張具名公開表，資料擷取日 {expertTierListMeta.fetchedAt}。
            T 表只作為獨立的社群觀點顯示，不會改變賽事統計、模型分數或可信度。
          </div>
        </div>
      </Section>

      <Section title="圖片來源">
        <div className="card" style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <div style={{ color: 'var(--text-dim)' }}>
            圖片已下載成本機副本並跟著 App 一起發佈，來源端改路徑或擋掉也不會破圖。
            這不代表已取得授權，所以每張圖都保留原始位置與來源，授權狀態標為「未確認」。
          </div>
          {imageSources.map((row) => (
            <div key={row.sourceName}>
              <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                {row.sourceName}
              </a>
              {` ・ ${row.count} 張`}
            </div>
          ))}
          <div style={{ color: 'var(--text-dim)' }}>
            共 {images.length} 張，全部為本機副本。
            可用 `npm run fetch:images` 重新抓取、`npm run check:images` 檢查檔案是否完整。
          </div>
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
        {/*
          「刻意不填」與「真的缺」要分開講。
          隨機補充包永遠不會有固定內容，把它算進待查會讓缺漏看起來比實際多兩倍。
        */}
        <div className="card" style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <div>
            <strong>真的還缺：</strong>
            套裝內容待查 {catalogAudit.contentsUnknownProducts.length} 筆 ・ 零件組成解析不出來{' '}
            {catalogAudit.unparsedBeyProducts.length} 筆。可以登記數量，但不會自動加入零件。
          </div>
          <div style={{ color: 'var(--text-dim)' }}>
            <strong>刻意不填：</strong>
            隨機補充包 {catalogAudit.randomContentsByDesign.length} 筆。盒內是哪一款要開封才知道，
            照抄商品頁的「可能抽到」清單等於憑空宣告，所以留給你自己登記。
          </div>
          <div style={{ color: 'var(--text-dim)' }}>
            <strong>本來就沒有零件：</strong>
            發射器、對戰盤、握把、收納盒等 {catalogAudit.noPartsProducts.length} 筆。
            這些會進配件庫，不進配裝器。
          </div>
        </div>
      </Section>
    </>
  )
}
