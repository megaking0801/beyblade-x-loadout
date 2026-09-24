/**
 * 個人對戰紀錄：逐分計分板，記一場個別對戰（先到 4 分獲勝）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md。
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

export function BattleLogPage() {
  const parts = useAppStore((state) => state.parts)
  const images = useAppStore((state) => state.images)
  const battleMatches = useAppStore((state) => state.battleMatches)
  const run = useAppStore((state) => state.run)

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
    }
  }

  const winRateRows = [...winRateIndex.entries()].map(([partId, entry]) => ({
    partId,
    nameZhTW: nameOf(partId),
    ...entry,
  }))

  return (
    <div>
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 1v1 對戰，先到 4 分獲勝，非賽事證據" />

      <Section title="配裝 A">
        <Row>
          <button type="button" className={structureA === 'standard' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureA('standard')}>
            三件式（BX／UX）
          </button>
          <button type="button" className={structureA === 'cx' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureA('cx')}>
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
          <button type="button" className={structureB === 'standard' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureB('standard')}>
            三件式（BX／UX）
          </button>
          <button type="button" className={structureB === 'cx' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureB('cx')}>
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
        <Section title="計分板">
          <div className="card" data-testid="scoreboard">
            <Row>
              <strong data-testid="score-a">A {score.a}</strong>
              <span>-</span>
              <strong data-testid="score-b">{score.b} B</strong>
            </Row>
            <Row>
              <div className="stack">
                {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    className="btn"
                    disabled={complete}
                    data-testid={`score-a-${finish}`}
                    onClick={() => setPoints([...points, { scorer: 'a', finish }])}
                  >
                    A {FINISH_ZH[finish]} +{FINISH_POINTS[finish]}
                  </button>
                ))}
              </div>
              <div className="stack">
                {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    className="btn"
                    disabled={complete}
                    data-testid={`score-b-${finish}`}
                    onClick={() => setPoints([...points, { scorer: 'b', finish }])}
                  >
                    B {FINISH_ZH[finish]} +{FINISH_POINTS[finish]}
                  </button>
                ))}
              </div>
            </Row>
            <Row>
              <button type="button" className="btn" disabled={points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>
                復原上一分
              </button>
              <button type="button" className="btn" disabled={points.length === 0} onClick={() => setPoints([])}>
                清除重來
              </button>
            </Row>
            {complete ? (
              <Row>
                <strong data-testid="match-winner">{winner === 'a' ? 'A 獲勝' : 'B 獲勝'}</strong>
                <label>
                  日期
                  <input type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required />
                </label>
                <label>
                  備註
                  <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：跟阿翔在店裡打的" />
                </label>
                <button type="button" data-testid="save-match" onClick={() => void handleSave()}>
                  存檔
                </button>
              </Row>
            ) : null}
          </div>
        </Section>
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
