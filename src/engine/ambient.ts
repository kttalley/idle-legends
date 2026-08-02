// Ambient heroes: identity, talents, and what they say.
//
// Track L0 — the world should read like a populated MMO zone rather than a lone duel.
// The render side of that already existed (the dimetric scene depth-sorts and animates
// arbitrary entities, and `combatAdapter` already spawned a roaming crowd). What was
// missing is what this file supplies: heroes with the SAME shape as the player — a
// class, a race, a level, a spec they've actually specced into, and a look expressed as
// a `(spriteId, paletteId)` pair — plus something to say about what they're doing.
//
// ── The one hard rule ─────────────────────────────────────────────────────────
// Ambient heroes are scenery with behaviour. They must never touch the player's combat,
// loot, XP or economy. That guarantee is structural rather than a matter of discipline:
// nothing in this file (or in `engine/fight.ts`, which resolves their fights) can reach
// the store. There is no import path from here to `gameStore`, and adding one would be
// the bug.
//
// ── Determinism ───────────────────────────────────────────────────────────────
// Every hero derives from `(zoneSeed, index)` through a per-hero sub-stream, so walking
// out of a zone and back finds the same crowd, and an ambient bug is reproducible. Each
// hero owning its own stream — rather than all of them sharing one — is what makes it
// safe to cull off-screen heroes: culling changes how many draws happen, and with a
// shared stream that would silently change what every remaining hero rolled.

import type { ClassType, FactionType, RaceType, Rarity } from '../data/types'
import { CLASS_DEFINITIONS } from '../data/classes'
import { deepestSpec } from '../data/specs'
import { int, pick, pickWeighted, range, subStream, type Rng } from './rng'

// ── Population budget ─────────────────────────────────────────────────────────
// The plan names entity/sim perf as Track L's top risk, so the budget is a named
// constant rather than a number buried in a loop. These are per-zone totals; the
// renderer culls off-screen and the behaviour tick skips anyone not on screen.

/** Ambient heroes alive in an open-world zone. */
export const AMBIENT_HERO_BUDGET = 8
/** Ambient heroes that may be resolving a real (simulated) fight at once. */
export const AMBIENT_FIGHT_BUDGET = 3
/** Seconds between behaviour ticks. The scene renders at 60fps; brains do not need to. */
export const AMBIENT_BRAIN_HZ = 5

export type AmbientState =
  | 'wander'    // drifting near their group's anchor
  | 'approach'  // committed to a monster, closing the distance
  | 'fight'     // playing back a resolved fight
  | 'loot'      // picking over the corpse
  | 'idle'      // standing around
  | 'follow'    // in the player's party, keeping station with them (L2)
  | 'assist'    // in the player's party, visibly fighting THE PLAYER'S mob (C3)

export interface AmbientIdentity {
  name: string
  playerClass: ClassType
  race: RaceType
  faction: FactionType
  level: number
  rarity: Rarity
  /** Points spent into one tree, so the hero has a real spec and real talent effects. */
  talentAllocs: Record<string, number>
  /** The tree they fed most — `deepestSpec`, same as the player's title. */
  specTitle: string | null
}

const NAMES = [
  'Aldric', 'Brenna', 'Corvin', 'Dahlia', 'Eirik', 'Fenna', 'Gorvan', 'Haldis',
  'Ivo', 'Jora', 'Kaelen', 'Lyra', 'Morrin', 'Nyssa', 'Orin', 'Perrin',
  'Roan', 'Sable', 'Torin', 'Ulla', 'Vesk', 'Wren', 'Yorick', 'Zara',
]
const CLASSES: ClassType[] = ['warrior', 'mage', 'rogue', 'warlock']
const CONCORD_RACES: RaceType[] = ['human', 'dwarf', 'elf']
const ASHMARCH_RACES: RaceType[] = ['orc', 'troll', 'goblin']
/** Weighted toward common, so a legendary walking past reads as an event. */
const RARITIES: { r: Rarity; w: number }[] = [
  { r: 'common', w: 40 }, { r: 'uncommon', w: 28 }, { r: 'rare', w: 18 },
  { r: 'epic', w: 10 }, { r: 'legendary', w: 4 },
]

/**
 * Spend points down one spec, respecting `requiresPoints` gating.
 *
 * This is what gives an ambient hero a *title* (`deepestSpec` needs a clear winner) and
 * what makes their simulated fights differ by build — a Flurry warrior visibly swings
 * more often than a Bulwark one. Points go into a single tree because a hero who spread
 * them evenly would have no spec at all, and "no spec" is not a character.
 */
