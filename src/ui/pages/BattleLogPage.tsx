/**
 * 個人對戰紀錄：官方 3on3 團體賽（三場個別對戰累加分數，先到 4 分贏整場）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-28-3on3-only-accordion-design.md。
 * 這輪拿掉 1v1 練習模式、選裝改手風琴收合——決策過程見 brainstorming 對話
 * 紀錄。上一輪的兩份 3on3 spec（型別、逐分歸屬、鎖定規則）仍然有效，見
 * docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md。
 */
import { useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import {
  computeMatchScore,
  computePartWinRateIndex,
  isMatchComplete,
  matchWinner,
  FINISH_POINTS,
  LOW_SAMPLE_THRESHOLD,
  MATCH_WIN_SCORE,
} from '../../domain/battleRecords.ts'
import { resolveDisplayName } from '../../domain/naming.ts'
import { getBuilderSlotSchema, type BuilderStructure } from '../../domain/compatibility.ts'
import type { BattleFinish, BattlePoint, ComboSlots } from '../../domain/types.ts'
import { EmptyState, PageHeader, Row, Section } from '../components/ui.tsx'
import { PartPickerField } from '../components/PartPicker.tsx'

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
  /** 已經打完幾場個別對戰（0-3）——那幾隻陀螺官方規則不准對戰之間再換。 */
  lockedCount: number
  /** 目前展開哪一格；null 代表這一側全部收合。 */
  expandedIndex: 0 | 1 | 2 | null
  comboLabel: (slots: ComboSlots) => string
  onToggleExpand: (index: 0 | 1 | 2) => void
  onChangeStructure: (index: 0 | 1 | 2, structure: BuilderStructure) => void
  onChangeSlots: (index: 0 | 1 | 2, slots: ComboSlots) => void
}

/**
 * 一側（A 或 B）的三隻陀螺選裝：手風琴收合列，點開才展開該格的結構切換與
 * 三個零件選擇器，其他格自動收合（同一側同時只會有一格展開）。已上場
 * 鎖住的格子整行不可點，收合摘要仍看得到已選的配裝名稱。
 */
