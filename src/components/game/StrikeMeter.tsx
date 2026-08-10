import React, { useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { CLASS_PROFESSIONS, MATERIALS, ZONE_MATERIALS } from '../../data/professions'
import {
  GATHER_SECONDS, MAX_PURITY_PER_UNIT, QUALITY_LABEL, RICHNESS_COLOR, RICHNESS_LABEL,
  STRIKES_PER_HARVEST, purityToQuality, QUALITY_RARITY,
} from '../../engine/crafting'
import { rarityColor } from '../../store/gameStore'

// ── "Work the Vein" ───────────────────────────────────────────────────────────
// The optional half of gathering. It sits on the world as a HUD overlay (same shell as
// MinimapRadar / UnitFrames) rather than a separate screen, so engaging with a node never
// costs the player a context switch.
//
// It CANNOT gate anything: the component reads a session the store keeps alive on its own
// and its only outbound call is `strikeNode()`, which touches purity and nothing else.
// Ignore it entirely and the harvest lands on the same timer for the same amount.

const RESULT_COLOR: Record<string, string> = {
  perfect: 'var(--gold)', good: '#88cc66', miss: '#ff5544',
}
const RESULT_TEXT: Record<string, string> = {
  perfect: 'PERFECT', good: 'Good', miss: 'Miss',
}

export function StrikeMeter() {
  const gameMode = useGameStore(s => s.gameMode)
  const session = useGameStore(s => s.gatherSession)
  const gatheringTimer = useGameStore(s => s.gatheringTimer)
  const playerClass = useGameStore(s => s.playerClass)
  const currentZone = useGameStore(s => s.currentZone)
  const strikeNode = useGameStore(s => s.strikeNode)

  // Keyboard strike. `E` is unclaimed — the scene controller only consumes WASD/arrows
  // and Space, so this cannot fight movement or the jump.
  useEffect(() => {
    if (gameMode !== 'gathering') return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); strikeNode() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameMode, strikeNode])

  if (gameMode !== 'gathering' || !session) return null

  const prof = CLASS_PROFESSIONS[playerClass]
  const mat = MATERIALS[ZONE_MATERIALS[currentZone][playerClass]]
  const quality = purityToQuality(session.purity)
  const qColor = rarityColor(QUALITY_RARITY[quality])

  const bandLeft = Math.max(0, session.bandCenter - session.bandHalfWidth) * 100
  const bandWidth = Math.min(1, session.bandHalfWidth * 2) * 100
  const perfectHalf = session.bandHalfWidth * 0.35
  const perfectLeft = Math.max(0, session.bandCenter - perfectHalf) * 100
  const perfectWidth = perfectHalf * 2 * 100

  const spent = session.lockout > 0 || session.strikesLeft <= 0
  const flashAge = Date.now() - session.lastResultAt
  const showFlash = session.lastResult && flashAge < 700

  return (
    <div style={{ pointerEvents: 'auto', width: 'min(340px, 88vw)' }}>
      <div style={{
        background: 'rgba(8,8,14,0.82)',
        border: `1px solid ${session.richness === 2 ? 'var(--gold-soft)' : '#3a3630'}`,
        borderRadius: 8,
        padding: '6px 8px 7px',
        boxShadow: session.richness === 2 ? '0 0 12px rgba(200,168,100,0.25)' : 'none',
      }}>
        {/* Header: what vein, how rich, how good the current unit is turning out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--parchment)' }}>
            {prof.gatherIcon} {mat.icon} {mat.name}
          </span>
          <span style={{
            fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: 1,
            color: RICHNESS_COLOR[session.richness],
            border: `1px solid ${RICHNESS_COLOR[session.richness]}55`,
            borderRadius: 3, padding: '0 3px',
          }}>
            {RICHNESS_LABEL[session.richness]} vein
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: qColor, fontWeight: 700 }}>
            {QUALITY_LABEL[quality]}
          </span>
        </div>

        {/* The track. Tapping anywhere on it strikes — a 44px-tall hit area for touch. */}
        <div
          onPointerDown={e => { e.preventDefault(); strikeNode() }}
          title="Strike the vein (E)"
          style={{
            position: 'relative',
            height: 26,
            borderRadius: 4,
            background: 'linear-gradient(180deg, #14121a, #0b0a10)',
            border: '1px solid #2e2a26',
            cursor: spent ? 'default' : 'pointer',
            overflow: 'hidden',
            opacity: session.strikesLeft <= 0 ? 0.45 : 1,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* Good band */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${bandLeft}%`, width: `${bandWidth}%`,
            background: 'rgba(120,200,90,0.18)',
            borderLeft: '1px solid rgba(120,200,90,0.5)',
            borderRight: '1px solid rgba(120,200,90,0.5)',
          }} />
          {/* Perfect core */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${perfectLeft}%`, width: `${perfectWidth}%`,
            background: 'rgba(255,215,0,0.30)',
          }} />
          {/* Sweeping cursor */}
          <div style={{
            position: 'absolute', top: 2, bottom: 2,
            left: `calc(${session.cursor * 100}% - 1.5px)`,
            width: 3,
            background: session.lockout > 0 ? '#ff5544' : '#ffffff',
            boxShadow: `0 0 6px ${session.lockout > 0 ? '#ff5544' : '#fff'}`,
          }} />
          {/* Harvest progress — a thin underline so the idle cadence stays legible even
              while the meter is the loud element. */}
          <div style={{
            position: 'absolute', left: 0, bottom: 0, height: 2,
            width: `${(1 - gatheringTimer / GATHER_SECONDS) * 100}%`,
            background: '#5a7fb4',
          }} />
          {showFlash && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 800,
              color: RESULT_COLOR[session.lastResult!],
              textShadow: '0 1px 3px #000',
              opacity: 1 - flashAge / 700,
              pointerEvents: 'none',
            }}>
              {RESULT_TEXT[session.lastResult!]}
              {session.lastResult !== 'miss' && session.streak > 1 ? ` ×${session.streak}` : ''}
            </div>
          )}
        </div>

        {/* Strike budget + purity banked for the unit in progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: '0.55rem', color: '#8a8578', letterSpacing: 1 }}>
            {'◆'.repeat(session.strikesLeft)}
            {'◇'.repeat(Math.max(0, STRIKES_PER_HARVEST - session.strikesLeft))}
          </span>
          <span style={{ fontSize: '0.5rem', color: '#6a655c' }}>
            tap or press E
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.52rem', color: '#8a8578' }}>
            purity {session.purity.toFixed(1)}/{MAX_PURITY_PER_UNIT}
          </span>
        </div>
      </div>
    </div>
  )
}
