// ── The Undermaw climb sim (Phase 0) ──────────────────────────────────────────
//
// Runs a real saved hero down the Undermaw, floor by floor, using the real fight engine
// (engine/fight.ts → compileStats / resolvePlayerAttack / resolveMobAttack), and reports
// how deep it gets over time and how long each level takes. This is how UNDERMAW.md's
// targets get checked before any UI exists:
//   - floor 25 on day one, 50 in week one, 100 in about a month, 200 over months (7.3)
//   - each level ~0.7% slower than the last, so 900 to 999 takes as long as 1 to 900 (3.3)
//
// The model, stated plainly so its blind spots are visible:
//   - A floor is cleared when the hero wins most fights against its roster and its boss.
//     Floor time = kills x (mean fight time + walk overhead) + the boss fight.
//   - Clearing a NEW floor grants one permanent boost (modelled by softening enemies).
//   - At the wall the hero farms best-5 for XP (capped at that floor's level limit), and
//     retries the next floor after each farm run.
//   - Gear keeps pace with level: every few levels each non-unique item is re-rolled at the
//     hero's level and the item's existing rarity. Loot rolls at hero level in the live
//     game, so this is the steady state of an engaged player, slightly optimistic early.
//   - Not modelled: talents gained past the save, procs that live only in the store tick
//     (Nightfall, Creeping Freeze, Echo; see fight.ts), affixes, offline rates. Time is
//     "active-equivalent" hours.

import { runFight, type HeroCombatant } from '../engine/fight'
import { generateFloor, makeFloorMob, floorKillXp, floorLevelLimit, floorMinLevel, UNDERMAW } from '../engine/undermaw'
import { xpForLevel } from '../engine/progression'
import { generateItem } from '../data/items'
import { RACE_DEFINITIONS } from '../data/races'
import type { GameState, Item, Slot } from '../data/types'

export interface ClimbParams {
  /** Permanent boost per new floor cleared, e.g. 0.01 = 1% (compounding). */
  boost: number
  /** Kills a hero AT a floor's level limit needs per level (pacing lever). */
  killsPerLevel: number
  /** Seconds of walking and aggro between kills. */
  overheadSec: number
  /** Stop after this many active-equivalent days. */
  maxDays: number
  /** Fights per enemy when judging a floor. */
  seeds: number
  /** Kills per level double every this many levels of the floor's limit (the pacing rule:
   *  99 makes each level ~0.7% slower than the last). 0 disables. */
  doubleEvery: number
}

/** The level ceiling (UNDERMAW.md 3.3). */
export const LEVEL_MAX = 999

export interface ClimbResult {
  daysTo: Record<number, number | null>
  levelAt: Record<number, number>
  finalDepth: number
  finalLevel: number
  /** Mean hours per level within level bands, for the 0.7%-per-level check. */
  hoursPerLevel: { band: string; hours: number }[]
  stuck: string | null
  /** Days to reach these levels (null if not reached). */
  daysToLevel: Record<number, number | null>
}

const DAY = 86400

function heroFrom(state: GameState, level: number, equipment: Record<Slot, Item | null>): HeroCombatant {
  return {
    name: state.playerName, playerClass: state.playerClass, level, equipment,
    talentAllocs: state.talentAllocs ?? {},
    racialPassive: RACE_DEFINITIONS[state.playerRace]?.racialPassive ?? {},
  }
}

/** Re-roll each non-unique worn item at the hero's level, keeping its rarity. */
function gearAt(base: Record<Slot, Item | null>, level: number): Record<Slot, Item | null> {
  const out = {} as Record<Slot, Item | null>
  for (const [slot, item] of Object.entries(base) as [Slot, Item | null][]) {
    out[slot] = item && !item.uniqueId ? generateItem(slot, level, 0, item.rarity, item.name) : item
  }
  return out
}

interface FloorEval { clear: boolean; floorSec: number; bossSec: number }

