import type { ClassType, ZoneId, MaterialId, RecipeId } from './types'

// ── Materials ─────────────────────────────────────────────────────────────────
export interface Material {
  id: MaterialId
  name: string
  icon: string
}

export const MATERIALS: Record<MaterialId, Material> = {
  // Warrior — Mining
  copper_ore:   { id: 'copper_ore',   name: 'Copper Ore',     icon: '🪨' },
  tin_ore:      { id: 'tin_ore',      name: 'Tin Ore',        icon: '🪨' },
  iron_ore:     { id: 'iron_ore',     name: 'Iron Ore',       icon: '🪨' },
  mithril_ore:  { id: 'mithril_ore',  name: 'Mithril Ore',    icon: '💎' },
  thorium_ore:  { id: 'thorium_ore',  name: 'Thorium Ore',    icon: '💎' },
  // Mage — Tailoring
  linen_cloth:      { id: 'linen_cloth',      name: 'Linen Cloth',      icon: '🧵' },
  wool_cloth:       { id: 'wool_cloth',       name: 'Wool Cloth',       icon: '🧵' },
  silk_cloth:       { id: 'silk_cloth',       name: 'Silk Cloth',       icon: '🧵' },
  mageweave_cloth:  { id: 'mageweave_cloth',  name: 'Mageweave Cloth',  icon: '✨' },
  runecloth:        { id: 'runecloth',        name: 'Runecloth',        icon: '✨' },
  // Warlock — Herbalism
  silverleaf:  { id: 'silverleaf',  name: 'Silverleaf',   icon: '🌿' },
  mageroyal:   { id: 'mageroyal',   name: 'Mageroyal',    icon: '🌿' },
  briarthorn:  { id: 'briarthorn',  name: 'Briarthorn',   icon: '🌿' },
  kingsblood:  { id: 'kingsblood',  name: 'Kingsblood',   icon: '🌸' },
  dreamfoil:   { id: 'dreamfoil',   name: 'Dreamfoil',    icon: '🌸' },
  // Rogue — Skinning
  ruined_leather:  { id: 'ruined_leather',  name: 'Ruined Leather',  icon: '🦴' },
  light_leather:   { id: 'light_leather',   name: 'Light Leather',   icon: '🦴' },
  medium_leather:  { id: 'medium_leather',  name: 'Medium Leather',  icon: '🦴' },
  heavy_leather:   { id: 'heavy_leather',   name: 'Heavy Leather',   icon: '🐾' },
  thick_leather:   { id: 'thick_leather',   name: 'Thick Leather',   icon: '🐾' },
}

// ── Zone → Material mapping ───────────────────────────────────────────────────
export const ZONE_MATERIALS: Record<ZoneId, Record<ClassType, MaterialId>> = {
  sunhollow_meadows: {
    warrior: 'copper_ore',
    mage:    'linen_cloth',
    warlock: 'silverleaf',
    rogue:   'ruined_leather',
  },
  dustwind_plains: {
    warrior: 'tin_ore',
    mage:    'wool_cloth',
    warlock: 'mageroyal',
    rogue:   'light_leather',
  },
  grimshade_forest: {
    warrior: 'iron_ore',
    mage:    'silk_cloth',
    warlock: 'briarthorn',
    rogue:   'medium_leather',
  },
  thornvale_jungle: {
    warrior: 'mithril_ore',
    mage:    'mageweave_cloth',
    warlock: 'kingsblood',
    rogue:   'heavy_leather',
  },
  ashfire_peaks: {
    warrior: 'thorium_ore',
    mage:    'runecloth',
    warlock: 'dreamfoil',
    rogue:   'thick_leather',
  },
}

// ── Stat effect for crafted items ─────────────────────────────────────────────
export interface CraftStatEffect {
  type: 'instant_heal' | 'buff_dmg_pct' | 'buff_armor' | 'buff_crit'
  value: number
  durationSeconds?: number
}

// ── Recipes ───────────────────────────────────────────────────────────────────
export interface Recipe {
  id: RecipeId
  name: string
  classFor: ClassType
  inputs: { materialId: MaterialId; qty: number }[]
  output: { name: string; icon: string; effect: CraftStatEffect }
  craftTime: number   // seconds
}

