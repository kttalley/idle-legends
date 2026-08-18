// ── Roster snapshots: the unit of exchange for leaderboard and duels ───────────
//
// A snapshot is everything another player's client needs to fight your character, and
// nothing else. It is deliberately NOT the save file:
//
//   - A `GameState` is large (the save blob was 2.63 MB before map data was made
//     regenerable) and full of things no opponent should see or needs — inventory, gold,
//     quest progress, map exploration.
//   - A `HeroCombatant` is six fields and a couple of KB. It is exactly the input
//     `runFight` takes, which is what makes this cheap: no translation layer, no second
//     definition of "a character" that can drift from the one combat actually uses.
//
// **The snapshot is built from live local state and written by the owner only.** Row-level
// security enforces that (`supabase/schema.sql`): a client may upsert only the row whose
// `user_id` equals its own JWT subject. It cannot write anyone else's.
//
// That still leaves the obvious cheat — a modified client uploading an inflated snapshot.
// Two things bound it, and it is worth being honest that neither makes this tamper-proof:
//
//   1. Duels are resolved **server-side** in an Edge Function (`supabase/functions/duel`)
//      reading snapshots from the table, so a client cannot fabricate a *result*. It could
//      still fabricate the *character* it uploaded.
//   2. `sanityCheck` rejects snapshots that are impossible rather than merely strong.
//
// Fully authoritative stats would mean the server simulating progression, which is a
// different and much larger game. For a friendly leaderboard and friendly duels, "you
// cannot lie about the outcome, and blatant stat injection is rejected" is the right
// amount of rigour.

import type { GameState, Item, Slot } from '../data/types'
import type { HeroCombatant } from '../engine/fight'
import { playerCombatant } from '../engine/duel'

/** Ceilings used only to reject impossible snapshots. Generous on purpose — this is a
 *  garbage filter, not a balance rule, and a false positive silently benches a real
 *  player. Raise these when the game's own caps move. */
const MAX_LEVEL = 200
const MAX_TALENT_RANK = 10
const MAX_TALENT_NODES = 200
const MAX_ITEM_LEVEL = 300

const SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

export interface RosterSnapshot {
  /** The combatant, verbatim in the shape `runFight` consumes. */
  combatant: HeroCombatant
  /** Display-only, mirrors `SlotSummary` so a listing needs no second fetch. */
  playerRace: string
  playerFaction: string
  factionName: string
  currentZone: string
  zoneCircuit: number
  bossesDefeated: number
  /** Derived rank metric — see `powerScore`. */
  power: number
  /**
   * Enemy-faction players killed, all time. Optional at the type level, unlike the fields
   * above it, because rows published before PvP shipped have no such number and must keep
   * passing `sanityCheck` — a schema addition is not grounds for emptying the board.
   * Readers treat `undefined` as 0.
   */
  honorKills?: number
  /** Deaths to enemy players, shown beside kills on the honor board. */
  honorDeaths?: number
}

/**
 * A single comparable number for ordering a leaderboard.
 *
 * Built from progression the game already tracks and a player already understands, in
 * descending order of how much work each represents: a prestige circuit is a full clear, a
 * boss is a zone milestone, a level is a session. Gear is deliberately excluded — it is
 * the noisiest signal and the easiest to forge.
 *
 * Weights are spaced so a lower tier can never overtake a higher one within realistic
 * ranges, which keeps the ordering readable ("circuit 2 always outranks circuit 1")
 * instead of producing a blended score nobody can explain.
 */
export function powerScore(level: number, zoneCircuit: number, bossesDefeated: number): number {
  return zoneCircuit * 1_000_000 + bossesDefeated * 1_000 + level
}

/** Build a snapshot from live state. Read-only, like `playerCombatant`. */
export function buildSnapshot(s: GameState): RosterSnapshot {
  const bosses = Array.isArray(s.bossesDefeated) ? s.bossesDefeated.length : 0
  const circuit = s.zoneCircuit ?? 0
  return {
    combatant: playerCombatant(s),
    playerRace: s.playerRace,
    playerFaction: s.playerFaction,
    factionName: s.factionNames?.[s.playerFaction] ?? '',
    currentZone: s.currentZone,
    zoneCircuit: circuit,
    bossesDefeated: bosses,
    power: powerScore(s.level, circuit, bosses),
    honorKills: s.pvpRecord?.kills ?? 0,
    honorDeaths: s.pvpRecord?.deaths ?? 0,
  }
}

function itemPlausible(it: Item | null): boolean {
  if (it === null) return true
  if (typeof it.level !== 'number' || it.level < 0 || it.level > MAX_ITEM_LEVEL) return false
  if (typeof it.slot !== 'string' || !SLOTS.includes(it.slot)) return false
  const b = it.statBonuses
  if (b && typeof b === 'object') {
    for (const v of Object.values(b)) {
      // Reject NaN/Infinity explicitly: they survive JSON round-trips as `null` in some
      // encoders but arrive as numbers here, and either one poisons the whole fight sim.
      if (typeof v === 'number' && !Number.isFinite(v)) return false
    }
  }
  return true
}

/**
 * Reject snapshots that could not have come from a real save.
 *
 * Applied on **read**, not only on write — the whole point is that we do not trust what
 * another client uploaded, and a row could predate a tightening of these rules. A rejected
 * snapshot is skipped, never surfaced as an error: one bad row must not empty a
 * leaderboard.
 */
export function sanityCheck(snap: RosterSnapshot | null | undefined): boolean {
  if (!snap || typeof snap !== 'object') return false
  const c = snap.combatant
  if (!c || typeof c !== 'object') return false
  if (typeof c.name !== 'string' || c.name.length === 0 || c.name.length > 64) return false
  if (typeof c.playerClass !== 'string') return false
  if (typeof c.level !== 'number' || !Number.isInteger(c.level) || c.level < 1 || c.level > MAX_LEVEL) return false

  if (!c.equipment || typeof c.equipment !== 'object') return false
  for (const slot of SLOTS) {
    if (!itemPlausible(c.equipment[slot] ?? null)) return false
  }

  const allocs = c.talentAllocs
  if (!allocs || typeof allocs !== 'object') return false
  const entries = Object.entries(allocs)
  if (entries.length > MAX_TALENT_NODES) return false
  for (const [, rank] of entries) {
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 0 || rank > MAX_TALENT_RANK) return false
  }
  return true
}
