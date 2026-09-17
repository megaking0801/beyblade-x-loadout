import { useMemo, useState } from 'react'
import { formatPartLabel } from '../../domain/naming.ts'
import { searchParts } from '../../domain/search.ts'
import { BEY_TYPE_ZH, type ImageAsset, type Part } from '../../domain/types.ts'
import type { SlotDef } from '../../domain/compatibility.ts'
import { Badge, EmptyState, PartThumb, TypeTag } from './ui.tsx'
import { Sheet } from './Sheet.tsx'

type Availability = ReadonlyMap<string, { free: number }>

export function PartPickerField({
  def,
  options,
  selectedPart,
  availability,
  images,
  noteZhTW,
  disabledReasonZhTW,
  onChange,
}: {
  def: SlotDef
  options: Part[]
  selectedPart?: Part
  availability: Availability
  images: ImageAsset[]
  noteZhTW?: string
  /**
   * 這個槽位為什麼不用選。
   *
   * 直接讓欄位消失，使用者會以為畫面沒反應（也看不出「這顆已含固鎖」）；
   * 保留欄位但鎖死並寫明原因，才看得出是系統判定不需要選。
   */
  disabledReasonZhTW?: string
  onChange: (partId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<Part['type'] | 'all'>('all')
  const imageUrlByPartId = useMemo(
    () => new Map(images.filter((image) => image.entityType === 'part').map((image) => [image.entityId, image.url])),
    [images],
  )
  const types = useMemo(
    () => [...new Set(options.flatMap((part) => part.type ? [part.type] : []))],
    [options],
  )
  const rows = useMemo(
    () => searchParts(options, query).filter(({ part }) => type === 'all' || part.type === type).slice(0, 100),
    [options, query, type],
  )
  const close = () => {
    setOpen(false)
    setQuery('')
    setType('all')
  }
  const selectedLabel = selectedPart ? formatPartLabel(selectedPart).titleZhTW : `選擇${def.labelZhTW}`

  return (
    <div data-testid={`slot-${def.key}`} style={{ display: 'grid', gap: 4 }}>
      <span id={`slot-label-${def.key}`} style={{ fontSize: 13, color: 'var(--text-dim)' }}>{def.labelZhTW}</span>
      <button
        type="button"
        className={disabledReasonZhTW ? 'field part-picker-trigger is-locked' : 'field part-picker-trigger'}
        aria-labelledby={`slot-label-${def.key}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={Boolean(disabledReasonZhTW)}
        data-testid={`slot-trigger-${def.key}`}
        onClick={() => setOpen(true)}
      >
        {selectedPart ? <PartThumb code={selectedPart.code} nameZhTW={selectedLabel} imageUrl={imageUrlByPartId.get(selectedPart.id)} size={34} /> : null}
        <span>{disabledReasonZhTW ? '不需要選' : selectedLabel}</span>
        <span aria-hidden className="meta">{disabledReasonZhTW ? '已鎖定' : '選擇'}</span>
      </button>
      {disabledReasonZhTW ? (
        <span className="meta" data-testid={`slot-locked-${def.key}`}>
          {disabledReasonZhTW}
        </span>
      ) : null}
      {noteZhTW ? <span className="meta">{noteZhTW}</span> : null}

      <Sheet
        open={open}
        titleZhTW={`選擇${def.labelZhTW}`}
        onClose={close}
        testId="part-picker-sheet"
        header={
          <>
            <input
              className="field"
              data-testid="picker-search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋中文、英文、日文或型號"
              aria-label={`搜尋${def.labelZhTW}`}
            />
            {types.length > 1 ? (
              <div className="chip-row" aria-label="類型篩選">
                <button type="button" className={type === 'all' ? 'btn btn-primary' : 'btn'} aria-pressed={type === 'all'} onClick={() => setType('all')}>全部</button>
                {types.map((item) => <button key={item} type="button" className={type === item ? 'btn btn-primary' : 'btn'} aria-pressed={type === item} onClick={() => setType(item)}>{BEY_TYPE_ZH[item]}</button>)}
              </div>
            ) : null}
          </>
        }
      >
        <div className="spec-list part-picker-list">
          <button type="button" className="spec-row part-picker-row" data-testid="picker-option-none" onClick={() => { onChange(''); close() }}>
            尚未選擇{def.labelZhTW}
          </button>
          {rows.map(({ part, displayTitleZhTW }) => {
            const free = availability.get(part.id)?.free
            return (
              <button
                key={part.id}
                type="button"
                className="spec-row part-picker-row"
                data-testid="picker-option"
                data-part-id={part.id}
                aria-pressed={selectedPart?.id === part.id}
                onClick={() => { onChange(part.id); close() }}
              >
                <PartThumb code={part.code} nameZhTW={displayTitleZhTW} imageUrl={imageUrlByPartId.get(part.id)} />
                <span style={{ minWidth: 0, textAlign: 'left' }}>
                  <strong>{displayTitleZhTW}</strong>
                  {/*
                    這裡本來寫類型與重量。重量拿掉了（同款零件個體差異大，
                    標一個數字是誤導），改放白話說明 —— 挑固鎖與軸心時只看
                    「3-60」「F」這種型號，不熟的人根本不知道差在哪。
                  */}
                  <span className="meta part-picker-meta">
                    <TypeTag type={part.type} />
                    {part.plainDescriptionZhTW ? (
                      <span className="clamp-2">{part.plainDescriptionZhTW}</span>
                    ) : null}
                  </span>
                  {part.integratedRatchet ? <Badge>含固鎖</Badge> : null}
                </span>
                <span className="spec-figure meta">{free === undefined ? '圖鑑' : `可用 ×${free}`}</span>
              </button>
            )
          })}
        </div>
        {rows.length === 0 ? <EmptyState title="找不到符合的零件" testId="picker-empty" /> : null}
      </Sheet>
    </div>
  )
}
