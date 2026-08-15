// ── Hero wardrobe ────────────────────────────────────────────────────────────
// The player's look is a palette composed from four independent axes, mapped onto
// the humanoid rig's semantic slot bands (graphics-spec §5.1):
//   1–4  skin   ← race       5–8  primary/tunic ← class
//   9–12 trim   ← faction    13–15 accent       ← rarity (the itemization signal)
// This is the "palette registry is the wardrobe" premise made concrete: one rig,
// N looks, all data. The same id is used for the in-world hero (combatAdapter) and
// the character-creation preview, so what you build is what you play.

import type { ClassType, RaceType, FactionType, Rarity } from '../../data/types'
import { composePalette } from '../palette'
import { getPalette, hasPalette, registerPaletteRaw, RARITY_ACCENTS, applyBiomeAmbient } from '../palettes'
import { getColorway, DEFAULT_COLORWAY } from '../colorways'
import { UNIQUE_BY_ID } from '../../data/uniques'

// Race → skin base palette id. (tauren → hornborn rig palette; Track R rename is
// display-only, the renderer just needs a palette id that exists.)
export const RACE_PALETTE: Record<RaceType, string> = {
  human: 'race/human', dwarf: 'race/dwarf', elf: 'race/elf', orc: 'race/orc',
  troll: 'race/troll', goblin: 'race/goblin', gnome: 'race/gnome',
  tauren: 'race/hornborn',
}

// Class → tunic ramp on primary slots 5–8 (dark→light). Colours mirror the class
// identity players already see on the procedural avatars (CLASS_PALETTES): warrior
// red, mage blue, rogue green, warlock violet.
const CLASS_TUNIC: Record<ClassType, Partial<Record<number, string>>> = {
  warrior: { 5: '#6a1a0a', 6: '#a03018', 7: '#d05030', 8: '#ff8050' },
  mage:    { 5: '#0c1860', 6: '#1a30a0', 7: '#3050d8', 8: '#70a0ff' },
  rogue:   { 5: '#0c2010', 6: '#186030', 7: '#309050', 8: '#50d880' },
  warlock: { 5: '#280a40', 6: '#5010a0', 7: '#8030d0', 8: '#c050ff' },
}

// Faction → trim ramp on secondary slots 9–12 (cloth/leggings). Kept subdued so it
// reads as an allegiance trim, not a second tunic. Neutral gets a muted bronze.
const FACTION_TRIM: Record<FactionType, Partial<Record<number, string>>> = {
  alliance: { 9: '#1c3a5c', 10: '#2a5a8c', 11: '#3c78b4', 12: '#5a98d4' },
  horde:    { 9: '#4c1414', 10: '#6e2020', 11: '#963030', 12: '#c04a3a' },
  neutral:  { 9: '#3a3020', 10: '#5a4a2c', 11: '#7c663c', 12: '#9c854c' },
}

/** Resolve an accent key to its slot 13–15 overrides. Falls back to common, so an
 *  unknown unique id degrades to a plain hero rather than an uncoloured one. */
function accentsFor(key: AccentKey): Partial<Record<number, string>> {
  if (key.startsWith('unique:')) {
    const def = UNIQUE_BY_ID[key.slice('unique:'.length)]
    if (def) return { 13: def.accent[0], 14: def.accent[1], 15: def.accent[2] }
    return RARITY_ACCENTS.legendary
  }
  return RARITY_ACCENTS[key] ?? RARITY_ACCENTS.common
}

/**
 * What drives the accent band: a rarity, or a specific unique.
 *
 * Slots 13–15 are the itemization signal, so a worn unique claiming them is the payoff
 * the whole palette-as-content premise was built for — twelve visibly distinct heroes for
 * twelve rows of colour and no new art. A unique is minted legendary, so without this it
 * would look exactly like any other legendary the hero has ever worn.
 */
export type AccentKey = Rarity | `unique:${string}`

/**
 * Compose (and lazily register + cache) the palette for a full hero look. Returns a
 * stable palette id the Scene can render directly.
 */
export function heroPaletteId(
  playerClass: ClassType,
  race: RaceType,
  faction: FactionType,
  rarity: AccentKey = 'common',
  colorway: string = DEFAULT_COLORWAY,
  biome?: string,
): string {
  // The colorway is part of the cache key, so an equipped skin is a distinct registered
  // palette rather than a mutation of the base one — two heroes in the same party can
  // wear different colorways in the same frame.
  const cw = getColorway(colorway)
  // Biome is a full axis of the cache key, not a mutation: the same hero in two zones is two
  // registered palettes, so walking between zones is a lookup rather than a recompose, and
  // two heroes standing in different zones can render in the same frame.
  const id = `hero/${playerClass}/${race}/${faction}/${rarity}/${cw.id}${biome ? `/${biome}` : ''}`
  if (hasPalette(id)) return id
  const base = getPalette(RACE_PALETTE[race] ?? 'race/human')  // skin ramp (1–4)
  const overrides: Partial<Record<number, string>> = {
    ...CLASS_TUNIC[playerClass],
    ...FACTION_TRIM[faction],
    ...accentsFor(rarity),
    // Last, so a purchased colorway wins over class/faction/rarity — that is the point
    // of buying it. It deliberately carries no slots 1–4, so race skin always survives.
    ...cw.overrides,
  }
  // Ambient LAST, over the finished look. It has to see the actual colours the hero ended up
  // wearing to solve its strength against them — a colorway or a legendary accent changes how
  // much tint the figure can absorb before it stops separating from the ground.
  const composed = composePalette(base, overrides)
  registerPaletteRaw(id, biome ? applyBiomeAmbient(composed, biome) : composed)
  return id
}
