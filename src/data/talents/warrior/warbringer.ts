import type { TalentNodeDef } from '../../types'

// ── Warrior ── Warbringer ────────────────────────────────────────────────────
// Two weapons, no shield, no patience. Ironcleave's exact inverse: swings per second
// over damage per swing, and everything here compounds off swing COUNT — flurry,
// on-hit procs, crit chains, health drawn back out of damage dealt.
//
// The wager is legible: it is the only warrior tree with no damage reduction in it at
// all, and the only one that heals from attacking. It stays alive by killing faster
// than it bleeds, which makes it fragile in a zone it has out-levelled itself into and
// devastating in one it has not.
export const WARBRINGER_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'wbr_cruelty',
    name: "Butcher's Eye",
    description: 'Increases crit chance by {n}% per rank.',
    icon: '🗡',
    row: 1, col: 1, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.01 }],
  },
  {
    id: 'wbr_booming_voice',
    name: 'Voice Like Thunder',
    description: 'Increases stamina by {n} per rank.',
    icon: '📣',
    row: 1, col: 2, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 4 }],
  },
  {
    id: 'wbr_frenzy',
    name: 'Bloodfever',
    description: 'Attack {n}% faster per rank.',
    icon: '⚡',
    row: 1, col: 3, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'attack_haste', valuePerRank: 0.02 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'wbr_unbridled_wrath',
    name: 'Wrath Unspent',
    description: 'Attack a further {n}% faster per rank.',
    icon: '⚡',
    row: 2, col: 1, maxRanks: 5, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'attack_haste', valuePerRank: 0.015 }],
  },
  {
    id: 'wbr_piercing_howl',
    name: 'Wailing Note',
    description: 'Reduces enemy attack speed by {n}% per rank.',
    icon: '💥',
    row: 2, col: 2, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.04 }],
  },
  {
    id: 'wbr_blood_craze',
    name: 'Craving',
    description: 'Returns {n}% of the damage you deal to you as health, per rank.',
    icon: '🩸',
    row: 2, col: 3, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'bloodthirst', valuePerRank: 0.02 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'wbr_flurry',
    name: 'Rain of Blows',
    description: 'Critical strikes send you into a flurry — {n}% chance per rank to strike again at once.',
    icon: '✨',
    row: 3, col: 1, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'flurry', valuePerRank: 0.08 }],
  },
  {
    id: 'wbr_enrage',
    name: 'Seeing Red',
    description: 'Below a third health you deal {n}% more damage per rank.',
    icon: '🔥',
    row: 3, col: 2, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'enrage', valuePerRank: 0.10 }],
  },
  {
    id: 'wbr_savage_blows',
    name: 'Savage Blows',
    description: 'Increases critical hit damage bonus by 25%.',
    icon: '🗡',
    row: 3, col: 3, maxRanks: 1, requiresPoints: 10,
    requires: 'wbr_cruelty',
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.25 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'wbr_dual_wield_spec',
    name: 'Two Blades',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '⚔',
    row: 4, col: 1, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 3 }],
  },
  {
    id: 'wbr_bloodthirst',
    name: 'Vein-Seeker',
    description: 'Red Harvest drinks {n}% deeper per rank and returns faster.',
    icon: '🩸',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    effects: [
      { type: 'ability', ability: 'warrior_bloodthirst', mod: 'damage', valuePerRank: 0.25,
        note: 'Vein-Seeker: lifesteal deepened' },
      { type: 'ability', ability: 'warrior_bloodthirst', mod: 'cooldown', valuePerRank: 0.10,
        note: 'Vein-Seeker: cooldown reduced' },
    ],
  },
  {
    id: 'wbr_death_wish',
    name: 'Nothing to Lose',
    description: 'Deal a further {n}% damage per rank while enraged.',
    icon: '🔥',
    row: 4, col: 3, maxRanks: 2, requiresPoints: 15,
    requires: 'wbr_enrage',
    effects: [{ type: 'mechanic', mechanic: 'enrage', valuePerRank: 0.12 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'wbr_improved_slam',
    name: 'Heavy Follow-Through',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '⚔',
    row: 5, col: 1, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 4 }],
  },
  {
    id: 'wbr_rampage',
    name: 'The Rout',
    description: 'Every kill leaves you faster and angrier for the next one.',
    icon: '🔥',
    row: 5, col: 2, maxRanks: 1, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'rampage', valuePerRank: 1 }],
  },
  {
    id: 'wbr_precision',
    name: 'Sure Hand',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '🗡',
    row: 5, col: 3, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.008 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'wbr_bloodsurge',
    name: 'Sudden Opening',
    description: 'Returns a further {n}% of damage dealt as health, per rank.',
    icon: '🩸',
    row: 6, col: 3, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'bloodthirst', valuePerRank: 0.025 }],
  },
  {
    id: 'wbr_titans_grip',
    name: 'Both Hands Full',
    description: 'Increases critical hit damage bonus by {n}% per rank.',
    icon: '💪',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.10 }],
  },
  {
    id: 'wbr_endless_rage',
    name: 'The Long Fury',
    description: 'Your flurries come far more readily.',
    icon: '⚡',
    row: 6, col: 1, maxRanks: 1, requiresPoints: 25,
    requires: 'wbr_flurry',
    effects: [{ type: 'mechanic', mechanic: 'flurry', valuePerRank: 0.12 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'wbr_unquenchable',
    name: 'Unquenchable',
    description: 'Returns a further {n}% of damage dealt as health, per rank.',
    icon: '🩸',
    row: 7, col: 1, maxRanks: 5, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'bloodthirst', valuePerRank: 0.02 }],
  },
  {
    id: 'wbr_reckless_abandon',
    name: 'All In',
    description: 'You are always enraged, and Red Harvest never truly ends.',
    icon: '💀',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'wbr_rampage',
    effects: [
      { type: 'mechanic', mechanic: 'enrage', valuePerRank: 0.15 },
      { type: 'ability', ability: 'warrior_bloodthirst', mod: 'cooldown', valuePerRank: 0.40,
        note: 'All In: cooldown slashed' },
      { type: 'ability', ability: 'warrior_bloodthirst', mod: 'rider', valuePerRank: 1,
        rider: { type: 'speed_buff', value: 0.25, durationSeconds: 10 },
        note: 'All In: also hastens your swings',
      },
    ],
  },
]

export const WARBRINGER_CONNECTORS: [string, string][] = [
  ['wbr_cruelty', 'wbr_savage_blows'],
  ['wbr_enrage',  'wbr_death_wish'],
  ['wbr_flurry',  'wbr_endless_rage'],
  ['wbr_rampage', 'wbr_reckless_abandon'],
]