export function climb(state: GameState, p: ClimbParams): ClimbResult {
  let level = state.level
  let xp = 0
  let depth = 0                // deepest floor cleared
  let boosts = 0               // new floors cleared = permanent boosts earned
  let t = 0                    // seconds
  let gearLevel = level
  let gear = gearAt(state.equipment, level)
  const cache = new Map<string, FloorEval>()
  const daysTo: Record<number, number | null> = { 25: null, 50: null, 100: null, 200: null, 300: null, 445: null }
  const levelAt: Record<number, number> = {}
  const levelTimes: number[] = []   // levelTimes[i] = t when level (start + i) was reached
  levelTimes.push(0)
  const startLevel = level
  let stuck: string | null = null
  const daysToLevel: Record<number, number | null> = { 300: null, 500: null, 700: null, 900: null, 999: null }

  const evalFloor = (d: number): FloorEval => {
    const key = `${d}|${level}|${boosts}|${gearLevel}`
    const hit = cache.get(key); if (hit) return hit
    const floor = generateFloor(d)
    const soften = Math.pow(1 + p.boost, boosts)
    const hero = heroFrom(state, level, gear)
    let wins = 0, fights = 0, killSec = 0
    for (const e of floor.roster.slice(0, 5)) {
      for (let s = 0; s < p.seeds; s++) {
        const r = runFight(1000 + d * 31 + s, hero, makeFloorMob(e, d, { soften }), { maxSeconds: 90 })
        fights++; if (r.winner === 0) { wins++; killSec += r.duration }
      }
    }
    let bossWins = 0, bossSec = 0
    for (let s = 0; s < p.seeds; s++) {
      const r = runFight(7000 + d * 17 + s, hero, makeFloorMob(floor.boss, d, { isBoss: true, soften, title: floor.boss.title }), { maxSeconds: 180 })
      if (r.winner === 0) { bossWins++; bossSec += r.duration }
    }
    const clear = wins / fights >= 0.67 && bossWins / p.seeds >= 0.67
    const meanKill = wins ? killSec / wins : 90
    const out = { clear, floorSec: floor.killTarget * (meanKill + p.overheadSec), bossSec: bossWins ? bossSec / bossWins : 180 }
    cache.set(key, out)
    return out
  }

  const gainXp = (d: number, kills: number) => {
    for (let k = 0; k < kills; k++) {
      const add = level >= LEVEL_MAX ? 0 : floorKillXp(d, level, p.killsPerLevel, p.doubleEvery)
      if (!add) return
      xp += add
      while (xp >= xpForLevel(level) && level < floorLevelLimit(d) && level < LEVEL_MAX) {
        xp -= xpForLevel(level); level++
        levelTimes.push(t)
        if (daysToLevel[level] === null) daysToLevel[level] = t / DAY
        if (level - gearLevel >= 5) { gearLevel = level; gear = gearAt(state.equipment, level) }
      }
    }
  }

  const marks = [1, 7, 30, 60, 120]
  while (t < p.maxDays * DAY) {
    const next = depth + 1
    const gated = level < floorMinLevel(next)
    const ev = gated ? null : evalFloor(next)
    if (ev?.clear) {
      t += ev.floorSec + ev.bossSec
      gainXp(next, 30)
      depth = next; boosts++
      for (const f of Object.keys(daysTo).map(Number)) if (daysTo[f] === null && depth >= f) daysTo[f] = t / DAY
    } else {
      // The wall. Farm where kills are fastest and still pay: the shallowest floor whose level
      // limit is above the hero (the auto-farm toggle in UNDERMAW.md 7.6 picks the same
      // floor). If that floor is unexpectedly hard (floors vary by roster and boss), step
      // up toward the surface until one is clearable.
      const shallowest = Math.max(1, Math.floor((level - UNDERMAW.levelFloor) / UNDERMAW.levelsPerFloor) + 1)
      if (shallowest > depth && !gated) {
        stuck = `power wall at floor ${next}, level ${level}: every floor that still teaches it is unexplored`
        break
      }
      let farm = shallowest, fe = evalFloor(farm)
      for (let up = 0; !fe.clear && up < 8 && farm < depth; up++) { farm++; fe = evalFloor(farm) }
      if (!fe.clear) {
        stuck = `walled at floor ${next}, level ${level}: no clearable floor near ${shallowest}`
        break
      }
      t += fe.floorSec + fe.bossSec
      gainXp(farm, 30)
    }
    for (const m of marks) if (levelAt[m] === undefined && t >= m * DAY) levelAt[m] = level
  }
  for (const m of marks) if (levelAt[m] === undefined) levelAt[m] = level

  // Hours per level in bands of 100 levels, from the level-up timestamps.
  const hoursPerLevel: { band: string; hours: number }[] = []
  for (let lo = Math.ceil(startLevel / 100) * 100; lo < level; lo += 100) {
    const i0 = lo - startLevel, i1 = Math.min(lo + 100, level) - startLevel
    if (i0 < 0 || i1 >= levelTimes.length || i1 <= i0) continue
    hoursPerLevel.push({ band: `${lo}-${lo + (i1 - i0)}`, hours: (levelTimes[i1] - levelTimes[i0]) / 3600 / (i1 - i0) })
  }
  return { daysTo, levelAt, finalDepth: depth, finalLevel: level, hoursPerLevel, stuck, daysToLevel }
}

export function formatClimb(label: string, r: ClimbResult): string {
  const d = (x: number | null) => x === null ? '-' : x < 1 ? `${(x * 24).toFixed(1)}h` : `${x.toFixed(1)}d`
  const to = Object.entries(r.daysTo).map(([f, x]) => `F${f}:${d(x)}`).join(' ')
  const lv = Object.entries(r.levelAt).map(([m, l]) => `d${m}:L${l}`).join(' ')
  const hp = r.hoursPerLevel.map(h => `${h.band}:${h.hours.toFixed(2)}h`).join(' ')
  const dl = Object.entries(r.daysToLevel).map(([l, x]) => `L${l}:${d(x)}`).join(' ')
  const t900 = r.daysToLevel[900], t999 = r.daysToLevel[999]
  const ratio = t900 && t999 ? `  (900->999 takes ${((t999 - t900) / t900).toFixed(2)}x the time to 900)` : ''
  return `${label}\n    reach: ${to}\n    level: ${lv}  -> floor ${r.finalDepth}, L${r.finalLevel}` +
    `\n    levels: ${dl}${ratio}` +
    `${hp ? `\n    hours/level: ${hp}` : ''}${r.stuck ? `\n    ${r.stuck}` : ''}`
}

export { UNDERMAW }
