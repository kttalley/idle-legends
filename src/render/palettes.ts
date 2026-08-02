// The semantic palette registry — the game's variant/itemization taxonomy as data.
// Slot contract (graphics-spec §5.1):
//   0 transparent · 1–4 skin ramp · 5–8 primary material · 9–12 secondary material
//   13–15 metal/accent — RESERVED as the rarity-signal channel.
// Every gameplay/monetization concept (race, gear tier, elite, rarity, team, biome)
// resolves to a palette id here; the renderer itself only ever sees (spriteId, paletteId).

import { composePalette, paletteFromHex } from './palette'
import type { Palette } from './types'

// Base humanoid: fair skin, brown leathers, grey cloth, iron accents.
const BASE_UNIT = paletteFromHex([
  '', // 0 transparent
  '#5c3a24', '#8a5c38', '#c08a58', '#e8b888', // 1–4 skin dark→light
  '#3a2818', '#5c4028', '#7c5838', '#9c7048', // 5–8 primary (leathers)
  '#2c2c34', '#44444e', '#5c5c68', '#787884', // 9–12 secondary (cloth)
  '#4a4a52', '#8a8a96', '#c8c8d4',            // 13–15 metal/accent
])

const BASE_TILE = paletteFromHex([
  '',
  '#2c2418', '#443828', '#5c4c38', '#746048', // 1–4 earth ramp
  '#2c4c2c', '#3c663c', '#4c804c', '#609a60', // 5–8 primary (vegetation)
  '#1a3a5c', '#245080', '#3068a4', '#4484c4', // 9–12 secondary (water)
  '#3c3c44', '#6c6c78', '#a0a0b0',            // 13–15 stone/accent
])

const REGISTRY = new Map<string, Palette>()

function reg(id: string, p: Palette): void {
  REGISTRY.set(id, p)
}

// ── Bases ─────────────────────────────────────────────────────────────────────
reg('unit/base', BASE_UNIT)
reg('tile/base', BASE_TILE)

// ── Races: swap the skin ramp (1–4) ──────────────────────────────────────────
reg('race/human', BASE_UNIT)
reg('race/dwarf', composePalette(BASE_UNIT, { 1: '#6b3d20', 2: '#95562e', 3: '#c47c42', 4: '#e8a468' }))
reg('race/elf', composePalette(BASE_UNIT, { 1: '#7c5c40', 2: '#a88860', 3: '#d4b088', 4: '#f4dcc0' }))
reg('race/orc', composePalette(BASE_UNIT, { 1: '#2c4420', 2: '#40602e', 3: '#588040', 4: '#78a458' }))
reg('race/troll', composePalette(BASE_UNIT, { 1: '#204048', 2: '#2e5c66', 3: '#407c88', 4: '#58a0ac' }))
reg('race/goblin', composePalette(BASE_UNIT, { 1: '#4c5420', 2: '#6a742e', 3: '#8c9840', 4: '#b0bc58' }))
reg('race/gnome', composePalette(BASE_UNIT, { 1: '#6b4030', 2: '#956044', 3: '#c48860', 4: '#e8b490' }))
reg('race/hornborn', composePalette(BASE_UNIT, { 1: '#3c2820', 2: '#5c4030', 3: '#7c5c44', 4: '#a07c5c' }))

// ── Gear tiers: progressively richer materials in 5–12 ───────────────────────
reg('gear/t1', BASE_UNIT) // ragged leathers
reg('gear/t2', composePalette(BASE_UNIT, {
  5: '#2c3020', 6: '#48502e', 7: '#687040', 8: '#8c9458',
  9: '#342c1c', 10: '#544628', 11: '#786438', 12: '#9c844c',
}))
reg('gear/t3', composePalette(BASE_UNIT, {
  5: '#1c2c44', 6: '#2a4468', 7: '#3c5c8c', 8: '#5478b0',
  9: '#2c2c34', 10: '#48484e', 11: '#686870', 12: '#8c8c96',
}))
reg('gear/t4', composePalette(BASE_UNIT, {
  5: '#38202c', 6: '#582e48', 7: '#7c4068', 8: '#a45c8c',
  9: '#2c2434', 10: '#483a54', 11: '#685478', 12: '#8c749c',
}))