function allocateSpec(rng: Rng, playerClass: ClassType, level: number): Record<string, number> {
  const specs = CLASS_DEFINITIONS[playerClass].specs
  if (!specs.length) return {}
  const spec = specs[int(rng, specs.length)]
  const allocs: Record<string, number> = {}
  // Roughly the player's own budget: one point per level past the first.
  let budget = Math.max(0, Math.min(level - 1, 40))
  let spent = 0
  // Walk the tree in tier order, filling what is unlocked — a plausible levelling path
  // rather than a random scatter that would leave capstones stranded.
  const nodes = [...spec.talents].sort((a, b) => a.requiresPoints - b.requiresPoints)
  for (const node of nodes) {
    if (budget <= 0) break
    if (spent < node.requiresPoints) continue
    const ranks = Math.min(node.maxRanks, budget)
    if (ranks <= 0) continue
    allocs[node.id] = ranks
    budget -= ranks
    spent += ranks
  }
  return allocs
}

/**
 * Build one ambient hero from a zone seed and its index in the crowd.
 *
 * `playerLevel` only sets the level BAND — ambient heroes scale near the player so the
 * crowd reads as peers rather than as a wall of level-1s or untouchable elites. It is
 * the only thing about the player this file reads, and it is read-only.
 */
export function makeAmbientHero(zoneSeed: number, index: number, playerLevel: number): AmbientIdentity {
  const rng = subStream(zoneSeed, `hero:${index}`)
  const faction: FactionType = rng() < 0.5 ? 'alliance' : 'horde'
  const races = faction === 'alliance' ? CONCORD_RACES : ASHMARCH_RACES
  const race = pick(rng, races)
  const playerClass = pick(rng, CLASSES)
  const rarity = pickWeighted(rng, RARITIES, r => r.w).r
  const name = pick(rng, NAMES)
  // ±20% of the player's level, floored at 1 — near-peers, never trivial or hopeless.
  const level = Math.max(1, Math.round(playerLevel * range(rng, 0.8, 1.2)))
  const talentAllocs = allocateSpec(rng, playerClass, level)
  const spec = deepestSpec(playerClass, talentAllocs)
  return { name, playerClass, race, faction, level, rarity, talentAllocs, specTitle: spec?.name ?? null }
}

// ── Barks ─────────────────────────────────────────────────────────────────────
// Canned pools, per the plan's "zero-cost/offline path first" — the LLM thought system
// is the upgrade, not the dependency. These are deliberately in MMO-chat register
// rather than the player's gritty inner-monologue voice: the player's `ThoughtBubble`
// is a private thought, whereas these are things said out loud on a busy server, and
// the two reading differently is the point.

export type BarkEvent =
  | 'engage'      // committing to a nearby monster
  | 'kill'        // it died
  | 'loot'        // picking over the corpse
  | 'lowHp'       // nearly lost that one
  | 'died'        // lost it
  | 'passing'     // walking past another hero
  | 'rivalFaction'// walking past the other faction
  | 'idle'        // nothing in particular

const BARKS: Record<BarkEvent, string[]> = {
  engage: [
    'pulling, back me up', 'this one\'s mine', 'inc, watch adds', 'brb, dinner',
    'ez pull', 'taunt on cd', 'need this for the daily',
  ],
  kill: [
    'gg', 'ez', 'that all?', 'down!', 'clean', 'noice', 'one more for the tally',
  ],
  loot: [
    'ninja\'d it, sry', 'greed', 'trash drop again', 'FINALLY the drop',
    'vendor trash tbh', 'rolling need', 'that\'s a keeper',
  ],
  lowHp: [
    'heals??', 'oh no oh no', 'low! low!', 'not like this', 'pot pot pot',
  ],
  died: [
    'rip', 'lag', 'wasn\'t ready', 'corpse run ftw', 'that was a pull',
  ],
  passing: [
    'o/', 'wb', 'nice xmog', 'lf group?', 'anyone doing dungeons?', 'hey',
    'no, i saw that ore first — qq', 'need a hand…? naw, u got it',
  ],
  rivalFaction: [
    'get lost', 'not today', '/spit', 'run along', 'your faction is trash',
    'ganked u last week', 'come at me',
  ],
  idle: [
    'afk 5', 'anyone selling?', 'lfm meadows', 'wts iron ore', 'zzz',
    'this zone is dead', 'been farming for hours',
  ],
}

/** How long a bark stays up, and the minimum gap before that hero speaks again. */
export const BARK_SECONDS = 2.8
export const BARK_COOLDOWN_SECONDS = 9
/** Ceiling on bubbles visible at once — past this the world reads as noise, not life. */
export const BARK_MAX_CONCURRENT = 3

/** Pick a bark. Seeded, so a replayed zone says the same things. */
export function pickBark(rng: Rng, event: BarkEvent): string {
  return pick(rng, BARKS[event])
}

/**
 * Chance a given event is worth speaking at all. Every kill producing a "gg" turns the
 * crowd into a chat spam bot; silence most of the time is what makes the rest land.
 */
export const BARK_CHANCE: Record<BarkEvent, number> = {
  engage: 0.25, kill: 0.3, loot: 0.4, lowHp: 0.5, died: 0.7,
  passing: 0.18, rivalFaction: 0.3, idle: 0.06,
}
