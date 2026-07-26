import type {
  MobInstance, Item, Slot, Rarity, ClassType, StatBonuses, MerchantContract,
} from '../data/types'
import { generateItem, itemPower } from '../data/items'
import {
  ITEM_DROP_CHANCE, GOLD_DROP_VARIANCE, SALVAGE_RATE, RARITY_ORDER,
} from '../data/constants'
import { isGearUpgrade } from './combat'

export interface LootResult {
  gold: number
  item: Item | null
}

const ALL_SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

export function rollLoot(
  mob: MobInstance, level: number, goldFindBonus: number,
  /** Standing-upgrade bonuses. Defaulted so callers that predate them are unchanged. */
  fx: { goldFind?: number; dropChance?: number } = {},
): LootResult {
  // Gold
  const base = mob.goldMin + Math.random() * (mob.goldMax - mob.goldMin)
  const variance = 1 + (Math.random() * 2 - 1) * GOLD_DROP_VARIANCE
  const gold = Math.max(1, Math.round(base * variance * goldFindBonus * (fx.goldFind ?? 1)))

  // Item
  let item: Item | null = null
  const baseChance = ITEM_DROP_CHANCE + (fx.dropChance ?? 0)
  const dropChance = mob.isElite ? baseChance * 2 : mob.isBoss ? 1.0 : baseChance
  if (Math.random() < dropChance) {
    const rarityBias = mob.isBoss ? 3 : mob.isElite ? 1.5 : 0
    const slot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)]
    item = generateItem(slot, level, rarityBias)
  }

  return { gold, item }
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

  return {
    equipment: eq, inventory: inv,
    sold: 0, salvaged: salvageValue(pending, ctx.salvageBonus ?? 0),
    outcome: outcome === 'equipped' ? outcome : 'salvaged',
    disposed: pending,
  }
}
