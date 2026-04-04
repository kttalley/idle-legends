import React, { useState, useEffect, useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES } from '../../data/zones'
import { BIOME_CONFIGS } from '../../data/professions'

// Visible grid dimensions
const COLS = 55
const ROWS = 22
const CHAR_H = 9
const MAP_SIZE = 64
const CX = Math.floor(COLS / 2)  // 27 — center in visible grid
const CY = Math.floor(ROWS / 2)  // 11 — center in visible grid

// Render 2 extra cols/rows (1 each side) for smooth sub-tile scroll
const RCOLS = COLS + 2
const RROWS = ROWS + 2
const RCX = CX + 1   // center column in render grid
const RCY = CY + 1   // center row in render grid

const FALLBACK_CH = '.'
const FALLBACK_COLOR = '#2a2018'

// ── Weather overlay ───────────────────────────────────────────────────────────
// Returns a map keyed by "${r}_${c}" in VISIBLE coords (0..ROWS-1, 0..COLS-1)
function buildWeatherOverlay(
  type: string,
  cloudOffset: number,
  rainPhase: number,
): Map<string, { ch: string; color: string; opacity: number }> {
  const overlay = new Map<string, { ch: string; color: string; opacity: number }>()
  if (type === 'clear') return overlay

  if (type === 'cloudy' || type === 'rain') {
    const addBlob = (cx: number, cy: number, intensity: number) => {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -7; dc <= 7; dc++) {
          const r = cy + dr
          const c = cx + dc
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue
          const dist = Math.sqrt(dc * dc * 0.25 + dr * dr)
          let ch = ''
          let opacity = 0
          if (dist < 0.8)      { ch = '▓'; opacity = intensity * 0.75 }
          else if (dist < 1.6) { ch = '▒'; opacity = intensity * 0.60 }
          else if (dist < 2.6) { ch = '░'; opacity = intensity * 0.40 }
          else if (dist < 3.5) { ch = '·'; opacity = intensity * 0.20 }
          if (ch) overlay.set(`${r}_${c}`, { ch, color: '#c8ddf0', opacity })
        }
      }
    }
    const col1 = Math.floor(((cloudOffset * 1.3) % 1) * (COLS + 16)) - 8
    const col2 = Math.floor((((cloudOffset + 0.52) * 1.3) % 1) * (COLS + 16)) - 8
    addBlob(col1, 4, type === 'rain' ? 0.85 : 0.65)
    addBlob(col2, 7, type === 'rain' ? 0.70 : 0.50)
  }

  if (type === 'rain') {
    const RAIN_COUNT = 32
    for (let i = 0; i < RAIN_COUNT; i++) {
      const baseX = (i * 43 + 7) % COLS
      const speed = 0.6 + (i % 5) * 0.12
      const y = Math.floor((i * 7 + rainPhase * ROWS * speed) % ROWS)
      const ch = i % 5 === 0 ? "'" : '|'
      const key = `${y}_${baseX}`
      if (!overlay.has(key)) {
        overlay.set(key, { ch, color: '#88aabf', opacity: 0.60 })
      }
      const y2 = (y + 1) % ROWS
      const key2 = `${y2}_${baseX}`
      if (!overlay.has(key2)) {
        overlay.set(key2, { ch: '`', color: '#88aabf', opacity: 0.30 })
      }
    }
  }

  return overlay
}

