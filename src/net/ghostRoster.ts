// ── Fetching the ghost roster ─────────────────────────────────────────────────
//
// The network half of `engine/ghosts` — read the opposing faction's published characters
// and hand them to the registry the renderer reads. See that module for what a ghost is
// and why nothing is ever written back to its owner.
//
// Every failure mode here is ordinary and silent: cloud switched off in a dev clone,
// offline on a train, an empty board on launch day. Any of them simply means the zone is
// populated entirely by ambient heroes, which is exactly what shipped before ghosts
// existed. This must never be able to break the world — an idle RPG whose save layer is
// local cannot acquire a hard dependency on a network service.

import type { ClassType, FactionType, Item, RaceType, Slot } from '../data/types'
import { selectRows } from './cloudClient'
import { cloudEnabled } from './cloudConfig'
import { currentSession, ensureSession } from './session'
import { sanityCheck } from './snapshot'
import { setGhosts, type Ghost } from '../engine/ghosts'
import type { RosterRow } from './leaderboard'
import { TABLE } from './leaderboard'
import { resolveFaction } from '../data/factions'
import { CLASS_DEFINITIONS } from '../data/classes'
import { RACE_DEFINITIONS } from '../data/races'
import { deepestSpec } from '../data/specs'

/**
 * How many enemy characters to pull.
 *
 * Bounded well below the ambient hero budget (8 per zone) on purpose: a zone made entirely
 * of ghosts would be a lobby, not a world, and the generated crowd is what makes it feel
 * inhabited between the handful of real people. A few real enemies among the crowd is the
 * mix that makes the honor ladder honest without emptying the ambience out.
 */
export const GHOST_ROSTER_SIZE = 4

/** Pull window before we sort by power proximity. Wider than the roster so a sparse board
 *  still returns somebody, and so the nearest-peer sort has something to choose between. */
const FETCH_WINDOW = 40

const SLOTS: Slot[] = ['weapon', 'helm', 'chest', 'legs', 'boots', 'trinket']

/** Coerce a stored row into a `Ghost`, or null when it is not usable.
 *
 *  Defensive in the same spirit as `sanityCheck`: these rows were uploaded by other
 *  clients, possibly running an older build, and a bad class id would reach `compileStats`
 *  and produce a body with NaN health. Anything we cannot read is skipped rather than
 *  patched — the cost is one fewer ghost, which is invisible. */
function toGhost(row: RosterRow): Ghost | null {
  const snap = row.snapshot
  if (!snap || !sanityCheck(snap)) return null
  const faction = resolveFaction(row.faction || snap.playerFaction)
  if (faction === 'neutral') return null
  const playerClass = snap.combatant?.playerClass
  if (!playerClass || !(playerClass in CLASS_DEFINITIONS)) return null
  const race = snap.playerRace
  if (!race || !(race in RACE_DEFINITIONS)) return null

  const equipment = {} as Record<Slot, Item | null>
  for (const slot of SLOTS) equipment[slot] = snap.combatant.equipment?.[slot] ?? null

  const talentAllocs = snap.combatant.talentAllocs ?? {}
  return {
    userId: row.user_id,
    name: snap.combatant.name || row.hero_name || 'Someone',
    playerClass: playerClass as ClassType,
    race: race as RaceType,
    faction,
    level: Math.max(1, Math.round(snap.combatant.level || row.level || 1)),
    equipment,
    talentAllocs,
    specTitle: deepestSpec(playerClass as ClassType, talentAllocs)?.name ?? null,
    power: row.power ?? snap.power ?? 0,
  }
}

/**
 * Fetch enemy-faction characters near the player's own power and publish them.
 *
 * Near-peers rather than the top of the board, for the reason `fetchDuelCandidates` already
 * gives: the strongest character on the server is a guaranteed loss that teaches nothing.
 * Here it is worse than uninstructive — an unkillable enemy standing in your zone that can
 * also open on you unprovoked is a wall, not an encounter.
 *
 * Returns how many ghosts were published. Zero is an ordinary outcome, not an error.
 */
export async function refreshGhostRoster(
  playerFaction: FactionType,
  power: number,
  limit = GHOST_ROSTER_SIZE,
): Promise<number> {
  if (!cloudEnabled()) return 0
  const enemy: FactionType | null =
    playerFaction === 'alliance' ? 'horde' : playerFaction === 'horde' ? 'alliance' : null
  // A neutral hero is at war with nobody (see `isHostile`), so there is no enemy roster to
  // fetch and no ghosts to place.
  if (!enemy) { setGhosts([]); return 0 }
  if (!(await ensureSession())) return 0

  const me = currentSession()?.userId ?? null
  const query = [
    'select=user_id,hero_name,player_class,level,power,faction,faction_name,zone_circuit,bosses_defeated,honor_kills,snapshot',
    `faction=eq.${enemy}`,
    'order=power.desc',
    `limit=${FETCH_WINDOW}`,
  ].join('&')

  const res = await selectRows<RosterRow>(TABLE, query)
  if (!res.ok) return 0

  const usable = res.data
    .filter(r => r.user_id !== me)
    .map(toGhost)
    .filter((g): g is Ghost => g !== null)
    // Nearest in power, then take the roster. Same selection rule as the duel candidates,
    // which is the closest thing the game already has to matchmaking.
    .sort((a, b) => Math.abs(a.power - power) - Math.abs(b.power - power))
    .slice(0, Math.max(0, limit))

  setGhosts(usable)
  return usable.length
}
