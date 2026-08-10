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

/**
 * Fraction of the segment leaving `idx` that is already earned — how much of the line to
 * light up.
 *
 * Cleared wins over position, because the player can travel BACKWARDS: farming a zone you
 * already beat should not un-light the track ahead of you that you have, in fact, beaten.
 */
function segmentFill(
  idx: number, currentIdx: number, killFraction: number, cleared: boolean,
): number {
  if (cleared || idx < currentIdx) return 1
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
    settings, setAutoAdvanceZones,
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

    const centre = (): boolean => {
      const stop = rail.querySelector<HTMLElement>(`[data-zone="${focusZone}"]`)
      // A rail with no width has not been laid out yet, and every measurement taken from
      // it is zero. Centring against that silently produces scrollLeft 0 — which looks
      // exactly like "the track happened to already be at the start".
      if (!stop || rail.clientWidth === 0) return false
      // Not scrollIntoView: that walks up and scrolls every scrollable ancestor, which here
      // means yanking the whole left rail sideways as well.
      //
      // Snapping and smooth scrolling both have to be suspended for the assignment, or the
      // centring is silently undone. The rail is `scroll-behavior: smooth` (so the write
      // starts an animation rather than taking effect) and `scroll-snap-type: x proximity`
      // (so the browser then pulls the result to the nearest snap point). For an early
      // zone the target is only ~26px from the start, which is nearer to stop 0's snap
      // position than to its own — so the track animated a little and slid straight back
      // to 0, looking exactly like "it was already at the start".
      //
      // The CSS comment beside `scroll-snap-type` chose `proximity` over `mandatory` for
      // this reason; proximity is weaker, not absent. Suspending both for the write is
      // what actually makes programmatic positioning authoritative, and both are restored
      // immediately so the player's own flicks still snap and glide.
      const prevBehavior = rail.style.scrollBehavior
      const prevSnap = rail.style.scrollSnapType
      rail.style.scrollBehavior = 'auto'
      rail.style.scrollSnapType = 'none'
      rail.scrollLeft = stop.offsetLeft - (rail.clientWidth - stop.offsetWidth) / 2
      // Restore on the next frame: same-tick restoration re-enables snapping before the
      // browser has committed the new offset, which reintroduces the pull.
      requestAnimationFrame(() => {
        rail.style.scrollBehavior = prevBehavior
        rail.style.scrollSnapType = prevSnap
      })
      return true
    }

    if (centre()) return

    // Not laid out yet. This is the normal case, not an edge one: the track mounts inside
    // a collapsed accordion and inside a mobile drawer that starts retracted, so on a phone
    // the FIRST measurement is essentially always zero. A plain `useEffect` fires once,
    // gets nothing, and never runs again — leaving the current zone off-screen with no
    // indication anything failed.
    //
    // Same treatment the layout already gives --log-h and --actionbar-h: observe the
    // element and act when it is real. Disconnects on the first successful centring so it
    // does not fight the player's own scrolling afterwards.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (centre()) ro.disconnect() })
    ro.observe(rail)
    return () => ro.disconnect()
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
                style={{ '--seg': segmentFill(idx, currentIdx, killFrac, zBossDown) } as React.CSSProperties}
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

        {/* Whether the hero walks the track by itself. This lived under the equipment
            list in the bag, next to auto-equip, because that is where the other
            unattended-play toggle happened to be — but it is a statement about ZONES, and
            it belongs against the map of them.
            Rail only: the modal is a "take me there now" picker, and a second checkbox
            for the same setting, visible at the same time as the first, is just a way to
            make the player wonder whether they are the same setting. */}
        {collapsible && (
          <label
            className="zone-track-auto"
            data-on={settings.autoAdvanceZones !== false}
            title="Move on when the next zone opens, and fall back from one that proves too hard."
          >
            <input
              type="checkbox"
              checked={settings.autoAdvanceZones !== false}
              onChange={e => setAutoAdvanceZones(e.target.checked)}
            />
            Roam onward when ready
          </label>
        )}
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
      headerRight={<span style={{ fontSize: '0.55rem', color: 'var(--muted-warm)' }}>{levelRange}</span>}
    >
      {track}
    </CollapsiblePanel>
  )
}
