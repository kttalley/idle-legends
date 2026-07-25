import { OFFLINE_CAP_HOURS, TICK_RATE_MS } from '../data/constants'
import { GATHER_SECONDS, GATHER_YIELD, purityToQuality } from './crafting'
import type { QualityTier } from '../data/types'

export interface OfflineSummary {
  secondsElapsed: number
  ticksSimulated: number
  cappedAt: number | null  // if capped, the cap in seconds
}

export function calculateOfflineTime(lastTimestamp: number): OfflineSummary {
  const now = Date.now()
  const rawMs = now - lastTimestamp
  const capMs = OFFLINE_CAP_HOURS * 60 * 60 * 1000

  const effectiveMs = Math.min(rawMs, capMs)
  const secondsElapsed = Math.floor(effectiveMs / 1000)
  const ticksSimulated = Math.floor(effectiveMs / TICK_RATE_MS)

  return {
    secondsElapsed,
    ticksSimulated,
    cappedAt: rawMs > capMs ? capMs / 1000 : null,
  }
}

// ── The idle floor ────────────────────────────────────────────────────────────
// The gathering/crafting design (.planning/gathering-crafting-plan.md) promises that a
// player who never touches the screen keeps the pre-change rate. This is that promise as
// a function: unattended time yields `GATHER_YIELD` units every `GATHER_SECONDS`, at
// zero purity — i.e. Coarse, the exact quality the game produced before strikes existed.
// The gathering panel renders it, so the floor is stated to the player rather than only
// asserted in a plan document.

export interface GatherProjection {
  /** Units harvested over the window, at the untouched baseline cadence. */
  units: number
  /** Purity banked without player input. Always 0 — that is the whole point. */
  purityPerUnit: number
  /** Quality that purity resolves to. Always 'coarse'. */
  quality: QualityTier
  /** Units per minute, for UI readouts. */
  unitsPerMinute: number
}

export function projectGathering(secondsElapsed: number): GatherProjection {
  const units = Math.floor(Math.max(0, secondsElapsed) / GATHER_SECONDS) * GATHER_YIELD
  return {
    units,
    purityPerUnit: 0,
    quality: purityToQuality(0),
    unitsPerMinute: (60 / GATHER_SECONDS) * GATHER_YIELD,
  }
}
