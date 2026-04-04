import React, { useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import { BIOME_CONFIGS } from '../../data/professions'
import type { ZoneId } from '../../data/types'

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function seededRand(seed: number, n: number): number {
  // Wichmann-Hill-ish
  const x = Math.sin(seed * 9301 + n * 49297 + 233) * 16807
  return x - Math.floor(x)
}

const GRID = 9   // 9×9 chars
const CENTRE = Math.floor(GRID / 2)  // 4

function buildGrid(zoneId: ZoneId, mobPresent: boolean, mobIsBoss: boolean): string[][] {
  const cfg = BIOME_CONFIGS[zoneId]
  const seed = hashStr(zoneId)
  const grid: string[][] = []

  for (let r = 0; r < GRID; r++) {
    grid[r] = []
    for (let c = 0; c < GRID; c++) {
      const idx = Math.floor(seededRand(seed, r * GRID + c) * cfg.chars.length)
      grid[r][c] = cfg.chars[idx]
    }
  }

  // Place player at centre
  grid[CENTRE][CENTRE] = '@'

  // Place mob/boss at a stable offset from centre
  if (mobPresent) {
    const mr = Math.max(1, Math.min(GRID - 2, CENTRE + (hashStr(zoneId + 'mr') % 3) - 1))
    const mc = Math.max(1, Math.min(GRID - 2, CENTRE + (hashStr(zoneId + 'mc') % 3) + 1))
    grid[mr][mc] = mobIsBoss ? '☠' : '×'
  }

  return grid
}

// Lerp two hex colours
function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const ca = parse(a); const cb = parse(b)
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t)
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t)
  const bb = Math.round(ca[2] + (cb[2] - ca[2]) * t)
  return `rgb(${r},${g},${bb})`
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MinimapWidget() {
  const { currentZone, travelTarget, travelProgress, currentMob, gameMode } = useGameStore()

  const fromCfg = BIOME_CONFIGS[currentZone]
  const toCfg   = travelTarget ? BIOME_CONFIGS[travelTarget] : null

  // During travel the player icon drifts across the grid
  const travelCol = toCfg
    ? Math.round(travelProgress * (GRID - 1))
    : CENTRE

  const grid = useMemo(
    () => buildGrid(currentZone, !!currentMob, currentMob?.isBoss ?? false),
    [currentZone, !!currentMob, currentMob?.isBoss],
  )

  // During travel, override player position along x axis
  const displayGrid = useMemo(() => {
    if (!toCfg) return grid
    const g = grid.map(row => [...row])
    // Clear old centre, place at travel col
    g[CENTRE][CENTRE] = fromCfg.chars[hashStr(currentZone) % fromCfg.chars.length]
    g[CENTRE][Math.min(GRID - 1, travelCol)] = '⬥'
    return g
  }, [grid, toCfg, travelCol])

  const bgColor   = toCfg ? lerpHex(fromCfg.bgColor, toCfg.bgColor, travelProgress) : fromCfg.bgColor
  const rimColor  = toCfg ? lerpHex(fromCfg.accentColor, toCfg.accentColor, travelProgress) : fromCfg.accentColor

  const CHAR_W = 8
  const CHAR_H = 9
  const SIZE   = GRID * CHAR_W + 4   // ~76px

  return (
    <div
      title={`Minimap — ${gameMode}`}
      style={{
        width: SIZE, height: SIZE,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${rimColor}`,
        background: bgColor,
        position: 'relative',
        flexShrink: 0,
        boxShadow: `0 0 8px ${rimColor}55`,
      }}
    >
      {/* ASCII terrain grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${GRID}, ${CHAR_W}px)`,
        gridTemplateRows: `repeat(${GRID}, ${CHAR_H}px)`,
        margin: 2,
        fontFamily: 'monospace',
        fontSize: '7px',
        lineHeight: `${CHAR_H}px`,
        userSelect: 'none',
      }}>
        {displayGrid.flatMap((row, r) =>
          row.map((ch, c) => {
            const isPlayer  = ch === '@' || ch === '⬥'
            const isMob     = ch === '×'
            const isBoss    = ch === '☠'
            const color = isPlayer
              ? '#ffffff'
              : isBoss
                ? '#ff8000'
                : isMob
                  ? '#ff4444'
                  : fromCfg.primaryColor
            return (
              <span
                key={`${r}_${c}`}
                style={{
                  color,
                  textAlign: 'center',
                  fontWeight: isPlayer || isBoss ? 'bold' : 'normal',
                  fontSize: isPlayer ? '8px' : '7px',
                }}
              >
                {ch}
              </span>
            )
          })
        )}
      </div>

      {/* Compass — N tick at top */}
      <div style={{
        position: 'absolute', top: 1, left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '5px', color: '#ffffff88',
        fontFamily: 'monospace', lineHeight: 1,
        pointerEvents: 'none',
      }}>
        N
      </div>
    </div>
  )
}
