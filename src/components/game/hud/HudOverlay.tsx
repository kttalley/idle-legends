import React from 'react'
import { MinimapRadar } from './MinimapRadar'
import { UnitFrames } from './UnitFrames'
import { ActionBar } from './ActionBar'
import { StrikeMeter } from '../StrikeMeter'
import { CraftResultToast } from '../CraftResultToast'

// WoW/Diablo-style HUD shell: a click-through DOM overlay painted on top of the
// dimetric world canvas (text/tooltips stay crisp; the canvas renders only the world).
//
// Now that the world is full-bleed and the side panels float ON it, the HUD insets by
// `--rail-l` / `--rail-r` (index.css) rather than hugging the viewport edges — otherwise
// the unit frames and minimap sit underneath the glass columns. Those vars collapse to a
// few pixels when a column is folded away or on mobile, so the HUD reclaims the space.
// Each panel re-enables pointer-events for its own interactive bits.
export function HudOverlay() {
  return (
    <div className="hud-layer">
      <div className="hud-tl"><UnitFrames /></div>
      <div className="hud-tr"><MinimapRadar /></div>
      {/* Craft reveal — under the minimap, out of the world's centre. Self-dismissing. */}
      <div className="hud-tr" style={{ marginTop: 150, display: 'flex', justifyContent: 'flex-end' }}>
        <CraftResultToast />
      </div>
      {/* Strike meter — floats just above the action bar, on the world rather than in a
          separate screen. Renders nothing outside gathering mode. */}
      <div className="hud-strike"><StrikeMeter /></div>
      {/* Bottom dock. Inset by the rails so it never slides under a glass column. */}
      <div className="hud-bottom"><ActionBar /></div>
    </div>
  )
}
