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
const RARITY_ACCENTS: Record<string, Partial<Record<number, string>>> = {
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
reg('biome/meadow', BASE_TILE)
reg('biome/ashen', composePalette(BASE_TILE, {
  5: '#4c2c1c', 6: '#6c3c24', 7: '#8c4c2c', 8: '#b06438',
  9: '#5c2414', 10: '#84341c', 11: '#ac4424', 12: '#d45c30',
}))
reg('biome/gloom', composePalette(BASE_TILE, {
  5: '#241c3c', 6: '#342a54', 7: '#443a6c', 8: '#584c88',
  9: '#141c3c', 10: '#1c2a58', 11: '#283a74', 12: '#384c94',
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
