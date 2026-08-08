import type {
  MobInstance, Item, Slot, Rarity, ClassType, StatBonuses, MerchantContract,
} from '../data/types'
import { generateItem, itemPower } from '../data/items'
import {
  ITEM_DROP_CHANCE, GOLD_DROP_VARIANCE, SALVAGE_RATE, RARITY_ORDER,
} from '../data/constants'
import { isGearUpgrade } from './combat'
import { UNIQUE_BY_BOSS, type UniqueDef } from '../data/uniques'

export interface LootResult {
  gold: number
  item: Item | null
}

const ALL_SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

/**
 * What a tier is worth at the drop table. Exported because the OFFLINE projection has to
 * reproduce the same mix — it rolled every drop at bias 0 and a flat drop chance, which
 * made an idled hour return measurably poorer gear than a watched one. Two copies of
 * these numbers is precisely how the two paths drift.
 */
export const ELITE_RARITY_BIAS = 1.5
export const BOSS_RARITY_BIAS = 3
export const ELITE_DROP_CHANCE_MULT = 2

export function rollLoot(
  mob: MobInstance, level: number, goldFindBonus: number,
  /** Standing-upgrade bonuses. Defaulted so callers that predate them are unchanged. */
  fx: { goldFind?: number; dropChance?: number; eliteDropsAsBoss?: boolean } = {},
  /** Unique ids the hero already owns, so a boss never drops a second copy of its own.
   *  Defaulted, so every caller that predates uniques keeps its behaviour. */
  ownedUniques: ReadonlySet<string> = new Set(),
): LootResult {
  // Gold
  const base = mob.goldMin + Math.random() * (mob.goldMax - mob.goldMin)
  const variance = 1 + (Math.random() * 2 - 1) * GOLD_DROP_VARIANCE
  const gold = Math.max(1, Math.round(base * variance * goldFindBonus * (fx.goldFind ?? 1)))

  // ── The boss's own unique ─────────────────────────────────────────────────
  // Authored, guaranteed, and only once. A named item from a named encounter is the
  // whole shape being emulated here, and a boss that drops its signature piece on every
  // kill would turn it into currency instead of a trophy.
  const uniqueDef = mob.isBoss ? UNIQUE_BY_BOSS[mob.templateId] : undefined
  if (uniqueDef && !ownedUniques.has(uniqueDef.id)) {
    return { gold, item: makeUniqueItem(uniqueDef, level) }
  }

  // Item
  let item: Item | null = null
  const baseChance = ITEM_DROP_CHANCE + (fx.dropChance ?? 0)
  const dropChance = mob.isElite ? baseChance * ELITE_DROP_CHANCE_MULT : mob.isBoss ? 1.0 : baseChance
  if (Math.random() < dropChance) {
    // Ironcrag Signet: elites roll on the BOSS table. The one unique that changes what
    // the rest of the game drops rather than what the hero does.
    const eliteBias = fx.eliteDropsAsBoss ? BOSS_RARITY_BIAS : ELITE_RARITY_BIAS
    const rarityBias = mob.isBoss ? BOSS_RARITY_BIAS : mob.isElite ? eliteBias : 0
    const slot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)]
    item = generateItem(slot, level, rarityBias)
  }

  return { gold, item }
}

/**
 * Mint an authored unique at the level it dropped.
 *
 * Stats come from the normal legendary generator so the piece is genuinely competitive —
 * `isGearUpgrade` prefers a unique outright, but an item that were also weak would make
 * that preference feel like a punishment rather than a prize. Name, effect and protection
 * are then stamped over the generated shell.
 */
export function makeUniqueItem(def: UniqueDef, level: number): Item {
  const base = generateItem(def.slot, level, 0, 'legendary', def.name)
  return { ...base, uniqueId: def.id, protected: true }
}

// ── The drop ladder ───────────────────────────────────────────────────────────
// WEAR it → SELL it → BAG it → SALVAGE it. One implementation, used by the live tick and
// by the offline projection, because two implementations of "what happens to a drop"
// would drift and the whole point of offline progress is that it matches being online.

export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r as typeof RARITY_ORDER[number])
}

/** Value recovered when a drop cannot be carried. Never zero, never full price.
 *  `bonus` is Scrapper's Lot; capped below 1 so scrapping can never beat selling. */
export function salvageValue(item: Item, bonus = 0): number {
  const rate = Math.min(0.9, SALVAGE_RATE + bonus)
  return Math.max(1, Math.round(item.vendorValue * rate))
}

/**
 * Is this rarity inside the factor's remit? Strictly-below, so the threshold names the
 * cheapest thing you want to KEEP, and `common` therefore sells nothing — an off switch
 * that does not require cancelling. A lapsed contract always answers no, which is what
 * makes "lapsed" mean "as if you never bought it".
 */
export function contractSells(c: MerchantContract | null, rarity: Rarity): boolean {
  if (!c || c.lapsed) return false
  return rarityRank(rarity) < rarityRank(c.threshold)
}

