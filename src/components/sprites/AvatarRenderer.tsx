import React, { useMemo } from 'react'
import type { ClassType } from '../../data/types'

// ── Seeded RNG ─────────────────────────────────────────────────────────────────
function rand(seed: number, n: number): number {
  const x = Math.sin(seed * 9301 + n * 49297 + 233) * 16807
  return x - Math.floor(x)
}

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Grid constants ─────────────────────────────────────────────────────────────
const GW   = 5   // grid width (full)
const GH   = 5   // grid height — square 5×5
const HALF = 3   // generated cols: 0, 1, 2 → mirrored to [0,1,2,1,0]

// ── Palettes ───────────────────────────────────────────────────────────────────
export interface AvatarPalette {
  shades: string[]   // darkest → brightest, used for body cells
  glow:   string     // accent glow / eye color
}

// Class palettes — player characters only
export const CLASS_PALETTES: Record<ClassType, AvatarPalette> = {
  warrior: {
    shades: ['#3a0c05', '#6a1a0a', '#a03018', '#d05030', '#ff8050'],
    glow:   '#ff6020',
  },
  mage: {
    shades: ['#050a30', '#0c1860', '#1a30a0', '#3050d8', '#70a0ff'],
    glow:   '#80c0ff',
  },
  rogue: {
    shades: ['#051005', '#0c2010', '#186030', '#309050', '#50d880'],
    glow:   '#40ff88',
  },
  warlock: {
    shades: ['#100520', '#280a40', '#5010a0', '#8030d0', '#c050ff'],
    glow:   '#c040ff',
  },
}

// Mob palettes — deliberately distinct from class colors (no red/blue/green/purple)
const MOB_PALETTE_LIST: AvatarPalette[] = [
  { shades: ['#0a0800', '#201800', '#504010', '#807030', '#b0a060'], glow: '#c8a840' }, // sandy gold
  { shades: ['#060202', '#140606', '#3c1010', '#681c1c', '#a02828'], glow: '#e04040' }, // corrupted crimson
  { shades: ['#04060a', '#0a1020', '#182840', '#2c4870', '#4070a8'], glow: '#30c0e0' }, // deep teal
  { shades: ['#080402', '#180e04', '#402808', '#704010', '#a06018'], glow: '#d08020' }, // dried-blood ochre
  { shades: ['#060208', '#100418', '#300840', '#581060', '#901890'], glow: '#c030b0' }, // toxic magenta
]

export function mobAvatarPalette(seed: number, isElite: boolean, isBoss: boolean): AvatarPalette {
  if (isBoss) return {
    shades: ['#201000', '#402000', '#805000', '#c09000', '#ffd700'],
    glow: '#ffd700',
  }
  const base = MOB_PALETTE_LIST[seed % MOB_PALETTE_LIST.length]
  if (isElite) return { ...base, glow: '#e8c840' }   // elite = gold tint
  return base
}

// ── Grid generation ────────────────────────────────────────────────────────────
function generateGrid(seed: number): boolean[][] {
  // 1. Raw noise for left half (cols 0..HALF-1)
  const raw: boolean[][] = Array.from({ length: GH }, (_, r) =>
    Array.from({ length: HALF }, (_, c) => rand(seed, r * HALF + c) > 0.38)
  )

  // 2. One CA smoothing pass — removes stray lone pixels, fills small gaps
  const smooth = raw.map((row, r) => row.map((active, c) => {
    let n = 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const nr = r + dr; const nc = c + dc
        if (nr >= 0 && nr < GH && nc >= 0 && nc < HALF && raw[nr][nc]) n++
      }
    }
    if (active  && n === 0) return rand(seed, 1000 + r * HALF + c) > 0.55  // lone → 45% die
    if (!active && n >= 3)  return rand(seed, 2000 + r * HALF + c) > 0.45  // surrounded → 55% fill
    return active
  }))

  // 3. Mirror to full 5-wide grid: pattern [0, 1, 2, 1, 0]
  return smooth.map(row => [row[0], row[1], row[2], row[1], row[0]])
}

