// ── Standing upgrades — the endless sink ──────────────────────────────────────
//
// The economy's late game had nothing to buy. Measured: an idle hero now finishes eight
// hours with ~515,000 gold, every bag slot bought inside the first hour, and the merchant
// contract's cut too small to matter at that scale. Gold went back to being a number that
// only goes up.
//
// The answer is deliberately NOT a shop full of items. Per the governing principle of
// .planning/economy-and-towns-plan.md — *gold should buy better idling* — every upgrade
// here improves the unattended loop, so it is worth the same to a player who never opens
// a menu again as to one who reads every tooltip.
//
// Costs are geometric with a linear benefit, and that combination is the whole design:
//
//   • It absorbs ANY income curve without re-pricing. The gold curve spans ~500× between
//     level 8 and level 200, and no fixed price list survives that. A geometric ladder
//     just moves further up itself.
//   • It cannot run away. Each rank costs more and gives the same, so the return per gold
//     decays geometrically — even Deep Pockets, which buys more gold, converges: doubling
//     income takes 20 ranks and 1.6^20 ≈ 12,000× the opening price.
//   • There is no cap to reach and then be finished with, which is what "endless" means
//     for an idle game.

import type { Rarity } from './types'

export type UpgradeId = 'deep_pockets' | 'keen_eye' | 'scrappers_lot' | 'long_watch'

export interface UpgradeDef {
  id: UpgradeId
  name: string
  /** What one more rank does, in the player's terms. */
  description: string
  /** Value added per rank, in the unit `compileUpgrades` folds it into. */
  perRank: number
  /** Shown as the flavour line — why an idler wants it. */
  flavour: string
  /** Tint, reusing the rarity ramp so the ladder reads as gear-adjacent. */
  tint: Rarity
}

export const UPGRADE_BASE_COST = 2500
export const UPGRADE_COST_GROWTH = 1.6

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'deep_pockets',
    name: 'Deep Pockets',
    description: '+5% gold from every kill',
    perRank: 0.05,
    flavour: 'You have learned where the coin hides.',
    tint: 'uncommon',
  },
  {
    id: 'keen_eye',
    name: 'Keen Eye',
    description: '+2% chance any kill drops something',
    perRank: 0.02,
    flavour: 'Fewer bodies left unsearched.',
    tint: 'rare',
  },
  {
    id: 'scrappers_lot',
    name: "Scrapper's Lot",
    description: '+3% recovered when a drop will not fit',
    perRank: 0.03,
    flavour: 'A full bag stings less when you know a buyer.',
    tint: 'epic',
  },
  {
    id: 'long_watch',
    name: 'Long Watch',
    description: '+30 minutes your hero will range unsupervised',
    perRank: 0.5,
    flavour: 'They no longer expect you back by dark.',
    tint: 'legendary',
  },
]

export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDef> =
  Object.fromEntries(UPGRADES.map(u => [u.id, u])) as Record<UpgradeId, UpgradeDef>

/** Price of the NEXT rank, given how many are already owned. */
export function upgradeCost(rank: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, rank))
}

/**
 * Everything the standing upgrades add up to. Compiled once per use rather than stored,
 * the same shape as `compileTalentEffects`, so ranks are the only persisted truth.
 */
export interface UpgradeEffects {
  /** Multiplier on kill gold. 1.0 with no ranks. */
  goldFind: number
  /** Added to ITEM_DROP_CHANCE. */
  dropChance: number
  /** Added to SALVAGE_RATE. */
  salvageRate: number
  /** Added to OFFLINE_CAP_HOURS. */
  offlineHours: number
}

export function compileUpgrades(ranks: Partial<Record<UpgradeId, number>> = {}): UpgradeEffects {
  return {
    goldFind:     1 + (ranks.deep_pockets  ?? 0) * UPGRADE_BY_ID.deep_pockets.perRank,
    dropChance:       (ranks.keen_eye      ?? 0) * UPGRADE_BY_ID.keen_eye.perRank,
    salvageRate:      (ranks.scrappers_lot ?? 0) * UPGRADE_BY_ID.scrappers_lot.perRank,
    offlineHours:     (ranks.long_watch    ?? 0) * UPGRADE_BY_ID.long_watch.perRank,
  }
}
