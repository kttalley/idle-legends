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

// ── Elite: shifted primary + hot accent over the base ────────────────────────
reg('elite', composePalette(BASE_UNIT, {
  5: '#441c1c', 6: '#682a2a', 7: '#8c3c3c', 8: '#b45454',
  13: '#8c2014', 14: '#c83820', 15: '#f46434',
}))

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
// biome/map080 is the faithful FFTA map #080 grassland palette, decoded straight
// from the ROM via the sibling ff-tactics-decomp editor sidecar (/api/map_full?id=80).
// Bank 0 of that map: deep water blues, teal→yellow-green grass, pale stone/cream
// highlights — slotted onto the tileset's semantic channels (5-8 veg, 9-12 water,
// 13-15 stone, 1-4 earth/path). This is the environment's default look.
reg('biome/map080', paletteFromHex([
  '',
  '#7b94a4', '#9cb4b4', '#cdcdbe', '#e6e6cd', // 1-4 earth / path (pale stone→cream)
  '#184a52', '#187b73', '#399c73', '#accd6a', // 5-8 vegetation (teal→yellow-green)
  '#294152', '#295a73', '#39738b', '#527b9c', // 9-12 water (deep blue→blue)
  '#9cb4b4', '#cdcdbe', '#e6e6cd',            // 13-15 stone / cliff faces
]))
// biome/meadow is the default grassland look (alias of map080) — also used by the
// dev harness, so the id must stay registered.
reg('biome/meadow', REGISTRY.get('biome/map080')!)

// Per-zone biome variety (environment-plan Phase A): each biome is map080 with its
// four semantic channels — earth/path (1-4), vegetation (5-8), water (9-12), stone
// (13-15) — swapped to a coherent character. All palette-indexed, so a biome palette
// also tints any future props/tiles authored against the same slots. Original art:
// no FFTA pixels or constants are reused, only the slot convention.
const M080 = (): Palette => REGISTRY.get('biome/map080')!
function biome(ch: { e: readonly string[]; v: readonly string[]; w: readonly string[]; s: readonly string[] }): Palette {
  const o: Record<number, string> = {}
  ch.e.forEach((h, i) => { o[i + 1] = h })
  ch.v.forEach((h, i) => { o[i + 5] = h })
  ch.w.forEach((h, i) => { o[i + 9] = h })
  ch.s.forEach((h, i) => { o[i + 13] = h })
  return composePalette(M080(), o)
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
