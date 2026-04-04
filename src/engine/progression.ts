import { XP_BASE, XP_EXPONENT } from '../data/constants'

/** XP required to reach the NEXT level from `level` */
export function xpForLevel(level: number): number {
  return Math.floor(XP_BASE * Math.pow(level, XP_EXPONENT))
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
