// Item / gear-slot iconography (original art, authored programmatically in the runtime
// indexed format — same path as placeholderArt.ts). Two 16×16 sheets, because they answer
// to two different palette contracts:
//
//   • GEAR sheet (`icons/gear`) — the six equipment slots, drawn on the UNIT slot contract
//     (graphics-spec §5.1): 1–4 organic (leather/wood/bone), 5–8 primary material, 9–12
//     secondary trim, 13–15 metal/accent RESERVED as the rarity signal. That means one rig
//     × N palettes: the same six frames render as a common iron kit or a legendary gold one
//     purely by swapping paletteId to `item/<rarity>` (or `item/t3+epic` for tier × rarity).
//     Every gear icon deliberately puts its most eye-catching feature — blade, helm nasal,
//     belt buckle, knee plates, boot strap, amulet gem — in 13–15, so rarity is what the eye
//     lands on first at 18px.
//
//   • ITEM sheet (`icons/item`) — materials, reagents and crafted goods. These never
//     rarity-swap; they need to read as *different substances* side by side (ore vs herb vs
//     cloth vs potion), which one recolourable ramp cannot do. So they use the UI icon
//     contract already established by `makeIconSheet` and ship on the same `icon/base`
//     palette: 1–4 steel/bone/white · 5–8 warm · 9–12 cool · 13 nature-green · 14
//     treasure-gold · 15 arcane-purple.
//
// Art is authored as 16×16 ASCII sketches in the docs/art-direction.md character key
// ('.' = slot 0 transparent, '1'–'9' = slots 1–9, 'A'–'F' = slots 10–15) so the pixels stay
// reviewable in source, and parsed into the sheet at module load. Silhouette over interior
// detail throughout: these render at ~18px, where a shape reads and a texture does not.

import { Painter, type IconSketch } from './placeholderArt'
import type { IndexedSprite } from './types'

const IN = 16 // icon frame size, matching the existing UI icon sheet

/** Paint one ASCII sketch into frame `f`. Malformed rows warn (dev) rather than crash. */
function paint(p: Painter, f: number, rows: IconSketch): void {
  if (rows.length !== IN) console.warn(`[itemIcons] frame ${f}: ${rows.length} rows, expected ${IN}`)
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    if (row.length !== IN) console.warn(`[itemIcons] frame ${f} row ${y}: ${row.length} cols, expected ${IN}`)
    for (let x = 0; x < row.length; x++) {
      const c = row.charCodeAt(x)
      if (c === 46) continue // '.'
      p.px(f, x, y, c <= 57 ? c - 48 : c - 55) // '0'-'9' → 0-9 · 'A'-'F' → 10-15
    }
  }
}

const STILL = { frames: [0], fps: 1, loop: true }
function sheetOf(id: string, p: Painter, frames: number): IndexedSprite {
  return {
    id, frameW: IN, frameH: IN, cols: frames, frameCount: frames,
    indices: p.data, anchor: { x: 8, y: 8 },
    animations: {
      idle: { se: STILL, ne: STILL }, walk: { se: STILL, ne: STILL },
      attack: { se: STILL, ne: STILL }, hit: { se: STILL, ne: STILL },
    },
  }
}

// ── Gear slots ────────────────────────────────────────────────────────────────
// Slot map for every frame below: 1–4 organic (grip leather, cord) · 5–8 armour material
// (gear tier) · 9–12 cloth/trim · 13–15 metal = RARITY. Frame order matches the data
// layer's `Slot` union, but the ids stay plain strings — src/render never imports game code.

/** Semantic gear key → frame index in the gear sheet. Mirrors data/types `Slot`. */
export const GEAR_ICON = {
  weapon: 0, helm: 1, chest: 2, legs: 3, boots: 4, trinket: 5,
} as const
export type GearIconKey = keyof typeof GEAR_ICON

