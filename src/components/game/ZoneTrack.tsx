import React, { useEffect, useRef } from 'react'
import { CollapsiblePanel } from '../ui/CollapsiblePanel'
import { useGameStore } from '../../store/gameStore'
import { ZONES, ZONE_ORDER } from '../../data/zones'
import { getZoneProgression, getPrerequisiteZone } from '../../engine/zoneProgression'
import type { ZoneId } from '../../data/types'

// The zone list as a subway map.
//
// Zones are a LINE — twelve of them, in one fixed order, each unlocked by the one before
// it — but they were drawn as a vertical list of twelve two-line rows. That is ~380px of
// a rail that is at most ~700px tall, which is why the zone list and the character sheet
// could never usefully be open at the same time: whichever you expanded starved the
// other. The information is one-dimensional, so it is drawn on one axis: a horizontal
// track, current stop centred, the stop behind and the stop ahead flanking it.
//
// The full track is still rendered and still scrolls horizontally, so fast travel to a
// distant unlocked zone is unchanged — the default VIEW is three stops, not the default
// reach. And the line does double duty as a progress bar: the segment leaving a zone
// fills with that zone's boss progress, so "how close am I to moving on" is answered by
// the same pixels that answer "where am I".

/** Fraction of the segment leaving `idx` that is already earned. */
function segmentFill(idx: number, currentIdx: number, killFraction: number): number {
  if (idx < currentIdx) return 1
  if (idx > currentIdx) return 0
  return killFraction
}

export interface ZoneTrackProps {
  /** Fold into a rail section with its own header. The map modal renders it bare. */
  collapsible?: boolean
  /** Called once a travel order has been accepted, so whatever popover is hosting this
   *  track can dismiss itself — choosing a destination IS completing the task. */
  onTravel?: (zoneId: ZoneId) => void
}

