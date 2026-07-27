import type { TalentNodeDef } from '../../types'

// ── Mage ── Emberwright ──────────────────────────────────────────────────────
// Glacial Rite's opposite number. Frost wins by making sure the fight never really
// starts; fire wins by making sure it never really stops — everything it lands leaves
// something behind that keeps burning after the caster has moved on.
//
// The engine of the tree is the Ignite loop, and it is deliberately circular: crits
// light the target, a burning target is easier to crit (Kindled Eye), and every burn
// you own ticks harder (Wildfire). Invest in one corner and the other two get better on
// their own. That makes it the only mage tree whose damage compounds over a LONG fight,
// which is the trade against frost — frost is better against something that would have
// killed you, fire is better against everything else.
export const EMBERWRIGHT_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'emb_kindling',
    name: 'Kindling',
    description: 'Increases intellect by {n} per rank.',
    icon: '🔥',
    row: 1, col: 1, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'intellect', valuePerRank: 3 }],
  },
  {
    id: 'emb_ignite',
    name: 'Ignite',
    description: 'Your critical strikes set the target alight, burning for {n}% weapon damage per second.',
    icon: '🔥',
    row: 1, col: 2, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'ignite', valuePerRank: 0.10 }],
  },
  {
    id: 'emb_incineration',
    name: 'Incineration',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '✨',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.02 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'emb_flame_throwing',
    name: 'Flame Throwing',
    description: 'Increases all damage by {n}% per rank.',
    icon: '🌋',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },
  {
    id: 'emb_kindled_eye',
    name: 'Kindled Eye',
    description: 'Increases crit chance against burning targets by {n}% per rank.',
    icon: '👁',
    row: 2, col: 2, maxRanks: 5, requiresPoints: 5,
    requires: 'emb_ignite',
    effects: [{ type: 'mechanic', mechanic: 'burning_crit', valuePerRank: 0.06 }],
  },
  {
    id: 'emb_cauterize',
    name: 'Cauterize',
    description: 'Your own flames close your wounds — increases stamina by {n} per rank.',
    icon: '💚',
    row: 2, col: 3, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 5 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'emb_wildfire',
    name: 'Wildfire',
    description: 'Every burn, bleed and poison you own ticks {n}% harder per rank.',
    icon: '🌋',
    row: 3, col: 1, maxRanks: 5, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.08 }],
  },
  {
    id: 'emb_master_of_flame',
    name: 'Master of Flame',
    description: 'Increases critical strike damage bonus by {n}% per rank.',
    icon: '💥',
    row: 3, col: 2, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.12 }],
  },
  {
    id: 'emb_blast_wave',
    name: 'Blast Wave',
    description: 'The heat staggers what it touches — enemies attack {n}% slower per rank.',
    icon: '💥',
    row: 3, col: 3, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.05 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'emb_conflagrate',
    name: 'Conflagrate',
    description: 'Your fires burn hotter still — {n}% more damage from every lingering effect, per rank.',
    icon: '🔥',
    row: 4, col: 1, maxRanks: 3, requiresPoints: 15,
    requires: 'emb_wildfire',
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.10 }],
  },
  {
    id: 'emb_cinderburst_mastery',
    name: 'Cinderburst Mastery',
    description: 'Cinderburst returns {n}% sooner per rank and burns what it touches.',
    icon: '💥',
    row: 4, col: 2, maxRanks: 3, requiresPoints: 15,
    effects: [
      { type: 'ability', ability: 'mage_combustion', mod: 'cooldown', valuePerRank: 0.12,
        note: 'Cinderburst Mastery: cooldown reduced' },
      { type: 'ability', ability: 'mage_combustion', mod: 'damage', valuePerRank: 0.20,
        note: 'Cinderburst Mastery: guaranteed crits hit harder' },
    ],
  },
  {
    id: 'emb_burning_soul',
    name: 'Burning Soul',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '🌋',
    row: 4, col: 3, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 3 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'emb_pyroclasm',
    name: 'Pyroclasm',
    description: 'Increases all damage by a further {n}% per rank.',
    icon: '🌋',
    row: 5, col: 1, maxRanks: 4, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },
  {
    id: 'emb_immolation',
    name: 'Immolation',
    description: 'Heat rolls off you in sheets, returning {n}% of damage taken, per rank.',
    icon: '🔥',
    row: 5, col: 2, maxRanks: 2, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'thorns', valuePerRank: 0.06 }],
  },
  {
    id: 'emb_searing_touch',
    name: 'Searing Touch',
    description: 'Deal {n}% more damage per rank to enemies below a third of their health.',
    icon: '☄',
    row: 5, col: 3, maxRanks: 2, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'executioner', valuePerRank: 0.12 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'emb_fire_power',
    name: 'Fire Power',
    description: 'Sets targets alight for a further {n}% weapon damage per second, per rank.',
    icon: '🔥',
    row: 6, col: 1, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'ignite', valuePerRank: 0.12 }],
  },
  {
    id: 'emb_molten_skin',
    name: 'Molten Skin',
    description: 'Reduces all damage taken by {n}% per rank.',
    icon: '🛡',
    row: 6, col: 3, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.02 }],
  },
  {
    id: 'emb_combustion',
    name: 'Combustion',
    description: 'Increases crit chance against burning targets by a further {n}% per rank.',
    icon: '👁',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    requires: 'emb_kindled_eye',
    effects: [{ type: 'mechanic', mechanic: 'burning_crit', valuePerRank: 0.05 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'emb_living_bomb',
    name: 'Living Bomb',
    description: 'Increases critical strike damage bonus by a further {n}% per rank.',
    icon: '☄',
    row: 7, col: 1, maxRanks: 3, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.15 }],
  },
  {
    id: 'emb_phoenix',
    name: 'Rise from Ash',
    description: 'Once per fight, a killing blow leaves you standing in the embers at a third health.',
    icon: '☄',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'last_stand', valuePerRank: 0.33 }],
  },
]

export const EMBERWRIGHT_CONNECTORS: [string, string][] = [
  ['emb_ignite',      'emb_kindled_eye'],
  ['emb_wildfire',    'emb_conflagrate'],
  ['emb_kindled_eye', 'emb_combustion'],
]
