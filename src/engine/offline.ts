import { OFFLINE_CAP_HOURS, TICK_RATE_MS } from '../data/constants'

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
