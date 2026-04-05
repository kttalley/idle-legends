import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES, ZONE_ORDER } from '../../data/zones'
import type { ZoneId } from '../../data/types'

export function ZoneSelector() {
  const {
    currentZone, unlockedZones, totalZoneKills, bossesDefeated, level,
    beginTravel, generatedZoneNames, gameMode, travelTarget, travelDuration,
  } = useGameStore()

  const isTraveling = gameMode === 'traveling'

  return (
    <div className="rp-panel" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="rp-panel-header">Zones</div>
      <div className="p-1 flex flex-col gap-1" style={{ overflowY: 'auto', maxHeight: '38vh' }}>
        {ZONE_ORDER.map(zoneId => {
          const zone       = ZONES[zoneId]
          const zoneName   = generatedZoneNames[zoneId as ZoneId] ?? zone.name
          const unlocked   = unlockedZones.includes(zoneId as ZoneId)
          const kills      = totalZoneKills[zoneId as ZoneId] ?? 0
          const active     = currentZone === zoneId
          const bossDown   = bossesDefeated.includes(zoneId as ZoneId)
          const canEnter   = unlocked && level >= zone.levelRange[0]
          const isDestination = travelTarget === zoneId

          // Travel time estimate
          const fromIdx  = ZONE_ORDER.indexOf(currentZone)
          const toIdx    = ZONE_ORDER.indexOf(zoneId)
          const dist     = Math.abs(fromIdx - toIdx)
          const travelSec = dist * 8

          return (
            <button
              key={zoneId}
              className={`rp-button text-left px-2 py-1.5 ${active ? 'zone-active' : ''}`}
              disabled={!canEnter || isTraveling}
              onClick={() => canEnter && !isTraveling && beginTravel(zoneId as ZoneId)}
              style={{
                background: active
                  ? `linear-gradient(90deg, ${zone.bgColor}88 0%, #1a1510 100%)`
                  : isDestination
                    ? `linear-gradient(90deg, ${zone.bgColor}44 0%, #1a1510 100%)`
                    : undefined,
                borderColor: active ? '#ffd700' : isDestination ? '#ff8800' : undefined,
                opacity: !unlocked ? 0.4 : !canEnter ? 0.6 : isTraveling && !isDestination ? 0.5 : 1,
              }}
            >
              <div className="flex justify-between items-center">
                <span style={{ fontSize: '0.7rem', fontWeight: active ? 700 : 400, color: active ? '#ffd700' : isDestination ? '#ff8800' : '#d4b896' }}>
                  {active ? '▶ ' : isDestination ? '✈ ' : ''}{zoneName}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {!active && canEnter && !isTraveling && dist > 0 && (
                    <span style={{ fontSize: '0.55rem', color: '#555' }}>{travelSec}s</span>
                  )}
                  <span style={{ fontSize: '0.6rem', color: '#666' }}>
                    Lvl {zone.levelRange[0]}–{zone.levelRange[1]}
                  </span>
                </div>
              </div>
              {unlocked && (
                <div className="flex justify-between mt-0.5" style={{ fontSize: '0.6rem', color: '#666' }}>
                  <span>{kills} kills</span>
                  {bossDown && <span style={{ color: '#ffd700' }}>★ Boss slain</span>}
                  {!bossDown && kills >= zone.unlockKills && (
                    <span style={{ color: '#ff8000' }}>⚠ Boss ready!</span>
                  )}
                  {!bossDown && kills < zone.unlockKills && (
                    <span>{zone.unlockKills - kills} to boss</span>
                  )}
                </div>
              )}
              {!unlocked && (
                <div style={{ fontSize: '0.6rem', color: '#555' }}>🔒 Locked</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