// ── Rarity: accent channel (13–15) ONLY — composes with any gear tier ────────
// Exported for runtime composition (race skin + rarity signal on the player, or
// team/enemy + legendary on a boss). Game-free: keyed by palette-id suffix strings.
export const RARITY_ACCENTS: Record<string, Partial<Record<number, string>>> = {
  common: { 13: '#4a4a52', 14: '#8a8a96', 15: '#c8c8d4' },
  uncommon: { 13: '#1e5c2a', 14: '#2e8c42', 15: '#48c464' },
  rare: { 13: '#1c4a8c', 14: '#2e6cc4', 15: '#5494ec' },
  epic: { 13: '#5c2490', 14: '#8038c8', 15: '#ac5cf0' },
  legendary: { 13: '#8c5c14', 14: '#c88820', 15: '#f4b434' },
}
for (const [tier, accents] of Object.entries(RARITY_ACCENTS)) {
  reg(`rarity/${tier}`, composePalette(BASE_UNIT, accents))
  // Rarity composed over each gear tier, e.g. 'gear/t3+epic'
  for (const gearTier of ['t1', 't2', 't3', 't4']) {
    reg(`gear/${gearTier}+${tier}`, composePalette(REGISTRY.get(`gear/${gearTier}`)!, accents))
  }
}

// ── Item icons: the gear-slot sheet on the unit slot contract ────────────────
// `render/itemIcons.ts` draws the six equipment slots against 1–4 organic (leather, wood,
// cord) · 5–8 armour material · 9–12 cloth trim · 13–15 metal, so the SAME six frames cover
// every item in the game: material tier lives in 5–12, rarity in 13–15. Separate from
// BASE_UNIT because icons sit on a dark UI panel at 18px and need the brighter, cooler
// values a body sprite in a lit scene does not.
const ITEM_BASE = paletteFromHex([
  '',
  '#3a2415', '#6b4526', '#9c6a3c', '#c9975a', // 1–4 organic: grip leather, haft, bone, cord
  '#33404f', '#4e6070', '#748698', '#a9bccc', // 5–8 primary armour material
  '#2b2b36', '#464655', '#67677a', '#9090a6', // 9–12 secondary: cloth trim, straps, lining
  '#4a4a52', '#8a8a96', '#c8c8d4',            // 13–15 metal/accent — the rarity channel
])
reg('item/base', ITEM_BASE)

// Material tiers, mirroring gear/t1..t4's hue story (leather → bronze → steel → arcane)
// but held at icon values. t3 IS the base steel, so it overrides nothing.
const ITEM_TIERS: Record<string, Partial<Record<number, string>>> = {
  t1: { 5: '#3b2a1c', 6: '#5c4530', 7: '#836248', 8: '#b08a62', 9: '#2b2b36', 10: '#42424e', 11: '#5e5e6c', 12: '#82828f' },
  t2: { 5: '#2f3a24', 6: '#4a5a34', 7: '#6e8248', 8: '#9cae62', 9: '#33291c', 10: '#54432c', 11: '#786040', 12: '#9c8054' },
  t3: {},
  t4: { 5: '#3a2440', 6: '#573a63', 7: '#7c5a8e', 8: '#a888bc', 9: '#2a1f34', 10: '#42324f', 11: '#5f4a70', 12: '#836a94' },
}
for (const [tier, mats] of Object.entries(ITEM_TIERS)) {
  reg(`item/${tier}`, composePalette(ITEM_BASE, mats))
}
for (const [rarity, accents] of Object.entries(RARITY_ACCENTS)) {
  reg(`item/${rarity}`, composePalette(ITEM_BASE, accents))
  // Tier × rarity, e.g. 'item/t3+epic' — same composition rule as 'gear/t3+epic'.
  for (const matTier of Object.keys(ITEM_TIERS)) {
    reg(`item/${matTier}+${rarity}`, composePalette(REGISTRY.get(`item/${matTier}`)!, accents))
  }
}

