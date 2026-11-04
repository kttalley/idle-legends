import {
  OFFLINE_CAP_HOURS, TICK_RATE_MS, ITEM_DROP_CHANCE,
  OFFLINE_MIN_SECONDS, OFFLINE_RATE_WINDOW_SECONDS, OFFLINE_MIN_MEASURED_SECONDS,
  OFFLINE_THIN_SAMPLE_SECONDS, OFFLINE_THIN_SAMPLE_CAP_SECONDS, GREY_LEVEL_GAP,
  WATCH_EXTEND_HOURS, WATCH_EXTEND_BASE_COST, OFFLINE_EFFICIENCY,
} from '../data/constants'
import { UPGRADE_COST_GROWTH } from '../data/upgrades'
import { ZONES } from '../data/zones'
import { ZONE_MATERIALS, MATERIALS } from '../data/professions'
import { GATHER_SECONDS, GATHER_YIELD, purityToQuality } from './crafting'
import type { GameState, Item, QualityTier, Slot } from '../data/types'
import { generateItem } from '../data/items'
import { placeDrop, ELITE_RARITY_BIAS, ELITE_DROP_CHANCE_MULT } from './loot'
import { compileStats } from './combat'
import { xpForLevel } from './progression'
import { RACE_DEFINITIONS } from '../data/races'
import { compileUpgrades } from './../data/upgrades'
import { compileUniques } from '../data/uniques'

export interface OfflineSummary {
  secondsElapsed: number
  ticksSimulated: number
  cappedAt: number | null  // if capped, the cap in seconds
}

export function calculateOfflineTime(
  lastTimestamp: number, extraHours = 0, extraSeconds = 0,
): OfflineSummary {
  const now = Date.now()
  const rawMs = now - lastTimestamp
  // `extraHours` is PERMANENT capacity (the free base, `long_watch` ranks, a unique, the
  // watch pack); `extraSeconds` is the BANKED extension, which the absence consumes. They
  // are added the same way here and told apart by the caller, which is what decides how
  // much of the bank to spend.
  const capMs = (OFFLINE_CAP_HOURS + extraHours) * 60 * 60 * 1000 + extraSeconds * 1000

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
  /**
   * Of those kills, how many were elites or bosses.
   *
   * Drops are not interchangeable: an elite doubles the drop chance and biases rarity
   * (`loot.ts`), so an hour's loot depends on WHAT the hero killed and not only how many.
   * Offline used to roll every drop at `generateItem(slot, level, 0)`, so idling returned
   * measurably poorer gear than watching the same hour — 4.9% lower mean rarity per drop,
   * invisible to every gate here because they all count gold and kills rather than
   * quality.
   *
   * Measured rather than assumed from `ELITE_SPAWN_CHANCE`, for the same reason the rest
   * of this file replays a measured rate instead of modelling one: a hero farming a boss,
   * or one whose zone runs hot with elites, is not the average hero.
   */
  eliteKills: number
}

export function emptyRates(): OfflineRates {
  return { seconds: 0, gold: 0, xp: 0, kills: 0, eliteKills: 0 }
}

