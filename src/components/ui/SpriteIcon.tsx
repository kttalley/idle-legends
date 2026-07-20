import React, { useEffect, useRef } from 'react'
import { makeIconSheet, ICON, EMOJI_ICON, type IconKey } from '../../render/placeholderArt'
import { bakedSheet } from '../../render/palette'
import { getPalette } from '../../render/palettes'

// Pixel UI icon (Phase 4). Renders a frame from the shared icon sheet, palette-tinted,
// crisp-scaled to `size`. Resolves by explicit `icon` key or by mapping an `emoji` from
// game data; if neither maps to a frame it falls back to rendering the emoji glyph, so
// existing emoji-labelled content keeps working and adoption is incremental.

const SHEET = makeIconSheet() // one shared indexed sheet; bakes are cached per palette

interface Props {
  icon?: IconKey
  emoji?: string
  size?: number
  paletteId?: string
  title?: string
}

export function SpriteIcon({ icon, emoji, size = 24, paletteId = 'icon/base', title }: Props) {
  // Strip the emoji variation selector (U+FE0F) so e.g. '⛏️' matches the '⛏' map key.
  const key = emoji?.replace(/️/g, '')
  const iconKey: IconKey | undefined = icon ?? (key != null ? EMOJI_ICON[key] : undefined)
  const frame = iconKey != null ? ICON[iconKey] : undefined
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (frame == null) return
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    const sheet = bakedSheet(SHEET, paletteId, getPalette(paletteId))
    const fw = SHEET.frameW
    ctx.drawImage(sheet, frame * fw, 0, fw, fw, 0, 0, size, size)
  }, [frame, paletteId, size])

  // Fallback: no sprite for this emoji → render the glyph so nothing disappears.
  if (frame == null) {
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
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  )
}
