import type { ClassType, ZoneId, MaterialId, RecipeId, Slot } from './types'

// ── Materials ─────────────────────────────────────────────────────────────────
//
// **Names are original; IDS ARE NOT RENAMED.** Every id here is a save key — a player's
// stock is `Record<MaterialId, number>` and their recipes are stored by id — so renaming
// one would silently delete whatever they had gathered. The ids therefore still read
// `mithril_ore`, `kingsblood`, `runecloth`; only the words the player sees have changed.
//
// They changed because the previous set was not "inspired by" another game, it WAS another
// game's: all five herbs (Silverleaf, Mageroyal, Briarthorn, Kingsblood, Dreamfoil), both
// upper cloth tiers (Mageweave, Runecloth), the top two ores (Mithril, Thorium) and the
// entire five-step leather ladder were verbatim World of Warcraft item names, as were
// "Linen Bandage" and "Minor Healing Potion". That is a trademark exposure a term-grep by
// a reviewer finds in one pass, and it is the same class of problem the FFTA palette had
// (see palettes.ts) — content copied at the level of the actual value, not the idea.
//
// The replacements are drawn from this world's own vocabulary rather than being
// find-and-replace synonyms: ash, dusk, gallows, sorrow, vows and the long war. Real
// materials keep their real names — copper, tin, iron, linen, wool and silk are not
// anyone's invention.
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
  mithril_ore:  { id: 'mithril_ore',  name: 'Palesilver Ore',    icon: '💎' },
  thorium_ore:  { id: 'thorium_ore',  name: 'Grimsteel Ore',    icon: '💎' },
  // Mage — Tailoring
  linen_cloth:      { id: 'linen_cloth',      name: 'Linen Cloth',      icon: '🧵' },
  wool_cloth:       { id: 'wool_cloth',       name: 'Wool Cloth',       icon: '🧵' },
  silk_cloth:       { id: 'silk_cloth',       name: 'Silk Cloth',       icon: '🧵' },
  mageweave_cloth:  { id: 'mageweave_cloth',  name: 'Glimmerweave Cloth',  icon: '✨' },
  runecloth:        { id: 'runecloth',        name: 'Sigilcloth',        icon: '✨' },
  // Warlock — Herbalism
  silverleaf:  { id: 'silverleaf',  name: 'Palewort',   icon: '🌿' },
  mageroyal:   { id: 'mageroyal',   name: 'Ashbloom',    icon: '🌿' },
  briarthorn:  { id: 'briarthorn',  name: 'Gallowvine',   icon: '🌿' },
  kingsblood:  { id: 'kingsblood',  name: 'Sorrowcap',   icon: '🌸' },
  dreamfoil:   { id: 'dreamfoil',   name: 'Stillbloom',    icon: '🌸' },
  // Rogue — Skinning
  ruined_leather:  { id: 'ruined_leather',  name: 'Ragged Hide',  icon: '🦴' },
  light_leather:   { id: 'light_leather',   name: 'Supple Hide',   icon: '🦴' },
  medium_leather:  { id: 'medium_leather',  name: 'Tanned Hide',  icon: '🦴' },
  heavy_leather:   { id: 'heavy_leather',   name: 'Scarred Hide',   icon: '🐾' },
  thick_leather:   { id: 'thick_leather',   name: 'Warhide',   icon: '🐾' },
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
  shattered_crossing: {
    warrior: 'copper_ore',
    mage:    'linen_cloth',
    warlock: 'silverleaf',
    rogue:   'ruined_leather',
  },
  the_bloodfields: {
    warrior: 'tin_ore',
    mage:    'wool_cloth',
    warlock: 'mageroyal',
    rogue:   'light_leather',
  },
  ironcrag_badlands: {
    warrior: 'iron_ore',
    mage:    'silk_cloth',
    warlock: 'briarthorn',
    rogue:   'medium_leather',
  },
  venom_hollows: {
    warrior: 'mithril_ore',
    mage:    'mageweave_cloth',
    warlock: 'kingsblood',
    rogue:   'heavy_leather',
  },
  warsong_mesa: {
    warrior: 'thorium_ore',
    mage:    'runecloth',
    warlock: 'dreamfoil',
    rogue:   'thick_leather',
  },
  cinderfall_wastes: {
    warrior: 'copper_ore',
    mage:    'linen_cloth',
    warlock: 'silverleaf',
    rogue:   'ruined_leather',
  },
  the_maw_eternal: {
    warrior: 'thorium_ore',
    mage:    'runecloth',
    warlock: 'dreamfoil',
    rogue:   'thick_leather',
  },
}

