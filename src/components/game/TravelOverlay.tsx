import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES, ZONE_ORDER } from '../../data/zones'
import { BIOME_CONFIGS } from '../../data/professions'

export function TravelOverlay() {
  const { currentZone, travelTarget, travelProgress, travelDuration, cancelTravel, generatedZoneNames } = useGameStore()

  if (!travelTarget) return null

  const fromCfg = BIOME_CONFIGS[currentZone]
  const toCfg   = BIOME_CONFIGS[travelTarget]

  const fromName = generatedZoneNames[currentZone] ?? ZONES[currentZone]?.name ?? currentZone
  const toName   = generatedZoneNames[travelTarget] ?? ZONES[travelTarget]?.name ?? travelTarget
  const etaSecs  = Math.ceil(travelDuration * (1 - travelProgress))

  const fromIdx  = ZONE_ORDER.indexOf(currentZone)
  const toIdx    = ZONE_ORDER.indexOf(travelTarget)
  const goingRight = toIdx > fromIdx

  return (
    <div className="flex flex-col items-center justify-center gap-2 flex-1" style={{ padding: '8px 12px' }}>
      {/* Heading */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.55rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
          Traveling
        </div>
        <div style={{ fontSize: '0.7rem', color: '#d4b896', marginTop: 2 }}>
          {goingRight ? '' : '← '}{fromName}
          <span style={{ color: '#555', margin: '0 5px' }}>→</span>
          {toName}{goingRight ? '' : ' →'}
        </div>
        <div style={{ fontSize: '0.55rem', color: '#666', marginTop: 1 }}>
          ETA {etaSecs}s
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 200 }}>
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
          <span style={{ fontSize: '0.5rem', color: fromCfg.primaryColor }}>{fromName}</span>
          <span style={{ fontSize: '0.5rem', color: toCfg.primaryColor }}>{toName}</span>
        </div>
      </div>

      {/* Cancel */}
      <button
        className="rp-button"
        onClick={cancelTravel}
        style={{ fontSize: '0.58rem' }}
      >
        ✕ Cancel
      </button>
    </div>
  )
}
