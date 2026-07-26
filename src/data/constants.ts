// ── Timing ─────────────────────────────────────────────────────────────────
export const TICK_RATE_MS = 1000          // game loop interval
export const COMBAT_TICK_SECONDS = 2      // seconds per attack exchange
export const RESPAWN_TIMER_SECONDS = 3    // player death respawn delay
export const MOB_RESPAWN_SECONDS = 1.5    // mob respawn after kill
export const OFFLINE_CAP_HOURS = 8        // max offline progress

// ── XP Curve ────────────────────────────────────────────────────────────────
// xpForLevel(n) = BASE * n^EXPONENT
export const XP_BASE = 75
export const XP_EXPONENT = 1.4

// ── Stats ────────────────────────────────────────────────────────────────────
export const HP_PER_STAMINA = 10
export const CRIT_MULTIPLIER = 2.0
export const AGILITY_CRIT_DIVISOR = 200   // 200 agi = 1% crit

// ── Inventory ────────────────────────────────────────────────────────────────
export const INVENTORY_SLOTS = 20         // slots every hero starts with
export const GOLD_DEATH_PENALTY_PCT = 0.0 // 0 = no penalty (can tune later)

// Purchasable bag slots — gold's first real job. More slots is literally more
// unattended runtime before overflow starts, which is the shape of sink this game
// wants: one that improves idling rather than demanding attention.
export const BAG_SLOTS_MAX_PURCHASED = 20   // ceiling; 20 base + 20 bought = 40
export const BAG_SLOT_BASE_COST = 200
export const BAG_SLOT_COST_GROWTH = 1.25    // geometric, so late slots stay meaningful

/**
 * Share of an item's vendor value recovered when there is nowhere to put it.
 *
 * Deliberately poor. Overflow must never DESTROY a drop (it used to, silently), but it
 * must not be as good as having space either — otherwise a full bag is free money and
 * bag slots are worth nothing. The gap between this and full price is what capacity is
 * actually buying, and it is the same gap the merchant contract will sell later.
 *
 * Measured at 0.35 this was too generous: the harness showed 8-hour idle income going
 * from ~6,400g to ~18,200g, i.e. a full bag out-earning the entire rest of the game and
 * making capacity pointless to buy. At 0.20 the leak is still worth plugging — which is
 * the behaviour this number exists to produce.
 */
export const SALVAGE_RATE = 0.20

/** Hostile towns trade at a markup rather than refusing — smugglers beat closed doors. */
export const HOSTILE_TOWN_MARKUP = 1.5

// ── The merchant contract ─────────────────────────────────────────────────────
// A standing arrangement, not an item: a factor who takes junk drops off your hands at
// FULL vendor price the moment they land, so they never reach the bag and never fall to
// salvage. The keystone sink — see .planning/economy-and-towns-plan.md §T2. It is worth
// buying for every play style precisely because it works hardest when nobody is watching.
export const MERCHANT_CONTRACT_COST = 1500

/**
 * Upkeep, billed every MERCHANT_UPKEEP_SECONDS of field time (never while parked in town).
 *
 * The bill is the factor's CUT of what they moved for you since the last one, with a
 * token floor so it is never literally free. It started as a flat 5g/min and the harness
 * showed that was wrong at both ends: net-negative for the first ~3 hours after a player
 * could afford the contract (the factor moves ~3.5 g/min at the level where 1,500g is
 * reachable), and then 2% of income by hour 20, where gold runs at ~450/min. A flat fee
 * cannot be right at both ends of a curve that spans 500×.
 *
 * A cut is right at every point on that curve by construction, and it can never make the
 * arrangement a losing deal — you always keep (1 - rate) of what it earns you.
 */
export const MERCHANT_UPKEEP_RATE = 0.25
export const MERCHANT_UPKEEP_MIN = 1
export const MERCHANT_UPKEEP_SECONDS = 60

/** Rarity ordering, low to high. The single source of truth for "is X rarer than Y". */
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const

// ── Loot ─────────────────────────────────────────────────────────────────────
export const ITEM_DROP_CHANCE = 0.25         // 25% chance per kill
export const ELITE_SPAWN_CHANCE = 0.05       // 5% chance mob is elite
export const GOLD_DROP_VARIANCE = 0.4        // ±40% on gold drops

// ── Zone unlock kill threshold ────────────────────────────────────────────────
export const ZONE_UNLOCK_KILLS = 50          // kills needed to unlock boss
export const BOSS_HP_MULTIPLIER = 10
export const BOSS_DAMAGE_MULTIPLIER = 2.5
export const ELITE_HP_MULTIPLIER = 3
export const ELITE_DAMAGE_MULTIPLIER = 1.8

// ── Autosave ──────────────────────────────────────────────────────────────────
export const AUTOSAVE_INTERVAL_MS = 10_000

// ── Rarity weights (out of 1000) ──────────────────────────────────────────────
export const RARITY_WEIGHTS = {
  common:    600,
  uncommon:  250,
  rare:      100,
  epic:       40,
  legendary:  10,
} as const