// A broadsword stood on its pommel: the whole blade is the rarity ramp, so the icon's
// dominant mass is the rarity read. Grip in organic leather keeps it from going all-metal.
const S_WEAPON: IconSketch = [
  '................',
  '.......FE.......',
  '......EFED......',
  '......EFED......',
  '......EFED......',
  '......EFED......',
  '......EFED......',
  '......EFED......',
  '......EFED......',
  '...DEEEEEEEED...',
  '...DDDDDDDDDD...',
  '......2332......',
  '......2332......',
  '.....DEEEED.....',
  '......DEED......',
  '................',
]

// A great helm: dome, then a visor band that juts out WIDER than the dome, then a flat
// chin. The jut is deliberate — a helm that merely tapers to a point is a shield, and the
// UI already shows a shield icon. Nasal bar and crest sit in the rarity channel; the eye
// slits drop into the dark trim ramp so the face reads as a void.
const S_HELM: IconSketch = [
  '................',
  '.......EE.......',
  '.....888888.....',
  '....88777788....',
  '...8777777776...',
  '...8777ED7776...',
  '..99999ED99999..',
  '..AAAAAEDAAAAA..',
  '...7777ED7777...',
  '...7666ED6665...',
  '...7666ED6665...',
  '...6666556666...',
  '....66555566....',
  '.....555555.....',
  '................',
  '................',
]

// A cuirass: wide pauldrons over a narrow waist — the classic hourglass that separates
// "body armour" from "leg armour" at a glance. Belt buckle + chest studs carry the rarity.
const S_CHEST: IconSketch = [
  '................',
  '................',
  '....88....88....',
  '..8877CCCC7788..',
  '..877677776778..',
  '....76777776....',
  '....76777776....',
  '....767EE776....',
  '....76777776....',
  '....76777776....',
  '....76777776....',
  '...AAAAEEAAAA...',
  '...9999DD9999...',
  '....66666665....',
  '.....555555.....',
  '................',
]

// Legplates: one belt spanning the top, then two tapering legs with a hard gap between
// them — the gap is the whole read, and it's what keeps this from reading as a chest.
const S_LEGS: IconSketch = [
  '................',
  '................',
  '...AAAAAAAAAA...',
  '...9999EE9999...',
  '...7777777776...',
  '...7777777776...',
  '...7776..7776...',
  '...7776..7776...',
  '...EEED..EEED...',
  '...7776..7776...',
  '...7776..7776...',
  '...7776..7776...',
  '....776...776...',
  '....776...776...',
  '....999...999...',
  '................',
]

// A pair of boots, side by side: two shafts over two forward-jutting feet. Drawn as a pair
// (not one boot) because the L-shape alone reads as a single greave at icon size.
const S_BOOTS: IconSketch = [
  '................',
  '................',
  '................',
  '....CCC....CCC..',
  '....777....777..',
  '....776....776..',
  '....776....776..',
  '....776....776..',
  '....EEE....EEE..',
  '....776....776..',
  '....776....776..',
  '...6776...6776..',
  '..66776..66776..',
  '..66666..66666..',
  '..55555..55555..',
  '................',
]

// An amulet: a thin chain converging into a large faceted gem. The gem is pure 13–15, so
// the trinket slot is the most literal rarity billboard in the set.
const S_TRINKET: IconSketch = [
  '................',
  '...B........B...',
  '....B......B....',
  '.....B....B.....',
  '......B..B......',
  '.......BB.......',
  '......EFFE......',
  '.....EFFEED.....',
  '....EFFEEEED....',
  '....EFEEEEED....',
  '.....EEEEED.....',
  '......EEED......',
  '.......ED.......',
  '................',
  '................',
  '................',
]

export function makeGearIconSheet(id = 'icons/gear'): IndexedSprite {
  const p = new Painter(IN, IN, 6)
  paint(p, GEAR_ICON.weapon, S_WEAPON)
  paint(p, GEAR_ICON.helm, S_HELM)
  paint(p, GEAR_ICON.chest, S_CHEST)
  paint(p, GEAR_ICON.legs, S_LEGS)
  paint(p, GEAR_ICON.boots, S_BOOTS)
  paint(p, GEAR_ICON.trinket, S_TRINKET)
  return sheetOf(id, p, 6)
}