/**
 * Where a material grows, dug the other way round.
 *
 * `ZONE_MATERIALS` answers "what does this zone yield" — which is what the gathering tick
 * needs, and useless to the crafting panel, which is holding a recipe and wants to know
 * where its inputs come from. The panel could not answer "where do I find Sorrowcap"
 * despite the game knowing exactly, so an unmakeable recipe was a dead end rather than a
 * destination.
 *
 * Derived rather than hand-written: a second table would be one more thing to forget to
 * update when a zone's yield changes.
 */
export const MATERIAL_ZONE: Record<MaterialId, ZoneId> = (() => {
  const out: Record<string, ZoneId> = {}
  for (const [zoneId, byClass] of Object.entries(ZONE_MATERIALS)) {
    for (const matId of Object.values(byClass)) {
      // First zone wins: materials appear in exactly one zone per class, and if that ever
      // stops being true the EARLIEST one is the one worth pointing a player at.
      if (!(matId in out)) out[matId] = zoneId as ZoneId
    }
  }
  return out
})()


// ── Stat effect for crafted items ─────────────────────────────────────────────
export interface CraftStatEffect {
  type: 'instant_heal' | 'buff_dmg_pct' | 'buff_armor' | 'buff_crit'
  value: number
  durationSeconds?: number
}

// ── Recipes ───────────────────────────────────────────────────────────────────
/**
 * Two shapes share one interface so the twenty existing consumable entries below did not
 * have to be rewritten:
 *   - `kind` absent / 'consumable' → `output.effect` applies a buff or heal (as before).
 *   - `kind: 'gear'`               → `gear` describes an EQUIPPABLE item, minted at the
 *                                    rarity the material quality earned. This is the loop
 *                                    that lets a good gathering session change what the
 *                                    hero visibly wears (rarity → palette accent).
 */
export interface Recipe {
  id: RecipeId
  name: string
  classFor: ClassType
  kind?: 'consumable' | 'gear'
  inputs: { materialId: MaterialId; qty: number }[]
  output: { name: string; icon: string; effect?: CraftStatEffect }
  gear?: { slot: Slot }
  craftTime: number   // seconds
}

