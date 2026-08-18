import React, { useEffect } from 'react'
import { useGameStore, rarityColor } from '../../store/gameStore'
import { CLASS_PROFESSIONS, RECIPES } from '../../data/professions'
import { SpriteIcon } from '../ui/SpriteIcon'
import {
  QUALITY_LABEL, QUALITY_RARITY, TEMPER_STRIKES, TEMPER_THRESHOLD, temperedQuality,
} from '../../engine/crafting'

// ── The forge's half of the strike meter ──────────────────────────────────────
//
// Gathering rewards a present player with quality; crafting rewarded them with nothing at
// all — the tier came wholesale from the materials, so the forge was a vending machine and
// the player's only input was having walked somewhere earlier.
//
// This is the missing beat, and it is deliberately the SAME beat: same sweeping cursor,
// same band with a perfect core, same tap-or-press-E gesture as `StrikeMeter`. Two
// professions, one thing to learn. What differs is the payout — gathering accumulates
// purity across many harvests, while a temper is a single yes/no per craft: bank enough
// heat and the piece comes out a tier above its materials.
//
// Upside only, and that is a design rule rather than an oversight. An idle player who
// never opens the panel must land exactly where they always did; the temper can lift a
// craft and can never spoil one.

const RESULT_TEXT: Record<string, string> = { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' }
const RESULT_COLOR: Record<string, string> = {
  perfect: 'var(--gold)', good: 'var(--success)', miss: 'var(--danger)',
}

export function TemperMeter() {
  const session = useGameStore(s => s.temperSession)
  const gameMode = useGameStore(s => s.gameMode)
  const playerClass = useGameStore(s => s.playerClass)
  const craftQuality = useGameStore(s => s.craftQuality)
  const temperCraft = useGameStore(s => s.temperCraft)

  // Same key as the gathering meter. `E` is unclaimed by the scene controller (it reads
  // WASD/arrows and Space), so this cannot fight movement.
  useEffect(() => {
    if (gameMode !== 'crafting') return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); temperCraft() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameMode, temperCraft])

  if (gameMode !== 'crafting' || !session) return null

  const prof = CLASS_PROFESSIONS[playerClass]
  const recipe = RECIPES.find(r => r.id === session.recipeId)
  const base = craftQuality ?? 'coarse'
  const landing = temperedQuality(base, session.heat)
  const lifted = landing !== base
  const qColor = rarityColor(QUALITY_RARITY[landing])

  const bandLeft = Math.max(0, session.bandCenter - session.bandHalfWidth) * 100
  const bandWidth = Math.min(1, session.bandHalfWidth * 2) * 100
  const perfectHalf = session.bandHalfWidth * 0.35
  const perfectLeft = Math.max(0, session.bandCenter - perfectHalf) * 100
  const perfectWidth = perfectHalf * 2 * 100

  const spent = session.strikesLeft <= 0
  const flashAge = Date.now() - session.lastResultAt
  const showFlash = session.lastResult && flashAge < 700

  return (
    <div style={{ width: '100%', marginTop: 6 }}>
      <div style={{
        background: 'rgba(8,8,14,0.82)',
        border: `1px solid ${lifted ? 'var(--gold-soft)' : '#3a3630'}`,
        borderRadius: 8,
        padding: '6px 8px 7px',
        boxShadow: lifted ? '0 0 12px rgba(200,168,100,0.25)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--parchment)' }}>
            <SpriteIcon emoji={prof.craftIcon} size={13} /> Temper{recipe ? ` — ${recipe.name}` : ''}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: qColor, fontWeight: 700 }}>
            {QUALITY_LABEL[landing]}{lifted ? ' ↑' : ''}
          </span>
        </div>

        <div
          onPointerDown={e => { e.preventDefault(); temperCraft() }}
          title="Strike the piece (E)"
          style={{
            position: 'relative',
            height: 26,
            borderRadius: 4,
            background: 'linear-gradient(180deg, #1a1210, #100b08)',
            border: '1px solid #2e2a26',
            cursor: spent ? 'default' : 'pointer',
            overflow: 'hidden',
            opacity: spent ? 0.45 : 1,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* Heat band, warm rather than the vein's green — a forge, not a seam of ore. */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${bandLeft}%`, width: `${bandWidth}%`,
            background: 'rgba(255,140,40,0.18)',
            borderLeft: '1px solid rgba(255,140,40,0.5)',
            borderRight: '1px solid rgba(255,140,40,0.5)',
          }} />
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${perfectLeft}%`, width: `${perfectWidth}%`,
            background: 'rgba(255,215,0,0.32)',
          }} />
          <div style={{
            position: 'absolute', top: 2, bottom: 2,
            left: `calc(${session.cursor * 100}% - 1.5px)`,
            width: 3,
            background: '#ffffff',
            boxShadow: '0 0 6px #fff',
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
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {/* Strikes left, as pips — the same vocabulary the gathering meter uses. */}
          <span style={{ fontSize: '0.55rem', letterSpacing: 2, color: 'var(--gold-soft)' }}>
            {'◆'.repeat(session.strikesLeft)}{'◇'.repeat(Math.max(0, TEMPER_STRIKES - session.strikesLeft))}
          </span>
          <span style={{ fontSize: '0.5rem', color: 'var(--muted)' }}>tap or press E</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.5rem', color: 'var(--muted)' }}>
            heat {session.heat}/{TEMPER_THRESHOLD}
          </span>
        </div>
      </div>
    </div>
  )
}