// ── Elite: shifted primary + hot accent over the base ────────────────────────
reg('elite', composePalette(BASE_UNIT, {
  5: '#441c1c', 6: '#682a2a', 7: '#8c3c3c', 8: '#b45454',
  13: '#8c2014', 14: '#c83820', 15: '#f46434',
}))

// ── UI icons: readable high-contrast bands (not a single ramp) so one sheet covers
// steel/warm/cool shapes + three accent signals (nature/treasure/arcane). ────────
reg('icon/base', paletteFromHex([
  '',
  '#2a2e38', '#566072', '#9aa4b4', '#e8eef6', // 1-4 steel / bone / white (blades, skull)
  '#a01c14', '#d84824', '#f08828', '#ffcc48', // 5-8 warm (red→orange→gold: flame, blood, wood)
  '#14345c', '#2860a8', '#50a0e0', '#b0e4ff', // 9-12 cool (frost, mana, water, gust)
  '#2e7a34', '#e0b028', '#a050e0',            // 13 nature-green · 14 treasure-gold · 15 arcane-purple
]))

// ── FX: full-body flash palettes (swap in for ~100ms on hit/heal — pure palette trick) ──
const flash = (hex: string) => {
  const o: Partial<Record<number, string>> = {}
  for (let s = 1; s < 16; s++) o[s] = hex
  return o
}
reg('fx/hitflash', composePalette(BASE_UNIT, flash('#f4f0e8')))
reg('fx/healflash', composePalette(BASE_UNIT, flash('#8ce88c')))

// ── Spell schools: effect rigs read only the accent channel (13–15) ──────────
reg('spell/fire', composePalette(BASE_UNIT, { 13: '#c83c14', 14: '#f47820', 15: '#ffd23c' }))
reg('spell/frost', composePalette(BASE_UNIT, { 13: '#1c50b0', 14: '#3c8ce0', 15: '#b0e8ff' }))
reg('spell/shadow', composePalette(BASE_UNIT, { 13: '#4c1c78', 14: '#8038c8', 15: '#d08cff' }))
reg('spell/holy', composePalette(BASE_UNIT, { 13: '#b09018', 14: '#e8c840', 15: '#fff8c0' }))

// ── Teams: one ramp differs (the reference's adjacent-set trick, spec §2.2) ──
reg('team/player', composePalette(BASE_UNIT, { 9: '#1c3454', 10: '#284c7c', 11: '#3866a4', 12: '#5084c8' }))
reg('team/enemy', composePalette(BASE_UNIT, { 9: '#54201c', 10: '#7c2e28', 11: '#a44038', 12: '#c85c50' }))

// ── Biome tile palettes: the map recolors with the same mechanism ────────────
// biome/meadow is the environment's default look and the base every other biome
// composes over.
//
// ORIGINAL RAMP, authored 2026-08-01. It replaces `biome/map080`, which was fifteen
// values decoded straight out of the FFTA ROM via the decomp editor sidecar. That
// palette was the single largest remaining piece of scaffold-derived content in the
// build: aliased as `biome/meadow`, used by sunhollow_meadows — the starting zone, and
// so the first thing any player or App Store reviewer sees — and shipped in dist/. A
// term-based IP grep cannot catch it, because the infringing part is the colour values
// themselves, not a name.
//
// Authored to the world bible (docs/art-direction.md §1) rather than resampled: the
// Lastlight Concord's meadow is a *war-tired* grassland, so the greens are desaturated
// and slightly olive rather than the source's tropical teal→lime, the earth is warm
// trodden loam rather than pale sea-stone, and the water is a cold slate blue. Ramps
// keep an even perceptual step so the tileset's dithering reads cleanly at 32x16.
reg('biome/meadow', paletteFromHex([
  '',
  '#4c4032', '#6b5a44', '#8a7659', '#a89370', // 1-4  earth / path (trodden loam)
  '#2c4028', '#3e5a34', '#547444', '#719258', // 5-8  vegetation (olive-green)
  '#22303f', '#2e4356', '#3e5b72', '#54788f', // 9-12 water (cold slate blue)
  '#565043', '#767060', '#98917e',            // 13-15 stone / cliff faces
]))

