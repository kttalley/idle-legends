import type { TalentNodeDef } from '../../types'

// ── Rogue ── Gutterwork ──────────────────────────────────────────────────────
// Fast hands, cheap tricks, no witnesses. No poison, no patience, no plan beyond the
// next four seconds.
//
// Shadowed Edge stacks something and waits for it to mature; Gutterwork does not wait
// for anything. Its whole payload is on-hit — extra swings, counterattacks, avoidance
// that turns into openings — so it is the tree with the highest number of dice rolls
// per minute and the least interest in what any single one of them does. That makes it
// the steadiest rogue in a long unattended stretch and the least explosive in a short
// watched one.
export const GUTTERWORK_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'gut_lightning_reflexes',
    name: 'Lightning Reflexes',
    description: 'Increases agility by {n} per rank.',
    icon: '⚡',
    row: 1, col: 1, maxRanks: 4, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'agility', valuePerRank: 3 }],
  },
  {
    id: 'gut_dirty_tricks',
    name: 'Dirty Tricks',
    description: 'Each swing has a {n}% chance per rank to land a second time.',
    icon: '🗡',
    row: 1, col: 2, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'extra_strike', valuePerRank: 0.02 }],
  },
  {
    id: 'gut_improved_gouge',
    name: 'Gouge',
    description: 'Enemies you have opened up attack {n}% slower per rank.',
    icon: '💥',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.04 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'gut_riposte',
    name: 'Riposte',
    description: 'Returns {n}% of the damage you take straight back down the blade, per rank.',
    icon: '⚔',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'thorns', valuePerRank: 0.05 }],
  },
  {
    id: 'gut_adrenaline',
    name: 'Adrenaline',
    description: 'Attack {n}% faster per rank.',
    icon: '⚡',
    row: 2, col: 2, maxRanks: 5, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'attack_haste', valuePerRank: 0.015 }],
  },
  {
    id: 'gut_footwork',
    name: 'Footwork',
    description: 'Gives you a {n}% chance per rank to sidestep a blow entirely.',
    icon: '💨',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'avoid_chance', valuePerRank: 0.03 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'gut_precision',
    name: 'Precision',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '🎯',
    row: 3, col: 1, maxRanks: 4, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.01 }],
  },
  {
    id: 'gut_dual_wield_spec',
    name: 'Dual Wield Specialization',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '⚔',
    row: 3, col: 2, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 3 }],
  },
  {
    id: 'gut_opportunity',
    name: 'Opportunity',
    description: 'A further {n}% chance per rank that a swing lands twice.',
    icon: '🗡',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    requires: 'gut_dirty_tricks',
    effects: [{ type: 'mechanic', mechanic: 'extra_strike', valuePerRank: 0.02 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'gut_blade_flurry',
    name: 'Blade Flurry',
    description: 'Critical strikes carry through — {n}% chance per rank to strike again at once.',
    icon: '✨',
    row: 4, col: 1, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'flurry', valuePerRank: 0.08 }],
  },
  {
    id: 'gut_slip_the_blade_mastery',
    name: 'Slip the Blade',
    description: 'Slip the Blade returns {n}% sooner per rank and leaves you quicker on your feet.',
    icon: '💨',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    effects: [
      { type: 'ability', ability: 'rogue_evasion', mod: 'cooldown', valuePerRank: 0.14,
        note: 'Slip the Blade: cooldown reduced' },
      { type: 'ability', ability: 'rogue_evasion', mod: 'rider', valuePerRank: 1,
        rider: { type: 'speed_buff', value: 0.15, durationSeconds: 10 },
        note: 'Slip the Blade: also hastens your swings' },
    ],
  },
  {
    id: 'gut_endurance',
    name: 'Endurance',
    description: 'Increases stamina by {n} per rank.',
    icon: '💪',
    row: 4, col: 3, maxRanks: 2, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 6 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'gut_aggression',
    name: 'Aggression',
    description: 'Increases all damage by {n}% per rank.',
    icon: '🔪',
    row: 5, col: 1, maxRanks: 4, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },
  {
    id: 'gut_close_quarters',
    name: 'Close Quarters',
    description: 'Increases critical strike damage bonus by {n}% per rank.',
    icon: '⚔',
    row: 5, col: 2, maxRanks: 3, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.10 }],
  },
  {
    id: 'gut_nimble',
    name: 'Nimble',
    description: 'A further {n}% chance per rank to slip a blow entirely.',
    icon: '💨',
    row: 5, col: 3, maxRanks: 3, requiresPoints: 20,
    requires: 'gut_footwork',
    effects: [{ type: 'mechanic', mechanic: 'avoid_chance', valuePerRank: 0.025 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'gut_weapon_expertise',
    name: 'Weapon Expertise',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '⚔',
    row: 6, col: 1, maxRanks: 2, requiresPoints: 25,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 5 }],
  },
  {
    id: 'gut_counterattack',
    name: 'Counterattack',
    description: 'Returns a further {n}% of damage taken, per rank.',
    icon: '⚔',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    requires: 'gut_riposte',
    effects: [{ type: 'mechanic', mechanic: 'thorns', valuePerRank: 0.05 }],
  },
  {
    id: 'gut_second_wind',
    name: 'Cheap Shot to the Ribs',
    description: 'Below half health you recover {n} HP per second per rank.',
    icon: '💚',
    row: 6, col: 3, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'second_wind', valuePerRank: 2 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'gut_surprise_attacks',
    name: 'Surprise Attacks',
    description: 'Attack a further {n}% faster per rank.',
    icon: '⚡',
    row: 7, col: 1, maxRanks: 3, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'attack_haste', valuePerRank: 0.02 }],
  },
  {
    id: 'gut_adrenaline_rush',
    name: 'Adrenaline Rush',
    description: 'Every kill leaves your hands faster for the next one, and nothing you start ends slowly.',
    icon: '⚡',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    effects: [
      { type: 'mechanic', mechanic: 'rampage', valuePerRank: 1 },
      { type: 'mechanic', mechanic: 'extra_strike', valuePerRank: 0.05 },
    ],
  },
]

export const GUTTERWORK_CONNECTORS: [string, string][] = [
  ['gut_dirty_tricks', 'gut_opportunity'],
  ['gut_footwork',     'gut_nimble'],
  ['gut_riposte',      'gut_counterattack'],
]