function TeamSideEditor({
  label,
  idPrefix,
  structures,
  slots,
  lockedCount,
  expandedIndex,
  comboLabel,
  onToggleExpand,
  onChangeStructure,
  onChangeSlots,
}: TeamSideEditorProps) {
  const parts = useAppStore((state) => state.parts)
  const images = useAppStore((state) => state.images)

  return (
    <Section title={label}>
      <div className="stack" style={{ gap: 10 }}>
        {([0, 1, 2] as const).map((index) => {
          const structure = structures[index]
          const beySlots = slots[index]
          const schema = getBuilderSlotSchema(structure, beySlots, parts)
          const locked = index < lockedCount
          const expanded = !locked && expandedIndex === index
          const structureZh = structure === 'standard' ? '三件式' : 'CX'
          const summary = hasAnyPart(beySlots) ? `${comboLabel(beySlots)}・${structureZh}` : '未選'

          return (
            <div key={index} className="card">
              <button
                type="button"
                className="accordion-row-trigger"
                disabled={locked}
                aria-expanded={expanded}
                data-testid={`bey-toggle-${idPrefix}-${index}`}
                onClick={() => onToggleExpand(index)}
              >
                <span className="battle-side-label">
                  {BEY_LABELS[index]}陀螺{locked ? '（已上場，賽中不能更換）' : ''}
                </span>
                <span className="meta accordion-row-summary">{summary}</span>
                <span aria-hidden className="meta">{locked ? '已鎖定' : expanded ? '收合' : '展開'}</span>
              </button>

              {expanded ? (
                <div className="accordion-row-body stack">
                  <Row>
                    <button
                      type="button"
                      className={structure === 'standard' ? 'btn btn-primary' : 'btn'}
                      onClick={() => {
                        if (structure === 'standard') return
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
                        if (structure === 'cx') return
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
              ) : null}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function BattleLogPage() {
  const battleMatches = useAppStore((state) => state.battleMatches)
  const parts = useAppStore((state) => state.parts)
  const run = useAppStore((state) => state.run)

  const [view, setView] = useState<'setup' | 'scoring'>('setup')
  const [structuresA, setStructuresA] = useState<[BuilderStructure, BuilderStructure, BuilderStructure]>(['standard', 'standard', 'standard'])
  const [structuresB, setStructuresB] = useState<[BuilderStructure, BuilderStructure, BuilderStructure]>(['standard', 'standard', 'standard'])
  const [slotsA, setSlotsA] = useState<[ComboSlots, ComboSlots, ComboSlots]>(emptyTriple())
  const [slotsB, setSlotsB] = useState<[ComboSlots, ComboSlots, ComboSlots]>(emptyTriple())
  const [expandedA, setExpandedA] = useState<0 | 1 | 2 | null>(0)
  const [expandedB, setExpandedB] = useState<0 | 1 | 2 | null>(0)
  const [points, setPoints] = useState<BattlePoint[]>([])
  const [playedAt, setPlayedAt] = useState(() => localDateString(new Date()))
  const [notes, setNotes] = useState('')

  const partsById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const nameOf = (partId: string) => {
    const part = partsById.get(partId)
    return part ? resolveDisplayName(part.naming).titleZhTW : partId
  }
  const comboLabel = (slots: ComboSlots) =>
    Object.values(slots)
      .filter((partId): partId is string => Boolean(partId))
      .map(nameOf)
      .join('+')

  const winRateIndex = useMemo(() => computePartWinRateIndex(battleMatches), [battleMatches])
  const winRateRows = [...winRateIndex.entries()].map(([partId, entry]) => ({
    partId,
    nameZhTW: nameOf(partId),
    ...entry,
  }))

  const ready = slotsA.every(hasAnyPart) && slotsB.every(hasAnyPart)
  const score = computeMatchScore(points)
  const complete = isMatchComplete(points)
  const winner = matchWinner(points)
  // complete 一旦成立（哪怕才打完第 2 場），就不該再顯示排定中的下一場——
  // isMatchComplete 用「達到」判定，累計分數可能提早在第 2 場就過 4 分。
  const scheduledIndex: 0 | 1 | 2 | undefined = !complete && points.length < 3 ? (points.length as 0 | 1 | 2) : undefined
  // 已經打完幾場排定中的個別對戰（0-3）——官方規則不准對戰之間交換陀螺／
  // 零件，回選裝畫面要鎖住這幾隻，延伸賽（第四分起，沒有 beyIndex）不會
  // 再讓這個數字超過 3。
  const foughtCount = Math.min(points.length, 3)

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

  function toggleExpand(setExpanded: typeof setExpandedA, index: 0 | 1 | 2) {
    setExpanded((current) => (current === index ? null : index))
  }

  async function handleSave() {
    if (!complete) return
    const ok = await run(() =>
      repo.saveBattleMatch({
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
            <button type="button" className="btn" data-testid="back-to-setup" onClick={() => setView('setup')}>
              ← 回選裝
            </button>
          </Row>

          <div className="meta" data-testid="team-score">
            隊伍累計比分 A {score.a} - {score.b} B（先到 {MATCH_WIN_SCORE} 分獲勝）
          </div>

          {scheduledIndex !== undefined ? (
            <Section title={`第 ${points.length + 1} 場：${BEY_LABELS[scheduledIndex]}陀螺對戰`}>
              <div className="battle-scoreboard" data-testid="scoreboard">
                <div className="battle-side">
                  <div className="battle-side-label">配裝 A</div>
                  <div className="battle-side-combo clamp-2">{comboLabel(slotsA[scheduledIndex]) || '（未選配裝）'}</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        data-testid={`score-a-${finish}`}
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
                        data-testid={`score-b-${finish}`}
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
                        data-testid={`ext-a-${finish}`}
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
                        data-testid={`ext-b-${finish}`}
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
                <strong data-testid="match-winner">{winner === 'a' ? 'A 隊獲勝' : 'B 隊獲勝'}</strong>
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
                <button type="button" className="btn btn-primary" data-testid="save-match" onClick={() => void handleSave()}>
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

      <TeamSideEditor
        label="配裝 A"
        idPrefix="a"
        structures={structuresA}
        slots={slotsA}
        lockedCount={foughtCount}
        expandedIndex={expandedA}
        comboLabel={comboLabel}
        onToggleExpand={(index) => toggleExpand(setExpandedA, index)}
        onChangeStructure={(index, structure) => updateStructure(setStructuresA, index, structure)}
        onChangeSlots={(index, slots) => updateSlot(setSlotsA, index, slots)}
      />
      <TeamSideEditor
        label="配裝 B"
        idPrefix="b"
        structures={structuresB}
        slots={slotsB}
        lockedCount={foughtCount}
        expandedIndex={expandedB}
        comboLabel={comboLabel}
        onToggleExpand={(index) => toggleExpand(setExpandedB, index)}
        onChangeStructure={(index, structure) => updateStructure(setStructuresB, index, structure)}
        onChangeSlots={(index, slots) => updateSlot(setSlotsB, index, slots)}
      />

      {ready ? (
        <div style={{ marginBottom: 22 }}>
          <button type="button" className="btn btn-primary" data-testid="start-scoring" onClick={() => setView('scoring')}>
            開始對戰 →
          </button>
        </div>
      ) : null}

      <Section title="歷史紀錄">
        {battleMatches.length === 0 ? (
          <EmptyState title="還沒有任何對戰紀錄" />
        ) : (
          <ul>
            {[...battleMatches]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((battleMatch) => {
                const finalScore = computeMatchScore(battleMatch.points)
                const finalWinner = matchWinner(battleMatch.points)
                return (
                  <li key={battleMatch.id} data-testid="battle-match">
                    {battleMatch.playedAt} · 比分 {finalScore.a}:{finalScore.b} ·{' '}
                    {finalWinner === 'a' ? 'A 隊獲勝' : 'B 隊獲勝'}
                    {battleMatch.notes ? ` · ${battleMatch.notes}` : ''}
                    <details>
                      <summary>逐分紀錄</summary>
                      <ul>
                        {battleMatch.points.map((point, index) => (
                          <li key={index}>
                            第 {index + 1} 分（
                            {point.beyIndex !== undefined ? `第 ${point.beyIndex + 1} 隻陀螺` : '延伸賽'}
                            ）：{point.scorer === 'a' ? 'A' : 'B'}／{FINISH_ZH[point.finish]}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('確定要刪除這筆對戰紀錄嗎？')) {
                          void run(() => repo.deleteBattleMatch(battleMatch.id))
                        }
                      }}
                    >
                      刪除
                    </button>
                  </li>
                )
              })}
          </ul>
        )}
      </Section>

      <Section title="零件勝率（個人紀錄，非賽事證據）">
        {winRateRows.length === 0 ? (
          <EmptyState title="累積對戰紀錄後這裡會顯示每顆零件的勝率" />
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>零件</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>贏</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>輸</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>勝率</th>
                </tr>
              </thead>
              <tbody>
                {winRateRows.map((row) => (
                  <tr key={row.partId}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{row.nameZhTW}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{row.wins}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{row.losses}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                      {row.winRate === undefined
                        ? `樣本不足（需 ${LOW_SAMPLE_THRESHOLD} 場以上）`
                        : `${Math.round(row.winRate * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