// Per-zone biome variety (environment-plan Phase A): each biome is the meadow ramp with its
// four semantic channels — earth/path (1-4), vegetation (5-8), water (9-12), stone
// (13-15) — swapped to a coherent character. All palette-indexed, so a biome palette
// also tints any future props/tiles authored against the same slots. Original art:
// no FFTA pixels or constants are reused, only the slot convention.
const MEADOW = (): Palette => REGISTRY.get('biome/meadow')!
function biome(ch: { e: readonly string[]; v: readonly string[]; w: readonly string[]; s: readonly string[] }): Palette {
  const o: Record<number, string> = {}
  ch.e.forEach((h, i) => { o[i + 1] = h })
  ch.v.forEach((h, i) => { o[i + 5] = h })
  ch.w.forEach((h, i) => { o[i + 9] = h })
  ch.s.forEach((h, i) => { o[i + 13] = h })
  return composePalette(MEADOW(), o)
}

// Temperate forest — deeper greens and brown loam than the meadow.
reg('biome/forest', biome({
  e: ['#4a3c28', '#6c543c', '#8c7048', '#a88858'],
  v: ['#1c3c1c', '#2c5c2c', '#3c7c3c', '#5c9c4c'],
  w: ['#1c2c44', '#243c5c', '#2c5074', '#3c6c94'],
  s: ['#5c5c4c', '#7c7c68', '#989880'],
}))
// Deep jungle — saturated green canopy, dark loam, murky green water.
reg('biome/jungle', biome({
  e: ['#2c2418', '#3c3424', '#4c442c', '#5c5438'],
  v: ['#0c3c14', '#1c5c24', '#2c7c34', '#4ca44c'],
  w: ['#143024', '#1c4434', '#245848', '#347060'],
  s: ['#4c4c3c', '#646450', '#7c7c64'],
}))
// Red-rock badlands / mesa — dry scrub over rust earth, rare murky water.
reg('biome/badlands', biome({
  e: ['#5c2c1c', '#7c3c24', '#9c5030', '#bc6c40'],
  v: ['#4c3c1c', '#6c5430', '#8c703c', '#a8884c'],
  w: ['#3c2c24', '#50402c', '#6c5438', '#887048'],
  s: ['#7c3c24', '#9c5030', '#bc6c40'],
}))
// Ashfire peaks — charcoal ground, charred scrub, lava/ember "water".
reg('biome/ashfire', biome({
  e: ['#1c1c20', '#2c2c30', '#3c3c44', '#4c4c54'],
  v: ['#2c241c', '#3c3024', '#4c4030', '#5c5038'],
  w: ['#5c1408', '#8c2410', '#bc3818', '#e85020'],
  s: ['#2c2c30', '#3c3c44', '#4c4c54'],
}))
// Cinderfall wastes — cinder earth, scorched scrub, glowing ember fissures.
reg('biome/cinder', biome({
  e: ['#3c1810', '#5c2418', '#7c3420', '#9c4830'],
  v: ['#3c2c18', '#5c4020', '#7c5430', '#9c7040'],
  w: ['#6c1c08', '#9c2c14', '#cc4420', '#f46430'],
  s: ['#5c2418', '#7c3420', '#9c4830'],
}))
// Dustwind plains — pale dust and dry grass, bleached stone, pale murky water.
reg('biome/wastes', biome({
  e: ['#9c8c6c', '#b4a484', '#ccbc98', '#e0d4b0'],
  v: ['#7c7c4c', '#9c9c64', '#b4b47c', '#ccc094'],
  w: ['#6c7080', '#848898', '#9ca0ac', '#b4b8c0'],
  s: ['#a09c84', '#b8b498', '#d0ccb0'],
}))
// The bloodfields — red earth, blood-tinted scrub, dark blood water.
reg('biome/bloodfields', biome({
  e: ['#5c1c14', '#7c2c1c', '#9c3c24', '#bc5030'],
  v: ['#3c2c20', '#5c3c28', '#7c4c30', '#9c6038'],
  w: ['#3c0c0c', '#5c1818', '#7c2828', '#9c3838'],
  s: ['#5c1c14', '#7c2c1c', '#9c3c24'],
}))
// Grimshade forest — dark purple canopy and shadowed loom.
reg('biome/gloom', biome({
  e: ['#2c2034', '#3c2c48', '#4c385c', '#604874'],
  v: ['#241c3c', '#342a54', '#443a6c', '#584c88'],
  w: ['#141c3c', '#1c2a58', '#283a74', '#384c94'],
  s: ['#342a54', '#443a6c', '#584c88'],
}))
// Venom hollows — sickly green vegetation over purple-rot earth, toxic green water.
reg('biome/venom', biome({
  e: ['#2c2434', '#3c3448', '#4c445c', '#605874'],
  v: ['#1c3c18', '#2c5424', '#3c7030', '#509044'],
  w: ['#143018', '#1c4420', '#2c5c2c', '#3c7838'],
  s: ['#3c3448', '#4c445c', '#605874'],
}))
// The maw eternal — corrupted dark swamp: sickly green over dark mire, black water.
reg('biome/maw', biome({
  e: ['#1c1c14', '#2c2c1c', '#3c3c24', '#4c4c30'],
  v: ['#142c14', '#1c441c', '#2c5c28', '#3c7838'],
  w: ['#0c1c14', '#143020', '#1c4430', '#2c5840'],
  s: ['#2c2c1c', '#3c3c24', '#4c4c30'],
}))