export function ZoneTrack({ collapsible = true, onTravel }: ZoneTrackProps = {}) {
  const {
    currentZone, unlockedZones, totalZoneKills, bossesDefeated, level,
    beginTravel, generatedZoneNames, gameMode, travelTarget,
  } = useGameStore()

  const railRef = useRef<HTMLDivElement>(null)
  const isTraveling = gameMode === 'traveling'
  const progression = getZoneProgression(level, bossesDefeated, unlockedZones)
  const currentIdx  = ZONE_ORDER.indexOf(currentZone)

  // Centre the stop that matters. While travelling that is the DESTINATION — the point of
  // watching the map mid-journey is seeing where you are going.
  const focusZone = (isTraveling && travelTarget) ? travelTarget : currentZone
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const stop = rail.querySelector<HTMLElement>(`[data-zone="${focusZone}"]`)
    if (!stop) return
    // Not scrollIntoView: that walks up and scrolls every scrollable ancestor, which here
    // means yanking the whole left rail sideways as well.
    rail.scrollLeft = stop.offsetLeft - (rail.clientWidth - stop.offsetWidth) / 2
  }, [focusZone])

  const zone       = ZONES[currentZone]
  const zoneName   = generatedZoneNames[currentZone as ZoneId] ?? zone?.name ?? currentZone
  const kills      = totalZoneKills[currentZone as ZoneId] ?? 0
  const bossDown   = bossesDefeated.includes(currentZone as ZoneId)
  const toBoss     = Math.max(0, (zone?.unlockKills ?? 0) - kills)
  const killFrac   = bossDown ? 1 : Math.min(1, kills / Math.max(1, zone?.unlockKills ?? 1))

  const levelRange = zone ? `Lvl ${zone.levelRange[0]}–${zone.levelRange[1]}` : ''

  const track = (
    <div className={`zone-track${collapsible ? '' : ' zone-track-standalone'}`}>
        <div className="zone-track-rail" ref={railRef}>
          {ZONE_ORDER.map((zoneId, idx) => {
            const z          = ZONES[zoneId]
            const name       = generatedZoneNames[zoneId as ZoneId] ?? z.name
            const unlocked   = unlockedZones.includes(zoneId as ZoneId)
            const prog       = progression.find(p => p.zoneId === zoneId)!
            const canEnter   = unlocked && prog.reason === 'available'
            const active     = currentZone === zoneId
            const isTarget   = travelTarget === zoneId
            const zKills     = totalZoneKills[zoneId as ZoneId] ?? 0
            const zBossDown  = bossesDefeated.includes(zoneId as ZoneId)
            const bossReady  = unlocked && !zBossDown && zKills >= z.unlockKills

            const travelSec = Math.abs(currentIdx - idx) * 8

            const lockReason = (() => {
              if (canEnter) return null
              if (prog.reason === 'locked_boss') {
                const prereq = getPrerequisiteZone(zoneId as ZoneId)
                const prereqName = prereq ? (generatedZoneNames[prereq] ?? ZONES[prereq]?.name ?? prereq) : ''
                const prereqBoss = prereq ? ZONES[prereq]?.mobs.find(m => m.id === ZONES[prereq]?.bossId)?.name : ''
                return `Defeat ${prereqBoss || 'the boss'} in ${prereqName}`
              }
              if (prog.reason === 'locked_level') return `Reach level ${prog.requiredLevel}`
              return 'Locked'
            })()

            const cls = [
              'zone-stop',
              active ? 'is-current' : '',
              isTarget && !active ? 'is-target' : '',
              zBossDown ? 'is-cleared' : '',
              bossReady ? 'is-bossready' : '',
              !canEnter ? 'is-locked' : 'is-open',
            ].filter(Boolean).join(' ')

            // The title is the tooltip that replaces the two lines of per-row detail the
            // old list carried inline. Everything that was written out there is still
            // reachable, just on demand rather than at all times.
            const tip = active
              ? `${name} — you are here`
              : lockReason
                ? `${name} — ${lockReason}`
                : `Travel to ${name} (${travelSec}s) — Lvl ${z.levelRange[0]}–${z.levelRange[1]}`

            return (
              <button
                key={zoneId}
                type="button"
                data-zone={zoneId}
                className={cls}
                style={{ '--seg': segmentFill(idx, currentIdx, killFrac) } as React.CSSProperties}
                title={tip}
                aria-current={active ? 'true' : undefined}
                disabled={!canEnter || isTraveling || active}
                onClick={() => {
                  if (!canEnter || isTraveling || active) return
                  beginTravel(zoneId as ZoneId)
                  // The order is given; the surface that was asking for it has no further
                  // job. On a phone this is the difference between watching your hero
                  // leave and staring at the menu you just used.
                  onTravel?.(zoneId as ZoneId)
                }}
              >
                <span className="zone-stop-dot" aria-hidden>
                  {zBossDown ? '★' : bossReady ? '!' : ''}
                </span>
                <span className="zone-stop-name">{name}</span>
              </button>
            )
          })}
        </div>

        <div className="zone-track-status">
          <span className="zone-track-status-name">
            {isTraveling && travelTarget
              ? `→ ${generatedZoneNames[travelTarget] ?? ZONES[travelTarget]?.name ?? travelTarget}`
              : zoneName}
          </span>
          {isTraveling ? (
            <span className="zone-track-status-meta">Travelling…</span>
          ) : bossDown ? (
            <span className="zone-track-status-meta">★ Cleared · {kills} kills</span>
          ) : toBoss === 0 ? (
            <span className="zone-track-status-meta is-ready">Boss ready!</span>
          ) : (
            <span className="zone-track-status-meta">{toBoss} kills to boss</span>
          )}
        </div>
      </div>
  )

  // Bare inside the map modal. Collapsing is a RAIL affordance — it exists so a tall
  // section cannot starve its neighbours in a shared column — and a modal that opens onto
  // a collapsed header would just be broken. The two instances would also share one
  // persisted id, so folding the rail's copy would silently fold the map's too.
  if (!collapsible) {
    return (
      <div className="zone-track-modal">
        <div className="zone-track-modal-head">
          <span className="zone-track-modal-title">Zones</span>
          <span className="zone-track-modal-sub">{levelRange}</span>
        </div>
        {track}
      </div>
    )
  }

  return (
    <CollapsiblePanel
      id="zones"
      title="Zones"
      headerRight={<span style={{ fontSize: '0.55rem', color: '#8a8070' }}>{levelRange}</span>}
    >
      {track}
    </CollapsiblePanel>
  )
}
