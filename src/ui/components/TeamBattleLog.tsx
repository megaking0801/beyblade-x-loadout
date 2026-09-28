/**
 * 3on3 團體賽對戰紀錄：三場個別對戰（1st/2nd/3rd 陀螺各一場）依序記分，
 * 每場只有一個終結技就分勝負，分數直接累加到官方的 4 分門檻。
 *
 * 規格對照：docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md。
 */
import { useState, type ReactNode } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { computeMatchScore, isMatchComplete, matchWinner, FINISH_POINTS, MATCH_WIN_SCORE } from '../../domain/battleRecords.ts'
import { getBuilderSlotSchema, type BuilderStructure } from '../../domain/compatibility.ts'
import type { BattleFinish, BattlePoint, ComboSlots } from '../../domain/types.ts'
import { PageHeader, Row, Section } from './ui.tsx'
import { PartPickerField } from './PartPicker.tsx'

const FINISH_ZH: Record<BattleFinish, string> = {
  spin: '轉停',
  over_burst: '出界／爆裂',
  xtreme: '極限',
}

const EMPTY_AVAILABILITY = new Map<string, { free: number }>()
const BEY_LABELS = ['第 1 隻', '第 2 隻', '第 3 隻'] as const

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hasAnyPart(slots: ComboSlots): boolean {
  return Object.values(slots).some(Boolean)
}

function emptyTriple(): [ComboSlots, ComboSlots, ComboSlots] {
  return [{}, {}, {}]
}

interface TeamSideEditorProps {
  label: string
  idPrefix: string
  structures: [BuilderStructure, BuilderStructure, BuilderStructure]
  slots: [ComboSlots, ComboSlots, ComboSlots]
  onChangeStructure: (index: 0 | 1 | 2, structure: BuilderStructure) => void
  onChangeSlots: (index: 0 | 1 | 2, slots: ComboSlots) => void
}

