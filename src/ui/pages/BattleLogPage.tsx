/**
 * 個人對戰紀錄：逐分計分板，記一場個別對戰（先到 4 分獲勝）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md。
 * 兩畫面設計（選配裝／計分）是後續視覺優化，沒有另外的 spec 文件——
 * 決策過程見 brainstorming 對話紀錄，資料模型與規則本身完全沒變。
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

/** 本地時區的今天日期（YYYY-MM-DD），不用 UTC（見上一輪的既有教訓）。 */
function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hasAnyPart(slots: ComboSlots): boolean {
  return Object.values(slots).some(Boolean)
}

interface BattleSideProps {
  side: 'a' | 'b'
  label: string
  comboLabel: string
  score: number
  isWinner: boolean
  complete: boolean
  onScore: (finish: BattleFinish) => void
}

/** 計分板一側：配裝名、巨大分數、進度條、三個終結技按鈕。 */
function BattleSide({ side, label, comboLabel, score, isWinner, complete, onScore }: BattleSideProps) {
  const progressPercent = Math.min(score, MATCH_WIN_SCORE) / MATCH_WIN_SCORE * 100
  return (
    <div className={isWinner ? 'battle-side is-winner' : 'battle-side'}>
      <div className="battle-side-label">{label}</div>
      <div className="battle-side-combo clamp-2">{comboLabel || '（未選配裝）'}</div>
      <div className="battle-score-digit code" data-testid={`score-${side}`}>
        {score}
      </div>
      <div className="battle-score-bar" aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="battle-finish-row">
        {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
          <button
            key={finish}
            type="button"
            className="btn btn-compact"
            disabled={complete}
            data-testid={`score-${side}-${finish}`}
            onClick={() => onScore(finish)}
          >
            {FINISH_ZH[finish]}
            <br />
            +{FINISH_POINTS[finish]}
          </button>
        ))}
      </div>
    </div>
  )
}

export function BattleLogPage() {
  const parts = useAppStore((state) => state.parts)
  const images = useAppStore((state) => state.images)
  const battleMatches = useAppStore((state) => state.battleMatches)
  const run = useAppStore((state) => state.run)

  const [view, setView] = useState<'setup' | 'scoring'>('setup')
  const [structureA, setStructureA] = useState<BuilderStructure>('standard')
  const [structureB, setStructureB] = useState<BuilderStructure>('standard')
  const [slotsA, setSlotsA] = useState<ComboSlots>({})
  const [slotsB, setSlotsB] = useState<ComboSlots>({})
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

  const schemaA = useMemo(() => getBuilderSlotSchema(structureA, slotsA, parts), [structureA, slotsA, parts])
  const schemaB = useMemo(() => getBuilderSlotSchema(structureB, slotsB, parts), [structureB, slotsB, parts])

  const winRateIndex = useMemo(() => computePartWinRateIndex(battleMatches), [battleMatches])

  const ready = hasAnyPart(slotsA) && hasAnyPart(slotsB)
  const score = computeMatchScore(points)
  const complete = isMatchComplete(points)
  const winner = matchWinner(points)

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

  const winRateRows = [...winRateIndex.entries()].map(([partId, entry]) => ({
    partId,
    nameZhTW: nameOf(partId),
    ...entry,
  }))

  if (view === 'scoring') {
    return (
      <div>
        <PageHeader title="計分板" description="先到 4 分獲勝，非賽事證據" />
        <div className="stack" style={{ gap: 18 }}>
          <Row>
            <button type="button" className="btn" data-testid="back-to-setup" onClick={() => setView('setup')}>
              ← 回選裝
            </button>
          </Row>

          <div className="battle-scoreboard" data-testid="scoreboard">
            <BattleSide
              side="a"
              label="配裝 A"
              comboLabel={comboLabel(slotsA)}
              score={score.a}
              isWinner={winner === 'a'}
              complete={complete}
              onScore={(finish) => setPoints([...points, { scorer: 'a', finish }])}
            />
            <BattleSide
              side="b"
              label="配裝 B"
              comboLabel={comboLabel(slotsB)}
              score={score.b}
              isWinner={winner === 'b'}
              complete={complete}
              onScore={(finish) => setPoints([...points, { scorer: 'b', finish }])}
            />
          </div>

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
                <strong data-testid="match-winner">{winner === 'a' ? 'A 獲勝' : 'B 獲勝'}</strong>
                <Row>
                  <label>
                    日期
                    <input type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required />
                  </label>
                  <label>
                    備註
                    <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：跟阿翔在店裡打的" />
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
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 1v1 對戰，先到 4 分獲勝，非賽事證據" />

      <Section title="配裝 A">
        <Row>
          <button
            type="button"
            className={structureA === 'standard' ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setStructureA('standard')
              setSlotsA({})
            }}
          >
            三件式（BX／UX）
          </button>
          <button
            type="button"
            className={structureA === 'cx' ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setStructureA('cx')
              setSlotsA({})
            }}
          >
            CX 模組化
          </button>
        </Row>
        <div className="stack">
          {schemaA.map((def) => (
            <PartPickerField
              key={def.key}
              def={def}
              options={parts.filter((part) => def.families.includes(part.family))}
              selectedPart={parts.find((part) => part.id === slotsA[def.key])}
              availability={EMPTY_AVAILABILITY}
              images={images}
              idPrefix="a"
              onChange={(next) => setSlotsA({ ...slotsA, [def.key]: next || undefined })}
            />
          ))}
        </div>
      </Section>

      <Section title="配裝 B">
        <Row>
          <button
            type="button"
            className={structureB === 'standard' ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setStructureB('standard')
              setSlotsB({})
            }}
          >
            三件式（BX／UX）
          </button>
          <button
            type="button"
            className={structureB === 'cx' ? 'btn btn-primary' : 'btn'}
            onClick={() => {
              setStructureB('cx')
              setSlotsB({})
            }}
          >
            CX 模組化
          </button>
        </Row>
        <div className="stack">
          {schemaB.map((def) => (
            <PartPickerField
              key={def.key}
              def={def}
              options={parts.filter((part) => def.families.includes(part.family))}
              selectedPart={parts.find((part) => part.id === slotsB[def.key])}
              availability={EMPTY_AVAILABILITY}
              images={images}
              idPrefix="b"
              onChange={(next) => setSlotsB({ ...slotsB, [def.key]: next || undefined })}
            />
          ))}
        </div>
      </Section>

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
                    {battleMatch.playedAt} · {comboLabel(battleMatch.a)}（A）vs {comboLabel(battleMatch.b)}（B） ·{' '}
                    比分 {finalScore.a}:{finalScore.b} ·{' '}
                    {finalWinner === 'a' ? 'A 獲勝' : 'B 獲勝'}
                    {battleMatch.notes ? ` · ${battleMatch.notes}` : ''}
                    <details>
                      <summary>逐分紀錄</summary>
                      <ul>
                        {battleMatch.points.map((point, index) => (
                          <li key={index}>
                            第 {index + 1} 分：{point.scorer === 'a' ? 'A' : 'B'}／{FINISH_ZH[point.finish]}
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