export const RECIPES: Recipe[] = [
  // ── Warrior — Smithing ───────────────────────────────────────────────────
  {
    id: 'crude_weapon_oil',
    name: 'Crude Weapon Oil',
    classFor: 'warrior',
    inputs: [{ materialId: 'copper_ore', qty: 3 }],
    output: { name: 'Crude Weapon Oil', icon: '⚔️', effect: { type: 'buff_dmg_pct', value: 0.05, durationSeconds: 30 } },
    craftTime: 8,
  },
  {
    id: 'tin_shield_plate',
    name: 'Tin Shield Plate',
    classFor: 'warrior',
    inputs: [{ materialId: 'tin_ore', qty: 4 }],
    output: { name: 'Tin Shield Plate', icon: '🛡️', effect: { type: 'buff_armor', value: 20, durationSeconds: 60 } },
    craftTime: 10,
  },
  {
    id: 'iron_whetstone',
    name: 'Iron Whetstone',
    classFor: 'warrior',
    inputs: [{ materialId: 'iron_ore', qty: 3 }, { materialId: 'copper_ore', qty: 2 }],
    output: { name: 'Iron Whetstone', icon: '⚒️', effect: { type: 'buff_dmg_pct', value: 0.10, durationSeconds: 30 } },
    craftTime: 12,
  },
  {
    id: 'mithril_insignia',
    name: 'Mithril Insignia',
    classFor: 'warrior',
    inputs: [{ materialId: 'mithril_ore', qty: 4 }],
    output: { name: 'Mithril Insignia', icon: '💠', effect: { type: 'buff_crit', value: 0.08, durationSeconds: 45 } },
    craftTime: 15,
  },
  {
    id: 'thorium_bladestone',
    name: 'Thorium Bladestone',
    classFor: 'warrior',
    inputs: [{ materialId: 'thorium_ore', qty: 3 }, { materialId: 'mithril_ore', qty: 2 }],
    output: { name: 'Thorium Bladestone', icon: '🔥', effect: { type: 'buff_dmg_pct', value: 0.18, durationSeconds: 60 } },
    craftTime: 20,
  },

  // ── Mage — Enchanting ───────────────────────────────────────────────────
  {
    id: 'linen_bandage',
    name: 'Linen Bandage',
    classFor: 'mage',
    inputs: [{ materialId: 'linen_cloth', qty: 4 }],
    output: { name: 'Linen Bandage', icon: '🩹', effect: { type: 'instant_heal', value: 40 } },
    craftTime: 5,
  },
  {
    id: 'wool_mana_wrap',
    name: 'Wool Mana Wrap',
    classFor: 'mage',
    inputs: [{ materialId: 'wool_cloth', qty: 4 }],
    output: { name: 'Wool Mana Wrap', icon: '🔮', effect: { type: 'buff_dmg_pct', value: 0.06, durationSeconds: 30 } },
    craftTime: 8,
  },
  {
    id: 'silk_enchant_scroll',
    name: 'Enchant Scroll',
    classFor: 'mage',
    inputs: [{ materialId: 'silk_cloth', qty: 3 }],
    output: { name: 'Enchant Scroll', icon: '📜', effect: { type: 'buff_crit', value: 0.07, durationSeconds: 45 } },
    craftTime: 10,
  },
  {
    id: 'mageweave_robe',
    name: 'Mageweave Robe',
    classFor: 'mage',
    inputs: [{ materialId: 'mageweave_cloth', qty: 5 }],
    output: { name: 'Mageweave Robe', icon: '🌀', effect: { type: 'buff_dmg_pct', value: 0.12, durationSeconds: 60 } },
    craftTime: 15,
  },
  {
    id: 'runecloth_phylactery',
    name: 'Runecloth Phylactery',
    classFor: 'mage',
    inputs: [{ materialId: 'runecloth', qty: 4 }, { materialId: 'mageweave_cloth', qty: 2 }],
    output: { name: 'Runecloth Phylactery', icon: '💜', effect: { type: 'buff_dmg_pct', value: 0.20, durationSeconds: 60 } },
    craftTime: 20,
  },

  // ── Warlock — Alchemy ───────────────────────────────────────────────────
  {
    id: 'minor_healing_potion',
    name: 'Minor Healing Potion',
    classFor: 'warlock',
    inputs: [{ materialId: 'silverleaf', qty: 3 }],
    output: { name: 'Minor Healing Potion', icon: '🧪', effect: { type: 'instant_heal', value: 60 } },
    craftTime: 5,
  },
  {
    id: 'mageroyal_tincture',
    name: 'Shadow Tincture',
    classFor: 'warlock',
    inputs: [{ materialId: 'mageroyal', qty: 3 }],
    output: { name: 'Shadow Tincture', icon: '🖤', effect: { type: 'buff_dmg_pct', value: 0.07, durationSeconds: 30 } },
    craftTime: 8,
  },
  {
    id: 'briarthorn_elixir',
    name: 'Briarthorn Elixir',
    classFor: 'warlock',
    inputs: [{ materialId: 'briarthorn', qty: 4 }, { materialId: 'silverleaf', qty: 2 }],
    output: { name: 'Briarthorn Elixir', icon: '💀', effect: { type: 'buff_crit', value: 0.08, durationSeconds: 45 } },
    craftTime: 12,
  },
  {
    id: 'kingsblood_brew',
    name: 'Kingsblood Brew',
    classFor: 'warlock',
    inputs: [{ materialId: 'kingsblood', qty: 4 }],
    output: { name: 'Kingsblood Brew', icon: '🩸', effect: { type: 'buff_dmg_pct', value: 0.13, durationSeconds: 60 } },
    craftTime: 15,
  },
  {
    id: 'dreamfoil_flask',
    name: 'Dreamfoil Flask',
    classFor: 'warlock',
    inputs: [{ materialId: 'dreamfoil', qty: 3 }, { materialId: 'kingsblood', qty: 2 }],
    output: { name: 'Dreamfoil Flask', icon: '🌑', effect: { type: 'buff_dmg_pct', value: 0.20, durationSeconds: 60 } },
    craftTime: 20,
  },

  // ── Rogue — Leatherworking ───────────────────────────────────────────────
  {
    id: 'ruined_armor_kit',
    name: 'Ruined Armor Kit',
    classFor: 'rogue',
    inputs: [{ materialId: 'ruined_leather', qty: 4 }],
    output: { name: 'Ruined Armor Kit', icon: '🦺', effect: { type: 'buff_armor', value: 10, durationSeconds: 30 } },
    craftTime: 5,
  },
  {
    id: 'light_armor_kit',
    name: 'Light Armor Kit',
    classFor: 'rogue',
    inputs: [{ materialId: 'light_leather', qty: 3 }],
    output: { name: 'Light Armor Kit', icon: '🥷', effect: { type: 'buff_crit', value: 0.05, durationSeconds: 30 } },
    craftTime: 8,
  },
  {
    id: 'medium_poison_coat',
    name: 'Poison-Coated Blades',
    classFor: 'rogue',
    inputs: [{ materialId: 'medium_leather', qty: 3 }, { materialId: 'light_leather', qty: 2 }],
    output: { name: 'Poison-Coated Blades', icon: '🗡️', effect: { type: 'buff_dmg_pct', value: 0.10, durationSeconds: 45 } },
    craftTime: 12,
  },
  {
    id: 'heavy_shadowstep_wrap',
    name: 'Shadowstep Wraps',
    classFor: 'rogue',
    inputs: [{ materialId: 'heavy_leather', qty: 4 }],
    output: { name: 'Shadowstep Wraps', icon: '🌑', effect: { type: 'buff_crit', value: 0.10, durationSeconds: 60 } },
    craftTime: 15,
  },
  {
    id: 'thick_deathstalker_hood',
    name: "Deathstalker's Hood",
    classFor: 'rogue',
    inputs: [{ materialId: 'thick_leather', qty: 3 }, { materialId: 'heavy_leather', qty: 3 }],
    output: { name: "Deathstalker's Hood", icon: '🎭', effect: { type: 'buff_dmg_pct', value: 0.18, durationSeconds: 60 } },
    craftTime: 20,
  },
]

