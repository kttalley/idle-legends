import type { ActiveAbilityDef } from './types'

// ── Active Ability Definitions (Skill Bar) ────────────────────────────────────
// Each class gets 3 slots. These are always available (no talent requirement).
// Talent tree upgrades can enhance what these do via CompiledTalentEffects.

export const ACTIVE_ABILITIES: ActiveAbilityDef[] = [

  // ────────────────────────────────── WARRIOR ──────────────────────────────────

  {
    id: 'warrior_battle_cry',
    name: 'Battle Cry',
    description: 'Your next attack deals 250% weapon damage.',
    icon: '⚔',
    cooldownSeconds: 3,
    classes: ['warrior'],
    slot: 1,
    effects: [{ type: 'next_hit_multiplier', value: 2.5, stacks: 1 }],
  },
  {
    id: 'warrior_shield_wall',
    name: 'Shield Wall',
    description: 'Reduce incoming damage by 60% for 8 seconds.',
    icon: '🛡',
    cooldownSeconds: 10,
    classes: ['warrior'],
    slot: 2,
    effects: [{ type: 'armor_buff', value: 60, durationSeconds: 8 }],
  },
  {
    id: 'warrior_bloodthirst',
    name: 'Bloodthirst',
    description: 'Your next 3 critical hits heal you for 20% of damage dealt.',
    icon: '🩸',
    cooldownSeconds: 8,
    classes: ['warrior'],
    slot: 3,
    effects: [{ type: 'lifesteal_buff', value: 0.20, stacks: 3, durationSeconds: 20 }],
  },

  // ─────────────────────────────────── MAGE ────────────────────────────────────

  {
    id: 'mage_frostbolt',
    name: 'Frostbolt',
    description: 'Deal 200% damage and freeze the enemy for 4 seconds (cannot attack).',
    icon: '❄',
    cooldownSeconds: 4,
    castTimeSeconds: 0.6,
    classes: ['mage'],
    slot: 1,
    effects: [
      { type: 'next_hit_multiplier', value: 2.0, stacks: 1 },
      { type: 'freeze_mob', value: 1, durationSeconds: 4 },
    ],
  },
  {
    id: 'mage_combustion',
    name: 'Combustion',
    description: 'Your next 3 spells are guaranteed critical strikes.',
    icon: '🔥',
    cooldownSeconds: 12,
    classes: ['mage'],
    slot: 2,
    effects: [{ type: 'crit_guarantee', value: 1, stacks: 3, durationSeconds: 30 }],
  },
  {
    id: 'mage_time_warp',
    name: 'Time Warp',
    description: 'Reduce attack interval by 50% for 8 seconds.',
    icon: '⏳',
    cooldownSeconds: 15,
    classes: ['mage'],
    slot: 3,
    effects: [{ type: 'speed_buff', value: 0.5, durationSeconds: 8 }],
  },

  // ─────────────────────────────────── ROGUE ───────────────────────────────────

  {
    id: 'rogue_sinister_strike',
    name: 'Sinister Strike',
    description: 'Your next attack strikes twice.',
    icon: '🗡',
    cooldownSeconds: 2.5,
    classes: ['rogue'],
    slot: 1,
    effects: [{ type: 'next_hit_multiplier', value: 2.0, stacks: 1 }],
  },
  {
    id: 'rogue_evasion',
    name: 'Evasion',
    description: 'Greatly increase armor for 10 seconds.',
    icon: '🌑',
    cooldownSeconds: 12,
    classes: ['rogue'],
    slot: 2,
    effects: [{ type: 'armor_buff', value: 80, durationSeconds: 10 }],
  },
  {
    id: 'rogue_shadow_step',
    name: 'Shadow Step',
    description: 'Teleport to enemy — next attack is a guaranteed crit and resets your attack timer.',
    icon: '💨',
    cooldownSeconds: 5,
    classes: ['rogue'],
    slot: 3,
    effects: [{ type: 'crit_guarantee', value: 1, stacks: 1, durationSeconds: 8 }],
  },

  // ──────────────────────────────── WARLOCK ────────────────────────────────────

  {
    id: 'warlock_shadow_bolt',
    name: 'Shadow Bolt',
    description: 'Hurl a bolt of void energy for 300% weapon damage.',
    icon: '☠',
    cooldownSeconds: 3,
    castTimeSeconds: 0.8,
    classes: ['warlock'],
    slot: 1,
    effects: [{ type: 'shadow_bolt', value: 3.0 }],
  },
  {
    id: 'warlock_drain_life',
    name: 'Drain Life',
    description: 'Drain vitality from your target, healing 25% of your max HP over 6 seconds.',
    icon: '💚',
    cooldownSeconds: 8,
    classes: ['warlock'],
    slot: 2,
    effects: [{ type: 'hot', value: 0.25, durationSeconds: 6 }],
  },
  {
    id: 'warlock_dark_pact',
    name: 'Dark Pact',
    description: 'All DoT damage doubled for 10 seconds.',
    icon: '🌑',
    cooldownSeconds: 12,
    classes: ['warlock'],
    slot: 3,
    effects: [{ type: 'dot_amplify', value: 2.0, durationSeconds: 10 }],
  },
]

export function getClassAbilities(cls: string): ActiveAbilityDef[] {
  return ACTIVE_ABILITIES.filter(a => a.classes.includes(cls as any))
    .sort((a, b) => a.slot - b.slot)
}
