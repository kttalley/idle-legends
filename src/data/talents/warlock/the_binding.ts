import type { TalentNodeDef } from '../../types'

// ── Warlock ── The Binding ───────────────────────────────────────────────────
// Something else does the dying for you.
//
// The only tree in the game whose damage does not come out of the hero at all. A bound
// thing attacks on its own clock — it keeps working through a cast, through a stun,
// through the player closing the tab — and everything here either makes it hit harder
// or keeps its summoner upright long enough to be worth guarding.
//
// That makes it the most purely IDLE build in the game, which is deliberate: it is the
// one spec whose output is genuinely unchanged by whether anybody is at the keyboard,
// and it pays for that by having almost no ceiling when somebody is.
export const THE_BINDING_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'bind_imp',
    name: 'The First Binding',
    description: 'Binds a lesser thing to your service. It attacks for {n} damage per second, per rank.',
    icon: '👹',
    row: 1, col: 1, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'minion_dps', valuePerRank: 1 }],
  },
  {
    id: 'bind_improved_healthstone',
    name: 'Bound Vitality',
    description: 'Increases stamina by {n} per rank.',
    icon: '❤',
    row: 1, col: 2, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 5 }],
  },
  {
    id: 'bind_demonic_embrace',
    name: 'The Held Shape',
    description: 'Increases intellect by {n} per rank.',
    icon: '🤝',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 4 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'bind_fel_intellect',
    name: 'Lent Cunning',
    description: 'Increases intellect by {n} per rank.',
    icon: '🔮',
    row: 2, col: 1, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 4 }],
  },
  {
    id: 'bind_voidwalker',
    name: 'The Second Binding',
    description: 'A larger thing answers. It adds {n} damage per second, per rank.',
    icon: '👹',
    row: 2, col: 2, maxRanks: 4, requiresPoints: 5,
    requires: 'bind_imp',
    effects: [{ type: 'mechanic', mechanic: 'minion_dps', valuePerRank: 1.5 }],
  },
  {
    id: 'bind_soul_link',
    name: 'Shared Thread',
    description: 'What is bound to you takes its share — reduces all damage taken by {n}% per rank.',
    icon: '🤝',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.025 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'bind_fel_stamina',
    name: 'Lent Vigour',
    description: 'Increases stamina by {n} per rank.',
    icon: '💪',
    row: 3, col: 1, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 7 }],
  },
  {
    id: 'bind_master_summoner',
    name: 'Swift Binding',
    description: 'Your bound things strike for a further {n} damage per second, per rank.',
    icon: '👹',
    row: 3, col: 2, maxRanks: 4, requiresPoints: 10,
    requires: 'bind_voidwalker',
    effects: [{ type: 'mechanic', mechanic: 'minion_dps', valuePerRank: 2 }],
  },
  {
    id: 'bind_demonic_aegis',
    name: 'Warded Thread',
    description: 'Each fight begins with a ward worth {n} damage.',
    icon: '🛡',
    row: 3, col: 3, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'absorb_shield', valuePerRank: 50 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'bind_unholy_power',
    name: 'The Deeper Pact',
    description: 'Increases all damage by {n}% per rank.',
    icon: '🌑',
    row: 4, col: 1, maxRanks: 4, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },
  {
    id: 'bind_red_thread_mastery',
    name: 'The Thread Pulled Taut',
    description: 'Red Thread draws {n}% deeper per rank and returns sooner.',
    icon: '❤',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    effects: [
      { type: 'ability', ability: 'warlock_drain_life', mod: 'damage', valuePerRank: 0.25,
        note: 'The Thread Pulled Taut: healing increased' },
      { type: 'ability', ability: 'warlock_drain_life', mod: 'cooldown', valuePerRank: 0.12,
        note: 'The Thread Pulled Taut: cooldown reduced' },
    ],
  },
  {
    id: 'bind_shadow_ward',
    name: 'Umbral Ward',
    description: 'Reduces all damage taken by a further {n}% per rank.',
    icon: '🛡',
    row: 4, col: 3, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.02 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'bind_felguard',
    name: 'The Third Binding',
    description: 'Something that should not have been called. It adds {n} damage per second, per rank.',
    icon: '👹',
    row: 5, col: 1, maxRanks: 4, requiresPoints: 20,
    requires: 'bind_master_summoner',
    effects: [{ type: 'mechanic', mechanic: 'minion_dps', valuePerRank: 3 }],
  },
  {
    id: 'bind_mana_feed',
    name: 'Feeding the Thread',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '🔮',
    row: 5, col: 2, maxRanks: 2, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 4 }],
  },
  {
    id: 'bind_master_conjuror',
    name: 'Practised Hand',
    description: 'Below half health you recover {n} HP per second per rank.',
    icon: '💚',
    row: 5, col: 3, maxRanks: 3, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'second_wind', valuePerRank: 2 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'bind_demonic_knowledge',
    name: 'What It Knows',
    description: 'Increases intellect by {n} per rank.',
    icon: '🔮',
    row: 6, col: 1, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 6 }],
  },
  {
    id: 'bind_demonic_tactics',
    name: 'What It Learns',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '✨',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.012 }],
  },
  {
    id: 'bind_fel_domination',
    name: 'The Short Leash',
    description: 'Returns {n}% of the damage you take to whatever dealt it, per rank.',
    icon: '👹',
    row: 6, col: 3, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'thorns', valuePerRank: 0.05 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'bind_demonic_pact',
    name: 'Terms Renewed',
    description: 'Everything bound to you grows fat on the work — a further {n} damage per second, per rank.',
    icon: '👹',
    row: 7, col: 1, maxRanks: 3, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'minion_dps', valuePerRank: 4 }],
  },
  {
    id: 'bind_metamorphosis',
    name: 'The Turning',
    description: 'You take on something of what you have been calling. Once per fight, death simply declines.',
    icon: '🤝',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    effects: [
      { type: 'mechanic', mechanic: 'last_stand', valuePerRank: 0.30 },
      { type: 'mechanic', mechanic: 'minion_dps', valuePerRank: 5 },
    ],
  },
]

export const THE_BINDING_CONNECTORS: [string, string][] = [
  ['bind_imp',             'bind_voidwalker'],
  ['bind_voidwalker',      'bind_master_summoner'],
  ['bind_master_summoner', 'bind_felguard'],
]