/** Fold one tick of field time — and anything it killed — into the decaying record. */
export function accrueRates(
  r: OfflineRates, deltaSeconds: number, gold: number, xp: number, kills: number,
  eliteKills = 0,
): OfflineRates {
  const w = Math.exp(-deltaSeconds / OFFLINE_RATE_WINDOW_SECONDS)
  return {
    seconds: r.seconds * w + deltaSeconds,
    gold: r.gold * w + gold,
    xp: r.xp * w + xp,
    kills: r.kills * w + kills,
    // Legacy saves have no `eliteKills`; `?? 0` keeps them decaying from zero rather
    // than turning the whole record into NaN on the first tick after a load.
    eliteKills: (r.eliteKills ?? 0) * w + eliteKills,
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
  /** The absence hit the content ceiling — the hero has out-levelled everything they have
   *  unlocked, and the surplus XP was dropped. The UI turns this into a nudge to go open
   *  the next region rather than leaving it as unexplained missing progress. */
  cappedByContent: boolean
  /** Level the ceiling sat at, for that message. */
  contentCeiling: number
  /** Banked watch this absence consumed, in seconds. 0 when the free cap covered it, which
   *  is the overwhelmingly common case and is meant to be. */
  watchSpent: number
  /** Banked watch still in hand afterwards. */
  watchRemaining: number
  /** What the hero dug up, if they were left working a node rather than fighting. */
  gathered: { materialId: string; name: string; qty: number } | null
}

export interface OfflineOutcome {
  patch: Partial<GameState>
  report: OfflineReport
}

const ALL_SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

/**
 * The highest level an ABSENCE may take a hero to.
 *
 * Offline had no ceiling at all: the loop below would grant up to 200 levels in one
 * projection. Zone unlocks are computed only in the live tick, so a long absence could
 * hand back a hero fifteen levels above a region whose successor is still locked — massively
 * over-levelled for the only content they can actually reach, every enemy in range grey
 * (see GREY_LEVEL_GAP, which then pays them nothing), and no way forward but to grind a
 * zone that has stopped teaching them anything. Unbounded offline levelling does not
 * accelerate the game; it walks the player off the end of it.
 *
 * So an absence may carry you to the top of the region you are in, and no further.
 * Unlocking the next region is something you come back and do.
 *
 * Deliberately generous rather than tight: it binds only on a hero who was already near the
 * ceiling of their unlocked world, which is exactly the hero for whom levelling further is
 * meaningless anyway.
 */
export function offlineLevelCeiling(state: GameState): number {
  // Tightened 2026-11-03 from "the top of every unlocked zone, plus GREY_LEVEL_GAP" to the
  // top of the zone the hero is IN. The old ceiling let one night away carry a hero ten
  // levels past their region's band, so the next session crushed its boss and the zone
  // after it in minutes and the following night filled the new ceiling again: about two
  // zones a session, most of the game inside three days (sim: L40 and 3 bosses after day
  // one). At the current zone's top, coming back to beat the boss is the step that opens
  // the next stretch of offline growth, which is what this rule always said it was for.
  const band = ZONES[state.currentZone]?.levelRange
  // No zone data (a corrupt or very old save) must not mean "no progress" — fall back to
  // letting the hero keep what they have rather than clamping them backwards.
  if (!band) return Number.MAX_SAFE_INTEGER
  return Math.max(band[1], state.level)
}

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
export function projectOfflineProgress(
  state: GameState,
  now: number,
  opts: {
    /** Permanent offline hours from a purchased entitlement. Passed IN rather than read
     *  here, because this module also runs in the headless economy sim, which has neither
     *  a DOM nor RevenueCat — and because an engine that reaches for a billing SDK is an
     *  engine you cannot test. */
    purchasedWatchHours?: number
  } = {},
): OfflineOutcome | null {
  const fx = compileUpgrades(state.upgradeRanks)
  // Meadowwarden extends the cap alongside the Long Watch upgrade — both are "the world
  // keeps paying while you are away", so they add rather than compete.
  const uniq = compileUniques(state.equipment)
  // Permanent capacity vs. the banked extension. The split matters because only the second
  // one gets spent: an absence draws on the free base and the permanent ranks first, and
  // dips into the bank only for the overflow.
  const permanentHours = fx.offlineHours + uniq.offlineHours + (opts.purchasedWatchHours ?? 0)
  const banked = Math.max(0, state.watchBonusSeconds ?? 0)
  const elapsed = calculateOfflineTime(state.lastTickTimestamp ?? now, permanentHours, banked)
  if (elapsed.secondsElapsed < OFFLINE_MIN_SECONDS) return null
  const permanentSeconds = (OFFLINE_CAP_HOURS + permanentHours) * 3600
  const bankSpent = Math.max(0, Math.min(banked, elapsed.secondsElapsed - permanentSeconds))

  // ── A hero left at a node was GATHERING, not fighting ─────────────────────
  //
  // This branch did not exist, and its absence made a liar of the gathering panel: that
  // panel prints an idle rate ("12/min at Coarse") drawn from `projectGathering`, and
  // `projectGathering` had exactly one caller — the panel itself. Nothing ever granted the
  // materials. Close the app at a vein and you came back to nothing at all, while the UI
  // had just told you what you would earn.
  //
  // Branching on the saved mode rather than paying both is the honest shape: you cannot
  // swing and dig at once. It is also the more accurate of the two, because the combat
  // projection replays a DECAYING measured rate — a hero who spent their last ten minutes
  // gathering has a combat rate near zero, so the old path would have paid them for
  // fighting they did not do, using numbers from before they walked to the node.
  //
  // Deliberately NOT gated on `OFFLINE_MIN_MEASURED_SECONDS`. That gate exists because a
  // combat rate needs a sample to extrapolate from; gathering has no rate to measure. The
  // cadence is fixed (`GATHER_SECONDS`), so a player who has never landed a blow still
  // earns the floor, which is the whole promise.
  if ((state.departedMode ?? state.gameMode) === 'gathering') {
    const matId = ZONE_MATERIALS[state.currentZone]?.[state.playerClass]
    const gathered = matId ? projectGathering(elapsed.secondsElapsed).units : 0
    if (!matId || gathered <= 0) return null
    return {
      patch: {
        // Purity is untouched: unattended work banks NONE, so the stock lands at Coarse —
        // the exact quality the game produced before the strike meter existed. Quality is
        // the reward for being present; quantity is the reward for the hero being out
        // there at all.
        materials: { ...state.materials, [matId]: (state.materials[matId] ?? 0) + gathered },
        watchBonusSeconds: banked - bankSpent,
        lastTickTimestamp: now,
      },
      report: {
        secondsElapsed: elapsed.secondsElapsed,
        cappedAtHours: elapsed.cappedAt === null ? null : OFFLINE_CAP_HOURS + permanentHours,
        kills: 0, gold: 0, xp: 0, levelsGained: 0,
        itemsEquipped: 0, itemsSold: 0, itemsBagged: 0, itemsSalvaged: 0,
        soldGold: 0, salvagedGold: 0,
        cappedByContent: false, contentCeiling: 0,
        watchSpent: bankSpent, watchRemaining: banked - bankSpent,
        gathered: { materialId: matId, name: MATERIALS[matId]?.name ?? matId, qty: gathered },
      },
    }
  }

  const rates = state.offlineRates
  if (!rates || rates.seconds < OFFLINE_MIN_MEASURED_SECONDS) return null

  // A thin sample is trusted but not extrapolated far — see OFFLINE_THIN_SAMPLE_SECONDS.
  // This is what lets a 45-second first session still pay for an overnight absence
  // instead of the old all-or-nothing gate paying it nothing at all.
  const thin = rates.seconds < OFFLINE_THIN_SAMPLE_SECONDS
  const secs = thin
    ? Math.min(elapsed.secondsElapsed, OFFLINE_THIN_SAMPLE_CAP_SECONDS)
    : elapsed.secondsElapsed
  // At OFFLINE_EFFICIENCY of the measured pace; everything below is derived from kills.
  const kills = Math.floor((rates.kills / rates.seconds) * secs * OFFLINE_EFFICIENCY)
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
  const ceiling = offlineLevelCeiling(state)
  // Bounded twice: by the content the hero has opened (see offlineLevelCeiling) and, as a
  // backstop against a pathological rate, by an absolute step count.
  while (xp >= xpForLevel(level) && level - startLevel < 200 && level < ceiling) {
    xp -= xpForLevel(level)
    level++
    talentPoints++
  }
  // At the ceiling the surplus is DROPPED, not banked. Banking it would hand the player
  // three instant level-ups the moment they reopened the app, which is the same runaway
  // one screen later — and it would mean the ceiling silently owed them something. The
  // report says so, so it reads as "your hero has learned all this region can teach"
  // rather than as XP quietly going missing.
  const cappedByContent = level >= ceiling && xp >= xpForLevel(level)
  if (cappedByContent) xp = xpForLevel(level) - 1

  // ── Drops, through the real ladder ────────────────────────────────────────
  const racialPassive = RACE_DEFINITIONS[state.playerRace]?.racialPassive ?? {}
  let equipment = { ...state.equipment }
  const inventory = [...state.inventory]
  let soldGold = 0
  let salvagedGold = 0
  let equipped = 0, sold = 0, bagged = 0, scrapped = 0

  // Split the hour by what was actually being killed. Elites drop twice as often and
  // roll at a rarity bias, so a flat `kills × ITEM_DROP_CHANCE` at bias 0 both
  // under-counts the drops and under-rolls every one of them.
  const eliteShare = rates.kills > 0 ? Math.min(1, (rates.eliteKills ?? 0) / rates.kills) : 0
  const eliteKills = Math.round(kills * eliteShare)
  const normalKills = kills - eliteKills
  const baseChance = ITEM_DROP_CHANCE + fx.dropChance
  const normalDrops = Math.round(normalKills * baseChance)
  // `loot.ts` gives an elite `baseChance * 2` and a rarity bias of 1.5. Mirrored here
  // rather than re-derived, because two descriptions of the same drop table is exactly
  // how online and offline drift apart.
  const eliteDrops = Math.round(eliteKills * baseChance * ELITE_DROP_CHANCE_MULT)
  const drops = normalDrops + eliteDrops
  for (let i = 0; i < drops; i++) {
    const slot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)]
    const item = generateItem(slot, level, i < eliteDrops ? ELITE_RARITY_BIAS : 0)
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
      watchBonusSeconds: banked - bankSpent,
      lastTickTimestamp: now,
    },
    report: {
      secondsElapsed: secs,
      cappedAtHours: elapsed.cappedAt === null ? null : OFFLINE_CAP_HOURS + fx.offlineHours + uniq.offlineHours,
      kills, gold: totalGold, xp: gainedXp,
      levelsGained: level - startLevel,
      itemsEquipped: equipped, itemsSold: sold, itemsBagged: bagged, itemsSalvaged: scrapped,
      soldGold, salvagedGold,
      cappedByContent, contentCeiling: ceiling,
      watchSpent: bankSpent, watchRemaining: banked - bankSpent,
      gathered: null,
    },
  }
}

/**
 * Price of the next watch extension, given what is already banked.
 *
 * The same geometric ladder the standing upgrades ride (`upgradeCost`), for the same
 * reason: gold income spans orders of magnitude between level 8 and level 200, so a fixed
 * price is free late and impossible early. Keyed on the BANK rather than on a rank count,
 * so it falls back as the bank drains — you are always paying for the next two hours, not
 * for the number of times you have ever bought them.
 */
export function watchExtendCost(bankedSeconds: number): number {
  const steps = Math.max(0, Math.floor(bankedSeconds / 3600 / WATCH_EXTEND_HOURS))
  return Math.round(WATCH_EXTEND_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, steps))
}

/** Total capacity of the watch right now, in seconds: free base + permanent + banked. */
export function watchCapacitySeconds(
  state: GameState, permanentHours: number,
): { base: number; banked: number; total: number } {
  const base = (OFFLINE_CAP_HOURS + permanentHours) * 3600
  const banked = Math.max(0, state.watchBonusSeconds ?? 0)
  return { base, banked, total: base + banked }
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
