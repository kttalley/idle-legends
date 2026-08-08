// What kind of animal is this, and how does it behave when you walk past?
//
// ── Why this is its own module ────────────────────────────────────────────────
// These patterns started in the render adapter, where they decided whether a mob charged
// you or held its ground and whether it lunged or cast from range. Once the STORE also
// needed temperament — to decide who notices the hero and from how far — the choice was
// to duplicate the regexes or to lift them somewhere both layers can import. Duplicating
// behaviour tables is how a mob ends up charging in the simulation and standing still on
// screen, so: one definition, imported by both.
//
// ── Why regexes over per-mob data ─────────────────────────────────────────────
// Matching on the name means 12 zones × 4 mobs need no authoring pass to get distinct
// behaviour, and the bestiary already names things descriptively. The cost is real and
// worth stating: a mob's NAME now changes how it acts, so renaming content changes
// gameplay silently. If temperament ever needs to diverge from what a thing is called,
// this becomes a `MobTemplate` field and these patterns become its default.

import type { MobInstance } from '../data/types'

/** Ranged/caster archetypes — they keep their distance and cast rather than closing. */
export const RANGED_RE =
  /archer|ranger|hunter|gunner|warlock|mage|magus|caster|spellcaster|shaman|priest|seer|oracle|necromancer|sorcerer|conjurer|elementalist|pyromancer|cryomancer/

/** Predators and raiders. These CHARGE — they close on you and you receive them. */
export const AGGRESSIVE_RE =
  /wolf|worgen|raptor|tiger|stalker|boar|beast|berserker|marauder|raider|reaver|hound|vulture|swarm|prowler|savage|rabid|feral|thug|bandit|brute|charger/

export type Temperament =
  /** Charges on sight from a long way off. */
  | 'predator'
  /** Ignores you until you get close, or until you hit it first. */
  | 'territorial'
  /** Never comes to you. You walk to the lair. */
  | 'lair'

// Both read `baseName`, never `name`. The display name carries a tier prefix (`★ `,
// `[BOSS] `) and behaviour must not depend on presentation — today these regexes happen
// to survive a prefix because they are unanchored searches, but that is luck rather than
// design, and one anchored pattern or one prefix starting with a matching word would
// silently change which mobs charge you. `?? mob.name` keeps callers that only have a
// display name working.
export function isRangedMob(mob: Pick<MobInstance, 'name'> & { baseName?: string }): boolean {
  return RANGED_RE.test((mob.baseName ?? mob.name).toLowerCase())
}

export function temperamentOf(
  mob: Pick<MobInstance, 'name' | 'isBoss'> & { baseName?: string },
): Temperament {
  // Bosses never charge, whatever they are called — a lair encounter that walks out to
  // meet you in a corridor stops reading as a climax.
  if (mob.isBoss) return 'lair'
  return AGGRESSIVE_RE.test((mob.baseName ?? mob.name).toLowerCase()) ? 'predator' : 'territorial'
}

// ── Aggro ranges, in tiles ────────────────────────────────────────────────────
// The gap between these two numbers is the entire feel of walking through a zone: too
// close together and every mob behaves the same, too far apart and predators are
// unavoidable while everything else is scenery. A predator's radius is deliberately wider
// than the hero's own visible radius is comfortable with, so being noticed happens BEFORE
// you have finished deciding whether to engage — that is what makes a wolf a threat and a
// mushroom a landmark.

export const AGGRO_PREDATOR = 8.5
export const AGGRO_TERRITORIAL = 3.0
/** A lair boss still defends itself once you are on top of it. */
export const AGGRO_LAIR = 2.0

export function aggroRadiusFor(mob: Pick<MobInstance, 'name' | 'isBoss'>): number {
  switch (temperamentOf(mob)) {
    case 'predator':    return AGGRO_PREDATOR
    case 'lair':        return AGGRO_LAIR
    default:            return AGGRO_TERRITORIAL
  }
}

// ── How far a mob can hit you from ────────────────────────────────────────────
//
// There was one number, and it was the melee one: the store gated EVERY mob's swing on
// 1.5 tiles regardless of what the mob was. That is wrong in both directions at once.
//
// The renderer already holds a caster at `RANGED_GAP_TILES` (5) and a brawler at
// `MELEE_GAP_TILES` (2), so the two halves of the game disagreed about where a mob was
// standing: an archer was drawn five tiles out while the store, whose engagement offset
// shrinks toward zero on approach, considered it adjacent and let it fire. On screen that is an
// enemy attacking you from across the map — which is exactly what it looked like.
//
// A melee reach slightly beyond the renderer's hold, so a brawler parked at its gap is
// genuinely in range rather than a hair outside it and twitching between the two.
export const MELEE_ATTACK_RANGE = 2.2
/** A caster's reach. Matches `RANGED_GAP_TILES` plus the same slack. */
export const RANGED_ATTACK_RANGE = 5.7

/** How far THIS mob can attack from. The single answer both the store and the renderer
 *  should ask, so neither can decide a mob is in range while the other draws it away. */
export function attackRangeOf(mob: Pick<MobInstance, 'name'> & { baseName?: string }): number {
  return isRangedMob(mob) ? RANGED_ATTACK_RANGE : MELEE_ATTACK_RANGE
}

/** How far a mob will wander from its home anchor while patrolling. Predators range
 *  wider — a territorial thing that strayed six tiles from its post is not territorial. */
export function patrolRangeFor(mob: Pick<MobInstance, 'name' | 'isBoss'>): number {
  switch (temperamentOf(mob)) {
    case 'predator':    return 6
    case 'lair':        return 0   // a boss holds the lair; it does not pace the zone
    default:            return 3
  }
}

/**
 * World fields for a mob that is NOT part of the zone simulation.
 *
 * Two of these exist and both are legitimate: the ambient sparring partner the render
 * adapter spawns for a party companion (positioned by the adapter, never in the store's
 * `mobs`), and the synthetic combatant the determinism harness feeds to `runFight`.
 * Neither patrols and neither notices the hero, so rather than inventing plausible
 * coordinates for them — which would put fake bodies into a system that assumes its
 * contents are real — they get one explicitly inert shape with a name that says so.
 */
export function combatantOnlyWorldFields(): Pick<
  MobInstance,
  'pos' | 'home' | 'patrolTarget' | 'patrolPause' | 'aggro' | 'aggroRadius' | 'path' | 'pathCool'
> {
  return {
    pos: { x: 0, y: 0 },
    home: { x: 0, y: 0 },
    patrolTarget: null,
    patrolPause: 0,
    path: null,
    pathCool: 0,
    // Already fighting, by construction — nothing needs to notice anyone.
    aggro: true,
    aggroRadius: 0,
  }
}

/** Patrol gait, tiles/sec. Slower than the hero on purpose: you should be able to walk
 *  away from something that has not decided to chase you yet. */
export const PATROL_SPEED = 1.1
/** Chase gait once aggroed. Faster than patrol, and predators run down what they notice. */
export const CHASE_SPEED = 2.5
/** Beyond this from its home, an aggroed mob gives up and walks back — the leash that
 *  stops one wolf towing you across the entire zone. */
export const LEASH_DISTANCE = 14
