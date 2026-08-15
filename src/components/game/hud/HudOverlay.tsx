import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { MinimapRadar } from './MinimapRadar'
import { ObjectiveTracker } from './ObjectiveTracker'
import { UnitFrames } from './UnitFrames'
import { ActionBar } from './ActionBar'
import { CraftResultToast } from '../CraftResultToast'
import { TravelOverlay } from '../TravelOverlay'
import { GatheringPanel } from '../GatheringPanel'
import { CraftingPanel } from '../CraftingPanel'
import { TownView } from '../TownView'

// WoW/Diablo-style HUD shell: a click-through DOM overlay painted on top of the
// dimetric world canvas (text/tooltips stay crisp; the canvas renders only the world).
//
// Now that the world is full-bleed and the side panels float ON it, the HUD insets by
// `--rail-l` / `--rail-r` (index.css) rather than hugging the viewport edges — otherwise
// the unit frames and minimap sit underneath the glass columns. Those vars collapse to a
// few pixels when a column is folded away or on mobile, so the HUD reclaims the space.
// Each panel re-enables pointer-events for its own interactive bits.
export function HudOverlay() {
  const gameMode = useGameStore(s => s.gameMode)
  const currentTown = useGameStore(s => s.currentTown)
  const showTown = gameMode === 'in_town' && !!currentTown
  const showPanel = gameMode === 'traveling' || gameMode === 'gathering'
    || gameMode === 'crafting' || showTown

  // Publish both top corners' real heights as --unit-h / --hud-r-h.
  //
  // On desktop each corner heads a column: the character rail is positioned directly under
  // the unit frames, the inventory directly under the radar and objective tracker. Both
  // rails' `top` AND `max-height` therefore depend on how tall the box above them actually
  // is, and hardcoding those numbers means a rail overlapping its own header the first time
  // a party, a cast bar or a second quest line makes one taller. Same coupling `--log-h` and
  // `--actionbar-h` are measured for. `.unit-frames` and `.hud-tr` carry `min-height` floors
  // so the ordinary in-and-out of a target does not jog a column (see index.css).
  const tlRef = useRef<HTMLDivElement>(null)
  const trRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const pairs: [HTMLDivElement | null, string][] = [[tlRef.current, '--unit-h'], [trRef.current, '--hud-r-h']]
    const ro = new ResizeObserver(() => {
      for (const [el, prop] of pairs) {
        if (!el) continue
        const h = el.getBoundingClientRect().height
        if (h > 0) document.documentElement.style.setProperty(prop, `${Math.round(h)}px`)
      }
    })
    for (const [el] of pairs) if (el) ro.observe(el)
    // Seed before the first resize callback, or the rails spend a frame at the defaults.
    for (const [el, prop] of pairs) {
      if (!el) continue
      const h = el.getBoundingClientRect().height
      if (h > 0) document.documentElement.style.setProperty(prop, `${Math.round(h)}px`)
    }
    return () => ro.disconnect()
  }, [])

  return (
    <div className="hud-layer">
      <div ref={tlRef} className="hud-tl"><UnitFrames /></div>
      {/* One top-right column, in reading order: where you are, what you are doing, what
          you just made. This used to be two `.hud-tr` layers with the second pushed down by
          a hardcoded `marginTop: 150` guessed from the minimap's height — a number that
          silently overlapped or floated the moment the minimap changed size. Stacking them
          lets the layout do that arithmetic. */}
      <div ref={trRef} className="hud-tr hud-tr-stack">
        <MinimapRadar />
        <ObjectiveTracker />
        <CraftResultToast />
      </div>
      {/* Bottom stack: mode panel above the action bar, in ONE flow. Positioning them
          independently meant guessing the bar's height, which changes with the mode —
          the panel sat on top of it and the XP strip. */}
      <div className="hud-bottom">
        {showPanel && (
          <div className="app-modepanel rp-glass">
            {gameMode === 'traveling' && <TravelOverlay />}
            {gameMode === 'gathering' && <GatheringPanel />}
            {gameMode === 'crafting'  && <CraftingPanel />}
            {showTown && <TownView />}
          </div>
        )}
        <ActionBar />
      </div>
    </div>
  )
}