export function isGearRecipe(r: Recipe): boolean {
  return r.kind === 'gear' && !!r.gear
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
    name: 'Palesilver Insignia',
    classFor: 'warrior',
    inputs: [{ materialId: 'mithril_ore', qty: 4 }],
    output: { name: 'Palesilver Insignia', icon: '💠', effect: { type: 'buff_crit', value: 0.08, durationSeconds: 45 } },
    craftTime: 15,
  },
  {
    id: 'thorium_bladestone',
    name: 'Grimsteel Bladestone',
    classFor: 'warrior',
    inputs: [{ materialId: 'thorium_ore', qty: 3 }, { materialId: 'mithril_ore', qty: 2 }],
    output: { name: 'Grimsteel Bladestone', icon: '🔥', effect: { type: 'buff_dmg_pct', value: 0.18, durationSeconds: 60 } },
    craftTime: 20,
  },

  // ── Mage — Enchanting ───────────────────────────────────────────────────
  {
    id: 'linen_bandage',
    name: 'Field Dressing',
    classFor: 'mage',
    inputs: [{ materialId: 'linen_cloth', qty: 4 }],
    output: { name: 'Field Dressing', icon: '🩹', effect: { type: 'instant_heal', value: 40 } },
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
    name: 'Glimmerweave Robe',
    classFor: 'mage',
    inputs: [{ materialId: 'mageweave_cloth', qty: 5 }],
    output: { name: 'Glimmerweave Robe', icon: '🌀', effect: { type: 'buff_dmg_pct', value: 0.12, durationSeconds: 60 } },
    craftTime: 15,
  },
  {
    id: 'runecloth_phylactery',
    name: 'Sigilcloth Phylactery',
    classFor: 'mage',
    inputs: [{ materialId: 'runecloth', qty: 4 }, { materialId: 'mageweave_cloth', qty: 2 }],
    output: { name: 'Sigilcloth Phylactery', icon: '💜', effect: { type: 'buff_dmg_pct', value: 0.20, durationSeconds: 60 } },
    craftTime: 20,
  },

  // ── Warlock — Alchemy ───────────────────────────────────────────────────
  {
    id: 'minor_healing_potion',
    name: 'Lesser Healing Draught',
    classFor: 'warlock',
    inputs: [{ materialId: 'silverleaf', qty: 3 }],
    output: { name: 'Lesser Healing Draught', icon: '🧪', effect: { type: 'instant_heal', value: 60 } },
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
    name: 'Gallowvine Elixir',
    classFor: 'warlock',
    inputs: [{ materialId: 'briarthorn', qty: 4 }, { materialId: 'silverleaf', qty: 2 }],
    output: { name: 'Gallowvine Elixir', icon: '💀', effect: { type: 'buff_crit', value: 0.08, durationSeconds: 45 } },
    craftTime: 12,
  },
  {
    id: 'kingsblood_brew',
    name: 'Sorrowcap Brew',
    classFor: 'warlock',
    inputs: [{ materialId: 'kingsblood', qty: 4 }],
    output: { name: 'Sorrowcap Brew', icon: '🩸', effect: { type: 'buff_dmg_pct', value: 0.13, durationSeconds: 60 } },
    craftTime: 15,
  },
  {
    id: 'dreamfoil_flask',
    name: 'Stillbloom Flask',
    classFor: 'warlock',
    inputs: [{ materialId: 'dreamfoil', qty: 3 }, { materialId: 'kingsblood', qty: 2 }],
    output: { name: 'Stillbloom Flask', icon: '🌑', effect: { type: 'buff_dmg_pct', value: 0.20, durationSeconds: 60 } },
    craftTime: 20,
  },

  // ── Rogue — Leatherworking ───────────────────────────────────────────────
  {
    id: 'ruined_armor_kit',
    name: 'Ragged Hide Kit',
    classFor: 'rogue',
    inputs: [{ materialId: 'ruined_leather', qty: 4 }],
    output: { name: 'Ragged Hide Kit', icon: '🦺', effect: { type: 'buff_armor', value: 10, durationSeconds: 30 } },
    craftTime: 5,
  },
  {
    id: 'light_armor_kit',
    name: 'Supple Hide Kit',
    classFor: 'rogue',
    inputs: [{ materialId: 'light_leather', qty: 3 }],
    output: { name: 'Supple Hide Kit', icon: '🥷', effect: { type: 'buff_crit', value: 0.05, durationSeconds: 30 } },
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
    name: 'Duskstep Wraps',
    classFor: 'rogue',
    inputs: [{ materialId: 'heavy_leather', qty: 4 }],
    output: { name: 'Duskstep Wraps', icon: '🌑', effect: { type: 'buff_crit', value: 0.10, durationSeconds: 60 } },
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

  // ── Gear recipes ─────────────────────────────────────────────────────────────
  // Appended AFTER every consumable on purpose: auto-craft's legacy "first satisfiable
  // recipe" scan is order-sensitive, and appending here leaves that scan's result
  // unchanged for a player who never engages. Gear is reached by its own branch, which
  // requires Superior-or-better material quality (unreachable at purity 0).
  // They cost high-tier materials, so they are a goal rather than a default.
  {
    id: 'mithril_battleplate',
    name: 'Palesilver Battleplate',
    classFor: 'warrior',
    kind: 'gear',
    inputs: [{ materialId: 'mithril_ore', qty: 6 }],
    output: { name: 'Palesilver Battleplate', icon: '🛡️' },
    gear: { slot: 'chest' },
    craftTime: 24,
  },
  {
    id: 'thorium_greathelm',
    name: 'Grimsteel Greathelm',
    classFor: 'warrior',
    kind: 'gear',
    inputs: [{ materialId: 'thorium_ore', qty: 5 }, { materialId: 'mithril_ore', qty: 3 }],
    output: { name: 'Grimsteel Greathelm', icon: '⛑️' },
    gear: { slot: 'helm' },
    craftTime: 28,
  },
  {
    id: 'mageweave_mantle',
    name: 'Glimmerweave Mantle',
    classFor: 'mage',
    kind: 'gear',
    inputs: [{ materialId: 'mageweave_cloth', qty: 6 }],
    output: { name: 'Glimmerweave Mantle', icon: '🧥' },
    gear: { slot: 'chest' },
    craftTime: 24,
  },
  {
    id: 'runecloth_circlet',
    name: 'Sigilcloth Circlet',
    classFor: 'mage',
    kind: 'gear',
    inputs: [{ materialId: 'runecloth', qty: 5 }, { materialId: 'silk_cloth', qty: 3 }],
    output: { name: 'Sigilcloth Circlet', icon: '👑' },
    gear: { slot: 'helm' },
    craftTime: 28,
  },
  {
    id: 'kingsblood_signet',
    name: 'Sorrowcap Signet',
    classFor: 'warlock',
    kind: 'gear',
    inputs: [{ materialId: 'kingsblood', qty: 6 }],
    output: { name: 'Sorrowcap Signet', icon: '💍' },
    gear: { slot: 'trinket' },
    craftTime: 24,
  },
  {
    id: 'dreamfoil_shroud',
    name: 'Stillbloom Shroud',
    classFor: 'warlock',
    kind: 'gear',
    inputs: [{ materialId: 'dreamfoil', qty: 5 }, { materialId: 'kingsblood', qty: 3 }],
    output: { name: 'Stillbloom Shroud', icon: '🌘' },
    gear: { slot: 'chest' },
    craftTime: 28,
  },
  {
    id: 'shadowhide_vest',
    name: 'Duskhide Vest',
    classFor: 'rogue',
    kind: 'gear',
    inputs: [{ materialId: 'heavy_leather', qty: 6 }],
    output: { name: 'Duskhide Vest', icon: '🦺' },
    gear: { slot: 'chest' },
    craftTime: 24,
  },
  {
    id: 'stalker_treads',
    name: 'Warhide Treads',
    classFor: 'rogue',
    kind: 'gear',
    inputs: [{ materialId: 'thick_leather', qty: 5 }, { materialId: 'heavy_leather', qty: 3 }],
    output: { name: 'Warhide Treads', icon: '👢' },
    gear: { slot: 'boots' },
    craftTime: 28,
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
  /** Gerund, for the "…ing" status line over the world. Pairs with `gatherVerb`. */
  craftVerb: string   // e.g. "Forging", "Brewing", "Enchanting"
}

export const CLASS_PROFESSIONS: Record<ClassType, ProfessionDef> = {
  warrior: {
    gatheringName: 'Mining',
    craftingName:  'Smithing',
    classFor:      'warrior',
    gatherIcon:    '⛏️',
    craftIcon:     '🔨',
    gatherVerb:    'Mining',
    craftVerb:     'Forging',
  },
  mage: {
    gatheringName: 'Tailoring',
    craftingName:  'Enchanting',
    classFor:      'mage',
    gatherIcon:    '🧵',
    craftIcon:     '📜',
    gatherVerb:    'Tailoring',
    craftVerb:     'Enchanting',
  },
  warlock: {
    gatheringName: 'Herbalism',
    craftingName:  'Alchemy',
    classFor:      'warlock',
    gatherIcon:    '🌿',
    craftIcon:     '🧪',
    gatherVerb:    'Gathering',
    craftVerb:     'Brewing',
  },
  rogue: {
    gatheringName: 'Skinning',
    craftingName:  'Leatherworking',
    classFor:      'rogue',
    gatherIcon:    '🦴',
    craftIcon:     '🥷',
    gatherVerb:    'Skinning',
    craftVerb:     'Stitching',
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
  shattered_crossing: {
    chars:        ['#', '~', '·', '≈', '-'],
    primaryColor: '#4a7c59',
    accentColor:  '#4488aa',
    bgColor:      '#1a2e1a',
  },
  the_bloodfields: {
    chars:        ['.', '·', ',', '~', '≈'],
    primaryColor: '#8b1a1a',
    accentColor:  '#5c0a0a',
    bgColor:      '#1a0a0a',
  },
  ironcrag_badlands: {
    chars:        ['^', '¬', '#', '·', '.'],
    primaryColor: '#5c4400',
    accentColor:  '#8b6914',
    bgColor:      '#2a2010',
  },
  venom_hollows: {
    chars:        ['♦', '♠', '·', '#', '¤'],
    primaryColor: '#2d1b4e',
    accentColor:  '#1a0e30',
    bgColor:      '#0d0a14',
  },
  warsong_mesa: {
    chars:        ['.', '~', '≈', ',', '·'],
    primaryColor: '#c9a227',
    accentColor:  '#8b6914',
    bgColor:      '#2a2010',
  },
  cinderfall_wastes: {
    chars:        ['^', '·', '/', '\\', '∧'],
    primaryColor: '#cf4520',
    accentColor:  '#8b1a1a',
    bgColor:      '#1a0a0a',
  },
  the_maw_eternal: {
    chars:        ['#', '%', '&', '·', '@'],
    primaryColor: '#2e8b35',
    accentColor:  '#1a5c2a',
    bgColor:      '#0a1a0a',
  },
}
