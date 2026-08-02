import type { TalentNodeDef } from '../../types'

// ── Rogue ── The Long Quiet ──────────────────────────────────────────────────
// One strike from somewhere you were not.
//
// The only tree in the game built around the OPENER — the first blow against a target
// that has not yet seen you. Everything else is arranged to make that blow arrive more
// often: it is the tree that most wants short fights and fast kills, because a new
// target is a new opener, and a long grind against one enemy is the one thing it has no
// answer to. Gutterwork's exact opposite in tempo, and Shadowed Edge's in patience.
export const THE_LONG_QUIET_TALENTS: TalentNodeDef[] = [

  // ── Row 1 (0 pts) ─────────────────────────────────────────────────────────
  {
    id: 'quiet_master_of_deception',
    name: 'Unremarkable',
    description: 'Increases agility by {n} per rank.',
    icon: '🌑',
    row: 1, col: 1, maxRanks: 5, requiresPoints: 0,
    effects: [{ type: 'stat', stat: 'agility', valuePerRank: 3 }],
  },
  {
    id: 'quiet_opening',
    name: 'The Opening',
    description: 'Your first strike against a target deals {n}% more damage, per rank.',
    icon: '🗡',
    row: 1, col: 2, maxRanks: 3, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'opener_burst', valuePerRank: 0.30 }],
  },
  {
    id: 'quiet_camouflage',
    name: 'Fade to Grey',
    description: 'Gives you a {n}% chance per rank to go unseen by a blow.',
    icon: '💨',
    row: 1, col: 3, maxRanks: 2, requiresPoints: 0,
    effects: [{ type: 'mechanic', mechanic: 'avoid_chance', valuePerRank: 0.03 }],
  },

  // ── Row 2 (5 pts) ─────────────────────────────────────────────────────────
  {
    id: 'quiet_sleight_of_hand',
    name: 'Light Fingers',
    description: 'Increases crit chance by {n}% per rank.',
    icon: '🎯',
    row: 2, col: 1, maxRanks: 3, requiresPoints: 5,
    effects: [{ type: 'stat', stat: 'critChance', valuePerRank: 0.012 }],
  },
  {
    id: 'quiet_serrated_blades',
    name: 'Toothed Steel',
    description: 'Your critical strikes open a wound bleeding for {n}% weapon damage per second, per rank.',
    icon: '🩸',
    row: 2, col: 2, maxRanks: 5, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'bleed_on_crit', valuePerRank: 0.08 }],
  },
  {
    id: 'quiet_elusiveness',
    name: 'Hard to Follow',
    description: 'Reduces all damage taken by {n}% per rank.',
    icon: '🌑',
    row: 2, col: 3, maxRanks: 2, requiresPoints: 5,
    effects: [{ type: 'mechanic', mechanic: 'damage_reduction', valuePerRank: 0.03 }],
  },

  // ── Row 3 (10 pts) ────────────────────────────────────────────────────────
  {
    id: 'quiet_ambush',
    name: 'From Behind',
    description: 'Your opening strike deals a further {n}% damage, per rank.',
    icon: '🗡',
    row: 3, col: 1, maxRanks: 3, requiresPoints: 10,
    requires: 'quiet_opening',
    effects: [{ type: 'mechanic', mechanic: 'opener_burst', valuePerRank: 0.25 }],
  },
  {
    id: 'quiet_opportunity',
    name: 'The Right Moment',
    description: 'Increases critical strike damage bonus by {n}% per rank.',
    icon: '💀',
    row: 3, col: 2, maxRanks: 4, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.10 }],
  },
  {
    id: 'quiet_initiative',
    name: 'First Move',
    description: 'After a kill, your next attack lands with {n}% more crit chance, per rank.',
    icon: '💀',
    row: 3, col: 3, maxRanks: 3, requiresPoints: 10,
    effects: [{ type: 'mechanic', mechanic: 'remorseless_attacks', valuePerRank: 0.05 }],
  },

  // ── Row 4 (15 pts) ────────────────────────────────────────────────────────
  {
    id: 'quiet_duskstep_mastery',
    name: 'Duskstep Mastery',
    description: 'Duskstep returns {n}% sooner per rank and arrives harder.',
    icon: '💨',
    row: 4, col: 1, maxRanks: 3, requiresPoints: 15,
    effects: [
      { type: 'ability', ability: 'rogue_shadow_step', mod: 'cooldown', valuePerRank: 0.15,
        note: 'Duskstep Mastery: cooldown reduced' },
      { type: 'ability', ability: 'rogue_shadow_step', mod: 'damage', valuePerRank: 0.20,
        note: 'Duskstep Mastery: arrival hits harder' },
    ],
  },
  {
    id: 'quiet_hemorrhage',
    name: 'Open Vein',
    description: 'Every bleed and poison you own runs {n}% deeper per rank.',
    icon: '🩸',
    row: 4, col: 2, maxRanks: 5, requiresPoints: 15,
    requires: 'quiet_serrated_blades',
    effects: [{ type: 'mechanic', mechanic: 'dot_amp', valuePerRank: 0.08 }],
  },
  {
    id: 'quiet_deadliness',
    name: 'Killing Weight',
    description: 'Increases all damage by {n}% per rank.',
    icon: '🔪',
    row: 4, col: 3, maxRanks: 3, requiresPoints: 15,
    effects: [{ type: 'mechanic', mechanic: 'damage_amp', valuePerRank: 0.025 }],
  },

  // ── Row 5 (20 pts) ────────────────────────────────────────────────────────
  {
    id: 'quiet_premeditation',
    name: 'Rehearsed',
    description: 'Every 25 seconds, your next attack is a guaranteed critical strike.',
    icon: '🌑',
    row: 5, col: 1, maxRanks: 1, requiresPoints: 20,
    effects: [{ type: 'mechanic', mechanic: 'timed_crit', valuePerRank: 1 / 25 }],
  },
  {
    id: 'quiet_sinister_calling',
    name: 'The Quiet Trade',
    description: 'Increases agility by {n} per rank.',
    icon: '🌑',
    row: 5, col: 2, maxRanks: 4, requiresPoints: 20,
    effects: [{ type: 'stat', stat: 'agility', valuePerRank: 5 }],
  },
  {
    id: 'quiet_ghostly',
    name: 'Unseen',
    description: 'A further {n}% chance per rank that a blow finds nothing where you were.',
    icon: '💨',
    row: 5, col: 3, maxRanks: 3, requiresPoints: 20,
    requires: 'quiet_camouflage',
    effects: [{ type: 'mechanic', mechanic: 'avoid_chance', valuePerRank: 0.03 }],
  },

  // ── Row 6 (25 pts) ────────────────────────────────────────────────────────
  {
    id: 'quiet_finishing_touch',
    name: 'Finishing Touch',
    description: 'Deal {n}% more damage per rank to enemies below a third of their health.',
    icon: '💀',
    row: 6, col: 1, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'executioner', valuePerRank: 0.14 }],
  },
  {
    id: 'quiet_master_of_subtlety',
    name: 'Master of the Quiet',
    description: 'Increases critical strike damage bonus by a further {n}% per rank.',
    icon: '💀',
    row: 6, col: 2, maxRanks: 3, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'crit_damage', valuePerRank: 0.12 }],
  },
  {
    id: 'quiet_vanish',
    name: 'Gone',
    description: 'Once per fight, the blow that should have killed you finds nobody there — you stand at a quarter health.',
    icon: '💨',
    row: 6, col: 3, maxRanks: 1, requiresPoints: 25,
    effects: [{ type: 'mechanic', mechanic: 'last_stand', valuePerRank: 0.25 }],
  },

  // ── Row 7 (30 pts) ────────────────────────────────────────────────────────
  {
    id: 'quiet_shadow_dance',
    name: 'The Long Step',
    description: 'Every strike opens as though it were the first — a further {n}% opening damage per rank.',
    icon: '🌑',
    row: 7, col: 1, maxRanks: 3, requiresPoints: 30,
    effects: [{ type: 'mechanic', mechanic: 'opener_burst', valuePerRank: 0.30 }],
  },
  {
    id: 'quiet_the_long_quiet',
    name: 'The Long Quiet',
    description: 'Duskstep is almost always ready, and what it opens rarely lives to close.',
    icon: '💀',
    row: 7, col: 2, maxRanks: 1, requiresPoints: 30,
    requires: 'quiet_duskstep_mastery',
    effects: [
      { type: 'mechanic', mechanic: 'executioner', valuePerRank: 0.25 },
      { type: 'ability', ability: 'rogue_shadow_step', mod: 'cooldown', valuePerRank: 0.45,
        note: 'The Long Quiet: cooldown slashed' },
    ],
  },
]

export const THE_LONG_QUIET_CONNECTORS: [string, string][] = [
  ['quiet_opening',          'quiet_ambush'],
  ['quiet_serrated_blades',  'quiet_hemorrhage'],
  ['quiet_camouflage',       'quiet_ghostly'],
  ['quiet_duskstep_mastery', 'quiet_the_long_quiet'],
]
