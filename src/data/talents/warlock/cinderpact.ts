import type { TalentNodeDef } from '../../types'

// ── Warlock ── Cinderpact ────────────────────────────────────────────────────
// Borrowed fire, ruinous interest.
//
// Bleakweave applies damage and waits; The Binding delegates it. Cinderpact simply
// spends — everything here is direct, immediate and expensive, and the whole tree is
// built around a single number going up: the size of one hit.
//
// It shares the fire loop with the mage's Emberwright (crits ignite, burning targets
// crit more) but takes it somewhere else entirely: where the mage compounds the burn,
// the warlock uses it as a condition, and cashes the whole thing out through Bleak
// Bargain. The trade is that it is the most fragile spec in the game — no mitigation
// worth the name, and its only sustain is that things tend to already be dead.
export const CINDERPACT_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'cin_improved_shadow_bolt',
    name: 'Borrowed Flame',
    description: 'Increases all damage by {n}% per rank.',
    icon: '🔥',
    row: 1, col: 1, maxRanks: 4, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.03 }],
  },
  {
    id: 'cin_cataclysm',
    name: 'Ruinfall',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '✨',
    row: 1, col: 2, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.03 }],
  },
  {
    id: 'cin_bane',
    name: 'Hastened Word',
    description: 'Reduces attack interval by {n}s per rank.',
    icon: '⏳',
    row: 1, col: 3, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'attackSpeedSeconds', valuePerRank: -0.07 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'cin_devastation',
    name: 'Devastating Terms',
    description: 'Increases critical strike damage bonus by {n}% per rank.',
    icon: '💥',
    row: 2, col: 1, maxRanks: 4, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.10 }],
  },
  {
    id: 'cin_immolate',
    name: 'Slow Burn',
    description: 'Your critical strikes set the target alight for {n}% weapon damage per second, per rank.',
    icon: '🔥',
    row: 2, col: 2, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'ignite', valuePerRank: 0.16 }],
  },
  {
    id: 'cin_intensity',
    name: 'Unflinching',
    description: 'Increases intellect by {n} per rank.',
    icon: '🔮',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 4 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'cin_conflagrate',
    name: 'Fan the Flames',
    description: 'Increases crit chance against burning targets by {n}% per rank.',
    icon: '👁',
    row: 3, col: 1, maxRanks: 5, requiresPoints: 10,
    requires: 'cin_immolate',
    effects: [{ type: 'mechanic', mechanic: 'burning_crit', valuePerRank: 0.06 }],
  },
  {
    id: 'cin_destructive_reach',
    name: 'Far Ruin',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '☄',
    row: 3, col: 2, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 4 }],
  },
  {
    id: 'cin_pyroclasm',
    name: 'Cinderfall',
    description: 'Every burn you own bites {n}% deeper per rank.',
    icon: '🌋',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.07 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'cin_ruin',
    name: 'Total Loss',
    description: 'Increases critical strike damage bonus by a further {n}% per rank.',
    icon: '💥',
    row: 4, col: 1, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.14 }],
  },
  {
    id: 'cin_bargain_mastery',
    name: 'The Bargain Struck',
    description: 'Bleak Bargain returns {n}% sooner per rank and cuts deeper.',
    icon: '🤝',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    effects: [
      { type: 'ability', ability: 'warlock_dark_pact', mod: 'cooldown', valuePerRank: 0.13,
        note: 'The Bargain Struck: cooldown reduced' },
      { type: 'ability', ability: 'warlock_dark_pact', mod: 'damage', valuePerRank: 0.20,
        note: 'The Bargain Struck: amplification deepened' },
    ],
  },
  {
    id: 'cin_backlash',
    name: 'The Price',
    description: 'Every 35 seconds, your next attack is a guaranteed critical strike.',
    icon: '⚡',
    row: 4, col: 3, maxRanks: 1, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'timed_crit', valuePerRank: 1 / 35 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'cin_emberstorm',
    name: 'Ashfall',
    description: 'Increases all damage by a further {n}% per rank.',
    icon: '🌋',
    row: 5, col: 1, maxRanks: 4, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.035 }],
  },
  {
    id: 'cin_soul_leech',
    name: 'Skimmed Tithe',
    description: 'Returns {n}% of the damage you deal as health, per rank.',
    icon: '💚',
    row: 5, col: 2, maxRanks: 3, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'bloodthirst', valuePerRank: 0.02 }],
  },
  {
    id: 'cin_shadowburn',
    name: 'Cinderstrike',
    description: 'Deal {n}% more damage per rank to enemies below a third of their health.',
    icon: '☄',
    row: 5, col: 3, maxRanks: 3, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'executioner', valuePerRank: 0.13 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'cin_fire_and_brimstone',
    name: 'Everything Burns',
    description: 'Sets targets alight for a further {n}% weapon damage per second, per rank.',
    icon: '🔥',
    row: 6, col: 3, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'ignite', valuePerRank: 0.12 }],
  },
  {
    id: 'cin_nether_protection',
    name: 'Warded Bargain',
    description: 'Reduces all damage taken by {n}% per rank.',
    icon: '🛡',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.02 }],
  },
  {
    id: 'cin_burning_intent',
    name: 'Burning Intent',
    description: 'Increases crit chance against burning targets by a further {n}% per rank.',
    icon: '👁',
    row: 6, col: 1, maxRanks: 3, requiresPoints: 25,
    requires: 'cin_conflagrate',
    effects: [{ type: 'mechanic', mechanic: 'burning_crit', valuePerRank: 0.05 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'cin_chaos_bolt',
    name: 'Ruinbolt',
    description: 'Increases critical strike damage bonus by a further {n}% per rank.',
    icon: '💥',
    row: 7, col: 1, maxRanks: 3, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.16 }],
  },
  {
    id: 'cin_cinderpact',
    name: 'Cinderpact',
    description: 'The interest comes due on everything at once. Bleak Bargain is nearly always ready, and everything burns.',
    icon: '🌋',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'cin_bargain_mastery',
    effects: [
      { type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.30 },
      { type: 'ability', ability: 'warlock_dark_pact', mod: 'cooldown', valuePerRank: 0.45,
        note: 'Cinderpact: cooldown slashed' },
      // "and everything burns" has been in this description the whole time while the
      // effect list burned exactly one target. Bleak Bargain now carries to the crowd.
      { type: 'ability', ability: 'warlock_dark_pact', mod: 'rider', valuePerRank: 1,
        rider: { type: 'splash', value: 0.50, stacks: 1 },
        note: 'Everything near you burns for 50% of the blow' },
    ],
  },
]

export const CINDERPACT_CONNECTORS: [string, string][] = [
  ['cin_immolate',       'cin_conflagrate'],
  ['cin_conflagrate',    'cin_burning_intent'],
  ['cin_bargain_mastery', 'cin_cinderpact'],
]
