// ── Timing ─────────────────────────────────────────────────────────────────
export const TICK_RATE_MS = 1000          // game loop interval
export const COMBAT_TICK_SECONDS = 2      // seconds per attack exchange
export const RESPAWN_TIMER_SECONDS = 3    // player death respawn delay
export const MOB_RESPAWN_SECONDS = 1.5    // mob respawn after kill
export const OFFLINE_CAP_HOURS = 8        // max offline progress

// Offline progress is projected from the hero's own measured combat rate — see
// engine/offline.ts. Parity is exactly 1.0: being away pays what being present paid.
/** Absences shorter than this are ignored, so a reload isn't a reward. */
export const OFFLINE_MIN_SECONDS = 60
/** Time constant τ of the decaying rate record. Short enough to track the hero the
 *  player actually left behind — a long τ keeps stale low-level play weighted in and
 *  systematically under-pays anyone mid-progression. */
export const OFFLINE_RATE_WINDOW_SECONDS = 600
/**
 * Below this much measured combat there is nothing honest to extrapolate from.
 *
 * Was 120s, and that number quietly cancelled the single most important moment in a new
 * player's life: play for ninety seconds, close the app, come back tomorrow to NOTHING. An
 * idle game gets one chance to prove it pays you while you are away, and the gate meant a
 * short first session forfeited it. (Flagged in the 2026-08-08 audit as nullifying the
 * first "come back richer" moment; this is that fix.)
 *
 * The gate itself is still right — a hero who has never swung cannot have a rate. It just
 * has to be a floor on "did anything happen", not a floor on "played long enough to
 * matter". Thin samples are handled by clamping the WINDOW instead; see below.
 */
export const OFFLINE_MIN_MEASURED_SECONDS = 30
/**
 * A rate measured over less than this is real but noisy — one lucky elite in a 40-second
 * sample projects into an absurd hour. So it is trusted, but not extrapolated far: the
 * projection window is clamped to `OFFLINE_THIN_SAMPLE_CAP_SECONDS` until the hero has
 * played enough for the average to mean something.
 *
 * This is the honest middle the old all-or-nothing gate had no room for. A first absence
 * now pays a real, bounded amount instead of zero.
 */
export const OFFLINE_THIN_SAMPLE_SECONDS = 120
/** How much absence a thin sample may be projected across. One hour: enough to feel like
 *  a reward, too little for a noisy rate to distort the economy. */
export const OFFLINE_THIN_SAMPLE_CAP_SECONDS = 3600

// ── The Watch ────────────────────────────────────────────────────────────────
// The offline budget, made into a thing the player can see and act on.
//
// It always existed — `OFFLINE_CAP_HOURS` — but invisibly: nothing in the UI said how long
// the hero would keep going, or that the last absence had run out hours before you came
// back. A resource nobody can see cannot motivate anything, which is why it never did.
//
// Three ways to have more of it, and they are deliberately different KINDS of thing:
//   • the free base, which is generous and binds on almost nobody;
//   • `long_watch`, a permanent upgrade bought with earned gold (data/upgrades.ts);
//   • a BANKED extension, bought per-trip with gold, consumed by the absence that uses it.
// The bank is the new one, and it is the sink for the specific moment the other two cannot
// serve: "I am going away for the weekend and I want the hero to still be there."
/** Ceiling on banked extension. Without one, gold late-game buys effectively infinite
 *  absence and the cap stops meaning anything at all. */
export const WATCH_BANK_CAP_HOURS = 24
/** How much one purchase adds. */
export const WATCH_EXTEND_HOURS = 2
/** Opening price of a 2-hour extension, and the same geometric ladder the standing
 *  upgrades use — so the tenth trip costs what the tenth rank of anything else costs, and
 *  banking to the ceiling is a real decision rather than a rounding error. Resets as the
 *  bank drains, because the price is a function of what is currently banked. */
export const WATCH_EXTEND_BASE_COST = 1500

// ── XP Curve ────────────────────────────────────────────────────────────────
// xpForLevel(n) = BASE * n^EXPONENT
export const XP_BASE = 75
export const XP_EXPONENT = 1.4