// ── Profession definitions ─────────────────────────────────────────────────────
export type ProfessionId = 'mining' | 'smithing' | 'tailoring' | 'enchanting' | 'herbalism' | 'alchemy' | 'skinning' | 'leatherworking'

export interface ProfessionDef {
  gatheringName: string
  craftingName: string
  classFor: ClassType
  gatherIcon: string
  craftIcon: string
  gatherVerb: string  // e.g. "Mining", "Gathering", "Skinning"
}

export const CLASS_PROFESSIONS: Record<ClassType, ProfessionDef> = {
  warrior: {
    gatheringName: 'Mining',
    craftingName:  'Smithing',
    classFor:      'warrior',
    gatherIcon:    '⛏️',
    craftIcon:     '🔨',
    gatherVerb:    'Mining',
  },
  mage: {
    gatheringName: 'Tailoring',
    craftingName:  'Enchanting',
    classFor:      'mage',
    gatherIcon:    '🧵',
    craftIcon:     '📜',
    gatherVerb:    'Tailoring',
  },
  warlock: {
    gatheringName: 'Herbalism',
    craftingName:  'Alchemy',
    classFor:      'warlock',
    gatherIcon:    '🌿',
    craftIcon:     '🧪',
    gatherVerb:    'Gathering',
  },
  rogue: {
    gatheringName: 'Skinning',
    craftingName:  'Leatherworking',
    classFor:      'rogue',
    gatherIcon:    '🦴',
    craftIcon:     '🥷',
    gatherVerb:    'Skinning',
  },
}

// ── Biome ASCII config for minimap ────────────────────────────────────────────
export interface BiomeConfig {
  chars: string[]        // terrain ASCII chars (randomly chosen)
  primaryColor: string
  accentColor: string
  bgColor: string        // dark background fill
}

export const BIOME_CONFIGS: Record<ZoneId, BiomeConfig> = {
  sunhollow_meadows: {
    chars:        ['.', ',', "'", '~', '`'],
    primaryColor: '#4a7c59',
    accentColor:  '#6fa832',
    bgColor:      '#1a2e1a',
  },
  dustwind_plains: {
    chars:        ['.', '~', '≈', ',', '·'],
    primaryColor: '#c9a227',
    accentColor:  '#8b6914',
    bgColor:      '#2a2010',
  },
  grimshade_forest: {
    chars:        ['♦', '♠', '·', '#', '¤'],
    primaryColor: '#6b4c8a',
    accentColor:  '#2d1b4e',
    bgColor:      '#0d0a14',
  },
  thornvale_jungle: {
    chars:        ['#', '%', '&', '·', '@'],
    primaryColor: '#2e8b35',
    accentColor:  '#1a5c2a',
    bgColor:      '#0a1a0a',
  },
  ashfire_peaks: {
    chars:        ['^', '·', '/', '\\', '∧'],
    primaryColor: '#cf4520',
    accentColor:  '#8b1a1a',
    bgColor:      '#1a0a0a',
  },
}
