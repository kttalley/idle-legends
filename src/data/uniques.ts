// ── Uniques: one authored item per zone boss ──────────────────────────────────
//
// Shaped after the classic MMO boss drop — a NAMED item from a NAMED encounter, carrying
// an "Equip:" line that changes how you play rather than a bigger number. Twelve zones,
// twelve items, hand-written: a rolled unique would just be a rare with a flag, and the
// entire point is that this is a thing you went and got.
//
// Names are original. The rebrand (PLAN.md Track R) is a launch blocker and the shipped
// bundle currently greps clean over 49 Blizzard/Square terms; borrowing a famous item
// name would put a hit straight back into it.
//
// Three rules the design rests on, each of which is a real constraint in this codebase:
//
//  1. **Competitive stats AND an effect.** `isGearUpgrade` prices stats only, so an item
//     carried purely by its effect would never be auto-equipped and an idle hero would
//     never wear it. Stats get it on; the effect is why you care.
//  2. **The effect changes the IDLE LOOP.** Raw numbers are already a smooth curve nobody
//     interacts with. These hook the things that actually run while unattended.
//  3. **Some of them are a CHOICE, not an upgrade.** `riskReward` items make the
//     unattended hours richer and more dangerous at once. Idle games almost never ask the
//     player anything; "what do I wear before I close the tab" is a decision that costs
//     nothing to make and reshapes the next eight hours.

import type { MobId, Slot } from './types'

/**
 * What a unique DOES, beyond its stat line.
 *
 * Each variant names a system that already exists, so nothing here is speculative
 * plumbing — `compileUniques` folds them into one object and the consumers read it.
 */
export type UniqueEffect =
  /** Elites roll their drops on the BOSS table instead of the elite one. */
  | { kind: 'eliteDropsAsBoss' }
  /** Multiplies how often a spawn comes up elite. Above 1 this is a risk/reward trade. */
  | { kind: 'eliteSpawnMult'; value: number }
  /** Extra hours on the offline cap. */
  | { kind: 'offlineHours'; value: number }
  /** Multiplies gold from kills. */
  | { kind: 'goldFind'; value: number }
  /** Added to the per-kill item drop chance. */
  | { kind: 'dropChance'; value: number }
  /** Every attack splashes, at this fraction — no talent, no ability required. */
  | { kind: 'innateSplash'; value: number }
  /** Multiplies the splash radius of whatever splash is active. */
  | { kind: 'splashRadiusMult'; value: number }
  /** Seconds off the Reaping Arc window's cooldown. */
  | { kind: 'reapingArcHaste'; value: number }
  /** Share of damage taken returned to the attacker. */
  | { kind: 'thorns'; value: number }
  /** Extra melee attackers the hero can be surrounded by. Risk/reward: more incoming
   *  damage, but AoE catches more and the field clears faster. */
  | { kind: 'extraAttackers'; value: number }

export interface UniqueDef {
  /** Stable id, also the `Item.uniqueId` written onto the drop. */
  id: string
  /** The boss that drops it — the join to `ZoneConfig.bossId`. */
  bossId: MobId
  name: string
  slot: Slot
  /** Player-facing "Equip:" line. Written as the item would read in a tooltip. */
  equipText: string
  effect: UniqueEffect
  /** Palette id for the rendered drop. Rarity-as-palette is the renderer's premise, so a
   *  unique's identity costs a registry row rather than an art asset. */
  paletteId: string
}

/**
 * The set. Ordered by zone, so the effects escalate with the world.
 *
 * Early items are quiet economy nudges; the mid-game introduces the risk/reward choices;
 * the late ones reshape combat outright. Names are deliberately plain-fantasy — they are
 * world-bible territory and the owner may want to rewrite every one of them, the same way
 * the six missing city names are theirs to choose.
 */
