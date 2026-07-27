import type { TalentNodeDef } from '../../types'

// ── Warrior ── Ironcleave ────────────────────────────────────────────────────
// The two-handed warrior: nothing clever, nothing defensive, just a very large weapon
// swung until the thing in front of it stops. Damage per swing over swings per second —
// its opposite number is Warbringer, which trades exactly the other way.
//
// This tree is the ORIGINAL warrior tree, extended from 48 ranks to 60. Every id here
// was live in shipped saves, so none of them may be renamed: an existing hero's points
// have to land back where they were put. New rows use ids in the same `arms_` family
// for the same reason — a save that reads them tomorrow must not care that they were
// added today.
export const IRONCLEAVE_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'arms_heroic_strike',
    name: 'Iron Strike',
    description: 'Increases weapon DPS by {n} per rank.',
    icon: '⚔',
    row: 1, col: 1, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'weaponDps', valuePerRank: 2 }],
  },
  {
    id: 'arms_deflection',
    name: 'Deflection',
    description: 'Increases armor by {n} per rank.',
    icon: '🛡',
    row: 1, col: 2, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'armor', valuePerRank: 4 }],
  },
  {
    id: 'arms_improved_rend',
    name: 'Serrated Blade',
    description: 'Your critical strikes apply a serrated bleed. Increases bleed damage per rank.',
    icon: '🩸',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'bleed_on_crit', valuePerRank: 0.08 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'arms_imp_charge',
    name: 'Battle Fervor',
    description: 'Increases stamina by {n} per rank.',
    icon: '⚡',
    row: 2, col: 1, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'stamina', valuePerRank: 3 }],
  },
  {
    id: 'arms_tactical_mastery',
    name: "Veteran's Poise",
    description: 'Increases stamina and armor each rank. Grants combat resilience.',
    icon: '🧠',
    row: 2, col: 2, maxRanks: 5, requiresPoints: 5,
    effects: [
      { type: 'stat', stat: 'stamina', valuePerRank: 2 },
      { type: 'stat', stat: 'armor', valuePerRank: 2 },
    ],
  },
  {
    id: 'arms_thunder_clap',
    name: 'Stormpeal',
    description: 'Reduces enemy attack speed by {n}% per rank.',
    icon: '💥',
    row: 2, col: 3, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.05 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'arms_overpower',
    name: 'Overbear',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '💪',
    row: 3, col: 1, maxRanks: 2, requiresPoints: 10,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.025 }],
  },
  {
    id: 'arms_anger_management',
    name: 'Banked Fury',
    description: 'Passively regenerates health in combat. Increases stamina.',
    icon: '🔥',
    row: 3, col: 2, maxRanks: 1, requiresPoints: 10,
    requires: 'arms_tactical_mastery',
    effects: [
      { type: 'stat', stat: 'stamina', valuePerRank: 5 },
      { type: 'mechanic', mechanic: 'lifesteal', valuePerRank: 0.02 },
    ],
  },
  {
    id: 'arms_deep_wounds',
    name: 'Lasting Wounds',
    description: 'Critical strikes cause your target to bleed for {n}% weapon damage per second.',
    icon: '🩸',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'bleed_on_crit', valuePerRank: 0.16 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'arms_two_handed',
    name: 'Two-Handed Mastery',
    description: 'Increases all damage by {n}% per rank.',
    icon: '⚔',
    row: 4, col: 1, maxRanks: 5, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.02 }],
  },
  {
    id: 'arms_impale',
    name: 'Run Through',
    description: 'Increases critical hit damage bonus by {n}% per rank.',
    icon: '🗡',
    row: 4, col: 2, maxRanks: 2, requiresPoints: 15,
    requires: 'arms_deep_wounds',
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.2 }],
  },
  {
    id: 'arms_war_cry',
    name: 'War Cry',
    description: 'Battle Cry hits {n}% harder per rank.',
    icon: '📣',
    row: 4, col: 3, maxRanks: 3, requiresPoints: 15,
    effects: [{
      type: 'ability', ability: 'warrior_battle_cry', mod: 'damage', valuePerRank: 0.20,
      note: 'War Cry: damage increased',
    }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'arms_axe_spec',
    name: 'Weapon Mastery',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '🪓',
    row: 5, col: 1, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.01 }],
  },
  {
    id: 'arms_sweeping_strikes',
    name: 'Reaping Arc',
    description: 'Every 30s your next 5 attacks deal double damage.',
    icon: '🌀',
    row: 5, col: 2, maxRanks: 1, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'sweeping_strikes', valuePerRank: 1 }],
  },
  {
    id: 'arms_sword_spec',
    name: 'Turning Steel',
    description: 'Gives each attack a {n}% chance per rank to strike again instantly.',
    icon: '✨',
    row: 5, col: 3, maxRanks: 5, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'extra_strike', valuePerRank: 0.01 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'arms_executioner',
    name: 'Executioner',
    description: 'Deal {n}% more damage per rank to enemies below a third of their health.',
    icon: '🪓',
    row: 6, col: 1, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'executioner', valuePerRank: 0.10 }],
  },
  {
    id: 'arms_hamstring',
    name: 'Hobbling Cut',
    description: 'Reduces enemy attack speed by an additional {n}% per rank.',
    icon: '🦵',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.03 }],
  },
  {
    id: 'arms_mortal_strike',
    name: 'Gravewound',
    description: 'Battle Cry comes back a third faster and leaves a crushing wound.',
    icon: '💀',
    row: 6, col: 3, maxRanks: 1, requiresPoints: 25,
    effects: [
      { type: 'mechanic', mechanic: 'enemy_slow', valuePerRank: 0.05 },
      {
        type: 'ability', ability: 'warrior_battle_cry', mod: 'cooldown', valuePerRank: 0.33,
        note: 'Gravewound: cooldown reduced',
      },
    ],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'arms_juggernaut',
    name: 'Juggernaut',
    description: 'Increases all damage by a further {n}% per rank.',
    icon: '⚔',
    row: 7, col: 1, maxRanks: 5, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.03 }],
  },
  {
    id: 'arms_bladestorm',
    name: 'Bladestorm',
    description: 'Battle Cry becomes a whirlwind — it also bleeds everything it touches.',
    icon: '🌀',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'arms_sweeping_strikes',
    effects: [
      { type: 'mechanic', mechanic: 'bleed_on_crit', valuePerRank: 0.25 },
      {
        type: 'ability', ability: 'warrior_battle_cry', mod: 'damage', valuePerRank: 0.50,
        note: 'Bladestorm: strikes everything around you',
      },
    ],
  },
]

// Connector lines between prerequisite pairs: [parentId, childId]
export const IRONCLEAVE_CONNECTORS: [string, string][] = [
  ['arms_tactical_mastery', 'arms_anger_management'],
  ['arms_deep_wounds',      'arms_impale'],
  ['arms_sweeping_strikes', 'arms_bladestorm'],
]
