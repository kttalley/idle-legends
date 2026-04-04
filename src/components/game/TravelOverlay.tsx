import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES, ZONE_ORDER } from '../../data/zones'
import { BIOME_CONFIGS } from '../../data/professions'

// ASCII path strip: fills with fromZone chars on the left, toZone on right,
// with the player marker sliding across
function buildPathStrip(
  fromChars: string[], toChars: string[],
  fromColor: string, toColor: string,
  progress: number,
): { ch: string; color: string }[] {
  const COLS = 20
  const playerCol = Math.round(progress * (COLS - 1))

  return Array.from({ length: COLS }, (_, c) => {
    if (c === playerCol) return { ch: '⬥', color: '#ffffff' }
    const t = c / (COLS - 1)
    const useFrom = t < 0.5
    const chars = useFrom ? fromChars : toChars
    const color = useFrom ? fromColor : toColor
    // stable pseudo-random char from position
    const idx = Math.abs(Math.sin(c * 9301) * 16807) % 1
    return { ch: chars[Math.floor(idx * chars.length)], color }
  })
}

export function TravelOverlay() {
  const { currentZone, travelTarget, travelProgress, travelDuration, cancelTravel, generatedZoneNames } = useGameStore()

  if (!travelTarget) return null

  const fromZone = ZONES[currentZone]
  const toZone   = ZONES[travelTarget]
  const fromCfg  = BIOME_CONFIGS[currentZone]
  const toCfg    = BIOME_CONFIGS[travelTarget]

  const fromIdx  = ZONE_ORDER.indexOf(currentZone)
  const toIdx    = ZONE_ORDER.indexOf(travelTarget)
  const goingRight = toIdx > fromIdx

  const fromName = generatedZoneNames[currentZone] ?? fromZone?.name ?? currentZone
  const toName   = generatedZoneNames[travelTarget] ?? toZone?.name ?? travelTarget
  const etaSecs  = Math.ceil(travelDuration * (1 - travelProgress))

  const strip = buildPathStrip(
    fromCfg.chars, toCfg.chars,
    fromCfg.primaryColor, toCfg.primaryColor,
    travelProgress,
  )

  return (
    <div className="flex flex-col items-center justify-center gap-3 flex-1" style={{ padding: '12px 8px' }}>
      {/* Heading */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
          Traveling
        </div>
        <div style={{ fontSize: '0.75rem', color: '#d4b896', marginTop: 2 }}>
          {goingRight ? '' : '← '}{fromName}
          <span style={{ color: '#555', margin: '0 6px' }}>→</span>
          {toName}{goingRight ? '' : ' →'}
        </div>
        <div style={{ fontSize: '0.6rem', color: '#666', marginTop: 2 }}>
          ETA {etaSecs}s
        </div>
      </div>

      {/* ASCII path strip */}
      <div style={{
        display: 'flex', flexDirection: 'row',
        gap: 0, fontFamily: 'monospace', fontSize: '11px',
        background: '#0d0d0d', borderRadius: 4, padding: '4px 8px',
        border: '1px solid #333',
        lineHeight: 1,
      }}>
        {strip.map((cell, i) => (
          <span key={i} style={{ color: cell.color, fontWeight: cell.ch === '⬥' ? 'bold' : 'normal' }}>
            {cell.ch}
          </span>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 220 }}>
        <div style={{
          height: 8,
          background: '#222',
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid #444',
        }}>
          <div style={{
            height: '100%',
            width: `${travelProgress * 100}%`,
            background: `linear-gradient(90deg, ${fromCfg.accentColor}, ${toCfg.accentColor})`,
            transition: 'width 0.3s linear',
            borderRadius: 4,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: '0.55rem', color: fromCfg.primaryColor }}>{fromName}</span>
          <span style={{ fontSize: '0.55rem', color: toCfg.primaryColor }}>{toName}</span>
        </div>
      </div>

      {/* Cancel */}
      <button
        className="wow-button"
        onClick={cancelTravel}
        style={{ fontSize: '0.6rem', marginTop: 4 }}
      >
        ✕ Cancel
      </button>
    </div>
  )
}
