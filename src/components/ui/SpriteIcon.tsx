import React, { useEffect, useRef } from 'react'
import { makeIconSheet, ICON, EMOJI_ICON, type IconKey } from '../../render/placeholderArt'
import {
  makeGearIconSheet, makeItemIconSheet, GEAR_ICON, ITEM_ICON, EMOJI_ITEM_ICON,
  gearPaletteId, type GearIconKey, type ItemIconKey,
} from '../../render/itemIcons'
import {
  makeTalentIconSheet, TALENT_ICON, TALENT_ICON_BY_ID, type TalentIconKey,
} from '../../render/talentIcons'
import { makeUiIconSheet, UI_ICON, EMOJI_UI_ICON, type UiIconKey } from '../../render/uiIcons'
import { bakedSheet } from '../../render/palette'
import { getPalette } from '../../render/palettes'
import type { IndexedSprite } from '../../render/types'

// Pixel UI icon (Phase 4). Renders a frame from one of three shared indexed sheets,
// palette-tinted, crisp-scaled to `size`:
//   • base   (icons/base) — abilities, nav, schools; resolved by `icon` key or emoji.
//   • gear   (icons/gear) — the six equipment slots; resolved by `gear`, tinted by `rarity`
//                           (and optionally material `tier`) through the item palettes.
//   • item   (icons/item) — materials, reagents and crafted goods; by `item` key or emoji.
//   • talent (icons/talent) — talent-tree nodes, resolved from the talent's own id.
//   • ui     (icons/ui)     — shell chrome (lock, map, coin, trophy, warn, …).
// If nothing resolves it falls back to rendering the emoji glyph, so existing emoji-labelled
// content keeps working and adoption stays incremental.

const BASE_SHEET = makeIconSheet()
const GEAR_SHEET = makeGearIconSheet()
const ITEM_SHEET = makeItemIconSheet()
const TALENT_SHEET = makeTalentIconSheet()
const UI_SHEET = makeUiIconSheet()

interface Props {
  icon?: IconKey
  /** Equipment slot ('weapon' | 'helm' | …). Renders the gear sheet, tinted by `rarity`. */
  gear?: GearIconKey
  /** Material / crafted-good key ('ore' | 'potion' | …). */
  item?: ItemIconKey
  /** Talent archetype, or `talentId` to look one up from the id map. */
  talent?: TalentIconKey
  talentId?: string
  /** Shell chrome key ('lock' | 'coin' | …). */
  ui?: UiIconKey
  /** Rarity for a `gear` icon — drives the 13–15 accent channel. */
  rarity?: string
  /** Material tier ('t1'..'t4') for a `gear` icon — drives the 5–12 material channels. */
  tier?: string
  emoji?: string
  size?: number
  /** Explicit palette override; otherwise each sheet uses its own default. */
  paletteId?: string
  title?: string
}

interface Resolved {
  sheet: IndexedSprite
  frame: number
  palette: string
}

function resolve({ icon, gear, item, talent, talentId, ui, rarity, tier, emoji }: Props): Resolved | null {
  if (gear != null) {
    return { sheet: GEAR_SHEET, frame: GEAR_ICON[gear], palette: gearPaletteId(rarity, tier) }
  }
  if (item != null) return { sheet: ITEM_SHEET, frame: ITEM_ICON[item], palette: 'icon/base' }
  if (ui != null) return { sheet: UI_SHEET, frame: UI_ICON[ui], palette: 'icon/base' }
  const talentKey = talent ?? (talentId != null ? TALENT_ICON_BY_ID[talentId] : undefined)
  if (talentKey != null) return { sheet: TALENT_SHEET, frame: TALENT_ICON[talentKey], palette: 'icon/base' }
  if (icon != null) return { sheet: BASE_SHEET, frame: ICON[icon], palette: 'icon/base' }
  if (emoji == null) return null
  // Strip the emoji variation selector (U+FE0F) so e.g. '⛏️' matches the '⛏' map key.
  const key = emoji.replace(/️/g, '')
  // Base sheet wins: everything it already claimed keeps rendering exactly as before, and
  // the item map only fills the gaps (materials, reagents, crafted goods).
  const baseKey = EMOJI_ICON[key]
  if (baseKey != null) return { sheet: BASE_SHEET, frame: ICON[baseKey], palette: 'icon/base' }
  const itemKey = EMOJI_ITEM_ICON[key]
  if (itemKey != null) return { sheet: ITEM_SHEET, frame: ITEM_ICON[itemKey], palette: 'icon/base' }
  const uiKey = EMOJI_UI_ICON[key]
  if (uiKey != null) return { sheet: UI_SHEET, frame: UI_ICON[uiKey], palette: 'icon/base' }
  return null
}

export function SpriteIcon(props: Props) {
  const { emoji, size = 24, paletteId, title } = props
  const hit = resolve(props)
  const sheet = hit?.sheet
  const frame = hit?.frame
  const palette = paletteId ?? hit?.palette ?? 'icon/base'
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (sheet == null || frame == null) return
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    const baked = bakedSheet(sheet, palette, getPalette(palette))
    const fw = sheet.frameW
    ctx.drawImage(baked, frame * fw, 0, fw, fw, 0, 0, size, size)
  }, [sheet, frame, palette, size])

  // Fallback: no sprite for this emoji → render the glyph so nothing disappears.
  if (hit == null) {
    return (
      <span title={title} style={{ fontSize: size * 0.82, lineHeight: 1, display: 'inline-block' }}>
        {emoji}
      </span>
    )
  }

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      title={title}
      style={{
        width: size, height: size, imageRendering: 'pixelated',
        display: 'inline-block', verticalAlign: 'middle', flexShrink: 0,
      }}
    />
  )
}
