import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES, ZONE_ORDER } from '../../data/zones'
import type { ZoneId } from '../../data/types'

export function ZoneSelector() {
  const { currentZone, unlockedZones, totalZoneKills, bossesDefeated, level, selectZone, generatedZoneNames } = useGameStore()

  return (
    <div className="wow-panel">
      <div className="wow-panel-header">Zones</div>
      <div className="p-1 flex flex-col gap-1">
        {ZONE_ORDER.map(zoneId => {
          const zone     = ZONES[zoneId]
          const zoneName = generatedZoneNames[zoneId as ZoneId] ?? zone.name
          const unlocked = unlockedZones.includes(zoneId as ZoneId)
          const kills    = totalZoneKills[zoneId as ZoneId] ?? 0
          const active   = currentZone === zoneId
          const bossDown = bossesDefeated.includes(zoneId as ZoneId)
          const canEnter = unlocked && level >= zone.levelRange[0]

          return (
            <button
              key={zoneId}
              className={`wow-button text-left px-2 py-1.5 ${active ? 'zone-active' : ''}`}
              disabled={!canEnter}
              onClick={() => canEnter && selectZone(zoneId as ZoneId)}
              style={{
                background: active
                  ? `linear-gradient(90deg, ${zone.bgColor}88 0%, #1a1510 100%)`
                  : undefined,
                borderColor: active ? '#ffd700' : undefined,
                opacity: !unlocked ? 0.4 : !canEnter ? 0.6 : 1,
              }}
            >
              <div className="flex justify-between items-center">
                <span style={{ fontSize: '0.7rem', fontWeight: active ? 700 : 400, color: active ? '#ffd700' : '#d4b896' }}>
                  {active ? '▶ ' : ''}{zoneName}
                </span>
                <span style={{ fontSize: '0.6rem', color: '#666' }}>
                  Lvl {zone.levelRange[0]}–{zone.levelRange[1]}
                </span>
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