export const UNIQUES: UniqueDef[] = [
  {
    id: 'uniq_meadowwarden', bossId: 'meadow_beast',
    name: 'Meadowwarden', slot: 'trinket',
    equipText: 'Equip: The wilds keep paying while you are away. +2 hours of offline progress.',
    effect: { kind: 'offlineHours', value: 2 },
    paletteId: 'gear/unique/meadow',
  },
  {
    id: 'uniq_tollkeepers_cut', bossId: 'bandit_warlord',
    name: "The Tollkeeper's Cut", slot: 'trinket',
    equipText: 'Equip: You take a bandit\'s share of everything you kill. +25% gold.',
    effect: { kind: 'goldFind', value: 1.25 },
    paletteId: 'gear/unique/toll',
  },
  {
    id: 'uniq_gravecallers_lantern', bossId: 'death_arbiter',
    name: "The Gravecaller's Lantern", slot: 'trinket',
    equipText: 'Equip: The dead give up more than they meant to. +10% chance of a drop.',
    effect: { kind: 'dropChance', value: 0.10 },
    paletteId: 'gear/unique/grave',
  },
  {
    id: 'uniq_thornvale_coil', bossId: 'troll_warchief',
    name: 'Thornvale Coil', slot: 'chest',
    equipText: 'Equip: The jungle bites back. Returns 15% of the damage you take.',
    effect: { kind: 'thorns', value: 0.15 },
    paletteId: 'gear/unique/thorn',
  },
  {
    id: 'uniq_wyrms_ember', bossId: 'flame_wyrm',
    name: "The Wyrm's Ember", slot: 'weapon',
    equipText: 'Equip: Every blow carries. Your attacks strike everything near you for 30%.',
    effect: { kind: 'innateSplash', value: 0.30 },
    paletteId: 'gear/unique/ember',
  },
  {
    id: 'uniq_warplate_of_the_crossing', bossId: 'crossing_war_golem',
    name: 'Warplate of the Crossing', slot: 'chest',
    equipText: 'Equip: You hold ground others could not. One more enemy may engage you at once.',
    effect: { kind: 'extraAttackers', value: 1 },
    paletteId: 'gear/unique/warplate',
  },
  {
    id: 'uniq_bloodfield_standard', bossId: 'bloodfield_warlord',
    name: 'The Bloodfield Standard', slot: 'trinket',
    equipText: 'Equip: Champions seek you out. Elites appear three times as often.',
    effect: { kind: 'eliteSpawnMult', value: 3 },
    paletteId: 'gear/unique/standard',
  },
  {
    id: 'uniq_ironcrag_signet', bossId: 'ironcrag_overlord',
    name: 'Ironcrag Signet', slot: 'trinket',
    equipText: 'Equip: You loot champions as though they were kings.',
    effect: { kind: 'eliteDropsAsBoss' },
    paletteId: 'gear/unique/signet',
  },
  {
    id: 'uniq_hexlords_fang', bossId: 'venom_hexlord',
    name: "The Hexlord's Fang", slot: 'weapon',
    equipText: 'Equip: The venom spreads further. Splashed blows reach half again as far.',
    effect: { kind: 'splashRadiusMult', value: 1.5 },
    paletteId: 'gear/unique/fang',
  },
  {
    id: 'uniq_wardrum_helm', bossId: 'warsong_chieftain',
    name: 'Helm of the Wardrum', slot: 'helm',
    equipText: 'Equip: The drum never stops. Reaping Arc returns 10 seconds sooner.',
    effect: { kind: 'reapingArcHaste', value: 10 },
    paletteId: 'gear/unique/wardrum',
  },
  {
    id: 'uniq_cinderfall_mantle', bossId: 'cinder_dreadlord',
    name: 'Cinderfall Mantle', slot: 'chest',
    equipText: 'Equip: You stand in the middle of it. Two more enemies may engage you at once.',
    effect: { kind: 'extraAttackers', value: 2 },
    paletteId: 'gear/unique/cinder',
  },
  {
    id: 'uniq_the_maws_hunger', bossId: 'maw_warlord',
    name: "The Maw's Hunger", slot: 'weapon',
    equipText: 'Equip: Everything within reach dies with the same blow. Attacks splash for 60%.',
    effect: { kind: 'innateSplash', value: 0.60 },
    paletteId: 'gear/unique/maw',
  },
]

export const UNIQUE_BY_BOSS: Record<string, UniqueDef> =
  Object.fromEntries(UNIQUES.map(u => [u.bossId, u]))

export const UNIQUE_BY_ID: Record<string, UniqueDef> =
  Object.fromEntries(UNIQUES.map(u => [u.id, u]))

/** Everything a worn set of uniques adds up to. One object, read by the consumers. */
export interface CompiledUniques {
  eliteDropsAsBoss: boolean
  eliteSpawnMult: number
  offlineHours: number
  goldFind: number
  dropChance: number
  innateSplash: number
  splashRadiusMult: number
  reapingArcHaste: number
  thorns: number
  extraAttackers: number
}

export function emptyUniques(): CompiledUniques {
  return {
    eliteDropsAsBoss: false, eliteSpawnMult: 1, offlineHours: 0, goldFind: 1,
    dropChance: 0, innateSplash: 0, splashRadiusMult: 1, reapingArcHaste: 0,
    thorns: 0, extraAttackers: 0,
  }
}

/**
 * Fold every worn unique into one effects object.
 *
 * Multiplicative effects multiply and additive ones add, so two uniques in different
 * slots stack rather than one silently winning. `innateSplash` takes the BEST rather than
 * summing — splash is a fraction of a hit, and two weapons cannot both be swung.
 */
export function compileUniques(
  equipment: Record<string, { uniqueId?: string } | null>,
): CompiledUniques {
  const out = emptyUniques()
  for (const worn of Object.values(equipment)) {
    const def = worn?.uniqueId ? UNIQUE_BY_ID[worn.uniqueId] : null
    if (!def) continue
    const e = def.effect
    switch (e.kind) {
      case 'eliteDropsAsBoss': out.eliteDropsAsBoss = true; break
      case 'eliteSpawnMult':   out.eliteSpawnMult *= e.value; break
      case 'offlineHours':     out.offlineHours += e.value; break
      case 'goldFind':         out.goldFind *= e.value; break
      case 'dropChance':       out.dropChance += e.value; break
      case 'innateSplash':     out.innateSplash = Math.max(out.innateSplash, e.value); break
      case 'splashRadiusMult': out.splashRadiusMult *= e.value; break
      case 'reapingArcHaste':  out.reapingArcHaste += e.value; break
      case 'thorns':           out.thorns += e.value; break
      case 'extraAttackers':   out.extraAttackers += e.value; break
    }
  }
  return out
}
