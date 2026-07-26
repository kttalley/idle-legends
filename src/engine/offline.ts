import {
  OFFLINE_CAP_HOURS, TICK_RATE_MS, ITEM_DROP_CHANCE,
  OFFLINE_MIN_SECONDS, OFFLINE_RATE_WINDOW_SECONDS, OFFLINE_MIN_MEASURED_SECONDS,
} from '../data/constants'
import { GATHER_SECONDS, GATHER_YIELD, purityToQuality } from './crafting'
import type { GameState, Item, QualityTier, Slot } from '../data/types'
import { generateItem } from '../data/items'
import { placeDrop } from './loot'
import { compileStats } from './combat'
import { xpForLevel } from './progression'
import { RACE_DEFINITIONS } from '../data/races'
import { compileUpgrades } from './../data/upgrades'

export interface OfflineSummary {
  secondsElapsed: number
  ticksSimulated: number
  cappedAt: number | null  // if capped, the cap in seconds
}

export function calculateOfflineTime(lastTimestamp: number, extraHours = 0): OfflineSummary {
  const now = Date.now()
  const rawMs = now - lastTimestamp
  const capMs = (OFFLINE_CAP_HOURS + extraHours) * 60 * 60 * 1000

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

// ── Offline progress ──────────────────────────────────────────────────────────
//
// Until now `calculateOfflineTime` had ZERO callers: closing the tab produced nothing at
// all, and `OFFLINE_CAP_HOURS` was decorative. For a game whose premise is that progress
// continues while you are away, "away" could only mean "tab open, screen ignored".
//
// The approach is to measure the hero's own recent combat rate and replay it, rather than
// model what combat ought to pay. Two reasons that beats re-simulating ticks: fidelity
// (the rate already includes this hero's gear, talents, zone and luck) and cost — honest
// re-simulation needs sub-second ticks, because combat resolves at most one swing per
// tick, which is ~115,000 ticks for an 8-hour window and far too slow on a phone.
//
// The parity promise, stated precisely, because measuring it forced the wording:
//
//   • Offline NEVER pays better than online. This is the one that matters — if idling
//     out-earned playing, closing the tab would be the optimal strategy, and that is a far
//     worse failure than paying a little light. Asserted in the harness.
//   • When nothing is changing, offline pays the SAME. A settled hero comes back to what
//     watching would have given them (measured within a few percent).
//
// It does NOT claim to match a hero mid-progression, and cannot: the projection replays a
// measured rate, while a hero who levels and moves to a richer zone compounds in a way no
// fixed rate follows. Auto-advance alone opens a ~40% gap — entirely in the safe
// direction. Closing it would mean rebuilding the combat model in here, which is exactly
// the duplication this design avoids.

/**
 * An exponentially-weighted record of what combat actually produced, updated live and
 * persisted.
 *
 * Every field is a decaying integral: each tick the running totals are multiplied by
 * `exp(-dt / τ)` and then the tick's own output is added. A rate is any total over
 * `seconds`, and `seconds` itself converges to τ, so no division-by-zero and no warmup
 * special case.
 *
 * This started as plain totals that HALVED whenever they crossed the window length, and
 * the parity harness caught what that does: a halving step is a sawtooth, so immediately
 * after one the average is dominated by old play. A hero who had spent the window levelling
 * up was projected at their beginner rate, and offline under-paid by ~16% on every seed
 * measured — a persistent sign, which is a bias rather than noise. Continuous decay has no
 * such edge, and a shorter τ keeps it tracking the hero the player actually left behind.
 */
export interface OfflineRates {
  seconds: number
  gold: number
  xp: number
  kills: number
}

export function emptyRates(): OfflineRates {
  return { seconds: 0, gold: 0, xp: 0, kills: 0 }
}

/** Fold one tick of field time — and anything it killed — into the decaying record. */
export function accrueRates(
  r: OfflineRates, deltaSeconds: number, gold: number, xp: number, kills: number,
): OfflineRates {
  const w = Math.exp(-deltaSeconds / OFFLINE_RATE_WINDOW_SECONDS)
  return {
    seconds: r.seconds * w + deltaSeconds,
    gold: r.gold * w + gold,
    xp: r.xp * w + xp,
    kills: r.kills * w + kills,
  }
}

export interface OfflineReport {
  secondsElapsed: number
  cappedAtHours: number | null
  kills: number
  gold: number
  xp: number
  levelsGained: number
  itemsEquipped: number
  itemsSold: number
  itemsBagged: number
  itemsSalvaged: number
  /** Gold inside `gold` that came from the factor and from scrapping, for the summary. */
  soldGold: number
  salvagedGold: number
}

export interface OfflineOutcome {
  patch: Partial<GameState>
  report: OfflineReport
}

const ALL_SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

/**
 * Project a stretch of absence onto the hero, and return the state patch plus a report.
 *
 * Gold, XP and kills are the measured rate times the elapsed window. Drops are then rolled
 * for those kills at the live `ITEM_DROP_CHANCE` and pushed through `placeDrop` — the very
 * same ladder the online tick uses — so the merchant contract genuinely works while you are
 * away (which is what the plan promised it would do and it previously could not), auto-equip
 * genuinely makes the hero stronger while away, and the bag fills exactly as it would have.
 *
 * Returns null when there is nothing to grant: too short an absence, or too little measured
 * play to extrapolate from honestly. Guessing a rate for a hero who has barely fought would
 * be inventing progress rather than continuing it.
 */
export function projectOfflineProgress(state: GameState, now: number): OfflineOutcome | null {
  const rates = state.offlineRates
  if (!rates || rates.seconds < OFFLINE_MIN_MEASURED_SECONDS) return null

  const fx = compileUpgrades(state.upgradeRanks)
  const elapsed = calculateOfflineTime(state.lastTickTimestamp ?? now, fx.offlineHours)
  if (elapsed.secondsElapsed < OFFLINE_MIN_SECONDS) return null

  const secs = elapsed.secondsElapsed
  const kills = Math.floor((rates.kills / rates.seconds) * secs)
  if (kills <= 0) return null

  // Scale gold and XP by the kills actually granted, not by raw elapsed time, so the
  // three numbers stay consistent with each other after flooring.
  const perKillGold = rates.gold / rates.kills
  const perKillXp   = rates.xp / rates.kills
  const gold = Math.round(perKillGold * kills)
  const gainedXp = Math.round(perKillXp * kills)

  // ── Levels ────────────────────────────────────────────────────────────────
  let level = state.level
  let xp = state.xp + gainedXp
  let talentPoints = state.talentPoints
  const startLevel = level
  // Bounded: a pathological rate cannot spin here.
  while (xp >= xpForLevel(level) && level - startLevel < 200) {
    xp -= xpForLevel(level)
    level++
    talentPoints++
  }

  // ── Drops, through the real ladder ────────────────────────────────────────
  const racialPassive = RACE_DEFINITIONS[state.playerRace]?.racialPassive ?? {}
  let equipment = { ...state.equipment }
  const inventory = [...state.inventory]
  let soldGold = 0
  let salvagedGold = 0
  let equipped = 0, sold = 0, bagged = 0, scrapped = 0

  const drops = Math.round(kills * (ITEM_DROP_CHANCE + fx.dropChance))
  for (let i = 0; i < drops; i++) {
    const slot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)]
    const item = generateItem(slot, level, 0)
    const placed = placeDrop(item, equipment, inventory, {
      playerClass: state.playerClass, level, talentAllocs: state.talentAllocs,
      racialPassive, autoEquip: state.settings?.autoEquip !== false,
      contract: state.merchantContract, salvageBonus: fx.salvageRate,
    })
    equipment = placed.equipment
    soldGold += placed.sold
    salvagedGold += placed.salvaged
    if (placed.outcome === 'equipped') equipped++
    else if (placed.outcome === 'sold') sold++
    else if (placed.outcome === 'salvaged') scrapped++
    else bagged++
  }

  const stats = compileStats(state.playerClass, level, equipment, state.talentAllocs, racialPassive)
  // Come back on full health. The hero rested; there is no fight in progress to preserve
  // HP across, and returning to a sliver of health you cannot explain is just confusing.
  stats.currentHp = stats.maxHp

  const totalGold = gold + soldGold + salvagedGold

  return {
    patch: {
      gold: state.gold + totalGold,
      xp, level, talentPoints, equipment, inventory, stats,
      totalSalvaged: (state.totalSalvaged ?? 0) + salvagedGold,
      totalAutoSold: (state.totalAutoSold ?? 0) + soldGold,
      lastTickTimestamp: now,
    },
    report: {
      secondsElapsed: secs,
      cappedAtHours: elapsed.cappedAt === null ? null : OFFLINE_CAP_HOURS + fx.offlineHours,
      kills, gold: totalGold, xp: gainedXp,
      levelsGained: level - startLevel,
      itemsEquipped: equipped, itemsSold: sold, itemsBagged: bagged, itemsSalvaged: scrapped,
      soldGold, salvagedGold,
    },
  }
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
