import React, { useEffect } from 'react'
import { useGameStore, rarityColor } from '../../store/gameStore'
import { QUALITY_LABEL } from '../../engine/crafting'

// ── The craft result moment ───────────────────────────────────────────────────
// Crafting used to complete in silence — the single biggest reason it read as a
// non-interaction. Every craft (including auto-craft, which is how an idle player
// crafts) now announces itself with a rarity-tinted reveal.
//
// It auto-expires and is click-through-dismissible: an idle player must never come back
// to a modal blocking their game.

const DISMISS_MS = 6500

export function CraftResultToast() {
  const result = useGameStore(s => s.lastCraft)
  const dismiss = useGameStore(s => s.dismissCraftResult)

  useEffect(() => {
    if (!result) return
    const t = setTimeout(dismiss, DISMISS_MS)
    return () => clearTimeout(t)
  }, [result?.id, dismiss]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) return null

  const color = rarityColor(result.rarity)

  return (
    <div
      onClick={dismiss}
      style={{
        pointerEvents: 'auto',
        cursor: 'pointer',
        minWidth: 200,
        maxWidth: 'min(300px, 84vw)',
        background: 'linear-gradient(180deg, rgba(20,18,26,0.95), rgba(10,9,14,0.95))',
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: '8px 10px',
        boxShadow: `0 0 16px ${color}44`,
        animation: 'il-craft-in 260ms ease-out',
      }}
    >
      <style>{`
        @keyframes il-craft-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
      <div style={{ fontSize: '0.68rem', color: '#8a8578', textTransform: 'uppercase', letterSpacing: 1 }}>
        {result.kind === 'gear' ? 'Crafted equipment' : 'Crafted'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
        <span style={{ fontSize: '1.05rem' }}>{result.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', color, fontWeight: 700, lineHeight: 1.15 }}>
            {result.name}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9a9488' }}>
            {QUALITY_LABEL[result.quality]} · {result.rarity}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--parchment)', marginTop: 4 }}>
        {result.detail}
      </div>
      {result.kind === 'gear' && (
        <div style={{ fontSize: '0.68rem', color: '#6a655c', marginTop: 3 }}>
          In your bags — equip it to wear the colours.
        </div>
      )}
    </div>
  )
}
