import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { MinimapRadar } from './MinimapRadar'
import { ObjectiveTracker } from './ObjectiveTracker'
import { UnitFrames } from './UnitFrames'
import { ActionBar } from './ActionBar'
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
  const setMode = useGameStore(s => s.setMode)
  const leaveTown = useGameStore(s => s.leaveTown)
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
    // The inventory rail is not ours — it is rendered by App — but the quest tracker below
    // it has to know how tall it is. Queried rather than ref-passed so the rail's own
    // component stays unaware of anything positioned off it; if it is absent (mobile, where
    // it is a drawer) the tracker just keeps its default top.
    const railR = document.querySelector<HTMLElement>('.app-sidebar-right')
    const pairs: [HTMLElement | null, string][] = [
      [tlRef.current, '--unit-h'], [trRef.current, '--hud-r-h'], [railR, '--rail-r-h'],
    ]
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
      {/* Top-right corner: where you are.
          The craft reveal used to sit under the radar in this stack, and it was the wrong
          place twice over — on desktop the inventory rail (z 50) draws over the whole HUD
          layer (z 20), so the card was behind a panel, and its height fed `--hud-r-h`, so
          a craft nudged the rail beneath it down. It is a centre-screen announcement now;
          see `.toast-centre` in App. */}
      <div ref={trRef} className="hud-tr hud-tr-stack">
        <MinimapRadar />
      </div>
      {/* The objective tracker used to live in the stack above, which meant its height was
          part of `--hud-r-h` — so the inventory rail started lower than the character rail
          on the left, and shifted whenever a quest line wrapped. It belongs under the rail:
          the radar heads the column, the inventory follows it, and the quest sits at the
          foot. Positioned off the measured `--rail-r-h` rather than nested inside the rail
          so it stays put when the rail scrolls its own contents. */}
      <div className="hud-quest"><ObjectiveTracker /></div>
      {/* Bottom stack: mode panel above the action bar, in ONE flow. Positioning them
          independently meant guessing the bar's height, which changes with the mode —
          the panel sat on top of it and the XP strip. */}
      <div className="hud-bottom">
        {showPanel && (
          <div className="app-modepanel rp-glass">
            {/* ── One close control, owned by the FRAME rather than by each panel ──
                Every mode panel needs the same "put this away" verb, and four copies of it
                is four chances to place it differently. Here it is one button, always in
                the same corner, and each panel below stays purely about its own content.

                What it closes back TO is mode-dependent, which is why it lives in the one
                place that knows the mode. Travel is deliberately exempt: a journey in
                progress is not a menu you dismiss, and offering an ✕ that silently did
                nothing would be worse than offering none. */}
            {gameMode !== 'traveling' && (
              <button
                className="modepanel-close"
                onClick={() => (showTown ? leaveTown() : setMode('combat'))}
                title={showTown ? 'Leave town' : 'Back to the fight'}
                aria-label={showTown ? 'Leave town' : 'Back to the fight'}
              >✕</button>
            )}
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
