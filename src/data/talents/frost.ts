import type { TalentNodeDef } from '../types'

// ── Mage ── Glacial Rite Spec ───────────────────────────────────────────
// Rebranded: "Glacial Rite" spec — absolute zero, death by a thousand shards
export const FROST_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts required) ────────────────────────────────────────────────
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
    description: 'Reduces attack interval by 0.1s per rank (faster casting).',
    icon: '❄',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.08 }],
  },
  {
    id: 'frost_ice_shards',
    name: 'Jagged Rime',
    description: 'Increases critical strike damage bonus by 20% per rank.',
    icon: '💎',
    row: 1, col: 3, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'ice_shards', valuePerRank: 0.20 }],
  },

  // ── Row 2 (5 pts required) ────────────────────────────────────────────────
  {
    id: 'frost_frostbite',
    name: 'Creeping Freeze',
    description: 'Gives your attacks a 5/10/15% chance to freeze the target for 4s (mob cannot attack).',
    icon: '🥶',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'frostbite', valuePerRank: 0.05 }],
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
    description: 'Reduces enemy attack speed by 4% per rank.',
    icon: '🌡',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'frostbite', valuePerRank: 0.0 }],
    // handled specially: extends freeze duration, mapped to mob attack speed
  },

  // ── Row 3 (10 pts required) ───────────────────────────────────────────────
  {
    id: 'frost_piercing_ice',
    name: 'Keening Cold',
    description: 'Increases all spell damage by 2% per rank.',
    icon: '🗡',
    row: 3, col: 1, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'two_handed_spec', valuePerRank: 0.02 }],
  },
  {
    id: 'frost_cold_snap',
    name: 'Sudden Winter',
    description: 'Passive: Every 45s your next attack is a guaranteed critical strike.',
    icon: '⚡',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'cold_snap', valuePerRank: 1 }],
  },
  {
    id: 'frost_imp_blizzard',
    name: 'Snowsquall',
    description: 'Increases weapon DPS by {n} per rank. Ice storms lash the target.',
    icon: '🌨',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 3 }],
  },

  // ── Row 4 (15 pts required) ───────────────────────────────────────────────
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
    description: 'Reduces damage taken by 5% per rank.',
    icon: '📡',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'armor', valuePerRank: 8 }],
  },
  {
    id: 'frost_shatter',
    name: 'Brittlebreak',
    description: 'Increases crit chance against frozen targets by 10% per rank.',
    icon: '💥',
    row: 4, col: 3, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'shatter', valuePerRank: 0.10 }],
  },

  // ── Row 5 (20 pts required) ───────────────────────────────────────────────
  {
    id: 'frost_ice_block',
    name: 'Glacial Tomb',
    description: 'Once per combat: when HP drops below 15%, become immune to damage for 5s.',
    icon: '🧊',
    row: 5, col: 1, maxRanks: 1, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'ice_block', valuePerRank: 1 }],
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

  // ── Row 6 (25 pts required) ───────────────────────────────────────────────
  {
    id: 'frost_ice_barrier',
    name: 'Winterward',
    description: 'At the start of each combat, you gain an absorb shield worth 80 HP per rank.',
    icon: '🛡',
    row: 6, col: 1, maxRanks: 1, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'ice_barrier', valuePerRank: 80 }],
  },

  // ── Row 7 (30 pts required) ───────────────────────────────────────────────
  {
    id: 'frost_winters_chill',
    name: 'Deepening Cold',
    description: 'Each attack stacks Deepening Cold: +2% crit per stack, up to 5 stacks.',
    icon: '❄',
    row: 7, col: 2, maxRanks: 5, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'winters_chill', valuePerRank: 1 }],
  },
]

export const FROST_CONNECTORS: [string, string][] = [
  ['frost_shatter',  'frost_ice_barrier'],
  ['frost_ice_block', 'frost_winters_chill'],
]
