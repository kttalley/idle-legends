import { GREY_LEVEL_GAP, LEVELS_PER_CIRCUIT, XP_BASE, XP_EXPONENT } from '../data/constants'

/** XP required to reach the NEXT level from `level` */
export function xpForLevel(level: number): number {
  return Math.floor(XP_BASE * Math.pow(level, XP_EXPONENT))
}

/**
 * The level past which a zone stops paying XP: its top level, plus the grey-mob gap, plus
 * whatever the hero's completed laps have added (LEVELS_PER_CIRCUIT each).
 */
export function greyLevel(zoneTop: number, circuit: number): number {
  return zoneTop + GREY_LEVEL_GAP + LEVELS_PER_CIRCUIT * Math.max(0, circuit)
}

/**
 * XP for one kill that is not grey. On the first lap, or at or below the zone's top level,
 * it is the mob's reward. On a later lap the reward is scaled up to the hero, so the kills
 * per level match what the zone asked at its top level. That pace only holds up to
 * `greyLevel`, so it is bounded by laps cleared, not by how fast the hero kills.
 */
export function killXp(baseXp: number, level: number, zoneTop: number, circuit: number): number {
  if (circuit < 1 || level <= zoneTop) return baseXp
  return Math.round(baseXp * xpForLevel(level) / xpForLevel(zoneTop))
}

/** Total XP accumulated to reach `level` */
export function totalXpForLevel(level: number): number {
  let total = 0
  for (let l = 1; l < level; l++) total += xpForLevel(l)
  return total
}

/** Level from total accumulated XP */
export function levelFromXp(totalXp: number): number {
  let level = 1
  let remaining = totalXp
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level++
  }
  return level
}

/** XP within the current level band */
export function xpInCurrentLevel(totalXp: number): number {
  const level = levelFromXp(totalXp)
  const needed = totalXpForLevel(level)
  return totalXp - needed
}
