import React from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZONES, ZONE_ORDER } from '../../data/zones'
import { getZoneProgression, getPrerequisiteZone } from '../../engine/zoneProgression'
import type { ZoneId } from '../../data/types'
import { SpriteIcon } from '../ui/SpriteIcon'

export function ZoneSelector() {
  const {
    currentZone, unlockedZones, totalZoneKills, bossesDefeated, level,
    beginTravel, generatedZoneNames, gameMode, travelTarget, travelDuration,
  } = useGameStore()

  const isTraveling = gameMode === 'traveling'
  const progression = getZoneProgression(level, bossesDefeated, unlockedZones)

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
          const prog       = progression.find(p => p.zoneId === zoneId)!
          const canEnter   = unlocked && prog.reason === 'available'
          const isDestination = travelTarget === zoneId

          // Travel time estimate
          const fromIdx  = ZONE_ORDER.indexOf(currentZone)
          const toIdx    = ZONE_ORDER.indexOf(zoneId)
          const dist     = Math.abs(fromIdx - toIdx)
          const travelSec = dist * 8

          const lockReason = (() => {
            if (canEnter) return null
            if (prog.reason === 'locked_boss') {
              const prereq = getPrerequisiteZone(zoneId as ZoneId)
              const prereqName = prereq ? (generatedZoneNames[prereq] ?? ZONES[prereq]?.name ?? prereq) : ''
              const prereqBoss = prereq ? ZONES[prereq]?.mobs.find(m => m.id === ZONES[prereq]?.bossId)?.name : ''
              return `Defeat ${prereqBoss || 'the boss'} in ${prereqName}`
            }
            if (prog.reason === 'locked_level') {
              return `Reach level ${prog.requiredLevel}`
            }
            return 'Locked'
          })()

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
                  {active ? '▶ ' : ''}{isDestination && <SpriteIcon ui="travel" size={11} />}{isDestination ? ' ' : ''}{zoneName}
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
                  {bossDown && <span style={{ color: '#ffd700' }}><SpriteIcon emoji="★" size={11} /> Boss slain</span>}
                  {!bossDown && kills >= zone.unlockKills && (
                    <span style={{ color: '#ff8000' }}><SpriteIcon ui="warn" size={11} /> Boss ready!</span>
                  )}
                  {!bossDown && kills < zone.unlockKills && (
                    <span>{zone.unlockKills - kills} to boss</span>
                  )}
                </div>
              )}
              {!canEnter && lockReason && (
                <div style={{ fontSize: '0.6rem', color: '#aa6644', marginTop: 2 }}>
                  <SpriteIcon ui="lock" size={11} /> {lockReason}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
