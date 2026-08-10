import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../../store/gameStore'
import { useDismissable } from '../ui/useDismissable'
import { HeroAvatar } from '../sprites/HeroAvatar'
import { COLORWAYS, isColorwayUnlocked, FOUNDER_ENTITLEMENT } from '../../render/colorways'
import {
  subscribePurchases, buyFounderPack, restorePurchases,
  type PurchaseState,
} from '../../monetization/purchases'

// The wardrobe IS the paywall. PLAN.md Track M: the renderer is the merchandising
// surface, so every tile below is a live HeroAvatar rendering YOUR hero — same rig, same
// race, same class — in that colorway. Nothing is described in words that the player
// cannot already see, which is also what keeps this clear of loot-box rules: you are
// buying a named thing you are looking at.

export function WardrobePanel({ onClose }: { onClose: () => void }) {
  const playerClass = useGameStore(s => s.playerClass)
  const race        = useGameStore(s => s.playerRace)
  const faction     = useGameStore(s => s.playerFaction)
  const name        = useGameStore(s => s.playerName)
  const equipped    = useGameStore(s => s.colorway)
  const setColorway = useGameStore(s => s.setColorway)

  const [iap, setIap] = useState<PurchaseState | null>(null)
  useEffect(() => subscribePurchases(setIap), [])
  const surface = useRef<HTMLDivElement>(null)
  useDismissable(true, onClose, { ref: surface, closeOnOutside: true, trapFocus: true })
  const active = iap?.active ?? new Set<string>()
  const owned = active.has(FOUNDER_ENTITLEMENT)

  // Portalled to <body>. The mobile HERO drawer animates with `transform`, and a
  // transformed ancestor becomes the containing block for `position: fixed` descendants —
  // so rendered in place this modal was clipped to the drawer's ~75% column instead of
  // covering the screen.
  return createPortal(
    <div
      // Stable hook for tools/uitest — matching on the visible "Wardrobe" string would
      // couple the suite to copy, and it also matched the Looks button's tooltip.
      data-surface="wardrobe"
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + var(--safe-t)) 16px calc(16px + var(--safe-b))',
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-label="Wardrobe"
        className="rp-glass"
        style={{
          width: 'min(420px, 94vw)', maxHeight: '100%', overflowY: 'auto',
          borderRadius: 12, padding: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--gold)' }}>Wardrobe</span>
          <button className="rp-button" onClick={onClose} style={{ padding: '8px 12px', minHeight: 34 }}>Close</button>
        </div>

        <p style={{ fontSize: '0.62rem', color: '#9a9086', margin: '0 0 12px', lineHeight: 1.5 }}>
          Colourways change how your hero is dyed — nothing else. They grant no stats, no
          speed and no drops.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: 10 }}>
          {COLORWAYS.map(cw => {
            const unlocked = isColorwayUnlocked(cw.id, active)
            const isOn = equipped === cw.id
            return (
              <button
                key={cw.id}
                // Equipping is what the wardrobe is FOR, so it also ends the visit — the
                // hero you just re-dyed is behind this overlay, and leaving it up hides
                // the only thing worth looking at. Re-tapping what is already equipped is
                // not a change, so it does not count as finishing.
                onClick={() => { if (unlocked && !isOn) { setColorway(cw.id); onClose() } }}
                disabled={!unlocked}
                title={unlocked ? cw.blurb : 'Included in the Founder Pack'}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: 8, borderRadius: 9, cursor: unlocked ? 'pointer' : 'default',
                  background: isOn ? 'rgba(255,215,0,0.10)' : 'rgba(0,0,0,0.30)',
                  border: `1px solid ${isOn ? 'var(--gold)' : '#3a352c'}`,
                  // Locked tiles stay legible rather than being greyed into mush — the
                  // player is meant to want the thing they cannot equip yet.
                  opacity: unlocked ? 1 : 0.82,
                  position: 'relative',
                }}
              >
                <HeroAvatar
                  race={race} playerClass={playerClass} name={name} faction={faction}
                  colorway={cw.id} size={72} animate={isOn} circle={false}
                />
                <span style={{ fontSize: '0.6rem', color: isOn ? 'var(--gold)' : '#c8b890', textAlign: 'center', lineHeight: 1.25 }}>
                  {cw.name}
                </span>
                {!unlocked && (
                  <span style={{ fontSize: '0.5rem', color: '#8a7a58', letterSpacing: '0.05em' }}>🔒 FOUNDER</span>
                )}
                {isOn && (
                  <span style={{ fontSize: '0.5rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>EQUIPPED</span>
                )}
              </button>
            )
          })}
        </div>

        {!owned && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 9, border: '1px solid var(--edge-strong)', background: 'rgba(30,22,8,0.6)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', color: 'var(--gold)', marginBottom: 4 }}>
              Founder Pack
            </div>
            <p style={{ fontSize: '0.62rem', color: '#c8b890', margin: '0 0 10px', lineHeight: 1.5 }}>
              Three colourways, and the founder mark on your hero. Bought once, kept
              forever — and when the hand-drawn art lands, founder items upgrade with it.
            </p>
            <button
              className="rp-button"
              onClick={() => { void buyFounderPack() }}
              disabled={iap?.busy}
              style={{ width: '100%', padding: '11px 12px', minHeight: 44, fontSize: '0.72rem' }}
            >
              {iap?.busy ? 'Working…' : `Unlock${iap?.founderPrice ? ` — ${iap.founderPrice}` : ''}`}
            </button>
          </div>
        )}

        {/* Apple 3.1.x requires Restore to exist and to be reachable WITHOUT buying
            first — a player reinstalling has nothing to purchase and must still be able
            to get their entitlement back. */}
        <button
          onClick={() => { void restorePurchases() }}
          disabled={iap?.busy}
          style={{
            width: '100%', marginTop: 10, padding: '10px', minHeight: 40,
            background: 'none', border: '1px solid #3a352c', borderRadius: 8,
            color: '#9a9086', fontSize: '0.62rem', cursor: 'pointer',
          }}
        >
          Restore Purchases
        </button>

        {iap?.error && (
          <p style={{ fontSize: '0.6rem', color: '#ff9a8a', margin: '8px 0 0', textAlign: 'center' }}>{iap.error}</p>
        )}
      </div>
    </div>,
    document.body,
  )
}
