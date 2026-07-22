import type { TalentNodeDef } from '../types'

// ── Warlock ── Bleakweave Spec ──────────────────────────────────────
// Rebranded: "Bleakweave" spec — shadow curses, life drain, and entropy
export const AFFLICTION_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts required) ────────────────────────────────────────────────
  {
    id: 'aff_suppression',
    name: 'Creeping Certainty',
    description: 'Increases intellect by {n} per rank. Curses land with greater force.',
    icon: '🌑',
    row: 1, col: 1, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 2 }],
  },
  {
    id: 'aff_imp_corruption',
    name: 'Quickened Rot',
    description: 'Activates the Rot shadow DoT. Increases its damage per rank.',
    icon: '☠',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'corruption', valuePerRank: 5 }],
  },
  {
    id: 'aff_imp_weakness',
    name: 'Dirge of Faltering',
    description: 'Reduces enemy attack damage by 3% per rank.',
    icon: '🕸',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'amplify_curse', valuePerRank: 0.03 }],
    // repurposed: reduces mob attack speed
  },

  // ── Row 2 (5 pts required) ────────────────────────────────────────────────
  {
    id: 'aff_drain_soul',
    name: 'Last Gleaning',
    description: 'Bonus damage when enemy is below 20% HP. Increases weapon DPS by {n}.',
    icon: '👻',
    row: 2, col: 1, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 2 }],
  },
  {
    id: 'aff_life_tap',
    name: 'Blood Toll',
    description: 'Increases intellect by {n} per rank.',
    icon: '❤',
    row: 2, col: 2, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 4 }],
  },
  {
    id: 'aff_imp_agony',
    name: 'Dirge of Anguish',
    description: 'Activates the Dirge of Anguish DoT, dealing ramping shadow damage.',
    icon: '🩸',
    row: 2, col: 3, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'curse_of_agony', valuePerRank: 1 }],
  },

  // ── Row 3 (10 pts required) ───────────────────────────────────────────────
  {
    id: 'aff_fel_concentration',
    name: 'Unbroken Litany',
    description: 'Increases all DoT damage by 6% per rank.',
    icon: '🧘',
    row: 3, col: 1, maxRanks: 5, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'corruption', valuePerRank: 3 }],
  },
  {
    id: 'aff_amplify_curse',
    name: 'Swelling Refrain',
    description: 'Every 30s, your next curse or DoT deals 50% extra damage.',
    icon: '📣',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'amplify_curse', valuePerRank: 1 }],
  },
  {
    id: 'aff_grim_reach',
    name: 'Far Lament',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '👁',
    row: 3, col: 3, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 3 }],
  },

  // ── Row 4 (15 pts required) ───────────────────────────────────────────────
  {
    id: 'aff_dark_pact',
    name: 'Bleak Bargain',
    description: 'Your Imp familiar deals passive damage. Increases weapon DPS by {n}.',
    icon: '🤝',
    row: 4, col: 1, maxRanks: 1, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 8 }],
  },
  {
    id: 'aff_curse_exhaustion',
    name: 'Dirge of Weariness',
    description: 'Reduces enemy attack speed by 8% per rank.',
    icon: '🕸',
    row: 4, col: 2, maxRanks: 1, requiresPoints: 15,
    requires: 'aff_imp_weakness',
    effects: [{ type: 'mechanic', mechanic: 'amplify_curse', valuePerRank: 0.08 }],
  },
  {
    id: 'aff_drain_life',
    name: 'Lifedraw',
    description: 'Increases lifesteal by 2% per rank. Shadow spells drain vitality.',
    icon: '🩸',
    row: 4, col: 3, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'lifesteal', valuePerRank: 0.02 }],
  },

  // ── Row 5 (20 pts required) ───────────────────────────────────────────────
  {
    id: 'aff_imp_exhaustion',
    name: 'Harrowing Grip',
    description: 'Additional 4% enemy attack speed reduction per rank.',
    icon: '🕸',
    row: 5, col: 1, maxRanks: 4, requiresPoints: 20,
    requires: 'aff_curse_exhaustion',
    effects: [{ type: 'mechanic', mechanic: 'amplify_curse', valuePerRank: 0.04 }],
  },
  {
    id: 'aff_nightfall',
    name: 'Gathering Dark',
    description: 'DoT ticks have a 2/4% chance to unleash an Umbral Bolt, dealing 250% damage instantly.',
    icon: '🌙',
    row: 5, col: 2, maxRanks: 2, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'nightfall', valuePerRank: 0.02 }],
  },

  // ── Row 6 (25 pts required) ───────────────────────────────────────────────
  {
    id: 'aff_siphon_life',
    name: 'Tithe of Wounds',
    description: 'Passively heals you for 15 HP every 3 seconds in combat.',
    icon: '💚',
    row: 6, col: 1, maxRanks: 1, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'siphon_life', valuePerRank: 15 }],
  },
]

export const AFFLICTION_CONNECTORS: [string, string][] = [
  ['aff_imp_weakness',  'aff_curse_exhaustion'],
  ['aff_curse_exhaustion', 'aff_imp_exhaustion'],
]
