import React from 'react'
import { MinimapRadar } from './MinimapRadar'
import { UnitFrames } from './UnitFrames'
import { ActionBar } from './ActionBar'

// WoW/Diablo-style HUD shell: a click-through DOM overlay painted on top of the
// dimetric world canvas (text/tooltips stay crisp; the canvas renders only the world).
// Positioned absolute inset:0 within the scene wrapper, so on mobile it docks above the
// FAB bar automatically (the app-root reserves that space). Each panel re-enables
// pointer-events for its own interactive bits.
export function HudOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      <div style={{ position: 'absolute', top: 8, left: 8 }}>
        <UnitFrames />
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8 }}>
        <MinimapRadar />
      </div>
      {/* Bottom dock, flush to the canvas edge and full-bleed: the XP strip is the last
          row of the viewport (WoW-style) rather than a floating panel with world showing
          under it, so the action bar eats the least world possible. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <ActionBar />
      </div>
    </div>
  )
}
