/**
 * 賽事統計（純函式）。
 *
 * 規格對照：第 20 節（強度分析四層）、第 21 節（賽事資料規則）、第 22 節（來源分級）。
 *
 * 重點限制：
 * - 只有 Top Cut 名單時不可計算勝率，只能算出場率／使用率／冠軍數／placement score／meta share。
 * - 小樣本不可直接比較百分比，一律附 Wilson interval 或做 Bayesian shrinkage。
 * - placement score 與可信度判定是本專案自訂的估算法，前台必須標示「模型推估」。
 */
import type { Confidence, SourceTier } from './types.ts'

/** 95% 信賴水準的 z 值。 */
export const Z_95 = 1.959963984540054

export interface WilsonInterval {
  lower: number
  upper: number
  center: number
  hasSample: boolean
}

/**
 * Wilson score interval。
 *
 * center = (p̂ + z²/2n) / (1 + z²/n)
 * halfWidth = z/(1 + z²/n) × √(p̂(1-p̂)/n + z²/4n²)
 */
export function wilsonInterval(successes: number, total: number, z: number = Z_95): WilsonInterval {
  if (successes < 0 || total < 0) throw new Error('次數不可為負數')
  if (successes > total) throw new Error('成功次數不可大於樣本數')
  if (total === 0) return { lower: 0, upper: 1, center: 0, hasSample: false }

  const p = successes / total
  const z2 = z * z
  const denominator = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / denominator
  const halfWidth =
    (z / denominator) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))

  // 解析上 p=0 時下界恰為 0、p=1 時上界恰為 1，明確處理以避免浮點誤差。
  return {
    lower: p === 0 ? 0 : Math.max(0, center - halfWidth),
    upper: p === 1 ? 1 : Math.min(1, center + halfWidth),
    center: p,
    hasSample: true,
  }
}

export interface ShrinkArgs {
  successes: number
  total: number
  /** 先驗比例，通常取全體平均。 */
  priorMean: number
  /** 先驗強度，相當於額外的虛擬樣本數。 */
  priorStrength: number
}

/** Beta-Binomial 後驗平均：(x + m·k) / (n + k)。 */
export function bayesianShrunkRate(args: ShrinkArgs): number {
  const { successes, total, priorMean, priorStrength } = args
  if (successes < 0 || total < 0) throw new Error('次數不可為負數')
  if (priorStrength < 0) throw new Error('先驗強度不可為負數')
  if (total + priorStrength === 0) return priorMean
  return (successes + priorMean * priorStrength) / (total + priorStrength)
}

/**
 * Placement score（模型推估）。
 *
 * 公式：1 / (1 + log2(名次))。第 1 名 = 1、第 2 名 = 0.5、第 4 名 = 1/3、第 8 名 = 0.25。
 * 這是本專案自訂的權重，非官方數據，前台必須標示為模型推估。
 */
export function computePlacementScore(placement: number): number {
  if (!Number.isFinite(placement) || placement < 1) throw new Error('名次必須大於或等於 1')
  return 1 / (1 + Math.log2(placement))
}

export interface MetaShareResult {
  share: number
  interval: WilsonInterval
}

/** 第 21 節：meta share 是可算的（出場數 ÷ 總名單數），勝率不是。 */
export function computeMetaShare(args: { appearances: number; totalDecks: number }): MetaShareResult {
  const { appearances, totalDecks } = args
  const share = totalDecks === 0 ? 0 : appearances / totalDecks
  return { share, interval: wilsonInterval(appearances, totalDecks) }
}

/** 第 21 節：只有真的有逐場對戰資料才能算 matchup win rate。 */
export function canComputeWinRate(args: { hasMatchRecords: boolean; matches: number }): boolean {
  return args.hasMatchRecords && args.matches > 0
}

export interface WinRateResult {
  rawRate: number
  shrunkRate: number
  interval: WilsonInterval
}

/** 勝率的先驗：50% 勝率、等值 10 場的虛擬樣本。 */
export const WIN_RATE_PRIOR_MEAN = 0.5
export const WIN_RATE_PRIOR_STRENGTH = 10

export function computeWinRate(args: {
  wins: number
  matches: number
  hasMatchRecords: boolean
}): WinRateResult {
  const { wins, matches, hasMatchRecords } = args
  if (!canComputeWinRate({ hasMatchRecords, matches })) {
    throw new Error('沒有逐場對戰資料，不可計算勝率')
  }
  return {
    rawRate: wins / matches,
    shrunkRate: bayesianShrunkRate({
      successes: wins,
      total: matches,
      priorMean: WIN_RATE_PRIOR_MEAN,
      priorStrength: WIN_RATE_PRIOR_STRENGTH,
    }),
    interval: wilsonInterval(wins, matches),
  }
}

/** 樣本數門檻（模型推估的判定標準，非官方定義）。 */
export const CONFIDENCE_MIN_SAMPLE_MEDIUM = 10
export const CONFIDENCE_MIN_SAMPLE_HIGH = 30

const OFFICIAL_TIERS: readonly SourceTier[] = ['official', 'official_organizer']

/**
 * 第 20 節 D：可信度。
 *
 * - 使用者自行提交的資料最高只能到「低」。
 * - 樣本數不足 10 為「低」。
 * - 樣本 30 以上且來源為官方或官方主辦為「高」。
 * - 其餘為「中」。
 */
export function computeConfidence(args: { sampleSize: number; sourceTier: SourceTier }): Confidence {
  const { sampleSize, sourceTier } = args
  if (sourceTier === 'user_submitted') return 'low'
  if (sampleSize < CONFIDENCE_MIN_SAMPLE_MEDIUM) return 'low'
  if (sampleSize >= CONFIDENCE_MIN_SAMPLE_HIGH && OFFICIAL_TIERS.includes(sourceTier)) return 'high'
  return 'medium'
}
