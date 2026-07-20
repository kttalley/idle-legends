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
import { getPalette, hasPalette, registerPaletteRaw, RARITY_ACCENTS } from '../palettes'

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

/**
 * Compose (and lazily register + cache) the palette for a full hero look. Returns a
 * stable palette id the Scene can render directly.
 */
export function heroPaletteId(
  playerClass: ClassType,
  race: RaceType,
  faction: FactionType,
  rarity: Rarity = 'common',
): string {
  const id = `hero/${playerClass}/${race}/${faction}/${rarity}`
  if (hasPalette(id)) return id
  const base = getPalette(RACE_PALETTE[race] ?? 'race/human')  // skin ramp (1–4)
  const overrides: Partial<Record<number, string>> = {
    ...CLASS_TUNIC[playerClass],
    ...FACTION_TRIM[faction],
    ...(RARITY_ACCENTS[rarity] ?? RARITY_ACCENTS.common),
  }
  registerPaletteRaw(id, composePalette(base, overrides))
  return id
}
