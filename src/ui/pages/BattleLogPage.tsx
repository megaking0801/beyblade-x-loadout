/**
 * 個人對戰紀錄：使用者自己（或跟朋友）的 1v1 練習對戰結果。
 *
 * 規格對照：docs/superpowers/specs/2026-09-24-personal-battle-log-design.md。
 */
import { useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { computePartWinRateIndex, LOW_SAMPLE_THRESHOLD } from '../../domain/battleRecords.ts'
import { resolveDisplayName } from '../../domain/naming.ts'
import type { BattleFinish, BattleRoundResult } from '../../domain/types.ts'
import { EmptyState, PageHeader, Section } from '../components/ui.tsx'

const FINISH_ZH: Record<BattleFinish, string> = {
  spin: '轉出',
  over: '出界',
  burst: '爆裂',
  xtreme: '超越',
  none: '未知',
}

export function BattleLogPage() {
  const parts = useAppStore((state) => state.parts)
  const combos = useAppStore((state) => state.combos)
  const battleRounds = useAppStore((state) => state.battleRounds)
  const run = useAppStore((state) => state.run)

  const [comboAId, setComboAId] = useState('')
  const [comboBId, setComboBId] = useState('')
  const [result, setResult] = useState<BattleRoundResult>('a')
  const [finish, setFinish] = useState<BattleFinish>('spin')
  const [notes, setNotes] = useState('')

  const partsById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const nameOf = (partId: string) => {
    const part = partsById.get(partId)
    return part ? resolveDisplayName(part.naming).titleZhTW : partId
  }

  const winRateIndex = useMemo(() => computePartWinRateIndex(battleRounds), [battleRounds])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const comboA = combos.find((combo) => combo.id === comboAId)
    const comboB = combos.find((combo) => combo.id === comboBId)
    if (!comboA || !comboB) return
    await run(() =>
      repo.saveBattleRound({
        a: comboA.slots,
        b: comboB.slots,
        result,
        finish,
        playedAt: new Date().toISOString().slice(0, 10),
        ...(notes ? { notes } : {}),
      }),
    )
    setNotes('')
  }

  const winRateRows = [...winRateIndex.entries()].map(([partId, entry]) => ({
    partId,
    nameZhTW: nameOf(partId),
    ...entry,
  }))

  return (
    <div>
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 1v1 練習對戰，非賽事證據" />

      <Section title="記一局">
        {combos.length < 2 ? (
          <EmptyState title="至少要有兩套已存配裝才能記錄對戰" />
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              配裝 A
              <select value={comboAId} onChange={(event) => setComboAId(event.target.value)} required>
                <option value="">選擇配裝</option>
                {combos.map((combo) => (
                  <option key={combo.id} value={combo.id}>
                    {combo.nameZhTW}
                  </option>
                ))}
              </select>
            </label>
            <label>
              配裝 B
              <select value={comboBId} onChange={(event) => setComboBId(event.target.value)} required>
                <option value="">選擇配裝</option>
                {combos.map((combo) => (
                  <option key={combo.id} value={combo.id}>
                    {combo.nameZhTW}
                  </option>
                ))}
              </select>
            </label>
            <label>
              結果
              <select value={result} onChange={(event) => setResult(event.target.value as BattleRoundResult)}>
                <option value="a">A 贏</option>
                <option value="b">B 贏</option>
                <option value="tie">平手</option>
              </select>
            </label>
            <label>
              終結方式
              <select value={finish} onChange={(event) => setFinish(event.target.value as BattleFinish)}>
                {Object.entries(FINISH_ZH).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              備註
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：跟阿翔在店裡打的" />
            </label>
            <button type="submit">記錄這一局</button>
          </form>
        )}
      </Section>

      <Section title="歷史紀錄">
        {battleRounds.length === 0 ? (
          <EmptyState title="還沒有任何對戰紀錄" />
        ) : (
          <ul>
            {[...battleRounds]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((round) => (
                <li key={round.id}>
                  {round.playedAt} · {round.result === 'tie' ? '平手' : round.result === 'a' ? 'A 贏' : 'B 贏'} ·{' '}
                  {FINISH_ZH[round.finish]}
                  {round.notes ? ` · ${round.notes}` : ''}
                  <button type="button" onClick={() => run(() => repo.deleteBattleRound(round.id))}>
                    刪除
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section title="零件勝率（個人紀錄，非賽事證據）">
        {winRateRows.length === 0 ? (
          <EmptyState title="累積對戰紀錄後這裡會顯示每顆零件的勝率" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>零件</th>
                <th>贏</th>
                <th>輸</th>
                <th>平手</th>
                <th>勝率</th>
              </tr>
            </thead>
            <tbody>
              {winRateRows.map((row) => (
                <tr key={row.partId}>
                  <td>{row.nameZhTW}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.ties}</td>
                  <td>
                    {row.winRate === undefined
                      ? `樣本不足（需 ${LOW_SAMPLE_THRESHOLD} 場以上）`
                      : `${Math.round(row.winRate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