// ── Cell color ─────────────────────────────────────────────────────────────────
function pickColor(seed: number, r: number, c: number, palette: AvatarPalette): string {
  // Eyes: row 1, cols 1 and 3 (symmetric) → always glow color if active
  if (r === 1 && (c === 1 || c === 3)) return palette.glow

  // Map to left-half col so mirrored cells share the same seed slot
  const lc = c <= 2 ? c : GW - 1 - c

  // Vertical gradient: lighter near top (head), darker near bottom (feet)
  const rowBias = r / (GH - 1)           // 0 (top) → 1 (bottom)
  // Horizontal gradient: brighter at center col, darker at edges
  const colBias = 1 - lc / (HALF - 1)   // 1 (col 0 = edge) → 0 (col 2 = center)

  const noise = rand(seed, 300 + r * HALF + lc) * 0.5
  const t     = Math.max(0, Math.min(1, 1 - rowBias * 0.4 - colBias * 0.25 - noise))

  const idx = Math.floor(t * (palette.shades.length - 1) + 0.5)
  return palette.shades[Math.min(idx, palette.shades.length - 1)]
}

// ── Cell border radius ─────────────────────────────────────────────────────────
function cellRadius(grid: boolean[][], r: number, c: number): string {
  let n = 0
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const nr = r + dr; const nc = c + dc
      if (nr >= 0 && nr < GH && nc >= 0 && nc < GW && grid[nr][nc]) n++
    }
  }
  if (n >= 6) return '30%'
  if (n >= 4) return '40%'
  return '50%'
}

// ── Component ──────────────────────────────────────────────────────────────────
interface AvatarRendererProps {
  seed:      number
  palette:   AvatarPalette
  cellSize?: number    // px per cell, default 9
  gap?:      number    // px gap between cells, default 2
  animate?:  boolean   // floating bob animation, default true
  circle?:   boolean   // wrap in circular frame, default true
}

export function AvatarRenderer({
  seed,
  palette,
  cellSize = 9,
  gap      = 2,
  animate  = true,
  circle   = true,
}: AvatarRendererProps) {
  const grid = useMemo(() => generateGrid(seed), [seed])

  const totalSize = GW * cellSize + (GW - 1) * gap   // square since GW === GH

  const avatarGrid = (
    <div
      style={{
        width:    totalSize,
        height:   totalSize,
        display:  'grid',
        gridTemplateColumns: `repeat(${GW}, ${cellSize}px)`,
        gridTemplateRows:    `repeat(${GH}, ${cellSize}px)`,
        gap:      `${gap}px`,
        filter:   `drop-shadow(0 2px 6px ${palette.glow}80)`,
        flexShrink: 0,
      }}
    >
      {grid.flatMap((row, r) =>
        row.map((active, c) => {
          if (!active) return <div key={`${r}_${c}`} />
          const color  = pickColor(seed, r, c, palette)
          const radius = cellRadius(grid, r, c)
          return (
            <div
              key={`${r}_${c}`}
              style={{
                width:        cellSize,
                height:       cellSize,
                borderRadius: radius,
                background:   color,
                boxShadow:    `0 1px 3px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.18)`,
                transition:   'background 0.5s ease, border-radius 0.3s ease',
              }}
            />
          )
        })
      )}
    </div>
  )

  if (!circle) return avatarGrid

  const diameter = totalSize + 18
  return (
    <div
      style={{
        width:          diameter,
        height:         diameter,
        borderRadius:   '50%',
        background:     `radial-gradient(circle at 50% 40%, ${palette.glow}22 0%, transparent 70%)`,
        border:         `1px solid ${palette.glow}50`,
        boxShadow:      `0 0 10px ${palette.glow}30, inset 0 0 6px rgba(0,0,0,0.6)`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        animation:      animate ? 'avatar-float 3.2s ease-in-out infinite' : undefined,
      }}
    >
      {avatarGrid}
    </div>
  )
}