/** Palette id for a gear icon. `tier` is optional — `item/<rarity>` alone is the common
 *  case; pass t1..t4 for the tier × rarity composition (both are registered). */
export function gearPaletteId(rarity?: string, tier?: string): string {
  if (!rarity) return tier ? `item/${tier}` : 'item/base'
  return tier ? `item/${tier}+${rarity}` : `item/${rarity}`
}

// ── Materials, reagents & crafted goods ───────────────────────────────────────
// Drawn on the `icon/base` UI contract (see header). Covers every material category in
// data/professions.ts (ore, gem-grade ore, cloth, blossom, bone, hide) plus the crafted
// output categories the recipe table actually uses.

/** Semantic item key → frame index in the item sheet. */
export const ITEM_ICON = {
  ore: 0, gem: 1, cloth: 2, blossom: 3, bone: 4, pelt: 5, potion: 6, scroll: 7,
  orb: 8, bandage: 9, kit: 10, mask: 11, sigil: 12, whetstone: 13, mote: 14, ingot: 15,
} as const
export type ItemIconKey = keyof typeof ITEM_ICON

/** Emoji in game data → item icon key. Deliberately disjoint from placeholderArt's
 *  `EMOJI_ICON`: SpriteIcon checks that map first, so nothing already covered by the base
 *  sheet (⚔ 🛡 🗡 🌿 ✨ 🔥 ⛏ 🔨 💀 🩸 🌑 …) changes behaviour. This map only fills gaps. */
export const EMOJI_ITEM_ICON: Record<string, ItemIconKey> = {
  '🪨': 'ore', '⛰': 'ore', '💎': 'gem', '💍': 'gem',
  '🧵': 'cloth', '🧶': 'cloth', '🌸': 'blossom', '🌺': 'blossom', '🌼': 'blossom',
  '🦴': 'bone', '🐾': 'pelt', '🧪': 'potion', '⚗': 'potion', '📜': 'scroll', '📃': 'scroll',
  '🔮': 'orb', '🩹': 'bandage', '🦺': 'kit', '🥷': 'mask', '🎭': 'mask',
  '💠': 'sigil', '⚒': 'whetstone', '🪓': 'whetstone',
  '🌀': 'mote', '💜': 'mote', '🖤': 'mote', '🟣': 'mote', '🧱': 'ingot', '🥉': 'ingot',
}

// Raw ore: a chipped rock mass (steel ramp, top-lit) with a warm metal vein running
// through it — the vein is what stops it reading as a generic pebble.
const S_ORE: IconSketch = [
  '................',
  '................',
  '................',
  '................',
  '......3333......',
  '.....333333.....',
  '....33377233....',
  '...3322772223...',
  '...3227722221...',
  '...2227222111...',
  '...2222221111...',
  '....22211111....',
  '.....211111.....',
  '................',
  '................',
  '................',
]

// Cut gem (mithril/thorium-grade drops): table on top over shouldered crown, tapering
// pavilion below, one white glint. Cool ramp so it never collides with the warm ore.
const S_GEM: IconSketch = [
  '................',
  '................',
  '................',
  '.....CCCCCC.....',
  '....B4CCCCCB....',
  '...BBCCCCCCBB...',
  '...BBBBBBBBBB...',
  '....ABBBBBBA....',
  '.....ABBBBA.....',
  '.....AABBAA.....',
  '......AAAA......',
  '.......AA.......',
  '................',
  '................',
  '................',
  '................',
]

// A bolt of cloth: folded stack banded with a gold ribbon. The horizontal banding is the
// silhouette cue — nothing else in the set is a wide flat slab.
const S_CLOTH: IconSketch = [
  '................',
  '................',
  '................',
  '................',
  '....BBBBBBBB....',
  '...BCCCCCCCCA...',
  '...BCCCCCCCCA...',
  '...BEEEEEEEEA...',
  '...BCCCCCCCCA...',
  '...BCCCCCCCCA...',
  '...AAAAAAAAAA...',
  '....AAAAAAAA....',
  '................',
  '................',
  '................',
  '................',
]