// ── Talents ──────────────────────────────────────────────────────────────────
/**
 * Total talent points a hero can ever earn: one per level, stopping at the level the
 * zone content itself stops at (`zones.ts` tops out at `levelRange: [95, 100]`).
 *
 * Before this existed, points accrued forever against a single ~48-rank tree, so every
 * level past the mid-forties handed the player a point with nowhere on earth to put it.
 * Three trees of ~60 ranks give 180 places to put 100 points, which is the ratio the
 * whole design rests on: a hero can max one tree and go two-thirds into a second, and
 * can never have all three. Raising this number is not a buff, it is a decision to make
 * specialisation mean less.
 *
 * Level itself stays uncapped — levelling past 100 keeps raising stats. It just stops
 * being the thing that pays for talents.
 */
export const TALENT_POINT_MAX = 100

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

// ── Unattended zone progression ───────────────────────────────────────────────
// An idle hero never changed zone, because `selectZone` is a click — so an untouched
// character farmed zone 1 forever. Auto-advance fixes that, and the retreat rule is what
// makes it safe: measured before it existed, a hero who moved into a zone they could not
// handle took ZERO kills in eleven simulated hours and never recovered.
/** Field time with no kill at all before the hero judges a zone beyond them and falls back. */
export const ZONE_STUCK_SECONDS = 300

// ── Zone unlock kill threshold ────────────────────────────────────────────────
export const ZONE_UNLOCK_KILLS = 50          // kills needed to unlock boss
export const BOSS_HP_MULTIPLIER = 10
export const BOSS_DAMAGE_MULTIPLIER = 2.5
export const ELITE_HP_MULTIPLIER = 3
export const ELITE_DAMAGE_MULTIPLIER = 1.8

/**
 * How far above a zone you can be and still earn XP there — the grey-mob rule.
 *
 * Nothing capped levelling before this, and zone progress is gated on a BOSS kill rather
 * than on level, so a player who stalls at a gate keeps farming trash and out-levels the
 * entire game without moving forward. Measured on a stuck save: level 1592 while still in
 * Ironcrag Badlands, a level 55–70 zone, on circuit 0 — every mob in the world dying
 * before it was on screen.
 *
 * Compared against the TOP of the zone's level band, so a zone pays out for its whole
 * range plus this much headroom and only then goes grey. Ironcrag (55–70) stops paying at
 * 81, Cinderfall (85–100) at 111.
 *
 * This is the pressure that sends a stalled player at the boss instead of at more trash.
 */
export const GREY_LEVEL_GAP = 10

// ── Party scaling ─────────────────────────────────────────────────────────────
// A party used to be free power: measured at three companions, gold +27.9% and deaths
// **-78.5%**. Survivability is a fine reason to bring friends; near-immunity is not, and
// it made every tier below a boss decorative for a partied hero.
//
// Mobs scale with the party, and rewards scale too — but on their OWN, much smaller
// number. All three were measured at three companions rather than reasoned about:
//
//   reward scale   gold delta   deaths delta   verdict
//   full (=HP)      +204.0%       -18.3%       trivialises the economy instead
//   none            +4.2%         -39.8%       a party is a pure safety net, no edge
//   0.07/ally       +20.8%        -40.9%       chosen
//
// Damage scales at less than half the rate of health on purpose. Health lengthens the
// fight, which is what restores tension; damage shortens the hero's life, and an idle
// game that kills unattended heroes is broken rather than difficult.
/** Extra mob health per companion. Rewards do NOT follow this — see below. */
export const PARTY_MOB_HP_SCALE = 0.35
/** Extra mob damage per companion. Deliberately smaller — see above. */
export const PARTY_MOB_DAMAGE_SCALE = 0.15
/**
 * Extra gold and XP per companion. Its OWN number, not the health scale, because
 * throughput here is spawn-limited rather than damage-limited: a solo hero already kills
 * faster than the field refills, so reward-per-kill multiplies income almost directly.
 * Paying the full health multiplier measured at gold +204% — a party that trivialises the
 * economy instead of the fights. Sized so companions are visibly worth forming without
 * being the best gold strategy in the game.
 */
export const PARTY_MOB_REWARD_SCALE = 0.07

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