// ── Scenery prop palettes ─────────────────────────────────────────────────────
// Props carry their OWN palettes (like FFTA) rather than the biome ground palette,
// so they read as distinct objects instead of blending into the terrain. The prop
// art uses the semantic slots — wood/earth (1–4), foliage (5–8), water/accent (9–12),
// stone (13–15) — so one well-chosen palette renders trees, rocks, mounds and reeds
// all correctly and with contrast on any ground.
// 'verdant' = living biomes (green foliage); 'barren' = dead/ashen biomes (grey wood,
// charred stone) so the same rig reads as a dead snag or bare rock, not a lush tree.
reg('prop/verdant', paletteFromHex([
  '',
  '#3a2614', '#5c3c22', '#7c5432', '#9c7048', // 1–4 wood / earth (trunk, mound)
  '#1c4a1c', '#2c6e2c', '#3c9440', '#6cc85c', // 5–8 foliage (leaves)
  '#2c4a6c', '#3c6a94', '#5a90c4', '#a8d8f0', // 9–12 water/blue (reeds, crystal, bloom)
  '#5c5c64', '#8c8c96', '#c4c4d0',            // 13–15 stone (rock, ruins)
]))
reg('prop/barren', paletteFromHex([
  '',
  '#2c2018', '#463424', '#5e4832', '#7a5e42', // 1–4 grey-brown deadwood
  '#3a3a2a', '#50503a', '#66664a', '#80805e', // 5–8 dry/dead scrub
  '#3a2a2a', '#583838', '#7a5050', '#e86030', // 9–12 dark + ember accent
  '#4c4c54', '#74747e', '#a4a4b0',            // 13–15 charred stone
]))

export function getPalette(id: string): Palette {
  const p = REGISTRY.get(id)
  if (!p) {
    // Unknown id must never crash a frame — fall back loudly but safely.
    console.warn(`[palettes] unknown palette id "${id}", using unit/base`)
    return BASE_UNIT
  }
  return p
}

export function hasPalette(id: string): boolean {
  return REGISTRY.has(id)
}

export function paletteIds(): string[] {
  return [...REGISTRY.keys()]
}

/** Register a palette at runtime (scaffold imports, future purchased/prismatic ids). */
export function registerPalette(id: string, hex: string[]): void {
  reg(id, paletteFromHex(hex))
}

/** Register an already-packed palette (tints/derived variants). */
export function registerPaletteRaw(id: string, p: Palette): void {
  reg(id, p)
}
