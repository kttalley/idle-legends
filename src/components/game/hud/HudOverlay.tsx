import React from 'react'
import { useGameStore } from '../../../store/gameStore'
import { MinimapRadar } from './MinimapRadar'
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

  return (
    <div className="hud-layer">
      <div className="hud-tl"><UnitFrames /></div>
      <div className="hud-tr"><MinimapRadar /></div>
      {/* Craft reveal — under the minimap, out of the world's centre. Self-dismissing. */}
      <div className="hud-tr" style={{ marginTop: 150, display: 'flex', justifyContent: 'flex-end' }}>
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