// ── Component ─────────────────────────────────────────────────────────────────
export function WorldMapView() {
  const {
    currentZone, travelTarget, travelProgress,
    zoneMaps, playerMapPos, weatherState,
    mobMapOffset, currentMob,
    generatedZoneNames, bossesDefeated,
  } = useGameStore()

  const [waterFrame, setWaterFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setWaterFrame(f => (f + 1) % 4), 300)
    return () => clearInterval(id)
  }, [])

  const zoneMap  = zoneMaps[currentZone]
  const cfg      = BIOME_CONFIGS[currentZone]
  const toCfg    = travelTarget ? BIOME_CONFIGS[travelTarget] : null
  const bgColor  = cfg?.bgColor ?? '#1a1510'
  const rimColor = toCfg
    ? lerpHex(cfg?.accentColor ?? '#888', toCfg.accentColor, travelProgress)
    : cfg?.accentColor ?? '#888'

  // Fractional tile position for smooth sub-tile scrolling via CSS transform
  const fracX = playerMapPos.x - Math.floor(playerMapPos.x)
  const fracY = playerMapPos.y - Math.floor(playerMapPos.y)
  // Translate: shift left/up by (1 + frac) cells in the RCOLS×RROWS render grid
  const translateX = -((1 + fracX) / RCOLS * 100)
  const translateY = -((1 + fracY) / RROWS * 100)

  // Weather overlay (in visible coords 0..ROWS-1, 0..COLS-1)
  const weatherOverlay = useMemo(
    () => buildWeatherOverlay(weatherState.type, weatherState.cloudOffset, weatherState.rainPhase),
    [weatherState.type, weatherState.cloudOffset, weatherState.rainPhase],
  )

  // Entity map: render grid coords (0..RROWS-1, 0..RCOLS-1)
  const entityMap = useMemo(() => {
    const m = new Map<string, { icon: string; color: string; bold?: boolean; glow?: string }>()
    const tileX = Math.floor(playerMapPos.x)
    const tileY = Math.floor(playerMapPos.y)

    if (zoneMap) {
      for (const node of zoneMap.nodes) {
        if (node.type === 'mob_spawn') continue
        const vc = node.x - tileX + RCX
        const vr = node.y - tileY + RCY
        if (vc >= 0 && vc < RCOLS && vr >= 0 && vr < RROWS) {
          const nearPlayer = Math.sqrt(
            (node.x - playerMapPos.x) ** 2 + (node.y - playerMapPos.y) ** 2
          ) < 3
          m.set(`${vr}_${vc}`, {
            icon: node.icon,
            color: nearPlayer ? '#ffffff' : node.color,
            bold: node.type === 'boss_lair' || nearPlayer,
            glow: nearPlayer ? node.color : undefined,
          })
        }
      }
    }

    // Boss lair: show ★ after boss slain
    if (zoneMap && bossesDefeated.includes(currentZone)) {
      for (const node of zoneMap.nodes) {
        if (node.type !== 'boss_lair') continue
        const vc = node.x - tileX + RCX
        const vr = node.y - tileY + RCY
        if (vc >= 0 && vc < RCOLS && vr >= 0 && vr < RROWS) {
          m.set(`${vr}_${vc}`, { icon: '★', color: '#ffd700', bold: true })
        }
      }
    }

    // Mob entity
    if (currentMob) {
      const mc = RCX + Math.round(mobMapOffset.dx)
      const mr = RCY + Math.round(mobMapOffset.dy)
      if (mc >= 0 && mc < RCOLS && mr >= 0 && mr < RROWS) {
        const isFighting = mobMapOffset.dx === 0 && mobMapOffset.dy === 0
        m.set(`${mr}_${mc}`, {
          icon: currentMob.isBoss ? '☠' : isFighting ? '*' : '×',
          color: currentMob.isBoss ? '#ff8000' : isFighting ? '#ffcc00' : '#ff4444',
          bold: currentMob.isBoss || isFighting,
        })
      }
    }

    // Player always at render center
    m.set(`${RCY}_${RCX}`, { icon: '@', color: '#ffffff', bold: true })

    return m
  }, [zoneMap, playerMapPos, mobMapOffset, currentMob, bossesDefeated, currentZone])

  const zoneName = generatedZoneNames[currentZone] ?? ZONES[currentZone]?.name ?? currentZone

  return (
    <div
      style={{
        width: '100%',
        height: `${ROWS * CHAR_H}px`,
        background: bgColor,
        position: 'relative',
        flexShrink: 0,
        borderBottom: `1px solid ${rimColor}44`,
        overflow: 'hidden',
      }}
    >
      {/* ASCII terrain grid — rendered RCOLS×RROWS, shifted by fractional offset */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${RCOLS}, 1fr)`,
          gridTemplateRows: `repeat(${RROWS}, ${CHAR_H}px)`,
          fontFamily: 'monospace',
          fontSize: '7px',
          lineHeight: `${CHAR_H}px`,
          userSelect: 'none',
          letterSpacing: 0,
          width: `${(RCOLS / COLS) * 100}%`,
          transform: `translate(${translateX}%, ${translateY}%)`,
          willChange: 'transform',
        }}
      >
        {Array.from({ length: RROWS }, (_, vr) =>
          Array.from({ length: RCOLS }, (_, vc) => {
            const key = `${vr}_${vc}`
            const entity = entityMap.get(key)

            // Visible-coord lookup for weather (offset by 1 for the extra leading row/col)
            const visR = vr - 1
            const visC = vc - 1
            const weather = (visR >= 0 && visR < ROWS && visC >= 0 && visC < COLS)
              ? weatherOverlay.get(`${visR}_${visC}`)
              : undefined

            if (entity) {
              return (
                <span
                  key={key}
                  style={{
                    color: entity.color,
                    textAlign: 'center',
                    fontWeight: entity.bold ? 'bold' : 'normal',
                    fontSize: entity.bold ? '8px' : '7px',
                    textShadow: entity.glow
                      ? `0 0 4px ${entity.glow}`
                      : entity.bold ? `0 0 3px ${entity.color}` : undefined,
                  }}
                >
                  {entity.icon}
                </span>
              )
            }

            if (weather) {
              const cloudBg = weather.ch === '▓' || weather.ch === '▒' || weather.ch === '░'
                ? '#1a2535' : undefined
              return (
                <span
                  key={key}
                  style={{
                    color: weather.color,
                    textAlign: 'center',
                    opacity: weather.opacity,
                    background: cloudBg,
                  }}
                >
                  {weather.ch}
                </span>
              )
            }

            // Terrain tile — tileX = floor(pos.x), start 1 tile earlier for the extra leading col
            const wx = ((Math.floor(playerMapPos.x) - 1 + vc) % MAP_SIZE + MAP_SIZE) % MAP_SIZE
            const wy = ((Math.floor(playerMapPos.y) - 1 + vr) % MAP_SIZE + MAP_SIZE) % MAP_SIZE
            const tile = zoneMap?.tiles[wy]?.[wx]
            const ch = tile
              ? (tile.type === 'water'
                  ? tile.charSet[waterFrame % tile.charSet.length]
                  : tile.charSet[0])
              : FALLBACK_CH
            const color = tile?.color ?? FALLBACK_COLOR
            const opacity = tile?.type === 'cliff' ? 0.90 : tile?.type === 'water' ? 0.85 : 0.65
            const bg = tile?.type === 'water' ? '#001828' : tile?.type === 'cliff' ? '#0a0806' : undefined

            return (
              <span
                key={key}
                style={{ color, textAlign: 'center', opacity, background: bg }}
              >
                {ch}
              </span>
            )
          })
        )}
      </div>

      {/* Zone label — bottom left */}
      <div style={{
        position: 'absolute',
        bottom: 2,
        left: 4,
        fontSize: '0.5rem',
        color: rimColor,
        opacity: 0.85,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        textShadow: `0 0 6px ${rimColor}88`,
      }}>
        {zoneName}
      </div>

      {/* Compass — top right */}
      <div style={{
        position: 'absolute',
        top: 2,
        right: 4,
        fontSize: '0.5rem',
        color: '#ffffff55',
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}>
        N↑
      </div>

      {/* Weather indicator — bottom right */}
      {weatherState.type !== 'clear' && (
        <div style={{
          position: 'absolute',
          bottom: 2,
          right: 4,
          fontSize: '0.5rem',
          color: weatherState.type === 'rain' ? '#88aabf' : '#c8ddf0',
          opacity: 0.80,
          fontFamily: 'monospace',
          pointerEvents: 'none',
        }}>
          {weatherState.type === 'rain' ? '|☁|' : '░▒░'}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]
  const ca = parse(a); const cb = parse(b)
  return `rgb(${Math.round(ca[0]+(cb[0]-ca[0])*t)},${Math.round(ca[1]+(cb[1]-ca[1])*t)},${Math.round(ca[2]+(cb[2]-ca[2])*t)})`
}