/**
 * Would the factor sell THIS drop, given everything the hero already owns for its slot?
 *
 * Sell only what is no better than something already worn or carried, so the arrangement
 * can never dispose of an upgrade whatever its rarity. Checking the BAG as well as the
 * worn piece matters: an earlier version looked only at the equipped slot, and a hero
 * with empty slots sold nothing at all while still paying the retainer.
 */
export function contractWouldSell(
  contract: MerchantContract | null,
  equipment: Record<Slot, Item | null>,
  inventory: (Item | null)[],
  item: Item,
): boolean {
  // A protected item is outside the arrangement entirely — the factor deals in surplus,
  // and a unique is not surplus however modest its stat line.
  if (item.protected) return false
  if (!contractSells(contract, item.rarity)) return false
  const power = itemPower(item)
  const equipped = equipment[item.slot]
  if (equipped && itemPower(equipped) >= power) return true
  for (const held of inventory) {
    if (held && held.slot === item.slot && itemPower(held) >= power) return true
  }
  return false
}

export interface DropContext {
  playerClass: ClassType
  level: number
  talentAllocs: Record<string, number>
  racialPassive: StatBonuses
  autoEquip: boolean
  contract: MerchantContract | null
  /** Scrapper's Lot bonus, added to SALVAGE_RATE. */
  salvageBonus?: number
}

export type DropOutcome = 'equipped' | 'sold' | 'bagged' | 'salvaged'

export interface DropPlacement {
  /** Mutated copies — callers replace their own references with these. */
  equipment: Record<Slot, Item | null>
  inventory: (Item | null)[]
  /** Gold gained, split by reason so each can be audited separately. */
  sold: number
  salvaged: number
  /** What happened to the DROP (not to the piece it may have displaced). */
  outcome: DropOutcome
  /** The item that ended up disposed of — the drop, or the piece it replaced. */
  disposed: Item | null
}

/**
 * Decide where one drop goes, and return the resulting equipment/inventory.
 *
 * Order is the safety property, not a preference. Equipping happens FIRST, so an upgrade
 * can never be sold or scrapped however the merchant threshold is set: by the time
 * anything else looks at the drop it is already on the hero, and what is being disposed of
 * is the old piece. The displaced item takes the bag pressure instead of the good one.
 */
export function placeDrop(
  drop: Item,
  equipment: Record<Slot, Item | null>,
  inventory: (Item | null)[],
  ctx: DropContext,
): DropPlacement {
  let eq = equipment
  const inv = inventory
  let pending: Item | null = drop
  let outcome: DropOutcome = 'bagged'

  if (ctx.autoEquip &&
      isGearUpgrade(drop, ctx.playerClass, ctx.level, eq, ctx.talentAllocs, ctx.racialPassive)) {
    eq = { ...eq, [drop.slot]: drop }
    pending = equipment[drop.slot]
    outcome = 'equipped'
  }

  if (!pending) return { equipment: eq, inventory: inv, sold: 0, salvaged: 0, outcome, disposed: null }

  if (contractWouldSell(ctx.contract, eq, inv, pending)) {
    return {
      equipment: eq, inventory: inv,
      sold: pending.vendorValue, salvaged: 0,
      outcome: outcome === 'equipped' ? outcome : 'sold',
      disposed: pending,
    }
  }

  const empty = inv.findIndex(s => s === null)
  if (empty >= 0) {
    inv[empty] = pending
    return { equipment: eq, inventory: inv, sold: 0, salvaged: 0, outcome, disposed: null }
  }

  // ── The bag is full ───────────────────────────────────────────────────────
  // Normally the incoming drop is what gets scrapped. A protected one instead evicts the
  // least valuable thing that ISN'T protected and takes its slot — otherwise the ladder
  // would destroy a unique for the crime of arriving late, which is the one outcome the
  // flag exists to prevent.
  if (pending.protected) {
    let worstIdx = -1
    let worstPower = Infinity
    for (let i = 0; i < inv.length; i++) {
      const held = inv[i]
      if (!held || held.protected) continue
      const p = itemPower(held)
      if (p < worstPower) { worstPower = p; worstIdx = i }
    }
    if (worstIdx >= 0) {
      const evicted = inv[worstIdx]!
      inv[worstIdx] = pending
      return {
        equipment: eq, inventory: inv,
        sold: 0, salvaged: salvageValue(evicted, ctx.salvageBonus ?? 0),
        outcome, disposed: evicted,
      }
    }
    // Every slot already holds something protected. Nothing can be evicted without
    // destroying another unique, so the incoming one falls through and IS scrapped —
    // the single case where protection cannot be honoured, and it takes a bag with no
    // ordinary item left in it to reach.
  }

  return {
    equipment: eq, inventory: inv,
    sold: 0, salvaged: salvageValue(pending, ctx.salvageBonus ?? 0),
    outcome: outcome === 'equipped' ? outcome : 'salvaged',
    disposed: pending,
  }
}