/** 一側（A 或 B）的三隻陀螺選裝，每隻獨立的結構切換＋零件選擇器。 */
function TeamSideEditor({ label, idPrefix, structures, slots, onChangeStructure, onChangeSlots }: TeamSideEditorProps) {
  const parts = useAppStore((state) => state.parts)
  const images = useAppStore((state) => state.images)

  return (
    <Section title={label}>
      <div className="stack" style={{ gap: 18 }}>
        {([0, 1, 2] as const).map((index) => {
          const structure = structures[index]
          const beySlots = slots[index]
          const schema = getBuilderSlotSchema(structure, beySlots, parts)
          return (
            <div key={index} className="card">
              <div className="battle-side-label">{BEY_LABELS[index]}陀螺</div>
              <Row>
                <button
                  type="button"
                  className={structure === 'standard' ? 'btn btn-primary' : 'btn'}
                  onClick={() => {
                    onChangeStructure(index, 'standard')
                    onChangeSlots(index, {})
                  }}
                >
                  三件式（BX／UX）
                </button>
                <button
                  type="button"
                  className={structure === 'cx' ? 'btn btn-primary' : 'btn'}
                  onClick={() => {
                    onChangeStructure(index, 'cx')
                    onChangeSlots(index, {})
                  }}
                >
                  CX 模組化
                </button>
              </Row>
              <div className="stack">
                {schema.map((def) => (
                  <PartPickerField
                    key={def.key}
                    def={def}
                    options={parts.filter((part) => def.families.includes(part.family))}
                    selectedPart={parts.find((part) => part.id === beySlots[def.key])}
                    availability={EMPTY_AVAILABILITY}
                    images={images}
                    idPrefix={`${idPrefix}-${index}`}
                    onChange={(next) => onChangeSlots(index, { ...beySlots, [def.key]: next || undefined })}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export interface TeamBattleLogProps {
  modeToggle: ReactNode
  historyAndWinRate: ReactNode
  comboLabel: (slots: ComboSlots) => string
}

export function TeamBattleLog({ modeToggle, historyAndWinRate, comboLabel }: TeamBattleLogProps) {
  const run = useAppStore((state) => state.run)

  const [view, setView] = useState<'setup' | 'scoring'>('setup')
  const [structuresA, setStructuresA] = useState<[BuilderStructure, BuilderStructure, BuilderStructure]>(['standard', 'standard', 'standard'])
  const [structuresB, setStructuresB] = useState<[BuilderStructure, BuilderStructure, BuilderStructure]>(['standard', 'standard', 'standard'])
  const [slotsA, setSlotsA] = useState<[ComboSlots, ComboSlots, ComboSlots]>(emptyTriple())
  const [slotsB, setSlotsB] = useState<[ComboSlots, ComboSlots, ComboSlots]>(emptyTriple())
  const [points, setPoints] = useState<BattlePoint[]>([])
  const [playedAt, setPlayedAt] = useState(() => localDateString(new Date()))
  const [notes, setNotes] = useState('')

  const ready = slotsA.every(hasAnyPart) && slotsB.every(hasAnyPart)
  const score = computeMatchScore(points)
  const complete = isMatchComplete(points)
  const winner = matchWinner(points)
  const scheduledIndex: 0 | 1 | 2 | undefined = points.length < 3 ? (points.length as 0 | 1 | 2) : undefined

  function updateSlot(setSlots: typeof setSlotsA, index: 0 | 1 | 2, next: ComboSlots) {
    setSlots((current) => {
      const updated = [...current] as [ComboSlots, ComboSlots, ComboSlots]
      updated[index] = next
      return updated
    })
  }

  function updateStructure(setStructures: typeof setStructuresA, index: 0 | 1 | 2, next: BuilderStructure) {
    setStructures((current) => {
      const updated = [...current] as [BuilderStructure, BuilderStructure, BuilderStructure]
      updated[index] = next
      return updated
    })
  }

  async function handleSave() {
    if (!complete) return
    const ok = await run(() =>
      repo.saveBattleMatch({
        mode: '3on3',
        a: slotsA,
        b: slotsB,
        points,
        playedAt,
        ...(notes ? { notes } : {}),
      }),
    )
    if (ok) {
      setPoints([])
      setNotes('')
      setView('setup')
    }
  }

  if (view === 'scoring') {
    return (
      <div>
        <PageHeader title="3on3 計分板" description="三場個別對戰累加分數，先到 4 分贏整場，非賽事證據" />
        <div className="stack" style={{ gap: 18 }}>
          <Row>
            <button type="button" className="btn" data-testid="team-back-to-setup" onClick={() => setView('setup')}>
              ← 回選裝
            </button>
          </Row>

          <div className="meta" data-testid="team-score">
            隊伍累計比分 A {score.a} - {score.b} B（先到 {MATCH_WIN_SCORE} 分獲勝）
          </div>

          {scheduledIndex !== undefined ? (
            <Section title={`第 ${points.length + 1} 場：${BEY_LABELS[scheduledIndex]}陀螺對戰`}>
              <div className="battle-scoreboard" data-testid="team-scoreboard">
                <div className="battle-side">
                  <div className="battle-side-label">配裝 A</div>
                  <div className="battle-side-combo clamp-2">{comboLabel(slotsA[scheduledIndex]) || '（未選配裝）'}</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        data-testid={`team-score-a-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'a', finish, beyIndex: scheduledIndex }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="battle-side">
                  <div className="battle-side-label">配裝 B</div>
                  <div className="battle-side-combo clamp-2">{comboLabel(slotsB[scheduledIndex]) || '（未選配裝）'}</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        data-testid={`team-score-b-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'b', finish, beyIndex: scheduledIndex }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          {points.length >= 3 && !complete ? (
            <Section title="未分勝負，需要延伸賽">
              <p className="meta">三場個別對戰打完仍未到 4 分，官方規則要重新排陀螺順序繼續打。這裡不綁定特定陀螺，直接用下面的按鈕繼續記分。</p>
              <div className="battle-scoreboard">
                <div className="battle-side">
                  <div className="battle-side-label">A 隊</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        disabled={complete}
                        data-testid={`team-ext-a-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'a', finish }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="battle-side">
                  <div className="battle-side-label">B 隊</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        disabled={complete}
                        data-testid={`team-ext-b-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'b', finish }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          <Row>
            <button type="button" className="btn btn-compact" disabled={points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>
              復原上一分
            </button>
            <button type="button" className="btn btn-compact" disabled={points.length === 0} onClick={() => setPoints([])}>
              清除重來
            </button>
          </Row>

          {complete ? (
            <Section title="存檔">
              <div className="card stack">
                <strong data-testid="team-match-winner">{winner === 'a' ? 'A 隊獲勝' : 'B 隊獲勝'}</strong>
                <Row>
                  <label>
                    日期
                    <input type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required />
                  </label>
                  <label>
                    備註
                    <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：跟阿翔的隊伍打的" />
                  </label>
                </Row>
                <button type="button" className="btn btn-primary" data-testid="team-save-match" onClick={() => void handleSave()}>
                  存檔
                </button>
              </div>
            </Section>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 3on3 團體賽，先到 4 分獲勝，非賽事證據" />
      {modeToggle}

      <TeamSideEditor
        label="配裝 A"
        idPrefix="team-a"
        structures={structuresA}
        slots={slotsA}
        onChangeStructure={(index, structure) => updateStructure(setStructuresA, index, structure)}
        onChangeSlots={(index, slots) => updateSlot(setSlotsA, index, slots)}
      />
      <TeamSideEditor
        label="配裝 B"
        idPrefix="team-b"
        structures={structuresB}
        slots={slotsB}
        onChangeStructure={(index, structure) => updateStructure(setStructuresB, index, structure)}
        onChangeSlots={(index, slots) => updateSlot(setSlotsB, index, slots)}
      />

      {ready ? (
        <div style={{ marginBottom: 22 }}>
          <button type="button" className="btn btn-primary" data-testid="team-start-scoring" onClick={() => setView('scoring')}>
            開始對戰 →
          </button>
        </div>
      ) : null}

      {historyAndWinRate}
    </div>
  )
}
