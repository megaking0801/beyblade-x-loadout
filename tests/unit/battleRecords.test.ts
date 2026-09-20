import { describe, expect, it } from 'vitest'
import {
  evidenceLevelFor,
  exportBattleDataset,
  summarizeBattlePair,
  validateBattleRoundInput,
  type SaveBattleRoundInput,
} from '../../src/domain/battleRecords.ts'
import type { BattleRoundRecord, ComboSlots } from '../../src/domain/types.ts'

const a: ComboSlots = { bladeId: 'blade-a', ratchetId: 'ratchet-a', bitId: 'bit-a' }
const b: ComboSlots = { bladeId: 'blade-b', ratchetId: 'ratchet-b', bitId: 'bit-b' }

function input(over: Partial<SaveBattleRoundInput> = {}): SaveBattleRoundInput {
  return {
    a,
    b,
    result: 'a',
    finish: 'xtreme',
    stadium: 'Xtreme Stadium',
    format: '單顆對戰',
    playedAt: '2026-09-21',
    source: 'player_test',
    ...over,
  }
}

function record(over: Partial<BattleRoundRecord> = {}): BattleRoundRecord {
  const valid = validateBattleRoundInput(input())
  return {
    id: 'round-1',
    createdAt: '2026-09-21T00:00:00Z',
    evidenceLevel: 'local',
    ...valid,
    ...over,
  }
}

describe('逐局實戰紀錄', () => {
  it('公開影片必須同時有網址與時間點', () => {
    expect(() => validateBattleRoundInput(input({ source: 'public_video' }))).toThrow('影片網址與時間點')
    expect(() => validateBattleRoundInput(input({ source: 'public_video', sourceUrl: 'https://example.test/video', timestampSeconds: 12 }))).not.toThrow()
  })

  it('平手與無效局不能偽造勝利方式', () => {
    expect(() => validateBattleRoundInput(input({ result: 'tie', finish: 'spin' }))).toThrow('不適用')
    expect(() => validateBattleRoundInput(input({ result: 'invalid', finish: 'none' }))).not.toThrow()
  })

  it('附影片仍只是未審核等級，不能由使用者直接建立 reviewed', () => {
    expect(evidenceLevelFor(input())).toBe('local')
    expect(evidenceLevelFor(input({ sourceUrl: 'https://example.test/video' }))).toBe('video_attached')
  })

  it('A/B 反向儲存時會正確換算目前畫面的勝負', () => {
    const summary = summarizeBattlePair([
      record(),
      record({ id: 'round-2', a: b, b: a, result: 'b' }),
      record({ id: 'round-3', result: 'tie', finish: 'none' }),
      record({ id: 'round-4', result: 'invalid', finish: 'none' }),
    ], a, b)
    expect(summary.aWins).toBe(2)
    expect(summary.bWins).toBe(0)
    expect(summary.ties).toBe(1)
    expect(summary.invalidRounds).toBe(1)
    expect(summary.validRounds).toBe(3)
  })

  it('匿名匯出排除本機 id、建立時間、備註與玩家識別', () => {
    const payload = exportBattleDataset([record({ notes: '我的姓名不能外流' })], '2026-09-21T12:00:00Z')
    expect(payload.schemaVersion).toBe(1)
    expect(payload.privacy).toBe('anonymous-no-device-or-player-id')
    expect(payload.records[0]).not.toHaveProperty('id')
    expect(payload.records[0]).not.toHaveProperty('createdAt')
    expect(payload.records[0]).not.toHaveProperty('notes')
    expect(JSON.stringify(payload)).not.toContain('我的姓名')
  })
})
