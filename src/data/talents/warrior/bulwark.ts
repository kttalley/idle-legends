import type { TalentNodeDef } from '../../types'

// ── Warrior ── Bulwark ───────────────────────────────────────────────────────
// The shield warrior. In a game somebody watches, a tank is a role that needs other
// people to matter; in an idle game it is pure throughput, because the hero fights
// unattended and every death is a respawn timer plus a walk back. Survivability here
// is not a defensive stat — it is UPTIME, and uptime is the only stat that compounds
// while nobody is looking.
//
// So the tree deliberately has no "hold aggro" fiction in it. It buys: damage never
// taken (reduction, block), damage taken and given back (thorns), health returned
// mid-fight (second wind), and one refusal to die (last stand).
export const BULWARK_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'bul_iron_hide',
    name: 'Iron Hide',
    description: 'Increases armor by {n} per rank.',
    icon: '🛡',
    row: 1, col: 1, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'armor', valuePerRank: 6 }],
  },
  {
    id: 'bul_shield_spec',
    name: 'Shield Specialization',
    description: 'Gives your shield a {n}% chance per rank to turn a blow aside entirely.',
    icon: '🛡',
    row: 1, col: 2, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'block_chance', valuePerRank: 0.04 }],
  },
  {
    id: 'bul_toughness',
    name: 'Toughness',
    description: 'Increases stamina by {n} per rank.',
    icon: '💪',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 5 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'bul_anticipation',
    name: 'Anticipation',
    description: 'Reduces all damage taken by {n}% per rank.',
    icon: '🧠',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.02 }],
  },
  {
    id: 'bul_defiance',
    name: 'Defiance',
    description: 'Increases your armor by a further {n}% of its own value per rank.',
    icon: '🛡',
    row: 2, col: 2, maxRanks: 5, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'armor_scaling', valuePerRank: 0.04 }],
  },
  {
    id: 'bul_improved_bash',
    name: 'Shield Bash',
    description: 'Blocked blows stagger the attacker, slowing it by {n}% per rank.',
    icon: '💥',
    row: 2, col: 3, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'mortal_strike', valuePerRank: 0.04 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'bul_second_wind',
    name: 'Second Wind',
    description: 'Below half health you recover {n} HP per second per rank.',
    icon: '💚',
    row: 3, col: 1, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'second_wind', valuePerRank: 2 }],
  },
  {
    id: 'bul_improved_shield_wall',
    name: 'Improved Shield Wall',
    description: 'Hold the Line lasts half again as long and returns sooner.',
    icon: '🛡',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    requires: 'bul_defiance',
    effects: [
      { type: 'ability', ability: 'warrior_shield_wall', mod: 'cooldown', valuePerRank: 0.30,
        note: 'Improved Shield Wall: cooldown reduced' },
      { type: 'ability', ability: 'warrior_shield_wall', mod: 'rider', valuePerRank: 1,
        rider: { type: 'armor_buff', value: 25, durationSeconds: 4 },
        note: 'Improved Shield Wall: protection extended' },
    ],
  },
  {
    id: 'bul_retaliation',
    name: 'Retaliation',
    description: 'Returns {n}% of the damage you take to whatever dealt it, per rank.',
    icon: '⚡',
    row: 3, col: 3, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'thorns', valuePerRank: 0.06 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'bul_bulwark_stance',
    name: 'Bulwark Stance',
    description: 'Reduces all damage taken by a further {n}% per rank.',
    icon: '🛡',
    row: 4, col: 1, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.015 }],
  },
  {
    id: 'bul_spiked_shield',
    name: 'Spiked Shield',
    description: 'Returns a further {n}% of damage taken, per rank.',
    icon: '💥',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    requires: 'bul_retaliation',
    effects: [{ type: 'mechanic', mechanic: 'thorns', valuePerRank: 0.05 }],
  },
  {
    id: 'bul_unyielding',
    name: 'Unyielding',
    description: 'Increases stamina by {n} per rank.',
    icon: '💪',
    row: 4, col: 3, maxRanks: 2, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 8 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'bul_shield_mastery',
    name: 'Shield Mastery',
    description: 'Increases your chance to block by {n}% per rank.',
    icon: '🛡',
    row: 5, col: 1, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'block_chance', valuePerRank: 0.02 }],
  },
  {
    id: 'bul_indomitable',
    name: 'Indomitable',
    description: 'Hold the Line also mends you while it holds.',
    icon: '💚',
    row: 5, col: 2, maxRanks: 1, requiresPoints: 20,
    effects: [{
      type: 'ability', ability: 'warrior_shield_wall', mod: 'rider', valuePerRank: 1,
      rider: { type: 'hot', value: 0.20, durationSeconds: 8 },
      note: 'Indomitable: heals you for 20% of max HP over its duration',
    }],
  },
  {
    id: 'bul_stalwart',
    name: 'Stalwart',
    description: 'Increases armor by {n} per rank.',
    icon: '🛡',
    row: 5, col: 3, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'armor', valuePerRank: 10 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'bul_absorption',
    name: 'Absorption',
    description: 'Reduces all damage taken by a further {n}% per rank.',
    icon: '🛡',
    row: 6, col: 1, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.02 }],
  },
  {
    id: 'bul_vengeance',
    name: 'Vengeance',
    description: 'Blocking and being struck sharpen you — increases weapon DPS by {n} per rank.',
    icon: '⚔',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 4 }],
  },
  {
    id: 'bul_iron_will',
    name: 'Iron Will',
    description: 'Your recovery below half health becomes relentless.',
    icon: '💚',
    row: 6, col: 3, maxRanks: 1, requiresPoints: 25,
    requires: 'bul_second_wind',
    effects: [{ type: 'mechanic', mechanic: 'second_wind', valuePerRank: 4 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'bul_fortress',
    name: 'Fortress',
    description: 'Increases your armor by a further {n}% of its own value per rank.',
    icon: '🛡',
    row: 7, col: 1, maxRanks: 5, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'armor_scaling', valuePerRank: 0.06 }],
  },
  {
    id: 'bul_last_stand',
    name: 'Last Stand',
    description: 'Once per fight, a blow that would kill you leaves you standing at a quarter health instead.',
    icon: '💀',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'last_stand', valuePerRank: 0.25 }],
  },
]

export const BULWARK_CONNECTORS: [string, string][] = [
  ['bul_defiance',     'bul_improved_shield_wall'],
  ['bul_retaliation',  'bul_spiked_shield'],
  ['bul_second_wind',  'bul_iron_will'],
]
