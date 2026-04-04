import type { TalentNodeDef } from '../types'

// ── Arms Warrior ── Ironcleave Spec ───────────────────────────────────────────
// Rebranded: "Ironcleave" spec — the relentless two-handed warrior
export const ARMS_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts required) ────────────────────────────────────────────────
  {
    id: 'arms_heroic_strike',
    name: 'Iron Strike',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '⚔',
    row: 1, col: 1, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 2 }],
  },
  {
    id: 'arms_deflection',
    name: 'Deflection',
    description: 'Increases armor by {n} per rank.',
    icon: '🛡',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'armor', valuePerRank: 4 }],
  },
  {
    id: 'arms_improved_rend',
    name: 'Serrated Blade',
    description: 'Your critical strikes apply a Rend bleed. Increases bleed damage per rank.',
    icon: '🩸',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'deep_wounds', valuePerRank: 0.08 }],
  },

  // ── Row 2 (5 pts required) ────────────────────────────────────────────────
  {
    id: 'arms_imp_charge',
    name: 'Battle Fervor',
    description: 'Increases stamina by {n} per rank.',
    icon: '⚡',
    row: 2, col: 1, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 3 }],
  },
  {
    id: 'arms_tactical_mastery',
    name: 'Tactical Mastery',
    description: 'Increases stamina and armor each rank. Grants combat resilience.',
    icon: '🧠',
    row: 2, col: 2, maxRanks: 5, requiresPoints: 5,
    effects: [
      { type: 'stat', stat: 'stamina', valuePerRank: 2 },
      { type: 'stat', stat: 'armor', valuePerRank: 2 },
    ],
  },
  {
    id: 'arms_thunder_clap',
    name: 'Thunder Clap',
    description: 'Reduces enemy attack speed by 5% per rank (max 15%).',
    icon: '💥',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'mortal_strike', valuePerRank: 0.05 }],
    // valuePerRank used as mob attack speed reduction per rank here
  },

  // ── Row 3 (10 pts required) ───────────────────────────────────────────────
  {
    id: 'arms_overpower',
    name: 'Overpower',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '💪',
    row: 3, col: 1, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.025 }],
  },
  {
    id: 'arms_anger_management',
    name: 'Anger Management',
    description: 'Passively regenerates 1 HP/s in combat. Increases stamina.',
    icon: '🔥',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    requires: 'arms_tactical_mastery',
    effects: [
      { type: 'stat', stat: 'stamina', valuePerRank: 5 },
      { type: 'mechanic', mechanic: 'lifesteal', valuePerRank: 0.02 },
    ],
  },
  {
    id: 'arms_deep_wounds',
    name: 'Deep Wounds',
    description: 'Critical strikes cause your target to bleed for {n}% weapon damage/s.',
    icon: '🩸',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'deep_wounds', valuePerRank: 0.12 }],
  },

  // ── Row 4 (15 pts required) ───────────────────────────────────────────────
  {
    id: 'arms_two_handed',
    name: 'Two-Handed Mastery',
    description: 'Increases all damage by 1% per rank.',
    icon: '⚔',
    row: 4, col: 1, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'two_handed_spec', valuePerRank: 0.01 }],
  },
  {
    id: 'arms_impale',
    name: 'Impale',
    description: 'Increases critical hit damage bonus by 10% per rank.',
    icon: '🗡',
    row: 4, col: 2, maxRanks: 2, requiresPoints: 15,
    requires: 'arms_deep_wounds',
    effects: [{ type: 'mechanic', mechanic: 'impale', valuePerRank: 0.10 }],
  },

  // ── Row 5 (20 pts required) ───────────────────────────────────────────────
  {
    id: 'arms_axe_spec',
    name: 'Weapon Mastery',
    description: 'Increases crit chance by 1% per rank.',
    icon: '🪓',
    row: 5, col: 1, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.01 }],
  },
  {
    id: 'arms_sweeping_strikes',
    name: 'Sweeping Strikes',
    description: 'Every 30s your next 5 attacks deal double damage.',
    icon: '🌀',
    row: 5, col: 2, maxRanks: 1, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'sweeping_strikes', valuePerRank: 1 }],
  },
  {
    id: 'arms_sword_spec',
    name: 'Blade Dance',
    description: 'Gives each attack a 1% chance per rank to strike again instantly.',
    icon: '✨',
    row: 5, col: 3, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'sword_spec', valuePerRank: 0.01 }],
  },

  // ── Row 6 (25 pts required) ───────────────────────────────────────────────
  {
    id: 'arms_hamstring',
    name: 'Hamstring',
    description: 'Reduces enemy attack speed by an additional 3% per rank.',
    icon: '🦵',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'mortal_strike', valuePerRank: 0.03 }],
  },
  {
    id: 'arms_mortal_strike',
    name: 'Mortal Strike',
    description: 'Unlocks the Mortal Strike ability: a crushing blow that deals 250% weapon damage on a 6s cooldown.',
    icon: '💀',
    row: 6, col: 3, maxRanks: 1, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'mortal_strike', valuePerRank: 1 }],
  },
]

// Connector lines between prerequisite pairs: [parentId, childId]
export const ARMS_CONNECTORS: [string, string][] = [
  ['arms_tactical_mastery', 'arms_anger_management'],
  ['arms_deep_wounds',      'arms_impale'],
]
