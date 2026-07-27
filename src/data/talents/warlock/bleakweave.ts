import type { TalentNodeDef } from '../../types'

// ── Warlock ── Bleakweave ────────────────────────────────────────────────────
// Nothing you do is fast. Everything you do is already happening.
//
// Curses, rot and entropy: damage that was applied some time ago and is only now
// arriving. The tree buys almost no burst at all — what it buys is DoTs that tick
// harder (Unbroken Litany, Contagion) and last longer, which makes it the one build
// whose damage is entirely indifferent to whether anybody is watching.
//
// The original warlock tree, extended from 40 ranks to 60. Every `aff_` id predates
// this pass and is preserved so a shipped save's points land back where they were put.
// Three nodes were also repaired: `aff_fel_concentration` claimed "+6% DoT damage" while
// granting flat shadow damage, `aff_imp_weakness` claimed to reduce enemy attack DAMAGE
// while reducing attack speed, and `aff_dark_pact` described an imp familiar that did
// not exist anywhere in the engine. The imp now lives in The Binding, where it is real.
export const BLEAKWEAVE_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
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
    description: 'Sets the Rot upon your target, dealing {n} shadow damage per rank.',
    icon: '☠',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'shadow_dot', valuePerRank: 3 }],
  },
  {
    id: 'aff_imp_weakness',
    name: 'Dirge of Faltering',
    description: 'Enemies attack {n}% slower per rank.',
    icon: '🕸',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.03 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'aff_drain_soul',
    name: 'Last Gleaning',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '👻',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 2 }],
  },
  {
    id: 'aff_life_tap',
    name: 'Blood Toll',
    description: 'Increases intellect by {n} per rank.',
    icon: '❤',
    row: 2, col: 2, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 4 }],
  },
  {
    id: 'aff_imp_agony',
    name: 'Dirge of Anguish',
    description: 'Sets the Dirge of Anguish upon your target — ramping shadow damage that never lets up.',
    icon: '🩸',
    row: 2, col: 3, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'curse_of_agony', valuePerRank: 1 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'aff_fel_concentration',
    name: 'Unbroken Litany',
    description: 'Every lingering effect you own ticks {n}% harder per rank.',
    icon: '🧘',
    row: 3, col: 1, maxRanks: 5, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.05 }],
  },
  {
    id: 'aff_amplify_curse',
    name: 'Swelling Refrain',
    description: 'Every 30 seconds, your next curse or rot deals half again its damage.',
    icon: '📣',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'amplify_curse', valuePerRank: 1 }],
  },
  {
    id: 'aff_grim_reach',
    name: 'Far Lament',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '👁',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 3 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'aff_dark_pact',
    name: 'Bleak Bargain',
    description: 'You trade something you will miss later. Increases weapon DPS by {n}.',
    icon: '🤝',
    row: 4, col: 1, maxRanks: 1, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 8 }],
  },
  {
    id: 'aff_curse_exhaustion',
    name: 'Dirge of Weariness',
    description: 'Enemies attack a further {n}% slower.',
    icon: '🕸',
    row: 4, col: 2, maxRanks: 1, requiresPoints: 15,
    requires: 'aff_imp_weakness',
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.08 }],
  },
  {
    id: 'aff_drain_life',
    name: 'Lifedraw',
    description: 'Increases lifesteal by {n}% per rank. Shadow drains vitality as it goes.',
    icon: '🩸',
    row: 4, col: 3, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'lifesteal', valuePerRank: 0.02 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'aff_imp_exhaustion',
    name: 'Harrowing Grip',
    description: 'Enemies attack a further {n}% slower per rank.',
    icon: '🕸',
    row: 5, col: 1, maxRanks: 4, requiresPoints: 20,
    requires: 'aff_curse_exhaustion',
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.04 }],
  },
  {
    id: 'aff_nightfall',
    name: 'Gathering Dark',
    description: 'Each tick of rot has a {n}% chance per rank to loose an Umbral Bolt on its own.',
    icon: '🌙',
    row: 5, col: 2, maxRanks: 2, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'nightfall', valuePerRank: 0.02 }],
  },
  {
    id: 'aff_shadow_mastery',
    name: 'Shadow Mastery',
    description: 'Increases all damage by {n}% per rank.',
    icon: '🌑',
    row: 5, col: 3, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'aff_siphon_life',
    name: 'Tithe of Wounds',
    description: 'Every third second in combat, the wounds you have opened pay you {n} health.',
    icon: '💚',
    row: 6, col: 2, maxRanks: 1, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'siphon_life', valuePerRank: 15 }],
  },
  {
    id: 'aff_contagion',
    name: 'Contagion',
    description: 'Every lingering effect ticks a further {n}% harder per rank.',
    icon: '☠',
    row: 6, col: 1, maxRanks: 4, requiresPoints: 25,
    requires: 'aff_fel_concentration',
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.07 }],
  },
  {
    id: 'aff_umbral_mastery',
    name: 'Umbral Mastery',
    description: 'Umbral Bolt lands {n}% harder per rank and is shaped more quickly.',
    icon: '🌙',
    row: 6, col: 3, maxRanks: 3, requiresPoints: 25,
    effects: [
      { type: 'ability', ability: 'warlock_shadow_bolt', mod: 'damage', valuePerRank: 0.22,
        note: 'Umbral Mastery: impact increased' },
      { type: 'ability', ability: 'warlock_shadow_bolt', mod: 'castTime', valuePerRank: 0.15,
        note: 'Umbral Mastery: cast time reduced' },
    ],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'aff_everlasting_affliction',
    name: 'Everlasting Affliction',
    description: 'Your rots refuse to lift — a further {n}% damage from every one, per rank.',
    icon: '☠',
    row: 7, col: 1, maxRanks: 4, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.06 }],
  },
  {
    id: 'aff_unstable_affliction',
    name: 'Unstable Affliction',
    description: 'The dark gathers constantly, and Umbral Bolt is never far away.',
    icon: '🌙',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'aff_umbral_mastery',
    effects: [
      { type: 'mechanic', mechanic: 'nightfall', valuePerRank: 0.06 },
      { type: 'ability', ability: 'warlock_shadow_bolt', mod: 'cooldown', valuePerRank: 0.45,
        note: 'Unstable Affliction: cooldown slashed' },
    ],
  },
]

export const BLEAKWEAVE_CONNECTORS: [string, string][] = [
  ['aff_imp_weakness',      'aff_curse_exhaustion'],
  ['aff_curse_exhaustion',  'aff_imp_exhaustion'],
  ['aff_fel_concentration', 'aff_contagion'],
  ['aff_umbral_mastery',    'aff_unstable_affliction'],
]
