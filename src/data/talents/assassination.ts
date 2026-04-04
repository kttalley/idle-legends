import type { TalentNodeDef } from '../types'

// ── Assassination Rogue ── Shadowed Edge Spec ─────────────────────────────────
// Rebranded: "Shadowed Edge" spec — lethal precision, poison and blade
export const ASSASSINATION_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts required) ────────────────────────────────────────────────
  {
    id: 'ass_improved_eviscerate',
    name: 'Vicious Cuts',
    description: 'Increases Eviscerate (finisher) damage by 5% per rank.',
    icon: '🗡',
    row: 1, col: 1, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 1.5 }],
  },
  {
    id: 'ass_remorseless',
    name: 'Remorseless Attacks',
    description: 'After a kill, next attack has +4% crit per rank.',
    icon: '💀',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'remorseless_attacks', valuePerRank: 0.04 }],
  },
  {
    id: 'ass_malice',
    name: 'Malice',
    description: 'Increases critical strike chance by 1% per rank.',
    icon: '😈',
    row: 1, col: 3, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.01 }],
  },

  // ── Row 2 (5 pts required) ────────────────────────────────────────────────
  {
    id: 'ass_ruthlessness',
    name: 'Ruthlessness',
    description: 'Increases attack speed by 0.04s per rank.',
    icon: '⚡',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.04 }],
  },
  {
    id: 'ass_murder',
    name: 'Murder',
    description: 'Increases all damage dealt by 2% per rank.',
    icon: '🔪',
    row: 2, col: 2, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'two_handed_spec', valuePerRank: 0.02 }],
  },
  {
    id: 'ass_slice_dice',
    name: 'Slice and Dice',
    description: 'Reduces attack interval by 0.05s per rank.',
    icon: '⚔',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.05 }],
  },

  // ── Row 3 (10 pts required) ───────────────────────────────────────────────
  {
    id: 'ass_expose_armor',
    name: 'Expose Armor',
    description: 'Reduces enemy effective armor by 10 per rank.',
    icon: '🎯',
    row: 3, col: 1, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'lethality', valuePerRank: 10 }],
    // repurposed to mob armor reduction
  },
  {
    id: 'ass_lethality',
    name: 'Lethality',
    description: 'Increases critical strike damage bonus by 6% per rank.',
    icon: '💉',
    row: 3, col: 2, maxRanks: 5, requiresPoints: 10,
    requires: 'ass_malice',
    effects: [{ type: 'mechanic', mechanic: 'lethality', valuePerRank: 0.06 }],
  },
  {
    id: 'ass_vile_poisons',
    name: 'Vile Poisons',
    description: 'Attacks apply a poison DoT dealing 8 damage/tick per rank.',
    icon: '☠',
    row: 3, col: 3, maxRanks: 5, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'vile_poisons', valuePerRank: 8 }],
  },

  // ── Row 4 (15 pts required) ───────────────────────────────────────────────
  {
    id: 'ass_improved_poisons',
    name: 'Improved Poisons',
    description: 'Increases poison proc chance by 2% per rank.',
    icon: '☠',
    row: 4, col: 1, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'vile_poisons', valuePerRank: 0.02 }],
  },
  {
    id: 'ass_cold_blood',
    name: 'Cold Blood',
    description: 'Unlocks the Cold Blood ability: your next attack is a guaranteed critical strike. 30s cooldown.',
    icon: '🧊',
    row: 4, col: 2, maxRanks: 1, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'cold_blood', valuePerRank: 1 }],
  },

  // ── Row 5 (20 pts required) ───────────────────────────────────────────────
  {
    id: 'ass_seal_fate',
    name: 'Seal Fate',
    description: 'Critical strikes add a Combo Point. Every 5 Combo Points trigger an Eviscerate for 300% weapon damage.',
    icon: '🎴',
    row: 5, col: 2, maxRanks: 5, requiresPoints: 20,
    requires: 'ass_cold_blood',
    effects: [{ type: 'mechanic', mechanic: 'seal_fate', valuePerRank: 1 }],
  },

  // ── Row 6 (25 pts required) ───────────────────────────────────────────────
  {
    id: 'ass_vigor',
    name: 'Vigor',
    description: 'Increases agility by {n} and crit chance by 2%.',
    icon: '⚡',
    row: 6, col: 2, maxRanks: 1, requiresPoints: 25,
    effects: [
      { type: 'stat', stat: 'agility', valuePerRank: 10 },
      { type: 'stat', stat: 'critChance', valuePerRank: 0.02 },
    ],
  },
]

export const ASSASSINATION_CONNECTORS: [string, string][] = [
  ['ass_malice',      'ass_lethality'],
  ['ass_cold_blood',  'ass_seal_fate'],
]