// Blossom herb (kingsblood / dreamfoil tier): four-lobe bloom on a leafed stem. Arcane
// purple bloom + nature-green stem separates it from the plain green sprig in icons/base.
const S_BLOSSOM: IconSketch = [
  '................',
  '................',
  '................',
  '................',
  '.....FF..FF.....',
  '....FFFFFFFF....',
  '....FFFEEFFF....',
  '....FFFEEFFF....',
  '....FFFFFFFF....',
  '.....FF..FF.....',
  '......DD........',
  '......DD........',
  '....DDDDD.......',
  '......DD........',
  '......DD........',
  '................',
]

// Bone (skinning's low tier): the knobbed-femur dumbbell shape — unmistakable at 8px,
// and pure bone-white so it reads against every panel background.
const S_BONE: IconSketch = [
  '................',
  '................',
  '.....44..44.....',
  '.....444444.....',
  '......4444......',
  '......4433......',
  '......4433......',
  '......4433......',
  '......4433......',
  '......4433......',
  '......4433......',
  '......4433......',
  '......4444......',
  '.....444444.....',
  '.....44..44.....',
  '................',
]

// A stretched hide, laid out flat like a rug: head bump, tail, and four legs splayed
// sideways. The legs go OUT, not up — pointing them up turned the hide into a pair of ears
// and the whole icon read as an animal's face.
const S_PELT: IconSketch = [
  '................',
  '................',
  '................',
  '.......77.......',
  '..777777777777..',
  '..777766667777..',
  '...7666666667...',
  '...7666666667...',
  '...7666666667...',
  '..777766667777..',
  '..777777777777..',
  '.......77.......',
  '................',
  '................',
  '................',
  '................',
]

// Potion/flask: corked round-bottom glass with a green draught. Drawn as an outline (glass)
// around a filled core (liquid) so the "container" read survives at small size.
const S_POTION: IconSketch = [
  '................',
  '.......88.......',
  '.......33.......',
  '.......33.......',
  '......3..3......',
  '.....3....3.....',
  '....3......3....',
  '....3.DDDD.3....',
  '....3DDDDDD3....',
  '....34DDDDD3....',
  '....3DDDDDD3....',
  '.....3DDDD3.....',
  '......3333......',
  '................',
  '................',
  '................',
]

// Scroll: parchment sheet with dark rolled bars top and bottom and three text lines. The
// two bars are what distinguish it from the bandage pad.
const S_SCROLL: IconSketch = [
  '................',
  '................',
  '................',
  '..222222222222..',
  '..233333333332..',
  '...4444444444...',
  '...4411114444...',
  '...4444444444...',
  '...4411111144...',
  '...4444444444...',
  '...4411114444...',
  '...4444444444...',
  '..233333333332..',
  '..222222222222..',
  '................',
  '................',
]

// Focus orb on a gold stand: sphere with an arcane swirl inside. The stand is the tell —
// a bare sphere would collide with the mote.
const S_ORB: IconSketch = [
  '................',
  '................',
  '................',
  '......AAAA......',
  '....AABBBBAA....',
  '...ABBCCBBBAA...',
  '...ABCCBFFBBA...',
  '...ABBFFFFBBA...',
  '...ABBBFFBBBA...',
  '...AABBBBBBAA...',
  '....AABBBBAA....',
  '......AAAA......',
  '.....EEEEEE.....',
  '....EEEEEEEE....',
  '................',
  '................',
]

// Bandage pad: white dressing with a red cross. The only pure-white mass in the sheet.
const S_BANDAGE: IconSketch = [
  '................',
  '................',
  '................',
  '................',
  '....33333333....',
  '...4444444444...',
  '...4444664444...',
  '...4466666644...',
  '...4466666644...',
  '...4444664444...',
  '...4444444444...',
  '....33333333....',
  '................',
  '................',
  '................',
  '................',
]

// Armour kit: a patch of tanned hide, corners cut off and a dashed gold seam across the
// middle. The cut corners and the stitching are what keep it from reading as a plain card;
// the warm ramp keeps it clear of the white bandage pad.
const S_KIT: IconSketch = [
  '................',
  '................',
  '................',
  '................',
  '....55555555....',
  '...5777777775...',
  '...5777777775...',
  '...5787878785...',
  '...5777777775...',
  '...5777777775...',
  '....55555555....',
  '................',
  '................',
  '................',
  '................',
  '................',
]

