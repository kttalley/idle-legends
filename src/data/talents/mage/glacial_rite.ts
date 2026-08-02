import type { TalentNodeDef } from '../../types'

// ── Mage ── Glacial Rite ─────────────────────────────────────────────────────
// Absolute zero, death by a thousand shards. Control before damage: an enemy that
// cannot swing is an enemy that cannot win, and every point of damage here is bought
// on top of a target that was already held still.
//
// The original mage tree, extended from 47 ranks to 60. Every `frost_` id predates this
// pass and is preserved so a shipped save's points land back where they were put.
//
// Two nodes were also repaired rather than merely carried over. `frost_permafrost`
// declared "reduces enemy attack speed" while contributing a mechanic worth 0.0 — the
// freeze extension it actually did was read straight out of `talentAllocs` by the tick,
// so the talent's own data said nothing true. `frost_channeling` promised damage
// reduction and granted armour. Both now do what they say.
export const GLACIAL_RITE_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'frost_warding',
    name: 'Rimeguard',
    description: 'Increases armor by {n} per rank.',
    icon: '🧊',
    row: 1, col: 1, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'armor', valuePerRank: 5 }],
  },
  {
    id: 'frost_imp_frostbolt',
    name: 'Glacial Bolt',
    description: 'Reduces attack interval by {n}s per rank.',
    icon: '❄',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.08 }],
  },
  {
    id: 'frost_ice_shards',
    name: 'Jagged Rime',
    description: 'Increases critical strike damage bonus by {n}% per rank.',
    icon: '💎',
    row: 1, col: 3, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.20 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'frost_frostbite',
    name: 'Creeping Freeze',
    description: 'Gives your attacks a {n}% chance per rank to freeze the target solid.',
    icon: '🥶',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'freeze_chance', valuePerRank: 0.05 }],
  },
  {
    id: 'frost_imp_frost_nova',
    name: 'Icy Grip',
    description: 'Increases intellect by {n} per rank.',
    icon: '❄',
    row: 2, col: 2, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 4 }],
  },
  {
    id: 'frost_permafrost',
    name: 'Long Winter',
    // The freeze EXTENSION is read from this talent's rank directly by the combat tick
    // (see the Creeping Freeze proc in gameStore); the slow below is its declared half.
    description: 'Your freezes hold a second longer per rank, and the cold slows what it touches by {n}%.',
    icon: '🌡',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.04 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'frost_piercing_ice',
    name: 'Keening Cold',
    description: 'Increases all damage by {n}% per rank.',
    icon: '🗡',
    row: 3, col: 1, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },
  {
    id: 'frost_cold_snap',
    name: 'Sudden Winter',
    description: 'Every 45 seconds, your next attack is a guaranteed critical strike.',
    icon: '⚡',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'timed_crit', valuePerRank: 1 / 45 }],
  },
  {
    id: 'frost_imp_blizzard',
    name: 'Snowsquall',
    description: 'Increases weapon DPS by {n} per rank. Ice storms lash the target.',
    icon: '🌨',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 3 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'frost_arctic_reach',
    name: 'Farfrost',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '🎯',
    row: 4, col: 1, maxRanks: 2, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 2 }],
  },
  {
    id: 'frost_channeling',
    name: 'Winter Discipline',
    description: 'Reduces all damage taken by {n}% per rank.',
    icon: '📡',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.03 }],
  },
  {
    id: 'frost_shatter',
    name: 'Brittlebreak',
    description: 'Increases crit chance against frozen targets by {n}% per rank.',
    icon: '💥',
    row: 4, col: 3, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'frozen_crit', valuePerRank: 0.10 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'frost_ice_block',
    name: 'Glacial Tomb',
    description: 'Once per fight, at a sliver of health, you become untouchable for 5 seconds.',
    icon: '🧊',
    row: 5, col: 1, maxRanks: 1, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'death_ward', valuePerRank: 1 }],
  },
  {
    id: 'frost_cone_of_cold',
    name: 'Breath of Winter',
    description: 'Increases intellect by {n} and crit chance by 1% per rank.',
    icon: '🌬',
    row: 5, col: 2, maxRanks: 3, requiresPoints: 20,
    effects: [
      { type: 'stat', stat: 'intellect', valuePerRank: 5 },
      { type: 'stat', stat: 'critChance', valuePerRank: 0.01 },
    ],
  },
  {
    id: 'frost_frozen_core',
    name: 'Winterheart',
    description: 'Increases critical strike damage bonus by a further {n}% per rank.',
    icon: '💎',
    row: 5, col: 3, maxRanks: 5, requiresPoints: 20,
    requires: 'frost_shatter',
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.08 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'frost_ice_barrier',
    name: 'Winterward',
    description: 'Each fight begins with a shield of ice worth {n} damage.',
    icon: '🛡',
    row: 6, col: 1, maxRanks: 1, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'absorb_shield', valuePerRank: 80 }],
  },
  {
    id: 'frost_absolute_zero',
    name: 'Absolute Zero',
    description: 'The cold deepens — enemies attack a further {n}% slower per rank.',
    icon: '🌡',
    row: 6, col: 2, maxRanks: 4, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.03 }],
  },
  {
    id: 'frost_rimebolt_mastery',
    name: 'Rimebolt Mastery',
    description: 'Rimebolt lands {n}% harder per rank and takes less time to shape.',
    icon: '❄',
    row: 6, col: 3, maxRanks: 3, requiresPoints: 25,
    effects: [
      { type: 'ability', ability: 'mage_frostbolt', mod: 'damage', valuePerRank: 0.25,
        note: 'Rimebolt Mastery: impact increased' },
      { type: 'ability', ability: 'mage_frostbolt', mod: 'castTime', valuePerRank: 0.15,
        note: 'Rimebolt Mastery: cast time reduced' },
    ],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'frost_winters_chill',
    name: 'Deepening Cold',
    description: 'Each attack stacks Deepening Cold: +2% crit per stack, up to five.',
    icon: '❄',
    row: 7, col: 1, maxRanks: 5, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'chill_stacks', valuePerRank: 1 }],
  },
  {
    id: 'frost_deep_freeze',
    name: 'Stillwater',
    description: 'Rimebolt returns twice as often, and the cold takes hold far more readily.',
    icon: '🥶',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'frost_rimebolt_mastery',
    effects: [
      { type: 'mechanic', mechanic: 'freeze_chance', valuePerRank: 0.10 },
      { type: 'ability', ability: 'mage_frostbolt', mod: 'cooldown', valuePerRank: 0.50,
        note: 'Stillwater: cooldown halved' },
    ],
  },
]

export const GLACIAL_RITE_CONNECTORS: [string, string][] = [
  ['frost_shatter',          'frost_frozen_core'],
  ['frost_rimebolt_mastery', 'frost_deep_freeze'],
]
