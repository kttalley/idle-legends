import type { TalentNodeDef } from '../../types'

// ── Mage ── The Unwritten ────────────────────────────────────────────────────
// Arcane debt, called in all at once. Where frost controls and fire compounds, this
// tree BANKS: charges build while you keep swinging at the same target and pay out on
// every hit, and they are lost the moment that target dies. It is the only build in the
// game that would rather fight one large thing than five small ones.
//
// Its second half is Echo — an active ability resolving twice, at full strength, for
// free. That is why the tree also buys cooldown reduction and cast speed: the value of
// a coin-flip second cast scales with how often you get to flip.
export const THE_UNWRITTEN_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'unw_arcane_focus',
    name: 'Arcane Focus',
    description: 'Increases intellect by {n} per rank.',
    icon: '🔮',
    row: 1, col: 1, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 3 }],
  },
  {
    id: 'unw_arcane_charge',
    name: 'Gathering Debt',
    description: 'Each strike against a target banks a charge: +{n}% damage per charge, per rank, up to eight.',
    icon: '🔮',
    row: 1, col: 2, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'arcane_charge', valuePerRank: 0.01 }],
  },
  {
    id: 'unw_wand_specialization',
    name: 'Wand Specialization',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '✨',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 2 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'unw_magic_absorption',
    name: 'Magic Absorption',
    description: 'Each fight begins with a ward worth {n} damage.',
    icon: '🛡',
    row: 2, col: 1, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'absorb_shield', valuePerRank: 40 }],
  },
  {
    id: 'unw_arcane_concentration',
    name: 'Arcane Concentration',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '✨',
    row: 2, col: 2, maxRanks: 5, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.012 }],
  },
  {
    id: 'unw_improved_mana_shield',
    name: 'Borrowed Time',
    description: 'Reduces attack interval by {n}s per rank.',
    icon: '⏳',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.06 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'unw_arcane_impact',
    name: 'Arcane Impact',
    description: 'Increases critical strike damage bonus by {n}% per rank.',
    icon: '💥',
    row: 3, col: 1, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.14 }],
  },
  {
    id: 'unw_presence_of_mind',
    name: 'Presence of Mind',
    description: 'Every 40 seconds, your next attack is a guaranteed critical strike.',
    icon: '⏳',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'timed_crit', valuePerRank: 1 / 40 }],
  },
  {
    id: 'unw_compounding',
    name: 'Compounding Interest',
    description: 'Each banked charge is worth a further {n}% damage, per rank.',
    icon: '🔮',
    row: 3, col: 3, maxRanks: 5, requiresPoints: 10,
    requires: 'unw_arcane_charge',
    effects: [{ type: 'mechanic', mechanic: 'arcane_charge', valuePerRank: 0.008 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'unw_echo',
    name: 'Echo',
    description: 'Your abilities have a {n}% chance per rank to resolve a second time, for free.',
    icon: '⏳',
    row: 4, col: 1, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'echo_chance', valuePerRank: 0.04 }],
  },
  {
    id: 'unw_arcane_meditation',
    name: 'Arcane Meditation',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '🔮',
    row: 4, col: 2, maxRanks: 2, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 4 }],
  },
  {
    id: 'unw_prismatic_ward',
    name: 'Prismatic Ward',
    description: 'Reduces all damage taken by {n}% per rank.',
    icon: '🛡',
    row: 4, col: 3, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.025 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'unw_arcane_mind',
    name: 'Arcane Mind',
    description: 'Increases intellect by {n} per rank.',
    icon: '🔮',
    row: 5, col: 1, maxRanks: 3, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 6 }],
  },
  {
    id: 'unw_hour_mastery',
    name: 'The Hour Rewritten',
    description: 'The Unwound Hour returns {n}% sooner per rank and runs longer.',
    icon: '⏳',
    row: 5, col: 2, maxRanks: 3, requiresPoints: 20,
    effects: [
      { type: 'ability', ability: 'mage_time_warp', mod: 'cooldown', valuePerRank: 0.12,
        note: 'The Hour Rewritten: cooldown reduced' },
      { type: 'ability', ability: 'mage_time_warp', mod: 'damage', valuePerRank: 0.15,
        note: 'The Hour Rewritten: haste deepened' },
    ],
  },
  {
    id: 'unw_spell_power',
    name: 'Spell Power',
    description: 'Increases all damage by {n}% per rank.',
    icon: '✨',
    row: 5, col: 3, maxRanks: 4, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'unw_resonance',
    name: 'Resonance',
    description: 'Your abilities echo a further {n}% of the time, per rank.',
    icon: '⏳',
    row: 6, col: 1, maxRanks: 3, requiresPoints: 25,
    requires: 'unw_echo',
    effects: [{ type: 'mechanic', mechanic: 'echo_chance', valuePerRank: 0.05 }],
  },
  {
    id: 'unw_mind_mastery',
    name: 'Mind Mastery',
    description: 'Increases critical strike damage bonus by a further {n}% per rank.',
    icon: '💥',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.12 }],
  },
  {
    id: 'unw_temporal_shield',
    name: 'Temporal Shield',
    description: 'Once per fight, a killing blow is simply undone — you stand at a fifth health.',
    icon: '🛡',
    row: 6, col: 3, maxRanks: 1, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'last_stand', valuePerRank: 0.20 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'unw_arcane_power',
    name: 'Arcane Power',
    description: 'Increases all damage by a further {n}% per rank.',
    icon: '🔮',
    row: 7, col: 1, maxRanks: 3, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.025 }],
  },
  {
    id: 'unw_the_unwritten',
    name: 'The Unwritten Hour',
    description: 'Every debt comes due at once: charges bank far faster, and The Unwound Hour is nearly always ready.',
    icon: '⏳',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'unw_resonance',
    effects: [
      { type: 'mechanic', mechanic: 'arcane_charge', valuePerRank: 0.02 },
      { type: 'ability', ability: 'mage_time_warp', mod: 'cooldown', valuePerRank: 0.40,
        note: 'The Unwritten Hour: cooldown slashed' },
    ],
  },
]

export const THE_UNWRITTEN_CONNECTORS: [string, string][] = [
  ['unw_arcane_charge', 'unw_compounding'],
  ['unw_echo',          'unw_resonance'],
  ['unw_resonance',     'unw_the_unwritten'],
]
