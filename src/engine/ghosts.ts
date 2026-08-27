// ── Ghost roster: real players standing in your world ─────────────────────────
//
// PvP shipped fighting AMBIENT heroes — generated from the zone seed, given a class, a
// spec and a name, and entirely local. That is good world texture and a bad honor ladder:
// `net/leaderboard` opens with a hard rule that every row on the board is a real player's
// character, and honor earned exclusively against generated NPCs sits awkwardly across
// that line.
//
// A ghost is the fix, and it needs no new storage at all. Every client with cloud enabled
// already publishes a `RosterSnapshot` — name, class, level, race, all six equipment slots
// and the full talent allocation, because the cloud duel needs exactly that to resolve a
// fight. So the characters are already there; what was missing was putting them in the
// world. A ghost is one of those rows, wearing its owner's real gear, walking the zone as
// part of the crowd, killable for honor.
//
// ── Why "ghost" and not "player" ──────────────────────────────────────────────
// The owner is not online and is not consulted. You are fighting a SNAPSHOT of their
// character, the same way the cloud duel does — asynchronous PvP, which is the only kind
// an idle game can honestly offer. Nothing that happens to a ghost is written back to its
// owner: they do not lose HP, they do not take a death, and they are not told. Their
// honor record is theirs to earn. This is stated here because it is the property that
// makes the feature safe to ship without consent flows or grief reports.
//
// ── Why this module holds no network code ─────────────────────────────────────
// The registry is pure state so the RENDERER may read it — the crowd is spawned in
// `combatAdapter`, which must never import the net layer (or the store). `net/ghostRoster`
// does the fetching and pushes results in here. Same shape as the faction-name registry in
// `data/factions`, and for the same reason.

import type { ClassType, FactionType, Item, RaceType, Slot } from '../data/types'

/** One real character, reduced to what the world needs to stand them up and fight them. */
export interface Ghost {
  /** Supabase `user_id` of the owner. The identity key — names are not unique. */
  userId: string
  name: string
  playerClass: ClassType
  race: RaceType
  faction: FactionType
  level: number
  /** Their REAL gear. This is the whole difference between a ghost and an ambient hero:
   *  an ambient hero fights unequipped because generating loadouts would mean generating
   *  items, and items are the player's economy. A ghost's items already exist. */
  equipment: Record<Slot, Item | null>
  talentAllocs: Record<string, number>
  specTitle: string | null
  /** Their `powerScore`, used to pick near-peers rather than the top of the board. */
  power: number
}

let ghosts: Ghost[] = []
/** Bumped whenever the roster is replaced, so the renderer can notice a late arrival and
 *  fold it into a crowd it has already spawned rather than waiting for the next zone. */
let version = 0
/** Ghosts already standing in the world, by userId — one body each, however many times
 *  the crowd is rebuilt. */
const placed = new Set<string>()

export function setGhosts(list: Ghost[]): void {
  ghosts = list
  placed.clear()
  version++
}

export function ghostVersion(): number {
  return version
}

export function ghostCount(): number {
  return ghosts.length
}

/**
 * Claim an unplaced ghost of a given faction, or null when there are none left.
 *
 * Claiming rather than sampling is deliberate: two bodies with the same `user_id` would be
 * the same person standing in two places, and since `sourceKey` is what the suppression
 * registry keys on, attacking one would stand the other down too.
 */
export function takeGhost(faction: FactionType): Ghost | null {
  for (const g of ghosts) {
    if (g.faction !== faction) continue
    if (placed.has(g.userId)) continue
    placed.add(g.userId)
    return g
  }
  return null
}

/** Release every claim — the crowd is being rebuilt, so nobody is standing anywhere. */
export function releaseGhosts(): void {
  placed.clear()
}

/**
 * Remove one person from the roster — they have been blocked.
 *
 * Bumping `version` is the load-bearing half: the renderer version-gates its ghost pass, so
 * without it the body already wearing this identity keeps standing in the zone with the
 * blocked player's name over it until the next zone change. With it, the pass runs on the
 * next frame and hands that body back its own generated identity.
 *
 * `placed` keeps its entry deliberately — the claim is void either way, and clearing it
 * would let a DIFFERENT ghost be placed into the same body on the same frame, which reads
 * as the blocked player simply changing their name.
 */
export function dropGhost(userId: string): void {
  const next = ghosts.filter(g => g.userId !== userId)
  if (next.length === ghosts.length) return
  ghosts = next
  version++
}

export function getGhost(userId: string): Ghost | null {
  return ghosts.find(g => g.userId === userId) ?? null
}