// Hood/mask: a cowl outline with a void interior and two lit eyes — the rogue's crafted
// goods and the skinning profession's own icon.
const S_MASK: IconSketch = [
  '................',
  '................',
  '................',
  '.....222222.....',
  '....22222222....',
  '...2222222222...',
  '...2211111122...',
  '...221E11E122...',
  '...2211111122...',
  '...2222222222...',
  '....22222222....',
  '.....222222.....',
  '................',
  '................',
  '................',
  '................',
]

// Sigil/insignia: a gold-rimmed arcane diamond with a lit core. Diamond, not circle, so it
// separates from the orb and mote in the same list.
const S_SIGIL: IconSketch = [
  '................',
  '................',
  '................',
  '.......EE.......',
  '......EFFE......',
  '.....EFFFFE.....',
  '....EFFFFFFE....',
  '...EFFFCCFFFE...',
  '...EFFFCCFFFE...',
  '....EFFFFFFE....',
  '.....EFFFFE.....',
  '......EFFE......',
  '.......EE.......',
  '................',
  '................',
  '................',
]

// Whetstone/hone: an angled sharpening bar throwing sparks. Diagonal on purpose — every
// other consumable in the sheet is axis-aligned, so this one reads by its slant alone.
const S_WHETSTONE: IconSketch = [
  '................',
  '................',
  '................',
  '..............8.',
  '............8...',
  '........33333...',
  '.......333332...',
  '......333332....',
  '.....333332.....',
  '....333332......',
  '...333332.......',
  '...33322........',
  '................',
  '................',
  '................',
  '................',
]

// Arcane mote: a glowing core with four loose sparks — the warlock/mage crafted-buff
// category (tinctures, phylacteries, weaves) that has no physical object to draw.
const S_MOTE: IconSketch = [
  '................',
  '................',
  '................',
  '....F.......F...',
  '......FFFF......',
  '.....FFFFFF.....',
  '....FFFCCFFF....',
  '....FFCCCCFF....',
  '....FFCCCCFF....',
  '....FFFCCFFF....',
  '.....FFFFFF.....',
  '......FFFF......',
  '....F.......F...',
  '................',
  '................',
  '................',
]

// Refined ingot: a smelted bar with a lit top face. The "processed" counterpart to raw
// ore — unmapped today, but the category the smithing chain plainly implies.
const S_INGOT: IconSketch = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....888888.....',
  '....88888888....',
  '...EEEEEEEEEE...',
  '...EEEEEEEEEE...',
  '...7777777777...',
  '................',
  '................',
  '................',
  '................',
  '................',
]

export function makeItemIconSheet(id = 'icons/item'): IndexedSprite {
  const p = new Painter(IN, IN, 16)
  paint(p, ITEM_ICON.ore, S_ORE)
  paint(p, ITEM_ICON.gem, S_GEM)
  paint(p, ITEM_ICON.cloth, S_CLOTH)
  paint(p, ITEM_ICON.blossom, S_BLOSSOM)
  paint(p, ITEM_ICON.bone, S_BONE)
  paint(p, ITEM_ICON.pelt, S_PELT)
  paint(p, ITEM_ICON.potion, S_POTION)
  paint(p, ITEM_ICON.scroll, S_SCROLL)
  paint(p, ITEM_ICON.orb, S_ORB)
  paint(p, ITEM_ICON.bandage, S_BANDAGE)
  paint(p, ITEM_ICON.kit, S_KIT)
  paint(p, ITEM_ICON.mask, S_MASK)
  paint(p, ITEM_ICON.sigil, S_SIGIL)
  paint(p, ITEM_ICON.whetstone, S_WHETSTONE)
  paint(p, ITEM_ICON.mote, S_MOTE)
  paint(p, ITEM_ICON.ingot, S_INGOT)
  return sheetOf(id, p, 16)
}
