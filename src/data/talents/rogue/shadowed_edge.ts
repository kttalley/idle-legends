import type { TalentNodeDef } from '../../types'

// ── Rogue ── Shadowed Edge ───────────────────────────────────────────────────
// The wound is not the point. What is on the blade is the point.
//
// Poisons, combo points and Dead Calm — damage that has already happened by the time it
// is noticed. The tree's engine is Written in Blood: crits bank combo points, five
// points detonate into a Sever, so every crit-chance and crit-damage node in here is
// really buying finisher frequency twice over.
//
// The original rogue tree, extended from 45 ranks to 60. Every `ass_` id predates this
// pass and is preserved so a shipped save's points land back where they were put.
export const SHADOWED_EDGE_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'ass_improved_eviscerate',
    name: 'Vicious Cuts',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '🗡',
    row: 1, col: 1, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 1.5 }],
  },
  {
    id: 'ass_remorseless',
    name: 'Grim Momentum',
    description: 'After a kill, your next attack lands with {n}% more crit chance per rank.',
    icon: '💀',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'remorseless_attacks', valuePerRank: 0.04 }],
  },
  {
    id: 'ass_malice',
    name: 'Ill Intent',
    description: 'Increases critical strike chance by {n}% per rank.',
    icon: '😈',
    row: 1, col: 3, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.01 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'ass_ruthlessness',
    name: 'No Wasted Motion',
    description: 'Reduces attack interval by {n}s per rank.',
    icon: '⚡',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.04 }],
  },
  {
    id: 'ass_murder',
    name: 'Red Work',
    description: 'Increases all damage dealt by {n}% per rank.',
    icon: '🔪',
    row: 2, col: 2, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },
  {
    id: 'ass_slice_dice',
    name: 'Quickened Steel',
    description: 'Reduces attack interval by a further {n}s per rank.',
    icon: '⚔',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.05 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'ass_expose_armor',
    name: 'Find the Seam',
    description: 'Reduces enemy effective armor by {n} per rank.',
    icon: '🎯',
    row: 3, col: 1, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'armor_shred', valuePerRank: 10 }],
  },
  {
    id: 'ass_lethality',
    name: 'Killcraft',
    description: 'Increases critical strike damage bonus by {n}% per rank.',
    icon: '💉',
    row: 3, col: 2, maxRanks: 5, requiresPoints: 10,
    requires: 'ass_malice',
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.06 }],
  },
  {
    id: 'ass_vile_poisons',
    name: 'Bitter Venoms',
    description: 'Attacks apply a poison dealing {n} damage per tick, per rank.',
    icon: '☠',
    row: 3, col: 3, maxRanks: 4, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'poison_potency', valuePerRank: 5 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'ass_improved_poisons',
    name: 'Coated Blades',
    description: 'Increases poison application chance by {n}% per rank.',
    icon: '☠',
    row: 4, col: 1, maxRanks: 4, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'poison_chance', valuePerRank: 0.02 }],
  },
  {
    id: 'ass_cold_blood',
    name: 'Dead Calm',
    description: 'Every 30 seconds, your next attack is a guaranteed critical strike.',
    icon: '🧊',
    row: 4, col: 2, maxRanks: 1, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'timed_crit', valuePerRank: 1 / 30 }],
  },
  {
    id: 'ass_deadened_nerves',
    name: 'Numbwork',
    description: 'Reduces all damage taken by {n}% per rank.',
    icon: '💉',
    row: 4, col: 3, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.02 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'ass_venomous_wounds',
    name: 'Weeping Wounds',
    description: 'Every poison and bleed you own bites {n}% deeper per rank.',
    icon: '☠',
    row: 5, col: 3, maxRanks: 4, requiresPoints: 20,
    requires: 'ass_vile_poisons',
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.08 }],
  },
  {
    id: 'ass_seal_fate',
    name: 'Written in Blood',
    description: 'Critical strikes bank a Combo Point. Five of them detonate into a Sever.',
    icon: '🎴',
    row: 5, col: 2, maxRanks: 5, requiresPoints: 20,
    requires: 'ass_cold_blood',
    effects: [{ type: 'mechanic', mechanic: 'seal_fate', valuePerRank: 1 }],
  },
  {
    id: 'ass_cruel_intent',
    name: 'Cruel Intent',
    description: 'Increases critical strike chance by a further {n}% per rank.',
    icon: '😈',
    row: 5, col: 1, maxRanks: 2, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.012 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'ass_vigor',
    name: 'Deep Reserves',
    description: 'Increases agility by {n} and crit chance by 2%.',
    icon: '⚡',
    row: 6, col: 1, maxRanks: 1, requiresPoints: 25,
    effects: [
      { type: 'stat', stat: 'agility', valuePerRank: 10 },
      { type: 'stat', stat: 'critChance', valuePerRank: 0.02 },
    ],
  },
  {
    id: 'ass_cruel_stroke_mastery',
    name: 'Twice Bitten',
    description: 'Cruel Stroke lands {n}% harder per rank and returns sooner.',
    icon: '🗡',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [
      { type: 'ability', ability: 'rogue_sinister_strike', mod: 'damage', valuePerRank: 0.22,
        note: 'Twice Bitten: impact increased' },
      { type: 'ability', ability: 'rogue_sinister_strike', mod: 'cooldown', valuePerRank: 0.12,
        note: 'Twice Bitten: cooldown reduced' },
    ],
  },
  {
    id: 'ass_master_poisoner',
    name: 'Venomwright',
    description: 'Your venoms deal a further {n} damage per tick, per rank.',
    icon: '☠',
    row: 6, col: 3, maxRanks: 2, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'poison_potency', valuePerRank: 6 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'ass_hunger_for_blood',
    name: 'The Hunger',
    description: 'Returns {n}% of the damage you deal as health, per rank.',
    icon: '💉',
    row: 7, col: 1, maxRanks: 2, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'bloodthirst', valuePerRank: 0.02 }],
  },
  {
    id: 'ass_mutilate',
    name: 'Twin Fangs',
    description: 'Cruel Stroke strikes a third time — and the third finds every throat within reach.',
    icon: '🔪',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'ass_cruel_stroke_mastery',
    effects: [
      { type: 'mechanic', mechanic: 'executioner', valuePerRank: 0.20 },
      { type: 'ability', ability: 'rogue_sinister_strike', mod: 'damage', valuePerRank: 0.50,
        note: 'Twin Fangs: a third blade enters the exchange' },
      // The rogue's answer to a pack. Lighter than the warrior's whirlwind on purpose —
      // this is a single-target class buying a way not to drown, not a new identity.
      { type: 'ability', ability: 'rogue_sinister_strike', mod: 'rider', valuePerRank: 1,
        rider: { type: 'splash', value: 0.40, stacks: 1 },
        note: 'The third blade catches everyone near you for 40%' },
    ],
  },
]

export const SHADOWED_EDGE_CONNECTORS: [string, string][] = [
  ['ass_malice',               'ass_lethality'],
  ['ass_cold_blood',           'ass_seal_fate'],
  ['ass_vile_poisons',         'ass_venomous_wounds'],
  ['ass_cruel_stroke_mastery', 'ass_mutilate'],
]
