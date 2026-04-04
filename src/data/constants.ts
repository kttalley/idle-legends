// ── Timing ─────────────────────────────────────────────────────────────────
export const TICK_RATE_MS = 1000          // game loop interval
export const COMBAT_TICK_SECONDS = 2      // seconds per attack exchange
export const RESPAWN_TIMER_SECONDS = 5    // player death respawn delay
export const MOB_RESPAWN_SECONDS = 3      // mob respawn after kill
export const OFFLINE_CAP_HOURS = 8        // max offline progress

// ── XP Curve ────────────────────────────────────────────────────────────────
// xpForLevel(n) = BASE * n^EXPONENT
export const XP_BASE = 100
export const XP_EXPONENT = 1.5

// ── Stats ────────────────────────────────────────────────────────────────────
export const HP_PER_STAMINA = 10
export const CRIT_MULTIPLIER = 2.0
export const AGILITY_CRIT_DIVISOR = 200   // 200 agi = 1% crit

// ── Inventory ────────────────────────────────────────────────────────────────
export const INVENTORY_SLOTS = 20
export const GOLD_DEATH_PENALTY_PCT = 0.0 // 0 = no penalty (can tune later)

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
